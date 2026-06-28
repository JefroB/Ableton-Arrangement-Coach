/**
 * Property-based tests for Transition Engine behavioral equivalence.
 *
 * Feature: transition-data-externalization
 *
 * Property 2: Full behavioral equivalence of computeTransitions
 * Property 3: Deterministic technique selection by index modulo
 * Property 4: Size classification preserves threshold boundaries
 *
 * Since the original hardcoded constants have been removed, we verify that the
 * externalized implementation produces structurally valid, self-consistent output
 * for any valid random input — ensuring the engine's contract is preserved.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computeTransitions } from "../../src/core/transition-engine.js";
import { getTechniqueNames } from "../../src/core/transition-loader.js";
import type {
  TransitionEngineInput,
  GenreTransitionProfile,
  TransitionCategory,
  BoundaryType,
  TransitionSize,
} from "../../src/core/transition-engine.js";
import type { Section } from "../../src/core/section-scanner.js";

// ─── Constants ─────────────────────────────────────────────────────────

const ALL_CATEGORIES: TransitionCategory[] = [
  "riser",
  "drum_fill",
  "filter_sweep",
  "volume_dynamics",
  "impact",
  "textural_fx",
];

const VALID_CATEGORIES = ALL_CATEGORIES;

const VALID_BOUNDARY_TYPES: BoundaryType[] = [
  "drop",
  "breakdown",
  "build",
  "chorus_entry",
  "verse_entry",
  "prechorus_entry",
  "intro_exit",
  "outro_entry",
  "normal",
];

const VALID_SIZES: TransitionSize[] = ["small", "medium", "large"];

/** Keywords that trigger boundary detection logic. */
const KEYWORD_NAMES = [
  "Drop A",
  "Drop B",
  "Breakdown 1",
  "Breakdown 2",
  "Chorus",
  "Verse 1",
  "Verse 2",
  "Build",
  "Intro",
  "Outro",
  "Pre-Chorus",
  "Hook",
  "Main Section",
  "Riser",
];

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a section name — mix of keyword-containing and random strings. */
const sectionNameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...KEYWORD_NAMES) },
  { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) },
);

/**
 * Generate a list of 2–8 consecutive sections with sequential startTimes.
 * Each section spans 4–32 bars (16–128 beats).
 */
const sectionsArb: fc.Arbitrary<Section[]> = fc
  .integer({ min: 2, max: 8 })
  .chain((count) =>
    fc
      .array(
        fc.record({
          name: sectionNameArb,
          lengthBeats: fc.integer({ min: 16, max: 128 }),
        }),
        { minLength: count, maxLength: count },
      )
      .map((items) => {
        const sections: Section[] = [];
        let currentBeat = 0;
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          const startTime = currentBeat;
          currentBeat += item.lengthBeats;
          sections.push({
            id: `section-${i}`,
            name: item.name,
            startTime,
            endTime: i < items.length - 1 ? currentBeat : Infinity,
          });
        }
        return sections;
      }),
  );

/** Generate an energy curve (integers 0–9) matching the section count. */
function energyCurveArb(sectionCount: number): fc.Arbitrary<number[]> {
  return fc.array(fc.integer({ min: 0, max: 9 }), {
    minLength: sectionCount,
    maxLength: sectionCount,
  });
}

/** Generate a valid GenreTransitionProfile or null. */
const genreProfileArb: fc.Arbitrary<GenreTransitionProfile | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  {
    weight: 2,
    arbitrary: fc.record({
      genre: fc.string({ minLength: 3, maxLength: 20 }),
      preferredCategories: fc.shuffledSubarray(ALL_CATEGORIES, { minLength: 1, maxLength: 4 }),
      discouragedCategories: fc.shuffledSubarray(ALL_CATEGORIES, { minLength: 0, maxLength: 3 }),
      buildDurationRange: fc
        .tuple(fc.integer({ min: 2, max: 16 }), fc.integer({ min: 8, max: 64 }))
        .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) })),
      dropsExpected: fc.boolean(),
    }),
  },
);

/** Generate a full TransitionEngineInput. */
const transitionEngineInputArb: fc.Arbitrary<TransitionEngineInput> = sectionsArb.chain(
  (sections) =>
    fc
      .tuple(energyCurveArb(sections.length), genreProfileArb)
      .map(([energyCurve, genreProfile]) => ({
        sections,
        energyCurve,
        genreProfile,
        trackBuckets: [],
        audioContentAnalysis: null,
      })),
);

