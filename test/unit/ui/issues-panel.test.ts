/**
 * Unit tests for Issues Panel grouping and sorting logic.
 *
 * Tests the two pure functions:
 * - groupIssuesBySection: groups issues by section, sorts by severity
 * - computeIssueSummary: counts issues per severity level
 */
import { describe, it, expect } from "vitest";
import { groupIssuesBySection, computeIssueSummary } from "../../../src/ui/issues-panel.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { Issue } from "../../../src/core/issue-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeSection(id: string, name: string): Section {
  return { id, name, startTime: 0, endTime: 16 };
}

function makeIssue(
  id: string,
  severity: "critical" | "warning" | "info",
  sectionIds: string[],
): Issue {
  return {
    id,
    type: "flat-energy",
    severity,
    sectionIds,
    message: `Test issue ${id}`,
  };
}

// ─── groupIssuesBySection Tests ────────────────────────────────────────

describe("groupIssuesBySection", () => {
  it("returns empty array when no issues", () => {
    const sections = [makeSection("s-0", "Intro"), makeSection("s-1", "Drop")];
    const result = groupIssuesBySection([], sections);
    expect(result).toEqual([]);
  });

  it("returns empty array when no sections", () => {
    const issues = [makeIssue("i-1", "warning", ["s-0"])];
    const result = groupIssuesBySection(issues, []);
    expect(result).toEqual([]);
  });

  it("groups issues by their first valid sectionId", () => {
    const sections = [
      makeSection("s-0", "Intro"),
      makeSection("s-1", "Drop"),
    ];
    const issues = [
      makeIssue("i-1", "warning", ["s-0"]),
      makeIssue("i-2", "info", ["s-1"]),
    ];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(2);
    expect(result[0]!.sectionId).toBe("s-0");
    expect(result[0]!.issues).toHaveLength(1);
    expect(result[1]!.sectionId).toBe("s-1");
    expect(result[1]!.issues).toHaveLength(1);
  });

  it("sorts issues within a group by severity: critical → warning → info", () => {
    const sections = [makeSection("s-0", "Intro")];
    const issues = [
      makeIssue("i-1", "info", ["s-0"]),
      makeIssue("i-2", "critical", ["s-0"]),
      makeIssue("i-3", "warning", ["s-0"]),
    ];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(1);
    expect(result[0]!.issues[0]!.severity).toBe("critical");
    expect(result[0]!.issues[1]!.severity).toBe("warning");
    expect(result[0]!.issues[2]!.severity).toBe("info");
  });

  it("maintains section order in output groups", () => {
    const sections = [
      makeSection("s-0", "Intro"),
      makeSection("s-1", "Verse"),
      makeSection("s-2", "Drop"),
    ];
    const issues = [
      makeIssue("i-1", "warning", ["s-2"]),
      makeIssue("i-2", "info", ["s-0"]),
    ];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(2);
    expect(result[0]!.sectionId).toBe("s-0");
    expect(result[1]!.sectionId).toBe("s-2");
  });

  it("filters out issues that reference sections no longer in the array", () => {
    const sections = [makeSection("s-0", "Intro")];
    const issues = [
      makeIssue("i-1", "warning", ["s-0"]),
      makeIssue("i-2", "critical", ["s-deleted"]),
    ];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(1);
    expect(result[0]!.issues).toHaveLength(1);
    expect(result[0]!.issues[0]!.id).toBe("i-1");
  });

  it("assigns issue to its FIRST valid sectionId (no duplication)", () => {
    const sections = [
      makeSection("s-0", "Intro"),
      makeSection("s-1", "Drop"),
    ];
    // Issue references both sections — should only appear in s-0 group
    const issues = [makeIssue("i-1", "warning", ["s-0", "s-1"])];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(1);
    expect(result[0]!.sectionId).toBe("s-0");
    expect(result[0]!.issues).toHaveLength(1);
  });

  it("skips first invalid sectionId and assigns to next valid one", () => {
    const sections = [
      makeSection("s-0", "Intro"),
      makeSection("s-1", "Drop"),
    ];
    // First sectionId doesn't exist, second one does
    const issues = [makeIssue("i-1", "warning", ["s-gone", "s-1"])];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(1);
    expect(result[0]!.sectionId).toBe("s-1");
  });

  it("skips sections with no matching issues (no empty groups)", () => {
    const sections = [
      makeSection("s-0", "Intro"),
      makeSection("s-1", "Verse"),
      makeSection("s-2", "Drop"),
    ];
    const issues = [makeIssue("i-1", "warning", ["s-2"])];

    const result = groupIssuesBySection(issues, sections);

    expect(result).toHaveLength(1);
    expect(result[0]!.sectionId).toBe("s-2");
  });

  it("includes correct sectionName in each group", () => {
    const sections = [makeSection("s-0", "My Intro Section")];
    const issues = [makeIssue("i-1", "info", ["s-0"])];

    const result = groupIssuesBySection(issues, sections);

    expect(result[0]!.sectionName).toBe("My Intro Section");
  });
});

