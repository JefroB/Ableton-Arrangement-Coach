/**
 * Property-based tests for subgenre resolution.
 *
 * Feature: m6-genre-infrastructure
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { ALL_PROFILES, getProfile, getProfileBySubgenre, getAllFamilies } from "../../src/core/genre-registry.js";
import { validateProfile } from "../../src/core/profile-validator.js";
import type { GenreProfile, SubgenreVariant } from "../../src/core/genre-profile-types.js";

// ─── Test Data Collection ──────────────────────────────────────────────

/**
 * Collect all (parent, variant) pairs from the registry for property testing.
 * We enumerate all registered profiles that have subgenres.
 */
interface SubgenreTestCase {
  readonly parent: GenreProfile;
  readonly variant: SubgenreVariant;
}

const allSubgenreCases: SubgenreTestCase[] = [];
for (const profile of ALL_PROFILES) {
  if (profile.subgenres && profile.subgenres.length > 0) {
    for (const variant of profile.subgenres) {
      allSubgenreCases.push({ parent: profile, variant });
    }
  }
}

// Fields that can be overridden in a SubgenreVariant
const overridableFields = [
  "tempoRange",
  "structure",
  "energyCurveTemplate",
  "transitions",
  "energyWeights",
  "detectionRules",
  "detectionThresholds",
] as const;

// ─── Property 4: Subgenre resolution merge correctness ─────────────────

// Feature: m6-genre-infrastructure, Property 4: Subgenre resolution merge correctness
describe("Property 4: Subgenre resolution merge correctness", () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4**
   *
   * For any SubgenreVariant resolved against its parent GenreProfile,
   * the resulting profile SHALL:
   * (a) use the variant's `id` and `name`
   * (b) retain the parent's `family`
   * (c) for each field the variant specifies, use the variant's value exactly (no deep merge)
   * (d) for each field the variant does not specify, use the parent's value unchanged
   */
  test.prop([fc.constantFrom(...allSubgenreCases)], { numRuns: 100 })(
    "resolved subgenre uses variant id/name, parent family, and shallow-merges override fields",
    (testCase) => {
      const { parent, variant } = testCase;
      const resolved = getProfileBySubgenre(variant.id);

      // Resolution must succeed
      expect(resolved).not.toBeNull();
      const profile = resolved!;

      // (a) Uses the variant's id and name
      expect(profile.id).toBe(variant.id);
      expect(profile.name).toBe(variant.name);

      // (b) Retains the parent's family
      expect(profile.family).toBe(parent.family);

      // (c) For each field the variant specifies, use the variant's value exactly
      for (const field of overridableFields) {
        if (variant[field] !== undefined) {
          expect(profile[field]).toEqual(variant[field]);
        }
      }

      // (d) For each field the variant does not specify, use the parent's value unchanged
      for (const field of overridableFields) {
        if (variant[field] === undefined) {
          expect(profile[field]).toEqual(parent[field]);
        }
      }
    },
  );
});

// ─── Property 5: Resolved subgenres pass validation ────────────────────

// Feature: m6-genre-infrastructure, Property 5: Resolved subgenres pass validation
describe("Property 5: Resolved subgenres pass validation", () => {
  /**
   * **Validates: Requirements 3.7, 8.5**
   *
   * For any registered subgenre variant, resolving it via `getProfileBySubgenre`
   * and running `validateProfile` on the result SHALL return an empty array of errors.
   */
  test.prop([fc.constantFrom(...allSubgenreCases)], { numRuns: 100 })(
    "every resolved subgenre passes profile validation with zero errors",
    (testCase) => {
      const { variant } = testCase;
      const resolved = getProfileBySubgenre(variant.id);

      // Resolution must succeed
      expect(resolved).not.toBeNull();
      const profile = resolved!;

      // Validate the resolved profile
      const errors = validateProfile(profile);

      // Should have no validation errors
      expect(errors).toEqual([]);
    },
  );
});
