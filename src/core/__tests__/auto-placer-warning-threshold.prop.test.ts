/**
 * Property-based test for Insufficient Count Warning Threshold.
 *
 * Feature: existing-arrangement-locator-placement, Property 10: Insufficient Count Warning Threshold
 *
 * **Validates: Requirements 7.2, 7.4**
 *
 * Property 10: Insufficient Count Warning Threshold
 * For any (placed count, variants array) pair, the insufficient-count warning
 * SHALL be present if and only if `placed < floor(average × 0.75)`, where
 * average is computed as floor(sum of section counts / variants.length).
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computeInsufficientWarning } from "../auto-placer.js";
import type { ArrangementVariant, StructureSection } from "../structure-types.js";

// ——— Custom Arbitraries ———————————————————————————————————————————————————————

/** Generate a StructureSection with a sections array of random length (1–20). */
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

/** Generate an ArrangementVariant with 1–20 sections. */
function arbArrangementVariant(): fc.Arbitrary<ArrangementVariant> {
  return fc
    .array(arbStructureSection(), { minLength: 1, maxLength: 20 })
    .map((sections) => ({
      name: "Variant",
      sections,
    }));
}

/** Generate a non-empty array of ArrangementVariants (1–10 elements). */
function arbVariantsArray(): fc.Arbitrary<ArrangementVariant[]> {
  return fc.array(arbArrangementVariant(), { minLength: 1, maxLength: 10 });
}

/** Generate placed count (0–30). */
function arbPlaced(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 30 });
}

// ——— Property 10: Insufficient Count Warning Threshold ————————————————————————

describe("Auto-Placer — Property 10: Insufficient Count Warning Threshold", () => {
  test.prop(
    [arbPlaced(), arbVariantsArray()],
    { numRuns: 100 },
  )(
    "warning present iff placed < floor(average × 0.75)",
    (placed, variants) => {
      const sectionCounts = variants.map((v) => v.sections.length);
      const expectedAverage = Math.floor(
        sectionCounts.reduce((a, b) => a + b, 0) / variants.length,
      );
      const expectedThreshold = Math.floor(expectedAverage * 0.75);

      const result = computeInsufficientWarning(placed, variants);

      if (placed < expectedThreshold) {
        expect(result).not.toBeNull();
      } else {
        expect(result).toBeNull();
      }
    },
  );
});
