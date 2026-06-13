import type { FrequencyBandName } from "./audio-content-types.js";
import type { FillType } from "./content-analysis-types.js";

// ═══════════════════════════════════════════════════════════════════════
// JSON Schema Interfaces — represent the Genre JSON File format on disk.
// These map to runtime types after loading (e.g., conditionalElements
// object → ReadonlyMap conversion).
// ═══════════════════════════════════════════════════════════════════════

/** Fill profile as represented in a Genre JSON file. */
export interface FillProfileJson {
  readonly expectedFillTypes: string[];
  readonly typicalFillIntervals: number[];
  readonly expectedFillFrequency: number;
  readonly coreElements: string[];
  /** JSON object representation; converted to ReadonlyMap at load time. */
  readonly conditionalElements: Record<string, string[]>;
}

/** Audio profile as represented in a Genre JSON file. */
export interface AudioProfileJson {
  readonly expectedBands: Record<FrequencyBandName, number>;
  readonly expectedDrumTransientDensity: number;
  readonly displayName: string;
  readonly subBassHint: string;
  readonly rhythmicHint: string;
}

/** Threshold profile as represented in a Genre JSON file. */
export interface ThresholdProfileJson {
  readonly flatEnergyDelta: number;
  readonly repetitionSimilarity: number;
  readonly abruptChangeDelta: number;
  readonly crowdingTrackCount: number;
  readonly introMinBars: number;
  readonly outroMinBars: number;
}

/** Transition preferences as represented in a Genre JSON file. */
export interface TransitionPreferencesJson {
  readonly preferred: string[];
  readonly discouraged: string[];
  readonly buildDurationRange: { readonly min: number; readonly max: number };
  readonly dropsExpected: boolean;
}

/** A single structure variant (section bar-length template) within a subgenre entry. */
export interface StructureVariantJson {
  readonly name: string;
  readonly sections: Array<{
    readonly name: string;
    readonly lengthRange: { readonly min: number; readonly max: number };
  }>;
}

/** A subgenre entry as represented in a Genre JSON file. */
export interface SubgenreEntryJson {
  /** Subgenre identifier (renamed from `id`). */
  readonly subgenreId: string;
  readonly displayName: string;
  /** Section bar-length templates (renamed from `variants`). */
  readonly structureVariants: StructureVariantJson[];

  // Optional overrides
  readonly tempoRange?: { readonly min: number; readonly max: number };
  readonly structure?: SectionTemplate[];
  readonly energyCurveTemplate?: number[];
  readonly transitions?: TransitionPreferencesJson;
  readonly energyWeights?: EnergyWeights;
  readonly detectionRules?: DetectionRule[];
  readonly detectionThresholds?: DetectionThresholds;
  readonly audioProfile?: AudioProfileJson;
}

/**
 * Complete Genre JSON file schema. Every genre family has exactly one file
 * conforming to this interface in `src/data/genres/{genreFamily}.json`.
 */
export interface GenreJsonFile {
  // ─── Required fields ─────────────────────────────────────────────
  /** Genre family identifier, kebab-case (renamed from `family`/`id`). */
  readonly genreFamily: string;
  readonly name: string;
  readonly tempoRange: { readonly min: number; readonly max: number };
  readonly structure: SectionTemplate[];
  readonly energyCurveTemplate: number[];
  readonly transitions: TransitionPreferencesJson;
  readonly energyWeights: EnergyWeights;
  readonly detectionRules: DetectionRule[];
  readonly detectionThresholds: DetectionThresholds;
  readonly fillProfile: FillProfileJson;
  readonly audioProfile: AudioProfileJson;
  readonly thresholds: ThresholdProfileJson;

  // ─── Optional fields ─────────────────────────────────────────────
  readonly archetypes?: ArchetypeId[];
  /** Alternative names for matching (e.g., "dnb", "d&b"). */
  readonly aliases?: string[];
  readonly subgenres?: SubgenreEntryJson[];
}

// ═══════════════════════════════════════════════════════════════════════
// Runtime Type Definitions — used by the genre registry and consumers.
// ═══════════════════════════════════════════════════════════════════════

/** Weight profile for energy scoring. All coefficients must sum to 1.0 (±0.001). */
export interface EnergyWeights {
  readonly trackCountWeight: number;
  readonly midiDensityWeight: number;
  readonly trackPresenceWeight: number;
  readonly automationWeight: number;
  readonly frequencyCoverageWeight: number;
  readonly velocityIntensityWeight: number;
  readonly polyphonyScoreWeight: number;
  readonly pitchRangeWeight: number;
  /** Weight for normalized audio RMS energy (0–1). Optional; defaults to 0 when not specified. */
  readonly audioEnergyWeight?: number;
  /** Weight for synth energy contribution (0–1). Optional; defaults to 0 when not specified. */
  readonly synthEnergyWeight?: number;
}

/** Numeric thresholds for issue detection. */
export interface DetectionThresholds {
  readonly flatEnergyMaxDelta: number;
  readonly missingTransitionMinDelta: number;
  readonly similarityCeilingPercent: number;
}

/** A single genre-specific detection rule. */
export interface DetectionRule {
  readonly type: string;
  readonly value: number | boolean;
  readonly severity: "info" | "warning" | "critical";
  readonly unit?: string;
}

/** A named section in the structural template. */
export interface SectionTemplate {
  readonly name: string;
  readonly lengthRange: { readonly min: number; readonly max: number };
  readonly energyRange: { readonly min: number; readonly max: number };
  readonly optional: boolean;
}

