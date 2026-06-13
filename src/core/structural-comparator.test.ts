import { describe, it, expect } from "vitest";
import { computeComparison, generateSuggestion } from "./structural-comparator.js";
import type {
  UserSectionInput,
  ReferenceSection,
} from "./reference-types.js";
import type { GenreProfile } from "./genre-profile-types.js";

describe("computeComparison", () => {
  const userSections: UserSectionInput[] = [
    { startTime: 0, endTime: 32, energyScore: 3, label: "Intro" },
    { startTime: 32, endTime: 96, energyScore: 8, label: "Drop" },
    { startTime: 96, endTime: 128, energyScore: 4, label: "Outro" },
  ];

  const referenceSections: ReferenceSection[] = [
    { label: "Intro", startTime: 0, endTime: 32, proportion: 0.25 },
    { label: "Main", startTime: 32, endTime: 80, proportion: 0.375 },
    { label: "Outro", startTime: 80, endTime: 128, proportion: 0.375 },
  ];

  const userTotal = 128;
  const refTotal = 128;

  it("returns null if user sections array is empty", () => {
    const result = computeComparison([], referenceSections, 128, 128, null);
    expect(result).toBeNull();
  });

  it("returns null if reference sections array is empty", () => {
    const result = computeComparison(userSections, [], 128, 128, null);
    expect(result).toBeNull();
  });

  it("returns null if both arrays are empty", () => {
    const result = computeComparison([], [], 128, 128, null);
    expect(result).toBeNull();
  });

  it("produces matched deltas for equal-count sections", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    );

    expect(result).not.toBeNull();
    expect(result!.sectionDeltas).toHaveLength(3);

    // All should be matched
    for (const delta of result!.sectionDeltas) {
      expect(delta.matched).toBe(true);
    }
  });

  it("computes proportionDelta correctly", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    // Intro: user proportion = 32/128 = 0.25, ref proportion = 0.25 → delta = 0
    expect(result.sectionDeltas[0].proportionDelta).toBeCloseTo(0, 10);

    // Drop: user proportion = 64/128 = 0.5, ref proportion = 0.375 → delta = 0.125
    expect(result.sectionDeltas[1].proportionDelta).toBeCloseTo(0.125, 10);

    // Outro: user proportion = 32/128 = 0.25, ref proportion = 0.375 → delta = -0.125
    expect(result.sectionDeltas[2].proportionDelta).toBeCloseTo(-0.125, 10);
  });

  it("computes timingDelta correctly", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    // Intro: user start prop = 0/128 = 0, ref start prop = 0/128 = 0 → 0
    expect(result.sectionDeltas[0].timingDelta).toBeCloseTo(0, 10);

    // Drop: user start prop = 32/128 = 0.25, ref start prop = 32/128 = 0.25 → 0
    expect(result.sectionDeltas[1].timingDelta).toBeCloseTo(0, 10);

    // Outro: user start prop = 96/128 = 0.75, ref start prop = 80/128 = 0.625 → 0.125
    expect(result.sectionDeltas[2].timingDelta).toBeCloseTo(0.125, 10);
  });

  it("computes durationDeltaBeats correctly", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    // Intro: 32 - 32 = 0
    expect(result.sectionDeltas[0].durationDeltaBeats).toBe(0);

    // Drop: 64 - 48 = 16
    expect(result.sectionDeltas[1].durationDeltaBeats).toBe(16);

    // Outro: 32 - 48 = -16
    expect(result.sectionDeltas[2].durationDeltaBeats).toBe(-16);
  });

  it("computes durationDeltaPercent correctly", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    // Intro: (32 - 32) / 32 * 100 = 0%
    expect(result.sectionDeltas[0].durationDeltaPercent).toBeCloseTo(0, 10);

    // Drop: (64 - 48) / 48 * 100 = 33.33%
    expect(result.sectionDeltas[1].durationDeltaPercent).toBeCloseTo(
      33.333,
      2,
    );

    // Outro: (32 - 48) / 48 * 100 = -33.33%
    expect(result.sectionDeltas[2].durationDeltaPercent).toBeCloseTo(
      -33.333,
      2,
    );
  });

  it("sets durationDeltaPercent to null when reference section has zero duration", () => {
    const refWithZeroDuration: ReferenceSection[] = [
      { label: "Zero", startTime: 0, endTime: 0, proportion: 0 },
      { label: "Main", startTime: 0, endTime: 128, proportion: 1.0 },
    ];

    const users: UserSectionInput[] = [
      { startTime: 0, endTime: 32, energyScore: 5, label: "Intro" },
      { startTime: 32, endTime: 128, energyScore: 7, label: "Main" },
    ];

    const result = computeComparison(users, refWithZeroDuration, 128, 128, null)!;

    expect(result.sectionDeltas[0].durationDeltaPercent).toBeNull();
    expect(result.sectionDeltas[1].durationDeltaPercent).not.toBeNull();
  });

  it("handles extra user sections as unmatched", () => {
    const moreUserSections: UserSectionInput[] = [
      ...userSections,
      { startTime: 128, endTime: 160, energyScore: 2, label: "Extra" },
    ];

    const result = computeComparison(
      moreUserSections,
      referenceSections,
      160,
      refTotal,
      null,
    )!;

    expect(result.sectionDeltas).toHaveLength(4);

    // First 3 should be matched
    expect(result.sectionDeltas[0].matched).toBe(true);
    expect(result.sectionDeltas[1].matched).toBe(true);
    expect(result.sectionDeltas[2].matched).toBe(true);

    // Extra user section: unmatched
    const extra = result.sectionDeltas[3];
    expect(extra.matched).toBe(false);
    expect(extra.userLabel).toBe("Extra");
    expect(extra.referenceLabel).toBeNull();
    expect(extra.proportionDelta).toBeNull();
    expect(extra.timingDelta).toBeNull();
    expect(extra.durationDeltaBeats).toBeNull();
    expect(extra.durationDeltaPercent).toBeNull();
  });

  it("handles extra reference sections as unmatched", () => {
    const fewerUserSections: UserSectionInput[] = [
      { startTime: 0, endTime: 64, energyScore: 6, label: "Intro" },
    ];

    const result = computeComparison(
      fewerUserSections,
      referenceSections,
      64,
      refTotal,
      null,
    )!;

    expect(result.sectionDeltas).toHaveLength(3);

    // First should be matched
    expect(result.sectionDeltas[0].matched).toBe(true);

    // Extra reference sections: unmatched
    const extra1 = result.sectionDeltas[1];
    expect(extra1.matched).toBe(false);
    expect(extra1.userLabel).toBe("Main");
    expect(extra1.referenceLabel).toBe("Main");
    expect(extra1.proportionDelta).toBeNull();
    expect(extra1.timingDelta).toBeNull();
    expect(extra1.durationDeltaBeats).toBeNull();
    expect(extra1.durationDeltaPercent).toBeNull();

    const extra2 = result.sectionDeltas[2];
    expect(extra2.matched).toBe(false);
    expect(extra2.userLabel).toBe("Outro");
    expect(extra2.referenceLabel).toBe("Outro");
  });

  it("computes aggregate totalDurationDifference", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      150,
      128,
      null,
    )!;

    expect(result.aggregateMetrics.totalDurationDifference).toBe(22);
  });

  it("computes aggregate sectionCountDifference", () => {
    const moreUserSections: UserSectionInput[] = [
      ...userSections,
      { startTime: 128, endTime: 160, energyScore: 2, label: "Extra" },
    ];

    const result = computeComparison(
      moreUserSections,
      referenceSections,
      160,
      128,
      null,
    )!;

    expect(result.aggregateMetrics.sectionCountDifference).toBe(1);
  });

  it("computes aggregate peakPositionDifference", () => {
    // User highest-energy section: "Drop" (energyScore=8), midpoint = (32+96)/2 = 64
    // User peak proportion: 64/128 = 0.5
    // Ref longest section: "Main" (48 beats) or "Outro" (48 beats) — first one wins in reduce
    // "Main" midpoint = (32+80)/2 = 56, proportion = 56/128 = 0.4375
    // peakPositionDifference = 0.5 - 0.4375 = 0.0625
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    expect(result.aggregateMetrics.peakPositionDifference).toBeCloseTo(
      0.0625,
      10,
    );
  });

  it("sets suggestion to null when duration deltas are zero", () => {
    // Use same-proportion sections to get zero delta
    const identicalSections: UserSectionInput[] = [
      { startTime: 0, endTime: 32, energyScore: 3, label: "Intro" },
    ];
    const identicalRef: ReferenceSection[] = [
      { label: "Intro", startTime: 0, endTime: 32, proportion: 1.0 },
    ];
    const result = computeComparison(identicalSections, identicalRef, 32, 32, null)!;

    expect(result.sectionDeltas[0].suggestion).toBeNull();
  });

  it("generates generic suggestion with null genre profile for non-zero deltas", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    // Drop is 33% longer → should have a suggestion
    const dropDelta = result.sectionDeltas[1];
    expect(dropDelta.suggestion).not.toBeNull();
    expect(dropDelta.suggestion!.length).toBeLessThanOrEqual(280);
    expect(dropDelta.suggestion).toContain("longer");
    expect(dropDelta.suggestion).toContain("reference");
  });

  it("sets suggestion to null for unmatched sections", () => {
    const moreUserSections: UserSectionInput[] = [
      ...userSections,
      { startTime: 128, endTime: 160, energyScore: 2, label: "Extra" },
    ];

    const result = computeComparison(
      moreUserSections,
      referenceSections,
      160,
      refTotal,
      null,
    )!;

    const extra = result.sectionDeltas[3];
    expect(extra.matched).toBe(false);
    expect(extra.suggestion).toBeNull();
  });

  it("includes referenceLabel for matched sections", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    expect(result.sectionDeltas[0].referenceLabel).toBe("Intro");
    expect(result.sectionDeltas[1].referenceLabel).toBe("Main");
    expect(result.sectionDeltas[2].referenceLabel).toBe("Outro");
  });

  it("includes userLabel for all sections", () => {
    const result = computeComparison(
      userSections,
      referenceSections,
      userTotal,
      refTotal,
      null,
    )!;

    expect(result.sectionDeltas[0].userLabel).toBe("Intro");
    expect(result.sectionDeltas[1].userLabel).toBe("Drop");
    expect(result.sectionDeltas[2].userLabel).toBe("Outro");
  });
});

