/**
 * Property-based tests for Invalid Locator Exclusion.
 *
 * Feature: existing-arrangement-locator-placement, Property 8: Invalid Locator Exclusion
 *
 * **Validates: Requirements 6.3**
 *
 * For any set of locators with some invalid (>= song duration or duplicate positions),
 * verifies exclusion and warning emission.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { filterInvalidLocators } from "../auto-placer.js";

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a locator with time that can intentionally exceed songDuration. */
const locatorArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 10 }),
  time: fc.double({ min: 0, max: 700, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Generate an array of locators where some share duplicate time values.
 * We generate a base array, then inject duplicates by copying times from
 * earlier entries to guarantee at least some duplicates exist.
 */
const locatorsWithDuplicatesArb = fc
  .array(locatorArb, { minLength: 3, maxLength: 15 })
  .chain((baseLocators) => {
    if (baseLocators.length < 2) return fc.constant(baseLocators);
    // Pick a random index to duplicate the time of the first element
    return fc
      .integer({ min: 1, max: baseLocators.length - 1 })
      .map((dupeIdx) => {
        const result = [...baseLocators];
        result[dupeIdx] = { ...result[dupeIdx]!, time: result[0]!.time };
        return result;
      });
  });

const songDurationArb = fc.double({
  min: 30,
  max: 600,
  noNaN: true,
  noDefaultInfinity: true,
});

// ─── Property 8: Invalid Locator Exclusion ───────────────────────────────────

describe("Property 8: Invalid Locator Exclusion", () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any set of locators (some with time >= songDuration, some duplicates):
   * 1. validLocators should not contain any locator with time >= songDuration
   * 2. validLocators should not contain duplicate time values
   * 3. warnings should have one entry per excluded locator
   * 4. warnings.length + validLocators.length should equal original locators.length
   */
  test.prop([locatorsWithDuplicatesArb, songDurationArb], { numRuns: 100 })(
    "excludes invalid locators and emits correct warnings",
    (locators, songDuration) => {
      const { validLocators, warnings } = filterInvalidLocators(
        locators,
        songDuration,
      );

      // Property 1: no locator in validLocators has time >= songDuration
      for (const locator of validLocators) {
        expect(locator.time).toBeLessThan(songDuration);
      }

      // Property 2: all times in validLocators are unique
      const validTimes = validLocators.map((l) => l.time);
      const uniqueTimes = new Set(validTimes);
      expect(uniqueTimes.size).toBe(validLocators.length);

      // Property 3: warnings.length equals number of excluded locators
      const excludedCount = locators.length - validLocators.length;
      expect(warnings.length).toBe(excludedCount);

      // Property 4: validLocators.length + warnings.length equals original length
      expect(validLocators.length + warnings.length).toBe(locators.length);
    },
  );
});
