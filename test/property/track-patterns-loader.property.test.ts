/**
 * Property-based tests for the Track Patterns Loader module.
 *
 * Feature: track-categorizer-dj-scorer-externalization
 * Property 2: Track patterns validation rejects all invalid inputs with descriptive errors
 *
 * Validates: Requirements 3.3, 5.7, 11.4
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

// ——— Constants ———————————————————————————————————————————————————————————————
const VALID_BUCKETS = ["sub", "bass", "low-mid", "mid", "high-mid", "high"] as const;
const TRACK_NAME_BUCKET_ORDER = ["sub", "bass", "low-mid", "mid", "high-mid", "high"];
const DEVICE_NAME_BUCKET_ORDER = ["bass", "mid"];
const PATTERN_REGEX = /^[a-z0-9\- ]+$/;
const MAX_PATTERN_LENGTH = 30;

// ——— Helpers ———————————————————————————————————————————————————————————————————
/** Builds a valid base track-patterns structure for mutation. */
function buildValidData() {
  return {
    trackNamePatterns: [
      { bucket: "sub", patterns: ["sub", "808"] },
      { bucket: "bass", patterns: ["kick", "bass"] },
      { bucket: "low-mid", patterns: ["guitar", "keys"] },
      { bucket: "mid", patterns: ["pad", "strings", "chord", "piano"] },
      { bucket: "high-mid", patterns: ["lead", "vocal", "vox"] },
      { bucket: "high", patterns: ["hat", "hihat", "cymbal", "shaker", "perc"] },
    ],
    deviceNamePatterns: [
      { bucket: "bass", patterns: ["operator", "drum rack"] },
      { bucket: "mid", patterns: ["simpler", "wavetable", "collision"] },
    ],
  };
}

/**
 * Attempts to load the track-patterns-loader module with mocked JSON data.
 * Returns the error thrown during module initialization, or null if no error.
 */
async function loadWithData(data: unknown): Promise<Error | null> {
  vi.doMock("../../src/data/categorization/track-patterns.json", () => ({
    default: data,
  }));

  try {
    await import("../../src/core/track-patterns-loader.js");
    return null;
  } catch (e) {
    if (e instanceof Error) return e;
    return new Error(String(e));
  } finally {
    vi.doUnmock("../../src/data/categorization/track-patterns.json");
    vi.resetModules();
  }
}

// ——— Generators ———————————————————————————————————————————————————————————————
/** Generates a string with invalid characters (uppercase, special chars, etc.) */
const invalidCharPatternArb = fc.stringOf(
  fc.oneof(
    fc.char().filter((c) => !PATTERN_REGEX.test(c)),
    fc.constantFrom("A", "B", "Z", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")")
  ),
  { minLength: 1, maxLength: 20 }
);

/** Generates a string exceeding 30 characters using only valid characters */
const tooLongPatternArb = fc.stringOf(
  fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h"),
  { minLength: 31, maxLength: 50 }
);

/** Generates an invalid bucket value (not in the valid set) */
const invalidBucketArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !(VALID_BUCKETS as readonly string[]).includes(s));

// ——— Property 2 Tests ————————————————————————————————————————————————————————
describe("Feature: track-categorizer-dj-scorer-externalization, Property 2: Track patterns validation rejects all invalid inputs with descriptive errors", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects empty trackNamePatterns array", async () => {
    const data = buildValidData();
    data.trackNamePatterns = [];

    const error = await loadWithData(data);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("track-patterns.json");
    expect(error!.message).toContain("trackNamePatterns");
  });

  it("rejects empty deviceNamePatterns array", async () => {
    const data = buildValidData();
    data.deviceNamePatterns = [];

    const error = await loadWithData(data);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("track-patterns.json");
    expect(error!.message).toContain("deviceNamePatterns");
  });

  it("rejects missing trackNamePatterns field", async () => {
    const data = buildValidData();
    delete (data as Record<string, unknown>).trackNamePatterns;

    const error = await loadWithData(data);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("track-patterns.json");
    expect(error!.message).toContain("trackNamePatterns");
  });

  it("rejects missing deviceNamePatterns field", async () => {
    const data = buildValidData();
    delete (data as Record<string, unknown>).deviceNamePatterns;

    const error = await loadWithData(data);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("track-patterns.json");
    expect(error!.message).toContain("deviceNamePatterns");
  });

  it("rejects invalid bucket values (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidBucketArb,
        fc.integer({ min: 0, max: 5 }),
        async (invalidBucket, index) => {
          const data = buildValidData();
          data.trackNamePatterns[index]!.bucket = invalidBucket as any;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          expect(error!.message).toContain("bucket");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects duplicate bucket values (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_BUCKETS),
        async (duplicateBucket) => {
          const data = buildValidData();
          // Set two entries to the same bucket (keeping correct order broken)
          const firstIdx = TRACK_NAME_BUCKET_ORDER.indexOf(duplicateBucket);
          const secondIdx = (firstIdx + 1) % 6;
          data.trackNamePatterns[secondIdx]!.bucket = duplicateBucket as any;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          // Error should mention either "duplicate" or ordering issue
          expect(
            error!.message.includes("duplicate") || error!.message.includes("order") || error!.message.includes("expected")
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects wrong bucket ordering (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        async (swapIdx) => {
          const data = buildValidData();
          // Swap two adjacent entries to break ordering
          const temp = data.trackNamePatterns[swapIdx]!;
          data.trackNamePatterns[swapIdx] = data.trackNamePatterns[swapIdx + 1]!;
          data.trackNamePatterns[swapIdx + 1] = temp;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          expect(error!.message).toContain("bucket");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects pattern strings exceeding 30 characters (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        tooLongPatternArb,
        fc.integer({ min: 0, max: 5 }),
        async (longPattern, entryIndex) => {
          const data = buildValidData();
          data.trackNamePatterns[entryIndex]!.patterns.push(longPattern);

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          expect(error!.message).toContain("patterns");
          expect(error!.message).toMatch(/length|characters/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects pattern strings with invalid characters (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidCharPatternArb,
        fc.integer({ min: 0, max: 5 }),
        async (invalidPattern, entryIndex) => {
          const data = buildValidData();
          data.trackNamePatterns[entryIndex]!.patterns = [invalidPattern];

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          expect(error!.message).toContain("patterns");
          expect(error!.message).toContain("invalid characters");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects empty patterns arrays within entries (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (entryIndex) => {
          const data = buildValidData();
          data.trackNamePatterns[entryIndex]!.patterns = [];

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          expect(error!.message).toContain("patterns");
          expect(error!.message).toContain("non-empty");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects entries with missing bucket field (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (entryIndex) => {
          const data = buildValidData();
          delete (data.trackNamePatterns[entryIndex] as Record<string, unknown>).bucket;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("track-patterns.json");
          expect(error!.message).toContain("bucket");
        }
      ),
      { numRuns: 100 }
    );
  });
});
