/**
 * Unit tests for computePatternFingerprint in content-analyzer.ts
 */

import { describe, it, expect } from "vitest";
import { computePatternFingerprint, computeSimilarityScore } from "./content-analyzer.js";
import type { NoteData } from "../ableton/sdk-adapter.js";
import type { PatternFingerprint } from "./content-analysis-types.js";

describe("computePatternFingerprint", () => {
  // ─── Neutral / empty cases ────────────────────────────────────────────

  it("returns neutral fingerprint for empty notes array", () => {
    const result = computePatternFingerprint([], 0, 16);
    expect(result.pitchClasses.size).toBe(0);
    expect(result.rhythmicPositions).toEqual([]);
    expect(result.velocityContour).toEqual([0, 0, 0, 0]);
    expect(result.density).toBe(0);
    expect(result.barCount).toBe(4);
  });

  it("returns neutral fingerprint for zero-length section", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 5, duration: 1, velocity: 100 },
    ];
    const result = computePatternFingerprint(notes, 8, 8);
    expect(result.pitchClasses.size).toBe(0);
    expect(result.rhythmicPositions).toEqual([]);
    expect(result.velocityContour).toEqual([]);
    expect(result.density).toBe(0);
    expect(result.barCount).toBe(0);
  });

  it("returns neutral fingerprint when no notes fall within section range", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      { pitch: 64, startTime: 20, duration: 1, velocity: 80 },
    ];
    const result = computePatternFingerprint(notes, 4, 16);
    expect(result.pitchClasses.size).toBe(0);
    expect(result.density).toBe(0);
    expect(result.barCount).toBe(3);
  });

  // ─── Pitch classes ────────────────────────────────────────────────────

  it("computes pitch classes as mod 12", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 }, // C → 0
      { pitch: 72, startTime: 1, duration: 1, velocity: 100 }, // C (octave up) → 0
      { pitch: 64, startTime: 2, duration: 1, velocity: 100 }, // E → 4
      { pitch: 67, startTime: 3, duration: 1, velocity: 100 }, // G → 7
    ];
    const result = computePatternFingerprint(notes, 0, 8);
    expect(result.pitchClasses).toEqual(new Set([0, 4, 7]));
  });

  // ─── Rhythmic positions ───────────────────────────────────────────────

  it("quantizes rhythmic positions to 16th notes (0-15)", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 100 },   // beat 0 → pos 0
      { pitch: 60, startTime: 1, duration: 0.5, velocity: 100 },   // beat 1 → pos 4
      { pitch: 60, startTime: 2, duration: 0.5, velocity: 100 },   // beat 2 → pos 8
      { pitch: 60, startTime: 3, duration: 0.5, velocity: 100 },   // beat 3 → pos 12
    ];
    const result = computePatternFingerprint(notes, 0, 4);
    expect(result.rhythmicPositions).toEqual([0, 4, 8, 12]);
  });

  it("wraps rhythmic positions across bars correctly", () => {
    // Note at beat 5 in a section starting at 0: (5 % 4) * 4 = 4 → position 4
    const notes: NoteData[] = [
      { pitch: 60, startTime: 5, duration: 0.5, velocity: 100 },
    ];
    const result = computePatternFingerprint(notes, 0, 8);
    expect(result.rhythmicPositions).toEqual([4]);
  });

  it("handles 16th note grid positions", () => {
    // Note at 0.25 beats into bar: (0.25 % 4) * 4 = 1 → position 1
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0.25, duration: 0.25, velocity: 100 },
    ];
    const result = computePatternFingerprint(notes, 0, 4);
    expect(result.rhythmicPositions).toEqual([1]);
  });

  // ─── Velocity contour ─────────────────────────────────────────────────

  it("computes average velocity per bar normalized by 127", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 127 },  // bar 0, full velocity
      { pitch: 60, startTime: 4, duration: 1, velocity: 64 },   // bar 1, ~half velocity
    ];
    const result = computePatternFingerprint(notes, 0, 8);
    expect(result.velocityContour[0]).toBeCloseTo(1.0);          // 127/127
    expect(result.velocityContour[1]).toBeCloseTo(64 / 127);     // 64/127
  });

  it("averages multiple notes in the same bar", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 100 },
      { pitch: 64, startTime: 1, duration: 0.5, velocity: 50 },
    ];
    const result = computePatternFingerprint(notes, 0, 4);
    // avg velocity = (100 + 50) / 2 = 75; normalized = 75 / 127
    expect(result.velocityContour[0]).toBeCloseTo(75 / 127);
  });

  it("leaves empty bars at 0 in velocity contour", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      // bar 1 empty
      { pitch: 60, startTime: 8, duration: 1, velocity: 80 },
    ];
    const result = computePatternFingerprint(notes, 0, 12);
    expect(result.velocityContour[0]).toBeCloseTo(100 / 127);
    expect(result.velocityContour[1]).toBe(0);
    expect(result.velocityContour[2]).toBeCloseTo(80 / 127);
  });

  // ─── Density ──────────────────────────────────────────────────────────

  it("computes density as notes per beat", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 100 },
      { pitch: 64, startTime: 1, duration: 0.5, velocity: 100 },
      { pitch: 67, startTime: 2, duration: 0.5, velocity: 100 },
      { pitch: 72, startTime: 3, duration: 0.5, velocity: 100 },
    ];
    // 4 notes / 4 beats = 1 note per beat
    const result = computePatternFingerprint(notes, 0, 4);
    expect(result.density).toBe(1);
  });

  it("computes density for a longer section", () => {
    const notes: NoteData[] = Array.from({ length: 16 }, (_, i) => ({
      pitch: 60,
      startTime: i,
      duration: 0.5,
      velocity: 100,
    }));
    // 16 notes / 16 beats = 1 note per beat
    const result = computePatternFingerprint(notes, 0, 16);
    expect(result.density).toBe(1);
  });

  // ─── Bar count ────────────────────────────────────────────────────────

  it("computes bar count correctly for section spanning multiple bars", () => {
    const result = computePatternFingerprint([], 0, 32);
    expect(result.barCount).toBe(8);
  });

  it("rounds up bar count for non-aligned section lengths", () => {
    // 6 beats = 1.5 bars → ceil = 2
    const result = computePatternFingerprint([], 0, 6);
    expect(result.barCount).toBe(2);
  });

  // ─── Section offset ───────────────────────────────────────────────────

  it("correctly offsets calculations from sectionStart", () => {
    const notes: NoteData[] = [
      { pitch: 48, startTime: 16, duration: 1, velocity: 90 },  // at sectionStart
      { pitch: 52, startTime: 17, duration: 1, velocity: 110 }, // 1 beat into section
    ];
    const result = computePatternFingerprint(notes, 16, 32);
    expect(result.pitchClasses).toEqual(new Set([0, 4])); // 48%12=0, 52%12=4
    expect(result.density).toBeCloseTo(2 / 16);
    expect(result.barCount).toBe(4);
    // beat 0 in section → pos 0; beat 1 in section → pos 4
    expect(result.rhythmicPositions).toEqual([0, 4]);
  });

  // ─── Only includes notes within section range ─────────────────────────

  it("excludes notes outside the section range", () => {
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 },  // before section
      { pitch: 64, startTime: 4, duration: 1, velocity: 80 },   // in section
      { pitch: 67, startTime: 8, duration: 1, velocity: 60 },   // at sectionEnd (excluded)
    ];
    const result = computePatternFingerprint(notes, 4, 8);
    expect(result.pitchClasses).toEqual(new Set([4])); // only 64%12=4
    expect(result.density).toBeCloseTo(1 / 4);
    expect(result.barCount).toBe(1);
  });
});


