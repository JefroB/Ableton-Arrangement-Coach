/**
 * Spectral Analyzer — computes spectral features from a mono PCM buffer
 * using Meyda for FFT/power spectrum extraction and manual frequency band
 * binning, spectral centroid conversion, and spectral flux computation.
 *
 * Pure function: no SDK calls, no filesystem access.
 */

import MeydaModule from "meyda";
import {
  type SpectralProfile,
  type FrequencyBandName,
  FREQUENCY_BANDS,
} from "./audio-content-types.js";

// Meyda's types don't align well with moduleResolution: nodenext.
// The default export is the Meyda singleton with mutable config fields.
const Meyda = MeydaModule as unknown as {
  bufferSize: number;
  sampleRate: number;
  windowingFunction: string;
  extract(
    features: string[],
    signal: Float32Array,
    previousSignal?: Float32Array | null,
  ): { powerSpectrum?: Float32Array; spectralCentroid?: number } | null;
};

/** FFT window size used for spectral analysis. */
const BUFFER_SIZE = 4096;

/** Hop size (50% overlap). */
const HOP_SIZE = 2048;

/**
 * Compute the spectral profile of a mono PCM buffer.
 *
 * - Configures Meyda with bufferSize 4096, Hann window, correct sample rate
 * - Processes windows with 50% overlap (hop size 2048)
 * - Bins powerSpectrum into six frequency bands, converts to dBFS clamped [-96, 0]
 * - Computes per-window spectral centroid (Hz) and mean centroid
 * - Computes mean spectral flux (normalized 0–1)
 * - Zero-pads buffers shorter than 4096 samples
 */
