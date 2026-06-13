/**
 * Property-based tests for the Beat Position Mapper — linear mapping correctness.
 *
 * Feature: audio-content-analysis, Property 2: Beat Position Mapper linear mapping correctness
 *
 * Validates: Requirements 2.1, 2.3
 *
 * For any valid parameters (sampleRate > 0, totalSamples > 0, startBeat < endBeat),
 * the Beat Position Mapper SHALL satisfy:
 * - sampleToBeat(0) === startBeat
 * - sampleToBeat(totalSamples - 1) is within 0.001 beats of endBeat
 * - The mapping is monotonically increasing (higher sample index → higher beat position)
 * - Round-trip: beatToSample(sampleToBeat(i)) ≈ i (within rounding tolerance)
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createBeatPositionMapper } from "./beat-position-mapper.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary valid sample rate (Hz). Typical range: 8000 to 192000. */
const sampleRateArb = fc.integer({ min: 8000, max: 192000 });

/** Arbitrary valid total sample count (≥ 2 to make monotonicity testable). */
const totalSamplesMultiArb = fc.integer({ min: 2, max: 10_000_000 });

/** Arbitrary valid total sample count (≥ 1, includes edge case of single sample). */
const totalSamplesArb = fc.integer({ min: 1, max: 10_000_000 });

/** Arbitrary beat range where startBeat < endBeat, both in reasonable musical range. */
const beatRangeArb = fc
  .tuple(
    fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.001, max: 5000, noNaN: true, noDefaultInfinity: true }),
  )
  .map(([start, span]) => ({
    startBeat: start,
    endBeat: start + span,
  }));

/** Combined valid mapper params with totalSamples ≥ 2. */
const mapperParamsMultiArb = fc
  .tuple(sampleRateArb, totalSamplesMultiArb, beatRangeArb)
  .map(([sampleRate, totalSamples, { startBeat, endBeat }]) => ({
    sampleRate,
    totalSamples,
    startBeat,
    endBeat,
  }));

/** Combined valid mapper params with totalSamples ≥ 1. */
const mapperParamsArb = fc
  .tuple(sampleRateArb, totalSamplesArb, beatRangeArb)
  .map(([sampleRate, totalSamples, { startBeat, endBeat }]) => ({
    sampleRate,
    totalSamples,
    startBeat,
    endBeat,
  }));

// ─── Property 2: Beat Position Mapper linear mapping correctness ───────

// Feature: audio-content-analysis, Property 2: Beat Position Mapper linear mapping correctness
describe("Property 2: Beat Position Mapper linear mapping correctness", () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * sampleToBeat(0) SHALL equal startBeat exactly.
   */
  test.prop([mapperParamsArb], { numRuns: 100 })(
    "sampleToBeat(0) === startBeat",
    (params) => {
      const mapper = createBeatPositionMapper(params);
      expect(mapper.sampleToBeat(0)).toBe(params.startBeat);
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * sampleToBeat(totalSamples - 1) SHALL be within 0.001 beats of endBeat.
   * Requires totalSamples >= 2 because the linear mapping uses (N-1) intervals:
   * with only 1 sample, index 0 maps to startBeat (the first-sample property),
   * and there is no distinct "last sample" to map to endBeat.
   */
  test.prop([mapperParamsMultiArb], { numRuns: 100 })(
    "sampleToBeat(totalSamples - 1) is within 0.001 of endBeat",
    (params) => {
      const mapper = createBeatPositionMapper(params);
      const lastBeat = mapper.sampleToBeat(params.totalSamples - 1);
      expect(Math.abs(lastBeat - params.endBeat)).toBeLessThanOrEqual(0.001);
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * For any i < j (where both are valid sample indices), sampleToBeat(i) < sampleToBeat(j).
   * This tests monotonically increasing mapping when totalSamples > 1.
   */
  test.prop(
    [
      mapperParamsMultiArb.chain((params) =>
        fc
          .tuple(
            fc.integer({ min: 0, max: params.totalSamples - 2 }),
            fc.integer({ min: 1, max: params.totalSamples - 1 }),
          )
          .filter(([i, j]) => i < j)
          .map(([i, j]) => ({ params, i, j })),
      ),
    ],
    { numRuns: 100 },
  )(
    "monotonically increasing: sampleToBeat(i) < sampleToBeat(j) when i < j",
    ({ params, i, j }) => {
      const mapper = createBeatPositionMapper(params);
      expect(mapper.sampleToBeat(i)).toBeLessThan(mapper.sampleToBeat(j));
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * Round-trip: beatToSample(sampleToBeat(i)) ≈ i within rounding tolerance (±1 sample).
   */
  test.prop(
    [
      mapperParamsMultiArb.chain((params) =>
        fc
          .integer({ min: 0, max: params.totalSamples - 1 })
          .map((i) => ({ params, i })),
      ),
    ],
    { numRuns: 100 },
  )(
    "round-trip: beatToSample(sampleToBeat(i)) ≈ i (within ±1 sample)",
    ({ params, i }) => {
      const mapper = createBeatPositionMapper(params);
      const roundTrip = mapper.beatToSample(mapper.sampleToBeat(i));
      expect(Math.abs(roundTrip - i)).toBeLessThanOrEqual(1);
    },
  );
});
