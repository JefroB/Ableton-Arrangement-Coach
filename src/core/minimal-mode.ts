/**
 * Minimal Mode — pure functions for random template-based section generation.
 *
 * Used when the timeline has negligible content. Selects a random arrangement
 * structure variant and computes beat positions from cumulative bar lengths.
 */

import type { ArrangementVariant, GeneratedMarker } from "./structure-types.js";

// ─── Interfaces ────────────────────────────────────────────────────────

export interface MinimalModeInput {
  readonly variant: ArrangementVariant;
  readonly beatsPerBar: number; // default 4
}

// ─── Bar Length Selection (Requirement 6.4) ────────────────────────────

/**
 * Selects a bar length from a range using the power-of-two algorithm:
 * 1. Try min × 1, min × 2, min × 4, ... — return first ≤ max
 * 2. If none fit, try {8, 16, 32, 64} descending from max
 * 3. If nothing fits, return min
 */
export function selectBarLength(lengthRange: { min: number; max: number }): number {
  const { min, max } = lengthRange;

  // Step 1: power-of-two multiples of min
  let candidate = min;
  while (candidate <= max) {
    // Return the first power-of-two multiple that fits
    if (candidate >= min) {
      return candidate;
    }
    candidate *= 2;
  }
  // If we exited the loop, the last valid was before exceeding max
  // Actually, since candidate starts at min and min >= min, the first iteration
  // always returns. But if min > max (shouldn't happen), fall through.

  // Step 2: standard phrase boundaries descending
  const standards = [64, 32, 16, 8];
  for (const s of standards) {
    if (s >= min && s <= max) {
      return s;
    }
  }

  // Step 3: fallback
  return min;
}

// ─── Marker Computation ────────────────────────────────────────────────

/**
 * Computes marker positions from a variant template.
 * Positions are cumulative: position[N] = sum of preceding section lengths × beatsPerBar.
 * First marker is always at position 0.
 */
export function computeMinimalMarkers(input: MinimalModeInput): GeneratedMarker[] {
  const { variant, beatsPerBar } = input;
  const markers: GeneratedMarker[] = [];
  let currentBeat = 0;

  for (const section of variant.sections) {
    markers.push({ name: section.name, beatPosition: currentBeat });
    const bars = selectBarLength(section.lengthRange);
    currentBeat += bars * beatsPerBar;
  }

  return disambiguateNames(markers);
}

// ─── Name Disambiguation (Requirement 9.3) ─────────────────────────────

/**
 * Appends sequential numeric suffixes to duplicate section names.
 * E.g., ["Drop", "Drop", "Build"] → ["Drop 1", "Drop 2", "Build"]
 * Names are truncated to 32 characters max after disambiguation.
 */
export function disambiguateNames(markers: readonly GeneratedMarker[]): GeneratedMarker[] {
  // Count occurrences of each name
  const counts = new Map<string, number>();
  for (const m of markers) {
    counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  }

  // Track which names need suffixes and their current counter
  const counters = new Map<string, number>();
  const result: GeneratedMarker[] = [];

  for (const m of markers) {
    if (counts.get(m.name)! > 1) {
      const idx = (counters.get(m.name) ?? 0) + 1;
      counters.set(m.name, idx);
      const suffixed = `${m.name} ${idx}`;
      // Truncate to 32 characters
      const name = suffixed.length > 32 ? suffixed.slice(0, 32) : suffixed;
      result.push({ name, beatPosition: m.beatPosition });
    } else {
      const name = m.name.length > 32 ? m.name.slice(0, 32) : m.name;
      result.push({ name, beatPosition: m.beatPosition });
    }
  }

  return result;
}
