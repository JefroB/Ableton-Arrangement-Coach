/**
 * Arrangement Score Engine — computes a 1–10 score indicating how well
 * the user's energy curve matches the ideal energy curve for their genre.
 *
 * This module is a pure function with no side effects or SDK dependencies.
 * It receives curve data as plain arrays and returns the score result.
 */

// ─── Score Tier Mapping ────────────────────────────────────────────────

export interface ScoreTier {
  /** Hex color string for the score tier. */
  readonly color: string;
  /** Human-readable label for the score tier. */
  readonly label: string;
}

/**
 * Map a score (1–10) to its color tier.
 *
 * - Scores 8–10: Green #4caf50, "Good"
 * - Scores 5–7: Yellow #ffca28, "Acceptable"
 * - Scores 1–4: Red #f44336, "Needs Work"
 */
export function getScoreTier(score: number): ScoreTier {
  if (score >= 8) {
    return { color: "#4caf50", label: "Good" };
  }
  if (score >= 5) {
    return { color: "#ffca28", label: "Acceptable" };
  }
  return { color: "#f44336", label: "Needs Work" };
}

// ─── Interfaces ────────────────────────────────────────────────────────

export interface ArrangementScoreInput {
  /** Per-section energy scores (1–10) from the Energy Scorer. */
  readonly energyCurve: readonly number[];
  /** Ideal energy curve from the genre profile (values 1–10). */
  readonly idealCurve: readonly number[];
}

export interface ArrangementScoreResult {
  /** Overall score 1–10, or null if computation not possible. */
  readonly score: number | null;
  /** Shape similarity component (0–1). */
  readonly shapeSimilarity: number;
  /** Absolute proximity component (0–1). */
  readonly absoluteProximity: number;
}

// ─── Linear Interpolation Helper ───────────────────────────────────────

/**
 * Linearly interpolate an array of numbers to a target length.
 * Used when the arrangement has more sections than the template.
 *
 * Edge cases:
 * - targetLength < 2: returns a slice of the first element (or empty if source is empty)
 * - source.length < 2: returns the first element repeated to targetLength
 * - targetLength equals source.length: returns a copy of source
 */
export function interpolateCurve(source: readonly number[], targetLength: number): number[] {
  // Edge: empty source
  if (source.length === 0) {
    return [];
  }

  // Edge: targetLength <= 0
  if (targetLength <= 0) {
    return [];
  }

  // Edge: targetLength === 1
  if (targetLength < 2) {
    return [source[0]!];
  }

  // Edge: source has only one element — repeat it
  if (source.length < 2) {
    return Array.from({ length: targetLength }, () => source[0]!);
  }

  // Fast path: same length — return a copy
  if (targetLength === source.length) {
    return source.slice() as number[];
  }

  // General case: linear interpolation
  const result: number[] = new Array(targetLength);
  const sourceLastIndex = source.length - 1;
  const targetLastIndex = targetLength - 1;

  for (let i = 0; i < targetLength; i++) {
    // Map target index to source position
    const srcPos = (i / targetLastIndex) * sourceLastIndex;
    const lo = Math.floor(srcPos);
    const hi = Math.ceil(srcPos);

    if (lo === hi) {
      result[i] = source[lo]!;
    } else {
      const t = srcPos - lo;
      result[i] = source[lo]! * (1 - t) + source[hi]! * t;
    }
  }

  return result;
}

// ─── Arrangement Score Computation ─────────────────────────────────────

/**
 * Compute deltas (differences between consecutive elements) of a numeric array.
 */
function computeDeltas(curve: readonly number[]): number[] {
  const deltas: number[] = new Array(curve.length - 1);
  for (let i = 0; i < curve.length - 1; i++) {
    deltas[i] = curve[i + 1]! - curve[i]!;
  }
  return deltas;
}

/**
 * Compute cosine similarity of two vectors.
 * Returns a value in [-1, 1]. If either vector has zero magnitude,
 * returns 1.0 (no shape to compare means no shape penalty).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  // Zero-length delta vectors: default shape similarity to 1.0
  if (magA === 0 || magB === 0) {
    return 1.0;
  }

  return dotProduct / (magA * magB);
}

/**
 * Compute the arrangement score by comparing actual energy curve against
 * the ideal energy curve template.
 *
 * Returns null score when:
 * - energyCurve has fewer than 2 sections
 * - idealCurve is empty
 *
 * When energyCurve length differs from idealCurve length:
 * - Fewer sections: compare against the first N values of idealCurve
 * - More sections: linearly interpolate idealCurve to match section count
 */
export function computeArrangementScore(input: ArrangementScoreInput): ArrangementScoreResult {
  const { energyCurve, idealCurve } = input;

  // Edge case: insufficient data
  if (energyCurve.length < 2 || idealCurve.length === 0) {
    return { score: null, shapeSimilarity: 0, absoluteProximity: 0 };
  }

  // Step 1: Normalize template to match section count
  let normalizedIdeal: number[];
  if (energyCurve.length < idealCurve.length) {
    // Fewer sections: slice ideal to energyCurve.length
    normalizedIdeal = idealCurve.slice(0, energyCurve.length) as number[];
  } else if (energyCurve.length > idealCurve.length) {
    // More sections: linearly interpolate ideal to energyCurve.length
    normalizedIdeal = interpolateCurve(idealCurve, energyCurve.length);
  } else {
    // Equal: use as-is (copy)
    normalizedIdeal = idealCurve.slice() as number[];
  }

  // Step 2: Compute shape similarity (50% weight)
  const actualDeltas = computeDeltas(energyCurve);
  const idealDeltas = computeDeltas(normalizedIdeal);
  const cosine = cosineSimilarity(actualDeltas, idealDeltas);
  // Normalize cosine similarity from [-1, 1] to [0, 1]
  const shapeSimilarity = (cosine + 1) / 2;

  // Step 3: Compute absolute proximity (50% weight)
  let proximitySum = 0;
  for (let i = 0; i < energyCurve.length; i++) {
    proximitySum += 1 - Math.abs(energyCurve[i]! - normalizedIdeal[i]!) / 9;
  }
  const absoluteProximity = proximitySum / energyCurve.length;

  // Step 4: Combine
  const raw = 0.5 * shapeSimilarity + 0.5 * absoluteProximity;

  // Step 5: Scale to 1–10 and clamp
  const scaled = Math.round(raw * 9 + 1);
  const score = Math.max(1, Math.min(10, scaled));

  return { score, shapeSimilarity, absoluteProximity };
}
