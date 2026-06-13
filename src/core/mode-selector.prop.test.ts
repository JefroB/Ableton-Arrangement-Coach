/**
 * Property-based tests for Mode Selection Correctness.
 *
 * Feature: section-marker-generation, Property 1: Mode Selection Correctness
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import {
  selectMode,
  computeUnionCoverage,
  type ModeSelectionInput,
  type ClipTimeRange,
} from "./mode-selector.js";

// ─── Constants (mirror implementation thresholds) ──────────────────────

const CLIP_COUNT_THRESHOLD = 3;
const COVERAGE_THRESHOLD = 0.10;

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a single clip with valid start/end times within a song duration. */
function clipArb(maxDuration: number): fc.Arbitrary<ClipTimeRange> {
  return fc
    .tuple(
      fc.double({ min: 0, max: maxDuration, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: maxDuration, noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
    )
    .map(([a, b, muted]) => ({
      startTime: Math.min(a, b),
      endTime: Math.max(a, b) + 0.001, // ensure endTime > startTime
      muted,
    }));
}

/** Generate a valid ModeSelectionInput with positive songDuration and trackCount. */
const validInputArb: fc.Arbitrary<ModeSelectionInput> = fc
  .double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true })
  .chain((songDuration) =>
    fc.tuple(
      fc.array(clipArb(songDuration), { minLength: 0, maxLength: 20 }),
      fc.constant(songDuration),
      fc.integer({ min: 1, max: 100 }),
    ),
  )
  .map(([clips, songDuration, trackCount]) => ({
    clips,
    songDuration,
    trackCount,
  }));

/** Generate an input with zero or negative songDuration. */
const zeroDurationInputArb: fc.Arbitrary<ModeSelectionInput> = fc
  .tuple(
    fc.array(
      fc
        .tuple(
          fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.boolean(),
        )
        .map(([a, b, muted]) => ({
          startTime: Math.min(a, b),
          endTime: Math.max(a, b) + 0.001,
          muted,
        })),
      { minLength: 0, maxLength: 10 },
    ),
    fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true }),
    fc.integer({ min: 0, max: 100 }),
  )
  .map(([clips, songDuration, trackCount]) => ({
    clips,
    songDuration,
    trackCount,
  }));

/** Generate an input with zero trackCount. */
const zeroTracksInputArb: fc.Arbitrary<ModeSelectionInput> = fc
  .tuple(
    fc.array(
      fc
        .tuple(
          fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.boolean(),
        )
        .map(([a, b, muted]) => ({
          startTime: Math.min(a, b),
          endTime: Math.max(a, b) + 0.001,
          muted,
        })),
      { minLength: 0, maxLength: 10 },
    ),
    fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
    fc.constant(0),
  )
  .map(([clips, songDuration, trackCount]) => ({
    clips,
    songDuration,
    trackCount,
  }));

// ─── Property 1: Mode Selection Correctness ────────────────────────────

// Feature: section-marker-generation, Property 1: Mode Selection Correctness
describe("Property 1: Mode Selection Correctness", () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   *
   * For any generated ModeSelectionInput with valid (positive) songDuration
   * and trackCount, selectMode returns "minimal" iff unmuted clip count < 3
   * AND union coverage fraction < 10%; otherwise "content".
   */
  test.prop([validInputArb], { numRuns: 100 })(
    "returns correct mode based on unmuted clip count and coverage fraction",
    (input) => {
      const result = selectMode(input);

      // Recompute the decision independently
      const unmutedClips = input.clips.filter((c) => !c.muted);
      const unmutedCount = unmutedClips.length;
      const coverage = computeUnionCoverage(unmutedClips);
      const coverageFraction = coverage / input.songDuration;

      const shouldBeContent =
        unmutedCount >= CLIP_COUNT_THRESHOLD || coverageFraction >= COVERAGE_THRESHOLD;

      if (shouldBeContent) {
        expect(result).toBe("content");
      } else {
        expect(result).toBe("minimal");
      }
    },
  );

  /**
   * **Validates: Requirements 5.4**
   *
   * If songDuration is zero or negative, the mode SHALL always be "minimal"
   * regardless of clip data.
   */
  test.prop([zeroDurationInputArb], { numRuns: 100 })(
    "returns 'minimal' when songDuration is zero or negative",
    (input) => {
      const result = selectMode(input);
      expect(result).toBe("minimal");
    },
  );

  /**
   * **Validates: Requirements 5.4**
   *
   * If trackCount is zero, the mode SHALL always be "minimal"
   * regardless of clip data.
   */
  test.prop([zeroTracksInputArb], { numRuns: 100 })(
    "returns 'minimal' when trackCount is zero",
    (input) => {
      const result = selectMode(input);
      expect(result).toBe("minimal");
    },
  );
});
