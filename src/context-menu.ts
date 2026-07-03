/**
 * Context Menu Registrar — registers context menu items in Ableton Live's
 * Arrangement View for the Arrangement Coach extension.
 *
 * Registers two commands:
 * - "Analyze Arrangement" — triggers a full re-analysis via the orchestrator.
 * - "Show Issues" — sends a message to the webview to scroll to the issues panel.
 *
 * Both commands guard against empty sections (no locators defined) by no-oping
 * when `store.getState().sections.length === 0`.
 */
import type { Ui, Commands } from "@ableton-extensions/sdk";
import type { AnalysisOrchestrator } from "./core/analysis-orchestrator.js";
import type { Store } from "./state/store.js";
import type { BackendMessage } from "./ui/messages.js";
import type { SdkAdapter } from "./ableton/sdk-adapter.js";
import type { Section } from "./core/section-scanner.js";
import { autoPlaceIfNeeded } from "./core/auto-placer.js";

// ─── Dependencies ──────────────────────────────────────────────────────

/** Dependencies required by the context menu registrar. */
export interface ContextMenuDependencies {
  readonly ui: Ui;
  readonly commands: Commands;
  readonly orchestrator: AnalysisOrchestrator;
  readonly store: Store;
  readonly sdk?: SdkAdapter;
  readonly getSections?: () => readonly Section[];
  readonly sendMessage?: (message: BackendMessage) => void;
  readonly openPanel?: () => void;
  readonly rescan?: () => void;
}

// ─── Registration ──────────────────────────────────────────────────────

/**
 * Register all context menu items for the Arrangement Coach extension.
 *
 * Registers commands and context menu actions on both `AudioTrack.ArrangementSelection`
 * and `MidiTrack.ArrangementSelection` scopes. Call once during `activate()`.
 *
 * @param deps - The required dependencies for context menu registration.
 */
export function registerContextMenu(deps: ContextMenuDependencies): void {
  const { ui, commands, orchestrator, store, sendMessage, openPanel, rescan, sdk, getSections } = deps;

  // Register "Analyze Arrangement" command — rescans, runs analysis, then opens the panel.
  commands.registerCommand("arrangement-coach.analyze", (arg: unknown) => {
    // Always rescan locators/tracks from the current live set before analyzing.
    if (rescan) {
      rescan();
    }

    // Scope analysis to the selected time range if provided
    const selection = arg as { time_selection_start?: number; time_selection_end?: number } | undefined;
    if (selection && typeof selection.time_selection_start === "number" && typeof selection.time_selection_end === "number" && selection.time_selection_start !== selection.time_selection_end) {
      store.dispatch({
        type: "SET_SELECTION_RANGE",
        startTime: selection.time_selection_start,
        endTime: selection.time_selection_end,
      });
    } else {
      store.dispatch({ type: "CLEAR_SELECTION_RANGE" });
    }

    // Auto-placement pre-check: detect missing locators and place them if needed (Req 1.1, 1.2, 1.3, 1.4, 5.1, 5.3)
    if (sdk && getSections) {
      (async () => {
        try {
          const placementResult = await autoPlaceIfNeeded({ sdk, store, getSections });

          if (placementResult.outcome === "placed") {
            // Re-read locators and rebuild sections after auto-placement
            if (rescan) {
              rescan();
            }
            // Invalidate cache before new analysis (Req 5.3)
            orchestrator.invalidateCache();
            orchestrator.runAnalysis();
            if (sendMessage) {
              sendMessage({
                type: "show_confirmation_dialog",
                data: {
                  markersPlaced: placementResult.markersCreated,
                  warning: placementResult.insufficientWarning,
                },
              });
            }
          } else if (placementResult.outcome === "skipped") {
            // Locators already exist — run analysis directly
            if (store.getState().sections.length > 0) {
              orchestrator.runAnalysis();
            }
          } else if (placementResult.outcome === "aborted") {
            if (sendMessage) {
              sendMessage({ type: "show_info_message", message: placementResult.message });
            }
          } else if (placementResult.outcome === "failed") {
            if (sendMessage) {
              sendMessage({ type: "show_error_message", message: placementResult.message });
            }
          }
        } catch (error) {
          console.error("[Context Menu] Auto-placement error:", error);
          // Fall back to standard analysis if auto-placement throws
          if (store.getState().sections.length > 0) {
            orchestrator.runAnalysis();
          }
        }
      })();
    } else {
      // Fallback: no sdk/getSections available — run analysis directly (legacy path)
      if (store.getState().sections.length > 0) {
        orchestrator.runAnalysis();
      }
    }

    // Always open the panel — even with 0 sections, the user may want to generate them.
    if (openPanel) {
      openPanel();
    }
  });

  // Register "Show Issues" command — same as Analyze (opens the panel with current state).
  commands.registerCommand("arrangement-coach.show-issues", (arg: unknown) => {
    if (rescan) {
      rescan();
    }

    const selection = arg as { time_selection_start?: number; time_selection_end?: number } | undefined;
    if (selection && typeof selection.time_selection_start === "number" && typeof selection.time_selection_end === "number" && selection.time_selection_start !== selection.time_selection_end) {
      store.dispatch({
        type: "SET_SELECTION_RANGE",
        startTime: selection.time_selection_start,
        endTime: selection.time_selection_end,
      });
    } else {
      store.dispatch({ type: "CLEAR_SELECTION_RANGE" });
    }

    if (store.getState().sections.length > 0) {
      orchestrator.runAnalysis();
    }

    if (openPanel) {
      openPanel();
    }
  });

  // Register context menu actions on AudioTrack.ArrangementSelection scope.
  // registerContextMenuAction returns a Promise — catch rejections to prevent
  // unhandled promise rejections from crashing the extension host.
  ui.registerContextMenuAction(
    "AudioTrack.ArrangementSelection",
    "Analyze Arrangement",
    "arrangement-coach.analyze",
  ).catch((error) => {
    console.error("[Context Menu] Failed to register Analyze on AudioTrack:", error);
  });

  // Register context menu actions on MidiTrack.ArrangementSelection scope.
  ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Analyze Arrangement",
    "arrangement-coach.analyze",
  ).catch((error) => {
    console.error("[Context Menu] Failed to register Analyze on MidiTrack:", error);
  });
}
