/**
 * Property-based test for energy chart color behavioral equivalence.
 *
 * Feature: remaining-data-externalization, Property 8: Energy chart color behavioral equivalence
 * **Validates: Requirements 7.3**
 */
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { scoreToColor } from '../ui/webview/chart.js';

/**
 * Reference implementation using the original hardcoded color mapping:
 * - score <= 3: '#4caf50' (green)
 * - score <= 6: '#ffca28' (yellow)
 * - score <= 8: '#ff9800' (orange)
 * - else: '#f44336' (red)
 */
function referenceScoreToColor(score: number): string {
  if (score <= 3) {
    return '#4caf50';
  } else if (score <= 6) {
    return '#ffca28';
  } else if (score <= 8) {
    return '#ff9800';
  } else {
    return '#f44336';
  }
}

describe('chart behavioral property tests', () => {
  it('should have equivalent color mapping for all scores in [0,10]', { timeout: 10000 }, () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
        (score) => {
          const actual = scoreToColor(score);
          const expected = referenceScoreToColor(score);
          return actual === expected;
        }
      ),
      { numRuns: 1000 }
    );
  });
});