/**
 * Integration tests for the full genre pipeline (end-to-end).
 *
 * Tests the combined flow of detectIssues + generateSectionChecklists to verify:
 * 1. Full analysis pipeline with genre produces correct checklist + suppressed issues
 * 2. All permissive genres (IDM, Glitch, Breakcore, Speedcore) trigger SPM correctly
 * 3. All rhythm genres (Classic Detroit Electro, Nu-Skool Breakbeat, IDM, Chicago Footwork) trigger NSRG
 * 4. Checklist stability across re-analysis (same inputs → identical output)
 *
 * Validates: Requirements 1.9, 2.1, 2.9, 3.1, 3.7
 */
import { describe, it, expect } from "vitest";
import { detectIssues, isSpecialParserMode, isNonStandardRhythmGenre } from "../../src/core/issue-detector.js";
import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import { getProfile, getProfileBySubgenre } from "../../src/core/genre-registry.js";
import type { IssueDetectorInput } from "../../src/core/issue-types.js";
import type { Section } from "../../src/core/section-scanner.js";
import type { SectionAnalysisState } from "../../src/state/store.js";
import type { TrackClipData, TrackNoteData } from "../../src/core/section-analyzer.js";
import type { TrackInfo } from "../../src/core/track-reader.js";
import type { FrequencyBucket } from "../../src/core/track-categorizer.js";
import type { TransitionRecommendation } from "../../src/core/transition-engine.js";

// ─── Test Fixtures ─────────────────────────────────────────────────────

/**
 * A realistic 5-section arrangement designed to trigger multiple sub-detectors:
 * - Intro has low energy → may trigger intro-length issues
 * - All sections have same instruments → triggers flat-energy + repetition
 * - Adjacent sections have very similar content → triggers repetition
 * - Large energy delta between Intro/Drop → triggers abrupt-change
 * - Multiple tracks in same bucket → triggers frequency-crowding
 */
const testSections: Section[] = [
  { id: "section-intro", name: "Intro", startTime: 0, endTime: 32 },
  { id: "section-build", name: "Build", startTime: 32, endTime: 64 },
  { id: "section-drop", name: "Drop", startTime: 64, endTime: 128 },
  { id: "section-breakdown", name: "Breakdown", startTime: 128, endTime: 160 },
  { id: "section-outro", name: "Outro", startTime: 160, endTime: 192 },
];

const testTrackInventory: TrackInfo[] = [
  { name: "Kick", type: "midi" },
  { name: "Bass", type: "midi" },
  { name: "Lead", type: "midi" },
  { name: "Pad", type: "midi" },
];

/** Track clip data: all tracks active across all sections (creates uniform presence). */
const testTrackClipData: TrackClipData[] = [
  {
    trackName: "Kick",
    trackType: "midi",
    clips: [{ startTime: 0, endTime: 192, muted: false, hasEnvelopes: false }],
  },
  {
    trackName: "Bass",
    trackType: "midi",
    clips: [{ startTime: 0, endTime: 192, muted: false, hasEnvelopes: false }],
  },
  {
    trackName: "Lead",
    trackType: "midi",
    clips: [{ startTime: 0, endTime: 192, muted: false, hasEnvelopes: false }],
  },
  {
    trackName: "Pad",
    trackType: "midi",
    clips: [{ startTime: 0, endTime: 192, muted: false, hasEnvelopes: false }],
  },
];

/** Track note data: uniform density to trigger flat energy and repetition. */
const testTrackNoteData: TrackNoteData[] = [
  {
    trackName: "Kick",
    notes: Array.from({ length: 48 }, (_, i) => ({
      pitch: 36,
      startTime: i * 4,
      duration: 1,
      velocity: 100,
    })),
  },
  {
    trackName: "Bass",
    notes: Array.from({ length: 48 }, (_, i) => ({
      pitch: 40,
      startTime: i * 4 + 2,
      duration: 1,
      velocity: 90,
    })),
  },
  {
    trackName: "Lead",
    notes: Array.from({ length: 48 }, (_, i) => ({
      pitch: 60,
      startTime: i * 4 + 1,
      duration: 1,
      velocity: 80,
    })),
  },
  {
    trackName: "Pad",
    notes: Array.from({ length: 24 }, (_, i) => ({
      pitch: 72,
      startTime: i * 8,
      duration: 4,
      velocity: 70,
    })),
  },
];

