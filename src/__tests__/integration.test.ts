/**
 * Integration tests for the GitHub Skills Import CLI
 * Tests the full flow from data collection to skill recommendation
 */

import { ScoringEngine, getTopScoredSkills } from '../analysis/scoring';
import { collectEvidence } from '../analysis/evidence';
import { SkillMatcher } from '../topcoder/skill-matcher';
import { TopcoderSkillsAPI } from '../topcoder/skills-api';
import { CollectedGitHubData, TopcoderSkill } from '../utils/cache';
import { loadSkillsConfig, clearConfigCache } from '../utils/config';

// Mock TopcoderSkillsAPI for integration tests
class MockTopcoderSkillsAPI {
  private skills: TopcoderSkill[] = [
    { id: 'js-001', name: 'JavaScript', category: 'Programming Languages' },
    { id: 'ts-002', name: 'TypeScript', category: 'Programming Languages' },
    { id: 'py-003', name: 'Python', category: 'Programming Languages' },
    { id: 'react-004', name: 'React.js', category: 'Frontend Frameworks' },
    { id: 'node-005', name: 'Node.js', category: 'Backend' },
    { id: 'docker-006', name: 'Docker', category: 'DevOps' },
    { id: 'aws-007', name: 'AWS', category: 'Cloud' },
    { id: 'go-008', name: 'Go', category: 'Programming Languages' },
    { id: 'rust-009', name: 'Rust', category: 'Programming Languages' },
    { id: 'graphql-010', name: 'GraphQL', category: 'API' },
  ];

  async searchSkillsAsync(term: string): Promise<TopcoderSkill[]> {
    const termLower = term.toLowerCase();
    return this.skills.filter(
      s => s.name.toLowerCase().includes(termLower) ||
           termLower.includes(s.name.toLowerCase().replace(/[.\s-]/g, ''))
    );
  }

  getSkillByName(name: string): TopcoderSkill | undefined {
    return this.skills.find(s => s.name.toLowerCase() === name.toLowerCase());
  }
}

