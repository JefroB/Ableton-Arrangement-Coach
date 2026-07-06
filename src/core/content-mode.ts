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
    trackName?: string;
  }[];
  readonly variants: readonly ArrangementVariant[];
  readonly beatsPerBar: number;
  readonly songDuration: number;
}

/**
 * Represents a boundary candidate with its beat position and signal score.
 */
export interface ScoredBoundary {
  readonly position: number;
  readonly score: number;
}

// ─── Boundary Detection (Requirements 7.1, 7.2) ────────────────────────

/** Keywords indicating FX/transition tracks */
const FX_KEYWORDS = ["white noise", "sweep", "riser", "impact", "fx", "transition"];

/** Keywords indicating drum tracks */
const DRUM_KEYWORDS = ["drum", "hat", "kick", "snare", "perc"];

/**
 * Detects candidate section boundaries using a multi-signal scoring system.
 *
 * Evaluates each bar-aligned position on four signals:
 * 1. Track density delta — change in active track count between adjacent bars
 * 2. Energy proxy — change in total clip coverage between adjacent bar windows
 * 3. FX/transition clip presence — clips on FX tracks within ±1 bar
 * 4. Drum fill detection — short clips on drum tracks near bar boundary
 *
 * Always includes the content-start position (earliest unmuted clip start)
 * as the first boundary with maximum score.
 *
 * Returns ScoredBoundary[] sorted by position ascending, filtered by score >= 1.
 */
export function detectBoundariesScored(
  clips: readonly { startTime: number; endTime: number; muted: boolean; trackIndex: number; trackName?: string }[],
  beatsPerBar: number,
): ScoredBoundary[] {
  const unmutedClips = clips.filter(c => !c.muted);

  if (unmutedClips.length === 0) {
    return [];
  }

  // Content-start detection: earliest beat where any unmuted clip begins
  const contentStart = Math.min(...unmutedClips.map(c => c.startTime));

  // Determine the range of bar positions to evaluate
  const maxEnd = Math.max(...unmutedClips.map(c => c.endTime));
  const barLength = beatsPerBar; // 1 bar in beats

  // Collect all bar-aligned positions from 0 up to (and slightly beyond) content end
  const barPositions: number[] = [];
  for (let pos = 0; pos <= maxEnd + barLength; pos += barLength) {
    barPositions.push(pos);
  }

  const scored: ScoredBoundary[] = [];

  for (const barPos of barPositions) {
    let score = 0;

    // Signal 1: Track density delta
    score += computeTrackDensityDelta(unmutedClips, barPos, barLength);

    // Signal 2: Energy proxy
    score += computeEnergyProxy(unmutedClips, barPos, barLength);

    // Signal 3: FX/transition clip presence
    score += computeFxPresence(unmutedClips, barPos, barLength);

    // Signal 4: Drum fill detection
    score += computeDrumFillPresence(unmutedClips, barPos, barLength);

    if (score >= 1) {
      scored.push({ position: barPos, score });
    }
  }

  // Ensure content-start is always included as first boundary
  const contentStartInScored = scored.some(b => b.position === contentStart);
  if (!contentStartInScored) {
    // Force content-start with maximum score (4 = all signals)
    scored.push({ position: contentStart, score: 4 });
  } else {
    // Boost content-start to max score to ensure it survives limiting
    const idx = scored.findIndex(b => b.position === contentStart);
    if (idx !== -1) {
      scored[idx] = { position: contentStart, score: Math.max(scored[idx]!.score, 4) };
    }
  }

  // Sort by position ascending
  scored.sort((a, b) => a.position - b.position);
  return scored;
}

/**
 * Detects candidate section boundaries and returns their positions as numbers.
 * This is the public API used by consumers that need simple position arrays.
 * Internally delegates to detectBoundariesScored for multi-signal scoring.
 */
export function detectBoundaries(
  clips: readonly { startTime: number; endTime: number; muted: boolean; trackIndex: number; trackName?: string }[],
  beatsPerBar: number,
): number[] {
  return detectBoundariesScored(clips, beatsPerBar).map(b => b.position);
}

/**
 * Signal 1: Track density delta.
 * Returns 1 if the absolute change in active track count between the current
 * bar and the previous bar is >= 2.
 */
function computeTrackDensityDelta(
  clips: readonly { startTime: number; endTime: number; trackIndex: number }[],
  barPos: number,
  barLength: number,
): number {
  const currentTracks = new Set<number>();
  const previousTracks = new Set<number>();

  for (const clip of clips) {
    // Clip is active at a position if it overlaps that window
    if (clip.startTime < barPos + barLength && clip.endTime > barPos) {
      currentTracks.add(clip.trackIndex);
    }
    const prevStart = barPos - barLength;
    if (clip.startTime < barPos && clip.endTime > prevStart) {
      previousTracks.add(clip.trackIndex);
    }
  }

  const delta = Math.abs(currentTracks.size - previousTracks.size);
  return delta >= 2 ? 1 : 0;
}

