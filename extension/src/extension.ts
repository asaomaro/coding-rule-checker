import * as vscode from 'vscode';
import * as path from 'path';
import {
  loadSettings,
  loadRuleSettings,
  loadPromptTemplate,
  getWorkspaceRoot,
  resolveWorkspacePath,
  selectRulesetsForFileFromSettings,
  selectChaptersForFileByChapterPatterns,
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
import { ConcurrencyQueue } from './concurrencyQueue';
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
    stream.markdown('Please use one of the following commands:\n\n');

    stream.markdown('**Basic Usage:**\n');
    stream.markdown('- `/review #file` - Review file (select with VSCode reference)\n');
    stream.markdown('- `/review #folder` - Review all files in folder\n');
    stream.markdown('- `/diff main..feature` - Review diff between branches\n\n');

    stream.markdown('**Multiple Files:**\n');
    stream.markdown('- `/review #file1 #file2 #file3` - Review multiple files\n');
    stream.markdown('- `/review #file:UserService.java #file:Controller.java` - By name\n\n');

    stream.markdown('**Ruleset Override:**\n');
    stream.markdown('- `/review --ruleset=typescript-rules #file` - Use specific ruleset\n');
    stream.markdown('- `/review -r typescript-rules,security-rules #file` - Multiple rulesets\n\n');

    stream.markdown('**GitHub:**\n');
    stream.markdown('- `/review https://github.com/owner/repo/blob/main/file.ts` - GitHub file\n');
    stream.markdown('- `/diff https://github.com/owner/repo/compare/main...feature` - GitHub diff\n');

    return;
  }

  // Parse request first
  const reviewRequest = await parseReviewRequest(request, command);

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

  // Create concurrency queue
  const maxConcurrent = settings.maxConcurrentReviews || 10;
  const queue = new ConcurrencyQueue(maxConcurrent);
  stream.markdown(`⚙️ Max concurrent reviews: ${maxConcurrent}\n`);

  // Get code to review
  stream.markdown('📥 Retrieving code...\n');
  const codesToReview = await getCodeToReview(reviewRequest, workspaceRoot);

  if (codesToReview.length === 0) {
    stream.markdown('⚠️ No code to review\n');
    return;
  }

  // Display the number of files to review
  stream.markdown(`📂 Found ${codesToReview.length} file(s) to review\n`);

  // Build all file × ruleset combinations for parallel processing
  interface ReviewTask {
    code: CodeToReview;
    rulesetName: string;
  }

  const reviewTasks: ReviewTask[] = [];

  // Create review tasks for all file × ruleset combinations
  for (const code of codesToReview) {
    // Determine rulesets to use for this file
    let rulesetNames: string[];

    if (reviewRequest.rulesetOverride) {
      // Use override rulesets from --ruleset flag
      rulesetNames = reviewRequest.rulesetOverride;
      logger.log(`[Review] Using ruleset override for ${code.fileName}:`, rulesetNames);
    } else {
      // Auto-select rulesets based on settings.ruleset configuration
      rulesetNames = selectRulesetsForFileFromSettings(
        code.filePath,
        code.fileName,
        settings,
        workspaceRoot
      );
      logger.log(`[Review] Selected rulesets for ${code.fileName}:`, rulesetNames);
    }

    if (rulesetNames.length === 0) {
      logger.log(`[Review] No rulesets selected for ${code.fileName}, skipping`);
      continue;
    }

    // Create a task for each file × ruleset combination
    for (const rulesetName of rulesetNames) {
      reviewTasks.push({ code, rulesetName });
    }
  }

  stream.markdown(`📋 Total review tasks: ${reviewTasks.length} (files × rulesets)\n`);
  stream.markdown(`🚀 Starting parallel review with max ${maxConcurrent} concurrent requests...\n\n`);

  // Execute all review tasks in parallel (queue will handle concurrency limits)
  const allResults = await Promise.all(
    reviewTasks.map(async ({ code, rulesetName }) => {
      logger.log(`[Review] Starting: ${code.fileName} × ${rulesetName}`);

      // Load ruleset settings
      const ruleSettings = await loadRuleSettings(workspaceRoot, rulesetName);

      // Load rules
      const rulesPath = resolveWorkspacePath(workspaceRoot, ruleSettings.rulesPath);

      // Load common prompt if specified
      let commonPromptPath: string | undefined;
      let commonPrompt = '';
      if (ruleSettings.commonPromptPath) {
        commonPromptPath = resolveWorkspacePath(workspaceRoot, ruleSettings.commonPromptPath);
        commonPrompt = await loadPromptTemplate(workspaceRoot, ruleSettings.commonPromptPath);
        logger.log(`[Review] Loaded common prompt from: ${ruleSettings.commonPromptPath}`);
      }

      const allChapters = await loadRules(rulesPath, commonPromptPath);
      logger.log(`[Review] Loaded ${allChapters.length} chapters from: ${rulesPath}`);

      // Filter chapters based on RuleSettings.chapterFilePatterns (chapter to file patterns mapping)
      const allChapterIds = allChapters.map(ch => ch.id);
      const selectedChapterIds = selectChaptersForFileByChapterPatterns(
        code.filePath,
        code.fileName,
        ruleSettings,
        allChapterIds,
        workspaceRoot
      );

      let chaptersToReview = allChapters.filter(ch => selectedChapterIds.includes(ch.id));
      logger.log(`[Review] Chapter filter by chapterFilePatterns: ${selectedChapterIds.join(', ')} (${chaptersToReview.length}/${allChapters.length})`);

      // Further filter chapters based on file patterns (chapterFilters in rule-settings.json)
      if (ruleSettings.chapterFilters) {
        const filteredChapterIds = chaptersToReview.map(ch => ch.id);
        const additionalFilteredIds = selectChaptersForFile(
          code.filePath,
          code.fileName,
          ruleSettings,
          workspaceRoot,
          filteredChapterIds
        );

        if (additionalFilteredIds !== null) {
          chaptersToReview = chaptersToReview.filter(ch => additionalFilteredIds.includes(ch.id));
          logger.log(`[Review] Additional file pattern filter: ${additionalFilteredIds.join(', ')} (${chaptersToReview.length}/${allChapters.length})`);
        }
      }

      if (chaptersToReview.length === 0) {
        logger.log(`[Review] No chapters selected for review`);
        return null;
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
        commonPrompt,
        reviewPrompt,
        falsePositivePrompt,
        model,
        queue,
        (progress) => {
          stream.progress(progress.message);
        }
      );

      logger.log(`[Review] Completed: ${code.fileName} × ${rulesetName}`);
      return result;
    })
  );

  // Filter out null results
  const validResults = allResults.filter(r => r !== null);

  // Output unified results to chat
  if (validResults.length > 0) {
    stream.markdown('\n\n## 📊 Review Results\n\n');

    const showRulesWithNoIssues = settings.showRulesWithNoIssues || false;

    for (const result of validResults) {
      stream.markdown(`### ${result.rulesetName}\n`);
      stream.markdown(formatForChat(result, showRulesWithNoIssues));
    }

    // Calculate totals
    const totalIssuesAll = validResults.reduce((sum, r) => sum + r.totalIssues, 0);
    stream.markdown(`\n**Total issues found: ${totalIssuesAll}**\n`);

    // Load template
    const template = await loadPromptTemplate(workspaceRoot, settings.templatesPath);

    // Save unified results to file if enabled and workspace is open
    if (isWorkspaceOpen && settings.fileOutput.enabled) {
      try {
        logger.log('Attempting to save unified review results...');
        const outputPath = await saveUnifiedReviewResults(validResults, settings, workspaceRoot, template);
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
    stream.markdown(formatUnifiedReviewResults(validResults, template, showRulesWithNoIssues));
  }

  stream.markdown('\n\n✅ Review completed!\n');
}

/**
 * Detects and warns about ambiguous arguments in the prompt
 */
function detectAmbiguousArguments(text: string, logger: any): void {
  // Remove all known patterns from the text
  let cleanedText = text;

  // Remove known patterns
  cleanedText = cleanedText.replace(/#file:[^\s]+/g, '');           // #file:xxx
  cleanedText = cleanedText.replace(/#folder:[^\s]+/g, '');         // #folder:xxx
  cleanedText = cleanedText.replace(/--ruleset=[^\s]+/g, '');       // --ruleset=xxx
  cleanedText = cleanedText.replace(/-r\s+[^\s]+/g, '');            // -r xxx
  cleanedText = cleanedText.replace(/https?:\/\/[^\s]+/g, '');      // URLs
  cleanedText = cleanedText.replace(/[\w.\/~^@{}\-]+\.\.+[\w.\/~^@{}\-]+/g, ''); // diff range (xxx..yyy)
  cleanedText = cleanedText.replace(/[A-Za-z]:[\\\/][\w\\\/.-]+\.\w+/g, ''); // Absolute paths (Windows)
  cleanedText = cleanedText.replace(/\/[\w\/.-]+\.\w+/g, '');       // Absolute paths (Unix)
  cleanedText = cleanedText.replace(/\.\.?\/[\w\/.-]+\.\w+/g, ''); // Relative paths (./ or ../)

  // Get remaining tokens (potential ambiguous arguments)
  const tokens = cleanedText.split(/\s+/).filter(t => t.length > 0);

  if (tokens.length > 0) {
    logger.log('[parseReviewRequest] ⚠️ WARNING: Potentially ambiguous argument(s):', tokens);
    logger.log('[parseReviewRequest] Suggestion: Use explicit formats:');
    logger.log('[parseReviewRequest]   - Files: #file:filename or #file (VSCode reference)');
    logger.log('[parseReviewRequest]   - Folders: #folder:foldername or #folder (VSCode reference)');
    logger.log('[parseReviewRequest]   - Rulesets: --ruleset=name or -r name');
    logger.log('[parseReviewRequest]   - Diff range: branch..branch (with ..)');
  }
}

async function parseReviewRequest(request: vscode.ChatRequest, command: string): Promise<ReviewRequest> {
  const text = request.prompt;
  const parts = text.split(/\s+/);

  let fileOrUrl = '';
  let filesOrUrls: string[] = [];
  let diffRange: string | undefined;
  let rulesetOverride: string[] | undefined;

  logger.log('[parseReviewRequest] Parsing request...');
  logger.log('[parseReviewRequest] Prompt text:', text);
  logger.log('[parseReviewRequest] Command:', command);
  logger.log('[parseReviewRequest] References count:', request.references.length);

  // Parse --ruleset flag (both --ruleset=xxx and -r xxx formats)
  const rulesetLongMatch = text.match(/--ruleset=([^\s]+)/);
  const rulesetShortMatch = text.match(/-r\s+([^\s]+)/);

  if (rulesetLongMatch) {
    rulesetOverride = rulesetLongMatch[1].split(',').map(r => r.trim());
    logger.log('[parseReviewRequest] Ruleset override (--ruleset):', rulesetOverride);
  } else if (rulesetShortMatch) {
    rulesetOverride = rulesetShortMatch[1].split(',').map(r => r.trim());
    logger.log('[parseReviewRequest] Ruleset override (-r):', rulesetOverride);
  }

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

  // Priority 2: Parse #file:filename and #folder:foldername patterns from prompt text
  if (!fileOrUrl) {
    // Extract #file:filename patterns from the prompt
    const filePatternMatches = text.matchAll(/#file:([^\s]+)/g);
    const filePatterns = Array.from(filePatternMatches, m => m[1]);

    // Extract #folder:foldername patterns from the prompt
    const folderPatternMatches = text.matchAll(/#folder:([^\s]+)/g);
    const folderPatterns = Array.from(folderPatternMatches, m => m[1]);

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      if (filePatterns.length > 0 || folderPatterns.length > 0) {
        logger.log('[parseReviewRequest] ERROR: No workspace folder open');
      }
    } else {
      // Process file patterns
      if (filePatterns.length > 0) {
        logger.log('[parseReviewRequest] Found', filePatterns.length, '#file: pattern(s)');

        for (const pattern of filePatterns) {
          logger.log('[parseReviewRequest] Searching for file:', pattern);

          // Try to find the file in workspace
          const files = await vscode.workspace.findFiles(`**/${pattern}`, '**/node_modules/**', 10);

          if (files.length > 0) {
            const filePath = files[0].fsPath;
            filesOrUrls.push(filePath);
            logger.log('[parseReviewRequest] ✓ Found file:', filePath);

            if (files.length > 1) {
              logger.log('[parseReviewRequest] WARNING: Multiple files found, using first one');
              files.forEach((f, i) => logger.log(`  [${i + 1}]`, f.fsPath));
            }
          } else {
            logger.log('[parseReviewRequest] ✗ File not found:', pattern);
          }
        }
      }

      // Process folder patterns
      if (folderPatterns.length > 0) {
        logger.log('[parseReviewRequest] Found', folderPatterns.length, '#folder: pattern(s)');

        for (const pattern of folderPatterns) {
          logger.log('[parseReviewRequest] Searching for folder:', pattern);

          // Try to find the folder in workspace
          const folders = await vscode.workspace.findFiles(`**/${pattern}`, '**/node_modules/**', 10);

          // Filter to only directories
          for (const folder of folders) {
            try {
              const stat = await vscode.workspace.fs.stat(folder);
              if (stat.type === vscode.FileType.Directory) {
                const folderPath = folder.fsPath;
                filesOrUrls.push(folderPath);
                logger.log('[parseReviewRequest] ✓ Found folder:', folderPath);
                break; // Use first matching folder
              }
            } catch (error) {
              // Not a directory or can't stat, continue
            }
          }

          // If no folder found by pattern, try direct path
          if (folders.length === 0) {
            // Try as direct relative path from workspace root
            const directPath = path.join(workspaceFolders[0].uri.fsPath, pattern);
            try {
              const stat = await vscode.workspace.fs.stat(vscode.Uri.file(directPath));
              if (stat.type === vscode.FileType.Directory) {
                filesOrUrls.push(directPath);
                logger.log('[parseReviewRequest] ✓ Found folder (direct path):', directPath);
              } else {
                logger.log('[parseReviewRequest] ✗ Folder not found:', pattern);
              }
            } catch (error) {
              logger.log('[parseReviewRequest] ✗ Folder not found:', pattern);
            }
          }
        }
      }
    }
  }

  // Priority 3: Parse absolute paths and explicit relative paths (exception handling)
  if (!fileOrUrl && filesOrUrls.length === 0) {
    logger.log('[parseReviewRequest] Checking for explicit path formats...');

    // Match absolute paths or explicit relative paths with extensions
    // Windows: C:\path\file.ts or /path/file.ts
    // Relative: ./path/file.ts or ../path/file.ts
    const pathPattern = /(?:^|[\s])([A-Za-z]:[\\\/][\w\\\/.-]+\.\w+|\/[\w\/.-]+\.\w+|\.\.?\/[\w\/.-]+\.\w+)(?=\s|$)/g;
    const pathMatches = text.matchAll(pathPattern);

    for (const match of pathMatches) {
      const pathStr = match[1];
      logger.log('[parseReviewRequest] Found explicit path:', pathStr);

      // Resolve relative paths
      let resolvedPath = pathStr;
      if (pathStr.startsWith('./') || pathStr.startsWith('../')) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          resolvedPath = path.resolve(workspaceFolders[0].uri.fsPath, pathStr);
        }
      }

      // Verify file exists
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath));
        if (stat.type === vscode.FileType.File || stat.type === vscode.FileType.Directory) {
          filesOrUrls.push(resolvedPath);
          logger.log('[parseReviewRequest] ✓ Found path:', resolvedPath);
        }
      } catch (error) {
        logger.log('[parseReviewRequest] ✗ Path not found:', resolvedPath);
      }
    }
  }

  // Priority 4: Extract file references from VSCode API (support multiple files)
  if (!fileOrUrl && filesOrUrls.length === 0) {
    logger.log('[parseReviewRequest] Extracting file references from VSCode API...');
    logger.log('[parseReviewRequest] Total references:', request.references.length);

    for (let i = 0; i < request.references.length; i++) {
      const ref = request.references[i];
      logger.log(`[parseReviewRequest] Reference ${i + 1}:`, {
        id: ref.id,
        name: (ref.value as any)?.name,
        uri: (ref.value as any)?.uri?.fsPath
      });

      if (ref.value && typeof ref.value === 'object' && 'uri' in ref.value) {
        const filePath = (ref.value as any).uri.fsPath;
        filesOrUrls.push(filePath);
        logger.log('[parseReviewRequest] ✓ Found file reference:', filePath);
      } else {
        logger.log('[parseReviewRequest] ✗ Reference does not contain URI');
      }
    }
  }

  // Set first file as primary fileOrUrl for backward compatibility
  if (filesOrUrls.length > 0 && !fileOrUrl) {
    fileOrUrl = filesOrUrls[0];
    logger.log('[parseReviewRequest] Primary file:', fileOrUrl);
    logger.log('[parseReviewRequest] Total files found:', filesOrUrls.length);
  } else if (!fileOrUrl && filesOrUrls.length === 0) {
    logger.log('[parseReviewRequest] WARNING: No file references found');
  }

  // Priority 5: Fall back to active editor (lowest priority)
  if (!fileOrUrl && filesOrUrls.length === 0 && vscode.window.activeTextEditor) {
    fileOrUrl = vscode.window.activeTextEditor.document.uri.fsPath;
    filesOrUrls = [fileOrUrl];
    logger.log('[parseReviewRequest] Using active editor file:', fileOrUrl);
  }

  if (!fileOrUrl) {
    logger.log('[parseReviewRequest] WARNING: No file reference found!');
  }

  // Detect ambiguous arguments
  detectAmbiguousArguments(text, logger);

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
    diffRange,
    rulesetOverride
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
