/**
 * Audio Content Analysis Data Models — type definitions for the audio
 * content analysis module (spectral profiling, RMS energy, transient
 * density, instrument role classification, and cross-section comparison).
 */

// ─── Frequency Bands ──────────────────────────────────────────────────

/** The six defined frequency band names for spectral analysis. */
export type FrequencyBandName =
  | "subBass"
  | "bass"
  | "lowMid"
  | "mid"
  | "highMid"
  | "high";

/** A frequency band range definition with name and Hz boundaries. */
export interface FrequencyBandRange {
  readonly name: FrequencyBandName;
  readonly lowHz: number;
  readonly highHz: number;
}

// ─── Spectral Profile ─────────────────────────────────────────────────

/** Per-track-per-section spectral energy distribution and tonal character. */
export interface SpectralProfile {
  /** Energy per frequency band in dBFS, clamped to [-96, 0]. */
  readonly bands: Readonly<Record<FrequencyBandName, number>>;
  /** Mean spectral centroid across all windows (Hz). */
  readonly meanCentroid: number;
  /** Per-window spectral centroid values (Hz). */
  readonly centroidPerWindow: readonly number[];
  /** Mean spectral flux (normalized 0–1 scale). */
  readonly meanSpectralFlux: number;
}

// ─── Audio Instrument Role ────────────────────────────────────────────

/** Classification of an audio track's musical function. */
export type AudioInstrumentRole =
  | "drums"
  | "bass"
  | "vocal"
  | "synth_lead"
  | "synth_pad"
  | "full_mix"
  | "unclassified";

/** Result of audio role classification including confidence and override info. */
export interface AudioRoleResult {
  readonly role: AudioInstrumentRole;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** Whether the track name overrode the spectral classification. */
  readonly nameOverridden: boolean;
}

// ─── Transient Detection ──────────────────────────────────────────────

/** Rhythmic activity classification based on transient density. */
export type RhythmicClassification =
  | "silent"
  | "sustained/textural"
  | "rhythmically moderate"
  | "rhythmically dense";

/** Result of transient detection for a section window. */
export interface TransientDetectionResult {
  /** Detected transient positions in samples. */
  readonly transientPositions: readonly number[];
  /** Transients per bar. */
  readonly density: number;
  /** Rhythmic classification derived from density. */
  readonly classification: RhythmicClassification;
}

// ─── Per-Section Track Result ─────────────────────────────────────────

/** Complete audio analysis result for a single track in a single section. */
export interface AudioTrackSectionResult {
  /** RMS energy in dBFS (0 for full-scale, -Infinity for silence). */
  readonly rmsDbfs: number;
  /** Normalized energy in [0, 1] (from -60 dBFS → 0.0 to 0 dBFS → 1.0). */
  readonly normalizedEnergy: number;
  /** Spectral energy profile for this section window. */
  readonly spectralProfile: SpectralProfile;
  /** Transients per bar. */
  readonly transientDensity: number;
  /** Rhythmic classification derived from transient density. */
  readonly rhythmicClassification: RhythmicClassification;
  /** Inferred instrument role for this track. */
  readonly role: AudioRoleResult;
}

// ─── Audio Content Results ────────────────────────────────────────────

/** Complete audio analysis results for the entire arrangement. */
export interface AudioContentResults {
  /** Per-section, per-track analysis. Key: sectionId → trackName → result. */
  readonly perSection: ReadonlyMap<string, ReadonlyMap<string, AudioTrackSectionResult>>;
  /** Cross-section comparisons per track. Key: trackName → comparisons. */
  readonly crossSection: ReadonlyMap<string, readonly AudioCrossSectionComparison[]>;
  /** Tracks with extended repetition. Key: trackName → groups of section indices. */
  readonly extendedRepetition: ReadonlyMap<string, readonly number[][]>;
  /** Tracks that failed to render/analyze. */
  readonly failures: readonly AudioAnalysisFailure[];
}

/** Information about a track that failed audio analysis. */
export interface AudioAnalysisFailure {
  /** Name of the track that failed. */
  readonly trackName: string;
  /** Reason for the failure. */
  readonly reason: string;
  /** Whether partial results were obtained before the failure. */
  readonly partial: boolean;
}

// ─── Cross-Section Comparison ─────────────────────────────────────────

/** Similarity classification between two sections on the same track. */
export type AudioSimilarityFlag =
  | "same audio content"
  | "similar audio content"
  | "different audio content";

/** Comparison result between two sections for a single audio track. */
export interface AudioCrossSectionComparison {
  /** Index of the first section. */
  readonly sectionIndexA: number;
  /** Index of the second section. */
  readonly sectionIndexB: number;
  /** Cosine similarity of frequency band energy vectors in [0, 1]. */
  readonly similarity: number;
  /** Classification based on similarity thresholds. */
  readonly flag: AudioSimilarityFlag;
}

// ─── Cache ────────────────────────────────────────────────────────────

/** Cache key for per-track-per-section audio analysis results. */
export interface AudioCacheKey {
  readonly trackName: string;
  readonly sectionStartBeat: number;
  readonly sectionEndBeat: number;
}

// ─── Render Orchestrator Config ───────────────────────────────────────

/** Configuration for the audio render orchestrator. */
export interface RenderOrchestratorConfig {
  /** Maximum concurrent render calls to Live (prevents overwhelming the audio engine). */
  readonly maxConcurrentRenders: 3;
  /** Timeout for a single render call in milliseconds. */
  readonly renderTimeoutMs: 10_000;
  /** Timeout for analysis of a single track in milliseconds. */
  readonly analysisTimeoutMs: 5_000;
  /** Maximum number of cached analysis entries (LRU eviction). */
  readonly maxCacheEntries: 200;
}

// ─── SDK Adapter Extension ────────────────────────────────────────────

/** Audio rendering capabilities added to the SDK adapter. */
export interface AudioRenderAdapter {
  /** Render pre-effects audio for a track between two beat positions. Returns WAV file path. */
  renderAudioTrack(trackIndex: number, startBeat: number, endBeat: number): Promise<string>;
  /** Get the list of audio track indices. */
  getAudioTrackIndices(): number[];
  /** Check if a track is muted. */
  isTrackMuted(trackIndex: number): boolean;
}

// ─── State Store Extension ────────────────────────────────────────────

/**
 * Action type for dispatching audio content analysis results to the state store.
 *
 * Added to the Action union in src/state/store.ts:
 * | { type: "UPDATE_AUDIO_CONTENT_ANALYSIS"; audioContent: AudioContentResults }
 *
 * New field in AppState:
 * readonly audioContentAnalysis: AudioContentResults | null;
 */
export const UPDATE_AUDIO_CONTENT_ANALYSIS = "UPDATE_AUDIO_CONTENT_ANALYSIS" as const;

/** Action shape for dispatching audio content analysis results. */
export interface UpdateAudioContentAnalysisAction {
  readonly type: typeof UPDATE_AUDIO_CONTENT_ANALYSIS;
  readonly audioContent: AudioContentResults;
}

// ─── Re-exports ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { FREQUENCY_BANDS } from './frequency-bands-loader.js';