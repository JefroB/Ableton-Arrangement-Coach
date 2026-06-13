/**
 * Property-based tests for note deletion removes only target.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate valid note text: 1–500 characters, non-whitespace-only.
 */
const validNoteTextArbitrary = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((s) => s.trim().length > 0);

/**
 * Generate a section id string.
 */
const sectionIdArbitrary = fc.stringMatching(/^[a-z][-a-z0-9]{0,19}$/);

/**
 * Generate multiple distinct note texts (2 to 10 notes) to populate the store.
 */
const noteTextsArbitrary = fc.array(validNoteTextArbitrary, { minLength: 2, maxLength: 10 });

/**
 * Generate a section id and multiple note texts, plus an index selecting
 * which note to delete.
 */
const deletionScenarioArbitrary = fc
  .tuple(sectionIdArbitrary, noteTextsArbitrary)
  .chain(([sectionId, noteTexts]) =>
    fc.tuple(
      fc.constant(sectionId),
      fc.constant(noteTexts),
      fc.integer({ min: 0, max: noteTexts.length - 1 }),
    ),
  );

// ─── Property 3: Note deletion removes only target ─────────────────────

// Feature: m5-notes-checklist, Property 3: Note deletion removes only target
describe("Property 3: Note deletion removes only target", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any notes array containing at least one note, dispatching
   * DELETE_NOTE with a valid note id SHALL remove exactly that note
   * from the array while leaving all other notes unchanged.
   */
  test.prop([deletionScenarioArbitrary], { numRuns: 100 })(
    "deleting a note removes exactly one note and leaves others unchanged",
    ([sectionId, noteTexts, deleteIndex]) => {
      const store = createStore();

      // Set up a section so ADD_NOTE is valid
      store.dispatch({
        type: "INIT",
        sections: [{ id: sectionId, name: "Test Section", startTime: 0, endTime: 16 }],
        trackInventory: [],
      });

      // Add multiple notes
      for (const text of noteTexts) {
        store.dispatch({ type: "ADD_NOTE", sectionId, text });
      }

      const stateBeforeDelete = store.getState();
      const notesBeforeDelete = stateBeforeDelete.notes;

      // Pick the note to delete by index
      const noteToDelete = notesBeforeDelete[deleteIndex]!;

      // Delete that note
      store.dispatch({ type: "DELETE_NOTE", noteId: noteToDelete.id });

      const stateAfterDelete = store.getState();
      const notesAfterDelete = stateAfterDelete.notes;

      // Array length decreases by exactly 1
      expect(notesAfterDelete.length).toBe(notesBeforeDelete.length - 1);

      // The deleted note is no longer present
      const deletedNoteInResult = notesAfterDelete.find((n) => n.id === noteToDelete.id);
      expect(deletedNoteInResult).toBeUndefined();

      // All other notes remain unchanged (same id, text, sectionId, createdAt)
      const remainingNotesExpected = notesBeforeDelete.filter(
        (n) => n.id !== noteToDelete.id,
      );
      for (const expected of remainingNotesExpected) {
        const actual = notesAfterDelete.find((n) => n.id === expected.id);
        expect(actual).toBeDefined();
        expect(actual!.id).toBe(expected.id);
        expect(actual!.sectionId).toBe(expected.sectionId);
        expect(actual!.text).toBe(expected.text);
        expect(actual!.createdAt).toBe(expected.createdAt);
      }
    },
  );
});
