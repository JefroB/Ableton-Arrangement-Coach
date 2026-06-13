/**
 * Property-based tests for Content Mode — grid snap filtering.
 *
 * Feature: section-marker-generation, Property 7: Grid Snap Filtering
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { snapToGrid } from "./content-mode.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-negative candidate position (beat position). */
const candidatePositionArbitrary = fc.nat({ max: 10000 });

/** Generate a non-empty array of candidate positions. */
const candidatesArbitrary = fc.array(candidatePositionArbitrary, {
  minLength: 1,
  maxLength: 50,
});

/** Generate a valid beatsPerBar value (1–8). */
const beatsPerBarArbitrary = fc.integer({ min: 1, max: 8 });

// ─── Property 7: Grid Snap Filtering ──────────────────────────────────

// Feature: section-marker-generation, Property 7: Grid Snap Filtering
describe("Property 7: Grid Snap Filtering", () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any generated array of candidate positions (non-negative numbers) and
   * beatsPerBar (1–8):
   * - result = snapToGrid(candidates, beatsPerBar)
   * - gridSpacing = 8 * beatsPerBar
   * - Every position in result must be an exact multiple of gridSpacing
   *   (because snapToGrid snaps TO the nearest grid point)
   */
  test.prop([candidatesArbitrary, beatsPerBarArbitrary], { numRuns: 100 })(
    "all surviving positions are exact multiples of grid spacing (8 * beatsPerBar)",
    (candidates, beatsPerBar) => {
      const result = snapToGrid(candidates, beatsPerBar);
      const gridSpacing = 8 * beatsPerBar;

      for (const position of result) {
        expect(position % gridSpacing).toBe(0);
      }
    },
  );

  /**
   * **Validates: Requirements 7.3**
   *
   * The stronger property: for each output position, there must have been at least
   * one input candidate within 4 beats of that grid point. This verifies that
   * snapToGrid only emits a grid point when a nearby candidate justified it.
   */
  test.prop([candidatesArbitrary, beatsPerBarArbitrary], { numRuns: 100 })(
    "each output position has at least one input candidate within 4 beats",
    (candidates, beatsPerBar) => {
      const result = snapToGrid(candidates, beatsPerBar);
      const maxDistance = 4;

      for (const gridPoint of result) {
        const hasNearbyCandid = candidates.some(
          (c) => Math.abs(c - gridPoint) <= maxDistance,
        );
        expect(hasNearbyCandid).toBe(true);
      }
    },
  );

  /**
   * **Validates: Requirements 7.3**
   *
   * No duplicates: all surviving positions are unique.
   */
  test.prop([candidatesArbitrary, beatsPerBarArbitrary], { numRuns: 100 })(
    "all output positions are unique (no duplicates)",
    (candidates, beatsPerBar) => {
      const result = snapToGrid(candidates, beatsPerBar);
      const uniquePositions = new Set(result);
      expect(uniquePositions.size).toBe(result.length);
    },
  );
});
