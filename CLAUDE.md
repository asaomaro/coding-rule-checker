# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coding Rule Checker is a VSCode extension that performs static code analysis based on coding rules written in Markdown format. It integrates with GitHub Copilot Chat to review code against custom rules defined by users.

**Key Features:**
- **Multiple Ruleset Support**: Apply different rulesets to different file types using pattern matching
- **Parallel Processing**: Files, rulesets, chapters, and iterations are all parallelized with configurable concurrency limits
- **Duplicate Removal**: Automatically deduplicates issues with same ruleId + lineNumber
- **Threshold-based Filtering**: Configurable threshold to reduce false positives
- **Flexible Output**: File-based output (always enabled) with hierarchical and table formats; chat shows summary only
- **Chapter Filtering**: Review specific chapters only for matching file patterns
- **GitHub Integration**: Review code from local files, git diffs, or GitHub repositories
- **Rate Limit Handling**: Automatic retry with exponential backoff and configurable retry limits

## Development Commands

### Initial Setup
```bash
cd extension
npm install
```

### Build & Development
```bash
# Compile TypeScript (from extension/ directory)
npm run compile

# Watch mode for development
npm run watch

# Run linter
npm run lint

# Package as VSIX
npm run package
```

### Windows Batch Scripts (from project root)
```bash
# Build VSIX package
build-vsix.bat

# Clean build (removes dist/ and node_modules/)
clean-build.bat

# Watch mode
dev-watch.bat

# Run linter
run-lint.bat
```

### Testing the Extension
1. Open project in VSCode
2. Press `F5` to launch Extension Development Host
3. In the new window, use:
   - `@coding-rule-checker /review #file`
   - `@coding-rule-checker /review #file:UserService.java`
   - `@coding-rule-checker /review --ruleset=typescript-rules #file`

## Architecture

### Core Flow
1. **Chat Participant** (`extension.ts`) - Entry point that handles Copilot Chat commands
2. **Config Manager** (`config.ts`) - Loads settings, rule configurations, and prompt templates
3. **Code Retriever** (`codeRetriever.ts`) - Fetches code from local files, git diffs, or GitHub (via `gh` CLI)
4. **Rule Parser** (`ruleParser.ts`) - Parses Markdown rule files into structured chapters
5. **Parallel Reviewer** (`parallelReviewer.ts`) - Orchestrates parallel review execution
6. **Review Engine** (`reviewEngine.ts`) - Executes reviews using Copilot Language Model
7. **Output Formatter** (`outputFormatter.ts`) - Formats results for chat and files

### Key Architectural Patterns

**Parallel Execution Strategy:**
- **All levels are parallelized**: files, rulesets, chapters, iterations, and false positive checks
- **Concurrency queue**: Global limit controlled by `maxConcurrentReviews` setting
- **Queueing system**: Tasks exceeding the limit are queued and executed when slots become available
- **Parallelization hierarchy** (from highest to lowest):
  1. Files × Rulesets (all combinations run in parallel)
  2. Chapters (within each file×ruleset)
  3. Review iterations (within each chapter)
  4. False positive checks (for each issue)
- **Example**: 3 files × 2 rulesets × 5 chapters × 2 iterations = 60 parallel tasks (limited by maxConcurrentReviews)
- This design significantly reduces total review time while preventing API rate limiting

**Iteration System:**
- Each chapter is reviewed N times (configurable via `reviewIterations`)
- Multiple iterations improve review accuracy
- Results from all iterations are aggregated using a configurable threshold
- **Duplicate Removal**: Issues with the same `ruleId` and `lineNumber` are automatically deduplicated
- **Threshold-based Filtering**: `issueDetectionThreshold` setting controls how many iterations must detect an issue:
  - `0.0`: Issue must appear in ALL iterations (strictest)
  - `0.5`: Issue must appear in majority of iterations (default)
  - `1.0`: Issue must appear at least ONCE (most lenient)
- False positive checks further filter out incorrect detections

**Configuration Hierarchy:**
```
.vscode/coding-rule-checker/
├── settings.json              # Global: model, prompt paths, file extension mappings
├── system-prompt.md           # System-level prompt (used for all LLM calls)
├── review-prompt.md           # Review prompt template
├── false-positive-prompt.md   # False positive check prompt
├── summary-prompt.md          # Summary generation prompt
└── [ruleset-name]/
    ├── rule-settings.json     # Ruleset-specific: iterations, output config, common prompt
    ├── review-results-templates.md
    └── rules/
        ├── 01_rule.md         # Markdown rule files (## for chapters, ### for rules)
        └── 02_rule.md
```

