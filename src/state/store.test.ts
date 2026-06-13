/**
 * Unit tests for the State Store.
 *
 * Validates: Requirements 6.1, 6.3, 6.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { createStore } from "./store.js";
import type { SectionAnalysisState } from "./store.js";
import {
  createSection,
  createTrackData,
  resetFactoryCounters,
} from "../../test/factories.js";
import { buildTrackInventory } from "../core/track-reader.js";
import { GENRES } from "../core/genre-registry.js";

describe("State Store", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  describe("INIT action", () => {
    it("populates sections and trackInventory correctly", () => {
      const store = createStore();

      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ name: "Verse", startTime: 32, endTime: 64 }),
      ];
      const trackData = [
        createTrackData({ name: "Drums", type: "midi" }),
        createTrackData({ name: "Bass", type: "audio" }),
      ];
      const trackInventory = buildTrackInventory(trackData);

      store.dispatch({ type: "INIT", sections, trackInventory });

      const state = store.getState();
      expect(state.sections).toHaveLength(2);
      expect(state.sections[0]!.name).toBe("Intro");
      expect(state.sections[1]!.name).toBe("Verse");
      expect(state.trackInventory).toHaveLength(2);
      expect(state.trackInventory[0]).toEqual({ name: "Drums", type: "midi" });
      expect(state.trackInventory[1]).toEqual({ name: "Bass", type: "audio" });
      expect(state.activeSectionId).toBeNull();
    });
  });

  describe("subscribe", () => {
    it("notifies subscribers when dispatch is called", () => {
      const store = createStore();
      const listener = vi.fn();

      store.subscribe(listener);

      const sections = [createSection({ name: "Drop", startTime: 0, endTime: 64 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies multiple subscribers on each dispatch", () => {
      const store = createStore();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);

      store.dispatch({ type: "INIT", sections: [], trackInventory: [] });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("UPDATE_PLAYHEAD", () => {
    it("sets activeSectionId to null when position is outside all sections", () => {
      const store = createStore();
      const sections = [
        createSection({ name: "Intro", startTime: 16, endTime: 32 }),
        createSection({ name: "Verse", startTime: 32, endTime: 64 }),
      ];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Position before first section
      store.dispatch({ type: "UPDATE_PLAYHEAD", position: 8 });
      expect(store.getState().activeSectionId).toBeNull();

      // Position after last section (endTime is 64, so 64 is outside)
      store.dispatch({ type: "UPDATE_PLAYHEAD", position: 100 });
      expect(store.getState().activeSectionId).toBeNull();
    });

    it("resolves activeSectionId when position is within a section", () => {
      const store = createStore();
      const sections = [
        createSection({ id: "section-0", name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ id: "section-1", name: "Verse", startTime: 32, endTime: 64 }),
        createSection({ id: "section-2", name: "Chorus", startTime: 64, endTime: 96 }),
      ];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      store.dispatch({ type: "UPDATE_PLAYHEAD", position: 16 });
      expect(store.getState().activeSectionId).toBe("section-0");

      store.dispatch({ type: "UPDATE_PLAYHEAD", position: 32 });
      expect(store.getState().activeSectionId).toBe("section-1");

      store.dispatch({ type: "UPDATE_PLAYHEAD", position: 80 });
      expect(store.getState().activeSectionId).toBe("section-2");
    });
  });

  describe("unsubscribe", () => {
    it("removes the listener so it is no longer called after unsubscribe", () => {
      const store = createStore();
      const listener = vi.fn();

      const unsubscribe = store.subscribe(listener);

      store.dispatch({ type: "INIT", sections: [], trackInventory: [] });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      store.dispatch({ type: "INIT", sections: [], trackInventory: [] });
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });
  });
});


// ─── Property-Based Tests ──────────────────────────────────────────────

// Feature: m2-section-analysis, Property 9: Invalid genre rejection

/**
 * **Validates: Requirements 10.4**
 *
 * Property 9: Invalid genre rejection
 * For any string that is not present in the Genre Registry's GENRES array,
 * dispatching a SET_GENRE action with that string SHALL leave the state's
 * selectedGenre unchanged from its value before the dispatch.
 */
describe("Property 9: Invalid genre rejection", () => {
  // Generator: random string NOT in GENRES
  const invalidGenreArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !GENRES.includes(s));

  // Generator: an optional valid genre to pre-set (or null for no genre)
  const initialGenreArb = fc.oneof(
    fc.constant(null),
    fc.constantFrom(...GENRES),
  );

  fcTest.prop(
    [initialGenreArb, invalidGenreArb],
    { numRuns: 100 },
  )(
    "SET_GENRE with invalid genre leaves selectedGenre unchanged",
    (initialGenre, invalidGenre) => {
      const store = createStore();

      // Establish initial state — optionally set a valid genre first
      store.dispatch({ type: "INIT", sections: [], trackInventory: [] });
      if (initialGenre !== null) {
        store.dispatch({ type: "SET_GENRE", genreId: initialGenre });
      }

      const genreBefore = store.getState().selectedGenreId;

      // Dispatch SET_GENRE with the invalid genre string
      store.dispatch({ type: "SET_GENRE", genreId: invalidGenre });

      const genreAfter = store.getState().selectedGenreId;

      // selectedGenre must not have changed
      expect(genreAfter).toBe(genreBefore);
    },
  );
});


