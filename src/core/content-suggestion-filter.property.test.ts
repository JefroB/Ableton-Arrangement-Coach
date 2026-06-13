/**
 * Property-based tests for content-suggestion-filter.ts
 *
 * Feature: midi-content-analysis
 *
 * Property 12: Fill Suggestion Suppression
 * Property 13: Build Suggestion Suppression with Refinement
 * Property 14: Extended Repetition Triggers Variation Suggestion
 * Property 15: Shared Pattern Suppression for Matching Structural Roles
 * Property 16: Role Name in Suggestion Text
 * Property 24: Genre-Aware Missing Element Suggestion
 * Property 25: Genre-Aware Variation Suggestion
 * Property 26: Drum Element Names in Suggestions
 * Property 27: Graceful Fallback Without DrumPadMap
 * Property 28: Genre-Agnostic Fallback
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 9.1–9.7
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { filterSuggestionsWithContent, generateVariationSuggestions, generatePercussionSuggestions } from "./content-suggestion-filter.js";
import type { RawSuggestion } from "./suggestion-renderer.js";
import type { Section } from "./section-scanner.js";
import type {
  ContentAnalysisResult,
  TrackContentAnalysis,
  PatternFingerprint,
  CrossSectionComparison,
  TrackRepetitionSummary,
  FillDetection,
  BuildDetection,
  InstrumentRole,
  DrumPadMap,
  DrumPadEntry,
  DrumElementCategory,
  DrumElementProfile,
} from "./content-analysis-types.js";

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/** Structural role prefixes for section names. */
const STRUCTURAL_ROLES = ["Verse", "Chorus", "Bridge", "Breakdown", "Drop", "Intro", "Outro"];

/** Generate a section name with a structural role and numeric suffix. */
function arbSectionName(): fc.Arbitrary<string> {
  return fc.tuple(
    fc.constantFrom(...STRUCTURAL_ROLES),
    fc.integer({ min: 1, max: 8 }),
  ).map(([role, num]) => `${role} ${num}`);
}

/** Generate a pair of section names with the SAME structural role. */
function arbSameRolePair(): fc.Arbitrary<[string, string]> {
  return fc.tuple(
    fc.constantFrom(...STRUCTURAL_ROLES),
    fc.integer({ min: 1, max: 4 }),
    fc.integer({ min: 5, max: 8 }),
  ).map(([role, numA, numB]) => [`${role} ${numA}`, `${role} ${numB}`]);
}

/** Generate a pair of section names with DIFFERENT structural roles. */
function arbDifferentRolePair(): fc.Arbitrary<[string, string]> {
  return fc.tuple(
    fc.constantFrom(...STRUCTURAL_ROLES),
    fc.constantFrom(...STRUCTURAL_ROLES),
    fc.integer({ min: 1, max: 4 }),
    fc.integer({ min: 1, max: 4 }),
  ).filter(([roleA, roleB]) => roleA !== roleB)
    .map(([roleA, roleB, numA, numB]) => [`${roleA} ${numA}`, `${roleB} ${numB}`]);
}

/** Generate a fill suggestion keyword phrase. */
function arbFillKeyword(): fc.Arbitrary<string> {
  return fc.constantFrom("add a fill", "add fill", "try a fill", "insert a fill", "place a fill");
}

/** Generate a build/riser suggestion keyword phrase. */
function arbBuildKeyword(): fc.Arbitrary<string> {
  return fc.constantFrom(
    "add a build", "add a riser", "add build", "add riser",
    "insert a riser", "try a riser", "try a build",
    "include a riser", "include a build",
  );
}

/** Generate a valid FillDetection. */
function arbFillDetection(): fc.Arbitrary<FillDetection> {
  return fc.record({
    position: fc.integer({ min: 0, max: 60 }),
    durationBars: fc.constantFrom(1, 2),
    phraseInterval: fc.constantFrom(4, 8, 16),
    triggerType: fc.constantFrom("density" as const, "new-pitches" as const, "both" as const),
    drumElements: fc.constantFrom(null, ["snare", "tom"] as const),
  });
}

/** Generate a valid BuildDetection. */
function arbBuildDetection(sectionStart: number): fc.Arbitrary<BuildDetection> {
  return fc.record({
    trackName: fc.constantFrom("Drums", "Bass", "Lead Synth", "Riser FX"),
    startPosition: fc.constant(sectionStart + 48),
    durationBars: fc.constantFrom(2, 3, 4),
    type: fc.constantFrom("density" as const, "velocity" as const, "pitch-range" as const, "combined" as const),
    targetBoundary: fc.constant(sectionStart + 64),
  });
}