describe("computeSimilarityScore", () => {
  // Helper to create a fingerprint from parts
  function makeFingerprint(overrides: Partial<PatternFingerprint> = {}): PatternFingerprint {
    return {
      pitchClasses: overrides.pitchClasses ?? new Set<number>(),
      rhythmicPositions: overrides.rhythmicPositions ?? [],
      velocityContour: overrides.velocityContour ?? [],
      density: overrides.density ?? 0,
      barCount: overrides.barCount ?? 4,
    };
  }

  // ─── Identical fingerprints ─────────────────────────────────────────

  it("returns 1.0 for identical non-empty fingerprints", () => {
    const fp = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.8, 0.7, 0.9, 0.8],
      density: 2,
    });
    const score = computeSimilarityScore(fp, fp);
    expect(score).toBeCloseTo(1.0);
  });

  // ─── Both empty fingerprints ────────────────────────────────────────

  it("returns 0 for two empty fingerprints", () => {
    const fp = makeFingerprint();
    const score = computeSimilarityScore(fp, fp);
    expect(score).toBe(0);
  });

  // ─── Completely different fingerprints ──────────────────────────────

  it("returns low score for completely disjoint patterns", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 2, 4]),
      rhythmicPositions: [0, 4, 8],
      velocityContour: [1.0, 0.0, 1.0, 0.0],
      density: 4,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([6, 8, 10]),
      rhythmicPositions: [1, 5, 9],
      velocityContour: [0.0, 1.0, 0.0, 1.0],
      density: 0.5,
    });
    const score = computeSimilarityScore(a, b);
    expect(score).toBeLessThan(0.5);
  });

  // ─── Division by zero guards ────────────────────────────────────────

  it("handles empty pitch class sets (Jaccard = 0)", () => {
    const a = makeFingerprint({
      pitchClasses: new Set<number>(),
      rhythmicPositions: [0, 4],
      velocityContour: [0.5, 0.5],
      density: 1,
    });
    const b = makeFingerprint({
      pitchClasses: new Set<number>(),
      rhythmicPositions: [0, 4],
      velocityContour: [0.5, 0.5],
      density: 1,
    });
    const score = computeSimilarityScore(a, b);
    // pitch Jaccard = 0, rhythmic = 1, velocity = 1, density = 1
    // 0.35*0 + 0.30*1 + 0.20*1 + 0.15*1 = 0.65
    expect(score).toBeCloseTo(0.65);
  });

  it("handles zero density in both fingerprints", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0]),
      rhythmicPositions: [0],
      velocityContour: [0.5],
      density: 0,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([0]),
      rhythmicPositions: [0],
      velocityContour: [0.5],
      density: 0,
    });
    const score = computeSimilarityScore(a, b);
    // pitch = 1, rhythmic = 1, velocity = 1, density = 0
    // 0.35*1 + 0.30*1 + 0.20*1 + 0.15*0 = 0.85
    expect(score).toBeCloseTo(0.85);
  });

  it("handles empty velocity contours (returns 0 for that component)", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [],
      density: 2,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [],
      density: 2,
    });
    const score = computeSimilarityScore(a, b);
    // pitch = 1, rhythmic = 1, velocity = 0 (empty), density = 1
    // 0.35*1 + 0.30*1 + 0.20*0 + 0.15*1 = 0.80
    expect(score).toBeCloseTo(0.80);
  });

  // ─── Partial overlap ────────────────────────────────────────────────

  it("produces mid-range score for partially overlapping patterns", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 2, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.8, 0.6, 0.7, 0.8],
      density: 2,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([0, 4, 5, 9]),
      rhythmicPositions: [0, 4, 6, 10],
      velocityContour: [0.7, 0.5, 0.8, 0.7],
      density: 1.5,
    });
    const score = computeSimilarityScore(a, b);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.9);
  });

  // ─── Score always in [0, 1] ─────────────────────────────────────────

  it("score is always in [0, 1] range", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      rhythmicPositions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      velocityContour: [1, 1, 1, 1],
      density: 10,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([6]),
      rhythmicPositions: [7],
      velocityContour: [0.1, 0.9, 0.1, 0.9],
      density: 0.1,
    });
    const score = computeSimilarityScore(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  // ─── Density ratio component ────────────────────────────────────────

  it("density ratio is min/max when both non-zero", () => {
    const a = makeFingerprint({
      pitchClasses: new Set<number>(),
      rhythmicPositions: [],
      velocityContour: [],
      density: 2,
    });
    const b = makeFingerprint({
      pitchClasses: new Set<number>(),
      rhythmicPositions: [],
      velocityContour: [],
      density: 4,
    });
    const score = computeSimilarityScore(a, b);
    // All components 0 except density: min(2,4)/max(2,4) = 0.5
    // 0.35*0 + 0.30*0 + 0.20*0 + 0.15*0.5 = 0.075
    expect(score).toBeCloseTo(0.075);
  });

  // ─── Velocity contour with anti-correlated vectors ──────────────────

  it("produces low velocity component for anti-correlated contours", () => {
    const a = makeFingerprint({
      pitchClasses: new Set<number>(),
      rhythmicPositions: [],
      velocityContour: [1, 0, 1, 0],
      density: 0,
    });
    const b = makeFingerprint({
      pitchClasses: new Set<number>(),
      rhythmicPositions: [],
      velocityContour: [0, 1, 0, 1],
      density: 0,
    });
    const score = computeSimilarityScore(a, b);
    // cosine similarity of [1,0,1,0] and [0,1,0,1] = 0, normalized to (0+1)/2 = 0.5
    // Only velocity component contributes: 0.20 * 0.5 = 0.10
    expect(score).toBeCloseTo(0.10);
  });

  // ─── Mismatched velocity contour lengths ────────────────────────────

  it("handles velocity contours of different lengths", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0]),
      rhythmicPositions: [0],
      velocityContour: [0.8, 0.7, 0.6],
      density: 1,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([0]),
      rhythmicPositions: [0],
      velocityContour: [0.8, 0.7],
      density: 1,
    });
    const score = computeSimilarityScore(a, b);
    // Should still produce a valid score in [0, 1]
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  // ─── Symmetry ───────────────────────────────────────────────────────

  it("is symmetric: score(a, b) === score(b, a)", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8],
      velocityContour: [0.9, 0.5, 0.7, 0.8],
      density: 3,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([2, 5, 9]),
      rhythmicPositions: [2, 6, 10],
      velocityContour: [0.4, 0.8, 0.3, 0.6],
      density: 1.5,
    });
    expect(computeSimilarityScore(a, b)).toBeCloseTo(computeSimilarityScore(b, a));
  });
});


import { classifyInstrumentRole, detectPhraseLength, detectFills, classifyPercussionPattern } from "./content-analyzer.js";
import type { InstrumentRole, DrumPadMap, DrumPadEntry } from "./content-analysis-types.js";

