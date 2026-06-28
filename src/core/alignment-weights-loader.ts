// --- src/core/alignment-weights-loader.ts ---
import alignmentWeightsData from "../data/scoring/alignment-weights.json" with { type: "json" };
import { deepFreeze, createFailHelper } from './loader-utils.js';

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AlignmentWeights {
  readonly ordering: number;
  readonly length: number;
  readonly count: number;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUIRED_KEYS: readonly (keyof AlignmentWeights)[] = [
  "ordering",
  "length",
  "count",
] as const;

const SUM_TOLERANCE = 0.001;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('alignment-weights.json');

/**
 * Validates the entire alignment-weights.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateAlignmentWeightsFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate exactly 3 top-level keys ──
  const actualKeys = Object.keys(root);
  if (actualKeys.length !== 3) {
    fail(
      "(root)",
      `expected exactly 3 top-level keys, got ${actualKeys.length}: [${actualKeys.join(", ")}]`
    );
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in root)) {
      fail("(root)", `missing required key "${key}"`);
    }
  }

  // ── Validate each weight field ──
  let sum = 0;
  for (const key of REQUIRED_KEYS) {
    const value = root[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(
        `${key}`,
        `expected finite number, got ${String(value)}`
      );
    }
    if (value < 0 || value > 1) {
      fail(
        `${key}`,
        `expected number in [0.0, 1.0], got ${value}`
      );
    }
    sum += value;
  }

  // ── Validate sum equals 1.0 within tolerance ──
  if (Math.abs(sum - 1.0) > SUM_TOLERANCE) {
    fail(
      "(root)",
      `weight sum ${sum} is not within ${SUM_TOLERANCE} of 1.0`
    );
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateAlignmentWeightsFile(alignmentWeightsData);

// Cast validated data to typed structures
const validatedData = alignmentWeightsData as unknown as AlignmentWeights;

// Deep freeze the data structure
const FROZEN_ALIGNMENT_WEIGHTS: AlignmentWeights = deepFreeze({ ...validatedData });

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the weight for ordering alignment. */
export function getOrderingWeight(): number {
  return FROZEN_ALIGNMENT_WEIGHTS.ordering;
}

/** Returns the weight for length alignment. */
export function getLengthWeight(): number {
  return FROZEN_ALIGNMENT_WEIGHTS.length;
}

/** Returns the weight for count alignment. */
export function getCountWeight(): number {
  return FROZEN_ALIGNMENT_WEIGHTS.count;
}

/** Returns all alignment weights as a frozen object. */
export function getAlignmentWeights(): AlignmentWeights {
  return FROZEN_ALIGNMENT_WEIGHTS;
}