/**
 * Property-based tests for Genre Registry search functionality.
 *
 * Feature: m6-genre-infrastructure
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { search, getAllFamilies, getProfile } from "../../src/core/genre-registry.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Collects all searchable names (family names + subgenre names) from the registry,
 * along with their IDs and types.
 */
function getAllSearchableNames(): Array<{
  id: string;
  name: string;
  type: "family" | "subgenre";
  familyId: string;
}> {
  const names: Array<{
    id: string;
    name: string;
    type: "family" | "subgenre";
    familyId: string;
  }> = [];

  for (const family of getAllFamilies()) {
    const profile = getProfile(family.id);
    if (!profile) continue;

    names.push({
      id: profile.id,
      name: profile.name,
      type: "family",
      familyId: profile.id,
    });

    if (profile.subgenres) {
      for (const sub of profile.subgenres) {
        names.push({
          id: sub.id,
          name: sub.name,
          type: "subgenre",
          familyId: profile.id,
        });
      }
    }
  }

  return names;
}

const allNames = getAllSearchableNames();

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generates a random registered name entry from the registry.
 */
const registeredNameArb = fc.constantFrom(...allNames);

/**
 * Given a name string, generates a random non-empty substring of it,
 * optionally with case variation (uppercase, lowercase, or mixed).
 */
function substringOfName(name: string): fc.Arbitrary<string> {
  if (name.length === 0) return fc.constant(name);

  return fc
    .tuple(
      fc.nat({ max: name.length - 1 }), // start index
      fc.nat({ max: name.length - 1 }), // offset from start
      fc.constantFrom("lower", "upper", "mixed" as const),
    )
    .map(([start, offset, caseVariant]) => {
      // Ensure we get at least 1 character
      const end = Math.min(start + offset + 1, name.length);
      const substr = name.slice(start, end);

      switch (caseVariant) {
        case "lower":
          return substr.toLowerCase();
        case "upper":
          return substr.toUpperCase();
        case "mixed":
          return substr
            .split("")
            .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
            .join("");
        default:
          return substr;
      }
    })
    // Filter out substrings that are empty or whitespace-only after trimming,
    // since the search function trims the query and returns empty for whitespace.
    .filter((s) => s.trim().length > 0);
}

/**
 * Generates a string composed entirely of whitespace characters
 * (spaces, tabs, newlines, carriage returns).
 */
const whitespaceOnlyArb = fc.stringOf(
  fc.constantFrom(" ", "\t", "\n", "\r", "  ", "\t\t"),
  { minLength: 0, maxLength: 20 },
);

// ─── Property 6: Registry search returns matching results ──────────────

// Feature: m6-genre-infrastructure, Property 6: Registry search returns matching results
describe("Property 6: Registry search returns matching results", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any registered genre family name or subgenre name, searching for any
   * case-variant non-empty substring of that name SHALL include that
   * genre/subgenre in the search results array.
   */
  test.prop(
    [registeredNameArb.chain((entry) => fc.tuple(fc.constant(entry), substringOfName(entry.name)))],
    { numRuns: 200 },
  )(
    "searching for a case-variant substring of a registered name includes that entry in results",
    ([entry, query]) => {
      const results = search(query);

      // The results array should contain an entry with the matching id
      const found = results.some((r) => r.id === entry.id);
      expect(found).toBe(true);
    },
  );
});

// ─── Property 7: Whitespace-only search returns empty ──────────────────

// Feature: m6-genre-infrastructure, Property 7: Whitespace-only search returns empty
describe("Property 7: Whitespace-only search returns empty", () => {
  /**
   * **Validates: Requirements 2.8**
   *
   * For any string composed entirely of whitespace characters (including
   * empty string), calling search() SHALL return an empty array.
   */
  test.prop([whitespaceOnlyArb], { numRuns: 200 })(
    "whitespace-only or empty strings return an empty results array",
    (query) => {
      const results = search(query);
      expect(results).toEqual([]);
    },
  );
});
