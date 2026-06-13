import { describe, it, expect, vi } from "vitest";
import {
  isValidFrontendMessage,
  handleFrontendMessage,
  type FrontendMessageHandlers,
  type BackendMessage,
  type FrontendMessage,
} from "./messages.js";

describe("isValidFrontendMessage", () => {
  it("returns true for a valid request_state message", () => {
    expect(isValidFrontendMessage({ type: "request_state" })).toBe(true);
  });

  it("returns true for a valid select_genre message", () => {
    expect(isValidFrontendMessage({ type: "select_genre", genreId: "techno" })).toBe(true);
  });

  it("returns true for a select_genre message with null genre", () => {
    expect(isValidFrontendMessage({ type: "select_genre", genreId: null })).toBe(true);
  });

  it("returns true for a valid request_analysis message", () => {
    expect(isValidFrontendMessage({ type: "request_analysis" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidFrontendMessage(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidFrontendMessage(undefined)).toBe(false);
  });

  it("returns false for a non-object", () => {
    expect(isValidFrontendMessage("request_state")).toBe(false);
    expect(isValidFrontendMessage(42)).toBe(false);
  });

  it("returns false for an object without a type field", () => {
    expect(isValidFrontendMessage({})).toBe(false);
    expect(isValidFrontendMessage({ name: "test" })).toBe(false);
  });

  it("returns false for an object with non-string type", () => {
    expect(isValidFrontendMessage({ type: 123 })).toBe(false);
  });

  it("returns false for an unrecognized type value", () => {
    expect(isValidFrontendMessage({ type: "unknown_action" })).toBe(false);
    expect(isValidFrontendMessage({ type: "sections_updated" })).toBe(false);
  });
});

describe("handleFrontendMessage", () => {
  it("calls the matching handler for request_state", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { request_state: handler };

    handleFrontendMessage({ type: "request_state" }, handlers);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "request_state" });
  });

  it("silently ignores an unrecognized message type", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { request_state: handler };

    handleFrontendMessage({ type: "unknown_type" }, handlers);

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not throw for null input", () => {
    const handlers: FrontendMessageHandlers = {};
    expect(() => handleFrontendMessage(null, handlers)).not.toThrow();
  });

  it("does not throw for undefined input", () => {
    const handlers: FrontendMessageHandlers = {};
    expect(() => handleFrontendMessage(undefined, handlers)).not.toThrow();
  });

  it("does not throw for non-object input", () => {
    const handlers: FrontendMessageHandlers = {};
    expect(() => handleFrontendMessage(42, handlers)).not.toThrow();
    expect(() => handleFrontendMessage("hello", handlers)).not.toThrow();
  });

  it("does not throw when handler map has no matching handler", () => {
    const handlers: FrontendMessageHandlers = {};
    expect(() =>
      handleFrontendMessage({ type: "request_state" }, handlers)
    ).not.toThrow();
  });

  it("does not throw for malformed objects", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { request_state: handler };

    expect(() => handleFrontendMessage({}, handlers)).not.toThrow();
    expect(() => handleFrontendMessage([], handlers)).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the matching handler for select_genre", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { select_genre: handler };

    handleFrontendMessage({ type: "select_genre", genreId: "techno" }, handlers);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "select_genre", genreId: "techno" });
  });

  it("calls the matching handler for request_analysis", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { request_analysis: handler };

    handleFrontendMessage({ type: "request_analysis" }, handlers);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "request_analysis" });
  });
});

