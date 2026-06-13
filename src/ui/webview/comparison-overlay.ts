/**
 * Comparison Overlay — rendering functions for the reference track
 * comparison overlay in the webview.
 *
 * Exports pure functions that produce HTML strings for:
 * - The full comparison overlay (two aligned horizontal bars with connectors)
 * - A "no reference" hint message explaining naming conventions
 *
 * The overlay visually aligns user sections (top bar) alongside reference
 * sections (bottom bar), showing proportional differences, connector lines
 * between matched pairs, and a summary row with aggregate metrics.
 */

import type { ComparisonResult, ReferenceSection, SectionDelta } from "../../core/reference-types.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** Maximum label length before truncation. */
export const MAX_LABEL_LENGTH = 10;

/** Minimum segment width as a proportion (3%). */
export const MIN_SEGMENT_PROPORTION = 0.03;

// ─── Label Truncation ──────────────────────────────────────────────────

/**
 * Truncate a label to MAX_LABEL_LENGTH characters, appending "…" if truncated.
 *
 * @param label - The string to truncate.
 * @returns The original string if within limit, or first 10 chars + "…".
 */
export function truncateLabel(label: string): string {
  if (label.length <= MAX_LABEL_LENGTH) {
    return label;
  }
  return label.slice(0, MAX_LABEL_LENGTH) + "\u2026";
}

// ─── Width Calculation ─────────────────────────────────────────────────

/**
 * Compute display widths (percentages) for segments with minimum 3% enforcement.
 *
 * If any segment's proportion is below MIN_SEGMENT_PROPORTION, it is set to 3%.
 * Remaining segments are scaled proportionally to fill 100%.
 *
 * @param proportions - Array of proportions (0.0–1.0) summing to ~1.0.
 * @returns Array of width percentages (0–100) summing to 100.
 */
export function computeSegmentWidths(proportions: readonly number[]): number[] {
  if (proportions.length === 0) {
    return [];
  }

  const enforced = proportions.map(p => Math.max(p, MIN_SEGMENT_PROPORTION));
  const total = enforced.reduce((sum, w) => sum + w, 0);

  // Normalize so they sum to 100%
  return enforced.map(w => (w / total) * 100);
}

// ─── HTML Escaping ─────────────────────────────────────────────────────

/**
 * Escape special HTML characters to prevent XSS in rendered content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Segment Rendering ─────────────────────────────────────────────────

/**
 * Render a single segment within a horizontal bar.
 *
 * @param label - The section label.
 * @param widthPercent - The width as a percentage of total bar width.
 * @param matched - Whether this segment has a matched counterpart.
 * @param index - The segment index (used for connector pairing).
 * @returns HTML string for the segment.
 */
function renderSegment(label: string, widthPercent: number, matched: boolean, index: number): string {
  const truncated = truncateLabel(label);
  const escaped = escapeHtml(truncated);
  const matchedClass = matched ? "co-segment--matched" : "co-segment--unmatched";

  return `<div class="co-segment ${matchedClass}" ` +
    `style="width:${widthPercent.toFixed(2)}%;" ` +
    `data-index="${index}" ` +
    `title="${escapeHtml(label)}">` +
    `<span class="co-segment-label">${escaped}</span>` +
    `</div>`;
}

// ─── Connector Lines ───────────────────────────────────────────────────

/**
 * Render connector lines between matched section pairs.
 *
 * Connectors link segments at the same ordinal position (index) in the
 * user and reference bars. Only matched pairs get connectors.
 *
 * @param sectionDeltas - The per-section delta data.
 * @param userWidths - Width percentages for user segments.
 * @param refWidths - Width percentages for reference segments.
 * @returns HTML string for the connectors area.
 */
