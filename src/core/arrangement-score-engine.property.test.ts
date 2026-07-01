/**
 * Property-based tests for the Arrangement Score Engine.
 *
 * Feature: arrangement-score
 *
 * Tests Properties 1–5 from the design document covering:
 * - Score range invariant and determinism
 * - Score formula consistency
 * - Identical curves yield maximum score
 * - Interpolation preserves length and bounds
 * - Truncation equivalence for shorter arrangements
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { interpolateCurve, computeArrangementScore, getScoreTier } from "./arrangement-score-engine.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Energy curve: array of integers 1–10, length 2–20. */
const energyCurveArb = fc.array(fc.integer({ min: 1, max: 10 }), {
  minLength: 2,
  maxLength: 20,
});

/** Ideal curve: array of integers 1–10, length 1–15. */
const idealCurveArb = fc.array(fc.integer({ min: 1, max: 10 }), {
  minLength: 1,
  maxLength: 15,
});

/** Source array for interpolation: length 2–15, values 1–10. */
const interpolationSourceArb = fc.array(fc.integer({ min: 1, max: 10 }), {
  minLength: 2,
  maxLength: 15,
});

/** Target length for interpolation: 2–30. */
const targetLengthArb = fc.integer({ min: 2, max: 30 });

// ─── Property 4: Interpolation preserves length and bounds ─────────────

// Feature: arrangement-score, Property 4: Interpolation preserves length and bounds
describe("Property 4: Interpolation preserves length and bounds", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any source array of length ≥ 2 with values in [1, 10] and any
   * target length in [2, 30], interpolateCurve SHALL return an array of
   * exactly targetLength elements, and every element SHALL be within
   * [min(source), max(source)].
   */
  test.prop([interpolationSourceArb, targetLengthArb], { numRuns: 100 })(
    "output length equals target length exactly",
    (source, targetLength) => {
      const result = interpolateCurve(source, targetLength);
      expect(result).toHaveLength(targetLength);
    },
  );

  test.prop([interpolationSourceArb, targetLengthArb], { numRuns: 100 })(
    "every output element is within [min(source), max(source)]",
    (source, targetLength) => {
      const result = interpolateCurve(source, targetLength);
      const min = Math.min(...source);
      const max = Math.max(...source);

      for (const val of result) {
        expect(val).toBeGreaterThanOrEqual(min);
        expect(val).toBeLessThanOrEqual(max);
      }
    },
  );
});

// ─── Property 1: Score range invariant ─────────────────────────────────

// Feature: arrangement-score, Property 1: Score range invariant
describe("Property 1: Score range invariant", () => {
  /**
   * **Validates: Requirements 1.2, 1.8**
   *
   * For any energy curve of length ≥ 2 with values in [1, 10] and any
   * ideal curve of length ≥ 1 with values in [1, 10], computeArrangementScore
   * SHALL return a non-null integer score in [1, 10], and calling the function
   * a second time with the same inputs SHALL produce an identical result.
   */
  test.prop([energyCurveArb, idealCurveArb], { numRuns: 100 })(
    "returns a non-null integer score in [1, 10]",
    (energyCurve, idealCurve) => {
      fc.pre(!energyCurve.every(v => v === energyCurve[0]));

      const result = computeArrangementScore({ energyCurve, idealCurve });

      expect(result.score).not.toBeNull();
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
    },
  );

  test.prop([energyCurveArb, idealCurveArb], { numRuns: 100 })(
    "calling twice with same inputs produces identical result (determinism)",
    (energyCurve, idealCurve) => {
      fc.pre(!energyCurve.every(v => v === energyCurve[0]));

      const input = { energyCurve, idealCurve };
      const result1 = computeArrangementScore(input);
      const result2 = computeArrangementScore(input);

      expect(result1).toEqual(result2);
    },
  );
});

// ─── Property 2: Score formula consistency ─────────────────────────────

// Feature: arrangement-score, Property 2: Score formula consistency
describe("Property 2: Score formula consistency", () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any valid energy curve and ideal curve inputs, the returned score
   * SHALL equal clamp(1, 10, Math.round((0.5 * shapeSimilarity + 0.5 * absoluteProximity) * 9 + 1))
   * where shapeSimilarity and absoluteProximity are the component values
   * also returned by the function.
   */
  test.prop([energyCurveArb, idealCurveArb], { numRuns: 100 })(
    "score equals clamp(1, 10, round((0.5 * shapeSimilarity + 0.5 * absoluteProximity) * 9 + 1))",
    (energyCurve, idealCurve) => {
      fc.pre(!energyCurve.every(v => v === energyCurve[0]));

      const result = computeArrangementScore({ energyCurve, idealCurve });

      const raw = 0.5 * result.shapeSimilarity + 0.5 * result.absoluteProximity;
      const expectedScore = Math.max(1, Math.min(10, Math.round(raw * 9 + 1)));

      expect(result.score).toBe(expectedScore);
    },
  );
});

