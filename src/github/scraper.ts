import { GitHubClient } from './client';
import { RepoAnalyzer } from './repos';
import { CommitAnalyzer, extractTechnologiesFromCommit } from './commits';
import { PRAnalyzer, extractTechnologiesFromPR } from './pull-requests';
import { aggregateLanguages } from './languages';
import {
  Cache,
  CollectedGitHubData,
  ProgressState,
  createEmptyCollectedData,
  RepoData,
  StarredRepo,
  ProfileData,
} from '../utils/cache';
import { ProgressReporter } from '../output/progress';
import chalk from 'chalk';

export interface ScraperOptions {
  maxRepos: number;
  maxCommitsPerRepo: number;
  maxPRsPerRepo: number;
  includeStars: boolean;
  includePRs: boolean;
  includeReadme: boolean;
  resume: boolean;
  verbose: boolean;
}

export interface ScraperStats {
  reposScanned: number;
  commitsAnalyzed: number;
  prsAnalyzed: number;
  starsScanned: number;
  apiCalls: number;
  elapsedMs: number;
}

export class GitHubScraper {
  private client: GitHubClient;
  private cache: Cache;
  private options: ScraperOptions;
  private progress: ProgressReporter;

  constructor(
    client: GitHubClient,
    cache: Cache,
    options: ScraperOptions,
    progress: ProgressReporter
  ) {
    this.client = client;
    this.cache = cache;
    this.options = options;
    this.progress = progress;
  }

  async scrape(): Promise<{ data: CollectedGitHubData; stats: ScraperStats }> {
    const startTime = Date.now();

    let collectedData: CollectedGitHubData;
    let processedRepos: Set<string>;

    if (this.options.resume && this.cache.hasProgress()) {
      const savedProgress = this.cache.getProgress()!;
      collectedData = savedProgress.collectedData;
      processedRepos = new Set(savedProgress.processedRepos);
      console.log(chalk.cyan(`\nResuming from previous run: ${this.cache.getProgressSummary()}\n`));
    } else {
      collectedData = createEmptyCollectedData();
      processedRepos = new Set();
    }

    this.progress.start('Fetching user profile...');
    const profile = await this.fetchProfile();
    collectedData.profile = profile;
    this.progress.succeed('Profile fetched');

    this.progress.start('Analyzing repositories...');
    const { repos, commits, prs } = await this.analyzeRepositories(
      collectedData,
      processedRepos
    );
    collectedData.repos = [...collectedData.repos, ...repos];
    collectedData.commits = [...collectedData.commits, ...commits];
    collectedData.pullRequests = [...collectedData.pullRequests, ...prs];
    this.progress.succeed(`Analyzed ${repos.length} repositories`);

    collectedData.languages = aggregateLanguages(collectedData.repos);

    if (this.options.includeStars) {
      this.progress.start('Fetching starred repositories...');
      const stars = await this.fetchStarredRepos();
      collectedData.stars = stars;
      this.progress.succeed(`Fetched ${stars.length} starred repos`);
    }

    this.cache.clearProgress();

    const elapsedMs = Date.now() - startTime;
    const stats: ScraperStats = {
      reposScanned: collectedData.repos.length,
      commitsAnalyzed: collectedData.commits.length,
      prsAnalyzed: collectedData.pullRequests.length,
      starsScanned: collectedData.stars.length,
      apiCalls: this.client.getApiCallCount(),
      elapsedMs,
    };

    return { data: collectedData, stats };
  }

  private async fetchProfile(): Promise<ProfileData> {
    const user = await this.client.getAuthenticatedUser();
    const orgs = await this.client.getUserOrganizations(user.login);

    return {
      bio: user.bio,
      company: user.company,
      location: user.location,
      blog: user.blog,
      organizations: orgs,
    };
  }

  private async analyzeRepositories(
    existingData: CollectedGitHubData,
    processedRepos: Set<string>
  ): Promise<{
    repos: RepoData[];
    commits: CollectedGitHubData['commits'];
    prs: CollectedGitHubData['pullRequests'];
  }> {
    const repos: RepoData[] = [];
    const commits: CollectedGitHubData['commits'] = [];
    const prs: CollectedGitHubData['pullRequests'] = [];

    const repoAnalyzer = new RepoAnalyzer(this.client, {
      maxRepos: this.options.maxRepos,
      includeReadme: this.options.includeReadme,
      verbose: this.options.verbose,
    });

    const commitAnalyzer = new CommitAnalyzer(this.client, {
      maxCommitsPerRepo: this.options.maxCommitsPerRepo,
      verbose: this.options.verbose,
    });

    const prAnalyzer = new PRAnalyzer(this.client, {
      maxPRsPerRepo: this.options.maxPRsPerRepo,
      verbose: this.options.verbose,
    });

    for await (const repo of repoAnalyzer.analyzeRepos(
      processedRepos,
      (current, total, name) => {
        this.progress.update(`Analyzing repo ${current}/${total}: ${name}`);
      }
    )) {
      repos.push(repo);
      processedRepos.add(repo.fullName);

      const repoCommits: CollectedGitHubData['commits'] = [];
      for await (const commit of commitAnalyzer.analyzeCommits(repo.fullName)) {
        repoCommits.push(commit);
      }
      commits.push(...repoCommits);

      if (this.options.includePRs) {
        for await (const pr of prAnalyzer.analyzePullRequests(repo.fullName)) {
          prs.push(pr);
        }
      }

      this.saveProgress(processedRepos, {
        ...existingData,
        repos: [...existingData.repos, ...repos],
        commits: [...existingData.commits, ...commits],
        pullRequests: [...existingData.pullRequests, ...prs],
      });
    }

    return { repos, commits, prs };
  }

  private async fetchStarredRepos(): Promise<StarredRepo[]> {
    const stars: StarredRepo[] = [];
    let count = 0;

    for await (const repo of this.client.paginateStarredRepos({ maxStars: 100 })) {
      count++;
      this.progress.update(`Fetching starred repos: ${count}`);

      stars.push({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        language: repo.language,
        topics: repo.topics || [],
      });
    }

    return stars;
  }

  private saveProgress(processedRepos: Set<string>, data: CollectedGitHubData): void {
    const progress: ProgressState = {
      processedRepos: Array.from(processedRepos),
      collectedData: data,
      lastUpdated: Date.now(),
    };
    this.cache.setProgress(progress);
  }
}

export function extractAllTechnologies(data: CollectedGitHubData): Map<string, number> {
  const techCounts = new Map<string, number>();

  const increment = (tech: string, count: number = 1) => {
    techCounts.set(tech, (techCounts.get(tech) || 0) + count);
  };

  for (const repo of data.repos) {
    if (repo.language) {
      increment(repo.language, 5);
    }

    for (const [lang, bytes] of Object.entries(repo.languages)) {
      const weight = Math.min(Math.floor(bytes / 10000), 10);
      if (weight > 0) {
        increment(lang, weight);
      }
    }

    for (const topic of repo.topics) {
      increment(topic, 2);
    }
  }

  for (const commit of data.commits) {
    const techs = extractTechnologiesFromCommit(commit.message, commit.filesChanged);
    for (const tech of techs) {
      increment(tech, 1);
    }
  }

  for (const pr of data.pullRequests) {
    const techs = extractTechnologiesFromPR(pr.title, pr.body);
    for (const tech of techs) {
      increment(tech, 2);
    }
  }

  for (const star of data.stars) {
    if (star.language) {
      increment(star.language, 0.5);
    }
    for (const topic of star.topics) {
      increment(topic, 0.5);
    }
  }

  return techCounts;
}
