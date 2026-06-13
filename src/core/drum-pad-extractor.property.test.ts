/**
 * Property-based tests for drum-pad-extractor.ts
 *
 * Feature: midi-content-analysis
 * - Property 20: Drum Pad Map Extraction
 * - Property 21: Drum Element Category Classification
 * - Property 23: Fill Element Labeling
 *
 * **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 9.2**
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { classifyDrumElement, extractSampleName, classifyFillType } from "./drum-pad-extractor.js";
import type { DrumElementCategory, DrumPadEntry, DrumPadMap, FillType } from "./content-analysis-types.js";
import type { NoteData } from "../ableton/sdk-adapter.js";

// ─── Valid Categories ───────────────────────────────────────────────────

const VALID_CATEGORIES: readonly DrumElementCategory[] = [
  "kick",
  "snare",
  "hi-hat",
  "tom",
  "cymbal",
  "percussion",
  "other",
];

// ─── Custom Arbitraries ─────────────────────────────────────────────────

/** Generate an arbitrary string (any printable characters, including empty). */
const arbSampleName = fc.string({ minLength: 0, maxLength: 80 });

/** Known keyword → expected category mappings from the design document. */
const KEYWORD_CATEGORY_MAP: readonly { keyword: string; expected: DrumElementCategory }[] = [
  // kick keywords
  { keyword: "kick", expected: "kick" },
  { keyword: "bd", expected: "kick" },
  { keyword: "bass drum", expected: "kick" },
  { keyword: "bassdrum", expected: "kick" },
  // snare keywords
  { keyword: "snare", expected: "snare" },
  { keyword: "sd", expected: "snare" },
  { keyword: "clap", expected: "snare" },
  { keyword: "rim", expected: "snare" },
  // hi-hat keywords
  { keyword: "hat", expected: "hi-hat" },
  { keyword: "hh", expected: "hi-hat" },
  { keyword: "hihat", expected: "hi-hat" },
  { keyword: "hi-hat", expected: "hi-hat" },
  // tom keywords
  { keyword: "tom", expected: "tom" },
  { keyword: "floor", expected: "tom" },
  { keyword: "rack", expected: "tom" },
  // percussion keywords
  { keyword: "perc", expected: "percussion" },
  { keyword: "shaker", expected: "percussion" },
  { keyword: "tamb", expected: "percussion" },
  { keyword: "conga", expected: "percussion" },
  { keyword: "bongo", expected: "percussion" },
  { keyword: "cowbell", expected: "percussion" },
  { keyword: "wood", expected: "percussion" },
  // cymbal keywords
  { keyword: "crash", expected: "cymbal" },
  { keyword: "ride", expected: "cymbal" },
  { keyword: "cymbal", expected: "cymbal" },
  { keyword: "bell", expected: "cymbal" },
];

/**
 * Generate a sample name that contains a known keyword, surrounded by
 * arbitrary prefix/suffix text that does NOT accidentally contain a
 * higher-priority keyword.
 */
function arbSampleNameWithKeyword(): fc.Arbitrary<{
  sampleName: string;
  expected: DrumElementCategory;
}> {
  return fc
    .integer({ min: 0, max: KEYWORD_CATEGORY_MAP.length - 1 })
    .chain((idx) => {
      const { keyword, expected } = KEYWORD_CATEGORY_MAP[idx];
      // Prefix/suffix that won't contain any drum keywords
      const safeChar = fc.constantFrom(
        "x", "z", "q", "0", "1", "_", "-", " ", ".",
      );
      const safeStr = fc.stringOf(safeChar, { minLength: 0, maxLength: 10 });
      return fc.tuple(safeStr, safeStr).map(([prefix, suffix]) => ({
        sampleName: `${prefix}${keyword}${suffix}`,
        expected,
      }));
    });
}

// ─── Property 21: Drum Element Category Classification ──────────────────

