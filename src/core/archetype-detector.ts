/**
 * Archetype Detector — identifies which arrangement archetype a track follows.
 *
 * Pure function module with no side effects. Analyzes sections, energy curve,
 * and optional genre profile to determine the best-matching archetype with
 * a confidence score.
 */

import type { Section } from "./section-scanner.js";
import type { ArchetypeId, GenreProfile } from "./genre-profile-types.js";
import {
  getArchetypePriority,
  getDropDetectionThreshold,
  getGenrePriorBoost,
  getMaxScoreCap,
  getLowConfidenceThreshold,
  getScoringThresholds,
} from "./archetype-config-loader.js";

// ─── Exported Interfaces ───────────────────────────────────────────────

export interface ArchetypeResult {
  readonly archetype: ArchetypeId;
  readonly confidence: number; // 0–100
  readonly lowConfidence: boolean;
}

// ─── Heuristic Helpers ─────────────────────────────────────────────────

/**
 * Compute section length in bars, assuming 4 beats per bar.
 * Returns 0 for sections with infinite endTime.
 */
function sectionBars(section: Section): number {
  if (!isFinite(section.endTime)) return 0;
  return (section.endTime - section.startTime) / 4;
}

/**
 * Check if a section name matches a pattern (case-insensitive substring).
 */
function nameMatches(sectionName: string, pattern: string): boolean {
  return sectionName.toLowerCase().includes(pattern.toLowerCase());
}

/**
 * Detect drops: energy increase of threshold+ points between consecutive sections
 * where the preceding section is a build.
 */
function countDrops(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const dropThreshold = getDropDetectionThreshold();
  let drops = 0;
  for (let i = 1; i < sections.length && i < energyCurve.length; i++) {
    const delta = energyCurve[i]! - energyCurve[i - 1]!;
    const prevIsBuild = nameMatches(sections[i - 1]!.name, "build");
    if (delta >= dropThreshold && prevIsBuild) {
      drops++;
    }
  }
  return drops;
}

/**
 * Count repeated structural patterns (same section-type sequences appearing 2+ times).
 * Looks for pairs like verse-chorus appearing multiple times.
 */
function countRepeatedPatterns(sections: readonly Section[]): number {
  if (sections.length < 4) return 0;

  // Build pairs of consecutive section names
  const pairs: string[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    pairs.push(`${sections[i]!.name.toLowerCase()}|${sections[i + 1]!.name.toLowerCase()}`);
  }

  // Count pairs that appear more than once
  const pairCounts = new Map<string, number>();
  for (const pair of pairs) {
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }

  let repeatedCount = 0;
  for (const count of pairCounts.values()) {
    if (count >= 2) repeatedCount++;
  }
  return repeatedCount;
}

/**
 * Get the intro length in bars (first section if it matches common intro names).
 */
function getIntroLengthBars(sections: readonly Section[]): number {
  const first = sections[0];
  if (!first) return 0;
  if (nameMatches(first.name, "intro")) {
    return sectionBars(first);
  }
  return 0;
}

/**
 * Get the outro length in bars (last section if it matches common outro names).
 */
function getOutroLengthBars(sections: readonly Section[]): number {
  const last = sections[sections.length - 1];
  if (!last) return 0;
  if (nameMatches(last.name, "outro")) {
    return sectionBars(last);
  }
  return 0;
}

// ─── Archetype Scoring Heuristics ──────────────────────────────────────

/**
 * DJ Tool: Short track, low energy range, long intro/outro relative to total,
 * few distinct section types, minimal dynamic variation.
 */
