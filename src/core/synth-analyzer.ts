/**
 * Synth Analyzer — MIDI analysis functions for synth tracks (lead, pad,
 * chord, arpeggio, bass). Computes pitch content, velocity dynamics,
 * articulation patterns, rhythmic regularity, polyphony, melodic contour,
 * and harmonic interval profiles.
 *
 * Pure function module. Accepts plain data, returns plain data.
 * No SDK calls, no side effects.
 */

import type { NoteData } from "../ableton/sdk-adapter.js";
import type {
  ArticulationPattern,
  HarmonicIntervalProfile,
  MelodicContour,
  MelodicContourShape,
  PitchContent,
  PolyphonyProfile,
  SynthAnalysisResult,
  SynthCrossSectionComparison,
  SynthDiscontinuity,
  SynthTrackProfile,
  VelocityContourDirection,
  VelocityDynamics,
} from "./synth-analysis-types.js";
import type { InstrumentRole } from "./content-analysis-types.js";
import type { Section } from "./section-scanner.js";
import type { TrackNoteData } from "./section-analyzer.js";

// ─── Pitch Content ────────────────────────────────────────────────────

/**
 * Compute pitch content for notes within a section time range.
 *
 * Filters notes where note.startTime >= sectionStart AND note.startTime < sectionEnd.
 * Returns pitch classes (note.pitch % 12) and pitch range (max - min pitch).
 */
export function computePitchContent(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): PitchContent {
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  if (sectionNotes.length === 0) {
    return {
      pitchClasses: new Set<number>(),
      pitchRange: 0,
    };
  }

  const pitchClasses = new Set<number>();
  let minPitch = Infinity;
  let maxPitch = -Infinity;

  for (const note of sectionNotes) {
    pitchClasses.add(note.pitch % 12);
    if (note.pitch < minPitch) minPitch = note.pitch;
    if (note.pitch > maxPitch) maxPitch = note.pitch;
  }

  return {
    pitchClasses,
    pitchRange: maxPitch - minPitch,
  };
}


// ─── Note Density ─────────────────────────────────────────────────────

/**
 * Compute note density (notes per beat) within a section time range.
 *
 * Guards against zero-duration sections by returning 0.
 */
export function computeNoteDensity(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): number {
  const duration = sectionEnd - sectionStart;
  if (duration <= 0) return 0;

  const count = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  ).length;

  return count / duration;
}

// ─── Velocity Dynamics ────────────────────────────────────────────────

/**
 * Compute velocity dynamics: min, max, mean, stdDev, and contour classification.
 *
 * Contour is classified by the linear regression slope of velocity over onset time:
 * - rising: slope > +0.5
 * - falling: slope < -0.5
 * - flat: |slope| <= 0.5 AND stdDev <= 10
 * - varied: |slope| <= 0.5 AND stdDev > 10
 */
export function computeVelocityDynamics(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): VelocityDynamics {
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  // Guard: no notes → return zeroed-out dynamics with "flat" contour
  if (sectionNotes.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, contour: "flat" };
  }

  // Compute min, max, mean
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const note of sectionNotes) {
    if (note.velocity < min) min = note.velocity;
    if (note.velocity > max) max = note.velocity;
    sum += note.velocity;
  }

  const mean = sum / sectionNotes.length;

  // Compute standard deviation
  let varianceSum = 0;
  for (const note of sectionNotes) {
    varianceSum += (note.velocity - mean) ** 2;
  }
  const stdDev = Math.sqrt(varianceSum / sectionNotes.length);

  // Compute linear regression slope: velocity over onset time
  // slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²) where x = startTime, y = velocity
  let sumX = 0;
  for (const note of sectionNotes) {
    sumX += note.startTime;
  }
  const meanX = sumX / sectionNotes.length;

  let numerator = 0;
  let denominator = 0;
  for (const note of sectionNotes) {
    const dx = note.startTime - meanX;
    const dy = note.velocity - mean;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  // Guard against zero denominator (all notes at same time)
  const slope = denominator === 0 ? 0 : numerator / denominator;

  // Classify contour
  let contour: VelocityContourDirection;
  if (slope > 0.5) {
    contour = "rising";
  } else if (slope < -0.5) {
    contour = "falling";
  } else if (stdDev <= 10) {
    contour = "flat";
  } else {
    contour = "varied";
  }

  return { min, max, mean, stdDev, contour };
}


