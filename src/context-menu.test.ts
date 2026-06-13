import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerContextMenu, type ContextMenuDependencies } from "./context-menu.js";
import type { Store } from "./state/store.js";
import type { AnalysisOrchestrator } from "./core/analysis-orchestrator.js";
import type { Section } from "./core/section-scanner.js";

// ─── Mock Factory ──────────────────────────────────────────────────────

function createMockDependencies(sections: readonly Section[] = []): ContextMenuDependencies {
  return {
    ui: {
      registerContextMenuAction: vi.fn().mockResolvedValue(() => Promise.resolve()),
      showModalDialog: vi.fn(),
    } as any,
    commands: {
      registerCommand: vi.fn(),
      executeCommand: vi.fn(),
    } as any,
    orchestrator: {
      runAnalysis: vi.fn(),
      handleReferenceScan: vi.fn(),
      isAnalyzing: vi.fn(() => false),
    } as AnalysisOrchestrator,
    store: {
      getState: vi.fn(() => ({ sections })),
      dispatch: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    } as unknown as Store,
  };
}

// ─── Unit Tests ────────────────────────────────────────────────────────

describe("Context Menu Registrar", () => {
  describe("registerContextMenu", () => {
    it("registers both commands via commands.registerCommand", () => {
      const deps = createMockDependencies();
      registerContextMenu(deps);

      const registerCommand = deps.commands.registerCommand as ReturnType<typeof vi.fn>;
      expect(registerCommand).toHaveBeenCalledTimes(2);

      const registeredIds = registerCommand.mock.calls.map((call: unknown[]) => call[0]);
      expect(registeredIds).toContain("arrangement-coach.analyze");
      expect(registeredIds).toContain("arrangement-coach.show-issues");
    });

    it("registers context menu actions on AudioTrack.ArrangementSelection and MidiTrack.ArrangementSelection scopes", () => {
      const deps = createMockDependencies();
      registerContextMenu(deps);

      const registerAction = deps.ui.registerContextMenuAction as ReturnType<typeof vi.fn>;
      // Should register 2 actions: 1 per scope (Analyze Arrangement)
      expect(registerAction).toHaveBeenCalledTimes(2);

      const scopes = registerAction.mock.calls.map((call: unknown[]) => call[0]);
      expect(scopes.filter((s: string) => s === "AudioTrack.ArrangementSelection")).toHaveLength(1);
      expect(scopes.filter((s: string) => s === "MidiTrack.ArrangementSelection")).toHaveLength(1);
    });

    it("registers Analyze Arrangement and Show Issues labels for each scope", () => {
      const deps = createMockDependencies();
      registerContextMenu(deps);

      const registerAction = deps.ui.registerContextMenuAction as ReturnType<typeof vi.fn>;
      const labels = registerAction.mock.calls.map((call: unknown[]) => call[1]);
      expect(labels.filter((l: string) => l === "Analyze Arrangement")).toHaveLength(2);
    });
  });

  describe("analyze command callback", () => {
    it("no-ops when sections are empty", () => {
      const deps = createMockDependencies([]); // empty sections
      registerContextMenu(deps);

      // Extract the registered callback for the analyze command
      const registerCommand = deps.commands.registerCommand as ReturnType<typeof vi.fn>;
      const analyzeCall = registerCommand.mock.calls.find(
        (call: unknown[]) => call[0] === "arrangement-coach.analyze",
      );
      expect(analyzeCall).toBeDefined();

      const analyzeCallback = analyzeCall![1] as () => void;
      analyzeCallback();

      // orchestrator.runAnalysis should NOT have been called
      expect(deps.orchestrator.runAnalysis).not.toHaveBeenCalled();
    });

    it("calls orchestrator.runAnalysis() when sections exist", () => {
      const sections: Section[] = [
        { id: "section-0", name: "Intro", startTime: 0, endTime: 32 },
        { id: "section-1", name: "Drop", startTime: 32, endTime: 64 },
      ];
      const deps = createMockDependencies(sections);
      registerContextMenu(deps);

      // Extract the registered callback for the analyze command
      const registerCommand = deps.commands.registerCommand as ReturnType<typeof vi.fn>;
      const analyzeCall = registerCommand.mock.calls.find(
        (call: unknown[]) => call[0] === "arrangement-coach.analyze",
      );
      expect(analyzeCall).toBeDefined();

      const analyzeCallback = analyzeCall![1] as () => void;
      analyzeCallback();

      // orchestrator.runAnalysis SHOULD have been called
      expect(deps.orchestrator.runAnalysis).toHaveBeenCalledTimes(1);
    });
  });
});
