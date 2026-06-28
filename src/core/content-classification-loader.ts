// --- src/core/content-classification-loader.ts ---
import { deepFreeze, createFailHelper } from './loader-utils.js';

/**
 * Content classification configuration loader module.
 *
 * Statically imports content-classification.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as dj-scorer-config-loader.ts.
 */
import contentClassificationData from "../data/categorization/content-classification.json" with { type: "json" };

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SimilarityWeights {
  readonly pitchClass: number;
  readonly rhythmic: number;
  readonly velocity: number;
  readonly density: number;
}

export interface RoleKeywords {
  readonly drums: readonly string[];
  readonly bass: readonly string[];
  readonly lead: readonly string[];
  readonly pad: readonly string[];
  readonly arp: readonly string[];
}

export interface DrumsClassification {
  readonly pitchRangeLow: number;
  readonly pitchRangeHigh: number;
  readonly regularityThreshold: number;
  readonly pitchVarietyPerBeatCeiling: number;
  readonly avgDurationCeiling: number;
}

export interface BassClassification {
  readonly avgPitchCeiling: number;
  readonly avgPolyphonyCeiling: number;
}

export interface ArpeggioClassification {
  readonly densityThreshold: number;
  readonly regularityThreshold: number;
}

export interface PadClassification {
  readonly avgPolyphonyThreshold: number;
  readonly avgDurationThreshold: number;
}

export interface ChordClassification {
  readonly polyphonyLowBound: number;
  readonly polyphonyHighBound: number;
  readonly durationLowBound: number;
  readonly durationHighBound: number;
}

export interface LeadClassification {
  readonly polyphonyCeiling: number;
  readonly avgPitchThreshold: number;
  readonly pitchVarietyThreshold: number;
}

export interface ClassificationThresholds {
  readonly drums: DrumsClassification;
  readonly bass: BassClassification;
  readonly arpeggio: ArpeggioClassification;
  readonly pad: PadClassification;
  readonly chord: ChordClassification;
  readonly lead: LeadClassification;
}

export interface FillDetectionThresholds {
  readonly densityIncreaseFraction: number;
  readonly newPitchClassCountThreshold: number;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEIGHT_SUM_TOLERANCE = 0.001;

const REQUIRED_SIMILARITY_WEIGHT_KEYS: readonly (keyof SimilarityWeights)[] = [
  "pitchClass",
  "rhythmic",
  "velocity",
  "density",
] as const;

const REQUIRED_ROLE_KEYWORD_KEYS: readonly (keyof RoleKeywords)[] = [
  "drums",
  "bass",
  "lead",
  "pad",
  "arp",
] as const;

const REQUIRED_DRUMS_KEYS: readonly (keyof DrumsClassification)[] = [
  "pitchRangeLow",
  "pitchRangeHigh",
  "regularityThreshold",
  "pitchVarietyPerBeatCeiling",
  "avgDurationCeiling",
] as const;

const REQUIRED_BASS_KEYS: readonly (keyof BassClassification)[] = [
  "avgPitchCeiling",
  "avgPolyphonyCeiling",
] as const;

const REQUIRED_ARPEGGIO_KEYS: readonly (keyof ArpeggioClassification)[] = [
  "densityThreshold",
  "regularityThreshold",
] as const;

const REQUIRED_PAD_KEYS: readonly (keyof PadClassification)[] = [
  "avgPolyphonyThreshold",
  "avgDurationThreshold",
] as const;

const REQUIRED_CHORD_KEYS: readonly (keyof ChordClassification)[] = [
  "polyphonyLowBound",
  "polyphonyHighBound",
  "durationLowBound",
  "durationHighBound",
] as const;

const REQUIRED_LEAD_KEYS: readonly (keyof LeadClassification)[] = [
  "polyphonyCeiling",
  "avgPitchThreshold",
  "pitchVarietyThreshold",
] as const;

const REQUIRED_FILL_DETECTION_KEYS: readonly (keyof FillDetectionThresholds)[] = [
  "densityIncreaseFraction",
  "newPitchClassCountThreshold",
] as const;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('content-classification.json');

/**
 * Validates a sub-object ensuring all keys map to finite numbers.
 */
function validateFiniteNumberFields(
  obj: Record<string, unknown>,
  parentPath: string,
  requiredKeys: readonly string[]
): void {
  for (const key of requiredKeys) {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `${parentPath}.${key}`,
        `must be a finite number`
      );
    }
  }
}

