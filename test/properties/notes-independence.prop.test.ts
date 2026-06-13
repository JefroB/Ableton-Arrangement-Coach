/**
 * Property-based tests for notes independence from analysis.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { SectionChecklistItem } from "../../src/core/notes-types.js";
import type { Issue, IssueSeverity } from "../../src/core/issue-types.js";
import type { TransitionRecommendation } from "../../src/core/transition-engine.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a valid section ID. */
const sectionIdArbitrary = fc.stringMatching(/^[a-z0-9-]{1,30}$/);

/** Generate valid note text: 1–500 characters, non-whitespace-only. */
const validNoteTextArbitrary = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((s) => s.trim().length > 0);

/** Generate a checklist source. */
const checklistSourceArbitrary = fc.constantFrom("issue", "transition", "manual") as fc.Arbitrary<"issue" | "transition" | "manual">;

/** Generate a severity level. */
const severityArbitrary = fc.constantFrom("critical", "warning", "info") as fc.Arbitrary<IssueSeverity>;

/** Generate a random SectionChecklistItem for a given sectionId. */
const checklistItemArbitrary = (sectionId: string): fc.Arbitrary<SectionChecklistItem> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    sectionId: fc.constant(sectionId),
    text: fc.string({ minLength: 1, maxLength: 150 }),
    source: checklistSourceArbitrary,
    completed: fc.boolean(),
  });

/** Generate a random sectionChecklists map for given section IDs. */
const sectionChecklistsMapArbitrary = (sectionIds: string[]): fc.Arbitrary<Record<string, SectionChecklistItem[]>> =>
  fc.tuple(
    ...sectionIds.map((sid) =>
      fc.array(checklistItemArbitrary(sid), { minLength: 0, maxLength: 5 })
    )
  ).map((arrays) => {
    const result: Record<string, SectionChecklistItem[]> = {};
    sectionIds.forEach((sid, idx) => {
      result[sid] = arrays[idx]!;
    });
    return result;
  });

/**
 * Generate test scenario: sections + notes + random checklist data.
 * Returns { sectionIds, notes (text array), checklistsPayload }.
 */
const testScenarioArbitrary = fc
  .array(sectionIdArbitrary, { minLength: 1, maxLength: 5 })
  .chain((rawSectionIds) => {
    // Deduplicate section IDs
    const sectionIds = [...new Set(rawSectionIds)];
    if (sectionIds.length === 0) return fc.constant(null);

    return fc.tuple(
      fc.constant(sectionIds),
      // Generate 1–10 notes across random sections
      fc.array(
        fc.tuple(
          fc.constantFrom(...sectionIds),
          validNoteTextArbitrary,
        ),
        { minLength: 1, maxLength: 10 },
      ),
      // Generate random checklist map for these sections
      sectionChecklistsMapArbitrary(sectionIds),
    ).map(([ids, noteEntries, checklists]) => ({
      sectionIds: ids,
      noteEntries,
      checklistsPayload: checklists,
    }));
  })
  .filter((v): v is NonNullable<typeof v> => v !== null);

/** Generate Issue objects for use with generateSectionChecklists. */
const issueArbitrary = (sectionIds: string[]): fc.Arbitrary<Issue> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }),
    type: fc.constant("flat-energy" as const),
    severity: severityArbitrary,
    sectionIds: fc.subarray(sectionIds, { minLength: 1 }),
    message: fc.string({ minLength: 1, maxLength: 150 }),
  });

/** Generate TransitionRecommendation objects. */
const transitionRecArbitrary = (sectionIds: string[]): fc.Arbitrary<TransitionRecommendation> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }),
    fromSectionId: fc.constantFrom(...sectionIds),
    toSectionId: fc.constantFrom(...sectionIds),
    energyDelta: fc.integer({ min: -9, max: 9 }),
    transitionSize: fc.constantFrom("small", "medium", "large") as fc.Arbitrary<"small" | "medium" | "large">,
    suggestedDurationBars: fc.integer({ min: 2, max: 32 }),
    techniques: fc.constant([]),
    boundaryType: fc.constantFrom("drop", "breakdown", "build", "normal") as fc.Arbitrary<"drop" | "breakdown" | "build" | "normal">,
    rationale: fc.string({ minLength: 1, maxLength: 120 }),
    checklist: fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        text: fc.string({ minLength: 1, maxLength: 150 }),
        completed: fc.constant(false),
      }),
      { minLength: 1, maxLength: 5 },
    ),
  });

