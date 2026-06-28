/**
 * Property-based tests for the externalized DJ Scorer behavior.
 *
 * Feature: track-categorizer-dj-scorer-externalization
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import fc from "fast-check";
import type { Section } from "../../src/core/section-scanner.js";

// ——— Mock Genre Registry ———————————————————————————————————————————————————
// Mock the genre registry to control which profiles are returned.
// The mock treats any genreId as a profile whose family equals the id itself.
// This allows Property 11 to test isNonDjFamily with arbitrary family strings
// while still supporting Property 10's use of "techno" (which is not a non-DJ family).
vi.mock("../../src/core/genre-registry.js", () => ({
  getProfile: (id: string) => {
    // Return a profile where family === id, enabling arbitrary family testing
    return { id, name: id, family: id };
  },
  getProfileBySubgenre: () => null,
}));

import { computeDjScore, type DjScoreInput } from "../../src/core/dj-scorer.js";
import { getSectionLengthScoring, getNonDjFamilies, getMixZoneThresholds, type MixZoneThreshold } from "../../src/core/dj-scorer-config-loader.js";

// ——— Constants ——————————————————————————————————————————————————————————————
const SECTION_SCORING = getSectionLengthScoring();

// ——— Helpers ————————————————————————————————————————————————————————————————

/**
 * Creates a minimal DjScoreInput where the intro section has a specific bar count.
 * The outro is given a fixed large bar count (>= maxBars) so its contribution is deterministic.
 * Energy curve values are set to 1 (minimal/safe) so energy-related components score 100.
 */
function makeInputWithIntroBars(bars: number): DjScoreInput {
  const introEnd = bars * 4; // 4 beats per bar
  // Make outro section >= maxBars so its score is maxScore (deterministic)
  const outroStart = introEnd;
  const outroEnd = outroStart + SECTION_SCORING.maxBars * 4;

  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: introEnd },
    { id: "section-1", name: "Outro", startTime: outroStart, endTime: outroEnd },
  ];

  return {
    sections,
    energyCurve: [1, 1], // Low energy → max energy positioning score
    tempo: 128,
    genreId: "techno",
  };
}

/**
 * Computes the expected section length score based on the interpolation formula.
 */
function expectedSectionLengthScore(bars: number): number {
  const { minBars, maxBars, minScore, maxScore } = SECTION_SCORING;
  if (bars < minBars) return 0;
  if (bars >= maxBars) return maxScore;
  // Linear interpolation between minBars and maxBars (minScore to maxScore)
  const range = maxBars - minBars;
  return ((bars - minBars) / range) * (maxScore - minScore) + minScore;
}

// ——— Property 10: Section length scoring follows interpolation formula ———————

// Feature: track-categorizer-dj-scorer-externalization, Property 10: Section length scoring follows interpolation formula
describe("Property 10: Section length scoring follows interpolation formula", () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any bar count and any valid section length scoring configuration
   * (minBars < maxBars, minScore < maxScore), scoreSectionLength SHALL return:
   * - 0 when bars < minBars
   * - maxScore when bars >= maxBars
   * - A value between minScore and maxScore (linear interpolation) when minBars <= bars < maxBars
   */

  test.prop(
    [fc.integer({ min: 0, max: SECTION_SCORING.minBars - 1 })],
    { numRuns: 100 },
  )(
    "bars < minBars → intro score is 0",
    (bars) => {
      const input = makeInputWithIntroBars(bars);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);
      const introComponent = result.components.find((c) => c.name === "Intro Length");
      expect(introComponent).toBeDefined();
      expect(introComponent!.score).toBe(0);
    },
  );

  test.prop(
    [fc.integer({ min: SECTION_SCORING.maxBars, max: 200 })],
    { numRuns: 100 },
  )(
    "bars >= maxBars → intro score is maxScore",
    (bars) => {
      const input = makeInputWithIntroBars(bars);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);
      const introComponent = result.components.find((c) => c.name === "Intro Length");
      expect(introComponent).toBeDefined();
      expect(introComponent!.score).toBe(SECTION_SCORING.maxScore);
    },
  );

  test.prop(
    [fc.integer({ min: SECTION_SCORING.minBars, max: SECTION_SCORING.maxBars - 1 })],
    { numRuns: 100 },
  )(
    "minBars <= bars < maxBars → intro score is linearly interpolated between minScore and maxScore",
    (bars) => {
      const input = makeInputWithIntroBars(bars);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);
      const introComponent = result.components.find((c) => c.name === "Intro Length");
      expect(introComponent).toBeDefined();

      const score = introComponent!.score;
      const expected = expectedSectionLengthScore(bars);

      // Score should be within the interpolation range
      expect(score).toBeGreaterThanOrEqual(SECTION_SCORING.minScore);
      expect(score).toBeLessThanOrEqual(SECTION_SCORING.maxScore);

      // Score should match the linear interpolation formula (within floating point tolerance)
      expect(score).toBeCloseTo(expected, 10);
    },
  );

  test.prop(
    [fc.integer({ min: 0, max: 200 })],
    { numRuns: 100 },
  )(
    "score is monotonically non-decreasing: more bars never decreases the score (within valid range)",
    (bars) => {
      // Compare score at `bars` vs `bars + 1`
      const score1 = getIntroScore(bars);
      const score2 = getIntroScore(bars + 1);

      expect(score2).toBeGreaterThanOrEqual(score1);
    },
  );
});