// ─── computeIssueSummary Tests ─────────────────────────────────────────

describe("computeIssueSummary", () => {
  it("returns all zeros for empty issues array", () => {
    const result = computeIssueSummary([]);
    expect(result).toEqual({ critical: 0, warning: 0, info: 0, total: 0 });
  });

  it("counts issues by severity level correctly", () => {
    const issues = [
      makeIssue("i-1", "critical", ["s-0"]),
      makeIssue("i-2", "warning", ["s-0"]),
      makeIssue("i-3", "warning", ["s-1"]),
      makeIssue("i-4", "info", ["s-0"]),
      makeIssue("i-5", "info", ["s-1"]),
      makeIssue("i-6", "info", ["s-2"]),
    ];

    const result = computeIssueSummary(issues);

    expect(result.critical).toBe(1);
    expect(result.warning).toBe(2);
    expect(result.info).toBe(3);
    expect(result.total).toBe(6);
  });

  it("total equals the sum of all severity counts", () => {
    const issues = [
      makeIssue("i-1", "critical", ["s-0"]),
      makeIssue("i-2", "critical", ["s-0"]),
    ];

    const result = computeIssueSummary(issues);

    expect(result.total).toBe(result.critical + result.warning + result.info);
  });

  it("handles single-severity arrays", () => {
    const issues = [
      makeIssue("i-1", "warning", ["s-0"]),
      makeIssue("i-2", "warning", ["s-1"]),
    ];

    const result = computeIssueSummary(issues);

    expect(result).toEqual({ critical: 0, warning: 2, info: 0, total: 2 });
  });
});

// ─── renderIssuesPanel Tests ───────────────────────────────────────────

import { renderIssuesPanel } from "../../../src/ui/issues-panel.js";

