import { describe, it, expect } from "vitest";
import { computeAlignment } from "../../../src/core/alignment-scorer.js";
import { getProfile } from "../../../src/core/genre-registry.js";
import type { GenreProfile, SectionTemplate } from "../../../src/core/genre-profile-types.js";
import type { Section } from "../../../src/core/section-scanner.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

/** Create a minimal valid GenreProfile with a given structure template. */
function makeProfile(structure: SectionTemplate[]): GenreProfile {
  return {
    id: "test-genre",
    name: "Test Genre",
    family: "test",
    tempoRange: { min: 120, max: 140 },
    structure,
    energyCurveTemplate: structure.filter((s) => !s.optional).map(() => 5),
    transitions: {
      preferred: ["filter_sweep"],
      discouraged: [],
      buildDurationRange: { min: 4, max: 16 },
      dropsExpected: false,
    },
    energyWeights: {
      trackCountWeight: 0.2,
      midiDensityWeight: 0.2,
      audioPresenceWeight: 0.2,
      automationWeight: 0.2,
      frequencyCoverageWeight: 0.2,
    },
    detectionRules: [],
    detectionThresholds: {
      flatEnergyMaxDelta: 2,
      missingTransitionMinDelta: 3,
      similarityCeilingPercent: 90,
    },
  };
}

/** Create a Section with a given name and bar count (4 beats per bar). */
function makeSection(name: string, bars: number, startBar = 0): Section {
  return {
    id: `section-${name}`,
    name,
    startTime: startBar * 4,
    endTime: (startBar + bars) * 4,
  };
}

// ─── Standard Template ─────────────────────────────────────────────────

