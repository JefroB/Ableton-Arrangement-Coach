/**
 * Property-based tests for invalid note input rejection (Property 4).
 *
 * Feature: m5-notes-checklist, Property 4: Invalid note input rejection
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import type { Section } from "../../src/core/section-scanner.js";
import type { Note } from "../../src/core/notes-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/** Create a minimal valid section with a given id. */
function makeSection(id: string): Section {
  return { id, name: `Section ${id}`, startTime: 0, endTime: 100 };
}

/** Initialize a store with the given sections and optionally pre-populate notes. */
function initStoreWithSections(sections: Section[], notes: Note[] = []) {
  const store = createStore();
  store.dispatch({ type: "INIT", sections, trackInventory: [] });
  if (notes.length > 0) {
    store.dispatch({ type: "UPDATE_NOTES", notes });
  }
  return store;
}

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a whitespace-only string (spaces, tabs, newlines). */
const whitespaceOnlyArbitrary = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "  ", "\t\t"), { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(""));

/** Generate a string that exceeds 500 characters. */
const overLengthTextArbitrary = fc
  .string({ minLength: 501, maxLength: 600 })
  .filter((s) => s.length > 500);

/** Generate a valid section id that would NOT match any section in state. */
const invalidSectionIdArbitrary = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.startsWith("section-"));

/** Generate a valid note text (1–500 chars, non-whitespace-only). */
const validNoteTextArbitrary = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((s) => s.trim().length > 0);

// ─── Property 4: Invalid note input rejection ──────────────────────────