describe("State Store — M2 Extensions", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  describe("Initial state M2 defaults", () => {
    it("sectionAnalysis is an empty Map", () => {
      const store = createStore();
      const state = store.getState();
      expect(state.sectionAnalysis).toBeInstanceOf(Map);
      expect(state.sectionAnalysis.size).toBe(0);
    });

    it("energyCurve is an empty array", () => {
      const store = createStore();
      const state = store.getState();
      expect(state.energyCurve).toEqual([]);
      expect(state.energyCurve).toHaveLength(0);
    });

    it("selectedGenre is null", () => {
      const store = createStore();
      const state = store.getState();
      expect(state.selectedGenreId).toBeNull();
    });
  });

  describe("SET_GENRE with valid genre", () => {
    it("sets selectedGenre to the genre string", () => {
      const store = createStore();
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      expect(store.getState().selectedGenreId).toBe("techno");
    });

    it("does not affect sections, trackInventory, activeSectionId, sectionAnalysis, or energyCurve", () => {
      const store = createStore();
      const sections = [createSection({ name: "Intro", startTime: 0, endTime: 32 })];
      const trackInventory = buildTrackInventory([createTrackData({ name: "Drums", type: "midi" })]);
      store.dispatch({ type: "INIT", sections, trackInventory });

      const stateBefore = store.getState();
      store.dispatch({ type: "SET_GENRE", genreId: "trance" });
      const stateAfter = store.getState();

      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
    });
  });

  describe("SET_GENRE with invalid genre", () => {
    it("state remains unchanged when genre is not in GENRES list", () => {
      const store = createStore();
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const stateBefore = store.getState();
      store.dispatch({ type: "SET_GENRE", genreId: "UnknownGenre" });
      const stateAfter = store.getState();

      expect(stateAfter.selectedGenreId).toBe("techno");
      expect(stateAfter).toBe(stateBefore);
    });

    it("state stays null when dispatching invalid genre from initial state", () => {
      const store = createStore();
      store.dispatch({ type: "SET_GENRE", genreId: "NotARealGenre" });
      expect(store.getState().selectedGenreId).toBeNull();
    });
  });

  describe("SET_GENRE with null", () => {
    it("clears selectedGenre to null", () => {
      const store = createStore();
      store.dispatch({ type: "SET_GENRE", genreId: "house" });
      expect(store.getState().selectedGenreId).toBe("house");

      store.dispatch({ type: "SET_GENRE", genreId: null });
      expect(store.getState().selectedGenreId).toBeNull();
    });

    it("does not affect other fields", () => {
      const store = createStore();
      const sections = [createSection({ name: "Verse", startTime: 0, endTime: 64 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "pop-electronic" });

      const stateBefore = store.getState();
      store.dispatch({ type: "SET_GENRE", genreId: null });
      const stateAfter = store.getState();

      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
    });
  });

  describe("UPDATE_ANALYSIS", () => {
    it("sets sectionAnalysis and energyCurve correctly", () => {
      const store = createStore();
      const sectionAnalysis = new Map<string, SectionAnalysisState>([
        ["section-0", { activeTrackCount: 3, midiDensity: 4.5, hasAutomation: true, energyScore: 7 }],
        ["section-1", { activeTrackCount: 5, midiDensity: 8.2, hasAutomation: false, energyScore: 9 }],
      ]);
      const energyCurve = [7, 9];

      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve });

      const state = store.getState();
      expect(state.sectionAnalysis.size).toBe(2);
      expect(state.sectionAnalysis.get("section-0")).toEqual({
        activeTrackCount: 3,
        midiDensity: 4.5,
        hasAutomation: true,
        energyScore: 7,
      });
      expect(state.sectionAnalysis.get("section-1")).toEqual({
        activeTrackCount: 5,
        midiDensity: 8.2,
        hasAutomation: false,
        energyScore: 9,
      });
      expect(state.energyCurve).toEqual([7, 9]);
    });

    it("does not affect sections, trackInventory, activeSectionId, or selectedGenre", () => {
      const store = createStore();
      const sections = [createSection({ name: "Drop", startTime: 0, endTime: 32 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "ambient-downtempo" });

      const stateBefore = store.getState();

      const sectionAnalysis = new Map<string, SectionAnalysisState>([
        ["section-0", { activeTrackCount: 2, midiDensity: 1.0, hasAutomation: false, energyScore: 3 }],
      ]);
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve: [3] });

      const stateAfter = store.getState();
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
    });
  });

  describe("UPDATE_ANALYSIS with empty payload", () => {
    it("accepts empty Map and empty array", () => {
      const store = createStore();
      // First set some analysis data
      const sectionAnalysis = new Map<string, SectionAnalysisState>([
        ["section-0", { activeTrackCount: 4, midiDensity: 6.0, hasAutomation: true, energyScore: 8 }],
      ]);
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve: [8] });
      expect(store.getState().sectionAnalysis.size).toBe(1);

      // Now dispatch with empty payload
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis: new Map(), energyCurve: [] });

      const state = store.getState();
      expect(state.sectionAnalysis.size).toBe(0);
      expect(state.energyCurve).toEqual([]);
      expect(state.energyCurve).toHaveLength(0);
    });
  });

  describe("Subscribers notified on SET_GENRE", () => {
    it("listener called after SET_GENRE dispatch", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({ type: "SET_GENRE", genreId: "drum-and-bass" });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("Subscribers notified on UPDATE_ANALYSIS", () => {
    it("listener called after UPDATE_ANALYSIS dispatch", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      const sectionAnalysis = new Map<string, SectionAnalysisState>([
        ["section-0", { activeTrackCount: 1, midiDensity: 2.0, hasAutomation: false, energyScore: 4 }],
      ]);
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve: [4] });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("INIT resets M2 fields", () => {
    it("after SET_GENRE and UPDATE_ANALYSIS, INIT resets sectionAnalysis, energyCurve, selectedGenre to defaults", () => {
      const store = createStore();

      // Set genre and analysis data
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      const sectionAnalysis = new Map<string, SectionAnalysisState>([
        ["section-0", { activeTrackCount: 5, midiDensity: 10.0, hasAutomation: true, energyScore: 10 }],
      ]);
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve: [10] });

      // Verify M2 fields are populated
      expect(store.getState().selectedGenreId).toBe("techno");
      expect(store.getState().sectionAnalysis.size).toBe(1);
      expect(store.getState().energyCurve).toEqual([10]);

      // Dispatch INIT
      const sections = [createSection({ name: "NewIntro", startTime: 0, endTime: 16 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      // Verify M2 fields are reset (selectedGenreId persists by design)
      const state = store.getState();
      expect(state.sectionAnalysis).toBeInstanceOf(Map);
      expect(state.sectionAnalysis.size).toBe(0);
      expect(state.energyCurve).toEqual([]);
      expect(state.selectedGenreId).toBe("techno");
    });
  });
});


// Feature: m2-section-analysis, Property 10: Action isolation — unrelated fields unchanged

/**
 * **Validates: Requirements 12.5, 12.6**
 *
 * Property 10: Action isolation — unrelated fields unchanged
 * For any valid AppState, verify UPDATE_ANALYSIS leaves sections, trackInventory,
 * activeSectionId, selectedGenre reference-equal; verify SET_GENRE leaves sections,
 * trackInventory, activeSectionId, sectionAnalysis, energyCurve reference-equal.
 */
describe("Property 10: Action isolation — unrelated fields unchanged", () => {
  // Generator for UPDATE_ANALYSIS payload
  const analysisArb = fc.tuple(
    fc.array(fc.tuple(fc.string(), fc.record({
      activeTrackCount: fc.integer({ min: 0, max: 20 }),
      midiDensity: fc.double({ min: 0, max: 50, noNaN: true }),
      hasAutomation: fc.boolean(),
      energyScore: fc.integer({ min: 1, max: 10 }),
    })), { minLength: 0, maxLength: 5 }),
    fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 5 }),
  );

  // Generator for SET_GENRE payload
  const genreArb = fc.oneof(fc.constant(null), fc.constantFrom(...GENRES));

  fcTest.prop(
    [analysisArb],
    { numRuns: 100 },
  )(
    "UPDATE_ANALYSIS leaves sections, trackInventory, activeSectionId, selectedGenre reference-equal",
    ([entries, energyCurve]) => {
      const store = createStore();

      // Initialize store with some data to ensure fields are populated
      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ name: "Verse", startTime: 32, endTime: 64 }),
      ];
      const trackData = [
        createTrackData({ name: "Drums", type: "midi" }),
        createTrackData({ name: "Bass", type: "audio" }),
      ];
      const trackInventory = buildTrackInventory(trackData);
      store.dispatch({ type: "INIT", sections, trackInventory });

      // Optionally set a genre so selectedGenre is non-null
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const stateBefore = store.getState();

      // Dispatch UPDATE_ANALYSIS with generated payload
      const sectionAnalysis = new Map(entries);
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve });

      const stateAfter = store.getState();

      // Verify unrelated fields are reference-equal
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
    },
  );

  fcTest.prop(
    [genreArb],
    { numRuns: 100 },
  )(
    "SET_GENRE leaves sections, trackInventory, activeSectionId, sectionAnalysis, energyCurve reference-equal",
    (genre) => {
      const store = createStore();

      // Initialize store with some data
      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ name: "Drop", startTime: 32, endTime: 64 }),
      ];
      const trackData = [
        createTrackData({ name: "Lead", type: "midi" }),
      ];
      const trackInventory = buildTrackInventory(trackData);
      store.dispatch({ type: "INIT", sections, trackInventory });

      // Dispatch an UPDATE_ANALYSIS so sectionAnalysis and energyCurve are non-empty
      store.dispatch({
        type: "UPDATE_ANALYSIS",
        sectionAnalysis: new Map([["section-0", { activeTrackCount: 3, midiDensity: 8.5, hasAutomation: true, energyScore: 7 }]]),
        energyCurve: [7, 5],
      });

      const stateBefore = store.getState();

      // Dispatch SET_GENRE with generated payload
      store.dispatch({ type: "SET_GENRE", genreId: genre });

      const stateAfter = store.getState();

      // Verify unrelated fields are reference-equal
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
    },
  );
});


// Feature: m2-section-analysis, Property 11: State dispatch immutability (extended)

/**
 * **Validates: Requirements 12.8**
 *
 * Property 11: State dispatch immutability (extended)
 * For any valid AppState (deep-frozen) and any valid Action including
 * UPDATE_ANALYSIS and SET_GENRE, dispatching the action SHALL not mutate
 * the previous state object — all fields of the previous state remain
 * unchanged after dispatch.
 */

/** Deep-freeze helper: recursively freezes all nested objects. */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/** Deep-clone helper: produces a JSON-serializable snapshot for comparison. */
function deepSnapshot(obj: unknown): unknown {
  if (obj instanceof Map) {
    const entries: [string, unknown][] = [];
    for (const [k, v] of obj.entries()) {
      entries.push([k, deepSnapshot(v)]);
    }
    return { __type: "Map", entries };
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepSnapshot(item));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = deepSnapshot((obj as any)[key]);
    }
    return result;
  }
  return obj;
}

// ─── Generators ────────────────────────────────────────────────────────

const sectionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  startTime: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  endTime: fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }),
});

const trackInfoArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  type: fc.constantFrom("midi" as const, "audio" as const),
});

const sectionAnalysisStateArb = fc.record({
  activeTrackCount: fc.integer({ min: 0, max: 50 }),
  midiDensity: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  hasAutomation: fc.boolean(),
  energyScore: fc.integer({ min: 1, max: 10 }),
});

const sectionAnalysisMapArb = fc
  .array(fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), sectionAnalysisStateArb), {
    minLength: 0,
    maxLength: 5,
  })
  .map((entries) => new Map(entries));

const energyCurveArb = fc.array(fc.integer({ min: 1, max: 10 }), {
  minLength: 0,
  maxLength: 10,
});

