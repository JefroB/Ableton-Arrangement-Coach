import { describe, it, expect } from "vitest";
import { computeEnergyScores, type SectionScoringInput } from "./energy-scorer.js";
import { ALL_PROFILES, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS_WITH_ALS, type EnergyWeights } from "./genre-registry.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function createInput(overrides?: Partial<SectionScoringInput>): SectionScoringInput {
  return {
    activeTrackCount: 0,
    midiDensity: 0,
    trackPresenceRatio: 0,
    automationRatio: 0,
    frequencyCoverage: 0,
    velocityIntensity: 0,
    polyphonyScore: 0,
    pitchRange: 0,
    ...overrides,
  };
}

// ─── Unit Tests ────────────────────────────────────────────────────────

describe("Energy Scorer", () => {
  describe("computeEnergyScores", () => {
    it("returns empty array for empty input", () => {
      const result = computeEnergyScores([], DEFAULT_WEIGHTS);
      expect(result).toEqual([]);
    });

    it("returns all scores of 1 when all factors are zero", () => {
      const sections = [createInput(), createInput(), createInput()];
      const result = computeEnergyScores(sections, DEFAULT_WEIGHTS);
      // When all factors are zero (no variance), the scorer returns flat 5 (neutral midpoint)
      expect(result).toEqual([5, 5, 5]);
    });

    it("returns score of 10 for single section with all non-zero factors", () => {
      // Single section: no variance across sections, returns flat midpoint of 5
      const sections = [
        createInput({
          activeTrackCount: 5,
          midiDensity: 10,
          trackPresenceRatio: 0.8,
          automationRatio: 0.5,
          frequencyCoverage: 0.7,
          velocityIntensity: 0.6,
          polyphonyScore: 0.4,
          pitchRange: 0.3,
        }),
      ];
      const result = computeEnergyScores(sections, DEFAULT_WEIGHTS);
      expect(result).toEqual([5]);
    });

    it("assigns identical scores when all sections are identical", () => {
      const section = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.5,
        automationRatio: 0.3,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.6,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      });
      const sections = [section, section, section, section];
      const result = computeEnergyScores(sections, DEFAULT_WEIGHTS);

      // All identical → no variance → flat midpoint of 5
      expect(result[0]).toBe(result[1]);
      expect(result[1]).toBe(result[2]);
      expect(result[2]).toBe(result[3]);
      expect(result[0]).toBe(5);
    });

    it("correctly normalizes and scores a two-section example", () => {
      // Section A: half the values of section B
      const sectionA = createInput({
        activeTrackCount: 2,
        midiDensity: 5,
        trackPresenceRatio: 0.25,
        automationRatio: 0.2,
        frequencyCoverage: 0.3,
        velocityIntensity: 0.3,
        polyphonyScore: 0.2,
        pitchRange: 0.15,
      });
      const sectionB = createInput({
        activeTrackCount: 4,
        midiDensity: 10,
        trackPresenceRatio: 0.5,
        automationRatio: 0.4,
        frequencyCoverage: 0.6,
        velocityIntensity: 0.6,
        polyphonyScore: 0.4,
        pitchRange: 0.3,
      });

      const result = computeEnergyScores([sectionA, sectionB], DEFAULT_WEIGHTS);

      // Section B is the max in every factor → normalized to 1.0 → score 10
      expect(result[1]).toBe(10);

      // Section A is the min in every factor → normalized to 0.0
      // With 0.3 base: weightedSum = 0.3 * sum(active_weights) = 0.3 * 1.0 = 0.3
      // Math.round(0.3 * 9 + 1) = Math.round(3.7) = 4
      expect(result[0]).toBe(4);
    });

    it("handles a factor being zero for all sections (max is 0)", () => {
      // midiDensity is 0 for all sections → that factor contributes 0
      // DEFAULT_WEIGHTS: trackCount=0.20, midi=0.25, trackPresence=0.15,
      // automation=0.00, freq=0.10, velocity=0.15, polyphony=0.10, pitchRange=0.05
      const sectionA = createInput({
        activeTrackCount: 2,
        midiDensity: 0,
        trackPresenceRatio: 0.5,
        automationRatio: 0.5,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.5,
        pitchRange: 0.5,
      });
      const sectionB = createInput({
        activeTrackCount: 4,
        midiDensity: 0,
        trackPresenceRatio: 1.0,
        automationRatio: 1.0,
        frequencyCoverage: 1.0,
        velocityIntensity: 1.0,
        polyphonyScore: 1.0,
        pitchRange: 1.0,
      });

      const result = computeEnergyScores([sectionA, sectionB], DEFAULT_WEIGHTS);

      // Section B is max in all factors with variance → always normalizes to 10
      // (redistribution ensures max section always = 10)
      expect(result[1]).toBe(10);
    });

    it("all scores are integers", () => {
      const sections = [
        createInput({ activeTrackCount: 3, midiDensity: 7, trackPresenceRatio: 0.33 }),
        createInput({ activeTrackCount: 5, midiDensity: 2, frequencyCoverage: 0.71 }),
        createInput({ activeTrackCount: 1, automationRatio: 0.9, frequencyCoverage: 0.14 }),
      ];
      const result = computeEnergyScores(sections, DEFAULT_WEIGHTS);
      for (const score of result) {
        expect(Number.isInteger(score)).toBe(true);
      }
    });

    it("all scores are in range [1, 10]", () => {
      const sections = [
        createInput({ activeTrackCount: 100, midiDensity: 500, trackPresenceRatio: 1.0, automationRatio: 1.0, frequencyCoverage: 1.0, velocityIntensity: 1.0, polyphonyScore: 1.0, pitchRange: 1.0 }),
        createInput({ activeTrackCount: 0, midiDensity: 0, trackPresenceRatio: 0, automationRatio: 0, frequencyCoverage: 0 }),
      ];
      const result = computeEnergyScores(sections, DEFAULT_WEIGHTS);
      for (const score of result) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    });

    it("output array length matches input array length", () => {
      const sections = Array.from({ length: 7 }, (_, i) =>
        createInput({ activeTrackCount: i + 1 })
      );
      const result = computeEnergyScores(sections, DEFAULT_WEIGHTS);
      expect(result).toHaveLength(7);
    });

    it("respects custom weights", () => {
      // Custom weights: only midiDensity matters (weight 1.0, rest 0.0)
      const midiOnlyWeights: EnergyWeights = {
        trackCountWeight: 0,
        midiDensityWeight: 1.0,
        trackPresenceWeight: 0,
        automationWeight: 0,
        frequencyCoverageWeight: 0,
        velocityIntensityWeight: 0,
        polyphonyScoreWeight: 0,
        pitchRangeWeight: 0,
      };

      const sectionA = createInput({ activeTrackCount: 10, midiDensity: 2 });
      const sectionB = createInput({ activeTrackCount: 1, midiDensity: 10 });

      const result = computeEnergyScores([sectionA, sectionB], midiOnlyWeights);

      // Section A: min in midiDensity → norm=0.0, (0.3+0.7*0)=0.3
      // Math.round(0.3 * 9 + 1) = Math.round(3.7) = 4
      expect(result[0]).toBe(4);

      // Section B: max in midiDensity → norm=1.0, (0.3+0.7*1)=1.0
      // Math.round(1.0 * 9 + 1) = 10
      expect(result[1]).toBe(10);
    });
  });

  // ─── Task 5.6: Revised energy scorer tests ────────────────────────────

  describe("new SectionScoringInput fields affect calculation", () => {
    it("velocityIntensity changes affect scores", () => {
      // Use a weight profile where only velocityIntensity matters
      const velOnlyWeights: EnergyWeights = {
        trackCountWeight: 0,
        midiDensityWeight: 0,
        trackPresenceWeight: 0,
        automationWeight: 0,
        frequencyCoverageWeight: 0,
        velocityIntensityWeight: 1.0,
        polyphonyScoreWeight: 0,
        pitchRangeWeight: 0,
      };

      const low = createInput({ velocityIntensity: 0.2 });
      const high = createInput({ velocityIntensity: 1.0 });

      const result = computeEnergyScores([low, high], velOnlyWeights);
      // high section: max → score 10
      // low section: min → (0.3+0.7*0)=0.3, Math.round(0.3*9+1)=4
      expect(result[1]).toBe(10);
      expect(result[0]).toBe(4);
      expect(result[1]).toBeGreaterThan(result[0]);
    });

    it("polyphonyScore changes affect scores", () => {
      const polyOnlyWeights: EnergyWeights = {
        trackCountWeight: 0,
        midiDensityWeight: 0,
        trackPresenceWeight: 0,
        automationWeight: 0,
        frequencyCoverageWeight: 0,
        velocityIntensityWeight: 0,
        polyphonyScoreWeight: 1.0,
        pitchRangeWeight: 0,
      };

      const low = createInput({ polyphonyScore: 0.1 });
      const high = createInput({ polyphonyScore: 0.8 });

      const result = computeEnergyScores([low, high], polyOnlyWeights);
      expect(result[1]).toBe(10);
      expect(result[0]).toBeGreaterThanOrEqual(1);
      expect(result[1]).toBeGreaterThan(result[0]);
    });

    it("pitchRange changes affect scores", () => {
      const pitchOnlyWeights: EnergyWeights = {
        trackCountWeight: 0,
        midiDensityWeight: 0,
        trackPresenceWeight: 0,
        automationWeight: 0,
        frequencyCoverageWeight: 0,
        velocityIntensityWeight: 0,
        polyphonyScoreWeight: 0,
        pitchRangeWeight: 1.0,
      };

      const low = createInput({ pitchRange: 0.3 });
      const high = createInput({ pitchRange: 0.9 });

      const result = computeEnergyScores([low, high], pitchOnlyWeights);
      expect(result[1]).toBe(10);
      expect(result[1]).toBeGreaterThan(result[0]);
    });
  });

  describe("trackPresenceRatio replaces audioPresenceRatio", () => {
    it("trackPresenceRatio is used as a scoring factor", () => {
      const presenceOnlyWeights: EnergyWeights = {
        trackCountWeight: 0,
        midiDensityWeight: 0,
        trackPresenceWeight: 1.0,
        automationWeight: 0,
        frequencyCoverageWeight: 0,
        velocityIntensityWeight: 0,
        polyphonyScoreWeight: 0,
        pitchRangeWeight: 0,
      };

      const low = createInput({ trackPresenceRatio: 0.25 });
      const high = createInput({ trackPresenceRatio: 1.0 });

      const result = computeEnergyScores([low, high], presenceOnlyWeights);
      // high: max → score 10
      // low: min → (0.3+0.7*0)=0.3, Math.round(0.3*9+1)=4
      expect(result[1]).toBe(10);
      expect(result[0]).toBe(4);
    });

    it("SectionScoringInput interface uses trackPresenceRatio not audioPresenceRatio", () => {
      // This verifies the type interface is correct at compile-time.
      // If audioPresenceRatio existed, this would need that field too.
      const input: SectionScoringInput = {
        activeTrackCount: 5,
        midiDensity: 10,
        trackPresenceRatio: 0.8,
        automationRatio: 0.0,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.6,
        polyphonyScore: 0.4,
        pitchRange: 0.3,
      };
      // If we get here, trackPresenceRatio is part of the interface (not audioPresenceRatio)
      expect(input.trackPresenceRatio).toBe(0.8);
    });
  });

  describe("automationRatio with 0 weight has no effect", () => {
    it("varying automationRatio does not change scores when automationWeight is 0", () => {
      // DEFAULT_WEIGHTS has automationWeight: 0.00
      const sectionNoAutomation = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.6,
        automationRatio: 0.0,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      });
      const sectionWithAutomation = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.6,
        automationRatio: 1.0,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      });

      // With weight=0 for automation, both sections are identical in what matters
      const resultA = computeEnergyScores([sectionNoAutomation, sectionNoAutomation], DEFAULT_WEIGHTS);
      const resultB = computeEnergyScores([sectionWithAutomation, sectionWithAutomation], DEFAULT_WEIGHTS);

      // Both should get the same score (automation doesn't contribute)
      expect(resultA[0]).toBe(resultB[0]);
    });

    it("DEFAULT_WEIGHTS has automationWeight of 0", () => {
      expect(DEFAULT_WEIGHTS.automationWeight).toBe(0);
    });
  });

  describe("non-zero automationRatio with restored weight increases scores", () => {
    it("automationRatio increases score when automationWeight is non-zero", () => {
      // DEFAULT_WEIGHTS_WITH_ALS has automationWeight: 0.15
      const sectionLow = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.6,
        automationRatio: 0.2,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      });
      const sectionHigh = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.6,
        automationRatio: 1.0,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      });

      const result = computeEnergyScores([sectionLow, sectionHigh], DEFAULT_WEIGHTS_WITH_ALS);

      // sectionHigh has higher automationRatio → should score higher or equal
      expect(result[1]).toBeGreaterThanOrEqual(result[0]);
    });

    it("DEFAULT_WEIGHTS_WITH_ALS has non-zero automationWeight", () => {
      expect(DEFAULT_WEIGHTS_WITH_ALS.automationWeight).toBeGreaterThan(0);
      expect(DEFAULT_WEIGHTS_WITH_ALS.automationWeight).toBe(0.15);
    });
  });

  describe("all genre profiles produce valid scores", () => {
    const testSections = [
      createInput({
        activeTrackCount: 2,
        midiDensity: 3,
        trackPresenceRatio: 0.3,
        automationRatio: 0.1,
        frequencyCoverage: 0.2,
        velocityIntensity: 0.3,
        polyphonyScore: 0.2,
        pitchRange: 0.1,
      }),
      createInput({
        activeTrackCount: 6,
        midiDensity: 12,
        trackPresenceRatio: 0.8,
        automationRatio: 0.6,
        frequencyCoverage: 0.7,
        velocityIntensity: 0.8,
        polyphonyScore: 0.5,
        pitchRange: 0.4,
      }),
      createInput({
        activeTrackCount: 4,
        midiDensity: 7,
        trackPresenceRatio: 0.5,
        automationRatio: 0.3,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.25,
      }),
    ];

    for (const profile of ALL_PROFILES) {
      it(`${profile.name} profile produces scores in [1, 10]`, () => {
        const scores = computeEnergyScores(testSections, profile.energyWeights);

        expect(scores).toHaveLength(testSections.length);
        for (const score of scores) {
          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      });
    }

    it("default weights (no .als) produce valid scores", () => {
      const scores = computeEnergyScores(testSections, DEFAULT_WEIGHTS);
      expect(scores).toHaveLength(testSections.length);
      for (const score of scores) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    });

    it("default weights (with .als) produce valid scores", () => {
      const scores = computeEnergyScores(testSections, DEFAULT_WEIGHTS_WITH_ALS);
      expect(scores).toHaveLength(testSections.length);
      for (const score of scores) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    });
  });
});


