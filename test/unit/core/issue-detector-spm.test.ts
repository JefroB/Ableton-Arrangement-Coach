/**
 * Unit tests for Special Parser Mode (SPM) in the Issue Detector.
 *
 * Feature: m6-genre-integration, Task 4.3
 *
 * Validates:
 * - IDM profile triggers SPM: zero flat-energy/repetition/abrupt-change/intro-length/outro-length
 * - Glitch profile triggers same suppressions, frequency-crowding still fires
 * - Techno (non-permissive) produces normal issues
 * - Energy-mismatch behavior in SPM context
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9
 */
import { describe, it, expect } from "vitest";
import { detectIssues, isSpecialParserMode } from "../../../src/core/issue-detector.js";
import { getProfile, getProfileBySubgenre } from "../../../src/core/genre-registry.js";
import type { IssueDetectorInput, IssueType } from "../../../src/core/issue-types.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { SectionAnalysisState } from "../../../src/state/store.js";
import type { TrackClipData, TrackNoteData } from "../../../src/core/section-analyzer.js";
import type { TrackInfo } from "../../../src/core/track-reader.js";
import type { FrequencyBucket } from "../../../src/core/track-categorizer.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

/** Issue types that must be suppressed in Special Parser Mode. */
const SUPPRESSED_TYPES: readonly IssueType[] = [
  "flat-energy",
  "repetition",
  "abrupt-change",
  "intro-length",
  "outro-length",
];

/**
 * Build a minimal IssueDetectorInput that is deliberately designed to
 * trigger multiple sub-detectors under normal operation.
 *
 * The arrangement has:
 * - 3 sections with short lengths (4 bars each → below DJ minimums)
 * - Flat energy curve (all sections same energy → triggers flat-energy)
 * - No transition elements between sections with energy jumps → triggers missing-transition
 * - Same tracks active in every section (high similarity → triggers repetition)
 * - Abrupt energy change between sections
 */