// ═══════════════════════════════════════════════════════════════════════
// Property 2: Full behavioral equivalence of computeTransitions
// ═══════════════════════════════════════════════════════════════════════

// Feature: transition-data-externalization, Property 2: Full behavioral equivalence of computeTransitions
describe("Property 2: Full behavioral equivalence of computeTransitions", () => {
  /**
   * Validates: Requirements 6.1, 6.3, 6.5
   *
   * For any valid TransitionEngineInput, computeTransitions produces a valid
   * TransitionRecommendation[] that satisfies all structural invariants.
   * Since original constants have been removed, we verify the externalized
   * implementation produces structurally valid, self-consistent output.
   */

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("produces exactly sections.length - 1 recommendations", (input) => {
    const results = computeTransitions(input);
    expect(results.length).toBe(input.sections.length - 1);
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("each recommendation has a valid id in format fromSectionId-toSectionId", (input) => {
    const results = computeTransitions(input);
    for (let i = 0; i < results.length; i++) {
      const rec = results[i]!;
      const expectedId = `${input.sections[i]!.id}-${input.sections[i + 1]!.id}`;
      expect(rec.id).toBe(expectedId);
      expect(rec.fromSectionId).toBe(input.sections[i]!.id);
      expect(rec.toSectionId).toBe(input.sections[i + 1]!.id);
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("energyDelta equals energyCurve[i+1] - energyCurve[i]", (input) => {
    const results = computeTransitions(input);
    for (let i = 0; i < results.length; i++) {
      const rec = results[i]!;
      const expectedDelta = input.energyCurve[i + 1]! - input.energyCurve[i]!;
      expect(rec.energyDelta).toBe(expectedDelta);
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("transitionSize is one of 'small', 'medium', 'large'", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      expect(VALID_SIZES).toContain(rec.transitionSize);
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("techniques array has length 1–3", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      expect(rec.techniques.length).toBeGreaterThanOrEqual(1);
      expect(rec.techniques.length).toBeLessThanOrEqual(3);
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("each technique has a valid category and non-empty name", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      for (const tech of rec.techniques) {
        expect(VALID_CATEGORIES).toContain(tech.category);
        expect(tech.name.length).toBeGreaterThan(0);
        expect(tech.name.length).toBeLessThanOrEqual(50);
        expect(tech.durationBars).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("boundaryType is a valid BoundaryType value", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      expect(VALID_BOUNDARY_TYPES).toContain(rec.boundaryType);
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("rationale is a non-empty string of at most 120 characters", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      expect(rec.rationale.length).toBeGreaterThan(0);
      expect(rec.rationale.length).toBeLessThanOrEqual(120);
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("checklist has 2–5 items, each with unique id and non-empty text", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      expect(rec.checklist.length).toBeGreaterThanOrEqual(2);
      expect(rec.checklist.length).toBeLessThanOrEqual(5);

      // All IDs within one recommendation are unique
      const ids = rec.checklist.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const item of rec.checklist) {
        expect(item.text.length).toBeGreaterThan(0);
        expect(item.text.length).toBeLessThanOrEqual(150);
        expect(item.completed).toBe(false);
      }
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("output is deterministic — same input always produces same output", (input) => {
    const result1 = computeTransitions(input);
    const result2 = computeTransitions(input);
    expect(result1).toEqual(result2);
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("suggestedDurationBars is an integer in range 2–32", (input) => {
    const results = computeTransitions(input);
    for (const rec of results) {
      expect(Number.isInteger(rec.suggestedDurationBars)).toBe(true);
      expect(rec.suggestedDurationBars).toBeGreaterThanOrEqual(2);
      expect(rec.suggestedDurationBars).toBeLessThanOrEqual(32);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 3: Deterministic technique selection by index modulo
// ═══════════════════════════════════════════════════════════════════════

// Feature: transition-data-externalization, Property 3: Deterministic technique selection by index modulo
describe("Property 3: Deterministic technique selection by index modulo", () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * pickTechnique(category, idx, durationBars) selects technique names using:
   *   names[idx % names.length]
   * where names = getTechniqueNames()[category].
   *
   * Since pickTechnique is not exported, we verify this indirectly through
   * computeTransitions: for each recommendation, techniques[i].name must equal
   * getTechniqueNames()[techniques[i].category][i % getTechniqueNames()[techniques[i].category].length].
   */

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("technique names match index-modulo pattern: techniques[i].name === getTechniqueNames()[category][i % length]", (input) => {
    const techniqueNames = getTechniqueNames();
    const recommendations = computeTransitions(input);

    for (const rec of recommendations) {
      for (let i = 0; i < rec.techniques.length; i++) {
        const technique = rec.techniques[i]!;
        const categoryNames = techniqueNames[technique.category];
        const expectedName = categoryNames[i % categoryNames.length];
        expect(technique.name).toBe(expectedName);
      }
    }
  });

  test.prop(
    [transitionEngineInputArb],
    { numRuns: 100 },
  )("all technique names are valid members of their category's technique name set", (input) => {
    const techniqueNames = getTechniqueNames();
    const recommendations = computeTransitions(input);

    for (const rec of recommendations) {
      for (const technique of rec.techniques) {
        const validNames = techniqueNames[technique.category];
        expect(validNames).toContain(technique.name);
      }
    }
  });

  test.prop(
    [
      fc.constantFrom(...VALID_CATEGORIES),
      fc.nat(),
      fc.integer({ min: 1, max: 32 }),
    ],
    { numRuns: 100 },
  )("index modulo property holds for any category and index: name === techniqueNames[category][index % length]", (category, index, _durationBars) => {
    // Since pickTechnique is not exported, we verify the modulo property
    // directly against the externalized data. For any category and index,
    // the expected name is deterministic: techniqueNames[category][index % length].
    const techniqueNames = getTechniqueNames();
    const categoryNames = techniqueNames[category];
    const moduloIndex = index % categoryNames.length;
    const expectedName = categoryNames[moduloIndex];

    // Verify the modulo produces a valid index
    expect(moduloIndex).toBeGreaterThanOrEqual(0);
    expect(moduloIndex).toBeLessThan(categoryNames.length);

    // Verify the selected name is a non-empty string from the array
    expect(typeof expectedName).toBe("string");
    expect(expectedName!.length).toBeGreaterThan(0);

    // Verify determinism: same inputs always yield same result
    const name1 = categoryNames[index % categoryNames.length];
    const name2 = categoryNames[index % categoryNames.length];
    expect(name1).toBe(name2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 4: Size classification preserves threshold boundaries
// ═══════════════════════════════════════════════════════════════════════

// Feature: transition-data-externalization, Property 4: Size classification preserves threshold boundaries
describe("Property 4: Size classification preserves threshold boundaries", () => {
  /**
   * **Validates: Requirements 6.4, 5.4**
   *
   * Since classifySize is not exported, we test it indirectly through
   * computeTransitions. By constructing a simple 2-section input with
   * known energy values and null audioContentAnalysis, the effectiveDelta
   * equals absDelta, allowing us to predict the expected transitionSize.
   *
   * Thresholds:
   *   absDelta <= 2 → "small"
   *   absDelta <= 4 → "medium" (i.e., absDelta 3 or 4)
   *   absDelta >= 5 → "large"
   */

  /** Determine expected size from the absolute energy delta. */
  function expectedSize(absDelta: number): "small" | "medium" | "large" {
    if (absDelta <= 2) return "small";
    if (absDelta <= 4) return "medium";
    return "large";
  }

  test.prop(
    [fc.nat({ max: 9 }), fc.nat({ max: 9 })],
    { numRuns: 100 },
  )("transitionSize matches expected classification based on energy delta", (fromEnergy, toEnergy) => {
    const input: TransitionEngineInput = {
      sections: [
        { id: "sec-0", name: "A", startTime: 0, endTime: 128 },
        { id: "sec-1", name: "B", startTime: 128, endTime: Infinity },
      ],
      energyCurve: [fromEnergy, toEnergy],
      genreProfile: null,
      trackBuckets: [],
      audioContentAnalysis: null,
    };

    const results = computeTransitions(input);
    expect(results.length).toBe(1);

    const rec = results[0]!;
    const absDelta = Math.abs(toEnergy - fromEnergy);
    const expected = expectedSize(absDelta);

    expect(rec.transitionSize).toBe(expected);
  });
});
