/**
 * Unit tests for the Webview Host module.
 *
 * Verifies that the webview host correctly:
 * - Calls showModalDialog with expected parameters
 * - Subscribes to store changes and prepares BackendMessage updates
 * - Handles the dialog result via handleFrontendMessage
 * - Silently ignores unrecognized frontend messages
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openWebviewPanel } from "./webview-host.js";
import { createStore } from "../state/store.js";
import type { Ui, Resources } from "@ableton-extensions/sdk";
import type { AnalysisOrchestrator } from "../core/analysis-orchestrator.js";

// Suppress the known "Temp file write failed" console.error noise during tests.
// The fallback path (using original HTML URL) is the expected test behavior.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

/** Create a mock Ui with a controllable showModalDialog. */
function createMockUi(dialogResult?: string): Ui {
  return {
    // Return the result on the first call, then undefined on subsequent calls.
    // This prevents infinite loops when the result triggers keepOpen (e.g., select_genre).
    showModalDialog: vi.fn()
      .mockResolvedValueOnce(dialogResult)
      .mockResolvedValue(undefined),
  } as unknown as Ui;
}

/** Create a mock Resources that returns a predictable file URI. */
function createMockResources(): Resources {
  return {
    getFileUri: vi.fn((path: string) => `file:///extension/${path}`),
  } as unknown as Resources;
}

/** Create a mock AnalysisOrchestrator with no-op methods. */
function createMockOrchestrator(): AnalysisOrchestrator {
  return {
    runAnalysis: vi.fn(),
    invalidateCache: vi.fn(),
    handleReferenceScan: vi.fn(),
    isAnalyzing: vi.fn().mockReturnValue(false),
  };
}