// ——— Helper for monotonicity test ———————————————————————————————————————————

function getIntroScore(bars: number): number {
  const input = makeInputWithIntroBars(bars);
  const result = computeDjScore(input);
  const introComponent = result.components.find((c) => c.name === "Intro Length");
  return introComponent?.score ?? 0;
}


// ——— Property 9: Mix zone threshold lookup returns correct score ——————————

// Feature: track-categorizer-dj-scorer-externalization, Property 9: Mix zone threshold lookup returns correct score
describe("Property 9: Mix zone threshold lookup returns correct score", () => {
  /**
   * **Validates: Requirements 8.4, 11.8**
   *
   * For any energy value (0 to 1000) and the loaded mix zone thresholds array
   * (ascending maxEnergy), the scoreMixZoneCleanliness function SHALL return
   * the score of the first threshold entry whose maxEnergy is >= the energy value.
   *
   * Since scoreMixZoneCleanliness is not exported, we test via computeDjScore
   * by controlling the energyCurve input and checking the Mix Zone Cleanliness
   * component output.
   */

  const thresholds = getMixZoneThresholds();

  /**
   * Reference implementation of the zoneScore lookup algorithm.
   * Returns the score of the first threshold whose maxEnergy >= energy.
   */
  function expectedZoneScore(energy: number): number {
    for (const threshold of thresholds) {
      if (energy <= threshold.maxEnergy) return threshold.score;
    }
    return 0;
  }

  /**
   * Creates a minimal valid arrangement for testing mix zone scoring.
   * Two sections with enough bars to avoid zero-score on section length.
   */
  function makeInputForMixZone(introEnergy: number, outroEnergy: number): DjScoreInput {
    const maxBars = SECTION_SCORING.maxBars;
    const sections: Section[] = [
      { id: "section-0", name: "Intro", startTime: 0, endTime: maxBars * 4 },
      { id: "section-1", name: "Outro", startTime: maxBars * 4, endTime: maxBars * 8 },
    ];
    return {
      sections,
      energyCurve: [introEnergy, outroEnergy],
      tempo: 128,
      genreId: "techno",
    };
  }

  test.prop(
    [
      fc.integer({ min: 0, max: 1000 }), // introEnergy
      fc.integer({ min: 0, max: 1000 }), // outroEnergy
    ],
    { numRuns: 100 },
  )(
    "mix zone score matches threshold lookup for any energy values",
    (introEnergy, outroEnergy) => {
      const input = makeInputForMixZone(introEnergy, outroEnergy);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);

      // Find the Mix Zone Cleanliness component
      const mixZoneComponent = result.components.find(
        (c) => c.name === "Mix Zone Cleanliness",
      );
      expect(mixZoneComponent).toBeDefined();

      // Expected score: average of the two zone lookups, rounded
      const expectedIntroScore = expectedZoneScore(introEnergy);
      const expectedOutroScore = expectedZoneScore(outroEnergy);
      const expectedScore = Math.round(
        (expectedIntroScore + expectedOutroScore) / 2,
      );

      expect(mixZoneComponent!.score).toBe(expectedScore);
    },
  );

  test.prop(
    [fc.integer({ min: 0, max: 1000 })],
    { numRuns: 100 },
  )(
    "symmetric energy values produce a score equal to the single zone lookup",
    (energy) => {
      // When intro and outro have the same energy, the average equals the single lookup
      const input = makeInputForMixZone(energy, energy);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);

      const mixZoneComponent = result.components.find(
        (c) => c.name === "Mix Zone Cleanliness",
      );
      expect(mixZoneComponent).toBeDefined();

      const expectedScore = expectedZoneScore(energy);
      // When both zones have same energy, avg = score (no rounding effect)
      expect(mixZoneComponent!.score).toBe(expectedScore);
    },
  );
});

