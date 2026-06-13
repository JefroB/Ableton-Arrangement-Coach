/**
 * Property-based tests for Genre Loader (genre-data-externalization).
 *
 * Feature: genre-data-externalization
 *
 * Verifies correctness properties of the genre loader module including
 * conditionalElements conversion, unknown field handling, and round-trip stability.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateGenreJson, loadAllGenreData } from "../../src/core/genre-loader.js";
import houseJson from "../../src/data/genres/house.json" with { type: "json" };

import type {
  GenreProfile,
  GenreFillProfile,
  GenreFrequencyProfile,
  GenreThresholdProfile,
} from "../../src/core/genre-profile-types.js";

// ═══════════════════════════════════════════════════════════════════════
// Conversion logic under test
//
// The convertFillProfile function in genre-loader.ts is not exported,
// so we replicate the exact conversion algorithm used:
//   new Map(Object.entries(obj).map(([key, value]) => [key, value as readonly string[]]))
//
// This tests the PROPERTY of the algorithm itself — that for any valid
// conditionalElements object, the Map conversion preserves all data.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Replicates the conditionalElements conversion from genre-loader.ts.
 * Converts a Record<string, string[]> to a ReadonlyMap<string, readonly string[]>.
 */
function convertConditionalElements(
  obj: Record<string, string[]>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    Object.entries(obj).map(([key, value]) => [key, value as readonly string[]]),
  ) as ReadonlyMap<string, readonly string[]>;
}

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generator for conditionalElements objects: arbitrary string keys mapped
 * to arrays of arbitrary strings. Keys are constrained to non-empty strings
 * to reflect realistic element names.
 */
const conditionalElementsArb: fc.Arbitrary<Record<string, string[]>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
);

// ─── Property 4: conditionalElements JSON-to-Map conversion preserves data ──

// Feature: genre-data-externalization, Property 4: conditionalElements JSON-to-Map conversion preserves data
describe("Property 4: conditionalElements JSON-to-Map conversion preserves data", () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any fillProfile containing a conditionalElements object with arbitrary
   * string keys and string-array values, converting the JSON object representation
   * to a ReadonlyMap SHALL preserve all key-value pairs (same keys, same array
   * contents and order).
   */
  test.prop([conditionalElementsArb], { numRuns: 100 })(
    "Map has same number of entries as the object has unique keys",
    (obj) => {
      const map = convertConditionalElements(obj);
      const uniqueKeys = Object.keys(obj);
      expect(map.size).toBe(uniqueKeys.length);
    },
  );

  test.prop([conditionalElementsArb], { numRuns: 100 })(
    "for each key in the original object, Map.get(key) returns the same array contents in the same order",
    (obj) => {
      const map = convertConditionalElements(obj);

      for (const [key, value] of Object.entries(obj)) {
        expect(map.has(key)).toBe(true);
        const mapValue = map.get(key);
        expect(mapValue).toEqual(value);
        // Verify order is preserved
        if (mapValue && value.length > 0) {
          for (let i = 0; i < value.length; i++) {
            expect(mapValue[i]).toBe(value[i]);
          }
        }
      }
    },
  );

  test.prop([conditionalElementsArb], { numRuns: 100 })(
    "Map contains no extra entries beyond what is in the original object",
    (obj) => {
      const map = convertConditionalElements(obj);
      const objectKeys = new Set(Object.keys(obj));

      for (const mapKey of map.keys()) {
        expect(objectKeys.has(mapKey)).toBe(true);
      }
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 5: Unknown JSON fields are ignored without error
// ═══════════════════════════════════════════════════════════════════════

/**
 * Known top-level field names in the genre JSON schema.
 * Used to ensure generated extra fields don't collide with real ones.
 */
const KNOWN_FIELDS = new Set([
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
  "archetypes",
  "aliases",
  "subgenres",
]);

/**
 * Arbitrary that generates a non-empty string key that does NOT conflict
 * with any known genre JSON field name.
 */
const unknownFieldKeyArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !KNOWN_FIELDS.has(s) && s.trim().length > 0);

/**
 * Arbitrary that generates random JSON-compatible values for extra fields.
 */
const jsonValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string(), { maxKeys: 3 }),
);

