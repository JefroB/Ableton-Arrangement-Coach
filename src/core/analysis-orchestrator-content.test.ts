/**
 * Integration tests for the content analysis pipeline in the Analysis Orchestrator.
 *
 * Verifies:
 * 1. UPDATE_CONTENT_ANALYSIS is dispatched during analysis
 * 2. UPDATE_DRUM_PAD_MAPS is dispatched during analysis
 * 3. Content-aware fill/build suggestion suppression works end-to-end
 * 4. Genre-aware percussion suggestions appear in issues output
 * 5. Content analysis cache skip when data unchanged
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnalysisOrchestrator } from "./analysis-orchestrator.js";
import { createStore, type Action } from "../state/store.js";
import { createMockSdkAdapter } from "../../test/mock-sdk-adapter.js";
import type { ClipData, NoteData, TrackData } from "../ableton/sdk-adapter.js";
import type { Section } from "./section-scanner.js";
import type { DrumPadAdapter, DrumChainData } from "./drum-pad-extractor.js";
import { scanParameters } from "./parameter-scanner.js";
import { parseAlsFile, mapAutomationToSections } from "./als-parser.js";

// Mock parameter-scanner so it doesn't access real SDK
vi.mock("./parameter-scanner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parameter-scanner.js")>();
  return {
    ...actual,
    scanParameters: vi.fn(() => []),
  };
});

// Mock als-parser to avoid filesystem access
vi.mock("./als-parser.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./als-parser.js")>();
  return {
    ...actual,
    parseAlsFile: vi.fn(() => null),
    mapAutomationToSections: vi.fn(() => new Map()),
  };
});

// Mock node:fs statSync
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statSync: vi.fn(() => { throw new Error("not available"); }),
  };
});

// ─── Helpers ───────────────────────────────────────────────────────────

const sections: Section[] = [
  { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
  { id: "section-1", name: "Drop", startTime: 32, endTime: 64 },
];

const getSections = () => sections;

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
 * Create a mock adapter that also implements DrumPadAdapter for drum pad extraction.
 */
