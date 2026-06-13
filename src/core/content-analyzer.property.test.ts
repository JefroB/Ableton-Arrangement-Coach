/**
 * Property-based tests for content-analyzer.ts
 *
 * Feature: midi-content-analysis
 *
 * Validates: Requirements 1.1, 1.2, 4.1–4.8, 8.6
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { computePatternFingerprint, computeSimilarityScore, classifyInstrumentRole, detectPhraseLength, detectFills, detectBuilds, classifyPercussionPattern, comparePatternsAcrossSections, buildRepetitionSummary } from "./content-analyzer.js";
import type { NoteData } from "../ableton/sdk-adapter.js";
import type { PatternFingerprint, InstrumentRole, PercussionPatternResult, CrossSectionComparison, TrackRepetitionSummary } from "./content-analysis-types.js";

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/** Generate a valid NoteData object. */
function arbNoteData(minStart: number, maxStart: number): fc.Arbitrary<NoteData> {
  return fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    startTime: fc.double({ min: minStart, max: maxStart, noNaN: true }),
    duration: fc.double({ min: 0.01, max: 16, noNaN: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  });
}

/** Generate an array of valid NoteData within a given time range. */
function arbNoteArray(
  minLen: number,
  maxLen: number,
  minStart: number,
  maxStart: number,
): fc.Arbitrary<NoteData[]> {
  return fc.array(arbNoteData(minStart, maxStart), { minLength: minLen, maxLength: maxLen });
}

/** Generate valid section boundaries (sectionStart < sectionEnd). */
function arbSectionBounds(): fc.Arbitrary<{ sectionStart: number; sectionEnd: number }> {
  return fc
    .tuple(
      fc.double({ min: 0, max: 200, noNaN: true }),
      fc.double({ min: 1, max: 128, noNaN: true }),
    )
    .map(([start, length]) => ({
      sectionStart: start,
      sectionEnd: start + length,
    }));
}

// ─── Property 1: Fingerprint Validity ───────────────────────────────────

