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
  systemPrompt: string,
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  model: vscode.LanguageModelChat,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ReviewResult> {
  const chapterResults: ChapterReviewResult[] = [];

  // Process all chapters in parallel
  const chapterPromises = chapters.map(async (chapter) => {
    return await reviewChapter(
      code,
      chapter,
      ruleSettings,
      systemPrompt,
      reviewPromptTemplate,
      falsePositivePromptTemplate,
      model,
      progressCallback
    );
  });

  const results = await Promise.all(chapterPromises);
  chapterResults.push(...results);

  // Calculate totals
  const totalIssues = chapterResults.reduce((sum, result) => sum + result.issues.length, 0);
  const reviewedChapters = chapterResults.map(result => result.chapterTitle);

  return {
    fileName: code.fileName,
    filePath: code.filePath,
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
        i,
        model,
        progressCallback
      )
    );
  }

  const iterations = await Promise.all(iterationPromises);

  // Aggregate results from multiple iterations
  let issues = aggregateReviewIterations(iterations);

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
  systemPrompt: string,
  reviewPromptTemplate: string,
  falsePositivePromptTemplate: string,
  model: vscode.LanguageModelChat,
  progressCallback?: (progress: ProgressInfo) => void
): Promise<ReviewResult[]> {
  const results: ReviewResult[] = [];

  // Process files in parallel (with a limit to avoid overwhelming the API)
  const CONCURRENT_LIMIT = 3;
  for (let i = 0; i < files.length; i += CONCURRENT_LIMIT) {
    const batch = files.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map((file) =>
      reviewCodeParallel(
        file,
        chapters,
        ruleSettings,
        systemPrompt,
        reviewPromptTemplate,
        falsePositivePromptTemplate,
        model,
        progressCallback
      )
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