describe("Property 21: Drum Element Category Classification", () => {
  test.prop([arbSampleName], { numRuns: 200 })(
    "always returns a valid DrumElementCategory for any input string",
    (sampleName) => {
      const result = classifyDrumElement(sampleName);
      expect(VALID_CATEGORIES).toContain(result);
    },
  );

  test.prop([arbSampleNameWithKeyword()], { numRuns: 200 })(
    "returns the expected category when input contains a known keyword",
    ({ sampleName, expected }) => {
      const result = classifyDrumElement(sampleName);
      expect(result).toBe(expected);
    },
  );

  test.prop([arbSampleName], { numRuns: 100 })(
    "classification is case-insensitive (upper/lower/mixed produce same result)",
    (sampleName) => {
      const lower = classifyDrumElement(sampleName.toLowerCase());
      const upper = classifyDrumElement(sampleName.toUpperCase());
      const original = classifyDrumElement(sampleName);
      expect(lower).toBe(upper);
      expect(lower).toBe(original);
    },
  );

  test.prop(
    [fc.stringOf(fc.constantFrom("x", "z", "q", "0", "1", "_", "-"), { minLength: 0, maxLength: 30 })],
    { numRuns: 100 },
  )(
    "returns 'other' when no known keyword is present",
    (noKeywordName) => {
      const result = classifyDrumElement(noKeywordName);
      expect(result).toBe("other");
    },
  );
});


// ─── Property 20: Drum Pad Map Extraction ───────────────────────────────

/**
 * **Validates: Requirements 8.1, 8.2**
 *
 * Property 20: When `extractSampleName` receives a valid file path (with
 * directory and extension), the result should be:
 * - Non-empty (when input is non-empty)
 * - Shorter than the input (directory and extension are stripped)
 * - Not contain path separators (/ or \)
 * - Not end with common audio extensions (.wav, .aif, .aiff, .mp3)
 */

/** Arbitrary for common audio file extensions. */
const AUDIO_EXTENSIONS = [".wav", ".aif", ".aiff", ".mp3", ".flac", ".ogg"];

/** Generate an arbitrary non-empty filename component (no separators, no dots at start). */
const arbFilenameBase = fc
  .stringOf(
    fc.constantFrom(
      "a", "b", "c", "d", "e", "f", "K", "H", "T", "S",
      "0", "1", "2", "3", "_", "-", " ",
    ),
    { minLength: 1, maxLength: 30 },
  );

/** Generate an arbitrary directory component (can contain separators). */
const arbDirectory = fc.oneof(
  // Unix-style path
  fc.tuple(
    fc.array(arbFilenameBase, { minLength: 1, maxLength: 4 }),
  ).map(([parts]) => "/" + parts.join("/")),
  // Windows-style path
  fc.tuple(
    fc.constantFrom("C", "D", "E"),
    fc.array(arbFilenameBase, { minLength: 1, maxLength: 4 }),
  ).map(([drive, parts]) => `${drive}:\\${parts.join("\\")}`),
);