// ─── Articulation Pattern ─────────────────────────────────────────────

/**
 * Compute articulation pattern by comparing average note duration to grid spacing.
 *
 * Classification thresholds:
 * - staccato: avgDuration / gridSpacing < 0.5
 * - legato: avgDuration / gridSpacing > 0.9
 * - mixed: otherwise
 *
 * Guards against empty arrays and zero grid spacing.
 */
export function computeArticulationPattern(
  notes: readonly NoteData[],
  gridSpacing: number,
): ArticulationPattern {
  // Guard: empty notes or invalid grid spacing
  if (notes.length === 0 || gridSpacing <= 0) {
    return { type: "mixed", averageDurationRatio: 0 };
  }

  let totalDuration = 0;
  for (const note of notes) {
    totalDuration += note.duration;
  }
  const avgDuration = totalDuration / notes.length;
  const ratio = avgDuration / gridSpacing;

  let type: "staccato" | "legato" | "mixed";
  if (ratio < 0.5) {
    type = "staccato";
  } else if (ratio > 0.9) {
    type = "legato";
  } else {
    type = "mixed";
  }

  return { type, averageDurationRatio: ratio };
}

// ─── Rhythmic Regularity ──────────────────────────────────────────────

/**
 * Compute rhythmic regularity: ratio of on-grid onsets to total onsets.
 *
 * Quantizes note onsets to 16th-note grid positions (480 ticks per quarter → 120 ticks per 16th).
 * An onset is "on-grid" if it falls within 10 ticks of a grid position.
 *
 * Returns a value in [0, 1]. Returns 0 for empty arrays.
 */
export function computeRhythmicRegularity(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): number {
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  if (sectionNotes.length === 0) return 0;

  const TICKS_PER_QUARTER = 480;
  const TICKS_PER_16TH = TICKS_PER_QUARTER / 4; // 120
  const TOLERANCE = 10; // ticks

  let onGridCount = 0;

  for (const note of sectionNotes) {
    // Convert onset position (in beats) to ticks
    const onsetTicks = note.startTime * TICKS_PER_QUARTER;
    // Distance to nearest 16th-note grid position
    const remainder = onsetTicks % TICKS_PER_16TH;
    const distanceToGrid = Math.min(remainder, TICKS_PER_16TH - remainder);

    if (distanceToGrid <= TOLERANCE) {
      onGridCount++;
    }
  }

  return onGridCount / sectionNotes.length;
}


// ─── Polyphony Profile ────────────────────────────────────────────────

/**
 * Compute polyphony profile by sampling overlapping note counts at each
 * 16th-note subdivision within the section.
 *
 * A note overlaps a sample point if note.startTime <= samplePoint < note.startTime + note.duration.
 * Returns mean and max of those counts.
 */
export function computePolyphonyProfile(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): PolyphonyProfile {
  const duration = sectionEnd - sectionStart;
  if (duration <= 0) {
    return { mean: 0, max: 0 };
  }

  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  if (sectionNotes.length === 0) {
    return { mean: 0, max: 0 };
  }

  // Sample at 16th-note subdivisions (0.25 beats apart)
  const step = 0.25; // beats per 16th note
  const sampleCount = Math.floor(duration / step);

  if (sampleCount === 0) {
    return { mean: 0, max: 0 };
  }

  let totalCount = 0;
  let maxCount = 0;

  for (let i = 0; i < sampleCount; i++) {
    const samplePoint = sectionStart + i * step;
    let count = 0;

    for (const note of sectionNotes) {
      if (note.startTime <= samplePoint && samplePoint < note.startTime + note.duration) {
        count++;
      }
    }

    totalCount += count;
    if (count > maxCount) maxCount = count;
  }

  return {
    mean: totalCount / sampleCount,
    max: maxCount,
  };
}

// ─── Melodic Contour ──────────────────────────────────────────────────

/**
 * Compute melodic contour by dividing the section into 4 equal-length segments
 * and computing the mean pitch per segment.
 *
 * Shape classification:
 * - ascending: each segment mean higher by ≥1 than previous
 * - descending: each segment mean lower by ≥1 than previous
 * - arched: rise then fall with peak in segment 2 or 3
 * - inverse-arched: fall then rise with trough in segment 2 or 3
 * - static: no consecutive pair differs by >1
 * - complex: none of the above
 *
 * Empty segments use the nearest non-empty segment's mean (or 0 if all empty).
 */