describe("renderIssuesPanel", () => {
  it("displays 'No issues found' when issues array is empty", () => {
    const html = renderIssuesPanel({
      issues: [],
      sections: [makeSection("s-0", "Intro")],
    });

    expect(html).toContain("No issues found");
  });

  it("renders distinct severity CSS classes for each severity level", () => {
    const sections = [makeSection("s-0", "Intro")];
    const issues = [
      makeIssue("i-1", "critical", ["s-0"]),
      makeIssue("i-2", "warning", ["s-0"]),
      makeIssue("i-3", "info", ["s-0"]),
    ];

    const html = renderIssuesPanel({ issues, sections });

    expect(html).toContain("issue-severity--critical");
    expect(html).toContain("issue-severity--warning");
    expect(html).toContain("issue-severity--info");
  });

  it("includes data-section-id attribute with the correct section ID for navigation", () => {
    const sections = [
      makeSection("s-0", "Intro"),
      makeSection("s-1", "Drop"),
    ];
    const issues = [
      makeIssue("i-1", "warning", ["s-0"]),
      makeIssue("i-2", "critical", ["s-1"]),
    ];

    const html = renderIssuesPanel({ issues, sections });

    expect(html).toContain('data-section-id="s-0"');
    expect(html).toContain('data-section-id="s-1"');
  });

  it("filters out issues referencing sections that no longer exist", () => {
    const sections = [makeSection("s-0", "Intro")];
    const issues = [
      makeIssue("i-1", "warning", ["s-0"]),
      makeIssue("i-2", "critical", ["s-deleted"]),
    ];

    const html = renderIssuesPanel({ issues, sections });

    // The valid issue should appear
    expect(html).toContain("Test issue i-1");
    // The stale issue should not appear
    expect(html).not.toContain("Test issue i-2");
    expect(html).not.toContain("s-deleted");
  });

  it("displays summary counts with correct numbers per severity", () => {
    const sections = [makeSection("s-0", "Intro")];
    const issues = [
      makeIssue("i-1", "critical", ["s-0"]),
      makeIssue("i-2", "critical", ["s-0"]),
      makeIssue("i-3", "warning", ["s-0"]),
      makeIssue("i-4", "info", ["s-0"]),
      makeIssue("i-5", "info", ["s-0"]),
      makeIssue("i-6", "info", ["s-0"]),
    ];

    const html = renderIssuesPanel({ issues, sections });

    expect(html).toContain("2 critical");
    expect(html).toContain("1 warning");
    expect(html).toContain("3 info");
  });

  it("displays each issue's message text in the rendered HTML", () => {
    const sections = [makeSection("s-0", "Verse")];
    const issues: Issue[] = [
      {
        id: "i-msg",
        type: "flat-energy",
        severity: "warning",
        sectionIds: ["s-0"],
        message: "Energy is flat between Verse and Chorus",
      },
    ];

    const html = renderIssuesPanel({ issues, sections });

    expect(html).toContain("Energy is flat between Verse and Chorus");
  });
});


// ─── Property-Based Tests ──────────────────────────────────────────────

import { test } from "@fast-check/vitest";
import fc from "fast-check";

// ─── Generators ────────────────────────────────────────────────────────

const severityArbitrary = fc.constantFrom("critical" as const, "warning" as const, "info" as const);

const sectionIdArbitrary = fc.stringOf(
  fc.constantFrom("a", "b", "c", "0", "1", "2", "3", "-"),
  { minLength: 1, maxLength: 8 },
).map((s) => `s-${s}`);

const issueArbitrary = (validSectionIds: string[]): fc.Arbitrary<Issue> =>
  fc.tuple(
    fc.uuid(),
    severityArbitrary,
    fc.shuffledSubarray(validSectionIds, { minLength: 1 }),
  ).map(([id, severity, sectionIds]) => ({
    id,
    type: "flat-energy" as const,
    severity,
    sectionIds,
    message: `Test issue ${id}`,
  }));

const sectionArbitrary: fc.Arbitrary<Section> = fc.tuple(
  sectionIdArbitrary,
  fc.string({ minLength: 1, maxLength: 12 }),
  fc.nat({ max: 500 }),
  fc.integer({ min: 4, max: 64 }),
).map(([id, name, start, length]) => ({
  id,
  name,
  startTime: start,
  endTime: start + length,
}));

/** Generate a list of sections with unique IDs. */
const sectionsArbitrary = fc
  .array(fc.tuple(fc.string({ minLength: 1, maxLength: 8 }), fc.integer({ min: 4, max: 64 })), {
    minLength: 1,
    maxLength: 8,
  })
  .map((entries) => {
    let time = 0;
    return entries.map(([ suffix, length], idx) => {
      const section: Section = {
        id: `sec-${idx}`,
        name: `Section ${suffix}`,
        startTime: time,
        endTime: time + length,
      };
      time += length;
      return section;
    });
  });

/** Generate a non-empty list of issues that reference valid section IDs from the given sections. */
const issuesForSectionsArbitrary = (sections: Section[]): fc.Arbitrary<Issue[]> => {
  const ids = sections.map((s) => s.id);
  return fc.array(issueArbitrary(ids), { minLength: 1, maxLength: 20 });
};

// ─── Property 17: Issues grouped by section and ordered by severity ────

/**
 * **Validates: Requirements 8.1**
 *
 * Property 17: For any array of issues passed to the grouping/sorting function,
 * the output SHALL be grouped by section (each section's issues appear contiguously)
 * and within each group, issues are ordered by severity: critical first, then warning, then info.
 */