describe("type contracts", () => {
  it("BackendMessage sections_updated has correct shape", () => {
    const msg: BackendMessage = {
      type: "sections_updated",
      sections: [
        { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
      ],
    };
    expect(msg.type).toBe("sections_updated");
    expect(msg.sections).toHaveLength(1);
  });

  it("BackendMessage active_section_changed has correct shape", () => {
    const msg: BackendMessage = {
      type: "active_section_changed",
      activeSectionId: "section-0",
    };
    expect(msg.type).toBe("active_section_changed");
    expect(msg.activeSectionId).toBe("section-0");
  });

  it("BackendMessage active_section_changed allows null", () => {
    const msg: BackendMessage = {
      type: "active_section_changed",
      activeSectionId: null,
    };
    expect(msg.activeSectionId).toBeNull();
  });

  it("FrontendMessage request_state has correct shape", () => {
    const msg: FrontendMessage = { type: "request_state" };
    expect(msg.type).toBe("request_state");
  });

  it("BackendMessage analysis_updated has correct shape", () => {
    const msg: BackendMessage = {
      type: "analysis_updated",
      sectionAnalysis: {
        "section-0": { activeTrackCount: 3, midiDensity: 4.5, hasAutomation: true, energyScore: 7 },
      },
      energyCurve: [7, 5, 8],
    };
    expect(msg.type).toBe("analysis_updated");
    if (msg.type === "analysis_updated") {
      expect(msg.sectionAnalysis["section-0"]!.energyScore).toBe(7);
      expect(msg.energyCurve).toEqual([7, 5, 8]);
    }
  });

  it("BackendMessage genre_changed has correct shape", () => {
    const msg: BackendMessage = { type: "genre_changed", genreId: "techno", genreName: "Techno" };
    expect(msg.type).toBe("genre_changed");
    expect(msg.genreId).toBe("techno");
    expect(msg.genreName).toBe("Techno");
  });

  it("BackendMessage genre_changed allows null", () => {
    const msg: BackendMessage = { type: "genre_changed", genreId: null, genreName: null };
    expect(msg.genreId).toBeNull();
    expect(msg.genreName).toBeNull();
  });

  it("FrontendMessage select_genre has correct shape", () => {
    const msg: FrontendMessage = { type: "select_genre", genreId: "house" };
    expect(msg.type).toBe("select_genre");
    expect(msg.genreId).toBe("house");
  });

  it("FrontendMessage select_genre allows null", () => {
    const msg: FrontendMessage = { type: "select_genre", genreId: null };
    expect(msg.type).toBe("select_genre");
    expect(msg.genreId).toBeNull();
  });

  it("FrontendMessage request_analysis has correct shape", () => {
    const msg: FrontendMessage = { type: "request_analysis" };
    expect(msg.type).toBe("request_analysis");
  });
});

describe("isValidFrontendMessage — toggle_checklist_item", () => {
  it("returns true for a valid toggle_checklist_item message", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_checklist_item",
        boundaryId: "sec1-sec2",
        itemId: "item-1",
      })
    ).toBe(true);
  });

  it("returns false when boundaryId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "toggle_checklist_item", itemId: "item-1" })
    ).toBe(false);
  });

  it("returns false when itemId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "toggle_checklist_item", boundaryId: "sec1-sec2" })
    ).toBe(false);
  });

  it("returns false when boundaryId is wrong type", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_checklist_item",
        boundaryId: 123,
        itemId: "item-1",
      })
    ).toBe(false);
  });

  it("returns false when itemId is wrong type", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_checklist_item",
        boundaryId: "sec1-sec2",
        itemId: null,
      })
    ).toBe(false);
  });

  it("returns false when itemId is a number", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_checklist_item",
        boundaryId: "a",
        itemId: 5,
      })
    ).toBe(false);
  });

  it("returns false when both fields are missing", () => {
    expect(
      isValidFrontendMessage({ type: "toggle_checklist_item" })
    ).toBe(false);
  });
});

describe("handleFrontendMessage — toggle_checklist_item", () => {
  it("routes toggle_checklist_item to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { toggle_checklist_item: handler };

    handleFrontendMessage(
      { type: "toggle_checklist_item", boundaryId: "sec1-sec2", itemId: "item-1" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "toggle_checklist_item",
      boundaryId: "sec1-sec2",
      itemId: "item-1",
    });
  });

  it("does not route malformed toggle_checklist_item to handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { toggle_checklist_item: handler };

    handleFrontendMessage(
      { type: "toggle_checklist_item", boundaryId: 123, itemId: "item-1" },
      handlers
    );

    expect(handler).not.toHaveBeenCalled();
  });
});

// Feature: m2-section-analysis, Property 12: Unknown frontend message resilience
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";

const KNOWN_FRONTEND_TYPES = ["request_state", "select_genre", "search_genres", "request_genre_families", "request_analysis", "select_section"];

const unknownMessageArb = fc.oneof(
  // Object with an unknown type string
  fc.record({
    type: fc.string({ minLength: 1, maxLength: 50 }).filter(
      s => !KNOWN_FRONTEND_TYPES.includes(s)
    ),
  }),
  // Object without a type field at all
  fc.record({ data: fc.string() }),
  // Not an object (null, number, string, boolean, undefined, array)
  fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.integer(),
    fc.string(),
    fc.boolean(),
    fc.array(fc.anything()),
  ),
);

