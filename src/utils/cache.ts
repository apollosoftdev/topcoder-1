import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// [NOTE]: Main cache data structure stored in ~/.tc-skills-cli/
export interface CacheData {
  token?: string;
  tokenExpiry?: number;
  progress?: ProgressState;
  skills?: CachedSkills;
}

// [NOTE]: Tracks scraping progress for resume capability
export interface ProgressState {
  processedRepos: string[];
  collectedData: CollectedGitHubData;
  lastUpdated: number;
}

// [!IMPORTANT]: Central data structure holding all GitHub scraped data
export interface CollectedGitHubData {
  repos: RepoData[];
  commits: CommitData[];
  pullRequests: PullRequestData[];
  languages: LanguageStats;
  stars: StarredRepo[];
  profile?: ProfileData;
}

// [NOTE]: Repository metadata from GitHub API
export interface RepoData {
  name: string;
  fullName: string; // [NOTE]: format is "owner/repo"
  url: string;
  description: string | null;
  language: string | null; // [NOTE]: primary language detected by GitHub
  languages: Record<string, number>; // [NOTE]: language -> bytes mapping
  topics: string[];
  stars: number;
  forks: number;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  readme?: string;
}

// [NOTE]: Commit data for technology detection
export interface CommitData {
  repo: string;
  sha: string;
  message: string;
  date: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

// [NOTE]: Pull request data for contribution analysis
export interface PullRequestData {
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  merged: boolean;
  createdAt: string;
  isAuthor: boolean;
}

// [NOTE]: Aggregated language statistics across all repos
export interface LanguageStats {
  [language: string]: {
    bytes: number;
    repos: number;
    percentage: number;
  };
}

// [NOTE]: Starred repos indicate user interests
export interface StarredRepo {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  topics: string[];
}

// [NOTE]: User profile metadata
export interface ProfileData {
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  organizations: string[];
}

// [NOTE]: Cached Topcoder skills with fetch timestamp
export interface CachedSkills {
  skills: TopcoderSkill[];
  fetchedAt: number;
}

// [!IMPORTANT]: This is the Topcoder skill structure - id is required for API matching
export interface TopcoderSkill {
  id: string;
  name: string;
  category?: string;
}

// [!IMPORTANT]: Cache stored in user home directory for persistence
const CACHE_DIR = path.join(os.homedir(), '.tc-skills-cli');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');
const TOKEN_FILE = path.join(CACHE_DIR, 'token.json'); // [NOTE]: Token stored separately with strict permissions

export class Cache {
  private data: CacheData = {};

  constructor() {
    this.ensureCacheDir();
    this.load();
  }

  // [NOTE]: Creates cache directory with restricted permissions (700)
  private ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    }
  }

  // [NOTE]: Loads cache and token from disk on initialization
  private load(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const content = fs.readFileSync(CACHE_FILE, 'utf-8');
        this.data = JSON.parse(content);
      }
      if (fs.existsSync(TOKEN_FILE)) {
        const tokenContent = fs.readFileSync(TOKEN_FILE, 'utf-8');
        const tokenData = JSON.parse(tokenContent);
        this.data.token = tokenData.token;
        this.data.tokenExpiry = tokenData.expiry;
      }
    } catch {
      this.data = {};
    }
  }

  // [NOTE]: Saves cache without token (token saved separately)
  private save(): void {
    const { token: _token, tokenExpiry: _tokenExpiry, ...cacheData } = this.data;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), { mode: 0o600 });
  }

  // [!IMPORTANT]: Token file has strict 600 permissions for security
  private saveToken(): void {
    if (this.data.token) {
      fs.writeFileSync(
        TOKEN_FILE,
        JSON.stringify({ token: this.data.token, expiry: this.data.tokenExpiry }, null, 2),
        { mode: 0o600 }
      );
    }
  }

  // [NOTE]: Returns token if not expired
  getToken(): string | undefined {
    if (this.data.token && this.data.tokenExpiry) {
      if (Date.now() < this.data.tokenExpiry) {
        return this.data.token;
      }
      // [NOTE]: Token has expired, return undefined to trigger re-auth
      return undefined;
    }
    // [NOTE]: No expiry set (GitHub device tokens don't expire)
    return this.data.token;
  }

  setToken(token: string, expiresIn?: number): void {
    this.data.token = token;
    this.data.tokenExpiry = expiresIn ? Date.now() + expiresIn * 1000 : undefined;
    this.saveToken();
  }

  clearToken(): void {
    delete this.data.token;
    delete this.data.tokenExpiry;
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  }

  // [NOTE]: Used for --resume flag functionality
  getProgress(): ProgressState | undefined {
    return this.data.progress;
  }

  setProgress(progress: ProgressState): void {
    this.data.progress = progress;
    this.save();
  }

  clearProgress(): void {
    delete this.data.progress;
    this.save();
  }

  // [NOTE]: Skills cached for 24 hours to reduce API calls
  getSkills(): CachedSkills | undefined {
    if (this.data.skills) {
      const oneDay = 24 * 60 * 60 * 1000;
      if (Date.now() - this.data.skills.fetchedAt < oneDay) {
        return this.data.skills;
      }
    }
    return undefined;
  }

  setSkills(skills: TopcoderSkill[]): void {
    this.data.skills = {
      skills,
      fetchedAt: Date.now(),
    };
    this.save();
  }

  // [!IMPORTANT]: Deletes all cached data including tokens
  clearAll(): void {
    this.data = {};
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  }

  hasProgress(): boolean {
    return !!this.data.progress && this.data.progress.processedRepos.length > 0;
  }

  getProgressSummary(): string {
    if (!this.data.progress) {
      return 'No saved progress';
    }
    const p = this.data.progress;
    const lastUpdated = new Date(p.lastUpdated).toLocaleString();
    return `Repos: ${p.processedRepos.length}, Last updated: ${lastUpdated}`;
  }
}

// [NOTE]: Factory function for initializing empty data structure
export function createEmptyCollectedData(): CollectedGitHubData {
  return {
    repos: [],
    commits: [],
    pullRequests: [],
    languages: {},
    stars: [],
  };
}
