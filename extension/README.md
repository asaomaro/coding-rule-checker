# Coding Rule Checker

A VSCode extension that performs static code analysis based on coding rules written in Markdown format.

## Features

- Review code against custom coding rules written in Markdown
- Integrate seamlessly with GitHub Copilot Chat
- Support for both local files and GitHub repositories
- Review entire files or just the diff
- Parallel processing for faster reviews
- False positive detection to reduce noise
- Customizable review templates and prompts
- Save review results to files

## Installation

### From VSIX file

1. Download or build the `.vsix` file
2. Open VSCode
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

### Build from source

1. Clone the repository
2. Run `npm install` in the extension folder
3. Run `npm run compile` to build
4. Press `F5` to launch Extension Development Host

### Requirements

- VSCode 1.85.0 or higher
- GitHub Copilot subscription
- Node.js 20+ (for building from source)

## Configuration

### 1. Create the configuration directory

Create a `.vscode/coding-rule-checker` directory in your workspace.

### 2. Create settings.json

```json
{
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "rulesets": {
    ".js": ["sample-rule"],
    ".ts": ["sample-rule"]
  }
}
```

### 3. Create prompt templates

- `system-prompt.md`: System prompt for the AI reviewer
- `review-prompt.md`: Template for review requests
- `false-positive-prompt.md`: Template for false positive checks
- `summary-prompt.md`: Template for review summaries

### 4. Create rule settings

For each ruleset, create a `rule-settings.json`:

```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "templatesPath": ".vscode/coding-rule-checker/sample-rule/review-results-template.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  },
  "reviewIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "falsePositiveCheckIterations": {
    "default": 2
  }
}
```

### 5. Write your coding rules

Create Markdown files in your rules directory:

```markdown
## 1. Code Quality Rules

### 1.1 Naming Conventions

Variable and function names should be descriptive and follow camelCase.

### 1.2 Function Complexity

Functions should be small and focused on a single responsibility.
```

## Usage

### Review a specific file

```
@coding-rule-checker /reviewAll #file
```

### Review git diff

```
@coding-rule-checker /reviewDiff main..feature #file
```

### Review all changed files

```
@coding-rule-checker /reviewDiff
```

### Review GitHub repository

```
@coding-rule-checker /reviewDiff https://github.com/owner/repo main..feature
```

## How It Works

1. **Code Retrieval**: Fetches code from local files or GitHub
2. **Rule Loading**: Loads applicable rules based on file extension
3. **Parallel Review**: Reviews each chapter in parallel with multiple iterations
4. **False Positive Check**: Validates findings to reduce false positives
5. **Aggregation**: Combines results from multiple iterations
6. **Output**: Displays results in chat and optionally saves to file

## Advanced Features

### Multiple Review Iterations

Each chapter can be reviewed multiple times to improve accuracy. Results are aggregated using a voting mechanism.

### False Positive Detection

Suspicious findings are checked multiple times to filter out false positives.

### Custom Templates

Customize review output format using Markdown templates with placeholders.

### GitHub Integration

Uses `gh` CLI to fetch code from GitHub repositories, supporting:
- Specific files
- Pull requests
- Commit ranges
- Branch comparisons

## Requirements

- VSCode 1.85.0 or higher
- GitHub Copilot subscription
- `gh` CLI (for GitHub integration)

## Extension Settings

This extension contributes the following settings:

- Configuration files in `.vscode/coding-rule-checker/`
- Custom rule definitions in Markdown format
- Prompt templates for AI interaction

## Known Issues

- Large files may take longer to review
- GitHub API rate limits may apply

## Release Notes

### 0.1.0

Initial release with core features:
- Code review based on Markdown rules
- Copilot Chat integration
- Local and GitHub support
- Parallel processing
- False positive detection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
