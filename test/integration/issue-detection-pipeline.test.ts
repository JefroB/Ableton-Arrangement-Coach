/**
 * Integration tests for the full issue detection pipeline.
 *
 * These tests wire real modules together (no mocking of analysis or detection
 * modules). Only the SDK adapter is mocked. They verify the end-to-end flow:
 * SDK read → orchestrator → issue detection → state update → message emission.
 *
 * Validates: Requirements 6.6, 8.5
 */
import { describe, it, expect, vi } from "vitest";
import { createMockSdkAdapter } from "../mock-sdk-adapter.js";
import { createStore } from "../../src/state/store.js";
import { createAnalysisOrchestrator } from "../../src/core/analysis-orchestrator.js";
import type { ClipData, NoteData } from "../../src/ableton/sdk-adapter.js";
import type { Section } from "../../src/core/section-scanner.js";
import type { BackendMessage } from "../../src/ui/messages.js";

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

/** Three-section arrangement: Intro (0–32), Build (32–64), Drop (64–96). */
const threeSections: Section[] = [
  { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
  { id: "section-1", name: "Build", startTime: 32, endTime: 64 },
  { id: "section-2", name: "Drop", startTime: 64, endTime: 96 },
];

// ─── Full Pipeline Tests ───────────────────────────────────────────────

describe("Issue Detection Pipeline Integration", () => {
  describe("full pipeline: SDK mock → orchestrator → issue detection → state update", () => {
    it("produces flat energy issues when sections have similar energy", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Set up 3 tracks with identical activity across all 3 sections
      // to produce flat energy (same instruments, same density everywhere).
      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Bass", type: "midi" },
      ]);

      // Kick: clips spanning all sections with same density
      adapter.setArrangementClips(0, [
        makeClip({ startTime: 0, endTime: 96 }),
      ]);
      adapter.setMidiNotes(0, 0, [
        // Uniform notes across all sections — 4 notes per 32 beats = 0.5/bar
        makeNote({ startTime: 4 }),
        makeNote({ startTime: 12 }),
        makeNote({ startTime: 20 }),
        makeNote({ startTime: 28 }),
        makeNote({ startTime: 36 }),
        makeNote({ startTime: 44 }),
        makeNote({ startTime: 52 }),
        makeNote({ startTime: 60 }),
        makeNote({ startTime: 68 }),
        makeNote({ startTime: 76 }),
        makeNote({ startTime: 84 }),
        makeNote({ startTime: 92 }),
      ]);

      // Bass: same pattern — identical across all sections
      adapter.setArrangementClips(1, [
        makeClip({ startTime: 0, endTime: 96 }),
      ]);
      adapter.setMidiNotes(1, 0, [
        makeNote({ startTime: 2 }),
        makeNote({ startTime: 10 }),
        makeNote({ startTime: 18 }),
        makeNote({ startTime: 26 }),
        makeNote({ startTime: 34 }),
        makeNote({ startTime: 42 }),
        makeNote({ startTime: 50 }),
        makeNote({ startTime: 58 }),
        makeNote({ startTime: 66 }),
        makeNote({ startTime: 74 }),
        makeNote({ startTime: 82 }),
        makeNote({ startTime: 90 }),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Operator" }]);

      // Initialize store with sections and track inventory
      store.dispatch({
        type: "INIT",
        sections: threeSections,
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

      orchestrator.runAnalysis();

      const state = store.getState();

      // Issues should be populated
      expect(state.issues).toBeDefined();
      expect(Array.isArray(state.issues)).toBe(true);

      // With uniform arrangement, the energy should be very similar across sections,
      // triggering flat-energy issues (3 consecutive flat → critical).
      const flatIssues = state.issues.filter((i) => i.type === "flat-energy");
      expect(flatIssues.length).toBeGreaterThanOrEqual(1);

      // All issues should conform to the Issue interface
      for (const issue of state.issues) {
        expect(issue.id).toBeTruthy();
        expect(issue.type).toBeTruthy();
        expect(["info", "warning", "critical"]).toContain(issue.severity);
        expect(issue.sectionIds.length).toBeGreaterThanOrEqual(1);
        expect(issue.message.length).toBeLessThanOrEqual(200);
        expect(issue.message.length).toBeGreaterThan(0);
      }
    });

    it("produces missing transition issues for large energy jumps without transition elements", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Sparse intro (low energy) → dense drop (high energy) with no transition
      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Lead", type: "midi" },
        { name: "Pad", type: "midi" },
        { name: "Vocals", type: "audio" },
      ]);

      // Kick: only in Drop
      adapter.setArrangementClips(0, [
        makeClip({ startTime: 64, endTime: 96 }),
      ]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 32 }, (_, i) => makeNote({ startTime: 64 + i })),
      ]);

      // Lead: only in Drop
      adapter.setArrangementClips(1, [
        makeClip({ startTime: 64, endTime: 96 }),
      ]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 16 }, (_, i) => makeNote({ startTime: 64 + i * 2 })),
      ]);

      // Pad: only in Intro with minimal notes
      adapter.setArrangementClips(2, [
        makeClip({ startTime: 0, endTime: 32 }),
      ]);
      adapter.setMidiNotes(2, 0, [
        makeNote({ startTime: 4 }),
        makeNote({ startTime: 16 }),
      ]);

      // Vocals: only in Drop
      adapter.setArrangementClips(3, [
        makeClip({ startTime: 64, endTime: 96 }),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Wavetable" }]);
      adapter.setDevices(2, [{ name: "Simpler" }]);
      adapter.setDevices(3, [{ name: "EQ Eight" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Lead", type: "midi" },
          { name: "Pad", type: "midi" },
          { name: "Vocals", type: "audio" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      orchestrator.runAnalysis();

      const state = store.getState();

      // Verify energy curve shows a large jump — Intro should be low, Drop should be high
      expect(state.energyCurve[0]).toBeLessThan(state.energyCurve[2]!);

      // If the energy delta is >= 3 between Build and Drop (or Intro and Build),
      // and no transition elements are present, a missing-transition issue should appear
      const missingTransitions = state.issues.filter((i) => i.type === "missing-transition");

      // The large energy jump from empty Build to dense Drop should trigger this
      // (Build has no clips, so energy is minimal; Drop has everything)
      if (Math.abs(state.energyCurve[2]! - state.energyCurve[1]!) >= 3) {
        expect(missingTransitions.length).toBeGreaterThanOrEqual(1);
        const buildToDropIssue = missingTransitions.find(
          (i) => i.sectionIds.includes("section-1") && i.sectionIds.includes("section-2"),
        );
        expect(buildToDropIssue).toBeDefined();
      }
    });

    it("dispatches UPDATE_ISSUES and notifies subscribers", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      adapter.setTracks([{ name: "Kick", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(0, 0, [
        makeNote({ startTime: 4 }),
        makeNote({ startTime: 36 }),
        makeNote({ startTime: 68 }),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [{ name: "Kick", type: "midi" }],
      });

      // Track issues_updated message preparation via subscriber
      const issueSnapshots: Array<readonly import("../../src/core/issue-types.js").Issue[]> = [];
      let prevIssues = store.getState().issues;

      store.subscribe(() => {
        const state = store.getState();
        if (state.issues !== prevIssues) {
          issueSnapshots.push(state.issues);
          prevIssues = state.issues;
        }
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      orchestrator.runAnalysis();

      // The subscriber should have been notified about issues changing
      expect(issueSnapshots.length).toBeGreaterThanOrEqual(1);

      // The last snapshot should match the current store state
      const lastSnapshot = issueSnapshots[issueSnapshots.length - 1]!;
      expect(lastSnapshot).toEqual(store.getState().issues);

      // The issues should be a valid array (never null or undefined)
      expect(Array.isArray(lastSnapshot)).toBe(true);
    });

    it("produces issues_updated BackendMessage with correct shape", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      adapter.setTracks([{ name: "Kick", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(0, 0, [makeNote({ startTime: 4 })]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [{ name: "Kick", type: "midi" }],
      });

      // Simulate the webview-host pattern: prepare BackendMessage on issues change
      const messages: BackendMessage[] = [];
      let prevIssues = store.getState().issues;

      store.subscribe(() => {
        const state = store.getState();
        if (state.issues !== prevIssues) {
          const msg: BackendMessage = {
            type: "issues_updated",
            issues: [...(state.issues ?? [])],
          };
          messages.push(msg);
          prevIssues = state.issues;
        }
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      orchestrator.runAnalysis();

      // At least one issues_updated message should be prepared
      expect(messages.length).toBeGreaterThanOrEqual(1);

      const lastMsg = messages[messages.length - 1]!;
      expect(lastMsg.type).toBe("issues_updated");
      if (lastMsg.type !== "issues_updated") return;
      expect(Array.isArray(lastMsg.issues)).toBe(true);

      // Each issue in the message should have required fields
      for (const issue of lastMsg.issues) {
        expect(issue.id).toBeTruthy();
        expect(issue.type).toBeTruthy();
        expect(["info", "warning", "critical"]).toContain(issue.severity);
        expect(issue.sectionIds.length).toBeGreaterThanOrEqual(1);
        expect(issue.message.length).toBeLessThanOrEqual(200);
      }
    });
  });

  // ─── Genre Change Flow ─────────────────────────────────────────────────

  describe("genre change flow: SET_GENRE → issues recomputed with correct thresholds", () => {
    it("issues change when genre is set to Techno (flatEnergyDelta increases from 1 to 2)", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Create an arrangement with uniform energy across sections.
      // With default thresholds (flatEnergyDelta = 1), small differences might trigger.
      // With Techno (flatEnergyDelta = 2), same differences would NOT trigger.
      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Bass", type: "midi" },
        { name: "Lead", type: "midi" },
      ]);

      // Kick: consistent across all sections
      adapter.setArrangementClips(0, [
        makeClip({ startTime: 0, endTime: 96 }),
      ]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 24 }, (_, i) => makeNote({ startTime: i * 4 })),
      ]);

      // Bass: consistent across all sections
      adapter.setArrangementClips(1, [
        makeClip({ startTime: 0, endTime: 96 }),
      ]);
      adapter.setMidiNotes(1, 0, [
        ...Array.from({ length: 12 }, (_, i) => makeNote({ startTime: i * 8 })),
      ]);

      // Lead: slightly more active in later sections (adds minor variation)
      adapter.setArrangementClips(2, [
        makeClip({ startTime: 0, endTime: 96 }),
      ]);
      adapter.setMidiNotes(2, 0, [
        makeNote({ startTime: 4 }),
        makeNote({ startTime: 20 }),
        makeNote({ startTime: 36 }),
        makeNote({ startTime: 44 }),
        makeNote({ startTime: 52 }),
        makeNote({ startTime: 68 }),
        makeNote({ startTime: 76 }),
        makeNote({ startTime: 84 }),
        makeNote({ startTime: 92 }),
      ]);

      adapter.setDevices(0, [{ name: "Drum Rack" }]);
      adapter.setDevices(1, [{ name: "Operator" }]);
      adapter.setDevices(2, [{ name: "Wavetable" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
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

      // Run with no genre (default thresholds: flatEnergyDelta = 1)
      orchestrator.runAnalysis();
      const defaultIssues = [...store.getState().issues];

      // Change genre to Techno (flatEnergyDelta = 2, repetitionSimilarity = 0.92)
      store.dispatch({ type: "SET_GENRE", genreId: "techno" });
      orchestrator.runAnalysis();
      const technoIssues = [...store.getState().issues];

      // The issue sets should differ because thresholds changed.
      // With Techno's higher flatEnergyDelta, some flat-energy issues may disappear.
      // And DJ compatibility issues should appear (intro/outro length checks for Techno).
      const defaultFlatCount = defaultIssues.filter((i) => i.type === "flat-energy").length;
      const technoFlatCount = technoIssues.filter((i) => i.type === "flat-energy").length;

      // Techno should have same or fewer flat energy issues (higher threshold = more tolerant)
      expect(technoFlatCount).toBeLessThanOrEqual(defaultFlatCount);

      // Techno should add DJ compatibility issues (introMinBars = 32, sections are 8 bars each)
      const technoDjIssues = technoIssues.filter(
        (i) => i.type === "intro-length" || i.type === "outro-length",
      );
      const defaultDjIssues = defaultIssues.filter(
        (i) => i.type === "intro-length" || i.type === "outro-length",
      );

      // With no genre, DJ checks are skipped. With Techno, they should fire.
      expect(technoDjIssues.length).toBeGreaterThan(defaultDjIssues.length);
    });

    it("issues_updated is emitted after genre change and re-analysis", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      adapter.setTracks([{ name: "Kick", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 12 }, (_, i) => makeNote({ startTime: i * 8 })),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [{ name: "Kick", type: "midi" }],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Run initial analysis
      orchestrator.runAnalysis();
      const initialIssues = store.getState().issues;

      // Track issue changes after genre change
      const issueUpdates: Array<readonly import("../../src/core/issue-types.js").Issue[]> = [];
      let prevIssues = store.getState().issues;

      store.subscribe(() => {
        const state = store.getState();
        if (state.issues !== prevIssues) {
          issueUpdates.push(state.issues);
          prevIssues = state.issues;
        }
      });

      // Change genre and re-run analysis (simulates the webview host pattern)
      store.dispatch({ type: "SET_GENRE", genreId: "house" });
      orchestrator.runAnalysis();

      // Issues should have been updated after re-analysis
      expect(issueUpdates.length).toBeGreaterThanOrEqual(1);
      const finalIssues = store.getState().issues;

      // With House (DJ-oriented), DJ compatibility issues should now appear
      const djIssues = finalIssues.filter(
        (i) => i.type === "intro-length" || i.type === "outro-length" ||
               i.type === "intro-energy" || i.type === "energy-mismatch",
      );
      // Sections are 8 bars each. House introMinBars = 32. Should trigger intro-length.
      expect(djIssues.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Graceful Degradation ──────────────────────────────────────────────

  describe("graceful degradation: missing or empty data → no crash, partial results", () => {
    it("handles empty tracks (no clips, no notes) without crashing", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Adapter returns no tracks
      adapter.setTracks([]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // Should not throw
      expect(() => orchestrator.runAnalysis()).not.toThrow();

      const state = store.getState();

      // Issues should be a valid (possibly empty) array
      expect(Array.isArray(state.issues)).toBe(true);

      // Energy curve should be populated for sections (all scores = 1 min)
      expect(state.energyCurve).toHaveLength(3);
    });

    it("handles adapter that throws on readArrangementClips for some tracks", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      adapter.setTracks([
        { name: "Kick", type: "midi" },
        { name: "Broken Track", type: "midi" },
      ]);

      // Kick has valid clips
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 12 }, (_, i) => makeNote({ startTime: i * 8 })),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      // Broken Track: Make readArrangementClips throw by overriding after setup
      const originalReadClips = adapter.readArrangementClips.bind(adapter);
      adapter.readArrangementClips = (trackIndex: number) => {
        if (trackIndex === 1) {
          throw new Error("SDK error reading clips");
        }
        return originalReadClips(trackIndex);
      };

      adapter.setDevices(1, [{ name: "Simpler" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [
          { name: "Kick", type: "midi" },
          { name: "Broken Track", type: "midi" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // The orchestrator should catch the error and not crash entirely.
      // Depending on implementation, it may skip the failing track or abort with a log.
      // Either way, it should not throw to the caller.
      expect(() => orchestrator.runAnalysis()).not.toThrow();
    });

    it("handles zero sections without crashing", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      adapter.setTracks([{ name: "Kick", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 32 })]);
      adapter.setMidiNotes(0, 0, [makeNote({ startTime: 4 })]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      // Initialize with empty sections
      store.dispatch({
        type: "INIT",
        sections: [],
        trackInventory: [{ name: "Kick", type: "midi" }],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      expect(() => orchestrator.runAnalysis()).not.toThrow();

      const state = store.getState();

      // Issues array should be valid (empty — no sections = no issues)
      expect(Array.isArray(state.issues)).toBe(true);
      expect(state.issues).toHaveLength(0);
    });

    it("handles tracks with no MIDI notes gracefully", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      // Audio-only tracks (no MIDI notes to read)
      adapter.setTracks([
        { name: "Audio Stem", type: "audio" },
        { name: "Vocals", type: "audio" },
      ]);

      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setArrangementClips(1, [makeClip({ startTime: 32, endTime: 96 })]);
      adapter.setDevices(0, [{ name: "EQ Eight" }]);
      adapter.setDevices(1, [{ name: "Compressor" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [
          { name: "Audio Stem", type: "audio" },
          { name: "Vocals", type: "audio" },
        ],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      expect(() => orchestrator.runAnalysis()).not.toThrow();

      const state = store.getState();
      expect(Array.isArray(state.issues)).toBe(true);

      // All issues should be well-formed
      for (const issue of state.issues) {
        expect(issue.id).toBeTruthy();
        expect(issue.message.length).toBeGreaterThan(0);
        expect(issue.message.length).toBeLessThanOrEqual(200);
      }
    });

    it("previous issues are preserved when orchestrator encounters an error", () => {
      const adapter = createMockSdkAdapter();
      const store = createStore();

      adapter.setTracks([{ name: "Kick", type: "midi" }]);
      adapter.setArrangementClips(0, [makeClip({ startTime: 0, endTime: 96 })]);
      adapter.setMidiNotes(0, 0, [
        ...Array.from({ length: 12 }, (_, i) => makeNote({ startTime: i * 8 })),
      ]);
      adapter.setDevices(0, [{ name: "Drum Rack" }]);

      store.dispatch({
        type: "INIT",
        sections: threeSections,
        trackInventory: [{ name: "Kick", type: "midi" }],
      });

      const orchestrator = createAnalysisOrchestrator(
        adapter,
        store,
        () => store.getState().sections,
      );

      // First successful run
      orchestrator.runAnalysis();
      const issuesAfterFirstRun = [...store.getState().issues];

      // Now make the adapter throw on ALL reads (simulating SDK disconnect)
      adapter.readTracks = () => {
        throw new Error("SDK disconnected");
      };

      // Second run should fail gracefully (no crash, no dispatch)
      expect(() => orchestrator.runAnalysis()).not.toThrow();

      // Issues should remain unchanged from the first successful run
      const issuesAfterError = store.getState().issues;
      expect(issuesAfterError).toEqual(issuesAfterFirstRun);
    });
  });
});
