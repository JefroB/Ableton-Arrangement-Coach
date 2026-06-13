/**
 * Property-based tests for Auto-Generation Idempotence.
 *
 * Feature: m5-notes-checklist, Property 8: Auto-generation idempotence
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { ChecklistGeneratorInput } from "../../src/core/checklist-generator.js";
import type { Issue, IssueType, IssueSeverity } from "../../src/core/issue-types.js";
import type { TransitionRecommendation, ChecklistItem, TransitionCategory, TransitionSize, BoundaryType, Technique } from "../../src/core/transition-engine.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-empty alphanumeric-ish ID string. */
const idArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /\S/.test(s));

/** Generate a section ID. */
const sectionIdArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,14}$/);

/** Generate a list of unique section IDs (at least 1). */
const sectionIdsArbitrary = fc
  .array(sectionIdArbitrary, { minLength: 1, maxLength: 8 })
  .map((ids) => [...new Set(ids)])
  .filter((ids) => ids.length >= 1);

/** Generate an issue severity. */
const severityArbitrary: fc.Arbitrary<IssueSeverity> = fc.constantFrom("info", "warning", "critical");

/** Generate an issue type. */
const issueTypeArbitrary: fc.Arbitrary<IssueType> = fc.constantFrom(
  "flat-energy",
  "missing-transition",
  "repetition",
  "abrupt-change",
  "frequency-crowding",
  "intro-length",
  "outro-length",
  "intro-energy",
  "energy-mismatch",
);

/** Generate an issue that references sectionIds from the given pool. */
function issueArbitrary(sectionPool: string[]): fc.Arbitrary<Issue> {
  return fc.record({
    id: idArbitrary,
    type: issueTypeArbitrary,
    severity: severityArbitrary,
    sectionIds: fc
      .subarray(sectionPool, { minLength: 1, maxLength: Math.min(3, sectionPool.length) })
      .map((ids) => ids as readonly string[]),
    message: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => /\S/.test(s)),
  });
}

/** Generate a transition category. */
const categoryArbitrary: fc.Arbitrary<TransitionCategory> = fc.constantFrom(
  "riser", "drum_fill", "filter_sweep", "volume_dynamics", "impact", "textural_fx",
);

/** Generate a technique. */
const techniqueArbitrary: fc.Arbitrary<Technique> = fc.record({
  category: categoryArbitrary,
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /\S/.test(s)),
  durationBars: fc.integer({ min: 1, max: 32 }),
});

/** Generate a checklist item for a transition recommendation. */
function checklistItemArbitrary(recommendationId: string, index: number): fc.Arbitrary<ChecklistItem> {
  return fc.record({
    id: fc.constant(`${recommendationId}-cl-${index}`),
    text: fc.string({ minLength: 1, maxLength: 150 }).filter((s) => /\S/.test(s)),
    completed: fc.constant(false),
  });
}

/** Generate a transition size. */
const transitionSizeArbitrary: fc.Arbitrary<TransitionSize> = fc.constantFrom("small", "medium", "large");

/** Generate a boundary type. */
const boundaryTypeArbitrary: fc.Arbitrary<BoundaryType> = fc.constantFrom("drop", "breakdown", "build", "normal");

/** Generate a transition recommendation targeting a section from the pool. */
function transitionRecommendationArbitrary(sectionPool: string[]): fc.Arbitrary<TransitionRecommendation> {
  return fc.record({
    id: idArbitrary,
    fromSectionId: fc.constantFrom(...sectionPool),
    toSectionId: fc.constantFrom(...sectionPool),
    energyDelta: fc.integer({ min: -9, max: 9 }),
    transitionSize: transitionSizeArbitrary,
    suggestedDurationBars: fc.integer({ min: 2, max: 32 }),
    techniques: fc.array(techniqueArbitrary, { minLength: 1, maxLength: 3 }),
    boundaryType: boundaryTypeArbitrary,
    rationale: fc.string({ minLength: 1, maxLength: 120 }).filter((s) => /\S/.test(s)),
    checklist: fc.integer({ min: 2, max: 5 }).chain((count) =>
      fc.tuple(idArbitrary).chain(([recId]) =>
        fc.tuple(
          ...Array.from({ length: count }, (_, i) => checklistItemArbitrary(recId, i))
        ).map((items) => items as readonly ChecklistItem[])
      )
    ),
  });
}

/** Generate a map of existing completions from section IDs and some item IDs. */
function existingCompletionsArbitrary(sectionPool: string[]): fc.Arbitrary<ReadonlyMap<string, boolean>> {
  // Generate some plausible item IDs and random booleans
  const entryArbitrary = fc.tuple(
    fc.oneof(
      idArbitrary.map((id) => `issue-${id}`),
      fc.tuple(idArbitrary, fc.integer({ min: 0, max: 4 })).map(([id, idx]) => `transition-${id}-${id}-cl-${idx}`),
    ),
    fc.boolean(),
  );

  return fc.array(entryArbitrary, { minLength: 0, maxLength: 10 }).map(
    (entries) => new Map(entries),
  );
}

/**
 * Generate a complete valid ChecklistGeneratorInput.
 */
const checklistGeneratorInputArbitrary: fc.Arbitrary<ChecklistGeneratorInput> = sectionIdsArbitrary.chain(
  (sectionPool) =>
    fc.record({
      issues: fc.array(issueArbitrary(sectionPool), { minLength: 0, maxLength: 5 }),
      transitionRecommendations: fc.array(transitionRecommendationArbitrary(sectionPool), { minLength: 0, maxLength: 5 }),
      existingSections: fc.constant(sectionPool as readonly string[]),
      existingCompletions: existingCompletionsArbitrary(sectionPool),
      selectedGenre: fc.constant(null as string | null),
    }),
);

// ─── Property 8: Auto-generation idempotence ───────────────────────────

// Feature: m5-notes-checklist, Property 8: Auto-generation idempotence
describe("Property 8: Auto-generation idempotence", () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any valid input to the auto-generation module, invoking it twice
   * with identical inputs SHALL produce identical output (same item IDs,
   * same text, same ordering).
   */
  test.prop([checklistGeneratorInputArbitrary], { numRuns: 100 })(
    "same inputs produce identical output (IDs, text, ordering)",
    (input) => {
      const result1 = generateSectionChecklists(input);
      const result2 = generateSectionChecklists(input);

      // Both results should be deeply equal
      expect(result2).toEqual(result1);

      // Additionally verify key structural properties are identical:
      // Same set of section keys
      const keys1 = Object.keys(result1).sort();
      const keys2 = Object.keys(result2).sort();
      expect(keys2).toEqual(keys1);

      // Same number of items per section, same IDs in same order
      for (const sectionId of keys1) {
        const items1 = result1[sectionId]!;
        const items2 = result2[sectionId]!;
        expect(items2.length).toBe(items1.length);

        for (let i = 0; i < items1.length; i++) {
          expect(items2[i]!.id).toBe(items1[i]!.id);
          expect(items2[i]!.text).toBe(items1[i]!.text);
          expect(items2[i]!.source).toBe(items1[i]!.source);
          expect(items2[i]!.completed).toBe(items1[i]!.completed);
          expect(items2[i]!.sectionId).toBe(items1[i]!.sectionId);
        }
      }
    },
  );
});
