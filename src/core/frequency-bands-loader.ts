/**
 * Frequency bands loader module.
 *
 * Statically imports frequency-bands.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as dj-scorer-config-loader.ts.
 */
import { deepFreeze, createFailHelper } from './loader-utils.js';
import frequencyBandsData from "../data/detection/frequency-bands.json" with { type: "json" };
import type { FrequencyBandName, FrequencyBandRange } from "./audio-content-types.js";

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_BAND_NAMES: readonly FrequencyBandName[] = [
  "subBass",
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "high"
] as const;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('frequency-bands.json');

/**
 * Validates the entire frequency-bands.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateFrequencyBandsFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate bands array ──
  const bands = root["bands"];
  if (!Array.isArray(bands)) {
    fail("bands", `expected array, got ${typeof bands}`);
  }

  if (bands.length !== 6) {
    fail(
      "bands",
      `expected exactly 6 bands, got ${bands.length}`
    );
  }

  // ── Validate each band ──
  const seenNames = new Set<FrequencyBandName>();
  for (let i = 0; i < bands.length; i++) {
    const entry = bands[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`bands[${i}]`, `expected object, got ${entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry}`);
    }

    const bandObj = entry as Record<string, unknown>;
    const name = bandObj["name"];
    const lowHz = bandObj["lowHz"];
    const highHz = bandObj["highHz"];

    // ── Validate name ──
    if (typeof name !== "string") {
      fail(`bands[${i}].name`, `expected string, got ${typeof name}`);
    }
    
    if (!VALID_BAND_NAMES.includes(name as FrequencyBandName)) {
      fail(`bands[${i}].name`, `expected one of [${VALID_BAND_NAMES.join(", ")}], got "${name}"`);
    }
    
    if (seenNames.has(name as FrequencyBandName)) {
      fail(`bands[${i}].name`, `duplicate band name "${name}"`);
    }
    seenNames.add(name as FrequencyBandName);

    // ── Validate lowHz ──
    if (typeof lowHz !== "number" || !Number.isFinite(lowHz)) {
      fail(`bands[${i}].lowHz`, `expected finite number, got ${String(lowHz)}`);
    }

    // ── Validate highHz ──
    if (typeof highHz !== "number" || !Number.isFinite(highHz)) {
      fail(`bands[${i}].highHz`, `expected finite number, got ${String(highHz)}`);
    }

    // ── Validate lowHz < highHz ──
    if (lowHz >= highHz) {
      fail(
        `bands[${i}].lowHz`,
        `lowHz (${lowHz}) must be less than highHz (${highHz})`
      );
    }
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateFrequencyBandsFile(frequencyBandsData);

// Cast validated data to typed structures
const validatedData = frequencyBandsData as unknown as {
  bands: FrequencyBandRange[];
};

// Deep freeze all data structures
const FROZEN_BANDS: readonly FrequencyBandRange[] = deepFreeze([...validatedData.bands]);

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the list of frequency bands. */
export function getFrequencyBands(): readonly FrequencyBandRange[] {
  return FROZEN_BANDS;
}

/** Export for backward compatibility */
export const FREQUENCY_BANDS = FROZEN_BANDS;

// ━━━ Re-exports ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type { FrequencyBandName, FrequencyBandRange } from "./audio-content-types.js";