import { describe, it, expect } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  GENRE_THRESHOLDS,
  getLegacyThresholdsForGenre as getThresholdsForGenre,
  type GenreThresholdProfile,
} from "../../../src/core/genre-registry.js";

/** The old display-name-based genres that the legacy module supports. */
const LEGACY_GENRES = ["Techno", "House", "Trance", "Drum and Bass", "Ambient", "Pop"];

describe("Genre Thresholds (legacy module)", () => {
  describe("GENRE_THRESHOLDS coverage", () => {
    it("has a threshold entry for every legacy genre", () => {
      for (const genre of LEGACY_GENRES) {
        expect(GENRE_THRESHOLDS.has(genre)).toBe(true);
      }
    });

    it("has no extra entries beyond the legacy genres", () => {
      for (const key of GENRE_THRESHOLDS.keys()) {
        expect(LEGACY_GENRES).toContain(key);
      }
    });
  });

  describe("getThresholdsForGenre", () => {
    it("returns DEFAULT_THRESHOLDS when genre is null", () => {
      expect(getThresholdsForGenre(null)).toBe(DEFAULT_THRESHOLDS);
    });

    it("returns DEFAULT_THRESHOLDS for unknown genre strings", () => {
      expect(getThresholdsForGenre("Unknown")).toBe(DEFAULT_THRESHOLDS);
      expect(getThresholdsForGenre("")).toBe(DEFAULT_THRESHOLDS);
      expect(getThresholdsForGenre("Jazz")).toBe(DEFAULT_THRESHOLDS);
      expect(getThresholdsForGenre("Reggae")).toBe(DEFAULT_THRESHOLDS);
    });

    it("returns the correct profile for each known legacy genre", () => {
      for (const genre of LEGACY_GENRES) {
        const thresholds = getThresholdsForGenre(genre);
        expect(thresholds).toBe(GENRE_THRESHOLDS.get(genre));
      }
    });
  });

  describe("threshold value ranges", () => {
    const allProfiles: [string, GenreThresholdProfile][] = [
      ["Default", DEFAULT_THRESHOLDS],
      ...Array.from(GENRE_THRESHOLDS.entries()),
    ];

    for (const [name, profile] of allProfiles) {
      describe(`${name} thresholds`, () => {
        it("flatEnergyDelta is within 0.1–3.0", () => {
          expect(profile.flatEnergyDelta).toBeGreaterThanOrEqual(0.1);
          expect(profile.flatEnergyDelta).toBeLessThanOrEqual(3.0);
        });

        it("repetitionSimilarity is within 0.50–0.99", () => {
          expect(profile.repetitionSimilarity).toBeGreaterThanOrEqual(0.50);
          expect(profile.repetitionSimilarity).toBeLessThanOrEqual(0.99);
        });

        it("abruptChangeDelta is within 2.0–8.0", () => {
          expect(profile.abruptChangeDelta).toBeGreaterThanOrEqual(2.0);
          expect(profile.abruptChangeDelta).toBeLessThanOrEqual(8.0);
        });

        it("crowdingTrackCount is within 2–6", () => {
          expect(profile.crowdingTrackCount).toBeGreaterThanOrEqual(2);
          expect(profile.crowdingTrackCount).toBeLessThanOrEqual(6);
        });

        it("introMinBars is within 4–64", () => {
          expect(profile.introMinBars).toBeGreaterThanOrEqual(4);
          expect(profile.introMinBars).toBeLessThanOrEqual(64);
        });

        it("outroMinBars is within 4–64", () => {
          expect(profile.outroMinBars).toBeGreaterThanOrEqual(4);
          expect(profile.outroMinBars).toBeLessThanOrEqual(64);
        });
      });
    }
  });
});