/**
 * Extended scenario that also includes issues and transition recommendations
 * for testing generateSectionChecklists + dispatch.
 */
const fullScenarioArbitrary = fc
  .array(sectionIdArbitrary, { minLength: 1, maxLength: 5 })
  .chain((rawSectionIds) => {
    const sectionIds = [...new Set(rawSectionIds)];
    if (sectionIds.length === 0) return fc.constant(null);

    return fc.tuple(
      fc.constant(sectionIds),
      // Notes
      fc.array(
        fc.tuple(fc.constantFrom(...sectionIds), validNoteTextArbitrary),
        { minLength: 1, maxLength: 10 },
      ),
      // Issues
      fc.array(issueArbitrary(sectionIds), { minLength: 0, maxLength: 5 }),
      // Transition recommendations
      fc.array(transitionRecArbitrary(sectionIds), { minLength: 0, maxLength: 3 }),
    ).map(([ids, noteEntries, issues, transitions]) => ({
      sectionIds: ids,
      noteEntries,
      issues,
      transitions,
    }));
  })
  .filter((v): v is NonNullable<typeof v> => v !== null);

// ─── Property 15: Notes independence from analysis ─────────────────────

// Feature: m5-notes-checklist, Property 15: Notes independence from analysis
describe("Property 15: Notes independence from analysis", () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any notes array in state, dispatching UPDATE_SECTION_CHECKLISTS
   * SHALL not modify the notes array.
   */
  test.prop([testScenarioArbitrary], { numRuns: 100 })(
    "dispatching UPDATE_SECTION_CHECKLISTS does not modify notes array",
    ({ sectionIds, noteEntries, checklistsPayload }) => {
      const store = createStore();

      // Initialize store with sections
      const sections = sectionIds.map((id, i) => ({
        id,
        name: `Section ${i}`,
        startTime: i * 16,
        endTime: (i + 1) * 16,
      }));
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Add notes via ADD_NOTE
      for (const [sectionId, text] of noteEntries) {
        store.dispatch({ type: "ADD_NOTE", sectionId, text });
      }

      // Capture notes array reference and content before checklist dispatch
      const notesBefore = store.getState().notes;

      // Dispatch UPDATE_SECTION_CHECKLISTS with random checklist data
      store.dispatch({
        type: "UPDATE_SECTION_CHECKLISTS",
        sectionChecklists: checklistsPayload,
      });

      // Verify notes array is identical (same reference means no modification)
      const notesAfter = store.getState().notes;
      expect(notesAfter).toBe(notesBefore);
    },
  );

  /**
   * **Validates: Requirements 7.3**
   *
   * For any notes in state, calling generateSectionChecklists and dispatching
   * its result SHALL not modify the notes array.
   */
  test.prop([fullScenarioArbitrary], { numRuns: 100 })(
    "calling generateSectionChecklists and dispatching result does not modify notes",
    ({ sectionIds, noteEntries, issues, transitions }) => {
      const store = createStore();

      // Initialize store with sections
      const sections = sectionIds.map((id, i) => ({
        id,
        name: `Section ${i}`,
        startTime: i * 16,
        endTime: (i + 1) * 16,
      }));
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Add notes via ADD_NOTE
      for (const [sectionId, text] of noteEntries) {
        store.dispatch({ type: "ADD_NOTE", sectionId, text });
      }

      // Capture notes reference before auto-generation
      const notesBefore = store.getState().notes;

      // Invoke the auto-generation module
      const generatedChecklists = generateSectionChecklists({
        issues,
        transitionRecommendations: transitions,
        existingSections: sectionIds,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      // Dispatch the generated checklists
      store.dispatch({
        type: "UPDATE_SECTION_CHECKLISTS",
        sectionChecklists: generatedChecklists as Record<string, SectionChecklistItem[]>,
      });

      // Verify notes array is identical (same reference)
      const notesAfter = store.getState().notes;
      expect(notesAfter).toBe(notesBefore);
    },
  );
});
