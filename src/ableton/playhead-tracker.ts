/**
 * Playhead Tracker — polls the SDK for the current playhead position
 * and dispatches state updates only when the position changes.
 *
 * Uses a simple setInterval-based polling strategy. The caller receives
 * a stop function to tear down the interval when the extension deactivates.
 */
import type { SdkAdapter } from "./sdk-adapter.js";
import type { Store } from "../state/store.js";

/** Default polling interval in milliseconds. */
const DEFAULT_INTERVAL_MS = 100;

/**
 * Start polling the playhead position at a fixed interval.
 *
 * Dispatches an `UPDATE_PLAYHEAD` action to the store only when the
 * position actually changes, avoiding redundant state updates and
 * subscriber notifications.
 *
 * @param adapter - The SDK adapter used to read the playhead position.
 * @param store - The state store to dispatch position updates to.
 * @param intervalMs - Polling interval in milliseconds (default: 100).
 * @returns A stop function that clears the polling interval.
 */
export function startPlayheadTracking(
  adapter: SdkAdapter,
  store: Store,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  let lastPosition: number | null = null;

  const intervalId = setInterval(() => {
    const currentPosition = adapter.readPlayheadPosition();

    if (currentPosition !== lastPosition) {
      lastPosition = currentPosition;
      store.dispatch({ type: "UPDATE_PLAYHEAD", position: currentPosition });
    }
  }, intervalMs);

  return () => {
    clearInterval(intervalId);
  };
}
