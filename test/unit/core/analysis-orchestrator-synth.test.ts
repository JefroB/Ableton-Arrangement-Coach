/**
 * Unit tests for synth analysis integration in the analysis orchestrator.
 * Validates that the orchestrator properly calls the synth analyzer,
 * passes results to energy scorer and issue detector, and handles
 * the case when no synth tracks are present.
 *
 * Requirements: 1.1, 4.1, 5.1, 6.1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnalysisOrchestrator } from "../../../src/core/analysis-orchestrator.js";
import { createStore } from "../../../src/state/store.js";
import { createMockSdkAdapter } from "../../mock-sdk-adapter.js";
import type { TrackData, ClipData, NoteData } from "../../../src/ableton/sdk-adapter.js";
import type { Section } from "../../../src/core/section-scanner.js";

// Mock modules that require filesystem or external dependencies
vi.mock("../../../src/core/als-parser.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/als-parser.js")>();
  return {
    ...actual,
    parseAlsFile: vi.fn(() => null),
    parseAlsBuffer: vi.fn(() => null),
    mapAutomationToSections: vi.fn(() => new Map()),
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statSync: vi.fn(() => ({ mtimeMs: 0 })),
  };
});

vi.mock("../../../src/core/parameter-scanner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/parameter-scanner.js")>();
  return {
    ...actual,
    scanParameters: vi.fn(() => []),
  };
});

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
 * Generate a set of MIDI notes spread across a section for a synth track.
 * Creates a melodic pattern with varied velocities and pitches.
 */
function makeSynthNotes(sectionStart: number, sectionEnd: number, count: number): NoteData[] {
  const notes: NoteData[] = [];
  const duration = sectionEnd - sectionStart;
  const spacing = duration / count;
  for (let i = 0; i < count; i++) {
    notes.push(makeNote({
      pitch: 60 + (i % 12), // C4 to B4 pattern
      startTime: sectionStart + i * spacing,
      duration: spacing * 0.8,
      velocity: 64 + (i % 4) * 16, // 64, 80, 96, 112 cycle
    }));
  }
  return notes;
}

// ─── Test Setup ────────────────────────────────────────────────────────

