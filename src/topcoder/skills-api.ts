import { Cache, TopcoderSkill } from '../utils/cache';
import chalk from 'chalk';

// [!IMPORTANT]: Topcoder API base URL - configurable via environment
const TOPCODER_API_BASE = process.env.TOPCODER_API_BASE || 'https://api.topcoder-dev.com/v5';

// Allowed Topcoder API hosts for SSRF protection
const ALLOWED_TOPCODER_HOSTS = [
  'api.topcoder.com',
  'api.topcoder-dev.com',
];

// Validate that the constructed URL points to an allowed Topcoder host
function validateTopcoderUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_TOPCODER_HOSTS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

// Safely build API URL with validated parameters
function buildApiUrl(endpoint: string, params: Record<string, string | number>): string {
  const url = new URL(`${TOPCODER_API_BASE}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // Validate the constructed URL
  if (!validateTopcoderUrl(url.toString())) {
    throw new Error('Invalid API URL: Only Topcoder API endpoints are allowed');
  }

  return url.toString();
}

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

// [NOTE]: Response from autocomplete endpoint
export interface AutocompleteResponse {
  id: string;
  name: string;
  category?: SkillCategoryDto;
}

// [NOTE]: Response from fuzzymatch endpoint
export interface FuzzyMatchResponse {
  id: string;
  name: string;
}

export class TopcoderSkillsAPI {
  private cache: Cache;
  private skillCache: Map<string, TopcoderSkill> = new Map(); // [NOTE]: In-memory cache for looked-up skills
  private initialized = false;

  constructor(cache: Cache) {
    this.cache = cache;
  }

  // [!IMPORTANT]: Initialize the API - now lightweight, doesn't load all skills
  async initialize(): Promise<void> {
    // [NOTE]: Load any previously cached skills into memory
    const cached = this.cache.getSkills();
    if (cached) {
      for (const skill of cached.skills) {
        this.skillCache.set(skill.name.toLowerCase(), skill);
      }
    }
    this.initialized = true;
    console.log(chalk.gray('Topcoder Skills API initialized'));
  }

  // [NOTE]: Use API autocomplete endpoint for prefix matching
  async autocomplete(term: string, size: number = 10): Promise<TopcoderSkill[]> {
    if (!term || term.length < 2) return [];

    try {
      const apiUrl = buildApiUrl('/standardized-skills/skills/autocomplete', {
        term: term,
        size: size,
      });

      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as AutocompleteResponse[];

      // [NOTE]: Convert and cache results
      const skills = data.map(item => this.toTopcoderSkill(item));
      this.cacheSkills(skills);

      return skills;
    } catch {
      return [];
    }
  }

  // [NOTE]: Use API fuzzymatch endpoint for typo-tolerant matching
  async fuzzyMatch(term: string, size: number = 10): Promise<TopcoderSkill[]> {
    if (!term || term.length < 2) return [];

    try {
      const apiUrl = buildApiUrl('/standardized-skills/skills/fuzzymatch', {
        term: term,
        size: size,
      });

      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as FuzzyMatchResponse[];

      // [NOTE]: Convert to TopcoderSkill (fuzzymatch doesn't return category)
      const skills = data.map(item => ({
        id: item.id,
        name: item.name,
        category: undefined,
      }));
      this.cacheSkills(skills);

      return skills;
    } catch {
      return [];
    }
  }

  // [NOTE]: Smart search combining autocomplete and fuzzy match
  async searchSkillsAsync(query: string): Promise<TopcoderSkill[]> {
    const queryLower = query.toLowerCase().trim();
    if (!queryLower) return [];

    // [NOTE]: Check local cache first
    const cached = this.skillCache.get(queryLower);
    if (cached) {
      return [cached];
    }

    // [NOTE]: Try autocomplete first (prefix match)
    const autocompleteResults = await this.autocomplete(query, 5);
    if (autocompleteResults.length > 0) {
      // [NOTE]: Prioritize exact matches
      const exactMatch = autocompleteResults.find(s => s.name.toLowerCase() === queryLower);
      if (exactMatch) {
        return [exactMatch];
      }
      return autocompleteResults;
    }

    // [NOTE]: Fallback to fuzzy match
    const fuzzyResults = await this.fuzzyMatch(query, 5);
    return fuzzyResults;
  }

  // [NOTE]: Get skill by exact name (from cache)
  getSkillByName(name: string): TopcoderSkill | undefined {
    return this.skillCache.get(name.toLowerCase());
  }

  // [NOTE]: Get skill by ID (from cache)
  getSkillById(id: string): TopcoderSkill | undefined {
    for (const skill of this.skillCache.values()) {
      if (skill.id === id) return skill;
    }
    return undefined;
  }

  // [NOTE]: Add skill to cache
  addToCache(skill: TopcoderSkill): void {
    this.skillCache.set(skill.name.toLowerCase(), skill);
  }

  // [NOTE]: Cache multiple skills
  private cacheSkills(skills: TopcoderSkill[]): void {
    for (const skill of skills) {
      this.skillCache.set(skill.name.toLowerCase(), skill);
    }
    // [NOTE]: Persist to disk cache periodically
    this.persistCache();
  }

  // [NOTE]: Persist in-memory cache to disk
  private persistCache(): void {
    const skills = Array.from(this.skillCache.values());
    if (skills.length > 0) {
      this.cache.setSkills(skills);
    }
  }

  // [NOTE]: Convert API response to internal format
  private toTopcoderSkill(response: AutocompleteResponse | TopcoderSkillResponse): TopcoderSkill {
    return {
      id: response.id,
      name: response.name,
      category: response.category?.name,
    };
  }

  // [NOTE]: Get count of cached skills
  getCachedSkillCount(): number {
    return this.skillCache.size;
  }

  // [NOTE]: Check if API is initialized
  isInitialized(): boolean {
    return this.initialized;
  }

  // [NOTE]: Get all cached skill names (for text detection)
  getAllSkillNames(): string[] {
    return Array.from(this.skillCache.values()).map(skill => skill.name);
  }

  // [NOTE]: Fetch all skills from API and cache them
  async fetchAllSkills(): Promise<void> {
    try {
      const apiUrl = buildApiUrl('/standardized-skills/skills', {
        page: 1,
        perPage: 10000, // Fetch all skills
      });

      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.log(chalk.yellow('Could not fetch all skills from API'));
        return;
      }

      const data = await response.json() as TopcoderSkillResponse[];
      const skills = data.map(item => this.toTopcoderSkill(item));
      this.cacheSkills(skills);
      console.log(chalk.gray(`Fetched ${skills.length} skills from API`));
    } catch {
      console.log(chalk.yellow('Error fetching all skills'));
    }
  }

  // [NOTE]: Find skills mentioned in text (uses cached skill names)
  findSkillsInText(text: string): string[] {
    const textLower = text.toLowerCase();
    const foundSkills: string[] = [];

    for (const skill of this.skillCache.values()) {
      const skillNameLower = skill.name.toLowerCase();
      // Check for whole word match to avoid partial matches
      const regex = new RegExp(`\\b${this.escapeRegex(skillNameLower)}\\b`, 'i');
      if (regex.test(textLower)) {
        foundSkills.push(skill.name);
      }
    }

    return foundSkills;
  }

  // [NOTE]: Escape special regex characters
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
