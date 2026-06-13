// Feature: m1-foundation, Property 3: Track inventory preserves name and type

import { test, fc } from "@fast-check/vitest";
import { expect } from "vitest";
import { buildTrackInventory } from "../../src/core/track-reader.js";
import type { TrackData } from "../../src/ableton/sdk-adapter.js";

/**
 * **Validates: Requirements 5.2**
 *
 * Property 3: For any array of TrackData objects, buildTrackInventory SHALL
 * produce a TrackInfo array where each entry preserves the original track's
 * name and type classification unchanged.
 */
test.prop(
  [
    fc.array(
      fc.record({
        name: fc.string(),
        type: fc.constantFrom("midi" as const, "audio" as const),
      })
    ),
  ],
  { numRuns: 100 }
)(
  "buildTrackInventory preserves name and type for all inputs",
  (tracks: TrackData[]) => {
    const result = buildTrackInventory(tracks);

    // Output length matches input length
    expect(result).toHaveLength(tracks.length);

    // Each entry preserves name and type unchanged
    for (let i = 0; i < tracks.length; i++) {
      expect(result[i]!.name).toBe(tracks[i]!.name);
      expect(result[i]!.type).toBe(tracks[i]!.type);
    }
  }
);
