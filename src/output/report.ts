import chalk from 'chalk';
import { ScoredSkill } from '../analysis/scoring';
import { ScraperStats } from '../github/scraper';
import { formatDuration } from './progress';
import { formatEvidenceCompact } from '../analysis/evidence';

export interface ReportOptions {
  format: 'text' | 'json';
  verbose: boolean;
  showEvidence: boolean;
}

export interface SkillReport {
  skills: SkillReportEntry[];
  summary: RunSummary;
}

export interface SkillReportEntry {
  id: string;
  name: string;
  category?: string;
  score: number;
  explanation: string;
  evidence: string[];
}

export interface RunSummary {
  reposScanned: number;
  commitsAnalyzed: number;
  prsAnalyzed: number;
  starsScanned: number;
  apiCalls: number;
  elapsedTime: string;
  skillsMatched: number;
}

export class ReportGenerator {
  private options: ReportOptions;

  constructor(options: ReportOptions) {
    this.options = options;
  }

  generate(skills: ScoredSkill[], stats: ScraperStats): string {
    const report = this.buildReport(skills, stats);

    if (this.options.format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    return this.formatTextReport(report);
  }

  private buildReport(skills: ScoredSkill[], stats: ScraperStats): SkillReport {
    const skillEntries: SkillReportEntry[] = skills.map(skill => ({
      id: skill.skill.id,
      name: skill.skill.name,
      category: skill.skill.category,
      score: skill.score,
      explanation: skill.explanation,
      evidence: formatEvidenceCompact(skill.evidence),
    }));

    const summary: RunSummary = {
      reposScanned: stats.reposScanned,
      commitsAnalyzed: stats.commitsAnalyzed,
      prsAnalyzed: stats.prsAnalyzed,
      starsScanned: stats.starsScanned,
      apiCalls: stats.apiCalls,
      elapsedTime: formatDuration(stats.elapsedMs),
      skillsMatched: skills.length,
    };

    return { skills: skillEntries, summary };
  }

  private formatTextReport(report: SkillReport): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push(chalk.bold.cyan('  TOPCODER SKILLS RECOMMENDATIONS'));
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push('');

    if (report.skills.length === 0) {
      lines.push(chalk.yellow('No skills matched. Try analyzing more repositories.'));
      lines.push('');
    } else {
      lines.push(chalk.bold('Matched Skills:'));
      lines.push('');

      for (const skill of report.skills) {
        const scoreBar = this.formatScoreBar(skill.score);
        const scoreColor = this.getScoreColor(skill.score);

        lines.push(`  ${chalk.bold(skill.name)}`);
        lines.push(`  ${scoreBar} ${scoreColor(`${skill.score}/100`)}`);
        lines.push(`  ${chalk.gray(`ID: ${skill.id}`)}`);

        if (skill.category) {
          lines.push(`  ${chalk.gray(`Category: ${skill.category}`)}`);
        }

        lines.push(`  ${chalk.italic(skill.explanation)}`);

        if (this.options.showEvidence && skill.evidence.length > 0) {
          lines.push(`  ${chalk.gray('Evidence:')}`);
          for (const url of skill.evidence.slice(0, 3)) {
            lines.push(`    ${chalk.blue.underline(url)}`);
          }
        }

        lines.push('');
      }
    }

    lines.push(chalk.bold.cyan('─'.repeat(60)));
    lines.push(chalk.bold('Run Summary:'));
    lines.push('');
    lines.push(`  Repositories scanned: ${chalk.green(report.summary.reposScanned)}`);
    lines.push(`  Commits analyzed:     ${chalk.green(report.summary.commitsAnalyzed)}`);
    lines.push(`  Pull requests:        ${chalk.green(report.summary.prsAnalyzed)}`);
    lines.push(`  Starred repos:        ${chalk.green(report.summary.starsScanned)}`);
    lines.push(`  API calls made:       ${chalk.yellow(report.summary.apiCalls)}`);
    lines.push(`  Total time:           ${chalk.cyan(report.summary.elapsedTime)}`);
    lines.push(`  Skills matched:       ${chalk.green(report.summary.skillsMatched)}`);
    lines.push('');
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push('');

    return lines.join('\n');
  }

  private formatScoreBar(score: number): string {
    const width = 20;
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;

    const filledChar = '█';
    const emptyChar = '░';

    const color = this.getScoreColor(score);
    return color(filledChar.repeat(filled)) + chalk.gray(emptyChar.repeat(empty));
  }

  private getScoreColor(score: number): chalk.Chalk {
    if (score >= 70) return chalk.green;
    if (score >= 40) return chalk.yellow;
    return chalk.red;
  }
}

export function printReport(skills: ScoredSkill[], stats: ScraperStats, options: ReportOptions): void {
  const generator = new ReportGenerator(options);
  const report = generator.generate(skills, stats);
  console.log(report);
}
