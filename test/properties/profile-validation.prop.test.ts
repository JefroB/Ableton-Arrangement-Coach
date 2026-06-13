/**
 * Property-based tests for Profile Validation.
 *
 * Feature: m6-genre-infrastructure
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { ALL_PROFILES, getProfile, getProfileBySubgenre } from "../../src/core/genre-registry.js";
import { validateProfile } from "../../src/core/profile-validator.js";
import type { GenreProfile, EnergyWeights } from "../../src/core/genre-profile-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Collects all profile IDs (family IDs) from the registry.
 */
function getAllFamilyIds(): string[] {
  return ALL_PROFILES.map((p) => p.id);
}

/**
 * Collects all subgenre IDs from all registered profiles.
 */
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

/**
 * Collects all resolvable profiles: family profiles + resolved subgenre profiles.
 */
function getAllResolvableProfiles(): GenreProfile[] {
  const profiles: GenreProfile[] = [];

  for (const familyId of getAllFamilyIds()) {
    const profile = getProfile(familyId);
    if (profile) profiles.push(profile);
  }

  for (const subgenreId of getAllSubgenreIds()) {
    const resolved = getProfileBySubgenre(subgenreId);
    if (resolved) profiles.push(resolved);
  }

  return profiles;
}

const allFamilyIds = getAllFamilyIds();
const allSubgenreIds = getAllSubgenreIds();
const allResolvableProfiles = getAllResolvableProfiles();

// ─── Generators ────────────────────────────────────────────────────────

/** Picks a random profile from the ALL_PROFILES array. */
const profileArb = fc.constantFrom(...ALL_PROFILES);

/** Picks a random profile ID (family or subgenre) and resolves it. */
const resolvedProfileArb = fc.constantFrom(...allResolvableProfiles);

// ─── Property 1: Profile JSON round-trip ───────────────────────────────

// Feature: m6-genre-infrastructure, Property 1: Profile JSON round-trip
describe("Property 1: Profile JSON round-trip", () => {
  /**
   * **Validates: Requirements 8.8**
   *
   * For any valid GenreProfile object (from the registry), serializing to JSON
   * and deserializing back SHALL produce a deep-equal object.
   */
  test.prop([profileArb], { numRuns: 100 })(
    "serializing a registered profile to JSON and parsing it back produces a deep-equal object",
    (profile) => {
      const serialized = JSON.stringify(profile);
      const deserialized = JSON.parse(serialized) as GenreProfile;

      expect(deserialized).toEqual(profile);
    },
  );
});

// ─── Property 2: Valid profiles pass validation ────────────────────────

// Feature: m6-genre-infrastructure, Property 2: Valid profiles pass validation
describe("Property 2: Valid profiles pass validation", () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**
   *
   * For any registered GenreProfile (loaded from the registry via getProfile
   * or resolved via getProfileBySubgenre), running validateProfile SHALL
   * return an empty array.
   */
  test.prop([resolvedProfileArb], { numRuns: 100 })(
    "any registered or resolved profile passes validation with no errors",
    (profile) => {
      const errors = validateProfile(profile);

      if (errors.length > 0) {
        // Provide descriptive failure message
        const errorDescriptions = errors
          .map((e) => `  [${e.profileId}] ${e.fieldPath}: ${e.description}`)
          .join("\n");
        expect.fail(
          `Profile "${profile.id}" has ${errors.length} validation error(s):\n${errorDescriptions}`,
        );
      }

      expect(errors).toEqual([]);
    },
  );
});

// ─── Property 3: EnergyWeights sum invariant ───────────────────────────

// Feature: m6-genre-infrastructure, Property 3: EnergyWeights sum invariant
describe("Property 3: EnergyWeights sum invariant", () => {
  /**
   * **Validates: Requirements 1.8, 8.2**
   *
   * For any registered GenreProfile or resolved subgenre profile, the five
   * energyWeights coefficients SHALL each be in [0.0, 1.0] and sum to 1.0
   * ± 0.001.
   */
  test.prop([resolvedProfileArb], { numRuns: 100 })(
    "energyWeights coefficients are each in [0, 1] and sum to 1.0 ± 0.001",
    (profile) => {
      const w: EnergyWeights = profile.energyWeights;

      // Each coefficient must be in [0.0, 1.0]
      expect(w.trackCountWeight).toBeGreaterThanOrEqual(0);
      expect(w.trackCountWeight).toBeLessThanOrEqual(1.0);

      expect(w.midiDensityWeight).toBeGreaterThanOrEqual(0);
      expect(w.midiDensityWeight).toBeLessThanOrEqual(1.0);

      expect(w.trackPresenceWeight).toBeGreaterThanOrEqual(0);
      expect(w.trackPresenceWeight).toBeLessThanOrEqual(1.0);

      expect(w.automationWeight).toBeGreaterThanOrEqual(0);
      expect(w.automationWeight).toBeLessThanOrEqual(1.0);

      expect(w.frequencyCoverageWeight).toBeGreaterThanOrEqual(0);
      expect(w.frequencyCoverageWeight).toBeLessThanOrEqual(1.0);

      expect(w.velocityIntensityWeight).toBeGreaterThanOrEqual(0);
      expect(w.velocityIntensityWeight).toBeLessThanOrEqual(1.0);

      expect(w.polyphonyScoreWeight).toBeGreaterThanOrEqual(0);
      expect(w.polyphonyScoreWeight).toBeLessThanOrEqual(1.0);

      expect(w.pitchRangeWeight).toBeGreaterThanOrEqual(0);
      expect(w.pitchRangeWeight).toBeLessThanOrEqual(1.0);

      // Sum must be 1.0 ± 0.001
      const sum =
        w.trackCountWeight +
        w.midiDensityWeight +
        w.trackPresenceWeight +
        w.automationWeight +
        w.frequencyCoverageWeight +
        w.velocityIntensityWeight +
        w.polyphonyScoreWeight +
        w.pitchRangeWeight;

      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
    },
  );
});
