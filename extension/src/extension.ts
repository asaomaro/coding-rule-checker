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
import * as logger from './logger';

const PARTICIPANT_ID = 'coding-rule-checker';
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  // Initialize logger
  logger.initializeLogger('Coding Rule Checker');
  logger.log('Extension activated');

  // Register chat participant
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, chatContext, stream, token) => {
    try {
      await handleChatRequest(request, chatContext, stream, token);
    } catch (error) {
      logger.error('Chat request failed:', error);
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
  const models = await vscode.lm.selectChatModels({ family: settings.model });
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

  // Display the number of files to review
  stream.markdown(`📂 Found ${codesToReview.length} file(s) to review\n`);

  // Process each code file
  for (const code of codesToReview) {
    stream.markdown(`\n🔍 Reviewing ${code.fileName}...\n`);

    // Determine which rulesets to apply based on file pattern matching
    const rulesetNames = selectRulesetsForFile(
      code.filePath,
      code.fileName,
      settings,
      workspaceRoot
    );

    stream.markdown(`📝 File: ${code.fileName}\n`);

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

      const allChapters = await loadRules(rulesPath);

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

      // Perform review
      const result = await reviewCodeParallel(
        code,
        chaptersToReview,
        ruleSettings,
        rulesetName,
        systemPrompt,
        reviewPrompt,
        falsePositivePrompt,
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

      const showChaptersWithNoIssues = settings.showChaptersWithNoIssues || false;

      for (const result of allResults) {
        stream.markdown(`### ${result.rulesetName}\n`);
        stream.markdown(formatForChat(result, showChaptersWithNoIssues));
      }

      // Calculate totals
      const totalIssuesAll = allResults.reduce((sum, r) => sum + r.totalIssues, 0);
      stream.markdown(`\n**Total issues found: ${totalIssuesAll}**\n`);

      // Load template
      const template = await loadPromptTemplate(workspaceRoot, settings.templatesPath);

      // Save unified results to file if enabled and workspace is open
      if (isWorkspaceOpen && settings.fileOutput.enabled) {
        try {
          logger.log('Attempting to save unified review results...');
          const outputPath = await saveUnifiedReviewResults(allResults, settings, workspaceRoot, template);
          logger.log('Review results saved successfully to:', outputPath);
          stream.markdown(`\n💾 Review results saved to: [${path.basename(outputPath)}](${vscode.Uri.file(outputPath)})\n`);
        } catch (error) {
          logger.error('Failed to save review results:', error);
          stream.markdown(`\n⚠️ Failed to save review results: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      } else {
        if (!isWorkspaceOpen) {
          logger.log('File output skipped: No workspace open');
        } else if (!settings.fileOutput.enabled) {
          logger.log('File output skipped: Disabled in settings');
        }
      }

      // Show detailed results
      stream.markdown('\n---\n\n## 📋 Detailed Results\n\n');
      stream.markdown(formatUnifiedReviewResults(allResults, template, showChaptersWithNoIssues));
    }
  }

  stream.markdown('\n\n✅ Review completed!\n');
}

function parseReviewRequest(request: vscode.ChatRequest, command: string): ReviewRequest {
  const text = request.prompt;
  const parts = text.split(/\s+/);

  let fileOrUrl = '';
  let filesOrUrls: string[] = [];
  let diffRange: string | undefined;

  logger.log('[parseReviewRequest] Parsing request...');
  logger.log('[parseReviewRequest] Prompt text:', text);
  logger.log('[parseReviewRequest] Command:', command);
  logger.log('[parseReviewRequest] References count:', request.references.length);

  // Priority 1: Check for GitHub URL(s) in prompt text (highest priority)
  const urlMatches = text.matchAll(/(https?:\/\/github\.com\/[^\s]+)/g);
  const urls = Array.from(urlMatches, m => m[1]);

  if (urls.length > 0) {
    logger.log('[parseReviewRequest] Found', urls.length, 'GitHub URL(s) in text');
    filesOrUrls = urls;
    fileOrUrl = urls[0]; // First URL as primary

    // Check if it's a compare URL (only for single URL)
    if (urls.length === 1) {
      const compareMatch = fileOrUrl.match(/github\.com\/([^/]+)\/([^/]+)\/compare\/(.+)/);
      if (compareMatch) {
        logger.log('[parseReviewRequest] Detected compare URL');
        const [, owner, repo, compareRange] = compareMatch;

        // Store the base repo URL and the comparison range
        fileOrUrl = `https://github.com/${owner}/${repo}`;
        filesOrUrls = [fileOrUrl];
        diffRange = compareRange;
        logger.log('[parseReviewRequest] Extracted repo URL:', fileOrUrl);
        logger.log('[parseReviewRequest] Extracted compare range:', diffRange);

        // Extract optional file name from the rest of the text
        const urlIndex = text.indexOf(urls[0]);
        const afterUrl = text.substring(urlIndex + urls[0].length).trim();

        // Look for a file path (something with slashes and ending with an extension)
        const filePathMatch = afterUrl.match(/([^\s]+\.\w+)/);
        if (filePathMatch) {
          const targetFilePath = filePathMatch[1];
          logger.log('[parseReviewRequest] Target file path:', targetFilePath);
          // Store the file path for filtering
          diffRange = `${compareRange}:FILE:${targetFilePath}`;
        }
      }
      // Check if it's a commit URL
      else {
        const commitMatch = fileOrUrl.match(/github\.com\/[^/]+\/[^/]+\/commit\/[a-f0-9]+/);
        if (commitMatch) {
          logger.log('[parseReviewRequest] Detected commit URL');

          // Extract optional file name from the rest of the text
          const urlIndex = text.indexOf(fileOrUrl);
          const afterUrl = text.substring(urlIndex + fileOrUrl.length).trim();

          // Look for a file name (something ending with an extension)
          const fileNameMatch = afterUrl.match(/([^\s]+\.\w+)/);
          if (fileNameMatch) {
            const targetFileName = fileNameMatch[1];
            logger.log('[parseReviewRequest] Target file name:', targetFileName);
            // Store the file name in diffRange temporarily (we'll handle this specially)
            diffRange = `FILE:${targetFileName}`;
          }
        }
      }
    } else {
      // Multiple URLs - log them all
      urls.forEach((url, index) => {
        logger.log(`[parseReviewRequest] URL ${index + 1}:`, url);
      });
    }
  }

  // Priority 2: Extract file references (support multiple files)
  if (!fileOrUrl) {
    for (const ref of request.references) {
      logger.log('[parseReviewRequest] Processing reference:', ref);
      if (ref.value && typeof ref.value === 'object' && 'uri' in ref.value) {
        const filePath = (ref.value as any).uri.fsPath;
        filesOrUrls.push(filePath);
        logger.log('[parseReviewRequest] Found file reference:', filePath);
      }
    }

    // Set first file as primary fileOrUrl for backward compatibility
    if (filesOrUrls.length > 0) {
      fileOrUrl = filesOrUrls[0];
      logger.log('[parseReviewRequest] Primary file:', fileOrUrl);
      logger.log('[parseReviewRequest] Total files:', filesOrUrls.length);
    }
  }

  // Priority 3: Fall back to active editor (lowest priority)
  if (!fileOrUrl && vscode.window.activeTextEditor) {
    fileOrUrl = vscode.window.activeTextEditor.document.uri.fsPath;
    filesOrUrls = [fileOrUrl];
    logger.log('[parseReviewRequest] Using active editor file:', fileOrUrl);
  }

  if (!fileOrUrl) {
    logger.log('[parseReviewRequest] WARNING: No file reference found!');
  }

  // Parse diff range if present (only if not already set by URL parsing)
  if (command === 'diff' && !diffRange) {
    // Look for patterns like "main..feature", tags "v1.0.0..v2.0.0", relative refs "HEAD^..main", etc.
    // Supports: branches, tags, commit hashes, relative refs (HEAD^, HEAD~3, @~2, HEAD@{yesterday})
    const rangeMatch = text.match(/([\w.\/~^@{}\-]+\.\.+[\w.\/~^@{}\-]+)/);
    if (rangeMatch) {
      diffRange = rangeMatch[1];
      logger.log('[parseReviewRequest] Found diff range:', diffRange);
    }
  }

  const sourceType = determineSourceType(fileOrUrl);
  const reviewType = command === 'review' ? 'all' : 'diff';

  return {
    sourceType,
    fileOrUrl,
    filesOrUrls,
    reviewType,
    diffRange
  };
}

/**
 * Gets all reviewable files in a folder recursively
 */
async function getFilesInFolder(folderPath: string): Promise<CodeToReview[]> {
  const codes: CodeToReview[] = [];
  const uri = vscode.Uri.file(folderPath);

  // Common file extensions to review
  const reviewableExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.java', '.cs', '.cpp', '.c', '.h', '.hpp',
    '.go', '.rs', '.rb', '.php', '.swift', '.kt'
  ];

  // Common folders to exclude
  const excludeFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage'];

  async function scanDirectory(dirUri: vscode.Uri): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);

        if (type === vscode.FileType.Directory) {
          // Skip excluded folders
          if (!excludeFolders.includes(name)) {
            await scanDirectory(entryUri);
          }
        } else if (type === vscode.FileType.File) {
          // Check if file has reviewable extension
          const hasReviewableExt = reviewableExtensions.some(ext => name.endsWith(ext));
          if (hasReviewableExt) {
            try {
              const code = await getLocalFileContent(entryUri.fsPath);
              codes.push(code);
            } catch (error) {
              logger.error(`Failed to load file ${entryUri.fsPath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to scan directory ${dirUri.fsPath}:`, error);
    }
  }

  await scanDirectory(uri);
  return codes;
}

async function getCodeToReview(request: ReviewRequest, workspaceRoot: string): Promise<CodeToReview[]> {
  const codes: CodeToReview[] = [];

  logger.log('[getCodeToReview] Request:', {
    sourceType: request.sourceType,
    fileOrUrl: request.fileOrUrl,
    filesOrUrls: request.filesOrUrls,
    reviewType: request.reviewType,
    diffRange: request.diffRange
  });

  if (request.sourceType === 'github') {
    // Process all GitHub URLs
    for (const url of request.filesOrUrls) {
      logger.log('[getCodeToReview] Processing GitHub URL:', url);

      // Check if it's a commit URL
      const isCommitUrl = url.match(/github\.com\/[^/]+\/[^/]+\/commit\/[a-f0-9]+/);

      if (isCommitUrl) {
        logger.log('[getCodeToReview] Processing GitHub commit URL...');

        // Extract target file name if specified (only for single URL with diffRange)
        let targetFileName: string | undefined;
        if (request.filesOrUrls.length === 1 && request.diffRange?.startsWith('FILE:')) {
          targetFileName = request.diffRange.substring(5);
          logger.log('[getCodeToReview] Filtering for file:', targetFileName);
        }

        const commitCodes = await getGitHubCommitDiff(url, targetFileName);
        codes.push(...commitCodes);
        logger.log('[getCodeToReview] Loaded', commitCodes.length, 'file(s) from commit');
      } else if (request.reviewType === 'all') {
        logger.log('[getCodeToReview] Processing GitHub file URL...');
        const code = await getGitHubFileContent(url);
        codes.push(code);
      } else {
        // Diff mode - only supported for single URL
        if (request.filesOrUrls.length > 1) {
          logger.log('[getCodeToReview] WARNING: Diff mode with multiple URLs not supported, skipping:', url);
          continue;
        }

        logger.log('[getCodeToReview] Processing GitHub diff/compare...');
        if (!request.diffRange) {
          throw new Error('Diff range is required for GitHub diff review');
        }

        // Check if diffRange contains file filter (format: "range:FILE:filepath")
        let compareRange = request.diffRange;
        let targetFilePath: string | undefined;

        if (request.diffRange.includes(':FILE:')) {
          const parts = request.diffRange.split(':FILE:');
          compareRange = parts[0];
          targetFilePath = parts[1];
          logger.log('[getCodeToReview] Compare range:', compareRange);
          logger.log('[getCodeToReview] Target file path:', targetFilePath);

          // Use getGitHubCompareDiff for file filtering
          const compareCodes = await getGitHubCompareDiff(url, compareRange, targetFilePath);
          codes.push(...compareCodes);
          logger.log('[getCodeToReview] Loaded', compareCodes.length, 'file(s) from comparison');
        } else {
          // Use original getGitHubDiff for backward compatibility
          const code = await getGitHubDiff(url, request.diffRange);
          codes.push(code);
        }
      }
    }
  } else {
    // Local file(s) or folder
    logger.log('[getCodeToReview] Processing local file(s)...');
    if (request.reviewType === 'all') {
      logger.log('[getCodeToReview] Review type: all');

      // Process all files/folders in filesOrUrls
      for (const fileOrFolder of request.filesOrUrls) {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fileOrFolder));

        if (stat.type === vscode.FileType.Directory) {
          // It's a folder - get all reviewable files
          logger.log('[getCodeToReview] Processing folder:', fileOrFolder);
          const folderCodes = await getFilesInFolder(fileOrFolder);
          codes.push(...folderCodes);
          logger.log('[getCodeToReview] Loaded', folderCodes.length, 'file(s) from folder');
        } else {
          // It's a file
          logger.log('[getCodeToReview] Loading file content:', fileOrFolder);
          const code = await getLocalFileContent(fileOrFolder);
          codes.push(code);
          logger.log('[getCodeToReview] File loaded successfully');
        }
      }
    } else {
      logger.log('[getCodeToReview] Review type: diff');
      // Diff mode
      if (request.fileOrUrl) {
        logger.log('[getCodeToReview] Loading file diff:', request.fileOrUrl);
        const code = await getLocalFileDiff(workspaceRoot, request.fileOrUrl, request.diffRange);
        codes.push(code);
        logger.log('[getCodeToReview] Diff loaded successfully');
      } else {
        logger.log('[getCodeToReview] Loading all changed files...');
        // Review all changed files
        const allCodes = await getAllFilesDiff(workspaceRoot, request.diffRange);
        codes.push(...allCodes);
        logger.log('[getCodeToReview] Loaded', allCodes.length, 'changed files');
      }
    }
  }

  logger.log('[getCodeToReview] Total codes to review:', codes.length);
  return codes;
}

export function deactivate() {}
