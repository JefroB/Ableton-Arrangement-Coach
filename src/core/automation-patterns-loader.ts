/**
 * Automation patterns configuration loader module.
 *
 * Statically imports automation-patterns.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as dj-scorer-config-loader.ts.
 */
import automationPatternsData from "../data/categorization/automation-patterns.json" with { type: "json" };
import { deepFreeze, createFailHelper } from './loader-utils.js';

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GenericMixerParam {
  readonly deviceName: string;
  readonly parameterName: string;
}

export interface AutomationPatternsConfig {
  readonly filterDevicePatterns: readonly string[];
  readonly excludedParameterNames: readonly string[];
  readonly transitionRelevantPatterns: readonly string[];
  readonly gapPatterns: readonly string[];
  readonly transitionPatterns: readonly string[];
  readonly maxSuggestionsPerGap: number;
  readonly maxSuggestionsPerTransition: number;
  readonly genericMixerParams: readonly GenericMixerParam[];
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PATTERN_ARRAY_KEYS = [
  "filterDevicePatterns",
  "excludedParameterNames",
  "transitionRelevantPatterns",
  "gapPatterns",
  "transitionPatterns",
] as const;

const MAX_SUGGESTIONS_KEYS = [
  "maxSuggestionsPerGap",
  "maxSuggestionsPerTransition",
] as const;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('automation-patterns.json');

/**
 * Validates the entire automation-patterns.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateAutomationPatternsFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate pattern arrays ──
  for (const key of PATTERN_ARRAY_KEYS) {
    if (!(key in root)) {
      fail(key, "is missing");
    }
    const arr = root[key];
    if (!Array.isArray(arr)) {
      fail(key, `expected array, got ${typeof arr}`);
    }
    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (typeof entry !== "string" || entry.length === 0) {
        fail(`${key}[${i}]`, `must be a non-empty string`);
      }
    }
  }

  // ── Validate max suggestions values ──
  for (const key of MAX_SUGGESTIONS_KEYS) {
    if (!(key in root)) {
      fail(key, "is missing");
    }
    const value = root[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      fail(key, `must be a positive integer, got ${String(value)}`);
    }
  }

  // ── Validate genericMixerParams ──
  if (!("genericMixerParams" in root)) {
    fail("genericMixerParams", "is missing");
  }
  const genericMixerParams = root["genericMixerParams"];
  if (!Array.isArray(genericMixerParams)) {
    fail("genericMixerParams", `expected array, got ${typeof genericMixerParams}`);
  }

  for (let i = 0; i < genericMixerParams.length; i++) {
    const entry = genericMixerParams[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(
        `genericMixerParams[${i}]`,
        `expected object, got ${entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry}`
      );
    }
    const entryObj = entry as Record<string, unknown>;

    for (const field of ["deviceName", "parameterName"] as const) {
      const val = entryObj[field];
      if (typeof val !== "string" || val.length === 0) {
        fail(`genericMixerParams[${i}].${field}`, `must be a non-empty string`);
      }
    }
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateAutomationPatternsFile(automationPatternsData);

// Cast validated data to typed structure
const validatedData = automationPatternsData as unknown as AutomationPatternsConfig;

// Deep freeze all data structures
const FROZEN_FILTER_DEVICE_PATTERNS: readonly string[] = deepFreeze([...validatedData.filterDevicePatterns]);
const FROZEN_EXCLUDED_PARAMETER_NAMES: readonly string[] = deepFreeze([...validatedData.excludedParameterNames]);
const FROZEN_TRANSITION_RELEVANT_PATTERNS: readonly string[] = deepFreeze([...validatedData.transitionRelevantPatterns]);
const FROZEN_GAP_PATTERNS: readonly string[] = deepFreeze([...validatedData.gapPatterns]);
const FROZEN_TRANSITION_PATTERNS: readonly string[] = deepFreeze([...validatedData.transitionPatterns]);
const FROZEN_MAX_SUGGESTIONS_PER_GAP: number = validatedData.maxSuggestionsPerGap;
const FROZEN_MAX_SUGGESTIONS_PER_TRANSITION: number = validatedData.maxSuggestionsPerTransition;
const FROZEN_GENERIC_MIXER_PARAMS: readonly GenericMixerParam[] = deepFreeze(
  validatedData.genericMixerParams.map((p) => ({ ...p }))
);

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns filter device pattern strings for identifying filter devices. */
export function getFilterDevicePatterns(): readonly string[] {
  return FROZEN_FILTER_DEVICE_PATTERNS;
}

/** Returns excluded parameter name strings for filtering out irrelevant parameters. */
export function getExcludedParameterNames(): readonly string[] {
  return FROZEN_EXCLUDED_PARAMETER_NAMES;
}

/** Returns transition-relevant parameter patterns. */
export function getTransitionRelevantPatterns(): readonly string[] {
  return FROZEN_TRANSITION_RELEVANT_PATTERNS;
}

/** Returns gap automation pattern strings for contrast gap suggestions. */
export function getGapPatterns(): readonly string[] {
  return FROZEN_GAP_PATTERNS;
}

/** Returns transition automation pattern strings for transition suggestions. */
export function getTransitionPatterns(): readonly string[] {
  return FROZEN_TRANSITION_PATTERNS;
}

/** Returns max suggestions per gap. */
export function getMaxSuggestionsPerGap(): number {
  return FROZEN_MAX_SUGGESTIONS_PER_GAP;
}

/** Returns max suggestions per transition. */
export function getMaxSuggestionsPerTransition(): number {
  return FROZEN_MAX_SUGGESTIONS_PER_TRANSITION;
}

/** Returns generic mixer fallback parameter objects. */
export function getGenericMixerParams(): readonly GenericMixerParam[] {
  return FROZEN_GENERIC_MIXER_PARAMS;
}