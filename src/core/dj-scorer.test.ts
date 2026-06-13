import { describe, it, expect, vi } from "vitest";
import type { Section } from "./section-scanner.js";

// ─── Mock genre-registry ───────────────────────────────────────────────

vi.mock("./genre-registry.js", () => ({
  getProfile: vi.fn(() => ({ id: "techno", name: "Techno", family: "techno" })),
  getProfileBySubgenre: vi.fn(() => null),
}));

import { computeDjScore, type DjScoreInput } from "./dj-scorer.js";
import { getProfile, getProfileBySubgenre } from "./genre-registry.js";

const mockedGetProfile = vi.mocked(getProfile);
const mockedGetProfileBySubgenre = vi.mocked(getProfileBySubgenre);

// ─── Helpers ───────────────────────────────────────────────────────────

/** Create a section with startTime and endTime in beats (4 beats = 1 bar). */
function makeSection(id: string, name: string, startBar: number, endBar: number): Section {
  return {
    id,
    name,
    startTime: (startBar - 1) * 4, // convert bar 1 to beat 0
    endTime: (endBar - 1) * 4,
  };
}

// ─── Unit Tests ────────────────────────────────────────────────────────

describe("DJ Scorer", () => {
  describe("0 sections → totalScore 0", () => {
    it("returns totalScore 0 with empty components when sections array is empty", () => {
      const input: DjScoreInput = {
        sections: [],
        energyCurve: [],
        tempo: 128,
        genreId: "techno",
      };

      const result = computeDjScore(input);

      expect(result.totalScore).toBe(0);
      expect(result.components).toEqual([]);
      expect(result.phraseIssues).toEqual([]);
      expect(result.applicable).toBe(true);
    });
  });

  describe("1 section → intro and outro are same section", () => {
    it("uses the single section for both intro and outro length scoring", () => {
      // One section: 32 bars (beat 0 to beat 128) → intro=100, outro=100
      const section = makeSection("section-0", "Main", 1, 33); // bars 1–32 = 32 bars
      const input: DjScoreInput = {
        sections: [section],
        energyCurve: [3],
        tempo: 128,
        genreId: "techno",
      };

      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);
      expect(result.components.length).toBe(6);

      // Intro and outro both refer to the same (only) section
      const introComponent = result.components.find((c) => c.name === "Intro Length");
      const outroComponent = result.components.find((c) => c.name === "Outro Length");

      expect(introComponent).toBeDefined();
      expect(outroComponent).toBeDefined();
      // 32 bars → score 100 for both
      expect(introComponent!.score).toBe(100);
      expect(outroComponent!.score).toBe(100);
    });

    it("scores a short single section as 0 for intro and outro", () => {
      // One section: 8 bars (< 16) → intro=0, outro=0
      const section = makeSection("section-0", "Short", 1, 9); // bars 1–8 = 8 bars
      const input: DjScoreInput = {
        sections: [section],
        energyCurve: [2],
        tempo: 128,
        genreId: "techno",
      };

      const result = computeDjScore(input);

      const introComponent = result.components.find((c) => c.name === "Intro Length");
      const outroComponent = result.components.find((c) => c.name === "Outro Length");

      expect(introComponent!.score).toBe(0);
      expect(outroComponent!.score).toBe(0);
    });
  });

  describe("all sections on phrase boundaries → phrase score 100", () => {
    it("scores phrase alignment at 100 when all sections start on 8-bar boundaries", () => {
      // Phrase boundaries: bar 1, 9, 17, 25, 33 → (bar-1) % 8 === 0
      // In beats: bar 1 = beat 0, bar 9 = beat 32, bar 17 = beat 64, bar 25 = beat 96
      const sections: Section[] = [
        makeSection("s0", "Intro", 1, 9),     // starts bar 1
        makeSection("s1", "Build", 9, 17),    // starts bar 9
        makeSection("s2", "Drop", 17, 25),    // starts bar 17
        makeSection("s3", "Break", 25, 33),   // starts bar 25
        makeSection("s4", "Outro", 33, 41),   // starts bar 33
      ];

      const input: DjScoreInput = {
        sections,
        energyCurve: [2, 5, 8, 4, 2],
        tempo: 128,
        genreId: "techno",
      };

      const result = computeDjScore(input);

      const phraseComponent = result.components.find((c) => c.name === "Phrase Alignment");
      expect(phraseComponent).toBeDefined();
      expect(phraseComponent!.score).toBe(100);
      expect(result.phraseIssues).toHaveLength(0);
    });
  });

  describe("specific known arrangement → expected score", () => {
    it("computes correct total for a well-structured DJ track", () => {
      // Arrangement: 32-bar intro, 16-bar build, 32-bar drop, 16-bar break, 32-bar drop2, 32-bar outro
      // All on 8-bar boundaries (bars 1, 33, 49, 81, 97, 129)
      const sections: Section[] = [
        makeSection("s0", "Intro", 1, 33),    // 32 bars, starts bar 1
        makeSection("s1", "Build", 33, 49),   // 16 bars, starts bar 33
        makeSection("s2", "Drop", 49, 81),    // 32 bars, starts bar 49
        makeSection("s3", "Break", 81, 97),   // 16 bars, starts bar 81
        makeSection("s4", "Drop 2", 97, 129), // 32 bars, starts bar 97
        makeSection("s5", "Outro", 129, 161), // 32 bars, starts bar 129
      ];

      const energyCurve = [2, 5, 9, 4, 9, 2];

      const input: DjScoreInput = {
        sections,
        energyCurve,
        tempo: 128,
        genreId: "techno",
      };

      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);

      // Verify individual components:
      // Intro: 32 bars → 100, weight 0.20 → weighted 20
      const intro = result.components.find((c) => c.name === "Intro Length")!;
      expect(intro.score).toBe(100);
      expect(intro.weighted).toBeCloseTo(20);

      // Outro: 32 bars → 100, weight 0.20 → weighted 20
      const outro = result.components.find((c) => c.name === "Outro Length")!;
      expect(outro.score).toBe(100);
      expect(outro.weighted).toBeCloseTo(20);

      // Phrase alignment: all on boundaries → 100, weight 0.20 → weighted 20
      const phrase = result.components.find((c) => c.name === "Phrase Alignment")!;
      expect(phrase.score).toBe(100);
      expect(phrase.weighted).toBeCloseTo(20);

      // Mix zone cleanliness: intro energy=2 (≤3 → 100), outro energy=2 (≤3 → 100)
      // Average = 100, weight 0.15 → weighted 15
      const mixZone = result.components.find((c) => c.name === "Mix Zone Cleanliness")!;
      expect(mixZone.score).toBe(100);
      expect(mixZone.weighted).toBeCloseTo(15);

      // Tempo consistency: always 100, weight 0.15 → weighted 15
      const tempo = result.components.find((c) => c.name === "Tempo Consistency")!;
      expect(tempo.score).toBe(100);
      expect(tempo.weighted).toBeCloseTo(15);

      // Energy positioning: first=2 (≤5), last=2 (≤5) → 100, weight 0.10 → weighted 10
      const energyPos = result.components.find((c) => c.name === "Energy Positioning")!;
      expect(energyPos.score).toBe(100);
      expect(energyPos.weighted).toBeCloseTo(10);

      // Total: 20 + 20 + 20 + 15 + 15 + 10 = 100
      expect(result.totalScore).toBe(100);
    });

    it("computes correct total for a track with some issues", () => {
      // 16-bar intro (score 50), 8-bar outro (score 0)
      // Section at bar 5 is off-boundary (5 of 4 sections aligned = 75%)
      const sections: Section[] = [
        makeSection("s0", "Intro", 1, 17),    // 16 bars, starts bar 1 (aligned)
        makeSection("s1", "Build", 17, 25),   // 8 bars, starts bar 17 (aligned)
        makeSection("s2", "Drop", 25, 30),    // 5 bars, starts bar 25 (aligned)
        makeSection("s3", "Outro", 30, 38),   // 8 bars, starts bar 30 (NOT aligned: (30-1)%8 = 5)
      ];

      const energyCurve = [3, 6, 9, 4];

      const input: DjScoreInput = {
        sections,
        energyCurve,
        tempo: 126,
        genreId: "techno",
      };

      const result = computeDjScore(input);

      expect(result.applicable).toBe(true);

      // Intro: 16 bars → 50
      const intro = result.components.find((c) => c.name === "Intro Length")!;
      expect(intro.score).toBe(50);

      // Outro: 8 bars → 0
      const outro = result.components.find((c) => c.name === "Outro Length")!;
      expect(outro.score).toBe(0);

      // Phrase alignment: 3 of 4 aligned → round(3/4 * 100) = 75
      const phrase = result.components.find((c) => c.name === "Phrase Alignment")!;
      expect(phrase.score).toBe(75);
      expect(result.phraseIssues).toHaveLength(1);
      expect(result.phraseIssues[0]!.sectionId).toBe("s3");

      // Mix zone cleanliness: introEnergy=3 (≤3 → 100), outroEnergy=4 (4-5 → 75)
      // average = (100+75)/2 = 87.5 → 88
      const mixZone = result.components.find((c) => c.name === "Mix Zone Cleanliness")!;
      expect(mixZone.score).toBe(88);

      // Energy positioning: first=3 (≤5 → 100), last=4 (≤5 → 100)
      // min(100, 100) = 100
      const energyPos = result.components.find((c) => c.name === "Energy Positioning")!;
      expect(energyPos.score).toBe(100);

      // Total: 50*0.20 + 0*0.20 + 75*0.20 + 88*0.15 + 100*0.15 + 100*0.10
      // = 10 + 0 + 15 + 13.2 + 15 + 10 = 63.2 → round = 63
      expect(result.totalScore).toBe(63);
    });
  });

  describe("non-DJ genre returns inapplicable", () => {
    it("returns applicable=false for ambient family", () => {
      mockedGetProfile.mockReturnValueOnce({
        id: "ambient",
        name: "Ambient",
        family: "ambient",
      } as any);

      const input: DjScoreInput = {
        sections: [makeSection("s0", "Intro", 1, 33)],
        energyCurve: [3],
        tempo: 90,
        genreId: "ambient",
      };

      const result = computeDjScore(input);

      expect(result.applicable).toBe(false);
      expect(result.inapplicableReason).toContain("ambient");
      expect(result.totalScore).toBe(0);
    });

    it("returns applicable=false when no genre is selected", () => {
      const input: DjScoreInput = {
        sections: [makeSection("s0", "Intro", 1, 33)],
        energyCurve: [3],
        tempo: 128,
        genreId: null,
      };

      const result = computeDjScore(input);

      expect(result.applicable).toBe(false);
      expect(result.inapplicableReason).toContain("No genre selected");
    });
  });
});