// ─── Property 3: Identical curves yield maximum score ──────────────────

// Feature: arrangement-score, Property 3: Identical curves yield maximum score
describe("Property 3: Identical curves yield maximum score", () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any energy curve of length ≥ 2 with values in [1, 10], comparing
   * it against itself as the ideal curve SHALL produce a score of 10.
   */
  test.prop([energyCurveArb], { numRuns: 100 })(
    "score is 10 when energy curve is used as both actual and ideal",
    (energyCurve) => {
      fc.pre(!energyCurve.every(v => v === energyCurve[0])); // Precondition filter

      const result = computeArrangementScore({
        energyCurve,
        idealCurve: energyCurve,
      });

      expect(result.score).toBe(10);
    },
  );
});

// ─── Property 5: Truncation equivalence for shorter arrangements ───────

// Feature: arrangement-score, Property 5: Truncation equivalence for shorter arrangements
describe("Property 5: Truncation equivalence for shorter arrangements", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any ideal curve of length 4–15 and any energy curve shorter than
   * the ideal (length 2 to idealLen-1), the score produced by
   * computeArrangementScore({ energyCurve, idealCurve }) SHALL equal the
   * score produced by computeArrangementScore({ energyCurve, idealCurve: idealCurve.slice(0, energyCurve.length) }).
   */
  test.prop(
    [
      fc.integer({ min: 4, max: 15 }).chain((idealLen) =>
        fc.tuple(
          fc.array(fc.integer({ min: 1, max: 10 }), {
            minLength: 2,
            maxLength: idealLen - 1,
          }),
          fc.array(fc.integer({ min: 1, max: 10 }), {
            minLength: idealLen,
            maxLength: idealLen,
          }),
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "score with full ideal equals score with truncated ideal",
    ([energyCurve, idealCurve]) => {
      const fullResult = computeArrangementScore({ energyCurve, idealCurve });
      const truncatedResult = computeArrangementScore({
        energyCurve,
        idealCurve: idealCurve.slice(0, energyCurve.length),
      });

      expect(fullResult.score).toBe(truncatedResult.score);
      expect(fullResult.shapeSimilarity).toBeCloseTo(truncatedResult.shapeSimilarity);
      expect(fullResult.absoluteProximity).toBeCloseTo(truncatedResult.absoluteProximity);
    },
  );
});

// ─── Property 6: Color tier mapping completeness ───────────────────────

// Feature: arrangement-score, Property 6: Color tier mapping completeness
describe("Property 6: Color tier mapping completeness", () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   *
   * For any integer score in [1, 10], the tier mapping function SHALL return:
   * - color "#f44336" and label "Needs Work" for scores 1–4
   * - color "#ffca28" and label "Acceptable" for scores 5–7
   * - color "#4caf50" and label "Good" for scores 8–10
   */
  test.prop([fc.integer({ min: 1, max: 10 })], { numRuns: 100 })(
    "maps every score in [1, 10] to the correct color and label",
    (score) => {
      const tier = getScoreTier(score);

      if (score >= 8) {
        expect(tier.color).toBe("#4caf50");
        expect(tier.label).toBe("Good");
      } else if (score >= 5) {
        expect(tier.color).toBe("#ffca28");
        expect(tier.label).toBe("Acceptable");
      } else {
        expect(tier.color).toBe("#f44336");
        expect(tier.label).toBe("Needs Work");
      }
    },
  );
});


// ─── Property 7: Bug Condition Exploration ─────────────────────────────────────

/**
 * **Validates: Requirements 2.1, 2.2**
 *
 * For any flat energy curve (single integer repeated 2–20 times) and any ideal curve
 * of matching length (integers 1–10), computeArrangementScore SHALL return
 * { score: null, shapeSimilarity: 0, absoluteProximity: 0 }.
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 */
describe("Property 7: Flat energy curve returns null score (bug condition)", () => {
  test.prop(
    [
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 2, max: 20 }).chain((len) =>
        fc.tuple(
          fc.constant(len),
          fc.array(fc.integer({ min: 1, max: 10 }), { minLength: len, maxLength: len }),
        ),
      ),
    ],
    { numRuns: 100 },
  )(
    "flat energy curve with arbitrary ideal curve of matching length returns null score",
    (value, [len, idealCurve]) => {
      const energyCurve = Array(len).fill(value) as number[];
      const result = computeArrangementScore({ energyCurve, idealCurve });

      expect(result.score).toBeNull();
      expect(result.shapeSimilarity).toBe(0);
      expect(result.absoluteProximity).toBe(0);
    },
  );
});