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

export function extractTechnologiesFromPR(title: string, body: string | null): string[] {
  const technologies: string[] = [];
  const text = `${title} ${body || ''}`.toLowerCase();

  const patterns: Record<string, RegExp[]> = {
    'Feature Development': [/\bfeat(ure)?\b/, /\badd(ed|ing)?\b.*\bfeature\b/, /\bimplement/],
    'Bug Fix': [/\bfix(ed|es|ing)?\b/, /\bbug\b/, /\bissue\b/, /\bpatch\b/],
    'Performance': [/\bperformance\b/, /\boptimiz(e|ation)\b/, /\bspeed\b/, /\bfast(er)?\b/],
    'Security': [/\bsecurity\b/, /\bvulnerabil(ity|e)\b/, /\bcve\b/, /\bauth(entication|orization)?\b/],
    'Testing': [/\btest(s|ing)?\b/, /\bcoverage\b/, /\bunit\b.*\btest/, /\bintegration\b.*\btest/],
    'Documentation': [/\bdoc(s|umentation)?\b/, /\breadme\b/, /\bcomment(s)?\b/],
    'Refactoring': [/\brefactor(ing|ed)?\b/, /\bclean(up|ing)?\b/, /\brestructure\b/],
    'DevOps': [/\bci\/?cd\b/, /\bpipeline\b/, /\bdeploy(ment)?\b/, /\binfrastructure\b/],
    'API Development': [/\bapi\b/, /\bendpoint\b/, /\brest\b/, /\bgraphql\b/],
    'Database': [/\bdatabase\b/, /\bdb\b/, /\bmigration\b/, /\bschema\b/, /\bsql\b/],
    'Frontend': [/\bui\b/, /\bfrontend\b/, /\bcss\b/, /\bstyle\b/, /\bcomponent\b/],
    'Backend': [/\bbackend\b/, /\bserver\b/, /\bservice\b/],
    'Mobile': [/\bmobile\b/, /\bios\b/, /\bandroid\b/, /\breact\s*native\b/],
    'Machine Learning': [/\bml\b/, /\bmachine\s*learning\b/, /\bmodel\b/, /\btraining\b/],
    'Data Engineering': [/\bdata\s*pipeline\b/, /\betl\b/, /\bdata\s*processing\b/],
  };

  for (const [tech, regexList] of Object.entries(patterns)) {
    for (const regex of regexList) {
      if (regex.test(text)) {
        technologies.push(tech);
        break;
      }
    }
  }

  return [...new Set(technologies)];
}