// ——— Property 11: Non-DJ family matching — equals or prefix-hyphen ———————————

// Feature: track-categorizer-dj-scorer-externalization, Property 11: Non-DJ family matching
describe("Property 11: Non-DJ family matching — equals or prefix-hyphen", () => {
  /**
   * **Validates: Requirements 8.7**
   *
   * For any genre family string and any non-DJ families list,
   * isNonDjFamily SHALL return true if and only if the family string
   * equals a list entry or starts with a list entry followed by "-".
   *
   * Since isNonDjFamily is not exported, we test via computeDjScore:
   * - When isNonDjFamily returns true → applicable: false
   * - When isNonDjFamily returns false → applicable: true (given valid sections)
   */

  const NON_DJ_FAMILIES = getNonDjFamilies();

  /**
   * Reference implementation of isNonDjFamily for comparison.
   * Returns true iff family equals a non-DJ entry or starts with entry + "-".
   */
  function expectedIsNonDjFamily(family: string): boolean {
    return NON_DJ_FAMILIES.some(
      (nonDj) => family === nonDj || family.startsWith(nonDj + "-"),
    );
  }

  /**
   * Creates a minimal DjScoreInput with valid sections and the given genreId.
   * The mock maps genreId directly to the family field, so genreId IS the family.
   */
  function makeInputWithFamily(family: string): DjScoreInput {
    const sections: Section[] = [
      { id: "section-0", name: "Intro", startTime: 0, endTime: 128 },
      { id: "section-1", name: "Outro", startTime: 128, endTime: 256 },
    ];
    return {
      sections,
      energyCurve: [1, 1],
      tempo: 128,
      genreId: family, // mock maps this directly to profile.family
    };
  }

  // ——— Generator: family strings that exactly match a non-DJ entry ———————————

  const exactMatchFamily = fc.constantFrom(...NON_DJ_FAMILIES);

  // ——— Generator: family strings that are prefix-hyphen matches ——————————————
  // e.g., "ambient-downtempo", "film-score-orchestral"

  const prefixHyphenFamily = fc
    .tuple(
      fc.constantFrom(...NON_DJ_FAMILIES),
      fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
        minLength: 1,
        maxLength: 20,
      }),
    )
    .map(([base, suffix]) => `${base}-${suffix}`);

  // ——— Generator: family strings that do NOT match any non-DJ entry ——————————
  // Strings that neither equal an entry nor start with entry + "-"

  const nonMatchingFamily = fc
    .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
      minLength: 1,
      maxLength: 30,
    })
    .filter((s) => !expectedIsNonDjFamily(s));

  // ——— Sub-property 11a: Exact match → applicable: false ——————————————————————

  test.prop(
    [exactMatchFamily],
    { numRuns: 100 },
  )(
    "exact non-DJ family match → applicable: false",
    (family) => {
      const input = makeInputWithFamily(family);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(false);
      expect(result.inapplicableReason).toBeDefined();
      expect(result.totalScore).toBe(0);
      expect(result.components).toHaveLength(0);
    },
  );

  // ——— Sub-property 11b: Prefix-hyphen match → applicable: false ——————————————

  test.prop(
    [prefixHyphenFamily],
    { numRuns: 100 },
  )(
    "prefix-hyphen non-DJ family match → applicable: false",
    (family) => {
      const input = makeInputWithFamily(family);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(false);
      expect(result.inapplicableReason).toBeDefined();
      expect(result.totalScore).toBe(0);
      expect(result.components).toHaveLength(0);
    },
  );

  // ——— Sub-property 11c: Non-matching family → applicable: true ———————————————

  test.prop(
    [nonMatchingFamily],
    { numRuns: 100 },
  )(
    "non-matching family → applicable: true",
    (family) => {
      const input = makeInputWithFamily(family);
      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);
      expect(result.components.length).toBeGreaterThan(0);
    },
  );

  // ——— Sub-property 11d: Random families match iff predicate agrees ———————————

  test.prop(
    [
      fc.stringOf(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-".split("")),
        { minLength: 1, maxLength: 30 },
      ),
    ],
    { numRuns: 100 },
  )(
    "random family string: applicable flag matches expected isNonDjFamily predicate",
    (family) => {
      const input = makeInputWithFamily(family);
      const result = computeDjScore(input);

      const shouldBeNonDj = expectedIsNonDjFamily(family);

      if (shouldBeNonDj) {
        expect(result.applicable).toBe(false);
        expect(result.inapplicableReason).toBeDefined();
        expect(result.totalScore).toBe(0);
      } else {
        expect(result.applicable).toBe(true);
      }
    },
  );
});
