import * as fs from 'fs/promises';
import * as path from 'path';
import { ReviewResult, Settings, RuleReviewResult } from './types';

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
 * Replaces a placeholder with indentation-aware multi-line text
 */
function replaceWithIndent(text: string, placeholder: string, replacement: string): string {
  // Handle empty replacement
  if (!replacement) {
    return text.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), '');
  }

  // Find all occurrences of the placeholder and preserve indentation
  const regex = new RegExp(`^([ \\t]*)${placeholder.replace(/[{}]/g, '\\$&')}`, 'gm');

  return text.replace(regex, (match, indent) => {
    // Split replacement into lines and add indent to each line
    const lines = replacement.split('\n');
    return lines.map(line => line ? indent + line : line).join('\n');
  });
}

/**
 * Converts a file path to a clickable Markdown link
 */
function filePathToLink(filePath: string, fileName: string): string {
  // Use file:// protocol for absolute paths
  const fileUri = filePath.startsWith('http') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
  return `[${fileName}](${fileUri})`;
}

/**
 * Formats unified review results using a template (table format)
 */
function formatUnifiedReviewResultsAsTable(results: ReviewResult[], template: string, showRulesWithNoIssues: boolean = false): string {
  if (results.length === 0) {
    return template;
  }

  const firstResult = results[0];
  let output = template;

  // Replace file-level placeholders
  output = output.replace(/{fileName}/g, filePathToLink(firstResult.filePath, firstResult.fileName));
  output = output.replace(/{filePath}/g, firstResult.filePath);
  output = output.replace(/{diffDetails}/g, firstResult.diffDetails || '');

  // Calculate total issues
  const totalIssuesAll = results.reduce((sum, r) => sum + r.totalIssues, 0);
  output = output.replace(/{totalIssues}/g, totalIssuesAll.toString());

  // Extract templates
  const tableRulesetTemplate = extractTemplateSection(
    template,
    '<!-- TABLE_RULESET_SECTION_START -->',
    '<!-- TABLE_RULESET_SECTION_END -->'
  );

  const tableChapterTemplate = extractTemplateSection(
    tableRulesetTemplate,
    '<!-- TABLE_CHAPTER_SECTION_START -->',
    '<!-- TABLE_CHAPTER_SECTION_END -->'
  );

  const tableHeaderTemplate = extractTemplateSection(
    tableChapterTemplate,
    '<!-- TABLE_HEADER_START -->',
    '<!-- TABLE_HEADER_END -->'
  );

  const tableRowTemplate = extractTemplateSection(
    tableChapterTemplate,
    '<!-- TABLE_ROW_START -->',
    '<!-- TABLE_ROW_END -->'
  );

  // Build ruleset sections
  let rulesetSections = '';

  for (const result of results) {
    let currentRulesetSection = tableRulesetTemplate;

    // Replace ruleset-level placeholders
    currentRulesetSection = currentRulesetSection.replace(/{rulesetName}/g, result.rulesetName);
    currentRulesetSection = currentRulesetSection.replace(/{issueCount}/g, result.totalIssues.toString());
    currentRulesetSection = currentRulesetSection.replace(/{reviewedChapters}/g, result.reviewedChapters.join(', '));

    // Build chapter sections
    let chapterSections = '';

    for (const chapter of result.chapterResults) {
      const hasAnyIssues = chapter.ruleResults.some(rule => rule.issues.length > 0);

      // Skip chapter if it has no issues and showRulesWithNoIssues is false
      if (!showRulesWithNoIssues && !hasAnyIssues) continue;

      // Build table rows for this chapter
      let tableRows = '';

      for (const ruleResult of chapter.ruleResults) {
        if (!showRulesWithNoIssues && ruleResult.issues.length === 0) continue;

        if (ruleResult.issues.length === 0) {
          // No issues - add a row with "No issues found" message
          let currentRow = tableRowTemplate;
          currentRow = currentRow.replace(/{ruleId}/g, ruleResult.ruleId);
          currentRow = currentRow.replace(/{ruleTitle}/g, ruleResult.ruleTitle);
          currentRow = currentRow.replace(/{lineNumber}/g, '-');
          currentRow = currentRow.replace(/{codeSnippet}/g, '-');
          currentRow = currentRow.replace(/{reason}/g, '✅ No issues found');
          currentRow = currentRow.replace(/{suggestion}/g, '-');
          currentRow = currentRow.replace(/{fixedCodeSnippet}/g, '-');
          tableRows += currentRow + '\n';
        } else {
          // Has issues - add rows for each issue
          for (const issue of ruleResult.issues) {
            let currentRow = tableRowTemplate;

            // Escape pipe characters in code snippets and reason/suggestion
            const escapedCodeSnippet = issue.codeSnippet.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const escapedReason = issue.reason.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const escapedSuggestion = issue.suggestion.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const escapedFixedCodeSnippet = (issue.fixedCodeSnippet || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');

            currentRow = currentRow.replace(/{ruleId}/g, issue.ruleId);
            currentRow = currentRow.replace(/{ruleTitle}/g, issue.ruleTitle);
            currentRow = currentRow.replace(/{lineNumber}/g, issue.lineNumber.toString());
            currentRow = currentRow.replace(/{codeSnippet}/g, escapedCodeSnippet);
            currentRow = currentRow.replace(/{reason}/g, escapedReason);
            currentRow = currentRow.replace(/{suggestion}/g, escapedSuggestion);
            currentRow = currentRow.replace(/{fixedCodeSnippet}/g, escapedFixedCodeSnippet);

            tableRows += currentRow + '\n';
          }
        }
      }

      // Create chapter section if there are any rows
      if (tableRows.trim()) {
        let currentChapterSection = tableChapterTemplate;

        // Replace chapter-level placeholders
        currentChapterSection = currentChapterSection.replace(/{chapterId}/g, chapter.chapterId);
        currentChapterSection = currentChapterSection.replace(/{chapterTitle}/g, chapter.chapterTitle);

        // Replace table content in chapter template
        currentChapterSection = currentChapterSection.replace(
          /<!-- TABLE_HEADER_START -->[\s\S]*?<!-- TABLE_HEADER_END -->/,
          tableHeaderTemplate
        );

        currentChapterSection = currentChapterSection.replace(
          /<!-- TABLE_ROW_START -->[\s\S]*?<!-- TABLE_ROW_END -->/,
          tableRows.trim()
        );

        chapterSections += currentChapterSection + '\n';
      }
    }

    // Replace chapter sections in ruleset template
    currentRulesetSection = currentRulesetSection.replace(
      /<!-- TABLE_CHAPTER_SECTION_START -->[\s\S]*?<!-- TABLE_CHAPTER_SECTION_END -->/,
      chapterSections.trim()
    );

    rulesetSections += currentRulesetSection + '\n';
  }

  // Replace {rulesetResults} in main template
  output = output.replace(/{rulesetResults}/g, rulesetSections.trim());

  // Remove template sections (both table and normal format templates)
  output = output.replace(/<!-- TABLE_RULESET_SECTION_START -->[\s\S]*?<!-- TABLE_RULESET_SECTION_END -->/g, '');
  output = output.replace(/<!-- RULESET_SECTION_START -->[\s\S]*?<!-- RULESET_SECTION_END -->/g, '');

  return output;
}

/**
 * Formats unified review results using a template
 */
export function formatUnifiedReviewResults(results: ReviewResult[], template: string, showRulesWithNoIssues: boolean = false, outputFormat: 'normal' | 'table' = 'normal'): string {
  // Use table format if requested
  if (outputFormat === 'table') {
    return formatUnifiedReviewResultsAsTable(results, template, showRulesWithNoIssues);
  }

  // Normal format (existing logic)
  if (results.length === 0) {
    return template;
  }

  const firstResult = results[0];
  let output = template;

  // Replace file-level placeholders with clickable links
  output = output.replace(/{fileName}/g, filePathToLink(firstResult.filePath, firstResult.fileName));
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

  const noIssuesChapterTemplate = extractTemplateSection(
    rulesetTemplate,
    '<!-- NO_ISSUES_CHAPTER_SECTION_START -->',
    '<!-- NO_ISSUES_CHAPTER_SECTION_END -->'
  );

  const ruleTemplate = extractTemplateSection(
    chapterTemplate,
    '<!-- RULE_SECTION_START -->',
    '<!-- RULE_SECTION_END -->'
  );

  const noIssuesRuleTemplate = extractTemplateSection(
    chapterTemplate,
    '<!-- NO_ISSUES_RULE_SECTION_START -->',
    '<!-- NO_ISSUES_RULE_SECTION_END -->'
  );

  const issueTemplate = extractTemplateSection(
    ruleTemplate,
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
      const hasAnyIssues = chapter.ruleResults.some(rule => rule.issues.length > 0);

      // Skip chapter if it has no issues and showRulesWithNoIssues is false
      if (!showRulesWithNoIssues && !hasAnyIssues) continue;

      let currentChapterSection = chapterTemplate;

      // Replace chapter-level placeholders
      currentChapterSection = currentChapterSection.replace(/{chapterId}/g, chapter.chapterId);
      currentChapterSection = currentChapterSection.replace(/{chapterTitle}/g, chapter.chapterTitle);

      // Build rule sections
      let ruleSections = '';

      for (const ruleResult of chapter.ruleResults) {
        if (!showRulesWithNoIssues && ruleResult.issues.length === 0) continue;

        // Determine rule header based on level (### for level 3, #### for level 4)
        const ruleHeader = '#'.repeat(ruleResult.level);

        if (ruleResult.issues.length === 0) {
          // No issues - use the NO_ISSUES template
          let currentRuleSection = noIssuesRuleTemplate;
          currentRuleSection = currentRuleSection.replace(/{ruleHeader}/g, ruleHeader);
          currentRuleSection = currentRuleSection.replace(/{ruleId}/g, ruleResult.ruleId);
          currentRuleSection = currentRuleSection.replace(/{ruleTitle}/g, ruleResult.ruleTitle);
          ruleSections += currentRuleSection + '\n';
        } else {
          // Has issues - use the regular template
          let currentRuleSection = ruleTemplate;

          // Replace rule-level placeholders
          currentRuleSection = currentRuleSection.replace(/{ruleHeader}/g, ruleHeader);
          currentRuleSection = currentRuleSection.replace(/{ruleId}/g, ruleResult.ruleId);
          currentRuleSection = currentRuleSection.replace(/{ruleTitle}/g, ruleResult.ruleTitle);

          // Build issue sections
          let issueSections = '';

          for (let i = 0; i < ruleResult.issues.length; i++) {
            const issue = ruleResult.issues[i];
            let currentIssueSection = issueTemplate;

            // Replace issue-level placeholders with indentation awareness for multi-line values
            currentIssueSection = currentIssueSection.replace(/{issueNumber}/g, (i + 1).toString());
            currentIssueSection = currentIssueSection.replace(/{lineNumber}/g, issue.lineNumber.toString());
            currentIssueSection = currentIssueSection.replace(/{language}/g, 'text'); // Default, can be enhanced
            currentIssueSection = replaceWithIndent(currentIssueSection, '{codeSnippet}', issue.codeSnippet);
            currentIssueSection = replaceWithIndent(currentIssueSection, '{reason}', issue.reason);
            currentIssueSection = replaceWithIndent(currentIssueSection, '{suggestion}', issue.suggestion);
            currentIssueSection = replaceWithIndent(currentIssueSection, '{fixedCodeSnippet}', issue.fixedCodeSnippet || '');

            issueSections += currentIssueSection + '\n';
          }

          // Replace issue sections in rule template
          currentRuleSection = currentRuleSection.replace(
            /<!-- ISSUE_START -->[\s\S]*?<!-- ISSUE_END -->/,
            issueSections.trim()
          );

          ruleSections += currentRuleSection + '\n';
        }
      }

      // Replace rule sections in chapter template
      currentChapterSection = currentChapterSection.replace(
        /<!-- RULE_SECTION_START -->[\s\S]*?<!-- RULE_SECTION_END -->/,
        ruleSections.trim()
      );

      // Remove NO_ISSUES_RULE_SECTION template (already processed above)
      currentChapterSection = currentChapterSection.replace(
        /<!-- NO_ISSUES_RULE_SECTION_START -->[\s\S]*?<!-- NO_ISSUES_RULE_SECTION_END -->/g,
        ''
      );

      chapterSections += currentChapterSection + '\n';
    }

    // Replace chapter sections in ruleset template
    currentRulesetSection = currentRulesetSection.replace(
      /<!-- CHAPTER_SECTION_START -->[\s\S]*?<!-- CHAPTER_SECTION_END -->/,
      chapterSections.trim()
    );

    // Remove NO_ISSUES_CHAPTER_SECTION template (already processed above)
    currentRulesetSection = currentRulesetSection.replace(
      /<!-- NO_ISSUES_CHAPTER_SECTION_START -->[\s\S]*?<!-- NO_ISSUES_CHAPTER_SECTION_END -->/g,
      ''
    );

    rulesetSections += currentRulesetSection + '\n';
  }

  // Replace {rulesetResults} in main template
  output = output.replace(/{rulesetResults}/g, rulesetSections.trim());

  // Remove template sections (both table and normal format templates)
  output = output.replace(/<!-- RULESET_SECTION_START -->[\s\S]*?<!-- RULESET_SECTION_END -->/g, '');
  output = output.replace(/<!-- TABLE_RULESET_SECTION_START -->[\s\S]*?<!-- TABLE_RULESET_SECTION_END -->/g, '');

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
  const showRulesWithNoIssues = settings.showRulesWithNoIssues || false;
  const outputFormat = settings.outputFormat || 'normal';
  const content = formatUnifiedReviewResults(results, template, showRulesWithNoIssues, outputFormat);
  await fs.writeFile(outputPath, content, 'utf-8');

  return outputPath;
}

