/**
 * Unit tests for Comparison Overlay rendering functions.
 *
 * Tests:
 * - Rendering with known inputs (3 matched sections)
 * - Hint message display when no reference
 * - Connector lines only for matched sections
 *
 * Requirements: 7.3, 7.4, 7.6, 7.7
 */
import { describe, it, expect } from "vitest";

import {
  renderComparisonOverlay,
  renderNoReferenceHint,
  truncateLabel,
  computeSegmentWidths,
  type ComparisonOverlayData,
} from "./comparison-overlay.js";
import type { ComparisonResult, ReferenceSection, SectionDelta } from "../../core/reference-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeMatchedDelta(userLabel: string, refLabel: string, proportionDelta: number): SectionDelta {
  return {
    userLabel,
    referenceLabel: refLabel,
    proportionDelta,
    timingDelta: 0.01,
    durationDeltaBeats: 4,
    durationDeltaPercent: 10,
    matched: true,
    suggestion: null,
  };
}

function makeUnmatchedDelta(userLabel: string): SectionDelta {
  return {
    userLabel,
    referenceLabel: null,
    proportionDelta: null,
    timingDelta: null,
    durationDeltaBeats: null,
    durationDeltaPercent: null,
    matched: false,
    suggestion: null,
  };
}

function makeRefSection(label: string, startTime: number, endTime: number, proportion: number): ReferenceSection {
  return { label, startTime, endTime, proportion };
}

// ─── renderNoReferenceHint Tests ───────────────────────────────────────

describe("renderNoReferenceHint", () => {
  /**
   * Validates: Requirement 7.7
   * The hint message should explain the naming convention required to
   * designate a reference track.
   */
  it("displays hint text explaining naming convention", () => {
    const html = renderNoReferenceHint();

    expect(html).toContain("No reference track detected");
    expect(html).toContain("REF");
    expect(html).toContain("[Reference]");
    expect(html).toContain("to enable comparison");
  });

  it("includes appropriate ARIA attributes for accessibility", () => {
    const html = renderNoReferenceHint();

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="No reference track detected"');
  });
});

// ─── renderComparisonOverlay — no reference / cleared state ────────────

describe("renderComparisonOverlay — no reference state", () => {
  /**
   * Validates: Requirement 7.6
   * When referenceCleared is true, the overlay shows the hint message.
   */
  it("shows hint when referenceCleared is true", () => {
    const data: ComparisonOverlayData = {
      comparisonResult: null,
      referenceSections: [],
      userSectionLabels: ["Intro", "Drop"],
      userSectionProportions: [0.3, 0.7],
      referenceCleared: true,
    };

    const html = renderComparisonOverlay(data);

    expect(html).toContain("No reference track detected");
    expect(html).toContain("REF");
    expect(html).not.toContain("co-overlay");
  });

  /**
   * Validates: Requirement 7.6
   * When comparisonResult is null, the overlay shows the hint message.
   */
  it("shows hint when comparisonResult is null", () => {
    const data: ComparisonOverlayData = {
      comparisonResult: null,
      referenceSections: [makeRefSection("Intro", 0, 32, 0.5)],
      userSectionLabels: ["Intro"],
      userSectionProportions: [1.0],
      referenceCleared: false,
    };

    const html = renderComparisonOverlay(data);

    expect(html).toContain("No reference track detected");
    expect(html).not.toContain("co-overlay");
  });
});

// ─── renderComparisonOverlay — 3 matched sections ──────────────────────

describe("renderComparisonOverlay — 3 matched sections", () => {
  const sectionDeltas: SectionDelta[] = [
    makeMatchedDelta("Intro", "Ref Intro", 0.05),
    makeMatchedDelta("Drop", "Ref Drop", -0.03),
    makeMatchedDelta("Outro", "Ref Outro", 0.02),
  ];

  const comparisonResult: ComparisonResult = {
    sectionDeltas,
    aggregateMetrics: {
      totalDurationDifference: 16, // 4 bars
      peakPositionDifference: 3.5,
      sectionCountDifference: 0,
    },
  };

  const referenceSections: ReferenceSection[] = [
    makeRefSection("Ref Intro", 0, 32, 0.25),
    makeRefSection("Ref Drop", 32, 96, 0.5),
    makeRefSection("Ref Outro", 96, 128, 0.25),
  ];

  const data: ComparisonOverlayData = {
    comparisonResult,
    referenceSections,
    userSectionLabels: ["Intro", "Drop", "Outro"],
    userSectionProportions: [0.3, 0.47, 0.23],
    referenceCleared: false,
  };

  /**
   * Validates: Requirement 7.3
   * Connector lines should be rendered for matched section pairs.
   */
  it("renders connector lines for all 3 matched pairs", () => {
    const html = renderComparisonOverlay(data);

    // Should have SVG connector lines
    expect(html).toContain("co-connectors");
    expect(html).toContain("co-connector");

    // All 3 matched sections should have connector lines
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('data-index="2"');
  });

  it("renders user bar with all section labels", () => {
    const html = renderComparisonOverlay(data);

    expect(html).toContain("co-bar--user");
    expect(html).toContain("Intro");
    expect(html).toContain("Drop");
    expect(html).toContain("Outro");
  });

  it("renders reference bar with reference labels", () => {
    const html = renderComparisonOverlay(data);

    expect(html).toContain("co-bar--reference");
    expect(html).toContain("Ref Intro");
    expect(html).toContain("Ref Drop");
    expect(html).toContain("Ref Outro");
  });

  it("renders matched segments with matched CSS class", () => {
    const html = renderComparisonOverlay(data);

    expect(html).toContain("co-segment--matched");
  });

  it("renders summary row with aggregate metrics", () => {
    const html = renderComparisonOverlay(data);

    // 16 beats / 4 = 4 bars
    expect(html).toContain("+4 bars");
    // Section count difference = 0
    expect(html).toContain("0");
    // Peak position difference = +3.5%
    expect(html).toContain("+3.5%");
  });

  it("has correct ARIA attributes on the overlay", () => {
    const html = renderComparisonOverlay(data);

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Reference comparison overlay"');
  });
});

