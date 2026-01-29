#!/usr/bin/env node

// [!IMPORTANT]: Load environment variables from .env file first
import 'dotenv/config';

// [!IMPORTANT]: Main CLI entry point - run with `npx ts-node src/index.ts`

import { Command } from 'commander';
import chalk from 'chalk';
import { GitHubOAuth, getClientCredentials } from './auth/github-oauth';
import { GitHubClient } from './github/client';
import { GitHubScraper, extractAllTechnologies } from './github/scraper';
import { TopcoderSkillsAPI } from './topcoder/skills-api';
import { SkillMatcher } from './topcoder/skill-matcher';
import { ScoringEngine, getTopScoredSkills } from './analysis/scoring';
import { Cache } from './utils/cache';
import { ProgressReporter } from './output/progress';
import { printReport } from './output/report';

// [NOTE]: CLI options parsed from command line flags
interface CLIOptions {
  maxRepos: number;
  maxCommitsPerRepo: number;
  includePrs: boolean;
  includeStars: boolean;
  output: 'text' | 'json';
  resume: boolean;
  verbose: boolean;
}

const program = new Command();

// [!IMPORTANT]: CLI configuration and available commands
program
  .name('tc-skills')
  .description('Import your GitHub skills into Topcoder')
  .version('1.0.0')
  .option('--max-repos <number>', 'Maximum repositories to analyze', '100')
  .option('--max-commits-per-repo <number>', 'Maximum commits per repository', '200')
  .option('--include-prs <boolean>', 'Analyze pull requests', 'true')
  .option('--include-stars <boolean>', 'Include starred repos for interest signals', 'true')
  .option('--output <format>', 'Output format: text, json', 'text')
  .option('--resume', 'Resume from previous interrupted run', false)
  .option('--verbose', 'Show detailed progress', false)
  .action(async (options) => {
    try {
      await run(parseOptions(options));
    } catch (error) {
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// [NOTE]: Utility command to clear all cached data
program
  .command('clear-cache')
  .description('Clear all cached data including saved tokens')
  .action(() => {
    const cache = new Cache();
    cache.clearAll();
    console.log(chalk.green('Cache cleared successfully.'));
  });

// [NOTE]: Utility command to check current status
program
  .command('status')
  .description('Show current authentication and cache status')
  .action(() => {
    const cache = new Cache();
    console.log(chalk.bold('\nCache Status:\n'));

    const token = cache.getToken();
    if (token) {
      console.log(chalk.green('  ✓ GitHub token: Saved'));
    } else {
      console.log(chalk.yellow('  ✗ GitHub token: Not saved'));
    }

    if (cache.hasProgress()) {
      console.log(chalk.green(`  ✓ Saved progress: ${cache.getProgressSummary()}`));
    } else {
      console.log(chalk.gray('  ✗ No saved progress'));
    }

    const skills = cache.getSkills();
    if (skills) {
      console.log(chalk.green(`  ✓ Topcoder skills: ${skills.skills.length} cached`));
    } else {
      console.log(chalk.gray('  ✗ Topcoder skills: Not cached'));
    }

    console.log('');
  });

// [NOTE]: Parse string options to proper types
function parseOptions(opts: Record<string, string | boolean>): CLIOptions {
  return {
    maxRepos: parseInt(opts.maxRepos as string, 10) || 100,
    maxCommitsPerRepo: parseInt(opts.maxCommitsPerRepo as string, 10) || 200,
    includePrs: opts.includePrs === true || opts.includePrs === 'true',
    includeStars: opts.includeStars === true || opts.includeStars === 'true',
    output: (opts.output as 'text' | 'json') || 'text',
    resume: opts.resume === true,
    verbose: opts.verbose === true,
  };
}

// [!IMPORTANT]: Main execution flow
async function run(options: CLIOptions): Promise<void> {
  const progress = new ProgressReporter({
    verbose: options.verbose,
    silent: options.output === 'json', // [NOTE]: Suppress spinner for JSON output
  });

  if (options.output !== 'json') {
    console.log(chalk.bold.cyan('\n🔍 Topcoder GitHub Skills Import CLI\n'));
  }

  // [NOTE]: Step 1 - Initialize cache and authenticate
  const cache = new Cache();
  const { clientId } = getClientCredentials(); // [!IMPORTANT]: Requires GITHUB_CLIENT_ID env var
  const oauth = new GitHubOAuth(clientId, cache);

  progress.start('Authenticating with GitHub...');
  const token = await oauth.authenticate();
  progress.succeed('Authenticated with GitHub');

  // [NOTE]: Step 2 - Create GitHub client and scraper
  const githubClient = new GitHubClient({
    token,
    verbose: options.verbose,
  });

  const scraper = new GitHubScraper(githubClient, cache, {
    maxRepos: options.maxRepos,
    maxCommitsPerRepo: options.maxCommitsPerRepo,
    maxPRsPerRepo: 50,
    includeStars: options.includeStars,
    includePRs: options.includePrs,
    includeReadme: true,
    resume: options.resume,
    verbose: options.verbose,
  }, progress);

  // [NOTE]: Step 3 - Scrape GitHub data
  const { data: githubData, stats } = await scraper.scrape();

  // [NOTE]: Step 4 - Initialize Topcoder skills API and fetch all skills
  progress.start('Initializing Topcoder skills API...');
  const skillsApi = new TopcoderSkillsAPI(cache);
  await skillsApi.initialize();

  // [NOTE]: Fetch all skills from API if cache is small (for better detection)
  if (skillsApi.getCachedSkillCount() < 1000) {
    progress.update('Fetching skills from API...');
    await skillsApi.fetchAllSkills();
  }

  const cachedCount = skillsApi.getCachedSkillCount();
  const skillNames = skillsApi.getAllSkillNames();
  progress.succeed(`Skills API ready (${cachedCount} skills loaded)`);

  // [NOTE]: Step 5 - Extract technologies from GitHub data using API skill names
  progress.start('Analyzing technologies...');
  const techCounts = extractAllTechnologies(githubData, skillNames);
  progress.succeed(`Found ${techCounts.size} unique technologies`);

  // [NOTE]: Step 6 - Match technologies to Topcoder skills
  progress.start('Matching skills...');
  const skillMatcher = new SkillMatcher(skillsApi);
  const matchedSkills = await skillMatcher.getTopMatches(techCounts, 30);
  progress.succeed(`Matched ${matchedSkills.length} skills`);

  // [NOTE]: Step 7 - Score and rank skills
  progress.start('Scoring skills...');
  const scoringEngine = new ScoringEngine();
  const scoredSkills = scoringEngine.scoreSkills(matchedSkills, githubData);
  const topSkills = getTopScoredSkills(scoredSkills, 20);
  progress.succeed(`Scored ${topSkills.length} skills`);

  // [NOTE]: Step 8 - Generate and print report
  printReport(topSkills, stats, {
    format: options.output,
    verbose: options.verbose,
    showEvidence: true,
  });
}

program.parse();
