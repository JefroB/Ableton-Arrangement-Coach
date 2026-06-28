/**
 * Suggestion Loader Module
 *
 * Statically imports 5 suggestion vocabulary JSON files and validates their
 * structure at module initialization. Exposes typed data to the suggestion
 * renderer via accessor functions.
 *
 * esbuild resolves these imports at build time — no filesystem access at runtime.
 */

// ═══════════════════════════════════════════════════════════════════════
// Static JSON Imports — resolved at build time by esbuild
// ═══════════════════════════════════════════════════════════════════════

import leadingVerbsJson from "../data/suggestions/leading-verbs.json" with { type: "json" };
import secondSentencesJson from "../data/suggestions/second-sentences.json" with { type: "json" };
import variationTechniquesJson from "../data/suggestions/variation-techniques.json" with { type: "json" };
import genreTechniquesJson from "../data/suggestions/genre-techniques.json" with { type: "json" };
import audioVariationJson from "../data/suggestions/audio-variation-strategies.json" with { type: "json" };

// ═══════════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════════

/** Maps issue type identifiers to arrays of leading verb strings. */
export type LeadingVerbsData = Record<string, readonly string[]>;

/** Maps issue type identifiers to arrays of explanatory sentence strings. */
export type SecondSentencesData = Record<string, readonly string[]>;

/** Container for the generic variation techniques pool. */
export interface VariationTechniquesData {
  readonly techniques: readonly string[];
}

/** Maps genre family identifiers to arrays of genre-specific technique strings. */
export type GenreTechniquesData = Record<string, readonly string[]>;

/** Groups audio-specific data: strategies, generic verbs, transitions, and framing modes. */
export interface AudioVariationData {
  readonly strategies: readonly string[];
  readonly genericVerbs: readonly string[];
  readonly genericTransitions: readonly string[];
  readonly framingModes: readonly string[];
}

/** Complete suggestion data bundle returned by loadAllSuggestionData(). */
export interface AllSuggestionData {
  readonly leadingVerbs: LeadingVerbsData;
  readonly secondSentences: SecondSentencesData;
  readonly variationTechniques: VariationTechniquesData;
  readonly genreTechniques: GenreTechniquesData;
  readonly audioVariation: AudioVariationData;
}

// ═══════════════════════════════════════════════════════════════════════
// Validation Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate that a value is a non-empty array of non-empty strings.
 * @throws Error with fileName, fieldName, and constraint violated
 */
export function validateNonEmptyStringArray(
  arr: unknown,
  fileName: string,
  fieldName: string,
): void {
  if (!Array.isArray(arr)) {
    throw new Error(
      `Suggestion file ${fileName}: field '${fieldName}' is not an array`,
    );
  }
  if (arr.length === 0) {
    throw new Error(
      `Suggestion file ${fileName}: field '${fieldName}' has an empty array`,
    );
  }
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string") {
      throw new Error(
        `Suggestion file ${fileName}: field '${fieldName}' contains non-string element at index ${i}`,
      );
    }
    if ((arr[i] as string).length === 0) {
      throw new Error(
        `Suggestion file ${fileName}: field '${fieldName}' contains empty string at index ${i}`,
      );
    }
  }
}

/**
 * Validate a Record<string, string[]> structure.
 * Used for leading-verbs, second-sentences, and genre-techniques.
 * @throws Error if value is not a plain object, has zero keys,
 *   any value is not an array, any array is empty, or any element is not a non-empty string.
 */
