// Feature: section-marker-generation, Property 9: Bar-Aligned Positions

/**
 * Property-based test for bar-aligned marker positions.
 *
 * **Validates: Requirements 9.1**
 *
 * Property 9: Bar-Aligned Positions
 * For any generated variant (1+ sections with positive min/max lengthRanges where
 * min ≤ max) and beatsPerBar (1–8), every marker beat position produced by
 * computeMinimalMarkers SHALL be a multiple of beatsPerBar.
 */
import { describe, expect } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { computeMinimalMarkers } from "./minimal-mode.js";
import type { ArrangementVariant, StructureSection } from "./structure-types.js";

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/** Generate a valid StructureSection with positive min ≤ max lengthRange. */
function arbStructureSection(): fc.Arbitrary<StructureSection> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 128 }),
      fc.integer({ min: 0, max: 128 }),
    )
    .map(([min, extra]) => ({
      name: "Section",
      lengthRange: { min, max: min + extra },
    }));
}

/** Generate a valid ArrangementVariant with 1+ sections. */
function arbArrangementVariant(): fc.Arbitrary<ArrangementVariant> {
  return fc
    .array(arbStructureSection(), { minLength: 1, maxLength: 12 })
    .map((sections) => ({
      name: "TestVariant",
      sections,
    }));
}

/** Generate a valid beatsPerBar value (1–8). */
function arbBeatsPerBar(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 8 });
}

// ─── Property 9: Bar-Aligned Positions ──────────────────────────────────

describe("Minimal Mode — Property 9: Bar-Aligned Positions", () => {
  test.prop(
    [arbArrangementVariant(), arbBeatsPerBar()],
    { numRuns: 100 },
  )(
    "every marker beat position is a multiple of beatsPerBar",
    (variant, beatsPerBar) => {
      const markers = computeMinimalMarkers({ variant, beatsPerBar });

      for (const marker of markers) {
        expect(marker.beatPosition % beatsPerBar).toBe(0);
      }
    },
  );
});


// ─── Property 5: Marker Chronological Order ────────────────────────────

// Feature: section-marker-generation, Property 5: Marker Chronological Order

/**
 * Property 5: Marker Chronological Order
 *
 * **Validates: Requirements 9.4, 6.6**
 *
 * For any generated variant (1+ sections with positive min/max lengthRanges
 * where min ≤ max) and beatsPerBar (1–8):
 * - markers[0].beatPosition >= 0
 * - For each consecutive pair (i, i+1): markers[i+1].beatPosition > markers[i].beatPosition
 */
describe("Minimal Mode — Property 5: Marker Chronological Order", () => {
  test.prop(
    [arbArrangementVariant(), arbBeatsPerBar()],
    { numRuns: 100 },
  )(
    "beat positions are strictly increasing and first position >= 0",
    (variant, beatsPerBar) => {
      const markers = computeMinimalMarkers({ variant, beatsPerBar });

      // Must have at least one marker (variant has 1+ sections)
      expect(markers.length).toBeGreaterThanOrEqual(1);

      // First marker position must be >= 0
      expect(markers[0]!.beatPosition).toBeGreaterThanOrEqual(0);

      // All consecutive pairs must be strictly increasing
      for (let i = 0; i < markers.length - 1; i++) {
        expect(markers[i + 1]!.beatPosition).toBeGreaterThan(markers[i]!.beatPosition);
      }
    },
  );
});
