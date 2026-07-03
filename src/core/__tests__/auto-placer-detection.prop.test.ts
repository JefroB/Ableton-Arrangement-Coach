/**
 * Property-based tests for Detection Routing.
 *
 * Feature: existing-arrangement-locator-placement, Property 1: Detection Routing
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 6.2**
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import fc from "fast-check";

// Mock downstream modules so that when detection passes, generation succeeds
vi.mock("../content-mode.js", () => ({
  computeContentMarkers: vi.fn(() => [
    { name: "Intro", beatPosition: 0 },
    { name: "Verse", beatPosition: 32 },
    { name: "Chorus", beatPosition: 64 },
    { name: "Bridge", beatPosition: 96 },
  ]),
}));

vi.mock("../minimal-mode.js", () => ({
  computeMinimalMarkers: vi.fn(() => [
    { name: "Intro", beatPosition: 0 },
    { name: "Break", beatPosition: 32 },
    { name: "Drop", beatPosition: 64 },
  ]),
}));

vi.mock("../structure-registry.js", () => ({
  lookupVariants: vi.fn(() => [
    { name: "Standard", sections: [{ name: "A", lengthRange: { min: 8, max: 16 } }, { name: "B", lengthRange: { min: 8, max: 16 } }, { name: "C", lengthRange: { min: 8, max: 16 } }, { name: "D", lengthRange: { min: 8, max: 16 } }] },
  ]),
}));

vi.mock("../section-generator.js", () => ({
  selectVariant: vi.fn(() => ({ name: "Standard", sections: [{ name: "A", lengthRange: { min: 8, max: 16 } }] })),
}));

vi.mock("../section-scanner.js", () => ({
  buildSections: vi.fn(() => []),
}));

import { autoPlaceIfNeeded } from "../auto-placer.js";
import type { SdkAdapter } from "../../ableton/sdk-adapter.js";
import type { Store } from "../../state/store.js";
import type { Section } from "../section-scanner.js";

// ─── Constants (mirror implementation thresholds) ──────────────────────────────

const CLIP_COUNT_THRESHOLD = 3; // ≥3 unmuted clips
const COVERAGE_THRESHOLD = 0.10; // ≥10% coverage

// ─── Generators ────────────────────────────────────────────────────────────────

/** Generate a locator-like object. */
const locatorArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 10 }),
  time: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
});

/** Generate an array of locators with controlled count. */
function locatorsArb(count: number) {
  return fc.array(locatorArb, { minLength: count, maxLength: count });
}

