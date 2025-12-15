import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { Settings, RuleSettings } from './types';

/**
 * Loads the main settings configuration
 */
export async function loadSettings(workspaceRoot: string): Promise<Settings> {
  const settingsPath = path.join(workspaceRoot, '.vscode', 'coding-rule-checker', 'settings.json');

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as Settings;

    // Validate required fields (model is optional)
    if (!settings.systemPromptPath || !settings.summaryPromptPath || !settings.rulesets) {
      throw new Error('Missing required fields in settings.json');
    }

    if (!settings.templatesPath) {
      throw new Error('Missing templatesPath in settings.json');
    }

    if (!settings.fileOutput || !settings.fileOutput.outputDir || !settings.fileOutput.outputFileName) {
      throw new Error('Missing or incomplete fileOutput configuration in settings.json');
    }

    return settings;
  } catch (error) {
    throw new Error(`Failed to load settings.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads rule settings for a specific ruleset
 */
export async function loadRuleSettings(workspaceRoot: string, rulesetName: string): Promise<RuleSettings> {
  const ruleSettingsPath = path.join(
    workspaceRoot,
    '.vscode',
    'coding-rule-checker',
    rulesetName,
    'rule-settings.json'
  );

  try {
    const content = await fs.readFile(ruleSettingsPath, 'utf-8');
    const ruleSettings = JSON.parse(content) as RuleSettings;

    // Validate required fields
    if (!ruleSettings.rulesPath) {
      throw new Error('Missing required fields in rule-settings.json');
    }

    return ruleSettings;
  } catch (error) {
    throw new Error(`Failed to load rule-settings.json for ${rulesetName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads a prompt template from a file
 */
export async function loadPromptTemplate(workspaceRoot: string, templatePath: string): Promise<string> {
  const fullPath = path.join(workspaceRoot, templatePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to load prompt template from ${templatePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets the workspace root directory
 * If no workspace is open, returns null
 */
export function getWorkspaceRoot(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  return workspaceFolders[0].uri.fsPath;
}

/**
 * Resolves a path relative to the workspace root
 */
export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  // Manual path construction since path module seems broken
  // Use character code for backslash to avoid escaping issues
  const backslash = String.fromCharCode(92); // ASCII code for \

  console.log('=== resolveWorkspacePath DEBUG ===');
  console.log('backslash char code:', backslash.charCodeAt(0));
  console.log('backslash length:', backslash.length);
  console.log('workspaceRoot:', workspaceRoot);
  console.log('relativePath:', relativePath);

  // Remove leading ./ or .\ from relative path
  let cleanRelativePath = relativePath;
  if (cleanRelativePath.startsWith('./') || cleanRelativePath.startsWith('.\\')) {
    cleanRelativePath = cleanRelativePath.substring(2);
  }

  // Normalize slashes to backslashes
  cleanRelativePath = cleanRelativePath.split('/').join(backslash);

  console.log('cleanRelativePath:', cleanRelativePath);

  // Ensure workspace root doesn't end with backslash
  let cleanWorkspaceRoot = workspaceRoot.replace(/[\\\/]+$/, '');

  console.log('cleanWorkspaceRoot:', cleanWorkspaceRoot);

  // Construct full path
  const result = cleanWorkspaceRoot + backslash + cleanRelativePath;

  console.log('result:', result);
  console.log('result length:', result.length);
  console.log('===================================');

  return result;
}

/**
 * Selects rulesets for a file based on pattern matching
 * Supports:
 * - Extension matching: ".ts" matches any .ts file
 * - Filename patterns: "STAR.component.ts" matches foo.component.ts
 * - Path patterns: "component/STAR.ts" matches component/foo.ts
 * - Complex patterns: "src/app/DOUBLESTAR/STAR.ts" matches nested paths
 * (Replace STAR with asterisk, DOUBLESTAR with double asterisk)
 *
 * @param filePath - The file path (can be absolute or relative to workspace)
 * @param fileName - The file name (used for pattern matching)
 * @param settings - The settings containing ruleset patterns
 * @param workspaceRoot - The workspace root (optional, for relative path calculation)
 * @returns Array of ruleset names to apply, in order of specificity (most specific first)
 */
export function selectRulesetsForFile(
  filePath: string,
  fileName: string,
  settings: Settings,
  workspaceRoot?: string
): string[] {
  // Calculate relative path from workspace root if available
  let relativePath = fileName;
  if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
    relativePath = path.relative(workspaceRoot, filePath);
    // Normalize to forward slashes for consistent pattern matching
    relativePath = relativePath.split(path.sep).join('/');
  }

  console.log('[selectRulesetsForFile] File name:', fileName);
  console.log('[selectRulesetsForFile] Relative path:', relativePath);

  // Collect all matching patterns with their specificity
  interface PatternMatch {
    pattern: string;
    rulesets: string[];
    specificity: number;
  }

  const matches: PatternMatch[] = [];

  for (const [pattern, rulesets] of Object.entries(settings.rulesets)) {
    let isMatch = false;

    // Extension matching (legacy behavior): pattern starts with "."
    if (pattern.startsWith('.')) {
      const extension = path.extname(fileName);
      isMatch = extension === pattern;
      console.log(`[selectRulesetsForFile] Extension check: ${pattern} vs ${extension} = ${isMatch}`);
    }
    // Glob pattern matching
    else {
      // Try matching against both fileName and relativePath
      const matchFileName = minimatch(fileName, pattern);
      const matchRelativePath = minimatch(relativePath, pattern);
      isMatch = matchFileName || matchRelativePath;
      console.log(`[selectRulesetsForFile] Pattern check: ${pattern} vs ${fileName}/${relativePath} = ${isMatch}`);
    }

    if (isMatch) {
      // Calculate specificity: longer patterns and more path segments = higher specificity
      const specificity = pattern.length + (pattern.split('/').length * 10);
      matches.push({ pattern, rulesets, specificity });
      console.log(`[selectRulesetsForFile] Matched pattern: ${pattern} (specificity: ${specificity})`);
    }
  }

  // Sort by specificity (descending - most specific first)
  matches.sort((a, b) => b.specificity - a.specificity);

  // Merge rulesets, preserving order and removing duplicates
  const result: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    for (const ruleset of match.rulesets) {
      if (!seen.has(ruleset)) {
        result.push(ruleset);
        seen.add(ruleset);
      }
    }
  }

  console.log('[selectRulesetsForFile] Selected rulesets:', result);
  return result;
}

/**
 * Selects chapters to review for a file based on pattern matching
 * Uses chapterFilters configuration in rule-settings.json
 *
 * @param filePath - The file path (can be absolute or relative to workspace)
 * @param fileName - The file name (used for pattern matching)
 * @param ruleSettings - The rule settings containing chapter filters
 * @param workspaceRoot - The workspace root (optional, for relative path calculation)
 * @param allChapterIds - All available chapter IDs from the loaded rules
 * @returns Array of chapter IDs to review, or null to review all chapters
 */
export function selectChaptersForFile(
  filePath: string,
  fileName: string,
  ruleSettings: RuleSettings,
  workspaceRoot: string | undefined,
  allChapterIds: string[]
): string[] | null {
  // If no chapter filters configured, review all chapters
  if (!ruleSettings.chapterFilters) {
    console.log('[selectChaptersForFile] No chapter filters configured, reviewing all chapters');
    return null;
  }

  // Calculate relative path from workspace root if available
  let relativePath = fileName;
  if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
    relativePath = path.relative(workspaceRoot, filePath);
    // Normalize to forward slashes for consistent pattern matching
    relativePath = relativePath.split(path.sep).join('/');
  }

  console.log('[selectChaptersForFile] File name:', fileName);
  console.log('[selectChaptersForFile] Relative path:', relativePath);

  const patterns = ruleSettings.chapterFilters.patterns || {};

  // Find matching patterns
  for (const [pattern, chapterIds] of Object.entries(patterns)) {
    const matchFileName = minimatch(fileName, pattern);
    const matchRelativePath = minimatch(relativePath, pattern);

    if (matchFileName || matchRelativePath) {
      console.log(`[selectChaptersForFile] Matched pattern: ${pattern}, chapters: ${chapterIds.join(', ')}`);
      return chapterIds;
    }
  }

  // If no pattern matched, use default if specified
  if (ruleSettings.chapterFilters.default) {
    console.log('[selectChaptersForFile] Using default chapter filter:', ruleSettings.chapterFilters.default);
    return ruleSettings.chapterFilters.default;
  }

  // No filters matched and no default specified, review all chapters
  console.log('[selectChaptersForFile] No pattern matched and no default, reviewing all chapters');
  return null;
}
