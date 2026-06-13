/**
 * Mode Selector — determines generation mode from timeline state.
 *
 * Pure function module. Accepts plain data, returns plain data.
 * No SDK calls, no side effects.
 *
 * The mode selector evaluates the timeline content to decide between:
 * - "minimal" mode: timeline is mostly empty, use a random genre template
 * - "content" mode: timeline has significant content, derive boundaries from clips
 */

// ─── Types ─────────────────────────────────────────────────────────────

/** A clip's time range and muted state, used for coverage computation. */
export interface ClipTimeRange {
  readonly startTime: number;
  readonly endTime: number;
  readonly muted: boolean;
}

/** Input data for mode selection. */
export interface ModeSelectionInput {
  readonly clips: readonly ClipTimeRange[];
  readonly songDuration: number; // beats
  readonly trackCount: number;
}

/** The two possible generation modes. */
export type GenerationMode = "minimal" | "content";

// ─── Constants ─────────────────────────────────────────────────────────

/** Minimum number of unmuted clips required for content mode. */
const CLIP_COUNT_THRESHOLD = 3;

/** Minimum coverage fraction (0–1) of song duration for content mode. */
const COVERAGE_THRESHOLD = 0.10;

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Compute the union of time ranges, merging overlapping/adjacent regions.
 *
 * @param ranges - Array of [start, end] tuples (must have start < end).
 * @returns Total duration covered by the merged union of all ranges.
 */
export function computeUnionCoverage(
  ranges: readonly { startTime: number; endTime: number }[],
): number {
  if (ranges.length === 0) return 0;

  // Sort by start time, then by end time descending for equal starts
  const sorted = [...ranges].sort((a, b) =>
    a.startTime !== b.startTime
      ? a.startTime - b.startTime
      : b.endTime - a.endTime,
  );

  const first = sorted[0];
  if (!first) return 0;

  let totalCoverage = 0;
  let currentStart = first.startTime;
  let currentEnd = first.endTime;

  for (let i = 1; i < sorted.length; i++) {
    const range = sorted[i]!;
    if (range.startTime <= currentEnd) {
      // Overlapping or adjacent — extend current merged region
      currentEnd = Math.max(currentEnd, range.endTime);
    } else {
      // Gap — finalize current region and start new one
      totalCoverage += currentEnd - currentStart;
      currentStart = range.startTime;
      currentEnd = range.endTime;
    }
  }

  // Finalize last region
  totalCoverage += currentEnd - currentStart;

  return totalCoverage;
}

// ─── Mode Selection ────────────────────────────────────────────────────

/**
 * Pure function: determines generation mode from timeline state.
 *
 * Returns "minimal" if:
 * - Song duration is zero or no arrangement tracks exist (trackCount is 0)
 * - Unmuted clip count < 3 AND coverage < 10% of song duration
 *
 * Returns "content" otherwise (clip count >= 3 OR coverage >= 10%).
 */
export function selectMode(input: ModeSelectionInput): GenerationMode {
  const { clips, songDuration, trackCount } = input;

  // Edge cases: zero duration or no tracks → always minimal
  if (songDuration <= 0 || trackCount <= 0) {
    return "minimal";
  }

  // Filter to unmuted clips only
  const unmutedClips = clips.filter((clip) => !clip.muted);
  const unmutedCount = unmutedClips.length;

  // Compute union coverage of unmuted clip time ranges
  const coverage = computeUnionCoverage(unmutedClips);
  const coverageFraction = coverage / songDuration;

  // Content mode if EITHER threshold is met
  if (unmutedCount >= CLIP_COUNT_THRESHOLD || coverageFraction >= COVERAGE_THRESHOLD) {
    return "content";
  }

  // Otherwise minimal
  return "minimal";
}
