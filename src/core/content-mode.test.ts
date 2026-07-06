import { describe, it, expect } from "vitest";
import {
  detectBoundariesScored,
  snapToGrid,
  matchVariant,
  computeContentMarkers,
} from "./content-mode.js";
import type { ArrangementVariant } from "./structure-types.js";

describe("Content Mode", () => {
  describe("detectBoundariesScored", () => {
    it("returns empty array when no clips provided", () => {
      expect(detectBoundariesScored([], 4)).toEqual([]);
    });

    it("returns empty array when all clips are muted", () => {
      const clips = [
        { startTime: 0, endTime: 32, muted: true, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: true, trackIndex: 1 },
      ];
      expect(detectBoundariesScored(clips, 4)).toEqual([]);
    });

    it("always includes content-start position with score 4", () => {
      const clips = [
        { startTime: 0, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 32, endTime: 96, muted: false, trackIndex: 2 },
      ];
      const boundaries = detectBoundariesScored(clips, 4);
      const contentStartBoundary = boundaries.find(b => b.position === 0);
      expect(contentStartBoundary).toBeDefined();
      expect(contentStartBoundary!.score).toBe(4);
    });

    it("detects boundaries at positions with track density changes", () => {
      // Clips on tracks 0-5 active in bars 0-3, then only track 0 active in bars 4+
      const clips = [
        { startTime: 0, endTime: 16, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 16, muted: false, trackIndex: 1 },
        { startTime: 0, endTime: 16, muted: false, trackIndex: 2 },
        { startTime: 0, endTime: 16, muted: false, trackIndex: 3 },
        { startTime: 16, endTime: 32, muted: false, trackIndex: 0 },
      ];
      const boundaries = detectBoundariesScored(clips, 4);
      // Bar position 16 should have a density delta (4 tracks -> 1 track)
      const pos16 = boundaries.find(b => b.position === 16);
      expect(pos16).toBeDefined();
      expect(pos16!.score).toBeGreaterThanOrEqual(1);
    });

    it("excludes muted clips from scoring", () => {
      // Single unmuted clip; muted clips should not affect scores
      const clips = [
        { startTime: 0, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: true, trackIndex: 1 },
        { startTime: 0, endTime: 64, muted: true, trackIndex: 2 },
      ];
      const boundaries = detectBoundariesScored(clips, 4);
      // Only 1 unmuted clip — content-start is forced with score 4
      const contentStart = boundaries.find(b => b.position === 0);
      expect(contentStart).toBeDefined();
      expect(contentStart!.score).toBe(4);
    });

    it("returns boundaries sorted by position ascending", () => {
      const clips = [
        { startTime: 0, endTime: 16, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 16, muted: false, trackIndex: 1 },
        { startTime: 0, endTime: 16, muted: false, trackIndex: 2 },
        { startTime: 16, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 32, endTime: 48, muted: false, trackIndex: 0 },
        { startTime: 32, endTime: 48, muted: false, trackIndex: 1 },
        { startTime: 32, endTime: 48, muted: false, trackIndex: 2 },
      ];
      const boundaries = detectBoundariesScored(clips, 4);
      for (let i = 1; i < boundaries.length; i++) {
        expect(boundaries[i]!.position).toBeGreaterThanOrEqual(boundaries[i - 1]!.position);
      }
    });
  });

  describe("snapToGrid", () => {
    it("returns empty array for empty candidates", () => {
      expect(snapToGrid([], 4)).toEqual([]);
    });

    it("keeps candidates exactly on the 8-bar grid", () => {
      // Grid at 4/4: 0, 32, 64, 96, 128...
      const candidates = [0, 32, 64, 96];
      expect(snapToGrid(candidates, 4)).toEqual([0, 32, 64, 96]);
    });

    it("snaps candidates within 4 beats to nearest grid point", () => {
      // Grid points: 0, 32, 64
      // Candidate 30 → snaps to 32 (distance 2, within threshold)
      // Candidate 66 → snaps to 64 (distance 2, within threshold)
      const candidates = [30, 66];
      const result = snapToGrid(candidates, 4);
      expect(result).toContain(32);
      expect(result).toContain(64);
    });

    it("discards candidates more than 4 beats from any grid point", () => {
      // Grid points: 0, 32, 64
      // Candidate 20 → nearest grid 32, distance 12 → discard
      // Candidate 50 → nearest grid 64, distance 14? No, nearest grid 48... wait
      // Actually grid is multiples of 32. So 50 → nearest 32 (dist 18) or 64 (dist 14)
      // Nearest is 64 - 50 = 14 > 4 → discard
      const candidates = [20, 50];
      expect(snapToGrid(candidates, 4)).toEqual([]);
    });

    it("discards candidate at exactly 5 beats distance", () => {
      // Grid point at 32. Candidate at 37 → distance 5 > 4 → discard
      const candidates = [37];
      expect(snapToGrid(candidates, 4)).toEqual([]);
    });

    it("keeps candidate at exactly 4 beats distance", () => {
      // Grid point at 32. Candidate at 36 → distance 4 → keep, snap to 32
      const candidates = [36];
      expect(snapToGrid(candidates, 4)).toEqual([32]);
    });

    it("deduplicates when multiple candidates snap to same grid point", () => {
      // Both 30 and 34 snap to 32
      const candidates = [30, 34];
      expect(snapToGrid(candidates, 4)).toEqual([32]);
    });

    it("returns sorted results", () => {
      const candidates = [96, 0, 64, 32];
      expect(snapToGrid(candidates, 4)).toEqual([0, 32, 64, 96]);
    });
  });

  describe("matchVariant", () => {
    const variants: ArrangementVariant[] = [
      {
        name: "Even Split",
        sections: [
          { name: "Intro", lengthRange: { min: 16, max: 16 } },
          { name: "Main", lengthRange: { min: 16, max: 16 } },
          { name: "Outro", lengthRange: { min: 16, max: 16 } },
        ],
      },
      {
        name: "Long Middle",
        sections: [
          { name: "Intro", lengthRange: { min: 8, max: 8 } },
          { name: "Main", lengthRange: { min: 32, max: 32 } },
          { name: "Outro", lengthRange: { min: 8, max: 8 } },
        ],
      },
    ];

    it("selects variant with closest proportional match", () => {
      // Boundaries at 0, 32, 128, song duration 160
      // Sections: [32 beats, 96 beats, 32 beats] → proportions [0.2, 0.6, 0.2]
      // "Even Split" proportions: [1/3, 1/3, 1/3]
      // "Long Middle" proportions: [8/48, 32/48, 8/48] = [0.167, 0.667, 0.167]
      // Deviation for Even Split: |0.2-0.333| + |0.6-0.333| + |0.2-0.333| = 0.133 + 0.267 + 0.133 = 0.533
      // Deviation for Long Middle: |0.2-0.167| + |0.6-0.667| + |0.2-0.167| = 0.033 + 0.067 + 0.033 = 0.133
      const boundaries = [0, 32, 128];
      const result = matchVariant(boundaries, variants, 160);
      expect(result.name).toBe("Long Middle");
    });

    it("throws when no variants provided", () => {
      expect(() => matchVariant([0, 32, 64], [], 128)).toThrow("No variants available");
    });

    it("returns a variant from the input array", () => {
      const result = matchVariant([0, 32, 64, 96], variants, 128);
      expect(variants).toContainEqual(result);
    });
  });

  describe("computeContentMarkers", () => {
    const variants: ArrangementVariant[] = [
      {
        name: "Standard",
        sections: [
          { name: "Intro", lengthRange: { min: 16, max: 16 } },
          { name: "Build", lengthRange: { min: 8, max: 8 } },
          { name: "Drop", lengthRange: { min: 32, max: 32 } },
          { name: "Breakdown", lengthRange: { min: 16, max: 16 } },
          { name: "Drop", lengthRange: { min: 32, max: 32 } },
          { name: "Outro", lengthRange: { min: 16, max: 16 } },
        ],
      },
    ];

    it("returns empty array when fewer than 3 boundaries detected", () => {
      // Single short clip — will produce content-start and possibly 1-2 other scored positions
      // but after grid snapping (8-bar = 32 beats), very few survive
      const clips = [
        { startTime: 0, endTime: 8, muted: false, trackIndex: 0 },
      ];
      const result = computeContentMarkers({
        clips,
        variants,
        beatsPerBar: 4,
        songDuration: 256,
      });
      expect(result).toEqual([]);
    });

    it("returns markers when >= 3 boundaries are detected", () => {
      // Create clips that produce multiple density transitions at 8-bar grid points (0, 32, 64, 96, 128)
      // Each segment has different track counts to trigger density delta signals
      const clips = [
        // First segment (0-32): 4 tracks active
        { startTime: 0, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 32, muted: false, trackIndex: 1 },
        { startTime: 0, endTime: 32, muted: false, trackIndex: 2 },
        { startTime: 0, endTime: 32, muted: false, trackIndex: 3 },
        // Second segment (32-64): 1 track active (density delta = 3 at pos 32)
        { startTime: 32, endTime: 64, muted: false, trackIndex: 0 },
        // Third segment (64-96): 4 tracks active (density delta = 3 at pos 64)
        { startTime: 64, endTime: 96, muted: false, trackIndex: 0 },
        { startTime: 64, endTime: 96, muted: false, trackIndex: 1 },
        { startTime: 64, endTime: 96, muted: false, trackIndex: 2 },
        { startTime: 64, endTime: 96, muted: false, trackIndex: 3 },
        // Fourth segment (96-128): 1 track active (density delta = 3 at pos 96)
        { startTime: 96, endTime: 128, muted: false, trackIndex: 0 },
      ];
      const result = computeContentMarkers({
        clips,
        variants,
        beatsPerBar: 4,
        songDuration: 256,
      });
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("all marker names are unique after disambiguation", () => {
      const clips = [
        { startTime: 0, endTime: 64, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 2 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 3 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 4 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 5 },
        { startTime: 192, endTime: 256, muted: false, trackIndex: 6 },
        { startTime: 192, endTime: 256, muted: false, trackIndex: 7 },
      ];
      const result = computeContentMarkers({
        clips,
        variants,
        beatsPerBar: 4,
        songDuration: 256,
      });
      const names = result.map((m) => m.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("all marker positions are bar-aligned", () => {
      const clips = [
        { startTime: 0, endTime: 64, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 2 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 3 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 4 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 5 },
      ];
      const beatsPerBar = 4;
      const result = computeContentMarkers({
        clips,
        variants,
        beatsPerBar,
        songDuration: 256,
      });
      for (const marker of result) {
        expect(marker.beatPosition % beatsPerBar).toBe(0);
      }
    });

    it("all marker names are <= 32 characters", () => {
      const clips = [
        { startTime: 0, endTime: 64, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 2 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 3 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 4 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 5 },
      ];
      const result = computeContentMarkers({
        clips,
        variants,
        beatsPerBar: 4,
        songDuration: 256,
      });
      for (const marker of result) {
        expect(marker.name.length).toBeLessThanOrEqual(32);
      }
    });

    it("returns empty array when no variants provided", () => {
      const clips = [
        { startTime: 0, endTime: 64, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 2 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 3 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 4 },
        { startTime: 128, endTime: 192, muted: false, trackIndex: 5 },
      ];
      const result = computeContentMarkers({
        clips,
        variants: [],
        beatsPerBar: 4,
        songDuration: 256,
      });
      expect(result).toEqual([]);
    });

    it("marker positions are strictly increasing", () => {
      const clips = [
        { startTime: 0, endTime: 64, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 2 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 3 },
        { startTime: 128, endTime: 256, muted: false, trackIndex: 4 },
        { startTime: 128, endTime: 256, muted: false, trackIndex: 5 },
      ];
      const result = computeContentMarkers({
        clips,
        variants,
        beatsPerBar: 4,
        songDuration: 256,
      });
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.beatPosition).toBeGreaterThan(result[i - 1]!.beatPosition);
      }
    });
  });
});
