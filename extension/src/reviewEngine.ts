import * as vscode from 'vscode';
import {
  CodeToReview,
  ReviewIssue,
  ReviewIteration,
  RuleChapter,
  FalsePositiveCheck,
  ProgressInfo
} from './types';
import { parseDiff } from './codeRetriever';

/**
 * Performs a single review iteration for a chapter
 */
export async function performReviewIteration(
  code: CodeToReview,
  chapter: RuleChapter,
  systemPrompt: string,
  reviewPrompt: string,
  iterationNumber: number,
  model: vscode.LanguageModelChat,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ReviewIteration> {
  // Build the review prompt
  const prompt = buildReviewPrompt(code, chapter, reviewPrompt);

  // Send to language model
  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(prompt)
  ];

  if (progressCallback) {
    progressCallback({
      current: iterationNumber,
      total: iterationNumber,
      message: `Reviewing chapter ${chapter.id}: ${chapter.title} (iteration ${iterationNumber})`
    });
  }

  const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

  // Parse response
  let responseText = '';
  for await (const fragment of response.text) {
    responseText += fragment;
  }

  // Parse the response to extract issues
  const issues = parseReviewResponse(responseText, chapter.id);

  return {
    issues,
    chapterId: chapter.id,
    iterationNumber
  };
}

/**
 * Builds the review prompt with code and rules
 */
function buildReviewPrompt(code: CodeToReview, chapter: RuleChapter, reviewPromptTemplate: string): string {
  let codeContent = code.content;

  // If it's a diff, extract only added lines
  if (code.isDiff) {
    const diffInfo = parseDiff(code.content);
    codeContent = diffInfo.additions.map(line => `${line.lineNumber}: ${line.content}`).join('\n');
  }

  // Replace placeholders in template
  let prompt = reviewPromptTemplate
    .replace('{fileName}', code.fileName)
    .replace('{filePath}', code.filePath)
    .replace('{language}', code.language)
    .replace('{code}', codeContent)
    .replace('{chapterTitle}', chapter.title)
    .replace('{chapterContent}', chapter.content);

  return prompt;
}

/**
 * Parses the review response to extract issues
 */
function parseReviewResponse(responseText: string, chapterId: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  try {
    // Try to parse as JSON first
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[1]);
      if (Array.isArray(json.issues)) {
        return json.issues.map((issue: any) => ({
          ruleId: issue.ruleId || chapterId,
          ruleTitle: issue.ruleTitle || '',
          lineNumber: issue.lineNumber || 0,
          codeSnippet: issue.codeSnippet || '',
          reason: issue.reason || '',
          suggestion: issue.suggestion || ''
        }));
      }
    }

    // Fallback: Parse markdown format
    const issueBlocks = responseText.split(/(?=^- NG\d+)/m);
    for (const block of issueBlocks) {
      const lineMatch = block.match(/行番号[：:]\s*(\d+)/);
      const snippetMatch = block.match(/```[\s\S]*?\n([\s\S]*?)\n```/);
      const reasonMatch = block.match(/NG理由[：:]\s*([^\n]+)/);
      const suggestionMatch = block.match(/修正案[：:]\s*([^\n]+)/);

      if (lineMatch) {
        issues.push({
          ruleId: chapterId,
          ruleTitle: '',
          lineNumber: parseInt(lineMatch[1], 10),
          codeSnippet: snippetMatch ? snippetMatch[1].trim() : '',
          reason: reasonMatch ? reasonMatch[1].trim() : '',
          suggestion: suggestionMatch ? suggestionMatch[1].trim() : ''
        });
      }
    }
  } catch (error) {
    console.error('Failed to parse review response:', error);
  }

  return issues;
}

/**
 * Performs false positive check on a review issue
 */
export async function checkFalsePositive(
  code: CodeToReview,
  issue: ReviewIssue,
  chapter: RuleChapter,
  falsePositivePrompt: string,
  model: vscode.LanguageModelChat
): Promise<FalsePositiveCheck> {
  // Build the false positive check prompt
  const prompt = buildFalsePositivePrompt(code, issue, chapter, falsePositivePrompt);

  const messages = [
    vscode.LanguageModelChatMessage.User(prompt)
  ];

  const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

  // Parse response
  let responseText = '';
  for await (const fragment of response.text) {
    responseText += fragment;
  }

  // Parse the response
  const isFalsePositive = responseText.toLowerCase().includes('false positive') ||
                          responseText.toLowerCase().includes('誤検知');

  return {
    issueIndex: 0,
    isFalsePositive,
    reason: responseText
  };
}

/**
 * Builds the false positive check prompt
 */
function buildFalsePositivePrompt(
  code: CodeToReview,
  issue: ReviewIssue,
  chapter: RuleChapter,
  falsePositivePromptTemplate: string
): string {
  let prompt = falsePositivePromptTemplate
    .replace('{fileName}', code.fileName)
    .replace('{lineNumber}', issue.lineNumber.toString())
    .replace('{codeSnippet}', issue.codeSnippet)
    .replace('{reason}', issue.reason)
    .replace('{suggestion}', issue.suggestion)
    .replace('{chapterContent}', chapter.content);

  return prompt;
}

/**
 * Aggregates multiple review iterations
 */
export function aggregateReviewIterations(iterations: ReviewIteration[]): ReviewIssue[] {
  const issueMap = new Map<string, ReviewIssue & { count: number }>();

  for (const iteration of iterations) {
    for (const issue of iteration.issues) {
      const key = `${issue.ruleId}-${issue.lineNumber}-${issue.codeSnippet}`;

      if (issueMap.has(key)) {
        const existing = issueMap.get(key)!;
        existing.count++;
      } else {
        issueMap.set(key, { ...issue, count: 1 });
      }
    }
  }

  // Filter issues that appeared in majority of iterations
  const threshold = Math.ceil(iterations.length / 2);
  const aggregatedIssues: ReviewIssue[] = [];

  for (const [, issue] of issueMap) {
    if (issue.count >= threshold) {
      const { count, ...issueWithoutCount } = issue;
      aggregatedIssues.push(issueWithoutCount);
    }
  }

  return aggregatedIssues;
}

/**
 * Filters out false positives from issues
 */
export function filterFalsePositives(
  issues: ReviewIssue[],
  falsePositiveChecks: FalsePositiveCheck[]
): ReviewIssue[] {
  const filtered: ReviewIssue[] = [];

  for (let i = 0; i < issues.length; i++) {
    const checks = falsePositiveChecks.filter(check => check.issueIndex === i);
    const falsePositiveCount = checks.filter(check => check.isFalsePositive).length;

    // If majority of checks say it's false positive, filter it out
    if (falsePositiveCount < Math.ceil(checks.length / 2)) {
      filtered.push(issues[i]);
    }
  }

  return filtered;
}
