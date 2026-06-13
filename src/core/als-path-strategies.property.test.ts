/**
 * Property-based tests for the ALS Path Strategies module.
 *
 * Feature: als-file-path-resolution
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import path from "node:path";

import {
  extractProjectRoot,
  selectMostRecentAlsFile,
  generateLogCandidates,
  parseLogForAlsPath,
  normalizePath,
} from "./als-path-strategies.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a valid path segment (no separators, no empty). */
const pathSegmentArbitrary = fc.stringOf(
  fc.char().filter((c) => c !== "/" && c !== "\\" && c !== "\0" && c !== '"'),
  { minLength: 1, maxLength: 15 },
).filter((s) => s.trim().length > 0);

/** Generate a random path separator (forward slash or backslash). */
const separatorArbitrary = fc.constantFrom("/", "\\");

/** Generate an .als filename. */
const alsFilenameArbitrary = fc.stringOf(
  fc.char().filter((c) => c !== "/" && c !== "\\" && c !== "\0" && c !== '"' && c !== "."),
  { minLength: 1, maxLength: 15 },
).map((name) => `${name.trim() || "track"}.als`);

// ─── Property 1: Separator-agnostic project root extraction ────────────

// Feature: als-file-path-resolution, Property 1: Separator-agnostic project root extraction
describe("Property 1: Separator-agnostic project root extraction", () => {
  /**
   * **Validates: Requirements 1.1, 6.1**
   *
   * For any file path string containing the segment "Samples" preceded by either
   * a forward slash or backslash, extractProjectRoot SHALL return the substring
   * before the last occurrence of the separator + "Samples" combination,
   * regardless of whether the path uses forward slashes, backslashes, or a mix.
   */

  test.prop(
    [
      // Generate 1-5 prefix segments
      fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 5 }),
      // Generate 1-3 trailing segments after "Samples"
      fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 3 }),
      // Generate separators for each join point
      fc.array(separatorArbitrary, { minLength: 10, maxLength: 10 }),
    ],
    { numRuns: 100 },
  )(
    "returns prefix before the last separator + 'Samples' in mixed-separator paths",
    (prefixSegments, trailingSegments, separators) => {
      // Build a path: prefix[0] sep prefix[1] sep ... sep "Samples" sep trailing[0] sep ...
      let sepIdx = 0;
      const nextSep = () => separators[sepIdx++ % separators.length]!;

      // Build prefix portion
      const prefix = prefixSegments.join(nextSep());
      const sep1 = nextSep(); // separator before "Samples"

      // Build trailing portion
      const trailing = trailingSegments.join(nextSep());
      const sep2 = nextSep(); // separator after "Samples"

      const fullPath = `${prefix}${sep1}Samples${sep2}${trailing}`;

      const result = extractProjectRoot(fullPath);

      // The result should be the prefix (everything before the last sep+"Samples")
      expect(result).toBe(prefix);
    },
  );

  test.prop(
    [
      // Generate paths with TWO occurrences of "Samples" — should use the LAST one
      fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 3 }),
      fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 3 }),
      fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 2 }),
      fc.array(separatorArbitrary, { minLength: 12, maxLength: 12 }),
    ],
    { numRuns: 100 },
  )(
    "uses the LAST occurrence of 'Samples' when multiple exist",
    (firstSegments, middleSegments, trailingSegments, separators) => {
      let sepIdx = 0;
      const nextSep = () => separators[sepIdx++ % separators.length]!;

      const first = firstSegments.join(nextSep());
      const s1 = nextSep();
      const middle = middleSegments.join(nextSep());
      const s2 = nextSep();
      const trailing = trailingSegments.join(nextSep());
      const s3 = nextSep();

      // path: first/Samples/middle/Samples/trailing
      const fullPath = `${first}${s1}Samples${s2}${middle}${s3}Samples${nextSep()}${trailing}`;

      const result = extractProjectRoot(fullPath);

      // Expected: everything before the LAST /Samples or \Samples
      const expectedPrefix = `${first}${s1}Samples${s2}${middle}`;
      expect(result).toBe(expectedPrefix);
    },
  );
});

// ─── Property 2: Most-recent .als file selection ───────────────────────

