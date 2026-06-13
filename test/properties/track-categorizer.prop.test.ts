/**
 * Property-based tests for the Track Categorizer module.
 *
 * Feature: m2-section-analysis, Property 4: Track categorization produces valid bucket with priority
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { categorizeTrack, type FrequencyBucket } from "../../src/core/track-categorizer.js";

// ─── Constants ─────────────────────────────────────────────────────────

const VALID_BUCKETS: readonly FrequencyBucket[] = [
  "sub",
  "bass",
  "low-mid",
  "mid",
  "high-mid",
  "high",
  "full",
];

/**
 * Priority-ordered pattern table. Each entry maps patterns to a bucket.
 * Order defines priority: earlier entries win when a name matches multiple.
 */
const PRIORITY_ORDERED_BUCKETS: readonly {
  bucket: FrequencyBucket;
  patterns: readonly string[];
}[] = [
  { bucket: "sub", patterns: ["sub", "808"] },
  { bucket: "bass", patterns: ["kick", "bass"] },
  { bucket: "low-mid", patterns: ["guitar", "keys"] },
  { bucket: "mid", patterns: ["pad", "strings", "chord", "piano"] },
  { bucket: "high-mid", patterns: ["lead", "vocal", "vox"] },
  { bucket: "high", patterns: ["hat", "hihat", "cymbal", "shaker", "perc"] },
];

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary track name — mix of random strings and strings containing known patterns. */
const trackNameArbitrary = fc.oneof(
  // Completely random strings
  fc.string({ minLength: 0, maxLength: 50 }),
  // Strings that embed a known pattern (to exercise matching paths)
  fc.tuple(
    fc.string({ minLength: 0, maxLength: 10 }),
    fc.constantFrom(
      "sub",
      "808",
      "kick",
      "bass",
      "guitar",
      "keys",
      "pad",
      "strings",
      "chord",
      "piano",
      "lead",
      "vocal",
      "vox",
      "hat",
      "hihat",
      "cymbal",
      "shaker",
      "perc",
    ),
    fc.string({ minLength: 0, maxLength: 10 }),
  ).map(([prefix, pattern, suffix]) => `${prefix}${pattern}${suffix}`),
);

/** Arbitrary device name array — mix of random and pattern-containing device names. */
const deviceNamesArbitrary = fc.array(
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 30 }),
    fc.constantFrom(
      "Operator",
      "Drum Rack",
      "Simpler",
      "Wavetable",
      "Collision",
    ),
  ),
  { minLength: 0, maxLength: 5 },
);

// ─── Property 4: Track categorization produces valid bucket with priority ───

// Feature: m2-section-analysis, Property 4: Track categorization produces valid bucket with priority
describe("Property 4: Track categorization produces valid bucket with priority", () => {
  /**
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   *
   * Sub-property 1: Result is always exactly one valid FrequencyBucket.
   * For any track name and device name array, categorizeTrack returns
   * exactly one value from the set {sub, bass, low-mid, mid, high-mid, high, full}.
   */
  test.prop([trackNameArbitrary, deviceNamesArbitrary], { numRuns: 100 })(
    "result is always one of the valid FrequencyBucket values",
    (trackName: string, deviceNames: string[]) => {
      const result = categorizeTrack(trackName, deviceNames);

      expect(VALID_BUCKETS).toContain(result);
    },
  );

  /**
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   *
   * Sub-property 2: When a track name contains a pattern from a higher-priority
   * bucket AND a lower-priority bucket, the higher-priority bucket is returned.
   *
   * Priority order: sub > bass > low-mid > mid > high-mid > high
   */
  test.prop(
    [
      // Pick two distinct priority indices (higher = earlier index, lower = later index)
      fc
        .tuple(
          fc.integer({ min: 0, max: PRIORITY_ORDERED_BUCKETS.length - 2 }),
          fc.integer({ min: 1, max: PRIORITY_ORDERED_BUCKETS.length - 1 }),
        )
        .filter(([high, low]) => high < low)
        .chain(([highIdx, lowIdx]) => {
          const highEntry = PRIORITY_ORDERED_BUCKETS[highIdx]!;
          const lowEntry = PRIORITY_ORDERED_BUCKETS[lowIdx]!;

          // Pick one pattern from each bucket
          const highPattern = fc.constantFrom(...highEntry.patterns);
          const lowPattern = fc.constantFrom(...lowEntry.patterns);

          return fc
            .tuple(highPattern, lowPattern, fc.string({ minLength: 0, maxLength: 5 }))
            .map(([hp, lp, separator]) => ({
              trackName: `${hp}${separator}${lp}`,
              expectedBucket: highEntry.bucket,
            }));
        }),
      deviceNamesArbitrary,
    ],
    { numRuns: 100 },
  )(
    "higher-priority bucket wins when track name matches multiple patterns",
    ({ trackName, expectedBucket }, deviceNames) => {
      const result = categorizeTrack(trackName, deviceNames);

      expect(result).toBe(expectedBucket);
    },
  );

  /**
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   *
   * Sub-property 3: Priority order is strictly sub > bass > low-mid > mid > high-mid > high.
   * For each adjacent pair in the priority chain, a name containing both patterns
   * always returns the higher-priority bucket, regardless of order in the name string.
   */
  test.prop(
    [
      fc
        .integer({ min: 0, max: PRIORITY_ORDERED_BUCKETS.length - 2 })
        .chain((idx) => {
          const higherEntry = PRIORITY_ORDERED_BUCKETS[idx]!;
          const lowerEntry = PRIORITY_ORDERED_BUCKETS[idx + 1]!;

          const higherPattern = fc.constantFrom(...higherEntry.patterns);
          const lowerPattern = fc.constantFrom(...lowerEntry.patterns);

          // Put the lower-priority pattern FIRST in the string to ensure
          // priority is respected regardless of position
          return fc
            .tuple(higherPattern, lowerPattern)
            .map(([hp, lp]) => ({
              trackName: `${lp} ${hp}`,
              expectedBucket: higherEntry.bucket,
            }));
        }),
    ],
    { numRuns: 100 },
  )(
    "adjacent priority pairs: higher bucket always wins regardless of pattern order in name",
    ({ trackName, expectedBucket }) => {
      const result = categorizeTrack(trackName, []);

      expect(result).toBe(expectedBucket);
    },
  );
});
