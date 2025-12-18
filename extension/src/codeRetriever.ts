import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CodeToReview, DiffInfo, DiffLine, SourceType } from './types';

const execAsync = promisify(exec);

/**
 * Default patterns to exclude when scanning folders
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.vscode',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.nyc_output',
  'vendor',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache'
];

/**
 * Checks if a path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively retrieves all files from a folder
 */
async function getAllFilesRecursive(
  dirPath: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS
): Promise<string[]> {
  const files: string[] = [];

  async function traverse(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Check if this path should be excluded
      const shouldExclude = excludePatterns.some(pattern =>
        entry.name === pattern || fullPath.includes(path.sep + pattern + path.sep)
      );

      if (shouldExclude) {
        continue;
      }

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await traverse(dirPath);
  return files;
}

/**
 * Retrieves all code files from a local folder
 */
export async function getLocalFolderFiles(
  folderPath: string,
  targetExtensions?: string[]
): Promise<CodeToReview[]> {
  // Get all files in the folder recursively
  const allFiles = await getAllFilesRecursive(folderPath);

  // Filter by extensions if specified
  let filteredFiles = allFiles;
  if (targetExtensions && targetExtensions.length > 0) {
    filteredFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return targetExtensions.includes(ext);
    });
  }

  // Load content for each file
  const codeFiles: CodeToReview[] = [];
  for (const filePath of filteredFiles) {
    try {
      const code = await getLocalFileContent(filePath);
      codeFiles.push(code);
    } catch (error) {
      console.warn(`[getLocalFolderFiles] Failed to read file: ${filePath}`, error);
      // Skip files that can't be read
    }
  }

  return codeFiles;
}

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

  // Use gh CLI to get file content (without using base64 command)
  const command = `gh api repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const { stdout } = await execAsync(command);

  // Parse JSON response and decode base64 content
  const response = JSON.parse(stdout);
  if (!response.content) {
    throw new Error('File content not found in GitHub API response');
  }

  // Decode base64 content (replace newlines first as GitHub API includes them)
  const base64Content = response.content.replace(/\n/g, '');
  const content = Buffer.from(base64Content, 'base64').toString('utf-8');

  const extension = path.extname(filePath);

  return {
    fileName,
    filePath: url,
    content,
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

  // GitHub API requires 'heads/' prefix for branch names containing slashes
  // Tags without slashes (v1.0.0, v2.1.3) work as-is
  // Tags with slashes (release/v1.0.0) would need 'tags/' prefix, but this is rare
  // Commit hashes work as-is regardless of format
  const processedDiffRange = diffRange
    .split('..')
    .map(ref => {
      // Add 'heads/' prefix if ref contains a slash (assumes it's a branch)
      // For tag support: if tags contain slashes, they would need 'tags/' prefix
      return ref.includes('/') ? `heads/${ref}` : ref;
    })
    .join('...');

  // Use gh CLI to get diff
  const command = `gh api repos/${owner}/${repo}/compare/${processedDiffRange}`;
  console.log('[getGitHubDiff] Executing command:', command);
  console.log('[getGitHubDiff] Original diff range:', diffRange);
  console.log('[getGitHubDiff] Processed diff range:', processedDiffRange);

  const { stdout } = await execAsync(command);

  const response = JSON.parse(stdout);
  const patches = response.files?.map((file: any) => file.patch).filter(Boolean).join('\n') || '';

  return {
    fileName: `${owner}/${repo}`,
    filePath: url,
    content: patches,
    language: 'diff',
    diffRange,
    isDiff: true
  };
}

/**
 * Retrieves compare diff from GitHub using gh CLI with optional file filtering
 */
export async function getGitHubCompareDiff(url: string, compareRange: string, targetFilePaths?: string[]): Promise<CodeToReview[]> {
  // Parse GitHub URL to extract owner and repo
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL format');
  }

  const [, owner, repo] = match;

  // GitHub API requires 'heads/' prefix for branch names containing slashes
  // For example: "main..develop/feature" becomes "main...heads/develop/feature"
  // Tags without slashes (v1.0.0, v2.1.3) work as-is
  // Tags with slashes (release/v1.0.0) would need 'tags/' prefix, but this is rare
  // Commit hashes work as-is regardless of format

  // Split by .. or ... (use regex to handle both)
  const refs = compareRange.split(/\.{2,3}/);

  const processedCompareRange = refs
    .map(ref => {
      // Add 'heads/' prefix if ref contains a slash (assumes it's a branch)
      // For tag support: if tags contain slashes, they would need 'tags/' prefix
      return ref.includes('/') ? `heads/${ref}` : ref;
    })
    .join('...');

  // Use gh CLI to get compare diff
  const command = `gh api repos/${owner}/${repo}/compare/${processedCompareRange}`;
  console.log('[getGitHubCompareDiff] Executing command:', command);
  console.log('[getGitHubCompareDiff] Original compare range:', compareRange);
  console.log('[getGitHubCompareDiff] Processed compare range:', processedCompareRange);

  const { stdout } = await execAsync(command);

  const response = JSON.parse(stdout);

  if (!response.files || response.files.length === 0) {
    throw new Error('No files found in comparison');
  }

  const results: CodeToReview[] = [];

  // Filter files if targetFilePaths is specified
  let filesToProcess = response.files;
  if (targetFilePaths && targetFilePaths.length > 0) {
    filesToProcess = response.files.filter((file: any) =>
      targetFilePaths.some(targetPath =>
        file.filename === targetPath || file.filename.endsWith(targetPath)
      )
    );

    if (filesToProcess.length === 0) {
      throw new Error(`Files "${targetFilePaths.join(', ')}" not found in comparison`);
    }
  }

  // Process each file
  for (const file of filesToProcess) {
    if (!file.patch) {
      continue; // Skip files without diffs (e.g., binary files)
    }

    const extension = path.extname(file.filename);

    results.push({
      fileName: path.basename(file.filename),
      filePath: `${url}/compare/${compareRange}#${file.filename}`,
      content: file.patch,
      language: getLanguageFromExtension(extension),
      diffRange: compareRange,
      isDiff: true
    });
  }

  return results;
}

