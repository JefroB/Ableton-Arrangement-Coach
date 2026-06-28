/**
 * Property-based tests for Automation Patterns Loader validation.
 *
 * Feature: detection-data-externalization, Property 3: Automation patterns validator correctly classifies inputs
 *
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateAutomationPatternsFile } from "./automation-patterns-loader.js";

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PATTERN_ARRAY_KEYS = [
  "filterDevicePatterns",
  "excludedParameterNames",
  "transitionRelevantPatterns",
  "gapPatterns",
  "transitionPatterns",
] as const;

const MAX_SUGGESTIONS_KEYS = [
  "maxSuggestionsPerGap",
  "maxSuggestionsPerTransition",
] as const;

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Generate a non-empty string suitable for pattern entries. */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 30 });

/** Generate a non-empty array of non-empty strings. */
const validPatternArrayArb = fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 10 });

/** Generate a positive integer for max suggestions. */
const validMaxSuggestionsArb = fc.integer({ min: 1, max: 1000 });

/** Generate a valid GenericMixerParam object. */
const validMixerParamArb = fc.record({
  deviceName: nonEmptyStringArb,
  parameterName: nonEmptyStringArb,
});

/** Generate a valid full automation-patterns config. */
function validAutomationPatternsArb(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    filterDevicePatterns: validPatternArrayArb,
    excludedParameterNames: validPatternArrayArb,
    transitionRelevantPatterns: validPatternArrayArb,
    gapPatterns: validPatternArrayArb,
    transitionPatterns: validPatternArrayArb,
    maxSuggestionsPerGap: validMaxSuggestionsArb,
    maxSuggestionsPerTransition: validMaxSuggestionsArb,
    genericMixerParams: fc.array(validMixerParamArb, { minLength: 1, maxLength: 5 }),
  });
}

// ━━━ Property 3: Automation patterns validator correctly classifies inputs ━━━

