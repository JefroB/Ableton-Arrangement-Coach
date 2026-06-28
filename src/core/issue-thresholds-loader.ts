/**
 * Issue Thresholds Loader
 *
 * Statically imports issue-thresholds.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed accessor functions returning frozen data.
 */
import issueThresholdsData from "../data/detection/issue-thresholds.json" with { type: "json" };
import type { GenreThresholdProfile } from "./genre-profile-types.js";
import { deepFreeze, createFailHelper } from './loader-utils.js';

export interface NumericThresholds {
  readonly missingTransitionDelta: number;
  readonly buildupDensityPerBar: number;
  readonly frequencyCrowdingInfo: number;
  readonly frequencyCrowdingWarning: number;
  readonly audioOccupiedDbfs: number;
  readonly introEnergyMax: number;
  readonly energyMismatchDelta: number;
  readonly synthDensityMinNotesPerBeat: number;
}

// ——— Constants ————————————————————————————————————————————————————————————————

const THRESHOLD_PROFILE_FIELDS: readonly (keyof GenreThresholdProfile)[] = [
  "flatEnergyDelta",
  "repetitionSimilarity",
  "abruptChangeDelta",
  "crowdingTrackCount",
  "introMinBars",
  "outroMinBars",
] as const;

const NUMERIC_THRESHOLD_POSITIVE_FIELDS: readonly (keyof NumericThresholds)[] = [
  "missingTransitionDelta",
  "buildupDensityPerBar",
  "introEnergyMax",
  "energyMismatchDelta",
  "synthDensityMinNotesPerBeat",
] as const;

const REQUIRED_TOP_LEVEL_KEYS = [
  "defaultThresholds",
  "keywords",
  "genreLists",
  "roles",
  "numericThresholds",
] as const;

const STRING_PATTERN = /^[a-z0-9-]+$/;

// ——— Validation helpers ——————————————————————————————————————————————————————

const fail = createFailHelper('issue-thresholds.json');

/**
 * Validates that a value is a non-empty array of non-empty strings
 * where every element matches /^[a-z0-9-]+$/.
 */
export function validateStringArray(
  arr: unknown,
  fieldPath: string
): readonly string[] {
  if (!Array.isArray(arr)) {
    fail(
      fieldPath,
      `expected non-empty array of strings matching [a-z0-9-]+, got ${arr === null ? "null" : typeof arr}`
    );
  }

  if (arr.length === 0) {
    fail(
      fieldPath,
      `expected non-empty array of strings matching [a-z0-9-]+, got empty array`
    );
  }

  for (let i = 0; i < arr.length; i++) {
    const element = arr[i];
    if (typeof element !== "string" || element === "" || !STRING_PATTERN.test(element)) {
      fail(
        `${fieldPath}[${i}]`,
        `expected non-empty string matching [a-z0-9-]+, got ${JSON.stringify(element)}`
      );
    }
  }

  return arr as readonly string[];
}

/**
 * Validates that an object contains exactly the 6 required GenreThresholdProfile
 * fields with values that are finite positive numbers.
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

  for (const field of THRESHOLD_PROFILE_FIELDS) {
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

/**
 * Validates that an object contains all 8 NumericThresholds fields
 * with correct sign and ordering constraints.
 */
export function validateNumericThresholds(
  obj: unknown
): NumericThresholds {
  if (obj === null || typeof obj !== "object") {
    fail(
      "numericThresholds",
      `expected object, got ${obj === null ? "null" : typeof obj}`
    );
  }

  const record = obj as Record<string, unknown>;

  // Validate positive fields
  for (const field of NUMERIC_THRESHOLD_POSITIVE_FIELDS) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `numericThresholds.${field}`,
        `expected finite positive number, got ${String(value)}`
      );
    }
    if (value <= 0) {
      fail(
        `numericThresholds.${field}`,
        `expected finite positive number, got ${value}`
      );
    }
  }

  // Validate audioOccupiedDbfs — must be finite negative
  const dbfs = record["audioOccupiedDbfs"];
  if (typeof dbfs !== "number" || !Number.isFinite(dbfs)) {
    fail(
      "numericThresholds.audioOccupiedDbfs",
      `expected finite negative number, got ${String(dbfs)}`
    );
  }
  if (dbfs >= 0) {
    fail(
      "numericThresholds.audioOccupiedDbfs",
      `expected finite negative number, got ${dbfs}`
    );
  }

  // Validate frequencyCrowdingWarning — must be positive integer
  const warning = record["frequencyCrowdingWarning"];
  if (
    typeof warning !== "number" ||
    !Number.isFinite(warning) ||
    !Number.isInteger(warning) ||
    warning <= 0
  ) {
    fail(
      "numericThresholds.frequencyCrowdingWarning",
      `expected positive integer, got ${String(warning)}`
    );
  }

  // Validate frequencyCrowdingInfo — must be positive integer strictly < frequencyCrowdingWarning
  const info = record["frequencyCrowdingInfo"];
  if (
    typeof info !== "number" ||
    !Number.isFinite(info) ||
    !Number.isInteger(info) ||
    info <= 0
  ) {
    fail(
      "numericThresholds.frequencyCrowdingInfo",
      `expected positive integer strictly less than frequencyCrowdingWarning (${warning}), got ${String(info)}`
    );
  }
  if (info >= (warning as number)) {
    fail(
      "numericThresholds.frequencyCrowdingInfo",
      `expected positive integer strictly less than frequencyCrowdingWarning (${warning}), got ${info}`
    );
  }

  return obj as NumericThresholds;
}

// ——— Top-level file validation ———————————————————————————————————————————————

