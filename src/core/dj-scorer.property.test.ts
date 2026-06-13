/**
 * Property-based tests for the DJ Compatibility Scorer module.
 *
 * Feature: m8-polish
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import fc from "fast-check";
import type { Section } from "./section-scanner.js";

// ─── Mock Genre Registry ───────────────────────────────────────────────

// We mock the genre registry so we can control which profiles are returned
// without relying on the full profile set.
vi.mock("./genre-registry.js", () => ({
  getProfile: (id: string) => {
    if (id === "ambient-downtempo") {
      return { id: "ambient-downtempo", name: "Ambient & Downtempo", family: "ambient-downtempo" };
    }
    if (id === "film-score") {
      return { id: "film-score", name: "Film Score", family: "film-score" };
    }
    if (id === "techno") {
      return { id: "techno", name: "Techno", family: "techno" };
    }
    if (id === "house") {
      return { id: "house", name: "House", family: "house" };
    }
    if (id === "trance") {
      return { id: "trance", name: "Trance", family: "trance" };
    }
    if (id === "drum-and-bass") {
      return { id: "drum-and-bass", name: "Drum & Bass", family: "drum-and-bass" };
    }
    return null;
  },
  getProfileBySubgenre: () => null,
}));

import { computeDjScore } from "./dj-scorer.js";

// ─── Generators ────────────────────────────────────────────────────────

/** DJ-oriented genre IDs (non-ambient, non-film-score families). */
const djGenreArbitrary = fc.constantFrom("techno", "house", "trance", "drum-and-bass");

/** Non-DJ genre IDs that should produce inapplicable results. */
const nonDjGenreArbitrary = fc.constantFrom("ambient-downtempo", "film-score");

/** Generate a section with a specific bar length at a given start position (in beats). */
function makeSection(id: string, name: string, startBeats: number, bars: number): Section {
  return {
    id,
    name,
    startTime: startBeats,
    endTime: startBeats + bars * 4, // 4 beats per bar
  };
}

/** Generate a section starting at a specific beat with a given bar length. */
const sectionWithBarsArbitrary = (
  index: number,
  startBeats: number,
  minBars: number,
  maxBars: number,
): fc.Arbitrary<Section> =>
  fc.integer({ min: minBars, max: maxBars }).map((bars) => ({
    id: `section-${index}`,
    name: `Section ${index}`,
    startTime: startBeats,
    endTime: startBeats + bars * 4,
  }));

/** Generate a valid arrangement (2+ sections, contiguous). */
const arrangementArbitrary = (sectionCount: number): fc.Arbitrary<Section[]> =>
  fc.array(
    fc.integer({ min: 4, max: 64 }), // bar lengths
    { minLength: sectionCount, maxLength: sectionCount },
  ).map((barLengths) => {
    const sections: Section[] = [];
    let currentBeat = 0;
    for (let i = 0; i < barLengths.length; i++) {
      sections.push({
        id: `section-${i}`,
        name: `Section ${i}`,
        startTime: currentBeat,
        endTime: currentBeat + barLengths[i]! * 4,
      });
      currentBeat += barLengths[i]! * 4;
    }
    return sections;
  });

/** Generate energy curve (values 1–10). */
const energyCurveArbitrary = (length: number): fc.Arbitrary<number[]> =>
  fc.array(fc.integer({ min: 1, max: 10 }), { minLength: length, maxLength: length });

// ─── Property 1: DJ score total equals weighted sum of components ──────

