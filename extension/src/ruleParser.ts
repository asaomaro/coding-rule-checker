import * as fs from 'fs/promises';
import * as path from 'path';
import { RuleChapter, Rule } from './types';
import * as logger from './logger';

/**
 * Loads all rule files from a directory and parses them into chapters
 * @param rulesPath - Path to the rules directory
 * @param commonPromptPath - Optional path to a common prompt file to exclude from review chapters
 */
export async function loadRules(rulesPath: string, commonPromptPath?: string): Promise<RuleChapter[]> {
  logger.log('loadRules: rulesPath =', rulesPath);
  logger.log('loadRules: commonPromptPath =', commonPromptPath);

  const files = await fs.readdir(rulesPath);
  logger.log('loadRules: found files =', files);

  const markdownFiles = files.filter(file => file.endsWith('.md')).sort();
  logger.log('loadRules: markdown files =', markdownFiles);

  const allChapters: RuleChapter[] = [];

  for (const file of markdownFiles) {
    const backslash = String.fromCharCode(92);
    const filePath = rulesPath + backslash + file;
    logger.log('loadRules: reading file =', filePath);

    // Skip if this file is the common prompt file
    if (commonPromptPath && path.resolve(filePath) === path.resolve(commonPromptPath)) {
      logger.log('loadRules: skipping common prompt file =', filePath);
      continue;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    logger.log('loadRules: file content length =', content.length);

    // Debug: show first 200 chars
    logger.log('loadRules: first 200 chars:', content.substring(0, 200));

    const chapters = parseRuleMarkdown(content);
    logger.log('loadRules: parsed chapters from', file, '=', chapters.length);

    if (chapters.length === 0) {
      // Debug parsing
      const lines = content.split('\n');
      logger.log('loadRules: total lines =', lines.length);
      logger.log('loadRules: first 3 lines:', lines.slice(0, 3));
    }

    allChapters.push(...chapters);
  }

  logger.log('loadRules: total chapters =', allChapters.length);
  return allChapters;
}

/**
 * Parses markdown content and extracts rule chapters
 */
export function parseRuleMarkdown(markdown: string): RuleChapter[] {
  const lines = markdown.split('\n');
  const chapters: RuleChapter[] = [];
  let currentChapter: RuleChapter | null = null;
  let currentChapterContent: string[] = [];

  for (let line of lines) {
    // Trim whitespace including \r\n
    line = line.trim();

    // Check for H2 headers (## 1. Chapter Title)
    const h2Match = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (h2Match) {
      // Save previous chapter if exists
      if (currentChapter) {
        currentChapter.content = currentChapterContent.join('\n').trim();
        chapters.push(currentChapter);
      }

      // Start new chapter
      const chapterId = h2Match[1];
      const title = h2Match[2].trim();
      currentChapter = {
        id: chapterId,
        title,
        rules: [],
        content: ''
      };
      currentChapterContent = [line];
      continue;
    }

    // Add line to current chapter content
    if (currentChapter) {
      currentChapterContent.push(line);

      // Check for H3 headers (### 1.1 Rule Title)
      const h3Match = line.match(/^###\s+([\d.]+)\s+(.+)$/);
      if (h3Match) {
        const ruleId = h3Match[1];
        const title = h3Match[2].trim();
        currentChapter.rules.push({
          id: ruleId,
          title,
          description: '',
          level: 3
        });
      }

      // Check for H4 headers (#### 1.1.1 Sub Rule Title)
      const h4Match = line.match(/^####\s+([\d.]+)\s+(.+)$/);
      if (h4Match) {
        const ruleId = h4Match[1];
        const title = h4Match[2].trim();
        currentChapter.rules.push({
          id: ruleId,
          title,
          description: '',
          level: 4
        });
      }
    }
  }

  // Save last chapter
  if (currentChapter) {
    currentChapter.content = currentChapterContent.join('\n').trim();
    chapters.push(currentChapter);
  }

  return chapters;
}

/**
 * Gets the chapter-specific review iterations count
 */
export function getChapterReviewIterations(
  chapterId: string,
  reviewIterationsConfig: { default: number; chapter?: Record<string, number> }
): number {
  const chapterNumber = parseInt(chapterId, 10);
  if (reviewIterationsConfig.chapter && reviewIterationsConfig.chapter[chapterNumber]) {
    return reviewIterationsConfig.chapter[chapterNumber];
  }
  return reviewIterationsConfig.default;
}

/**
 * Gets the chapter-specific false positive check iterations count
 */
export function getChapterFalsePositiveIterations(
  chapterId: string,
  falsePositiveConfig: { default: number; chapter?: Record<string, number> }
): number {
  const chapterNumber = parseInt(chapterId, 10);
  if (falsePositiveConfig.chapter && falsePositiveConfig.chapter[chapterNumber]) {
    return falsePositiveConfig.chapter[chapterNumber];
  }
  return falsePositiveConfig.default;
}
