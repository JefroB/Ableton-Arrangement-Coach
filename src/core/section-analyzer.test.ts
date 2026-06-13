/**
 * Unit tests for Section Analyzer.
 *
 * Tests specific examples and edge cases for:
 * - computeTrackActivity
 * - computeMidiDensity
 * - computeAutomationFlag
 * - analyzeSection
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 5.4, 6.1, 6.2
 */
import { describe, it, expect } from "vitest";
import {
  computeTrackActivity,
  computeMidiDensity,
  computeAutomationFlag,
  computeVelocityIntensity,
  computePolyphonyScore,
  computePitchRange,
  analyzeSection,
  type TrackClipData,
  type TrackNoteData,
} from "./section-analyzer.js";

// ─── computeTrackActivity ──────────────────────────────────────────────

describe("computeTrackActivity", () => {
  it("returns both track names when two tracks have clips overlapping the section", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 8, endTime: 24, muted: false, hasEnvelopes: false }],
      },
    ];

    const result = computeTrackActivity(section, trackClips);
    expect(result).toContain("Drums");
    expect(result).toContain("Bass");
    expect(result).toHaveLength(2);
  });

  it("excludes tracks with only muted clips", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 8, endTime: 24, muted: true, hasEnvelopes: false }],
      },
    ];

    const result = computeTrackActivity(section, trackClips);
    expect(result).toEqual(["Drums"]);
  });

  it("returns track name only once even with multiple overlapping clips", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [
          { startTime: 0, endTime: 8, muted: false, hasEnvelopes: false },
          { startTime: 8, endTime: 16, muted: false, hasEnvelopes: false },
          { startTime: 16, endTime: 24, muted: false, hasEnvelopes: false },
        ],
      },
    ];

    const result = computeTrackActivity(section, trackClips);
    expect(result).toEqual(["Drums"]);
  });

  it("returns empty array when no clips overlap the section", () => {
    const section = { startTime: 32, endTime: 64 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 64, endTime: 96, muted: false, hasEnvelopes: false }],
      },
    ];

    const result = computeTrackActivity(section, trackClips);
    expect(result).toEqual([]);
  });

  it("returns empty array when no tracks are provided", () => {
    const section = { startTime: 0, endTime: 32 };
    const result = computeTrackActivity(section, []);
    expect(result).toEqual([]);
  });

  it("returns empty array when all clips are muted", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: true, hasEnvelopes: false }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 8, endTime: 24, muted: true, hasEnvelopes: false }],
      },
    ];

    const result = computeTrackActivity(section, trackClips);
    expect(result).toEqual([]);
  });

  it("handles section with endTime = Infinity (all clips after startTime overlap)", () => {
    const section = { startTime: 64, endTime: Infinity };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Early",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Overlapping",
        trackType: "midi",
        clips: [{ startTime: 60, endTime: 80, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "After",
        trackType: "audio",
        clips: [{ startTime: 100, endTime: 132, muted: false, hasEnvelopes: false }],
      },
    ];

    const result = computeTrackActivity(section, trackClips);
    // "Early" clip ends at 32, which is not > 64, so it doesn't overlap
    // "Overlapping" clip ends at 80 > 64 and starts at 60 < Infinity → overlaps
    // "After" clip ends at 132 > 64 and starts at 100 < Infinity → overlaps
    expect(result).toContain("Overlapping");
    expect(result).toContain("After");
    expect(result).not.toContain("Early");
    expect(result).toHaveLength(2);
  });

  it("excludes clips that touch but don't overlap (clip.endTime == section.startTime)", () => {
    const section = { startTime: 32, endTime: 64 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Before",
        trackType: "midi",
        clips: [{ startTime: 16, endTime: 32, muted: false, hasEnvelopes: false }],
      },
    ];

    // clip.endTime (32) is NOT > section.startTime (32) → no overlap
    const result = computeTrackActivity(section, trackClips);
    expect(result).toEqual([]);
  });

  it("excludes clips that start at section.endTime (clip.startTime == section.endTime)", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "After",
        trackType: "midi",
        clips: [{ startTime: 32, endTime: 64, muted: false, hasEnvelopes: false }],
      },
    ];

    // clip.startTime (32) is NOT < section.endTime (32) → no overlap
    const result = computeTrackActivity(section, trackClips);
    expect(result).toEqual([]);
  });
});

