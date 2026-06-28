/**
 * Transition Loader Module
 *
 * Statically imports the transition configuration JSON file and validates its
 * structure at module initialization. Exposes typed data to the transition
 * engine via accessor functions.
 *
 * esbuild resolves these imports at build time — no filesystem access at runtime.
 */

import type { TransitionCategory, TransitionSize } from "./transition-engine.js";
import transitionConfigJson from "../data/transitions/transition-config.json" with { type: "json" };

// ═══════════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════════

/** Maps each of the 6 TransitionCategory keys to their named technique arrays. */
export type TechniqueNamesData = Record<TransitionCategory, readonly string[]>;

/** Default category priority ordering by energy direction. */
export interface CategoryPrioritiesData {
  readonly positive: readonly TransitionCategory[];
  readonly negative: readonly TransitionCategory[];
  readonly zero: readonly TransitionCategory[];
}

/** Keywords used for section name boundary detection. */
export interface BoundaryKeywordsData {
  readonly drop: readonly string[];
  readonly breakdown: readonly string[];
}

/** Configuration for a single transition size. */
export interface SizeConfigEntry {
  /** Upper bound of absolute energy delta for this size (null = no upper bound / catch-all). */
  readonly maxDelta: number | null;
  /** Number of technique categories to select. */
  readonly techniqueCount: number;
  /** Min and max duration in bars [min, max]. */
  readonly durationBars: readonly [number, number];
  /** Min and max checklist items [min, max]. */
  readonly checklistItems: readonly [number, number];
}

/** Maps each TransitionSize to its configuration. */
export type SizeConfigData = Record<TransitionSize, SizeConfigEntry>;

/** Top-level transition configuration structure. */
export interface TransitionConfigData {
  readonly techniqueNames: TechniqueNamesData;
  readonly categoryPriorities: CategoryPrioritiesData;
  readonly boundaryKeywords: BoundaryKeywordsData;
  readonly sizeConfig: SizeConfigData;
  readonly audioSpectralChangeThreshold: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Validation Functions (exported for testing)
// ═══════════════════════════════════════════════════════════════════════

/** Valid TransitionCategory values for runtime validation. */
const VALID_CATEGORIES: readonly string[] = [
  "riser",
  "drum_fill",
  "filter_sweep",
  "volume_dynamics",
  "impact",
  "textural_fx",
];

/** Valid TransitionSize values for runtime validation. */
const VALID_SIZES: readonly string[] = ["small", "medium", "large"];

/**
 * Validates that a transition config object conforms to all structural constraints.
 * Throws a descriptive Error if any constraint is violated.
 *
 * @param data - The unknown value to validate (typically parsed JSON)
 * @param fileName - The file name to include in error messages
 * @throws Error with fileName, field path, and constraint violated
 */
export function validateTransitionConfig(data: unknown, fileName: string): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      `${fileName}: expected a plain object, got ${Array.isArray(data) ? "array" : typeof data}`,
    );
  }

  const obj = data as Record<string, unknown>;

  // Verify top-level required keys
  const requiredKeys = [
    "techniqueNames",
    "categoryPriorities",
    "boundaryKeywords",
    "sizeConfig",
    "audioSpectralChangeThreshold",
  ] as const;

  for (const key of requiredKeys) {
    if (!(key in obj)) {
      throw new Error(`${fileName}: missing required field '${key}'`);
    }
  }

  // Validate techniqueNames
  validateTechniqueNames(obj.techniqueNames, fileName);

  // Validate categoryPriorities
  validateCategoryPriorities(obj.categoryPriorities, fileName);

  // Validate boundaryKeywords
  validateBoundaryKeywords(obj.boundaryKeywords, fileName);

  // Validate sizeConfig
  validateSizeConfig(obj.sizeConfig, fileName);

  // Validate audioSpectralChangeThreshold
  validateAudioThreshold(obj.audioSpectralChangeThreshold, fileName);
}

/**
 * Validates the techniqueNames field: must be an object with exactly the 6
 * TransitionCategory keys, each value a non-empty array of non-empty strings.
 */
