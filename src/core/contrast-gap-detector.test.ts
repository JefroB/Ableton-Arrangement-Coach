/**
 * Unit tests for Contrast Gap Detector.
 *
 * Validates Requirements 2.1, 2.2:
 * - Gap detected when structural similarity > threshold AND energy delta < threshold
 * - Severity "warning" for 2 sections, "critical" for 3+
 * - sectionIds contains all involved sections
 */
import { describe, it, expect } from "vitest";
import { detectContrastGaps, type ContrastGapThresholds } from "./contrast-gap-detector.js";
import type { Section } from "./section-scanner.js";
import type { TrackClipData, TrackNoteData } from "./section-analyzer.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeSection(id: string, name: string, startTime: number, endTime: number): Section {
  return { id, name, startTime, endTime };
}

/**
 * Create trackClipData where the same tracks are active in all sections.
 * This produces high Jaccard similarity (1.0) between any pair of sections.
 */
function makeUniformTrackClipData(trackNames: string[], sectionStart: number, sectionEnd: number): TrackClipData[] {
  return trackNames.map((name) => ({
    trackName: name,
    trackType: "midi" as const,
    clips: [{ startTime: sectionStart, endTime: sectionEnd, muted: false, hasEnvelopes: false }],
  }));
}

/**
 * Create trackNoteData where each track has notes spread uniformly across a range.
 * This produces similar MIDI density between sections (high density ratio → high similarity).
 */
function makeUniformTrackNoteData(trackNames: string[], startTime: number, endTime: number, notesPerTrack: number): TrackNoteData[] {
  const span = endTime - startTime;
  return trackNames.map((name) => ({
    trackName: name,
    notes: Array.from({ length: notesPerTrack }, (_, i) => ({
      pitch: 60,
      startTime: startTime + (i * span) / notesPerTrack,
      duration: 0.25,
      velocity: 100,
    })),
  }));
}

/**
 * Create trackClipData where sections have completely different active tracks.
 * This produces low Jaccard similarity (0.0) between sections.
 */
function makeDifferentTrackClipData(sections: Section[]): TrackClipData[] {
  // Each section gets a unique track that only has a clip in that section
  return sections.map((section, i) => ({
    trackName: `unique-track-${i}`,
    trackType: "midi" as const,
    clips: [{ startTime: section.startTime, endTime: section.endTime, muted: false, hasEnvelopes: false }],
  }));
}

const defaultThresholds: ContrastGapThresholds = {
  flatEnergyMaxDelta: 0.1,
  similarityCeilingPercent: 50,
};

// ─── Tests ─────────────────────────────────────────────────────────────