describe("Property 12: Unknown frontend message resilience", () => {
  // **Validates: Requirements 13.5**
  fcTest.prop(
    [unknownMessageArb],
    { numRuns: 100 },
  )(
    "handleFrontendMessage does not throw and invokes no handler for unrecognized messages",
    (msg) => {
      const requestStateHandler = vi.fn();
      const selectGenreHandler = vi.fn();
      const requestAnalysisHandler = vi.fn();

      const handlers: FrontendMessageHandlers = {
        request_state: requestStateHandler,
        select_genre: selectGenreHandler,
        request_analysis: requestAnalysisHandler,
      };

      // Should not throw
      expect(() => handleFrontendMessage(msg, handlers)).not.toThrow();

      // No handler should have been called
      expect(requestStateHandler).not.toHaveBeenCalled();
      expect(selectGenreHandler).not.toHaveBeenCalled();
      expect(requestAnalysisHandler).not.toHaveBeenCalled();
    },
  );

  fcTest.prop(
    [unknownMessageArb],
    { numRuns: 100 },
  )(
    "isValidFrontendMessage returns false for unrecognized messages",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(false);
    },
  );
});

// ─── Tests for new notes/checklist message types (Task 6.1) ────────────

describe("isValidFrontendMessage — add_note", () => {
  it("returns true for a valid add_note message", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1", text: "My note" })
    ).toBe(true);
  });

  it("returns true for add_note with text at exactly 1 character", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1", text: "A" })
    ).toBe(true);
  });

  it("returns true for add_note with text at exactly 500 characters", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1", text: "x".repeat(500) })
    ).toBe(true);
  });

  it("returns false for add_note with empty text", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1", text: "" })
    ).toBe(false);
  });

  it("returns false for add_note with text exceeding 500 characters", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1", text: "x".repeat(501) })
    ).toBe(false);
  });

  it("returns false when sectionId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", text: "Hello" })
    ).toBe(false);
  });

  it("returns false when text is missing", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1" })
    ).toBe(false);
  });

  it("returns false when sectionId is not a string", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: 123, text: "Hello" })
    ).toBe(false);
  });

  it("returns false when text is not a string", () => {
    expect(
      isValidFrontendMessage({ type: "add_note", sectionId: "sec-1", text: 42 })
    ).toBe(false);
  });
});

describe("isValidFrontendMessage — edit_note", () => {
  it("returns true for a valid edit_note message", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1", text: "Updated" })
    ).toBe(true);
  });

  it("returns true for edit_note with text at exactly 1 character", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1", text: "B" })
    ).toBe(true);
  });

  it("returns true for edit_note with text at exactly 500 characters", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1", text: "y".repeat(500) })
    ).toBe(true);
  });

  it("returns false for edit_note with empty text", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1", text: "" })
    ).toBe(false);
  });

  it("returns false for edit_note with text exceeding 500 characters", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1", text: "y".repeat(501) })
    ).toBe(false);
  });

  it("returns false when noteId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", text: "Hello" })
    ).toBe(false);
  });

  it("returns false when text is missing", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1" })
    ).toBe(false);
  });

  it("returns false when noteId is not a string", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: 123, text: "Hello" })
    ).toBe(false);
  });

  it("returns false when text is not a string", () => {
    expect(
      isValidFrontendMessage({ type: "edit_note", noteId: "note-1", text: null })
    ).toBe(false);
  });
});

describe("isValidFrontendMessage — delete_note", () => {
  it("returns true for a valid delete_note message", () => {
    expect(
      isValidFrontendMessage({ type: "delete_note", noteId: "note-1" })
    ).toBe(true);
  });

  it("returns false when noteId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "delete_note" })
    ).toBe(false);
  });

  it("returns false when noteId is not a string", () => {
    expect(
      isValidFrontendMessage({ type: "delete_note", noteId: 42 })
    ).toBe(false);
  });

  it("returns false when noteId is null", () => {
    expect(
      isValidFrontendMessage({ type: "delete_note", noteId: null })
    ).toBe(false);
  });
});

