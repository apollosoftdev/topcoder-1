import ora, { Ora } from 'ora';
import chalk from 'chalk';

export class ProgressReporter {
  private spinner: Ora | null = null;
  private verbose: boolean;
  private silent: boolean;

  constructor(options?: { verbose?: boolean; silent?: boolean }) {
    this.verbose = options?.verbose ?? false;
    this.silent = options?.silent ?? false;
  }

  start(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.stop();
    }
    this.spinner = ora({
      text: message,
      color: 'cyan',
    }).start();
  }

  update(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.text = message;
    } else if (this.verbose) {
      console.log(chalk.gray(`  ${message}`));
    }
  }

  succeed(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.succeed(chalk.green(message));
      this.spinner = null;
    } else {
      console.log(chalk.green(`✓ ${message}`));
    }
  }

  fail(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.fail(chalk.red(message));
      this.spinner = null;
    } else {
      console.log(chalk.red(`✗ ${message}`));
    }
  }

  warn(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.warn(chalk.yellow(message));
      this.spinner = null;
    } else {
      console.log(chalk.yellow(`⚠ ${message}`));
    }
  }

  info(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.info(chalk.blue(message));
      this.spinner = null;
    } else {
      console.log(chalk.blue(`ℹ ${message}`));
    }
  }

  log(message: string): void {
    if (this.silent) return;

    const wasSpinning = this.spinner?.isSpinning;
    const spinnerText = this.spinner?.text;

    if (wasSpinning) {
      this.spinner?.stop();
    }

    console.log(message);

    if (wasSpinning && spinnerText) {
      this.spinner = ora({
        text: spinnerText,
        color: 'cyan',
      }).start();
    }
  }

  verbose_log(message: string): void {
    if (!this.verbose || this.silent) return;

    const wasSpinning = this.spinner?.isSpinning;
    const spinnerText = this.spinner?.text;

    if (wasSpinning) {
      this.spinner?.stop();
    }

    console.log(chalk.gray(`  ${message}`));

    if (wasSpinning && spinnerText) {
      this.spinner = ora({
        text: spinnerText,
        color: 'cyan',
      }).start();
    }
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  clear(): void {
    if (this.spinner) {
      this.spinner.clear();
    }
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
