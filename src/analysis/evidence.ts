import { CollectedGitHubData } from '../utils/cache';
import { getEvidenceConfig, areTermsAliases, getSpecialFiles, getFileExtensions } from '../utils/config';
import { isWholeWordMatch } from '../utils/string-utils';

// [NOTE]: Check if two terms match (exact, normalized, or aliases) - uses config/constants.json
function termsMatch(term1: string, term2: string): boolean {
  return areTermsAliases(term1, term2);
}

// [NOTE]: Check if a file indicates a specific technology (for root file evidence)
function fileIndicatesTechnology(filename: string, terms: string[]): boolean {
  const specialFiles = getSpecialFiles();
  const fileLower = filename.toLowerCase();

  for (const term of terms) {
    const termLower = term.toLowerCase();
    // Check special files mapping (e.g., Dockerfile -> Docker)
    for (const [pattern, tech] of Object.entries(specialFiles)) {
      if ((fileLower === pattern.toLowerCase() || fileLower.includes(pattern.toLowerCase())) &&
          termsMatch(termLower, (tech as string).toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

// [NOTE]: Check if a file matches skill by extension
function fileMatchesSkillByExtension(filename: string, terms: string[]): boolean {
  const fileLower = filename.toLowerCase();
  for (const term of terms) {
    const extensions = getFileExtensions(term);
    if (extensions.some(ext => fileLower.endsWith(ext.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

export interface Evidence {
  type: 'repo' | 'commit' | 'pr' | 'starred' | 'topic';
  title: string;
  url: string;
  detail?: string;
}

// [NOTE]: Get evidence limits from config (config/constants.json)
function getEvidenceLimits() {
  const config = getEvidenceConfig();
  return {
    maxPerSkill: config.maxPerSkill,
    repoLimit: config.repoLimit,
    prLimit: config.prLimit,
    commitLimit: config.commitLimit,
    starLimit: config.starLimit,
  };
}

export function collectEvidence(
  terms: string[],
  data: CollectedGitHubData,
  maxEvidence?: number
): Evidence[] {
  const limits = getEvidenceLimits();
  const max = maxEvidence ?? limits.maxPerSkill;
  const evidence: Evidence[] = [];

  const repoEvidence = collectRepoEvidence(terms, data, limits.repoLimit);
  evidence.push(...repoEvidence);

  const prEvidence = collectPREvidence(terms, data, limits.prLimit);
  evidence.push(...prEvidence);

  const commitEvidence = collectCommitEvidence(terms, data, limits.commitLimit);
  evidence.push(...commitEvidence);

  const starEvidence = collectStarEvidence(terms, data, limits.starLimit);
  evidence.push(...starEvidence);

  return evidence.slice(0, max);
}

function collectRepoEvidence(
  terms: string[],
  data: CollectedGitHubData,
  limit: number
): Evidence[] {
  const evidence: Evidence[] = [];

  const matchingRepos = data.repos
    .filter(repo => {
      const repoTerms = [
        repo.language?.toLowerCase(),
        ...Object.keys(repo.languages).map(l => l.toLowerCase()),
        ...repo.topics.map(t => t.toLowerCase()),
      ].filter((rt): rt is string => rt !== undefined);

      // [NOTE]: Check 1 - language/topic match
      const hasLanguageMatch = terms.some(t => repoTerms.some(rt => termsMatch(t, rt)));
      if (hasLanguageMatch) return true;

      // [NOTE]: Check 2 - root files indicate technology (e.g., Dockerfile -> Docker)
      if (repo.rootFiles && repo.rootFiles.length > 0) {
        const hasRootFileMatch = repo.rootFiles.some(file => fileIndicatesTechnology(file, terms));
        if (hasRootFileMatch) return true;
      }

      // [NOTE]: Check 3 - README mentions technology (whole word match)
      if (repo.readme) {
        const readmeLower = repo.readme.toLowerCase();
        const hasReadmeMatch = terms.some(t => isWholeWordMatch(readmeLower, t.toLowerCase()));
        if (hasReadmeMatch) return true;
      }

      return false;
    })
    .sort((a, b) => b.stars - a.stars);

  for (const repo of matchingRepos.slice(0, limit)) {
    const languages = Object.keys(repo.languages).slice(0, 3).join(', ');
    evidence.push({
      type: 'repo',
      title: repo.fullName,
      url: repo.url,
      detail: languages ? `Languages: ${languages}` : undefined,
    });
  }

  return evidence;
}

function collectPREvidence(
  terms: string[],
  data: CollectedGitHubData,
  limit: number
): Evidence[] {
  const evidence: Evidence[] = [];

  const matchingPRs = data.pullRequests
    .filter(pr => {
      const text = `${pr.title} ${pr.body || ''}`.toLowerCase();
      // Use whole word matching to prevent "java" matching "javascript"
      return terms.some(t => isWholeWordMatch(text.toLowerCase(), t.toLowerCase()));
    })
    .filter(pr => pr.merged)
    .slice(0, limit);

  for (const pr of matchingPRs) {
    evidence.push({
      type: 'pr',
      title: `PR #${pr.number}: ${pr.title}`,
      url: pr.url,
      detail: pr.merged ? 'Merged' : pr.state,
    });
  }

  return evidence;
}

function collectCommitEvidence(
  terms: string[],
  data: CollectedGitHubData,
  limit: number
): Evidence[] {
  const evidence: Evidence[] = [];

  const repoCommitCounts: Map<string, number> = new Map();

  for (const commit of data.commits) {
    const messageLower = commit.message.toLowerCase();

    // [NOTE]: Check 1 - commit message mentions technology (whole word match)
    const hasMessageMatch = terms.some(t => isWholeWordMatch(messageLower, t.toLowerCase()));

    // [NOTE]: Check 2 - commit files match skill by extension (e.g., .ts files for TypeScript)
    const hasFileMatch = commit.filesChanged.some(file => fileMatchesSkillByExtension(file, terms));

    if (hasMessageMatch || hasFileMatch) {
      const count = repoCommitCounts.get(commit.repo) || 0;
      repoCommitCounts.set(commit.repo, count + 1);
    }
  }

  const sortedRepos = Array.from(repoCommitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  for (const [repoName, count] of sortedRepos) {
    const repo = data.repos.find(r => r.fullName === repoName);
    if (repo) {
      evidence.push({
        type: 'commit',
        title: `${count} commits in ${repoName}`,
        url: `${repo.url}/commits`,
        detail: `Active contributor`,
      });
    }
  }

  return evidence;
}

function collectStarEvidence(
  terms: string[],
  data: CollectedGitHubData,
  limit: number
): Evidence[] {
  const evidence: Evidence[] = [];

  const matchingStars = data.stars
    .filter(star => {
      const starTerms = [
        star.language?.toLowerCase(),
        ...star.topics.map(t => t.toLowerCase()),
      ].filter((st): st is string => st !== undefined); // [NOTE]: Filter out undefined
      // Use exact/normalized matching to prevent "java" matching "javascript"
      return terms.some(t => starTerms.some(st => termsMatch(t, st)));
    })
    .slice(0, limit);

  for (const star of matchingStars) {
    evidence.push({
      type: 'starred',
      title: `Starred: ${star.fullName}`,
      url: star.url,
      detail: star.description?.slice(0, 50) || undefined,
    });
  }

  return evidence;
}

export function formatEvidence(evidence: Evidence[]): string[] {
  return evidence.map(e => {
    let line = `  - [${e.type}] ${e.title}`;
    if (e.detail) {
      line += ` (${e.detail})`;
    }
    line += `\n    ${e.url}`;
    return line;
  });
}

export function formatEvidenceCompact(evidence: Evidence[]): string[] {
  return evidence.map(e => e.url);
}
