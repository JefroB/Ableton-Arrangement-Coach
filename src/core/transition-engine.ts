/**
 * Transition Engine — computes genre-aware transition recommendations for
 * every consecutive section boundary in the arrangement.
 *
 * Pure function module. Accepts plain data, returns plain data.
 * No SDK calls, no side effects.
 */

import type { Section } from "./section-scanner.js";
import type { FrequencyBucket } from "./track-categorizer.js";
import type { AudioContentResults, SpectralProfile, FrequencyBandName } from "./audio-content-types.js";
import { FREQUENCY_BANDS } from "./audio-content-types.js";
import { computeCosineSimilarity } from "./audio-cross-section.js";
import { getTechniqueNames, getCategoryPriorities, getBoundaryKeywords, getSizeConfig, getAudioSpectralChangeThreshold } from "./transition-loader.js";

// ─── Types ─────────────────────────────────────────────────────────────

/** The six families of transition techniques. */
export type TransitionCategory =
  | "riser"
  | "drum_fill"
  | "filter_sweep"
  | "volume_dynamics"
  | "impact"
  | "textural_fx";

/** A specific named technique within a TransitionCategory. */
export interface Technique {
  readonly category: TransitionCategory;
  readonly name: string;         // max 50 characters
  readonly durationBars: number; // >= 1, <= parent's suggestedDurationBars
}

/** A single actionable step in a transition implementation checklist. */
export interface ChecklistItem {
  readonly id: string;        // unique within the recommendation
  readonly text: string;      // max 150 characters, actionable
  readonly completed: boolean; // default false on generation
}

/** Classification of the section boundary context. */
export type BoundaryType = "drop" | "breakdown" | "build" | "chorus_entry" | "verse_entry" | "prechorus_entry" | "intro_exit" | "outro_entry" | "normal";

/** Classification of transition complexity. */
export type TransitionSize = "small" | "medium" | "large";

/** A complete transition recommendation for one section boundary. */
export interface TransitionRecommendation {
  readonly id: string;                    // deterministic: `${fromSectionId}-${toSectionId}`
  readonly fromSectionId: string;
  readonly toSectionId: string;
  readonly energyDelta: number;           // signed integer, -9 to +9
  readonly transitionSize: TransitionSize;
  readonly suggestedDurationBars: number; // integer, 2–32
  readonly techniques: readonly Technique[];  // 1–3 items
  readonly boundaryType: BoundaryType;
  readonly rationale: string;             // max 120 characters
  readonly checklist: readonly ChecklistItem[]; // 2–5 items
}

/** Genre-specific transition preferences and conventions. */
export interface GenreTransitionProfile {
  readonly genre: string;
  readonly preferredCategories: readonly TransitionCategory[];
  readonly discouragedCategories: readonly TransitionCategory[];
  readonly buildDurationRange: { readonly min: number; readonly max: number };
  readonly dropsExpected: boolean;
}