// Feature: detection-data-externalization, Property 3: Automation patterns validator correctly classifies inputs
describe("Property 3: Automation patterns validator correctly classifies inputs", () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6**
   *
   * For any valid automation patterns config, the validator SHALL accept it
   * without throwing.
   */
  test.prop(
    [validAutomationPatternsArb()],
    { numRuns: 100 },
  )(
    "accepts valid automation patterns configs",
    (validConfig) => {
      expect(() => {
        validateAutomationPatternsFile(validConfig);
      }).not.toThrow();
    },
  );

  /**
   * **Validates: Requirements 3.2, 3.5**
   *
   * For any valid config where a pattern array entry is replaced with an empty
   * string, the validator SHALL throw an error mentioning 'automation-patterns.json'
   * and identifying the invalid entry.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.constantFrom(...PATTERN_ARRAY_KEYS),
      fc.nat(),
    ],
    { numRuns: 100 },
  )(
    "rejects empty string in pattern arrays with descriptive error",
    (validConfig, arrayKey, indexSeed) => {
      const arr = validConfig[arrayKey] as string[];
      const index = indexSeed % arr.length;

      // Inject an empty string at the chosen index
      const invalidConfig = { ...validConfig };
      const modifiedArr = [...arr];
      modifiedArr[index] = "";
      invalidConfig[arrayKey] = modifiedArr;

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );

  /**
   * **Validates: Requirements 3.2, 3.5**
   *
   * For any valid config where a pattern array entry is replaced with a non-string
   * value, the validator SHALL throw an error mentioning 'automation-patterns.json'.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.constantFrom(...PATTERN_ARRAY_KEYS),
      fc.nat(),
      fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    ],
    { numRuns: 100 },
  )(
    "rejects non-string values in pattern arrays with descriptive error",
    (validConfig, arrayKey, indexSeed, invalidValue) => {
      const arr = validConfig[arrayKey] as unknown[];
      const index = indexSeed % arr.length;

      const invalidConfig = { ...validConfig };
      const modifiedArr = [...arr];
      modifiedArr[index] = invalidValue;
      invalidConfig[arrayKey] = modifiedArr;

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );

  /**
   * **Validates: Requirements 3.3, 3.6**
   *
   * For any valid config where maxSuggestionsPerGap or maxSuggestionsPerTransition
   * is replaced with a non-integer, the validator SHALL throw an error mentioning
   * 'automation-patterns.json' and the field name.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.constantFrom(...MAX_SUGGESTIONS_KEYS),
      fc.oneof(
        fc.double({ min: 0.01, max: 100, noNaN: true }).filter((n) => !Number.isInteger(n)),
        fc.constant(NaN),
        fc.constant(Infinity),
        fc.constant(-Infinity),
      ),
    ],
    { numRuns: 100 },
  )(
    "rejects non-integer max suggestions with descriptive error",
    (validConfig, field, invalidValue) => {
      const invalidConfig = { ...validConfig, [field]: invalidValue };

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );

  /**
   * **Validates: Requirements 3.3, 3.6**
   *
   * For any valid config where maxSuggestionsPerGap or maxSuggestionsPerTransition
   * is zero or negative, the validator SHALL throw an error.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.constantFrom(...MAX_SUGGESTIONS_KEYS),
      fc.integer({ min: -1000, max: 0 }),
    ],
    { numRuns: 100 },
  )(
    "rejects zero or negative max suggestions with descriptive error",
    (validConfig, field, invalidValue) => {
      const invalidConfig = { ...validConfig, [field]: invalidValue };

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );

  /**
   * **Validates: Requirements 3.4**
   *
   * For any valid config where a genericMixerParams entry is missing deviceName,
   * the validator SHALL throw an error mentioning 'automation-patterns.json' and
   * identifying the invalid entry.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.nat(),
    ],
    { numRuns: 100 },
  )(
    "rejects mixer param missing deviceName with descriptive error",
    (validConfig, indexSeed) => {
      const params = validConfig.genericMixerParams as Record<string, unknown>[];
      const index = indexSeed % params.length;

      const invalidConfig = { ...validConfig };
      const modifiedParams = params.map((p) => ({ ...p }));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { deviceName, ...rest } = modifiedParams[index] as { deviceName: unknown; parameterName: unknown };
      modifiedParams[index] = rest;
      invalidConfig.genericMixerParams = modifiedParams;

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );

  /**
   * **Validates: Requirements 3.4**
   *
   * For any valid config where a genericMixerParams entry is missing parameterName,
   * the validator SHALL throw an error mentioning 'automation-patterns.json' and
   * identifying the invalid entry.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.nat(),
    ],
    { numRuns: 100 },
  )(
    "rejects mixer param missing parameterName with descriptive error",
    (validConfig, indexSeed) => {
      const params = validConfig.genericMixerParams as Record<string, unknown>[];
      const index = indexSeed % params.length;

      const invalidConfig = { ...validConfig };
      const modifiedParams = params.map((p) => ({ ...p }));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { parameterName, ...rest } = modifiedParams[index] as { deviceName: unknown; parameterName: unknown };
      modifiedParams[index] = rest;
      invalidConfig.genericMixerParams = modifiedParams;

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );

  /**
   * **Validates: Requirements 3.4**
   *
   * For any valid config where a genericMixerParams entry has an empty string for
   * deviceName or parameterName, the validator SHALL throw an error.
   */
  test.prop(
    [
      validAutomationPatternsArb(),
      fc.nat(),
      fc.constantFrom("deviceName" as const, "parameterName" as const),
    ],
    { numRuns: 100 },
  )(
    "rejects mixer param with empty string field with descriptive error",
    (validConfig, indexSeed, fieldToEmpty) => {
      const params = validConfig.genericMixerParams as Record<string, unknown>[];
      const index = indexSeed % params.length;

      const invalidConfig = { ...validConfig };
      const modifiedParams = params.map((p) => ({ ...p }));
      modifiedParams[index] = { ...modifiedParams[index], [fieldToEmpty]: "" };
      invalidConfig.genericMixerParams = modifiedParams;

      expect(() => {
        validateAutomationPatternsFile(invalidConfig);
      }).toThrowError(/automation-patterns\.json/);
    },
  );
});
