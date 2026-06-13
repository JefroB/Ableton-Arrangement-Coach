/**
 * Property-based tests for Genre File Naming Convention (genre-data-externalization).
 *
 * Feature: genre-data-externalization, Property 11: Genre file naming matches family ID
 *
 * Verifies that for all genre profiles, the corresponding JSON file is named
 * `{genreFamily}.json` in `src/data/genres/`, and vice versa — every JSON file
 * in that directory corresponds to exactly one loaded genre profile.
 */
import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { existsSync, readdirSync } from "fs";
import { resolve, basename } from "path";
import { loadAllGenreData } from "../../src/core/genre-loader.js";

// ═══════════════════════════════════════════════════════════════════════
// Load all genre data once (pure data, no side effects)
// ═══════════════════════════════════════════════════════════════════════

const loadedData = loadAllGenreData();

/** All genre family IDs extracted from loaded profiles. */
const allFamilyIds: string[] = loadedData.profiles.map((p) => p.id);

/** Path to the genres directory relative to project root. */
const genresDir = resolve(__dirname, "../../src/data/genres");

/** All .json files present in the genres directory. */
const jsonFilesOnDisk: string[] = readdirSync(genresDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => basename(f, ".json"));

// ─── Generator ─────────────────────────────────────────────────────────

/**
 * Arbitrary that picks from all loaded genre family IDs.
 * Using constantFrom ensures fast-check iterates across all IDs.
 */
const genreFamilyIdArb: fc.Arbitrary<string> = fc.constantFrom(...allFamilyIds);

/**
 * Arbitrary that picks from all .json filenames on disk (without extension).
 */
const jsonFileNameArb: fc.Arbitrary<string> = fc.constantFrom(...jsonFilesOnDisk);

// ═══════════════════════════════════════════════════════════════════════
// Feature: genre-data-externalization, Property 11: Genre file naming matches family ID
// ═══════════════════════════════════════════════════════════════════════

describe("Property 11: Genre file naming matches family ID", () => {
  /**
   * **Validates: Requirements 1.8, 2.12**
   *
   * For any genre profile with a `genreFamily` field value, there SHALL exist
   * a corresponding JSON file named `{genreFamily}.json` in `src/data/genres/`,
   * and vice versa — every JSON file in that directory corresponds to exactly
   * one genre family ID.
   */

  test.prop([genreFamilyIdArb], { numRuns: 100 })(
    "for each loaded profile, a file named {id}.json exists in src/data/genres/",
    (familyId) => {
      const expectedFile = resolve(genresDir, `${familyId}.json`);
      expect(
        existsSync(expectedFile),
        `Expected file ${familyId}.json to exist in src/data/genres/ for genre family "${familyId}"`,
      ).toBe(true);
    },
  );

  test.prop([jsonFileNameArb], { numRuns: 100 })(
    "for each .json file in src/data/genres/, a corresponding loaded profile exists",
    (fileName) => {
      expect(
        allFamilyIds.includes(fileName),
        `File ${fileName}.json exists in src/data/genres/ but no loaded profile has id "${fileName}"`,
      ).toBe(true);
    },
  );

  it("the number of loaded profiles equals the number of .json files on disk", () => {
    expect(allFamilyIds.length).toBe(jsonFilesOnDisk.length);
  });

  it("loaded profile IDs and .json file names are an exact 1:1 match", () => {
    const profileIdSet = new Set(allFamilyIds);
    const fileNameSet = new Set(jsonFilesOnDisk);

    // Every profile ID has a file
    for (const id of profileIdSet) {
      expect(
        fileNameSet.has(id),
        `Profile "${id}" has no corresponding ${id}.json file`,
      ).toBe(true);
    }

    // Every file has a profile
    for (const name of fileNameSet) {
      expect(
        profileIdSet.has(name),
        `File ${name}.json has no corresponding loaded profile`,
      ).toBe(true);
    }
  });
});
