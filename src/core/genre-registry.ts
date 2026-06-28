/**
 * Genre Registry — central registry for genre profiles.
 *
 * This module loads all registered GenreProfile instances at initialization
 * via the genre loader, indexes them by family ID and subgenre ID, and
 * provides lookup/search functions. It is a pure module: no I/O, no async,
 * no network calls. JSON data is resolved at build time by esbuild.
 */

import { loadAllGenreData } from "./genre-loader.js";
import type {
  GenreProfile,
  GenreFillProfile,
  GenreFrequencyProfile,
  GenreThresholdProfile,
  SubgenreVariant,
  EnergyWeights,
  DetectionThresholds,
  TransitionPreferences,
} from "./genre-profile-types.js";
import type { FrequencyBandName } from "./audio-content-types.js";
import type { GenreTransitionProfile, TransitionCategory } from "./transition-engine.js";
import {
  getBaseWeights,
  getAlsWeights,
  getAudioWeights,
  getDefaultThresholds,
  getDeviationThresholdDb,
  getRhythmicDeviationThreshold,
} from "./energy-weights-loader.js";

// Re-export types for backward compatibility with existing consumers
export type { EnergyWeights, DetectionThresholds, TransitionPreferences, GenreFillProfile, GenreThresholdProfile, GenreFrequencyProfile } from "./genre-profile-types.js";

// ─── Exported Interfaces ───────────────────────────────────────────────

export interface GenreFamilySummary {
  readonly id: string;
  readonly name: string;
  readonly subgenreCount: number;
}

export interface GenreSearchResult {
  readonly id: string;
  readonly name: string;
  readonly type: "family" | "subgenre";
  readonly familyId: string;
}

// ─── Load Genre Data at Module Initialization ──────────────────────────

let loadedProfiles: readonly GenreProfile[];
let loadedFillProfiles: ReadonlyMap<string, GenreFillProfile>;
let loadedAudioProfiles: ReadonlyMap<string, GenreFrequencyProfile>;
let loadedThresholdProfiles: ReadonlyMap<string, GenreThresholdProfile>;
let loadedAliasIndex: ReadonlyMap<string, string>;

try {
  const loaded = loadAllGenreData();
  if (loaded.profiles.length === 0) {
    throw new Error("Genre data failed to load: no profiles returned");
  }
  loadedProfiles = loaded.profiles;
  loadedFillProfiles = loaded.fillProfiles;
  loadedAudioProfiles = loaded.audioProfiles;
  loadedThresholdProfiles = loaded.thresholdProfiles;
  loadedAliasIndex = loaded.aliasIndex;
} catch (err: unknown) {
  if (err instanceof Error && err.message.startsWith("Genre data failed to load")) {
    throw err;
  }
  const cause = err instanceof Error ? err.message : String(err);
  throw new Error(`Genre data failed to load: ${cause}`);
}

// ─── Backward-Compatible Constants ─────────────────────────────────────

/** Array of all genre family IDs (backward-compatible with old GENRES array). */
export const GENRES: readonly string[] = loadedProfiles.map((p) => p.id);

/** All loaded genre profiles (backward-compatible with old ALL_PROFILES from genre-profiles/index). */
export const ALL_PROFILES: readonly GenreProfile[] = loadedProfiles;

/** Default energy weights used when no genre profile is found and .als data is NOT available. */
export const DEFAULT_WEIGHTS: EnergyWeights = getBaseWeights();

/** Default energy weights used when no genre profile is found and .als data IS available. */
export const DEFAULT_WEIGHTS_WITH_ALS: EnergyWeights = getAlsWeights();

/** Default energy weights used when audio content analysis is available (includes audioEnergyWeight). */
export const DEFAULT_WEIGHTS_WITH_AUDIO: EnergyWeights = getAudioWeights();

// ─── Internal Indexes ──────────────────────────────────────────────────

/** Maps family id → GenreProfile */
const familyIndex: Map<string, GenreProfile> = new Map();

/** Maps subgenre id → { parent profile, variant } */
const subgenreIndex: Map<string, { parent: GenreProfile; variant: SubgenreVariant }> = new Map();

// Build indexes from loaded profiles
for (const profile of loadedProfiles) {
  familyIndex.set(profile.id, profile);

  if (profile.subgenres) {
    for (const variant of profile.subgenres) {
      subgenreIndex.set(variant.id, { parent: profile, variant });
    }
  }
}

// ─── Subgenre Resolution ───────────────────────────────────────────────

