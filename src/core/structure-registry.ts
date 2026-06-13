/**
 * Structure Registry — central registry for genre arrangement structure data.
 *
 * Imports all JSON data files from `src/data/genres/`, validates their shape,
 * and provides lookup by subgenre identifier. When a new genre JSON file is
 * added, it only needs to be imported here and added to the ALL_FILES array.
 */

import type {
  GenreFamilyStructureFile,
  ArrangementVariant,
  SubgenreStructureEntry,
} from "./structure-types.js";

import africanLatinElectronicData from "../data/genres/african-latin-electronic.json";
import ambientDowntempoData from "../data/genres/ambient-downtempo.json";
import dancehallAfrobeatsData from "../data/genres/dancehall-afrobeats.json";
import deconstructedClubData from "../data/genres/deconstructed-club.json";
import discoNudiscoData from "../data/genres/disco-nudisco.json";
import drumAndBassData from "../data/genres/drum-and-bass.json";
import dubstepBassData from "../data/genres/dubstep-bass.json";
import electroBreakbeatData from "../data/genres/electro-breakbeat.json";
import electroclashElectrotechData from "../data/genres/electroclash-electrotech.json";
import footworkJukeData from "../data/genres/footwork-juke.json";
import hardDanceHappyHardcoreData from "../data/genres/hard-dance-happy-hardcore.json";
import hardcoreBouncyData from "../data/genres/hardcore-bouncy.json";
import hardwaveTranceRevivalData from "../data/genres/hardwave-trance-revival.json";
import hiphopTrapData from "../data/genres/hiphop-trap.json";
import houseData from "../data/genres/house.json";
import idmExperimentalData from "../data/genres/idm-experimental.json";
import industrialEbmData from "../data/genres/industrial-ebm.json";
import jerseyBaltimoreClubData from "../data/genres/jersey-baltimore-club.json";
import lofiChillhopData from "../data/genres/lofi-chillhop.json";
import melodicTechnoProgressiveData from "../data/genres/melodic-techno-progressive.json";
import minimalMicrohouseData from "../data/genres/minimal-microhouse.json";
import popElectronicData from "../data/genres/pop-electronic.json";
import psybassTribalBassData from "../data/genres/psybass-tribal-bass.json";
import reggaetonLatinClubData from "../data/genres/reggaeton-latin-club.json";
import synthwaveDarkwaveData from "../data/genres/synthwave-darkwave.json";
import technoData from "../data/genres/techno.json";
import tranceData from "../data/genres/trance.json";
import ukGarageGrimeData from "../data/genres/uk-garage-grime.json";

// ─── Runtime Validation ────────────────────────────────────────────────

/**
 * Validates that an unknown value conforms to the GenreFamilyStructureFile shape.
 * Throws a descriptive error if validation fails.
 */
export function validateStructureFile(data: unknown): GenreFamilyStructureFile {
  if (data === null || typeof data !== "object") {
    throw new Error("Structure file must be a non-null object");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj["genreFamily"] !== "string" || obj["genreFamily"].length === 0) {
    throw new Error("Structure file must have a non-empty 'genreFamily' string");
  }

  if (!Array.isArray(obj["subgenres"])) {
    throw new Error("Structure file must have a 'subgenres' array");
  }

  for (let i = 0; i < obj["subgenres"].length; i++) {
    const entry = obj["subgenres"][i] as Record<string, unknown>;
    validateSubgenreEntry(entry, i);
  }

  return data as GenreFamilyStructureFile;
}

