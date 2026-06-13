/**
 * Property-based tests for Reference Detector.
 *
 * Feature: m7-reference-tracks
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.7, 2.8
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { detectReferenceTrack } from "./reference-detector.js";
import type { TrackDescriptor } from "./reference-types.js";

// ─── Reference Patterns ────────────────────────────────────────────────

/**
 * The reference naming patterns (case-insensitive, after trim):
 * - Exact: "ref", "reference"
 * - Prefix: "ref "..., "reference "...
 * - Contains: "[ref]", "[reference]"
 */

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary string that does NOT match any reference pattern (after trim + lowercase). */
const nonMatchingName: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => {
    const lower = s.trim().toLowerCase();
    if (lower.length === 0) return false; // whitespace-only excluded separately
    if (lower === "ref" || lower === "reference") return false;
    if (lower.startsWith("ref ") || lower.startsWith("reference ")) return false;
    if (lower.includes("[ref]") || lower.includes("[reference]")) return false;
    return true;
  });

/** Arbitrary string that matches one of the reference patterns (after trim + lowercase). */
const matchingName: fc.Arbitrary<string> = fc.oneof(
  // Exact match: "ref" or "reference" with random casing
  fc.constantFrom("ref", "reference", "REF", "Reference", "REF", "REFERENCE", "Ref", "rEf"),
  // Prefix match: "ref " or "reference " followed by arbitrary suffix
  fc
    .tuple(
      fc.constantFrom("ref ", "Ref ", "REF ", "reference ", "Reference ", "REFERENCE "),
      fc.string({ minLength: 1, maxLength: 20 }),
    )
    .map(([prefix, suffix]) => prefix + suffix),
  // Contains match: "[ref]" or "[reference]" somewhere in the string
  fc
    .tuple(
      fc.string({ minLength: 0, maxLength: 10 }),
      fc.constantFrom("[ref]", "[Ref]", "[REF]", "[reference]", "[Reference]", "[REFERENCE]"),
      fc.string({ minLength: 0, maxLength: 10 }),
    )
    .map(([before, pattern, after]) => before + pattern + after),
);

/** Wrap a name with optional leading/trailing whitespace to test trimming. */
const withOptionalWhitespace = (nameArb: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.stringOf(fc.constantFrom(" ", "\t"), { minLength: 0, maxLength: 3 }),
      nameArb,
      fc.stringOf(fc.constantFrom(" ", "\t"), { minLength: 0, maxLength: 3 }),
    )
    .map(([pre, name, post]) => pre + name + post);

/** Arbitrary track descriptor with a non-matching name. */
const nonMatchingTrack: fc.Arbitrary<TrackDescriptor> = fc.record({
  name: nonMatchingName,
  muted: fc.boolean(),
});

/** Arbitrary track that is whitespace-only or empty. */
const emptyNameTrack: fc.Arbitrary<TrackDescriptor> = fc.record({
  name: fc.stringOf(fc.constantFrom(" ", "\t", ""), { minLength: 0, maxLength: 5 }),
  muted: fc.boolean(),
});

// ─── Property Tests ────────────────────────────────────────────────────

