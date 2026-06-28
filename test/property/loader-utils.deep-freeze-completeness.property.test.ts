import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { deepFreeze } from '../../src/core/loader-utils.js';

/**
 * Validates: Requirements 1.3, 6.3
 *
 * Property 1: Deep-freeze completeness
 * After calling deepFreeze on any nested object/array structure,
 * Object.isFrozen(node) === true for every reachable object/array node.
 */

/**
 * Recursively checks that every reachable object/array node is frozen.
 */
function assertAllFrozen(node: unknown): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  expect(Object.isFrozen(node)).toBe(true);
  if (Array.isArray(node)) {
    for (const item of node) {
      assertAllFrozen(item);
    }
  } else {
    for (const key of Object.getOwnPropertyNames(node)) {
      assertAllFrozen((node as Record<string, unknown>)[key]);
    }
  }
}

describe('Feature: loader-utils-extraction, Property 1: Deep-freeze completeness', () => {
  test.prop(
    [fc.anything({ maxDepth: 5 }).filter((val): val is object => typeof val === 'object' && val !== null)],
    { numRuns: 100 }
  )(
    'deepFreeze makes all nested objects and arrays frozen',
    (obj) => {
      deepFreeze(obj);
      assertAllFrozen(obj);
    }
  );

  test.prop(
    [fc.dictionary(fc.string(), fc.anything({ maxDepth: 3 }))],
    { numRuns: 100 }
  )(
    'deepFreeze freezes all nodes in dictionary-generated structures',
    (obj) => {
      deepFreeze(obj);
      assertAllFrozen(obj);
    }
  );

  test.prop(
    [fc.array(fc.record({ key: fc.string(), nested: fc.array(fc.integer()) }), { minLength: 1, maxLength: 10 })],
    { numRuns: 100 }
  )(
    'deepFreeze freezes all nodes in array-of-objects structures',
    (arr) => {
      deepFreeze(arr);
      assertAllFrozen(arr);
    }
  );
});
