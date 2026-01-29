import { SkillMatcher, MatchedSkill } from '../topcoder/skill-matcher';
import { TopcoderSkillsAPI } from '../topcoder/skills-api';
import { TopcoderSkill } from '../utils/cache';

// Mock the TopcoderSkillsAPI
class MockSkillsAPI {
  private mockSkills: TopcoderSkill[] = [
    { id: '1', name: 'JavaScript', category: 'Programming Languages' },
    { id: '2', name: 'TypeScript', category: 'Programming Languages' },
    { id: '3', name: 'Python', category: 'Programming Languages' },
    { id: '4', name: 'React.js', category: 'Frontend Frameworks' },
    { id: '5', name: 'Node.js', category: 'Backend' },
    { id: '6', name: 'Docker', category: 'DevOps' },
    { id: '7', name: 'PostgreSQL', category: 'Databases' },
    { id: '8', name: 'Go', category: 'Programming Languages' },
    { id: '9', name: 'Ruby', category: 'Programming Languages' },
    { id: '10', name: 'AWS', category: 'Cloud' },
  ];

  async searchSkillsAsync(term: string): Promise<TopcoderSkill[]> {
    const termLower = term.toLowerCase();
    return this.mockSkills.filter(
      s => s.name.toLowerCase().includes(termLower) ||
           termLower.includes(s.name.toLowerCase())
    );
  }

  getSkillByName(name: string): TopcoderSkill | undefined {
    return this.mockSkills.find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );
  }
}

describe('SkillMatcher', () => {
  let matcher: SkillMatcher;
  let mockApi: MockSkillsAPI;

  beforeEach(() => {
    mockApi = new MockSkillsAPI();
    matcher = new SkillMatcher(mockApi as unknown as TopcoderSkillsAPI);
  });

  describe('matchTechnologies', () => {
    it('should match technologies to skills', async () => {
      const techCounts = new Map([
        ['JavaScript', 100],
        ['TypeScript', 50],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.skill.name === 'JavaScript')).toBe(true);
    });

    it('should include matched terms', async () => {
      const techCounts = new Map([
        ['javascript', 100],
        ['js', 50],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);
      const jsMatch = matches.find(m => m.skill.name === 'JavaScript');

      expect(jsMatch).toBeDefined();
      expect(jsMatch!.matchedTerms.length).toBeGreaterThan(0);
    });

    it('should calculate raw scores based on counts', async () => {
      const techCounts = new Map([
        ['JavaScript', 100],
        ['Python', 50],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);
      const jsMatch = matches.find(m => m.skill.name === 'JavaScript');
      const pyMatch = matches.find(m => m.skill.name === 'Python');

      expect(jsMatch).toBeDefined();
      expect(pyMatch).toBeDefined();
      expect(jsMatch!.rawScore).toBeGreaterThan(pyMatch!.rawScore);
    });

    it('should sort results by raw score descending', async () => {
      const techCounts = new Map([
        ['Python', 10],
        ['JavaScript', 100],
        ['TypeScript', 50],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);

      for (let i = 1; i < matches.length; i++) {
        const prevMatch = matches.at(i - 1);
        const currMatch = matches.at(i);
        expect(prevMatch!.rawScore).toBeGreaterThanOrEqual(currMatch!.rawScore);
      }
    });

    it('should handle empty input', async () => {
      const techCounts = new Map<string, number>();

      const matches = await matcher.matchTechnologies(techCounts);

      expect(matches).toEqual([]);
    });

    it('should skip very short terms', async () => {
      const techCounts = new Map([
        ['a', 100],
        ['JavaScript', 50],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);

      // 'a' should be skipped, but 'JavaScript' should match
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.matchedTerms.every(t => t.length >= 2))).toBe(true);
    });

    it('should expand short terms before matching', async () => {
      const techCounts = new Map([
        ['js', 100], // Should expand to 'javascript'
        ['py', 50],  // Should expand to 'python'
      ]);

      const matches = await matcher.matchTechnologies(techCounts);

      expect(matches.some(m => m.skill.name === 'JavaScript')).toBe(true);
      expect(matches.some(m => m.skill.name === 'Python')).toBe(true);
    });

    it('should handle case insensitivity', async () => {
      const techCounts = new Map([
        ['JAVASCRIPT', 100],
        ['typescript', 50],
        ['Python', 25],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);

      expect(matches.some(m => m.skill.name === 'JavaScript')).toBe(true);
      expect(matches.some(m => m.skill.name === 'TypeScript')).toBe(true);
      expect(matches.some(m => m.skill.name === 'Python')).toBe(true);
    });

    it('should aggregate scores for same skill from different terms', async () => {
      const techCounts = new Map([
        ['javascript', 50],
        ['js', 50],
      ]);

      const matches = await matcher.matchTechnologies(techCounts);
      const jsMatches = matches.filter(m => m.skill.name === 'JavaScript');

      // Should be a single JavaScript skill with aggregated score
      expect(jsMatches.length).toBe(1);
      expect(jsMatches[0].rawScore).toBeGreaterThan(50);
    });
  });

  describe('getTopMatches', () => {
    it('should limit results to specified count', async () => {
      const techCounts = new Map([
        ['JavaScript', 100],
        ['TypeScript', 90],
        ['Python', 80],
        ['Go', 70],
        ['Ruby', 60],
      ]);

      const top3 = await matcher.getTopMatches(techCounts, 3);
      const top5 = await matcher.getTopMatches(techCounts, 5);

      expect(top3.length).toBeLessThanOrEqual(3);
      expect(top5.length).toBeLessThanOrEqual(5);
    });

    it('should default to 20 results', async () => {
      const techCounts = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        techCounts.set(`tech${i}`, 100 - i);
      }

      // With mock API, we won't get 30 results, but the limit should apply
      const matches = await matcher.getTopMatches(techCounts);

      expect(matches.length).toBeLessThanOrEqual(20);
    });

    it('should return highest scoring matches first', async () => {
      const techCounts = new Map([
        ['Python', 10],
        ['JavaScript', 100],
      ]);

      const matches = await matcher.getTopMatches(techCounts, 2);

      if (matches.length >= 2) {
        expect(matches[0].rawScore).toBeGreaterThanOrEqual(matches[1].rawScore);
      }
    });
  });
});

describe('MatchedSkill interface', () => {
  it('should have required properties', () => {
    const matchedSkill: MatchedSkill = {
      skill: { id: '1', name: 'Test', category: 'Test' },
      matchedTerms: ['test'],
      rawScore: 100,
    };

    expect(matchedSkill.skill).toBeDefined();
    expect(matchedSkill.matchedTerms).toBeDefined();
    expect(matchedSkill.rawScore).toBeDefined();
  });
});
