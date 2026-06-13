/**
 * Property-based tests for the Auto-Generation module — ordering invariant.
 *
 * Feature: m5-notes-checklist, Property 10: Auto-generation ordering invariant
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { Issue, IssueSeverity } from "../../src/core/issue-types.js";
import type { TransitionRecommendation, ChecklistItem } from "../../src/core/transition-engine.js";

// ─── Severity Priority Map ─────────────────────────────────────────────

/** Severity priority: lower number = higher priority (should appear first). */
const SEVERITY_PRIORITY: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a severity level. */
const severityArb: fc.Arbitrary<IssueSeverity> = fc.constantFrom("critical", "warning", "info");

/** Generate a non-empty alphanumeric section ID. */
const sectionIdArb = fc.stringMatching(/^section-[a-z0-9]{1,10}$/);

/** Generate a valid issue ID. */
const issueIdArb = fc.stringMatching(/^[a-z0-9]{4,12}$/);

/** Generate a valid recommendation ID. */
const recommendationIdArb = fc.stringMatching(/^rec-[a-z0-9]{1,10}$/);

/** Generate valid checklist item text (1–150 chars, non-empty). */
const checklistItemTextArb = fc
  .string({ minLength: 1, maxLength: 150 })
  .filter((s) => s.trim().length > 0);

/** Generate a single ChecklistItem for a transition recommendation. */
const checklistItemArb: fc.Arbitrary<ChecklistItem> = fc.record({
  id: fc.stringMatching(/^[a-z0-9]{1,12}$/),
  text: checklistItemTextArb,
  completed: fc.boolean(),
});

/**
 * Generate an Issue that references a specific target section (and possibly others).
 * The target section is always included in sectionIds.
 */
function issueForSectionArb(targetSectionId: string, additionalSections: string[]): fc.Arbitrary<Issue> {
  const allSections = [targetSectionId, ...additionalSections];
  return fc
    .record({
      id: issueIdArb,
      severity: severityArb,
      message: fc.string({ minLength: 1, maxLength: 150 }).filter((s) => s.trim().length > 0),
      extraSections: fc.subarray(additionalSections),
    })
    .map(({ id, severity, message, extraSections }) => ({
      id,
      type: "flat-energy" as const,
      severity,
      sectionIds: [targetSectionId, ...extraSections],
      message,
    }));
}

/**
 * Generate a TransitionRecommendation targeting a specific section.
 */
function transitionForSectionArb(toSectionId: string): fc.Arbitrary<TransitionRecommendation> {
  return fc
    .record({
      id: recommendationIdArb,
      fromSectionId: sectionIdArb,
      checklist: fc.array(checklistItemArb, { minLength: 1, maxLength: 5 }),
    })
    .map((rec) => ({
      ...rec,
      toSectionId,
      // Ensure unique checklist item IDs within recommendation
      checklist: rec.checklist.map((item, j) => ({
        ...item,
        id: `${item.id}-${j}`,
      })),
      // Fields required by the interface but not used by the generator
      energyDelta: 0,
      transitionSize: "medium" as const,
      suggestedDurationBars: 8,
      techniques: [],
      boundaryType: "normal" as const,
      rationale: "test rationale",
    }));
}

/**
 * Generate a test scenario that guarantees at least one section has BOTH
 * issue-sourced AND transition-sourced items. This is critical for testing
 * the ordering invariant.
 *
 * Returns: a target section ID, issues (with varied severities) that reference
 * the target section, transition recommendations targeting the same section,
 * and the full list of existing sections.
 */
const mixedSourceScenarioArb = sectionIdArb.chain((targetSectionId) => {
  // Generate some additional sections (optional, for realism)
  const additionalSectionsArb = fc.uniqueArray(sectionIdArb, { minLength: 0, maxLength: 4 })
    .filter((arr) => !arr.includes(targetSectionId));

  return additionalSectionsArb.chain((additionalSections) => {
    const allSections = [targetSectionId, ...additionalSections];

    // Generate issues that reference the target section (at least one per severity for good coverage)
    const issuesArb = fc
      .array(issueForSectionArb(targetSectionId, additionalSections), { minLength: 2, maxLength: 8 })
      .map((issues) =>
        // Ensure unique issue IDs
        issues.map((issue, i) => ({ ...issue, id: `${issue.id}-${i}` }))
      );

    // Generate transition recommendations targeting the same section (at least 1)
    const transitionsArb = fc
      .array(transitionForSectionArb(targetSectionId), { minLength: 1, maxLength: 4 })
      .map((recs) =>
        // Ensure unique recommendation IDs
        recs.map((rec, i) => ({ ...rec, id: `${rec.id}-${i}` }))
      );

    return fc.tuple(issuesArb, transitionsArb).map(([issues, transitions]) => ({
      targetSectionId,
      allSections,
      issues,
      transitions,
    }));
  });
});