function scoreDjTool(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const t = getScoringThresholds().djTool;
  let score = 0;

  const energyMin = Math.min(...energyCurve);
  const energyMax = Math.max(...energyCurve);
  const energyRange = energyMax - energyMin;

  // Low energy range (DJ tools are relatively flat)
  if (energyRange <= t.energyRangeLow) score += t.energyRangeLowPoints;
  else if (energyRange <= t.energyRangeMid) score += t.energyRangeMidPoints;

  // Short section count (DJ tools are simple)
  if (sections.length <= t.sectionCountLow) score += t.sectionCountLowPoints;
  else if (sections.length <= t.sectionCountMid) score += t.sectionCountMidPoints;

  // Long intro and outro relative to track
  const introLen = getIntroLengthBars(sections);
  const outroLen = getOutroLengthBars(sections);
  if (introLen >= t.introOutroLongBars && outroLen >= t.introOutroLongBars) score += t.introOutroLongPoints;
  else if (introLen >= t.introOutroShortBars || outroLen >= t.introOutroShortBars) score += t.introOutroShortPoints;

  // Few unique section names (repetitive structure)
  const uniqueNames = new Set(sections.map((s) => s.name.toLowerCase()));
  if (uniqueNames.size <= t.uniqueNamesLow) score += t.uniqueNamesLowPoints;
  else if (uniqueNames.size <= t.uniqueNamesMid) score += t.uniqueNamesMidPoints;

  // No drops expected
  const drops = countDrops(sections, energyCurve);
  if (drops === 0) score += t.noDropsPoints;

  return Math.min(score, getMaxScoreCap());
}

/**
 * Peak-Valley: Alternating high and low energy sections,
 * multiple peaks and valleys creating a wave pattern.
 */
function scorePeakValley(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const t = getScoringThresholds().peakValley;
  let score = 0;

  const energyMin = Math.min(...energyCurve);
  const energyMax = Math.max(...energyCurve);
  const energyRange = energyMax - energyMin;

  // Needs meaningful energy range
  if (energyRange >= t.energyRangeHigh) score += t.energyRangeHighPoints;
  else if (energyRange >= t.energyRangeMid) score += t.energyRangeMidPoints;

  // Count direction changes (peaks and valleys)
  let directionChanges = 0;
  for (let i = 1; i < energyCurve.length - 1; i++) {
    const prev = energyCurve[i - 1]!;
    const curr = energyCurve[i]!;
    const next = energyCurve[i + 1]!;
    if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
      directionChanges++;
    }
  }

  // Multiple direction changes indicate peak-valley pattern
  if (directionChanges >= t.directionChangesHigh) score += t.directionChangesHighPoints;
  else if (directionChanges >= t.directionChangesMid) score += t.directionChangesMidPoints;
  else if (directionChanges >= t.directionChangesLow) score += t.directionChangesLowPoints;

  // More sections (peak-valley tracks tend to have more structure)
  if (sections.length >= t.sectionCountHigh) score += t.sectionCountHighPoints;
  else if (sections.length >= t.sectionCountMid) score += t.sectionCountMidPoints;

  // Has breakdowns (valleys)
  const hasBreakdown = sections.some((s) => nameMatches(s.name, "breakdown"));
  if (hasBreakdown) score += t.hasBreakdownPoints;

  // Multiple peaks
  let peaks = 0;
  for (let i = 0; i < energyCurve.length; i++) {
    if (energyCurve[i]! >= energyMax - 1) peaks++;
  }
  if (peaks >= t.peakCountThreshold) score += t.peakCountPoints;

  return Math.min(score, getMaxScoreCap());
}

/**
 * Verse-Chorus: Repeated verse-chorus patterns, moderate energy variation,
 * presence of named verse/chorus sections.
 */