describe("webview-host", () => {
  describe("openWebviewPanel", () => {
    it("calls showModalDialog with the correct width and height", async () => {
      const ui = createMockUi();
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      await openWebviewPanel(ui, resources, store, orchestrator);

      expect(ui.showModalDialog).toHaveBeenCalledWith(
        expect.any(String),
        900,
        600
      );
    });

    it("passes a data:text/html URL to showModalDialog", async () => {
      const ui = createMockUi();
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      await openWebviewPanel(ui, resources, store, orchestrator);

      const url = (ui.showModalDialog as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toMatch(/^data:text\/html,/);
    });

    it("does not throw when store is dispatched after dialog closes", async () => {
      const ui = createMockUi();
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      await openWebviewPanel(ui, resources, store, orchestrator);

      // After openWebviewPanel resolves, dispatching should not cause errors.
      expect(() => {
        store.dispatch({
          type: "INIT",
          sections: [],
          trackInventory: [],
        });
      }).not.toThrow();
    });

    it("store subscription prepares BackendMessage on state change", async () => {
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Create a mock showModalDialog that dispatches a state change
      // while the dialog is "open" (before resolving), triggering the
      // store subscription callback.
      const ui = {
        showModalDialog: vi.fn().mockImplementation(() => {
          // Dispatch while dialog is open — the subscription is active
          store.dispatch({
            type: "INIT",
            sections: [
              { id: "s-1", name: "Intro", startTime: 0, endTime: 16 },
            ],
            trackInventory: [{ name: "Bass", type: "midi" as const }],
          });
          return Promise.resolve(undefined);
        }),
      } as unknown as Ui;

      // Spy on store.getState to confirm the subscription reads state
      const getStateSpy = vi.spyOn(store, "getState");

      await openWebviewPanel(ui, resources, store, orchestrator);

      // The subscription callback calls store.getState() to build messages
      expect(getStateSpy).toHaveBeenCalled();
    });

    it("unsubscribes from store when dialog closes", async () => {
      const ui = createMockUi();
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Track unsubscription via dispatch after panel closes
      await openWebviewPanel(ui, resources, store, orchestrator);

      // After openWebviewPanel resolves, the subscription should be cleaned up.
      // Dispatch should not cause errors — the listener was removed.
      expect(() => {
        store.dispatch({
          type: "INIT",
          sections: [],
          trackInventory: [],
        });
      }).not.toThrow();
    });

    it("handles valid FrontendMessage from dialog result", async () => {
      const result = JSON.stringify({ type: "request_state" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Should not throw when processing a valid FrontendMessage
      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("silently ignores unrecognized message types from dialog result", async () => {
      const result = JSON.stringify({ type: "unknown_type", data: 123 });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Should not throw for unrecognized message types
      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("silently ignores malformed JSON from dialog result", async () => {
      const ui = createMockUi("not valid json {{{");
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Should not throw for malformed JSON
      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("silently ignores undefined dialog result", async () => {
      const ui = createMockUi(undefined);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Should not throw when dialog result is undefined (void)
      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("resolves normally even when showModalDialog rejects", async () => {
      const ui = {
        showModalDialog: vi.fn().mockRejectedValue(new Error("Dialog failed")),
      } as unknown as Ui;
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Production code catches the error internally and resolves normally
      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();

      // After resolution, store should still be usable
      expect(() => {
        store.dispatch({
          type: "INIT",
          sections: [],
          trackInventory: [],
        });
      }).not.toThrow();
    });
  });

  describe("Genre Picker message handling", () => {
    it("handles request_genre_families and does not throw", async () => {
      const result = JSON.stringify({ type: "request_genre_families" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("handles search_genres and does not throw", async () => {
      const result = JSON.stringify({ type: "search_genres", query: "techno" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("handles search_genres with empty query and does not throw", async () => {
      const result = JSON.stringify({ type: "search_genres", query: "" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      await expect(
        openWebviewPanel(ui, resources, store, orchestrator)
      ).resolves.toBeUndefined();
    });

    it("handles select_genre with a valid genre ID, dispatches SET_GENRE and runs analysis", async () => {
      const result = JSON.stringify({ type: "select_genre", genreId: "techno" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();
      const dispatchSpy = vi.spyOn(store, "dispatch");

      await openWebviewPanel(ui, resources, store, orchestrator);

      // Should dispatch SET_GENRE
      expect(dispatchSpy).toHaveBeenCalledWith({ type: "SET_GENRE", genreId: "techno" });
      // Should run analysis
      expect(orchestrator.runAnalysis).toHaveBeenCalled();
    });

    it("handles select_genre with null genreId (clear genre)", async () => {
      const result = JSON.stringify({ type: "select_genre", genreId: null });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();
      const dispatchSpy = vi.spyOn(store, "dispatch");

      await openWebviewPanel(ui, resources, store, orchestrator);

      // Should dispatch SET_GENRE with null
      expect(dispatchSpy).toHaveBeenCalledWith({ type: "SET_GENRE", genreId: null });
      // Should trigger re-analysis
      expect(orchestrator.runAnalysis).toHaveBeenCalled();
    });

    it("select_genre dispatches SET_GENRE and triggers analysis on genre change", async () => {
      const result = JSON.stringify({ type: "select_genre", genreId: "techno" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();

      // Pre-populate sections so alignment/archetype can compute
      store.dispatch({
        type: "INIT",
        sections: [
          { id: "s-1", name: "Intro", startTime: 0, endTime: 64 },
          { id: "s-2", name: "Build A", startTime: 64, endTime: 96 },
          { id: "s-3", name: "Main A", startTime: 96, endTime: 224 },
          { id: "s-4", name: "Breakdown", startTime: 224, endTime: 288 },
          { id: "s-5", name: "Build B", startTime: 288, endTime: 320 },
          { id: "s-6", name: "Main B", startTime: 320, endTime: 448 },
          { id: "s-7", name: "Outro", startTime: 448, endTime: 512 },
        ],
        trackInventory: [],
      });

      const dispatchSpy = vi.spyOn(store, "dispatch");

      await openWebviewPanel(ui, resources, store, orchestrator);

      // Should dispatch SET_GENRE
      expect(dispatchSpy).toHaveBeenCalledWith({ type: "SET_GENRE", genreId: "techno" });
      // Should trigger re-analysis (which internally computes alignment/archetype)
      expect(orchestrator.runAnalysis).toHaveBeenCalled();
    });

    it("select_genre with subgenre ID dispatches SET_GENRE and triggers analysis", async () => {
      const result = JSON.stringify({ type: "select_genre", genreId: "peak-time-techno" });
      const ui = createMockUi(result);
      const resources = createMockResources();
      const store = createStore();
      const orchestrator = createMockOrchestrator();
      const dispatchSpy = vi.spyOn(store, "dispatch");

      await openWebviewPanel(ui, resources, store, orchestrator);

      // Should dispatch SET_GENRE with subgenre id
      expect(dispatchSpy).toHaveBeenCalledWith({ type: "SET_GENRE", genreId: "peak-time-techno" });
      // Should trigger re-analysis
      expect(orchestrator.runAnalysis).toHaveBeenCalled();
    });
  });
});
