/**
 * ALS Path Strategies — pure utility functions for resolving .als file paths.
 *
 * Pure function module. Accepts plain data, returns plain data.
 * No SDK calls, no side effects (except path.sep reference for normalization).
 */

import path from "node:path";

// ─── Hash Function ─────────────────────────────────────────────────────

/**
 * FNV-1a hash producing a 16-character hex string.
 * Uses two 32-bit halves for good distribution and collision resistance.
 * (Same pattern as src/utils/project-key.ts)
 */
function hashString(input: string): string {
  // FNV-1a 32-bit for first half
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }

  // FNV-1a 32-bit for second half (seeded differently)
  let h2 = 0x6c62272e;
  for (let i = 0; i < input.length; i++) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }

  return (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0");
}

// ─── Strategy Functions ────────────────────────────────────────────────

/**
 * Extract the project root from an AudioClip file path by locating the
 * last occurrence of a path separator followed by "Samples".
 *
 * Separator-agnostic: recognizes both `/Samples` and `\Samples` via regex.
 * Returns the substring before the last separator + "Samples" combination.
 * Returns undefined if "Samples" is not found in the path.
 *
 * @param clipFilePath - The full file path of an AudioClip.
 * @returns The project root directory, or undefined if "Samples" is not present.
 *
 * @example
 * extractProjectRoot("D:\\Music\\MyProject\\Samples\\Recorded\\audio.wav")
 * // → "D:\\Music\\MyProject"
 *
 * extractProjectRoot("/Users/me/Music/MyProject/Samples/Imported/clip.aif")
 * // → "/Users/me/Music/MyProject"
 */
export function extractProjectRoot(clipFilePath: string): string | undefined {
  // Match the last occurrence of /Samples or \Samples
  // We find all matches and take the last one
  const regex = /[/\\]Samples/g;
  let lastIndex = -1;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(clipFilePath)) !== null) {
    lastIndex = match.index;
  }

  if (lastIndex === -1) {
    return undefined;
  }

  // Return everything before the separator that precedes "Samples"
  const root = clipFilePath.slice(0, lastIndex);
  return root.length > 0 ? root : undefined;
}

/**
 * Given a list of .als files with modification times, return the full path
 * of the most recently modified file.
 *
 * @param files - Array of objects with `name` (filename) and `mtimeMs` (modification time in ms).
 * @param projectRoot - The directory containing the .als files.
 * @returns The full path of the file with the highest `mtimeMs`.
 * @throws {Error} If the files array is empty.
 *
 * @example
 * selectMostRecentAlsFile(
 *   [{ name: "old.als", mtimeMs: 100 }, { name: "new.als", mtimeMs: 200 }],
 *   "/projects/my-track"
 * )
 * // → "/projects/my-track/new.als"
 */
export function selectMostRecentAlsFile(
  files: Array<{ name: string; mtimeMs: number }>,
  projectRoot: string,
): string {
  if (files.length === 0) {
    throw new Error("files array must not be empty");
  }

  let mostRecent = files[0]!;
  for (let i = 1; i < files.length; i++) {
    if (files[i]!.mtimeMs > mostRecent.mtimeMs) {
      mostRecent = files[i]!;
    }
  }

  return path.join(projectRoot, mostRecent.name);
}

/**
 * Generate candidate Log.txt paths by walking up parent directories
 * from a starting directory. At each level, appends "Log.txt".
 *
 * Returns at most `maxLevels` candidates. Stops early if the filesystem
 * root is reached (parent === current).
 *
 * @param startDirectory - The directory to begin walking up from.
 * @param maxLevels - Maximum number of parent levels to check.
 * @returns Array of candidate paths, each ending in "Log.txt".
 *
 * @example
 * generateLogCandidates("/Users/me/.ableton/ext/storage", 3)
 * // → [
 * //   "/Users/me/.ableton/ext/storage/Log.txt",
 * //   "/Users/me/.ableton/ext/Log.txt",
 * //   "/Users/me/.ableton/Log.txt"
 * // ]
 */
export function generateLogCandidates(
  startDirectory: string,
  maxLevels: number,
): string[] {
  const candidates: string[] = [];
  let current = path.resolve(startDirectory);

  for (let i = 0; i < maxLevels; i++) {
    candidates.push(path.join(current, "Log.txt"));
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
  }

  return candidates;
}

/**
 * Parse a log tail string and return the last valid .als file path from
 * "Loading document" entries.
 *
 * Searches backward through the content for lines matching:
 *   `Loading document "<path>.als"`
 *
 * Skips entries containing "DefaultLiveSet.als" or "Templates".
 * Returns undefined if no valid match is found.
 *
 * @param logTail - The tail content of a Log.txt file to search.
 * @returns The extracted .als file path, or undefined if no valid entry found.
 *
 * @example
 * parseLogForAlsPath('Loading document "C:\\Music\\MyTrack.als"\n')
 * // → "C:\\Music\\MyTrack.als"
 */
export function parseLogForAlsPath(logTail: string): string | undefined {
  // Match all "Loading document" lines with .als paths
  const regex = /Loading document "([^"]+\.als)"/g;
  const matches: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(logTail)) !== null) {
    const filePath = match[1]!;
    // Skip excluded entries
    if (filePath.includes("DefaultLiveSet.als") || filePath.includes("Templates")) {
      continue;
    }
    matches.push(filePath);
  }

  // Return the last valid match (searching backward)
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}

/**
 * Normalize a file path to use the platform's native path separator.
 * Replaces both forward slashes and backslashes with `path.sep`.
 *
 * @param filePath - The file path to normalize.
 * @returns The normalized path using platform-native separators.
 *
 * @example
 * // On Windows:
 * normalizePath("C:/Users/me\\Music/track.als")
 * // → "C:\\Users\\me\\Music\\track.als"
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/[/\\]/g, path.sep);
}

/**
 * Derive a deterministic song fingerprint from song name and track names.
 * Uses FNV-1a hash over the song name concatenated with the first 10 track names.
 *
 * The fingerprint is used for cache invalidation: when the song or its tracks
 * change, the fingerprint changes, triggering re-resolution of the .als path.
 *
 * @param songName - The name of the current song.
 * @param trackNames - Array of track names in the song.
 * @returns A 16-character hex string fingerprint.
 *
 * @example
 * deriveSongFingerprint("My Track", ["Drums", "Bass", "Synth"])
 * // → "a1b2c3d4e5f6g7h8" (deterministic hex string)
 */
export function deriveSongFingerprint(
  songName: string,
  trackNames: string[],
): string {
  // Use song name + first 10 track names for the fingerprint
  const firstTen = trackNames.slice(0, 10);
  const input = songName + "\x00" + firstTen.join("\x00");
  return hashString(input);
}
