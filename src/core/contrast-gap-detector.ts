/**
 * Contrast Gap Detector — pure-function module that identifies consecutive
 * sections with high structural similarity and low energy variation.
 *
 * A "contrast gap" indicates sections that sound too similar and lack
 * differentiation — prime candidates for automation suggestions.
 *
 * This module has no SDK calls or side effects.
 */
import type { Section } from "./section-scanner.js";
import type { SectionAnalysisState } from "../state/store.js";
import type { TrackClipData, TrackNoteData } from "./section-analyzer.js";
import { computeTrackActivity, computeMidiDensity } from "./section-analyzer.js";

// ─── Exported Types ────────────────────────────────────────────────────

/** A Contrast Gap issue emitted by the detector. */
export interface ContrastGapIssue {
  readonly id: string;
  readonly type: "contrast_gap";
  readonly severity: "warning" | "critical";
  readonly sectionIds: readonly string[];
  readonly message: string;
}

/** Thresholds controlling contrast gap detection sensitivity. */
export interface ContrastGapThresholds {
  /** Max energy delta to be considered "flat" (absolute difference). */
  readonly flatEnergyMaxDelta: number;
  /** Similarity percentage above which sections are "too similar" (0–100). */
  readonly similarityCeilingPercent: number;
}

// ─── Internal Helpers ──────────────────────────────────────────────────

/**
 * Compute the Jaccard index of two sets of active track names.
 *
 * Jaccard index = |intersection| / |union|.
 * Returns 0 if both sets are empty.
 */