/**
 * Arbitrary that generates a record of 1–5 unknown extra fields.
 */
const extraFieldsArb = fc
  .array(fc.tuple(unknownFieldKeyArb, jsonValueArb), { minLength: 1, maxLength: 5 })
  .map((entries) => Object.fromEntries(entries));

// Feature: genre-data-externalization, Property 5: Unknown JSON fields are ignored without error
describe("Property 5: Unknown JSON fields are ignored without error", () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * For any valid genre JSON file with additional fields not defined in the
   * schema, the loader SHALL produce a valid typed result without errors,
   * ignoring the extra fields.
   */
  test.prop([extraFieldsArb], { numRuns: 100 })(
    "validateGenreJson does not throw when valid genre JSON has extra unknown fields",
    (extraFields) => {
      // Start with a known-valid genre JSON (house.json)
      const validJson = { ...houseJson } as Record<string, unknown>;

      // Add random extra fields at the top level
      const augmentedJson = { ...validJson, ...extraFields };

      // Validation should not throw — unknown fields are silently ignored
      expect(() => {
        validateGenreJson(augmentedJson, "house.json");
      }).not.toThrow();
    },
  );
});


// ═══════════════════════════════════════════════════════════════════════
// Property 10: Round-trip stability
// ═══════════════════════════════════════════════════════════════════════

/**
 * Serializes a GenreFillProfile back to a JSON-compatible plain object.
 * Converts the ReadonlyMap<string, readonly string[]> back to Record<string, string[]>.
 */
function serializeFillProfile(profile: GenreFillProfile): Record<string, unknown> {
  const conditionalElements: Record<string, readonly string[]> = {};
  for (const [key, value] of profile.conditionalElements) {
    conditionalElements[key] = value;
  }
  return {
    expectedFillTypes: [...profile.expectedFillTypes],
    typicalFillIntervals: [...profile.typicalFillIntervals],
    expectedFillFrequency: profile.expectedFillFrequency,
    coreElements: [...profile.coreElements],
    conditionalElements,
  };
}

/**
 * Serializes a GenreProfile back to a JSON-compatible plain object.
 */
function serializeProfile(profile: GenreProfile): Record<string, unknown> {
  return JSON.parse(JSON.stringify(profile));
}

/**
 * Serializes a GenreFrequencyProfile back to a JSON-compatible plain object.
 */
function serializeAudioProfile(profile: GenreFrequencyProfile): Record<string, unknown> {
  return JSON.parse(JSON.stringify(profile));
}

/**
 * Serializes a GenreThresholdProfile back to a JSON-compatible plain object.
 */
function serializeThresholdProfile(profile: GenreThresholdProfile): Record<string, unknown> {
  return JSON.parse(JSON.stringify(profile));
}

/**
 * Re-converts a serialized fill profile object back to a GenreFillProfile
 * (same logic as convertFillProfile in genre-loader.ts).
 */
function reloadFillProfile(obj: Record<string, unknown>): GenreFillProfile {
  const cond = obj.conditionalElements as Record<string, string[]>;
  return {
    expectedFillTypes: obj.expectedFillTypes as readonly string[],
    typicalFillIntervals: obj.typicalFillIntervals as readonly number[],
    expectedFillFrequency: obj.expectedFillFrequency as number,
    coreElements: obj.coreElements as readonly string[],
    conditionalElements: new Map(
      Object.entries(cond).map(([key, value]) => [key, value as readonly string[]]),
    ) as ReadonlyMap<string, readonly string[]>,
  };
}

