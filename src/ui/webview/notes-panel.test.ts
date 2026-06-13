/**
 * Notes Panel — unit tests for the rendering functions and utilities.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatRelativeTime,
  escapeHtml,
  renderSectionHeader,
  renderMemoryModeIndicator,
  renderAddNoteInput,
  renderNoteItem,
  renderNoteEditItem,
  renderNoteDeleteUndo,
  renderNotesList,
  renderChecklistItem,
  renderChecklist,
  renderEmptyState,
  renderNotesPanel,
  createToggleTracker,
  MAX_NOTE_LENGTH,
  TOGGLE_CONFIRMATION_TIMEOUT_MS,
} from "./notes-panel.js";
import type { Note, SectionChecklistItem } from "../../core/notes-types.js";

// ─── formatRelativeTime ────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  const now = 1700000000000; // fixed reference time

  it("returns 'just now' for timestamps within 60 seconds", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
    expect(formatRelativeTime(now - 59_000, now)).toBe("just now");
    expect(formatRelativeTime(now, now)).toBe("just now");
  });

  it("returns 'just now' for future timestamps", () => {
    expect(formatRelativeTime(now + 5000, now)).toBe("just now");
  });

  it("returns minutes for 1–59 minutes", () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe("1 min ago");
    expect(formatRelativeTime(now - 120_000, now)).toBe("2 min ago");
    expect(formatRelativeTime(now - 59 * 60_000, now)).toBe("59 min ago");
  });

  it("returns hours for 1–23 hours", () => {
    expect(formatRelativeTime(now - 3600_000, now)).toBe("1 hour ago");
    expect(formatRelativeTime(now - 5 * 3600_000, now)).toBe("5 hours ago");
  });

  it("returns 'yesterday' for 24–47 hours", () => {
    expect(formatRelativeTime(now - 24 * 3600_000, now)).toBe("yesterday");
  });

  it("returns days for 2–6 days", () => {
    expect(formatRelativeTime(now - 3 * 24 * 3600_000, now)).toBe("3 days ago");
  });

  it("returns weeks for 1–3 weeks", () => {
    expect(formatRelativeTime(now - 7 * 24 * 3600_000, now)).toBe("1 week ago");
    expect(formatRelativeTime(now - 14 * 24 * 3600_000, now)).toBe("2 weeks ago");
  });

  it("returns months for 1–11 months", () => {
    expect(formatRelativeTime(now - 35 * 24 * 3600_000, now)).toBe("1 month ago");
    expect(formatRelativeTime(now - 180 * 24 * 3600_000, now)).toBe("6 months ago");
  });

  it("returns years for 1+ years", () => {
    expect(formatRelativeTime(now - 400 * 24 * 3600_000, now)).toBe("1 year ago");
    expect(formatRelativeTime(now - 800 * 24 * 3600_000, now)).toBe("2 years ago");
  });
});

// ─── escapeHtml ────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes special HTML characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands and quotes", () => {
    expect(escapeHtml('Tom & "Jerry"')).toBe("Tom &amp; &quot;Jerry&quot;");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

// ─── renderSectionHeader ───────────────────────────────────────────────

describe("renderSectionHeader", () => {
  it("renders active section name", () => {
    const html = renderSectionHeader("Intro");
    expect(html).toContain("Intro");
    expect(html).toContain('aria-label="Notes panel for section: Intro"');
  });

  it("renders 'No section selected' when null", () => {
    const html = renderSectionHeader(null);
    expect(html).toContain("No section selected");
    expect(html).toContain('aria-label="Notes panel - no section selected"');
  });

  it("escapes section names with special characters", () => {
    const html = renderSectionHeader('<Drop "A">');
    expect(html).toContain("&lt;Drop &quot;A&quot;&gt;");
    expect(html).not.toContain("<Drop");
  });
});

// ─── renderMemoryModeIndicator ─────────────────────────────────────────

describe("renderMemoryModeIndicator", () => {
  it("returns empty string when persistence is available", () => {
    expect(renderMemoryModeIndicator(true)).toBe("");
  });

  it("renders indicator when persistence is unavailable", () => {
    const html = renderMemoryModeIndicator(false);
    expect(html).toContain("Memory-only mode");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="polite"');
  });
});

// ─── renderAddNoteInput ────────────────────────────────────────────────

describe("renderAddNoteInput", () => {
  it("renders input with correct remaining char count", () => {
    const html = renderAddNoteInput("hello", "section-1");
    expect(html).toContain("495/500");
    expect(html).toContain('aria-label="Note text input"');
    expect(html).toContain('aria-label="Submit note"');
  });

  it("disables submit when text is empty", () => {
    const html = renderAddNoteInput("", "section-1");
    expect(html).toContain("disabled");
  });

  it("disables submit when text is whitespace-only", () => {
    const html = renderAddNoteInput("   ", "section-1");
    expect(html).toContain("disabled");
  });

  it("enables submit when text has content", () => {
    const html = renderAddNoteInput("valid note", "section-1");
    expect(html).not.toMatch(/disabled/);
  });

  it("shows warning class when near limit", () => {
    const longText = "a".repeat(460);
    const html = renderAddNoteInput(longText, "section-1");
    expect(html).toContain("notes-char-count--warning");
  });
});

// ─── renderNoteItem ────────────────────────────────────────────────────

describe("renderNoteItem", () => {
  const note: Note = {
    id: "note-1",
    sectionId: "section-0",
    text: "Great energy buildup here",
    createdAt: 1700000000000 - 120_000, // 2 min ago
  };

  it("renders note text and relative timestamp", () => {
    const html = renderNoteItem(note, 1700000000000);
    expect(html).toContain("Great energy buildup here");
    expect(html).toContain("2 min ago");
  });

  it("includes edit and delete buttons with aria labels", () => {
    const html = renderNoteItem(note, 1700000000000);
    expect(html).toContain('aria-label="Edit note"');
    expect(html).toContain('aria-label="Delete note"');
  });

  it("includes data-note-id attributes", () => {
    const html = renderNoteItem(note, 1700000000000);
    expect(html).toContain('data-note-id="note-1"');
  });
});

// ─── renderNoteEditItem ────────────────────────────────────────────────

describe("renderNoteEditItem", () => {
  const note: Note = {
    id: "note-1",
    sectionId: "section-0",
    text: "Original text",
    createdAt: 1700000000000,
  };

  it("renders edit form with current edit text", () => {
    const html = renderNoteEditItem(note, "Edited text");
    expect(html).toContain("Edited text");
    expect(html).toContain('aria-label="Edit note text"');
    expect(html).toContain('aria-label="Save edit"');
    expect(html).toContain('aria-label="Cancel edit"');
  });

  it("shows remaining character count", () => {
    const html = renderNoteEditItem(note, "hello");
    expect(html).toContain("495/500");
  });
});

// ─── renderNoteDeleteUndo ──────────────────────────────────────────────

describe("renderNoteDeleteUndo", () => {
  const note: Note = {
    id: "note-2",
    sectionId: "section-0",
    text: "Some note",
    createdAt: 1700000000000,
  };

  it("renders undo state", () => {
    const html = renderNoteDeleteUndo(note);
    expect(html).toContain("Note deleted");
    expect(html).toContain('aria-label="Undo delete"');
    expect(html).toContain("notes-item--deleted");
  });
});

// ─── renderNotesList ───────────────────────────────────────────────────

describe("renderNotesList", () => {
  const notes: Note[] = [
    { id: "n1", sectionId: "s1", text: "First", createdAt: 1700000000000 },
    { id: "n2", sectionId: "s1", text: "Second", createdAt: 1700000001000 },
    { id: "n3", sectionId: "s1", text: "Third", createdAt: 1700000002000 },
  ];

  it("returns empty string when no notes", () => {
    const result = renderNotesList([], { editingNotes: new Map(), pendingDeleteNotes: new Set() });
    expect(result).toBe("");
  });

  it("renders notes in reverse chronological order", () => {
    const html = renderNotesList(notes, {
      editingNotes: new Map(),
      pendingDeleteNotes: new Set(),
    }, 1700000010000);
    const thirdIdx = html.indexOf("Third");
    const secondIdx = html.indexOf("Second");
    const firstIdx = html.indexOf("First");
    expect(thirdIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  it("renders notes in edit mode", () => {
    const html = renderNotesList(notes, {
      editingNotes: new Map([["n2", "Editing second"]]),
      pendingDeleteNotes: new Set(),
    }, 1700000010000);
    expect(html).toContain("Editing second");
    expect(html).toContain("notes-item--editing");
  });

  it("renders notes in pending delete mode", () => {
    const html = renderNotesList(notes, {
      editingNotes: new Map(),
      pendingDeleteNotes: new Set(["n1"]),
    }, 1700000010000);
    expect(html).toContain("Note deleted");
    expect(html).toContain("Undo");
  });
});

// ─── renderChecklistItem ───────────────────────────────────────────────

describe("renderChecklistItem", () => {
  it("renders unchecked item with issue badge", () => {
    const item: SectionChecklistItem = {
      id: "issue-1",
      sectionId: "section-0",
      text: "Fix energy drop",
      source: "issue",
      completed: false,
    };
    const html = renderChecklistItem(item);
    expect(html).toContain("Fix energy drop");
    expect(html).toContain("Issue");
    expect(html).toContain("notes-badge--issue");
    expect(html).not.toContain("checked");
    expect(html).toContain('aria-label="Toggle: Fix energy drop"');
  });

  it("renders checked item with transition badge", () => {
    const item: SectionChecklistItem = {
      id: "transition-1-a",
      sectionId: "section-1",
      text: "Add riser",
      source: "transition",
      completed: true,
    };
    const html = renderChecklistItem(item);
    expect(html).toContain("Add riser");
    expect(html).toContain("Transition");
    expect(html).toContain("notes-badge--transition");
    expect(html).toContain("checked");
    expect(html).toContain("notes-checklist-item--completed");
  });
});

// ─── renderChecklist ───────────────────────────────────────────────────

describe("renderChecklist", () => {
  it("returns empty string when no items", () => {
    expect(renderChecklist([])).toBe("");
  });

  it("renders grouped items with completion summary", () => {
    const items: SectionChecklistItem[] = [
      { id: "i1", sectionId: "s0", text: "Issue 1", source: "issue", completed: true },
      { id: "i2", sectionId: "s0", text: "Issue 2", source: "issue", completed: false },
      { id: "t1", sectionId: "s0", text: "Trans 1", source: "transition", completed: true },
    ];
    const html = renderChecklist(items);
    expect(html).toContain("2/3 completed");
    expect(html).toContain("Issues");
    expect(html).toContain("Transitions");
    expect(html).toContain("Issue 1");
    expect(html).toContain("Trans 1");
  });

  it("omits group heading when no items for that source", () => {
    const items: SectionChecklistItem[] = [
      { id: "t1", sectionId: "s0", text: "Only trans", source: "transition", completed: false },
    ];
    const html = renderChecklist(items);
    expect(html).not.toContain(">Issues</h4>");
    expect(html).toContain("Transitions");
  });
});

// ─── renderEmptyState ──────────────────────────────────────────────────

describe("renderEmptyState", () => {
  it("renders empty state message", () => {
    const html = renderEmptyState();
    expect(html).toContain("No notes yet");
    expect(html).toContain("Checklist items will appear after running analysis");
    expect(html).toContain('role="status"');
  });
});

// ─── renderNotesPanel ──────────────────────────────────────────────────

describe("renderNotesPanel", () => {
  it("renders empty state when no notes and no checklist", () => {
    const html = renderNotesPanel({
      sectionName: "Intro",
      sectionId: "section-0",
      notes: [],
      checklistItems: [],
      persistenceAvailable: true,
      addNoteText: "",
      noteRenderState: { editingNotes: new Map(), pendingDeleteNotes: new Set() },
    });
    expect(html).toContain("No notes yet");
    expect(html).toContain("Intro");
  });

  it("renders memory mode indicator when persistence unavailable", () => {
    const html = renderNotesPanel({
      sectionName: "Intro",
      sectionId: "section-0",
      notes: [],
      checklistItems: [],
      persistenceAvailable: false,
      addNoteText: "",
      noteRenderState: { editingNotes: new Map(), pendingDeleteNotes: new Set() },
    });
    expect(html).toContain("Memory-only mode");
  });

  it("does not render input when sectionId is null", () => {
    const html = renderNotesPanel({
      sectionName: null,
      sectionId: null,
      notes: [],
      checklistItems: [],
      persistenceAvailable: true,
      addNoteText: "",
      noteRenderState: { editingNotes: new Map(), pendingDeleteNotes: new Set() },
    });
    expect(html).not.toContain("notes-add-input");
    expect(html).toContain("No section selected");
  });

  it("renders notes and checklist when both exist", () => {
    const notes: Note[] = [
      { id: "n1", sectionId: "s0", text: "My note", createdAt: 1700000000000 },
    ];
    const checklist: SectionChecklistItem[] = [
      { id: "i1", sectionId: "s0", text: "Fix it", source: "issue", completed: false },
    ];
    const html = renderNotesPanel({
      sectionName: "Drop",
      sectionId: "s0",
      notes,
      checklistItems: checklist,
      persistenceAvailable: true,
      addNoteText: "",
      noteRenderState: { editingNotes: new Map(), pendingDeleteNotes: new Set() },
      now: 1700000010000,
    });
    expect(html).toContain("My note");
    expect(html).toContain("Fix it");
    expect(html).not.toContain("No notes yet");
  });
});

// ─── createToggleTracker ───────────────────────────────────────────────

describe("createToggleTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onRevert after timeout", () => {
    const onRevert = vi.fn();
    const tracker = createToggleTracker(onRevert);
    tracker.track("s1", "item1", false);

    expect(onRevert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TOGGLE_CONFIRMATION_TIMEOUT_MS);
    expect(onRevert).toHaveBeenCalledWith("s1", "item1");
  });

  it("does not call onRevert if confirmed before timeout", () => {
    const onRevert = vi.fn();
    const tracker = createToggleTracker(onRevert);
    tracker.track("s1", "item1", false);
    tracker.confirm("s1", "item1");

    vi.advanceTimersByTime(TOGGLE_CONFIRMATION_TIMEOUT_MS + 1000);
    expect(onRevert).not.toHaveBeenCalled();
  });

  it("calls onRevert immediately on explicit fail", () => {
    const onRevert = vi.fn();
    const tracker = createToggleTracker(onRevert);
    tracker.track("s1", "item1", true);
    tracker.fail("s1", "item1");

    expect(onRevert).toHaveBeenCalledWith("s1", "item1");
  });

  it("clearAll cancels all pending timeouts", () => {
    const onRevert = vi.fn();
    const tracker = createToggleTracker(onRevert);
    tracker.track("s1", "item1", false);
    tracker.track("s1", "item2", true);
    tracker.clearAll();

    vi.advanceTimersByTime(TOGGLE_CONFIRMATION_TIMEOUT_MS + 1000);
    expect(onRevert).not.toHaveBeenCalled();
    expect(tracker.size).toBe(0);
  });

  it("replaces existing pending toggle for same item", () => {
    const onRevert = vi.fn();
    const tracker = createToggleTracker(onRevert);
    tracker.track("s1", "item1", false);
    tracker.track("s1", "item1", true); // replace

    vi.advanceTimersByTime(TOGGLE_CONFIRMATION_TIMEOUT_MS);
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledWith("s1", "item1");
  });
});