interface ValidatedIssueThresholdsFile {
  defaultThresholds: GenreThresholdProfile;
  keywords: {
    transition: readonly string[];
    buildup: readonly string[];
    dropSectionNames: readonly string[];
  };
  genreLists: {
    dropSuppression: readonly string[];
    repetitionTolerant: readonly string[];
    djOriented: readonly string[];
  };
  roles: {
    synthRepetition: readonly string[];
    synthDensity: readonly string[];
  };
  numericThresholds: NumericThresholds;
}

/**
 * Validates the entire issue-thresholds.json structure.
 * Throws descriptive errors on any validation failure.
 */
export function validateIssueThresholdsFile(
  data: unknown
): ValidatedIssueThresholdsFile {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // Verify exactly 5 top-level keys
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in root)) {
      fail("(root)", `missing required key "${key}"`);
    }
  }

  // —— Validate defaultThresholds ——
  const defaultThresholds = validateThresholdProfile(root["defaultThresholds"]);

  // —— Validate keywords ——
  const keywords = root["keywords"];
  if (keywords === null || typeof keywords !== "object") {
    fail("keywords", `expected object, got ${keywords === null ? "null" : typeof keywords}`);
  }
  const kw = keywords as Record<string, unknown>;
  const transition = validateStringArray(kw["transition"], "keywords.transition");
  const buildup = validateStringArray(kw["buildup"], "keywords.buildup");
  const dropSectionNames = validateStringArray(kw["dropSectionNames"], "keywords.dropSectionNames");

  // —— Validate genreLists ——
  const genreLists = root["genreLists"];
  if (genreLists === null || typeof genreLists !== "object") {
    fail("genreLists", `expected object, got ${genreLists === null ? "null" : typeof genreLists}`);
  }
  const gl = genreLists as Record<string, unknown>;
  const dropSuppression = validateStringArray(gl["dropSuppression"], "genreLists.dropSuppression");
  const repetitionTolerant = validateStringArray(gl["repetitionTolerant"], "genreLists.repetitionTolerant");
  const djOriented = validateStringArray(gl["djOriented"], "genreLists.djOriented");

  // —— Validate roles ——
  const roles = root["roles"];
  if (roles === null || typeof roles !== "object") {
    fail("roles", `expected object, got ${roles === null ? "null" : typeof roles}`);
  }
  const r = roles as Record<string, unknown>;
  const synthRepetition = validateStringArray(r["synthRepetition"], "roles.synthRepetition");
  const synthDensity = validateStringArray(r["synthDensity"], "roles.synthDensity");

  // —— Validate numericThresholds ——
  const numericThresholds = validateNumericThresholds(root["numericThresholds"]);

  return {
    defaultThresholds,
    keywords: { transition, buildup, dropSectionNames },
    genreLists: { dropSuppression, repetitionTolerant, djOriented },
    roles: { synthRepetition, synthDensity },
    numericThresholds,
  };
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const validated = validateIssueThresholdsFile(issueThresholdsData);

// Frozen typed objects — prevent mutation
const DEFAULT_THRESHOLDS: GenreThresholdProfile = Object.freeze(validated.defaultThresholds);
const TRANSITION_KEYWORDS: readonly string[] = Object.freeze(validated.keywords.transition);
const BUILDUP_KEYWORDS: readonly string[] = Object.freeze(validated.keywords.buildup);
const DROP_SECTION_NAMES: readonly string[] = Object.freeze(validated.keywords.dropSectionNames);
const DROP_SUPPRESSION_GENRES: readonly string[] = Object.freeze(validated.genreLists.dropSuppression);
const REPETITION_TOLERANT_GENRES: readonly string[] = Object.freeze(validated.genreLists.repetitionTolerant);
const DJ_ORIENTED_GENRES: readonly string[] = Object.freeze(validated.genreLists.djOriented);
const SYNTH_REPETITION_ROLES: readonly string[] = Object.freeze(validated.roles.synthRepetition);
const SYNTH_DENSITY_ROLES: readonly string[] = Object.freeze(validated.roles.synthDensity);
const NUMERIC_THRESHOLDS: NumericThresholds = Object.freeze(validated.numericThresholds);

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the default genre threshold profile for issue detection. */
export function getDefaultThresholds(): GenreThresholdProfile {
  return DEFAULT_THRESHOLDS;
}

/** Returns the transition keyword list (e.g., "riser", "sweep", "fx"). */
export function getTransitionKeywords(): readonly string[] {
  return TRANSITION_KEYWORDS;
}

/** Returns the buildup keyword list (e.g., "riser", "sweep"). */
export function getBuildupKeywords(): readonly string[] {
  return BUILDUP_KEYWORDS;
}

/** Returns the drop section name list (e.g., "drop", "main", "peak"). */
export function getDropSectionNames(): readonly string[] {
  return DROP_SECTION_NAMES;
}

/** Returns genres that suppress abrupt-change detection at drops. */
export function getDropSuppressionGenres(): readonly string[] {
  return DROP_SUPPRESSION_GENRES;
}

/** Returns genres that tolerate repetitive patterns. */
export function getRepetitionTolerantGenres(): readonly string[] {
  return REPETITION_TOLERANT_GENRES;
}

/** Returns genres oriented toward DJ mixing/performance. */
export function getDjOrientedGenres(): readonly string[] {
  return DJ_ORIENTED_GENRES;
}

/** Returns track roles checked for synth repetition. */
export function getSynthRepetitionRoles(): readonly string[] {
  return SYNTH_REPETITION_ROLES;
}

/** Returns track roles checked for synth density. */
export function getSynthDensityRoles(): readonly string[] {
  return SYNTH_DENSITY_ROLES;
}

/** Returns the numeric detection thresholds. */
export function getNumericThresholds(): Readonly<NumericThresholds> {
  return NUMERIC_THRESHOLDS;
}