// ─── computeMidiDensity ────────────────────────────────────────────────

describe("computeMidiDensity", () => {
  it("computes density correctly: 10 notes in 2 bars (8 beats) → 5.0", () => {
    const section = { startTime: 0, endTime: 8 }; // 8 beats = 2 bars
    const notes = Array.from({ length: 10 }, (_, i) => ({
      pitch: 60,
      startTime: i * 0.8, // spread across the section
      duration: 0.5,
      velocity: 100,
    }));
    const trackNotes: TrackNoteData[] = [{ trackName: "Piano", notes }];

    const result = computeMidiDensity(section, trackNotes);
    expect(result).toBe(5.0);
  });

  it("returns 0 when no notes fall within the section", () => {
    const section = { startTime: 32, endTime: 64 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 62, startTime: 4, duration: 1, velocity: 100 },
        ],
      },
    ];

    const result = computeMidiDensity(section, trackNotes);
    expect(result).toBe(0);
  });

  it("returns 0 for zero-length section", () => {
    const section = { startTime: 16, endTime: 16 }; // zero length
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [{ pitch: 60, startTime: 16, duration: 1, velocity: 100 }],
      },
    ];

    const result = computeMidiDensity(section, trackNotes);
    expect(result).toBe(0);
  });

  it("excludes notes at section.endTime (startTime exclusive at endTime)", () => {
    const section = { startTime: 0, endTime: 4 }; // 1 bar
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 }, // included
          { pitch: 62, startTime: 2, duration: 1, velocity: 100 }, // included
          { pitch: 64, startTime: 4, duration: 1, velocity: 100 }, // excluded (at endTime)
        ],
      },
    ];

    const result = computeMidiDensity(section, trackNotes);
    // 2 notes / 1 bar = 2.0
    expect(result).toBe(2.0);
  });

  it("includes notes at section.startTime (startTime inclusive)", () => {
    const section = { startTime: 8, endTime: 16 }; // 2 bars
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Synth",
        notes: [
          { pitch: 60, startTime: 8, duration: 1, velocity: 100 }, // included (at startTime)
          { pitch: 62, startTime: 12, duration: 1, velocity: 100 }, // included
        ],
      },
    ];

    const result = computeMidiDensity(section, trackNotes);
    // 2 notes / 2 bars = 1.0
    expect(result).toBe(1.0);
  });

  it("aggregates notes across multiple tracks", () => {
    const section = { startTime: 0, endTime: 4 }; // 1 bar
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 100 }],
      },
      {
        trackName: "Synth",
        notes: [
          { pitch: 72, startTime: 1, duration: 1, velocity: 100 },
          { pitch: 74, startTime: 2, duration: 1, velocity: 100 },
        ],
      },
    ];

    const result = computeMidiDensity(section, trackNotes);
    // 3 notes / 1 bar = 3.0
    expect(result).toBe(3.0);
  });

  it("returns 0 when no tracks are provided", () => {
    const section = { startTime: 0, endTime: 32 };
    const result = computeMidiDensity(section, []);
    expect(result).toBe(0);
  });

  it("handles section with endTime = Infinity", () => {
    const section = { startTime: 64, endTime: Infinity };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [
          { pitch: 60, startTime: 32, duration: 1, velocity: 100 }, // before section
          { pitch: 62, startTime: 64, duration: 1, velocity: 100 }, // at startTime (included)
          { pitch: 64, startTime: 100, duration: 1, velocity: 100 }, // in section
        ],
      },
    ];

    // sectionLength = Infinity, sectionLengthInBars = Infinity
    // 2 notes / Infinity = 0
    const result = computeMidiDensity(section, trackNotes);
    expect(result).toBe(0);
  });
});