// Feature: als-file-path-resolution, Property 2: Most-recent .als file selection
describe("Property 2: Most-recent .als file selection", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any non-empty list of files with distinct modification times,
   * selectMostRecentAlsFile SHALL always return the file with the strictly
   * highest mtimeMs value.
   */

  test.prop(
    [
      // Generate 1-20 files with unique mtimeMs values
      fc.uniqueArray(
        fc.record({
          name: alsFilenameArbitrary,
          mtimeMs: fc.double({ min: 0, max: 1e15, noNaN: true }),
        }),
        { minLength: 1, maxLength: 20, selector: (entry) => entry.mtimeMs },
      ),
      pathSegmentArbitrary, // project root
    ],
    { numRuns: 100 },
  )(
    "always returns the file with the highest mtimeMs",
    (files, projectRoot) => {
      const result = selectMostRecentAlsFile(files, projectRoot);

      // Find the expected winner
      const maxMtime = Math.max(...files.map((f) => f.mtimeMs));
      const expected = files.find((f) => f.mtimeMs === maxMtime)!;

      expect(result).toBe(path.join(projectRoot, expected.name));
    },
  );
});

// ─── Property 3: Log walk-up bounded depth ─────────────────────────────

// Feature: als-file-path-resolution, Property 3: Log walk-up bounded depth
describe("Property 3: Log walk-up bounded depth", () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any starting directory path, generateLogCandidates with maxLevels=5
   * SHALL return at most 5 candidate paths, and each candidate SHALL be a
   * proper ancestor (or equal) of the starting directory with "Log.txt" appended.
   */

  test.prop(
    [
      // Generate directory paths of 1-20 segments
      fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 20 }),
    ],
    { numRuns: 100 },
  )(
    "returns at most 5 candidates, each being a proper ancestor with Log.txt appended",
    (segments) => {
      // Build an absolute-looking directory path
      const startDir = path.resolve(path.join(...segments));

      const candidates = generateLogCandidates(startDir, 5);

      // At most 5 candidates
      expect(candidates.length).toBeLessThanOrEqual(5);
      expect(candidates.length).toBeGreaterThanOrEqual(1);

      // Each candidate ends with "Log.txt"
      for (const candidate of candidates) {
        expect(path.basename(candidate)).toBe("Log.txt");
      }

      // Each candidate's directory is an ancestor of (or equal to) startDir
      const startDirResolved = path.resolve(startDir);
      for (const candidate of candidates) {
        const candidateDir = path.dirname(candidate);
        // The candidate dir should be a prefix of (or equal to) startDir
        expect(
          startDirResolved.startsWith(candidateDir) || startDirResolved === candidateDir,
        ).toBe(true);
      }

      // Candidates should be in order from startDir outward (each shorter or equal path)
      for (let i = 1; i < candidates.length; i++) {
        const prevDir = path.dirname(candidates[i - 1]!);
        const currDir = path.dirname(candidates[i]!);
        expect(prevDir.length).toBeGreaterThanOrEqual(currDir.length);
      }
    },
  );
});

// ─── Property 4: Log tail search with exclusion filter ─────────────────

