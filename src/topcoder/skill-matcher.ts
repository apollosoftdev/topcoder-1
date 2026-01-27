import { TopcoderSkillsAPI } from './skills-api';
import { TopcoderSkill } from '../utils/cache';
import { loadSkillsConfig } from '../utils/config';

// [NOTE]: Intermediate result before scoring
export interface MatchedSkill {
  skill: TopcoderSkill;
  matchedTerms: string[]; // [NOTE]: GitHub terms that matched this skill
  rawScore: number; // [NOTE]: Weighted count before normalization
}

// [NOTE]: Load tech aliases from config file (config/skills.json)
function getTechAliases(): Record<string, string[]> {
  const config = loadSkillsConfig();
  return config.techAliases;
}

export class SkillMatcher {
  private skillsApi: TopcoderSkillsAPI;
  private aliasToSkill: Map<string, string> = new Map(); // [NOTE]: alias -> skill name lookup

  constructor(skillsApi: TopcoderSkillsAPI) {
    this.skillsApi = skillsApi;
    this.buildAliasIndex();
  }

  // [NOTE]: Build reverse lookup from aliases to skill names (from config)
  private buildAliasIndex(): void {
    const techAliases = getTechAliases();
    for (const [skillName, aliases] of Object.entries(techAliases)) {
      for (const alias of aliases) {
        this.aliasToSkill.set(alias.toLowerCase(), skillName);
      }
      // [NOTE]: Also map the skill name itself
      this.aliasToSkill.set(skillName.toLowerCase(), skillName);
    }
  }

  // [!IMPORTANT]: Main matching function - maps tech terms to Topcoder skills (async)
  async matchTechnologies(techCounts: Map<string, number>): Promise<MatchedSkill[]> {
    const skillScores: Map<string, { score: number; terms: string[] }> = new Map();
    const pendingSearches: Array<{ tech: string; count: number }> = [];

    // [NOTE]: First pass - handle alias matches immediately
    for (const [tech, count] of techCounts.entries()) {
      const normalizedTech = tech.toLowerCase();
      const matchedSkillName = this.aliasToSkill.get(normalizedTech);

      if (matchedSkillName) {
        const existing = skillScores.get(matchedSkillName) || { score: 0, terms: [] };
        existing.score += count;
        if (!existing.terms.includes(tech)) {
          existing.terms.push(tech);
        }
        skillScores.set(matchedSkillName, existing);
      } else {
        // [NOTE]: Queue for API search
        pendingSearches.push({ tech, count });
      }
    }

    // [NOTE]: Second pass - batch API searches for non-aliased terms
    for (const { tech, count } of pendingSearches) {
      const searchResults = await this.skillsApi.searchSkillsAsync(tech);

      if (searchResults.length > 0) {
        const bestMatch = searchResults[0];

        // [NOTE]: Only accept match if it's reasonable
        if (this.isReasonableMatch(tech, bestMatch.name)) {
          const existing = skillScores.get(bestMatch.name) || { score: 0, terms: [] };
          existing.score += count * 0.5; // [NOTE]: Lower weight for API matches
          if (!existing.terms.includes(tech)) {
            existing.terms.push(tech);
          }
          skillScores.set(bestMatch.name, existing);
        }
      }
    }

    // [NOTE]: Convert to MatchedSkill array with Topcoder skill objects
    const matchedSkills: MatchedSkill[] = [];

    for (const [skillName, { score, terms }] of skillScores.entries()) {
      // [NOTE]: Try to get skill from cache first
      let skill = this.skillsApi.getSkillByName(skillName);

      // [NOTE]: If not in cache, search via API
      if (!skill) {
        const searchResults = await this.skillsApi.searchSkillsAsync(skillName);
        if (searchResults.length > 0) {
          skill = searchResults[0];
        }
      }

      if (skill) {
        matchedSkills.push({
          skill,
          matchedTerms: terms,
          rawScore: score,
        });
      }
    }

    // [NOTE]: Sort by raw score descending
    return matchedSkills.sort((a, b) => b.rawScore - a.rawScore);
  }

  // [NOTE]: Convenience method to get top N matches (async)
  async getTopMatches(techCounts: Map<string, number>, limit: number = 20): Promise<MatchedSkill[]> {
    const matches = await this.matchTechnologies(techCounts);
    return matches.slice(0, limit);
  }

  // [NOTE]: Check if a fuzzy match is reasonable (not too different from the query)
  private isReasonableMatch(query: string, skillName: string): boolean {
    const queryLower = query.toLowerCase();
    const skillLower = skillName.toLowerCase();

    // [NOTE]: Exact match is always good
    if (skillLower === queryLower) return true;

    // [NOTE]: Skill name starts with query - good match
    if (skillLower.startsWith(queryLower)) return true;

    // [NOTE]: Query starts with skill name - good match
    // But "reactjs" -> "React" is fine, "javascript" -> "Java" is not
    if (queryLower.startsWith(skillLower) && queryLower.length <= skillLower.length + 3) return true;

    // [NOTE]: Check if query appears as a whole word in skill name
    const wordBoundary = new RegExp(`\\b${this.escapeRegex(queryLower)}\\b`, 'i');
    if (wordBoundary.test(skillLower)) return true;

    // [NOTE]: Reject if skill name is much longer than query (likely a poor match)
    if (skillLower.length > queryLower.length * 3) return false;

    // [NOTE]: Check similarity ratio - query should be significant part of skill name
    const ratio = queryLower.length / skillLower.length;
    return ratio > 0.4;
  }

  // [NOTE]: Escape special regex characters
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