function renderConnectors(
  sectionDeltas: readonly SectionDelta[],
  userWidths: readonly number[],
  refWidths: readonly number[]
): string {
  let connectorsHtml = "";

  // Calculate midpoints for each segment
  let userOffset = 0;
  const userMidpoints: number[] = [];
  for (const w of userWidths) {
    userMidpoints.push(userOffset + w / 2);
    userOffset += w;
  }

  let refOffset = 0;
  const refMidpoints: number[] = [];
  for (const w of refWidths) {
    refMidpoints.push(refOffset + w / 2);
    refOffset += w;
  }

  for (let i = 0; i < sectionDeltas.length; i++) {
    const delta = sectionDeltas[i]!;
    if (!delta.matched) {
      continue;
    }

    const userMid = userMidpoints[i];
    const refMid = refMidpoints[i];
    if (userMid === undefined || refMid === undefined) {
      continue;
    }

    connectorsHtml += `<line class="co-connector" ` +
      `x1="${userMid.toFixed(2)}%" y1="0" ` +
      `x2="${refMid.toFixed(2)}%" y2="100%" ` +
      `data-index="${i}" />`;
  }

  return `<svg class="co-connectors" aria-hidden="true" preserveAspectRatio="none">${connectorsHtml}</svg>`;
}

// ─── Summary Row ───────────────────────────────────────────────────────

/**
 * Format the total duration difference in bars (1 bar = 4 beats).
 *
 * @param totalDurationDifference - Difference in beats (user - reference).
 * @returns Formatted string like "+8 bars", "-4 bars", "0 bars".
 */
function formatDurationDiffBars(totalDurationDifference: number): string {
  const bars = Math.round(totalDurationDifference / 4);
  if (bars > 0) {
    return `+${bars} bars`;
  }
  if (bars < 0) {
    return `${bars} bars`;
  }
  return "0 bars";
}

/**
 * Format the section count difference as a signed integer.
 *
 * @param sectionCountDifference - Difference (user count - reference count).
 * @returns Formatted string like "+2", "-1", "0".
 */
function formatSectionCountDiff(sectionCountDifference: number): string {
  if (sectionCountDifference > 0) {
    return `+${sectionCountDifference}`;
  }
  return `${sectionCountDifference}`;
}

/**
 * Format the peak position difference as a signed percentage.
 *
 * @param peakPositionDifference - Difference in percentage points.
 * @returns Formatted string like "+3.5%", "-1.2%", "0.0%".
 */
function formatPeakPositionDiff(peakPositionDifference: number): string {
  const rounded = peakPositionDifference.toFixed(1);
  if (peakPositionDifference > 0) {
    return `+${rounded}%`;
  }
  return `${rounded}%`;
}

/**
 * Render the summary row with aggregate metrics.
 *
 * @param metrics - The aggregate metrics from the comparison result.
 * @returns HTML string for the summary row.
 */
function renderSummaryRow(metrics: ComparisonResult["aggregateMetrics"]): string {
  const durationStr = formatDurationDiffBars(metrics.totalDurationDifference);
  const countStr = formatSectionCountDiff(metrics.sectionCountDifference);
  const peakStr = formatPeakPositionDiff(metrics.peakPositionDifference);

  return `<div class="co-summary" role="region" aria-label="Comparison summary">` +
    `<span class="co-summary-item" aria-label="Duration difference: ${escapeHtml(durationStr)}">` +
    `<span class="co-summary-label">Duration</span>` +
    `<span class="co-summary-value">${escapeHtml(durationStr)}</span>` +
    `</span>` +
    `<span class="co-summary-item" aria-label="Section count difference: ${escapeHtml(countStr)}">` +
    `<span class="co-summary-label">Sections</span>` +
    `<span class="co-summary-value">${escapeHtml(countStr)}</span>` +
    `</span>` +
    `<span class="co-summary-item" aria-label="Peak position difference: ${escapeHtml(peakStr)}">` +
    `<span class="co-summary-label">Peak Pos.</span>` +
    `<span class="co-summary-value">${escapeHtml(peakStr)}</span>` +
    `</span>` +
    `</div>`;
}

// ─── No Reference Hint ─────────────────────────────────────────────────

/**
 * Render the hint message explaining how to designate a reference track.
 *
 * Displayed when no reference track has been detected (initial state or
 * after a `reference_cleared` message).
 *
 * @returns HTML string for the hint message.
 */
