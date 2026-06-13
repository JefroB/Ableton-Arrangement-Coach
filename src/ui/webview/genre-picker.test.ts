/**
 * Unit tests for Genre Picker rendering functions.
 */
import { describe, it, expect, vi } from "vitest";
import {
  escapeHtml,
  renderSearchInput,
  renderClearButton,
  renderFamilyItem,
  renderSubgenreItem,
  renderSearchResultItem,
  renderEmptyState,
  renderFamilyList,
  renderSearchResults,
  renderGenrePicker,
  debounce,
  SEARCH_DEBOUNCE_MS,
} from "./genre-picker.js";
import type { GenreFamilySummary, GenreSearchResult } from "../../core/genre-registry.js";

describe("Genre Picker", () => {
  describe("escapeHtml", () => {
    it("escapes special HTML characters", () => {
      expect(escapeHtml('<script>"alert"</script>')).toBe(
        "&lt;script&gt;&quot;alert&quot;&lt;/script&gt;"
      );
    });

    it("escapes ampersands and single quotes", () => {
      expect(escapeHtml("rock & roll's")).toBe("rock &amp; roll&#39;s");
    });

    it("returns empty string for empty input", () => {
      expect(escapeHtml("")).toBe("");
    });
  });

  describe("renderSearchInput", () => {
    it("renders an input element with the current query value", () => {
      const html = renderSearchInput("tech");
      expect(html).toContain('value="tech"');
      expect(html).toContain('aria-label="Search genres"');
      expect(html).toContain('placeholder="Search genres');
      expect(html).toContain("genre-picker-search-input");
    });

    it("renders empty value when query is empty", () => {
      const html = renderSearchInput("");
      expect(html).toContain('value=""');
    });

    it("escapes HTML in query value", () => {
      const html = renderSearchInput('<script>');
      expect(html).toContain('value="&lt;script&gt;"');
    });
  });

  describe("renderClearButton", () => {
    it("renders a clear button when a genre is selected", () => {
      const html = renderClearButton("techno");
      expect(html).toContain("genre-picker-clear-btn");
      expect(html).toContain("Clear selection");
      expect(html).toContain('aria-label="Clear genre selection"');
    });

    it("returns empty string when no genre is selected", () => {
      const html = renderClearButton(null);
      expect(html).toBe("");
    });
  });

  describe("renderFamilyItem", () => {
    const family: GenreFamilySummary = { id: "techno", name: "Techno", subgenreCount: 3 };

    it("renders a collapsed family with correct attributes", () => {
      const html = renderFamilyItem(family, false, false, false);
      expect(html).toContain('data-genre-id="techno"');
      expect(html).toContain('data-type="family"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain("▸"); // collapsed icon
      expect(html).toContain("Techno");
      expect(html).toContain("3 subgenres");
    });

    it("renders an expanded family with correct icon", () => {
      const html = renderFamilyItem(family, true, false, false);
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain("▾"); // expanded icon
    });

    it("renders selected state", () => {
      const html = renderFamilyItem(family, false, true, false);
      expect(html).toContain("genre-picker-item--selected");
      expect(html).toContain('aria-selected="true"');
    });

    it("renders focused state with tabindex 0", () => {
      const html = renderFamilyItem(family, false, false, true);
      expect(html).toContain("genre-picker-item--focused");
      expect(html).toContain('tabindex="0"');
    });

    it("uses singular for 1 subgenre", () => {
      const singleSub: GenreFamilySummary = { id: "x", name: "X", subgenreCount: 1 };
      const html = renderFamilyItem(singleSub, false, false, false);
      expect(html).toContain("1 subgenre");
      expect(html).not.toContain("1 subgenres");
    });
  });

  describe("renderSubgenreItem", () => {
    it("renders a subgenre item with correct attributes", () => {
      const html = renderSubgenreItem("peak-time-techno", "Peak Time Techno", "techno", false, false);
      expect(html).toContain('data-genre-id="peak-time-techno"');
      expect(html).toContain('data-family-id="techno"');
      expect(html).toContain('data-type="subgenre"');
      expect(html).toContain("Peak Time Techno");
      expect(html).toContain("genre-picker-subgenre");
    });

    it("renders selected state", () => {
      const html = renderSubgenreItem("x", "X", "y", true, false);
      expect(html).toContain("genre-picker-item--selected");
    });

    it("renders focused state", () => {
      const html = renderSubgenreItem("x", "X", "y", false, true);
      expect(html).toContain("genre-picker-item--focused");
      expect(html).toContain('tabindex="0"');
    });
  });

  describe("renderSearchResultItem", () => {
    it("renders a family search result", () => {
      const result: GenreSearchResult = { id: "techno", name: "Techno", type: "family", familyId: "techno" };
      const html = renderSearchResultItem(result, false, false);
      expect(html).toContain('data-genre-id="techno"');
      expect(html).toContain('data-type="family"');
      expect(html).toContain("Techno");
      expect(html).toContain('role="option"');
    });

    it("renders a subgenre search result with family label", () => {
      const result: GenreSearchResult = { id: "peak-time-techno", name: "Peak Time Techno", type: "subgenre", familyId: "techno" };
      const html = renderSearchResultItem(result, false, false);
      expect(html).toContain("Peak Time Techno");
      expect(html).toContain("genre-picker-result-type");
      expect(html).toContain("techno");
    });
  });

  describe("renderEmptyState", () => {
    it("renders empty state with the search query", () => {
      const html = renderEmptyState("gabber");
      expect(html).toContain("genre-picker-empty");
      expect(html).toContain('No genres matching "gabber"');
      expect(html).toContain('role="status"');
    });

    it("escapes HTML in query", () => {
      const html = renderEmptyState("<b>test</b>");
      expect(html).toContain("&lt;b&gt;test&lt;/b&gt;");
    });
  });

  describe("renderFamilyList", () => {
    const families: GenreFamilySummary[] = [
      { id: "techno", name: "Techno", subgenreCount: 2 },
      { id: "house", name: "House", subgenreCount: 3 },
    ];

    it("renders all families in a tree list", () => {
      const html = renderFamilyList({
        families,
        expandedFamilyIds: new Set(),
        selectedGenreId: null,
        focusedIndex: -1,
        expandedSubgenres: new Map(),
      });
      expect(html).toContain('role="tree"');
      expect(html).toContain("Techno");
      expect(html).toContain("House");
    });

    it("shows subgenres when a family is expanded", () => {
      const subgenres = new Map([
        ["techno", [{ id: "peak-time-techno", name: "Peak Time Techno" }, { id: "minimal-techno", name: "Minimal Techno" }]],
      ]);
      const html = renderFamilyList({
        families,
        expandedFamilyIds: new Set(["techno"]),
        selectedGenreId: null,
        focusedIndex: -1,
        expandedSubgenres: subgenres,
      });
      expect(html).toContain("Peak Time Techno");
      expect(html).toContain("Minimal Techno");
    });

    it("highlights selected genre", () => {
      const html = renderFamilyList({
        families,
        expandedFamilyIds: new Set(),
        selectedGenreId: "techno",
        focusedIndex: -1,
        expandedSubgenres: new Map(),
      });
      expect(html).toContain("genre-picker-item--selected");
    });

    it("renders empty state when no families", () => {
      const html = renderFamilyList({
        families: [],
        expandedFamilyIds: new Set(),
        selectedGenreId: null,
        focusedIndex: -1,
        expandedSubgenres: new Map(),
      });
      expect(html).toContain("No genre families available");
    });
  });

  describe("renderSearchResults", () => {
    const results: GenreSearchResult[] = [
      { id: "techno", name: "Techno", type: "family", familyId: "techno" },
      { id: "peak-time-techno", name: "Peak Time Techno", type: "subgenre", familyId: "techno" },
    ];

    it("renders all search results in a listbox", () => {
      const html = renderSearchResults(results, null, -1, "tech");
      expect(html).toContain('role="listbox"');
      expect(html).toContain("Techno");
      expect(html).toContain("Peak Time Techno");
    });

    it("shows empty state when no results", () => {
      const html = renderSearchResults([], null, -1, "xyz");
      expect(html).toContain("genre-picker-empty");
      expect(html).toContain('No genres matching "xyz"');
    });

    it("highlights focused item", () => {
      const html = renderSearchResults(results, null, 1, "tech");
      // The second item (index 1) should be focused
      expect(html).toContain("genre-picker-item--focused");
    });

    it("highlights selected genre", () => {
      const html = renderSearchResults(results, "techno", -1, "tech");
      expect(html).toContain("genre-picker-item--selected");
    });
  });

  describe("renderGenrePicker", () => {
    it("renders the full picker with search and family list", () => {
      const html = renderGenrePicker({
        searchQuery: "",
        selectedGenreId: null,
        families: [{ id: "techno", name: "Techno", subgenreCount: 2 }],
        searchResults: [],
        expandedFamilyIds: new Set(),
        focusedIndex: -1,
        expandedSubgenres: new Map(),
        isSearchActive: false,
      });
      expect(html).toContain("genre-picker");
      expect(html).toContain('role="dialog"');
      expect(html).toContain("genre-picker-search-input");
      expect(html).toContain("Techno");
    });

    it("shows search results when search is active", () => {
      const html = renderGenrePicker({
        searchQuery: "tech",
        selectedGenreId: null,
        families: [],
        searchResults: [{ id: "techno", name: "Techno", type: "family", familyId: "techno" }],
        expandedFamilyIds: new Set(),
        focusedIndex: -1,
        expandedSubgenres: new Map(),
        isSearchActive: true,
      });
      expect(html).toContain("genre-picker-results");
      expect(html).toContain("Techno");
    });

    it("shows clear button when genre is selected", () => {
      const html = renderGenrePicker({
        searchQuery: "",
        selectedGenreId: "techno",
        families: [{ id: "techno", name: "Techno", subgenreCount: 2 }],
        searchResults: [],
        expandedFamilyIds: new Set(),
        focusedIndex: -1,
        expandedSubgenres: new Map(),
        isSearchActive: false,
      });
      expect(html).toContain("genre-picker-clear-btn");
      expect(html).toContain("Clear selection");
    });

    it("does not show clear button when no genre selected", () => {
      const html = renderGenrePicker({
        searchQuery: "",
        selectedGenreId: null,
        families: [{ id: "techno", name: "Techno", subgenreCount: 2 }],
        searchResults: [],
        expandedFamilyIds: new Set(),
        focusedIndex: -1,
        expandedSubgenres: new Map(),
        isSearchActive: false,
      });
      expect(html).not.toContain("genre-picker-clear-btn");
    });
  });

  describe("debounce", () => {
    it("delays function execution", () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(99);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("resets the timer on subsequent calls", () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced(); // resets the timer
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("passes arguments to the debounced function", () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced("hello", "world");
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith("hello", "world");

      vi.useRealTimers();
    });
  });

  describe("SEARCH_DEBOUNCE_MS", () => {
    it("is set to 100ms", () => {
      expect(SEARCH_DEBOUNCE_MS).toBe(100);
    });
  });
});
