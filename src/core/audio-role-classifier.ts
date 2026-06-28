/**
 * Audio Role Classifier — infers the musical function of an audio track
 * from its spectral profile and transient density.
 *
 * Priority order: drums → vocal → bass → synth_lead → synth_pad → full_mix → unclassified.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11
 */

import type {
  AudioInstrumentRole,
  AudioRoleResult,
  FrequencyBandName,
  SpectralProfile,
} from "./audio-content-types";
import { getRoleThresholds, getNameHintPatterns } from "./role-classification-loader.js";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Convert a dBFS band energy value to linear power.
 * dBFS values represent 10*log10(power), so linear = 10^(dBFS/10).
 */
function dbfsToLinear(dbfs: number): number {
  return Math.pow(10, dbfs / 10);
}

/**
 * Compute the linear energy fraction for a set of bands relative to the total.
 * Returns a value in [0, 1].
 */
function bandEnergyFraction(
  bands: Readonly<Record<FrequencyBandName, number>>,
  totalLinear: number,
  bandNames: readonly FrequencyBandName[],
): number {
  if (totalLinear === 0) return 0;
  let sum = 0;
  for (const name of bandNames) {
    sum += dbfsToLinear(bands[name]);
  }
  return sum / totalLinear;
}

/**
 * Get the maximum single-band fraction of total energy.
 */
function maxBandFraction(
  bands: Readonly<Record<FrequencyBandName, number>>,
  totalLinear: number,
): number {
  if (totalLinear === 0) return 0;
  const allBands: FrequencyBandName[] = [
    "subBass",
    "bass",
    "lowMid",
    "mid",
    "highMid",
    "high",
  ];
  let max = 0;
  for (const name of allBands) {
    const fraction = dbfsToLinear(bands[name]) / totalLinear;
    if (fraction > max) max = fraction;
  }
  return max;
}

/**
 * Compute total linear energy across all bands.
 */
function computeTotalLinearEnergy(
  bands: Readonly<Record<FrequencyBandName, number>>,
): number {
  const allBands: FrequencyBandName[] = [
    "subBass",
    "bass",
    "lowMid",
    "mid",
    "highMid",
    "high",
  ];
  let total = 0;
  for (const name of allBands) {
    total += dbfsToLinear(bands[name]);
  }
  return total;
}

// ━━━ Track Name Detection ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Name-based role hints from track names. */
type NameHint = "bass" | "vocal" | "drums" | "pad" | null;

/**
 * Extract a role hint from a track name (case-insensitive).
 */
function getNameHint(trackName: string): NameHint {
  const lower = trackName.toLowerCase();
  const patterns = getNameHintPatterns();
  if (patterns.drums.test(lower)) return "drums";
  if (patterns.vocal.test(lower)) return "vocal";
  if (patterns.bass.test(lower)) return "bass";
  if (patterns.pad.test(lower)) return "pad";
  return null;
}

/**
 * Map a name hint to the corresponding AudioInstrumentRole.
 */
function nameHintToRole(hint: NameHint): AudioInstrumentRole | null {
  switch (hint) {
    case "bass":
      return "bass";
    case "vocal":
      return "vocal";
    case "drums":
      return "drums";
    case "pad":
      return "synth_pad";
    default:
      return null;
  }
}

// ━━━ Rule Checkers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isDrums(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  const thresholds = getRoleThresholds();
  // Transient density > threshold per bar AND no single band > ceiling of total
  return (
    transientDensity > thresholds.drums.transientDensityMin &&
    maxBandFraction(bands, totalLinear) <= thresholds.drums.maxBandFractionCeiling
  );
}

function isVocal(profile: SpectralProfile): boolean {
  const thresholds = getRoleThresholds();
  const { centroidPerWindow, bands } = profile;

  // Centroid > threshold Hz for fraction+ of frames
  if (centroidPerWindow.length === 0) return false;
  const highCentroidCount = centroidPerWindow.filter(
    (c) => c > thresholds.vocal.centroidMin,
  ).length;
  const highCentroidRatio = highCentroidCount / centroidPerWindow.length;
  if (highCentroidRatio < thresholds.vocal.highCentroidFrameFraction) return false;

  // 3+ formant-like peaks in 300–3000 Hz range.
  // Formant-like peaks are energy peaks in the lowMid and mid bands
  // that are spaced 500–1500 Hz apart.
  // We approximate this by checking if the lowMid and mid bands have
  // significant energy relative to other bands, indicating formant structure.
  // The design specifies: "peaks in bands lowMid + mid that are spaced 500-1500 Hz apart"
  // Since we only have 6 band energies, we check if both lowMid and mid are active
  // and that the energy distribution suggests formant structure (multiple peaks).
  //
  // With only band-level data, we infer formant-like peaks by checking:
  // - lowMid (250-1000 Hz) and mid (1000-4000 Hz) both have non-trivial energy
  // - These bands together cover the 300-3000 Hz formant region
  // - The bands show enough energy to indicate multiple resonant peaks
  const lowMidLinear = dbfsToLinear(bands.lowMid);
  const midLinear = dbfsToLinear(bands.mid);
  const totalLinear = computeTotalLinearEnergy(bands);

  if (totalLinear === 0) return false;

  // Both lowMid and mid must contribute meaningfully (proxy for 3+ peaks spanning 300-3000 Hz)
  // A vocal with 3+ formants will show energy in both lowMid (250-1000) covering F1
  // and mid (1000-4000) covering F2, F3. We require both to have at least formantFractionMin
  // of total energy.
  const lowMidFraction = lowMidLinear / totalLinear;
  const midFraction = midLinear / totalLinear;

  // formantCountMin formant peaks spaced 500-1500 Hz apart implies energy spread across lowMid + mid.
  // If both bands have >formantFractionMin energy, that suggests at least the fundamental + 2 formants.
  return (
    lowMidFraction >= thresholds.vocal.formantFractionMin &&
    midFraction >= thresholds.vocal.formantFractionMin
  );
}

