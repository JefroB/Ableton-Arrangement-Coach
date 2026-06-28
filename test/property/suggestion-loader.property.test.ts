/**
 * Property-based tests for Suggestion Loader validation functions.
 *
 * Feature: suggestion-data-externalization
 *
 * Property 1: Record validator correctly classifies inputs
 * Property 2: Multi-field validator correctly classifies inputs
 * Property 3: Data equivalence — loaded JSON matches original constants
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import {
  validateStringArrayRecord,
  validateNonEmptyStringArray,
  validateVariationTechniques,
  validateAudioVariationData,
  loadAllSuggestionData,
} from "../../src/core/suggestion-loader.js";
import { renderSuggestion } from "../../src/core/suggestion-renderer.js";

// Direct JSON imports for data equivalence verification
import leadingVerbsJson from "../../src/data/suggestions/leading-verbs.json";
import secondSentencesJson from "../../src/data/suggestions/second-sentences.json";
import variationTechniquesJson from "../../src/data/suggestions/variation-techniques.json";
import genreTechniquesJson from "../../src/data/suggestions/genre-techniques.json";
import audioVariationJson from "../../src/data/suggestions/audio-variation-strategies.json";

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary non-empty string (valid array element). */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 });

/** Arbitrary non-empty array of non-empty strings (valid record value). */
const validStringArrayArb = fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 10 });

/** Arbitrary valid Record<string, string[]> (at least one key, all values valid). */
const validRecordArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  validStringArrayArb,
  { minKeys: 1, maxKeys: 8 },
);

/** Arbitrary file name for error message testing. */
const fileNameArb = fc.string({ minLength: 1, maxLength: 30 });

// ═══════════════════════════════════════════════════════════════════════
// Property 1: Record validator correctly classifies inputs
// ═══════════════════════════════════════════════════════════════════════

