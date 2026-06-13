/**
 * Property-based tests for the Auto-Generation module (transitions).
 *
 * Feature: m5-notes-checklist, Property 7: Auto-generation produces correct items from transitions
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { TransitionRecommendation, ChecklistItem } from "../../src/core/transition-engine.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a valid checklist item id (alphanumeric string). */
const checklistItemIdArb = fc.stringMatching(/^[a-z0-9]{1,20}$/);

/** Generate valid checklist item text (1–150 chars, non-empty). */
const checklistItemTextArb = fc.string({ minLength: 1, maxLength: 150 }).filter((s) => s.trim().length > 0);

/** Generate a single ChecklistItem. */
const checklistItemArb: fc.Arbitrary<ChecklistItem> = fc.record({
  id: checklistItemIdArb,
  text: checklistItemTextArb,
  completed: fc.boolean(),
});

/** Generate a valid section ID. */
const sectionIdArb = fc.stringMatching(/^section-[a-z0-9]{1,10}$/);

/** Generate a valid recommendation ID. */
const recommendationIdArb = fc.stringMatching(/^rec-[a-z0-9]{1,10}$/);

/**
 * Generate a TransitionRecommendation with the fields that matter for
 * checklist generation: id, fromSectionId, toSectionId, and checklist.
 * Other fields are set to valid defaults since the generator only reads
 * the above fields.
 */
const transitionRecommendationArb: fc.Arbitrary<TransitionRecommendation> = fc
  .record({
    id: recommendationIdArb,
    fromSectionId: sectionIdArb,
    toSectionId: sectionIdArb,
    checklist: fc.array(checklistItemArb, { minLength: 1, maxLength: 5 }),
  })
  .map((rec) => ({
    ...rec,
    // Fields required by the interface but not used by the generator
    energyDelta: 0,
    transitionSize: "medium" as const,
    suggestedDurationBars: 8,
    techniques: [],
    boundaryType: "normal" as const,
    rationale: "test rationale",
  }));

/**
 * Generate a list of transition recommendations with unique IDs and
 * unique checklist item IDs within each recommendation.
 * Also returns the set of all toSectionIds to use as existingSections.
 */
const transitionTestInputArb = fc
  .array(transitionRecommendationArb, { minLength: 1, maxLength: 5 })
  .chain((recs) => {
    // Ensure unique recommendation IDs by appending index
    const uniqueRecs = recs.map((rec, i) => ({
      ...rec,
      id: `${rec.id}-${i}`,
      // Ensure unique checklist item IDs within each recommendation
      checklist: rec.checklist.map((item, j) => ({
        ...item,
        id: `${item.id}-${j}`,
      })),
    }));
    return fc.constant(uniqueRecs);
  });

// ─── Property 7: Auto-generation produces correct items from transitions ───

// Feature: m5-notes-checklist, Property 7: Auto-generation produces correct items from transitions
describe("Property 7: Auto-generation produces correct items from transitions", () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any set of transition recommendations, the auto-generation module SHALL
   * produce one SectionChecklistItem per checklist item in each recommendation,
   * targeting the recommendation's toSectionId, with source="transition", text
   * matching the original checklist item text verbatim, and a stable id derived
   * from the recommendation id and original item id.
   */
  test.prop([transitionTestInputArb], { numRuns: 100 })(
    "produces one item per checklist entry per recommendation with correct fields",
    (recommendations) => {
      // Collect all toSectionIds so they are in the existingSections list
      const allSectionIds = [
        ...new Set(recommendations.flatMap((r) => [r.fromSectionId, r.toSectionId])),
      ];

      const result = generateSectionChecklists({
        issues: [],
        transitionRecommendations: recommendations,
        existingSections: allSectionIds,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      // For each recommendation, verify each checklist item produces exactly one output item
      for (const recommendation of recommendations) {
        for (const checklistItem of recommendation.checklist) {
          const expectedId = `transition-${recommendation.id}-${checklistItem.id}`;
          const expectedSectionId = recommendation.toSectionId;

          // Find all items in the result that match this expected ID
          const allResultItems = Object.values(result).flat();
          const matchingItems = allResultItems.filter((item) => item.id === expectedId);

          // 1. Exactly one item exists with the expected stable ID
          expect(matchingItems).toHaveLength(1);

          const item = matchingItems[0]!;

          // 2. item.source === "transition"
          expect(item.source).toBe("transition");

          // 3. item.text === original checklist item text (verbatim)
          expect(item.text).toBe(checklistItem.text);

          // 4. item.sectionId === recommendation.toSectionId
          expect(item.sectionId).toBe(expectedSectionId);
        }
      }
    },
  );
});