describe("Property 1: Fingerprint Validity", () => {
  test.prop(
    [arbSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        arbNoteArray(1, 50, sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "pitchClasses are all in range [0, 11]",
    ([notes, sectionStart, sectionEnd]) => {
      const fp = computePatternFingerprint(notes, sectionStart, sectionEnd);
      for (const pc of fp.pitchClasses) {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThanOrEqual(11);
      }
    },
  );

  test.prop(
    [arbSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        arbNoteArray(1, 50, sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "rhythmicPositions are all in range [0, 15]",
    ([notes, sectionStart, sectionEnd]) => {
      const fp = computePatternFingerprint(notes, sectionStart, sectionEnd);
      for (const pos of fp.rhythmicPositions) {
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThanOrEqual(15);
      }
    },
  );

  test.prop(
    [arbSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        arbNoteArray(1, 50, sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "velocityContour values are all in [0, 1]",
    ([notes, sectionStart, sectionEnd]) => {
      const fp = computePatternFingerprint(notes, sectionStart, sectionEnd);
      for (const v of fp.velocityContour) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    },
  );

  test.prop(
    [arbSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        arbNoteArray(1, 50, sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "density is >= 0",
    ([notes, sectionStart, sectionEnd]) => {
      const fp = computePatternFingerprint(notes, sectionStart, sectionEnd);
      expect(fp.density).toBeGreaterThanOrEqual(0);
    },
  );

  test.prop(
    [arbSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        arbNoteArray(1, 50, sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "barCount matches expected Math.ceil(sectionLength / 4)",
    ([notes, sectionStart, sectionEnd]) => {
      const fp = computePatternFingerprint(notes, sectionStart, sectionEnd);
      const expectedBarCount = Math.ceil((sectionEnd - sectionStart) / 4);
      expect(fp.barCount).toBe(expectedBarCount);
    },
  );
});


// ─── Property 2: Identical Pattern Similarity ────────────────────────────

/**
 * **Validates: Requirements 1.3, 5.2**
 *
 * When the same non-empty fingerprint is compared to itself, the similarity
 * score should be high (≥ 0.85). Requirement 1.3 states that two sections
 * containing the same repeating pattern shall produce a similarity score ≥ 0.85.
 * Self-comparison is the strongest form of this property.
 */
describe("Property 2: Identical Pattern Similarity", () => {
  /**
   * Generate a non-empty fingerprint by creating notes within a section,
   * computing the fingerprint, then comparing it to itself.
   */
  test.prop(
    [arbSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        arbNoteArray(1, 50, sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "self-comparison of a non-empty fingerprint yields similarity ≥ 0.85",
    ([notes, sectionStart, sectionEnd]) => {
      const fp = computePatternFingerprint(notes, sectionStart, sectionEnd);

      // Only test non-empty fingerprints (at least one note produces content)
      fc.pre(fp.pitchClasses.size > 0 || fp.rhythmicPositions.length > 0);

      const score = computeSimilarityScore(fp, fp);
      expect(score).toBeGreaterThanOrEqual(0.85);
    },
  );
});

// ─── Property 3: Distinct Pattern Dissimilarity ──────────────────────────

/**
 * **Validates: Requirements 1.4, 5.3**
 *
 * When two fingerprints have completely disjoint pitch classes AND completely
 * disjoint rhythmic positions, the similarity score should be below 0.5.
 * Requirement 1.4 states that musically distinct patterns shall produce a
 * similarity score below 0.5. Disjoint pitch classes and rhythmic positions
 * represent maximally distinct patterns.
 */
describe("Property 3: Distinct Pattern Dissimilarity", () => {
  /**
   * Generate two fingerprints with completely disjoint pitch classes
   * and rhythmic positions. We split the available pitch classes (0-11)
   * into two non-overlapping subsets, and similarly split rhythmic
   * positions (0-15) into two non-overlapping subsets.
   */
  function arbDisjointFingerprints(): fc.Arbitrary<[PatternFingerprint, PatternFingerprint]> {
    return fc.record({
      // Split pitch classes: first set gets some from [0..5], second gets some from [6..11]
      pitchesA: fc.uniqueArray(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 6 }),
      pitchesB: fc.uniqueArray(fc.integer({ min: 6, max: 11 }), { minLength: 1, maxLength: 6 }),
      // Split rhythmic positions: first set gets some from [0..7], second gets some from [8..15]
      rhythmsA: fc.uniqueArray(fc.integer({ min: 0, max: 7 }), { minLength: 1, maxLength: 8 }),
      rhythmsB: fc.uniqueArray(fc.integer({ min: 8, max: 15 }), { minLength: 1, maxLength: 8 }),
      // Velocity contours — different shapes to ensure low correlation
      barCount: fc.integer({ min: 2, max: 8 }),
      // Densities — make them very different
      densityA: fc.double({ min: 0.5, max: 2.0, noNaN: true }),
      densityB: fc.double({ min: 4.0, max: 8.0, noNaN: true }),
    }).map(({ pitchesA, pitchesB, rhythmsA, rhythmsB, barCount, densityA, densityB }) => {
      // Build velocity contours that are uncorrelated (ascending vs descending)
      const velContourA = Array.from({ length: barCount }, (_, i) => (i + 1) / barCount);
      const velContourB = Array.from({ length: barCount }, (_, i) => (barCount - i) / barCount);

      const fpA: PatternFingerprint = {
        pitchClasses: new Set(pitchesA),
        rhythmicPositions: rhythmsA.sort((a, b) => a - b),
        velocityContour: velContourA,
        density: densityA,
        barCount,
      };

      const fpB: PatternFingerprint = {
        pitchClasses: new Set(pitchesB),
        rhythmicPositions: rhythmsB.sort((a, b) => a - b),
        velocityContour: velContourB,
        density: densityB,
        barCount,
      };

      return [fpA, fpB] as [PatternFingerprint, PatternFingerprint];
    });
  }

  test.prop(
    [arbDisjointFingerprints()],
    { numRuns: 100 },
  )(
    "disjoint pitch classes and rhythmic positions yield similarity < 0.5",
    ([fpA, fpB]) => {
      const score = computeSimilarityScore(fpA, fpB);
      expect(score).toBeLessThan(0.5);
    },
  );
});


// ─── Property 8: Role Classification Validity ─────────────────────────────

/**
 * **Validates: Requirements 4.1–4.8**
 *
 * For any valid NoteData array and any track name, `classifyInstrumentRole`
 * always returns one of the valid InstrumentRole values: "drums", "bass",
 * "lead", "pad", "arpeggio", "chord", "unclassified".
 */
describe("Property 8: Role Classification Validity", () => {
  const VALID_ROLES: InstrumentRole[] = [
    "drums",
    "bass",
    "lead",
    "pad",
    "arpeggio",
    "chord",
    "unclassified",
  ];

  /** Generate a valid NoteData object with arbitrary timing. */
  function arbNote(): fc.Arbitrary<NoteData> {
    return fc.record({
      pitch: fc.integer({ min: 0, max: 127 }),
      startTime: fc.double({ min: 0, max: 500, noNaN: true }),
      duration: fc.double({ min: 0.01, max: 16, noNaN: true }),
      velocity: fc.integer({ min: 1, max: 127 }),
    });
  }

  test.prop(
    [
      fc.array(arbNote(), { minLength: 0, maxLength: 50 }),
      fc.string({ minLength: 0, maxLength: 30 }),
      fc.option(fc.boolean(), { nil: undefined }),
    ],
    { numRuns: 200 },
  )(
    "always returns a valid InstrumentRole value",
    (notes, trackName, hasDrumRack) => {
      const role = classifyInstrumentRole(notes, trackName, hasDrumRack);
      expect(VALID_ROLES).toContain(role);
    },
  );
});

// ─── Property 9: Track Name Disambiguation ────────────────────────────────

/**
 * **Validates: Requirements 4.8**
 *
 * When a track name contains a role keyword ("drum"/"kick"/"hat"/"snare"/"perc"
 * → drums, "bass" → bass, "lead"/"melody" → lead, "pad" → pad, "arp" → arpeggio)
 * and notes are empty, the function returns the matching role.
 */
describe("Property 9: Track Name Disambiguation", () => {
  /** Map of keyword → expected role when notes are empty. */
  const KEYWORD_ROLE_MAP: Array<{ keywords: string[]; expectedRole: InstrumentRole }> = [
    { keywords: ["drum", "kick", "hat", "snare", "perc"], expectedRole: "drums" },
    { keywords: ["bass"], expectedRole: "bass" },
    { keywords: ["lead", "melody"], expectedRole: "lead" },
    { keywords: ["pad"], expectedRole: "pad" },
    { keywords: ["arp"], expectedRole: "arpeggio" },
  ];

  for (const { keywords, expectedRole } of KEYWORD_ROLE_MAP) {
    test.prop(
      [
        fc.constantFrom(...keywords),
        // Add optional prefix/suffix to ensure substring matching works
        fc.string({ minLength: 0, maxLength: 10 }),
        fc.string({ minLength: 0, maxLength: 10 }),
      ],
      { numRuns: 50 },
    )(
      `empty notes + track name containing "${keywords.join("|")}" → "${expectedRole}"`,
      (keyword, prefix, suffix) => {
        const trackName = `${prefix}${keyword}${suffix}`;
        const role = classifyInstrumentRole([], trackName, false);
        expect(role).toBe(expectedRole);
      },
    );
  }
});

// ─── Property 22: Drum Rack Overrides Heuristic Role ──────────────────────

/**
 * **Validates: Requirements 8.6**
 *
 * When `hasDrumRack` is true, the function always returns "drums"
 * regardless of notes or track name.
 */
describe("Property 22: Drum Rack Overrides Heuristic Role", () => {
  /** Generate a valid NoteData object. */
  function arbNote(): fc.Arbitrary<NoteData> {
    return fc.record({
      pitch: fc.integer({ min: 0, max: 127 }),
      startTime: fc.double({ min: 0, max: 500, noNaN: true }),
      duration: fc.double({ min: 0.01, max: 16, noNaN: true }),
      velocity: fc.integer({ min: 1, max: 127 }),
    });
  }

  test.prop(
    [
      fc.array(arbNote(), { minLength: 0, maxLength: 50 }),
      fc.string({ minLength: 0, maxLength: 30 }),
    ],
    { numRuns: 200 },
  )(
    "hasDrumRack=true always returns 'drums' regardless of notes or track name",
    (notes, trackName) => {
      const role = classifyInstrumentRole(notes, trackName, true);
      expect(role).toBe("drums");
    },
  );
});


// ─── Property 17: Phrase Length Detection ──────────────────────────────────

/**
 * **Validates: Requirements 7.1, 7.2**
 *
 * When a section contains a pattern that repeats every N bars (where N is 4, 8,
 * or 16), the `detectPhraseLength` function should return N (or a divisor of N).
 * Generate notes that repeat every N bars and verify the detected phrase length
 * divides evenly into N.
 */
describe("Property 17: Phrase Length Detection", () => {
  /**
   * Generate a repeating pattern: create a "template" phrase of N bars,
   * then tile it across the section so the pattern repeats every N bars.
   * The section must be at least 2× the candidate length for detection.
   */
  function arbRepeatingSection(
    phraseBars: number,
  ): fc.Arbitrary<{ notes: NoteData[]; sectionStart: number; sectionEnd: number }> {
    const phraseBeats = phraseBars * 4;
    // Need at least 2 repetitions, use 3-4 for stronger signal
    const repetitions = phraseBars === 16 ? 2 : phraseBars === 8 ? 3 : 4;
    const totalBeats = phraseBeats * repetitions;

    return fc.tuple(
      // Generate template notes within a single phrase (5-20 notes for clear pattern)
      fc.array(
        fc.record({
          pitch: fc.integer({ min: 36, max: 84 }),
          startTime: fc.double({ min: 0, max: phraseBeats - 0.1, noNaN: true }),
          duration: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
          velocity: fc.integer({ min: 60, max: 120 }),
        }),
        { minLength: 5, maxLength: 20 },
      ),
      fc.double({ min: 0, max: 100, noNaN: true }),
    ).map(([templateNotes, sectionStart]) => {
      // Tile the template across all repetitions
      const notes: NoteData[] = [];
      for (let rep = 0; rep < repetitions; rep++) {
        for (const note of templateNotes) {
          notes.push({
            pitch: note.pitch,
            startTime: sectionStart + note.startTime + rep * phraseBeats,
            duration: note.duration,
            velocity: note.velocity,
          });
        }
      }
      return {
        notes,
        sectionStart,
        sectionEnd: sectionStart + totalBeats,
      };
    });
  }

  test.prop(
    [fc.constantFrom(4, 8, 16).chain((bars) =>
      fc.tuple(fc.constant(bars), arbRepeatingSection(bars)),
    )],
    { numRuns: 150 },
  )(
    "detected phrase length divides evenly into the repeating pattern length",
    ([phraseBars, { notes, sectionStart, sectionEnd }]) => {
      // Precondition: template must have notes that actually produce a fingerprint
      fc.pre(notes.length >= 10);

      const detected = detectPhraseLength(notes, sectionStart, sectionEnd);

      // The detected length should divide evenly into the actual phrase length
      // (e.g., if pattern repeats every 8 bars, detecting 4 is also valid since
      // an 8-bar pattern trivially repeats every 4 if the 4-bar halves are identical)
      expect(phraseBars % detected).toBe(0);
    },
  );
});

// ─── Property 18: Default Phrase Length When No Repetition ─────────────────

/**
 * **Validates: Requirements 7.3**
 *
 * When notes are random (no repeating structure), the function should return
 * one of the valid phrase lengths [4, 8, 16]. The design specifies that when
 * no candidate scores ≥ 0.7, the function defaults to 4.
 */
describe("Property 18: Default Phrase Length When No Repetition", () => {
  /**
   * Generate completely random notes with no repeating structure.
   * Use random pitches, random start times, random velocities to ensure
   * no pattern emerges. The section must be long enough for phrase detection
   * (at least 32 beats for 4-bar detection).
   */
  function arbRandomNonRepeatingSection(): fc.Arbitrary<{
    notes: NoteData[];
    sectionStart: number;
    sectionEnd: number;
  }> {
    // Use a 64-beat section (16 bars) — enough for all candidates
    const sectionLength = 64;

    return fc.tuple(
      fc.double({ min: 0, max: 100, noNaN: true }),
      // Generate many random notes spread across the section
      fc.array(
        fc.record({
          pitch: fc.integer({ min: 0, max: 127 }),
          relativeStart: fc.double({ min: 0, max: sectionLength - 0.1, noNaN: true }),
          duration: fc.double({ min: 0.05, max: 2.0, noNaN: true }),
          velocity: fc.integer({ min: 1, max: 127 }),
        }),
        { minLength: 30, maxLength: 80 },
      ),
    ).map(([sectionStart, rawNotes]) => {
      const notes: NoteData[] = rawNotes.map((n) => ({
        pitch: n.pitch,
        startTime: sectionStart + n.relativeStart,
        duration: n.duration,
        velocity: n.velocity,
      }));
      return {
        notes,
        sectionStart,
        sectionEnd: sectionStart + sectionLength,
      };
    });
  }

  test.prop(
    [arbRandomNonRepeatingSection()],
    { numRuns: 150 },
  )(
    "random non-repeating notes always return a valid phrase length (4, 8, or 16)",
    ({ notes, sectionStart, sectionEnd }) => {
      const detected = detectPhraseLength(notes, sectionStart, sectionEnd);

      // The result must always be one of the valid phrase lengths
      expect([4, 8, 16]).toContain(detected);
    },
  );
});


// ─── Property 5: Fill Detection Correctness ───────────────────────────────

/**
 * **Validates: Requirements 2.4, 2.5**
 *
 * When `detectFills` is called with any valid notes, section bounds, and phrase length:
 * 1. All detected fills have a position ≥ 0 (within the section)
 * 2. All fills have durationBars of 1 or 2
 * 3. All fills have phraseInterval equal to the passed phraseLength
 * 4. All fills have a valid triggerType ("density" | "new-pitches" | "both")
 * 5. Fill positions are at phrase boundaries minus the fill's duration
 *    (i.e., fills occur just before phrase boundaries)
 */
describe("Property 5: Fill Detection Correctness", () => {
  /** Generate valid section bounds and a phrase length that fits within. */
  function arbSectionWithPhraseLength(): fc.Arbitrary<{
    sectionStart: number;
    sectionEnd: number;
    phraseLength: number;
  }> {
    return fc.tuple(
      fc.double({ min: 0, max: 100, noNaN: true }),
      fc.constantFrom(4, 8, 16), // phrase length in bars
    ).chain(([sectionStart, phraseLength]) => {
      // Section must be at least phraseLength + 1 bar long to enable fill detection
      // (need at least one full phrase + 1 bar for boundary check)
      const minSectionBars = phraseLength + 1;
      const maxSectionBars = phraseLength * 4; // up to 4 phrases
      return fc.integer({ min: minSectionBars, max: maxSectionBars }).map((sectionBars) => ({
        sectionStart,
        sectionEnd: sectionStart + sectionBars * 4, // convert bars to beats
        phraseLength,
      }));
    });
  }

  /** Generate notes within a section that are likely to trigger fills. */
  function arbNotesInSection(
    sectionStart: number,
    sectionEnd: number,
  ): fc.Arbitrary<NoteData[]> {
    return fc.array(
      fc.record({
        pitch: fc.integer({ min: 36, max: 84 }),
        startTime: fc.double({ min: sectionStart, max: sectionEnd - 0.01, noNaN: true }),
        duration: fc.double({ min: 0.05, max: 1.0, noNaN: true }),
        velocity: fc.integer({ min: 40, max: 127 }),
      }),
      { minLength: 5, maxLength: 80 },
    );
  }

  test.prop(
    [arbSectionWithPhraseLength().chain(({ sectionStart, sectionEnd, phraseLength }) =>
      fc.tuple(
        arbNotesInSection(sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
        fc.constant(phraseLength),
      ),
    )],
    { numRuns: 200 },
  )(
    "all detected fills have position ≥ 0",
    ([notes, sectionStart, sectionEnd, phraseLength]) => {
      const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength);
      for (const fill of fills) {
        expect(fill.position).toBeGreaterThanOrEqual(0);
      }
    },
  );

  test.prop(
    [arbSectionWithPhraseLength().chain(({ sectionStart, sectionEnd, phraseLength }) =>
      fc.tuple(
        arbNotesInSection(sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
        fc.constant(phraseLength),
      ),
    )],
    { numRuns: 200 },
  )(
    "all detected fills have durationBars of 1 or 2",
    ([notes, sectionStart, sectionEnd, phraseLength]) => {
      const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength);
      for (const fill of fills) {
        expect([1, 2]).toContain(fill.durationBars);
      }
    },
  );

  test.prop(
    [arbSectionWithPhraseLength().chain(({ sectionStart, sectionEnd, phraseLength }) =>
      fc.tuple(
        arbNotesInSection(sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
        fc.constant(phraseLength),
      ),
    )],
    { numRuns: 200 },
  )(
    "all detected fills have phraseInterval equal to the passed phraseLength",
    ([notes, sectionStart, sectionEnd, phraseLength]) => {
      const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength);
      for (const fill of fills) {
        expect(fill.phraseInterval).toBe(phraseLength);
      }
    },
  );

  test.prop(
    [arbSectionWithPhraseLength().chain(({ sectionStart, sectionEnd, phraseLength }) =>
      fc.tuple(
        arbNotesInSection(sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
        fc.constant(phraseLength),
      ),
    )],
    { numRuns: 200 },
  )(
    "all detected fills have a valid triggerType",
    ([notes, sectionStart, sectionEnd, phraseLength]) => {
      const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength);
      const validTriggerTypes = ["density", "new-pitches", "both"];
      for (const fill of fills) {
        expect(validTriggerTypes).toContain(fill.triggerType);
      }
    },
  );

  test.prop(
    [arbSectionWithPhraseLength().chain(({ sectionStart, sectionEnd, phraseLength }) =>
      fc.tuple(
        arbNotesInSection(sectionStart, sectionEnd),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
        fc.constant(phraseLength),
      ),
    )],
    { numRuns: 200 },
  )(
    "fill positions are at phrase boundaries minus the fill's duration",
    ([notes, sectionStart, sectionEnd, phraseLength]) => {
      const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength);

      for (const fill of fills) {
        // The fill's position (bar offset from section start) plus its duration
        // should land exactly on a phrase boundary (multiple of phraseLength bars).
        // Use rounding to handle floating-point imprecision from double section bounds.
        const fillEndBar = fill.position + fill.durationBars;
        const remainder = fillEndBar % phraseLength;
        // remainder should be 0 or very close to phraseLength (wrapping case)
        const effectiveRemainder = Math.min(remainder, phraseLength - remainder);
        expect(effectiveRemainder).toBeCloseTo(0, 5);
      }
    },
  );
});


// ─── Property 6: Build Detection for Progressive Metrics ──────────────

/**
 * **Validates: Requirements 3.1–3.5**
 *
 * When `detectBuilds` receives notes with progressively increasing density
 * (each bar has ≥25% more notes than the previous), the result should not be
 * null (a build is detected) and the type should include "density" or "combined".
 */
describe("Property 6: Build Detection for Progressive Metrics", () => {
  /**
   * Generate notes with progressively increasing density across 4 bars
   * leading into a boundary. Each bar has ≥25% more notes than the previous.
   *
   * Strategy:
   * - Start with a base count of notes in bar 1
   * - Each subsequent bar has Math.ceil(prev * 1.25) or more notes
   * - Notes are spread evenly within each bar's 4-beat span
   * - All notes use the same pitch and velocity to isolate the density metric
   */
  function arbProgressiveDensityBuild(): fc.Arbitrary<{
    notes: NoteData[];
    sectionStart: number;
    sectionEnd: number;
    boundary: number;
  }> {
    return fc.tuple(
      fc.double({ min: 0, max: 100, noNaN: true }), // section start offset
      fc.integer({ min: 3, max: 8 }), // base note count for bar 1
      fc.integer({ min: 36, max: 84 }), // pitch to use
      fc.integer({ min: 60, max: 100 }), // velocity to use
    ).map(([sectionStart, baseCount, pitch, velocity]) => {
      const notes: NoteData[] = [];
      // 4 bars of progressive density, each bar has ≥25% more notes
      const barCounts: number[] = [baseCount];
      for (let i = 1; i < 4; i++) {
        barCounts.push(Math.ceil(barCounts[i - 1] * 1.3)); // 30% increase ensures ≥25%
      }

      for (let bar = 0; bar < 4; bar++) {
        const barStart = sectionStart + bar * 4;
        const count = barCounts[bar];
        for (let n = 0; n < count; n++) {
          notes.push({
            pitch,
            startTime: barStart + (n * 4) / count,
            duration: 0.25,
            velocity,
          });
        }
      }

      return {
        notes,
        sectionStart,
        sectionEnd: sectionStart + 16, // 4 bars = 16 beats
        boundary: sectionStart + 16, // boundary at the end
      };
    });
  }

  test.prop(
    [arbProgressiveDensityBuild()],
    { numRuns: 100 },
  )(
    "progressively increasing density detects a build with type 'density' or 'combined'",
    ({ notes, sectionStart, sectionEnd, boundary }) => {
      const result = detectBuilds(notes, sectionStart, sectionEnd, boundary);
      expect(result).not.toBeNull();
      expect(["density", "combined"]).toContain(result!.type);
    },
  );
});


// ─── Property 7: No Build When Flat ──────────────────────────────────────

/**
 * **Validates: Requirements 3.1–3.5**
 *
 * When all bars in the window have the same density, velocity, and pitch range
 * (flat pattern), `detectBuilds` should return null (no build detected).
 */
describe("Property 7: No Build When Flat", () => {
  /**
   * Generate notes where each of the 4 bars before the boundary has exactly
   * the same number of notes, the same velocity, and the same pitch.
   * This ensures no progressive increase in any metric.
   */
  function arbFlatPattern(): fc.Arbitrary<{
    notes: NoteData[];
    sectionStart: number;
    sectionEnd: number;
    boundary: number;
  }> {
    return fc.tuple(
      fc.double({ min: 0, max: 100, noNaN: true }), // section start
      fc.integer({ min: 2, max: 8 }), // notes per bar (same in all bars)
      fc.integer({ min: 36, max: 84 }), // single pitch (no pitch range expansion)
      fc.integer({ min: 40, max: 120 }), // single velocity (no velocity increase)
    ).map(([sectionStart, notesPerBar, pitch, velocity]) => {
      const notes: NoteData[] = [];

      // Generate exactly the same pattern in each of the 4 bars
      for (let bar = 0; bar < 4; bar++) {
        const barStart = sectionStart + bar * 4;
        for (let n = 0; n < notesPerBar; n++) {
          notes.push({
            pitch,
            startTime: barStart + (n * 4) / notesPerBar,
            duration: 0.25,
            velocity,
          });
        }
      }

      return {
        notes,
        sectionStart,
        sectionEnd: sectionStart + 16,
        boundary: sectionStart + 16,
      };
    });
  }

  test.prop(
    [arbFlatPattern()],
    { numRuns: 100 },
  )(
    "flat pattern (same density, velocity, pitch in all bars) returns null",
    ({ notes, sectionStart, sectionEnd, boundary }) => {
      const result = detectBuilds(notes, sectionStart, sectionEnd, boundary);
      expect(result).toBeNull();
    },
  );
});


// ─── Property 4: Percussion Loop vs Variation Classification ──────────────

/**
 * **Validates: Requirements 2.1, 2.2, 2.3**
 *
 * When `classifyPercussionPattern` is called with any valid notes and section bounds:
 * - It always returns a valid classification ("loop" or "variation")
 * - phraseLength is always one of [4, 8, 16]
 * - fills is always an array (possibly empty)
 */
describe("Property 4: Percussion Loop vs Variation Classification", () => {
  /** Generate a valid NoteData for percussion (pitches in drum range 36-81). */
  function arbPercussionNote(minStart: number, maxStart: number): fc.Arbitrary<NoteData> {
    return fc.record({
      pitch: fc.integer({ min: 36, max: 81 }),
      startTime: fc.double({ min: minStart, max: maxStart, noNaN: true }),
      duration: fc.double({ min: 0.05, max: 0.5, noNaN: true }),
      velocity: fc.integer({ min: 40, max: 127 }),
    });
  }

  /** Generate section bounds that are long enough for phrase detection (at least 32 beats = 8 bars). */
  function arbPercussionSectionBounds(): fc.Arbitrary<{ sectionStart: number; sectionEnd: number }> {
    return fc
      .tuple(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 32, max: 128, noNaN: true }), // at least 8 bars
      )
      .map(([start, length]) => ({
        sectionStart: start,
        sectionEnd: start + length,
      }));
  }

  test.prop(
    [arbPercussionSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        fc.array(arbPercussionNote(sectionStart, sectionEnd - 0.01), { minLength: 5, maxLength: 60 }),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 150 },
  )(
    "always returns a valid classification ('loop' or 'variation')",
    ([notes, sectionStart, sectionEnd]) => {
      const result = classifyPercussionPattern(notes, sectionStart, sectionEnd);
      expect(["loop", "variation"]).toContain(result.classification);
    },
  );

  test.prop(
    [arbPercussionSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        fc.array(arbPercussionNote(sectionStart, sectionEnd - 0.01), { minLength: 5, maxLength: 60 }),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 150 },
  )(
    "phraseLength is always one of [4, 8, 16]",
    ([notes, sectionStart, sectionEnd]) => {
      const result = classifyPercussionPattern(notes, sectionStart, sectionEnd);
      expect([4, 8, 16]).toContain(result.phraseLength);
    },
  );

  test.prop(
    [arbPercussionSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        fc.array(arbPercussionNote(sectionStart, sectionEnd - 0.01), { minLength: 5, maxLength: 60 }),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 150 },
  )(
    "fills is always an array (possibly empty)",
    ([notes, sectionStart, sectionEnd]) => {
      const result = classifyPercussionPattern(notes, sectionStart, sectionEnd);
      expect(Array.isArray(result.fills)).toBe(true);
    },
  );

  test.prop(
    [arbPercussionSectionBounds().chain(({ sectionStart, sectionEnd }) =>
      fc.tuple(
        // Also test with empty notes
        fc.array(arbPercussionNote(sectionStart, sectionEnd - 0.01), { minLength: 0, maxLength: 60 }),
        fc.constant(sectionStart),
        fc.constant(sectionEnd),
      ),
    )],
    { numRuns: 100 },
  )(
    "result structure is always valid (including empty note arrays)",
    ([notes, sectionStart, sectionEnd]) => {
      const result = classifyPercussionPattern(notes, sectionStart, sectionEnd);
      expect(["loop", "variation"]).toContain(result.classification);
      expect([4, 8, 16]).toContain(result.phraseLength);
      expect(Array.isArray(result.fills)).toBe(true);
    },
  );
});

// ─── Property 19: Drum Pattern Identification ─────────────────────────────

/**
 * **Validates: Requirements 2.1**
 *
 * When the same note pattern is tiled exactly (identical notes repeating every N bars),
 * `classifyPercussionPattern` should classify it as "loop".
 *
 * Strategy: Generate a 4-bar template (the shortest candidate) and tile it multiple
 * times. Since the algorithm tests 4-bar first, a pattern that repeats every 4 bars
 * will always be detected as a 4-bar phrase, and consecutive 4-bar phrases will be
 * identical, guaranteeing "loop" classification.
 */
describe("Property 19: Drum Pattern Identification", () => {
  /**
   * Generate a repeating drum pattern at the 4-bar level:
   * Create a "template" of notes within 4 bars (16 beats), then tile it
   * across the section. This guarantees the shortest candidate (4 bars)
   * will detect as repeating, and all consecutive phrases will be identical.
   *
   * The template uses quantized positions (integer beat positions) to ensure
   * fingerprint matching is clean and unambiguous.
   */
  function arbExactlyRepeating4BarPattern(): fc.Arbitrary<{
    notes: NoteData[];
    sectionStart: number;
    sectionEnd: number;
  }> {
    const phraseBeats = 16; // 4 bars × 4 beats
    const repetitions = 4; // 4 repetitions = 16 bars total = 64 beats
    const totalBeats = phraseBeats * repetitions;

    return fc.tuple(
      // Generate template notes at quantized beat positions within a 4-bar phrase
      fc.array(
        fc.record({
          pitch: fc.integer({ min: 36, max: 72 }),
          // Use integer beat positions for clean fingerprint alignment
          startTime: fc.integer({ min: 0, max: 15 }).map((beat) => beat),
          duration: fc.constant(0.1),
          velocity: fc.integer({ min: 70, max: 110 }),
        }),
        { minLength: 4, maxLength: 16 },
      ),
      fc.double({ min: 0, max: 50, noNaN: true }),
    ).map(([templateNotes, sectionStart]) => {
      // Tile the template EXACTLY across all repetitions
      const notes: NoteData[] = [];
      for (let rep = 0; rep < repetitions; rep++) {
        for (const note of templateNotes) {
          notes.push({
            pitch: note.pitch,
            startTime: sectionStart + note.startTime + rep * phraseBeats,
            duration: note.duration,
            velocity: note.velocity,
          });
        }
      }
      return {
        notes,
        sectionStart,
        sectionEnd: sectionStart + totalBeats,
      };
    });
  }

  test.prop(
    [arbExactlyRepeating4BarPattern()],
    { numRuns: 200 },
  )(
    "exactly tiled 4-bar drum patterns are classified as 'loop'",
    ({ notes, sectionStart, sectionEnd }) => {
      // Precondition: ensure we have enough notes for meaningful analysis
      fc.pre(notes.length >= 16);

      const result = classifyPercussionPattern(notes, sectionStart, sectionEnd);
      expect(result.classification).toBe("loop");
    },
  );
});


// ─── Property 10: Cross-Section Comparison Structural Invariant ────────────

/**
 * **Validates: Requirements 5.1–5.5**
 *
 * When `comparePatternsAcrossSections` receives N fingerprints, it always returns
 * exactly N-1 comparisons, each with:
 * - valid section indices (consecutive pairs: sectionIndexA = i, sectionIndexB = i+1)
 * - similarity in [0, 1]
 * - classification one of "shared", "contrasting", or "similar"
 */
describe("Property 10: Cross-Section Comparison Structural Invariant", () => {
  /**
   * Generate an array of N pattern fingerprints (N >= 2).
   * Each fingerprint is built from random notes within a distinct section.
   */
  function arbFingerprintArray(): fc.Arbitrary<PatternFingerprint[]> {
    return fc.integer({ min: 2, max: 10 }).chain((count) => {
      // Generate `count` fingerprints by creating random note sections
      return fc.array(
        fc.tuple(
          fc.array(
            fc.record({
              pitch: fc.integer({ min: 0, max: 127 }),
              startTime: fc.double({ min: 0, max: 15.9, noNaN: true }),
              duration: fc.double({ min: 0.05, max: 2.0, noNaN: true }),
              velocity: fc.integer({ min: 1, max: 127 }),
            }),
            { minLength: 0, maxLength: 30 },
          ),
        ).map(([notes]) => {
          return computePatternFingerprint(notes, 0, 16);
        }),
        { minLength: count, maxLength: count },
      );
    });
  }

  test.prop(
    [arbFingerprintArray()],
    { numRuns: 200 },
  )(
    "returns exactly N-1 comparisons for N fingerprints",
    (fingerprints) => {
      const comparisons = comparePatternsAcrossSections(fingerprints);
      expect(comparisons.length).toBe(fingerprints.length - 1);
    },
  );

  test.prop(
    [arbFingerprintArray()],
    { numRuns: 200 },
  )(
    "each comparison has consecutive section indices (i, i+1)",
    (fingerprints) => {
      const comparisons = comparePatternsAcrossSections(fingerprints);
      for (let i = 0; i < comparisons.length; i++) {
        expect(comparisons[i].sectionIndexA).toBe(i);
        expect(comparisons[i].sectionIndexB).toBe(i + 1);
      }
    },
  );

  test.prop(
    [arbFingerprintArray()],
    { numRuns: 200 },
  )(
    "all similarity scores are in [0, 1]",
    (fingerprints) => {
      const comparisons = comparePatternsAcrossSections(fingerprints);
      for (const comp of comparisons) {
        expect(comp.similarity).toBeGreaterThanOrEqual(0);
        expect(comp.similarity).toBeLessThanOrEqual(1);
      }
    },
  );

  test.prop(
    [arbFingerprintArray()],
    { numRuns: 200 },
  )(
    "all classifications are one of 'shared', 'contrasting', or 'similar'",
    (fingerprints) => {
      const comparisons = comparePatternsAcrossSections(fingerprints);
      const validClassifications = ["shared", "contrasting", "similar"];
      for (const comp of comparisons) {
        expect(validClassifications).toContain(comp.classification);
      }
    },
  );

  test.prop(
    [fc.integer({ min: 0, max: 1 })],
    { numRuns: 20 },
  )(
    "returns empty array for 0 or 1 fingerprints",
    (count) => {
      const fingerprints: PatternFingerprint[] = [];
      for (let i = 0; i < count; i++) {
        fingerprints.push({
          pitchClasses: new Set([0]),
          rhythmicPositions: [0],
          velocityContour: [0.5],
          density: 1,
          barCount: 1,
        });
      }
      const comparisons = comparePatternsAcrossSections(fingerprints);
      expect(comparisons.length).toBe(0);
    },
  );
});


// ─── Property 11: Extended Repetition Detection ───────────────────────────

/**
 * **Validates: Requirements 5.1–5.5**
 *
 * When `buildRepetitionSummary` receives comparisons where 3+ consecutive
 * comparisons are classified "shared", the result has `hasExtendedRepetition === true`
 * and `extendedRepetitionSections` includes all sections in the run.
 *
 * A run of K consecutive "shared" comparisons connects K+1 sections.
 * When K >= 3, we have 4+ sections in the shared group, which means extended repetition.
 * Note: The design says "3+ consecutive shared" sections, meaning a shared group of
 * size >= 3 (which requires 2+ consecutive "shared" comparisons). But the task description
 * says "3+ consecutive are classified 'shared'" meaning 3 comparisons → 4 sections.
 * We test the implementation: a shared group of size >= 3 triggers extended repetition.
 */
describe("Property 11: Extended Repetition Detection", () => {
  /** Valid instrument roles for arbitrary generation. */
  const VALID_ROLES: InstrumentRole[] = [
    "drums", "bass", "lead", "pad", "arpeggio", "chord", "unclassified",
  ];

  /**
   * Generate comparisons with a guaranteed run of 3+ consecutive "shared"
   * classifications. This ensures `buildRepetitionSummary` detects extended repetition.
   *
   * Strategy: create a run of sharedRunLength consecutive "shared" comparisons
   * embedded within a larger set of comparisons.
   */
  function arbComparisonsWithExtendedSharedRun(): fc.Arbitrary<{
    comparisons: CrossSectionComparison[];
    sectionCount: number;
    sharedRunStart: number;
    sharedRunLength: number;
  }> {
    return fc.tuple(
      fc.integer({ min: 3, max: 8 }), // sharedRunLength: 3+ consecutive "shared"
      fc.integer({ min: 0, max: 3 }),  // prefix length (non-shared before the run)
      fc.integer({ min: 0, max: 3 }),  // suffix length (non-shared after the run)
      fc.constantFrom(...VALID_ROLES),
    ).chain(([sharedRunLength, prefixLen, suffixLen, _role]) => {
      const totalComparisons = prefixLen + sharedRunLength + suffixLen;
      const sectionCount = totalComparisons + 1;

      return fc.tuple(
        // Generate similarities for prefix (non-shared: < 0.85)
        fc.array(
          fc.double({ min: 0.0, max: 0.84, noNaN: true }),
          { minLength: prefixLen, maxLength: prefixLen },
        ),
        // Generate similarities for the shared run (> 0.85)
        fc.array(
          fc.double({ min: 0.86, max: 1.0, noNaN: true }),
          { minLength: sharedRunLength, maxLength: sharedRunLength },
        ),
        // Generate similarities for suffix (non-shared: < 0.85)
        fc.array(
          fc.double({ min: 0.0, max: 0.84, noNaN: true }),
          { minLength: suffixLen, maxLength: suffixLen },
        ),
        fc.constant(sectionCount),
        fc.constant(prefixLen),
        fc.constant(sharedRunLength),
      ).map(([prefixSims, sharedSims, suffixSims, secCount, runStart, runLen]) => {
        const comparisons: CrossSectionComparison[] = [];
        let idx = 0;

        // Prefix comparisons (non-shared)
        for (const sim of prefixSims) {
          comparisons.push({
            sectionIndexA: idx,
            sectionIndexB: idx + 1,
            similarity: sim,
            classification: sim < 0.5 ? "contrasting" : "similar",
          });
          idx++;
        }

        // Shared run comparisons
        for (const sim of sharedSims) {
          comparisons.push({
            sectionIndexA: idx,
            sectionIndexB: idx + 1,
            similarity: sim,
            classification: "shared",
          });
          idx++;
        }

        // Suffix comparisons (non-shared)
        for (const sim of suffixSims) {
          comparisons.push({
            sectionIndexA: idx,
            sectionIndexB: idx + 1,
            similarity: sim,
            classification: sim < 0.5 ? "contrasting" : "similar",
          });
          idx++;
        }

        return {
          comparisons,
          sectionCount: secCount,
          sharedRunStart: runStart,
          sharedRunLength: runLen,
        };
      });
    });
  }

  test.prop(
    [arbComparisonsWithExtendedSharedRun(), fc.constantFrom(...VALID_ROLES)],
    { numRuns: 200 },
  )(
    "3+ consecutive 'shared' comparisons → hasExtendedRepetition is true",
    ({ comparisons, sectionCount, sharedRunLength }, role) => {
      // A run of sharedRunLength consecutive "shared" comparisons connects
      // sharedRunLength + 1 sections in one group. Extended repetition triggers
      // when a shared group has >= 3 sections (i.e., 2+ consecutive "shared" comparisons).
      // Our generator creates runs of 3+ comparisons → 4+ sections, always extended.
      fc.pre(sharedRunLength >= 2); // Our generator guarantees >= 3, but be safe

      const summary = buildRepetitionSummary(comparisons, role, sectionCount);
      expect(summary.hasExtendedRepetition).toBe(true);
    },
  );

  test.prop(
    [arbComparisonsWithExtendedSharedRun(), fc.constantFrom(...VALID_ROLES)],
    { numRuns: 200 },
  )(
    "extendedRepetitionSections includes all sections in the shared run",
    ({ comparisons, sectionCount, sharedRunStart, sharedRunLength }, role) => {
      const summary = buildRepetitionSummary(comparisons, role, sectionCount);

      // The shared run starts at section index `sharedRunStart` and extends
      // sharedRunLength comparisons → sharedRunLength + 1 sections
      const expectedSections: number[] = [];
      for (let i = sharedRunStart; i <= sharedRunStart + sharedRunLength; i++) {
        expectedSections.push(i);
      }

      // All expected sections should be in extendedRepetitionSections
      for (const sec of expectedSections) {
        expect(summary.extendedRepetitionSections).toContain(sec);
      }
    },
  );

  test.prop(
    [
      // Generate comparisons with NO extended repetition (max 1 consecutive "shared")
      fc.integer({ min: 2, max: 8 }).chain((count) => {
        // Alternate between shared and non-shared to ensure no run of 2+ "shared"
        return fc.array(
          fc.tuple(
            fc.boolean(), // whether this comparison is "shared"
            fc.double({ min: 0.0, max: 1.0, noNaN: true }),
          ),
          { minLength: count, maxLength: count },
        ).map((pairs) => {
          // Ensure no two consecutive "shared" by forcing alternation
          const comparisons: CrossSectionComparison[] = [];
          for (let i = 0; i < pairs.length; i++) {
            const prevWasShared = i > 0 && comparisons[i - 1].classification === "shared";
            const [wantsShared, rawSim] = pairs[i];
            // Only allow "shared" if the previous wasn't shared (max 1 consecutive)
            const isShared = wantsShared && !prevWasShared;
            const similarity = isShared ? 0.86 + rawSim * 0.14 : rawSim * 0.84;
            const classification: CrossSectionComparison["classification"] = isShared
              ? "shared"
              : similarity < 0.5
                ? "contrasting"
                : "similar";

            comparisons.push({
              sectionIndexA: i,
              sectionIndexB: i + 1,
              similarity,
              classification,
            });
          }
          return { comparisons, sectionCount: count + 1 };
        });
      }),
      fc.constantFrom(...VALID_ROLES),
    ],
    { numRuns: 200 },
  )(
    "no extended repetition when max 1 consecutive 'shared' comparison",
    ({ comparisons, sectionCount }, role) => {
      const summary = buildRepetitionSummary(comparisons, role, sectionCount);
      expect(summary.hasExtendedRepetition).toBe(false);
      expect(summary.extendedRepetitionSections).toHaveLength(0);
    },
  );
});
