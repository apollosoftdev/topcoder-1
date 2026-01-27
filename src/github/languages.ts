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

export interface LanguageRanking {
  language: string;
  bytes: number;
  repos: number;
  percentage: number;
  rank: number;
}

export function rankLanguages(stats: LanguageStats): LanguageRanking[] {
  return Object.entries(stats)
    .map(([language, data]) => ({
      language,
      bytes: data.bytes,
      repos: data.repos,
      percentage: data.percentage,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .map((lang, index) => ({ ...lang, rank: index + 1 }));
}

export const LANGUAGE_TO_SKILL_MAP: Record<string, string[]> = {
  'JavaScript': ['JavaScript', 'Web Development', 'Frontend Development', 'Node.js'],
  'TypeScript': ['TypeScript', 'JavaScript', 'Web Development', 'Frontend Development'],
  'Python': ['Python', 'Backend Development', 'Data Science', 'Machine Learning'],
  'Java': ['Java', 'Backend Development', 'Android Development', 'Enterprise Development'],
  'Kotlin': ['Kotlin', 'Android Development', 'Backend Development', 'Java'],
  'Swift': ['Swift', 'iOS Development', 'Mobile Development'],
  'Go': ['Go', 'Backend Development', 'Cloud Computing', 'DevOps'],
  'Rust': ['Rust', 'Systems Programming', 'Backend Development'],
  'C++': ['C++', 'Systems Programming', 'Game Development', 'Embedded Systems'],
  'C': ['C', 'Systems Programming', 'Embedded Systems'],
  'C#': ['C#', '.NET', 'Backend Development', 'Game Development', 'Unity'],
  'Ruby': ['Ruby', 'Ruby on Rails', 'Backend Development', 'Web Development'],
  'PHP': ['PHP', 'Backend Development', 'Web Development', 'WordPress'],
  'Scala': ['Scala', 'Backend Development', 'Big Data', 'Functional Programming'],
  'Shell': ['Shell Scripting', 'DevOps', 'Linux', 'Automation'],
  'Bash': ['Bash', 'Shell Scripting', 'DevOps', 'Linux'],
  'PowerShell': ['PowerShell', 'Windows Administration', 'DevOps'],
  'HTML': ['HTML', 'Web Development', 'Frontend Development'],
  'CSS': ['CSS', 'Web Development', 'Frontend Development', 'UI Design'],
  'SCSS': ['SCSS', 'CSS', 'Web Development', 'Frontend Development'],
  'SQL': ['SQL', 'Database Management', 'Data Analysis'],
  'R': ['R', 'Data Science', 'Statistical Analysis', 'Data Visualization'],
  'MATLAB': ['MATLAB', 'Data Science', 'Scientific Computing'],
  'Julia': ['Julia', 'Data Science', 'Scientific Computing', 'Machine Learning'],
  'Dart': ['Dart', 'Flutter', 'Mobile Development'],
  'Objective-C': ['Objective-C', 'iOS Development', 'Mobile Development'],
  'Perl': ['Perl', 'Scripting', 'Text Processing'],
  'Haskell': ['Haskell', 'Functional Programming'],
  'Clojure': ['Clojure', 'Functional Programming', 'JVM'],
  'Elixir': ['Elixir', 'Functional Programming', 'Backend Development', 'Phoenix'],
  'Erlang': ['Erlang', 'Distributed Systems', 'Telecommunications'],
  'Lua': ['Lua', 'Game Development', 'Scripting'],
  'HCL': ['Terraform', 'Infrastructure as Code', 'DevOps', 'Cloud Computing'],
  'Dockerfile': ['Docker', 'Containers', 'DevOps'],
  'Makefile': ['Build Systems', 'DevOps'],
  'Vue': ['Vue.js', 'Frontend Development', 'JavaScript'],
  'Svelte': ['Svelte', 'Frontend Development', 'JavaScript'],
};

export function mapLanguageToSkills(language: string): string[] {
  return LANGUAGE_TO_SKILL_MAP[language] || [language];
}

export function getTopLanguages(stats: LanguageStats, limit: number = 10): string[] {
  return rankLanguages(stats)
    .slice(0, limit)
    .map(l => l.language);
}
