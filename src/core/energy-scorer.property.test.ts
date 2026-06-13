import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import {
  GENRES,
  DEFAULT_WEIGHTS,
  DEFAULT_WEIGHTS_WITH_ALS,
  getWeightsForGenre,
  getProfileBySubgenre,
  ALL_PROFILES,
  type EnergyWeights,
} from "./genre-registry.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/** Sum all weight fields in an EnergyWeights instance. */
function sumWeights(weights: EnergyWeights): number {
  return (
    weights.trackCountWeight +
    weights.midiDensityWeight +
    weights.trackPresenceWeight +
    weights.automationWeight +
    weights.frequencyCoverageWeight +
    weights.velocityIntensityWeight +
    weights.polyphonyScoreWeight +
    weights.pitchRangeWeight
  );
}

/** Collect all subgenre IDs from all profiles. */
function getAllSubgenreIds(): string[] {
  const ids: string[] = [];
  for (const profile of ALL_PROFILES) {
    if (profile.subgenres) {
      for (const sub of profile.subgenres) {
        ids.push(sub.id);
      }
    }
  }
  return ids;
}

const ALL_SUBGENRE_IDS = getAllSubgenreIds();

// ─── Property 15: Energy weights sum to 1.0 ───────────────────────────

/**
 * **Validates: Requirements 12.5**
 *
 * Property 15: Energy weights sum to 1.0
 * For any EnergyWeights instance (whether the default profile, a genre-specific
 * profile, or either the "no .als" or "with .als" variant), the sum of all
 * weight fields SHALL equal 1.0 (±0.001).
 */
describe("Energy Scorer — Property 15: Energy weights sum to 1.0", () => {
  // Build the full set of genre IDs to test: all families + all subgenres + null (defaults)
  const allGenreIds: (string | null)[] = [null, ...GENRES, ...ALL_SUBGENRE_IDS];

  fcTest.prop(
    [fc.constantFrom(...allGenreIds)],
    { numRuns: Math.max(100, allGenreIds.length * 2) },
  )(
    "every genre profile (families + subgenres) has weights summing to 1.0 ± 0.001",
    (genreId) => {
      const weights = getWeightsForGenre(genreId);
      const sum = sumWeights(weights);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
    },
  );

  fcTest.prop(
    [fc.constantFrom(...allGenreIds)],
    { numRuns: Math.max(100, allGenreIds.length * 2) },
  )(
    "every genre profile with .als data has weights summing to 1.0 ± 0.001",
    (genreId) => {
      const weights = getWeightsForGenre(genreId, true);
      const sum = sumWeights(weights);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
    },
  );

  fcTest.prop(
    [fc.constant(null)],
    { numRuns: 100 },
  )(
    "DEFAULT_WEIGHTS sum to 1.0 ± 0.001",
    () => {
      const sum = sumWeights(DEFAULT_WEIGHTS);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
    },
  );

  fcTest.prop(
    [fc.constant(null)],
    { numRuns: 100 },
  )(
    "DEFAULT_WEIGHTS_WITH_ALS sum to 1.0 ± 0.001",
    () => {
      const sum = sumWeights(DEFAULT_WEIGHTS_WITH_ALS);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
    },
  );
});
