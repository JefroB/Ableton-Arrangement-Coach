/**
 * Mode Selector Behavioral Equivalence Property Test.
 *
 * **Validates: Requirements 7.7**
 *
 * Verifies that `selectMode` produces identical results to a reference
 * implementation using the original hardcoded thresholds (clipCount=3, coverage=0.10).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { selectMode, computeUnionCoverage } from '../core/mode-selector.js';
import type { ModeSelectionInput } from '../core/mode-selector.js';

// ─── Reference Implementation (original hardcoded thresholds) ─────────────────

const CLIP_COUNT_THRESHOLD = 3;
const COVERAGE_THRESHOLD = 0.10;

function referenceSelectMode(input: ModeSelectionInput): 'minimal' | 'content' {
  const { clips, songDuration, trackCount } = input;

  if (songDuration <= 0 || trackCount <= 0) {
    return 'minimal';
  }

  const unmutedClips = clips.filter((clip) => !clip.muted);
  const unmutedCount = unmutedClips.length;

  const coverage = computeUnionCoverage(unmutedClips);
  const coverageFraction = coverage / songDuration;

  if (unmutedCount >= CLIP_COUNT_THRESHOLD || coverageFraction >= COVERAGE_THRESHOLD) {
    return 'content';
  }

  return 'minimal';
}

// ─── Arbitrary: valid clip with startTime < endTime ──────────────────────────

const clipArb = fc
  .record({
    startTime: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    endTime: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    muted: fc.boolean(),
  })
  .filter((c) => c.startTime < c.endTime);

const modeSelectionInputArb = fc.record({
  clips: fc.array(clipArb, { minLength: 0, maxLength: 20 }),
  songDuration: fc.double({ min: 1, max: 200, noNaN: true, noDefaultInfinity: true }),
  trackCount: fc.integer({ min: 0, max: 10 }),
});

// ─── Property Test ───────────────────────────────────────────────────────────

describe('Mode Selector Behavioral Equivalence (Property 11)', () => {
  it('selectMode matches reference implementation for all valid inputs', () => {
    fc.assert(
      fc.property(modeSelectionInputArb, (input) => {
        const actual = selectMode(input);
        const expected = referenceSelectMode(input);
        expect(actual).toBe(expected);
      }),
      { numRuns: 1000 },
    );
  });
});
