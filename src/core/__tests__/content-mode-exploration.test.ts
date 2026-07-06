// Validates: Requirements 1.1
import { describe, it, expect } from 'vitest';
import { detectBoundaries, computeContentMarkers } from '../content-mode.js';

describe('Bug Exploration: Content-start missed detection (Case A)', () => {
  it('should include beat 0 in boundaries when content starts there with a single clip', () => {
    const clips = [
      // Single clip starting at beat 0 — only ONE edge at position 0
      // (endTime 128 contributes to position 128, not position 0)
      { startTime: 0, endTime: 128, muted: false, trackIndex: 0 },

      // Two clips starting at beat 128 on different tracks (coincidence = 3 at pos 128:
      // clip 0 ends at 128 + clip 1 starts at 128 + clip 2 starts at 128)
      { startTime: 128, endTime: 256, muted: false, trackIndex: 1 },
      { startTime: 128, endTime: 384, muted: false, trackIndex: 2 },

      // Two clips ending at beat 256 (coincidence = 2 at pos 256:
      // clip 1 ends at 256 + clip 3 ends at 256)
      { startTime: 64, endTime: 256, muted: false, trackIndex: 3 },
    ];

    const result = detectBoundaries(clips, 4);
    
    // This assertion is expected to fail with current implementation
    // because beat 0 only has a coincidence count of 1 (only one clip starts there)
    // The clip ending at 128 contributes to position 128, not position 0
    expect(result).toContain(0);
  });
});


// Validates: Requirements 1.2
describe('Bug Exploration: Structural boundary missed detection (Case B)', () => {
  it('should detect boundary at density drop position even with only 1 clip edge', () => {
    const clips = [
      // 6 clips starting at beat 0, ending at beats 61, 62, 63, 65, 66, 67 (near beat 64)
      { startTime: 0, endTime: 61, muted: false, trackIndex: 0 },
      { startTime: 0, endTime: 62, muted: false, trackIndex: 1 },
      { startTime: 0, endTime: 63, muted: false, trackIndex: 2 },
      { startTime: 0, endTime: 65, muted: false, trackIndex: 3 },
      { startTime: 0, endTime: 66, muted: false, trackIndex: 4 },
      { startTime: 0, endTime: 67, muted: false, trackIndex: 5 },

      // 1 clip starting at beat 64, ending at beat 128 (creates density drop from 7 to 1)
      { startTime: 64, endTime: 128, muted: false, trackIndex: 6 },

      // 2 clips starting at beat 128 on tracks 7 and 8 (to ensure some boundaries are detected)
      { startTime: 128, endTime: 192, muted: false, trackIndex: 7 },
      { startTime: 128, endTime: 256, muted: false, trackIndex: 8 },
    ];

    const result = detectBoundaries(clips, 4);

    // This assertion is expected to fail with current implementation
    // because beat 64 only has a coincidence count of 1 (only one clip starts there)
    // but it should still be detected as a structural boundary due to the density drop
    expect(result).toContain(64);
  });
});

// Validates: Requirements 1.3
describe('Bug Exploration: Excessive boundary count (Case C)', () => {
  it('should limit markers to genre average + 2 when many coincidence positions exist', () => {
    // Create 20 positions each with >=2 coinciding edges at 32-beat intervals
    const clips = [];
    for (let i = 0; i < 20; i++) {
      const beat = i * 32;
      // For each position, create 2 clips starting there on different tracks
      clips.push(
        { startTime: beat, endTime: beat + 64, muted: false, trackIndex: 0 },
        { startTime: beat, endTime: beat + 128, muted: false, trackIndex: 1 }
      );
    }

    const sections = [
      { name: 'Intro', lengthRange: { min: 8, max: 16 } },
      { name: 'Build', lengthRange: { min: 8, max: 16 } },
      { name: 'Drop', lengthRange: { min: 16, max: 32 } },
      { name: 'Breakdown', lengthRange: { min: 8, max: 16 } },
      { name: 'Build 2', lengthRange: { min: 8, max: 16 } },
      { name: 'Drop 2', lengthRange: { min: 16, max: 32 } },
      { name: 'Bridge', lengthRange: { min: 8, max: 16 } },
      { name: 'Outro', lengthRange: { min: 8, max: 16 } },
    ];

    const result = computeContentMarkers({
      clips,
      variants: [{ name: 'EDM Standard', sections }],
      beatsPerBar: 4,
      songDuration: 1000,
    });

    // This assertion is expected to fail with current implementation
    // because all 20 grid-snapped positions become markers with no limiting
    expect(result.length).toBeLessThanOrEqual(10); // 8 (genre average) + 2 = 10
  });
});

// Validates: Requirements 1.4
describe('Bug Exploration: Section name cycling (Case D)', () => {
  it('should not produce duplicate base section names from cycling', () => {
    // Create 12 positions each with >=2 coinciding edges at 32-beat intervals
    const clips = [];
    for (let i = 0; i < 12; i++) {
      const beat = i * 32;
      // For each position, create 2 clips starting there on different tracks
      clips.push(
        { startTime: beat, endTime: beat + 64, muted: false, trackIndex: 0 },
        { startTime: beat, endTime: beat + 128, muted: false, trackIndex: 1 }
      );
    }

    // Create a variant with 6 sections
    const sections = [
      { name: 'Intro', lengthRange: { min: 8, max: 16 } },
      { name: 'Build', lengthRange: { min: 8, max: 16 } },
      { name: 'Drop', lengthRange: { min: 16, max: 32 } },
      { name: 'Breakdown', lengthRange: { min: 8, max: 16 } },
      { name: 'Build 2', lengthRange: { min: 8, max: 16 } },
      { name: 'Outro', lengthRange: { min: 8, max: 16 } },
    ];

    // Call computeContentMarkers with the clips and variant
    const result = computeContentMarkers({
      clips,
      variants: [{ name: 'Short Variant', sections }],
      beatsPerBar: 4,
      songDuration: 800,
    });

    // Extract the base name from each marker (strip trailing number suffix)
    const baseNames = result.map(marker => marker.name.replace(/\s+\d+$/, ''));

    // Assert that no base name appears more than once
    expect(new Set(baseNames).size).toBe(baseNames.length);
  });
});
