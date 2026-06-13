/**
 * Property-based tests for Genre Data Equivalence (genre-data-externalization).
 *
 * Feature: genre-data-externalization, Property 3: JSON-loaded profiles deeply equal original TypeScript constants
 *
 * Since the original TypeScript profile files have been deleted, this test
 * verifies equivalence by importing each genre JSON file directly, calling
 * loadAllGenreData(), and verifying that all profile fields match the JSON
 * after expected transformations (field renames and type conversions).
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { loadAllGenreData } from "../../src/core/genre-loader.js";

// ═══════════════════════════════════════════════════════════════════════
// Static JSON Imports — all 28 genre JSON files
// ═══════════════════════════════════════════════════════════════════════

import technoJson from "../../src/data/genres/techno.json";
import houseJson from "../../src/data/genres/house.json";
import drumAndBassJson from "../../src/data/genres/drum-and-bass.json";
import tranceJson from "../../src/data/genres/trance.json";
import hiphopTrapJson from "../../src/data/genres/hiphop-trap.json";
import ambientDowntempoJson from "../../src/data/genres/ambient-downtempo.json";
import hardcoreBouncyJson from "../../src/data/genres/hardcore-bouncy.json";
import minimalMicrohouseJson from "../../src/data/genres/minimal-microhouse.json";
import dubstepBassJson from "../../src/data/genres/dubstep-bass.json";
import melodicTechnoProgressiveJson from "../../src/data/genres/melodic-techno-progressive.json";
import electroBreakbeatJson from "../../src/data/genres/electro-breakbeat.json";
import footworkJukeJson from "../../src/data/genres/footwork-juke.json";
import discoNudiscoJson from "../../src/data/genres/disco-nudisco.json";
import popElectronicJson from "../../src/data/genres/pop-electronic.json";
import synthwaveDarkwaveJson from "../../src/data/genres/synthwave-darkwave.json";
import idmExperimentalJson from "../../src/data/genres/idm-experimental.json";
import africanLatinElectronicJson from "../../src/data/genres/african-latin-electronic.json";
import dancehallAfrobeatsJson from "../../src/data/genres/dancehall-afrobeats.json";
import deconstructedClubJson from "../../src/data/genres/deconstructed-club.json";
import electroclashElectrotechJson from "../../src/data/genres/electroclash-electrotech.json";
import hardDanceHappyHardcoreJson from "../../src/data/genres/hard-dance-happy-hardcore.json";
import hardwaveTranceRevivalJson from "../../src/data/genres/hardwave-trance-revival.json";
import industrialEbmJson from "../../src/data/genres/industrial-ebm.json";
import jerseyBaltimoreClubJson from "../../src/data/genres/jersey-baltimore-club.json";
import lofiChillhopJson from "../../src/data/genres/lofi-chillhop.json";
import psybassTribalBassJson from "../../src/data/genres/psybass-tribal-bass.json";
import reggaetonLatinClubJson from "../../src/data/genres/reggaeton-latin-club.json";
import ukGarageGrimeJson from "../../src/data/genres/uk-garage-grime.json";

// ═══════════════════════════════════════════════════════════════════════
// Build genre ID → JSON mapping
// ═══════════════════════════════════════════════════════════════════════

const genreJsonMap: Record<string, Record<string, unknown>> = {
  techno: technoJson as unknown as Record<string, unknown>,
  house: houseJson as unknown as Record<string, unknown>,
  "drum-and-bass": drumAndBassJson as unknown as Record<string, unknown>,
  trance: tranceJson as unknown as Record<string, unknown>,
  "hiphop-trap": hiphopTrapJson as unknown as Record<string, unknown>,
  "ambient-downtempo": ambientDowntempoJson as unknown as Record<string, unknown>,
  "hardcore-bouncy": hardcoreBouncyJson as unknown as Record<string, unknown>,
  "minimal-microhouse": minimalMicrohouseJson as unknown as Record<string, unknown>,
  "dubstep-bass": dubstepBassJson as unknown as Record<string, unknown>,
  "melodic-techno-progressive": melodicTechnoProgressiveJson as unknown as Record<string, unknown>,
  "electro-breakbeat": electroBreakbeatJson as unknown as Record<string, unknown>,
  "footwork-juke": footworkJukeJson as unknown as Record<string, unknown>,
  "disco-nudisco": discoNudiscoJson as unknown as Record<string, unknown>,
  "pop-electronic": popElectronicJson as unknown as Record<string, unknown>,
  "synthwave-darkwave": synthwaveDarkwaveJson as unknown as Record<string, unknown>,
  "idm-experimental": idmExperimentalJson as unknown as Record<string, unknown>,
  "african-latin-electronic": africanLatinElectronicJson as unknown as Record<string, unknown>,
  "dancehall-afrobeats": dancehallAfrobeatsJson as unknown as Record<string, unknown>,
  "deconstructed-club": deconstructedClubJson as unknown as Record<string, unknown>,
  "electroclash-electrotech": electroclashElectrotechJson as unknown as Record<string, unknown>,
  "hard-dance-happy-hardcore": hardDanceHappyHardcoreJson as unknown as Record<string, unknown>,
  "hardwave-trance-revival": hardwaveTranceRevivalJson as unknown as Record<string, unknown>,
  "industrial-ebm": industrialEbmJson as unknown as Record<string, unknown>,
  "jersey-baltimore-club": jerseyBaltimoreClubJson as unknown as Record<string, unknown>,
  "lofi-chillhop": lofiChillhopJson as unknown as Record<string, unknown>,
  "psybass-tribal-bass": psybassTribalBassJson as unknown as Record<string, unknown>,
  "reggaeton-latin-club": reggaetonLatinClubJson as unknown as Record<string, unknown>,
  "uk-garage-grime": ukGarageGrimeJson as unknown as Record<string, unknown>,
};

// ═══════════════════════════════════════════════════════════════════════
// Load all genre data once
// ═══════════════════════════════════════════════════════════════════════

const loadedData = loadAllGenreData();

/** All 28 genre family IDs. */
const allFamilyIds: string[] = loadedData.profiles.map((p) => p.id);

