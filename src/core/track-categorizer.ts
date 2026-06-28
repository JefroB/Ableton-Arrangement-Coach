/**
 * Track Categorizer — assigns tracks to frequency buckets based on name and device patterns.
 *
 * This module is a pure function with no side effects. It takes a track name
 * and an array of device names and returns a single frequency bucket assignment
 * using priority-ordered pattern matching.
 */

import { getTrackNamePatterns, getDeviceNamePatterns } from "./track-patterns-loader.js";

// ─── Domain Type ───────────────────────────────────────────────────────

/** The spectral region a track primarily occupies. */
export type FrequencyBucket = "sub" | "bass" | "low-mid" | "mid" | "high-mid" | "high" | "full";

// ─── Pattern Tables (loaded from externalized JSON via track-patterns-loader) ──

const TRACK_NAME_PATTERNS = getTrackNamePatterns();
const DEVICE_NAME_PATTERNS = getDeviceNamePatterns();

// ─── Pure Function ─────────────────────────────────────────────────────

/**
 * Assign a track to a frequency bucket based on its name and device names.
 *
 * Matching priority:
 * 1. Track name patterns (case-insensitive substring), checked in bucket priority order
 * 2. Device name patterns (case-insensitive substring), checked in bucket priority order
 * 3. Default: "full"
 *
 * @param trackName - The name of the track.
 * @param deviceNames - Array of device names on the track.
 * @returns The assigned frequency bucket.
 */
export function categorizeTrack(trackName: string, deviceNames: string[]): FrequencyBucket {
  const lowerTrackName = trackName.toLowerCase();

  // 1. Check track name patterns (priority order)
  for (const entry of TRACK_NAME_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (lowerTrackName.includes(pattern)) {
        return entry.bucket;
      }
    }
  }

  // 2. Check device name patterns (priority order)
  const lowerDeviceNames = deviceNames.map((d) => d.toLowerCase());
  for (const entry of DEVICE_NAME_PATTERNS) {
    for (const pattern of entry.patterns) {
      for (const deviceName of lowerDeviceNames) {
        if (deviceName.includes(pattern)) {
          return entry.bucket;
        }
      }
    }
  }

  // 3. Default bucket
  return "full";
}