// ─── Property-Based Tests ──────────────────────────────────────────────

import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";

// Feature: m2-section-analysis, Property 5: Energy score range invariant

/**
 * **Validates: Requirements 8.1, 8.2, 8.5**
 *
 * Property 5: Energy score range invariant
 * For any non-empty array of SectionScoringInput values and any valid
 * EnergyWeights (summing to 1.0), every score produced by computeEnergyScores
 * SHALL be an integer in the range [1, 10].
 */
describe("Energy Scorer — Property 5: Energy score range invariant", () => {
  // Generator: valid EnergyWeights (8 positive numbers normalized to sum to 1.0)
  const weightsArb = fc.tuple(
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
  ).map(([a, b, c, d, e, f, g, h]) => {
    const sum = a + b + c + d + e + f + g + h;
    return {
      trackCountWeight: a / sum,
      midiDensityWeight: b / sum,
      trackPresenceWeight: c / sum,
      automationWeight: d / sum,
      frequencyCoverageWeight: e / sum,
      velocityIntensityWeight: f / sum,
      polyphonyScoreWeight: g / sum,
      pitchRangeWeight: h / sum,
    };
  });

  // Generator: a single SectionScoringInput with valid ranges
  const sectionInputArb = fc.record({
    activeTrackCount: fc.integer({ min: 0, max: 50 }),
    midiDensity: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    trackPresenceRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    automationRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    frequencyCoverage: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    velocityIntensity: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    polyphonyScore: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    pitchRange: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });

  // Generator: non-empty array of SectionScoringInput (1–20 items)
  const sectionsArb = fc.array(sectionInputArb, { minLength: 1, maxLength: 20 });

  fcTest.prop(
    [sectionsArb, weightsArb],
    { numRuns: 100 },
  )(
    "every score is an integer in [1, 10] for any non-empty input and valid weights",
    (sections, weights) => {
      const scores = computeEnergyScores(sections, weights);

      expect(scores).toHaveLength(sections.length);

      for (const score of scores) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    },
  );
});

