/**
 * Property-based tests for the ALS Path Cache module.
 *
 * Feature: als-file-path-resolution, Property 5: Cache persistence round-trip
 *
 * Validates: Requirements 4.1, 6.4
 *
 * Verifies that for any valid file path string (including paths with spaces,
 * unicode, CJK, emoji, and path separators), writing it with writeCachedPath
 * and reading it back with readCachedPath using the same fingerprint SHALL
 * return the exact original path string without corruption.
 */
import { test } from "@fast-check/vitest";
import { describe, expect, afterEach } from "vitest";
import fc from "fast-check";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readCachedPath, writeCachedPath } from "./als-path-cache.js";

// ─── Test Setup ────────────────────────────────────────────────────────

let tempDir: string;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), "als-cache-prop-"));
  return tempDir;
}

// ─── Generators ────────────────────────────────────────────────────────

/**
 * Generate unicode strings including spaces, CJK characters, emoji,
 * and path separators — simulating realistic file paths with special chars.
 */
const unicodePathArb = fc.stringOf(
  fc.oneof(
    // ASCII letters and digits
    fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
    // Spaces
    fc.constant(" "),
    // Path separators
    fc.constantFrom("/", "\\"),
    // Common path characters
    fc.constantFrom(".", "-", "_", ":", "(", ")"),
    // CJK characters (common range)
    fc.integer({ min: 0x4e00, max: 0x9fff }).map((cp) =>
      String.fromCodePoint(cp),
    ),
    // Emoji
    fc.constantFrom("🎵", "🎹", "🔊", "💿", "🎧", "🎶", "📁", "🗂️"),
    // Extended Latin (accented characters)
    fc.integer({ min: 0x00c0, max: 0x017f }).map((cp) =>
      String.fromCodePoint(cp),
    ),
  ),
  { minLength: 1, maxLength: 200 },
);

/** Non-empty fingerprint string. */
const fingerprintArb = fc.string({ minLength: 1, maxLength: 50 });

// ─── Property 5: Cache persistence round-trip ──────────────────────────

// Feature: als-file-path-resolution, Property 5: Cache persistence round-trip
describe("Property 5: Cache persistence round-trip", () => {
  /**
   * **Validates: Requirements 4.1, 6.4**
   *
   * For any valid file path string (including paths with spaces, unicode,
   * CJK, emoji, and path separators), writing it with writeCachedPath and
   * reading it back with readCachedPath using the same fingerprint SHALL
   * return the exact original path string without corruption.
   */
  test.prop([unicodePathArb, fingerprintArb], { numRuns: 100 })(
    "writeCachedPath then readCachedPath with same fingerprint returns exact original path",
    (alsPath, fingerprint) => {
      const storageDir = createTempDir();

      writeCachedPath(storageDir, alsPath, fingerprint);
      const result = readCachedPath(storageDir, fingerprint);

      expect(result).toBe(alsPath);
    },
  );
});