// ─── computeAutomationFlag ─────────────────────────────────────────────

describe("computeAutomationFlag", () => {
  it("returns true when an unmuted overlapping clip has hasEnvelopes=true", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Synth",
        trackType: "midi",
        clips: [{ startTime: 8, endTime: 24, muted: false, hasEnvelopes: true }],
      },
    ];

    expect(computeAutomationFlag(section, trackClips)).toBe(true);
  });

  it("returns false when all clips are muted even if they have envelopes", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Synth",
        trackType: "midi",
        clips: [{ startTime: 8, endTime: 24, muted: true, hasEnvelopes: true }],
      },
      {
        trackName: "Lead",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: true, hasEnvelopes: true }],
      },
    ];

    expect(computeAutomationFlag(section, trackClips)).toBe(false);
  });

  it("returns false when clips with envelopes don't overlap the section", () => {
    const section = { startTime: 32, endTime: 64 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Synth",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: true }],
      },
    ];

    expect(computeAutomationFlag(section, trackClips)).toBe(false);
  });

  it("returns false when no clips exist", () => {
    const section = { startTime: 0, endTime: 32 };
    expect(computeAutomationFlag(section, [])).toBe(false);
  });

  it("returns false when overlapping unmuted clips have hasEnvelopes=false", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 8, endTime: 24, muted: false, hasEnvelopes: false }],
      },
    ];

    expect(computeAutomationFlag(section, trackClips)).toBe(false);
  });

  it("returns true when only one of many clips has envelopes", () => {
    const section = { startTime: 0, endTime: 32 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 8, endTime: 24, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Synth",
        trackType: "midi",
        clips: [{ startTime: 16, endTime: 28, muted: false, hasEnvelopes: true }],
      },
    ];

    expect(computeAutomationFlag(section, trackClips)).toBe(true);
  });

  it("handles section with endTime = Infinity", () => {
    const section = { startTime: 64, endTime: Infinity };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Synth",
        trackType: "midi",
        clips: [{ startTime: 80, endTime: 96, muted: false, hasEnvelopes: true }],
      },
    ];

    expect(computeAutomationFlag(section, trackClips)).toBe(true);
  });
});

// ─── analyzeSection ────────────────────────────────────────────────────

