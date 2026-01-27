import chalk from 'chalk';

// [NOTE]: Rate limit info extracted from GitHub API headers
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: Date;
  used: number;
}

// [!IMPORTANT]: Handles GitHub API rate limiting to prevent 403 errors
export class RateLimiter {
  private remaining: number = 5000; // [NOTE]: GitHub default for authenticated requests
  private limit: number = 5000;
  private resetTime: Date = new Date();
  private minRemaining: number = 100; // [NOTE]: Buffer before pausing
  private verbose: boolean = false;

  constructor(options?: { minRemaining?: number; verbose?: boolean }) {
    this.minRemaining = options?.minRemaining ?? 100;
    this.verbose = options?.verbose ?? false;
  }

  // [!IMPORTANT]: Call after each API request to track rate limit
  updateFromHeaders(headers: {
    'x-ratelimit-remaining'?: string;
    'x-ratelimit-limit'?: string;
    'x-ratelimit-reset'?: string;
    'x-ratelimit-used'?: string;
  }): void {
    if (headers['x-ratelimit-remaining']) {
      this.remaining = parseInt(headers['x-ratelimit-remaining'], 10);
    }
    if (headers['x-ratelimit-limit']) {
      this.limit = parseInt(headers['x-ratelimit-limit'], 10);
    }
    if (headers['x-ratelimit-reset']) {
      // [NOTE]: GitHub returns Unix timestamp in seconds
      this.resetTime = new Date(parseInt(headers['x-ratelimit-reset'], 10) * 1000);
    }

    if (this.verbose) {
      console.log(chalk.gray(`  Rate limit: ${this.remaining}/${this.limit} remaining, resets at ${this.resetTime.toLocaleTimeString()}`));
    }
  }

  getInfo(): RateLimitInfo {
    return {
      remaining: this.remaining,
      limit: this.limit,
      reset: this.resetTime,
      used: this.limit - this.remaining,
    };
  }

  // [NOTE]: Check if we're getting close to the limit
  isApproachingLimit(): boolean {
    return this.remaining <= this.minRemaining;
  }

  // [!IMPORTANT]: Pauses execution if rate limit is approaching
  // This prevents hitting 403 errors
  async waitIfNeeded(): Promise<void> {
    if (this.isApproachingLimit()) {
      const now = new Date();
      const waitMs = Math.max(0, this.resetTime.getTime() - now.getTime()) + 1000;

      if (waitMs > 0) {
        const waitMinutes = Math.ceil(waitMs / 60000);
        console.log(chalk.yellow(`\nRate limit approaching (${this.remaining} remaining). Waiting ${waitMinutes} minute(s) until reset...`));
        await this.sleep(waitMs);
        console.log(chalk.green('Rate limit reset. Resuming...\n'));
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // [NOTE]: Exponential backoff for transient errors
  async exponentialBackoff(attempt: number, maxAttempts: number = 5): Promise<boolean> {
    if (attempt >= maxAttempts) {
      return false; // [NOTE]: Return false to indicate max retries reached
    }

    // [NOTE]: Wait time doubles each attempt: 1s, 2s, 4s, 8s... max 60s
    const waitMs = Math.min(1000 * Math.pow(2, attempt), 60000);
    console.log(chalk.yellow(`Retry attempt ${attempt + 1}/${maxAttempts}, waiting ${waitMs / 1000}s...`));
    await this.sleep(waitMs);
    return true; // [NOTE]: Return true to indicate should retry
  }
}
