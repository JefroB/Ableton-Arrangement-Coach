/**
 * Unit tests for the top-level analyzeContent entry point.
 */

import { describe, it, expect } from "vitest";
import { analyzeContent } from "./content-analyzer.js";
import type { NoteData } from "../ableton/sdk-adapter.js";
import type { Section } from "./section-scanner.js";
import type { TrackNoteData } from "./section-analyzer.js";
import type { DrumPadMap, DrumPadEntry } from "./content-analysis-types.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

function makeSection(id: string, name: string, start: number, end: number): Section {
  return { id, name, startTime: start, endTime: end };
}

function makeNote(pitch: number, startTime: number, duration = 0.25, velocity = 100): NoteData {
  return { pitch, startTime, duration, velocity };
}

/** Generate a simple repeating 4-beat kick pattern across a time range. */
function makeKickPattern(start: number, end: number): NoteData[] {
  const notes: NoteData[] = [];
  for (let t = start; t < end; t += 1) {
    notes.push(makeNote(36, t, 0.25, 100));
  }
  return notes;
}

/** Generate a simple bass line across a time range. */
function makeBassLine(start: number, end: number): NoteData[] {
  const notes: NoteData[] = [];
  for (let t = start; t < end; t += 2) {
    notes.push(makeNote(40, t, 1.5, 90));
  }
  return notes;
}