describe("analyzeSection", () => {
  it("combines all three metrics correctly", () => {
    const section = { startTime: 0, endTime: 8 }; // 2 bars
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 8, muted: false, hasEnvelopes: false }],
      },
      {
        trackName: "Synth",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 8, muted: false, hasEnvelopes: true }],
      },
      {
        trackName: "Bass",
        trackType: "audio",
        clips: [{ startTime: 0, endTime: 8, muted: true, hasEnvelopes: true }],
      },
    ];
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Drums",
        notes: [
          { pitch: 36, startTime: 0, duration: 0.5, velocity: 100 },
          { pitch: 36, startTime: 2, duration: 0.5, velocity: 100 },
          { pitch: 36, startTime: 4, duration: 0.5, velocity: 100 },
          { pitch: 36, startTime: 6, duration: 0.5, velocity: 100 },
        ],
      },
      {
        trackName: "Synth",
        notes: [
          { pitch: 60, startTime: 0, duration: 4, velocity: 80 },
          { pitch: 64, startTime: 4, duration: 4, velocity: 80 },
        ],
      },
    ];

    const result = analyzeSection(section, trackClips, trackNotes);

    // Track activity: Drums and Synth active (Bass is muted)
    expect(result.activeTrackNames).toContain("Drums");
    expect(result.activeTrackNames).toContain("Synth");
    expect(result.activeTrackNames).not.toContain("Bass");
    expect(result.activeTrackNames).toHaveLength(2);

    // MIDI density: 6 notes / 2 bars = 3.0
    expect(result.midiDensity).toBe(3.0);

    // Automation: Synth has envelopes and is unmuted+overlapping → true
    expect(result.hasAutomation).toBe(true);
  });

  it("returns empty activity, zero density, and false automation for empty data", () => {
    const section = { startTime: 0, endTime: 32 };
    const result = analyzeSection(section, [], []);

    expect(result.activeTrackNames).toEqual([]);
    expect(result.midiDensity).toBe(0);
    expect(result.hasAutomation).toBe(false);
  });

  it("handles zero-length section correctly", () => {
    const section = { startTime: 16, endTime: 16 };
    const trackClips: TrackClipData[] = [
      {
        trackName: "Drums",
        trackType: "midi",
        clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: true }],
      },
    ];
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Drums",
        notes: [{ pitch: 36, startTime: 16, duration: 0.5, velocity: 100 }],
      },
    ];

    const result = analyzeSection(section, trackClips, trackNotes);

    // Zero-length section: clip.startTime (0) < endTime (16) AND clip.endTime (32) > startTime (16) → overlaps
    // But for overlap: clip.startTime < section.endTime (16) AND clip.endTime > section.startTime (16)
    // 0 < 16 ✓ AND 32 > 16 ✓ → overlaps
    expect(result.activeTrackNames).toEqual(["Drums"]);
    expect(result.midiDensity).toBe(0); // zero-length → 0
    expect(result.hasAutomation).toBe(true); // clip overlaps and has envelopes
  });
});

// ─── computeVelocityIntensity ──────────────────────────────────────────

describe("computeVelocityIntensity", () => {
  it("computes mean velocity / 127 for known note set [64, 127, 100]", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Synth",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 64 },
          { pitch: 62, startTime: 2, duration: 1, velocity: 127 },
          { pitch: 64, startTime: 4, duration: 1, velocity: 100 },
        ],
      },
    ];

    const result = computeVelocityIntensity(section, trackNotes);
    // mean = (64 + 127 + 100) / 3 = 97, 97 / 127 ≈ 0.7638
    expect(result).toBeCloseTo(97 / 127, 4);
  });

  it("returns 0 for empty section (no notes in range)", () => {
    const section = { startTime: 100, endTime: 200 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 62, startTime: 4, duration: 1, velocity: 80 },
        ],
      },
    ];

    const result = computeVelocityIntensity(section, trackNotes);
    expect(result).toBe(0);
  });

  it("returns 0 when track notes array is empty", () => {
    const section = { startTime: 0, endTime: 32 };
    const result = computeVelocityIntensity(section, []);
    expect(result).toBe(0);
  });

  it("returns 0 when all notes are outside section range", () => {
    const section = { startTime: 10, endTime: 20 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Lead",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 62, startTime: 5, duration: 1, velocity: 90 },
          { pitch: 64, startTime: 20, duration: 1, velocity: 110 }, // at endTime, excluded
        ],
      },
    ];

    const result = computeVelocityIntensity(section, trackNotes);
    expect(result).toBe(0);
  });

  it("returns 1.0 when all notes have velocity 127", () => {
    const section = { startTime: 0, endTime: 4 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Drums",
        notes: [
          { pitch: 36, startTime: 0, duration: 0.5, velocity: 127 },
          { pitch: 38, startTime: 1, duration: 0.5, velocity: 127 },
          { pitch: 42, startTime: 2, duration: 0.5, velocity: 127 },
        ],
      },
    ];

    const result = computeVelocityIntensity(section, trackNotes);
    expect(result).toBeCloseTo(1.0, 10);
  });

  it("aggregates velocities across multiple tracks", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 60 }],
      },
      {
        trackName: "Synth",
        notes: [{ pitch: 72, startTime: 2, duration: 1, velocity: 100 }],
      },
    ];

    const result = computeVelocityIntensity(section, trackNotes);
    // mean = (60 + 100) / 2 = 80, 80 / 127 ≈ 0.6299
    expect(result).toBeCloseTo(80 / 127, 4);
  });
});

