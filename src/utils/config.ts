import * as fs from 'fs';
import * as path from 'path';

// [NOTE]: Constants configuration loaded from config/constants.json
export interface ConstantsConfig {
  shortTermExpansions: Record<string, string>;
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
  explanationThresholds: {
    languageStrong: number;
    languageModerate: number;
    commitActive: number;
    prSignificant: number;
    projectQuality: number;
    recencyRecent: number;
    recencyOngoing: number;
    scoreSolid: number;
    scoreWorking: number;
  };
  evidence: {
    maxPerSkill: number;
    repoLimit: number;
    prLimit: number;
    commitLimit: number;
    starLimit: number;
  };
  extensionToTech: Record<string, string>;
  specialFiles: Record<string, string>;
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
      console.error('Failed to parse config at %s:', configPath, error);
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

// [NOTE]: Get file extensions for a tech term (derived from extensionToTech)
export function getFileExtensions(term: string): string[] {
  const config = loadSkillsConfig();
  const termLower = term.toLowerCase();
  const extensions: string[] = [];

  // Reverse lookup: find all extensions that map to this tech
  for (const [ext, tech] of Object.entries(config.extensionToTech)) {
    if (tech.toLowerCase() === termLower) {
      extensions.push(ext);
    }
  }

  return extensions;
}

// [NOTE]: Expand short term to full term
export function expandShortTerm(term: string): string {
  const config = loadSkillsConfig();
  const termLower = term.toLowerCase();

  // Use Object.prototype.hasOwnProperty.call to safely check property existence and prevent prototype pollution
  if (Object.prototype.hasOwnProperty.call(config.shortTermExpansions, termLower)) {
    return config.shortTermExpansions[termLower];
  }
  return term;
}

// [NOTE]: Get scoring config
export function getScoringConfig() {
  const config = loadSkillsConfig();
  return config.scoring;
}

// [NOTE]: Get explanation thresholds
export function getExplanationThresholds() {
  const config = loadSkillsConfig();
  return config.explanationThresholds;
}

// [NOTE]: Get evidence configuration
export function getEvidenceConfig() {
  const config = loadSkillsConfig();
  return config.evidence;
}

// [NOTE]: Get extension to tech mapping
export function getExtensionToTech(): Record<string, string> {
  const config = loadSkillsConfig();
  return config.extensionToTech;
}

// [NOTE]: Get special files mapping
export function getSpecialFiles(): Record<string, string> {
  const config = loadSkillsConfig();
  return config.specialFiles;
}

