/**
 * Audio LRU Cache — a least-recently-used cache for AudioTrackSectionResult
 * keyed by track name and section beat range. Uses a Map's insertion-order
 * property: on access, an entry is deleted and re-inserted to move it to
 * the "most recently used" end. Eviction removes from the beginning (oldest).
 *
 * Max capacity: 200 entries (from RenderOrchestratorConfig.maxCacheEntries).
 */
import type { AudioCacheKey, AudioTrackSectionResult } from "./audio-content-types.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** Default maximum number of cached entries. */
const DEFAULT_MAX_ENTRIES = 200;

// ─── Key Serialization ─────────────────────────────────────────────────

/**
 * Serialize an AudioCacheKey to a unique string for use as a Map key.
 * Format: "trackName|startBeat|endBeat"
 */
function serializeKey(key: AudioCacheKey): string {
  return `${key.trackName}|${key.sectionStartBeat}|${key.sectionEndBeat}`;
}

// ─── LRU Cache Class ───────────────────────────────────────────────────

/**
 * LRU cache for per-track-per-section audio analysis results.
 *
 * Uses Map insertion-order semantics for O(1) get/set/eviction:
 * - On get: delete + re-insert moves entry to end (most recently used).
 * - On set: insert at end; if over capacity, delete from beginning (least recently used).
 */
export class AudioLruCache {
  private readonly cache = new Map<string, AudioTrackSectionResult>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Retrieve a cached result, marking it as recently used.
   * Returns undefined if the key is not in the cache.
   */
  get(key: AudioCacheKey): AudioTrackSectionResult | undefined {
    const serialized = serializeKey(key);
    const value = this.cache.get(serialized);

    if (value === undefined) {
      return undefined;
    }

    // Move to end (most recently used) by deleting and re-inserting
    this.cache.delete(serialized);
    this.cache.set(serialized, value);

    return value;
  }

  /**
   * Store a result in the cache. If the cache exceeds maxEntries,
   * the least-recently-used entry is evicted.
   */
  set(key: AudioCacheKey, value: AudioTrackSectionResult): void {
    const serialized = serializeKey(key);

    // If key already exists, delete it first so re-insert moves it to end
    if (this.cache.has(serialized)) {
      this.cache.delete(serialized);
    }

    this.cache.set(serialized, value);

    // Evict LRU (first entry in map) if over capacity
    if (this.cache.size > this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Clear all cached entries.
   */
  invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Return the current number of entries in the cache.
   */
  size(): number {
    return this.cache.size;
  }
}
