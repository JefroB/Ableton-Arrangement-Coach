import { describe, it, expect } from "vitest";
import {
  extractReferenceSections,
  extractReferenceSectionsFromClips,
} from "./reference-extractor.js";
import type { AudioClipData } from "./reference-types.js";
import type { LocatorData } from "../ableton/sdk-adapter.js";

describe("extractReferenceSections", () => {
  const baseClip: AudioClipData = {
    startTime: 0,
    endTime: 128,
    muted: false,
    filePath: "/audio/ref.wav",
    warping: true,
    warpMarkers: [
      { sampleTime: 0, beatTime: 0 },
      { sampleTime: 10, beatTime: 32 },
      { sampleTime: 20, beatTime: 64 },
      { sampleTime: 30, beatTime: 96 },
      { sampleTime: 40, beatTime: 128 },
    ],
  };

  it("returns sections from warp markers strictly between clip start/end", () => {
    const locators: LocatorData[] = [];
    const sections = extractReferenceSections(baseClip, locators);

    // Markers at 32, 64, 96 are strictly between 0 and 128 (3 markers → 4 sections)
    expect(sections).toHaveLength(4);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(32);
    expect(sections[1].startTime).toBe(32);
    expect(sections[1].endTime).toBe(64);
    expect(sections[2].startTime).toBe(64);
    expect(sections[2].endTime).toBe(96);
    expect(sections[3].startTime).toBe(96);
    expect(sections[3].endTime).toBe(128);
  });

  it("returns single section when fewer than 2 qualifying markers", () => {
    const clip: AudioClipData = {
      startTime: 0,
      endTime: 128,
      muted: false,
      filePath: "/audio/ref.wav",
      warping: true,
      warpMarkers: [
        { sampleTime: 0, beatTime: 0 },
        { sampleTime: 10, beatTime: 64 },
        { sampleTime: 20, beatTime: 128 },
      ],
    };
    const sections = extractReferenceSections(clip, []);

    // Only marker at beatTime=64 is strictly between 0 and 128 (1 marker < 2)
    expect(sections).toHaveLength(1);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(128);
    expect(sections[0].proportion).toBe(1.0);
  });

  it("returns single section when no qualifying markers exist", () => {
    const clip: AudioClipData = {
      startTime: 0,
      endTime: 128,
      muted: false,
      filePath: "/audio/ref.wav",
      warping: true,
      warpMarkers: [
        { sampleTime: 0, beatTime: 0 },
        { sampleTime: 40, beatTime: 128 },
      ],
    };
    const sections = extractReferenceSections(clip, []);

    expect(sections).toHaveLength(1);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(128);
    expect(sections[0].proportion).toBe(1.0);
  });

  it("assigns locator names when within 0.5 beats tolerance", () => {
    const locators: LocatorData[] = [
      { name: "Intro", time: 0 },
      { name: "Verse", time: 32.3 },
      { name: "Chorus", time: 64 },
      { name: "Outro", time: 96.5 },
    ];
    const sections = extractReferenceSections(baseClip, locators);

    expect(sections[0].label).toBe("Intro");
    expect(sections[1].label).toBe("Verse"); // 32.3 is within 0.5 of 32
    expect(sections[2].label).toBe("Chorus");
    expect(sections[3].label).toBe("Outro"); // 96.5 is within 0.5 of 96
  });

  it("assigns sequential fallback labels when locators are out of tolerance", () => {
    const locators: LocatorData[] = [
      { name: "Far Away", time: 10 }, // not near any boundary
    ];
    const sections = extractReferenceSections(baseClip, locators);

    expect(sections[0].label).toBe("Section 1");
    expect(sections[1].label).toBe("Section 2");
    expect(sections[2].label).toBe("Section 3");
    expect(sections[3].label).toBe("Section 4");
  });

  it("matches locator at exactly 0.5 beats but not at 0.51 beats", () => {
    // Section boundaries are at 0, 32, 64, 96, 128
    const locators: LocatorData[] = [
      { name: "Exact Boundary", time: 32.5 }, // exactly 0.5 from 32 → should match
      { name: "Just Outside", time: 64.51 },  // 0.51 from 64 → should NOT match
    ];
    const sections = extractReferenceSections(baseClip, locators);

    expect(sections[1].label).toBe("Exact Boundary"); // 32.5 is exactly 0.5 from 32
    expect(sections[2].label).toBe("Section 3");      // 64.51 exceeds tolerance, fallback
  });

  it("normalizes proportions to sum to 1.0", () => {
    const sections = extractReferenceSections(baseClip, []);

    const sum = sections.reduce((acc, s) => acc + s.proportion, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("proportions are correct for equal-length sections", () => {
    const sections = extractReferenceSections(baseClip, []);

    // 4 equal sections of 32 beats each in a 128-beat clip
    for (const section of sections) {
      expect(section.proportion).toBeCloseTo(0.25, 10);
    }
  });

  it("returns empty array for zero-duration clip", () => {
    const clip: AudioClipData = {
      startTime: 64,
      endTime: 64,
      muted: false,
      filePath: "/audio/ref.wav",
      warping: true,
      warpMarkers: [],
    };
    const sections = extractReferenceSections(clip, []);
    expect(sections).toHaveLength(0);
  });

  it("excludes warp markers at exactly clip start or end", () => {
    const clip: AudioClipData = {
      startTime: 16,
      endTime: 80,
      muted: false,
      filePath: "/audio/ref.wav",
      warping: true,
      warpMarkers: [
        { sampleTime: 0, beatTime: 16 }, // at start — excluded
        { sampleTime: 10, beatTime: 32 },
        { sampleTime: 20, beatTime: 48 },
        { sampleTime: 30, beatTime: 64 },
        { sampleTime: 40, beatTime: 80 }, // at end — excluded
      ],
    };
    const sections = extractReferenceSections(clip, []);

    // 3 qualifying markers → 4 sections
    expect(sections).toHaveLength(4);
    expect(sections[0].startTime).toBe(16);
    expect(sections[0].endTime).toBe(32);
    expect(sections[3].startTime).toBe(64);
    expect(sections[3].endTime).toBe(80);
  });

  it("sorts sections by start time regardless of marker input order", () => {
    const clip: AudioClipData = {
      startTime: 0,
      endTime: 100,
      muted: false,
      filePath: "/audio/ref.wav",
      warping: true,
      warpMarkers: [
        { sampleTime: 30, beatTime: 75 },
        { sampleTime: 10, beatTime: 25 },
        { sampleTime: 20, beatTime: 50 },
      ],
    };
    const sections = extractReferenceSections(clip, []);

    expect(sections[0].startTime).toBe(0);
    expect(sections[1].startTime).toBe(25);
    expect(sections[2].startTime).toBe(50);
    expect(sections[3].startTime).toBe(75);
  });
});

describe("extractReferenceSectionsFromClips", () => {
  it("returns empty array when no clips provided", () => {
    const sections = extractReferenceSectionsFromClips([], []);
    expect(sections).toHaveLength(0);
  });

  it("returns empty array when all clips are muted", () => {
    const clips: AudioClipData[] = [
      {
        startTime: 0,
        endTime: 128,
        muted: true,
        filePath: "/a.wav",
        warping: true,
        warpMarkers: [],
      },
      {
        startTime: 0,
        endTime: 64,
        muted: true,
        filePath: "/b.wav",
        warping: true,
        warpMarkers: [],
      },
    ];
    const sections = extractReferenceSectionsFromClips(clips, []);
    expect(sections).toHaveLength(0);
  });

  it("selects the longest non-muted clip", () => {
    const clips: AudioClipData[] = [
      {
        startTime: 0,
        endTime: 64,
        muted: false,
        filePath: "/short.wav",
        warping: true,
        warpMarkers: [
          { sampleTime: 5, beatTime: 16 },
          { sampleTime: 10, beatTime: 32 },
          { sampleTime: 15, beatTime: 48 },
        ],
      },
      {
        startTime: 0,
        endTime: 128,
        muted: false,
        filePath: "/long.wav",
        warping: true,
        warpMarkers: [
          { sampleTime: 10, beatTime: 32 },
          { sampleTime: 20, beatTime: 64 },
          { sampleTime: 30, beatTime: 96 },
        ],
      },
    ];
    const locators: LocatorData[] = [{ name: "Intro", time: 0 }];
    const sections = extractReferenceSectionsFromClips(clips, locators);

    // Longest clip is 128 beats with 3 internal markers → 4 sections
    expect(sections).toHaveLength(4);
    expect(sections[0].endTime).toBe(32);
  });

  it("selects earliest start time when durations tie", () => {
    const clips: AudioClipData[] = [
      {
        startTime: 32,
        endTime: 96,
        muted: false,
        filePath: "/later.wav",
        warping: true,
        warpMarkers: [],
      },
      {
        startTime: 0,
        endTime: 64,
        muted: false,
        filePath: "/earlier.wav",
        warping: true,
        warpMarkers: [],
      },
    ];
    const sections = extractReferenceSectionsFromClips(clips, []);

    // Both 64 beats duration; earlier start (0) wins
    expect(sections).toHaveLength(1);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(64);
  });

  it("excludes muted clips from selection", () => {
    const clips: AudioClipData[] = [
      {
        startTime: 0,
        endTime: 256,
        muted: true, // longest but muted
        filePath: "/muted-long.wav",
        warping: true,
        warpMarkers: [],
      },
      {
        startTime: 0,
        endTime: 64,
        muted: false,
        filePath: "/short-active.wav",
        warping: true,
        warpMarkers: [],
      },
    ];
    const sections = extractReferenceSectionsFromClips(clips, []);

    // Muted clip excluded, shorter non-muted clip used
    expect(sections).toHaveLength(1);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(64);
  });
});

// ─── Property-Based Tests ──────────────────────────────────────────────────────

import { test } from "@fast-check/vitest";
import fc from "fast-check";

/**
 * Property-based tests for Reference Extractor (M7).
 *
 * Feature: m7-reference-tracks
 *
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8
 */

// ─── Generators ────────────────────────────────────────────────────────────────

/** Generate a warp marker with valid non-negative values. */
const arbWarpMarker = fc.record({
  sampleTime: fc.integer({ min: 0, max: 10000 }),
  beatTime: fc.integer({ min: 0, max: 10000 }),
});

/**
 * Generate a valid AudioClipData with guaranteed:
 * - start < end (positive duration)
 * - At least 2 qualifying warp markers strictly between start and end
 * - All marker beat times are unique (distinct boundaries)
 */
const arbClipWith2PlusMarkers = fc
  .record({
    startTime: fc.integer({ min: 0, max: 500 }),
    duration: fc.integer({ min: 10, max: 500 }),
  })
  .chain(({ startTime, duration }) => {
    const endTime = startTime + duration;
    // Generate 2-10 unique internal marker positions strictly between start and end
    const markers = fc
      .uniqueArray(fc.integer({ min: startTime + 1, max: endTime - 1 }), {
        minLength: 2,
        maxLength: Math.min(10, duration - 1),
      });
    return markers.map((markerBeats) => ({
      startTime,
      endTime,
      muted: false as const,
      filePath: "/audio/ref.wav",
      warping: true as const,
      warpMarkers: markerBeats.map((beatTime, i) => ({
        sampleTime: i * 10,
        beatTime,
      })),
    }));
  });

/** Generate a locator with valid position. */
const arbLocator = (minTime: number, maxTime: number) =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    time: fc.float({
      min: Math.fround(minTime),
      max: Math.fround(maxTime),
      noNaN: true,
      noDefaultInfinity: true,
    }),
  });

/**
 * Generate a non-muted AudioClipData with at least minMarkers qualifying warp markers.
 * Useful for multi-clip property tests.
 */
const arbNonMutedClip = fc
  .record({
    startTime: fc.integer({ min: 0, max: 500 }),
    duration: fc.integer({ min: 1, max: 500 }),
    markerCount: fc.integer({ min: 0, max: 8 }),
  })
  .chain(({ startTime, duration, markerCount }) => {
    const endTime = startTime + duration;
    const markers =
      markerCount > 0 && duration > 1
        ? fc.array(
            fc.integer({ min: startTime + 1, max: endTime - 1 }),
            { minLength: markerCount, maxLength: markerCount },
          )
        : fc.constant([] as number[]);
    return markers.map((markerBeats) => ({
      startTime,
      endTime,
      muted: false as boolean,
      filePath: "/audio/clip.wav",
      warping: true as boolean,
      warpMarkers: markerBeats.map((beatTime, i) => ({
        sampleTime: i * 10,
        beatTime,
      })),
    }));
  });

/** Generate a muted AudioClipData. */
const arbMutedClip = fc
  .record({
    startTime: fc.integer({ min: 0, max: 500 }),
    duration: fc.integer({ min: 1, max: 500 }),
  })
  .map(({ startTime, duration }) => ({
    startTime,
    endTime: startTime + duration,
    muted: true as boolean,
    filePath: "/audio/muted.wav",
    warping: true as boolean,
    warpMarkers: [] as Array<{ sampleTime: number; beatTime: number }>,
  }));

// ─── Property 5: Reference sections form a complete partition of the clip ──────

describe("Feature: m7-reference-tracks, Property 5: Reference sections form a complete partition of the clip", () => {
  test.prop([arbClipWith2PlusMarkers], { numRuns: 100 })(
    "sections boundaries align with warp marker beat times, are ordered by start time, and proportions sum to 1.0",
    (clip) => {
      const sections = extractReferenceSections(clip, []);

      // Must produce at least 2 sections (since we have 2+ qualifying markers)
      expect(sections.length).toBeGreaterThanOrEqual(3); // markers+1 sections

      // Sections are ordered by start time
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i]!.startTime).toBeGreaterThanOrEqual(sections[i - 1]!.endTime);
      }

      // Sections are contiguous: section[i].endTime === section[i+1].startTime
      for (let i = 0; i < sections.length - 1; i++) {
        expect(sections[i]!.endTime).toBe(sections[i + 1]!.startTime);
      }

      // First section starts at clip.startTime
      expect(sections[0]!.startTime).toBe(clip.startTime);

      // Last section ends at clip.endTime
      expect(sections[sections.length - 1]!.endTime).toBe(clip.endTime);

      // Proportions sum to 1.0 (within floating-point tolerance of 0.001)
      const proportionSum = sections.reduce((sum, s) => sum + s.proportion, 0);
      expect(Math.abs(proportionSum - 1.0)).toBeLessThanOrEqual(0.001);

      // Each proportion is between 0 and 1
      for (const section of sections) {
        expect(section.proportion).toBeGreaterThanOrEqual(0);
        expect(section.proportion).toBeLessThanOrEqual(1);
      }

      // Section count = qualifying markers + 1 (all markers have unique beatTime)
      const qualifyingMarkers = clip.warpMarkers.filter(
        (m) => m.beatTime > clip.startTime && m.beatTime < clip.endTime,
      );
      expect(sections.length).toBe(qualifyingMarkers.length + 1);
    },
  );
});

