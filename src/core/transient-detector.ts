/**
 * Transient Detector — detects rhythmic transients in a mono PCM buffer
 * using Meyda's spectralFlux feature with a 6 dB threshold above local mean
 * and a 30ms minimum inter-onset interval.
 *
 * Pure function: no SDK calls, no filesystem access.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import MeydaModule from "meyda";
import type {
  TransientDetectionResult,
  RhythmicClassification,
} from "./audio-content-types.js";

// Meyda type shim (same pattern as spectral-analyzer.ts)
const Meyda = MeydaModule as unknown as {
  bufferSize: number;
  sampleRate: number;
  windowingFunction: string;
  extract(
    features: string[],
    signal: Float32Array,
    previousSignal?: Float32Array | null,
  ): { spectralFlux?: number; zcr?: number } | null;
};

/** FFT window size for transient detection. */
const BUFFER_SIZE = 4096;

/** Hop size (50% overlap). */
const HOP_SIZE = 2048;

/** Threshold multiplier: 6 dB above local mean → 10^(6/10) ≈ 3.981 */
const THRESHOLD_MULTIPLIER = Math.pow(10, 6 / 10);

/** Minimum inter-onset interval in seconds. */
const MIN_IOI_SECONDS = 0.03;

/** Silence threshold in dBFS (peak amplitude below this = silent). */
const SILENCE_THRESHOLD_DBFS = -60;

/** Assumed beats per bar for classification (4/4 time). */
const BEATS_PER_BAR = 4;

/**
 * Detect transients in a mono PCM buffer using spectral flux thresholding.
 *
 * Algorithm:
 * 1. Check if buffer is silent (peak < -60 dBFS) → return "silent" immediately
 * 2. Extract spectral flux per frame using Meyda (bufferSize 4096, hop 2048)
 * 3. For each frame, compute local mean spectral flux over a 50ms sliding window
 * 4. Mark frame as transient candidate if flux > localMean * 3.981 (6 dB threshold)
 * 5. Enforce 30ms minimum inter-onset interval (keep higher flux candidate)
 * 6. Compute density = transient count / sectionBars
 * 7. Classify based on transients per beat thresholds
 *
 * @param pcmBuffer - Mono audio samples (Float32Array)
 * @param sampleRate - Sample rate in Hz
 * @param sectionBars - Number of bars in this section
 * @returns Transient detection result with positions, density, and classification
 */
export function detectTransients(
  pcmBuffer: Float32Array,
  sampleRate: number,
  sectionBars: number,
): TransientDetectionResult {
  // Guard: empty buffer or zero bars
  if (pcmBuffer.length === 0 || sectionBars <= 0) {
    return {
      transientPositions: [],
      density: 0,
      classification: "silent",
    };
  }

  // Check if buffer is silent (peak amplitude below -60 dBFS)
  if (isBufferSilent(pcmBuffer)) {
    return {
      transientPositions: [],
      density: 0,
      classification: "silent",
    };
  }

  // Extract spectral flux values per frame
  const fluxPerFrame = extractSpectralFluxPerFrame(pcmBuffer, sampleRate);

  // If no flux frames were extracted, classify based on silence
  if (fluxPerFrame.length === 0) {
    return {
      transientPositions: [],
      density: 0,
      classification: "silent",
    };
  }

  // Compute the number of frames in a 50ms sliding window
  const frameDurationSeconds = HOP_SIZE / sampleRate;
  const slidingWindowFrames = Math.max(
    1,
    Math.round(0.05 / frameDurationSeconds),
  );

  // Identify transient candidates: frames with flux > localMean * threshold
  const candidates = findTransientCandidates(
    fluxPerFrame,
    slidingWindowFrames,
  );

  // Enforce minimum inter-onset interval (30ms)
  const minIOISamples = Math.round(MIN_IOI_SECONDS * sampleRate);
  const filtered = enforceMinimumIOI(candidates, minIOISamples);

  // Extract sample positions from the filtered candidates
  const transientPositions = filtered.map((c) => c.samplePosition);

  // Compute density: transients per bar
  const density = transientPositions.length / sectionBars;

  // Classify rhythmic activity
  const classification = classifyDensity(density);

  return {
    transientPositions,
    density,
    classification,
  };
}

// ─── Internal Types ───────────────────────────────────────────────────

interface TransientCandidate {
  /** Frame index (0-based). */
  frameIndex: number;
  /** Sample position in the buffer (center of the frame). */
  samplePosition: number;
  /** Spectral flux value at this frame. */
  flux: number;
}

// ─── Internal Helpers ─────────────────────────────────────────────────

/**
 * Check if the buffer is silent (peak amplitude below -60 dBFS).
 * -60 dBFS in linear amplitude: 10^(-60/20) = 0.001
 */
function isBufferSilent(pcmBuffer: Float32Array): boolean {
  const silenceThresholdLinear = Math.pow(10, SILENCE_THRESHOLD_DBFS / 20);
  let peak = 0;

  for (let i = 0; i < pcmBuffer.length; i++) {
    const absVal = Math.abs(pcmBuffer[i]!);
    if (absVal > peak) {
      peak = absVal;
    }
  }

  return peak < silenceThresholdLinear;
}

