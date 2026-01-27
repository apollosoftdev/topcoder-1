import * as fs from 'fs';
import * as path from 'path';

// [NOTE]: Constants configuration loaded from config/constants.json
export interface ConstantsConfig {
  fileExtensions: Record<string, string[]>;
  shortTermExpansions: Record<string, string>;
  techAliases: Record<string, string[]>;
  scoring: {
    weights: {
      language: number;
      commits: number;
      prs: number;
      projectQuality: number;
      recency: number;
    };
    baseScore: number;
    maxScore: number;
    minScoreThreshold: number;
  };
}

let cachedConfig: ConstantsConfig | null = null;

// [!IMPORTANT]: Load constants from JSON file - single source of truth
export function loadSkillsConfig(): ConstantsConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // [NOTE]: Allow override via environment variable
  const customPath = process.env.CONSTANTS_PATH;

  const configPaths = [
    customPath,
    path.join(process.cwd(), 'config', 'constants.json'),
    path.join(__dirname, '..', '..', 'config', 'constants.json'),
  ].filter(Boolean) as string[];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const rawConfig = fs.readFileSync(configPath, 'utf-8');
        cachedConfig = JSON.parse(rawConfig) as ConstantsConfig;
        return cachedConfig;
      }
    } catch (error) {
      // [NOTE]: Continue to next path if parsing fails
      console.error(`Failed to parse config at ${configPath}:`, error);
    }
  }

  // [NOTE]: Fail fast if no config found - don't use code defaults
  throw new Error(
    'Constants config file not found. Expected at config/constants.json\n' +
    'You can also set CONSTANTS_PATH environment variable to specify a custom path.'
  );
}

// [NOTE]: Clear cached config (useful for testing or reloading)
export function clearConfigCache(): void {
  cachedConfig = null;
}

// [NOTE]: Get file extensions for a skill term
export function getFileExtensions(term: string): string[] {
  const config = loadSkillsConfig();
  return config.fileExtensions[term.toLowerCase()] || [];
}

// [NOTE]: Expand short term to full term
export function expandShortTerm(term: string): string {
  const config = loadSkillsConfig();
  return config.shortTermExpansions[term.toLowerCase()] || term;
}

// [NOTE]: Get scoring config
export function getScoringConfig() {
  const config = loadSkillsConfig();
  return config.scoring;
}