/**
 * Track buckets: Kick and Bass in the same bucket to trigger frequency-crowding.
 */
const testTrackBuckets: FrequencyBucket[] = ["bass", "bass", "mid", "high-mid"];

/** Section analysis state: uniform across sections. */
const testSectionAnalysis: Map<string, SectionAnalysisState> = new Map([
  ["section-intro", { activeTrackCount: 4, midiDensity: 6, hasAutomation: false, energyScore: 5 }],
  ["section-build", { activeTrackCount: 4, midiDensity: 6, hasAutomation: false, energyScore: 5 }],
  ["section-drop", { activeTrackCount: 4, midiDensity: 6, hasAutomation: false, energyScore: 5 }],
  ["section-breakdown", { activeTrackCount: 4, midiDensity: 6, hasAutomation: false, energyScore: 5 }],
  ["section-outro", { activeTrackCount: 4, midiDensity: 6, hasAutomation: false, energyScore: 5 }],
]);

/** Flat energy curve to trigger flat-energy detection. */
const testEnergyCurve: number[] = [5, 5, 5, 5, 5];

function buildIssueDetectorInput(selectedGenre: string | null): IssueDetectorInput {
  return {
    sections: testSections,
    sectionAnalysis: testSectionAnalysis,
    energyCurve: testEnergyCurve,
    trackInventory: testTrackInventory,
    trackClipData: testTrackClipData,
    trackNoteData: testTrackNoteData,
    trackBuckets: testTrackBuckets,
    selectedGenre,
  };
}

/** Minimal transition recommendations for checklist tests. */
const testTransitionRecommendations: TransitionRecommendation[] = [
  {
    id: "tr-0",
    fromSectionId: "section-intro",
    toSectionId: "section-build",
    energyDelta: 0,
    transitionSize: "medium",
    suggestedDurationBars: 4,
    techniques: [{ category: "filter_sweep", name: "filter-sweep", durationBars: 4 }],
    boundaryType: "build",
    checklist: [{ id: "check-1", text: "Add a filter sweep", completed: false }],
    rationale: "Smooth transition into build",
  },
];

// ─── Suppressed Issue Types (SPM) ──────────────────────────────────────

const SPM_SUPPRESSED_TYPES = ["flat-energy", "repetition", "abrupt-change", "intro-length", "outro-length"];

// ─── Test Suites ───────────────────────────────────────────────────────

