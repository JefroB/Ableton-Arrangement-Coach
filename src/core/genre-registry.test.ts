import { describe, it, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import {
  GENRES,
  DEFAULT_WEIGHTS,
  getWeightsForGenre,
  getProfile,
  type EnergyWeights,
} from "./genre-registry.js";

describe("Genre Registry", () => {
  describe("GENRES array", () => {
    it("contains genre family IDs for all registered profiles", () => {
      expect(GENRES.length).toBeGreaterThanOrEqual(15);
      expect(GENRES).toContain("techno");
      expect(GENRES).toContain("house");
      expect(GENRES).toContain("trance");
      expect(GENRES).toContain("drum-and-bass");
      expect(GENRES).toContain("ambient-downtempo");
      expect(GENRES).toContain("pop-electronic");
    });
  });

  describe("DEFAULT_WEIGHTS", () => {
    it("matches documented values", () => {
      expect(DEFAULT_WEIGHTS.trackCountWeight).toBe(0.20);
      expect(DEFAULT_WEIGHTS.midiDensityWeight).toBe(0.25);
      expect(DEFAULT_WEIGHTS.trackPresenceWeight).toBe(0.15);
      expect(DEFAULT_WEIGHTS.automationWeight).toBe(0.00);
      expect(DEFAULT_WEIGHTS.frequencyCoverageWeight).toBe(0.10);
      expect(DEFAULT_WEIGHTS.velocityIntensityWeight).toBe(0.15);
      expect(DEFAULT_WEIGHTS.polyphonyScoreWeight).toBe(0.10);
      expect(DEFAULT_WEIGHTS.pitchRangeWeight).toBe(0.05);
    });

    it("sums to 1.0", () => {
      const sum =
        DEFAULT_WEIGHTS.trackCountWeight +
        DEFAULT_WEIGHTS.midiDensityWeight +
        DEFAULT_WEIGHTS.trackPresenceWeight +
        DEFAULT_WEIGHTS.automationWeight +
        DEFAULT_WEIGHTS.frequencyCoverageWeight +
        DEFAULT_WEIGHTS.velocityIntensityWeight +
        DEFAULT_WEIGHTS.polyphonyScoreWeight +
        DEFAULT_WEIGHTS.pitchRangeWeight;
      expect(sum).toBeCloseTo(1.0, 3);
    });
  });

  describe("getWeightsForGenre", () => {
    it("returns DEFAULT_WEIGHTS when genre is null", () => {
      expect(getWeightsForGenre(null)).toBe(DEFAULT_WEIGHTS);
    });

    it("returns DEFAULT_WEIGHTS for unknown genre string", () => {
      expect(getWeightsForGenre("Unknown")).toBe(DEFAULT_WEIGHTS);
      expect(getWeightsForGenre("")).toBe(DEFAULT_WEIGHTS);
      expect(getWeightsForGenre("Jazz")).toBe(DEFAULT_WEIGHTS);
    });

    it("returns the correct profile weights for a known genre", () => {
      for (const genreId of GENRES) {
        const weights = getWeightsForGenre(genreId);
        const profile = getProfile(genreId);
        expect(weights).toEqual(profile!.energyWeights);
      }
    });

    it("returns Techno-specific weights", () => {
      const weights = getWeightsForGenre("techno");
      expect(weights.trackCountWeight).toBe(0.10);
      expect(weights.midiDensityWeight).toBe(0.30);
      expect(weights.trackPresenceWeight).toBe(0.15);
      expect(weights.automationWeight).toBe(0.15);
      expect(weights.frequencyCoverageWeight).toBe(0.10);
      expect(weights.velocityIntensityWeight).toBe(0.10);
      expect(weights.polyphonyScoreWeight).toBe(0.05);
      expect(weights.pitchRangeWeight).toBe(0.05);
    });

    it("returns Drum and Bass-specific weights", () => {
      const weights = getWeightsForGenre("drum-and-bass");
      expect(weights.trackCountWeight).toBe(0.10);
      expect(weights.midiDensityWeight).toBe(0.25);
      expect(weights.trackPresenceWeight).toBe(0.20);
      expect(weights.automationWeight).toBe(0.10);
      expect(weights.frequencyCoverageWeight).toBe(0.15);
      expect(weights.velocityIntensityWeight).toBe(0.10);
      expect(weights.polyphonyScoreWeight).toBe(0.05);
      expect(weights.pitchRangeWeight).toBe(0.05);
    });
  });
});


// Feature: m2-section-analysis, Property 8: Genre weight validity
/**
 * **Validates: Requirements 11.1, 11.4**
 *
 * Property 8: Genre weight validity
 * For every genre defined in the Genre Registry (including the default weight profile),
 * each individual weight coefficient SHALL be in the range [0.0, 1.0], and the sum of
 * all five coefficients SHALL be within 1.0 ± 0.001.
 */
describe("Genre Registry — Property 8: Genre weight validity", () => {
  fcTest.prop(
    [fc.constantFrom(null, ...GENRES)],
    { numRuns: 100 }
  )(
    "every genre weight profile has coefficients in [0,1] summing to 1.0 ± 0.001",
    (genre) => {
      const weights: EnergyWeights = getWeightsForGenre(genre);

      const coefficients = [
        weights.trackCountWeight,
        weights.midiDensityWeight,
        weights.trackPresenceWeight,
        weights.automationWeight,
        weights.frequencyCoverageWeight,
        weights.velocityIntensityWeight,
        weights.polyphonyScoreWeight,
        weights.pitchRangeWeight,
      ];

      // Each coefficient must be in [0.0, 1.0]
      for (const coeff of coefficients) {
        expect(coeff).toBeGreaterThanOrEqual(0.0);
        expect(coeff).toBeLessThanOrEqual(1.0);
      }

      // Sum of all eight coefficients must be within 1.0 ± 0.001
      const sum = coefficients.reduce((acc, c) => acc + c, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
    }
  );
});
