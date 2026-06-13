/**
 * Track Reader — maps raw SDK track data into domain TrackInfo objects.
 *
 * Pure function with no side effects. Currently a 1:1 mapping but provides
 * the extension point for future classification logic (e.g., grouping,
 * role detection).
 */
import type { TrackData } from "../ableton/sdk-adapter.js";

// ─── Domain Types ──────────────────────────────────────────────────────

/** A track's name and type classification as used by the rest of the app. */
export interface TrackInfo {
  readonly name: string;
  readonly type: "midi" | "audio";
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Build a track inventory from raw SDK track data.
 *
 * Maps each `TrackData` to a `TrackInfo`, preserving name and type.
 * Returns an empty array when given an empty input.
 */
export function buildTrackInventory(tracks: TrackData[]): TrackInfo[] {
  return tracks.map((track) => ({
    name: track.name,
    type: track.type,
  }));
}
