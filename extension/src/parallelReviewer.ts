import * as vscode from 'vscode';
import {
  CodeToReview,
  RuleChapter,
  ReviewResult,
  ChapterReviewResult,
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

/**
 * Reviews code with parallel processing
 */
export async function reviewCodeParallel(
  code: CodeToReview,
  chapters: RuleChapter[],
  ruleSettings: RuleSettings,
  rulesetName: string,
  systemPrompt: string,
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  commonInstructions: string,
  model: vscode.LanguageModelChat,
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
      message: `[${code.fileName}] [${rulesetName}] Processing ${totalChapters} chapters in parallel...`
    });
  }

  // Process all chapters in parallel with progress tracking
  const chapterPromises = chapters.map(async (chapter, index) => {
    // Show chapter start progress
    if (progressCallback) {
      progressCallback({
        current: completedChapters,
        total: totalChapters,
        message: `[${code.fileName}] [${rulesetName}] Chapter ${chapter.id}: ${chapter.title} - Starting...`
      });
    }

    const result = await reviewChapter(
      code,
      chapter,
      ruleSettings,
      systemPrompt,
      reviewPromptTemplate,
      falsePositivePromptTemplate,
      commonInstructions,
      model,
      undefined  // Don't pass progressCallback to individual iterations
    );

    // Update progress when each chapter completes
    completedChapters++;
    if (progressCallback) {
      progressCallback({
        current: completedChapters,
        total: totalChapters,
        message: `[${code.fileName}] [${rulesetName}] Chapter ${chapter.id}: ${chapter.title} - Completed (${completedChapters}/${totalChapters})`
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
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  commonInstructions: string,
  model: vscode.LanguageModelChat,
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
        reviewPromptTemplate,
        commonInstructions,
        i,
        model,
        progressCallback
      )
    );
  }

  const iterations = await Promise.all(iterationPromises);

  // Aggregate results from multiple iterations
  const aggregationThreshold = ruleSettings.aggregationThreshold !== undefined
    ? ruleSettings.aggregationThreshold
    : 0.5;  // Default: majority (50%)
  let issues = aggregateReviewIterations(iterations, aggregationThreshold);

  // Perform false positive checks in parallel
  if (falsePositiveIterations > 0 && issues.length > 0) {
    const falsePositiveChecks: FalsePositiveCheck[] = [];

    for (let issueIndex = 0; issueIndex < issues.length; issueIndex++) {
      const issue = issues[issueIndex];

      // Perform multiple false positive checks in parallel for each issue
      const checkPromises: Promise<FalsePositiveCheck>[] = [];
      for (let i = 0; i < falsePositiveIterations; i++) {
        checkPromises.push(
          checkFalsePositive(code, issue, chapter, falsePositivePromptTemplate, model).then(
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

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    issues
  };
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
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  commonInstructions: string,
  model: vscode.LanguageModelChat,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ReviewResult[]> {
  const results: ReviewResult[] = [];

  // Process files in parallel (with a limit to avoid overwhelming the API)
  const CONCURRENT_LIMIT = 3;
  for (let i = 0; i < files.length; i += CONCURRENT_LIMIT) {
    const batch = files.slice(i, i + CONCURRENT_LIMIT);

    // Show batch progress
    if (progressCallback) {
      const batchNumber = Math.floor(i / CONCURRENT_LIMIT) + 1;
      const totalBatches = Math.ceil(files.length / CONCURRENT_LIMIT);
      const fileNames = batch.map(f => f.fileName).join(', ');
      progressCallback({
        current: i,
        total: files.length,
        message: `Processing batch ${batchNumber}/${totalBatches} - Files: ${fileNames}`
      });
    }

    const batchPromises = batch.map((file) =>
      reviewCodeParallel(
        file,
        chapters,
        ruleSettings,
        rulesetName,
        systemPrompt,
        reviewPromptTemplate,
        falsePositivePromptTemplate,
        commonInstructions,
        model,
        progressCallback
      )
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
