import { TopcoderSkillsAPI } from './skills-api';
import { TopcoderSkill } from '../utils/cache';

// [NOTE]: Intermediate result before scoring
export interface MatchedSkill {
  skill: TopcoderSkill;
  matchedTerms: string[]; // [NOTE]: GitHub terms that matched this skill
  rawScore: number; // [NOTE]: Weighted count before normalization
}

// [!IMPORTANT]: Maps common tech terms to Topcoder skill names
// Add new aliases here to improve matching accuracy
const TECH_TO_SKILL_ALIASES: Record<string, string[]> = {
  'JavaScript': ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2020'],
  'TypeScript': ['typescript', 'ts'],
  'Python': ['python', 'python3', 'py'],
  'Java': ['java', 'jdk', 'jvm'],
  'C++': ['c++', 'cpp', 'cxx'],
  'C#': ['c#', 'csharp', 'dotnet', '.net'],
  'Go': ['go', 'golang'],
  'Rust': ['rust', 'rustlang'],
  'Ruby': ['ruby', 'rb'],
  'PHP': ['php'],
  'Swift': ['swift'],
  'Kotlin': ['kotlin', 'kt'],
  'Scala': ['scala'],
  'R': ['r', 'rlang'],
  'React.js': ['react', 'reactjs', 'react.js'],
  'Vue.js': ['vue', 'vuejs', 'vue.js'],
  'Angular': ['angular', 'angularjs', 'ng'],
  'Node.js': ['node', 'nodejs', 'node.js'],
  'Express': ['express', 'expressjs'],
  'Django': ['django'],
  'Flask': ['flask'],
  'FastAPI': ['fastapi'],
  'Spring': ['spring', 'spring boot', 'springboot'],
  'Ruby on Rails': ['rails', 'ruby on rails', 'ror'],
  'Laravel': ['laravel'],
  'Next.js': ['next', 'nextjs', 'next.js'],
  'Nuxt': ['nuxt', 'nuxtjs'],
  'Svelte': ['svelte', 'sveltejs'],
  'Docker': ['docker', 'dockerfile', 'container', 'containers'],
  'Kubernetes': ['kubernetes', 'k8s', 'kubectl'],
  'AWS': ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'cloudformation'],
  'Azure': ['azure', 'microsoft azure'],
  'Google Cloud': ['gcp', 'google cloud', 'google cloud platform', 'bigquery'],
  'Terraform': ['terraform', 'hcl', 'infrastructure as code', 'iac'],
  'PostgreSQL': ['postgresql', 'postgres', 'psql'],
  'MySQL': ['mysql', 'mariadb'],
  'MongoDB': ['mongodb', 'mongo', 'mongoose'],
  'Redis': ['redis'],
  'Elasticsearch': ['elasticsearch', 'elastic'],
  'GraphQL': ['graphql', 'apollo', 'hasura'],
  'REST API Development': ['rest', 'restful', 'rest api', 'api'],
  'Git': ['git', 'github', 'gitlab', 'version control'],
  'CI/CD': ['ci', 'cd', 'ci/cd', 'continuous integration', 'continuous deployment', 'github actions', 'jenkins', 'circleci'],
  'Linux': ['linux', 'ubuntu', 'debian', 'centos', 'unix'],
  'Machine Learning': ['machine learning', 'ml', 'deep learning', 'neural network', 'ai'],
  'Data Science': ['data science', 'data analysis', 'pandas', 'numpy', 'jupyter'],
  'TensorFlow': ['tensorflow', 'tf'],
  'PyTorch': ['pytorch', 'torch'],
  'Web Development': ['web development', 'web dev', 'frontend', 'backend', 'fullstack', 'full stack'],
  'Mobile Development': ['mobile', 'mobile development', 'mobile app'],
  'iOS Development': ['ios', 'iphone', 'ipad', 'xcode', 'cocoapods'],
  'Android Development': ['android', 'android studio', 'gradle'],
  'React Native': ['react native', 'react-native', 'expo'],
  'Flutter': ['flutter', 'dart'],
  'Testing': ['testing', 'test', 'unit test', 'integration test', 'e2e', 'jest', 'mocha', 'pytest', 'junit'],
  'Agile': ['agile', 'scrum', 'kanban', 'sprint'],
  'HTML': ['html', 'html5', 'xhtml'],
  'CSS': ['css', 'css3', 'scss', 'sass', 'less', 'tailwind', 'bootstrap'],
  'SQL': ['sql', 'database', 'query'],
  'Shell': ['shell', 'bash', 'zsh', 'scripting'],
  'Webpack': ['webpack'],
  'Vite': ['vite'],
  'npm': ['npm', 'yarn', 'pnpm'],
};

export class SkillMatcher {
  private skillsApi: TopcoderSkillsAPI;
  private aliasToSkill: Map<string, string> = new Map(); // [NOTE]: alias -> skill name lookup

  constructor(skillsApi: TopcoderSkillsAPI) {
    this.skillsApi = skillsApi;
    this.buildAliasIndex();
  }

  // [NOTE]: Build reverse lookup from aliases to skill names
  private buildAliasIndex(): void {
    for (const [skillName, aliases] of Object.entries(TECH_TO_SKILL_ALIASES)) {
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