// ─── computePolyphonyScore ─────────────────────────────────────────────

describe("computePolyphonyScore", () => {
  it("returns ~1.0 for a single monophonic line (no overlap)", () => {
    const section = { startTime: 0, endTime: 4 }; // 4 beats = 4 slots
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Lead",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 62, startTime: 1, duration: 1, velocity: 100 },
          { pitch: 64, startTime: 2, duration: 1, velocity: 100 },
          { pitch: 65, startTime: 3, duration: 1, velocity: 100 },
        ],
      },
    ];

    const result = computePolyphonyScore(section, trackNotes);
    // Each beat has exactly 1 note sounding → average = 1.0
    expect(result).toBeCloseTo(1.0, 4);
  });

  it("returns score > monophonic for dense chords (4 simultaneous notes per beat)", () => {
    const section = { startTime: 0, endTime: 4 }; // 4 beats = 4 slots
    // Monophonic: 1 note per beat
    const monoNotes: TrackNoteData[] = [
      {
        trackName: "Lead",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 62, startTime: 1, duration: 1, velocity: 100 },
          { pitch: 64, startTime: 2, duration: 1, velocity: 100 },
          { pitch: 65, startTime: 3, duration: 1, velocity: 100 },
        ],
      },
    ];

    // Chords: 4 notes per beat
    const chordNotes: TrackNoteData[] = [
      {
        trackName: "Chords",
        notes: [
          // Beat 0: 4 simultaneous notes
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 64, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 67, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 72, startTime: 0, duration: 1, velocity: 100 },
          // Beat 1: 4 simultaneous notes
          { pitch: 62, startTime: 1, duration: 1, velocity: 100 },
          { pitch: 65, startTime: 1, duration: 1, velocity: 100 },
          { pitch: 69, startTime: 1, duration: 1, velocity: 100 },
          { pitch: 74, startTime: 1, duration: 1, velocity: 100 },
          // Beat 2: 4 simultaneous notes
          { pitch: 64, startTime: 2, duration: 1, velocity: 100 },
          { pitch: 67, startTime: 2, duration: 1, velocity: 100 },
          { pitch: 71, startTime: 2, duration: 1, velocity: 100 },
          { pitch: 76, startTime: 2, duration: 1, velocity: 100 },
          // Beat 3: 4 simultaneous notes
          { pitch: 65, startTime: 3, duration: 1, velocity: 100 },
          { pitch: 69, startTime: 3, duration: 1, velocity: 100 },
          { pitch: 72, startTime: 3, duration: 1, velocity: 100 },
          { pitch: 77, startTime: 3, duration: 1, velocity: 100 },
        ],
      },
    ];

    const monoScore = computePolyphonyScore(section, monoNotes);
    const chordScore = computePolyphonyScore(section, chordNotes);

    expect(chordScore).toBeGreaterThan(monoScore);
    // Chord score should be ~4.0 (4 notes per slot)
    expect(chordScore).toBeCloseTo(4.0, 4);
  });

  it("returns 0 for empty notes", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      { trackName: "Empty", notes: [] },
    ];

    const result = computePolyphonyScore(section, trackNotes);
    expect(result).toBe(0);
  });

  it("returns 0 for zero-length section", () => {
    const section = { startTime: 4, endTime: 4 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Lead",
        notes: [{ pitch: 60, startTime: 4, duration: 1, velocity: 100 }],
      },
    ];

    const result = computePolyphonyScore(section, trackNotes);
    expect(result).toBe(0);
  });

  it("accounts for notes sustaining across multiple beats", () => {
    const section = { startTime: 0, endTime: 4 }; // 4 slots
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Pad",
        notes: [
          // One long note spanning all 4 beats
          { pitch: 60, startTime: 0, duration: 4, velocity: 80 },
          // Short note in beat 2 only
          { pitch: 72, startTime: 2, duration: 0.5, velocity: 100 },
        ],
      },
    ];

    const result = computePolyphonyScore(section, trackNotes);
    // Beat 0: 1 note (long pad), Beat 1: 1 note (long pad), Beat 2: 2 notes (pad + short), Beat 3: 1 note (long pad)
    // Average = (1 + 1 + 2 + 1) / 4 = 1.25
    expect(result).toBeCloseTo(1.25, 4);
  });
});

