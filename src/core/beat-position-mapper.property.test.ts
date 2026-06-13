/**
 * Property-based tests for Beat Position Mapper — section sample range clamping.
 *
 * Feature: audio-content-analysis, Property 3: Section sample range clamping
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createBeatPositionMapper } from "./beat-position-mapper.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate valid mapper parameters: sampleRate > 0, totalSamples > 0, startBeat < endBeat. */
const mapperParamsArb = fc
  .record({
    sampleRate: fc.integer({ min: 8000, max: 192000 }),
    totalSamples: fc.integer({ min: 1, max: 1_000_000 }),
    startBeat: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    beatSpan: fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ sampleRate, totalSamples, startBeat, beatSpan }) => ({
    sampleRate,
    totalSamples,
    startBeat,
    endBeat: startBeat + beatSpan,
  }));

/** Generate an arbitrary beat range that may fall within, outside, or partially overlap the buffer. */
const sectionBeatRangeArb = fc
  .record({
    rangeStart: fc.double({ min: -100, max: 1600, noNaN: true, noDefaultInfinity: true }),
    rangeSpan: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ rangeStart, rangeSpan }) => ({
    startBeat: rangeStart,
    endBeat: rangeStart + rangeSpan,
  }));

/**
 * Generate a section beat range that is entirely within the buffer's beat range.
 * Uses the mapper params to calculate valid interior ranges.
 */
const interiorSectionArb = (bufferStartBeat: number, bufferEndBeat: number) => {
  const span = bufferEndBeat - bufferStartBeat;
  return fc
    .record({
      startFrac: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      endFrac: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    })
    .map(({ startFrac, endFrac }) => {
      const s = Math.min(startFrac, endFrac);
      const e = Math.max(startFrac, endFrac);
      return {
        startBeat: bufferStartBeat + s * span,
        endBeat: bufferStartBeat + e * span,
      };
    });
};

// ─── Property 3: Section sample range clamping ─────────────────────────

