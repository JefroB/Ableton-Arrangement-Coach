// --- src/test/deep-freeze.property.test.ts ---
/**
 * Deep-freeze immutability property test.
 *
 * **Validates: Requirements 1.13, 2.11, 3.7, 4.6, 5.6**
 *
 * Verifies that all 5 loader modules return deeply frozen objects.
 * Mutations are attempted and verified to have no effect.
 */
import { describe, it, expect } from 'vitest';
import {
  getArchetypePriority,
  getScoringThresholds,
} from '../core/archetype-config-loader.js';
import {
  getEnergyColors,
  getDjScoreClasses,
} from '../core/ui-colors-loader.js';
import {
  getFrequencyBands,
  FREQUENCY_BANDS,
} from '../core/frequency-bands-loader.js';
import {
  getAlignmentWeights,
} from '../core/alignment-weights-loader.js';
import {
  getModeSelectorThresholds,
} from '../core/mode-selector-loader.js';

describe('Deep freeze validation - Archetype Config Loader', () => {
  it('getArchetypePriority returns deeply frozen array', () => {
    const priority = getArchetypePriority();
    
    // Assert the top-level array is frozen
    expect(Object.isFrozen(priority)).toBe(true);
    
    // Assert all elements are strings (no mutation possible)
    for (const item of priority) {
      expect(typeof item).toBe('string');
    }
    
    // Attempt to mutate the array
    const originalLength = priority.length;
    try {
      (priority as unknown as string[]).push('test');
    } catch (e) {
      // Expected - array is frozen
    }
    
    // Verify the array was not modified
    expect(priority.length).toBe(originalLength);
  });

  it('getScoringThresholds returns deeply frozen object', () => {
    const thresholds = getScoringThresholds();
    
    // Assert the top-level object is frozen
    expect(Object.isFrozen(thresholds)).toBe(true);
    
    // Assert nested objects are frozen
    expect(Object.isFrozen(thresholds.djTool)).toBe(true);
    expect(Object.isFrozen(thresholds.peakValley)).toBe(true);
    expect(Object.isFrozen(thresholds.verseChorus)).toBe(true);
    expect(Object.isFrozen(thresholds.buildDrop)).toBe(true);
    expect(Object.isFrozen(thresholds.continuousEvolution)).toBe(true);
    expect(Object.isFrozen(thresholds.loop)).toBe(true);
    
    // Assert all nested properties are frozen
    const djTool = thresholds.djTool;
    expect(Object.isFrozen(djTool)).toBe(true);
    
    const peakValley = thresholds.peakValley;
    expect(Object.isFrozen(peakValley)).toBe(true);
    
    const verseChorus = thresholds.verseChorus;
    expect(Object.isFrozen(verseChorus)).toBe(true);
    
    const buildDrop = thresholds.buildDrop;
    expect(Object.isFrozen(buildDrop)).toBe(true);
    
    const continuousEvolution = thresholds.continuousEvolution;
    expect(Object.isFrozen(continuousEvolution)).toBe(true);
    
    const loop = thresholds.loop;
    expect(Object.isFrozen(loop)).toBe(true);
    
    // Attempt to mutate the top-level object
    try {
      (thresholds as any).newField = 'test';
    } catch (e) {
      // Expected - object is frozen
    }
    
    // Verify the object was not modified
    expect((thresholds as any).newField).toBeUndefined();
  });
});

