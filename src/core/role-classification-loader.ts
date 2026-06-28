/**
 * Role classification loader module.
 *
 * Statically imports role-classification.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as dj-scorer-config-loader.ts
 * and track-patterns-loader.ts.
 */
import roleClassificationData from "../data/detection/role-classification.json" with { type: "json" };
import { deepFreeze, createFailHelper } from './loader-utils.js';

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DrumsThresholds {
  readonly transientDensityMin: number;
  readonly maxBandFractionCeiling: number;
}

export interface VocalThresholds {
  readonly centroidMin: number;
  readonly highCentroidFrameFraction: number;
  readonly formantFractionMin: number;
  readonly formantCountMin: number;
}

export interface BassThresholds {
  readonly energyFractionMin: number;
  readonly frequencyCeiling: number;
  readonly transientDensityCeiling: number;
}

export interface SynthLeadThresholds {
  readonly energyFractionMin: number;
  readonly lowFrequencyBound: number;
  readonly highFrequencyBound: number;
  readonly transientDensityCeiling: number;
}

export interface SynthPadThresholds {
  readonly energyFractionMin: number;
  readonly lowFrequencyBound: number;
  readonly highFrequencyBound: number;
  readonly transientDensityCeiling: number;
  readonly spectralFluxCeiling: number;
}

export interface FullMixThresholds {
  readonly maxBandFractionCeiling: number;
  readonly transientDensityLow: number;
  readonly transientDensityHigh: number;
}

export interface RoleThresholds {
  readonly drums: DrumsThresholds;
  readonly vocal: VocalThresholds;
  readonly bass: BassThresholds;
  readonly synthLead: SynthLeadThresholds;
  readonly synthPad: SynthPadThresholds;
  readonly fullMix: FullMixThresholds;
}

export interface NameHintPatterns {
  readonly drums: RegExp;
  readonly vocal: RegExp;
  readonly bass: RegExp;
  readonly pad: RegExp;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUIRED_DRUMS_KEYS: readonly (keyof DrumsThresholds)[] = [
  "transientDensityMin",
  "maxBandFractionCeiling",
];

const REQUIRED_VOCAL_KEYS: readonly (keyof VocalThresholds)[] = [
  "centroidMin",
  "highCentroidFrameFraction",
  "formantFractionMin",
  "formantCountMin",
];

const REQUIRED_BASS_KEYS: readonly (keyof BassThresholds)[] = [
  "energyFractionMin",
  "frequencyCeiling",
  "transientDensityCeiling",
];

const REQUIRED_SYNTH_LEAD_KEYS: readonly (keyof SynthLeadThresholds)[] = [
  "energyFractionMin",
  "lowFrequencyBound",
  "highFrequencyBound",
  "transientDensityCeiling",
];

const REQUIRED_SYNTH_PAD_KEYS: readonly (keyof SynthPadThresholds)[] = [
  "energyFractionMin",
  "lowFrequencyBound",
  "highFrequencyBound",
  "transientDensityCeiling",
  "spectralFluxCeiling",
];

const REQUIRED_FULL_MIX_KEYS: readonly (keyof FullMixThresholds)[] = [
  "maxBandFractionCeiling",
  "transientDensityLow",
  "transientDensityHigh",
];

const REQUIRED_NAME_HINT_KEYS: readonly (keyof NameHintPatterns)[] = [
  "drums",
  "vocal",
  "bass",
  "pad",
];

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('role-classification.json');

/**
 * Validates that all keys in a threshold object are finite numbers.
 */
function validateThresholdFields(
  obj: Record<string, unknown>,
  rolePath: string,
  requiredKeys: readonly string[]
): void {
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      fail(`${rolePath}.${key}`, "must be a finite number, got undefined");
    }
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(`${rolePath}.${key}`, `must be a finite number, got ${String(value)}`);
    }
  }
}