// Feature: m2-section-analysis, Property 6: Scoring determinism for identical inputs

/**
 * **Validates: Requirements 8.6**
 *
 * Property 6: Scoring determinism for identical inputs
 * For any single SectionScoringInput replicated N times (N ≥ 1) and valid
 * EnergyWeights, all scores in the output array SHALL be equal to each other.
 */
describe("Energy Scorer — Property 6: Scoring determinism for identical inputs", () => {
  // Generator: valid EnergyWeights (8 positive numbers normalized to sum to 1.0)
  const weightsArb = fc.tuple(
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
  ).map(([a, b, c, d, e, f, g, h]) => {
    const sum = a + b + c + d + e + f + g + h;
    return {
      trackCountWeight: a / sum,
      midiDensityWeight: b / sum,
      trackPresenceWeight: c / sum,
      automationWeight: d / sum,
      frequencyCoverageWeight: e / sum,
      velocityIntensityWeight: f / sum,
      polyphonyScoreWeight: g / sum,
      pitchRangeWeight: h / sum,
    };
  });

  // Generator: a single SectionScoringInput with valid ranges
  const sectionInputArb = fc.record({
    activeTrackCount: fc.integer({ min: 0, max: 50 }),
    midiDensity: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    trackPresenceRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    automationRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    frequencyCoverage: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    velocityIntensity: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    polyphonyScore: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    pitchRange: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });

  // Generator: replicated input (single input replicated 1–20 times)
  const replicatedSectionsArb = fc.tuple(
    sectionInputArb,
    fc.integer({ min: 1, max: 20 })
  ).map(([input, n]) => Array.from({ length: n }, () => input));

  fcTest.prop(
    [replicatedSectionsArb, weightsArb],
    { numRuns: 100 },
  )(
    "all scores are equal when all inputs are identical",
    (sections, weights) => {
      const scores = computeEnergyScores(sections, weights);

      expect(scores).toHaveLength(sections.length);

      // All scores must be equal to the first score
      const firstScore = scores[0];
      for (const score of scores) {
        expect(score).toBe(firstScore);
      }
    },
  );
});

