/**
 * Archetype Detector — identifies which arrangement archetype a track follows.
 *
 * Pure function module with no side effects. Analyzes sections, energy curve,
 * and optional genre profile to determine the best-matching archetype with
 * a confidence score.
 */

import type { Section } from "./section-scanner.js";
import type { ArchetypeId, GenreProfile } from "./genre-profile-types.js";

// ─── Exported Interfaces ───────────────────────────────────────────────

export interface ArchetypeResult {
  readonly archetype: ArchetypeId;
  readonly confidence: number; // 0–100
  readonly lowConfidence: boolean;
}

// ─── Priority Order (for tie-breaking) ─────────────────────────────────

/** Tie-breaking priority: first in this list wins ties. */
const ARCHETYPE_PRIORITY: readonly ArchetypeId[] = [
  "dj-tool",
  "build-drop",
  "verse-chorus",
  "peak-valley",
  "loop",
  "continuous-evolution",
];

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
 * Detect drops: energy increase of 5+ points between consecutive sections
 * where the preceding section is a build.
 */
function countDrops(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  let drops = 0;
  for (let i = 1; i < sections.length && i < energyCurve.length; i++) {
    const delta = energyCurve[i]! - energyCurve[i - 1]!;
    const prevIsBuild = nameMatches(sections[i - 1]!.name, "build");
    if (delta >= 5 && prevIsBuild) {
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
  let score = 0;

  const energyMin = Math.min(...energyCurve);
  const energyMax = Math.max(...energyCurve);
  const energyRange = energyMax - energyMin;

  // Low energy range (DJ tools are relatively flat)
  if (energyRange <= 3) score += 30;
  else if (energyRange <= 5) score += 15;

  // Short section count (DJ tools are simple)
  if (sections.length <= 5) score += 20;
  else if (sections.length <= 7) score += 10;

  // Long intro and outro relative to track
  const introLen = getIntroLengthBars(sections);
  const outroLen = getOutroLengthBars(sections);
  if (introLen >= 16 && outroLen >= 16) score += 25;
  else if (introLen >= 8 || outroLen >= 8) score += 10;

  // Few unique section names (repetitive structure)
  const uniqueNames = new Set(sections.map((s) => s.name.toLowerCase()));
  if (uniqueNames.size <= 3) score += 15;
  else if (uniqueNames.size <= 5) score += 5;

  // No drops expected
  const drops = countDrops(sections, energyCurve);
  if (drops === 0) score += 10;

  return Math.min(score, 100);
}

/**
 * Peak-Valley: Alternating high and low energy sections,
 * multiple peaks and valleys creating a wave pattern.
 */
function scorePeakValley(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  let score = 0;

  const energyMin = Math.min(...energyCurve);
  const energyMax = Math.max(...energyCurve);
  const energyRange = energyMax - energyMin;

  // Needs meaningful energy range
  if (energyRange >= 5) score += 25;
  else if (energyRange >= 3) score += 10;

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
  if (directionChanges >= 3) score += 35;
  else if (directionChanges >= 2) score += 20;
  else if (directionChanges >= 1) score += 10;

  // More sections (peak-valley tracks tend to have more structure)
  if (sections.length >= 7) score += 15;
  else if (sections.length >= 5) score += 10;

  // Has breakdowns (valleys)
  const hasBreakdown = sections.some((s) => nameMatches(s.name, "breakdown"));
  if (hasBreakdown) score += 15;

  // Multiple peaks
  let peaks = 0;
  for (let i = 0; i < energyCurve.length; i++) {
    if (energyCurve[i]! >= energyMax - 1) peaks++;
  }
  if (peaks >= 2) score += 10;

  return Math.min(score, 100);
}

/**
 * Verse-Chorus: Repeated verse-chorus patterns, moderate energy variation,
 * presence of named verse/chorus sections.
 */
function scoreVersechorus(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  let score = 0;

  // Check for verse/chorus named sections
  const hasVerse = sections.some(
    (s) => nameMatches(s.name, "verse") || nameMatches(s.name, "evolution"),
  );
  const hasChorus = sections.some(
    (s) => nameMatches(s.name, "chorus") || nameMatches(s.name, "hook") || nameMatches(s.name, "main"),
  );

  if (hasVerse && hasChorus) score += 30;
  else if (hasVerse || hasChorus) score += 15;

  // Repeated patterns (verse-chorus pairs appearing multiple times)
  const repeatedPatterns = countRepeatedPatterns(sections);
  if (repeatedPatterns >= 2) score += 30;
  else if (repeatedPatterns >= 1) score += 15;

  // Moderate energy range (not too flat, not extreme)
  const energyRange = Math.max(...energyCurve) - Math.min(...energyCurve);
  if (energyRange >= 3 && energyRange <= 6) score += 20;
  else if (energyRange >= 2 && energyRange <= 8) score += 10;

  // Section count typical of verse-chorus structures
  if (sections.length >= 5 && sections.length <= 10) score += 15;
  else if (sections.length >= 4) score += 5;

  return Math.min(score, 100);
}

/**
 * Build-Drop: Clear builds followed by high-energy drops,
 * presence of build sections and significant energy jumps.
 */
function scoreBuildDrop(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  let score = 0;

  // Count actual drops (energy jump of 5+ after a build section)
  const drops = countDrops(sections, energyCurve);
  if (drops >= 2) score += 40;
  else if (drops >= 1) score += 25;

  // Has build-named sections
  const buildSections = sections.filter((s) => nameMatches(s.name, "build"));
  if (buildSections.length >= 2) score += 20;
  else if (buildSections.length >= 1) score += 10;

  // High energy range (builds create contrast)
  const energyRange = Math.max(...energyCurve) - Math.min(...energyCurve);
  if (energyRange >= 6) score += 20;
  else if (energyRange >= 4) score += 10;

  // Has breakdown (common in build-drop structures)
  const hasBreakdown = sections.some((s) => nameMatches(s.name, "breakdown"));
  if (hasBreakdown) score += 10;

  // Moderate section count
  if (sections.length >= 5 && sections.length <= 9) score += 10;

  return Math.min(score, 100);
}

/**
 * Continuous Evolution: Gradually changing energy, few repeated sections,
 * many unique section names, smooth energy progression.
 */
function scoreContinuousEvolution(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  let score = 0;

  // Many unique section names (non-repetitive structure)
  const uniqueNames = new Set(sections.map((s) => s.name.toLowerCase()));
  const uniqueRatio = uniqueNames.size / sections.length;
  if (uniqueRatio >= 0.8) score += 25;
  else if (uniqueRatio >= 0.6) score += 15;

  // Smooth energy changes (small consecutive deltas)
  let smoothCount = 0;
  for (let i = 1; i < energyCurve.length; i++) {
    const delta = Math.abs(energyCurve[i]! - energyCurve[i - 1]!);
    if (delta <= 2) smoothCount++;
  }
  const smoothRatio = energyCurve.length > 1 ? smoothCount / (energyCurve.length - 1) : 0;
  if (smoothRatio >= 0.7) score += 25;
  else if (smoothRatio >= 0.5) score += 15;

  // No repeated patterns
  const repeatedPatterns = countRepeatedPatterns(sections);
  if (repeatedPatterns === 0) score += 20;
  else if (repeatedPatterns <= 1) score += 10;

  // Moderate to high section count
  if (sections.length >= 6) score += 15;
  else if (sections.length >= 4) score += 10;

  // No drops (evolution is gradual)
  const drops = countDrops(sections, energyCurve);
  if (drops === 0) score += 15;

  return Math.min(score, 100);
}

/**
 * Loop: Very few sections, minimal energy variation, high repetition,
 * short overall structure with looping intent.
 */
function scoreLoop(
  sections: readonly Section[],
  energyCurve: readonly number[],
): number {
  let score = 0;

  // Very low energy range (loops are consistent)
  const energyRange = Math.max(...energyCurve) - Math.min(...energyCurve);
  if (energyRange <= 2) score += 30;
  else if (energyRange <= 4) score += 15;

  // Few sections
  if (sections.length <= 4) score += 25;
  else if (sections.length <= 6) score += 15;

  // Few unique section types (high repetition)
  const uniqueNames = new Set(sections.map((s) => s.name.toLowerCase()));
  if (uniqueNames.size <= 2) score += 25;
  else if (uniqueNames.size <= 3) score += 15;

  // No drops
  const drops = countDrops(sections, energyCurve);
  if (drops === 0) score += 10;

  // No named intro/outro (loops don't have traditional intros)
  const introLen = getIntroLengthBars(sections);
  const outroLen = getOutroLengthBars(sections);
  if (introLen === 0 && outroLen === 0) score += 10;

  return Math.min(score, 100);
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

  // Apply genre prior boost (up to +15 points, clamped to 100)
  if (profile?.archetypes) {
    for (const archetypeId of profile.archetypes) {
      const currentScore = scores.get(archetypeId);
      if (currentScore !== undefined) {
        scores.set(archetypeId, Math.min(currentScore + 15, 100));
      }
    }
  }

  // Find the highest score, using priority order for tie-breaking
  let bestArchetype: ArchetypeId = ARCHETYPE_PRIORITY[0]!;
  let bestScore = -1;

  for (const archetype of ARCHETYPE_PRIORITY) {
    const score = scores.get(archetype) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetype;
    }
  }

  return {
    archetype: bestArchetype,
    confidence: bestScore,
    lowConfidence: bestScore < 50,
  };
}