/** Create a basic DrumPadMap with kick, snare, hi-hat. */
function makeBasicDrumPadMap(): DrumPadMap {
  const map = new Map<number, DrumPadEntry>();
  map.set(36, { pitch: 36, sampleName: "Kick_808", category: "kick" });
  map.set(38, { pitch: 38, sampleName: "Snare_Tight", category: "snare" });
  map.set(42, { pitch: 42, sampleName: "HiHat_Closed", category: "hi-hat" });
  map.set(46, { pitch: 46, sampleName: "HiHat_Open", category: "hi-hat" });
  map.set(49, { pitch: 49, sampleName: "Crash_A", category: "cymbal" });
  return map;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("analyzeContent", () => {
  it("returns empty result for empty sections", () => {
    const result = analyzeContent([], [], [], new Map());
    expect(result.perSection.size).toBe(0);
    expect(result.crossSection.size).toBe(0);
    expect(result.phraseLengths.size).toBe(0);
    expect(result.percussionDiscontinuities).toEqual([]);
  });

  it("returns empty result for empty trackNoteData", () => {
    const sections: Section[] = [makeSection("s0", "Intro", 0, 32)];
    const result = analyzeContent(sections, [], [], new Map());
    expect(result.perSection.size).toBe(0);
  });

  it("returns empty result when all sections have Infinity endTime", () => {
    const sections: Section[] = [
      { id: "s0", name: "Intro", startTime: 0, endTime: Infinity },
    ];
    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: makeKickPattern(0, 32) },
    ];
    const result = analyzeContent(sections, trackData, ["Drums"], new Map());
    expect(result.perSection.size).toBe(0);
  });

  it("produces per-section analysis for a single track and section", () => {
    const sections: Section[] = [makeSection("s0", "Verse", 0, 32)];
    const trackData: TrackNoteData[] = [
      { trackName: "Bass", notes: makeBassLine(0, 32) },
    ];

    const result = analyzeContent(sections, trackData, ["Bass"], new Map());

    expect(result.perSection.size).toBe(1);
    const sectionAnalysis = result.perSection.get("s0");
    expect(sectionAnalysis).toBeDefined();
    expect(sectionAnalysis!.has("Bass")).toBe(true);

    const trackAnalysis = sectionAnalysis!.get("Bass")!;
    expect(trackAnalysis.role).toBe("bass");
    expect(trackAnalysis.fingerprint.density).toBeGreaterThan(0);
    expect(trackAnalysis.percussionPattern).toBeNull(); // not drums
    expect(trackAnalysis.drumElementProfile).toBeNull();
  });

  it("classifies drum tracks and produces percussion patterns", () => {
    const sections: Section[] = [makeSection("s0", "Drop", 0, 32)];
    const drumPadMap = makeBasicDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: makeKickPattern(0, 32) },
    ];

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    const trackAnalysis = result.perSection.get("s0")!.get("Drums")!;
    expect(trackAnalysis.role).toBe("drums");
    expect(trackAnalysis.percussionPattern).not.toBeNull();
    expect(trackAnalysis.drumElementProfile).not.toBeNull();
    expect(trackAnalysis.drumElementProfile!.activeElements.has("kick")).toBe(true);
  });

  it("produces cross-section comparisons for multiple sections", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Verse 2", 32, 64),
    ];
    // Same pattern in both sections → should be "shared"
    const trackData: TrackNoteData[] = [
      { trackName: "Bass", notes: makeBassLine(0, 64) },
    ];

    const result = analyzeContent(sections, trackData, ["Bass"], new Map());

    expect(result.crossSection.has("Bass")).toBe(true);
    const comparisons = result.crossSection.get("Bass")!;
    expect(comparisons.length).toBe(1);
    expect(comparisons[0].sectionIndexA).toBe(0);
    expect(comparisons[0].sectionIndexB).toBe(1);
    expect(comparisons[0].similarity).toBeGreaterThan(0.5);
  });

  it("produces repetition summaries", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Verse 2", 32, 64),
      makeSection("s2", "Verse 3", 64, 96),
    ];
    // Same kick pattern in all 3 sections → extended repetition
    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: makeKickPattern(0, 96) },
    ];
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", makeBasicDrumPadMap()]]);

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    expect(result.repetitionSummary.has("Drums")).toBe(true);
    const summary = result.repetitionSummary.get("Drums")!;
    expect(summary.role).toBe("drums");
    // Same pattern should form shared groups
    expect(summary.sharedGroups.length).toBeGreaterThan(0);
  });

  it("produces phrase lengths per section", () => {
    const sections: Section[] = [
      makeSection("s0", "Intro", 0, 64),
      makeSection("s1", "Verse", 64, 128),
    ];
    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: makeKickPattern(0, 128) },
    ];
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", makeBasicDrumPadMap()]]);

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    expect(result.phraseLengths.size).toBe(2);
    expect(result.phraseLengths.has("s0")).toBe(true);
    expect(result.phraseLengths.has("s1")).toBe(true);
    // Phrase length should be one of 4, 8, or 16
    const pl = result.phraseLengths.get("s0")!;
    expect([4, 8, 16]).toContain(pl);
  });

  it("computes percussion snapshots for drum tracks with DrumPadMap", () => {
    const sections: Section[] = [makeSection("s0", "Drop", 0, 32)];
    const drumPadMap = makeBasicDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    const drumNotes: NoteData[] = [
      ...makeKickPattern(0, 32),
      // Add some hi-hats
      ...Array.from({ length: 16 }, (_, i) => makeNote(42, i * 2, 0.1, 80)),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: drumNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    expect(result.percussionSnapshots.has("s0")).toBe(true);
    const sectionSnap = result.percussionSnapshots.get("s0")!;
    expect(sectionSnap.has("Drums")).toBe(true);

    const snapshot = sectionSnap.get("Drums")!;
    expect(snapshot.activeElements.has("Kick_808")).toBe(true);
    expect(snapshot.activeElements.has("HiHat_Closed")).toBe(true);
    expect(snapshot.elementCounts.get("Kick_808")).toBeGreaterThan(0);
  });

  it("detects percussion discontinuities across sections", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Verse 2", 32, 64),
    ];
    const drumPadMap = makeBasicDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    // Kick in both sections, hi-hat only in first section
    const drumNotes: NoteData[] = [
      ...makeKickPattern(0, 64),
      // Hi-hats only in section 1
      ...Array.from({ length: 16 }, (_, i) => makeNote(42, i * 2, 0.1, 80)),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: drumNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    // Hi-hat should be a discontinuity (present in s0, absent in s1)
    expect(result.percussionDiscontinuities.length).toBeGreaterThan(0);
    const hiHatDisc = result.percussionDiscontinuities.find(
      (d) => d.elementName === "HiHat_Closed",
    );
    expect(hiHatDisc).toBeDefined();
    expect(hiHatDisc!.presentInSections).toContain(0);
    expect(hiHatDisc!.absentFromSections).toContain(1);
    expect(hiHatDisc!.trackName).toBe("Drums");
  });

  it("handles multi-track scenarios correctly", () => {
    const sections: Section[] = [makeSection("s0", "Verse", 0, 32)];
    const drumPadMap = makeBasicDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: makeKickPattern(0, 32) },
      { trackName: "Bass", notes: makeBassLine(0, 32) },
    ];

    const result = analyzeContent(sections, trackData, ["Drums", "Bass"], drumPadMaps);

    const sectionAnalysis = result.perSection.get("s0")!;
    expect(sectionAnalysis.has("Drums")).toBe(true);
    expect(sectionAnalysis.has("Bass")).toBe(true);
    expect(sectionAnalysis.get("Drums")!.role).toBe("drums");
    expect(sectionAnalysis.get("Bass")!.role).toBe("bass");
  });

  it("detects builds at section boundaries", () => {
    const sections: Section[] = [
      makeSection("s0", "Buildup", 0, 32),
      makeSection("s1", "Drop", 32, 64),
    ];

    // Create a progressive density build in the last 4 bars (beats 16-32)
    const buildNotes: NoteData[] = [];
    // Bar 1 (beats 16-20): 2 notes
    buildNotes.push(makeNote(60, 16, 0.5, 80), makeNote(60, 18, 0.5, 80));
    // Bar 2 (beats 20-24): 4 notes (100% increase)
    for (let t = 20; t < 24; t += 1) buildNotes.push(makeNote(60, t, 0.5, 90));
    // Bar 3 (beats 24-28): 6 notes (50% increase)
    for (let t = 24; t < 28; t += 0.67) buildNotes.push(makeNote(60, t, 0.5, 100));
    // Bar 4 (beats 28-32): 10 notes (66% increase)
    for (let t = 28; t < 32; t += 0.4) buildNotes.push(makeNote(60, t, 0.5, 110));
    // Add some notes at the start for the track to not be empty
    for (let t = 0; t < 16; t += 2) buildNotes.push(makeNote(60, t, 0.5, 70));

    const trackData: TrackNoteData[] = [
      { trackName: "Lead", notes: buildNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Lead"], new Map());

    // Check that a build was detected in section s0
    const sectionAnalysis = result.perSection.get("s0")!.get("Lead")!;
    expect(sectionAnalysis.build).not.toBeNull();
    if (sectionAnalysis.build) {
      expect(sectionAnalysis.build.trackName).toBe("Lead");
      expect(sectionAnalysis.build.targetBoundary).toBe(32);
    }
  });
});

