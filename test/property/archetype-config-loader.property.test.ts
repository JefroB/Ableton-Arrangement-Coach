/**
 * Property 1: Archetype config validator correctly classifies inputs
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateArchetypeConfigFile } from "../../src/core/archetype-config-loader.js";

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RECOGNIZED_ARCHETYPES = [
  "dj-tool",
  "build-drop",
  "verse-chorus",
  "peak-valley",
  "loop",
  "continuous-evolution",
] as const;

const DJ_TOOL_FIELDS = [
  "energyRangeLow", "energyRangeMid", "energyRangeLowPoints", "energyRangeMidPoints",
  "sectionCountLow", "sectionCountMid", "sectionCountLowPoints", "sectionCountMidPoints",
  "introOutroLongBars", "introOutroShortBars", "introOutroLongPoints", "introOutroShortPoints",
  "uniqueNamesLow", "uniqueNamesMid", "uniqueNamesLowPoints", "uniqueNamesMidPoints",
  "noDropsPoints",
] as const;

const PEAK_VALLEY_FIELDS = [
  "energyRangeHigh", "energyRangeMid", "energyRangeHighPoints", "energyRangeMidPoints",
  "directionChangesHigh", "directionChangesMid", "directionChangesLow",
  "directionChangesHighPoints", "directionChangesMidPoints", "directionChangesLowPoints",
  "sectionCountHigh", "sectionCountMid", "sectionCountHighPoints", "sectionCountMidPoints",
  "hasBreakdownPoints", "peakCountThreshold", "peakCountPoints",
] as const;

const VERSE_CHORUS_FIELDS = [
  "bothVerseChrousPoints", "eitherVerseChorusPoints",
  "repeatedPatternsHigh", "repeatedPatternsLow",
  "repeatedPatternsHighPoints", "repeatedPatternsLowPoints",
  "energyRangeLow", "energyRangeHigh", "energyRangeWideLow", "energyRangeWideHigh",
  "energyRangeNarrowPoints", "energyRangeWidePoints",
  "sectionCountLow", "sectionCountHigh", "sectionCountLowMin",
  "sectionCountRangePoints", "sectionCountMinOnlyPoints",
] as const;

const BUILD_DROP_FIELDS = [
  "dropsHigh", "dropsLow", "dropsHighPoints", "dropsLowPoints",
  "buildSectionsHigh", "buildSectionsLow", "buildSectionsHighPoints", "buildSectionsLowPoints",
  "energyRangeHigh", "energyRangeMid", "energyRangeHighPoints", "energyRangeMidPoints",
  "hasBreakdownPoints", "sectionCountLow", "sectionCountHigh", "sectionCountPoints",
] as const;

const CONTINUOUS_EVOLUTION_FIELDS = [
  "uniqueRatioHigh", "uniqueRatioMid", "uniqueRatioHighPoints", "uniqueRatioMidPoints",
  "smoothRatioHigh", "smoothRatioMid", "smoothRatioHighPoints", "smoothRatioMidPoints",
  "smoothDeltaMax", "repeatedPatternsNone", "repeatedPatternsLow",
  "repeatedPatternsNonePoints", "repeatedPatternsLowPoints",
  "sectionCountHigh", "sectionCountMid", "sectionCountHighPoints", "sectionCountMidPoints",
  "noDropsPoints",
] as const;

const LOOP_FIELDS = [
  "energyRangeLow", "energyRangeMid", "energyRangeLowPoints", "energyRangeMidPoints",
  "sectionCountLow", "sectionCountMid", "sectionCountLowPoints", "sectionCountMidPoints",
  "uniqueNamesLow", "uniqueNamesMid", "uniqueNamesLowPoints", "uniqueNamesMidPoints",
  "noDropsPoints", "noIntroOutroPoints",
] as const;

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Valid number in [0, 999] */
const validNum = fc.integer({ min: 0, max: 999 });

/** Build a valid scoring sub-object from its field list */
function validScoringObj(fields: readonly string[]): fc.Arbitrary<Record<string, number>> {
  return fc.tuple(...fields.map(() => validNum)).map(values => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < fields.length; i++) {
      obj[fields[i]!] = values[i]!;
    }
    return obj;
  });
}

/** Valid priority: exactly 6 recognized IDs (permutation) */
const validPriority = fc.shuffledSubarray([...RECOGNIZED_ARCHETYPES], {
  minLength: 6,
  maxLength: 6,
});

/** Valid scoring object with all 6 sub-objects */
const validScoring = fc.tuple(
  validScoringObj(DJ_TOOL_FIELDS),
  validScoringObj(PEAK_VALLEY_FIELDS),
  validScoringObj(VERSE_CHORUS_FIELDS),
  validScoringObj(BUILD_DROP_FIELDS),
  validScoringObj(CONTINUOUS_EVOLUTION_FIELDS),
  validScoringObj(LOOP_FIELDS),
).map(([djTool, peakValley, verseChorus, buildDrop, continuousEvolution, loop]) => ({
  djTool,
  peakValley,
  verseChorus,
  buildDrop,
  continuousEvolution,
  loop,
}));

/** Full valid archetype config */
const validConfig = fc.tuple(
  validPriority,
  validNum,
  validNum,
  validNum,
  validNum,
  validScoring,
).map(([priority, dropDetectionThreshold, genrePriorBoost, maxScoreCap, lowConfidenceThreshold, scoring]) => ({
  priority,
  dropDetectionThreshold,
  genrePriorBoost,
  maxScoreCap,
  lowConfidenceThreshold,
  scoring,
}));

// —— Invalid generators ——

