/**
 * Property-based test for content analyzer behavioral equivalence.
 *
 * Feature: detection-data-externalization, Property 6: Content analyzer behavioral equivalence
 *
 * **Validates: Requirements 5.3**
 *
 * For any valid array of NoteData (with arbitrary pitch, startTime, duration, velocity values),
 * any trackName string, and any boolean hasDrumRack flag, calling classifyInstrumentRole after
 * externalization SHALL produce the same InstrumentRole result as the pre-externalization
 * implementation with the same inputs.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { classifyInstrumentRole } from "./content-analyzer.js";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface NoteData {
  readonly pitch: number;
  readonly startTime: number;
  readonly duration: number;
  readonly velocity: number;
}

type InstrumentRole =
  | "drums"
  | "bass"
  | "lead"
  | "pad"
  | "arpeggio"
  | "chord"
  | "unclassified";

// ━━━ Reference Implementation (Original Hardcoded Values) ━━━━━━━━━━━━━━━━━━━

/**
 * These are the original hardcoded thresholds that were previously inlined
 * in content-analyzer.ts before externalization.
 */
const REF_ROLE_KEYWORDS = {
  drums: ["drum", "kick", "hat", "snare", "perc"],
  bass: ["bass"],
  lead: ["lead", "melody"],
  pad: ["pad"],
  arp: ["arp"],
} as const;

const REF_CLASSIFICATION_THRESHOLDS = {
  drums: {
    pitchRangeLow: 35,
    pitchRangeHigh: 81,
    regularityThreshold: 0.8,
    pitchVarietyPerBeatCeiling: 3,
    avgDurationCeiling: 0.5,
  },
  bass: {
    avgPitchCeiling: 60,
    avgPolyphonyCeiling: 1.5,
  },
  arpeggio: {
    densityThreshold: 4,
    regularityThreshold: 0.7,
  },
  pad: {
    avgPolyphonyThreshold: 2.5,
    avgDurationThreshold: 2,
  },
  chord: {
    polyphonyLowBound: 2,
    polyphonyHighBound: 4,
    durationLowBound: 0.5,
    durationHighBound: 2,
  },
  lead: {
    polyphonyCeiling: 1.5,
    avgPitchThreshold: 55,
    pitchVarietyThreshold: 3,
  },
} as const;

// ━━━ Reference Helper Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refTrackNameContainsKeyword(trackName: string, keywords: readonly string[]): boolean {
  const lower = trackName.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function refRoleFromTrackName(trackName: string): InstrumentRole | null {
  if (refTrackNameContainsKeyword(trackName, REF_ROLE_KEYWORDS.drums)) return "drums";
  if (refTrackNameContainsKeyword(trackName, REF_ROLE_KEYWORDS.bass)) return "bass";
  if (refTrackNameContainsKeyword(trackName, REF_ROLE_KEYWORDS.lead)) return "lead";
  if (refTrackNameContainsKeyword(trackName, REF_ROLE_KEYWORDS.pad)) return "pad";
  if (refTrackNameContainsKeyword(trackName, REF_ROLE_KEYWORDS.arp)) return "arpeggio";
  return null;
}

function refComputeAvgPolyphony(notes: readonly NoteData[]): number {
  if (notes.length === 0) return 0;

  let totalPolyphony = 0;
  for (const note of notes) {
    let simultaneous = 0;
    for (const other of notes) {
      if (
        other.startTime < note.startTime + note.duration &&
        other.startTime + other.duration > note.startTime
      ) {
        simultaneous++;
      }
    }
    totalPolyphony += simultaneous;
  }
  return totalPolyphony / notes.length;
}

function refComputeRhythmicRegularity(notes: readonly NoteData[]): number {
  if (notes.length < 2) return 0;

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  const iois: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const ioi = sorted[i].startTime - sorted[i - 1].startTime;
    if (ioi > 0) iois.push(ioi);
  }

  if (iois.length === 0) return 0;

  const mean = iois.reduce((sum, v) => sum + v, 0) / iois.length;
  if (mean === 0) return 0;

  const variance = iois.reduce((sum, v) => sum + (v - mean) ** 2, 0) / iois.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;

  return Math.max(0, Math.min(1, 1 - cv));
}

function refComputePitchVarietyPerBeat(notes: readonly NoteData[]): number {
  if (notes.length === 0) return 0;

  const beatMap = new Map<number, Set<number>>();
  for (const note of notes) {
    const beat = Math.floor(note.startTime);
    if (!beatMap.has(beat)) beatMap.set(beat, new Set());
    beatMap.get(beat)!.add(note.pitch);
  }

  if (beatMap.size === 0) return 0;

  let totalVariety = 0;
  for (const pitches of beatMap.values()) {
    totalVariety += pitches.size;
  }
  return totalVariety / beatMap.size;
}

function refHasConsistentSpacing(notes: readonly NoteData[]): boolean {
  return refComputeRhythmicRegularity(notes) > REF_CLASSIFICATION_THRESHOLDS.arpeggio.regularityThreshold;
}

