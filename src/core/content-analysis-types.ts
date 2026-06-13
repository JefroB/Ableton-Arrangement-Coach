/**
 * Content Analysis Data Models — type definitions for the MIDI content
 * analysis module (pattern fingerprinting, fill/build detection,
 * instrument role classification, drum pad mapping, and cross-section
 * comparison).
 */

import type { SynthTrackProfile } from "./synth-analysis-types.js";

// ─── Pattern Fingerprinting ───────────────────────────────────────────

/** Compact representation of a rhythmic/melodic pattern within a section. */
export interface PatternFingerprint {
  /** Set of pitch classes used (0-11, mod 12). */
  readonly pitchClasses: ReadonlySet<number>;

  /** Bitmap of rhythmic positions within a bar, quantized to 16th notes (0-15). */
  readonly rhythmicPositions: readonly number[];

  /** Normalized velocity contour: average velocity per bar divided by 127. */
  readonly velocityContour: readonly number[];

  /** Note density: notes per beat. */
  readonly density: number;

  /** Number of bars analyzed (for normalization). */
  readonly barCount: number;
}

// ─── Instrument Role ──────────────────────────────────────────────────

/** Classification of a MIDI track's musical function. */
export type InstrumentRole =
  | "drums"
  | "bass"
  | "lead"
  | "pad"
  | "arpeggio"
  | "chord"
  | "unclassified";

// ─── Fill Detection ───────────────────────────────────────────────────

/** Semantic classification of a detected fill based on sample name analysis. */
export type FillType =
  | "tom-fill"
  | "snare-roll"
  | "hat-roll"
  | "cymbal-fill"
  | "percussion-fill"
  | "clap-roll"
  | "808-roll"
  | "generic-fill";

/** A detected fill within a section. */
export interface FillDetection {
  /** Bar offset from section start. */
  readonly position: number;

  /** Duration of the fill in bars (1 or 2). */
  readonly durationBars: number;

  /** Phrase boundary interval at which this fill recurs (4, 8, or 16 bars). */
  readonly phraseInterval: number;

  /** What triggered detection: density increase or new pitches. */
  readonly triggerType: "density" | "new-pitches" | "both";

  /** Drum elements involved in the fill (when DrumPadMap available). */
  readonly drumElements: readonly DrumElementCategory[] | null;
}

// ─── Drum Pad Map ─────────────────────────────────────────────────────

/** Semantic classification of a drum pad's function. */
export type DrumElementCategory =
  | "kick"
  | "snare"
  | "hi-hat"
  | "tom"
  | "cymbal"
  | "percussion"
  | "other";

/** Mapping entry from MIDI pitch to sample metadata for a Drum Rack track. */
export interface DrumPadEntry {
  /** MIDI pitch (receivingNote from DrumChain). */
  readonly pitch: number;

  /** Sample file name without path or extension. */
  readonly sampleName: string;

  /** Classified element category. */
  readonly category: DrumElementCategory;
}

/** Complete pad map for one Drum Rack device. Key: MIDI pitch (0-127). */
export type DrumPadMap = ReadonlyMap<number, DrumPadEntry>;

// ─── Drum Element Profile ─────────────────────────────────────────────

/** Per-section summary of which drum elements are active and how they're used. */
export interface DrumElementProfile {
  /** Which element categories are present in this section. */
  readonly activeElements: ReadonlySet<DrumElementCategory>;

  /** Per-element note counts (how prominent each element is). */
  readonly elementCounts: ReadonlyMap<DrumElementCategory, number>;

  /** Elements that appear only in fills (not the main loop). */
  readonly fillOnlyElements: readonly DrumElementCategory[];

  /** Elements that appear only in the main loop (not fills). */
  readonly loopElements: readonly DrumElementCategory[];
}

// ─── Build Detection ──────────────────────────────────────────────────

/** A detected build/intensification approaching a boundary. */
export interface BuildDetection {
  /** Track name where the build was detected. */
  readonly trackName: string;

  /** Start position of the build (beats, arrangement-absolute). */
  readonly startPosition: number;

  /** Duration of the build in bars. */
  readonly durationBars: number;

  /** Type of intensification detected. */
  readonly type: "density" | "velocity" | "pitch-range" | "combined";

  /** The boundary this build leads into (beats, arrangement-absolute). */
  readonly targetBoundary: number;
}

// ─── Percussion Pattern Result ────────────────────────────────────────

/** Classification of a percussion pattern within a section. */
export interface PercussionPatternResult {
  /** Whether the pattern repeats identically ("loop") or varies ("variation"). */
  readonly classification: "loop" | "variation";

