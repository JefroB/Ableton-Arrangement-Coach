/**
 * Integration tests for the section generation flow.
 *
 * Tests the full orchestrator (`generateSections`) with mocked SDK methods,
 * covering Minimal Mode, Content Mode, partial failures, timeout behavior,
 * existing cue point removal, and missing genre data.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 11.5, 9.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateSections } from "./section-generator.js";
import type { SdkAdapter, CuePointHandle, LocatorData } from "../ableton/sdk-adapter.js";

// ─── Mock SDK Factory ──────────────────────────────────────────────────

/**
 * Creates a minimal mock SDK adapter with vi.fn() methods for fine-grained
 * control over return values and assertions.
 */
function createInlineMockSdk(overrides: Partial<{
  clips: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[];
  songDuration: number;
  tracks: { name: string; type: "midi" | "audio" }[];
  locators: LocatorData[];
  createCuePoint: (time: number) => Promise<CuePointHandle>;
  deleteCuePoint: (cuePoint: CuePointHandle) => Promise<void>;
}> = {}): SdkAdapter {
  const locators: LocatorData[] = [...(overrides.locators ?? [])];

  const mockCreateCuePoint = overrides.createCuePoint
    ? vi.fn(overrides.createCuePoint)
    : vi.fn(async (time: number): Promise<CuePointHandle> => {
        return { name: "", time };
      });

  const mockDeleteCuePoint = overrides.deleteCuePoint
    ? vi.fn(overrides.deleteCuePoint)
    : vi.fn(async (_cuePoint: CuePointHandle): Promise<void> => {
        // Remove last locator to simulate SDK deletion
        locators.pop();
      });

  return {
    readAllClips: vi.fn(() => overrides.clips ?? []),
    readSongDuration: vi.fn(() => overrides.songDuration ?? 0),
    readTracks: vi.fn(() => overrides.tracks ?? []),
    readLocators: vi.fn(() => [...locators]),
    createCuePoint: mockCreateCuePoint,
    deleteCuePoint: mockDeleteCuePoint,
    // Unused methods — stub to satisfy interface
    readPlayheadPosition: vi.fn(() => 0),
    readArrangementClips: vi.fn(() => []),
    readMidiNotes: vi.fn(() => []),
    readDevices: vi.fn(() => []),
    readDeviceParameters: vi.fn(() => []),
    readSetFilePath: vi.fn(() => undefined),
    setAlsPathOverride: vi.fn(),
    setAlsBufferOverride: vi.fn(),
    getAlsBufferOverride: vi.fn(() => undefined),
    readAudioClips: vi.fn(() => []),
    readTempo: vi.fn(() => 120),
    renderAudioTrack: vi.fn(async () => "/tmp/mock.wav"),
    getAudioTrackIndices: vi.fn(() => []),
    isTrackMuted: vi.fn(() => false),
  } as unknown as SdkAdapter;
}

// ─── Test Suite ────────────────────────────────────────────────────────

