/**
 * Property-based tests for Valid Variant Selection.
 *
 * Feature: section-marker-generation, Property 2: Valid Variant Selection
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { selectVariant } from "./section-generator.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-empty array of distinct string values to act as variants. */
const nonEmptyStringArrayArb = fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
  minLength: 1,
  maxLength: 20,
});

/** Generate a non-empty array of distinct integer values. */
const nonEmptyIntArrayArb = fc.array(fc.integer({ min: -1000, max: 1000 }), {
  minLength: 1,
  maxLength: 50,
});

/** Generate a non-empty array of object-shaped variants (closer to ArrangementVariant). */
const variantLikeArb = fc
  .array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }),
      sections: fc.array(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          lengthRange: fc.record({
            min: fc.integer({ min: 4, max: 64 }),
            max: fc.integer({ min: 4, max: 128 }),
          }),
        }),
        { minLength: 1, maxLength: 10 },
      ),
    }),
    { minLength: 1, maxLength: 10 },
  )
  .filter((arr) => arr.every((v) => v.sections.every((s) => s.lengthRange.min <= s.lengthRange.max)));

// ─── Property 2: Valid Variant Selection ───────────────────────────────

// Feature: section-marker-generation, Property 2: Valid Variant Selection
describe("Property 2: Valid Variant Selection", () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any non-empty array of variants, the random selection function
   * SHALL return a variant that is a member of the input array.
   */
  test.prop([nonEmptyStringArrayArb], { numRuns: 100 })(
    "selected string variant is always a member of the input array",
    (variants) => {
      const selected = selectVariant(variants);
      expect(variants).toContain(selected);
    },
  );

  test.prop([nonEmptyIntArrayArb], { numRuns: 100 })(
    "selected integer variant is always a member of the input array",
    (variants) => {
      const selected = selectVariant(variants);
      expect(variants).toContain(selected);
    },
  );

  test.prop([variantLikeArb], { numRuns: 100 })(
    "selected arrangement-variant-like object is always a member of the input array",
    (variants) => {
      const selected = selectVariant(variants);
      expect(variants).toContain(selected);
    },
  );
});
