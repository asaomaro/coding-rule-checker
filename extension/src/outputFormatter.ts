import * as fs from 'fs/promises';
import * as path from 'path';
import { ReviewResult, Settings } from './types';

/**
 * Extracts a template section from the template content
 */
function extractTemplateSection(template: string, startMarker: string, endMarker: string): string {
  const startIndex = template.indexOf(startMarker);
  const endIndex = template.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    return '';
  }

  return template.substring(startIndex + startMarker.length, endIndex).trim();
}

/**
 * Indents multi-line text to match the placeholder's indentation level
 */
function indentMultilineText(text: string, template: string, placeholder: string): string {
  // Find the placeholder in the template to get its indentation
  const lines = template.split('\n');
  let indentSpaces = 0;

  for (const line of lines) {
    const placeholderIndex = line.indexOf(placeholder);
    if (placeholderIndex !== -1) {
      // Count leading spaces before the placeholder
      const beforePlaceholder = line.substring(0, placeholderIndex);
      const match = beforePlaceholder.match(/^(\s*)/);
      if (match) {
        indentSpaces = match[1].length;
      }
      break;
    }
  }

  // Apply indentation to each line of the text (except the first line)
  const textLines = text.split('\n');
  if (textLines.length === 1) {
    return text;
  }

  const indent = ' '.repeat(indentSpaces);
  return textLines.map((line, index) => {
    if (index === 0) {
      return line;
    }
    return indent + line;
  }).join('\n');
}

/**
 * Formats unified review results using a template
 */
export function formatUnifiedReviewResults(results: ReviewResult[], template: string): string {
  if (results.length === 0) {
    return template;
  }

  const firstResult = results[0];
  let output = template;

  // Replace file-level placeholders
  output = output.replace(/{fileName}/g, firstResult.fileName);
  output = output.replace(/{filePath}/g, firstResult.filePath);
  output = output.replace(/{diffDetails}/g, firstResult.diffDetails || '');

  // Calculate total issues
  const totalIssuesAll = results.reduce((sum, r) => sum + r.totalIssues, 0);
  output = output.replace(/{totalIssues}/g, totalIssuesAll.toString());

  // Extract templates
  const rulesetTemplate = extractTemplateSection(
    template,
    '<!-- RULESET_SECTION_START -->',
    '<!-- RULESET_SECTION_END -->'
  );

  const chapterTemplate = extractTemplateSection(
    rulesetTemplate,
    '<!-- CHAPTER_SECTION_START -->',
    '<!-- CHAPTER_SECTION_END -->'
  );

  const issueTemplate = extractTemplateSection(
    chapterTemplate,
    '<!-- ISSUE_START -->',
    '<!-- ISSUE_END -->'
  );

  // Build ruleset sections
  let rulesetSections = '';

  for (const result of results) {
    let currentRulesetSection = rulesetTemplate;

    // Replace ruleset-level placeholders
    currentRulesetSection = currentRulesetSection.replace(/{rulesetName}/g, result.rulesetName);
    currentRulesetSection = currentRulesetSection.replace(/{issueCount}/g, result.totalIssues.toString());
    currentRulesetSection = currentRulesetSection.replace(/{reviewedChapters}/g, result.reviewedChapters.join(', '));

    // Build chapter sections
    let chapterSections = '';

    for (const chapter of result.chapterResults) {
      if (chapter.issues.length === 0) continue;

      let currentChapterSection = chapterTemplate;

      // Replace chapter-level placeholders
      currentChapterSection = currentChapterSection.replace(/{chapterId}/g, chapter.chapterId);
      currentChapterSection = currentChapterSection.replace(/{chapterTitle}/g, chapter.chapterTitle);

      // Build issue sections
      let issueSections = '';

      for (let i = 0; i < chapter.issues.length; i++) {
        const issue = chapter.issues[i];
        let currentIssueSection = issueTemplate;

        // Replace issue-level placeholders
        currentIssueSection = currentIssueSection.replace(/{issueNumber}/g, (i + 1).toString());
        currentIssueSection = currentIssueSection.replace(/{lineNumber}/g, issue.lineNumber.toString());
        currentIssueSection = currentIssueSection.replace(/{language}/g, 'text'); // Default, can be enhanced
        currentIssueSection = currentIssueSection.replace(/{detectionCount}/g, (issue.detectionCount || 0).toString());
        currentIssueSection = currentIssueSection.replace(/{totalIterations}/g, (issue.totalIterations || 1).toString());

        // Apply indentation to multi-line code snippets
        const indentedCodeSnippet = indentMultilineText(issue.codeSnippet, currentIssueSection, '{codeSnippet}');
        const indentedFixedCode = indentMultilineText(issue.fixedCode || issue.codeSnippet, currentIssueSection, '{fixedCode}');

        currentIssueSection = currentIssueSection.replace(/{codeSnippet}/g, indentedCodeSnippet);
        currentIssueSection = currentIssueSection.replace(/{reason}/g, issue.reason);
        currentIssueSection = currentIssueSection.replace(/{suggestion}/g, issue.suggestion);
        currentIssueSection = currentIssueSection.replace(/{fixedCode}/g, indentedFixedCode);

        issueSections += currentIssueSection + '\n';
      }

      // Replace issue sections in chapter template
      currentChapterSection = currentChapterSection.replace(
        /<!-- ISSUE_START -->[\s\S]*?<!-- ISSUE_END -->/,
        issueSections.trim()
      );

      chapterSections += currentChapterSection + '\n';
    }

    // Replace chapter sections in ruleset template
    currentRulesetSection = currentRulesetSection.replace(
      /<!-- CHAPTER_SECTION_START -->[\s\S]*?<!-- CHAPTER_SECTION_END -->/,
      chapterSections.trim()
    );

    rulesetSections += currentRulesetSection + '\n';
  }

  // Replace {rulesetResults} in main template
  output = output.replace(/{rulesetResults}/g, rulesetSections.trim());

  // Remove template sections (these are only for defining the format)
  output = output.replace(/<!-- RULESET_SECTION_START -->[\s\S]*<!-- RULESET_SECTION_END -->/g, '');

  return output;
}

/**
 * Saves unified review results to a file
 */
export async function saveUnifiedReviewResults(
  results: ReviewResult[],
  settings: Settings,
  workspaceRoot: string,
  template: string
): Promise<string> {
  if (results.length === 0) {
    throw new Error('No review results to save');
  }

  if (!settings.fileOutput.enabled) {
    throw new Error('File output is not enabled');
  }

  const outputDir = path.join(workspaceRoot, settings.fileOutput.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  // Generate output file name
  const firstResult = results[0];
  const originalFileName = path.basename(firstResult.fileName, path.extname(firstResult.fileName));
  const outputFileName = settings.fileOutput.outputFileName.replace(
    '{originalFileName}',
    originalFileName
  );

  const outputPath = path.join(outputDir, outputFileName);

  // Format and save
  const content = formatUnifiedReviewResults(results, template);
  await fs.writeFile(outputPath, content, 'utf-8');

  return outputPath;
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
      const detectionInfo = issue.detectionCount && issue.totalIterations
        ? ` [${issue.detectionCount}/${issue.totalIterations}]`
        : '';
      output += `- Line ${issue.lineNumber}${detectionInfo}: ${issue.reason}\n`;
    }

    if (chapter.issues.length > 3) {
      output += `- ... and ${chapter.issues.length - 3} more issue(s)\n`;
    }

    output += '\n';
  }

  return output;
}
