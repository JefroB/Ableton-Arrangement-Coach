/**
 * Property-based tests for the Quick-Add Note validation.
 *
 * Feature: m8-polish, Property 9: Quick-add note validation rejects whitespace-only strings
 *
 * Validates: Requirements 3.4, 3.5
 *
 * Verifies that:
 * - For any string composed entirely of whitespace characters, validateQuickAddText returns false
 * - For any string with at least one non-whitespace character and length ≤ 500, it returns true
 * - For any string longer than 500 characters, it returns false
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { validateQuickAddText, MAX_QUICK_ADD_LENGTH } from "./quick-add-note.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary whitespace-only strings (spaces, tabs, newlines, carriage returns). */
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\r\n", "\f", "\v"), {
    minLength: 1,
    maxLength: 100,
  })
  .map((chars) => chars.join(""));

/** Arbitrary valid strings: at least one non-whitespace character, length ≤ 500. */
const validTextArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: MAX_QUICK_ADD_LENGTH }),
    fc.constantFrom("a", "Z", "0", "!", "é", "日"),
  )
  .map(([base, nonWs]) => {
    // Ensure at least one non-whitespace character is present
    const combined = base.slice(0, MAX_QUICK_ADD_LENGTH - 1) + nonWs;
    return combined.slice(0, MAX_QUICK_ADD_LENGTH);
  })
  .filter((s) => s.trim().length > 0 && s.length <= MAX_QUICK_ADD_LENGTH);

/** Arbitrary strings longer than 500 characters. */
const tooLongArb = fc
  .string({ minLength: MAX_QUICK_ADD_LENGTH + 1, maxLength: MAX_QUICK_ADD_LENGTH + 200 })
  .filter((s) => s.length > MAX_QUICK_ADD_LENGTH);

// ─── Property 9: Quick-add note validation rejects whitespace-only strings ─

// Feature: m8-polish, Property 9: Quick-add note validation rejects whitespace-only strings
describe("Property 9: Quick-add note validation rejects whitespace-only strings", () => {
  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * For any string composed entirely of whitespace characters (spaces, tabs, newlines),
   * validateQuickAddText SHALL return false.
   */
  test.prop([whitespaceOnlyArb], { numRuns: 100 })(
    "whitespace-only strings are rejected",
    (text) => {
      expect(validateQuickAddText(text)).toBe(false);
    },
  );

  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * For any string with at least one non-whitespace character and length ≤ 500,
   * validateQuickAddText SHALL return true.
   */
  test.prop([validTextArb], { numRuns: 100 })(
    "strings with non-whitespace content and length ≤ 500 are accepted",
    (text) => {
      expect(validateQuickAddText(text)).toBe(true);
    },
  );

  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * For any string longer than 500 characters, validateQuickAddText SHALL return false
   * regardless of content.
   */
  test.prop([tooLongArb], { numRuns: 100 })(
    "strings longer than 500 characters are rejected",
    (text) => {
      expect(validateQuickAddText(text)).toBe(false);
    },
  );
});
