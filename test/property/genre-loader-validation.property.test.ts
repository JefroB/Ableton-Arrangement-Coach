/**
 * Property-based tests for Genre Loader validation.
 *
 * Feature: genre-data-externalization, Property 1: Schema validation rejects missing required fields
 *
 * Validates: Requirements 1.9, 1.10
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateGenreJson } from "../../src/core/genre-loader.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** Required top-level fields that every genre JSON file must contain. */
const REQUIRED_TOP_LEVEL_FIELDS = [
  "genreFamily",
  "name",
  "tempoRange",
  "structure",
  "energyCurveTemplate",
  "transitions",
  "energyWeights",
  "detectionRules",
  "detectionThresholds",
  "fillProfile",
  "audioProfile",
  "thresholds",
] as const;

/** Required fields within each subgenre entry. */
const REQUIRED_SUBGENRE_FIELDS = [
  "subgenreId",
  "displayName",
  "structureVariants",
] as const;

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate a valid genre JSON object that passes validation.
 * Energy weights sum to exactly 1.0.
 */
function validGenreJsonArb(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    genreFamily: fc.stringMatching(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    tempoRange: fc.record({
      min: fc.integer({ min: 60, max: 200 }),
      max: fc.integer({ min: 60, max: 200 }),
    }),
    structure: fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        lengthRange: fc.record({
          min: fc.integer({ min: 4, max: 64 }),
          max: fc.integer({ min: 4, max: 64 }),
        }),
        energyRange: fc.record({
          min: fc.integer({ min: 1, max: 10 }),
          max: fc.integer({ min: 1, max: 10 }),
        }),
        optional: fc.boolean(),
      }),
      { minLength: 1, maxLength: 7 },
    ),
    energyCurveTemplate: fc.array(fc.integer({ min: 1, max: 10 }), {
      minLength: 1,
      maxLength: 7,
    }),
    transitions: fc.record({
      preferred: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
      discouraged: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
      buildDurationRange: fc.record({
        min: fc.integer({ min: 2, max: 16 }),
        max: fc.integer({ min: 2, max: 32 }),
      }),
      dropsExpected: fc.boolean(),
    }),
    // Energy weights that sum to exactly 1.0
    energyWeights: fc
      .tuple(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
      )
      .map(([a, b, c, d, e, f, g, h]) => {
        const total = a + b + c + d + e + f + g + h || 1;
        return {
          trackCountWeight: Math.round((a / total) * 1000) / 1000,
          midiDensityWeight: Math.round((b / total) * 1000) / 1000,
          trackPresenceWeight: Math.round((c / total) * 1000) / 1000,
          automationWeight: Math.round((d / total) * 1000) / 1000,
          frequencyCoverageWeight: Math.round((e / total) * 1000) / 1000,
          velocityIntensityWeight: Math.round((f / total) * 1000) / 1000,
          polyphonyScoreWeight: Math.round((g / total) * 1000) / 1000,
          // Ensure the sum is exactly 1.0 by computing the last weight as a remainder
          pitchRangeWeight:
            Math.round(
              (1.0 -
                Math.round((a / total) * 1000) / 1000 -
                Math.round((b / total) * 1000) / 1000 -
                Math.round((c / total) * 1000) / 1000 -
                Math.round((d / total) * 1000) / 1000 -
                Math.round((e / total) * 1000) / 1000 -
                Math.round((f / total) * 1000) / 1000 -
                Math.round((g / total) * 1000) / 1000) *
                1000,
            ) / 1000,
        };
      }),
    detectionRules: fc.array(
      fc.record({
        type: fc.string({ minLength: 1, maxLength: 30 }),
        value: fc.oneof(fc.integer({ min: 1, max: 100 }), fc.boolean()),
        severity: fc.constantFrom("info" as const, "warning" as const, "critical" as const),
      }),
      { minLength: 0, maxLength: 5 },
    ),
    detectionThresholds: fc.record({
      flatEnergyMaxDelta: fc.integer({ min: 1, max: 5 }),
      missingTransitionMinDelta: fc.integer({ min: 1, max: 5 }),
      similarityCeilingPercent: fc.integer({ min: 50, max: 99 }),
    }),
    fillProfile: fc.record({
      expectedFillTypes: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
      typicalFillIntervals: fc.array(fc.integer({ min: 4, max: 32 }), {
        minLength: 1,
        maxLength: 3,
      }),
      expectedFillFrequency: fc.double({ min: 0.1, max: 4, noNaN: true }),
      coreElements: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
      conditionalElements: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 3 }),
        { minKeys: 0, maxKeys: 3 },
      ),
    }),
    audioProfile: fc.record({
      expectedBands: fc.record({
        subBass: fc.integer({ min: -40, max: 0 }),
        bass: fc.integer({ min: -40, max: 0 }),
        lowMid: fc.integer({ min: -40, max: 0 }),
        mid: fc.integer({ min: -40, max: 0 }),
        highMid: fc.integer({ min: -40, max: 0 }),
        high: fc.integer({ min: -40, max: 0 }),
      }),
      expectedDrumTransientDensity: fc.integer({ min: 2, max: 24 }),
      displayName: fc.string({ minLength: 1, maxLength: 30 }),
      subBassHint: fc.string({ minLength: 1, maxLength: 100 }),
      rhythmicHint: fc.string({ minLength: 1, maxLength: 100 }),
    }),
    thresholds: fc.record({
      flatEnergyDelta: fc.double({ min: 0.1, max: 3, noNaN: true }),
      repetitionSimilarity: fc.double({ min: 0.5, max: 0.99, noNaN: true }),
      abruptChangeDelta: fc.double({ min: 2, max: 8, noNaN: true }),
      crowdingTrackCount: fc.integer({ min: 2, max: 6 }),
      introMinBars: fc.integer({ min: 4, max: 64 }),
      outroMinBars: fc.integer({ min: 4, max: 64 }),
    }),
  });
}

