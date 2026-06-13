/**
 * Energy Scorer — computes 1–10 energy scores for arrangement sections.
 *
 * Pure function module. Accepts plain data, returns plain data.
 * No SDK calls, no side effects.
 */

import type { EnergyWeights } from "./genre-registry.js";

// ─── Types ─────────────────────────────────────────────────────────────

/** Per-section input data for scoring. */
export interface SectionScoringInput {
  readonly activeTrackCount: number;
  readonly midiDensity: number;
  readonly trackPresenceRatio: number; // fraction of all tracks with content in section
  readonly automationRatio: number; // fraction of tracks with automation
  readonly frequencyCoverage: number; // fraction of 7 buckets occupied
  readonly velocityIntensity: number; // mean velocity / 127
  readonly polyphonyScore: number; // avg simultaneous notes per beat
  readonly pitchRange: number; // (max - min pitch) / 127
  readonly audioEnergy?: number; // Normalized 0–1 from audio RMS, averaged across audio tracks in section
  readonly synthEnergy?: number; // Normalized 0–1 synth energy contribution for this section
  /** Normalized 0–1 drum richness derived from active drum element count (e.g., activeElements.size / MAX_DRUM_ELEMENTS). */
  readonly drumEnergy?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Compute the automation ratio for a section.
 *
 * Formula: activeAutomated / totalActive.
 * Returns 0 when totalActive is 0 (no division by zero).
 *
 * @param activeAutomated - Number of tracks with active automation envelopes in the section.
 * @param totalActive - Total number of active tracks in the section.
 * @returns Ratio in range [0, 1].
 */
export function computeAutomationRatio(
  activeAutomated: number,
  totalActive: number,
): number {
  if (totalActive === 0) return 0;
  return activeAutomated / totalActive;
}

// ─── Scoring ───────────────────────────────────────────────────────────

/**
 * Compute energy scores for all sections.
 *
 * Algorithm:
 * 1. If sections is empty, return [].
 * 2. For each factor, find the maximum and minimum values across all sections.
 * 3. If a factor has zero variance (max === min), skip it and redistribute
 *    its weight proportionally to the remaining factors.
 * 4. Normalize each section's factor: (value - min) / (max - min) for spread,
 *    with a base offset so the lowest section isn't always 0.
 * 5. Weighted sum = Σ(normalized_factor × adjusted_weight).
 * 6. Scale to 1–10: Math.round(weightedSum * 9 + 1).
 * 7. Clamp to [1, 10].
 * 8. Return array of integer scores.
 *
 * @param sections - Array of per-section scoring inputs.
 * @param weights - Energy weight profile (coefficients should sum to 1.0).
 * @returns Array of integer scores in range [1, 10], same length as input.
 */
export function computeEnergyScores(
  sections: readonly SectionScoringInput[],
  weights: EnergyWeights
): number[] {
  if (sections.length === 0) {
    return [];
  }

  // Step 2: Find the maximum and minimum value for each factor across all sections.
  let maxTrackCount = 0, minTrackCount = Infinity;
  let maxMidiDensity = 0, minMidiDensity = Infinity;
  let maxTrackPresence = 0, minTrackPresence = Infinity;
  let maxAutomation = 0, minAutomation = Infinity;
  let maxFreqCoverage = 0, minFreqCoverage = Infinity;
  let maxVelocityIntensity = 0, minVelocityIntensity = Infinity;
  let maxPolyphonyScore = 0, minPolyphonyScore = Infinity;
  let maxPitchRange = 0, minPitchRange = Infinity;
  let maxAudioEnergy = 0, minAudioEnergy = Infinity;
  let hasAnyAudioEnergy = false;
  let maxSynthEnergy = 0, minSynthEnergy = Infinity;
  let hasAnySynthEnergy = false;
  let maxDrumEnergy = 0, minDrumEnergy = Infinity;
  let hasAnyDrumEnergy = false;

  for (const section of sections) {
    if (section.activeTrackCount > maxTrackCount) maxTrackCount = section.activeTrackCount;
    if (section.activeTrackCount < minTrackCount) minTrackCount = section.activeTrackCount;
    if (section.midiDensity > maxMidiDensity) maxMidiDensity = section.midiDensity;
    if (section.midiDensity < minMidiDensity) minMidiDensity = section.midiDensity;
    if (section.trackPresenceRatio > maxTrackPresence) maxTrackPresence = section.trackPresenceRatio;
    if (section.trackPresenceRatio < minTrackPresence) minTrackPresence = section.trackPresenceRatio;
    if (section.automationRatio > maxAutomation) maxAutomation = section.automationRatio;
    if (section.automationRatio < minAutomation) minAutomation = section.automationRatio;
    if (section.frequencyCoverage > maxFreqCoverage) maxFreqCoverage = section.frequencyCoverage;
    if (section.frequencyCoverage < minFreqCoverage) minFreqCoverage = section.frequencyCoverage;
    if (section.velocityIntensity > maxVelocityIntensity) maxVelocityIntensity = section.velocityIntensity;
    if (section.velocityIntensity < minVelocityIntensity) minVelocityIntensity = section.velocityIntensity;
    if (section.polyphonyScore > maxPolyphonyScore) maxPolyphonyScore = section.polyphonyScore;
    if (section.polyphonyScore < minPolyphonyScore) minPolyphonyScore = section.polyphonyScore;
    if (section.pitchRange > maxPitchRange) maxPitchRange = section.pitchRange;
    if (section.pitchRange < minPitchRange) minPitchRange = section.pitchRange;
    if (section.audioEnergy != null) {
      hasAnyAudioEnergy = true;
      if (section.audioEnergy > maxAudioEnergy) maxAudioEnergy = section.audioEnergy;
      if (section.audioEnergy < minAudioEnergy) minAudioEnergy = section.audioEnergy;
    }
    if (section.synthEnergy != null) {
      hasAnySynthEnergy = true;
      if (section.synthEnergy > maxSynthEnergy) maxSynthEnergy = section.synthEnergy;
      if (section.synthEnergy < minSynthEnergy) minSynthEnergy = section.synthEnergy;
    }
    if (section.drumEnergy != null) {
      hasAnyDrumEnergy = true;
      if (section.drumEnergy > maxDrumEnergy) maxDrumEnergy = section.drumEnergy;
      if (section.drumEnergy < minDrumEnergy) minDrumEnergy = section.drumEnergy;
    }
  }

  // If no sections provide audioEnergy, treat the factor as absent (no variance).
  if (!hasAnyAudioEnergy) {
    maxAudioEnergy = 0;
    minAudioEnergy = 0;
  }

  // If no sections provide synthEnergy, treat the factor as absent (no variance).
  if (!hasAnySynthEnergy) {
    maxSynthEnergy = 0;
    minSynthEnergy = 0;
  }

  // If no sections provide drumEnergy, treat the factor as absent (no variance).
  if (!hasAnyDrumEnergy) {
    maxDrumEnergy = 0;
    minDrumEnergy = 0;
  }

  // Step 3: Determine which factors have variance (can differentiate sections).
  // A factor has variance if its range (max - min) is greater than a tiny epsilon.
  const EPS = 0.001;
  const rangeTrackCount = maxTrackCount - minTrackCount;
  const rangeMidiDensity = maxMidiDensity - minMidiDensity;
  const rangeTrackPresence = maxTrackPresence - minTrackPresence;
  const rangeAutomation = maxAutomation - minAutomation;
  const rangeFreqCoverage = maxFreqCoverage - minFreqCoverage;
  const rangeVelocityIntensity = maxVelocityIntensity - minVelocityIntensity;
  const rangePolyphonyScore = maxPolyphonyScore - minPolyphonyScore;
  const rangePitchRange = maxPitchRange - minPitchRange;
  const rangeAudioEnergy = maxAudioEnergy - minAudioEnergy;
  const rangeSynthEnergy = maxSynthEnergy - minSynthEnergy;
  const rangeDrumEnergy = maxDrumEnergy - minDrumEnergy;

  // Build effective weights: skip zero-variance factors, redistribute their weight.
  const hasVariance = [
    rangeTrackCount > EPS,
    rangeMidiDensity > EPS,
    rangeTrackPresence > EPS,
    rangeAutomation > EPS,
    rangeFreqCoverage > EPS,
    rangeVelocityIntensity > EPS,
    rangePolyphonyScore > EPS,
    rangePitchRange > EPS,
    hasAnyAudioEnergy && rangeAudioEnergy > EPS,
    hasAnySynthEnergy && rangeSynthEnergy > EPS,
    hasAnyDrumEnergy && rangeDrumEnergy > EPS,
  ];

  const audioEnergyWeight = weights.audioEnergyWeight ?? 0;
  const synthEnergyWeight = weights.synthEnergyWeight ?? 0;
  const drumEnergyWeight = weights.drumEnergyWeight ?? 0;
  const rawWeights = [
    weights.trackCountWeight,
    weights.midiDensityWeight,
    weights.trackPresenceWeight,
    weights.automationWeight,
    weights.frequencyCoverageWeight,
    weights.velocityIntensityWeight,
    weights.polyphonyScoreWeight,
    weights.pitchRangeWeight,
    audioEnergyWeight,
    synthEnergyWeight,
    drumEnergyWeight,
  ];

  // Sum of weights for factors WITH variance — these get the redistributed weight.
  let activeWeightSum = 0;
  for (let i = 0; i < rawWeights.length; i++) {
    if (hasVariance[i]) activeWeightSum += rawWeights[i]!;
  }

  // If no factors have variance (degenerate case), return flat scores.
  if (activeWeightSum < EPS) {
    return sections.map(() => 5);
  }

  // Redistribution factor: scale active weights so they sum to 1.0.
  const redistributionScale = 1.0 / activeWeightSum;

  // Step 4–7: For each section, normalize using range-based normalization,
  // compute weighted sum with redistributed weights, scale to 1–10.
  const scores: number[] = [];

  for (const section of sections) {
    let weightedSum = 0;

    // Each factor: if it has variance, normalize as (value - min) / (max - min)
    // This gives 0.0 for the lowest section and 1.0 for the highest.
    // We add a base of 0.3 so the lowest section isn't scored at absolute zero —
    // it still has some musical content.
    if (hasVariance[0]) {
      const norm = (section.activeTrackCount - minTrackCount) / rangeTrackCount;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[0]! * redistributionScale;
    }
    if (hasVariance[1]) {
      const norm = (section.midiDensity - minMidiDensity) / rangeMidiDensity;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[1]! * redistributionScale;
    }
    if (hasVariance[2]) {
      const norm = (section.trackPresenceRatio - minTrackPresence) / rangeTrackPresence;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[2]! * redistributionScale;
    }
    if (hasVariance[3]) {
      const norm = (section.automationRatio - minAutomation) / rangeAutomation;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[3]! * redistributionScale;
    }
    if (hasVariance[4]) {
      const norm = (section.frequencyCoverage - minFreqCoverage) / rangeFreqCoverage;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[4]! * redistributionScale;
    }
    if (hasVariance[5]) {
      const norm = (section.velocityIntensity - minVelocityIntensity) / rangeVelocityIntensity;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[5]! * redistributionScale;
    }
    if (hasVariance[6]) {
      const norm = (section.polyphonyScore - minPolyphonyScore) / rangePolyphonyScore;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[6]! * redistributionScale;
    }
    if (hasVariance[7]) {
      const norm = (section.pitchRange - minPitchRange) / rangePitchRange;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[7]! * redistributionScale;
    }
    if (hasVariance[8]) {
      const audioVal = section.audioEnergy ?? 0;
      const norm = (audioVal - minAudioEnergy) / rangeAudioEnergy;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[8]! * redistributionScale;
    }
    if (hasVariance[9]) {
      const synthVal = section.synthEnergy ?? 0;
      const norm = (synthVal - minSynthEnergy) / rangeSynthEnergy;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[9]! * redistributionScale;
    }
    if (hasVariance[10]) {
      const drumVal = section.drumEnergy ?? 0;
      const norm = (drumVal - minDrumEnergy) / rangeDrumEnergy;
      weightedSum += (0.3 + 0.7 * norm) * rawWeights[10]! * redistributionScale;
    }

    // Scale to 1–10 and clamp
    const raw = Math.round(weightedSum * 9 + 1);
    const clamped = Math.max(1, Math.min(10, raw));

    scores.push(clamped);
  }

  return scores;
}
