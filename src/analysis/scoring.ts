import { CollectedGitHubData, TopcoderSkill, RepoData } from '../utils/cache';
import { MatchedSkill } from '../topcoder/skill-matcher';
import { Evidence, collectEvidence } from './evidence';
import { loadSkillsConfig, getFileExtensions, getExplanationThresholds, areTermsAliases } from '../utils/config';
import { isWholeWordMatch } from '../utils/string-utils';

// [NOTE]: Helper to extract searchable terms from a repo
function getRepoTerms(repo: RepoData): string[] {
  const terms = [
    ...Object.keys(repo.languages).map(l => l.toLowerCase()),
    ...repo.topics.map(t => t.toLowerCase()),
  ];
  if (repo.language) {
    terms.push(repo.language.toLowerCase());
  }
  return terms;
}

// [NOTE]: Check if two terms match (exact, normalized, or aliases) - uses config/constants.json
function termsMatch(term1: string, term2: string): boolean {
  return areTermsAliases(term1, term2);
}

// [NOTE]: Check if any skill term matches any repo term
function termsMatchRepo(skillTerms: string[], repoTerms: string[]): boolean {
  return skillTerms.some(t => repoTerms.some(rt => termsMatch(t, rt)));
}

// [!IMPORTANT]: Final output structure for each skill recommendation
export interface ScoredSkill {
  skill: TopcoderSkill;
  score: number; // [NOTE]: 0-100 confidence score
  components: ScoreComponents;
  evidence: Evidence[];
  explanation: string;
  inferredFrom?: string[]; // [NEW]: Skills this was inferred from (hierarchy/category)
}

// [NOTE]: Breakdown of how the score was calculated
export interface ScoreComponents {
  languageScore: number;
  commitScore: number;
  prScore: number;
  projectQualityScore: number;
  recencyScore: number;
}

// [NOTE]: Configurable weights for scoring algorithm
export interface ScoringConfig {
  weights: {
    language: number;
    commits: number;
    prs: number;
    projectQuality: number;
    recency: number;
  };
  maxScore: number;
  baseScore: number; // [NOTE]: Minimum score for any matched skill
}

// [!IMPORTANT]: Load config from JSON file (config/skills.json)
function getDefaultConfig(): ScoringConfig {
  const jsonConfig = loadSkillsConfig();
  return {
    weights: jsonConfig.scoring.weights,
    maxScore: jsonConfig.scoring.maxScore,
    baseScore: jsonConfig.scoring.baseScore,
  };
}

export class ScoringEngine {
  private config: ScoringConfig;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  // [!IMPORTANT]: Main scoring function - processes all matched skills
  scoreSkills(
    matchedSkills: MatchedSkill[],
    data: CollectedGitHubData
  ): ScoredSkill[] {
    // [NOTE]: Calculate total raw score for normalization
    const totalRawScore = matchedSkills.reduce((sum, s) => sum + s.rawScore, 0);
    const maxRawScore = Math.max(...matchedSkills.map(s => s.rawScore), 1);

    return matchedSkills.map(match =>
      this.scoreSkill(match, data, maxRawScore, totalRawScore)
    );
  }

  // [NOTE]: Scores individual skill based on multiple factors
  private scoreSkill(
    match: MatchedSkill,
    data: CollectedGitHubData,
    maxRawScore: number,
    totalRawScore: number
  ): ScoredSkill {
    const skillTerms = match.matchedTerms.map(t => t.toLowerCase());
    const skillName = match.skill.name.toLowerCase();
    const allTerms = [...new Set([skillName, ...skillTerms])];

    // [NOTE]: Calculate each component score (0-100)
    const languageScore = this.calculateLanguageScore(
      allTerms,
      data,
      maxRawScore,
      totalRawScore,
      match.rawScore
    );

    const commitScore = this.calculateCommitScore(allTerms, data);
    const prScore = this.calculatePRScore(allTerms, data);
    const projectQualityScore = this.calculateProjectQualityScore(allTerms, data);
    const recencyScore = this.calculateRecencyScore(allTerms, data);

    const components: ScoreComponents = {
      languageScore,
      commitScore,
      prScore,
      projectQualityScore,
      recencyScore,
    };

    // [!IMPORTANT]: Weighted sum of all components + base score
    const { weights, baseScore } = this.config;
    const weightedScore =
      languageScore * weights.language +
      commitScore * weights.commits +
      prScore * weights.prs +
      projectQualityScore * weights.projectQuality +
      recencyScore * weights.recency;

    // [NOTE]: Add base score and cap at max
    const score = Math.min(
      Math.round(baseScore + weightedScore * ((100 - baseScore) / 100)),
      this.config.maxScore
    );

    const evidence = collectEvidence(allTerms, data);
    const explanation = this.generateExplanation(match.skill.name, components, score);

    return {
      skill: match.skill,
      score,
      components,
      evidence,
      explanation,
      inferredFrom: match.inferredFrom,
    };
  }

  // [NOTE]: Get file extensions for a skill term (from config)
  private getExtensionsForTerm(term: string): string[] {
    return getFileExtensions(term);
  }

