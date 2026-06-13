/**
 * Property-based tests for the Project Key Derivation utility.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { deriveProjectKey } from "../../src/utils/project-key.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-empty string representing a file path. */
const nonEmptyFilePathArbitrary = fc.string({ minLength: 1 });

/**
 * Generate a pair of distinct non-empty file path strings.
 * Filtered to ensure the two paths are not equal.
 */
const distinctFilePathPairArbitrary = fc
  .tuple(
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
  )
  .filter(([a, b]) => a !== b);

// ─── Property 12: Project key derivation ───────────────────────────────

// Feature: m5-notes-checklist, Property 12: Project key derivation
describe("Property 12: Project key derivation", () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any non-empty file path string, deriveProjectKey SHALL produce
   * a string that contains only filesystem-safe characters: alphanumeric,
   * hyphens (`-`), and underscores (`_`).
   */
  test.prop([nonEmptyFilePathArbitrary], { numRuns: 100 })(
    "output contains only filesystem-safe characters [a-zA-Z0-9_-]",
    (filePath) => {
      const key = deriveProjectKey(filePath);
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    },
  );

  /**
   * **Validates: Requirements 4.1**
   *
   * For any non-empty file path string, deriveProjectKey SHALL produce
   * a string that is at most 128 characters long.
   */
  test.prop([nonEmptyFilePathArbitrary], { numRuns: 100 })(
    "output length is at most 128 characters",
    (filePath) => {
      const key = deriveProjectKey(filePath);
      expect(key.length).toBeLessThanOrEqual(128);
    },
  );

  /**
   * **Validates: Requirements 4.1**
   *
   * For any non-empty file path string, deriveProjectKey SHALL be
   * deterministic: calling it twice with the same input produces the
   * same output.
   */
  test.prop([nonEmptyFilePathArbitrary], { numRuns: 100 })(
    "same input always produces same output (deterministic)",
    (filePath) => {
      const key1 = deriveProjectKey(filePath);
      const key2 = deriveProjectKey(filePath);
      expect(key1).toBe(key2);
    },
  );

  /**
   * **Validates: Requirements 4.1**
   *
   * For any two distinct non-empty file path strings, deriveProjectKey
   * SHALL produce distinct outputs.
   */
  test.prop([distinctFilePathPairArbitrary], { numRuns: 100 })(
    "distinct inputs produce distinct outputs",
    ([pathA, pathB]) => {
      const keyA = deriveProjectKey(pathA);
      const keyB = deriveProjectKey(pathB);
      expect(keyA).not.toBe(keyB);
    },
  );
});
