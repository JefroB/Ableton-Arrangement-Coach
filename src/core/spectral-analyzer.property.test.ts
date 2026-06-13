/**
 * Property-based tests for spectral-analyzer.ts
 *
 * Feature: audio-content-analysis, Property 4: Spectral profile band energy range invariant
 * Feature: audio-content-analysis, Property 5: Spectral centroid within Nyquist bound
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computeSpectralProfile } from "./spectral-analyzer.js";
import { FREQUENCY_BANDS } from "./audio-content-types.js";

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/**
 * Generate a valid sample rate in the range [8000, 192000].
 */
function arbSampleRate(): fc.Arbitrary<number> {
  return fc.oneof(
    fc.constantFrom(8000, 11025, 22050, 44100, 48000, 88200, 96000, 176400, 192000),
    fc.integer({ min: 8000, max: 192000 }),
  );
}

/**
 * Generate a mono PCM buffer (values in [-1.0, 1.0], length ≥ 1).
 * Short buffers (< 4096) trigger zero-padding in the implementation.
 */
function arbPcmBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.double({ min: -1.0, max: 1.0, noNaN: true, noDefaultInfinity: true }), {
      minLength: 1,
      maxLength: 8192,
    })
    .map((arr) => new Float32Array(arr));
}

/**
 * Generate a short PCM buffer (< 4096 samples) that triggers zero-padding.
 */
function arbShortPcmBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.double({ min: -1.0, max: 1.0, noNaN: true, noDefaultInfinity: true }), {
      minLength: 1,
      maxLength: 4095,
    })
    .map((arr) => new Float32Array(arr));
}

/**
 * Generate a longer PCM buffer (≥ 4096 samples) — multi-window processing.
 */
function arbLongPcmBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.double({ min: -1.0, max: 1.0, noNaN: true, noDefaultInfinity: true }), {
      minLength: 4096,
      maxLength: 16384,
    })
    .map((arr) => new Float32Array(arr));
}

/**
 * Generate an all-zero PCM buffer (silence).
 */
function arbSilentBuffer(): fc.Arbitrary<Float32Array> {
  return fc
    .integer({ min: 1, max: 8192 })
    .map((len) => new Float32Array(len));
}

// ─── Property 4: Spectral profile band energy range invariant ───────────

describe("Property 4: Spectral profile band energy range invariant", () => {
  // ── Sub-property 1: All band energies in [-96, 0] for random PCM buffers ──

  test.prop(
    [arbPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "all 6 band energy values are in [-96, 0] for any mono PCM buffer and valid sample rate",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);

      for (const band of FREQUENCY_BANDS) {
        const energy = profile.bands[band.name];
        expect(energy).toBeGreaterThanOrEqual(-96);
        expect(energy).toBeLessThanOrEqual(0);
      }
    },
  );

  // ── Sub-property 2: All band energies in [-96, 0] for short buffers (zero-padding) ──

  test.prop(
    [arbShortPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "all 6 band energy values are in [-96, 0] for short buffers triggering zero-padding",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);

      for (const band of FREQUENCY_BANDS) {
        const energy = profile.bands[band.name];
        expect(energy).toBeGreaterThanOrEqual(-96);
        expect(energy).toBeLessThanOrEqual(0);
      }
    },
  );

  // ── Sub-property 3: All band energies in [-96, 0] for longer multi-window buffers ──

  test.prop(
    [arbLongPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "all 6 band energy values are in [-96, 0] for longer multi-window buffers",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);

      for (const band of FREQUENCY_BANDS) {
        const energy = profile.bands[band.name];
        expect(energy).toBeGreaterThanOrEqual(-96);
        expect(energy).toBeLessThanOrEqual(0);
      }
    },
  );

  // ── Sub-property 4: Silence (all zeros) produces -96 for all bands ──

  test.prop(
    [arbSilentBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "silent buffer (all zeros) produces -96 dBFS for all bands",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);

      for (const band of FREQUENCY_BANDS) {
        const energy = profile.bands[band.name];
        expect(energy).toBe(-96);
      }
    },
  );
});


// Feature: audio-content-analysis, Property 5: Spectral centroid within Nyquist bound

