/**
 * Unit tests for the repetition detection sub-detector.
 *
 * Feature: m3-issue-detection
 * Requirements: 3.1, 3.3, 3.4, 3.5
 */
import { describe, it, expect } from "vitest";
import { _detectRepetition } from "../../../src/core/issue-detector.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { SectionAnalysisState } from "../../../src/state/store.js";
import type { TrackClipData, TrackNoteData } from "../../../src/core/section-analyzer.js";
import type { GenreThresholdProfile } from "../../../src/core/genre-registry.js";
import { DEFAULT_THRESHOLDS } from "../../../src/core/genre-registry.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeSection(index: number, start: number, end: number, name?: string): Section {
  return {
    id: `section-${index}`,
    name: name ?? `Section ${index}`,
    startTime: start,
    endTime: end,
  };
}

function makeAnalysis(
  activeTrackCount: number,
  midiDensity: number,
  hasAutomation: boolean,
  energyScore: number,
): SectionAnalysisState {
  return { activeTrackCount, midiDensity, hasAutomation, energyScore };
}

/**
 * Create track clip data where both sections have identical track activity
 * (all tracks have clips spanning the full time range of both sections).
 */
function makeIdenticalTrackClipData(trackNames: string[], startTime: number, endTime: number): TrackClipData[] {
  return trackNames.map((trackName) => ({
    trackName,
    trackType: "midi" as const,
    clips: [{ startTime, endTime, muted: false, hasEnvelopes: false }],
  }));
}

/**
 * Create track note data with a specific note count spread evenly across a time range.
 */
