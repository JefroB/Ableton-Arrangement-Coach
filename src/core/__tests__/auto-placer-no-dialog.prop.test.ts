/**
 * Property-based tests for No Confirmation Dialog on Re-Analysis.
 *
 * Feature: existing-arrangement-locator-placement, Property 7: No Confirmation Dialog on Re-Analysis
 *
 * **Validates: Requirements 6.4**
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { autoPlaceIfNeeded } from "../auto-placer.js";
import type { SdkAdapter } from "../../ableton/sdk-adapter.js";
import type { Store } from "../../state/store.js";
import type { Section } from "../section-scanner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal mock SdkAdapter with the given locator count. */
function createMockSdk(opts: {
  locatorCount: number;
  clipCount: number;
  songDuration: number;
  trackCount: number;
}): SdkAdapter {
  const locators = Array.from({ length: opts.locatorCount }, (_, i) => ({
    name: `Loc${i}`,
    time: i * 10,
  }));

  const clips = Array.from({ length: opts.clipCount }, (_, i) => ({
    startTime: i * 10,
    endTime: i * 10 + 9,
    muted: false,
    trackIndex: i % opts.trackCount,
  }));

  return {
    readLocators: () => locators,
    readAllClips: () => clips,
    readSongDuration: () => opts.songDuration,
    readTracks: () => Array.from({ length: opts.trackCount }, (_, i) => ({ name: `Track ${i}`, index: i })),
    readArrangementClips: () => [],
    readMidiNotes: () => [],
    readDevices: () => [],
    readDeviceParameters: () => [],
    readSetFilePath: () => undefined,
    setAlsPathOverride: () => {},
    setAlsBufferOverride: () => {},
    getAlsBufferOverride: () => undefined,
    readAudioClips: () => [],
    readTempo: () => 120,
    readPlayheadPosition: () => 0,
    createCuePoint: async () => ({ name: "", time: 0 }),
    deleteCuePoint: async () => {},
    getSongFingerprint: () => "mock",
    getAudioClipPaths: () => [],
    showFileDialog: async () => undefined,
    renderAudioTrack: async () => ({ samples: new Float32Array(), sampleRate: 44100 }),
    getAudioTrackIndices: () => [],
    isTrackMuted: () => false,
    getSongName: () => "Mock Song",
  } as unknown as SdkAdapter;
}

/** Create a mock Store with genre selected. */
function createMockStore(genreId: string | null = "techno"): Store {
  return {
    getState: () => ({ selectedGenreId: genreId }) as any,
    dispatch: () => {},
    subscribe: () => () => {},
  };
}

// ─── Property 7: No Confirmation Dialog on Re-Analysis ────────────────────────
// Feature: existing-arrangement-locator-placement, Property 7: No Confirmation Dialog on Re-Analysis
describe("Property 7: No Confirmation Dialog on Re-Analysis", () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any analysis trigger where locators >= 1, autoPlaceIfNeeded returns
   * "skipped" outcome. Since the trigger integration code only sends
   * show_confirmation_dialog on "placed" outcomes, a "skipped" result
   * guarantees no confirmation dialog is emitted.
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 0, max: 10 }),
      fc.double({ min: 30, max: 600, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 20 }),
    ],
    { numRuns: 100 },
  )(
    "returns skipped (no dialog) when locators >= 1 regardless of timeline content",
    async (locatorCount, clipCount, songDuration, trackCount) => {
      const sdk = createMockSdk({ locatorCount, clipCount, songDuration, trackCount });
      const store = createMockStore("techno");

      const result = await autoPlaceIfNeeded({
        sdk,
        store,
        getSections: () => [] as readonly Section[],
      });

      // The outcome must always be "skipped" when locators exist.
      // This ensures no "placed" outcome occurs, which is the only
      // outcome that triggers show_confirmation_dialog in the trigger code.
      expect(result.outcome).toBe("skipped");
      if (result.outcome === "skipped") {
        expect(result.reason).toBe("locators-exist");
      }
    },
  );
});
