import { describe, it, expect } from "vitest";
import { validateProfile, validateAllProfiles } from "../../../src/core/profile-validator.js";
import type { GenreProfile } from "../../../src/core/genre-profile-types.js";
import { ALL_PROFILES } from "../../../src/core/genre-registry.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/** A minimal valid profile used as a baseline for malformed variants. */
function createValidProfile(overrides: Partial<GenreProfile> = {}): GenreProfile {
  return {
    id: "test-genre",
    name: "Test Genre",
    family: "test",
    tempoRange: { min: 120, max: 140 },
    structure: [
      { name: "Intro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
      { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
      { name: "Outro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 3 }, optional: false },
    ],
    energyCurveTemplate: [3, 8, 3],
    transitions: {
      preferred: ["filter_sweep"],
      discouraged: [],
      buildDurationRange: { min: 4, max: 16 },
      dropsExpected: true,
    },
    energyWeights: {
      trackCountWeight: 0.20,
      midiDensityWeight: 0.25,
      trackPresenceWeight: 0.15,
      automationWeight: 0.00,
      frequencyCoverageWeight: 0.10,
      velocityIntensityWeight: 0.15,
      polyphonyScoreWeight: 0.10,
      pitchRangeWeight: 0.05,
    },
    detectionRules: [
      { type: "min-intro-bars", value: 16, severity: "warning", unit: "bars" },
    ],
    detectionThresholds: {
      flatEnergyMaxDelta: 2,
      missingTransitionMinDelta: 3,
      similarityCeilingPercent: 90,
    },
    ...overrides,
  } as GenreProfile;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Profile Validator", () => {
  describe("valid profiles return empty error arrays", () => {
    it("returns no errors for a minimal valid profile", () => {
      const profile = createValidProfile();
      const errors = validateProfile(profile);
      expect(errors).toEqual([]);
    });

    it("returns no errors for a valid profile with optional sections", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Intro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
          { name: "Bridge", lengthRange: { min: 4, max: 8 }, energyRange: { min: 3, max: 5 }, optional: true },
          { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        ],
        // energyCurveTemplate should match non-optional count (2)
        energyCurveTemplate: [3, 8],
      });
      const errors = validateProfile(profile);
      expect(errors).toEqual([]);
    });

    it("returns no errors for a valid profile with subgenres", () => {
      const profile = createValidProfile({
        subgenres: [
          {
            id: "test-sub",
            name: "Test Sub",
            parentId: "test-genre",
            tempoRange: { min: 125, max: 135 },
          },
        ],
      });
      const errors = validateProfile(profile);
      expect(errors).toEqual([]);
    });

    it("returns no errors for all registered profiles", () => {
      const errors = validateAllProfiles(ALL_PROFILES);
      expect(errors).toEqual([]);
    });
  });

  describe("Requirement 8.1: required fields and correct types", () => {
    it("reports error when id is empty string", () => {
      const profile = createValidProfile({ id: "" });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "id")).toBe(true);
    });

    it("reports error when name is empty string", () => {
      const profile = createValidProfile({ name: "" });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "name")).toBe(true);
    });

    it("reports error when family is empty string", () => {
      const profile = createValidProfile({ family: "" });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "family")).toBe(true);
    });

    it("reports error when tempoRange is missing", () => {
      const profile = createValidProfile({ tempoRange: undefined as any });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "tempoRange")).toBe(true);
    });

    it("reports error when structure is empty array", () => {
      const profile = createValidProfile({ structure: [] });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure")).toBe(true);
    });

    it("reports error when energyCurveTemplate is empty array", () => {
      const profile = createValidProfile({ energyCurveTemplate: [] });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyCurveTemplate")).toBe(true);
    });

    it("reports error when transitions is missing", () => {
      const profile = createValidProfile({ transitions: undefined as any });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "transitions")).toBe(true);
    });

    it("reports error when energyWeights is missing", () => {
      const profile = createValidProfile({ energyWeights: undefined as any });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyWeights")).toBe(true);
    });

    it("reports error when detectionRules is not an array", () => {
      const profile = createValidProfile({ detectionRules: "invalid" as any });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "detectionRules")).toBe(true);
    });

    it("reports error when detectionThresholds is missing", () => {
      const profile = createValidProfile({ detectionThresholds: undefined as any });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "detectionThresholds")).toBe(true);
    });
  });

  describe("Requirement 8.2: energyWeights sum to 1.0 ± 0.001", () => {
    it("reports error when weights sum to significantly more than 1.0", () => {
      const profile = createValidProfile({
        energyWeights: {
          trackCountWeight: 0.3,
          midiDensityWeight: 0.3,
          trackPresenceWeight: 0.3,
          automationWeight: 0.3,
          frequencyCoverageWeight: 0.1,
          velocityIntensityWeight: 0.1,
          polyphonyScoreWeight: 0.05,
          pitchRangeWeight: 0.05,
        },
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyWeights.sum")).toBe(true);
    });

    it("reports error when weights sum to significantly less than 1.0", () => {
      const profile = createValidProfile({
        energyWeights: {
          trackCountWeight: 0.05,
          midiDensityWeight: 0.05,
          trackPresenceWeight: 0.05,
          automationWeight: 0.05,
          frequencyCoverageWeight: 0.05,
          velocityIntensityWeight: 0.05,
          polyphonyScoreWeight: 0.05,
          pitchRangeWeight: 0.05,
        },
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyWeights.sum")).toBe(true);
    });

    it("reports error when a weight is negative", () => {
      const profile = createValidProfile({
        energyWeights: {
          trackCountWeight: -0.1,
          midiDensityWeight: 0.30,
          trackPresenceWeight: 0.20,
          automationWeight: 0.20,
          frequencyCoverageWeight: 0.10,
          velocityIntensityWeight: 0.15,
          polyphonyScoreWeight: 0.10,
          pitchRangeWeight: 0.05,
        },
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyWeights.trackCountWeight")).toBe(true);
    });

    it("reports error when a weight exceeds 1.0", () => {
      const profile = createValidProfile({
        energyWeights: {
          trackCountWeight: 1.5,
          midiDensityWeight: 0.0,
          trackPresenceWeight: 0.0,
          automationWeight: 0.0,
          frequencyCoverageWeight: 0.0,
          velocityIntensityWeight: 0.0,
          polyphonyScoreWeight: 0.0,
          pitchRangeWeight: 0.0,
        },
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyWeights.trackCountWeight")).toBe(true);
    });

    it("accepts weights that sum to exactly 1.0", () => {
      const profile = createValidProfile({
        energyWeights: {
          trackCountWeight: 0.20,
          midiDensityWeight: 0.25,
          trackPresenceWeight: 0.15,
          automationWeight: 0.00,
          frequencyCoverageWeight: 0.10,
          velocityIntensityWeight: 0.15,
          polyphonyScoreWeight: 0.10,
          pitchRangeWeight: 0.05,
        },
      });
      const errors = validateProfile(profile);
      expect(errors.filter((e) => e.fieldPath.startsWith("energyWeights"))).toEqual([]);
    });
  });

  describe("Requirement 8.3: section template ranges valid", () => {
    it("reports error when lengthRange.min is 0", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Bad", lengthRange: { min: 0, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
        ],
        energyCurveTemplate: [3],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure[0].lengthRange.min")).toBe(true);
    });

    it("reports error when lengthRange.min > lengthRange.max", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Bad", lengthRange: { min: 32, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
        ],
        energyCurveTemplate: [3],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure[0].lengthRange")).toBe(true);
    });

    it("reports error when energyRange.min < 1", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Bad", lengthRange: { min: 8, max: 16 }, energyRange: { min: 0, max: 5 }, optional: false },
        ],
        energyCurveTemplate: [3],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure[0].energyRange.min")).toBe(true);
    });

    it("reports error when energyRange.max > 10", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Bad", lengthRange: { min: 8, max: 16 }, energyRange: { min: 5, max: 11 }, optional: false },
        ],
        energyCurveTemplate: [3],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure[0].energyRange.max")).toBe(true);
    });

    it("reports error when energyRange.min > energyRange.max", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Bad", lengthRange: { min: 8, max: 16 }, energyRange: { min: 8, max: 5 }, optional: false },
        ],
        energyCurveTemplate: [3],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure[0].energyRange")).toBe(true);
    });

    it("reports error when energyRange values are non-integers", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Bad", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2.5, max: 7 }, optional: false },
        ],
        energyCurveTemplate: [3],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "structure[0].energyRange.min")).toBe(true);
    });
  });

  describe("Requirement 8.4: energyCurveTemplate length matches non-optional sections", () => {
    it("reports error when energyCurveTemplate is too short", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Intro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
          { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
          { name: "Outro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 3 }, optional: false },
        ],
        energyCurveTemplate: [3, 8], // needs 3 entries for 3 non-optional sections
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyCurveTemplate.length")).toBe(true);
    });

    it("reports error when energyCurveTemplate is too long", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Intro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
          { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        ],
        energyCurveTemplate: [3, 8, 5], // needs 2 entries for 2 non-optional sections
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyCurveTemplate.length")).toBe(true);
    });

    it("counts only non-optional sections for length matching", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Intro", lengthRange: { min: 8, max: 16 }, energyRange: { min: 2, max: 4 }, optional: false },
          { name: "Break", lengthRange: { min: 4, max: 8 }, energyRange: { min: 3, max: 5 }, optional: true },
          { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        ],
        // 2 non-optional sections → energyCurveTemplate should have 2 entries
        energyCurveTemplate: [3, 8],
      });
      const errors = validateProfile(profile);
      expect(errors.filter((e) => e.fieldPath.startsWith("energyCurveTemplate"))).toEqual([]);
    });

    it("reports error when energyCurveTemplate values are out of range 1-10", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        ],
        energyCurveTemplate: [0], // 0 is out of range (min is 1)
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyCurveTemplate[0]")).toBe(true);
    });

    it("reports error when energyCurveTemplate has value > 10", () => {
      const profile = createValidProfile({
        structure: [
          { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        ],
        energyCurveTemplate: [11],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "energyCurveTemplate[0]")).toBe(true);
    });
  });

  describe("Requirement 8.6: tempoRange valid", () => {
    it("reports error when tempoRange.min is 0", () => {
      const profile = createValidProfile({ tempoRange: { min: 0, max: 140 } });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "tempoRange.min")).toBe(true);
    });

    it("reports error when tempoRange.min > tempoRange.max", () => {
      const profile = createValidProfile({ tempoRange: { min: 150, max: 120 } });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "tempoRange")).toBe(true);
    });

    it("reports error when tempoRange.max > 300", () => {
      const profile = createValidProfile({ tempoRange: { min: 120, max: 350 } });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "tempoRange.max")).toBe(true);
    });

    it("accepts tempoRange at boundaries (min=1, max=300)", () => {
      const profile = createValidProfile({ tempoRange: { min: 1, max: 300 } });
      const errors = validateProfile(profile);
      expect(errors.filter((e) => e.fieldPath.startsWith("tempoRange"))).toEqual([]);
    });
  });

  describe("Requirement 8.7: detectionRules entries valid", () => {
    it("reports error when detectionRule has empty type string", () => {
      const profile = createValidProfile({
        detectionRules: [{ type: "", value: 10, severity: "warning" }],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "detectionRules[0].type")).toBe(true);
    });

    it("reports error when detectionRule has invalid severity", () => {
      const profile = createValidProfile({
        detectionRules: [{ type: "test-rule", value: 10, severity: "invalid" as any }],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "detectionRules[0].severity")).toBe(true);
    });

    it("reports error when detectionRule value is missing (undefined)", () => {
      const profile = createValidProfile({
        detectionRules: [{ type: "test-rule", value: undefined as any, severity: "warning" }],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "detectionRules[0].value")).toBe(true);
    });

    it("reports error when detectionRule value is a string", () => {
      const profile = createValidProfile({
        detectionRules: [{ type: "test-rule", value: "bad" as any, severity: "warning" }],
      });
      const errors = validateProfile(profile);
      expect(errors.some((e) => e.fieldPath === "detectionRules[0].value")).toBe(true);
    });

    it("accepts detectionRule with boolean value", () => {
      const profile = createValidProfile({
        detectionRules: [{ type: "enable-feature", value: true, severity: "info" }],
      });
      const errors = validateProfile(profile);
      expect(errors.filter((e) => e.fieldPath.startsWith("detectionRules"))).toEqual([]);
    });

    it("accepts detectionRule with numeric value", () => {
      const profile = createValidProfile({
        detectionRules: [{ type: "min-bars", value: 32, severity: "critical", unit: "bars" }],
      });
      const errors = validateProfile(profile);
      expect(errors.filter((e) => e.fieldPath.startsWith("detectionRules"))).toEqual([]);
    });
  });

  describe("validateAllProfiles", () => {
    it("returns errors from multiple invalid profiles combined", () => {
      const invalidProfile1 = createValidProfile({ id: "bad1", tempoRange: { min: 0, max: 140 } });
      const invalidProfile2 = createValidProfile({ id: "bad2", tempoRange: { min: 120, max: 400 } });
      const errors = validateAllProfiles([invalidProfile1, invalidProfile2]);

      const bad1Errors = errors.filter((e) => e.profileId === "bad1");
      const bad2Errors = errors.filter((e) => e.profileId === "bad2");
      expect(bad1Errors.length).toBeGreaterThan(0);
      expect(bad2Errors.length).toBeGreaterThan(0);
    });

    it("returns empty array when all profiles are valid", () => {
      const profile1 = createValidProfile({ id: "valid1" });
      const profile2 = createValidProfile({ id: "valid2" });
      const errors = validateAllProfiles([profile1, profile2]);
      expect(errors).toEqual([]);
    });
  });
});
