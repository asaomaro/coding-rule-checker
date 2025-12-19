# Coding Rule Checker

A VSCode extension that performs static code analysis based on coding rules written in Markdown format, integrated with GitHub Copilot Chat.

## Overview

Coding Rule Checker allows you to define custom coding rules in Markdown format and automatically review code against these rules using AI. It integrates seamlessly with GitHub Copilot Chat, making code reviews easy and efficient.

## Key Features

- **Markdown-based Rules**: Define coding rules in simple Markdown format
- **Copilot Chat Integration**: Review code directly from Copilot Chat
- **Multi-source Support**: Review local files, git diffs, or GitHub repositories
- **Parallel Processing**: Fast reviews with parallel chapter processing
- **False Positive Detection**: Automatic validation to reduce false positives
- **Customizable Output**: Configure review templates and output formats
- **Multiple Rulesets**: Apply different rules to different file types

## Quick Start

### 1. Install Dependencies

```bash
cd extension
npm install
```

### 2. Compile the Extension

```bash
npm run compile
```

### 3. Set Up Configuration

Create a `.vscode/coding-rule-checker` directory in your project with:
- `settings.json` - Main configuration
- Prompt templates (system, review, false-positive, summary)
- Rule directories with Markdown rule files

Sample configuration files are provided in this repository.

### 4. Install the Extension

1. Open VSCode
2. Press F5 to launch Extension Development Host
3. Or package with `npm run package` and install the .vsix file

### 5. Use in Copilot Chat

```
@coding-rule-checker /review #file
@coding-rule-checker /diff main..feature
```

## Project Structure

```
.
├── extension/              # VSCode extension source
│   ├── src/               # TypeScript source files
│   ├── dist/              # Compiled JavaScript
│   └── package.json       # Extension manifest
├── .vscode/
│   └── coding-rule-checker/  # Sample configuration
│       ├── settings.json
│       ├── *-prompt.md    # Prompt templates
│       └── sample-rule/   # Sample rule set
│           ├── rule-settings.json
│           └── rules/     # Markdown rule files
├── spec.md                # Detailed specification
└── README.md              # This file
```

## Documentation

- [spec.md](spec.md) - Detailed specification in Japanese
- [extension/README.md](extension/README.md) - Extension documentation

## Development

### Build

```bash
cd extension
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Lint

```bash
npm run lint
```

### Package

```bash
npm run package
```

## Architecture

The extension consists of several key components:

1. **Config Manager**: Loads settings and rule configurations
2. **Rule Parser**: Parses Markdown rule files into structured data
3. **Code Retriever**: Fetches code from local files or GitHub
4. **Review Engine**: Executes reviews using Copilot Language Model
5. **Parallel Reviewer**: Manages parallel review processing
6. **Output Formatter**: Formats and saves review results

## Requirements

- VSCode 1.85.0 or higher
- GitHub Copilot subscription
- Node.js 20+ (for development)
- `gh` CLI (for GitHub integration)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Author

Developed based on the specification in spec.md