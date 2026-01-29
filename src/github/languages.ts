import { RepoData, LanguageStats } from '../utils/cache';

export function aggregateLanguages(repos: RepoData[]): LanguageStats {
  const stats: LanguageStats = Object.create(null);
  let totalBytes = 0;

  for (const repo of repos) {
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      // Use Object.prototype.hasOwnProperty.call for safe property check to prevent prototype pollution
      if (!Object.prototype.hasOwnProperty.call(stats, lang)) {
        stats[lang] = { bytes: 0, repos: 0, percentage: 0 };
      }
      const langStats = stats[lang];
      langStats.bytes += bytes;
      langStats.repos += 1;
      totalBytes += bytes;
    }
  }

  for (const lang of Object.keys(stats)) {
    const langStats = stats[lang];
    langStats.percentage = totalBytes > 0
      ? Math.round((langStats.bytes / totalBytes) * 10000) / 100
      : 0;
  }

  return stats;
}
