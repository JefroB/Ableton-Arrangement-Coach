// Validates: Requirements 1.1
import { describe, it, expect } from 'vitest';
import { detectBoundaries, detectBoundariesScored, computeContentMarkers, computeTrackDensityDelta } from '../content-mode.js';

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


// Validates: Requirements 1.2
describe('Bug Exploration: FX signal dead when trackName missing (Case E)', () => {
  it('should return no FX signal contribution when clips lack trackName', () => {
    // Clips on what WOULD be an FX track (index 0), positioned near bar boundary at beat 4.
    // These clips overlap the ±1 bar window around beat 4 (window: 0 to 8).
    // WITHOUT trackName, computeFxPresence skips all clips → signal never fires.
    const clipsWithoutTrackName = [
      { startTime: 0, endTime: 8, muted: false, trackIndex: 0 },
      { startTime: 2, endTime: 6, muted: false, trackIndex: 1 },
    ];

    const result = detectBoundariesScored(clipsWithoutTrackName, 4);

    // Find the boundary at bar position 4 (the bar boundary where FX clips overlap)
    const boundaryAtBar4 = result.find(b => b.position === 4);

    // Without trackName, FX signal cannot fire. The score at this position
    // should NOT include the FX signal contribution.
    // We record the score here to compare with the trackName case below.
    const scoreWithoutTrackName = boundaryAtBar4?.score ?? 0;

    // Now create the SAME clips WITH trackName: "FX Riser" (matches FX_KEYWORDS via "riser")
    const clipsWithTrackName = [
      { startTime: 0, endTime: 8, muted: false, trackIndex: 0, trackName: 'FX Riser' },
      { startTime: 2, endTime: 6, muted: false, trackIndex: 1, trackName: 'Synth Pad' },
    ];

    const resultWithTrackName = detectBoundariesScored(clipsWithTrackName, 4);
    const boundaryAtBar4WithName = resultWithTrackName.find(b => b.position === 4);
    const scoreWithTrackName = boundaryAtBar4WithName?.score ?? 0;

    // The FX signal should fire when trackName is present and matches FX_KEYWORDS,
    // making the score higher than without trackName.
    // This documents the bug: without trackName, FX detection is completely inert.
    expect(scoreWithTrackName).toBeGreaterThan(scoreWithoutTrackName);
  });
});


// Validates: Requirements 1.3
describe('Bug Exploration: Drum signal dead when trackName missing (Case F)', () => {
  it('should return no drum signal contribution when clips lack trackName', () => {
    // Clips on what WOULD be a drum track (index 0), positioned near bar boundary at beat 4.
    // Short clips (2 beats) within the lookback window (barPos - barLength to barPos) = (0 to 4).
    // WITHOUT trackName, computeDrumFillPresence skips all clips → signal never fires.
    const clipsWithoutTrackName = [
      { startTime: 2, endTime: 4, muted: false, trackIndex: 0 },
      { startTime: 6, endTime: 8, muted: false, trackIndex: 1 },
    ];

    const result = detectBoundariesScored(clipsWithoutTrackName, 4);

    // Find the boundary at bar position 4 (the bar boundary where drum clips are in the lookback window)
    const boundaryAtBar4 = result.find(b => b.position === 4);

    // Without trackName, drum signal cannot fire. The score at this position
    // should NOT include the drum signal contribution.
    const scoreWithoutTrackName = boundaryAtBar4?.score ?? 0;

    // Now create the SAME clips WITH trackName: "Kick" (matches DRUM_KEYWORDS via "kick")
    const clipsWithTrackName = [
      { startTime: 2, endTime: 4, muted: false, trackIndex: 0, trackName: 'Kick' },
      { startTime: 6, endTime: 8, muted: false, trackIndex: 1, trackName: 'Snare' },
    ];

    const resultWithTrackName = detectBoundariesScored(clipsWithTrackName, 4);
    const boundaryAtBar4WithName = resultWithTrackName.find(b => b.position === 4);
    const scoreWithTrackName = boundaryAtBar4WithName?.score ?? 0;

    // The drum signal should fire when trackName is present and matches DRUM_KEYWORDS,
    // making the score higher than without trackName.
    // This documents the bug: without trackName, drum detection is completely inert.
    expect(scoreWithTrackName).toBeGreaterThan(scoreWithoutTrackName);
  });
});


// Validates: Requirements 1.4
describe('Bug Exploration: Single-track density threshold (Case G)', () => {
  it('should return 1 when track count delta is exactly 1', () => {
    // We need 5 tracks active in the previous bar and 6 tracks active in the current bar.
    // barPos = 8, barLength = 4
    // Previous bar window: clips where startTime < 8 AND endTime > 4
    // Current bar window: clips where startTime < 12 AND endTime > 8

    const clips = [
      // 5 tracks active in BOTH bars (span the entire range)
      { startTime: 0, endTime: 16, muted: false, trackIndex: 0 },
      { startTime: 0, endTime: 16, muted: false, trackIndex: 1 },
      { startTime: 0, endTime: 16, muted: false, trackIndex: 2 },
      { startTime: 0, endTime: 16, muted: false, trackIndex: 3 },
      { startTime: 0, endTime: 16, muted: false, trackIndex: 4 },

      // 1 additional track active ONLY in the current bar
      // startTime=8 < 12 ✓, endTime=11 > 8 ✓ (current bar)
      // startTime=8 NOT < 8 ✗ (previous bar — not active)
      { startTime: 8, endTime: 11, muted: false, trackIndex: 5 },
    ];

    const result = computeTrackDensityDelta(clips, 8, 4);

    // Expected: delta = |6 - 5| = 1, so the function SHOULD return 1.
    // Bug: the current threshold is delta >= 2, so it returns 0 instead.
    // This test failing (getting 0 instead of 1) confirms the bug exists.
    expect(result).toBe(1);
  });
});
