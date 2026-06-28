/**
 * Property-based test for audio role classifier behavioral equivalence.
 *
 * Feature: detection-data-externalization, Property 5: Role classifier behavioral equivalence
 *
 * **Validates: Requirements 5.2**
 *
 * For any valid SpectralProfile (with arbitrary band energies and centroid array),
 * any non-negative transientDensity, any spectralFlux value, and any trackName string,
 * calling classifyAudioRole after externalization SHALL produce the same AudioRole result
 * as the pre-externalization implementation with the same inputs.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { classifyAudioRole } from "./audio-role-classifier.js";
import type {
  AudioInstrumentRole,
  AudioRoleResult,
  FrequencyBandName,
  SpectralProfile,
} from "./audio-content-types.js";

// ━━━ Reference Implementation (Original Hardcoded Values) ━━━━━━━━━━━━━━━━━━━

/**
 * These are the original hardcoded thresholds that were previously inlined
 * in audio-role-classifier.ts before externalization.
 */
const REF_THRESHOLDS = {
  drums: {
    transientDensityMin: 8,
    maxBandFractionCeiling: 0.4,
  },
  vocal: {
    centroidMin: 2000,
    highCentroidFrameFraction: 0.7,
    formantFractionMin: 0.1,
  },
  bass: {
    energyFractionMin: 0.6,
    frequencyCeiling: 250,
    transientDensityCeiling: 4,
  },
  synthLead: {
    energyFractionMin: 0.6,
    lowFrequencyBound: 1000,
    highFrequencyBound: 8000,
    transientDensityCeiling: 4,
  },
  synthPad: {
    energyFractionMin: 0.6,
    lowFrequencyBound: 200,
    highFrequencyBound: 2000,
    transientDensityCeiling: 2,
    spectralFluxCeiling: 0.1,
  },
  fullMix: {
    maxBandFractionCeiling: 0.35,
    transientDensityLow: 4,
    transientDensityHigh: 8,
  },
} as const;

const REF_NAME_HINT_PATTERNS = {
  drums: /\b(drum|drums|loop)\b/i,
  vocal: /\b(vox|vocal|vocals)\b/i,
  bass: /\bbass\b/i,
  pad: /\bpad\b/i,
} as const;

// ━━━ Reference Helper Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refDbfsToLinear(dbfs: number): number {
  return Math.pow(10, dbfs / 10);
}

function refBandEnergyFraction(
  bands: Readonly<Record<FrequencyBandName, number>>,
  totalLinear: number,
  bandNames: readonly FrequencyBandName[],
): number {
  if (totalLinear === 0) return 0;
  let sum = 0;
  for (const name of bandNames) {
    sum += refDbfsToLinear(bands[name]);
  }
  return sum / totalLinear;
}

function refMaxBandFraction(
  bands: Readonly<Record<FrequencyBandName, number>>,
  totalLinear: number,
): number {
  if (totalLinear === 0) return 0;
  const allBands: FrequencyBandName[] = [
    "subBass", "bass", "lowMid", "mid", "highMid", "high",
  ];
  let max = 0;
  for (const name of allBands) {
    const fraction = refDbfsToLinear(bands[name]) / totalLinear;
    if (fraction > max) max = fraction;
  }
  return max;
}

function refComputeTotalLinearEnergy(
  bands: Readonly<Record<FrequencyBandName, number>>,
): number {
  const allBands: FrequencyBandName[] = [
    "subBass", "bass", "lowMid", "mid", "highMid", "high",
  ];
  let total = 0;
  for (const name of allBands) {
    total += refDbfsToLinear(bands[name]);
  }
  return total;
}

// ━━━ Reference Name Hint Logic ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type NameHint = "bass" | "vocal" | "drums" | "pad" | null;

function refGetNameHint(trackName: string): NameHint {
  const lower = trackName.toLowerCase();
  if (REF_NAME_HINT_PATTERNS.drums.test(lower)) return "drums";
  if (REF_NAME_HINT_PATTERNS.vocal.test(lower)) return "vocal";
  if (REF_NAME_HINT_PATTERNS.bass.test(lower)) return "bass";
  if (REF_NAME_HINT_PATTERNS.pad.test(lower)) return "pad";
  return null;
}

