import * as fs from 'fs/promises';
import * as path from 'path';
import { ReviewResult, RuleSettings } from './types';

/**
 * Formats review result as markdown
 */
export function formatReviewResult(result: ReviewResult, template?: string): string {
  if (template) {
    return formatWithTemplate(result, template);
  }

  // Default format
  let output = '# Review Sheet\n\n';
  output += `## Review File\n[${result.fileName}](${result.filePath})\n\n`;

  if (result.diffDetails) {
    output += `## Diff Details\n${result.diffDetails}\n\n`;
  }

  output += '## Review Results\n\n';

  for (const chapter of result.chapterResults) {
    if (chapter.issues.length === 0) {
      continue;
    }

    output += `### ${chapter.chapterId}. ${chapter.chapterTitle}\n`;

    for (let i = 0; i < chapter.issues.length; i++) {
      const issue = chapter.issues[i];
      output += `- NG${i + 1} : ${issue.lineNumber}\n`;
      output += `    - NGコードスニペット:\n`;
      output += `        \`\`\`\n`;
      output += `        ${issue.codeSnippet}\n`;
      output += `        \`\`\`\n`;
      output += `    - NG理由:\n`;
      output += `        ${issue.reason}\n`;
      output += `    - 修正案:\n`;
      output += `        ${issue.suggestion}\n`;
    }

    output += '\n';
  }

  output += '## Review Summary\n';
  output += `- NG数: ${result.totalIssues}\n`;
  output += `- 主な指摘: ${result.reviewedChapters.join(', ')}\n`;

  return output;
}

/**
 * Formats review result using a template
 */
function formatWithTemplate(result: ReviewResult, template: string): string {
  let output = template;

  // Replace basic placeholders
  output = output.replace('{fileName}', result.fileName);
  output = output.replace('{filePath}', result.filePath);
  output = output.replace('{diffDetails}', result.diffDetails || '');
  output = output.replace('{totalIssues}', result.totalIssues.toString());
  output = output.replace('{reviewedChapters}', result.reviewedChapters.join(', '));

  return output;
}

/**
 * Saves review result to a file
 */
export async function saveReviewResult(
  result: ReviewResult,
  ruleSettings: RuleSettings,
  workspaceRoot: string,
  template?: string
): Promise<string> {
  if (!ruleSettings.fileOutput.enabled) {
    throw new Error('File output is not enabled');
  }

  const outputDir = path.join(workspaceRoot, ruleSettings.fileOutput.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  // Generate output file name
  const originalFileName = path.basename(result.fileName, path.extname(result.fileName));
  const outputFileName = ruleSettings.fileOutput.outputFileName.replace(
    '{originalFileName}',
    originalFileName
  );

  const outputPath = path.join(outputDir, outputFileName);

  // Format and save
  const content = formatReviewResult(result, template);
  await fs.writeFile(outputPath, content, 'utf-8');

  return outputPath;
}

/**
 * Formats multiple review results
 */
export function formatMultipleReviewResults(results: ReviewResult[], template?: string): string {
  let output = '# Code Review Report\n\n';
  output += `## Summary\n`;
  output += `- Total files reviewed: ${results.length}\n`;
  output += `- Total issues found: ${results.reduce((sum, r) => sum + r.totalIssues, 0)}\n\n`;
  output += '---\n\n';

  for (const result of results) {
    output += formatReviewResult(result, template);
    output += '\n---\n\n';
  }

  return output;
}

/**
 * Saves multiple review results to separate files
 */
export async function saveMultipleReviewResults(
  results: ReviewResult[],
  ruleSettings: RuleSettings,
  workspaceRoot: string,
  template?: string
): Promise<string[]> {
  const outputPaths: string[] = [];

  for (const result of results) {
    const outputPath = await saveReviewResult(result, ruleSettings, workspaceRoot, template);
    outputPaths.push(outputPath);
  }

  return outputPaths;
}

/**
 * Formats review result for chat display
 */
export function formatForChat(result: ReviewResult): string {
  let output = `**Review completed for ${result.fileName}**\n\n`;

  if (result.totalIssues === 0) {
    output += '✅ No issues found!\n';
    return output;
  }

  output += `Found ${result.totalIssues} issue(s):\n\n`;

  for (const chapter of result.chapterResults) {
    if (chapter.issues.length === 0) {
      continue;
    }

    output += `**${chapter.chapterTitle}** (${chapter.issues.length} issue(s))\n`;

    for (const issue of chapter.issues.slice(0, 3)) {
      // Show first 3 issues
      output += `- Line ${issue.lineNumber}: ${issue.reason}\n`;
    }

    if (chapter.issues.length > 3) {
      output += `- ... and ${chapter.issues.length - 3} more issue(s)\n`;
    }

    output += '\n';
  }

  return output;
}