// Feature: m5-notes-checklist, Property 4: Invalid note input rejection
describe("Property 4: Invalid note input rejection", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any empty text string (""), dispatching ADD_NOTE SHALL leave state unchanged.
   */
  test.prop(
    [fc.constantFrom("section-0", "section-1", "section-2")],
    { numRuns: 100 },
  )(
    "ADD_NOTE with empty text leaves state unchanged",
    (sectionId) => {
      const sections = [makeSection("section-0"), makeSection("section-1"), makeSection("section-2")];
      const store = initStoreWithSections(sections);
      const stateBefore = store.getState();

      store.dispatch({ type: "ADD_NOTE", sectionId, text: "" });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.4**
   *
   * For any whitespace-only text, dispatching ADD_NOTE SHALL leave state unchanged.
   */
  test.prop(
    [
      fc.constantFrom("section-0", "section-1", "section-2"),
      whitespaceOnlyArbitrary,
    ],
    { numRuns: 100 },
  )(
    "ADD_NOTE with whitespace-only text leaves state unchanged",
    (sectionId, text) => {
      const sections = [makeSection("section-0"), makeSection("section-1"), makeSection("section-2")];
      const store = initStoreWithSections(sections);
      const stateBefore = store.getState();

      store.dispatch({ type: "ADD_NOTE", sectionId, text });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.4**
   *
   * For any text exceeding 500 characters, dispatching ADD_NOTE SHALL leave state unchanged.
   */
  test.prop(
    [
      fc.constantFrom("section-0", "section-1", "section-2"),
      overLengthTextArbitrary,
    ],
    { numRuns: 100 },
  )(
    "ADD_NOTE with over-500-char text leaves state unchanged",
    (sectionId, text) => {
      const sections = [makeSection("section-0"), makeSection("section-1"), makeSection("section-2")];
      const store = initStoreWithSections(sections);
      const stateBefore = store.getState();

      store.dispatch({ type: "ADD_NOTE", sectionId, text });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.8**
   *
   * For any sectionId that does not exist in state.sections, dispatching
   * ADD_NOTE with valid text SHALL leave state unchanged.
   */
  test.prop(
    [invalidSectionIdArbitrary, validNoteTextArbitrary],
    { numRuns: 100 },
  )(
    "ADD_NOTE with invalid sectionId leaves state unchanged",
    (sectionId, text) => {
      const sections = [makeSection("section-0"), makeSection("section-1")];
      const store = initStoreWithSections(sections);
      const stateBefore = store.getState();

      store.dispatch({ type: "ADD_NOTE", sectionId, text });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.7**
   *
   * When a section already has 100 notes, dispatching ADD_NOTE for that section
   * with valid text SHALL leave state unchanged (100-note cap).
   */
  test.prop([validNoteTextArbitrary], { numRuns: 100 })(
    "ADD_NOTE when section has 100 notes leaves state unchanged (cap exceeded)",
    (text) => {
      const sectionId = "section-0";
      const sections = [makeSection(sectionId)];

      // Pre-populate with exactly 100 notes for the section
      const existingNotes: Note[] = Array.from({ length: 100 }, (_, i) => ({
        id: `note-${i}`,
        sectionId,
        text: `Existing note ${i}`,
        createdAt: Date.now() - i * 1000,
      }));

      const store = initStoreWithSections(sections, existingNotes);
      const stateBefore = store.getState();

      store.dispatch({ type: "ADD_NOTE", sectionId, text });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.4**
   *
   * For any empty text string (""), dispatching EDIT_NOTE on an existing note
   * SHALL leave state unchanged.
   */
  test.prop(
    [fc.constantFrom("note-0", "note-1", "note-2")],
    { numRuns: 100 },
  )(
    "EDIT_NOTE with empty text leaves state unchanged",
    (noteId) => {
      const sections = [makeSection("section-0")];
      const existingNotes: Note[] = [
        { id: "note-0", sectionId: "section-0", text: "Hello", createdAt: 1000 },
        { id: "note-1", sectionId: "section-0", text: "World", createdAt: 2000 },
        { id: "note-2", sectionId: "section-0", text: "Test", createdAt: 3000 },
      ];

      const store = initStoreWithSections(sections, existingNotes);
      const stateBefore = store.getState();

      store.dispatch({ type: "EDIT_NOTE", noteId, text: "" });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.4**
   *
   * For any whitespace-only text, dispatching EDIT_NOTE on an existing note
   * SHALL leave state unchanged.
   */
  test.prop(
    [
      fc.constantFrom("note-0", "note-1", "note-2"),
      whitespaceOnlyArbitrary,
    ],
    { numRuns: 100 },
  )(
    "EDIT_NOTE with whitespace-only text leaves state unchanged",
    (noteId, text) => {
      const sections = [makeSection("section-0")];
      const existingNotes: Note[] = [
        { id: "note-0", sectionId: "section-0", text: "Hello", createdAt: 1000 },
        { id: "note-1", sectionId: "section-0", text: "World", createdAt: 2000 },
        { id: "note-2", sectionId: "section-0", text: "Test", createdAt: 3000 },
      ];

      const store = initStoreWithSections(sections, existingNotes);
      const stateBefore = store.getState();

      store.dispatch({ type: "EDIT_NOTE", noteId, text });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );

  /**
   * **Validates: Requirements 1.4**
   *
   * For any text exceeding 500 characters, dispatching EDIT_NOTE on an existing note
   * SHALL leave state unchanged.
   */
  test.prop(
    [
      fc.constantFrom("note-0", "note-1", "note-2"),
      overLengthTextArbitrary,
    ],
    { numRuns: 100 },
  )(
    "EDIT_NOTE with over-500-char text leaves state unchanged",
    (noteId, text) => {
      const sections = [makeSection("section-0")];
      const existingNotes: Note[] = [
        { id: "note-0", sectionId: "section-0", text: "Hello", createdAt: 1000 },
        { id: "note-1", sectionId: "section-0", text: "World", createdAt: 2000 },
        { id: "note-2", sectionId: "section-0", text: "Test", createdAt: 3000 },
      ];

      const store = initStoreWithSections(sections, existingNotes);
      const stateBefore = store.getState();

      store.dispatch({ type: "EDIT_NOTE", noteId, text });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    },
  );
});
