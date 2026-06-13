/**
 * Issues Panel — pure functions for grouping, sorting, summarizing, and
 * rendering detected arrangement issues for display in the Issues Panel UI.
 *
 * This module handles:
 * - Grouping issues by section (maintaining section order)
 * - Sorting issues within each group by severity (critical → warning → info)
 * - Computing summary counts per severity level
 * - Filtering out issues that reference sections no longer in the arrangement
 * - Rendering the Issues Panel as an HTML string (webview)
 */
import type { Section } from "../core/section-scanner.js";
import type { Issue, IssueSeverity } from "../core/issue-types.js";

// ─── Interfaces ────────────────────────────────────────────────────────

/** A group of issues belonging to a single section. */
export interface IssueGroup {
  readonly sectionId: string;
  readonly sectionName: string;
  readonly issues: readonly Issue[];
}

/** Aggregate counts of issues per severity level. */
export interface IssueSummary {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

// ─── Severity Priority ─────────────────────────────────────────────────

/** Lower number = higher priority (shown first). */
const SEVERITY_PRIORITY: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ─── Public Functions ──────────────────────────────────────────────────

/**
 * Group issues by section, maintaining the order of `sections`.
 *
 * Logic:
 * 1. Build a lookup map of sectionId → Section for valid sections.
 * 2. For each issue, determine its group by finding the FIRST sectionId in
 *    `issue.sectionIds` that exists in the sections map. If none of the
 *    issue's sectionIds exist, the issue is filtered out entirely.
 * 3. Each issue appears in exactly one group (no duplication across groups).
 * 4. Within each group, issues are sorted by severity: critical → warning → info.
 * 5. Only sections that have at least one issue are included in the output.
 * 6. Groups appear in the same order as sections in the input array.
 */
export function groupIssuesBySection(
  issues: readonly Issue[],
  sections: readonly Section[],
): IssueGroup[] {
  // Step 1: Build section lookup map
  const sectionMap = new Map<string, Section>();
  for (const section of sections) {
    sectionMap.set(section.id, section);
  }

  // Step 2: Assign each issue to its first valid section
  const groupMap = new Map<string, Issue[]>();

  for (const issue of issues) {
    const assignedSectionId = findFirstValidSection(issue.sectionIds, sectionMap);
    if (assignedSectionId === undefined) {
      // Issue references no existing sections — filter it out
      continue;
    }

    let group = groupMap.get(assignedSectionId);
    if (group === undefined) {
      group = [];
      groupMap.set(assignedSectionId, group);
    }
    group.push(issue);
  }

  // Step 3: Build output in section order, skip sections with no issues
  const result: IssueGroup[] = [];

  for (const section of sections) {
    const groupIssues = groupMap.get(section.id);
    if (groupIssues === undefined || groupIssues.length === 0) {
      continue;
    }

    // Step 4: Sort by severity within group
    const sorted = [...groupIssues].sort(
      (a, b) => SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity],
    );

    result.push({
      sectionId: section.id,
      sectionName: section.name,
      issues: sorted,
    });
  }

  return result;
}

/**
 * Compute aggregate issue counts per severity level.
 *
 * Counts all issues in the input array by their severity field and
 * returns a summary with per-severity counts and the total.
 */
export function computeIssueSummary(issues: readonly Issue[]): IssueSummary {
  let critical = 0;
  let warning = 0;
  let info = 0;

  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        critical++;
        break;
      case "warning":
        warning++;
        break;
      case "info":
        info++;
        break;
    }
  }

  return {
    critical,
    warning,
    info,
    total: critical + warning + info,
  };
}

// ─── Internal Helpers ──────────────────────────────────────────────────

/**
 * Find the first sectionId in the issue's sectionIds array that exists
 * in the valid sections map. Returns undefined if none match.
 */
function findFirstValidSection(
  sectionIds: readonly string[],
  sectionMap: ReadonlyMap<string, Section>,
): string | undefined {
  for (const id of sectionIds) {
    if (sectionMap.has(id)) {
      return id;
    }
  }
  return undefined;
}

// ─── Rendering ─────────────────────────────────────────────────────────

/** Options for rendering the Issues Panel HTML. */
export interface RenderIssuesPanelOptions {
  readonly issues: readonly Issue[];
  readonly sections: readonly Section[];
}

/**
 * Render the Issues Panel as an HTML string.
 *
 * If no issues are detected, renders a "No issues found" confirmation.
 * Otherwise renders:
 * 1. A summary line with counts per severity level
 * 2. Issues grouped by section, each with severity icon and message
 * 3. Each issue element carries a `data-section-id` attribute for navigation
 *
 * @param options - The issues array and sections array for grouping.
 * @returns HTML string for the Issues Panel.
 */
export function renderIssuesPanel(options: RenderIssuesPanelOptions): string {
  const { issues, sections } = options;

  if (issues.length === 0) {
    return `<div class="issues-panel"><div class="issues-empty">No issues found</div></div>`;
  }

  const summary = computeIssueSummary(issues);
  const groups = groupIssuesBySection(issues, sections);

  let html = `<div class="issues-panel">`;
  html += renderSummary(summary);

  for (const group of groups) {
    html += renderIssueGroup(group);
  }

  html += `</div>`;
  return html;
}

/**
 * Render the summary counts line.
 */
function renderSummary(summary: IssueSummary): string {
  const parts: string[] = [];
  if (summary.critical > 0) {
    parts.push(`${summary.critical} critical`);
  }
  if (summary.warning > 0) {
    parts.push(`${summary.warning} warning`);
  }
  if (summary.info > 0) {
    parts.push(`${summary.info} info`);
  }
  return `<div class="issues-summary">${parts.join(", ")}</div>`;
}

/**
 * Render a single issue group (one section's issues).
 */
function renderIssueGroup(group: IssueGroup): string {
  let html = `<div class="issue-group">`;
  html += `<h3 class="issue-group__header">${escapeHtml(group.sectionName)}</h3>`;

  for (const issue of group.issues) {
    const sectionId = issue.sectionIds[0] ?? "";
    html += `<div class="issue-item" data-section-id="${escapeAttr(sectionId)}">`;
    html += `<span class="issue-severity issue-severity--${issue.severity}">${issue.severity}</span>`;
    html += `<span class="issue-message">${escapeHtml(issue.message)}</span>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Escape HTML special characters in text content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a value for use in an HTML attribute.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
