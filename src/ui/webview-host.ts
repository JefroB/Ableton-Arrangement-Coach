/**
 * Webview Host — opens a modal dialog and bridges state updates to the webview.
 *
 * The host opens the extension's webview UI via `ui.showModalDialog`, subscribes
 * to store changes, and sends `BackendMessage` updates to the webview. Incoming
 * `FrontendMessage` from the webview is routed through the message handler, which
 * silently ignores unrecognized types.
 *
 * ## Message Passing Architecture
 *
 * The Ableton Extensions SDK's `showModalDialog` provides one-way communication:
 * the webview can post messages to the host via `window.webkit.messageHandlers.live`
 * (macOS) or `window.chrome.webview` (Windows). The host receives the result when
 * the dialog calls `{ method: "close_and_send", params: [resultString] }`.
 *
 * For live state updates (backend → webview), the initial state is embedded in the
 * HTML at open time. The store subscription is set up so that when a bidirectional
 * channel becomes available (e.g., via a future SDK API or a polling mechanism in
 * the webview), updates can be pushed. Currently, the dialog receives the full
 * initial state on open.
 *
 * For frontend → backend messages, the dialog's result string is parsed as JSON
 * and routed through `handleFrontendMessage`.
 */
import type { Ui, Resources } from "@ableton-extensions/sdk";
import type { Store, SectionAnalysisState } from "../state/store.js";
import type { AnalysisOrchestrator } from "../core/analysis-orchestrator.js";
import type { SectionChecklistItem } from "../core/notes-types.js";
import type { SdkAdapter } from "../ableton/sdk-adapter.js";
import type { BackendMessage } from "./messages.js";
import { handleFrontendMessage } from "./messages.js";
import { getAllFamilies, search, getProfile, getProfileBySubgenre } from "../core/genre-registry.js";
import { computeAlignment } from "../core/alignment-scorer.js";
import { detectArchetype } from "../core/archetype-detector.js";
import { computeArrangementScore } from "../core/arrangement-score-engine.js";
import { generateSections } from "../core/section-generator.js";
import { buildSections } from "../core/section-scanner.js";
import { buildTrackInventory } from "../core/track-reader.js";

/** Dialog dimensions (width x height in pixels). */
const DIALOG_WIDTH = 900;
const DIALOG_HEIGHT = 600;

/** Path to the bundled webview HTML resource. */
const WEBVIEW_HTML_PATH = "webview/index.html";

/**
 * Open the webview panel as a modal dialog and bridge state to the webview.
 *
 * - Retrieves the webview HTML URL via `resources.getFileUri`
 * - Opens the modal dialog at the specified dimensions
 * - Subscribes to store changes to prepare `BackendMessage` updates
 * - Handles the dialog result as a `FrontendMessage`
 *
 * @param ui - The SDK Ui service for showing dialogs.
 * @param resources - The SDK Resources service for resolving file URIs.
 * @param store - The application state store.
 * @param orchestrator - The analysis orchestrator for triggering re-analysis.
 */
