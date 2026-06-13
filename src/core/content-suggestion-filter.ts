/**
 * Content Suggestion Filter — filters and modifies suggestions based on
 * content analysis results.
 *
 * Pure function module. Suppresses redundant suggestions (fill/build already
 * present), replaces with refinement suggestions, and enriches suggestion
 * text with instrument role names.
 */

import type { RawSuggestion } from "./suggestion-renderer.js";
import type {
  ContentAnalysisResult,
  DrumElementCategory,
  DrumPadMap,
  InstrumentRole,
  PercussionDiscontinuity,
} from "./content-analysis-types.js";
import type { Section } from "./section-scanner.js";
import { getGenreFillProfile } from "./genre-registry.js";
import type { GenreFillProfile } from "./genre-registry.js";
import type {
  AudioContentResults,
  AudioInstrumentRole,
  AudioTrackSectionResult,
  FrequencyBandName,
} from "./audio-content-types.js";
import {
  getGenreAudioProfile,
  getDeviationThreshold,
  computeBandDeviation,
  isDrumDensityBelowExpectation,
} from "./genre-registry.js";
import type { SynthAnalysisResult } from "./synth-analysis-types.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Keywords in suggestion text that indicate a "fill" suggestion. */
const FILL_KEYWORDS = ["add a fill", "add fill", "try a fill", "insert a fill", "place a fill"];

/** Keywords in suggestion text that indicate a "build/riser" suggestion. */
const BUILD_KEYWORDS = [
  "add a build",
  "add a riser",
  "add build",
  "add riser",
  "insert a riser",
  "try a riser",
  "try a build",
  "include a riser",
  "include a build",
];

/** Keywords indicating a repetition problem in suggestion text. */
const REPETITION_KEYWORDS = [
  "repetition",
  "repeats",
  "repeated",
  "repetitive",
  "same pattern",
  "copy-paste",
];

/**
 * Extract the structural role prefix from a section name.
 * e.g., "Verse 1" → "Verse", "Chorus 2" → "Chorus", "Breakdown A" → "Breakdown"
 * Returns the name itself if no numeric/alpha suffix is found.
 */
function getStructuralRole(sectionName: string): string {
  // Strip trailing number or single letter suffix: "Verse 1" → "Verse", "Chorus A" → "Chorus"
  const stripped = sectionName.replace(/\s+(\d+|[A-Za-z])$/, "").trim();
  return stripped.toLowerCase();
}

/**
 * Check if two sections serve the same structural role.
 * e.g., "Verse 1" and "Verse 2" → true, "Verse 1" and "Chorus 1" → false
 */
function haveSameStructuralRole(sectionA: Section, sectionB: Section): boolean {
  return getStructuralRole(sectionA.name) === getStructuralRole(sectionB.name);
}

/**
 * Check whether a suggestion's text contains any keyword from a list (case-insensitive).
 */
