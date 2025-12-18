import * as vscode from 'vscode';
import * as path from 'path';
import {
  loadSettings,
  loadRuleSettings,
  loadPromptTemplate,
  getWorkspaceRoot,
  resolveWorkspacePath,
  selectRulesetsForFile,
  selectChaptersForFile
} from './config';
import { loadRules } from './ruleParser';
import {
  getLocalFileContent,
  getLocalFileDiff,
  getAllFilesDiff,
  getLocalFolderFiles,
  isDirectory,
  getGitHubFileContent,
  getGitHubDiff,
  getGitHubCompareDiff,
  getGitHubCommitDiff,
  determineSourceType,
  isGitHubUrl
} from './codeRetriever';
import { reviewCodeParallel, reviewMultipleFiles } from './parallelReviewer';
import {
  formatForChat,
  formatUnifiedReviewResults,
  saveUnifiedReviewResults
} from './outputFormatter';
import { ReviewRequest, CodeToReview, RuleChapter, Settings, RuleSettings } from './types';

const PARTICIPANT_ID = 'coding-rule-checker';
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  // Register chat participant
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, chatContext, stream, token) => {
    try {
      await handleChatRequest(request, chatContext, stream, token);
    } catch (error) {
      stream.markdown(`\n\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n\n`);
    }
  });

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');

  context.subscriptions.push(participant);
}

