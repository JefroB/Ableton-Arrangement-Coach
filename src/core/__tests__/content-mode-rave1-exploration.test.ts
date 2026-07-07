// Validates: Requirements 1.5, 1.6
import { describe, it, expect } from 'vitest';
import { computeContentMarkers } from '../content-mode.js';
import type { ArrangementVariant } from '../structure-types.js';

/**
 * End-to-end "rave 1" layout exploration test.
 *
 * This test uses clip data matching the actual "rave 1.als" layout (100 BPM, 4/4 time)
 * with trackNames included. On unfixed code, the density threshold bug (>=2) will
 * suppress many transitions, and even though trackNames are provided directly here,
 * the strict density threshold means too few boundaries are detected.
 *
 * Expected failure on unfixed code: too few markers (<5), likely triggering the
 * <3 fallback that returns an empty array.
 */
describe('Bug Exploration: End-to-end "rave 1" layout (Case H)', () => {
  // Build clip data matching the "rave 1.als" layout
  function buildRave1Clips() {
    const clips: {
      startTime: number;
      endTime: number;
      muted: boolean;
      trackIndex: number;
      trackName: string;
    }[] = [];

    // Track "7-Clean Kit": 8-beat MIDI clips from beat 0 to 640
    for (let beat = 0; beat < 640; beat += 8) {
      clips.push({
        startTime: beat,
        endTime: beat + 8,
        muted: false,
        trackIndex: 0,
        trackName: '7-Clean Kit',
      });
    }

    // Track "Kick": 16-beat clips from beat 0 to 656
    for (let beat = 0; beat < 656; beat += 16) {
      clips.push({
        startTime: beat,
        endTime: beat + 16,
        muted: false,
        trackIndex: 1,
        trackName: 'Kick',
      });
    }

    // Track "9-MS-20": one clip beat 0-655
    clips.push({
      startTime: 0,
      endTime: 655,
      muted: false,
      trackIndex: 2,
      trackName: '9-MS-20',
    });

    // Track "10-M1": 16-beat clips from beat 256 to 512
    for (let beat = 256; beat < 512; beat += 16) {
      clips.push({
        startTime: beat,
        endTime: beat + 16,
        muted: false,
        trackIndex: 3,
        trackName: '10-M1',
      });
    }

    // Track "5-Audio": one clip beat 0-655
    clips.push({
      startTime: 0,
      endTime: 655,
      muted: false,
      trackIndex: 4,
      trackName: '5-Audio',
    });

    // Track "6-14(100BPM)": 8-beat clips from beat 64 to 568 (with gaps at 120-128, 248-256)
    for (let beat = 64; beat < 568; beat += 8) {
      // Skip the gaps
      if (beat >= 120 && beat < 128) continue;
      if (beat >= 248 && beat < 256) continue;
      clips.push({
        startTime: beat,
        endTime: beat + 8,
        muted: false,
        trackIndex: 5,
        trackName: '6-14(100BPM)',
      });
    }

    // Track "11-Audio": 32-beat clips from beat 192 to 576
    for (let beat = 192; beat < 576; beat += 32) {
      clips.push({
        startTime: beat,
        endTime: beat + 32,
        muted: false,
        trackIndex: 6,
        trackName: '11-Audio',
      });
    }

    // Track "16-Audio": clips at beat 32-194, 320-432
    clips.push({
      startTime: 32,
      endTime: 194,
      muted: false,
      trackIndex: 7,
      trackName: '16-Audio',
    });
    clips.push({
      startTime: 320,
      endTime: 432,
      muted: false,
      trackIndex: 7,
      trackName: '16-Audio',
    });

    // Track "Remaster": one clip beat 0-661
    clips.push({
      startTime: 0,
      endTime: 661,
      muted: false,
      trackIndex: 8,
      trackName: 'Remaster',
    });

    return clips;
  }

  // EDM/rave structure variants (~8 sections) representing typical genre structure
  const raveVariants: ArrangementVariant[] = [
    {
      name: 'Rave Standard',
      sections: [
        { name: 'Intro', lengthRange: { min: 8, max: 16 } },
        { name: 'Build', lengthRange: { min: 8, max: 16 } },
        { name: 'Drop', lengthRange: { min: 16, max: 32 } },
        { name: 'Breakdown', lengthRange: { min: 8, max: 16 } },
        { name: 'Build 2', lengthRange: { min: 8, max: 16 } },
        { name: 'Drop 2', lengthRange: { min: 16, max: 32 } },
        { name: 'Bridge', lengthRange: { min: 8, max: 16 } },
        { name: 'Outro', lengthRange: { min: 8, max: 16 } },
      ],
    },
    {
      name: 'Rave Extended',
      sections: [
        { name: 'Intro', lengthRange: { min: 16, max: 32 } },
        { name: 'Build', lengthRange: { min: 8, max: 16 } },
        { name: 'Drop', lengthRange: { min: 16, max: 32 } },
        { name: 'Breakdown', lengthRange: { min: 16, max: 32 } },
        { name: 'Build 2', lengthRange: { min: 8, max: 16 } },
        { name: 'Drop 2', lengthRange: { min: 16, max: 32 } },
        { name: 'Breakdown 2', lengthRange: { min: 8, max: 16 } },
        { name: 'Drop 3', lengthRange: { min: 16, max: 32 } },
        { name: 'Outro', lengthRange: { min: 8, max: 16 } },
      ],
    },
  ];

  it('should produce ≥5 markers with first marker at beat 0 for the rave 1 layout', () => {
    const clips = buildRave1Clips();

    const result = computeContentMarkers({
      clips,
      variants: raveVariants,
      beatsPerBar: 4,
      songDuration: 661, // matches the longest clip (Remaster track)
    });

    // Assert first marker at beat 0 (content starts there)
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].beatPosition).toBe(0);

    // Assert total markers >= 5 (a real rave arrangement should have plenty of structural transitions)
    // On unfixed code: too few markers because FX/drum signals are dead + density threshold too strict.
    // The system likely produces <3 boundaries → returns empty array (fallback), OR produces
    // only 2-3 boundaries that survive grid snapping → also returns empty.
    expect(result.length).toBeGreaterThanOrEqual(5);
  });
});