// Feature: m8-polish, Property 1: DJ score total equals weighted sum of components
describe("Property 1: DJ score total equals weighted sum of components", () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   *
   * For any valid DjScoreInput with a DJ genre, the totalScore returned by
   * computeDjScore SHALL equal the sum of each component's weighted value
   * (score × weight), rounded to the nearest integer, and clamped to 0–100.
   */

  test.prop(
    [
      fc.integer({ min: 2, max: 8 }), // section count
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "totalScore equals Math.round(sum of component.weighted) clamped to [0, 100]",
    (sectionCount, genreId) => {
      // Generate a fixed arrangement for the given section count
      const sections: Section[] = [];
      let currentBeat = 0;
      for (let i = 0; i < sectionCount; i++) {
        const bars = 16 + i * 4; // varying lengths
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentBeat,
          endTime: currentBeat + bars * 4,
        });
        currentBeat += bars * 4;
      }

      const energyCurve = sections.map((_, i) => Math.min(10, Math.max(1, 3 + i)));

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);

      // Verify total equals the rounded sum of weighted components
      const weightedSum = result.components.reduce((sum, c) => sum + c.weighted, 0);
      const expectedTotal = Math.min(100, Math.max(0, Math.round(weightedSum)));

      expect(result.totalScore).toBe(expectedTotal);
    },
  );

  test.prop(
    [
      fc.integer({ min: 2, max: 6 }),
      fc.array(fc.integer({ min: 4, max: 64 }), { minLength: 2, maxLength: 6 }),
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "totalScore equals weighted sum for random arrangements",
    (_, barLengths, genreId) => {
      fc.pre(barLengths.length >= 2);

      const sections: Section[] = [];
      let currentBeat = 0;
      for (let i = 0; i < barLengths.length; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentBeat,
          endTime: currentBeat + barLengths[i]! * 4,
        });
        currentBeat += barLengths[i]! * 4;
      }

      const energyCurve = barLengths.map(() => Math.floor(Math.random() * 10) + 1);

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);

      const weightedSum = result.components.reduce((sum, c) => sum + c.weighted, 0);
      const expectedTotal = Math.min(100, Math.max(0, Math.round(weightedSum)));

      expect(result.totalScore).toBe(expectedTotal);
    },
  );
});

// ─── Property 2: Intro component follows bar-length formula ────────────

// Feature: m8-polish, Property 2: Intro component follows bar-length formula
describe("Property 2: Intro component follows bar-length formula", () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any arrangement where the first section has a known bar length, the
   * intro component score SHALL be: 0 when < 16 bars, 50 when exactly 16 bars,
   * 100 when ≥ 32 bars, and linearly interpolated between 16 and 32 bars.
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 100 }), // intro bars
      fc.integer({ min: 16, max: 64 }), // outro bars (keep valid to avoid interference)
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "intro score is 0 when < 16 bars, 50 at 16, 100 at >= 32, linear in between",
    (introBars, outroBars, genreId) => {
      const introSection = makeSection("section-0", "Intro", 0, introBars);
      const outroSection = makeSection("section-1", "Outro", introBars * 4, outroBars);
      const sections = [introSection, outroSection];
      const energyCurve = [2, 2]; // low energy to avoid energy penalties

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);
      const introComponent = result.components.find((c) => c.name === "Intro Length");
      expect(introComponent).toBeDefined();

      // Verify the formula
      let expectedScore: number;
      if (introBars < 16) {
        expectedScore = 0;
      } else if (introBars >= 32) {
        expectedScore = 100;
      } else {
        // Linear interpolation between 16 bars (50) and 32 bars (100)
        expectedScore = ((introBars - 16) / 16) * 50 + 50;
      }

      expect(introComponent!.score).toBeCloseTo(expectedScore, 5);
    },
  );
});

// ─── Property 3: Outro component follows bar-length formula ────────────

// Feature: m8-polish, Property 3: Outro component follows bar-length formula
describe("Property 3: Outro component follows bar-length formula", () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * For any arrangement where the last section has a known bar length, the
   * outro component score SHALL be: 0 when < 16 bars, 50 when exactly 16 bars,
   * 100 when ≥ 32 bars, and linearly interpolated between 16 and 32 bars.
   */

  test.prop(
    [
      fc.integer({ min: 16, max: 64 }), // intro bars (keep valid to avoid interference)
      fc.integer({ min: 1, max: 100 }), // outro bars
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "outro score is 0 when < 16 bars, 50 at 16, 100 at >= 32, linear in between",
    (introBars, outroBars, genreId) => {
      const introSection = makeSection("section-0", "Intro", 0, introBars);
      const outroSection = makeSection("section-1", "Outro", introBars * 4, outroBars);
      const sections = [introSection, outroSection];
      const energyCurve = [2, 2]; // low energy to avoid energy penalties

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);
      const outroComponent = result.components.find((c) => c.name === "Outro Length");
      expect(outroComponent).toBeDefined();

      // Verify the formula
      let expectedScore: number;
      if (outroBars < 16) {
        expectedScore = 0;
      } else if (outroBars >= 32) {
        expectedScore = 100;
      } else {
        // Linear interpolation between 16 bars (50) and 32 bars (100)
        expectedScore = ((outroBars - 16) / 16) * 50 + 50;
      }

      expect(outroComponent!.score).toBeCloseTo(expectedScore, 5);
    },
  );
});

