/**
 * Energy weights loader module.
 *
 * Statically imports energy-weights.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as suggestion-loader.ts.
 */
import { deepFreeze, createFailHelper } from "./loader-utils.js";
import energyWeightsData from "../data/scoring/energy-weights.json" with { type: "json" };
import type { EnergyWeights, GenreThresholdProfile } from "./genre-profile-types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const REQUIRED_WEIGHT_FIELDS: readonly (keyof EnergyWeights)[] = [
  "trackCountWeight",
  "midiDensityWeight",
  "trackPresenceWeight",
  "automationWeight",
  "frequencyCoverageWeight",
  "velocityIntensityWeight",
  "polyphonyScoreWeight",
  "pitchRangeWeight",
] as const;

const THRESHOLD_FIELDS: readonly (keyof GenreThresholdProfile)[] = [
  "flatEnergyDelta",
  "repetitionSimilarity",
  "abruptChangeDelta",
  "crowdingTrackCount",
  "introMinBars",
  "outroMinBars",
] as const;

const WEIGHT_SUM_TOLERANCE = 0.001;

// ─── Validation helpers ──────────────────────────────────────────────────────

const fail = createFailHelper('energy-weights.json');

/**
 * Validates that an object contains all required EnergyWeights fields
 * with finite numeric values in [0, 1].
 *
 * For weight sets named "withAudio", also validates audioEnergyWeight.
 */
export function validateWeightSet(obj: unknown, name: string): EnergyWeights {
  if (obj === null || typeof obj !== "object") {
    fail(name, `expected object, got ${obj === null ? "null" : typeof obj}`);
  }

  const record = obj as Record<string, unknown>;

  // Validate the 8 required fields
  for (const field of REQUIRED_WEIGHT_FIELDS) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `${name}.${field}`,
        `expected finite number in [0, 1], got ${String(value)}`
      );
    }
    if (value < 0 || value > 1) {
      fail(`${name}.${field}`, `expected finite number in [0, 1], got ${value}`);
    }
  }

  // For withAudio, validate audioEnergyWeight
  if (name.endsWith("withAudio")) {
    const audioValue = record["audioEnergyWeight"];
    if (typeof audioValue !== "number" || !Number.isFinite(audioValue)) {
      fail(
        `${name}.audioEnergyWeight`,
        `expected finite number in [0, 1], got ${String(audioValue)}`
      );
    }
    if (audioValue < 0 || audioValue > 1) {
      fail(
        `${name}.audioEnergyWeight`,
        `expected finite number in [0, 1], got ${audioValue}`
      );
    }
  }

  return obj as EnergyWeights;
}

/**
 * Validates that the sum of weight values equals 1.0 within tolerance.
 *
 * For base/withAls: sum of 8 required fields.
 * For withAudio: sum of 8 required fields + audioEnergyWeight.
 */
export function validateWeightSum(weights: EnergyWeights, name: string): void {
  let sum = 0;
  for (const field of REQUIRED_WEIGHT_FIELDS) {
    // All required fields are guaranteed present after validateWeightSet
    sum += weights[field] as number;
  }

  // Include audioEnergyWeight in sum if present
  if (weights.audioEnergyWeight !== undefined) {
    sum += weights.audioEnergyWeight;
  }

  if (Math.abs(sum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    fail(name, `weight sum ${sum} is not within ${WEIGHT_SUM_TOLERANCE} of 1.0`);
  }
}

/**
 * Validates that an object contains all 6 GenreThresholdProfile fields
 * with finite positive numbers.
 */
export function validateThresholdProfile(
  obj: unknown
): GenreThresholdProfile {
  if (obj === null || typeof obj !== "object") {
    fail(
      "defaultThresholds",
      `expected object, got ${obj === null ? "null" : typeof obj}`
    );
  }

  const record = obj as Record<string, unknown>;

  for (const field of THRESHOLD_FIELDS) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `defaultThresholds.${field}`,
        `expected finite positive number, got ${String(value)}`
      );
    }
    if (value <= 0) {
      fail(
        `defaultThresholds.${field}`,
        `expected finite positive number, got ${value}`
      );
    }
  }

  return obj as GenreThresholdProfile;
}

// ─── Top-level file validation ───────────────────────────────────────────────

interface ValidatedEnergyWeightsFile {
  defaultWeights: {
    base: EnergyWeights;
    withAls: EnergyWeights;
    withAudio: EnergyWeights;
  };
  defaultThresholds: GenreThresholdProfile;
  defaultDeviationThresholdDb: number;
  rhythmicDeviationThreshold: number;
}

