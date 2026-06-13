import { describe, it, expect } from "vitest";
import {
  detectBoundaries,
  snapToGrid,
  matchVariant,
  computeContentMarkers,
} from "./content-mode.js";
import type { ArrangementVariant } from "./structure-types.js";

describe("Content Mode", () => {
  describe("detectBoundaries", () => {
    it("returns empty array when no clips provided", () => {
      expect(detectBoundaries([], 4)).toEqual([]);
    });

    it("returns empty array when all clips are muted", () => {
      const clips = [
        { startTime: 0, endTime: 32, muted: true, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: true, trackIndex: 1 },
      ];
      expect(detectBoundaries(clips, 4)).toEqual([]);
    });

    it("returns positions where >= 2 clips start or end", () => {
      const clips = [
        { startTime: 0, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 1 },
        { startTime: 32, endTime: 96, muted: false, trackIndex: 2 },
      ];
      const boundaries = detectBoundaries(clips, 4);
      // Position 0: 2 clips start → candidate
      // Position 32: 1 clip ends + 1 clip starts = 2 → candidate
      expect(boundaries).toContain(0);
      expect(boundaries).toContain(32);
    });

    it("does not include positions where only 1 clip starts or ends", () => {
      const clips = [
        { startTime: 0, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 16, endTime: 48, muted: false, trackIndex: 1 },
      ];
      const boundaries = detectBoundaries(clips, 4);
      // Position 0: 1 start only
      // Position 16: 1 start only
      // Position 32: 1 end only
      // Position 48: 1 end only
      expect(boundaries).toEqual([]);
    });

    it("excludes muted clips from count", () => {
      const clips = [
        { startTime: 0, endTime: 32, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 64, muted: true, trackIndex: 1 },
      ];
      const boundaries = detectBoundaries(clips, 4);
      // Position 0: only 1 unmuted clip starts
      expect(boundaries).toEqual([]);
    });

    it("returns sorted positions", () => {
      const clips = [
        { startTime: 64, endTime: 128, muted: false, trackIndex: 0 },
        { startTime: 64, endTime: 128, muted: false, trackIndex: 1 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 2 },
        { startTime: 0, endTime: 64, muted: false, trackIndex: 3 },
      ];
      const boundaries = detectBoundaries(clips, 4);
      // Position 0: 2 starts, Position 64: 2 ends + 2 starts = 4, Position 128: 2 ends
      expect(boundaries).toEqual([0, 64, 128]);
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
      // Only 2 clips starting at same position → at most 1 boundary
      const clips = [
        { startTime: 0, endTime: 64, muted: false, trackIndex: 0 },
        { startTime: 0, endTime: 128, muted: false, trackIndex: 1 },
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
      // Create clips that produce >= 3 boundaries on the 8-bar grid
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
