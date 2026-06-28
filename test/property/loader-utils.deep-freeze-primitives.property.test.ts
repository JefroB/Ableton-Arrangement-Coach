import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { deepFreeze } from '../../src/core/loader-utils.js';

describe('Feature: loader-utils-extraction, Property 4: Deep-freeze primitive pass-through', () => {
  /**
   * Primitives (number, string, boolean, null, undefined) pass through deepFreeze unchanged.
   *
   * **Validates: Requirements 1.2**
   */
  test.prop(
    [fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null), fc.constant(undefined))],
    { numRuns: 100 },
  )(
    'deepFreeze(primitive) === primitive (strict equality)',
    (value) => {
      expect(deepFreeze(value)).toBe(value);
    },
  );
});