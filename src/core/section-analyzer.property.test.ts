/**
 * Property-based tests for the Section Analyzer module.
 *
 * Feature: automation-awareness
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import {
  computeNoteBasedTrackActivity,
  computePitchRange,
  type TrackClipData,
  type TrackNoteData,
} from "./section-analyzer.js";
import type { ClipData, NoteData } from "../ableton/sdk-adapter.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a section with valid startTime < endTime. */
const sectionArbitrary = fc
  .tuple(
    fc.float({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
  )
  .map(([start, length]) => ({
    startTime: Math.fround(start),
    endTime: Math.fround(start + length),
  }));

/** Generate a track name. */
const trackNameArbitrary = fc.stringOf(
  fc.char().filter((c) => c !== "\0"),
  { minLength: 1, maxLength: 15 },
).filter((name) => name.trim().length > 0);

/** Generate a unique set of track names. */
const uniqueTrackNamesArbitrary = (count: number) =>
  fc.uniqueArray(trackNameArbitrary, { minLength: count, maxLength: count });

/** Generate a MIDI note with configurable time range. */
const noteArbitrary = (minTime: number, maxTime: number): fc.Arbitrary<NoteData> =>
  fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    startTime: fc.float({ min: Math.fround(minTime), max: Math.fround(maxTime), noNaN: true, noDefaultInfinity: true }),
    duration: fc.float({ min: Math.fround(0.1), max: Math.fround(16), noNaN: true, noDefaultInfinity: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  });

/** Generate an unmuted clip that overlaps a given section range. */
const overlappingClipArbitrary = (sectionStart: number, sectionEnd: number): fc.Arbitrary<ClipData> =>
  fc.record({
    startTime: fc.float({
      min: Math.fround(Math.max(0, sectionStart - 50)),
      max: Math.fround(sectionEnd - 0.01),
      noNaN: true,
      noDefaultInfinity: true,
    }),
    endTime: fc.float({
      min: Math.fround(sectionStart + 0.01),
      max: Math.fround(sectionEnd + 50),
      noNaN: true,
      noDefaultInfinity: true,
    }),
    muted: fc.constant(false),
    hasEnvelopes: fc.boolean(),
  }).filter((clip) => clip.startTime < clip.endTime);

/** Generate an unmuted clip that does NOT overlap a section range. */
const nonOverlappingClipArbitrary = (sectionStart: number, sectionEnd: number): fc.Arbitrary<ClipData> =>
  fc.oneof(
    // Clip entirely before section
    fc.record({
      startTime: fc.float({ min: 0, max: Math.fround(Math.max(0, sectionStart - 10)), noNaN: true, noDefaultInfinity: true }),
      endTime: fc.float({ min: 0, max: Math.fround(Math.max(0, sectionStart - 0.01)), noNaN: true, noDefaultInfinity: true }),
      muted: fc.constant(false),
      hasEnvelopes: fc.boolean(),
    }).filter((clip) => clip.startTime < clip.endTime && clip.endTime <= sectionStart),
    // Clip entirely after section
    fc.record({
      startTime: fc.float({ min: Math.fround(sectionEnd + 0.01), max: Math.fround(sectionEnd + 50), noNaN: true, noDefaultInfinity: true }),
      endTime: fc.float({ min: Math.fround(sectionEnd + 1), max: Math.fround(sectionEnd + 100), noNaN: true, noDefaultInfinity: true }),
      muted: fc.constant(false),
      hasEnvelopes: fc.boolean(),
    }).filter((clip) => clip.startTime < clip.endTime && clip.startTime >= sectionEnd),
  );

// ─── Property 12: Note-based MIDI track activity ───────────────────────

// Feature: automation-awareness, Property 12: Note-based MIDI track activity
describe("Property 12: Note-based MIDI track activity", () => {
  /**
   * **Validates: Requirements 9.1, 9.3**
   *
   * For any section and set of tracks, a MIDI track SHALL be counted as
   * "active" if and only if it has at least one unmuted note whose startTime
   * falls within [section.startTime, section.endTime). Audio tracks SHALL be
   * counted as "active" based solely on unmuted clip overlap with the section
   * range.
   */

  test.prop(
    [
      // section: startTime and endTime
      fc.float({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 4, max: 64, noNaN: true, noDefaultInfinity: true }),
      // number of MIDI tracks with notes in range
      fc.integer({ min: 0, max: 3 }),
      // number of MIDI tracks WITHOUT notes in range
      fc.integer({ min: 0, max: 3 }),
      // number of audio tracks with overlapping clips
      fc.integer({ min: 0, max: 3 }),
      // number of audio tracks without overlapping clips
      fc.integer({ min: 0, max: 3 }),
    ],
    { numRuns: 100 },
  )(
    "MIDI track active iff has note in range; audio track active iff clip overlaps",
    (sectionStart, sectionLength, midiActiveCount, midiInactiveCount, audioActiveCount, audioInactiveCount) => {
      const section = {
        startTime: Math.fround(sectionStart),
        endTime: Math.fround(sectionStart + sectionLength),
      };

      const totalTrackCount = midiActiveCount + midiInactiveCount + audioActiveCount + audioInactiveCount;
      if (totalTrackCount === 0) return; // Skip trivial case with no tracks

      // Generate unique track names
      let trackIdx = 0;
      const trackClips: TrackClipData[] = [];
      const trackNotes: TrackNoteData[] = [];
      const expectedActiveNames = new Set<string>();

      // MIDI tracks WITH notes in range (should be active)
      for (let i = 0; i < midiActiveCount; i++) {
        const name = `MidiActive_${trackIdx++}`;
        expectedActiveNames.add(name);

        // Give them a clip spanning the section (clip presence alone shouldn't matter)
        trackClips.push({
          trackName: name,
          trackType: "midi",
          clips: [{ startTime: section.startTime, endTime: section.endTime, muted: false, hasEnvelopes: false }],
        });

        // At least one note in [section.startTime, section.endTime)
        const noteTime = section.startTime + (section.endTime - section.startTime) * 0.5;
        trackNotes.push({
          trackName: name,
          notes: [{ pitch: 60, startTime: noteTime, duration: 1, velocity: 100 }],
        });
      }

      // MIDI tracks WITHOUT notes in range (should NOT be active)
      for (let i = 0; i < midiInactiveCount; i++) {
        const name = `MidiInactive_${trackIdx++}`;

        // Give them a clip that overlaps (but no notes in range → should still be inactive)
        trackClips.push({
          trackName: name,
          trackType: "midi",
          clips: [{ startTime: section.startTime, endTime: section.endTime, muted: false, hasEnvelopes: false }],
        });

        // Notes all OUTSIDE the section
        const noteBefore = section.startTime - 10;
        const noteAfter = section.endTime + 10;
        trackNotes.push({
          trackName: name,
          notes: noteBefore >= 0
            ? [{ pitch: 60, startTime: noteBefore, duration: 1, velocity: 100 }]
            : [{ pitch: 60, startTime: noteAfter, duration: 1, velocity: 100 }],
        });
      }

      // Audio tracks WITH overlapping clips (should be active)
      for (let i = 0; i < audioActiveCount; i++) {
        const name = `AudioActive_${trackIdx++}`;
        expectedActiveNames.add(name);

        trackClips.push({
          trackName: name,
          trackType: "audio",
          clips: [{ startTime: section.startTime, endTime: section.endTime, muted: false, hasEnvelopes: false }],
        });
      }

      // Audio tracks WITHOUT overlapping clips (should NOT be active)
      for (let i = 0; i < audioInactiveCount; i++) {
        const name = `AudioInactive_${trackIdx++}`;

        // Clip entirely before the section
        trackClips.push({
          trackName: name,
          trackType: "audio",
          clips: section.startTime > 2
            ? [{ startTime: 0, endTime: section.startTime - 1, muted: false, hasEnvelopes: false }]
            : [{ startTime: section.endTime + 10, endTime: section.endTime + 20, muted: false, hasEnvelopes: false }],
        });
      }

      const result = computeNoteBasedTrackActivity(section, trackClips, trackNotes);
      const resultSet = new Set(result);

      // Verify exactly the expected tracks are active
      expect(resultSet.size).toBe(expectedActiveNames.size);
      for (const name of expectedActiveNames) {
        expect(resultSet.has(name)).toBe(true);
      }
      for (const name of resultSet) {
        expect(expectedActiveNames.has(name)).toBe(true);
      }
    },
  );

  test.prop(
    [
      // Generate section
      fc.float({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 4, max: 64, noNaN: true, noDefaultInfinity: true }),
      // Note positions relative to section (could be inside or outside)
      fc.array(
        fc.float({ min: -50, max: 300, noNaN: true, noDefaultInfinity: true }),
        { minLength: 1, maxLength: 10 },
      ),
    ],
    { numRuns: 100 },
  )(
    "MIDI track is active iff at least one note startTime is in [startTime, endTime)",
    (sectionStart, sectionLength, notePositions) => {
      const section = {
        startTime: Math.fround(sectionStart),
        endTime: Math.fround(sectionStart + sectionLength),
      };

      const trackName = "TestMidi";
      const notes: NoteData[] = notePositions.map((pos) => ({
        pitch: 60,
        startTime: Math.fround(pos),
        duration: 1,
        velocity: 100,
      }));

      const trackClips: TrackClipData[] = [{
        trackName,
        trackType: "midi",
        // Wide clip covering everything — shouldn't matter for MIDI activity
        clips: [{ startTime: 0, endTime: 1000, muted: false, hasEnvelopes: false }],
      }];

      const trackNotes: TrackNoteData[] = [{
        trackName,
        notes,
      }];

      const result = computeNoteBasedTrackActivity(section, trackClips, trackNotes);

      // Compute expected: active iff any note's startTime is in [section.startTime, section.endTime)
      const hasNoteInRange = notes.some(
        (n) => n.startTime >= section.startTime && n.startTime < section.endTime,
      );

      if (hasNoteInRange) {
        expect(result).toContain(trackName);
      } else {
        expect(result).not.toContain(trackName);
      }
    },
  );

  test.prop(
    [
      // Generate section
      fc.float({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 4, max: 64, noNaN: true, noDefaultInfinity: true }),
      // Clip start and end offsets relative to section
      fc.float({ min: -100, max: 300, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
      // Whether clip is muted
      fc.boolean(),
    ],
    { numRuns: 100 },
  )(
    "audio track is active iff it has an unmuted clip overlapping the section",
    (sectionStart, sectionLength, clipStart, clipLength, muted) => {
      const section = {
        startTime: Math.fround(sectionStart),
        endTime: Math.fround(sectionStart + sectionLength),
      };

      const clipStartTime = Math.fround(clipStart);
      const clipEndTime = Math.fround(clipStart + clipLength);

      // Skip degenerate cases
      if (clipStartTime >= clipEndTime) return;

      const trackName = "TestAudio";
      const trackClips: TrackClipData[] = [{
        trackName,
        trackType: "audio",
        clips: [{ startTime: clipStartTime, endTime: clipEndTime, muted, hasEnvelopes: false }],
      }];

      const trackNotes: TrackNoteData[] = []; // Audio tracks have no note data

      const result = computeNoteBasedTrackActivity(section, trackClips, trackNotes);

      // Clip overlaps section if clip.startTime < section.endTime AND clip.endTime > section.startTime
      const clipOverlaps = clipStartTime < section.endTime && clipEndTime > section.startTime;
      const shouldBeActive = !muted && clipOverlaps;

      if (shouldBeActive) {
        expect(result).toContain(trackName);
      } else {
        expect(result).not.toContain(trackName);
      }
    },
  );

  test.prop(
    [
      // Generate section
      fc.float({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 4, max: 64, noNaN: true, noDefaultInfinity: true }),
    ],
    { numRuns: 100 },
  )(
    "MIDI track with clip but no notes is never active",
    (sectionStart, sectionLength) => {
      const section = {
        startTime: Math.fround(sectionStart),
        endTime: Math.fround(sectionStart + sectionLength),
      };

      const trackName = "EmptyMidi";
      const trackClips: TrackClipData[] = [{
        trackName,
        trackType: "midi",
        // Clip fully overlaps section
        clips: [{ startTime: section.startTime, endTime: section.endTime, muted: false, hasEnvelopes: false }],
      }];

      // No note data for this track
      const trackNotes: TrackNoteData[] = [{
        trackName,
        notes: [],
      }];

      const result = computeNoteBasedTrackActivity(section, trackClips, trackNotes);

      // MIDI track with zero notes in range should NOT be active
      expect(result).not.toContain(trackName);
    },
  );
});

// ─── Generators (Pitch Range) ──────────────────────────────────────────

/** Generate a NoteData object whose startTime falls within the given [start, end) range. */
function noteInSectionRange(startTime: number, endTime: number): fc.Arbitrary<NoteData> {
  return fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    startTime: fc.double({
      min: startTime,
      max: endTime - 0.01,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    duration: fc.double({ min: 0.25, max: 8, noNaN: true, noDefaultInfinity: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  });
}

/** Generate a NoteData object whose startTime falls outside the given [start, end) range. */
function noteOutsideSectionRange(startTime: number, endTime: number): fc.Arbitrary<NoteData> {
  // Only use "before section" when there's room (startTime > 1)
  // Always safe to use "after section"
  const afterSection = fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    startTime: fc.double({
      min: endTime,
      max: endTime + 50,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    duration: fc.double({ min: 0.25, max: 8, noNaN: true, noDefaultInfinity: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  });

  if (startTime >= 1) {
    const beforeSection = fc.record({
      pitch: fc.integer({ min: 0, max: 127 }),
      startTime: fc.double({
        min: 0,
        max: startTime - 0.01,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      duration: fc.double({ min: 0.25, max: 8, noNaN: true, noDefaultInfinity: true }),
      velocity: fc.integer({ min: 1, max: 127 }),
    });
    return fc.oneof(beforeSection, afterSection);
  }

  return afterSection;
}

// ─── Property 19: Pitch range formula ──────────────────────────────────

// Feature: automation-awareness, Property 19: Pitch range formula
describe("Property 19: Pitch range formula", () => {
  /**
   * **Validates: Requirements 17.1, 17.2**
   *
   * For any section, computePitchRange SHALL return (maxPitch - minPitch) / 127
   * where maxPitch and minPitch are the highest and lowest MIDI pitches among
   * all notes in the section. When fewer than 2 unique pitches exist, it SHALL
   * return 0. The result is always in [0, 1].
   */

  test.prop(
    [
      sectionArbitrary.chain((section) =>
        fc.tuple(
          fc.constant(section),
          fc.array(noteInSectionRange(section.startTime, section.endTime), { minLength: 2, maxLength: 20 }),
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "result matches (max - min) / 127 formula for notes within the section",
    ([section, notes]) => {
      const trackNotes: TrackNoteData[] = [{ trackName: "Track 1", notes }];

      const result = computePitchRange(section, trackNotes);

      // Independently compute expected
      const pitchesInSection = notes
        .filter((n) => n.startTime >= section.startTime && n.startTime < section.endTime)
        .map((n) => n.pitch);

      const uniquePitches = new Set(pitchesInSection);

      let expected: number;
      if (uniquePitches.size < 2) {
        expected = 0;
      } else {
        const minPitch = Math.min(...uniquePitches);
        const maxPitch = Math.max(...uniquePitches);
        expected = (maxPitch - minPitch) / 127;
      }

      expect(result).toBeCloseTo(expected, 10);
    },
  );

  test.prop(
    [
      // Generate a section with notes that all have the SAME pitch (fewer than 2 unique)
      sectionArbitrary,
      fc.integer({ min: 0, max: 127 }),
      fc.integer({ min: 1, max: 10 }),
    ],
    { numRuns: 100 },
  )(
    "returns 0 when all notes have the same pitch (fewer than 2 unique)",
    (section, singlePitch, noteCount) => {
      const notes: NoteData[] = Array.from({ length: noteCount }, (_, i) => ({
        pitch: singlePitch,
        startTime: section.startTime + (i * 0.5),
        duration: 1,
        velocity: 80,
      })).filter((n) => n.startTime < section.endTime);

      // Ensure at least one note remains after filtering
      if (notes.length === 0) return;

      const trackNotes: TrackNoteData[] = [{ trackName: "Track 1", notes }];
      const result = computePitchRange(section, trackNotes);

      expect(result).toBe(0);
    },
  );

  test.prop(
    [
      // Generate a section with NO notes in range (all outside)
      sectionArbitrary.chain((section) =>
        fc.tuple(
          fc.constant(section),
          fc.array(noteOutsideSectionRange(section.startTime, section.endTime), { minLength: 1, maxLength: 10 }),
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "returns 0 when no notes fall within the section time range",
    ([section, notes]) => {
      const trackNotes: TrackNoteData[] = [{ trackName: "Track 1", notes }];
      const result = computePitchRange(section, trackNotes);

      expect(result).toBe(0);
    },
  );

  test.prop(
    [
      // Generate a section and notes across multiple tracks
      sectionArbitrary.chain((section) =>
        fc.tuple(
          fc.constant(section),
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.array(noteInSectionRange(section.startTime, section.endTime), { minLength: 1, maxLength: 10 }),
            ),
            { minLength: 1, maxLength: 4 },
          ),
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "aggregates pitches across multiple tracks correctly",
    ([section, tracks]) => {
      const trackNotes: TrackNoteData[] = tracks.map(([name, notes]) => ({
        trackName: name,
        notes,
      }));

      const result = computePitchRange(section, trackNotes);

      // Independently compute expected across all tracks
      const allPitches: number[] = [];
      for (const track of trackNotes) {
        for (const note of track.notes) {
          if (note.startTime >= section.startTime && note.startTime < section.endTime) {
            allPitches.push(note.pitch);
          }
        }
      }

      const uniquePitches = new Set(allPitches);

      let expected: number;
      if (uniquePitches.size < 2) {
        expected = 0;
      } else {
        const minPitch = Math.min(...uniquePitches);
        const maxPitch = Math.max(...uniquePitches);
        expected = (maxPitch - minPitch) / 127;
      }

      expect(result).toBeCloseTo(expected, 10);
    },
  );

  test.prop(
    [
      // Generate any valid section and random note arrays (mix of inside/outside)
      sectionArbitrary.chain((section) =>
        fc.tuple(
          fc.constant(section),
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.array(
                fc.oneof(
                  noteInSectionRange(section.startTime, section.endTime),
                  noteOutsideSectionRange(section.startTime, section.endTime),
                ),
                { minLength: 0, maxLength: 15 },
              ),
            ),
            { minLength: 0, maxLength: 4 },
          ),
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "result is always in [0, 1]",
    ([section, tracks]) => {
      const trackNotes: TrackNoteData[] = tracks.map(([name, notes]) => ({
        trackName: name,
        notes,
      }));

      const result = computePitchRange(section, trackNotes);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    },
  );
});
