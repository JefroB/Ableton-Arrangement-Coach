/**
 * Extension entry point. Called by the Ableton Extension Host when the
 * extension is activated.
 *
 * Wires all components together: SDK Adapter, Section Scanner, Track Reader,
 * State Store, Playhead Tracker, Analysis Orchestrator, Notes Store, and
 * Webview Panel. Errors from SDK calls are caught and logged — the extension
 * initializes with empty data on failure.
 */
import { initialize, type ActivationContext, AudioTrack, AudioClip } from "@ableton-extensions/sdk";
import { createSdkAdapter } from "./ableton/sdk-adapter.js";
import { buildSections } from "./core/section-scanner.js";
import { buildTrackInventory } from "./core/track-reader.js";
import { createAnalysisOrchestrator } from "./core/analysis-orchestrator.js";
import { createStore } from "./state/store.js";
import { createNotesStore } from "./state/notes-store.js";
import { startPlayheadTracking } from "./ableton/playhead-tracker.js";
import { openWebviewPanel } from "./ui/webview-host.js";
import { registerContextMenu } from "./context-menu.js";
import { extractProjectRoot } from "./core/als-path-strategies.js";

export function activate(context: ActivationContext) {
  try {
    const extensionContext = initialize(context, "1.0.0");

    // Store temp directory path for webview-host to use
    (globalThis as any).__AC_TEMP_DIR__ = extensionContext.environment.tempDirectory;

    // Create SDK Adapter from ExtensionContext
    const adapter = createSdkAdapter(extensionContext);

    // Run Section Scanner: read locators → build sections
    let sections: ReturnType<typeof buildSections> = [];
    try {
      const locators = adapter.readLocators();
      sections = buildSections(locators);
    } catch (error) {
      console.error("Failed to read locators:", error);
    }

    // Run Track Reader: read tracks → build track inventory
    let trackInventory: ReturnType<typeof buildTrackInventory> = [];
    try {
      const tracks = adapter.readTracks();
      trackInventory = buildTrackInventory(tracks);
    } catch (error) {
      console.error("Failed to read tracks:", error);
    }

    // Initialize State Store with INIT action
    const store = createStore();
    store.dispatch({ type: "INIT", sections, trackInventory });

    // Create Notes Store for per-project persistence of notes and checklists
    const storageDirectory = extensionContext.environment.storageDirectory;
    const notesStore = createNotesStore(store, storageDirectory);
    // Initialize notes store with a project fingerprint as the persistence key.
    // The .als file path is unavailable due to sandbox restrictions, but we can
    // derive the project folder path from AudioClip file paths — this is unique
    // per project even for template-based projects (different folder = different key).
    try {
      const song = extensionContext.application.song;
      let projectRoot = "";
      // Derive project root from audio clip paths (unique per project folder)
      try {
        const tracks = song.tracks ?? [];
        for (const track of tracks) {
          if (!(track instanceof AudioTrack)) continue;
          const clips = track.arrangementClips ?? [];
          for (const clip of clips) {
            if (!(clip instanceof AudioClip)) continue;
            const clipPath = clip.filePath;
            if (clipPath) {
              const root = extractProjectRoot(clipPath);
              if (root) {
                projectRoot = root;
                break;
              }
            }
          }
          if (projectRoot) break;
        }
      } catch {
        // Fall through — projectRoot stays empty
      }

      // Build fingerprint: project folder path is the primary key (guaranteed unique).
      // Fall back to track names + cue points + clip data if no audio clips exist.
      let fingerprint: string;
      if (projectRoot) {
        fingerprint = projectRoot;
      } else {
        const trackNames = (song.tracks ?? []).map((t: { name: string }) => t.name);
        const cuePoints = (song.cuePoints ?? []).map((cp: { name: string; time: number }) => `${cp.name}@${cp.time}`);
        fingerprint = [
          ...trackNames.slice(0, 10),
          "||",
          ...cuePoints.slice(0, 20),
          "||",
          String(song.tempo ?? 120),
        ].join("|") || "default-project";
      }
      notesStore.initialize(fingerprint);
    } catch {
      notesStore.initialize(undefined);
    }

    // Start auto-save (subscribe to store changes, debounce writes)
    const stopAutoSave = notesStore.startAutoSave();

    // Create Analysis Orchestrator — analysis runs on demand via context menu
    const orchestrator = createAnalysisOrchestrator(
      adapter,
      store,
      () => store.getState().sections
    );

    // Track song fingerprint to detect project switches.
    // The SDK's cuePoints getter can return stale data from the previous project
    // when the Extension Host survives a Live Set change. We detect this by comparing
    // the fingerprint (song name + track names) and discarding locators when stale.
    let lastSongFingerprint = adapter.getSongFingerprint();

    // Register context menu actions in Ableton's right-click menus
    registerContextMenu({
      ui: extensionContext.ui,
      commands: extensionContext.commands,
      orchestrator,
      store,
      rescan: () => {
        // Re-read locators and tracks from the live set
        try {
          const currentFingerprint = adapter.getSongFingerprint();
          const projectChanged = currentFingerprint !== lastSongFingerprint;
          if (projectChanged) {
            console.log("[Arrangement Coach] Project change detected (fingerprint changed). Resetting state.");
            lastSongFingerprint = currentFingerprint;
            // Clear genre on project switch — the previous genre is irrelevant.
            store.dispatch({ type: "SET_GENRE", genreId: null });
          }

          const tracks = adapter.readTracks();
          console.log("[Arrangement Coach] Rescan: found", tracks.length, "tracks");
          const freshInventory = buildTrackInventory(tracks);

          const locators = adapter.readLocators();
          console.log("[Arrangement Coach] Rescan: found", locators.length, "locators");

          // Build sections from the locators the SDK returned.
          // Previously we discarded all locators on project change, assuming they were
          // stale from the prior session. In practice the SDK returns current data after
          // a project switch, so we trust them. We only discard if the new project looks
          // genuinely empty (≤2 tracks, likely default template) but somehow has locators.
          let freshSections = buildSections(locators);
          if (projectChanged && locators.length > 0 && tracks.length <= 2) {
            console.log("[Arrangement Coach] Discarding", locators.length, "potentially stale locators (new project has only", tracks.length, "tracks).");
            freshSections = [];
          }

          console.log("[Arrangement Coach] Rescan: built", freshSections.length, "sections");
          store.dispatch({ type: "INIT", sections: freshSections, trackInventory: freshInventory });
          // Invalidate analysis cache so runAnalysis() recomputes after INIT reset.
          orchestrator.invalidateCache();
        } catch (error) {
          console.error("[Arrangement Coach] Failed to rescan:", error);
        }
      },
      openPanel: () => {
        const s = store.getState();
        console.log("[Arrangement Coach] Opening panel. Sections:", s.sections.length, "Genre:", s.selectedGenreId);

        // Clear the .als buffer on each fresh open from the context menu.
        // The user should re-select the file each session to get current automation data.
        adapter.setAlsBufferOverride(undefined);

        openWebviewPanel(extensionContext.ui, extensionContext.resources, store, orchestrator, {
          onAlsPathSet: (alsPath) => {
            adapter.setAlsPathOverride(alsPath);
          },
          onAlsDataReceived: (base64Data) => {
            const buffer = Buffer.from(base64Data, "base64");
            adapter.setAlsBufferOverride(buffer);
          },
          isAlsLoaded: () => adapter.getAlsBufferOverride() !== undefined,
          onSaveRequested: () => {
            notesStore.saveNow();
          },
          sdk: adapter,
        }).catch(
          (error) => {
            console.error("Failed to open webview panel:", error);
          }
        );
      },
    });

    // Start Playhead Tracker (poll position, dispatch UPDATE_PLAYHEAD)
    startPlayheadTracking(adapter, store);
  } catch (error) {
    console.error("[Arrangement Coach] Fatal error during activation:", error);
  }
}
