# Code Review Request

## File Information

- File Name: {fileName}
- File Path: {filePath}
- Language: {language}

## Code to Review

```{language}
{code}
```

## Coding Rules to Check

### {chapterTitle}

{chapterContent}

## Instructions

Please review the above code against the coding rules specified in the chapter.

**Important:**
- Each line in the code is prefixed with a line number (e.g., `123: const foo = 'bar';`)
- If the code shows diff symbols (`+`, `-`, or two spaces for context):
  - `+` indicates an added line (review this)
  - `-` indicates a deleted line (DO NOT review this)
  - Two spaces indicate a context line (DO NOT review this)
  - **ONLY review lines that start with `+`** (added lines)

For each violation found:

1. Identify the exact line number
2. **Identify which specific rule** (### or ####) in the chapter content the code violates
3. Extract the problematic code snippet
4. Explain why it violates the rule
5. Provide a concrete suggestion for fixing it
6. **Provide a fixed code example** showing the corrected code

## Output Format

Please output your findings in JSON format with the following structure:

```json
{
  "issues": [
    {
      "ruleId": "1.1",
      "ruleTitle": "Rule Title",
      "lineNumber": 42,
      "codeSnippet": "problematic code here",
      "reason": "Explanation of why this violates the rule",
      "suggestion": "How to fix this issue",
      "fixedCodeSnippet": "corrected code example here"
    }
  ]
}
```

**Important:** For each issue, you must provide:
- `ruleId`: The exact ID from the rule heading (e.g., "1.1" from "### 1.1 Rule Title" or "1.1.1" from "#### 1.1.1 Sub-rule")
- `ruleTitle`: The exact title from the rule heading
- `codeSnippet`: The exact problematic code from the file (PURE CODE ONLY - remove line numbers, diff symbols like `+`/`-`, and any prefixes)
- `fixedCodeSnippet`: A concrete code example showing how to fix the issue (PURE CODE ONLY - not just a description)

**Code Snippet Extraction Rules:**
- Extract ONLY the pure source code
- Remove line number prefixes (e.g., `123: const x = 1;` → `const x = 1;`)
- Remove diff symbols (e.g., `+ console.log('hi');` → `console.log('hi');`)
- Do NOT include any metadata, annotations, or formatting markers in the code snippets

**If no violations are found, return an empty issues array.**
