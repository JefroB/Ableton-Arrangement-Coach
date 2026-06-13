import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { AudioLruCache } from "./audio-lru-cache.js";
import type {
  AudioCacheKey,
  AudioTrackSectionResult,
  SpectralProfile,
  AudioRoleResult,
} from "./audio-content-types.js";

// Feature: audio-content-analysis, Property 13: LRU cache size invariant

// ─── Helpers ───────────────────────────────────────────────────────────

/** Generate an arbitrary AudioCacheKey with unique-ish fields. */
function arbitraryCacheKey(): fc.Arbitrary<AudioCacheKey> {
  return fc.record({
    trackName: fc.string({ minLength: 1, maxLength: 20 }),
    sectionStartBeat: fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    sectionEndBeat: fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  });
}

/** Generate a minimal valid AudioTrackSectionResult. */
function arbitraryResult(): fc.Arbitrary<AudioTrackSectionResult> {
  const spectralProfile: SpectralProfile = {
    bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
    meanCentroid: 2000,
    centroidPerWindow: [2000],
    meanSpectralFlux: 0.3,
  };

  const role: AudioRoleResult = {
    role: "unclassified",
    confidence: 0.5,
    nameOverridden: false,
  };

  return fc.record({
    rmsDbfs: fc.float({ min: -96, max: 0, noNaN: true, noDefaultInfinity: true }),
    normalizedEnergy: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    spectralProfile: fc.constant(spectralProfile),
    transientDensity: fc.float({ min: 0, max: 32, noNaN: true, noDefaultInfinity: true }),
    rhythmicClassification: fc.constantFrom(
      "silent" as const,
      "sustained/textural" as const,
      "rhythmically moderate" as const,
      "rhythmically dense" as const,
    ),
    role: fc.constant(role),
  });
}

/**
 * Generate a list of unique AudioCacheKeys by using index-based track names.
 * This guarantees uniqueness for cache-overflow testing.
 */
function uniqueCacheKeys(count: number): fc.Arbitrary<AudioCacheKey[]> {
  return fc.constant(
    Array.from({ length: count }, (_, i) => ({
      trackName: `track-${i}`,
      sectionStartBeat: i * 4,
      sectionEndBeat: (i + 1) * 4,
    })),
  );
}

// ─── Property 13: LRU cache size invariant ─────────────────────────────

/**
 * **Validates: Requirements 10.6**
 *
 * Property 13: LRU cache size invariant
 * For any sequence of cache insertions, the audio results cache SHALL never
 * contain more than 200 entries. After the 201st insertion, the least-recently-used
 * entry SHALL be evicted.
 */