export function computeMelodicContour(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): MelodicContour {
  const duration = sectionEnd - sectionStart;

  if (duration <= 0) {
    return {
      shape: "static",
      segmentMeans: [0, 0, 0, 0],
    };
  }

  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  const segmentLength = duration / 4;

  // Compute raw means per segment
  const rawMeans: (number | null)[] = [null, null, null, null];

  for (let i = 0; i < 4; i++) {
    const segStart = sectionStart + i * segmentLength;
    const segEnd = segStart + segmentLength;

    const segNotes = sectionNotes.filter(
      (n) => n.startTime >= segStart && n.startTime < segEnd,
    );

    if (segNotes.length > 0) {
      let pitchSum = 0;
      for (const note of segNotes) {
        pitchSum += note.pitch;
      }
      rawMeans[i] = pitchSum / segNotes.length;
    }
  }

  // Fill empty segments with nearest non-empty segment's mean
  const segmentMeans = fillEmptySegments(rawMeans);

  // Classify shape
  const shape = classifyMelodicShape(segmentMeans);

  return {
    shape,
    segmentMeans: segmentMeans as [number, number, number, number],
  };
}

/**
 * Fill empty (null) segment means with the nearest non-empty segment's value.
 * Returns 0 for all segments if all are empty.
 */
function fillEmptySegments(rawMeans: (number | null)[]): [number, number, number, number] {
  // Check if all empty
  const nonEmptyIndices: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (rawMeans[i] !== null) nonEmptyIndices.push(i);
  }

  if (nonEmptyIndices.length === 0) {
    return [0, 0, 0, 0];
  }

  const result: [number, number, number, number] = [0, 0, 0, 0];

  for (let i = 0; i < 4; i++) {
    if (rawMeans[i] !== null) {
      result[i] = rawMeans[i]!;
    } else {
      // Find nearest non-empty segment
      let minDist = Infinity;
      let nearestValue = 0;
      for (const idx of nonEmptyIndices) {
        const dist = Math.abs(i - idx);
        if (dist < minDist) {
          minDist = dist;
          nearestValue = rawMeans[idx]!;
        }
      }
      result[i] = nearestValue;
    }
  }

  return result;
}

/**
 * Classify melodic contour shape from 4 segment means.
 */
function classifyMelodicShape(means: [number, number, number, number]): MelodicContourShape {
  const [a, b, c, d] = means;

  // ascending: each segment mean higher by ≥1 than previous
  if (b - a >= 1 && c - b >= 1 && d - c >= 1) {
    return "ascending";
  }

  // descending: each segment mean lower by ≥1 than previous
  if (a - b >= 1 && b - c >= 1 && c - d >= 1) {
    return "descending";
  }

  // static: no consecutive pair differs by >1
  if (Math.abs(b - a) <= 1 && Math.abs(c - b) <= 1 && Math.abs(d - c) <= 1) {
    return "static";
  }

  // arched: rise then fall with peak in segment 2 or 3
  const peakIdx = means.indexOf(Math.max(...means));
  if (peakIdx === 1 || peakIdx === 2) {
    // Check that there's a rise to the peak and a fall from the peak
    let risingToPeak = true;
    for (let i = 1; i <= peakIdx; i++) {
      if (means[i]! - means[i - 1]! < 0) {
        risingToPeak = false;
        break;
      }
    }
    let fallingFromPeak = true;
    for (let i = peakIdx + 1; i < 4; i++) {
      if (means[i - 1]! - means[i]! < 0) {
        fallingFromPeak = false;
        break;
      }
    }
    if (risingToPeak && fallingFromPeak && means[peakIdx]! - means[0] >= 1 && means[peakIdx]! - means[3] >= 1) {
      return "arched";
    }
  }

  // inverse-arched: fall then rise with trough in segment 2 or 3
  const troughIdx = means.indexOf(Math.min(...means));
  if (troughIdx === 1 || troughIdx === 2) {
    // Check that there's a fall to the trough and a rise from the trough
    let fallingToTrough = true;
    for (let i = 1; i <= troughIdx; i++) {
      if (means[i - 1]! - means[i]! < 0) {
        fallingToTrough = false;
        break;
      }
    }
    let risingFromTrough = true;
    for (let i = troughIdx + 1; i < 4; i++) {
      if (means[i]! - means[i - 1]! < 0) {
        risingFromTrough = false;
        break;
      }
    }
    if (fallingToTrough && risingFromTrough && means[0] - means[troughIdx]! >= 1 && means[3] - means[troughIdx]! >= 1) {
      return "inverse-arched";
    }
  }

  return "complex";
}


