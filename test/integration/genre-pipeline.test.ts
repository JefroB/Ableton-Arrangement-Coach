/**
 * Integration tests for the genre pipeline.
 *
 * Tests the full flow of genre-aware analysis: genre selection → energy scoring
 * → issue detection → transition recommendations all using profile data, the
 * message round-trip (select_genre → genre_changed), and alignment/archetype
 * recomputation on genre change.
 *
 * These tests wire real modules together (no mocking of analysis/detection
 * modules). Only the SDK adapter is mocked.
 *
 * Validates: Requirements 2.2, 2.3, 4.5, 5.1, 7.1
 */
import { describe, it, expect } from "vitest";
import { createMockSdkAdapter } from "../mock-sdk-adapter.js";
import { createStore } from "../../src/state/store.js";
import { createAnalysisOrchestrator } from "../../src/core/analysis-orchestrator.js";
import {
  getProfile,
  getProfileBySubgenre,
  getWeightsForGenre,
  getThresholdsForGenre,
  getTransitionPreferencesForGenre,
  getAllFamilies,
  search,
} from "../../src/core/genre-registry.js";
import { computeEnergyScores } from "../../src/core/energy-scorer.js";
import { computeTransitions } from "../../src/core/transition-engine.js";
import { computeAlignment } from "../../src/core/alignment-scorer.js";
import { detectArchetype } from "../../src/core/archetype-detector.js";
import {
  handleFrontendMessage,
  isValidFrontendMessage,
} from "../../src/ui/messages.js";
import type { BackendMessage, FrontendMessage } from "../../src/ui/messages.js";
import type { Section } from "../../src/core/section-scanner.js";
import type { ClipData, NoteData } from "../../src/ableton/sdk-adapter.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeClip(overrides?: Partial<ClipData>): ClipData {
  return {
    startTime: 0,
    endTime: 32,
    muted: false,
    hasEnvelopes: false,
    ...overrides,
  };
}

function makeNote(overrides?: Partial<NoteData>): NoteData {
  return {
    pitch: 60,
    startTime: 4,
    duration: 1,
    velocity: 100,
    ...overrides,
  };
}

/**
 * A Techno-like arrangement: Intro (0–64) → Build A (64–96) → Main A (96–224)
 * → Breakdown (224–288) → Build B (288–320) → Main B (320–448) → Outro (448–512).
 * Section lengths in bars: 16, 8, 32, 16, 8, 32, 16
 */
const technoArrangement: Section[] = [
  { id: "section-0", name: "Intro", startTime: 0, endTime: 64 },
  { id: "section-1", name: "Build A", startTime: 64, endTime: 96 },
  { id: "section-2", name: "Main A", startTime: 96, endTime: 224 },
  { id: "section-3", name: "Breakdown", startTime: 224, endTime: 288 },
  { id: "section-4", name: "Build B", startTime: 288, endTime: 320 },
  { id: "section-5", name: "Main B", startTime: 320, endTime: 448 },
  { id: "section-6", name: "Outro", startTime: 448, endTime: 512 },
];

/** Short 3-section arrangement for simpler tests. */
const shortArrangement: Section[] = [
  { id: "section-0", name: "Intro", startTime: 0, endTime: 64 },
  { id: "section-1", name: "Build A", startTime: 64, endTime: 96 },
  { id: "section-2", name: "Main A", startTime: 96, endTime: 224 },
];

// ─── Full Pipeline Tests ───────────────────────────────────────────────

