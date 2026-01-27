import { RepoData, LanguageStats } from '../utils/cache';

export function aggregateLanguages(repos: RepoData[]): LanguageStats {
  const stats: LanguageStats = {};
  let totalBytes = 0;

  for (const repo of repos) {
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      if (!stats[lang]) {
        stats[lang] = { bytes: 0, repos: 0, percentage: 0 };
      }
      stats[lang].bytes += bytes;
      stats[lang].repos += 1;
      totalBytes += bytes;
    }
  }

  for (const lang of Object.keys(stats)) {
    stats[lang].percentage = totalBytes > 0
      ? Math.round((stats[lang].bytes / totalBytes) * 10000) / 100
      : 0;
  }

  return stats;
}