function makeTrackNoteData(trackNames: string[], startTime: number, endTime: number, notesPerTrack: number): TrackNoteData[] {
  const step = notesPerTrack > 0 ? (endTime - startTime) / notesPerTrack : 0;
  return trackNames.map((trackName) => ({
    trackName,
    notes: Array.from({ length: notesPerTrack }, (_, i) => ({
      startTime: startTime + i * step,
      duration: 0.25,
      pitch: 60,
      velocity: 100,
    })),
  }));
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("detectRepetition", () => {
  describe("skip conditions", () => {
    it("returns empty array when sections array is empty", () => {
      const result = _detectRepetition(
        [],
        new Map(),
        [],
        [],
        DEFAULT_THRESHOLDS,
        null,
      );
      expect(result).toEqual([]);
    });

    it("returns empty array when only 1 section exists", () => {
      const sections = [makeSection(0, 0, 32)];
      const analysis = new Map([["section-0", makeAnalysis(4, 10, true, 5)]]);

      const result = _detectRepetition(
        sections,
        analysis,
        [],
        [],
        DEFAULT_THRESHOLDS,
        null,
      );
      expect(result).toEqual([]);
    });

    it("skips pair when first section analysis is missing", () => {
      const sections = [makeSection(0, 0, 32), makeSection(1, 32, 64)];
      const analysis = new Map([["section-1", makeAnalysis(4, 10, true, 5)]]);

      const result = _detectRepetition(
        sections,
        analysis,
        [],
        [],
        DEFAULT_THRESHOLDS,
        null,
      );
      expect(result).toEqual([]);
    });

    it("skips pair when second section analysis is missing", () => {
      const sections = [makeSection(0, 0, 32), makeSection(1, 32, 64)];
      const analysis = new Map([["section-0", makeAnalysis(4, 10, true, 5)]]);

      const result = _detectRepetition(
        sections,
        analysis,
        [],
        [],
        DEFAULT_THRESHOLDS,
        null,
      );
      expect(result).toEqual([]);
    });
  });

  describe("detection logic", () => {
    it("reports issue when structural similarity exceeds default threshold (0.85)", () => {
      const sections = [makeSection(0, 0, 32, "Verse 1"), makeSection(1, 32, 64, "Verse 2")];
      const trackNames = ["Kick", "Bass", "Lead", "Pad"];

      // Both sections have identical track activity and automation state
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);

      // Clips span both sections so Jaccard index = 1.0
      const trackClipData = makeIdenticalTrackClipData(trackNames, 0, 64);

      // Same note density in both sections so density ratio = 1.0
      const trackNoteData = makeTrackNoteData(trackNames, 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      // With Jaccard=1, densityRatio=1, automationMatch=1:
      // similarity = 0.4*1 + 0.35*1 + 0.25*1 = 1.0, which > 0.85
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("repetition");
      expect(result[0]!.severity).toBe("warning");
      expect(result[0]!.sectionIds).toEqual(["section-0", "section-1"]);
      expect(result[0]!.id).toBe("repetition-section-0-section-1");
    });

    it("does not report issue when similarity is below threshold", () => {
      const sections = [makeSection(0, 0, 32, "Intro"), makeSection(1, 32, 64, "Drop")];

      // Different automation state → automationMatch = 0
      // Different track activity will reduce Jaccard
      const analysis = new Map([
        ["section-0", makeAnalysis(2, 5, false, 3)],
        ["section-1", makeAnalysis(6, 20, true, 8)],
      ]);

      // Section 0 has only 2 tracks active, Section 1 has different tracks
      const trackClipData: TrackClipData[] = [
        { trackName: "Pad", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
        { trackName: "HiHat", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
        { trackName: "Kick", trackType: "midi", clips: [{ startTime: 32, endTime: 64, muted: false, hasEnvelopes: false }] },
        { trackName: "Bass", trackType: "midi", clips: [{ startTime: 32, endTime: 64, muted: false, hasEnvelopes: false }] },
        { trackName: "Lead", trackType: "midi", clips: [{ startTime: 32, endTime: 64, muted: false, hasEnvelopes: false }] },
        { trackName: "FX", trackType: "audio", clips: [{ startTime: 32, endTime: 64, muted: false, hasEnvelopes: false }] },
      ];

      // Very different note density
      const trackNoteData: TrackNoteData[] = [
        { trackName: "Pad", notes: [{ startTime: 0, duration: 4, pitch: 60, velocity: 80 }] },
        { trackName: "HiHat", notes: [{ startTime: 2, duration: 0.5, pitch: 42, velocity: 100 }] },
        { trackName: "Kick", notes: Array.from({ length: 64 }, (_, i) => ({ startTime: 32 + i * 0.5, duration: 0.25, pitch: 36, velocity: 127 })) },
        { trackName: "Bass", notes: Array.from({ length: 32 }, (_, i) => ({ startTime: 32 + i, duration: 0.5, pitch: 36, velocity: 100 })) },
      ];

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      // Jaccard = 0/6 = 0, densityRatio is very low, automationMatch = 0
      // similarity should be well below 0.85
      expect(result).toHaveLength(0);
    });

    it("does not report issue when similarity equals threshold exactly", () => {
      // The condition is > threshold, not >=
      // We need to construct a scenario where similarity = exactly 0.85
      // This is tested indirectly — the detector uses strict > comparison
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);

      // Use a custom threshold that matches exactly what the similarity will produce
      // Identical sections produce similarity = 1.0. Set threshold to 1.0 to test boundary.
      const thresholds: GenreThresholdProfile = {
        ...DEFAULT_THRESHOLDS,
        repetitionSimilarity: 1.0, // Similarity of 1.0 is not > 1.0
      };

      const trackClipData = makeIdenticalTrackClipData(["Track1"], 0, 64);
      const trackNoteData = makeTrackNoteData(["Track1"], 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        thresholds,
        null,
      );

      // similarity = 1.0 is NOT > 1.0, so no issue
      expect(result).toHaveLength(0);
    });

    it("evaluates only adjacent pairs, not non-adjacent sections", () => {
      // 3 sections: A, B, C. Only (A,B) and (B,C) should be checked.
      const sections = [
        makeSection(0, 0, 32, "A"),
        makeSection(1, 32, 64, "B"),
        makeSection(2, 64, 96, "C"),
      ];

      // A and C are very similar, but B is different
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(2, 3, false, 2)],  // B is different
        ["section-2", makeAnalysis(4, 10, true, 5)],  // C is like A
      ]);

      // A and C have same tracks active, B has different tracks
      const trackClipData: TrackClipData[] = [
        { trackName: "Kick", trackType: "midi", clips: [
          { startTime: 0, endTime: 32, muted: false, hasEnvelopes: false },
          { startTime: 64, endTime: 96, muted: false, hasEnvelopes: false },
        ]},
        { trackName: "Bass", trackType: "midi", clips: [
          { startTime: 0, endTime: 32, muted: false, hasEnvelopes: false },
          { startTime: 64, endTime: 96, muted: false, hasEnvelopes: false },
        ]},
        { trackName: "Pad", trackType: "midi", clips: [
          { startTime: 32, endTime: 64, muted: false, hasEnvelopes: false },
        ]},
      ];

      const trackNoteData: TrackNoteData[] = [
        { trackName: "Kick", notes: [
          ...Array.from({ length: 16 }, (_, i) => ({ startTime: i * 2, duration: 0.25, pitch: 36, velocity: 127 })),
          ...Array.from({ length: 16 }, (_, i) => ({ startTime: 64 + i * 2, duration: 0.25, pitch: 36, velocity: 127 })),
        ]},
        { trackName: "Bass", notes: [
          ...Array.from({ length: 16 }, (_, i) => ({ startTime: i * 2, duration: 0.5, pitch: 36, velocity: 100 })),
          ...Array.from({ length: 16 }, (_, i) => ({ startTime: 64 + i * 2, duration: 0.5, pitch: 36, velocity: 100 })),
        ]},
        { trackName: "Pad", notes: [{ startTime: 40, duration: 4, pitch: 60, velocity: 80 }] },
      ];

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      // A→B should have low similarity (different tracks, automation, density)
      // B→C should also have low similarity
      // A→C would be high but is NOT checked (non-adjacent)
      // Check that no repetition is found between A and C directly
      const nonAdjacentIssue = result.find(
        (i) => i.sectionIds.includes("section-0") && i.sectionIds.includes("section-2"),
      );
      expect(nonAdjacentIssue).toBeUndefined();
    });
  });

  describe("severity and genre behavior", () => {
    it("reports 'warning' severity for non-repetition-tolerant genres", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1", "T2", "T3"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1", "T2", "T3"], 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        "house",
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe("warning");
    });

    it("reports 'warning' severity when genre is null", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1", "T2"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1", "T2"], 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe("warning");
    });

    it("reports 'info' severity for techno (repetition-tolerant)", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1", "T2", "T3"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1", "T2", "T3"], 0, 64, 32);

      // Use Techno thresholds (0.92 repetitionSimilarity)
      const technoThresholds: GenreThresholdProfile = {
        ...DEFAULT_THRESHOLDS,
        repetitionSimilarity: 0.92,
      };
      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        technoThresholds,
        "techno",
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe("info");
    });

    it("reports 'info' severity for ambient-downtempo (repetition-tolerant)", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1", "T2", "T3"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1", "T2", "T3"], 0, 64, 32);

      const ambientThresholds: GenreThresholdProfile = {
        ...DEFAULT_THRESHOLDS,
        repetitionSimilarity: 0.92,
      };
      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        ambientThresholds,
        "ambient-downtempo",
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe("info");
    });

    it("uses higher threshold (0.92) for techno - below threshold not reported", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 8, true, 5)],  // slightly different density
      ]);

      // Tracks are identical across both sections (Jaccard = 1.0)
      const trackClipData = makeIdenticalTrackClipData(["T1", "T2", "T3", "T4"], 0, 64);

      // Different note counts to get density ratio < 1.0 but still high
      // Section 0: notes per bar = 32/8 = 4
      // Section 1: notes per bar = 28/8 = 3.5
      // ratio = 3.5/4 = 0.875
      const trackNoteData: TrackNoteData[] = [
        { trackName: "T1", notes: [
          ...Array.from({ length: 8 }, (_, i) => ({ startTime: i * 4, duration: 0.25, pitch: 60, velocity: 100 })),
          ...Array.from({ length: 7 }, (_, i) => ({ startTime: 32 + i * 4, duration: 0.25, pitch: 60, velocity: 100 })),
        ]},
      ];

      // similarity = 0.4*1 + 0.35*0.875 + 0.25*1 = 0.4 + 0.30625 + 0.25 = 0.95625
      // This is > 0.92 so it should still be reported for Techno
      // Let's use a case where it's between 0.85 and 0.92

      // Actually let's make a more precise scenario:
      // Want similarity between 0.85 and 0.92
      // Jaccard = 1.0, automationMatch = 1.0
      // Need densityRatio such that: 0.4 + 0.35*r + 0.25 = similarity
      // For similarity = 0.90: 0.35*r = 0.25, r = 0.714
      // density ratio = min/max, so if one section has 7 notes/bar and other has ~9.8, ratio = 7/9.8 ≈ 0.714
      
      // More simply: set up sections where Jaccard < 1 to reduce similarity
      // Let's just use a custom threshold approach:
      const technoThresholds: GenreThresholdProfile = {
        ...DEFAULT_THRESHOLDS,
        repetitionSimilarity: 0.92,
      }; // repetitionSimilarity = 0.92
      
      // Make sections that produce similarity of ~0.90 (above default 0.85, below Techno 0.92)
      // Jaccard = 3/4 = 0.75 (3 shared tracks out of 4 total)
      // densityRatio = 1.0
      // automationMatch = 1.0
      // similarity = 0.4*0.75 + 0.35*1.0 + 0.25*1.0 = 0.3 + 0.35 + 0.25 = 0.90
      const sections2 = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis2 = new Map([
        ["section-0", makeAnalysis(3, 10, true, 5)],
        ["section-1", makeAnalysis(3, 10, true, 5)],
      ]);

      const trackClipData2: TrackClipData[] = [
        { trackName: "T1", trackType: "midi", clips: [{ startTime: 0, endTime: 64, muted: false, hasEnvelopes: false }] },
        { trackName: "T2", trackType: "midi", clips: [{ startTime: 0, endTime: 64, muted: false, hasEnvelopes: false }] },
        { trackName: "T3", trackType: "midi", clips: [{ startTime: 0, endTime: 64, muted: false, hasEnvelopes: false }] },
        { trackName: "T4", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] }, // Only in section 0
      ];

      const trackNoteData2 = makeTrackNoteData(["T1", "T2", "T3"], 0, 64, 32);

      const result = _detectRepetition(
        sections2,
        analysis2,
        trackClipData2,
        trackNoteData2,
        technoThresholds,
        "techno",
      );

      // similarity ≈ 0.90 which is > 0.85 (default) but NOT > 0.92 (Techno)
      expect(result).toHaveLength(0);
    });
  });

  describe("message format", () => {
    it("includes section names and similarity score in message", () => {
      const sections = [makeSection(0, 0, 32, "Verse 1"), makeSection(1, 32, 64, "Verse 2")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1", "T2"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1", "T2"], 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      expect(result).toHaveLength(1);
      const msg = result[0]!.message;
      expect(msg).toContain("Verse 1");
      expect(msg).toContain("Verse 2");
      // Score should be a number like "1.00" or "0.95"
      expect(msg).toMatch(/\d+\.\d{2}/);
    });

    it("truncates message to 200 characters max", () => {
      // Use very long section names to push message over 200 chars
      const longName1 = "A".repeat(100);
      const longName2 = "B".repeat(100);
      const sections = [makeSection(0, 0, 32, longName1), makeSection(1, 32, 64, longName2)];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1"], 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.message.length).toBeLessThanOrEqual(200);
    });
  });

  describe("ID format", () => {
    it("uses format repetition-{sectionId1}-{sectionId2}", () => {
      const sections = [makeSection(0, 0, 32, "A"), makeSection(1, 32, 64, "B")];
      const analysis = new Map([
        ["section-0", makeAnalysis(4, 10, true, 5)],
        ["section-1", makeAnalysis(4, 10, true, 5)],
      ]);
      const trackClipData = makeIdenticalTrackClipData(["T1"], 0, 64);
      const trackNoteData = makeTrackNoteData(["T1"], 0, 64, 32);

      const result = _detectRepetition(
        sections,
        analysis,
        trackClipData,
        trackNoteData,
        DEFAULT_THRESHOLDS,
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("repetition-section-0-section-1");
    });
  });
});
