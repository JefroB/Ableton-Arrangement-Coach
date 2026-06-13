/**
 * Property-based tests for Genre Data Completeness (genre-data-externalization).
 *
 * Feature: genre-data-externalization, Property 2: All 28 genre files contain complete profile sections
 * Feature: genre-data-externalization, Property 9: Energy weights sum to 1.0 (±0.001)
 *
 * Verifies that all 28 genre families loaded by the genre loader contain
 * complete fillProfile, audioProfile, thresholds, and transitions data
 * with all required fields present and valid. Also verifies the energy
 * weights sum invariant across all profiles and subgenres with overrides.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { loadAllGenreData } from "../../src/core/genre-loader.js";
import type {
  EnergyWeights,
  GenreFillProfile,
  GenreFrequencyProfile,
  GenreThresholdProfile,
  TransitionPreferences,
} from "../../src/core/genre-profile-types.js";

// ═══════════════════════════════════════════════════════════════════════
// Load all genre data once (pure data, no side effects)
// ═══════════════════════════════════════════════════════════════════════

const loadedData = loadAllGenreData();

/** All 28 genre family IDs extracted from loaded profiles. */
const allFamilyIds: string[] = loadedData.profiles.map((p) => p.family);

// Sanity: ensure we have exactly 28 genre families
if (allFamilyIds.length !== 28) {
  throw new Error(
    `Expected 28 genre families but found ${allFamilyIds.length}`,
  );
}

// ─── Generator ─────────────────────────────────────────────────────────

/**
 * Arbitrary that picks from all 28 genre family IDs.
 * Using constantFrom ensures fast-check iterates across all IDs.
 */
const genreFamilyIdArb: fc.Arbitrary<string> = fc.constantFrom(...allFamilyIds);

// ═══════════════════════════════════════════════════════════════════════
// Feature: genre-data-externalization, Property 2: All 28 genre files contain complete profile sections
// ═══════════════════════════════════════════════════════════════════════

