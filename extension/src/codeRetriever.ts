import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CodeToReview, DiffInfo, DiffLine, SourceType } from './types';

const execAsync = promisify(exec);

/**
 * Retrieves code from a local file
 */
export async function getLocalFileContent(filePath: string): Promise<CodeToReview> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath);

  return {
    fileName,
    filePath,
    content,
    language: getLanguageFromExtension(extension),
    isDiff: false
  };
}

/**
 * Retrieves diff for a local file
 */
export async function getLocalFileDiff(
  workspaceRoot: string,
  filePath: string,
  diffRange?: string
): Promise<CodeToReview> {
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath);

  // If no diff range specified, get unstaged changes
  let gitCommand: string;
  if (!diffRange) {
    gitCommand = `git diff HEAD "${filePath}"`;
  } else {
    gitCommand = `git diff ${diffRange} -- "${filePath}"`;
  }

  const { stdout } = await execAsync(gitCommand, { cwd: workspaceRoot });

  return {
    fileName,
    filePath,
    content: stdout,
    language: getLanguageFromExtension(extension),
    diffRange: diffRange || 'HEAD',
    isDiff: true
  };
}

/**
 * Retrieves diff for all files in the repository
 */
export async function getAllFilesDiff(
  workspaceRoot: string,
  diffRange?: string
): Promise<CodeToReview[]> {
  // Get list of changed files
  let gitCommand: string;
  if (!diffRange) {
    gitCommand = 'git diff HEAD --name-only';
  } else {
    gitCommand = `git diff ${diffRange} --name-only`;
  }

  const { stdout } = await execAsync(gitCommand, { cwd: workspaceRoot });
  const changedFiles = stdout.trim().split('\n').filter(f => f.length > 0);

  const results: CodeToReview[] = [];

  for (const file of changedFiles) {
    const filePath = path.join(workspaceRoot, file);
    try {
      const diff = await getLocalFileDiff(workspaceRoot, filePath, diffRange);
      if (diff.content.trim().length > 0) {
        results.push(diff);
      }
    } catch (error) {
      // Skip files that can't be diffed
      continue;
    }
  }

  return results;
}

/**
 * Parses diff output and extracts added lines
 */
export function parseDiff(diffContent: string): DiffInfo {
  const lines = diffContent.split('\n');
  const additions: DiffLine[] = [];
  const deletions: DiffLine[] = [];
  let currentLineNumber = 0;
  let fileName = '';
  let filePath = '';

  for (const line of lines) {
    // Extract file name from diff header
    if (line.startsWith('+++')) {
      const match = line.match(/^\+\+\+ b\/(.+)$/);
      if (match) {
        filePath = match[1];
        fileName = path.basename(filePath);
      }
      continue;
    }

    // Extract line number from hunk header
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
      if (match) {
        currentLineNumber = parseInt(match[1], 10);
      }
      continue;
    }

    // Process added lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push({
        lineNumber: currentLineNumber,
        content: line.substring(1)
      });
      currentLineNumber++;
    }
    // Process deleted lines
    else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions.push({
        lineNumber: currentLineNumber,
        content: line.substring(1)
      });
    }
    // Context lines
    else if (!line.startsWith('\\')) {
      currentLineNumber++;
    }
  }

  return {
    fileName,
    filePath,
    additions,
    deletions
  };
}

/**
 * Retrieves code from GitHub using gh CLI
 */
export async function getGitHubFileContent(url: string): Promise<CodeToReview> {
  // Parse GitHub URL to extract owner, repo, and file path
  // Format: https://github.com/owner/repo/blob/branch/path/to/file
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL format');
  }

  const [, owner, repo, branch, filePath] = match;
  const fileName = path.basename(filePath);

  // Use gh CLI to get file content
  const command = `gh api repos/${owner}/${repo}/contents/${filePath}?ref=${branch} --jq '.content' | base64 -d`;
  const { stdout } = await execAsync(command);

  const extension = path.extname(filePath);

  return {
    fileName,
    filePath: url,
    content: stdout,
    language: getLanguageFromExtension(extension),
    isDiff: false
  };
}

/**
 * Retrieves diff from GitHub using gh CLI
 */
export async function getGitHubDiff(url: string, diffRange: string): Promise<CodeToReview> {
  // Parse GitHub URL to extract owner and repo
  // Format: https://github.com/owner/repo
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL format');
  }

  const [, owner, repo] = match;

  // Use gh CLI to get diff
  const command = `gh api repos/${owner}/${repo}/compare/${diffRange} --jq '.files[] | .patch'`;
  const { stdout } = await execAsync(command);

  return {
    fileName: `${owner}/${repo}`,
    filePath: url,
    content: stdout,
    language: 'diff',
    diffRange,
    isDiff: true
  };
}

/**
 * Determines the programming language from file extension
 */
function getLanguageFromExtension(extension: string): string {
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascriptreact',
    '.tsx': 'typescriptreact',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.xml': 'xml',
    '.md': 'markdown'
  };

  return languageMap[extension.toLowerCase()] || 'plaintext';
}

/**
 * Determines if a path is a GitHub URL
 */
export function isGitHubUrl(path: string): boolean {
  return path.startsWith('https://github.com/') || path.startsWith('http://github.com/');
}

/**
 * Determines the source type from the file path or URL
 */
export function determineSourceType(fileOrUrl: string): SourceType {
  return isGitHubUrl(fileOrUrl) ? 'github' : 'local';
}