export async function openWebviewPanel(
  ui: Ui,
  resources: Resources,
  store: Store,
  orchestrator: AnalysisOrchestrator,
  options?: { onAlsPathSet?: (path: string) => void; onAlsDataReceived?: (base64Data: string) => void; isAlsLoaded?: () => boolean; onSaveRequested?: () => void; sdk?: SdkAdapter }
): Promise<void> {
  const pathMod = require("path") as typeof import("path");
  const fsMod = require("fs") as typeof import("fs");
  const htmlPath = pathMod.resolve(__dirname, WEBVIEW_HTML_PATH);

  // Loop: reopen dialog after genre selection
  let keepOpen = true;
  while (keepOpen) {
    keepOpen = false;

    // Build initial state to inject
    const state = store.getState();
    const sectionAnalysis: Record<string, SectionAnalysisState> = {};
    for (const [id, data] of state.sectionAnalysis) {
      sectionAnalysis[id] = data;
    }
    const sectionChecklists: Record<string, SectionChecklistItem[]> = {};
    for (const [sectionId, items] of Object.entries(state.sectionChecklists)) {
      sectionChecklists[sectionId] = [...items];
    }

    const initialState = {
      sections: [...state.sections],
      sectionAnalysis,
      energyCurve: [...state.energyCurve],
      selectedGenre: state.selectedGenreId,
      selectionRange: state.selectionRange,
      issues: [...(state.issues ?? [])],
      transitionRecommendations: [...state.transitionRecommendations],
      notes: [...state.notes],
      sectionChecklists,
      djScore: state.djScore,
      arrangementScore: state.arrangementScore,
      alsLoaded: !!(options?.isAlsLoaded?.()),
      isGenerating: state.isGenerating,
      generationError: state.generationError,
    };

    // Try to write a temp file with injected state
    let url: string;
    try {
      const tempDir = (globalThis as any).__AC_TEMP_DIR__ as string | undefined;
      if (!tempDir) {
        throw new Error("No temp directory available");
      }
      fsMod.mkdirSync(tempDir, { recursive: true });
      let html = fsMod.readFileSync(htmlPath, "utf-8");
      const stateScript = `<script>window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};</script>`;
      html = html.replace("<head>", "<head>" + stateScript);
      const tempHtmlPath = pathMod.join(tempDir, "_panel.html");
      fsMod.writeFileSync(tempHtmlPath, html, "utf-8");
      url = "file:///" + tempHtmlPath.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
    } catch (e) {
      console.error("[Arrangement Coach] Temp file write failed, using original HTML:", e);
      url = "file:///" + htmlPath.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
    }

    try {
      // Subscribe to arrangementScore changes and prepare arrangement_score_updated
      // messages. The subscription tracks the previous value and constructs the
      // BackendMessage when a change is detected — same pattern as dj_score_updated.
      let prevArrangementScore = state.arrangementScore;
      const unsubscribeArrangementScore = store.subscribe(() => {
        const current = store.getState().arrangementScore;
        if (current !== prevArrangementScore) {
          prevArrangementScore = current;
          const _arrangementScoreMsg: BackendMessage = {
            type: "arrangement_score_updated",
            score: current,
          };
          // NOTE: In production with a bidirectional channel, _arrangementScoreMsg
          // would be sent to the webview via the host's message bridge.
          void _arrangementScoreMsg;
        }
      });

      let prevDjScore = state.djScore;
      const unsubscribeDjScore = store.subscribe(() => {
        const current = store.getState().djScore;
        if (current !== prevDjScore) {
          prevDjScore = current;
          const _djScoreMsg: BackendMessage = {
            type: "dj_score_updated",
            djScore: current,
          };
          // NOTE: In production with a bidirectional channel, _djScoreMsg
          // would be sent to the webview via the host's message bridge.
          void _djScoreMsg;
        }
      });

      const result = (await ui.showModalDialog(
        url,
        DIALOG_WIDTH,
        DIALOG_HEIGHT
      )) as unknown as string | undefined;

      // Unsubscribe from score updates when the dialog closes
      unsubscribeArrangementScore();
      unsubscribeDjScore();

      if (result !== undefined && result !== "") {
        // Check if it's a genre selection — if so, save and reopen
        let parsed: any;
        try { parsed = JSON.parse(result); } catch { parsed = null; }

        // Persist notes and checklist state from any result
        if (parsed && Array.isArray(parsed.notes)) {
          store.dispatch({ type: "UPDATE_NOTES", notes: parsed.notes });
        }
        if (parsed && parsed.sectionChecklists && typeof parsed.sectionChecklists === "object") {
          store.dispatch({ type: "UPDATE_SECTION_CHECKLISTS", sectionChecklists: parsed.sectionChecklists });
        }

        if (parsed && parsed.type === "select_genre") {
          store.dispatch({ type: "SET_GENRE", genreId: parsed.genreId });
          orchestrator.invalidateCache();
          orchestrator.runAnalysis();
          keepOpen = true; // Reopen dialog with updated state
        } else if (parsed && parsed.type === "analyze") {
          // Re-analyze and reopen with fresh results
          orchestrator.invalidateCache();
          orchestrator.runAnalysis();
          keepOpen = true;
        } else if (parsed && parsed.type === "set_als_path") {
          // User provided .als path from the overlay
          const alsPath = parsed.path as string;
          console.log("[Arrangement Coach] User provided .als path:", alsPath);
          if (options?.onAlsPathSet) {
            options.onAlsPathSet(alsPath);
          }
          orchestrator.invalidateCache();
          orchestrator.runAnalysis();
          keepOpen = true; // Reopen with automation data
        } else if (parsed && parsed.type === "set_als_data") {
          // User provided .als file content as base64 from the webview file picker
          const base64Data = parsed.data as string;
          const fileName = parsed.fileName as string;
          console.log("[Arrangement Coach] Received .als file data:", fileName, "base64 length:", base64Data.length);
          if (options?.onAlsDataReceived) {
            options.onAlsDataReceived(base64Data);
          }
          orchestrator.invalidateCache();
          orchestrator.runAnalysis();
          keepOpen = true; // Reopen with automation data
        } else if (parsed && parsed.type === "generate_sections") {
          // Handle section marker generation request
          const state = store.getState();
          console.log("[Arrangement Coach] generate_sections received. Genre:", state.selectedGenreId, "isGenerating:", state.isGenerating, "sdk available:", !!options?.sdk);

          // Prevent double-press: if already generating, just reopen
          if (state.isGenerating) {
            keepOpen = true;
          } else if (state.selectedGenreId === null) {
            // No genre selected — cannot generate
            console.error("[Arrangement Coach] generate_sections blocked: no genre selected");
            store.dispatch({ type: "SET_GENERATION_ERROR", error: "No genre selected" });
            keepOpen = true;
          } else {
            // Begin generation
            store.dispatch({ type: "SET_GENERATING", generating: true });

            // Send generation_status to webview indicating generation started
            const _generatingMsg: BackendMessage = {
              type: "generation_status",
              generating: true,
              error: null,
            };
            void _generatingMsg;

            if (options?.sdk) {
              try {
                console.log("[Arrangement Coach] Starting generateSections for genre:", state.selectedGenreId);
                const result = await generateSections(options.sdk, state.selectedGenreId, 4);
                console.log("[Arrangement Coach] generateSections result:", JSON.stringify(result));

                if (result.success) {
                  // Success: clear generating state and send completion message
                  store.dispatch({ type: "SET_GENERATING", generating: false });
                  store.dispatch({ type: "SET_GENERATION_ERROR", error: null });

                  const _completeMsg: BackendMessage = {
                    type: "generation_complete",
                    markersCreated: result.markersCreated,
                  };
                  void _completeMsg;
                } else {
                  // Failure: set error and clear generating state
                  store.dispatch({ type: "SET_GENERATION_ERROR", error: result.error ?? "Generation failed" });
                  store.dispatch({ type: "SET_GENERATING", generating: false });

                  const _errorStatusMsg: BackendMessage = {
                    type: "generation_status",
                    generating: false,
                    error: result.error ?? "Generation failed",
                  };
                  void _errorStatusMsg;
                }
              } catch (error) {
                // Unexpected error
                const errorMessage = error instanceof Error ? error.message : String(error);
                store.dispatch({ type: "SET_GENERATION_ERROR", error: errorMessage });
                store.dispatch({ type: "SET_GENERATING", generating: false });

                const _unexpectedErrorMsg: BackendMessage = {
                  type: "generation_status",
                  generating: false,
                  error: errorMessage,
                };
                void _unexpectedErrorMsg;
              }
            } else {
              // No SDK available — cannot generate
              store.dispatch({ type: "SET_GENERATION_ERROR", error: "SDK adapter not available" });
              store.dispatch({ type: "SET_GENERATING", generating: false });

              const _noSdkMsg: BackendMessage = {
                type: "generation_status",
                generating: false,
                error: "SDK adapter not available",
              };
              void _noSdkMsg;
            }

            // Re-read locators to pick up newly created CuePoints as sections
            if (options?.sdk) {
              const freshLocators = options.sdk.readLocators();
              const freshSections = buildSections(freshLocators);
              const freshTracks = options.sdk.readTracks();
              const freshInventory = buildTrackInventory(freshTracks);
              store.dispatch({ type: "INIT", sections: freshSections, trackInventory: freshInventory });
            }

            // Re-run analysis to compute energy scores for the new sections
            orchestrator.invalidateCache();
            orchestrator.runAnalysis();
            keepOpen = true; // Reopen with updated state
          }
        } else if (parsed && parsed.type === "save_state") {
          // Explicit save request on close — already dispatched above, just save.
          console.log("[Arrangement Coach] save_state received. Notes count:", parsed.notes?.length ?? 0, "Checklists:", Object.keys(parsed.sectionChecklists ?? {}).length);
        } else if (parsed && parsed.type === "save_notes") {
          // User explicitly saved via "Save & Close" button.
          // Notes/checklists already dispatched above from the bundled data.
          if (options?.onSaveRequested) {
            options.onSaveRequested();
          }
          // Don't set keepOpen — dialog stays closed.
        } else {
          handleDialogResult(result, store, orchestrator, options?.onAlsPathSet);
        }
      }

      // Always force-save after dialog closes (whether result was received or not).
      // This ensures notes/checklists are persisted even when the dialog is dismissed
      // without sending a message (e.g., user clicks the X button).
      if (!keepOpen && options?.onSaveRequested) {
        options.onSaveRequested();
      }
    } catch (error) {
      console.error("[Arrangement Coach] Modal dialog error:", error);
    }
  }
}

