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
    let total = this.options.maxRepos;

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

export function extractFrameworksFromReadme(readme: string): string[] {
  const frameworks: string[] = [];
  const readmeLower = readme.toLowerCase();

  const frameworkPatterns: Record<string, RegExp[]> = {
    React: [/\breact\b/, /\bcreate-react-app\b/, /\bnext\.?js\b/],
    Vue: [/\bvue\b/, /\bvuejs\b/, /\bnuxt\b/],
    Angular: [/\bangular\b/, /\bng\s+serve\b/],
    Express: [/\bexpress\b/, /\bexpressjs\b/],
    Django: [/\bdjango\b/],
    Flask: [/\bflask\b/],
    FastAPI: [/\bfastapi\b/],
    Spring: [/\bspring\s*(boot)?\b/],
    Rails: [/\brails\b/, /\bruby on rails\b/],
    Laravel: [/\blaravel\b/],
    'Node.js': [/\bnode\.?js\b/, /\bnpm\s+start\b/],
    Docker: [/\bdocker\b/, /\bdockerfile\b/],
    Kubernetes: [/\bkubernetes\b/, /\bk8s\b/, /\bkubectl\b/],
    AWS: [/\baws\b/, /\bamazon web services\b/, /\bs3\b.*bucket/],
    GraphQL: [/\bgraphql\b/, /\bapollo\b/],
    PostgreSQL: [/\bpostgresql\b/, /\bpostgres\b/, /\bpsql\b/],
    MongoDB: [/\bmongodb\b/, /\bmongoose\b/],
    Redis: [/\bredis\b/],
    TensorFlow: [/\btensorflow\b/],
    PyTorch: [/\bpytorch\b/],
    Jest: [/\bjest\b/],
    Mocha: [/\bmocha\b/],
    Pytest: [/\bpytest\b/],
    Webpack: [/\bwebpack\b/],
    Vite: [/\bvite\b/],
    Tailwind: [/\btailwind\b/, /\btailwindcss\b/],
    Bootstrap: [/\bbootstrap\b/],
    TypeScript: [/\btypescript\b/, /\.tsx?\b/],
    Rust: [/\bcargo\b/, /\brustup\b/],
    Go: [/\bgo\s+mod\b/, /\bgo\s+build\b/],
  };

  for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(readmeLower)) {
        frameworks.push(framework);
        break;
      }
    }
  }

  return [...new Set(frameworks)];
}
