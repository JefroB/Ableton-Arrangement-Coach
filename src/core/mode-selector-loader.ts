// --- src/core/mode-selector-loader.ts ---
import modeSelectorThresholdsData from "../data/detection/mode-selector-thresholds.json" with { type: "json" };
import { deepFreeze, createFailHelper } from './loader-utils.js';

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ModeSelectorThresholds {
  readonly clipCountThreshold: number;
  readonly coverageThreshold: number;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUIRED_KEYS = [
  "clipCountThreshold",
  "coverageThreshold",
] as const;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('mode-selector-thresholds.json');

/**
 * Validates the entire mode-selector-thresholds.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateModeSelectorThresholdsFile(data: unknown): void {
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
  for (const key of REQUIRED_KEYS) {
    if (!(key in root)) {
      fail("(root)", `missing required key "${key}"`);
    }
  }

  // ── Validate clipCountThreshold ──
  const clipCountThreshold = root["clipCountThreshold"];
  if (typeof clipCountThreshold !== "number" || !Number.isInteger(clipCountThreshold)) {
    fail(
      "clipCountThreshold",
      `expected integer, got ${typeof clipCountThreshold}`
    );
  }
  if (clipCountThreshold < 1 || clipCountThreshold > 1000) {
    fail(
      "clipCountThreshold",
      `expected integer in range 1-1000 inclusive, got ${clipCountThreshold}`
    );
  }

  // ── Validate coverageThreshold ──
  const coverageThreshold = root["coverageThreshold"];
  if (typeof coverageThreshold !== "number" || !Number.isFinite(coverageThreshold)) {
    fail(
      "coverageThreshold",
      `expected finite number, got ${typeof coverageThreshold}`
    );
  }
  if (coverageThreshold <= 0 || coverageThreshold >= 1) {
    fail(
      "coverageThreshold",
      `expected number strictly between 0 and 1 (exclusive), got ${coverageThreshold}`
    );
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateModeSelectorThresholdsFile(modeSelectorThresholdsData);

// Cast validated data to typed structures
const validatedData = modeSelectorThresholdsData as unknown as {
  clipCountThreshold: number;
  coverageThreshold: number;
};

// Deep freeze all data structures
const FROZEN_MODE_SELECTOR_THRESHOLDS: ModeSelectorThresholds = deepFreeze({ ...validatedData });

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the clip count threshold for mode selection. */
export function getClipCountThreshold(): number {
  return FROZEN_MODE_SELECTOR_THRESHOLDS.clipCountThreshold;
}

/** Returns the coverage threshold for mode selection. */
export function getCoverageThreshold(): number {
  return FROZEN_MODE_SELECTOR_THRESHOLDS.coverageThreshold;
}

/** Returns the complete mode selector thresholds configuration. */
export function getModeSelectorThresholds(): ModeSelectorThresholds {
  return FROZEN_MODE_SELECTOR_THRESHOLDS;
}