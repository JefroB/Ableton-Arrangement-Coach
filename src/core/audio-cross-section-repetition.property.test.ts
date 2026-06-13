/**
 * Property-based tests for Cross-Section Comparator — extended repetition detection.
 *
 * Feature: audio-content-analysis, Property 12: Extended repetition detection correctness
 *
 * Validates: Requirements 7.5
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { detectExtendedRepetition } from "./audio-cross-section.js";
import type { AudioCrossSectionComparison, AudioSimilarityFlag } from "./audio-content-types.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate a valid AudioSimilarityFlag.
 */
const arbSimilarityFlag: fc.Arbitrary<AudioSimilarityFlag> = fc.constantFrom(
  "same audio content",
  "similar audio content",
  "different audio content",
);

/**
 * Generate a sequence of AudioCrossSectionComparison objects representing
 * consecutive section comparisons (0→1, 1→2, 2→3, ...) with arbitrary flags.
 */
function arbComparisonSequence(
  minLength: number,
  maxLength: number,
): fc.Arbitrary<AudioCrossSectionComparison[]> {
  return fc
    .array(arbSimilarityFlag, { minLength, maxLength })
    .map((flags) =>
      flags.map((flag, i) => ({
        sectionIndexA: i,
        sectionIndexB: i + 1,
        similarity: flag === "same audio content" ? 0.98 : flag === "similar audio content" ? 0.85 : 0.5,
        flag,
      })),
    );
}

/**
 * Generate a comparison sequence that is guaranteed to contain at least one
 * run of exactly `runLength` consecutive "same audio content" flags.
 */
function arbSequenceWithSameRun(runLength: number): fc.Arbitrary<AudioCrossSectionComparison[]> {
  return fc
    .record({
      prefixFlags: fc.array(
        fc.constantFrom("similar audio content" as AudioSimilarityFlag, "different audio content" as AudioSimilarityFlag),
        { minLength: 0, maxLength: 5 },
      ),
      suffixFlags: fc.array(
        fc.constantFrom("similar audio content" as AudioSimilarityFlag, "different audio content" as AudioSimilarityFlag),
        { minLength: 0, maxLength: 5 },
      ),
    })
    .map(({ prefixFlags, suffixFlags }) => {
      const allFlags: AudioSimilarityFlag[] = [
        ...prefixFlags,
        ...Array(runLength).fill("same audio content" as AudioSimilarityFlag),
        ...suffixFlags,
      ];
      return allFlags.map((flag, i) => ({
        sectionIndexA: i,
        sectionIndexB: i + 1,
        similarity: flag === "same audio content" ? 0.98 : flag === "similar audio content" ? 0.85 : 0.5,
        flag,
      }));
    });
}

/**
 * Generate a comparison sequence guaranteed to have NO run of 3+ consecutive
 * "same audio content" flags.
 *
 * Strategy: generate arbitrary flags, then break any "same" run longer than 2
 * by inserting a non-"same" flag.
 */
function arbSequenceWithNoExtendedRepetition(): fc.Arbitrary<AudioCrossSectionComparison[]> {
  return fc
    .array(arbSimilarityFlag, { minLength: 1, maxLength: 20 })
    .map((flags) => {
      // Break runs of 3+ "same" flags
      const result: AudioSimilarityFlag[] = [];
      let consecutiveSame = 0;
      for (const flag of flags) {
        if (flag === "same audio content") {
          consecutiveSame++;
          if (consecutiveSame >= 3) {
            // Replace with "different" to break the run
            result.push("different audio content");
            consecutiveSame = 0;
          } else {
            result.push(flag);
          }
        } else {
          result.push(flag);
          consecutiveSame = 0;
        }
      }
      return result.map((flag, i) => ({
        sectionIndexA: i,
        sectionIndexB: i + 1,
        similarity: flag === "same audio content" ? 0.98 : flag === "similar audio content" ? 0.85 : 0.5,
        flag,
      }));
    });
}

// ─── Property 12: Extended repetition detection correctness ─────────────

// Feature: audio-content-analysis, Property 12: Extended repetition detection correctness
describe("Property 12: Extended repetition detection correctness", () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * When there are 3+ consecutive "same audio content" comparisons,
   * at least one repetition group is returned.
   */
  test.prop([arbSequenceWithSameRun(3)], { numRuns: 100 })(
    "detects repetition when 3+ consecutive 'same audio content' flags exist",
    (comparisons) => {
      const groups = detectExtendedRepetition(comparisons);
      expect(groups.length).toBeGreaterThanOrEqual(1);
    },
  );

  /**
   * **Validates: Requirements 7.5**
   *
   * Longer runs (4+ consecutive "same") also produce at least one group.
   */
  test.prop(
    [fc.integer({ min: 4, max: 10 }).chain((n) => arbSequenceWithSameRun(n))],
    { numRuns: 100 },
  )(
    "detects repetition when 4+ consecutive 'same audio content' flags exist",
    (comparisons) => {
      const groups = detectExtendedRepetition(comparisons);
      expect(groups.length).toBeGreaterThanOrEqual(1);
    },
  );

  /**
   * **Validates: Requirements 7.5**
   *
   * When there are fewer than 3 consecutive "same audio content" flags,
   * no repetition group is returned.
   */
  test.prop([arbSequenceWithNoExtendedRepetition()], { numRuns: 100 })(
    "returns no groups when fewer than 3 consecutive 'same audio content' flags exist",
    (comparisons) => {
      const groups = detectExtendedRepetition(comparisons);
      expect(groups.length).toBe(0);
    },
  );

  /**
   * **Validates: Requirements 7.5**
   *
   * Each returned group has at least 4 section indices
   * (3 consecutive comparisons connect 4 sections).
   */
  test.prop([arbComparisonSequence(3, 20)], { numRuns: 100 })(
    "each returned group has at least 4 section indices",
    (comparisons) => {
      const groups = detectExtendedRepetition(comparisons);
      for (const group of groups) {
        expect(group.length).toBeGreaterThanOrEqual(4);
      }
    },
  );

  /**
   * **Validates: Requirements 7.5**
   *
   * Section indices in each group are monotonically increasing.
   */
  test.prop([arbComparisonSequence(3, 20)], { numRuns: 100 })(
    "group indices are monotonically increasing",
    (comparisons) => {
      const groups = detectExtendedRepetition(comparisons);
      for (const group of groups) {
        for (let i = 1; i < group.length; i++) {
          expect(group[i]!).toBeGreaterThan(group[i - 1]!);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 7.5**
   *
   * An empty comparisons array produces no groups.
   */
  test.prop([fc.constant([])], { numRuns: 100 })(
    "returns no groups for an empty comparison array",
    (comparisons: AudioCrossSectionComparison[]) => {
      const groups = detectExtendedRepetition(comparisons);
      expect(groups.length).toBe(0);
    },
  );

  /**
   * **Validates: Requirements 7.5**
   *
   * Exactly 2 consecutive "same" flags produce no groups (boundary case).
   */
  test.prop([arbSequenceWithSameRun(2)], { numRuns: 100 })(
    "no groups when exactly 2 consecutive 'same audio content' flags exist (boundary)",
    (comparisons) => {
      // The sequence has exactly a run of 2, surrounded by non-"same" flags
      // Verify that the run of 2 alone does not trigger detection
      const groups = detectExtendedRepetition(comparisons);
      // Since we forced exactly 2 consecutive "same" surrounded by non-"same",
      // there should be no groups
      expect(groups.length).toBe(0);
    },
  );
});
