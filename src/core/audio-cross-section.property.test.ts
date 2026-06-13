import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { computeCosineSimilarity, compareAudioSections } from "./audio-cross-section.js";
import type { SpectralProfile, FrequencyBandName, AudioSimilarityFlag } from "./audio-content-types.js";

// Feature: audio-content-analysis, Property 11: Audio similarity flag threshold consistency

// ─── Constants (mirroring implementation thresholds) ───────────────────

const SAME_THRESHOLD = 0.95;
const SIMILAR_THRESHOLD = 0.7;

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Determine the expected flag for a given cosine similarity value.
 */
function expectedFlag(similarity: number): AudioSimilarityFlag {
  if (similarity > SAME_THRESHOLD) {
    return "same audio content";
  }
  if (similarity >= SIMILAR_THRESHOLD) {
    return "similar audio content";
  }
  return "different audio content";
}

/**
 * Create a SpectralProfile from 6 band energy values in dBFS.
 * All bands should be above -60 dBFS to avoid being filtered out as silent.
 */
function makeProfile(bandValues: Record<FrequencyBandName, number>): SpectralProfile {
  return {
    bands: bandValues,
    meanCentroid: 1000,
    centroidPerWindow: [1000],
    meanSpectralFlux: 0.3,
  };
}

/**
 * Arbitrary for a single frequency band energy value in dBFS,
 * constrained above -60 so the profile is not considered silent.
 */
const nonSilentBandEnergy = fc.double({ min: -59, max: 0, noNaN: true, noDefaultInfinity: true });

/**
 * Arbitrary for a non-silent SpectralProfile (all bands above -60 dBFS).
 */
const nonSilentProfile: fc.Arbitrary<SpectralProfile> = fc
  .tuple(
    nonSilentBandEnergy,
    nonSilentBandEnergy,
    nonSilentBandEnergy,
    nonSilentBandEnergy,
    nonSilentBandEnergy,
    nonSilentBandEnergy,
  )
  .map(([subBass, bass, lowMid, mid, highMid, high]) =>
    makeProfile({ subBass, bass, lowMid, mid, highMid, high }),
  );

// ─── Property 11: Audio similarity flag threshold consistency ──────────

/**
 * **Validates: Requirements 7.2, 7.3, 7.4**
 *
 * Property 11: Audio similarity flag threshold consistency
 * For any cosine similarity value in [0, 1], the assigned flag SHALL be:
 * "different audio content" when similarity < 0.7,
 * "similar audio content" when similarity is in [0.7, 0.95],
 * and "same audio content" when similarity > 0.95.
 * These ranges are exhaustive and mutually exclusive.
 */
describe("Audio Cross-Section — Property 11: Audio similarity flag threshold consistency", () => {
  fcTest.prop(
    [nonSilentProfile, nonSilentProfile],
    { numRuns: 100 },
  )(
    "compareAudioSections assigns the correct flag based on cosine similarity thresholds",
    (profileA, profileB) => {
      // Call compareAudioSections with exactly 2 profiles (one consecutive pair)
      const comparisons = compareAudioSections([profileA, profileB]);

      // Should produce exactly 1 comparison (since both are non-silent)
      expect(comparisons.length).toBe(1);

      const comparison = comparisons[0]!;
      const similarity = comparison.similarity;

      // Verify similarity is in [0, 1]
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);

      // Verify the flag matches the threshold rules
      const expected = expectedFlag(similarity);
      expect(comparison.flag).toBe(expected);
    },
  );

  fcTest.prop(
    [fc.double({ min: 0, max: 0.7, noNaN: true, noDefaultInfinity: true }).filter(v => v < 0.7)],
    { numRuns: 100 },
  )(
    "similarity < 0.7 always maps to 'different audio content'",
    (similarity) => {
      const flag = expectedFlag(similarity);
      expect(flag).toBe("different audio content");
    },
  );

  fcTest.prop(
    [fc.double({ min: 0.7, max: 0.95, noNaN: true, noDefaultInfinity: true })],
    { numRuns: 100 },
  )(
    "similarity in [0.7, 0.95] always maps to 'similar audio content'",
    (similarity) => {
      const flag = expectedFlag(similarity);
      expect(flag).toBe("similar audio content");
    },
  );

  fcTest.prop(
    [fc.double({ min: 0.95, max: 1.0, noNaN: true, noDefaultInfinity: true }).filter(v => v > 0.95)],
    { numRuns: 100 },
  )(
    "similarity > 0.95 always maps to 'same audio content'",
    (similarity) => {
      const flag = expectedFlag(similarity);
      expect(flag).toBe("same audio content");
    },
  );

  fcTest.prop(
    [nonSilentProfile],
    { numRuns: 100 },
  )(
    "identical profiles produce 'same audio content' flag (similarity ≈ 1.0)",
    (profile) => {
      const comparisons = compareAudioSections([profile, profile]);

      expect(comparisons.length).toBe(1);
      const comparison = comparisons[0]!;
      expect(comparison.similarity).toBeCloseTo(1.0, 5);
      expect(comparison.flag).toBe("same audio content");
    },
  );

  fcTest.prop(
    [nonSilentProfile, nonSilentProfile],
    { numRuns: 100 },
  )(
    "flag assignment is exhaustive — every comparison gets one of the three defined flags",
    (profileA, profileB) => {
      const comparisons = compareAudioSections([profileA, profileB]);

      expect(comparisons.length).toBe(1);
      const validFlags: AudioSimilarityFlag[] = [
        "same audio content",
        "similar audio content",
        "different audio content",
      ];
      expect(validFlags).toContain(comparisons[0]!.flag);
    },
  );

  fcTest.prop(
    [nonSilentProfile, nonSilentProfile],
    { numRuns: 100 },
  )(
    "flag assignment is mutually exclusive — similarity cannot satisfy two thresholds",
    (profileA, profileB) => {
      const comparisons = compareAudioSections([profileA, profileB]);

      expect(comparisons.length).toBe(1);
      const { similarity, flag } = comparisons[0]!;

      // Verify mutual exclusivity: only one condition is true
      const isSame = similarity > SAME_THRESHOLD;
      const isSimilar = similarity >= SIMILAR_THRESHOLD && similarity <= SAME_THRESHOLD;
      const isDifferent = similarity < SIMILAR_THRESHOLD;

      // Exactly one must be true
      const conditions = [isSame, isSimilar, isDifferent].filter(Boolean);
      expect(conditions.length).toBe(1);

      // And the flag matches the true condition
      if (isSame) expect(flag).toBe("same audio content");
      if (isSimilar) expect(flag).toBe("similar audio content");
      if (isDifferent) expect(flag).toBe("different audio content");
    },
  );
});