const actionArb = fc.oneof(
  fc.record({
    type: fc.constant("UPDATE_PLAYHEAD" as const),
    position: fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
  }),
  fc.record({
    type: fc.constant("UPDATE_ANALYSIS" as const),
    sectionAnalysis: sectionAnalysisMapArb,
    energyCurve: energyCurveArb,
  }),
  fc.record({
    type: fc.constant("SET_GENRE" as const),
    genreId: fc.oneof(
      fc.constant(null),
      fc.constantFrom(...GENRES),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
  }),
);

describe("Property 11: State dispatch immutability (extended)", () => {
  fcTest.prop(
    [
      fc.array(sectionArb, { minLength: 0, maxLength: 5 }),
      fc.array(trackInfoArb, { minLength: 0, maxLength: 5 }),
      fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 20 })),
      sectionAnalysisMapArb,
      energyCurveArb,
      actionArb,
    ],
    { numRuns: 100 },
  )(
    "dispatching any action does not mutate the previous state object",
    (sections, trackInventory, activeSectionId, sectionAnalysis, energyCurve, action) => {
      // Create a store and initialize with known state
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: sections.map((s) => ({ ...s })),
        trackInventory: trackInventory.map((t) => ({ ...t })),
      });

      // Set up analysis and genre state via dispatches if relevant
      if (sectionAnalysis.size > 0 || energyCurve.length > 0) {
        store.dispatch({
          type: "UPDATE_ANALYSIS",
          sectionAnalysis: new Map(sectionAnalysis),
          energyCurve: [...energyCurve],
        });
      }

      // Capture the state before the test action
      const stateBefore = store.getState();

      // Take a deep snapshot of the state before dispatch
      const snapshotBefore = deepSnapshot(stateBefore);

      // Deep-freeze the state to detect mutations via thrown errors
      deepFreeze(stateBefore);

      // Dispatch the random action — should NOT throw (no mutation of frozen state)
      expect(() => store.dispatch(action)).not.toThrow();

      // Verify the captured state object was not mutated (snapshot comparison)
      const snapshotAfter = deepSnapshot(stateBefore);
      expect(snapshotAfter).toEqual(snapshotBefore);
    },
  );
});


// ─── Feature: m4-transition-engine, Property 13: Checklist completion state preservation ───

/**
 * **Validates: Requirements 7.5, 7.7**
 *
 * Property 13: Checklist completion state preservation
 * For any existing state with completed checklist items, when UPDATE_TRANSITIONS
 * is dispatched with recommendations containing the same fromSectionId+toSectionId
 * pair and matching checklist item text, the completed state SHALL be preserved.
 * For boundaries that no longer exist in the new recommendations, their completion
 * states SHALL be discarded.
 */
describe("Property 13: Checklist completion state preservation", () => {
  // ─── Generators ────────────────────────────────────────────────────────

  /** Generate a valid TransitionCategory. */
  const transitionCategoryArb = fc.constantFrom(
    "riser" as const,
    "drum_fill" as const,
    "filter_sweep" as const,
    "volume_dynamics" as const,
    "impact" as const,
    "textural_fx" as const,
  );

  /** Generate a valid Technique. */
  const techniqueArb = (maxDuration: number) =>
    fc.record({
      category: transitionCategoryArb,
      name: fc.string({ minLength: 1, maxLength: 50 }),
      durationBars: fc.integer({ min: 1, max: Math.max(1, maxDuration) }),
    });

  /** Generate a checklist item (always starts as not completed, matching engine behavior). */
  const checklistItemArb = (recId: string, index: number) =>
    fc.record({
      id: fc.constant(`${recId}-cl-${index}`),
      text: fc.constant(`checklist-item-${recId}-${index}`),
      completed: fc.constant(false),
    });

  /** Generate a unique section ID pair. */
  const sectionIdPairArb = fc.tuple(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 20 }),
  ).filter(([a, b]) => a !== b);

  /** Generate a TransitionRecommendation with a given section ID pair. */
  const recommendationArb = (fromId: string, toId: string) => {
    const recId = `${fromId}-${toId}`;
    const sizeArb = fc.constantFrom("small" as const, "medium" as const, "large" as const);
    return sizeArb.chain((size) => {
      const durationRange = size === "small" ? { min: 2, max: 4 } : size === "medium" ? { min: 4, max: 8 } : { min: 8, max: 32 };
      const checklistCount = size === "small" ? { min: 2, max: 3 } : size === "medium" ? { min: 3, max: 4 } : { min: 4, max: 5 };
      const techniqueCount = size === "small" ? 1 : size === "medium" ? 2 : 3;

      return fc.record({
        id: fc.constant(recId),
        fromSectionId: fc.constant(fromId),
        toSectionId: fc.constant(toId),
        energyDelta: fc.integer({ min: -9, max: 9 }),
        transitionSize: fc.constant(size),
        suggestedDurationBars: fc.integer({ min: durationRange.min, max: durationRange.max }),
        techniques: fc.tuple(
          ...Array.from({ length: techniqueCount }, () => techniqueArb(durationRange.max))
        ).map((arr) => arr),
        boundaryType: fc.constantFrom("drop" as const, "breakdown" as const, "build" as const, "normal" as const),
        rationale: fc.string({ minLength: 1, maxLength: 120 }),
        checklist: fc.tuple(
          ...Array.from({ length: checklistCount.min }, (_, i) => checklistItemArb(recId, i))
        ).map((arr) => arr),
      });
    });
  };

  // ─── Test: Matching boundaries preserve completed states ─────────────

  fcTest.prop(
    [
      // Generate 1–4 unique section ID pairs for boundaries
      fc.array(sectionIdPairArb, { minLength: 1, maxLength: 4 })
        .map((pairs) => {
          // Ensure unique pairs by using a Set on the joined key
          const seen = new Set<string>();
          return pairs.filter(([a, b]) => {
            const key = `${a}-${b}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })
        .filter((pairs) => pairs.length >= 1),
      // Indices of items to toggle completed (subset of boundaries to mark as completed)
      fc.nat({ max: 100 }),
    ],
    { numRuns: 100 },
  )(
    "completed states preserved for matching boundaries/items when UPDATE_TRANSITIONS re-dispatched",
    async (sectionIdPairs, seed) => {
      const store = createStore();

      // Generate initial recommendations for each boundary
      const initialRecs = await Promise.all(
        sectionIdPairs.map(([fromId, toId]) =>
          fc.sample(recommendationArb(fromId!, toId!), { numRuns: 1 })[0]!
        )
      );

      // Dispatch initial recommendations
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: initialRecs,
      });

      // Toggle some checklist items to completed
      const toggledItems: Array<{ boundaryId: string; itemId: string; text: string }> = [];
      for (const rec of store.getState().transitionRecommendations) {
        for (let i = 0; i < rec.checklist.length; i++) {
          // Use seed to deterministically decide which items to toggle
          if ((seed + i + rec.id.length) % 2 === 0) {
            const item = rec.checklist[i]!;
            store.dispatch({
              type: "TOGGLE_CHECKLIST_ITEM",
              boundaryId: rec.id,
              itemId: item.id,
            });
            toggledItems.push({ boundaryId: rec.id, itemId: item.id, text: item.text });
          }
        }
      }

      // Verify some items are now completed
      const stateAfterToggle = store.getState();

      // Build new recommendations with SAME section ID pairs and SAME checklist text
      // (simulating a re-analysis that produces structurally identical recommendations)
      const newRecs = stateAfterToggle.transitionRecommendations.map((rec) => ({
        ...rec,
        // Reset all checklist items to completed: false (as the engine always generates fresh)
        checklist: rec.checklist.map((item) => ({ ...item, completed: false })),
      }));

      // Dispatch UPDATE_TRANSITIONS with the "fresh" recommendations
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: newRecs,
      });

      const stateAfterUpdate = store.getState();

      // Assert: completed states from matching items are preserved
      for (const toggled of toggledItems) {
        const rec = stateAfterUpdate.transitionRecommendations.find(
          (r) => r.id === toggled.boundaryId
        );
        expect(rec).toBeDefined();
        const item = rec!.checklist.find((i) => i.text === toggled.text);
        expect(item).toBeDefined();
        expect(item!.completed).toBe(true);
      }
    },
  );

  // ─── Test: Removed boundaries discard completion states ──────────────

  fcTest.prop(
    [
      // Generate 2–5 unique section ID pairs
      fc.array(sectionIdPairArb, { minLength: 2, maxLength: 5 })
        .map((pairs) => {
          const seen = new Set<string>();
          return pairs.filter(([a, b]) => {
            const key = `${a}-${b}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })
        .filter((pairs) => pairs.length >= 2),
      // How many boundaries to keep (at least 1, fewer than total)
      fc.nat({ max: 3 }),
    ],
    { numRuns: 100 },
  )(
    "completion states discarded for boundaries that no longer exist in new recommendations",
    async (sectionIdPairs, keepSeed) => {
      const store = createStore();

      // Generate initial recommendations
      const initialRecs = await Promise.all(
        sectionIdPairs.map(([fromId, toId]) =>
          fc.sample(recommendationArb(fromId!, toId!), { numRuns: 1 })[0]!
        )
      );

      // Dispatch initial recommendations
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: initialRecs,
      });

      // Toggle first checklist item in each recommendation to completed
      for (const rec of store.getState().transitionRecommendations) {
        if (rec.checklist.length > 0) {
          store.dispatch({
            type: "TOGGLE_CHECKLIST_ITEM",
            boundaryId: rec.id,
            itemId: rec.checklist[0]!.id,
          });
        }
      }

      // Determine which boundaries to keep vs remove
      const keepCount = Math.max(1, Math.min(keepSeed + 1, sectionIdPairs.length - 1));
      const keptPairs = sectionIdPairs.slice(0, keepCount);
      const removedPairs = sectionIdPairs.slice(keepCount);

      // Generate new recommendations with only the kept boundaries
      const newRecs = await Promise.all(
        keptPairs.map(([fromId, toId]) =>
          fc.sample(recommendationArb(fromId!, toId!), { numRuns: 1 })[0]!
        )
      );

      // Dispatch UPDATE_TRANSITIONS with reduced set
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: newRecs,
      });

      const finalState = store.getState();

      // Assert: removed boundaries are not in the final state
      for (const [fromId, toId] of removedPairs) {
        const found = finalState.transitionRecommendations.find(
          (r) => r.fromSectionId === fromId && r.toSectionId === toId
        );
        expect(found).toBeUndefined();
      }

      // Assert: kept boundaries exist in final state
      for (const [fromId, toId] of keptPairs) {
        const found = finalState.transitionRecommendations.find(
          (r) => r.fromSectionId === fromId && r.toSectionId === toId
        );
        expect(found).toBeDefined();
      }

      // Assert: total recommendation count matches kept boundaries
      expect(finalState.transitionRecommendations).toHaveLength(keepCount);
    },
  );

  // ─── Test: Non-matching checklist text does not inherit completion ────

  fcTest.prop(
    [sectionIdPairArb],
    { numRuns: 100 },
  )(
    "checklist items with different text do not inherit completed state from prior items",
    async ([fromId, toId]) => {
      const store = createStore();

      // Create initial recommendation
      const initialRec = fc.sample(recommendationArb(fromId!, toId!), { numRuns: 1 })[0]!;

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [initialRec],
      });

      // Toggle all checklist items to completed
      for (const item of store.getState().transitionRecommendations[0]!.checklist) {
        store.dispatch({
          type: "TOGGLE_CHECKLIST_ITEM",
          boundaryId: initialRec.id,
          itemId: item.id,
        });
      }

      // Verify all are completed
      const allCompleted = store.getState().transitionRecommendations[0]!.checklist.every(
        (item) => item.completed
      );
      expect(allCompleted).toBe(true);

      // Create new recommendation with same boundary but completely different checklist text
      const recId = `${fromId}-${toId}`;
      const newRec = {
        ...initialRec,
        checklist: initialRec.checklist.map((item, idx) => ({
          ...item,
          id: `${recId}-new-${idx}`,
          text: `completely-different-text-${idx}-${Date.now()}`,
          completed: false,
        })),
      };

      // Dispatch UPDATE_TRANSITIONS with new text
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [newRec],
      });

      const finalState = store.getState();
      const finalRec = finalState.transitionRecommendations[0]!;

      // Assert: none of the new checklist items inherited completed=true
      // because their text doesn't match any previous item text
      for (const item of finalRec.checklist) {
        expect(item.completed).toBe(false);
      }
    },
  );
});