  // [NOTE]: Check if a filename matches skill extensions
  private fileMatchesSkill(filename: string, terms: string[]): boolean {
    const fileLower = filename.toLowerCase();

    for (const term of terms) {
      const extensions = this.getExtensionsForTerm(term);
      if (extensions.some(ext => fileLower.endsWith(ext))) {
        return true;
      }
      // [NOTE]: Check if term appears as whole word in filename (prevents "java" in "javascript-utils.ts")
      if (isWholeWordMatch(fileLower, term)) {
        return true;
      }
    }
    return false;
  }

  // [NOTE]: Score based on language bytes in repos (improved)
  private calculateLanguageScore(
    terms: string[],
    data: CollectedGitHubData,
    maxRawScore: number,
    totalRawScore: number,
    rawScore: number
  ): number {
    // [NOTE]: Calculate relative importance (what % of detected skills is this)
    const relativeImportance = totalRawScore > 0 ? (rawScore / totalRawScore) * 100 : 0;

    // [NOTE]: Calculate rank-based score (top skill gets 100, scales down)
    const rankScore = (rawScore / maxRawScore) * 80;

    // [NOTE]: Count repos using this skill/language
    let matchingRepos = 0;
    let totalLanguageBytes = 0;
    let skillLanguageBytes = 0;

    for (const repo of data.repos) {
      const repoTerms = getRepoTerms(repo);

      // [NOTE]: Check if repo uses this skill
      if (termsMatchRepo(terms, repoTerms)) {
        matchingRepos++;

        // [NOTE]: Sum language bytes
        for (const [lang, bytes] of Object.entries(repo.languages)) {
          totalLanguageBytes += bytes;
          // Use exact/normalized matching for language names
          if (terms.some(t => termsMatch(t, lang.toLowerCase()))) {
            skillLanguageBytes += bytes;
          }
        }
      }
    }

    // [NOTE]: Calculate repo coverage bonus
    const repoCoverage = data.repos.length > 0 ? (matchingRepos / data.repos.length) * 100 : 0;
    const repoBonus = Math.min(repoCoverage * 0.5, 30);

    // [NOTE]: Calculate byte percentage bonus (if applicable)
    const bytePercentage = totalLanguageBytes > 0 ? (skillLanguageBytes / totalLanguageBytes) * 100 : 0;
    const byteBonus = Math.min(bytePercentage * 0.3, 20);

    // [NOTE]: Combine scores
    const combinedScore = rankScore + repoBonus + byteBonus + (relativeImportance * 0.2);

    return Math.min(Math.round(combinedScore), 100);
  }

  // [NOTE]: Score based on commit messages and files changed (improved)
  private calculateCommitScore(terms: string[], data: CollectedGitHubData): number {
    if (data.commits.length === 0) return 0;

    let relevantCommits = 0;
    let strongMatches = 0;

    for (const commit of data.commits) {
      const messageLower = commit.message.toLowerCase();
      const filesLower = commit.filesChanged.map(f => f.toLowerCase());

      // [NOTE]: Check file extensions first (more reliable)
      const hasMatchingFile = filesLower.some(file => this.fileMatchesSkill(file, terms));

      // [NOTE]: Check commit message - use whole word matching to prevent "java" matching "javascript"
      const hasMatchingMessage = terms.some(t => isWholeWordMatch(messageLower, t));

      if (hasMatchingFile) {
        relevantCommits++;
        strongMatches++;
      } else if (hasMatchingMessage) {
        relevantCommits++;
      }
    }

    if (relevantCommits === 0) return 0;

    // [NOTE]: Calculate scores
    const fileMatchScore = (strongMatches / data.commits.length) * 60;
    const messageMatchScore = ((relevantCommits - strongMatches) / data.commits.length) * 30;
    const volumeBonus = Math.min(relevantCommits / 5, 20); // [NOTE]: Up to 20 bonus for 100+ commits

    return Math.min(Math.round(fileMatchScore + messageMatchScore + volumeBonus), 100);
  }

  // [NOTE]: Score based on PR titles/descriptions and merge rate
  private calculatePRScore(terms: string[], data: CollectedGitHubData): number {
    if (data.pullRequests.length === 0) return 20; // [NOTE]: Base score if no PRs (not everyone uses PRs)

    let relevantPRs = 0;
    let mergedPRs = 0;

    for (const pr of data.pullRequests) {
      const textLower = `${pr.title} ${pr.body || ''}`.toLowerCase();

      // [NOTE]: Check PR content for skill terms - use whole word matching
      const hasMatchingContent = terms.some(t => isWholeWordMatch(textLower, t));

      if (hasMatchingContent) {
        relevantPRs++;
        if (pr.merged) mergedPRs++;
      }
    }

    if (relevantPRs === 0) return 20;

    const relevanceScore = (relevantPRs / data.pullRequests.length) * 50;
    const mergeRate = relevantPRs > 0 ? (mergedPRs / relevantPRs) * 40 : 0;
    const volumeBonus = Math.min(relevantPRs * 2, 10);

    return Math.min(Math.round(relevanceScore + mergeRate + volumeBonus), 100);
  }