### Review Request Types

**Commands:**
- `/review #file` - Review entire file content (VSCode reference)
- `/review #file:UserService.java` - Review by filename
- `/review #folder` - Review all files in folder
- `/review --ruleset=typescript-rules #file` - Use specific ruleset
- `/diff main..feature` - Review git diff
  - Range examples: `main..feature`, `abc123..def456`, `v1.0.0..v2.0.0`
  - Without file: reviews all changed files in workspace
  - Without range: reviews uncommitted changes

**Multiple Files:**
- `/review #file1 #file2 #file3` - Multiple VSCode references
- `/review #file:User.java #file:Order.java` - Multiple by name
- `/review https://...file1.ts https://...file2.ts` - Multiple GitHub URLs

**Source Detection:**
- Local files: File path provided
- GitHub: URL detected automatically (uses `gh` CLI)
- GitHub supports: commit ranges, PR diffs, branch comparisons

### Type System

All types defined in `types.ts`:
- `Settings` - Global configuration
- `RuleSettings` - Per-ruleset configuration
- `RuleChapter` - Parsed rule structure
- `CodeToReview` - Code content and metadata
- `ReviewResult` - Aggregated review output
- `ReviewIssue` - Individual code violation

### Data Flow for Review

1. **Parse request** → determine source (local/GitHub) and type (all/diff)
2. **Load settings** → get ruleset configuration from `settings.ruleset` (single or multiple rulesets)
3. **Select rulesets for files** → match file patterns to determine which rulesets apply to each file
4. **For each file × ruleset combination** (all combinations processed in parallel):
   - Load rule-settings.json for the ruleset
   - Parse all Markdown files in rules/
   - **Filter chapters** (two-level filtering):
     - Level 1: Chapter-to-file-pattern filter (`chapterFilePatterns` in rule-settings.json)
       - For each chapter:
         - If chapter ID **not in chapterFilePatterns**: Always review
         - If chapter ID **in chapterFilePatterns**: Review only if file matches patterns
     - Level 2: Additional file pattern-based filter (`chapterFilters` in rule-settings.json)
       - Optional: Further filters chapters based on file path patterns
   - **For each filtered chapter in parallel**:
     - Run N review iterations in parallel (N = `reviewIterations` for this chapter)
     - **Aggregate iteration results**:
       - Deduplicate issues by `ruleId` + `lineNumber`
       - Apply `issueDetectionThreshold` to filter issues:
         - Count how many iterations detected each issue
         - Calculate required count based on threshold
         - Keep only issues meeting the threshold
     - Run M false-positive checks in parallel (M = `falsePositiveCheckIterations`)
     - Filter out false positives based on majority vote
5. **Group issues by rule** → create hierarchical structure (chapter → rule → issues)
6. **Format output**:
   - Apply `outputFormat` setting ("normal" or "table")
   - Apply `showRulesWithNoIssues` setting
   - Save to file (always enabled)
   - Display summary in Copilot Chat (detailed results only in files)

## Rule File Format

Rules are written in Markdown with hierarchical structure:

```markdown
## 1. Chapter Title

### 1.1 Rule Title
Description of the rule.

#### 1.1.1 Sub-rule (optional)
More specific guidance.
```

- `##` (H2) = Chapter boundary (reviewed independently)
- `###` (H3) = Individual rule
- `####` (H4) = Sub-rule detail

## Template Variables

The review results template (`.vscode/coding-rule-checker/review-results-template.md`) supports various placeholders that are replaced with actual values during output generation.

### File-Level Variables
- `{fileName}` - File name (clickable link in output)
- `{filePath}` - Full file path
- `{diffDetails}` - Diff range details (e.g., "main..feature")
- `{totalIssues}` - Total number of issues across all rulesets

### Ruleset-Level Variables
- `{rulesetName}` - Name of the ruleset
- `{issueCount}` - Number of issues in this ruleset
- `{reviewedChapters}` - Comma-separated list of reviewed chapter titles