// ─── Feature: m4-transition-engine, Unit Tests for State Store Transition Actions ──

/**
 * **Validates: Requirements 6.5, 6.6, 6.8**
 *
 * Unit tests for UPDATE_TRANSITIONS and TOGGLE_CHECKLIST_ITEM actions.
 * Tests cover:
 * - TOGGLE_CHECKLIST_ITEM with valid and invalid IDs
 * - UPDATE_TRANSITIONS replaces recommendations immutably
 * - UPDATE_TRANSITIONS with empty array clears all recommendations
 */
describe("State Store — Transition Actions (M4)", () => {
  // ─── Helper: Create a minimal valid TransitionRecommendation ─────────

  function createRecommendation(
    fromSectionId: string,
    toSectionId: string,
    overrides: Partial<{
      energyDelta: number;
      transitionSize: "small" | "medium" | "large";
      suggestedDurationBars: number;
      boundaryType: "drop" | "breakdown" | "build" | "normal";
      rationale: string;
      checklist: Array<{ id: string; text: string; completed: boolean }>;
      techniques: Array<{ category: string; name: string; durationBars: number }>;
    }> = {},
  ) {
    const id = `${fromSectionId}-${toSectionId}`;
    return {
      id,
      fromSectionId,
      toSectionId,
      energyDelta: overrides.energyDelta ?? 3,
      transitionSize: overrides.transitionSize ?? "medium",
      suggestedDurationBars: overrides.suggestedDurationBars ?? 6,
      techniques: overrides.techniques ?? [
        { category: "riser" as const, name: "white noise sweep", durationBars: 4 },
        { category: "drum_fill" as const, name: "snare roll", durationBars: 2 },
      ],
      boundaryType: overrides.boundaryType ?? "normal",
      rationale: overrides.rationale ?? "Rising energy — build tension with riser and drum fill",
      checklist: overrides.checklist ?? [
        { id: `${id}-cl-0`, text: "Add white noise riser over 4 bars", completed: false },
        { id: `${id}-cl-1`, text: "Layer snare roll in final 2 bars", completed: false },
        { id: `${id}-cl-2`, text: "Automate high-pass filter from 200Hz to 2kHz", completed: false },
      ],
    };
  }

  // ─── TOGGLE_CHECKLIST_ITEM ───────────────────────────────────────────

  describe("TOGGLE_CHECKLIST_ITEM", () => {
    it("toggles a checklist item from false to true with valid IDs", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      // Toggle first item
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "intro-verse-cl-0",
      });

      const state = store.getState();
      expect(state.transitionRecommendations[0]!.checklist[0]!.completed).toBe(true);
      expect(state.transitionRecommendations[0]!.checklist[1]!.completed).toBe(false);
      expect(state.transitionRecommendations[0]!.checklist[2]!.completed).toBe(false);
    });

    it("toggles a checklist item from true to false (double toggle)", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      // Toggle on
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "intro-verse-cl-1",
      });
      expect(store.getState().transitionRecommendations[0]!.checklist[1]!.completed).toBe(true);

      // Toggle off
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "intro-verse-cl-1",
      });
      expect(store.getState().transitionRecommendations[0]!.checklist[1]!.completed).toBe(false);
    });

    it("leaves state unchanged when boundaryId does not exist", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      const stateBefore = store.getState();

      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "nonexistent-boundary",
        itemId: "intro-verse-cl-0",
      });

      const stateAfter = store.getState();
      // State reference should be identical (no mutation, no new object)
      expect(stateAfter).toBe(stateBefore);
    });

    it("leaves state unchanged when itemId does not exist within a valid boundary", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      const stateBefore = store.getState();

      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "nonexistent-item-id",
      });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    });

    it("leaves state unchanged when both boundaryId and itemId are invalid", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      const stateBefore = store.getState();

      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "wrong-boundary",
        itemId: "wrong-item",
      });

      const stateAfter = store.getState();
      expect(stateAfter).toBe(stateBefore);
    });

    it("toggles the correct item when multiple recommendations exist", () => {
      const store = createStore();
      const rec1 = createRecommendation("intro", "verse");
      const rec2 = createRecommendation("verse", "chorus");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec1, rec2],
      });

      // Toggle an item in the second recommendation
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "verse-chorus",
        itemId: "verse-chorus-cl-0",
      });

      const state = store.getState();
      // First recommendation unchanged
      expect(state.transitionRecommendations[0]!.checklist[0]!.completed).toBe(false);
      // Second recommendation's first item toggled
      expect(state.transitionRecommendations[1]!.checklist[0]!.completed).toBe(true);
    });

    it("notifies subscribers when a valid toggle occurs", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "intro-verse-cl-0",
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies subscribers even when toggle is a no-op (invalid IDs)", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      const listener = vi.fn();
      store.subscribe(listener);

      // Invalid boundaryId — state unchanged but subscriber still notified (dispatch always notifies)
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "nonexistent",
        itemId: "intro-verse-cl-0",
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ─── UPDATE_TRANSITIONS ──────────────────────────────────────────────

  describe("UPDATE_TRANSITIONS", () => {
    it("replaces recommendations immutably (new state reference)", () => {
      const store = createStore();
      const rec1 = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec1],
      });

      const stateBefore = store.getState();
      expect(stateBefore.transitionRecommendations).toHaveLength(1);

      // Dispatch a new set of recommendations
      const rec2 = createRecommendation("verse", "chorus");
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec2],
      });

      const stateAfter = store.getState();
      // New state reference (immutable update)
      expect(stateAfter).not.toBe(stateBefore);
      expect(stateAfter.transitionRecommendations).not.toBe(stateBefore.transitionRecommendations);
      // Content replaced
      expect(stateAfter.transitionRecommendations).toHaveLength(1);
      expect(stateAfter.transitionRecommendations[0]!.id).toBe("verse-chorus");
    });

    it("does not affect other state fields when updating transitions", () => {
      const store = createStore();
      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ name: "Verse", startTime: 32, endTime: 64 }),
      ];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const stateBefore = store.getState();

      const rec = createRecommendation("intro", "verse");
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      const stateAfter = store.getState();
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.issues).toBe(stateBefore.issues);
    });

    it("clears all recommendations when dispatched with empty array", () => {
      const store = createStore();
      const rec1 = createRecommendation("intro", "verse");
      const rec2 = createRecommendation("verse", "chorus");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec1, rec2],
      });

      expect(store.getState().transitionRecommendations).toHaveLength(2);

      // Dispatch empty array
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [],
      });

      const state = store.getState();
      expect(state.transitionRecommendations).toHaveLength(0);
      expect(state.transitionRecommendations).toEqual([]);
    });

    it("replaces all previous recommendations with new set", () => {
      const store = createStore();

      // Initial set of 3 recommendations
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [
          createRecommendation("a", "b"),
          createRecommendation("b", "c"),
          createRecommendation("c", "d"),
        ],
      });

      expect(store.getState().transitionRecommendations).toHaveLength(3);

      // Replace with 2 different recommendations
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [
          createRecommendation("x", "y"),
          createRecommendation("y", "z"),
        ],
      });

      const state = store.getState();
      expect(state.transitionRecommendations).toHaveLength(2);
      expect(state.transitionRecommendations[0]!.id).toBe("x-y");
      expect(state.transitionRecommendations[1]!.id).toBe("y-z");
    });

    it("preserves checklist completion states for matching boundaries and text", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      // Toggle the first checklist item to completed
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "intro-verse-cl-0",
      });

      expect(store.getState().transitionRecommendations[0]!.checklist[0]!.completed).toBe(true);

      // Re-dispatch with same boundary and same checklist text (simulating re-analysis)
      const freshRec = createRecommendation("intro", "verse"); // same text content
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [freshRec],
      });

      // Completed state should be preserved because boundary and text match
      const finalState = store.getState();
      expect(finalState.transitionRecommendations[0]!.checklist[0]!.completed).toBe(true);
      expect(finalState.transitionRecommendations[0]!.checklist[1]!.completed).toBe(false);
    });

    it("discards checklist completion for boundaries no longer in new recommendations", () => {
      const store = createStore();
      const rec1 = createRecommendation("intro", "verse");
      const rec2 = createRecommendation("verse", "chorus");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec1, rec2],
      });

      // Toggle items in both recommendations
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "intro-verse",
        itemId: "intro-verse-cl-0",
      });
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: "verse-chorus",
        itemId: "verse-chorus-cl-0",
      });

      // Re-dispatch with only the second boundary
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [createRecommendation("verse", "chorus")],
      });

      const state = store.getState();
      expect(state.transitionRecommendations).toHaveLength(1);
      expect(state.transitionRecommendations[0]!.id).toBe("verse-chorus");
      // Kept boundary preserves completion
      expect(state.transitionRecommendations[0]!.checklist[0]!.completed).toBe(true);
    });

    it("does not preserve checklist completion when text changes for same boundary", () => {
      const store = createStore();
      const rec = createRecommendation("intro", "verse");

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [rec],
      });

      // Toggle all items to completed
      for (const item of store.getState().transitionRecommendations[0]!.checklist) {
        store.dispatch({
          type: "TOGGLE_CHECKLIST_ITEM",
          boundaryId: "intro-verse",
          itemId: item.id,
        });
      }

      // Re-dispatch with same boundary but different checklist text
      const newRec = createRecommendation("intro", "verse", {
        checklist: [
          { id: "intro-verse-cl-0", text: "Completely different step one", completed: false },
          { id: "intro-verse-cl-1", text: "Completely different step two", completed: false },
          { id: "intro-verse-cl-2", text: "Completely different step three", completed: false },
        ],
      });

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [newRec],
      });

      const state = store.getState();
      // No completion preserved because text doesn't match
      for (const item of state.transitionRecommendations[0]!.checklist) {
        expect(item.completed).toBe(false);
      }
    });

    it("notifies subscribers on UPDATE_TRANSITIONS dispatch", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [createRecommendation("a", "b")],
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ─── INIT resets transitionRecommendations ───────────────────────────

  describe("INIT resets transitionRecommendations", () => {
    it("clears transitionRecommendations to empty array on INIT", () => {
      const store = createStore();

      // Set up some recommendations
      store.dispatch({
        type: "UPDATE_TRANSITIONS",
        transitionRecommendations: [
          createRecommendation("intro", "verse"),
          createRecommendation("verse", "chorus"),
        ],
      });

      expect(store.getState().transitionRecommendations).toHaveLength(2);

      // INIT should reset
      store.dispatch({
        type: "INIT",
        sections: [createSection({ name: "NewIntro", startTime: 0, endTime: 32 })],
        trackInventory: [],
      });

      expect(store.getState().transitionRecommendations).toHaveLength(0);
      expect(store.getState().transitionRecommendations).toEqual([]);
    });
  });

  // ─── Initial state has empty transitionRecommendations ───────────────

  describe("Initial state", () => {
    it("transitionRecommendations is an empty array on store creation", () => {
      const store = createStore();
      const state = store.getState();
      expect(state.transitionRecommendations).toEqual([]);
      expect(state.transitionRecommendations).toHaveLength(0);
    });
  });
});