function scoreVersechorus(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const t = getScoringThresholds().verseChorus;
  let score = 0;

  // Check for verse/chorus named sections
  const hasVerse = sections.some(
    (s) => nameMatches(s.name, "verse") || nameMatches(s.name, "evolution"),
  );
  const hasChorus = sections.some(
    (s) => nameMatches(s.name, "chorus") || nameMatches(s.name, "hook") || nameMatches(s.name, "main"),
  );

  if (hasVerse && hasChorus) score += t.bothVerseChrousPoints;
  else if (hasVerse || hasChorus) score += t.eitherVerseChorusPoints;

  // Repeated patterns (verse-chorus pairs appearing multiple times)
  const repeatedPatterns = countRepeatedPatterns(sections);
  if (repeatedPatterns >= t.repeatedPatternsHigh) score += t.repeatedPatternsHighPoints;
  else if (repeatedPatterns >= t.repeatedPatternsLow) score += t.repeatedPatternsLowPoints;

  // Moderate energy range (not too flat, not extreme)
  const energyRange = Math.max(...energyCurve) - Math.min(...energyCurve);
  if (energyRange >= t.energyRangeLow && energyRange <= t.energyRangeHigh) score += t.energyRangeNarrowPoints;
  else if (energyRange >= t.energyRangeWideLow && energyRange <= t.energyRangeWideHigh) score += t.energyRangeWidePoints;

  // Section count typical of verse-chorus structures
  if (sections.length >= t.sectionCountLow && sections.length <= t.sectionCountHigh) score += t.sectionCountRangePoints;
  else if (sections.length >= t.sectionCountLowMin) score += t.sectionCountMinOnlyPoints;

  return Math.min(score, getMaxScoreCap());
}

/**
 * Build-Drop: Clear builds followed by high-energy drops,
 * presence of build sections and significant energy jumps.
 */
function scoreBuildDrop(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const t = getScoringThresholds().buildDrop;
  let score = 0;

  // Count actual drops (energy jump after a build section)
  const drops = countDrops(sections, energyCurve);
  if (drops >= t.dropsHigh) score += t.dropsHighPoints;
  else if (drops >= t.dropsLow) score += t.dropsLowPoints;

  // Has build-named sections
  const buildSections = sections.filter((s) => nameMatches(s.name, "build"));
  if (buildSections.length >= t.buildSectionsHigh) score += t.buildSectionsHighPoints;
  else if (buildSections.length >= t.buildSectionsLow) score += t.buildSectionsLowPoints;

  // High energy range (builds create contrast)
  const energyRange = Math.max(...energyCurve) - Math.min(...energyCurve);
  if (energyRange >= t.energyRangeHigh) score += t.energyRangeHighPoints;
  else if (energyRange >= t.energyRangeMid) score += t.energyRangeMidPoints;

  // Has breakdown (common in build-drop structures)
  const hasBreakdown = sections.some((s) => nameMatches(s.name, "breakdown"));
  if (hasBreakdown) score += t.hasBreakdownPoints;

  // Moderate section count
  if (sections.length >= t.sectionCountLow && sections.length <= t.sectionCountHigh) score += t.sectionCountPoints;

  return Math.min(score, getMaxScoreCap());
}

/**
 * Continuous Evolution: Gradually changing energy, few repeated sections,
 * many unique section names, smooth energy progression.
 */
function scoreContinuousEvolution(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const t = getScoringThresholds().continuousEvolution;
  let score = 0;

  // Many unique section names (non-repetitive structure)
  const uniqueNames = new Set(sections.map((s) => s.name.toLowerCase()));
  const uniqueRatio = uniqueNames.size / sections.length;
  if (uniqueRatio >= t.uniqueRatioHigh) score += t.uniqueRatioHighPoints;
  else if (uniqueRatio >= t.uniqueRatioMid) score += t.uniqueRatioMidPoints;

  // Smooth energy changes (small consecutive deltas)
  let smoothCount = 0;
  for (let i = 1; i < energyCurve.length; i++) {
    const delta = Math.abs(energyCurve[i]! - energyCurve[i - 1]!);
    if (delta <= t.smoothDeltaMax) smoothCount++;
  }
  const smoothRatio = energyCurve.length > 1 ? smoothCount / (energyCurve.length - 1) : 0;
  if (smoothRatio >= t.smoothRatioHigh) score += t.smoothRatioHighPoints;
  else if (smoothRatio >= t.smoothRatioMid) score += t.smoothRatioMidPoints;

  // No repeated patterns
  const repeatedPatterns = countRepeatedPatterns(sections);
  if (repeatedPatterns === t.repeatedPatternsNone) score += t.repeatedPatternsNonePoints;
  else if (repeatedPatterns <= t.repeatedPatternsLow) score += t.repeatedPatternsLowPoints;

  // Moderate to high section count
  if (sections.length >= t.sectionCountHigh) score += t.sectionCountHighPoints;
  else if (sections.length >= t.sectionCountMid) score += t.sectionCountMidPoints;

  // No drops (evolution is gradual)
  const drops = countDrops(sections, energyCurve);
  if (drops === 0) score += t.noDropsPoints;

  return Math.min(score, getMaxScoreCap());
}

