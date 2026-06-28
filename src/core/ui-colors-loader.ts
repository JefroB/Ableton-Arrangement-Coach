/**
 * UI colors configuration loader module.
 *
 * Statically imports chart-colors.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as dj-scorer-config-loader.ts.
 */
import uiColorsData from "../data/ui/chart-colors.json" with { type: "json" };
import { deepFreeze, createFailHelper } from './loader-utils.js';

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface EnergyColorEntry {
  readonly maxScore: number;
  readonly color: string;
}

export interface DjScoreClassEntry {
  readonly minScore: number;
  readonly className: string;
}

export interface UiColorsConfig {
  readonly energyColors: readonly EnergyColorEntry[];
  readonly djScoreClasses: readonly DjScoreClassEntry[];
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUIRED_TOP_LEVEL_KEYS = [
  "energyColors",
  "djScoreClasses",
] as const;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('chart-colors.json');

/**
 * Validates the entire chart-colors.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateUiColorsFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate exactly 2 top-level keys ──
  const actualKeys = Object.keys(root);
  if (actualKeys.length !== 2) {
    fail(
      "(root)",
      `expected exactly 2 top-level keys, got ${actualKeys.length}: [${actualKeys.join(", ")}]`
    );
  }
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in root)) {
      fail("(root)", `missing required key "${key}"`);
    }
  }

  // ── Validate energyColors ──
  const energyColors = root["energyColors"];
  if (!Array.isArray(energyColors)) {
    fail("energyColors", `expected array, got ${typeof energyColors}`);
  }
  if (energyColors.length === 0) {
    fail("energyColors", "expected non-empty array");
  }

  let prevMaxScore = -Infinity;
  for (let i = 0; i < energyColors.length; i++) {
    const entry = energyColors[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`energyColors[${i}]`, `expected object, got ${entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry}`);
    }

    const entryObj = entry as Record<string, unknown>;
    
    // Validate maxScore
    const maxScore = entryObj["maxScore"];
    if (typeof maxScore !== "number" || !Number.isFinite(maxScore)) {
      fail(`energyColors[${i}].maxScore`, `expected finite number, got ${String(maxScore)}`);
    }
    if (maxScore < 0 || maxScore > 10) {
      fail(`energyColors[${i}].maxScore`, `expected number in 0–10, got ${String(maxScore)}`);
    }
    if (maxScore <= prevMaxScore) {
      fail(
        `energyColors[${i}].maxScore`,
        `entries must be in strictly ascending order (${maxScore} <= previous ${prevMaxScore})`
      );
    }
    prevMaxScore = maxScore;

    // Validate color
    const color = entryObj["color"];
    if (typeof color !== "string") {
      fail(`energyColors[${i}].color`, `expected string, got ${typeof color}`);
    }
    if (color.length === 0) {
      fail(`energyColors[${i}].color`, "expected non-empty string");
    }
    if (color.length > 30) {
      fail(`energyColors[${i}].color`, `expected string with max 30 characters, got ${color.length}`);
    }
  }

  // ── Validate djScoreClasses ──
  const djScoreClasses = root["djScoreClasses"];
  if (!Array.isArray(djScoreClasses)) {
    fail("djScoreClasses", `expected array, got ${typeof djScoreClasses}`);
  }
  if (djScoreClasses.length === 0) {
    fail("djScoreClasses", "expected non-empty array");
  }

  let prevMinScore = Infinity;
  for (let i = 0; i < djScoreClasses.length; i++) {
    const entry = djScoreClasses[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`djScoreClasses[${i}]`, `expected object, got ${entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry}`);
    }

    const entryObj = entry as Record<string, unknown>;
    
    // Validate minScore
    const minScore = entryObj["minScore"];
    if (typeof minScore !== "number" || !Number.isFinite(minScore)) {
      fail(`djScoreClasses[${i}].minScore`, `expected finite number, got ${String(minScore)}`);
    }
    if (minScore < 0 || minScore > 100) {
      fail(`djScoreClasses[${i}].minScore`, `expected number in 0–100, got ${String(minScore)}`);
    }
    if (minScore >= prevMinScore) {
      fail(
        `djScoreClasses[${i}].minScore`,
        `entries must be in strictly descending order (${minScore} >= previous ${prevMinScore})`
      );
    }
    prevMinScore = minScore;

    // Validate className
    const className = entryObj["className"];
    if (typeof className !== "string") {
      fail(`djScoreClasses[${i}].className`, `expected string, got ${typeof className}`);
    }
    if (className.length === 0) {
      fail(`djScoreClasses[${i}].className`, "expected non-empty string");
    }
    if (className.length > 50) {
      fail(`djScoreClasses[${i}].className`, `expected string with max 50 characters, got ${className.length}`);
    }
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateUiColorsFile(uiColorsData);

// Cast validated data to typed structures
const validatedData = uiColorsData as unknown as UiColorsConfig;

// Deep freeze all data structures
const FROZEN_ENERGY_COLORS: readonly EnergyColorEntry[] = deepFreeze(
  validatedData.energyColors.map((e) => ({ ...e }))
);
const FROZEN_DJ_SCORE_CLASSES: readonly DjScoreClassEntry[] = deepFreeze(
  validatedData.djScoreClasses.map((c) => ({ ...c }))
);

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the energy color configuration entries. */
export function getEnergyColors(): readonly EnergyColorEntry[] {
  return FROZEN_ENERGY_COLORS;
}

/** Returns the DJ score class configuration entries. */
export function getDjScoreClasses(): readonly DjScoreClassEntry[] {
  return FROZEN_DJ_SCORE_CLASSES;
}