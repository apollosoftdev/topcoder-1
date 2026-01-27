import { GitHubClient } from './client';
import { CommitData } from '../utils/cache';
import chalk from 'chalk';

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

export function extractTechnologiesFromCommit(message: string, files: string[]): string[] {
  const technologies: string[] = [];

  const messagePatterns: Record<string, RegExp[]> = {
    React: [/\breact\b/i, /\bcomponent\b/i, /\bhook\b/i, /\buseState\b/, /\buseEffect\b/],
    Vue: [/\bvue\b/i, /\bvuex\b/i],
    Angular: [/\bangular\b/i, /\bng-\w+\b/i],
    TypeScript: [/\btypescript\b/i, /\bts\b/i, /\btype\s+\w+\b/],
    Docker: [/\bdocker\b/i, /\bcontainer\b/i],
    Kubernetes: [/\bk8s\b/i, /\bkubernetes\b/i, /\bpod\b/i, /\bdeployment\b/i],
    GraphQL: [/\bgraphql\b/i, /\bquery\b/i, /\bmutation\b/i, /\bschema\b/i],
    REST: [/\brest\s*api\b/i, /\bendpoint\b/i, /\bapi\b/i],
    Testing: [/\btest\b/i, /\bspec\b/i, /\bjest\b/i, /\bmocha\b/i],
    CI: [/\bci\b/i, /\bpipeline\b/i, /\bgithub\s*actions?\b/i],
    Database: [/\bdatabase\b/i, /\bsql\b/i, /\bmigration\b/i, /\bschema\b/i],
    Security: [/\bsecurity\b/i, /\bauth\b/i, /\btoken\b/i, /\bcredential\b/i],
    Performance: [/\bperformance\b/i, /\boptimize\b/i, /\bcache\b/i],
    Refactor: [/\brefactor\b/i, /\brestructure\b/i, /\bcleanup\b/i],
  };

  for (const [tech, patterns] of Object.entries(messagePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        technologies.push(tech);
        break;
      }
    }
  }

  const fileExtensionMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.rb': 'Ruby',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.swift': 'Swift',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.php': 'PHP',
    '.scala': 'Scala',
    '.sql': 'SQL',
    '.graphql': 'GraphQL',
    '.proto': 'Protocol Buffers',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.json': 'JSON',
    '.xml': 'XML',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.less': 'LESS',
    '.md': 'Markdown',
    '.sh': 'Shell',
    '.bash': 'Bash',
    '.dockerfile': 'Docker',
    '.tf': 'Terraform',
    '.hcl': 'HCL',
  };

  const specialFiles: Record<string, string> = {
    'package.json': 'Node.js',
    'tsconfig.json': 'TypeScript',
    'docker-compose.yml': 'Docker',
    'Dockerfile': 'Docker',
    '.github/workflows': 'GitHub Actions',
    'Makefile': 'Make',
    'CMakeLists.txt': 'CMake',
    'Cargo.toml': 'Rust',
    'go.mod': 'Go',
    'requirements.txt': 'Python',
    'Gemfile': 'Ruby',
    'pom.xml': 'Maven',
    'build.gradle': 'Gradle',
    '.eslintrc': 'ESLint',
    '.prettierrc': 'Prettier',
    'jest.config': 'Jest',
    'webpack.config': 'Webpack',
    'vite.config': 'Vite',
    'tailwind.config': 'Tailwind CSS',
    '.env': 'Environment Config',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'terraform': 'Terraform',
  };

  for (const file of files) {
    const ext = '.' + file.split('.').pop()?.toLowerCase();
    if (ext && fileExtensionMap[ext]) {
      technologies.push(fileExtensionMap[ext]);
    }

    for (const [pattern, tech] of Object.entries(specialFiles)) {
      if (file.toLowerCase().includes(pattern.toLowerCase())) {
        technologies.push(tech);
      }
    }
  }

  return [...new Set(technologies)];
}
