import { describe, it, expect } from "vitest";
import {
  getProfile,
  getProfileBySubgenre,
  getAllFamilies,
  search,
  getWeightsForGenre,
  getThresholdsForGenre,
  getTransitionPreferencesForGenre,
  DEFAULT_WEIGHTS,
} from "../../../src/core/genre-registry.js";

describe("Genre Registry", () => {
  describe("getProfile", () => {
    it("returns Techno profile for 'techno'", () => {
      const profile = getProfile("techno");
      expect(profile).not.toBeNull();
      expect(profile!.id).toBe("techno");
      expect(profile!.name).toBe("Techno");
      expect(profile!.family).toBe("techno");
    });

    it("returns House profile for 'house'", () => {
      const profile = getProfile("house");
      expect(profile).not.toBeNull();
      expect(profile!.id).toBe("house");
      expect(profile!.name).toBe("House");
      expect(profile!.family).toBe("house");
    });

    it("returns null for unknown ID 'nonexistent'", () => {
      expect(getProfile("nonexistent")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getProfile("")).toBeNull();
    });
  });

  describe("getProfileBySubgenre", () => {
    it("returns resolved profile for 'peak-time-techno' with correct overrides", () => {
      const profile = getProfileBySubgenre("peak-time-techno");
      expect(profile).not.toBeNull();
      expect(profile!.id).toBe("peak-time-techno");
      expect(profile!.name).toBe("Peak Time Techno");
      expect(profile!.tempoRange).toEqual({ min: 130, max: 140 });
      expect(profile!.energyWeights).toEqual({
        trackCountWeight: 0.10,
        midiDensityWeight: 0.30,
        trackPresenceWeight: 0.15,
        automationWeight: 0.15,
        frequencyCoverageWeight: 0.10,
        velocityIntensityWeight: 0.10,
        polyphonyScoreWeight: 0.05,
        pitchRangeWeight: 0.05,
      });
    });

    it("returns resolved profile for 'minimal-techno' with correct overrides", () => {
      const profile = getProfileBySubgenre("minimal-techno");
      expect(profile).not.toBeNull();
      expect(profile!.id).toBe("minimal-techno");
      expect(profile!.name).toBe("Minimal Techno");
      expect(profile!.tempoRange).toEqual({ min: 120, max: 125 });
      expect(profile!.detectionThresholds).toEqual({
        flatEnergyMaxDelta: 3,
        missingTransitionMinDelta: 4,
        similarityCeilingPercent: 95,
      });
    });

    it("resolved profile has subgenre's id and name but parent's family", () => {
      const profile = getProfileBySubgenre("peak-time-techno");
      expect(profile).not.toBeNull();
      expect(profile!.id).toBe("peak-time-techno");
      expect(profile!.name).toBe("Peak Time Techno");
      expect(profile!.family).toBe("techno");
    });

    it("resolved profile has parent's values for non-overridden fields", () => {
      const parent = getProfile("techno");
      const resolved = getProfileBySubgenre("peak-time-techno");
      expect(parent).not.toBeNull();
      expect(resolved).not.toBeNull();

      // peak-time-techno overrides tempoRange, energyWeights, transitions, and detectionRules
      // Structure, energyCurveTemplate, and detectionThresholds should come from the parent
      expect(resolved!.structure).toEqual(parent!.structure);
      expect(resolved!.energyCurveTemplate).toEqual(parent!.energyCurveTemplate);
      expect(resolved!.detectionThresholds).toEqual(parent!.detectionThresholds);
    });

    it("returns null for unknown subgenre ID", () => {
      expect(getProfileBySubgenre("nonexistent-subgenre")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getProfileBySubgenre("")).toBeNull();
    });
  });

  describe("getAllFamilies", () => {
    it("returns exactly 28 families", () => {
      const families = getAllFamilies();
      expect(families).toHaveLength(28);
    });

    it("each family has id, name, and subgenreCount fields", () => {
      const families = getAllFamilies();
      for (const family of families) {
        expect(family).toHaveProperty("id");
        expect(family).toHaveProperty("name");
        expect(family).toHaveProperty("subgenreCount");
        expect(typeof family.id).toBe("string");
        expect(typeof family.name).toBe("string");
        expect(typeof family.subgenreCount).toBe("number");
      }
    });

    it("Techno family has subgenreCount of 13", () => {
      const families = getAllFamilies();
      const techno = families.find((f) => f.id === "techno");
      expect(techno).toBeDefined();
      expect(techno!.subgenreCount).toBe(13);
    });
  });

  describe("search", () => {
    it("returns results for 'techno' including family and subgenres", () => {
      const results = search("techno");
      expect(results.length).toBeGreaterThan(0);

      const familyResult = results.find((r) => r.type === "family" && r.id === "techno");
      expect(familyResult).toBeDefined();

      // Should also return subgenres containing "techno" in name
      const subgenreResults = results.filter((r) => r.type === "subgenre");
      expect(subgenreResults.length).toBeGreaterThan(0);
    });

    it("is case-insensitive: 'TECHNO' returns same results as 'techno'", () => {
      const lower = search("techno");
      const upper = search("TECHNO");
      expect(upper).toEqual(lower);
    });

    it("partial match: 'tech' returns Techno family and Tech House subgenre", () => {
      const results = search("tech");
      const technoFamily = results.find((r) => r.id === "techno" && r.type === "family");
      expect(technoFamily).toBeDefined();

      const techHouse = results.find((r) => r.id === "tech-house" && r.type === "subgenre");
      expect(techHouse).toBeDefined();
    });

    it("returns empty array for empty string", () => {
      expect(search("")).toEqual([]);
    });

    it("returns empty array for whitespace only", () => {
      expect(search("   ")).toEqual([]);
    });

    it("returns empty array for 'xyznonexistent'", () => {
      expect(search("xyznonexistent")).toEqual([]);
    });
  });

  describe("Backward-compatible adapters", () => {
    describe("getWeightsForGenre", () => {
      it("returns Techno's energy weights for 'techno'", () => {
        const weights = getWeightsForGenre("techno");
        expect(weights).toEqual({
          trackCountWeight: 0.10,
          midiDensityWeight: 0.30,
          trackPresenceWeight: 0.15,
          automationWeight: 0.15,
          frequencyCoverageWeight: 0.10,
          velocityIntensityWeight: 0.10,
          polyphonyScoreWeight: 0.05,
          pitchRangeWeight: 0.05,
        });
      });

      it("returns Peak Time Techno's weights for 'peak-time-techno'", () => {
        const weights = getWeightsForGenre("peak-time-techno");
        expect(weights).toEqual({
          trackCountWeight: 0.10,
          midiDensityWeight: 0.30,
          trackPresenceWeight: 0.15,
          automationWeight: 0.15,
          frequencyCoverageWeight: 0.10,
          velocityIntensityWeight: 0.10,
          polyphonyScoreWeight: 0.05,
          pitchRangeWeight: 0.05,
        });
      });

      it("returns default weights for null", () => {
        const weights = getWeightsForGenre(null);
        expect(weights).toBe(DEFAULT_WEIGHTS);
        const sum =
          weights.trackCountWeight +
          weights.midiDensityWeight +
          weights.trackPresenceWeight +
          weights.automationWeight +
          weights.frequencyCoverageWeight +
          weights.velocityIntensityWeight +
          weights.polyphonyScoreWeight +
          weights.pitchRangeWeight;
        expect(sum).toBeCloseTo(1.0, 3);
      });

      it("returns default weights for unknown genre", () => {
        const weights = getWeightsForGenre("unknown");
        expect(weights).toBe(DEFAULT_WEIGHTS);
      });
    });

    describe("getThresholdsForGenre", () => {
      it("returns Techno's thresholds for 'techno'", () => {
        const thresholds = getThresholdsForGenre("techno");
        expect(thresholds).toEqual({
          flatEnergyMaxDelta: 2,
          missingTransitionMinDelta: 3,
          similarityCeilingPercent: 88,
        });
      });

      it("returns default thresholds for null", () => {
        const thresholds = getThresholdsForGenre(null);
        expect(thresholds).toHaveProperty("flatEnergyMaxDelta");
        expect(thresholds).toHaveProperty("missingTransitionMinDelta");
        expect(thresholds).toHaveProperty("similarityCeilingPercent");
      });
    });

    describe("getTransitionPreferencesForGenre", () => {
      it("returns Techno's transitions for 'techno'", () => {
        const transitions = getTransitionPreferencesForGenre("techno");
        expect(transitions).toEqual({
          preferred: ["hard_cut", "snare_roll", "impact", "filter_sweep"],
          discouraged: ["long_riser", "emotional_breakdown", "gradual_layering"],
          buildDurationRange: { min: 4, max: 16 },
          dropsExpected: true,
        });
      });

      it("returns default transitions for null", () => {
        const transitions = getTransitionPreferencesForGenre(null);
        expect(transitions).toHaveProperty("preferred");
        expect(transitions).toHaveProperty("discouraged");
        expect(transitions).toHaveProperty("buildDurationRange");
        expect(transitions).toHaveProperty("dropsExpected");
      });
    });
  });
});
