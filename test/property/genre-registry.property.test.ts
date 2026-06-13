/**
 * Property-based tests for Genre Registry (genre-data-externalization).
 *
 * Feature: genre-data-externalization, Property 8: Subgenre audio profile fallback to parent
 *
 * Verifies that subgenres without their own audioProfile field correctly
 * fall back to the parent family's audio profile via getGenreAudioProfile().
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { loadAllGenreData } from "../../src/core/genre-loader.js";
import {
  getGenreAudioProfile,
  getProfileBySubgenre,
} from "../../src/core/genre-registry.js";

// ─── Setup: Load genre data and identify subgenres ─────────────────────

const loaded = loadAllGenreData();

interface SubgenreFallbackCase {
  readonly subgenreId: string;
  /** The parent family ID as resolved by the registry's subgenre index. */
  readonly parentFamilyId: string;
  readonly hasOwnAudioProfile: boolean;
}

/**
 * Collect all unique subgenre IDs, resolving the parent via the registry's
 * getProfileBySubgenre (which uses the subgenreIndex — same index used by
 * getGenreAudioProfile's fallback logic).
 *
 * A subgenre has its own audioProfile if the audioProfiles map contains
 * an entry keyed by its subgenreId (set by the loader when the JSON
 * subgenre entry has an audioProfile field).
 *
 * Note: Some subgenre IDs appear in multiple genre families (e.g., "uk-garage"
 * in both house and uk-garage-grime). The registry's subgenreIndex maps each
 * ID to whichever family was indexed last. We use getProfileBySubgenre to
 * determine the actual resolved parent, matching the system's behavior.
 */
const allSubgenreCases: SubgenreFallbackCase[] = [];

// Collect all unique subgenre IDs from loaded profiles
const allSubgenreIds = new Set<string>();
for (const profile of loaded.profiles) {
  if (profile.subgenres) {
    for (const variant of profile.subgenres) {
      allSubgenreIds.add(variant.id);
    }
  }
}

// For each unique subgenre ID, resolve the actual parent via the registry
for (const subgenreId of allSubgenreIds) {
  const resolved = getProfileBySubgenre(subgenreId);
  if (resolved) {
    allSubgenreCases.push({
      subgenreId,
      parentFamilyId: resolved.family,
      hasOwnAudioProfile: loaded.audioProfiles.has(subgenreId),
    });
  }
}

/** Subgenres that do NOT have their own audioProfile (should fall back to parent). */
const subgenresWithoutOwnAudioProfile = allSubgenreCases.filter(
  (c) => !c.hasOwnAudioProfile,
);

/** Subgenres that DO have their own audioProfile (should return subgenre-specific). */
const subgenresWithOwnAudioProfile = allSubgenreCases.filter(
  (c) => c.hasOwnAudioProfile,
);

// ─── Property 8: Subgenre audio profile fallback to parent ─────────────

// Feature: genre-data-externalization, Property 8: Subgenre audio profile fallback to parent
describe("Property 8: Subgenre audio profile fallback to parent", () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any subgenre that does not define its own audioProfile field,
   * calling getGenreAudioProfile with that subgenre's ID SHALL return
   * the parent family's audio profile (not null).
   */

  // Since all 173 subgenres currently lack their own audioProfile, we iterate all of them.
  // fast-check's constantFrom will cycle through them with at least 100 iterations.
  test.prop(
    [fc.constantFrom(...subgenresWithoutOwnAudioProfile)],
    { numRuns: Math.max(100, subgenresWithoutOwnAudioProfile.length) },
  )(
    "getGenreAudioProfile(subgenreId) returns parent family audio profile when subgenre has no own audioProfile",
    (testCase) => {
      const subgenreResult = getGenreAudioProfile(testCase.subgenreId);
      const parentResult = getGenreAudioProfile(testCase.parentFamilyId);

      // The subgenre result must not be null
      expect(subgenreResult).not.toBeNull();

      // The parent result must not be null (all 28 families have audioProfile)
      expect(parentResult).not.toBeNull();

      // The subgenre's audio profile must deeply equal the parent family's audio profile
      expect(subgenreResult).toEqual(parentResult);
    },
  );

  test.prop(
    [fc.constantFrom(...allSubgenreCases)],
    { numRuns: Math.max(100, allSubgenreCases.length) },
  )(
    "getGenreAudioProfile(subgenreId) is never null for any valid subgenre ID",
    (testCase) => {
      const result = getGenreAudioProfile(testCase.subgenreId);
      expect(result).not.toBeNull();
    },
  );

  // Additional assertion: if a subgenre HAS its own audioProfile, it should
  // return the subgenre-specific one (not the parent's).
  if (subgenresWithOwnAudioProfile.length > 0) {
    test.prop(
      [fc.constantFrom(...subgenresWithOwnAudioProfile)],
      { numRuns: Math.max(100, subgenresWithOwnAudioProfile.length) },
    )(
      "getGenreAudioProfile(subgenreId) returns subgenre-specific profile when defined",
      (testCase) => {
        const subgenreResult = getGenreAudioProfile(testCase.subgenreId);
        const parentResult = getGenreAudioProfile(testCase.parentFamilyId);
        const subgenreSpecificProfile = loaded.audioProfiles.get(testCase.subgenreId);

        // Must return the subgenre-specific profile
        expect(subgenreResult).not.toBeNull();
        expect(subgenreResult).toEqual(subgenreSpecificProfile);

        // May or may not equal the parent (depends on actual values)
      },
    );
  }
});