async function handleChatRequest(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  const command = request.command;

  if (!command) {
    stream.markdown('Please use one of the following commands:\n');
    stream.markdown('- `/review #file` - Review all code in the specified file\n');
    stream.markdown('- `/review #folder` - Review all code files in the specified folder\n');
    stream.markdown('- `/diff [range] #file` - Review diff code (optionally specify diff range)\n');
    return;
  }

  // Parse request first
  const reviewRequest = parseReviewRequest(request, command);

  // Get workspace root
  stream.markdown('📋 Loading settings...\n');
  let workspaceRoot = getWorkspaceRoot();
  const isWorkspaceOpen = workspaceRoot !== null;

  if (!workspaceRoot) {
    // No workspace open - use extension's parent directory (for debugging)
    workspaceRoot = path.dirname(extensionContext.extensionPath);
    stream.markdown('ℹ️ No workspace open - using project settings for debugging\n');
    stream.markdown('ℹ️ File output is disabled\n');
  }

  // Load settings
  const settings = await loadSettings(workspaceRoot);

  // Get language model
  let models: vscode.LanguageModelChat[];
  if (settings.model) {
    // Use the specified model from settings
    models = await vscode.lm.selectChatModels({ family: settings.model });
    if (models.length === 0) {
      // List all available models for debugging
      const allModels = await vscode.lm.selectChatModels();
      const availableModels = allModels.map(m => `${m.family} (${m.name})`).join(', ');
      throw new Error(
        `No language model found for: ${settings.model}\n\n` +
        `Available models: ${availableModels || 'None'}\n\n` +
        `Please update the "model" field in .vscode/coding-rule-checker/settings.json to use one of the available model families.`
      );
    }
  } else {
    // No model specified in settings - use the currently selected model in Copilot Chat
    models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
      throw new Error(
        `No language model available.\n\n` +
        `Please ensure GitHub Copilot is properly configured.`
      );
    }
    stream.markdown(`ℹ️ No model specified in settings - using currently selected Copilot model\n`);
  }
  const model = models[0];
  stream.markdown(`🤖 Using model: ${model.name} (${model.family})\n`);

  // Load system prompt
  const systemPrompt = await loadPromptTemplate(workspaceRoot, settings.systemPromptPath);

  // Get code to review
  stream.markdown('📥 Retrieving code...\n');
  const codesToReview = await getCodeToReview(reviewRequest, workspaceRoot);

  if (codesToReview.length === 0) {
    stream.markdown('⚠️ No code to review\n');
    return;
  }

  // Process each code file
  for (const code of codesToReview) {
    const fileLink = `[${code.fileName}](file:///${code.filePath.replace(/\\/g, '/')})`;
    stream.markdown(`\n🔍 Reviewing ${fileLink}...\n`);

    // Determine which rulesets to apply based on file pattern matching
    const rulesetNames = selectRulesetsForFile(
      code.filePath,
      code.fileName,
      settings,
      workspaceRoot
    );

    stream.markdown(`📝 File: ${fileLink}\n`);

    if (rulesetNames.length === 0) {
      stream.markdown(`⚠️ No rulesets configured for this file\n`);
      continue;
    }

    stream.markdown(`📚 Applying rulesets: ${rulesetNames.join(', ')}\n`);

    // Accumulate results from all rulesets
    const allResults = [];

    // Review with each ruleset
    for (const rulesetName of rulesetNames) {
      stream.markdown(`\n📖 Processing ruleset: ${rulesetName}...\n`);

      // Load ruleset settings
      const ruleSettings = await loadRuleSettings(workspaceRoot, rulesetName);

      // Load rules
      const rulesPath = resolveWorkspacePath(workspaceRoot, ruleSettings.rulesPath);

      // Determine the exclude file name if commonInstructionsPath is specified
      let excludeFileName: string | undefined;
      if (ruleSettings.commonInstructionsPath) {
        const commonInstructionsFullPath = resolveWorkspacePath(workspaceRoot, ruleSettings.commonInstructionsPath);
        excludeFileName = path.basename(commonInstructionsFullPath);
      }

      const allChapters = await loadRules(rulesPath, excludeFileName);

      stream.markdown(`📚 Loaded ${allChapters.length} chapters from: ${rulesPath}\n`);

      // Filter chapters based on file patterns
      const allChapterIds = allChapters.map(ch => ch.id);
      const selectedChapterIds = selectChaptersForFile(
        code.filePath,
        code.fileName,
        ruleSettings,
        workspaceRoot,
        allChapterIds
      );

      let chaptersToReview = allChapters;
      if (selectedChapterIds !== null) {
        chaptersToReview = allChapters.filter(ch => selectedChapterIds.includes(ch.id));
        stream.markdown(`🔍 Selected chapters: ${selectedChapterIds.join(', ')} (${chaptersToReview.length}/${allChapters.length})\n`);
      } else {
        stream.markdown(`🔍 Reviewing all ${chaptersToReview.length} chapters\n`);
      }

      if (chaptersToReview.length === 0) {
        stream.markdown(`⚠️ No chapters selected for review\n`);
        continue;
      }

      // Load prompts
      const reviewPromptPath = ruleSettings.reviewPromptPath ||
        path.join('.vscode', 'coding-rule-checker', 'review-prompt.md');
      const falsePositivePromptPath = ruleSettings.falsePositivePromptPath ||
        path.join('.vscode', 'coding-rule-checker', 'false-positive-prompt.md');

      const reviewPrompt = await loadPromptTemplate(workspaceRoot, reviewPromptPath);
      const falsePositivePrompt = await loadPromptTemplate(workspaceRoot, falsePositivePromptPath);

      // Load common instructions if specified
      let commonInstructions = '';
      if (ruleSettings.commonInstructionsPath) {
        try {
          commonInstructions = await loadPromptTemplate(workspaceRoot, ruleSettings.commonInstructionsPath);
          stream.markdown(`📖 Loaded common instructions from: ${ruleSettings.commonInstructionsPath}\n`);
        } catch (error) {
          stream.markdown(`⚠️ Failed to load common instructions: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }

      // Perform review
      const result = await reviewCodeParallel(
        code,
        chaptersToReview,
        ruleSettings,
        rulesetName,
        systemPrompt,
        reviewPrompt,
        falsePositivePrompt,
        commonInstructions,
        model,
        (progress) => {
          stream.progress(progress.message);
        }
      );

      allResults.push(result);
      stream.markdown(`✓ Completed ruleset: ${rulesetName}\n`);
    }

    // Output unified results to chat
    if (allResults.length > 0) {
      stream.markdown('\n\n## 📊 Review Results\n\n');

      for (const result of allResults) {
        stream.markdown(`### ${result.rulesetName}\n`);
        stream.markdown(formatForChat(result));
      }

      // Calculate totals
      const totalIssuesAll = allResults.reduce((sum, r) => sum + r.totalIssues, 0);
      stream.markdown(`\n**Total issues found: ${totalIssuesAll}**\n`);

      // Load template
      const template = await loadPromptTemplate(workspaceRoot, settings.templatesPath);

      // Save unified results to file if enabled and workspace is open
      if (isWorkspaceOpen && settings.fileOutput.enabled) {
        try {
          console.log('Attempting to save unified review results...');
          const outputPath = await saveUnifiedReviewResults(allResults, settings, workspaceRoot, template);
          console.log('Review results saved successfully to:', outputPath);
          const fileName = path.basename(outputPath);
          const fileLink = `[${fileName}](file:///${outputPath.replace(/\\/g, '/')})`;
          stream.markdown(`\n💾 Review results saved to: ${fileLink}\n`);
        } catch (error) {
          console.error('Failed to save review results:', error);
          stream.markdown(`\n⚠️ Failed to save review results: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      } else {
        if (!isWorkspaceOpen) {
          console.log('File output skipped: No workspace open');
        } else if (!settings.fileOutput.enabled) {
          console.log('File output skipped: Disabled in settings');
        }
      }

      // Show detailed results
      stream.markdown('\n---\n\n## 📋 Detailed Results\n\n');
      stream.markdown(formatUnifiedReviewResults(allResults, template));
    }
  }

  stream.markdown('\n\n✅ Review completed!\n');
}

function parseReviewRequest(request: vscode.ChatRequest, command: string): ReviewRequest {
  const text = request.prompt;
  const parts = text.split(/\s+/);

  let filesOrUrls: string[] = [];
  let diffRange: string | undefined;

  console.log('[parseReviewRequest] ===== Parsing request =====');
  console.log('[parseReviewRequest] Prompt text:', text);
  console.log('[parseReviewRequest] Command:', command);
  console.log('[parseReviewRequest] References count:', request.references.length);
  console.log('[parseReviewRequest] Full request.references:', JSON.stringify(request.references, null, 2));

  // Get workspace root for resolving relative paths
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';

  // Priority 1: Check for GitHub URLs in prompt text (highest priority)
  const urlMatches = text.match(/https?:\/\/github\.com\/[^\s]+/g);
  if (urlMatches && urlMatches.length > 0) {
    filesOrUrls.push(...urlMatches);
    console.log('[parseReviewRequest] Found GitHub URLs in text:', filesOrUrls);

    // Check if the first URL is a compare or commit URL (for backward compatibility)
    const firstUrl = filesOrUrls[0];

    // Check if it's a compare URL
    const compareMatch = firstUrl.match(/github\.com\/([^/]+)\/([^/]+)\/compare\/(.+)/);
    if (compareMatch) {
      console.log('[parseReviewRequest] Detected compare URL');
      const [, owner, repo, compareRange] = compareMatch;

      // Store the base repo URL and the comparison range
      filesOrUrls[0] = `https://github.com/${owner}/${repo}`;
      diffRange = compareRange;
      console.log('[parseReviewRequest] Extracted repo URL:', filesOrUrls[0]);
      console.log('[parseReviewRequest] Extracted compare range:', diffRange);

      // Extract optional file names from the rest of the text
      const urlIndex = text.indexOf(urlMatches[0]);
      const afterUrl = text.substring(urlIndex + urlMatches[0].length).trim();

      // Look for multiple file paths (something with slashes and ending with an extension)
      const filePathMatches = afterUrl.match(/[^\s]+\.\w+/g);
      if (filePathMatches && filePathMatches.length > 0) {
        console.log('[parseReviewRequest] Target file paths:', filePathMatches);
        // Store the file paths for filtering
        diffRange = `${compareRange}:FILE:${filePathMatches.join(',')}`;
      }
    }
    // Check if it's a commit URL
    else {
      const commitMatch = firstUrl.match(/github\.com\/[^/]+\/[^/]+\/commit\/[a-f0-9]+/);
      if (commitMatch) {
        console.log('[parseReviewRequest] Detected commit URL');

        // Extract optional file names from the rest of the text
        const urlIndex = text.indexOf(firstUrl);
        const afterUrl = text.substring(urlIndex + firstUrl.length).trim();

        // Look for multiple file names (something ending with an extension)
        const fileNameMatches = afterUrl.match(/[^\s]+\.\w+/g);
        if (fileNameMatches && fileNameMatches.length > 0) {
          console.log('[parseReviewRequest] Target file names:', fileNameMatches);
          // Store the file names in diffRange temporarily (we'll handle this specially)
          diffRange = `FILE:${fileNameMatches.join(',')}`;
        }
      }
    }
  }

  // Priority 2: Parse custom #file:path and #folder:path syntax
  if (filesOrUrls.length === 0) {
    console.log('[parseReviewRequest] Checking for #file: or #folder: syntax...');

    // Match #file:path or #folder:path patterns
    const fileMatches = text.match(/#file:([^\s]+)/g);
    const folderMatches = text.match(/#folder:([^\s]+)/g);

    if (fileMatches && fileMatches.length > 0) {
      for (const match of fileMatches) {
        const filePath = match.replace('#file:', '');
        // Store the original path for later resolution
        // We'll resolve paths asynchronously in getCodeToReview
        filesOrUrls.push(`#file:${filePath}`);
        console.log('[parseReviewRequest] ✓ Found #file: pattern:', filePath);
      }
    }

    if (folderMatches && folderMatches.length > 0) {
      for (const match of folderMatches) {
        const folderPath = match.replace('#folder:', '');
        // Store the original path for later resolution
        filesOrUrls.push(`#folder:${folderPath}`);
        console.log('[parseReviewRequest] ✓ Found #folder: pattern:', folderPath);
      }
    }

    console.log('[parseReviewRequest] Total files found from #file:/#folder: syntax:', filesOrUrls.length);
  }

  // Priority 3: Extract all VSCode standard file references (#file and #folder)
  if (filesOrUrls.length === 0) {
    console.log('[parseReviewRequest] Checking VSCode references for #file or #folder...');
    for (let i = 0; i < request.references.length; i++) {
      const ref = request.references[i];
      console.log(`[parseReviewRequest] Reference[${i}]:`, JSON.stringify(ref, null, 2));
      console.log(`[parseReviewRequest] Reference[${i}] id:`, ref.id);
      console.log(`[parseReviewRequest] Reference[${i}] value type:`, typeof ref.value);

      if (ref.value && typeof ref.value === 'object') {
        console.log(`[parseReviewRequest] Reference[${i}] value keys:`, Object.keys(ref.value));
        if ('uri' in ref.value) {
          const filePath = (ref.value as any).uri.fsPath;
          filesOrUrls.push(filePath);
          console.log(`[parseReviewRequest] ✓ Found file reference: ${filePath}`);
        } else {
          console.log(`[parseReviewRequest] ⚠️ Reference value has no 'uri' property`);
        }
      } else {
        console.log(`[parseReviewRequest] ⚠️ Reference value is not an object:`, ref.value);
      }
    }
    console.log('[parseReviewRequest] Total files found from VSCode references:', filesOrUrls.length);
  }

  // Priority 4: Fall back to active editor (lowest priority)
  // Only for /review command - /diff without files should review all changed files
  if (filesOrUrls.length === 0 && command === 'review' && vscode.window.activeTextEditor) {
    filesOrUrls.push(vscode.window.activeTextEditor.document.uri.fsPath);
    console.log('[parseReviewRequest] Using active editor file:', filesOrUrls[0]);
  }

  if (filesOrUrls.length === 0 && command === 'review') {
    console.log('[parseReviewRequest] ⚠️ WARNING: No file reference found!');
  } else if (filesOrUrls.length === 0 && command === 'diff') {
    console.log('[parseReviewRequest] ℹ️ No files specified - will review all changed files');
  } else {
    console.log('[parseReviewRequest] ✓ Total files to review:', filesOrUrls.length);
    console.log('[parseReviewRequest] Files list:', filesOrUrls);
  }

  // Parse diff range if present (only if not already set by URL parsing)
  if (command === 'diff' && !diffRange) {
    // Look for patterns like "main..feature", tags "v1.0.0..v2.0.0", relative refs "HEAD^..main", etc.
    // Supports: branches, tags, commit hashes, relative refs (HEAD^, HEAD~3, @~2, HEAD@{yesterday})
    const rangeMatch = text.match(/([\w.\/~^@{}\-]+\.\.+[\w.\/~^@{}\-]+)/);
    if (rangeMatch) {
      diffRange = rangeMatch[1];
      console.log('[parseReviewRequest] Found diff range:', diffRange);
    }
  }

  const sourceType = filesOrUrls.length > 0 ? determineSourceType(filesOrUrls[0]) : 'local';
  const reviewType = command === 'review' ? 'all' : 'diff';

  return {
    sourceType,
    filesOrUrls,
    reviewType,
    diffRange
  };
}

/**
 * Resolves a file or folder path from #file: or #folder: prefix
 * @param pathSpec - The path specification (e.g., "#file:codeRetriever.ts")
 * @param workspaceRoot - The workspace root directory
 * @returns Resolved absolute path
 */
async function resolvePathSpec(pathSpec: string, workspaceRoot: string): Promise<string> {
  const isFile = pathSpec.startsWith('#file:');
  const isFolder = pathSpec.startsWith('#folder:');

  if (!isFile && !isFolder) {
    return pathSpec; // Return as-is if no prefix
  }

  const originalPath = pathSpec.replace(/^#(file|folder):/, '');
  console.log(`[resolvePathSpec] Resolving ${isFile ? 'file' : 'folder'}: ${originalPath}`);

  // If absolute path, use as-is
  if (path.isAbsolute(originalPath)) {
    console.log(`[resolvePathSpec] ✓ Using absolute path: ${originalPath}`);
    return originalPath;
  }

  // Try as relative path from workspace root
  const workspaceRelativePath = path.join(workspaceRoot, originalPath);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(workspaceRelativePath));
    console.log(`[resolvePathSpec] ✓ Found at workspace root: ${workspaceRelativePath}`);
    return workspaceRelativePath;
  } catch {
    // File not found at workspace root
  }

  // If it's just a filename (no path separators), search workspace
  if (!originalPath.includes('/') && !originalPath.includes('\\')) {
    console.log(`[resolvePathSpec] Searching workspace for filename: ${originalPath}`);
    const pattern = isFile ? `**/${originalPath}` : originalPath;
    const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**}';

    const foundUris = await vscode.workspace.findFiles(pattern, excludePattern, 10);

    if (foundUris.length === 0) {
      throw new Error(`File not found: ${originalPath}. Please specify the full path (e.g., #file:extension/src/${originalPath})`);
    }

    if (foundUris.length === 1) {
      console.log(`[resolvePathSpec] ✓ Found unique match: ${foundUris[0].fsPath}`);
      return foundUris[0].fsPath;
    }

    // Multiple matches - use the first one and warn
    console.log(`[resolvePathSpec] ⚠️ Multiple matches found for ${originalPath}, using: ${foundUris[0].fsPath}`);
    console.log(`[resolvePathSpec] Other matches:`, foundUris.slice(1).map(uri => uri.fsPath));
    return foundUris[0].fsPath;
  }

  // Path not found
  throw new Error(`File or folder not found: ${originalPath}. Tried workspace-relative path: ${workspaceRelativePath}`);
}

async function getCodeToReview(request: ReviewRequest, workspaceRoot: string): Promise<CodeToReview[]> {
  const codes: CodeToReview[] = [];

  console.log('[getCodeToReview] Request:', {
    sourceType: request.sourceType,
    filesOrUrls: request.filesOrUrls,
    reviewType: request.reviewType,
    diffRange: request.diffRange
  });

  // Resolve #file: and #folder: paths
  const resolvedFilesOrUrls: string[] = [];
  for (const fileOrUrl of request.filesOrUrls) {
    if (fileOrUrl.startsWith('#file:') || fileOrUrl.startsWith('#folder:')) {
      const resolved = await resolvePathSpec(fileOrUrl, workspaceRoot);
      resolvedFilesOrUrls.push(resolved);
    } else {
      resolvedFilesOrUrls.push(fileOrUrl);
    }
  }
  request.filesOrUrls = resolvedFilesOrUrls;
  console.log('[getCodeToReview] Resolved paths:', request.filesOrUrls);

  if (request.sourceType === 'github') {
    const firstUrl = request.filesOrUrls[0];

    // Check if it's a commit URL
    const isCommitUrl = firstUrl.match(/github\.com\/[^/]+\/[^/]+\/commit\/[a-f0-9]+/);
    // Check if it's a compare URL
    const isCompareUrl = firstUrl.match(/github\.com\/[^/]+\/[^/]+\/compare\//);

    if (isCommitUrl) {
      console.log('[getCodeToReview] Processing GitHub commit URL...');

      // Extract target file names if specified
      let targetFileNames: string[] | undefined;
      if (request.diffRange?.startsWith('FILE:')) {
        const fileNamesStr = request.diffRange.substring(5);
        targetFileNames = fileNamesStr.split(',').map(name => name.trim());
        console.log('[getCodeToReview] Filtering for files:', targetFileNames);
      }

      const commitCodes = await getGitHubCommitDiff(firstUrl, targetFileNames);
      codes.push(...commitCodes);
      console.log('[getCodeToReview] Loaded', commitCodes.length, 'file(s) from commit');
    } else if (isCompareUrl) {
      console.log('[getCodeToReview] Processing GitHub diff/compare...');
      if (!request.diffRange) {
        throw new Error('Diff range is required for GitHub diff review');
      }

      // Check if diffRange contains file filter (format: "range:FILE:filepath1,filepath2")
      let compareRange = request.diffRange;
      let targetFilePaths: string[] | undefined;

      if (request.diffRange.includes(':FILE:')) {
        const parts = request.diffRange.split(':FILE:');
        compareRange = parts[0];
        const filePathsStr = parts[1];
        targetFilePaths = filePathsStr.split(',').map(path => path.trim());
        console.log('[getCodeToReview] Compare range:', compareRange);
        console.log('[getCodeToReview] Target file paths:', targetFilePaths);

        // Use getGitHubCompareDiff for file filtering
        const compareCodes = await getGitHubCompareDiff(firstUrl, compareRange, targetFilePaths);
        codes.push(...compareCodes);
        console.log('[getCodeToReview] Loaded', compareCodes.length, 'file(s) from comparison');
      } else {
        // Use original getGitHubDiff for backward compatibility
        const code = await getGitHubDiff(firstUrl, request.diffRange);
        codes.push(code);
      }
    } else if (request.reviewType === 'all') {
      console.log('[getCodeToReview] Processing GitHub file URL(s)...');

      // Process multiple GitHub file URLs in parallel
      const filePromises = request.filesOrUrls.map(async (fileOrUrl) => {
        console.log('[getCodeToReview] Loading file from:', fileOrUrl);
        const code = await getGitHubFileContent(fileOrUrl);
        console.log('[getCodeToReview] File loaded successfully');
        return code;
      });

      const fileResults = await Promise.all(filePromises);
      codes.push(...fileResults);
      console.log('[getCodeToReview] Loaded', fileResults.length, 'file(s) from GitHub');
    }
  } else {
    // Local files or folders
    console.log('[getCodeToReview] Processing local file/folder...');
    if (request.reviewType === 'all') {
      console.log('[getCodeToReview] Review type: all');

      // Process each file/folder in the list in parallel
      const filePromises = request.filesOrUrls.map(async (fileOrUrl) => {
        // Check if it's a directory or file
        const isDir = await isDirectory(fileOrUrl);

        if (isDir) {
          console.log('[getCodeToReview] Loading folder contents:', fileOrUrl);
          const folderCodes = await getLocalFolderFiles(fileOrUrl);
          console.log('[getCodeToReview] Loaded', folderCodes.length, 'files from folder');
          return folderCodes;
        } else {
          console.log('[getCodeToReview] Loading file content:', fileOrUrl);
          const code = await getLocalFileContent(fileOrUrl);
          console.log('[getCodeToReview] File loaded successfully');
          return [code];
        }
      });

      const filesResults = await Promise.all(filePromises);
      for (const result of filesResults) {
        codes.push(...result);
      }

      if (request.filesOrUrls.length === 0) {
        console.log('[getCodeToReview] ERROR: No file/folder specified for reviewAll');
      }
    } else {
      console.log('[getCodeToReview] Review type: diff');
      // Diff mode
      if (request.filesOrUrls.length > 0) {
        // Process each file in diff mode in parallel
        const diffPromises = request.filesOrUrls.map(async (fileOrUrl) => {
          console.log('[getCodeToReview] Loading file diff:', fileOrUrl);
          const code = await getLocalFileDiff(workspaceRoot, fileOrUrl, request.diffRange);
          console.log('[getCodeToReview] Diff loaded successfully');
          return code;
        });

        const diffResults = await Promise.all(diffPromises);
        codes.push(...diffResults);
      } else {
        console.log('[getCodeToReview] Loading all changed files...');
        // Review all changed files
        const allCodes = await getAllFilesDiff(workspaceRoot, request.diffRange);
        codes.push(...allCodes);
        console.log('[getCodeToReview] Loaded', allCodes.length, 'changed files');
      }
    }
  }

  console.log('[getCodeToReview] Total codes to review:', codes.length);
  return codes;
}

export function deactivate() {}
