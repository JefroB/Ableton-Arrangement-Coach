import { describe, it, expect } from "vitest";
import {
  getGenerateButtonState,
  getGenerateTooltip,
  type ButtonStateInput,
} from "./generate-button-state.js";

describe("getGenerateButtonState", () => {
  describe("disabled when no genre selected", () => {
    it("returns disabled-no-genre when selectedGenre is null and not generating", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: null, sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("disabled-no-genre");
    });

    it("returns disabled-no-genre when selectedGenre is empty string and not generating", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: "", sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("disabled-no-genre");
    });

    it("returns disabled-no-genre even when sections exist (genre check has higher priority)", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: null, sectionsCount: 5 };
      expect(getGenerateButtonState(input)).toBe("disabled-no-genre");
    });
  });

  describe("disabled when markers exist", () => {
    it("returns disabled-sections-exist when genre is set and sections count > 0", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: "techno", sectionsCount: 1 };
      expect(getGenerateButtonState(input)).toBe("disabled-sections-exist");
    });

    it("returns disabled-sections-exist with multiple sections", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: "house", sectionsCount: 7 };
      expect(getGenerateButtonState(input)).toBe("disabled-sections-exist");
    });
  });

  describe("enabled when genre selected AND no markers exist", () => {
    it("returns enabled when genre is set and sections count is 0", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: "techno", sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("enabled");
    });

    it("returns enabled with any non-empty genre string", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: "peak-time-techno", sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("enabled");
    });
  });

  describe("loading state during generation", () => {
    it("returns loading when isGenerating is true regardless of genre", () => {
      const input: ButtonStateInput = { isGenerating: true, selectedGenre: null, sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("loading");
    });

    it("returns loading when isGenerating is true even with genre and sections", () => {
      const input: ButtonStateInput = { isGenerating: true, selectedGenre: "techno", sectionsCount: 3 };
      expect(getGenerateButtonState(input)).toBe("loading");
    });

    it("returns loading when isGenerating is true with genre set and no sections", () => {
      const input: ButtonStateInput = { isGenerating: true, selectedGenre: "house", sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("loading");
    });
  });

  describe("state priority order", () => {
    it("loading takes priority over disabled-no-genre", () => {
      const input: ButtonStateInput = { isGenerating: true, selectedGenre: null, sectionsCount: 0 };
      expect(getGenerateButtonState(input)).toBe("loading");
    });

    it("loading takes priority over disabled-sections-exist", () => {
      const input: ButtonStateInput = { isGenerating: true, selectedGenre: "techno", sectionsCount: 5 };
      expect(getGenerateButtonState(input)).toBe("loading");
    });

    it("disabled-no-genre takes priority over disabled-sections-exist", () => {
      const input: ButtonStateInput = { isGenerating: false, selectedGenre: null, sectionsCount: 5 };
      expect(getGenerateButtonState(input)).toBe("disabled-no-genre");
    });
  });
});

describe("getGenerateTooltip", () => {
  it("returns genre selection hint for disabled-no-genre state", () => {
    expect(getGenerateTooltip("disabled-no-genre")).toBe(
      "Select a genre to enable section generation"
    );
  });

  it("returns sections exist hint for disabled-sections-exist state", () => {
    expect(getGenerateTooltip("disabled-sections-exist")).toBe(
      "Remove existing sections to generate new ones"
    );
  });

  it("returns generating message for loading state", () => {
    expect(getGenerateTooltip("loading")).toBe("Generating sections…");
  });

  it("returns empty string for enabled state", () => {
    expect(getGenerateTooltip("enabled")).toBe("");
  });
});

describe("error display on failure", () => {
  it("button returns to enabled state after generation failure (not loading, genre set, no sections)", () => {
    // After a failure, isGenerating should be false, and if no sections were created,
    // the button should be enabled so the user can retry
    const input: ButtonStateInput = { isGenerating: false, selectedGenre: "techno", sectionsCount: 0 };
    expect(getGenerateButtonState(input)).toBe("enabled");
  });

  it("button stays disabled if partial markers were created before failure", () => {
    // If some markers were created before the error, sections exist
    const input: ButtonStateInput = { isGenerating: false, selectedGenre: "techno", sectionsCount: 3 };
    expect(getGenerateButtonState(input)).toBe("disabled-sections-exist");
  });
});