/** Input data for the transition engine. */
export interface TransitionEngineInput {
  readonly sections: readonly Section[];
  readonly energyCurve: readonly number[];
  readonly genreProfile: GenreTransitionProfile | null;
  readonly trackBuckets: readonly FrequencyBucket[];
  /** Optional audio content analysis results for incorporating spectral contrast. */
  readonly audioContentAnalysis?: AudioContentResults | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Determine energy direction from signed delta. */
function getEnergyDirection(delta: number): "positive" | "negative" | "zero" {
  if (delta > 0) return "positive";
  if (delta < 0) return "negative";
  return "zero";
}

/** Get the default category priority list for an energy direction. */
function getDirectionCategories(direction: "positive" | "negative" | "zero"): readonly TransitionCategory[] {
  return getCategoryPriorities()[direction];
}

/** Classify transition size from absolute delta. */
function classifySize(absDelta: number): TransitionSize {
  const config = getSizeConfig();
  if (config.small.maxDelta !== null && absDelta <= config.small.maxDelta) return "small";
  if (config.medium.maxDelta !== null && absDelta <= config.medium.maxDelta) return "medium";
  return "large";
}

/** Get the technique count for a given size. */
function getTechniqueCount(size: TransitionSize): number {
  return getSizeConfig()[size].techniqueCount;
}

/** Get the default duration range for a size. */
function getDurationRange(size: TransitionSize): { min: number; max: number } {
  const [min, max] = getSizeConfig()[size].durationBars;
  return { min, max };
}

/** Get the checklist item count range for a size. */
function getChecklistCountRange(size: TransitionSize): { min: number; max: number } {
  const [min, max] = getSizeConfig()[size].checklistItems;
  return { min, max };
}

/** Check if a section name contains any of the given keywords (case-insensitive). */
function nameContainsKeyword(name: string, keywords: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Convert a SpectralProfile's dBFS band energies to a linear power vector
 * suitable for cosine similarity computation.
 */
function spectralProfileToLinearVector(profile: SpectralProfile): number[] {
  const bandNames: readonly FrequencyBandName[] = FREQUENCY_BANDS.map((b) => b.name);
  return bandNames.map((name) => Math.pow(10, profile.bands[name] / 10));
}

/**
 * Count the number of audio tracks with significant spectral profile changes
 * between two adjacent sections.
 *
 * A "significant change" is defined as a cosine similarity < 0.7 between
 * the spectral profile vectors of the same audio track in the two sections.
 * Each such track counts as equivalent to one MIDI track change.
 *
 * Falls back to 0 if audio content analysis data is unavailable for either section.
 */
export function computeAudioSpectralContrast(
  audioContentAnalysis: AudioContentResults | null | undefined,
  fromSectionId: string,
  toSectionId: string,
): number {
  if (!audioContentAnalysis) {
    return 0;
  }

  const fromSectionData = audioContentAnalysis.perSection.get(fromSectionId);
  const toSectionData = audioContentAnalysis.perSection.get(toSectionId);

  if (!fromSectionData || !toSectionData) {
    return 0;
  }

  let changedTrackCount = 0;

  // Check all audio tracks present in the "from" section
  for (const [trackName, fromResult] of fromSectionData) {
    const toResult = toSectionData.get(trackName);
    if (!toResult) {
      // Track not present in target section — counts as a change
      changedTrackCount++;
      continue;
    }

    // Convert spectral profiles to linear vectors and compute cosine similarity
    const fromVector = spectralProfileToLinearVector(fromResult.spectralProfile);
    const toVector = spectralProfileToLinearVector(toResult.spectralProfile);
    const similarity = computeCosineSimilarity(fromVector, toVector);

    if (similarity < getAudioSpectralChangeThreshold()) {
      changedTrackCount++;
    }
  }

  // Also count tracks that only exist in the "to" section (newly introduced)
  for (const trackName of toSectionData.keys()) {
    if (!fromSectionData.has(trackName)) {
      changedTrackCount++;
    }
  }

  return changedTrackCount;
}

/** Keywords for section name matching. */
const CHORUS_KEYWORDS = ["chorus", "hook", "main", "drop"];
const VERSE_KEYWORDS = ["verse", "vocal", "vocals"];
const PRECHORUS_KEYWORDS = ["prechorus", "pre-chorus", "pre chorus", "build", "riser", "lift"];
const INTRO_KEYWORDS = ["intro", "start", "opening"];
const OUTRO_KEYWORDS = ["outro", "end", "ending", "coda", "fade"];

/**
 * Detect the boundary type for a section pair.
 *
 * Uses both section names (confirmed when named) and energy patterns (inferred).
 * Priority: drop > chorus_entry > build > breakdown > prechorus_entry > verse_entry > intro_exit > outro_entry > normal.
 */
function detectBoundaryType(
  precedingSection: Section,
  followingSection: Section,
  energyDelta: number,
  absDelta: number,
  energyCurve: readonly number[],
  sections: readonly Section[],
  followingIndex: number
): BoundaryType {
  const followingName = followingSection.name;
  const precedingName = precedingSection.name;
  const followingLower = followingName.toLowerCase();
  const precedingLower = precedingName.toLowerCase();

  // 1. Drop boundary (highest priority) — name confirmation OR unique energy peak
  if (nameContainsKeyword(followingName, getBoundaryKeywords().drop) && energyDelta > 0 && absDelta >= 2) {
    return "drop";
  }
  const maxEnergy = Math.max(...energyCurve);
  const sectionsAtMax = energyCurve.filter((e) => e === maxEnergy).length;
  if (sectionsAtMax === 1 && energyCurve[followingIndex] === maxEnergy && absDelta >= 3) {
    return "drop";
  }

  // 2. Chorus entry — confirmed by name, or inferred from high energy after prechorus
  if (nameContainsKeyword(followingName, CHORUS_KEYWORDS) && !nameContainsKeyword(followingName, getBoundaryKeywords().drop)) {
    return "chorus_entry";
  }
  // Inferred: following section is at max or near-max energy and preceding is a prechorus
  if (nameContainsKeyword(precedingName, PRECHORUS_KEYWORDS) && energyDelta > 0) {
    return "chorus_entry";
  }

  // 3. Build exit: preceding section is a build AND energy rising
  if (nameContainsKeyword(precedingName, ["build", "riser"]) && energyDelta > 0 && absDelta >= 2) {
    return "build";
  }

  // 4. Breakdown entry — confirmed by name, or inferred from large negative delta
  if (nameContainsKeyword(followingName, getBoundaryKeywords().breakdown) && energyDelta < 0) {
    return "breakdown";
  }
  // Inferred: large negative delta (≥3) entering a section that isn't a verse
  if (energyDelta < 0 && absDelta >= 3 && !nameContainsKeyword(followingName, VERSE_KEYWORDS)) {
    return "breakdown";
  }

  // 5. PreChorus entry — building toward chorus
  if (nameContainsKeyword(followingName, PRECHORUS_KEYWORDS)) {
    return "prechorus_entry";
  }
  // Inferred: section before a chorus-named section
  if (followingIndex < sections.length - 1) {
    const nextSection = sections[followingIndex + 1];
    if (nextSection && nameContainsKeyword(nextSection.name, CHORUS_KEYWORDS)) {
      return "prechorus_entry";
    }
  }

  // 6. Verse entry — confirmed by name, or inferred from stepping down after chorus
  if (nameContainsKeyword(followingName, VERSE_KEYWORDS)) {
    return "verse_entry";
  }
  if (nameContainsKeyword(precedingName, CHORUS_KEYWORDS) && energyDelta < 0) {
    return "verse_entry";
  }

  // 7. Intro exit — leaving an intro section
  if (nameContainsKeyword(precedingName, INTRO_KEYWORDS) && followingIndex <= 2) {
    return "intro_exit";
  }

  // 8. Outro entry — entering outro
  if (nameContainsKeyword(followingName, OUTRO_KEYWORDS)) {
    return "outro_entry";
  }
  // Inferred: last section in the arrangement with falling energy
  if (followingIndex === sections.length - 1 && energyDelta < 0) {
    return "outro_entry";
  }

  return "normal";
}

/**
 * Select technique categories based on energy direction, genre profile, and boundary constraints.
 */
function selectCategories(
  direction: "positive" | "negative" | "zero",
  count: number,
  genreProfile: GenreTransitionProfile | null,
  boundaryType: BoundaryType
): TransitionCategory[] {
  // Start with the direction-appropriate category list
  let categoryList = [...getDirectionCategories(direction)];

  // Apply genre preference ordering
  if (genreProfile !== null) {
    // Reorder: genre preferred categories first (in profile order), then remaining
    const preferred = genreProfile.preferredCategories.filter((c) =>
      categoryList.includes(c)
    );
    const remaining = categoryList.filter(
      (c) => !preferred.includes(c)
    );
    categoryList = [...preferred, ...remaining];

    // Remove discouraged categories (unless no alternatives remain)
    if (genreProfile.discouragedCategories.length > 0) {
      const nonDiscouraged = categoryList.filter(
        (c) => !genreProfile.discouragedCategories.includes(c)
      );
      if (nonDiscouraged.length > 0) {
        categoryList = nonDiscouraged;
      }
      // If all are discouraged, keep the full list (fallback per spec)
    }
  }

  // Apply special boundary constraints
  if (boundaryType === "breakdown" || boundaryType === "verse_entry" || boundaryType === "outro_entry") {
    // Exclude riser and drum_fill — these sections strip energy, not build it
    const filtered = categoryList.filter((c) => c !== "riser" && c !== "drum_fill");
    if (filtered.length > 0) {
      categoryList = filtered;
    }
  }

  // Select first N categories
  let selected = categoryList.slice(0, count);

  // For drop/build/chorus_entry: ensure at least one riser or impact
  if (boundaryType === "drop" || boundaryType === "build" || boundaryType === "chorus_entry") {
    const hasRiserOrImpact = selected.some((c) => c === "riser" || c === "impact");
    if (!hasRiserOrImpact) {
      // Replace the last selected category with riser (or impact if riser not in direction list)
      const replacement: TransitionCategory =
        getDirectionCategories(direction).includes("riser") ? "riser" : "impact";
      selected[selected.length - 1] = replacement;
    }
  }

  // For prechorus_entry: prefer riser or filter_sweep (tension building)
  if (boundaryType === "prechorus_entry") {
    if (!selected.includes("riser") && !selected.includes("filter_sweep")) {
      selected[selected.length - 1] = "filter_sweep";
    }
  }

  return selected;
}

/** Pick a named technique for a category. Uses deterministic selection based on index. */
function pickTechnique(category: TransitionCategory, index: number, durationBars: number): Technique {
  const names = getTechniqueNames()[category];
  const name = names[index % names.length] as string;
  return {
    category,
    name,
    durationBars: Math.max(1, Math.min(durationBars, durationBars)),
  };
}

/** Compute suggested duration, applying genre clamping for large transitions. */
function computeSuggestedDuration(
  size: TransitionSize,
  genreProfile: GenreTransitionProfile | null
): number {
  const range = getDurationRange(size);

  if (size === "large" && genreProfile !== null) {
    // Genre duration clamping: intersection of [8,32] and genre buildDurationRange
    const clampedMin = Math.max(range.min, genreProfile.buildDurationRange.min);
    const clampedMax = Math.min(range.max, genreProfile.buildDurationRange.max);
    // If ranges don't overlap, use the closest boundary
    if (clampedMin > clampedMax) {
      return clampedMin <= range.max ? clampedMin : clampedMax;
    }
    return clampedMin;
  }

  return range.min;
}

/** Generate a rationale string (max 120 chars). */
function generateRationale(
  energyDelta: number,
  direction: "positive" | "negative" | "zero",
  boundaryType: BoundaryType,
  fromName?: string,
  toName?: string
): string {
  const directionText =
    direction === "positive"
      ? `Rising energy (+${energyDelta})`
      : direction === "negative"
        ? `Falling energy (${energyDelta})`
        : "Flat energy (0)";

  let boundaryText: string;
  switch (boundaryType) {
    case "drop":
      boundaryText = " — build tension with riser and silence gap before the drop";
      break;
    case "build":
      boundaryText = " — culminate the build with impact and full entry";
      break;
    case "breakdown":
      boundaryText = " — release into the breakdown with filtering and texture";
      break;
    case "chorus_entry":
      boundaryText = " — lift into the chorus with added layers and intensity";
      break;
    case "verse_entry":
      boundaryText = " — strip back for the verse, reduce density to reset";
      break;
    case "prechorus_entry":
      boundaryText = " — begin building tension and anticipation toward the peak";
      break;
    case "intro_exit":
      boundaryText = " — transition out of the intro, introduce the main groove";
      break;
    case "outro_entry":
      boundaryText = " — wind down with gradual element removal";
      break;
    default:
      // Normal: generate contextual text based on energy direction
      if (direction === "positive") {
        boundaryText = " — layer in elements to lift energy into the next section";
      } else if (direction === "negative") {
        boundaryText = " — thin the arrangement to create contrast";
      } else {
        boundaryText = " — vary texture or rhythm to maintain interest";
      }
  }

  const full = directionText + boundaryText;
  return full.length <= 120 ? full : full.slice(0, 120);
}

/** Generate checklist items for a transition recommendation. */
function generateChecklist(
  techniques: readonly Technique[],
  boundaryType: BoundaryType,
  size: TransitionSize,
  suggestedDurationBars: number,
  recommendationId: string
): ChecklistItem[] {
  const range = getChecklistCountRange(size);
  const items: ChecklistItem[] = [];
  let itemIndex = 0;

  // For drop boundaries, include specific drop-related items first (chronologically)
  if (boundaryType === "drop") {
    items.push({
      id: `${recommendationId}-cl-${itemIndex++}`,
      text: `Place riser/tension element ${suggestedDurationBars} bars before the drop`,
      completed: false,
    });
    items.push({
      id: `${recommendationId}-cl-${itemIndex++}`,
      text: "Insert 1–4 beat silence gap immediately before the drop",
      completed: false,
    });
    items.push({
      id: `${recommendationId}-cl-${itemIndex++}`,
      text: "Add impact hit on beat 1 of the drop section",
      completed: false,
    });
  }

  // Add technique-specific items with varied phrasing
  for (const technique of techniques) {
    if (items.length >= range.max) break;

    // Use item index for phrasing variation within the same recommendation
    const phraseVariant = itemIndex % 3;

    if (technique.category === "filter_sweep") {
      const filterTexts = [
        `Automate ${technique.name} over ${technique.durationBars} bars — sweep from a closed to open position`,
        `Use ${technique.name} across ${technique.durationBars} bars to create frequency movement`,
        `Set up ${technique.name}: gradually reveal the full spectrum over ${technique.durationBars} bars`,
      ];
      items.push({
        id: `${recommendationId}-cl-${itemIndex++}`,
        text: filterTexts[phraseVariant]!,
        completed: false,
      });
    } else if (technique.category === "volume_dynamics") {
      const volumeTexts = [
        `Apply ${technique.name} over ${technique.durationBars} bars — build from subtle to full level`,
        `Use ${technique.name}: ramp the energy gradually across ${technique.durationBars} bars`,
        `Automate levels with ${technique.name} to create a ${technique.durationBars}-bar dynamic arc`,
      ];
      items.push({
        id: `${recommendationId}-cl-${itemIndex++}`,
        text: volumeTexts[phraseVariant]!,
        completed: false,
      });
    } else if (technique.category === "riser" && boundaryType !== "drop") {
      const riserTexts = [
        `Add ${technique.name} starting ${technique.durationBars} bars before the transition point`,
        `Introduce ${technique.name} to build tension over the final ${technique.durationBars} bars`,
        `Layer ${technique.name} beneath the mix, rising over ${technique.durationBars} bars`,
      ];
      items.push({
        id: `${recommendationId}-cl-${itemIndex++}`,
        text: riserTexts[phraseVariant]!,
        completed: false,
      });
    } else if (technique.category === "impact") {
      const impactTexts = [
        `Place ${technique.name} on beat 1 of the following section`,
        `Hit the downbeat with ${technique.name} to punctuate the transition`,
        `Use ${technique.name} to mark the section boundary clearly`,
      ];
      items.push({
        id: `${recommendationId}-cl-${itemIndex++}`,
        text: impactTexts[phraseVariant]!,
        completed: false,
      });
    } else if (technique.category === "drum_fill") {
      const fillTexts = [
        `Insert ${technique.name} in the last ${Math.min(2, technique.durationBars)} bars of the section`,
        `Use ${technique.name} to signal the upcoming change over ${Math.min(2, technique.durationBars)} bars`,
        `Build rhythmic anticipation with ${technique.name} before the transition`,
      ];
      items.push({
        id: `${recommendationId}-cl-${itemIndex++}`,
        text: fillTexts[phraseVariant]!,
        completed: false,
      });
    } else if (technique.category === "textural_fx") {
      const textureTexts = [
        `Layer ${technique.name} across the transition for ${technique.durationBars} bars`,
        `Introduce ${technique.name} to blur the boundary over ${technique.durationBars} bars`,
        `Use ${technique.name} as connective tissue spanning ${technique.durationBars} bars`,
      ];
      items.push({
        id: `${recommendationId}-cl-${itemIndex++}`,
        text: textureTexts[phraseVariant]!,
        completed: false,
      });
    }
  }

  // Pad with generic items if we're below minimum
  while (items.length < range.min) {
    items.push({
      id: `${recommendationId}-cl-${itemIndex++}`,
      text: `Verify transition sounds smooth at ${suggestedDurationBars}-bar length`,
      completed: false,
    });
  }

  // Trim to max
  return items.slice(0, range.max);
}

// ─── Main Function ─────────────────────────────────────────────────────

/**
 * Compute transition recommendations for all consecutive section boundaries.
 *
 * Pure function — no SDK calls, no side effects.
 *
 * @param input - Sections, energy curve, genre profile, and track categorization.
 * @returns Array of TransitionRecommendation objects, one per consecutive section pair.
 * @throws Error if energyCurve.length !== sections.length.
 */
export function computeTransitions(input: TransitionEngineInput): TransitionRecommendation[] {
  const { sections, energyCurve, genreProfile, audioContentAnalysis } = input;

  // Validate: return empty if fewer than 2 sections
  if (sections.length < 2) {
    return [];
  }

  // Validate: throw if array lengths mismatch
  if (energyCurve.length !== sections.length) {
    throw new Error(
      `energyCurve length (${energyCurve.length}) must equal sections length (${sections.length})`
    );
  }

  const recommendations: TransitionRecommendation[] = [];

  for (let i = 0; i < sections.length - 1; i++) {
    const precedingSection = sections[i]!;
    const followingSection = sections[i + 1]!;
    const followingIndex = i + 1;

    // Compute energy delta
    const energyDelta = energyCurve[followingIndex]! - energyCurve[i]!;
    const absDelta = Math.abs(energyDelta);
    const direction = getEnergyDirection(energyDelta);

    // Compute audio spectral contrast: count audio tracks with significant spectral changes
    const audioContrast = computeAudioSpectralContrast(
      audioContentAnalysis,
      precedingSection.id,
      followingSection.id,
    );

    // Combined contrast: energy delta + audio track spectral changes
    // Each audio track with a significant spectral change counts as equivalent to one MIDI track change
    const effectiveDelta = absDelta + audioContrast;

    // Classify transition size using the combined effective delta
    const transitionSize = classifySize(effectiveDelta);

    // Compute suggested duration
    const suggestedDurationBars = computeSuggestedDuration(transitionSize, genreProfile);

    // Detect boundary type
    const boundaryType = detectBoundaryType(
      precedingSection,
      followingSection,
      energyDelta,
      absDelta,
      energyCurve,
      sections,
      followingIndex
    );

    // Select technique categories
    const techniqueCount = getTechniqueCount(transitionSize);
    const selectedCategories = selectCategories(direction, techniqueCount, genreProfile, boundaryType);

    // Pick named techniques
    const techniques: Technique[] = selectedCategories.map((category, idx) =>
      pickTechnique(category, idx, suggestedDurationBars)
    );

    // Generate deterministic ID
    const id = `${precedingSection.id}-${followingSection.id}`;

    // Generate rationale
    const rationale = generateRationale(energyDelta, direction, boundaryType, precedingSection.name, followingSection.name);

    // Generate checklist
    const checklist = generateChecklist(
      techniques,
      boundaryType,
      transitionSize,
      suggestedDurationBars,
      id
    );

    recommendations.push({
      id,
      fromSectionId: precedingSection.id,
      toSectionId: followingSection.id,
      energyDelta,
      transitionSize,
      suggestedDurationBars,
      techniques,
      boundaryType,
      rationale,
      checklist,
    });
  }

  return recommendations;
}
