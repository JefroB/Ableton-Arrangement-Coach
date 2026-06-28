/**
 * Property-based tests for the Role Classification Loader validator.
 *
 * Feature: detection-data-externalization
 * Property 1: Role classification validator correctly classifies inputs
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import { validateRoleClassificationFile } from "../../src/core/role-classification-loader.js";

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Generate a finite number (excludes NaN and Infinity). */
const finiteNumberArb = fc.double({ min: -1e6, max: 1e6, noNaN: true });

/** Generate a valid regex pattern string. */
const validRegexArb = fc.oneof(
  fc.constant("\\b(drum|drums|loop)\\b"),
  fc.constant("\\b(vox|vocal|vocals)\\b"),
  fc.constant("\\bbass\\b"),
  fc.constant("\\bpad\\b"),
  fc.constant("test"),
  fc.constant("^prefix"),
  fc.constant("suffix$"),
  fc.constant("[a-z]+"),
  fc.constant("(foo|bar)"),
  fc.constant("\\d+"),
);

/** Generate an invalid regex pattern string. */
const invalidRegexArb = fc.oneof(
  fc.constant("[unclosed"),
  fc.constant("(unclosed"),
  fc.constant("*invalid"),
  fc.constant("+invalid"),
  fc.constant("?invalid"),
  fc.constant("\\"),
  fc.constant("[z-a]"),
);

/** Generate a non-finite number value (NaN or Infinity). */
const nonFiniteNumberArb = fc.oneof(
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
);

/** Generate a non-numeric value. */
const nonNumericArb = fc.oneof(
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant([]),
  fc.constant({}),
);

// ━━━ Valid structure generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validDrumsArb() {
  return fc.record({
    transientDensityMin: finiteNumberArb,
    maxBandFractionCeiling: finiteNumberArb,
  });
}

function validVocalArb() {
  return fc.record({
    centroidMin: finiteNumberArb,
    highCentroidFrameFraction: finiteNumberArb,
    formantFractionMin: finiteNumberArb,
    formantCountMin: finiteNumberArb,
  });
}

function validBassArb() {
  return fc.record({
    energyFractionMin: finiteNumberArb,
    frequencyCeiling: finiteNumberArb,
    transientDensityCeiling: finiteNumberArb,
  });
}

function validSynthLeadArb() {
  return fc.record({
    energyFractionMin: finiteNumberArb,
    lowFrequencyBound: finiteNumberArb,
    highFrequencyBound: finiteNumberArb,
    transientDensityCeiling: finiteNumberArb,
  });
}

function validSynthPadArb() {
  return fc.record({
    energyFractionMin: finiteNumberArb,
    lowFrequencyBound: finiteNumberArb,
    highFrequencyBound: finiteNumberArb,
    transientDensityCeiling: finiteNumberArb,
    spectralFluxCeiling: finiteNumberArb,
  });
}

function validFullMixArb() {
  return fc.record({
    maxBandFractionCeiling: finiteNumberArb,
    transientDensityLow: finiteNumberArb,
    transientDensityHigh: finiteNumberArb,
  });
}

function validThresholdsArb() {
  return fc.record({
    drums: validDrumsArb(),
    vocal: validVocalArb(),
    bass: validBassArb(),
    synthLead: validSynthLeadArb(),
    synthPad: validSynthPadArb(),
    fullMix: validFullMixArb(),
  });
}

function validNameHintPatternsArb() {
  return fc.record({
    drums: validRegexArb,
    vocal: validRegexArb,
    bass: validRegexArb,
    pad: validRegexArb,
  });
}

function validRoleClassificationArb() {
  return fc.record({
    thresholds: validThresholdsArb(),
    nameHintPatterns: validNameHintPatternsArb(),
  });
}

