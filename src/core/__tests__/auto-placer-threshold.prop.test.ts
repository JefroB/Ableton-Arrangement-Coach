/**
 * Property-based tests for Partial Placement Threshold.
 *
 * Feature: existing-arrangement-locator-placement, Property 12: Partial Placement Threshold
 *
 * **Validates: Requirements 8.3, 8.4**
 *
 * Verifies:
 * - markersCreated >= 3 proceeds (returns placed)
 * - markersCreated < 3 triggers rollback and failure
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import type { SdkAdapter, CuePointHandle } from "../../ableton/sdk-adapter.js";
import type { Store } from "../../state/store.js";
import type { Section } from "../section-scanner.js";

// ─── Module Mocks (hoisted) ────────────────────────────────────────────────────

// Track what computeContentMarkers will return (set per-test via closure)
let contentMarkersResult: { name: string; beatPosition: number }[] = [];
let minimalMarkersResult: { name: string; beatPosition: number }[] = [];

vi.mock("../content-mode.js", () => ({
  computeContentMarkers: vi.fn(() => contentMarkersResult),
}));

vi.mock("../minimal-mode.js", () => ({
  computeMinimalMarkers: vi.fn(() => minimalMarkersResult),
}));

vi.mock("../structure-registry.js", () => ({
  lookupVariants: vi.fn(() => [
    {
      id: "test-variant",
      name: "Test Variant",
      sections: [
        { id: "s1", name: "Intro", startBeat: 0, endBeat: 16 },
        { id: "s2", name: "Verse", startBeat: 16, endBeat: 48 },
        { id: "s3", name: "Chorus", startBeat: 48, endBeat: 80 },
        { id: "s4", name: "Bridge", startBeat: 80, endBeat: 96 },
        { id: "s5", name: "Outro", startBeat: 96, endBeat: 128 },
      ],
    },
  ]),
}));

vi.mock("../section-generator.js", () => ({
  selectVariant: vi.fn(() => ({
    id: "test-variant",
    name: "Test Variant",
    sections: [
      { id: "s1", name: "Intro", startBeat: 0, endBeat: 16 },
      { id: "s2", name: "Verse", startBeat: 16, endBeat: 48 },
      { id: "s3", name: "Chorus", startBeat: 48, endBeat: 80 },
      { id: "s4", name: "Bridge", startBeat: 80, endBeat: 96 },
      { id: "s5", name: "Outro", startBeat: 96, endBeat: 128 },
    ],
  })),
}));

vi.mock("../mode-selector.js", () => ({
  selectMode: vi.fn(() => "content"),
}));

// Import after mocks are set up
import { autoPlaceIfNeeded } from "../auto-placer.js";

// ─── Generators ────────────────────────────────────────────────────────────────

/**
 * Generate a total marker count and a unique set of failure indices.
 * failureIndices is a subset of [0..totalMarkers-1] representing which
 * markers will throw during createCuePoint.
 */
const thresholdInputArb = fc
  .integer({ min: 3, max: 10 })
  .chain((totalMarkers) =>
    fc
      .uniqueArray(fc.integer({ min: 0, max: totalMarkers - 1 }), {
        minLength: 0,
        maxLength: totalMarkers,
      })
      .map((failureIndices) => ({ totalMarkers, failureIndices })),
  );

// ─── Property 12: Partial Placement Threshold ──────────────────────────────────

describe("Property 12: Partial Placement Threshold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 8.3, 8.4**
   *
   * For any auto-placement attempt that partially succeeds:
   * - If markersCreated >= 3: outcome is "placed", markersCreated equals success count
   * - If markersCreated < 3: outcome is "failed", reason is "too-few-markers",
   *   and deleteCuePoint was called for each successfully created handle (rollback)
   */
  test.prop([thresholdInputArb], { numRuns: 100 })(
    "threshold behavior: >= 3 placed proceeds, < 3 triggers rollback",
    async ({ totalMarkers, failureIndices }) => {
      // Track which handles were successfully created
      const createdHandles: CuePointHandle[] = [];
      const deletedHandles: CuePointHandle[] = [];

      // Generate markers array that computeContentMarkers will return
      const markers = Array.from({ length: totalMarkers }, (_, i) => ({
        name: `Section ${i}`,
        beatPosition: i * 8, // 8 beats apart
      }));

      // Set the mock return value for this iteration
      contentMarkersResult = markers;
      minimalMarkersResult = markers;

      // Build mock SDK where specific indices fail
      const failureSet = new Set(failureIndices);
      let markerIndex = 0;

      const mockSdk = {
        readLocators: () => [],
        readAllClips: () => [
          { startTime: 0, endTime: 200, muted: false, trackIndex: 0, trackName: "Track 1" },
          { startTime: 10, endTime: 80, muted: false, trackIndex: 1, trackName: "Track 2" },
          { startTime: 50, endTime: 150, muted: false, trackIndex: 2, trackName: "Track 3" },
        ],
        readSongDuration: () => 300,
        readTracks: () => [
          { name: "Track 1", index: 0 },
          { name: "Track 2", index: 1 },
          { name: "Track 3", index: 2 },
        ],
        createCuePoint: async (beatPosition: number): Promise<CuePointHandle> => {
          const idx = markerIndex++;
          if (failureSet.has(idx)) {
            throw new Error(`Creation failed for marker at beat ${beatPosition}`);
          }
          const handle: CuePointHandle = { name: "", time: beatPosition };
          createdHandles.push(handle);
          return handle;
        },
        deleteCuePoint: async (handle: CuePointHandle): Promise<void> => {
          deletedHandles.push(handle);
        },
      } as unknown as SdkAdapter;

      // Mock store with genre selected
      const mockStore = {
        getState: () => ({ selectedGenreId: "techno" }),
        dispatch: () => {},
        subscribe: () => () => {},
      } as unknown as Store;

      const input = {
        sdk: mockSdk,
        store: mockStore,
        getSections: () => [] as Section[],
      };

      // Execute
      const result = await autoPlaceIfNeeded(input);

      // Compute expected success count
      const successCount = totalMarkers - failureIndices.length;

      if (successCount >= 3) {
        // Req 8.3: markersCreated >= 3 proceeds with placed outcome
        expect(result.outcome).toBe("placed");
        if (result.outcome === "placed") {
          expect(result.markersCreated).toBe(successCount);
          expect(result.markersExpected).toBe(totalMarkers);
        }
        // No rollback should happen
        expect(deletedHandles.length).toBe(0);
      } else {
        // Req 8.4: markersCreated < 3 triggers rollback and failure
        expect(result.outcome).toBe("failed");
        if (result.outcome === "failed") {
          expect(result.reason).toBe("too-few-markers");
          expect(result.markersCreated).toBe(successCount);
          expect(result.markersExpected).toBe(totalMarkers);
        }
        // Verify rollback: deleteCuePoint called for each successfully created handle
        expect(deletedHandles.length).toBe(createdHandles.length);
      }
    },
  );
});