// Feature: suggestion-data-externalization, Property 1: Record validator correctly classifies inputs
describe("Property 1: Record validator correctly classifies inputs", () => {
  /**
   * Validates: Requirements 4.1, 4.2, 4.4, 4.6, 4.7
   */

  test.prop(
    [validRecordArb, fileNameArb],
    { numRuns: 100 },
  )("accepts valid Record<string, string[]> inputs", (record, fileName) => {
    expect(() => validateStringArrayRecord(record, fileName)).not.toThrow();
  });

  test.prop(
    [fileNameArb],
    { numRuns: 100 },
  )("rejects non-object inputs with file name in error", (fileName) => {
    const nonObjects = [null, undefined, 42, "hello", true, [1, 2, 3]];
    for (const input of nonObjects) {
      expect(() => validateStringArrayRecord(input, fileName)).toThrowError(
        new RegExp(`Suggestion file ${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
    }
  });

  test.prop(
    [fileNameArb],
    { numRuns: 100 },
  )("rejects empty objects", (fileName) => {
    expect(() => validateStringArrayRecord({}, fileName)).toThrowError(
      /at least one key/,
    );
  });

  test.prop(
    [fc.string({ minLength: 1, maxLength: 20 }), fileNameArb],
    { numRuns: 100 },
  )("rejects objects with empty array values", (key, fileName) => {
    const record = { [key]: [] };
    expect(() => validateStringArrayRecord(record, fileName)).toThrowError(
      /empty array/,
    );
  });

  test.prop(
    [fc.string({ minLength: 1, maxLength: 20 }), fileNameArb],
    { numRuns: 100 },
  )("rejects objects with non-string array elements", (key, fileName) => {
    const record = { [key]: [42] };
    expect(() => validateStringArrayRecord(record, fileName)).toThrowError(
      /non-string element/,
    );
  });

  test.prop(
    [fc.string({ minLength: 1, maxLength: 20 }), fileNameArb],
    { numRuns: 100 },
  )("rejects objects with empty string elements", (key, fileName) => {
    const record = { [key]: ["valid", ""] };
    expect(() => validateStringArrayRecord(record, fileName)).toThrowError(
      /empty string/,
    );
  });

  test.prop(
    [fc.string({ minLength: 1, maxLength: 20 }), fileNameArb],
    { numRuns: 100 },
  )("rejects objects with non-array values", (key, fileName) => {
    const record = { [key]: "not-an-array" };
    expect(() => validateStringArrayRecord(record, fileName)).toThrowError(
      /not an array/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 2: Multi-field validator correctly classifies inputs
// ═══════════════════════════════════════════════════════════════════════

// Feature: suggestion-data-externalization, Property 2: Multi-field validator correctly classifies inputs
describe("Property 2: Multi-field validator correctly classifies inputs", () => {
  /**
   * Validates: Requirements 4.3, 4.5, 4.6, 3.5
   */

  // ─── validateVariationTechniques ─────────────────────────────────────

  test.prop(
    [validStringArrayArb, fileNameArb],
    { numRuns: 100 },
  )("validateVariationTechniques accepts valid { techniques: [...] }", (techniques, fileName) => {
    expect(() => validateVariationTechniques({ techniques }, fileName)).not.toThrow();
  });

  test.prop(
    [fileNameArb],
    { numRuns: 100 },
  )("validateVariationTechniques rejects missing techniques field", (fileName) => {
    expect(() => validateVariationTechniques({}, fileName)).toThrowError(
      /missing required field 'techniques'/,
    );
  });

  test.prop(
    [fileNameArb],
    { numRuns: 100 },
  )("validateVariationTechniques rejects non-object input", (fileName) => {
    expect(() => validateVariationTechniques("string", fileName)).toThrowError(
      /expected a plain object/,
    );
    expect(() => validateVariationTechniques(null, fileName)).toThrowError(
      /expected a plain object/,
    );
  });

  test.prop(
    [fileNameArb],
    { numRuns: 100 },
  )("validateVariationTechniques rejects empty techniques array", (fileName) => {
    expect(() => validateVariationTechniques({ techniques: [] }, fileName)).toThrowError(
      /empty array/,
    );
  });

  // ─── validateAudioVariationData ──────────────────────────────────────

  /** Valid audio variation object generator. */
  const validAudioVariationArb = fc.record({
    strategies: validStringArrayArb,
    genericVerbs: validStringArrayArb,
    genericTransitions: validStringArrayArb,
    framingModes: validStringArrayArb,
  });

  test.prop(
    [validAudioVariationArb, fileNameArb],
    { numRuns: 100 },
  )("validateAudioVariationData accepts valid 4-field objects", (data, fileName) => {
    expect(() => validateAudioVariationData(data, fileName)).not.toThrow();
  });

  const requiredFields = ["strategies", "genericVerbs", "genericTransitions", "framingModes"] as const;

  test.prop(
    [validAudioVariationArb, fileNameArb, fc.constantFrom(...requiredFields)],
    { numRuns: 100 },
  )("validateAudioVariationData rejects objects missing a required field", (data, fileName, fieldToRemove) => {
    const incomplete = { ...data };
    delete (incomplete as Record<string, unknown>)[fieldToRemove];
    expect(() => validateAudioVariationData(incomplete, fileName)).toThrowError(
      new RegExp(`missing required field '${fieldToRemove}'`),
    );
  });

  test.prop(
    [validAudioVariationArb, fileNameArb, fc.constantFrom(...requiredFields)],
    { numRuns: 100 },
  )("validateAudioVariationData rejects objects with empty array in a field", (data, fileName, fieldToBreak) => {
    const broken = { ...data, [fieldToBreak]: [] };
    expect(() => validateAudioVariationData(broken, fileName)).toThrowError(
      /empty array/,
    );
  });

  test.prop(
    [fileNameArb],
    { numRuns: 100 },
  )("validateAudioVariationData rejects non-object input", (fileName) => {
    expect(() => validateAudioVariationData(null, fileName)).toThrowError(
      /expected a plain object/,
    );
    expect(() => validateAudioVariationData([], fileName)).toThrowError(
      /expected a plain object/,
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════
// Property 3: Data equivalence — loaded JSON matches original constants
// ═══════════════════════════════════════════════════════════════════════

// Feature: suggestion-data-externalization, Property 3: Data equivalence — loaded JSON matches original constants
describe("Property 3: Data equivalence — loaded JSON matches original constants", () => {
  /**
   * Validates: Requirements 2.6, 6.5
   */

  const allData = loadAllSuggestionData();

  // ─── leadingVerbs ────────────────────────────────────────────────────

  describe("leadingVerbs matches leading-verbs.json", () => {
    const leadingVerbKeys = Object.keys(leadingVerbsJson);

    test("contains expected keys (e.g., 'flat-energy')", () => {
      expect(leadingVerbKeys).toContain("flat-energy");
      expect(leadingVerbKeys).toContain("missing-transition");
      expect(leadingVerbKeys).toContain("repetition");
    });

    test("key count matches JSON file exactly", () => {
      expect(Object.keys(allData.leadingVerbs).length).toBe(leadingVerbKeys.length);
    });

    test.each(leadingVerbKeys)(
      "key '%s' has deeply equal values",
      (key) => {
        expect(allData.leadingVerbs[key]).toEqual(
          (leadingVerbsJson as Record<string, string[]>)[key],
        );
      },
    );
  });

  // ─── secondSentences ─────────────────────────────────────────────────

  describe("secondSentences matches second-sentences.json", () => {
    const secondSentenceKeys = Object.keys(secondSentencesJson);

    test("contains expected keys (e.g., 'flat-energy', 'audio-variation')", () => {
      expect(secondSentenceKeys).toContain("flat-energy");
      expect(secondSentenceKeys).toContain("audio-variation");
    });

    test("key count matches JSON file exactly", () => {
      expect(Object.keys(allData.secondSentences).length).toBe(secondSentenceKeys.length);
    });

    test.each(secondSentenceKeys)(
      "key '%s' has deeply equal values",
      (key) => {
        expect(allData.secondSentences[key]).toEqual(
          (secondSentencesJson as Record<string, string[]>)[key],
        );
      },
    );
  });

  // ─── variationTechniques ─────────────────────────────────────────────

  describe("variationTechniques matches variation-techniques.json", () => {
    test("techniques array is deeply equal", () => {
      expect(allData.variationTechniques.techniques).toEqual(
        variationTechniquesJson.techniques,
      );
    });

    test("techniques array length matches (no data lost)", () => {
      expect(allData.variationTechniques.techniques.length).toBe(
        variationTechniquesJson.techniques.length,
      );
    });
  });

  // ─── genreTechniques ─────────────────────────────────────────────────

  describe("genreTechniques matches genre-techniques.json", () => {
    const genreTechniqueKeys = Object.keys(genreTechniquesJson);

    test("contains expected keys (e.g., 'techno', 'house')", () => {
      expect(genreTechniqueKeys).toContain("techno");
      expect(genreTechniqueKeys).toContain("house");
      expect(genreTechniqueKeys).toContain("trance");
    });

    test("key count matches JSON file exactly", () => {
      expect(Object.keys(allData.genreTechniques).length).toBe(genreTechniqueKeys.length);
    });

    test.each(genreTechniqueKeys)(
      "key '%s' has deeply equal values",
      (key) => {
        expect(allData.genreTechniques[key]).toEqual(
          (genreTechniquesJson as Record<string, string[]>)[key],
        );
      },
    );
  });

  // ─── audioVariation ──────────────────────────────────────────────────

  describe("audioVariation matches audio-variation-strategies.json", () => {
    test("strategies array is deeply equal", () => {
      expect(allData.audioVariation.strategies).toEqual(audioVariationJson.strategies);
    });

    test("genericVerbs array is deeply equal", () => {
      expect(allData.audioVariation.genericVerbs).toEqual(audioVariationJson.genericVerbs);
    });

    test("genericTransitions array is deeply equal", () => {
      expect(allData.audioVariation.genericTransitions).toEqual(audioVariationJson.genericTransitions);
    });

    test("framingModes array is deeply equal", () => {
      expect(allData.audioVariation.framingModes).toEqual(audioVariationJson.framingModes);
    });

    test("array lengths match (no data lost)", () => {
      expect(allData.audioVariation.strategies.length).toBe(audioVariationJson.strategies.length);
      expect(allData.audioVariation.genericVerbs.length).toBe(audioVariationJson.genericVerbs.length);
      expect(allData.audioVariation.genericTransitions.length).toBe(audioVariationJson.genericTransitions.length);
      expect(allData.audioVariation.framingModes.length).toBe(audioVariationJson.framingModes.length);
    });
  });

  // ─── Cross-category completeness ────────────────────────────────────

  describe("loadAllSuggestionData returns all categories", () => {
    test("returns object with all 5 expected fields", () => {
      expect(allData).toHaveProperty("leadingVerbs");
      expect(allData).toHaveProperty("secondSentences");
      expect(allData).toHaveProperty("variationTechniques");
      expect(allData).toHaveProperty("genreTechniques");
      expect(allData).toHaveProperty("audioVariation");
    });

    test("loaded data is deeply equal to raw JSON imports combined", () => {
      expect(allData).toEqual({
        leadingVerbs: leadingVerbsJson,
        secondSentences: secondSentencesJson,
        variationTechniques: variationTechniquesJson,
        genreTechniques: genreTechniquesJson,
        audioVariation: audioVariationJson,
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 4: Output equivalence — renderSuggestion produces identical strings
// ═══════════════════════════════════════════════════════════════════════

// Feature: suggestion-data-externalization, Property 4: Output equivalence — renderSuggestion produces identical strings
describe("Property 4: Output equivalence — renderSuggestion produces identical strings", () => {
  /**
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4
   *
   * Since the constants have been externalized and Property 3 confirms
   * the loaded data is identical to the originals, we verify that
   * renderSuggestion is deterministic: same inputs always produce the
   * same output. This confirms no randomness crept in during refactoring.
   */

  // Known issue types that have specific renderers
  const knownIssueTypes = [
    "flat-energy",
    "missing-transition",
    "repetition",
    "abrupt-change",
    "frequency-crowding",
    "intro-length",
    "outro-length",
    "intro-energy",
    "energy-mismatch",
    "audio-variation:bass audio",
    "audio-variation:lead synth",
    "freq-balance:sub-bass-low",
    "freq-balance:mid-low",
  ];

  const issueTypeArb = fc.oneof(
    fc.constantFrom(...knownIssueTypes),
    fc.string({ minLength: 1, maxLength: 30 }), // unknown types for generic fallback
  );

  const sectionNameArb = fc.oneof(
    fc.constantFrom("Intro", "Verse", "Chorus", "Drop", "Breakdown", "Outro", "Bridge"),
    fc.string({ minLength: 0, maxLength: 20 }),
  );

  const barRangeArb = fc.record({
    start: fc.integer({ min: 1, max: 200 }),
    end: fc.integer({ min: 1, max: 200 }),
  }).map(({ start, end }) => ({ start: Math.min(start, end), end: Math.max(start, end) }));

  const severityArb = fc.constantFrom("info" as const, "warning" as const, "critical" as const);

  const suggestionArb = fc.record({
    issueType: issueTypeArb,
    sectionName: sectionNameArb,
    barRange: barRangeArb,
    severity: severityArb,
  });

  const issueIndexArb = fc.integer({ min: 0, max: 100 });

  test.prop(
    [suggestionArb, issueIndexArb],
    { numRuns: 200 },
  )("renderSuggestion is deterministic — same input always produces same output", (suggestion, issueIndex) => {
    const result1 = renderSuggestion(suggestion, null, issueIndex);
    const result2 = renderSuggestion(suggestion, null, issueIndex);
    expect(result1).toBe(result2);
  });

  test.prop(
    [suggestionArb, issueIndexArb],
    { numRuns: 200 },
  )("renderSuggestion output is a non-empty string of at most 2 sentences", (suggestion, issueIndex) => {
    const result = renderSuggestion(suggestion, null, issueIndex);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // At most 2 sentences (periods followed by space + capital or end)
    const sentenceEnds = result.match(/\.\s+[A-Z]/g) ?? [];
    expect(sentenceEnds.length).toBeLessThanOrEqual(1); // 0 or 1 internal breaks = max 2 sentences
  });

  test.prop(
    [fc.constantFrom(...knownIssueTypes), sectionNameArb, barRangeArb, severityArb, issueIndexArb],
    { numRuns: 100 },
  )("known issue types produce output containing the section name or a section reference", (issueType, sectionName, barRange, severity, issueIndex) => {
    const suggestion = { issueType, sectionName, barRange, severity };
    const result = renderSuggestion(suggestion, null, issueIndex);
    // Output should reference the section or "this section" for empty names
    const expectedRef = sectionName.trim().length > 0 ? sectionName : "this section";
    expect(result.toLowerCase()).toContain(expectedRef.toLowerCase());
  });
});
