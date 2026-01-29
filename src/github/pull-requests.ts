import { GitHubClient } from './client';
import { PullRequestData } from '../utils/cache';

export interface PRAnalyzerOptions {
  maxPRsPerRepo: number;
  verbose: boolean;
}

export class PRAnalyzer {
  private client: GitHubClient;
  private options: PRAnalyzerOptions;
  private username?: string;

  constructor(client: GitHubClient, options: PRAnalyzerOptions) {
    this.client = client;
    this.options = options;
  }

  async *analyzePullRequests(
    repoFullName: string,
    onProgress?: (count: number) => void
  ): AsyncGenerator<PullRequestData> {
    const [owner, repo] = repoFullName.split('/');

    if (!this.username) {
      const user = await this.client.getAuthenticatedUser();
      this.username = user.login;
    }

    let count = 0;
    for await (const pr of this.client.paginatePullRequests(owner, repo, {
      state: 'all',
      maxPRs: this.options.maxPRsPerRepo,
    })) {
      const isAuthor = pr.user?.login === this.username;

      if (!isAuthor) continue;

      count++;
      if (onProgress) onProgress(count);

      const prData: PullRequestData = {
        repo: repoFullName,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        url: pr.html_url,
        state: pr.state,
        merged: pr.merged_at !== null,
        createdAt: pr.created_at,
        isAuthor,
      };

      yield prData;
    }
  }
}

// [NOTE]: Extract technologies from PR using API skill names
// skillNames parameter comes from TopcoderSkillsAPI.getAllSkillNames()
export function extractTechnologiesFromPR(
  title: string,
  body: string | null,
  skillNames?: string[]
): string[] {
  if (!skillNames || skillNames.length === 0) {
    return [];
  }

  const text = `${title} ${body || ''}`.toLowerCase();
  const foundSkills: string[] = [];

  for (const skillName of skillNames) {
    const skillLower = skillName.toLowerCase();
    // Check for whole word match using word boundaries
    // Escape special regex characters in skill name
    const escaped = skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      foundSkills.push(skillName);
    }
  }

  return [...new Set(foundSkills)];
}