describe('Deep freeze validation - UI Colors Loader', () => {
  it('getEnergyColors returns deeply frozen array', () => {
    const energyColors = getEnergyColors();
    
    // Assert the top-level array is frozen
    expect(Object.isFrozen(energyColors)).toBe(true);
    
    // Assert each element in the array is frozen
    for (const entry of energyColors) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(typeof entry.maxScore).toBe('number');
      expect(typeof entry.color).toBe('string');
    }
    
    // Attempt to mutate the array
    const originalLength = energyColors.length;
    try {
      (energyColors as unknown as Array<{maxScore: number; color: string}>).push({ maxScore: 11, color: '#ffffff' });
    } catch (e) {
      // Expected - array is frozen
    }
    
    // Verify the array was not modified
    expect(energyColors.length).toBe(originalLength);
  });

  it('getDjScoreClasses returns deeply frozen array', () => {
    const djScoreClasses = getDjScoreClasses();
    
    // Assert the top-level array is frozen
    expect(Object.isFrozen(djScoreClasses)).toBe(true);
    
    // Assert each element in the array is frozen
    for (const entry of djScoreClasses) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(typeof entry.minScore).toBe('number');
      expect(typeof entry.className).toBe('string');
    }
    
    // Attempt to mutate the array
    const originalLength = djScoreClasses.length;
    try {
      (djScoreClasses as unknown as Array<{minScore: number; className: string}>).push({ minScore: -1, className: 'test-class' });
    } catch (e) {
      // Expected - array is frozen
    }
    
    // Verify the array was not modified
    expect(djScoreClasses.length).toBe(originalLength);
  });
});

describe('Deep freeze validation - Frequency Bands Loader', () => {
  it('getFrequencyBands returns deeply frozen array', () => {
    const bands = getFrequencyBands();
    
    // Assert the top-level array is frozen
    expect(Object.isFrozen(bands)).toBe(true);
    
    // Assert each element in the array is frozen
    for (const band of bands) {
      expect(Object.isFrozen(band)).toBe(true);
      expect(typeof band.name).toBe('string');
      expect(typeof band.lowHz).toBe('number');
      expect(typeof band.highHz).toBe('number');
    }
    
    // Attempt to mutate the array
    const originalLength = bands.length;
    try {
      (bands as unknown as Array<{name: string; lowHz: number; highHz: number}>).push({ name: 'test', lowHz: 0, highHz: 100 });
    } catch (e) {
      // Expected - array is frozen
    }
    
    // Verify the array was not modified
    expect(bands.length).toBe(originalLength);
  });

  it('FREQUENCY_BANDS returns deeply frozen array', () => {
    const bands = FREQUENCY_BANDS;
    
    // Assert the top-level array is frozen
    expect(Object.isFrozen(bands)).toBe(true);
    
    // Assert each element in the array is frozen
    for (const band of bands) {
      expect(Object.isFrozen(band)).toBe(true);
      expect(typeof band.name).toBe('string');
      expect(typeof band.lowHz).toBe('number');
      expect(typeof band.highHz).toBe('number');
    }
    
    // Attempt to mutate the array
    const originalLength = bands.length;
    try {
      (bands as unknown as Array<{name: string; lowHz: number; highHz: number}>).push({ name: 'test', lowHz: 0, highHz: 100 });
    } catch (e) {
      // Expected - array is frozen
    }
    
    // Verify the array was not modified
    expect(bands.length).toBe(originalLength);
  });
});

describe('Deep freeze validation - Alignment Weights Loader', () => {
  it('getAlignmentWeights returns deeply frozen object', () => {
    const weights = getAlignmentWeights();
    
    // Assert the top-level object is frozen
    expect(Object.isFrozen(weights)).toBe(true);
    
    // Assert properties are frozen
    expect(typeof weights.ordering).toBe('number');
    expect(typeof weights.length).toBe('number');
    expect(typeof weights.count).toBe('number');
    
    // Attempt to mutate the object
    try {
      (weights as any).newField = 999;
    } catch (e) {
      // Expected - object is frozen
    }
    
    // Verify the object was not modified
    expect((weights as any).newField).toBeUndefined();
  });
});

describe('Deep freeze validation - Mode Selector Loader', () => {
  it('getModeSelectorThresholds returns deeply frozen object', () => {
    const thresholds = getModeSelectorThresholds();
    
    // Assert the top-level object is frozen
    expect(Object.isFrozen(thresholds)).toBe(true);
    
    // Assert properties are frozen
    expect(typeof thresholds.clipCountThreshold).toBe('number');
    expect(typeof thresholds.coverageThreshold).toBe('number');
    
    // Attempt to mutate the object
    try {
      (thresholds as any).newField = 999;
    } catch (e) {
      // Expected - object is frozen
    }
    
    // Verify the object was not modified
    expect((thresholds as any).newField).toBeUndefined();
  });
});