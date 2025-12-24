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

      // Build table rows for this chapter
      let tableRows = '';
      const reviewIterations = chapter.reviewIterations || 1;

      for (const ruleResult of chapter.ruleResults) {
        if (!showRulesWithNoIssues && ruleResult.issues.length === 0) continue;

        // Check if this is a chapter-level rule (no ruleTitle)
        const isChapterLevelRule = !ruleResult.ruleTitle || ruleResult.ruleTitle.trim() === '';

        if (ruleResult.issues.length === 0) {
          // No issues - add a row with "No issues found" message (skip for chapter-level rules)
          if (!isChapterLevelRule) {
            let currentRow = tableRowTemplate;
            currentRow = currentRow.replace(/{ruleId}/g, ruleResult.ruleId);
            currentRow = currentRow.replace(/{ruleTitle}/g, ruleResult.ruleTitle);
            currentRow = currentRow.replace(/{lineNumber}/g, '-');
            currentRow = currentRow.replace(/{codeSnippet}/g, '-');
            currentRow = currentRow.replace(/{reason}/g, '✅ No issues found');
            currentRow = currentRow.replace(/{suggestion}/g, '-');
            currentRow = currentRow.replace(/{fixedCodeSnippet}/g, '-');
            currentRow = currentRow.replace(/{reviewIterations}/g, reviewIterations.toString());
            currentRow = currentRow.replace(/{detectionCount}/g, '-');
            currentRow = currentRow.replace(/{detectionRate}/g, '-');
            tableRows += currentRow + '\n';
          }
        } else {
          // Has issues - add rows for each issue

          for (const issue of ruleResult.issues) {
            let currentRow = tableRowTemplate;

            // Escape pipe characters in code snippets and reason/suggestion
            const escapedCodeSnippet = issue.codeSnippet.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const escapedReason = issue.reason.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const escapedSuggestion = issue.suggestion.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const escapedFixedCodeSnippet = (issue.fixedCodeSnippet || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');

            // Calculate detection statistics
            const detectionCount = issue.detectionCount || 1;
            const detectionRate = reviewIterations > 0 ? ((detectionCount / reviewIterations) * 100).toFixed(1) : '0.0';

            currentRow = currentRow.replace(/{ruleId}/g, isChapterLevelRule ? '-' : ruleResult.ruleId);
            currentRow = currentRow.replace(/{ruleTitle}/g, isChapterLevelRule ? '-' : ruleResult.ruleTitle);
            currentRow = currentRow.replace(/{lineNumber}/g, issue.lineNumber.toString());
            currentRow = currentRow.replace(/{codeSnippet}/g, escapedCodeSnippet);
            currentRow = currentRow.replace(/{reason}/g, escapedReason);
            currentRow = currentRow.replace(/{suggestion}/g, escapedSuggestion);
            currentRow = currentRow.replace(/{fixedCodeSnippet}/g, escapedFixedCodeSnippet);
            currentRow = currentRow.replace(/{reviewIterations}/g, reviewIterations.toString());
            currentRow = currentRow.replace(/{detectionCount}/g, detectionCount.toString());
            currentRow = currentRow.replace(/{detectionRate}/g, detectionRate);

            tableRows += currentRow + '\n';
          }
        }
      }

      // Create chapter section
      let currentChapterSection = tableChapterTemplate;

      // Replace chapter-level placeholders
      currentChapterSection = currentChapterSection.replace(/{chapterId}/g, chapter.chapterId);
      currentChapterSection = currentChapterSection.replace(/{chapterTitle}/g, chapter.chapterTitle);

      // Replace review statistics placeholders (reviewIterations already defined above)
      const ngCount = chapter.ruleResults.reduce((sum, rule) => sum + rule.issues.length, 0);
      const ngRate = reviewIterations > 0 ? (ngCount / reviewIterations).toFixed(2) : '0.00';

      currentChapterSection = currentChapterSection.replace(/{reviewIterations}/g, reviewIterations.toString());
      currentChapterSection = currentChapterSection.replace(/{ngCount}/g, ngCount.toString());
      currentChapterSection = currentChapterSection.replace(/{ngRate}/g, ngRate);

      if (chapter.ruleResults.length === 0) {
        // Chapter has no rules at all - display message
        currentChapterSection = currentChapterSection.replace(
          /<!-- TABLE_HEADER_START -->[\s\S]*?<!-- TABLE_ROW_END -->\n*/,
          '\n✅ No rules defined for this chapter\n'
        );
      } else if (tableRows.trim()) {
        // Replace table content in chapter template
        currentChapterSection = currentChapterSection.replace(
          /<!-- TABLE_HEADER_START -->[\s\S]*?<!-- TABLE_HEADER_END -->/,
          tableHeaderTemplate
        );

        currentChapterSection = currentChapterSection.replace(
          /<!-- TABLE_ROW_START -->[\s\S]*?<!-- TABLE_ROW_END -->/,
          tableRows.trim() + '\n'  // Keep one blank line after table
        );
      } else {
        // No table rows (all rules had no issues) - display "No issues found"
        currentChapterSection = currentChapterSection.replace(
          /<!-- TABLE_HEADER_START -->[\s\S]*?<!-- TABLE_ROW_END -->\n*/,
          '\n✅ No issues found\n'
        );
      }

      chapterSections += currentChapterSection + '\n';
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

  // Remove template sections (both table and normal format templates) including surrounding blank lines
  output = output.replace(/\n*<!-- TABLE_RULESET_SECTION_START -->[\s\S]*?<!-- TABLE_RULESET_SECTION_END -->\n*/g, '');
  output = output.replace(/\n*<!-- RULESET_SECTION_START -->[\s\S]*?<!-- RULESET_SECTION_END -->\n*/g, '');

  // Final cleanup: mechanically normalize all blank lines and headers
  // Step 1: First, remove ALL blank lines (reduce any 2+ newlines to single newline)
  output = output.replace(/(\r?\n){2,}/g, '\n');

  // Step 2: Ensure blank line before header lines (# lines)
  output = output.replace(/([^\r\n])(\r?\n)(#{1,6} )/g, '$1\n\n$3');

  // Step 3: Ensure blank line after header lines
  output = output.replace(/(#{1,6} [^\r\n]+)(\r?\n)([^\r\n#])/g, '$1\n\n$3');

  // Step 4: Ensure blank line before horizontal rules (---)
  output = output.replace(/([^\r\n])(\r?\n)(---)/g, '$1\n\n$3');

  // Step 5: Ensure blank line after horizontal rules (---)
  output = output.replace(/(---)(\r?\n)([^\r\n-])/g, '$1\n\n$3');

  // Step 6: Remove all occurrences of 3+ consecutive newlines (in case steps 2-5 created them)
  output = output.replace(/(\r?\n){3,}/g, '\n\n');

  // Step 7: Remove ALL trailing whitespace and newlines at end of file, then add single newline
  output = output.replace(/[\r\n\s]+$/g, '');
  output = output + '\n';

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

  const chapterLevelIssueTemplate = extractTemplateSection(
    chapterTemplate,
    '<!-- CHAPTER_LEVEL_ISSUE_START -->',
    '<!-- CHAPTER_LEVEL_ISSUE_END -->'
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

      let currentChapterSection = chapterTemplate;

      // Replace chapter-level placeholders
      currentChapterSection = currentChapterSection.replace(/{chapterId}/g, chapter.chapterId);
      currentChapterSection = currentChapterSection.replace(/{chapterTitle}/g, chapter.chapterTitle);

      // Replace review statistics placeholders
      const reviewIterations = chapter.reviewIterations || 1;
      const ngCount = chapter.ruleResults.reduce((sum, rule) => sum + rule.issues.length, 0);
      const ngRate = reviewIterations > 0 ? (ngCount / reviewIterations).toFixed(2) : '0.00';

      currentChapterSection = currentChapterSection.replace(/{reviewIterations}/g, reviewIterations.toString());
      currentChapterSection = currentChapterSection.replace(/{ngCount}/g, ngCount.toString());
      currentChapterSection = currentChapterSection.replace(/{ngRate}/g, ngRate);

      // Build rule sections and chapter-level issues
      let ruleSections = '';
      let chapterLevelIssueSections = '';

      for (const ruleResult of chapter.ruleResults) {
        if (!showRulesWithNoIssues && ruleResult.issues.length === 0) continue;

        // Check if this is a chapter-level rule (no ruleTitle)
        const isChapterLevelRule = !ruleResult.ruleTitle || ruleResult.ruleTitle.trim() === '';

        // Determine rule header based on level (+1 to shift hierarchy: ### becomes ####, #### becomes #####)
        const ruleHeader = '#'.repeat(ruleResult.level + 1);

        if (ruleResult.issues.length === 0) {
          // No issues - use the NO_ISSUES template (only for non-chapter-level rules)
          if (!isChapterLevelRule) {
            let currentRuleSection = noIssuesRuleTemplate;
            currentRuleSection = currentRuleSection.replace(/{ruleHeader}/g, ruleHeader);
            currentRuleSection = currentRuleSection.replace(/{ruleId}/g, ruleResult.ruleId);
            currentRuleSection = currentRuleSection.replace(/{ruleTitle}/g, ruleResult.ruleTitle);
            ruleSections += currentRuleSection + '\n\n';  // Add extra blank line between rules
          }
        } else if (isChapterLevelRule) {
          // Chapter-level rule - use CHAPTER_LEVEL_ISSUE template
          for (let i = 0; i < ruleResult.issues.length; i++) {
            const issue = ruleResult.issues[i];
            let currentIssueSection = chapterLevelIssueTemplate;

            // Replace issue-level placeholders with indentation awareness for multi-line values
            currentIssueSection = currentIssueSection.replace(/{issueNumber}/g, (i + 1).toString());
            currentIssueSection = currentIssueSection.replace(/{lineNumber}/g, issue.lineNumber.toString());
            currentIssueSection = currentIssueSection.replace(/{language}/g, 'text'); // Default, can be enhanced
            currentIssueSection = replaceWithIndent(currentIssueSection, '{codeSnippet}', issue.codeSnippet);
            currentIssueSection = replaceWithIndent(currentIssueSection, '{reason}', issue.reason);
            currentIssueSection = replaceWithIndent(currentIssueSection, '{suggestion}', issue.suggestion);
            currentIssueSection = replaceWithIndent(currentIssueSection, '{fixedCodeSnippet}', issue.fixedCodeSnippet || '');

            // Replace detection statistics placeholders
            const detectionCount = issue.detectionCount || 1;
            const detectionRate = reviewIterations > 0 ? ((detectionCount / reviewIterations) * 100).toFixed(1) : '0.0';

            currentIssueSection = currentIssueSection.replace(/{reviewIterations}/g, reviewIterations.toString());
            currentIssueSection = currentIssueSection.replace(/{detectionCount}/g, detectionCount.toString());
            currentIssueSection = currentIssueSection.replace(/{detectionRate}/g, detectionRate);

            chapterLevelIssueSections += currentIssueSection + '\n';
          }
        } else {
          // Regular rule - use RULE_SECTION template
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

            // Replace detection statistics placeholders
            const detectionCount = issue.detectionCount || 1;
            const detectionRate = reviewIterations > 0 ? ((detectionCount / reviewIterations) * 100).toFixed(1) : '0.0';

            currentIssueSection = currentIssueSection.replace(/{reviewIterations}/g, reviewIterations.toString());
            currentIssueSection = currentIssueSection.replace(/{detectionCount}/g, detectionCount.toString());
            currentIssueSection = currentIssueSection.replace(/{detectionRate}/g, detectionRate);

            issueSections += currentIssueSection + '\n';
          }

          // Replace issue sections in rule template
          currentRuleSection = currentRuleSection.replace(
            /<!-- ISSUE_START -->[\s\S]*?<!-- ISSUE_END -->/,
            issueSections.trim()
          );

          ruleSections += currentRuleSection + '\n\n';  // Add extra blank line between rules
        }
      }

      // Check if chapter has any content to display
      const hasContent = chapterLevelIssueSections.trim() || ruleSections.trim();

      if (chapter.ruleResults.length === 0) {
        // Chapter has no rules at all - display message
        currentChapterSection = currentChapterSection.replace(
          /\n?<!-- CHAPTER_LEVEL_ISSUE_START -->[\s\S]*?<!-- CHAPTER_LEVEL_ISSUE_END -->\n*/g,
          ''
        );
        currentChapterSection = currentChapterSection.replace(
          /\n?<!-- RULE_SECTION_START -->[\s\S]*?<!-- RULE_SECTION_END -->\n*/g,
          '\n✅ No rules defined for this chapter\n'
        );
        currentChapterSection = currentChapterSection.replace(
          /<!-- NO_ISSUES_RULE_SECTION_START -->[\s\S]*?<!-- NO_ISSUES_RULE_SECTION_END -->/g,
          ''
        );
      } else if (!hasContent && !showRulesWithNoIssues) {
        // Chapter has rules but no issues and showRulesWithNoIssues is false
        // Display "No issues found" for this chapter
        currentChapterSection = currentChapterSection.replace(
          /\n?<!-- CHAPTER_LEVEL_ISSUE_START -->[\s\S]*?<!-- CHAPTER_LEVEL_ISSUE_END -->\n*/g,
          ''
        );
        currentChapterSection = currentChapterSection.replace(
          /\n?<!-- RULE_SECTION_START -->[\s\S]*?<!-- RULE_SECTION_END -->\n*/g,
          '\n✅ No issues found\n'
        );
        currentChapterSection = currentChapterSection.replace(
          /<!-- NO_ISSUES_RULE_SECTION_START -->[\s\S]*?<!-- NO_ISSUES_RULE_SECTION_END -->/g,
          ''
        );
      } else {
        // Chapter has content or showRulesWithNoIssues is true
        // Replace chapter-level issue sections in chapter template
        if (chapterLevelIssueSections.trim()) {
          currentChapterSection = currentChapterSection.replace(
            /<!-- CHAPTER_LEVEL_ISSUE_START -->[\s\S]*?<!-- CHAPTER_LEVEL_ISSUE_END -->/g,
            chapterLevelIssueSections.trim() + '\n'
          );
        } else {
          currentChapterSection = currentChapterSection.replace(
            /\n?<!-- CHAPTER_LEVEL_ISSUE_START -->[\s\S]*?<!-- CHAPTER_LEVEL_ISSUE_END -->\n*/g,
            ''
          );
        }

        // Replace rule sections in chapter template
        if (ruleSections.trim()) {
          currentChapterSection = currentChapterSection.replace(
            /<!-- RULE_SECTION_START -->[\s\S]*?<!-- RULE_SECTION_END -->/g,
            ruleSections.trim()
          );
        } else {
          currentChapterSection = currentChapterSection.replace(
            /\n?<!-- RULE_SECTION_START -->[\s\S]*?<!-- RULE_SECTION_END -->\n*/g,
            ''
          );
        }

        // Remove NO_ISSUES_RULE_SECTION template (already processed above)
        currentChapterSection = currentChapterSection.replace(
          /<!-- NO_ISSUES_RULE_SECTION_START -->[\s\S]*?<!-- NO_ISSUES_RULE_SECTION_END -->/g,
          ''
        );
      }

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

  // Remove template sections (both table and normal format templates) including surrounding blank lines
  output = output.replace(/\n*<!-- RULESET_SECTION_START -->[\s\S]*?<!-- RULESET_SECTION_END -->\n*/g, '');
  output = output.replace(/\n*<!-- TABLE_RULESET_SECTION_START -->[\s\S]*?<!-- TABLE_RULESET_SECTION_END -->\n*/g, '');

  // Final cleanup: mechanically normalize all blank lines and headers
  // Step 1: First, remove ALL blank lines (reduce any 2+ newlines to single newline)
  output = output.replace(/(\r?\n){2,}/g, '\n');

  // Step 2: Ensure blank line before header lines (# lines)
  output = output.replace(/([^\r\n])(\r?\n)(#{1,6} )/g, '$1\n\n$3');

  // Step 3: Ensure blank line after header lines
  output = output.replace(/(#{1,6} [^\r\n]+)(\r?\n)([^\r\n#])/g, '$1\n\n$3');

  // Step 4: Ensure blank line before horizontal rules (---)
  output = output.replace(/([^\r\n])(\r?\n)(---)/g, '$1\n\n$3');

  // Step 5: Ensure blank line after horizontal rules (---)
  output = output.replace(/(---)(\r?\n)([^\r\n-])/g, '$1\n\n$3');

  // Step 6: Remove all occurrences of 3+ consecutive newlines (in case steps 2-5 created them)
  output = output.replace(/(\r?\n){3,}/g, '\n\n');

  // Step 7: Remove ALL trailing whitespace and newlines at end of file, then add single newline
  output = output.replace(/[\r\n\s]+$/g, '');
  output = output + '\n';

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

  const outputDir = path.join(workspaceRoot, settings.fileOutput.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  // Generate output file name
  const firstResult = results[0];
  // Use fileName as-is (already includes extension, e.g., "UserService.java")
  const originalFileName = firstResult.fileName;
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
