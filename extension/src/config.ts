import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Settings, RuleSettings } from './types';

/**
 * Loads the main settings configuration
 */
export async function loadSettings(workspaceRoot: string): Promise<Settings> {
  const settingsPath = path.join(workspaceRoot, '.vscode', 'coding-rule-checker', 'settings.json');

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as Settings;

    // Validate required fields
    if (!settings.model || !settings.systemPromptPath || !settings.summaryPromptPath || !settings.rulesets) {
      throw new Error('Missing required fields in settings.json');
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
    if (!ruleSettings.rulesPath || !ruleSettings.templatesPath) {
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
 */
export function getWorkspaceRoot(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open');
  }

  return workspaceFolders[0].uri.fsPath;
}

/**
 * Resolves a path relative to the workspace root
 */
export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  return path.join(workspaceRoot, relativePath);
}