function textContainsKeyword(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Find the section that a suggestion applies to, using sectionName and barRange.
 */
function findSectionForSuggestion(
  suggestion: RawSuggestion,
  sections: readonly Section[],
): Section | undefined {
  // Match by section name first
  const byName = sections.find(
    (s) => s.name.toLowerCase() === suggestion.sectionName.toLowerCase(),
  );
  if (byName) return byName;

  // Fallback: match by barRange overlap
  const barStart = suggestion.barRange.start;
  return sections.find(
    (s) => barStart >= s.startTime / 4 && barStart < (s.endTime === Infinity ? Infinity : s.endTime / 4),
  );
}

/**
 * Check if a fill exists at the boundary relevant to a suggestion.
 * Looks for fills in the section's drum tracks at the boundary.
 */
function fillExistsAtBoundary(
  section: Section,
  contentAnalysis: ContentAnalysisResult,
): boolean {
  const sectionAnalysis = contentAnalysis.perSection.get(section.id);
  if (!sectionAnalysis) return false;

  for (const trackAnalysis of sectionAnalysis.values()) {
    if (trackAnalysis.role === "drums" && trackAnalysis.percussionPattern) {
      if (trackAnalysis.percussionPattern.fills.length > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a build exists at the boundary leading into a section.
 */
function buildExistsAtBoundary(
  section: Section,
  contentAnalysis: ContentAnalysisResult,
  sections: readonly Section[],
): boolean {
  // A build leads INTO a section boundary, so check the previous section
  // for a build targeting this section's start
  const sectionIndex = sections.findIndex((s) => s.id === section.id);

  // Check the current section for builds
  const sectionAnalysis = contentAnalysis.perSection.get(section.id);
  if (sectionAnalysis) {
    for (const trackAnalysis of sectionAnalysis.values()) {
      if (trackAnalysis.build) {
        return true;
      }
    }
  }

  // Also check the preceding section for builds targeting this boundary
  if (sectionIndex > 0) {
    const prevSection = sections[sectionIndex - 1]!;
    const prevAnalysis = contentAnalysis.perSection.get(prevSection.id);
    if (prevAnalysis) {
      for (const trackAnalysis of prevAnalysis.values()) {
        if (trackAnalysis.build && trackAnalysis.build.targetBoundary === section.startTime) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Determine whether a repetition suggestion should be suppressed because
 * the shared pattern is between sections with the same structural role.
 *
 * e.g., Verse 1 and Verse 2 sharing a drum pattern is expected — not a problem.
 */
function isSharedPatternBetweenSameRoles(
  suggestion: RawSuggestion,
  sections: readonly Section[],
  contentAnalysis: ContentAnalysisResult,
): boolean {
  if (!textContainsKeyword(suggestion.issueType, ["repetition"]) &&
      !textContainsKeyword(suggestion.sectionName, REPETITION_KEYWORDS)) {
    // Also check the issue type directly
    if (suggestion.issueType !== "repetition") {
      return false;
    }
  }

  // Find which sections are involved — check cross-section data
  // The suggestion sectionName often references the section pair
  const section = findSectionForSuggestion(suggestion, sections);
  if (!section) return false;

  const sectionIndex = sections.findIndex((s) => s.id === section.id);
  if (sectionIndex < 0) return false;

  // Check adjacent sections for shared pattern classification
  for (const [, comparisons] of contentAnalysis.crossSection) {
    for (const comp of comparisons) {
      if (comp.classification !== "shared") continue;

      const sectionA = sections[comp.sectionIndexA];
      const sectionB = sections[comp.sectionIndexB];
      if (!sectionA || !sectionB) continue;

      // Check if this comparison involves our section
      if (comp.sectionIndexA === sectionIndex || comp.sectionIndexB === sectionIndex) {
        // If both sections have the same structural role, suppress
        if (haveSameStructuralRole(sectionA, sectionB)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Get a human-friendly name for an instrument role.
 */
function roleDisplayName(role: InstrumentRole): string {
  switch (role) {
    case "drums": return "drums";
    case "bass": return "bass";
    case "lead": return "lead";
    case "pad": return "pad";
    case "arpeggio": return "arpeggio";
    case "chord": return "chord";
    case "unclassified": return "track";
  }
}

/**
 * Enrich suggestion text with instrument role name where applicable.
 * Replaces generic "this track" / "pattern" with role-specific language.
 */
function enrichWithRoleName(
  suggestion: RawSuggestion,
  section: Section | undefined,
  contentAnalysis: ContentAnalysisResult,
): RawSuggestion {
  if (!section) return suggestion;

  const sectionAnalysis = contentAnalysis.perSection.get(section.id);
  if (!sectionAnalysis) return suggestion;

  // Find relevant role for this suggestion
  // For repetition suggestions, find the track that has repetition
  let relevantRole: InstrumentRole | null = null;

  if (suggestion.issueType === "repetition") {
    // Find the track with repetition in this section
    for (const [trackName, summary] of contentAnalysis.repetitionSummary) {
      if (summary.role !== "unclassified") {
        const sectionIndex = Array.from(contentAnalysis.perSection.keys()).indexOf(section.id);
        if (sectionIndex >= 0 && summary.hasExtendedRepetition) {
          relevantRole = summary.role;
          break;
        }
      }
    }
    // Fallback: use any non-unclassified role from this section
    if (!relevantRole) {
      for (const trackAnalysis of sectionAnalysis.values()) {
        if (trackAnalysis.role !== "unclassified") {
          relevantRole = trackAnalysis.role;
          break;
        }
      }
    }
  }

  if (!relevantRole) return suggestion;

  const roleName = roleDisplayName(relevantRole);

  // Update the suggestion's sectionName to include role context
  // The actual text enrichment will be applied in the suggestion renderer,
  // but we can adjust severity metadata to carry this information.
  // Since RawSuggestion has a fixed shape, we pass role info via issueType extension
  return {
    ...suggestion,
    issueType: `${suggestion.issueType}:${roleName}`,
  };
}

// ─── Role-Based Variation Guidance ─────────────────────────────────────

/**
 * Maps instrument roles to actionable variation guidance for extended repetition.
 * Returns a specific suggestion tailored to the role's musical function.
 */
function getVariationGuidanceForRole(role: InstrumentRole): string {
  switch (role) {
    case "drums":
      return "introduce a hi-hat variation or swap your snare pattern";
    case "bass":
      return "try a different inversion or rhythm variation";
    case "lead":
      return "introduce a melodic variation or new motif";
    case "pad":
      return "try a different chord voicing or texture";
    case "arpeggio":
      return "shift the arpeggio pattern or adjust note density";
    case "chord":
      return "try a voicing change or rhythmic variation";
    case "unclassified":
      return "introduce a variation to break the repetition";
  }
}

/**
 * Format section indices as human-friendly section name references.
 * e.g., [2, 3, 4] with sections ["Intro", "Verse 1", "Verse 2", "Chorus 1", "Chorus 2"]
 * → "Verse 2, Chorus 1, and Chorus 2"
 */
function formatSectionNames(
  sectionIndices: readonly number[],
  sections: readonly Section[],
): string {
  const names = sectionIndices
    .map((i) => sections[i]?.name)
    .filter((n): n is string => n != null);

  if (names.length === 0) return "multiple sections";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  // Oxford comma style: "A, B, and C"
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Filter or modify suggestions based on content analysis results and genre context.
 *
 * Behavior:
 * 1. Suppress "add a fill" suggestions when fill already detected at that boundary
 * 2. Suppress "add a build"/"add a riser" when build detected; substitute refinement
 * 3. Suppress repetition problems for shared patterns between same structural roles
 * 4. Include instrument role name in suggestion text
 */
export function filterSuggestionsWithContent(
  suggestions: readonly RawSuggestion[],
  contentAnalysis: ContentAnalysisResult,
  sections: readonly Section[],
  genre: string | null,
): RawSuggestion[] {
  const result: RawSuggestion[] = [];

  for (const suggestion of suggestions) {
    const section = findSectionForSuggestion(suggestion, sections);

    // 1. Suppress "add a fill" when fill already exists at the boundary
    if (textContainsKeyword(suggestion.sectionName + " " + suggestion.issueType, FILL_KEYWORDS) ||
        isFillSuggestion(suggestion)) {
      if (section && fillExistsAtBoundary(section, contentAnalysis)) {
        // Suppress entirely — fill already present
        continue;
      }
    }

    // 2. Suppress "add a build"/"add a riser" when build exists; substitute refinement
    if (textContainsKeyword(suggestion.sectionName + " " + suggestion.issueType, BUILD_KEYWORDS) ||
        isBuildSuggestion(suggestion)) {
      if (section && buildExistsAtBoundary(section, contentAnalysis, sections)) {
        // Replace with refinement suggestion
        const refinement = createRefinementSuggestion(suggestion, section, contentAnalysis, sections);
        result.push(refinement);
        continue;
      }
    }

    // 3. Suppress repetition for shared patterns between same structural roles
    if (suggestion.issueType === "repetition") {
      if (isSharedPatternBetweenSameRoles(suggestion, sections, contentAnalysis)) {
        continue;
      }
    }

    // 4. Enrich with instrument role name
    const enriched = enrichWithRoleName(suggestion, section, contentAnalysis);
    result.push(enriched);
  }

  return result;
}

/**
 * Generate variation suggestions when extended repetition is detected on a track.
 *
 * For each track with `hasExtendedRepetition === true` in the repetition summary,
 * produces a suggestion referencing the instrument role and the specific sections
 * involved, with actionable guidance tailored to the role.
 *
 * Requirement 6.4: WHEN the Content_Analyzer detects "extended repetition" on a
 * track across 3+ Sections, THE Suggestion_Engine SHALL suggest "vary your existing
 * pattern" with specific guidance.
 */
export function generateVariationSuggestions(
  contentAnalysis: ContentAnalysisResult,
  sections: readonly Section[],
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  for (const [, summary] of contentAnalysis.repetitionSummary) {
    if (!summary.hasExtendedRepetition) continue;

    const extSections = summary.extendedRepetitionSections;
    if (extSections.length < 3) continue;

    const roleName = roleDisplayName(summary.role);
    const guidance = getVariationGuidanceForRole(summary.role);

    // Suggest varying in the later sections (skip the first occurrence — that's the "established" pattern)
    const targetSections = extSections.slice(1);
    const sectionNamesText = formatSectionNames(targetSections, sections);

    // Determine the bar range from the first target section
    const firstTargetIndex = targetSections[0]!;
    const firstTargetSection = sections[firstTargetIndex];
    const lastTargetIndex = targetSections[targetSections.length - 1]!;
    const lastTargetSection = sections[lastTargetIndex];

    const barStart = firstTargetSection
      ? Math.floor(firstTargetSection.startTime / 4)
      : 0;
    const barEnd = lastTargetSection
      ? Math.floor(
          (lastTargetSection.endTime === Infinity ? lastTargetSection.startTime + 64 : lastTargetSection.endTime) / 4,
        )
      : barStart + 16;

    const sectionName = firstTargetSection?.name ?? "Unknown";

    suggestions.push({
      issueType: `variation:${roleName}`,
      sectionName,
      barRange: { start: barStart, end: barEnd },
      severity: "warning",
    });
  }

  return suggestions;
}

// ─── Internal classification helpers ──────────────────────────────────

/**
 * Check if a suggestion is recommending adding a fill (by issueType or text patterns).
 */
function isFillSuggestion(suggestion: RawSuggestion): boolean {
  const combined = `${suggestion.issueType} ${suggestion.sectionName}`.toLowerCase();
  return FILL_KEYWORDS.some((kw) => combined.includes(kw));
}

/**
 * Check if a suggestion is recommending adding a build or riser.
 */
function isBuildSuggestion(suggestion: RawSuggestion): boolean {
  const combined = `${suggestion.issueType} ${suggestion.sectionName}`.toLowerCase();
  return BUILD_KEYWORDS.some((kw) => combined.includes(kw));
}

/**
 * Create a refinement suggestion to replace a suppressed build/riser suggestion.
 * Instead of "add a build", suggests improvements to the existing build.
 */
function createRefinementSuggestion(
  original: RawSuggestion,
  section: Section,
  contentAnalysis: ContentAnalysisResult,
  sections: readonly Section[],
): RawSuggestion {
  // Determine what kind of build exists for context
  const sectionAnalysis = contentAnalysis.perSection.get(section.id);
  let refinementHint = "build";

  if (sectionAnalysis) {
    for (const trackAnalysis of sectionAnalysis.values()) {
      if (trackAnalysis.build) {
        switch (trackAnalysis.build.type) {
          case "density":
            refinementHint = "density build";
            break;
          case "velocity":
            refinementHint = "velocity ramp";
            break;
          case "pitch-range":
            refinementHint = "pitch build";
            break;
          case "combined":
            refinementHint = "build";
            break;
        }
        break;
      }
    }
  }

  // Also check preceding section
  const sectionIndex = sections.findIndex((s) => s.id === section.id);
  if (refinementHint === "build" && sectionIndex > 0) {
    const prevSection = sections[sectionIndex - 1]!;
    const prevAnalysis = contentAnalysis.perSection.get(prevSection.id);
    if (prevAnalysis) {
      for (const trackAnalysis of prevAnalysis.values()) {
        if (trackAnalysis.build) {
          switch (trackAnalysis.build.type) {
            case "density":
              refinementHint = "density build";
              break;
            case "velocity":
              refinementHint = "velocity ramp";
              break;
            case "pitch-range":
              refinementHint = "pitch build";
              break;
            case "combined":
              refinementHint = "build";
              break;
          }
          break;
        }
      }
    }
  }

  return {
    issueType: `refinement:${refinementHint}`,
    sectionName: original.sectionName,
    barRange: original.barRange,
    severity: "info",
  };
}


// ─── Genre-Aware Percussion Suggestions ───────────────────────────────

/**
 * Genre-specific variation hints per drum element category.
 * Used when no genre profile is available, or as fallback within genre suggestions.
 */
const GENERIC_VARIATION_HINTS: ReadonlyMap<DrumElementCategory, string> = new Map([
  ["kick", "try varying your kick pattern with ghost notes or displaced hits"],
  ["snare", "consider shifting snare placement or adding ghost notes"],
  ["hi-hat", "try switching between closed and open hi-hat or varying velocity"],
  ["tom", "introduce tom fills at phrase boundaries for dynamics"],
  ["cymbal", "vary your cymbal usage with rides, crashes, or bell hits"],
  ["percussion", "swap or layer percussion elements for textural variety"],
  ["other", "experiment with additional rhythmic layers"],
]);

/**
 * Genre-specific variation hints per element category.
 */
const GENRE_VARIATION_HINTS: ReadonlyMap<string, ReadonlyMap<DrumElementCategory, string>> = new Map([
  ["techno", new Map<DrumElementCategory, string>([
    ["hi-hat", "try 16th offbeat shuffles or open hat accents — common in techno for driving energy"],
    ["kick", "consider subtle kick pattern variations or layering a second kick for tonal contrast"],
    ["cymbal", "add ride cymbal movement or alternating crash accents"],
    ["percussion", "swap percussion elements between sections for subtle evolution"],
    ["snare", "experiment with rimshot or clap placement variations"],
    ["tom", "introduce tom accents at phrase boundaries"],
    ["other", "layer additional textural percussion for evolution"],
  ])],
  ["trance", new Map<DrumElementCategory, string>([
    ["snare", "try a snare build-up before the drop — standard in trance transitions"],
    ["hi-hat", "consider opening the hi-hat in the chorus for added energy"],
    ["cymbal", "alternate between ride and crash to mark structural changes"],
    ["tom", "place tom fills at 8-bar boundaries — typical in progressive trance"],
    ["kick", "consider a kick pattern variation in breakdowns"],
    ["percussion", "add shaker or tambourine layers for buildup sections"],
    ["other", "layer FX percussion for transition tension"],
  ])],
  ["drum and bass", new Map<DrumElementCategory, string>([
    ["snare", "add ghost notes between main snare hits — essential for DnB groove"],
    ["hi-hat", "try syncopated hi-hat patterns or rapid 32nd-note rolls"],
    ["kick", "vary kick placement for a breakbeat feel"],
    ["cymbal", "use ride cymbals during rolling sections for momentum"],
    ["tom", "layer toms for fill accents at phrase turnarounds"],
    ["percussion", "experiment with shaker or tambourine fills"],
    ["other", "try layering with additional percussive textures"],
  ])],
  ["trap", new Map<DrumElementCategory, string>([
    ["hi-hat", "increase hi-hat roll density or add triplet feel for intensity"],
    ["snare", "shift snare placement or try a snare roll before drops"],
    ["kick", "vary 808 pattern with slides or pitch bends"],
    ["cymbal", "use crash cymbals to mark transitions"],
    ["tom", "add tom patterns for melodic drum movement"],
    ["percussion", "layer claps or snaps for rhythmic variety"],
    ["other", "experiment with vocal chops or FX hits"],
  ])],
  ["house", new Map<DrumElementCategory, string>([
    ["hi-hat", "try switching to open hi-hat in the chorus for lift"],
    ["kick", "your kick is steady — consider a subtle ghost kick layer for groove"],
    ["cymbal", "add ride cymbal for groove sections"],
    ["percussion", "swap congas or shakers between sections for variety"],
    ["snare", "vary clap placement or layer with a rimshot"],
    ["tom", "use tom hits as transitional accents"],
    ["other", "try layering additional rhythmic percussion"],
  ])],
  ["minimal", new Map<DrumElementCategory, string>([
    ["hi-hat", "try micro-variations in hi-hat velocity or timing"],
    ["kick", "experiment with subtle kick displacement for groove"],
    ["percussion", "rotate between minimal percussion elements across sections"],
    ["cymbal", "use sparse cymbal accents for structural punctuation"],
    ["snare", "vary rimshot or clap patterns subtly"],
    ["tom", "use isolated tom accents for minimal fill moments"],
    ["other", "introduce click or micro-sample textures"],
  ])],
  ["hardcore", new Map<DrumElementCategory, string>([
    ["kick", "consider layering distorted kick variations"],
    ["snare", "try rapid snare rolls for intensity builds"],
    ["cymbal", "use crash patterns to emphasize drops"],
    ["tom", "add tom fills at 4-bar boundaries for impact"],
    ["hi-hat", "drive energy with open hi-hat crescendos"],
    ["percussion", "layer industrial percussion for aggression"],
    ["other", "add noise hits or FX for intensity"],
  ])],
]);

/**
 * Map a genre string to the lookup key used in GENRE_VARIATION_HINTS.
 */
function getGenreHintKey(genre: string): string | null {
  const lower = genre.trim().toLowerCase();
  if (lower.includes("techno") || lower.includes("tech house")) return "techno";
  if (lower.includes("trance")) return "trance";
  if (lower.includes("drum and bass") || lower.includes("dnb") || lower.includes("d&b") || lower.includes("d'n'b")) return "drum and bass";
  if (lower.includes("trap") || lower.includes("hip-hop") || lower.includes("hip hop") || lower.includes("hiphop")) return "trap";
  if (lower.includes("house") || lower.includes("deep house")) return "house";
  if (lower.includes("minimal") || lower.includes("microhouse") || lower.includes("micro house")) return "minimal";
  if (lower.includes("hardcore") || lower.includes("hard dance")) return "hardcore";
  return null;
}

/**
 * Get a variation hint for a specific element, considering genre context.
 */
function getVariationHint(element: DrumElementCategory, genre: string | null): string {
  if (genre) {
    const hintKey = getGenreHintKey(genre);
    if (hintKey) {
      const genreHints = GENRE_VARIATION_HINTS.get(hintKey);
      if (genreHints) {
        const hint = genreHints.get(element);
        if (hint) return hint;
      }
    }
  }
  return GENERIC_VARIATION_HINTS.get(element) ?? "introduce a variation for variety";
}

/**
 * Generate genre-aware percussion suggestions based on content analysis.
 *
 * Uses GenreFillProfile + DrumElementProfile to produce genre-specific suggestions:
 * - Missing core elements
 * - Fill type improvements
 * - Variation hints for extended repetition on drums
 * - Build element suggestions
 * - Atypical usage
 *
 * Falls back to genre-agnostic suggestions when genre is null.
 * Uses drum element category names in all suggestion text.
 */
export function generatePercussionSuggestions(
  contentAnalysis: ContentAnalysisResult,
  sections: readonly Section[],
  genre: string | null,
  drumPadMaps: ReadonlyMap<string, DrumPadMap>,
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];
  const profile = getGenreFillProfile(genre);

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const section = sections[sectionIdx]!;
    const sectionAnalysis = contentAnalysis.perSection.get(section.id);
    if (!sectionAnalysis) continue;

    for (const [trackName, trackAnalysis] of sectionAnalysis) {
      if (trackAnalysis.role !== "drums") continue;
      if (!trackAnalysis.drumElementProfile) continue;

      const drumProfile = trackAnalysis.drumElementProfile;
      const activeElements = drumProfile.activeElements;
      const barStart = Math.round(section.startTime / 4);
      const barEnd = section.endTime === Infinity ? barStart + 16 : Math.round(section.endTime / 4);

      // 1. Missing core elements (genre-aware)
      if (profile) {
        for (const expectedElement of profile.coreElements) {
          // Check if the expected element (by category name) is absent
          if (!activeElements.has(expectedElement as DrumElementCategory)) {
            // Check if it's a conditional element for this section type
            const conditionalSections = profile.conditionalElements.get(expectedElement);
            if (conditionalSections) {
              // Element is conditional — only suggest if this section type matches
              const sectionRole = getStructuralRole(section.name);
              if (!conditionalSections.some((s) => sectionRole.includes(s.toLowerCase()))) {
                continue; // Conditional element not expected in this section type
              }
            }
            suggestions.push({
              issueType: `missing-element:${expectedElement}`,
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "info",
            });
          }
        }
      } else {
        // Genre-agnostic: check for common elements typically expected on drum tracks
        const commonDrumElements: DrumElementCategory[] = ["kick", "snare", "hi-hat"];
        for (const element of commonDrumElements) {
          if (!activeElements.has(element)) {
            suggestions.push({
              issueType: `missing-element:${element}`,
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "info",
            });
          }
        }
      }

      // 2. Fill type suggestions
      if (trackAnalysis.percussionPattern) {
        const fills = trackAnalysis.percussionPattern.fills;
        if (fills.length > 0 && profile) {
          for (const fill of fills) {
            const fillElements = fill.drumElements;
            if (fillElements && fillElements.length > 0) {
              // Determine the detected fill type from elements
              const primaryElement = fillElements[0]!;
              const detectedFillType = mapElementToFillType(primaryElement);

              if (profile.expectedFillTypes.includes(detectedFillType)) {
                // Fill type matches genre — offer a refinement
                suggestions.push({
                  issueType: `fill-refinement:${primaryElement}`,
                  sectionName: section.name,
                  barRange: { start: barStart + fill.position, end: barStart + fill.position + fill.durationBars },
                  severity: "info",
                });
              } else {
                // Fill type is atypical for genre — suggest alternative
                const expectedType = profile.expectedFillTypes[0] ?? "generic-fill";
                suggestions.push({
                  issueType: `atypical-fill:${primaryElement}`,
                  sectionName: section.name,
                  barRange: { start: barStart + fill.position, end: barStart + fill.position + fill.durationBars },
                  severity: "info",
                });
              }
            }
          }
        } else if (fills.length === 0 && profile) {
          // No fills detected — suggest one if genre expects fills here
          const sectionLengthBars = barEnd - barStart;
          const expectedFillsInSection = (sectionLengthBars / 16) * profile.expectedFillFrequency;
          if (expectedFillsInSection >= 1) {
            const expectedType = profile.expectedFillTypes[0] ?? "generic-fill";
            const fillTypeName = expectedType.replace("-", " ");
            suggestions.push({
              issueType: `suggest-fill:${fillTypeName}`,
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "info",
            });
          }
        } else if (fills.length === 0 && !profile) {
          // Genre-agnostic: suggest a fill if section is long enough
          const sectionLengthBars = barEnd - barStart;
          if (sectionLengthBars >= 8) {
            suggestions.push({
              issueType: "suggest-fill:drum fill",
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "info",
            });
          }
        }
      }

      // 3. Variation hints for extended repetition on drums
      const repetitionSummary = contentAnalysis.repetitionSummary.get(trackName);
      if (repetitionSummary && repetitionSummary.hasExtendedRepetition) {
        if (repetitionSummary.extendedRepetitionSections.includes(sectionIdx)) {
          // Find the most prominent active element to suggest varying
          const prominentElement = getMostProminentElement(drumProfile);
          if (prominentElement) {
            const hint = getVariationHint(prominentElement, genre);
            suggestions.push({
              issueType: `variation-hint:${prominentElement}`,
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "warning",
            });
          }
        }
      }

      // 4. Build element suggestions
      if (trackAnalysis.build && profile) {
        // Check if build uses genre-expected build elements
        const buildElements = profile.coreElements;
        // Suggest layering additional elements typical for genre builds
        const missingBuildElements = buildElements.filter(
          (el) => !activeElements.has(el as DrumElementCategory),
        );
        if (missingBuildElements.length > 0) {
          const suggestedElement = missingBuildElements[0]!;
          suggestions.push({
            issueType: `build-element:${suggestedElement}`,
            sectionName: section.name,
            barRange: { start: barStart, end: barEnd },
            severity: "info",
          });
        }
      }

      // 5. Atypical usage (genre-aware only)
      if (profile && genre) {
        for (const element of activeElements) {
          // Check if an active element is not in the genre's core or conditional set
          const isCoreOrConditional =
            profile.coreElements.includes(element) ||
            profile.conditionalElements.has(element);
          if (!isCoreOrConditional && element !== "other") {
            suggestions.push({
              issueType: `atypical-usage:${element}`,
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "info",
            });
          }
        }
      }
    }
  }

  return suggestions;
}

/**
 * Map a DrumElementCategory to the most likely FillType for comparison with genre profiles.
 */
function mapElementToFillType(element: DrumElementCategory): import("./content-analysis-types.js").FillType {
  switch (element) {
    case "tom": return "tom-fill";
    case "snare": return "snare-roll";
    case "hi-hat": return "hat-roll";
    case "cymbal": return "cymbal-fill";
    case "percussion": return "percussion-fill";
    case "kick": return "generic-fill";
    case "other": return "generic-fill";
  }
}

/**
 * Get the most prominent (highest note count) drum element from a profile.
 */
function getMostProminentElement(
  drumProfile: import("./content-analysis-types.js").DrumElementProfile,
): DrumElementCategory | null {
  let maxCount = 0;
  let result: DrumElementCategory | null = null;

  for (const [element, count] of drumProfile.elementCounts) {
    if (count > maxCount) {
      maxCount = count;
      result = element;
    }
  }

  return result;
}

/**
 * Generate discontinuity suggestions when percussion elements appear/disappear across sections.
 *
 * Produces advice like:
 * - "You have ride cymbal in sections 1-3 but it disappears in section 4 — intentional?"
 * - "Section 2 introduces congas but they never return — consider bringing them back"
 *
 * Uses drum element category names in all suggestion text.
 * When genre is available, filters out expected discontinuities (conditional elements).
 */
export function generateDiscontinuitySuggestions(
  discontinuities: readonly PercussionDiscontinuity[],
  sections: readonly Section[],
  genre: string | null,
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];
  const profile = getGenreFillProfile(genre);

  for (const disc of discontinuities) {
    // Filter out expected discontinuities based on genre conditional elements
    if (profile) {
      const conditionalSections = profile.conditionalElements.get(disc.category);
      if (conditionalSections) {
        // This element is conditional for certain section types — check if its absence
        // is expected in the sections where it's missing
        const allAbsentExpected = disc.absentFromSections.every((sectionIdx) => {
          const section = sections[sectionIdx];
          if (!section) return false;
          const sectionRole = getStructuralRole(section.name);
          // If the section type is NOT one where this element is expected, absence is fine
          return !conditionalSections.some((s) => sectionRole.includes(s.toLowerCase()));
        });
        if (allAbsentExpected) continue;
      }
    }

    const elementName = disc.category;

    if (disc.permanentDrop) {
      // Element disappeared and never returns
      const lastPresentIdx = disc.presentInSections[disc.presentInSections.length - 1]!;
      const firstAbsentIdx = disc.absentFromSections[0]!;
      const lastPresentSection = sections[lastPresentIdx];
      const firstAbsentSection = sections[firstAbsentIdx];

      if (lastPresentSection && firstAbsentSection) {
        // Format: present section names
        const presentNames = formatSectionRange(disc.presentInSections, sections);
        const absentSection = firstAbsentSection.name;

        suggestions.push({
          issueType: `discontinuity:${elementName}`,
          sectionName: absentSection,
          barRange: {
            start: Math.round(firstAbsentSection.startTime / 4),
            end: firstAbsentSection.endTime === Infinity
              ? Math.round(firstAbsentSection.startTime / 4) + 16
              : Math.round(firstAbsentSection.endTime / 4),
          },
          severity: "info",
        });
      }
    } else {
      // Gap: element appears, disappears, then reappears
      const firstAbsentIdx = disc.absentFromSections[0]!;
      const absentSection = sections[firstAbsentIdx];

      if (absentSection) {
        const presentNames = formatSectionRange(disc.presentInSections, sections);

        suggestions.push({
          issueType: `discontinuity:${elementName}`,
          sectionName: absentSection.name,
          barRange: {
            start: Math.round(absentSection.startTime / 4),
            end: absentSection.endTime === Infinity
              ? Math.round(absentSection.startTime / 4) + 16
              : Math.round(absentSection.endTime / 4),
          },
          severity: "info",
        });
      }
    }
  }

  return suggestions;
}

/**
 * Format a range of section indices into a readable string like "Verse 1, Verse 2, and Chorus 1".
 */
function formatSectionRange(indices: readonly number[], sections: readonly Section[]): string {
  const names = indices
    .map((i) => sections[i]?.name)
    .filter((n): n is string => n != null);

  if (names.length === 0) return "earlier sections";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}

// ─── Audio-Aware Suggestion Generation ────────────────────────────────

/**
 * Audio-specific variation strategies — distinct from MIDI suggestions.
 * These reference sample/processing concepts rather than note/chord ideas.
 */
const AUDIO_VARIATION_STRATEGIES: readonly string[] = [
  "Consider using a different sample or applying processing automation",
  "Try automating filter cutoff, reverb send, or distortion across these sections",
  "Layer a variation or apply subtle pitch shifting for variety",
  "Apply a different processing chain or automate wet/dry mix for movement",
  "Try chopping and rearranging the audio differently in later sections",
];

/**
 * Get a human-readable display name for an AudioInstrumentRole.
 * Falls back to "audio" for unclassified roles.
 */
function audioRoleDisplayName(role: AudioInstrumentRole): string {
  switch (role) {
    case "drums": return "drums";
    case "bass": return "bass";
    case "vocal": return "vocal";
    case "synth_lead": return "synth lead";
    case "synth_pad": return "synth pad";
    case "full_mix": return "full mix";
    case "unclassified": return "audio";
  }
}

/**
 * Get a human-readable frequency band descriptor for fallback context
 * when role is unclassified.
 */
function dominantBandLabel(bandName: FrequencyBandName): string {
  switch (bandName) {
    case "subBass": return "sub-bass";
    case "bass": return "low-frequency";
    case "lowMid": return "low-mid";
    case "mid": return "mid-range";
    case "highMid": return "high-mid";
    case "high": return "high-frequency";
  }
}

/**
 * Find the dominant frequency band for a track across multiple sections.
 * Returns the band with the highest average energy.
 */
function findDominantBand(
  trackName: string,
  sectionIndices: readonly number[],
  audioContent: AudioContentResults,
  sections: readonly Section[],
): FrequencyBandName | null {
  const bandNames: FrequencyBandName[] = ["subBass", "bass", "lowMid", "mid", "highMid", "high"];
  const bandSums: Record<FrequencyBandName, number> = {
    subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0,
  };
  let count = 0;

  for (const idx of sectionIndices) {
    const section = sections[idx];
    if (!section) continue;
    const sectionData = audioContent.perSection.get(section.id);
    if (!sectionData) continue;
    const trackResult = sectionData.get(trackName);
    if (!trackResult) continue;

    for (const band of bandNames) {
      bandSums[band] += trackResult.spectralProfile.bands[band];
    }
    count++;
  }

  if (count === 0) return null;

  // Find band with highest (least negative) average energy
  let maxBand: FrequencyBandName = "mid";
  let maxEnergy = -Infinity;
  for (const band of bandNames) {
    const avg = bandSums[band] / count;
    if (avg > maxEnergy) {
      maxEnergy = avg;
      maxBand = band;
    }
  }

  return maxBand;
}

/**
 * Generate audio-aware variation suggestions for tracks with extended audio repetition.
 *
 * For each audio track with extended repetition detected (3+ consecutive sections
 * with the same spectral content), produces a suggestion using:
 * - The track's AudioInstrumentRole in the suggestion text
 * - Audio-specific variation strategies (not MIDI-centric like "vary your notes")
 * - A generic "audio" label with frequency band context when role is unclassified
 *
 * Requirements 8.5, 8.6, 8.7: Suggestion Engine uses AudioInstrumentRole in text,
 * generates audio-specific variation strategies, and falls back to generic "audio"
 * when classification fails.
 */
export function generateAudioVariationSuggestions(
  audioContent: AudioContentResults | null | undefined,
  sections: readonly Section[],
): RawSuggestion[] {
  if (!audioContent) return [];

  const suggestions: RawSuggestion[] = [];

  for (const [trackName, repetitionGroups] of audioContent.extendedRepetition) {
    for (const group of repetitionGroups) {
      if (group.length < 3) continue;

      // Determine the role for this track from any available section result
      let role: AudioInstrumentRole = "unclassified";
      for (const idx of group) {
        const section = sections[idx];
        if (!section) continue;
        const sectionData = audioContent.perSection.get(section.id);
        if (!sectionData) continue;
        const trackResult = sectionData.get(trackName);
        if (trackResult) {
          role = trackResult.role.role;
          break;
        }
      }

      // Build the track descriptor for the suggestion
      let trackDescriptor: string;
      if (role === "unclassified") {
        // Fall back to generic "audio" with frequency band context
        const dominantBand = findDominantBand(trackName, group, audioContent, sections);
        if (dominantBand) {
          trackDescriptor = `${dominantBandLabel(dominantBand)} audio`;
        } else {
          trackDescriptor = "audio";
        }
      } else {
        trackDescriptor = `${audioRoleDisplayName(role)} audio`;
      }

      // Target sections are everything after the first occurrence (the "established" pattern)
      const targetSections = group.slice(1);
      const sectionNamesText = formatSectionNames(targetSections, sections);

      // Pick an audio-specific variation strategy based on track name hash for rotation
      const strategyHash = trackName.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const strategy = AUDIO_VARIATION_STRATEGIES[strategyHash % AUDIO_VARIATION_STRATEGIES.length]!;

      // Determine bar range
      const firstTargetIndex = targetSections[0]!;
      const firstTargetSection = sections[firstTargetIndex];
      const lastTargetIndex = targetSections[targetSections.length - 1]!;
      const lastTargetSection = sections[lastTargetIndex];

      const barStart = firstTargetSection
        ? Math.floor(firstTargetSection.startTime / 4)
        : 0;
      const barEnd = lastTargetSection
        ? Math.floor(
            (lastTargetSection.endTime === Infinity ? lastTargetSection.startTime + 64 : lastTargetSection.endTime) / 4,
          )
        : barStart + 16;

      const sectionName = firstTargetSection?.name ?? "Unknown";

      // Format: "Your bass audio track repeats unchanged across sections 3-6.
      //          Consider using a different sample or applying processing automation."
      suggestions.push({
        issueType: `audio-variation:${trackDescriptor}`,
        sectionName,
        barRange: { start: barStart, end: barEnd },
        severity: "warning",
      });
    }
  }

  return suggestions;
}

// ─── Genre-Aware Frequency Balance Suggestions ────────────────────────

/**
 * Map MIDI instrument role to approximate frequency band contributions.
 * Returns energy contribution (in dB-like scale) per band based on the role.
 * This is a rough approximation — MIDI doesn't have true spectral data,
 * but role implies frequency occupation.
 */
function midiRoleToFrequencyContribution(role: string): Partial<Record<FrequencyBandName, number>> {
  switch (role) {
    case "bass":
      return { subBass: -18, bass: -12, lowMid: -30 };
    case "drums":
      return { subBass: -20, bass: -16, mid: -24, highMid: -22, high: -26 };
    case "lead":
      return { mid: -18, highMid: -20, high: -28 };
    case "pad":
      return { lowMid: -18, mid: -16, highMid: -24 };
    case "chord":
      return { lowMid: -20, mid: -16, highMid: -22 };
    case "arpeggio":
      return { mid: -18, highMid: -20, high: -26 };
    default:
      return {};
  }
}

/**
 * Combine audio spectral data and MIDI-derived frequency data for a section
 * into a single frequency band energy map.
 *
 * Audio band energies are used directly (dBFS). MIDI contributions are estimated
 * from instrument roles. Combined by summing in linear power domain, then converting
 * back to dBFS.
 *
 * Requirements 9.5: Combine audio-derived frequency data with MIDI-derived frequency
 * data per Frequency_Band per Section before evaluating band balance.
 */
function combineSectionFrequencyData(
  audioSectionData: ReadonlyMap<string, AudioTrackSectionResult> | undefined,
  midiSectionData: ReadonlyMap<string, { role: string }> | undefined,
): { bands: Record<FrequencyBandName, number>; hasAudioData: boolean; hasMidiData: boolean } {
  const bandNames: FrequencyBandName[] = ["subBass", "bass", "lowMid", "mid", "highMid", "high"];
  // Accumulate energy in linear power domain
  const linearSums: Record<FrequencyBandName, number> = {
    subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0,
  };
  let hasAudioData = false;
  let hasMidiData = false;

  // Add audio track contributions
  if (audioSectionData) {
    for (const [, trackResult] of audioSectionData) {
      hasAudioData = true;
      for (const band of bandNames) {
        const dbfs = trackResult.spectralProfile.bands[band];
        // Convert dBFS to linear power and sum
        if (dbfs > -96) {
          linearSums[band] += Math.pow(10, dbfs / 10);
        }
      }
    }
  }

  // Add MIDI track contributions (estimated from roles)
  if (midiSectionData) {
    for (const [, trackAnalysis] of midiSectionData) {
      hasMidiData = true;
      const contribution = midiRoleToFrequencyContribution(trackAnalysis.role);
      for (const band of bandNames) {
        const dbEstimate = contribution[band];
        if (dbEstimate !== undefined && dbEstimate > -96) {
          linearSums[band] += Math.pow(10, dbEstimate / 10);
        }
      }
    }
  }

  // Convert back to dBFS
  const bands: Record<FrequencyBandName, number> = {
    subBass: -96, bass: -96, lowMid: -96, mid: -96, highMid: -96, high: -96,
  };
  for (const band of bandNames) {
    if (linearSums[band] > 0) {
      bands[band] = Math.max(-96, 10 * Math.log10(linearSums[band]));
    }
  }

  return { bands, hasAudioData, hasMidiData };
}

/**
 * Generate genre-aware frequency balance suggestions by comparing measured
 * frequency band distribution against genre-typical profiles.
 *
 * Produces suggestions when:
 * - Sub-bass energy is >6 dB below genre typical level (Requirement 9.2)
 * - Drum transient density is >30% below genre expectation (Requirement 9.3)
 *
 * Falls back to genre-agnostic suggestions when no genre context is available (Requirement 9.4).
 * Combines audio and MIDI frequency data before evaluating (Requirement 9.5).
 * Indicates when audio data was unavailable (Requirement 9.6).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
export function generateGenreAwareFrequencyBalanceSuggestions(
  audioContent: AudioContentResults | null | undefined,
  midiContent: ContentAnalysisResult | null | undefined,
  sections: readonly Section[],
  genreId: string | null,
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  if (sections.length === 0) return suggestions;

  const genreAudioProfile = getGenreAudioProfile(genreId);

  // For each section, evaluate frequency balance
  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const section = sections[sectionIdx]!;
    if (section.endTime === Infinity) continue; // Skip unbounded last section

    const audioSectionData = audioContent?.perSection.get(section.id);
    const midiSectionData = midiContent?.perSection.get(section.id);

    // No data at all — nothing to evaluate
    if (!audioSectionData && !midiSectionData) continue;

    // Combine audio and MIDI frequency data
    const { bands, hasAudioData, hasMidiData } = combineSectionFrequencyData(
      audioSectionData,
      midiSectionData as ReadonlyMap<string, { role: string }> | undefined,
    );

    // Skip sections where we have no meaningful frequency data
    if (!hasAudioData && !hasMidiData) continue;

    // Compute bar range for this section
    const barStart = Math.floor(section.startTime / 4);
    const barEnd = Math.floor(section.endTime / 4);

    if (genreAudioProfile) {
      // ─── Genre-Aware Frequency Balance ─────────────────────────────

      // Check sub-bass deviation (Requirement 9.2)
      const subBassThreshold = getDeviationThreshold(genreAudioProfile, "subBass");
      const subBassDeviation = computeBandDeviation(
        bands.subBass,
        genreAudioProfile.expectedBands.subBass,
        subBassThreshold,
      );

      if (subBassDeviation > 0) {
        const suffix = !hasAudioData ? ":no-audio" : "";
        suggestions.push({
          issueType: `freq-balance:sub-bass-low${suffix}`,
          sectionName: section.name,
          barRange: { start: barStart, end: barEnd },
          severity: "info",
        });
      }

      // Check drum transient density (Requirement 9.3)
      if (audioSectionData) {
        for (const [trackName, trackResult] of audioSectionData) {
          if (trackResult.role.role !== "drums") continue;

          if (isDrumDensityBelowExpectation(
            trackResult.transientDensity,
            genreAudioProfile.expectedDrumTransientDensity,
          )) {
            suggestions.push({
              issueType: `freq-balance:drum-density-low`,
              sectionName: section.name,
              barRange: { start: barStart, end: barEnd },
              severity: "info",
            });
            break; // One suggestion per section for drum density
          }
        }
      }

      // Check other bands for significant deviation (Requirement 9.1)
      const bandNames: FrequencyBandName[] = ["bass", "lowMid", "mid", "highMid", "high"];
      for (const band of bandNames) {
        const threshold = getDeviationThreshold(genreAudioProfile, band);
        const deviation = computeBandDeviation(
          bands[band],
          genreAudioProfile.expectedBands[band],
          threshold,
        );
        if (deviation > 0) {
          suggestions.push({
            issueType: `freq-balance:${band}-low`,
            sectionName: section.name,
            barRange: { start: barStart, end: barEnd },
            severity: "info",
          });
        }
      }
    } else {
      // ─── Genre-Agnostic Fallback (Requirement 9.4) ─────────────────
      // Without a genre profile, provide general observations when extreme imbalance detected.
      // Use a fixed 10 dB deviation from a balanced reference to detect severe imbalances.
      const AGNOSTIC_THRESHOLD = 10;
      // Reference: a "balanced" arrangement should have reasonable presence in all bands.
      // We use a generous baseline where any band below -40 dBFS while others are above -20 dBFS
      // indicates an imbalance worth noting.
      const maxBandEnergy = Math.max(bands.subBass, bands.bass, bands.lowMid, bands.mid, bands.highMid, bands.high);

      if (maxBandEnergy > -30) {
        // Only suggest if there's meaningful content in the section
        const barStart = Math.floor(section.startTime / 4);
        const barEnd = Math.floor(section.endTime / 4);

        if (bands.subBass < maxBandEnergy - AGNOSTIC_THRESHOLD && bands.subBass < -30) {
          suggestions.push({
            issueType: "freq-balance:sub-bass-low-agnostic",
            sectionName: section.name,
            barRange: { start: barStart, end: barEnd },
            severity: "info",
          });
        }
      }
    }
  }

  // Deduplicate: keep at most one suggestion per issueType per section
  const seen = new Set<string>();
  const deduplicated: RawSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = `${suggestion.issueType}:${suggestion.sectionName}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(suggestion);
    }
  }

  return deduplicated;
}


// ─── Synth-Specific Suggestion Generators ─────────────────────────────

/**
 * Generate variation suggestions for synth tracks with extended repetition.
 *
 * For each track flagged with `hasExtendedRepetition`, emits a suggestion
 * with role-specific variation guidance matching the track's classified
 * InstrumentRole.
 *
 * Requirement 6.1: Role-specific variation guidance for synth tracks with
 * extended repetition across 3+ consecutive sections.
 */
export function generateSynthVariationSuggestions(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  for (const [trackName, flags] of synthAnalysis.repetitionFlags) {
    if (!flags.hasExtendedRepetition) continue;

    const extSections = flags.extendedRepetitionSections;
    if (extSections.length < 3) continue;

    // Determine the instrument role from any available section profile
    let role: InstrumentRole = "unclassified";
    for (const [, sectionProfiles] of synthAnalysis.perSection) {
      const profile = sectionProfiles.get(trackName);
      if (profile) {
        // Infer role from track name heuristics or use a default
        // Since SynthAnalysisResult doesn't carry the role directly, we derive
        // it from the trackName patterns used during analysis. The suggestion
        // system receives tracks already classified — use the name as a lookup.
        break;
      }
    }

    // Map role to guidance text
    let guidance: string;
    const lowerName = trackName.toLowerCase();
    if (lowerName.includes("lead")) {
      role = "lead";
      guidance = "introduce a melodic variation or new motif";
    } else if (lowerName.includes("pad")) {
      role = "pad";
      guidance = "try a different chord voicing or texture";
    } else if (lowerName.includes("arp")) {
      role = "arpeggio";
      guidance = "try a pattern variation";
    } else if (lowerName.includes("chord")) {
      role = "chord";
      guidance = "try an inversion or movement";
    } else if (lowerName.includes("bass")) {
      role = "bass";
      guidance = "try a different inversion or rhythm variation";
    } else {
      guidance = "introduce a variation to break the repetition";
    }

    // Target sections: skip the first occurrence (the "established" pattern)
    const targetSections = extSections.slice(1);
    const firstTargetIndex = targetSections[0]!;
    const firstTargetSection = sections[firstTargetIndex];
    const lastTargetIndex = targetSections[targetSections.length - 1]!;
    const lastTargetSection = sections[lastTargetIndex];

    const barStart = firstTargetSection
      ? Math.floor(firstTargetSection.startTime / 4)
      : 0;
    const barEnd = lastTargetSection
      ? Math.floor(
          (lastTargetSection.endTime === Infinity ? lastTargetSection.startTime + 64 : lastTargetSection.endTime) / 4,
        )
      : barStart + 16;

    const sectionName = firstTargetSection?.name ?? "Unknown";

    suggestions.push({
      issueType: `synth-variation:${roleDisplayName(role)}`,
      sectionName,
      barRange: { start: barStart, end: barEnd },
      severity: "info",
    });
  }

  return suggestions;
}

/**
 * Generate velocity automation suggestions for synth tracks with flat
 * velocity across consecutive sections.
 *
 * Detects synth tracks where the normalized per-bar velocity (mean / 127)
 * varies by ≤ 0.05 (max - min) across 2+ consecutive sections. Emits a
 * suggestion recommending velocity automation or dynamic expression.
 *
 * Requirement 6.2: Velocity automation suggestion for flat dynamics.
 */
export function generateVelocityAutomationSuggestions(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  // Build per-track, per-section velocity mean data
  // Iterate over tracks by collecting section-ordered data
  const trackSectionVelocities = new Map<string, { sectionIndex: number; normalizedMean: number }[]>();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const sectionProfiles = synthAnalysis.perSection.get(section.id);
    if (!sectionProfiles) continue;

    for (const [trackName, profile] of sectionProfiles) {
      if (!trackSectionVelocities.has(trackName)) {
        trackSectionVelocities.set(trackName, []);
      }
      trackSectionVelocities.get(trackName)!.push({
        sectionIndex: i,
        normalizedMean: profile.velocityDynamics.mean / 127,
      });
    }
  }

  // For each track, find runs of 2+ consecutive sections with variation ≤ 0.05
  for (const [trackName, entries] of trackSectionVelocities) {
    // Sort by section index to ensure order
    entries.sort((a, b) => a.sectionIndex - b.sectionIndex);

    // Find runs of consecutive section indices
    let runStart = 0;
    while (runStart < entries.length) {
      let runEnd = runStart;

      // Extend the run while sections are consecutive
      while (
        runEnd + 1 < entries.length &&
        entries[runEnd + 1]!.sectionIndex === entries[runEnd]!.sectionIndex + 1
      ) {
        runEnd++;
      }

      // Check if run has 2+ sections
      const runLength = runEnd - runStart + 1;
      if (runLength >= 2) {
        // Compute max - min of normalized mean velocities across this run
        let minVel = Infinity;
        let maxVel = -Infinity;
        for (let j = runStart; j <= runEnd; j++) {
          const v = entries[j]!.normalizedMean;
          if (v < minVel) minVel = v;
          if (v > maxVel) maxVel = v;
        }

        const variation = maxVel - minVel;
        if (variation <= 0.05) {
          // Emit suggestion for this run
          const firstSectionIdx = entries[runStart]!.sectionIndex;
          const lastSectionIdx = entries[runEnd]!.sectionIndex;
          const firstSection = sections[firstSectionIdx]!;
          const lastSection = sections[lastSectionIdx]!;

          const barStart = Math.floor(firstSection.startTime / 4);
          const barEnd = Math.floor(
            (lastSection.endTime === Infinity ? lastSection.startTime + 64 : lastSection.endTime) / 4,
          );

          suggestions.push({
            issueType: `synth-velocity-automation:${trackName}`,
            sectionName: firstSection.name,
            barRange: { start: barStart, end: barEnd },
            severity: "warning",
          });
        }
      }

      runStart = runEnd + 1;
    }
  }

  return suggestions;
}

/**
 * Generate layering suggestions for sections with high note density but
 * low polyphony on synth tracks.
 *
 * Detects sections where the sum of Note_Density across synth tracks > 4.0
 * but the average PolyphonyProfile mean < 2.0. Emits a suggestion
 * recommending layering or harmonic thickening.
 *
 * Requirement 6.3: Layering suggestion for dense but monophonic synth content.
 */
export function generateLayeringSuggestions(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const sectionProfiles = synthAnalysis.perSection.get(section.id);
    if (!sectionProfiles || sectionProfiles.size === 0) continue;

    // Sum note density and compute average polyphony mean across synth tracks
    let totalDensity = 0;
    let totalPolyphonyMean = 0;
    let trackCount = 0;

    for (const [, profile] of sectionProfiles) {
      totalDensity += profile.noteDensity;
      totalPolyphonyMean += profile.polyphonyProfile.mean;
      trackCount++;
    }

    if (trackCount === 0) continue;

    const avgPolyphonyMean = totalPolyphonyMean / trackCount;

    if (totalDensity > 4.0 && avgPolyphonyMean < 2.0) {
      const barStart = Math.floor(section.startTime / 4);
      const barEnd = section.endTime === Infinity
        ? barStart + 16
        : Math.floor(section.endTime / 4);

      suggestions.push({
        issueType: "synth-layering",
        sectionName: section.name,
        barRange: { start: barStart, end: barEnd },
        severity: "info",
      });
    }
  }

  return suggestions;
}

/**
 * Generate synth intensification suggestions for section transitions where
 * energy increases significantly but synth tracks don't contribute to that increase.
 *
 * Detects section transitions with energy delta ≥ 2 where synth tracks show
 * neither a 25% density increase nor a 25% polyphony increase. Emits a
 * suggestion recommending synth intensification to support the energy curve.
 *
 * Requirement 6.4: Synth intensification suggestion for energy-unsupported transitions.
 */
export function generateSynthIntensificationSuggestions(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
  energyCurve: readonly number[],
): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  for (let i = 1; i < sections.length && i < energyCurve.length; i++) {
    const prevEnergy = energyCurve[i - 1]!;
    const currEnergy = energyCurve[i]!;
    const energyDelta = currEnergy - prevEnergy;

    if (energyDelta < 2) continue;

    // Get synth profiles for previous and current sections
    const prevSection = sections[i - 1]!;
    const currSection = sections[i]!;
    const prevProfiles = synthAnalysis.perSection.get(prevSection.id);
    const currProfiles = synthAnalysis.perSection.get(currSection.id);

    // Compute aggregate density and polyphony for both sections
    let prevTotalDensity = 0;
    let prevMaxPolyphony = 0;
    let currTotalDensity = 0;
    let currMaxPolyphony = 0;

    if (prevProfiles) {
      for (const [, profile] of prevProfiles) {
        prevTotalDensity += profile.noteDensity;
        if (profile.polyphonyProfile.mean > prevMaxPolyphony) {
          prevMaxPolyphony = profile.polyphonyProfile.mean;
        }
      }
    }

    if (currProfiles) {
      for (const [, profile] of currProfiles) {
        currTotalDensity += profile.noteDensity;
        if (profile.polyphonyProfile.mean > currMaxPolyphony) {
          currMaxPolyphony = profile.polyphonyProfile.mean;
        }
      }
    }

    // Check if synth tracks show at least 25% density increase OR 25% polyphony increase
    const densityIncrease = prevTotalDensity > 0
      ? (currTotalDensity - prevTotalDensity) / prevTotalDensity
      : currTotalDensity > 0 ? 1 : 0;
    const polyphonyIncrease = prevMaxPolyphony > 0
      ? (currMaxPolyphony - prevMaxPolyphony) / prevMaxPolyphony
      : currMaxPolyphony > 0 ? 1 : 0;

    // If neither density nor polyphony increased by 25%, suggest intensification
    if (densityIncrease < 0.25 && polyphonyIncrease < 0.25) {
      const barStart = Math.floor(currSection.startTime / 4);
      const barEnd = currSection.endTime === Infinity
        ? barStart + 16
        : Math.floor(currSection.endTime / 4);

      suggestions.push({
        issueType: "synth-intensification",
        sectionName: currSection.name,
        barRange: { start: barStart, end: barEnd },
        severity: "warning",
      });
    }
  }

  return suggestions;
}

// ─── Synth Suggestion Priority Cap ────────────────────────────────────

/**
 * Severity priority order for synth suggestions.
 * Higher index = higher priority.
 * intensification > velocity automation > layering > variation
 */
const SYNTH_SUGGESTION_PRIORITY: readonly string[] = [
  "synth-variation",
  "synth-layering",
  "synth-velocity-automation",
  "synth-intensification",
];

/** Maximum synth-related suggestions allowed per section. */
const MAX_SYNTH_SUGGESTIONS_PER_SECTION = 3;

/**
 * Get the priority rank for a synth suggestion's issueType.
 * Higher number = higher priority.
 */
function getSynthSuggestionPriority(issueType: string): number {
  for (let i = 0; i < SYNTH_SUGGESTION_PRIORITY.length; i++) {
    if (issueType.startsWith(SYNTH_SUGGESTION_PRIORITY[i]!)) {
      return i;
    }
  }
  return -1; // Not a recognized synth suggestion type
}

/**
 * Apply priority cap to synth suggestions: at most 3 per section,
 * ordered by severity (intensification > velocity automation > layering > variation).
 *
 * Requirement 6.5: At most 3 synth-related suggestions per section,
 * prioritized by severity.
 */
export function applySynthSuggestionPriorityCap(
  suggestions: readonly RawSuggestion[],
): RawSuggestion[] {
  // Group suggestions by section name
  const bySectionName = new Map<string, RawSuggestion[]>();

  for (const suggestion of suggestions) {
    const existing = bySectionName.get(suggestion.sectionName);
    if (existing) {
      existing.push(suggestion);
    } else {
      bySectionName.set(suggestion.sectionName, [suggestion]);
    }
  }

  // For each section, sort by priority (descending) and take at most 3
  const result: RawSuggestion[] = [];

  for (const [, sectionSuggestions] of bySectionName) {
    // Sort by priority descending (highest priority first)
    sectionSuggestions.sort((a, b) => {
      return getSynthSuggestionPriority(b.issueType) - getSynthSuggestionPriority(a.issueType);
    });

    // Take at most MAX_SYNTH_SUGGESTIONS_PER_SECTION
    const capped = sectionSuggestions.slice(0, MAX_SYNTH_SUGGESTIONS_PER_SECTION);
    result.push(...capped);
  }

  return result;
}

// ─── Synth Suggestion Pipeline ────────────────────────────────────────

/**
 * Generate all synth-specific suggestions and apply the priority cap.
 *
 * Calls all synth suggestion generators when `SynthAnalysisResult` is available,
 * applies the priority cap (max 3 per section ordered by severity), and returns
 * the capped list ready for merging into the main suggestion pipeline.
 *
 * Requirements 6.1–6.5: Complete synth suggestion pipeline with priority cap.
 */
export function generateSynthSuggestions(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
  energyCurve: readonly number[],
): RawSuggestion[] {
  // Generate all synth suggestion types
  const variationSuggestions = generateSynthVariationSuggestions(synthAnalysis, sections);
  const velocitySuggestions = generateVelocityAutomationSuggestions(synthAnalysis, sections);
  const layeringSuggestions = generateLayeringSuggestions(synthAnalysis, sections);
  const intensificationSuggestions = generateSynthIntensificationSuggestions(synthAnalysis, sections, energyCurve);

  // Combine all synth suggestions
  const allSynthSuggestions: RawSuggestion[] = [
    ...variationSuggestions,
    ...velocitySuggestions,
    ...layeringSuggestions,
    ...intensificationSuggestions,
  ];

  // Apply priority cap (max 3 per section)
  return applySynthSuggestionPriorityCap(allSynthSuggestions);
}
