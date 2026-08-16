/**
 * Property-based tests for autoPlaceIfNeeded genre gate (Properties 2 and 3).
 *
 * Feature: existing-arrangement-locator-placement
 * Property 2: Genre Gate Prevents Side Effects
 * Property 3: Genre Gate Idempotence
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import fc from "fast-check";
import { autoPlaceIfNeeded, type AutoPlaceInput, type ClipInfo } from "../auto-placer.js";
import type { SdkAdapter } from "../../ableton/sdk-adapter.js";
import type { Store } from "../../state/store.js";

// ─── Constants (mirror implementation thresholds) ──────────────────────────

const CLIP_COUNT_THRESHOLD = 3;

// ─── Generators ────────────────────────────────────────────────────────────

/**
 * Generate an array of unmuted clips that meet the density threshold
 * (≥3 unmuted clips). Clips are placed within the song duration.
 */
function clipsAboveDensityArb(songDuration: number): fc.Arbitrary<ClipInfo[]> {
  // Generate at least 3 unmuted clips to meet the clip count threshold
  return fc
    .array(
      fc
        .tuple(
          fc.double({ min: 0, max: songDuration * 0.9, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 1, max: songDuration * 0.3, noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 0, max: 9 }),
        )
        .map(([start, length, trackIndex]): ClipInfo => ({
          startTime: start,
          endTime: start + length,
          muted: false,
          trackIndex,
          trackName: `Track ${trackIndex}`,
        })),
      { minLength: CLIP_COUNT_THRESHOLD, maxLength: 15 },
    );
}

/**
 * Generate a timeline state that will pass through to the genre gate:
 * - locators = 0 (readLocators returns [])
 * - clips meet density threshold (≥3 unmuted clips)
 * - selectedGenreId = null
 */
const genreGateInputArb: fc.Arbitrary<{
  clips: ClipInfo[];
  songDuration: number;
  trackCount: number;
}> = fc
  .double({ min: 30, max: 10000, noNaN: true, noDefaultInfinity: true })
  .chain((songDuration) =>
    fc.tuple(
      clipsAboveDensityArb(songDuration),
      fc.constant(songDuration),
      fc.integer({ min: 1, max: 50 }),
    ),
  )
  .map(([clips, songDuration, trackCount]) => ({
    clips,
    songDuration,
    trackCount,
  }));

// ─── Mock Factory ──────────────────────────────────────────────────────────

function createMocks(params: {
  clips: ClipInfo[];
  songDuration: number;
  trackCount: number;
}): { input: AutoPlaceInput; createCuePointMock: ReturnType<typeof vi.fn> } {
  const createCuePointMock = vi.fn();

  const sdk = {
    readLocators: () => [],
    readAllClips: () => params.clips,
    readSongDuration: () => params.songDuration,
    readTracks: () => Array(params.trackCount).fill(null),
    createCuePoint: createCuePointMock,
  } as unknown as SdkAdapter;

  const store = {
    getState: () => ({ selectedGenreId: null }),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as unknown as Store;

  const input: AutoPlaceInput = {
    sdk,
    store,
    getSections: () => [],
  };

  return { input, createCuePointMock };
}

// ─── Property 2: Genre Gate Prevents Side Effects ──────────────────────────

// Feature: existing-arrangement-locator-placement, Property 2: Genre Gate Prevents Side Effects
describe("Property 2: Genre Gate Prevents Side Effects", () => {
  /**
   * **Validates: Requirements 2.2, 3.1, 3.2**
   *
   * For any timeline state (regardless of content density), when the selected
   * genre is null and locators are zero, `autoPlaceIfNeeded` SHALL return
   * "aborted" with reason "no-genre" AND zero CuePoint creation calls SHALL
   * be made to the SDK.
   */
  test.prop([genreGateInputArb], { numRuns: 100 })(
    "returns aborted/no-genre and makes zero SDK createCuePoint calls",
    async (params) => {
      const { input, createCuePointMock } = createMocks(params);

      const result = await autoPlaceIfNeeded(input);

      expect(result.outcome).toBe("aborted");
      expect(result).toEqual({
        outcome: "aborted",
        reason: "no-genre",
        message:
          "A genre must be selected before analysis can proceed. Use the genre selector at the top of the panel.",
      });

      // Zero SDK mutations
      expect(createCuePointMock).toHaveBeenCalledTimes(0);
    },
  );
});

// ─── Property 3: Genre Gate Idempotence ────────────────────────────────────

// Feature: existing-arrangement-locator-placement, Property 3: Genre Gate Idempotence
describe("Property 3: Genre Gate Idempotence", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any timeline state with no selected genre, calling autoPlaceIfNeeded
   * N times (N ≥ 1) SHALL produce N identical "aborted" results with reason
   * "no-genre", and the cumulative number of SDK mutation calls SHALL remain zero.
   */
  test.prop(
    [genreGateInputArb, fc.integer({ min: 1, max: 10 })],
    { numRuns: 100 },
  )(
    "N calls produce N identical aborted/no-genre results with zero cumulative SDK mutations",
    async (params, n) => {
      const { input, createCuePointMock } = createMocks(params);

      const expectedResult = {
        outcome: "aborted",
        reason: "no-genre",
        message:
          "A genre must be selected before analysis can proceed. Use the genre selector at the top of the panel.",
      };

      // Call N times
      const results = [];
      for (let i = 0; i < n; i++) {
        results.push(await autoPlaceIfNeeded(input));
      }

      // All N results must be identical aborted/no-genre
      for (let i = 0; i < n; i++) {
        expect(results[i]).toEqual(expectedResult);
      }

      // Cumulative createCuePoint calls remain zero
      expect(createCuePointMock).toHaveBeenCalledTimes(0);
    },
  );
});