function refNameHintToRole(hint: NameHint): AudioInstrumentRole | null {
  switch (hint) {
    case "bass": return "bass";
    case "vocal": return "vocal";
    case "drums": return "drums";
    case "pad": return "synth_pad";
    default: return null;
  }
}

// ━━━ Reference Rule Checkers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refIsDrums(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  return (
    transientDensity > REF_THRESHOLDS.drums.transientDensityMin &&
    refMaxBandFraction(bands, totalLinear) <= REF_THRESHOLDS.drums.maxBandFractionCeiling
  );
}

function refIsVocal(profile: SpectralProfile): boolean {
  const { centroidPerWindow, bands } = profile;

  if (centroidPerWindow.length === 0) return false;
  const highCentroidCount = centroidPerWindow.filter(
    (c) => c > REF_THRESHOLDS.vocal.centroidMin,
  ).length;
  const highCentroidRatio = highCentroidCount / centroidPerWindow.length;
  if (highCentroidRatio < REF_THRESHOLDS.vocal.highCentroidFrameFraction) return false;

  const lowMidLinear = refDbfsToLinear(bands.lowMid);
  const midLinear = refDbfsToLinear(bands.mid);
  const totalLinear = refComputeTotalLinearEnergy(bands);

  if (totalLinear === 0) return false;

  const lowMidFraction = lowMidLinear / totalLinear;
  const midFraction = midLinear / totalLinear;

  return (
    lowMidFraction >= REF_THRESHOLDS.vocal.formantFractionMin &&
    midFraction >= REF_THRESHOLDS.vocal.formantFractionMin
  );
}

function refIsBass(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  const lowFraction = refBandEnergyFraction(bands, totalLinear, ["subBass", "bass"]);
  return (
    lowFraction >= REF_THRESHOLDS.bass.energyFractionMin &&
    transientDensity < REF_THRESHOLDS.bass.transientDensityCeiling
  );
}

function refIsSynthLead(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  const midHighFraction = refBandEnergyFraction(bands, totalLinear, ["mid", "highMid"]);
  return (
    midHighFraction >= REF_THRESHOLDS.synthLead.energyFractionMin &&
    transientDensity < REF_THRESHOLDS.synthLead.transientDensityCeiling
  );
}

function refIsSynthPad(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
  spectralFlux: number,
): boolean {
  const padFraction = refBandEnergyFraction(bands, totalLinear, ["bass", "lowMid", "mid"]);
  return (
    padFraction >= REF_THRESHOLDS.synthPad.energyFractionMin &&
    transientDensity < REF_THRESHOLDS.synthPad.transientDensityCeiling &&
    spectralFlux < REF_THRESHOLDS.synthPad.spectralFluxCeiling
  );
}

function refIsFullMix(
  totalLinear: number,
  bands: Readonly<Record<FrequencyBandName, number>>,
  transientDensity: number,
): boolean {
  return (
    refMaxBandFraction(bands, totalLinear) <= REF_THRESHOLDS.fullMix.maxBandFractionCeiling &&
    transientDensity >= REF_THRESHOLDS.fullMix.transientDensityLow &&
    transientDensity <= REF_THRESHOLDS.fullMix.transientDensityHigh
  );
}

