/**
 * Property-based tests for debounce utility (M8 Polish & UX).
 *
 * Feature: m8-polish, Property 7: Debounce coalesces rapid calls
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { debounce } from "./debounce.js";

// ─── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a call count between 2 and 50 (at least 2 to be "rapid calls"). */
const callCountArb = fc.integer({ min: 2, max: 50 });

/** Generate a debounce delay between 1 and 500ms. */
const delayArb = fc.integer({ min: 1, max: 500 });

// ─── Property 7: Debounce coalesces rapid calls ────────────────────────

// Feature: m8-polish, Property 7: Debounce coalesces rapid calls
describe("Property 7: Debounce coalesces rapid calls", () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any sequence of N calls to a debounced function within the delay
   * window, the underlying function SHALL be invoked exactly once after the
   * delay expires.
   */
  test.prop([callCountArb, delayArb], { numRuns: 100 })(
    "N rapid calls within the delay window result in exactly 1 invocation after delay expires",
    (callCount, delayMs) => {
      const spy = vi.fn();
      const debounced = debounce(spy, delayMs);

      // Call the debounced function N times rapidly (no time passing between calls)
      for (let i = 0; i < callCount; i++) {
        debounced();
      }

      // Before delay expires: function should NOT have been called
      expect(spy).not.toHaveBeenCalled();

      // Advance time past the delay
      vi.advanceTimersByTime(delayMs);

      // After delay expires: function should be called exactly once
      expect(spy).toHaveBeenCalledTimes(1);
    },
  );

  test.prop([callCountArb, delayArb], { numRuns: 100 })(
    "N rapid calls pass the last call's arguments to the underlying function",
    (callCount, delayMs) => {
      const spy = vi.fn();
      const debounced = debounce(spy, delayMs);

      // Call with incrementing arguments — only the last should be delivered
      for (let i = 0; i < callCount; i++) {
        debounced(i);
      }

      vi.advanceTimersByTime(delayMs);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(callCount - 1);
    },
  );
});