/**
 * Validates the entire content-classification.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateContentClassificationFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate similarityWeights ──
  const similarityWeights = root["similarityWeights"];
  if (similarityWeights === null || typeof similarityWeights !== "object" || Array.isArray(similarityWeights)) {
    fail("similarityWeights", `expected object, got ${similarityWeights === null ? "null" : Array.isArray(similarityWeights) ? "array" : typeof similarityWeights}`);
  }

  const weightsObj = similarityWeights as Record<string, unknown>;

  let weightSum = 0;
  for (const key of REQUIRED_SIMILARITY_WEIGHT_KEYS) {
    const value = weightsObj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `similarityWeights.${key}`,
        `must be a finite number, got ${String(value)}`
      );
    }
    weightSum += value;
  }

  if (Math.abs(weightSum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    fail(
      "similarityWeights",
      `must sum to 1.0 (±0.001), got ${weightSum}`
    );
  }

  // ── Validate phraseDetectionThreshold ──
  const phraseDetectionThreshold = root["phraseDetectionThreshold"];
  if (typeof phraseDetectionThreshold !== "number" || !Number.isFinite(phraseDetectionThreshold)) {
    fail("phraseDetectionThreshold", `must be a finite number, got ${String(phraseDetectionThreshold)}`);
  }

  // ── Validate roleKeywords ──
  const roleKeywords = root["roleKeywords"];
  if (roleKeywords === null || typeof roleKeywords !== "object" || Array.isArray(roleKeywords)) {
    fail("roleKeywords", `expected object, got ${roleKeywords === null ? "null" : Array.isArray(roleKeywords) ? "array" : typeof roleKeywords}`);
  }

  const keywordsObj = roleKeywords as Record<string, unknown>;

  for (const role of REQUIRED_ROLE_KEYWORD_KEYS) {
    const arr = keywordsObj[role];
    if (!Array.isArray(arr)) {
      fail(`roleKeywords.${role}`, `expected array, got ${typeof arr}`);
    }
    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (typeof entry !== "string") {
        fail(`roleKeywords.${role}[${i}]`, `must be string, got ${typeof entry}`);
      }
      if (entry.length === 0) {
        fail(`roleKeywords.${role}[${i}]`, `is empty string`);
      }
    }
  }

  // ── Validate classificationThresholds ──
  const classificationThresholds = root["classificationThresholds"];
  if (classificationThresholds === null || typeof classificationThresholds !== "object" || Array.isArray(classificationThresholds)) {
    fail("classificationThresholds", `expected object, got ${classificationThresholds === null ? "null" : Array.isArray(classificationThresholds) ? "array" : typeof classificationThresholds}`);
  }

  const thresholdsObj = classificationThresholds as Record<string, unknown>;

  // Validate drums thresholds
  const drums = thresholdsObj["drums"];
  if (drums === null || typeof drums !== "object" || Array.isArray(drums)) {
    fail("classificationThresholds.drums", `expected object, got ${drums === null ? "null" : Array.isArray(drums) ? "array" : typeof drums}`);
  }
  validateFiniteNumberFields(drums as Record<string, unknown>, "classificationThresholds.drums", REQUIRED_DRUMS_KEYS);

  // Validate bass thresholds
  const bass = thresholdsObj["bass"];
  if (bass === null || typeof bass !== "object" || Array.isArray(bass)) {
    fail("classificationThresholds.bass", `expected object, got ${bass === null ? "null" : Array.isArray(bass) ? "array" : typeof bass}`);
  }
  validateFiniteNumberFields(bass as Record<string, unknown>, "classificationThresholds.bass", REQUIRED_BASS_KEYS);

  // Validate arpeggio thresholds
  const arpeggio = thresholdsObj["arpeggio"];
  if (arpeggio === null || typeof arpeggio !== "object" || Array.isArray(arpeggio)) {
    fail("classificationThresholds.arpeggio", `expected object, got ${arpeggio === null ? "null" : Array.isArray(arpeggio) ? "array" : typeof arpeggio}`);
  }
  validateFiniteNumberFields(arpeggio as Record<string, unknown>, "classificationThresholds.arpeggio", REQUIRED_ARPEGGIO_KEYS);

  // Validate pad thresholds
  const pad = thresholdsObj["pad"];
  if (pad === null || typeof pad !== "object" || Array.isArray(pad)) {
    fail("classificationThresholds.pad", `expected object, got ${pad === null ? "null" : Array.isArray(pad) ? "array" : typeof pad}`);
  }
  validateFiniteNumberFields(pad as Record<string, unknown>, "classificationThresholds.pad", REQUIRED_PAD_KEYS);

  // Validate chord thresholds
  const chord = thresholdsObj["chord"];
  if (chord === null || typeof chord !== "object" || Array.isArray(chord)) {
    fail("classificationThresholds.chord", `expected object, got ${chord === null ? "null" : Array.isArray(chord) ? "array" : typeof chord}`);
  }
  validateFiniteNumberFields(chord as Record<string, unknown>, "classificationThresholds.chord", REQUIRED_CHORD_KEYS);

  // Validate lead thresholds
  const lead = thresholdsObj["lead"];
  if (lead === null || typeof lead !== "object" || Array.isArray(lead)) {
    fail("classificationThresholds.lead", `expected object, got ${lead === null ? "null" : Array.isArray(lead) ? "array" : typeof lead}`);
  }
  validateFiniteNumberFields(lead as Record<string, unknown>, "classificationThresholds.lead", REQUIRED_LEAD_KEYS);

  // ── Validate fillDetection ──
  const fillDetection = root["fillDetection"];
  if (fillDetection === null || typeof fillDetection !== "object" || Array.isArray(fillDetection)) {
    fail("fillDetection", `expected object, got ${fillDetection === null ? "null" : Array.isArray(fillDetection) ? "array" : typeof fillDetection}`);
  }
  validateFiniteNumberFields(fillDetection as Record<string, unknown>, "fillDetection", REQUIRED_FILL_DETECTION_KEYS);

  // ── Validate percussionLoopSimilarityThreshold ──
  const percussionLoopSimilarityThreshold = root["percussionLoopSimilarityThreshold"];
  if (typeof percussionLoopSimilarityThreshold !== "number" || !Number.isFinite(percussionLoopSimilarityThreshold)) {
    fail("percussionLoopSimilarityThreshold", `must be a finite number, got ${String(percussionLoopSimilarityThreshold)}`);
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateContentClassificationFile(contentClassificationData);

// Cast validated data to typed structures
const validatedData = contentClassificationData as unknown as {
  similarityWeights: SimilarityWeights;
  phraseDetectionThreshold: number;
  roleKeywords: RoleKeywords;
  classificationThresholds: ClassificationThresholds;
  fillDetection: FillDetectionThresholds;
  percussionLoopSimilarityThreshold: number;
};

// Deep freeze all data structures
const FROZEN_SIMILARITY_WEIGHTS: SimilarityWeights = deepFreeze({ ...validatedData.similarityWeights });
const FROZEN_PHRASE_DETECTION_THRESHOLD: number = validatedData.phraseDetectionThreshold;
const FROZEN_ROLE_KEYWORDS: RoleKeywords = deepFreeze({
  drums: [...validatedData.roleKeywords.drums],
  bass: [...validatedData.roleKeywords.bass],
  lead: [...validatedData.roleKeywords.lead],
  pad: [...validatedData.roleKeywords.pad],
  arp: [...validatedData.roleKeywords.arp],
});
const FROZEN_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = deepFreeze({
  drums: { ...validatedData.classificationThresholds.drums },
  bass: { ...validatedData.classificationThresholds.bass },
  arpeggio: { ...validatedData.classificationThresholds.arpeggio },
  pad: { ...validatedData.classificationThresholds.pad },
  chord: { ...validatedData.classificationThresholds.chord },
  lead: { ...validatedData.classificationThresholds.lead },
});
const FROZEN_FILL_DETECTION_THRESHOLDS: FillDetectionThresholds = deepFreeze({
  ...validatedData.fillDetection,
});
const FROZEN_PERCUSSION_LOOP_SIMILARITY_THRESHOLD: number = validatedData.percussionLoopSimilarityThreshold;

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the 4 similarity weights (sum to 1.0). */
export function getSimilarityWeights(): SimilarityWeights {
  return FROZEN_SIMILARITY_WEIGHTS;
}

/** Returns the phrase detection similarity threshold. */
export function getPhraseDetectionThreshold(): number {
  return FROZEN_PHRASE_DETECTION_THRESHOLD;
}

/** Returns keyword arrays for each instrument role. */
export function getRoleKeywords(): RoleKeywords {
  return FROZEN_ROLE_KEYWORDS;
}

/** Returns classification thresholds for all instrument roles. */
export function getClassificationThresholds(): ClassificationThresholds {
  return FROZEN_CLASSIFICATION_THRESHOLDS;
}

/** Returns fill detection thresholds. */
export function getFillDetectionThresholds(): FillDetectionThresholds {
  return FROZEN_FILL_DETECTION_THRESHOLDS;
}

/** Returns the percussion loop similarity threshold. */
export function getPercussionLoopSimilarityThreshold(): number {
  return FROZEN_PERCUSSION_LOOP_SIMILARITY_THRESHOLD;
}