// ━━━ Property Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Property 1: Role classification validator correctly classifies inputs", () => {
  test.prop(
    [validRoleClassificationArb()],
    { numRuns: 100 },
  )(
    "accepts valid role classification data with all finite thresholds and valid regex patterns",
    (data) => {
      expect(() => validateRoleClassificationFile(data)).not.toThrow();
    },
  );

  test.prop(
    [
      validRoleClassificationArb(),
      fc.constantFrom(
        "drums", "vocal", "bass", "synthLead", "synthPad", "fullMix",
      ) as fc.Arbitrary<string>,
    ],
    { numRuns: 100 },
  )(
    "rejects when a role threshold object is missing from thresholds",
    (data, roleToRemove) => {
      const corrupted = {
        ...data,
        thresholds: { ...data.thresholds },
      };
      delete (corrupted.thresholds as Record<string, unknown>)[roleToRemove];

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
    },
  );

  test.prop(
    [
      validRoleClassificationArb(),
      fc.constantFrom("drums", "vocal", "bass", "pad") as fc.Arbitrary<string>,
    ],
    { numRuns: 100 },
  )(
    "rejects when a name hint pattern key is missing",
    (data, patternToRemove) => {
      const corrupted = {
        ...data,
        nameHintPatterns: { ...data.nameHintPatterns },
      };
      delete (corrupted.nameHintPatterns as Record<string, unknown>)[patternToRemove];

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        new RegExp(`nameHintPatterns\\.${patternToRemove}`),
      );
    },
  );

  test.prop(
    [
      validRoleClassificationArb(),
      fc.constantFrom("drums", "vocal", "bass", "pad") as fc.Arbitrary<string>,
      invalidRegexArb,
    ],
    { numRuns: 100 },
  )(
    "rejects when a name hint pattern is an invalid regex string",
    (data, patternKey, invalidPattern) => {
      const corrupted = {
        ...data,
        nameHintPatterns: {
          ...data.nameHintPatterns,
          [patternKey]: invalidPattern,
        },
      };

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        new RegExp(`nameHintPatterns\\.${patternKey}`),
      );
    },
  );

  test.prop(
    [validRoleClassificationArb(), nonFiniteNumberArb],
    { numRuns: 100 },
  )(
    "rejects when a drums threshold field has NaN or Infinity",
    (data, badValue) => {
      const corrupted = {
        ...data,
        thresholds: {
          ...data.thresholds,
          drums: {
            ...data.thresholds.drums,
            transientDensityMin: badValue,
          },
        },
      };

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /thresholds\.drums\.transientDensityMin/,
      );
    },
  );

  test.prop(
    [validRoleClassificationArb(), nonNumericArb],
    { numRuns: 100 },
  )(
    "rejects when a vocal threshold field has a non-numeric value",
    (data, badValue) => {
      const corrupted = {
        ...data,
        thresholds: {
          ...data.thresholds,
          vocal: {
            ...data.thresholds.vocal,
            centroidMin: badValue,
          },
        },
      };

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /thresholds\.vocal\.centroidMin/,
      );
    },
  );

  test.prop(
    [validRoleClassificationArb(), nonFiniteNumberArb],
    { numRuns: 100 },
  )(
    "rejects when a bass threshold field has NaN or Infinity",
    (data, badValue) => {
      const corrupted = {
        ...data,
        thresholds: {
          ...data.thresholds,
          bass: {
            ...data.thresholds.bass,
            energyFractionMin: badValue,
          },
        },
      };

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /thresholds\.bass\.energyFractionMin/,
      );
    },
  );

  test.prop(
    [validRoleClassificationArb(), nonNumericArb],
    { numRuns: 100 },
  )(
    "rejects when a synthPad threshold field has a non-numeric value",
    (data, badValue) => {
      const corrupted = {
        ...data,
        thresholds: {
          ...data.thresholds,
          synthPad: {
            ...data.thresholds.synthPad,
            spectralFluxCeiling: badValue,
          },
        },
      };

      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /thresholds\.synthPad\.spectralFluxCeiling/,
      );
    },
  );

  test.prop(
    [
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.constant(42),
        fc.constant("string"),
        fc.constant(true),
      ),
    ],
    { numRuns: 100 },
  )(
    "rejects non-object root values",
    (badRoot) => {
      expect(() => validateRoleClassificationFile(badRoot)).toThrow(
        /role-classification\.json/,
      );
    },
  );

  test.prop(
    [validRoleClassificationArb()],
    { numRuns: 100 },
  )(
    "rejects when thresholds is replaced with a non-object",
    (data) => {
      const corrupted = { ...data, thresholds: "not-an-object" };
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /thresholds/,
      );
    },
  );

  test.prop(
    [validRoleClassificationArb()],
    { numRuns: 100 },
  )(
    "rejects when nameHintPatterns is replaced with a non-object",
    (data) => {
      const corrupted = { ...data, nameHintPatterns: 123 };
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /role-classification\.json/,
      );
      expect(() => validateRoleClassificationFile(corrupted)).toThrow(
        /nameHintPatterns/,
      );
    },
  );
});