// ─── Feature: m7-reference-tracks, Property 11 & 12: Reference state actions ───

/**
 * **Validates: Requirements 5.2, 5.3, 5.5, 5.6**
 *
 * Property 11: UPDATE_REFERENCE preserves non-reference state
 * For any application state, dispatching an UPDATE_REFERENCE action SHALL update
 * only referenceTrackIndex, referenceSections, and comparisonResult, while all
 * other state fields retain reference equality with their pre-dispatch values.
 *
 * Property 12: CLEAR_REFERENCE resets reference state without side effects
 * For any application state with non-null reference data, dispatching a
 * CLEAR_REFERENCE action SHALL set referenceTrackIndex to null, referenceSections
 * to an empty array, and comparisonResult to null, while all other state fields
 * retain reference equality.
 */
describe("Property 11: UPDATE_REFERENCE preserves non-reference state", () => {
  // ─── Generators ────────────────────────────────────────────────────────

  const referenceSectionArb = fc.record({
    label: fc.string({ minLength: 1, maxLength: 30 }),
    startTime: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    endTime: fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
    proportion: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });

  const sectionDeltaArb = fc.record({
    userLabel: fc.string({ minLength: 1, maxLength: 20 }),
    referenceLabel: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 20 })),
    proportionDelta: fc.oneof(fc.constant(null), fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true })),
    timingDelta: fc.oneof(fc.constant(null), fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true })),
    durationDeltaBeats: fc.oneof(fc.constant(null), fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true })),
    durationDeltaPercent: fc.oneof(fc.constant(null), fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true })),
    matched: fc.boolean(),
    suggestion: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
  });

  const aggregateMetricsArb = fc.record({
    totalDurationDifference: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    peakPositionDifference: fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
    sectionCountDifference: fc.integer({ min: -20, max: 20 }),
  });

  const comparisonResultArb = fc.oneof(
    fc.constant(null),
    fc.record({
      sectionDeltas: fc.array(sectionDeltaArb, { minLength: 1, maxLength: 5 }),
      aggregateMetrics: aggregateMetricsArb,
    }),
  );

  const referenceTrackIndexArb = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 0, max: 50 }),
  );

  const updateReferencePayloadArb = fc.record({
    referenceTrackIndex: referenceTrackIndexArb,
    referenceSections: fc.array(referenceSectionArb, { minLength: 0, maxLength: 5 }),
    comparisonResult: comparisonResultArb,
  });

  fcTest.prop(
    [updateReferencePayloadArb],
    { numRuns: 100 },
  )(
    "dispatching UPDATE_REFERENCE updates only reference fields; all other fields retain reference equality",
    (payload) => {
      const store = createStore();

      // Set up a non-trivial initial state so there are real references to check
      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ name: "Verse", startTime: 32, endTime: 64 }),
      ];
      const trackData = [
        createTrackData({ name: "Drums", type: "midi" }),
        createTrackData({ name: "Bass", type: "audio" }),
      ];
      const trackInventory = buildTrackInventory(trackData);
      store.dispatch({ type: "INIT", sections, trackInventory });
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      store.dispatch({
        type: "UPDATE_ANALYSIS",
        sectionAnalysis: new Map([["s1", { activeTrackCount: 3, midiDensity: 5, hasAutomation: true, energyScore: 7 }]]),
        energyCurve: [7, 8],
      });

      const stateBefore = store.getState();

      // Dispatch UPDATE_REFERENCE with random payload
      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: payload.referenceTrackIndex,
        referenceSections: payload.referenceSections,
        comparisonResult: payload.comparisonResult,
      });

      const stateAfter = store.getState();

      // Reference fields are updated
      expect(stateAfter.referenceTrackIndex).toBe(payload.referenceTrackIndex);
      expect(stateAfter.referenceSections).toBe(payload.referenceSections);
      expect(stateAfter.comparisonResult).toBe(payload.comparisonResult);

      // All non-reference fields retain reference equality (===)
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.alignmentScore).toBe(stateBefore.alignmentScore);
      expect(stateAfter.detectedArchetype).toBe(stateBefore.detectedArchetype);
      expect(stateAfter.issues).toBe(stateBefore.issues);
      expect(stateAfter.transitionRecommendations).toBe(stateBefore.transitionRecommendations);
      expect(stateAfter.notes).toBe(stateBefore.notes);
      expect(stateAfter.sectionChecklists).toBe(stateBefore.sectionChecklists);
      expect(stateAfter.persistenceAvailable).toBe(stateBefore.persistenceAvailable);
    },
  );
});