### Chapter-Level Variables
- `{chapterId}` - Chapter ID (e.g., "1", "2")
- `{chapterTitle}` - Chapter title
- `{reviewIterations}` - Number of review iterations performed for this chapter
- `{ngCount}` - Number of issues detected in this chapter
- `{ngRate}` - NG rate (ngCount / reviewIterations)

### Rule-Level Variables
- `{ruleHeader}` - Markdown header level (e.g., "###" or "####")
- `{ruleId}` - Rule ID (e.g., "1.1", "2.3")
- `{ruleTitle}` - Rule title

### Issue-Level Variables
- `{issueNumber}` - Issue number within the rule (1, 2, 3, ...)
- `{lineNumber}` - Line number where the issue was found
- `{language}` - Programming language for syntax highlighting
- `{codeSnippet}` - Code snippet with the issue
- `{reason}` - Explanation of why this is an issue
- `{suggestion}` - Suggested fix
- `{fixedCodeSnippet}` - Fixed code example
- `{detectionCount}` - Number of times this issue was detected across iterations
- `{detectionRate}` - Detection rate as percentage (detectionCount / reviewIterations × 100)

### Usage Example

**Normal Format:**
```markdown
### {chapterId}. {chapterTitle}

#### {ruleId} {ruleTitle}
- NG{issueNumber} : {lineNumber} (検出回数: {detectionCount}/{reviewIterations} ({detectionRate}%))
    - NG理由: {reason}
    - 修正案: {suggestion}
```

**Table Format:**
```markdown
### {chapterId}. {chapterTitle}

| 項番 | 行番号 | NG理由 | 検出回数 |
|------|--------|--------|----------|
| {ruleId} | {lineNumber} | {reason} | {detectionCount}/{reviewIterations} ({detectionRate}%) |
```

## Configuration

### Global Settings (`.vscode/coding-rule-checker/settings.json`)

**Example 1: Single ruleset (simple mode)**
```json
{
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "maxConcurrentReviews": 10,
  "maxRetries": 3,
  "showRulesWithNoIssues": false,
  "ruleset": "typescript-rules",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "fileOutput": {
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  }
}
```

**Example 2: Multiple rulesets with file pattern matching (advanced mode)**
```json
{
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "maxConcurrentReviews": 10,
  "maxRetries": 3,
  "showRulesWithNoIssues": false,
  "ruleset": {
    "common": ["*.java", "*.html"],
    "app-rule": ["common/*.java", "component*.java", "*.sql"],
    "web-rule": ["*.html", "*.css"]
  },
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "fileOutput": {
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  }
}
```

**Key Settings:**
- `maxConcurrentReviews` (optional, default: 10): Maximum number of concurrent LLM requests
  - Controls the global concurrency limit for all parallel review operations
  - Higher values = faster reviews but may hit API rate limits
  - Lower values = slower reviews but more stable
  - Recommended: 5-15 depending on your API plan
- `maxRetries` (optional, default: 3): Maximum number of retries on rate limit errors
  - When a rate limit error occurs, the system will retry the request with exponential backoff (1s, 2s, 4s, 8s...)
  - If retries are exhausted, a special NG issue will be created indicating the retry limit was exceeded
  - Recommended: 3-5 depending on your API rate limits
- `showRulesWithNoIssues` (optional, default: false): Show rule sections with no issues in output
- `outputFormat` (optional, default: "normal"): Output format for review results
  - `"normal"`: Standard hierarchical format with chapters and rules
  - `"table"`: Markdown table format with columns for chapter, line number, code, reason, suggestion, and fix
  - Template customization: Define table format in `review-results-template.md` using `TABLE_RULESET_SECTION`, `TABLE_HEADER`, and `TABLE_ROW` markers
- `issueDetectionThreshold` (optional, default: 0.5): Threshold for detecting issues across multiple review iterations
  - Range: 0.00 to 1.00 (supports up to 2 decimal places)
  - `0.0`: Issue must be detected in ALL iterations (100% - strictest)
  - `0.5`: Issue must be detected in majority of iterations (default)
  - `1.0`: Issue must be detected at least ONCE (most lenient)
  - This setting helps reduce false positives by requiring issues to appear consistently across multiple iterations
