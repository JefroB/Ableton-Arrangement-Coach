/**
 * Track Categorizer — assigns tracks to frequency buckets based on name and device patterns.
 *
 * This module is a pure function with no side effects. It takes a track name
 * and an array of device names and returns a single frequency bucket assignment
 * using priority-ordered pattern matching.
 */

// ─── Domain Type ───────────────────────────────────────────────────────

/** The spectral region a track primarily occupies. */
export type FrequencyBucket = "sub" | "bass" | "low-mid" | "mid" | "high-mid" | "high" | "full";

// ─── Pattern Tables ────────────────────────────────────────────────────

/**
 * Track name patterns checked in priority order.
 * First match wins — sub is checked before bass, so "sub bass" → "sub".
 */
const TRACK_NAME_PATTERNS: readonly { readonly bucket: FrequencyBucket; readonly patterns: readonly string[] }[] = [
  { bucket: "sub", patterns: ["sub", "808"] },
  { bucket: "bass", patterns: ["kick", "bass"] },
  { bucket: "low-mid", patterns: ["guitar", "keys"] },
  { bucket: "mid", patterns: ["pad", "strings", "chord", "piano"] },
  { bucket: "high-mid", patterns: ["lead", "vocal", "vox"] },
  { bucket: "high", patterns: ["hat", "hihat", "cymbal", "shaker", "perc"] },
];

/**
 * Device name patterns checked when no track name pattern matches.
 * First match wins across all device name entries.
 */
const DEVICE_NAME_PATTERNS: readonly { readonly bucket: FrequencyBucket; readonly patterns: readonly string[] }[] = [
  { bucket: "bass", patterns: ["operator", "drum rack"] },
  { bucket: "mid", patterns: ["simpler", "wavetable", "collision"] },
];

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