describe("Audio LRU Cache — Property 13: LRU cache size invariant", () => {
  fcTest.prop(
    [fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 100 })],
    { numRuns: 100 },
  )(
    "cache.size() never exceeds maxEntries after any sequence of set() operations",
    (maxEntries, insertionCount) => {
      const cache = new AudioLruCache(maxEntries);
      const totalInsertions = maxEntries + insertionCount;

      for (let i = 0; i < totalInsertions; i++) {
        const key: AudioCacheKey = {
          trackName: `track-${i}`,
          sectionStartBeat: i * 4,
          sectionEndBeat: (i + 1) * 4,
        };
        const result: AudioTrackSectionResult = {
          rmsDbfs: -20,
          normalizedEnergy: 0.67,
          spectralProfile: {
            bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
            meanCentroid: 2000,
            centroidPerWindow: [2000],
            meanSpectralFlux: 0.3,
          },
          transientDensity: 4,
          rhythmicClassification: "rhythmically moderate",
          role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
        };

        cache.set(key, result);
        expect(cache.size()).toBeLessThanOrEqual(maxEntries);
      }
    },
  );

  fcTest.prop(
    [fc.integer({ min: 2, max: 20 }), fc.integer({ min: 1, max: 50 })],
    { numRuns: 100 },
  )(
    "after inserting maxEntries + N unique items, cache.size() === maxEntries",
    (maxEntries, extraInsertions) => {
      const cache = new AudioLruCache(maxEntries);
      const totalInsertions = maxEntries + extraInsertions;

      for (let i = 0; i < totalInsertions; i++) {
        const key: AudioCacheKey = {
          trackName: `track-${i}`,
          sectionStartBeat: i * 4,
          sectionEndBeat: (i + 1) * 4,
        };
        const result: AudioTrackSectionResult = {
          rmsDbfs: -20,
          normalizedEnergy: 0.67,
          spectralProfile: {
            bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
            meanCentroid: 2000,
            centroidPerWindow: [2000],
            meanSpectralFlux: 0.3,
          },
          transientDensity: 4,
          rhythmicClassification: "rhythmically moderate",
          role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
        };

        cache.set(key, result);
      }

      expect(cache.size()).toBe(maxEntries);
    },
  );

  fcTest.prop(
    [fc.integer({ min: 3, max: 20 })],
    { numRuns: 100 },
  )(
    "evicted entries are the least-recently-used ones (oldest not accessed)",
    (maxEntries) => {
      const cache = new AudioLruCache(maxEntries);

      // Fill the cache to capacity
      for (let i = 0; i < maxEntries; i++) {
        const key: AudioCacheKey = {
          trackName: `track-${i}`,
          sectionStartBeat: i * 4,
          sectionEndBeat: (i + 1) * 4,
        };
        const result: AudioTrackSectionResult = {
          rmsDbfs: -20,
          normalizedEnergy: 0.67,
          spectralProfile: {
            bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
            meanCentroid: 2000,
            centroidPerWindow: [2000],
            meanSpectralFlux: 0.3,
          },
          transientDensity: 4,
          rhythmicClassification: "rhythmically moderate",
          role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
        };
        cache.set(key, result);
      }

      // Insert one more — should evict the first entry (track-0)
      const newKey: AudioCacheKey = {
        trackName: "new-track",
        sectionStartBeat: 999,
        sectionEndBeat: 1003,
      };
      const newResult: AudioTrackSectionResult = {
        rmsDbfs: -10,
        normalizedEnergy: 0.83,
        spectralProfile: {
          bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
          meanCentroid: 2000,
          centroidPerWindow: [2000],
          meanSpectralFlux: 0.3,
        },
        transientDensity: 4,
        rhythmicClassification: "rhythmically moderate",
        role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
      };
      cache.set(newKey, newResult);

      // The LRU entry (track-0) should have been evicted
      const evictedKey: AudioCacheKey = {
        trackName: "track-0",
        sectionStartBeat: 0,
        sectionEndBeat: 4,
      };
      expect(cache.get(evictedKey)).toBeUndefined();

      // The newest entry should still be present
      expect(cache.get(newKey)).toBeDefined();

      // The second-oldest entry (track-1) should still be present
      const survivedKey: AudioCacheKey = {
        trackName: "track-1",
        sectionStartBeat: 4,
        sectionEndBeat: 8,
      };
      expect(cache.get(survivedKey)).toBeDefined();
    },
  );

  fcTest.prop(
    [fc.integer({ min: 3, max: 20 })],
    { numRuns: 100 },
  )(
    "get() marks an entry as recently used (it survives eviction)",
    (maxEntries) => {
      const cache = new AudioLruCache(maxEntries);

      // Fill the cache
      for (let i = 0; i < maxEntries; i++) {
        const key: AudioCacheKey = {
          trackName: `track-${i}`,
          sectionStartBeat: i * 4,
          sectionEndBeat: (i + 1) * 4,
        };
        const result: AudioTrackSectionResult = {
          rmsDbfs: -20,
          normalizedEnergy: 0.67,
          spectralProfile: {
            bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
            meanCentroid: 2000,
            centroidPerWindow: [2000],
            meanSpectralFlux: 0.3,
          },
          transientDensity: 4,
          rhythmicClassification: "rhythmically moderate",
          role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
        };
        cache.set(key, result);
      }

      // Access the oldest entry (track-0) to make it recently used
      const oldestKey: AudioCacheKey = {
        trackName: "track-0",
        sectionStartBeat: 0,
        sectionEndBeat: 4,
      };
      const retrieved = cache.get(oldestKey);
      expect(retrieved).toBeDefined();

      // Now insert enough new entries to evict all non-accessed entries
      // After accessing track-0, track-1 is now LRU
      const newKey: AudioCacheKey = {
        trackName: "new-track",
        sectionStartBeat: 999,
        sectionEndBeat: 1003,
      };
      const newResult: AudioTrackSectionResult = {
        rmsDbfs: -10,
        normalizedEnergy: 0.83,
        spectralProfile: {
          bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
          meanCentroid: 2000,
          centroidPerWindow: [2000],
          meanSpectralFlux: 0.3,
        },
        transientDensity: 4,
        rhythmicClassification: "rhythmically moderate",
        role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
      };
      cache.set(newKey, newResult);

      // track-0 should survive (was accessed, so it's recent)
      expect(cache.get(oldestKey)).toBeDefined();

      // track-1 should have been evicted (it was the LRU after track-0 was accessed)
      const evictedKey: AudioCacheKey = {
        trackName: "track-1",
        sectionStartBeat: 4,
        sectionEndBeat: 8,
      };
      expect(cache.get(evictedKey)).toBeUndefined();
    },
  );

  fcTest.prop(
    [fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 50 })],
    { numRuns: 100 },
  )(
    "invalidateCache() clears everything to size 0",
    (maxEntries, insertionCount) => {
      const cache = new AudioLruCache(maxEntries);

      // Insert some entries
      for (let i = 0; i < insertionCount; i++) {
        const key: AudioCacheKey = {
          trackName: `track-${i}`,
          sectionStartBeat: i * 4,
          sectionEndBeat: (i + 1) * 4,
        };
        const result: AudioTrackSectionResult = {
          rmsDbfs: -20,
          normalizedEnergy: 0.67,
          spectralProfile: {
            bands: { subBass: -40, bass: -30, lowMid: -20, mid: -15, highMid: -25, high: -35 },
            meanCentroid: 2000,
            centroidPerWindow: [2000],
            meanSpectralFlux: 0.3,
          },
          transientDensity: 4,
          rhythmicClassification: "rhythmically moderate",
          role: { role: "unclassified", confidence: 0.5, nameOverridden: false },
        };
        cache.set(key, result);
      }

      // Invalidate
      cache.invalidateCache();

      expect(cache.size()).toBe(0);

      // Verify entries are gone
      const checkKey: AudioCacheKey = {
        trackName: "track-0",
        sectionStartBeat: 0,
        sectionEndBeat: 4,
      };
      expect(cache.get(checkKey)).toBeUndefined();
    },
  );
});
