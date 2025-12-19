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
2. Extract the problematic code snippet
3. Explain why it violates the rule
4. Provide a concrete suggestion for fixing it
5. **Provide a fixed code example** showing the corrected code

Output your findings in JSON format as specified in the system prompt.

**Remember:** Each issue must include both `codeSnippet` (the problematic code) and `fixedCodeSnippet` (the corrected code example).

**Code Snippet Extraction Rules:**
- Extract ONLY the pure source code
- Remove line number prefixes (e.g., `123: const x = 1;` → `const x = 1;`)
- Remove diff symbols (e.g., `+ console.log('hi');` → `console.log('hi');`)
- Do NOT include any metadata, annotations, or formatting markers in the code snippets