// Sanity check
if (allFamilyIds.length !== 28) {
  throw new Error(
    `Expected 28 genre families but found ${allFamilyIds.length}`,
  );
}

// ─── Generator ─────────────────────────────────────────────────────────

/**
 * Arbitrary that picks from all 28 genre family IDs.
 * Using constantFrom ensures fast-check iterates across all IDs.
 */
const genreFamilyIdArb: fc.Arbitrary<string> = fc.constantFrom(...allFamilyIds);

// ═══════════════════════════════════════════════════════════════════════
// Feature: genre-data-externalization, Property 3: JSON-loaded profiles deeply equal original TypeScript constants
// ═══════════════════════════════════════════════════════════════════════

describe("Property 3: JSON-loaded profiles deeply equal original TypeScript constants", () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 4.4, 9.7, 11.1**
   *
   * For genres with existing TS data, compare loaded GenreProfile against
   * the JSON source for all fields, verifying the expected transformations:
   * - profile.id === json.genreFamily
   * - profile.family === json.genreFamily
   * - profile.name === json.name
   * - profile.tempoRange deeply equals json.tempoRange
   * - profile.structure deeply equals json.structure
   * - profile.energyCurveTemplate deeply equals json.energyCurveTemplate
   * - profile.transitions.preferred deeply equals json.transitions.preferred
   * - profile.energyWeights deeply equals json.energyWeights
   * - profile.detectionRules deeply equals json.detectionRules
   * - profile.detectionThresholds deeply equals json.detectionThresholds
   */

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.id and profile.family both equal json.genreFamily",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId);
      const json = genreJsonMap[familyId]!;

      expect(profile).toBeDefined();
      expect(profile!.id).toBe(json["genreFamily"]);
      expect(profile!.family).toBe(json["genreFamily"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.name equals json.name",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.name).toBe(json["name"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.tempoRange deeply equals json.tempoRange",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.tempoRange).toEqual(json["tempoRange"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.structure deeply equals json.structure",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.structure).toEqual(json["structure"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.energyCurveTemplate deeply equals json.energyCurveTemplate",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.energyCurveTemplate).toEqual(json["energyCurveTemplate"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.transitions.preferred deeply equals json.transitions.preferred",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;
      const jsonTransitions = json["transitions"] as Record<string, unknown>;

      expect(profile.transitions.preferred).toEqual(jsonTransitions["preferred"]);
      expect(profile.transitions.discouraged).toEqual(jsonTransitions["discouraged"]);
      expect(profile.transitions.buildDurationRange).toEqual(jsonTransitions["buildDurationRange"]);
      expect(profile.transitions.dropsExpected).toBe(jsonTransitions["dropsExpected"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.energyWeights deeply equals json.energyWeights",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.energyWeights).toEqual(json["energyWeights"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.detectionRules deeply equals json.detectionRules",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.detectionRules).toEqual(json["detectionRules"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.detectionThresholds deeply equals json.detectionThresholds",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;

      expect(profile.detectionThresholds).toEqual(json["detectionThresholds"]);
    },
  );

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "profile.subgenres correctly transform json.subgenres (subgenreId → id, displayName → name)",
    (familyId) => {
      const profile = loadedData.profiles.find((p) => p.id === familyId)!;
      const json = genreJsonMap[familyId]!;
      const jsonSubgenres = json["subgenres"] as
        | Array<Record<string, unknown>>
        | undefined;

      if (!jsonSubgenres || jsonSubgenres.length === 0) {
        // If JSON has no subgenres, profile should also have no subgenres
        expect(profile.subgenres === undefined || profile.subgenres.length === 0).toBe(true);
        return;
      }

      expect(profile.subgenres).toBeDefined();
      expect(profile.subgenres!.length).toBe(jsonSubgenres.length);

      for (let i = 0; i < jsonSubgenres.length; i++) {
        const jsonSg = jsonSubgenres[i]!;
        const profileSg = profile.subgenres![i]!;

        // subgenreId → id
        expect(profileSg.id).toBe(jsonSg["subgenreId"]);
        // displayName → name
        expect(profileSg.name).toBe(jsonSg["displayName"]);
        // parentId === genreFamily
        expect(profileSg.parentId).toBe(familyId);
      }
    },
  );
});
