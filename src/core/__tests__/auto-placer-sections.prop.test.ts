/**
 * Property-based tests for Marker-to-Section Round Trip.
 *
 * Feature: existing-arrangement-locator-placement, Property 5: Marker-to-Section Round Trip
 *
 * **Validates: Requirements 2.4**
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { buildSections } from "../section-scanner.js";
import type { LocatorData } from "../../ableton/sdk-adapter.js";

// ——— Generators ————————————————————————————————————————————————————————————————

/**
 * Generate an array of 3–10 locator objects with unique sorted beat positions
 * (doubles 0–500, ascending) and unique string names.
 */
const arbLocators: fc.Arbitrary<LocatorData[]> = fc
  .integer({ min: 3, max: 10 })
  .chain((count) =>
    fc.tuple(
      fc.array(
        fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
        { minLength: count, maxLength: count },
      ),
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
        minLength: count,
        maxLength: count,
      }),
    ).map(([times, names]) => {
      const sorted = [...times].sort((a, b) => a - b);
      return sorted.map((time, i) => ({ name: names[i], time }));
    }),
  );

// ——— Property 5: Marker-to-Section Round Trip ————————————————————————————————

describe("Property 5: Marker-to-Section Round Trip", () => {
  test.prop(
    [arbLocators],
    { numRuns: 100 },
  )(
    "buildSections produces sections with matching names and start times",
    (locators) => {
      const sections = buildSections(locators);

      // Number of sections equals number of locators
      expect(sections.length).toBe(locators.length);

      // Each section's name matches the locator's name and startTime matches the locator's time
      for (let i = 0; i < locators.length; i++) {
        expect(sections[i].name).toBe(locators[i].name);
        expect(sections[i].startTime).toBe(locators[i].time);
      }
    },
  );
});
