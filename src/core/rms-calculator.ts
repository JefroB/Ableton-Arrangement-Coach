/**
 * RMS Calculator — computes Root Mean Square energy in dBFS and normalizes
 * to a 0–1 energy range for integration with the Energy Scorer.
 *
 * Pure function module. No SDK calls, no filesystem access, no side effects.
 */

// ─── RMS in dBFS ──────────────────────────────────────────────────────

/**
 * Compute RMS energy in dBFS for a mono PCM buffer.
 *
 * Formula: 20 * log10(sqrt(mean(sample²)))
 *
 * - Returns 0 dBFS for a full-scale signal (all samples at ±1.0).
 * - Returns -Infinity for silence (all samples are 0).
 * - An empty buffer is treated as silence and returns -Infinity.
 *
 * @param pcmBuffer - Mono audio samples in the range [-1.0, 1.0].
 * @returns RMS energy in dBFS (≤ 0, or -Infinity for silence).
 */
export function computeRmsDbfs(pcmBuffer: Float32Array): number {
  const length = pcmBuffer.length;

  if (length === 0) {
    return -Infinity;
  }

  let sumOfSquares = 0;
  for (let i = 0; i < length; i++) {
    const sample = pcmBuffer[i]!;
    sumOfSquares += sample * sample;
  }

  const meanSquare = sumOfSquares / length;
  const rms = Math.sqrt(meanSquare);

  if (rms === 0) {
    return -Infinity;
  }

  return 20 * Math.log10(rms);
}

// ─── Normalization to Energy Range ────────────────────────────────────

/** The dBFS floor below which energy is considered zero. */
const DBFS_FLOOR = -60;

/** The dBFS ceiling representing maximum energy. */
const DBFS_CEILING = 0;

/**
 * Normalize a dBFS value to the 0–1 energy range.
 *
 * Linear interpolation between [-60, 0] dBFS → [0.0, 1.0]:
 * - -60 dBFS or below → 0.0
 * - 0 dBFS → 1.0
 * - -Infinity → 0.0
 * - Output is always clamped to [0, 1].
 *
 * @param dbfs - RMS energy value in dBFS.
 * @returns Normalized energy in the range [0, 1].
 */
export function normalizeRmsToEnergy(dbfs: number): number {
  if (!isFinite(dbfs) || dbfs <= DBFS_FLOOR) {
    return 0;
  }

  if (dbfs >= DBFS_CEILING) {
    return 1;
  }

  // Linear interpolation: (dbfs - floor) / (ceiling - floor)
  return (dbfs - DBFS_FLOOR) / (DBFS_CEILING - DBFS_FLOOR);
}