/** Generate a valid file path with directory, filename, and audio extension. */
const arbValidFilePath = fc.tuple(
  arbDirectory,
  arbFilenameBase,
  fc.constantFrom(...AUDIO_EXTENSIONS),
).map(([dir, name, ext]) => {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir}${sep}${name}${ext}`;
});

describe("Property 20: Drum Pad Map Extraction", () => {
  test.prop([arbValidFilePath], { numRuns: 200 })(
    "result is non-empty when input is a valid file path with directory and extension",
    (filePath) => {
      const result = extractSampleName(filePath);
      expect(result.length).toBeGreaterThan(0);
    },
  );

  test.prop([arbValidFilePath], { numRuns: 200 })(
    "result is shorter than the input (directory and extension are stripped)",
    (filePath) => {
      const result = extractSampleName(filePath);
      expect(result.length).toBeLessThan(filePath.length);
    },
  );

  test.prop([arbValidFilePath], { numRuns: 200 })(
    "result does not contain path separators (/ or \\)",
    (filePath) => {
      const result = extractSampleName(filePath);
      expect(result).not.toContain("/");
      expect(result).not.toContain("\\");
    },
  );

  test.prop([arbValidFilePath], { numRuns: 200 })(
    "result does not end with common audio extensions",
    (filePath) => {
      const result = extractSampleName(filePath);
      const lowerResult = result.toLowerCase();
      for (const ext of AUDIO_EXTENSIONS) {
        expect(lowerResult.endsWith(ext)).toBe(false);
      }
    },
  );

  test.prop(
    [
      // Generate strings that contain at least one non-separator, non-dot character
      // (i.e., there's an actual filename component present)
      fc.tuple(
        fc.constantFrom("", "/", "\\", "/dir/", "C:\\dir\\"),
        fc.stringOf(
          fc.constantFrom("a", "b", "K", "1", "_", "-"),
          { minLength: 1, maxLength: 20 },
        ),
      ).map(([prefix, name]) => prefix + name),
    ],
    { numRuns: 100 },
  )(
    "result is non-empty when input contains an actual filename component",
    (input) => {
      const result = extractSampleName(input);
      expect(result.length).toBeGreaterThan(0);
    },
  );
});

// ─── Property 23: Fill Element Labeling ─────────────────────────────────

/**
 * **Validates: Requirements 8.5, 9.2**
 *
 * Property 23: When `classifyFillType` receives notes whose pitches all map
 * to the same category in a DrumPadMap:
 * - If the category is "tom" → result should be "tom-fill"
 * - If the category is "snare" and density > 4/beat → result should be "snare-roll"
 * - If the category is "hi-hat" and density > 4/beat → result should be "hat-roll"
 * - If the category is a roll-type with density ≤ 4 → result should be "generic-fill"
 */

const VALID_FILL_TYPES: readonly FillType[] = [
  "tom-fill",
  "snare-roll",
  "hat-roll",
  "cymbal-fill",
  "percussion-fill",
  "clap-roll",
  "808-roll",
  "generic-fill",
];

/**
 * Build a DrumPadMap where all pitches in the given range map to the same
 * category using a sample name with the specified keyword.
 */
function buildUniformDrumPadMap(
  pitches: readonly number[],
  keyword: string,
  category: DrumElementCategory,
): DrumPadMap {
  const map = new Map<number, DrumPadEntry>();
  for (const pitch of pitches) {
    map.set(pitch, {
      pitch,
      sampleName: `${keyword}_sample_${pitch}`,
      category,
    });
  }
  return map;
}

/** Generate NoteData[] where all notes use pitches from the given set. */
function arbFillNotes(
  pitches: readonly number[],
  minNotes: number,
  maxNotes: number,
): fc.Arbitrary<readonly NoteData[]> {
  return fc
    .array(
      fc.record({
        pitch: fc.constantFrom(...pitches),
        startTime: fc.double({ min: 0, max: 16, noNaN: true }),
        duration: fc.double({ min: 0.01, max: 1, noNaN: true }),
        velocity: fc.integer({ min: 1, max: 127 }),
      }),
      { minLength: minNotes, maxLength: maxNotes },
    );
}

describe("Property 23: Fill Element Labeling", () => {
  // Tom category: always "tom-fill" regardless of density
  test.prop(
    [
      fc.integer({ min: 3, max: 30 }), // noteCount
      fc.double({ min: 0.5, max: 8, noNaN: true }), // fillDurationBeats
    ],
    { numRuns: 150 },
  )(
    "all-tom pitches → result is 'tom-fill' regardless of density",
    (noteCount, fillDurationBeats) => {
      const pitches = [45, 47, 48]; // typical tom pitches
      const drumPadMap = buildUniformDrumPadMap(pitches, "tom", "tom");
      const notes: NoteData[] = Array.from({ length: noteCount }, (_, i) => ({
        pitch: pitches[i % pitches.length]!,
        startTime: (i / noteCount) * fillDurationBeats,
        duration: 0.1,
        velocity: 100,
      }));
      const result = classifyFillType(notes, drumPadMap, fillDurationBeats);
      expect(result).toBe("tom-fill");
    },
  );

  // Snare category with high density: "snare-roll"
  test.prop(
    [
      fc.double({ min: 0.5, max: 4, noNaN: true }), // fillDurationBeats
    ],
    { numRuns: 100 },
  )(
    "all-snare pitches with density > 4/beat → result is 'snare-roll'",
    (fillDurationBeats) => {
      const pitches = [38, 40]; // typical snare pitches
      const drumPadMap = buildUniformDrumPadMap(pitches, "snare", "snare");
      // Ensure density > 4 notes/beat
      const noteCount = Math.ceil(fillDurationBeats * 5); // 5 notes/beat > 4 threshold
      const notes: NoteData[] = Array.from({ length: noteCount }, (_, i) => ({
        pitch: pitches[i % pitches.length]!,
        startTime: (i / noteCount) * fillDurationBeats,
        duration: 0.05,
        velocity: 100,
      }));
      const density = noteCount / fillDurationBeats;
      // Sanity check: density should exceed threshold
      expect(density).toBeGreaterThan(4);
      const result = classifyFillType(notes, drumPadMap, fillDurationBeats);
      expect(result).toBe("snare-roll");
    },
  );

  // Hi-hat category with high density: "hat-roll"
  test.prop(
    [
      fc.double({ min: 0.5, max: 4, noNaN: true }), // fillDurationBeats
    ],
    { numRuns: 100 },
  )(
    "all-hihat pitches with density > 4/beat → result is 'hat-roll'",
    (fillDurationBeats) => {
      const pitches = [42, 44, 46]; // typical hi-hat pitches
      const drumPadMap = buildUniformDrumPadMap(pitches, "hihat", "hi-hat");
      // Ensure density > 4 notes/beat
      const noteCount = Math.ceil(fillDurationBeats * 5);
      const notes: NoteData[] = Array.from({ length: noteCount }, (_, i) => ({
        pitch: pitches[i % pitches.length]!,
        startTime: (i / noteCount) * fillDurationBeats,
        duration: 0.05,
        velocity: 100,
      }));
      const density = noteCount / fillDurationBeats;
      expect(density).toBeGreaterThan(4);
      const result = classifyFillType(notes, drumPadMap, fillDurationBeats);
      expect(result).toBe("hat-roll");
    },
  );

  // Snare category with low density: "generic-fill" (density ≤ 4 → not a roll)
  test.prop(
    [
      fc.double({ min: 2, max: 8, noNaN: true }), // fillDurationBeats (longer to keep density low)
    ],
    { numRuns: 100 },
  )(
    "all-snare pitches with density ≤ 4/beat → result is 'generic-fill'",
    (fillDurationBeats) => {
      const pitches = [38, 40];
      const drumPadMap = buildUniformDrumPadMap(pitches, "snare", "snare");
      // Ensure density ≤ 4 notes/beat: use at most floor(4 * duration) notes
      // Use exactly 2 notes/beat to be safely under threshold
      const noteCount = Math.max(1, Math.floor(fillDurationBeats * 2));
      const notes: NoteData[] = Array.from({ length: noteCount }, (_, i) => ({
        pitch: pitches[i % pitches.length]!,
        startTime: (i / noteCount) * fillDurationBeats,
        duration: 0.1,
        velocity: 100,
      }));
      const density = noteCount / fillDurationBeats;
      // Sanity check: density should be ≤ 4
      expect(density).toBeLessThanOrEqual(4);
      const result = classifyFillType(notes, drumPadMap, fillDurationBeats);
      expect(result).toBe("generic-fill");
    },
  );

  // Hi-hat category with low density: "generic-fill" (density ≤ 4 → not a roll)
  test.prop(
    [
      fc.double({ min: 2, max: 8, noNaN: true }), // fillDurationBeats
    ],
    { numRuns: 100 },
  )(
    "all-hihat pitches with density ≤ 4/beat → result is 'generic-fill'",
    (fillDurationBeats) => {
      const pitches = [42, 44, 46];
      const drumPadMap = buildUniformDrumPadMap(pitches, "hihat", "hi-hat");
      // Use 2 notes/beat to stay under threshold
      const noteCount = Math.max(1, Math.floor(fillDurationBeats * 2));
      const notes: NoteData[] = Array.from({ length: noteCount }, (_, i) => ({
        pitch: pitches[i % pitches.length]!,
        startTime: (i / noteCount) * fillDurationBeats,
        duration: 0.1,
        velocity: 100,
      }));
      const density = noteCount / fillDurationBeats;
      expect(density).toBeLessThanOrEqual(4);
      const result = classifyFillType(notes, drumPadMap, fillDurationBeats);
      expect(result).toBe("generic-fill");
    },
  );

  // Any input always returns a valid FillType
  test.prop(
    [
      fc.array(
        fc.record({
          pitch: fc.integer({ min: 0, max: 127 }),
          startTime: fc.double({ min: 0, max: 32, noNaN: true }),
          duration: fc.double({ min: 0.01, max: 2, noNaN: true }),
          velocity: fc.integer({ min: 1, max: 127 }),
        }),
        { minLength: 0, maxLength: 30 },
      ),
      fc.double({ min: 0.1, max: 16, noNaN: true }), // fillDurationBeats
    ],
    { numRuns: 150 },
  )(
    "always returns a valid FillType for any input",
    (notes, fillDurationBeats) => {
      // Build an arbitrary drum pad map with random mappings
      const drumPadMap = new Map<number, DrumPadEntry>();
      for (const note of notes) {
        if (!drumPadMap.has(note.pitch)) {
          drumPadMap.set(note.pitch, {
            pitch: note.pitch,
            sampleName: `sample_${note.pitch}`,
            category: "other",
          });
        }
      }
      const result = classifyFillType(notes, drumPadMap, fillDurationBeats);
      expect(VALID_FILL_TYPES).toContain(result);
    },
  );
});
