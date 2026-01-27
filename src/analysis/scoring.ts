import { CollectedGitHubData, TopcoderSkill } from '../utils/cache';
import { MatchedSkill } from '../topcoder/skill-matcher';
import { Evidence, collectEvidence } from './evidence';

export interface ScoredSkill {
  skill: TopcoderSkill;
  score: number;
  components: ScoreComponents;
  evidence: Evidence[];
  explanation: string;
}

export interface ScoreComponents {
  languageScore: number;
  commitScore: number;
  prScore: number;
  projectQualityScore: number;
  recencyScore: number;
}

export interface ScoringConfig {
  weights: {
    language: number;
    commits: number;
    prs: number;
    projectQuality: number;
    recency: number;
  };
  maxScore: number;
}

const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    language: 0.35,
    commits: 0.25,
    prs: 0.15,
    projectQuality: 0.15,
    recency: 0.10,
  },
  maxScore: 100,
};

export class ScoringEngine {
  private config: ScoringConfig;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  scoreSkills(
    matchedSkills: MatchedSkill[],
    data: CollectedGitHubData
  ): ScoredSkill[] {
    const maxRawScore = Math.max(...matchedSkills.map(s => s.rawScore), 1);

    return matchedSkills.map(match => this.scoreSkill(match, data, maxRawScore));
  }

  private scoreSkill(
    match: MatchedSkill,
    data: CollectedGitHubData,
    maxRawScore: number
  ): ScoredSkill {
    const skillTerms = match.matchedTerms.map(t => t.toLowerCase());
    const skillName = match.skill.name.toLowerCase();

    const languageScore = this.calculateLanguageScore(
      skillName,
      skillTerms,
      data,
      maxRawScore,
      match.rawScore
    );

    const commitScore = this.calculateCommitScore(skillTerms, data);
    const prScore = this.calculatePRScore(skillTerms, data);
    const projectQualityScore = this.calculateProjectQualityScore(skillTerms, data);
    const recencyScore = this.calculateRecencyScore(skillTerms, data);

    const components: ScoreComponents = {
      languageScore,
      commitScore,
      prScore,
      projectQualityScore,
      recencyScore,
    };

    const { weights } = this.config;
    const rawTotal =
      languageScore * weights.language +
      commitScore * weights.commits +
      prScore * weights.prs +
      projectQualityScore * weights.projectQuality +
      recencyScore * weights.recency;

    const score = Math.min(Math.round(rawTotal), this.config.maxScore);
    const evidence = collectEvidence(match.skill.name, skillTerms, data);
    const explanation = this.generateExplanation(match.skill.name, components, score);

    return {
      skill: match.skill,
      score,
      components,
      evidence,
      explanation,
    };
  }

  private calculateLanguageScore(
    skillName: string,
    terms: string[],
    data: CollectedGitHubData,
    maxRawScore: number,
    rawScore: number
  ): number {
    const normalizedScore = (rawScore / maxRawScore) * 100;

    let languageBonus = 0;
    for (const repo of data.repos) {
      const repoLanguages = Object.keys(repo.languages).map(l => l.toLowerCase());
      if (terms.some(t => repoLanguages.includes(t)) || repoLanguages.includes(skillName)) {
        languageBonus += 5;
      }
    }

    return Math.min(normalizedScore + languageBonus, 100);
  }

  private calculateCommitScore(terms: string[], data: CollectedGitHubData): number {
    if (data.commits.length === 0) return 0;

    let relevantCommits = 0;
    for (const commit of data.commits) {
      const messageLower = commit.message.toLowerCase();
      const filesLower = commit.filesChanged.map(f => f.toLowerCase());

      if (
        terms.some(t => messageLower.includes(t)) ||
        terms.some(t => filesLower.some(f => f.includes(t)))
      ) {
        relevantCommits++;
      }
    }

    const percentage = (relevantCommits / data.commits.length) * 100;
    const countBonus = Math.min(relevantCommits / 10, 30);

    return Math.min(percentage + countBonus, 100);
  }

