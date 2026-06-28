import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { createFailHelper } from '../../src/core/loader-utils.js';

describe('Feature: loader-utils-extraction, Property 5: Fail helper error format', () => {
  test.prop(
    [fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))],
    { numRuns: 100 }
  )('should format error messages correctly', ([filename, fieldPath, constraint]) => {
    const fail = createFailHelper(filename);
    const errorMessage = `${filename}: validation failed: ${fieldPath} — ${constraint}`;
    
    expect(() => fail(fieldPath, constraint)).toThrow(errorMessage);
  });

  test.prop(
    [
      fc.tuple(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 })
      ).filter(([a, b]) => a !== b)
    ],
    { numRuns: 100 }
  )('should produce distinct error message prefixes for different filenames', ([filename1, filename2]) => {
    const fail1 = createFailHelper(filename1);
    const fail2 = createFailHelper(filename2);
    
    const errorMessage1 = `${filename1}: validation failed: field — constraint`;
    const errorMessage2 = `${filename2}: validation failed: field — constraint`;
    
    expect(() => fail1('field', 'constraint')).toThrow(errorMessage1);
    expect(() => fail2('field', 'constraint')).toThrow(errorMessage2);
    
    // Verify the prefixes are different
    expect(errorMessage1.startsWith(filename1 + ':')).toBe(true);
    expect(errorMessage2.startsWith(filename2 + ':')).toBe(true);
    expect(errorMessage1).not.toBe(errorMessage2);
  });
});