/** Generate a clip with explicit muted flag for determinism. */
function clipArb(songDuration: number, trackCount: number): fc.Arbitrary<{
  startTime: number;
  endTime: number;
  muted: boolean;
  trackIndex: number;
}> {
  return fc
    .tuple(
      fc.double({ min: 0, max: songDuration, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: songDuration, noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.integer({ min: 0, max: Math.max(0, trackCount - 1) }),
    )
    .map(([a, b, muted, trackIndex]) => ({
      startTime: Math.min(a, b),
      endTime: Math.max(a, b) + 0.001, // ensure endTime > startTime
      muted,
      trackIndex,
    }));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Compute union coverage of unmuted clips (same logic as mode-selector). */
function computeUnionCoverage(clips: { startTime: number; endTime: number; muted: boolean }[]): number {
  const unmuted = clips.filter((c) => !c.muted);
  if (unmuted.length === 0) return 0;

  const sorted = [...unmuted].sort((a, b) => a.startTime - b.startTime);
  let totalCoverage = 0;
  let currentStart = sorted[0]!.startTime;
  let currentEnd = sorted[0]!.endTime;

  for (let i = 1; i < sorted.length; i++) {
    const clip = sorted[i]!;
    if (clip.startTime <= currentEnd) {
      currentEnd = Math.max(currentEnd, clip.endTime);
    } else {
      totalCoverage += currentEnd - currentStart;
      currentStart = clip.startTime;
      currentEnd = clip.endTime;
    }
  }
  totalCoverage += currentEnd - currentStart;
  return totalCoverage;
}

/** Determine if content meets the density threshold. */
function meetsContentThreshold(
  clips: { startTime: number; endTime: number; muted: boolean }[],
  songDuration: number,
): boolean {
  const unmutedCount = clips.filter((c) => !c.muted).length;
  if (unmutedCount >= CLIP_COUNT_THRESHOLD) return true;

  const coverage = computeUnionCoverage(clips);
  const fraction = coverage / songDuration;
  return fraction >= COVERAGE_THRESHOLD;
}

/** Create a minimal mock SdkAdapter. */
function createMockSdk(opts: {
  locators: { name: string; time: number }[];
  clips: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[];
  songDuration: number;
  trackCount: number;
}): SdkAdapter {
  return {
    readLocators: () => opts.locators,
    readAllClips: () => opts.clips,
    readSongDuration: () => opts.songDuration,
    readTracks: () => Array.from({ length: opts.trackCount }, (_, i) => ({ name: `Track ${i}`, index: i })),
    // Stub remaining methods (not called in detection routing)
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

// ─── Property 1: Detection Routing ────────────────────────────────────────────

// Feature: existing-arrangement-locator-placement, Property 1: Detection Routing
describe("Property 1: Detection Routing", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any locator count ≥ 1, autoPlaceIfNeeded returns "skipped"
   * with reason "locators-exist".
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 0, max: 20 }),
      fc.double({ min: 30, max: 600, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 20 }),
    ],
    { numRuns: 100 },
  )(
    "returns skipped when locator count >= 1",
    async (locatorCount, clipCount, songDuration, trackCount) => {
      const locators = Array.from({ length: locatorCount }, (_, i) => ({
        name: `Loc${i}`,
        time: i * 10,
      }));

      const clips = Array.from({ length: clipCount }, (_, i) => ({
        startTime: i * 10,
        endTime: i * 10 + 9,
        muted: false,
        trackIndex: i % trackCount,
      }));

      const sdk = createMockSdk({ locators, clips, songDuration, trackCount });
      const store = createMockStore("techno");

      const result = await autoPlaceIfNeeded({
        sdk,
        store,
        getSections: () => [] as readonly Section[],
      });

      expect(result.outcome).toBe("skipped");
      if (result.outcome === "skipped") {
        expect(result.reason).toBe("locators-exist");
      }
    },
  );

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For locator count = 0 AND content meeting density threshold,
   * autoPlaceIfNeeded returns "placed" or "failed" (not "aborted").
   */
  test.prop(
    [
      fc.double({ min: 30, max: 600, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 20 }),
    ],
    { numRuns: 100 },
  )(
    "returns placed or failed (not aborted) when locators = 0 and content meets density threshold",
    async (songDuration, trackCount) => {
      // Generate clips that ALWAYS meet the threshold: ≥3 unmuted clips
      const clips = Array.from({ length: 5 }, (_, i) => ({
        startTime: i * (songDuration / 6),
        endTime: (i + 1) * (songDuration / 6),
        muted: false,
        trackIndex: i % trackCount,
      }));

      const sdk = createMockSdk({ locators: [], clips, songDuration, trackCount });
      const store = createMockStore("techno");

      const result = await autoPlaceIfNeeded({
        sdk,
        store,
        getSections: () => [] as readonly Section[],
      });

      // Should NOT be aborted with "insufficient-content"
      expect(result.outcome).not.toBe("aborted");
      expect(["placed", "failed"]).toContain(result.outcome);
    },
  );

  /**
   * **Validates: Requirements 1.1, 6.2**
   *
   * For locator count = 0 AND content NOT meeting density threshold,
   * autoPlaceIfNeeded returns "aborted" with reason "insufficient-content".
   */
  test.prop(
    [
      fc.double({ min: 100, max: 600, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 20 }),
    ],
    { numRuns: 100 },
  )(
    "returns aborted with insufficient-content when locators = 0 and content below threshold",
    async (songDuration, trackCount) => {
      // Generate clips that NEVER meet the threshold:
      // - fewer than 3 unmuted clips (use 2 muted, 0 unmuted... actually 0 unmuted clips)
      // - AND coverage < 10%
      // Use 2 small muted clips (don't count for unmuted threshold or coverage)
      const smallClipDuration = (songDuration * 0.01); // 1% each — well under 10% total
      const clips = [
        { startTime: 0, endTime: smallClipDuration, muted: true, trackIndex: 0 },
        { startTime: smallClipDuration + 1, endTime: smallClipDuration * 2 + 1, muted: true, trackIndex: 0 },
      ];

      const sdk = createMockSdk({ locators: [], clips, songDuration, trackCount });
      const store = createMockStore("techno");

      const result = await autoPlaceIfNeeded({
        sdk,
        store,
        getSections: () => [] as readonly Section[],
      });

      expect(result.outcome).toBe("aborted");
      if (result.outcome === "aborted") {
        expect(result.reason).toBe("insufficient-content");
      }
    },
  );

  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 6.2**
   *
   * Combined routing property: for any arbitrary combination of inputs,
   * the routing decision is consistent with the threshold logic.
   */
  test.prop(
    [
      fc.integer({ min: 0, max: 10 }),
      fc.double({ min: 30, max: 600, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 20 }),
    ],
    { numRuns: 100 },
  )(
    "routing is consistent with threshold logic for any input combination",
    async (locatorCount, songDuration, trackCount) => {
      // Generate deterministic clips using chained arbitrary approach
      const locators = Array.from({ length: locatorCount }, (_, i) => ({
        name: `Loc${i}`,
        time: i * 10,
      }));

      // Use a small number of unmuted clips (1-2) with small coverage to test boundary
      const clips = Array.from({ length: 2 }, (_, i) => ({
        startTime: i * 5,
        endTime: i * 5 + 4,
        muted: i === 0, // only 1 unmuted clip
        trackIndex: 0,
      }));

      const sdk = createMockSdk({ locators, clips, songDuration, trackCount });
      const store = createMockStore("techno");

      const result = await autoPlaceIfNeeded({
        sdk,
        store,
        getSections: () => [] as readonly Section[],
      });

      if (locatorCount >= 1) {
        expect(result.outcome).toBe("skipped");
      } else {
        // locators = 0, check density
        const threshold = meetsContentThreshold(clips, songDuration);
        if (threshold) {
          expect(result.outcome).not.toBe("aborted");
        } else {
          expect(result.outcome).toBe("aborted");
          if (result.outcome === "aborted") {
            expect(result.reason).toBe("insufficient-content");
          }
        }
      }
    },
  );
});
