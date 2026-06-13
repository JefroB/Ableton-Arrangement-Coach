/**
 * Property-based tests for the Contrast Gap Detector module.
 *
 * Feature: automation-awareness
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import { detectContrastGaps } from "./contrast-gap-detector.js";
import type { ContrastGapThresholds } from "./contrast-gap-detector.js";
import type { Section } from "./section-scanner.js";
import type { TrackClipData, TrackNoteData } from "./section-analyzer.js";
import type { SectionAnalysisState } from "../state/store.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Build a pair of consecutive sections with a given start/end.
 */
function buildSectionPair(startA: number, endA: number, endB: number): [Section, Section] {
  return [
    { id: "section-0", name: "Section A", startTime: startA, endTime: endA },
    { id: "section-1", name: "Section B", startTime: endA, endTime: endB },
  ];
}

/**
 * Build TrackClipData such that a specific set of tracks are active in a section.
 * Each track gets one unmuted clip spanning [startTime, endTime).
 */
function buildTrackClipData(
  trackNames: string[],
  startTime: number,
  endTime: number,
): TrackClipData[] {
  return trackNames.map((name) => ({
    trackName: name,
    trackType: "midi" as const,
    clips: [{ startTime, endTime, muted: false, hasEnvelopes: false }],
  }));
}

/**
 * Build TrackNoteData such that a specific set of tracks have a given number
 * of notes within a section range. Each note has pitch=60, velocity=100, duration=0.5.
 */
function buildTrackNoteData(
  trackNames: string[],
  noteCount: number,
  sectionStart: number,
  sectionEnd: number,
): TrackNoteData[] {
  const sectionLength = sectionEnd - sectionStart;
  const notes = Array.from({ length: noteCount }, (_, i) => ({
    pitch: 60,
    startTime: sectionStart + (i * sectionLength) / Math.max(noteCount, 1),
    duration: 0.5,
    velocity: 100,
  }));

  return trackNames.map((name) => ({
    trackName: name,
    notes,
  }));
}

// ─── Property 3: Contrast gap detection condition ──────────────────────

