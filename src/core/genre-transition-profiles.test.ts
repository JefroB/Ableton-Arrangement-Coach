import { describe, it, expect } from "vitest";
import {
  GENRE_TRANSITION_PROFILES,
  DEFAULT_TRANSITION_PROFILE,
  ALL_TRANSITION_CATEGORIES,
  getTransitionProfileForGenre,
} from "./genre-registry.js";
import type { TransitionCategory } from "./transition-engine.js";

describe("Genre Transition Profiles", () => {
  describe("ALL_TRANSITION_CATEGORIES", () => {
    it("contains all 6 transition categories", () => {
      expect(ALL_TRANSITION_CATEGORIES).toHaveLength(6);
      expect(ALL_TRANSITION_CATEGORIES).toContain("riser");
      expect(ALL_TRANSITION_CATEGORIES).toContain("drum_fill");
      expect(ALL_TRANSITION_CATEGORIES).toContain("filter_sweep");
      expect(ALL_TRANSITION_CATEGORIES).toContain("volume_dynamics");
      expect(ALL_TRANSITION_CATEGORIES).toContain("impact");
      expect(ALL_TRANSITION_CATEGORIES).toContain("textural_fx");
    });
  });

  describe("DEFAULT_TRANSITION_PROFILE", () => {
    it("has all 6 categories as equally preferred", () => {
      expect(DEFAULT_TRANSITION_PROFILE.preferredCategories).toHaveLength(6);
      for (const cat of ALL_TRANSITION_CATEGORIES) {
        expect(DEFAULT_TRANSITION_PROFILE.preferredCategories).toContain(cat);
      }
    });

    it("has no discouraged categories", () => {
      expect(DEFAULT_TRANSITION_PROFILE.discouragedCategories).toHaveLength(0);
    });

    it("has build duration range of 4–32 bars", () => {
      expect(DEFAULT_TRANSITION_PROFILE.buildDurationRange.min).toBe(4);
      expect(DEFAULT_TRANSITION_PROFILE.buildDurationRange.max).toBe(32);
    });

    it("has drops expected set to true", () => {
      expect(DEFAULT_TRANSITION_PROFILE.dropsExpected).toBe(true);
    });
  });

  describe("GENRE_TRANSITION_PROFILES", () => {
    it("contains exactly 6 genre profiles", () => {
      expect(GENRE_TRANSITION_PROFILES.size).toBe(6);
    });

    it("has profiles for all supported genres", () => {
      const expectedGenres = ["Techno", "House", "Trance", "Drum and Bass", "Ambient", "Pop"];
      for (const genre of expectedGenres) {
        expect(GENRE_TRANSITION_PROFILES.has(genre)).toBe(true);
      }
    });

    describe("Techno profile", () => {
      it("has correct configuration per Requirement 2.4", () => {
        const profile = GENRE_TRANSITION_PROFILES.get("Techno")!;
        expect(profile.genre).toBe("Techno");
        expect(profile.preferredCategories).toEqual(["filter_sweep", "volume_dynamics", "drum_fill"]);
        expect(profile.discouragedCategories).toEqual([]);
        expect(profile.buildDurationRange).toEqual({ min: 4, max: 16 });
        expect(profile.dropsExpected).toBe(true);
      });
    });

    describe("House profile", () => {
      it("has correct configuration per Requirement 2.4", () => {
        const profile = GENRE_TRANSITION_PROFILES.get("House")!;
        expect(profile.genre).toBe("House");
        expect(profile.preferredCategories).toEqual(["filter_sweep", "drum_fill", "volume_dynamics"]);
        expect(profile.discouragedCategories).toEqual([]);
        expect(profile.buildDurationRange).toEqual({ min: 4, max: 16 });
        expect(profile.dropsExpected).toBe(true);
      });
    });

    describe("Trance profile", () => {
      it("has correct configuration per Requirement 2.4", () => {
        const profile = GENRE_TRANSITION_PROFILES.get("Trance")!;
        expect(profile.genre).toBe("Trance");
        expect(profile.preferredCategories).toEqual(["riser", "drum_fill", "impact"]);
        expect(profile.discouragedCategories).toEqual([]);
        expect(profile.buildDurationRange).toEqual({ min: 16, max: 32 });
        expect(profile.dropsExpected).toBe(true);
      });
    });

    describe("Drum and Bass profile", () => {
      it("has correct configuration per Requirement 2.4", () => {
        const profile = GENRE_TRANSITION_PROFILES.get("Drum and Bass")!;
        expect(profile.genre).toBe("Drum and Bass");
        expect(profile.preferredCategories).toEqual(["drum_fill", "riser", "impact"]);
        expect(profile.discouragedCategories).toEqual([]);
        expect(profile.buildDurationRange).toEqual({ min: 4, max: 16 });
        expect(profile.dropsExpected).toBe(true);
      });
    });

    describe("Ambient profile", () => {
      it("has correct configuration per Requirement 2.4", () => {
        const profile = GENRE_TRANSITION_PROFILES.get("Ambient")!;
        expect(profile.genre).toBe("Ambient");
        expect(profile.preferredCategories).toEqual(["textural_fx", "filter_sweep", "volume_dynamics"]);
        expect(profile.discouragedCategories).toEqual(["impact", "drum_fill"]);
        expect(profile.buildDurationRange).toEqual({ min: 8, max: 32 });
        expect(profile.dropsExpected).toBe(false);
      });
    });

    describe("Pop profile", () => {
      it("has correct configuration per Requirement 2.4", () => {
        const profile = GENRE_TRANSITION_PROFILES.get("Pop")!;
        expect(profile.genre).toBe("Pop");
        expect(profile.preferredCategories).toEqual(["drum_fill", "volume_dynamics", "riser"]);
        expect(profile.discouragedCategories).toEqual([]);
        expect(profile.buildDurationRange).toEqual({ min: 4, max: 8 });
        expect(profile.dropsExpected).toBe(true);
      });
    });
  });

  describe("getTransitionProfileForGenre", () => {
    it("returns null when genre is null", () => {
      expect(getTransitionProfileForGenre(null)).toBeNull();
    });

    it("returns null for unknown genre strings", () => {
      expect(getTransitionProfileForGenre("Unknown")).toBeNull();
      expect(getTransitionProfileForGenre("")).toBeNull();
      expect(getTransitionProfileForGenre("Jazz")).toBeNull();
      expect(getTransitionProfileForGenre("Metal")).toBeNull();
    });

    it("returns the correct profile for each known genre", () => {
      const genres = ["Techno", "House", "Trance", "Drum and Bass", "Ambient", "Pop"];
      for (const genre of genres) {
        const profile = getTransitionProfileForGenre(genre);
        expect(profile).toBe(GENRE_TRANSITION_PROFILES.get(genre));
      }
    });

    it("is case-sensitive (lowercase does not match)", () => {
      expect(getTransitionProfileForGenre("techno")).toBeNull();
      expect(getTransitionProfileForGenre("house")).toBeNull();
      expect(getTransitionProfileForGenre("TRANCE")).toBeNull();
    });
  });
});