// ─── Property 4: Phrase alignment scoring is proportional ──────────────

// Feature: m8-polish, Property 4: Phrase alignment scoring is proportional
describe("Property 4: Phrase alignment scoring is proportional", () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any arrangement with N sections where M sections start on a phrase
   * boundary, the phrase alignment component score SHALL equal
   * Math.round((M / N) * 100).
   */

  test.prop(
    [
      fc.integer({ min: 2, max: 8 }), // total section count
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "phrase alignment score equals Math.round((alignedCount / totalSections) * 100)",
    (sectionCount, genreId) => {
      // Build sections with controlled phrase alignment
      // Phrase boundary: (startBar - 1) % 8 === 0, where startBar = Math.round(startTime / 4) + 1
      // So startTime needs to be: (8k) * 4 = 32k for any non-negative integer k
      // (startBar = Math.round(32k / 4) + 1 = 8k + 1, (8k + 1 - 1) % 8 = 0)
      const sections: Section[] = [];
      let currentBeat = 0;

      for (let i = 0; i < sectionCount; i++) {
        // All sections start on 8-bar boundaries (32 beats apart)
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentBeat,
          endTime: currentBeat + 32, // 8 bars each
        });
        currentBeat += 32;
      }

      const energyCurve = sections.map(() => 3);

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);

      // Count actually aligned sections using the same formula as the scorer
      let alignedCount = 0;
      for (const section of sections) {
        const startBar = Math.round(section.startTime / 4) + 1;
        if ((startBar - 1) % 8 === 0) {
          alignedCount++;
        }
      }

      const phraseComponent = result.components.find((c) => c.name === "Phrase Alignment");
      expect(phraseComponent).toBeDefined();

      const expectedScore = Math.round((alignedCount / sections.length) * 100);
      expect(phraseComponent!.score).toBe(expectedScore);
    },
  );

  test.prop(
    [
      fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }), // whether each section is aligned
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "mixed alignment: score matches the proportion of aligned sections",
    (alignmentFlags, genreId) => {
      fc.pre(alignmentFlags.length >= 2);

      const sections: Section[] = [];
      let currentBeat = 0;

      for (let i = 0; i < alignmentFlags.length; i++) {
        if (alignmentFlags[i]) {
          // Aligned: start on 8-bar boundary
          // Need (Math.round(currentBeat / 4) + 1 - 1) % 8 === 0
          // i.e. Math.round(currentBeat / 4) % 8 === 0
          // Snap currentBeat to nearest multiple of 32
          currentBeat = Math.ceil(currentBeat / 32) * 32;
        } else {
          // Misaligned: start off an 8-bar boundary
          // Ensure (Math.round(currentBeat / 4) + 1 - 1) % 8 !== 0
          const snapped = Math.ceil(currentBeat / 32) * 32;
          currentBeat = snapped + 4; // offset by 1 bar (4 beats)
        }

        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentBeat,
          endTime: currentBeat + 32,
        });
        currentBeat += 32;
      }

      const energyCurve = sections.map(() => 3);

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);

      // Count aligned sections using the scorer's formula
      let alignedCount = 0;
      for (const section of sections) {
        const startBar = Math.round(section.startTime / 4) + 1;
        if ((startBar - 1) % 8 === 0) {
          alignedCount++;
        }
      }

      const phraseComponent = result.components.find((c) => c.name === "Phrase Alignment");
      expect(phraseComponent).toBeDefined();

      const expectedScore = Math.round((alignedCount / sections.length) * 100);
      expect(phraseComponent!.score).toBe(expectedScore);
    },
  );
});

// ─── Property 5: Energy positioning penalty logic ──────────────────────