/**
 * Loop: Very few sections, minimal energy variation, high repetition,
 * short overall structure with looping intent.
 */
function scoreLoop(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  const t = getScoringThresholds().loop;
  let score = 0;

  // Very low energy range (loops are consistent)
  const energyRange = Math.max(...energyCurve) - Math.min(...energyCurve);
  if (energyRange <= t.energyRangeLow) score += t.energyRangeLowPoints;
  else if (energyRange <= t.energyRangeMid) score += t.energyRangeMidPoints;

  // Few sections
  if (sections.length <= t.sectionCountLow) score += t.sectionCountLowPoints;
  else if (sections.length <= t.sectionCountMid) score += t.sectionCountMidPoints;

  // Few unique section types (high repetition)
  const uniqueNames = new Set(sections.map((s) => s.name.toLowerCase()));
  if (uniqueNames.size <= t.uniqueNamesLow) score += t.uniqueNamesLowPoints;
  else if (uniqueNames.size <= t.uniqueNamesMid) score += t.uniqueNamesMidPoints;

  // No drops
  const drops = countDrops(sections, energyCurve);
  if (drops === 0) score += t.noDropsPoints;

  // No named intro/outro (loops don't have traditional intros)
  const introLen = getIntroLengthBars(sections);
  const outroLen = getOutroLengthBars(sections);
  if (introLen === 0 && outroLen === 0) score += t.noIntroOutroPoints;

  return Math.min(score, getMaxScoreCap());
}

// ─── Main Detection Logic ──────────────────────────────────────────────

/**
 * Detect the arrangement archetype for a given set of sections and energy curve.
 *
 * Returns the best-matching archetype with confidence score, or null if
 * fewer than 3 sections are provided (insufficient data).
 *
 * This is a pure function with no side effects.
 *
 * @param sections - Ordered array of arrangement sections.
 * @param energyCurve - Array of energy values (one per section).
 * @param profile - Optional genre profile for archetype prior boosting.
 * @returns ArchetypeResult or null if insufficient data.
 */
export function detectArchetype(
  sections: readonly Section[],
  energyCurve: readonly number[],
  profile: GenreProfile | null,
): ArchetypeResult | null {
  // Return null for fewer than 3 sections
  if (sections.length < 3) {
    return null;
  }

  // Score each archetype using heuristic functions
  const scores = new Map<ArchetypeId, number>([
    ["dj-tool", scoreDjTool(sections, energyCurve)],
    ["peak-valley", scorePeakValley(sections, energyCurve)],
    ["verse-chorus", scoreVersechorus(sections, energyCurve)],
    ["build-drop", scoreBuildDrop(sections, energyCurve)],
    ["continuous-evolution", scoreContinuousEvolution(sections, energyCurve)],
    ["loop", scoreLoop(sections, energyCurve)],
  ]);

  // Apply genre prior boost (clamped to max score cap)
  if (profile?.archetypes) {
    const genrePriorBoost = getGenrePriorBoost();
    const maxCap = getMaxScoreCap();
    for (const archetypeId of profile.archetypes) {
      const currentScore = scores.get(archetypeId);
      if (currentScore !== undefined) {
        scores.set(archetypeId, Math.min(currentScore + genrePriorBoost, maxCap));
      }
    }
  }

  // Find the highest score, using priority order for tie-breaking
  const priority = getArchetypePriority();
  let bestArchetype: ArchetypeId = priority[0] as ArchetypeId;
  let bestScore = -1;

  for (const archetype of priority) {
    const score = scores.get(archetype as ArchetypeId) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetype as ArchetypeId;
    }
  }

  return {
    archetype: bestArchetype,
    confidence: bestScore,
    lowConfidence: bestScore < getLowConfidenceThreshold(),
  };
}
