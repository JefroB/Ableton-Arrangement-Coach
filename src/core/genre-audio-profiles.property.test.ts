import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import {
  computeBandDeviation,
  getDeviationThreshold,
  isDrumDensityBelowExpectation,
  DEFAULT_DEVIATION_THRESHOLD_DB,
  RHYTHMIC_DEVIATION_THRESHOLD,
} from "./genre-registry.js";
import { generateGenreAwareFrequencyBalanceSuggestions } from "./content-suggestion-filter.js";
import type {
  AudioContentResults,
  AudioTrackSectionResult,
  SpectralProfile,
  FrequencyBandName,
} from "./audio-content-types.js";
import type { Section } from "./section-scanner.js";

// Feature: audio-content-analysis, Property 14: Genre deviation suggestion threshold

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal AudioContentResults with a single section and track.
 */
function buildAudioContentResults(
  sectionId: string,
  trackName: string,
  bands: Record<FrequencyBandName, number>,
  transientDensity: number,
  role: "drums" | "bass" | "vocal" | "synth_lead" | "synth_pad" | "full_mix" | "unclassified",
): AudioContentResults {
  const spectralProfile: SpectralProfile = {
    bands,
    meanCentroid: 1000,
    centroidPerWindow: [1000],
    meanSpectralFlux: 0.3,
  };

  const trackResult: AudioTrackSectionResult = {
    rmsDbfs: -12,
    normalizedEnergy: 0.8,
    spectralProfile,
    transientDensity,
    rhythmicClassification: "rhythmically moderate",
    role: { role, confidence: 0.9, nameOverridden: false },
  };

  const trackMap = new Map<string, AudioTrackSectionResult>([[trackName, trackResult]]);
  const perSection = new Map<string, ReadonlyMap<string, AudioTrackSectionResult>>([
    [sectionId, trackMap],
  ]);

  return {
    perSection,
    crossSection: new Map(),
    extendedRepetition: new Map(),
    failures: [],
  };
}

/**
 * Build a minimal section for testing.
 */
function buildSection(id: string, startTime: number, endTime: number): Section {
  return { id, name: `Section ${id}`, startTime, endTime };
}

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary for a measured energy in dBFS range [-96, 0]. */
const measuredEnergyArb = fc.double({ min: -96, max: 0, noNaN: true, noDefaultInfinity: true });

/** Arbitrary for an expected energy in dBFS range [-96, 0]. */
const expectedEnergyArb = fc.double({ min: -96, max: 0, noNaN: true, noDefaultInfinity: true });

/** Arbitrary for a threshold value > 0. */
const thresholdArb = fc.double({ min: 0.1, max: 30, noNaN: true, noDefaultInfinity: true });

/** Arbitrary for a measured drum density (transients per bar). */
const measuredDensityArb = fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true });

/** Arbitrary for an expected drum density > 0. */
const expectedDensityArb = fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true });

// ─── Property 14: Genre deviation suggestion threshold ─────────────────

/**
 * **Validates: Requirements 9.1, 9.2**
 *
 * Property 14: Genre deviation suggestion threshold
 * For any measured frequency band energy and genre-typical energy for that band,
 * the Suggestion Engine SHALL produce a suggestion if and only if the measured value
 * deviates by more than the genre-defined threshold from the profile. When no genre
 * context is available, no genre-specific suggestion is produced.
 */
describe("Genre Audio Profiles — Property 14: Genre deviation suggestion threshold", () => {
  // ─── Sub-property 1: computeBandDeviation returns 0 when deviation ≤ threshold ─

  fcTest.prop(
    [measuredEnergyArb, expectedEnergyArb, thresholdArb],
    { numRuns: 100 },
  )(
    "computeBandDeviation returns 0 when deviation is within threshold",
    (measured, expected, threshold) => {
      const deviation = expected - measured;

      // Only test cases where deviation ≤ threshold (within acceptable range)
      fc.pre(deviation <= threshold);

      const result = computeBandDeviation(measured, expected, threshold);
      expect(result).toBe(0);
    },
  );

  // ─── Sub-property 2: computeBandDeviation returns deviation when it exceeds threshold ─

  fcTest.prop(
    [measuredEnergyArb, expectedEnergyArb, thresholdArb],
    { numRuns: 100 },
  )(
    "computeBandDeviation returns deviation amount when deviation exceeds threshold",
    (measured, expected, threshold) => {
      const deviation = expected - measured;

      // Only test cases where deviation > threshold
      fc.pre(deviation > threshold);

      const result = computeBandDeviation(measured, expected, threshold);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(deviation, 10);
    },
  );

  // ─── Sub-property 3: isDrumDensityBelowExpectation returns true when < expected * 0.7 ─

  fcTest.prop(
    [measuredDensityArb, expectedDensityArb],
    { numRuns: 100 },
  )(
    "isDrumDensityBelowExpectation returns true when measured < expected * 0.7",
    (measured, expected) => {
      const threshold = expected * (1 - RHYTHMIC_DEVIATION_THRESHOLD);

      // Only test cases where measured is below the threshold
      fc.pre(measured < threshold);

      const result = isDrumDensityBelowExpectation(measured, expected);
      expect(result).toBe(true);
    },
  );

  // ─── Sub-property 4: isDrumDensityBelowExpectation returns false when >= expected * 0.7 ─

  fcTest.prop(
    [measuredDensityArb, expectedDensityArb],
    { numRuns: 100 },
  )(
    "isDrumDensityBelowExpectation returns false when measured >= expected * 0.7",
    (measured, expected) => {
      const threshold = expected * (1 - RHYTHMIC_DEVIATION_THRESHOLD);

      // Only test cases where measured is at or above the threshold
      fc.pre(measured >= threshold);

      const result = isDrumDensityBelowExpectation(measured, expected);
      expect(result).toBe(false);
    },
  );

  // ─── Sub-property 5: No genre-specific suggestions when genreId is null ─

  fcTest.prop(
    [
      measuredEnergyArb,
      measuredEnergyArb,
      measuredEnergyArb,
      measuredEnergyArb,
      measuredEnergyArb,
      measuredEnergyArb,
    ],
    { numRuns: 100 },
  )(
    "generateGenreAwareFrequencyBalanceSuggestions produces no genre-specific suggestions when genreId is null",
    (subBass, bass, lowMid, mid, highMid, high) => {
      const sectionId = "section-0";
      const section = buildSection(sectionId, 0, 16);

      const audioContent = buildAudioContentResults(
        sectionId,
        "Test Audio",
        { subBass, bass, lowMid, mid, highMid, high },
        12,
        "drums",
      );

      const suggestions = generateGenreAwareFrequencyBalanceSuggestions(
        audioContent,
        null,
        [section],
        null, // No genre context
      );

      // When genreId is null, no genre-specific suggestions should be produced.
      // Genre-specific issue types follow the pattern "freq-balance:<band>-low" (without "-agnostic" suffix).
      const genreSpecificSuggestions = suggestions.filter(
        (s) =>
          s.issueType.startsWith("freq-balance:") &&
          !s.issueType.endsWith("-agnostic"),
      );
      expect(genreSpecificSuggestions).toHaveLength(0);
    },
  );
});