/**
 * Parse and handle the dialog result string as a FrontendMessage.
 *
 * The webview sends its result as a JSON string via `close_and_send`.
 * If the result is valid JSON containing a recognized FrontendMessage,
 * it is routed to the appropriate handler. Malformed JSON or unrecognized
 * message types are silently ignored.
 */
function handleDialogResult(
  result: string,
  store: Store,
  orchestrator: AnalysisOrchestrator,
  onAlsPathSet?: (path: string) => void
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    // Malformed JSON — silently ignore.
    return;
  }

  handleFrontendMessage(parsed, {
    request_state: () => {
      // The webview requested a state refresh. In a bidirectional channel,
      // we would send the current state back. For now this is a no-op
      // since the dialog has already closed by the time we receive this.
      void store.getState();
    },

    request_genre_families: () => {
      // Respond with the full list of genre families from the registry.
      const _familiesMsg: BackendMessage = {
        type: "genre_families",
        families: getAllFamilies(),
      };

      // NOTE: In production with a bidirectional channel, _familiesMsg
      // would be sent to the webview via the host's message bridge.
      void _familiesMsg;
    },

    search_genres: (msg) => {
      // Perform search and respond with results.
      const _searchResultsMsg: BackendMessage = {
        type: "genre_search_results",
        results: search(msg.query),
      };

      // NOTE: In production with a bidirectional channel, _searchResultsMsg
      // would be sent to the webview via the host's message bridge.
      void _searchResultsMsg;
    },

    select_genre: (msg) => {
      // Dispatch SET_GENRE to store, then re-run analysis with new weights.
      store.dispatch({ type: "SET_GENRE", genreId: msg.genreId });
      orchestrator.runAnalysis();

      // Resolve genre name for the genre_changed response.
      let genreName: string | null = null;
      if (msg.genreId !== null) {
        const profile = getProfile(msg.genreId) ?? getProfileBySubgenre(msg.genreId);
        genreName = profile?.name ?? null;
      }

      // Respond with genre_changed confirmation.
      const _genreChangedMsg: BackendMessage = {
        type: "genre_changed",
        genreId: msg.genreId,
        genreName,
      };

      // NOTE: In production with a bidirectional channel, _genreChangedMsg
      // would be sent to the webview via the host's message bridge.
      void _genreChangedMsg;

      // Trigger alignment and archetype recomputation on genre change.
      const state = store.getState();
      const resolvedProfile = msg.genreId !== null
        ? (getProfile(msg.genreId) ?? getProfileBySubgenre(msg.genreId))
        : null;

      // Compute structural alignment against the genre template.
      const alignment = computeAlignment(state.sections, resolvedProfile, 120);
      store.dispatch({ type: "UPDATE_ALIGNMENT", alignment });

      // Detect archetype based on current sections and energy curve.
      const archetype = detectArchetype(state.sections, [...state.energyCurve], resolvedProfile);
      store.dispatch({ type: "UPDATE_ARCHETYPE", archetype });

      // Recompute arrangement score with the new genre template.
      // Only compute when .als data is loaded — avoids showing a preliminary score.
      // If no genre selected, dispatch null. If energy curve is too short (< 2 sections),
      // the engine returns null (deferred until analysis produces data).
      // If genre ID not found in registry, retain previous score.
      try {
        const hasAlsForScore = state.automationData !== null;
        if (!hasAlsForScore) {
          // .als not loaded — don't show score
          store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: null });
        } else if (msg.genreId === null) {
          store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: null });
        } else if (resolvedProfile !== null && resolvedProfile !== undefined) {
          const energyCurve = state.energyCurve;
          if (energyCurve.length >= 2) {
            const arrResult = computeArrangementScore({
              energyCurve: [...energyCurve],
              idealCurve: resolvedProfile.energyCurveTemplate,
            });
            store.dispatch({ type: "UPDATE_ARRANGEMENT_SCORE", score: arrResult.score });
          }
          // If energyCurve.length < 2, defer — score stays at current value until analysis runs
        }
        // If resolvedProfile is null (genre not found), retain previous score unchanged
      } catch (arrError) {
        // On error, retain previous score unchanged
        console.error("[Arrangement Coach] Error recomputing arrangement score on genre change:", arrError);
      }

      // Prepare alignment and archetype update messages for the webview.
      const _alignmentMsg: BackendMessage = {
        type: "alignment_updated",
        alignment,
      };
      const _archetypeMsg: BackendMessage = {
        type: "archetype_updated",
        archetype,
      };

      // NOTE: In production with a bidirectional channel, these messages
      // would be sent to the webview via the host's message bridge.
      void _alignmentMsg;
      void _archetypeMsg;
    },

    request_analysis: () => {
      // Trigger a full re-analysis of the arrangement.
      orchestrator.runAnalysis();
    },

    refresh: () => {
      // Alias for request_analysis — triggers a full re-analysis.
      orchestrator.runAnalysis();
    },

    set_als_path: (msg) => {
      // User manually provided the .als file path from the overlay.
      const alsPath = (msg as { path: string }).path;
      console.log("[Arrangement Coach] User provided .als path:", alsPath);
      if (onAlsPathSet) {
        onAlsPathSet(alsPath);
      }
      orchestrator.invalidateCache();
      orchestrator.runAnalysis();
    },

    toggle_checklist_item: (msg) => {
      // Dispatch TOGGLE_CHECKLIST_ITEM to toggle the completed state.
      store.dispatch({
        type: "TOGGLE_CHECKLIST_ITEM",
        boundaryId: msg.boundaryId,
        itemId: msg.itemId,
      });

      // Send transitions_updated to notify webview of the state change.
      const _transitionsMsg: BackendMessage = {
        type: "transitions_updated",
        recommendations: [...store.getState().transitionRecommendations],
      };

      // NOTE: In production with a bidirectional channel, _transitionsMsg
      // would be sent to the webview via the host's message bridge.
      void _transitionsMsg;
    },

    add_note: (msg) => {
      // Dispatch ADD_NOTE to create a new note for the section.
      store.dispatch({
        type: "ADD_NOTE",
        sectionId: msg.sectionId,
        text: msg.text,
      });
    },

    edit_note: (msg) => {
      // Dispatch EDIT_NOTE to update an existing note's text.
      store.dispatch({
        type: "EDIT_NOTE",
        noteId: msg.noteId,
        text: msg.text,
      });
    },

    delete_note: (msg) => {
      // Dispatch DELETE_NOTE to remove the note by id.
      store.dispatch({
        type: "DELETE_NOTE",
        noteId: msg.noteId,
      });
    },

    toggle_section_checklist_item: (msg) => {
      // Dispatch TOGGLE_SECTION_CHECKLIST_ITEM to flip the item's completed state.
      store.dispatch({
        type: "TOGGLE_SECTION_CHECKLIST_ITEM",
        sectionId: msg.sectionId,
        itemId: msg.itemId,
      });
    },

    request_reference_scan: () => {
      // Trigger a manual re-scan for the reference track.
      orchestrator.handleReferenceScan();
    },

    generate_sections: () => {
      // Handled at the top-level dialog result handler (requires async + SDK).
      // No-op here — the generate_sections flow is managed in openWebviewPanel.
    },
  });
}
