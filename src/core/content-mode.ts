/**
 * Content Mode — pure boundary detection and section name assignment.
 *
 * Used when the timeline has significant content. Analyzes clip start/end times
 * to detect structural boundaries, snaps them to an 8-bar grid, and assigns
 * section names by matching against genre arrangement structure variants.
 */

import type { ArrangementVariant, GeneratedMarker } from "./structure-types.js";
import { disambiguateNames } from "./minimal-mode.js";

// ─── Interfaces ────────────────────────────────────────────────────────

export interface ContentModeInput {
  readonly clips: readonly {
    startTime: number;
    endTime: number;
    muted: boolean;
    trackIndex: number;
  }[];
  readonly variants: readonly ArrangementVariant[];
  readonly beatsPerBar: number;
  readonly songDuration: number;
}

// ─── Boundary Detection (Requirements 7.1, 7.2) ────────────────────────

/**
 * Detects candidate section boundaries from clip start/end positions.
 * A candidate is any beat position where ≥ 2 unmuted clips start or end.
 *
 * Returns positions sorted in ascending order.
 */
export function detectBoundaries(
  clips: readonly { startTime: number; endTime: number; muted: boolean; trackIndex: number }[],
  _beatsPerBar: number,
): number[] {
  // Count how many clips start or end at each beat position
  const positionCounts = new Map<number, number>();

  for (const clip of clips) {
    if (clip.muted) continue;

    const start = clip.startTime;
    const end = clip.endTime;

    positionCounts.set(start, (positionCounts.get(start) ?? 0) + 1);
    positionCounts.set(end, (positionCounts.get(end) ?? 0) + 1);
  }

  // Filter: keep positions where count >= 2
  const candidates: number[] = [];
  for (const [position, count] of positionCounts) {
    if (count >= 2) {
      candidates.push(position);
    }
  }

  // Sort ascending
  candidates.sort((a, b) => a - b);
  return candidates;
}

// ─── Grid Snapping (Requirement 7.3) ───────────────────────────────────

/**
 * Snaps candidate boundaries to the nearest 8-bar grid point.
 * Discards any candidate whose distance to the nearest grid point exceeds 4 beats.
 *
 * Grid spacing = 8 bars × beatsPerBar (e.g., 32 beats at 4/4).
 * Maximum allowed distance = 4 beats.
 */
export function snapToGrid(candidates: readonly number[], beatsPerBar: number): number[] {
  const gridSpacing = 8 * beatsPerBar; // 8 bars in beats
  const maxDistance = 4; // beats

  const snapped: number[] = [];
  const seen = new Set<number>();

  for (const candidate of candidates) {
    // Find nearest grid point
    const gridIndex = Math.round(candidate / gridSpacing);
    const nearestGrid = gridIndex * gridSpacing;
    const distance = Math.abs(candidate - nearestGrid);

    if (distance <= maxDistance) {
      // Snap to grid point, avoiding duplicates
      if (!seen.has(nearestGrid)) {
        seen.add(nearestGrid);
        snapped.push(nearestGrid);
      }
    }
  }

  // Sort ascending
  snapped.sort((a, b) => a - b);
  return snapped;
}

// ─── Variant Matching (Requirement 7.4) ────────────────────────────────

/**
 * Finds the best-matching arrangement variant by proportional-length deviation.
 *
 * For each variant, computes proportional lengths of its sections (section_bars / total_bars).
 * For the detected sections (from boundaries), computes proportional lengths (section_beats / total_beats).
 * Deviation = sum of absolute differences between detected proportions and variant proportions.
 * Selects the variant with smallest total deviation.
 *
 * If boundary count doesn't match variant section count, interpolates or truncates.
 */
export function matchVariant(
  boundaries: readonly number[],
  variants: readonly ArrangementVariant[],
  songDuration: number,
): ArrangementVariant {
  if (variants.length === 0) {
    throw new Error("No variants available for matching");
  }

  // Compute detected section proportional lengths from boundaries
  const detectedProportions = computeDetectedProportions(boundaries, songDuration);

  let bestVariant = variants[0]!;
  let bestDeviation = Infinity;

  for (const variant of variants) {
    const variantProportions = computeVariantProportions(variant);
    const deviation = computeDeviation(detectedProportions, variantProportions);

    if (deviation < bestDeviation) {
      bestDeviation = deviation;
      bestVariant = variant;
    }
  }

  return bestVariant;
}

/**
 * Computes proportional lengths of detected sections from boundary positions.
 * Each section spans from one boundary to the next (or to songDuration for the last).
 */
function computeDetectedProportions(boundaries: readonly number[], songDuration: number): number[] {
  if (boundaries.length === 0 || songDuration <= 0) return [];

  const totalBeats = songDuration;
  const proportions: number[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = i < boundaries.length - 1 ? boundaries[i + 1]! : totalBeats;
    const length = end - start;
    proportions.push(length / totalBeats);
  }

  return proportions;
}

