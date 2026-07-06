/**
 * Property-based tests for content-mode.ts preservation behavior
 * Tests fallback and abort conditions in computeContentMarkers
 */
import { test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { computeContentMarkers, snapToGrid, matchVariant } from '../content-mode.js';
import type { ArrangementVariant } from '../structure-types.js';

// Generators
const arbBeatsPerBar = fc.integer({min:1, max:8});

const arbVariant = fc.record({
  name: fc.constant('Test'),
  sections: fc.array(
    fc.record({
      name: fc.string({minLength:1, maxLength:10}),
      lengthRange: fc.record({
        min: fc.integer({min:4, max:16}),
        max: fc.integer({min:16, max:32})
      })
    }),
    {minLength:3, maxLength:12}
  )
});

describe('Preservation: Fallback and abort behavior', () => {
  // Property 1: fewer than 3 boundaries fallback
  // Generate clips that produce 0, 1, or 2 coincidence positions near grid points
  // Simplest: generate 0-2 clips (which means max coincidence edges will be 0 or few)
  test.prop([
    fc.array(
      fc.record({
        startTime: fc.nat({max:1000}),
        endTime: fc.nat({max:2000}),
        muted: fc.constant(false),
        trackIndex: fc.nat({max:10})
      }),
      {minLength:0, maxLength:2}
    ),
    arbBeatsPerBar,
    arbVariant
  ], {numRuns: 50})(
    'returns empty array when arrangement has fewer than 3 unmuted clips',
    (clips, beatsPerBar, variant) => {
      // With 0-2 clips, max possible coincidence positions is very limited
      // Grid snapping further reduces candidates
      const result = computeContentMarkers({
        clips, 
        variants:[variant], 
        beatsPerBar, 
        songDuration: 2000
      });
      expect(result).toEqual([]);
    }
  );

  // Property 2: sparse arrangements with all muted clips
  test.prop([
    fc.array(
      fc.record({
        startTime: fc.nat({max:1000}),
        endTime: fc.nat({max:2000}),
        muted: fc.constant(true),
        trackIndex: fc.nat({max:10})
      }),
      {minLength:1, maxLength:20}
    ),
    arbBeatsPerBar,
    arbVariant
  ], {numRuns: 50})(
    'returns empty array when all clips are muted',
    (clips, beatsPerBar, variant) => {
      const result = computeContentMarkers({
        clips, 
        variants:[variant], 
        beatsPerBar, 
        songDuration: 2000
      });
      expect(result).toEqual([]);
    }
  );
});


describe('Preservation: Grid snapping behavior', () => {
  // Property 1: all snapped positions are multiples of 8*beatsPerBar
  // **Validates: Requirements 3.4**
  test.prop([
    fc.array(fc.nat({ max: 5000 }), { minLength: 1, maxLength: 30 }),
    fc.integer({ min: 1, max: 8 })
  ], { numRuns: 100 })(
    'all snapped positions are multiples of 8*beatsPerBar',
    (candidates, beatsPerBar) => {
      const result = snapToGrid(candidates, beatsPerBar);
      for (const position of result) {
        expect(position % (8 * beatsPerBar)).toBe(0);
      }
    }
  );

  // Property 2: output contains no duplicates
  // **Validates: Requirements 3.4**
  test.prop([
    fc.array(fc.nat({ max: 5000 }), { minLength: 1, maxLength: 30 }),
    fc.integer({ min: 1, max: 8 })
  ], { numRuns: 100 })(
    'output contains no duplicates',
    (candidates, beatsPerBar) => {
      const result = snapToGrid(candidates, beatsPerBar);
      expect(new Set(result).size).toBe(result.length);
    }
  );

  // Property 3: output is sorted ascending
  // **Validates: Requirements 3.4**
  test.prop([
    fc.array(fc.nat({ max: 5000 }), { minLength: 1, maxLength: 30 }),
    fc.integer({ min: 1, max: 8 })
  ], { numRuns: 100 })(
    'output is sorted ascending',
    (candidates, beatsPerBar) => {
      const result = snapToGrid(candidates, beatsPerBar);
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
      }
    }
  );
});


