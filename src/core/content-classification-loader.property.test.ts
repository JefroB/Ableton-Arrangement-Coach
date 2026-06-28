/**
 * Property-based tests for the Content Classification Loader validator.
 *
 * Feature: detection-data-externalization, Property 2:
 * Content classification validator correctly classifies inputs
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateContentClassificationFile } from "./content-classification-loader.js";

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEIGHT_SUM_TOLERANCE = 0.001;

const REQUIRED_ROLE_KEYWORD_KEYS = ["drums", "bass", "lead", "pad", "arp"] as const;

const REQUIRED_DRUMS_KEYS = [
  "pitchRangeLow", "pitchRangeHigh", "regularityThreshold",
  "pitchVarietyPerBeatCeiling", "avgDurationCeiling",
] as const;

const REQUIRED_BASS_KEYS = ["avgPitchCeiling", "avgPolyphonyCeiling"] as const;

const REQUIRED_ARPEGGIO_KEYS = ["densityThreshold", "regularityThreshold"] as const;

const REQUIRED_PAD_KEYS = ["avgPolyphonyThreshold", "avgDurationThreshold"] as const;

const REQUIRED_CHORD_KEYS = [
  "polyphonyLowBound", "polyphonyHighBound",
  "durationLowBound", "durationHighBound",
] as const;

const REQUIRED_LEAD_KEYS = [
  "polyphonyCeiling", "avgPitchThreshold", "pitchVarietyThreshold",
] as const;

const REQUIRED_FILL_DETECTION_KEYS = [
  "densityIncreaseFraction", "newPitchClassCountThreshold",
] as const;

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Generates a finite number suitable for threshold fields. */
const finiteNumber = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true });

/** Generates a non-empty string suitable for keyword entries. */
const validKeyword = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
  { minLength: 1, maxLength: 20 }
);

/** Generates a valid keyword array (non-empty strings). */
const validKeywordArray = fc.array(validKeyword, { minLength: 1, maxLength: 8 });

/**
 * Generates 4 similarity weights that sum to exactly 1.0 (within tolerance).
 * Uses Dirichlet-like normalization.
 */
const validSimilarityWeights = fc
  .array(fc.double({ min: 0.01, max: 1.0, noNaN: true, noDefaultInfinity: true }), {
    minLength: 4,
    maxLength: 4,
  })
  .map((raw) => {
    const sum = raw.reduce((a, b) => a + b, 0);
    const normalized = raw.map((v) => v / sum);
    return {
      pitchClass: normalized[0],
      rhythmic: normalized[1],
      velocity: normalized[2],
      density: normalized[3],
    };
  });

/** Generates a valid drums classification thresholds object. */
const validDrumsThresholds = fc.record({
  pitchRangeLow: finiteNumber,
  pitchRangeHigh: finiteNumber,
  regularityThreshold: finiteNumber,
  pitchVarietyPerBeatCeiling: finiteNumber,
  avgDurationCeiling: finiteNumber,
});

/** Generates a valid bass classification thresholds object. */
const validBassThresholds = fc.record({
  avgPitchCeiling: finiteNumber,
  avgPolyphonyCeiling: finiteNumber,
});

/** Generates a valid arpeggio classification thresholds object. */
const validArpeggioThresholds = fc.record({
  densityThreshold: finiteNumber,
  regularityThreshold: finiteNumber,
});

/** Generates a valid pad classification thresholds object. */
const validPadThresholds = fc.record({
  avgPolyphonyThreshold: finiteNumber,
  avgDurationThreshold: finiteNumber,
});

/** Generates a valid chord classification thresholds object. */
const validChordThresholds = fc.record({
  polyphonyLowBound: finiteNumber,
  polyphonyHighBound: finiteNumber,
  durationLowBound: finiteNumber,
  durationHighBound: finiteNumber,
});

/** Generates a valid lead classification thresholds object. */
const validLeadThresholds = fc.record({
  polyphonyCeiling: finiteNumber,
  avgPitchThreshold: finiteNumber,
  pitchVarietyThreshold: finiteNumber,
});

