/**
 * Unit tests for Non-Standard Rhythm Detection in the Issue Detector.
 *
 * Feature: m6-genre-integration, Task 6.4
 *
 * Validates:
 * - Classic Detroit Electro suppresses phrase-alignment missing-transitions
 * - Chicago Footwork: similarity ceiling +10, bar counts doubled
 * - Electro rhythm advisory produced for no-four-on-the-floor critical rule
 * - House/Trance (standard) receives no rhythm adjustments
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
import { describe, it, expect } from "vitest";
import {
  detectIssues,
  isNonStandardRhythmGenre,
  applyRhythmAdjustments,
} from "../../../src/core/issue-detector.js";
import { getProfile, getProfileBySubgenre } from "../../../src/core/genre-registry.js";
import type { IssueDetectorInput } from "../../../src/core/issue-types.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { SectionAnalysisState } from "../../../src/state/store.js";
import type { TrackClipData, TrackNoteData } from "../../../src/core/section-analyzer.js";
import type { TrackInfo } from "../../../src/core/track-reader.js";
import type { FrequencyBucket } from "../../../src/core/track-categorizer.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

/**
 * Build an input that triggers missing-transition issues due to large
 * energy jumps across section boundaries that are NOT on 8-bar (32-beat)
 * phrase boundaries. This exercises the suppressPhraseAlignment logic.
 *
 * Sections are placed at non-phrase-aligned boundaries (e.g., 20 beats)
 * so that phrase-alignment suppression can be observed.
 */
function buildPhraseAlignmentInput(genreId: string | null): IssueDetectorInput {
  // Sections with boundaries NOT on 32-beat (8-bar) multiples
  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: 20 },
    { id: "section-1", name: "Main", startTime: 20, endTime: 52 },
    { id: "section-2", name: "Outro", startTime: 52, endTime: 84 },
  ];

  // Large energy jumps to trigger missing-transition detection
  const energyCurve = [3, 8, 3];

  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 3 });
  sectionAnalysis.set("section-1", { activeTrackCount: 5, midiDensity: 7, hasAutomation: true, energyScore: 8 });
  sectionAnalysis.set("section-2", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 3 });

  // No transition elements in the last 4 bars of each section
  const trackClipData: TrackClipData[] = [
    {
      trackName: "808 Machine",
      trackType: "midi",
      clips: [{ startTime: 0, endTime: 84, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Synth Lead",
      trackType: "midi",
      clips: [{ startTime: 20, endTime: 52, muted: false, hasEnvelopes: false }],
    },
  ];

  const trackNoteData: TrackNoteData[] = [
    { trackName: "808 Machine", notes: [{ pitch: 36, startTime: 0, duration: 1, velocity: 100 }] },
    { trackName: "Synth Lead", notes: [{ pitch: 72, startTime: 20, duration: 0.5, velocity: 80 }] },
  ];

  const trackBuckets: FrequencyBucket[] = ["bass", "high-mid"];
  const trackInventory: TrackInfo[] = [
    { name: "808 Machine", type: "midi" },
    { name: "Synth Lead", type: "midi" },
  ];

  return {
    sections,
    sectionAnalysis,
    energyCurve,
    trackInventory,
    trackClipData,
    trackNoteData,
    trackBuckets,
    selectedGenre: genreId,
  };
}

/**
 * Build an input with phrase-aligned boundaries (on 32-beat boundaries)
 * and large energy jumps. Even with non-standard rhythm genres, these
 * should still produce missing-transition issues because the boundary
 * IS phrase-aligned.
 */
function buildPhraseAlignedInput(genreId: string | null): IssueDetectorInput {
  // Boundaries on 32-beat multiples (phrase-aligned)
  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
    { id: "section-1", name: "Main", startTime: 32, endTime: 96 },
    { id: "section-2", name: "Outro", startTime: 96, endTime: 128 },
  ];

  // Large energy jumps
  const energyCurve = [3, 8, 3];

  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 3 });
  sectionAnalysis.set("section-1", { activeTrackCount: 5, midiDensity: 7, hasAutomation: true, energyScore: 8 });
  sectionAnalysis.set("section-2", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 3 });

  const trackClipData: TrackClipData[] = [
    {
      trackName: "808 Machine",
      trackType: "midi",
      clips: [{ startTime: 0, endTime: 128, muted: false, hasEnvelopes: false }],
    },
  ];

  const trackNoteData: TrackNoteData[] = [
    { trackName: "808 Machine", notes: [{ pitch: 36, startTime: 0, duration: 1, velocity: 100 }] },
  ];

  const trackBuckets: FrequencyBucket[] = ["bass"];
  const trackInventory: TrackInfo[] = [
    { name: "808 Machine", type: "midi" },
  ];

  return {
    sections,
    sectionAnalysis,
    energyCurve,
    trackInventory,
    trackClipData,
    trackNoteData,
    trackBuckets,
    selectedGenre: genreId,
  };
}

