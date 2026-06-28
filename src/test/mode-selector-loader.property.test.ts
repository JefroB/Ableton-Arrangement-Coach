import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateModeSelectorThresholdsFile } from '../core/mode-selector-loader.js';

/**
 * **Validates: Requirements 5.2, 5.3, 5.4**
 *
 * Property 5: Mode selector thresholds validator correctly classifies inputs.
 * For any generated object, validateModeSelectorThresholdsFile accepts iff:
 *   (a) clipCountThreshold is an integer in [1, 1000]
 *   (b) coverageThreshold is a finite number in (0, 1) exclusive
 * For invalid input, the error message includes the file name and the failing field.
 */
describe('Mode selector thresholds validator (Property 5)', () => {
  describe('valid configurations are accepted', () => {
    it('accepts valid clipCountThreshold (integer 1-1000) and coverageThreshold (0 < x < 1)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.double({ min: 0.001, max: 0.999, noNaN: true, noDefaultInfinity: true }),
          (clipCountThreshold, coverageThreshold) => {
            const config = { clipCountThreshold, coverageThreshold };
            // Valid configs should not throw
            validateModeSelectorThresholdsFile(config);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('accepts boundary values: clipCount=1, coverage just above 0', () => {
      expect(() =>
        validateModeSelectorThresholdsFile({ clipCountThreshold: 1, coverageThreshold: 0.0001 })
      ).not.toThrow();
    });

    it('accepts boundary values: clipCount=1000, coverage just below 1', () => {
      expect(() =>
        validateModeSelectorThresholdsFile({ clipCountThreshold: 1000, coverageThreshold: 0.9999 })
      ).not.toThrow();
    });
  });

  describe('invalid clipCountThreshold values are rejected', () => {
    it('rejects float (non-integer) clipCountThreshold', () => {
      fc.assert(
        fc.property(
          // Generate floats that are NOT integers (filter out whole numbers)
          fc.double({ min: 0.01, max: 999.99, noNaN: true, noDefaultInfinity: true }).filter(
            (v) => !Number.isInteger(v)
          ),
          fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
          (clipCountThreshold, coverageThreshold) => {
            const config = { clipCountThreshold, coverageThreshold };
            expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
              /mode-selector-thresholds\.json/
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects clipCountThreshold < 1 (including 0 and negatives)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 0 }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
          (clipCountThreshold, coverageThreshold) => {
            const config = { clipCountThreshold, coverageThreshold };
            expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
              /mode-selector-thresholds\.json/
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects clipCountThreshold > 1000', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1001, max: 100000 }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
          (clipCountThreshold, coverageThreshold) => {
            const config = { clipCountThreshold, coverageThreshold };
            expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
              /mode-selector-thresholds\.json/
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('invalid coverageThreshold values are rejected', () => {
    it('rejects coverageThreshold <= 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.oneof(
            fc.constant(0),
            fc.double({ min: -100, max: -0.001, noNaN: true, noDefaultInfinity: true })
          ),
          (clipCountThreshold, coverageThreshold) => {
            const config = { clipCountThreshold, coverageThreshold };
            expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
              /mode-selector-thresholds\.json/
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects coverageThreshold >= 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.oneof(
            fc.constant(1),
            fc.double({ min: 1.001, max: 100, noNaN: true, noDefaultInfinity: true })
          ),
          (clipCountThreshold, coverageThreshold) => {
            const config = { clipCountThreshold, coverageThreshold };
            expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
              /mode-selector-thresholds\.json/
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects NaN coverageThreshold', () => {
      const config = { clipCountThreshold: 5, coverageThreshold: NaN };
      expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });

    it('rejects Infinity coverageThreshold', () => {
      const config = { clipCountThreshold: 5, coverageThreshold: Infinity };
      expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });

    it('rejects -Infinity coverageThreshold', () => {
      const config = { clipCountThreshold: 5, coverageThreshold: -Infinity };
      expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });
  });

  describe('missing or extra fields are rejected', () => {
    it('rejects object missing clipCountThreshold', () => {
      const config = { coverageThreshold: 0.5 };
      expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });

    it('rejects object missing coverageThreshold', () => {
      const config = { clipCountThreshold: 5 };
      expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });

    it('rejects object with extra keys', () => {
      const config = { clipCountThreshold: 5, coverageThreshold: 0.5, extra: true };
      expect(() => validateModeSelectorThresholdsFile(config)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });

    it('rejects null input', () => {
      expect(() => validateModeSelectorThresholdsFile(null)).toThrow(
        /mode-selector-thresholds\.json/
      );
    });

    it('rejects non-object input', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(undefined)),
          (input) => {
            expect(() => validateModeSelectorThresholdsFile(input)).toThrow(
              /mode-selector-thresholds\.json/
            );
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
