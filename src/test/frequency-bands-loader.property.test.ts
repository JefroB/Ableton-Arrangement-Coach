/**
 * Property-based tests for the frequency bands validator.
 *
 * Property 3: Frequency bands validator correctly classifies inputs
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5
 */
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { validateFrequencyBandsFile } from "../core/frequency-bands-loader.js";

const VALID_BAND_NAMES = ["subBass", "bass", "lowMid", "mid", "highMid", "high"] as const;

// ━━━ Arbitraries ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generates a valid frequency bands config: exactly 6 bands with unique valid
 * names and lowHz < highHz (both finite).
 */
const validBandsArb = fc
  .tuple(
    // Generate 6 pairs of (lowHz, delta) where delta > 0
    fc.array(
      fc.tuple(
        fc.double({ min: 0, max: 20000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 10000, noNaN: true, noDefaultInfinity: true })
      ),
      { minLength: 6, maxLength: 6 }
    ),
    // Shuffle the valid names to assign randomly
    fc.shuffledSubarray(VALID_BAND_NAMES as unknown as string[], {
      minLength: 6,
      maxLength: 6,
    })
  )
  .map(([hzPairs, names]) => ({
    bands: names.map((name, i) => ({
      name,
      lowHz: hzPairs[i]![0],
      highHz: hzPairs[i]![0] + hzPairs[i]![1],
    })),
  }));

// ━━━ Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateFrequencyBandsFile — Property 3", () => {
  /**
   * **Validates: Requirements 3.2, 3.4**
   * Valid configs with exactly 6 bands, unique valid names, finite lowHz < highHz
   * should be accepted without error.
   */
  it("accepts valid configs with exactly 6 unique-named bands and lowHz < highHz", () => {
    fc.assert(
      fc.property(validBandsArb, (data) => {
        expect(() => validateFrequencyBandsFile(data)).not.toThrow();
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * Wrong band count (not exactly 6) should be rejected.
   */
  it("rejects configs with wrong band count (not 6)", () => {
    const wrongCountArb = fc
      .nat({ max: 12 })
      .filter((n) => n !== 6)
      .chain((count) =>
        fc
          .array(
            fc.record({
              name: fc.constantFrom(...VALID_BAND_NAMES),
              lowHz: fc.double({ min: 0, max: 5000, noNaN: true, noDefaultInfinity: true }),
              highHz: fc.double({ min: 5001, max: 20000, noNaN: true, noDefaultInfinity: true }),
            }),
            { minLength: count, maxLength: count }
          )
          .map((bands) => ({ bands }))
      );

    fc.assert(
      fc.property(wrongCountArb, (data) => {
        expect(() => validateFrequencyBandsFile(data)).toThrow(
          /frequency-bands\.json/
        );
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * Duplicate band names should be rejected.
   */
  it("rejects configs with duplicate band names", () => {
    // Generate 6 bands but force at least one duplicate name
    const duplicateNamesArb = fc
      .tuple(
        fc.shuffledSubarray(VALID_BAND_NAMES as unknown as string[], {
          minLength: 5,
          maxLength: 5,
        }),
        fc.nat({ max: 4 }) // index of name to duplicate
      )
      .map(([fiveNames, dupIdx]) => {
        // Create 6 bands: use 5 unique names, then duplicate one
        const names = [...fiveNames, fiveNames[dupIdx]];
        return {
          bands: names.map((name, i) => ({
            name,
            lowHz: i * 100,
            highHz: i * 100 + 50,
          })),
        };
      });

    fc.assert(
      fc.property(duplicateNamesArb, (data) => {
        expect(() => validateFrequencyBandsFile(data)).toThrow(
          /frequency-bands\.json/
        );
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * Invalid (unrecognized) band names should be rejected.
   */
  it("rejects configs with invalid band names", () => {
    const invalidNameArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => !(VALID_BAND_NAMES as readonly string[]).includes(s));

    const invalidNamesConfigArb = fc
      .tuple(
        invalidNameArb,
        fc.nat({ max: 5 }) // which band slot to put the invalid name in
      )
      .map(([badName, slot]) => {
        const names = [...VALID_BAND_NAMES];
        names[slot] = badName as any;
        return {
          bands: names.map((name, i) => ({
            name,
            lowHz: i * 100,
            highHz: i * 100 + 50,
          })),
        };
      });

    fc.assert(
      fc.property(invalidNamesConfigArb, (data) => {
        expect(() => validateFrequencyBandsFile(data)).toThrow(
          /frequency-bands\.json/
        );
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   * Non-finite lowHz or highHz (NaN, Infinity, -Infinity) should be rejected.
   */
  it("rejects configs with non-finite lowHz or highHz", () => {
    const nonFiniteArb = fc.constantFrom(NaN, Infinity, -Infinity);

    const nonFiniteConfigArb = fc
      .tuple(
        nonFiniteArb,
        fc.nat({ max: 5 }), // which band
        fc.boolean() // true = corrupt lowHz, false = corrupt highHz
      )
      .map(([badVal, bandIdx, corruptLow]) => {
        const bands = VALID_BAND_NAMES.map((name, i) => ({
          name,
          lowHz: i * 100,
          highHz: i * 100 + 50,
        }));
        if (corruptLow) {
          bands[bandIdx]!.lowHz = badVal;
        } else {
          bands[bandIdx]!.highHz = badVal;
        }
        return { bands };
      });

    fc.assert(
      fc.property(nonFiniteConfigArb, (data) => {
        expect(() => validateFrequencyBandsFile(data)).toThrow(
          /frequency-bands\.json/
        );
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.3**
   * lowHz >= highHz should be rejected.
   */
  it("rejects configs with lowHz >= highHz", () => {
    const lowGeHighArb = fc
      .tuple(
        fc.nat({ max: 5 }), // which band to corrupt
        fc.double({ min: 100, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.boolean() // true = lowHz == highHz, false = lowHz > highHz
      )
      .map(([bandIdx, val, equal]) => {
        const bands = VALID_BAND_NAMES.map((name, i) => ({
          name,
          lowHz: i * 100,
          highHz: i * 100 + 50,
        }));
        if (equal) {
          bands[bandIdx]!.lowHz = val;
          bands[bandIdx]!.highHz = val;
        } else {
          bands[bandIdx]!.lowHz = val + 1;
          bands[bandIdx]!.highHz = val;
        }
        return { bands };
      });

    fc.assert(
      fc.property(lowGeHighArb, (data) => {
        expect(() => validateFrequencyBandsFile(data)).toThrow(
          /frequency-bands\.json/
        );
      }),
      { numRuns: 200 }
    );
  });
});
