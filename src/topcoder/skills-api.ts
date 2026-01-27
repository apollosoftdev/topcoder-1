import { Cache, TopcoderSkill } from '../utils/cache';
import chalk from 'chalk';

// [!IMPORTANT]: Topcoder API base URL - uses dev environment
const TOPCODER_API_BASE = 'https://api.topcoder-dev.com/v5';

// [NOTE]: Category object in standardized skills response
export interface SkillCategoryDto {
  id: string;
  name: string;
  description?: string;
}

// [NOTE]: Raw response from Topcoder Standardized Skills API
export interface TopcoderSkillResponse {
  id: string;
  name: string;
  description?: string;
  category?: SkillCategoryDto;
}

export class TopcoderSkillsAPI {
  private cache: Cache;
  private skills: TopcoderSkill[] = [];
  private skillsByName: Map<string, TopcoderSkill> = new Map(); // [NOTE]: name -> skill lookup
  private skillsById: Map<string, TopcoderSkill> = new Map(); // [NOTE]: id -> skill lookup

  constructor(cache: Cache) {
    this.cache = cache;
  }

  // [!IMPORTANT]: Must call this before using other methods
  async initialize(): Promise<void> {
    // [NOTE]: Try cache first (valid for 24 hours)
    const cached = this.cache.getSkills();
    if (cached) {
      this.skills = cached.skills;
      this.buildIndexes();
      return;
    }

    await this.fetchSkills();
  }

  // [NOTE]: Fetches all skills from Topcoder Standardized Skills API
  private async fetchSkills(): Promise<void> {
    console.log(chalk.gray('Fetching Topcoder skills list...'));

    try {
      // [NOTE]: Use disablePagination=true to get all skills in one request
      const response = await fetch(
        `${TOPCODER_API_BASE}/standardized-skills/skills?disablePagination=true`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch skills: ${response.status}`);
      }

      const data = await response.json() as TopcoderSkillResponse[];

      // [NOTE]: Map API response to internal TopcoderSkill format
      this.skills = data.map(skill => ({
        id: skill.id,
        name: skill.name,
        category: skill.category?.name,
      }));

      this.cache.setSkills(this.skills); // [NOTE]: Cache for 24 hours
      this.buildIndexes();

      console.log(chalk.gray(`Loaded ${this.skills.length} Topcoder skills`));
    } catch (error) {
      // [NOTE]: Use fallback if API fails
      console.error(chalk.yellow('Warning: Could not fetch Topcoder skills. Using fallback list.'));
      this.skills = this.getFallbackSkills();
      this.buildIndexes();
    }
  }

  // [NOTE]: Build lookup indexes for fast access
  private buildIndexes(): void {
    this.skillsByName = new Map();
    this.skillsById = new Map();

    for (const skill of this.skills) {
      this.skillsByName.set(skill.name.toLowerCase(), skill);
      this.skillsById.set(skill.id, skill);
    }
  }

  // [NOTE]: Case-insensitive lookup by name
  getSkillByName(name: string): TopcoderSkill | undefined {
    return this.skillsByName.get(name.toLowerCase());
  }

  getSkillById(id: string): TopcoderSkill | undefined {
    return this.skillsById.get(id);
  }

  // [NOTE]: Fuzzy search in skill names and categories
  searchSkills(query: string): TopcoderSkill[] {
    const queryLower = query.toLowerCase();
    return this.skills.filter(
      skill =>
        skill.name.toLowerCase().includes(queryLower) ||
        skill.category?.toLowerCase().includes(queryLower)
    );
  }

  getAllSkills(): TopcoderSkill[] {
    return [...this.skills];
  }

  // [!IMPORTANT]: Fallback skills if Topcoder API is unavailable
  // These should match actual Topcoder skill IDs when possible
  private getFallbackSkills(): TopcoderSkill[] {
    return [
      { id: '1', name: 'JavaScript', category: 'Programming Languages' },
      { id: '2', name: 'TypeScript', category: 'Programming Languages' },
      { id: '3', name: 'Python', category: 'Programming Languages' },
      { id: '4', name: 'Java', category: 'Programming Languages' },
      { id: '5', name: 'C++', category: 'Programming Languages' },
      { id: '6', name: 'C#', category: 'Programming Languages' },
      { id: '7', name: 'Go', category: 'Programming Languages' },
      { id: '8', name: 'Rust', category: 'Programming Languages' },
      { id: '9', name: 'Ruby', category: 'Programming Languages' },
      { id: '10', name: 'PHP', category: 'Programming Languages' },
      { id: '11', name: 'Swift', category: 'Programming Languages' },
      { id: '12', name: 'Kotlin', category: 'Programming Languages' },
      { id: '13', name: 'React', category: 'Frameworks' },
      { id: '14', name: 'Angular', category: 'Frameworks' },
      { id: '15', name: 'Vue.js', category: 'Frameworks' },
      { id: '16', name: 'Node.js', category: 'Frameworks' },
      { id: '17', name: 'Express', category: 'Frameworks' },
      { id: '18', name: 'Django', category: 'Frameworks' },
      { id: '19', name: 'Flask', category: 'Frameworks' },
      { id: '20', name: 'Spring', category: 'Frameworks' },
      { id: '21', name: 'Ruby on Rails', category: 'Frameworks' },
      { id: '22', name: 'Laravel', category: 'Frameworks' },
      { id: '23', name: 'Docker', category: 'DevOps' },
      { id: '24', name: 'Kubernetes', category: 'DevOps' },
      { id: '25', name: 'AWS', category: 'Cloud' },
      { id: '26', name: 'Azure', category: 'Cloud' },
      { id: '27', name: 'Google Cloud', category: 'Cloud' },
      { id: '28', name: 'PostgreSQL', category: 'Databases' },
      { id: '29', name: 'MySQL', category: 'Databases' },
      { id: '30', name: 'MongoDB', category: 'Databases' },
      { id: '31', name: 'Redis', category: 'Databases' },
      { id: '32', name: 'GraphQL', category: 'APIs' },
      { id: '33', name: 'REST API', category: 'APIs' },
      { id: '34', name: 'Machine Learning', category: 'AI/ML' },
      { id: '35', name: 'Data Science', category: 'AI/ML' },
      { id: '36', name: 'TensorFlow', category: 'AI/ML' },
      { id: '37', name: 'PyTorch', category: 'AI/ML' },
      { id: '38', name: 'Git', category: 'Tools' },
      { id: '39', name: 'Linux', category: 'Operating Systems' },
      { id: '40', name: 'CI/CD', category: 'DevOps' },
      { id: '41', name: 'Web Development', category: 'Development' },
      { id: '42', name: 'Mobile Development', category: 'Development' },
      { id: '43', name: 'Backend Development', category: 'Development' },
      { id: '44', name: 'Frontend Development', category: 'Development' },
      { id: '45', name: 'Full Stack Development', category: 'Development' },
      { id: '46', name: 'iOS Development', category: 'Mobile' },
      { id: '47', name: 'Android Development', category: 'Mobile' },
      { id: '48', name: 'React Native', category: 'Mobile' },
      { id: '49', name: 'Flutter', category: 'Mobile' },
      { id: '50', name: 'SQL', category: 'Databases' },
    ];
  }
}
