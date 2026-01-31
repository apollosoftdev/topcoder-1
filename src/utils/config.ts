import * as fs from 'fs';
import * as path from 'path';

// [NOTE]: Skill hierarchy entry - defines implied/related skills
export interface SkillHierarchyEntry {
  implies: string[];      // Skills that this skill implies (e.g., "React Native" implies "React")
  weight?: number;        // Weight multiplier for implied skills (default: 0.7)
}

// [NOTE]: GitHub API configuration
export interface GitHubConfig {
  maxRepos: number;
  maxCommitsPerRepo: number;
  maxPRsPerRepo: number;
  maxStars: number;
  maxGists: number;
  includeOrgRepos: boolean;
  repoType: 'all' | 'owner' | 'public' | 'private' | 'member';
}

// [NOTE]: Output configuration
export interface OutputConfig {
  enableSkillLimit: boolean;
  maxSkillsToReport: number;
}

// [NOTE]: Rate limit configuration
export interface RateLimitConfig {
  minRemaining: number;
}

// [NOTE]: Constants configuration loaded from config/constants.json
export interface ConstantsConfig {
  github: GitHubConfig;
  output: OutputConfig;
  rateLimit: RateLimitConfig;
  shortTermExpansions: Record<string, string>;
  languageAliases: Record<string, string[]>;
  skillHierarchy?: Record<string, SkillHierarchyEntry>;  // [NEW]: Skill hierarchy for transitive inference
  categoryInference?: {
    enabled: boolean;     // Whether to infer category as a skill
    weight: number;       // Weight multiplier for category skills (default: 0.5)
  };
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
    path.join(process.cwd(), 'config', 'constants.json'),       // Project root
    path.join(__dirname, '..', 'config', 'constants.json'),     // dist/config (when running from dist)
    path.join(__dirname, '..', '..', 'config', 'constants.json'), // src -> config (when running from source)
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

// [NOTE]: Get language aliases mapping
export function getLanguageAliases(): Record<string, string[]> {
  const config = loadSkillsConfig();
  return config.languageAliases;
}

// [NOTE]: Check if two terms are aliases of each other (e.g., "C#" and "csharp")
export function areTermsAliases(term1: string, term2: string): boolean {
  const aliases = getLanguageAliases();
  const normalize = (s: string) => s.toLowerCase().replace(/[.\s-]/g, '');
  const t1 = normalize(term1);
  const t2 = normalize(term2);

  // Check exact match
  if (t1 === t2) return true;

  // Check if both terms belong to the same alias group
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    const allForms = [canonical, ...aliasList].map(normalize);
    if (allForms.includes(t1) && allForms.includes(t2)) {
      return true;
    }
  }

  return false;
}

// [NOTE]: Get skill hierarchy mapping for transitive inference
export function getSkillHierarchy(): Record<string, SkillHierarchyEntry> {
  const config = loadSkillsConfig();
  return config.skillHierarchy || {};
}

// [NOTE]: Get implied skills for a given skill name
export function getImpliedSkills(skillName: string): { skill: string; weight: number }[] {
  const hierarchy = getSkillHierarchy();
  const skillLower = skillName.toLowerCase();

  // Find matching hierarchy entry (case-insensitive)
  for (const [key, entry] of Object.entries(hierarchy)) {
    if (key.toLowerCase() === skillLower) {
      const weight = entry.weight ?? 0.7;
      return entry.implies.map(s => ({ skill: s, weight }));
    }
  }

  return [];
}

// [NOTE]: Get category inference configuration
export function getCategoryInferenceConfig(): { enabled: boolean; weight: number } {
  const config = loadSkillsConfig();
  return config.categoryInference || { enabled: true, weight: 0.5 };
}

// [NOTE]: Get GitHub configuration
export function getGitHubConfig(): GitHubConfig {
  const config = loadSkillsConfig();
  return config.github || {
    maxRepos: 500,
    maxCommitsPerRepo: 200,
    maxPRsPerRepo: 50,
    maxStars: 100,
    maxGists: 50,
    includeOrgRepos: true,
    repoType: 'all',
  };
}

// [NOTE]: Get output configuration
export function getOutputConfig(): OutputConfig {
  const config = loadSkillsConfig();
  return config.output || {
    enableSkillLimit: false,
    maxSkillsToReport: 50,
  };
}

// [NOTE]: Get rate limit configuration
export function getRateLimitConfig(): RateLimitConfig {
  const config = loadSkillsConfig();
  return config.rateLimit || {
    minRemaining: 100,
  };
}

