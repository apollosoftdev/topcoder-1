import { RepoData, LanguageStats } from '../utils/cache';

// Internal type for Map-based accumulation
interface LangAccum {
  bytes: number;
  repos: number;
}

export function aggregateLanguages(repos: RepoData[]): LanguageStats {
  // Use Map to avoid object injection vulnerabilities
  const statsMap = new Map<string, LangAccum>();
  let totalBytes = 0;

  for (const repo of repos) {
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      const existing = statsMap.get(lang);
      if (existing) {
        existing.bytes += bytes;
        existing.repos += 1;
      } else {
        statsMap.set(lang, { bytes, repos: 1 });
      }
      totalBytes += bytes;
    }
  }

  // Convert Map to LanguageStats object with calculated percentages
  const stats: LanguageStats = Object.create(null);
  for (const [lang, data] of statsMap.entries()) {
    const percentage = totalBytes > 0
      ? Math.round((data.bytes / totalBytes) * 10000) / 100
      : 0;
    // Use Object.defineProperty for safe property assignment
    Object.defineProperty(stats, lang, {
      value: { bytes: data.bytes, repos: data.repos, percentage },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return stats;
}