describe("Property 12: CLEAR_REFERENCE resets reference state without side effects", () => {
  // ─── Generators ────────────────────────────────────────────────────────

  const referenceSectionArb = fc.record({
    label: fc.string({ minLength: 1, maxLength: 30 }),
    startTime: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    endTime: fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
    proportion: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });

  const sectionDeltaArb = fc.record({
    userLabel: fc.string({ minLength: 1, maxLength: 20 }),
    referenceLabel: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 20 })),
    proportionDelta: fc.oneof(fc.constant(null), fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true })),
    timingDelta: fc.oneof(fc.constant(null), fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true })),
    durationDeltaBeats: fc.oneof(fc.constant(null), fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true })),
    durationDeltaPercent: fc.oneof(fc.constant(null), fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true })),
    matched: fc.boolean(),
    suggestion: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
  });

  const aggregateMetricsArb = fc.record({
    totalDurationDifference: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    peakPositionDifference: fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
    sectionCountDifference: fc.integer({ min: -20, max: 20 }),
  });

  const comparisonResultArb = fc.record({
    sectionDeltas: fc.array(sectionDeltaArb, { minLength: 1, maxLength: 5 }),
    aggregateMetrics: aggregateMetricsArb,
  });

  const referenceTrackIndexArb = fc.integer({ min: 0, max: 50 });

  fcTest.prop(
    [referenceTrackIndexArb, fc.array(referenceSectionArb, { minLength: 1, maxLength: 5 }), comparisonResultArb],
    { numRuns: 100 },
  )(
    "dispatching CLEAR_REFERENCE resets reference fields to initial values; all other fields retain reference equality",
    (refIndex, refSections, compResult) => {
      const store = createStore();

      // Set up non-trivial state
      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
        createSection({ name: "Drop", startTime: 32, endTime: 96 }),
      ];
      const trackData = [
        createTrackData({ name: "Synth", type: "midi" }),
      ];
      const trackInventory = buildTrackInventory(trackData);
      store.dispatch({ type: "INIT", sections, trackInventory });
      store.dispatch({ type: "SET_GENRE", genreId: "trance" });
      store.dispatch({
        type: "UPDATE_ANALYSIS",
        sectionAnalysis: new Map([["s1", { activeTrackCount: 4, midiDensity: 6, hasAutomation: false, energyScore: 8 }]]),
        energyCurve: [8, 9],
      });

      // Set reference state with generated data (non-null)
      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: refIndex,
        referenceSections: refSections,
        comparisonResult: compResult,
      });

      // Confirm reference state is non-null before clearing
      const stateWithRef = store.getState();
      expect(stateWithRef.referenceTrackIndex).toBe(refIndex);
      expect(stateWithRef.referenceSections).toBe(refSections);
      expect(stateWithRef.comparisonResult).toBe(compResult);

      const stateBefore = store.getState();

      // Dispatch CLEAR_REFERENCE
      store.dispatch({ type: "CLEAR_REFERENCE" });

      const stateAfter = store.getState();

      // Reference fields are reset
      expect(stateAfter.referenceTrackIndex).toBeNull();
      expect(stateAfter.referenceSections).toEqual([]);
      expect(stateAfter.comparisonResult).toBeNull();

      // All non-reference fields retain reference equality (===)
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.alignmentScore).toBe(stateBefore.alignmentScore);
      expect(stateAfter.detectedArchetype).toBe(stateBefore.detectedArchetype);
      expect(stateAfter.issues).toBe(stateBefore.issues);
      expect(stateAfter.transitionRecommendations).toBe(stateBefore.transitionRecommendations);
      expect(stateAfter.notes).toBe(stateBefore.notes);
      expect(stateAfter.sectionChecklists).toBe(stateBefore.sectionChecklists);
      expect(stateAfter.persistenceAvailable).toBe(stateBefore.persistenceAvailable);
    },
  );
});


// ─── Feature: m7-reference-tracks, Unit Tests for Reference State Actions ──

/**
 * **Validates: Requirements 5.4, 5.7**
 *
 * Unit tests for UPDATE_REFERENCE and CLEAR_REFERENCE actions.
 * Tests cover:
 * - Initial state has null/empty reference fields
 * - UPDATE_REFERENCE sets reference fields correctly
 * - CLEAR_REFERENCE resets reference fields to initial values
 * - Subscriber notification on UPDATE_REFERENCE and CLEAR_REFERENCE
 * - Non-reference fields retain reference equality after reference actions
 */
