/**
 * Notes Store — persistence layer for notes and checklist completion states.
 *
 * Manages reading and writing a per-project JSON file containing user notes
 * and checklist completion booleans. Debounces writes with a 2-second window,
 * retries on failure, and operates in memory-only mode when storageDirectory
 * is unavailable.
 */
import type { Store } from "./store.js";
import type { Note, PersistenceFile, SectionChecklistItem } from "../core/notes-types.js";
import { deriveProjectKey } from "../utils/project-key.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join as pathJoin } from "node:path";

// ─── Constants ─────────────────────────────────────────────────────────

/** Debounce window for persistence writes (milliseconds). */
const DEBOUNCE_MS = 2000;

/** Current schema version for the persistence file format. */
const SCHEMA_VERSION = 1;

// ─── NotesStore Interface ──────────────────────────────────────────────

/** Public API for the notes persistence layer. */
export interface NotesStore {
  /** Initialize: derive project key, load persistence file, dispatch to store. */
  initialize(setFilePath: string | undefined): void;

  /** Returns true if initialize() has been called with a non-undefined path. */
  isInitialized(): boolean;

  /** Handle project switch: save old, load new. */
  switchProject(newSetFilePath: string): void;

  /** Subscribe to store changes and debounce persistence writes. Returns unsubscribe. */
  startAutoSave(): () => void;

  /** Check if persistence is available (storageDirectory defined). */
  isPersistenceAvailable(): boolean;

  /** Force an immediate save (for graceful shutdown). */
  saveNow(): void;
}

// ─── Validation ────────────────────────────────────────────────────────

/**
 * Validate and parse a persistence file from raw content.
 * Returns a valid PersistenceFile or null if the data is invalid.
 */
export function parsePersistenceFile(content: string): PersistenceFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate schemaVersion
  if (obj["schemaVersion"] !== SCHEMA_VERSION) {
    return null;
  }

  // Validate projectKey
  if (typeof obj["projectKey"] !== "string" || obj["projectKey"].length === 0) {
    return null;
  }

  // Validate notes array
  if (!Array.isArray(obj["notes"])) {
    return null;
  }

  for (const note of obj["notes"]) {
    if (!isValidNote(note)) {
      return null;
    }
  }

  // Validate checklistCompletions
  if (obj["checklistCompletions"] === null || typeof obj["checklistCompletions"] !== "object" || Array.isArray(obj["checklistCompletions"])) {
    return null;
  }

  const completions = obj["checklistCompletions"] as Record<string, unknown>;
  for (const value of Object.values(completions)) {
    if (typeof value !== "boolean") {
      return null;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projectKey: obj["projectKey"] as string,
    notes: obj["notes"] as Note[],
    checklistCompletions: completions as Record<string, boolean>,
  };
}

/**
 * Check if an unknown value is a valid Note object.
 */
function isValidNote(value: unknown): value is Note {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["sectionId"] === "string" &&
    typeof obj["text"] === "string" &&
    typeof obj["createdAt"] === "number"
  );
}

// ─── Factory ───────────────────────────────────────────────────────────

/**
 * Create a new NotesStore instance.
 *
 * @param store - The central state store to dispatch loaded data into.
 * @param storageDirectory - The SDK's storage directory path, or undefined for memory-only mode.
 * @returns A NotesStore instance.
 */