/**
 * Signal 2: Energy proxy.
 * Returns 1 if the change in total clip coverage (sum of clip durations
 * overlapping a bar window) between the current and previous bar exceeds
 * 30% of the previous bar's coverage.
 */
function computeEnergyProxy(
  clips: readonly { startTime: number; endTime: number }[],
  barPos: number,
  barLength: number,
): number {
  const currentCoverage = computeBarCoverage(clips, barPos, barLength);
  const previousCoverage = computeBarCoverage(clips, barPos - barLength, barLength);

  if (previousCoverage === 0) {
    // If previous bar had no coverage but current does, that's a significant change
    return currentCoverage > 0 ? 1 : 0;
  }

  const changeRatio = Math.abs(currentCoverage - previousCoverage) / previousCoverage;
  return changeRatio > 0.3 ? 1 : 0;
}

/**
 * Computes total clip coverage within a bar window [windowStart, windowStart + barLength].
 * Coverage = sum of the overlap duration of each clip with the window.
 */
function computeBarCoverage(
  clips: readonly { startTime: number; endTime: number }[],
  windowStart: number,
  barLength: number,
): number {
  const windowEnd = windowStart + barLength;
  let totalCoverage = 0;

  for (const clip of clips) {
    const overlapStart = Math.max(clip.startTime, windowStart);
    const overlapEnd = Math.min(clip.endTime, windowEnd);
    if (overlapEnd > overlapStart) {
      totalCoverage += overlapEnd - overlapStart;
    }
  }

  return totalCoverage;
}

/**
 * Signal 3: FX/transition clip presence.
 * Returns 1 if any clip whose trackName matches FX keywords overlaps
 * within ±1 bar of the given position.
 */
function computeFxPresence(
  clips: readonly { startTime: number; endTime: number; trackName?: string }[],
  barPos: number,
  barLength: number,
): number {
  const windowStart = barPos - barLength;
  const windowEnd = barPos + barLength;

  for (const clip of clips) {
    if (!clip.trackName) continue;

    const lowerName = clip.trackName.toLowerCase();
    const isFx = FX_KEYWORDS.some(keyword => lowerName.includes(keyword));
    if (!isFx) continue;

    // Check if clip overlaps ±1 bar window
    if (clip.startTime < windowEnd && clip.endTime > windowStart) {
      return 1;
    }
  }

  return 0;
}

/**
 * Signal 4: Drum fill detection.
 * Returns 1 if there are short clips (< 2 * barLength) on drum tracks
 * that start within 1 bar before the given position.
 */
function computeDrumFillPresence(
  clips: readonly { startTime: number; endTime: number; trackName?: string }[],
  barPos: number,
  barLength: number,
): number {
  const lookbackStart = barPos - barLength;

  for (const clip of clips) {
    if (!clip.trackName) continue;

    const lowerName = clip.trackName.toLowerCase();
    const isDrum = DRUM_KEYWORDS.some(keyword => lowerName.includes(keyword));
    if (!isDrum) continue;

    const clipDuration = clip.endTime - clip.startTime;
    const isShort = clipDuration < 2 * barLength;
    const startsInWindow = clip.startTime >= lookbackStart && clip.startTime < barPos;

    if (isShort && startsInWindow) {
      return 1;
    }
  }

  return 0;
}


// ─── Genre Average Computation ──────────────────────────────────────────────

/**
 * Computes the arithmetic mean of the number of sections in each variant and rounds to the nearest integer.
 *
 * @param variants - Array of ArrangementVariant objects.
 * @returns The rounded average number of sections across all variants, or 0 if variants is empty.
 */
export function computeGenreAverage(variants: readonly ArrangementVariant[]): number {
  if (variants.length === 0) {
    return 0;
  }

  const totalSections = variants.reduce((sum, variant) => sum + variant.sections.length, 0);
  const average = totalSections / variants.length;

  return Math.round(average);
}

// ─── Boundary Count Limiting ────────────────────────────────────────────

/**
 * Limits the number of boundary candidates based on genre average section count.
 *
 * Computes an upper bound of genreAverage + 2. If candidates exceed this,
 * selects the top-scoring boundaries and re-sorts by position.
 *
 * @param candidates - Array of scored boundary candidates.
 * @param variants - Array of arrangement variants for computing genre average.
 * @returns Filtered array of scored boundaries sorted by position ascending.
 */