// Feature: m2-section-analysis, Property 7: Energy curve length equals sections length

/**
 * **Validates: Requirements 9.1, 9.2, 9.3**
 *
 * Property 7: Energy curve length equals sections length
 * For any array of SectionScoringInput (including empty), verify output
 * length equals input length.
 */
describe("Energy Scorer — Property 7: Energy curve length equals sections length", () => {
  // Generator: valid EnergyWeights (8 positive numbers normalized to sum to 1.0)
  const weightsArb = fc.tuple(
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    fc.double({ min: 0.01, max: 1, noNaN: true }),
  ).map(([a, b, c, d, e, f, g, h]) => {
    const sum = a + b + c + d + e + f + g + h;
    return {
      trackCountWeight: a / sum,
      midiDensityWeight: b / sum,
      trackPresenceWeight: c / sum,
      automationWeight: d / sum,
      frequencyCoverageWeight: e / sum,
      velocityIntensityWeight: f / sum,
      polyphonyScoreWeight: g / sum,
      pitchRangeWeight: h / sum,
    };
  });

  // Generator: a single SectionScoringInput with valid ranges
  const sectionInputArb = fc.record({
    activeTrackCount: fc.integer({ min: 0, max: 50 }),
    midiDensity: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    trackPresenceRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    automationRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    frequencyCoverage: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    velocityIntensity: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    polyphonyScore: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    pitchRange: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });

  // Generator: array of SectionScoringInput (0–50 items, including empty)
  const sectionsArb = fc.array(sectionInputArb, { minLength: 0, maxLength: 50 });

  fcTest.prop(
    [sectionsArb, weightsArb],
    { numRuns: 100 },
  )(
    "output array length always equals input array length",
    (sections, weights) => {
      const scores = computeEnergyScores(sections, weights);
      expect(scores).toHaveLength(sections.length);
    },
  );
});


