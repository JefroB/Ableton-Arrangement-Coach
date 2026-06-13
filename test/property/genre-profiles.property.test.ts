/**
 * Property-based tests for Genre Profiles (M6-B).
 *
 * Feature: m6-genre-profiles
 *
 * Verifies cross-cutting invariants across all 15+ registered genre profiles
 * and their subgenre variants.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateProfile } from "../../src/core/profile-validator.js";
import {
  ALL_PROFILES,
  getProfile,
  getProfileBySubgenre,
  search,
} from "../../src/core/genre-registry.js";
import type {
  GenreProfile,
  SubgenreVariant,
  EnergyWeights,
} from "../../src/core/genre-profile-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Collect all (parent, variant) pairs from all profiles.
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

/**
 * Collect all resolvable profiles (families + resolved subgenres).
 */
function getAllResolvableProfiles(): GenreProfile[] {
  const profiles: GenreProfile[] = [];
  for (const profile of ALL_PROFILES) {
    profiles.push(profile);
    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        const resolved = getProfileBySubgenre(variant.id);
        if (resolved) profiles.push(resolved);
      }
    }
  }
  return profiles;
}

const allResolvableProfiles = getAllResolvableProfiles();

/**
 * Collect all searchable names from the registry.
 */
function getAllSearchableNames(): Array<{ name: string; id: string }> {
  const entries: Array<{ name: string; id: string }> = [];
  for (const profile of ALL_PROFILES) {
    entries.push({ name: profile.name, id: profile.id });
    if (profile.subgenres) {
      for (const sub of profile.subgenres) {
        entries.push({ name: sub.name, id: sub.id });
      }
    }
  }
  return entries;
}

const allSearchableNames = getAllSearchableNames();

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

// ─── Generators ────────────────────────────────────────────────────────

const profileArb = fc.constantFrom(...ALL_PROFILES);
const resolvedProfileArb = fc.constantFrom(...allResolvableProfiles);
const subgenreCaseArb = fc.constantFrom(...allSubgenreCases);
const searchableNameArb = fc.constantFrom(...allSearchableNames);


// ─── Property 1: All registered profiles pass validation ───────────────

