/**
 * Genre Loader Module
 *
 * Statically imports all 28 genre JSON files and converts them into typed
 * runtime objects (GenreProfile, GenreFillProfile, GenreFrequencyProfile,
 * GenreThresholdProfile). The loader builds indexed maps for efficient
 * lookup by family ID, subgenre ID, and aliases.
 *
 * esbuild resolves these imports at build time — no filesystem access at runtime.
 */

import type {
  GenreJsonFile,
  GenreProfile,
  GenreFillProfile,
  GenreFrequencyProfile,
  GenreThresholdProfile,
  LoadedGenreData,
  SubgenreVariant,
  TransitionPreferences,
  FillProfileJson,
  AudioProfileJson,
  ThresholdProfileJson,
} from "./genre-profile-types.js";
import type { FillType } from "./content-analysis-types.js";

// ═══════════════════════════════════════════════════════════════════════
// Static JSON Imports — resolved at build time by esbuild
// ═══════════════════════════════════════════════════════════════════════

import technoJson from "../data/genres/techno.json" with { type: "json" };
import houseJson from "../data/genres/house.json" with { type: "json" };
import drumAndBassJson from "../data/genres/drum-and-bass.json" with { type: "json" };
import tranceJson from "../data/genres/trance.json" with { type: "json" };
import hiphopTrapJson from "../data/genres/hiphop-trap.json" with { type: "json" };
import ambientDowntempoJson from "../data/genres/ambient-downtempo.json" with { type: "json" };
import hardcoreBouncyJson from "../data/genres/hardcore-bouncy.json" with { type: "json" };
import minimalMicrohouseJson from "../data/genres/minimal-microhouse.json" with { type: "json" };
import dubstepBassJson from "../data/genres/dubstep-bass.json" with { type: "json" };
import melodicTechnoProgressiveJson from "../data/genres/melodic-techno-progressive.json" with { type: "json" };
import electroBreakbeatJson from "../data/genres/electro-breakbeat.json" with { type: "json" };
import footworkJukeJson from "../data/genres/footwork-juke.json" with { type: "json" };
import discoNudiscoJson from "../data/genres/disco-nudisco.json" with { type: "json" };
import popElectronicJson from "../data/genres/pop-electronic.json" with { type: "json" };
import synthwaveDarkwaveJson from "../data/genres/synthwave-darkwave.json" with { type: "json" };
import idmExperimentalJson from "../data/genres/idm-experimental.json" with { type: "json" };
import africanLatinElectronicJson from "../data/genres/african-latin-electronic.json" with { type: "json" };
import dancehallAfrobeatsJson from "../data/genres/dancehall-afrobeats.json" with { type: "json" };
import deconstructedClubJson from "../data/genres/deconstructed-club.json" with { type: "json" };
import electroclashElectrotechJson from "../data/genres/electroclash-electrotech.json" with { type: "json" };
import hardDanceHappyHardcoreJson from "../data/genres/hard-dance-happy-hardcore.json" with { type: "json" };
import hardwaveTranceRevivalJson from "../data/genres/hardwave-trance-revival.json" with { type: "json" };
import industrialEbmJson from "../data/genres/industrial-ebm.json" with { type: "json" };
import jerseyBaltimoreClubJson from "../data/genres/jersey-baltimore-club.json" with { type: "json" };
import lofiChillhopJson from "../data/genres/lofi-chillhop.json" with { type: "json" };
import psybassTribalBassJson from "../data/genres/psybass-tribal-bass.json" with { type: "json" };
import reggaetonLatinClubJson from "../data/genres/reggaeton-latin-club.json" with { type: "json" };
import ukGarageGrimeJson from "../data/genres/uk-garage-grime.json" with { type: "json" };

// ═══════════════════════════════════════════════════════════════════════
// All genre JSON data collected into a single array
// ═══════════════════════════════════════════════════════════════════════

const ALL_GENRE_JSON: readonly GenreJsonFile[] = [
  technoJson,
  houseJson,
  drumAndBassJson,
  tranceJson,
  hiphopTrapJson,
  ambientDowntempoJson,
  hardcoreBouncyJson,
  minimalMicrohouseJson,
  dubstepBassJson,
  melodicTechnoProgressiveJson,
  electroBreakbeatJson,
  footworkJukeJson,
  discoNudiscoJson,
  popElectronicJson,
  synthwaveDarkwaveJson,
  idmExperimentalJson,
  africanLatinElectronicJson,
  dancehallAfrobeatsJson,
  deconstructedClubJson,
  electroclashElectrotechJson,
  hardDanceHappyHardcoreJson,
  hardwaveTranceRevivalJson,
  industrialEbmJson,
  jerseyBaltimoreClubJson,
  lofiChillhopJson,
  psybassTribalBassJson,
  reggaetonLatinClubJson,
  ukGarageGrimeJson,
] as readonly GenreJsonFile[];

