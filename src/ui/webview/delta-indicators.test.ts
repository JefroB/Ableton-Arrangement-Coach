/**
 * Unit tests for Delta Indicators.
 *
 * Feature: m7-reference-tracks
 *
 * Validates: Requirements 8.2, 8.4, 8.6
 */
import { describe, expect, it } from "vitest";
import {
  getDeltaColor,
  renderDeltaIndicator,
  renderAllDeltaIndicators,
} from "./delta-indicators.js";
import type { SectionDelta } from "../../core/reference-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeMatchedDelta(overrides: Partial<SectionDelta> = {}): SectionDelta {
  return {
    userLabel: "Intro",
    referenceLabel: "Intro",
    proportionDelta: 0.05,
    timingDelta: 0.01,
    durationDeltaBeats: 4,
    durationDeltaPercent: 10,
    matched: true,
    suggestion: null,
    ...overrides,
  };
}

function makeUnmatchedDelta(overrides: Partial<SectionDelta> = {}): SectionDelta {
  return {
    userLabel: "Outro",
    referenceLabel: null,
    proportionDelta: null,
    timingDelta: null,
    durationDeltaBeats: null,
    durationDeltaPercent: null,
    matched: false,
    suggestion: null,
    ...overrides,
  };
}

// ─── "no ref" display for unmatched sections (Requirement 8.4) ─────────

describe("renderDeltaIndicator — unmatched sections", () => {
  it("displays 'no ref' text for unmatched sections", () => {
    const delta = makeUnmatchedDelta();
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("no ref");
  });

  it("uses the no-ref CSS class for unmatched sections", () => {
    const delta = makeUnmatchedDelta();
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--no-ref");
  });

  it("displays 'no ref' when matched is true but proportionDelta is null", () => {
    const delta = makeMatchedDelta({ matched: true, proportionDelta: null });
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("no ref");
    expect(html).toContain("delta-indicator--no-ref");
  });

  it("includes accessible aria-label for unmatched sections", () => {
    const delta = makeUnmatchedDelta();
    const html = renderDeltaIndicator(delta);
    expect(html).toContain('aria-label="No reference match"');
  });
});

// ─── Hiding when comparison results are null (Requirement 8.6) ─────────

describe("renderAllDeltaIndicators — null comparison results", () => {
  it("returns empty array when sectionDeltas is null", () => {
    const result = renderAllDeltaIndicators(null);
    expect(result).toEqual([]);
  });

  it("returns empty array (no indicators rendered) when input is null", () => {
    const result = renderAllDeltaIndicators(null);
    expect(result).toHaveLength(0);
  });

  it("returns indicators for each section when sectionDeltas is non-null", () => {
    const deltas: SectionDelta[] = [
      makeMatchedDelta({ proportionDelta: 0.03 }),
      makeUnmatchedDelta(),
    ];
    const result = renderAllDeltaIndicators(deltas);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("delta-indicator--green");
    expect(result[1]).toContain("no ref");
  });

  it("returns empty array for empty (but non-null) sectionDeltas", () => {
    const result = renderAllDeltaIndicators([]);
    expect(result).toEqual([]);
  });
});

// ─── Color thresholds at exact boundary values (Requirement 8.2) ───────

describe("getDeltaColor — boundary values", () => {
  // Green: |delta| ≤ 5
  it("returns green at exactly 0", () => {
    expect(getDeltaColor(0)).toBe("green");
  });

  it("returns green at exactly +5", () => {
    expect(getDeltaColor(5)).toBe("green");
  });

  it("returns green at exactly -5", () => {
    expect(getDeltaColor(-5)).toBe("green");
  });

  it("returns green at 4.99", () => {
    expect(getDeltaColor(4.99)).toBe("green");
  });

  // Yellow: 5 < |delta| ≤ 15
  it("returns yellow at 5.01 (just above green boundary)", () => {
    expect(getDeltaColor(5.01)).toBe("yellow");
  });

  it("returns yellow at -5.01 (just below negative green boundary)", () => {
    expect(getDeltaColor(-5.01)).toBe("yellow");
  });

  it("returns yellow at exactly +15", () => {
    expect(getDeltaColor(15)).toBe("yellow");
  });

  it("returns yellow at exactly -15", () => {
    expect(getDeltaColor(-15)).toBe("yellow");
  });

  it("returns yellow at 14.99", () => {
    expect(getDeltaColor(14.99)).toBe("yellow");
  });

  // Red: |delta| > 15
  it("returns red at 15.01 (just above yellow boundary)", () => {
    expect(getDeltaColor(15.01)).toBe("red");
  });

  it("returns red at -15.01 (just below negative yellow boundary)", () => {
    expect(getDeltaColor(-15.01)).toBe("red");
  });

  it("returns red at 50", () => {
    expect(getDeltaColor(50)).toBe("red");
  });

  it("returns red at -100", () => {
    expect(getDeltaColor(-100)).toBe("red");
  });
});

// ─── renderDeltaIndicator color integration ────────────────────────────

describe("renderDeltaIndicator — color classes at boundaries", () => {
  it("renders green class for delta exactly at 5pp", () => {
    const delta = makeMatchedDelta({ proportionDelta: 0.05 }); // 5%
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--green");
  });

  it("renders yellow class for delta just above 5pp", () => {
    const delta = makeMatchedDelta({ proportionDelta: 0.06 }); // 6%
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--yellow");
  });

  it("renders yellow class for delta exactly at 15pp", () => {
    const delta = makeMatchedDelta({ proportionDelta: 0.15 }); // 15%
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--yellow");
  });

  it("renders red class for delta just above 15pp", () => {
    const delta = makeMatchedDelta({ proportionDelta: 0.16 }); // 16%
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--red");
  });

  it("renders green class for negative delta at -5pp", () => {
    const delta = makeMatchedDelta({ proportionDelta: -0.05 }); // -5%
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--green");
  });

  it("renders red class for large negative delta at -20pp", () => {
    const delta = makeMatchedDelta({ proportionDelta: -0.20 }); // -20%
    const html = renderDeltaIndicator(delta);
    expect(html).toContain("delta-indicator--red");
  });
});