// Feature: als-file-path-resolution, Property 4: Log tail search with exclusion filter
describe("Property 4: Log tail search with exclusion filter", () => {
  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any string containing one or more lines matching
   * `Loading document "<path>.als"`, parseLogForAlsPath SHALL return the path
   * from the last matching line that does NOT contain "DefaultLiveSet.als" or
   * "Templates". If all matching lines are excluded, it SHALL return undefined.
   */

  /** Generate a valid (non-excluded) .als path for log entries. */
  const validAlsPathArbitrary = fc.array(pathSegmentArbitrary, { minLength: 1, maxLength: 4 })
    .map((segments) => segments.join("\\"))
    .filter((p) => !p.includes("DefaultLiveSet") && !p.includes("Templates"))
    .map((p) => `${p}\\MyProject.als`);

  /** Generate an excluded .als path (contains DefaultLiveSet.als or Templates). */
  const excludedAlsPathArbitrary = fc.oneof(
    pathSegmentArbitrary.map((seg) => `${seg}\\DefaultLiveSet.als`),
    pathSegmentArbitrary.map((seg) => `${seg}\\Templates\\SomeSet.als`),
  );

  /** Generate a noise line that does NOT match the Loading document pattern. */
  const noiseLineArbitrary = fc.stringOf(
    fc.char().filter((c) => c !== "\n" && c !== "\r" && c !== "\0"),
    { minLength: 0, maxLength: 60 },
  ).filter((line) => !line.includes("Loading document"));

  test.prop(
    [
      // 0-5 valid Loading document lines
      fc.array(validAlsPathArbitrary, { minLength: 0, maxLength: 5 }),
      // 0-5 excluded Loading document lines
      fc.array(excludedAlsPathArbitrary, { minLength: 0, maxLength: 5 }),
      // 0-10 noise lines to intersperse
      fc.array(noiseLineArbitrary, { minLength: 0, maxLength: 10 }),
      // Shuffle seed for ordering
      fc.shuffledSubarray(
        Array.from({ length: 20 }, (_, i) => i),
        { minLength: 0, maxLength: 20 },
      ),
    ],
    { numRuns: 100 },
  )(
    "returns the last non-excluded match or undefined if all excluded",
    (validPaths, excludedPaths, noiseLines, _shuffleHint) => {
      // Build log content: interleave valid entries, excluded entries, and noise
      const lines: string[] = [];

      // Add noise lines first
      for (const noise of noiseLines) {
        lines.push(noise);
      }

      // Add excluded entries
      for (const excluded of excludedPaths) {
        lines.push(`Loading document "${excluded}"`);
        // Add some noise after
        if (noiseLines.length > 0) {
          lines.push(noiseLines[0]!);
        }
      }

      // Add valid entries LAST (so the last valid one is what we expect)
      for (const valid of validPaths) {
        lines.push(`Loading document "${valid}"`);
      }

      const logContent = lines.join("\n");

      const result = parseLogForAlsPath(logContent);

      if (validPaths.length === 0) {
        // No valid entries → should return undefined
        expect(result).toBeUndefined();
      } else {
        // Should return the LAST valid entry
        const expectedPath = validPaths[validPaths.length - 1];
        expect(result).toBe(expectedPath);
      }
    },
  );

  test.prop(
    [
      // Generate content with ONLY excluded entries
      fc.array(excludedAlsPathArbitrary, { minLength: 1, maxLength: 5 }),
      fc.array(noiseLineArbitrary, { minLength: 0, maxLength: 5 }),
    ],
    { numRuns: 100 },
  )(
    "returns undefined when all matches are excluded",
    (excludedPaths, noiseLines) => {
      const lines: string[] = [...noiseLines];
      for (const excluded of excludedPaths) {
        lines.push(`Loading document "${excluded}"`);
      }

      const logContent = lines.join("\n");
      const result = parseLogForAlsPath(logContent);

      expect(result).toBeUndefined();
    },
  );
});

// ─── Property 7: Normalization idempotence ─────────────────────────────

// Feature: als-file-path-resolution, Property 7: Normalization idempotence
describe("Property 7: Normalization idempotence", () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any file path string, applying normalizePath twice SHALL produce the
   * same result as applying it once: normalizePath(normalizePath(p)) === normalizePath(p).
   */

  /** Generate paths with mixed separators, spaces, and unicode. */
  const mixedPathArbitrary = fc.array(
    fc.oneof(
      pathSegmentArbitrary,
      fc.constant("/"),
      fc.constant("\\"),
      fc.constant(" "),
      fc.unicodeString({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
    ),
    { minLength: 1, maxLength: 10 },
  ).map((parts) => parts.join(""));

  test.prop(
    [mixedPathArbitrary],
    { numRuns: 100 },
  )(
    "normalizePath is idempotent: applying twice equals applying once",
    (filePath) => {
      const once = normalizePath(filePath);
      const twice = normalizePath(once);

      expect(twice).toBe(once);
    },
  );

  test.prop(
    [
      // Generate paths with explicit mixed separators
      fc.array(pathSegmentArbitrary, { minLength: 2, maxLength: 8 }),
      fc.array(separatorArbitrary, { minLength: 8, maxLength: 8 }),
    ],
    { numRuns: 100 },
  )(
    "normalizePath converts all separators to platform-native",
    (segments, separators) => {
      // Join segments with mixed separators
      let filePath = segments[0]!;
      for (let i = 1; i < segments.length; i++) {
        filePath += separators[i % separators.length]! + segments[i]!;
      }

      const result = normalizePath(filePath);

      // After normalization, no non-native separators should remain
      const nonNativeSep = path.sep === "/" ? "\\" : "/";
      expect(result).not.toContain(nonNativeSep);

      // Idempotence still holds
      expect(normalizePath(result)).toBe(result);
    },
  );
});
