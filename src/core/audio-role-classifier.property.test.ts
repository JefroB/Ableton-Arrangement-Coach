/**
 * Property-based tests for audio-role-classifier.ts
 *
 * Feature: audio-content-analysis, Property 9: Audio role classification always produces a valid role
 *
 * Validates: Requirements 6.1, 6.9, 6.10
 *
 * For any valid SpectralProfile, transient density (≥ 0), track name (any string),
 * and clip length (> 0 bars), classifyAudioRole SHALL return one of the seven defined
 * AudioInstrumentRole values. When clip length < 1 bar, the result SHALL be "unclassified".
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { classifyAudioRole } from "./audio-role-classifier.js";
import type {
  AudioInstrumentRole,
  FrequencyBandName,
  SpectralProfile,
} from "./audio-content-types.js";

// ─── Constants ──────────────────────────────────────────────────────────

/** All valid AudioInstrumentRole values. */
const VALID_ROLES: AudioInstrumentRole[] = [
  "drums",
  "bass",
  "vocal",
  "synth_lead",
  "synth_pad",
  "full_mix",
  "unclassified",
];

/** All frequency band names. */
const ALL_BAND_NAMES: FrequencyBandName[] = [
  "subBass",
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "high",
];

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/**
 * Generate a valid band energy value in dBFS range [-96, 0].
 */
function arbBandEnergy(): fc.Arbitrary<number> {
  return fc.double({ min: -96, max: 0, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate a valid Record of 6 FrequencyBandName → number in [-96, 0].
 */
function arbBands(): fc.Arbitrary<Readonly<Record<FrequencyBandName, number>>> {
  return fc
    .tuple(
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
    )
    .map(([subBass, bass, lowMid, mid, highMid, high]) => ({
      subBass,
      bass,
      lowMid,
      mid,
      highMid,
      high,
    }));
}

/**
 * Generate a mean centroid value in [0, 22050] Hz.
 */
function arbMeanCentroid(): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: 22050, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate an array of per-window centroid values in [0, 22050] Hz.
 */
function arbCentroidPerWindow(): fc.Arbitrary<readonly number[]> {
  return fc.array(
    fc.double({ min: 0, max: 22050, noNaN: true, noDefaultInfinity: true }),
    { minLength: 0, maxLength: 50 },
  );
}

/**
 * Generate a mean spectral flux value in [0, 1].
 */
function arbMeanSpectralFlux(): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate a valid SpectralProfile with arbitrary but valid values.
 */
function arbSpectralProfile(): fc.Arbitrary<SpectralProfile> {
  return fc
    .tuple(arbBands(), arbMeanCentroid(), arbCentroidPerWindow(), arbMeanSpectralFlux())
    .map(([bands, meanCentroid, centroidPerWindow, meanSpectralFlux]) => ({
      bands,
      meanCentroid,
      centroidPerWindow,
      meanSpectralFlux,
    }));
}

/**
 * Generate a non-negative transient density value (≥ 0).
 */
function arbTransientDensity(): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate an arbitrary track name (any string).
 */
function arbTrackName(): fc.Arbitrary<string> {
  return fc.oneof(
    // Random strings
    fc.string({ minLength: 0, maxLength: 50 }),
    // Names that might trigger override logic
    fc.constantFrom(
      "Bass",
      "Sub Bass",
      "my bass track",
      "Vocal",
      "Vox dry",
      "Lead Vocal",
      "Drum Loop",
      "drums",
      "Pad",
      "Synth Pad",
      "Piano",
      "Guitar",
      "Main Mix",
      "",
      "Track 1",
      "Audio 3",
    ),
  );
}

/**
 * Generate a clip length in bars (> 0).
 */
function arbClipLengthBarsPositive(): fc.Arbitrary<number> {
  return fc.double({ min: 0.001, max: 128, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate a clip length that is < 1 bar (triggers "unclassified").
 */
function arbClipLengthBarsShort(): fc.Arbitrary<number> {
  return fc.double({ min: 0.001, max: 0.999, noNaN: true, noDefaultInfinity: true });
}

// ─── Property 9: Audio role classification always produces a valid role ──

// Feature: audio-content-analysis, Property 9: Audio role classification always produces a valid role
describe("Property 9: Audio role classification always produces a valid role", () => {
  /**
   * Sub-property 1: For any valid input, the returned role is one of the
   * seven defined AudioInstrumentRole values.
   *
   * Validates: Requirement 6.1
   */
  test.prop(
    [arbSpectralProfile(), arbTransientDensity(), arbTrackName(), arbClipLengthBarsPositive()],
    { numRuns: 100 },
  )(
    "for any valid input, the returned role is one of the seven defined AudioInstrumentRole values",
    (profile, transientDensity, trackName, clipLengthBars) => {
      const result = classifyAudioRole(profile, transientDensity, trackName, clipLengthBars);

      expect(VALID_ROLES).toContain(result.role);
    },
  );

  /**
   * Sub-property 2: When clipLengthBars < 1, the result is always "unclassified".
   *
   * Validates: Requirement 6.10
   */
  test.prop(
    [arbSpectralProfile(), arbTransientDensity(), arbTrackName(), arbClipLengthBarsShort()],
    { numRuns: 100 },
  )(
    "when clipLengthBars < 1, the result is always 'unclassified'",
    (profile, transientDensity, trackName, clipLengthBars) => {
      const result = classifyAudioRole(profile, transientDensity, trackName, clipLengthBars);

      expect(result.role).toBe("unclassified");
    },
  );

  /**
   * Sub-property 3: confidence is always in [0, 1].
   *
   * Validates: Requirement 6.9 (classification produces well-formed output)
   */
  test.prop(
    [arbSpectralProfile(), arbTransientDensity(), arbTrackName(), arbClipLengthBarsPositive()],
    { numRuns: 100 },
  )(
    "confidence is always in [0, 1]",
    (profile, transientDensity, trackName, clipLengthBars) => {
      const result = classifyAudioRole(profile, transientDensity, trackName, clipLengthBars);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    },
  );

  /**
   * Sub-property 4: nameOverridden is always a boolean.
   *
   * Validates: Requirement 6.11 (name override flag is always present)
   */
  test.prop(
    [arbSpectralProfile(), arbTransientDensity(), arbTrackName(), arbClipLengthBarsPositive()],
    { numRuns: 100 },
  )(
    "nameOverridden is always a boolean",
    (profile, transientDensity, trackName, clipLengthBars) => {
      const result = classifyAudioRole(profile, transientDensity, trackName, clipLengthBars);

      expect(typeof result.nameOverridden).toBe("boolean");
    },
  );
});
