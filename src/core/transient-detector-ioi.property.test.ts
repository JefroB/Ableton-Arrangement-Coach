/**
 * Property-based tests for transient-detector.ts
 *
 * Feature: audio-content-analysis, Property 8: Minimum inter-onset interval enforcement
 *
 * Validates: Requirements 5.6
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { detectTransients } from "./transient-detector.js";

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/**
 * Generate a valid sample rate from standard audio sample rates.
 */
function arbSampleRate(): fc.Arbitrary<number> {
  return fc.constantFrom(44100, 48000);
}

/**
 * Generate a mono PCM buffer from integer samples mapped to [-1, 1].
 * Using integers avoids Float64→Float32 subnormal issues that crash Meyda.
 * Buffer is 9216 samples (≈0.2s at 44100, enough for a few analysis frames).
 */
function arbPcmBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.integer({ min: -32768, max: 32767 }), {
      minLength: 9216,
      maxLength: 9216,
    })
    .map((arr) => {
      const buffer = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        buffer[i] = arr[i]! / 32768;
      }
      return buffer;
    });
}

/**
 * Generate a buffer with clear transient-like bursts using integer-based samples.
 * Alternates between loud noise bursts and near-silence to ensure transients.
 */
function arbTransientBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .record({
      numBursts: fc.integer({ min: 3, max: 10 }),
      burstLevel: fc.integer({ min: 16384, max: 32767 }),
      quietLevel: fc.integer({ min: 100, max: 500 }),
      seed: fc.integer({ min: 1, max: 2147483647 }),
    })
    .map(({ numBursts, burstLevel, quietLevel, seed }) => {
      // Fixed length of 9216 samples for consistent performance
      const length = 9216;
      const buffer = new Float32Array(length);
      const sectionSize = Math.floor(length / (numBursts * 2));

      // Simple LCG PRNG
      let rng = seed;
      const next = () => {
        rng = (rng * 1664525 + 1013904223) | 0;
        return rng;
      };

      for (let i = 0; i < length; i++) {
        const sectionIdx = Math.floor(i / sectionSize);
        const isBurst = sectionIdx % 2 === 0;
        const level = isBurst ? burstLevel : quietLevel;
        const raw = next() % level;
        buffer[i] = raw / 32768;
      }
      return buffer;
    });
}

/**
 * Generate a positive number of section bars.
 */
function arbSectionBars(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 8 });
}

// ─── Property 8: Minimum inter-onset interval enforcement ───────────────

// Feature: audio-content-analysis, Property 8: Minimum inter-onset interval enforcement

describe("Property 8: Minimum inter-onset interval enforcement", () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * For any set of detected transients, no two transients in the output
   * SHALL be separated by less than 30ms. When two candidates are within 30ms,
   * only the one with higher spectral flux is retained.
   */

  // ── Sub-property 1: All consecutive transient positions are ≥ 30ms apart (random PCM buffers) ──

  test.prop(
    [arbPcmBuffer(), arbSampleRate(), arbSectionBars()],
    { numRuns: 100 },
  )(
    "all consecutive transient positions are separated by ≥ 30ms for random PCM buffers",
    (buffer, sampleRate, sectionBars) => {
      const result = detectTransients(buffer, sampleRate, sectionBars);
      const positions = result.transientPositions;

      if (positions.length < 2) return; // Nothing to check with 0 or 1 transients

      const minIntervalSamples = sampleRate * 0.03; // 30ms in samples

      for (let i = 1; i < positions.length; i++) {
        const gap = positions[i]! - positions[i - 1]!;
        expect(gap).toBeGreaterThanOrEqual(minIntervalSamples);
      }
    },
  );

  // ── Sub-property 2: All consecutive transient positions are ≥ 30ms apart (transient-rich buffers) ──

  test.prop(
    [arbTransientBuffer(), arbSampleRate(), arbSectionBars()],
    { numRuns: 100 },
  )(
    "all consecutive transient positions are separated by ≥ 30ms for transient-rich buffers",
    (buffer, sampleRate, sectionBars) => {
      const result = detectTransients(buffer, sampleRate, sectionBars);
      const positions = result.transientPositions;

      if (positions.length < 2) return; // Nothing to check with 0 or 1 transients

      const minIntervalSamples = sampleRate * 0.03; // 30ms in samples

      for (let i = 1; i < positions.length; i++) {
        const gap = positions[i]! - positions[i - 1]!;
        expect(gap).toBeGreaterThanOrEqual(minIntervalSamples);
      }
    },
  );

  // ── Sub-property 3: Transient positions are monotonically increasing ──

  test.prop(
    [arbPcmBuffer(), arbSampleRate(), arbSectionBars()],
    { numRuns: 100 },
  )(
    "transient positions are monotonically increasing (sorted ascending)",
    (buffer, sampleRate, sectionBars) => {
      const result = detectTransients(buffer, sampleRate, sectionBars);
      const positions = result.transientPositions;

      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
      }
    },
  );

  // ── Sub-property 4: 30ms enforcement holds across standard sample rates ──

  test.prop(
    [arbTransientBuffer(), fc.constantFrom(44100, 48000, 22050, 96000), arbSectionBars()],
    { numRuns: 100 },
  )(
    "30ms minimum inter-onset interval holds for standard sample rates (44100, 48000, etc.)",
    (buffer, sampleRate, sectionBars) => {
      const result = detectTransients(buffer, sampleRate, sectionBars);
      const positions = result.transientPositions;

      if (positions.length < 2) return;

      const minIntervalSamples = sampleRate * 0.03;

      for (let i = 1; i < positions.length; i++) {
        const gap = positions[i]! - positions[i - 1]!;
        expect(gap).toBeGreaterThanOrEqual(minIntervalSamples);
      }
    },
  );
});
