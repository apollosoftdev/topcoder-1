import { TopcoderSkillsAPI } from './skills-api';
import { TopcoderSkill } from '../utils/cache';
import { loadSkillsConfig, getImpliedSkills, getCategoryInferenceConfig } from '../utils/config';
import { isWholeWordMatch } from '../utils/string-utils';

// [NOTE]: Intermediate result before scoring
export interface MatchedSkill {
  skill: TopcoderSkill;
  matchedTerms: string[]; // [NOTE]: GitHub terms that matched this skill
  rawScore: number; // [NOTE]: Weighted count before normalization
  inferredFrom?: string[]; // [NEW]: Skills this was inferred from (hierarchy/category)
}

export class SkillMatcher {
  private skillsApi: TopcoderSkillsAPI;

  constructor(skillsApi: TopcoderSkillsAPI) {
    this.skillsApi = skillsApi;
  }

  // [!IMPORTANT]: Main matching function - maps tech terms to Topcoder skills via API
  async matchTechnologies(techCounts: Map<string, number>): Promise<MatchedSkill[]> {
    const skillScores: Map<string, { skill: TopcoderSkill; score: number; terms: string[]; inferredFrom: string[] }> = new Map();

    // [NOTE]: Local cache to avoid duplicate API searches within this call
    const searchCache: Map<string, TopcoderSkill | null> = new Map();

    // [NOTE]: Helper to search with local caching
    const cachedSearch = async (term: string): Promise<TopcoderSkill | null> => {
      const cacheKey = term.toLowerCase();
      if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey) || null;
      }

