// src/ui/webview/chart.ts

import { getEnergyColors } from '../../core/ui-colors-loader.js';

/**
 * Energy Curve Chart & Genre UI — rendering functions for the webview.
 *
 * Exports pure functions that produce HTML strings for the energy curve
 * bar chart, genre dropdown, and analyze button. These are designed to be
 * testable in isolation (no DOM dependencies in the rendering logic).
 */

// ─── Label Truncation ──────────────────────────────────────────────────

/**
 * Truncate a label to maxLen characters, appending "…" if truncated.
 *
 * @param label - The string to truncate.
 * @param maxLen - Maximum character count before truncation (default 12).
 * @returns The original string if within limit, or first maxLen chars + "…".
 */
export function truncateLabel(label: string, maxLen: number = 12): string {
  if (label.length <= maxLen) {
    return label;
  }
  return label.slice(0, maxLen) + "\u2026";
}

// ─── Color by Score ────────────────────────────────────────────────────

/**
 * Map an energy score (1–10) to a bar color.
 * Low scores are green, medium are yellow, high are red/orange.
 */
export function scoreToColor(score: number): string {
  const energyColors = getEnergyColors();

  for (const entry of energyColors) {
    if (score <= entry.maxScore) {
      return entry.color;
    }
  }

  // Fallback to last entry's color if score exceeds all maxScore values
  return energyColors[energyColors.length - 1]!.color;
}

// ─── Energy Curve Bar Chart ────────────────────────────────────────────

/**
 * Render the energy curve bar chart as an HTML string.
 *
 * Produces a CSS-based bar chart with one bar per section, Y-axis spanning
 * 1–10, colored by score intensity. Section labels appear below each bar,
 * truncated to 12 characters with ellipsis.
 *
 * @param energyCurve - Array of energy scores (1–10), one per section.
 * @param sectionNames - Array of section names, same length as energyCurve.
 * @returns HTML string for the bar chart (or empty-state message).
 */
export function renderEnergyChart(energyCurve: number[], sectionNames: string[]): string {
  if (energyCurve.length < 2) {
    return `<div class="energy-empty-state">Run analysis to see energy curve</div>`;
  }

  let barsHtml = "";
  for (let i = 0; i < energyCurve.length; i++) {
    const score = energyCurve[i] ?? 1;
    const name = sectionNames[i] ?? "";
    const heightPercent = (score / 10) * 100;
    const color = scoreToColor(score);
    const truncated = truncateLabel(name);

    barsHtml += `<div class="energy-bar-container">` +
      `<div class="energy-bar" style="height:${heightPercent}%;background-color:${color};" title="${name}: ${score}">` +
      `<span class="energy-bar-score">${score}</span>` +
      `</div>` +
      `<span class="energy-bar-label">${truncated}</span>` +
      `</div>`;
  }

  return `<div class="energy-chart">${barsHtml}</div>`;
}

// ─── Genre Dropdown ────────────────────────────────────────────────────

/**
 * Render the genre dropdown HTML.
 *
 * First option is "Default" (value=""), which sends null to clear genre.
 * Each genre is rendered as an <option> with the genre string as value.
 *
 * @param genres - Array of available genre identifiers.
 * @param selectedGenre - Currently selected genre, or null for default.
 * @returns HTML string for the genre dropdown.
 */
export function renderGenreDropdown(genres: string[], selectedGenre: string | null): string {
  let optionsHtml = `<option value=""${selectedGenre === null ? " selected" : ""}>Default</option>`;
  for (const genre of genres) {
    const isSelected = genre === selectedGenre;
    optionsHtml += `<option value="${genre}"${isSelected ? " selected" : ""}>${genre}</option>`;
  }

  return `<select id="genre-select" class="genre-dropdown" aria-label="Genre selection">${optionsHtml}</select>`;
}