// ─── Property 5: Spectral centroid within Nyquist bound ─────────────────

/**
 * **Validates: Requirements 3.3**
 *
 * Property 5: Spectral centroid within Nyquist bound
 * For any mono PCM buffer and sample rate, all spectral centroid values
 * (per-window and mean) SHALL be in the range [0, sampleRate / 2] Hz.
 */
describe("Property 5: Spectral centroid within Nyquist bound", () => {
  // ── Sub-property 1: meanCentroid in [0, sampleRate / 2] for any valid input ──

  test.prop(
    [arbPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "meanCentroid is in [0, sampleRate / 2] for any mono PCM buffer and valid sample rate",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);
      const nyquist = sampleRate / 2;

      expect(profile.meanCentroid).toBeGreaterThanOrEqual(0);
      expect(profile.meanCentroid).toBeLessThanOrEqual(nyquist);
    },
  );

  // ── Sub-property 2: Every centroidPerWindow value in [0, sampleRate / 2] ──

  test.prop(
    [arbPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "every centroidPerWindow value is in [0, sampleRate / 2]",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);
      const nyquist = sampleRate / 2;

      for (const centroid of profile.centroidPerWindow) {
        expect(centroid).toBeGreaterThanOrEqual(0);
        expect(centroid).toBeLessThanOrEqual(nyquist);
      }
    },
  );

  // ── Sub-property 3: Nyquist bound holds across various standard sample rates ──

  test.prop(
    [arbPcmBuffer(), fc.constantFrom(44100, 48000, 96000, 22050, 88200, 192000)],
    { numRuns: 100 },
  )(
    "Nyquist bound holds for standard sample rates (44100, 48000, 96000, etc.)",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);
      const nyquist = sampleRate / 2;

      expect(profile.meanCentroid).toBeGreaterThanOrEqual(0);
      expect(profile.meanCentroid).toBeLessThanOrEqual(nyquist);

      for (const centroid of profile.centroidPerWindow) {
        expect(centroid).toBeGreaterThanOrEqual(0);
        expect(centroid).toBeLessThanOrEqual(nyquist);
      }
    },
  );

  // ── Sub-property 4: Nyquist bound holds for short buffers (zero-padding path) ──

  test.prop(
    [arbShortPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "Nyquist bound holds for short buffers that trigger zero-padding",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);
      const nyquist = sampleRate / 2;

      expect(profile.meanCentroid).toBeGreaterThanOrEqual(0);
      expect(profile.meanCentroid).toBeLessThanOrEqual(nyquist);

      for (const centroid of profile.centroidPerWindow) {
        expect(centroid).toBeGreaterThanOrEqual(0);
        expect(centroid).toBeLessThanOrEqual(nyquist);
      }
    },
  );

  // ── Sub-property 5: Nyquist bound holds for longer multi-window buffers ──

  test.prop(
    [arbLongPcmBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "Nyquist bound holds for longer multi-window buffers",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);
      const nyquist = sampleRate / 2;

      expect(profile.meanCentroid).toBeGreaterThanOrEqual(0);
      expect(profile.meanCentroid).toBeLessThanOrEqual(nyquist);

      for (const centroid of profile.centroidPerWindow) {
        expect(centroid).toBeGreaterThanOrEqual(0);
        expect(centroid).toBeLessThanOrEqual(nyquist);
      }
    },
  );

  // ── Sub-property 6: Silent buffer produces meanCentroid of 0 ──

  test.prop(
    [arbSilentBuffer(), arbSampleRate()],
    { numRuns: 100 },
  )(
    "silent buffer produces meanCentroid of 0 (within Nyquist bound)",
    (buffer, sampleRate) => {
      const profile = computeSpectralProfile(buffer, sampleRate);
      const nyquist = sampleRate / 2;

      expect(profile.meanCentroid).toBe(0);
      expect(profile.meanCentroid).toBeLessThanOrEqual(nyquist);

      for (const centroid of profile.centroidPerWindow) {
        expect(centroid).toBeGreaterThanOrEqual(0);
        expect(centroid).toBeLessThanOrEqual(nyquist);
      }
    },
  );
});