// ─── Integration Tests: Multi-Track, Multi-Section ────────────────────

describe("analyzeContent integration (multi-track, multi-section)", () => {
  // ─── Additional Helpers ─────────────────────────────────────────────

  /** Generate a hi-hat pattern (8th notes on pitch 42). */
  function makeHiHatPattern(start: number, end: number): NoteData[] {
    const notes: NoteData[] = [];
    for (let t = start; t < end; t += 0.5) {
      notes.push(makeNote(42, t, 0.1, 80));
    }
    return notes;
  }

  /** Generate a snare pattern (on beats 2 and 4 of each bar). */
  function makeSnarePattern(start: number, end: number): NoteData[] {
    const notes: NoteData[] = [];
    for (let t = start; t < end; t += 4) {
      notes.push(makeNote(38, t + 1, 0.25, 110)); // beat 2
      notes.push(makeNote(38, t + 3, 0.25, 110)); // beat 4
    }
    return notes;
  }

  /** Generate a lead melody pattern across a time range. */
  function makeLeadMelody(start: number, end: number): NoteData[] {
    const notes: NoteData[] = [];
    const pitches = [72, 74, 76, 77, 79, 76, 74, 72]; // C5 scale fragment
    let idx = 0;
    for (let t = start; t < end; t += 1) {
      notes.push(makeNote(pitches[idx % pitches.length], t, 0.75, 95));
      idx++;
    }
    return notes;
  }

  /** Generate a contrasting lead melody (different pitch set and rhythm). */
  function makeContrastingLeadMelody(start: number, end: number): NoteData[] {
    const notes: NoteData[] = [];
    const pitches = [60, 63, 65, 67, 70]; // minor pentatonic, different octave
    let idx = 0;
    for (let t = start; t < end; t += 2) {
      notes.push(makeNote(pitches[idx % pitches.length], t, 1.5, 85));
      idx++;
    }
    return notes;
  }

  /** Create a drum pattern with a fill at the end (last bar has density increase + new pitches). */
  function makeDrumPatternWithFill(start: number, end: number): NoteData[] {
    const notes: NoteData[] = [];
    // Main kick + hi-hat loop
    for (let t = start; t < end - 4; t += 1) {
      notes.push(makeNote(36, t, 0.25, 100)); // kick every beat
    }
    for (let t = start; t < end - 4; t += 0.5) {
      notes.push(makeNote(42, t, 0.1, 80)); // hi-hat 8th notes
    }
    // Fill in last bar: tom rolls (new pitches 45, 47, 48) + high density
    const fillStart = end - 4;
    for (let t = fillStart; t < end; t += 0.25) {
      const tomPitch = [45, 47, 48][Math.floor((t - fillStart) * 4) % 3];
      notes.push(makeNote(tomPitch, t, 0.2, 110));
    }
    return notes;
  }

  /** Create an extended DrumPadMap with toms for fill detection. */
  function makeExtendedDrumPadMap(): DrumPadMap {
    const map = new Map<number, DrumPadEntry>();
    map.set(36, { pitch: 36, sampleName: "Kick_808", category: "kick" });
    map.set(38, { pitch: 38, sampleName: "Snare_Tight", category: "snare" });
    map.set(42, { pitch: 42, sampleName: "HiHat_Closed", category: "hi-hat" });
    map.set(45, { pitch: 45, sampleName: "Tom_Low", category: "tom" });
    map.set(47, { pitch: 47, sampleName: "Tom_Mid", category: "tom" });
    map.set(48, { pitch: 48, sampleName: "Tom_High", category: "tom" });
    map.set(49, { pitch: 49, sampleName: "Crash_A", category: "cymbal" });
    return map;
  }

  it("processes drums + bass + lead across 3 sections with all result fields populated", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Chorus", 32, 64),
      makeSection("s2", "Verse 2", 64, 96),
    ];

    const drumPadMap = makeExtendedDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    const drumNotes = [
      ...makeKickPattern(0, 96),
      ...makeHiHatPattern(0, 96),
      ...makeSnarePattern(0, 96),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: drumNotes },
      { trackName: "Bass", notes: makeBassLine(0, 96) },
      { trackName: "Lead", notes: makeLeadMelody(0, 96) },
    ];

    const result = analyzeContent(sections, trackData, ["Drums", "Bass", "Lead"], drumPadMaps);

    // 1. perSection: all 3 sections, each with 3 tracks
    expect(result.perSection.size).toBe(3);
    for (const sectionId of ["s0", "s1", "s2"]) {
      const sectionMap = result.perSection.get(sectionId);
      expect(sectionMap).toBeDefined();
      expect(sectionMap!.size).toBe(3);
      expect(sectionMap!.has("Drums")).toBe(true);
      expect(sectionMap!.has("Bass")).toBe(true);
      expect(sectionMap!.has("Lead")).toBe(true);
    }

    // 2. Roles classified correctly
    const s0Analysis = result.perSection.get("s0")!;
    expect(s0Analysis.get("Drums")!.role).toBe("drums");
    expect(s0Analysis.get("Bass")!.role).toBe("bass");
    expect(s0Analysis.get("Lead")!.role).toBe("lead");

    // 3. Fingerprints populated with non-zero density
    expect(s0Analysis.get("Drums")!.fingerprint.density).toBeGreaterThan(0);
    expect(s0Analysis.get("Bass")!.fingerprint.density).toBeGreaterThan(0);
    expect(s0Analysis.get("Lead")!.fingerprint.density).toBeGreaterThan(0);

    // 4. Percussion pattern only for drums, null for others
    expect(s0Analysis.get("Drums")!.percussionPattern).not.toBeNull();
    expect(s0Analysis.get("Bass")!.percussionPattern).toBeNull();
    expect(s0Analysis.get("Lead")!.percussionPattern).toBeNull();

    // 5. Drum element profile only for drums with DrumPadMap
    expect(s0Analysis.get("Drums")!.drumElementProfile).not.toBeNull();
    expect(s0Analysis.get("Drums")!.drumElementProfile!.activeElements.has("kick")).toBe(true);
    expect(s0Analysis.get("Drums")!.drumElementProfile!.activeElements.has("hi-hat")).toBe(true);
    expect(s0Analysis.get("Drums")!.drumElementProfile!.activeElements.has("snare")).toBe(true);
    expect(s0Analysis.get("Bass")!.drumElementProfile).toBeNull();

    // 6. crossSection: comparisons for all 3 tracks (2 comparisons each: 0→1, 1→2)
    expect(result.crossSection.size).toBe(3);
    for (const trackName of ["Drums", "Bass", "Lead"]) {
      const comparisons = result.crossSection.get(trackName)!;
      expect(comparisons.length).toBe(2);
      expect(comparisons[0].sectionIndexA).toBe(0);
      expect(comparisons[0].sectionIndexB).toBe(1);
      expect(comparisons[1].sectionIndexA).toBe(1);
      expect(comparisons[1].sectionIndexB).toBe(2);
      // All similarities in valid range
      for (const c of comparisons) {
        expect(c.similarity).toBeGreaterThanOrEqual(0);
        expect(c.similarity).toBeLessThanOrEqual(1);
        expect(["shared", "similar", "contrasting"]).toContain(c.classification);
      }
    }

    // 7. repetitionSummary: one entry per track
    expect(result.repetitionSummary.size).toBe(3);
    expect(result.repetitionSummary.has("Drums")).toBe(true);
    expect(result.repetitionSummary.has("Bass")).toBe(true);
    expect(result.repetitionSummary.has("Lead")).toBe(true);
    expect(result.repetitionSummary.get("Drums")!.role).toBe("drums");
    expect(result.repetitionSummary.get("Bass")!.role).toBe("bass");
    expect(result.repetitionSummary.get("Lead")!.role).toBe("lead");

    // 8. phraseLengths: one entry per section
    expect(result.phraseLengths.size).toBe(3);
    for (const sId of ["s0", "s1", "s2"]) {
      expect(result.phraseLengths.has(sId)).toBe(true);
      expect([4, 8, 16]).toContain(result.phraseLengths.get(sId));
    }

    // 9. percussionSnapshots: at least the sections with drum tracks
    expect(result.percussionSnapshots.size).toBeGreaterThan(0);
    for (const sId of ["s0", "s1", "s2"]) {
      const sectionSnap = result.percussionSnapshots.get(sId);
      expect(sectionSnap).toBeDefined();
      expect(sectionSnap!.has("Drums")).toBe(true);
      const snapshot = sectionSnap!.get("Drums")!;
      expect(snapshot.activeElements.size).toBeGreaterThan(0);
      expect(snapshot.elementCounts.size).toBeGreaterThan(0);
    }

    // 10. percussionDiscontinuities: array (may or may not have items depending on pattern)
    expect(Array.isArray(result.percussionDiscontinuities)).toBe(true);
  });

  it("detects extended repetition when same pattern repeats across 3+ consecutive sections", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Verse 2", 32, 64),
      makeSection("s2", "Verse 3", 64, 96),
      makeSection("s3", "Verse 4", 96, 128),
    ];

    // Identical kick pattern across all 4 sections → extended repetition
    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: makeKickPattern(0, 128) },
    ];
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", makeBasicDrumPadMap()]]);

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    const summary = result.repetitionSummary.get("Drums")!;
    expect(summary.hasExtendedRepetition).toBe(true);
    expect(summary.extendedRepetitionSections.length).toBeGreaterThanOrEqual(3);
    // All sections should be in shared groups since the pattern is identical
    expect(summary.sharedGroups.length).toBeGreaterThan(0);
    // The largest shared group should contain at least 3 consecutive indices
    const largestGroup = summary.sharedGroups.reduce(
      (max, g) => g.length > max.length ? g : max, [] as readonly number[],
    );
    expect(largestGroup.length).toBeGreaterThanOrEqual(3);
  });

  it("identifies contrasting sections in cross-section comparisons", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse", 0, 32),
      makeSection("s1", "Breakdown", 32, 64),
      makeSection("s2", "Verse", 64, 96),
    ];

    // Verse: dense lead melody. Breakdown: sparse, different pitch set
    const leadNotes = [
      ...makeLeadMelody(0, 32),          // Verse 1: dense C major melody
      ...makeContrastingLeadMelody(32, 64), // Breakdown: sparse minor pentatonic
      ...makeLeadMelody(64, 96),          // Verse 2: same as Verse 1
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Lead Synth", notes: leadNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Lead Synth"], new Map());

    const comparisons = result.crossSection.get("Lead Synth")!;
    expect(comparisons.length).toBe(2);

    // Verse→Breakdown should be contrasting or at least low similarity
    expect(comparisons[0].similarity).toBeLessThan(0.85);

    // Breakdown→Verse should also be different
    expect(comparisons[1].similarity).toBeLessThan(0.85);
  });

  it("detects builds in per-section results when progressive density exists", () => {
    const sections: Section[] = [
      makeSection("s0", "Buildup", 0, 32),
      makeSection("s1", "Drop", 32, 64),
      makeSection("s2", "Outro", 64, 96),
    ];

    // Build section: progressive density increase in last 4 bars
    const buildNotes: NoteData[] = [];
    // First 4 bars: sparse background
    for (let t = 0; t < 16; t += 2) buildNotes.push(makeNote(60, t, 0.5, 70));
    // Bar 5 (beats 16-20): 2 notes per beat
    for (let t = 16; t < 20; t += 0.5) buildNotes.push(makeNote(60, t, 0.25, 80));
    // Bar 6 (beats 20-24): 3 notes per beat (50% increase)
    for (let t = 20; t < 24; t += 0.33) buildNotes.push(makeNote(60, t, 0.25, 90));
    // Bar 7 (beats 24-28): 5 notes per beat (67% increase)
    for (let t = 24; t < 28; t += 0.2) buildNotes.push(makeNote(60, t, 0.25, 100));
    // Bar 8 (beats 28-32): 8 notes per beat (60% increase)
    for (let t = 28; t < 32; t += 0.125) buildNotes.push(makeNote(60, t, 0.25, 115));

    // Drop and Outro: flat pattern, no build
    for (let t = 32; t < 96; t += 1) buildNotes.push(makeNote(60, t, 0.5, 100));

    const trackData: TrackNoteData[] = [
      { trackName: "Riser", notes: buildNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Riser"], new Map());

    // Section s0 (Buildup) should have a build detected
    const s0Analysis = result.perSection.get("s0")!.get("Riser")!;
    expect(s0Analysis.build).not.toBeNull();
    expect(s0Analysis.build!.trackName).toBe("Riser");
    expect(s0Analysis.build!.targetBoundary).toBe(32);
    expect(["density", "combined"]).toContain(s0Analysis.build!.type);

    // Section s1 (Drop) should have a build detected targeting the s2 boundary
    // (flat pattern, so likely no build)
    const s1Analysis = result.perSection.get("s1")!.get("Riser")!;
    expect(s1Analysis.build).toBeNull();
  });

  it("returns valid structure in degraded mode (simulating budget exceeded)", () => {
    // We can't easily trigger the 50ms budget in a test, but we can verify that
    // the result structure is always valid regardless of whether degraded mode
    // was triggered. The key invariant: perSection and phraseLengths are ALWAYS
    // populated; crossSection and repetitionSummary may be empty Maps in degraded mode.
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Verse 2", 32, 64),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Bass", notes: makeBassLine(0, 64) },
    ];

    const result = analyzeContent(sections, trackData, ["Bass"], new Map());

    // Verify structural validity: all required fields exist and have correct types
    expect(result.perSection).toBeInstanceOf(Map);
    expect(result.crossSection).toBeInstanceOf(Map);
    expect(result.repetitionSummary).toBeInstanceOf(Map);
    expect(result.phraseLengths).toBeInstanceOf(Map);
    expect(result.percussionSnapshots).toBeInstanceOf(Map);
    expect(Array.isArray(result.percussionDiscontinuities)).toBe(true);

    // perSection is always populated (never degraded away)
    expect(result.perSection.size).toBe(2);
    // phraseLengths is always populated (never degraded away)
    expect(result.phraseLengths.size).toBe(2);

    // In normal mode, crossSection and repetitionSummary are populated
    // In degraded mode, they would be empty Maps — either is a valid structure
    expect(result.crossSection.size).toBeGreaterThanOrEqual(0);
    expect(result.repetitionSummary.size).toBeGreaterThanOrEqual(0);
  });

  it("validates degraded result structure matches ContentAnalysisResult interface", () => {
    // Simulate what a degraded result looks like by verifying the structure
    // that analyzeContent would return if budget exceeded (based on implementation):
    // perSection populated, crossSection empty, repetitionSummary empty,
    // phraseLengths populated, percussionSnapshots populated, discontinuities empty.
    const sections: Section[] = [
      makeSection("s0", "Intro", 0, 64),
      makeSection("s1", "Verse", 64, 128),
      makeSection("s2", "Chorus", 128, 192),
    ];

    const drumPadMap = makeBasicDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    // Large-ish data to exercise the pipeline
    const drumNotes = [
      ...makeKickPattern(0, 192),
      ...Array.from({ length: 192 * 2 }, (_, i) => makeNote(42, i * 0.5, 0.1, 80)),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: drumNotes },
      { trackName: "Bass", notes: makeBassLine(0, 192) },
      { trackName: "Lead", notes: makeLeadMelody(0, 192) },
    ];

    const result = analyzeContent(sections, trackData, ["Drums", "Bass", "Lead"], drumPadMaps);

    // Regardless of whether budget was exceeded:
    // perSection must have entries for all valid sections
    expect(result.perSection.size).toBe(3);
    // phraseLengths must have entries for all valid sections
    expect(result.phraseLengths.size).toBe(3);

    // If not degraded (likely in tests since it's fast):
    // crossSection and repetitionSummary are populated
    if (result.crossSection.size > 0) {
      expect(result.crossSection.size).toBe(3); // one per track
      expect(result.repetitionSummary.size).toBe(3);
    } else {
      // Degraded: still valid Maps, just empty
      expect(result.crossSection).toBeInstanceOf(Map);
      expect(result.repetitionSummary).toBeInstanceOf(Map);
      expect(result.percussionDiscontinuities).toEqual([]);
    }
  });

  it("correctly populates percussion discontinuities across sections with varying elements", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse 1", 0, 32),
      makeSection("s1", "Chorus", 32, 64),
      makeSection("s2", "Verse 2", 64, 96),
    ];

    const drumPadMap = makeExtendedDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    // Kick in all sections, hi-hat in sections 0 and 2 only, crash only in section 1
    const drumNotes: NoteData[] = [
      ...makeKickPattern(0, 96),
      // Hi-hat in Verse 1
      ...Array.from({ length: 32 }, (_, i) => makeNote(42, i, 0.1, 80)),
      // No hi-hat in Chorus (section 1: beats 32-64)
      // Crash only in Chorus
      ...Array.from({ length: 8 }, (_, i) => makeNote(49, 32 + i * 4, 0.5, 100)),
      // Hi-hat returns in Verse 2
      ...Array.from({ length: 32 }, (_, i) => makeNote(42, 64 + i, 0.1, 80)),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: drumNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    // Should detect discontinuities for hi-hat (present in s0 and s2, absent in s1)
    // and crash (present in s1, absent in s0 and s2)
    expect(result.percussionDiscontinuities.length).toBeGreaterThan(0);

    const hiHatDisc = result.percussionDiscontinuities.find(
      (d) => d.elementName === "HiHat_Closed",
    );
    expect(hiHatDisc).toBeDefined();
    expect(hiHatDisc!.presentInSections).toContain(0);
    expect(hiHatDisc!.presentInSections).toContain(2);
    expect(hiHatDisc!.absentFromSections).toContain(1);
    expect(hiHatDisc!.trackName).toBe("Drums");

    const crashDisc = result.percussionDiscontinuities.find(
      (d) => d.elementName === "Crash_A",
    );
    expect(crashDisc).toBeDefined();
    expect(crashDisc!.presentInSections).toContain(1);
    expect(crashDisc!.absentFromSections).toContain(0);
    expect(crashDisc!.absentFromSections).toContain(2);
  });

  it("detects fills in per-section drum analysis with DrumPadMap", () => {
    const sections: Section[] = [
      makeSection("s0", "Verse", 0, 32),
      makeSection("s1", "Chorus", 32, 64),
    ];

    const drumPadMap = makeExtendedDrumPadMap();
    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", drumPadMap]]);

    // Verse has a drum pattern with fill at the end
    const drumNotes = makeDrumPatternWithFill(0, 32);
    // Chorus has a regular pattern (no fill)
    const chorusNotes = makeKickPattern(32, 64);

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: [...drumNotes, ...chorusNotes] },
    ];

    const result = analyzeContent(sections, trackData, ["Drums"], drumPadMaps);

    // The verse section should have a percussion pattern with fills detected
    const verseAnalysis = result.perSection.get("s0")!.get("Drums")!;
    expect(verseAnalysis.percussionPattern).not.toBeNull();
    expect(verseAnalysis.percussionPattern!.fills.length).toBeGreaterThan(0);

    // The fill should have drum elements populated (because we have a DrumPadMap)
    const fill = verseAnalysis.percussionPattern!.fills[0];
    expect(fill.drumElements).not.toBeNull();
    expect(fill.drumElements!.length).toBeGreaterThan(0);
    expect(fill.drumElements!).toContain("tom"); // Our fill uses tom pitches
  });

  it("handles tracks without notes in some sections gracefully", () => {
    const sections: Section[] = [
      makeSection("s0", "Intro", 0, 32),
      makeSection("s1", "Verse", 32, 64),
      makeSection("s2", "Chorus", 64, 96),
    ];

    // Bass only plays in Verse and Chorus (not Intro)
    const bassNotes = makeBassLine(32, 96);
    // Drums play in all sections
    const drumNotes = makeKickPattern(0, 96);

    const drumPadMaps = new Map<string, DrumPadMap>([["Drums", makeBasicDrumPadMap()]]);

    const trackData: TrackNoteData[] = [
      { trackName: "Drums", notes: drumNotes },
      { trackName: "Bass", notes: bassNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Drums", "Bass"], drumPadMaps);

    // All sections should still have entries for both tracks
    expect(result.perSection.size).toBe(3);
    for (const sId of ["s0", "s1", "s2"]) {
      expect(result.perSection.get(sId)!.has("Drums")).toBe(true);
      expect(result.perSection.get(sId)!.has("Bass")).toBe(true);
    }

    // Bass in Intro section should still have a valid fingerprint (empty, density 0)
    const introBassFP = result.perSection.get("s0")!.get("Bass")!.fingerprint;
    expect(introBassFP.density).toBe(0);

    // Bass in Verse should have content
    const verseBassFP = result.perSection.get("s1")!.get("Bass")!.fingerprint;
    expect(verseBassFP.density).toBeGreaterThan(0);
  });

  it("produces correct repetition summary uniqueSections for varied arrangement", () => {
    const sections: Section[] = [
      makeSection("s0", "Intro", 0, 32),
      makeSection("s1", "Verse 1", 32, 64),
      makeSection("s2", "Chorus", 64, 96),
      makeSection("s3", "Verse 2", 96, 128),
    ];

    // Bass: same pattern in Verse 1 and Verse 2, different in Intro and Chorus
    const bassNotes: NoteData[] = [
      // Intro: sparse low notes (different pattern)
      ...Array.from({ length: 4 }, (_, i) => makeNote(36, i * 8, 4, 80)),
      // Verse 1: regular bass line
      ...makeBassLine(32, 64),
      // Chorus: high bass, dense (contrasting)
      ...Array.from({ length: 32 }, (_, i) => makeNote(55, 64 + i, 0.5, 100)),
      // Verse 2: same as Verse 1
      ...makeBassLine(96, 128),
    ];

    const trackData: TrackNoteData[] = [
      { trackName: "Bass", notes: bassNotes },
    ];

    const result = analyzeContent(sections, trackData, ["Bass"], new Map());

    const summary = result.repetitionSummary.get("Bass")!;
    expect(summary.role).toBe("bass");

    // Verse 1 and Verse 2 should be similar (potentially shared)
    const comparisons = result.crossSection.get("Bass")!;
    expect(comparisons.length).toBe(3); // 3 pairs for 4 sections

    // Verify comparison between adjacent sections exists
    expect(comparisons[0].sectionIndexA).toBe(0);
    expect(comparisons[0].sectionIndexB).toBe(1);
  });
});
