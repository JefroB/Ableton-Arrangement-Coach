/**
 * DJ Score Panel — rendering functions for the DJ compatibility score
 * display in the webview.
 *
 * Exports a pure function that produces an HTML string for the DJ score panel,
 * including the total score, component breakdown table, and phrase alignment
 * issues list. Handles null state (no score) and inapplicable genres.
 */

import type { DjScoreResult, DjScoreComponent, PhraseIssue } from "../../core/dj-scorer.js";

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

// ─── Score Color ───────────────────────────────────────────────────────

/**
 * Map a DJ score (0–100) to a color class suffix for visual feedback.
 * High scores are green, medium are yellow, low are red.
 */
function scoreColorClass(score: number): string {
  if (score >= 75) return "dj-score--good";
  if (score >= 50) return "dj-score--fair";
  return "dj-score--poor";
}

// ─── Component Breakdown Table ─────────────────────────────────────────

/**
 * Render the component breakdown table showing each scoring dimension.
 */
function renderComponentTable(components: readonly DjScoreComponent[]): string {
  let rowsHtml = "";
  for (const comp of components) {
    rowsHtml +=
      `<tr class="dj-score-row">` +
      `<td class="dj-score-cell dj-score-cell--name">${escapeHtml(comp.name)}</td>` +
      `<td class="dj-score-cell dj-score-cell--score">${Math.round(comp.score)}</td>` +
      `<td class="dj-score-cell dj-score-cell--weight">${Math.round(comp.weight * 100)}%</td>` +
      `<td class="dj-score-cell dj-score-cell--weighted">${comp.weighted.toFixed(1)}</td>` +
      `</tr>`;
  }

  return (
    `<table class="dj-score-table" aria-label="DJ score component breakdown">` +
    `<thead>` +
    `<tr>` +
    `<th class="dj-score-th">Component</th>` +
    `<th class="dj-score-th">Score</th>` +
    `<th class="dj-score-th">Weight</th>` +
    `<th class="dj-score-th">Contribution</th>` +
    `</tr>` +
    `</thead>` +
    `<tbody>${rowsHtml}</tbody>` +
    `</table>`
  );
}

// ─── Phrase Issues List ────────────────────────────────────────────────

/**
 * Render the phrase alignment issues list.
 * Returns empty string when no issues exist.
 */
function renderPhraseIssues(issues: readonly PhraseIssue[]): string {
  if (issues.length === 0) {
    return "";
  }

  let itemsHtml = "";
  for (const issue of issues) {
    itemsHtml +=
      `<li class="dj-score-issue-item">` +
      `<span class="dj-score-issue-section">${escapeHtml(issue.sectionName)}</span>` +
      `<span class="dj-score-issue-detail">` +
      `starts at bar ${issue.startBar}, nearest boundary: bar ${issue.nearestBoundary}` +
      `</span>` +
      `</li>`;
  }

  return (
    `<div class="dj-score-issues">` +
    `<h4 class="dj-score-issues-heading">Phrase Alignment Issues</h4>` +
    `<ul class="dj-score-issues-list" aria-label="Phrase alignment issues">${itemsHtml}</ul>` +
    `</div>`
  );
}

// ─── Main Panel Render ─────────────────────────────────────────────────

/**
 * Render the DJ compatibility score panel.
 *
 * Handles three states:
 * 1. `result` is null → empty/placeholder state
 * 2. `result.applicable === false` → inapplicable genre message
 * 3. `result.applicable === true` → full score display with breakdown
 *
 * @param result - The DJ score result, or null if not yet computed.
 * @returns HTML string for the DJ score panel.
 */
export function renderDjScorePanel(result: DjScoreResult | null): string {
  // Null state: no score available
  if (result === null) {
    return (
      `<div class="dj-score-panel" role="region" aria-label="DJ compatibility score">` +
      `<div class="dj-score-empty">No DJ score available</div>` +
      `</div>`
    );
  }

  // Inapplicable genre
  if (!result.applicable) {
    const reason = result.inapplicableReason ?? "DJ compatibility scoring is not applicable for this genre.";
    return (
      `<div class="dj-score-panel" role="region" aria-label="DJ compatibility score">` +
      `<div class="dj-score-inapplicable">` +
      `<span class="dj-score-inapplicable-icon" aria-hidden="true">ℹ</span>` +
      `<span class="dj-score-inapplicable-text">${escapeHtml(reason)}</span>` +
      `</div>` +
      `</div>`
    );
  }

  // Full score display
  const colorClass = scoreColorClass(result.totalScore);

  let html =
    `<div class="dj-score-panel" role="region" aria-label="DJ compatibility score">` +
    `<div class="dj-score-header">` +
    `<h3 class="dj-score-title">DJ Compatibility</h3>` +
    `<span class="dj-score-total ${colorClass}" aria-label="Total DJ score: ${result.totalScore} out of 100">` +
    `${result.totalScore}` +
    `</span>` +
    `</div>`;

  html += renderComponentTable(result.components);
  html += renderPhraseIssues(result.phraseIssues);

  html += `</div>`;
  return html;
}
