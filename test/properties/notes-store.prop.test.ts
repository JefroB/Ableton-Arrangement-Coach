/**
 * Property-based tests for the State Store notes operations.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import { buildSections } from "../../src/core/section-scanner.js";
import type { LocatorData } from "../../src/ableton/sdk-adapter.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate a set of valid sections by producing sorted locator data
 * and converting to sections via buildSections.
 * Ensures at least 1 section exists for testing operations against valid sectionIds.
 */
const sectionsArbitrary = fc
  .array(fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }), {
    minLength: 2,
    maxLength: 10,
  })
  .map((times) => {
    const unique = [...new Set(times)].sort((a, b) => a - b);
    const locators: LocatorData[] = unique.map((time, i) => ({
      name: `Section ${i}`,
      time,
    }));
    return buildSections(locators);
  })
  .filter((sections) => sections.length >= 1 && sections.every((s) => s.endTime > s.startTime));

/**
 * Generate valid note text: strings of length 1–500 that aren't whitespace-only.
 */
const validNoteTextArbitrary = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((s) => s.trim().length > 0);

// ─── Property 1: Note addition correctness ─────────────────────────────

// Feature: m5-notes-checklist, Property 1: Note addition correctness
describe("Property 1: Note addition correctness", () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * For any valid section ID (existing in state) and any valid text string
   * (1–500 non-whitespace-only characters), dispatching ADD_NOTE SHALL result
   * in the notes array containing exactly one additional Note with matching
   * sectionId and text, a unique id, and a createdAt timestamp.
   */
  test.prop([sectionsArbitrary, validNoteTextArbitrary], { numRuns: 100 })(
    "valid sectionId + valid text → notes array grows by 1 with matching fields",
    (sections, text) => {
      const store = createStore();

      // Initialize store with generated sections
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Pick a valid sectionId from the initialized sections
      const sectionId = sections[0]!.id;

      const stateBefore = store.getState();
      const notesBefore = stateBefore.notes.length;

      // Dispatch ADD_NOTE
      store.dispatch({ type: "ADD_NOTE", sectionId, text });

      const stateAfter = store.getState();

      // Notes array grows by exactly 1
      expect(stateAfter.notes.length).toBe(notesBefore + 1);

      // The new note is the last element (appended)
      const newNote = stateAfter.notes[stateAfter.notes.length - 1]!;

      // New note has matching sectionId and text
      expect(newNote.sectionId).toBe(sectionId);
      expect(newNote.text).toBe(text);

      // New note has a non-empty id string
      expect(typeof newNote.id).toBe("string");
      expect(newNote.id.length).toBeGreaterThan(0);

      // New note has a numeric createdAt timestamp
      expect(typeof newNote.createdAt).toBe("number");
      expect(newNote.createdAt).toBeGreaterThan(0);
    },
  );
});
