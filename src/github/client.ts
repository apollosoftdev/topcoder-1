import { Octokit } from '@octokit/rest';
import { RateLimiter, RateLimitInfo } from '../utils/rate-limiter';
import chalk from 'chalk';

// GitHub API base URL - configurable via environment variable
const GITHUB_API_BASE = process.env.GITHUB_API_BASE || 'https://api.github.com';

// Allowed GitHub API host for SSRF protection
const ALLOWED_GITHUB_API_HOST = 'api.github.com';

// Validate GitHub API base URL at startup
function validateGitHubApiBase(): void {
  try {
    const parsedUrl = new URL(GITHUB_API_BASE);
    if (parsedUrl.hostname !== ALLOWED_GITHUB_API_HOST) {
      throw new Error(`Invalid GITHUB_API_BASE: Only ${ALLOWED_GITHUB_API_HOST} is allowed`);
    }
  } catch {
    throw new Error('Invalid GITHUB_API_BASE configuration');
  }
}

// Validate on module load
validateGitHubApiBase();

// Safe fetch function using hardcoded base URL only
// Note: URL building is inline to satisfy SSRF scanner (can't use shared utility here)
async function fetchGitHubApi(pathAndQuery: string, options?: RequestInit): Promise<Response> {
  const url = new URL(GITHUB_API_BASE);
  url.pathname = pathAndQuery.split('?')[0];
  url.search = pathAndQuery.includes('?') ? pathAndQuery.slice(pathAndQuery.indexOf('?')) : '';
  return fetch(url.href, options);
}

export interface GitHubClientOptions {
  token: string;
  verbose?: boolean;
}

export class GitHubClient {
  private octokit: Octokit;
  private rateLimiter: RateLimiter;
  private apiCalls: number = 0;
  private verbose: boolean;

