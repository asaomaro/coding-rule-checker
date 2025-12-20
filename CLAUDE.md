# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coding Rule Checker is a VSCode extension that performs static code analysis based on coding rules written in Markdown format. It integrates with GitHub Copilot Chat to review code against custom rules defined by users.

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
- Results from all iterations are aggregated
- False positive checks filter out incorrect detections

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

1. Parse request → determine source (local/GitHub) and type (all/diff)
2. Load settings → get ruleset name from `settings.ruleset`
3. For the ruleset:
   - Load rule-settings.json
   - Parse all Markdown files in rules/
   - **Filter chapters** (two-level filtering):
     - Level 1: Chapter-to-file-pattern filter (`rulesets` in settings.json)
       - For each chapter:
         - If chapter ID **not in rulesets**: Always review
         - If chapter ID **in rulesets**: Review only if file matches patterns
     - Level 2: Additional file pattern-based filter (`chapterFilters` in rule-settings.json)
       - Optional: Further filters chapters based on file path patterns
   - For each filtered chapter in parallel:
     - Run N review iterations in parallel
     - Aggregate iteration results
     - Run M false-positive checks in parallel
     - Filter out false positives
4. Format output for chat and optionally save to file

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

## Configuration

### Global Settings (`.vscode/coding-rule-checker/settings.json`)
```json
{
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "maxConcurrentReviews": 10,
  "showRulesWithNoIssues": false,
  "ruleset": "typescript-rules",
  "rulesets": {
    "1": ["*.component.ts", "*.service.ts"],
    "3": ["*.test.ts", "*.spec.ts"],
    "5": ["util/**/*.ts"]
  }
}
```

**Key Settings:**
- `maxConcurrentReviews` (optional, default: 10): Maximum number of concurrent LLM requests
  - Controls the global concurrency limit for all parallel review operations
  - Higher values = faster reviews but may hit API rate limits
  - Lower values = slower reviews but more stable
  - Recommended: 5-15 depending on your API plan
- `showRulesWithNoIssues` (optional, default: false): Show rule sections with no issues in output
- `ruleset` (required): The ruleset name to use (e.g., "typescript-rules", "java-rules")
- `rulesets`: **Chapter ID to file patterns mapping**
  - Key: Chapter ID (e.g., "1", "2", "3")
  - Value: Array of file patterns (glob patterns supported)
  - **Logic**:
    - Chapter **NOT in rulesets**: Reviewed for **all files**
    - Chapter **in rulesets**: Reviewed only for files matching the patterns
  - **Example**: `"1": ["*.component.ts"]` means Chapter 1 is only reviewed for component files
  - **Patterns**: Support glob patterns (`*.component.ts`, `util/**/*.ts`, etc.)

### Ruleset Settings (`.vscode/coding-rule-checker/[ruleset]/rule-settings.json`)
```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "templatesPath": ".vscode/coding-rule-checker/sample-rule/review-results-templates.md",
  "commonPromptPath": ".vscode/coding-rule-checker/sample-rule/rules/01_common.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  },
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
  }
}
```

**Key Settings:**
- `commonPromptPath` (optional): Path to a markdown file containing common rules/context to include in all chapter reviews
  - If specified and the file is in the rules directory, it will be excluded from chapter-based reviews
  - Commonly used for general coding standards that apply to all specific rules
  - The content is prepended to each review prompt
- **Chapter filtering**: Now configured in `settings.json` via `rulesets` (chapter to file patterns mapping)

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
- Review errors displayed in chat stream

## Requirements

- VSCode 1.85.0+
- GitHub Copilot subscription
- Node.js 20+ (development)
- `gh` CLI (for GitHub integration features)