// ─── Property 6: Locator-based labeling within tolerance ───────────────────────

describe("Feature: m7-reference-tracks, Property 6: Locator-based labeling within tolerance", () => {
  test.prop(
    [
      arbClipWith2PlusMarkers.chain((clip) => {
        // Generate locators that may or may not align with section boundaries
        const locators = fc.array(arbLocator(clip.startTime, clip.endTime), {
          minLength: 0,
          maxLength: 10,
        });
        return locators.map((locs) => ({ clip, locators: locs }));
      }),
    ],
    { numRuns: 100 },
  )(
    "sections within 0.5 beats of a locator get the locator name; others get sequential labels",
    ({ clip, locators }) => {
      const sections = extractReferenceSections(clip, locators);

      const TOLERANCE = 0.5;

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i]!;
        // Find if any locator is within tolerance of this section's start time
        const matchingLocator = locators.find(
          (loc) => Math.abs(loc.time - section.startTime) <= TOLERANCE,
        );

        if (matchingLocator) {
          // The section's label should be the locator's name
          expect(section.label).toBe(matchingLocator.name);
        } else {
          // The section should have a sequential "Section N" label
          expect(section.label).toBe(`Section ${i + 1}`);
        }
      }
    },
  );
});

// ─── Property 7: Correct clip selection for multi-clip reference tracks ────────