  private calculatePRScore(terms: string[], data: CollectedGitHubData): number {
    if (data.pullRequests.length === 0) return 0;

    let relevantPRs = 0;
    let mergedPRs = 0;

    for (const pr of data.pullRequests) {
      const textLower = `${pr.title} ${pr.body || ''}`.toLowerCase();

      if (terms.some(t => textLower.includes(t))) {
        relevantPRs++;
        if (pr.merged) mergedPRs++;
      }
    }

    if (relevantPRs === 0) return 0;

    const relevanceScore = (relevantPRs / data.pullRequests.length) * 50;
    const mergeRate = (mergedPRs / relevantPRs) * 50;

    return Math.min(relevanceScore + mergeRate, 100);
  }

  private calculateProjectQualityScore(terms: string[], data: CollectedGitHubData): number {
    let totalStars = 0;
    let totalForks = 0;
    let relevantRepos = 0;

    for (const repo of data.repos) {
      const repoTerms = [
        repo.language?.toLowerCase(),
        ...Object.keys(repo.languages).map(l => l.toLowerCase()),
        ...repo.topics.map(t => t.toLowerCase()),
      ].filter(Boolean);

      if (terms.some(t => repoTerms.includes(t))) {
        relevantRepos++;
        totalStars += repo.stars;
        totalForks += repo.forks;
      }
    }

    if (relevantRepos === 0) return 0;

    const starScore = Math.min(Math.log10(totalStars + 1) * 20, 50);
    const forkScore = Math.min(Math.log10(totalForks + 1) * 15, 30);
    const repoCountScore = Math.min(relevantRepos * 2, 20);

    return Math.min(starScore + forkScore + repoCountScore, 100);
  }

  private calculateRecencyScore(terms: string[], data: CollectedGitHubData): number {
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;

    let recentActivity = 0;
    let veryRecentActivity = 0;

    for (const repo of data.repos) {
      const repoTerms = [
        repo.language?.toLowerCase(),
        ...Object.keys(repo.languages).map(l => l.toLowerCase()),
        ...repo.topics.map(t => t.toLowerCase()),
      ].filter(Boolean);

      if (terms.some(t => repoTerms.includes(t))) {
        const updatedAt = new Date(repo.updatedAt).getTime();
        if (updatedAt > oneYearAgo) recentActivity++;
        if (updatedAt > sixMonthsAgo) veryRecentActivity++;
      }
    }

    for (const commit of data.commits) {
      const commitDate = new Date(commit.date).getTime();
      if (commitDate > oneYearAgo) {
        const messageLower = commit.message.toLowerCase();
        if (terms.some(t => messageLower.includes(t))) {
          if (commitDate > sixMonthsAgo) veryRecentActivity++;
          else recentActivity++;
        }
      }
    }

    const recentScore = Math.min(recentActivity * 5, 50);
    const veryRecentScore = Math.min(veryRecentActivity * 10, 50);

    return Math.min(recentScore + veryRecentScore, 100);
  }

  private generateExplanation(
    skillName: string,
    components: ScoreComponents,
    score: number
  ): string {
    const parts: string[] = [];

    if (components.languageScore >= 70) {
      parts.push(`Strong ${skillName} usage in repositories`);
    } else if (components.languageScore >= 40) {
      parts.push(`Moderate ${skillName} experience`);
    }

    if (components.commitScore >= 50) {
      parts.push('active commit history');
    }

    if (components.prScore >= 50) {
      parts.push('significant PR contributions');
    }

    if (components.projectQualityScore >= 50) {
      parts.push('high-quality projects');
    }

    if (components.recencyScore >= 70) {
      parts.push('recent activity');
    }

    if (parts.length === 0) {
      return `Basic experience with ${skillName} detected`;
    }

    return parts.join(', ').replace(/^./, c => c.toUpperCase());
  }
}

export function getTopScoredSkills(skills: ScoredSkill[], limit: number = 20): ScoredSkill[] {
  return skills
    .filter(s => s.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