/** Generate a non-unclassified instrument role. */
function arbKnownRole(): fc.Arbitrary<InstrumentRole> {
  return fc.constantFrom("drums" as const, "bass" as const, "lead" as const, "pad" as const, "arpeggio" as const, "chord" as const);
}

/** Generate a PatternFingerprint. */
function arbFingerprint(): fc.Arbitrary<PatternFingerprint> {
  return fc.record({
    pitchClasses: fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { minLength: 1, maxLength: 7 }).map(arr => new Set(arr)),
    rhythmicPositions: fc.uniqueArray(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 8 }),
    velocityContour: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 8 }),
    density: fc.double({ min: 0.1, max: 10, noNaN: true }),
    barCount: fc.integer({ min: 1, max: 16 }),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeSections(names: string[]): Section[] {
  return names.map((name, i) => ({
    id: `section-${i}`,
    name,
    startTime: i * 64,
    endTime: (i + 1) * 64,
  }));
}

function makeTrackAnalysis(overrides: Partial<TrackContentAnalysis> = {}): TrackContentAnalysis {
  return {
    role: "drums",
    fingerprint: {
      pitchClasses: new Set([0, 4, 7]),
      rhythmicPositions: [0, 4, 8, 12],
      velocityContour: [0.5, 0.6, 0.5, 0.6],
      density: 2.0,
      barCount: 4,
    },
    percussionPattern: null,
    build: null,
    drumElementProfile: null,
    ...overrides,
  };
}