describe("classifyInstrumentRole", () => {
  // ─── DrumRack override (Step 0) ─────────────────────────────────────

  it("returns 'drums' when hasDrumRack is true regardless of notes or name", () => {
    const bassNotes: NoteData[] = [
      { pitch: 36, startTime: 0, duration: 2, velocity: 100 },
      { pitch: 38, startTime: 2, duration: 2, velocity: 100 },
    ];
    expect(classifyInstrumentRole(bassNotes, "Bass Synth", true)).toBe("drums");
  });

  it("returns 'drums' with hasDrumRack even for empty notes", () => {
    expect(classifyInstrumentRole([], "My Track", true)).toBe("drums");
  });

  // ─── Track name keywords (Step 1) ───────────────────────────────────

  it("returns 'drums' when track name contains 'drum' (case insensitive)", () => {
    expect(classifyInstrumentRole([], "Drum Kit")).toBe("drums");
  });

  it("returns 'drums' when track name contains 'kick'", () => {
    expect(classifyInstrumentRole([], "Kick Layer")).toBe("drums");
  });

  it("returns 'drums' when track name contains 'hat'", () => {
    expect(classifyInstrumentRole([], "Hi-Hat")).toBe("drums");
  });

  it("returns 'drums' when track name contains 'snare'", () => {
    expect(classifyInstrumentRole([], "Snare Fill")).toBe("drums");
  });

  it("returns 'drums' when track name contains 'perc'", () => {
    expect(classifyInstrumentRole([], "Percussion")).toBe("drums");
  });

  // ─── Track name keyword hints (Step 4 fallback for non-drum names) ──

  it("returns 'bass' from track name when notes are empty", () => {
    expect(classifyInstrumentRole([], "Bass")).toBe("bass");
  });

  it("returns 'lead' from track name when notes are empty", () => {
    expect(classifyInstrumentRole([], "Lead Synth")).toBe("lead");
  });

  it("returns 'lead' from track name when name contains 'melody'", () => {
    expect(classifyInstrumentRole([], "Main Melody")).toBe("lead");
  });

  it("returns 'pad' from track name when notes are empty", () => {
    expect(classifyInstrumentRole([], "Pad Atmosphere")).toBe("pad");
  });

  it("returns 'arpeggio' from track name when name contains 'arp'", () => {
    expect(classifyInstrumentRole([], "Arp Sequence")).toBe("arpeggio");
  });

  // ─── Unclassified when no info ─────────────────────────────────────

  it("returns 'unclassified' for empty notes and generic name", () => {
    expect(classifyInstrumentRole([], "Track 1")).toBe("unclassified");
  });

  // ─── Heuristic rule 3a: Drums by statistics ─────────────────────────

  it("classifies as 'drums' with pitches in 35-81, high regularity, low pitch variety", () => {
    // Simulate a drum pattern: same pitches, evenly spaced
    const drumNotes: NoteData[] = [];
    for (let i = 0; i < 16; i++) {
      // kick on 36, snare on 38, alternating every beat, very regular
      drumNotes.push({
        pitch: i % 2 === 0 ? 36 : 38,
        startTime: i * 0.5,
        duration: 0.25,
        velocity: 100,
      });
    }
    expect(classifyInstrumentRole(drumNotes, "Track 1")).toBe("drums");
  });

  // ─── Heuristic rule 3b: Bass ────────────────────────────────────────

  it("classifies as 'bass' with low pitch and monophonic voicing", () => {
    // Monophonic, all pitches below 60
    const bassNotes: NoteData[] = [
      { pitch: 36, startTime: 0, duration: 1, velocity: 100 },
      { pitch: 38, startTime: 1, duration: 1, velocity: 100 },
      { pitch: 40, startTime: 2, duration: 1, velocity: 100 },
      { pitch: 43, startTime: 3, duration: 1, velocity: 100 },
      { pitch: 36, startTime: 4, duration: 1, velocity: 100 },
      { pitch: 38, startTime: 5, duration: 1, velocity: 100 },
      { pitch: 40, startTime: 6, duration: 1, velocity: 100 },
      { pitch: 43, startTime: 7, duration: 1, velocity: 100 },
    ];
    expect(classifyInstrumentRole(bassNotes, "Track 2")).toBe("bass");
  });

  // ─── Heuristic rule 3c: Arpeggio ───────────────────────────────────

  it("classifies as 'arpeggio' with high density and consistent spacing", () => {
    // Very fast notes with consistent 0.2-beat spacing → density > 4/beat
    const arpNotes: NoteData[] = [];
    for (let i = 0; i < 80; i++) {
      arpNotes.push({
        pitch: 60 + (i % 12), // cycles through pitches (above 55)
        startTime: i * 0.2,
        duration: 0.15,
        velocity: 80,
      });
    }
    // 80 notes over ~16 beats at 0.2 spacing = 5 notes/beat > 4
    expect(classifyInstrumentRole(arpNotes, "Synth")).toBe("arpeggio");
  });

  // ─── Heuristic rule 3d: Pad ─────────────────────────────────────────

  it("classifies as 'pad' with high polyphony and long duration", () => {
    // Chords with long sustain (>2 beats), polyphony > 2.5
    const padNotes: NoteData[] = [
      // Chord 1: 3 simultaneous notes, each 4 beats long
      { pitch: 60, startTime: 0, duration: 4, velocity: 80 },
      { pitch: 64, startTime: 0, duration: 4, velocity: 80 },
      { pitch: 67, startTime: 0, duration: 4, velocity: 80 },
      // Chord 2: 3 simultaneous notes, each 4 beats long
      { pitch: 62, startTime: 4, duration: 4, velocity: 80 },
      { pitch: 65, startTime: 4, duration: 4, velocity: 80 },
      { pitch: 69, startTime: 4, duration: 4, velocity: 80 },
      // Chord 3: 3 simultaneous notes
      { pitch: 64, startTime: 8, duration: 4, velocity: 80 },
      { pitch: 67, startTime: 8, duration: 4, velocity: 80 },
      { pitch: 71, startTime: 8, duration: 4, velocity: 80 },
    ];
    expect(classifyInstrumentRole(padNotes, "Synth Layer")).toBe("pad");
  });

  // ─── Heuristic rule 3e: Chord ───────────────────────────────────────

  it("classifies as 'chord' with moderate polyphony and moderate duration", () => {
    // Chords with 3 notes, duration ~1 beat (staccato chords)
    const chordNotes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 90 },
      { pitch: 64, startTime: 0, duration: 1, velocity: 90 },
      { pitch: 67, startTime: 0, duration: 1, velocity: 90 },
      { pitch: 62, startTime: 2, duration: 1, velocity: 90 },
      { pitch: 65, startTime: 2, duration: 1, velocity: 90 },
      { pitch: 69, startTime: 2, duration: 1, velocity: 90 },
      { pitch: 64, startTime: 4, duration: 1, velocity: 90 },
      { pitch: 67, startTime: 4, duration: 1, velocity: 90 },
      { pitch: 71, startTime: 4, duration: 1, velocity: 90 },
    ];
    expect(classifyInstrumentRole(chordNotes, "Keys")).toBe("chord");
  });

  // ─── Heuristic rule 3f: Lead ────────────────────────────────────────

  it("classifies as 'lead' with monophonic voicing, higher pitch, and melodic movement", () => {
    // Single notes, pitch > 55, 3+ distinct pitch classes
    const leadNotes: NoteData[] = [
      { pitch: 72, startTime: 0, duration: 0.5, velocity: 100 },
      { pitch: 74, startTime: 0.5, duration: 0.5, velocity: 100 },
      { pitch: 76, startTime: 1, duration: 0.5, velocity: 100 },
      { pitch: 79, startTime: 1.5, duration: 0.5, velocity: 100 },
      { pitch: 77, startTime: 2, duration: 0.5, velocity: 100 },
      { pitch: 76, startTime: 2.5, duration: 0.5, velocity: 100 },
      { pitch: 72, startTime: 3, duration: 0.5, velocity: 100 },
      { pitch: 74, startTime: 3.5, duration: 0.5, velocity: 100 },
    ];
    expect(classifyInstrumentRole(leadNotes, "Synth")).toBe("lead");
  });

  // ─── Step 4: Track name fallback for ambiguous statistics ───────────

  it("uses track name 'bass' fallback when statistics are ambiguous", () => {
    // Notes that don't clearly match any heuristic rule:
    // mid-range pitch, moderate polyphony, moderate duration
    const ambiguousNotes: NoteData[] = [
      { pitch: 55, startTime: 0, duration: 1.5, velocity: 80 },
      { pitch: 57, startTime: 2, duration: 1.5, velocity: 80 },
      { pitch: 55, startTime: 4, duration: 1.5, velocity: 80 },
      { pitch: 57, startTime: 6, duration: 1.5, velocity: 80 },
    ];
    expect(classifyInstrumentRole(ambiguousNotes, "Sub Bass")).toBe("bass");
  });

  it("uses track name 'lead' fallback when statistics are ambiguous", () => {
    // Monophonic but avgPitch < 56, so won't trigger lead heuristic directly
    // and has pitchVariety < 3 so won't match lead
    const ambiguousNotes: NoteData[] = [
      { pitch: 62, startTime: 0, duration: 0.75, velocity: 90 },
      { pitch: 64, startTime: 1, duration: 0.75, velocity: 90 },
      { pitch: 62, startTime: 2, duration: 0.75, velocity: 90 },
      { pitch: 64, startTime: 3, duration: 0.75, velocity: 90 },
    ];
    expect(classifyInstrumentRole(ambiguousNotes, "Lead Melody")).toBe("lead");
  });

  // ─── Returns unclassified when nothing matches ──────────────────────

  it("returns 'unclassified' for notes that do not match any pattern or name", () => {
    // Mid-range pitch, monophonic, only 2 pitch classes (fails lead variety check)
    // avgPitch > 60 (fails bass), polyphony ~1 (fails pad/chord)
    // Low density (fails arpeggio)
    const ambiguousNotes: NoteData[] = [
      { pitch: 65, startTime: 0, duration: 1, velocity: 80 },
      { pitch: 67, startTime: 2, duration: 1, velocity: 80 },
      { pitch: 65, startTime: 4, duration: 1, velocity: 80 },
      { pitch: 67, startTime: 6, duration: 1, velocity: 80 },
    ];
    expect(classifyInstrumentRole(ambiguousNotes, "Track 5")).toBe("unclassified");
  });

  // ─── Priority ordering ─────────────────────────────────────────────

  it("hasDrumRack takes priority over all other signals", () => {
    // Notes that would normally classify as bass
    const bassNotes: NoteData[] = [
      { pitch: 40, startTime: 0, duration: 1, velocity: 100 },
      { pitch: 43, startTime: 1, duration: 1, velocity: 100 },
    ];
    expect(classifyInstrumentRole(bassNotes, "Bass Line", true)).toBe("drums");
  });

  it("drum name keyword takes priority over note statistics", () => {
    // Notes that would otherwise classify as bass
    const bassNotes: NoteData[] = [
      { pitch: 40, startTime: 0, duration: 1, velocity: 100 },
      { pitch: 43, startTime: 1, duration: 1, velocity: 100 },
    ];
    expect(classifyInstrumentRole(bassNotes, "Drum Bus")).toBe("drums");
  });

  // ─── Case insensitivity ─────────────────────────────────────────────

  it("track name matching is case-insensitive", () => {
    expect(classifyInstrumentRole([], "BASS SYNTH")).toBe("bass");
    expect(classifyInstrumentRole([], "LEAD")).toBe("lead");
    expect(classifyInstrumentRole([], "PAD")).toBe("pad");
    expect(classifyInstrumentRole([], "ARP")).toBe("arpeggio");
    expect(classifyInstrumentRole([], "DRUM")).toBe("drums");
  });

  // ─── Validates role output is always a valid InstrumentRole ─────────

  it("always returns a valid InstrumentRole value", () => {
    const validRoles: InstrumentRole[] = [
      "drums", "bass", "lead", "pad", "arpeggio", "chord", "unclassified",
    ];

    const testCases: [NoteData[], string, boolean | undefined][] = [
      [[], "Generic", undefined],
      [[], "Drum", undefined],
      [[{ pitch: 36, startTime: 0, duration: 1, velocity: 100 }], "Test", undefined],
      [[{ pitch: 72, startTime: 0, duration: 0.5, velocity: 100 }], "Test", true],
    ];

    for (const [notes, name, drumRack] of testCases) {
      const result = classifyInstrumentRole(notes, name, drumRack);
      expect(validRoles).toContain(result);
    }
  });
});


