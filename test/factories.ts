/**
 * Test data factories for the Arrangement Coach test suite.
 *
 * Each factory produces a valid domain object with sensible defaults.
 * Pass a Partial<T> to override any property.
 */
import type { LocatorData, TrackData } from "../src/ableton/sdk-adapter.js";

// Section is defined in src/core/section-scanner.ts (Task 4.1).
// Re-exported here so tests can use it before that module lands.
export interface Section {
  readonly id: string;
  readonly name: string;
  readonly startTime: number; // beats
  readonly endTime: number; // beats (Infinity for last section)
}

// ─── Factory Defaults ──────────────────────────────────────────────────

let locatorCounter = 0;
let sectionCounter = 0;

/** Reset internal counters between test runs if needed. */
export function resetFactoryCounters(): void {
  locatorCounter = 0;
  sectionCounter = 0;
}

// ─── LocatorData Factory ───────────────────────────────────────────────

/**
 * Create a LocatorData instance with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function createLocatorData(
  overrides: Partial<LocatorData> = {},
): LocatorData {
  const index = locatorCounter++;
  return {
    name: `Locator ${index}`,
    time: index * 16, // 16 beats apart by default
    ...overrides,
  };
}

// ─── TrackData Factory ─────────────────────────────────────────────────

/**
 * Create a TrackData instance with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function createTrackData(
  overrides: Partial<TrackData> = {},
): TrackData {
  return {
    name: "Track 1",
    type: "midi",
    ...overrides,
  };
}

// ─── Section Factory ───────────────────────────────────────────────────

/**
 * Create a Section instance with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function createSection(overrides: Partial<Section> = {}): Section {
  const index = sectionCounter++;
  return {
    id: `section-${index}`,
    name: `Section ${index}`,
    startTime: index * 32, // 32 beats apart by default
    endTime: (index + 1) * 32,
    ...overrides,
  };
}
