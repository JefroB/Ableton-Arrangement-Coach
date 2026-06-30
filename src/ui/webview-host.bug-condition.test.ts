/**
 * Bug Condition Exploration Test — Windows Path Encoding Corruption
 *
 * **Validates: Requirements 1.1, 1.2, 1.4**
 *
 * Property 1: Bug Condition — the URL passed to showModalDialog must start with
 * `data:text/html,` and decode to valid HTML containing `__INITIAL_STATE__`.
 *
 * CRITICAL: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * The current implementation constructs `file:///` URLs using per-segment
 * encodeURIComponent, which encodes the Windows drive letter colon as %3A,
 * producing malformed URLs like `file:///C%3A/Users/...`.
 *
 * After the fix, these tests will PASS because the function will use
 * `data:text/html,${encodeURIComponent(html)}` instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openWebviewPanel } from "./webview-host.js";
import { createStore } from "../state/store.js";
import type { Ui, Resources } from "@ableton-extensions/sdk";
import type { AnalysisOrchestrator } from "../core/analysis-orchestrator.js";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  // Clean up the global temp dir between tests
  delete (globalThis as any).__AC_TEMP_DIR__;
});

function createMockUi(dialogResult?: string): Ui {
  return {
    showModalDialog: vi.fn()
      .mockResolvedValueOnce(dialogResult)
      .mockResolvedValue(undefined),
  } as unknown as Ui;
}

function createMockResources(): Resources {
  return {
    getFileUri: vi.fn((path: string) => `file:///extension/${path}`),
  } as unknown as Resources;
}

function createMockOrchestrator(): AnalysisOrchestrator {
  return {
    runAnalysis: vi.fn(),
    invalidateCache: vi.fn(),
    handleReferenceScan: vi.fn(),
    isAnalyzing: vi.fn().mockReturnValue(false),
  };
}

describe("webview-host bug condition exploration", () => {
  /**
   * Bug Condition Test 1: Windows Drive Letter Path
   *
   * When __AC_TEMP_DIR__ is set to a Windows path (e.g., C:\Users\Test\AppData\Local\Temp),
   * the EXPECTED behavior is that the URL starts with `data:text/html,` and the decoded
   * content contains __INITIAL_STATE__.
   *
   * On UNFIXED code, this test FAILS because the function produces a `file:///` URL
   * with the colon encoded as %3A (e.g., file:///C%3A/Users/...).
   */
  it("URL must start with data:text/html and contain __INITIAL_STATE__ (temp dir path)", async () => {
    // Set a Windows-style temp directory path with drive letter
    (globalThis as any).__AC_TEMP_DIR__ = "C:\\Users\\Test\\AppData\\Local\\Temp";

    const ui = createMockUi();
    const resources = createMockResources();
    const store = createStore();
    const orchestrator = createMockOrchestrator();

    await openWebviewPanel(ui, resources, store, orchestrator);

    // Capture the URL passed to showModalDialog
    const url = (ui.showModalDialog as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    // EXPECTED BEHAVIOR (will pass after fix):
    // The URL must be a data:text/html URL, not a file:/// URL
    expect(url).toMatch(/^data:text\/html,/);

    // The decoded HTML content must contain the injected __INITIAL_STATE__
    const htmlContent = decodeURIComponent(url.replace("data:text/html,", ""));
    expect(htmlContent).toContain("__INITIAL_STATE__");
  });

  /**
   * Bug Condition Test 2: Fallback Path (no temp dir)
   *
   * When __AC_TEMP_DIR__ is undefined, the function falls back to using __dirname
   * to construct the URL. On Windows, this also produces a malformed file:/// URL.
   *
   * The EXPECTED behavior after the fix is that the URL starts with `data:text/html,`
   * regardless of the temp dir availability.
   */
  it("URL must start with data:text/html and contain __INITIAL_STATE__ (fallback path)", async () => {
    // __AC_TEMP_DIR__ is undefined — triggers the fallback path
    (globalThis as any).__AC_TEMP_DIR__ = undefined;

    const ui = createMockUi();
    const resources = createMockResources();
    const store = createStore();
    const orchestrator = createMockOrchestrator();

    await openWebviewPanel(ui, resources, store, orchestrator);

    // Capture the URL passed to showModalDialog
    const url = (ui.showModalDialog as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    // EXPECTED BEHAVIOR (will pass after fix):
    // The URL must be a data:text/html URL, not a file:/// URL
    expect(url).toMatch(/^data:text\/html,/);

    // The decoded HTML content must contain the injected __INITIAL_STATE__
    const htmlContent = decodeURIComponent(url.replace("data:text/html,", ""));
    expect(htmlContent).toContain("__INITIAL_STATE__");
  });

  /**
   * Bug Condition Test 3: Windows path with spaces
   *
   * Paths like "C:\Users\John Smith\AppData\..." have spaces that get double-encoded
   * when using per-segment encodeURIComponent. The expected behavior is data:text/html.
   */
  it("URL must start with data:text/html even with spaces in path", async () => {
    // Set a Windows path with spaces in the username
    (globalThis as any).__AC_TEMP_DIR__ = "C:\\Users\\John Smith\\AppData\\Local\\Temp";

    const ui = createMockUi();
    const resources = createMockResources();
    const store = createStore();
    const orchestrator = createMockOrchestrator();

    await openWebviewPanel(ui, resources, store, orchestrator);

    // Capture the URL passed to showModalDialog
    const url = (ui.showModalDialog as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

    // EXPECTED BEHAVIOR (will pass after fix):
    // The URL must be a data:text/html URL, not a file:/// URL
    expect(url).toMatch(/^data:text\/html,/);

    // The decoded HTML content must contain the injected __INITIAL_STATE__
    const htmlContent = decodeURIComponent(url.replace("data:text/html,", ""));
    expect(htmlContent).toContain("__INITIAL_STATE__");
  });


});
