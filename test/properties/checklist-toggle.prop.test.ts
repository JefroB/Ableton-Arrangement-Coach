/**
 * Property-based tests for Checklist Toggle Correctness.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import type { SectionChecklistItem, ChecklistSource } from "../../src/core/notes-types.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-empty alphanumeric ID string. */
const idArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

/** Generate a checklist source. */
const sourceArbitrary: fc.Arbitrary<ChecklistSource> = fc.constantFrom("issue", "transition", "manual");

/** Generate a single SectionChecklistItem given a sectionId. */
function checklistItemArbitrary(sectionId: string): fc.Arbitrary<SectionChecklistItem> {
  return fc.record({
    id: idArbitrary,
    sectionId: fc.constant(sectionId),
    text: fc.string({ minLength: 1, maxLength: 150 }),
    source: sourceArbitrary,
    completed: fc.boolean(),
  });
}

/**
 * Generate a sectionChecklists map with at least one section containing
 * at least one item. Returns:
 * - sectionChecklists: the full map
 * - targetSectionId: one valid sectionId (with items)
 * - targetItemId: one valid itemId within that section
 */
const validToggleInputArbitrary = fc
  .array(idArbitrary, { minLength: 1, maxLength: 5 })
  .chain((sectionIds) => {
    // Ensure unique sectionIds
    const uniqueSectionIds = [...new Set(sectionIds)];
    if (uniqueSectionIds.length === 0) {
      return fc.constant(null);
    }

    // Generate checklist items per section (at least 1 item in each section)
    const itemsPerSection = uniqueSectionIds.map((sectionId) =>
      fc
        .array(checklistItemArbitrary(sectionId), { minLength: 1, maxLength: 5 })
        .map((items) => {
          // Ensure unique item IDs within the section
          const seenIds = new Set<string>();
          return items.filter((item) => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
          });
        })
        .filter((items) => items.length > 0)
    );

    return fc.tuple(...itemsPerSection).map((allItems) => {
      const sectionChecklists: Record<string, SectionChecklistItem[]> = {};
      for (let i = 0; i < uniqueSectionIds.length; i++) {
        sectionChecklists[uniqueSectionIds[i]!] = allItems[i]!;
      }
      // Pick a random target section and item (use first for determinism in generation)
      const targetSectionId = uniqueSectionIds[0]!;
      const targetItemId = allItems[0]![0]!.id;
      return { sectionChecklists, targetSectionId, targetItemId };
    });
  })
  .filter((v): v is NonNullable<typeof v> => v !== null);

/**
 * Generate an invalid sectionId that is NOT in the generated sectionChecklists.
 */
const invalidSectionIdArbitrary = fc
  .tuple(
    validToggleInputArbitrary,
    idArbitrary,
  )
  .map(([input, candidateId]) => ({
    ...input,
    invalidSectionId: Object.keys(input.sectionChecklists).includes(candidateId)
      ? `__invalid_${candidateId}__`
      : candidateId,
  }));

/**
 * Generate a valid sectionId but an invalid itemId (not present in that section).
 */
const invalidItemIdArbitrary = fc
  .tuple(
    validToggleInputArbitrary,
    idArbitrary,
  )
  .map(([input, candidateId]) => {
    const sectionItems = input.sectionChecklists[input.targetSectionId]!;
    const existingIds = sectionItems.map((item) => item.id);
    const invalidItemId = existingIds.includes(candidateId)
      ? `__invalid_${candidateId}__`
      : candidateId;
    return { ...input, invalidItemId };
  });

// ─── Property 11: Checklist toggle correctness ─────────────────────────