/** Generates a valid classificationThresholds object. */
const validClassificationThresholds = fc.record({
  drums: validDrumsThresholds,
  bass: validBassThresholds,
  arpeggio: validArpeggioThresholds,
  pad: validPadThresholds,
  chord: validChordThresholds,
  lead: validLeadThresholds,
});

/** Generates valid roleKeywords. */
const validRoleKeywords = fc.record({
  drums: validKeywordArray,
  bass: validKeywordArray,
  lead: validKeywordArray,
  pad: validKeywordArray,
  arp: validKeywordArray,
});

/** Generates valid fillDetection thresholds. */
const validFillDetection = fc.record({
  densityIncreaseFraction: finiteNumber,
  newPitchClassCountThreshold: finiteNumber,
});

/** Generates a complete valid content classification config. */
const validConfig = fc.record({
  similarityWeights: validSimilarityWeights,
  phraseDetectionThreshold: finiteNumber,
  roleKeywords: validRoleKeywords,
  classificationThresholds: validClassificationThresholds,
  fillDetection: validFillDetection,
  percussionLoopSimilarityThreshold: finiteNumber,
});

// ━━━ Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: detection-data-externalization, Property 2: Content classification validator correctly classifies inputs", () => {
  /**
   * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
   */
  test.prop(
    [validConfig],
    { numRuns: 100 }
  )("accepts any valid content classification config", (config) => {
    // Valid configs should not throw
    expect(() => validateContentClassificationFile(config)).not.toThrow();
  });

  test.prop(
    [validConfig, fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true })],
    { numRuns: 100 }
  )("rejects when similarity weights do not sum to 1.0", (config, offset) => {
    // Corrupt weights so they don't sum to 1.0
    const badConfig = {
      ...config,
      similarityWeights: {
        pitchClass: config.similarityWeights.pitchClass + offset,
        rhythmic: config.similarityWeights.rhythmic,
        velocity: config.similarityWeights.velocity,
        density: config.similarityWeights.density,
      },
    };

    const sum =
      badConfig.similarityWeights.pitchClass +
      badConfig.similarityWeights.rhythmic +
      badConfig.similarityWeights.velocity +
      badConfig.similarityWeights.density;

    // Only assert rejection if sum is actually out of tolerance
    if (Math.abs(sum - 1.0) > WEIGHT_SUM_TOLERANCE) {
      expect(() => validateContentClassificationFile(badConfig)).toThrow(
        /content-classification\.json.*similarityWeights.*sum to 1\.0/
      );
    }
  });

  test.prop(
    [validConfig, fc.constantFrom(...REQUIRED_ROLE_KEYWORD_KEYS), fc.nat({ max: 7 })],
    { numRuns: 100 }
  )("rejects when keyword array contains empty string", (config, role, index) => {
    const keywords = [...config.roleKeywords[role]];
    const insertIdx = Math.min(index, keywords.length);
    keywords.splice(insertIdx, 0, ""); // Insert empty string

    const badConfig = {
      ...config,
      roleKeywords: {
        ...config.roleKeywords,
        [role]: keywords,
      },
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*roleKeywords/
    );
  });

  test.prop(
    [
      validConfig,
      fc.constantFrom(...REQUIRED_ROLE_KEYWORD_KEYS),
      fc.nat({ max: 7 }),
      fc.oneof(fc.constant(42), fc.constant(null), fc.constant(undefined), fc.constant(true)),
    ],
    { numRuns: 100 }
  )("rejects when keyword array contains non-string value", (config, role, index, badValue) => {
    const keywords = [...config.roleKeywords[role]] as unknown[];
    const insertIdx = Math.min(index, keywords.length);
    keywords.splice(insertIdx, 0, badValue);

    const badConfig = {
      ...config,
      roleKeywords: {
        ...config.roleKeywords,
        [role]: keywords,
      },
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*roleKeywords/
    );
  });

  test.prop(
    [validConfig, fc.constantFrom("pitchClass", "rhythmic", "velocity", "density") as fc.Arbitrary<"pitchClass" | "rhythmic" | "velocity" | "density">],
    { numRuns: 100 }
  )("rejects when a similarity weight field is non-numeric", (config, field) => {
    const badConfig = {
      ...config,
      similarityWeights: {
        ...config.similarityWeights,
        [field]: "not a number",
      },
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*similarityWeights/
    );
  });

  test.prop(
    [validConfig, fc.constantFrom("pitchClass", "rhythmic", "velocity", "density") as fc.Arbitrary<"pitchClass" | "rhythmic" | "velocity" | "density">],
    { numRuns: 100 }
  )("rejects when a similarity weight field is NaN or Infinity", (config, field) => {
    const badNaN = {
      ...config,
      similarityWeights: {
        ...config.similarityWeights,
        [field]: NaN,
      },
    };
    expect(() => validateContentClassificationFile(badNaN)).toThrow(
      /content-classification\.json.*similarityWeights/
    );

    const badInf = {
      ...config,
      similarityWeights: {
        ...config.similarityWeights,
        [field]: Infinity,
      },
    };
    expect(() => validateContentClassificationFile(badInf)).toThrow(
      /content-classification\.json.*similarityWeights/
    );
  });

  test.prop(
    [
      validConfig,
      fc.constantFrom("drums", "bass", "arpeggio", "pad", "chord", "lead") as fc.Arbitrary<"drums" | "bass" | "arpeggio" | "pad" | "chord" | "lead">,
    ],
    { numRuns: 100 }
  )("rejects when a classification threshold sub-object is missing", (config, role) => {
    const thresholds = { ...config.classificationThresholds };
    delete (thresholds as Record<string, unknown>)[role];

    const badConfig = {
      ...config,
      classificationThresholds: thresholds,
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*classificationThresholds/
    );
  });

  test.prop(
    [validConfig],
    { numRuns: 100 }
  )("rejects when classificationThresholds.drums has a non-numeric field", (config) => {
    const badConfig = {
      ...config,
      classificationThresholds: {
        ...config.classificationThresholds,
        drums: {
          ...config.classificationThresholds.drums,
          pitchRangeLow: "bad" as unknown as number,
        },
      },
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*classificationThresholds\.drums\.pitchRangeLow/
    );
  });

  test.prop(
    [validConfig],
    { numRuns: 100 }
  )("rejects when fillDetection has a non-numeric field", (config) => {
    const badConfig = {
      ...config,
      fillDetection: {
        ...config.fillDetection,
        densityIncreaseFraction: NaN,
      },
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*fillDetection\.densityIncreaseFraction/
    );
  });

  test.prop(
    [validConfig],
    { numRuns: 100 }
  )("rejects when phraseDetectionThreshold is non-numeric", (config) => {
    const badConfig = {
      ...config,
      phraseDetectionThreshold: "not a number" as unknown as number,
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*phraseDetectionThreshold/
    );
  });

  test.prop(
    [validConfig],
    { numRuns: 100 }
  )("rejects when percussionLoopSimilarityThreshold is non-numeric", (config) => {
    const badConfig = {
      ...config,
      percussionLoopSimilarityThreshold: Infinity,
    };

    expect(() => validateContentClassificationFile(badConfig)).toThrow(
      /content-classification\.json.*percussionLoopSimilarityThreshold/
    );
  });

  test.prop(
    [validConfig],
    { numRuns: 100 }
  )("error messages always include 'content-classification.json'", (config) => {
    // Test with non-object root
    try {
      validateContentClassificationFile(null);
    } catch (e) {
      expect((e as Error).message).toContain("content-classification.json");
    }

    // Test with bad weights
    const badConfig = {
      ...config,
      similarityWeights: null,
    };
    try {
      validateContentClassificationFile(badConfig);
    } catch (e) {
      expect((e as Error).message).toContain("content-classification.json");
    }
  });
});
