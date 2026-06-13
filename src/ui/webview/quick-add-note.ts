/**
 * Quick-Add Note Component — rendering and validation for the inline
 * quick-add note input in the section list.
 *
 * Exports pure functions that produce HTML strings and validate input text.
 *
 * The component renders:
 * - An inline text input field below a section when visible
 * - A visual error indicator when validation fails
 * - Nothing (empty string) when not visible
 *
 * Interaction flow (handled by webview runtime):
 * 1. User clicks "+" or presses N on focused section → input appears
 * 2. User types → text state updated
 * 3. Enter → validate → if valid, send `add_note` message, dismiss; if invalid, show error
 * 4. Escape → dismiss without adding
 * 5. On dismiss → return focus to previously focused section
 */

// ─── Constants ─────────────────────────────────────────────────────────

/** Maximum character length for quick-add note text. */
export const MAX_QUICK_ADD_LENGTH = 500;

// ─── Types ─────────────────────────────────────────────────────────────

export interface QuickAddState {
  readonly visible: boolean;
  readonly sectionId: string | null;
  readonly text: string;
  readonly error: boolean;
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

// ─── Validation ────────────────────────────────────────────────────────

/**
 * Validate quick-add text: non-empty, non-whitespace-only, ≤500 chars.
 *
 * @param text - The text to validate.
 * @returns true if the text is valid for submission, false otherwise.
 */
export function validateQuickAddText(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  if (text.length > MAX_QUICK_ADD_LENGTH) {
    return false;
  }
  if (text.trim().length === 0) {
    return false;
  }
  return true;
}

// ─── Render ────────────────────────────────────────────────────────────

/**
 * Render the quick-add input inline. Returns empty string when not visible.
 *
 * @param state - The current quick-add state.
 * @returns HTML string for the quick-add input, or empty string if not visible.
 */
export function renderQuickAddInput(state: QuickAddState): string {
  if (!state.visible) {
    return "";
  }

  const errorClass = state.error ? " quick-add-input--error" : "";
  const ariaInvalid = state.error ? `aria-invalid="true"` : "";
  const errorMessage = state.error
    ? `<span class="quick-add-error-message" id="quick-add-error" role="alert">Note must be non-empty and at most ${MAX_QUICK_ADD_LENGTH} characters</span>`
    : "";
  const ariaDescribedBy = state.error ? `aria-describedby="quick-add-error"` : "";
  const sectionIdAttr = state.sectionId !== null
    ? `data-section-id="${escapeHtml(state.sectionId)}"`
    : "";

  return `<div class="quick-add-container" role="form" aria-label="Quick add note">` +
    `<input type="text" ` +
    `class="quick-add-input${errorClass}" ` +
    `id="quick-add-field" ` +
    `placeholder="Add a note\u2026" ` +
    `maxlength="${MAX_QUICK_ADD_LENGTH}" ` +
    `value="${escapeHtml(state.text)}" ` +
    `aria-label="Quick add note text" ` +
    `${ariaInvalid} ` +
    `${ariaDescribedBy} ` +
    `${sectionIdAttr} />` +
    errorMessage +
    `</div>`;
}
