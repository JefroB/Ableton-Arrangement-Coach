import { describe, it, expect } from "vitest";
import {
  _computeJaccardIndex,
  _computeMidiDensityRatio,
  _computeAutomationMatch,
  _computeStructuralSimilarity,
} from "../../../src/core/issue-detector.js";
import type { TrackClipData, TrackNoteData } from "../../../src/core/section-analyzer.js";
import type { SectionAnalysisState } from "../../../src/state/store.js";
import type { Section } from "../../../src/core/section-scanner.js";

describe("Structural Similarity", () => {
  describe("computeJaccardIndex", () => {
    it("returns 0 when both sets are empty", () => {
      expect(_computeJaccardIndex([], [])).toBe(0);
    });

    it("returns 0 when sets have no overlap", () => {
      expect(_computeJaccardIndex(["a", "b"], ["c", "d"])).toBe(0);
    });

    it("returns 1 when sets are identical", () => {
      expect(_computeJaccardIndex(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    });

    it("returns correct ratio for partial overlap", () => {
      // intersection = {a, b}, union = {a, b, c, d}
      expect(_computeJaccardIndex(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(2 / 4);
    });

    it("returns 0 when one set is empty and the other is not", () => {
      expect(_computeJaccardIndex([], ["a", "b"])).toBe(0);
      expect(_computeJaccardIndex(["a", "b"], [])).toBe(0);
    });

    it("handles single element sets correctly", () => {
      expect(_computeJaccardIndex(["a"], ["a"])).toBe(1);
      expect(_computeJaccardIndex(["a"], ["b"])).toBe(0);
    });
  });

  describe("computeMidiDensityRatio", () => {
    it("returns 0 when both densities are 0", () => {
      expect(_computeMidiDensityRatio(0, 0)).toBe(0);
    });

    it("returns 1 when both densities are equal and non-zero", () => {
      expect(_computeMidiDensityRatio(5, 5)).toBe(1);
      expect(_computeMidiDensityRatio(0.5, 0.5)).toBe(1);
    });

    it("returns min/max ratio", () => {
      expect(_computeMidiDensityRatio(3, 6)).toBeCloseTo(0.5);
      expect(_computeMidiDensityRatio(6, 3)).toBeCloseTo(0.5);
    });

    it("returns 0 when one density is 0 and the other is not", () => {
      expect(_computeMidiDensityRatio(0, 5)).toBe(0);
      expect(_computeMidiDensityRatio(5, 0)).toBe(0);
    });

    it("is symmetric", () => {
      expect(_computeMidiDensityRatio(2, 8)).toBe(_computeMidiDensityRatio(8, 2));
    });
  });

  describe("computeAutomationMatch", () => {
    it("returns 1 when both have automation", () => {
      expect(_computeAutomationMatch(true, true)).toBe(1);
    });

    it("returns 1 when neither has automation", () => {
      expect(_computeAutomationMatch(false, false)).toBe(1);
    });

    it("returns 0 when automation presence differs", () => {
      expect(_computeAutomationMatch(true, false)).toBe(0);
      expect(_computeAutomationMatch(false, true)).toBe(0);
    });
  });

  describe("computeStructuralSimilarity", () => {
    const makeSection = (id: string, start: number, end: number): Section => ({
      id,
      name: id,
      startTime: start,
      endTime: end,
    });

    const makeAnalysis = (hasAutomation: boolean): SectionAnalysisState => ({
      activeTrackCount: 0,
      midiDensity: 0,
      hasAutomation,
      energyScore: 5,
    });

    it("returns 0.25 for identical empty sections (only automation match)", () => {
      // Both have no active tracks (Jaccard=0), no MIDI (density ratio=0), same automation (match=1)
      const sectionA = makeSection("a", 0, 16);
      const sectionB = makeSection("b", 16, 32);
      const trackClips: TrackClipData[] = [];
      const trackNotes: TrackNoteData[] = [];
      const analysisA = makeAnalysis(false);
      const analysisB = makeAnalysis(false);

      const result = _computeStructuralSimilarity(
        sectionA, sectionB, trackClips, trackNotes, analysisA, analysisB,
      );
      // 0.4*0 + 0.35*0 + 0.25*1 = 0.25
      expect(result).toBeCloseTo(0.25);
    });

    it("returns 1.0 for maximally similar sections", () => {
      const sectionA = makeSection("a", 0, 16);
      const sectionB = makeSection("b", 16, 32);

      // Same tracks active in both sections
      const trackClips: TrackClipData[] = [
        { trackName: "Kick", trackType: "audio", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
        { trackName: "Bass", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
      ];
      // Same MIDI density in both sections (4 notes per 4 bars = 1 note/bar each)
      const trackNotes: TrackNoteData[] = [
        { trackName: "Bass", notes: [
          { startTime: 0, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 4, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 8, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 12, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 16, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 20, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 24, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 28, duration: 1, pitch: 36, velocity: 100 },
        ]},
      ];
      const analysisA = makeAnalysis(true);
      const analysisB = makeAnalysis(true);

      const result = _computeStructuralSimilarity(
        sectionA, sectionB, trackClips, trackNotes, analysisA, analysisB,
      );
      // Jaccard=1, density ratio=1, automation match=1 → 0.4+0.35+0.25 = 1.0
      expect(result).toBeCloseTo(1.0);
    });

    it("result is always in [0, 1] range", () => {
      const sectionA = makeSection("a", 0, 16);
      const sectionB = makeSection("b", 16, 32);
      const trackClips: TrackClipData[] = [
        { trackName: "Lead", trackType: "midi", clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }] },
      ];
      const trackNotes: TrackNoteData[] = [
        { trackName: "Lead", notes: [{ startTime: 2, duration: 1, pitch: 60, velocity: 100 }] },
      ];
      const analysisA = makeAnalysis(true);
      const analysisB = makeAnalysis(false);

      const result = _computeStructuralSimilarity(
        sectionA, sectionB, trackClips, trackNotes, analysisA, analysisB,
      );
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it("computes correct weighted sum for mixed components", () => {
      // Section A: tracks [Kick, Bass, Lead], Section B: tracks [Kick, Bass, Pad]
      // Jaccard = 2/4 = 0.5
      const sectionA = makeSection("a", 0, 16);
      const sectionB = makeSection("b", 16, 32);

      const trackClips: TrackClipData[] = [
        { trackName: "Kick", trackType: "audio", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
        { trackName: "Bass", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
        { trackName: "Lead", trackType: "midi", clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }] },
        { trackName: "Pad", trackType: "midi", clips: [{ startTime: 16, endTime: 32, muted: false, hasEnvelopes: false }] },
      ];

      // Section A has 8 notes (2 notes/bar), Section B has 4 notes (1 note/bar)
      // density ratio = 1/2 = 0.5
      const trackNotes: TrackNoteData[] = [
        { trackName: "Bass", notes: [
          { startTime: 0, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 2, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 4, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 6, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 8, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 10, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 12, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 14, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 16, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 20, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 24, duration: 1, pitch: 36, velocity: 100 },
          { startTime: 28, duration: 1, pitch: 36, velocity: 100 },
        ]},
      ];

      // Automation: A=true, B=false → match=0
      const analysisA = makeAnalysis(true);
      const analysisB = makeAnalysis(false);

      const result = _computeStructuralSimilarity(
        sectionA, sectionB, trackClips, trackNotes, analysisA, analysisB,
      );

      // Jaccard: intersection={Kick, Bass}=2, union={Kick, Bass, Lead, Pad}=4 → 0.5
      // DensityRatio: sectionA has 8 notes in 4 bars=2, sectionB has 4 notes in 4 bars=1 → min/max=0.5
      // AutomationMatch: true vs false → 0
      // Weighted: 0.4*0.5 + 0.35*0.5 + 0.25*0 = 0.2 + 0.175 + 0 = 0.375
      expect(result).toBeCloseTo(0.375);
    });
  });
});