// ─── Harmonic Interval Profile ────────────────────────────────────────

/**
 * Compute harmonic interval profile based on polyphony.
 *
 * If polyphonyAvg > 1.5: compute simultaneous intervals between concurrent note pairs.
 * If polyphonyAvg <= 1.5: compute successive intervals between consecutive onsets.
 *
 * Intervals are reduced to interval classes 0–12 via octave equivalence
 * (interval % 12, but keep 12 for octaves).
 *
 * Returns null when fewer than 2 notes.
 */
export function computeHarmonicIntervalProfile(
  notes: readonly NoteData[],
  polyphonyAvg: number,
): HarmonicIntervalProfile | null {
  if (notes.length < 2) return null;

  const intervalCounts = new Array(13).fill(0); // indices 0–12
  let totalIntervals = 0;

  if (polyphonyAvg > 1.5) {
    // Simultaneous intervals: find all concurrent note pairs
    totalIntervals = computeSimultaneousIntervals(notes, intervalCounts);
  } else {
    // Successive intervals: intervals between consecutive onsets
    totalIntervals = computeSuccessiveIntervals(notes, intervalCounts);
  }

  // Guard: no intervals found
  if (totalIntervals === 0) return null;

  // Compute percentage distribution
  const intervalDistribution: number[] = new Array(13).fill(0);
  for (let i = 0; i <= 12; i++) {
    intervalDistribution[i] = (intervalCounts[i] / totalIntervals) * 100;
  }

  // Classify texture
  const consonantClasses = new Set([0, 3, 4, 5, 7, 8, 9, 12]);
  const dissonantClasses = new Set([1, 2, 6, 10, 11]);

  let consonantPct = 0;
  let dissonantPct = 0;
  for (let i = 0; i <= 12; i++) {
    if (consonantClasses.has(i)) consonantPct += intervalDistribution[i]!;
    if (dissonantClasses.has(i)) dissonantPct += intervalDistribution[i]!;
  }

  let texture: "consonant" | "dissonant" | "mixed";
  if (consonantPct > 50) {
    texture = "consonant";
  } else if (dissonantPct > 50) {
    texture = "dissonant";
  } else {
    texture = "mixed";
  }

  return {
    intervalDistribution,
    texture,
    analysisType: polyphonyAvg > 1.5 ? "simultaneous" : "successive",
  };
}

/**
 * Compute simultaneous intervals between all concurrent note pairs.
 * Two notes are concurrent if they overlap in time.
 * Returns the total number of intervals counted.
 */
function computeSimultaneousIntervals(
  notes: readonly NoteData[],
  intervalCounts: number[],
): number {
  let total = 0;

  for (let i = 0; i < notes.length; i++) {
    const noteA = notes[i]!;
    const aEnd = noteA.startTime + noteA.duration;

    for (let j = i + 1; j < notes.length; j++) {
      const noteB = notes[j]!;
      const bEnd = noteB.startTime + noteB.duration;

      // Check overlap: A starts before B ends AND B starts before A ends
      if (noteA.startTime < bEnd && noteB.startTime < aEnd) {
        const rawInterval = Math.abs(noteA.pitch - noteB.pitch);
        const intervalClass = reduceToIntervalClass(rawInterval);
        intervalCounts[intervalClass]!++;
        total++;
      }
    }
  }

  return total;
}

/**
 * Compute successive intervals between consecutive onsets sorted by startTime.
 * Returns the total number of intervals counted.
 */
function computeSuccessiveIntervals(
  notes: readonly NoteData[],
  intervalCounts: number[],
): number {
  // Sort by startTime
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const rawInterval = Math.abs(sorted[i]!.pitch - sorted[i - 1]!.pitch);
    const intervalClass = reduceToIntervalClass(rawInterval);
    intervalCounts[intervalClass]!++;
    total++;
  }

  return total;
}