describe("detectContrastGaps", () => {
  it("returns no gap when similarity is below threshold", () => {
    // Two sections with completely different tracks → Jaccard = 0 → similarity = 0
    const sections = [
      makeSection("s0", "Intro", 0, 16),
      makeSection("s1", "Verse", 16, 32),
    ];

    // Different tracks active in each section → zero overlap
    const trackClipData = makeDifferentTrackClipData(sections);

    // No notes → midi density ratio = 0 for both (0/0 treated as 0)
    const trackNoteData: TrackNoteData[] = [];

    // Energy values are flat (delta = 0 < threshold) — only energy condition met
    const energyCurve = [0.5, 0.5];

    const issues = detectContrastGaps(
      sections,
      new Map(),
      energyCurve,
      trackClipData,
      trackNoteData,
      defaultThresholds,
    );

    expect(issues).toHaveLength(0);
  });

  it("returns no gap when energy delta is above threshold", () => {
    // Two sections with identical tracks → high similarity
    const sections = [
      makeSection("s0", "Verse 1", 0, 16),
      makeSection("s1", "Verse 2", 16, 32),
    ];

    // Same tracks active in both sections (clips span full range) → Jaccard = 1.0
    const trackClipData = makeUniformTrackClipData(["Bass", "Drums", "Lead"], 0, 32);

    // Same density in both sections → density ratio = 1.0
    // Total similarity = 0.5 * 1.0 + 0.5 * 1.0 = 1.0 (well above 50% threshold)
    const trackNoteData = makeUniformTrackNoteData(["Bass", "Drums", "Lead"], 0, 32, 16);

    // Large energy delta → above threshold (0.1)
    const energyCurve = [0.3, 0.8]; // delta = 0.5 >> 0.1

    const issues = detectContrastGaps(
      sections,
      new Map(),
      energyCurve,
      trackClipData,
      trackNoteData,
      defaultThresholds,
    );

    expect(issues).toHaveLength(0);
  });

  it("detects gap when both conditions are met (high similarity AND low energy delta)", () => {
    const sections = [
      makeSection("s0", "Verse 1", 0, 16),
      makeSection("s1", "Verse 2", 16, 32),
    ];

    // Same tracks active in both → Jaccard = 1.0
    const trackClipData = makeUniformTrackClipData(["Bass", "Drums", "Lead"], 0, 32);

    // Similar density in both → density ratio ≈ 1.0
    const trackNoteData = makeUniformTrackNoteData(["Bass", "Drums", "Lead"], 0, 32, 16);

    // Flat energy → delta = 0 < 0.1
    const energyCurve = [0.6, 0.6];

    const issues = detectContrastGaps(
      sections,
      new Map(),
      energyCurve,
      trackClipData,
      trackNoteData,
      defaultThresholds,
    );

    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]!.type).toBe("contrast_gap");
    expect(issues[0]!.sectionIds).toContain("s0");
    expect(issues[0]!.sectionIds).toContain("s1");
  });

  it("assigns severity 'warning' with exactly 2 consecutive sections", () => {
    const sections = [
      makeSection("s0", "Verse 1", 0, 16),
      makeSection("s1", "Verse 2", 16, 32),
    ];

    const trackClipData = makeUniformTrackClipData(["Bass", "Drums"], 0, 32);
    const trackNoteData = makeUniformTrackNoteData(["Bass", "Drums"], 0, 32, 16);
    const energyCurve = [0.5, 0.5];

    const issues = detectContrastGaps(
      sections,
      new Map(),
      energyCurve,
      trackClipData,
      trackNoteData,
      defaultThresholds,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warning");
    expect(issues[0]!.sectionIds).toHaveLength(2);
  });

  it("assigns severity 'critical' with 3+ consecutive sections", () => {
    const sections = [
      makeSection("s0", "Verse 1", 0, 16),
      makeSection("s1", "Verse 2", 16, 32),
      makeSection("s2", "Verse 3", 32, 48),
    ];

    // All sections share the same tracks → high Jaccard
    const trackClipData = makeUniformTrackClipData(["Bass", "Drums", "Pad"], 0, 48);

    // Similar density across all sections
    const trackNoteData = makeUniformTrackNoteData(["Bass", "Drums", "Pad"], 0, 48, 24);

    // Flat energy across all 3
    const energyCurve = [0.5, 0.5, 0.5];

    const issues = detectContrastGaps(
      sections,
      new Map(),
      energyCurve,
      trackClipData,
      trackNoteData,
      defaultThresholds,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("critical");
    expect(issues[0]!.sectionIds).toHaveLength(3);
  });

  it("sectionIds contains all involved sections", () => {
    const sections = [
      makeSection("s0", "Intro", 0, 8),
      makeSection("s1", "Verse 1", 8, 24),
      makeSection("s2", "Verse 2", 24, 40),
      makeSection("s3", "Verse 3", 40, 56),
      makeSection("s4", "Outro", 56, 64),
    ];

    // All sections share the same tracks
    const trackClipData = makeUniformTrackClipData(["Bass", "Drums", "Lead", "Pad"], 0, 64);

    // Uniform density → high density ratio between all pairs
    const trackNoteData = makeUniformTrackNoteData(["Bass", "Drums", "Lead", "Pad"], 0, 64, 32);

    // Flat energy for all sections → all pairs have delta < threshold
    const energyCurve = [0.5, 0.5, 0.5, 0.5, 0.5];

    const issues = detectContrastGaps(
      sections,
      new Map(),
      energyCurve,
      trackClipData,
      trackNoteData,
      defaultThresholds,
    );

    // All 5 sections should be in one big run → single critical issue
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("critical");
    expect(issues[0]!.sectionIds).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });
});
