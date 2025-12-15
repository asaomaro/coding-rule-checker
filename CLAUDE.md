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
3. In the new window, use: `@coding-rule-checker /review #file`

## Architecture

### Core Flow
1. **Chat Participant** (`extension.ts`) - Entry point that handles Copilot Chat commands
2. **Config Manager** (`config.ts`) - Loads settings, rule configurations, and prompt templates
3. **Code Retriever** (`codeRetriever.ts`) - Fetches code from local files, folders, git diffs, or GitHub (via `gh` CLI)
4. **Rule Parser** (`ruleParser.ts`) - Parses Markdown rule files into structured chapters
5. **Parallel Reviewer** (`parallelReviewer.ts`) - Orchestrates parallel review execution
6. **Review Engine** (`reviewEngine.ts`) - Executes reviews using Copilot Language Model
7. **Output Formatter** (`outputFormatter.ts`) - Formats results for chat and files

### Key Architectural Patterns

**Parallel Execution Strategy:**
- Reviews are executed chapter-by-chapter in parallel (not sequentially)
- Each chapter can have multiple review iterations that run in parallel
- False positive checks also run in parallel for each issue
- This design significantly reduces total review time

**Iteration System:**
- Each chapter is reviewed N times (configurable via `reviewIterations`)
- Multiple iterations improve review accuracy
- Results from all iterations are aggregated
- False positive checks filter out incorrect detections

**Configuration Hierarchy:**
```
.vscode/coding-rule-checker/
├── settings.json              # Global: model, prompt paths, file extension mappings
├── system-prompt.md           # System-level prompt
├── review-prompt.md           # Review prompt template
├── false-positive-prompt.md   # False positive check prompt
├── summary-prompt.md          # Summary generation prompt
└── [ruleset-name]/
    ├── rule-settings.json     # Ruleset-specific: iterations, output config
    ├── review-results-templates.md
    └── rules/
        ├── 01_rule.md         # Markdown rule files (## for chapters, ### for rules)
        └── 02_rule.md
```

### Review Request Types

**Commands:**
- `/review #file` - Review entire file content
- `/review #folder` - Review all code files in folder (recursively)
  - Automatically excludes common build/dependency folders (node_modules, .git, dist, etc.)
  - Files are filtered based on configured rulesets
  - Multiple files are processed in parallel for efficiency
- `/diff [range] #file` - Review only git diff
  - Range examples: `main..feature`, `abc123..def456`
  - Without file: reviews all changed files in workspace
  - Without range: reviews uncommitted changes

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
2. Load settings → determine rulesets by file extension
3. For each ruleset:
   - Load rule-settings.json
   - Parse all Markdown files in rules/
   - For each chapter in parallel:
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
  "model": "copilot-gpt-4",  // Optional: If omitted, uses currently selected Copilot model
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "rulesets": {
    ".ts": ["typescript-rules"],
    ".js": ["javascript-rules"]
  }
}
```

**Note:** The `model` field is optional. If not specified, the extension will use the currently selected model in Copilot Chat.

### Ruleset Settings (`.vscode/coding-rule-checker/[ruleset]/rule-settings.json`)
```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "templatesPath": ".vscode/coding-rule-checker/sample-rule/review-results-templates.md",
  "commonInstructionsPath": ".vscode/coding-rule-checker/sample-rule/rules/00_common.md",  // Optional
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

**Common Instructions:**
- `commonInstructionsPath` (optional): Path to a markdown file containing common instructions to be included in all reviews
- This file is inserted via `{commonInstructions}` placeholder in review-prompt.md
- If the file is in the rules folder, it will be automatically excluded from chapter reviews
- Useful for ruleset-wide guidelines that apply to all chapters

**Aggregation Threshold:**
- `aggregationThreshold` (optional, default: 0.5): Threshold ratio for aggregating multiple review iterations (0.00-1.00)
  - `1.0` = Accept if detected in any single iteration (most lenient)
  - `0.5` = Accept if detected in majority of iterations (default)
  - `0.0` = Accept only if detected in all iterations (most strict)
  - Example: With 3 iterations and threshold 0.5, an issue must be detected at least 2 times to be included
- Each issue in the output includes detection count: "NG指摘回数 : X / Y" where X is detection count and Y is total iterations

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