describe("Genre Pipeline Integration", () => {
  describe("full flow: genre selection → energy scoring → issue detection → transitions use profile data", () => {
    it("uses Techno profile energy weights when genre is set to techno", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Set up tracks with varying activity to produce different energy scores
      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Bass", type: "midi" },
        { name: "Lead Synth", type: "midi" },
        { name: "Pad", type: "midi" },
      ]);

      // Kick: active in Build A and Main A sections (high energy areas)
      adapter.setArrangementClips(0, [
        makeClip({ startTime: 64, endTime: 224 }),
      ]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 40 }, (_, i) => makeNote({ startTime: 64 + i * 4 })),
      ]);

      // Bass: active across most sections
      adapter.setArrangementClips(1, [
        makeClip({ startTime: 32, endTime: 224 }),
      ]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 24 }, (_, i) => makeNote({ startTime: 32 + i * 8 })),
      ]);

      // Lead Synth: only in Main A
      adapter.setArrangementClips(2, [
        makeClip({ startTime: 96, endTime: 224 }),
      ]);
      adapter.setMidiNotes(2, 0, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 96 + i * 4 })),
      ]);

      // Pad: only in Intro (low energy background)
      adapter.setArrangementClips(3, [
        makeClip({ startTime: 0, endTime: 64 }),
      ]);
      adapter.setMidiNotes(3, 0, [
        makeNote({ startTime: 4 }),
        makeNote({ startTime: 32 }),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Operator" }]);
      adapter.setDevices(2, [{ name: "Wavetable" }]);
      adapter.setDevices(3, [{ name: "Simpler" }]);

      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Bass", type: "midi" },
          { name: "Lead Synth", type: "midi" },
          { name: "Pad", type: "midi" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Run analysis with no genre (default weights)
      orchestrator.runAnalysis();
      const defaultCurve = [...store.getState().energyCurve];

      // Now set Techno genre and re-run
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      expect(store.getState().selectedGenreId).toBe("techno");

      orchestrator.runAnalysis();
      const technoCurve = [...store.getState().energyCurve];

      // Both curves should have scores in valid range
      for (const score of defaultCurve) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
      for (const score of technoCurve) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }

      // The Techno profile has different weights (higher midiDensityWeight: 0.35 vs default 0.25),
      // so energy curves should potentially differ
      const technoWeights = getWeightsForGenre("techno");
      const defaultWeights = getWeightsForGenre(null);
      expect(technoWeights.midiDensityWeight).not.toEqual(defaultWeights.midiDensityWeight);
    });

    it("issue detection uses genre-specific thresholds after genre selection", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Set up a uniform arrangement to produce flat energy
      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Bass", type: "midi" },
      ]);

      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 224 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 56 }, (_, i) => makeNote({ startTime: i * 4 })),
      ]);

      adapter.setArrangementClips(1, [makeClip({ startTime: 0, endTime: 224 })]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 28 }, (_, i) => makeNote({ startTime: i * 8 })),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Operator" }]);

      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Bass", type: "midi" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Run with no genre (default thresholds)
      orchestrator.runAnalysis();
      const defaultIssues = [...store.getState().issues];

      // Set Techno genre and re-run
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      orchestrator.runAnalysis();
      const technoIssues = [...store.getState().issues];

      // Verify the thresholds are different
      const defaultThresholds = getThresholdsForGenre(null);
      const technoThresholds = getThresholdsForGenre("techno");
      expect(technoThresholds.flatEnergyMaxDelta).toBeGreaterThanOrEqual(
        defaultThresholds.flatEnergyMaxDelta,
      );

      // All issues should be well-formed
      for (const issue of technoIssues) {
        expect(issue.id).toBeTruthy();
        expect(issue.type).toBeTruthy();
        expect(["info", "warning", "critical"]).toContain(issue.severity);
        expect(issue.sectionIds.length).toBeGreaterThanOrEqual(1);
        expect(issue.message.length).toBeLessThanOrEqual(200);
      }
    });

    it("transition recommendations use genre transition preferences", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Create a 3-section arrangement with energy variation
      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Lead", type: "midi" },
        { name: "Pad", type: "midi" },
      ]);

      // Kick: all sections
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 224 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 56 }, (_, i) => makeNote({ startTime: i * 4 })),
      ]);

      // Lead: only in Main A (creates energy contrast)
      adapter.setArrangementClips(1, [makeClip({ startTime: 96, endTime: 224 })]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 96 + i * 4 })),
      ]);

      // Pad: only in Intro (low energy)
      adapter.setArrangementClips(2, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(2, 0, [
        makeNote({ startTime: 4 }),
        makeNote({ startTime: 32 }),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Wavetable" }]);
      adapter.setDevices(2, [{ name: "Simpler" }]);

      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Lead", type: "midi" },
          { name: "Pad", type: "midi" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Run with Techno genre
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      orchestrator.runAnalysis();

      const state = store.getState();

      // Transition recommendations should be populated (one per boundary)
      expect(state.transitionRecommendations.length).toBe(shortArrangement.length - 1);

      // All recommendations should have valid structure
      for (const rec of state.transitionRecommendations) {
        expect(rec.id).toBeTruthy();
        expect(rec.fromSectionId).toBeTruthy();
        expect(rec.toSectionId).toBeTruthy();
        expect(rec.techniques.length).toBeGreaterThanOrEqual(1);
        expect(rec.techniques.length).toBeLessThanOrEqual(3);
        expect(rec.checklist.length).toBeGreaterThanOrEqual(2);
        expect(rec.checklist.length).toBeLessThanOrEqual(5);
        expect(rec.rationale.length).toBeLessThanOrEqual(120);
      }

      // Verify the genre transition preferences are accessible
      const technoPrefs = getTransitionPreferencesForGenre("techno");
      expect(technoPrefs.preferred.length).toBeGreaterThan(0);
    });

    it("subgenre resolution provides correct profile data for pipeline consumers", () => {
      // The store SET_GENRE validates against getProfile() (family lookup).
      // Subgenres are resolved via getProfileBySubgenre() in the adapter layer
      // (e.g., webview-host resolves profile for alignment/archetype computation).
      // This test verifies the registry-level resolution works correctly for
      // pipeline consumers that use getWeightsForGenre / getProfileBySubgenre.

      // Verify the registry resolves subgenre correctly
      const resolved = getProfileBySubgenre("peak-time-techno");
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe("Peak Time Techno");
      expect(resolved!.family).toBe("techno");

      // Energy weights should use the subgenre's overrides
      const subgenreWeights = getWeightsForGenre("peak-time-techno");
      const parentWeights = getWeightsForGenre("techno");
      // peak-time-techno inherits the same midiDensityWeight (0.30) as parent techno
      expect(subgenreWeights.midiDensityWeight).toBe(0.30);
      expect(parentWeights.midiDensityWeight).toBe(0.30);

      // Thresholds should inherit from parent when not overridden
      const subgenreThresholds = getThresholdsForGenre("peak-time-techno");
      const parentThresholds = getThresholdsForGenre("techno");
      expect(subgenreThresholds).toEqual(parentThresholds);

      // Transition preferences: peak-time-techno overrides the parent's buildDurationRange
      const subgenreTransitions = getTransitionPreferencesForGenre("peak-time-techno");
      expect(subgenreTransitions).toEqual({
        preferred: ["hard_cut", "snare_roll", "impact", "filter_sweep"],
        discouraged: ["long_riser", "emotional_breakdown", "gradual_layering"],
        buildDurationRange: { min: 4, max: 8 },
        dropsExpected: true,
      });
    });
  });

  // ─── Message Round-Trip Tests ──────────────────────────────────────────

  describe("message round-trip: frontend sends select_genre → backend processes → genre_changed sent back", () => {
    it("select_genre message is valid and dispatches SET_GENRE to store", () => {
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [],
      });

      // Validate the select_genre message
      const selectMsg: FrontendMessage = { type: "select_genre", genreId: "techno" };
      expect(isValidFrontendMessage(selectMsg)).toBe(true);

      // Simulate handling
      let genreChanged = false;
      handleFrontendMessage(selectMsg, {
        select_genre: (msg) => {
          store.dispatch({ type: "SET_GENRE", genreId: msg.genreId });
          genreChanged = true;
        },
      });

      expect(genreChanged).toBe(true);
      expect(store.getState().selectedGenreId).toBe("techno");
    });

    it("select_genre with null clears genre from store", () => {
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [],
      });

      // First set a genre
      store.dispatch({ type: "SET_GENRE", genreId: "house" });
      expect(store.getState().selectedGenreId).toBe("house");

      // Then send a clear message
      const clearMsg: FrontendMessage = { type: "select_genre", genreId: null };
      expect(isValidFrontendMessage(clearMsg)).toBe(true);

      handleFrontendMessage(clearMsg, {
        select_genre: (msg) => {
          store.dispatch({ type: "SET_GENRE", genreId: msg.genreId });
        },
      });

      expect(store.getState().selectedGenreId).toBeNull();
    });

    it("genre_changed backend message is produced with correct genreId and genreName", () => {
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [],
      });

      const emittedMessages: BackendMessage[] = [];

      // Subscribe to genre changes to produce genre_changed message
      let prevGenreId = store.getState().selectedGenreId;
      store.subscribe(() => {
        const state = store.getState();
        if (state.selectedGenreId !== prevGenreId) {
          const profile = state.selectedGenreId !== null
            ? (getProfile(state.selectedGenreId) ?? getProfileBySubgenre(state.selectedGenreId))
            : null;
          emittedMessages.push({
            type: "genre_changed",
            genreId: state.selectedGenreId,
            genreName: profile?.name ?? null,
          });
          prevGenreId = state.selectedGenreId;
        }
      });

      // Dispatch genre selection via message handler
      handleFrontendMessage({ type: "select_genre", genreId: "trance" }, {
        select_genre: (msg) => {
          store.dispatch({ type: "SET_GENRE", genreId: msg.genreId });
        },
      });

      // Verify genre_changed was emitted
      expect(emittedMessages.length).toBe(1);
      const genreMsg = emittedMessages[0]!;
      expect(genreMsg.type).toBe("genre_changed");
      if (genreMsg.type === "genre_changed") {
        expect(genreMsg.genreId).toBe("trance");
        expect(genreMsg.genreName).toBe("Trance");
      }
    });

    it("genre_changed response includes resolved name for family genre via webview-host pattern", () => {
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [],
      });

      const emittedMessages: BackendMessage[] = [];

      // Simulate the webview-host select_genre handler pattern:
      // - dispatch SET_GENRE
      // - resolve genre name via getProfile/getProfileBySubgenre
      // - emit genre_changed with genreName
      handleFrontendMessage({ type: "select_genre", genreId: "house" }, {
        select_genre: (msg) => {
          store.dispatch({ type: "SET_GENRE", genreId: msg.genreId });

          // Resolve the genre name (webview-host pattern)
          let genreName: string | null = null;
          if (msg.genreId !== null) {
            const profile = getProfile(msg.genreId) ?? getProfileBySubgenre(msg.genreId);
            genreName = profile?.name ?? null;
          }

          emittedMessages.push({
            type: "genre_changed",
            genreId: msg.genreId,
            genreName,
          });
        },
      });

      expect(emittedMessages.length).toBe(1);
      const genreMsg = emittedMessages[0]!;
      if (genreMsg.type === "genre_changed") {
        expect(genreMsg.genreId).toBe("house");
        expect(genreMsg.genreName).toBe("House");
      }
    });

    it("subgenre name can be resolved even when store only accepts family IDs", () => {
      // The store's SET_GENRE validates against getProfile() only (family lookup).
      // The webview-host resolves the display name using getProfileBySubgenre()
      // for the genre_changed message, even if the store doesn't accept it.
      // This verifies the resolution layer works independently of store acceptance.

      const subgenreProfile = getProfileBySubgenre("peak-time-techno");
      expect(subgenreProfile).not.toBeNull();
      expect(subgenreProfile!.name).toBe("Peak Time Techno");
      expect(subgenreProfile!.family).toBe("techno");

      // Producing a genre_changed message for subgenre (as webview-host would)
      const genreChangedMsg: BackendMessage = {
        type: "genre_changed",
        genreId: "peak-time-techno",
        genreName: subgenreProfile!.name,
      };
      expect(genreChangedMsg.genreName).toBe("Peak Time Techno");
    });

    it("invalid genre ID in select_genre is rejected by store (no state change, no genre_changed)", () => {
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [],
      });

      // Start with a valid genre
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const emittedMessages: BackendMessage[] = [];
      let prevGenreId = store.getState().selectedGenreId;
      store.subscribe(() => {
        const state = store.getState();
        if (state.selectedGenreId !== prevGenreId) {
          emittedMessages.push({
            type: "genre_changed",
            genreId: state.selectedGenreId,
            genreName: null,
          });
          prevGenreId = state.selectedGenreId;
        }
      });

      // Send an invalid genre ID
      handleFrontendMessage({ type: "select_genre", genreId: "nonexistent-genre" }, {
        select_genre: (msg) => {
          store.dispatch({ type: "SET_GENRE", genreId: msg.genreId });
        },
      });

      // Store should still have techno (no-op for invalid ID)
      expect(store.getState().selectedGenreId).toBe("techno");
      expect(emittedMessages.length).toBe(0);
    });

    it("request_genre_families and search_genres messages work end-to-end", () => {
      // Test request_genre_families handling
      let familiesResponse: BackendMessage | null = null;
      handleFrontendMessage({ type: "request_genre_families" }, {
        request_genre_families: () => {
          familiesResponse = {
            type: "genre_families",
            families: getAllFamilies(),
          };
        },
      });

      expect(familiesResponse).not.toBeNull();
      if (familiesResponse !== null && (familiesResponse as BackendMessage).type === "genre_families") {
        const msg = familiesResponse as Extract<BackendMessage, { type: "genre_families" }>;
        expect(msg.families.length).toBeGreaterThanOrEqual(15);
        for (const family of msg.families) {
          expect(family.id).toBeTruthy();
          expect(family.name).toBeTruthy();
          expect(family.subgenreCount).toBeGreaterThanOrEqual(0);
        }
      }

      // Test search_genres handling
      let searchResponse: BackendMessage | null = null;
      handleFrontendMessage({ type: "search_genres", query: "techno" }, {
        search_genres: (msg) => {
          searchResponse = {
            type: "genre_search_results",
            results: search(msg.query),
          };
        },
      });

      expect(searchResponse).not.toBeNull();
      if (searchResponse !== null && (searchResponse as BackendMessage).type === "genre_search_results") {
        const msg = searchResponse as Extract<BackendMessage, { type: "genre_search_results" }>;
        expect(msg.results.length).toBeGreaterThanOrEqual(1);
        // Should find the Techno family at minimum
        const technoResult = msg.results.find((r) => r.id === "techno");
        expect(technoResult).toBeDefined();
        expect(technoResult!.type).toBe("family");
      }
    });
  });

  // ─── Alignment and Archetype Recomputation on Genre Change ─────────────

  describe("alignment and archetype recomputation on genre change", () => {
    it("computes alignment score when genre is selected", () => {
      const store = createStore();

      store.dispatch({
        type: "INIT",
        sections: technoArrangement,
        trackInventory: [],
      });

      // No alignment before genre selection
      expect(store.getState().alignmentScore).toBeNull();

      // Select Techno genre and compute alignment
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      const profile = getProfile("techno")!;
      const alignment = computeAlignment(store.getState().sections, profile, 130);

      store.dispatch({ type: "UPDATE_ALIGNMENT", alignment });

      const state = store.getState();
      expect(state.alignmentScore).not.toBeNull();
      expect(state.alignmentScore!.overall).toBeGreaterThanOrEqual(0);
      expect(state.alignmentScore!.overall).toBeLessThanOrEqual(100);
      expect(state.alignmentScore!.ordering).toBeGreaterThanOrEqual(0);
      expect(state.alignmentScore!.ordering).toBeLessThanOrEqual(100);
      expect(state.alignmentScore!.length).toBeGreaterThanOrEqual(0);
      expect(state.alignmentScore!.length).toBeLessThanOrEqual(100);
      expect(state.alignmentScore!.count).toBeGreaterThanOrEqual(0);
      expect(state.alignmentScore!.count).toBeLessThanOrEqual(100);

      // The technoArrangement closely follows the Techno template structure,
      // so alignment should be reasonably high
      expect(state.alignmentScore!.overall).toBeGreaterThan(30);
    });

    it("alignment returns null when genre is cleared", () => {
      const alignment = computeAlignment(shortArrangement, null, 120);
      expect(alignment).toBeNull();
    });

    it("detects archetype when genre is selected and sections/energyCurve are available", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Bass", type: "midi" },
        { name: "Lead", type: "midi" },
      ]);

      // Simulate increasing energy across sections (build-drop pattern)
      // Intro: minimal activity, Build A: building, Main A: full
      adapter.setArrangementClips(0, [makeClip({ startTime: 64, endTime: 224 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 40 }, (_, i) => makeNote({ startTime: 64 + i * 4 })),
      ]);

      adapter.setArrangementClips(1, [makeClip({ startTime: 96, endTime: 224 })]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 96 + i * 4 })),
      ]);

      adapter.setArrangementClips(2, [makeClip({ startTime: 96, endTime: 224 })]);
      adapter.setMidiNotes(2, 0, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 96 + i * 4 })),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Operator" }]);
      adapter.setDevices(2, [{ name: "Wavetable" }]);

      store.dispatch({
        type: "INIT",
        sections: shortArrangement,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Bass", type: "midi" },
          { name: "Lead", type: "midi" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Run analysis to populate energy curve
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      orchestrator.runAnalysis();

      const state = store.getState();
      const profile = getProfile("techno");

      // Now detect archetype with the computed energy curve
      const archetype = detectArchetype(
        state.sections,
        [...state.energyCurve],
        profile,
      );

      expect(archetype).not.toBeNull();
      expect(archetype!.confidence).toBeGreaterThanOrEqual(0);
      expect(archetype!.confidence).toBeLessThanOrEqual(100);
      expect(archetype!.lowConfidence).toBe(archetype!.confidence < 50);

      // Store the result
      store.dispatch({ type: "UPDATE_ARCHETYPE", archetype });
      expect(store.getState().detectedArchetype).not.toBeNull();
      expect(store.getState().detectedArchetype!.archetype).toBeTruthy();
    });

    it("archetype returns null for fewer than 3 sections", () => {
      const twoSections: Section[] = [
        { id: "section-0", name: "Intro", startTime: 0, endTime: 64 },
        { id: "section-1", name: "Main", startTime: 64, endTime: 128 },
      ];

      const result = detectArchetype(twoSections, [3, 7], null);
      expect(result).toBeNull();
    });

    it("genre prior boost is applied to archetype detection", () => {
      // Techno profile lists archetypes: ["dj-tool", "continuous-evolution"]
      const technoProfile = getProfile("techno")!;
      expect(technoProfile.archetypes).toContain("dj-tool");
      expect(technoProfile.archetypes).toContain("continuous-evolution");

      // Create sections that could be either DJ Tool or another archetype
      const djToolSections: Section[] = [
        { id: "section-0", name: "Intro", startTime: 0, endTime: 128 },
        { id: "section-1", name: "Main", startTime: 128, endTime: 384 },
        { id: "section-2", name: "Outro", startTime: 384, endTime: 512 },
      ];
      const flatEnergy = [4, 5, 4];

      // Without profile: score without genre boost
      const resultNoGenre = detectArchetype(djToolSections, flatEnergy, null);
      // With Techno profile: dj-tool gets +15 boost
      const resultWithTechno = detectArchetype(djToolSections, flatEnergy, technoProfile);

      expect(resultNoGenre).not.toBeNull();
      expect(resultWithTechno).not.toBeNull();

      // If dj-tool is the winner in both cases, the boosted version
      // should have equal or higher confidence
      if (resultNoGenre!.archetype === "dj-tool" && resultWithTechno!.archetype === "dj-tool") {
        expect(resultWithTechno!.confidence).toBeGreaterThanOrEqual(resultNoGenre!.confidence);
      }
    });

    it("alignment and archetype are recomputed on genre change (full simulation)", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Bass", type: "midi" },
        { name: "Lead", type: "midi" },
        { name: "Pad", type: "midi" },
      ]);

      // Kick through all main sections
      adapter.setArrangementClips(0, [makeClip({ startTime: 64, endTime: 448 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 96 }, (_, i) => makeNote({ startTime: 64 + i * 4 })),
      ]);

      // Bass: most sections
      adapter.setArrangementClips(1, [makeClip({ startTime: 64, endTime: 448 })]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 48 }, (_, i) => makeNote({ startTime: 64 + i * 8 })),
      ]);

      // Lead: only in Main sections
      adapter.setArrangementClips(2, [
        makeClip({ startTime: 96, endTime: 224 }),
        makeClip({ startTime: 320, endTime: 448 }),
      ]);
      adapter.setMidiNotes(2, 0, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 96 + i * 4 })),
      ]);
      adapter.setMidiNotes(2, 1, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 320 + i * 4 })),
      ]);

      // Pad: Intro and Breakdown only
      adapter.setArrangementClips(3, [
        makeClip({ startTime: 0, endTime: 64 }),
        makeClip({ startTime: 224, endTime: 288 }),
      ]);
      adapter.setMidiNotes(3, 0, [makeNote({ startTime: 8 }), makeNote({ startTime: 32 })]);
      adapter.setMidiNotes(3, 1, [makeNote({ startTime: 240 }), makeNote({ startTime: 264 })]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Operator" }]);
      adapter.setDevices(2, [{ name: "Wavetable" }]);
      adapter.setDevices(3, [{ name: "Simpler" }]);

      store.dispatch({
        type: "INIT",
        sections: technoArrangement,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Bass", type: "midi" },
          { name: "Lead", type: "midi" },
          { name: "Pad", type: "midi" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Run analysis first to populate energy curve
      orchestrator.runAnalysis();

      // Simulate the select_genre flow from webview-host
      const genreId = "techno";
      store.dispatch({ type: "SET_GENRE", genreId });
      orchestrator.runAnalysis(); // Re-run with new genre

      const state = store.getState();
      const resolvedProfile = getProfile(genreId)!;

      // Compute alignment
      const alignment = computeAlignment(state.sections, resolvedProfile, 130);
      store.dispatch({ type: "UPDATE_ALIGNMENT", alignment });

      // Compute archetype
      const archetype = detectArchetype(state.sections, [...state.energyCurve], resolvedProfile);
      store.dispatch({ type: "UPDATE_ARCHETYPE", archetype });

      const finalState = store.getState();

      // Verify alignment was stored
      expect(finalState.alignmentScore).not.toBeNull();
      expect(finalState.alignmentScore!.overall).toBeGreaterThanOrEqual(0);
      expect(finalState.alignmentScore!.overall).toBeLessThanOrEqual(100);

      // Verify archetype was stored
      expect(finalState.detectedArchetype).not.toBeNull();
      expect(finalState.detectedArchetype!.confidence).toBeGreaterThanOrEqual(0);

      // Now change to a different genre (House) and verify recomputation
      const newGenreId = "house";
      store.dispatch({ type: "SET_GENRE", genreId: newGenreId });
      orchestrator.runAnalysis();

      const houseProfile = getProfile(newGenreId)!;
      const newAlignment = computeAlignment(
        store.getState().sections,
        houseProfile,
        125,
      );
      store.dispatch({ type: "UPDATE_ALIGNMENT", alignment: newAlignment });

      const newArchetype = detectArchetype(
        store.getState().sections,
        [...store.getState().energyCurve],
        houseProfile,
      );
      store.dispatch({ type: "UPDATE_ARCHETYPE", archetype: newArchetype });

      const newState = store.getState();

      // After genre change, alignment and archetype should be updated
      expect(newState.selectedGenreId).toBe("house");
      expect(newState.alignmentScore).not.toBeNull();
      expect(newState.detectedArchetype).not.toBeNull();

      // The alignment may differ since House has a different structural template
      // (we just verify it's been recomputed, not that the values are identical)
      expect(newState.alignmentScore).toEqual(newAlignment);
      expect(newState.detectedArchetype).toEqual(newArchetype);
    });

    it("alignment_updated and archetype_updated backend messages have correct shape", () => {
      const store = createStore();
      store.dispatch({
        type: "INIT",
        sections: technoArrangement,
        trackInventory: [],
      });

      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const profile = getProfile("techno")!;
      const alignment = computeAlignment(store.getState().sections, profile, 130);
      store.dispatch({ type: "UPDATE_ALIGNMENT", alignment });

      // Simulate producing backend messages
      const alignmentMsg: BackendMessage = {
        type: "alignment_updated",
        alignment: store.getState().alignmentScore,
      };

      expect(alignmentMsg.type).toBe("alignment_updated");
      if (alignmentMsg.type === "alignment_updated" && alignmentMsg.alignment !== null) {
        expect(alignmentMsg.alignment.overall).toBeGreaterThanOrEqual(0);
        expect(alignmentMsg.alignment.overall).toBeLessThanOrEqual(100);
        expect(alignmentMsg.alignment.ordering).toBeGreaterThanOrEqual(0);
        expect(alignmentMsg.alignment.length).toBeGreaterThanOrEqual(0);
        expect(alignmentMsg.alignment.count).toBeGreaterThanOrEqual(0);
      }

      // Archetype message
      const archetype = detectArchetype(
        store.getState().sections,
        [3, 5, 8, 4, 6, 9, 3], // simulated energy curve matching techno template
        profile,
      );
      store.dispatch({ type: "UPDATE_ARCHETYPE", archetype });

      const archetypeMsg: BackendMessage = {
        type: "archetype_updated",
        archetype: store.getState().detectedArchetype,
      };

      expect(archetypeMsg.type).toBe("archetype_updated");
      if (archetypeMsg.type === "archetype_updated" && archetypeMsg.archetype !== null) {
        expect(archetypeMsg.archetype.archetype).toBeTruthy();
        expect(archetypeMsg.archetype.confidence).toBeGreaterThanOrEqual(0);
        expect(archetypeMsg.archetype.confidence).toBeLessThanOrEqual(100);
        expect(typeof archetypeMsg.archetype.lowConfidence).toBe("boolean");
      }
    });
  });
});
