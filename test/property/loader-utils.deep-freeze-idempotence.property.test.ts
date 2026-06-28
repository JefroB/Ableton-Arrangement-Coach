/**
 * Property-based test for deep-freeze idempotence.
 *
 * Validates: Requirements 1.5
 */
import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { deepFreeze } from '../../src/core/loader-utils.js';

// ——— Generators ———————————————————————————————————————————————————————————————

/** Arbitrary object values (filters fc.anything() to non-null objects). */
const objectArb = fc.anything().filter(
  (val): val is object => typeof val === 'object' && val !== null,
);

/** Arbitrary plain dictionary objects. */
const dictionaryArb = fc.dictionary(fc.string(), fc.anything());

/** Arbitrary arrays of mixed values. */
const arrayArb = fc.array(fc.anything());

// ——— Property Tests ——————————————————————————————————————————————————————————

describe('Feature: loader-utils-extraction, Property 3: Deep-freeze idempotence', () => {
  /**
   * Applying deepFreeze twice returns the exact same reference as applying it once.
   * deepFreeze(deepFreeze(x)) === deepFreeze(x)
   *
   * Validates: Requirements 1.5
   */
  test.prop(
    [objectArb],
    { numRuns: 100 },
  )(
    'deepFreeze(deepFreeze(obj)) === deepFreeze(obj) for arbitrary objects',
    (obj) => {
      const frozenOnce = deepFreeze(obj);
      const frozenTwice = deepFreeze(frozenOnce);
      expect(frozenTwice).toBe(frozenOnce);
    },
  );

  test.prop(
    [dictionaryArb],
    { numRuns: 100 },
  )(
    'deepFreeze(deepFreeze(dict)) === deepFreeze(dict) for dictionaries',
    (dict) => {
      const frozenOnce = deepFreeze(dict);
      const frozenTwice = deepFreeze(frozenOnce);
      expect(frozenTwice).toBe(frozenOnce);
    },
  );

  test.prop(
    [arrayArb],
    { numRuns: 100 },
  )(
    'deepFreeze(deepFreeze(arr)) === deepFreeze(arr) for arrays',
    (arr) => {
      const frozenOnce = deepFreeze(arr);
      const frozenTwice = deepFreeze(frozenOnce);
      expect(frozenTwice).toBe(frozenOnce);
    },
  );
});