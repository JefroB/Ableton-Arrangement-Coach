/**
 * Property-based tests for validateUiColorsFile.
 *
 * **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 *
 * Property 2: UI colors validator correctly classifies inputs.
 * For any generated object structure, validateUiColorsFile SHALL accept it iff:
 * (a) energyColors entries have numeric maxScore in [0,10], non-empty color ≤30 chars,
 *     strictly ascending maxScore with no duplicates
 * (b) djScoreClasses entries have numeric minScore in [0,100], non-empty className ≤50 chars,
 *     strictly descending minScore with no duplicates
 * For invalid input, thrown error includes file name, entry index, and invalid field.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateUiColorsFile } from "../core/ui-colors-loader.js";

// ━━━ Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Generate a strictly ascending array of unique finite numbers in [min, max]. */
function ascendingUniqueScores(min: number, max: number, minLen = 1, maxLen = 8) {
  return fc
    .array(fc.double({ min, max, noNaN: true, noDefaultInfinity: true }), {
      minLength: minLen,
      maxLength: maxLen,
    })
    .map((arr) => {
      const unique = [...new Set(arr)].sort((a, b) => a - b);
      return unique.length > 0 ? unique : [min];
    });
}

/** Generate a valid energyColors array (ascending maxScore, valid colors). */
const validEnergyColorsArb = ascendingUniqueScores(0, 10).map((scores) =>
  scores.map((s, i) => ({ maxScore: s, color: `#c${i}` }))
);

/** Generate a valid djScoreClasses array (descending minScore, valid classNames). */
const validDjScoreClassesArb = ascendingUniqueScores(0, 100).map((scores) =>
  scores.reverse().map((s, i) => ({ minScore: s, className: `cls-${i}` }))
);

/** Generate a fully valid UiColorsConfig. */
const validConfigArb = fc.tuple(validEnergyColorsArb, validDjScoreClassesArb).map(
  ([energyColors, djScoreClasses]) => ({ energyColors, djScoreClasses })
);

/** Generate a non-empty valid color string (1–30 chars). */
const validColorArb = fc.string({ minLength: 1, maxLength: 30 });

/** Generate a non-empty valid className string (1–50 chars). */
const validClassNameArb = fc.string({ minLength: 1, maxLength: 50 });

// ━━━ Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateUiColorsFile — Property 2", () => {
  it("accepts all valid UiColors configs", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        expect(() => validateUiColorsFile(config)).not.toThrow();
      }),
      { numRuns: 200 }
    );
  });

  it("rejects energyColors with out-of-range maxScore", () => {
    // Generate a score outside [0, 10]
    const badScoreArb = fc.oneof(
      fc.double({ min: -1000, max: -0.001, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 10.001, max: 1000, noNaN: true, noDefaultInfinity: true })
    );

    fc.assert(
      fc.property(
        badScoreArb,
        validDjScoreClassesArb,
        validColorArb,
        (badScore, djScoreClasses, color) => {
          const config = {
            energyColors: [{ maxScore: badScore, color }],
            djScoreClasses,
          };
          expect(() => validateUiColorsFile(config)).toThrow(/energyColors\[0\]\.maxScore/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects energyColors with empty or too-long color strings", () => {
    const badColorArb = fc.oneof(
      fc.constant(""), // empty
      fc.string({ minLength: 31, maxLength: 60 }) // too long
    );

    fc.assert(
      fc.property(
        badColorArb,
        validDjScoreClassesArb,
        (badColor, djScoreClasses) => {
          const config = {
            energyColors: [{ maxScore: 5, color: badColor }],
            djScoreClasses,
          };
          expect(() => validateUiColorsFile(config)).toThrow(/energyColors\[0\]\.color/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects energyColors not in ascending order or with duplicates", () => {
    // Generate two scores where second <= first (not ascending)
    const nonAscendingPairArb = fc
      .tuple(
        fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true })
      )
      .filter(([a, b]) => b <= a);

    fc.assert(
      fc.property(
        nonAscendingPairArb,
        validDjScoreClassesArb,
        ([first, second], djScoreClasses) => {
          const config = {
            energyColors: [
              { maxScore: first, color: "#aaa" },
              { maxScore: second, color: "#bbb" },
            ],
            djScoreClasses,
          };
          expect(() => validateUiColorsFile(config)).toThrow(/energyColors\[1\]\.maxScore/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects djScoreClasses with out-of-range minScore", () => {
    const badScoreArb = fc.oneof(
      fc.double({ min: -1000, max: -0.001, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 100.001, max: 1000, noNaN: true, noDefaultInfinity: true })
    );

    fc.assert(
      fc.property(
        badScoreArb,
        validEnergyColorsArb,
        validClassNameArb,
        (badScore, energyColors, className) => {
          const config = {
            energyColors,
            djScoreClasses: [{ minScore: badScore, className }],
          };
          expect(() => validateUiColorsFile(config)).toThrow(/djScoreClasses\[0\]\.minScore/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects djScoreClasses with empty or too-long className", () => {
    const badClassNameArb = fc.oneof(
      fc.constant(""), // empty
      fc.string({ minLength: 51, maxLength: 80 }) // too long
    );

    fc.assert(
      fc.property(
        badClassNameArb,
        validEnergyColorsArb,
        (badClassName, energyColors) => {
          const config = {
            energyColors,
            djScoreClasses: [{ minScore: 50, className: badClassName }],
          };
          expect(() => validateUiColorsFile(config)).toThrow(/djScoreClasses\[0\]\.className/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects djScoreClasses not in descending order or with duplicates", () => {
    // Generate two scores where second >= first (not descending)
    const nonDescendingPairArb = fc
      .tuple(
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
      )
      .filter(([a, b]) => b >= a);

    fc.assert(
      fc.property(
        nonDescendingPairArb,
        validEnergyColorsArb,
        ([first, second], energyColors) => {
          const config = {
            energyColors,
            djScoreClasses: [
              { minScore: first, className: "cls-a" },
              { minScore: second, className: "cls-b" },
            ],
          };
          expect(() => validateUiColorsFile(config)).toThrow(/djScoreClasses\[1\]\.minScore/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("error messages identify entry index and field name", () => {
    // Invalid maxScore at index 1 (ascending violation)
    const badOrder = {
      energyColors: [
        { maxScore: 7, color: "#aaa" },
        { maxScore: 3, color: "#bbb" },
      ],
      djScoreClasses: [
        { minScore: 80, className: "good" },
        { minScore: 20, className: "poor" },
      ],
    };
    expect(() => validateUiColorsFile(badOrder)).toThrow(/energyColors\[1\]/);

    // Invalid className at index 0 (empty string)
    const badClassName = {
      energyColors: [{ maxScore: 5, color: "#ccc" }],
      djScoreClasses: [{ minScore: 50, className: "" }],
    };
    expect(() => validateUiColorsFile(badClassName)).toThrow(/djScoreClasses\[0\]\.className/);

    // Invalid color at index 2 (too long)
    const badColor = {
      energyColors: [
        { maxScore: 1, color: "#a" },
        { maxScore: 5, color: "#b" },
        { maxScore: 9, color: "x".repeat(31) },
      ],
      djScoreClasses: [{ minScore: 50, className: "ok" }],
    };
    expect(() => validateUiColorsFile(badColor)).toThrow(/energyColors\[2\]\.color/);
  });
});
