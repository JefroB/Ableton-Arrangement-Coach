/**
 * Structural Alignment Scorer — compares the user's arrangement sections
 * against a genre's structural template and produces a 0–100 alignment score.
 *
 * Pure function module with no side effects and no SDK calls.
 */
import type { GenreProfile, SectionTemplate } from "./genre-profile-types.js";
import type { Section } from "./section-scanner.js";

// ─── Public Types ──────────────────────────────────────────────────────

/** Result of structural alignment computation. */
export interface AlignmentResult {
  readonly overall: number; // 0–100
  readonly ordering: number; // 0–100
  readonly length: number; // 0–100
  readonly count: number; // 0–100
}

// ─── Dimension Weights ─────────────────────────────────────────────────

const ORDERING_WEIGHT = 0.4;
const LENGTH_WEIGHT = 0.35;
const COUNT_WEIGHT = 0.25;

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Compute how well an arrangement's sections align with a genre's structural template.
 *
 * @param sections - The arrangement's sections (ordered by startTime).
 * @param profile - The genre profile containing the structural template, or null.
 * @param bpm - The track's BPM (used for context; section times are in beats).
 * @returns AlignmentResult with overall and per-dimension scores, or null if no genre selected.
 */
export function computeAlignment(
  sections: readonly Section[],
  profile: GenreProfile | null,
  bpm: number,
): AlignmentResult | null {
  if (profile === null) {
    return null;
  }

  const template = profile.structure;

  if (sections.length === 0) {
    return { overall: 0, ordering: 0, length: 0, count: 0 };
  }

  const ordering = computeOrderingScore(sections, template);
  const length = computeLengthScore(sections, template);
  const count = computeCountScore(sections, template);

  const overall = Math.round(
    ORDERING_WEIGHT * ordering + LENGTH_WEIGHT * length + COUNT_WEIGHT * count,
  );

  return { overall, ordering, length, count };
}

// ─── Ordering Dimension (40%) ──────────────────────────────────────────

/**
 * Compute the ordering score using the Longest Common Subsequence (LCS)
 * of section names vs template section names, normalized by template length.
 *
 * Compares case-insensitively. Template sections (including optional ones)
 * define the expected ordering.
 */
function computeOrderingScore(
  sections: readonly Section[],
  template: readonly SectionTemplate[],
): number {
  if (template.length === 0) {
    return 100;
  }

  const sectionNames = sections.map((s) => s.name.toLowerCase());
  const templateNames = template.map((t) => t.name.toLowerCase());

  const lcsLength = longestCommonSubsequence(sectionNames, templateNames);

  // Normalize by template length
  return Math.round((lcsLength / templateNames.length) * 100);
}

/**
 * Compute the length of the longest common subsequence between two string arrays.
 * Uses dynamic programming.
 */
function longestCommonSubsequence(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = LCS length of a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  return dp[m]![n]!;
}

// ─── Length Dimension (35%) ────────────────────────────────────────────

/**
 * Compute the length score by matching each arrangement section to its
 * corresponding template section (by name) and scoring based on whether
 * the section's bar count falls within the template's lengthRange.
 *
 * - Full points if within range.
 * - Linear falloff to zero at 2× max or 0.5× min.
 * - Sections that don't match any template entry or have Infinity endTime
 *   are excluded from scoring.
 */
function computeLengthScore(
  sections: readonly Section[],
  template: readonly SectionTemplate[],
): number {
  // Build a map from lowercase template name to SectionTemplate
  const templateMap = new Map<string, SectionTemplate>();
  for (const t of template) {
    templateMap.set(t.name.toLowerCase(), t);
  }

  let totalScore = 0;
  let matchedCount = 0;

  for (const section of sections) {
    const tmpl = templateMap.get(section.name.toLowerCase());
    if (!tmpl) {
      continue; // No matching template section — skip
    }

    // Skip sections with undefined length (Infinity endTime)
    if (!isFinite(section.endTime)) {
      continue;
    }

    const sectionBeats = section.endTime - section.startTime;
    const sectionBars = sectionBeats / 4; // 4 beats per bar

    totalScore += scoreSectionLength(sectionBars, tmpl.lengthRange);
    matchedCount++;
  }

  if (matchedCount === 0) {
    return 0;
  }

  return Math.round((totalScore / matchedCount) * 100);
}

/**
 * Score a single section's length against a template's lengthRange.
 *
 * Returns a value in [0, 1]:
 * - 1.0 if within [min, max]
 * - Linear falloff below min: reaches 0 at 0.5 × min
 * - Linear falloff above max: reaches 0 at 2.0 × max
 */
function scoreSectionLength(
  bars: number,
  range: { readonly min: number; readonly max: number },
): number {
  if (bars >= range.min && bars <= range.max) {
    return 1.0;
  }

  if (bars < range.min) {
    // Linear falloff from min to 0.5×min
    const lowerBound = range.min * 0.5;
    if (bars <= lowerBound) {
      return 0;
    }
    return (bars - lowerBound) / (range.min - lowerBound);
  }

  // bars > range.max
  // Linear falloff from max to 2×max
  const upperBound = range.max * 2;
  if (bars >= upperBound) {
    return 0;
  }
  return (upperBound - bars) / (upperBound - range.max);
}

// ─── Count Dimension (25%) ─────────────────────────────────────────────

/**
 * Compute the count score as a ratio of actual non-optional sections
 * vs expected non-optional sections from the template.
 *
 * - Missing non-optional sections reduce the score proportionally.
 * - Extra sections (beyond what the template expects) also reduce the score.
 * - Optional sections missing from the arrangement incur no penalty.
 * - The score cannot go below 0.
 */
function computeCountScore(
  sections: readonly Section[],
  template: readonly SectionTemplate[],
): number {
  const nonOptionalTemplates = template.filter((t) => !t.optional);
  const expectedCount = nonOptionalTemplates.length;

  if (expectedCount === 0) {
    return 100;
  }

  // Count occurrences of each non-optional template name expected
  const nonOptionalNameCounts = new Map<string, number>();
  for (const t of nonOptionalTemplates) {
    const name = t.name.toLowerCase();
    nonOptionalNameCounts.set(name, (nonOptionalNameCounts.get(name) ?? 0) + 1);
  }

  // Build set of optional template names (lowercase)
  const optionalNames = new Set(
    template.filter((t) => t.optional).map((t) => t.name.toLowerCase()),
  );

  // Track how many times each non-optional name has been seen
  const seenNonOptional = new Map<string, number>();
  let matchedNonOptional = 0;
  let extraSections = 0;

  for (const section of sections) {
    const name = section.name.toLowerCase();
    const expectedForName = nonOptionalNameCounts.get(name);
    if (expectedForName !== undefined) {
      const seen = (seenNonOptional.get(name) ?? 0) + 1;
      seenNonOptional.set(name, seen);
      if (seen <= expectedForName) {
        matchedNonOptional++;
      } else {
        // Duplicate beyond what the template expects → extra
        extraSections++;
      }
    } else if (!optionalNames.has(name)) {
      // Section is neither a known non-optional nor optional template section → extra
      extraSections++;
    }
    // Optional sections present: no effect on score
  }

  // Missing non-optional sections
  const missingCount = Math.max(0, expectedCount - matchedNonOptional);

  // Score starts at 100, reduce by equal fraction per missing or extra section
  const penaltyPerSection = 1 / expectedCount;
  const totalPenalty = (missingCount + extraSections) * penaltyPerSection;

  const score = Math.max(0, 1 - totalPenalty);
  return Math.round(score * 100);
}