// Feature: audio-content-analysis, Property 3: Section sample range clamping
describe("Property 3: Section sample range clamping", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any section beat range and buffer bounds, getSampleRange(startBeat, endBeat)
   * SHALL return a sample range where startSample >= 0, endSample <= totalSamples,
   * and startSample <= endSample.
   */
  test.prop([mapperParamsArb, sectionBeatRangeArb], { numRuns: 100 })(
    "startSample >= 0 for any section beat range",
    (params, section) => {
      const mapper = createBeatPositionMapper(params);
      const { startSample } = mapper.getSampleRange(section.startBeat, section.endBeat);
      expect(startSample).toBeGreaterThanOrEqual(0);
    },
  );

  test.prop([mapperParamsArb, sectionBeatRangeArb], { numRuns: 100 })(
    "endSample <= totalSamples for any section beat range",
    (params, section) => {
      const mapper = createBeatPositionMapper(params);
      const { endSample } = mapper.getSampleRange(section.startBeat, section.endBeat);
      expect(endSample).toBeLessThanOrEqual(params.totalSamples);
    },
  );

  test.prop([mapperParamsArb, sectionBeatRangeArb], { numRuns: 100 })(
    "startSample <= endSample for any section beat range",
    (params, section) => {
      const mapper = createBeatPositionMapper(params);
      const { startSample, endSample } = mapper.getSampleRange(section.startBeat, section.endBeat);
      expect(startSample).toBeLessThanOrEqual(endSample);
    },
  );

  test.prop(
    [mapperParamsArb.filter((p) => p.totalSamples > 1)],
    { numRuns: 100 },
  )(
    "interior section range returns correct portion within buffer bounds",
    (params) => {
      const mapper = createBeatPositionMapper(params);

      // Generate an interior section using deterministic fractions
      // Use a section that is strictly within the buffer's beat range
      const midStart = params.startBeat + (params.endBeat - params.startBeat) * 0.25;
      const midEnd = params.startBeat + (params.endBeat - params.startBeat) * 0.75;

      const { startSample, endSample } = mapper.getSampleRange(midStart, midEnd);

      // The result should be strictly within buffer bounds
      expect(startSample).toBeGreaterThanOrEqual(0);
      expect(endSample).toBeLessThanOrEqual(params.totalSamples);
      expect(startSample).toBeLessThanOrEqual(endSample);

      // For an interior section, the sample range should not be at the extremes
      // (unless the buffer is very small). For buffers > 3 samples, a 25%-75% range
      // should not start at 0 or end at totalSamples.
      if (params.totalSamples > 3) {
        expect(startSample).toBeGreaterThan(0);
        expect(endSample).toBeLessThan(params.totalSamples);
      }
    },
  );

  test.prop([mapperParamsArb], { numRuns: 100 })(
    "section extending beyond buffer is clamped to buffer bounds (before buffer)",
    (params) => {
      const mapper = createBeatPositionMapper(params);

      // Section entirely before the buffer's beat range
      const beforeStart = params.startBeat - 100;
      const beforeEnd = params.startBeat - 50;

      const { startSample, endSample } = mapper.getSampleRange(beforeStart, beforeEnd);

      // Both should be clamped to 0
      expect(startSample).toBeGreaterThanOrEqual(0);
      expect(endSample).toBeLessThanOrEqual(params.totalSamples);
      expect(startSample).toBeLessThanOrEqual(endSample);
    },
  );

  test.prop([mapperParamsArb], { numRuns: 100 })(
    "section extending beyond buffer is clamped to buffer bounds (after buffer)",
    (params) => {
      const mapper = createBeatPositionMapper(params);

      // Section entirely after the buffer's beat range
      const afterStart = params.endBeat + 50;
      const afterEnd = params.endBeat + 100;

      const { startSample, endSample } = mapper.getSampleRange(afterStart, afterEnd);

      // Both should be clamped to totalSamples
      expect(startSample).toBeGreaterThanOrEqual(0);
      expect(endSample).toBeLessThanOrEqual(params.totalSamples);
      expect(startSample).toBeLessThanOrEqual(endSample);
    },
  );

  test.prop([mapperParamsArb.filter((p) => p.totalSamples > 1)], { numRuns: 100 })(
    "partial overlap returns only the overlapping portion (section starts before buffer)",
    (params) => {
      const mapper = createBeatPositionMapper(params);

      // Section starts before buffer but ends inside
      const midBeat = params.startBeat + (params.endBeat - params.startBeat) * 0.5;
      const { startSample, endSample } = mapper.getSampleRange(
        params.startBeat - 10,
        midBeat,
      );

      // startSample should be clamped to 0 (section starts before buffer)
      expect(startSample).toBe(0);
      // endSample should be inside the buffer (not at the end)
      expect(endSample).toBeLessThanOrEqual(params.totalSamples);
      expect(endSample).toBeGreaterThanOrEqual(0);
      expect(startSample).toBeLessThanOrEqual(endSample);
    },
  );

  test.prop([mapperParamsArb.filter((p) => p.totalSamples > 10)], { numRuns: 100 })(
    "partial overlap returns only the overlapping portion (section ends after buffer)",
    (params) => {
      const mapper = createBeatPositionMapper(params);

      // Section starts inside buffer but ends well after
      const midBeat = params.startBeat + (params.endBeat - params.startBeat) * 0.5;
      const { startSample, endSample } = mapper.getSampleRange(
        midBeat,
        params.endBeat + 100,
      );

      // endSample should be clamped to totalSamples (since section extends beyond)
      expect(endSample).toBe(params.totalSamples);
      // startSample should be inside the buffer (not at the start for midpoint section start)
      expect(startSample).toBeGreaterThan(0);
      expect(startSample).toBeLessThanOrEqual(params.totalSamples);
      expect(startSample).toBeLessThanOrEqual(endSample);
    },
  );
});