describe("detectPhraseLength", () => {
  // Helper: generate a repeating pattern of notes for N bars, repeated M times
  function generateRepeatingPattern(
    patternBars: number,
    repetitions: number,
    sectionStart: number = 0,
    pitches: number[] = [60, 64, 67, 72],
    velocity: number = 100,
  ): NoteData[] {
    const notes: NoteData[] = [];
    const beatsPerBar = 4;
    const patternLengthBeats = patternBars * beatsPerBar;

    for (let rep = 0; rep < repetitions; rep++) {
      const repOffset = sectionStart + rep * patternLengthBeats;
      for (let bar = 0; bar < patternBars; bar++) {
        for (let beat = 0; beat < beatsPerBar; beat++) {
          const pitchIdx = (bar * beatsPerBar + beat) % pitches.length;
          notes.push({
            pitch: pitches[pitchIdx],
            startTime: repOffset + bar * beatsPerBar + beat,
            duration: 0.5,
            velocity,
          });
        }
      }
    }
    return notes;
  }

  // ─── 4-bar phrase detection ───────────────────────────────────────────

  it("detects 4-bar phrase when a 4-bar pattern repeats", () => {
    // 4-bar pattern repeated 4 times = 16 bars total (64 beats)
    const notes = generateRepeatingPattern(4, 4, 0);
    const result = detectPhraseLength(notes, 0, 64);
    expect(result).toBe(4);
  });

  it("detects 4-bar phrase with minimum 2 repetitions", () => {
    // 4-bar pattern repeated 2 times = 8 bars total (32 beats)
    const notes = generateRepeatingPattern(4, 2, 0);
    const result = detectPhraseLength(notes, 0, 32);
    expect(result).toBe(4);
  });

  // ─── 8-bar phrase detection ───────────────────────────────────────────

  it("detects 8-bar phrase when 8-bar pattern repeats but 4-bar does not", () => {
    // Create an 8-bar pattern where bars 1-4 and bars 5-8 are fundamentally different
    // (different pitches, different rhythmic positions, different density)
    // so 4-bar segments won't match, but full 8-bar phrases will.
    const notes: NoteData[] = [];
    const patternLengthBeats = 32; // 8 bars × 4 beats
    const repetitions = 3; // 3 reps = 24 bars = 96 beats

    for (let rep = 0; rep < repetitions; rep++) {
      const repOffset = rep * patternLengthBeats;
      // First 4 bars: sparse, low pitches, on beats 0 and 2 (positions 0 and 8)
      for (let bar = 0; bar < 4; bar++) {
        notes.push({
          pitch: 36, // low C
          startTime: repOffset + bar * 4,
          duration: 1,
          velocity: 60,
        });
        notes.push({
          pitch: 38, // low D
          startTime: repOffset + bar * 4 + 2,
          duration: 1,
          velocity: 60,
        });
      }
      // Second 4 bars: dense, high pitches, on every beat (positions 0, 4, 8, 12)
      for (let bar = 4; bar < 8; bar++) {
        for (let beat = 0; beat < 4; beat++) {
          notes.push({
            pitch: 84 + (beat % 3), // high pitches
            startTime: repOffset + bar * 4 + beat,
            duration: 0.25,
            velocity: 120,
          });
          // Extra note for higher density
          notes.push({
            pitch: 88 + (beat % 2),
            startTime: repOffset + bar * 4 + beat + 0.5,
            duration: 0.25,
            velocity: 110,
          });
        }
      }
    }

    const result = detectPhraseLength(notes, 0, 96);
    expect(result).toBe(8);
  });

  // ─── 16-bar phrase detection ──────────────────────────────────────────

  it("detects 16-bar phrase when only 16-bar repetition qualifies", () => {
    // Create a 16-bar pattern with 4 highly distinct 4-bar groups
    // (different pitch classes, different densities, different rhythmic positions)
    // Neither 4-bar nor 8-bar will qualify because adjacent segments are very different
    const notes: NoteData[] = [];
    const patternLengthBeats = 64; // 16 bars × 4 beats
    const repetitions = 2; // 2 reps = 32 bars = 128 beats

    for (let rep = 0; rep < repetitions; rep++) {
      const repOffset = rep * patternLengthBeats;

      // Quarter 1 (bars 1-4): sparse, low notes on beat 0 only
      for (let bar = 0; bar < 4; bar++) {
        notes.push({
          pitch: 36,
          startTime: repOffset + bar * 4,
          duration: 2,
          velocity: 50,
        });
      }

      // Quarter 2 (bars 5-8): dense high notes on every 16th
      for (let bar = 4; bar < 8; bar++) {
        for (let sixteenth = 0; sixteenth < 16; sixteenth++) {
          notes.push({
            pitch: 84 + (sixteenth % 5),
            startTime: repOffset + bar * 4 + sixteenth * 0.25,
            duration: 0.2,
            velocity: 120,
          });
        }
      }

      // Quarter 3 (bars 9-12): mid-range chords on beats 1 and 3
      for (let bar = 8; bar < 12; bar++) {
        notes.push({
          pitch: 60,
          startTime: repOffset + bar * 4 + 1,
          duration: 1,
          velocity: 90,
        });
        notes.push({
          pitch: 64,
          startTime: repOffset + bar * 4 + 1,
          duration: 1,
          velocity: 90,
        });
        notes.push({
          pitch: 67,
          startTime: repOffset + bar * 4 + 3,
          duration: 1,
          velocity: 90,
        });
        notes.push({
          pitch: 71,
          startTime: repOffset + bar * 4 + 3,
          duration: 1,
          velocity: 90,
        });
      }

      // Quarter 4 (bars 13-16): single notes on offbeats with varying velocity
      for (let bar = 12; bar < 16; bar++) {
        notes.push({
          pitch: 48,
          startTime: repOffset + bar * 4 + 0.5,
          duration: 0.5,
          velocity: 40 + bar * 5,
        });
        notes.push({
          pitch: 51,
          startTime: repOffset + bar * 4 + 2.5,
          duration: 0.5,
          velocity: 80,
        });
      }
    }

    const result = detectPhraseLength(notes, 0, 128);
    expect(result).toBe(16);
  });

  // ─── Default to 4 when no pattern qualifies ──────────────────────────

  it("defaults to 4 when no candidate achieves average similarity ≥ 0.7", () => {
    // Generate completely random-like notes with no repeating structure
    const notes: NoteData[] = [];
    const pitchSequence = [60, 73, 48, 85, 52, 79, 63, 91, 44, 77, 55, 88, 67, 41, 70, 82];
    for (let i = 0; i < 64; i++) {
      notes.push({
        pitch: pitchSequence[i % pitchSequence.length] + Math.floor(i / 16) * 5,
        startTime: i,
        duration: 0.5,
        velocity: 40 + (i * 7) % 88,
      });
    }
    const result = detectPhraseLength(notes, 0, 64);
    expect(result).toBe(4);
  });

  it("defaults to 4 for empty notes", () => {
    const result = detectPhraseLength([], 0, 64);
    expect(result).toBe(4);
  });

  // ─── Section too short ────────────────────────────────────────────────

  it("defaults to 4 when section is too short for any candidate", () => {
    // Section is only 4 bars (16 beats) — needs at least 2 segments (32 beats for 4-bar)
    const notes = generateRepeatingPattern(4, 1, 0);
    const result = detectPhraseLength(notes, 0, 16);
    expect(result).toBe(4);
  });

  // ─── Shortest valid candidate wins ────────────────────────────────────

  it("returns shortest valid candidate (4 beats preferred over 8)", () => {
    // A 4-bar pattern that also repeats at 8-bar intervals → should return 4
    const notes = generateRepeatingPattern(4, 4, 0);
    const result = detectPhraseLength(notes, 0, 64);
    expect(result).toBe(4);
  });

  // ─── Section offset handling ──────────────────────────────────────────

  it("works correctly with non-zero sectionStart", () => {
    // Pattern starts at beat 32 (bar 9), 4-bar repeating for 16 bars
    const notes = generateRepeatingPattern(4, 4, 32);
    const result = detectPhraseLength(notes, 32, 96);
    expect(result).toBe(4);
  });

  // ─── Similarity threshold boundary ────────────────────────────────────

  it("requires average similarity ≥ 0.7 to qualify", () => {
    // Create 4 repetitions of 4 bars where each repetition varies significantly
    // across ALL dimensions (pitch, rhythm, density, velocity) to ensure
    // no candidate achieves ≥ 0.7 average similarity
    const notes: NoteData[] = [];

    // Rep 1 (bars 1-4): sparse, low, on downbeats, soft
    for (let bar = 0; bar < 4; bar++) {
      notes.push({
        pitch: 36,
        startTime: bar * 4,
        duration: 1,
        velocity: 40,
      });
    }

    // Rep 2 (bars 5-8): dense, high, on upbeats, loud
    for (let bar = 4; bar < 8; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        notes.push({
          pitch: 84 + (beat % 4),
          startTime: bar * 4 + beat + 0.5, // offbeat
          duration: 0.25,
          velocity: 120,
        });
        notes.push({
          pitch: 88 + (beat % 3),
          startTime: bar * 4 + beat + 0.75,
          duration: 0.25,
          velocity: 110,
        });
      }
    }

    // Rep 3 (bars 9-12): mid chords on beat 2, moderate velocity
    for (let bar = 8; bar < 12; bar++) {
      notes.push({ pitch: 60, startTime: bar * 4 + 2, duration: 1.5, velocity: 80 });
      notes.push({ pitch: 64, startTime: bar * 4 + 2, duration: 1.5, velocity: 80 });
      notes.push({ pitch: 67, startTime: bar * 4 + 2, duration: 1.5, velocity: 80 });
    }

    // Rep 4 (bars 13-16): syncopated single notes, mixed pitches
    for (let bar = 12; bar < 16; bar++) {
      notes.push({ pitch: 50, startTime: bar * 4 + 0.25, duration: 0.5, velocity: 100 });
      notes.push({ pitch: 74, startTime: bar * 4 + 1.75, duration: 0.5, velocity: 60 });
      notes.push({ pitch: 55, startTime: bar * 4 + 3.25, duration: 0.5, velocity: 90 });
    }

    const result = detectPhraseLength(notes, 0, 64);
    // No 4-bar repetition, and the 8-bar check compares first 8 bars vs second 8 bars
    // which are also very different. Default should be 4.
    expect(result).toBe(4);
  });
});