// Feature: m6-genre-profiles, Property 1: All registered profiles pass validation
describe("Property 1: All registered profiles pass validation", () => {
  /**
   * **Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2, 9.2, 10.2, 11.2, 12.2, 13.2, 14.2, 15.2, 16.1**
   *
   * For any GenreProfile in ALL_PROFILES, calling validateProfile(profile) SHALL
   * return an empty array (zero validation errors) for the base profile and for
   * every resolved subgenre variant.
   */
  test.prop([profileArb], { numRuns: 100 })(
    "validateProfile returns [] for any registered profile",
    (profile) => {
      const errors = validateProfile(profile);

      if (errors.length > 0) {
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

// ─── Property 2: Energy curve template length matches non-optional section count ───

// Feature: m6-genre-profiles, Property 2: Energy curve template length matches non-optional section count
describe("Property 2: Energy curve template length matches non-optional section count", () => {
  /**
   * **Validates: Requirements 1.5, 16.5**
   *
   * For any GenreProfile or resolved SubgenreVariant, the length of
   * energyCurveTemplate SHALL equal the number of entries in structure
   * where optional === false.
   */
  test.prop([resolvedProfileArb], { numRuns: 100 })(
    "energyCurveTemplate.length === structure.filter(s => !s.optional).length",
    (profile) => {
      const nonOptionalCount = profile.structure.filter((s) => !s.optional).length;
      expect(profile.energyCurveTemplate.length).toBe(nonOptionalCount);
    },
  );
});

// ─── Property 3: Energy curve values equal section energy midpoints ─────

// Feature: m6-genre-profiles, Property 3: Energy curve values equal section energy midpoints
describe("Property 3: Energy curve values equal section energy midpoints", () => {
  /**
   * **Validates: Requirements 1.5, 17.6**
   *
   * For any GenreProfile or resolved SubgenreVariant, each value in
   * energyCurveTemplate at index i SHALL equal
   * Math.round((nonOptionalSection[i].energyRange.min + nonOptionalSection[i].energyRange.max) / 2)
   */
  test.prop([resolvedProfileArb], { numRuns: 100 })(
    "energyCurveTemplate[i] === Math.round((section.energyRange.min + section.energyRange.max) / 2)",
    (profile) => {
      const nonOptionalSections = profile.structure.filter((s) => !s.optional);

      for (let i = 0; i < nonOptionalSections.length; i++) {
        const section = nonOptionalSections[i];
        const expected = Math.round(
          (section.energyRange.min + section.energyRange.max) / 2,
        );
        expect(profile.energyCurveTemplate[i]).toBe(expected);
      }
    },
  );
});

// ─── Property 4: Energy weights sum to 1.0 ─────────────────────────────

// Feature: m6-genre-profiles, Property 4: Energy weights sum to 1.0
describe("Property 4: Energy weights sum to 1.0", () => {
  /**
   * **Validates: Requirements 1.8, 2.8, 5.2, 7.5, 8.7, 9.2, 10.5, 12.2, 13.6, 14.2, 16.4**
   *
   * For any GenreProfile or resolved SubgenreVariant, the five energyWeights
   * coefficients SHALL each be in [0.0, 1.0] and sum to 1.0 ± 0.001.
   */
  test.prop([resolvedProfileArb], { numRuns: 100 })(
    "all 8 energy weight coefficients are in [0,1] and sum to 1.0 ± 0.001",
    (profile) => {
      const w: EnergyWeights = profile.energyWeights;

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

// ─── Property 5: Subgenre resolution inherits parent values for omitted fields ──

// Feature: m6-genre-profiles, Property 5: Subgenre resolution inherits parent values for omitted fields
describe("Property 5: Subgenre resolution inherits parent values for omitted fields", () => {
  /**
   * **Validates: Requirements 1.10, 2.9, 4.7, 5.7, 9.2, 10.7, 15.6**
   *
   * For any SubgenreVariant that omits an optional field, the resolved profile
   * SHALL have that field deep-equal to the parent profile's value.
   */
  test.prop([subgenreCaseArb], { numRuns: 100 })(
    "omitted optional fields on subgenre resolve to parent values",
    ({ parent, variant }) => {
      const resolved = getProfileBySubgenre(variant.id);
      expect(resolved).not.toBeNull();
      const profile = resolved!;

      for (const field of overridableFields) {
        if (variant[field] === undefined) {
          expect(profile[field]).toEqual(parent[field]);
        }
      }
    },
  );
});

// ─── Property 6: Registry lookup succeeds for all registered IDs ────────

// Feature: m6-genre-profiles, Property 6: Registry lookup succeeds for all registered IDs
describe("Property 6: Registry lookup succeeds for all registered IDs", () => {
  /**
   * **Validates: Requirements 16.2**
   *
   * For each profile ID, getProfile(id) returns non-null; for each subgenre
   * variant ID, getProfileBySubgenre(id) returns non-null.
   */
  test.prop([profileArb], { numRuns: 100 })(
    "getProfile(id) returns non-null for every registered family ID",
    (profile) => {
      const result = getProfile(profile.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(profile.id);
    },
  );

  test.prop([subgenreCaseArb], { numRuns: 100 })(
    "getProfileBySubgenre(id) returns non-null for every registered subgenre ID",
    ({ variant }) => {
      const result = getProfileBySubgenre(variant.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(variant.id);
    },
  );
});

// ─── Property 7: All profile and subgenre IDs are unique and kebab-case ─

// Feature: m6-genre-profiles, Property 7: All profile and subgenre IDs are unique and kebab-case
describe("Property 7: All profile and subgenre IDs are unique and kebab-case", () => {
  /**
   * **Validates: Requirements 16.7, 16.8**
   *
   * No duplicate IDs; all IDs match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$
   */
  const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

  // Collect all IDs once for uniqueness checking
  const allIds: string[] = [];
  for (const profile of ALL_PROFILES) {
    allIds.push(profile.id);
    if (profile.subgenres) {
      for (const sub of profile.subgenres) {
        allIds.push(sub.id);
      }
    }
  }

  test.prop([profileArb], { numRuns: 100 })(
    "profile IDs are kebab-case",
    (profile) => {
      expect(profile.id).toMatch(kebabCaseRegex);
    },
  );

  test.prop([subgenreCaseArb], { numRuns: 100 })(
    "subgenre IDs are kebab-case",
    ({ variant }) => {
      expect(variant.id).toMatch(kebabCaseRegex);
    },
  );

  test("all IDs are unique across profiles and subgenres", () => {
    const seen = new Set<string>();
    for (const id of allIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});

// ─── Property 8: SubgenreVariant parentId references containing profile ─

// Feature: m6-genre-profiles, Property 8: SubgenreVariant parentId references containing profile
describe("Property 8: SubgenreVariant parentId references containing profile", () => {
  /**
   * **Validates: Requirements 16.9**
   *
   * For each variant, variant.parentId === containingProfile.id
   */
  test.prop([subgenreCaseArb], { numRuns: 100 })(
    "variant.parentId equals the containing profile's id",
    ({ parent, variant }) => {
      expect(variant.parentId).toBe(parent.id);
    },
  );
});

// ─── Property 9: JSON round-trip preserves profile data ─────────────────

// Feature: m6-genre-profiles, Property 9: JSON round-trip preserves profile data
describe("Property 9: JSON round-trip preserves profile data", () => {
  /**
   * **Validates: Requirements 16.10**
   *
   * JSON.parse(JSON.stringify(profile)) deep-equals original.
   */
  test.prop([profileArb], { numRuns: 100 })(
    "JSON round-trip preserves profile data",
    (profile) => {
      const roundTripped = JSON.parse(JSON.stringify(profile)) as GenreProfile;
      expect(roundTripped).toEqual(profile);
    },
  );
});

// ─── Property 10: Search returns results for known name substrings ──────

// Feature: m6-genre-profiles, Property 10: Search returns results for known name substrings
describe("Property 10: Search returns results for known name substrings", () => {
  /**
   * **Validates: Requirements 16.3**
   *
   * For any registered name, a non-empty substring query returns ≥ 1 result
   * containing that substring (case-insensitive).
   */
  test.prop(
    [
      searchableNameArb.chain((entry) =>
        fc
          .tuple(
            fc.constant(entry),
            fc.nat({ max: Math.max(0, entry.name.length - 1) }),
            fc.nat({ max: Math.max(0, entry.name.length - 1) }),
          )
          .map(([e, startRaw, offsetRaw]) => {
            const start = Math.min(startRaw, e.name.length - 1);
            const end = Math.min(start + offsetRaw + 1, e.name.length);
            const substring = e.name.slice(start, end);
            return { entry: e, substring };
          })
          .filter(({ substring }) => substring.trim().length > 0),
      ),
    ],
    { numRuns: 100 },
  )(
    "searching a non-empty substring of a registered name returns ≥ 1 result",
    ({ entry, substring }) => {
      const results = search(substring);
      expect(results.length).toBeGreaterThanOrEqual(1);

      // At least one result contains the substring (case-insensitive)
      const lowerSubstring = substring.toLowerCase();
      const hasMatch = results.some((r) =>
        r.name.toLowerCase().includes(lowerSubstring),
      );
      expect(hasMatch).toBe(true);
    },
  );
});