/**
 * Validates the entire energy-weights.json structure.
 * Throws descriptive errors on any validation failure.
 */
export function validateEnergyWeightsFile(
  data: unknown
): ValidatedEnergyWeightsFile {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate defaultWeights structure ──
  const defaultWeights = root["defaultWeights"];
  if (defaultWeights === null || typeof defaultWeights !== "object") {
    fail(
      "defaultWeights",
      `expected object, got ${defaultWeights === null ? "null" : typeof defaultWeights}`
    );
  }

  const weightsObj = defaultWeights as Record<string, unknown>;
  const requiredWeightKeys = ["base", "withAls", "withAudio"] as const;

  for (const key of requiredWeightKeys) {
    if (!(key in weightsObj)) {
      fail("defaultWeights", `missing required key "${key}"`);
    }
  }

  // Validate each weight set
  const base = validateWeightSet(
    weightsObj["base"],
    "defaultWeights.base"
  );
  validateWeightSum(base, "defaultWeights.base");

  const withAls = validateWeightSet(
    weightsObj["withAls"],
    "defaultWeights.withAls"
  );
  validateWeightSum(withAls, "defaultWeights.withAls");

  const withAudio = validateWeightSet(
    weightsObj["withAudio"],
    "defaultWeights.withAudio"
  );
  validateWeightSum(withAudio, "defaultWeights.withAudio");

  // ── Validate defaultThresholds ──
  const thresholds = root["defaultThresholds"];
  const validatedThresholds = validateThresholdProfile(thresholds);

  // ── Validate defaultDeviationThresholdDb ──
  const deviationDb = root["defaultDeviationThresholdDb"];
  if (typeof deviationDb !== "number" || !Number.isFinite(deviationDb)) {
    fail(
      "defaultDeviationThresholdDb",
      `expected finite positive number, got ${String(deviationDb)}`
    );
  }
  if (deviationDb <= 0) {
    fail(
      "defaultDeviationThresholdDb",
      `expected finite positive number, got ${deviationDb}`
    );
  }

  // ── Validate rhythmicDeviationThreshold ──
  const rhythmic = root["rhythmicDeviationThreshold"];
  if (typeof rhythmic !== "number" || !Number.isFinite(rhythmic)) {
    fail(
      "rhythmicDeviationThreshold",
      `expected number in (0, 1) exclusive, got ${String(rhythmic)}`
    );
  }
  if (rhythmic <= 0 || rhythmic >= 1) {
    fail(
      "rhythmicDeviationThreshold",
      `expected number in (0, 1) exclusive, got ${rhythmic}`
    );
  }

  return {
    defaultWeights: { base, withAls, withAudio },
    defaultThresholds: validatedThresholds,
    defaultDeviationThresholdDb: deviationDb,
    rhythmicDeviationThreshold: rhythmic,
  };
}

// ─── Module initialization (fail-fast) ───────────────────────────────────────

const validated = validateEnergyWeightsFile(energyWeightsData);

// Frozen typed objects — prevent mutation
const BASE_WEIGHTS: EnergyWeights = Object.freeze(validated.defaultWeights.base);
const ALS_WEIGHTS: EnergyWeights = Object.freeze(validated.defaultWeights.withAls);
const AUDIO_WEIGHTS: EnergyWeights = Object.freeze(validated.defaultWeights.withAudio);
const DEFAULT_THRESHOLDS: GenreThresholdProfile = Object.freeze(
  validated.defaultThresholds
);
const DEVIATION_THRESHOLD_DB: number = validated.defaultDeviationThresholdDb;
const RHYTHMIC_THRESHOLD: number = validated.rhythmicDeviationThreshold;

// ─── Accessor Functions ──────────────────────────────────────────────────────

/** Returns the base energy weights (no .als data available). */
export function getBaseWeights(): EnergyWeights {
  return BASE_WEIGHTS;
}

/** Returns the energy weights when .als automation data is available. */
export function getAlsWeights(): EnergyWeights {
  return ALS_WEIGHTS;
}

/** Returns the energy weights when audio content analysis is available. */
export function getAudioWeights(): EnergyWeights {
  return AUDIO_WEIGHTS;
}

/** Returns the default genre threshold profile for issue detection. */
export function getDefaultThresholds(): GenreThresholdProfile {
  return DEFAULT_THRESHOLDS;
}

/** Returns the default frequency deviation threshold in dB. */
export function getDeviationThresholdDb(): number {
  return DEVIATION_THRESHOLD_DB;
}

/** Returns the default rhythmic deviation threshold (0–1 exclusive). */
export function getRhythmicDeviationThreshold(): number {
  return RHYTHMIC_THRESHOLD;
}