function validateTechniqueNames(value: unknown, fileName: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `${fileName}: techniqueNames is not an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  for (const category of VALID_CATEGORIES) {
    if (!(category in obj)) {
      throw new Error(
        `${fileName}: missing required field 'techniqueNames.${category}'`,
      );
    }
    const arr = obj[category];
    if (!Array.isArray(arr)) {
      throw new Error(
        `${fileName}: techniqueNames.${category} is not an array`,
      );
    }
    if (arr.length === 0) {
      throw new Error(
        `${fileName}: techniqueNames.${category} has an empty array`,
      );
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== "string") {
        throw new Error(
          `${fileName}: techniqueNames.${category}[${i}] is not a string`,
        );
      }
      if ((arr[i] as string).length === 0) {
        throw new Error(
          `${fileName}: techniqueNames.${category}[${i}] is an empty string`,
        );
      }
    }
  }
}

/**
 * Validates the categoryPriorities field: must be an object with keys
 * `positive`, `negative`, `zero`, each a non-empty array of valid TransitionCategory strings.
 */
function validateCategoryPriorities(value: unknown, fileName: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `${fileName}: categoryPriorities is not an object`,
    );
  }

  const obj = value as Record<string, unknown>;
  const directionKeys = ["positive", "negative", "zero"] as const;

  for (const dir of directionKeys) {
    if (!(dir in obj)) {
      throw new Error(
        `${fileName}: missing required field 'categoryPriorities.${dir}'`,
      );
    }
    const arr = obj[dir];
    if (!Array.isArray(arr)) {
      throw new Error(
        `${fileName}: categoryPriorities.${dir} is not an array`,
      );
    }
    if (arr.length === 0) {
      throw new Error(
        `${fileName}: categoryPriorities.${dir} has an empty array`,
      );
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== "string" || !VALID_CATEGORIES.includes(arr[i] as string)) {
        throw new Error(
          `${fileName}: categoryPriorities.${dir} contains invalid category '${String(arr[i])}'`,
        );
      }
    }
  }
}

/**
 * Validates the boundaryKeywords field: must be an object with keys
 * `drop` and `breakdown`, each a non-empty array of non-empty strings.
 */
function validateBoundaryKeywords(value: unknown, fileName: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `${fileName}: boundaryKeywords is not an object`,
    );
  }

  const obj = value as Record<string, unknown>;
  const keywordKeys = ["drop", "breakdown"] as const;

  for (const key of keywordKeys) {
    if (!(key in obj)) {
      throw new Error(
        `${fileName}: missing required field 'boundaryKeywords.${key}'`,
      );
    }
    const arr = obj[key];
    if (!Array.isArray(arr)) {
      throw new Error(
        `${fileName}: boundaryKeywords.${key} is not an array`,
      );
    }
    if (arr.length === 0) {
      throw new Error(
        `${fileName}: boundaryKeywords.${key} has an empty array`,
      );
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== "string") {
        throw new Error(
          `${fileName}: boundaryKeywords.${key}[${i}] is not a string`,
        );
      }
      if ((arr[i] as string).length === 0) {
        throw new Error(
          `${fileName}: boundaryKeywords.${key}[${i}] is an empty string`,
        );
      }
    }
  }
}

/**
 * Validates the sizeConfig field: must be an object with keys `small`, `medium`, `large`,
 * each containing maxDelta (number|null), techniqueCount (positive int),
 * durationBars ([num,num] min≤max, both > 0), checklistItems ([int,int] min≤max, both positive).
 */
function validateSizeConfig(value: unknown, fileName: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `${fileName}: sizeConfig is not an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  for (const size of VALID_SIZES) {
    if (!(size in obj)) {
      throw new Error(
        `${fileName}: missing required field 'sizeConfig.${size}'`,
      );
    }

    const entry = obj[size];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        `${fileName}: sizeConfig.${size} is not an object`,
      );
    }

    const entryObj = entry as Record<string, unknown>;

    // Validate maxDelta: number | null (if number, must be > 0)
    if (!("maxDelta" in entryObj)) {
      throw new Error(
        `${fileName}: missing required field 'sizeConfig.${size}.maxDelta'`,
      );
    }
    if (entryObj.maxDelta !== null) {
      if (typeof entryObj.maxDelta !== "number" || entryObj.maxDelta <= 0) {
        throw new Error(
          `${fileName}: sizeConfig.${size}.maxDelta must be a positive number or null`,
        );
      }
    }

    // Validate techniqueCount: positive integer
    if (!("techniqueCount" in entryObj)) {
      throw new Error(
        `${fileName}: missing required field 'sizeConfig.${size}.techniqueCount'`,
      );
    }
    if (
      typeof entryObj.techniqueCount !== "number" ||
      !Number.isInteger(entryObj.techniqueCount) ||
      entryObj.techniqueCount <= 0
    ) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.techniqueCount must be a positive integer`,
      );
    }

    // Validate durationBars: [number, number] where both > 0 and min ≤ max
    if (!("durationBars" in entryObj)) {
      throw new Error(
        `${fileName}: missing required field 'sizeConfig.${size}.durationBars'`,
      );
    }
    if (!Array.isArray(entryObj.durationBars) || entryObj.durationBars.length !== 2) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.durationBars must be an array of exactly 2 numbers`,
      );
    }
    const [durMin, durMax] = entryObj.durationBars as [unknown, unknown];
    if (typeof durMin !== "number" || durMin <= 0) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.durationBars[0] must be a positive number`,
      );
    }
    if (typeof durMax !== "number" || durMax <= 0) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.durationBars[1] must be a positive number`,
      );
    }
    if (durMin > durMax) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.durationBars min exceeds max`,
      );
    }

    // Validate checklistItems: [number, number] where both positive integers and min ≤ max
    if (!("checklistItems" in entryObj)) {
      throw new Error(
        `${fileName}: missing required field 'sizeConfig.${size}.checklistItems'`,
      );
    }
    if (!Array.isArray(entryObj.checklistItems) || entryObj.checklistItems.length !== 2) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.checklistItems must be an array of exactly 2 integers`,
      );
    }
    const [clMin, clMax] = entryObj.checklistItems as [unknown, unknown];
    if (typeof clMin !== "number" || !Number.isInteger(clMin) || clMin <= 0) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.checklistItems[0] must be a positive integer`,
      );
    }
    if (typeof clMax !== "number" || !Number.isInteger(clMax) || clMax <= 0) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.checklistItems[1] must be a positive integer`,
      );
    }
    if (clMin > clMax) {
      throw new Error(
        `${fileName}: sizeConfig.${size}.checklistItems min exceeds max`,
      );
    }
  }
}