/**
 * Extract spectral flux values for each frame of the buffer.
 * Uses Meyda with bufferSize 4096 and hop size 2048.
 */
function extractSpectralFluxPerFrame(
  pcmBuffer: Float32Array,
  sampleRate: number,
): number[] {
  // Configure Meyda
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.windowingFunction = "hanning";

  // Zero-pad if shorter than BUFFER_SIZE (need at least 2 frames for flux)
  const signal =
    pcmBuffer.length < BUFFER_SIZE * 2
      ? zeroPad(pcmBuffer, BUFFER_SIZE * 2)
      : pcmBuffer;

  const fluxValues: number[] = [];
  const numWindows = Math.max(
    1,
    Math.floor((signal.length - BUFFER_SIZE) / HOP_SIZE) + 1,
  );

  let previousWindow: Float32Array | null = null;

  for (let i = 0; i < numWindows; i++) {
    const start = i * HOP_SIZE;
    const end = start + BUFFER_SIZE;
    if (end > signal.length) break;

    const window = signal.slice(start, end);

    // Meyda's spectralFlux requires a previous frame.
    // Wrap in try/catch because Meyda can throw TypeError on degenerate
    // near-zero buffers when computing power spectra internally.
    let flux = 0;
    try {
      const features = Meyda.extract(
        ["spectralFlux"],
        window,
        previousWindow,
      );
      flux = features?.spectralFlux ?? 0;
    } catch {
      // Meyda failed on this frame — treat as zero flux (no onset)
      flux = 0;
    }
    fluxValues.push(flux);

    previousWindow = window;
  }

  return fluxValues;
}

/**
 * Find transient candidates by comparing each frame's flux against the local
 * mean flux computed over a sliding window of the specified size.
 *
 * A frame is a candidate if: flux > localMean * THRESHOLD_MULTIPLIER (6 dB above).
 */
function findTransientCandidates(
  fluxPerFrame: number[],
  slidingWindowFrames: number,
): TransientCandidate[] {
  const candidates: TransientCandidate[] = [];
  const halfWindow = Math.floor(slidingWindowFrames / 2);

  for (let i = 0; i < fluxPerFrame.length; i++) {
    const flux = fluxPerFrame[i]!;

    // Skip zero/negative flux (no onset possible)
    if (flux <= 0) continue;

    // Compute local mean over the sliding window centered on this frame
    const windowStart = Math.max(0, i - halfWindow);
    const windowEnd = Math.min(fluxPerFrame.length, i + halfWindow + 1);

    let sum = 0;
    let count = 0;
    for (let j = windowStart; j < windowEnd; j++) {
      sum += fluxPerFrame[j]!;
      count++;
    }

    const localMean = sum / count;

    // Threshold: flux must exceed local mean by 6 dB (factor of ~3.981)
    if (localMean > 0 && flux > localMean * THRESHOLD_MULTIPLIER) {
      candidates.push({
        frameIndex: i,
        samplePosition: i * HOP_SIZE + Math.floor(BUFFER_SIZE / 2),
        flux,
      });
    }
  }

  return candidates;
}

/**
 * Enforce minimum inter-onset interval: when two candidates are within
 * the minimum distance (in samples), retain only the one with higher flux.
 */
function enforceMinimumIOI(
  candidates: TransientCandidate[],
  minIOISamples: number,
): TransientCandidate[] {
  if (candidates.length <= 1) return candidates;

  // Sort by sample position (should already be, but ensure)
  const sorted = [...candidates].sort(
    (a, b) => a.samplePosition - b.samplePosition,
  );

  const result: TransientCandidate[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;

    const distance = current.samplePosition - last.samplePosition;

    if (distance < minIOISamples) {
      // Within minimum IOI — keep the one with higher flux
      if (current.flux > last.flux) {
        result[result.length - 1] = current;
      }
      // Otherwise keep the existing last entry
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * Classify rhythmic density based on transients per beat.
 *
 * Thresholds (per beat, assuming 4 beats per bar):
 * - silent: density === 0 (caller must also check buffer silence for "silent" vs "sustained/textural")
 * - sustained/textural: < 0.5 transients per beat → density < 2 per bar
 * - rhythmically moderate: 0.5–4 transients per beat → density 2–16 per bar
 * - rhythmically dense: > 4 transients per beat → density > 16 per bar
 *
 * Note: "silent" classification is handled upstream (buffer peak check).
 * This function only handles the non-silent density thresholds.
 */
function classifyDensity(density: number): RhythmicClassification {
  const transientPerBeat = density / BEATS_PER_BAR;

  if (transientPerBeat < 0.5) {
    return "sustained/textural";
  }

  if (transientPerBeat <= 4) {
    return "rhythmically moderate";
  }

  return "rhythmically dense";
}

/** Zero-pad a buffer to the target length. */
function zeroPad(buffer: Float32Array, targetLength: number): Float32Array {
  const padded = new Float32Array(targetLength);
  padded.set(buffer);
  return padded;
}
