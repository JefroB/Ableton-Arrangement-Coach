/**
 * Structural Comparator
 *
 * Compares user arrangement sections against reference sections and produces
 * per-section delta metrics and aggregate comparison metrics.
 * Pure function — no SDK calls.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 10.1–10.8
 */
import type {
  UserSectionInput,
  ReferenceSection,
  ComparisonResult,
  SectionDelta,
  AggregateMetrics,
} from "./reference-types.js";
import type { GenreProfile, SectionTemplate } from "./genre-profile-types.js";

/**
 * Compare user arrangement sections against reference sections.
 * Pure function.
 *
 * Matching: ordinal (index-based pairing).
 * Deltas:
 *   - proportionDelta = (user duration / user total) - reference.proportion
 *   - timingDelta = (user startTime / user total) - (ref startTime / ref total)
 *   - durationDeltaBeats = user duration - ref duration
 *   - durationDeltaPercent = ((user duration - ref duration) / ref duration) * 100
 *     (null if ref duration is 0)
 *
 * Aggregate metrics:
 *   - totalDurationDifference = userTotalDuration - referenceTotalDuration
 *   - sectionCountDifference = userSections.length - referenceSections.length
 *   - peakPositionDifference = midpoint proportion of user's highest-energy section
 *       minus midpoint proportion of reference's longest section
 *
 * @returns ComparisonResult or null if either input is empty.
 */
export function computeComparison(
  userSections: readonly UserSectionInput[],
  referenceSections: readonly ReferenceSection[],
  userTotalDuration: number,
  referenceTotalDuration: number,
  genreProfile: GenreProfile | null,
): ComparisonResult | null {
  // Return null if either input array is empty
  if (userSections.length === 0 || referenceSections.length === 0) {
    return null;
  }

  const matchedCount = Math.min(userSections.length, referenceSections.length);
  const sectionDeltas: SectionDelta[] = [];

  // Matched sections (ordinal pairing)
  for (let i = 0; i < matchedCount; i++) {
    const user = userSections[i]!;
    const ref = referenceSections[i]!;

    const userDuration = user.endTime - user.startTime;
    const refDuration = ref.endTime - ref.startTime;

    const userProportion =
      userTotalDuration > 0 ? userDuration / userTotalDuration : 0;
    const proportionDelta = userProportion - ref.proportion;

    const userStartProportion =
      userTotalDuration > 0 ? user.startTime / userTotalDuration : 0;
    const refStartProportion =
      referenceTotalDuration > 0 ? ref.startTime / referenceTotalDuration : 0;
    const timingDelta = userStartProportion - refStartProportion;

    const durationDeltaBeats = userDuration - refDuration;
    const durationDeltaPercent =
      refDuration === 0
        ? null
        : ((userDuration - refDuration) / refDuration) * 100;

    const suggestion = generateSuggestion(
      user.label,
      userDuration,
      refDuration,
      durationDeltaPercent,
      genreProfile,
    );

    sectionDeltas.push({
      userLabel: user.label,
      referenceLabel: ref.label,
      proportionDelta,
      timingDelta,
      durationDeltaBeats,
      durationDeltaPercent,
      matched: true,
      suggestion,
    });
  }

  // Extra user sections (beyond reference count) — unmatched
  for (let i = matchedCount; i < userSections.length; i++) {
    const user = userSections[i]!;
    sectionDeltas.push({
      userLabel: user.label,
      referenceLabel: null,
      proportionDelta: null,
      timingDelta: null,
      durationDeltaBeats: null,
      durationDeltaPercent: null,
      matched: false,
      suggestion: null,
    });
  }

  // Extra reference sections (beyond user count) — unmatched
  for (let i = matchedCount; i < referenceSections.length; i++) {
    const ref = referenceSections[i]!;
    sectionDeltas.push({
      userLabel: ref.label,
      referenceLabel: ref.label,
      proportionDelta: null,
      timingDelta: null,
      durationDeltaBeats: null,
      durationDeltaPercent: null,
      matched: false,
      suggestion: null,
    });
  }

  const aggregateMetrics = computeAggregateMetrics(
    userSections,
    referenceSections,
    userTotalDuration,
    referenceTotalDuration,
  );

  return {
    sectionDeltas,
    aggregateMetrics,
  };
}

/**
 * Compute aggregate comparison metrics.
 *
 * - totalDurationDifference: user total beats - reference total beats
 * - sectionCountDifference: user section count - reference section count
 * - peakPositionDifference: midpoint proportion of user's highest-energy section
 *     minus midpoint proportion of reference's longest section
 */
function computeAggregateMetrics(
  userSections: readonly UserSectionInput[],
  referenceSections: readonly ReferenceSection[],
  userTotalDuration: number,
  referenceTotalDuration: number,
): AggregateMetrics {
  const totalDurationDifference = userTotalDuration - referenceTotalDuration;
  const sectionCountDifference =
    userSections.length - referenceSections.length;

  // Find user's highest-energy section midpoint proportion
  const userHighestEnergy = userSections.reduce((best, current) =>
    current.energyScore > best.energyScore ? current : best,
  );
  const userHighestMidpoint =
    (userHighestEnergy.startTime + userHighestEnergy.endTime) / 2;
  const userPeakProportion =
    userTotalDuration > 0 ? userHighestMidpoint / userTotalDuration : 0;

  // Find reference's longest section midpoint proportion
  const refLongest = referenceSections.reduce((best, current) => {
    const bestDuration = best.endTime - best.startTime;
    const currentDuration = current.endTime - current.startTime;
    return currentDuration > bestDuration ? current : best;
  });
  const refLongestMidpoint = (refLongest.startTime + refLongest.endTime) / 2;
  const refPeakProportion =
    referenceTotalDuration > 0
      ? refLongestMidpoint / referenceTotalDuration
      : 0;

  const peakPositionDifference = userPeakProportion - refPeakProportion;

  return {
    totalDurationDifference,
    peakPositionDifference,
    sectionCountDifference,
  };
}