function buildIssueProneInput(genreId: string | null): IssueDetectorInput {
  // 3 sections, each 4 bars (16 beats), sequential
  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: 16 },
    { id: "section-1", name: "Main", startTime: 16, endTime: 32 },
    { id: "section-2", name: "Outro", startTime: 32, endTime: 48 },
  ];

  // Flat energy across all sections (energy = 5 for all)
  // This triggers flat-energy detection
  const energyCurve = [5, 5, 5];

  // Section analysis: identical across all sections to trigger repetition
  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  for (let i = 0; i < sections.length; i++) {
    sectionAnalysis.set(sections[i]!.id, {
      activeTrackCount: 3,
      midiDensity: 4.0,
      hasAutomation: false,
      energyScore: 5,
    });
  }

  // Track data: same 3 tracks active across all sections (triggers repetition)
  const trackClipData: TrackClipData[] = [
    {
      trackName: "Lead Synth",
      trackType: "midi",
      clips: [{ startTime: 0, endTime: 48, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Bass",
      trackType: "midi",
      clips: [{ startTime: 0, endTime: 48, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Drums",
      trackType: "audio",
      clips: [{ startTime: 0, endTime: 48, muted: false, hasEnvelopes: false }],
    },
  ];

  // Notes: identical density in every section → high similarity
  const trackNoteData: TrackNoteData[] = [
    {
      trackName: "Lead Synth",
      notes: Array.from({ length: 12 }, (_, i) => ({
        pitch: 60 + (i % 12),
        startTime: (i % 4) * 4,
        duration: 0.5,
        velocity: 80,
      })),
    },
    {
      trackName: "Bass",
      notes: Array.from({ length: 12 }, (_, i) => ({
        pitch: 36 + (i % 12),
        startTime: (i % 4) * 4,
        duration: 1,
        velocity: 100,
      })),
    },
  ];

  const trackBuckets: FrequencyBucket[] = ["mid", "bass", "high"];
  const trackInventory: TrackInfo[] = [
    { name: "Lead Synth", type: "midi" },
    { name: "Bass", type: "midi" },
    { name: "Drums", type: "audio" },
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
 * Build an input designed to trigger frequency-crowding issues.
 * Places 5+ tracks in the same frequency bucket active in the same section.
 */
function buildFrequencyCrowdingInput(genreId: string | null): IssueDetectorInput {
  const sections: Section[] = [
    { id: "section-0", name: "Main", startTime: 0, endTime: 64 },
  ];

  const energyCurve = [7];

  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  sectionAnalysis.set("section-0", {
    activeTrackCount: 5,
    midiDensity: 4.0,
    hasAutomation: false,
    energyScore: 7,
  });

  // 5 tracks all in the "mid" bucket → triggers frequency-crowding (warning threshold)
  const trackNames = ["Synth 1", "Synth 2", "Synth 3", "Synth 4", "Synth 5"];
  const trackClipData: TrackClipData[] = trackNames.map((name) => ({
    trackName: name,
    trackType: "midi" as const,
    clips: [{ startTime: 0, endTime: 64, muted: false, hasEnvelopes: false }],
  }));

  const trackBuckets: FrequencyBucket[] = ["mid", "mid", "mid", "mid", "mid"];
  const trackInventory: TrackInfo[] = trackNames.map((name) => ({
    name,
    type: "midi" as const,
  }));

  const trackNoteData: TrackNoteData[] = trackNames.map((name) => ({
    trackName: name,
    notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 80 }],
  }));

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
 * Build an input designed to trigger abrupt-change and missing-transition.
 * Uses large energy jumps between sections without transition elements.
 */
function buildAbruptChangeInput(genreId: string | null): IssueDetectorInput {
  const sections: Section[] = [
    { id: "section-0", name: "Intro", startTime: 0, endTime: 128 },
    { id: "section-1", name: "Drop", startTime: 128, endTime: 256 },
    { id: "section-2", name: "Outro", startTime: 256, endTime: 384 },
  ];

  // Large energy jumps: 2 → 9 → 2 (abrupt changes)
  const energyCurve = [2, 9, 2];

  const sectionAnalysis = new Map<string, SectionAnalysisState>();
  sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 2 });
  sectionAnalysis.set("section-1", { activeTrackCount: 6, midiDensity: 8, hasAutomation: true, energyScore: 9 });
  sectionAnalysis.set("section-2", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 2 });

  // Different tracks in each section (avoids repetition, but triggers abrupt changes)
  const trackClipData: TrackClipData[] = [
    {
      trackName: "Pad",
      trackType: "midi",
      clips: [{ startTime: 0, endTime: 128, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Lead",
      trackType: "midi",
      clips: [{ startTime: 128, endTime: 256, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Bass",
      trackType: "midi",
      clips: [{ startTime: 128, endTime: 256, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Kick",
      trackType: "audio",
      clips: [{ startTime: 128, endTime: 256, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Perc",
      trackType: "audio",
      clips: [{ startTime: 128, endTime: 256, muted: false, hasEnvelopes: false }],
    },
    {
      trackName: "Ambient",
      trackType: "audio",
      clips: [{ startTime: 256, endTime: 384, muted: false, hasEnvelopes: false }],
    },
  ];

  const trackNoteData: TrackNoteData[] = [
    { trackName: "Pad", notes: [{ pitch: 60, startTime: 0, duration: 4, velocity: 60 }] },
    { trackName: "Lead", notes: [{ pitch: 72, startTime: 128, duration: 0.5, velocity: 100 }] },
    { trackName: "Bass", notes: [{ pitch: 36, startTime: 128, duration: 1, velocity: 100 }] },
  ];

  const trackBuckets: FrequencyBucket[] = ["mid", "high-mid", "bass", "sub", "high", "mid"];
  const trackInventory: TrackInfo[] = [
    { name: "Pad", type: "midi" },
    { name: "Lead", type: "midi" },
    { name: "Bass", type: "midi" },
    { name: "Kick", type: "audio" },
    { name: "Perc", type: "audio" },
    { name: "Ambient", type: "audio" },
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

describe("Special Parser Mode — isSpecialParserMode helper", () => {
  it("returns true for IDM profile (has standard-structure-not-applicable rule)", () => {
    const profile = getProfileBySubgenre("idm");
    expect(profile).not.toBeNull();
    expect(isSpecialParserMode(profile)).toBe(true);
  });

  it("returns true for Glitch profile (has standard-structure-not-applicable rule)", () => {
    const profile = getProfileBySubgenre("glitch");
    expect(profile).not.toBeNull();
    expect(isSpecialParserMode(profile)).toBe(true);
  });

  it("returns true for IDM & Experimental family profile", () => {
    const profile = getProfile("idm-experimental");
    expect(profile).not.toBeNull();
    expect(isSpecialParserMode(profile)).toBe(true);
  });

  it("returns false for Techno profile (no standard-structure-not-applicable rule)", () => {
    const profile = getProfile("techno");
    expect(profile).not.toBeNull();
    expect(isSpecialParserMode(profile)).toBe(false);
  });

  it("returns false for null profile", () => {
    expect(isSpecialParserMode(null)).toBe(false);
  });
});

describe("Special Parser Mode — IDM suppression", () => {
  /**
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   *
   * When IDM is selected, flat-energy, repetition, abrupt-change,
   * intro-length, and outro-length sub-detectors are all suppressed.
   */
  it("produces zero flat-energy issues for IDM", () => {
    const input = buildIssueProneInput("idm");
    const issues = detectIssues(input);
    const flatEnergy = issues.filter((i) => i.type === "flat-energy");
    expect(flatEnergy).toHaveLength(0);
  });

  it("produces zero repetition issues for IDM", () => {
    const input = buildIssueProneInput("idm");
    const issues = detectIssues(input);
    const repetition = issues.filter((i) => i.type === "repetition");
    expect(repetition).toHaveLength(0);
  });

  it("produces zero abrupt-change issues for IDM", () => {
    const input = buildAbruptChangeInput("idm");
    const issues = detectIssues(input);
    const abruptChange = issues.filter((i) => i.type === "abrupt-change");
    expect(abruptChange).toHaveLength(0);
  });

  it("produces zero intro-length issues for IDM", () => {
    const input = buildIssueProneInput("idm");
    const issues = detectIssues(input);
    const introLength = issues.filter((i) => i.type === "intro-length");
    expect(introLength).toHaveLength(0);
  });

  it("produces zero outro-length issues for IDM", () => {
    const input = buildIssueProneInput("idm");
    const issues = detectIssues(input);
    const outroLength = issues.filter((i) => i.type === "outro-length");
    expect(outroLength).toHaveLength(0);
  });

  it("suppresses ALL specified types simultaneously", () => {
    const input = buildAbruptChangeInput("idm");
    const issues = detectIssues(input);
    const suppressedIssues = issues.filter((i) =>
      SUPPRESSED_TYPES.includes(i.type),
    );
    expect(suppressedIssues).toHaveLength(0);
  });
});

describe("Special Parser Mode — Glitch suppression with frequency-crowding", () => {
  /**
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
   *
   * Glitch triggers the same suppressions as IDM, but frequency-crowding
   * still fires because it is always relevant regardless of parser mode.
   */
  it("produces zero suppressed issue types for Glitch", () => {
    const input = buildAbruptChangeInput("glitch");
    const issues = detectIssues(input);
    const suppressedIssues = issues.filter((i) =>
      SUPPRESSED_TYPES.includes(i.type),
    );
    expect(suppressedIssues).toHaveLength(0);
  });

  it("frequency-crowding still fires in Glitch SPM when conditions are met", () => {
    const input = buildFrequencyCrowdingInput("glitch");
    const issues = detectIssues(input);
    const crowding = issues.filter((i) => i.type === "frequency-crowding");
    expect(crowding.length).toBeGreaterThan(0);
  });

  it("frequency-crowding still fires in IDM SPM when conditions are met", () => {
    const input = buildFrequencyCrowdingInput("idm");
    const issues = detectIssues(input);
    const crowding = issues.filter((i) => i.type === "frequency-crowding");
    expect(crowding.length).toBeGreaterThan(0);
  });
});

describe("Special Parser Mode — Techno (non-permissive) produces normal issues", () => {
  /**
   * Validates: Requirement 2.9
   *
   * Techno does NOT have the "standard-structure-not-applicable" rule,
   * so all sub-detectors operate normally and produce issues when
   * conditions are met.
   */
  it("Techno produces abrupt-change issues when energy jumps are large", () => {
    const input = buildAbruptChangeInput("techno");
    const issues = detectIssues(input);
    const abruptChange = issues.filter((i) => i.type === "abrupt-change");
    expect(abruptChange.length).toBeGreaterThan(0);
  });

  it("Techno produces missing-transition issues when no transition elements", () => {
    const input = buildAbruptChangeInput("techno");
    const issues = detectIssues(input);
    const missing = issues.filter((i) => i.type === "missing-transition");
    expect(missing.length).toBeGreaterThan(0);
  });

  it("Techno produces intro-length issues when intro is too short", () => {
    // Techno has min intro bars = 16. Our input has 128-beat (32-bar) sections,
    // so let's make a shorter intro.
    const input = buildIssueProneInput("techno");
    // Sections are 4 bars (16 beats) — well below Techno's 16-bar minimum
    const issues = detectIssues(input);
    const introLength = issues.filter((i) => i.type === "intro-length");
    expect(introLength.length).toBeGreaterThan(0);
  });

  it("Techno produces outro-length issues when outro is too short", () => {
    const input = buildIssueProneInput("techno");
    const issues = detectIssues(input);
    const outroLength = issues.filter((i) => i.type === "outro-length");
    expect(outroLength.length).toBeGreaterThan(0);
  });

  it("Techno produces frequency-crowding issues when bucket is overloaded", () => {
    const input = buildFrequencyCrowdingInput("techno");
    const issues = detectIssues(input);
    const crowding = issues.filter((i) => i.type === "frequency-crowding");
    expect(crowding.length).toBeGreaterThan(0);
  });
});

describe("Special Parser Mode — energy-mismatch behavior", () => {
  /**
   * Validates: Requirement 2.8
   *
   * Energy-mismatch is produced by the DJ Compatibility sub-detector,
   * which only runs for DJ-oriented genres (techno, house, trance, drum-and-bass).
   * SPM genres (IDM, Glitch) are not DJ-oriented, so energy-mismatch is not
   * directly testable through them. However, we verify:
   * 1. DJ genres in standard mode produce energy-mismatch when conditions met
   * 2. SPM genres do not produce energy-mismatch (they are non-DJ genres)
   */
  it("DJ genre (Techno) produces energy-mismatch when outro energy >> intro energy", () => {
    // Build input with energy mismatch: first=2, last=8 (delta > 2)
    const sections: Section[] = [
      { id: "section-0", name: "Intro", startTime: 0, endTime: 256 },
      { id: "section-1", name: "Outro", startTime: 256, endTime: 512 },
    ];
    const energyCurve = [2, 8];

    const sectionAnalysis = new Map<string, SectionAnalysisState>();
    sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 2 });
    sectionAnalysis.set("section-1", { activeTrackCount: 4, midiDensity: 6, hasAutomation: true, energyScore: 8 });

    const trackClipData: TrackClipData[] = [
      { trackName: "Pad", trackType: "midi", clips: [{ startTime: 0, endTime: 512, muted: false, hasEnvelopes: false }] },
      { trackName: "Kick", trackType: "audio", clips: [{ startTime: 0, endTime: 512, muted: false, hasEnvelopes: false }] },
    ];

    const trackNoteData: TrackNoteData[] = [
      { trackName: "Pad", notes: [{ pitch: 60, startTime: 0, duration: 4, velocity: 60 }] },
    ];

    const input: IssueDetectorInput = {
      sections,
      sectionAnalysis,
      energyCurve,
      trackInventory: [
        { name: "Pad", type: "midi" },
        { name: "Kick", type: "audio" },
      ],
      trackClipData,
      trackNoteData,
      trackBuckets: ["mid", "sub"],
      selectedGenre: "techno",
    };

    const issues = detectIssues(input);
    const mismatch = issues.filter((i) => i.type === "energy-mismatch");
    expect(mismatch.length).toBeGreaterThan(0);
    expect(mismatch[0]!.severity).toBe("info");
  });

  it("SPM genre (IDM) does not produce energy-mismatch (not a DJ genre)", () => {
    // IDM is not a DJ-oriented genre, so DJ compatibility checks don't run
    const sections: Section[] = [
      { id: "section-0", name: "Opening", startTime: 0, endTime: 256 },
      { id: "section-1", name: "Resolution", startTime: 256, endTime: 512 },
    ];
    const energyCurve = [2, 9]; // large mismatch

    const sectionAnalysis = new Map<string, SectionAnalysisState>();
    sectionAnalysis.set("section-0", { activeTrackCount: 2, midiDensity: 2, hasAutomation: false, energyScore: 2 });
    sectionAnalysis.set("section-1", { activeTrackCount: 5, midiDensity: 8, hasAutomation: true, energyScore: 9 });

    const trackClipData: TrackClipData[] = [
      { trackName: "Texture", trackType: "audio", clips: [{ startTime: 0, endTime: 512, muted: false, hasEnvelopes: false }] },
    ];

    const input: IssueDetectorInput = {
      sections,
      sectionAnalysis,
      energyCurve,
      trackInventory: [{ name: "Texture", type: "audio" }],
      trackClipData,
      trackNoteData: [],
      trackBuckets: ["mid"],
      selectedGenre: "idm",
    };

    const issues = detectIssues(input);
    const mismatch = issues.filter((i) => i.type === "energy-mismatch");
    expect(mismatch).toHaveLength(0);
  });
});
