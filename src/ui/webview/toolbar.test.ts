import { describe, it, expect } from "vitest";
import { renderRefreshButton } from "./toolbar.js";

describe("renderRefreshButton", () => {
  it("renders an enabled button when not analyzing", () => {
    const html = renderRefreshButton(false);

    expect(html).toContain("<button");
    expect(html).toContain('class="refresh-btn"');
    expect(html).toContain("Refresh");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("spinner");
    expect(html).toContain('aria-label="Refresh analysis"');
  });

  it("renders the refresh icon when not analyzing", () => {
    const html = renderRefreshButton(false);

    expect(html).toContain("refresh-btn-icon");
    expect(html).toContain("\u21BB"); // ↻ refresh symbol
  });

  it("renders a disabled button with spinner when analyzing", () => {
    const html = renderRefreshButton(true);

    expect(html).toContain("<button");
    expect(html).toContain("disabled");
    expect(html).toContain("refresh-btn--disabled");
    expect(html).toContain("Analyzing\u2026");
    expect(html).toContain("refresh-btn-spinner");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Analysis in progress"');
  });

  it("does not contain Refresh label when analyzing", () => {
    const html = renderRefreshButton(true);

    expect(html).not.toContain(">Refresh<");
  });

  it("does not contain refresh icon when analyzing", () => {
    const html = renderRefreshButton(true);

    expect(html).not.toContain("refresh-btn-icon");
  });
});
