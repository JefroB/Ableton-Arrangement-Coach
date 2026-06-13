/**
 * Reference Detector — identifies the reference track by matching track names
 * against defined naming patterns.
 *
 * This module is a pure function with no side effects. It takes an array of
 * track descriptors and returns the index of the first non-muted track whose
 * name matches the reference pattern, or null if no match is found.
 */

import { TrackDescriptor } from "./reference-types";

// ─── Pattern Matching ──────────────────────────────────────────────────

/**
 * Check whether a trimmed, lowercased track name matches the reference pattern.
 *
 * Matching rules (case-insensitive, after trimming whitespace):
 * - Exact: "ref", "reference"
 * - Prefix: "ref "..., "reference "...
 * - Contains: "[ref]", "[reference]"
 */
function matchesReferencePattern(trimmedLower: string): boolean {
  // Exact matches
  if (trimmedLower === "ref" || trimmedLower === "reference") {
    return true;
  }

  // Prefix matches (name starts with "ref " or "reference ")
  if (trimmedLower.startsWith("ref ") || trimmedLower.startsWith("reference ")) {
    return true;
  }

  // Contains matches
  if (trimmedLower.includes("[ref]") || trimmedLower.includes("[reference]")) {
    return true;
  }

  return false;
}

// ─── Pure Function ─────────────────────────────────────────────────────

/**
 * Detect the reference track from the track list.
 * Pure function — no SDK calls.
 *
 * @param tracks - Array of track descriptors with name and muted fields.
 * @returns The index in the original array of the first matching non-muted track, or null.
 */
export function detectReferenceTrack(tracks: readonly TrackDescriptor[]): number | null {
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];

    // Skip muted tracks
    if (track.muted) {
      continue;
    }

    // Trim whitespace from name
    const trimmed = track.name.trim();

    // Skip empty/whitespace-only names
    if (trimmed.length === 0) {
      continue;
    }

    // Case-insensitive matching
    const lower = trimmed.toLowerCase();

    if (matchesReferencePattern(lower)) {
      return i;
    }
  }

  return null;
}
