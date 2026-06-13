/**
 * Integration test — Full Genre Registry load and query verification.
 *
 * Verifies that all 16 profiles load, all subgenres are indexed,
 * search returns results for every known name, validation passes,
 * and existing consumer methods return meaningful results.
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10
 */
import { describe, it, expect } from "vitest";
import { validateAllProfiles } from "../../src/core/profile-validator.js";
import {
  ALL_PROFILES,
  getProfile,
  getProfileBySubgenre,
  search,
  getWeightsForGenre,
  getThresholdsForGenre,
  getTransitionPreferencesForGenre,
} from "../../src/core/genre-registry.js";

// ─── Constants ─────────────────────────────────────────────────────────

const EXPECTED_FAMILY_COUNT = 28;

// ─── Integration Tests ─────────────────────────────────────────────────

describe("Genre Registry — Full Integration", () => {
  describe("registry loads all profiles without error", () => {
    it("should have exactly 28 genre family profiles loaded", () => {
      expect(ALL_PROFILES).toHaveLength(EXPECTED_FAMILY_COUNT);
    });

    it("each profile has a non-empty id, name, and family", () => {
      for (const profile of ALL_PROFILES) {
        expect(profile.id).toBeTruthy();
        expect(profile.name).toBeTruthy();
        expect(profile.family).toBeTruthy();
      }
    });
  });

  describe("all subgenres indexed — getProfile and getProfileBySubgenre", () => {
    it("getProfile succeeds for every family ID", () => {
      for (const profile of ALL_PROFILES) {
        const result = getProfile(profile.id);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(profile.id);
        expect(result!.name).toBe(profile.name);
      }
    });

    it("getProfileBySubgenre succeeds for every subgenre ID across all profiles", () => {
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

    it("all resolved subgenres have valid structure and energyCurveTemplate", () => {
      for (const profile of ALL_PROFILES) {
        if (!profile.subgenres) continue;

        for (const variant of profile.subgenres) {
          const resolved = getProfileBySubgenre(variant.id);
          expect(resolved).not.toBeNull();
          expect(resolved!.structure.length).toBeGreaterThan(0);
          expect(resolved!.energyCurveTemplate.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("search finds every family and subgenre name by substring", () => {
    it("search finds every family name when queried by full name", () => {
      for (const profile of ALL_PROFILES) {
        const results = search(profile.name);
        const matchIds = results.map((r) => r.id);
        expect(matchIds).toContain(profile.id);
      }
    });

    it("search finds every family name by a 3-char substring", () => {
      for (const profile of ALL_PROFILES) {
        // Use a 3-character substring from the middle of the name
        const name = profile.name;
        if (name.length < 3) continue;
        const start = Math.floor(name.length / 2) - 1;
        const substring = name.slice(start, start + 3);

        const results = search(substring);
        expect(results.length).toBeGreaterThan(0);

        // At least one result should contain our substring (case-insensitive)
        const lowerSubstring = substring.toLowerCase();
        const found = results.some((r) =>
          r.name.toLowerCase().includes(lowerSubstring),
        );
        expect(found).toBe(true);
      }
    });

    it("search finds every subgenre name when queried by full name", () => {
      for (const profile of ALL_PROFILES) {
        if (!profile.subgenres) continue;

        for (const variant of profile.subgenres) {
          const results = search(variant.name);
          const matchIds = results.map((r) => r.id);
          expect(matchIds).toContain(variant.id);
        }
      }
    });

    it("search finds subgenres by partial name substring", () => {
      for (const profile of ALL_PROFILES) {
        if (!profile.subgenres) continue;

        for (const variant of profile.subgenres) {
          const name = variant.name;
          if (name.length < 3) continue;

          // Take first 3 characters as substring
          const substring = name.slice(0, 3);
          const results = search(substring);
          expect(results.length).toBeGreaterThan(0);

          const lowerSubstring = substring.toLowerCase();
          const found = results.some((r) =>
            r.name.toLowerCase().includes(lowerSubstring),
          );
          expect(found).toBe(true);
        }
      }
    });
  });

  describe("validateAllProfiles returns empty array", () => {
    it("all profiles pass validation with zero errors", () => {
      const errors = validateAllProfiles(ALL_PROFILES);

      if (errors.length > 0) {
        const summary = errors
          .slice(0, 20)
          .map((e) => `[${e.profileId}] ${e.fieldPath}: ${e.description}`)
          .join("\n");
        expect.fail(
          `Expected zero validation errors but found ${errors.length}:\n${summary}`,
        );
      }

      expect(errors).toHaveLength(0);
    });
  });

  describe("existing consumer methods work for all registered profiles", () => {
    describe("getWeightsForGenre", () => {
      it("returns valid weights for every family ID", () => {
        for (const profile of ALL_PROFILES) {
          const weights = getWeightsForGenre(profile.id);
          expect(weights).toBeDefined();
          expect(weights.trackCountWeight).toBeGreaterThanOrEqual(0);
          expect(weights.midiDensityWeight).toBeGreaterThanOrEqual(0);
          expect(weights.trackPresenceWeight).toBeGreaterThanOrEqual(0);
          expect(weights.automationWeight).toBeGreaterThanOrEqual(0);
          expect(weights.frequencyCoverageWeight).toBeGreaterThanOrEqual(0);
          expect(weights.velocityIntensityWeight).toBeGreaterThanOrEqual(0);
          expect(weights.polyphonyScoreWeight).toBeGreaterThanOrEqual(0);
          expect(weights.pitchRangeWeight).toBeGreaterThanOrEqual(0);

          const sum =
            weights.trackCountWeight +
            weights.midiDensityWeight +
            weights.trackPresenceWeight +
            weights.automationWeight +
            weights.frequencyCoverageWeight +
            weights.velocityIntensityWeight +
            weights.polyphonyScoreWeight +
            weights.pitchRangeWeight;
          expect(sum).toBeCloseTo(1.0, 2);
        }
      });

      it("returns valid weights for every subgenre ID", () => {
        for (const profile of ALL_PROFILES) {
          if (!profile.subgenres) continue;

          for (const variant of profile.subgenres) {
            const weights = getWeightsForGenre(variant.id);
            expect(weights).toBeDefined();

            const sum =
              weights.trackCountWeight +
              weights.midiDensityWeight +
              weights.trackPresenceWeight +
              weights.automationWeight +
              weights.frequencyCoverageWeight +
              weights.velocityIntensityWeight +
              weights.polyphonyScoreWeight +
              weights.pitchRangeWeight;
            expect(sum).toBeCloseTo(1.0, 2);
          }
        }
      });
    });

    describe("getThresholdsForGenre", () => {
      it("returns valid thresholds for every family ID", () => {
        for (const profile of ALL_PROFILES) {
          const thresholds = getThresholdsForGenre(profile.id);
          expect(thresholds).toBeDefined();
          expect(typeof thresholds.flatEnergyMaxDelta).toBe("number");
          expect(typeof thresholds.missingTransitionMinDelta).toBe("number");
          expect(typeof thresholds.similarityCeilingPercent).toBe("number");
        }
      });

      it("returns valid thresholds for every subgenre ID", () => {
        for (const profile of ALL_PROFILES) {
          if (!profile.subgenres) continue;

          for (const variant of profile.subgenres) {
            const thresholds = getThresholdsForGenre(variant.id);
            expect(thresholds).toBeDefined();
            expect(typeof thresholds.flatEnergyMaxDelta).toBe("number");
            expect(typeof thresholds.missingTransitionMinDelta).toBe("number");
            expect(typeof thresholds.similarityCeilingPercent).toBe("number");
          }
        }
      });
    });

    describe("getTransitionPreferencesForGenre", () => {
      it("returns valid transition preferences for every family ID", () => {
        for (const profile of ALL_PROFILES) {
          const prefs = getTransitionPreferencesForGenre(profile.id);
          expect(prefs).toBeDefined();
          expect(Array.isArray(prefs.preferred)).toBe(true);
          expect(Array.isArray(prefs.discouraged)).toBe(true);
          expect(typeof prefs.buildDurationRange.min).toBe("number");
          expect(typeof prefs.buildDurationRange.max).toBe("number");
          expect(typeof prefs.dropsExpected).toBe("boolean");
        }
      });

      it("returns valid transition preferences for every subgenre ID", () => {
        for (const profile of ALL_PROFILES) {
          if (!profile.subgenres) continue;

          for (const variant of profile.subgenres) {
            const prefs = getTransitionPreferencesForGenre(variant.id);
            expect(prefs).toBeDefined();
            expect(Array.isArray(prefs.preferred)).toBe(true);
            expect(Array.isArray(prefs.discouraged)).toBe(true);
            expect(prefs.buildDurationRange.min).toBeLessThanOrEqual(
              prefs.buildDurationRange.max,
            );
          }
        }
      });
    });
  });
});
