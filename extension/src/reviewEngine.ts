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

  // Progress is now handled at chapter level, not iteration level
  console.log(`\n=== Sending review request for chapter ${chapter.id}: ${chapter.title} (iteration ${iterationNumber}) ===`);
  console.log('Model info:', { family: model.family, name: model.name, vendor: model.vendor });
  console.log('System prompt length:', systemPrompt.length);
  console.log('Review prompt length:', prompt.length);
  console.log('Messages count:', messages.length);
  console.log('Code content length:', code.content.length);
  console.log('Code file name:', code.fileName);

  try {
    console.log('Calling model.sendRequest...');
    const startTime = Date.now();
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    const requestTime = Date.now() - startTime;
    console.log(`Request returned after ${requestTime}ms`);

    console.log('Streaming response text...');

    // Parse response
    let responseText = '';
    let fragmentCount = 0;
    for await (const fragment of response.text) {
      fragmentCount++;
      responseText += fragment;
      if (fragmentCount <= 3) {
        console.log(`Fragment ${fragmentCount}:`, fragment.substring(0, 100));
      }
    }

    console.log(`Response received. Total fragments: ${fragmentCount}, Total length: ${responseText.length}`);
    console.log('Response preview (first 500 chars):', responseText.substring(0, 500));
    console.log('Response preview (last 200 chars):', responseText.substring(Math.max(0, responseText.length - 200)));

    // Parse the response to extract issues
    console.log('Parsing response for issues...');

    // If it's a diff, get addition line numbers to filter out deletion line issues
    let additionLineNumbers: number[] | undefined;
    if (code.isDiff) {
      const diffInfo = parseDiff(code.content);
      additionLineNumbers = diffInfo.additions.map(line => line.lineNumber);
      console.log('Addition line numbers:', additionLineNumbers);
    }

    const issues = parseReviewResponse(responseText, chapter.id, additionLineNumbers);

    console.log(`Parsed ${issues.length} issues`);
    if (issues.length > 0) {
      console.log('First issue:', JSON.stringify(issues[0], null, 2));
      console.log(`All issues: ${JSON.stringify(issues.map(i => ({ line: i.lineNumber, rule: i.ruleId })))}`);
    } else {
      console.log('WARNING: No issues found in response!');
      console.log('Full response for debugging:', responseText);
    }
    console.log('=== Review request complete ===\n');

    return {
      issues,
      chapterId: chapter.id,
      iterationNumber
    };
  } catch (error) {
    console.error('ERROR during review request:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    return {
      issues: [],
      chapterId: chapter.id,
      iterationNumber
    };
  }
}

/**
 * Builds the review prompt with code and rules
 */
function buildReviewPrompt(code: CodeToReview, chapter: RuleChapter, reviewPromptTemplate: string): string {
  let codeContent = code.content;

  // If it's a diff, format with diff symbols and line numbers
  if (code.isDiff) {
    const diffInfo = parseDiff(code.content);
    const lines: string[] = [];

    // Build a complete diff view with symbols and line numbers
    let currentLine = 0;
    const allLines = code.content.split('\n');

    for (const line of allLines) {
      // Skip diff headers
      if (line.startsWith('diff ') || line.startsWith('index ') ||
          line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }

      // Parse hunk header to get line number
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
        if (match) {
          currentLine = parseInt(match[1], 10);
        }
        continue;
      }

      // Format lines with diff symbols and line numbers
      if (line.startsWith('+') && !line.startsWith('+++')) {
        lines.push(`+ ${currentLine}: ${line.substring(1)}`);
        currentLine++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        lines.push(`- ${line.substring(1)}`);
      } else if (!line.startsWith('\\')) {
        // Context line
        lines.push(`  ${currentLine}: ${line}`);
        currentLine++;
      }
    }

    codeContent = lines.join('\n');
  } else {
    // Normal review: Add line numbers
    const lines = code.content.split('\n');
    codeContent = lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
  }

  // Replace placeholders in template (use replaceAll to replace all occurrences)
  let prompt = reviewPromptTemplate
    .replaceAll('{fileName}', code.fileName)
    .replaceAll('{filePath}', code.filePath)
    .replaceAll('{language}', code.language)
    .replaceAll('{code}', codeContent)
    .replaceAll('{chapterTitle}', chapter.title)
    .replaceAll('{chapterContent}', chapter.content);

  return prompt;
}