function isBass(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  const thresholds = getRoleThresholds();
  // energyFractionMin+ energy below frequencyCeiling Hz (subBass + bass), transient density < ceiling/bar
  const lowFraction = bandEnergyFraction(bands, totalLinear, [
    "subBass",
    "bass",
  ]);
  return (
    lowFraction >= thresholds.bass.energyFractionMin &&
    transientDensity < thresholds.bass.transientDensityCeiling
  );
}

function isSynthLead(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  const thresholds = getRoleThresholds();
  // energyFractionMin+ energy 1000–8000 Hz (mid + highMid), transient density < ceiling/bar
  const midHighFraction = bandEnergyFraction(bands, totalLinear, [
    "mid",
    "highMid",
  ]);
  return (
    midHighFraction >= thresholds.synthLead.energyFractionMin &&
    transientDensity < thresholds.synthLead.transientDensityCeiling
  );
}

function isSynthPad(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
  spectralFlux: number,
): boolean {
  const thresholds = getRoleThresholds();
  // energyFractionMin+ energy 200–2000 Hz (bass + lowMid + mid), transient density < ceiling/bar, spectral flux < ceiling
  const padFraction = bandEnergyFraction(bands, totalLinear, [
    "bass",
    "lowMid",
    "mid",
  ]);
  return (
    padFraction >= thresholds.synthPad.energyFractionMin &&
    transientDensity < thresholds.synthPad.transientDensityCeiling &&
    spectralFlux < thresholds.synthPad.spectralFluxCeiling
  );
}

function isFullMix(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  const thresholds = getRoleThresholds();
  // No single band > ceiling%, transient density between low–high/bar
  return (
    maxBandFraction(bands, totalLinear) <= thresholds.fullMix.maxBandFractionCeiling &&
    transientDensity >= thresholds.fullMix.transientDensityLow &&
    transientDensity <= thresholds.fullMix.transientDensityHigh
  );
}

// ━━━ Main Classifier ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Classify an audio track's musical function from spectral and temporal features.
 *
 * Priority order: drums → vocal → bass → synth_lead → synth_pad → full_mix → unclassified.
 *
 * Track name override: if a track name hint contradicts the spectral classification,
 * the name is preferred and confidence is set to 0.6 with nameOverridden=true.
 *
 * @param spectralProfile - Spectral energy profile for the track
 * @param transientDensity - Transients per bar
 * @param trackName - Name of the track (used for override logic)
 * @param clipLengthBars - Length of the audio clip in bars
 * @returns AudioRoleResult with role, confidence, and override flag
 */
export function classifyAudioRole(
  spectralProfile: SpectralProfile,
  transientDensity: number,
  trackName: string,
  clipLengthBars: number,
): AudioRoleResult {
  // If clip is shorter than 1 bar, return unclassified immediately
  if (clipLengthBars < 1) {
    return { role: "unclassified", confidence: 0.4, nameOverridden: false };
  }

  const { bands, meanSpectralFlux } = spectralProfile;
  const totalLinear = computeTotalLinearEnergy(bands);

  // Determine spectral-based role in priority order
  let spectralRole: AudioInstrumentRole = "unclassified";
  let confidence = 0.4; // weak match by default

  if (isDrums(totalLinear, bands, transientDensity)) {
    spectralRole = "drums";
    confidence = 0.8;
  } else if (isVocal(spectralProfile)) {
    spectralRole = "vocal";
    confidence = 0.8;
  } else if (isBass(totalLinear, bands, transientDensity)) {
    spectralRole = "bass";
    confidence = 0.8;
  } else if (isSynthLead(totalLinear, bands, transientDensity)) {
    spectralRole = "synth_lead";
    confidence = 0.8;
  } else if (isSynthPad(totalLinear, bands, transientDensity, meanSpectralFlux)) {
    spectralRole = "synth_pad";
    confidence = 0.8;
  } else if (isFullMix(totalLinear, bands, transientDensity)) {
    spectralRole = "full_mix";
    confidence = 0.8;
  }
  // Otherwise remains "unclassified" with confidence 0.4

  // Track name override logic
  const nameHint = getNameHint(trackName);
  const nameRole = nameHintToRole(nameHint);

  if (nameRole !== null && nameRole !== spectralRole) {
    // Name contradicts spectral classification — prefer name
    return {
      role: nameRole,
      confidence: 0.6,
      nameOverridden: true,
    };
  }

  return {
    role: spectralRole,
    confidence,
    nameOverridden: false,
  };
}