function computeJaccardIndex(tracksA: readonly string[], tracksB: readonly string[]): number {
  const setA = new Set(tracksA);
  const setB = new Set(tracksB);

  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const name of setA) {
    if (setB.has(name)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Compute MIDI density ratio between two sections.
 *
 * Ratio = min(densityA, densityB) / max(densityA, densityB).
 * Returns 0 if both densities are 0.
 * Returns 1 if both densities are equal (and non-zero).
 */
function computeMidiDensityRatio(densityA: number, densityB: number): number {
  const minVal = Math.min(densityA, densityB);
  const maxVal = Math.max(densityA, densityB);

  if (maxVal === 0) {
    return 0;
  }

  return minVal / maxVal;
}

/**
 * Compute structural similarity between two adjacent sections.
 *
 * Uses two weighted components:
 * - Track set overlap (Jaccard index): weight 0.5
 * - MIDI density ratio (min/max): weight 0.5
 *
 * The weighted sum is in [0, 1] since all components are in [0, 1].
 */
function computeStructuralSimilarity(
  sectionA: Section,
  sectionB: Section,
  trackClipData: readonly TrackClipData[],
  trackNoteData: readonly TrackNoteData[],
): number {
  // Compute active track names for each section
  const activeTracksA = computeTrackActivity(sectionA, trackClipData);
  const activeTracksB = computeTrackActivity(sectionB, trackClipData);

  // Compute MIDI density for each section
  const midiDensityA = computeMidiDensity(sectionA, trackNoteData);
  const midiDensityB = computeMidiDensity(sectionB, trackNoteData);

  // Compute components
  const trackSetOverlap = computeJaccardIndex(activeTracksA, activeTracksB);
  const midiDensityRatio = computeMidiDensityRatio(midiDensityA, midiDensityB);

  // Weighted sum — equal weight to track overlap and density similarity
  return 0.5 * trackSetOverlap + 0.5 * midiDensityRatio;
}

// ─── Main Detection Function ───────────────────────────────────────────

/**
 * Detect contrast gaps: consecutive sections with high structural similarity
 * AND low energy delta (below flat energy threshold).
 *
 * Algorithm:
 * 1. For each adjacent pair of sections, compute structural similarity and
 *    check both conditions (similarity > threshold AND energy delta < threshold).
 * 2. Group consecutive flagged pairs into runs.
 * 3. Assign severity: "warning" for 2 consecutive sections, "critical" for 3+.
 *
 * @param sections - Ordered array of arrangement sections
 * @param sectionAnalysis - Pre-computed analysis state per section (unused but kept for API consistency)
 * @param energyCurve - Energy score per section (aligned by index)
 * @param trackClipData - All track clip data for computing active track names
 * @param trackNoteData - All track note data for computing MIDI density
 * @param thresholds - Contrast gap detection thresholds
 * @returns Array of contrast gap issues
 */
export function detectContrastGaps(
  sections: readonly Section[],
  sectionAnalysis: ReadonlyMap<string, SectionAnalysisState>,
  energyCurve: readonly number[],
  trackClipData: readonly TrackClipData[],
  trackNoteData: readonly TrackNoteData[],
  thresholds: ContrastGapThresholds,
): ContrastGapIssue[] {
  if (sections.length < 2) {
    return [];
  }

  const similarityThreshold = thresholds.similarityCeilingPercent / 100;
  const energyDeltaThreshold = thresholds.flatEnergyMaxDelta;

  // Step 1: Determine which adjacent pairs are "similar enough"
  // flaggedPairs[i] is true if sections[i] and sections[i+1] form a contrast gap pair
  const flaggedPairs: boolean[] = [];

  for (let i = 0; i < sections.length - 1; i++) {
    const sectionA = sections[i]!;
    const sectionB = sections[i + 1]!;

    // Check energy delta condition
    const energyA = i < energyCurve.length ? energyCurve[i]! : 0;
    const energyB = i + 1 < energyCurve.length ? energyCurve[i + 1]! : 0;
    const energyDelta = Math.abs(energyA - energyB);

    if (energyDelta >= energyDeltaThreshold) {
      flaggedPairs.push(false);
      continue;
    }

    // Check structural similarity condition
    const similarity = computeStructuralSimilarity(
      sectionA,
      sectionB,
      trackClipData,
      trackNoteData,
    );

    flaggedPairs.push(similarity > similarityThreshold);
  }

  // Step 2: Group consecutive flagged pairs into runs of sections
  // A run of N flagged pairs means N+1 consecutive sections are involved.
  const issues: ContrastGapIssue[] = [];
  let runStart = -1;

  for (let i = 0; i <= flaggedPairs.length; i++) {
    const isFlagged = i < flaggedPairs.length && flaggedPairs[i];

    if (isFlagged) {
      if (runStart === -1) {
        runStart = i;
      }
    } else {
      if (runStart !== -1) {
        // End of a run: sections from runStart to i are involved
        // (pair at index j means sections j and j+1 are similar)
        const runEnd = i; // last section index (inclusive)
        const sectionCount = runEnd - runStart + 1;

        // Build issue only if we have at least 2 sections (1 flagged pair)
        if (sectionCount >= 2) {
          const involvedSections = sections.slice(runStart, runEnd + 1);
          const sectionIds = involvedSections.map((s) => s.id);
          const severity: "warning" | "critical" = sectionCount >= 3 ? "critical" : "warning";

          const firstName = involvedSections[0]!.name;
          const lastName = involvedSections[involvedSections.length - 1]!.name;

          let message: string;
          if (sectionCount === 2) {
            message = `Contrast gap between ${firstName} and ${lastName}. These sections are structurally similar with minimal energy variation. Consider adding automation or varying instrumentation.`;
          } else {
            message = `Contrast gap across ${sectionCount} sections from ${firstName} to ${lastName}. These sections lack differentiation. Consider adding automation, varying instrumentation, or introducing new elements.`;
          }

          // Truncate to 200 chars
          if (message.length > 200) {
            message = message.slice(0, 197) + "...";
          }

          const id = sectionCount === 2
            ? `contrast-gap-${sectionIds[0]}-${sectionIds[1]}`
            : `contrast-gap-${sectionIds[0]}-...-${sectionIds[sectionIds.length - 1]}`;

          issues.push({
            id,
            type: "contrast_gap",
            severity,
            sectionIds,
            message,
          });
        }

        runStart = -1;
      }
    }
  }

  return issues;
}
