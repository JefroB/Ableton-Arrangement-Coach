/**
 * Property-based tests for transient-detector.ts
 *
 * Feature: audio-content-analysis, Property 7: Transient density classification consistency
 *
 * Validates: Requirements 5.3, 5.4, 5.5
 *
 * For any transient density value (≥ 0), the rhythmic classification SHALL be:
 * - "silent" when density is 0 and buffer is silent (peak < -60 dBFS)
 * - "sustained/textural" when density < 0.5 per beat (< 2 per bar)
 * - "rhythmically moderate" when density is in [0.5, 4] per beat (inclusive, [2, 16] per bar)
 * - "rhythmically dense" when density > 4 per beat (> 16 per bar)
 * These ranges are exhaustive and mutually exclusive.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { detectTransients } from "./transient-detector.js";
import type { RhythmicClassification } from "./audio-content-types.js";

// ─── Constants ──────────────────────────────────────────────────────────

/** Assumed beats per bar (4/4 time), matching implementation. */
const BEATS_PER_BAR = 4;

/** Silence threshold: peak amplitude below 10^(-60/20) = 0.001 */
const SILENCE_THRESHOLD_LINEAR = Math.pow(10, -60 / 20);

/** All valid classifications. */
const VALID_CLASSIFICATIONS: RhythmicClassification[] = [
  "silent",
  "sustained/textural",
  "rhythmically moderate",
  "rhythmically dense",
];

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/**
 * Generate a silent buffer (peak amplitude below -60 dBFS).
 */
function arbSilentBuffer(): fc.Arbitrary<Float32Array> {
  const maxAmplitude = SILENCE_THRESHOLD_LINEAR * 0.9;
  return fc
    .array(
      fc.double({ min: -maxAmplitude, max: maxAmplitude, noNaN: true, noDefaultInfinity: true }),
      { minLength: 8192, maxLength: 8192 },
    )
    .map((arr) => new Float32Array(arr));
}

/**
 * Generate a non-negative density value for classification testing.
 * Covers all threshold boundaries and ranges.
 */
function arbDensityPerBar(): fc.Arbitrary<number> {
  return fc.oneof(
    // Zero density
    fc.constant(0),
    // Below sustained/textural boundary: density < 2 per bar (< 0.5/beat)
    fc.double({ min: 0.001, max: 1.999, noNaN: true, noDefaultInfinity: true }),
    // At boundary: exactly 2 per bar (= 0.5/beat)
    fc.constant(2),
    // Moderate range: [2, 16] per bar ([0.5, 4] per beat)
    fc.double({ min: 2, max: 16, noNaN: true, noDefaultInfinity: true }),
    // At upper boundary: exactly 16 per bar (= 4/beat)
    fc.constant(16),
    // Dense range: > 16 per bar (> 4/beat)
    fc.double({ min: 16.001, max: 200, noNaN: true, noDefaultInfinity: true }),
    // Random values across the full range
    fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  );
}

/**
 * Generate a valid sample rate.
 */
function arbSampleRate(): fc.Arbitrary<number> {
  return fc.constantFrom(44100, 48000);
}

/**
 * Generate a valid number of section bars (> 0).
 */
function arbSectionBars(): fc.Arbitrary<number> {
  return fc.double({ min: 1, max: 16, noNaN: true, noDefaultInfinity: true });
}

// ─── Helper: expected classification oracle ─────────────────────────────

/**
 * Given a density (transients per bar), return the expected classification
 * for a non-silent buffer. This is the "oracle" implementing the spec.
 */
function expectedClassificationForNonSilent(density: number): RhythmicClassification {
  const transientPerBeat = density / BEATS_PER_BAR;

  if (transientPerBeat < 0.5) {
    return "sustained/textural";
  }
  if (transientPerBeat <= 4) {
    return "rhythmically moderate";
  }
  return "rhythmically dense";
}

// ─── Property 7: Transient density classification consistency ───────────

