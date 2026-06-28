/**
 * Property-based tests for validateAudioVariationData and validateVariationTechniques functions.
 *
 * Feature: suggestion-data-externalization, Property 2: Multi-field validator correctly classifies inputs
 *
 * Verifies that validateAudioVariationData and validateVariationTechniques properly validate
 * multi-field JSON structures, accepting only those that meet their specific requirements.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateAudioVariationData, validateVariationTechniques } from "../../src/core/suggestion-loader.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Arbitrary for generating valid audio variation data.
 * Creates objects with all 4 required fields, each being a non-empty array of non-empty strings.
 */
const validAudioVariationArb = fc.record({
  strategies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
  genericVerbs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
  genericTransitions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
  framingModes: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
}).map(obj => ({ ...obj }));

/**
 * Arbitrary for generating invalid audio variation data.
 * Creates objects with subsets of fields or invalid array contents.
 */
const invalidAudioVariationArb = fc.oneof(
  // Missing fields
  fc.record({
    strategies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericVerbs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
  }).map(obj => ({ ...obj })),
  fc.record({
    strategies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericTransitions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
  }).map(obj => ({ ...obj })),
  fc.record({
    genericVerbs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    framingModes: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
  }).map(obj => ({ ...obj })),
  // Empty arrays
  fc.record({
    strategies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericVerbs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericTransitions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    framingModes: fc.constant([]),
  }).map(obj => ({ ...obj })),
  // Non-string elements
  fc.record({
    strategies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericVerbs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericTransitions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    framingModes: fc.array(fc.oneof(fc.integer(), fc.boolean()), { minLength: 1 }),
  }).map(obj => ({ ...obj })),
  // Empty strings in arrays
  fc.record({
    strategies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericVerbs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    genericTransitions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1 }),
    framingModes: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
  }).map(obj => ({ ...obj, framingModes: [...obj.framingModes, ""] })),
);

/**
 * Arbitrary for generating valid variation techniques data.
 * Creates objects with a techniques field that is a non-empty array of non-empty strings.
 */
const validVariationTechniquesArb = fc.record({
  techniques: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
}).map(obj => ({ ...obj }));

/**
 * Arbitrary for generating invalid variation techniques data.
 * Creates objects with missing or invalid techniques field.
 */
const invalidVariationTechniquesArb = fc.oneof(
  // Missing techniques field
  fc.record({
    otherField: fc.string(),
  }).map(obj => ({ ...obj })),
  // Non-object input
  fc.array(fc.string()),
  fc.constant(null),
  fc.integer(),
  fc.string(),
  fc.boolean(),
  // Empty techniques array
  fc.record({
    techniques: fc.constant([]),
  }).map(obj => ({ ...obj })),
  // Non-array techniques
  fc.record({
    techniques: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.string()),
  }).map(obj => ({ ...obj })),
  // Techniques array with non-string elements
  fc.record({
    techniques: fc.array(fc.oneof(fc.integer(), fc.boolean()), { minLength: 1 }),
  }).map(obj => ({ ...obj })),
  // Techniques array with empty strings
  fc.record({
    techniques: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
  }).map(obj => ({ techniques: [...obj.techniques, ""] })),
);

// ─── Property 2: Multi-field validator correctly classifies inputs ──────

describe("Property 2: Multi-field validator correctly classifies inputs", () => {
  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For validateAudioVariationData:
   * - For any valid audio variation data (object with all 4 required fields,
   *   each being a non-empty array of non-empty strings), SHALL NOT throw an error.
   */
  test.prop([validAudioVariationArb], { numRuns: 100 })(
    "validateAudioVariationData accepts valid audio variation data without throwing",
    (data) => {
      expect(() => {
        validateAudioVariationData(data, "audio-variation-strategies.json");
      }).not.toThrow();
    },
  );

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For validateAudioVariationData:
   * - For any invalid audio variation data (missing fields or invalid array contents),
   *   SHALL throw an error.
   */
  test.prop([invalidAudioVariationArb], { numRuns: 100 })(
    "validateAudioVariationData rejects invalid audio variation data with descriptive error",
    (data) => {
      expect(() => {
        validateAudioVariationData(data, "audio-variation-strategies.json");
      }).toThrow(/missing required field|has an empty array|contains non-string element|contains empty string/);
    },
  );

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For validateAudioVariationData:
   * - Error messages SHALL include the fileName argument.
   */
  test.prop([invalidAudioVariationArb], { numRuns: 100 })(
    "validateAudioVariationData error messages include the fileName argument",
    (data) => {
      let error: Error | null = null;
      try {
        validateAudioVariationData(data, "audio-variation-strategies.json");
      } catch (e) {
        error = e as Error;
      }
      
      expect(error).not.toBe(null);
      expect(error!.message).toContain("audio-variation-strategies.json");
    },
  );

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For validateVariationTechniques:
   * - For any valid variation techniques data (object with techniques field that is a non-empty array of non-empty strings),
   *   SHALL NOT throw an error.
   */
  test.prop([validVariationTechniquesArb], { numRuns: 100 })(
    "validateVariationTechniques accepts valid variation techniques data without throwing",
    (data) => {
      expect(() => {
        validateVariationTechniques(data, "variation-techniques.json");
      }).not.toThrow();
    },
  );

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For validateVariationTechniques:
   * - For any invalid variation techniques data (missing or invalid techniques field),
   *   SHALL throw an error.
   */
  test.prop([invalidVariationTechniquesArb], { numRuns: 100 })(
    "validateVariationTechniques rejects invalid variation techniques data with descriptive error",
    (data) => {
      expect(() => {
        validateVariationTechniques(data, "variation-techniques.json");
      }).toThrow(/expected a plain object|missing required field|has an empty array|is not an array|contains non-string element|contains empty string/);
    },
  );

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For validateVariationTechniques:
   * - Error messages SHALL include the fileName argument.
   */
  test.prop([invalidVariationTechniquesArb], { numRuns: 100 })(
    "validateVariationTechniques error messages include the fileName argument",
    (data) => {
      let error: Error | null = null;
      try {
        validateVariationTechniques(data, "variation-techniques.json");
      } catch (e) {
        error = e as Error;
      }
      
      expect(error).not.toBe(null);
      expect(error!.message).toContain("variation-techniques.json");
    },
  );
});