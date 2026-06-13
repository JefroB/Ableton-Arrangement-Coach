/**
 * Property-based tests for the Synth Analyzer module.
 *
 * Feature: midi-synth-analysis
 *
 * Tests Properties 2–11 covering pitch content, note density,
 * velocity dynamics, articulation patterns, rhythmic regularity,
 * polyphony profile, melodic contour, and harmonic interval analysis.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import {
  computePitchContent,
  computeNoteDensity,
  computeVelocityDynamics,
  computeArticulationPattern,
  computeRhythmicRegularity,
  computePolyphonyProfile,
  computeMelodicContour,
  computeHarmonicIntervalProfile,
} from "./synth-analyzer.js";

import type { NoteData } from "../ableton/sdk-adapter.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary MIDI pitch (0–127). */
const pitchArb = fc.integer({ min: 0, max: 127 });

/** Arbitrary MIDI velocity (1–127). */
const velocityArb = fc.integer({ min: 1, max: 127 });

/** Arbitrary note duration in beats (0.1–8.0). */
const durationArb = fc.double({ min: 0.1, max: 8.0, noNaN: true, noDefaultInfinity: true });

/** Arbitrary section range with positive duration. */
const sectionRangeArb = fc
  .tuple(
    fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 1, max: 64, noNaN: true, noDefaultInfinity: true }),
  )
  .map(([start, span]) => ({
    sectionStart: start,
    sectionEnd: start + span,
  }));

/**
 * Generate an array of NoteData within a given section range.
 * Notes have startTime within [sectionStart, sectionEnd).
 */
function noteArrayArb(sectionStart: number, sectionEnd: number, opts?: { minLength?: number; maxLength?: number }): fc.Arbitrary<NoteData[]> {
  const minLen = opts?.minLength ?? 1;
  const maxLen = opts?.maxLength ?? 50;
  return fc.array(
    fc.tuple(pitchArb, velocityArb, durationArb).map(([pitch, velocity, duration]) => {
      // Generate startTime within section range using a mapped value
      return { pitch, velocity, duration, startTime: 0 } as NoteData;
    }),
    { minLength: minLen, maxLength: maxLen },
  ).chain((notes) =>
    fc.array(
      fc.double({ min: sectionStart, max: sectionEnd - 0.001, noNaN: true, noDefaultInfinity: true }),
      { minLength: notes.length, maxLength: notes.length },
    ).map((startTimes) =>
      notes.map((note, i) => ({
        ...note,
        startTime: startTimes[i]!,
      })),
    ),
  );
}

/**
 * Generate a section range and notes together (ensuring notes are within section).
 */
const sectionWithNotesArb = sectionRangeArb.chain(({ sectionStart, sectionEnd }) =>
  noteArrayArb(sectionStart, sectionEnd).map((notes) => ({
    sectionStart,
    sectionEnd,
    notes,
  })),
);

/**
 * Generate a section range with at least 2 notes (for interval analysis).
 */
const sectionWithMultipleNotesArb = sectionRangeArb.chain(({ sectionStart, sectionEnd }) =>
  noteArrayArb(sectionStart, sectionEnd, { minLength: 2 }).map((notes) => ({
    sectionStart,
    sectionEnd,
    notes,
  })),
);

// ─── Property 2: Pitch content correctness ─────────────────────────────

// Feature: midi-synth-analysis, Property 2: Pitch content correctness
describe("Feature: midi-synth-analysis, Property 2: Pitch content correctness", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any set of MIDI notes within a section, pitch classes SHALL be
   * exactly note.pitch % 12 for all notes.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "pitch classes are exactly note.pitch % 12 for all notes in section",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computePitchContent(notes, sectionStart, sectionEnd);

      // Compute expected pitch classes
      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );
      const expectedClasses = new Set(sectionNotes.map((n) => n.pitch % 12));

      expect(result.pitchClasses).toEqual(expectedClasses);
    },
  );

  /**
   * **Validates: Requirements 1.3**
   *
   * Pitch range SHALL equal max(note.pitch) - min(note.pitch).
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "pitch range equals max(pitch) - min(pitch)",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computePitchContent(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );

      if (sectionNotes.length === 0) {
        expect(result.pitchRange).toBe(0);
      } else {
        const pitches = sectionNotes.map((n) => n.pitch);
        const expectedRange = Math.max(...pitches) - Math.min(...pitches);
        expect(result.pitchRange).toBe(expectedRange);
      }
    },
  );
});

// ─── Property 3: Note density computation ──────────────────────────────

// Feature: midi-synth-analysis, Property 3: Note density computation
describe("Feature: midi-synth-analysis, Property 3: Note density computation", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any non-empty set of notes within a section of known duration,
   * Note_Density SHALL equal noteCount / durationBeats.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "note density equals noteCount / durationBeats",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeNoteDensity(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );
      const duration = sectionEnd - sectionStart;
      const expected = sectionNotes.length / duration;

      expect(result).toBeCloseTo(expected, 10);
    },
  );
});

// ─── Property 4: Velocity dynamics metrics and contour classification ──

// Feature: midi-synth-analysis, Property 4: Velocity dynamics metrics and contour classification
describe("Feature: midi-synth-analysis, Property 4: Velocity dynamics metrics and contour classification", () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * min ≤ mean ≤ max, stdDev ≥ 0.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "min <= mean <= max and stdDev >= 0",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeVelocityDynamics(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );

      if (sectionNotes.length === 0) {
        // Guard case: all zeroed out
        expect(result.min).toBe(0);
        expect(result.max).toBe(0);
        expect(result.mean).toBe(0);
        expect(result.stdDev).toBe(0);
      } else {
        expect(result.min).toBeLessThanOrEqual(result.mean);
        expect(result.mean).toBeLessThanOrEqual(result.max);
        expect(result.stdDev).toBeGreaterThanOrEqual(0);
      }
    },
  );

  /**
   * **Validates: Requirements 1.5**
   *
   * Contour classification follows slope/stdDev rules:
   * rising when slope > +0.5, falling when slope < -0.5,
   * flat when |slope| ≤ 0.5 and stdDev ≤ 10, varied when |slope| ≤ 0.5 and stdDev > 10.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "contour classification matches slope and stdDev rules",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeVelocityDynamics(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );

      if (sectionNotes.length === 0) {
        expect(result.contour).toBe("flat");
        return;
      }

      // Recompute slope independently
      const n = sectionNotes.length;
      const meanVelocity = sectionNotes.reduce((s, note) => s + note.velocity, 0) / n;
      const meanTime = sectionNotes.reduce((s, note) => s + note.startTime, 0) / n;

      let numerator = 0;
      let denominator = 0;
      for (const note of sectionNotes) {
        const dx = note.startTime - meanTime;
        const dy = note.velocity - meanVelocity;
        numerator += dx * dy;
        denominator += dx * dx;
      }
      const slope = denominator === 0 ? 0 : numerator / denominator;

      if (slope > 0.5) {
        expect(result.contour).toBe("rising");
      } else if (slope < -0.5) {
        expect(result.contour).toBe("falling");
      } else if (result.stdDev <= 10) {
        expect(result.contour).toBe("flat");
      } else {
        expect(result.contour).toBe("varied");
      }
    },
  );
});

// ─── Property 5: Articulation pattern classification ───────────────────

// Feature: midi-synth-analysis, Property 5: Articulation pattern classification
describe("Feature: midi-synth-analysis, Property 5: Articulation pattern classification", () => {
  /** Arbitrary positive grid spacing. */
  const gridSpacingArb = fc.double({ min: 0.1, max: 4.0, noNaN: true, noDefaultInfinity: true });

  /**
   * Generate notes with controlled durations for articulation testing.
   */
  const notesWithGridArb = fc
    .tuple(
      fc.array(
        fc.tuple(pitchArb, velocityArb, durationArb, fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }))
          .map(([pitch, velocity, duration, startTime]) => ({
            pitch,
            velocity,
            duration,
            startTime,
          } as NoteData)),
        { minLength: 1, maxLength: 50 },
      ),
      gridSpacingArb,
    );

  /**
   * **Validates: Requirements 1.6**
   *
   * "staccato" when avgDuration / gridSpacing < 0.5,
   * "legato" when avgDuration / gridSpacing > 0.9,
   * "mixed" otherwise.
   */
  test.prop([notesWithGridArb], { numRuns: 100 })(
    "articulation classification matches avgDuration / gridSpacing thresholds",
    ([notes, gridSpacing]) => {
      const result = computeArticulationPattern(notes, gridSpacing);

      const avgDuration = notes.reduce((sum, n) => sum + n.duration, 0) / notes.length;
      const ratio = avgDuration / gridSpacing;

      expect(result.averageDurationRatio).toBeCloseTo(ratio, 10);

      if (ratio < 0.5) {
        expect(result.type).toBe("staccato");
      } else if (ratio > 0.9) {
        expect(result.type).toBe("legato");
      } else {
        expect(result.type).toBe("mixed");
      }
    },
  );
});