describe("isValidFrontendMessage — toggle_section_checklist_item", () => {
  it("returns true for a valid toggle_section_checklist_item message", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_section_checklist_item",
        sectionId: "sec-1",
        itemId: "item-1",
      })
    ).toBe(true);
  });

  it("returns false when sectionId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "toggle_section_checklist_item", itemId: "item-1" })
    ).toBe(false);
  });

  it("returns false when itemId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "toggle_section_checklist_item", sectionId: "sec-1" })
    ).toBe(false);
  });

  it("returns false when sectionId is not a string", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_section_checklist_item",
        sectionId: 123,
        itemId: "item-1",
      })
    ).toBe(false);
  });

  it("returns false when itemId is not a string", () => {
    expect(
      isValidFrontendMessage({
        type: "toggle_section_checklist_item",
        sectionId: "sec-1",
        itemId: null,
      })
    ).toBe(false);
  });

  it("returns false when both fields are missing", () => {
    expect(
      isValidFrontendMessage({ type: "toggle_section_checklist_item" })
    ).toBe(false);
  });
});

describe("type contracts — notes/checklist messages", () => {
  it("BackendMessage notes_updated has correct shape", () => {
    const msg: BackendMessage = {
      type: "notes_updated",
      notes: [{ id: "n1", sectionId: "sec-1", text: "Hello", createdAt: 1700000000000 }],
      sectionChecklists: {
        "sec-1": [{ id: "c1", sectionId: "sec-1", text: "Fix issue", source: "issue", completed: false }],
      },
    };
    expect(msg.type).toBe("notes_updated");
    if (msg.type === "notes_updated") {
      expect(msg.notes).toHaveLength(1);
      expect(msg.sectionChecklists["sec-1"]).toHaveLength(1);
    }
  });

  it("BackendMessage persistence_status has correct shape", () => {
    const msg: BackendMessage = {
      type: "persistence_status",
      available: true,
      projectKey: "my-project",
    };
    expect(msg.type).toBe("persistence_status");
    if (msg.type === "persistence_status") {
      expect(msg.available).toBe(true);
      expect(msg.projectKey).toBe("my-project");
    }
  });

  it("BackendMessage persistence_status allows null projectKey", () => {
    const msg: BackendMessage = {
      type: "persistence_status",
      available: false,
      projectKey: null,
    };
    if (msg.type === "persistence_status") {
      expect(msg.projectKey).toBeNull();
    }
  });

  it("FrontendMessage add_note has correct shape", () => {
    const msg: FrontendMessage = { type: "add_note", sectionId: "sec-1", text: "My note" };
    expect(msg.type).toBe("add_note");
  });

  it("FrontendMessage edit_note has correct shape", () => {
    const msg: FrontendMessage = { type: "edit_note", noteId: "note-1", text: "Updated" };
    expect(msg.type).toBe("edit_note");
  });

  it("FrontendMessage delete_note has correct shape", () => {
    const msg: FrontendMessage = { type: "delete_note", noteId: "note-1" };
    expect(msg.type).toBe("delete_note");
  });

  it("FrontendMessage toggle_section_checklist_item has correct shape", () => {
    const msg: FrontendMessage = {
      type: "toggle_section_checklist_item",
      sectionId: "sec-1",
      itemId: "item-1",
    };
    expect(msg.type).toBe("toggle_section_checklist_item");
  });
});

describe("handleFrontendMessage — new notes/checklist types", () => {
  it("routes add_note to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { add_note: handler };

    handleFrontendMessage(
      { type: "add_note", sectionId: "sec-1", text: "Note text" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "add_note", sectionId: "sec-1", text: "Note text" });
  });

  it("routes edit_note to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { edit_note: handler };

    handleFrontendMessage(
      { type: "edit_note", noteId: "note-1", text: "Edited" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "edit_note", noteId: "note-1", text: "Edited" });
  });

  it("routes delete_note to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { delete_note: handler };

    handleFrontendMessage(
      { type: "delete_note", noteId: "note-1" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "delete_note", noteId: "note-1" });
  });

  it("routes toggle_section_checklist_item to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { toggle_section_checklist_item: handler };

    handleFrontendMessage(
      { type: "toggle_section_checklist_item", sectionId: "sec-1", itemId: "item-1" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "toggle_section_checklist_item",
      sectionId: "sec-1",
      itemId: "item-1",
    });
  });

  it("does not route malformed add_note (empty text) to handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { add_note: handler };

    handleFrontendMessage(
      { type: "add_note", sectionId: "sec-1", text: "" },
      handlers
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not route malformed toggle_section_checklist_item (missing itemId) to handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { toggle_section_checklist_item: handler };

    handleFrontendMessage(
      { type: "toggle_section_checklist_item", sectionId: "sec-1" },
      handlers
    );

    expect(handler).not.toHaveBeenCalled();
  });
});


