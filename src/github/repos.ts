import { GitHubClient } from './client';
import { RepoData } from '../utils/cache';
import chalk from 'chalk';

export interface RepoAnalyzerOptions {
  maxRepos: number;
  includeReadme: boolean;
  verbose: boolean;
}

export class RepoAnalyzer {
  private client: GitHubClient;
  private options: RepoAnalyzerOptions;

  constructor(client: GitHubClient, options: RepoAnalyzerOptions) {
    this.client = client;
    this.options = options;
  }

  async *analyzeRepos(
    processedRepos: Set<string>,
    onProgress: (current: number, total: number, name: string) => void
  ): AsyncGenerator<RepoData> {
    let current = 0;
    const total = this.options.maxRepos;

    for await (const repo of this.client.paginateRepos({ maxRepos: this.options.maxRepos })) {
      const fullName = repo.full_name;

      if (processedRepos.has(fullName)) {
        if (this.options.verbose) {
          console.log(chalk.gray(`  Skipping already processed repo: ${fullName}`));
        }
        continue;
      }

      current++;
      onProgress(current, total, fullName);

      const [owner, repoName] = fullName.split('/');
      const languages = await this.client.getRepoLanguages(owner, repoName);

      let readme: string | undefined;
      if (this.options.includeReadme) {
        const readmeContent = await this.client.getRepoReadme(owner, repoName);
        readme = readmeContent ?? undefined;
      }

      // [NOTE]: Fetch root files for config detection (package.json, Dockerfile, etc.)
      const rootFiles = await this.client.getRepoRootFiles(owner, repoName);

      const repoData: RepoData = {
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        language: repo.language,
        languages,
        topics: repo.topics || [],
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        isOwner: repo.owner?.login === (await this.getUsername()),
        createdAt: repo.created_at || '',
        updatedAt: repo.updated_at || '',
        readme,
        rootFiles,
      };

      yield repoData;
    }
  }

  private username?: string;
  private async getUsername(): Promise<string> {
    if (!this.username) {
      const user = await this.client.getAuthenticatedUser();
      this.username = user.login;
    }
    return this.username;
  }
}