// ─── renderComparisonOverlay — connector lines only for matched ────────

describe("renderComparisonOverlay — connectors only for matched sections", () => {
  /**
   * Validates: Requirements 7.3, 7.4
   * Connector lines should only appear for matched pairs.
   * Unmatched sections should not have connectors but should have distinct styling.
   */
  it("renders connectors only for matched sections, not unmatched", () => {
    const sectionDeltas: SectionDelta[] = [
      makeMatchedDelta("Intro", "Ref Intro", 0.02),
      makeMatchedDelta("Verse", "Ref Verse", -0.01),
      makeUnmatchedDelta("Extra Section"), // user has an extra section with no reference match
    ];

    const comparisonResult: ComparisonResult = {
      sectionDeltas,
      aggregateMetrics: {
        totalDurationDifference: 32,
        peakPositionDifference: 1.0,
        sectionCountDifference: 1,
      },
    };

    const referenceSections: ReferenceSection[] = [
      makeRefSection("Ref Intro", 0, 64, 0.5),
      makeRefSection("Ref Verse", 64, 128, 0.5),
    ];

    const data: ComparisonOverlayData = {
      comparisonResult,
      referenceSections,
      userSectionLabels: ["Intro", "Verse", "Extra Section"],
      userSectionProportions: [0.3, 0.4, 0.3],
      referenceCleared: false,
    };

    const html = renderComparisonOverlay(data);

    // Should have connector lines (SVG <line> elements)
    const connectorMatches = html.match(/class="co-connector"/g);
    // Only 2 connectors for the 2 matched sections, not 3
    expect(connectorMatches).toHaveLength(2);
  });

  it("renders unmatched user sections with unmatched CSS class", () => {
    const sectionDeltas: SectionDelta[] = [
      makeMatchedDelta("Intro", "Ref Intro", 0.02),
      makeUnmatchedDelta("Extra"),
    ];

    const comparisonResult: ComparisonResult = {
      sectionDeltas,
      aggregateMetrics: {
        totalDurationDifference: 0,
        peakPositionDifference: 0,
        sectionCountDifference: 1,
      },
    };

    const referenceSections: ReferenceSection[] = [
      makeRefSection("Ref Intro", 0, 128, 1.0),
    ];

    const data: ComparisonOverlayData = {
      comparisonResult,
      referenceSections,
      userSectionLabels: ["Intro", "Extra"],
      userSectionProportions: [0.6, 0.4],
      referenceCleared: false,
    };

    const html = renderComparisonOverlay(data);

    expect(html).toContain("co-segment--unmatched");
    expect(html).toContain("co-segment--matched");
  });

  it("renders no connectors when all sections are unmatched", () => {
    const sectionDeltas: SectionDelta[] = [
      makeUnmatchedDelta("Extra 1"),
      makeUnmatchedDelta("Extra 2"),
    ];

    const comparisonResult: ComparisonResult = {
      sectionDeltas,
      aggregateMetrics: {
        totalDurationDifference: 64,
        peakPositionDifference: 0,
        sectionCountDifference: 2,
      },
    };

    const data: ComparisonOverlayData = {
      comparisonResult,
      referenceSections: [],
      userSectionLabels: ["Extra 1", "Extra 2"],
      userSectionProportions: [0.5, 0.5],
      referenceCleared: false,
    };

    const html = renderComparisonOverlay(data);

    // No connector <line> elements should be present
    const connectorMatches = html.match(/class="co-connector"/g);
    expect(connectorMatches).toBeNull();
  });
});

// ─── truncateLabel Tests ───────────────────────────────────────────────

describe("truncateLabel", () => {
  it("returns label unchanged when 10 characters or fewer", () => {
    expect(truncateLabel("Short")).toBe("Short");
    expect(truncateLabel("Exactly 10")).toBe("Exactly 10");
  });

  it("truncates label to 10 chars + ellipsis when longer", () => {
    const result = truncateLabel("This Is A Very Long Label");
    expect(result).toBe("This Is A \u2026");
    expect(result.length).toBe(11); // 10 chars + 1 ellipsis char
  });

  it("handles empty string", () => {
    expect(truncateLabel("")).toBe("");
  });
});

// ─── computeSegmentWidths Tests ────────────────────────────────────────

describe("computeSegmentWidths", () => {
  it("returns empty array for empty input", () => {
    expect(computeSegmentWidths([])).toEqual([]);
  });

  it("returns 100% for single segment", () => {
    const result = computeSegmentWidths([1.0]);
    expect(result[0]).toBeCloseTo(100, 5);
  });

  it("enforces minimum 3% width for small segments", () => {
    // One tiny segment (1%) and one large segment (99%)
    const result = computeSegmentWidths([0.01, 0.99]);

    // The small segment should be bumped to at least 3%
    expect(result[0]!).toBeGreaterThanOrEqual(2.9); // approximately 3% after normalization
  });

  it("widths sum to 100%", () => {
    const result = computeSegmentWidths([0.25, 0.5, 0.25]);
    const total = result.reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(100, 5);
  });
});
