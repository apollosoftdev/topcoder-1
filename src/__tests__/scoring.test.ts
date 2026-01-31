import { ScoringEngine, getTopScoredSkills, ScoredSkill } from '../analysis/scoring';
import { MatchedSkill } from '../topcoder/skill-matcher';
import { CollectedGitHubData, TopcoderSkill } from '../utils/cache';

// Mock data factories
function createMockSkill(overrides: Partial<TopcoderSkill> = {}): TopcoderSkill {
  return {
    id: 'skill-123',
    name: 'JavaScript',
    category: 'Programming Languages',
    ...overrides,
  };
}

function createMockMatchedSkill(overrides: Partial<MatchedSkill> = {}): MatchedSkill {
  return {
    skill: createMockSkill(),
    matchedTerms: ['javascript', 'js'],
    rawScore: 100,
    ...overrides,
  };
}

function createMockGitHubData(overrides: Partial<CollectedGitHubData> = {}): CollectedGitHubData {
  return {
    repos: [
      {
        name: 'my-project',
        fullName: 'user/my-project',
        url: 'https://github.com/user/my-project',
        language: 'JavaScript',
        languages: { JavaScript: 50000, TypeScript: 10000 },
        stars: 10,
        forks: 2,
        topics: ['nodejs', 'express'],
        description: 'A sample project',
        isOwner: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    commits: [
      {
        sha: 'abc123',
        message: 'Add JavaScript feature',
        date: new Date().toISOString(),
        repo: 'user/my-project',
        filesChanged: ['src/index.js', 'src/utils.js'],
        additions: 100,
        deletions: 20,
      },
    ],
    pullRequests: [
      {
        number: 1,
        title: 'Add new JavaScript module',
        body: 'This PR adds a new JavaScript module',
        state: 'closed',
        merged: true,
        url: 'https://github.com/user/my-project/pull/1',
        repo: 'user/my-project',
        createdAt: new Date().toISOString(),
        isAuthor: true,
      },
    ],
    languages: {},
    stars: [],
    ...overrides,
  };
}

describe('ScoringEngine', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine();
  });

  describe('scoreSkills', () => {
    it('should score matched skills', () => {
      const matchedSkills = [createMockMatchedSkill()];
      const data = createMockGitHubData();

      const scored = engine.scoreSkills(matchedSkills, data);

      expect(scored).toHaveLength(1);
      expect(scored[0].skill).toBeDefined();
      expect(scored[0].score).toBeGreaterThan(0);
      expect(scored[0].score).toBeLessThanOrEqual(100);
      expect(scored[0].components).toBeDefined();
      expect(scored[0].explanation).toBeDefined();
    });

    it('should include all score components', () => {
      const matchedSkills = [createMockMatchedSkill()];
      const data = createMockGitHubData();

      const scored = engine.scoreSkills(matchedSkills, data);
      const components = scored[0].components;

      expect(components.languageScore).toBeDefined();
      expect(components.commitScore).toBeDefined();
      expect(components.prScore).toBeDefined();
      expect(components.projectQualityScore).toBeDefined();
      expect(components.recencyScore).toBeDefined();
    });

    it('should score higher for more evidence', () => {
      const matchedSkill = createMockMatchedSkill({ rawScore: 200 });
      const dataWithMoreRepos = createMockGitHubData({
        repos: [
          ...createMockGitHubData().repos,
          {
            name: 'another-project',
            fullName: 'user/another-project',
            url: 'https://github.com/user/another-project',
            language: 'JavaScript',
            languages: { JavaScript: 100000 },
            stars: 50,
            forks: 10,
            topics: ['javascript'],
            description: 'Another JS project',
            isOwner: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        commits: [
          ...createMockGitHubData().commits,
          {
            sha: 'def456',
            message: 'Another JS commit',
            date: new Date().toISOString(),
            repo: 'user/another-project',
            filesChanged: ['app.js'],
            additions: 50,
            deletions: 10,
          },
        ],
      });

      const basicScored = engine.scoreSkills([createMockMatchedSkill()], createMockGitHubData());
      const enhancedScored = engine.scoreSkills([matchedSkill], dataWithMoreRepos);

      expect(enhancedScored[0].score).toBeGreaterThanOrEqual(basicScored[0].score);
    });

    it('should handle multiple skills', () => {
      const matchedSkills = [
        createMockMatchedSkill({
          skill: createMockSkill({ id: '1', name: 'JavaScript' }),
          matchedTerms: ['javascript'],
          rawScore: 100
        }),
        createMockMatchedSkill({
          skill: createMockSkill({ id: '2', name: 'TypeScript' }),
          matchedTerms: ['typescript'],
          rawScore: 50
        }),
      ];

      const data = createMockGitHubData();
      const scored = engine.scoreSkills(matchedSkills, data);

      expect(scored).toHaveLength(2);
      expect(scored.every(s => s.score > 0)).toBe(true);
    });

    it('should generate explanations', () => {
      const matchedSkills = [createMockMatchedSkill()];
      const data = createMockGitHubData();

      const scored = engine.scoreSkills(matchedSkills, data);

      expect(scored[0].explanation).toBeTruthy();
      expect(typeof scored[0].explanation).toBe('string');
      expect(scored[0].explanation.length).toBeGreaterThan(0);
    });
  });

  describe('score bounds', () => {
    it('should never exceed max score of 100', () => {
      const matchedSkill = createMockMatchedSkill({ rawScore: 10000 });
      const data = createMockGitHubData();

      const scored = engine.scoreSkills([matchedSkill], data);

      expect(scored[0].score).toBeLessThanOrEqual(100);
    });

    it('should have a minimum base score for matched skills', () => {
      const matchedSkill = createMockMatchedSkill({ rawScore: 1 });
      const minimalData = createMockGitHubData({
        repos: [],
        commits: [],
        pullRequests: [],
      });

      const scored = engine.scoreSkills([matchedSkill], minimalData);

      // Base score is 15 per config
      expect(scored[0].score).toBeGreaterThanOrEqual(15);
    });
  });
});

describe('getTopScoredSkills', () => {
  function createScoredSkill(score: number, name: string = 'Skill'): ScoredSkill {
    return {
      skill: createMockSkill({ name }),
      score,
      components: {
        languageScore: 50,
        commitScore: 50,
        prScore: 50,
        projectQualityScore: 50,
        recencyScore: 50,
      },
      evidence: [],
      explanation: 'Test explanation',
    };
  }

  it('should filter skills below threshold', () => {
    const skills = [
      createScoredSkill(50, 'High'),
      createScoredSkill(10, 'Low'), // Below 15 threshold
      createScoredSkill(30, 'Medium'),
    ];

    const top = getTopScoredSkills(skills);

    expect(top).toHaveLength(2);
    expect(top.find(s => s.skill.name === 'Low')).toBeUndefined();
  });

  it('should sort by score descending', () => {
    const skills = [
      createScoredSkill(30, 'Third'),
      createScoredSkill(80, 'First'),
      createScoredSkill(50, 'Second'),
    ];

    const top = getTopScoredSkills(skills);

    expect(top[0].skill.name).toBe('First');
    expect(top[1].skill.name).toBe('Second');
    expect(top[2].skill.name).toBe('Third');
  });

  it('should limit results to specified count', () => {
    const skills = Array.from({ length: 30 }, (_, i) =>
      createScoredSkill(50 + i, `Skill${i}`)
    );

    const top10 = getTopScoredSkills(skills, 10);
    const top5 = getTopScoredSkills(skills, 5);

    expect(top10).toHaveLength(10);
    expect(top5).toHaveLength(5);
  });

  it('should return all skills above threshold when limit is disabled (default)', () => {
    // [NOTE]: enableSkillLimit is false by default in config, so all skills above threshold are returned
    const skills = Array.from({ length: 30 }, (_, i) =>
      createScoredSkill(50 + i, `Skill${i}`)
    );

    const top = getTopScoredSkills(skills);

    // All 30 skills are above minScoreThreshold (15), so all should be returned
    expect(top).toHaveLength(30);
  });
});
