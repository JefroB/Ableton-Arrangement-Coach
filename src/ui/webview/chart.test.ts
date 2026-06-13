import { describe, it, expect } from "vitest";
import { truncateLabel, renderEnergyChart, renderGenreDropdown } from "./chart.js";

describe("Energy Curve Chart — Unit Tests", () => {
  // ─── truncateLabel ──────────────────────────────────────────────────

  describe("truncateLabel", () => {
    it("returns short labels unchanged", () => {
      expect(truncateLabel("Short")).toBe("Short");
    });

    it("returns single character unchanged", () => {
      expect(truncateLabel("A")).toBe("A");
    });

    it("returns empty string unchanged", () => {
      expect(truncateLabel("")).toBe("");
    });

    it("truncates names longer than 12 characters with ellipsis", () => {
      expect(truncateLabel("VeryLongSectionNameHere")).toBe("VeryLongSect\u2026");
    });

    it("truncates a 13-character string to 12 + ellipsis", () => {
      // "Exactly12Char" is 13 chars → first 12 + "…"
      expect(truncateLabel("Exactly12Char")).toBe("Exactly12Cha\u2026");
    });

    it("does not truncate a string of exactly 12 characters", () => {
      const twelveChars = "TwelveChars!"; // exactly 12
      expect(twelveChars).toHaveLength(12);
      expect(truncateLabel(twelveChars)).toBe(twelveChars);
    });
  });

  // ─── renderEnergyChart ──────────────────────────────────────────────

  describe("renderEnergyChart", () => {
    it("renders correct number of bar containers matching sections count", () => {
      const html = renderEnergyChart([5, 8, 3], ["Intro", "Drop", "Outro"]);
      const barCount = (html.match(/class="energy-bar-container"/g) || []).length;
      expect(barCount).toBe(3);
    });

    it("shows placeholder message when energy curve is empty", () => {
      const html = renderEnergyChart([], []);
      expect(html).toContain("Run analysis to see energy curve");
      expect(html).toContain("energy-empty-state");
    });

    it("shows placeholder message when fewer than 2 sections exist", () => {
      const html = renderEnergyChart([7], ["Intro"]);
      expect(html).toContain("Run analysis to see energy curve");
      expect(html).toContain("energy-empty-state");
    });

    it("contains score values in the rendered output", () => {
      const html = renderEnergyChart([5, 8, 3], ["Intro", "Drop", "Outro"]);
      expect(html).toContain(">5</span>");
      expect(html).toContain(">8</span>");
      expect(html).toContain(">3</span>");
    });

    it("truncates long section labels in bar chart", () => {
      const html = renderEnergyChart([7, 4], ["VeryLongSectionNameHere", "Short"]);
      expect(html).toContain("VeryLongSect\u2026");
      expect(html).not.toContain("VeryLongSectionNameHere</span>");
    });

    it("renders correct colors based on score intensity", () => {
      const html = renderEnergyChart([2, 5, 9], ["Low", "Med", "High"]);
      // Low (2) → green
      expect(html).toContain("#4caf50");
      // Medium (5) → yellow
      expect(html).toContain("#ffca28");
      // Very high (9) → red
      expect(html).toContain("#f44336");
    });

    it("includes section name and score in tooltip title attributes", () => {
      const html = renderEnergyChart([5, 8], ["Intro", "Drop"]);
      expect(html).toContain('title="Intro: 5"');
      expect(html).toContain('title="Drop: 8"');
    });
  });

  // ─── renderGenreDropdown ────────────────────────────────────────────

  describe("renderGenreDropdown", () => {
    it("renders Default as selected when selectedGenre is null", () => {
      const html = renderGenreDropdown(["Techno", "House"], null);
      expect(html).toContain('<option value="" selected>Default</option>');
      // Genre options should NOT have selected attribute
      expect(html).toContain('<option value="Techno">Techno</option>');
      expect(html).toContain('<option value="House">House</option>');
    });

    it("renders the correct genre as selected", () => {
      const html = renderGenreDropdown(["Techno", "House"], "Techno");
      expect(html).toContain('<option value="Techno" selected>Techno</option>');
      // Default should NOT be selected
      expect(html).toContain('<option value="">Default</option>');
      expect(html).not.toContain('<option value="" selected>');
    });

    it("renders all genre options in the dropdown", () => {
      const html = renderGenreDropdown(["Techno", "House", "Trance"], null);
      expect(html).toContain("Techno");
      expect(html).toContain("House");
      expect(html).toContain("Trance");
    });

    it("renders as a select element with proper attributes", () => {
      const html = renderGenreDropdown(["Techno"], null);
      expect(html).toContain('id="genre-select"');
      expect(html).toContain('class="genre-dropdown"');
      expect(html).toContain('aria-label="Genre selection"');
    });
  });
});


// ─── Property-Based Tests ──────────────────────────────────────────────

import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";

// Feature: m2-section-analysis, Property 13: Section name truncation

/**
 * **Validates: Requirements 14.2**
 *
 * Property 13: Section name truncation
 * For any string, the label formatting function SHALL return the original
 * string if its length is ≤ 12 characters, or the first 12 characters
 * followed by "…" if the string is longer than 12 characters.
 */
describe("Chart — Property 13: Section name truncation", () => {
  fcTest.prop(
    [fc.string({ minLength: 0, maxLength: 12 })],
    { numRuns: 100 },
  )(
    "returns the original string when length ≤ 12",
    (s) => {
      expect(truncateLabel(s)).toBe(s);
    },
  );

  fcTest.prop(
    [fc.string({ minLength: 13, maxLength: 100 })],
    { numRuns: 100 },
  )(
    "returns first 12 chars + '…' when length > 12",
    (s) => {
      const result = truncateLabel(s);
      expect(result).toBe(s.slice(0, 12) + "\u2026");
    },
  );
});