export function createNotesStore(
  store: Store,
  storageDirectory: string | undefined
): NotesStore {
  let currentProjectKey: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedState: { notes: readonly Note[]; sectionChecklists: Readonly<Record<string, readonly SectionChecklistItem[]>> } | null = null;

  // ─── Internal Helpers ────────────────────────────────────────────────

  /**
   * Get the path to the notes subdirectory.
   */
  function getNotesDirectory(): string | null {
    if (storageDirectory === undefined) {
      return null;
    }
    return pathJoin(storageDirectory, "notes");
  }

  /**
   * Get the full path for the current project's persistence file.
   */
  function getFilePath(projectKey: string): string | null {
    const notesDir = getNotesDirectory();
    if (notesDir === null) {
      return null;
    }
    return pathJoin(notesDir, `${projectKey}.json`);
  }

  /**
   * Ensure the notes subdirectory exists, creating it if necessary.
   */
  async function ensureNotesDirectory(): Promise<void> {
    const notesDir = getNotesDirectory();
    if (notesDir === null) {
      return;
    }
    try {
      await mkdir(notesDir, { recursive: true });
    } catch (error) {
      console.warn("[Notes Store] Failed to create notes directory:", error);
    }
  }

  /**
   * Load the persistence file for the given project key.
   * Returns empty state on any error (missing file, invalid JSON, wrong schema).
   */
  async function loadFromDisk(projectKey: string): Promise<{ notes: Note[]; checklistCompletions: Record<string, boolean> }> {
    const filePath = getFilePath(projectKey);
    if (filePath === null) {
      return { notes: [], checklistCompletions: {} };
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = parsePersistenceFile(content);

      if (parsed === null) {
        console.warn("[Notes Store] Invalid persistence file, initializing empty state.");
        return { notes: [], checklistCompletions: {} };
      }

      // Verify the projectKey matches
      if (parsed.projectKey !== projectKey) {
        console.warn("[Notes Store] Project key mismatch in persistence file, initializing empty state.");
        return { notes: [], checklistCompletions: {} };
      }

      return {
        notes: parsed.notes as Note[],
        checklistCompletions: parsed.checklistCompletions,
      };
    } catch (error: unknown) {
      // File doesn't exist or can't be read — this is fine for first use
      if (isNodeError(error) && error.code === "ENOENT") {
        return { notes: [], checklistCompletions: {} };
      }
      console.warn("[Notes Store] Failed to read persistence file:", error);
      return { notes: [], checklistCompletions: {} };
    }
  }

  /**
   * Save current state to disk for the given project key.
   */
  async function saveToDisk(projectKey: string): Promise<void> {
    const filePath = getFilePath(projectKey);
    if (filePath === null) {
      return;
    }

    const state = store.getState();
    const persistenceFile: PersistenceFile = {
      schemaVersion: SCHEMA_VERSION,
      projectKey,
      notes: [...state.notes],
      checklistCompletions: buildChecklistCompletions(state.sectionChecklists),
    };

    try {
      await ensureNotesDirectory();
      await writeFile(filePath, JSON.stringify(persistenceFile, null, 2), "utf-8");
      lastSavedState = { notes: state.notes, sectionChecklists: state.sectionChecklists };
    } catch (error) {
      console.warn("[Notes Store] Failed to write persistence file, will retry:", error);
      // Retain in-memory state; retry happens on next debounce cycle
    }
  }

  /**
   * Build a flat checklistCompletions map from the section checklists.
   */
  function buildChecklistCompletions(
    sectionChecklists: Readonly<Record<string, readonly SectionChecklistItem[]>>
  ): Record<string, boolean> {
    const completions: Record<string, boolean> = {};
    for (const items of Object.values(sectionChecklists)) {
      for (const item of items) {
        if (item.completed) {
          completions[item.id] = true;
        }
      }
    }
    return completions;
  }

  /**
   * Dispatch loaded data into the store.
   */
  function dispatchLoadedData(
    notes: Note[],
    checklistCompletions: Record<string, boolean>
  ): void {
    store.dispatch({ type: "UPDATE_NOTES", notes });

    // Merge checklist completions with existing section checklists in the store
    const state = store.getState();
    const mergedChecklists: Record<string, SectionChecklistItem[]> = {};

    for (const [sectionId, items] of Object.entries(state.sectionChecklists)) {
      mergedChecklists[sectionId] = items.map((item) => {
        const savedCompletion = checklistCompletions[item.id];
        if (savedCompletion !== undefined) {
          return { ...item, completed: savedCompletion };
        }
        return { ...item };
      });
    }

    store.dispatch({ type: "UPDATE_SECTION_CHECKLISTS", sectionChecklists: mergedChecklists });
  }

  /**
   * Check if state has changed since last save.
   */
  function hasStateChanged(): boolean {
    if (lastSavedState === null) {
      return true;
    }
    const state = store.getState();
    return (
      state.notes !== lastSavedState.notes ||
      state.sectionChecklists !== lastSavedState.sectionChecklists
    );
  }

  /**
   * Schedule a debounced save. Resets the timer on each call.
   */
  function scheduleSave(): void {
    if (storageDirectory === undefined || currentProjectKey === null) {
      return;
    }

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (currentProjectKey !== null && hasStateChanged()) {
        void saveToDisk(currentProjectKey);
      }
    }, DEBOUNCE_MS);
  }

  // ─── Type Guard ──────────────────────────────────────────────────────

  function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
  }

  // ─── Public API ──────────────────────────────────────────────────────

  return {
    initialize(setFilePath: string | undefined): void {
      if (setFilePath === undefined || storageDirectory === undefined) {
        // Memory-only mode: no persistence
        currentProjectKey = null;
        store.dispatch({ type: "SET_PERSISTENCE_STATUS", available: false });
        return;
      }

      const projectKey = deriveProjectKey(setFilePath);
      currentProjectKey = projectKey;
      store.dispatch({ type: "SET_PERSISTENCE_STATUS", available: true });

      // Load persistence file asynchronously
      void loadFromDisk(projectKey).then((data) => {
        dispatchLoadedData(data.notes, data.checklistCompletions);
        lastSavedState = {
          notes: store.getState().notes,
          sectionChecklists: store.getState().sectionChecklists,
        };
      });
    },

    isInitialized(): boolean {
      return currentProjectKey !== null;
    },

    switchProject(newSetFilePath: string): void {
      // Save current project state before switching
      if (currentProjectKey !== null && storageDirectory !== undefined) {
        // Cancel any pending debounce and save immediately
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        void saveToDisk(currentProjectKey);
      }

      // Load new project
      const newProjectKey = deriveProjectKey(newSetFilePath);
      currentProjectKey = newProjectKey;

      if (storageDirectory === undefined) {
        store.dispatch({ type: "SET_PERSISTENCE_STATUS", available: false });
        return;
      }

      store.dispatch({ type: "SET_PERSISTENCE_STATUS", available: true });

      void loadFromDisk(newProjectKey).then((data) => {
        dispatchLoadedData(data.notes, data.checklistCompletions);
        lastSavedState = {
          notes: store.getState().notes,
          sectionChecklists: store.getState().sectionChecklists,
        };
      });
    },

    startAutoSave(): () => void {
      const unsubscribe = store.subscribe(() => {
        scheduleSave();
      });

      return () => {
        unsubscribe();
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      };
    },

    isPersistenceAvailable(): boolean {
      return storageDirectory !== undefined;
    },

    saveNow(): void {
      if (currentProjectKey === null || storageDirectory === undefined) {
        return;
      }

      // Cancel pending debounce
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (hasStateChanged()) {
        void saveToDisk(currentProjectKey);
      }
    },
  };
}