// ─── computePitchRange ─────────────────────────────────────────────────

describe("computePitchRange", () => {
  it("computes correct range for full octave spread C2 (36) to C4 (60)", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Bass",
        notes: [
          { pitch: 36, startTime: 0, duration: 1, velocity: 100 }, // C2
          { pitch: 48, startTime: 2, duration: 1, velocity: 100 }, // C3
          { pitch: 60, startTime: 4, duration: 1, velocity: 100 }, // C4
        ],
      },
    ];

    const result = computePitchRange(section, trackNotes);
    // (60 - 36) / 127 = 24 / 127 ≈ 0.189
    expect(result).toBeCloseTo(24 / 127, 4);
  });

  it("returns 0 with single pitch (all notes same pitch)", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Kick",
        notes: [
          { pitch: 36, startTime: 0, duration: 0.5, velocity: 127 },
          { pitch: 36, startTime: 2, duration: 0.5, velocity: 127 },
          { pitch: 36, startTime: 4, duration: 0.5, velocity: 127 },
          { pitch: 36, startTime: 6, duration: 0.5, velocity: 127 },
        ],
      },
    ];

    const result = computePitchRange(section, trackNotes);
    expect(result).toBe(0);
  });

  it("returns 1.0 for full MIDI range (0 to 127)", () => {
    const section = { startTime: 0, endTime: 4 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Full",
        notes: [
          { pitch: 0, startTime: 0, duration: 1, velocity: 64 },
          { pitch: 127, startTime: 2, duration: 1, velocity: 64 },
        ],
      },
    ];

    const result = computePitchRange(section, trackNotes);
    // (127 - 0) / 127 = 1.0
    expect(result).toBeCloseTo(1.0, 10);
  });

  it("returns 0 when no notes exist in section", () => {
    const section = { startTime: 100, endTime: 200 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Piano",
        notes: [
          { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
          { pitch: 72, startTime: 4, duration: 1, velocity: 100 },
        ],
      },
    ];

    const result = computePitchRange(section, trackNotes);
    expect(result).toBe(0);
  });

  it("returns 0 when track notes array is empty", () => {
    const section = { startTime: 0, endTime: 32 };
    const result = computePitchRange(section, []);
    expect(result).toBe(0);
  });

  it("aggregates pitches across multiple tracks", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Bass",
        notes: [{ pitch: 36, startTime: 0, duration: 2, velocity: 100 }],
      },
      {
        trackName: "Lead",
        notes: [{ pitch: 84, startTime: 2, duration: 2, velocity: 100 }],
      },
    ];

    const result = computePitchRange(section, trackNotes);
    // (84 - 36) / 127 = 48 / 127 ≈ 0.378
    expect(result).toBeCloseTo(48 / 127, 4);
  });
});

// ─── Note-based activity detection edge cases ──────────────────────────

