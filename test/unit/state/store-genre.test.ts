import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../../src/state/store.js";
import type { AlignmentResult } from "../../../src/core/alignment-scorer.js";
import type { ArchetypeResult } from "../../../src/core/archetype-detector.js";

// Use a known valid profile ID from the registry (the techno profile)
const VALID_GENRE_ID = "techno";
const VALID_SUBGENRE_ID = "peak-time-techno";

describe("store — SET_GENRE action", () => {
  it("sets selectedGenreId when dispatched with a valid profile ID", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });

    expect(store.getState().selectedGenreId).toBe(VALID_GENRE_ID);
  });

  it("accepts dispatch with a subgenre ID (resolves via getProfileBySubgenre)", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_SUBGENRE_ID });

    // Subgenre IDs are now resolved via getProfileBySubgenre
    expect(store.getState().selectedGenreId).toBe(VALID_SUBGENRE_ID);
  });

  it("ignores dispatch with an invalid genre ID (state unchanged)", () => {
    const store = createStore();
    // First set a valid genre
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    // Try to set an invalid genre
    store.dispatch({ type: "SET_GENRE", genreId: "nonexistent-genre-xyz" });

    expect(store.getState().selectedGenreId).toBe(VALID_GENRE_ID);
  });

  it("ignores dispatch with an empty string (state unchanged)", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    store.dispatch({ type: "SET_GENRE", genreId: "" });

    expect(store.getState().selectedGenreId).toBe(VALID_GENRE_ID);
  });

  it("sets selectedGenreId to null when dispatched with null", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    store.dispatch({ type: "SET_GENRE", genreId: null });

    expect(store.getState().selectedGenreId).toBeNull();
  });

  it("does not modify other state fields when setting genre", () => {
    const store = createStore();
    store.dispatch({
      type: "UPDATE_ISSUES",
      issues: [{ id: "test", type: "flat-energy", severity: "warning", sectionIds: [], message: "test" }],
    });
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });

    expect(store.getState().issues).toHaveLength(1);
  });

  it("notifies subscribers when SET_GENRE is dispatched with a valid ID", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers even when SET_GENRE is dispatched with an invalid ID (no-op)", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "SET_GENRE", genreId: "invalid-id" });

    // Subscribers are notified on every dispatch regardless of state change
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("store — UPDATE_ALIGNMENT action", () => {
  const sampleAlignment: AlignmentResult = {
    overall: 75,
    ordering: 80,
    length: 70,
    count: 72,
  };

  it("sets alignmentScore when dispatched with a valid AlignmentResult", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: sampleAlignment });

    expect(store.getState().alignmentScore).toEqual(sampleAlignment);
  });

  it("clears alignmentScore when dispatched with null", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: sampleAlignment });
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: null });

    expect(store.getState().alignmentScore).toBeNull();
  });

  it("replaces previous alignment on subsequent dispatch", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: sampleAlignment });

    const newAlignment: AlignmentResult = { overall: 90, ordering: 95, length: 85, count: 88 };
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: newAlignment });

    expect(store.getState().alignmentScore).toEqual(newAlignment);
  });

  it("does not modify selectedGenreId when updating alignment", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: sampleAlignment });

    expect(store.getState().selectedGenreId).toBe(VALID_GENRE_ID);
  });

  it("notifies subscribers when UPDATE_ALIGNMENT is dispatched", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: sampleAlignment });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("store — UPDATE_ARCHETYPE action", () => {
  const sampleArchetype: ArchetypeResult = {
    archetype: "build-drop",
    confidence: 72,
    lowConfidence: false,
  };

  it("sets detectedArchetype when dispatched with a valid ArchetypeResult", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: sampleArchetype });

    expect(store.getState().detectedArchetype).toEqual(sampleArchetype);
  });

  it("clears detectedArchetype when dispatched with null", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: sampleArchetype });
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: null });

    expect(store.getState().detectedArchetype).toBeNull();
  });

  it("replaces previous archetype on subsequent dispatch", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: sampleArchetype });

    const newArchetype: ArchetypeResult = {
      archetype: "dj-tool",
      confidence: 45,
      lowConfidence: true,
    };
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: newArchetype });

    expect(store.getState().detectedArchetype).toEqual(newArchetype);
  });

  it("does not modify selectedGenreId when updating archetype", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: sampleArchetype });

    expect(store.getState().selectedGenreId).toBe(VALID_GENRE_ID);
  });

  it("does not modify alignmentScore when updating archetype", () => {
    const store = createStore();
    const alignment: AlignmentResult = { overall: 60, ordering: 65, length: 55, count: 58 };
    store.dispatch({ type: "UPDATE_ALIGNMENT", alignment });
    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: sampleArchetype });

    expect(store.getState().alignmentScore).toEqual(alignment);
  });

  it("notifies subscribers when UPDATE_ARCHETYPE is dispatched", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: sampleArchetype });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("store — INIT resets genre-related fields", () => {
  it("preserves selectedGenreId on INIT (genre persists across re-analyses)", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    store.dispatch({ type: "INIT", sections: [], trackInventory: [] });

    expect(store.getState().selectedGenreId).toBe(VALID_GENRE_ID);
  });

  it("resets alignmentScore to null on INIT", () => {
    const store = createStore();
    store.dispatch({
      type: "UPDATE_ALIGNMENT",
      alignment: { overall: 80, ordering: 85, length: 75, count: 78 },
    });
    store.dispatch({ type: "INIT", sections: [], trackInventory: [] });

    expect(store.getState().alignmentScore).toBeNull();
  });

  it("resets detectedArchetype to null on INIT", () => {
    const store = createStore();
    store.dispatch({
      type: "UPDATE_ARCHETYPE",
      archetype: { archetype: "loop", confidence: 60, lowConfidence: false },
    });
    store.dispatch({ type: "INIT", sections: [], trackInventory: [] });

    expect(store.getState().detectedArchetype).toBeNull();
  });

  it("resets alignment and archetype but preserves selectedGenreId simultaneously on INIT", () => {
    const store = createStore();
    store.dispatch({ type: "SET_GENRE", genreId: VALID_GENRE_ID });
    store.dispatch({
      type: "UPDATE_ALIGNMENT",
      alignment: { overall: 80, ordering: 85, length: 75, count: 78 },
    });
    store.dispatch({
      type: "UPDATE_ARCHETYPE",
      archetype: { archetype: "peak-valley", confidence: 55, lowConfidence: false },
    });

    store.dispatch({ type: "INIT", sections: [], trackInventory: [] });

    const state = store.getState();
    expect(state.selectedGenreId).toBe(VALID_GENRE_ID);
    expect(state.alignmentScore).toBeNull();
    expect(state.detectedArchetype).toBeNull();
  });
});