/**
 * Reduce a raw interval (in semitones) to an interval class 0–12.
 * Uses octave equivalence (interval % 12), but keeps 12 for exact octaves.
 */
function reduceToIntervalClass(rawInterval: number): number {
  if (rawInterval === 0) return 0;
  const mod = rawInterval % 12;
  // If the interval is a multiple of 12 (exact octave), return 12
  if (mod === 0) return 12;
  return mod;
}


// ─── Cross-Section Similarity ─────────────────────────────────────────

/**
 * Compute Jaccard index of two sets: |intersection| / |union|.
 * Returns 0 if both sets are empty.
 */
function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const val of a) {
    if (b.has(val)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/**
 * Compute cross-section similarity between two synth track profiles.
 *
 * Weighted sum:
 *   0.35 × pitchClassJaccard
 * + 0.25 × densityRatio
 * + 0.20 × velocitySimilarity
 * + 0.20 × articulationMatch
 *
 * Sub-metrics:
 * - pitchClassJaccard: Jaccard index of pitch class sets (0 if both empty)
 * - densityRatio: min(densityA, densityB) / max(densityA, densityB), or 1 if both 0
 * - velocitySimilarity: 1 - |meanVelocityA - meanVelocityB| / 127
 * - articulationMatch: 1.0 if same type, 0.5 if one is "mixed", 0.0 if staccato vs legato
 *
 * Result clamped to [0, 1].
 */
export function computeCrossSectionSimilarity(
  profileA: SynthTrackProfile,
  profileB: SynthTrackProfile,
): number {
  // Pitch class Jaccard
  const pitchClassJaccard = jaccard(
    profileA.pitchContent.pitchClasses,
    profileB.pitchContent.pitchClasses,
  );

  // Density ratio
  const densityA = profileA.noteDensity;
  const densityB = profileB.noteDensity;
  let densityRatio: number;
  if (densityA === 0 && densityB === 0) {
    densityRatio = 1;
  } else {
    densityRatio = Math.min(densityA, densityB) / Math.max(densityA, densityB);
  }

  // Velocity similarity
  const velocitySimilarity =
    1 - Math.abs(profileA.velocityDynamics.mean - profileB.velocityDynamics.mean) / 127;

  // Articulation match
  const typeA = profileA.articulationPattern.type;
  const typeB = profileB.articulationPattern.type;
  let articulationMatch: number;
  if (typeA === typeB) {
    articulationMatch = 1.0;
  } else if (typeA === "mixed" || typeB === "mixed") {
    articulationMatch = 0.5;
  } else {
    // staccato vs legato
    articulationMatch = 0.0;
  }

  // Weighted sum
  const result =
    0.35 * pitchClassJaccard +
    0.25 * densityRatio +
    0.20 * velocitySimilarity +
    0.20 * articulationMatch;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, result));
}


// ─── Repetition Detection ─────────────────────────────────────────────

/**
 * Detect extended repetition in a sequence of consecutive cross-section
 * similarity scores.
 *
 * A run of 3 or more consecutive scores above 0.85 triggers
 * hasExtendedRepetition = true. The extendedRepetitionSections array
 * contains the section indices involved (from sectionIndexA of the first
 * comparison through sectionIndexB of the last comparison in the run).
 */
export function detectRepetition(similarities: readonly SynthCrossSectionComparison[]): {
  hasExtendedRepetition: boolean;
  extendedRepetitionSections: readonly number[];
} {
  if (similarities.length < 3) {
    return { hasExtendedRepetition: false, extendedRepetitionSections: [] };
  }

  const THRESHOLD = 0.85;
  let hasExtendedRepetition = false;
  const repetitionSections = new Set<number>();

  let runLength = 0;
  let runStart = 0;

  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i]!.similarity > THRESHOLD) {
      if (runLength === 0) {
        runStart = i;
      }
      runLength++;
    } else {
      // End of a run — check if it was long enough
      if (runLength >= 3) {
        hasExtendedRepetition = true;
        for (let j = runStart; j < runStart + runLength; j++) {
          repetitionSections.add(similarities[j]!.sectionIndexA);
          repetitionSections.add(similarities[j]!.sectionIndexB);
        }
      }
      runLength = 0;
    }
  }

  // Check final run
  if (runLength >= 3) {
    hasExtendedRepetition = true;
    for (let j = runStart; j < runStart + runLength; j++) {
      repetitionSections.add(similarities[j]!.sectionIndexA);
      repetitionSections.add(similarities[j]!.sectionIndexB);
    }
  }

  return {
    hasExtendedRepetition,
    extendedRepetitionSections: [...repetitionSections].sort((a, b) => a - b),
  };
}