export function computeSpectralProfile(
  pcmBuffer: Float32Array,
  sampleRate: number,
): SpectralProfile {
  // Configure Meyda globally (required by its API)
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.windowingFunction = "hanning";

  // Zero-pad if shorter than BUFFER_SIZE
  const signal =
    pcmBuffer.length < BUFFER_SIZE ? zeroPad(pcmBuffer, BUFFER_SIZE) : pcmBuffer;

  // Determine windows: stride by HOP_SIZE, each window is BUFFER_SIZE samples
  const windows = extractWindows(signal);

  // Per-band energy accumulators (linear scale, summed across windows)
  const bandEnergySums: Record<FrequencyBandName, number> = {
    subBass: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    high: 0,
  };

  const centroidPerWindow: number[] = [];
  const fluxValues: number[] = [];
  let previousPowerSpectrum: Float32Array | null = null;
  let windowCount = 0;

  for (const window of windows) {
    const features = Meyda.extract(["powerSpectrum", "spectralCentroid"], window);
    if (!features || !features.powerSpectrum) continue;

    const powerSpectrum = features.powerSpectrum;
    windowCount++;

    // Bin power spectrum into frequency bands
    const bandEnergies = binPowerSpectrum(powerSpectrum, sampleRate);
    for (const band of FREQUENCY_BANDS) {
      bandEnergySums[band.name] += bandEnergies[band.name];
    }

    // Spectral centroid: Meyda returns in bin units → convert to Hz
    // Meyda may return NaN for all-zero spectra; treat NaN as 0 Hz.
    const rawCentroid = features.spectralCentroid ?? 0;
    const centroidHz = Number.isNaN(rawCentroid)
      ? 0
      : rawCentroid * (sampleRate / BUFFER_SIZE);
    centroidPerWindow.push(centroidHz);

    // Spectral flux: compute manually (Meyda's implementation is broken in v5.6.3)
    if (previousPowerSpectrum !== null) {
      const flux = computeSpectralFlux(previousPowerSpectrum, powerSpectrum);
      fluxValues.push(flux);
    }

    previousPowerSpectrum = powerSpectrum;
  }

  // If no valid windows were processed (shouldn't happen with zero-padding, but be safe)
  if (windowCount === 0) {
    return createSilentProfile();
  }

  // Average band energies across windows, convert to dBFS, clamp to [-96, 0]
  const bands = {} as Record<FrequencyBandName, number>;
  for (const band of FREQUENCY_BANDS) {
    const avgEnergy = bandEnergySums[band.name] / windowCount;
    bands[band.name] = energyToDbfsClamped(avgEnergy);
  }

  // Mean centroid
  const meanCentroid =
    centroidPerWindow.length > 0
      ? centroidPerWindow.reduce((a, b) => a + b, 0) / centroidPerWindow.length
      : 0;

  // Mean spectral flux, normalized to [0, 1]
  const meanSpectralFlux = normalizeFlux(fluxValues);

  return {
    bands: bands as Readonly<Record<FrequencyBandName, number>>,
    meanCentroid,
    centroidPerWindow,
    meanSpectralFlux,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────

/** Zero-pad a buffer to the target length. */
function zeroPad(buffer: Float32Array, targetLength: number): Float32Array {
  const padded = new Float32Array(targetLength);
  padded.set(buffer);
  return padded;
}

/** Extract overlapping windows from the signal with HOP_SIZE stride. */
function extractWindows(signal: Float32Array): Float32Array[] {
  const windows: Float32Array[] = [];
  const numWindows = Math.max(
    1,
    Math.floor((signal.length - BUFFER_SIZE) / HOP_SIZE) + 1,
  );

  for (let i = 0; i < numWindows; i++) {
    const start = i * HOP_SIZE;
    const end = start + BUFFER_SIZE;
    if (end <= signal.length) {
      windows.push(signal.slice(start, end));
    }
  }

  // Ensure at least one window (for buffers exactly BUFFER_SIZE long)
  if (windows.length === 0 && signal.length >= BUFFER_SIZE) {
    windows.push(signal.slice(0, BUFFER_SIZE));
  }

  return windows;
}

/**
 * Bin power spectrum values into six frequency bands.
 * Each bin's frequency = binIndex * sampleRate / bufferSize.
 * Sum energy in each band (linear scale).
 */
function binPowerSpectrum(
  powerSpectrum: Float32Array,
  sampleRate: number,
): Record<FrequencyBandName, number> {
  const result: Record<FrequencyBandName, number> = {
    subBass: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    high: 0,
  };

  const binFreqResolution = sampleRate / BUFFER_SIZE;

  for (let i = 0; i < powerSpectrum.length; i++) {
    const freq = i * binFreqResolution;
    const energy = powerSpectrum[i]!;

    for (const band of FREQUENCY_BANDS) {
      if (freq >= band.lowHz && freq < band.highHz) {
        result[band.name] += energy;
        break;
      }
    }
  }

  return result;
}

/**
 * Convert linear energy sum to dBFS, clamped to [-96, 0].
 * dBFS = 10 * log10(energy), clamped.
 */
function energyToDbfsClamped(energy: number): number {
  if (energy <= 0) return -96;
  const db = 10 * Math.log10(energy);
  return Math.max(-96, Math.min(0, db));
}

/**
 * Compute spectral flux between two consecutive power spectra.
 * Spectral flux = sum of positive differences (half-wave rectified).
 */
function computeSpectralFlux(
  prevSpectrum: Float32Array,
  currSpectrum: Float32Array,
): number {
  let flux = 0;
  const len = Math.min(prevSpectrum.length, currSpectrum.length);

  for (let i = 0; i < len; i++) {
    const diff = (currSpectrum[i] ?? 0) - (prevSpectrum[i] ?? 0);
    if (diff > 0) {
      flux += diff;
    }
  }

  return flux;
}

/**
 * Normalize flux values to [0, 1] range.
 * Uses the maximum flux value as the normalization ceiling.
 * If all flux values are 0, returns 0.
 */
function normalizeFlux(fluxValues: number[]): number {
  if (fluxValues.length === 0) return 0;

  const maxFlux = Math.max(...fluxValues);
  if (maxFlux === 0) return 0;

  const meanFlux =
    fluxValues.reduce((a, b) => a + b, 0) / fluxValues.length;

  // Normalize by the max flux to get a 0–1 range
  return Math.max(0, Math.min(1, meanFlux / maxFlux));
}

/** Create a silent spectral profile (all bands at -96 dB, zero centroid/flux). */
function createSilentProfile(): SpectralProfile {
  return {
    bands: {
      subBass: -96,
      bass: -96,
      lowMid: -96,
      mid: -96,
      highMid: -96,
      high: -96,
    },
    meanCentroid: 0,
    centroidPerWindow: [],
    meanSpectralFlux: 0,
  };
}