describe("section-generator integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Test 1: Full Minimal Mode Flow ────────────────────────────────

  it("completes full Minimal Mode flow with all markers created", async () => {
    // No clips, short duration → triggers minimal mode
    const sdk = createInlineMockSdk({
      clips: [],
      songDuration: 0,
      tracks: [{ name: "Track 1", type: "midi" }],
      locators: [],
    });

    const result = await generateSections(sdk, "peak-time-techno", 4);

    expect(result.success).toBe(true);
    expect(result.markersCreated).toBeGreaterThan(0);
    expect(result.markersCreated).toBe(result.markersExpected);
    expect(result.error).toBeUndefined();

    // createCuePoint should have been called for each marker
    expect(sdk.createCuePoint).toHaveBeenCalledTimes(result.markersCreated);
  });

  // ─── Test 2: Full Content Mode Flow ────────────────────────────────

  it("completes full Content Mode flow with clips triggering content detection", async () => {
    // 5+ unmuted clips at known positions across multiple tracks to trigger content mode
    // Clips at positions that share start/end points (boundaries at beat 0, 128, 256, 384)
    const clips = [
      { startTime: 0, endTime: 128, muted: false, trackIndex: 0 },
      { startTime: 0, endTime: 128, muted: false, trackIndex: 1 },
      { startTime: 128, endTime: 256, muted: false, trackIndex: 0 },
      { startTime: 128, endTime: 256, muted: false, trackIndex: 1 },
      { startTime: 256, endTime: 384, muted: false, trackIndex: 0 },
      { startTime: 256, endTime: 384, muted: false, trackIndex: 1 },
      { startTime: 384, endTime: 512, muted: false, trackIndex: 0 },
      { startTime: 384, endTime: 512, muted: false, trackIndex: 1 },
    ];

    const sdk = createInlineMockSdk({
      clips,
      songDuration: 512,
      tracks: [
        { name: "Drums", type: "midi" },
        { name: "Bass", type: "midi" },
      ],
      locators: [],
    });

    const result = await generateSections(sdk, "peak-time-techno", 4);

    expect(result.success).toBe(true);
    expect(result.markersCreated).toBeGreaterThan(0);
    expect(result.markersCreated).toBe(result.markersExpected);
    expect(result.error).toBeUndefined();

    // Verify createCuePoint was called for each generated marker
    expect(sdk.createCuePoint).toHaveBeenCalledTimes(result.markersCreated);
  });

  // ─── Test 3: Partial Failure Handling ──────────────────────────────

  it("handles partial failure when createCuePoint throws on the 3rd call", async () => {
    let callCount = 0;
    const sdk = createInlineMockSdk({
      clips: [],
      songDuration: 0,
      tracks: [{ name: "Track 1", type: "midi" }],
      locators: [],
      createCuePoint: async (time: number): Promise<CuePointHandle> => {
        callCount++;
        if (callCount === 3) {
          throw new Error("SDK CuePoint creation failed");
        }
        return { name: "", time };
      },
    });

    const result = await generateSections(sdk, "peak-time-techno", 4);

    expect(result.success).toBe(false);
    expect(result.markersCreated).toBe(2);
    expect(result.markersExpected).toBeGreaterThan(2);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("2");
    expect(result.failedSection).toBeDefined();
    expect(result.failedSection!.name).toBeTruthy();
    expect(result.failedSection!.beatPosition).toBeGreaterThanOrEqual(0);
  });

  // ─── Test 4: Timeout Behavior ──────────────────────────────────────

  it("returns timeout error when createCuePoint never resolves", async () => {
    vi.useFakeTimers();

    const sdk = createInlineMockSdk({
      clips: [],
      songDuration: 0,
      tracks: [{ name: "Track 1", type: "midi" }],
      locators: [],
      createCuePoint: (_time: number): Promise<CuePointHandle> => {
        // Never resolves — simulates a hung SDK call
        return new Promise(() => {});
      },
    });

    const resultPromise = generateSections(sdk, "peak-time-techno", 4);

    // Advance time past the 30-second timeout
    await vi.advanceTimersByTimeAsync(31_000);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain("timed out");
  });

  // ─── Test 5: Existing Cue Point Removal Before Generation ──────────

  it("removes existing cue points before creating new ones", async () => {
    const deletedHandles: CuePointHandle[] = [];
    const locators: LocatorData[] = [
      { name: "Intro", time: 0 },
      { name: "Main", time: 128 },
    ];

    // Track locators state — deleteCuePoint removes from the end
    const sdk = createInlineMockSdk({
      clips: [],
      songDuration: 0,
      tracks: [{ name: "Track 1", type: "midi" }],
      locators,
    });

    // Override deleteCuePoint to track calls and remove locators
    const originalReadLocators = sdk.readLocators.bind(sdk);
    let internalLocators = [...locators];
    (sdk.readLocators as ReturnType<typeof vi.fn>).mockImplementation(() => [...internalLocators]);
    (sdk.deleteCuePoint as ReturnType<typeof vi.fn>).mockImplementation(async (cp: CuePointHandle) => {
      deletedHandles.push(cp);
      internalLocators.pop();
    });

    const result = await generateSections(sdk, "peak-time-techno", 4);

    // Both existing cue points should have been deleted
    expect(deletedHandles).toHaveLength(2);

    // Then new markers should have been created
    expect(result.success).toBe(true);
    expect(result.markersCreated).toBeGreaterThan(0);

    // deleteCuePoint should have been called before createCuePoint
    const deleteOrder = (sdk.deleteCuePoint as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    const createOrder = (sdk.createCuePoint as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    const lastDelete = Math.max(...deleteOrder);
    const firstCreate = Math.min(...createOrder);
    expect(lastDelete).toBeLessThan(firstCreate);
  });

  // ─── Test 6: Missing Genre Data ───────────────────────────────────

  it("returns error when genre data is missing for the subgenre ID", async () => {
    const sdk = createInlineMockSdk({
      clips: [],
      songDuration: 0,
      tracks: [{ name: "Track 1", type: "midi" }],
      locators: [],
    });

    const result = await generateSections(sdk, "nonexistent-genre-xyz", 4);

    expect(result.success).toBe(false);
    expect(result.markersCreated).toBe(0);
    expect(result.markersExpected).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain("no arrangement data available");

    // No cue points should have been created
    expect(sdk.createCuePoint).not.toHaveBeenCalled();
  });
});
