/**
 * Integration tests for the Notes Store persistence layer.
 *
 * Validates: Requirements 4.2, 4.3, 4.8, 4.9, 4.10
 *
 * Tests cover:
 * - Write → read round-trip with mock filesystem
 * - Debounce behavior with fake timers
 * - Project switch: save old → load new
 * - Error recovery: failed writes → retry on next cycle
 * - Memory-only mode when storageDirectory undefined
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStore } from "./store.js";
import { createNotesStore } from "./notes-store.js";
import type { Store } from "./store.js";
import type { PersistenceFile } from "../core/notes-types.js";
import { createSection, resetFactoryCounters } from "../../test/factories.js";

// ─── Mock node:fs/promises ─────────────────────────────────────────────

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import * as fs from "node:fs/promises";

const mockReadFile = vi.mocked(fs.readFile);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockMkdir = vi.mocked(fs.mkdir);

// ─── Helpers ───────────────────────────────────────────────────────────

/** Create a valid PersistenceFile JSON string. */
function makePersistenceJson(overrides: Partial<PersistenceFile> = {}): string {
  const file: PersistenceFile = {
    schemaVersion: 1,
    projectKey: "test-project",
    notes: [],
    checklistCompletions: {},
    ...overrides,
  };
  return JSON.stringify(file);
}

/** Set up a store with a section so ADD_NOTE dispatches succeed. */
function createStoreWithSection(sectionId = "section-0"): Store {
  const store = createStore();
  const section = createSection({ id: sectionId, name: "Intro", startTime: 0, endTime: 32 });
  store.dispatch({ type: "INIT", sections: [section], trackInventory: [] });
  return store;
}

/**
 * Flush pending microtasks/promises. Uses multiple ticks to drain nested promise chains.
 */
