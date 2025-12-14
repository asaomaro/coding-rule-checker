/**
 * Main settings configuration
 */
export interface Settings {
  model: string;
  systemPromptPath: string;
  summaryPromptPath: string;
  rulesets: Record<string, string[]>;
  templatesPath: string;
  fileOutput: {
    enabled: boolean;
    outputDir: string;
    outputFileName: string;
  };
}

/**
 * Rule settings for each ruleset
 */
export interface RuleSettings {
  rulesPath: string;
  reviewPromptPath?: string;
  falsePositivePromptPath?: string;
  reviewIterations: {
    default: number;
    chapter?: Record<string, number>;
  };
  falsePositiveCheckIterations: {
    default: number;
    chapter?: Record<string, number>;
  };
  chapterFilters?: {
    default?: string[];
    patterns?: Record<string, string[]>;
  };
}

/**
 * Rule chapter structure
 */
export interface RuleChapter {
  id: string;
  title: string;
  rules: Rule[];
  content: string;
}

/**
 * Individual rule
 */
export interface Rule {
  id: string;
  title: string;
  description: string;
  level: number;
}

/**
 * Code to be reviewed
 */
export interface CodeToReview {
  fileName: string;
  filePath: string;
  content: string;
  language: string;
  diffRange?: string;
  isDiff: boolean;
}

/**
 * Diff information
 */
export interface DiffInfo {
  fileName: string;
  filePath: string;
  additions: DiffLine[];
  deletions: DiffLine[];
}

/**
 * Individual diff line
 */
export interface DiffLine {
  lineNumber: number;
  content: string;
}

/**
 * Review issue found during review
 */
export interface ReviewIssue {
  ruleId: string;
  ruleTitle: string;
  lineNumber: number;
  codeSnippet: string;
  reason: string;
  suggestion: string;
  fixedCode?: string;
}

/**
 * Review result for a single iteration
 */
export interface ReviewIteration {
  issues: ReviewIssue[];
  chapterId: string;
  iterationNumber: number;
}

/**
 * False positive check result
 */
export interface FalsePositiveCheck {
  issueIndex: number;
  isFalsePositive: boolean;
  reason: string;
}

/**
 * Aggregated review result
 */
export interface ReviewResult {
  fileName: string;
  filePath: string;
  rulesetName: string;
  diffDetails?: string;
  chapterResults: ChapterReviewResult[];
  totalIssues: number;
  reviewedChapters: string[];
}

/**
 * Review result for a single chapter
 */
export interface ChapterReviewResult {
  chapterId: string;
  chapterTitle: string;
  issues: ReviewIssue[];
}

/**
 * Progress information
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
}

/**
 * Source location (local or GitHub)
 */
export type SourceType = 'local' | 'github';

/**
 * Review request
 */
export interface ReviewRequest {
  sourceType: SourceType;
  fileOrUrl: string;
  reviewType: 'all' | 'diff';
  diffRange?: string;
}
