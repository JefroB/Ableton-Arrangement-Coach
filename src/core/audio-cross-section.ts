/**
 * Cross-Section Audio Comparator — compares spectral profiles between
 * consecutive sections on a per-track basis to detect repetition and
 * variation in audio content.
 *
 * Pure function module. No SDK calls, no filesystem access, no side effects.
 */

import type {
  AudioCrossSectionComparison,
  AudioSimilarityFlag,
  SpectralProfile,
  FrequencyBandName,
} from "./audio-content-types.js";
import { FREQUENCY_BANDS } from "./audio-content-types.js";

// ─── Constants ────────────────────────────────────────────────────────

/** Cosine similarity above this threshold → "same audio content". */
const SAME_THRESHOLD = 0.95;

/** Cosine similarity at or above this threshold → "similar audio content". */
const SIMILAR_THRESHOLD = 0.7;

/** Silence floor in dBFS — sections at or below this are skipped. */
const SILENCE_FLOOR_DBFS = -60;

// ─── Cosine Similarity ────────────────────────────────────────────────

/**
 * Compute cosine similarity between two non-negative numeric vectors.
 *
 * Formula: dot(A, B) / (||A|| × ||B||)
 *
 * - Returns 0 for zero vectors (avoids division by zero).
 * - Result is in [0, 1] for non-negative vectors.
 * - Symmetric: similarity(A, B) === similarity(B, A).
 *
 * @param vectorA - First numeric vector.
 * @param vectorB - Second numeric vector (must be same length as vectorA).
 * @returns Cosine similarity in [0, 1].
 */
export function computeCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  const length = Math.min(vectorA.length, vectorB.length);

  if (length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < length; i++) {
    const a = vectorA[i]!;
    const b = vectorB[i]!;
    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (denominator === 0) {
    return 0;
  }

  // Clamp to [0, 1] to handle floating-point imprecision.
  const similarity = dotProduct / denominator;
  return Math.max(0, Math.min(1, similarity));
}

// ─── Similarity Flag Assignment ───────────────────────────────────────

/**
 * Assign a similarity flag based on cosine similarity thresholds.
 *
 * - > 0.95 → "same audio content"
 * - 0.7–0.95 (inclusive) → "similar audio content"
 * - < 0.7 → "different audio content"
 */
function assignSimilarityFlag(similarity: number): AudioSimilarityFlag {
  if (similarity > SAME_THRESHOLD) {
    return "same audio content";
  }
  if (similarity >= SIMILAR_THRESHOLD) {
    return "similar audio content";
  }
  return "different audio content";
}

// ─── Section Silence Detection ────────────────────────────────────────

/**
 * Check whether a spectral profile represents silence.
 *
 * A section is considered silent when all frequency band energies are
 * at or below -60 dBFS.
 */
function isSilentProfile(profile: SpectralProfile): boolean {
  const bandNames: readonly FrequencyBandName[] = FREQUENCY_BANDS.map((b) => b.name);
  return bandNames.every((name) => profile.bands[name] <= SILENCE_FLOOR_DBFS);
}

// ─── Linear Energy Conversion ─────────────────────────────────────────

/**
 * Convert a spectral profile's dBFS band energies to linear scale for
 * cosine similarity computation.
 *
 * Formula: 10^(dBFS / 10) — converts power dBFS to linear power.
 * Linear values are always positive, making cosine similarity well-defined
 * in the [0, 1] range.
 */
function profileToLinearVector(profile: SpectralProfile): number[] {
  const bandNames: readonly FrequencyBandName[] = FREQUENCY_BANDS.map((b) => b.name);
  return bandNames.map((name) => Math.pow(10, profile.bands[name] / 10));
}

// ─── Compare Consecutive Sections ─────────────────────────────────────

/**
 * Compare spectral profiles between consecutive sections for one audio track.
 *
 * For each consecutive pair (i, i+1):
 * - Converts the 6-band dBFS energy vector to linear scale
 * - Computes cosine similarity
 * - Assigns a flag based on thresholds
 * - Skips pairs where either section is silent (below -60 dBFS)
 *
 * @param profiles - Ordered array of spectral profiles, one per section.
 * @returns Array of comparisons between consecutive section pairs.
 */
export function compareAudioSections(
  profiles: readonly SpectralProfile[],
): readonly AudioCrossSectionComparison[] {
  const comparisons: AudioCrossSectionComparison[] = [];

  for (let i = 0; i < profiles.length - 1; i++) {
    const profileA = profiles[i]!;
    const profileB = profiles[i + 1]!;

    // Skip pairs where either section has no audio content (silence).
    if (isSilentProfile(profileA) || isSilentProfile(profileB)) {
      continue;
    }

    const vectorA = profileToLinearVector(profileA);
    const vectorB = profileToLinearVector(profileB);

    const similarity = computeCosineSimilarity(vectorA, vectorB);
    const flag = assignSimilarityFlag(similarity);

    comparisons.push({
      sectionIndexA: i,
      sectionIndexB: i + 1,
      similarity,
      flag,
    });
  }

  return comparisons;
}

// ─── Extended Repetition Detection ────────────────────────────────────

/**
 * Detect extended repetition: runs of 3 or more consecutive comparisons
 * flagged as "same audio content".
 *
 * Returns groups of section indices involved in each run. For example, if
 * comparisons [0,1], [1,2], [2,3] are all "same audio content", the result
 * is [[0, 1, 2, 3]] (4 sections connected by 3 consecutive "same" flags).
 *
 * @param comparisons - Ordered array of cross-section comparisons.
 * @returns Array of section-index groups (each group has 4+ indices).
 */
export function detectExtendedRepetition(
  comparisons: readonly AudioCrossSectionComparison[],
): readonly number[][] {
  const groups: number[][] = [];

  let currentRun: number[] = [];
  let runLength = 0;

  for (let i = 0; i < comparisons.length; i++) {
    const comparison = comparisons[i]!;

    if (comparison.flag === "same audio content") {
      if (runLength === 0) {
        // Start a new run with both sections from this comparison.
        currentRun = [comparison.sectionIndexA, comparison.sectionIndexB];
      } else {
        // Extend the run — only add the new section (B), since A is already in the run.
        currentRun.push(comparison.sectionIndexB);
      }
      runLength++;
    } else {
      // Run broken — emit if it had 3+ consecutive "same" comparisons.
      if (runLength >= 3) {
        groups.push(currentRun);
      }
      currentRun = [];
      runLength = 0;
    }
  }

  // Check final run.
  if (runLength >= 3) {
    groups.push(currentRun);
  }

  return groups;
}
