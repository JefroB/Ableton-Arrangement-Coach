/**
 * Property-based tests for the Section Scanner module.
 *
 * Feature: m1-foundation
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { buildSections } from "../../src/core/section-scanner.js";
import type { LocatorData } from "../../src/ableton/sdk-adapter.js";

// ─── Generator ─────────────────────────────────────────────────────────

const locatorArbitrary = fc.record({
  name: fc.string(),
  time: fc.float({ min: 0, max: 10000, noNaN: true }),
});

const locatorsArbitrary = fc.array(locatorArbitrary);

// ─── Property 1: Section Scanner produces correct sections from locators ───

// Feature: m1-foundation, Property 1: Section Scanner produces correct sections from locators
describe("Property 1: Section Scanner produces correct sections from locators", () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   *
   * For any array of locators with non-negative times, buildSections SHALL produce
   * an array of sections where:
   * (a) sections are sorted by startTime
   * (b) each section's name equals the corresponding sorted locator's name
   * (c) each section's startTime equals the corresponding sorted locator's time
   * (d) each non-last section's endTime equals the next section's startTime
   * (e) the last section's endTime is positive infinity
   */
  test.prop([locatorsArbitrary], { numRuns: 100 })(
    "sections are sorted, names match, times match, endTimes chain correctly, last endTime is Infinity",
    (locators: LocatorData[]) => {
      const sections = buildSections(locators);

      // When input is empty, output should be empty — all sub-properties trivially hold
      if (locators.length === 0) {
        expect(sections).toHaveLength(0);
        return;
      }

      // Sort the input locators by time to derive expected values
      const sorted = [...locators].sort((a, b) => a.time - b.time);

      // Result should have the same length as input
      expect(sections).toHaveLength(sorted.length);

      // (a) Sections are sorted by startTime
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i]!.startTime).toBeGreaterThanOrEqual(
          sections[i - 1]!.startTime
        );
      }

      // (b) Each section's name equals the corresponding sorted locator's name
      for (let i = 0; i < sections.length; i++) {
        expect(sections[i]!.name).toBe(sorted[i]!.name);
      }

      // (c) Each section's startTime equals the corresponding sorted locator's time
      for (let i = 0; i < sections.length; i++) {
        expect(sections[i]!.startTime).toBe(sorted[i]!.time);
      }

      // (d) Each non-last section's endTime equals the next section's startTime
      for (let i = 0; i < sections.length - 1; i++) {
        expect(sections[i]!.endTime).toBe(sections[i + 1]!.startTime);
      }

      // (e) The last section's endTime is positive infinity
      expect(sections[sections.length - 1]!.endTime).toBe(Infinity);
    },
  );
});

// ─── Property 2: Section Scanner assigns unique identifiers ────────────

// Feature: m1-foundation, Property 2: Section Scanner assigns unique identifiers
describe("Property 2: Section Scanner assigns unique identifiers", () => {
  /**
   * **Validates: Requirements 4.7**
   *
   * For any array of locators, buildSections SHALL produce sections where
   * every section ID is distinct from every other section ID in the output array.
   */
  test.prop([locatorsArbitrary], { numRuns: 100 })(
    "all section IDs in the output are distinct",
    (locators: LocatorData[]) => {
      const sections = buildSections(locators);

      const ids = sections.map((s) => s.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    },
  );
});
