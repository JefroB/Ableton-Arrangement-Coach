/**
 * Property-based tests for Transition Loader validation and data fidelity.
 *
 * Feature: transition-data-externalization
 *
 * Property 1: Validation rejects structurally invalid configs with descriptive errors
 * Property 5: Loaded config data fidelity
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import {
  validateTransitionConfig,
  loadTransitionConfig,
  getTechniqueNames,
  getCategoryPriorities,
  getBoundaryKeywords,
  getSizeConfig,
  getAudioSpectralChangeThreshold,
} from "../../src/core/transition-loader.js";

// Direct JSON import for data equivalence verification
import transitionConfigJson from "../../src/data/transitions/transition-config.json" with { type: "json" };

// ─── Constants ─────────────────────────────────────────────────────────

const VALID_CATEGORIES = ["riser", "drum_fill", "filter_sweep", "volume_dynamics", "impact", "textural_fx"] as const;
const VALID_SIZES = ["small", "medium", "large"] as const;

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary file name for error message testing. */
const fileNameArb = fc.constant("transition-config.json");

/** Generates a valid techniqueNames object. */
const validTechniqueNamesArb = fc.record({
  riser: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  drum_fill: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  filter_sweep: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  volume_dynamics: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  impact: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  textural_fx: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
});

/** Generates a valid categoryPriorities object. */
const validCategoryPrioritiesArb = fc.record({
  positive: fc.array(fc.constantFrom(...VALID_CATEGORIES), { minLength: 1, maxLength: 6 }),
  negative: fc.array(fc.constantFrom(...VALID_CATEGORIES), { minLength: 1, maxLength: 6 }),
  zero: fc.array(fc.constantFrom(...VALID_CATEGORIES), { minLength: 1, maxLength: 6 }),
});

/** Generates a valid boundaryKeywords object. */
const validBoundaryKeywordsArb = fc.record({
  drop: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 8 }),
  breakdown: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 8 }),
});

/** Generates a valid sizeConfig entry. */
const validSizeConfigEntryArb = (allowNull: boolean) =>
  fc.record({
    maxDelta: allowNull ? fc.constant(null) : fc.double({ min: 0.01, max: 100, noNaN: true }),
    techniqueCount: fc.integer({ min: 1, max: 10 }),
    durationBars: fc.tuple(
      fc.double({ min: 0.01, max: 50, noNaN: true }),
      fc.double({ min: 0.01, max: 100, noNaN: true }),
    ).map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]),
    checklistItems: fc.tuple(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 30 }),
    ).map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]),
  });

/** Generates a valid sizeConfig object. */
const validSizeConfigArb = fc.record({
  small: validSizeConfigEntryArb(false),
  medium: validSizeConfigEntryArb(false),
  large: validSizeConfigEntryArb(true),
});

/** Generates a valid audioSpectralChangeThreshold. */
const validThresholdArb = fc.double({ min: 0.001, max: 1.0, noNaN: true });

/** Generates a complete valid TransitionConfigData object. */
const validConfigArb = fc.record({
  techniqueNames: validTechniqueNamesArb,
  categoryPriorities: validCategoryPrioritiesArb,
  boundaryKeywords: validBoundaryKeywordsArb,
  sizeConfig: validSizeConfigArb,
  audioSpectralChangeThreshold: validThresholdArb,
});

// ═══════════════════════════════════════════════════════════════════════
// Property 1: Validation rejects structurally invalid configs with descriptive errors
// ═══════════════════════════════════════════════════════════════════════