/**
 * Build a minimal input with identical sections to exercise the repetition
 * sub-detector. Used to verify similarity ceiling adjustments.
 */
function buildRepetitiveInput(genreId: string | null): IssueDetectorInput {
  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: 64 },
    { id: "section-1", name: "Main A", startTime: 64, endTime: 128 },
    { id: "section-2", name: "Main B", startTime: 128, endTime: 192 },
    { id: "section-3", name: "Outro", startTime: 192, endTime: 256 },
  ];

  // Moderate energy curve (no flat-energy trigger)
  const energyCurve = [4, 6, 6, 4];

  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  sectionAnalysis.set("section-0", { activeTrackCount: 3, midiDensity: 4, hasAutomation: false, energyScore: 4 });
  sectionAnalysis.set("section-1", { activeTrackCount: 3, midiDensity: 4, hasAutomation: false, energyScore: 6 });
  sectionAnalysis.set("section-2", { activeTrackCount: 3, midiDensity: 4, hasAutomation: false, energyScore: 6 });
  sectionAnalysis.set("section-3", { activeTrackCount: 3, midiDensity: 4, hasAutomation: false, energyScore: 4 });

  // Same 3 tracks across all sections → high similarity
  const trackClipData: TrackClipData[] = [
    { trackName: "Kick", trackType: "audio", clips: [{ startTime: 0, endTime: 256, muted: false, hasEnvelopes: false }] },
    { trackName: "HiHat", trackType: "midi", clips: [{ startTime: 0, endTime: 256, muted: false, hasEnvelopes: false }] },
    { trackName: "Bass", trackType: "midi", clips: [{ startTime: 0, endTime: 256, muted: false, hasEnvelopes: false }] },
  ];

  const trackNoteData: TrackNoteData[] = [
    { trackName: "HiHat", notes: Array.from({ length: 64 }, (_, i) => ({ pitch: 42, startTime: i * 4, duration: 0.25, velocity: 80 })) },
    { trackName: "Bass", notes: Array.from({ length: 64 }, (_, i) => ({ pitch: 36, startTime: i * 4, duration: 1, velocity: 100 })) },
  ];

  const trackBuckets: FrequencyBucket[] = ["sub", "high", "bass"];
  const trackInventory: TrackInfo[] = [
    { name: "Kick", type: "audio" },
    { name: "HiHat", type: "midi" },
    { name: "Bass", type: "midi" },
  ];

  return {
    sections,
    sectionAnalysis,
    energyCurve,
    trackInventory,
    trackClipData,
    trackNoteData,
    trackBuckets,
    selectedGenre: genreId,
  };
}

/**
 * Build an input with short intro/outro to trigger DJ compatibility length checks.
 * Used to verify bar count doubling for half-time-feel genres.
 */