function resolveSubgenre(parent: GenreProfile, variant: SubgenreVariant): GenreProfile {
  return {
    id: variant.id,
    name: variant.name,
    family: parent.family,
    tempoRange: variant.tempoRange ?? parent.tempoRange,
    structure: variant.structure ?? parent.structure,
    energyCurveTemplate: variant.energyCurveTemplate ?? parent.energyCurveTemplate,
    transitions: variant.transitions ?? parent.transitions,
    energyWeights: variant.energyWeights ?? parent.energyWeights,
    detectionRules: variant.detectionRules ?? parent.detectionRules,
    detectionThresholds: variant.detectionThresholds ?? parent.detectionThresholds,
  };
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Returns the GenreProfile for the given family ID, or null if not found.
 * Empty string returns null.
 */
export function getProfile(id: string): GenreProfile | null {
  if (id === "") {
    return null;
  }
  return familyIndex.get(id) ?? null;
}

/**
 * Returns a resolved GenreProfile with subgenre overrides merged onto the
 * parent profile, or null if not found. Empty string returns null.
 */
export function getProfileBySubgenre(subgenreId: string): GenreProfile | null {
  if (subgenreId === "") {
    return null;
  }
  const entry = subgenreIndex.get(subgenreId);
  if (!entry) {
    return null;
  }
  return resolveSubgenre(entry.parent, entry.variant);
}

/**
 * Returns summary of all genre families.
 */
export function getAllFamilies(): GenreFamilySummary[] {
  const families: GenreFamilySummary[] = [];
  for (const profile of loadedProfiles) {
    families.push({
      id: profile.id,
      name: profile.name,
      subgenreCount: profile.subgenres?.length ?? 0,
    });
  }
  return families;
}

/**
 * Case-insensitive substring search across genre family names and subgenre names.
 * Empty or whitespace-only query returns an empty array.
 */
export function search(query: string): GenreSearchResult[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    return [];
  }

  const lower = trimmed.toLowerCase();
  const results: GenreSearchResult[] = [];

  for (const profile of loadedProfiles) {
    if (profile.name.toLowerCase().includes(lower)) {
      results.push({
        id: profile.id,
        name: profile.name,
        type: "family",
        familyId: profile.id,
      });
    }

    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        if (variant.name.toLowerCase().includes(lower)) {
          results.push({
            id: variant.id,
            name: variant.name,
            type: "subgenre",
            familyId: profile.id,
          });
        }
      }
    }
  }

  return results;
}

// ─── Fill Profile Lookup ────────────────────────────────────────────────

/**
 * Returns the GenreFillProfile for the given genre string, or null if not found.
 *
 * Lookup order:
 * 1. If null/empty/whitespace-only → return null
 * 2. Trim and lowercase the input
 * 3. Check alias index → resolve to family ID → look up in fillProfiles map
 * 4. Check subgenre index → resolve to parent family ID → look up parent's fill profile
 * 5. No match → return null
 *
 * @param genre - Genre family ID, subgenre ID, alias, or null.
 */
export function getGenreFillProfile(genre: string | null): GenreFillProfile | null {
  if (genre === null || genre.trim() === "") {
    return null;
  }

  const normalized = genre.trim().toLowerCase();

  // Check alias index → resolve to family ID
  const familyId = loadedAliasIndex.get(normalized);
  if (familyId !== undefined) {
    const profile = loadedFillProfiles.get(familyId);
    if (profile !== undefined) {
      return profile;
    }
  }

  // Check subgenre index → resolve to parent family ID → return parent's fill profile
  const subgenreEntry = subgenreIndex.get(normalized);
  if (subgenreEntry !== undefined) {
    const parentFillProfile = loadedFillProfiles.get(subgenreEntry.parent.id);
    if (parentFillProfile !== undefined) {
      return parentFillProfile;
    }
  }

  return null;
}

// ─── Audio Profile Lookup ───────────────────────────────────────────────

/** Default deviation threshold when not specified per-band (in dB). */
export const DEFAULT_DEVIATION_THRESHOLD_DB = getDeviationThresholdDb();

/** Default rhythmic deviation threshold (30% below expected). */
export const RHYTHMIC_DEVIATION_THRESHOLD = getRhythmicDeviationThreshold();