// ━━━ Reference Classifier ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function referenceClassifyAudioRole(
  spectralProfile: SpectralProfile,
  transientDensity: number,
  trackName: string,
  clipLengthBars: number,
): AudioRoleResult {
  if (clipLengthBars < 1) {
    return { role: "unclassified", confidence: 0.4, nameOverridden: false };
  }

  const { bands, meanSpectralFlux } = spectralProfile;
  const totalLinear = refComputeTotalLinearEnergy(bands);

  let spectralRole: AudioInstrumentRole = "unclassified";
  let confidence = 0.4;

  if (refIsDrums(totalLinear, bands, transientDensity)) {
    spectralRole = "drums";
    confidence = 0.8;
  } else if (refIsVocal(spectralProfile)) {
    spectralRole = "vocal";
    confidence = 0.8;
  } else if (refIsBass(totalLinear, bands, transientDensity)) {
    spectralRole = "bass";
    confidence = 0.8;
  } else if (refIsSynthLead(totalLinear, bands, transientDensity)) {
    spectralRole = "synth_lead";
    confidence = 0.8;
  } else if (refIsSynthPad(totalLinear, bands, transientDensity, meanSpectralFlux)) {
    spectralRole = "synth_pad";
    confidence = 0.8;
  } else if (refIsFullMix(totalLinear, bands, transientDensity)) {
    spectralRole = "full_mix";
    confidence = 0.8;
  }

  const nameHint = refGetNameHint(trackName);
  const nameRole = refNameHintToRole(nameHint);

  if (nameRole !== null && nameRole !== spectralRole) {
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

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a band energy value in dBFS range [-100, 0].
 */
function arbBandEnergy(): fc.Arbitrary<number> {
  return fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate a valid Record of 6 FrequencyBandName → number in [-100, 0].
 */
function arbBands(): fc.Arbitrary<Readonly<Record<FrequencyBandName, number>>> {
  return fc
    .tuple(
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
      arbBandEnergy(),
    )
    .map(([subBass, bass, lowMid, mid, highMid, high]) => ({
      subBass,
      bass,
      lowMid,
      mid,
      highMid,
      high,
    }));
}

/**
 * Generate a centroidPerWindow array of 0–100 values in [0, 20000].
 */
function arbCentroidPerWindow(): fc.Arbitrary<readonly number[]> {
  return fc.array(
    fc.double({ min: 0, max: 20000, noNaN: true, noDefaultInfinity: true }),
    { minLength: 0, maxLength: 100 },
  );
}

/**
 * Generate a mean spectral flux value in [0, 1].
 */
function arbMeanSpectralFlux(): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate a valid SpectralProfile with arbitrary but valid values.
 */
function arbSpectralProfile(): fc.Arbitrary<SpectralProfile> {
  return fc
    .tuple(arbBands(), arbCentroidPerWindow(), arbMeanSpectralFlux())
    .map(([bands, centroidPerWindow, meanSpectralFlux]) => ({
      bands,
      meanCentroid: centroidPerWindow.length > 0
        ? centroidPerWindow.reduce((a, b) => a + b, 0) / centroidPerWindow.length
        : 0,
      centroidPerWindow,
      meanSpectralFlux,
    }));
}

/**
 * Generate a transient density value in [0, 20].
 */
function arbTransientDensity(): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true });
}

/**
 * Generate a track name: mix of random strings and name-hint-triggering strings.
 */
function arbTrackName(): fc.Arbitrary<string> {
  return fc.oneof(
    // Random strings that won't trigger name hints
    fc.string({ minLength: 0, maxLength: 30 }),
    // Names that might trigger override logic
    fc.constantFrom(
      "Bass",
      "Sub Bass",
      "my bass track",
      "Vocal",
      "Vox dry",
      "Lead Vocal",
      "vocals",
      "Drum Loop",
      "drums",
      "loop",
      "Pad",
      "Synth Pad",
      "Piano",
      "Guitar",
      "Main Mix",
      "",
      "Track 1",
      "Audio 3",
    ),
  );
}

/**
 * Generate clip length in bars [0, 64].
 */
function arbClipLengthBars(): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: 64, noNaN: true, noDefaultInfinity: true });
}

// ━━━ Property Test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: detection-data-externalization, Property 5: Role classifier behavioral equivalence", () => {
  test.prop(
    [
      arbSpectralProfile(),
      arbTransientDensity(),
      arbTrackName(),
      arbClipLengthBars(),
    ],
    { numRuns: 200 },
  )(
    "classifyAudioRole produces identical results to the reference implementation using original hardcoded values",
    (spectralProfile, transientDensity, trackName, clipLengthBars) => {
      const actual = classifyAudioRole(spectralProfile, transientDensity, trackName, clipLengthBars);
      const expected = referenceClassifyAudioRole(spectralProfile, transientDensity, trackName, clipLengthBars);

      expect(actual.role).toBe(expected.role);
      expect(actual.confidence).toBe(expected.confidence);
      expect(actual.nameOverridden).toBe(expected.nameOverridden);
    },
  );
});