/**
 * Generate a valid subgenre entry that passes validation.
 */
function validSubgenreEntryArb(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    subgenreId: fc.stringMatching(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/),
    displayName: fc.string({ minLength: 1, maxLength: 30 }),
    structureVariants: fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }),
        sections: fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            lengthRange: fc.record({
              min: fc.integer({ min: 4, max: 64 }),
              max: fc.integer({ min: 4, max: 64 }),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  });
}

// ─── Property 1: Schema validation rejects missing required fields ─────

// Feature: genre-data-externalization, Property 1: Schema validation rejects missing required fields
describe("Property 1: Schema validation rejects missing required fields", () => {
  /**
   * **Validates: Requirements 1.9, 1.10**
   *
   * For any valid genre JSON object with one required top-level field removed,
   * the validator SHALL reject the file and produce an error message naming
   * the specific absent field.
   */
  test.prop(
    [
      validGenreJsonArb(),
      fc.constantFrom(...REQUIRED_TOP_LEVEL_FIELDS),
    ],
    { numRuns: 100 },
  )(
    "removing a required top-level field causes validation to throw with the field name in the error",
    (validJson, fieldToRemove) => {
      // Create a copy with the field removed
      const invalidJson = { ...validJson };
      delete invalidJson[fieldToRemove];

      // Validation should throw
      expect(() => {
        validateGenreJson(invalidJson, "test-genre.json");
      }).toThrowError(
        new RegExp(`missing required field '${fieldToRemove}'`),
      );
    },
  );

  /**
   * **Validates: Requirements 1.10**
   *
   * For any valid genre JSON with subgenres, removing a required subgenre field
   * (subgenreId, displayName, or structureVariants) from one subgenre entry
   * causes validation to throw with the field name in the error.
   */
  test.prop(
    [
      validGenreJsonArb(),
      validSubgenreEntryArb(),
      fc.constantFrom(...REQUIRED_SUBGENRE_FIELDS),
    ],
    { numRuns: 100 },
  )(
    "removing a required subgenre field causes validation to throw with the field name in the error",
    (validJson, validSubgenre, fieldToRemove) => {
      // Add a subgenre entry with the required field removed
      const invalidSubgenre = { ...validSubgenre };
      delete (invalidSubgenre as Record<string, unknown>)[fieldToRemove];

      const jsonWithSubgenres = {
        ...validJson,
        subgenres: [invalidSubgenre],
      };

      // Validation should throw
      expect(() => {
        validateGenreJson(
          jsonWithSubgenres as Record<string, unknown>,
          "test-genre.json",
        );
      }).toThrowError(
        new RegExp(`missing required field '${fieldToRemove}'`),
      );
    },
  );
});