export function renderNoReferenceHint(): string {
  return `<div class="co-no-reference" role="status" aria-label="No reference track detected">` +
    `<p class="co-hint-text">No reference track detected.</p>` +
    `<p class="co-hint-convention">Name a track <strong>REF</strong> or <strong>[Reference]</strong> to enable comparison.</p>` +
    `</div>`;
}

// ─── Full Overlay Render ───────────────────────────────────────────────

/**
 * Input data for rendering the comparison overlay.
 */
export interface ComparisonOverlayData {
  /** The comparison result, or null if comparison is not available. */
  readonly comparisonResult: ComparisonResult | null;
  /** The reference sections extracted from the reference track. */
  readonly referenceSections: readonly ReferenceSection[];
  /** Labels for the user's sections (one per user section, in order). */
  readonly userSectionLabels: readonly string[];
  /** Proportions for the user's sections (one per user section, in order). */
  readonly userSectionProportions: readonly number[];
  /** Whether a reference_cleared event has been received. */
  readonly referenceCleared: boolean;
}

/**
 * Render the full comparison overlay HTML.
 *
 * Shows two aligned horizontal bars (user sections on top, reference on bottom),
 * connector lines between matched pairs, and a summary row with aggregate metrics.
 *
 * When `referenceCleared` is true or `comparisonResult` is null, shows the
 * "no reference" hint instead.
 *
 * @param data - All data needed to render the overlay.
 * @returns HTML string for the comparison overlay.
 */
export function renderComparisonOverlay(data: ComparisonOverlayData): string {
  const { comparisonResult, referenceSections, userSectionLabels, userSectionProportions, referenceCleared } = data;

  // Handle cleared / null states → show hint
  if (referenceCleared || comparisonResult === null) {
    return renderNoReferenceHint();
  }

  const { sectionDeltas, aggregateMetrics } = comparisonResult;

  // Determine matched status for user segments
  const userMatched: boolean[] = [];
  for (let i = 0; i < userSectionLabels.length; i++) {
    const delta = sectionDeltas[i];
    userMatched.push(delta !== undefined && delta.matched);
  }

  // Determine matched status for reference segments
  const refMatched: boolean[] = [];
  for (let i = 0; i < referenceSections.length; i++) {
    // A reference section is matched if there's a corresponding delta at the same index that's matched
    const delta = sectionDeltas[i];
    refMatched.push(delta !== undefined && delta.matched);
  }

  // Compute widths
  const userWidths = computeSegmentWidths(userSectionProportions);
  const refProportions = referenceSections.map(s => s.proportion);
  const refWidths = computeSegmentWidths(refProportions);

  // Render user bar
  let userBarHtml = "";
  for (let i = 0; i < userSectionLabels.length; i++) {
    const label = userSectionLabels[i] ?? "";
    const width = userWidths[i] ?? 0;
    const matched = userMatched[i] ?? false;
    userBarHtml += renderSegment(label, width, matched, i);
  }

  // Render reference bar
  let refBarHtml = "";
  for (let i = 0; i < referenceSections.length; i++) {
    const section = referenceSections[i]!;
    const width = refWidths[i] ?? 0;
    const matched = refMatched[i] ?? false;
    refBarHtml += renderSegment(section.label, width, matched, i);
  }

  // Render connectors
  const connectorsHtml = renderConnectors(sectionDeltas, userWidths, refWidths);

  // Render summary
  const summaryHtml = renderSummaryRow(aggregateMetrics);

  // Assemble the overlay
  return `<div class="co-overlay" role="region" aria-label="Reference comparison overlay">` +
    `<div class="co-bar-group">` +
    `<div class="co-bar co-bar--user" aria-label="User sections">${userBarHtml}</div>` +
    `<div class="co-connectors-area">${connectorsHtml}</div>` +
    `<div class="co-bar co-bar--reference" aria-label="Reference sections">${refBarHtml}</div>` +
    `</div>` +
    summaryHtml +
    `</div>`;
}