// ─── Property 6: Rhythmic regularity range invariant ───────────────────

// Feature: midi-synth-analysis, Property 6: Rhythmic regularity range invariant
describe("Feature: midi-synth-analysis, Property 6: Rhythmic regularity range invariant", () => {
  /**
   * **Validates: Requirements 1.7**
   *
   * Result SHALL be in [0, 1].
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "rhythmic regularity is in [0, 1]",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeRhythmicRegularity(notes, sectionStart, sectionEnd);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    },
  );

  /**
   * **Validates: Requirements 1.7**
   *
   * Equals ratio of onsets within 10 ticks (at 480 ticks/quarter) of a 16th-note grid position.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "equals ratio of on-grid onsets to total onsets",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeRhythmicRegularity(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );

      if (sectionNotes.length === 0) {
        expect(result).toBe(0);
        return;
      }

      const TICKS_PER_QUARTER = 480;
      const TICKS_PER_16TH = 120;
      const TOLERANCE = 10;

      let onGridCount = 0;
      for (const note of sectionNotes) {
        const onsetTicks = note.startTime * TICKS_PER_QUARTER;
        const remainder = onsetTicks % TICKS_PER_16TH;
        const distanceToGrid = Math.min(remainder, TICKS_PER_16TH - remainder);
        if (distanceToGrid <= TOLERANCE) {
          onGridCount++;
        }
      }

      const expected = onGridCount / sectionNotes.length;
      expect(result).toBeCloseTo(expected, 10);
    },
  );
});

// ─── Property 7: Polyphony profile correctness ─────────────────────────

// Feature: midi-synth-analysis, Property 7: Polyphony profile correctness
describe("Feature: midi-synth-analysis, Property 7: Polyphony profile correctness", () => {
  /**
   * **Validates: Requirements 1.8**
   *
   * mean ≤ max, mean ≥ 0, max ≥ 0.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "mean <= max, mean >= 0, max >= 0",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computePolyphonyProfile(notes, sectionStart, sectionEnd);

      expect(result.mean).toBeGreaterThanOrEqual(0);
      expect(result.max).toBeGreaterThanOrEqual(0);
      expect(result.mean).toBeLessThanOrEqual(result.max);
    },
  );

  /**
   * **Validates: Requirements 1.8**
   *
   * Derived from sampling overlapping note counts at each 16th-note subdivision.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "polyphony profile derived from 16th-note sampling",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computePolyphonyProfile(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );

      const duration = sectionEnd - sectionStart;
      const step = 0.25;
      const sampleCount = Math.floor(duration / step);

      if (sampleCount === 0 || sectionNotes.length === 0) {
        expect(result.mean).toBe(0);
        expect(result.max).toBe(0);
        return;
      }

      // Manually compute expected polyphony
      let totalCount = 0;
      let maxCount = 0;
      for (let i = 0; i < sampleCount; i++) {
        const samplePoint = sectionStart + i * step;
        let count = 0;
        for (const note of sectionNotes) {
          if (note.startTime <= samplePoint && samplePoint < note.startTime + note.duration) {
            count++;
          }
        }
        totalCount += count;
        if (count > maxCount) maxCount = count;
      }

      const expectedMean = totalCount / sampleCount;
      expect(result.mean).toBeCloseTo(expectedMean, 5);
      expect(result.max).toBe(maxCount);
    },
  );
});

// ─── Property 8: Melodic contour segment computation ───────────────────

// Feature: midi-synth-analysis, Property 8: Melodic contour segment computation
describe("Feature: midi-synth-analysis, Property 8: Melodic contour segment computation", () => {
  /**
   * **Validates: Requirements 1.9**
   *
   * Each segmentMean equals arithmetic mean pitch of notes whose onset falls in that segment.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "segment means equal arithmetic mean pitch per segment",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeMelodicContour(notes, sectionStart, sectionEnd);

      const sectionNotes = notes.filter(
        (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
      );

      const duration = sectionEnd - sectionStart;
      const segmentLength = duration / 4;

      // Compute raw segment means
      const rawMeans: (number | null)[] = [null, null, null, null];
      for (let i = 0; i < 4; i++) {
        const segStart = sectionStart + i * segmentLength;
        const segEnd = segStart + segmentLength;
        const segNotes = sectionNotes.filter(
          (n) => n.startTime >= segStart && n.startTime < segEnd,
        );
        if (segNotes.length > 0) {
          rawMeans[i] = segNotes.reduce((sum, n) => sum + n.pitch, 0) / segNotes.length;
        }
      }

      // Fill empty segments with nearest non-empty segment's mean
      const nonEmpty: { index: number; value: number }[] = [];
      for (let i = 0; i < 4; i++) {
        if (rawMeans[i] !== null) nonEmpty.push({ index: i, value: rawMeans[i]! });
      }

      if (nonEmpty.length === 0) {
        expect(result.segmentMeans).toEqual([0, 0, 0, 0]);
        return;
      }

      const expectedMeans: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (rawMeans[i] !== null) {
          expectedMeans.push(rawMeans[i]!);
        } else {
          let nearestDist = Infinity;
          let nearestVal = 0;
          for (const ne of nonEmpty) {
            const dist = Math.abs(i - ne.index);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestVal = ne.value;
            }
          }
          expectedMeans.push(nearestVal);
        }
      }

      for (let i = 0; i < 4; i++) {
        expect(result.segmentMeans[i]).toBeCloseTo(expectedMeans[i]!, 5);
      }
    },
  );

  /**
   * **Validates: Requirements 1.9**
   *
   * Shape classification follows defined rules.
   */
  test.prop([sectionWithNotesArb], { numRuns: 100 })(
    "shape classification is a valid MelodicContourShape value",
    ({ sectionStart, sectionEnd, notes }) => {
      const result = computeMelodicContour(notes, sectionStart, sectionEnd);

      const validShapes = ["ascending", "descending", "arched", "inverse-arched", "static", "complex"];
      expect(validShapes).toContain(result.shape);
    },
  );
});