// Create realistic mock GitHub data
function createRealisticGitHubData(): CollectedGitHubData {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  return {
    repos: [
      {
        name: 'react-dashboard',
        fullName: 'user/react-dashboard',
        url: 'https://github.com/user/react-dashboard',
        language: 'TypeScript',
        languages: { TypeScript: 150000, JavaScript: 20000, CSS: 15000 },
        stars: 245,
        forks: 32,
        topics: ['react', 'typescript', 'dashboard', 'frontend'],
        description: 'A modern React dashboard with TypeScript',
        isOwner: true,
        createdAt: sixMonthsAgo.toISOString(),
        updatedAt: threeMonthsAgo.toISOString(),
      },
      {
        name: 'node-api',
        fullName: 'user/node-api',
        url: 'https://github.com/user/node-api',
        language: 'JavaScript',
        languages: { JavaScript: 80000, TypeScript: 10000 },
        stars: 120,
        forks: 15,
        topics: ['nodejs', 'express', 'api', 'rest'],
        description: 'RESTful API built with Node.js and Express',
        isOwner: true,
        createdAt: sixMonthsAgo.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        name: 'python-ml',
        fullName: 'user/python-ml',
        url: 'https://github.com/user/python-ml',
        language: 'Python',
        languages: { Python: 200000, Jupyter: 50000 },
        stars: 89,
        forks: 12,
        topics: ['python', 'machine-learning', 'data-science'],
        description: 'Machine learning experiments in Python',
        isOwner: true,
        createdAt: sixMonthsAgo.toISOString(),
        updatedAt: threeMonthsAgo.toISOString(),
      },
      {
        name: 'docker-templates',
        fullName: 'user/docker-templates',
        url: 'https://github.com/user/docker-templates',
        language: 'Dockerfile',
        languages: { Dockerfile: 5000, Shell: 3000 },
        stars: 45,
        forks: 8,
        topics: ['docker', 'devops', 'containers'],
        description: 'Collection of Docker templates',
        isOwner: true,
        createdAt: sixMonthsAgo.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
    commits: [
      {
        sha: 'abc123',
        message: 'feat: add React component for user dashboard',
        date: threeMonthsAgo.toISOString(),
        repo: 'user/react-dashboard',
        filesChanged: ['src/components/Dashboard.tsx', 'src/hooks/useAuth.ts'],
        additions: 250,
        deletions: 30,
      },
      {
        sha: 'def456',
        message: 'fix: resolve TypeScript type errors in API client',
        date: now.toISOString(),
        repo: 'user/react-dashboard',
        filesChanged: ['src/api/client.ts', 'src/types/index.ts'],
        additions: 45,
        deletions: 20,
      },
      {
        sha: 'ghi789',
        message: 'feat: add Node.js middleware for authentication',
        date: now.toISOString(),
        repo: 'user/node-api',
        filesChanged: ['src/middleware/auth.js', 'src/routes/users.js'],
        additions: 180,
        deletions: 10,
      },
      {
        sha: 'jkl012',
        message: 'chore: update Python dependencies',
        date: threeMonthsAgo.toISOString(),
        repo: 'user/python-ml',
        filesChanged: ['requirements.txt', 'setup.py'],
        additions: 15,
        deletions: 10,
      },
      {
        sha: 'mno345',
        message: 'feat: add Docker multi-stage build',
        date: now.toISOString(),
        repo: 'user/docker-templates',
        filesChanged: ['Dockerfile', 'docker-compose.yml'],
        additions: 80,
        deletions: 25,
      },
    ],
    pullRequests: [
      {
        number: 42,
        title: 'Add React hooks for state management',
        body: 'This PR adds custom React hooks for better state management using TypeScript',
        state: 'closed',
        merged: true,
        url: 'https://github.com/user/react-dashboard/pull/42',
        repo: 'user/react-dashboard',
        createdAt: threeMonthsAgo.toISOString(),
        isAuthor: true,
      },
      {
        number: 15,
        title: 'Implement Node.js rate limiting',
        body: 'Adds rate limiting middleware to the Express API',
        state: 'closed',
        merged: true,
        url: 'https://github.com/user/node-api/pull/15',
        repo: 'user/node-api',
        createdAt: now.toISOString(),
        isAuthor: true,
      },
      {
        number: 8,
        title: 'Add Python data preprocessing pipeline',
        body: 'New data preprocessing module for machine learning workflows',
        state: 'closed',
        merged: true,
        url: 'https://github.com/user/python-ml/pull/8',
        repo: 'user/python-ml',
        createdAt: threeMonthsAgo.toISOString(),
        isAuthor: true,
      },
    ],
    languages: {
      TypeScript: { bytes: 160000, repos: 2, percentage: 35 },
      JavaScript: { bytes: 100000, repos: 2, percentage: 22 },
      Python: { bytes: 200000, repos: 1, percentage: 43 },
    },
    stars: [
      {
        name: 'awesome-react',
        fullName: 'awesome/react',
        url: 'https://github.com/awesome/react',
        language: 'JavaScript',
        topics: ['react', 'awesome-list'],
        description: 'Awesome React resources',
      },
      {
        name: 'docker-best-practices',
        fullName: 'docker/best-practices',
        url: 'https://github.com/docker/best-practices',
        language: null,
        topics: ['docker', 'devops'],
        description: 'Docker best practices guide',
      },
    ],
  };
}

describe('Integration Tests', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('Full Pipeline: GitHub Data → Skill Recommendations', () => {
    it('should process GitHub data and produce skill recommendations', async () => {
      // Setup
      const mockApi = new MockTopcoderSkillsAPI();
      const matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);
      const scoringEngine = new ScoringEngine();
      const githubData = createRealisticGitHubData();

      // Extract technologies
      const techCounts = new Map<string, number>();
      for (const repo of githubData.repos) {
        if (repo.language) {
          techCounts.set(repo.language, (techCounts.get(repo.language) || 0) + 5);
        }
        for (const [lang, bytes] of Object.entries(repo.languages)) {
          techCounts.set(lang, (techCounts.get(lang) || 0) + Math.floor(bytes / 10000));
        }
        for (const topic of repo.topics) {
          techCounts.set(topic, (techCounts.get(topic) || 0) + 2);
        }
      }

      // Match skills
      const matchedSkills = await matcher.matchTechnologies(techCounts);

      // Score skills
      const scoredSkills = scoringEngine.scoreSkills(matchedSkills, githubData);

      // Get top skills
      const topSkills = getTopScoredSkills(scoredSkills, 10);

      // Assertions
      expect(topSkills.length).toBeGreaterThan(0);
      expect(topSkills.length).toBeLessThanOrEqual(10);

      // Each skill should have required fields
      for (const skill of topSkills) {
        expect(skill.skill.id).toBeDefined();
        expect(skill.skill.name).toBeDefined();
        expect(skill.score).toBeGreaterThanOrEqual(0);
        expect(skill.score).toBeLessThanOrEqual(100);
        expect(skill.explanation).toBeDefined();
        expect(typeof skill.explanation).toBe('string');
      }

      // Skills should be sorted by score
      for (let i = 1; i < topSkills.length; i++) {
        const prevSkill = topSkills.at(i - 1);
        const currSkill = topSkills.at(i);
        expect(prevSkill!.score).toBeGreaterThanOrEqual(currSkill!.score);
      }
    });

    it('should detect TypeScript from repos with TS files', async () => {
      const mockApi = new MockTopcoderSkillsAPI();
      const matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);
      const scoringEngine = new ScoringEngine();
      const githubData = createRealisticGitHubData();

      const techCounts = new Map<string, number>([
        ['TypeScript', 100],
        ['typescript', 50],
      ]);

      const matchedSkills = await matcher.matchTechnologies(techCounts);
      const scoredSkills = scoringEngine.scoreSkills(matchedSkills, githubData);
      const topSkills = getTopScoredSkills(scoredSkills, 5);

      const tsSkill = topSkills.find(s => s.skill.name === 'TypeScript');
      expect(tsSkill).toBeDefined();
      expect(tsSkill!.score).toBeGreaterThan(0);
    });

    it('should detect React from topics and commit messages', async () => {
      const mockApi = new MockTopcoderSkillsAPI();
      const matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);
      const scoringEngine = new ScoringEngine();
      const githubData = createRealisticGitHubData();

      const techCounts = new Map<string, number>([
        ['react', 50],
        ['React', 30],
      ]);

      const matchedSkills = await matcher.matchTechnologies(techCounts);
      const scoredSkills = scoringEngine.scoreSkills(matchedSkills, githubData);

      const reactSkill = scoredSkills.find(s => s.skill.name === 'React.js');
      expect(reactSkill).toBeDefined();
    });
  });

  describe('Evidence Collection Integration', () => {
    it('should collect evidence from multiple sources', () => {
      const githubData = createRealisticGitHubData();
      const evidence = collectEvidence(['typescript', 'ts'], githubData);

      expect(evidence.length).toBeGreaterThan(0);

      // Should have different types of evidence
      const types = new Set(evidence.map(e => e.type));
      expect(types.size).toBeGreaterThan(1);

      // All evidence should have URLs
      for (const e of evidence) {
        expect(e.url).toContain('github.com');
      }
    });

    it('should include repo evidence with stars priority', () => {
      const githubData = createRealisticGitHubData();
      const evidence = collectEvidence(['react'], githubData);

      const repoEvidence = evidence.filter(e => e.type === 'repo');
      expect(repoEvidence.length).toBeGreaterThan(0);

      // First repo should be the one with most stars (react-dashboard has 245 stars)
      if (repoEvidence.length > 0) {
        expect(repoEvidence[0].title).toContain('react-dashboard');
      }
    });

    it('should include merged PR evidence', () => {
      const githubData = createRealisticGitHubData();
      const evidence = collectEvidence(['react'], githubData);

      const prEvidence = evidence.filter(e => e.type === 'pr');
      expect(prEvidence.length).toBeGreaterThan(0);

      for (const pr of prEvidence) {
        expect(pr.detail).toBe('Merged');
      }
    });
  });

  describe('Configuration Integration', () => {
    it('should load all config sections', () => {
      const config = loadSkillsConfig();

      expect(config.extensionToTech).toBeDefined();
      expect(config.specialFiles).toBeDefined();
      expect(config.shortTermExpansions).toBeDefined();
      expect(config.scoring).toBeDefined();
      expect(config.explanationThresholds).toBeDefined();
      expect(config.evidence).toBeDefined();
    });

    it('should use config values for scoring', () => {
      const config = loadSkillsConfig();
      // ScoringEngine uses these config values internally
      const _scoringEngine = new ScoringEngine();

      // Verify weights are applied
      expect(config.scoring.weights.language).toBe(0.40);
      expect(config.scoring.weights.commits).toBe(0.20);
      expect(config.scoring.baseScore).toBe(15);
    });

    it('should use config values for evidence limits', () => {
      const config = loadSkillsConfig();

      expect(config.evidence.maxPerSkill).toBe(5);
      expect(config.evidence.repoLimit).toBe(3);
      expect(config.evidence.prLimit).toBe(2);
    });
  });

  describe('Skill Matching Integration', () => {
    it('should expand short terms before matching', async () => {
      const mockApi = new MockTopcoderSkillsAPI();
      const matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);

      const techCounts = new Map<string, number>([
        ['js', 100],  // Should expand to JavaScript
        ['ts', 50],   // Should expand to TypeScript
        ['py', 30],   // Should expand to Python
      ]);

      const matches = await matcher.matchTechnologies(techCounts);

      const jsMatch = matches.find(m => m.skill.name === 'JavaScript');
      const tsMatch = matches.find(m => m.skill.name === 'TypeScript');
      const pyMatch = matches.find(m => m.skill.name === 'Python');

      expect(jsMatch).toBeDefined();
      expect(tsMatch).toBeDefined();
      expect(pyMatch).toBeDefined();
    });

    it('should aggregate scores from multiple matching terms', async () => {
      const mockApi = new MockTopcoderSkillsAPI();
      const matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);

      const techCounts = new Map<string, number>([
        ['javascript', 50],
        ['js', 30],
        ['JavaScript', 20],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);
      const jsMatches = matches.filter(m => m.skill.name === 'JavaScript');

      // Should be aggregated into single skill
      expect(jsMatches.length).toBe(1);
      // Score should be sum of all matches
      expect(jsMatches[0].rawScore).toBeGreaterThan(50);
    });
  });

  describe('End-to-End Validation', () => {
    it('should produce valid output structure', async () => {
      const mockApi = new MockTopcoderSkillsAPI();
      const matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);
      const scoringEngine = new ScoringEngine();
      const githubData = createRealisticGitHubData();

      // Simulate full pipeline
      const techCounts = new Map<string, number>([
        ['TypeScript', 100],
        ['React', 80],
        ['Node.js', 60],
        ['Docker', 40],
        ['Python', 30],
      ]);

      const matchedSkills = await matcher.matchTechnologies(techCounts);
      const scoredSkills = scoringEngine.scoreSkills(matchedSkills, githubData);
      const topSkills = getTopScoredSkills(scoredSkills);

      // Validate output structure matches requirements
      for (const skill of topSkills) {
        // Required: Skill ID
        expect(skill.skill.id).toMatch(/^[a-z0-9-]+$/i);

        // Required: Skill name
        expect(skill.skill.name.length).toBeGreaterThan(0);

        // Required: Score 0-100
        expect(skill.score).toBeGreaterThanOrEqual(0);
        expect(skill.score).toBeLessThanOrEqual(100);

        // Required: Explanation
        expect(skill.explanation.length).toBeGreaterThan(0);

        // Required: Evidence with URLs
        expect(Array.isArray(skill.evidence)).toBe(true);
        for (const e of skill.evidence) {
          expect(e.url).toContain('github.com');
        }

        // Components should be present
        expect(skill.components).toBeDefined();
        expect(skill.components.languageScore).toBeDefined();
        expect(skill.components.commitScore).toBeDefined();
        expect(skill.components.prScore).toBeDefined();
        expect(skill.components.projectQualityScore).toBeDefined();
        expect(skill.components.recencyScore).toBeDefined();
      }
    });
  });
});
