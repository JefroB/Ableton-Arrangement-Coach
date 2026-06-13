/**
 * Toolbar — rendering functions for the webview toolbar actions.
 *
 * Exports pure functions that produce HTML strings for toolbar buttons.
 * These are designed to be testable in isolation (no DOM dependencies).
 */

// ─── Refresh Button ────────────────────────────────────────────────────

/**
 * Render the refresh/rescan toolbar button as an HTML string.
 *
 * When `isAnalyzing` is false, renders an enabled button with a refresh icon
 * and "Refresh" label. When `isAnalyzing` is true, renders a disabled button
 * with a spinner indicator and "Analyzing..." label.
 *
 * @param isAnalyzing - Whether analysis is currently in progress.
 * @returns HTML string for the refresh button.
 */
export function renderRefreshButton(isAnalyzing: boolean): string {
  if (isAnalyzing) {
    return (
      `<button class="refresh-btn refresh-btn--disabled" ` +
      `type="button" ` +
      `disabled ` +
      `aria-label="Analysis in progress" ` +
      `aria-busy="true">` +
      `<span class="refresh-btn-spinner" aria-hidden="true"></span>` +
      `<span class="refresh-btn-label">Analyzing\u2026</span>` +
      `</button>`
    );
  }

  return (
    `<button class="refresh-btn" ` +
    `type="button" ` +
    `aria-label="Refresh analysis">` +
    `<span class="refresh-btn-icon" aria-hidden="true">\u21BB</span>` +
    `<span class="refresh-btn-label">Refresh</span>` +
    `</button>`
  );
}