describe("State Store — Reference Actions (M7)", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  // ─── Sample data ─────────────────────────────────────────────────────

  const sampleReferenceSections = [
    { label: "Intro", startTime: 0, endTime: 32, proportion: 0.25 },
    { label: "Verse", startTime: 32, endTime: 96, proportion: 0.5 },
    { label: "Outro", startTime: 96, endTime: 128, proportion: 0.25 },
  ];

  const sampleComparisonResult = {
    sectionDeltas: [
      {
        userLabel: "Intro",
        referenceLabel: "Intro",
        proportionDelta: 0.05,
        timingDelta: 0.0,
        durationDeltaBeats: 4,
        durationDeltaPercent: 12.5,
        matched: true,
        suggestion: "Your intro is slightly longer than the reference.",
      },
      {
        userLabel: "Verse",
        referenceLabel: "Verse",
        proportionDelta: -0.03,
        timingDelta: 0.02,
        durationDeltaBeats: -2,
        durationDeltaPercent: -3.1,
        matched: true,
        suggestion: null,
      },
    ],
    aggregateMetrics: {
      totalDurationDifference: 8,
      peakPositionDifference: 2.5,
      sectionCountDifference: 1,
    },
  };

  // ─── Initial State ───────────────────────────────────────────────────

  describe("Initial state — reference fields", () => {
    it("referenceTrackIndex is null on store creation", () => {
      const store = createStore();
      expect(store.getState().referenceTrackIndex).toBeNull();
    });

    it("referenceSections is an empty array on store creation", () => {
      const store = createStore();
      expect(store.getState().referenceSections).toEqual([]);
      expect(store.getState().referenceSections).toHaveLength(0);
    });

    it("comparisonResult is null on store creation", () => {
      const store = createStore();
      expect(store.getState().comparisonResult).toBeNull();
    });
  });

  // ─── UPDATE_REFERENCE ────────────────────────────────────────────────

  describe("UPDATE_REFERENCE", () => {
    it("sets referenceTrackIndex, referenceSections, and comparisonResult", () => {
      const store = createStore();

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 3,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      const state = store.getState();
      expect(state.referenceTrackIndex).toBe(3);
      expect(state.referenceSections).toEqual(sampleReferenceSections);
      expect(state.comparisonResult).toEqual(sampleComparisonResult);
    });

    it("accepts null referenceTrackIndex and null comparisonResult", () => {
      const store = createStore();

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: null,
        referenceSections: [],
        comparisonResult: null,
      });

      const state = store.getState();
      expect(state.referenceTrackIndex).toBeNull();
      expect(state.referenceSections).toEqual([]);
      expect(state.comparisonResult).toBeNull();
    });

    it("replaces previous reference state on subsequent dispatch", () => {
      const store = createStore();

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 2,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      const newSections = [
        { label: "Drop", startTime: 0, endTime: 64, proportion: 1.0 },
      ];

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 5,
        referenceSections: newSections,
        comparisonResult: null,
      });

      const state = store.getState();
      expect(state.referenceTrackIndex).toBe(5);
      expect(state.referenceSections).toEqual(newSections);
      expect(state.comparisonResult).toBeNull();
    });

    it("does not affect non-reference state fields (reference equality)", () => {
      const store = createStore();
      const sections = [createSection({ name: "Intro", startTime: 0, endTime: 32 })];
      const trackData = [createTrackData({ name: "Drums", type: "midi" })];
      const trackInventory = buildTrackInventory(trackData);
      store.dispatch({ type: "INIT", sections, trackInventory });
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const stateBefore = store.getState();

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 1,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      const stateAfter = store.getState();

      // All non-reference fields retain reference equality
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.alignmentScore).toBe(stateBefore.alignmentScore);
      expect(stateAfter.detectedArchetype).toBe(stateBefore.detectedArchetype);
      expect(stateAfter.issues).toBe(stateBefore.issues);
      expect(stateAfter.transitionRecommendations).toBe(stateBefore.transitionRecommendations);
      expect(stateAfter.notes).toBe(stateBefore.notes);
      expect(stateAfter.sectionChecklists).toBe(stateBefore.sectionChecklists);
      expect(stateAfter.persistenceAvailable).toBe(stateBefore.persistenceAvailable);
    });
  });

  // ─── CLEAR_REFERENCE ─────────────────────────────────────────────────

  describe("CLEAR_REFERENCE", () => {
    it("resets reference fields to initial values", () => {
      const store = createStore();

      // First set some reference data
      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 4,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      // Verify it was set
      expect(store.getState().referenceTrackIndex).toBe(4);
      expect(store.getState().referenceSections).toHaveLength(3);
      expect(store.getState().comparisonResult).not.toBeNull();

      // Clear
      store.dispatch({ type: "CLEAR_REFERENCE" });

      const state = store.getState();
      expect(state.referenceTrackIndex).toBeNull();
      expect(state.referenceSections).toEqual([]);
      expect(state.comparisonResult).toBeNull();
    });

    it("is a no-op on already-clear state (fields remain at initial values)", () => {
      const store = createStore();

      // State starts with null/empty reference fields
      store.dispatch({ type: "CLEAR_REFERENCE" });

      const state = store.getState();
      expect(state.referenceTrackIndex).toBeNull();
      expect(state.referenceSections).toEqual([]);
      expect(state.comparisonResult).toBeNull();
    });

    it("does not affect non-reference state fields (reference equality)", () => {
      const store = createStore();
      const sections = [createSection({ name: "Drop", startTime: 0, endTime: 64 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "trance" });

      // Set reference data first
      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 2,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      const stateBefore = store.getState();

      // Clear reference
      store.dispatch({ type: "CLEAR_REFERENCE" });

      const stateAfter = store.getState();

      // All non-reference fields retain reference equality
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.alignmentScore).toBe(stateBefore.alignmentScore);
      expect(stateAfter.detectedArchetype).toBe(stateBefore.detectedArchetype);
      expect(stateAfter.issues).toBe(stateBefore.issues);
      expect(stateAfter.transitionRecommendations).toBe(stateBefore.transitionRecommendations);
      expect(stateAfter.notes).toBe(stateBefore.notes);
      expect(stateAfter.sectionChecklists).toBe(stateBefore.sectionChecklists);
      expect(stateAfter.persistenceAvailable).toBe(stateBefore.persistenceAvailable);
    });
  });

  // ─── Subscriber Notification ─────────────────────────────────────────

  describe("Subscriber notification on reference actions", () => {
    it("notifies subscribers when UPDATE_REFERENCE is dispatched", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 1,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies subscribers when CLEAR_REFERENCE is dispatched", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({ type: "CLEAR_REFERENCE" });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies multiple subscribers on UPDATE_REFERENCE", () => {
      const store = createStore();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      store.subscribe(listener1);
      store.subscribe(listener2);

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 0,
        referenceSections: [],
        comparisonResult: null,
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("notifies multiple subscribers on CLEAR_REFERENCE", () => {
      const store = createStore();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      store.subscribe(listener1);
      store.subscribe(listener2);

      store.dispatch({ type: "CLEAR_REFERENCE" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribed listener is not notified on reference actions", () => {
      const store = createStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();

      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 1,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });
      store.dispatch({ type: "CLEAR_REFERENCE" });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── INIT resets reference fields ────────────────────────────────────

  describe("INIT resets reference fields", () => {
    it("clears reference state when INIT is dispatched", () => {
      const store = createStore();

      // Set reference data
      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: 3,
        referenceSections: sampleReferenceSections,
        comparisonResult: sampleComparisonResult,
      });

      // Verify set
      expect(store.getState().referenceTrackIndex).toBe(3);

      // INIT should reset reference fields
      store.dispatch({
        type: "INIT",
        sections: [createSection({ name: "NewIntro", startTime: 0, endTime: 16 })],
        trackInventory: [],
      });

      const state = store.getState();
      expect(state.referenceTrackIndex).toBeNull();
      expect(state.referenceSections).toEqual([]);
      expect(state.comparisonResult).toBeNull();
    });
  });
});


// ─── Feature: m8-polish, Task 7.5: SET_ANALYZING and UPDATE_DJ_SCORE tests ───

describe("State Store — M8 SET_ANALYZING and UPDATE_DJ_SCORE", () => {
  describe("SET_ANALYZING", () => {
    it("updates isAnalyzing to true", () => {
      const store = createStore();
      expect(store.getState().isAnalyzing).toBe(false);

      store.dispatch({ type: "SET_ANALYZING", analyzing: true });

      expect(store.getState().isAnalyzing).toBe(true);
    });

    it("updates isAnalyzing to false", () => {
      const store = createStore();
      store.dispatch({ type: "SET_ANALYZING", analyzing: true });
      expect(store.getState().isAnalyzing).toBe(true);

      store.dispatch({ type: "SET_ANALYZING", analyzing: false });

      expect(store.getState().isAnalyzing).toBe(false);
    });

    it("does not affect other state fields", () => {
      const store = createStore();
      const sections = [createSection({ name: "Intro", startTime: 0, endTime: 32 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      const stateBefore = store.getState();
      store.dispatch({ type: "SET_ANALYZING", analyzing: true });
      const stateAfter = store.getState();

      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.djScore).toBe(stateBefore.djScore);
    });
  });

  describe("UPDATE_DJ_SCORE", () => {
    it("stores the DJ score result", () => {
      const store = createStore();
      const djScore = {
        totalScore: 75,
        components: [
          { name: "Intro Length", score: 100, weight: 0.2, weighted: 20 },
          { name: "Outro Length", score: 50, weight: 0.2, weighted: 10 },
          { name: "Phrase Alignment", score: 80, weight: 0.2, weighted: 16 },
          { name: "Mix Zone Cleanliness", score: 100, weight: 0.15, weighted: 15 },
          { name: "Tempo Consistency", score: 100, weight: 0.15, weighted: 15 },
          { name: "Energy Positioning", score: 0, weight: 0.1, weighted: 0 },
        ],
        phraseIssues: [],
        applicable: true,
      };

      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore });

      const state = store.getState();
      expect(state.djScore).toEqual(djScore);
      expect(state.djScore!.totalScore).toBe(75);
      expect(state.djScore!.components).toHaveLength(6);
      expect(state.djScore!.applicable).toBe(true);
    });

    it("clears the score when dispatched with null", () => {
      const store = createStore();
      const djScore = {
        totalScore: 60,
        components: [],
        phraseIssues: [],
        applicable: true,
      };
      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore });
      expect(store.getState().djScore).not.toBeNull();

      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore: null });

      expect(store.getState().djScore).toBeNull();
    });

    it("does not affect other state fields", () => {
      const store = createStore();
      const sections = [createSection({ name: "Drop", startTime: 0, endTime: 64 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_ANALYZING", analyzing: true });

      const stateBefore = store.getState();
      store.dispatch({
        type: "UPDATE_DJ_SCORE",
        djScore: { totalScore: 80, components: [], phraseIssues: [], applicable: true },
      });
      const stateAfter = store.getState();

      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.isAnalyzing).toBe(stateBefore.isAnalyzing);
    });
  });

  describe("Initial state defaults for M8 fields", () => {
    it("isAnalyzing defaults to false", () => {
      const store = createStore();
      expect(store.getState().isAnalyzing).toBe(false);
    });

    it("djScore defaults to null", () => {
      const store = createStore();
      expect(store.getState().djScore).toBeNull();
    });
  });
});


