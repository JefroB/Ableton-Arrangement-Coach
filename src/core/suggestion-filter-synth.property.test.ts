/**
 * Property-based tests for the Synth Suggestion Engine functions.
 *
 * Feature: midi-synth-analysis
 *
 * - Property 21: Role-specific variation suggestion
 * - Property 22: Velocity automation suggestion
 * - Property 23: Layering suggestion
 * - Property 24: Synth intensification suggestion
 * - Property 25: Suggestion priority cap invariant
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import {
  generateSynthVariationSuggestions,
  generateVelocityAutomationSuggestions,
  generateLayeringSuggestions,
  generateSynthIntensificationSuggestions,
  applySynthSuggestionPriorityCap,
} from "./content-suggestion-filter.js";

import type { RawSuggestion } from "./suggestion-renderer.js";
import type { SynthAnalysisResult, SynthTrackProfile } from "./synth-analysis-types.js";
import type { Section } from "./section-scanner.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate sequential sections of a given length. */
function makeSections(count: number, sectionLength: number = 16): Section[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `section-${i}`,
    name: `Section ${i}`,
    startTime: i * sectionLength,
    endTime: (i + 1) * sectionLength,
  }));
}

/** Roles that qualify as synth tracks with keywords the function recognizes. */
const SYNTH_ROLE_NAMES = ["Lead Synth", "Pad Atmosphere", "Arp Sequence", "Chord Stabs", "Bass Line"] as const;

/** Arbitrary synth role track name. */
const synthRoleNameArb = fc.constantFrom(...SYNTH_ROLE_NAMES);

/** Create a minimal SynthTrackProfile with configurable density, polyphony, and velocity. */
function makeProfile(opts?: {
  noteDensity?: number;
  polyphonyMean?: number;
  polyphonyMax?: number;
  velocityMean?: number;
}): SynthTrackProfile {
  const density = opts?.noteDensity ?? 2.0;
  const polyMean = opts?.polyphonyMean ?? 1.5;
  const polyMax = opts?.polyphonyMax ?? 3;
  const velMean = opts?.velocityMean ?? 80;

  return {
    pitchContent: { pitchClasses: new Set([0, 4, 7]), pitchRange: 12 },
    noteDensity: density,
    velocityDynamics: { min: 60, max: 100, mean: velMean, stdDev: 10, contour: "flat" as const },
    articulationPattern: { type: "mixed" as const, averageDurationRatio: 0.7 },
    rhythmicRegularity: 0.8,
    polyphonyProfile: { mean: polyMean, max: polyMax },
    melodicContour: { shape: "static" as const, segmentMeans: [60, 60, 60, 60] as readonly [number, number, number, number] },
    harmonicIntervalProfile: null,
  };
}

/** Build a SynthAnalysisResult from explicit per-section/per-track data. */
function buildSynthAnalysis(opts: {
  perSection: Map<string, Map<string, SynthTrackProfile>>;
  repetitionFlags?: Map<string, { hasExtendedRepetition: boolean; extendedRepetitionSections: readonly number[] }>;
  discontinuities?: readonly import("./synth-analysis-types.js").SynthDiscontinuity[];
}): SynthAnalysisResult {
  return {
    perSection: opts.perSection,
    crossSection: new Map(),
    repetitionFlags: opts.repetitionFlags ?? new Map(),
    discontinuities: opts.discontinuities ?? [],
  };
}

// ─── Property 21: Role-specific variation suggestion ──────────────────

describe("Feature: midi-synth-analysis, Property 21: Role-specific variation suggestion", () => {
  test.prop(
    [synthRoleNameArb, fc.integer({ min: 4, max: 8 })],
    { numRuns: 100 },
  )(
    "SHALL emit a suggestion with role-specific variation guidance for tracks with extended repetition",
    (trackName, sectionCount) => {
      /**
       * Validates: Requirements 6.1
       *
       * For any synth track with extended repetition (3+ consecutive sections),
       * the suggestion engine SHALL emit a suggestion containing role-specific
       * variation guidance matching the track's InstrumentRole.
       */
      const sections = makeSections(sectionCount);

      // Build per-section profiles for the track across all sections
      const perSection = new Map<string, Map<string, SynthTrackProfile>>();
      for (const section of sections) {
        const trackProfiles = new Map<string, SynthTrackProfile>();
        trackProfiles.set(trackName, makeProfile());
        perSection.set(section.id, trackProfiles);
      }

      // Mark 3+ consecutive sections as extended repetition
      const extSections = Array.from({ length: sectionCount }, (_, i) => i);

      const synthAnalysis = buildSynthAnalysis({
        perSection,
        repetitionFlags: new Map([
          [trackName, { hasExtendedRepetition: true, extendedRepetitionSections: extSections }],
        ]),
      });

      const suggestions = generateSynthVariationSuggestions(synthAnalysis, sections);

      // SHALL emit at least one suggestion
      expect(suggestions.length).toBeGreaterThanOrEqual(1);

      // Suggestion issueType should reference the role
      const suggestion = suggestions[0]!;
      expect(suggestion.issueType).toContain("synth-variation:");

      // Check role-specific keywords in issueType
      const lowerName = trackName.toLowerCase();
      if (lowerName.includes("lead")) {
        expect(suggestion.issueType).toContain("lead");
      } else if (lowerName.includes("pad")) {
        expect(suggestion.issueType).toContain("pad");
      } else if (lowerName.includes("arp")) {
        expect(suggestion.issueType).toContain("arpeggio");
      } else if (lowerName.includes("chord")) {
        expect(suggestion.issueType).toContain("chord");
      } else if (lowerName.includes("bass")) {
        expect(suggestion.issueType).toContain("bass");
      }
    },
  );
});

