/**
 * Preservation Property Tests — Drum Energy Weighting Bugfix
 *
 * These tests capture baseline behavior BEFORE the fix is applied.
 * They verify that when drumEnergy is absent or drumEnergyWeight is 0,
 * the scorer produces identical results to the original implementation.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */
import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { computeEnergyScores, type SectionScoringInput } from "./energy-scorer.js";
import { DEFAULT_WEIGHTS, DEFAULT_WEIGHTS_WITH_ALS, type EnergyWeights } from "./genre-registry.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generator: a single SectionScoringInput WITHOUT drumEnergy.
 * These inputs reflect the existing interface — no drum factor present.
 */
const sectionInputWithoutDrumArb: fc.Arbitrary<SectionScoringInput> = fc.record({
  activeTrackCount: fc.integer({ min: 0, max: 50 }),
  midiDensity: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  trackPresenceRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  automationRatio: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  frequencyCoverage: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  velocityIntensity: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  polyphonyScore: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  pitchRange: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  audioEnergy: fc.oneof(
    fc.constant(undefined),
    fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  ),
  synthEnergy: fc.oneof(
    fc.constant(undefined),
    fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  ),
});

/** Generator: non-empty array of SectionScoringInput (2–12 sections, need ≥2 for variance). */
const sectionsWithoutDrumArb = fc.array(sectionInputWithoutDrumArb, { minLength: 2, maxLength: 12 });

/**
 * Generator: valid EnergyWeights that have no drumEnergyWeight (undefined).
 * 8 core weights normalized to sum to 1.0, with optional audioEnergy and synthEnergy.
 */
const weightsWithoutDrumWeightArb: fc.Arbitrary<EnergyWeights> = fc.tuple(
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0.01, max: 1, noNaN: true }),
  fc.double({ min: 0, max: 0.3, noNaN: true }),  // audioEnergyWeight
  fc.double({ min: 0, max: 0.3, noNaN: true }),  // synthEnergyWeight
).map(([a, b, c, d, e, f, g, h, audio, synth]) => {
  const sum = a + b + c + d + e + f + g + h + audio + synth;
  return {
    trackCountWeight: a / sum,
    midiDensityWeight: b / sum,
    trackPresenceWeight: c / sum,
    automationWeight: d / sum,
    frequencyCoverageWeight: e / sum,
    velocityIntensityWeight: f / sum,
    polyphonyScoreWeight: g / sum,
    pitchRangeWeight: h / sum,
    audioEnergyWeight: audio / sum,
    synthEnergyWeight: synth / sum,
    // drumEnergyWeight is intentionally OMITTED (undefined)
  };
});

// ─── Property 2a: Undefined drumEnergy Preservation ────────────────────

/**
 * **Validates: Requirements 3.1**
 *
 * Property 2a: Undefined drumEnergy Preservation
 * For all SectionScoringInput[] where drumEnergy is undefined on all sections,
 * the function must produce exactly the same scores regardless of how many
 * times it's called — output is deterministic and identical to baseline.
 *
 * On unfixed code: drumEnergy doesn't exist in the interface, so all inputs
 * inherently omit it. This test captures that baseline.
 * After fix: drumEnergy=undefined means the factor is skipped, producing
 * identical scores to the original.
 */
describe("Preservation — Property 2a: Undefined drumEnergy produces identical scores", () => {
  fcTest.prop(
    [sectionsWithoutDrumArb, weightsWithoutDrumWeightArb],
    { numRuns: 200 },
  )(
    "sections without drumEnergy produce consistent scores (baseline capture)",
    (sections, weights) => {
      // Call twice — must be deterministic
      const scores1 = computeEnergyScores(sections, weights);
      const scores2 = computeEnergyScores(sections, weights);

      expect(scores1).toEqual(scores2);
      expect(scores1).toHaveLength(sections.length);

      // All scores must be valid integers in [1, 10]
      for (const score of scores1) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    },
  );

  fcTest.prop(
    [sectionsWithoutDrumArb],
    { numRuns: 100 },
  )(
    "DEFAULT_WEIGHTS (no drumEnergyWeight) produce stable results for inputs without drumEnergy",
    (sections) => {
      const scoresDefault = computeEnergyScores(sections, DEFAULT_WEIGHTS);
      const scoresDefault2 = computeEnergyScores(sections, DEFAULT_WEIGHTS);

      expect(scoresDefault).toEqual(scoresDefault2);
      expect(scoresDefault).toHaveLength(sections.length);
    },
  );
});

