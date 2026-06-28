// --- src/core/track-patterns-loader.ts ---
import { deepFreeze, createFailHelper } from './loader-utils.js';

/**
 * Track patterns loader module.
 *
 * Statically imports track-patterns.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as energy-weights-loader.ts.
 */
import trackPatternsData from "../data/categorization/track-patterns.json" with { type: "json" };

// ——— Types ———————————————————————————————————————————————————————————————————

/** Valid frequency bucket values for track categorization. */
export type FrequencyBucket =
  | "sub"
  | "bass"
  | "low-mid"
  | "mid"
  | "high-mid"
  | "high"
  | "full";

/** A single entry mapping a frequency bucket to its keyword patterns. */
export interface PatternEntry {
  readonly bucket: FrequencyBucket;
  readonly patterns: readonly string[];
}

// ——— Constants ———————————————————————————————————————————————————————————————

/** Valid FrequencyBucket values (excluding "full" which is not used in patterns). */
const VALID_BUCKETS: readonly string[] = [
  "sub",
  "bass",
  "low-mid",
  "mid",
  "high-mid",
  "high",
];

/** Required bucket order for trackNamePatterns. */
const TRACK_NAME_BUCKET_ORDER: readonly string[] = [
  "sub",
  "bass",
  "low-mid",
  "mid",
  "high-mid",
  "high",
];

/** Required bucket order for deviceNamePatterns. */
const DEVICE_NAME_BUCKET_ORDER: readonly string[] = ["bass", "mid"];

/** Pattern for valid pattern strings: lowercase letters, digits, hyphens, spaces. */
const PATTERN_REGEX = /^[a-z0-9\- ]+$/;

/** Maximum length of a pattern string. */
const MAX_PATTERN_LENGTH = 30;

// ——— Validation helpers ——————————————————————————————————————————————————————

const fail = createFailHelper('track-patterns.json');

/**
 * Validates a single pattern entry (bucket + patterns array).
 */
function validatePatternEntry(
  entry: unknown,
  index: number,
  arrayName: string,
  validBuckets: readonly string[]
): void {
  if (entry === null || typeof entry !== "object") {
    fail(
      `${arrayName}[${index}]`,
      `expected object, got ${entry === null ? "null" : typeof entry}`
    );
  }

  const record = entry as Record<string, unknown>;

  // Validate bucket field
  const bucket = record["bucket"];
  if (typeof bucket !== "string" || bucket.length === 0) {
    fail(
      `${arrayName}[${index}].bucket`,
      `expected non-empty string, got ${String(bucket)}`
    );
  }
  if (!validBuckets.includes(bucket)) {
    fail(
      `${arrayName}[${index}].bucket`,
      `invalid FrequencyBucket value "${bucket}" (expected one of: ${validBuckets.join(", ")})`
    );
  }

  // Validate patterns array
  const patterns = record["patterns"];
  if (!Array.isArray(patterns)) {
    fail(
      `${arrayName}[${index}].patterns`,
      `expected array, got ${typeof patterns}`
    );
  }
  if (patterns.length === 0) {
    fail(`${arrayName}[${index}].patterns`, "expected non-empty array");
  }

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    if (typeof pattern !== "string" || pattern.length === 0) {
      fail(
        `${arrayName}[${index}].patterns[${i}]`,
        `expected non-empty string, got ${String(pattern)}`
      );
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
      fail(
        `${arrayName}[${index}].patterns[${i}]`,
        `string exceeds max length of ${MAX_PATTERN_LENGTH} characters (got ${pattern.length})`
      );
    }
    if (!PATTERN_REGEX.test(pattern)) {
      fail(
        `${arrayName}[${index}].patterns[${i}]`,
        `invalid characters (expected a-z, 0-9, -, space)`
      );
    }
  }
}

/**
 * Validates bucket ordering and uniqueness within a patterns array.
 */
function validateBucketOrder(
  entries: readonly Record<string, unknown>[],
  arrayName: string,
  expectedOrder: readonly string[]
): void {
  // Check for duplicates
  const seen = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const bucket = entry["bucket"] as string;
    if (seen.has(bucket)) {
      fail(`${arrayName}[${i}].bucket`, `duplicate bucket "${bucket}"`);
    }
    seen.add(bucket);
  }

  // Check ordering matches expected
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const bucket = entry["bucket"] as string;
    const expected = expectedOrder[i]!;
    if (bucket !== expected) {
      fail(
        `${arrayName}[${i}].bucket`,
        `expected "${expected}" at index ${i} (got "${bucket}"), required order: ${expectedOrder.join(", ")}`
      );
    }
  }
}

/**
 * Validates the entire track-patterns.json structure.
 * Throws descriptive errors on any validation failure.
 */
function validateTrackPatternsFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // —— Validate trackNamePatterns ——
  const trackNamePatterns = root["trackNamePatterns"];
  if (!Array.isArray(trackNamePatterns)) {
    fail("trackNamePatterns", `expected array, got ${typeof trackNamePatterns}`);
  }
  if (trackNamePatterns.length === 0) {
    fail("trackNamePatterns", "expected non-empty array");
  }
  if (trackNamePatterns.length !== 6) {
    fail(
      "trackNamePatterns",
      `expected exactly 6 entries, got ${trackNamePatterns.length}`
    );
  }

  for (let i = 0; i < trackNamePatterns.length; i++) {
    validatePatternEntry(
      trackNamePatterns[i],
      i,
      "trackNamePatterns",
      VALID_BUCKETS
    );
  }

  validateBucketOrder(
    trackNamePatterns as Record<string, unknown>[],
    "trackNamePatterns",
    TRACK_NAME_BUCKET_ORDER
  );

  // —— Validate deviceNamePatterns ——
  const deviceNamePatterns = root["deviceNamePatterns"];
  if (!Array.isArray(deviceNamePatterns)) {
    fail("deviceNamePatterns", `expected array, got ${typeof deviceNamePatterns}`);
  }
  if (deviceNamePatterns.length === 0) {
    fail("deviceNamePatterns", "expected non-empty array");
  }

  for (let i = 0; i < deviceNamePatterns.length; i++) {
    validatePatternEntry(
      deviceNamePatterns[i],
      i,
      "deviceNamePatterns",
      VALID_BUCKETS
    );
  }

  validateBucketOrder(
    deviceNamePatterns as Record<string, unknown>[],
    "deviceNamePatterns",
    DEVICE_NAME_BUCKET_ORDER
  );
}

// ——— Validate track patterns file ——————————————————————————————————————————————

validateTrackPatternsFile(trackPatternsData);

// ——— Deep freeze helper ——————————————————————————————————————————————————————

const trackNamePatterns: readonly PatternEntry[] = deepFreeze(
  (trackPatternsData as { trackNamePatterns: PatternEntry[] }).trackNamePatterns
);

const deviceNamePatterns: readonly PatternEntry[] = deepFreeze(
  (trackPatternsData as { deviceNamePatterns: PatternEntry[] }).deviceNamePatterns
);

// ——— Accessor Functions ——————————————————————————————————————————————————————

/** Returns the track name patterns as a deeply frozen readonly array. */
export function getTrackNamePatterns(): readonly PatternEntry[] {
  return trackNamePatterns;
}

/** Returns the device name patterns as a deeply frozen readonly array. */
export function getDeviceNamePatterns(): readonly PatternEntry[] {
  return deviceNamePatterns;
}