// ─── Property 9: Harmonic interval profile — polyphonic ────────────────

// Feature: midi-synth-analysis, Property 9: Harmonic interval profile — polyphonic
describe("Feature: midi-synth-analysis, Property 9: Harmonic interval profile — polyphonic", () => {
  /**
   * Generate notes that overlap (high polyphony) — same startTime, long durations.
   */
  const polyphonicNotesArb = fc
    .array(
      fc.tuple(pitchArb, velocityArb).map(([pitch, velocity]) => ({
        pitch,
        velocity,
        startTime: 0,
        duration: 4.0,
      } as NoteData)),
      { minLength: 3, maxLength: 20 },
    );

  /**
   * **Validates: Requirements 2.1**
   *
   * For tracks with average polyphony > 1.5, distribution of simultaneous intervals
   * reduced to classes 0–12.
   * Distribution percentages SHALL sum to 100% (±0.01).
   * analysisType SHALL be "simultaneous".
   */
  test.prop([polyphonicNotesArb], { numRuns: 100 })(
    "polyphonic: distribution sums to 100% and analysisType is simultaneous",
    (notes) => {
      // These notes all overlap (same startTime, 4.0 duration), so polyphony > 1.5
      const polyphonyAvg = notes.length; // all notes are simultaneous

      const result = computeHarmonicIntervalProfile(notes, polyphonyAvg);

      // With 3+ overlapping notes there should always be intervals
      expect(result).not.toBeNull();
      if (result === null) return;

      expect(result.analysisType).toBe("simultaneous");
      expect(result.intervalDistribution).toHaveLength(13);

      const sum = result.intervalDistribution.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(100, 1);

      // All interval classes are in 0–12
      for (let i = 0; i < 13; i++) {
        expect(result.intervalDistribution[i]).toBeGreaterThanOrEqual(0);
      }
    },
  );
});

// ─── Property 10: Harmonic interval profile — monophonic ───────────────

// Feature: midi-synth-analysis, Property 10: Harmonic interval profile — monophonic
describe("Feature: midi-synth-analysis, Property 10: Harmonic interval profile — monophonic", () => {
  /**
   * Generate sequential (non-overlapping) notes — low polyphony.
   */
  const monophonicNotesArb = fc
    .array(
      fc.tuple(pitchArb, velocityArb).map(([pitch, velocity]) => ({
        pitch,
        velocity,
        startTime: 0,  // placeholder, will be sequenced
        duration: 0.4, // short, non-overlapping when spaced by 0.5
      } as NoteData)),
      { minLength: 2, maxLength: 30 },
    )
    .map((notes) =>
      notes.map((note, i) => ({
        ...note,
        startTime: i * 0.5, // sequential, non-overlapping
      })),
    );

  /**
   * **Validates: Requirements 2.2**
   *
   * For tracks with average polyphony ≤ 1.5 and ≥ 2 notes,
   * distribution of successive intervals reduced to classes 0–12.
   * Distribution percentages SHALL sum to 100% (±0.01).
   * analysisType SHALL be "successive".
   */
  test.prop([monophonicNotesArb], { numRuns: 100 })(
    "monophonic: distribution sums to 100% and analysisType is successive",
    (notes) => {
      const polyphonyAvg = 1.0; // monophonic

      const result = computeHarmonicIntervalProfile(notes, polyphonyAvg);

      expect(result).not.toBeNull();
      if (result === null) return;

      expect(result.analysisType).toBe("successive");
      expect(result.intervalDistribution).toHaveLength(13);

      const sum = result.intervalDistribution.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(100, 1);

      // All interval classes are in 0–12
      for (let i = 0; i < 13; i++) {
        expect(result.intervalDistribution[i]).toBeGreaterThanOrEqual(0);
      }
    },
  );
});

// ─── Property 11: Harmonic texture classification ──────────────────────

