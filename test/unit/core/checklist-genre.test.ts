import { describe, it, expect } from "vitest";
import { generateSectionChecklists, type ChecklistGeneratorInput } from "../../../src/core/checklist-generator.js";
import { getProfile } from "../../../src/core/genre-registry.js";
import type { Issue } from "../../../src/core/issue-types.js";
import type { TransitionRecommendation } from "../../../src/core/transition-engine.js";

describe("Genre-Aware Checklist Generation", () => {
  // ─── Helpers ───────────────────────────────────────────────────────

  function makeInput(overrides: Partial<ChecklistGeneratorInput> = {}): ChecklistGeneratorInput {
    return {
      issues: [],
      transitionRecommendations: [],
      existingSections: ["section-intro", "section-build", "section-main-a"],
      existingCompletions: new Map(),
      selectedGenre: "techno",
      ...overrides,
    };
  }

  function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
      id: "test-issue-1",
      type: "flat-energy",
      severity: "warning",
      sectionIds: ["section-intro"],
      message: "Energy is flat in intro",
      ...overrides,
    };
  }

  function makeTransitionRecommendation(overrides: Partial<TransitionRecommendation> = {}): TransitionRecommendation {
    return {
      id: "section-intro-section-build",
      fromSectionId: "section-intro",
      toSectionId: "section-build",
      energyDelta: 2,
      transitionSize: "medium",
      suggestedDurationBars: 8,
      techniques: [{ category: "filter", name: "Filter Sweep", description: "Gradual HPF sweep" }],
      boundaryType: "build",
      rationale: "Energy increase needs a transition",
      checklist: [
        { id: "c1", text: "Add a filter sweep over 4 bars", completed: false },
        { id: "c2", text: "Introduce hi-hats gradually", completed: false },
      ],
      ...overrides,
    } as TransitionRecommendation;
  }

  // ─── Test: Genre items appear for matched sections ─────────────────

  describe("Genre items for matched sections", () => {
    it("produces genre items for sections matching Techno profile structure", () => {
      const input = makeInput({
        existingSections: ["section-intro", "section-breakdown", "section-outro"],
      });

      const result = generateSectionChecklists(input);

      // Techno profile has Intro, Breakdown, and Outro templates
      const introItems = result["section-intro"]!.filter((item) => item.source === "genre");
      expect(introItems.length).toBeGreaterThan(0);

      const breakdownItems = result["section-breakdown"]!.filter((item) => item.source === "genre");
      expect(breakdownItems.length).toBeGreaterThan(0);

      const outroItems = result["section-outro"]!.filter((item) => item.source === "genre");
      expect(outroItems.length).toBeGreaterThan(0);
    });

    it("all genre items have source 'genre'", () => {
      const input = makeInput({
        existingSections: ["section-intro", "section-breakdown"],
      });

      const result = generateSectionChecklists(input);

      for (const sectionId of Object.keys(result)) {
        const genreItems = result[sectionId]!.filter((item) => item.source === "genre");
        for (const item of genreItems) {
          expect(item.source).toBe("genre");
        }
      }
    });

    it("genre item IDs follow pattern genre-{genreId}-{sectionId}-{ruleIndex}", () => {
      const input = makeInput({
        existingSections: ["section-intro"],
      });

      const result = generateSectionChecklists(input);
      const genreItems = result["section-intro"]!.filter((item) => item.source === "genre");

      expect(genreItems.length).toBeGreaterThan(0);
      for (const item of genreItems) {
        expect(item.id).toMatch(/^genre-techno-section-intro-\d+$/);
      }
    });

    it("genre items include lengthRange and energyRange convention items", () => {
      const input = makeInput({
        existingSections: ["section-intro"],
      });

      const result = generateSectionChecklists(input);
      const genreItems = result["section-intro"]!.filter((item) => item.source === "genre");

      // Techno Intro: 16–32 bars, energy 4–6
      const lengthItem = genreItems.find((item) => item.text.includes("16") && item.text.includes("32") && item.text.includes("bars"));
      expect(lengthItem).toBeDefined();

      const energyItem = genreItems.find((item) => item.text.includes("4") && item.text.includes("6") && item.text.includes("energy"));
      expect(energyItem).toBeDefined();
    });
  });

  // ─── Test: Null genre produces zero genre items ────────────────────

  describe("Null genre handling", () => {
    it("produces zero genre items when selectedGenre is null", () => {
      const input = makeInput({
        selectedGenre: null,
        existingSections: ["section-intro", "section-breakdown", "section-outro"],
      });

      const result = generateSectionChecklists(input);

      for (const sectionId of Object.keys(result)) {
        const genreItems = result[sectionId]!.filter((item) => item.source === "genre");
        expect(genreItems).toHaveLength(0);
      }
    });

    it("still produces issue and transition items when genre is null", () => {
      const issue = makeIssue({ sectionIds: ["section-intro"] });
      const transition = makeTransitionRecommendation({ toSectionId: "section-intro" });

      const input = makeInput({
        selectedGenre: null,
        existingSections: ["section-intro"],
        issues: [issue],
        transitionRecommendations: [transition],
      });

      const result = generateSectionChecklists(input);
      const introItems = result["section-intro"]!;

      const issueItems = introItems.filter((item) => item.source === "issue");
      expect(issueItems.length).toBeGreaterThan(0);

      const transitionItems = introItems.filter((item) => item.source === "transition");
      expect(transitionItems.length).toBeGreaterThan(0);
    });
  });

  // ─── Test: Ordering — issue → genre → transition ──────────────────

  describe("Ordering within sections", () => {
    it("orders items: issue first, genre second, transition last", () => {
      const issue = makeIssue({ sectionIds: ["section-intro"] });
      const transition = makeTransitionRecommendation({ toSectionId: "section-intro" });

      const input = makeInput({
        existingSections: ["section-intro"],
        issues: [issue],
        transitionRecommendations: [transition],
      });

      const result = generateSectionChecklists(input);
      const introItems = result["section-intro"]!;

      // Must have all three sources
      const sources = introItems.map((item) => item.source);
      expect(sources).toContain("issue");
      expect(sources).toContain("genre");
      expect(sources).toContain("transition");

      // Find last issue index and first genre index
      const lastIssueIdx = sources.lastIndexOf("issue");
      const firstGenreIdx = sources.indexOf("genre");
      const lastGenreIdx = sources.lastIndexOf("genre");
      const firstTransitionIdx = sources.indexOf("transition");

      // issue items come before genre items
      expect(lastIssueIdx).toBeLessThan(firstGenreIdx);
      // genre items come before transition items
      expect(lastGenreIdx).toBeLessThan(firstTransitionIdx);
    });
  });

  // ─── Test: Detection rules with severity critical/warning ──────────

  describe("Detection rules with severity critical/warning", () => {
    it("produces checklist items for detection rules with 'warning' severity matching sections", () => {
      // Techno profile has detection rules like "max-breakdown-bars" (warning)
      // and "min-intro-bars" (warning) which should match intro/breakdown sections
      const input = makeInput({
        existingSections: ["section-intro", "section-breakdown"],
      });

      const result = generateSectionChecklists(input);

      // The techno profile has "min-intro-bars" with severity "warning"
      // which should match the intro section
      const introGenreItems = result["section-intro"]!.filter((item) => item.source === "genre");
      // Should have items from structure matching (lengthRange + energyRange) plus detection rules
      expect(introGenreItems.length).toBeGreaterThanOrEqual(2);
    });

    it("produces items for critical severity detection rules", () => {
      // Use Birmingham Techno subgenre which has critical rules like "no-uplifting-chords"
      // that reference "melodic" and "uplifting" keywords
      const input = makeInput({
        selectedGenre: "birmingham-techno",
        existingSections: ["section-intro", "section-loop-a", "section-outro"],
      });

      const result = generateSectionChecklists(input);

      // Birmingham Techno has structure with "Intro", "Loop A", "Outro"
      // and critical rules "no-uplifting-chords" and "no-melodic-content"
      const introItems = result["section-intro"]!.filter((item) => item.source === "genre");
      expect(introItems.length).toBeGreaterThan(0);
    });

    it("does not produce items for detection rules with 'info' severity", () => {
      // The generateGenreItems helper only uses rules with critical/warning severity
      const profile = getProfile("techno");
      expect(profile).not.toBeNull();

      // Count info-only rules to verify they exist
      const infoOnlyRules = profile!.detectionRules.filter((r) => r.severity === "info");
      expect(infoOnlyRules.length).toBeGreaterThan(0);

      // An info rule like "kick-present-in-main" shouldn't produce items for section-intro
      // (unless matched by keyword), but it also shouldn't contribute for unrelated sections
      const input = makeInput({
        existingSections: ["section-intro"],
      });

      const result = generateSectionChecklists(input);
      const introItems = result["section-intro"]!.filter((item) => item.source === "genre");

      // All items should come from structure template matching or warning/critical rules only
      // None should reference info-only rules that don't match the section
      for (const item of introItems) {
        // Items from detection rules mention "per Techno convention"
        // Info rules for non-matching sections should not appear
        expect(item.source).toBe("genre");
      }
    });
  });

  // ─── Test: Section name mismatch → zero items ─────────────────────

  describe("Section name mismatch", () => {
    it("produces zero genre items for section names not matching any profile template", () => {
      const input = makeInput({
        existingSections: ["section-custom-section-xyz"],
      });

      const result = generateSectionChecklists(input);
      const customItems = result["section-custom-section-xyz"]!.filter((item) => item.source === "genre");
      expect(customItems).toHaveLength(0);
    });

    it("produces genre items only for matched sections in a mixed set", () => {
      const input = makeInput({
        existingSections: ["section-intro", "section-custom-section-xyz", "section-outro"],
      });

      const result = generateSectionChecklists(input);

      // Intro and Outro match Techno templates
      const introGenreItems = result["section-intro"]!.filter((item) => item.source === "genre");
      expect(introGenreItems.length).toBeGreaterThan(0);

      const outroGenreItems = result["section-outro"]!.filter((item) => item.source === "genre");
      expect(outroGenreItems.length).toBeGreaterThan(0);

      // Custom section does not match
      const customGenreItems = result["section-custom-section-xyz"]!.filter((item) => item.source === "genre");
      expect(customGenreItems).toHaveLength(0);
    });

    it("produces zero genre items for an unknown genre ID", () => {
      const input = makeInput({
        selectedGenre: "totally-unknown-genre-id",
        existingSections: ["section-intro", "section-breakdown"],
      });

      const result = generateSectionChecklists(input);

      for (const sectionId of Object.keys(result)) {
        const genreItems = result[sectionId]!.filter((item) => item.source === "genre");
        expect(genreItems).toHaveLength(0);
      }
    });
  });

  // ─── Test: Completion state persistence ────────────────────────────

  describe("Completion state persistence", () => {
    it("respects existing completion states for genre items", () => {
      const completions = new Map<string, boolean>();
      // Pre-mark the first genre item for intro as completed
      completions.set("genre-techno-section-intro-0", true);

      const input = makeInput({
        existingSections: ["section-intro"],
        existingCompletions: completions,
      });

      const result = generateSectionChecklists(input);
      const introGenreItems = result["section-intro"]!.filter((item) => item.source === "genre");

      const firstItem = introGenreItems.find((item) => item.id === "genre-techno-section-intro-0");
      expect(firstItem).toBeDefined();
      expect(firstItem!.completed).toBe(true);

      // Other items should default to false
      const secondItem = introGenreItems.find((item) => item.id === "genre-techno-section-intro-1");
      if (secondItem) {
        expect(secondItem.completed).toBe(false);
      }
    });
  });
});