// ─── Discontinuity Detection ──────────────────────────────────────────

/**
 * Determine whether a profile should be treated as null.
 * A profile is "null-equivalent" if it has noteDensity === 0 or pitchClasses.size === 0.
 */
function isNullEquivalent(profile: SynthTrackProfile | null): boolean {
  if (profile === null) return true;
  if (profile.noteDensity === 0) return true;
  if (profile.pitchContent.pitchClasses.size === 0) return true;
  return false;
}

/**
 * Detect discontinuities in a synth track across consecutive sections.
 *
 * Discontinuity types:
 * - "entry": null/null-equivalent → non-null (track enters)
 * - "exit": non-null → null/null-equivalent (track exits)
 * - "harmonic-shift": both non-null but Jaccard of pitch class sets < 0.30
 *
 * Null-equivalent: non-null profile with noteDensity === 0 or pitchClasses.size === 0.
 */
export function detectDiscontinuities(
  profiles: readonly (SynthTrackProfile | null)[],
  trackName: string,
): readonly SynthDiscontinuity[] {
  const discontinuities: SynthDiscontinuity[] = [];

  for (let i = 0; i < profiles.length - 1; i++) {
    const profileA = profiles[i]!;
    const profileB = profiles[i + 1]!;
    const aNullEquiv = isNullEquivalent(profileA);
    const bNullEquiv = isNullEquivalent(profileB);

    if (aNullEquiv && !bNullEquiv) {
      // Entry: null → non-null
      discontinuities.push({
        trackName,
        sectionIndexA: i,
        sectionIndexB: i + 1,
        type: "entry",
      });
    } else if (!aNullEquiv && bNullEquiv) {
      // Exit: non-null → null
      discontinuities.push({
        trackName,
        sectionIndexA: i,
        sectionIndexB: i + 1,
        type: "exit",
      });
    } else if (!aNullEquiv && !bNullEquiv) {
      // Both non-null — check for harmonic shift
      const pitchJaccard = jaccard(
        profileA!.pitchContent.pitchClasses,
        profileB!.pitchContent.pitchClasses,
      );
      if (pitchJaccard < 0.30) {
        discontinuities.push({
          trackName,
          sectionIndexA: i,
          sectionIndexB: i + 1,
          type: "harmonic-shift",
        });
      }
    }
    // Both null-equivalent → no discontinuity
  }

  return discontinuities;
}


// ─── Main Entry Point ─────────────────────────────────────────────────

/** Synth roles that the analyzer processes. */
const SYNTH_ROLES: readonly InstrumentRole[] = ["lead", "pad", "chord", "arpeggio", "bass"];

/** Maximum number of synth tracks to process. */
const MAX_SYNTH_TRACKS = 16;

/** Maximum number of sections to process. */
const MAX_SECTIONS = 32;

/** Performance budget in milliseconds. */
const PERFORMANCE_BUDGET_MS = 200;

/** Default grid spacing for articulation analysis (16th note = 0.25 beats). */
const DEFAULT_GRID_SPACING = 0.25;

/**
 * Main entry point: analyze all synth tracks across all sections.
 *
 * Pipeline:
 * 1. Filter synth tracks by role
 * 2. Cap at 16 tracks and 32 sections
 * 3. Compute per-section profiles (null when no notes in section)
 * 4. Cross-section comparison with 200ms budget
 * 5. Repetition flagging
 * 6. Discontinuity detection
 * 7. Assemble and return SynthAnalysisResult
 */
