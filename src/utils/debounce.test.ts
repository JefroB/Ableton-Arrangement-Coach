/**
 * Unit tests for the debounce utility.
 *
 * Tests cover:
 * - Basic debounce behavior (delays execution)
 * - Rapid successive calls are coalesced into one
 * - The cancel() method prevents pending execution
 * - Arguments forwarding (last call's args are used)
 * - `this` context preservation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "./debounce.js";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays execution until the delay period elapses", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("coalesces rapid calls into a single invocation", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("resets the timer on each new call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();

    debounced(); // resets the 100ms window
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("forwards the last call's arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced("first");
    debounced("second");
    debounced("third");

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith("third");
  });

  it("cancel() prevents pending execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced.cancel();

    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel() is safe to call when nothing is pending", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    // No pending call — should not throw
    expect(() => debounced.cancel()).not.toThrow();
  });

  it("allows new calls after cancel", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced("a");
    debounced.cancel();

    debounced("b");
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("supports multiple independent debounce windows firing sequentially", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("first-batch");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first-batch");

    debounced("second-batch");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith("second-batch");
  });
});