describe("detectFills", () => {
  // Helper: create a steady loop pattern for N bars with given pitches
  function createLoopPattern(
    bars: number,
    sectionStart: number = 0,
    pitches: number[] = [36, 38, 42],
    notesPerBeat: number = 1,
    velocity: number = 100,
  ): NoteData[] {
    const notes: NoteData[] = [];
    for (let bar = 0; bar < bars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        for (let sub = 0; sub < notesPerBeat; sub++) {
          const pitchIdx = (bar * 4 + beat) % pitches.length;
          notes.push({
            pitch: pitches[pitchIdx],
            startTime: sectionStart + bar * 4 + beat + sub * (1 / notesPerBeat),
            duration: 0.25,
            velocity,
          });
        }
      }
    }
    return notes;
  }

  // ─── Empty / edge cases ─────────────────────────────────────────────

  it("returns empty array for empty notes", () => {
    const result = detectFills([], 0, 64, 4);
    expect(result).toEqual([]);
  });

  it("returns empty array when section is too short for phrase + boundary", () => {
    const notes = createLoopPattern(4, 0);
    // Section is exactly one phrase long (16 beats) — no boundary to check
    const result = detectFills(notes, 0, 16, 4);
    expect(result).toEqual([]);
  });

  it("returns empty array when no fills are present (steady loop)", () => {
    // 16 bars of steady loop, 4-bar phrase length. The pattern is identical in every phrase.
    const notes = createLoopPattern(16, 0);
    const result = detectFills(notes, 0, 64, 4);
    expect(result).toEqual([]);
  });

  // ─── Density-triggered fill ─────────────────────────────────────────

  it("detects fill triggered by density increase ≥ 50%", () => {
    // Create a 4-bar loop repeated 3 times (12 bars total = 48 beats)
    // Add extra notes before the second boundary at beat 32 (in bar 7, beats 28-31)
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);

    // Add extra notes in bar 7 (beats 28-31), before the boundary at beat 32
    // The loop has 1 note/beat in the corresponding position. Adding 1 extra = 100% increase > 50%.
    const fillNotes: NoteData[] = [];
    for (let beat = 0; beat < 4; beat++) {
      fillNotes.push({
        pitch: 36,
        startTime: 28 + beat + 0.5,
        duration: 0.25,
        velocity: 100,
      });
    }

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 48, 4);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // The 2-bar fill candidate (beats 24-31) is checked first — position = 24/4 = 6
    // The fill notes are at beats 28-31 which increases density for the 2-bar segment too
    const fill = result.find((f) => f.triggerType === "density");
    expect(fill).toBeDefined();
    expect(fill!.phraseInterval).toBe(4);
    expect(fill!.drumElements).toBeNull(); // No DrumPadMap provided
  });

  // ─── New pitch classes triggered fill ───────────────────────────────

  it("detects fill triggered by ≥ 2 new pitch classes", () => {
    // 12 bars, 4-bar phrase length. Loop uses pitches 36, 38, 42.
    // Pitch classes: 36%12=0, 38%12=2, 42%12=6
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);

    // Before the second phrase boundary at beat 32,
    // introduce 2 new pitch classes in bar 7 (beats 28-31)
    // Add pitches 45 (45%12=9) and 47 (47%12=11) which are NOT in the loop.
    const fillNotes: NoteData[] = [
      { pitch: 45, startTime: 28, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 29, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 30, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 31, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 48, 4);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // The fill should be triggered by new pitches (or both if density also exceeds)
    const fill = result[0];
    expect(["new-pitches", "both"]).toContain(fill.triggerType);
  });

  // ─── Both triggers ──────────────────────────────────────────────────

  it("detects fill with triggerType 'both' when density AND new pitches exceed thresholds", () => {
    // 12 bars, 4-bar phrases. Loop uses pitches 36, 38, 42.
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);

    // Before the boundary at beat 32 (bar 8), add density AND new pitches in bar 7
    const fillNotes: NoteData[] = [];
    for (let beat = 0; beat < 4; beat++) {
      // Extra density hit (100% increase)
      fillNotes.push({ pitch: 36, startTime: 28 + beat + 0.5, duration: 0.25, velocity: 110 });
      // New pitch classes: 45 (9) and 47 (11) not in loop
      fillNotes.push({ pitch: 45, startTime: 28 + beat + 0.25, duration: 0.25, velocity: 100 });
    }
    fillNotes.push({ pitch: 47, startTime: 29.75, duration: 0.25, velocity: 100 });

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 48, 4);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const fill = result.find((f) => f.position === 7 || f.position === 6);
    expect(fill).toBeDefined();
    expect(fill!.triggerType).toBe("both");
  });

  // ─── Fill position and duration ─────────────────────────────────────

  it("records correct position as bar offset from section start", () => {
    // Section starts at beat 32 (bar 8 in arrangement), 12 bars = 48 beats
    const sectionStart = 32;
    const sectionEnd = 32 + 48; // beat 80

    const loopNotes = createLoopPattern(12, sectionStart, [36, 38, 42], 1);

    // Second boundary is at sectionStart + 2*16 = 64
    // Fill in bars 6-7 of section (beats 56-63 arrangement-absolute, i.e., 24-31 relative)
    // Use new pitches to trigger fill
    const fillNotes: NoteData[] = [
      { pitch: 45, startTime: 60, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 61, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 62, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 63, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, sectionStart, sectionEnd, 4);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // Position should be bar offset from section start
    const fill = result[0];
    expect(fill.position).toBeGreaterThanOrEqual(0);
    expect(fill.phraseInterval).toBe(4);
  });

  // ─── Phrase interval recording ──────────────────────────────────────

  it("records correct phraseInterval for 8-bar phrases", () => {
    // 24 bars, 8-bar phrase. Loop uses pitches 36, 38.
    const loopNotes = createLoopPattern(24, 0, [36, 38], 1);

    // Fill before boundary at bar 16 (beat 64): in bar 15 (beats 60-63)
    const fillNotes: NoteData[] = [];
    for (let beat = 0; beat < 4; beat++) {
      fillNotes.push({ pitch: 36, startTime: 60 + beat + 0.5, duration: 0.25, velocity: 110 });
      fillNotes.push({ pitch: 45, startTime: 60 + beat + 0.25, duration: 0.25, velocity: 100 });
      fillNotes.push({ pitch: 47, startTime: 60 + beat + 0.75, duration: 0.25, velocity: 100 });
    }

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 96, 8);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].phraseInterval).toBe(8);
  });

  // ─── DrumPadMap integration ─────────────────────────────────────────

  it("records drum elements when DrumPadMap is provided", () => {
    const drumPadMap: DrumPadMap = new Map<number, DrumPadEntry>([
      [36, { pitch: 36, sampleName: "Kick_808", category: "kick" }],
      [38, { pitch: 38, sampleName: "Snare_Tight", category: "snare" }],
      [42, { pitch: 42, sampleName: "HiHat_Closed", category: "hi-hat" }],
      [45, { pitch: 45, sampleName: "Tom_Low", category: "tom" }],
      [47, { pitch: 47, sampleName: "Tom_High", category: "tom" }],
    ]);

    // 12 bars, 4-bar phrase. First boundary at beat 16, second at beat 32.
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);

    // Fill with toms (new pitches) before boundary at beat 32 (in bar 7, beats 28-31)
    const fillNotes: NoteData[] = [
      { pitch: 45, startTime: 28, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 29, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 30, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 31, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 48, 4, drumPadMap);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const fill = result[0];
    expect(fill.drumElements).not.toBeNull();
    expect(fill.drumElements).toContain("tom");
  });

  it("returns null for drumElements when no DrumPadMap provided", () => {
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);
    // Fill with new pitches before boundary at beat 32 (bar 7, beats 28-31)
    const fillNotes: NoteData[] = [
      { pitch: 45, startTime: 28, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 29, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 30, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 31, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 48, 4);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].drumElements).toBeNull();
  });

  // ─── 2-bar fill detection ───────────────────────────────────────────

  it("detects 2-bar fill when density increase spans 2 bars before boundary", () => {
    // 12 bars, 4-bar phrases
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);

    // Add dense fill spanning bars 6-7 (beats 24-31) before boundary at beat 32
    const fillNotes: NoteData[] = [];
    for (let beat = 0; beat < 8; beat++) {
      fillNotes.push({
        pitch: 36,
        startTime: 24 + beat + 0.5,
        duration: 0.25,
        velocity: 110,
      });
    }

    const allNotes = [...loopNotes, ...fillNotes];
    const result = detectFills(allNotes, 0, 48, 4);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // Should detect 2-bar fill (preferred over 1-bar)
    const twoBarFill = result.find((f) => f.durationBars === 2);
    expect(twoBarFill).toBeDefined();
  });

  // ─── Multiple fills at multiple boundaries ──────────────────────────

  it("detects fills at multiple phrase boundaries", () => {
    // 20 bars, 4-bar phrases (5 phrases). Boundaries after first phrase: at beats 16, 32, 48, 64
    // Loop template is beats 0-15.
    const loopNotes = createLoopPattern(20, 0, [36, 38, 42], 1);

    // Fill before boundary at beat 32 (in bar 7, beats 28-31)
    const fill1: NoteData[] = [
      { pitch: 45, startTime: 28, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 29, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 30, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 31, duration: 0.5, velocity: 100 },
    ];

    // Fill before boundary at beat 48 (in bar 11, beats 44-47)
    const fill2: NoteData[] = [
      { pitch: 45, startTime: 44, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 45, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 46, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 47, duration: 0.5, velocity: 100 },
    ];

    // Fill before boundary at beat 64 (in bar 15, beats 60-63)
    const fill3: NoteData[] = [
      { pitch: 45, startTime: 60, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 61, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 62, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 63, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fill1, ...fill2, ...fill3];
    const result = detectFills(allNotes, 0, 80, 4);

    // Should detect fills at all 3 boundaries (not at boundary 16 since that's loop end)
    expect(result.length).toBe(3);
  });

  // ─── No false positives for minor variations ────────────────────────

  it("does not flag as fill when density increase is below 50%", () => {
    // 12 bars, 4-bar phrase. Add just 1 extra note (less than 50% increase for 4 notes/bar)
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42, 36], 1); // 4 notes/bar

    // Add 1 extra note in bar 3 — less than 50% of 4 = less than 2 extra notes
    const minorVariation: NoteData[] = [
      { pitch: 36, startTime: 13.5, duration: 0.25, velocity: 80 },
    ];

    const allNotes = [...loopNotes, ...minorVariation];
    const result = detectFills(allNotes, 0, 48, 4);

    // Should NOT detect a fill — the density increase is only 25% (1/4)
    expect(result.length).toBe(0);
  });

  it("does not flag as fill when only 1 new pitch class is introduced", () => {
    // 12 bars, 4-bar phrase. Loop uses pitches with classes 0, 2, 6.
    const loopNotes = createLoopPattern(12, 0, [36, 38, 42], 1);

    // Add just 1 new pitch class (not 2): pitch 45 (class 9)
    // Keep same density (replace an existing note's position)
    const minorVariation: NoteData[] = [
      { pitch: 45, startTime: 14.5, duration: 0.25, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...minorVariation];
    const result = detectFills(allNotes, 0, 48, 4);

    // Should NOT detect a fill — only 1 new pitch class (threshold is 2)
    expect(result.length).toBe(0);
  });
});