describe('Preservation: matchVariant selection behavior', () => {
  // Generate boundaries as sorted arrays of positive multiples of 32
  const arbBoundaries = fc
    .array(fc.integer({ min: 0, max: 20 }), { minLength: 3, maxLength: 15 })
    .map(arr => [...new Set(arr)].sort((a, b) => a - b).map(x => x * 32))
    .filter(arr => arr.length >= 3);

  const arbVariants = fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      sections: fc.array(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 10 }),
          lengthRange: fc.record({
            min: fc.integer({ min: 4, max: 16 }),
            max: fc.integer({ min: 16, max: 32 })
          })
        }),
        { minLength: 3, maxLength: 12 }
      )
    }),
    { minLength: 1, maxLength: 4 }
  );

  const arbSongDuration = fc.integer({ min: 500, max: 5000 });

  // **Validates: Requirements 3.5**
  // Property 1: 'matchVariant is deterministic'
  test.prop([
    arbBoundaries,
    arbVariants,
    arbSongDuration
  ], { numRuns: 50 })(
    'matchVariant is deterministic',
    (boundaries, variants, songDuration) => {
      const result1 = matchVariant(boundaries, variants, songDuration);
      const result2 = matchVariant(boundaries, variants, songDuration);
      expect(result1.name).toBe(result2.name);
    }
  );

  // **Validates: Requirements 3.5**
  // Property 2: 'matchVariant returns one of the input variants'
  test.prop([
    arbBoundaries,
    arbVariants,
    arbSongDuration
  ], { numRuns: 50 })(
    'matchVariant returns one of the input variants',
    (boundaries, variants, songDuration) => {
      const result = matchVariant(boundaries, variants, songDuration);
      const variantNames = variants.map(v => v.name);
      expect(variantNames).toContain(result.name);
    }
  );

  // **Validates: Requirements 3.5**
  // Property 3: 'selected variant exists in the variants array'
  test.prop([
    arbBoundaries,
    arbVariants,
    arbSongDuration
  ], { numRuns: 50 })(
    'selected variant exists in the variants array',
    (boundaries, variants, songDuration) => {
      const result = matchVariant(boundaries, variants, songDuration);
      const found = variants.find(v => Object.is(v, result) || v.name === result.name);
      expect(found).toBeDefined();
    }
  );
});


describe('Preservation: Full equivalence for non-buggy inputs', () => {
  // Generator constructs inputs where:
  // - Exactly numBoundaries positions have >= 2 coinciding clip starts (at multiples of 32)
  // - Clip end times are offset to NOT create additional coincidence positions
  // - Variant has enough sections to cover all boundaries (no cycling)
  // This ensures the input is "non-buggy": content-start IS at a coincidence point,
  // boundaries ARE within genre average + 2, no cycling needed
  const arbNonBuggyInput = fc
    .integer({ min: 3, max: 8 })
    .chain(numBoundaries => {
      return fc.record({
        numBoundaries: fc.constant(numBoundaries),
        sectionNames: fc.array(fc.string({ minLength: 2, maxLength: 8 }), {
          minLength: numBoundaries,
          maxLength: numBoundaries + 2
        })
      });
    })
    .map(({ numBoundaries, sectionNames }) => {
      const clips: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[] = [];
      for (let i = 0; i < numBoundaries; i++) {
        const beat = i * 32;
        // End times use odd offsets (e.g., +17, +23) to avoid landing on grid multiples of 32
        // This prevents clip endpoints from creating extra coincidence positions
        clips.push({ startTime: beat, endTime: beat + 17, muted: false, trackIndex: 0 });
        clips.push({ startTime: beat, endTime: beat + 23, muted: false, trackIndex: 1 });
      }
      const sections = sectionNames.map(name => ({ name, lengthRange: { min: 8, max: 16 } }));
      const variants = [{ name: 'TestVariant', sections }];
      return {
        clips,
        variants,
        beatsPerBar: 4 as const,
        songDuration: numBoundaries * 32 + 128,
        _expectedBoundaryCount: numBoundaries
      };
    });

  // Property 1: all markers have grid-aligned beat positions
  // **Validates: Requirements 3.4**
  test.prop([arbNonBuggyInput], { numRuns: 30 })(
    'all markers have grid-aligned beat positions',
    (input) => {
      const { _expectedBoundaryCount, ...contentInput } = input;
      const result = computeContentMarkers(contentInput);
      for (const marker of result) {
        expect(marker.beatPosition % 32).toBe(0);
      }
    }
  );

  // Property 2: all marker names are unique after disambiguation
  // **Validates: Requirements 3.1, 3.2, 3.3**
  test.prop([arbNonBuggyInput], { numRuns: 30 })(
    'all marker names are unique after disambiguation',
    (input) => {
      const { _expectedBoundaryCount, ...contentInput } = input;
      const result = computeContentMarkers(contentInput);
      const uniqueNames = new Set(result.map(m => m.name));
      expect(uniqueNames.size).toBe(result.length);
    }
  );

  // Property 3: marker count equals detected boundary count for non-buggy inputs
  // Since we construct inputs with exactly numBoundaries coincidence positions at grid points,
  // and sections.length >= numBoundaries, all boundaries map to markers without limiting
  // **Validates: Requirements 3.1, 3.3, 3.5**
  test.prop([arbNonBuggyInput], { numRuns: 30 })(
    'marker count equals detected boundary count',
    (input) => {
      const { _expectedBoundaryCount, ...contentInput } = input;
      const result = computeContentMarkers(contentInput);
      // The marker count should equal the number of grid-snapped boundaries
      // We constructed exactly _expectedBoundaryCount positions with coincidence >= 2
      expect(result.length).toBe(_expectedBoundaryCount);
    }
  );

  // Property 4: output is deterministic
  // **Validates: Requirements 3.5**
  test.prop([arbNonBuggyInput], { numRuns: 30 })(
    'output is deterministic',
    (input) => {
      const { _expectedBoundaryCount, ...contentInput } = input;
      const result1 = computeContentMarkers(contentInput);
      const result2 = computeContentMarkers(contentInput);
      expect(result1).toEqual(result2);
    }
  );
});
