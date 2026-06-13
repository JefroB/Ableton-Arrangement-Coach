/**
 * Synth Analysis Data Models — type definitions for the MIDI synth
 * analysis module (pitch content, velocity dynamics, articulation,
 * melodic contour, polyphony, harmonic intervals, cross-section
 * comparison, and discontinuity detection).
 */

// ─── Pitch Content ────────────────────────────────────────────────────

/** Pitch class usage and range for a synth track within a section. */
export interface PitchContent {
  /** Set of pitch classes used (0–11, mod 12). */
  readonly pitchClasses: ReadonlySet<number>;

  /** Pitch range in semitones (max note - min note). */
  readonly pitchRange: number;
}

// ─── Velocity Dynamics ────────────────────────────────────────────────

/** Directional classification of velocity change over time. */
export type VelocityContourDirection = "rising" | "falling" | "flat" | "varied";

/** Statistical summary and directional contour of note velocities. */
export interface VelocityDynamics {
  /** Minimum velocity value (1–127). */
  readonly min: number;

  /** Maximum velocity value (1–127). */
  readonly max: number;

  /** Arithmetic mean velocity (1–127). */
  readonly mean: number;

  /** Standard deviation of velocity values (≥ 0). */
  readonly stdDev: number;

  /** Directional contour classification based on linear regression slope. */
  readonly contour: VelocityContourDirection;
}

// ─── Articulation Pattern ─────────────────────────────────────────────

/** Classification of note duration behavior relative to grid spacing. */
export type ArticulationType = "staccato" | "legato" | "mixed";

/** Articulation classification and average duration ratio for a section. */
export interface ArticulationPattern {
  /** Classified articulation type. */
  readonly type: ArticulationType;

  /** Average note duration divided by grid spacing. */
  readonly averageDurationRatio: number;
}

// ─── Melodic Contour ──────────────────────────────────────────────────

/** Shape classification for pitch movement across 4 section segments. */
export type MelodicContourShape =
  | "ascending"
  | "descending"
  | "arched"
  | "inverse-arched"
  | "static"
  | "complex";

/** Melodic contour analysis: shape classification and per-segment mean pitches. */
export interface MelodicContour {
  /** Overall shape classification. */
  readonly shape: MelodicContourShape;

  /** Mean pitch values for each of 4 equal-length segments. */
  readonly segmentMeans: readonly [number, number, number, number];
}

// ─── Polyphony Profile ────────────────────────────────────────────────

/** Summary of simultaneous note counts within a section. */
export interface PolyphonyProfile {
  /** Average number of simultaneous notes (sampled at 16th-note subdivisions). */
  readonly mean: number;

  /** Peak number of simultaneous notes. */
  readonly max: number;
}

// ─── Harmonic Interval Profile ────────────────────────────────────────

/** Classification of overall harmonic texture from interval distribution. */
export type HarmonicTextureClass = "consonant" | "dissonant" | "mixed";

/** Interval distribution and texture classification for a synth track. */
export interface HarmonicIntervalProfile {
  /** Percentage distribution per interval class (index 0–12). */
  readonly intervalDistribution: readonly number[];

  /** Overall harmonic texture classification. */
  readonly texture: HarmonicTextureClass;

  /** Which analysis method was used based on polyphony. */
  readonly analysisType: "simultaneous" | "successive";
}

// ─── Synth Track Profile ──────────────────────────────────────────────

/** Complete per-section analysis result for a single synth track. */
export interface SynthTrackProfile {
  /** Pitch class usage and range. */
  readonly pitchContent: PitchContent;

  /** Notes per beat within the section. */
  readonly noteDensity: number;

  /** Velocity statistical summary and contour. */
  readonly velocityDynamics: VelocityDynamics;

  /** Articulation classification and duration ratio. */
  readonly articulationPattern: ArticulationPattern;

  /** Ratio of on-grid onsets to total onsets (0–1). */
  readonly rhythmicRegularity: number;

  /** Simultaneous note count summary. */
  readonly polyphonyProfile: PolyphonyProfile;

  /** Pitch movement shape and segment means. */
  readonly melodicContour: MelodicContour;

  /** Interval distribution and texture (null when fewer than 2 notes). */
  readonly harmonicIntervalProfile: HarmonicIntervalProfile | null;
}

// ─── Cross-Section Comparison ─────────────────────────────────────────

/** Similarity comparison between two consecutive sections for a synth track. */
export interface SynthCrossSectionComparison {
  /** Index of the first section. */
  readonly sectionIndexA: number;

  /** Index of the second section. */
  readonly sectionIndexB: number;

  /** Similarity score in [0, 1]. */
  readonly similarity: number;
}

// ─── Synth Discontinuity ──────────────────────────────────────────────

/** Type of discontinuity detected between consecutive sections. */
export type SynthDiscontinuityType = "entry" | "exit" | "harmonic-shift";

/** A detected change in synth track behavior between consecutive sections. */
export interface SynthDiscontinuity {
  /** Name of the track where the discontinuity was detected. */
  readonly trackName: string;

  /** Index of the first section in the transition. */
  readonly sectionIndexA: number;

  /** Index of the second section in the transition. */
  readonly sectionIndexB: number;

  /** Classification of the discontinuity. */
  readonly type: SynthDiscontinuityType;
}

// ─── Synth Analysis Result ────────────────────────────────────────────

/** Complete synth analysis output for the entire arrangement. */
export interface SynthAnalysisResult {
  /** Per-section, per-track profiles. Key: sectionId → trackName → profile. */
  readonly perSection: ReadonlyMap<string, ReadonlyMap<string, SynthTrackProfile>>;

  /** Cross-section similarity comparisons per track. Key: trackName. */
  readonly crossSection: ReadonlyMap<string, readonly SynthCrossSectionComparison[]>;

  /** Repetition detection flags per track. Key: trackName. */
  readonly repetitionFlags: ReadonlyMap<string, {
    readonly hasExtendedRepetition: boolean;
    readonly extendedRepetitionSections: readonly number[];
  }>;

  /** All detected discontinuities across section boundaries. */
  readonly discontinuities: readonly SynthDiscontinuity[];
}
