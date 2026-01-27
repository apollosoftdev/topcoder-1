import { CollectedGitHubData } from '../utils/cache';

export interface Evidence {
  type: 'repo' | 'commit' | 'pr' | 'starred' | 'topic';
  title: string;
  url: string;
  detail?: string;
}

export function collectEvidence(
  skillName: string,
  terms: string[],
  data: CollectedGitHubData,
  maxEvidence: number = 5
): Evidence[] {
  const evidence: Evidence[] = [];

  const repoEvidence = collectRepoEvidence(terms, data, Math.ceil(maxEvidence / 2));
  evidence.push(...repoEvidence);

  const prEvidence = collectPREvidence(terms, data, Math.floor(maxEvidence / 3));
  evidence.push(...prEvidence);

  const commitEvidence = collectCommitEvidence(terms, data, 2);
  evidence.push(...commitEvidence);

  const starEvidence = collectStarEvidence(terms, data, 1);
  evidence.push(...starEvidence);

  return evidence.slice(0, maxEvidence);
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
        repo.description?.toLowerCase() || '',
      ];
      return terms.some(t => repoTerms.some(rt => rt.includes(t)));
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
      return terms.some(t => text.includes(t));
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
    if (terms.some(t => messageLower.includes(t))) {
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
        star.description?.toLowerCase() || '',
      ];
      return terms.some(t => starTerms.some(st => st.includes(t)));
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