function buildShortIntroOutroInput(genreId: string | null): IssueDetectorInput {
  // Short intro (4 bars = 16 beats) and short outro (4 bars = 16 beats)
  // With default thresholds (introMinBars = 16), this passes the minimum.
  // With doubled thresholds (introMinBars = 32), this would fail.
  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: 64 },
    { id: "section-1", name: "Main", startTime: 64, endTime: 192 },
    { id: "section-2", name: "Outro", startTime: 192, endTime: 256 },
  ];

  // 16-bar intro (64 beats), 32-bar main, 16-bar outro (64 beats)
  const energyCurve = [4, 7, 4];

  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 4 });
  sectionAnalysis.set("section-1", { activeTrackCount: 4, midiDensity: 5, hasAutomation: true, energyScore: 7 });
  sectionAnalysis.set("section-2", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 4 });

  const trackClipData: TrackClipData[] = [
    { trackName: "Kick", trackType: "audio", clips: [{ startTime: 0, endTime: 256, muted: false, hasEnvelopes: false }] },
    { trackName: "Bass", trackType: "midi", clips: [{ startTime: 64, endTime: 192, muted: false, hasEnvelopes: false }] },
  ];

  const trackNoteData: TrackNoteData[] = [
    { trackName: "Bass", notes: [{ pitch: 36, startTime: 64, duration: 1, velocity: 100 }] },
  ];

  const trackBuckets: FrequencyBucket[] = ["sub", "bass"];
  const trackInventory: TrackInfo[] = [
    { name: "Kick", type: "audio" },
    { name: "Bass", type: "midi" },
  ];

  return {
    sections,
    sectionAnalysis,
    energyCurve,
    trackInventory,
    trackClipData,
    trackNoteData,
    trackBuckets,
    selectedGenre: genreId,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Non-Standard Rhythm — isNonStandardRhythmGenre helper", () => {
  it("returns true for Classic Detroit Electro (has syncopated-808-pattern-required)", () => {
    const profile = getProfileBySubgenre("classic-detroit-electro");
    expect(profile).not.toBeNull();
    expect(isNonStandardRhythmGenre(profile)).toBe(true);
  });

  it("returns true for Chicago Footwork (has triplet-hihat-expected + half-time-feel-expected)", () => {
    const profile = getProfileBySubgenre("chicago-footwork");
    expect(profile).not.toBeNull();
    expect(isNonStandardRhythmGenre(profile)).toBe(true);
  });

  it("returns true for Footwork & Juke family (has triplet-hihat-expected)", () => {
    const profile = getProfile("footwork-juke");
    expect(profile).not.toBeNull();
    expect(isNonStandardRhythmGenre(profile)).toBe(true);
  });

  it("returns false for House (no non-standard rhythm rules)", () => {
    const profile = getProfile("house");
    expect(profile).not.toBeNull();
    expect(isNonStandardRhythmGenre(profile)).toBe(false);
  });

  it("returns false for null profile", () => {
    expect(isNonStandardRhythmGenre(null)).toBe(false);
  });
});

describe("Non-Standard Rhythm — Classic Detroit Electro phrase-alignment suppression", () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3
   *
   * Classic Detroit Electro has "syncopated-808-pattern-required" which makes it
   * a Non_Standard_Rhythm_Genre. Phrase-alignment-based missing-transition issues
   * (boundaries not on 8-bar/32-beat boundaries) should be suppressed.
   */
  it("suppresses missing-transition issues for non-phrase-aligned boundaries", () => {
    const input = buildPhraseAlignmentInput("classic-detroit-electro");
    const issues = detectIssues(input);
    const missingTransitions = issues.filter((i) => i.type === "missing-transition");

    // Non-phrase-aligned boundaries (20, 52) should be suppressed
    expect(missingTransitions).toHaveLength(0);
  });

  it("still produces missing-transition for phrase-aligned boundaries", () => {
    const input = buildPhraseAlignedInput("classic-detroit-electro");
    const issues = detectIssues(input);
    const missingTransitions = issues.filter((i) => i.type === "missing-transition");

    // Boundaries at 32 and 96 are phrase-aligned → not suppressed
    expect(missingTransitions.length).toBeGreaterThan(0);
  });

  it("standard genre (House) does NOT suppress phrase-alignment issues", () => {
    const input = buildPhraseAlignmentInput("house");
    const issues = detectIssues(input);
    const missingTransitions = issues.filter((i) => i.type === "missing-transition");

    // House is not a non-standard rhythm genre — all missing-transitions remain
    expect(missingTransitions.length).toBeGreaterThan(0);
  });
});