/** Transition conventions for a genre. */
export interface TransitionPreferences {
  readonly preferred: readonly string[];
  readonly discouraged: readonly string[];
  readonly buildDurationRange: { readonly min: number; readonly max: number };
  readonly dropsExpected: boolean;
}

/** Arrangement archetype identifiers. */
export type ArchetypeId =
  | "dj-tool"
  | "peak-valley"
  | "verse-chorus"
  | "build-drop"
  | "continuous-evolution"
  | "loop"
  | "multi-section-journey"
  | "cinematic-arc";

/** A subgenre variant that overrides parent profile fields. */
export interface SubgenreVariant {
  readonly id: string;
  readonly name: string;
  readonly parentId: string;
  readonly tempoRange?: { readonly min: number; readonly max: number };
  readonly structure?: readonly SectionTemplate[];
  readonly energyCurveTemplate?: readonly number[];
  readonly transitions?: TransitionPreferences;
  readonly energyWeights?: EnergyWeights;
  readonly detectionRules?: readonly DetectionRule[];
  readonly detectionThresholds?: DetectionThresholds;
}

/** Complete genre profile data model. */
export interface GenreProfile {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly tempoRange: { readonly min: number; readonly max: number };
  readonly structure: readonly SectionTemplate[];
  readonly energyCurveTemplate: readonly number[];
  readonly transitions: TransitionPreferences;
  readonly energyWeights: EnergyWeights;
  readonly detectionRules: readonly DetectionRule[];
  readonly detectionThresholds: DetectionThresholds;
  readonly subgenres?: readonly SubgenreVariant[];
  readonly archetypes?: readonly ArchetypeId[];
}

// ═══════════════════════════════════════════════════════════════════════
// Loader Output Types — represent the runtime data produced by the genre
// loader module after converting JSON into typed, indexed structures.
// ═══════════════════════════════════════════════════════════════════════

/** Genre-specific expectations for percussion fills and patterns (runtime type). */
export interface GenreFillProfile {
  /** Expected fill types for this genre, ordered by typicality. */
  readonly expectedFillTypes: readonly FillType[];

  /** Typical phrase intervals where fills occur (e.g., [8, 16] for 8-bar and 16-bar boundaries). */
  readonly typicalFillIntervals: readonly number[];

  /** Expected fill frequency: fills per 16 bars. */
  readonly expectedFillFrequency: number;

  /** Percussion elements expected to be present throughout the arrangement. */
  readonly coreElements: readonly string[];

  /** Elements that commonly appear only in specific section types (e.g., crash in drops). */
  readonly conditionalElements: ReadonlyMap<string, readonly string[]>;
}

/** Genre-typical frequency band energy levels and transient density expectations (runtime type). */
export interface GenreFrequencyProfile {
  /** Expected energy per frequency band in dBFS (typical level for the genre). */
  readonly expectedBands: Readonly<Record<FrequencyBandName, number>>;

  /** Per-band deviation threshold in dB before surfacing a suggestion. Defaults to 6 dB if not specified. */
  readonly deviationThresholds?: Partial<Readonly<Record<FrequencyBandName, number>>>;

  /** Expected drum transient density (transients per bar) for drum tracks. */
  readonly expectedDrumTransientDensity: number;

  /** Human-readable genre name for use in suggestion text. */
  readonly displayName: string;

  /** Genre-specific sub-bass reinforcement hint. */
  readonly subBassHint?: string;

  /** Genre-specific rhythmic reinforcement hint. */
  readonly rhythmicHint?: string;
}

/** Threshold profile for issue detection. All fields are genre-tunable (runtime type). */
export interface GenreThresholdProfile {
  /** Minimum energy delta to consider sections non-flat (0.1–3.0). */
  readonly flatEnergyDelta: number;

  /** Similarity score above which sections are flagged as repetitive (0.50–0.99). */
  readonly repetitionSimilarity: number;

  /** Energy delta at or above which an abrupt change is flagged (2.0–8.0). */
  readonly abruptChangeDelta: number;

  /** Track count above which a frequency bucket is considered crowded (2–6). */
  readonly crowdingTrackCount: number;

  /** Minimum expected intro length in bars for DJ compatibility (4–64). */
  readonly introMinBars: number;

  /** Minimum expected outro length in bars for DJ compatibility (4–64). */
  readonly outroMinBars: number;
}

// ─── Loaded Genre Data ─────────────────────────────────────────────────

/**
 * Output of the genre loader module — all genre data loaded, validated,
 * and indexed for efficient lookup by the genre registry.
 */
export interface LoadedGenreData {
  /** All 28 genre profiles, typed and ready for indexing. */
  readonly profiles: readonly GenreProfile[];

  /** Fill profiles for all 28 genre families (keyed by family ID). */
  readonly fillProfiles: ReadonlyMap<string, GenreFillProfile>;

  /** Audio profiles for all genre families and subgenres (keyed by ID). */
  readonly audioProfiles: ReadonlyMap<string, GenreFrequencyProfile>;

  /** Threshold profiles for all 28 genre families (keyed by family ID). */
  readonly thresholdProfiles: ReadonlyMap<string, GenreThresholdProfile>;

  /** Alias → family ID mapping for case-insensitive lookups. */
  readonly aliasIndex: ReadonlyMap<string, string>;
}

// ─── Loader Function Signature ─────────────────────────────────────────

/** Load all genre data from statically imported JSON files. */
export type LoadAllGenreData = () => LoadedGenreData;
