/**
 * Property-based test: Deep-freeze reference equality (in-place semantics).
 *
 * Validates: Requirements 6.4
 */
import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { deepFreeze } from '../../src/core/loader-utils.js';

// ——— Generators ———————————————————————————————————————————————————————————————

/** Arbitrary objects via fc.anything() filtered to non-null objects. */
const objectViaAnything = fc
  .anything()
  .filter((val): val is object => typeof val === 'object' && val !== null);

/** Arbitrary plain object via fc.dictionary. */
const objectViaDictionary = fc.dictionary(fc.string(), fc.anything());

/** Arbitrary array via fc.array. */
const objectViaArray = fc.array(fc.anything());

/** Combined generator producing objects from all three strategies. */
const arbitraryObject = fc.oneof(objectViaAnything, objectViaDictionary, objectViaArray);

// ——— Property Test ————————————————————————————————————————————————————————————

describe('Feature: loader-utils-extraction, Property 2: Deep-freeze reference equality', () => {
  test.prop(
    [arbitraryObject],
    { numRuns: 100 },
  )(
    'deepFreeze(obj) === obj (no cloning, in-place freeze)',
    (obj) => {
      const result = deepFreeze(obj);
      expect(result).toBe(obj);
    },
  );
});