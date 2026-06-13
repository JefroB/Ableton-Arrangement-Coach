/**
 * Property-based tests for the Structural Alignment Scorer.
 *
 * Feature: m6-genre-infrastructure
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computeAlignment } from "../../src/core/alignment-scorer.js";
import { ALL_PROFILES } from "../../src/core/genre-registry.js";
import type { GenreProfile, SectionTemplate } from "../../src/core/genre-profile-types.js";
import type { Section } from "../../src/core/section-scanner.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a valid SectionTemplate. */
const arbSectionTemplate: fc.Arbitrary<SectionTemplate> = fc
  .record({
    name: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
    lengthMin: fc.integer({ min: 1, max: 64 }),
    lengthSpan: fc.integer({ min: 0, max: 64 }),
    energyMin: fc.integer({ min: 1, max: 10 }),
    energySpan: fc.integer({ min: 0, max: 9 }),
    optional: fc.boolean(),
  })
  .filter((r) => r.energyMin + r.energySpan <= 10)
  .map((r) => ({
    name: r.name,
    lengthRange: { min: r.lengthMin, max: r.lengthMin + r.lengthSpan },
    energyRange: { min: r.energyMin, max: r.energyMin + r.energySpan },
    optional: r.optional,
  }));

/** Generate a valid GenreProfile with at least 1 non-optional section in structure. */
const arbGenreProfile: fc.Arbitrary<GenreProfile> = fc
  .record({
    nonOptionalTemplates: fc.array(
      arbSectionTemplate.map((t) => ({ ...t, optional: false })),
      { minLength: 1, maxLength: 8 },
    ),
    optionalTemplates: fc.array(
      arbSectionTemplate.map((t) => ({ ...t, optional: true })),
      { minLength: 0, maxLength: 3 },
    ),
    weights: fc.tuple(
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
    ),
  })
  .map((r) => {
    const structure = [...r.nonOptionalTemplates, ...r.optionalTemplates];
    const nonOptionalCount = r.nonOptionalTemplates.length;

    // Normalize weights to sum to 1.0
    const [w1, w2, w3, w4, w5] = r.weights;
    const total = w1 + w2 + w3 + w4 + w5;

    // Generate energy curve template entries (one per non-optional section)
    const energyCurveTemplate = Array.from({ length: nonOptionalCount }, (_, i) => ((i * 3) % 10) + 1);

    return {
      id: "test-genre",
      name: "Test Genre",
      family: "test",
      tempoRange: { min: 120, max: 140 },
      structure,
      energyCurveTemplate,
      transitions: {
        preferred: ["filter_sweep"],
        discouraged: [],
        buildDurationRange: { min: 4, max: 16 },
        dropsExpected: false,
      },
      energyWeights: {
        trackCountWeight: w1 / total,
        midiDensityWeight: w2 / total,
        audioPresenceWeight: w3 / total,
        automationWeight: w4 / total,
        frequencyCoverageWeight: w5 / total,
      },
      detectionRules: [],
      detectionThresholds: {
        flatEnergyMaxDelta: 2,
        missingTransitionMinDelta: 3,
        similarityCeilingPercent: 90,
      },
    } satisfies GenreProfile;
  });

/**
 * Generate an array of Sections based on a GenreProfile's structure template.
 * Sections have finite endTime values with reasonable beat positions.
 */
function arbSectionsForProfile(profile: GenreProfile): fc.Arbitrary<Section[]> {
  return fc
    .array(
      fc.record({
        templateIndex: fc.integer({ min: 0, max: profile.structure.length - 1 }),
        bars: fc.integer({ min: 1, max: 128 }),
      }),
      { minLength: 1, maxLength: 12 },
    )
    .map((entries) => {
      let currentBeat = 0;
      return entries.map((entry, i) => {
        const tmpl = profile.structure[entry.templateIndex]!;
        const beats = entry.bars * 4; // 4 beats per bar
        const section: Section = {
          id: `section-${i}`,
          name: tmpl.name,
          startTime: currentBeat,
          endTime: currentBeat + beats,
        };
        currentBeat += beats;
        return section;
      });
    });
}

/**
 * Generate an arbitrary non-empty sections array with names from any source.
 * Uses fixed finite endTimes.
 */
