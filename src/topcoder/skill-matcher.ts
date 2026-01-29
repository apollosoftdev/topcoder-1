import { TopcoderSkillsAPI } from './skills-api';
import { TopcoderSkill } from '../utils/cache';
import { loadSkillsConfig } from '../utils/config';

// [NOTE]: Intermediate result before scoring
export interface MatchedSkill {
  skill: TopcoderSkill;
  matchedTerms: string[]; // [NOTE]: GitHub terms that matched this skill
  rawScore: number; // [NOTE]: Weighted count before normalization
}

export class SkillMatcher {
  private skillsApi: TopcoderSkillsAPI;

  constructor(skillsApi: TopcoderSkillsAPI) {
    this.skillsApi = skillsApi;
  }

  // [!IMPORTANT]: Main matching function - maps tech terms to Topcoder skills via API
  async matchTechnologies(techCounts: Map<string, number>): Promise<MatchedSkill[]> {
    const skillScores: Map<string, { skill: TopcoderSkill; score: number; terms: string[] }> = new Map();

    // [NOTE]: Process each technology term
    for (const [tech, count] of techCounts.entries()) {
      // [NOTE]: Expand short terms before searching
      const searchTerm = this.expandTerm(tech);

      // [NOTE]: Skip very short or generic terms
      if (searchTerm.length < 2) continue;

      // [NOTE]: Search via API (autocomplete + fuzzymatch)
      const searchResults = await this.skillsApi.searchSkillsAsync(searchTerm);

      if (searchResults.length > 0) {
        const bestMatch = searchResults[0];

        // [NOTE]: Validate the match is reasonable
        if (this.isReasonableMatch(searchTerm, bestMatch.name)) {
          const skillKey = bestMatch.id; // [NOTE]: Use ID as key to avoid duplicates
          const existing = skillScores.get(skillKey);

          if (existing) {
            existing.score += count;
            if (!existing.terms.includes(tech)) {
              existing.terms.push(tech);
            }
          } else {
            skillScores.set(skillKey, {
              skill: bestMatch,
              score: count,
              terms: [tech],
            });
          }
        }
      }
    }

    // [NOTE]: Convert to MatchedSkill array
    const matchedSkills: MatchedSkill[] = Array.from(skillScores.values()).map(
      ({ skill, score, terms }) => ({
        skill,
        matchedTerms: terms,
        rawScore: score,
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
    if (this.isWholeWordMatch(skillLower, queryLower)) return true;

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

  // [NOTE]: Safe word boundary check without dynamic RegExp (ReDoS-safe)
  private isWholeWordMatch(text: string, word: string): boolean {
    const wordBoundaryChars = /[^a-z0-9]/i;
    let index = 0;

    while ((index = text.indexOf(word, index)) !== -1) {
      const charBefore = index > 0 ? text[index - 1] : ' ';
      const charAfter = index + word.length < text.length ? text[index + word.length] : ' ';

      const boundaryBefore = wordBoundaryChars.test(charBefore);
      const boundaryAfter = wordBoundaryChars.test(charAfter);

      if (boundaryBefore && boundaryAfter) {
        return true;
      }
      index++;
    }

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