describe("classifyPercussionPattern", () => {
  // Helper: create a repeating drum loop pattern for N bars
  function createDrumLoop(
    bars: number,
    sectionStart: number = 0,
    pitches: number[] = [36, 38, 42],
    notesPerBeat: number = 1,
    velocity: number = 100,
  ): NoteData[] {
    const notes: NoteData[] = [];
    for (let bar = 0; bar < bars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        for (let sub = 0; sub < notesPerBeat; sub++) {
          const pitchIdx = (bar * 4 + beat) % pitches.length;
          notes.push({
            pitch: pitches[pitchIdx],
            startTime: sectionStart + bar * 4 + beat + sub * (1 / notesPerBeat),
            duration: 0.25,
            velocity,
          });
        }
      }
    }
    return notes;
  }

  // ─── Loop classification ─────────────────────────────────────────────

  it("classifies repeating identical pattern as 'loop'", () => {
    // 4-bar pattern repeated 4 times = 16 bars (64 beats)
    // All phrases are identical → similarity should be >= 0.85
    const notes = createDrumLoop(16, 0, [36, 38, 42]);
    const result = classifyPercussionPattern(notes, 0, 64);
    expect(result.classification).toBe("loop");
    expect(result.phraseLength).toBe(4);
  });

  it("classifies identical 8-bar loop as 'loop'", () => {
    // Create an 8-bar pattern and repeat it 3 times = 24 bars (96 beats)
    // Use a pattern where bars 1-4 differ from 5-8 so only 8-bar works
    const notes: NoteData[] = [];
    const patternLengthBeats = 32; // 8 bars
    const repetitions = 3;

    for (let rep = 0; rep < repetitions; rep++) {
      const repOffset = rep * patternLengthBeats;
      // First 4 bars: kick pattern
      for (let bar = 0; bar < 4; bar++) {
        for (let beat = 0; beat < 4; beat++) {
          notes.push({
            pitch: 36,
            startTime: repOffset + bar * 4 + beat,
            duration: 0.25,
            velocity: 100,
          });
        }
      }
      // Second 4 bars: hi-hat pattern (different from first 4)
      for (let bar = 4; bar < 8; bar++) {
        for (let beat = 0; beat < 4; beat++) {
          notes.push({
            pitch: 42,
            startTime: repOffset + bar * 4 + beat,
            duration: 0.25,
            velocity: 80,
          });
          notes.push({
            pitch: 42,
            startTime: repOffset + bar * 4 + beat + 0.5,
            duration: 0.25,
            velocity: 60,
          });
        }
      }
    }

    const result = classifyPercussionPattern(notes, 0, 96);
    expect(result.classification).toBe("loop");
  });

  // ─── Variation classification ────────────────────────────────────────

  it("classifies varying pattern as 'variation'", () => {
    // Create 16 bars where each 4-bar phrase is fundamentally different
    const notes: NoteData[] = [];

    // Phrase 1 (bars 0-3): kick only, on downbeats
    for (let bar = 0; bar < 4; bar++) {
      notes.push({
        pitch: 36,
        startTime: bar * 4,
        duration: 0.25,
        velocity: 100,
      });
    }

    // Phrase 2 (bars 4-7): hi-hat dense pattern (completely different)
    for (let bar = 4; bar < 8; bar++) {
      for (let sixteenth = 0; sixteenth < 16; sixteenth++) {
        notes.push({
          pitch: 42,
          startTime: bar * 4 + sixteenth * 0.25,
          duration: 0.1,
          velocity: 80,
        });
      }
    }

    // Phrase 3 (bars 8-11): snare + cymbal pattern
    for (let bar = 8; bar < 12; bar++) {
      notes.push({ pitch: 38, startTime: bar * 4 + 1, duration: 0.25, velocity: 110 });
      notes.push({ pitch: 49, startTime: bar * 4 + 3, duration: 0.25, velocity: 90 });
    }

    // Phrase 4 (bars 12-15): tom fills all over
    for (let bar = 12; bar < 16; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        notes.push({ pitch: 45 + (beat % 3), startTime: bar * 4 + beat, duration: 0.25, velocity: 100 });
      }
    }

    const result = classifyPercussionPattern(notes, 0, 64);
    expect(result.classification).toBe("variation");
  });

  // ─── Single phrase (too short for comparison) ────────────────────────

  it("classifies single phrase section as 'loop' (default)", () => {
    // Only 4 bars = 1 phrase, can't compare consecutive phrases
    const notes = createDrumLoop(4, 0, [36, 38, 42]);
    const result = classifyPercussionPattern(notes, 0, 16);
    expect(result.classification).toBe("loop");
    expect(result.phraseLength).toBe(4);
  });

  // ─── Phrase length is returned correctly ─────────────────────────────

  it("returns detected phrase length in result", () => {
    const notes = createDrumLoop(16, 0, [36, 38, 42]);
    const result = classifyPercussionPattern(notes, 0, 64);
    expect([4, 8, 16]).toContain(result.phraseLength);
  });

  // ─── Fills are detected and included ────────────────────────────────

  it("includes detected fills in the result", () => {
    // 16 bars, 4-bar phrases. Add fills before boundaries.
    const loopNotes = createDrumLoop(16, 0, [36, 38, 42]);

    // Add fill (new pitches) before boundary at beat 32 (bar 7, beats 28-31)
    const fillNotes: NoteData[] = [
      { pitch: 45, startTime: 28, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 29, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 30, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 31, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fillNotes];
    const result = classifyPercussionPattern(allNotes, 0, 64);
    expect(result.fills.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty fills array when no fills are present", () => {
    // Perfectly repeating loop with no variations at boundaries
    const notes = createDrumLoop(16, 0, [36, 38, 42]);
    const result = classifyPercussionPattern(notes, 0, 64);
    expect(result.fills).toEqual([]);
  });

  // ─── DrumPadMap integration ──────────────────────────────────────────

  it("passes drumPadMap through to fill detection", () => {
    const drumPadMap: DrumPadMap = new Map<number, DrumPadEntry>([
      [36, { pitch: 36, sampleName: "Kick_808", category: "kick" }],
      [38, { pitch: 38, sampleName: "Snare_Tight", category: "snare" }],
      [42, { pitch: 42, sampleName: "HiHat_Closed", category: "hi-hat" }],
      [45, { pitch: 45, sampleName: "Tom_Low", category: "tom" }],
      [47, { pitch: 47, sampleName: "Tom_High", category: "tom" }],
    ]);

    const loopNotes = createDrumLoop(16, 0, [36, 38, 42]);

    // Add fill with toms before boundary at beat 32
    const fillNotes: NoteData[] = [
      { pitch: 45, startTime: 28, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 29, duration: 0.5, velocity: 100 },
      { pitch: 45, startTime: 30, duration: 0.5, velocity: 100 },
      { pitch: 47, startTime: 31, duration: 0.5, velocity: 100 },
    ];

    const allNotes = [...loopNotes, ...fillNotes];
    const result = classifyPercussionPattern(allNotes, 0, 64, drumPadMap);

    // Fills should have drum elements populated
    const fillWithElements = result.fills.find((f) => f.drumElements !== null);
    expect(fillWithElements).toBeDefined();
    expect(fillWithElements!.drumElements).toContain("tom");
  });

  // ─── Non-zero section start ──────────────────────────────────────────

  it("works correctly with non-zero sectionStart", () => {
    // Section starts at beat 32, 16 bars = 64 beats
    const sectionStart = 32;
    const sectionEnd = 96;
    const notes = createDrumLoop(16, sectionStart, [36, 38, 42]);
    const result = classifyPercussionPattern(notes, sectionStart, sectionEnd);
    expect(result.classification).toBe("loop");
    expect(result.phraseLength).toBe(4);
  });

  // ─── Empty notes ─────────────────────────────────────────────────────

  it("handles empty notes gracefully", () => {
    const result = classifyPercussionPattern([], 0, 64);
    expect(result.classification).toBe("loop");
    expect(result.phraseLength).toBe(4); // default
    expect(result.fills).toEqual([]);
  });

  // ─── Result shape ───────────────────────────────────────────────────

  it("returns a valid PercussionPatternResult structure", () => {
    const notes = createDrumLoop(16, 0, [36, 38, 42]);
    const result = classifyPercussionPattern(notes, 0, 64);

    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("phraseLength");
    expect(result).toHaveProperty("fills");
    expect(["loop", "variation"]).toContain(result.classification);
    expect(typeof result.phraseLength).toBe("number");
    expect(Array.isArray(result.fills)).toBe(true);
  });
});


import { detectBuilds } from "./content-analyzer.js";
import type { BuildDetection } from "./content-analysis-types.js";

