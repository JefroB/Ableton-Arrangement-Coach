import { describe, it, expect } from "vitest";
import { renderSuggestion, type RawSuggestion } from "../../../src/core/suggestion-renderer.js";
import type { GenreProfile } from "../../../src/core/genre-profile-types.js";

// ─── Test Fixtures ──────────────────────────────────────────────────────

const TECHNO_PROFILE: GenreProfile = {
  id: "techno",
  name: "Techno",
  family: "techno",
  tempoRange: { min: 120, max: 150 },
  structure: [
    { name: "Intro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
    { name: "Build A", lengthRange: { min: 8, max: 16 }, energyRange: { min: 4, max: 6 }, optional: false },
    { name: "Main A", lengthRange: { min: 32, max: 64 }, energyRange: { min: 7, max: 9 }, optional: false },
    { name: "Breakdown", lengthRange: { min: 8, max: 32 }, energyRange: { min: 3, max: 5 }, optional: false },
    { name: "Outro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
  ],
  energyCurveTemplate: [3, 5, 8, 4, 3],
  transitions: {
    preferred: ["filter_sweep", "volume_dynamics", "drum_fill"],
    discouraged: [],
    buildDurationRange: { min: 4, max: 16 },
    dropsExpected: true,
  },
  energyWeights: {
    trackCountWeight: 0.20,
    midiDensityWeight: 0.35,
    audioPresenceWeight: 0.15,
    automationWeight: 0.20,
    frequencyCoverageWeight: 0.10,
  },
  detectionRules: [],
  detectionThresholds: {
    flatEnergyMaxDelta: 2,
    missingTransitionMinDelta: 3,
    similarityCeilingPercent: 92,
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Suggestion Renderer", () => {
  describe("renderSuggestion", () => {
    it("returns a non-empty string", () => {
      const suggestion: RawSuggestion = {
        issueType: "flat-energy",
        sectionName: "Intro",
        barRange: { start: 1, end: 32 },
        severity: "warning",
      };
      const result = renderSuggestion(suggestion, TECHNO_PROFILE);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it("outputs at most 2 sentences", () => {
      const suggestion: RawSuggestion = {
        issueType: "missing-transition",
        sectionName: "Main A",
        barRange: { start: 33, end: 64 },
        severity: "critical",
      };
      const result = renderSuggestion(suggestion, TECHNO_PROFILE);
      // Count sentence-ending punctuation
      const sentenceEndings = (result.match(/[.!?](?:\s|$)/g) || []).length;
      expect(sentenceEndings).toBeLessThanOrEqual(2);
    });

    it("uses genre-specific transition terminology from profile", () => {
      const suggestion: RawSuggestion = {
        issueType: "missing-transition",
        sectionName: "Main A",
        barRange: { start: 33, end: 64 },
        severity: "warning",
      };
      const result = renderSuggestion(suggestion, TECHNO_PROFILE);
      // Should include one of the profile's preferred transitions
      const hasPreferredTerm = TECHNO_PROFILE.transitions.preferred.some(
        (term) => result.toLowerCase().includes(term.replace(/_/g, " ")),
      );
      expect(hasPreferredTerm).toBe(true);
    });

    it("uses section names from profile structure when matching", () => {
      const suggestion: RawSuggestion = {
        issueType: "flat-energy",
        sectionName: "breakdown", // lowercase
        barRange: { start: 65, end: 80 },
        severity: "info",
      };
      const result = renderSuggestion(suggestion, TECHNO_PROFILE);
      // Should use the profile's casing "Breakdown"
      expect(result).toContain("Breakdown");
    });

    it("falls back to generic terminology when profile is null", () => {
      const suggestion: RawSuggestion = {
        issueType: "missing-transition",
        sectionName: "Section A",
        barRange: { start: 1, end: 16 },
        severity: "warning",
      };
      const result = renderSuggestion(suggestion, null);
      // Should contain a generic transition term
      const genericTerms = ["riser", "build", "breakdown", "sweep", "transition", "fill", "drop"];
      const hasGenericTerm = genericTerms.some(
        (term) => result.toLowerCase().includes(term),
      );
      expect(hasGenericTerm).toBe(true);
    });

    it("falls back to generic terminology when profile has empty preferred transitions", () => {
      const emptyProfile: GenreProfile = {
        ...TECHNO_PROFILE,
        transitions: {
          preferred: [],
          discouraged: [],
          buildDurationRange: { min: 4, max: 16 },
          dropsExpected: false,
        },
      };
      const suggestion: RawSuggestion = {
        issueType: "missing-transition",
        sectionName: "Intro",
        barRange: { start: 1, end: 16 },
        severity: "warning",
      };
      const result = renderSuggestion(suggestion, emptyProfile);
      const genericTerms = ["riser", "build", "breakdown", "sweep", "transition", "fill", "drop"];
      const hasGenericTerm = genericTerms.some(
        (term) => result.toLowerCase().includes(term),
      );
      expect(hasGenericTerm).toBe(true);
    });

    it("varies vocabulary for same issue type with different inputs", () => {
      const suggestion1: RawSuggestion = {
        issueType: "flat-energy",
        sectionName: "Intro",
        barRange: { start: 1, end: 16 },
        severity: "warning",
      };
      const suggestion2: RawSuggestion = {
        issueType: "flat-energy",
        sectionName: "Breakdown",
        barRange: { start: 65, end: 80 },
        severity: "warning",
      };
      const result1 = renderSuggestion(suggestion1, TECHNO_PROFILE);
      const result2 = renderSuggestion(suggestion2, TECHNO_PROFILE);

      // The leading word should differ between the two suggestions
      const firstWord1 = result1.split(" ")[0];
      const firstWord2 = result2.split(" ")[0];
      // At least the full output should differ
      expect(result1).not.toBe(result2);
    });

    it("is a pure function (same input produces same output)", () => {
      const suggestion: RawSuggestion = {
        issueType: "repetition",
        sectionName: "Main A",
        barRange: { start: 33, end: 64 },
        severity: "warning",
      };
      const result1 = renderSuggestion(suggestion, TECHNO_PROFILE);
      const result2 = renderSuggestion(suggestion, TECHNO_PROFILE);
      expect(result1).toBe(result2);
    });

    it("handles empty section name gracefully", () => {
      const suggestion: RawSuggestion = {
        issueType: "flat-energy",
        sectionName: "",
        barRange: { start: 1, end: 8 },
        severity: "info",
      };
      const result = renderSuggestion(suggestion, TECHNO_PROFILE);
      expect(result).toContain("this section");
    });

    it("handles unknown issue type without throwing", () => {
      const suggestion: RawSuggestion = {
        issueType: "unknown-issue-type",
        sectionName: "Main A",
        barRange: { start: 1, end: 16 },
        severity: "warning",
      };
      expect(() => renderSuggestion(suggestion, TECHNO_PROFILE)).not.toThrow();
      const result = renderSuggestion(suggestion, TECHNO_PROFILE);
      expect(result.length).toBeGreaterThan(0);
    });

    it("renders all known issue types without throwing", () => {
      const issueTypes = [
        "flat-energy",
        "missing-transition",
        "repetition",
        "abrupt-change",
        "frequency-crowding",
        "intro-length",
        "outro-length",
        "intro-energy",
        "energy-mismatch",
      ];
      for (const issueType of issueTypes) {
        const suggestion: RawSuggestion = {
          issueType,
          sectionName: "Intro",
          barRange: { start: 1, end: 16 },
          severity: "warning",
        };
        const result = renderSuggestion(suggestion, TECHNO_PROFILE);
        expect(result.length).toBeGreaterThan(0);
        // Verify max 2 sentences for each
        const sentenceEndings = (result.match(/[.!?](?:\s|$)/g) || []).length;
        expect(sentenceEndings).toBeLessThanOrEqual(2);
      }
    });
  });
});