describe("note-based activity detection edge cases", () => {
  it("MIDI track is active when it has at least one note with startTime in section range", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Lead",
        notes: [{ pitch: 60, startTime: 4, duration: 2, velocity: 100 }],
      },
    ];

    // computeVelocityIntensity > 0 means notes exist in range (confirms activity)
    const intensity = computeVelocityIntensity(section, trackNotes);
    expect(intensity).toBeGreaterThan(0);
  });

  it("MIDI track is NOT active when all notes have startTime outside section", () => {
    const section = { startTime: 10, endTime: 20 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Lead",
        notes: [
          { pitch: 60, startTime: 0, duration: 5, velocity: 100 },   // before section
          { pitch: 62, startTime: 20, duration: 1, velocity: 100 },  // at endTime (excluded)
        ],
      },
    ];

    // No notes with startTime in [10, 20) → velocity intensity = 0
    const intensity = computeVelocityIntensity(section, trackNotes);
    expect(intensity).toBe(0);
  });

  it("note at section.startTime is included (inclusive start)", () => {
    const section = { startTime: 8, endTime: 16 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Bass",
        notes: [{ pitch: 36, startTime: 8, duration: 2, velocity: 80 }],
      },
    ];

    const intensity = computeVelocityIntensity(section, trackNotes);
    expect(intensity).toBeCloseTo(80 / 127, 4);
  });

  it("note at section.endTime is excluded (exclusive end)", () => {
    const section = { startTime: 0, endTime: 8 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Synth",
        notes: [{ pitch: 72, startTime: 8, duration: 1, velocity: 100 }],
      },
    ];

    const intensity = computeVelocityIntensity(section, trackNotes);
    expect(intensity).toBe(0);
  });

  it("activity detection works with notes from multiple tracks", () => {
    const section = { startTime: 0, endTime: 4 };
    const trackNotes: TrackNoteData[] = [
      {
        trackName: "Drums",
        notes: [{ pitch: 36, startTime: 0, duration: 0.5, velocity: 127 }],
      },
      {
        trackName: "Bass",
        notes: [{ pitch: 40, startTime: 2, duration: 1, velocity: 90 }],
      },
      {
        trackName: "Inactive",
        notes: [{ pitch: 60, startTime: 10, duration: 1, velocity: 100 }], // outside range
      },
    ];

    // Polyphony, velocity, and pitch range should only reflect active notes
    const intensity = computeVelocityIntensity(section, trackNotes);
    // mean of [127, 90] = 108.5, / 127 ≈ 0.8543
    expect(intensity).toBeCloseTo(108.5 / 127, 4);

    const pitchRange = computePitchRange(section, trackNotes);
    // pitches in section: 36, 40 → (40 - 36) / 127 ≈ 0.0315
    expect(pitchRange).toBeCloseTo(4 / 127, 4);
  });
});

// ─── Property-Based Tests ──────────────────────────────────────────────

import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import type { NoteData } from "../ableton/sdk-adapter.js";

// Feature: m2-section-analysis, Property 2: MIDI density formula

/**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 *
 * Property 2: MIDI density formula
 * For any section with positive length and any set of NoteData, verify density
 * equals count of notes in range divided by section length in bars; verify
 * zero-length sections return 0.
 */