describe("detectBuilds", () => {
  // ─── Returns null when no build detected ────────────────────────────

  it("returns null when no notes in the window", () => {
    const result = detectBuilds([], 0, 64, 64);
    expect(result).toBeNull();
  });

  it("returns null when notes are flat (no progressive increase)", () => {
    // 4 bars of identical density and velocity before boundary
    const notes: NoteData[] = [];
    // 4 notes per bar, same velocity, same pitch range across 4 bars (bars 12-15, beats 48-63)
    for (let bar = 0; bar < 4; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        notes.push({
          pitch: 60,
          startTime: 48 + bar * 4 + beat,
          duration: 0.5,
          velocity: 80,
        });
      }
    }
    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).toBeNull();
  });

  it("returns null when window is less than 2 bars", () => {
    // Section is tiny, less than 8 beats before boundary
    const notes: NoteData[] = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 80 },
      { pitch: 60, startTime: 1, duration: 0.5, velocity: 100 },
    ];
    const result = detectBuilds(notes, 0, 4, 4);
    expect(result).toBeNull();
  });

  // ─── Density build detection ────────────────────────────────────────

  it("detects density build when notes progressively increase ≥25% per bar", () => {
    // 4 bars before boundary at beat 64 (bars at beats 48-51, 52-55, 56-59, 60-63)
    const notes: NoteData[] = [];
    // Bar 1: 4 notes (density = 1)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 48 + i, duration: 0.25, velocity: 80 });
    }
    // Bar 2: 5 notes (density = 1.25, +25%)
    for (let i = 0; i < 5; i++) {
      notes.push({ pitch: 60, startTime: 52 + i * 0.8, duration: 0.25, velocity: 80 });
    }
    // Bar 3: 7 notes (density = 1.75, ≥ 1.25 * 1.25 = 1.5625) → +40% over bar 2
    for (let i = 0; i < 7; i++) {
      notes.push({ pitch: 60, startTime: 56 + i * 0.57, duration: 0.25, velocity: 80 });
    }
    // Bar 4: 9 notes (density = 2.25, ≥ 1.75 * 1.25 = 2.1875) → +28% over bar 3
    for (let i = 0; i < 9; i++) {
      notes.push({ pitch: 60, startTime: 60 + i * 0.44, duration: 0.25, velocity: 80 });
    }

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("density");
    expect(result!.durationBars).toBeGreaterThanOrEqual(2);
    expect(result!.targetBoundary).toBe(64);
  });

  // ─── Velocity build detection ───────────────────────────────────────

  it("detects velocity build when average velocity increases ≥10 units per bar", () => {
    const notes: NoteData[] = [];
    // 4 bars with increasing velocity, same density and pitch
    // Bar 1 (beats 48-51): velocity 60
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 48 + i, duration: 0.5, velocity: 60 });
    }
    // Bar 2 (beats 52-55): velocity 72 (+12)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 52 + i, duration: 0.5, velocity: 72 });
    }
    // Bar 3 (beats 56-59): velocity 84 (+12)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 56 + i, duration: 0.5, velocity: 84 });
    }
    // Bar 4 (beats 60-63): velocity 96 (+12)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 60 + i, duration: 0.5, velocity: 96 });
    }

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("velocity");
    expect(result!.durationBars).toBeGreaterThanOrEqual(2);
    expect(result!.targetBoundary).toBe(64);
  });

  // ─── Pitch range build detection ────────────────────────────────────

  it("detects pitch-range build when new pitches outside prior range are introduced each bar", () => {
    const notes: NoteData[] = [];
    // Bar 1 (beats 48-51): pitches 60-62 (range 2)
    notes.push({ pitch: 60, startTime: 48, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 61, startTime: 49, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 62, startTime: 50, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 60, startTime: 51, duration: 0.5, velocity: 80 });

    // Bar 2 (beats 52-55): introduces pitch 64 (outside 60-62 range)
    notes.push({ pitch: 60, startTime: 52, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 62, startTime: 53, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 64, startTime: 54, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 60, startTime: 55, duration: 0.5, velocity: 80 });

    // Bar 3 (beats 56-59): introduces pitch 67 (outside 60-64 range)
    notes.push({ pitch: 60, startTime: 56, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 64, startTime: 57, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 67, startTime: 58, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 60, startTime: 59, duration: 0.5, velocity: 80 });

    // Bar 4 (beats 60-63): introduces pitch 72 (outside 60-67 range)
    notes.push({ pitch: 60, startTime: 60, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 67, startTime: 61, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 72, startTime: 62, duration: 0.5, velocity: 80 });
    notes.push({ pitch: 60, startTime: 63, duration: 0.5, velocity: 80 });

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("pitch-range");
    expect(result!.durationBars).toBeGreaterThanOrEqual(2);
  });

  // ─── Combined build detection ──────────────────────────────────────

  it("detects combined build when multiple metrics show progression", () => {
    const notes: NoteData[] = [];
    // Bar 1: 4 notes, velocity 60, pitch 60
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 48 + i, duration: 0.25, velocity: 60 });
    }
    // Bar 2: 6 notes (+50%), velocity 72 (+12), introduce pitch 65
    for (let i = 0; i < 6; i++) {
      notes.push({ pitch: i < 5 ? 60 : 65, startTime: 52 + i * 0.66, duration: 0.25, velocity: 72 });
    }
    // Bar 3: 8 notes (+33%), velocity 84 (+12), introduce pitch 70
    for (let i = 0; i < 8; i++) {
      notes.push({ pitch: i < 7 ? 60 : 70, startTime: 56 + i * 0.5, duration: 0.25, velocity: 84 });
    }
    // Bar 4: 11 notes (+37%), velocity 96 (+12), introduce pitch 75
    for (let i = 0; i < 11; i++) {
      notes.push({ pitch: i < 10 ? 60 : 75, startTime: 60 + i * 0.36, duration: 0.25, velocity: 96 });
    }

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("combined");
  });

  // ─── Only 2 consecutive bars needed ─────────────────────────────────

  it("detects a build with just 2 consecutive bars of increase", () => {
    const notes: NoteData[] = [];
    // Bar 1 (beats 48-51): velocity 80
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 48 + i, duration: 0.5, velocity: 80 });
    }
    // Bar 2 (beats 52-55): velocity 82 (+2, below threshold)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 52 + i, duration: 0.5, velocity: 82 });
    }
    // Bar 3 (beats 56-59): velocity 80 (dip, breaks any potential run)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 56 + i, duration: 0.5, velocity: 80 });
    }
    // Bar 4 (beats 60-63): velocity 92 (+12 from bar 3, starts a 2-bar run)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 60 + i, duration: 0.5, velocity: 92 });
    }

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("velocity");
    expect(result!.durationBars).toBe(2);
  });

  // ─── Boundary and section constraints ───────────────────────────────

  it("clamps analysis window to section start", () => {
    // Section starts at beat 56, boundary at beat 64.
    // Only 2 bars available (beats 56-63)
    const notes: NoteData[] = [];
    // Bar 1 (beats 56-59): velocity 60
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 56 + i, duration: 0.5, velocity: 60 });
    }
    // Bar 2 (beats 60-63): velocity 75 (+15)
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 60 + i, duration: 0.5, velocity: 75 });
    }

    const result = detectBuilds(notes, 56, 64, 64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("velocity");
    expect(result!.durationBars).toBe(2);
  });

  it("uses boundary parameter correctly (not sectionEnd)", () => {
    // Section goes 0-64, but boundary is at beat 32 (mid-section)
    const notes: NoteData[] = [];
    // Build leading into beat 32 (bars at 16-19, 20-23, 24-27, 28-31)
    // Bar 1 (beats 16-19): velocity 60
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 16 + i, duration: 0.5, velocity: 60 });
    }
    // Bar 2 (beats 20-23): velocity 72
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 20 + i, duration: 0.5, velocity: 72 });
    }
    // Bar 3 (beats 24-27): velocity 84
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 24 + i, duration: 0.5, velocity: 84 });
    }
    // Bar 4 (beats 28-31): velocity 96
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 28 + i, duration: 0.5, velocity: 96 });
    }

    const result = detectBuilds(notes, 0, 64, 32);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("velocity");
    expect(result!.targetBoundary).toBe(32);
  });

  // ─── Result shape ──────────────────────────────────────────────────

  it("returns correct BuildDetection shape", () => {
    const notes: NoteData[] = [];
    // Simple velocity build
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 48 + i, duration: 0.5, velocity: 60 });
    }
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 52 + i, duration: 0.5, velocity: 72 });
    }
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 56 + i, duration: 0.5, velocity: 84 });
    }
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 60 + i, duration: 0.5, velocity: 96 });
    }

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("trackName");
    expect(result).toHaveProperty("startPosition");
    expect(result).toHaveProperty("durationBars");
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("targetBoundary");
    expect(typeof result!.startPosition).toBe("number");
    expect(typeof result!.durationBars).toBe("number");
    expect(["density", "velocity", "pitch-range", "combined"]).toContain(result!.type);
  });

  // ─── Edge cases ─────────────────────────────────────────────────────

  it("handles bars with zero notes gracefully", () => {
    // Bar 1 has notes, bar 2 is empty, bar 3 has notes, bar 4 has more notes
    const notes: NoteData[] = [];
    // Bar 1 (beats 48-51): 4 notes
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 48 + i, duration: 0.5, velocity: 80 });
    }
    // Bar 2 (beats 52-55): empty
    // Bar 3 (beats 56-59): 4 notes
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 56 + i, duration: 0.5, velocity: 80 });
    }
    // Bar 4 (beats 60-63): 4 notes
    for (let i = 0; i < 4; i++) {
      notes.push({ pitch: 60, startTime: 60 + i, duration: 0.5, velocity: 80 });
    }

    // Should not crash; no progressive increase across 2+ consecutive bars
    const result = detectBuilds(notes, 0, 64, 64);
    // Might be null since density doesn't progress (bar 2 is empty, breaking the chain)
    // and velocity is flat
    expect(result === null || result.type !== undefined).toBe(true);
  });

  it("does not detect build when increase is below threshold", () => {
    const notes: NoteData[] = [];
    // Velocity increases only 5 per bar (below the 10 threshold)
    for (let bar = 0; bar < 4; bar++) {
      for (let i = 0; i < 4; i++) {
        notes.push({
          pitch: 60,
          startTime: 48 + bar * 4 + i,
          duration: 0.5,
          velocity: 70 + bar * 5, // 70, 75, 80, 85 — only +5 per bar
        });
      }
    }
    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).toBeNull();
  });

  it("does not detect density build when increase is below 25%", () => {
    const notes: NoteData[] = [];
    // Bar 1: 8 notes, Bar 2: 9 notes (+12.5%), Bar 3: 10 notes (+11%), Bar 4: 11 notes (+10%)
    for (let i = 0; i < 8; i++) {
      notes.push({ pitch: 60, startTime: 48 + i * 0.5, duration: 0.25, velocity: 80 });
    }
    for (let i = 0; i < 9; i++) {
      notes.push({ pitch: 60, startTime: 52 + i * 0.44, duration: 0.25, velocity: 80 });
    }
    for (let i = 0; i < 10; i++) {
      notes.push({ pitch: 60, startTime: 56 + i * 0.4, duration: 0.25, velocity: 80 });
    }
    for (let i = 0; i < 11; i++) {
      notes.push({ pitch: 60, startTime: 60 + i * 0.36, duration: 0.25, velocity: 80 });
    }

    const result = detectBuilds(notes, 0, 64, 64);
    expect(result).toBeNull();
  });
});


import { comparePatternsAcrossSections, buildRepetitionSummary } from "./content-analyzer.js";
import type { CrossSectionComparison, TrackRepetitionSummary } from "./content-analysis-types.js";