/**
 * Parses the review response to extract issues
 * @param responseText - The response text from the LLM
 * @param chapterId - The chapter ID
 * @param additionLineNumbers - Optional list of addition line numbers for diff review (to filter out deletion line issues)
 */
function parseReviewResponse(responseText: string, chapterId: string, additionLineNumbers?: number[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  try {
    console.log('[parseReviewResponse] Attempting to parse response...');

    // Try to parse as JSON with code block first
    let jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    let jsonText = null;

    if (jsonMatch) {
      console.log('[parseReviewResponse] Found JSON code block, parsing...');
      jsonText = jsonMatch[1];
    } else {
      console.log('[parseReviewResponse] No JSON code block found, trying raw JSON...');
      // Try to parse the entire response as raw JSON
      const trimmed = responseText.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        console.log('[parseReviewResponse] Response looks like raw JSON, attempting to parse...');
        jsonText = trimmed;
      }
    }

    if (jsonText) {
      const json = JSON.parse(jsonText);
      console.log('[parseReviewResponse] Parsed JSON:', JSON.stringify(json).substring(0, 200));
      if (json.issues && Array.isArray(json.issues)) {
        console.log(`[parseReviewResponse] Found ${json.issues.length} issues in JSON`);
        if (json.issues.length === 0) {
          console.log('[parseReviewResponse] WARNING: LLM returned empty issues array!');
        }
        const parsedIssues = json.issues.map((issue: any) => ({
          ruleId: issue.ruleId || chapterId,
          ruleTitle: issue.ruleTitle || '',
          lineNumber: issue.lineNumber || 0,
          codeSnippet: issue.codeSnippet || '',
          reason: issue.reason || '',
          suggestion: issue.suggestion || ''
        }));

        // Filter out issues on deletion lines if this is a diff review
        if (additionLineNumbers) {
          const filtered = parsedIssues.filter((issue: ReviewIssue) => additionLineNumbers.includes(issue.lineNumber));
          console.log(`[parseReviewResponse] Filtered ${parsedIssues.length - filtered.length} issues on deletion lines`);
          return filtered;
        }
        return parsedIssues;
      } else {
        console.log('[parseReviewResponse] JSON does not contain issues array');
      }
    } else {
      console.log('[parseReviewResponse] Response is not JSON, trying markdown format...');
    }

    // Fallback: Parse markdown format
    const issueBlocks = responseText.split(/(?=^- NG\d+)/m);
    console.log(`[parseReviewResponse] Found ${issueBlocks.length} markdown blocks`);

    for (const block of issueBlocks) {
      const lineMatch = block.match(/行番号[：:]\s*(\d+)/);
      const snippetMatch = block.match(/```[\s\S]*?\n([\s\S]*?)\n```/);
      const reasonMatch = block.match(/NG理由[：:]\s*([^\n]+)/);
      const suggestionMatch = block.match(/修正案[：:]\s*([^\n]+)/);

      if (lineMatch) {
        const lineNumber = parseInt(lineMatch[1], 10);

        // Filter out issues on deletion lines if this is a diff review
        if (additionLineNumbers && !additionLineNumbers.includes(lineNumber)) {
          console.log(`[parseReviewResponse] Skipping issue on deletion line: ${lineNumber}`);
          continue;
        }

        issues.push({
          ruleId: chapterId,
          ruleTitle: '',
          lineNumber: lineNumber,
          codeSnippet: snippetMatch ? snippetMatch[1].trim() : '',
          reason: reasonMatch ? reasonMatch[1].trim() : '',
          suggestion: suggestionMatch ? suggestionMatch[1].trim() : ''
        });
      }
    }

    console.log(`[parseReviewResponse] Extracted ${issues.length} issues from markdown format`);
  } catch (error) {
    console.error('[parseReviewResponse] Failed to parse review response:', error);
    console.error('[parseReviewResponse] Error details:', error instanceof Error ? error.stack : String(error));
  }

  console.log(`[parseReviewResponse] Returning ${issues.length} total issues`);
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
