// --- src/core/dj-scorer-config-loader.ts ---
import { deepFreeze, createFailHelper } from './loader-utils.js';

/**
 * DJ Scorer configuration loader module.
 *
 * Statically imports dj-scorer-config.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as energy-weights-loader.ts.
 */
import djScorerConfigData from "../data/scoring/dj-scorer-config.json" with { type: "json" };

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ComponentWeights {
  readonly introLength: number;
  readonly outroLength: number;
  readonly phraseAlignment: number;
  readonly mixZoneCleanliness: number;
  readonly tempoConsistency: number;
  readonly energyPositioning: number;
}

export interface SectionLengthScoring {
  readonly minBars: number;
  readonly maxBars: number;
  readonly minScore: number;
  readonly maxScore: number;
}

export interface MixZoneThreshold {
  readonly maxEnergy: number;
  readonly score: number;
}

export interface EnergyPositioningConfig {
  readonly safeThreshold: number;
  readonly penaltyPerUnit: number;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUIRED_TOP_LEVEL_KEYS = [
  "nonDjFamilies",
  "componentWeights",
  "sectionLengthScoring",
  "mixZoneThresholds",
  "energyPositioning",
] as const;

const REQUIRED_WEIGHT_KEYS: readonly (keyof ComponentWeights)[] = [
  "introLength",
  "outroLength",
  "phraseAlignment",
  "mixZoneCleanliness",
  "tempoConsistency",
  "energyPositioning",
] as const;

const REQUIRED_SECTION_KEYS: readonly (keyof SectionLengthScoring)[] = [
  "minBars",
  "maxBars",
  "minScore",
  "maxScore",
] as const;

const REQUIRED_ENERGY_POS_KEYS: readonly (keyof EnergyPositioningConfig)[] = [
  "safeThreshold",
  "penaltyPerUnit",
] as const;

const WEIGHT_SUM_TOLERANCE = 0.001;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('dj-scorer-config.json');

/**
 * Validates the entire dj-scorer-config.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
function validateDjScorerConfigFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate exactly 5 top-level keys ──
  const actualKeys = Object.keys(root);
  if (actualKeys.length !== 5) {
    fail(
      "(root)",
      `expected exactly 5 top-level keys, got ${actualKeys.length}: [${actualKeys.join(", ")}]`
    );
  }
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in root)) {
      fail("(root)", `missing required key "${key}"`);
    }
  }

  // ── Validate nonDjFamilies ──
  const nonDjFamilies = root["nonDjFamilies"];
  if (!Array.isArray(nonDjFamilies)) {
    fail("nonDjFamilies", `expected array, got ${typeof nonDjFamilies}`);
  }
  if (nonDjFamilies.length === 0) {
    fail("nonDjFamilies", "expected non-empty array");
  }
  for (let i = 0; i < nonDjFamilies.length; i++) {
    const entry = nonDjFamilies[i];
    if (typeof entry !== "string") {
      fail(`nonDjFamilies[${i}]`, `expected string, got ${typeof entry}`);
    }
    if (entry.length === 0) {
      fail(`nonDjFamilies[${i}]`, "expected non-empty string");
    }
  }

  // ── Validate componentWeights ──
  const componentWeights = root["componentWeights"];
  if (componentWeights === null || typeof componentWeights !== "object" || Array.isArray(componentWeights)) {
    fail("componentWeights", `expected object, got ${componentWeights === null ? "null" : Array.isArray(componentWeights) ? "array" : typeof componentWeights}`);
  }

  const weightsObj = componentWeights as Record<string, unknown>;
  const weightKeys = Object.keys(weightsObj);

  if (weightKeys.length !== 6) {
    fail(
      "componentWeights",
      `expected exactly 6 keys, got ${weightKeys.length}: [${weightKeys.join(", ")}]`
    );
  }

  for (const key of REQUIRED_WEIGHT_KEYS) {
    if (!(key in weightsObj)) {
      fail("componentWeights", `missing required key "${key}"`);
    }
  }

  let weightSum = 0;
  for (const key of REQUIRED_WEIGHT_KEYS) {
    const value = weightsObj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `componentWeights.${key}`,
        `expected finite positive number, got ${String(value)}`
      );
    }
    if (value <= 0) {
      fail(
        `componentWeights.${key}`,
        `expected finite positive number, got ${value}`
      );
    }
    weightSum += value;
  }

  if (Math.abs(weightSum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    fail(
      "componentWeights",
      `weight sum ${weightSum} is not within ${WEIGHT_SUM_TOLERANCE} of 1.0`
    );
  }

  // ── Validate sectionLengthScoring ──
  const sectionLengthScoring = root["sectionLengthScoring"];
  if (sectionLengthScoring === null || typeof sectionLengthScoring !== "object" || Array.isArray(sectionLengthScoring)) {
    fail("sectionLengthScoring", `expected object, got ${sectionLengthScoring === null ? "null" : Array.isArray(sectionLengthScoring) ? "array" : typeof sectionLengthScoring}`);
  }

  const sectionObj = sectionLengthScoring as Record<string, unknown>;
  const sectionKeys = Object.keys(sectionObj);

  if (sectionKeys.length !== 4) {
    fail(
      "sectionLengthScoring",
      `expected exactly 4 keys, got ${sectionKeys.length}: [${sectionKeys.join(", ")}]`
    );
  }

  for (const key of REQUIRED_SECTION_KEYS) {
    if (!(key in sectionObj)) {
      fail("sectionLengthScoring", `missing required key "${key}"`);
    }
  }

  const minBars = sectionObj["minBars"];
  const maxBars = sectionObj["maxBars"];
  const minScore = sectionObj["minScore"];
  const maxScore = sectionObj["maxScore"];

  if (typeof minBars !== "number" || !Number.isInteger(minBars) || minBars <= 0) {
    fail("sectionLengthScoring.minBars", `expected positive integer, got ${String(minBars)}`);
  }
  if (typeof maxBars !== "number" || !Number.isInteger(maxBars) || maxBars <= 0) {
    fail("sectionLengthScoring.maxBars", `expected positive integer, got ${String(maxBars)}`);
  }
  if (minBars >= maxBars) {
    fail("sectionLengthScoring.minBars", `minBars (${minBars}) must be less than maxBars (${maxBars})`);
  }

  if (typeof minScore !== "number" || !Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    fail("sectionLengthScoring.minScore", `expected number in 0–100, got ${String(minScore)}`);
  }
  if (typeof maxScore !== "number" || !Number.isFinite(maxScore) || maxScore < 0 || maxScore > 100) {
    fail("sectionLengthScoring.maxScore", `expected number in 0–100, got ${String(maxScore)}`);
  }
  if (minScore >= maxScore) {
    fail("sectionLengthScoring.minScore", `minScore (${minScore}) must be less than maxScore (${maxScore})`);
  }

  // ── Validate mixZoneThresholds ──
  const mixZoneThresholds = root["mixZoneThresholds"];
  if (!Array.isArray(mixZoneThresholds)) {
    fail("mixZoneThresholds", `expected array, got ${typeof mixZoneThresholds}`);
  }
  if (mixZoneThresholds.length === 0) {
    fail("mixZoneThresholds", "expected non-empty array");
  }

  let prevMaxEnergy = -Infinity;
  for (let i = 0; i < mixZoneThresholds.length; i++) {
    const entry = mixZoneThresholds[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`mixZoneThresholds[${i}]`, `expected object, got ${entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry}`);
    }

    const entryObj = entry as Record<string, unknown>;
    const maxEnergy = entryObj["maxEnergy"];
    const score = entryObj["score"];

    if (typeof maxEnergy !== "number" || !Number.isFinite(maxEnergy) || maxEnergy <= 0) {
      fail(`mixZoneThresholds[${i}].maxEnergy`, `expected finite positive number, got ${String(maxEnergy)}`);
    }
    if (maxEnergy <= prevMaxEnergy) {
      fail(
        `mixZoneThresholds[${i}].maxEnergy`,
        `entries must be in strictly ascending order (${maxEnergy} <= previous ${prevMaxEnergy})`
      );
    }
    prevMaxEnergy = maxEnergy;

    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
      fail(`mixZoneThresholds[${i}].score`, `expected number in 0–100, got ${String(score)}`);
    }
  }

  // ── Validate energyPositioning ──
  const energyPositioning = root["energyPositioning"];
  if (energyPositioning === null || typeof energyPositioning !== "object" || Array.isArray(energyPositioning)) {
    fail("energyPositioning", `expected object, got ${energyPositioning === null ? "null" : Array.isArray(energyPositioning) ? "array" : typeof energyPositioning}`);
  }

  const energyObj = energyPositioning as Record<string, unknown>;
  const energyKeys = Object.keys(energyObj);

  if (energyKeys.length !== 2) {
    fail(
      "energyPositioning",
      `expected exactly 2 keys, got ${energyKeys.length}: [${energyKeys.join(", ")}]`
    );
  }

  for (const key of REQUIRED_ENERGY_POS_KEYS) {
    if (!(key in energyObj)) {
      fail("energyPositioning", `missing required key "${key}"`);
    }
  }

  for (const key of REQUIRED_ENERGY_POS_KEYS) {
    const value = energyObj[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      fail(`energyPositioning.${key}`, `expected finite positive number, got ${String(value)}`);
    }
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateDjScorerConfigFile(djScorerConfigData);

// Cast validated data to typed structures
const validatedData = djScorerConfigData as unknown as {
  nonDjFamilies: string[];
  componentWeights: ComponentWeights;
  sectionLengthScoring: SectionLengthScoring;
  mixZoneThresholds: MixZoneThreshold[];
  energyPositioning: EnergyPositioningConfig;
};

// Deep freeze all data structures
const FROZEN_NON_DJ_FAMILIES: readonly string[] = deepFreeze([...validatedData.nonDjFamilies]);
const FROZEN_COMPONENT_WEIGHTS: ComponentWeights = deepFreeze({ ...validatedData.componentWeights });
const FROZEN_SECTION_LENGTH_SCORING: SectionLengthScoring = deepFreeze({ ...validatedData.sectionLengthScoring });
const FROZEN_MIX_ZONE_THRESHOLDS: readonly MixZoneThreshold[] = deepFreeze(
  validatedData.mixZoneThresholds.map((t) => ({ ...t }))
);
const FROZEN_ENERGY_POSITIONING: EnergyPositioningConfig = deepFreeze({ ...validatedData.energyPositioning });

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the list of genre families for which DJ scoring is inapplicable. */
export function getNonDjFamilies(): readonly string[] {
  return FROZEN_NON_DJ_FAMILIES;
}

/** Returns the 6 component weights for DJ score calculation. */
export function getComponentWeights(): ComponentWeights {
  return FROZEN_COMPONENT_WEIGHTS;
}

/** Returns the section length scoring thresholds (minBars, maxBars, minScore, maxScore). */
export function getSectionLengthScoring(): SectionLengthScoring {
  return FROZEN_SECTION_LENGTH_SCORING;
}

/** Returns the mix zone energy-to-score threshold breakpoints in ascending maxEnergy order. */
export function getMixZoneThresholds(): readonly MixZoneThreshold[] {
  return FROZEN_MIX_ZONE_THRESHOLDS;
}

/** Returns the energy positioning configuration (safeThreshold, penaltyPerUnit). */
export function getEnergyPositioning(): EnergyPositioningConfig {
  return FROZEN_ENERGY_POSITIONING;
}