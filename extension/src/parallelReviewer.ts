import * as vscode from 'vscode';
import {
  CodeToReview,
  RuleChapter,
  ReviewResult,
  ChapterReviewResult,
  RuleReviewResult,
  ReviewIteration,
  FalsePositiveCheck,
  ReviewIssue,
  RuleSettings,
  ProgressInfo
} from './types';
import {
  performReviewIteration,
  checkFalsePositive,
  aggregateReviewIterations,
  filterFalsePositives
} from './reviewEngine';
import {
  getChapterReviewIterations,
  getChapterFalsePositiveIterations
} from './ruleParser';
import { ConcurrencyQueue } from './concurrencyQueue';

/**
 * Reviews code with parallel processing
 */
export async function reviewCodeParallel(
  code: CodeToReview,
  chapters: RuleChapter[],
  ruleSettings: RuleSettings,
  rulesetName: string,
  systemPrompt: string,
  commonPrompt: string,
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  model: vscode.LanguageModelChat,
  queue: ConcurrencyQueue,
  issueDetectionThreshold: number = 0.5,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ReviewResult> {
  const chapterResults: ChapterReviewResult[] = [];
  const totalChapters = chapters.length;
  let completedChapters = 0;

  // Show initial progress
  if (progressCallback) {
    progressCallback({
      current: 0,
      total: totalChapters,
      message: `[${rulesetName}] ${code.fileName} - Processing ${totalChapters} chapters in parallel...`
    });
  }

  // Process all chapters in parallel with progress tracking
  const chapterPromises = chapters.map(async (chapter, index) => {
    const result = await reviewChapter(
      code,
      chapter,
      ruleSettings,
      systemPrompt,
      commonPrompt,
      reviewPromptTemplate,
      falsePositivePromptTemplate,
      model,
      queue,
      issueDetectionThreshold,
      undefined  // Don't pass progressCallback to individual iterations
    );

    // Update progress when each chapter completes
    completedChapters++;
    if (progressCallback) {
      progressCallback({
        current: completedChapters,
        total: totalChapters,
        message: `[${rulesetName}] ${code.fileName} - Chapter ${chapter.id}: ${chapter.title} (${completedChapters}/${totalChapters})`
      });
    }

    return result;
  });

  const results = await Promise.all(chapterPromises);
  chapterResults.push(...results);

  // Calculate totals
  const totalIssues = chapterResults.reduce((sum, result) => sum + result.issues.length, 0);
  const reviewedChapters = chapterResults.map(result => result.chapterTitle);

  return {
    fileName: code.fileName,
    filePath: code.filePath,
    rulesetName,
    diffDetails: code.diffRange,
    chapterResults,
    totalIssues,
    reviewedChapters
  };
}

/**
 * Reviews a single chapter with multiple iterations and false positive checks
 */
async function reviewChapter(
  code: CodeToReview,
  chapter: RuleChapter,
  ruleSettings: RuleSettings,
  systemPrompt: string,
  commonPrompt: string,
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  model: vscode.LanguageModelChat,
  queue: ConcurrencyQueue,
  issueDetectionThreshold: number = 0.5,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ChapterReviewResult> {
  // Get iteration counts for this chapter
  const reviewIterations = getChapterReviewIterations(chapter.id, ruleSettings.reviewIterations);
  const falsePositiveIterations = getChapterFalsePositiveIterations(
    chapter.id,
    ruleSettings.falsePositiveCheckIterations
  );

  // Perform multiple review iterations in parallel
  const iterationPromises: Promise<ReviewIteration>[] = [];
  for (let i = 1; i <= reviewIterations; i++) {
    iterationPromises.push(
      performReviewIteration(
        code,
        chapter,
        systemPrompt,
        commonPrompt,
        reviewPromptTemplate,
        i,
        model,
        queue,
        progressCallback
      )
    );
  }

  const iterations = await Promise.all(iterationPromises);

  // Aggregate results from multiple iterations
  let issues = aggregateReviewIterations(iterations, issueDetectionThreshold);

  // Perform false positive checks in parallel
  if (falsePositiveIterations > 0 && issues.length > 0) {
    const falsePositiveChecks: FalsePositiveCheck[] = [];

    for (let issueIndex = 0; issueIndex < issues.length; issueIndex++) {
      const issue = issues[issueIndex];

      // Perform multiple false positive checks in parallel for each issue
      const checkPromises: Promise<FalsePositiveCheck>[] = [];
      for (let i = 0; i < falsePositiveIterations; i++) {
        checkPromises.push(
          checkFalsePositive(code, issue, chapter, systemPrompt, falsePositivePromptTemplate, model, queue).then(
            (check) => ({ ...check, issueIndex })
          )
        );
      }

      const checks = await Promise.all(checkPromises);
      falsePositiveChecks.push(...checks);
    }

    // Filter out false positives
    issues = filterFalsePositives(issues, falsePositiveChecks);
  }

  // Group issues by rule ID
  const ruleResults = groupIssuesByRule(issues, chapter);

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    ruleResults,
    issues,  // Keep for backward compatibility
    reviewIterations
  };
}

/**
 * Groups issues by rule ID to create hierarchical structure
 */
function groupIssuesByRule(issues: ReviewIssue[], chapter: RuleChapter): RuleReviewResult[] {
  const ruleMap = new Map<string, RuleReviewResult>();

  // Initialize all rules from the chapter
  for (const rule of chapter.rules) {
    ruleMap.set(rule.id, {
      ruleId: rule.id,
      ruleTitle: rule.title,
      level: rule.level,
      issues: []
    });
  }

  // Group issues by ruleId
  for (const issue of issues) {
    const ruleId = issue.ruleId;

    if (!ruleMap.has(ruleId)) {
      // Create entry for rules not in the chapter metadata (fallback)
      ruleMap.set(ruleId, {
        ruleId: ruleId,
        ruleTitle: issue.ruleTitle,
        level: 3, // Default to level 3 (###)
        issues: []
      });
    }

    ruleMap.get(ruleId)!.issues.push(issue);
  }

  // Convert map to array and return only rules with issues (or all rules if showRulesWithNoIssues is true)
  return Array.from(ruleMap.values());
}

/**
 * Reviews multiple files in parallel
 */
export async function reviewMultipleFiles(
  files: CodeToReview[],
  chapters: RuleChapter[],
  ruleSettings: RuleSettings,
  rulesetName: string,
  systemPrompt: string,
  commonPrompt: string,
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  model: vscode.LanguageModelChat,
  queue: ConcurrencyQueue,
  issueDetectionThreshold: number = 0.5,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ReviewResult[]> {
  // Process all files in parallel (queue will handle concurrency limits)
  const filePromises = files.map((file) =>
    reviewCodeParallel(
      file,
      chapters,
      ruleSettings,
      rulesetName,
      systemPrompt,
      commonPrompt,
      reviewPromptTemplate,
      falsePositivePromptTemplate,
      model,
      queue,
      issueDetectionThreshold,
      progressCallback
    )
  );

  const results = await Promise.all(filePromises);
  return results;
}