// ═══════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════

/** Required top-level fields that every genre JSON file must contain. */
const REQUIRED_TOP_LEVEL_FIELDS: readonly (keyof GenreJsonFile)[] = [
  "genreFamily",
  "name",
  "tempoRange",
  "structure",
  "energyCurveTemplate",
  "transitions",
  "energyWeights",
  "detectionRules",
  "detectionThresholds",
  "fillProfile",
  "audioProfile",
  "thresholds",
];

/** Required fields within each subgenre entry. */
const REQUIRED_SUBGENRE_FIELDS: readonly string[] = [
  "subgenreId",
  "displayName",
  "structureVariants",
];

/**
 * Validate a genre JSON object. Throws on the first validation error found.
 *
 * Checks:
 * 1. All required top-level fields are present.
 * 2. All subgenre entries contain required fields (subgenreId, displayName, structureVariants).
 * 3. Energy weights sum to 1.0 ±0.001.
 *
 * @param json - The genre JSON object to validate (typed loosely for validation purposes).
 * @param filename - The filename used in error messages (e.g., "techno.json").
 */
export function validateGenreJson(
  json: Record<string, unknown>,
  filename: string,
): void {
  // 1. Validate required top-level fields
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (
      json[field] === undefined ||
      json[field] === null
    ) {
      throw new Error(
        `Genre file ${filename}: missing required field '${field}'`,
      );
    }
  }

  // 2. Validate subgenre entries (if present)
  const subgenres = json["subgenres"] as
    | Record<string, unknown>[]
    | undefined;
  if (Array.isArray(subgenres)) {
    for (let i = 0; i < subgenres.length; i++) {
      const sg = subgenres[i];
      for (const field of REQUIRED_SUBGENRE_FIELDS) {
        if (
          sg[field] === undefined ||
          sg[field] === null
        ) {
          throw new Error(
            `Genre file ${filename}: subgenre at index ${i} missing required field '${field}'`,
          );
        }
      }
    }
  }

  // 3. Validate energy weights sum to 1.0 ±0.001
  const weights = json["energyWeights"] as Record<string, number>;
  if (weights) {
    const sum =
      (weights.trackCountWeight ?? 0) +
      (weights.midiDensityWeight ?? 0) +
      (weights.trackPresenceWeight ?? 0) +
      (weights.automationWeight ?? 0) +
      (weights.frequencyCoverageWeight ?? 0) +
      (weights.velocityIntensityWeight ?? 0) +
      (weights.polyphonyScoreWeight ?? 0) +
      (weights.pitchRangeWeight ?? 0) +
      (weights.audioEnergyWeight ?? 0) +
      (weights.synthEnergyWeight ?? 0);

    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(
        `Genre file ${filename}: energyWeights sum to ${sum}, expected 1.0 (±0.001)`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Conversion Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Convert a FillProfileJson into a runtime GenreFillProfile. */
function convertFillProfile(json: FillProfileJson): GenreFillProfile {
  return {
    expectedFillTypes: json.expectedFillTypes as readonly FillType[],
    typicalFillIntervals: json.typicalFillIntervals,
    expectedFillFrequency: json.expectedFillFrequency,
    coreElements: json.coreElements,
    conditionalElements: new Map(
      Object.entries(json.conditionalElements).map(([key, value]) => [
        key,
        value as readonly string[],
      ]),
    ) as ReadonlyMap<string, readonly string[]>,
  };
}

/** Convert an AudioProfileJson into a runtime GenreFrequencyProfile. */
function convertAudioProfile(json: AudioProfileJson): GenreFrequencyProfile {
  return {
    expectedBands: json.expectedBands,
    expectedDrumTransientDensity: json.expectedDrumTransientDensity,
    displayName: json.displayName,
    subBassHint: json.subBassHint,
    rhythmicHint: json.rhythmicHint,
  };
}

/** Convert a ThresholdProfileJson into a runtime GenreThresholdProfile. */
function convertThresholdProfile(
  json: ThresholdProfileJson,
): GenreThresholdProfile {
  return {
    flatEnergyDelta: json.flatEnergyDelta,
    repetitionSimilarity: json.repetitionSimilarity,
    abruptChangeDelta: json.abruptChangeDelta,
    crowdingTrackCount: json.crowdingTrackCount,
    introMinBars: json.introMinBars,
    outroMinBars: json.outroMinBars,
  };
}

/** Convert TransitionPreferencesJson into a runtime TransitionPreferences. */
function convertTransitions(
  json: GenreJsonFile["transitions"],
): TransitionPreferences {
  return {
    preferred: json.preferred,
    discouraged: json.discouraged,
    buildDurationRange: json.buildDurationRange,
    dropsExpected: json.dropsExpected,
  };
}

/** Convert a single GenreJsonFile into a runtime GenreProfile. */
function convertGenreProfile(json: GenreJsonFile): GenreProfile {
  const subgenres: SubgenreVariant[] | undefined = json.subgenres?.map(
    (sg) => {
      const variant: SubgenreVariant = {
        id: sg.subgenreId,
        name: sg.displayName,
        parentId: json.genreFamily,
        ...(sg.tempoRange !== undefined && { tempoRange: sg.tempoRange }),
        ...(sg.structure !== undefined && { structure: sg.structure }),
        ...(sg.energyCurveTemplate !== undefined && {
          energyCurveTemplate: sg.energyCurveTemplate,
        }),
        ...(sg.transitions !== undefined && {
          transitions: convertTransitions(sg.transitions),
        }),
        ...(sg.energyWeights !== undefined && {
          energyWeights: sg.energyWeights,
        }),
        ...(sg.detectionRules !== undefined && {
          detectionRules: sg.detectionRules,
        }),
        ...(sg.detectionThresholds !== undefined && {
          detectionThresholds: sg.detectionThresholds,
        }),
      };
      return variant;
    },
  );

  const profile: GenreProfile = {
    id: json.genreFamily,
    name: json.name,
    family: json.genreFamily,
    tempoRange: json.tempoRange,
    structure: json.structure,
    energyCurveTemplate: json.energyCurveTemplate,
    transitions: convertTransitions(json.transitions),
    energyWeights: json.energyWeights,
    detectionRules: json.detectionRules,
    detectionThresholds: json.detectionThresholds,
    ...(subgenres !== undefined &&
      subgenres.length > 0 && { subgenres }),
    ...(json.archetypes !== undefined && { archetypes: json.archetypes }),
  };

  return profile;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load all genre data from statically imported JSON files.
 *
 * Converts JSON objects into typed runtime structures, builds indexed maps
 * for efficient registry lookup, and produces a complete LoadedGenreData
 * structure containing all 28 genre families.
 */
export function loadAllGenreData(): LoadedGenreData {
  const profiles: GenreProfile[] = [];
  const fillProfiles = new Map<string, GenreFillProfile>();
  const audioProfiles = new Map<string, GenreFrequencyProfile>();
  const thresholdProfiles = new Map<string, GenreThresholdProfile>();
  const aliasIndex = new Map<string, string>();

  for (const json of ALL_GENRE_JSON) {
    // Derive filename for error messages
    const filename = json.genreFamily
      ? `${json.genreFamily}.json`
      : "unknown.json";

    // Validate the JSON before converting
    validateGenreJson(json as unknown as Record<string, unknown>, filename);

    const familyId = json.genreFamily;

    // Build the genre profile
    profiles.push(convertGenreProfile(json));

    // Build fill profile (keyed by family ID)
    fillProfiles.set(familyId, convertFillProfile(json.fillProfile));

    // Build audio profile (family-level entry)
    audioProfiles.set(familyId, convertAudioProfile(json.audioProfile));

    // Build threshold profile (keyed by family ID)
    thresholdProfiles.set(familyId, convertThresholdProfile(json.thresholds));

    // Build alias index (lowercase keys → family ID)
    if (json.aliases) {
      for (const alias of json.aliases) {
        aliasIndex.set(alias.toLowerCase(), familyId);
      }
    }

    // Also index the family ID itself for case-insensitive lookup
    aliasIndex.set(familyId.toLowerCase(), familyId);

    // Add subgenre-level audio profile overrides
    if (json.subgenres) {
      for (const sg of json.subgenres) {
        if (sg.audioProfile) {
          audioProfiles.set(sg.subgenreId, convertAudioProfile(sg.audioProfile));
        }
      }
    }
  }

  // Validate that at least one profile was loaded
  if (profiles.length === 0) {
    throw new Error("Genre data failed to load: no profiles returned");
  }

  return {
    profiles,
    fillProfiles,
    audioProfiles,
    thresholdProfiles,
    aliasIndex,
  };
}