const STANDARD_TEMPLATE: SectionTemplate[] = [
  { name: "Intro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
  { name: "Build", lengthRange: { min: 8, max: 16 }, energyRange: { min: 4, max: 6 }, optional: false },
  { name: "Drop", lengthRange: { min: 16, max: 32 }, energyRange: { min: 8, max: 10 }, optional: false },
  { name: "Breakdown", lengthRange: { min: 8, max: 16 }, energyRange: { min: 3, max: 5 }, optional: false },
  { name: "Outro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
];

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Alignment Scorer", () => {
  describe("computeAlignment returns null when no genre selected", () => {
    it("returns null when profile is null", () => {
      const sections: Section[] = [makeSection("Intro", 16)];
      const result = computeAlignment(sections, null, 128);
      expect(result).toBeNull();
    });
  });

  describe("empty sections", () => {
    it("returns all zeros for an empty sections array", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const result = computeAlignment([], profile, 128);
      expect(result).toEqual({ overall: 0, ordering: 0, length: 0, count: 0 });
    });
  });

  describe("perfect alignment", () => {
    it("returns 100 for all dimensions when arrangement matches template exactly", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      // Create sections that match the template perfectly (all within range, in order)
      const sections: Section[] = [
        makeSection("Intro", 16, 0),
        makeSection("Build", 8, 16),
        makeSection("Drop", 16, 24),
        makeSection("Breakdown", 8, 40),
        makeSection("Outro", 16, 48),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result).not.toBeNull();
      expect(result!.ordering).toBe(100);
      expect(result!.length).toBe(100);
      expect(result!.count).toBe(100);
      expect(result!.overall).toBe(100);
    });
  });

  describe("ordering dimension", () => {
    it("scores 100 when all template sections are present in correct order", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Build", 10, 20),
        makeSection("Drop", 20, 30),
        makeSection("Breakdown", 10, 50),
        makeSection("Outro", 20, 60),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.ordering).toBe(100);
    });

    it("reduces ordering score when sections are out of order", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      // Swap Drop and Build — LCS should be Intro, Build/Drop (3 or 4 depending on best match)
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Drop", 20, 20),
        makeSection("Build", 10, 40),
        makeSection("Breakdown", 10, 50),
        makeSection("Outro", 20, 60),
      ];

      const result = computeAlignment(sections, profile, 128);
      // LCS: Intro, Drop, Breakdown, Outro = 4 out of 5 template items
      expect(result!.ordering).toBe(80);
    });

    it("scores 0 when no sections match template names", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("Verse", 16, 0),
        makeSection("Chorus", 16, 16),
        makeSection("Bridge", 16, 32),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.ordering).toBe(0);
    });

    it("is case-insensitive for section name matching", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("intro", 20, 0),
        makeSection("BUILD", 10, 20),
        makeSection("drop", 20, 30),
        makeSection("BREAKDOWN", 10, 50),
        makeSection("Outro", 20, 60),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.ordering).toBe(100);
    });
  });

  describe("length dimension", () => {
    it("scores 100 when all sections are within their length range", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("Intro", 20, 0),   // range 16-32 ✓
        makeSection("Build", 12, 20),  // range 8-16 ✓
        makeSection("Drop", 24, 32),   // range 16-32 ✓
        makeSection("Breakdown", 10, 56), // range 8-16 ✓
        makeSection("Outro", 20, 66),  // range 16-32 ✓
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(100);
    });

    it("reduces score when section is below min (linear falloff)", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      // Section is 12 bars, min is 16. Lower bound is 0.5 * 16 = 8.
      // Score = (12 - 8) / (16 - 8) = 4/8 = 0.5
      const sections: Section[] = [makeSection("Main", 12, 0)];
      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(50);
    });

    it("gives zero score when section is at or below 0.5× min", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      // Section is 8 bars, which is exactly 0.5 * min(16) = lower bound. Score = 0.
      const sections: Section[] = [makeSection("Main", 8, 0)];
      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(0);
    });

    it("reduces score when section is above max (linear falloff)", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      // Section is 48 bars, max is 32. Upper bound is 2 * 32 = 64.
      // Score = (64 - 48) / (64 - 32) = 16/32 = 0.5
      const sections: Section[] = [makeSection("Main", 48, 0)];
      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(50);
    });

    it("gives zero score when section is at or above 2× max", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      // Section is 64 bars, which is exactly 2 * max(32) = upper bound. Score = 0.
      const sections: Section[] = [makeSection("Main", 64, 0)];
      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(0);
    });

    it("excludes sections with no matching template from length scoring", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      // "Unknown" section has no match — only "Main" is scored
      const sections: Section[] = [
        makeSection("Main", 20, 0),    // within range → full score
        makeSection("Unknown", 4, 20), // no template match → excluded
      ];
      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(100);
    });

    it("returns 0 for length when no sections match template names", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("Verse", 16, 0),
        makeSection("Chorus", 16, 16),
      ];
      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(0);
    });

    it("excludes sections with Infinity endTime from length scoring", () => {
      const template: SectionTemplate[] = [
        { name: "Intro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        {
          id: "section-main",
          name: "Main",
          startTime: 80,
          endTime: Infinity, // Last section with no known end
        },
      ];
      const result = computeAlignment(sections, profile, 128);
      // Only "Intro" is scored for length (Main has Infinity end)
      expect(result!.length).toBe(100);
    });
  });

  describe("count dimension", () => {
    it("scores 100 when all non-optional sections are present with no extras", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Build", 10, 20),
        makeSection("Drop", 20, 30),
        makeSection("Breakdown", 10, 50),
        makeSection("Outro", 20, 60),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.count).toBe(100);
    });

    it("reduces score for missing non-optional sections", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      // Missing Build and Breakdown (2 of 5 non-optional)
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Drop", 20, 20),
        makeSection("Outro", 20, 40),
      ];

      const result = computeAlignment(sections, profile, 128);
      // penalty = 2/5 = 0.4, score = 1 - 0.4 = 0.6 → 60
      expect(result!.count).toBe(60);
    });

    it("reduces score for extra sections not in template", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      // All 5 present plus 2 extra sections
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Build", 10, 20),
        makeSection("Drop", 20, 30),
        makeSection("Breakdown", 10, 50),
        makeSection("Outro", 20, 60),
        makeSection("Extra A", 8, 80),
        makeSection("Extra B", 8, 88),
      ];

      const result = computeAlignment(sections, profile, 128);
      // 5 matched, 2 extras. penalty = 2/5 = 0.4, score = 1 - 0.4 = 0.6 → 60
      expect(result!.count).toBe(60);
    });

    it("does not penalize for missing optional sections", () => {
      const templateWithOptional: SectionTemplate[] = [
        { name: "Intro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
        { name: "Bridge", lengthRange: { min: 8, max: 16 }, energyRange: { min: 4, max: 6 }, optional: true },
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        { name: "Outro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
      ];
      const profile = makeProfile(templateWithOptional);

      // Bridge is optional and missing — no penalty
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Main", 20, 20),
        makeSection("Outro", 20, 40),
      ];

      const result = computeAlignment(sections, profile, 128);
      // 3 non-optional expected, 3 matched, 0 extra → 100
      expect(result!.count).toBe(100);
    });

    it("does not penalize when optional sections are present", () => {
      const templateWithOptional: SectionTemplate[] = [
        { name: "Intro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
        { name: "Bridge", lengthRange: { min: 8, max: 16 }, energyRange: { min: 4, max: 6 }, optional: true },
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 7, max: 9 }, optional: false },
        { name: "Outro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
      ];
      const profile = makeProfile(templateWithOptional);

      // All sections present including optional Bridge
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Bridge", 10, 20),
        makeSection("Main", 20, 30),
        makeSection("Outro", 20, 50),
      ];

      const result = computeAlignment(sections, profile, 128);
      // 3 non-optional expected, 3 matched, Bridge is optional (no effect) → 100
      expect(result!.count).toBe(100);
    });

    it("count score cannot go below 0", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);

      // 1 expected non-optional, 0 matched, 10 extra sections
      const sections: Section[] = Array.from({ length: 10 }, (_, i) =>
        makeSection(`Extra${i}`, 8, i * 8),
      );

      const result = computeAlignment(sections, profile, 128);
      expect(result!.count).toBe(0);
    });

    it("handles duplicate template sections correctly", () => {
      // Template expects two "Drop" sections
      const template: SectionTemplate[] = [
        { name: "Intro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
        { name: "Drop", lengthRange: { min: 16, max: 32 }, energyRange: { min: 8, max: 10 }, optional: false },
        { name: "Drop", lengthRange: { min: 16, max: 32 }, energyRange: { min: 8, max: 10 }, optional: false },
        { name: "Outro", lengthRange: { min: 16, max: 32 }, energyRange: { min: 2, max: 4 }, optional: false },
      ];
      const profile = makeProfile(template);

      // Both drops present
      const sections: Section[] = [
        makeSection("Intro", 20, 0),
        makeSection("Drop", 20, 20),
        makeSection("Drop", 20, 40),
        makeSection("Outro", 20, 60),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.count).toBe(100);
    });
  });

  describe("overall score weighted formula", () => {
    it("overall equals Math.round(0.4 * ordering + 0.35 * length + 0.25 * count)", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      // Partial match: sections out of order, some outside range, some missing
      const sections: Section[] = [
        makeSection("Outro", 20, 0),   // out of order
        makeSection("Intro", 20, 20),  // out of order but within range
        makeSection("Drop", 20, 40),   // present and in valid range
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result).not.toBeNull();

      const expected = Math.round(
        0.4 * result!.ordering + 0.35 * result!.length + 0.25 * result!.count,
      );
      expect(result!.overall).toBe(expected);
    });

    it("all dimension scores are integers in [0, 100]", () => {
      const profile = makeProfile(STANDARD_TEMPLATE);
      const sections: Section[] = [
        makeSection("Intro", 10, 0),
        makeSection("Build", 20, 10),
        makeSection("Drop", 50, 30),
      ];

      const result = computeAlignment(sections, profile, 128);
      expect(result).not.toBeNull();
      expect(result!.overall).toBeGreaterThanOrEqual(0);
      expect(result!.overall).toBeLessThanOrEqual(100);
      expect(result!.ordering).toBeGreaterThanOrEqual(0);
      expect(result!.ordering).toBeLessThanOrEqual(100);
      expect(result!.length).toBeGreaterThanOrEqual(0);
      expect(result!.length).toBeLessThanOrEqual(100);
      expect(result!.count).toBeGreaterThanOrEqual(0);
      expect(result!.count).toBeLessThanOrEqual(100);
    });
  });

  describe("sections outside range edge cases", () => {
    it("section exactly at min boundary gets full length score", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);
      const sections: Section[] = [makeSection("Main", 16, 0)];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(100);
    });

    it("section exactly at max boundary gets full length score", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);
      const sections: Section[] = [makeSection("Main", 32, 0)];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(100);
    });

    it("section just below min gets partial length score", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);
      // 14 bars: (14 - 8) / (16 - 8) = 6/8 = 0.75
      const sections: Section[] = [makeSection("Main", 14, 0)];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(75);
    });

    it("section just above max gets partial length score", () => {
      const template: SectionTemplate[] = [
        { name: "Main", lengthRange: { min: 16, max: 32 }, energyRange: { min: 5, max: 8 }, optional: false },
      ];
      const profile = makeProfile(template);
      // 40 bars: (64 - 40) / (64 - 32) = 24/32 = 0.75
      const sections: Section[] = [makeSection("Main", 40, 0)];

      const result = computeAlignment(sections, profile, 128);
      expect(result!.length).toBe(75);
    });
  });

  describe("integration with real techno profile", () => {
    it("typical techno arrangement scores well against the techno template", () => {
      const profile = getProfile("techno");
      expect(profile).not.toBeNull();

      // A reasonable techno arrangement matching the template section names exactly
      const sections: Section[] = [
        makeSection("Intro", 24, 0),
        makeSection("Build", 12, 24),
        makeSection("Main A", 48, 36),
        makeSection("Breakdown", 12, 84),
        makeSection("Build B", 12, 96),
        makeSection("Main B", 48, 108),
        makeSection("Outro", 24, 156),
      ];

      const result = computeAlignment(sections, profile!, 128);
      expect(result).not.toBeNull();
      expect(result!.overall).toBeGreaterThanOrEqual(80);
      expect(result!.ordering).toBe(100);
      expect(result!.length).toBe(100);
      expect(result!.count).toBe(100);
    });
  });
});