export function analyzeSynthTracks(
  sections: readonly Section[],
  trackNoteData: readonly TrackNoteData[],
  trackNames: readonly string[],
  trackRoles: ReadonlyMap<string, InstrumentRole>,
): SynthAnalysisResult {
  const startTime = performance.now();

  // Step 1: Filter synth tracks
  const synthTrackNames: string[] = [];
  for (const name of trackNames) {
    const role = trackRoles.get(name);
    if (role && SYNTH_ROLES.includes(role)) {
      synthTrackNames.push(name);
    }
    if (synthTrackNames.length >= MAX_SYNTH_TRACKS) break;
  }

  // Cap sections
  const cappedSections = sections.slice(0, MAX_SECTIONS);

  // Build a lookup map for track note data
  const noteDataByTrack = new Map<string, readonly NoteData[]>();
  for (const tnd of trackNoteData) {
    if (synthTrackNames.includes(tnd.trackName)) {
      noteDataByTrack.set(tnd.trackName, tnd.notes);
    }
  }

  // Step 2: Compute per-section profiles
  const perSection = new Map<string, Map<string, SynthTrackProfile>>();

  for (const section of cappedSections) {
    const trackProfiles = new Map<string, SynthTrackProfile>();

    for (const trackName of synthTrackNames) {
      const notes = noteDataByTrack.get(trackName) ?? [];

      // Filter notes within this section's time range
      const sectionNotes = notes.filter(
        (n) => n.startTime >= section.startTime && n.startTime < section.endTime,
      );

      if (sectionNotes.length === 0) {
        // Null profile — track has no notes in this section
        // We don't add an entry (null means absent from the map)
        continue;
      }

      // Compute all sub-metrics
      const pitchContent = computePitchContent(notes, section.startTime, section.endTime);
      const noteDensity = computeNoteDensity(notes, section.startTime, section.endTime);
      const velocityDynamics = computeVelocityDynamics(notes, section.startTime, section.endTime);
      const articulationPattern = computeArticulationPattern(sectionNotes, DEFAULT_GRID_SPACING);
      const rhythmicRegularity = computeRhythmicRegularity(notes, section.startTime, section.endTime);
      const polyphonyProfile = computePolyphonyProfile(notes, section.startTime, section.endTime);
      const melodicContour = computeMelodicContour(notes, section.startTime, section.endTime);
      const harmonicIntervalProfile = computeHarmonicIntervalProfile(
        sectionNotes,
        polyphonyProfile.mean,
      );

      trackProfiles.set(trackName, {
        pitchContent,
        noteDensity,
        velocityDynamics,
        articulationPattern,
        rhythmicRegularity,
        polyphonyProfile,
        melodicContour,
        harmonicIntervalProfile,
      });
    }

    perSection.set(section.id, trackProfiles);
  }

  // Step 3: Cross-section comparison (with performance budget)
  const crossSection = new Map<string, SynthCrossSectionComparison[]>();
  const repetitionFlags = new Map<string, {
    hasExtendedRepetition: boolean;
    extendedRepetitionSections: readonly number[];
  }>();
  const allDiscontinuities: SynthDiscontinuity[] = [];

  const elapsed = performance.now() - startTime;
  const budgetExceeded = elapsed >= PERFORMANCE_BUDGET_MS;

  if (!budgetExceeded) {
    for (const trackName of synthTrackNames) {
      // Check budget before processing each track
      if (performance.now() - startTime >= PERFORMANCE_BUDGET_MS) {
        break;
      }

      // Collect profiles in section order for this track
      const trackProfiles: (SynthTrackProfile | null)[] = [];
      for (const section of cappedSections) {
        const sectionMap = perSection.get(section.id);
        const profile = sectionMap?.get(trackName) ?? null;
        trackProfiles.push(profile);
      }

      // Compute cross-section similarities between consecutive non-null profiles
      const comparisons: SynthCrossSectionComparison[] = [];
      for (let i = 0; i < trackProfiles.length - 1; i++) {
        const profA = trackProfiles[i] ?? null;
        const profB = trackProfiles[i + 1] ?? null;

        // Skip comparison if either is null-equivalent
        if (isNullEquivalent(profA) || isNullEquivalent(profB)) {
          continue;
        }

        const similarity = computeCrossSectionSimilarity(profA!, profB!);
        comparisons.push({
          sectionIndexA: i,
          sectionIndexB: i + 1,
          similarity,
        });
      }

      crossSection.set(trackName, comparisons);

      // Repetition flagging
      const repResult = detectRepetition(comparisons);
      repetitionFlags.set(trackName, repResult);

      // Discontinuity detection
      const discontinuities = detectDiscontinuities(trackProfiles, trackName);
      allDiscontinuities.push(...discontinuities);
    }
  } else {
    // Budget exceeded: return empty cross-section data but ensure maps exist
    for (const trackName of synthTrackNames) {
      crossSection.set(trackName, []);
      repetitionFlags.set(trackName, {
        hasExtendedRepetition: false,
        extendedRepetitionSections: [],
      });
    }
  }

  return {
    perSection: perSection as ReadonlyMap<string, ReadonlyMap<string, SynthTrackProfile>>,
    crossSection,
    repetitionFlags,
    discontinuities: allDiscontinuities,
  };
}