export function validateStringArrayRecord(
  data: unknown,
  fileName: string,
): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      `Suggestion file ${fileName}: expected a plain object, got ${Array.isArray(data) ? "array" : typeof data}`,
    );
  }
  const keys = Object.keys(data);
  if (keys.length === 0) {
    throw new Error(
      `Suggestion file ${fileName}: object must have at least one key`,
    );
  }
  for (const key of keys) {
    const value = (data as Record<string, unknown>)[key];
    if (!Array.isArray(value)) {
      throw new Error(
        `Suggestion file ${fileName}: key '${key}' value is not an array`,
      );
    }
    if (value.length === 0) {
      throw new Error(
        `Suggestion file ${fileName}: key '${key}' has an empty array`,
      );
    }
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== "string") {
        throw new Error(
          `Suggestion file ${fileName}: key '${key}' contains non-string element at index ${i}`,
        );
      }
      if ((value[i] as string).length === 0) {
        throw new Error(
          `Suggestion file ${fileName}: key '${key}' contains empty string at index ${i}`,
        );
      }
    }
  }
}

/**
 * Validate variation-techniques.json structure.
 * Checks: top-level is object, has `techniques` field, field is non-empty string array.
 */
export function validateVariationTechniques(
  data: unknown,
  fileName: string,
): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      `Suggestion file ${fileName}: expected a plain object, got ${Array.isArray(data) ? "array" : typeof data}`,
    );
  }
  const obj = data as Record<string, unknown>;
  if (!("techniques" in obj)) {
    throw new Error(
      `Suggestion file ${fileName}: missing required field 'techniques'`,
    );
  }
  validateNonEmptyStringArray(obj.techniques, fileName, "techniques");
}

/**
 * Validate audio-variation-strategies.json structure.
 * Checks: top-level is object, has all 4 required fields, each is non-empty string array.
 */
export function validateAudioVariationData(
  data: unknown,
  fileName: string,
): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      `Suggestion file ${fileName}: expected a plain object, got ${Array.isArray(data) ? "array" : typeof data}`,
    );
  }
  const obj = data as Record<string, unknown>;
  const requiredFields = ["strategies", "genericVerbs", "genericTransitions", "framingModes"] as const;
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new Error(
        `Suggestion file ${fileName}: missing required field '${field}'`,
      );
    }
    validateNonEmptyStringArray(obj[field], fileName, field);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Module Initialization — Validate all imports
// ═══════════════════════════════════════════════════════════════════════

validateStringArrayRecord(leadingVerbsJson, "leading-verbs.json");
validateStringArrayRecord(secondSentencesJson, "second-sentences.json");
validateVariationTechniques(variationTechniquesJson, "variation-techniques.json");
validateStringArrayRecord(genreTechniquesJson, "genre-techniques.json");
validateAudioVariationData(audioVariationJson, "audio-variation-strategies.json");

// ═══════════════════════════════════════════════════════════════════════
// Accessor Functions
// ═══════════════════════════════════════════════════════════════════════

/** Returns the complete validated suggestion data bundle. */
export function loadAllSuggestionData(): AllSuggestionData {
  return {
    leadingVerbs: leadingVerbsJson as unknown as LeadingVerbsData,
    secondSentences: secondSentencesJson as unknown as SecondSentencesData,
    variationTechniques: variationTechniquesJson as unknown as VariationTechniquesData,
    genreTechniques: genreTechniquesJson as unknown as GenreTechniquesData,
    audioVariation: audioVariationJson as unknown as AudioVariationData,
  };
}

/** Returns leading verbs data only. Enables incremental migration. */
export function getLeadingVerbs(): LeadingVerbsData {
  return leadingVerbsJson as unknown as LeadingVerbsData;
}

/** Returns second sentences data only. */
export function getSecondSentences(): SecondSentencesData {
  return secondSentencesJson as unknown as SecondSentencesData;
}

/** Returns variation techniques data only. */
export function getVariationTechniques(): VariationTechniquesData {
  return variationTechniquesJson as unknown as VariationTechniquesData;
}

/** Returns genre techniques data only. */
export function getGenreTechniques(): GenreTechniquesData {
  return genreTechniquesJson as unknown as GenreTechniquesData;
}

/** Returns audio variation data (strategies, genericVerbs, genericTransitions, framingModes). */
export function getAudioVariation(): AudioVariationData {
  return audioVariationJson as unknown as AudioVariationData;
}
