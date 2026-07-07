/**
 * Property-based tests for autoPlaceIfNeeded content mode fallback (Property 4).
 *
 * Feature: existing-arrangement-locator-placement, Property 4: Content Mode Fallback
 *
 * **Validates: Requirements 2.3**
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// Mock modules BEFORE importing the module under test
vi.mock("../content-mode.js", () => ({
  computeContentMarkers: vi.fn(),
}));

vi.mock("../minimal-mode.js", () => ({
  computeMinimalMarkers: vi.fn(),
}));

vi.mock("../structure-registry.js", () => ({
  lookupVariants: vi.fn(),
}));

vi.mock("../section-generator.js", () => ({
  selectVariant: vi.fn(),
}));

import { autoPlaceIfNeeded, type AutoPlaceInput, type ClipInfo } from "../auto-placer.js";
import { computeContentMarkers } from "../content-mode.js";
import { computeMinimalMarkers } from "../minimal-mode.js";
import { lookupVariants } from "../structure-registry.js";
import { selectVariant } from "../section-generator.js";
import type { SdkAdapter } from "../../ableton/sdk-adapter.js";
import type { Store } from "../../state/store.js";

// ——— Constants ———————————————————————————————————————————————————————————————

const CLIP_COUNT_THRESHOLD = 3;

// ——— Generators ——————————————————————————————————————————————————————————————

/**
 * Generate an array of unmuted clips that meet the density threshold
 * (≥3 unmuted clips). Clips are placed within the song duration.
 */
function clipsAboveDensityArb(songDuration: number): fc.Arbitrary<ClipInfo[]> {
  return fc.array(
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
 * Arbitrary for the fallback scenario inputs:
 * - songDuration between 30 and 600
 * - trackCount between 1 and 20
 * - clips meeting density threshold (≥3 unmuted)
 * - contentMarkerCount between 0 and 2 (triggers fallback)
 */
const fallbackInputArb: fc.Arbitrary<{
  clips: ClipInfo[];
  songDuration: number;
  trackCount: number;
  contentMarkerCount: number;
}> = fc
  .double({ min: 30, max: 600, noNaN: true, noDefaultInfinity: true })
  .chain((songDuration) =>
    fc.tuple(
      clipsAboveDensityArb(songDuration),
      fc.constant(songDuration),
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 0, max: 2 }),
    ),
  )
  .map(([clips, songDuration, trackCount, contentMarkerCount]) => ({
    clips,
    songDuration,
    trackCount,
    contentMarkerCount,
  }));

// ——— Property 4: Content Mode Fallback ———————————————————————————————————————

// Feature: existing-arrangement-locator-placement, Property 4: Content Mode Fallback
describe("Property 4: Content Mode Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * For any clip set producing fewer than 3 detected boundaries from
   * computeContentMarkers, the auto-placer SHALL fall back to
   * computeMinimalMarkers and still produce a non-empty marker array
   * (assuming valid genre variants exist).
   */
  test.prop([fallbackInputArb], { numRuns: 100 })(
    "falls back to minimal mode when content mode returns < 3 markers and produces non-empty result",
    async ({ clips, songDuration, trackCount, contentMarkerCount }) => {
      // Configure computeContentMarkers to return fewer than 3 markers
      const contentMarkers = Array.from({ length: contentMarkerCount }, (_, i) => ({
        name: `Content${i}`,
        beatPosition: i * 16,
      }));
      vi.mocked(computeContentMarkers).mockReturnValue(contentMarkers);

      // Configure computeMinimalMarkers to return a known non-empty array (3 markers)
      const minimalMarkers = [
        { name: "Intro", beatPosition: 0 },
        { name: "Break", beatPosition: 32 },
        { name: "Drop", beatPosition: 64 },
      ];
      vi.mocked(computeMinimalMarkers).mockReturnValue(minimalMarkers);

      // Configure lookupVariants to return a valid variant array
      const variants = [
        {
          id: "test-variant",
          sections: [
            { label: "Intro", bars: 8 },
            { label: "Break", bars: 8 },
            { label: "Drop", bars: 8 },
          ],
        },
      ];
      vi.mocked(lookupVariants).mockReturnValue(variants as any);

      // Configure selectVariant to return first variant
      vi.mocked(selectVariant).mockReturnValue(variants[0] as any);

      // Set up SDK mock — 0 locators, clips above threshold, genre selected
      const sdk = {
        readLocators: () => [],
        readAllClips: () => clips,
        readSongDuration: () => songDuration,
        readTracks: () => Array.from({ length: trackCount }, (_, i) => ({ name: `Track ${i}`, index: i })),
        createCuePoint: vi.fn().mockResolvedValue({ name: "", time: 0 }),
      } as unknown as SdkAdapter;

      const store = {
        getState: () => ({ selectedGenreId: "techno" }),
        dispatch: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } as unknown as Store;

      const input: AutoPlaceInput = {
        sdk,
        store,
        getSections: () => [],
      };

      // Execute
      const result = await autoPlaceIfNeeded(input);

      // Verify fallback occurred and produced markers
      expect(result.outcome).toBe("placed");
      if (result.outcome === "placed") {
        expect(result.markersExpected).toBeGreaterThan(0);
        // markersExpected should equal minimalMarkers length since fallback was used
        expect(result.markersExpected).toBe(minimalMarkers.length);
      }

      // Verify computeMinimalMarkers was invoked (proving fallback)
      expect(computeMinimalMarkers).toHaveBeenCalled();
    },
  );
});