function makeContentAnalysis(overrides: Partial<ContentAnalysisResult> = {}): ContentAnalysisResult {
  return {
    perSection: new Map(),
    crossSection: new Map(),
    repetitionSummary: new Map(),
    phraseLengths: new Map(),
    percussionSnapshots: new Map(),
    percussionDiscontinuities: [],
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<RawSuggestion> = {}): RawSuggestion {
  return {
    issueType: "missing-transition",
    sectionName: "Verse 1",
    barRange: { start: 0, end: 16 },
    severity: "warning",
    ...overrides,
  };
}

// ─── Property 12: Fill Suggestion Suppression ────────────────────────────


describe("Property 12: Fill Suggestion Suppression", () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any section where the Content_Analyzer has detected a fill at a phrase
   * boundary, the suggestion filter SHALL suppress any "add a fill" suggestion
   * targeting that boundary.
   */
  test.prop(
    [
      arbFillKeyword(),
      arbSectionName(),
      arbFillDetection(),
    ],
    { numRuns: 100 },
  )(
    "fill suggestions are suppressed when fill exists at boundary",
    (fillKeyword, sectionName, fill) => {
      const sections = makeSections([sectionName, "Next Section"]);

      // Set up content analysis with a fill detection in the drums track
      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        percussionPattern: {
          classification: "loop",
          phraseLength: fill.phraseInterval,
          fills: [fill],
        },
      });

      const perSection = new Map([
        ["section-0", new Map([["Drums", drumAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: fillKeyword,
          sectionName,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // The fill suggestion should be suppressed (not in output)
      expect(result).toHaveLength(0);
    },
  );

  test.prop(
    [
      arbFillKeyword(),
      arbSectionName(),
    ],
    { numRuns: 100 },
  )(
    "fill suggestions are preserved when no fill exists",
    (fillKeyword, sectionName) => {
      const sections = makeSections([sectionName, "Next Section"]);

      // Content analysis with drums but NO fills detected
      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        percussionPattern: {
          classification: "loop",
          phraseLength: 4,
          fills: [], // No fills
        },
      });

      const perSection = new Map([
        ["section-0", new Map([["Drums", drumAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: fillKeyword,
          sectionName,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // The fill suggestion should be preserved
      expect(result).toHaveLength(1);
    },
  );
});

// ─── Property 13: Build Suggestion Suppression with Refinement ──────────

describe("Property 13: Build Suggestion Suppression with Refinement", () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any section boundary where the Content_Analyzer has detected a Build,
   * the suggestion filter SHALL suppress "add a build" and "add a riser"
   * suggestions at that boundary, and any replacement suggestion SHALL be a
   * refinement (issueType contains "refinement").
   */
  test.prop(
    [
      arbBuildKeyword(),
      arbSectionName(),
      fc.constantFrom("density" as const, "velocity" as const, "pitch-range" as const, "combined" as const),
      fc.constantFrom("Drums", "Bass", "Lead Synth", "Riser FX"),
    ],
    { numRuns: 100 },
  )(
    "build/riser suggestions are replaced with refinement when build exists",
    (buildKeyword, sectionName, buildType, trackName) => {
      const sections = makeSections([sectionName, "Next Section"]);

      const buildAnalysis = makeTrackAnalysis({
        role: "bass",
        build: {
          trackName,
          startPosition: 48,
          durationBars: 4,
          type: buildType,
          targetBoundary: 64,
        },
      });

      const perSection = new Map([
        ["section-0", new Map([[trackName, buildAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: buildKeyword,
          sectionName,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // Should have exactly one suggestion: the refinement replacement
      expect(result).toHaveLength(1);
      // The replacement should contain "refinement" in issueType
      expect(result[0]!.issueType).toContain("refinement");
      // The replacement should preserve the section name
      expect(result[0]!.sectionName).toBe(sectionName);
      // The replacement should be "info" severity (less urgent than original)
      expect(result[0]!.severity).toBe("info");
    },
  );

  test.prop(
    [
      arbBuildKeyword(),
      arbSectionName(),
    ],
    { numRuns: 100 },
  )(
    "build/riser suggestions are preserved when no build exists",
    (buildKeyword, sectionName) => {
      const sections = makeSections([sectionName, "Next Section"]);

      // No build in the analysis
      const noBuildAnalysis = makeTrackAnalysis({ role: "bass", build: null });
      const perSection = new Map([
        ["section-0", new Map([["Bass", noBuildAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: buildKeyword,
          sectionName,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // The build suggestion should be preserved (not replaced)
      expect(result).toHaveLength(1);
      expect(result[0]!.issueType).toBe(buildKeyword);
    },
  );
});

// ─── Property 15: Shared Pattern Suppression for Matching Structural Roles ──

describe("Property 15: Shared Pattern Suppression for Matching Structural Roles", () => {
  /**
   * **Validates: Requirements 6.5**
   *
   * For any two consecutive sections with "shared pattern" classification where
   * both section names indicate the same structural role (e.g., both contain
   * "Verse" or both contain "Chorus"), the suggestion engine SHALL NOT produce
   * a repetition problem suggestion for this pair.
   */
  test.prop(
    [
      arbSameRolePair(),
      fc.constantFrom("Drums", "Bass", "Synth", "Lead"),
    ],
    { numRuns: 100 },
  )(
    "repetition is suppressed when shared pattern between same structural roles",
    ([sectionNameA, sectionNameB], trackName) => {
      const sections = makeSections([sectionNameA, sectionNameB]);

      // Cross-section comparison shows "shared" between the two sections
      const crossSection = new Map([
        [
          trackName,
          [{
            sectionIndexA: 0,
            sectionIndexB: 1,
            similarity: 0.90,
            classification: "shared" as const,
          }],
        ],
      ]);

      const contentAnalysis = makeContentAnalysis({ crossSection });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: "repetition",
          sectionName: sectionNameA,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // Repetition suggestion should be suppressed for same-role pairs
      expect(result).toHaveLength(0);
    },
  );

  test.prop(
    [
      arbDifferentRolePair(),
      fc.constantFrom("Drums", "Bass", "Synth", "Lead"),
    ],
    { numRuns: 100 },
  )(
    "repetition is preserved when shared pattern between different structural roles",
    ([sectionNameA, sectionNameB], trackName) => {
      const sections = makeSections([sectionNameA, sectionNameB]);

      // Cross-section comparison shows "shared" but roles differ
      const crossSection = new Map([
        [
          trackName,
          [{
            sectionIndexA: 0,
            sectionIndexB: 1,
            similarity: 0.90,
            classification: "shared" as const,
          }],
        ],
      ]);

      const contentAnalysis = makeContentAnalysis({ crossSection });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: "repetition",
          sectionName: sectionNameA,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // Repetition suggestion should be preserved (different roles = legitimate issue)
      expect(result).toHaveLength(1);
    },
  );
});

// ─── Property 16: Role Name in Suggestion Text ──────────────────────────

describe("Property 16: Role Name in Suggestion Text", () => {
  /**
   * **Validates: Requirements 6.6**
   *
   * For any repetition suggestion that is NOT suppressed and the content
   * analysis has repetition data with a non-"unclassified" role, the output
   * suggestion's issueType should contain the role name.
   */
  test.prop(
    [
      arbKnownRole(),
      arbDifferentRolePair(),
      fc.constantFrom("Drums", "Bass", "Lead Synth", "Pad Track"),
    ],
    { numRuns: 100 },
  )(
    "non-suppressed repetition suggestion includes role name when role is known",
    (role, [sectionNameA, sectionNameB], trackName) => {
      const sections = makeSections([sectionNameA, sectionNameB, "Extra Section"]);

      // Track analysis with the specified role
      const trackAnalysis = makeTrackAnalysis({ role });
      const perSection = new Map([
        ["section-0", new Map([[trackName, trackAnalysis]])],
        ["section-1", new Map([[trackName, trackAnalysis]])],
      ]);

      // Cross-section comparison between DIFFERENT roles (so not suppressed)
      const crossSection = new Map([
        [
          trackName,
          [{
            sectionIndexA: 0,
            sectionIndexB: 1,
            similarity: 0.90,
            classification: "shared" as const,
          }],
        ],
      ]);

      // Repetition summary confirms extended repetition with the track role
      const repetitionSummary = new Map<string, TrackRepetitionSummary>([
        [
          trackName,
          {
            role,
            sharedGroups: [[0, 1]],
            uniqueSections: [],
            hasExtendedRepetition: true,
            extendedRepetitionSections: [0, 1, 2],
          },
        ],
      ]);

      const contentAnalysis = makeContentAnalysis({
        perSection,
        crossSection,
        repetitionSummary,
      });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: "repetition",
          sectionName: sectionNameA,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // The suggestion should still be present (not suppressed by same-role logic)
      expect(result.length).toBeGreaterThanOrEqual(1);

      // The enriched suggestion's issueType should contain the role name
      const roleName = role === "drums" ? "drums" :
                       role === "bass" ? "bass" :
                       role === "lead" ? "lead" :
                       role === "pad" ? "pad" :
                       role === "arpeggio" ? "arpeggio" :
                       "chord";
      expect(result[0]!.issueType).toContain(roleName);
    },
  );

  test.prop(
    [
      arbDifferentRolePair(),
      fc.constantFrom("Mystery Track", "Unknown"),
    ],
    { numRuns: 100 },
  )(
    "repetition suggestion without known role does not get enriched with role name",
    ([sectionNameA, sectionNameB], trackName) => {
      const sections = makeSections([sectionNameA, sectionNameB]);

      // Track analysis with "unclassified" role
      const trackAnalysis = makeTrackAnalysis({ role: "unclassified" });
      const perSection = new Map([
        ["section-0", new Map([[trackName, trackAnalysis]])],
      ]);

      // Different roles so not suppressed
      const crossSection = new Map([
        [
          trackName,
          [{
            sectionIndexA: 0,
            sectionIndexB: 1,
            similarity: 0.90,
            classification: "shared" as const,
          }],
        ],
      ]);

      const contentAnalysis = makeContentAnalysis({
        perSection,
        crossSection,
      });

      const suggestions: RawSuggestion[] = [
        makeSuggestion({
          issueType: "repetition",
          sectionName: sectionNameA,
          barRange: { start: 0, end: 16 },
        }),
      ];

      const result = filterSuggestionsWithContent(suggestions, contentAnalysis, sections, null);

      // Suggestion should be present
      expect(result.length).toBeGreaterThanOrEqual(1);

      // The issueType should remain "repetition" without a role enrichment
      // (unclassified -> uses "track" display name, which we don't append)
      expect(result[0]!.issueType).toBe("repetition");
    },
  );
});


// ─── Property 14: Extended Repetition Triggers Variation Suggestion ──────

describe("Property 14: Extended Repetition Triggers Variation Suggestion", () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * When `generateVariationSuggestions` receives content analysis with a repetition
   * summary that has `hasExtendedRepetition === true` and 3+ sections in
   * `extendedRepetitionSections`, it should produce at least one suggestion with
   * issueType containing "variation" and the role name.
   */
  test.prop(
    [
      arbKnownRole(),
      fc.constantFrom("Drums", "Bass", "Lead Synth", "Pad Track", "Arp"),
      fc.array(fc.integer({ min: 0, max: 11 }), { minLength: 3, maxLength: 8 }).map(arr => [...new Set(arr)]).filter(arr => arr.length >= 3),
    ],
    { numRuns: 100 },
  )(
    "generates variation suggestion when extended repetition detected with 3+ sections",
    (role, trackName, extendedSections) => {
      // Create enough sections to cover the indices
      const maxIndex = Math.max(...extendedSections);
      const sectionNames = Array.from({ length: maxIndex + 1 }, (_, i) => `Section ${i + 1}`);
      const sections = makeSections(sectionNames);

      const repetitionSummary = new Map<string, TrackRepetitionSummary>([
        [
          trackName,
          {
            role,
            sharedGroups: [extendedSections],
            uniqueSections: [],
            hasExtendedRepetition: true,
            extendedRepetitionSections: extendedSections,
          },
        ],
      ]);

      const contentAnalysis = makeContentAnalysis({ repetitionSummary });

      const result = generateVariationSuggestions(contentAnalysis, sections);

      // Should produce at least one variation suggestion
      expect(result.length).toBeGreaterThanOrEqual(1);

      // At least one suggestion should have issueType containing "variation"
      const variationSuggestions = result.filter(s => s.issueType.includes("variation"));
      expect(variationSuggestions.length).toBeGreaterThanOrEqual(1);

      // The suggestion should contain the role name in issueType
      const roleName = role === "drums" ? "drums" :
                       role === "bass" ? "bass" :
                       role === "lead" ? "lead" :
                       role === "pad" ? "pad" :
                       role === "arpeggio" ? "arpeggio" :
                       "chord";
      const roleVariationSuggestions = result.filter(s =>
        s.issueType.includes("variation") && s.issueType.includes(roleName),
      );
      expect(roleVariationSuggestions.length).toBeGreaterThanOrEqual(1);
    },
  );

  test.prop(
    [
      arbKnownRole(),
      fc.constantFrom("Drums", "Bass", "Lead Synth", "Pad Track"),
      fc.boolean(),
      fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 0, maxLength: 2 }),
    ],
    { numRuns: 100 },
  )(
    "no variation suggestion when hasExtendedRepetition is false or fewer than 3 sections",
    (role, trackName, hasExtendedRepetition, extendedSections) => {
      // Ensure at least one condition prevents suggestion generation:
      // Either hasExtendedRepetition is false, or extendedRepetitionSections has < 3 entries
      // The fc.array with maxLength 2 ensures fewer than 3 entries
      const sections = makeSections(["Section 1", "Section 2", "Section 3", "Section 4"]);

      const repetitionSummary = new Map<string, TrackRepetitionSummary>([
        [
          trackName,
          {
            role,
            sharedGroups: [],
            uniqueSections: [],
            hasExtendedRepetition: hasExtendedRepetition && extendedSections.length >= 3,
            extendedRepetitionSections: extendedSections,
          },
        ],
      ]);

      // Since extendedSections has at most 2 entries, when hasExtendedRepetition is true
      // the function still checks extendedSections.length < 3 and skips.
      // When hasExtendedRepetition is false, the function skips entirely.
      const contentAnalysis = makeContentAnalysis({ repetitionSummary });

      const result = generateVariationSuggestions(contentAnalysis, sections);

      // Should produce no variation suggestions
      expect(result).toHaveLength(0);
    },
  );
});


// ─── Arbitraries for Properties 24–28 ──────────────────────────────────

/** Known genre strings that have profiles. */
const KNOWN_GENRES = ["techno", "trance", "drum and bass", "trap", "house", "minimal", "hardcore"];

/** All drum element category names. */
const DRUM_ELEMENT_CATEGORIES: DrumElementCategory[] = ["kick", "snare", "hi-hat", "tom", "cymbal", "percussion", "other"];

/** Fill-related keywords that may appear in issueType strings. */
const FILL_RELATED_KEYWORDS = ["fill", "roll", "suggest-fill", "fill-refinement", "atypical-fill"];

/** Generate a known genre string that maps to a profile. */
function arbKnownGenre(): fc.Arbitrary<string> {
  return fc.constantFrom(...KNOWN_GENRES);
}

/** Generate a DrumElementCategory. */
function arbDrumElementCategory(): fc.Arbitrary<DrumElementCategory> {
  return fc.constantFrom(...DRUM_ELEMENT_CATEGORIES);
}

/** Generate a subset of DrumElementCategories representing active elements. */
function arbActiveElements(minSize = 0, maxSize = 5): fc.Arbitrary<Set<DrumElementCategory>> {
  return fc.uniqueArray(arbDrumElementCategory(), { minLength: minSize, maxLength: maxSize })
    .map(arr => new Set(arr));
}

/** Generate a DrumElementProfile with specified active elements. */
function arbDrumElementProfile(activeElements: Set<DrumElementCategory>): DrumElementProfile {
  const elementCounts = new Map<DrumElementCategory, number>();
  for (const el of activeElements) {
    elementCounts.set(el, Math.floor(Math.random() * 50) + 10);
  }
  return {
    activeElements,
    elementCounts,
    fillOnlyElements: [],
    loopElements: [...activeElements],
  };
}

/** Generate a DrumPadMap with entries for given categories. */
function makeDrumPadMap(categories: DrumElementCategory[]): DrumPadMap {
  const map = new Map<number, DrumPadEntry>();
  const categoryToSampleName: Record<DrumElementCategory, string> = {
    kick: "Kick_Deep",
    snare: "Snare_Tight",
    "hi-hat": "HiHat_Closed",
    tom: "Tom_Floor",
    cymbal: "Crash_Main",
    percussion: "Shaker_01",
    other: "FX_Hit",
  };
  categories.forEach((cat, i) => {
    map.set(36 + i, {
      pitch: 36 + i,
      sampleName: categoryToSampleName[cat],
      category: cat,
    });
  });
  return map;
}

// ─── Property 24: Genre-Aware Missing Element Suggestion ─────────────────

describe("Property 24: Genre-Aware Missing Element Suggestion", () => {
  /**
   * **Validates: Requirements 9.1, 9.4**
   *
   * When `generatePercussionSuggestions` is called with a genre that has a known
   * profile and the drum track is missing a core element, the suggestions should
   * include a "missing-element" suggestion referencing that element's category name.
   */
  test.prop(
    [
      arbKnownGenre(),
      arbSectionName(),
    ],
    { numRuns: 100 },
  )(
    "produces missing-element suggestion when core element is absent",
    (genre, sectionName) => {
      const sections = makeSections([sectionName]);

      // Look up the genre profile to identify core elements
      // We'll create a drum track that is MISSING at least one core element.
      // Strategy: include only "tom" (rarely a core element) so core elements like kick/snare/hi-hat are missing.
      const activeElements = new Set<DrumElementCategory>(["tom"]);
      const drumProfile = arbDrumElementProfile(activeElements);

      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        drumElementProfile: drumProfile,
        percussionPattern: {
          classification: "loop",
          phraseLength: 4,
          fills: [],
        },
      });

      const perSection = new Map([
        ["section-0", new Map([["Drums", drumAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });
      const drumPadMaps = new Map([["Drums", makeDrumPadMap(["tom"])]]);

      const result = generatePercussionSuggestions(contentAnalysis, sections, genre, drumPadMaps);

      // Should include at least one "missing-element" suggestion
      const missingElementSuggestions = result.filter(s => s.issueType.startsWith("missing-element:"));
      expect(missingElementSuggestions.length).toBeGreaterThanOrEqual(1);

      // Each missing-element suggestion should reference a drum element category name
      for (const suggestion of missingElementSuggestions) {
        const elementName = suggestion.issueType.split(":")[1]!;
        // The element name should be a recognized term
        expect(elementName.length).toBeGreaterThan(0);
      }
    },
  );
});

// ─── Property 25: Genre-Aware Variation Suggestion ───────────────────────

describe("Property 25: Genre-Aware Variation Suggestion", () => {
  /**
   * **Validates: Requirements 9.3**
   *
   * When `generatePercussionSuggestions` detects extended repetition on a drum track,
   * it should produce variation-hint suggestions referencing a drum element category name.
   */
  test.prop(
    [
      arbKnownGenre(),
      arbDrumElementCategory().filter(c => c !== "other"),
    ],
    { numRuns: 100 },
  )(
    "produces variation-hint when extended repetition detected on drums",
    (genre, prominentElement) => {
      // Create 4 sections and mark them all as having extended repetition
      const sectionNames = ["Verse 1", "Verse 2", "Verse 3", "Verse 4"];
      const sections = makeSections(sectionNames);

      const activeElements = new Set<DrumElementCategory>([prominentElement, "kick"]);
      const elementCounts = new Map<DrumElementCategory, number>([
        [prominentElement, 100], // Make this the most prominent
        ["kick", 50],
      ]);
      const drumProfile: DrumElementProfile = {
        activeElements,
        elementCounts,
        fillOnlyElements: [],
        loopElements: [...activeElements],
      };

      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        drumElementProfile: drumProfile,
        percussionPattern: {
          classification: "loop",
          phraseLength: 4,
          fills: [],
        },
      });

      const perSection = new Map(
        sectionNames.map((_, i) => [`section-${i}`, new Map([["Drums", drumAnalysis]])] as const),
      );

      // Set up extended repetition on the drum track
      const repetitionSummary = new Map<string, TrackRepetitionSummary>([
        [
          "Drums",
          {
            role: "drums",
            sharedGroups: [[0, 1, 2, 3]],
            uniqueSections: [],
            hasExtendedRepetition: true,
            extendedRepetitionSections: [0, 1, 2, 3],
          },
        ],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection, repetitionSummary });
      const drumPadMaps = new Map([["Drums", makeDrumPadMap([prominentElement, "kick"])]]);

      const result = generatePercussionSuggestions(contentAnalysis, sections, genre, drumPadMaps);

      // Should include at least one variation-hint suggestion
      const variationHints = result.filter(s => s.issueType.startsWith("variation-hint:"));
      expect(variationHints.length).toBeGreaterThanOrEqual(1);

      // Each variation-hint should reference a drum element category name
      for (const hint of variationHints) {
        const elementName = hint.issueType.split(":")[1]!;
        const allCategoryNames = ["kick", "snare", "hi-hat", "tom", "cymbal", "percussion", "other"];
        expect(allCategoryNames).toContain(elementName);
      }
    },
  );
});

// ─── Property 26: Drum Element Names in Suggestions ──────────────────────

describe("Property 26: Drum Element Names in Suggestions", () => {
  /**
   * **Validates: Requirements 9.6**
   *
   * All suggestions produced by `generatePercussionSuggestions` should have issueType
   * strings that contain a drum element category name or a fill-related keyword.
   */
  test.prop(
    [
      fc.option(arbKnownGenre(), { nil: undefined }),
      fc.integer({ min: 1, max: 4 }),
      arbActiveElements(1, 4),
    ],
    { numRuns: 100 },
  )(
    "all suggestions reference a drum element category name or fill keyword in issueType",
    (genreOpt, numSections, activeElements) => {
      const genre = genreOpt ?? null;
      const sectionNames = Array.from({ length: numSections }, (_, i) => `Section ${i + 1}`);
      const sections = makeSections(sectionNames);

      const drumProfile = arbDrumElementProfile(activeElements);
      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        drumElementProfile: drumProfile,
        percussionPattern: {
          classification: "loop",
          phraseLength: 8,
          fills: [],
        },
      });

      const perSection = new Map(
        sectionNames.map((_, i) => [`section-${i}`, new Map([["Drums", drumAnalysis]])] as const),
      );

      const contentAnalysis = makeContentAnalysis({ perSection });
      const drumPadMaps = new Map([["Drums", makeDrumPadMap([...activeElements])]]);

      const result = generatePercussionSuggestions(contentAnalysis, sections, genre, drumPadMaps);

      // All drum element category names and fill-related keywords
      const validKeywords = [
        "kick", "snare", "hi-hat", "tom", "cymbal", "percussion", "other",
        "clap", "ride",
        ...FILL_RELATED_KEYWORDS,
        "drum fill", "generic-fill",
      ];

      // Every suggestion's issueType must contain at least one valid keyword
      for (const suggestion of result) {
        const issueTypeLower = suggestion.issueType.toLowerCase();
        const containsValidKeyword = validKeywords.some(kw => issueTypeLower.includes(kw));
        expect(
          containsValidKeyword,
          `Expected issueType "${suggestion.issueType}" to contain a drum element name or fill keyword`,
        ).toBe(true);
      }
    },
  );
});

// ─── Property 27: Graceful Fallback Without DrumPadMap ────────────────────

describe("Property 27: Graceful Fallback Without DrumPadMap", () => {
  /**
   * **Validates: Requirements 9.7**
   *
   * When `generatePercussionSuggestions` is called with an empty DrumPadMap and a
   * drum track that has a drumElementProfile, it should still produce valid
   * suggestions (not crash or error).
   */
  test.prop(
    [
      fc.option(arbKnownGenre(), { nil: undefined }),
      arbSectionName(),
      arbActiveElements(1, 4),
    ],
    { numRuns: 100 },
  )(
    "produces valid suggestions with empty DrumPadMap without crashing",
    (genreOpt, sectionName, activeElements) => {
      const genre = genreOpt ?? null;
      const sections = makeSections([sectionName]);

      const drumProfile = arbDrumElementProfile(activeElements);
      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        drumElementProfile: drumProfile,
        percussionPattern: {
          classification: "loop",
          phraseLength: 4,
          fills: [],
        },
      });

      const perSection = new Map([
        ["section-0", new Map([["Drums", drumAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });

      // Empty DrumPadMap — no pad mapping data available
      const emptyDrumPadMaps: ReadonlyMap<string, DrumPadMap> = new Map();

      // Should not throw an error
      const result = generatePercussionSuggestions(contentAnalysis, sections, genre, emptyDrumPadMaps);

      // Should return a valid array (could be empty or have suggestions)
      expect(Array.isArray(result)).toBe(true);

      // All returned suggestions should have valid structure
      for (const suggestion of result) {
        expect(suggestion.issueType).toBeDefined();
        expect(typeof suggestion.issueType).toBe("string");
        expect(suggestion.sectionName).toBeDefined();
        expect(suggestion.barRange).toBeDefined();
        expect(suggestion.barRange.start).toBeLessThanOrEqual(suggestion.barRange.end);
        expect(suggestion.severity).toMatch(/^(info|warning|critical)$/);
      }
    },
  );
});

// ─── Property 28: Genre-Agnostic Fallback ────────────────────────────────

describe("Property 28: Genre-Agnostic Fallback", () => {
  /**
   * **Validates: Requirements 9.7**
   *
   * When `generatePercussionSuggestions` is called with `genre = null`, it should
   * still produce suggestions (missing common elements like kick/snare/hi-hat)
   * without crashing, and should NOT produce atypical-usage suggestions.
   */
  test.prop(
    [
      arbSectionName(),
      arbActiveElements(0, 2).filter(s => !s.has("kick") || !s.has("snare") || !s.has("hi-hat")),
    ],
    { numRuns: 100 },
  )(
    "produces missing-element suggestions for common elements when genre is null",
    (sectionName, activeElements) => {
      const sections = makeSections([sectionName]);

      const drumProfile = arbDrumElementProfile(activeElements);
      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        drumElementProfile: drumProfile,
        percussionPattern: {
          classification: "loop",
          phraseLength: 4,
          fills: [],
        },
      });

      const perSection = new Map([
        ["section-0", new Map([["Drums", drumAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });
      const drumPadMaps = new Map([["Drums", makeDrumPadMap([...activeElements])]]);

      const result = generatePercussionSuggestions(contentAnalysis, sections, null, drumPadMaps);

      // Should not crash — valid array returned
      expect(Array.isArray(result)).toBe(true);

      // Should produce missing-element suggestions for kick, snare, or hi-hat if they're absent
      const commonElements: DrumElementCategory[] = ["kick", "snare", "hi-hat"];
      const missingCommon = commonElements.filter(el => !activeElements.has(el));

      if (missingCommon.length > 0) {
        const missingElementSuggestions = result.filter(s => s.issueType.startsWith("missing-element:"));
        expect(missingElementSuggestions.length).toBeGreaterThanOrEqual(1);

        // Each missing-element should reference one of the common elements that is absent
        for (const suggestion of missingElementSuggestions) {
          const elementName = suggestion.issueType.split(":")[1]!;
          expect(missingCommon).toContain(elementName);
        }
      }

      // Should NOT produce atypical-usage suggestions (genre-specific only)
      const atypicalSuggestions = result.filter(s => s.issueType.startsWith("atypical-usage:"));
      expect(atypicalSuggestions).toHaveLength(0);
    },
  );

  test.prop(
    [
      arbSectionName(),
    ],
    { numRuns: 50 },
  )(
    "never produces atypical-usage suggestions when genre is null",
    (sectionName) => {
      const sections = makeSections([sectionName]);

      // Full drum kit — all elements active, which would trigger atypical-usage with a genre
      const allElements = new Set<DrumElementCategory>(["kick", "snare", "hi-hat", "tom", "cymbal", "percussion"]);
      const drumProfile = arbDrumElementProfile(allElements);
      const drumAnalysis = makeTrackAnalysis({
        role: "drums",
        drumElementProfile: drumProfile,
        percussionPattern: {
          classification: "loop",
          phraseLength: 4,
          fills: [],
        },
      });

      const perSection = new Map([
        ["section-0", new Map([["Drums", drumAnalysis]])],
      ]);

      const contentAnalysis = makeContentAnalysis({ perSection });
      const drumPadMaps = new Map([["Drums", makeDrumPadMap([...allElements])]]);

      const result = generatePercussionSuggestions(contentAnalysis, sections, null, drumPadMaps);

      // Should NOT produce atypical-usage suggestions
      const atypicalSuggestions = result.filter(s => s.issueType.startsWith("atypical-usage:"));
      expect(atypicalSuggestions).toHaveLength(0);
    },
  );
});