export function limitBoundaries(
  candidates: ScoredBoundary[],
  variants: readonly ArrangementVariant[],
): ScoredBoundary[] {
  const genreAverage = computeGenreAverage(variants);
  const upperBound = genreAverage + 2;

  if (candidates.length <= upperBound) {
    return [...candidates].sort((a, b) => a.position - b.position);
  }

  // Sort by score descending, keep top N
  const sortedByScore = [...candidates].sort((a, b) => b.score - a.score);
  const limited = sortedByScore.slice(0, upperBound);

  // Re-sort by position ascending
  return limited.sort((a, b) => a.position - b.position);
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

// ─── Grid Snapping with Scores ──────────────────────────────────────────

/**
 * Snaps scored boundary candidates to the nearest 8-bar grid point,
 * preserving their signal scores. When multiple boundaries snap to the
 * same grid point, the one with the highest score is retained.
 *
 * Grid spacing = 8 bars × beatsPerBar (e.g., 32 beats at 4/4).
 * Maximum allowed distance = 4 beats.
 */
export function snapToGridWithScores(scored: readonly ScoredBoundary[], beatsPerBar: number): ScoredBoundary[] {
  const gridSpacing = 8 * beatsPerBar;
  const maxDistance = 4;
  const bestAtGrid = new Map<number, ScoredBoundary>();

  for (const boundary of scored) {
    const gridIndex = Math.round(boundary.position / gridSpacing);
    const nearestGrid = gridIndex * gridSpacing;
    const distance = Math.abs(boundary.position - nearestGrid);

    if (distance <= maxDistance) {
      const existing = bestAtGrid.get(nearestGrid);
      if (!existing || boundary.score > existing.score) {
        bestAtGrid.set(nearestGrid, { position: nearestGrid, score: boundary.score });
      }
    }
  }

  return [...bestAtGrid.values()].sort((a, b) => a.position - b.position);
}

// ─── Full Pipeline (Requirements 7.1–7.6, 9.1–9.4) ─────────────────────

/**
 * Computes content-based section markers from clip data and genre variants.
 *
 * Pipeline:
 * 1. Detect boundaries with multi-signal scoring
 * 2. Snap to 8-bar grid (preserving scores)
 * 3. If < 3 boundaries remain, return empty array (caller falls back to Minimal Mode)
 * 4. Limit boundaries by genre average (requires variants)
 * 5. Match best variant by proportional-length deviation
 * 6. Assign section names from matched variant
 * 7. Apply name disambiguation
 */
export function computeContentMarkers(input: ContentModeInput): GeneratedMarker[] {
  const { clips, variants, beatsPerBar, songDuration } = input;

  // Content density threshold: abort if <3 unmuted clips
  const unmutedClips = clips.filter(c => !c.muted);
  if (unmutedClips.length < 3) {
    return [];
  }

  // Step 1: Detect boundaries with multi-signal scoring
  const scoredCandidates = detectBoundariesScored(clips, beatsPerBar);

  // Step 2: Snap positions to grid (preserving scores)
  const snappedWithScores = snapToGridWithScores(scoredCandidates, beatsPerBar);

  // Step 3: Fallback if insufficient boundaries
  if (snappedWithScores.length < 3) {
    return [];
  }

  // Step 4: Limit boundaries by genre average
  if (variants.length === 0) {
    return [];
  }
  const limited = limitBoundaries(snappedWithScores, variants);

  // Step 5: Extract positions for variant matching
  const boundaries = limited.map(b => b.position);

  // Step 6: Match best variant
  const bestVariant = matchVariant(boundaries, variants, songDuration);

  // Step 7: Assign section names
  const markers = assignSectionNames(boundaries, bestVariant, beatsPerBar);

  // Step 8: Disambiguate
  return disambiguateNames(markers);
}

/**
 * Assigns section names from the best-matching variant to the detected boundaries.
 * Maps boundaries to variant sections by index, truncating if boundaries exceed sections.
 * Ensures all positions are aligned to bar boundaries.
 */
function assignSectionNames(
  boundaries: readonly number[],
  variant: ArrangementVariant,
  beatsPerBar: number,
): GeneratedMarker[] {
  const sections = variant.sections;
  const markers: GeneratedMarker[] = [];

  // Safety net: truncate boundaries to variant section count to prevent duplicate
  // names from cycling. Should be unreachable after limitBoundaries, but guards
  // against misuse if called directly.
  const maxBoundaries = Math.min(boundaries.length, sections.length);

  // Track assigned base names to prevent duplicates from variant sections
  // that share a base (e.g., "Build" and "Build 2" both have base "Build")
  const assignedBaseNames = new Set<string>();

  let boundaryIdx = 0;
  for (let i = 0; i < maxBoundaries && boundaryIdx < boundaries.length; i++) {
    const sectionName = sections[i]!.name;
    const baseName = sectionName.replace(/\s+\d+$/, '');

    // Skip sections whose base name would duplicate one already assigned
    if (assignedBaseNames.has(baseName)) {
      continue;
    }

    const position = boundaries[boundaryIdx]!;
    boundaryIdx++;

    // Ensure bar alignment (should already be aligned from grid snap, but enforce)
    const alignedPosition = Math.round(position / beatsPerBar) * beatsPerBar;

    assignedBaseNames.add(baseName);
    markers.push({ name: sectionName, beatPosition: alignedPosition });
  }

  return markers;
}
