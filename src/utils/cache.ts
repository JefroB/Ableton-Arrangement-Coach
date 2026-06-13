/**
 * Cache utility — a simple in-memory key-value cache for storing
 * previously computed analysis results.
 *
 * The cache avoids redundant re-computation when inputs haven't changed.
 * Cache keys are typically derived from `JSON.stringify({ sectionIds, trackNames, genreId })`.
 * When any of these inputs change, the entire cache should be invalidated.
 */

// ─── Interfaces ────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  readonly key: string;
  readonly value: T;
}

export interface AnalysisCache {
  /** Get cached result or undefined if cache miss. */
  get(key: string): CacheEntry<unknown> | undefined;
  /** Store a result with the given cache key. */
  set(key: string, value: unknown): void;
  /** Invalidate the entire cache. */
  invalidate(): void;
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Create a simple in-memory cache backed by a Map.
 *
 * @returns An `AnalysisCache` instance with `get`, `set`, and `invalidate` methods.
 */
export function createAnalysisCache(): AnalysisCache {
  const store = new Map<string, unknown>();

  return {
    get(key: string): CacheEntry<unknown> | undefined {
      if (!store.has(key)) {
        return undefined;
      }
      return { key, value: store.get(key) };
    },

    set(key: string, value: unknown): void {
      store.set(key, value);
    },

    invalidate(): void {
      store.clear();
    },
  };
}
