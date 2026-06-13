/**
 * Unit tests for the Playhead Tracker.
 *
 * Validates: Requirements 7.1, 7.2, 7.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startPlayheadTracking } from "./playhead-tracker.js";
import { createMockSdkAdapter } from "../../test/mock-sdk-adapter.js";
import { createStore } from "../state/store.js";

describe("Playhead Tracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls playhead position at the default interval (100ms)", () => {
    const adapter = createMockSdkAdapter({ playheadPosition: 0 });
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, "dispatch");

    const stop = startPlayheadTracking(adapter, store);

    // First tick at 100ms — position is 0, different from initial null
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "UPDATE_PLAYHEAD",
      position: 0,
    });

    stop();
  });

  it("polls at a custom interval when specified", () => {
    const adapter = createMockSdkAdapter({ playheadPosition: 10 });
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, "dispatch");

    const stop = startPlayheadTracking(adapter, store, 50);

    // Should not dispatch at 49ms
    vi.advanceTimersByTime(49);
    expect(dispatchSpy).not.toHaveBeenCalled();

    // Should dispatch at 50ms
    vi.advanceTimersByTime(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    stop();
  });

  it("dispatches UPDATE_PLAYHEAD when position changes", () => {
    const adapter = createMockSdkAdapter({ playheadPosition: 0 });
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, "dispatch");

    const stop = startPlayheadTracking(adapter, store);

    // First tick — dispatches initial position
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Change position
    adapter.setPlayheadPosition(16);
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "UPDATE_PLAYHEAD",
      position: 16,
    });

    stop();
  });

  it("skips dispatch when position has not changed", () => {
    const adapter = createMockSdkAdapter({ playheadPosition: 42 });
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, "dispatch");

    const stop = startPlayheadTracking(adapter, store);

    // First tick — dispatches because lastPosition starts as null
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Second tick — same position, no dispatch
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Third tick — still same, no dispatch
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    stop();
  });

  it("returns a stop function that clears the interval", () => {
    const adapter = createMockSdkAdapter({ playheadPosition: 0 });
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, "dispatch");

    const stop = startPlayheadTracking(adapter, store);

    // First tick triggers dispatch
    vi.advanceTimersByTime(100);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Stop tracking
    stop();

    // Change position — but interval is cleared, no more dispatches
    adapter.setPlayheadPosition(64);
    vi.advanceTimersByTime(500);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });
});
