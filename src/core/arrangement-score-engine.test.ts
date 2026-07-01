import { describe, it, expect } from "vitest";
import { interpolateCurve, computeArrangementScore } from "./arrangement-score-engine.js";

describe("interpolateCurve", () => {
  it("returns empty array for empty source", () => {
    expect(interpolateCurve([], 5)).toEqual([]);
  });

  it("returns empty array for targetLength <= 0", () => {
    expect(interpolateCurve([1, 2, 3], 0)).toEqual([]);
    expect(interpolateCurve([1, 2, 3], -1)).toEqual([]);
  });

  it("returns single element for targetLength 1", () => {
    expect(interpolateCurve([3, 7, 5], 1)).toEqual([3]);
  });

  it("repeats single-element source to fill targetLength", () => {
    expect(interpolateCurve([5], 4)).toEqual([5, 5, 5, 5]);
  });

  it("returns a copy when targetLength equals source length", () => {
    const source = [1, 5, 3, 8];
    const result = interpolateCurve(source, 4);
    expect(result).toEqual([1, 5, 3, 8]);
    // Should be a copy, not the same reference
    expect(result).not.toBe(source);
  });

  it("interpolates to a longer target length", () => {
    // [1, 10] → 5 elements should give [1, 3.25, 5.5, 7.75, 10]
    const result = interpolateCurve([1, 10], 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(3.25);
    expect(result[2]).toBeCloseTo(5.5);
    expect(result[3]).toBeCloseTo(7.75);
    expect(result[4]).toBeCloseTo(10);
  });

  it("interpolates to a shorter target length", () => {
    // [0, 5, 10] → 2 elements should give [0, 10] (endpoints)
    const result = interpolateCurve([0, 5, 10], 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(10);
  });

  it("preserves bounds — all output values within [min, max] of source", () => {
    const source = [3, 7, 2, 9, 4];
    const result = interpolateCurve(source, 10);
    const min = Math.min(...source);
    const max = Math.max(...source);
    for (const val of result) {
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(max);
    }
  });

  it("produces exact output length", () => {
    expect(interpolateCurve([1, 2, 3, 4, 5], 8)).toHaveLength(8);
    expect(interpolateCurve([1, 2, 3, 4, 5], 3)).toHaveLength(3);
    expect(interpolateCurve([1, 2, 3, 4, 5], 20)).toHaveLength(20);
  });

  it("first and last elements match source endpoints", () => {
    const source = [2, 6, 4, 8];
    const result = interpolateCurve(source, 7);
    expect(result[0]).toBe(2);
    expect(result[result.length - 1]).toBe(8);
  });
});


describe("computeArrangementScore", () => {
  describe("null score edge cases", () => {
    it("returns null score when energyCurve has 0 sections", () => {
      const result = computeArrangementScore({ energyCurve: [], idealCurve: [5, 6, 7] });
      expect(result).toEqual({ score: null, shapeSimilarity: 0, absoluteProximity: 0 });
    });

    it("returns null score when energyCurve has 1 section", () => {
      const result = computeArrangementScore({ energyCurve: [5], idealCurve: [5, 6, 7] });
      expect(result).toEqual({ score: null, shapeSimilarity: 0, absoluteProximity: 0 });
    });

    it("returns null score when idealCurve is empty", () => {
      const result = computeArrangementScore({ energyCurve: [3, 5, 7], idealCurve: [] });
      expect(result).toEqual({ score: null, shapeSimilarity: 0, absoluteProximity: 0 });
    });
  });

  describe("identical curves", () => {
    it("returns score 10 when curves are identical", () => {
      const curve = [3, 5, 7, 8, 6];
      const result = computeArrangementScore({ energyCurve: curve, idealCurve: curve });
      expect(result.score).toBe(10);
      expect(result.shapeSimilarity).toBeCloseTo(1.0);
      expect(result.absoluteProximity).toBeCloseTo(1.0);
    });

    it("returns null score for constant identical curves (flat guard)", () => {
      const curve = [5, 5, 5, 5];
      const result = computeArrangementScore({ energyCurve: curve, idealCurve: curve });
      expect(result.score).toBeNull();
      expect(result.shapeSimilarity).toBe(0);
      expect(result.absoluteProximity).toBe(0);
    });
  });

  describe("score range and formula", () => {
    it("returns a score in [1, 10] for valid inputs", () => {
      const result = computeArrangementScore({ energyCurve: [1, 10, 1, 10], idealCurve: [10, 1, 10, 1] });
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it("score matches the formula: clamp(1, 10, round(raw * 9 + 1))", () => {
      const result = computeArrangementScore({ energyCurve: [2, 5, 8, 6], idealCurve: [3, 6, 9, 7] });
      const expectedRaw = 0.5 * result.shapeSimilarity + 0.5 * result.absoluteProximity;
      const expectedScore = Math.max(1, Math.min(10, Math.round(expectedRaw * 9 + 1)));
      expect(result.score).toBe(expectedScore);
    });
  });

  describe("normalization behavior", () => {
    it("slices idealCurve when energyCurve is shorter", () => {
      const energyCurve = [5, 7];
      const idealCurve = [5, 7, 9, 10];
      // Should only compare against [5, 7]
      const result = computeArrangementScore({ energyCurve, idealCurve });
      const truncatedResult = computeArrangementScore({ energyCurve, idealCurve: idealCurve.slice(0, 2) });
      expect(result.score).toBe(truncatedResult.score);
      expect(result.shapeSimilarity).toBeCloseTo(truncatedResult.shapeSimilarity);
      expect(result.absoluteProximity).toBeCloseTo(truncatedResult.absoluteProximity);
    });

    it("interpolates idealCurve when energyCurve is longer", () => {
      const energyCurve = [2, 4, 6, 8, 10];
      const idealCurve = [2, 10]; // will be interpolated to 5 elements: [2, 4, 6, 8, 10]
      const result = computeArrangementScore({ energyCurve, idealCurve });
      // After interpolation, ideal matches actual perfectly
      expect(result.score).toBe(10);
    });
  });

  describe("zero-length delta vectors (flat curves hit guard)", () => {
    it("returns null when all sections have same energy (flat guard)", () => {
      // Constant actual → flat curve guard returns null before reaching cosineSimilarity
      const result = computeArrangementScore({ energyCurve: [5, 5, 5], idealCurve: [3, 6, 9] });
      expect(result.score).toBeNull();
      expect(result.shapeSimilarity).toBe(0);
      expect(result.absoluteProximity).toBe(0);
    });

    it("returns null when both curves are constant (flat guard)", () => {
      const result = computeArrangementScore({ energyCurve: [5, 5, 5], idealCurve: [7, 7, 7] });
      // Both constant → energy curve is flat → guard triggers
      expect(result.score).toBeNull();
      expect(result.shapeSimilarity).toBe(0);
      expect(result.absoluteProximity).toBe(0);
    });
  });

  describe("determinism", () => {
    it("produces identical results for identical inputs", () => {
      const input = { energyCurve: [1, 4, 7, 3, 9], idealCurve: [2, 5, 8, 4, 10] };
      const result1 = computeArrangementScore(input);
      const result2 = computeArrangementScore(input);
      expect(result1).toEqual(result2);
    });
  });
});