  // [NOTE]: Score based on stars and forks (project popularity)
  private calculateProjectQualityScore(terms: string[], data: CollectedGitHubData): number {
    let totalStars = 0;
    let totalForks = 0;
    let relevantRepos = 0;
    let ownedRepos = 0;

    for (const repo of data.repos) {
      const repoTerms = getRepoTerms(repo);

      if (termsMatchRepo(terms, repoTerms)) {
        relevantRepos++;
        totalStars += repo.stars;
        totalForks += repo.forks;
        if (repo.isOwner) ownedRepos++;
      }
    }

    if (relevantRepos === 0) return 0;

    // [NOTE]: Better scoring that doesn't require many stars
    const hasReposScore = Math.min(relevantRepos * 10, 40);
    const ownedRepoScore = Math.min(ownedRepos * 5, 20);
    const starScore = Math.min(Math.log10(totalStars + 1) * 15, 25);
    const forkScore = Math.min(Math.log10(totalForks + 1) * 10, 15);

    return Math.min(Math.round(hasReposScore + ownedRepoScore + starScore + forkScore), 100);
  }

  // [NOTE]: Score based on recent activity (last 6-12 months)
  private calculateRecencyScore(terms: string[], data: CollectedGitHubData): number {
    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const twoYearsAgo = now - 730 * 24 * 60 * 60 * 1000;

    let veryRecentRepos = 0;  // Last 6 months
    let recentRepos = 0;      // Last year
    let olderRepos = 0;       // Last 2 years
    let matchingRepos = 0;

    for (const repo of data.repos) {
      const repoTerms = getRepoTerms(repo);

      if (termsMatchRepo(terms, repoTerms)) {
        matchingRepos++;
        const updatedAt = new Date(repo.updatedAt).getTime();

        if (updatedAt > sixMonthsAgo) veryRecentRepos++;
        else if (updatedAt > oneYearAgo) recentRepos++;
        else if (updatedAt > twoYearsAgo) olderRepos++;
      }
    }

    if (matchingRepos === 0) return 0;

    // [NOTE]: Recent commits with skill
    let recentCommits = 0;
    for (const commit of data.commits) {
      const commitDate = new Date(commit.date).getTime();
      if (commitDate > oneYearAgo) {
        const filesLower = commit.filesChanged.map(f => f.toLowerCase());
        if (filesLower.some(file => this.fileMatchesSkill(file, terms))) {
          recentCommits++;
        }
      }
    }

    // [NOTE]: Calculate recency score
    const veryRecentScore = Math.min(veryRecentRepos * 15, 50);
    const recentScore = Math.min(recentRepos * 8, 25);
    const olderScore = Math.min(olderRepos * 3, 10);
    const commitBonus = Math.min(recentCommits / 2, 15);

    return Math.min(Math.round(veryRecentScore + recentScore + olderScore + commitBonus), 100);
  }

  // [NOTE]: Generate human-readable explanation for the score
  private generateExplanation(
    skillName: string,
    components: ScoreComponents,
    score: number
  ): string {
    const parts: string[] = [];

    // [NOTE]: Get thresholds from config (config/constants.json)
    const T = getExplanationThresholds();

    // [NOTE]: Describe language score
    if (components.languageScore >= T.languageStrong) {
      parts.push(`Strong ${skillName} usage in repositories`);
    } else if (components.languageScore >= T.languageModerate) {
      parts.push(`Moderate ${skillName} experience`);
    } else if (components.languageScore > 0) {
      parts.push(`Some ${skillName} usage detected`);
    }

    // [NOTE]: Describe activity
    if (components.commitScore >= T.commitActive) {
      parts.push('active commit history');
    }

    if (components.prScore >= T.prSignificant) {
      parts.push('significant PR contributions');
    }

    if (components.projectQualityScore >= T.projectQuality) {
      parts.push('quality projects');
    }

    // [NOTE]: Describe recency
    if (components.recencyScore >= T.recencyRecent) {
      parts.push('recent activity');
    } else if (components.recencyScore >= T.recencyOngoing) {
      parts.push('ongoing usage');
    }

    if (parts.length === 0) {
      if (score >= T.scoreSolid) {
        return `Solid experience with ${skillName} based on repository analysis`;
      } else if (score >= T.scoreWorking) {
        return `Working knowledge of ${skillName} detected`;
      }
      return `Basic exposure to ${skillName} detected`;
    }

    // [NOTE]: Capitalize first letter
    const explanation = parts.join(', ');
    return explanation.charAt(0).toUpperCase() + explanation.slice(1);
  }
}

// [NOTE]: Filter and sort skills by score, with minimum threshold from config
export function getTopScoredSkills(skills: ScoredSkill[], limit: number = 20): ScoredSkill[] {
  const config = loadSkillsConfig();
  const minThreshold = config.scoring.minScoreThreshold;

  return skills
    .filter(s => s.score >= minThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
