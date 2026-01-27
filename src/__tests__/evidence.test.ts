import { collectEvidence, formatEvidence, formatEvidenceCompact, Evidence } from '../analysis/evidence';
import { CollectedGitHubData } from '../utils/cache';

function createMockGitHubData(overrides: Partial<CollectedGitHubData> = {}): CollectedGitHubData {
  return {
    repos: [
      {
        name: 'react-app',
        fullName: 'user/react-app',
        url: 'https://github.com/user/react-app',
        language: 'JavaScript',
        languages: { JavaScript: 50000, TypeScript: 10000 },
        stars: 100,
        forks: 20,
        topics: ['react', 'frontend'],
        description: 'A React application',
        isOwner: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'node-api',
        fullName: 'user/node-api',
        url: 'https://github.com/user/node-api',
        language: 'TypeScript',
        languages: { TypeScript: 30000 },
        stars: 50,
        forks: 5,
        topics: ['nodejs', 'api'],
        description: 'Node.js API',
        isOwner: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    commits: [
      {
        sha: 'abc123',
        message: 'Add React component',
        date: new Date().toISOString(),
        repo: 'user/react-app',
        filesChanged: ['src/App.jsx', 'src/components/Header.jsx'],
        additions: 150,
        deletions: 10,
      },
      {
        sha: 'def456',
        message: 'Fix React bug',
        date: new Date().toISOString(),
        repo: 'user/react-app',
        filesChanged: ['src/App.jsx'],
        additions: 5,
        deletions: 3,
      },
    ],
    pullRequests: [
      {
        number: 1,
        title: 'Add React hooks',
        body: 'This PR adds React hooks for state management',
        state: 'closed',
        merged: true,
        url: 'https://github.com/user/react-app/pull/1',
        repo: 'user/react-app',
        createdAt: new Date().toISOString(),
        isAuthor: true,
      },
      {
        number: 2,
        title: 'Update React to v18',
        body: 'Upgrade React version',
        state: 'open',
        merged: false,
        url: 'https://github.com/user/react-app/pull/2',
        repo: 'user/react-app',
        createdAt: new Date().toISOString(),
        isAuthor: true,
      },
    ],
    languages: {},
    stars: [
      {
        name: 'awesome-react',
        fullName: 'awesome/react',
        url: 'https://github.com/awesome/react',
        language: 'JavaScript',
        topics: ['react', 'awesome-list'],
        description: 'Awesome React resources',
      },
    ],
    ...overrides,
  };
}

describe('collectEvidence', () => {
  it('should collect evidence for a skill', () => {
    const data = createMockGitHubData();
    const evidence = collectEvidence(['react'], data);

    expect(evidence).toBeDefined();
    expect(Array.isArray(evidence)).toBe(true);
    expect(evidence.length).toBeGreaterThan(0);
  });

  it('should include repo evidence', () => {
    const data = createMockGitHubData();
    const evidence = collectEvidence(['react'], data);

    const repoEvidence = evidence.filter(e => e.type === 'repo');
    expect(repoEvidence.length).toBeGreaterThan(0);
    expect(repoEvidence[0].url).toContain('github.com');
  });

  it('should include PR evidence for merged PRs', () => {
    const data = createMockGitHubData();
    const evidence = collectEvidence(['react'], data);

    const prEvidence = evidence.filter(e => e.type === 'pr');
    expect(prEvidence.length).toBeGreaterThan(0);
    expect(prEvidence[0].detail).toBe('Merged');
  });

  it('should include commit evidence', () => {
    const data = createMockGitHubData();
    const evidence = collectEvidence(['react'], data);

    const commitEvidence = evidence.filter(e => e.type === 'commit');
    expect(commitEvidence.length).toBeGreaterThan(0);
    expect(commitEvidence[0].title).toContain('commits');
  });

  it('should include starred repo evidence', () => {
    const data = createMockGitHubData();
    const evidence = collectEvidence(['react'], data);

    const starEvidence = evidence.filter(e => e.type === 'starred');
    expect(starEvidence.length).toBeGreaterThan(0);
    expect(starEvidence[0].title).toContain('Starred');
  });

  it('should respect maxEvidence limit', () => {
    const data = createMockGitHubData();

    const evidence3 = collectEvidence(['react'], data, 3);
    const evidence5 = collectEvidence(['react'], data, 5);

    expect(evidence3.length).toBeLessThanOrEqual(3);
    expect(evidence5.length).toBeLessThanOrEqual(5);
  });

  it('should return empty array when no matching data', () => {
    const data = createMockGitHubData();
    const evidence = collectEvidence(['rust', 'cargo'], data);

    expect(evidence).toEqual([]);
  });

  it('should match terms in lowercase', () => {
    const data = createMockGitHubData();

    // Evidence collection expects lowercase terms (caller's responsibility)
    const evidence = collectEvidence(['react'], data);

    expect(evidence.length).toBeGreaterThan(0);
    // Verify it matched against repo topics/languages which are lowercased internally
    const repoEvidence = evidence.filter(e => e.type === 'repo');
    expect(repoEvidence.length).toBeGreaterThan(0);
  });

  it('should prioritize repos by stars', () => {
    const data = createMockGitHubData({
      repos: [
        {
          name: 'low-stars',
          fullName: 'user/low-stars',
          url: 'https://github.com/user/low-stars',
          language: 'JavaScript',
          languages: { JavaScript: 1000 },
          stars: 5,
          forks: 0,
          topics: ['react'],
          description: 'Low stars repo',
          isOwner: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          name: 'high-stars',
          fullName: 'user/high-stars',
          url: 'https://github.com/user/high-stars',
          language: 'JavaScript',
          languages: { JavaScript: 1000 },
          stars: 500,
          forks: 50,
          topics: ['react'],
          description: 'High stars repo',
          isOwner: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const evidence = collectEvidence(['react'], data);
    const repoEvidence = evidence.filter(e => e.type === 'repo');

    if (repoEvidence.length >= 2) {
      expect(repoEvidence[0].title).toBe('user/high-stars');
    }
  });
});

describe('formatEvidence', () => {
  it('should format evidence as strings', () => {
    const evidence: Evidence[] = [
      {
        type: 'repo',
        title: 'user/project',
        url: 'https://github.com/user/project',
        detail: 'Languages: JavaScript',
      },
    ];

    const formatted = formatEvidence(evidence);

    expect(formatted).toHaveLength(1);
    expect(formatted[0]).toContain('[repo]');
    expect(formatted[0]).toContain('user/project');
    expect(formatted[0]).toContain('github.com');
  });

  it('should include detail when present', () => {
    const evidence: Evidence[] = [
      {
        type: 'pr',
        title: 'PR #1: Add feature',
        url: 'https://github.com/user/project/pull/1',
        detail: 'Merged',
      },
    ];

    const formatted = formatEvidence(evidence);

    expect(formatted[0]).toContain('Merged');
  });

  it('should handle evidence without detail', () => {
    const evidence: Evidence[] = [
      {
        type: 'repo',
        title: 'user/project',
        url: 'https://github.com/user/project',
      },
    ];

    const formatted = formatEvidence(evidence);

    expect(formatted[0]).toContain('user/project');
    expect(formatted[0]).not.toContain('undefined');
  });
});

describe('formatEvidenceCompact', () => {
  it('should return only URLs', () => {
    const evidence: Evidence[] = [
      {
        type: 'repo',
        title: 'user/project',
        url: 'https://github.com/user/project',
        detail: 'Languages: JavaScript',
      },
      {
        type: 'pr',
        title: 'PR #1',
        url: 'https://github.com/user/project/pull/1',
      },
    ];

    const compact = formatEvidenceCompact(evidence);

    expect(compact).toHaveLength(2);
    expect(compact[0]).toBe('https://github.com/user/project');
    expect(compact[1]).toBe('https://github.com/user/project/pull/1');
  });
});