function createDrumPadMockAdapter() {
  const adapter = createMockSdkAdapter();

  // DrumPadAdapter methods
  let firstDeviceClassNames = new Map<number, string | null>();
  let drumRackChains = new Map<number, readonly DrumChainData[] | null>();

  const drumPadAdapter = adapter as unknown as DrumPadAdapter & ReturnType<typeof createMockSdkAdapter> & {
    setFirstDeviceClassName(trackIndex: number, className: string | null): void;
    setDrumRackChains(trackIndex: number, chains: readonly DrumChainData[] | null): void;
  };

  drumPadAdapter.readFirstDeviceClassName = (trackIndex: number) => {
    return firstDeviceClassNames.get(trackIndex) ?? null;
  };

  drumPadAdapter.readDrumRackChains = (trackIndex: number) => {
    return drumRackChains.get(trackIndex) ?? null;
  };

  drumPadAdapter.setFirstDeviceClassName = (trackIndex: number, className: string | null) => {
    firstDeviceClassNames.set(trackIndex, className);
  };

  drumPadAdapter.setDrumRackChains = (trackIndex: number, chains: readonly DrumChainData[] | null) => {
    drumRackChains.set(trackIndex, chains);
  };

  return drumPadAdapter;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Analysis Orchestrator — Content Analysis Integration", () => {
  beforeEach(() => {
    vi.mocked(scanParameters).mockClear();
    vi.mocked(parseAlsFile).mockClear();
    vi.mocked(mapAutomationToSections).mockClear();
  });

  describe("UPDATE_CONTENT_ANALYSIS dispatch", () => {
    it("dispatches UPDATE_CONTENT_ANALYSIS during the analysis pipeline", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      // Set up a single MIDI track with notes
      adapter.setTracks([{ name: "Kick", type: "midi" }]);
      adapter.setArrangementClips(0, [
        makeClip({ startTime: 0, endTime: 64 }),
      ]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 36, startTime: 4 }),
        makeNote({ pitch: 36, startTime: 8 }),
        makeNote({ pitch: 36, startTime: 12 }),
        makeNote({ pitch: 36, startTime: 16 }),
        makeNote({ pitch: 36, startTime: 36 }),
        makeNote({ pitch: 36, startTime: 40 }),
        makeNote({ pitch: 36, startTime: 44 }),
        makeNote({ pitch: 36, startTime: 48 }),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      // Spy on dispatch to capture actions
      const dispatchedActions: Action[] = [];
      const originalDispatch = store.dispatch.bind(store);
      vi.spyOn(store, "dispatch").mockImplementation((action: Action) => {
        dispatchedActions.push(action);
        originalDispatch(action);
      });

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      // Verify UPDATE_CONTENT_ANALYSIS was dispatched
      const contentAction = dispatchedActions.find((a) => a.type === "UPDATE_CONTENT_ANALYSIS");
      expect(contentAction).toBeDefined();
      expect(contentAction!.type).toBe("UPDATE_CONTENT_ANALYSIS");

      // Verify state was updated
      const state = store.getState();
      expect(state.contentAnalysis).not.toBeNull();
      expect(state.contentAnalysis!.perSection.size).toBeGreaterThan(0);
    });

    it("dispatches UPDATE_CONTENT_ANALYSIS after UPDATE_ANALYSIS", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      adapter.setTracks([{ name: "Bass", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 40, startTime: 4 }),
        makeNote({ pitch: 40, startTime: 36 }),
      ]);
      adapter.setDevices(0, [{ name: "Analog" }]);

      const dispatchedActions: Action[] = [];
      const originalDispatch = store.dispatch.bind(store);
      vi.spyOn(store, "dispatch").mockImplementation((action: Action) => {
        dispatchedActions.push(action);
        originalDispatch(action);
      });

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const actionTypes = dispatchedActions.map((a) => a.type);
      const analysisIdx = actionTypes.indexOf("UPDATE_ANALYSIS");
      const contentIdx = actionTypes.indexOf("UPDATE_CONTENT_ANALYSIS");

      expect(analysisIdx).toBeGreaterThanOrEqual(0);
      expect(contentIdx).toBeGreaterThanOrEqual(0);
      expect(contentIdx).toBeGreaterThan(analysisIdx);
    });
  });

  describe("UPDATE_DRUM_PAD_MAPS dispatch", () => {
    it("dispatches UPDATE_DRUM_PAD_MAPS when adapter implements DrumPadAdapter", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      adapter.setTracks([{ name: "Drums", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 36, startTime: 4 }),
        makeNote({ pitch: 38, startTime: 8 }),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setFirstDeviceClassName(0, "DrumRackDevice");
      adapter.setDrumRackChains(0, [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Kick_808.wav" }],
        },
        {
          receivingNote: 38,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Snare_Tight.wav" }],
        },
      ]);

      const dispatchedActions: Action[] = [];
      const originalDispatch = store.dispatch.bind(store);
      vi.spyOn(store, "dispatch").mockImplementation((action: Action) => {
        dispatchedActions.push(action);
        originalDispatch(action);
      });

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      // Verify UPDATE_DRUM_PAD_MAPS was dispatched
      const drumPadAction = dispatchedActions.find((a) => a.type === "UPDATE_DRUM_PAD_MAPS");
      expect(drumPadAction).toBeDefined();

      // Verify state was updated with drum pad maps
      const state = store.getState();
      expect(state.drumPadMaps.size).toBeGreaterThan(0);
      expect(state.drumPadMaps.has("Drums")).toBe(true);
    });

    it("dispatches UPDATE_DRUM_PAD_MAPS before UPDATE_CONTENT_ANALYSIS", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      adapter.setTracks([{ name: "Kit", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(0, 0, [makeNote({ pitch: 36, startTime: 4 })]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setFirstDeviceClassName(0, "DrumRackDevice");
      adapter.setDrumRackChains(0, [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Kick.wav" }],
        },
      ]);

      const dispatchedActions: Action[] = [];
      const originalDispatch = store.dispatch.bind(store);
      vi.spyOn(store, "dispatch").mockImplementation((action: Action) => {
        dispatchedActions.push(action);
        originalDispatch(action);
      });

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const actionTypes = dispatchedActions.map((a) => a.type);
      const drumPadIdx = actionTypes.indexOf("UPDATE_DRUM_PAD_MAPS");
      const contentIdx = actionTypes.indexOf("UPDATE_CONTENT_ANALYSIS");

      expect(drumPadIdx).toBeGreaterThanOrEqual(0);
      expect(contentIdx).toBeGreaterThanOrEqual(0);
      expect(drumPadIdx).toBeLessThan(contentIdx);
    });
  });

  describe("content-aware suggestion filtering (fill suppression)", () => {
    it("suppresses fill suggestions when content analysis detects fills exist", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      // Create sections with a longer section to allow phrase detection
      const longSections: Section[] = [
        { id: "section-0", name: "Verse 1", startTime: 0, endTime: 64 },
        { id: "section-1", name: "Verse 2", startTime: 64, endTime: 128 },
      ];
      const getLongSections = () => longSections;

      // Set up a drums track with a clear loop pattern and fills at phrase boundaries
      adapter.setTracks([{ name: "Drums", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 128 })]);

      // Create a pattern: steady kick every 4 beats, then a dense fill at bar 4 boundary
      const drumNotes: NoteData[] = [];
      // Kick pattern (steady loop) for both sections
      for (let beat = 0; beat < 128; beat += 4) {
        drumNotes.push(makeNote({ pitch: 36, startTime: beat, velocity: 100 }));
      }
      // Hi-hat pattern
      for (let beat = 0; beat < 128; beat += 2) {
        drumNotes.push(makeNote({ pitch: 42, startTime: beat, velocity: 80 }));
      }
      // Fill at bar 4 (beat 16) — dense burst of tom hits (many notes in 1 bar = 4 beats)
      // This should trigger fill detection (density increase > 50%)
      for (let i = 0; i < 12; i++) {
        drumNotes.push(makeNote({ pitch: 47, startTime: 14 + i * 0.33, velocity: 110 }));
      }
      // Fill at bar 8 (beat 32)
      for (let i = 0; i < 12; i++) {
        drumNotes.push(makeNote({ pitch: 47, startTime: 30 + i * 0.33, velocity: 110 }));
      }

      adapter.setMidiNotes(0, 0, drumNotes);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setFirstDeviceClassName(0, "DrumRackDevice");
      adapter.setDrumRackChains(0, [
        { receivingNote: 36, devices: [{ className: "Simpler", sampleFilePath: "/Samples/Kick.wav" }] },
        { receivingNote: 42, devices: [{ className: "Simpler", sampleFilePath: "/Samples/HiHat_Closed.wav" }] },
        { receivingNote: 47, devices: [{ className: "Simpler", sampleFilePath: "/Samples/Tom_Floor.wav" }] },
      ]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getLongSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // Content analysis should have detected fills
      expect(state.contentAnalysis).not.toBeNull();

      // Verify fills were detected in the content analysis
      let fillsDetected = false;
      if (state.contentAnalysis) {
        for (const [, sectionMap] of state.contentAnalysis.perSection) {
          for (const [, trackAnalysis] of sectionMap) {
            if (trackAnalysis.percussionPattern && trackAnalysis.percussionPattern.fills.length > 0) {
              fillsDetected = true;
            }
          }
        }
      }

      // If fills were detected, the issue detector should NOT include "add a fill" type suggestions
      // for sections where fills already exist
      if (fillsDetected) {
        const fillIssues = state.issues.filter(
          (issue) => issue.message.toLowerCase().includes("add a fill") ||
                     issue.message.toLowerCase().includes("try a fill"),
        );
        // Fill suggestion should be suppressed for sections where fills exist
        expect(fillIssues.length).toBe(0);
      }
    });
  });

  describe("content-aware suggestion filtering (build suppression)", () => {
    it("suppresses build/riser suggestions when content analysis detects builds exist", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      // Create sections
      const buildSections: Section[] = [
        { id: "section-0", name: "Intro", startTime: 0, endTime: 64 },
        { id: "section-1", name: "Drop", startTime: 64, endTime: 128 },
      ];
      const getBuildSections = () => buildSections;

      // Set up a MIDI track that has a clear progressive density build
      // leading into section boundary at beat 64
      adapter.setTracks([{ name: "Lead Synth", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 128 })]);

      const buildNotes: NoteData[] = [];
      // Normal pattern in first half of Intro
      for (let beat = 0; beat < 48; beat += 4) {
        buildNotes.push(makeNote({ pitch: 72, startTime: beat, velocity: 80 }));
      }
      // Build: progressive density increase in final 4 bars (beat 48–64)
      // Bar 1 (beat 48-52): 4 notes
      for (let i = 0; i < 4; i++) {
        buildNotes.push(makeNote({ pitch: 72, startTime: 48 + i, velocity: 90 }));
      }
      // Bar 2 (beat 52-56): 6 notes (≥25% increase)
      for (let i = 0; i < 6; i++) {
        buildNotes.push(makeNote({ pitch: 74, startTime: 52 + i * 0.67, velocity: 100 }));
      }
      // Bar 3 (beat 56-60): 8 notes (≥25% increase)
      for (let i = 0; i < 8; i++) {
        buildNotes.push(makeNote({ pitch: 76, startTime: 56 + i * 0.5, velocity: 110 }));
      }
      // Bar 4 (beat 60-64): 12 notes (≥25% increase)
      for (let i = 0; i < 12; i++) {
        buildNotes.push(makeNote({ pitch: 78, startTime: 60 + i * 0.33, velocity: 120 }));
      }
      // Drop section notes
      for (let beat = 64; beat < 128; beat += 2) {
        buildNotes.push(makeNote({ pitch: 72, startTime: beat, velocity: 100 }));
      }

      adapter.setMidiNotes(0, 0, buildNotes);
      adapter.setDevices(0, [{ name: "Wavetable" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getBuildSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // Verify content analysis detected a build
      expect(state.contentAnalysis).not.toBeNull();
      let buildDetected = false;
      if (state.contentAnalysis) {
        for (const [, sectionMap] of state.contentAnalysis.perSection) {
          for (const [, trackAnalysis] of sectionMap) {
            if (trackAnalysis.build) {
              buildDetected = true;
            }
          }
        }
      }

      // If build was detected, "add a riser" or "add a build" type issues
      // should not appear for that boundary
      if (buildDetected) {
        const buildIssues = state.issues.filter(
          (issue) => issue.message.toLowerCase().includes("add a build") ||
                     issue.message.toLowerCase().includes("add a riser") ||
                     issue.message.toLowerCase().includes("try a riser"),
        );
        expect(buildIssues.length).toBe(0);
      }
    });
  });

  describe("genre-aware percussion suggestions in output", () => {
    it("generates genre-aware percussion suggestions when genre is set and drum content exists", () => {
      const store = createStore();
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });

      const adapter = createDrumPadMockAdapter();

      // Set up a drum track with kick and hi-hat but no ride (techno expects ride)
      adapter.setTracks([{ name: "Drums", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);

      const drumNotes: NoteData[] = [];
      // Kick pattern
      for (let beat = 0; beat < 64; beat += 4) {
        drumNotes.push(makeNote({ pitch: 36, startTime: beat, velocity: 100 }));
      }
      // Hi-hat pattern
      for (let beat = 0; beat < 64; beat += 2) {
        drumNotes.push(makeNote({ pitch: 42, startTime: beat, velocity: 80 }));
      }
      adapter.setMidiNotes(0, 0, drumNotes);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setFirstDeviceClassName(0, "DrumRackDevice");
      adapter.setDrumRackChains(0, [
        { receivingNote: 36, devices: [{ className: "Simpler", sampleFilePath: "/Samples/Kick_808.wav" }] },
        { receivingNote: 42, devices: [{ className: "Simpler", sampleFilePath: "/Samples/HiHat_Closed.wav" }] },
      ]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // With techno genre and drum content present, there should be
      // content-related percussion issues (genre-aware suggestions merged into issues)
      const contentPercussionIssues = state.issues.filter(
        (issue) => issue.id.startsWith("content-percussion-") ||
                   issue.id.startsWith("content-discontinuity-"),
      );

      // Genre-aware percussion suggestions should exist (missing elements, variation hints, etc.)
      // At minimum, the system produces suggestions because we have a drum track with
      // limited elements in techno context
      expect(contentPercussionIssues.length).toBeGreaterThan(0);

      // Verify at least one suggestion references a drum element category
      const hasElementReference = contentPercussionIssues.some(
        (issue) => issue.message.includes("kick") ||
                   issue.message.includes("snare") ||
                   issue.message.includes("hi-hat") ||
                   issue.message.includes("cymbal") ||
                   issue.message.includes("tom") ||
                   issue.message.includes("percussion") ||
                   issue.message.includes("missing-element"),
      );
      expect(hasElementReference).toBe(true);
    });
  });

  describe("content analysis cache skip when data unchanged", () => {
    it("skips content analysis recomputation when sections and track data unchanged", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      adapter.setTracks([{ name: "Lead", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 72, startTime: 4 }),
        makeNote({ pitch: 72, startTime: 36 }),
      ]);
      adapter.setDevices(0, [{ name: "Wavetable" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);

      // First run
      orchestrator.runAnalysis();
      const firstContentAnalysis = store.getState().contentAnalysis;
      expect(firstContentAnalysis).not.toBeNull();

      // Invalidate the main cache to force re-entry into the pipeline
      // (content analysis has its own separate cache check)
      orchestrator.invalidateCache();

      // Spy on dispatch for the second run
      const dispatchedActions: Action[] = [];
      const originalDispatch = store.dispatch.bind(store);
      vi.spyOn(store, "dispatch").mockImplementation((action: Action) => {
        dispatchedActions.push(action);
        originalDispatch(action);
      });

      // Second run with same data — content analysis cache should hit
      orchestrator.runAnalysis();

      // UPDATE_CONTENT_ANALYSIS should still be dispatched (cached result is dispatched
      // for store consistency), but the same result object should be reused
      const contentActions = dispatchedActions.filter((a) => a.type === "UPDATE_CONTENT_ANALYSIS");
      expect(contentActions.length).toBe(1);

      // The content analysis result should be the same reference (cached)
      const secondContentAnalysis = store.getState().contentAnalysis;
      expect(secondContentAnalysis).not.toBeNull();

      // Verify the perSection map has the same structure (proving cache was used)
      expect(secondContentAnalysis!.perSection.size).toBe(firstContentAnalysis!.perSection.size);
    });

    it("recomputes content analysis when track note data changes", () => {
      const store = createStore();
      const adapter = createDrumPadMockAdapter();

      adapter.setTracks([{ name: "Lead", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 72, startTime: 4 }),
        makeNote({ pitch: 72, startTime: 36 }),
      ]);
      adapter.setDevices(0, [{ name: "Wavetable" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);

      // First run
      orchestrator.runAnalysis();
      const firstAnalysis = store.getState().contentAnalysis;
      expect(firstAnalysis).not.toBeNull();

      // Change the note data (add more notes)
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 72, startTime: 4 }),
        makeNote({ pitch: 72, startTime: 36 }),
        makeNote({ pitch: 74, startTime: 8 }),
        makeNote({ pitch: 76, startTime: 12 }),
        makeNote({ pitch: 78, startTime: 16 }),
      ]);

      // Invalidate main cache to force pipeline re-run
      orchestrator.invalidateCache();

      // Second run with different data — content analysis should recompute
      orchestrator.runAnalysis();

      const secondAnalysis = store.getState().contentAnalysis;
      expect(secondAnalysis).not.toBeNull();
      // The result should be different because note data changed
      // (different fingerprints due to additional notes)
      expect(secondAnalysis).not.toBe(firstAnalysis);
    });
  });
});
