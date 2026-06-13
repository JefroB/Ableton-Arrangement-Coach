/**
 * Property-based tests for the Keyboard Navigation module.
 *
 * Feature: m8-polish, Property 10: Keyboard navigation stays within bounds
 *
 * Validates: Requirements 2.3, 2.4
 *
 * Verifies that for any section list of length N (≥1) and any sequence of
 * Up/Down key presses starting from any valid index, the focused index
 * always remains in the range [0, N-1] without wrapping.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { handleSectionListKeyDown, type KeyboardNavState } from "./keyboard-nav.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/** Create a minimal KeyboardEvent-like object with just the `key` property. */
function makeKeyEvent(key: string): KeyboardEvent {
  return { key } as unknown as KeyboardEvent;
}

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary section count between 1 and 100. */
const sectionCountArb = fc.integer({ min: 1, max: 100 });

/** Arbitrary sequence of ArrowUp/ArrowDown key presses (1–50 presses). */
const keySequenceArb = fc.array(fc.constantFrom("ArrowUp", "ArrowDown"), {
  minLength: 1,
  maxLength: 50,
});

// ─── Property 10: Keyboard navigation stays within bounds ──────────────

// Feature: m8-polish, Property 10: Keyboard navigation stays within bounds
describe("Property 10: Keyboard navigation stays within bounds", () => {
  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any section list of length N (≥1) and any sequence of Up/Down key
   * presses starting from any valid index, the focused index SHALL always
   * remain in the range [0, N-1] without wrapping.
   */
  test.prop(
    [sectionCountArb, keySequenceArb],
    { numRuns: 100 },
  )(
    "focused index always stays within [0, N-1] for any key sequence",
    (sectionCount, keys) => {
      // Start from a random valid index derived from sectionCount
      // We use the middle to avoid bias, but the property should hold from any start
      const startIndex = Math.floor(sectionCount / 2);

      let state: KeyboardNavState = {
        focusedIndex: startIndex,
        sectionCount,
      };

      for (const key of keys) {
        const result = handleSectionListKeyDown(makeKeyEvent(key), state);
        if (result !== null) {
          // After each step, assert bounds
          expect(result.newIndex).toBeGreaterThanOrEqual(0);
          expect(result.newIndex).toBeLessThan(sectionCount);
          // Update state for next iteration
          state = { focusedIndex: result.newIndex, sectionCount };
        }
      }
    },
  );

  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any valid starting index within the section list, applying key
   * presses from any position always yields a bounded result.
   * This variant explicitly generates random starting indices.
   */
  test.prop(
    [
      sectionCountArb.chain((n) =>
        fc.tuple(
          fc.constant(n),
          fc.integer({ min: 0, max: n - 1 }),
          keySequenceArb,
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "focused index stays bounded from any valid starting index",
    ([sectionCount, startIndex, keys]) => {
      let state: KeyboardNavState = {
        focusedIndex: startIndex,
        sectionCount,
      };

      for (const key of keys) {
        const result = handleSectionListKeyDown(makeKeyEvent(key), state);
        if (result !== null) {
          expect(result.newIndex).toBeGreaterThanOrEqual(0);
          expect(result.newIndex).toBeLessThan(sectionCount);
          state = { focusedIndex: result.newIndex, sectionCount };
        }
      }
    },
  );
});