const arbArbitrarySections: fc.Arbitrary<Section[]> = fc
  .array(
    fc.record({
      name: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
      bars: fc.integer({ min: 1, max: 128 }),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map((entries) => {
    let currentBeat = 0;
    return entries.map((entry, i) => {
      const beats = entry.bars * 4;
      const section: Section = {
        id: `section-${i}`,
        name: entry.name,
        startTime: currentBeat,
        endTime: currentBeat + beats,
      };
      currentBeat += beats;
      return section;
    });
  });

/** Picks a registered GenreProfile (real profiles from the project). */
const registeredProfileArb = fc.constantFrom(...ALL_PROFILES);

/** BPM generator. */
const arbBpm = fc.integer({ min: 60, max: 200 });

// ─── Property 8: Alignment score bounded and consistent with weighted formula ──

// Feature: m6-genre-infrastructure, Property 8: Alignment score bounded and consistent with weighted formula
describe("Property 8: Alignment score bounded and consistent with weighted formula", () => {
  /**
   * **Validates: Requirements 5.2, 5.8**
   *
   * For any valid sections array and GenreProfile, `computeAlignment` SHALL return
   * an AlignmentResult where all four fields (overall, ordering, length, count)
   * are numbers in the range [0, 100], and overall equals
   * Math.round(0.4 * ordering + 0.35 * length + 0.25 * count).
   */
  test.prop([arbArbitrarySections, registeredProfileArb, arbBpm], { numRuns: 200 })(
    "all scores are in [0, 100] and overall equals Math.round(0.4*ordering + 0.35*length + 0.25*count)",
    (sections, profile, bpm) => {
      const result = computeAlignment(sections, profile, bpm);

      // With a non-null profile, result must be non-null
      expect(result).not.toBeNull();
      const { overall, ordering, length, count } = result!;

      // All dimension scores are in [0, 100]
      expect(ordering).toBeGreaterThanOrEqual(0);
      expect(ordering).toBeLessThanOrEqual(100);
      expect(length).toBeGreaterThanOrEqual(0);
      expect(length).toBeLessThanOrEqual(100);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(100);

      // Overall is in [0, 100]
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);

      // Overall matches the weighted formula
      const expectedOverall = Math.round(0.4 * ordering + 0.35 * length + 0.25 * count);
      expect(overall).toBe(expectedOverall);
    },
  );

  test.prop([arbGenreProfile, arbBpm], { numRuns: 200 })(
    "scores are bounded and formula-consistent with generated profiles and matching sections",
    (profile, bpm) => {
      // Generate sections that use template names for better coverage
      const sections: Section[] = profile.structure.map((tmpl, i) => ({
        id: `section-${i}`,
        name: tmpl.name,
        startTime: i * 64,
        endTime: (i + 1) * 64,
      }));

      const result = computeAlignment(sections, profile, bpm);
      expect(result).not.toBeNull();
      const { overall, ordering, length, count } = result!;

      // All dimension scores are in [0, 100]
      expect(ordering).toBeGreaterThanOrEqual(0);
      expect(ordering).toBeLessThanOrEqual(100);
      expect(length).toBeGreaterThanOrEqual(0);
      expect(length).toBeLessThanOrEqual(100);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(100);
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);

      // Overall matches the weighted formula
      const expectedOverall = Math.round(0.4 * ordering + 0.35 * length + 0.25 * count);
      expect(overall).toBe(expectedOverall);
    },
  );
});

// ─── Property 9: Optional sections incur no alignment penalty ──────────

// Feature: m6-genre-infrastructure, Property 9: Optional sections incur no alignment penalty
describe("Property 9: Optional sections incur no alignment penalty", () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * For any arrangement and GenreProfile, removing sections that correspond
   * to optional SectionTemplates from the arrangement SHALL NOT reduce the
   * `count` dimension score compared to an arrangement that includes them
   * (all else being equal).
   */
  test.prop([registeredProfileArb, arbBpm], { numRuns: 200 })(
    "removing optional sections from the arrangement does not reduce the count score",
    (profile, bpm) => {
      // Only test profiles that have at least one optional section
      const optionalTemplates = profile.structure.filter((t) => t.optional);
      if (optionalTemplates.length === 0) {
        return; // Skip profiles without optional sections
      }

      // Build an arrangement that includes ALL template sections (non-optional + optional)
      const allSections: Section[] = profile.structure.map((tmpl, i) => ({
        id: `section-${i}`,
        name: tmpl.name,
        startTime: i * 64,
        endTime: (i + 1) * 64,
      }));

      // Build an arrangement that EXCLUDES optional sections
      const optionalNames = new Set(optionalTemplates.map((t) => t.name.toLowerCase()));
      const withoutOptional: Section[] = allSections.filter(
        (s) => !optionalNames.has(s.name.toLowerCase()),
      );

      // Re-index section times sequentially
      const reindexed: Section[] = withoutOptional.map((s, i) => ({
        ...s,
        id: `section-${i}`,
        startTime: i * 64,
        endTime: (i + 1) * 64,
      }));

      const resultWith = computeAlignment(allSections, profile, bpm);
      const resultWithout = computeAlignment(reindexed, profile, bpm);

      expect(resultWith).not.toBeNull();
      expect(resultWithout).not.toBeNull();

      // The count score without optional sections should be >= the score with them
      // (since optional sections don't penalize when missing, removing them
      //  should not decrease the score)
      expect(resultWithout!.count).toBeGreaterThanOrEqual(resultWith!.count);
    },
  );

  test.prop(
    [
      arbGenreProfile.filter((p) => p.structure.some((t) => t.optional)),
      arbBpm,
    ],
    { numRuns: 200 },
  )(
    "removing optional sections from generated profiles does not reduce the count score",
    (profile, bpm) => {
      const optionalTemplates = profile.structure.filter((t) => t.optional);

      // Build arrangement with all sections
      const allSections: Section[] = profile.structure.map((tmpl, i) => ({
        id: `section-${i}`,
        name: tmpl.name,
        startTime: i * 64,
        endTime: (i + 1) * 64,
      }));

      // Build arrangement without optional sections
      const optionalNames = new Set(optionalTemplates.map((t) => t.name.toLowerCase()));
      const withoutOptional: Section[] = allSections
        .filter((s) => !optionalNames.has(s.name.toLowerCase()))
        .map((s, i) => ({
          ...s,
          id: `section-${i}`,
          startTime: i * 64,
          endTime: (i + 1) * 64,
        }));

      const resultWith = computeAlignment(allSections, profile, bpm);
      const resultWithout = computeAlignment(withoutOptional, profile, bpm);

      expect(resultWith).not.toBeNull();
      expect(resultWithout).not.toBeNull();

      // Count score should not decrease when optional sections are removed
      expect(resultWithout!.count).toBeGreaterThanOrEqual(resultWith!.count);
    },
  );
});