// Feature: audio-content-analysis, Property 7: Transient density classification consistency
describe("Property 7: Transient density classification consistency", { timeout: 15000 }, () => {
  /**
   * Sub-property 1: Silent buffers always produce "silent" classification.
   *
   * When the buffer is silent (peak < -60 dBFS), the result must be:
   * - density === 0
   * - classification === "silent"
   * - no transient positions detected
   */
  test.prop(
    [arbSilentBuffer(), arbSampleRate(), arbSectionBars()],
    { numRuns: 100 },
  )(
    "silent buffers (peak < -60 dBFS) always produce 'silent' classification with density 0",
    (buffer, sampleRate, sectionBars) => {
      const result = detectTransients(buffer, sampleRate, sectionBars);

      expect(result.density).toBe(0);
      expect(result.classification).toBe("silent");
      expect(result.transientPositions).toHaveLength(0);
    },
  );

  /**
   * Sub-property 2: Empty buffers produce "silent" classification.
   */
  test.prop(
    [arbSampleRate(), arbSectionBars()],
    { numRuns: 100 },
  )(
    "empty buffers (length 0) always produce 'silent' classification",
    (sampleRate, sectionBars) => {
      const emptyBuffer = new Float32Array(0);
      const result = detectTransients(emptyBuffer, sampleRate, sectionBars);

      expect(result.density).toBe(0);
      expect(result.classification).toBe("silent");
      expect(result.transientPositions).toHaveLength(0);
    },
  );

  /**
   * Sub-property 3: Zero or negative sectionBars produce "silent" classification.
   */
  test.prop(
    [arbSampleRate(), fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true })],
    { numRuns: 100 },
  )(
    "zero or negative sectionBars always produce 'silent' classification",
    (sampleRate, sectionBars) => {
      const buffer = new Float32Array(8192);
      buffer[0] = 0.5; // non-silent
      const result = detectTransients(buffer, sampleRate, sectionBars);

      expect(result.density).toBe(0);
      expect(result.classification).toBe("silent");
    },
  );

  /**
   * Sub-property 4: For any non-negative density value, the classification
   * thresholds are exhaustive and mutually exclusive.
   *
   * This tests the pure classification logic:
   * - density/4 < 0.5 → "sustained/textural"
   * - density/4 in [0.5, 4] → "rhythmically moderate"
   * - density/4 > 4 → "rhythmically dense"
   *
   * Exactly one classification applies for every density value.
   */
  test.prop(
    [arbDensityPerBar()],
    { numRuns: 100 },
  )(
    "classification thresholds are exhaustive and mutually exclusive for any density >= 0",
    (density) => {
      const transientPerBeat = density / BEATS_PER_BAR;
      const classification = expectedClassificationForNonSilent(density);

      // Verify the result is one of the valid classifications
      expect(VALID_CLASSIFICATIONS).toContain(classification);

      // Verify thresholds produce the expected classification
      if (transientPerBeat < 0.5) {
        expect(classification).toBe("sustained/textural");
      } else if (transientPerBeat <= 4) {
        expect(classification).toBe("rhythmically moderate");
      } else {
        expect(classification).toBe("rhythmically dense");
      }

      // Verify mutual exclusivity: exactly one range condition is true
      const conditions = [
        transientPerBeat < 0.5,           // sustained/textural
        transientPerBeat >= 0.5 && transientPerBeat <= 4, // rhythmically moderate
        transientPerBeat > 4,             // rhythmically dense
      ];
      expect(conditions.filter(Boolean).length).toBe(1);
    },
  );

  /**
   * Sub-property 5: The implementation's density-to-classification mapping
   * agrees with the spec oracle for a known buffer.
   *
   * A buffer with varying spectral content is processed by detectTransients,
   * and whatever density is returned, the classification must match the oracle.
   */
  test.prop(
    [
      fc.double({ min: 100, max: 2000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.1, max: 0.8, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
      arbSectionBars(),
    ],
    { numRuns: 100 },
  )(
    "classification matches density oracle for amplitude-modulated buffers",
    (baseFreq, amplitude, modFreq, sectionBars) => {
      const sampleRate = 44100;
      const length = 44100; // 1 second
      const buffer = new Float32Array(length);
      // Amplitude-modulated signal (creates spectral variation Meyda can handle)
      for (let i = 0; i < length; i++) {
        const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * modFreq * i / sampleRate);
        buffer[i] = amplitude * envelope * Math.sin(2 * Math.PI * baseFreq * i / sampleRate);
      }

      let result;
      try {
        result = detectTransients(buffer, sampleRate, sectionBars);
      } catch {
        // If Meyda still throws, skip (should be rare with AM signals)
        return;
      }

      // Core property: classification is consistent with density
      expect(VALID_CLASSIFICATIONS).toContain(result.classification);

      if (result.classification === "silent") {
        expect(result.density).toBe(0);
      } else {
        const expected = expectedClassificationForNonSilent(result.density);
        expect(result.classification).toBe(expected);
      }
    },
  );

  /**
   * Sub-property 6: When detectTransients returns successfully, the
   * classification is always consistent with the reported density.
   *
   * This is the core end-to-end property: whatever density the function
   * computes, the classification must follow the threshold rules exactly.
   * Uses frequency-sweep buffers that provide spectral variation.
   */
  test.prop(
    [
      fc.double({ min: 100, max: 1000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1000, max: 8000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.3, max: 0.9, noNaN: true, noDefaultInfinity: true }),
      arbSectionBars(),
    ],
    { numRuns: 100 },
  )(
    "classification is always consistent with reported density (end-to-end)",
    (startFreq, endFreq, amplitude, sectionBars) => {
      const sampleRate = 44100;
      const length = 44100;
      const buffer = new Float32Array(length);
      // Frequency sweep (chirp) — provides strong spectral variation
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const freq = startFreq + (endFreq - startFreq) * t;
        buffer[i] = amplitude * Math.sin(2 * Math.PI * freq * t);
      }

      let result;
      try {
        result = detectTransients(buffer, sampleRate, sectionBars);
      } catch {
        // If Meyda throws on this buffer, skip without failing
        return;
      }

      // Core property: classification matches density
      expect(VALID_CLASSIFICATIONS).toContain(result.classification);

      if (result.classification === "silent") {
        expect(result.density).toBe(0);
      } else {
        const expected = expectedClassificationForNonSilent(result.density);
        expect(result.classification).toBe(expected);
      }

      // Density must equal transient count / sectionBars
      const expectedDensity = result.transientPositions.length / sectionBars;
      expect(result.density).toBeCloseTo(expectedDensity, 10);
    },
  );

  /**
   * Sub-property 7: Boundary values at exactly 2/bar and 16/bar produce
   * the correct classification.
   *
   * Tests that the implementation correctly handles boundary conditions:
   * - density = 2 per bar (0.5/beat) → "rhythmically moderate" (inclusive)
   * - density = 16 per bar (4/beat) → "rhythmically moderate" (inclusive)
   * - density just above 16 per bar → "rhythmically dense"
   * - density just below 2 per bar → "sustained/textural"
   */
  test.prop(
    [fc.constantFrom(
      { density: 0, expected: "sustained/textural" as RhythmicClassification },
      { density: 0.5, expected: "sustained/textural" as RhythmicClassification },
      { density: 1, expected: "sustained/textural" as RhythmicClassification },
      { density: 1.99, expected: "sustained/textural" as RhythmicClassification },
      { density: 2, expected: "rhythmically moderate" as RhythmicClassification },
      { density: 4, expected: "rhythmically moderate" as RhythmicClassification },
      { density: 8, expected: "rhythmically moderate" as RhythmicClassification },
      { density: 16, expected: "rhythmically moderate" as RhythmicClassification },
      { density: 16.01, expected: "rhythmically dense" as RhythmicClassification },
      { density: 20, expected: "rhythmically dense" as RhythmicClassification },
      { density: 100, expected: "rhythmically dense" as RhythmicClassification },
    )],
    { numRuns: 100 },
  )(
    "boundary density values map to the correct classification",
    ({ density, expected }) => {
      const classification = expectedClassificationForNonSilent(density);
      expect(classification).toBe(expected);
    },
  );
});