/**
 * Returns the GenreFrequencyProfile for the given genre/subgenre ID, or null if not found.
 *
 * Lookup order:
 * 1. If null/empty/whitespace-only → return null
 * 2. Trim and lowercase the input
 * 3. Check alias index → resolve to family ID → look up in audioProfiles map
 * 4. Check audioProfiles map directly with normalized input (handles subgenre IDs with dedicated profiles)
 * 5. Check subgenre index → resolve to parent family ID → look up parent's audio profile (fallback)
 * 6. No match → return null
 *
 * @param genre - Genre family ID, subgenre ID, alias, or null.
 */
export function getGenreAudioProfile(genre: string | null): GenreFrequencyProfile | null {
  if (genre === null || genre.trim() === "") {
    return null;
  }

  const normalized = genre.trim().toLowerCase();

  // Check alias index → resolve to family ID
  const familyId = loadedAliasIndex.get(normalized);
  if (familyId !== undefined) {
    // Try the resolved family ID in audioProfiles
    const profile = loadedAudioProfiles.get(familyId);
    if (profile !== undefined) {
      return profile;
    }
  }

  // Check audioProfiles map directly with normalized input
  // (handles subgenre IDs that have dedicated audio profiles)
  const directProfile = loadedAudioProfiles.get(normalized);
  if (directProfile !== undefined) {
    return directProfile;
  }

  // Check subgenre index → fallback to parent family's audio profile
  const subgenreEntry = subgenreIndex.get(normalized);
  if (subgenreEntry !== undefined) {
    const parentAudioProfile = loadedAudioProfiles.get(subgenreEntry.parent.id);
    if (parentAudioProfile !== undefined) {
      return parentAudioProfile;
    }
  }

  return null;
}

/**
 * Get the deviation threshold for a specific frequency band and genre.
 * Returns the genre-specific threshold if defined, otherwise the default (6 dB).
 */
export function getDeviationThreshold(
  profile: GenreFrequencyProfile,
  band: FrequencyBandName,
): number {
  return profile.deviationThresholds?.[band] ?? DEFAULT_DEVIATION_THRESHOLD_DB;
}

/**
 * Determine whether a measured band energy deviates significantly below the genre expectation.
 * Returns the deviation in dB (positive = below expected), or 0 if within threshold.
 */
export function computeBandDeviation(
  measuredEnergy: number,
  expectedEnergy: number,
  threshold: number,
): number {
  // Deviation is how much lower the measured value is vs expected.
  // Since dBFS values are negative, "below" means more negative.
  const deviation = expectedEnergy - measuredEnergy;
  return deviation > threshold ? deviation : 0;
}

/**
 * Determine whether drum transient density is significantly below genre expectation.
 * Returns true if density is more than 30% below expected.
 */
export function isDrumDensityBelowExpectation(
  measuredDensity: number,
  expectedDensity: number,
): boolean {
  if (expectedDensity <= 0) return false;
  const threshold = expectedDensity * (1 - RHYTHMIC_DEVIATION_THRESHOLD);
  return measuredDensity < threshold;
}

// ─── Threshold Profile Lookup ───────────────────────────────────────────

/** Default genre threshold profile used when no genre is selected or genre is unknown. */
export const DEFAULT_GENRE_THRESHOLDS: GenreThresholdProfile = getDefaultThresholds();

/**
 * Returns the GenreThresholdProfile for the given genre string.
 *
 * Lookup order:
 * 1. If null/empty/whitespace-only → return DEFAULT_GENRE_THRESHOLDS
 * 2. Trim and lowercase the input
 * 3. Check alias index → resolve to family ID → look up in thresholdProfiles map
 * 4. Check subgenre index → resolve to parent family ID → return parent's threshold profile
 * 5. No match → return DEFAULT_GENRE_THRESHOLDS
 *
 * @param genre - Genre family ID, subgenre ID, alias, or null.
 * @returns The corresponding GenreThresholdProfile.
 */
export function getThresholdProfileForGenre(genre: string | null): GenreThresholdProfile {
  if (genre === null || genre.trim() === "") {
    return DEFAULT_GENRE_THRESHOLDS;
  }

  const normalized = genre.trim().toLowerCase();

  // Check alias index → resolve to family ID
  const familyId = loadedAliasIndex.get(normalized);
  if (familyId !== undefined) {
    const profile = loadedThresholdProfiles.get(familyId);
    if (profile !== undefined) {
      return profile;
    }
  }

  // Check subgenre index → resolve to parent family ID → return parent's threshold profile
  const subgenreEntry = subgenreIndex.get(normalized);
  if (subgenreEntry !== undefined) {
    const parentThresholdProfile = loadedThresholdProfiles.get(subgenreEntry.parent.id);
    if (parentThresholdProfile !== undefined) {
      return parentThresholdProfile;
    }
  }

  return DEFAULT_GENRE_THRESHOLDS;
}