// ─── Property 22: Velocity automation suggestion ──────────────────────

describe("Feature: midi-synth-analysis, Property 22: Velocity automation suggestion", () => {
  test.prop(
    [
      synthRoleNameArb,
      fc.integer({ min: 2, max: 8 }),
      fc.integer({ min: 50, max: 120 }),
    ],
    { numRuns: 100 },
  )(
    "SHALL emit a velocity automation suggestion when velocity varies ≤ 0.05 across 2+ consecutive sections",
    (trackName, sectionCount, baseVelocity) => {
      /**
       * Validates: Requirements 6.2
       *
       * For any synth track whose normalized per-bar velocity values vary by
       * no more than 0.05 (max minus min) across 2 or more consecutive sections,
       * the suggestion engine SHALL emit a suggestion recommending velocity automation.
       */
      const sections = makeSections(sectionCount);

      // All sections get the same velocity mean (variation = 0, which is ≤ 0.05)
      const perSection = new Map<string, Map<string, SynthTrackProfile>>();
      for (const section of sections) {
        const trackProfiles = new Map<string, SynthTrackProfile>();
        trackProfiles.set(trackName, makeProfile({ velocityMean: baseVelocity }));
        perSection.set(section.id, trackProfiles);
      }

      const synthAnalysis = buildSynthAnalysis({ perSection });

      const suggestions = generateVelocityAutomationSuggestions(synthAnalysis, sections);

      // SHALL emit at least one suggestion for the flat velocity track
      expect(suggestions.length).toBeGreaterThanOrEqual(1);

      // Check that the suggestion is about velocity automation
      const hasSynthVelocitySuggestion = suggestions.some(
        (s) => s.issueType.startsWith("synth-velocity-automation"),
      );
      expect(hasSynthVelocitySuggestion).toBe(true);
    },
  );
});

// ─── Property 23: Layering suggestion ─────────────────────────────────

describe("Feature: midi-synth-analysis, Property 23: Layering suggestion", () => {
  test.prop(
    [
      fc.integer({ min: 1, max: 4 }),
      fc.double({ min: 4.01, max: 12.0, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.1, max: 1.99, noNaN: true, noDefaultInfinity: true }),
    ],
    { numRuns: 100 },
  )(
    "SHALL emit a layering suggestion when density > 4.0 but avg polyphony < 2.0",
    (trackCount, totalDensity, avgPolyphony) => {
      /**
       * Validates: Requirements 6.3
       *
       * For any section where synth tracks have Note_Density > 4.0 notes per beat
       * but average PolyphonyProfile < 2.0, the suggestion engine SHALL emit a
       * suggestion recommending layering or harmonic thickening.
       */
      const sections = makeSections(1);

      // Distribute density across tracks so total > 4.0
      const perTrackDensity = totalDensity / trackCount;
      const perSection = new Map<string, Map<string, SynthTrackProfile>>();
      const trackProfiles = new Map<string, SynthTrackProfile>();

      for (let t = 0; t < trackCount; t++) {
        trackProfiles.set(`Synth ${t}`, makeProfile({
          noteDensity: perTrackDensity,
          polyphonyMean: avgPolyphony,
        }));
      }
      perSection.set(sections[0]!.id, trackProfiles);

      const synthAnalysis = buildSynthAnalysis({ perSection });

      const suggestions = generateLayeringSuggestions(synthAnalysis, sections);

      // SHALL emit a layering suggestion
      expect(suggestions.length).toBeGreaterThanOrEqual(1);

      const hasLayeringSuggestion = suggestions.some(
        (s) => s.issueType === "synth-layering",
      );
      expect(hasLayeringSuggestion).toBe(true);
    },
  );
});

// ─── Property 24: Synth intensification suggestion ────────────────────