- `ruleset` (required): Ruleset configuration
  - **Simple mode (string)**: Single ruleset name (e.g., `"typescript-rules"`)
  - **Advanced mode (object)**: Ruleset-to-file-patterns mapping
    - Key: Ruleset name (e.g., `"common"`, `"app-rule"`)
    - Value: Array of file patterns (glob patterns supported)
    - Files matching multiple patterns will be reviewed by all matching rulesets
    - Example: `"common/*.java"` matches all Java files in the `common` directory

### Ruleset Settings (`.vscode/coding-rule-checker/[ruleset]/rule-settings.json`)
```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "templatesPath": ".vscode/coding-rule-checker/sample-rule/review-results-templates.md",
  "commonPromptPath": ".vscode/coding-rule-checker/sample-rule/rules/01_common.md",
  "reviewIterations": {
    "default": 3,
    "chapter": {
      "01": 5
    }
  },
  "falsePositiveCheckIterations": {
    "default": 2,
    "chapter": {
      "01": 3
    }
  },
  "chapterFilePatterns": {
    "1": ["*.component.ts", "*.service.ts"],
    "3": ["*.test.ts", "*.spec.ts"],
    "5": ["util/**/*.ts"]
  }
}
```

**Key Settings:**
- `commonPromptPath` (optional): Path to a markdown file containing common rules/context to include in all chapter reviews
  - If specified and the file is in the rules directory, it will be excluded from chapter-based reviews
  - Commonly used for general coding standards that apply to all specific rules
  - The content is prepended to each review prompt
- `chapterFilePatterns` (optional): **Chapter ID to file patterns mapping**
  - Key: Chapter ID (e.g., "1", "2", "3")
  - Value: Array of file patterns (glob patterns supported)
  - **Logic**:
    - Chapter **NOT in chapterFilePatterns**: Reviewed for **all files**
    - Chapter **in chapterFilePatterns**: Reviewed only for files matching the patterns
  - **Example**: `"1": ["*.component.ts"]` means Chapter 1 is only reviewed for component files
  - **Patterns**: Support glob patterns (`*.component.ts`, `util/**/*.ts`, etc.)

## Important Implementation Details

### Git Operations
- Local diffs use `git diff` with line numbers
- Only `+` (addition) lines are reviewed in diff mode
- GitHub operations require `gh` CLI to be installed and authenticated

### Language Model Integration
- Uses VSCode's `vscode.lm.selectChatModels()` API
- Model selection based on `settings.model` (family name)
- Each review iteration creates independent context for better accuracy

### Markdown Parsing
- Uses `markdown-it` library for parsing rule files
- Extracts chapter structure via H2 headings
- Preserves full content for context in review prompts

### Error Handling
- Configuration errors reported with helpful messages
- Missing files, invalid JSON, or missing required fields throw descriptive errors
- Rate limit errors: Automatic retry with exponential backoff (1s, 2s, 4s, 8s...)
  - Configurable retry limit via `maxRetries` setting (default: 3)
  - If retry limit exceeded, a special NG issue is created indicating the error
  - Error details saved to review output file

## Requirements

- VSCode 1.85.0+
- GitHub Copilot subscription
- Node.js 20+ (development)
- `gh` CLI (for GitHub integration features)

## Release Notes

### Version 0.1.2 - 2025-01-XX

#### Added
- `maxRetries` setting (default: 3)
  - Configure maximum retry attempts on rate limit errors
  - Retry limit exceeded creates a special NG issue in review output
  - Chat displays retry configuration on startup

#### Changed
- Improved parallel execution control
  - Simplified ConcurrencyQueue to semaphore-based implementation
  - Integrated retry logic inside queue for better slot management
  - Increased minimum delay between requests to 1000ms (enhanced rate limit protection)
- Improved logging
  - Queue logs only on state changes (reduced noise)
  - Changed "Rate limit delay" to "Applying delay between requests" (clearer messaging)
- Removed detailed chat output
  - Prevents VSCode freezing on large review results
  - Chat shows only summary (total issues, file links)
  - Detailed results available in file output only

#### Removed
- `fileOutput.enabled` setting
  - File output always enabled (no configuration needed)
  - Removed `enabled` property from `settings.json`

### Version 0.1.1 - 2025-01-XX

#### Added
- Template variables for review statistics
- Detection count and rate tracking

#### Changed
- Improved template format and variable substitution

#### Fixed
- Template variable replacement issues

#### Removed
- Auto-display of output panel on extension activation

### Version 0.1.0 - 2025-01-XX

- Initial release
