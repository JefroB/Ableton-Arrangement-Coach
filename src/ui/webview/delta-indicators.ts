/**
 * Delta Indicators — rendering functions for the reference comparison
 * delta indicators shown beside each section in the webview.
 *
 * Exports pure functions that produce HTML strings for delta indicators.
 * Each indicator shows the proportion delta as a signed percentage with
 * color coding and directional arrows. Unmatched sections show "no ref"
 * in gray. Tooltips display duration delta in bars.
 *
 * Color scale:
 * - Green: |delta| ≤ 5pp (close match)
 * - Yellow: 5 < |delta| ≤ 15pp (moderate difference)
 * - Red: |delta| > 15pp (large difference)
 *
 * Arrow direction:
 * - ↑ (positive delta — user section proportionally longer)
 * - ↓ (negative delta — user section proportionally shorter)
 * - (none) when delta rounds to zero
 */

import type { SectionDelta } from "../../core/reference-types.js";

// ─── Color Thresholds ──────────────────────────────────────────────────

/**
 * Determine the color for a given proportion delta percentage.
 *
 * @param deltaPercent - The proportion delta as a percentage (e.g., 5.3 means 5.3pp).
 * @returns "green" if |delta| ≤ 5, "yellow" if 5 < |delta| ≤ 15, "red" if |delta| > 15.
 */
export function getDeltaColor(deltaPercent: number): "green" | "yellow" | "red" {
  const abs = Math.abs(deltaPercent);
  if (abs <= 5) {
    return "green";
  }
  if (abs <= 15) {
    return "yellow";
  }
  return "red";
}

// ─── Arrow Direction ───────────────────────────────────────────────────

/**
 * Determine the arrow direction for a given proportion delta percentage.
 *
 * The delta is rounded to the nearest integer before determining direction.
 *
 * @param deltaPercent - The proportion delta as a percentage.
 * @returns "↑" for positive, "↓" for negative, "" for zero (after rounding).
 */
export function getDeltaArrow(deltaPercent: number): "↑" | "↓" | "" {
  const rounded = Math.round(deltaPercent);
  if (rounded > 0) {
    return "\u2191"; // ↑
  }
  if (rounded < 0) {
    return "\u2193"; // ↓
  }
  return "";
}

// ─── Duration Tooltip ──────────────────────────────────────────────────

/**
 * Format a duration delta in beats as a signed bar count for tooltip display.
 *
 * Converts beats to bars (beats ÷ 4) and rounds to the nearest integer.
 *
 * @param durationDeltaBeats - The duration delta in beats (signed).
 * @returns A string like "+8 bars", "-4 bars", or "0 bars".
 */
export function formatDurationTooltip(durationDeltaBeats: number): string {
  const bars = Math.round(durationDeltaBeats / 4);
  if (bars > 0) {
    return `+${bars} bars`;
  }
  if (bars < 0) {
    return `${bars} bars`;
  }
  return "0 bars";
}

// ─── Single Delta Indicator ────────────────────────────────────────────

/**
 * Render an HTML string for a single delta indicator.
 *
 * For matched sections: displays signed percentage with color and arrow.
 * For unmatched sections: displays "no ref" in gray.
 *
 * @param sectionDelta - The section delta data from the comparison result.
 * @returns HTML string for the delta indicator element.
 */
export function renderDeltaIndicator(sectionDelta: SectionDelta): string {
  if (!sectionDelta.matched || sectionDelta.proportionDelta === null) {
    return `<span class="delta-indicator delta-indicator--no-ref" aria-label="No reference match">no ref</span>`;
  }

  const deltaPercent = sectionDelta.proportionDelta * 100;
  const rounded = Math.round(deltaPercent);
  const color = getDeltaColor(deltaPercent);
  const arrow = getDeltaArrow(deltaPercent);

  const sign = rounded > 0 ? "+" : "";
  const displayText = `${arrow}${sign}${rounded}%`;

  const tooltip = sectionDelta.durationDeltaBeats !== null
    ? formatDurationTooltip(sectionDelta.durationDeltaBeats)
    : "";

  const tooltipAttr = tooltip !== "" ? ` title="${tooltip}"` : "";

  return `<span class="delta-indicator delta-indicator--${color}"${tooltipAttr} ` +
    `aria-label="Delta: ${sign}${rounded}% (${color})">${displayText}</span>`;
}

// ─── All Indicators Rendering ──────────────────────────────────────────

/**
 * Render delta indicators for all sections, or return empty string if
 * comparison results are null (no reference or comparison not possible).
 *
 * @param sectionDeltas - Array of section deltas from the comparison result, or null.
 * @returns Array of HTML strings (one per section), or empty array if null.
 */
export function renderAllDeltaIndicators(sectionDeltas: readonly SectionDelta[] | null): string[] {
  if (sectionDeltas === null) {
    return [];
  }
  return sectionDeltas.map(renderDeltaIndicator);
}