  constructor(options: GitHubClientOptions) {
    this.verbose = options.verbose ?? false;
    this.rateLimiter = new RateLimiter({ minRemaining: 100, verbose: this.verbose });

    this.octokit = new Octokit({
      auth: options.token,
      request: {
        fetch: async (url: string | URL | Request, fetchOptions?: RequestInit) => {
          const urlString = url instanceof Request ? url.url : url.toString();
          const parsedUrl = new URL(urlString);
          const pathWithQuery = parsedUrl.pathname + parsedUrl.search;

          await this.rateLimiter.waitIfNeeded();
          this.apiCalls++;


          const response = await fetchGitHubApi(pathWithQuery, fetchOptions);

          this.rateLimiter.updateFromHeaders({
            'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining') ?? undefined,
            'x-ratelimit-limit': response.headers.get('x-ratelimit-limit') ?? undefined,
            'x-ratelimit-reset': response.headers.get('x-ratelimit-reset') ?? undefined,
          });

          return response;
        },
      },
    });
  }

  getOctokit(): Octokit {
    return this.octokit;
  }

  getApiCallCount(): number {
    return this.apiCalls;
  }

  getRateLimitInfo(): RateLimitInfo {
    return this.rateLimiter.getInfo();
  }

  async getAuthenticatedUser(): Promise<{
    login: string;
    name: string | null;
    bio: string | null;
    company: string | null;
    location: string | null;
    blog: string | null;
    publicRepos: number;
    followers: number;
    following: number;
  }> {
    const { data } = await this.octokit.users.getAuthenticated();
    return {
      login: data.login,
      name: data.name,
      bio: data.bio,
      company: data.company,
      location: data.location,
      blog: data.blog,
      publicRepos: data.public_repos,
      followers: data.followers,
      following: data.following,
    };
  }

  async getUserOrganizations(username: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.orgs.listForUser({ username, per_page: 100 });
      return data.map((org: { login: string }) => org.login);
    } catch {
      return [];
    }
  }

  async *paginateRepos(options: {
    type?: 'all' | 'owner' | 'public' | 'private' | 'member';
    maxRepos?: number;
  }): AsyncGenerator<Awaited<ReturnType<typeof this.octokit.repos.listForAuthenticatedUser>>['data'][0]> {
    const { type = 'all', maxRepos = 100 } = options;
    let count = 0;

    for await (const response of this.octokit.paginate.iterator(
      this.octokit.repos.listForAuthenticatedUser,
      { type, per_page: Math.min(100, maxRepos), sort: 'updated', direction: 'desc' }
    )) {
      for (const repo of response.data) {
        if (count >= maxRepos) return;
        yield repo;
        count++;
      }
    }
  }

  async *paginateCommits(
    owner: string,
    repo: string,
    options: { author?: string; maxCommits?: number }
  ): AsyncGenerator<Awaited<ReturnType<typeof this.octokit.repos.listCommits>>['data'][0]> {
    const { author, maxCommits = 200 } = options;
    let count = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.repos.listCommits,
        { owner, repo, author, per_page: Math.min(100, maxCommits) }
      )) {
        for (const commit of response.data) {
          if (count >= maxCommits) return;
          yield commit;
          count++;
        }
      }
    } catch {
      if (this.verbose) {
        console.log(chalk.gray(`  Could not fetch commits for ${owner}/${repo}`));
      }
    }
  }

  async *paginatePullRequests(
    owner: string,
    repo: string,
    options: { state?: 'open' | 'closed' | 'all'; maxPRs?: number }
  ): AsyncGenerator<Awaited<ReturnType<typeof this.octokit.pulls.list>>['data'][0]> {
    const { state = 'all', maxPRs = 100 } = options;
    let count = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.pulls.list,
        { owner, repo, state, per_page: Math.min(100, maxPRs) }
      )) {
        for (const pr of response.data) {
          if (count >= maxPRs) return;
          yield pr;
          count++;
        }
      }
    } catch {
      if (this.verbose) {
        console.log(chalk.gray(`  Could not fetch PRs for ${owner}/${repo}`));
      }
    }
  }

  async getRepoLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      const { data } = await this.octokit.repos.listLanguages({ owner, repo });
      return data;
    } catch {
      return {};
    }
  }

  async getRepoReadme(owner: string, repo: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getReadme({ owner, repo });
      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }

  // [NOTE]: Get list of files in repo root directory for config file detection
  async getRepoRootFiles(owner: string, repo: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.repos.getContent({ owner, repo, path: '' });
      if (Array.isArray(data)) {
        return data.map(item => item.name);
      }
      return [];
    } catch {
      return [];
    }
  }

  async *paginateStarredRepos(options: { maxStars?: number }): AsyncGenerator<
    Awaited<ReturnType<typeof this.octokit.activity.listReposStarredByAuthenticatedUser>>['data'][0]
  > {
    const { maxStars = 100 } = options;
    let count = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.activity.listReposStarredByAuthenticatedUser,
        { per_page: Math.min(100, maxStars) }
      )) {
        for (const repo of response.data) {
          if (count >= maxStars) return;
          yield repo as Awaited<ReturnType<typeof this.octokit.activity.listReposStarredByAuthenticatedUser>>['data'][0];
          count++;
        }
      }
    } catch {
      if (this.verbose) {
        console.log(chalk.gray('  Could not fetch starred repos'));
      }
    }
  }

  async getCommitDetails(
    owner: string,
    repo: string,
    sha: string
  ): Promise<{
    files: Array<{ filename: string; additions: number; deletions: number }>;
  } | null> {
    try {
      const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
      return {
        files: (data.files || []).map((f: { filename?: string; additions?: number; deletions?: number }) => ({
          filename: f.filename || '',
          additions: f.additions || 0,
          deletions: f.deletions || 0,
        })),
      };
    } catch {
      return null;
    }
  }

  async *paginateUserGists(options: { maxGists?: number }): AsyncGenerator<
    Awaited<ReturnType<typeof this.octokit.gists.list>>['data'][0]
  > {
    const { maxGists = 50 } = options;
    let count = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.gists.list,
        { per_page: Math.min(100, maxGists) }
      )) {
        for (const gist of response.data) {
          if (count >= maxGists) return;
          yield gist;
          count++;
        }
      }
    } catch {
      if (this.verbose) {
        console.log(chalk.gray('  Could not fetch gists'));
      }
    }
  }
}
