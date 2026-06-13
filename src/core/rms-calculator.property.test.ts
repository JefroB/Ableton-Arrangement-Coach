/**
 * Property-based tests for rms-calculator.ts
 *
 * Feature: audio-content-analysis, Property 6: RMS dBFS range and normalization
 *
 * Validates: Requirements 4.1, 4.2, 4.4, 4.7
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computeRmsDbfs, normalizeRmsToEnergy } from "./rms-calculator.js";

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/**
 * Generate a mono PCM buffer (values in [-1.0, 1.0]).
 * The test body uses fc.pre() to enforce the non-zero precondition
 * after Float32Array conversion, which correctly handles shrinking.
 */
function arbPcmBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.double({ min: -1.0, max: 1.0, noNaN: true, noDefaultInfinity: true }), {
      minLength: 1,
      maxLength: 4096,
    })
    .map((arr) => new Float32Array(arr));
}

/**
 * Check if a Float32Array has at least one non-zero sample
 * (i.e., produces non-zero energy).
 */
function hasNonZeroSample(buffer: Float32Array): boolean {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0) return true;
  }
  return false;
}

/**
 * Generate a full-scale PCM buffer where all samples are ±1.0.
 */
function arbFullScaleBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.constantFrom(-1.0, 1.0), { minLength: 1, maxLength: 4096 })
    .map((arr) => new Float32Array(arr));
}

/**
 * Generate an all-zero PCM buffer (silence).
 */
function arbSilentBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .integer({ min: 1, max: 4096 })
    .map((len) => new Float32Array(len));
}

/**
 * Generate a dBFS value in a realistic range for normalization testing.
 */
function arbDbfsValue(): fc.Arbitrary<number> {
  return fc.oneof(
    fc.double({ min: -120, max: 6, noNaN: true, noDefaultInfinity: true }),
    fc.constant(-Infinity),
    fc.constant(0),
    fc.constant(-60),
  );
}

// ─── Property 6: RMS dBFS range and normalization ───────────────────────

describe("Property 6: RMS dBFS range and normalization", () => {
  // ── Sub-property 1: For any non-zero buffer, computeRmsDbfs returns ≤ 0 ──

  test.prop(
    [arbPcmBuffer()],
    { numRuns: 100 },
  )(
    "computeRmsDbfs returns a value ≤ 0 dBFS for any non-zero buffer",
    (buffer) => {
      fc.pre(hasNonZeroSample(buffer));
      const dbfs = computeRmsDbfs(buffer);
      expect(dbfs).toBeLessThanOrEqual(0);
      expect(dbfs).not.toBe(-Infinity);
    },
  );

  // ── Sub-property 2: Full-scale signal returns exactly 0 dBFS ──

  test.prop(
    [arbFullScaleBuffer()],
    { numRuns: 100 },
  )(
    "computeRmsDbfs returns exactly 0 dBFS for a full-scale signal (all ±1.0)",
    (buffer) => {
      const dbfs = computeRmsDbfs(buffer);
      expect(dbfs).toBeCloseTo(0, 10);
    },
  );

  // ── Sub-property 3: All-zero buffer returns -Infinity ──

  test.prop(
    [arbSilentBuffer()],
    { numRuns: 100 },
  )(
    "computeRmsDbfs returns -Infinity for an all-zero (silent) buffer",
    (buffer) => {
      const dbfs = computeRmsDbfs(buffer);
      expect(dbfs).toBe(-Infinity);
    },
  );

  // ── Sub-property 4: normalizeRmsToEnergy always returns a value in [0, 1] ──

  test.prop(
    [arbDbfsValue()],
    { numRuns: 100 },
  )(
    "normalizeRmsToEnergy always returns a value in [0, 1]",
    (dbfs) => {
      const energy = normalizeRmsToEnergy(dbfs);
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(1);
    },
  );

  // ── Sub-property 5: normalizeRmsToEnergy(-60) === 0.0 ──

  test.prop(
    [fc.constant(-60)],
    { numRuns: 100 },
  )(
    "normalizeRmsToEnergy(-60) returns exactly 0.0",
    (dbfs) => {
      const energy = normalizeRmsToEnergy(dbfs);
      expect(energy).toBe(0);
    },
  );

  // ── Sub-property 6: normalizeRmsToEnergy(0) === 1.0 ──

  test.prop(
    [fc.constant(0)],
    { numRuns: 100 },
  )(
    "normalizeRmsToEnergy(0) returns exactly 1.0",
    (dbfs) => {
      const energy = normalizeRmsToEnergy(dbfs);
      expect(energy).toBe(1);
    },
  );

  // ── Sub-property 7: normalizeRmsToEnergy(-Infinity) === 0.0 ──

  test.prop(
    [fc.constant(-Infinity)],
    { numRuns: 100 },
  )(
    "normalizeRmsToEnergy(-Infinity) returns exactly 0.0",
    (dbfs) => {
      const energy = normalizeRmsToEnergy(dbfs);
      expect(energy).toBe(0);
    },
  );

  // ── Sub-property 8: For any dBFS value, normalized result is in [0, 1] ──

  test.prop(
    [fc.double({ min: -200, max: 200, noNaN: true })],
    { numRuns: 100 },
  )(
    "normalizeRmsToEnergy returns [0, 1] for any finite dBFS value",
    (dbfs) => {
      const energy = normalizeRmsToEnergy(dbfs);
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(1);
    },
  );
});
