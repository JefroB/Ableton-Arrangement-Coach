/**
 * Property-based tests for the State Store module.
 *
 * Feature: m1-foundation
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createStore } from "../../src/state/store.js";
import { buildSections } from "../../src/core/section-scanner.js";
import type { LocatorData } from "../../src/ableton/sdk-adapter.js";

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate non-overlapping sections by generating sorted locator times
 * and using buildSections to produce valid, non-overlapping sections.
 * This guarantees sections are sorted by startTime with endTime > startTime
 * for all but potentially zero-length sections (same time locators).
 *
 * To ensure endTime > startTime for each section, we generate strictly
 * increasing times with a minimum gap.
 */
const nonOverlappingSectionsArbitrary = fc
  .array(fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }), {
    minLength: 1,
    maxLength: 20,
  })
  .map((times) => {
    // Sort and deduplicate to get strictly increasing times
    const unique = [...new Set(times)].sort((a, b) => a - b);
    // Build locators from unique sorted times
    const locators: LocatorData[] = unique.map((time, i) => ({
      name: `Section ${i}`,
      time,
    }));
    return buildSections(locators);
  })
  // Filter out cases where any section has endTime <= startTime
  // (shouldn't happen with unique times, but guards against float edge cases)
  .filter((sections) =>
    sections.every((s) => s.endTime > s.startTime),
  );

/**
 * Generate a playhead position that could be anywhere in a reasonable range,
 * including positions before all sections, between sections (not possible
 * with buildSections since sections are contiguous), and after sections.
 */
const playheadArbitrary = fc.float({
  min: -100,
  max: 15000,
  noNaN: true,
  noDefaultInfinity: true,
});

// ─── Property 5: Active section resolution correctness ─────────────────

// Feature: m1-foundation, Property 5: Active section resolution correctness
describe("Property 5: Active section resolution correctness", () => {
  /**
   * **Validates: Requirements 6.4, 6.6, 7.4**
   *
   * For any array of non-overlapping sections (sorted by startTime, with
   * endTime > startTime) and any playhead position, the resolved activeSectionId
   * SHALL be the ID of the section where `startTime <= position < endTime`,
   * or null if no such section exists.
   */
  test.prop([nonOverlappingSectionsArbitrary, playheadArbitrary], { numRuns: 100 })(
    "activeSectionId matches the section containing the playhead, or null",
    (sections, position) => {
      const store = createStore();

      // Initialize store with sections (no tracks needed for this test)
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Dispatch playhead update
      store.dispatch({ type: "UPDATE_PLAYHEAD", position });

      const state = store.getState();

      // Manually compute expected active section
      const expectedSection = sections.find(
        (s) => s.startTime <= position && position < s.endTime,
      );
      const expectedId = expectedSection ? expectedSection.id : null;

      expect(state.activeSectionId).toBe(expectedId);
    },
  );
});
