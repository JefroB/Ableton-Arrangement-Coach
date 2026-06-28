/**
 * Property-based tests for Issue Thresholds Loader — Keyword Array Validation.
 *
 * Feature: issue-detector-keywords-externalization, Property 1: Keyword Array Validation
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 7.1, 7.2, 7.3
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateStringArray, validateThresholdProfile, validateNumericThresholds } from "../../src/core/issue-thresholds-loader.js";

// ——— Generators ———————————————————————————————————————————————————————————————
/** Valid keyword character set: lowercase letters, digits, hyphens */
const VALID_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789-";

/** Arbitrary valid keyword string: 1–30 chars from [a-z0-9-] */
const validKeywordArb = fc.stringOf(
  fc.constantFrom(...VALID_CHARSET.split("")),
  { minLength: 1, maxLength: 30 }
);

/** Arbitrary valid keyword array: 1–50 elements of valid keywords */
const validKeywordArrayArb = fc.array(validKeywordArb, {
  minLength: 1,
  maxLength: 50,
});

/** Arbitrary string with at least one invalid character (uppercase, space, special) */
const invalidCharKeywordArb = fc.oneof(
  // Contains uppercase letters
  fc.stringOf(fc.constantFrom(...("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-").split("")), { minLength: 1, maxLength: 30 })
    .filter((s) => /[A-Z]/.test(s)),
  // Contains spaces
  fc.constant("hello world"),
  // Contains special characters
  fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz0123456789-!@#$%^&*()_+=").split("")), { minLength: 1, maxLength: 30 })
    .filter((s) => /[!@#$%^&*()_+=]/.test(s))
);

/** Non-string values */
const nonStringArb = fc.oneof(
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.object(),
  fc.boolean()
);

// ——— Property Tests ——————————————————————————————————————————————————————————
describe("Feature: issue-detector-keywords-externalization, Property 1: Keyword Array Validation", () => {
  test.prop([validKeywordArrayArb], { numRuns: 100 })(
    "accepts valid keyword arrays (1–50 elements of [a-z0-9-]{1,30})",
    (arr) => {
      const result = validateStringArray(arr, "test.path");
      expect(result).toEqual(arr);
    }
  );

  test.prop([fc.constant([])], { numRuns: 100 })(
    "rejects empty arrays",
    (arr) => {
      expect(() => validateStringArray(arr, "test.path")).toThrow();
    }
  );

  test.prop(
    [
      fc.array(
        fc.oneof(validKeywordArb, fc.constant("")),
        { minLength: 1, maxLength: 50 }
      ).filter((arr) => arr.some((s) => s === "")),
    ],
    { numRuns: 100 }
  )(
    "rejects arrays containing empty strings",
    (arr) => {
      expect(() => validateStringArray(arr, "test.path")).toThrow();
    }
  );

  test.prop(
    [
      fc.array(
        fc.oneof(validKeywordArb, invalidCharKeywordArb),
        { minLength: 1, maxLength: 50 }
      ).filter((arr) => arr.some((s) => /[^a-z0-9-]/.test(s))),
    ],
    { numRuns: 100 }
  )(
    "rejects arrays with strings containing invalid characters",
    (arr) => {
      expect(() => validateStringArray(arr, "test.path")).toThrow();
    }
  );

  test.prop(
    [
      fc.array(
        fc.oneof(validKeywordArb, nonStringArb) as fc.Arbitrary<unknown>,
        { minLength: 1, maxLength: 50 }
      ).filter((arr) => arr.some((el) => typeof el !== "string")),
    ],
    { numRuns: 100 }
  )(
    "rejects arrays with non-string values",
    (arr) => {
      expect(() => validateStringArray(arr, "test.path")).toThrow();
    }
  );

  test.prop(
    [
      fc.oneof(
        fc.constant(null),
        fc.string(),
        fc.integer(),
        fc.object()
      ),
    ],
    { numRuns: 100 }
  )(
    "rejects non-array values (null, string, number, object)",
    (value) => {
      expect(() => validateStringArray(value, "test.path")).toThrow();
    }
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Property 4: Deep Freeze Invariant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  getDefaultThresholds,
  getTransitionKeywords,
  getBuildupKeywords,
  getDropSectionNames,
  getDropSuppressionGenres,
  getRepetitionTolerantGenres,
  getDjOrientedGenres,
  getSynthRepetitionRoles,
  getSynthDensityRoles,
  getNumericThresholds,
} from "../../src/core/issue-thresholds-loader.js";

/**
 * Recursively verifies that a value and all nested objects/arrays are frozen.
 */
function assertDeepFrozen(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value), `Expected ${path} to be frozen`).toBe(true);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    assertDeepFrozen((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

/**
 * Feature: issue-detector-keywords-externalization, Property 4: Deep Freeze Invariant
 *
 * Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 3.17
 *
 * For any accessor function exported by the loader, the returned value SHALL be deeply
 * frozen — Object.isFrozen() returns true for the top-level value and all nested objects/arrays.
 */
describe("Feature: issue-detector-keywords-externalization, Property 4: Deep Freeze Invariant", () => {
  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDefaultThresholds() returns a frozen object",
    () => {
      const result = getDefaultThresholds();
      expect(Object.isFrozen(result)).toBe(true);
      assertDeepFrozen(result, "getDefaultThresholds()");
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getTransitionKeywords() returns a frozen array",
    () => {
      const result = getTransitionKeywords();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getBuildupKeywords() returns a frozen array",
    () => {
      const result = getBuildupKeywords();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDropSectionNames() returns a frozen array",
    () => {
      const result = getDropSectionNames();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDropSuppressionGenres() returns a frozen array",
    () => {
      const result = getDropSuppressionGenres();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getRepetitionTolerantGenres() returns a frozen array",
    () => {
      const result = getRepetitionTolerantGenres();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDjOrientedGenres() returns a frozen array",
    () => {
      const result = getDjOrientedGenres();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getSynthRepetitionRoles() returns a frozen array",
    () => {
      const result = getSynthRepetitionRoles();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getSynthDensityRoles() returns a frozen array",
    () => {
      const result = getSynthDensityRoles();
      expect(Object.isFrozen(result)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getNumericThresholds() returns a frozen object",
    () => {
      const result = getNumericThresholds();
      expect(Object.isFrozen(result)).toBe(true);
      assertDeepFrozen(result, "getNumericThresholds()");
    }
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Property 6: Serialization Round-Trip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Feature: issue-detector-keywords-externalization, Property 6: Serialization Round-Trip
 *
 * Validates: Requirements 7.6
 *
 * For any data loaded from the JSON file, serializing it with JSON.stringify and then
 * parsing with JSON.parse SHALL produce an object that is deeply equal to the original loaded data.
 */
describe("Feature: issue-detector-keywords-externalization, Property 6: Serialization Round-Trip", () => {
  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDefaultThresholds() survives JSON round-trip",
    () => {
      const original = getDefaultThresholds();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual(original);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getTransitionKeywords() survives JSON round-trip",
    () => {
      const original = getTransitionKeywords();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getBuildupKeywords() survives JSON round-trip",
    () => {
      const original = getBuildupKeywords();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDropSectionNames() survives JSON round-trip",
    () => {
      const original = getDropSectionNames();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDropSuppressionGenres() survives JSON round-trip",
    () => {
      const original = getDropSuppressionGenres();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getRepetitionTolerantGenres() survives JSON round-trip",
    () => {
      const original = getRepetitionTolerantGenres();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getDjOrientedGenres() survives JSON round-trip",
    () => {
      const original = getDjOrientedGenres();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getSynthRepetitionRoles() survives JSON round-trip",
    () => {
      const original = getSynthRepetitionRoles();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getSynthDensityRoles() survives JSON round-trip",
    () => {
      const original = getSynthDensityRoles();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 1 })(
    "getNumericThresholds() survives JSON round-trip",
    () => {
      const original = getNumericThresholds();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual(original);
    }
  );
});
