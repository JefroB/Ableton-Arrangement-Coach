/**
 * Property 9: DJ score panel class behavioral equivalence
 *
 * Validates: Requirements 7.4
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { scoreColorClass } from "../ui/webview/dj-score-panel.js";

// ━━━ Reference Implementation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Reference implementation using the original hardcoded thresholds.
 * Before externalization, the logic was:
 *   score >= 75 → "dj-score--good"
 *   score >= 50 → "dj-score--fair"
 *   otherwise   → "dj-score--poor"
 */
function referenceScoreColorClass(score: number): string {
  if (score >= 75) {
    return "dj-score--good";
  } else if (score >= 50) {
    return "dj-score--fair";
  } else {
    return "dj-score--poor";
  }
}

// ━━━ Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: remaining-data-externalization, Property 9: DJ score panel class behavioral equivalence", () => {
  it("scoreColorClass output matches reference implementation for all scores in [0, 100]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (score) => {
          const actual = scoreColorClass(score);
          const expected = referenceScoreColorClass(score);
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
