/**
 * Main settings configuration
 */
export interface Settings {
  model?: string;
  systemPromptPath: string;
  summaryPromptPath: string;
  ruleset: string | Record<string, string[]>; // Single ruleset name OR ruleset-to-file-patterns mapping
  rulesets?: Record<string, string[]>; // @deprecated: Use RuleSettings.chapterFilePatterns instead
  templatesPath: string;
  showRulesWithNoIssues?: boolean;
  maxConcurrentReviews?: number;
  outputFormat?: 'normal' | 'table'; // Output format: 'normal' (default) or 'table'
  issueDetectionThreshold?: number; // Threshold for issue detection (0.00-1.00). 0=all iterations, 1=at least once, 0.5=majority (default: 0.5)
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
  commonPromptPath?: string;
  reviewIterations: {
    default: number;
    chapter?: Record<string, number>;
  };
  falsePositiveCheckIterations: {
    default: number;
    chapter?: Record<string, number>;
  };
  chapterFilePatterns?: Record<string, string[]>; // Chapter ID to file patterns mapping (e.g., "1": ["*.component.ts"])
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
  fixedCodeSnippet?: string;
  detectionCount?: number; // Number of times this issue was detected across iterations
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
 * Review result for a single rule (### or ####)
 */
export interface RuleReviewResult {
  ruleId: string;
  ruleTitle: string;
  level: number; // 3 for ###, 4 for ####
  issues: ReviewIssue[];
}

/**
 * Review result for a single chapter
 */
export interface ChapterReviewResult {
  chapterId: string;
  chapterTitle: string;
  ruleResults: RuleReviewResult[];
  issues: ReviewIssue[]; // Deprecated: kept for backward compatibility, use ruleResults instead
  reviewIterations?: number; // Number of review iterations performed for this chapter
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
  filesOrUrls: string[];  // Multiple files or URLs
  reviewType: 'all' | 'diff';
  diffRange?: string;
  rulesetOverride?: string[];  // Override rulesets specified by --ruleset flag
}