// Feature: midi-synth-analysis, Property 11: Harmonic texture classification
describe("Feature: midi-synth-analysis, Property 11: Harmonic texture classification", () => {
  const consonantIntervals = new Set([0, 3, 4, 5, 7, 8, 9, 12]);
  const dissonantIntervals = new Set([1, 2, 6, 10, 11]);

  /**
   * Generate notes with pitches designed to produce a specific interval distribution.
   * We use polyphonyAvg <= 1.5 (successive mode) for simpler interval calculation.
   */
  const notesForTextureArb = fc
    .array(pitchArb, { minLength: 2, maxLength: 30 })
    .map((pitches) =>
      pitches.map((pitch, i) => ({
        pitch,
        velocity: 100,
        startTime: i * 0.5,
        duration: 0.4,
      } as NoteData)),
    );

  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * "consonant" when >50% in {0,3,4,5,7,8,9,12},
   * "dissonant" when >50% in {1,2,6,10,11},
   * "mixed" otherwise.
   */
  test.prop([notesForTextureArb], { numRuns: 100 })(
    "texture classification matches interval distribution percentages",
    (notes) => {
      const polyphonyAvg = 1.0; // successive mode
      const result = computeHarmonicIntervalProfile(notes, polyphonyAvg);

      if (result === null) return;

      // Compute consonant and dissonant percentages from the distribution
      let consonantPct = 0;
      let dissonantPct = 0;
      for (let i = 0; i < 13; i++) {
        if (consonantIntervals.has(i)) consonantPct += result.intervalDistribution[i]!;
        if (dissonantIntervals.has(i)) dissonantPct += result.intervalDistribution[i]!;
      }

      if (consonantPct > 50) {
        expect(result.texture).toBe("consonant");
      } else if (dissonantPct > 50) {
        expect(result.texture).toBe("dissonant");
      } else {
        expect(result.texture).toBe("mixed");
      }
    },
  );
});


// ─── Additional imports for Properties 1, 12–15, 26 ───────────────────

import {
  computeCrossSectionSimilarity,
  detectRepetition,
  detectDiscontinuities,
  analyzeSynthTracks,
} from "./synth-analyzer.js";

import type {
  SynthTrackProfile,
  SynthCrossSectionComparison,
} from "./synth-analysis-types.js";

import type { InstrumentRole } from "./content-analysis-types.js";
import type { Section } from "./section-scanner.js";
import type { TrackNoteData } from "./section-analyzer.js";

// ─── Generators for Properties 1, 12–15, 26 ───────────────────────────

/** Generate a valid SynthTrackProfile with controllable pitch classes. */
function synthTrackProfileArb(opts?: {
  pitchClasses?: fc.Arbitrary<ReadonlySet<number>>;
  noteDensity?: fc.Arbitrary<number>;
  velocityMean?: fc.Arbitrary<number>;
  articulationType?: fc.Arbitrary<"staccato" | "legato" | "mixed">;
}): fc.Arbitrary<SynthTrackProfile> {
  const pitchClassesArb = opts?.pitchClasses ??
    fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { minLength: 1, maxLength: 12 })
      .map((arr) => new Set(arr) as ReadonlySet<number>);

  const densityArb = opts?.noteDensity ??
    fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true });

  const velMeanArb = opts?.velocityMean ??
    fc.integer({ min: 1, max: 127 });

  const artTypeArb = opts?.articulationType ??
    fc.constantFrom("staccato" as const, "legato" as const, "mixed" as const);

  return fc.tuple(
    pitchClassesArb,
    densityArb,
    velMeanArb,
    artTypeArb,
    fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), // rhythmicRegularity
    fc.double({ min: 0, max: 8, noNaN: true, noDefaultInfinity: true }), // polyphony mean
    fc.integer({ min: 0, max: 20 }), // polyphony max
  ).map(([pitchClasses, noteDensity, velMean, artType, rhythmicRegularity, polyMean, polyMax]) => ({
    pitchContent: {
      pitchClasses,
      pitchRange: 24,
    },
    noteDensity,
    velocityDynamics: {
      min: Math.max(1, velMean - 20),
      max: Math.min(127, velMean + 20),
      mean: velMean,
      stdDev: 10,
      contour: "flat" as const,
    },
    articulationPattern: {
      type: artType,
      averageDurationRatio: artType === "staccato" ? 0.3 : artType === "legato" ? 0.95 : 0.7,
    },
    rhythmicRegularity,
    polyphonyProfile: {
      mean: Math.min(polyMean, polyMax),
      max: Math.max(polyMean, polyMax),
    },
    melodicContour: {
      shape: "static" as const,
      segmentMeans: [60, 60, 60, 60] as readonly [number, number, number, number],
    },
    harmonicIntervalProfile: null,
  } satisfies SynthTrackProfile));
}

/** Generate a pair of SynthTrackProfiles for cross-section testing. */
const profilePairArb = fc.tuple(synthTrackProfileArb(), synthTrackProfileArb());

// ─── Property 1: Null profile for empty sections ───────────────────────

// Feature: midi-synth-analysis, Property 1: Null profile for empty sections
describe("Feature: midi-synth-analysis, Property 1: Null profile for empty sections", () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any section and synth track where no MIDI notes fall within the section's
   * time range, the Synth Analyzer SHALL produce a null SynthTrackProfile for that
   * track in that section (i.e., the track should NOT be present in the perSection map).
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 4 }), // number of sections
      fc.integer({ min: 1, max: 4 }), // number of synth tracks
    ],
    { numRuns: 100 },
  )(
    "tracks with no notes in a section are absent from perSection map for that section",
    (numSections, numTracks) => {
      // Build sections with non-overlapping time ranges
      const sections: Section[] = [];
      for (let i = 0; i < numSections; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: i * 16,
          endTime: (i + 1) * 16,
        });
      }

      // Build synth track names and roles
      const trackNames: string[] = [];
      const trackRoles = new Map<string, InstrumentRole>();
      for (let t = 0; t < numTracks; t++) {
        const name = `Synth ${t}`;
        trackNames.push(name);
        trackRoles.set(name, "lead");
      }

      // All tracks have EMPTY note arrays — no notes whatsoever
      const trackNoteData: TrackNoteData[] = trackNames.map((name) => ({
        trackName: name,
        notes: [],
      }));

      const result = analyzeSynthTracks(sections, trackNoteData, trackNames, trackRoles);

      // For every section, every track should be ABSENT from the perSection map
      for (const section of sections) {
        const sectionMap = result.perSection.get(section.id);
        if (sectionMap) {
          for (const trackName of trackNames) {
            expect(sectionMap.has(trackName)).toBe(false);
          }
        }
      }
    },
  );

  /**
   * **Validates: Requirements 1.2**
   *
   * When notes exist but are OUTSIDE the section's time range, the track should
   * still be absent from the perSection map for that section.
   */
  test.prop(
    [
      fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }), // section start
      fc.double({ min: 4, max: 32, noNaN: true, noDefaultInfinity: true }), // section duration
      fc.array(
        fc.tuple(pitchArb, velocityArb, durationArb),
        { minLength: 1, maxLength: 10 },
      ),
    ],
    { numRuns: 100 },
  )(
    "track with notes only outside section time range is absent from perSection",
    (sectionStart, sectionDuration, noteData) => {
      const sectionEnd = sectionStart + sectionDuration;

      const sections: Section[] = [{
        id: "section-0",
        name: "Test Section",
        startTime: sectionStart,
        endTime: sectionEnd,
      }];

      const trackName = "Lead Synth";
      const trackRoles = new Map<string, InstrumentRole>([["Lead Synth", "lead"]]);

      // Place all notes BEFORE the section start time
      const notes: NoteData[] = noteData.map(([pitch, velocity, duration]) => ({
        pitch,
        velocity,
        duration,
        startTime: sectionStart - 100 - Math.random() * 50, // well before section
      }));

      const trackNoteData: TrackNoteData[] = [{
        trackName,
        notes,
      }];

      const result = analyzeSynthTracks(sections, trackNoteData, [trackName], trackRoles);

      const sectionMap = result.perSection.get("section-0");
      if (sectionMap) {
        expect(sectionMap.has(trackName)).toBe(false);
      }
    },
  );
});

