/**
 * Property-based tests for invalid note id operations being ignored.
 *
 * Feature: m5-notes-checklist, Property 5: Invalid note id operations ignored
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import type { Section } from "../../src/core/section-scanner.js";
import type { Note } from "../../src/core/notes-types.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a UUID-like string guaranteed to not collide with real note IDs. */
const nonExistentNoteIdArbitrary = fc.string({ minLength: 1, maxLength: 50 }).map(
  (s) => `nonexistent-${s}`,
);

/** Generate a valid note text (1–500 chars, not whitespace-only). */
const validNoteTextArbitrary = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((text) => text.trim().length > 0);

/** Generate a small set of sections for populating the store. */
const sectionsArbitrary = fc
  .integer({ min: 1, max: 5 })
  .map((count): Section[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `section-${i}`,
      name: `Section ${i}`,
      startTime: i * 100,
      endTime: (i + 1) * 100,
    })),
  );

/**
 * Generate a list of notes that belong to the given sections.
 * Each note has a deterministic id like `note-{index}` so we can
 * generate non-existent IDs that are guaranteed not to collide.
 */
const notesForSectionsArbitrary = (sections: Section[]) =>
  fc
    .array(
      fc.record({
        sectionIndex: fc.integer({ min: 0, max: sections.length - 1 }),
        text: validNoteTextArbitrary,
      }),
      { minLength: 0, maxLength: 10 },
    )
    .map((entries): Note[] =>
      entries.map((entry, i) => ({
        id: `note-${i}`,
        sectionId: sections[entry.sectionIndex]!.id,
        text: entry.text,
        createdAt: Date.now() - i * 1000,
      })),
    );

// ─── Property 5: Invalid note id operations ignored ────────────────────

// Feature: m5-notes-checklist, Property 5: Invalid note id operations ignored
describe("Property 5: Invalid note id operations ignored", () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any note id that does not exist in the current notes array,
   * dispatching EDIT_NOTE SHALL leave state unchanged (same reference).
   */
  test.prop(
    [sectionsArbitrary, validNoteTextArbitrary, nonExistentNoteIdArbitrary],
    { numRuns: 100 },
  )(
    "EDIT_NOTE with non-existent noteId leaves state unchanged",
    (sections, newText, fakeNoteId) => {
      const store = createStore();

      // Initialize with sections
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Optionally populate with some notes via UPDATE_NOTES
      const existingNotes: Note[] = sections.slice(0, 2).map((s, i) => ({
        id: `existing-note-${i}`,
        sectionId: s.id,
        text: `Some note text ${i}`,
        createdAt: Date.now() - i * 1000,
      }));
      store.dispatch({ type: "UPDATE_NOTES", notes: existingNotes });

      const stateBefore = store.getState();

      // Dispatch EDIT_NOTE with a non-existent noteId
      store.dispatch({ type: "EDIT_NOTE", noteId: fakeNoteId, text: newText });

      const stateAfter = store.getState();

      // State reference should be unchanged (reducer returns same object)
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.5**
   *
   * For any note id that does not exist in the current notes array,
   * dispatching DELETE_NOTE SHALL leave state unchanged (same reference).
   */
  test.prop(
    [sectionsArbitrary, nonExistentNoteIdArbitrary],
    { numRuns: 100 },
  )(
    "DELETE_NOTE with non-existent noteId leaves state unchanged",
    (sections, fakeNoteId) => {
      const store = createStore();

      // Initialize with sections
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Optionally populate with some notes via UPDATE_NOTES
      const existingNotes: Note[] = sections.slice(0, 2).map((s, i) => ({
        id: `existing-note-${i}`,
        sectionId: s.id,
        text: `Some note text ${i}`,
        createdAt: Date.now() - i * 1000,
      }));
      store.dispatch({ type: "UPDATE_NOTES", notes: existingNotes });

      const stateBefore = store.getState();

      // Dispatch DELETE_NOTE with a non-existent noteId
      store.dispatch({ type: "DELETE_NOTE", noteId: fakeNoteId });

      const stateAfter = store.getState();

      // State reference should be unchanged (reducer returns same object)
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.5**
   *
   * For any populated notes array, using a randomly generated noteId
   * that is guaranteed not to be present in the notes, both EDIT_NOTE
   * and DELETE_NOTE leave state unchanged even when notes exist.
   */
  test.prop(
    [sectionsArbitrary.chain((sections) =>
      fc.tuple(fc.constant(sections), notesForSectionsArbitrary(sections)),
    ), nonExistentNoteIdArbitrary, validNoteTextArbitrary],
    { numRuns: 100 },
  )(
    "operations with fabricated noteId on populated store leave state unchanged",
    ([sections, notes], fakeNoteId, newText) => {
      const store = createStore();

      // Initialize store with sections
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Populate with generated notes
      if (notes.length > 0) {
        store.dispatch({ type: "UPDATE_NOTES", notes });
      }

      const stateBefore = store.getState();

      // EDIT_NOTE with non-existent id
      store.dispatch({ type: "EDIT_NOTE", noteId: fakeNoteId, text: newText });
      expect(store.getState()).toBe(stateBefore);

      // DELETE_NOTE with non-existent id
      store.dispatch({ type: "DELETE_NOTE", noteId: fakeNoteId });
      expect(store.getState()).toBe(stateBefore);
    },
  );
});
