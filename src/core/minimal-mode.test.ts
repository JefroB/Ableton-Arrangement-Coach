import { describe, it, expect } from "vitest";
import { selectBarLength, computeMinimalMarkers, disambiguateNames } from "./minimal-mode.js";
import type { ArrangementVariant, GeneratedMarker } from "./structure-types.js";

describe("Minimal Mode", () => {
  describe("selectBarLength", () => {
    it("returns min when min equals max", () => {
      expect(selectBarLength({ min: 16, max: 16 })).toBe(16);
    });

    it("returns min when min is already a valid power-of-two multiple", () => {
      expect(selectBarLength({ min: 8, max: 32 })).toBe(8);
    });

    it("returns a value within [min, max]", () => {
      const result = selectBarLength({ min: 16, max: 64 });
      expect(result).toBeGreaterThanOrEqual(16);
      expect(result).toBeLessThanOrEqual(64);
    });

    it("returns min for single-value range", () => {
      expect(selectBarLength({ min: 32, max: 32 })).toBe(32);
    });
  });

  describe("computeMinimalMarkers", () => {
    it("places first marker at position 0", () => {
      const variant: ArrangementVariant = {
        name: "Test",
        sections: [
          { name: "Intro", lengthRange: { min: 16, max: 16 } },
          { name: "Main", lengthRange: { min: 32, max: 32 } },
        ],
      };
      const markers = computeMinimalMarkers({ variant, beatsPerBar: 4 });
      expect(markers[0]!.beatPosition).toBe(0);
    });

    it("computes cumulative positions correctly", () => {
      const variant: ArrangementVariant = {
        name: "Test",
        sections: [
          { name: "Intro", lengthRange: { min: 16, max: 16 } },
          { name: "Main", lengthRange: { min: 32, max: 32 } },
          { name: "Outro", lengthRange: { min: 8, max: 8 } },
        ],
      };
      const markers = computeMinimalMarkers({ variant, beatsPerBar: 4 });
      expect(markers[0]!.beatPosition).toBe(0);       // 0
      expect(markers[1]!.beatPosition).toBe(64);      // 16 bars × 4 beats
      expect(markers[2]!.beatPosition).toBe(192);     // (16 + 32) bars × 4 beats
    });

    it("disambiguates duplicate names", () => {
      const variant: ArrangementVariant = {
        name: "Test",
        sections: [
          { name: "Drop", lengthRange: { min: 32, max: 32 } },
          { name: "Breakdown", lengthRange: { min: 16, max: 16 } },
          { name: "Drop", lengthRange: { min: 32, max: 32 } },
        ],
      };
      const markers = computeMinimalMarkers({ variant, beatsPerBar: 4 });
      const names = markers.map((m) => m.name);
      expect(names).toContain("Drop 1");
      expect(names).toContain("Drop 2");
    });
  });

  describe("disambiguateNames", () => {
    it("returns unchanged markers when all names are unique", () => {
      const markers: GeneratedMarker[] = [
        { name: "Intro", beatPosition: 0 },
        { name: "Main", beatPosition: 64 },
        { name: "Outro", beatPosition: 128 },
      ];
      const result = disambiguateNames(markers);
      expect(result.map((m) => m.name)).toEqual(["Intro", "Main", "Outro"]);
    });

    it("appends numeric suffixes to duplicates", () => {
      const markers: GeneratedMarker[] = [
        { name: "Drop", beatPosition: 0 },
        { name: "Build", beatPosition: 64 },
        { name: "Drop", beatPosition: 128 },
        { name: "Drop", beatPosition: 192 },
      ];
      const result = disambiguateNames(markers);
      expect(result[0]!.name).toBe("Drop 1");
      expect(result[2]!.name).toBe("Drop 2");
      expect(result[3]!.name).toBe("Drop 3");
      expect(result[1]!.name).toBe("Build");
    });

    it("truncates names to 32 characters", () => {
      const longName = "A".repeat(35);
      const markers: GeneratedMarker[] = [
        { name: longName, beatPosition: 0 },
      ];
      const result = disambiguateNames(markers);
      expect(result[0]!.name.length).toBeLessThanOrEqual(32);
    });

    it("preserves beat positions", () => {
      const markers: GeneratedMarker[] = [
        { name: "Drop", beatPosition: 0 },
        { name: "Drop", beatPosition: 128 },
      ];
      const result = disambiguateNames(markers);
      expect(result[0]!.beatPosition).toBe(0);
      expect(result[1]!.beatPosition).toBe(128);
    });
  });
});
