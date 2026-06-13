/**
 * Notes Panel — rendering functions and interaction logic for the
 * notes and checklist webview component.
 *
 * Exports pure functions that produce HTML strings for the Notes Panel UI,
 * plus helper utilities for relative timestamps, character counting, and
 * optimistic toggle state management.
 *
 * The panel displays:
 * - Section header with active section name
 * - Notes list in reverse chronological order with relative timestamps
 * - Add-note input with character count indicator and submit button
 * - Inline edit/delete with undo for notes
 * - Checklist grouped by source (Issues / Transitions) with toggleable checkboxes
 * - Completion summary
 * - Empty state when no notes and no checklist items
 * - Memory-only mode indicator when persistence is unavailable
 */

import type { Note, SectionChecklistItem } from "../../core/notes-types.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** Maximum character length for note text. */
export const MAX_NOTE_LENGTH = 500;

/** Duration (ms) for delete undo window. */
export const DELETE_UNDO_TIMEOUT_MS = 5000;

/** Duration (ms) for optimistic toggle confirmation timeout. */
export const TOGGLE_CONFIRMATION_TIMEOUT_MS = 3000;

// ─── Relative Timestamp Formatting ─────────────────────────────────────

/**
 * Format a Unix timestamp (ms) as a human-readable relative time string.
 *
 * @param createdAt - Unix timestamp in milliseconds.
 * @param now - Current time in milliseconds (default: Date.now()).
 * @returns A relative time string (e.g., "just now", "2 min ago", "yesterday").
 */
