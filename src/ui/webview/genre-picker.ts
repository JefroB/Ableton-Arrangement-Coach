/**
 * Genre Picker — rendering functions and interaction logic for the
 * genre selection webview component.
 *
 * Exports pure functions that produce HTML strings for the Genre Picker UI,
 * plus helper utilities for debounced search and keyboard navigation.
 *
 * The picker displays:
 * - Text search input with debounced case-insensitive filtering
 * - Grouped list of genre families with expand/collapse
 * - Subgenres within each family shown on expand
 * - Currently selected genre highlighted
 * - Clear action to deselect genre
 * - Empty state when no results match
 * - Keyboard navigation (arrows, Enter, Escape)
 *
 * Messages sent to backend:
 * - `select_genre` (genreId: string | null) — genre selected or cleared
 * - `search_genres` (query: string) — search query changed
 * - `request_genre_families` — request full family list on mount
 */

import type { GenreFamilySummary, GenreSearchResult } from "../../core/genre-registry.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** Debounce delay in milliseconds for search input. */
export const SEARCH_DEBOUNCE_MS = 100;

// ─── HTML Escaping ─────────────────────────────────────────────────────

/**
 * Escape special HTML characters to prevent XSS in rendered content.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Search Input ──────────────────────────────────────────────────────

/**
 * Render the search input for filtering genres.
 *
 * @param currentQuery - The current search text.
 * @returns HTML string for the search input.
 */
export function renderSearchInput(currentQuery: string): string {
  return `<div class="genre-picker-search">` +
    `<input type="text" ` +
    `class="genre-picker-search-input" ` +
    `id="genre-picker-search" ` +
    `placeholder="Search genres\u2026" ` +
    `value="${escapeHtml(currentQuery)}" ` +
    `aria-label="Search genres" ` +
    `autocomplete="off" />` +
    `</div>`;
}

// ─── Clear Button ──────────────────────────────────────────────────────

/**
 * Render the clear selection button. Only shown when a genre is selected.
 *
 * @param selectedGenreId - Currently selected genre ID, or null.
 * @returns HTML string for the clear button (empty if nothing selected).
 */
export function renderClearButton(selectedGenreId: string | null): string {
  if (selectedGenreId === null) {
    return "";
  }
  return `<button class="genre-picker-clear-btn" type="button" ` +
    `aria-label="Clear genre selection">Clear selection</button>`;
}

// ─── Family Item ───────────────────────────────────────────────────────

/**
 * Render a single genre family header row.
 *
 * @param family - The genre family summary.
 * @param isExpanded - Whether this family is currently expanded.
 * @param isSelected - Whether the base family genre is the currently selected genre.
 * @param isFocused - Whether this item currently has keyboard focus.
 * @returns HTML string for the family row.
 */
export function renderFamilyItem(
  family: GenreFamilySummary,
  isExpanded: boolean,
  isSelected: boolean,
  isFocused: boolean
): string {
  const expandIcon = isExpanded ? "▾" : "▸";
  const selectedClass = isSelected ? " genre-picker-item--selected" : "";
  const focusedClass = isFocused ? " genre-picker-item--focused" : "";
  const subgenreLabel = family.subgenreCount === 1
    ? "1 subgenre"
    : `${family.subgenreCount} subgenres`;

  return `<li class="genre-picker-item genre-picker-family${selectedClass}${focusedClass}" ` +
    `data-genre-id="${escapeHtml(family.id)}" ` +
    `data-family-id="${escapeHtml(family.id)}" ` +
    `data-type="family" ` +
    `role="treeitem" ` +
    `aria-expanded="${isExpanded}" ` +
    `aria-selected="${isSelected}" ` +
    `tabindex="${isFocused ? "0" : "-1"}">` +
    `<span class="genre-picker-expand-icon" aria-hidden="true">${expandIcon}</span>` +
    `<span class="genre-picker-family-name">${escapeHtml(family.name)}</span>` +
    `<span class="genre-picker-subgenre-count">${subgenreLabel}</span>` +
    `</li>`;
}