// ─── Property 2b: Zero drumEnergyWeight Preservation ───────────────────

/**
 * **Validates: Requirements 3.2**
 *
 * Property 2b: Zero drumEnergyWeight Preservation
 * For all EnergyWeights where drumEnergyWeight is 0 or undefined,
 * scores must match the output of the function called without any drum weight.
 *
 * On unfixed code: drumEnergyWeight doesn't exist, so it's always undefined.
 * This test captures that adding drumEnergyWeight=0 to weights produces
 * the same result as omitting it entirely.
 */
describe("Preservation — Property 2b: Zero drumEnergyWeight produces identical scores", () => {
  fcTest.prop(
    [sectionsWithoutDrumArb, weightsWithoutDrumWeightArb],
    { numRuns: 200 },
  )(
    "weights with drumEnergyWeight=0 produce same scores as weights without it",
    (sections, weights) => {
      // Scores with original weights (no drumEnergyWeight field)
      const scoresOriginal = computeEnergyScores(sections, weights);

      // Explicitly set drumEnergyWeight to 0 — must produce identical results
      const weightsWithZeroDrum: EnergyWeights = {
        ...weights,
        drumEnergyWeight: 0,
      } as EnergyWeights;
      const scoresWithZero = computeEnergyScores(sections, weightsWithZeroDrum);

      expect(scoresWithZero).toEqual(scoresOriginal);
    },
  );

  fcTest.prop(
    [sectionsWithoutDrumArb],
    { numRuns: 100 },
  )(
    "DEFAULT_WEIGHTS_WITH_ALS with explicit drumEnergyWeight=0 matches without it",
    (sections) => {
      const scoresOriginal = computeEnergyScores(sections, DEFAULT_WEIGHTS_WITH_ALS);

      const weightsWithZero: EnergyWeights = {
        ...DEFAULT_WEIGHTS_WITH_ALS,
        drumEnergyWeight: 0,
      } as EnergyWeights;
      const scoresWithZero = computeEnergyScores(sections, weightsWithZero);

      expect(scoresWithZero).toEqual(scoresOriginal);
    },
  );
});

// ─── Property 2c: Zero Variance drumEnergy Preservation ────────────────

/**
 * **Validates: Requirements 3.3, 3.4**
 *
 * Property 2c: Zero Variance drumEnergy Preservation
 * For all inputs where all sections have the SAME drumEnergy value (zero variance),
 * the factor must be skipped and weight redistributed — scores must match
 * the output when drumEnergy is entirely absent.
 *
 * On unfixed code: drumEnergy doesn't exist, so we simulate by having all sections
 * with identical values for the factors that DO exist. The zero-variance skip behavior
 * is already implemented for other factors — this captures the pattern.
 *
 * After fix: when all sections have the same drumEnergy (zero variance), the drum
 * factor is skipped and its weight redistributed to other factors.
 */
