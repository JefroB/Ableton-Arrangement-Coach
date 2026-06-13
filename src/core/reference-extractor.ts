/**
 * Reference Extractor
 *
 * Extracts structural sections from a reference audio clip using warp markers
 * as section boundaries. Pure function — no SDK calls.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */
import type { AudioClipData, ReferenceSection } from "./reference-types.js";
import type { LocatorData } from "../ableton/sdk-adapter.js";

export type { LocatorData };

/**
 * Extract structural sections from a single reference audio clip.
 * Pure function — no SDK calls.
 *
 * Boundary logic:
 * - Warp markers with beatTime strictly between clip start and end (exclusive)
 *   serve as internal boundaries.
 * - Fewer than 2 qualifying warp markers → single section spanning entire clip.
 * - Sections ordered by start time.
 * - Labels come from locators aligned within 0.5 beats tolerance, or sequential
 *   "Section N" fallback.
 * - Proportions normalized to sum to exactly 1.0.
 */
export function extractReferenceSections(
  clip: AudioClipData,
  locators: readonly LocatorData[],
): ReferenceSection[] {
  const clipStart = clip.startTime;
  const clipEnd = clip.endTime;
  const totalDuration = clipEnd - clipStart;

  if (totalDuration <= 0) {
    return [];
  }

  // Find qualifying warp markers: beatTime strictly between clip start and end
  const internalMarkers = clip.warpMarkers
    .filter((m) => m.beatTime > clipStart && m.beatTime < clipEnd)
    .sort((a, b) => a.beatTime - b.beatTime);

  // Determine section boundaries
  let boundaries: number[];
  if (internalMarkers.length < 2) {
    // Single section spanning entire clip
    boundaries = [clipStart, clipEnd];
  } else {
    // Multiple sections: clip start, each marker, clip end
    boundaries = [
      clipStart,
      ...internalMarkers.map((m) => m.beatTime),
      clipEnd,
    ];
  }

  // Build raw sections with durations
  const rawSections: Array<{
    startTime: number;
    endTime: number;
    duration: number;
  }> = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    rawSections.push({ startTime: start, endTime: end, duration: end - start });
  }

  // Calculate proportions and normalize to sum to 1.0
  const rawProportions = rawSections.map((s) => s.duration / totalDuration);
  const proportions = normalizeProportions(rawProportions);

  // Assign labels
  const sections: ReferenceSection[] = rawSections.map((s, index) => ({
    label: findLabel(s.startTime, locators, index),
    startTime: s.startTime,
    endTime: s.endTime,
    proportion: proportions[index]!,
  }));

  return sections;
}

/**
 * Select the best clip from multiple audio clips and extract sections.
 * Selects longest non-muted clip by duration in beats, earliest start time for ties.
 * Returns empty array if no non-muted clips.
 *
 * Requirements: 3.7, 3.8, 3.10
 */
export function extractReferenceSectionsFromClips(
  clips: readonly AudioClipData[],
  locators: readonly LocatorData[],
): ReferenceSection[] {
  // Filter out muted clips
  const nonMutedClips = clips.filter((c) => !c.muted);

  if (nonMutedClips.length === 0) {
    return [];
  }

  // Select longest clip by beat duration; earliest start time for ties
  const bestClip = nonMutedClips.reduce((best, current) => {
    const bestDuration = best.endTime - best.startTime;
    const currentDuration = current.endTime - current.startTime;

    if (currentDuration > bestDuration) {
      return current;
    }
    if (currentDuration === bestDuration && current.startTime < best.startTime) {
      return current;
    }
    return best;
  });

  return extractReferenceSections(bestClip, locators);
}

/**
 * Find a label for a section based on locator alignment.
 * If a locator's time is within 0.5 beats of the section start time,
 * use the locator's name. Otherwise, use sequential "Section N" (1-based).
 */
function findLabel(
  sectionStartTime: number,
  locators: readonly LocatorData[],
  sectionIndex: number,
): string {
  const TOLERANCE = 0.5;

  for (const locator of locators) {
    if (Math.abs(locator.time - sectionStartTime) <= TOLERANCE) {
      return locator.name;
    }
  }

  return `Section ${sectionIndex + 1}`;
}

/**
 * Normalize an array of proportions so they sum to exactly 1.0.
 * Distributes rounding error to the largest element.
 */
function normalizeProportions(proportions: number[]): number[] {
  if (proportions.length === 0) {
    return [];
  }

  if (proportions.length === 1) {
    return [1.0];
  }

  const sum = proportions.reduce((acc, p) => acc + p, 0);

  if (sum === 0) {
    // Edge case: all zero durations — distribute equally
    const equal = 1.0 / proportions.length;
    return proportions.map(() => equal);
  }

  // Normalize to sum to 1.0
  const normalized = proportions.map((p) => p / sum);

  // Fix floating-point drift: adjust the largest element so sum is exactly 1.0
  const normalizedSum = normalized.reduce((acc, p) => acc + p, 0);
  const drift = 1.0 - normalizedSum;

  if (drift !== 0) {
    // Find the largest element and adjust it
    let maxIndex = 0;
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i]! > normalized[maxIndex]!) {
        maxIndex = i;
      }
    }
    normalized[maxIndex] = normalized[maxIndex]! + drift;
  }

  return normalized;
}