// ─── Subgenre Item ─────────────────────────────────────────────────────

/**
 * Render a single subgenre item within an expanded family.
 *
 * @param id - The subgenre ID.
 * @param name - The subgenre display name.
 * @param familyId - The parent family ID.
 * @param isSelected - Whether this subgenre is the currently selected genre.
 * @param isFocused - Whether this item currently has keyboard focus.
 * @returns HTML string for the subgenre row.
 */
export function renderSubgenreItem(
  id: string,
  name: string,
  familyId: string,
  isSelected: boolean,
  isFocused: boolean
): string {
  const selectedClass = isSelected ? " genre-picker-item--selected" : "";
  const focusedClass = isFocused ? " genre-picker-item--focused" : "";

  return `<li class="genre-picker-item genre-picker-subgenre${selectedClass}${focusedClass}" ` +
    `data-genre-id="${escapeHtml(id)}" ` +
    `data-family-id="${escapeHtml(familyId)}" ` +
    `data-type="subgenre" ` +
    `role="treeitem" ` +
    `aria-selected="${isSelected}" ` +
    `tabindex="${isFocused ? "0" : "-1"}">` +
    `<span class="genre-picker-subgenre-name">${escapeHtml(name)}</span>` +
    `</li>`;
}

// ─── Search Result Item ────────────────────────────────────────────────

/**
 * Render a single search result item (flat list, not grouped).
 *
 * @param result - The search result.
 * @param isSelected - Whether this item is the currently selected genre.
 * @param isFocused - Whether this item currently has keyboard focus.
 * @returns HTML string for the search result row.
 */
export function renderSearchResultItem(
  result: GenreSearchResult,
  isSelected: boolean,
  isFocused: boolean
): string {
  const selectedClass = isSelected ? " genre-picker-item--selected" : "";
  const focusedClass = isFocused ? " genre-picker-item--focused" : "";
  const typeLabel = result.type === "family" ? "" : ` <span class="genre-picker-result-type">${escapeHtml(result.familyId)}</span>`;

  return `<li class="genre-picker-item genre-picker-result${selectedClass}${focusedClass}" ` +
    `data-genre-id="${escapeHtml(result.id)}" ` +
    `data-family-id="${escapeHtml(result.familyId)}" ` +
    `data-type="${escapeHtml(result.type)}" ` +
    `role="option" ` +
    `aria-selected="${isSelected}" ` +
    `tabindex="${isFocused ? "0" : "-1"}">` +
    `<span class="genre-picker-result-name">${escapeHtml(result.name)}</span>` +
    typeLabel +
    `</li>`;
}

// ─── Empty State ───────────────────────────────────────────────────────

/**
 * Render the empty state when no genres match the search query.
 *
 * @param query - The search query that produced no results.
 * @returns HTML string for the empty state message.
 */
export function renderEmptyState(query: string): string {
  return `<div class="genre-picker-empty" role="status" aria-live="polite">` +
    `<p class="genre-picker-empty-text">No genres matching "${escapeHtml(query)}"</p>` +
    `</div>`;
}

// ─── Family List (Browse Mode) ─────────────────────────────────────────

/**
 * Input data for rendering the genre family list.
 */
export interface GenrePickerFamilyListData {
  readonly families: readonly GenreFamilySummary[];
  readonly expandedFamilyIds: ReadonlySet<string>;
  readonly selectedGenreId: string | null;
  readonly focusedIndex: number;
  /** Subgenres for expanded families: familyId → subgenre array */
  readonly expandedSubgenres: ReadonlyMap<string, readonly { id: string; name: string }[]>;
}

/**
 * Render the family list view (browse mode, no active search).
 *
 * @param data - All data needed to render the family list.
 * @returns HTML string for the list.
 */