export function formatRelativeTime(createdAt: number, now: number = Date.now()): string {
  const diffMs = now - createdAt;
  if (diffMs < 0) {
    return "just now";
  }

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) {
    return "just now";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin === 1 ? "1 min ago" : `${diffMin} min ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

// ─── HTML Escaping ─────────────────────────────────────────────────────

/**
 * Escape special HTML characters to prevent XSS in rendered content.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Section Header ────────────────────────────────────────────────────

/**
 * Render the section header showing the active section name.
 *
 * @param sectionName - Name of the currently active section, or null if none.
 * @returns HTML string for the section header.
 */
export function renderSectionHeader(sectionName: string | null): string {
  if (sectionName === null) {
    return `<div class="notes-section-header" aria-label="Notes panel - no section selected">` +
      `<span class="notes-section-title">No section selected</span>` +
      `</div>`;
  }
  return `<div class="notes-section-header" aria-label="Notes panel for section: ${escapeHtml(sectionName)}">` +
    `<span class="notes-section-title">${escapeHtml(sectionName)}</span>` +
    `</div>`;
}

// ─── Memory-Only Mode Indicator ────────────────────────────────────────

/**
 * Render the memory-only mode indicator when persistence is unavailable.
 *
 * @param persistenceAvailable - Whether persistence is available.
 * @returns HTML string for the indicator (empty string if persistence is available).
 */
export function renderMemoryModeIndicator(persistenceAvailable: boolean): string {
  if (persistenceAvailable) {
    return "";
  }
  return `<div class="notes-memory-mode" role="alert" aria-live="polite">` +
    `<span class="notes-memory-mode-icon" aria-hidden="true">⚠</span>` +
    `<span class="notes-memory-mode-text">Memory-only mode — data will not be saved across sessions</span>` +
    `</div>`;
}

// ─── Add Note Input ────────────────────────────────────────────────────

/**
 * Render the add-note input with character count indicator and submit button.
 *
 * @param currentText - The current text in the input (for controlled rendering).
 * @param sectionId - The section ID to associate the note with.
 * @returns HTML string for the add-note input area.
 */
export function renderAddNoteInput(currentText: string, sectionId: string): string {
  const remaining = MAX_NOTE_LENGTH - currentText.length;
  const isDisabled = currentText.trim().length === 0;
  const charCountClass = remaining < 50 ? "notes-char-count notes-char-count--warning" : "notes-char-count";

  return `<div class="notes-add-input" role="form" aria-label="Add a new note">` +
    `<textarea class="notes-input-field" ` +
    `id="notes-add-textarea" ` +
    `placeholder="Add a note…" ` +
    `maxlength="${MAX_NOTE_LENGTH}" ` +
    `aria-label="Note text input" ` +
    `aria-describedby="notes-char-count" ` +
    `data-section-id="${escapeHtml(sectionId)}"` +
    `>${escapeHtml(currentText)}</textarea>` +
    `<div class="notes-input-footer">` +
    `<span id="notes-char-count" class="${charCountClass}" aria-live="polite">${remaining}/${MAX_NOTE_LENGTH}</span>` +
    `<button class="notes-submit-btn" ` +
    `type="button" ` +
    `aria-label="Submit note" ` +
    `${isDisabled ? "disabled" : ""}>Add</button>` +
    `</div>` +
    `</div>`;
}

// ─── Note Item ─────────────────────────────────────────────────────────

/**
 * Render a single note item in display mode.
 *
 * @param note - The note to render.
 * @param now - Current timestamp for relative time calculation.
 * @returns HTML string for the note item.
 */
export function renderNoteItem(note: Note, now: number = Date.now()): string {
  const timeStr = formatRelativeTime(note.createdAt, now);

  return `<li class="notes-item" data-note-id="${escapeHtml(note.id)}" role="listitem">` +
    `<div class="notes-item-content">` +
    `<p class="notes-item-text">${escapeHtml(note.text)}</p>` +
    `<span class="notes-item-time" aria-label="Created ${timeStr}">${timeStr}</span>` +
    `</div>` +
    `<div class="notes-item-actions">` +
    `<button class="notes-action-btn notes-edit-btn" type="button" ` +
    `aria-label="Edit note" data-note-id="${escapeHtml(note.id)}">✎</button>` +
    `<button class="notes-action-btn notes-delete-btn" type="button" ` +
    `aria-label="Delete note" data-note-id="${escapeHtml(note.id)}">✕</button>` +
    `</div>` +
    `</li>`;
}

/**
 * Render a note item in inline edit mode.
 *
 * @param note - The note being edited.
 * @param editText - The current edited text.
 * @returns HTML string for the inline edit form.
 */
export function renderNoteEditItem(note: Note, editText: string): string {
  const remaining = MAX_NOTE_LENGTH - editText.length;
  const charCountClass = remaining < 50 ? "notes-char-count notes-char-count--warning" : "notes-char-count";

  return `<li class="notes-item notes-item--editing" data-note-id="${escapeHtml(note.id)}" role="listitem">` +
    `<div class="notes-edit-form" role="form" aria-label="Edit note">` +
    `<textarea class="notes-edit-field" ` +
    `aria-label="Edit note text" ` +
    `maxlength="${MAX_NOTE_LENGTH}" ` +
    `data-note-id="${escapeHtml(note.id)}"` +
    `>${escapeHtml(editText)}</textarea>` +
    `<div class="notes-edit-footer">` +
    `<span class="${charCountClass}">${remaining}/${MAX_NOTE_LENGTH}</span>` +
    `<div class="notes-edit-actions">` +
    `<button class="notes-save-btn" type="button" aria-label="Save edit" ` +
    `data-note-id="${escapeHtml(note.id)}">Save</button>` +
    `<button class="notes-cancel-btn" type="button" aria-label="Cancel edit" ` +
    `data-note-id="${escapeHtml(note.id)}">Cancel</button>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</li>`;
}

/**
 * Render a note item in "pending delete" state with an undo option.
 *
 * @param note - The note pending deletion.
 * @returns HTML string for the undo state.
 */
export function renderNoteDeleteUndo(note: Note): string {
  return `<li class="notes-item notes-item--deleted" data-note-id="${escapeHtml(note.id)}" role="listitem">` +
    `<div class="notes-delete-undo">` +
    `<span class="notes-delete-text">Note deleted</span>` +
    `<button class="notes-undo-btn" type="button" ` +
    `aria-label="Undo delete" data-note-id="${escapeHtml(note.id)}">Undo</button>` +
    `</div>` +
    `</li>`;
}

// ─── Notes List ────────────────────────────────────────────────────────

/**
 * Options for controlling note item rendering state.
 */
export interface NoteRenderState {
  /** Note IDs currently being edited, mapped to their edit text. */
  readonly editingNotes: ReadonlyMap<string, string>;
  /** Note IDs pending deletion (showing undo). */
  readonly pendingDeleteNotes: ReadonlySet<string>;
}

/**
 * Render the full notes list in reverse chronological order.
 *
 * @param notes - All notes for the current section.
 * @param state - Render state tracking edits and pending deletes.
 * @param now - Current timestamp for relative time calculation.
 * @returns HTML string for the notes list.
 */
export function renderNotesList(
  notes: readonly Note[],
  state: NoteRenderState,
  now: number = Date.now()
): string {
  // Sort reverse chronological (newest first)
  const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt);

  let itemsHtml = "";
  for (const note of sorted) {
    if (state.pendingDeleteNotes.has(note.id)) {
      itemsHtml += renderNoteDeleteUndo(note);
    } else if (state.editingNotes.has(note.id)) {
      const editText = state.editingNotes.get(note.id) ?? note.text;
      itemsHtml += renderNoteEditItem(note, editText);
    } else {
      itemsHtml += renderNoteItem(note, now);
    }
  }

  if (sorted.length === 0) {
    return "";
  }

  return `<div class="notes-list-section">` +
    `<h3 class="notes-heading">Notes</h3>` +
    `<ul class="notes-list" role="list" aria-label="Section notes">${itemsHtml}</ul>` +
    `</div>`;
}

// ─── Checklist Section ─────────────────────────────────────────────────

/**
 * Render a single checklist item with checkbox, text, and source badge.
 *
 * @param item - The checklist item to render.
 * @returns HTML string for the checklist item.
 */
export function renderChecklistItem(item: SectionChecklistItem): string {
  const checked = item.completed ? "checked" : "";
  const completedClass = item.completed ? " notes-checklist-item--completed" : "";
  const badgeClass = item.source === "issue" ? "notes-badge--issue" : "notes-badge--transition";
  const badgeLabel = item.source === "issue" ? "Issue" : "Transition";

  return `<li class="notes-checklist-item${completedClass}" data-item-id="${escapeHtml(item.id)}" role="listitem">` +
    `<label class="notes-checklist-label">` +
    `<input type="checkbox" class="notes-checklist-checkbox" ` +
    `${checked} ` +
    `aria-label="Toggle: ${escapeHtml(item.text)}" ` +
    `data-section-id="${escapeHtml(item.sectionId)}" ` +
    `data-item-id="${escapeHtml(item.id)}" />` +
    `<span class="notes-checklist-text">${escapeHtml(item.text)}</span>` +
    `</label>` +
    `<span class="notes-badge ${badgeClass}" aria-label="Source: ${badgeLabel}">${badgeLabel}</span>` +
    `</li>`;
}

/**
 * Render the checklist grouped by source with completion summary.
 *
 * Items are displayed under "Issues" and "Transitions" headings.
 *
 * @param items - All checklist items for the current section.
 * @returns HTML string for the checklist section.
 */
export function renderChecklist(items: readonly SectionChecklistItem[]): string {
  if (items.length === 0) {
    return "";
  }

  const issueItems = items.filter(i => i.source === "issue");
  const transitionItems = items.filter(i => i.source === "transition");
  const completedCount = items.filter(i => i.completed).length;

  let html = `<div class="notes-checklist-section">` +
    `<div class="notes-checklist-header">` +
    `<h3 class="notes-heading">Checklist</h3>` +
    `<span class="notes-completion-summary" aria-label="${completedCount} of ${items.length} completed">` +
    `${completedCount}/${items.length} completed</span>` +
    `</div>`;

  if (issueItems.length > 0) {
    html += `<h4 class="notes-checklist-group-heading">Issues</h4>`;
    html += `<ul class="notes-checklist-list" role="list" aria-label="Issue checklist items">`;
    for (const item of issueItems) {
      html += renderChecklistItem(item);
    }
    html += `</ul>`;
  }

  if (transitionItems.length > 0) {
    html += `<h4 class="notes-checklist-group-heading">Transitions</h4>`;
    html += `<ul class="notes-checklist-list" role="list" aria-label="Transition checklist items">`;
    for (const item of transitionItems) {
      html += renderChecklistItem(item);
    }
    html += `</ul>`;
  }

  html += `</div>`;
  return html;
}

// ─── Empty State ───────────────────────────────────────────────────────

/**
 * Render the empty state message when no notes and no checklist items exist.
 *
 * @returns HTML string for the empty state.
 */
export function renderEmptyState(): string {
  return `<div class="notes-empty-state" role="status" aria-label="No notes or checklist items">` +
    `<p class="notes-empty-text">No notes yet. Add one above!</p>` +
    `<p class="notes-empty-subtext">Checklist items will appear after running analysis.</p>` +
    `</div>`;
}

// ─── Full Panel Render ─────────────────────────────────────────────────

/**
 * Input data for rendering the complete notes panel.
 */
export interface NotesPanelData {
  readonly sectionName: string | null;
  readonly sectionId: string | null;
  readonly notes: readonly Note[];
  readonly checklistItems: readonly SectionChecklistItem[];
  readonly persistenceAvailable: boolean;
  readonly addNoteText: string;
  readonly noteRenderState: NoteRenderState;
  readonly now?: number;
}

/**
 * Render the complete notes panel HTML.
 *
 * @param data - All data needed to render the panel.
 * @returns HTML string for the entire notes panel.
 */
export function renderNotesPanel(data: NotesPanelData): string {
  const {
    sectionName,
    sectionId,
    notes,
    checklistItems,
    persistenceAvailable,
    addNoteText,
    noteRenderState,
    now = Date.now(),
  } = data;

  let html = renderSectionHeader(sectionName);
  html += renderMemoryModeIndicator(persistenceAvailable);

  if (sectionId !== null) {
    html += renderAddNoteInput(addNoteText, sectionId);

    const notesHtml = renderNotesList(notes, noteRenderState, now);
    const checklistHtml = renderChecklist(checklistItems);

    if (notesHtml === "" && checklistHtml === "") {
      html += renderEmptyState();
    } else {
      html += notesHtml;
      html += checklistHtml;
    }
  }

  return `<div class="notes-panel" role="region" aria-label="Notes and checklist panel">${html}</div>`;
}

// ─── Optimistic Toggle State ───────────────────────────────────────────

/**
 * Tracks pending optimistic checkbox toggles awaiting backend confirmation.
 */
export interface PendingToggle {
  readonly sectionId: string;
  readonly itemId: string;
  readonly previousState: boolean;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Create an optimistic toggle tracker.
 *
 * Manages pending toggles with a 3-second confirmation timeout.
 * If the backend does not confirm within the timeout, the toggle is reverted.
 *
 * @param onRevert - Callback invoked when a toggle must be reverted.
 * @returns An object with methods to track and resolve pending toggles.
 */
export function createToggleTracker(onRevert: (sectionId: string, itemId: string) => void) {
  const pending = new Map<string, PendingToggle>();

  function makeKey(sectionId: string, itemId: string): string {
    return `${sectionId}::${itemId}`;
  }

  return {
    /**
     * Register a new optimistic toggle. Starts a timeout that will trigger
     * revert if not confirmed within TOGGLE_CONFIRMATION_TIMEOUT_MS.
     */
    track(sectionId: string, itemId: string, previousState: boolean): void {
      const key = makeKey(sectionId, itemId);

      // Clear any existing pending toggle for same item
      const existing = pending.get(key);
      if (existing !== undefined) {
        clearTimeout(existing.timeoutId);
      }

      const timeoutId = setTimeout(() => {
        pending.delete(key);
        onRevert(sectionId, itemId);
      }, TOGGLE_CONFIRMATION_TIMEOUT_MS);

      pending.set(key, { sectionId, itemId, previousState, timeoutId });
    },

    /**
     * Confirm a pending toggle (backend acknowledged). Clears the timeout.
     */
    confirm(sectionId: string, itemId: string): void {
      const key = makeKey(sectionId, itemId);
      const entry = pending.get(key);
      if (entry !== undefined) {
        clearTimeout(entry.timeoutId);
        pending.delete(key);
      }
    },

    /**
     * Explicitly fail a pending toggle, triggering immediate revert.
     */
    fail(sectionId: string, itemId: string): void {
      const key = makeKey(sectionId, itemId);
      const entry = pending.get(key);
      if (entry !== undefined) {
        clearTimeout(entry.timeoutId);
        pending.delete(key);
        onRevert(sectionId, itemId);
      }
    },

    /**
     * Clear all pending toggles (e.g., on section change).
     */
    clearAll(): void {
      for (const entry of pending.values()) {
        clearTimeout(entry.timeoutId);
      }
      pending.clear();
    },

    /** Get the number of pending toggles. */
    get size(): number {
      return pending.size;
    },
  };
}
