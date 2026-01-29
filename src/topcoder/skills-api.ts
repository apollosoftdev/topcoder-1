import { Cache, TopcoderSkill } from '../utils/cache';
import { isWholeWordMatch } from '../utils/string-utils';
import chalk from 'chalk';

// [!IMPORTANT]: Topcoder API base URL - configurable via environment
const TOPCODER_API_BASE = process.env.TOPCODER_API_BASE || 'https://api.topcoder-dev.com/v5';

// Allowed Topcoder API hosts for SSRF protection
const ALLOWED_TOPCODER_HOSTS = [
  'api.topcoder.com',
  'api.topcoder-dev.com',
];

// Hardcoded API endpoints for SSRF protection - only these exact paths are allowed
const ALLOWED_ENDPOINTS = new Set([
  '/standardized-skills/skills/autocomplete',
  '/standardized-skills/skills/fuzzymatch',
  '/standardized-skills/skills',
]);

// Validate that the base URL points to an allowed Topcoder host
function validateTopcoderBaseUrl(): void {
  try {
    const parsedUrl = new URL(TOPCODER_API_BASE);
    if (!ALLOWED_TOPCODER_HOSTS.includes(parsedUrl.hostname)) {
      throw new Error('Invalid API base URL: Only Topcoder API hosts are allowed');
    }
  } catch {
    throw new Error('Invalid API base URL configuration');
  }
}

// Safely fetch from a hardcoded endpoint with sanitized query parameters
async function safeFetch(
  endpoint: string,
  params: Record<string, string | number>
): Promise<Response> {
  // Validate endpoint is in allowlist
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    throw new Error('Invalid API endpoint: Only allowed Topcoder endpoints can be accessed');
  }

  // Validate base URL at runtime
  validateTopcoderBaseUrl();

  // Build URL with validated endpoint
  const url = new URL(`${TOPCODER_API_BASE}${endpoint}`);

  // Add sanitized query parameters (URL API handles encoding)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // Fetch using the validated URL
  return fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
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
      // Use safeFetch with hardcoded endpoint to prevent SSRF
      const response = await safeFetch('/standardized-skills/skills/autocomplete', {
        term: term,
        size: size,
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
      // Use safeFetch with hardcoded endpoint to prevent SSRF
      const response = await safeFetch('/standardized-skills/skills/fuzzymatch', {
        term: term,
        size: size,
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
      // Use safeFetch with hardcoded endpoint to prevent SSRF
      const response = await safeFetch('/standardized-skills/skills', {
        page: 1,
        perPage: 10000, // Fetch all skills
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
  // Uses safe word boundary check to prevent ReDoS attacks
  findSkillsInText(text: string): string[] {
    const textLower = text.toLowerCase();
    const foundSkills: string[] = [];

    for (const skill of this.skillCache.values()) {
      const skillNameLower = skill.name.toLowerCase();
      // Use safe word boundary check instead of dynamic RegExp to prevent ReDoS
      if (isWholeWordMatch(textLower, skillNameLower)) {
        foundSkills.push(skill.name);
      }
    }

    return foundSkills;
  }
}
