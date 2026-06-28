/**
 * Unit tests for suggestion-loader integration behavior.
 *
 * Feature: suggestion-data-externalization
 * Requirements: 3.3, 5.9, 7.3
 */
import { describe, expect, it } from "vitest";
import {
  loadAllSuggestionData,
  getLeadingVerbs,
  getSecondSentences,
  getVariationTechniques,
  getGenreTechniques,
  getAudioVariation,
} from "../../src/core/suggestion-loader.js";
import type {
  LeadingVerbsData,
  SecondSentencesData,
  VariationTechniquesData,
  GenreTechniquesData,
  AudioVariationData,
  AllSuggestionData,
} from "../../src/core/suggestion-loader.js";

describe("suggestion-loader integration", () => {
  describe("loadAllSuggestionData()", () => {
    it("returns an object with all 5 required fields", () => {
      const data: AllSuggestionData = loadAllSuggestionData();
      expect(data).toHaveProperty("leadingVerbs");
      expect(data).toHaveProperty("secondSentences");
      expect(data).toHaveProperty("variationTechniques");
      expect(data).toHaveProperty("genreTechniques");
      expect(data).toHaveProperty("audioVariation");
    });

    it("returns typed data conforming to AllSuggestionData", () => {
      const data = loadAllSuggestionData();
      // leadingVerbs is a Record<string, string[]>
      expect(typeof data.leadingVerbs).toBe("object");
      expect(Object.keys(data.leadingVerbs).length).toBeGreaterThan(0);
      // variationTechniques has a techniques array
      expect(Array.isArray(data.variationTechniques.techniques)).toBe(true);
      expect(data.variationTechniques.techniques.length).toBeGreaterThan(0);
      // audioVariation has all 4 fields
      expect(Array.isArray(data.audioVariation.strategies)).toBe(true);
      expect(Array.isArray(data.audioVariation.genericVerbs)).toBe(true);
      expect(Array.isArray(data.audioVariation.genericTransitions)).toBe(true);
      expect(Array.isArray(data.audioVariation.framingModes)).toBe(true);
    });
  });

  describe("per-category accessors", () => {
    it("getLeadingVerbs() returns valid LeadingVerbsData", () => {
      const data: LeadingVerbsData = getLeadingVerbs();
      expect(Object.keys(data).length).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(data)) {
        expect(typeof key).toBe("string");
        expect(Array.isArray(value)).toBe(true);
        expect(value.length).toBeGreaterThan(0);
        expect(value.every((v) => typeof v === "string" && v.length > 0)).toBe(true);
      }
    });

    it("getSecondSentences() returns valid SecondSentencesData", () => {
      const data: SecondSentencesData = getSecondSentences();
      expect(Object.keys(data).length).toBeGreaterThan(0);
      for (const [, value] of Object.entries(data)) {
        expect(Array.isArray(value)).toBe(true);
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it("getVariationTechniques() returns valid VariationTechniquesData", () => {
      const data: VariationTechniquesData = getVariationTechniques();
      expect(Array.isArray(data.techniques)).toBe(true);
      expect(data.techniques.length).toBeGreaterThan(0);
      expect(data.techniques.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
    });

    it("getGenreTechniques() returns valid GenreTechniquesData", () => {
      const data: GenreTechniquesData = getGenreTechniques();
      expect(Object.keys(data).length).toBeGreaterThan(0);
      expect(data["techno"]).toBeDefined();
      expect(data["house"]).toBeDefined();
    });

    it("getAudioVariation() returns valid AudioVariationData", () => {
      const data: AudioVariationData = getAudioVariation();
      expect(data.strategies.length).toBeGreaterThan(0);
      expect(data.genericVerbs.length).toBeGreaterThan(0);
      expect(data.genericTransitions.length).toBeGreaterThan(0);
      expect(data.framingModes.length).toBeGreaterThan(0);
    });

    it("each accessor returns data independent of other categories", () => {
      // Each accessor should work independently
      const lv = getLeadingVerbs();
      const ss = getSecondSentences();
      const vt = getVariationTechniques();
      const gt = getGenreTechniques();
      const av = getAudioVariation();

      // All should be defined and non-empty
      expect(Object.keys(lv).length).toBeGreaterThan(0);
      expect(Object.keys(ss).length).toBeGreaterThan(0);
      expect(vt.techniques.length).toBeGreaterThan(0);
      expect(Object.keys(gt).length).toBeGreaterThan(0);
      expect(av.strategies.length).toBeGreaterThan(0);
    });
  });

  describe("renderer depends on loader validation", () => {
    it("suggestion-renderer module imports successfully (loader validation passed)", async () => {
      // If this import succeeds, it means the loader validated all JSON at module init
      const renderer = await import("../../src/core/suggestion-renderer.js");
      expect(renderer.renderSuggestion).toBeDefined();
      expect(typeof renderer.renderSuggestion).toBe("function");
    });

    it("renderSuggestion produces output (loader data is available)", async () => {
      const { renderSuggestion } = await import("../../src/core/suggestion-renderer.js");
      const result = renderSuggestion(
        { issueType: "flat-energy", sectionName: "Verse", barRange: { start: 9, end: 16 }, severity: "warning" },
        null,
        0,
      );
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
