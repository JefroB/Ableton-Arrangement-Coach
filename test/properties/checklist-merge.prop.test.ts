/**
 * Property-based tests for Auto-generation Merge Preserves Completions.
 *
 * Feature: m5-notes-checklist, Property 9: Auto-generation merge preserves completions
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { ChecklistGeneratorInput } from "../../src/core/checklist-generator.js";
import type { Issue, IssueSeverity, IssueType } from "../../src/core/issue-types.js";
import type { TransitionRecommendation, ChecklistItem, TransitionSize, BoundaryType } from "../../src/core/transition-engine.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a simple section ID. */
const sectionIdArbitrary = fc.stringMatching(/^section-[a-z0-9]{1,8}$/);

/** Generate a non-empty array of unique section IDs. */
const sectionIdsArbitrary = fc
  .array(sectionIdArbitrary, { minLength: 1, maxLength: 6 })
  .map((ids) => [...new Set(ids)])
  .filter((ids) => ids.length >= 1);

/** Generate an issue severity. */
const severityArbitrary: fc.Arbitrary<IssueSeverity> = fc.constantFrom("critical", "warning", "info");

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

/** Generate an Issue that references a subset of given sectionIds. */
function issueArbitrary(availableSections: string[]): fc.Arbitrary<Issue> {
  return fc.record({
    id: fc.stringMatching(/^issue-[a-z0-9]{1,8}$/),
    type: issueTypeArbitrary,
    severity: severityArbitrary,
    sectionIds: fc
      .subarray(availableSections, { minLength: 1 })
      .map((arr) => arr as readonly string[]),
    message: fc.string({ minLength: 1, maxLength: 150 }),
  });
}

/** Generate a ChecklistItem for a transition recommendation. */
const checklistItemArbitrary: fc.Arbitrary<ChecklistItem> = fc.record({
  id: fc.stringMatching(/^cl-[a-z0-9]{1,8}$/),
  text: fc.string({ minLength: 1, maxLength: 120 }),
  completed: fc.constant(false),
});

/** Generate a TransitionRecommendation targeting a given toSectionId. */
function transitionArbitrary(toSectionId: string, fromSectionId: string): fc.Arbitrary<TransitionRecommendation> {
  return fc.record({
    id: fc.stringMatching(/^tr-[a-z0-9]{1,8}$/),
    fromSectionId: fc.constant(fromSectionId),
    toSectionId: fc.constant(toSectionId),
    energyDelta: fc.integer({ min: -9, max: 9 }),
    transitionSize: fc.constantFrom("small", "medium", "large") as fc.Arbitrary<TransitionSize>,
    suggestedDurationBars: fc.integer({ min: 2, max: 32 }),
    techniques: fc.constant([]),
    boundaryType: fc.constantFrom("drop", "breakdown", "build", "normal") as fc.Arbitrary<BoundaryType>,
    rationale: fc.string({ minLength: 1, maxLength: 120 }),
    checklist: fc.array(checklistItemArbitrary, { minLength: 1, maxLength: 4 }),
  });
}

// ─── Property 9: Auto-generation merge preserves completions ───────────

