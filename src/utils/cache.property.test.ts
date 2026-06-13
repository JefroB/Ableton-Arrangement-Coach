/**
 * Property-based tests for the Analysis Cache utility.
 *
 * Feature: m8-polish, Property 8: Cache returns same result for same key
 *
 * Validates: Requirements 6.2, 6.5
 *
 * Verifies that for any cache key K and value V:
 * - After cache.set(K, V), cache.get(K) returns { key: K, value: V }
 * - After cache.invalidate(), cache.get(K) returns undefined
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { createAnalysisCache } from "./cache.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary non-empty string keys (simulating cache key patterns). */
const cacheKeyArb = fc.string({ minLength: 1, maxLength: 200 });

/** Arbitrary JSON-serializable values (simulating cached analysis results). */
const cacheValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.integer(), { maxLength: 10 }),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.integer(), {
    maxKeys: 5,
  }),
);

// ─── Property 8: Cache returns same result for same key ────────────────

// Feature: m8-polish, Property 8: Cache returns same result for same key
describe("Property 8: Cache returns same result for same key", () => {
  /**
   * **Validates: Requirements 6.2, 6.5**
   *
   * For any cache key K and value V, after cache.set(K, V),
   * cache.get(K) SHALL return { key: K, value: V }.
   * After cache.invalidate(), cache.get(K) SHALL return undefined.
   */
  test.prop([cacheKeyArb, cacheValueArb], { numRuns: 100 })(
    "set(K, V) then get(K) returns { key: K, value: V }",
    (key, value) => {
      const cache = createAnalysisCache();
      cache.set(key, value);

      const result = cache.get(key);
      expect(result).not.toBeUndefined();
      expect(result!.key).toBe(key);
      expect(result!.value).toEqual(value);
    },
  );

  test.prop([cacheKeyArb, cacheValueArb], { numRuns: 100 })(
    "after invalidate(), get(K) returns undefined",
    (key, value) => {
      const cache = createAnalysisCache();
      cache.set(key, value);

      // Verify it was stored
      expect(cache.get(key)).not.toBeUndefined();

      // Invalidate
      cache.invalidate();

      // Verify it's gone
      expect(cache.get(key)).toBeUndefined();
    },
  );

  test.prop(
    [cacheKeyArb, cacheValueArb, cacheValueArb],
    { numRuns: 100 },
  )(
    "set(K, V1) then set(K, V2) returns V2 on get(K)",
    (key, value1, value2) => {
      const cache = createAnalysisCache();
      cache.set(key, value1);
      cache.set(key, value2);

      const result = cache.get(key);
      expect(result).not.toBeUndefined();
      expect(result!.key).toBe(key);
      expect(result!.value).toEqual(value2);
    },
  );

  test.prop(
    [
      fc.array(fc.tuple(cacheKeyArb, cacheValueArb), {
        minLength: 1,
        maxLength: 20,
      }),
    ],
    { numRuns: 100 },
  )(
    "multiple keys are independently stored and retrieved",
    (entries) => {
      const cache = createAnalysisCache();

      // Set all entries
      for (const [key, value] of entries) {
        cache.set(key, value);
      }

      // For each unique key, the last-set value should be returned
      const lastValues = new Map<string, unknown>();
      for (const [key, value] of entries) {
        lastValues.set(key, value);
      }

      for (const [key, expectedValue] of lastValues) {
        const result = cache.get(key);
        expect(result).not.toBeUndefined();
        expect(result!.key).toBe(key);
        expect(result!.value).toEqual(expectedValue);
      }
    },
  );

  test.prop([cacheKeyArb], { numRuns: 100 })(
    "get(K) returns undefined for keys never set",
    (key) => {
      const cache = createAnalysisCache();
      expect(cache.get(key)).toBeUndefined();
    },
  );
});