// Feature: m8-polish, Property 5: Energy positioning penalty logic
describe("Property 5: Energy positioning penalty logic", () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * For any arrangement where the first or last section has an energy score > 5,
   * the energy positioning component SHALL be less than 100. When both are ≤ 5,
   * the component SHALL be exactly 100.
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 5 }), // first energy ≤ 5
      fc.integer({ min: 1, max: 5 }), // last energy ≤ 5
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "energy positioning is 100 when both boundary energies are ≤ 5",
    (firstEnergy, lastEnergy, genreId) => {
      const introSection = makeSection("section-0", "Intro", 0, 32);
      const outroSection = makeSection("section-1", "Outro", 128, 32);
      const sections = [introSection, outroSection];
      const energyCurve = [firstEnergy, lastEnergy];

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);
      const energyComponent = result.components.find((c) => c.name === "Energy Positioning");
      expect(energyComponent).toBeDefined();
      expect(energyComponent!.score).toBe(100);
    },
  );

  test.prop(
    [
      fc.integer({ min: 6, max: 10 }), // first energy > 5
      fc.integer({ min: 1, max: 10 }), // any last energy
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "energy positioning is < 100 when first section energy is > 5",
    (firstEnergy, lastEnergy, genreId) => {
      const introSection = makeSection("section-0", "Intro", 0, 32);
      const outroSection = makeSection("section-1", "Outro", 128, 32);
      const sections = [introSection, outroSection];
      const energyCurve = [firstEnergy, lastEnergy];

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);
      const energyComponent = result.components.find((c) => c.name === "Energy Positioning");
      expect(energyComponent).toBeDefined();
      expect(energyComponent!.score).toBeLessThan(100);
    },
  );

  test.prop(
    [
      fc.integer({ min: 1, max: 10 }), // any first energy
      fc.integer({ min: 6, max: 10 }), // last energy > 5
      djGenreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "energy positioning is < 100 when last section energy is > 5",
    (firstEnergy, lastEnergy, genreId) => {
      const introSection = makeSection("section-0", "Intro", 0, 32);
      const outroSection = makeSection("section-1", "Outro", 128, 32);
      const sections = [introSection, outroSection];
      const energyCurve = [firstEnergy, lastEnergy];

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);
      const energyComponent = result.components.find((c) => c.name === "Energy Positioning");
      expect(energyComponent).toBeDefined();
      expect(energyComponent!.score).toBeLessThan(100);
    },
  );
});

// ─── Property 6: Non-DJ genres produce inapplicable result ─────────────

// Feature: m8-polish, Property 6: Non-DJ genres produce inapplicable result
describe("Property 6: Non-DJ genres produce inapplicable result", () => {
  /**
   * **Validates: Requirements 7.8**
   *
   * For any genre profile with family "ambient" or "film-score",
   * computeDjScore SHALL return applicable: false.
   */

  test.prop(
    [
      nonDjGenreArbitrary,
      fc.integer({ min: 2, max: 6 }), // section count
    ],
    { numRuns: 100 },
  )(
    "non-DJ genres return applicable: false",
    (genreId, sectionCount) => {
      const sections: Section[] = [];
      let currentBeat = 0;
      for (let i = 0; i < sectionCount; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentBeat,
          endTime: currentBeat + 128,
        });
        currentBeat += 128;
      }

      const energyCurve = sections.map(() => 5);

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 120,
        genreId,
      });

      expect(result.applicable).toBe(false);
      expect(result.inapplicableReason).toBeDefined();
      expect(result.totalScore).toBe(0);
      expect(result.components).toHaveLength(0);
    },
  );

  test.prop(
    [djGenreArbitrary],
    { numRuns: 100 },
  )(
    "DJ genres return applicable: true (when sections exist)",
    (genreId) => {
      const sections = [
        makeSection("section-0", "Intro", 0, 32),
        makeSection("section-1", "Outro", 128, 32),
      ];
      const energyCurve = [3, 3];

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 128,
        genreId,
      });

      expect(result.applicable).toBe(true);
    },
  );

  test.prop(
    [fc.integer({ min: 2, max: 6 })],
    { numRuns: 100 },
  )(
    "null genre returns applicable: false",
    (sectionCount) => {
      const sections: Section[] = [];
      let currentBeat = 0;
      for (let i = 0; i < sectionCount; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentBeat,
          endTime: currentBeat + 128,
        });
        currentBeat += 128;
      }

      const energyCurve = sections.map(() => 5);

      const result = computeDjScore({
        sections,
        energyCurve,
        tempo: 120,
        genreId: null,
      });

      expect(result.applicable).toBe(false);
      expect(result.inapplicableReason).toBeDefined();
    },
  );
});
