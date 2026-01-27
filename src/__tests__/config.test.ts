import {
  loadSkillsConfig,
  clearConfigCache,
  getFileExtensions,
  expandShortTerm,
  getScoringConfig,
  getExplanationThresholds,
} from '../utils/config';

describe('Config', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('loadSkillsConfig', () => {
    it('should load config from constants.json', () => {
      const config = loadSkillsConfig();

      expect(config).toBeDefined();
      expect(config.fileExtensions).toBeDefined();
      expect(config.shortTermExpansions).toBeDefined();
      expect(config.techAliases).toBeDefined();
      expect(config.scoring).toBeDefined();
      expect(config.explanationThresholds).toBeDefined();
    });

    it('should cache config on subsequent calls', () => {
      const config1 = loadSkillsConfig();
      const config2 = loadSkillsConfig();

      expect(config1).toBe(config2);
    });

    it('should return fresh config after clearing cache', () => {
      const config1 = loadSkillsConfig();
      clearConfigCache();
      const config2 = loadSkillsConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('getFileExtensions', () => {
    it('should return extensions for known languages', () => {
      const jsExtensions = getFileExtensions('javascript');
      expect(jsExtensions).toContain('.js');
      expect(jsExtensions).toContain('.jsx');

      const tsExtensions = getFileExtensions('typescript');
      expect(tsExtensions).toContain('.ts');
      expect(tsExtensions).toContain('.tsx');

      const pyExtensions = getFileExtensions('python');
      expect(pyExtensions).toContain('.py');
    });

    it('should be case-insensitive', () => {
      const lower = getFileExtensions('javascript');
      const upper = getFileExtensions('JAVASCRIPT');
      const mixed = getFileExtensions('JavaScript');

      expect(lower).toEqual(upper);
      expect(lower).toEqual(mixed);
    });

    it('should return empty array for unknown terms', () => {
      const extensions = getFileExtensions('unknownlanguage123');
      expect(extensions).toEqual([]);
    });
  });

  describe('expandShortTerm', () => {
    it('should expand known short terms', () => {
      expect(expandShortTerm('js')).toBe('javascript');
      expect(expandShortTerm('ts')).toBe('typescript');
      expect(expandShortTerm('py')).toBe('python');
      expect(expandShortTerm('rb')).toBe('ruby');
    });

    it('should be case-insensitive', () => {
      expect(expandShortTerm('JS')).toBe('javascript');
      expect(expandShortTerm('Ts')).toBe('typescript');
    });

    it('should return original term if no expansion exists', () => {
      expect(expandShortTerm('react')).toBe('react');
      expect(expandShortTerm('docker')).toBe('docker');
    });
  });

  describe('getScoringConfig', () => {
    it('should return scoring configuration', () => {
      const scoring = getScoringConfig();

      expect(scoring.weights).toBeDefined();
      expect(scoring.weights.language).toBeGreaterThan(0);
      expect(scoring.weights.commits).toBeGreaterThan(0);
      expect(scoring.weights.prs).toBeGreaterThan(0);
      expect(scoring.weights.projectQuality).toBeGreaterThan(0);
      expect(scoring.weights.recency).toBeGreaterThan(0);

      expect(scoring.baseScore).toBeGreaterThanOrEqual(0);
      expect(scoring.maxScore).toBe(100);
      expect(scoring.minScoreThreshold).toBeGreaterThan(0);
    });

    it('should have weights that sum to 1', () => {
      const scoring = getScoringConfig();
      const totalWeight =
        scoring.weights.language +
        scoring.weights.commits +
        scoring.weights.prs +
        scoring.weights.projectQuality +
        scoring.weights.recency;

      expect(totalWeight).toBeCloseTo(1, 2);
    });
  });

  describe('getExplanationThresholds', () => {
    it('should return explanation thresholds', () => {
      const thresholds = getExplanationThresholds();

      expect(thresholds.languageStrong).toBeGreaterThan(0);
      expect(thresholds.languageModerate).toBeGreaterThan(0);
      expect(thresholds.commitActive).toBeGreaterThan(0);
      expect(thresholds.prSignificant).toBeGreaterThan(0);
      expect(thresholds.projectQuality).toBeGreaterThan(0);
      expect(thresholds.recencyRecent).toBeGreaterThan(0);
      expect(thresholds.recencyOngoing).toBeGreaterThan(0);
      expect(thresholds.scoreSolid).toBeGreaterThan(0);
      expect(thresholds.scoreWorking).toBeGreaterThan(0);
    });

    it('should have languageStrong > languageModerate', () => {
      const thresholds = getExplanationThresholds();
      expect(thresholds.languageStrong).toBeGreaterThan(thresholds.languageModerate);
    });

    it('should have recencyRecent > recencyOngoing', () => {
      const thresholds = getExplanationThresholds();
      expect(thresholds.recencyRecent).toBeGreaterThan(thresholds.recencyOngoing);
    });

    it('should have scoreSolid > scoreWorking', () => {
      const thresholds = getExplanationThresholds();
      expect(thresholds.scoreSolid).toBeGreaterThan(thresholds.scoreWorking);
    });
  });
});
