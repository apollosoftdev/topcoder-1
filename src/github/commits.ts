import { GitHubClient } from './client';
import { CommitData } from '../utils/cache';
import { getExtensionToTech, getSpecialFiles } from '../utils/config';

export interface CommitAnalyzerOptions {
  maxCommitsPerRepo: number;
  verbose: boolean;
}

export class CommitAnalyzer {
  private client: GitHubClient;
  private options: CommitAnalyzerOptions;
  private username?: string;

  constructor(client: GitHubClient, options: CommitAnalyzerOptions) {
    this.client = client;
    this.options = options;
  }

  async *analyzeCommits(
    repoFullName: string,
    onProgress?: (count: number) => void
  ): AsyncGenerator<CommitData> {
    const [owner, repo] = repoFullName.split('/');

    if (!this.username) {
      const user = await this.client.getAuthenticatedUser();
      this.username = user.login;
    }

    let count = 0;
    for await (const commit of this.client.paginateCommits(owner, repo, {
      author: this.username,
      maxCommits: this.options.maxCommitsPerRepo,
    })) {
      count++;
      if (onProgress) onProgress(count);

      const commitData: CommitData = {
        repo: repoFullName,
        sha: commit.sha,
        message: commit.commit.message,
        date: commit.commit.author?.date || '',
        filesChanged: [],
        additions: 0,
        deletions: 0,
      };

      yield commitData;
    }
  }

  async getDetailedCommit(
    repoFullName: string,
    sha: string
  ): Promise<{ files: string[]; additions: number; deletions: number } | null> {
    const [owner, repo] = repoFullName.split('/');
    const details = await this.client.getCommitDetails(owner, repo, sha);

    if (!details) return null;

    return {
      files: details.files.map(f => f.filename),
      additions: details.files.reduce((sum, f) => sum + f.additions, 0),
      deletions: details.files.reduce((sum, f) => sum + f.deletions, 0),
    };
  }
}

export function extractTechnologiesFromCommit(_message: string, files: string[]): string[] {
  const technologies: string[] = [];
  const extensionToTech = getExtensionToTech();
  const specialFiles = getSpecialFiles();

  for (const file of files) {
    const ext = '.' + file.split('.').pop()?.toLowerCase();
    if (ext && Object.prototype.hasOwnProperty.call(extensionToTech, ext)) {
      technologies.push(extensionToTech[ext]);
    }

    for (const [pattern, tech] of Object.entries(specialFiles)) {
      if (file.toLowerCase().includes(pattern.toLowerCase())) {
        technologies.push(tech);
      }
    }
  }

  return [...new Set(technologies)];
}