describe("comparePatternsAcrossSections", () => {
  // Helper to create a fingerprint from parts
  function makeFingerprint(overrides: Partial<PatternFingerprint> = {}): PatternFingerprint {
    return {
      pitchClasses: overrides.pitchClasses ?? new Set<number>(),
      rhythmicPositions: overrides.rhythmicPositions ?? [],
      velocityContour: overrides.velocityContour ?? [],
      density: overrides.density ?? 0,
      barCount: overrides.barCount ?? 4,
    };
  }

  // ─── Empty / single fingerprint ─────────────────────────────────────

  it("returns empty array for empty fingerprints array", () => {
    const result = comparePatternsAcrossSections([]);
    expect(result).toEqual([]);
  });

  it("returns empty array for single fingerprint", () => {
    const fp = makeFingerprint({ pitchClasses: new Set([0, 4, 7]), density: 2 });
    const result = comparePatternsAcrossSections([fp]);
    expect(result).toEqual([]);
  });

  // ─── Two identical fingerprints → "shared" ──────────────────────────

  it("classifies identical consecutive fingerprints as 'shared'", () => {
    const fp = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.8, 0.7, 0.9, 0.8],
      density: 2,
    });
    const result = comparePatternsAcrossSections([fp, fp]);
    expect(result).toHaveLength(1);
    expect(result[0].sectionIndexA).toBe(0);
    expect(result[0].sectionIndexB).toBe(1);
    expect(result[0].similarity).toBeCloseTo(1.0);
    expect(result[0].classification).toBe("shared");
  });

  // ─── Two completely different fingerprints → "contrasting" ──────────

  it("classifies completely different consecutive fingerprints as 'contrasting'", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 2, 4]),
      rhythmicPositions: [0, 4, 8],
      velocityContour: [1.0, 0.0, 1.0, 0.0],
      density: 4,
    });
    const b = makeFingerprint({
      pitchClasses: new Set([6, 8, 10]),
      rhythmicPositions: [1, 5, 9],
      velocityContour: [0.0, 1.0, 0.0, 1.0],
      density: 0.5,
    });
    const result = comparePatternsAcrossSections([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("contrasting");
    expect(result[0].similarity).toBeLessThan(0.5);
  });

  // ─── "similar" classification ───────────────────────────────────────

  it("classifies partially overlapping fingerprints as 'similar'", () => {
    const a = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.8, 0.6, 0.7, 0.8],
      density: 2,
    });
    // Same pitch classes but different rhythm → similar, not shared
    const b = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [2, 6, 10, 14],
      velocityContour: [0.7, 0.5, 0.8, 0.7],
      density: 1.5,
    });
    const result = comparePatternsAcrossSections([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].similarity).toBeGreaterThanOrEqual(0.5);
    expect(result[0].similarity).toBeLessThanOrEqual(0.85);
    expect(result[0].classification).toBe("similar");
  });

  // ─── Multiple consecutive comparisons ───────────────────────────────

  it("compares all consecutive pairs in a sequence of fingerprints", () => {
    const fp1 = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.8, 0.8, 0.8, 0.8],
      density: 2,
    });
    const fp2 = makeFingerprint({
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.8, 0.8, 0.8, 0.8],
      density: 2,
    }); // same as fp1 → shared
    const fp3 = makeFingerprint({
      pitchClasses: new Set([6, 8, 10]),
      rhythmicPositions: [1, 5, 9],
      velocityContour: [0.2, 0.9, 0.2, 0.9],
      density: 0.5,
    }); // different from fp2 → contrasting

    const result = comparePatternsAcrossSections([fp1, fp2, fp3]);
    expect(result).toHaveLength(2);
    expect(result[0].sectionIndexA).toBe(0);
    expect(result[0].sectionIndexB).toBe(1);
    expect(result[0].classification).toBe("shared");
    expect(result[1].sectionIndexA).toBe(1);
    expect(result[1].sectionIndexB).toBe(2);
    expect(result[1].classification).toBe("contrasting");
  });

  // ─── Structural correctness ─────────────────────────────────────────

  it("always produces n-1 comparisons for n fingerprints", () => {
    const fp = makeFingerprint({
      pitchClasses: new Set([0, 3, 7]),
      rhythmicPositions: [0, 8],
      velocityContour: [0.5, 0.5, 0.5, 0.5],
      density: 1,
    });
    const fingerprints = [fp, fp, fp, fp, fp]; // 5 fingerprints
    const result = comparePatternsAcrossSections(fingerprints);
    expect(result).toHaveLength(4);
  });

  it("section indices are always consecutive pairs", () => {
    const fp = makeFingerprint({ density: 1 });
    const result = comparePatternsAcrossSections([fp, fp, fp, fp]);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].sectionIndexA).toBe(i);
      expect(result[i].sectionIndexB).toBe(i + 1);
    }
  });

  // ─── Similarity score range ─────────────────────────────────────────

  it("all similarity scores are within [0, 1]", () => {
    const fps = [
      makeFingerprint({ pitchClasses: new Set([0, 4, 7]), density: 3, rhythmicPositions: [0, 4, 8] }),
      makeFingerprint({ pitchClasses: new Set([1, 5, 9]), density: 1, rhythmicPositions: [2, 6, 10] }),
      makeFingerprint({ pitchClasses: new Set([0, 4, 7]), density: 3, rhythmicPositions: [0, 4, 8] }),
    ];
    const result = comparePatternsAcrossSections(fps);
    for (const comp of result) {
      expect(comp.similarity).toBeGreaterThanOrEqual(0);
      expect(comp.similarity).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildRepetitionSummary", () => {
  // ─── Empty inputs ───────────────────────────────────────────────────

  it("returns empty summary for zero sections", () => {
    const result = buildRepetitionSummary([], "drums", 0);
    expect(result.role).toBe("drums");
    expect(result.sharedGroups).toEqual([]);
    expect(result.uniqueSections).toEqual([]);
    expect(result.hasExtendedRepetition).toBe(false);
    expect(result.extendedRepetitionSections).toEqual([]);
  });

  it("returns all sections as unique when no comparisons exist (single section)", () => {
    const result = buildRepetitionSummary([], "bass", 1);
    expect(result.role).toBe("bass");
    expect(result.sharedGroups).toEqual([]);
    expect(result.uniqueSections).toEqual([0]);
    expect(result.hasExtendedRepetition).toBe(false);
  });

  // ─── All shared ─────────────────────────────────────────────────────

  it("groups all sections when all comparisons are shared", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.95, classification: "shared" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.90, classification: "shared" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.92, classification: "shared" },
    ];
    const result = buildRepetitionSummary(comparisons, "drums", 4);
    expect(result.sharedGroups).toHaveLength(1);
    expect(result.sharedGroups[0]).toEqual([0, 1, 2, 3]);
    expect(result.uniqueSections).toEqual([]);
  });

  // ─── All contrasting ────────────────────────────────────────────────

  it("marks all sections as unique when all comparisons are contrasting", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.3, classification: "contrasting" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.2, classification: "contrasting" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.4, classification: "contrasting" },
    ];
    const result = buildRepetitionSummary(comparisons, "lead", 4);
    expect(result.sharedGroups).toEqual([]);
    expect(result.uniqueSections).toEqual([0, 1, 2, 3]);
  });

  // ─── Mixed: shared + contrasting ───────────────────────────────────

  it("identifies separate shared groups with non-shared sections in between", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.90, classification: "shared" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.3, classification: "contrasting" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.92, classification: "shared" },
      { sectionIndexA: 3, sectionIndexB: 4, similarity: 0.88, classification: "shared" },
    ];
    const result = buildRepetitionSummary(comparisons, "bass", 5);
    expect(result.sharedGroups).toHaveLength(2);
    expect(result.sharedGroups[0]).toEqual([0, 1]);
    expect(result.sharedGroups[1]).toEqual([2, 3, 4]);
    // Sections 0, 1, 2, 3, 4 are all in groups → no unique sections
    expect(result.uniqueSections).toEqual([]);
  });

  it("identifies unique sections that have no shared neighbors", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.90, classification: "shared" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.3, classification: "contrasting" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.4, classification: "contrasting" },
    ];
    const result = buildRepetitionSummary(comparisons, "pad", 4);
    expect(result.sharedGroups).toHaveLength(1);
    expect(result.sharedGroups[0]).toEqual([0, 1]);
    // Sections 2 and 3 are not in any shared group
    expect(result.uniqueSections).toEqual([2, 3]);
  });

  // ─── Extended repetition detection ──────────────────────────────────

  it("detects extended repetition when 3+ consecutive sections share patterns", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.90, classification: "shared" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.92, classification: "shared" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.88, classification: "shared" },
    ];
    const result = buildRepetitionSummary(comparisons, "drums", 4);
    expect(result.hasExtendedRepetition).toBe(true);
    expect(result.extendedRepetitionSections).toEqual([0, 1, 2, 3]);
  });

  it("does not flag extended repetition for 2-section shared groups", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.90, classification: "shared" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.3, classification: "contrasting" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.88, classification: "shared" },
    ];
    const result = buildRepetitionSummary(comparisons, "drums", 4);
    expect(result.hasExtendedRepetition).toBe(false);
    expect(result.extendedRepetitionSections).toEqual([]);
  });

  it("detects extended repetition only for groups of 3+", () => {
    // 5 sections: 0-1 shared (2 sections), 2-3-4 shared (3 sections)
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.90, classification: "shared" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.3, classification: "contrasting" },
      { sectionIndexA: 2, sectionIndexB: 3, similarity: 0.92, classification: "shared" },
      { sectionIndexA: 3, sectionIndexB: 4, similarity: 0.88, classification: "shared" },
    ];
    const result = buildRepetitionSummary(comparisons, "drums", 5);
    expect(result.hasExtendedRepetition).toBe(true);
    // Only sections from the 3+ group
    expect(result.extendedRepetitionSections).toEqual([2, 3, 4]);
  });

  // ─── Role is preserved ──────────────────────────────────────────────

  it("preserves the role in the summary", () => {
    const result = buildRepetitionSummary([], "arpeggio", 2);
    expect(result.role).toBe("arpeggio");
  });

  // ─── "similar" classification is not counted as shared ──────────────

  it("does not include 'similar' comparisons in shared groups", () => {
    const comparisons: CrossSectionComparison[] = [
      { sectionIndexA: 0, sectionIndexB: 1, similarity: 0.70, classification: "similar" },
      { sectionIndexA: 1, sectionIndexB: 2, similarity: 0.65, classification: "similar" },
    ];
    const result = buildRepetitionSummary(comparisons, "lead", 3);
    expect(result.sharedGroups).toEqual([]);
    expect(result.uniqueSections).toEqual([0, 1, 2]);
    expect(result.hasExtendedRepetition).toBe(false);
  });
});
