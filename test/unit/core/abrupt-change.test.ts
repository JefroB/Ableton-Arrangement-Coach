/**
 * Unit tests for the abrupt change detection sub-detector.
 *
 * Feature: m3-issue-detection
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
import { describe, it, expect } from "vitest";
import { _detectAbruptChanges, _hasBuildupContext } from "../../../src/core/issue-detector.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { TrackClipData, TrackNoteData } from "../../../src/core/section-analyzer.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeSection(index: number, start: number, end: number, name?: string): Section {
  return {
    id: `section-${index}`,
    name: name ?? `Section ${index}`,
    startTime: start,
    endTime: end,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("detectAbruptChanges", () => {
  describe("skip conditions", () => {
    it("returns empty array when sections array is empty", () => {
      const result = _detectAbruptChanges([], [], [], [], null, 5);
      expect(result).toEqual([]);
    });

    it("returns empty array when only 1 section exists", () => {
      const sections = [makeSection(0, 0, 32)];
      const result = _detectAbruptChanges(sections, [5], [], [], null, 5);
      expect(result).toEqual([]);
    });

    it("skips pair when energy curve has insufficient data", () => {
      const sections = [makeSection(0, 0, 32), makeSection(1, 32, 64)];
      // Energy curve only has 1 entry (too short for pair at index 1)
      const result = _detectAbruptChanges(sections, [3], [], [], null, 5);
      expect(result).toEqual([]);
    });
  });

  describe("delta threshold", () => {
    it("does not report issue when delta is below threshold", () => {
      const sections = [makeSection(0, 0, 32), makeSection(1, 32, 64)];
      // Delta = |7 - 3| = 4, below threshold of 5
      const result = _detectAbruptChanges(sections, [3, 7], [], [], null, 5);
      expect(result).toEqual([]);
    });

    it("reports issue when delta equals threshold (>= 5)", () => {
      const sections = [makeSection(0, 0, 32, "Intro"), makeSection(1, 32, 64, "Verse")];
      // Delta = |8 - 3| = 5, exactly at threshold
      const result = _detectAbruptChanges(sections, [3, 8], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("abrupt-change");
    });

    it("reports issue when delta exceeds threshold", () => {
      const sections = [makeSection(0, 0, 32, "Intro"), makeSection(1, 32, 64, "Verse")];
      // Delta = |10 - 2| = 8, above threshold of 5
      const result = _detectAbruptChanges(sections, [2, 10], [], [], null, 5);
      expect(result).toHaveLength(1);
    });

    it("detects falling energy as abrupt change too", () => {
      const sections = [makeSection(0, 0, 32, "Drop"), makeSection(1, 32, 64, "Breakdown")];
      // Delta = |2 - 9| = 7, energy falling
      const result = _detectAbruptChanges(sections, [9, 2], [], [], null, 5);
      expect(result).toHaveLength(1);
    });
  });

  describe("drop suppression", () => {
    it("suppresses issue for energy rise into 'Drop' section in Techno", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Drop")];
      // Energy rises from 3 to 9 (delta=6)
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "techno", 5);
      expect(result).toEqual([]);
    });

    it("suppresses issue for energy rise into 'Main' section in House", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Main")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "house", 5);
      expect(result).toEqual([]);
    });

    it("suppresses issue for energy rise into 'Peak' section in Trance", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Peak")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "trance", 5);
      expect(result).toEqual([]);
    });

    it("suppresses issue for energy rise into 'Drop' in Drum and Bass", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Drop")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "drum-and-bass", 5);
      expect(result).toEqual([]);
    });

    it("performs case-insensitive name matching for drop suppression", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "DROP")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "techno", 5);
      expect(result).toEqual([]);
    });

    it("does NOT suppress for energy FALL into Drop section", () => {
      const sections = [makeSection(0, 0, 32, "Drop"), makeSection(1, 32, 64, "Drop 2")];
      // Energy falls from 9 to 3 (delta=6, but falling not rising)
      const result = _detectAbruptChanges(sections, [9, 3], [], [], "techno", 5);
      expect(result).toHaveLength(1);
    });

    it("does NOT suppress for non-drop-suppression genres (Pop)", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Drop")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "pop-electronic", 5);
      expect(result).toHaveLength(1);
    });

    it("does NOT suppress for non-drop-suppression genres (Ambient)", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Drop")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "ambient-downtempo", 5);
      expect(result).toHaveLength(1);
    });

    it("does NOT suppress when genre is null", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Drop")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], null, 5);
      expect(result).toHaveLength(1);
    });

    it("does NOT suppress when section name does not contain drop keywords", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      const result = _detectAbruptChanges(sections, [3, 9], [], [], "techno", 5);
      expect(result).toHaveLength(1);
    });
  });

  describe("buildup context detection", () => {
    it("suppresses issue when riser track clip exists in window", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      const trackClipData: TrackClipData[] = [
        {
          trackName: "Riser FX",
          trackType: "audio",
          clips: [{ startTime: 16, endTime: 32, muted: false, hasEnvelopes: false }],
        },
      ];
      const result = _detectAbruptChanges(sections, [3, 9], trackClipData, [], null, 5);
      expect(result).toEqual([]);
    });

    it("suppresses issue when sweep track clip exists in window", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      const trackClipData: TrackClipData[] = [
        {
          trackName: "Noise Sweep",
          trackType: "audio",
          clips: [{ startTime: 20, endTime: 32, muted: false, hasEnvelopes: false }],
        },
      ];
      const result = _detectAbruptChanges(sections, [3, 9], trackClipData, [], null, 5);
      expect(result).toEqual([]);
    });

    it("suppresses issue when clip with hasEnvelopes exists in window", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      const trackClipData: TrackClipData[] = [
        {
          trackName: "Synth Lead",
          trackType: "midi",
          clips: [{ startTime: 20, endTime: 32, muted: false, hasEnvelopes: true }],
        },
      ];
      const result = _detectAbruptChanges(sections, [3, 9], trackClipData, [], null, 5);
      expect(result).toEqual([]);
    });

    it("suppresses issue when high MIDI note density exists in window (percussion roll)", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      // Window is last 16 beats (4 bars) of section 0: beats 16–32
      // Need >= 4 notes per bar = 16 notes in 4 bars
      const trackNoteData: TrackNoteData[] = [
        {
          trackName: "Snare Roll",
          notes: Array.from({ length: 16 }, (_, i) => ({
            startTime: 16 + i,
            duration: 0.25,
            pitch: 38,
            velocity: 100,
          })),
        },
      ];
      const result = _detectAbruptChanges(sections, [3, 9], [], trackNoteData, null, 5);
      expect(result).toEqual([]);
    });

    it("does NOT suppress when note density is below threshold", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      // Window: last 16 beats (4 bars). Need < 4 notes/bar = less than 16 notes
      const trackNoteData: TrackNoteData[] = [
        {
          trackName: "Snare",
          notes: Array.from({ length: 12 }, (_, i) => ({
            startTime: 16 + i * 1.3,
            duration: 0.25,
            pitch: 38,
            velocity: 100,
          })),
        },
      ];
      // 12 notes / 4 bars = 3 notes/bar, below threshold of 4
      const result = _detectAbruptChanges(sections, [3, 9], [], trackNoteData, null, 5);
      expect(result).toHaveLength(1);
    });

    it("does NOT suppress when buildup clip is outside the window", () => {
      const sections = [makeSection(0, 0, 32, "Build"), makeSection(1, 32, 64, "Chorus")];
      // Window is beats 16–32, but riser is at beats 0–10 (outside window)
      const trackClipData: TrackClipData[] = [
        {
          trackName: "Riser",
          trackType: "audio",
          clips: [{ startTime: 0, endTime: 10, muted: false, hasEnvelopes: false }],
        },
      ];
      const result = _detectAbruptChanges(sections, [3, 9], trackClipData, [], null, 5);
      expect(result).toHaveLength(1);
    });

    it("uses entire section as window when section is shorter than 4 bars", () => {
      // Section 0 is only 8 beats (2 bars), shorter than 16 beats (4 bars)
      const sections = [makeSection(0, 0, 8, "Short Build"), makeSection(1, 8, 40, "Chorus")];
      // Window should be entire section: beats 0–8
      const trackClipData: TrackClipData[] = [
        {
          trackName: "Riser",
          trackType: "audio",
          clips: [{ startTime: 2, endTime: 8, muted: false, hasEnvelopes: false }],
        },
      ];
      const result = _detectAbruptChanges(sections, [3, 9], trackClipData, [], null, 5);
      expect(result).toEqual([]);
    });
  });

  describe("severity and message format", () => {
    it("always assigns 'warning' severity", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const result = _detectAbruptChanges(sections, [1, 10], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe("warning");
    });

    it("includes both energy scores in message", () => {
      const sections = [makeSection(0, 0, 32, "Intro"), makeSection(1, 32, 64, "Verse")];
      const result = _detectAbruptChanges(sections, [2, 8], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.message).toContain("2");
      expect(result[0]!.message).toContain("8");
    });

    it("includes section names in message", () => {
      const sections = [makeSection(0, 0, 32, "Intro"), makeSection(1, 32, 64, "Verse")];
      const result = _detectAbruptChanges(sections, [2, 8], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.message).toContain("Intro");
      expect(result[0]!.message).toContain("Verse");
    });

    it("truncates message to 200 characters max", () => {
      const longName1 = "A".repeat(100);
      const longName2 = "B".repeat(100);
      const sections = [makeSection(0, 0, 32, longName1), makeSection(1, 32, 64, longName2)];
      const result = _detectAbruptChanges(sections, [1, 10], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.message.length).toBeLessThanOrEqual(200);
    });
  });

  describe("ID format", () => {
    it("uses format abrupt-change-{sectionId1}-{sectionId2}", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const result = _detectAbruptChanges(sections, [1, 10], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("abrupt-change-section-0-section-1");
    });
  });

  describe("multiple section pairs", () => {
    it("detects multiple abrupt changes across arrangement", () => {
      const sections = [
        makeSection(0, 0, 32, "A"),
        makeSection(1, 32, 64, "B"),
        makeSection(2, 64, 96, "C"),
      ];
      // A→B: delta=|9-2|=7, B→C: delta=|3-9|=6
      const result = _detectAbruptChanges(sections, [2, 9, 3], [], [], null, 5);
      expect(result).toHaveLength(2);
      expect(result[0]!.sectionIds).toEqual(["section-0", "section-1"]);
      expect(result[1]!.sectionIds).toEqual(["section-1", "section-2"]);
    });

    it("only reports pairs exceeding threshold", () => {
      const sections = [
        makeSection(0, 0, 32, "A"),
        makeSection(1, 32, 64, "B"),
        makeSection(2, 64, 96, "C"),
      ];
      // A→B: delta=|5-2|=3 (below 5), B→C: delta=|10-5|=5 (at threshold)
      const result = _detectAbruptChanges(sections, [2, 5, 10], [], [], null, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.sectionIds).toEqual(["section-1", "section-2"]);
    });
  });
});

describe("hasBuildupContext", () => {
  it("returns false for empty data", () => {
    const result = _hasBuildupContext(16, 32, [], []);
    expect(result).toBe(false);
  });

  it("returns true when riser track clip overlaps window", () => {
    const trackClipData: TrackClipData[] = [
      {
        trackName: "White Noise Riser",
        trackType: "audio",
        clips: [{ startTime: 20, endTime: 30, muted: false, hasEnvelopes: false }],
      },
    ];
    const result = _hasBuildupContext(16, 32, trackClipData, []);
    expect(result).toBe(true);
  });

  it("returns true when sweep track clip overlaps window", () => {
    const trackClipData: TrackClipData[] = [
      {
        trackName: "Filter Sweep",
        trackType: "midi",
        clips: [{ startTime: 18, endTime: 28, muted: false, hasEnvelopes: false }],
      },
    ];
    const result = _hasBuildupContext(16, 32, trackClipData, []);
    expect(result).toBe(true);
  });

  it("returns true when clip has hasEnvelopes in window", () => {
    const trackClipData: TrackClipData[] = [
      {
        trackName: "Synth Pad",
        trackType: "midi",
        clips: [{ startTime: 24, endTime: 32, muted: false, hasEnvelopes: true }],
      },
    ];
    const result = _hasBuildupContext(16, 32, trackClipData, []);
    expect(result).toBe(true);
  });

  it("returns true when note density >= 4 notes per bar in window", () => {
    // Window: 16 to 32 = 16 beats = 4 bars. Need >= 16 notes for 4 notes/bar
    const trackNoteData: TrackNoteData[] = [
      {
        trackName: "Snare",
        notes: Array.from({ length: 16 }, (_, i) => ({
          startTime: 16 + i,
          duration: 0.25,
          pitch: 38,
          velocity: 100,
        })),
      },
    ];
    const result = _hasBuildupContext(16, 32, [], trackNoteData);
    expect(result).toBe(true);
  });

  it("returns false when note density is below threshold", () => {
    // 12 notes in 4 bars = 3 notes/bar, below threshold
    const trackNoteData: TrackNoteData[] = [
      {
        trackName: "Snare",
        notes: Array.from({ length: 12 }, (_, i) => ({
          startTime: 16 + i * 1.3,
          duration: 0.25,
          pitch: 38,
          velocity: 100,
        })),
      },
    ];
    const result = _hasBuildupContext(16, 32, [], trackNoteData);
    expect(result).toBe(false);
  });

  it("returns false when clip is entirely outside window", () => {
    const trackClipData: TrackClipData[] = [
      {
        trackName: "Riser",
        trackType: "audio",
        clips: [{ startTime: 0, endTime: 15, muted: false, hasEnvelopes: false }],
      },
    ];
    const result = _hasBuildupContext(16, 32, trackClipData, []);
    expect(result).toBe(false);
  });

  it("returns false when window length is zero", () => {
    const trackNoteData: TrackNoteData[] = [
      {
        trackName: "Snare",
        notes: [{ startTime: 16, duration: 0.25, pitch: 38, velocity: 100 }],
      },
    ];
    const result = _hasBuildupContext(16, 16, [], trackNoteData);
    expect(result).toBe(false);
  });
});