describe("Section Analyzer — Property 2: MIDI density formula", () => {
  // Generator: a note with valid ranges
  const noteArb: fc.Arbitrary<NoteData> = fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    startTime: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    duration: fc.double({ min: 0.01, max: 64, noNaN: true, noDefaultInfinity: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  });

  // Generator: a TrackNoteData with random track name and notes
  const trackNoteDataArb: fc.Arbitrary<TrackNoteData> = fc.record({
    trackName: fc.string({ minLength: 1, maxLength: 20 }),
    notes: fc.array(noteArb, { minLength: 0, maxLength: 30 }),
  });

  // Generator: array of TrackNoteData
  const trackNotesArb = fc.array(trackNoteDataArb, { minLength: 0, maxLength: 5 });

  // Generator: a section with positive length (startTime < endTime)
  const positiveSectionArb = fc
    .tuple(
      fc.double({ min: 0, max: 900, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
    )
    .map(([start, length]) => ({
      startTime: start,
      endTime: start + length,
    }));

  // Generator: a zero-length section (startTime == endTime)
  const zeroLengthSectionArb = fc
    .double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true })
    .map((t) => ({ startTime: t, endTime: t }));

  fcTest.prop(
    [positiveSectionArb, trackNotesArb],
    { numRuns: 100 },
  )(
    "density equals count of notes in range divided by section length in bars",
    (section, trackNotes) => {
      const result = computeMidiDensity(section, trackNotes);

      // Manually compute expected density using the formula from the design doc
      const sectionLength = section.endTime - section.startTime;
      const sectionLengthInBars = sectionLength / 4;

      let noteCount = 0;
      for (const track of trackNotes) {
        for (const note of track.notes) {
          if (note.startTime >= section.startTime && note.startTime < section.endTime) {
            noteCount++;
          }
        }
      }

      const expectedDensity = noteCount / sectionLengthInBars;

      expect(result).toBeCloseTo(expectedDensity, 10);
    },
  );

  fcTest.prop(
    [zeroLengthSectionArb, trackNotesArb],
    { numRuns: 100 },
  )(
    "zero-length sections return density of 0",
    (section, trackNotes) => {
      const result = computeMidiDensity(section, trackNotes);
      expect(result).toBe(0);
    },
  );
});

// Feature: m2-section-analysis, Property 1: Track activity correctness

/**
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.6**
 *
 * Property 1: Track activity correctness
 * For any section time range and any set of TrackClipData with varying start
 * times, end times, and mute states, verify the result contains exactly those
 * track names with at least one unmuted overlapping clip, with no duplicates.
 */
describe("Section Analyzer — Property 1: Track activity correctness", () => {
  // Generator: a section with positive length (endTime > startTime)
  const sectionArb = fc
    .tuple(
      fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    )
    .map(([a, b]) => ({
      startTime: Math.min(a, b),
      endTime: Math.max(a, b) + 0.001, // ensure endTime > startTime
    }));

  // Generator: a single ClipData with valid time range (endTime > startTime)
  const clipArb = fc
    .tuple(
      fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.boolean(),
    )
    .map(([a, b, muted, hasEnvelopes]) => ({
      startTime: Math.min(a, b),
      endTime: Math.max(a, b) + 0.001, // ensure endTime > startTime for valid clip
      muted,
      hasEnvelopes,
    }));

  // Generator: a TrackClipData with 0–5 clips
  const trackClipDataArb: fc.Arbitrary<TrackClipData> = fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.constantFrom("midi" as const, "audio" as const),
      fc.array(clipArb, { minLength: 0, maxLength: 5 }),
    )
    .map(([trackName, trackType, clips]) => ({
      trackName,
      trackType,
      clips,
    }));

  // Generator: array of TrackClipData (0–8 tracks)
  const trackClipsArb = fc.array(trackClipDataArb, { minLength: 0, maxLength: 8 });

  // Reference implementation: compute expected active track names
  function referenceTrackActivity(
    section: { startTime: number; endTime: number },
    trackClips: readonly TrackClipData[],
  ): string[] {
    const result = new Set<string>();
    for (const track of trackClips) {
      for (const clip of track.clips) {
        const overlaps =
          clip.startTime < section.endTime && clip.endTime > section.startTime;
        if (!clip.muted && overlaps) {
          result.add(track.trackName);
          break;
        }
      }
    }
    return [...result];
  }

  fcTest.prop(
    [sectionArb, trackClipsArb],
    { numRuns: 100 },
  )(
    "contains exactly the track names with at least one unmuted overlapping clip, no duplicates",
    (section, trackClips) => {
      const actual = computeTrackActivity(section, trackClips);
      const expected = referenceTrackActivity(section, trackClips);

      // Same set of track names (order-independent)
      expect([...actual].sort()).toEqual([...expected].sort());

      // No duplicates in actual result
      const uniqueActual = new Set(actual);
      expect(uniqueActual.size).toBe(actual.length);
    },
  );
});
