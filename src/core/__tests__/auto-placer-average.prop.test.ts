/**
 * Property-based tests for Average Section Count Computation.
 *
 * Feature: existing-arrangement-locator-placement, Property 9: Average Section Count Computation
 * Validates: Requirements 7.1
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computeInsufficientWarning } from "../auto-placer.js";
import type { ArrangementVariant } from "../structure-types.js";

// ——— Generators ———————————————————————————————————————————————————————————————

/** Generate a single ArrangementVariant with 2–20 sections (minLength=2 ensures average ≥ 2). */
function arbVariant(): fc.Arbitrary<ArrangementVariant> {
  return fc
    .array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 10 }),
        lengthRange: fc.constant({ min: 4, max: 8 }),
      }),
      { minLength: 2, maxLength: 20 },
    )
    .map((sections) => ({
      name: "TestVariant",
      sections,
    }));
}

/** Generate a non-empty array of ArrangementVariants (1–10 elements). */
const arbVariants: fc.Arbitrary<ArrangementVariant[]> = fc.array(arbVariant(), {
  minLength: 1,
  maxLength: 10,
});

// ——— Property 9: Average Section Count Computation ————————————————————————————

describe("Property 9: Average Section Count Computation", () => {
  test.prop(
    [arbVariants],
    { numRuns: 100 },
  )(
    "computed average equals floor(sum of section counts / variant count)",
    (variants) => {
      // placed=0 guarantees warning is returned because:
      // - each variant has ≥2 sections, so average ≥ 2
      // - threshold = floor(average * 0.75) ≥ floor(2 * 0.75) = 1
      // - 0 < 1, so warning is always returned
      const result = computeInsufficientWarning(0, variants);

      // Compute expected average
      const totalSections = variants.reduce((sum, v) => sum + v.sections.length, 0);
      const expectedAverage = Math.floor(totalSections / variants.length);

      expect(result).not.toBeNull();
      expect(result!.average).toBe(expectedAverage);
    },
  );
});