// ─── Tests for new genre infrastructure message types (Task 9.2) ───────

describe("isValidFrontendMessage — search_genres", () => {
  it("returns true for a valid search_genres message", () => {
    expect(
      isValidFrontendMessage({ type: "search_genres", query: "techno" })
    ).toBe(true);
  });

  it("returns true for search_genres with empty query string", () => {
    expect(
      isValidFrontendMessage({ type: "search_genres", query: "" })
    ).toBe(true);
  });

  it("returns false when query is missing", () => {
    expect(
      isValidFrontendMessage({ type: "search_genres" })
    ).toBe(false);
  });

  it("returns false when query is not a string", () => {
    expect(
      isValidFrontendMessage({ type: "search_genres", query: 123 })
    ).toBe(false);
  });

  it("returns false when query is null", () => {
    expect(
      isValidFrontendMessage({ type: "search_genres", query: null })
    ).toBe(false);
  });
});

describe("isValidFrontendMessage — request_genre_families", () => {
  it("returns true for a valid request_genre_families message", () => {
    expect(
      isValidFrontendMessage({ type: "request_genre_families" })
    ).toBe(true);
  });
});

describe("isValidFrontendMessage — select_genre field validation", () => {
  it("returns false when genreId is a number", () => {
    expect(
      isValidFrontendMessage({ type: "select_genre", genreId: 42 })
    ).toBe(false);
  });

  it("returns false when genreId is missing", () => {
    expect(
      isValidFrontendMessage({ type: "select_genre" })
    ).toBe(false);
  });
});

describe("type contracts — genre infrastructure messages", () => {
  it("BackendMessage alignment_updated has correct shape", () => {
    const msg: BackendMessage = {
      type: "alignment_updated",
      alignment: { overall: 75, ordering: 80, length: 70, count: 75 },
    };
    expect(msg.type).toBe("alignment_updated");
    if (msg.type === "alignment_updated") {
      expect(msg.alignment!.overall).toBe(75);
      expect(msg.alignment!.ordering).toBe(80);
    }
  });

  it("BackendMessage alignment_updated allows null alignment", () => {
    const msg: BackendMessage = { type: "alignment_updated", alignment: null };
    if (msg.type === "alignment_updated") {
      expect(msg.alignment).toBeNull();
    }
  });

  it("BackendMessage archetype_updated has correct shape", () => {
    const msg: BackendMessage = {
      type: "archetype_updated",
      archetype: { archetype: "build-drop", confidence: 82, lowConfidence: false },
    };
    expect(msg.type).toBe("archetype_updated");
    if (msg.type === "archetype_updated") {
      expect(msg.archetype!.archetype).toBe("build-drop");
      expect(msg.archetype!.confidence).toBe(82);
      expect(msg.archetype!.lowConfidence).toBe(false);
    }
  });

  it("BackendMessage archetype_updated allows null archetype", () => {
    const msg: BackendMessage = { type: "archetype_updated", archetype: null };
    if (msg.type === "archetype_updated") {
      expect(msg.archetype).toBeNull();
    }
  });

  it("BackendMessage genre_families has correct shape", () => {
    const msg: BackendMessage = {
      type: "genre_families",
      families: [
        { id: "techno", name: "Techno", subgenreCount: 2 },
        { id: "house", name: "House", subgenreCount: 3 },
      ],
    };
    expect(msg.type).toBe("genre_families");
    if (msg.type === "genre_families") {
      expect(msg.families).toHaveLength(2);
      expect(msg.families[0]!.id).toBe("techno");
      expect(msg.families[0]!.subgenreCount).toBe(2);
    }
  });

  it("BackendMessage genre_search_results has correct shape", () => {
    const msg: BackendMessage = {
      type: "genre_search_results",
      results: [
        { id: "techno", name: "Techno", type: "family", familyId: "techno" },
        { id: "peak-time-techno", name: "Peak Time Techno", type: "subgenre", familyId: "techno" },
      ],
    };
    expect(msg.type).toBe("genre_search_results");
    if (msg.type === "genre_search_results") {
      expect(msg.results).toHaveLength(2);
      expect(msg.results[0]!.type).toBe("family");
      expect(msg.results[1]!.type).toBe("subgenre");
    }
  });

  it("FrontendMessage search_genres has correct shape", () => {
    const msg: FrontendMessage = { type: "search_genres", query: "tech" };
    expect(msg.type).toBe("search_genres");
    if (msg.type === "search_genres") {
      expect(msg.query).toBe("tech");
    }
  });

  it("FrontendMessage request_genre_families has correct shape", () => {
    const msg: FrontendMessage = { type: "request_genre_families" };
    expect(msg.type).toBe("request_genre_families");
  });
});