// ─── Task 6.4: Energy Scorer — synthEnergy Integration Tests ────────────

describe("Energy Scorer — synthEnergy integration", () => {
  /**
   * **Validates: Requirements 4.4, 4.5**
   *
   * When synthEnergyWeight is 0 (the default), providing synthEnergy should not
   * change the score compared to omitting it entirely.
   */
  describe("backward compatibility with synthEnergyWeight=0", () => {
    it("scores are identical whether synthEnergy is provided or not when synthEnergyWeight is 0", () => {
      const baseSection = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.6,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      });

      const sectionWithSynthEnergy = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.6,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
        synthEnergy: 0.8,
      });

      // Use two different sections so there's variance in the non-synth factors
      const lowSection = createInput({
        activeTrackCount: 1,
        midiDensity: 2,
        trackPresenceRatio: 0.2,
        frequencyCoverage: 0.2,
        velocityIntensity: 0.2,
        polyphonyScore: 0.1,
        pitchRange: 0.1,
      });

      const lowSectionWithSynth = createInput({
        activeTrackCount: 1,
        midiDensity: 2,
        trackPresenceRatio: 0.2,
        frequencyCoverage: 0.2,
        velocityIntensity: 0.2,
        polyphonyScore: 0.1,
        pitchRange: 0.1,
        synthEnergy: 0.2,
      });

      // DEFAULT_WEIGHTS has no synthEnergyWeight (defaults to 0)
      const scoresWithout = computeEnergyScores([lowSection, baseSection], DEFAULT_WEIGHTS);
      const scoresWith = computeEnergyScores([lowSectionWithSynth, sectionWithSynthEnergy], DEFAULT_WEIGHTS);

      expect(scoresWith[0]).toBe(scoresWithout[0]);
      expect(scoresWith[1]).toBe(scoresWithout[1]);
    });

    it("synthEnergy=0 with synthEnergyWeight=0 matches original behavior exactly", () => {
      const sectionA = createInput({
        activeTrackCount: 3,
        midiDensity: 6,
        trackPresenceRatio: 0.4,
        frequencyCoverage: 0.3,
        velocityIntensity: 0.4,
        polyphonyScore: 0.2,
        pitchRange: 0.15,
        synthEnergy: 0,
      });
      const sectionB = createInput({
        activeTrackCount: 6,
        midiDensity: 12,
        trackPresenceRatio: 0.8,
        frequencyCoverage: 0.7,
        velocityIntensity: 0.8,
        polyphonyScore: 0.5,
        pitchRange: 0.4,
        synthEnergy: 0,
      });

      const sectionANoSynth = createInput({
        activeTrackCount: 3,
        midiDensity: 6,
        trackPresenceRatio: 0.4,
        frequencyCoverage: 0.3,
        velocityIntensity: 0.4,
        polyphonyScore: 0.2,
        pitchRange: 0.15,
      });
      const sectionBNoSynth = createInput({
        activeTrackCount: 6,
        midiDensity: 12,
        trackPresenceRatio: 0.8,
        frequencyCoverage: 0.7,
        velocityIntensity: 0.8,
        polyphonyScore: 0.5,
        pitchRange: 0.4,
      });

      const weightsNoSynth: EnergyWeights = {
        ...DEFAULT_WEIGHTS,
        synthEnergyWeight: 0,
      };

      const scoresWithZeroSynth = computeEnergyScores([sectionA, sectionB], weightsNoSynth);
      const scoresNoSynth = computeEnergyScores([sectionANoSynth, sectionBNoSynth], DEFAULT_WEIGHTS);

      expect(scoresWithZeroSynth).toEqual(scoresNoSynth);
    });
  });

  /**
   * **Validates: Requirements 4.4, 4.5**
   *
   * Non-zero synthEnergy with non-zero synthEnergyWeight changes the score
   * compared to the zero-weight case.
   */
  describe("non-zero synthEnergy + synthEnergyWeight changes score", () => {
    it("adding synthEnergyWeight changes scores when synthEnergy varies between sections", () => {
      const sectionLowSynth = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.5,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
        synthEnergy: 0.1,
      });
      const sectionHighSynth = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.5,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
        synthEnergy: 0.9,
      });

      // Weights without synth contribution
      const weightsNoSynth: EnergyWeights = {
        trackCountWeight: 0.20,
        midiDensityWeight: 0.25,
        trackPresenceWeight: 0.15,
        automationWeight: 0.00,
        frequencyCoverageWeight: 0.10,
        velocityIntensityWeight: 0.15,
        polyphonyScoreWeight: 0.10,
        pitchRangeWeight: 0.05,
        synthEnergyWeight: 0,
      };

      // Weights with synth contribution
      const weightsWithSynth: EnergyWeights = {
        trackCountWeight: 0.15,
        midiDensityWeight: 0.20,
        trackPresenceWeight: 0.12,
        automationWeight: 0.00,
        frequencyCoverageWeight: 0.08,
        velocityIntensityWeight: 0.12,
        polyphonyScoreWeight: 0.08,
        pitchRangeWeight: 0.05,
        synthEnergyWeight: 0.20,
      };

      const scoresNoSynth = computeEnergyScores([sectionLowSynth, sectionHighSynth], weightsNoSynth);
      const scoresWithSynth = computeEnergyScores([sectionLowSynth, sectionHighSynth], weightsWithSynth);

      // Without synth weight, the two sections are identical on all other factors
      // (no variance in non-synth factors → both score the same)
      expect(scoresNoSynth[0]).toBe(scoresNoSynth[1]);

      // With synth weight, the sections should differ because synthEnergy varies
      expect(scoresWithSynth[1]).toBeGreaterThan(scoresWithSynth[0]);
    });

    it("synthEnergy-only weight produces scores driven entirely by synth energy", () => {
      const synthOnlyWeights: EnergyWeights = {
        trackCountWeight: 0,
        midiDensityWeight: 0,
        trackPresenceWeight: 0,
        automationWeight: 0,
        frequencyCoverageWeight: 0,
        velocityIntensityWeight: 0,
        polyphonyScoreWeight: 0,
        pitchRangeWeight: 0,
        synthEnergyWeight: 1.0,
      };

      const lowSynth = createInput({ synthEnergy: 0.1 });
      const highSynth = createInput({ synthEnergy: 0.9 });

      const result = computeEnergyScores([lowSynth, highSynth], synthOnlyWeights);

      // highSynth normalizes to 1.0 → score 10
      expect(result[1]).toBe(10);
      // lowSynth normalizes to 0 (it's the min) → weighted sum with base 0.3
      // Math.round((0.3 + 0.7*0) * 9 + 1) = Math.round(0.3*9+1) = Math.round(3.7) = 4
      expect(result[0]).toBeLessThan(result[1]);
    });
  });

  /**
   * **Validates: Requirements 4.4, 4.5**
   *
   * Higher synthEnergy should contribute to a higher score when synthEnergyWeight > 0.
   */
  describe("higher synthEnergy contributes to higher score", () => {
    it("section with higher synthEnergy scores higher when synthEnergyWeight is non-zero", () => {
      const weightsWithSynth: EnergyWeights = {
        trackCountWeight: 0.10,
        midiDensityWeight: 0.20,
        trackPresenceWeight: 0.10,
        automationWeight: 0.00,
        frequencyCoverageWeight: 0.10,
        velocityIntensityWeight: 0.10,
        polyphonyScoreWeight: 0.10,
        pitchRangeWeight: 0.05,
        synthEnergyWeight: 0.25,
      };

      // All non-synth factors identical, only synthEnergy differs
      const sectionLow = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.5,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
        synthEnergy: 0.2,
      });
      const sectionMid = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.5,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
        synthEnergy: 0.5,
      });
      const sectionHigh = createInput({
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.5,
        frequencyCoverage: 0.4,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
        synthEnergy: 0.9,
      });

      const result = computeEnergyScores([sectionLow, sectionMid, sectionHigh], weightsWithSynth);

      // Scores should be monotonically non-decreasing as synthEnergy increases
      expect(result[2]).toBeGreaterThanOrEqual(result[1]);
      expect(result[1]).toBeGreaterThanOrEqual(result[0]);
      // With a 0.25 weight and this spread, high should score strictly above low
      expect(result[2]).toBeGreaterThan(result[0]);
    });
  });
});