describe("Property 2: All 28 genre files contain complete profile sections", () => {
  /**
   * **Validates: Requirements 2.6, 2.7, 2.8, 2.9, 11.3**
   *
   * For any genre JSON file in the set of 28, the file SHALL contain a
   * complete fillProfile, audioProfile, thresholds, and transition profile.
   */

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "fillProfile exists and contains all required fields",
    (familyId) => {
      const fillProfile: GenreFillProfile | undefined =
        loadedData.fillProfiles.get(familyId);

      // fillProfile must exist for every family
      expect(fillProfile).toBeDefined();
      expect(fillProfile).not.toBeNull();

      // Verify all required fields are present and have valid types
      const fp = fillProfile!;
      expect(fp.expectedFillTypes).toBeDefined();
      expect(Array.isArray(fp.expectedFillTypes)).toBe(true);
      expect(fp.expectedFillTypes.length).toBeGreaterThan(0);

      expect(fp.typicalFillIntervals).toBeDefined();
      expect(Array.isArray(fp.typicalFillIntervals)).toBe(true);
      expect(fp.typicalFillIntervals.length).toBeGreaterThan(0);

      expect(fp.expectedFillFrequency).toBeDefined();
      expect(typeof fp.expectedFillFrequency).toBe("number");
      expect(fp.expectedFillFrequency).toBeGreaterThan(0);

      expect(fp.coreElements).toBeDefined();
      expect(Array.isArray(fp.coreElements)).toBe(true);

      expect(fp.conditionalElements).toBeDefined();
      expect(fp.conditionalElements instanceof Map).toBe(true);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "audioProfile exists and contains all required fields",
    (familyId) => {
      const audioProfile: GenreFrequencyProfile | undefined =
        loadedData.audioProfiles.get(familyId);

      // audioProfile must exist for every family
      expect(audioProfile).toBeDefined();
      expect(audioProfile).not.toBeNull();

      const ap = audioProfile!;
      expect(ap.expectedBands).toBeDefined();
      expect(typeof ap.expectedBands).toBe("object");
      expect(ap.expectedBands).not.toBeNull();

      expect(ap.expectedDrumTransientDensity).toBeDefined();
      expect(typeof ap.expectedDrumTransientDensity).toBe("number");
      expect(ap.expectedDrumTransientDensity).toBeGreaterThan(0);

      expect(ap.displayName).toBeDefined();
      expect(typeof ap.displayName).toBe("string");
      expect(ap.displayName.length).toBeGreaterThan(0);

      expect(ap.subBassHint).toBeDefined();
      expect(typeof ap.subBassHint).toBe("string");

      expect(ap.rhythmicHint).toBeDefined();
      expect(typeof ap.rhythmicHint).toBe("string");
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "thresholds profile exists and contains all required fields",
    (familyId) => {
      const thresholdProfile: GenreThresholdProfile | undefined =
        loadedData.thresholdProfiles.get(familyId);

      // thresholdProfile must exist for every family
      expect(thresholdProfile).toBeDefined();
      expect(thresholdProfile).not.toBeNull();

      const tp = thresholdProfile!;
      expect(tp.flatEnergyDelta).toBeDefined();
      expect(typeof tp.flatEnergyDelta).toBe("number");

      expect(tp.repetitionSimilarity).toBeDefined();
      expect(typeof tp.repetitionSimilarity).toBe("number");

      expect(tp.abruptChangeDelta).toBeDefined();
      expect(typeof tp.abruptChangeDelta).toBe("number");

      expect(tp.crowdingTrackCount).toBeDefined();
      expect(typeof tp.crowdingTrackCount).toBe("number");

      expect(tp.introMinBars).toBeDefined();
      expect(typeof tp.introMinBars).toBe("number");

      expect(tp.outroMinBars).toBeDefined();
      expect(typeof tp.outroMinBars).toBe("number");
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "transitions profile exists and contains all required fields",
    (familyId) => {
      // Transitions are on the GenreProfile itself
      const profile = loadedData.profiles.find((p) => p.family === familyId);

      expect(profile).toBeDefined();
      expect(profile).not.toBeNull();

      const transitions: TransitionPreferences = profile!.transitions;
      expect(transitions).toBeDefined();
      expect(transitions).not.toBeNull();

      expect(transitions.preferred).toBeDefined();
      expect(Array.isArray(transitions.preferred)).toBe(true);
      expect(transitions.preferred.length).toBeGreaterThan(0);

      expect(transitions.discouraged).toBeDefined();
      expect(Array.isArray(transitions.discouraged)).toBe(true);

      expect(transitions.buildDurationRange).toBeDefined();
      expect(typeof transitions.buildDurationRange).toBe("object");
      expect(typeof transitions.buildDurationRange.min).toBe("number");
      expect(typeof transitions.buildDurationRange.max).toBe("number");
      expect(transitions.buildDurationRange.min).toBeLessThanOrEqual(
        transitions.buildDurationRange.max,
      );

      expect(typeof transitions.dropsExpected).toBe("boolean");
    },
  );
});


// ═══════════════════════════════════════════════════════════════════════
// Feature: genre-data-externalization, Property 9: Energy weights sum to 1.0 (±0.001)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Collects all energy weight profiles that need validation:
 * - All 28 family-level profiles
 * - All subgenres that define their own energyWeights overrides
 */
interface WeightTestCase {
  readonly label: string;
  readonly weights: EnergyWeights;
}

const allWeightCases: WeightTestCase[] = [];

for (const profile of loadedData.profiles) {
  // Family-level energy weights
  allWeightCases.push({
    label: `family:${profile.family}`,
    weights: profile.energyWeights,
  });

  // Subgenre-level energy weight overrides
  if (profile.subgenres) {
    for (const subgenre of profile.subgenres) {
      if (subgenre.energyWeights) {
        allWeightCases.push({
          label: `subgenre:${subgenre.id}`,
          weights: subgenre.energyWeights,
        });
      }
    }
  }
}

/** Arbitrary that picks from all profiles with energy weights (families + subgenres with overrides). */
const weightCaseArb: fc.Arbitrary<WeightTestCase> = fc.constantFrom(...allWeightCases);

describe("Property 9: Energy weights sum to 1.0 (±0.001)", () => {
  /**
   * **Validates: Requirements 11.2**
   *
   * For all loaded profiles (families and subgenres with weight overrides),
   * the sum of all energy weight coefficients SHALL equal 1.0 within a
   * tolerance of ±0.001.
   *
   * Sum includes: trackCountWeight + midiDensityWeight + trackPresenceWeight +
   * automationWeight + frequencyCoverageWeight + velocityIntensityWeight +
   * polyphonyScoreWeight + pitchRangeWeight + (audioEnergyWeight ?? 0) +
   * (synthEnergyWeight ?? 0)
   */
  test.prop([weightCaseArb], { numRuns: 100 })(
    "energy weight coefficients sum to 1.0 ±0.001 for all family and subgenre profiles",
    ({ label, weights }) => {
      const sum =
        weights.trackCountWeight +
        weights.midiDensityWeight +
        weights.trackPresenceWeight +
        weights.automationWeight +
        weights.frequencyCoverageWeight +
        weights.velocityIntensityWeight +
        weights.polyphonyScoreWeight +
        weights.pitchRangeWeight +
        (weights.audioEnergyWeight ?? 0) +
        (weights.synthEnergyWeight ?? 0);

      expect(
        Math.abs(sum - 1.0),
        `${label}: weights sum to ${sum}, expected 1.0 ±0.001`,
      ).toBeLessThanOrEqual(0.001);
    },
  );

  test.prop([weightCaseArb], { numRuns: 100 })(
    "all individual weight coefficients are non-negative",
    ({ label, weights }) => {
      expect(weights.trackCountWeight, `${label}: trackCountWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.midiDensityWeight, `${label}: midiDensityWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.trackPresenceWeight, `${label}: trackPresenceWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.automationWeight, `${label}: automationWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.frequencyCoverageWeight, `${label}: frequencyCoverageWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.velocityIntensityWeight, `${label}: velocityIntensityWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.polyphonyScoreWeight, `${label}: polyphonyScoreWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.pitchRangeWeight, `${label}: pitchRangeWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.audioEnergyWeight ?? 0, `${label}: audioEnergyWeight`).toBeGreaterThanOrEqual(0);
      expect(weights.synthEnergyWeight ?? 0, `${label}: synthEnergyWeight`).toBeGreaterThanOrEqual(0);
    },
  );
});