      const results = await this.skillsApi.searchSkillsAsync(term);
      const skill = results.length > 0 ? results[0] : null;
      searchCache.set(cacheKey, skill);
      return skill;
    };

    // [NOTE]: Helper to add or update a skill score
    const addSkillScore = (
      skill: TopcoderSkill,
      score: number,
      term: string,
      inferredFrom?: string
    ) => {
      const skillKey = skill.id;
      const existing = skillScores.get(skillKey);

      if (existing) {
        existing.score += score;
        if (!existing.terms.includes(term)) {
          existing.terms.push(term);
        }
        if (inferredFrom && !existing.inferredFrom.includes(inferredFrom)) {
          existing.inferredFrom.push(inferredFrom);
        }
      } else {
        skillScores.set(skillKey, {
          skill,
          score,
          terms: [term],
          inferredFrom: inferredFrom ? [inferredFrom] : [],
        });
      }
    };

    // [NOTE]: Track matched skills for hierarchy/category inference
    const directlyMatchedSkills: { skill: TopcoderSkill; term: string; count: number }[] = [];

    // [NOTE]: Phase 1 - Direct matching: Process each technology term
    for (const [tech, count] of techCounts.entries()) {
      // [NOTE]: Expand short terms before searching
      const searchTerm = this.expandTerm(tech);

      // [NOTE]: Skip very short or generic terms
      if (searchTerm.length < 2) continue;

      // [NOTE]: Search via API with local caching
      const bestMatch = await cachedSearch(searchTerm);

      if (bestMatch && this.isReasonableMatch(searchTerm, bestMatch.name)) {
        addSkillScore(bestMatch, count, tech);
        directlyMatchedSkills.push({ skill: bestMatch, term: tech, count });
      }
    }

    // [NOTE]: Phase 2 - Hierarchy inference: Add implied skills from hierarchy
    // Collect all unique implied skills first to batch and deduplicate
    const impliedSkillsToSearch: Map<string, { sources: string[]; totalWeight: number }> = new Map();

    for (const { skill, count } of directlyMatchedSkills) {
      const impliedSkills = getImpliedSkills(skill.name);

      for (const { skill: impliedSkillName, weight } of impliedSkills) {
        const key = impliedSkillName.toLowerCase();
        const existing = impliedSkillsToSearch.get(key);
        const weightedScore = count * weight;

        if (existing) {
          existing.totalWeight += weightedScore;
          if (!existing.sources.includes(skill.name)) {
            existing.sources.push(skill.name);
          }
        } else {
          impliedSkillsToSearch.set(key, {
            sources: [skill.name],
            totalWeight: weightedScore,
          });
        }
      }
    }

    // [NOTE]: Search for implied skills (deduplicated)
    for (const [impliedSkillName, { sources, totalWeight }] of impliedSkillsToSearch.entries()) {
      const impliedSkill = await cachedSearch(impliedSkillName);

      if (impliedSkill && this.isReasonableMatch(impliedSkillName, impliedSkill.name)) {
        addSkillScore(impliedSkill, totalWeight, impliedSkillName, sources.join(', '));
      }
    }

    // [NOTE]: Phase 3 - Category inference: Add category as a skill
    const categoryConfig = getCategoryInferenceConfig();
    if (categoryConfig.enabled) {
      // Collect unique categories first
      const categoriesToSearch: Map<string, { sources: string[]; totalWeight: number }> = new Map();

      for (const { skill, count } of directlyMatchedSkills) {
        if (skill.category) {
          const key = skill.category.toLowerCase();
          const existing = categoriesToSearch.get(key);
          const weightedScore = count * categoryConfig.weight;

          if (existing) {
            existing.totalWeight += weightedScore;
            if (!existing.sources.includes(skill.name)) {
              existing.sources.push(skill.name);
            }
          } else {
            categoriesToSearch.set(key, {
              sources: [skill.name],
              totalWeight: weightedScore,
            });
          }
        }
      }

      // Search for category skills (deduplicated)
      for (const [categoryName, { sources, totalWeight }] of categoriesToSearch.entries()) {
        const categorySkill = await cachedSearch(categoryName);

        if (categorySkill && this.isReasonableMatch(categoryName, categorySkill.name)) {
          addSkillScore(categorySkill, totalWeight, categoryName, `${sources.join(', ')} (category)`);
        }
      }
    }

    // [NOTE]: Convert to MatchedSkill array
    const matchedSkills: MatchedSkill[] = Array.from(skillScores.values()).map(
      ({ skill, score, terms, inferredFrom }) => ({
        skill,
        matchedTerms: terms,
        rawScore: score,
        inferredFrom: inferredFrom.length > 0 ? inferredFrom : undefined,
      })
    );

    // [NOTE]: Sort by raw score descending
    return matchedSkills.sort((a, b) => b.rawScore - a.rawScore);
  }

  // [NOTE]: Convenience method to get top N matches
  async getTopMatches(techCounts: Map<string, number>, limit: number = 20): Promise<MatchedSkill[]> {
    const matches = await this.matchTechnologies(techCounts);
    return matches.slice(0, limit);
  }

  // [NOTE]: Check if a match is reasonable (not too different from the query)
  private isReasonableMatch(query: string, skillName: string): boolean {
    const queryLower = query.toLowerCase();
    const skillLower = skillName.toLowerCase();

    // [NOTE]: Exact match is always good
    if (skillLower === queryLower) return true;

    // [NOTE]: Skill name starts with query - good match
    if (skillLower.startsWith(queryLower)) return true;

    // [NOTE]: Query starts with skill name (e.g., "reactjs" -> "React.js")
    if (queryLower.startsWith(skillLower.replace(/[.\s-]/g, ''))) return true;

    // [NOTE]: Check if query appears as a whole word in skill name
    // Using string-based word boundary check instead of dynamic RegExp to avoid ReDoS
    if (isWholeWordMatch(skillLower, queryLower)) return true;

    // [NOTE]: Check if skill name contains query (for compound skills)
    if (skillLower.includes(queryLower) && queryLower.length >= 3) {
      // [NOTE]: Reject if skill name is much longer than query
      if (skillLower.length > queryLower.length * 4) return false;
      return true;
    }

    // [NOTE]: Check normalized versions (remove dots, spaces, dashes)
    const normalizedQuery = queryLower.replace(/[.\s-]/g, '');
    const normalizedSkill = skillLower.replace(/[.\s-]/g, '');
    if (normalizedSkill === normalizedQuery) return true;
    if (normalizedSkill.startsWith(normalizedQuery)) return true;

    return false;
  }

  // [NOTE]: Expand short terms to full names (e.g., "js" -> "javascript")
  private expandTerm(term: string): string {
    const config = loadSkillsConfig();
    const shortTermExpansions = config.shortTermExpansions;
    const termLower = term.toLowerCase();

    // Use Object.prototype.hasOwnProperty.call to safely check property existence and prevent prototype pollution
    if (Object.prototype.hasOwnProperty.call(shortTermExpansions, termLower)) {
      return shortTermExpansions[termLower];
    }
    return term;
  }
}