export function renderFamilyList(data: GenrePickerFamilyListData): string {
  const { families, expandedFamilyIds, selectedGenreId, focusedIndex, expandedSubgenres } = data;

  if (families.length === 0) {
    return `<div class="genre-picker-empty" role="status"><p class="genre-picker-empty-text">No genre families available</p></div>`;
  }

  let html = "";
  let currentIndex = 0;

  for (const family of families) {
    const isExpanded = expandedFamilyIds.has(family.id);
    const isFamilySelected = family.id === selectedGenreId;
    const isFamilyFocused = currentIndex === focusedIndex;

    html += renderFamilyItem(family, isExpanded, isFamilySelected, isFamilyFocused);
    currentIndex++;

    if (isExpanded) {
      const subgenres = expandedSubgenres.get(family.id) ?? [];
      for (const sub of subgenres) {
        const isSubSelected = sub.id === selectedGenreId;
        const isSubFocused = currentIndex === focusedIndex;
        html += renderSubgenreItem(sub.id, sub.name, family.id, isSubSelected, isSubFocused);
        currentIndex++;
      }
    }
  }

  return `<ul class="genre-picker-list" role="tree" aria-label="Genre families">${html}</ul>`;
}

// ─── Search Results List ───────────────────────────────────────────────

/**
 * Render the search results view (active search mode).
 *
 * @param results - Array of search results.
 * @param selectedGenreId - Currently selected genre ID.
 * @param focusedIndex - Index of the focused item.
 * @param query - The active search query.
 * @returns HTML string for the search results list.
 */
export function renderSearchResults(
  results: readonly GenreSearchResult[],
  selectedGenreId: string | null,
  focusedIndex: number,
  query: string
): string {
  if (results.length === 0) {
    return renderEmptyState(query);
  }

  let html = "";
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const isSelected = result.id === selectedGenreId;
    const isFocused = i === focusedIndex;
    html += renderSearchResultItem(result, isSelected, isFocused);
  }

  return `<ul class="genre-picker-list genre-picker-results" role="listbox" aria-label="Search results">${html}</ul>`;
}

// ─── Full Picker Render ────────────────────────────────────────────────

/**
 * Input data for rendering the complete genre picker.
 */
export interface GenrePickerData {
  readonly searchQuery: string;
  readonly selectedGenreId: string | null;
  readonly families: readonly GenreFamilySummary[];
  readonly searchResults: readonly GenreSearchResult[];
  readonly expandedFamilyIds: ReadonlySet<string>;
  readonly focusedIndex: number;
  readonly expandedSubgenres: ReadonlyMap<string, readonly { id: string; name: string }[]>;
  readonly isSearchActive: boolean;
}

/**
 * Render the complete genre picker component.
 *
 * @param data - All data needed to render the picker.
 * @returns HTML string for the genre picker.
 */
export function renderGenrePicker(data: GenrePickerData): string {
  const {
    searchQuery,
    selectedGenreId,
    families,
    searchResults,
    expandedFamilyIds,
    focusedIndex,
    expandedSubgenres,
    isSearchActive,
  } = data;

  let html = "";

  // Search input
  html += renderSearchInput(searchQuery);

  // Clear button
  html += renderClearButton(selectedGenreId);

  // List content
  if (isSearchActive) {
    html += renderSearchResults(searchResults, selectedGenreId, focusedIndex, searchQuery);
  } else {
    html += renderFamilyList({
      families,
      expandedFamilyIds,
      selectedGenreId,
      focusedIndex,
      expandedSubgenres,
    });
  }

  return `<div class="genre-picker" role="dialog" aria-label="Genre picker">${html}</div>`;
}

// ─── Debounce Utility ──────────────────────────────────────────────────

/**
 * Create a debounced version of a function.
 *
 * @param fn - The function to debounce.
 * @param delayMs - Delay in milliseconds.
 * @returns A debounced version that delays invocation until `delayMs` after the last call.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delayMs);
  };
}