/** Priority with wrong length (0-5 or 7-10 entries) */
const invalidPriorityLength = fc.oneof(
  fc.array(fc.constantFrom(...RECOGNIZED_ARCHETYPES), { minLength: 0, maxLength: 5 }),
  fc.array(fc.constantFrom(...RECOGNIZED_ARCHETYPES), { minLength: 7, maxLength: 10 }),
);

/** Priority with unrecognized ID */
const invalidPriorityContents = fc.tuple(
  fc.shuffledSubarray([...RECOGNIZED_ARCHETYPES], { minLength: 5, maxLength: 5 }),
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => !(RECOGNIZED_ARCHETYPES as readonly string[]).includes(s)),
).map(([valid, bad]) => [...valid, bad]);

/** An invalid number: NaN, Infinity, negative, or out-of-range */
const invalidNum = fc.oneof(
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.integer({ min: -100, max: -1 }),
  fc.integer({ min: 1000, max: 9999 }),
);

/** Scoring sub-object with one invalid field */
function corruptedScoringObj(fields: readonly string[]): fc.Arbitrary<Record<string, unknown>> {
  return fc.tuple(
    validScoringObj(fields),
    fc.integer({ min: 0, max: fields.length - 1 }),
    invalidNum,
  ).map(([obj, idx, badVal]) => {
    const copy = { ...obj };
    (copy as Record<string, unknown>)[fields[idx]!] = badVal;
    return copy;
  });
}

/** Top-level config with invalid priority length */
const configInvalidPriorityLength = fc.tuple(
  invalidPriorityLength,
  validNum, validNum, validNum, validNum,
  validScoring,
).map(([priority, d, g, m, l, scoring]) => ({
  priority, dropDetectionThreshold: d, genrePriorBoost: g, maxScoreCap: m, lowConfidenceThreshold: l, scoring,
}));

/** Top-level config with invalid priority contents */
const configInvalidPriorityContents = fc.tuple(
  invalidPriorityContents,
  validNum, validNum, validNum, validNum,
  validScoring,
).map(([priority, d, g, m, l, scoring]) => ({
  priority, dropDetectionThreshold: d, genrePriorBoost: g, maxScoreCap: m, lowConfidenceThreshold: l, scoring,
}));

/** Config with invalid top-level threshold */
const configInvalidThreshold = fc.tuple(
  validPriority,
  fc.constantFrom("dropDetectionThreshold", "genrePriorBoost", "maxScoreCap", "lowConfidenceThreshold"),
  invalidNum,
  validNum, validNum, validNum, validNum,
  validScoring,
).map(([priority, badField, badVal, d, g, m, l, scoring]) => {
  const config: Record<string, unknown> = {
    priority,
    dropDetectionThreshold: d,
    genrePriorBoost: g,
    maxScoreCap: m,
    lowConfidenceThreshold: l,
    scoring,
  };
  config[badField] = badVal;
  return config;
});

/** Config with invalid scoring sub-object field */
const configInvalidScoring = fc.tuple(
  validPriority,
  validNum, validNum, validNum, validNum,
  fc.constantFrom(
    { key: "djTool", fields: DJ_TOOL_FIELDS },
    { key: "peakValley", fields: PEAK_VALLEY_FIELDS },
    { key: "verseChorus", fields: VERSE_CHORUS_FIELDS },
    { key: "buildDrop", fields: BUILD_DROP_FIELDS },
    { key: "continuousEvolution", fields: CONTINUOUS_EVOLUTION_FIELDS },
    { key: "loop", fields: LOOP_FIELDS },
  ),
  validScoring,
).chain(([priority, d, g, m, l, target, scoring]) =>
  corruptedScoringObj(target.fields).map(corrupted => ({
    priority,
    dropDetectionThreshold: d,
    genrePriorBoost: g,
    maxScoreCap: m,
    lowConfidenceThreshold: l,
    scoring: { ...scoring, [target.key]: corrupted },
  })),
);

/** Config with missing top-level field */
const configMissingField = fc.tuple(
  validConfig,
  fc.constantFrom("priority", "dropDetectionThreshold", "genrePriorBoost", "maxScoreCap", "lowConfidenceThreshold", "scoring"),
).map(([config, fieldToRemove]) => {
  const copy = { ...config } as Record<string, unknown>;
  delete copy[fieldToRemove];
  return copy;
});

// ━━━ Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: remaining-data-externalization, Property 1: Archetype config validator correctly classifies inputs", () => {
  it("accepts any valid archetype config without throwing", () => {
    fc.assert(
      fc.property(validConfig, (config) => {
        expect(() => validateArchetypeConfigFile(config)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it("rejects configs with invalid priority array length", () => {
    fc.assert(
      fc.property(configInvalidPriorityLength, (config) => {
        expect(() => validateArchetypeConfigFile(config)).toThrow(/archetype-config\.json/);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects configs with unrecognized priority IDs", () => {
    fc.assert(
      fc.property(configInvalidPriorityContents, (config) => {
        expect(() => validateArchetypeConfigFile(config)).toThrow(/archetype-config\.json/);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects configs with invalid top-level thresholds", () => {
    fc.assert(
      fc.property(configInvalidThreshold, (config) => {
        expect(() => validateArchetypeConfigFile(config)).toThrow(/archetype-config\.json/);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects configs with invalid scoring threshold values", () => {
    fc.assert(
      fc.property(configInvalidScoring, (config) => {
        expect(() => validateArchetypeConfigFile(config)).toThrow(/archetype-config\.json/);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects configs with missing top-level fields", () => {
    fc.assert(
      fc.property(configMissingField, (config) => {
        expect(() => validateArchetypeConfigFile(config)).toThrow(/archetype-config\.json/);
      }),
      { numRuns: 50 },
    );
  });
});
