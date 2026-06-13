import { describe, it, expect } from "vitest";
import {
  handleSectionListKeyDown,
  sectionListAriaAttrs,
  sectionItemAriaAttrs,
} from "./keyboard-nav.js";

describe("Keyboard Navigation — Unit Tests", () => {
  // ─── handleSectionListKeyDown ─────────────────────────────────────

  describe("handleSectionListKeyDown", () => {
    it("ArrowDown moves focus to next section", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowDown" } as KeyboardEvent,
        { focusedIndex: 0, sectionCount: 5 }
      );
      expect(result).toEqual({ newIndex: 1 });
    });

    it("ArrowUp moves focus to previous section", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowUp" } as KeyboardEvent,
        { focusedIndex: 3, sectionCount: 5 }
      );
      expect(result).toEqual({ newIndex: 2 });
    });

    it("ArrowDown on last section stays on last section (no wrap)", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowDown" } as KeyboardEvent,
        { focusedIndex: 4, sectionCount: 5 }
      );
      expect(result).toEqual({ newIndex: 4 });
    });

    it("ArrowUp on first section stays on first section (no wrap)", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowUp" } as KeyboardEvent,
        { focusedIndex: 0, sectionCount: 5 }
      );
      expect(result).toEqual({ newIndex: 0 });
    });

    it("Enter triggers select action on focused section", () => {
      const result = handleSectionListKeyDown(
        { key: "Enter" } as KeyboardEvent,
        { focusedIndex: 2, sectionCount: 5 }
      );
      expect(result).toEqual({ newIndex: 2, action: "select" });
    });

    it("returns null for unhandled keys", () => {
      const result = handleSectionListKeyDown(
        { key: "Tab" } as KeyboardEvent,
        { focusedIndex: 1, sectionCount: 5 }
      );
      expect(result).toBeNull();
    });

    it("returns null when section count is 0", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowDown" } as KeyboardEvent,
        { focusedIndex: 0, sectionCount: 0 }
      );
      expect(result).toBeNull();
    });

    it("handles single section list correctly with ArrowDown", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowDown" } as KeyboardEvent,
        { focusedIndex: 0, sectionCount: 1 }
      );
      expect(result).toEqual({ newIndex: 0 });
    });

    it("handles single section list correctly with ArrowUp", () => {
      const result = handleSectionListKeyDown(
        { key: "ArrowUp" } as KeyboardEvent,
        { focusedIndex: 0, sectionCount: 1 }
      );
      expect(result).toEqual({ newIndex: 0 });
    });
  });

  // ─── sectionListAriaAttrs ─────────────────────────────────────────

  describe("sectionListAriaAttrs", () => {
    it("returns listbox role", () => {
      const attrs = sectionListAriaAttrs();
      expect(attrs.role).toBe("listbox");
    });

    it("returns tabindex 0 for focusability", () => {
      const attrs = sectionListAriaAttrs();
      expect(attrs.tabindex).toBe("0");
    });

    it("includes aria-label", () => {
      const attrs = sectionListAriaAttrs();
      expect(attrs["aria-label"]).toBe("Section list");
    });
  });

  // ─── sectionItemAriaAttrs ─────────────────────────────────────────

  describe("sectionItemAriaAttrs", () => {
    it("returns option role", () => {
      const attrs = sectionItemAriaAttrs(0, false);
      expect(attrs.role).toBe("option");
    });

    it("sets aria-selected to true when selected", () => {
      const attrs = sectionItemAriaAttrs(2, true);
      expect(attrs["aria-selected"]).toBe("true");
    });

    it("sets aria-selected to false when not selected", () => {
      const attrs = sectionItemAriaAttrs(1, false);
      expect(attrs["aria-selected"]).toBe("false");
    });

    it("generates unique id based on index", () => {
      expect(sectionItemAriaAttrs(0, false).id).toBe("section-item-0");
      expect(sectionItemAriaAttrs(3, true).id).toBe("section-item-3");
    });
  });
});
