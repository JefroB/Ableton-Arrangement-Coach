/**
 * Property-based tests for note edit preserves identity.
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
 * Generate a pair of distinct valid note texts for original and replacement.
 */
const distinctNoteTextPairArbitrary = fc
  .tuple(validNoteTextArbitrary, validNoteTextArbitrary)
  .filter(([a, b]) => a !== b);

// ─── Property 2: Note edit preserves identity ──────────────────────────

// Feature: m5-notes-checklist, Property 2: Note edit preserves identity
describe("Property 2: Note edit preserves identity", () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any existing note and any valid replacement text (1–500
   * non-whitespace-only characters), dispatching EDIT_NOTE SHALL produce
   * a note with the same id and createdAt but the new text value.
   */
  test.prop([distinctNoteTextPairArbitrary], { numRuns: 100 })(
    "editing a note preserves id and createdAt but updates text",
    ([originalText, replacementText]) => {
      const store = createStore();

      // Set up a section so ADD_NOTE is valid
      const sectionId = "section-0";
      store.dispatch({
        type: "INIT",
        sections: [{ id: sectionId, name: "Intro", startTime: 0, endTime: 16 }],
        trackInventory: [],
      });

      // Add a note to get an existing note in the store
      store.dispatch({ type: "ADD_NOTE", sectionId, text: originalText });

      const stateAfterAdd = store.getState();
      const addedNote = stateAfterAdd.notes[0]!;

      // Capture original identity fields
      const originalId = addedNote.id;
      const originalCreatedAt = addedNote.createdAt;

      // Edit the note with new text
      store.dispatch({ type: "EDIT_NOTE", noteId: originalId, text: replacementText });

      const stateAfterEdit = store.getState();
      const editedNote = stateAfterEdit.notes.find((n) => n.id === originalId);

      // The note should still exist
      expect(editedNote).toBeDefined();
      // id is preserved
      expect(editedNote!.id).toBe(originalId);
      // createdAt is preserved
      expect(editedNote!.createdAt).toBe(originalCreatedAt);
      // text is updated to the new value
      expect(editedNote!.text).toBe(replacementText);
    },
  );
});
