/**
 * Property-based tests for the ALS Path Resolver module.
 *
 * Feature: als-file-path-resolution, Property 6: Exception resilience
 *
 * Validates: Requirements 5.2
 *
 * Verifies that for any strategy function that throws an arbitrary Error,
 * the Path_Resolver SHALL catch the exception and proceed to the next strategy
 * without itself throwing. The resolver SHALL never propagate exceptions from
 * individual strategies to its caller.
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

import {
  createAlsPathResolver,
  type PathResolverConfig,
  type ResolutionResult,
} from "./als-path-resolver.js";

// ─── Mock fs module ────────────────────────────────────────────────────

vi.mock("fs", () => ({
  openSync: vi.fn(() => {
    throw new Error("mocked: openSync not available");
  }),
  closeSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isFile: () => false, size: 0, mtimeMs: 0 })),
  readSync: vi.fn(() => 0),
  readFileSync: vi.fn(() => {
    throw new Error("mocked: no cache file");
  }),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a random error message for thrown errors. */
const errorMessageArb = fc.string({ minLength: 0, maxLength: 100 });

/** Generate a random Error instance with a random message. */
const errorArb = errorMessageArb.map((msg) => new Error(msg));

/** Generate a random error code string (mimicking Node.js error codes). */
const errorCodeArb = fc.constantFrom(
  "EACCES",
  "ENOENT",
  "EPERM",
  "ERR_ACCESS_DENIED",
  "ENOTDIR",
  "EMFILE",
  "EIO",
  "UNKNOWN",
);

/** Generate a Node.js-style system error with a code property. */
const systemErrorArb = fc.tuple(errorMessageArb, errorCodeArb).map(([msg, code]) => {
  const err = new Error(msg) as Error & { code: string };
  err.code = code;
  return err;
});

/** Generate any kind of error (regular or system-style). */
const anyErrorArb = fc.oneof(errorArb, systemErrorArb);

/** Which strategies to make throw (bit flags). */
const throwPositionArb = fc.record({
  getAudioClipPaths: fc.boolean(),
  showFileDialog: fc.boolean(),
  getSongFingerprint: fc.boolean(),
});

// ─── Property 6: Exception resilience ──────────────────────────────────

// Feature: als-file-path-resolution, Property 6: Exception resilience
describe("Property 6: Exception resilience", () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any strategy function that throws an arbitrary Error, the Path_Resolver
   * SHALL catch the exception and proceed to the next strategy without itself
   * throwing. The resolver SHALL never propagate exceptions from individual
   * strategies to its caller.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop(
    [anyErrorArb, throwPositionArb],
    { numRuns: 100 },
  )(
    "resolve() never throws when config methods throw random errors",
    async (error, positions) => {
      const config: PathResolverConfig = {
        storageDirectory: positions.getAudioClipPaths ? "/fake/storage" : undefined,
        getAudioClipPaths: positions.getAudioClipPaths
          ? () => { throw error; }
          : () => [],
        showFileDialog: positions.showFileDialog
          ? () => Promise.reject(error)
          : () => Promise.resolve(undefined),
        getSongFingerprint: positions.getSongFingerprint
          ? () => { throw error; }
          : () => "test-fingerprint",
      };

      const resolver = createAlsPathResolver(config);

      // resolve() must not throw — it should always return a ResolutionResult
      let result: ResolutionResult;
      try {
        const maybePromise = resolver.resolve();
        if (maybePromise instanceof Promise) {
          result = await maybePromise;
        } else {
          result = maybePromise;
        }
      } catch (e) {
        // This must never happen — the resolver should catch all errors
        expect.fail(
          `resolve() threw an exception: ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }

      // The result must be a valid ResolutionResult
      expect(result).toBeDefined();
      expect(result).toHaveProperty("path");
      expect(result).toHaveProperty("source");
      expect(["cache", "audioclip", "log", "dialog", "none"]).toContain(result.source);
    },
  );

  test.prop(
    [anyErrorArb],
    { numRuns: 100 },
  )(
    "resolve() never throws when ALL config methods throw simultaneously",
    async (error) => {
      const config: PathResolverConfig = {
        storageDirectory: "/fake/storage",
        getAudioClipPaths: () => { throw error; },
        showFileDialog: () => Promise.reject(error),
        getSongFingerprint: () => { throw error; },
      };

      const resolver = createAlsPathResolver(config);

      let result: ResolutionResult;
      try {
        const maybePromise = resolver.resolve();
        if (maybePromise instanceof Promise) {
          result = await maybePromise;
        } else {
          result = maybePromise;
        }
      } catch (e) {
        expect.fail(
          `resolve() threw when all methods throw: ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }

      // Must return a valid result (path may be undefined, but structure is correct)
      expect(result).toBeDefined();
      expect(result).toHaveProperty("path");
      expect(result).toHaveProperty("source");
      expect(["cache", "audioclip", "log", "dialog", "none"]).toContain(result.source);
    },
  );

  test.prop(
    [anyErrorArb],
    { numRuns: 100 },
  )(
    "invalidateCache() never throws even when storageDirectory causes errors",
    (error) => {
      // Test with storageDirectory that will cause issues
      const config: PathResolverConfig = {
        storageDirectory: "/nonexistent/problematic/path",
        getAudioClipPaths: () => [],
        showFileDialog: () => Promise.resolve(undefined),
        getSongFingerprint: () => { throw error; },
      };

      const resolver = createAlsPathResolver(config);

      // invalidateCache() must never throw
      expect(() => resolver.invalidateCache()).not.toThrow();
    },
  );

  test.prop(
    [
      anyErrorArb,
      fc.constantFrom("getAudioClipPaths", "showFileDialog", "getSongFingerprint" as const),
    ],
    { numRuns: 100 },
  )(
    "resolve() returns a ResolutionResult regardless of which single strategy throws",
    async (error, throwingMethod) => {
      const config: PathResolverConfig = {
        storageDirectory: "/fake/storage",
        getAudioClipPaths:
          throwingMethod === "getAudioClipPaths"
            ? () => { throw error; }
            : () => [],
        showFileDialog:
          throwingMethod === "showFileDialog"
            ? () => Promise.reject(error)
            : () => Promise.resolve(undefined),
        getSongFingerprint:
          throwingMethod === "getSongFingerprint"
            ? () => { throw error; }
            : () => "fingerprint-ok",
      };

      const resolver = createAlsPathResolver(config);

      let result: ResolutionResult;
      try {
        const maybePromise = resolver.resolve();
        if (maybePromise instanceof Promise) {
          result = await maybePromise;
        } else {
          result = maybePromise;
        }
      } catch (e) {
        expect.fail(
          `resolve() threw when ${throwingMethod} throws: ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }

      // Must always return a valid ResolutionResult structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty("path");
      expect(result).toHaveProperty("source");
      expect(["cache", "audioclip", "log", "dialog", "none"]).toContain(result.source);
      // path must be either string or undefined
      expect(
        result.path === undefined || typeof result.path === "string",
      ).toBe(true);
    },
  );
});