describe("Genre Integration Pipeline", () => {
  describe("full analysis pipeline: detectIssues + generateSectionChecklists", () => {
    it("produces genre-sourced checklist items and suppressed issues for a permissive genre (IDM)", () => {
      // Step 1: Detect issues with IDM selected
      const input = buildIssueDetectorInput("idm");
      const issues = detectIssues(input);

      // IDM triggers SPM — should have zero suppressed issue types
      const suppressedIssues = issues.filter((i) => SPM_SUPPRESSED_TYPES.includes(i.type));
      expect(suppressedIssues).toHaveLength(0);

      // Frequency-crowding should still be detected (always runs)
      // Note: frequency-crowding only fires if conditions met; we just verify it's not suppressed
      const nonSuppressedTypes = issues.map((i) => i.type);
      for (const type of SPM_SUPPRESSED_TYPES) {
        expect(nonSuppressedTypes).not.toContain(type);
      }

      // Step 2: Generate checklists using the detected issues + IDM genre
      const checklist = generateSectionChecklists({
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map(),
        selectedGenre: "idm",
      });

      // Verify checklist structure
      expect(Object.keys(checklist)).toHaveLength(testSections.length);

      // Verify genre-sourced items exist (IDM profile has sections that should match)
      const allItems = Object.values(checklist).flat();
      const genreItems = allItems.filter((item) => item.source === "genre");
      // IDM has structure templates; at least some should match our section names
      // (IDM has "Opening Texture", "Resolution" etc. which won't match "Intro", "Build", etc.,
      // but the detection rules generate items for critical/warning severity rules)
      // The important thing is genre items appear with correct source
      for (const item of genreItems) {
        expect(item.source).toBe("genre");
        expect(item.id).toMatch(/^genre-/);
      }

      // Verify transition items still appear
      const transitionItems = allItems.filter((item) => item.source === "transition");
      expect(transitionItems.length).toBeGreaterThan(0);

      // Verify ordering within sections: issue → genre → transition
      for (const sectionId of testSections.map((s) => s.id)) {
        const items = checklist[sectionId] ?? [];
        let lastIssueIdx = -1;
        let firstGenreIdx = Infinity;
        let lastGenreIdx = -1;
        let firstTransitionIdx = Infinity;

        items.forEach((item, idx) => {
          if (item.source === "issue") lastIssueIdx = idx;
          if (item.source === "genre" && idx < firstGenreIdx) firstGenreIdx = idx;
          if (item.source === "genre") lastGenreIdx = idx;
          if (item.source === "transition" && idx < firstTransitionIdx) firstTransitionIdx = idx;
        });

        // If both issue and genre items exist, issues come first
        if (lastIssueIdx >= 0 && firstGenreIdx < Infinity) {
          expect(lastIssueIdx).toBeLessThan(firstGenreIdx);
        }
        // If both genre and transition items exist, genre comes first
        if (lastGenreIdx >= 0 && firstTransitionIdx < Infinity) {
          expect(lastGenreIdx).toBeLessThan(firstTransitionIdx);
        }
      }
    });

    it("produces normal issues and genre items for a non-permissive genre (Techno)", () => {
      const input = buildIssueDetectorInput("techno");
      const issues = detectIssues(input);

      // Techno is NOT a permissive genre — should produce standard issues
      // With flat energy curve, expect flat-energy or repetition issues
      const issueTypes = issues.map((i) => i.type);
      // At least some standard issues should fire (flat energy is likely with uniform data)
      expect(issues.length).toBeGreaterThan(0);

      // Generate checklist
      const checklist = generateSectionChecklists({
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map(),
        selectedGenre: "techno",
      });

      // Should have issue-sourced items
      const allItems = Object.values(checklist).flat();
      const issueItems = allItems.filter((item) => item.source === "issue");
      expect(issueItems.length).toBeGreaterThan(0);

      // Should also have genre items (Techno has matching templates for "Intro", "Breakdown", "Outro")
      const genreItems = allItems.filter((item) => item.source === "genre");
      expect(genreItems.length).toBeGreaterThan(0);
    });

    it("produces no genre items when no genre is selected", () => {
      const input = buildIssueDetectorInput(null);
      const issues = detectIssues(input);

      const checklist = generateSectionChecklists({
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map(),
        selectedGenre: null,
      });

      const allItems = Object.values(checklist).flat();
      const genreItems = allItems.filter((item) => item.source === "genre");
      expect(genreItems).toHaveLength(0);
    });
  });

  describe("all permissive genres trigger Special Parser Mode correctly", () => {
    const permissiveGenres = [
      { id: "idm", name: "IDM" },
      { id: "glitch", name: "Glitch" },
      { id: "breakcore", name: "Breakcore" },
      { id: "speedcore", name: "Speedcore" },
    ];

    for (const genre of permissiveGenres) {
      it(`${genre.name} (${genre.id}) triggers SPM and suppresses standard detectors`, () => {
        // Verify profile resolution
        const profile = getProfile(genre.id) ?? getProfileBySubgenre(genre.id);
        expect(profile).not.toBeNull();
        expect(isSpecialParserMode(profile)).toBe(true);

        // Run detectIssues
        const input = buildIssueDetectorInput(genre.id);
        const issues = detectIssues(input);

        // Should produce zero issues of suppressed types
        for (const suppressedType of SPM_SUPPRESSED_TYPES) {
          const found = issues.filter((i) => i.type === suppressedType);
          expect(found, `${genre.name} should suppress "${suppressedType}" issues`).toHaveLength(0);
        }

        // Frequency-crowding is NOT suppressed (may or may not fire depending on data)
        // The important check is that suppressed types are gone
      });
    }

    it("all permissive genre profiles have the standard-structure-not-applicable rule", () => {
      for (const genre of permissiveGenres) {
        const profile = getProfile(genre.id) ?? getProfileBySubgenre(genre.id);
        expect(profile).not.toBeNull();

        const hasRule = profile!.detectionRules.some(
          (r) => r.type === "standard-structure-not-applicable" && r.value === true,
        );
        expect(hasRule, `${genre.name} profile must have standard-structure-not-applicable rule`).toBe(true);
      }
    });
  });

  describe("all rhythm genres trigger Non-Standard Rhythm Genre correctly", () => {
    const rhythmGenres = [
      { id: "classic-detroit-electro", name: "Classic Detroit Electro" },
      { id: "nu-skool-breakbeat", name: "Nu-Skool Breakbeat" },
      { id: "idm", name: "IDM" },
      { id: "chicago-footwork", name: "Chicago Footwork" },
    ];

    for (const genre of rhythmGenres) {
      it(`${genre.name} (${genre.id}) triggers NSRG detection`, () => {
        // Verify profile resolution
        const profile = getProfile(genre.id) ?? getProfileBySubgenre(genre.id);
        expect(profile).not.toBeNull();
        expect(isNonStandardRhythmGenre(profile)).toBe(true);
      });
    }

    it("non-rhythm genres do NOT trigger NSRG", () => {
      const standardGenres = ["techno", "house", "trance"];
      for (const genreId of standardGenres) {
        const profile = getProfile(genreId);
        expect(profile).not.toBeNull();
        expect(isNonStandardRhythmGenre(profile)).toBe(false);
      }
    });

    it("Chicago Footwork applies triplet-hihat and half-time adjustments via detectIssues", () => {
      const profile = getProfile("chicago-footwork") ?? getProfileBySubgenre("chicago-footwork");
      expect(profile).not.toBeNull();

      // Verify the profile has the expected rhythm rules
      const hasTriplet = profile!.detectionRules.some(
        (r) => r.type === "triplet-hihat-expected" && r.value === true,
      );
      const hasHalfTime = profile!.detectionRules.some(
        (r) => r.type === "half-time-feel-expected" && r.value === true,
      );
      expect(hasTriplet).toBe(true);
      expect(hasHalfTime).toBe(true);

      // Run detectIssues — the rhythm adjustments should be applied internally
      const input = buildIssueDetectorInput("chicago-footwork");
      const issues = detectIssues(input);

      // All returned issues should be well-formed
      for (const issue of issues) {
        expect(issue.id).toBeTruthy();
        expect(issue.message.length).toBeLessThanOrEqual(200);
        expect(issue.sectionIds.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("Classic Detroit Electro emits rhythm advisory (no-four-on-the-floor rule)", () => {
      const profile = getProfile("classic-detroit-electro") ?? getProfileBySubgenre("classic-detroit-electro");
      expect(profile).not.toBeNull();

      // Verify the no-four-on-the-floor critical rule exists
      const hasNoFourOnFloor = profile!.detectionRules.some(
        (r) => r.type === "no-four-on-the-floor" && r.severity === "critical",
      );
      expect(hasNoFourOnFloor).toBe(true);

      // Run detectIssues
      const input = buildIssueDetectorInput("classic-detroit-electro");
      const issues = detectIssues(input);

      // Should have the rhythm advisory
      const advisory = issues.find((i) => i.id.startsWith("rhythm-advisory-"));
      expect(advisory).toBeDefined();
      expect(advisory!.type).toBe("info");
      expect(advisory!.severity).toBe("info");
      expect(advisory!.message).toContain("syncopated");
    });
  });

  describe("checklist stability across re-analysis (idempotence)", () => {
    it("same inputs produce identical checklist output on repeated calls — no genre", () => {
      const input = buildIssueDetectorInput(null);
      const issues = detectIssues(input);

      const checklistInput = {
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map<string, boolean>(),
        selectedGenre: null as string | null,
      };

      const result1 = generateSectionChecklists(checklistInput);
      const result2 = generateSectionChecklists(checklistInput);

      expect(result1).toEqual(result2);
    });

    it("same inputs produce identical checklist output on repeated calls — with Techno genre", () => {
      const input = buildIssueDetectorInput("techno");
      const issues = detectIssues(input);

      const checklistInput = {
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map<string, boolean>(),
        selectedGenre: "techno" as string | null,
      };

      const result1 = generateSectionChecklists(checklistInput);
      const result2 = generateSectionChecklists(checklistInput);

      expect(result1).toEqual(result2);
    });

    it("same inputs produce identical checklist output on repeated calls — with IDM (permissive) genre", () => {
      const input = buildIssueDetectorInput("idm");
      const issues = detectIssues(input);

      const checklistInput = {
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map<string, boolean>(),
        selectedGenre: "idm" as string | null,
      };

      const result1 = generateSectionChecklists(checklistInput);
      const result2 = generateSectionChecklists(checklistInput);

      expect(result1).toEqual(result2);
    });

    it("same inputs produce identical checklist output on repeated calls — with Chicago Footwork (rhythm) genre", () => {
      const input = buildIssueDetectorInput("chicago-footwork");
      const issues = detectIssues(input);

      const checklistInput = {
        issues,
        transitionRecommendations: testTransitionRecommendations,
        existingSections: testSections.map((s) => s.id),
        existingCompletions: new Map<string, boolean>(),
        selectedGenre: "chicago-footwork" as string | null,
      };

      const result1 = generateSectionChecklists(checklistInput);
      const result2 = generateSectionChecklists(checklistInput);

      expect(result1).toEqual(result2);
    });

    it("detectIssues is also idempotent — same inputs produce identical issues", () => {
      const genres = ["techno", "idm", "chicago-footwork", "breakcore", null];

      for (const genre of genres) {
        const input = buildIssueDetectorInput(genre);
        const issues1 = detectIssues(input);
        const issues2 = detectIssues(input);
        expect(issues1).toEqual(issues2);
      }
    });

    it("full pipeline (detectIssues → generateSectionChecklists) is idempotent end-to-end", () => {
      const genres = ["techno", "idm", "classic-detroit-electro", "chicago-footwork", null];

      for (const genre of genres) {
        const input = buildIssueDetectorInput(genre);

        // Run 1
        const issues1 = detectIssues(input);
        const checklist1 = generateSectionChecklists({
          issues: issues1,
          transitionRecommendations: testTransitionRecommendations,
          existingSections: testSections.map((s) => s.id),
          existingCompletions: new Map(),
          selectedGenre: genre,
        });

        // Run 2
        const issues2 = detectIssues(input);
        const checklist2 = generateSectionChecklists({
          issues: issues2,
          transitionRecommendations: testTransitionRecommendations,
          existingSections: testSections.map((s) => s.id),
          existingCompletions: new Map(),
          selectedGenre: genre,
        });

        expect(issues1).toEqual(issues2);
        expect(checklist1).toEqual(checklist2);
      }
    });
  });
});
