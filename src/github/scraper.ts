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
import { getSpecialFiles, getGitHubConfig } from '../utils/config';
import { isWholeWordMatch } from '../utils/string-utils';
import chalk from 'chalk';

export interface ScraperOptions {
  maxRepos: number;
  maxCommitsPerRepo: number;
  maxPRsPerRepo: number;
  includeStars: boolean;
  includePRs: boolean;
  includeOrgRepos: boolean;
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

    // [NOTE]: Fetch organization repos if enabled
    if (this.options.includeOrgRepos && collectedData.profile?.organizations) {
      const orgs = collectedData.profile.organizations;
      if (orgs.length > 0) {
        this.progress.start(`Analyzing organization repositories (${orgs.length} orgs)...`);
        const orgResult = await this.analyzeOrgRepositories(orgs, processedRepos);
        collectedData.repos = [...collectedData.repos, ...orgResult.repos];
        collectedData.commits = [...collectedData.commits, ...orgResult.commits];
        collectedData.pullRequests = [...collectedData.pullRequests, ...orgResult.prs];
        this.progress.succeed(`Analyzed ${orgResult.repos.length} organization repositories`);
      }
    }

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

  // [NOTE]: Analyze repositories from user's organizations
  private async analyzeOrgRepositories(
    orgs: string[],
    processedRepos: Set<string>
  ): Promise<{
    repos: RepoData[];
    commits: CollectedGitHubData['commits'];
    prs: CollectedGitHubData['pullRequests'];
  }> {
    const repos: RepoData[] = [];
    const commits: CollectedGitHubData['commits'] = [];
    const prs: CollectedGitHubData['pullRequests'] = [];

    const commitAnalyzer = new CommitAnalyzer(this.client, {
      maxCommitsPerRepo: this.options.maxCommitsPerRepo,
      verbose: this.options.verbose,
    });

    const prAnalyzer = new PRAnalyzer(this.client, {
      maxPRsPerRepo: this.options.maxPRsPerRepo,
      verbose: this.options.verbose,
    });

    // [NOTE]: Calculate repos per org to stay within maxRepos limit
    const reposPerOrg = Math.ceil(this.options.maxRepos / orgs.length);
    let totalOrgRepos = 0;

    for (const org of orgs) {
      if (totalOrgRepos >= this.options.maxRepos) break;

      let orgRepoCount = 0;
      for await (const repo of this.client.paginateOrgRepos(org, { maxRepos: reposPerOrg })) {
        if (processedRepos.has(repo.full_name)) {
          if (this.options.verbose) {
            console.log(chalk.gray(`  Skipping already processed org repo: ${repo.full_name}`));
          }
          continue;
        }

        if (totalOrgRepos >= this.options.maxRepos) break;

        totalOrgRepos++;
        orgRepoCount++;
        this.progress.update(`Analyzing org ${org}: ${orgRepoCount} repos`);

        const [owner, repoName] = repo.full_name.split('/');
        const languages = await this.client.getRepoLanguages(owner, repoName);
        const rootFiles = await this.client.getRepoRootFiles(owner, repoName);

        let readme: string | undefined;
        if (this.options.includeReadme) {
          const readmeContent = await this.client.getRepoReadme(owner, repoName);
          readme = readmeContent ?? undefined;
        }

        const repoData: RepoData = {
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          description: repo.description ?? null,
          language: repo.language ?? null,
          languages,
          topics: repo.topics || [],
          stars: repo.stargazers_count ?? 0,
          forks: repo.forks_count ?? 0,
          isOwner: false, // [NOTE]: Org repos are not owned by user
          createdAt: repo.created_at || '',
          updatedAt: repo.updated_at || '',
          readme,
          rootFiles,
        };

        repos.push(repoData);
        processedRepos.add(repo.full_name);

        // [NOTE]: Analyze commits
        for await (const commit of commitAnalyzer.analyzeCommits(repo.full_name)) {
          commits.push(commit);
        }

        // [NOTE]: Analyze PRs
        if (this.options.includePRs) {
          for await (const pr of prAnalyzer.analyzePullRequests(repo.full_name)) {
            prs.push(pr);
          }
        }
      }
    }

    return { repos, commits, prs };
  }

  private async fetchStarredRepos(): Promise<StarredRepo[]> {
    const stars: StarredRepo[] = [];
    let count = 0;
    const ghConfig = getGitHubConfig();

    for await (const repo of this.client.paginateStarredRepos({ maxStars: ghConfig.maxStars })) {
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

// [NOTE]: Extract technologies from repo root files (config file detection)
function extractTechnologiesFromRootFiles(rootFiles: string[]): string[] {
  const specialFiles = getSpecialFiles();
  const technologies: string[] = [];

  for (const file of rootFiles) {
    const fileLower = file.toLowerCase();
    for (const [pattern, tech] of Object.entries(specialFiles)) {
      if (fileLower === pattern.toLowerCase() || fileLower.includes(pattern.toLowerCase())) {
        technologies.push(tech as string);
      }
    }
  }

  return [...new Set(technologies)];
}


// [NOTE]: Find skills in text using API skill names (whole word matching)
// Uses safe word boundary check to prevent ReDoS attacks
function findSkillsInText(text: string, skillNames: string[]): string[] {
  const textLower = text.toLowerCase();
  const foundSkills: string[] = [];

  for (const skillName of skillNames) {
    const skillLower = skillName.toLowerCase();
    // Use safe word boundary check instead of dynamic RegExp to prevent ReDoS
    if (isWholeWordMatch(textLower, skillLower)) {
      foundSkills.push(skillName);
    }
  }

  return foundSkills;
}

export function extractAllTechnologies(
  data: CollectedGitHubData,
  skillNames?: string[]
): Map<string, number> {
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

    // [NOTE]: Extract technologies from root files (config detection)
    if (repo.rootFiles && repo.rootFiles.length > 0) {
      const rootTechs = extractTechnologiesFromRootFiles(repo.rootFiles);
      for (const tech of rootTechs) {
        increment(tech, 3); // Config file detection is reliable
      }
    }

    // [NOTE]: Extract technologies from README using API skill names
    if (repo.readme && skillNames && skillNames.length > 0) {
      const readmeTechs = findSkillsInText(repo.readme, skillNames);
      for (const tech of readmeTechs) {
        increment(tech, 1); // README mentions
      }
    }
  }

  for (const commit of data.commits) {
    const techs = extractTechnologiesFromCommit(commit.message, commit.filesChanged);
    for (const tech of techs) {
      increment(tech, 1);
    }
  }

  // [NOTE]: Extract technologies from PRs using API skill names
  for (const pr of data.pullRequests) {
    const prTechs = extractTechnologiesFromPR(pr.title, pr.body, skillNames);
    for (const tech of prTechs) {
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
