/**
 * Property-based tests for the Auto-Generation module — issue-sourced items.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { Issue, IssueSeverity } from "../../src/core/issue-types.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a severity level. */
const severityArbitrary: fc.Arbitrary<IssueSeverity> = fc.constantFrom(
  "critical",
  "warning",
  "info",
);

/** Generate a non-empty alphanumeric section ID. */
const sectionIdArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,19}$/);

/** Generate a non-empty list of unique section IDs. */
const sectionIdsArbitrary = fc
  .uniqueArray(sectionIdArbitrary, { minLength: 1, maxLength: 8 })
  .filter((arr) => arr.length >= 1);

/**
 * Generate an Issue that references a subset of the provided section IDs.
 * Ensures sectionIds is non-empty and only contains IDs from the pool.
 */
function issueArbitrary(sectionPool: string[]): fc.Arbitrary<Issue> {
  return fc
    .record({
      id: fc.stringMatching(/^[a-z0-9]{4,12}$/),
      severity: severityArbitrary,
      message: fc.string({ minLength: 1, maxLength: 150 }),
      referencedSections: fc
        .subarray(sectionPool, { minLength: 1 })
        .filter((arr) => arr.length >= 1),
    })
    .map(({ id, severity, message, referencedSections }) => ({
      id,
      type: "flat-energy" as const,
      severity,
      sectionIds: referencedSections,
      message,
    }));
}

/**
 * Generate a test scenario: a list of existing sections and a list of issues
 * that reference subsets of those sections. Issue IDs are unique.
 */
const scenarioArbitrary = sectionIdsArbitrary.chain((sections) =>
  fc
    .uniqueArray(issueArbitrary(sections), {
      minLength: 1,
      maxLength: 10,
      selector: (issue) => issue.id,
    })
    .filter((arr) => arr.length >= 1)
    .map((issues) => ({ sections, issues })),
);

// ─── Property 6: Auto-generation produces correct items from issues ────

// Feature: m5-notes-checklist, Property 6: Auto-generation produces correct items from issues
describe("Property 6: Auto-generation produces correct items from issues", () => {
  /**
   * **Validates: Requirements 2.1, 2.3, 2.7**
   *
   * For any set of issues where each issue references one or more sectionIds,
   * the auto-generation module SHALL produce exactly one SectionChecklistItem
   * per issue per referenced section, with source="issue".
   */
  test.prop([scenarioArbitrary], { numRuns: 100 })(
    "produces exactly one item per issue per referenced section with source='issue'",
    ({ sections, issues }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: [],
        existingSections: sections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      for (const issue of issues) {
        for (const sectionId of issue.sectionIds) {
          const sectionItems = result[sectionId] ?? [];
          const matchingItems = sectionItems.filter(
            (item) => item.id === `issue-${issue.id}` && item.sectionId === sectionId,
          );

          // Exactly one item per issue per referenced section
          expect(matchingItems).toHaveLength(1);
          // Source must be "issue"
          expect(matchingItems[0]!.source).toBe("issue");
        }
      }
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3, 2.7**
   *
   * For any issue, the generated checklist item text SHALL match the
   * issue message verbatim — no modification, truncation, or transformation.
   */
  test.prop([scenarioArbitrary], { numRuns: 100 })(
    "item text matches issue message verbatim",
    ({ sections, issues }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: [],
        existingSections: sections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      for (const issue of issues) {
        for (const sectionId of issue.sectionIds) {
          const sectionItems = result[sectionId] ?? [];
          const item = sectionItems.find(
            (i) => i.id === `issue-${issue.id}` && i.sectionId === sectionId,
          );

          expect(item).toBeDefined();
          expect(item!.text).toBe(issue.message);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3, 2.7**
   *
   * For any issue, the generated checklist item id SHALL be `issue-{issueId}`,
   * providing a stable, deterministic identifier derived from the issue id.
   */
  test.prop([scenarioArbitrary], { numRuns: 100 })(
    "item id is derived as 'issue-{issueId}'",
    ({ sections, issues }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: [],
        existingSections: sections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      for (const issue of issues) {
        for (const sectionId of issue.sectionIds) {
          const sectionItems = result[sectionId] ?? [];
          // Find by expected ID directly — avoids ambiguity when multiple issues
          // share the same message text within the same section.
          const item = sectionItems.find(
            (i) => i.id === `issue-${issue.id}` && i.sectionId === sectionId,
          );

          expect(item).toBeDefined();
          expect(item!.id).toBe(`issue-${issue.id}`);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3, 2.7**
   *
   * For any issue referencing multiple sectionIds, the auto-generation module
   * SHALL produce separate SectionChecklistItem instances per referenced section —
   * each with an independent sectionId field matching its containing section.
   */
  test.prop([scenarioArbitrary], { numRuns: 100 })(
    "issue referencing multiple sections produces separate items per section",
    ({ sections, issues }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: [],
        existingSections: sections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      for (const issue of issues) {
        if (issue.sectionIds.length <= 1) continue;

        // Each referenced section should have its own item
        const itemsForIssue: Array<{ sectionId: string; item: (typeof result)[string][number] }> = [];

        for (const sectionId of issue.sectionIds) {
          const sectionItems = result[sectionId] ?? [];
          const item = sectionItems.find(
            (i) => i.id === `issue-${issue.id}` && i.sectionId === sectionId,
          );
          expect(item).toBeDefined();
          itemsForIssue.push({ sectionId, item: item! });
        }

        // The items should be in different sections
        const uniqueSections = new Set(itemsForIssue.map((x) => x.sectionId));
        expect(uniqueSections.size).toBe(issue.sectionIds.length);

        // Each item's sectionId should match its containing section
        for (const { sectionId, item } of itemsForIssue) {
          expect(item.sectionId).toBe(sectionId);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 2.1, 2.3, 2.7**
   *
   * The total number of issue-sourced items across all sections SHALL equal
   * the sum of sectionIds.length for each issue (one item per issue per section).
   */
  test.prop([scenarioArbitrary], { numRuns: 100 })(
    "total issue-sourced items equals sum of issue.sectionIds.length",
    ({ sections, issues }) => {
      const result = generateSectionChecklists({
        issues,
        transitionRecommendations: [],
        existingSections: sections,
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      const expectedTotal = issues.reduce(
        (sum, issue) => sum + issue.sectionIds.length,
        0,
      );

      let actualTotal = 0;
      for (const sectionId of sections) {
        const sectionItems = result[sectionId] ?? [];
        actualTotal += sectionItems.filter((item) => item.source === "issue").length;
      }

      expect(actualTotal).toBe(expectedTotal);
    },
  );
});
