/**
 * DJ Compatibility Scorer — computes a 0–100 score indicating how DJ-friendly
 * an arrangement is, based on intro/outro length, phrase alignment, mix zone
 * cleanliness, tempo consistency, and energy positioning.
 *
 * This module is a pure function with no side effects or SDK dependencies.
 * It receives arrangement data as plain objects and returns the score result.
 */

import type { Section } from "./section-scanner.js";
import { getProfile, getProfileBySubgenre } from "./genre-registry.js";

// ─── Exported Interfaces ───────────────────────────────────────────────

export interface DjScoreInput {
  readonly sections: readonly Section[];
  readonly energyCurve: readonly number[];
  readonly tempo: number;
  readonly genreId: string | null;
}

export interface DjScoreComponent {
  readonly name: string;
  readonly score: number;     // 0–100 for this component
  readonly weight: number;    // fraction (e.g., 0.20)
  readonly weighted: number;  // score * weight
}

export interface DjScoreResult {
  readonly totalScore: number;         // 0–100
  readonly components: readonly DjScoreComponent[];
  readonly phraseIssues: readonly PhraseIssue[];
  readonly applicable: boolean;         // false for non-DJ genres
  readonly inapplicableReason?: string;
}

export interface PhraseIssue {
  readonly sectionId: string;
  readonly sectionName: string;
  readonly startBar: number;
  readonly nearestBoundary: number;
}

// ─── Non-DJ Genre Families ─────────────────────────────────────────────

const NON_DJ_FAMILIES: readonly string[] = ["ambient", "film-score"];

/**
 * Returns true if the given family string matches a non-DJ genre family.
 * Uses startsWith to handle families like "ambient-downtempo".
 */
function isNonDjFamily(family: string): boolean {
  return NON_DJ_FAMILIES.some(
    (nonDj) => family === nonDj || family.startsWith(nonDj + "-"),
  );
}

// ─── Component Scoring Functions ───────────────────────────────────────

/**
 * Score intro/outro length based on bar count.
 * < 16 bars → 0, = 16 → 50, ≥ 32 → 100, 16–32 → linear interpolation.
 */
function scoreSectionLength(section: Section): number {
  const bars = (section.endTime - section.startTime) / 4;
  if (bars < 16) return 0;
  if (bars >= 32) return 100;
  // Linear interpolation between 16 and 32 bars (50 to 100)
  return ((bars - 16) / 16) * 50 + 50;
}

/**
 * Score phrase alignment: proportion of sections starting on 8-bar boundaries.
 * startBar = Math.round(section.startTime / 4) + 1
 * Aligned when (startBar - 1) % 8 === 0
 */
function scorePhraseAlignment(
  sections: readonly Section[],
): { score: number; issues: PhraseIssue[] } {
  if (sections.length === 0) {
    return { score: 0, issues: [] };
  }

  let alignedCount = 0;
  const issues: PhraseIssue[] = [];

  for (const section of sections) {
    const startBar = Math.round(section.startTime / 4) + 1;
    if ((startBar - 1) % 8 === 0) {
      alignedCount++;
    } else {
      // Find nearest 8-bar boundary
      const barZeroIndexed = startBar - 1;
      const lower = Math.floor(barZeroIndexed / 8) * 8 + 1;
      const upper = lower + 8;
      const nearestBoundary =
        Math.abs(startBar - lower) <= Math.abs(startBar - upper) ? lower : upper;

      issues.push({
        sectionId: section.id,
        sectionName: section.name,
        startBar,
        nearestBoundary,
      });
    }
  }

  return {
    score: Math.round((alignedCount / sections.length) * 100),
    issues,
  };
}

/**
 * Score mix zone cleanliness based on intro/outro energy levels.
 * Energy ≤ 3 → 100, 4–5 → 75, 6–7 → 50, 8+ → 0.
 * Takes the average of intro and outro zone scores.
 */
