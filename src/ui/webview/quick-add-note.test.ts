import { describe, it, expect } from "vitest";
import {
  renderQuickAddInput,
  validateQuickAddText,
  MAX_QUICK_ADD_LENGTH,
  type QuickAddState,
} from "./quick-add-note.js";

describe("validateQuickAddText", () => {
  it("returns false for empty string", () => {
    expect(validateQuickAddText("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(validateQuickAddText("   ")).toBe(false);
    expect(validateQuickAddText("\t\n")).toBe(false);
  });

  it("returns true for non-empty string with at least one non-whitespace char", () => {
    expect(validateQuickAddText("hello")).toBe(true);
    expect(validateQuickAddText("  a  ")).toBe(true);
  });

  it("returns false for string longer than 500 characters", () => {
    const longText = "a".repeat(501);
    expect(validateQuickAddText(longText)).toBe(false);
  });

  it("returns true for string of exactly 500 characters", () => {
    const maxText = "a".repeat(500);
    expect(validateQuickAddText(maxText)).toBe(true);
  });

  it("returns true for single character", () => {
    expect(validateQuickAddText("x")).toBe(true);
  });
});

describe("renderQuickAddInput", () => {
  it("returns empty string when not visible", () => {
    const state: QuickAddState = {
      visible: false,
      sectionId: "section-1",
      text: "",
      error: false,
    };
    expect(renderQuickAddInput(state)).toBe("");
  });

  it("renders input when visible", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: "section-1",
      text: "",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).toContain("quick-add-container");
    expect(html).toContain("quick-add-input");
    expect(html).toContain('id="quick-add-field"');
    expect(html).toContain('data-section-id="section-1"');
  });

  it("renders error state when error is true", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: "section-1",
      text: "",
      error: true,
    };
    const html = renderQuickAddInput(state);
    expect(html).toContain("quick-add-input--error");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("quick-add-error-message");
    expect(html).toContain('role="alert"');
  });

  it("does not render error indicators when error is false", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: "section-1",
      text: "some text",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).not.toContain("quick-add-input--error");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("quick-add-error-message");
  });

  it("escapes HTML in text value", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: "section-1",
      text: '<script>alert("xss")</script>',
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in sectionId", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: '"><script>alert(1)</script>',
      text: "",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).not.toContain('"><script>');
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("includes maxlength attribute", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: "s1",
      text: "",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).toContain(`maxlength="${MAX_QUICK_ADD_LENGTH}"`);
  });

  it("renders with null sectionId without data-section-id attribute", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: null,
      text: "",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).not.toContain("data-section-id");
  });

  it("includes ARIA form role and label", () => {
    const state: QuickAddState = {
      visible: true,
      sectionId: "s1",
      text: "",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).toContain('role="form"');
    expect(html).toContain('aria-label="Quick add note"');
  });

  it("preserves sectionId so focus can return to section on dismiss", () => {
    // When quick-add is visible, the sectionId is embedded as a data attribute.
    // The webview runtime uses this to return focus to the originating section
    // when the input is dismissed (Escape or Enter).
    const state: QuickAddState = {
      visible: true,
      sectionId: "section-intro",
      text: "",
      error: false,
    };
    const html = renderQuickAddInput(state);
    expect(html).toContain('data-section-id="section-intro"');

    // After dismiss, visible becomes false → empty string (nothing to focus)
    const dismissed: QuickAddState = { ...state, visible: false };
    expect(renderQuickAddInput(dismissed)).toBe("");
  });
});