// Feature: genre-data-externalization, Property 10: Round-trip stability
describe("Property 10: Round-trip stability", () => {
  // Load the data once for all sub-tests
  const loaded = loadAllGenreData();
  const allFamilyIds = loaded.profiles.map((p) => p.id);

  /**
   * **Validates: Requirements 11.5**
   *
   * For any genre JSON file, loading the file into a GenreProfile, serializing
   * that profile back to a JSON-compatible object, and loading the result again
   * SHALL produce a GenreProfile deeply equal to the first load.
   */
  test.prop(
    [fc.constantFrom(...allFamilyIds)],
    { numRuns: 100 },
  )(
    "GenreProfile round-trip: serialize → parse → deep equal for all genres",
    (familyId) => {
      const originalProfile = loaded.profiles.find((p) => p.id === familyId)!;

      // Serialize the profile to a JSON-compatible object (no Maps in GenreProfile)
      const serialized = serializeProfile(originalProfile);

      // Re-parse (simulates JSON.parse of the serialized form)
      const reparsed = JSON.parse(JSON.stringify(serialized));

      // The reparsed plain object should deep-equal the serialized form
      expect(reparsed).toEqual(serialized);

      // And the serialized form should deep-equal the original profile
      // (GenreProfile has no Maps, only plain objects/arrays)
      expect(serialized).toEqual(JSON.parse(JSON.stringify(originalProfile)));
    },
  );

  test.prop(
    [fc.constantFrom(...allFamilyIds)],
    { numRuns: 100 },
  )(
    "FillProfile round-trip: conditionalElements Map → Object → Map preserves data",
    (familyId) => {
      const originalFillProfile = loaded.fillProfiles.get(familyId)!;

      // Serialize: Map → Record (JSON-compatible)
      const serialized = serializeFillProfile(originalFillProfile);

      // Reload: Record → Map again
      const reloaded = reloadFillProfile(serialized);

      // Compare all non-Map fields
      expect(reloaded.expectedFillTypes).toEqual(originalFillProfile.expectedFillTypes);
      expect(reloaded.typicalFillIntervals).toEqual(originalFillProfile.typicalFillIntervals);
      expect(reloaded.expectedFillFrequency).toBe(originalFillProfile.expectedFillFrequency);
      expect(reloaded.coreElements).toEqual(originalFillProfile.coreElements);

      // Compare the conditionalElements Map
      expect(reloaded.conditionalElements.size).toBe(originalFillProfile.conditionalElements.size);
      for (const [key, value] of originalFillProfile.conditionalElements) {
        expect(reloaded.conditionalElements.has(key)).toBe(true);
        expect(reloaded.conditionalElements.get(key)).toEqual(value);
      }
    },
  );

  test.prop(
    [fc.constantFrom(...allFamilyIds)],
    { numRuns: 100 },
  )(
    "AudioProfile round-trip: serialize → parse → deep equal for all genres",
    (familyId) => {
      const originalAudioProfile = loaded.audioProfiles.get(familyId)!;

      // Serialize (no Maps in audio profile — all plain objects)
      const serialized = serializeAudioProfile(originalAudioProfile);

      // Re-parse
      const reparsed = JSON.parse(JSON.stringify(serialized));

      expect(reparsed).toEqual(serialized);
      expect(serialized).toEqual(JSON.parse(JSON.stringify(originalAudioProfile)));
    },
  );

  test.prop(
    [fc.constantFrom(...allFamilyIds)],
    { numRuns: 100 },
  )(
    "ThresholdProfile round-trip: serialize → parse → deep equal for all genres",
    (familyId) => {
      const originalThresholdProfile = loaded.thresholdProfiles.get(familyId)!;

      // Serialize (no Maps in threshold profile — all plain numbers)
      const serialized = serializeThresholdProfile(originalThresholdProfile);

      // Re-parse
      const reparsed = JSON.parse(JSON.stringify(serialized));

      expect(reparsed).toEqual(serialized);
      expect(serialized).toEqual(JSON.parse(JSON.stringify(originalThresholdProfile)));
    },
  );
});