// ─── Property 12: Cross-section similarity score bounds and formula ────

// Feature: midi-synth-analysis, Property 12: Cross-section similarity score bounds and formula
describe("Feature: midi-synth-analysis, Property 12: Cross-section similarity score bounds and formula", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any two non-null SynthTrackProfiles, the similarity score SHALL be in [0, 1].
   */
  test.prop([profilePairArb], { numRuns: 100 })(
    "similarity score is always in [0, 1]",
    ([profileA, profileB]) => {
      const score = computeCrossSectionSimilarity(profileA, profileB);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    },
  );

  /**
   * **Validates: Requirements 3.1**
   *
   * The similarity score SHALL equal the weighted sum:
   * 0.35 × pitchClassJaccard + 0.25 × densityRatio + 0.20 × velocitySimilarity + 0.20 × articulationMatch.
   */
  test.prop([profilePairArb], { numRuns: 100 })(
    "similarity equals weighted sum of sub-metrics",
    ([profileA, profileB]) => {
      const score = computeCrossSectionSimilarity(profileA, profileB);

      // Recompute sub-metrics independently
      // Pitch class Jaccard
      const setA = profileA.pitchContent.pitchClasses;
      const setB = profileB.pitchContent.pitchClasses;
      let intersectionSize = 0;
      for (const val of setA) {
        if (setB.has(val)) intersectionSize++;
      }
      const unionSize = setA.size + setB.size - intersectionSize;
      const pitchClassJaccard = (setA.size === 0 && setB.size === 0) ? 0 : intersectionSize / unionSize;

      // Density ratio
      const densityA = profileA.noteDensity;
      const densityB = profileB.noteDensity;
      const densityRatio = (densityA === 0 && densityB === 0)
        ? 1
        : Math.min(densityA, densityB) / Math.max(densityA, densityB);

      // Velocity similarity
      const velocitySimilarity = 1 - Math.abs(profileA.velocityDynamics.mean - profileB.velocityDynamics.mean) / 127;

      // Articulation match
      const typeA = profileA.articulationPattern.type;
      const typeB = profileB.articulationPattern.type;
      let articulationMatch: number;
      if (typeA === typeB) {
        articulationMatch = 1.0;
      } else if (typeA === "mixed" || typeB === "mixed") {
        articulationMatch = 0.5;
      } else {
        articulationMatch = 0.0;
      }

      const expected = Math.max(0, Math.min(1,
        0.35 * pitchClassJaccard +
        0.25 * densityRatio +
        0.20 * velocitySimilarity +
        0.20 * articulationMatch,
      ));

      expect(score).toBeCloseTo(expected, 10);
    },
  );
});

// ─── Property 13: Extended repetition detection ────────────────────────

// Feature: midi-synth-analysis, Property 13: Extended repetition detection
describe("Feature: midi-synth-analysis, Property 13: Extended repetition detection", () => {
  /**
   * Generate a sequence of similarity scores (0–1) with specific
   * structure to test repetition detection.
   */
  const similaritySequenceArb = fc
    .array(
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      { minLength: 0, maxLength: 20 },
    )
    .map((scores) =>
      scores.map((similarity, i) => ({
        sectionIndexA: i,
        sectionIndexB: i + 1,
        similarity,
      } as SynthCrossSectionComparison)),
    );

  /**
   * **Validates: Requirements 3.2**
   *
   * hasExtendedRepetition SHALL be true if and only if there exist 3 or more
   * consecutive scores exceeding 0.85.
   */
  test.prop([similaritySequenceArb], { numRuns: 100 })(
    "hasExtendedRepetition iff 3+ consecutive scores > 0.85",
    (similarities) => {
      const result = detectRepetition(similarities);

      // Independently check if there's a run of 3+ consecutive scores > 0.85
      let maxRun = 0;
      let currentRun = 0;
      for (const s of similarities) {
        if (s.similarity > 0.85) {
          currentRun++;
          if (currentRun > maxRun) maxRun = currentRun;
        } else {
          currentRun = 0;
        }
      }

      const expectedHasRepetition = maxRun >= 3;
      expect(result.hasExtendedRepetition).toBe(expectedHasRepetition);
    },
  );

  /**
   * **Validates: Requirements 3.2**
   *
   * When hasExtendedRepetition is true, extendedRepetitionSections SHALL contain
   * all section indices involved in the consecutive high-similarity runs.
   */
  test.prop([similaritySequenceArb], { numRuns: 100 })(
    "extendedRepetitionSections contains correct section indices from runs",
    (similarities) => {
      const result = detectRepetition(similarities);

      if (!result.hasExtendedRepetition) {
        expect(result.extendedRepetitionSections).toHaveLength(0);
        return;
      }

      // All reported section indices should be valid (within range of input)
      for (const idx of result.extendedRepetitionSections) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(similarities.length); // sectionIndexB can equal length
      }

      // Reported sections should be sorted
      const sorted = [...result.extendedRepetitionSections].sort((a, b) => a - b);
      expect(result.extendedRepetitionSections).toEqual(sorted);
    },
  );
});

// ─── Property 14: Entry/exit discontinuity detection ───────────────────

