/**
 * ALS Path Cache — persists a resolved .als file path to storage for
 * instant retrieval on subsequent invocations.
 *
 * The cache file (`als-path-cache.json`) is stored in the extension's
 * storage directory. Cache validity is gated by a song fingerprint:
 * if the current fingerprint doesn't match the cached one, the cache
 * is treated as stale.
 *
 * All writes are best-effort — errors are caught and logged so that
 * cache failures never break path resolution.
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";

// ─── Constants ─────────────────────────────────────────────────────────

const CACHE_FILENAME = "als-path-cache.json";
const CACHE_VERSION = 1;

// ─── Types ─────────────────────────────────────────────────────────────

/** Shape of the cache JSON file stored in storageDirectory. */
export interface AlsPathCacheData {
  readonly version: 1;
  readonly alsPath: string;
  readonly songFingerprint: string;
  readonly resolvedAt: number;
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Read the cached .als path from storage.
 *
 * Returns the cached path if the cache file exists, is valid JSON,
 * and its stored fingerprint matches `currentFingerprint`.
 * Returns `undefined` on any mismatch, missing file, or corrupt data.
 *
 * @param storageDirectory - The extension's persistent storage directory.
 * @param currentFingerprint - The current song fingerprint to validate against.
 * @returns The cached .als path, or `undefined` if the cache is invalid.
 */
export function readCachedPath(
  storageDirectory: string,
  currentFingerprint: string,
): string | undefined {
  try {
    const filePath = path.join(storageDirectory, CACHE_FILENAME);
    const raw = readFileSync(filePath, "utf-8");
    const data: unknown = JSON.parse(raw);

    if (!isValidCacheData(data)) {
      return undefined;
    }

    if (data.songFingerprint !== currentFingerprint) {
      return undefined;
    }

    return data.alsPath;
  } catch {
    // File doesn't exist, can't be read, or JSON is corrupt
    return undefined;
  }
}

/**
 * Write a resolved .als path to the cache file.
 *
 * This is a best-effort operation — errors are caught and logged
 * so that cache write failures never propagate to the caller.
 *
 * @param storageDirectory - The extension's persistent storage directory.
 * @param alsPath - The resolved .als file path to cache.
 * @param songFingerprint - The current song fingerprint for cache validation.
 */
export function writeCachedPath(
  storageDirectory: string,
  alsPath: string,
  songFingerprint: string,
): void {
  try {
    const filePath = path.join(storageDirectory, CACHE_FILENAME);
    const data: AlsPathCacheData = {
      version: CACHE_VERSION,
      alsPath,
      songFingerprint,
      resolvedAt: Date.now(),
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ALS Resolver] Failed to write cache:", err);
  }
}

/**
 * Delete the cache file (for invalidation).
 *
 * Silently succeeds if the file does not exist.
 *
 * @param storageDirectory - The extension's persistent storage directory.
 */
export function clearCachedPath(storageDirectory: string): void {
  try {
    const filePath = path.join(storageDirectory, CACHE_FILENAME);
    unlinkSync(filePath);
  } catch {
    // File didn't exist or couldn't be deleted — either is fine
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────

/**
 * Type guard ensuring the parsed JSON matches the expected cache shape.
 */
function isValidCacheData(data: unknown): data is AlsPathCacheData {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    obj["version"] === CACHE_VERSION &&
    typeof obj["alsPath"] === "string" &&
    typeof obj["songFingerprint"] === "string" &&
    typeof obj["resolvedAt"] === "number"
  );
}