/**
 * Computes proportional lengths from a variant's section definitions.
 * Uses the midpoint of each section's lengthRange as the representative length.
 */
function computeVariantProportions(variant: ArrangementVariant): number[] {
  const sections = variant.sections;
  let totalBars = 0;

  for (const section of sections) {
    totalBars += (section.lengthRange.min + section.lengthRange.max) / 2;
  }

  if (totalBars === 0) return [];

  return sections.map(
    (s) => ((s.lengthRange.min + s.lengthRange.max) / 2) / totalBars,
  );
}

/**
 * Computes the total proportional-length deviation between detected and variant proportions.
 * Handles mismatched lengths by interpolating (stretching) the shorter array to match the longer.
 */
function computeDeviation(detected: readonly number[], variant: readonly number[]): number {
  if (detected.length === 0 && variant.length === 0) return 0;
  if (detected.length === 0 || variant.length === 0) return 1;

  // Normalize both to the same length by interpolation
  const targetLength = Math.max(detected.length, variant.length);
  const normalizedDetected = interpolateToLength(detected, targetLength);
  const normalizedVariant = interpolateToLength(variant, targetLength);

  let totalDeviation = 0;
  for (let i = 0; i < targetLength; i++) {
    totalDeviation += Math.abs(normalizedDetected[i]! - normalizedVariant[i]!);
  }

  return totalDeviation;
}

/**
 * Interpolates (or truncates) an array of proportions to a target length.
 * Uses linear interpolation to distribute values evenly.
 */
function interpolateToLength(proportions: readonly number[], targetLength: number): number[] {
  if (proportions.length === targetLength) return [...proportions];
  if (proportions.length === 0) return Array(targetLength).fill(1 / targetLength) as number[];

  // If we need fewer sections, merge adjacent proportions
  if (proportions.length > targetLength) {
    const result: number[] = Array(targetLength).fill(0) as number[];
    const ratio = proportions.length / targetLength;
    for (let i = 0; i < proportions.length; i++) {
      const targetIdx = Math.min(Math.floor(i / ratio), targetLength - 1);
      result[targetIdx]! += proportions[i]!;
    }
    return result;
  }

  // If we need more sections, split proportions evenly
  const result: number[] = Array(targetLength).fill(0) as number[];
  const ratio = proportions.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const sourceIdx = Math.min(Math.floor(i * ratio), proportions.length - 1);
    result[i] = proportions[sourceIdx]! / Math.ceil(1 / ratio);
  }

  // Normalize so sum equals 1
  const sum = result.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] = result[i]! / sum;
    }
  }

  return result;
}

// ─── Full Pipeline (Requirements 7.1–7.6, 9.1–9.4) ─────────────────────

/**
 * Computes content-based section markers from clip data and genre variants.
 *
 * Pipeline:
 * 1. Detect boundaries from clip start/end positions (≥ 2 clips coincide)
 * 2. Snap to 8-bar grid, discard if > 4 beats away
 * 3. If < 3 boundaries remain, return empty array (caller falls back to Minimal Mode)
 * 4. Match best variant by proportional-length deviation
 * 5. Assign section names from matched variant
 * 6. Apply name disambiguation
 */
export function computeContentMarkers(input: ContentModeInput): GeneratedMarker[] {
  const { clips, variants, beatsPerBar, songDuration } = input;

  // Step 1: Detect boundaries
  const candidates = detectBoundaries(clips, beatsPerBar);

  // Step 2: Snap to grid
  const boundaries = snapToGrid(candidates, beatsPerBar);

  // Step 3: Fallback if insufficient boundaries
  if (boundaries.length < 3) {
    return [];
  }

  // Step 4: Match best variant
  if (variants.length === 0) {
    return [];
  }
  const bestVariant = matchVariant(boundaries, variants, songDuration);

  // Step 5: Assign section names from the matched variant
  const markers = assignSectionNames(boundaries, bestVariant, beatsPerBar);

  // Step 6: Apply name disambiguation
  return disambiguateNames(markers);
}

/**
 * Assigns section names from the best-matching variant to the detected boundaries.
 * Maps boundaries to variant sections by index, cycling if boundaries exceed sections.
 * Ensures all positions are aligned to bar boundaries.
 */
function assignSectionNames(
  boundaries: readonly number[],
  variant: ArrangementVariant,
  beatsPerBar: number,
): GeneratedMarker[] {
  const sections = variant.sections;
  const markers: GeneratedMarker[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const position = boundaries[i]!;

    // Ensure bar alignment (should already be aligned from grid snap, but enforce)
    const alignedPosition = Math.round(position / beatsPerBar) * beatsPerBar;

    // Map to a section name — cycle through variant sections if we have more boundaries
    const sectionIndex = i % sections.length;
    const sectionName = sections[sectionIndex]!.name;

    markers.push({ name: sectionName, beatPosition: alignedPosition });
  }

  return markers;
}