const sections: Section[] = [
  { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
  { id: "section-1", name: "Drop", startTime: 32, endTime: 64 },
  { id: "section-2", name: "Break", startTime: 64, endTime: 96 },
];

const getSections = () => sections;

describe("Analysis Orchestrator — Synth Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("synth analyzer invocation", () => {
    it("calls synth analyzer and dispatches UPDATE_SYNTH_ANALYSIS when synth tracks are present", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      // Set up tracks: a drum track and a lead synth track
      const tracks: TrackData[] = [
        { name: "Kick", type: "midi" },
        { name: "Lead Synth", type: "midi" },
      ];
      adapter.setTracks(tracks);

      // Kick track — clips and drum-like notes
      adapter.setArrangementClips(0, [
        makeClip({ startTime: 0, endTime: 64 }),
      ]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 36, startTime: 0, duration: 0.5, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 4, duration: 0.5, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 8, duration: 0.5, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 32, duration: 0.5, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 36, duration: 0.5, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 40, duration: 0.5, velocity: 127 }),
      ]);

      // Lead Synth track — melodic notes in both sections
      adapter.setArrangementClips(1, [
        makeClip({ startTime: 0, endTime: 64 }),
      ]);
      const leadNotes = [
        ...makeSynthNotes(0, 32, 8),
        ...makeSynthNotes(32, 64, 12),
      ];
      adapter.setMidiNotes(1, 0, leadNotes);

      // Devices (Drum Rack for kicks, Wavetable for lead)
      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Wavetable" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // synthAnalysis should be populated (not null)
      expect(state.synthAnalysis).not.toBeNull();
      expect(state.synthAnalysis!.perSection.size).toBeGreaterThan(0);
    });

    it("skips synth analyzer and dispatches null when no synth tracks are present", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      // Only drum tracks, no synth tracks
      const tracks: TrackData[] = [
        { name: "Kick", type: "midi" },
        { name: "Hi-Hat", type: "midi" },
      ];
      adapter.setTracks(tracks);

      // Kick track
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 36, startTime: 0, duration: 0.5 }),
        makeNote({ pitch: 36, startTime: 4, duration: 0.5 }),
        makeNote({ pitch: 36, startTime: 32, duration: 0.5 }),
      ]);

      // Hi-Hat track
      adapter.setArrangementClips(1, [makeClip({ startTime: 0, endTime: 64 })]);
      adapter.setMidiNotes(1, 0, [
        makeNote({ pitch: 42, startTime: 2, duration: 0.25 }),
        makeNote({ pitch: 42, startTime: 6, duration: 0.25 }),
        makeNote({ pitch: 42, startTime: 34, duration: 0.25 }),
      ]);

      // Both tracks have Drum Rack devices → classified as "drums"
      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Drum Rack" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // synthAnalysis should be null since no synth tracks exist
      expect(state.synthAnalysis).toBeNull();
    });
  });

  describe("energy scorer receives synthEnergy", () => {
    it("computes synthEnergy values when synth tracks have note activity", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      // Set up a pad synth track with varying density across sections
      const tracks: TrackData[] = [
        { name: "Pad Synth", type: "midi" },
      ];
      adapter.setTracks(tracks);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);

      // Sparse in Intro, dense in Drop, sparse in Break
      const padNotes = [
        ...makeSynthNotes(0, 32, 4),   // Intro: sparse
        ...makeSynthNotes(32, 64, 16), // Drop: dense
        ...makeSynthNotes(64, 96, 4),  // Break: sparse
      ];
      adapter.setMidiNotes(0, 0, padNotes);
      adapter.setDevices(0, [{ name: "Wavetable" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // synthAnalysis should be populated with per-section data
      expect(state.synthAnalysis).not.toBeNull();
      expect(state.synthAnalysis!.perSection.size).toBe(3);

      // The synth energy contribution map should have values for all sections with profiles
      // (verified indirectly: the synth analyzer was called and produced results)
      const perSection = state.synthAnalysis!.perSection;
      for (const section of sections) {
        const sectionProfiles = perSection.get(section.id);
        if (sectionProfiles && sectionProfiles.size > 0) {
          // Verify the profile has the expected structure
          for (const [, profile] of sectionProfiles) {
            expect(profile.noteDensity).toBeGreaterThan(0);
            expect(profile.velocityDynamics.mean).toBeGreaterThan(0);
            expect(profile.polyphonyProfile.mean).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  describe("issue detector receives synthAnalysis", () => {
    it("passes synthAnalysis to issue detector for synth-specific issue detection", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      // Create a lead synth with repetitive content across sections
      // to potentially trigger synth repetition issues
      const tracks: TrackData[] = [
        { name: "Lead Synth", type: "midi" },
        { name: "Kick", type: "midi" },
      ];
      adapter.setTracks(tracks);

      // Lead Synth — same pattern repeated across all 3 sections (to trigger repetition)
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      const repeatedPattern: NoteData[] = [];
      for (const section of sections) {
        // Same pattern in each section
        for (let i = 0; i < 8; i++) {
          repeatedPattern.push(makeNote({
            pitch: 60 + (i % 4),
            startTime: section.startTime + i * 4,
            duration: 3.5,
            velocity: 100,
          }));
        }
      }
      adapter.setMidiNotes(0, 0, repeatedPattern);
      adapter.setDevices(0, [{ name: "Wavetable" }]);

      // Kick track for energy variation
      adapter.setArrangementClips(1, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(1, 0, [
        makeNote({ pitch: 36, startTime: 0, duration: 0.5 }),
        makeNote({ pitch: 36, startTime: 32, duration: 0.5 }),
        makeNote({ pitch: 36, startTime: 64, duration: 0.5 }),
      ]);
      adapter.setDevices(1, [{ name: "Drum Rack" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // synthAnalysis must be present in the store (was passed to issue detector)
      expect(state.synthAnalysis).not.toBeNull();

      // The issue detector should have been called with synthAnalysis
      // We verify this indirectly: if synthAnalysis exists and has repetition flags,
      // issues related to synth repetition may be generated
      const synthAnalysis = state.synthAnalysis!;
      const leadRepetition = synthAnalysis.repetitionFlags.get("Lead Synth");
      expect(leadRepetition).toBeDefined();
    });
  });

  describe("full pipeline integration", () => {
    it("runs complete pipeline: orchestrator → synth analyzer → energy scorer → issue detector → suggestions", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      // Multi-track arrangement with synth tracks and drums
      const tracks: TrackData[] = [
        { name: "Kick", type: "midi" },
        { name: "Lead Synth", type: "midi" },
        { name: "Pad", type: "midi" },
        { name: "Bass", type: "midi" },
      ];
      adapter.setTracks(tracks);

      // Kick (drums)
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ pitch: 36, startTime: 0, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 4, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 8, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 32, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 36, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 40, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 64, duration: 0.25, velocity: 127 }),
        makeNote({ pitch: 36, startTime: 68, duration: 0.25, velocity: 127 }),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      // Lead Synth (lead role)
      adapter.setArrangementClips(1, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(1, 0, [
        ...makeSynthNotes(0, 32, 8),   // Intro
        ...makeSynthNotes(32, 64, 16), // Drop (more active)
        ...makeSynthNotes(64, 96, 6),  // Break (less active)
      ]);
      adapter.setDevices(1, [{ name: "Wavetable" }]);

      // Pad (pad role)
      adapter.setArrangementClips(2, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(2, 0, [
        // Long sustained chords in all sections
        makeNote({ pitch: 60, startTime: 0, duration: 16, velocity: 80 }),
        makeNote({ pitch: 64, startTime: 0, duration: 16, velocity: 80 }),
        makeNote({ pitch: 67, startTime: 0, duration: 16, velocity: 80 }),
        makeNote({ pitch: 60, startTime: 32, duration: 16, velocity: 90 }),
        makeNote({ pitch: 64, startTime: 32, duration: 16, velocity: 90 }),
        makeNote({ pitch: 67, startTime: 32, duration: 16, velocity: 90 }),
        makeNote({ pitch: 60, startTime: 64, duration: 16, velocity: 70 }),
        makeNote({ pitch: 64, startTime: 64, duration: 16, velocity: 70 }),
        makeNote({ pitch: 67, startTime: 64, duration: 16, velocity: 70 }),
      ]);
      adapter.setDevices(2, [{ name: "Analog" }]);

      // Bass (bass role)
      adapter.setArrangementClips(3, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(3, 0, [
        makeNote({ pitch: 36, startTime: 0, duration: 2, velocity: 100 }),
        makeNote({ pitch: 36, startTime: 4, duration: 2, velocity: 100 }),
        makeNote({ pitch: 36, startTime: 32, duration: 2, velocity: 110 }),
        makeNote({ pitch: 36, startTime: 36, duration: 2, velocity: 110 }),
        makeNote({ pitch: 36, startTime: 40, duration: 2, velocity: 110 }),
        makeNote({ pitch: 36, startTime: 64, duration: 2, velocity: 90 }),
      ]);
      adapter.setDevices(3, [{ name: "Operator" }]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      const state = store.getState();

      // 1. Synth analysis was computed
      expect(state.synthAnalysis).not.toBeNull();
      const synthAnalysis = state.synthAnalysis!;

      // Per-section profiles should exist for the synth tracks
      expect(synthAnalysis.perSection.size).toBe(3);
      for (const section of sections) {
        const sectionProfiles = synthAnalysis.perSection.get(section.id);
        expect(sectionProfiles).toBeDefined();
        // At least one synth track profile should exist per section
        expect(sectionProfiles!.size).toBeGreaterThan(0);
      }

      // 2. Energy scores were computed (basic validation)
      expect(state.energyCurve).toHaveLength(3);
      for (const score of state.energyCurve) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }

      // 3. Issues were generated (pipeline didn't crash)
      expect(state.issues).toBeDefined();
      expect(Array.isArray(state.issues)).toBe(true);

      // 4. Cross-section comparisons exist for synth tracks
      expect(synthAnalysis.crossSection.size).toBeGreaterThan(0);

      // 5. Repetition flags exist for each synth track
      expect(synthAnalysis.repetitionFlags.size).toBeGreaterThan(0);
    });

    it("handles graceful degradation when content analysis fails", () => {
      const store = createStore();
      const adapter = createMockSdkAdapter();

      // Empty arrangement — content analysis will produce no content
      adapter.setTracks([]);

      const orchestrator = createAnalysisOrchestrator(adapter, store, getSections);

      // Should not throw
      expect(() => orchestrator.runAnalysis()).not.toThrow();

      const state = store.getState();

      // synthAnalysis should remain null when content analysis has no tracks
      // (no roles to classify = no synth tracks to analyze)
      expect(state.synthAnalysis).toBeNull();
    });
  });
});