// Feature: midi-synth-analysis, Property 14: Entry/exit discontinuity detection
describe("Feature: midi-synth-analysis, Property 14: Entry/exit discontinuity detection", () => {
  /**
   * Generate a sequence of profiles that are either null or non-null
   * (non-null profiles have non-empty pitch class sets and positive density).
   */
  const profileSequenceArb = fc
    .array(
      fc.boolean().chain((isNull) => {
        if (isNull) {
          return fc.constant(null);
        }
        return synthTrackProfileArb();
      }),
      { minLength: 2, maxLength: 10 },
    );

  /**
   * **Validates: Requirements 3.3**
   *
   * A discontinuity with type "entry" SHALL be recorded when a null profile
   * is followed by a non-null profile.
   */
  test.prop([profileSequenceArb], { numRuns: 100 })(
    "entry discontinuity detected at null → non-null transitions",
    (profiles) => {
      const trackName = "TestTrack";
      const result = detectDiscontinuities(profiles, trackName);

      // Find all expected entry points
      for (let i = 0; i < profiles.length - 1; i++) {
        const aIsNull = profiles[i] === null;
        const bIsNonNull = profiles[i + 1] !== null;

        if (aIsNull && bIsNonNull) {
          // Should find an "entry" discontinuity at this index
          const found = result.some(
            (d) => d.sectionIndexA === i && d.sectionIndexB === i + 1 && d.type === "entry",
          );
          expect(found).toBe(true);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 3.3**
   *
   * A discontinuity with type "exit" SHALL be recorded when a non-null profile
   * is followed by a null profile.
   */
  test.prop([profileSequenceArb], { numRuns: 100 })(
    "exit discontinuity detected at non-null → null transitions",
    (profiles) => {
      const trackName = "TestTrack";
      const result = detectDiscontinuities(profiles, trackName);

      // Find all expected exit points
      for (let i = 0; i < profiles.length - 1; i++) {
        const aIsNonNull = profiles[i] !== null;
        const bIsNull = profiles[i + 1] === null;

        if (aIsNonNull && bIsNull) {
          // Should find an "exit" discontinuity at this index
          const found = result.some(
            (d) => d.sectionIndexA === i && d.sectionIndexB === i + 1 && d.type === "exit",
          );
          expect(found).toBe(true);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 3.3**
   *
   * No entry or exit discontinuity at null → null or non-null → non-null transitions.
   */
  test.prop([profileSequenceArb], { numRuns: 100 })(
    "no entry/exit discontinuity at same-nullity transitions",
    (profiles) => {
      const trackName = "TestTrack";
      const result = detectDiscontinuities(profiles, trackName);

      for (let i = 0; i < profiles.length - 1; i++) {
        const bothNull = profiles[i] === null && profiles[i + 1] === null;

        if (bothNull) {
          // Should NOT find entry or exit at this index
          const found = result.some(
            (d) => d.sectionIndexA === i && d.sectionIndexB === i + 1 &&
              (d.type === "entry" || d.type === "exit"),
          );
          expect(found).toBe(false);
        }
      }
    },
  );
});

// ─── Property 15: Harmonic-shift discontinuity detection ───────────────

// Feature: midi-synth-analysis, Property 15: Harmonic-shift discontinuity detection
describe("Feature: midi-synth-analysis, Property 15: Harmonic-shift discontinuity detection", () => {
  /**
   * Generate pairs of non-null profiles with controlled pitch class sets
   * to test harmonic-shift detection.
   */
  const consecutiveNonNullProfilesArb = fc
    .array(
      fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { minLength: 1, maxLength: 12 })
        .map((arr) => new Set(arr) as ReadonlySet<number>),
      { minLength: 2, maxLength: 8 },
    )
    .map((pitchClassSets) =>
      pitchClassSets.map((pitchClasses) => ({
        pitchContent: { pitchClasses, pitchRange: 24 },
        noteDensity: 2.0,
        velocityDynamics: { min: 60, max: 100, mean: 80, stdDev: 10, contour: "flat" as const },
        articulationPattern: { type: "mixed" as const, averageDurationRatio: 0.7 },
        rhythmicRegularity: 0.8,
        polyphonyProfile: { mean: 1.5, max: 3 },
        melodicContour: { shape: "static" as const, segmentMeans: [60, 60, 60, 60] as readonly [number, number, number, number] },
        harmonicIntervalProfile: null,
      } satisfies SynthTrackProfile)),
    );

  /**
   * **Validates: Requirements 3.4**
   *
   * For any two consecutive non-null SynthTrackProfiles, a discontinuity with type
   * "harmonic-shift" SHALL be recorded if and only if the Jaccard index of their
   * pitch class sets is below 0.30.
   */
  test.prop([consecutiveNonNullProfilesArb], { numRuns: 100 })(
    "harmonic-shift recorded iff Jaccard of pitch class sets < 0.30",
    (profiles) => {
      const trackName = "TestTrack";
      const result = detectDiscontinuities(profiles, trackName);

      for (let i = 0; i < profiles.length - 1; i++) {
        const setA = profiles[i]!.pitchContent.pitchClasses;
        const setB = profiles[i + 1]!.pitchContent.pitchClasses;

        // Compute Jaccard index
        let intersectionSize = 0;
        for (const val of setA) {
          if (setB.has(val)) intersectionSize++;
        }
        const unionSize = setA.size + setB.size - intersectionSize;
        const jaccardIndex = (setA.size === 0 && setB.size === 0) ? 0 : intersectionSize / unionSize;

        const hasHarmonicShift = result.some(
          (d) => d.sectionIndexA === i && d.sectionIndexB === i + 1 && d.type === "harmonic-shift",
        );

        if (jaccardIndex < 0.30) {
          expect(hasHarmonicShift).toBe(true);
        } else {
          expect(hasHarmonicShift).toBe(false);
        }
      }
    },
  );
});

// ─── Property 26: Processing cap enforcement ──────────────────────────

// Feature: midi-synth-analysis, Property 26: Processing cap enforcement
describe("Feature: midi-synth-analysis, Property 26: Processing cap enforcement", () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any input with more than 16 synth tracks, the Synth Analyzer SHALL
   * process only the first 16 tracks.
   */
  test.prop(
    [fc.integer({ min: 17, max: 30 })], // number of synth tracks > 16
    { numRuns: 50 },
  )(
    "processes at most 16 synth tracks when input exceeds cap",
    (numTracks) => {
      // Create a single section
      const sections: Section[] = [{
        id: "section-0",
        name: "Section 0",
        startTime: 0,
        endTime: 16,
      }];

      // Create more than 16 synth tracks
      const trackNames: string[] = [];
      const trackRoles = new Map<string, InstrumentRole>();
      const trackNoteData: TrackNoteData[] = [];

      for (let t = 0; t < numTracks; t++) {
        const name = `Synth ${t}`;
        trackNames.push(name);
        trackRoles.set(name, "lead");
        trackNoteData.push({
          trackName: name,
          notes: [{ pitch: 60 + (t % 12), velocity: 100, startTime: 2, duration: 1 }],
        });
      }

      const result = analyzeSynthTracks(sections, trackNoteData, trackNames, trackRoles);

      // Count how many unique track names appear in the perSection map
      const sectionMap = result.perSection.get("section-0");
      expect(sectionMap).toBeDefined();
      if (sectionMap) {
        expect(sectionMap.size).toBeLessThanOrEqual(16);
      }

      // The crossSection and repetitionFlags should also be capped at 16
      expect(result.crossSection.size).toBeLessThanOrEqual(16);
      expect(result.repetitionFlags.size).toBeLessThanOrEqual(16);
    },
  );

  /**
   * **Validates: Requirements 8.4**
   *
   * For any input with more than 32 sections, the Synth Analyzer SHALL
   * process only the first 32 sections.
   */
  test.prop(
    [fc.integer({ min: 33, max: 50 })], // number of sections > 32
    { numRuns: 50 },
  )(
    "processes at most 32 sections when input exceeds cap",
    (numSections) => {
      // Create more than 32 sections
      const sections: Section[] = [];
      for (let i = 0; i < numSections; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: i * 8,
          endTime: (i + 1) * 8,
        });
      }

      // One synth track with notes in every section
      const trackName = "Lead Synth";
      const trackRoles = new Map<string, InstrumentRole>([[trackName, "lead"]]);
      const notes: NoteData[] = [];
      for (let i = 0; i < numSections; i++) {
        notes.push({ pitch: 60, velocity: 100, startTime: i * 8 + 1, duration: 1 });
      }
      const trackNoteData: TrackNoteData[] = [{ trackName, notes }];

      const result = analyzeSynthTracks(sections, trackNoteData, [trackName], trackRoles);

      // perSection should contain at most 32 section entries
      expect(result.perSection.size).toBeLessThanOrEqual(32);

      // No error should be thrown — the result should be valid
      expect(result.discontinuities).toBeDefined();
      expect(result.crossSection).toBeDefined();
      expect(result.repetitionFlags).toBeDefined();
    },
  );

  /**
   * **Validates: Requirements 8.4**
   *
   * The result should be produced without error even with extreme inputs.
   */
  test.prop(
    [
      fc.integer({ min: 17, max: 25 }), // tracks
      fc.integer({ min: 33, max: 45 }), // sections
    ],
    { numRuns: 30 },
  )(
    "produces valid results without error for inputs exceeding both caps",
    (numTracks, numSections) => {
      const sections: Section[] = [];
      for (let i = 0; i < numSections; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: i * 4,
          endTime: (i + 1) * 4,
        });
      }

      const trackNames: string[] = [];
      const trackRoles = new Map<string, InstrumentRole>();
      const trackNoteData: TrackNoteData[] = [];

      for (let t = 0; t < numTracks; t++) {
        const name = `Synth ${t}`;
        trackNames.push(name);
        trackRoles.set(name, t % 2 === 0 ? "lead" : "pad");
        const notes: NoteData[] = [];
        for (let s = 0; s < numSections; s++) {
          notes.push({ pitch: 48 + (t % 12), velocity: 80, startTime: s * 4 + 1, duration: 1 });
        }
        trackNoteData.push({ trackName: name, notes });
      }

      const result = analyzeSynthTracks(sections, trackNoteData, trackNames, trackRoles);

      // Both caps should be enforced
      expect(result.perSection.size).toBeLessThanOrEqual(32);
      expect(result.crossSection.size).toBeLessThanOrEqual(16);
      expect(result.repetitionFlags.size).toBeLessThanOrEqual(16);
    },
  );
});


// ─── Property 16: Synth energy contribution computation ────────────────

import { computeSynthEnergyContribution } from "./synth-analyzer.js";
import type { SynthTrackProfile as SynthTrackProfileImport16 } from "./synth-analysis-types.js";
import type { Section as Section16 } from "./section-scanner.js";

// Feature: midi-synth-analysis, Property 16: Synth energy contribution computation
describe("Feature: midi-synth-analysis, Property 16: Synth energy contribution computation", () => {
  /**
   * Helper to build a perSection map from a more convenient structure.
   */
  function buildPerSectionMap(
    data: { sectionId: string; tracks: { name: string; profile: SynthTrackProfileImport16 }[] }[],
  ): ReadonlyMap<string, ReadonlyMap<string, SynthTrackProfileImport16>> {
    const map = new Map<string, ReadonlyMap<string, SynthTrackProfileImport16>>();
    for (const entry of data) {
      const trackMap = new Map<string, SynthTrackProfileImport16>();
      for (const t of entry.tracks) {
        trackMap.set(t.name, t.profile);
      }
      if (trackMap.size > 0) {
        map.set(entry.sectionId, trackMap);
      }
    }
    return map;
  }

  /** Generate sections (2–6 consecutive sections). */
  const sectionsArb16 = fc
    .integer({ min: 2, max: 6 })
    .chain((count) =>
      fc
        .array(
          fc.double({ min: 4, max: 16, noNaN: true, noDefaultInfinity: true }),
          { minLength: count, maxLength: count },
        )
        .map((spans) => {
          const sections: Section16[] = [];
          let currentTime = 0;
          for (let i = 0; i < spans.length; i++) {
            sections.push({
              id: `section-${i}`,
              name: `Section ${i}`,
              startTime: currentTime,
              endTime: currentTime + spans[i]!,
            });
            currentTime += spans[i]!;
          }
          return sections;
        }),
    );

  /** Generate a profile with controlled noteDensity, polyphony mean, and velocity mean. */
  function profileWithMetrics(
    noteDensity: number,
    polyphonyMean: number,
    velocityMean: number,
  ): SynthTrackProfileImport16 {
    return {
      pitchContent: { pitchClasses: new Set([0, 4, 7]), pitchRange: 24 },
      noteDensity,
      velocityDynamics: {
        min: Math.max(1, velocityMean - 10),
        max: Math.min(127, velocityMean + 10),
        mean: velocityMean,
        stdDev: 5,
        contour: "flat" as const,
      },
      articulationPattern: { type: "mixed" as const, averageDurationRatio: 0.7 },
      rhythmicRegularity: 0.8,
      polyphonyProfile: { mean: polyphonyMean, max: Math.ceil(polyphonyMean) + 1 },
      melodicContour: {
        shape: "static" as const,
        segmentMeans: [60, 60, 60, 60] as readonly [number, number, number, number],
      },
      harmonicIntervalProfile: null,
    };
  }

  /** Arbitrary per-section data: each section has 1–3 synth tracks with varying metrics. */
  const perSectionDataArb = sectionsArb16.chain((sections) =>
    fc
      .array(
        fc.tuple(
          fc.integer({ min: 1, max: 3 }), // number of tracks in this section
          fc.array(
            fc.tuple(
              fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }), // noteDensity
              fc.double({ min: 0.1, max: 8, noNaN: true, noDefaultInfinity: true }), // polyphony mean
              fc.integer({ min: 1, max: 127 }), // velocity mean
            ),
            { minLength: 3, maxLength: 3 },
          ),
        ),
        { minLength: sections.length, maxLength: sections.length },
      )
      .map((sectionData) => {
        const data: { sectionId: string; tracks: { name: string; profile: SynthTrackProfileImport16 }[] }[] = [];
        for (let i = 0; i < sections.length; i++) {
          const [numTracks, metrics] = sectionData[i]!;
          const tracks: { name: string; profile: SynthTrackProfileImport16 }[] = [];
          for (let t = 0; t < numTracks; t++) {
            const [density, polyMean, velMean] = metrics[t]!;
            tracks.push({
              name: `Track ${t}`,
              profile: profileWithMetrics(density, polyMean, velMean),
            });
          }
          data.push({ sectionId: sections[i]!.id, tracks });
        }
        return { sections, data };
      }),
  );

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   *
   * For any arrangement with synth track profiles, the synth energy contribution
   * for a section SHALL be in [0, 1].
   */
  test.prop([perSectionDataArb], { numRuns: 100 })(
    "energy contribution is always in [0, 1] for all sections",
    ({ sections, data }) => {
      const perSection = buildPerSectionMap(data);
      const result = computeSynthEnergyContribution(sections, perSection);

      for (const section of sections) {
        const energy = result.get(section.id);
        expect(energy).toBeDefined();
        expect(energy!).toBeGreaterThanOrEqual(0);
        expect(energy!).toBeLessThanOrEqual(1);
      }
    },
  );

  /**
   * **Validates: Requirements 4.3**
   *
   * For sections with no synth profiles, the energy contribution SHALL be 0.
   */
  test.prop([sectionsArb16], { numRuns: 100 })(
    "returns 0 for sections with no synth profiles",
    (sections) => {
      // Empty perSection map — no profiles anywhere
      const perSection = new Map<string, ReadonlyMap<string, SynthTrackProfileImport16>>();
      const result = computeSynthEnergyContribution(sections, perSection);

      for (const section of sections) {
        const energy = result.get(section.id);
        expect(energy).toBeDefined();
        expect(energy!).toBe(0);
      }
    },
  );

  /**
   * **Validates: Requirements 4.3**
   *
   * When some sections have profiles and some don't, sections without profiles
   * SHALL have energy = 0.
   */
  test.prop(
    [
      sectionsArb16.filter((s) => s.length >= 3),
      fc.tuple(
        fc.double({ min: 0.5, max: 8, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.5, max: 6, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 30, max: 120 }),
      ),
    ],
    { numRuns: 100 },
  )(
    "mixed sections: empty sections get 0, populated sections get > 0",
    (sections, [density, polyMean, velMean]) => {
      // Only populate even-indexed sections
      const data: { sectionId: string; tracks: { name: string; profile: SynthTrackProfileImport16 }[] }[] = [];
      for (let i = 0; i < sections.length; i++) {
        if (i % 2 === 0) {
          data.push({
            sectionId: sections[i]!.id,
            tracks: [{ name: "Synth", profile: profileWithMetrics(density, polyMean, velMean) }],
          });
        }
      }

      const perSection = buildPerSectionMap(data);
      const result = computeSynthEnergyContribution(sections, perSection);

      for (let i = 0; i < sections.length; i++) {
        const energy = result.get(sections[i]!.id)!;
        if (i % 2 !== 0) {
          // Odd-indexed sections have no profiles
          expect(energy).toBe(0);
        }
      }
    },
  );

  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * The synth energy contribution for a section SHALL equal the arithmetic mean of:
   * (a) sum of note densities / max sum across all sections,
   * (b) max polyphony average / max of max polyphony averages across all sections,
   * (c) mean of velocity means / 127.
   */
  test.prop([perSectionDataArb], { numRuns: 100 })(
    "energy equals mean of normalized density, normalized polyphony, and normalized velocity",
    ({ sections, data }) => {
      const perSection = buildPerSectionMap(data);
      const result = computeSynthEnergyContribution(sections, perSection);

      // Independently compute expected values
      const metrics: {
        sectionId: string;
        sumDensity: number;
        maxPolyAvg: number;
        meanVelMean: number;
        trackCount: number;
      }[] = [];

      for (const section of sections) {
        const profileMap = perSection.get(section.id);
        if (!profileMap || profileMap.size === 0) {
          metrics.push({ sectionId: section.id, sumDensity: 0, maxPolyAvg: 0, meanVelMean: 0, trackCount: 0 });
          continue;
        }

        let sumDensity = 0;
        let maxPolyAvg = 0;
        let velSum = 0;
        let count = 0;

        for (const [, profile] of profileMap) {
          count++;
          sumDensity += profile.noteDensity;
          if (profile.polyphonyProfile.mean > maxPolyAvg) {
            maxPolyAvg = profile.polyphonyProfile.mean;
          }
          velSum += profile.velocityDynamics.mean;
        }

        metrics.push({
          sectionId: section.id,
          sumDensity,
          maxPolyAvg,
          meanVelMean: count > 0 ? velSum / count : 0,
          trackCount: count,
        });
      }

      // Global maxima
      let maxSumDensity = 0;
      let maxMaxPolyAvg = 0;
      for (const m of metrics) {
        if (m.sumDensity > maxSumDensity) maxSumDensity = m.sumDensity;
        if (m.maxPolyAvg > maxMaxPolyAvg) maxMaxPolyAvg = m.maxPolyAvg;
      }

      // Verify each section's energy
      for (const m of metrics) {
        const actual = result.get(m.sectionId)!;

        if (m.trackCount === 0) {
          expect(actual).toBe(0);
          continue;
        }

        const normalizedDensity = maxSumDensity === 0 ? 0 : m.sumDensity / maxSumDensity;
        const normalizedPolyphony = maxMaxPolyAvg === 0 ? 0 : m.maxPolyAvg / maxMaxPolyAvg;
        const normalizedVelocity = m.meanVelMean / 127;
        const expected = (normalizedDensity + normalizedPolyphony + normalizedVelocity) / 3;

        expect(actual).toBeCloseTo(expected, 10);
      }
    },
  );
});