// ━━━ Reference classifyInstrumentRole ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function referenceClassifyInstrumentRole(
  notes: readonly NoteData[],
  trackName: string,
  hasDrumRack?: boolean,
): InstrumentRole {
  // Step 0: DrumRack override
  if (hasDrumRack) {
    return "drums";
  }

  // Step 1: Track name drum keywords
  if (refTrackNameContainsKeyword(trackName, REF_ROLE_KEYWORDS.drums)) {
    return "drums";
  }

  // Handle empty notes
  if (notes.length === 0) {
    const nameRole = refRoleFromTrackName(trackName);
    return nameRole ?? "unclassified";
  }

  // Step 2: Compute note statistics
  const avgPolyphony = refComputeAvgPolyphony(notes);
  const avgDuration = notes.reduce((sum, n) => sum + n.duration, 0) / notes.length;
  const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;

  const minTime = Math.min(...notes.map((n) => n.startTime));
  const maxTime = Math.max(...notes.map((n) => n.startTime + n.duration));
  const timeSpanBeats = maxTime - minTime;
  const density = timeSpanBeats > 0 ? notes.length / timeSpanBeats : 0;

  const pitchVarietyPerBeat = refComputePitchVarietyPerBeat(notes);
  const rhythmicRegularity = refComputeRhythmicRegularity(notes);

  const pitchClassSet = new Set(notes.map((n) => n.pitch % 12));
  const pitchVariety = pitchClassSet.size;

  const thresholds = REF_CLASSIFICATION_THRESHOLDS;

  // 3a: Drums
  const allPitchesInDrumRange = notes.every(
    (n) => n.pitch >= thresholds.drums.pitchRangeLow && n.pitch <= thresholds.drums.pitchRangeHigh,
  );
  if (
    allPitchesInDrumRange &&
    rhythmicRegularity > thresholds.drums.regularityThreshold &&
    pitchVarietyPerBeat < thresholds.drums.pitchVarietyPerBeatCeiling &&
    avgDuration < thresholds.drums.avgDurationCeiling
  ) {
    return "drums";
  }

  // 3b: Bass
  if (avgPitch < thresholds.bass.avgPitchCeiling && avgPolyphony < thresholds.bass.avgPolyphonyCeiling) {
    return "bass";
  }

  // 3c: Arpeggio
  if (density > thresholds.arpeggio.densityThreshold && refHasConsistentSpacing(notes)) {
    return "arpeggio";
  }

  // 3d: Pad
  if (avgPolyphony > thresholds.pad.avgPolyphonyThreshold && avgDuration > thresholds.pad.avgDurationThreshold) {
    return "pad";
  }

  // 3e: Chord
  if (
    avgPolyphony >= thresholds.chord.polyphonyLowBound &&
    avgPolyphony <= thresholds.chord.polyphonyHighBound &&
    avgDuration >= thresholds.chord.durationLowBound &&
    avgDuration <= thresholds.chord.durationHighBound
  ) {
    return "chord";
  }

  // 3f: Lead
  if (
    avgPolyphony < thresholds.lead.polyphonyCeiling &&
    avgPitch > thresholds.lead.avgPitchThreshold &&
    pitchVariety >= thresholds.lead.pitchVarietyThreshold
  ) {
    return "lead";
  }

  // Step 4: Track name fallback
  const nameHint = refRoleFromTrackName(trackName);
  if (nameHint !== null) {
    return nameHint;
  }

  return "unclassified";
}

// ━━━ Arbitrary Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a single NoteData with constrained ranges.
 */
function arbNoteData(): fc.Arbitrary<NoteData> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 127 }),           // pitch
      fc.double({ min: 0, max: 256, noNaN: true, noDefaultInfinity: true }), // startTime
      fc.double({ min: 0.01, max: 16, noNaN: true, noDefaultInfinity: true }), // duration
      fc.integer({ min: 1, max: 127 }),            // velocity
    )
    .map(([pitch, startTime, duration, velocity]) => ({
      pitch,
      startTime,
      duration,
      velocity,
    }));
}

/**
 * Generate an array of NoteData with 0–50 elements.
 */
function arbNoteDataArray(): fc.Arbitrary<readonly NoteData[]> {
  return fc.array(arbNoteData(), { minLength: 0, maxLength: 50 });
}

/**
 * Generate a track name: mix of random strings and keyword-triggering strings.
 */
function arbTrackName(): fc.Arbitrary<string> {
  return fc.oneof(
    // Random strings that likely won't trigger name hints
    fc.string({ minLength: 0, maxLength: 30 }),
    // Names that trigger keyword-based classification
    fc.constantFrom(
      "drum loop",
      "kick pattern",
      "hat groove",
      "snare roll",
      "perc hits",
      "bass line",
      "Sub Bass",
      "lead synth",
      "melody track",
      "pad ambient",
      "arp sequence",
      "Piano",
      "Guitar",
      "Strings",
      "",
      "Track 1",
      "MIDI 3",
      "Instrument",
    ),
  );
}

/**
 * Generate a hasDrumRack boolean.
 */
function arbHasDrumRack(): fc.Arbitrary<boolean> {
  return fc.boolean();
}

// ━━━ Property Test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: detection-data-externalization, Property 6: Content analyzer behavioral equivalence", () => {
  test.prop(
    [arbNoteDataArray(), arbTrackName(), arbHasDrumRack()],
    { numRuns: 200 },
  )(
    "classifyInstrumentRole produces identical results to the reference implementation using original hardcoded values",
    (notes, trackName, hasDrumRack) => {
      const actual = classifyInstrumentRole(notes, trackName, hasDrumRack);
      const expected = referenceClassifyInstrumentRole(notes, trackName, hasDrumRack);

      expect(actual).toBe(expected);
    },
  );

  test.prop(
    [arbNoteDataArray(), arbTrackName(), arbHasDrumRack()],
    { numRuns: 100 },
  )(
    "classifyInstrumentRole is deterministic: same input always produces same output",
    (notes, trackName, hasDrumRack) => {
      const result1 = classifyInstrumentRole(notes, trackName, hasDrumRack);
      const result2 = classifyInstrumentRole(notes, trackName, hasDrumRack);

      expect(result1).toBe(result2);
    },
  );
});
