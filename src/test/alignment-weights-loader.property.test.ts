/**
 * Property-based test: Alignment weights validator correctly classifies inputs.
 *
 * **Validates: Requirements 4.2, 4.3, 4.4**
 *
 * Property 4: For any generated object with three numeric fields, the
 * validateAlignmentWeightsFile function SHALL accept it if and only if:
 * (a) all three weight fields (ordering, length, count) are present and are
 * numbers in [0.0, 1.0], and (b) the three values sum to 1.0 within
 * floating-point tolerance of 0.001.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateAlignmentWeightsFile } from "../core/alignment-weights-loader.js";

describe("validateAlignmentWeightsFile — Property 4", () => {
  it("accepts valid weight triples that sum to 1.0 within tolerance", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const c = 1.0 - a - b;
          // Skip if the derived third value falls outside [0, 1]
          if (c < 0 || c > 1) return;

          const weights = { ordering: a, length: b, count: c };
          expect(() => validateAlignmentWeightsFile(weights)).not.toThrow();
        }
      ),
      { numRuns: 200 }
    );
  });

  it("rejects objects with missing fields", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant({ ordering: 0.4, length: 0.35 }),
          fc.constant({ ordering: 0.4, count: 0.25 }),
          fc.constant({ length: 0.35, count: 0.25 }),
          fc.constant({ ordering: 0.5 }),
          fc.constant({ length: 0.5 }),
          fc.constant({ count: 0.5 }),
          fc.constant({})
        ),
        (weights) => {
          expect(() => validateAlignmentWeightsFile(weights)).toThrow(
            /alignment-weights\.json/
          );
        }
      )
    );
  });

  it("rejects objects with non-numeric values", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant({ ordering: "hello", length: 0.35, count: 0.25 }),
          fc.constant({ ordering: 0.4, length: null, count: 0.25 }),
          fc.constant({ ordering: 0.4, length: 0.35, count: undefined }),
          fc.constant({ ordering: NaN, length: 0.35, count: 0.25 }),
          fc.constant({ ordering: 0.4, length: Infinity, count: 0.25 }),
          fc.constant({ ordering: 0.4, length: 0.35, count: -Infinity }),
          fc.constant({ ordering: true, length: 0.35, count: 0.25 })
        ),
        (weights) => {
          expect(() => validateAlignmentWeightsFile(weights)).toThrow(
            /alignment-weights\.json/
          );
        }
      )
    );
  });

  it("rejects weight values outside [0, 1] range", () => {
    // fc.float requires 32-bit float boundaries
    const NEG_MIN = Math.fround(-100);
    const NEG_MAX = Math.fround(-0.001);
    const POS_MIN = Math.fround(1.001);
    const POS_MAX = Math.fround(100);

    fc.assert(
      fc.property(
        fc.oneof(
          // Negative values
          fc.float({ min: NEG_MIN, max: NEG_MAX, noNaN: true }).map((v) => ({
            ordering: v,
            length: 0.5,
            count: 0.5,
          })),
          fc.float({ min: NEG_MIN, max: NEG_MAX, noNaN: true }).map((v) => ({
            ordering: 0.5,
            length: v,
            count: 0.5,
          })),
          fc.float({ min: NEG_MIN, max: NEG_MAX, noNaN: true }).map((v) => ({
            ordering: 0.5,
            length: 0.5,
            count: v,
          })),
          // Values > 1
          fc.float({ min: POS_MIN, max: POS_MAX, noNaN: true }).map((v) => ({
            ordering: v,
            length: 0.1,
            count: 0.1,
          })),
          fc.float({ min: POS_MIN, max: POS_MAX, noNaN: true }).map((v) => ({
            ordering: 0.1,
            length: v,
            count: 0.1,
          })),
          fc.float({ min: POS_MIN, max: POS_MAX, noNaN: true }).map((v) => ({
            ordering: 0.1,
            length: 0.1,
            count: v,
          }))
        ),
        (weights) => {
          expect(() => validateAlignmentWeightsFile(weights)).toThrow(
            /alignment-weights\.json/
          );
        }
      )
    );
  });

  it("rejects weight triples whose sum is not within 0.001 of 1.0", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (ordering, length, count) => {
          const sum = ordering + length + count;
          // Only test cases where sum deviates from 1.0 by more than tolerance
          if (Math.abs(sum - 1.0) <= 0.001) return;

          const weights = { ordering, length, count };
          expect(() => validateAlignmentWeightsFile(weights)).toThrow(
            /alignment-weights\.json/
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});
