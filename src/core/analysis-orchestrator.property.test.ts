/**
 * Property-based tests for analysis orchestrator concurrency guard (M8 Polish & UX).
 *
 * Feature: m8-polish, Property 11: Concurrency guard prevents duplicate analysis runs
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import fc from "fast-check";
import { createAnalysisOrchestrator } from "./analysis-orchestrator.js";
import { createStore } from "../state/store.js";
import { createMockSdkAdapter } from "../../test/mock-sdk-adapter.js";
import type { Section } from "./section-scanner.js";
import type { BackendMessage } from "../ui/messages.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a concurrent call count between 1 and 20 (per task spec). */
const concurrentCallCountArb = fc.integer({ min: 1, max: 20 });

// ─── Helpers ───────────────────────────────────────────────────────────

const sections: Section[] = [
  { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
  { id: "section-1", name: "Drop", startTime: 32, endTime: 64 },
];

const getSections = () => sections;

/**
 * Create a minimal test setup with a mock adapter configured to run a
 * valid pipeline.
 */
function createTestSetup() {
  const store = createStore();
  const adapter = createMockSdkAdapter();

  adapter.setTracks([{ name: "Kick", type: "midi" }]);
  adapter.setArrangementClips(0, [
    { startTime: 0, endTime: 64, muted: false, hasEnvelopes: false },
  ]);
  adapter.setMidiNotes(0, 0, [
    { pitch: 60, startTime: 4, duration: 1, velocity: 100 },
  ]);
  adapter.setDevices(0, [{ name: "Drum Rack" }]);

  return { store, adapter };
}

// ─── Property 11: Concurrency guard prevents duplicate analysis runs ───

// Feature: m8-polish, Property 11: Concurrency guard prevents duplicate analysis runs
describe("Property 11: Concurrency guard prevents duplicate analysis runs", () => {
  /**
   * **Validates: Requirements 5.3, 5.6**
   *
   * For any N (1–20) concurrent runAnalysis() calls triggered re-entrantly
   * during pipeline execution, the pipeline body SHALL execute at most once.
   * Subsequent calls while isAnalyzing() returns true are dropped.
   *
   * Strategy: We track store dispatches of SET_ANALYZING with analyzing=true.
   * Each genuine pipeline entry dispatches SET_ANALYZING(true) exactly once.
   * If re-entrant calls bypassed the guard, we'd see multiple SET_ANALYZING(true)
   * dispatches.
   */
  test.prop([concurrentCallCountArb], { numRuns: 100 })(
    "N concurrent runAnalysis() calls result in pipeline executing at most once",
    (callCount) => {
      const { store, adapter } = createTestSetup();

      let orchestrator: ReturnType<typeof createAnalysisOrchestrator>;
      let hookFired = false;

      // Intercept readTracks to fire re-entrant calls during pipeline execution
      const originalReadTracks = adapter.readTracks.bind(adapter);
      adapter.readTracks = () => {
        if (!hookFired) {
          hookFired = true;
          // Attempt N re-entrant calls — all should be dropped by the guard
          for (let i = 0; i < callCount; i++) {
            orchestrator.runAnalysis();
          }
        }
        return originalReadTracks();
      };

      // Spy on store.dispatch to count SET_ANALYZING(true) dispatches
      const dispatchSpy = vi.spyOn(store, "dispatch");

      orchestrator = createAnalysisOrchestrator(adapter, store, getSections);
      orchestrator.runAnalysis();

      // Count how many times SET_ANALYZING with analyzing=true was dispatched
      const setAnalyzingTrueCalls = dispatchSpy.mock.calls.filter(
        ([action]) => action.type === "SET_ANALYZING" && (action as any).analyzing === true,
      );

      // Pipeline should have been entered exactly once
      expect(setAnalyzingTrueCalls.length).toBe(1);
    },
  );

  /**
   * **Validates: Requirements 5.3, 5.6**
   *
   * isAnalyzing() SHALL return true during pipeline execution and false after
   * completion, confirming the guard activates and resets correctly.
   */
  test.prop([concurrentCallCountArb], { numRuns: 100 })(
    "isAnalyzing() returns true during pipeline and false after completion",
    (callCount) => {
      const { store, adapter } = createTestSetup();

      let orchestrator: ReturnType<typeof createAnalysisOrchestrator>;
      let isAnalyzingDuringPipeline = false;
      let allReentrantCallsBlocked = true;
      let hookFired = false;

      const originalReadTracks = adapter.readTracks.bind(adapter);
      adapter.readTracks = () => {
        if (!hookFired) {
          hookFired = true;
          // Capture state during pipeline execution
          isAnalyzingDuringPipeline = orchestrator.isAnalyzing();

          // Attempt re-entrant calls and verify isAnalyzing blocks them
          for (let i = 0; i < callCount; i++) {
            if (!orchestrator.isAnalyzing()) {
              allReentrantCallsBlocked = false;
            }
            orchestrator.runAnalysis();
          }
        }
        return originalReadTracks();
      };

      orchestrator = createAnalysisOrchestrator(adapter, store, getSections);

      // Before analysis: isAnalyzing should be false
      expect(orchestrator.isAnalyzing()).toBe(false);

      orchestrator.runAnalysis();

      // During pipeline, isAnalyzing should have been true
      expect(isAnalyzingDuringPipeline).toBe(true);

      // All re-entrant calls should have seen isAnalyzing=true
      expect(allReentrantCallsBlocked).toBe(true);

      // After completion, isAnalyzing should be false
      expect(orchestrator.isAnalyzing()).toBe(false);
    },
  );

  /**
   * **Validates: Requirements 5.3, 5.6**
   *
   * After the pipeline completes and the guard resets, a new runAnalysis()
   * call SHALL trigger a fresh execution (the guard is not permanently locked).
   */
  test.prop([concurrentCallCountArb], { numRuns: 100 })(
    "after pipeline completes, a new call triggers a fresh execution",
    (callCount) => {
      const { store, adapter } = createTestSetup();

      let orchestrator: ReturnType<typeof createAnalysisOrchestrator>;
      let hookFired = false;

      const originalReadTracks = adapter.readTracks.bind(adapter);
      adapter.readTracks = () => {
        if (!hookFired) {
          hookFired = true;
          // Attempt N re-entrant calls — all dropped
          for (let i = 0; i < callCount; i++) {
            orchestrator.runAnalysis();
          }
        }
        return originalReadTracks();
      };

      const dispatchSpy = vi.spyOn(store, "dispatch");

      orchestrator = createAnalysisOrchestrator(adapter, store, getSections);

      // First call: pipeline runs, re-entrant calls dropped
      orchestrator.runAnalysis();

      const firstRunSetAnalyzing = dispatchSpy.mock.calls.filter(
        ([action]) => action.type === "SET_ANALYZING" && (action as any).analyzing === true,
      );
      expect(firstRunSetAnalyzing.length).toBe(1);

      // Guard should have reset
      expect(orchestrator.isAnalyzing()).toBe(false);

      // Change data to avoid cache hit
      adapter.setTracks([{ name: "Kick", type: "midi" }, { name: "Bass", type: "midi" }]);
      adapter.setArrangementClips(1, [
        { startTime: 0, endTime: 64, muted: false, hasEnvelopes: false },
      ]);
      adapter.setDevices(1, [{ name: "Analog" }]);

      // Second call should succeed (guard reset after first completed)
      orchestrator.runAnalysis();

      const allSetAnalyzingTrue = dispatchSpy.mock.calls.filter(
        ([action]) => action.type === "SET_ANALYZING" && (action as any).analyzing === true,
      );
      // Now should be 2 (first run + second run)
      expect(allSetAnalyzingTrue.length).toBe(2);
    },
  );
});