function scoreMixZoneCleanliness(introEnergy: number, outroEnergy: number): number {
  function zoneScore(energy: number): number {
    if (energy <= 3) return 100;
    if (energy <= 5) return 75;
    if (energy <= 7) return 50;
    return 0;
  }

  return Math.round((zoneScore(introEnergy) + zoneScore(outroEnergy)) / 2);
}

/**
 * Score tempo consistency. Currently always 100 (no tempo automation detection).
 */
function scoreTempoConsistency(): number {
  return 100;
}

/**
 * Score energy positioning. Both boundary sections ≤ 5 → 100.
 * Otherwise reduce by 20 per unit of excess above 5. Take minimum of both.
 */
function scoreEnergyPositioning(firstEnergy: number, lastEnergy: number): number {
  const firstScore = Math.max(0, 100 - Math.max(0, firstEnergy - 5) * 20);
  const lastScore = Math.max(0, 100 - Math.max(0, lastEnergy - 5) * 20);
  return Math.min(firstScore, lastScore);
}

// ─── Main Exported Function ────────────────────────────────────────────

/** Compute DJ compatibility score from arrangement data. */
export function computeDjScore(input: DjScoreInput): DjScoreResult {
  const { sections, energyCurve, genreId } = input;

  // ── Non-DJ genre check ───────────────────────────────────────────────
  if (genreId === null) {
    return {
      totalScore: 0,
      components: [],
      phraseIssues: [],
      applicable: false,
      inapplicableReason: "No genre selected. DJ compatibility scoring requires a genre profile.",
    };
  }

  const profile = getProfile(genreId) ?? getProfileBySubgenre(genreId);
  if (profile !== null && isNonDjFamily(profile.family)) {
    return {
      totalScore: 0,
      components: [],
      phraseIssues: [],
      applicable: false,
      inapplicableReason: `DJ compatibility is not applicable for ${profile.name} (${profile.family} family).`,
    };
  }

  // ── Handle edge case: fewer than 2 sections → score 0 ───────────────
  if (sections.length === 0) {
    return {
      totalScore: 0,
      components: [],
      phraseIssues: [],
      applicable: true,
    };
  }

  // ── Compute each component ───────────────────────────────────────────
  const introSection = sections[0]!;
  const outroSection = sections[sections.length - 1]!;

  const introScore = scoreSectionLength(introSection);
  const outroScore = scoreSectionLength(outroSection);

  const { score: phraseScore, issues: phraseIssues } = scorePhraseAlignment(sections);

  const introEnergy = energyCurve[0] ?? 1;
  const outroEnergy = energyCurve[energyCurve.length - 1] ?? 1;

  const mixZoneScore = scoreMixZoneCleanliness(introEnergy, outroEnergy);
  const tempoScore = scoreTempoConsistency();
  const energyPosScore = scoreEnergyPositioning(introEnergy, outroEnergy);

  // ── Build component list with weights ────────────────────────────────
  const components: DjScoreComponent[] = [
    { name: "Intro Length", score: introScore, weight: 0.20, weighted: introScore * 0.20 },
    { name: "Outro Length", score: outroScore, weight: 0.20, weighted: outroScore * 0.20 },
    { name: "Phrase Alignment", score: phraseScore, weight: 0.20, weighted: phraseScore * 0.20 },
    { name: "Mix Zone Cleanliness", score: mixZoneScore, weight: 0.15, weighted: mixZoneScore * 0.15 },
    { name: "Tempo Consistency", score: tempoScore, weight: 0.15, weighted: tempoScore * 0.15 },
    { name: "Energy Positioning", score: energyPosScore, weight: 0.10, weighted: energyPosScore * 0.10 },
  ];

  // ── Compute total (sum of weighted, clamped to 0–100) ────────────────
  const rawTotal = components.reduce((sum, c) => sum + c.weighted, 0);
  const totalScore = Math.min(100, Math.max(0, Math.round(rawTotal)));

  return {
    totalScore,
    components,
    phraseIssues,
    applicable: true,
  };
}
