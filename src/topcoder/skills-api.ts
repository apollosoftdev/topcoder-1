import { Cache, TopcoderSkill } from '../utils/cache';
import chalk from 'chalk';

// [!IMPORTANT]: Topcoder API base URL - uses dev environment
const TOPCODER_API_BASE = process.env.TOPCODER_API_BASE || 'https://api.topcoder-dev.com/v5';

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
      // [NOTE]: Fail gracefully if API is unavailable
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Could not fetch Topcoder skills: ${errorMessage}. Please check your network connection and try again.`);
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
}
