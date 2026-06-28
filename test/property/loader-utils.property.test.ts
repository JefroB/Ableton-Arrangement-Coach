import { describe, it, expect, vi } from 'vitest';
import { deepFreeze, createFailHelper } from '../../src/core/loader-utils.js';

describe('deepFreeze', () => {
  it('should freeze an empty object', () => {
    const obj = {};
    const result = deepFreeze(obj);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toBe(obj);
  });

  it('should freeze an array with nested objects', () => {
    const arr = [1, 'a', { x: 2 }];
    const result = deepFreeze(arr);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[2])).toBe(true);
    expect(result).toBe(arr);
    expect(result[2]).toBe(arr[2]);
  });

  it('should handle null properties gracefully', () => {
    const obj = { a: null, b: 'test' };
    const result = deepFreeze(obj);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.a).toBe(null);
    expect(result.b).toBe('test');
  });

  it('should not re-freeze already frozen objects', () => {
    const nestedObj = { x: 1 };
    Object.freeze(nestedObj);
    
    const spy = vi.spyOn(Object, 'freeze');
    const obj = { a: nestedObj };
    const result = deepFreeze(obj);
    
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.a)).toBe(true);
    expect(spy).not.toHaveBeenCalledWith(nestedObj);
    spy.mockRestore();
  });
});

describe('createFailHelper', () => {
  const testFiles = [
    'archetype-config.json',
    'chart-colors.json',
    'frequency-bands.json',
    'alignment-weights.json',
    'mode-selector-thresholds.json',
    'role-classification.json',
    'content-classification.json',
    'automation-patterns.json',
    'dj-scorer-config.json',
    'track-patterns.json',
    'issue-thresholds.json',
    'energy-weights.json'
  ];

  testFiles.forEach(filename => {
    it(`should produce error messages in correct format for ${filename}`, () => {
      const fail = createFailHelper(filename);
      expect(() => fail('field.path', 'constraint')).toThrow(
        `${filename}: validation failed: field.path — constraint`
      );
    });
  });

  it('should produce distinct functions for different filenames', () => {
    const fail1 = createFailHelper('file1.json');
    const fail2 = createFailHelper('file2.json');
    
    expect(() => fail1('field', 'constraint')).toThrow('file1.json: validation failed: field — constraint');
    expect(() => fail2('field', 'constraint')).toThrow('file2.json: validation failed: field — constraint');
  });
});