  /** Detected phrase length in bars. */
  readonly phraseLength: number;

  /** Detected fills at phrase boundaries. */
  readonly fills: readonly FillDetection[];
}

// ─── Cross-Section Comparison ─────────────────────────────────────────

/** Comparison result between two consecutive sections on one track. */
export interface CrossSectionComparison {
  /** Index of the first section. */
  readonly sectionIndexA: number;

  /** Index of the second section. */
  readonly sectionIndexB: number;

  /** Similarity score in [0, 1]. */
  readonly similarity: number;

  /** Classification based on thresholds. */
  readonly classification: "shared" | "contrasting" | "similar";
}

// ─── Track Content Analysis ───────────────────────────────────────────

/** Per-track content analysis results for a single section. */
export interface TrackContentAnalysis {
  /** Detected instrument role. */
  readonly role: InstrumentRole;

  /** Pattern fingerprint for this track in this section. */
  readonly fingerprint: PatternFingerprint;

  /** Percussion pattern analysis (only for drums role). */
  readonly percussionPattern: PercussionPatternResult | null;

  /** Build detection result (null if no build detected). */
  readonly build: BuildDetection | null;

  /** Drum element profile (only when DrumPadMap available for drums role). */
  readonly drumElementProfile: DrumElementProfile | null;

  /** Synth track profile (null for non-synth tracks, undefined when not computed). */
  readonly synthProfile?: SynthTrackProfile | null;
}

// ─── Content Analysis Result ──────────────────────────────────────────

/** Complete content analysis results for the entire arrangement. */
export interface ContentAnalysisResult {
  /** Per-section, per-track analysis. Key: sectionId, Value: map of trackName → analysis. */
  readonly perSection: ReadonlyMap<string, ReadonlyMap<string, TrackContentAnalysis>>;

  /** Cross-section pattern comparisons per track. Key: trackName. */
  readonly crossSection: ReadonlyMap<string, readonly CrossSectionComparison[]>;

  /** Per-track repetition summary. Key: trackName. */
  readonly repetitionSummary: ReadonlyMap<string, TrackRepetitionSummary>;

  /** Detected phrase length per section. Key: sectionId. */
  readonly phraseLengths: ReadonlyMap<string, number>;

  /** Active percussion elements per section per drum track. Key: sectionId → trackName → snapshot. */
  readonly percussionSnapshots: ReadonlyMap<string, ReadonlyMap<string, ActivePercussionSnapshot>>;

  /** Detected percussion discontinuities across sections. */
  readonly percussionDiscontinuities: readonly PercussionDiscontinuity[];
}

// ─── Track Repetition Summary ─────────────────────────────────────────

/** Summary of repetition patterns for a single track across all sections. */
export interface TrackRepetitionSummary {
  /** Instrument role of this track. */
  readonly role: InstrumentRole;

  /** Groups of section indices that share patterns (similarity > 0.85). */
  readonly sharedGroups: readonly (readonly number[])[];

  /** Section indices with unique content (no similar neighbors). */
  readonly uniqueSections: readonly number[];

  /** Whether extended repetition was detected (3+ consecutive shared). */
  readonly hasExtendedRepetition: boolean;

  /** Section indices involved in extended repetition. */
  readonly extendedRepetitionSections: readonly number[];
}

// ─── Active Percussion Snapshot ───────────────────────────────────────

/** Per-section snapshot of which named percussion elements are active. */
export interface ActivePercussionSnapshot {
  /** Section ID. */
  readonly sectionId: string;

  /** Set of sample names active in this section (mapped from pitches via DrumPadMap). */
  readonly activeElements: ReadonlySet<string>;

  /** Per-element note counts for prominence ranking. */
  readonly elementCounts: ReadonlyMap<string, number>;
}

// ─── Percussion Discontinuity ─────────────────────────────────────────

/** A detected gap or discontinuity in percussion element presence across sections. */
export interface PercussionDiscontinuity {
  /** The percussion element (sample name) that has inconsistent presence. */
  readonly elementName: string;

  /** The drum element category of this element. */
  readonly category: DrumElementCategory;

  /** Section indices where the element IS present. */
  readonly presentInSections: readonly number[];

  /** Section indices where the element is ABSENT despite appearing elsewhere. */
  readonly absentFromSections: readonly number[];

  /** Whether the element disappeared permanently (never returns after last appearance). */
  readonly permanentDrop: boolean;

  /** Track name the element belongs to. */
  readonly trackName: string;
}