describe("Feature: m7-reference-tracks, Property 3: Reference detection returns the first matching non-muted track", () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.7, 2.8**
   *
   * For any array of track descriptors, the Reference Detector returns the lowest
   * index of a non-muted track whose trimmed name matches the reference patterns
   * (case-insensitive), or null if no such track exists; tracks with empty or
   * whitespace-only names never match.
   */

  test.prop(
    [
      // Generate: a prefix of non-matching/empty tracks, then a matching non-muted track,
      // then an arbitrary suffix of tracks (some may also match).
      fc.array(fc.oneof(nonMatchingTrack, emptyNameTrack), { minLength: 0, maxLength: 10 }),
      withOptionalWhitespace(matchingName),
      fc.array(
        fc.record({ name: fc.string({ maxLength: 30 }), muted: fc.boolean() }),
        { minLength: 0, maxLength: 10 },
      ),
    ],
    { numRuns: 100 },
  )(
    "returns the lowest index of a non-muted matching track",
    (prefix, matchName, suffix) => {
      const matchingTrack: TrackDescriptor = { name: matchName, muted: false };
      const tracks: TrackDescriptor[] = [...prefix, matchingTrack, ...suffix];

      const result = detectReferenceTrack(tracks);

      // The result must be a valid index
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(tracks.length);

      // The result must be <= the index where we inserted the matching track
      const insertedIndex = prefix.length;
      expect(result!).toBeLessThanOrEqual(insertedIndex);

      // The track at the returned index must be non-muted
      expect(tracks[result!].muted).toBe(false);

      // The track at the returned index must have a name that matches the pattern
      const lower = tracks[result!].name.trim().toLowerCase();
      const matches =
        lower === "ref" ||
        lower === "reference" ||
        lower.startsWith("ref ") ||
        lower.startsWith("reference ") ||
        lower.includes("[ref]") ||
        lower.includes("[reference]");
      expect(matches).toBe(true);

      // No earlier non-muted track should match the pattern
      for (let i = 0; i < result!; i++) {
        const trackLower = tracks[i].name.trim().toLowerCase();
        if (tracks[i].muted) continue;
        if (trackLower.length === 0) continue;
        const earlierMatches =
          trackLower === "ref" ||
          trackLower === "reference" ||
          trackLower.startsWith("ref ") ||
          trackLower.startsWith("reference ") ||
          trackLower.includes("[ref]") ||
          trackLower.includes("[reference]");
        expect(earlierMatches).toBe(false);
      }
    },
  );

  test.prop(
    [
      // Only non-matching and empty-name tracks — should always return null
      fc.array(fc.oneof(nonMatchingTrack, emptyNameTrack), { minLength: 0, maxLength: 15 }),
    ],
    { numRuns: 100 },
  )(
    "returns null when no track name matches the reference patterns",
    (tracks) => {
      const result = detectReferenceTrack(tracks);
      expect(result).toBeNull();
    },
  );

  test.prop(
    [
      // Tracks with whitespace-only or empty names — should never match
      fc.array(emptyNameTrack, { minLength: 1, maxLength: 10 }),
    ],
    { numRuns: 100 },
  )(
    "tracks with empty or whitespace-only names never match",
    (tracks) => {
      const result = detectReferenceTrack(tracks);
      expect(result).toBeNull();
    },
  );
});

describe("Feature: m7-reference-tracks, Property 4: Muted tracks are excluded from reference detection", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any array of track descriptors where all pattern-matching tracks are muted,
   * the Reference Detector returns null regardless of those tracks' names.
   */

  test.prop(
    [
      // Generate tracks where EVERY matching name is on a muted track
      fc.array(
        fc.oneof(
          // Muted matching tracks
          fc.record({
            name: withOptionalWhitespace(matchingName),
            muted: fc.constant(true),
          }),
          // Non-matching tracks (muted or not — doesn't matter)
          nonMatchingTrack,
          // Empty-name tracks
          emptyNameTrack,
        ),
        { minLength: 1, maxLength: 15 },
      ),
    ],
    { numRuns: 100 },
  )(
    "returns null when all pattern-matching tracks are muted",
    (tracks) => {
      // Verify precondition: any track that matches the pattern must be muted
      for (const track of tracks) {
        const lower = track.name.trim().toLowerCase();
        if (lower.length === 0) continue;
        const matches =
          lower === "ref" ||
          lower === "reference" ||
          lower.startsWith("ref ") ||
          lower.startsWith("reference ") ||
          lower.includes("[ref]") ||
          lower.includes("[reference]");
        if (matches) {
          expect(track.muted).toBe(true);
        }
      }

      const result = detectReferenceTrack(tracks);
      expect(result).toBeNull();
    },
  );

  test.prop(
    [
      // Tracks where ALL tracks are muted, including matching ones
      fc.array(
        fc.record({
          name: fc.oneof(matchingName, nonMatchingName),
          muted: fc.constant(true),
        }),
        { minLength: 1, maxLength: 15 },
      ),
    ],
    { numRuns: 100 },
  )(
    "returns null when every track is muted regardless of names",
    (tracks) => {
      const result = detectReferenceTrack(tracks);
      expect(result).toBeNull();
    },
  );
});