describe("Feature: midi-synth-analysis, Property 24: Synth intensification suggestion", () => {
  test.prop(
    [
      fc.integer({ min: 2, max: 8 }),
      fc.double({ min: 1.0, max: 5.0, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1.0, max: 5.0, noNaN: true, noDefaultInfinity: true }),
    ],
    { numRuns: 100 },
  )(
    "SHALL emit intensification suggestion when energy delta ≥ 2 but synth density/polyphony don't increase 25%",
    (sectionCount, density, polyphonyMean) => {
      /**
       * Validates: Requirements 6.4
       *
       * For any section transition with energy delta ≥ 2 points where synth tracks
       * show neither a 25% Note_Density increase nor a 25% PolyphonyProfile increase,
       * the suggestion engine SHALL emit a suggestion recommending synth intensification.
       */
      const sections = makeSections(sectionCount);

      // All sections have the same density and polyphony (no increase)
      const perSection = new Map<string, Map<string, SynthTrackProfile>>();
      for (const section of sections) {
        const trackProfiles = new Map<string, SynthTrackProfile>();
        trackProfiles.set("Lead Synth", makeProfile({
          noteDensity: density,
          polyphonyMean: polyphonyMean,
        }));
        perSection.set(section.id, trackProfiles);
      }

      const synthAnalysis = buildSynthAnalysis({ perSection });

      // Energy curve with a delta ≥ 2 somewhere
      // First section at energy 3, second section at energy 5 (delta = 2)
      const energyCurve = Array.from({ length: sectionCount }, (_, i) =>
        i === 0 ? 3 : 5,
      );

      const suggestions = generateSynthIntensificationSuggestions(synthAnalysis, sections, energyCurve);

      // SHALL emit at least one intensification suggestion (at the transition from section 0 to 1)
      expect(suggestions.length).toBeGreaterThanOrEqual(1);

      const hasIntensificationSuggestion = suggestions.some(
        (s) => s.issueType === "synth-intensification",
      );
      expect(hasIntensificationSuggestion).toBe(true);
    },
  );
});

// ─── Property 25: Suggestion priority cap invariant ───────────────────

describe("Feature: midi-synth-analysis, Property 25: Suggestion priority cap invariant", () => {
  test.prop(
    [fc.integer({ min: 4, max: 10 })],
    { numRuns: 100 },
  )(
    "SHALL emit at most 3 synth-related suggestions per section, prioritized by severity",
    (suggestionCount) => {
      /**
       * Validates: Requirements 6.5
       *
       * For any section, the suggestion system SHALL emit at most 3 synth-related
       * suggestions, prioritized by severity (criterion 4 > criterion 2 > criterion 3 > criterion 1).
       */
      const sectionName = "Chorus 1";

      // Create more than 3 suggestions all targeting the same section
      const suggestions: RawSuggestion[] = [];

      // Add one of each type to exceed cap
      suggestions.push({
        issueType: "synth-variation:lead",
        sectionName,
        barRange: { start: 0, end: 16 },
        severity: "info",
      });
      suggestions.push({
        issueType: "synth-layering",
        sectionName,
        barRange: { start: 0, end: 16 },
        severity: "info",
      });
      suggestions.push({
        issueType: "synth-velocity-automation:Lead Synth",
        sectionName,
        barRange: { start: 0, end: 16 },
        severity: "warning",
      });
      suggestions.push({
        issueType: "synth-intensification",
        sectionName,
        barRange: { start: 0, end: 16 },
        severity: "warning",
      });

      // Add extra random variations to exceed the cap further
      for (let i = 0; i < suggestionCount - 4; i++) {
        suggestions.push({
          issueType: `synth-variation:pad-${i}`,
          sectionName,
          barRange: { start: 0, end: 16 },
          severity: "info",
        });
      }

      const capped = applySynthSuggestionPriorityCap(suggestions);

      // At most 3 suggestions for this section
      expect(capped.length).toBeLessThanOrEqual(3);

      // Priority order: intensification > velocity automation > layering > variation
      // The first suggestion should be the highest priority (intensification)
      if (capped.length >= 1) {
        expect(capped[0]!.issueType).toContain("synth-intensification");
      }
      if (capped.length >= 2) {
        expect(capped[1]!.issueType).toContain("synth-velocity-automation");
      }
      if (capped.length >= 3) {
        expect(capped[2]!.issueType).toContain("synth-layering");
      }
    },
  );

  test.prop(
    [
      fc.integer({ min: 2, max: 5 }),
      fc.integer({ min: 4, max: 8 }),
    ],
    { numRuns: 100 },
  )(
    "SHALL enforce the 3-suggestion cap independently per section",
    (sectionCountForSuggestions, suggestionsPerSection) => {
      /**
       * Validates: Requirements 6.5
       *
       * The cap applies per section — different sections can each have up to 3.
       */
      const suggestions: RawSuggestion[] = [];

      for (let s = 0; s < sectionCountForSuggestions; s++) {
        const secName = `Section ${s}`;
        for (let i = 0; i < suggestionsPerSection; i++) {
          suggestions.push({
            issueType: `synth-variation:lead-${i}`,
            sectionName: secName,
            barRange: { start: s * 16, end: (s + 1) * 16 },
            severity: "info",
          });
        }
      }

      const capped = applySynthSuggestionPriorityCap(suggestions);

      // Each section should have at most 3 suggestions
      const bySectionName = new Map<string, number>();
      for (const s of capped) {
        bySectionName.set(s.sectionName, (bySectionName.get(s.sectionName) ?? 0) + 1);
      }

      for (const [, count] of bySectionName) {
        expect(count).toBeLessThanOrEqual(3);
      }

      // Total should be at most 3 * sectionCountForSuggestions
      expect(capped.length).toBeLessThanOrEqual(3 * sectionCountForSuggestions);
    },
  );
});