describe("handleFrontendMessage — new genre infrastructure types", () => {
  it("routes search_genres to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { search_genres: handler };

    handleFrontendMessage(
      { type: "search_genres", query: "techno" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "search_genres", query: "techno" });
  });

  it("routes request_genre_families to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { request_genre_families: handler };

    handleFrontendMessage(
      { type: "request_genre_families" },
      handlers
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "request_genre_families" });
  });

  it("does not route malformed search_genres (missing query) to handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { search_genres: handler };

    handleFrontendMessage(
      { type: "search_genres" },
      handlers
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not route malformed select_genre (missing genreId) to handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { select_genre: handler };

    handleFrontendMessage(
      { type: "select_genre" },
      handlers
    );

    expect(handler).not.toHaveBeenCalled();
  });
});


// ─── Tests for reference track message types (Task 8.2, Requirements 6.4, 6.5, 6.6) ───

describe("isValidFrontendMessage — request_reference_scan", () => {
  it("returns true for { type: 'request_reference_scan' }", () => {
    expect(isValidFrontendMessage({ type: "request_reference_scan" })).toBe(true);
  });

  it("returns true even with extra fields present", () => {
    expect(
      isValidFrontendMessage({ type: "request_reference_scan", extra: "ignored" })
    ).toBe(true);
  });
});

describe("handleFrontendMessage — request_reference_scan", () => {
  it("invokes request_reference_scan handler when message is valid", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { request_reference_scan: handler };

    handleFrontendMessage({ type: "request_reference_scan" }, handlers);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "request_reference_scan" });
  });

  it("does not invoke any handler for unrecognized type", () => {
    const refHandler = vi.fn();
    const stateHandler = vi.fn();
    const handlers: FrontendMessageHandlers = {
      request_reference_scan: refHandler,
      request_state: stateHandler,
    };

    handleFrontendMessage({ type: "totally_unknown_type" }, handlers);

    expect(refHandler).not.toHaveBeenCalled();
    expect(stateHandler).not.toHaveBeenCalled();
  });

  it("does not throw when no request_reference_scan handler is registered", () => {
    const handlers: FrontendMessageHandlers = {};

    expect(() =>
      handleFrontendMessage({ type: "request_reference_scan" }, handlers)
    ).not.toThrow();
  });
});