// ─── Backward-Compatible Adapter Functions ─────────────────────────────

/** Default detection thresholds used when no genre profile is found. */
const DEFAULT_DETECTION_THRESHOLDS: DetectionThresholds = {
  flatEnergyMaxDelta: 2,
  missingTransitionMinDelta: 3,
  similarityCeilingPercent: 90,
};

/** Default transition preferences used when no genre profile is found. */
const DEFAULT_TRANSITION_PREFERENCES: TransitionPreferences = {
  preferred: [],
  discouraged: [],
  buildDurationRange: { min: 4, max: 16 },
  dropsExpected: false,
};

/**
 * Returns EnergyWeights for the given genre/subgenre ID, or default weights if null/not found.
 *
 * Lookup order:
 * 1. Try family lookup via getProfile(genreId)
 * 2. Try subgenre lookup via getProfileBySubgenre(genreId)
 * 3. If both return null (or genreId is null), return DEFAULT_WEIGHTS or DEFAULT_WEIGHTS_WITH_ALS
 *
 * @param genreId - Genre or subgenre ID, or null for defaults.
 * @param hasAlsData - Whether .als automation data is available. Affects default weight selection.
 */
export function getWeightsForGenre(genreId: string | null, hasAlsData = false): EnergyWeights {
  if (genreId === null) {
    return hasAlsData ? DEFAULT_WEIGHTS_WITH_ALS : DEFAULT_WEIGHTS;
  }
  const profile = getProfile(genreId) ?? getProfileBySubgenre(genreId);
  if (profile === null) {
    return hasAlsData ? DEFAULT_WEIGHTS_WITH_ALS : DEFAULT_WEIGHTS;
  }
  return profile.energyWeights;
}

/**
 * Returns DetectionThresholds for the given genre/subgenre ID, or default thresholds if null/not found.
 *
 * Lookup order:
 * 1. Try family lookup via getProfile(genreId)
 * 2. Try subgenre lookup via getProfileBySubgenre(genreId)
 * 3. If both return null (or genreId is null), return default thresholds
 */
export function getThresholdsForGenre(genreId: string | null): DetectionThresholds {
  if (genreId === null) {
    return DEFAULT_DETECTION_THRESHOLDS;
  }
  const profile = getProfile(genreId) ?? getProfileBySubgenre(genreId);
  if (profile === null) {
    return DEFAULT_DETECTION_THRESHOLDS;
  }
  return profile.detectionThresholds;
}

/**
 * Returns TransitionPreferences for the given genre/subgenre ID, or default preferences if null/not found.
 *
 * Lookup order:
 * 1. Try family lookup via getProfile(genreId)
 * 2. Try subgenre lookup via getProfileBySubgenre(genreId)
 * 3. If both return null (or genreId is null), return default preferences
 */
export function getTransitionPreferencesForGenre(genreId: string | null): TransitionPreferences {
  if (genreId === null) {
    return DEFAULT_TRANSITION_PREFERENCES;
  }
  const profile = getProfile(genreId) ?? getProfileBySubgenre(genreId);
  if (profile === null) {
    return DEFAULT_TRANSITION_PREFERENCES;
  }
  return profile.transitions;
}

// ─── Legacy Transition Profile Exports (backward compat) ────────────────

/** All transition categories, used as the default "all equally preferred" list. */
export const ALL_TRANSITION_CATEGORIES: readonly TransitionCategory[] = [
  "riser",
  "drum_fill",
  "filter_sweep",
  "volume_dynamics",
  "impact",
  "textural_fx",
] as const;

/**
 * Default profile used when no genre is selected.
 * All categories equally preferred, none discouraged, 4–32 bars, drops expected.
 */
export const DEFAULT_TRANSITION_PROFILE: GenreTransitionProfile = {
  genre: "default",
  preferredCategories: ALL_TRANSITION_CATEGORIES,
  discouragedCategories: [],
  buildDurationRange: { min: 4, max: 32 },
  dropsExpected: true,
};

/** Genre-specific transition profiles (legacy Map keyed by display name). */
export const GENRE_TRANSITION_PROFILES: ReadonlyMap<string, GenreTransitionProfile> = new Map<
  string,
  GenreTransitionProfile