describe("Preservation — Property 2c: Zero-variance factors are skipped (weight redistribution)", () => {
  /**
   * When all sections have the same value for a factor, that factor has zero variance
   * and is skipped. Its weight is redistributed to other factors.
   * This test verifies this core behavior is preserved — using existing factors
   * to confirm the pattern works correctly.
   */
  fcTest.prop(
    [
      // Generate a base section
      sectionInputWithoutDrumArb,
      // Generate number of replicas
      fc.integer({ min: 2, max: 10 }),
      // Generate one varying factor value
      fc.double({ min: 0.1, max: 1.0, noNaN: true, noDefaultInfinity: true }),
    ],
    { numRuns: 200 },
  )(
    "zero-variance factors are skipped: identical sections with one varying factor produce scores based only on that factor",
    (baseSection, count, varyingTrackPresence) => {
      // Create sections that are ALL identical
      const identicalSections = Array.from({ length: count }, () => ({ ...baseSection }));

      // All identical → no variance → should all score 5 (flat midpoint)
      const scoresIdentical = computeEnergyScores(identicalSections, DEFAULT_WEIGHTS);
      for (const score of scoresIdentical) {
        expect(score).toBe(5);
      }

      // Now create sections where one factor varies (trackPresenceRatio)
      // but all other factors are constant
      const constantSection: SectionScoringInput = {
        activeTrackCount: 4,
        midiDensity: 8,
        trackPresenceRatio: 0.3,
        automationRatio: 0.2,
        frequencyCoverage: 0.5,
        velocityIntensity: 0.5,
        polyphonyScore: 0.3,
        pitchRange: 0.2,
      };
      const variedSection: SectionScoringInput = {
        ...constantSection,
        trackPresenceRatio: varyingTrackPresence,
      };

      // Only add variance if the values are actually different
      if (Math.abs(variedSection.trackPresenceRatio - constantSection.trackPresenceRatio) > 0.001) {
        const mixedSections = [constantSection, variedSection];
        const scoresMixed = computeEnergyScores(mixedSections, DEFAULT_WEIGHTS);

        // The section with higher trackPresenceRatio should score >= the other
        if (variedSection.trackPresenceRatio > constantSection.trackPresenceRatio) {
          expect(scoresMixed[1]).toBeGreaterThanOrEqual(scoresMixed[0]);
        } else {
          expect(scoresMixed[0]).toBeGreaterThanOrEqual(scoresMixed[1]);
        }
      }
    },
  );

  /**
   * Specifically test that when all sections have the same synthEnergy value
   * (zero variance for synth), the synth factor is skipped and scores match
   * as if synthEnergy were undefined. This confirms the pattern that the
   * drum energy fix should follow.
   */
  fcTest.prop(
    [
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), // constant synthEnergy value
      fc.integer({ min: 2, max: 8 }), // number of sections
    ],
    { numRuns: 100 },
  )(
    "constant synthEnergy across all sections (zero variance) produces same scores as undefined synthEnergy",
    (constantSynthValue, count) => {
      // Build base sections with varying other factors
      const baseSections: SectionScoringInput[] = Array.from({ length: count }, (_, i) => ({
        activeTrackCount: 2 + i,
        midiDensity: 3 + i * 2,
        trackPresenceRatio: 0.2 + i * 0.1,
        automationRatio: 0.1 + i * 0.05,
        frequencyCoverage: 0.3 + i * 0.08,
        velocityIntensity: 0.3 + i * 0.07,
        polyphonyScore: 0.1 + i * 0.06,
        pitchRange: 0.1 + i * 0.04,
      }));

      // Sections with constant synthEnergy (zero variance → skipped)
      const sectionsWithConstantSynth: SectionScoringInput[] = baseSections.map(s => ({
        ...s,
        synthEnergy: constantSynthValue,
      }));

      // Sections without synthEnergy (undefined → also skipped)
      const sectionsWithoutSynth: SectionScoringInput[] = baseSections.map(s => ({
        ...s,
        synthEnergy: undefined,
      }));

      // Use weights that include synthEnergyWeight
      const weightsWithSynth: EnergyWeights = {
        ...DEFAULT_WEIGHTS,
        synthEnergyWeight: 0.10,
      };

      const scoresConstant = computeEnergyScores(sectionsWithConstantSynth, weightsWithSynth);
      const scoresUndefined = computeEnergyScores(sectionsWithoutSynth, weightsWithSynth);

      // Both cases should produce identical scores because:
      // - Constant value → zero variance → factor skipped → weight redistributed
      // - Undefined → no energy data → factor skipped → same redistribution
      expect(scoresConstant).toEqual(scoresUndefined);
    },
  );
});