// Feature: automation-awareness, Property 3: Contrast gap detection condition
describe("Property 3: Contrast gap detection condition", () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * For any sequence of consecutive sections, a Contrast_Gap SHALL be flagged
   * if and only if: (a) structural similarity between adjacent sections exceeds
   * the genre-specific repetitionSimilarity threshold AND (b) the energy delta
   * between adjacent sections is below the flatEnergyDelta threshold.
   * When neither or only one condition holds, no Contrast_Gap SHALL be emitted.
   */

  test.prop(
    [
      // Whether both sections share the same tracks (controls Jaccard component)
      fc.boolean(),
      // Whether both sections have the same note density (controls density ratio)
      fc.boolean(),
      // Whether energy delta is below threshold (controls energy condition)
      fc.boolean(),
      // Random threshold values
      fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true }),
      fc.float({ min: Math.fround(0.5), max: Math.fround(5.0), noNaN: true }),
    ],
    { numRuns: 100 },
  )(
    "gap detected iff BOTH similarity > threshold AND energy delta < threshold",
    (sameTracksActive, sameDensity, energyBelowThreshold, similarityThresholdRaw, flatEnergyMaxDelta) => {
      // Build two consecutive sections: A=[0,16), B=[16,32)
      const sections = buildSectionPair(0, 16, 32);

      // Determine the similarity ceiling as percent (0-100)
      // We use a value that lets us control detection precisely.
      // If sameTracksActive AND sameDensity → similarity = 1.0 (both components = 1)
      // If NOT sameTracksActive AND NOT sameDensity → similarity = 0.0
      // Mixed cases give 0.5

      // We set the threshold such that:
      // - When we want detection (similarity > threshold): set threshold below actual similarity
      // - When we don't want detection: set threshold above actual similarity

      // Compute what similarity will be based on our choices:
      // Jaccard = sameTracksActive ? 1.0 : 0.0
      // DensityRatio = sameDensity ? 1.0 : 0.0
      // similarity = 0.5 * Jaccard + 0.5 * DensityRatio
      const expectedJaccard = sameTracksActive ? 1.0 : 0.0;
      const expectedDensityRatio = sameDensity ? 1.0 : 0.0;
      const expectedSimilarity = 0.5 * expectedJaccard + 0.5 * expectedDensityRatio;

      // Set the similarity threshold just below the expected similarity if we want
      // detection, or just above if we don't. The actual test controls this via
      // sameTracksActive and sameDensity - we need BOTH = true for similarity = 1.0.
      // Use a fixed threshold of 0.9 — only similarity=1.0 exceeds it.
      const similarityCeilingPercent = 90; // threshold = 0.9, so only sim > 0.9 triggers

      // Build track clip data: section A always has ["Track1", "Track2"]
      // If sameTracksActive: section B also has ["Track1", "Track2"]
      // If !sameTracksActive: section B has ["Track3", "Track4"] (disjoint)
      const sectionAClips = buildTrackClipData(["Track1", "Track2"], 0, 16);
      const sectionBClips = sameTracksActive
        ? buildTrackClipData(["Track1", "Track2"], 16, 32)
        : buildTrackClipData(["Track3", "Track4"], 16, 32);
      const trackClipData = [...sectionAClips, ...sectionBClips];

      // Build note data:
      // If sameDensity: same number of notes in both sections (16 notes each → density = 4 notes/bar)
      // If !sameDensity: section A has 16 notes, section B has 0 notes
      const noteCountA = 16;
      const noteCountB = sameDensity ? 16 : 0;

      const sectionANotes = buildTrackNoteData(["Track1", "Track2"], noteCountA, 0, 16);
      const sectionBTracks = sameTracksActive ? ["Track1", "Track2"] : ["Track3", "Track4"];
      const sectionBNotes = buildTrackNoteData(sectionBTracks, noteCountB, 16, 32);
      const trackNoteData = [...sectionANotes, ...sectionBNotes];

      // Build energy curve:
      // If energyBelowThreshold: delta = 0 (both same energy)
      // If !energyBelowThreshold: delta = flatEnergyMaxDelta + 10 (well above)
      const energyA = 5.0;
      const energyB = energyBelowThreshold ? energyA : energyA + flatEnergyMaxDelta + 10;
      const energyCurve = [energyA, energyB];

      const thresholds: ContrastGapThresholds = {
        similarityCeilingPercent,
        flatEnergyMaxDelta,
      };

      const sectionAnalysis = new Map<string, SectionAnalysisState>();

      const issues = detectContrastGaps(
        sections,
        sectionAnalysis,
        energyCurve,
        trackClipData,
        trackNoteData,
        thresholds,
      );

      // Detection should fire iff BOTH conditions hold:
      // 1. similarity > threshold (which requires sameTracksActive AND sameDensity for sim=1.0 > 0.9)
      // 2. energy delta < flatEnergyMaxDelta
      const similarityConditionMet = expectedSimilarity > (similarityCeilingPercent / 100);
      const energyConditionMet = energyBelowThreshold;
      const shouldDetect = similarityConditionMet && energyConditionMet;

      if (shouldDetect) {
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]!.type).toBe("contrast_gap");
        expect(issues[0]!.sectionIds).toContain("section-0");
        expect(issues[0]!.sectionIds).toContain("section-1");
      } else {
        expect(issues).toHaveLength(0);
      }
    },
  );

  test.prop(
    [
      // Generate a flat energy max delta threshold
      fc.float({ min: Math.fround(0.1), max: Math.fround(2.0), noNaN: true }),
      // Generate a similarity ceiling (30-95%)
      fc.integer({ min: 30, max: 95 }),
    ],
    { numRuns: 100 },
  )(
    "no gap when similarity condition fails (completely different tracks and density)",
    (flatEnergyMaxDelta, similarityCeilingPercent) => {
      // Two sections with completely different tracks and densities → similarity = 0
      const sections = buildSectionPair(0, 16, 32);

      // Section A: Track1 with 16 notes
      // Section B: Track2 with 0 notes (different track, no notes)
      const trackClipData: TrackClipData[] = [
        { trackName: "Track1", trackType: "midi", clips: [{ startTime: 0, endTime: 16, muted: false, hasEnvelopes: false }] },
        { trackName: "Track2", trackType: "midi", clips: [{ startTime: 16, endTime: 32, muted: false, hasEnvelopes: false }] },
      ];

      const trackNoteData: TrackNoteData[] = [
        { trackName: "Track1", notes: Array.from({ length: 16 }, (_, i) => ({ pitch: 60, startTime: i, duration: 0.5, velocity: 100 })) },
        { trackName: "Track2", notes: [] },
      ];

      // Energy is flat (condition met), but similarity should be 0
      const energyCurve = [5.0, 5.0];

      const thresholds: ContrastGapThresholds = { similarityCeilingPercent, flatEnergyMaxDelta };
      const sectionAnalysis = new Map<string, SectionAnalysisState>();

      const issues = detectContrastGaps(
        sections,
        sectionAnalysis,
        energyCurve,
        trackClipData,
        trackNoteData,
        thresholds,
      );

      // Similarity = 0 which is NOT > any positive threshold, so no gap
      expect(issues).toHaveLength(0);
    },
  );

  test.prop(
    [
      // Generate a flat energy max delta threshold
      fc.float({ min: Math.fround(0.1), max: Math.fround(2.0), noNaN: true }),
      // Generate a similarity ceiling (0-80% so that similarity=1.0 > threshold)
      fc.integer({ min: 1, max: 80 }),
    ],
    { numRuns: 100 },
  )(
    "no gap when energy condition fails (large delta) even with high similarity",
    (flatEnergyMaxDelta, similarityCeilingPercent) => {
      // Two sections with identical tracks and identical density → similarity = 1.0
      const sections = buildSectionPair(0, 16, 32);

      const trackClipData: TrackClipData[] = [
        { trackName: "Track1", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
      ];

      const trackNoteData: TrackNoteData[] = [
        {
          trackName: "Track1",
          notes: [
            // Same density in both sections: 4 notes each
            ...Array.from({ length: 4 }, (_, i) => ({ pitch: 60, startTime: i * 4, duration: 0.5, velocity: 100 })),
            ...Array.from({ length: 4 }, (_, i) => ({ pitch: 60, startTime: 16 + i * 4, duration: 0.5, velocity: 100 })),
          ],
        },
      ];

      // Energy delta is well above threshold
      const energyA = 1.0;
      const energyB = energyA + flatEnergyMaxDelta + 10;
      const energyCurve = [energyA, energyB];

      const thresholds: ContrastGapThresholds = { similarityCeilingPercent, flatEnergyMaxDelta };
      const sectionAnalysis = new Map<string, SectionAnalysisState>();

      const issues = detectContrastGaps(
        sections,
        sectionAnalysis,
        energyCurve,
        trackClipData,
        trackNoteData,
        thresholds,
      );

      // Similarity is 1.0 > threshold, BUT energy delta >= flatEnergyMaxDelta → no gap
      expect(issues).toHaveLength(0);
    },
  );

  test.prop(
    [
      // Generate a flat energy max delta threshold
      fc.float({ min: Math.fround(0.5), max: Math.fround(5.0), noNaN: true }),
      // Generate a similarity ceiling (0-80% so similarity=1.0 will exceed it)
      fc.integer({ min: 1, max: 80 }),
    ],
    { numRuns: 100 },
  )(
    "gap detected when both conditions hold (identical tracks/density and flat energy)",
    (flatEnergyMaxDelta, similarityCeilingPercent) => {
      // Two sections with identical tracks and identical density → similarity = 1.0
      const sections = buildSectionPair(0, 16, 32);

      const trackClipData: TrackClipData[] = [
        { trackName: "Track1", trackType: "midi", clips: [{ startTime: 0, endTime: 32, muted: false, hasEnvelopes: false }] },
      ];

      const trackNoteData: TrackNoteData[] = [
        {
          trackName: "Track1",
          notes: [
            // Same density in both sections: 4 notes per section
            ...Array.from({ length: 4 }, (_, i) => ({ pitch: 60, startTime: i * 4, duration: 0.5, velocity: 100 })),
            ...Array.from({ length: 4 }, (_, i) => ({ pitch: 60, startTime: 16 + i * 4, duration: 0.5, velocity: 100 })),
          ],
        },
      ];

      // Energy is identical (delta = 0 < any positive threshold)
      const energyCurve = [5.0, 5.0];

      const thresholds: ContrastGapThresholds = { similarityCeilingPercent, flatEnergyMaxDelta };
      const sectionAnalysis = new Map<string, SectionAnalysisState>();

      const issues = detectContrastGaps(
        sections,
        sectionAnalysis,
        energyCurve,
        trackClipData,
        trackNoteData,
        thresholds,
      );

      // Similarity = 1.0 > any threshold in [0.01, 0.80], AND energy delta = 0 < threshold → gap detected
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]!.type).toBe("contrast_gap");
      expect(issues[0]!.sectionIds).toContain("section-0");
      expect(issues[0]!.sectionIds).toContain("section-1");
    },
  );
});
