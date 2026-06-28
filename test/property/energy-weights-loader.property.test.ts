/**
 * Property-based tests for Energy Weights Loader validation functions.
 *
 * Feature: default-energy-weights-externalization
 */
import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import {
  getBaseWeights,
  getAlsWeights,
  getAudioWeights,
  validateWeightSum,
} from '../../src/core/energy-weights-loader.js';
import type { EnergyWeights } from '../../src/core/genre-profile-types.js';

// ─── Generators ────────────────────────────────────────────────────────

/** Arbitrary non-negative float in [0, 1] range. */
const nonNegativeFloat = fc.float({ min: 0, max: 1, noNaN: true });

/** Arbitrary tuple of 8 non-negative floats. */
const weightTupleArb = fc.tuple(
  nonNegativeFloat,
  nonNegativeFloat,
  nonNegativeFloat,
  nonNegativeFloat,
  nonNegativeFloat,
  nonNegativeFloat,
  nonNegativeFloat,
  nonNegativeFloat
);

/** Arbitrary valid EnergyWeights object (8 required fields + optional audioEnergyWeight). */
const validEnergyWeightsArb = weightTupleArb.map(([a, b, c, d, e, f, g, h]) => {
  // Normalize to sum to 1.0
  const sum = a + b + c + d + e + f + g + h;
  const normalized = [
    a / sum,
    b / sum,
    c / sum,
    d / sum,
    e / sum,
    f / sum,
    g / sum,
    h / sum
  ];
  
  return {
    trackCountWeight: normalized[0],
    midiDensityWeight: normalized[1],
    trackPresenceWeight: normalized[2],
    automationWeight: normalized[3],
    frequencyCoverageWeight: normalized[4],
    velocityIntensityWeight: normalized[5],
    polyphonyScoreWeight: normalized[6],
    pitchRangeWeight: normalized[7],
  } as EnergyWeights;
});

/** Arbitrary invalid EnergyWeights object (8 required fields + optional audioEnergyWeight). */
const invalidEnergyWeightsArb = weightTupleArb
  .filter(([a, b, c, d, e, f, g, h]) => {
    const sum = a + b + c + d + e + f + g + h;
    return Math.abs(sum - 1.0) > 0.001;
  })
  .map(([a, b, c, d, e, f, g, h]) => {
    return {
      trackCountWeight: a,
      midiDensityWeight: b,
      trackPresenceWeight: c,
      automationWeight: d,
      frequencyCoverageWeight: e,
      velocityIntensityWeight: f,
      polyphonyScoreWeight: g,
      pitchRangeWeight: h,
    } as EnergyWeights;
  });

// ─── Property Tests ────────────────────────────────────────────────────

describe('Feature: default-energy-weights-externalization', () => {
  /**
   * Property 1: Base weights sum to 1.0
   * Validates: Feature: default-energy-weights-externalization, Property 1: Base weights sum to 1.0
   */
  test('Base weights sum to 1.0', () => {
    const weights = getBaseWeights();
    const sum = 
      weights.trackCountWeight +
      weights.midiDensityWeight +
      weights.trackPresenceWeight +
      weights.automationWeight +
      weights.frequencyCoverageWeight +
      weights.velocityIntensityWeight +
      weights.polyphonyScoreWeight +
      weights.pitchRangeWeight;
    
    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
  });

  /**
   * Property 2: ALS weights sum to 1.0
   * Validates: Feature: default-energy-weights-externalization, Property 2: ALS weights sum to 1.0
   */
  test('ALS weights sum to 1.0', () => {
    const weights = getAlsWeights();
    const sum = 
      weights.trackCountWeight +
      weights.midiDensityWeight +
      weights.trackPresenceWeight +
      weights.automationWeight +
      weights.frequencyCoverageWeight +
      weights.velocityIntensityWeight +
      weights.polyphonyScoreWeight +
      weights.pitchRangeWeight;
    
    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
  });

  /**
   * Property 3: Audio weights sum to 1.0
   * Validates: Feature: default-energy-weights-externalization, Property 3: Audio weights sum to 1.0
   */
  test('Audio weights sum to 1.0', () => {
    const weights = getAudioWeights();
    const sum = 
      weights.trackCountWeight +
      weights.midiDensityWeight +
      weights.trackPresenceWeight +
      weights.automationWeight +
      weights.frequencyCoverageWeight +
      weights.velocityIntensityWeight +
      weights.polyphonyScoreWeight +
      weights.pitchRangeWeight +
      (weights.audioEnergyWeight ?? 0);
    
    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
  });

  /**
   * Property 4: Random valid weight sets pass validation
   * Validates: Feature: default-energy-weights-externalization, Property 4: Valid weight sets pass sum validation
   */
  test.prop(
    [validEnergyWeightsArb],
    { numRuns: 100 }
  )('Valid weight sets pass sum validation', (weights) => {
    expect(() => validateWeightSum(weights, 'test')).not.toThrow();
  });

  /**
   * Property 5: Random invalid weight sets fail validation
   * Validates: Feature: default-energy-weights-externalization, Property 5: Invalid weight sets fail sum validation
   */
  test.prop(
    [invalidEnergyWeightsArb],
    { numRuns: 100 }
  )('Invalid weight sets fail sum validation', (weights) => {
    expect(() => validateWeightSum(weights, 'test')).toThrowError(/weight sum/);
  });

  /**
   * Property 6: Round-trip serialization
   * Validates: Feature: default-energy-weights-externalization, Property 6: Round-trip serialization
   */
  test('Round-trip serialization', () => {
    // Test base weights
    const baseWeights = getBaseWeights();
    const baseParsed = JSON.parse(JSON.stringify(baseWeights));
    expect(baseParsed).toEqual(baseWeights);

    // Test ALS weights
    const alsWeights = getAlsWeights();
    const alsParsed = JSON.parse(JSON.stringify(alsWeights));
    expect(alsParsed).toEqual(alsWeights);

    // Test audio weights
    const audioWeights = getAudioWeights();
    const audioParsed = JSON.parse(JSON.stringify(audioWeights));
    expect(audioParsed).toEqual(audioWeights);
  });
});