describe("generateSuggestion", () => {
  const makeGenreProfile = (
    structure: GenreProfile["structure"],
  ): GenreProfile => ({
    id: "test-genre",
    name: "Test Genre",
    family: "electronic",
    tempoRange: { min: 120, max: 140 },
    structure,
    energyCurveTemplate: [0.3, 0.5, 0.8, 1.0, 0.6, 0.3],
    transitions: {
      preferred: ["filter-sweep"],
      discouraged: ["hard-cut"],
      buildDurationRange: { min: 4, max: 16 },
      dropsExpected: true,
    },
    energyWeights: {
      trackCountWeight: 0.2,
      midiDensityWeight: 0.2,
      audioPresenceWeight: 0.2,
      automationWeight: 0.2,
      frequencyCoverageWeight: 0.2,
    },
    detectionRules: [],
    detectionThresholds: {
      flatEnergyMaxDelta: 0.1,
      missingTransitionMinDelta: 0.3,
      similarityCeilingPercent: 80,
    },
  });

  it("returns null when durationDeltaPercent is null", () => {
    const result = generateSuggestion("Intro", 32, 0, null, null);
    expect(result).toBeNull();
  });

  it("returns null when durationDeltaPercent rounds to zero", () => {
    const result = generateSuggestion("Intro", 32, 32, 0.4, null);
    expect(result).toBeNull();
  });

  describe("null genre profile → generic suggestions", () => {
    it("generates generic suggestion for longer section", () => {
      const result = generateSuggestion("Intro", 64, 32, 100, null);
      expect(result).not.toBeNull();
      expect(result!).toContain("Intro");
      expect(result!).toContain("longer");
      expect(result!).toContain("reference");
      expect(result!.length).toBeLessThanOrEqual(280);
      // Generic suggestion should NOT contain genre-specific length references
      expect(result!).not.toContain("genre");
      expect(result!).not.toContain("bars");
    });

    it("generates generic suggestion for shorter section", () => {
      const result = generateSuggestion("Drop", 16, 32, -50, null);
      expect(result).not.toBeNull();
      expect(result!).toContain("Drop");
      expect(result!).toContain("shorter");
      expect(result!).toContain("reference");
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("label does not match any SectionTemplate → generic suggestion", () => {
    it("generates generic suggestion without genre references", () => {
      const profile = makeGenreProfile([
        {
          name: "Drop",
          lengthRange: { min: 8, max: 32 },
          energyRange: { min: 0.7, max: 1.0 },
          optional: false,
        },
      ]);

      // "Breakdown" does not match "Drop" → generic
      const result = generateSuggestion("Breakdown", 64, 32, 100, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("Breakdown");
      expect(result!).toContain("longer");
      expect(result!).not.toContain("genre");
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("longer than ref AND exceeds genre max", () => {
    it("includes 'exceeds both reference and genre norm'", () => {
      const profile = makeGenreProfile([
        {
          name: "Intro",
          lengthRange: { min: 4, max: 8 },
          energyRange: { min: 0.1, max: 0.4 },
          optional: false,
        },
      ]);

      // User: 48 beats = 12 bars, ref: 32 beats = 8 bars, genre max = 8 bars
      // User exceeds both ref and genre max
      const result = generateSuggestion("Intro", 48, 32, 50, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("exceeds both reference and genre norm");
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("shorter than ref BUT within genre range", () => {
    it("notes proportion is within genre norms", () => {
      const profile = makeGenreProfile([
        {
          name: "Drop",
          lengthRange: { min: 8, max: 32 },
          energyRange: { min: 0.7, max: 1.0 },
          optional: false,
        },
      ]);

      // User: 48 beats = 12 bars (within 8–32), ref: 64 beats = 16 bars
      // Shorter than ref but within genre range
      const result = generateSuggestion("Drop", 48, 64, -25, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("within genre norms");
      expect(result!).toContain("shorter");
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("case-insensitive label matching", () => {
    it("matches section labels case-insensitively", () => {
      const profile = makeGenreProfile([
        {
          name: "Intro",
          lengthRange: { min: 4, max: 8 },
          energyRange: { min: 0.1, max: 0.4 },
          optional: false,
        },
      ]);

      // "INTRO" should match "Intro" template
      // User: 48 beats = 12 bars, exceeds genre max of 8
      const result = generateSuggestion("INTRO", 48, 32, 50, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("exceeds both reference and genre norm");
    });

    it("matches lowercase label to mixed-case template", () => {
      const profile = makeGenreProfile([
        {
          name: "Breakdown",
          lengthRange: { min: 8, max: 16 },
          energyRange: { min: 0.2, max: 0.5 },
          optional: false,
        },
      ]);

      // "breakdown" matches "Breakdown" → shorter but within range
      // User: 40 beats = 10 bars (within 8–16), ref: 64 beats = 16 bars
      const result = generateSuggestion("breakdown", 40, 64, -37.5, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("within genre norms");
    });
  });

  describe("suggestion length constraints", () => {
    it("all suggestions are ≤ 280 characters", () => {
      const profile = makeGenreProfile([
        {
          name: "VeryLongSectionNameThatMightCauseLongSuggestions",
          lengthRange: { min: 2, max: 4 },
          energyRange: { min: 0.1, max: 0.3 },
          optional: false,
        },
      ]);

      const result = generateSuggestion(
        "VeryLongSectionNameThatMightCauseLongSuggestions",
        200,
        32,
        525,
        profile,
      );
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(280);
    });

    it("generic suggestion is ≤ 280 characters even with long labels", () => {
      const result = generateSuggestion(
        "MyVeryLongAndDescriptiveSectionLabel",
        200,
        32,
        525,
        null,
      );
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("longer than ref but within genre range", () => {
    it("notes within genre norms for longer sections inside range", () => {
      const profile = makeGenreProfile([
        {
          name: "Drop",
          lengthRange: { min: 8, max: 32 },
          energyRange: { min: 0.7, max: 1.0 },
          optional: false,
        },
      ]);

      // User: 80 beats = 20 bars (within 8–32), ref: 48 beats = 12 bars
      const result = generateSuggestion("Drop", 80, 48, 66.7, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("within genre norms");
      expect(result!).toContain("longer");
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("shorter than ref AND below genre min", () => {
    it("suggests extending for genre alignment", () => {
      const profile = makeGenreProfile([
        {
          name: "Drop",
          lengthRange: { min: 16, max: 32 },
          energyRange: { min: 0.7, max: 1.0 },
          optional: false,
        },
      ]);

      // User: 32 beats = 8 bars (below genre min of 16), ref: 64 beats
      const result = generateSuggestion("Drop", 32, 64, -50, profile);
      expect(result).not.toBeNull();
      expect(result!).toContain("below the genre minimum");
      expect(result!).toContain("extending");
      expect(result!.length).toBeLessThanOrEqual(280);
    });
  });

  describe("integration with computeComparison", () => {
    it("generates genre-contextual suggestions for matched sections with genre profile", () => {
      const profile = makeGenreProfile([
        {
          name: "Intro",
          lengthRange: { min: 4, max: 8 },
          energyRange: { min: 0.1, max: 0.4 },
          optional: false,
        },
        {
          name: "Drop",
          lengthRange: { min: 8, max: 32 },
          energyRange: { min: 0.7, max: 1.0 },
          optional: false,
        },
      ]);

      const userSections: UserSectionInput[] = [
        { startTime: 0, endTime: 32, energyScore: 3, label: "Intro" },
        { startTime: 32, endTime: 96, energyScore: 8, label: "Drop" },
      ];

      const referenceSections: ReferenceSection[] = [
        { label: "Intro", startTime: 0, endTime: 32, proportion: 0.25 },
        { label: "Main", startTime: 32, endTime: 80, proportion: 0.375 },
      ];

      const result = computeComparison(userSections, referenceSections, 96, 128, profile);
      expect(result).not.toBeNull();

      // Intro: 32 beats = 8 bars = exactly genre max. Same duration as ref → delta is 0 → null suggestion
      // (32-32)/32*100 = 0 → suggestion is null
      expect(result!.sectionDeltas[0].suggestion).toBeNull();

      // Drop: 64 beats = 16 bars (within genre 8-32), ref = 48 beats. Longer than ref, within genre range.
      const dropDelta = result!.sectionDeltas[1];
      expect(dropDelta.suggestion).not.toBeNull();
      expect(dropDelta.suggestion!).toContain("within genre norms");
    });

    it("generates null suggestion for unmatched sections even with genre profile", () => {
      const profile = makeGenreProfile([
        {
          name: "Intro",
          lengthRange: { min: 4, max: 8 },
          energyRange: { min: 0.1, max: 0.4 },
          optional: false,
        },
      ]);

      const userSections: UserSectionInput[] = [
        { startTime: 0, endTime: 32, energyScore: 3, label: "Intro" },
        { startTime: 32, endTime: 64, energyScore: 5, label: "Extra" },
      ];

      const referenceSections: ReferenceSection[] = [
        { label: "Intro", startTime: 0, endTime: 32, proportion: 1.0 },
      ];

      const result = computeComparison(userSections, referenceSections, 64, 32, profile);
      expect(result).not.toBeNull();

      // Extra section is unmatched → suggestion must be null (Req 10.7)
      expect(result!.sectionDeltas[1].matched).toBe(false);
      expect(result!.sectionDeltas[1].suggestion).toBeNull();
    });
  });
});

// ─── Property-Based Tests ──────────────────────────────────────────────────────

import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import type { GenreProfile, SectionTemplate } from "./genre-profile-types.js";

/**
 * Property-based tests for Structural Comparator (M7).
 *
 * Feature: m7-reference-tracks
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

// ─── Generators ────────────────────────────────────────────────────────────────

/** Generate a valid UserSectionInput with startTime < endTime. */
const arbUserSection = fc
  .record({
    startTime: fc.integer({ min: 0, max: 500 }),
    duration: fc.integer({ min: 1, max: 200 }),
    energyScore: fc.float({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
    label: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,19}$/),
  })
  .map((s) => ({
    startTime: s.startTime,
    endTime: s.startTime + s.duration,
    energyScore: s.energyScore,
    label: s.label,
  }));

/** Generate a valid ReferenceSection with startTime < endTime. */
const arbReferenceSection = fc
  .record({
    startTime: fc.integer({ min: 0, max: 500 }),
    duration: fc.integer({ min: 1, max: 200 }),
    proportion: fc.float({ min: Math.fround(0.01), max: 1, noNaN: true, noDefaultInfinity: true }),
    label: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,19}$/),
  })
  .map((s) => ({
    label: s.label,
    startTime: s.startTime,
    endTime: s.startTime + s.duration,
    proportion: s.proportion,
  }));

/** Generate a non-empty array of UserSectionInputs. */
const arbUserSections = fc.array(arbUserSection, { minLength: 1, maxLength: 8 });

/** Generate a non-empty array of ReferenceSections. */
const arbReferenceSections = fc.array(arbReferenceSection, { minLength: 1, maxLength: 8 });

/** Generate a positive total duration. */
const arbTotalDuration = fc.integer({ min: 1, max: 1000 });

/** Generate a SectionTemplate for genre profile tests. */
const arbSectionTemplate = (name: string): fc.Arbitrary<SectionTemplate> =>
  fc
    .record({
      min: fc.integer({ min: 1, max: 16 }),
      maxOffset: fc.integer({ min: 1, max: 64 }),
      energyMin: fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
      energyMax: fc.float({ min: 5, max: 10, noNaN: true, noDefaultInfinity: true }),
    })
    .map(({ min, maxOffset, energyMin, energyMax }) => ({
      name,
      lengthRange: { min, max: min + maxOffset },
      energyRange: { min: energyMin, max: energyMax },
      optional: false,
    }));

/** Generate a minimal GenreProfile with the specified section templates. */
const arbGenreProfile = (templateNames: string[]): fc.Arbitrary<GenreProfile> =>
  fc
    .tuple(...templateNames.map((name) => arbSectionTemplate(name)))
    .map((templates) => ({
      id: "test-genre",
      name: "Test Genre",
      family: "electronic",
      tempoRange: { min: 120, max: 140 },
      structure: templates,
      energyCurveTemplate: [3, 5, 8, 7, 4],
      transitions: {
        preferred: ["filter-sweep"],
        discouraged: ["hard-cut"],
        buildDurationRange: { min: 4, max: 16 },
        dropsExpected: true,
      },
      energyWeights: {
        trackCountWeight: 0.2,
        midiDensityWeight: 0.2,
        audioPresenceWeight: 0.2,
        automationWeight: 0.2,
        frequencyCoverageWeight: 0.2,
      },
      detectionRules: [],
      detectionThresholds: {
        flatEnergyMaxDelta: 1.5,
        missingTransitionMinDelta: 3.0,
        similarityCeilingPercent: 80,
      },
    }));

// ─── Property 8: Per-section deltas are correctly computed for matched pairs ───

describe("Feature: m7-reference-tracks, Property 8: Per-section deltas are correctly computed for matched pairs", () => {
  fcTest.prop(
    [arbUserSections, arbReferenceSections, arbTotalDuration, arbTotalDuration],
    { numRuns: 100 },
  )(
    "sections matched by ordinal position have correct proportionDelta, timingDelta, durationDeltaBeats, durationDeltaPercent",
    (userSections, referenceSections, userTotal, refTotal) => {
      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        null,
      );

      expect(result).not.toBeNull();
      const matchedCount = Math.min(userSections.length, referenceSections.length);

      for (let i = 0; i < matchedCount; i++) {
        const delta = result!.sectionDeltas[i]!;
        const user = userSections[i]!;
        const ref = referenceSections[i]!;

        expect(delta.matched).toBe(true);

        // proportionDelta = user proportion − reference proportion
        const userDuration = user.endTime - user.startTime;
        const userProportion = userTotal > 0 ? userDuration / userTotal : 0;
        const expectedProportionDelta = userProportion - ref.proportion;
        expect(delta.proportionDelta).toBeCloseTo(expectedProportionDelta, 4);

        // timingDelta = (user start / user total) − (ref start / ref total)
        const userStartProp = userTotal > 0 ? user.startTime / userTotal : 0;
        const refStartProp = refTotal > 0 ? ref.startTime / refTotal : 0;
        const expectedTimingDelta = userStartProp - refStartProp;
        expect(delta.timingDelta).toBeCloseTo(expectedTimingDelta, 4);

        // durationDeltaBeats = user duration − ref duration
        const refDuration = ref.endTime - ref.startTime;
        const expectedDurationDeltaBeats = userDuration - refDuration;
        expect(delta.durationDeltaBeats).toBeCloseTo(expectedDurationDeltaBeats, 4);

        // durationDeltaPercent = ((user duration − ref duration) / ref duration) × 100
        // (or null if ref duration is zero)
        if (refDuration === 0) {
          expect(delta.durationDeltaPercent).toBeNull();
        } else {
          const expectedPercent = ((userDuration - refDuration) / refDuration) * 100;
          expect(delta.durationDeltaPercent).toBeCloseTo(expectedPercent, 4);
        }
      }
    },
  );
});

// ─── Property 9: Unmatched sections are correctly identified ───────────────────

describe("Feature: m7-reference-tracks, Property 9: Unmatched sections are correctly identified", () => {
  fcTest.prop(
    [arbUserSections, arbReferenceSections, arbTotalDuration, arbTotalDuration],
    { numRuns: 100 },
  )(
    "extra sections beyond the shorter array's length are marked as matched: false with null deltas",
    (userSections, referenceSections, userTotal, refTotal) => {
      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        null,
      );

      expect(result).not.toBeNull();
      const matchedCount = Math.min(userSections.length, referenceSections.length);
      const totalDeltas = Math.max(userSections.length, referenceSections.length);

      expect(result!.sectionDeltas).toHaveLength(totalDeltas);

      // Check matched sections are marked true
      for (let i = 0; i < matchedCount; i++) {
        expect(result!.sectionDeltas[i]!.matched).toBe(true);
      }

      // Check unmatched sections beyond the shorter array's length
      for (let i = matchedCount; i < totalDeltas; i++) {
        const delta = result!.sectionDeltas[i]!;
        expect(delta.matched).toBe(false);
        expect(delta.proportionDelta).toBeNull();
        expect(delta.timingDelta).toBeNull();
        expect(delta.durationDeltaBeats).toBeNull();
        expect(delta.durationDeltaPercent).toBeNull();
      }
    },
  );
});

// ─── Property 10: Aggregate metrics follow defined formulas ────────────────────

describe("Feature: m7-reference-tracks, Property 10: Aggregate metrics follow defined formulas", () => {
  fcTest.prop(
    [arbUserSections, arbReferenceSections, arbTotalDuration, arbTotalDuration],
    { numRuns: 100 },
  )(
    "totalDurationDifference, sectionCountDifference, and peakPositionDifference follow the defined formulas",
    (userSections, referenceSections, userTotal, refTotal) => {
      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        null,
      );

      expect(result).not.toBeNull();
      const agg = result!.aggregateMetrics;

      // totalDurationDifference = user total beats − reference total beats
      expect(agg.totalDurationDifference).toBeCloseTo(userTotal - refTotal, 4);

      // sectionCountDifference = user count − reference count
      expect(agg.sectionCountDifference).toBe(
        userSections.length - referenceSections.length,
      );

      // peakPositionDifference = midpoint proportion of user's highest-energy section
      //   − midpoint proportion of reference's longest section
      const userHighest = userSections.reduce((best, cur) =>
        cur.energyScore > best.energyScore ? cur : best,
      );
      const userMidpoint = (userHighest.startTime + userHighest.endTime) / 2;
      const userPeakProp = userTotal > 0 ? userMidpoint / userTotal : 0;

      const refLongest = referenceSections.reduce((best, cur) => {
        const bestDur = best.endTime - best.startTime;
        const curDur = cur.endTime - cur.startTime;
        return curDur > bestDur ? cur : best;
      });
      const refMidpoint = (refLongest.startTime + refLongest.endTime) / 2;
      const refPeakProp = refTotal > 0 ? refMidpoint / refTotal : 0;

      expect(agg.peakPositionDifference).toBeCloseTo(
        userPeakProp - refPeakProp,
        4,
      );
    },
  );
});

// ─── Property 17: Suggestion length constraints ────────────────────────────────

describe("Feature: m7-reference-tracks, Property 17: Suggestion length constraints", () => {
  fcTest.prop(
    [arbUserSections, arbReferenceSections, arbTotalDuration, arbTotalDuration],
    { numRuns: 100 },
  )(
    "generated suggestion string contains no more than 2 sentences and no more than 280 characters (null genre profile)",
    (userSections, referenceSections, userTotal, refTotal) => {
      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        null,
      );

      expect(result).not.toBeNull();
      for (const delta of result!.sectionDeltas) {
        if (delta.suggestion !== null) {
          // ≤ 280 characters
          expect(delta.suggestion.length).toBeLessThanOrEqual(280);

          // ≤ 2 sentences (count periods, exclamation marks, question marks that end sentences)
          const sentenceEnders = delta.suggestion.match(/[.!?]\s|[.!?]$/g) ?? [];
          expect(sentenceEnders.length).toBeLessThanOrEqual(2);
        }
      }
    },
  );

  fcTest.prop(
    [
      fc.tuple(arbUserSections, arbReferenceSections, arbTotalDuration, arbTotalDuration).chain(
        ([users, refs]) => {
          // Build a genre profile whose templates match user labels
          const labels = [...new Set(users.map((u) => u.label))];
          return arbGenreProfile(labels.length > 0 ? labels : ["Intro"]).map(
            (profile) => ({ users, refs, profile }),
          );
        },
      ),
      arbTotalDuration,
      arbTotalDuration,
    ],
    { numRuns: 100 },
  )(
    "generated suggestion string contains no more than 2 sentences and no more than 280 characters (with genre profile)",
    ({ users, refs, profile }, userTotal, refTotal) => {
      const result = computeComparison(users, refs, userTotal, refTotal, profile);

      expect(result).not.toBeNull();
      for (const delta of result!.sectionDeltas) {
        if (delta.suggestion !== null) {
          // ≤ 280 characters
          expect(delta.suggestion.length).toBeLessThanOrEqual(280);

          // ≤ 2 sentences
          const sentenceEnders = delta.suggestion.match(/[.!?]\s|[.!?]$/g) ?? [];
          expect(sentenceEnders.length).toBeLessThanOrEqual(2);
        }
      }
    },
  );
});

// ─── Property 18: Genre-contextual suggestion correctness ──────────────────────

describe("Feature: m7-reference-tracks, Property 18: Genre-contextual suggestion correctness", () => {
  fcTest.prop(
    [
      // Generate user section with a known label, ref section, and genre profile
      // where user section exceeds BOTH ref and genre max
      fc
        .record({
          label: fc.stringMatching(/^[A-Z][a-z]{2,9}$/),
          genreMin: fc.integer({ min: 1, max: 8 }),
          genreMaxOffset: fc.integer({ min: 1, max: 16 }),
          refDurationBars: fc.integer({ min: 4, max: 32 }),
        })
        .chain(({ label, genreMin, genreMaxOffset, refDurationBars }) => {
          const genreMax = genreMin + genreMaxOffset;
          // User duration must exceed both ref and genre max (in bars)
          const userMinBars = Math.max(refDurationBars + 1, genreMax + 1);
          return fc
            .integer({ min: userMinBars, max: userMinBars + 50 })
            .map((userBars) => ({
              label,
              genreMin,
              genreMax,
              refDurationBeats: refDurationBars * 4,
              userDurationBeats: userBars * 4,
            }));
        }),
    ],
    { numRuns: 100 },
  )(
    "if user section exceeds both ref and genre max, suggestion contains 'exceeds both reference and genre norm'",
    ({ label, genreMin, genreMax, refDurationBeats, userDurationBeats }) => {
      const userSections: UserSectionInput[] = [
        { startTime: 0, endTime: userDurationBeats, energyScore: 5, label },
      ];
      const referenceSections: ReferenceSection[] = [
        {
          label: "Ref",
          startTime: 0,
          endTime: refDurationBeats,
          proportion: 1.0,
        },
      ];
      const profile: GenreProfile = {
        id: "test",
        name: "Test",
        family: "electronic",
        tempoRange: { min: 120, max: 140 },
        structure: [
          {
            name: label,
            lengthRange: { min: genreMin, max: genreMax },
            energyRange: { min: 0, max: 10 },
            optional: false,
          },
        ],
        energyCurveTemplate: [5],
        transitions: {
          preferred: [],
          discouraged: [],
          buildDurationRange: { min: 4, max: 16 },
          dropsExpected: false,
        },
        energyWeights: {
          trackCountWeight: 0.2,
          midiDensityWeight: 0.2,
          audioPresenceWeight: 0.2,
          automationWeight: 0.2,
          frequencyCoverageWeight: 0.2,
        },
        detectionRules: [],
        detectionThresholds: {
          flatEnergyMaxDelta: 1.5,
          missingTransitionMinDelta: 3,
          similarityCeilingPercent: 80,
        },
      };

      const result = computeComparison(
        userSections,
        referenceSections,
        userDurationBeats,
        refDurationBeats,
        profile,
      );

      expect(result).not.toBeNull();
      const suggestion = result!.sectionDeltas[0]!.suggestion;
      expect(suggestion).not.toBeNull();
      expect(suggestion!).toContain("exceeds both reference and genre norm");
    },
  );

  fcTest.prop(
    [
      // Generate a case where user is shorter than ref but within genre range
      fc
        .record({
          label: fc.stringMatching(/^[A-Z][a-z]{2,9}$/),
          genreMin: fc.integer({ min: 2, max: 8 }),
          genreMaxOffset: fc.integer({ min: 8, max: 32 }),
        })
        .chain(({ label, genreMin, genreMaxOffset }) => {
          const genreMax = genreMin + genreMaxOffset;
          // User bars within range, ref bars larger than user
          return fc
            .integer({ min: genreMin, max: genreMax })
            .chain((userBars) =>
              fc
                .integer({ min: userBars + 1, max: userBars + 50 })
                .map((refBars) => ({
                  label,
                  genreMin,
                  genreMax,
                  userDurationBeats: userBars * 4,
                  refDurationBeats: refBars * 4,
                })),
            );
        }),
    ],
    { numRuns: 100 },
  )(
    "if shorter than ref but within genre range, suggestion notes within genre norms",
    ({ label, genreMin, genreMax, userDurationBeats, refDurationBeats }) => {
      const userSections: UserSectionInput[] = [
        { startTime: 0, endTime: userDurationBeats, energyScore: 5, label },
      ];
      const referenceSections: ReferenceSection[] = [
        {
          label: "Ref",
          startTime: 0,
          endTime: refDurationBeats,
          proportion: 1.0,
        },
      ];
      const profile: GenreProfile = {
        id: "test",
        name: "Test",
        family: "electronic",
        tempoRange: { min: 120, max: 140 },
        structure: [
          {
            name: label,
            lengthRange: { min: genreMin, max: genreMax },
            energyRange: { min: 0, max: 10 },
            optional: false,
          },
        ],
        energyCurveTemplate: [5],
        transitions: {
          preferred: [],
          discouraged: [],
          buildDurationRange: { min: 4, max: 16 },
          dropsExpected: false,
        },
        energyWeights: {
          trackCountWeight: 0.2,
          midiDensityWeight: 0.2,
          audioPresenceWeight: 0.2,
          automationWeight: 0.2,
          frequencyCoverageWeight: 0.2,
        },
        detectionRules: [],
        detectionThresholds: {
          flatEnergyMaxDelta: 1.5,
          missingTransitionMinDelta: 3,
          similarityCeilingPercent: 80,
        },
      };

      const result = computeComparison(
        userSections,
        referenceSections,
        userDurationBeats,
        refDurationBeats,
        profile,
      );

      expect(result).not.toBeNull();
      const suggestion = result!.sectionDeltas[0]!.suggestion;
      expect(suggestion).not.toBeNull();
      expect(suggestion!.toLowerCase()).toContain("genre norms");
    },
  );

  fcTest.prop(
    [
      // Generate a case where label doesn't match any template
      fc
        .record({
          userLabel: fc.stringMatching(/^[A-Z][a-z]{2,9}$/),
          templateLabel: fc.stringMatching(/^[A-Z][a-z]{2,9}$/),
        })
        .filter(({ userLabel, templateLabel }) => userLabel.toLowerCase() !== templateLabel.toLowerCase()),
      fc.integer({ min: 8, max: 100 }),
      fc.integer({ min: 8, max: 100 }),
    ],
    { numRuns: 100 },
  )(
    "if label doesn't match template, suggestion is generic (no genre-specific length references)",
    ({ userLabel, templateLabel }, userBars, refBars) => {
      // Ensure there's an actual delta so a suggestion is generated
      const userDurationBeats = userBars * 4;
      const refDurationBeats = refBars * 4;

      // Skip when durations are equal (no suggestion generated)
      if (userDurationBeats === refDurationBeats) return;

      const userSections: UserSectionInput[] = [
        { startTime: 0, endTime: userDurationBeats, energyScore: 5, label: userLabel },
      ];
      const referenceSections: ReferenceSection[] = [
        {
          label: "Ref",
          startTime: 0,
          endTime: refDurationBeats,
          proportion: 1.0,
        },
      ];
      const profile: GenreProfile = {
        id: "test",
        name: "Test",
        family: "electronic",
        tempoRange: { min: 120, max: 140 },
        structure: [
          {
            name: templateLabel,
            lengthRange: { min: 4, max: 32 },
            energyRange: { min: 0, max: 10 },
            optional: false,
          },
        ],
        energyCurveTemplate: [5],
        transitions: {
          preferred: [],
          discouraged: [],
          buildDurationRange: { min: 4, max: 16 },
          dropsExpected: false,
        },
        energyWeights: {
          trackCountWeight: 0.2,
          midiDensityWeight: 0.2,
          audioPresenceWeight: 0.2,
          automationWeight: 0.2,
          frequencyCoverageWeight: 0.2,
        },
        detectionRules: [],
        detectionThresholds: {
          flatEnergyMaxDelta: 1.5,
          missingTransitionMinDelta: 3,
          similarityCeilingPercent: 80,
        },
      };

      const result = computeComparison(
        userSections,
        referenceSections,
        userDurationBeats,
        refDurationBeats,
        profile,
      );

      expect(result).not.toBeNull();
      const suggestion = result!.sectionDeltas[0]!.suggestion;
      expect(suggestion).not.toBeNull();
      // Generic suggestion should NOT contain genre-specific range references
      expect(suggestion!).not.toMatch(/genre norm/i);
      expect(suggestion!).not.toMatch(/genre min/i);
      expect(suggestion!).not.toMatch(/genre max/i);
      // But should contain generic advice about engagement
      expect(suggestion!).toContain("listener engagement");
    },
  );

  fcTest.prop(
    [arbUserSections, arbReferenceSections, arbTotalDuration, arbTotalDuration],
    { numRuns: 100 },
  )(
    "if genre profile is null, all suggestions are generic (no genre references)",
    (userSections, referenceSections, userTotal, refTotal) => {
      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        null,
      );

      expect(result).not.toBeNull();
      for (const delta of result!.sectionDeltas) {
        if (delta.suggestion !== null) {
          // Generic suggestions should not reference genre norms
          expect(delta.suggestion).not.toMatch(/genre norm/i);
          expect(delta.suggestion).not.toMatch(/genre min/i);
          expect(delta.suggestion).not.toMatch(/genre max/i);
          expect(delta.suggestion).not.toMatch(/genre range/i);
        }
      }
    },
  );
});

// ─── Property 19: Unmatched sections receive no suggestion ─────────────────────

describe("Feature: m7-reference-tracks, Property 19: Unmatched sections receive no suggestion", () => {
  fcTest.prop(
    [
      // Generate cases where user and ref section counts differ
      arbUserSections,
      arbReferenceSections,
      arbTotalDuration,
      arbTotalDuration,
    ],
    { numRuns: 100 },
  )(
    "unmatched sections have suggestion = null",
    (userSections, referenceSections, userTotal, refTotal) => {
      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        null,
      );

      expect(result).not.toBeNull();

      for (const delta of result!.sectionDeltas) {
        if (!delta.matched) {
          expect(delta.suggestion).toBeNull();
        }
      }
    },
  );

  fcTest.prop(
    [
      // Ensure we always have unmatched sections by making arrays different lengths
      fc.tuple(
        fc.array(arbUserSection, { minLength: 3, maxLength: 8 }),
        fc.array(arbReferenceSection, { minLength: 1, maxLength: 2 }),
      ),
      arbTotalDuration,
      arbTotalDuration,
    ],
    { numRuns: 100 },
  )(
    "extra user sections beyond matched count always have suggestion = null (with genre profile)",
    ([userSections, referenceSections], userTotal, refTotal) => {
      // Create a genre profile that matches user labels
      const labels = [...new Set(userSections.map((u) => u.label))];
      const profile: GenreProfile = {
        id: "test",
        name: "Test",
        family: "electronic",
        tempoRange: { min: 120, max: 140 },
        structure: labels.map((name) => ({
          name,
          lengthRange: { min: 4, max: 32 },
          energyRange: { min: 0, max: 10 },
          optional: false,
        })),
        energyCurveTemplate: [5],
        transitions: {
          preferred: [],
          discouraged: [],
          buildDurationRange: { min: 4, max: 16 },
          dropsExpected: false,
        },
        energyWeights: {
          trackCountWeight: 0.2,
          midiDensityWeight: 0.2,
          audioPresenceWeight: 0.2,
          automationWeight: 0.2,
          frequencyCoverageWeight: 0.2,
        },
        detectionRules: [],
        detectionThresholds: {
          flatEnergyMaxDelta: 1.5,
          missingTransitionMinDelta: 3,
          similarityCeilingPercent: 80,
        },
      };

      const result = computeComparison(
        userSections,
        referenceSections,
        userTotal,
        refTotal,
        profile,
      );

      expect(result).not.toBeNull();
      const matchedCount = Math.min(userSections.length, referenceSections.length);

      // Extra user sections beyond matched count should have null suggestion
      for (let i = matchedCount; i < result!.sectionDeltas.length; i++) {
        expect(result!.sectionDeltas[i]!.matched).toBe(false);
        expect(result!.sectionDeltas[i]!.suggestion).toBeNull();
      }
    },
  );
});