describe("type contracts — reference messages", () => {
  it("BackendMessage reference_updated has correct shape", () => {
    const msg: BackendMessage = {
      type: "reference_updated",
      referenceTrackIndex: 3,
      referenceSections: [
        { label: "Intro", startTime: 0, endTime: 32, proportion: 0.25 },
        { label: "Drop", startTime: 32, endTime: 96, proportion: 0.5 },
        { label: "Outro", startTime: 96, endTime: 128, proportion: 0.25 },
      ],
      comparisonResult: {
        sectionDeltas: [
          {
            userLabel: "Intro",
            referenceLabel: "Intro",
            proportionDelta: 0.05,
            timingDelta: 0.0,
            durationDeltaBeats: 4,
            durationDeltaPercent: 12.5,
            matched: true,
            suggestion: "Your intro is slightly longer than the reference.",
          },
        ],
        aggregateMetrics: {
          totalDurationDifference: 8,
          peakPositionDifference: 2.5,
          sectionCountDifference: 0,
        },
      },
    };
    expect(msg.type).toBe("reference_updated");
    if (msg.type === "reference_updated") {
      expect(msg.referenceTrackIndex).toBe(3);
      expect(msg.referenceSections).toHaveLength(3);
      expect(msg.comparisonResult).not.toBeNull();
      expect(msg.comparisonResult!.sectionDeltas).toHaveLength(1);
      expect(msg.comparisonResult!.aggregateMetrics.totalDurationDifference).toBe(8);
    }
  });

  it("BackendMessage reference_updated allows null comparisonResult", () => {
    const msg: BackendMessage = {
      type: "reference_updated",
      referenceTrackIndex: 1,
      referenceSections: [],
      comparisonResult: null,
    };
    if (msg.type === "reference_updated") {
      expect(msg.comparisonResult).toBeNull();
    }
  });

  it("BackendMessage reference_cleared has correct shape", () => {
    const msg: BackendMessage = { type: "reference_cleared" };
    expect(msg.type).toBe("reference_cleared");
  });

  it("FrontendMessage request_reference_scan has correct shape", () => {
    const msg: FrontendMessage = { type: "request_reference_scan" };
    expect(msg.type).toBe("request_reference_scan");
  });
});


// ─── Feature: m8-polish, Task 7.5: Refresh and DJ score message tests ───

describe("isValidFrontendMessage — refresh", () => {
  it('returns true for { type: "refresh" }', () => {
    expect(isValidFrontendMessage({ type: "refresh" })).toBe(true);
  });

  it("returns true for refresh with extra fields present", () => {
    expect(isValidFrontendMessage({ type: "refresh", extra: "ignored" })).toBe(true);
  });
});

describe("handleFrontendMessage — refresh", () => {
  it("routes refresh to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { refresh: handler };

    handleFrontendMessage({ type: "refresh" }, handlers);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "refresh" });
  });
});

describe("type contracts — analyzing_status and dj_score_updated", () => {
  it("BackendMessage analyzing_status has correct shape (true)", () => {
    const msg: BackendMessage = { type: "analyzing_status", analyzing: true };
    expect(msg.type).toBe("analyzing_status");
    if (msg.type === "analyzing_status") {
      expect(msg.analyzing).toBe(true);
    }
  });

  it("BackendMessage analyzing_status has correct shape (false)", () => {
    const msg: BackendMessage = { type: "analyzing_status", analyzing: false };
    if (msg.type === "analyzing_status") {
      expect(msg.analyzing).toBe(false);
    }
  });

  it("BackendMessage dj_score_updated has correct shape with score", () => {
    const msg: BackendMessage = {
      type: "dj_score_updated",
      djScore: {
        totalScore: 85,
        components: [
          { name: "Intro Length", score: 100, weight: 0.2, weighted: 20 },
        ],
        phraseIssues: [],
        applicable: true,
      },
    };
    expect(msg.type).toBe("dj_score_updated");
    if (msg.type === "dj_score_updated") {
      expect(msg.djScore).not.toBeNull();
      expect(msg.djScore!.totalScore).toBe(85);
      expect(msg.djScore!.applicable).toBe(true);
    }
  });

  it("BackendMessage dj_score_updated allows null djScore", () => {
    const msg: BackendMessage = { type: "dj_score_updated", djScore: null };
    if (msg.type === "dj_score_updated") {
      expect(msg.djScore).toBeNull();
    }
  });

  it("FrontendMessage refresh has correct shape", () => {
    const msg: FrontendMessage = { type: "refresh" };
    expect(msg.type).toBe("refresh");
  });
});


// ─── Feature: m8-polish, Task 7.5: Unit test for "refresh" message validation ───

/**
 * **Validates: Requirements 5.3, 7.1**
 */
describe("isValidFrontendMessage — refresh", () => {
  it("returns true for a valid refresh message", () => {
    expect(isValidFrontendMessage({ type: "refresh" })).toBe(true);
  });

  it("returns true for refresh message with extra fields present", () => {
    expect(isValidFrontendMessage({ type: "refresh", extra: "ignored" })).toBe(true);
  });
});

describe("handleFrontendMessage — refresh", () => {
  it("routes refresh to the correct handler", () => {
    const handler = vi.fn();
    const handlers: FrontendMessageHandlers = { refresh: handler };

    handleFrontendMessage({ type: "refresh" }, handlers);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "refresh" });
  });
});