/**
 * Formats review result for chat display
 */
export function formatForChat(result: ReviewResult, showRulesWithNoIssues: boolean = false): string {
  let output = `**Review completed for ${result.fileName}**\n\n`;

  if (result.totalIssues === 0) {
    output += '✅ No issues found!\n';
    return output;
  }

  output += `Found ${result.totalIssues} issue(s):\n\n`;

  for (const chapter of result.chapterResults) {
    const chapterIssueCount = chapter.ruleResults.reduce((sum, rule) => sum + rule.issues.length, 0);

    if (!showRulesWithNoIssues && chapterIssueCount === 0) {
      continue;
    }

    output += `**${chapter.chapterTitle}** (${chapterIssueCount} issue(s))\n`;

    for (const ruleResult of chapter.ruleResults) {
      if (!showRulesWithNoIssues && ruleResult.issues.length === 0) continue;

      if (ruleResult.issues.length > 0) {
        output += `  **${ruleResult.ruleId} ${ruleResult.ruleTitle}** (${ruleResult.issues.length} issue(s))\n`;

        for (const issue of ruleResult.issues.slice(0, 2)) {
          // Show first 2 issues per rule
          output += `  - Line ${issue.lineNumber}: ${issue.reason}\n`;
        }

        if (ruleResult.issues.length > 2) {
          output += `  - ... and ${ruleResult.issues.length - 2} more issue(s)\n`;
        }
      }
    }

    output += '\n';
  }

  return output;
}