// ─── Feature: m8-polish, Task 7.5: Unit tests for SET_ANALYZING and UPDATE_DJ_SCORE ───

/**
 * **Validates: Requirements 5.3, 7.1**
 *
 * Tests for SET_ANALYZING and UPDATE_DJ_SCORE reducer actions added in M8.
 */
describe("State Store — M8 SET_ANALYZING and UPDATE_DJ_SCORE", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  describe("SET_ANALYZING", () => {
    it("sets isAnalyzing to true when dispatched with analyzing: true", () => {
      const store = createStore();
      expect(store.getState().isAnalyzing).toBe(false);

      store.dispatch({ type: "SET_ANALYZING", analyzing: true });

      expect(store.getState().isAnalyzing).toBe(true);
    });

    it("sets isAnalyzing to false when dispatched with analyzing: false", () => {
      const store = createStore();

      // First set to true
      store.dispatch({ type: "SET_ANALYZING", analyzing: true });
      expect(store.getState().isAnalyzing).toBe(true);

      // Then set back to false
      store.dispatch({ type: "SET_ANALYZING", analyzing: false });
      expect(store.getState().isAnalyzing).toBe(false);
    });

    it("does not affect other state fields", () => {
      const store = createStore();
      const sections = [
        createSection({ name: "Intro", startTime: 0, endTime: 32 }),
      ];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const stateBefore = store.getState();

      store.dispatch({ type: "SET_ANALYZING", analyzing: true });

      const stateAfter = store.getState();
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.djScore).toBe(stateBefore.djScore);
    });

    it("notifies subscribers when SET_ANALYZING is dispatched", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({ type: "SET_ANALYZING", analyzing: true });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("UPDATE_DJ_SCORE", () => {
    it("stores the DJ score result when dispatched with a DjScoreResult", () => {
      const store = createStore();

      const djScore = {
        totalScore: 75,
        components: [
          { name: "Intro Length", score: 100, weight: 0.2, weighted: 20 },
          { name: "Outro Length", score: 50, weight: 0.2, weighted: 10 },
          { name: "Phrase Alignment", score: 80, weight: 0.2, weighted: 16 },
          { name: "Mix Zone Cleanliness", score: 100, weight: 0.15, weighted: 15 },
          { name: "Tempo Consistency", score: 100, weight: 0.15, weighted: 15 },
          { name: "Energy Positioning", score: 0, weight: 0.1, weighted: 0 },
        ],
        phraseIssues: [
          { sectionId: "sec-3", sectionName: "Bridge", startBar: 50, nearestBoundary: 49 },
        ],
        applicable: true,
      };

      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore });

      const state = store.getState();
      expect(state.djScore).toEqual(djScore);
      expect(state.djScore!.totalScore).toBe(75);
      expect(state.djScore!.components).toHaveLength(6);
      expect(state.djScore!.phraseIssues).toHaveLength(1);
      expect(state.djScore!.applicable).toBe(true);
    });

    it("clears the DJ score when dispatched with null", () => {
      const store = createStore();

      // First set a score
      const djScore = {
        totalScore: 50,
        components: [],
        phraseIssues: [],
        applicable: true,
      };
      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore });
      expect(store.getState().djScore).not.toBeNull();

      // Then clear it
      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore: null });
      expect(store.getState().djScore).toBeNull();
    });

    it("does not affect other state fields", () => {
      const store = createStore();
      const sections = [
        createSection({ name: "Drop", startTime: 0, endTime: 64 }),
      ];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "trance" });
      store.dispatch({ type: "SET_ANALYZING", analyzing: true });

      const stateBefore = store.getState();

      const djScore = {
        totalScore: 90,
        components: [],
        phraseIssues: [],
        applicable: true,
      };
      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore });

      const stateAfter = store.getState();
      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.isAnalyzing).toBe(stateBefore.isAnalyzing);
    });

    it("notifies subscribers when UPDATE_DJ_SCORE is dispatched", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({ type: "UPDATE_DJ_SCORE", djScore: null });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});


// ─── Feature: arrangement-score, Task 3.4: Store reducer unit tests ─────

/**
 * **Validates: Requirements 5.1, 5.2, 5.4, 5.5**
 *
 * Unit tests for the UPDATE_ARRANGEMENT_SCORE action and arrangementScore state field.
 */
describe("State Store — Arrangement Score", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  describe("Initial state", () => {
    it("arrangementScore is null by default", () => {
      const store = createStore();
      expect(store.getState().arrangementScore).toBeNull();
    });
  });

  describe("UPDATE_ARRANGEMENT_SCORE", () => {
    it("sets arrangementScore to a numeric value", () => {
      const store = createStore();
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 7 });
      expect(store.getState().arrangementScore).toBe(7);
    });

    it("sets arrangementScore to different valid scores (1–10)", () => {
      const store = createStore();

      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 1 });
      expect(store.getState().arrangementScore).toBe(1);

      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 10 });
      expect(store.getState().arrangementScore).toBe(10);

      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 5 });
      expect(store.getState().arrangementScore).toBe(5);
    });

    it("sets arrangementScore to null when dispatched with null", () => {
      const store = createStore();

      // First set a score
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 8 });
      expect(store.getState().arrangementScore).toBe(8);

      // Then set to null
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: null });
      expect(store.getState().arrangementScore).toBeNull();
    });

    it("does not affect other state fields", () => {
      const store = createStore();
      const sections = [createSection({ name: "Intro", startTime: 0, endTime: 32 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const stateBefore = store.getState();
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 9 });
      const stateAfter = store.getState();

      expect(stateAfter.sections).toBe(stateBefore.sections);
      expect(stateAfter.trackInventory).toBe(stateBefore.trackInventory);
      expect(stateAfter.activeSectionId).toBe(stateBefore.activeSectionId);
      expect(stateAfter.selectedGenreId).toBe(stateBefore.selectedGenreId);
      expect(stateAfter.sectionAnalysis).toBe(stateBefore.sectionAnalysis);
      expect(stateAfter.energyCurve).toBe(stateBefore.energyCurve);
      expect(stateAfter.djScore).toBe(stateBefore.djScore);
    });

    it("notifies subscribers when dispatched", () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 6 });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("INIT resets arrangementScore", () => {
    it("resets arrangementScore to null when INIT is dispatched", () => {
      const store = createStore();

      // Set a score first
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 9 });
      expect(store.getState().arrangementScore).toBe(9);

      // INIT should reset it to null
      const sections = [createSection({ name: "NewSection", startTime: 0, endTime: 64 })];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });

      expect(store.getState().arrangementScore).toBeNull();
    });

    it("resets arrangementScore to null even if it was previously a low score", () => {
      const store = createStore();

      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 2 });
      expect(store.getState().arrangementScore).toBe(2);

      store.dispatch({ type: "INIT", sections: [], trackInventory: [] });
      expect(store.getState().arrangementScore).toBeNull();
    });
  });

  describe("Unrelated actions do not affect arrangementScore", () => {
    it("UPDATE_PLAYHEAD does not change arrangementScore", () => {
      const store = createStore();
      const sections = [
        createSection({ id: "s-0", name: "Intro", startTime: 0, endTime: 32 }),
      ];
      store.dispatch({ type: "INIT", sections, trackInventory: [] });
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 7 });

      store.dispatch({ type: "UPDATE_PLAYHEAD", position: 16 });

      expect(store.getState().arrangementScore).toBe(7);
    });

    it("SET_GENRE does not change arrangementScore", () => {
      const store = createStore();
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 4 });

      store.dispatch({ type: "SET_GENRE", genreId: "house" });

      expect(store.getState().arrangementScore).toBe(4);
    });

    it("UPDATE_ANALYSIS does not change arrangementScore", () => {
      const store = createStore();
      store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: 10 });

      const sectionAnalysis = new Map<string, SectionAnalysisState>([
        ["section-0", { activeTrackCount: 3, midiDensity: 5.0, hasAutomation: true, energyScore: 8 }],
      ]);
      store.dispatch({ type: "UPDATE_ANALYSIS", sectionAnalysis, energyCurve: [8] });

      expect(store.getState().arrangementScore).toBe(10);
    });
  });
});