// ─── Property 10: Auto-generation ordering invariant ───────────────────

// Feature: m5-notes-checklist, Property 10: Auto-generation ordering invariant
describe("Property 10: Auto-generation ordering invariant", () => {
  /**
   * **Validates: Requirements 2.6**
   *
   * For any section's generated checklist containing both issue-sourced and
   * transition-sourced items, all issue-sourced items SHALL appear before all
   * transition-sourced items.
   */
  test.prop([mixedSourceScenarioArb], { numRuns: 100 })(
    "all issue-sourced items appear before all transition-sourced items",
    ({ targetSectionId, allSections, issues, transitions }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: transitions,
        existingSections: allSections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      const sectionItems = result[targetSectionId] ?? [];

      // There must be at least one of each source type (generator guarantees this)
      const issueItems = sectionItems.filter((item) => item.source === "issue");
      const transitionItems = sectionItems.filter((item) => item.source === "transition");
      expect(issueItems.length).toBeGreaterThan(0);
      expect(transitionItems.length).toBeGreaterThan(0);

      // Find the index of the last issue-sourced item
      const lastIssueIndex = sectionItems.reduce(
        (maxIdx, item, idx) => (item.source === "issue" ? idx : maxIdx),
        -1,
      );

      // Find the index of the first transition-sourced item
      const firstTransitionIndex = sectionItems.findIndex(
        (item) => item.source === "transition",
      );

      // All issue-sourced items must come before all transition-sourced items
      expect(lastIssueIndex).toBeLessThan(firstTransitionIndex);
    },
  );

  /**
   * **Validates: Requirements 2.6**
   *
   * Among issue-sourced items within a section, items SHALL be ordered by
   * severity: critical first, then warning, then info.
   */
  test.prop([mixedSourceScenarioArb], { numRuns: 100 })(
    "issue-sourced items are ordered by severity: critical → warning → info",
    ({ targetSectionId, allSections, issues, transitions }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: transitions,
        existingSections: allSections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      const sectionItems = result[targetSectionId] ?? [];
      const issueItems = sectionItems.filter((item) => item.source === "issue");

      // Verify severity ordering is non-decreasing (monotonically increasing priority number)
      // We need to recover the severity from the original issues
      const issueById = new Map(issues.map((issue) => [`issue-${issue.id}`, issue.severity]));

      for (let i = 0; i < issueItems.length - 1; i++) {
        const currentSeverity = issueById.get(issueItems[i]!.id);
        const nextSeverity = issueById.get(issueItems[i + 1]!.id);

        expect(currentSeverity).toBeDefined();
        expect(nextSeverity).toBeDefined();

        const currentPriority = SEVERITY_PRIORITY[currentSeverity!];
        const nextPriority = SEVERITY_PRIORITY[nextSeverity!];

        // Current item's priority should be ≤ next item's priority
        // (lower number = higher priority = appears earlier)
        expect(currentPriority).toBeLessThanOrEqual(nextPriority);
      }
    },
  );

  /**
   * **Validates: Requirements 2.6**
   *
   * Combined invariant: in a section with both source types, the ordering
   * is issue-sourced (by severity) followed by transition-sourced — verified
   * by checking that no transition item appears between issue items.
   */
  test.prop([mixedSourceScenarioArb], { numRuns: 100 })(
    "no transition-sourced item appears between issue-sourced items",
    ({ targetSectionId, allSections, issues, transitions }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: transitions,
        existingSections: allSections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      const sectionItems = result[targetSectionId] ?? [];

      // Walk through items: once we see a transition item, no more issue items should follow
      let seenTransition = false;
      for (const item of sectionItems) {
        if (item.source === "transition") {
          seenTransition = true;
        } else if (item.source === "issue" && seenTransition) {
          // This would violate the ordering invariant
          expect.fail(
            `Found issue-sourced item "${item.id}" after transition-sourced item — ` +
              `issue items must all appear before transition items`,
          );
        }
      }
    },
  );
});