function validateSubgenreEntry(entry: unknown, index: number): void {
  if (entry === null || typeof entry !== "object") {
    throw new Error(`subgenres[${index}] must be a non-null object`);
  }

  const obj = entry as Record<string, unknown>;

  if (typeof obj["subgenreId"] !== "string" || obj["subgenreId"].length === 0) {
    throw new Error(`subgenres[${index}] must have a non-empty 'subgenreId' string`);
  }

  if (typeof obj["displayName"] !== "string" || obj["displayName"].length === 0) {
    throw new Error(`subgenres[${index}] must have a non-empty 'displayName' string`);
  }

  if (!Array.isArray(obj["structureVariants"])) {
    throw new Error(`subgenres[${index}] must have a 'structureVariants' array`);
  }

  for (let v = 0; v < obj["structureVariants"].length; v++) {
    validateVariant(obj["structureVariants"][v], index, v);
  }
}

function validateVariant(variant: unknown, subgenreIndex: number, variantIndex: number): void {
  const path = `subgenres[${subgenreIndex}].variants[${variantIndex}]`;

  if (variant === null || typeof variant !== "object") {
    throw new Error(`${path} must be a non-null object`);
  }

  const obj = variant as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].length === 0) {
    throw new Error(`${path} must have a non-empty 'name' string`);
  }

  if (!Array.isArray(obj["sections"])) {
    throw new Error(`${path} must have a 'sections' array`);
  }

  for (let s = 0; s < obj["sections"].length; s++) {
    validateSection(obj["sections"][s], path, s);
  }
}

function validateSection(section: unknown, parentPath: string, sectionIndex: number): void {
  const path = `${parentPath}.sections[${sectionIndex}]`;

  if (section === null || typeof section !== "object") {
    throw new Error(`${path} must be a non-null object`);
  }

  const obj = section as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].length === 0) {
    throw new Error(`${path} must have a non-empty 'name' string`);
  }

  if (obj["lengthRange"] === null || typeof obj["lengthRange"] !== "object") {
    throw new Error(`${path} must have a 'lengthRange' object`);
  }

  const range = obj["lengthRange"] as Record<string, unknown>;

  if (typeof range["min"] !== "number" || range["min"] <= 0) {
    throw new Error(`${path}.lengthRange.min must be a positive number`);
  }

  if (typeof range["max"] !== "number" || range["max"] <= 0) {
    throw new Error(`${path}.lengthRange.max must be a positive number`);
  }

  if (range["min"] > range["max"]) {
    throw new Error(`${path}.lengthRange.min must be <= max`);
  }
}

// ─── Registry Construction ─────────────────────────────────────────────

/**
 * All genre family structure files. To add a new genre, import its JSON and
 * append to this array — no other code changes required.
 */
const ALL_FILES: unknown[] = [
  africanLatinElectronicData,
  ambientDowntempoData,
  dancehallAfrobeatsData,
  deconstructedClubData,
  discoNudiscoData,
  drumAndBassData,
  dubstepBassData,
  electroBreakbeatData,
  electroclashElectrotechData,
  footworkJukeData,
  hardDanceHappyHardcoreData,
  hardcoreBouncyData,
  hardwaveTranceRevivalData,
  hiphopTrapData,
  houseData,
  idmExperimentalData,
  industrialEbmData,
  jerseyBaltimoreClubData,
  lofiChillhopData,
  melodicTechnoProgressiveData,
  minimalMicrohouseData,
  popElectronicData,
  psybassTribalBassData,
  reggaetonLatinClubData,
  synthwaveDarkwaveData,
  technoData,
  tranceData,
  ukGarageGrimeData,
];

/** Maps subgenre ID → ArrangementVariant[] for fast lookup. */
const subgenreLookup: Map<string, ArrangementVariant[]> = new Map();

// Validate and index all files at module initialization
for (const raw of ALL_FILES) {
  const file = validateStructureFile(raw);
  for (const subgenre of file.subgenres) {
    subgenreLookup.set(subgenre.subgenreId, subgenre.structureVariants as ArrangementVariant[]);
  }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Returns the arrangement structure variants for the given subgenre ID,
 * or null if the subgenre is not found in any registered genre data file.
 */
export function lookupVariants(subgenreId: string): ArrangementVariant[] | null {
  return subgenreLookup.get(subgenreId) ?? null;
}