async function flushPromises(): Promise<void> {
  // Multiple passes to ensure nested `.then()` chains resolve
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

// ─── Test Suite ────────────────────────────────────────────────────────

describe("Notes Store Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFactoryCounters();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    // Default: mkdir succeeds, writeFile succeeds
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Write → Read Round-Trip ──────────────────────────────────────────

  describe("Write → Read round-trip", () => {
    it("saves notes to disk and loads them back into a new store", async () => {
      const storageDirectory = "/tmp/extension-data";
      const setFilePath = "/path/to/MyProject.als";

      // First store: initialize, add a note, save
      const store1 = createStoreWithSection("section-0");
      const notesStore1 = createNotesStore(store1, storageDirectory);

      // Mock: no existing file on first load
      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      notesStore1.initialize(setFilePath);
      await flushPromises();

      // Add notes to the store
      store1.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Remember to add reverb" });
      store1.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Check the low end" });

      // Start auto-save
      const unsub1 = notesStore1.startAutoSave();

      // Trigger a state change so auto-save subscriber fires
      store1.dispatch({ type: "SET_PERSISTENCE_STATUS", available: true });

      // Advance past debounce window
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();

      // Verify writeFile was called
      expect(mockWriteFile).toHaveBeenCalled();

      // Capture what was written
      const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
      const writtenData = JSON.parse(writtenContent) as PersistenceFile;

      expect(writtenData.schemaVersion).toBe(1);
      expect(writtenData.notes).toHaveLength(2);
      expect(writtenData.notes[0]!.text).toBe("Remember to add reverb");
      expect(writtenData.notes[1]!.text).toBe("Check the low end");

      unsub1();

      // Second store: load the saved data
      const store2 = createStoreWithSection("section-0");
      const notesStore2 = createNotesStore(store2, storageDirectory);

      // Mock readFile to return what was written
      mockReadFile.mockResolvedValueOnce(writtenContent);

      notesStore2.initialize(setFilePath);
      await flushPromises();

      // Verify the second store has the loaded notes
      const state2 = store2.getState();
      expect(state2.notes).toHaveLength(2);
      expect(state2.notes[0]!.text).toBe("Remember to add reverb");
      expect(state2.notes[1]!.text).toBe("Check the low end");
    });
  });

  // ─── Debounce Behavior ────────────────────────────────────────────────

  describe("Debounce behavior", () => {
    it("calls writeFile only once after 2 seconds despite multiple rapid changes", async () => {
      const storageDirectory = "/tmp/extension-data";
      const setFilePath = "/path/to/Project.als";
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, storageDirectory);

      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      notesStore.initialize(setFilePath);
      await flushPromises();

      const unsub = notesStore.startAutoSave();

      // Dispatch multiple changes rapidly — each one triggers the subscriber
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Note one" });
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Note two" });
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Note three" });

      // Advance less than 2 seconds — no write yet
      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Advance the remaining time to trigger debounce
      await vi.advanceTimersByTimeAsync(1000);
      await flushPromises();

      // writeFile should be called exactly once
      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      // Verify all 3 notes are in the written data
      const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
      const writtenData = JSON.parse(writtenContent) as PersistenceFile;
      expect(writtenData.notes).toHaveLength(3);

      unsub();
    });

    it("resets the debounce timer on each new change", async () => {
      const storageDirectory = "/tmp/extension-data";
      const setFilePath = "/path/to/Project.als";
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, storageDirectory);

      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      notesStore.initialize(setFilePath);
      await flushPromises();

      const unsub = notesStore.startAutoSave();

      // First dispatch
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "First" });

      // Advance 1.5 seconds (less than debounce window)
      vi.advanceTimersByTime(1500);
      await flushPromises();
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Second dispatch resets the timer
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Second" });

      // Advance another 1.5 seconds — original timer would have fired, but reset happened
      vi.advanceTimersByTime(1500);
      await flushPromises();
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Advance the remaining 0.5 seconds to reach 2s from second dispatch
      await vi.advanceTimersByTimeAsync(500);
      await flushPromises();
      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      unsub();
    });
  });

  // ─── Project Switch ───────────────────────────────────────────────────

  describe("Project switch: save old → load new", () => {
    it("saves current project data and loads new project on switch", async () => {
      const storageDirectory = "/tmp/extension-data";
      const filePathA = "/path/to/ProjectA.als";
      const filePathB = "/path/to/ProjectB.als";

      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, storageDirectory);

      // Initialize with project A (no existing file)
      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      notesStore.initialize(filePathA);
      await flushPromises();

      // Add a note to project A
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Project A note" });

      // Now switch to project B — use the real derived project key for B
      const { deriveProjectKey } = await import("../utils/project-key.js");
      const projectKeyB = deriveProjectKey(filePathB);
      const projectBData: PersistenceFile = {
        schemaVersion: 1,
        projectKey: projectKeyB,
        notes: [{ id: "b-note-1", sectionId: "section-0", text: "Project B note", createdAt: 1000 }],
        checklistCompletions: {},
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(projectBData));

      notesStore.switchProject(filePathB);
      await flushPromises();

      // Verify: project A data was saved (writeFile called for old project)
      expect(mockWriteFile).toHaveBeenCalled();
      const saveCallContent = mockWriteFile.mock.calls[0]![1] as string;
      const savedData = JSON.parse(saveCallContent) as PersistenceFile;
      expect(savedData.notes).toHaveLength(1);
      expect(savedData.notes[0]!.text).toBe("Project A note");

      // Verify: project B data was loaded into the store
      const state = store.getState();
      expect(state.notes).toHaveLength(1);
      expect(state.notes[0]!.text).toBe("Project B note");
    });
  });

  // ─── Error Recovery ───────────────────────────────────────────────────

  describe("Error recovery: failed writes → retry on next cycle", () => {
    it("retains data in memory and retries write on next debounce cycle", async () => {
      const storageDirectory = "/tmp/extension-data";
      const setFilePath = "/path/to/Project.als";
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, storageDirectory);

      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      notesStore.initialize(setFilePath);
      await flushPromises();

      const unsub = notesStore.startAutoSave();

      // Make writeFile fail on first call, succeed on subsequent calls
      mockWriteFile
        .mockRejectedValueOnce(new Error("EACCES: permission denied"))
        .mockResolvedValue(undefined);

      // Add a note
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Important note" });

      // Advance debounce timer — first write attempt fails
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      // The note is still in memory
      expect(store.getState().notes).toHaveLength(1);
      expect(store.getState().notes[0]!.text).toBe("Important note");

      // Trigger another change to schedule a new save cycle
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Another note" });

      // Advance another debounce window — second write should succeed
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();

      // Second write attempt should succeed
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
      const writtenContent = mockWriteFile.mock.calls[1]![1] as string;
      const writtenData = JSON.parse(writtenContent) as PersistenceFile;
      expect(writtenData.notes).toHaveLength(2);

      unsub();
    });
  });

  // ─── Memory-Only Mode ─────────────────────────────────────────────────

  describe("Memory-only mode when storageDirectory undefined", () => {
    it("operates without any filesystem calls when storageDirectory is undefined", async () => {
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, undefined);

      notesStore.initialize("/path/to/Project.als");
      await flushPromises();

      // No fs calls should have been made
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockMkdir).not.toHaveBeenCalled();

      // Persistence should not be available
      expect(notesStore.isPersistenceAvailable()).toBe(false);

      // Store should reflect persistence unavailable
      expect(store.getState().persistenceAvailable).toBe(false);
    });

    it("does not write to disk even after state changes with auto-save active", async () => {
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, undefined);

      notesStore.initialize("/path/to/Project.als");
      await flushPromises();

      const unsub = notesStore.startAutoSave();

      // Add notes — should not trigger any fs calls
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Memory note" });
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "Another memory note" });

      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockMkdir).not.toHaveBeenCalled();

      // But notes still exist in memory
      expect(store.getState().notes).toHaveLength(2);

      unsub();
    });

    it("does not write on saveNow when storageDirectory is undefined", () => {
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, undefined);

      notesStore.initialize("/path/to/Project.als");
      store.dispatch({ type: "ADD_NOTE", sectionId: "section-0", text: "A note" });

      notesStore.saveNow();

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("initialize with undefined setFilePath enters memory-only mode", async () => {
      const store = createStoreWithSection("section-0");
      const notesStore = createNotesStore(store, "/tmp/storage");

      notesStore.initialize(undefined);
      await flushPromises();

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(store.getState().persistenceAvailable).toBe(false);
    });
  });
});