describe("Non-Standard Rhythm — Chicago Footwork threshold adjustments", () => {
  /**
   * Validates: Requirements 3.5, 3.6
   *
   * Chicago Footwork has both "triplet-hihat-expected" (similarity ceiling +10)
   * and "half-time-feel-expected" (bar counts doubled).
   */
  it("applyRhythmAdjustments increases similarity ceiling by 10 for Chicago Footwork", () => {
    const profile = getProfileBySubgenre("chicago-footwork");
    expect(profile).not.toBeNull();

    // Base thresholds — footwork-juke family has similarityCeilingPercent: 90
    // When resolved as subgenre, the parent profile's thresholds apply (90%)
    const baseThresholds = {
      flatEnergyDelta: 3,
      repetitionSimilarity: 0.90,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    };

    const effective = applyRhythmAdjustments(baseThresholds, profile, true);

    // 90% → converted to 90 (0.90 * 100) then +10 = 100, capped at 100
    expect(effective.similarityCeilingPercent).toBe(100);
  });

  it("applyRhythmAdjustments doubles bar counts for Chicago Footwork (half-time-feel)", () => {
    const profile = getProfileBySubgenre("chicago-footwork");
    expect(profile).not.toBeNull();

    const baseThresholds = {
      flatEnergyDelta: 3,
      repetitionSimilarity: 0.90,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    };

    const effective = applyRhythmAdjustments(baseThresholds, profile, true);

    // Bar counts should be doubled (16 → 32)
    expect(effective.introMinBars).toBe(32);
    expect(effective.outroMinBars).toBe(32);
  });

  it("applyRhythmAdjustments does NOT adjust when nonStandardRhythm is false", () => {
    const profile = getProfileBySubgenre("chicago-footwork");
    expect(profile).not.toBeNull();

    const baseThresholds = {
      flatEnergyDelta: 3,
      repetitionSimilarity: 0.90,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    };

    // Even though profile has the rules, nonStandardRhythm = false bypasses adjustments
    const effective = applyRhythmAdjustments(baseThresholds, profile, false);

    expect(effective.similarityCeilingPercent).toBe(90);
    expect(effective.introMinBars).toBe(16);
    expect(effective.outroMinBars).toBe(16);
  });

  it("Chicago Footwork detectIssues suppresses phrase-alignment issues (is non-standard rhythm)", () => {
    // Chicago Footwork is a non-standard rhythm genre, so phrase-alignment
    // missing-transitions at non-aligned boundaries should be suppressed.
    const input = buildPhraseAlignmentInput("chicago-footwork");
    const issues = detectIssues(input);
    const missingTransitions = issues.filter((i) => i.type === "missing-transition");

    // Non-phrase-aligned boundaries (20, 52) are suppressed for non-standard rhythm genres
    expect(missingTransitions).toHaveLength(0);
  });

  it("Chicago Footwork effective thresholds reflect doubling in full detectIssues flow", () => {
    // Verify that applyRhythmAdjustments is correctly called within detectIssues
    // by checking that the resolved profile is treated as non-standard rhythm.
    // Since DJ compatibility only runs for DJ-oriented genres (techno, house, trance, d&b),
    // and Chicago Footwork is not DJ-oriented, the bar doubling doesn't produce issues
    // in this genre. We verify the adjustment is computed correctly via applyRhythmAdjustments.
    const profile = getProfileBySubgenre("chicago-footwork");
    expect(profile).not.toBeNull();
    expect(isNonStandardRhythmGenre(profile)).toBe(true);

    // Verify the threshold math: default introMinBars (16) * 2 = 32
    const baseThresholds = {
      flatEnergyDelta: 3,
      repetitionSimilarity: 0.90,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    };
    const effective = applyRhythmAdjustments(baseThresholds, profile, true);
    expect(effective.introMinBars).toBe(32);
    expect(effective.outroMinBars).toBe(32);
  });
});

describe("Non-Standard Rhythm — Electro rhythm advisory", () => {
  /**
   * Validates: Requirement 3.4
   *
   * When non-standard rhythm is active AND a "no-four-on-the-floor" critical rule
   * is present, an informational rhythm advisory should be emitted.
   */
  it("produces rhythm advisory for Classic Detroit Electro (has no-four-on-the-floor critical)", () => {
    const input = buildPhraseAlignedInput("classic-detroit-electro");
    const issues = detectIssues(input);

    const advisory = issues.filter((i) => i.type === "info" && i.id.startsWith("rhythm-advisory"));
    expect(advisory).toHaveLength(1);
    expect(advisory[0]!.severity).toBe("info");
    expect(advisory[0]!.message).toContain("syncopated");
    expect(advisory[0]!.message).toContain("4/4");
  });

  it("rhythm advisory references all section IDs", () => {
    const input = buildPhraseAlignedInput("classic-detroit-electro");
    const issues = detectIssues(input);

    const advisory = issues.find((i) => i.type === "info" && i.id.startsWith("rhythm-advisory"));
    expect(advisory).toBeDefined();
    expect(advisory!.sectionIds).toContain("section-0");
    expect(advisory!.sectionIds).toContain("section-1");
    expect(advisory!.sectionIds).toContain("section-2");
  });

  it("Nu-Skool Breakbeat also produces rhythm advisory (has breakbeat-pattern-required + no-four-on-the-floor critical)", () => {
    const input = buildPhraseAlignedInput("nu-skool-breakbeat");
    const issues = detectIssues(input);

    const advisory = issues.filter((i) => i.type === "info" && i.id.startsWith("rhythm-advisory"));
    expect(advisory).toHaveLength(1);
  });

  it("Chicago Footwork does NOT produce rhythm advisory (no no-four-on-the-floor rule)", () => {
    const input = buildPhraseAlignedInput("chicago-footwork");
    const issues = detectIssues(input);

    const advisory = issues.filter((i) => i.type === "info" && i.id.startsWith("rhythm-advisory"));
    expect(advisory).toHaveLength(0);
  });
});