// Feature: m5-notes-checklist, Property 9: Auto-generation merge preserves completions
describe("Property 9: Auto-generation merge preserves completions", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any existing checklist state with some items marked completed,
   * when re-running auto-generation with partially overlapping inputs,
   * items whose stable id appears in both old and new results SHALL retain
   * their previous completion state, new items SHALL have completed=false,
   * and items whose source no longer exists SHALL be absent from the output.
   */
  test.prop(
    [
      sectionIdsArbitrary.chain((sections) => {
        // Generate initial issues and transitions
        const issuesArb = fc.array(issueArbitrary(sections), { minLength: 1, maxLength: 5 });
        const transitionsArb = sections.length >= 2
          ? fc.array(
              transitionArbitrary(sections[1]!, sections[0]!),
              { minLength: 0, maxLength: 3 },
            )
          : fc.constant([] as TransitionRecommendation[]);

        return fc.tuple(
          fc.constant(sections),
          issuesArb,
          transitionsArb,
        );
      }),
    ],
    { numRuns: 100 },
  )(
    "persisted items retain completion, new items start false, removed items disappear",
    ([sections, initialIssues, initialTransitions]) => {
      // Ensure unique issue IDs
      const seenIssueIds = new Set<string>();
      const uniqueIssues = initialIssues.filter((issue) => {
        if (seenIssueIds.has(issue.id)) return false;
        seenIssueIds.add(issue.id);
        return true;
      });
      if (uniqueIssues.length === 0) return; // Skip trivial case

      // Ensure unique transition IDs
      const seenTransitionIds = new Set<string>();
      const uniqueTransitions = initialTransitions.filter((tr) => {
        if (seenTransitionIds.has(tr.id)) return false;
        seenTransitionIds.add(tr.id);
        return true;
      });

      // Also ensure unique checklist item IDs within each transition
      const dedupedTransitions = uniqueTransitions.map((tr) => {
        const seenClIds = new Set<string>();
        const uniqueChecklist = tr.checklist.filter((cl) => {
          if (seenClIds.has(cl.id)) return false;
          seenClIds.add(cl.id);
          return true;
        });
        return { ...tr, checklist: uniqueChecklist };
      }).filter((tr) => tr.checklist.length > 0 || uniqueTransitions.indexOf(tr) === -1);

      // ─── Step 1: Run initial generation ─────────────────────────────
      const initialInput: ChecklistGeneratorInput = {
        issues: uniqueIssues,
        transitionRecommendations: dedupedTransitions,
        existingSections: sections,
        existingCompletions: new Map(),
        selectedGenre: null,
      };

      const initialOutput = generateSectionChecklists(initialInput);

      // Collect all generated item IDs from initial output
      const allInitialItems: { id: string; sectionId: string }[] = [];
      for (const sectionId of sections) {
        const items = initialOutput[sectionId] ?? [];
        for (const item of items) {
          allInitialItems.push({ id: item.id, sectionId: item.sectionId });
        }
      }

      if (allInitialItems.length === 0) return; // Skip if nothing was generated

      // ─── Step 2: Mark some items as completed ───────────────────────
      const completions = new Map<string, boolean>();
      for (let i = 0; i < allInitialItems.length; i++) {
        // Mark every other item as completed
        completions.set(allInitialItems[i]!.id, i % 2 === 0);
      }

      // ─── Step 3: Create partially overlapping inputs ────────────────
      // Keep some issues (overlap), remove some (removed), and keep all sections
      const splitPoint = Math.max(1, Math.floor(uniqueIssues.length / 2));
      const keptIssues = uniqueIssues.slice(0, splitPoint); // retained
      const removedIssues = uniqueIssues.slice(splitPoint); // removed

      // Keep some transitions, remove some
      const trSplitPoint = Math.floor(dedupedTransitions.length / 2);
      const keptTransitions = dedupedTransitions.slice(0, trSplitPoint);
      const removedTransitions = dedupedTransitions.slice(trSplitPoint);

      // ─── Step 4: Run generation again with overlapping set ──────────
      const mergedInput: ChecklistGeneratorInput = {
        issues: keptIssues,
        transitionRecommendations: keptTransitions,
        existingSections: sections,
        existingCompletions: completions,
        selectedGenre: null,
      };

      const mergedOutput = generateSectionChecklists(mergedInput);

      // ─── Step 5: Verify merge properties ────────────────────────────

      // Compute expected surviving IDs (from kept issues and kept transitions)
      const expectedSurvivingIds = new Set<string>();
      for (const issue of keptIssues) {
        for (const sectionId of issue.sectionIds) {
          if (sections.includes(sectionId)) {
            expectedSurvivingIds.add(`issue-${issue.id}`);
          }
        }
      }
      for (const tr of keptTransitions) {
        if (sections.includes(tr.toSectionId)) {
          for (const cl of tr.checklist) {
            expectedSurvivingIds.add(`transition-${tr.id}-${cl.id}`);
          }
        }
      }

      // Compute removed IDs
      const removedIds = new Set<string>();
      for (const issue of removedIssues) {
        for (const sectionId of issue.sectionIds) {
          if (sections.includes(sectionId)) {
            removedIds.add(`issue-${issue.id}`);
          }
        }
      }
      for (const tr of removedTransitions) {
        if (sections.includes(tr.toSectionId)) {
          for (const cl of tr.checklist) {
            removedIds.add(`transition-${tr.id}-${cl.id}`);
          }
        }
      }

      // Check every section's output
      for (const sectionId of sections) {
        const mergedItems = mergedOutput[sectionId] ?? [];

        for (const item of mergedItems) {
          // Property A: Items that persisted retain their completion state
          if (completions.has(item.id)) {
            expect(item.completed).toBe(completions.get(item.id));
          } else {
            // Property B: New items have completed=false
            expect(item.completed).toBe(false);
          }
        }

        // Property C: Removed items should NOT appear in the output
        const mergedItemIds = new Set(mergedItems.map((item) => item.id));
        for (const removedId of removedIds) {
          expect(mergedItemIds.has(removedId)).toBe(false);
        }
      }

      // Verify all expected surviving IDs appear in the output
      const allMergedIds = new Set<string>();
      for (const sectionId of sections) {
        const items = mergedOutput[sectionId] ?? [];
        for (const item of items) {
          allMergedIds.add(item.id);
        }
      }
      for (const expectedId of expectedSurvivingIds) {
        expect(allMergedIds.has(expectedId)).toBe(true);
      }
    },
  );
});
