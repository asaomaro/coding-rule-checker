import * as vscode from 'vscode';
import * as path from 'path';
import {
  loadSettings,
  loadRuleSettings,
  loadPromptTemplate,
  getWorkspaceRoot,
  resolveWorkspacePath
} from './config';
import { loadRules } from './ruleParser';
import {
  getLocalFileContent,
  getLocalFileDiff,
  getAllFilesDiff,
  getGitHubFileContent,
  getGitHubDiff,
  determineSourceType,
  isGitHubUrl
} from './codeRetriever';
import { reviewCodeParallel, reviewMultipleFiles } from './parallelReviewer';
import {
  formatForChat,
  formatReviewResult,
  saveReviewResult,
  saveMultipleReviewResults
} from './outputFormatter';
import { ReviewRequest, CodeToReview, RuleChapter, Settings, RuleSettings } from './types';

const PARTICIPANT_ID = 'coding-rule-checker';

export function activate(context: vscode.ExtensionContext) {
  // Register chat participant
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, context, stream, token) => {
    try {
      await handleChatRequest(request, context, stream, token);
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
    stream.markdown('- `/reviewAll #file` - Review all code in the specified file\n');
    stream.markdown('- `/reviewDiff [range] #file` - Review diff code (optionally specify diff range)\n');
    return;
  }

  // Get workspace root
  const workspaceRoot = getWorkspaceRoot();

  // Load settings
  stream.markdown('📋 Loading settings...\n');
  const settings = await loadSettings(workspaceRoot);

  // Get language model
  const models = await vscode.lm.selectChatModels({ family: settings.model });
  if (models.length === 0) {
    throw new Error(`No language model found for: ${settings.model}`);
  }
  const model = models[0];

  // Load system prompt
  const systemPrompt = await loadPromptTemplate(workspaceRoot, settings.systemPromptPath);

  // Parse request
  const reviewRequest = parseReviewRequest(request, command);

  // Get code to review
  stream.markdown('📥 Retrieving code...\n');
  const codesToReview = await getCodeToReview(reviewRequest, workspaceRoot);

  if (codesToReview.length === 0) {
    stream.markdown('⚠️ No code to review\n');
    return;
  }

  // Process each code file
  for (const code of codesToReview) {
    stream.markdown(`\n🔍 Reviewing ${code.fileName}...\n`);

    // Determine which rulesets to apply based on file extension
    const extension = path.extname(code.fileName);
    const rulesetNames = settings.rulesets[extension] || [];

    if (rulesetNames.length === 0) {
      stream.markdown(`⚠️ No rulesets configured for extension: ${extension}\n`);
      continue;
    }

    // Review with each ruleset
    for (const rulesetName of rulesetNames) {
      stream.markdown(`\n📖 Applying ruleset: ${rulesetName}\n`);

      // Load ruleset settings
      const ruleSettings = await loadRuleSettings(workspaceRoot, rulesetName);

      // Load rules
      const rulesPath = resolveWorkspacePath(workspaceRoot, ruleSettings.rulesPath);
      const chapters = await loadRules(rulesPath);

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
        chapters,
        ruleSettings,
        systemPrompt,
        reviewPrompt,
        falsePositivePrompt,
        model,
        (progress) => {
          stream.progress(progress.message);
        }
      );

      // Output results to chat
      stream.markdown(formatForChat(result));

      // Save to file if enabled
      if (ruleSettings.fileOutput.enabled) {
        const templatePath = resolveWorkspacePath(workspaceRoot, ruleSettings.templatesPath);
        const template = await loadPromptTemplate(workspaceRoot, templatePath).catch(() => undefined);

        const outputPath = await saveReviewResult(result, ruleSettings, workspaceRoot, template);
        stream.markdown(`\n💾 Review results saved to: ${outputPath}\n`);
      }

      // Show full results
      if (result.totalIssues > 0) {
        const template = ruleSettings.templatesPath ?
          await loadPromptTemplate(workspaceRoot, ruleSettings.templatesPath).catch(() => undefined) :
          undefined;

        stream.markdown('\n---\n\n');
        stream.markdown(formatReviewResult(result, template));
      }
    }
  }

  stream.markdown('\n\n✅ Review completed!\n');
}

function parseReviewRequest(request: vscode.ChatRequest, command: string): ReviewRequest {
  const text = request.prompt;
  const parts = text.split(/\s+/);

  let fileOrUrl = '';
  let diffRange: string | undefined;

  // Extract file references
  for (const ref of request.references) {
    if (ref.value && typeof ref.value === 'object' && 'uri' in ref.value) {
      fileOrUrl = (ref.value as any).uri.fsPath;
      break;
    }
  }

  // Parse diff range if present
  if (command === 'reviewDiff') {
    // Look for patterns like "main..feature" or commit hashes
    const rangeMatch = text.match(/([a-zA-Z0-9_-]+\.\.+[a-zA-Z0-9_-]+)/);
    if (rangeMatch) {
      diffRange = rangeMatch[1];
    }

    // Check for GitHub URL in text
    const urlMatch = text.match(/(https?:\/\/github\.com\/[^\s]+)/);
    if (urlMatch) {
      fileOrUrl = urlMatch[1];
    }
  }

  // If no file specified, check for URL in text
  if (!fileOrUrl) {
    const urlMatch = text.match(/(https?:\/\/github\.com\/[^\s]+)/);
    if (urlMatch) {
      fileOrUrl = urlMatch[1];
    }
  }

  const sourceType = determineSourceType(fileOrUrl);
  const reviewType = command === 'reviewAll' ? 'all' : 'diff';

  return {
    sourceType,
    fileOrUrl,
    reviewType,
    diffRange
  };
}

async function getCodeToReview(request: ReviewRequest, workspaceRoot: string): Promise<CodeToReview[]> {
  const codes: CodeToReview[] = [];

  if (request.sourceType === 'github') {
    if (request.reviewType === 'all') {
      const code = await getGitHubFileContent(request.fileOrUrl);
      codes.push(code);
    } else {
      if (!request.diffRange) {
        throw new Error('Diff range is required for GitHub diff review');
      }
      const code = await getGitHubDiff(request.fileOrUrl, request.diffRange);
      codes.push(code);
    }
  } else {
    // Local file
    if (request.reviewType === 'all') {
      if (request.fileOrUrl) {
        const code = await getLocalFileContent(request.fileOrUrl);
        codes.push(code);
      }
    } else {
      // Diff mode
      if (request.fileOrUrl) {
        const code = await getLocalFileDiff(workspaceRoot, request.fileOrUrl, request.diffRange);
        codes.push(code);
      } else {
        // Review all changed files
        const allCodes = await getAllFilesDiff(workspaceRoot, request.diffRange);
        codes.push(...allCodes);
      }
    }
  }

  return codes;
}

export function deactivate() {}