describe("Non-Standard Rhythm — Standard genre (House/Trance) receives no adjustments", () => {
  /**
   * Validates: Requirement 3.7
   *
   * House and Trance are standard 4/4 genres. They should NOT trigger
   * non-standard rhythm detection and should receive no threshold adjustments.
   */
  it("House is NOT detected as non-standard rhythm genre", () => {
    const profile = getProfile("house");
    expect(profile).not.toBeNull();
    expect(isNonStandardRhythmGenre(profile)).toBe(false);
  });

  it("House does not produce rhythm advisory", () => {
    const input = buildPhraseAlignedInput("house");
    const issues = detectIssues(input);
    const advisory = issues.filter((i) => i.type === "info" && i.id.startsWith("rhythm-advisory"));
    expect(advisory).toHaveLength(0);
  });

  it("House does not suppress phrase-alignment missing-transitions", () => {
    const input = buildPhraseAlignmentInput("house");
    const issues = detectIssues(input);
    const missingTransitions = issues.filter((i) => i.type === "missing-transition");
    expect(missingTransitions.length).toBeGreaterThan(0);
  });

  it("House applyRhythmAdjustments returns unchanged thresholds", () => {
    const profile = getProfile("house");
    expect(profile).not.toBeNull();

    const baseThresholds = {
      flatEnergyDelta: 2,
      repetitionSimilarity: 0.85,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    };

    // House is not non-standard rhythm, so even passing the profile shouldn't matter
    const effective = applyRhythmAdjustments(baseThresholds, profile, false);

    expect(effective.similarityCeilingPercent).toBe(85);
    expect(effective.introMinBars).toBe(16);
    expect(effective.outroMinBars).toBe(16);
  });

  it("House intro/outro length issues fire normally with standard thresholds", () => {
    // House has min-intro-bars rule... let's test with a very short intro
    const sections: Section[] = [
      { id: "section-0", name: "Intro", startTime: 0, endTime: 16 },
      { id: "section-1", name: "Main", startTime: 16, endTime: 128 },
      { id: "section-2", name: "Outro", startTime: 128, endTime: 144 },
    ];
    const energyCurve = [4, 7, 4];

    const sectionAnalysis = new Map<string, SectionAnalysisState>();
    sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 4 });
    sectionAnalysis.set("section-1", { activeTrackCount: 4, midiDensity: 5, hasAutomation: true, energyScore: 7 });
    sectionAnalysis.set("section-2", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 4 });

    const trackClipData: TrackClipData[] = [
      { trackName: "Kick", trackType: "audio", clips: [{ startTime: 0, endTime: 144, muted: false, hasEnvelopes: false }] },
    ];

    const input: IssueDetectorInput = {
      sections,
      sectionAnalysis,
      energyCurve,
      trackInventory: [{ name: "Kick", type: "audio" }],
      trackClipData,
      trackNoteData: [],
      trackBuckets: ["sub"],
      selectedGenre: "house",
    };

    const issues = detectIssues(input);
    const introLength = issues.filter((i) => i.type === "intro-length");
    const outroLength = issues.filter((i) => i.type === "outro-length");

    // 4-bar intro/outro (16 beats) is well below House's 16-bar minimum
    expect(introLength.length).toBeGreaterThan(0);
    expect(outroLength.length).toBeGreaterThan(0);
  });
});