describe("Property 17: Issues grouped by section and ordered by severity", () => {
  const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

  test.prop(
    [sectionsArbitrary.chain((sections) =>
      fc.tuple(fc.constant(sections), issuesForSectionsArbitrary(sections)),
    )],
    { numRuns: 100 },
  )("issues within each group are sorted by severity (critical → warning → info)", ([sections, issues]) => {
    const groups = groupIssuesBySection(issues, sections);

    for (const group of groups) {
      for (let i = 1; i < group.issues.length; i++) {
        const prevOrder = SEVERITY_ORDER[group.issues[i - 1]!.severity];
        const currOrder = SEVERITY_ORDER[group.issues[i]!.severity];
        expect(currOrder).toBeGreaterThanOrEqual(prevOrder);
      }
    }
  });

  test.prop(
    [sectionsArbitrary.chain((sections) =>
      fc.tuple(fc.constant(sections), issuesForSectionsArbitrary(sections)),
    )],
    { numRuns: 100 },
  )("no issue appears in multiple groups (no duplication)", ([sections, issues]) => {
    const groups = groupIssuesBySection(issues, sections);

    const seenIds = new Set<string>();
    for (const group of groups) {
      for (const issue of group.issues) {
        expect(seenIds.has(issue.id)).toBe(false);
        seenIds.add(issue.id);
      }
    }
  });

  test.prop(
    [sectionsArbitrary.chain((sections) =>
      fc.tuple(fc.constant(sections), issuesForSectionsArbitrary(sections)),
    )],
    { numRuns: 100 },
  )("all issues referencing valid sections appear in some group", ([sections, issues]) => {
    const groups = groupIssuesBySection(issues, sections);
    const validSectionIds = new Set(sections.map((s) => s.id));

    // Count issues that have at least one valid sectionId
    const issuesWithValidSection = issues.filter((issue) =>
      issue.sectionIds.some((id) => validSectionIds.has(id)),
    );

    // Count total issues across all groups
    const totalGrouped = groups.reduce((sum, g) => sum + g.issues.length, 0);

    expect(totalGrouped).toBe(issuesWithValidSection.length);
  });
});

// ─── Property 18: Summary counts match actual issue counts ─────────────

/**
 * **Validates: Requirements 8.7**
 *
 * Property 18: For any array of issues, the summary counts per severity level
 * SHALL exactly equal the number of issues in the array with that severity.
 */
describe("Property 18: Summary counts match actual issue counts", () => {
  const arbitraryIssueList = fc.array(
    fc.tuple(fc.uuid(), severityArbitrary).map(([id, severity]) => ({
      id,
      type: "flat-energy" as const,
      severity,
      sectionIds: ["s-0"],
      message: `Issue ${id}`,
    } satisfies Issue)),
    { minLength: 0, maxLength: 30 },
  );

  test.prop([arbitraryIssueList], { numRuns: 100 })(
    "critical count equals number of issues with severity 'critical'",
    (issues) => {
      const summary = computeIssueSummary(issues);
      const expected = issues.filter((i) => i.severity === "critical").length;
      expect(summary.critical).toBe(expected);
    },
  );

  test.prop([arbitraryIssueList], { numRuns: 100 })(
    "warning count equals number of issues with severity 'warning'",
    (issues) => {
      const summary = computeIssueSummary(issues);
      const expected = issues.filter((i) => i.severity === "warning").length;
      expect(summary.warning).toBe(expected);
    },
  );

  test.prop([arbitraryIssueList], { numRuns: 100 })(
    "info count equals number of issues with severity 'info'",
    (issues) => {
      const summary = computeIssueSummary(issues);
      const expected = issues.filter((i) => i.severity === "info").length;
      expect(summary.info).toBe(expected);
    },
  );

  test.prop([arbitraryIssueList], { numRuns: 100 })(
    "total equals critical + warning + info",
    (issues) => {
      const summary = computeIssueSummary(issues);
      expect(summary.total).toBe(summary.critical + summary.warning + summary.info);
    },
  );
});
