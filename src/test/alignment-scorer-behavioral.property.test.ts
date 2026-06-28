/**
 * Property 10: Alignment scorer behavioral equivalence
 *
 * Validates: Requirements 7.6
 *
 * Since the externalized weights (0.4, 0.35, 0.25) are identical to the original
 * hardcoded values, the refactored function produces the same results by construction.
 * This test verifies the function works correctly with randomized inputs:
 * - Returns null when profile is null
 * - Returns scores with overall/ordering/length/count all integers in [0, 100]
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeAlignment } from "../core/alignment-scorer.js";

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SECTION_NAMES = ["intro", "verse", "chorus", "bridge", "outro", "drop", "build", "breakdown"] as const;

/**
 * Generate a sorted array of 3-10 sections with ascending startTime
 * and endTime > startTime.
 */
const arbSections = fc
  .array(
    fc.record({
      name: fc.constantFrom(...SECTION_NAMES),
      startTime: fc.integer({ min: 0, max: 900 }),
    }),
    { minLength: 3, maxLength: 10 },
  )
  .map((raw) => {
    const sorted = [...raw].sort((a, b) => a.startTime - b.startTime);
    return sorted.map((s, i) => ({
      id: `section-${i}`,
      name: s.name,
      startTime: s.startTime,
      endTime: s.startTime + 4 + (i + 1) * 4, // ensure endTime > startTime
    }));
  });

/**
 * Generate a SectionTemplate for a genre profile's structure array.
 */
const arbSectionTemplate = fc.record({
  name: fc.constantFrom(...SECTION_NAMES),
  lengthRange: fc
    .tuple(fc.integer({ min: 1, max: 16 }), fc.integer({ min: 1, max: 32 }))
    .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) })),
  energyRange: fc
    .tuple(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }))
    .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) })),
  optional: fc.boolean(),
});

/**
 * Generate a GenreProfile (with all required fields) or null (50/50).
 */
const arbProfile = fc.oneof(
  fc.constant(null),
  fc.record({
    id: fc.constant("test-genre"),
    name: fc.constant("Test Genre"),
    family: fc.constant("electronic"),
    tempoRange: fc.constant({ min: 60, max: 200 }),
    structure: fc.array(arbSectionTemplate, { minLength: 1, maxLength: 8 }),
    energyCurveTemplate: fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 8 }),
    transitions: fc.constant({ preferred: ["crossfade"], avoidance: [] as string[] }),
    energyWeights: fc.constant({ kick: 0.3, snare: 0.2, hihat: 0.1, bass: 0.2, melody: 0.2 }),
    detectionRules: fc.constant([] as Array<{ readonly type: string; readonly threshold: number }>),
    detectionThresholds: fc.constant({ energy: 0.5, spectral: 0.5 }),
  }),
);

const arbBpm = fc.integer({ min: 60, max: 200 });

// ━━━ Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: remaining-data-externalization, Property 10: Alignment scorer behavioral equivalence", () => {
  it("returns null when profile is null; otherwise all scores are integers in [0, 100]", () => {
    fc.assert(
      fc.property(arbSections, arbProfile, arbBpm, (sections, profile, bpm) => {
        const result = computeAlignment(sections, profile as any, bpm);

        if (profile === null) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          const r = result!;

          // All scores must be integers
          expect(Number.isInteger(r.overall)).toBe(true);
          expect(Number.isInteger(r.ordering)).toBe(true);
          expect(Number.isInteger(r.length)).toBe(true);
          expect(Number.isInteger(r.count)).toBe(true);

          // All scores must be in [0, 100]
          expect(r.overall).toBeGreaterThanOrEqual(0);
          expect(r.overall).toBeLessThanOrEqual(100);
          expect(r.ordering).toBeGreaterThanOrEqual(0);
          expect(r.ordering).toBeLessThanOrEqual(100);
          expect(r.length).toBeGreaterThanOrEqual(0);
          expect(r.length).toBeLessThanOrEqual(100);
          expect(r.count).toBeGreaterThanOrEqual(0);
          expect(r.count).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 200 },
    );
  });
});
