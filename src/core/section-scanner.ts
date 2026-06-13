/**
 * Section Scanner — converts Ableton locators into an ordered array of Sections.
 *
 * This module is a pure function with no side effects. It takes raw locator data
 * (from the SDK Adapter) and produces the Section domain model used throughout
 * the extension.
 */
import type { LocatorData } from "../ableton/sdk-adapter.js";

// ─── Domain Type ───────────────────────────────────────────────────────

/** A contiguous time range between two adjacent locators in the arrangement. */
export interface Section {
  readonly id: string;
  readonly name: string;
  readonly startTime: number; // beats
  readonly endTime: number; // beats (Infinity for last section)
}

// ─── Pure Function ─────────────────────────────────────────────────────

/**
 * Build an ordered array of Sections from raw locator data.
 *
 * Sorts locators by time (stable sort), assigns sequential IDs (`section-0`,
 * `section-1`, …), derives each section's name from the locator name, and sets
 * endTime to the next locator's time (or `Infinity` for the last section).
 *
 * @param locators - Raw locator data read from the Live Set via the SDK Adapter.
 * @returns An ordered array of Section objects sorted by startTime.
 */
export function buildSections(locators: LocatorData[]): Section[] {
  if (locators.length === 0) {
    return [];
  }

  // Copy before sorting to avoid mutating the input array
  const sorted = [...locators].sort((a, b) => a.time - b.time);

  return sorted.map((locator, index): Section => {
    const nextLocator = sorted[index + 1];
    return {
      id: `section-${index}`,
      name: locator.name,
      startTime: locator.time,
      endTime: nextLocator !== undefined ? nextLocator.time : Infinity,
    };
  });
}
