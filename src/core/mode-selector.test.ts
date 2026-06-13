import { describe, it, expect } from "vitest";
import { selectMode, computeUnionCoverage } from "./mode-selector.js";
import type { ModeSelectionInput } from "./mode-selector.js";

describe("Mode Selector", () => {
  describe("selectMode", () => {
    it("returns 'minimal' when song duration is zero", () => {
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 100, muted: false },
          { startTime: 50, endTime: 150, muted: false },
          { startTime: 100, endTime: 200, muted: false },
        ],
        songDuration: 0,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("returns 'minimal' when trackCount is zero", () => {
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 100, muted: false },
          { startTime: 50, endTime: 150, muted: false },
          { startTime: 100, endTime: 200, muted: false },
        ],
        songDuration: 1000,
        trackCount: 0,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("returns 'minimal' when no clips exist", () => {
      const input: ModeSelectionInput = {
        clips: [],
        songDuration: 500,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("returns 'minimal' when fewer than 3 unmuted clips and coverage below 10%", () => {
      // 2 clips covering 8 beats out of 1000 = 0.8% coverage
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 4, muted: false },
          { startTime: 10, endTime: 14, muted: false },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("returns 'content' when 3 or more unmuted clips exist", () => {
      // 3 clips but low coverage — clip count threshold met
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 1, muted: false },
          { startTime: 10, endTime: 11, muted: false },
          { startTime: 20, endTime: 21, muted: false },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("content");
    });

    it("returns 'content' when coverage >= 10% even with fewer than 3 clips", () => {
      // 2 clips covering 200 beats out of 1000 = 20% coverage
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 100, muted: false },
          { startTime: 100, endTime: 200, muted: false },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("content");
    });

    it("ignores muted clips for count and coverage", () => {
      // 5 clips total but only 2 unmuted, low coverage
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 4, muted: false },
          { startTime: 10, endTime: 14, muted: false },
          { startTime: 100, endTime: 500, muted: true },
          { startTime: 200, endTime: 600, muted: true },
          { startTime: 300, endTime: 700, muted: true },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("returns 'content' at exactly the 10% coverage boundary", () => {
      // 1 clip covering exactly 100 beats out of 1000 = 10%
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 100, muted: false },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("content");
    });

    it("returns 'minimal' just below 10% coverage with 2 clips", () => {
      // 2 clips covering 99 beats out of 1000 = 9.9%
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 50, muted: false },
          { startTime: 50, endTime: 99, muted: false },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("returns 'minimal' when trackCount is negative", () => {
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 100, muted: false },
          { startTime: 50, endTime: 150, muted: false },
          { startTime: 100, endTime: 200, muted: false },
        ],
        songDuration: 1000,
        trackCount: -1,
      };
      expect(selectMode(input)).toBe("minimal");
    });

    it("handles overlapping clips correctly for coverage", () => {
      // 2 clips with overlap: [0, 100] and [50, 120] → union = 120 beats
      // 120 / 1000 = 12% → content
      const input: ModeSelectionInput = {
        clips: [
          { startTime: 0, endTime: 100, muted: false },
          { startTime: 50, endTime: 120, muted: false },
        ],
        songDuration: 1000,
        trackCount: 4,
      };
      expect(selectMode(input)).toBe("content");
    });
  });

  describe("computeUnionCoverage", () => {
    it("returns 0 for empty array", () => {
      expect(computeUnionCoverage([])).toBe(0);
    });

    it("returns duration of single range", () => {
      expect(computeUnionCoverage([{ startTime: 10, endTime: 50 }])).toBe(40);
    });

    it("merges overlapping ranges", () => {
      const ranges = [
        { startTime: 0, endTime: 100 },
        { startTime: 50, endTime: 150 },
      ];
      expect(computeUnionCoverage(ranges)).toBe(150);
    });

    it("merges adjacent ranges", () => {
      const ranges = [
        { startTime: 0, endTime: 50 },
        { startTime: 50, endTime: 100 },
      ];
      expect(computeUnionCoverage(ranges)).toBe(100);
    });

    it("sums non-overlapping ranges", () => {
      const ranges = [
        { startTime: 0, endTime: 30 },
        { startTime: 60, endTime: 90 },
      ];
      expect(computeUnionCoverage(ranges)).toBe(60);
    });

    it("handles fully nested ranges", () => {
      const ranges = [
        { startTime: 0, endTime: 200 },
        { startTime: 50, endTime: 100 },
        { startTime: 75, endTime: 125 },
      ];
      expect(computeUnionCoverage(ranges)).toBe(200);
    });

    it("handles unsorted input correctly", () => {
      const ranges = [
        { startTime: 100, endTime: 200 },
        { startTime: 0, endTime: 50 },
        { startTime: 40, endTime: 110 },
      ];
      // Sorted: [0,50], [40,110], [100,200] → merged: [0, 200] = 200
      expect(computeUnionCoverage(ranges)).toBe(200);
    });
  });
});
