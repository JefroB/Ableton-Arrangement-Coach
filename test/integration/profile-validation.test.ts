/**
 * Integration test — Profile Validation across all registered profiles.
 *
 * Runs `validateAllProfiles` against every registered profile in the genre
 * registry, verifying that all profiles and their resolved subgenres pass
 * validation without errors.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */
import { describe, it, expect } from "vitest";
import { validateProfile, validateAllProfiles } from "../../src/core/profile-validator.js";
import {
  ALL_PROFILES,
  getAllFamilies,
  getProfile,
  getProfileBySubgenre,
} from "../../src/core/genre-registry.js";

// ─── Integration Tests ─────────────────────────────────────────────────

describe("Profile Validation Integration", () => {
  describe("validateAllProfiles against the full registry", () => {
    it("should return zero errors for all registered profiles", () => {
      const errors = validateAllProfiles(ALL_PROFILES);

      if (errors.length > 0) {
        // Provide actionable output on failure
        const summary = errors
          .map((e) => `[${e.profileId}] ${e.fieldPath}: ${e.description}`)
          .join("\n");
        expect.fail(
          `Expected zero validation errors but found ${errors.length}:\n${summary}`,
        );
      }

      expect(errors).toHaveLength(0);
    });

    it("should validate all 28 genre families are registered", () => {
      const families = getAllFamilies();
      expect(families.length).toBe(28);
    });
  });

  describe("individual profile validation", () => {
    // Generate a test case for each registered profile
    for (const profile of ALL_PROFILES) {
      it(`${profile.name} (${profile.id}) passes validation`, () => {
        const errors = validateProfile(profile);

        if (errors.length > 0) {
          const summary = errors
            .map((e) => `  ${e.fieldPath}: ${e.description}`)
            .join("\n");
          expect.fail(
            `Profile "${profile.name}" has ${errors.length} validation error(s):\n${summary}`,
          );
        }

        expect(errors).toHaveLength(0);
      });
    }
  });

  describe("resolved subgenre validation", () => {
    // For each profile that has subgenres, resolve each and validate
    for (const profile of ALL_PROFILES) {
      if (!profile.subgenres || profile.subgenres.length === 0) continue;

      describe(`${profile.name} subgenres`, () => {
        for (const variant of profile.subgenres!) {
          it(`resolved subgenre "${variant.name}" (${variant.id}) passes validation`, () => {
            const resolved = getProfileBySubgenre(variant.id);
            expect(resolved).not.toBeNull();

            const errors = validateProfile(resolved!);

            if (errors.length > 0) {
              const summary = errors
                .map((e) => `  ${e.fieldPath}: ${e.description}`)
                .join("\n");
              expect.fail(
                `Resolved subgenre "${variant.name}" has ${errors.length} validation error(s):\n${summary}`,
              );
            }

            expect(errors).toHaveLength(0);
          });
        }
      });
    }
  });

  describe("registry consistency", () => {
    it("every family in getAllFamilies() is retrievable via getProfile()", () => {
      const families = getAllFamilies();

      for (const family of families) {
        const profile = getProfile(family.id);
        expect(profile).not.toBeNull();
        expect(profile!.id).toBe(family.id);
        expect(profile!.name).toBe(family.name);
      }
    });

    it("subgenre counts in getAllFamilies() match actual subgenre arrays", () => {
      const families = getAllFamilies();

      for (const family of families) {
        const profile = getProfile(family.id);
        expect(profile).not.toBeNull();
        const expectedCount = profile!.subgenres?.length ?? 0;
        expect(family.subgenreCount).toBe(expectedCount);
      }
    });

    it("every subgenre in every profile is retrievable via getProfileBySubgenre()", () => {
      for (const profile of ALL_PROFILES) {
        if (!profile.subgenres) continue;

        for (const variant of profile.subgenres) {
          const resolved = getProfileBySubgenre(variant.id);
          expect(resolved).not.toBeNull();
          expect(resolved!.id).toBe(variant.id);
          expect(resolved!.name).toBe(variant.name);
          expect(resolved!.family).toBe(profile.family);
        }
      }
    });
  });
});