// Feature: m5-notes-checklist, Property 11: Checklist toggle correctness
describe("Property 11: Checklist toggle correctness", () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any valid sectionId and itemId in the current sectionChecklists,
   * dispatching TOGGLE_SECTION_CHECKLIST_ITEM SHALL flip exactly that
   * item's completed boolean while leaving all other items unchanged.
   */
  test.prop([validToggleInputArbitrary], { numRuns: 100 })(
    "valid sectionId + itemId flips exactly that item's completed boolean",
    ({ sectionChecklists, targetSectionId, targetItemId }) => {
      const store = createStore();

      // Set up state with the generated checklist data
      store.dispatch({
        type: "UPDATE_SECTION_CHECKLISTS",
        sectionChecklists,
      });

      const stateBefore = store.getState();
      const itemBefore = stateBefore.sectionChecklists[targetSectionId]!.find(
        (item) => item.id === targetItemId
      )!;

      // Dispatch the toggle
      store.dispatch({
        type: "TOGGLE_SECTION_CHECKLIST_ITEM",
        sectionId: targetSectionId,
        itemId: targetItemId,
      });

      const stateAfter = store.getState();

      // The target item's completed should be flipped
      const itemAfter = stateAfter.sectionChecklists[targetSectionId]!.find(
        (item) => item.id === targetItemId
      )!;
      expect(itemAfter.completed).toBe(!itemBefore.completed);

      // All other items in the same section should be unchanged
      const otherItemsBefore = stateBefore.sectionChecklists[targetSectionId]!.filter(
        (item) => item.id !== targetItemId
      );
      const otherItemsAfter = stateAfter.sectionChecklists[targetSectionId]!.filter(
        (item) => item.id !== targetItemId
      );
      expect(otherItemsAfter).toEqual(otherItemsBefore);

      // All items in other sections should be unchanged
      for (const sectionId of Object.keys(sectionChecklists)) {
        if (sectionId !== targetSectionId) {
          expect(stateAfter.sectionChecklists[sectionId]).toEqual(
            stateBefore.sectionChecklists[sectionId]
          );
        }
      }
    },
  );

  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Toggling twice returns the item to its original state (toggle is
   * its own inverse).
   */
  test.prop([validToggleInputArbitrary], { numRuns: 100 })(
    "toggling twice returns item to original completed state",
    ({ sectionChecklists, targetSectionId, targetItemId }) => {
      const store = createStore();

      store.dispatch({
        type: "UPDATE_SECTION_CHECKLISTS",
        sectionChecklists,
      });

      const stateBefore = store.getState();

      // Toggle twice
      store.dispatch({
        type: "TOGGLE_SECTION_CHECKLIST_ITEM",
        sectionId: targetSectionId,
        itemId: targetItemId,
      });
      store.dispatch({
        type: "TOGGLE_SECTION_CHECKLIST_ITEM",
        sectionId: targetSectionId,
        itemId: targetItemId,
      });

      const stateAfter = store.getState();

      // State should be identical to before
      expect(stateAfter.sectionChecklists).toEqual(stateBefore.sectionChecklists);
    },
  );

  /**
   * **Validates: Requirements 3.2**
   *
   * For any invalid sectionId (not present in sectionChecklists),
   * dispatching TOGGLE_SECTION_CHECKLIST_ITEM SHALL leave state unchanged.
   */
  test.prop([invalidSectionIdArbitrary], { numRuns: 100 })(
    "invalid sectionId leaves state unchanged",
    ({ sectionChecklists, invalidSectionId, targetItemId }) => {
      const store = createStore();

      store.dispatch({
        type: "UPDATE_SECTION_CHECKLISTS",
        sectionChecklists,
      });

      const stateBefore = store.getState();

      // Dispatch toggle with invalid sectionId
      store.dispatch({
        type: "TOGGLE_SECTION_CHECKLIST_ITEM",
        sectionId: invalidSectionId,
        itemId: targetItemId,
      });

      const stateAfter = store.getState();

      // State should be completely unchanged
      expect(stateAfter.sectionChecklists).toEqual(stateBefore.sectionChecklists);
    },
  );

  /**
   * **Validates: Requirements 3.2**
   *
   * For any valid sectionId but invalid itemId (not present in that
   * section's items), dispatching TOGGLE_SECTION_CHECKLIST_ITEM SHALL
   * leave state unchanged.
   */
  test.prop([invalidItemIdArbitrary], { numRuns: 100 })(
    "valid sectionId but invalid itemId leaves state unchanged",
    ({ sectionChecklists, targetSectionId, invalidItemId }) => {
      const store = createStore();

      store.dispatch({
        type: "UPDATE_SECTION_CHECKLISTS",
        sectionChecklists,
      });

      const stateBefore = store.getState();

      // Dispatch toggle with valid section but invalid item
      store.dispatch({
        type: "TOGGLE_SECTION_CHECKLIST_ITEM",
        sectionId: targetSectionId,
        itemId: invalidItemId,
      });

      const stateAfter = store.getState();

      // State should be completely unchanged
      expect(stateAfter.sectionChecklists).toEqual(stateBefore.sectionChecklists);
    },
  );
});