describe("Feature: m7-reference-tracks, Property 7: Correct clip selection for multi-clip reference tracks", () => {
  test.prop(
    [
      fc
        .array(arbNonMutedClip, { minLength: 2, maxLength: 6 })
        .chain((nonMutedClips) =>
          fc
            .array(arbMutedClip, { minLength: 0, maxLength: 3 })
            .map((mutedClips) => ({ nonMutedClips, mutedClips })),
        ),
    ],
    { numRuns: 100 },
  )(
    "selects the longest non-muted clip by duration; ties broken by earliest start time; muted clips excluded",
    ({ nonMutedClips, mutedClips }) => {
      // Combine all clips in random order
      const allClips = [...nonMutedClips, ...mutedClips];

      const sections = extractReferenceSectionsFromClips(allClips, []);

      // Determine expected clip: longest duration, earliest start for ties
      const expectedClip = nonMutedClips.reduce((best, current) => {
        const bestDuration = best.endTime - best.startTime;
        const currentDuration = current.endTime - current.startTime;

        if (currentDuration > bestDuration) {
          return current;
        }
        if (currentDuration === bestDuration && current.startTime < best.startTime) {
          return current;
        }
        return best;
      });

      // If the selected clip has fewer than 2 qualifying markers, it returns 1 section
      // Otherwise, it returns markers+1 sections
      if (sections.length > 0) {
        // The sections should come from the expected clip
        expect(sections[0]!.startTime).toBe(expectedClip.startTime);
        expect(sections[sections.length - 1]!.endTime).toBe(expectedClip.endTime);
      }

      // Muted clips should never be selected
      // Verify: if the longest overall clip is muted, sections should not use it
      const longestOverall = allClips.reduce((best, current) => {
        const bestDuration = best.endTime - best.startTime;
        const currentDuration = current.endTime - current.startTime;
        return currentDuration > bestDuration ? current : best;
      });

      if (longestOverall.muted && sections.length > 0) {
        // Sections should NOT span the muted clip
        expect(
          sections[0]!.startTime === longestOverall.startTime &&
            sections[sections.length - 1]!.endTime === longestOverall.endTime,
        ).toBe(false);
      }
    },
  );

  test.prop(
    [fc.array(arbMutedClip, { minLength: 1, maxLength: 5 })],
    { numRuns: 100 },
  )(
    "returns empty array when all clips are muted",
    (mutedClips) => {
      const sections = extractReferenceSectionsFromClips(mutedClips, []);
      expect(sections).toHaveLength(0);
    },
  );
});