/**
 * Retrieves commit diff from GitHub using gh CLI
 */
export async function getGitHubCommitDiff(url: string, targetFileNames?: string[]): Promise<CodeToReview[]> {
  // Parse GitHub commit URL to extract owner, repo, and commit hash
  // Format: https://github.com/owner/repo/commit/hash
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/commit\/([a-f0-9]+)/);
  if (!match) {
    throw new Error('Invalid GitHub commit URL format');
  }

  const [, owner, repo, commitHash] = match;

  // Use gh CLI to get commit details
  const command = `gh api repos/${owner}/${repo}/commits/${commitHash}`;
  const { stdout } = await execAsync(command);

  const response = JSON.parse(stdout);

  if (!response.files || response.files.length === 0) {
    throw new Error('No files found in commit');
  }

  const results: CodeToReview[] = [];

  // Filter files if targetFileNames is specified
  let filesToProcess = response.files;
  if (targetFileNames && targetFileNames.length > 0) {
    filesToProcess = response.files.filter((file: any) =>
      targetFileNames.some(targetName =>
        file.filename.endsWith(targetName) || file.filename === targetName
      )
    );

    if (filesToProcess.length === 0) {
      throw new Error(`Files "${targetFileNames.join(', ')}" not found in commit`);
    }
  }

  // Process each file
  for (const file of filesToProcess) {
    if (!file.patch) {
      continue; // Skip files without diffs (e.g., binary files, deleted files without content)
    }

    const extension = path.extname(file.filename);

    results.push({
      fileName: path.basename(file.filename),
      filePath: `${url}#${file.filename}`,
      content: file.patch,
      language: getLanguageFromExtension(extension),
      diffRange: commitHash,
      isDiff: true
    });
  }

  return results;
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