/**
 * Find a matching SectionTemplate by case-insensitive name comparison.
 */
function findMatchingTemplate(
  label: string,
  genreProfile: GenreProfile,
): SectionTemplate | null {
  const lowerLabel = label.toLowerCase();
  return (
    genreProfile.structure.find(
      (t) => t.name.toLowerCase() === lowerLabel,
    ) ?? null
  );
}

/**
 * Generate a genre-contextual suggestion for a matched section delta.
 *
 * Rules (Requirements 10.1–10.8):
 *   - ≤ 2 sentences, ≤ 280 characters
 *   - If genreProfile is null → generic suggestion (no genre references)
 *   - If user label doesn't match any SectionTemplate → generic suggestion
 *   - If user section is longer than ref AND exceeds genre max → "exceeds both reference and genre norm"
 *   - If user section is shorter than ref BUT within genre [min, max] → note within genre norms
 *   - Otherwise → contextual suggestion referencing genre range
 *
 * @returns suggestion string or null when no meaningful delta exists
 */
export function generateSuggestion(
  userLabel: string,
  userDurationBeats: number,
  refDurationBeats: number,
  durationDeltaPercent: number | null,
  genreProfile: GenreProfile | null,
): string | null {
  // No delta to report if durations are equal (within a small tolerance)
  if (durationDeltaPercent === null) {
    return null;
  }

  const deltaPercent = Math.round(durationDeltaPercent);
  if (deltaPercent === 0) {
    return null;
  }

  const userBars = userDurationBeats / 4;
  const longerOrShorter = deltaPercent > 0 ? "longer" : "shorter";
  const absPercent = Math.abs(deltaPercent);

  // Generic suggestion (null genre profile or no template match)
  if (genreProfile === null) {
    return truncateSuggestion(
      `Your ${userLabel} is ${absPercent}% ${longerOrShorter} than the reference — consider whether the ${deltaPercent > 0 ? "extra length" : "shorter duration"} maintains listener engagement.`,
    );
  }

  const template = findMatchingTemplate(userLabel, genreProfile);

  if (template === null) {
    // No template match → generic suggestion (no genre-specific length references)
    return truncateSuggestion(
      `Your ${userLabel} is ${absPercent}% ${longerOrShorter} than the reference — consider whether the ${deltaPercent > 0 ? "extra length" : "shorter duration"} maintains listener engagement.`,
    );
  }

  // We have a genre template match — use genre-contextual logic
  const genreMin = template.lengthRange.min;
  const genreMax = template.lengthRange.max;
  const withinGenreRange = userBars >= genreMin && userBars <= genreMax;

  // Case: longer than ref AND exceeds genre max
  if (deltaPercent > 0 && userBars > genreMax) {
    return truncateSuggestion(
      `Your ${userLabel} exceeds both reference and genre norm at ${Math.round(userBars)} bars (genre max: ${genreMax}). Consider trimming to stay within the expected range.`,
    );
  }

  // Case: shorter than ref BUT within genre range
  if (deltaPercent < 0 && withinGenreRange) {
    return truncateSuggestion(
      `Your ${userLabel} is ${absPercent}% shorter than the reference but within genre norms (${genreMin}–${genreMax} bars). The reference may simply use a longer arrangement.`,
    );
  }

  // Case: longer than ref but within genre range
  if (deltaPercent > 0 && withinGenreRange) {
    return truncateSuggestion(
      `Your ${userLabel} is ${absPercent}% longer than the reference but within genre norms (${genreMin}–${genreMax} bars).`,
    );
  }

  // Case: shorter than ref AND below genre min
  if (deltaPercent < 0 && userBars < genreMin) {
    return truncateSuggestion(
      `Your ${userLabel} is ${absPercent}% shorter than the reference and below the genre minimum of ${genreMin} bars. Consider extending for genre alignment.`,
    );
  }

  // Fallback: general genre-aware suggestion
  return truncateSuggestion(
    `Your ${userLabel} is ${absPercent}% ${longerOrShorter} than the reference (genre range: ${genreMin}–${genreMax} bars).`,
  );
}

/**
 * Truncate a suggestion to ≤ 280 characters.
 * If truncation is needed, cuts at the last space before 277 chars and appends "...".
 */
function truncateSuggestion(suggestion: string): string {
  if (suggestion.length <= 280) {
    return suggestion;
  }
  // Find last space before 277 to allow for "..."
  const cutoff = suggestion.lastIndexOf(" ", 277);
  const cutAt = cutoff > 0 ? cutoff : 277;
  return suggestion.slice(0, cutAt) + "...";
}