/**
 * Validates the audioSpectralChangeThreshold field: must be a number > 0 and ≤ 1.
 */
function validateAudioThreshold(value: unknown, fileName: string): void {
  if (typeof value !== "number") {
    throw new Error(
      `${fileName}: audioSpectralChangeThreshold must be a number`,
    );
  }
  if (value <= 0 || value > 1) {
    throw new Error(
      `${fileName}: audioSpectralChangeThreshold must be > 0 and <= 1`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Module Initialization — Validate the imported JSON
// ═══════════════════════════════════════════════════════════════════════

validateTransitionConfig(transitionConfigJson, "transition-config.json");

// ═══════════════════════════════════════════════════════════════════════
// Accessor Functions
// ═══════════════════════════════════════════════════════════════════════

/** Returns the complete validated TransitionConfigData object. */
export function loadTransitionConfig(): TransitionConfigData {
  return transitionConfigJson as unknown as TransitionConfigData;
}

/** Returns technique names data only. */
export function getTechniqueNames(): TechniqueNamesData {
  return transitionConfigJson.techniqueNames as unknown as TechniqueNamesData;
}

/** Returns category priorities data only. */
export function getCategoryPriorities(): CategoryPrioritiesData {
  return transitionConfigJson.categoryPriorities as unknown as CategoryPrioritiesData;
}

/** Returns boundary keywords data only. */
export function getBoundaryKeywords(): BoundaryKeywordsData {
  return transitionConfigJson.boundaryKeywords as unknown as BoundaryKeywordsData;
}

/** Returns size config data only. */
export function getSizeConfig(): SizeConfigData {
  return transitionConfigJson.sizeConfig as unknown as SizeConfigData;
}

/** Returns the audio spectral change threshold value. */
export function getAudioSpectralChangeThreshold(): number {
  return transitionConfigJson.audioSpectralChangeThreshold;
}