/**
 * Validates the entire role-classification.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateRoleClassificationFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate thresholds object ──
  const thresholds = root["thresholds"];
  if (thresholds === null || typeof thresholds !== "object" || Array.isArray(thresholds)) {
    fail("thresholds", `expected object, got ${thresholds === null ? "null" : Array.isArray(thresholds) ? "array" : typeof thresholds}`);
  }

  const thresholdsObj = thresholds as Record<string, unknown>;

  // ── Validate drums thresholds ──
  const drums = thresholdsObj["drums"];
  if (drums === null || typeof drums !== "object" || Array.isArray(drums)) {
    fail("thresholds.drums", `expected object, got ${drums === null ? "null" : Array.isArray(drums) ? "array" : typeof drums}`);
  }
  validateThresholdFields(drums as Record<string, unknown>, "thresholds.drums", REQUIRED_DRUMS_KEYS);

  // ── Validate vocal thresholds ──
  const vocal = thresholdsObj["vocal"];
  if (vocal === null || typeof vocal !== "object" || Array.isArray(vocal)) {
    fail("thresholds.vocal", `expected object, got ${vocal === null ? "null" : Array.isArray(vocal) ? "array" : typeof vocal}`);
  }
  validateThresholdFields(vocal as Record<string, unknown>, "thresholds.vocal", REQUIRED_VOCAL_KEYS);

  // ── Validate bass thresholds ──
  const bass = thresholdsObj["bass"];
  if (bass === null || typeof bass !== "object" || Array.isArray(bass)) {
    fail("thresholds.bass", `expected object, got ${bass === null ? "null" : Array.isArray(bass) ? "array" : typeof bass}`);
  }
  validateThresholdFields(bass as Record<string, unknown>, "thresholds.bass", REQUIRED_BASS_KEYS);

  // ── Validate synthLead thresholds ──
  const synthLead = thresholdsObj["synthLead"];
  if (synthLead === null || typeof synthLead !== "object" || Array.isArray(synthLead)) {
    fail("thresholds.synthLead", `expected object, got ${synthLead === null ? "null" : Array.isArray(synthLead) ? "array" : typeof synthLead}`);
  }
  validateThresholdFields(synthLead as Record<string, unknown>, "thresholds.synthLead", REQUIRED_SYNTH_LEAD_KEYS);

  // ── Validate synthPad thresholds ──
  const synthPad = thresholdsObj["synthPad"];
  if (synthPad === null || typeof synthPad !== "object" || Array.isArray(synthPad)) {
    fail("thresholds.synthPad", `expected object, got ${synthPad === null ? "null" : Array.isArray(synthPad) ? "array" : typeof synthPad}`);
  }
  validateThresholdFields(synthPad as Record<string, unknown>, "thresholds.synthPad", REQUIRED_SYNTH_PAD_KEYS);

  // ── Validate fullMix thresholds ──
  const fullMix = thresholdsObj["fullMix"];
  if (fullMix === null || typeof fullMix !== "object" || Array.isArray(fullMix)) {
    fail("thresholds.fullMix", `expected object, got ${fullMix === null ? "null" : Array.isArray(fullMix) ? "array" : typeof fullMix}`);
  }
  validateThresholdFields(fullMix as Record<string, unknown>, "thresholds.fullMix", REQUIRED_FULL_MIX_KEYS);

  // ── Validate nameHintPatterns ──
  const nameHintPatterns = root["nameHintPatterns"];
  if (nameHintPatterns === null || typeof nameHintPatterns !== "object" || Array.isArray(nameHintPatterns)) {
    fail("nameHintPatterns", `expected object, got ${nameHintPatterns === null ? "null" : Array.isArray(nameHintPatterns) ? "array" : typeof nameHintPatterns}`);
  }

  const patternsObj = nameHintPatterns as Record<string, unknown>;

  for (const key of REQUIRED_NAME_HINT_KEYS) {
    if (!(key in patternsObj)) {
      fail(`nameHintPatterns.${key}`, "is missing");
    }
    const patternStr = patternsObj[key];
    if (typeof patternStr !== "string") {
      fail(`nameHintPatterns.${key}`, `expected string, got ${typeof patternStr}`);
    }
    try {
      new RegExp(patternStr, "i");
    } catch (e) {
      fail(`nameHintPatterns.${key}`, `is not a valid regex: ${(e as Error).message}`);
    }
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateRoleClassificationFile(roleClassificationData);

// Cast validated data to typed structure
const validatedData = roleClassificationData as unknown as {
  thresholds: {
    drums: DrumsThresholds;
    vocal: VocalThresholds;
    bass: BassThresholds;
    synthLead: SynthLeadThresholds;
    synthPad: SynthPadThresholds;
    fullMix: FullMixThresholds;
  };
  nameHintPatterns: Record<string, string>;
};

// Deep freeze the thresholds
const FROZEN_ROLE_THRESHOLDS: RoleThresholds = deepFreeze({
  drums: { ...validatedData.thresholds.drums },
  vocal: { ...validatedData.thresholds.vocal },
  bass: { ...validatedData.thresholds.bass },
  synthLead: { ...validatedData.thresholds.synthLead },
  synthPad: { ...validatedData.thresholds.synthPad },
  fullMix: { ...validatedData.thresholds.fullMix },
});

// Compile and freeze the regex patterns
const FROZEN_NAME_HINT_PATTERNS: NameHintPatterns = Object.freeze({
  drums: new RegExp(validatedData.nameHintPatterns["drums"]!, "i"),
  vocal: new RegExp(validatedData.nameHintPatterns["vocal"]!, "i"),
  bass: new RegExp(validatedData.nameHintPatterns["bass"]!, "i"),
  pad: new RegExp(validatedData.nameHintPatterns["pad"]!, "i"),
});

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns all role-specific numeric thresholds. */
export function getRoleThresholds(): RoleThresholds {
  return FROZEN_ROLE_THRESHOLDS;
}

/** Returns compiled RegExp objects for name-hint matching. */
export function getNameHintPatterns(): NameHintPatterns {
  return FROZEN_NAME_HINT_PATTERNS;
}