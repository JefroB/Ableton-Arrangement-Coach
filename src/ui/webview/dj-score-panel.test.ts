import { describe, it, expect } from "vitest";
import { renderDjScorePanel } from "./dj-score-panel.js";
import type { DjScoreResult } from "../../core/dj-scorer.js";

describe("renderDjScorePanel", () => {
  // ─── Full score display ───────────────────────────────────────────

  describe("renders all component names", () => {
    const result: DjScoreResult = {
      totalScore: 72,
      applicable: true,
      components: [
        { name: "intro", score: 100, weight: 0.20, weighted: 20 },
        { name: "outro", score: 50, weight: 0.20, weighted: 10 },
        { name: "phrase alignment", score: 75, weight: 0.20, weighted: 15 },
        { name: "mix zone", score: 60, weight: 0.15, weighted: 9 },
        { name: "tempo", score: 100, weight: 0.15, weighted: 15 },
        { name: "energy positioning", score: 30, weight: 0.10, weighted: 3 },
      ],
      phraseIssues: [],
    };

    it("renders all six component names in the breakdown table", () => {
      const html = renderDjScorePanel(result);

      expect(html).toContain("intro");
      expect(html).toContain("outro");
      expect(html).toContain("phrase alignment");
      expect(html).toContain("mix zone");
      expect(html).toContain("tempo");
      expect(html).toContain("energy positioning");
    });

    it("renders the total score", () => {
      const html = renderDjScorePanel(result);

      expect(html).toContain("72");
      expect(html).toContain("dj-score-total");
    });

    it("renders the component breakdown table", () => {
      const html = renderDjScorePanel(result);

      expect(html).toContain("dj-score-table");
      expect(html).toContain("Component");
      expect(html).toContain("Score");
      expect(html).toContain("Weight");
      expect(html).toContain("Contribution");
    });
  });

  // ─── Inapplicable genre ───────────────────────────────────────────

  describe("inapplicable genre", () => {
    it("renders inapplicable message when applicable is false", () => {
      const result: DjScoreResult = {
        totalScore: 0,
        applicable: false,
        inapplicableReason: "DJ compatibility scoring is not applicable for ambient genres.",
        components: [],
        phraseIssues: [],
      };

      const html = renderDjScorePanel(result);

      expect(html).toContain("dj-score-inapplicable");
      expect(html).toContain("DJ compatibility scoring is not applicable for ambient genres.");
      expect(html).not.toContain("dj-score-table");
      expect(html).not.toContain("dj-score-total");
    });

    it("renders default inapplicable message when reason is not provided", () => {
      const result: DjScoreResult = {
        totalScore: 0,
        applicable: false,
        components: [],
        phraseIssues: [],
      };

      const html = renderDjScorePanel(result);

      expect(html).toContain("dj-score-inapplicable");
      expect(html).toContain("DJ compatibility scoring is not applicable for this genre.");
    });
  });

  // ─── Null state ───────────────────────────────────────────────────

  describe("null state", () => {
    it("renders empty state when result is null", () => {
      const html = renderDjScorePanel(null);

      expect(html).toContain("dj-score-panel");
      expect(html).toContain("dj-score-empty");
      expect(html).toContain("No DJ score available");
      expect(html).not.toContain("dj-score-table");
      expect(html).not.toContain("dj-score-inapplicable");
    });
  });
});