>([
  [
    "Techno",
    {
      genre: "Techno",
      preferredCategories: ["filter_sweep", "volume_dynamics", "drum_fill"],
      discouragedCategories: [],
      buildDurationRange: { min: 4, max: 16 },
      dropsExpected: true,
    },
  ],
  [
    "House",
    {
      genre: "House",
      preferredCategories: ["filter_sweep", "drum_fill", "volume_dynamics"],
      discouragedCategories: [],
      buildDurationRange: { min: 4, max: 16 },
      dropsExpected: true,
    },
  ],
  [
    "Trance",
    {
      genre: "Trance",
      preferredCategories: ["riser", "drum_fill", "impact"],
      discouragedCategories: [],
      buildDurationRange: { min: 16, max: 32 },
      dropsExpected: true,
    },
  ],
  [
    "Drum and Bass",
    {
      genre: "Drum and Bass",
      preferredCategories: ["drum_fill", "riser", "impact"],
      discouragedCategories: [],
      buildDurationRange: { min: 4, max: 16 },
      dropsExpected: true,
    },
  ],
  [
    "Ambient",
    {
      genre: "Ambient",
      preferredCategories: ["textural_fx", "filter_sweep", "volume_dynamics"],
      discouragedCategories: ["impact", "drum_fill"],
      buildDurationRange: { min: 8, max: 32 },
      dropsExpected: false,
    },
  ],
  [
    "Pop",
    {
      genre: "Pop",
      preferredCategories: ["drum_fill", "volume_dynamics", "riser"],
      discouragedCategories: [],
      buildDurationRange: { min: 4, max: 8 },
      dropsExpected: true,
    },
  ],
]);

/**
 * Get the transition profile for a genre (legacy accessor).
 *
 * Returns the genre-specific profile if the genre is known (keyed by display
 * name), or null if the genre is unknown or null.
 *
 * @param genre - Genre display name or null.
 * @returns The corresponding GenreTransitionProfile, or null if not found.
 */
export function getTransitionProfileForGenre(genre: string | null): GenreTransitionProfile | null {
  if (genre === null) {
    return null;
  }
  return GENRE_TRANSITION_PROFILES.get(genre) ?? null;
}

// ─── Legacy Threshold Exports (backward compat) ─────────────────────────

/**
 * Backward-compatible alias for DEFAULT_GENRE_THRESHOLDS.
 * Old code imports this as `DEFAULT_THRESHOLDS` from genre-thresholds.ts.
 */
export { DEFAULT_GENRE_THRESHOLDS as DEFAULT_THRESHOLDS };

/** Genre-specific threshold profiles (legacy Map keyed by display name). */
export const GENRE_THRESHOLDS: ReadonlyMap<string, GenreThresholdProfile> = new Map<
  string,
  GenreThresholdProfile
>([
  [
    "Techno",
    {
      flatEnergyDelta: 2,
      repetitionSimilarity: 0.92,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 32,
      outroMinBars: 32,
    },
  ],
  [
    "House",
    {
      flatEnergyDelta: 2,
      repetitionSimilarity: 0.85,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 32,
      outroMinBars: 32,
    },
  ],
  [
    "Trance",
    {
      flatEnergyDelta: 1,
      repetitionSimilarity: 0.85,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 32,
      outroMinBars: 32,
    },
  ],
  [
    "Drum and Bass",
    {
      flatEnergyDelta: 1,
      repetitionSimilarity: 0.85,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    },
  ],
  [
    "Ambient",
    {
      flatEnergyDelta: 3,
      repetitionSimilarity: 0.92,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    },
  ],
  [
    "Pop",
    {
      flatEnergyDelta: 2,
      repetitionSimilarity: 0.85,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 8,
      outroMinBars: 8,
    },
  ],
]);

/**
 * Legacy accessor: get the GenreThresholdProfile for a genre by display name.
 *
 * Returns the genre-specific thresholds if the genre is known, otherwise falls
 * back to DEFAULT_GENRE_THRESHOLDS. Passing `null` returns DEFAULT_GENRE_THRESHOLDS.
 *
 * This is the old `getThresholdsForGenre` from `genre-thresholds.ts` that returns
 * `GenreThresholdProfile`. Not to be confused with the `getThresholdsForGenre`
 * above that returns `DetectionThresholds` for the issue detector.
 *
 * @param genre - Genre display name or null.
 */
export function getLegacyThresholdsForGenre(genre: string | null): GenreThresholdProfile {
  if (genre === null) {
    return DEFAULT_GENRE_THRESHOLDS;
  }
  return GENRE_THRESHOLDS.get(genre) ?? DEFAULT_GENRE_THRESHOLDS;
}