// ─── Synth Energy Contribution ────────────────────────────────────────

/**
 * Compute per-section synth energy contribution as the mean of three
 * normalized sub-factors: note density, polyphony, and velocity.
 *
 * Formula per section:
 *   synthEnergy = mean(
 *     sumNoteDensity / maxSumNoteDensity,
 *     maxPolyphonyAvg / maxMaxPolyphonyAvg,
 *     meanVelocityMean / 127
 *   )
 *
 * Where:
 * - sumNoteDensity = sum of all synth tracks' noteDensity in that section
 * - maxSumNoteDensity = max of sumNoteDensity across ALL sections
 * - maxPolyphonyAvg = max polyphonyProfile.mean across all synth tracks in that section
 * - maxMaxPolyphonyAvg = max of maxPolyphonyAvg across ALL sections
 * - meanVelocityMean = mean of velocityDynamics.mean across all synth tracks in that section
 *
 * Guards against division by zero. Returns 0 for sections with no profiles.
 */
export function computeSynthEnergyContribution(
  sections: readonly Section[],
  perSection: ReadonlyMap<string, ReadonlyMap<string, SynthTrackProfile>>,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();

  // First pass: compute per-section raw values to find global maxima
  const sectionMetrics: {
    sectionId: string;
    sumNoteDensity: number;
    maxPolyphonyAvg: number;
    meanVelocityMean: number;
    trackCount: number;
  }[] = [];

  for (const section of sections) {
    const profiles = perSection.get(section.id);

    if (!profiles || profiles.size === 0) {
      sectionMetrics.push({
        sectionId: section.id,
        sumNoteDensity: 0,
        maxPolyphonyAvg: 0,
        meanVelocityMean: 0,
        trackCount: 0,
      });
      continue;
    }

    let sumNoteDensity = 0;
    let maxPolyphonyAvg = 0;
    let velocityMeanSum = 0;
    let trackCount = 0;

    for (const [, profile] of profiles) {
      trackCount++;
      sumNoteDensity += profile.noteDensity;

      if (profile.polyphonyProfile.mean > maxPolyphonyAvg) {
        maxPolyphonyAvg = profile.polyphonyProfile.mean;
      }

      velocityMeanSum += profile.velocityDynamics.mean;
    }

    const meanVelocityMean = trackCount > 0 ? velocityMeanSum / trackCount : 0;

    sectionMetrics.push({
      sectionId: section.id,
      sumNoteDensity,
      maxPolyphonyAvg,
      meanVelocityMean,
      trackCount,
    });
  }

  // Find global maxima for normalization
  let maxSumNoteDensity = 0;
  let maxMaxPolyphonyAvg = 0;

  for (const m of sectionMetrics) {
    if (m.sumNoteDensity > maxSumNoteDensity) {
      maxSumNoteDensity = m.sumNoteDensity;
    }
    if (m.maxPolyphonyAvg > maxMaxPolyphonyAvg) {
      maxMaxPolyphonyAvg = m.maxPolyphonyAvg;
    }
  }

  // Second pass: compute normalized energy for each section
  for (const m of sectionMetrics) {
    if (m.trackCount === 0) {
      result.set(m.sectionId, 0);
      continue;
    }

    const normalizedDensity =
      maxSumNoteDensity === 0 ? 0 : m.sumNoteDensity / maxSumNoteDensity;
    const normalizedPolyphony =
      maxMaxPolyphonyAvg === 0 ? 0 : m.maxPolyphonyAvg / maxMaxPolyphonyAvg;
    const normalizedVelocity = m.meanVelocityMean / 127;

    const energy = (normalizedDensity + normalizedPolyphony + normalizedVelocity) / 3;

    result.set(m.sectionId, energy);
  }

  return result;
}
