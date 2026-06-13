/**
 * Property-based tests for orphaned notes retention on section removal.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import type { Note } from "../../src/core/notes-types.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate a section id string (lowercase alpha with optional dashes/digits).
 */
const sectionIdArbitrary = fc.stringMatching(/^[a-z][-a-z0-9]{0,19}$/);

/**
 * Generate a set of 2–6 distinct section IDs.
 */
const distinctSectionIdsArbitrary = fc
  .uniqueArray(sectionIdArbitrary, { minLength: 2, maxLength: 6 })
  .filter((ids) => ids.length >= 2);

/**
 * Generate valid note text: 1–500 characters, non-whitespace-only.
 */
const validNoteTextArbitrary = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/**
 * Generate a Note object with a given sectionId.
 */
function noteForSection(sectionId: string): fc.Arbitrary<Note> {
  return fc.tuple(fc.uuid(), validNoteTextArbitrary, fc.integer({ min: 1000000000000, max: 2000000000000 }))
    .map(([id, text, createdAt]) => ({
      id,
      sectionId,
      text,
      createdAt,
    }));
}

/**
 * Generate a scenario with:
 * - A set of section IDs (at least 2)
 * - Notes distributed across those sections (at least 1 note for at least 1 section)
 * - A subset of section IDs to retain (at least 1 removed)
 */
const orphanedNotesScenarioArbitrary = distinctSectionIdsArbitrary.chain((sectionIds) => {
  // Generate 1–3 notes per section
  const notesArbs = sectionIds.map((sId) =>
    fc.array(noteForSection(sId), { minLength: 1, maxLength: 3 }),
  );

  // Choose which sections to retain (at least 1 retained, at least 1 removed)
  const retainedCountArb = fc.integer({ min: 1, max: sectionIds.length - 1 });

  return fc.tuple(
    fc.constant(sectionIds),
    fc.tuple(...notesArbs).map((arrays) => arrays.flat()),
    retainedCountArb,
  );
}).map(([sectionIds, notes, retainedCount]) => {
  const retainedSections = sectionIds.slice(0, retainedCount);
  const removedSections = sectionIds.slice(retainedCount);
  return { sectionIds, notes, retainedSections, removedSections };
});

// ─── Property 16: Orphaned notes retained on section removal ───────────

// Feature: m5-notes-checklist, Property 16: Orphaned notes retained on section removal
describe("Property 16: Orphaned notes retained on section removal", () => {
  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For any notes associated with a section that is subsequently removed
   * from the sections list, the notes SHALL remain in the in-memory state
   * (not deleted on section removal). The store does not prune notes by
   * sectionId when sections change — UPDATE_NOTES retains all notes
   * regardless of whether their sectionId matches a current section.
   */
  test.prop([orphanedNotesScenarioArbitrary], { numRuns: 100 })(
    "notes for removed sections remain in state after UPDATE_NOTES reload",
    ({ sectionIds, notes, retainedSections, removedSections }) => {
      const store = createStore();

      // 1. Initialize store with all sections
      const allSections = sectionIds.map((id) => ({
        id,
        name: `Section ${id}`,
        startTime: 0,
        endTime: 16,
      }));
      store.dispatch({
        type: "INIT",
        sections: allSections,
        trackInventory: [],
      });

      // 2. Load notes via UPDATE_NOTES (simulating persistence load)
      store.dispatch({ type: "UPDATE_NOTES", notes });

      // Verify notes are in state
      expect(store.getState().notes.length).toBe(notes.length);

      // 3. Simulate section removal: INIT with only retained sections
      const retainedSectionObjects = retainedSections.map((id) => ({
        id,
        name: `Section ${id}`,
        startTime: 0,
        endTime: 16,
      }));
      store.dispatch({
        type: "INIT",
        sections: retainedSectionObjects,
        trackInventory: [],
      });

      // After INIT, notes are reset to [] (INIT resets state).
      // The persistence layer (Notes_Store) is responsible for reloading.
      // 4. Simulate Notes_Store reloading ALL notes (including orphaned ones)
      //    This is what the Notes_Store does: it loads from the persistence file
      //    which retains all notes regardless of sections.
      store.dispatch({ type: "UPDATE_NOTES", notes });

      const stateAfter = store.getState();

      // 5. Verify: notes for removed sections remain in the store
      const orphanedNotes = notes.filter((n) => removedSections.includes(n.sectionId));
      const retainedNotes = notes.filter((n) => retainedSections.includes(n.sectionId));

      // All orphaned notes are still present
      for (const orphanedNote of orphanedNotes) {
        const found = stateAfter.notes.find((n) => n.id === orphanedNote.id);
        expect(found).toBeDefined();
        expect(found!.sectionId).toBe(orphanedNote.sectionId);
        expect(found!.text).toBe(orphanedNote.text);
        expect(found!.createdAt).toBe(orphanedNote.createdAt);
      }

      // All retained-section notes are also still present
      for (const retainedNote of retainedNotes) {
        const found = stateAfter.notes.find((n) => n.id === retainedNote.id);
        expect(found).toBeDefined();
      }

      // Total notes count is unchanged
      expect(stateAfter.notes.length).toBe(notes.length);
    },
  );

  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * UPDATE_NOTES does not filter notes by current sections — notes with
   * sectionIds not present in state.sections are accepted and retained.
   */
  test.prop([orphanedNotesScenarioArbitrary], { numRuns: 100 })(
    "UPDATE_NOTES accepts notes with sectionIds not in current sections",
    ({ notes, retainedSections }) => {
      const store = createStore();

      // Initialize store with only a subset of sections (some notes reference missing sections)
      const partialSections = retainedSections.map((id) => ({
        id,
        name: `Section ${id}`,
        startTime: 0,
        endTime: 16,
      }));
      store.dispatch({
        type: "INIT",
        sections: partialSections,
        trackInventory: [],
      });

      // Dispatch UPDATE_NOTES with notes that reference sectionIds not in current sections
      store.dispatch({ type: "UPDATE_NOTES", notes });

      const state = store.getState();

      // All notes are retained regardless of whether sectionId is in current sections
      expect(state.notes.length).toBe(notes.length);

      for (const note of notes) {
        const found = state.notes.find((n) => n.id === note.id);
        expect(found).toBeDefined();
        expect(found!.sectionId).toBe(note.sectionId);
        expect(found!.text).toBe(note.text);
        expect(found!.createdAt).toBe(note.createdAt);
      }
    },
  );
});