// Feature: transition-data-externalization, Property 1: Validation rejects structurally invalid configs
describe("Property 1: Validation rejects structurally invalid configs with descriptive errors", () => {
  /**
   * Validates: Requirements 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
   */

  // ─── Valid configs are accepted ──────────────────────────────────────

  test.prop(
    [validConfigArb],
    { numRuns: 100 },
  )("accepts valid TransitionConfigData objects", (config) => {
    expect(() => validateTransitionConfig(config, "transition-config.json")).not.toThrow();
  });

  // ─── Non-object inputs rejected ─────────────────────────────────────

  test.prop(
    [fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.array(fc.integer()),
    )],
    { numRuns: 100 },
  )("rejects non-object inputs with file name in error", (input) => {
    expect(() => validateTransitionConfig(input, "transition-config.json")).toThrowError(
      /transition-config\.json/,
    );
  });

  // ─── Missing top-level keys ──────────────────────────────────────────

  const topLevelKeys = ["techniqueNames", "categoryPriorities", "boundaryKeywords", "sizeConfig", "audioSpectralChangeThreshold"] as const;

  test.prop(
    [validConfigArb, fc.constantFrom(...topLevelKeys)],
    { numRuns: 100 },
  )("rejects configs with a missing top-level key", (config, keyToRemove) => {
    const broken = { ...config };
    delete (broken as Record<string, unknown>)[keyToRemove];
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*missing required field '${keyToRemove}'`),
    );
  });

  // ─── techniqueNames violations ───────────────────────────────────────

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_CATEGORIES)],
    { numRuns: 100 },
  )("rejects techniqueNames with a missing category key", (config, categoryToRemove) => {
    const broken = { ...config, techniqueNames: { ...config.techniqueNames } };
    delete (broken.techniqueNames as Record<string, unknown>)[categoryToRemove];
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      /transition-config\.json/,
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_CATEGORIES)],
    { numRuns: 100 },
  )("rejects techniqueNames with empty array for a category", (config, category) => {
    const broken = { ...config, techniqueNames: { ...config.techniqueNames, [category]: [] } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*techniqueNames\\.${category}.*empty array`),
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_CATEGORIES)],
    { numRuns: 100 },
  )("rejects techniqueNames with non-array value for a category", (config, category) => {
    const broken = { ...config, techniqueNames: { ...config.techniqueNames, [category]: 42 } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*techniqueNames\\.${category}.*not an array`),
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_CATEGORIES)],
    { numRuns: 100 },
  )("rejects techniqueNames with empty string element", (config, category) => {
    const broken = { ...config, techniqueNames: { ...config.techniqueNames, [category]: ["valid", ""] } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*techniqueNames\\.${category}.*empty string`),
    );
  });

  // ─── categoryPriorities violations ───────────────────────────────────

  const directionKeys = ["positive", "negative", "zero"] as const;

  test.prop(
    [validConfigArb, fc.constantFrom(...directionKeys)],
    { numRuns: 100 },
  )("rejects categoryPriorities with a missing direction key", (config, dirToRemove) => {
    const broken = { ...config, categoryPriorities: { ...config.categoryPriorities } };
    delete (broken.categoryPriorities as Record<string, unknown>)[dirToRemove];
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      /transition-config\.json/,
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...directionKeys)],
    { numRuns: 100 },
  )("rejects categoryPriorities with invalid category string", (config, dir) => {
    const broken = { ...config, categoryPriorities: { ...config.categoryPriorities, [dir]: ["invalid_category"] } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*categoryPriorities\\.${dir}.*invalid category`),
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...directionKeys)],
    { numRuns: 100 },
  )("rejects categoryPriorities with empty array", (config, dir) => {
    const broken = { ...config, categoryPriorities: { ...config.categoryPriorities, [dir]: [] } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*categoryPriorities\\.${dir}.*empty array`),
    );
  });

  // ─── boundaryKeywords violations ─────────────────────────────────────

  const keywordKeys = ["drop", "breakdown"] as const;

  test.prop(
    [validConfigArb, fc.constantFrom(...keywordKeys)],
    { numRuns: 100 },
  )("rejects boundaryKeywords with a missing key", (config, keyToRemove) => {
    const broken = { ...config, boundaryKeywords: { ...config.boundaryKeywords } };
    delete (broken.boundaryKeywords as Record<string, unknown>)[keyToRemove];
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      /transition-config\.json/,
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...keywordKeys)],
    { numRuns: 100 },
  )("rejects boundaryKeywords with empty array", (config, key) => {
    const broken = { ...config, boundaryKeywords: { ...config.boundaryKeywords, [key]: [] } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*boundaryKeywords\\.${key}.*empty array`),
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...keywordKeys)],
    { numRuns: 100 },
  )("rejects boundaryKeywords with empty string element", (config, key) => {
    const broken = { ...config, boundaryKeywords: { ...config.boundaryKeywords, [key]: ["valid", ""] } };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*boundaryKeywords\\.${key}.*empty string`),
    );
  });

  // ─── sizeConfig violations ───────────────────────────────────────────

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_SIZES)],
    { numRuns: 100 },
  )("rejects sizeConfig with a missing size key", (config, sizeToRemove) => {
    const broken = { ...config, sizeConfig: { ...config.sizeConfig } };
    delete (broken.sizeConfig as Record<string, unknown>)[sizeToRemove];
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      /transition-config\.json/,
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_SIZES)],
    { numRuns: 100 },
  )("rejects sizeConfig with non-positive techniqueCount", (config, size) => {
    const broken = {
      ...config,
      sizeConfig: {
        ...config.sizeConfig,
        [size]: { ...config.sizeConfig[size], techniqueCount: 0 },
      },
    };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*sizeConfig\\.${size}\\.techniqueCount.*positive integer`),
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_SIZES)],
    { numRuns: 100 },
  )("rejects sizeConfig with durationBars where min > max", (config, size) => {
    const broken = {
      ...config,
      sizeConfig: {
        ...config.sizeConfig,
        [size]: { ...config.sizeConfig[size], durationBars: [10, 2] },
      },
    };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*sizeConfig\\.${size}\\.durationBars.*min exceeds max`),
    );
  });

  test.prop(
    [validConfigArb, fc.constantFrom(...VALID_SIZES)],
    { numRuns: 100 },
  )("rejects sizeConfig with checklistItems where min > max", (config, size) => {
    const broken = {
      ...config,
      sizeConfig: {
        ...config.sizeConfig,
        [size]: { ...config.sizeConfig[size], checklistItems: [5, 2] },
      },
    };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      new RegExp(`transition-config\\.json.*sizeConfig\\.${size}\\.checklistItems.*min exceeds max`),
    );
  });

  // ─── audioSpectralChangeThreshold violations ─────────────────────────

  test.prop(
    [validConfigArb, fc.oneof(
      fc.constant(0),
      fc.constant(-0.5),
      fc.constant(1.1),
      fc.constant(2),
    )],
    { numRuns: 100 },
  )("rejects audioSpectralChangeThreshold outside (0, 1]", (config, badThreshold) => {
    const broken = { ...config, audioSpectralChangeThreshold: badThreshold };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      /transition-config\.json.*audioSpectralChangeThreshold.*> 0 and <= 1/,
    );
  });

  test.prop(
    [validConfigArb],
    { numRuns: 100 },
  )("rejects audioSpectralChangeThreshold that is not a number", (config) => {
    const broken = { ...config, audioSpectralChangeThreshold: "0.7" };
    expect(() => validateTransitionConfig(broken, "transition-config.json")).toThrowError(
      /transition-config\.json.*audioSpectralChangeThreshold.*must be a number/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 5: Loaded config data fidelity
// ═══════════════════════════════════════════════════════════════════════

// Feature: transition-data-externalization, Property 5: Loaded config data fidelity
describe("Property 5: Loaded config data fidelity", () => {
  /**
   * Validates: Requirements 3.3, 3.4, 5.1, 5.2, 5.3, 5.5, 5.6
   *
   * Each accessor returns data deeply equal to the corresponding section
   * of the raw JSON — no data loss, mutation, or transformation.
   */

  test("loadTransitionConfig() returns complete data deeply equal to raw JSON", () => {
    const loaded = loadTransitionConfig();
    expect(loaded).toEqual(transitionConfigJson);
  });

  test("getTechniqueNames() returns data deeply equal to raw JSON techniqueNames", () => {
    const loaded = getTechniqueNames();
    expect(loaded).toEqual(transitionConfigJson.techniqueNames);
  });

  test("getCategoryPriorities() returns data deeply equal to raw JSON categoryPriorities", () => {
    const loaded = getCategoryPriorities();
    expect(loaded).toEqual(transitionConfigJson.categoryPriorities);
  });

  test("getBoundaryKeywords() returns data deeply equal to raw JSON boundaryKeywords", () => {
    const loaded = getBoundaryKeywords();
    expect(loaded).toEqual(transitionConfigJson.boundaryKeywords);
  });

  test("getSizeConfig() returns data deeply equal to raw JSON sizeConfig", () => {
    const loaded = getSizeConfig();
    expect(loaded).toEqual(transitionConfigJson.sizeConfig);
  });

  test("getAudioSpectralChangeThreshold() returns value equal to raw JSON threshold", () => {
    const loaded = getAudioSpectralChangeThreshold();
    expect(loaded).toBe(transitionConfigJson.audioSpectralChangeThreshold);
    expect(loaded).toBe(0.7);
  });

  test("accessor return values have correct array lengths (no truncation)", () => {
    const names = getTechniqueNames();
    for (const category of VALID_CATEGORIES) {
      expect(names[category].length).toBe(
        (transitionConfigJson.techniqueNames as Record<string, string[]>)[category].length,
      );
    }
  });

  test("validation passes for the actual JSON file", () => {
    expect(() => validateTransitionConfig(transitionConfigJson, "transition-config.json")).not.toThrow();
  });
});
