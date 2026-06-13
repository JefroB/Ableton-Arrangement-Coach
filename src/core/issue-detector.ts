/**
 * Issue Detector — pure-function module that runs heuristic sub-detectors
 * against arrangement state to surface arrangement problems.
 *
 * This file houses the main `detectIssues` entry point (added in a later task)
 * and all internal sub-detector helpers. Each sub-detector is a pure function
 * that receives relevant slices of the arrangement state plus genre thresholds,
 * and returns typed Issue objects.
 */
import type { Section } from "./section-scanner.js";
import type { SectionAnalysisState } from "../state/store.js";
import type { TrackClipData, TrackNoteData } from "./section-analyzer.js";
import type { TrackInfo } from "./track-reader.js";
import type { Issue, IssueSeverity, IssueDetectorInput } from "./issue-types.js";
import type { FrequencyBucket } from "./track-categorizer.js";
import type { AudioContentResults, FrequencyBandName } from "./audio-content-types.js";
import type { SynthAnalysisResult } from "./synth-analysis-types.js";
import type { InstrumentRole } from "./content-analysis-types.js";
import { getProfile, getProfileBySubgenre } from "./genre-registry.js";
import type { GenreProfile } from "./genre-profile-types.js";
import { computeTrackActivity, computeMidiDensity } from "./section-analyzer.js";
import { classifyInstrumentRole } from "./content-analyzer.js";
import { renderSuggestion, type RawSuggestion } from "./suggestion-renderer.js";

// ─── Internal Types ────────────────────────────────────────────────────

/** Decomposed similarity components for debugging and testing. */
interface SimilarityComponents {
  readonly trackSetOverlap: number;   // Jaccard index, weight 0.4
  readonly midiDensityRatio: number;  // min/max, weight 0.35
  readonly automationMatch: number;   // 0 or 1, weight 0.25
}

/**
 * Internal resolved threshold profile combining DetectionThresholds
 * with values extracted from DetectionRules. Maintains backward compatibility
 * with the internal sub-detector API while sourcing data from the new registry.
 */
interface GenreThresholdProfile {
  readonly flatEnergyDelta: number;
  readonly repetitionSimilarity: number;
  readonly abruptChangeDelta: number;
  readonly crowdingTrackCount: number;
  readonly introMinBars: number;
  readonly outroMinBars: number;
}

/** Default thresholds used when no genre is selected or genre is unknown. */
const DEFAULT_THRESHOLDS: GenreThresholdProfile = {
  flatEnergyDelta: 1,
  repetitionSimilarity: 0.85,
  abruptChangeDelta: 5,
  crowdingTrackCount: 3,
  introMinBars: 16,
  outroMinBars: 16,
};

/**
 * Build a GenreThresholdProfile from a GenreProfile's detectionThresholds
 * and detectionRules. Falls back to defaults for values not present.
 */
function buildThresholdProfile(profile: GenreProfile): GenreThresholdProfile {
  const thresholds = profile.detectionThresholds;
  const rules = profile.detectionRules;

  // Extract intro/outro min bars from detection rules
  const introRule = rules.find((r) => r.type === "min-intro-bars");
  const outroRule = rules.find((r) => r.type === "min-outro-bars");

  return {
    flatEnergyDelta: thresholds.flatEnergyMaxDelta,
    repetitionSimilarity: thresholds.similarityCeilingPercent / 100,
    abruptChangeDelta: thresholds.missingTransitionMinDelta + 2, // abrupt is stricter than missing
    crowdingTrackCount: DEFAULT_THRESHOLDS.crowdingTrackCount,
    introMinBars: typeof introRule?.value === "number" ? introRule.value : DEFAULT_THRESHOLDS.introMinBars,
    outroMinBars: typeof outroRule?.value === "number" ? outroRule.value : DEFAULT_THRESHOLDS.outroMinBars,
  };
}

/**
 * Get the resolved threshold profile for a genre ID.
 * Returns default thresholds if genreId is null or not found.
 */
function getThresholdsForGenre(genreId: string | null): GenreThresholdProfile {
  if (genreId === null) {
    return DEFAULT_THRESHOLDS;
  }
  const profile = getProfile(genreId);
  if (profile === null) {
    return DEFAULT_THRESHOLDS;
  }
  return buildThresholdProfile(profile);
}

// ─── Special Parser Mode ────────────────────────────────────────────────

/**
 * Determine whether special parser mode should be active for a genre profile.
 *
 * Special parser mode suppresses standard sub-detectors (flat-energy, repetition,
 * abrupt-change, intro/outro-length) for genres that intentionally violate
 * conventional structure (IDM, Glitch, Breakcore, Speedcore).
 *
 * Returns `true` if the profile's detectionRules contain a rule with
 * type "standard-structure-not-applicable" and value `true`.
 * Returns `false` when profile is null or no such rule exists.
 */
export function isSpecialParserMode(profile: GenreProfile | null): boolean {
  if (!profile) return false;
  return profile.detectionRules.some(
    (rule) => rule.type === "standard-structure-not-applicable" && rule.value === true,
  );
}

// ─── Structural Similarity ─────────────────────────────────────────────

/**
 * Compute the Jaccard index of two sets of active track names.
 *
 * Jaccard index = |intersection| / |union|.
 * Returns 0 if both sets are empty (no overlap to speak of).
 */
function computeJaccardIndex(tracksA: readonly string[], tracksB: readonly string[]): number {
  const setA = new Set(tracksA);
  const setB = new Set(tracksB);

  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const name of setA) {
    if (setB.has(name)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Compute MIDI density ratio between two sections.
 *
 * Ratio = min(densityA, densityB) / max(densityA, densityB).
 * Returns 0 if both densities are 0.
 * Returns 1 if both densities are equal (and non-zero).
 */
function computeMidiDensityRatio(densityA: number, densityB: number): number {
  const minVal = Math.min(densityA, densityB);
  const maxVal = Math.max(densityA, densityB);

  if (maxVal === 0) {
    return 0;
  }

  return minVal / maxVal;
}

/**
 * Compute automation presence match between two sections.
 *
 * Returns 1 if both sections agree on hasAutomation, 0 otherwise.
 */
function computeAutomationMatch(hasAutomationA: boolean, hasAutomationB: boolean): number {
  return hasAutomationA === hasAutomationB ? 1 : 0;
}

/**
 * Compute structural similarity between two sections.
 *
 * Uses three weighted components:
 * - Track set overlap (Jaccard index): weight 0.4
 * - MIDI density ratio (min/max): weight 0.35
 * - Automation presence match (0 or 1): weight 0.25
 *
 * The weighted sum is guaranteed to be in [0, 1] since all components are in [0, 1].
 *
 * @param sectionA - First section
 * @param sectionB - Second section
 * @param trackClipData - All track clip data for computing active track names
 * @param trackNoteData - All track note data for computing MIDI density
 * @param analysisA - Pre-computed analysis state for section A
 * @param analysisB - Pre-computed analysis state for section B
 * @returns The structural similarity score in [0, 1]
 */
function computeStructuralSimilarity(
  sectionA: Section,
  sectionB: Section,
  trackClipData: readonly TrackClipData[],
  trackNoteData: readonly TrackNoteData[],
  analysisA: SectionAnalysisState,
  analysisB: SectionAnalysisState,
): number {
  // Compute active track names for each section from raw clip data
  const activeTracksA = computeTrackActivity(sectionA, trackClipData);
  const activeTracksB = computeTrackActivity(sectionB, trackClipData);

  // Compute MIDI density for each section from raw note data
  const midiDensityA = computeMidiDensity(sectionA, trackNoteData);
  const midiDensityB = computeMidiDensity(sectionB, trackNoteData);

  // Compute components
  const trackSetOverlap = computeJaccardIndex(activeTracksA, activeTracksB);
  const midiDensityRatio = computeMidiDensityRatio(midiDensityA, midiDensityB);
  const automationMatch = computeAutomationMatch(analysisA.hasAutomation, analysisB.hasAutomation);

  // Weighted sum
  return 0.4 * trackSetOverlap + 0.35 * midiDensityRatio + 0.25 * automationMatch;
}

// ─── Flat Energy Detection ──────────────────────────────────────────────

/**
 * Detect consecutive sections with negligible energy changes.
 *
 * Scans the energy curve for runs of consecutive sections where the absolute
 * difference between adjacent energy values is below the flat threshold.
 * - Exactly 2 consecutive flat sections → "warning" severity
 * - 3 or more consecutive flat sections → "critical" severity
 *
 * Skips detection if fewer than 2 sections exist.
 *
 * @param sections - Ordered array of arrangement sections
 * @param energyCurve - Energy score per section (aligned by index)
 * @param flatEnergyDelta - Threshold below which a transition is considered flat
 * @returns Array of flat energy issues
 */
function detectFlatEnergy(
  sections: readonly Section[],
  energyCurve: readonly number[],
  flatEnergyDelta: number,
): Issue[] {
  // Skip if fewer than 2 sections
  if (sections.length < 2) {
    return [];
  }

  const issues: Issue[] = [];

  // Track runs of consecutive flat sections.
  // A "flat transition" at index i means |energyCurve[i] - energyCurve[i-1]| < threshold.
  // A run of flat transitions starting at section index `start` means sections
  // start through start+runLength are all part of the flat region.
  let runStart = -1; // index of the first section in the current flat run

  for (let i = 1; i <= sections.length; i++) {
    const currEnergy = energyCurve[i];
    const prevEnergy = energyCurve[i - 1];
    const isFlat =
      i < sections.length &&
      currEnergy !== undefined &&
      prevEnergy !== undefined &&
      Math.abs(currEnergy - prevEnergy) < flatEnergyDelta;

    if (isFlat) {
      if (runStart === -1) {
        // Start a new run at the preceding section
        runStart = i - 1;
      }
    } else {
      // End of a run (or no run active)
      if (runStart !== -1) {
        // The run covers sections from runStart to i-1 (inclusive)
        const runEnd = i - 1;
        const runLength = runEnd - runStart + 1; // number of sections in the flat region

        if (runLength >= 2) {
          const sectionIds = sections.slice(runStart, runEnd + 1).map((s) => s.id);
          const severity: IssueSeverity = runLength === 2 ? "warning" : "critical";
          const firstId = sectionIds[0]!;
          const lastId = sectionIds[sectionIds.length - 1]!;

          // Generate ID
          const id = runLength === 2
            ? `flat-energy-${firstId}-${lastId}`
            : `flat-energy-${firstId}-...-${lastId}`;

          // Generate actionable message
          const firstName = sections[runStart]!.name;
          const lastName = sections[runEnd]!.name;
          let message: string;
          if (runLength === 2) {
            message = `Energy is flat between ${firstName} and ${lastName}. Consider adding variation or dynamic contrast.`;
          } else {
            message = `Energy is flat across ${runLength} sections from ${firstName} to ${lastName}. Consider adding variation or dynamic contrast.`;
          }

          // Truncate message to 200 chars
          if (message.length > 200) {
            message = message.slice(0, 197) + "...";
          }

          issues.push({
            id,
            type: "flat-energy",
            severity,
            sectionIds,
            message,
          });
        }

        runStart = -1;
      }
    }
  }

  return issues;
}

// ─── Missing Transition Detection ───────────────────────────────────────

/** Transition keywords checked case-insensitively against track names. */
const TRANSITION_KEYWORDS = ["riser", "sweep", "fx", "fill", "trans", "build"] as const;

/** Options for missing transition detection. */
interface DetectMissingTransitionsOptions {
  /** When true, suppress issues triggered solely by phrase boundary misalignment. */
  readonly suppressPhraseAlignment?: boolean;
}

/**
 * Detect section boundaries with large energy jumps but no transition elements.
 *
 * For each pair of consecutive sections, checks whether the absolute energy
 * delta >= 3. If so, scans the last 4 bars (16 beats) of the preceding section
 * for transition elements. If no transition is found, reports an issue.
 *
 * Transition element detection checks for:
 * (a) Any clip in the window with hasEnvelopes (automation)
 * (b) Any clip on a track named with transition keywords
 * (c) Any clip on a return track
 *
 * When `suppressPhraseAlignment` is true, issues triggered solely by phrase
 * boundary misalignment (section boundaries not on 8-bar/32-beat boundaries)
 * are suppressed. This supports non-standard rhythm genres that use non-4/4
 * kick patterns.
 *
 * @param sections - Ordered array of arrangement sections
 * @param energyCurve - Energy score per section (aligned by index)
 * @param trackClipData - All track clip data for clip overlap detection
 * @param trackInventory - Track inventory for return track identification
 * @param options - Optional configuration for suppression behavior
 * @returns Array of missing transition issues
 */
function detectMissingTransitions(
  sections: readonly Section[],
  energyCurve: readonly number[],
  trackClipData: readonly TrackClipData[],
  trackInventory: readonly TrackInfo[],
  options?: DetectMissingTransitionsOptions,
): Issue[] {
  if (sections.length < 2) {
    return [];
  }

  const suppressPhraseAlignment = options?.suppressPhraseAlignment ?? false;

  const issues: Issue[] = [];

  // Build a set of return track names for quick lookup.
  // TrackInfo.type may be extended to include "return" in the future.
  const returnTrackNames = new Set<string>();
  for (const track of trackInventory) {
    if ((track.type as string) === "return") {
      returnTrackNames.add(track.name);
    }
  }

  for (let i = 1; i < sections.length; i++) {
    // Ensure we have energy data for both sections
    if (i >= energyCurve.length || (i - 1) >= energyCurve.length) {
      continue;
    }

    const delta = Math.abs(energyCurve[i]! - energyCurve[i - 1]!);
    if (delta < 3) {
      continue;
    }

    const precedingSection = sections[i - 1]!;
    const followingSection = sections[i]!;

    // When suppressPhraseAlignment is active, skip issues where the boundary
    // does not fall on a standard 8-bar (32-beat) phrase boundary.
    // This supports non-standard rhythm genres that use syncopated/broken patterns
    // and don't adhere to 4/4 phrase alignment conventions.
    if (suppressPhraseAlignment) {
      const boundary = precedingSection.endTime;
      if (boundary % 32 !== 0) {
        continue; // Non-phrase-aligned boundary — suppress
      }
    }

    // Compute the detection window: last 4 bars (16 beats) of preceding section,
    // or the entire section if shorter than 4 bars.
    const sectionLength = precedingSection.endTime - precedingSection.startTime;
    const windowBeats = 16; // 4 bars × 4 beats per bar
    const windowStart =
      sectionLength < windowBeats
        ? precedingSection.startTime
        : precedingSection.endTime - windowBeats;
    const windowEnd = precedingSection.endTime;

    // Check for transition elements in the window
    const hasTransition = hasTransitionElement(
      windowStart,
      windowEnd,
      trackClipData,
      returnTrackNames,
    );

    if (hasTransition) {
      continue; // Transition element present — no issue
    }

    // Determine severity
    const severity: IssueSeverity = delta >= 5 ? "critical" : "warning";

    // Build issue
    const id = `missing-transition-${precedingSection.id}-${followingSection.id}`;
    let message = `No transition element between ${precedingSection.name} and ${followingSection.name} (energy jump of ${delta}). Add a riser, sweep, or automation to smooth the change.`;

    // Truncate to 200 chars max
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }

    issues.push({
      id,
      type: "missing-transition",
      severity,
      sectionIds: [precedingSection.id, followingSection.id],
      message,
    });
  }

  return issues;
}

/**
 * Check whether any transition element exists in the given time window.
 *
 * A transition element is present when ANY of:
 * (a) Any clip in the window has hasEnvelopes (parameter automation)
 * (b) Any clip in the window is on a track with a transition keyword in its name
 * (c) Any clip in the window is on a return track
 *
 * A clip is "in the window" if it overlaps [windowStart, windowEnd):
 *   clip.startTime < windowEnd && clip.endTime > windowStart
 *
 * @param windowStart - Start of the detection window (beats)
 * @param windowEnd - End of the detection window (beats)
 * @param trackClipData - All track clip data
 * @param returnTrackNames - Set of track names identified as return tracks
 * @returns true if any transition element is found
 */
function hasTransitionElement(
  windowStart: number,
  windowEnd: number,
  trackClipData: readonly TrackClipData[],
  returnTrackNames: ReadonlySet<string>,
): boolean {
  for (const track of trackClipData) {
    // Pre-check: is this track a transition-keyword track or a return track?
    const trackNameLower = track.trackName.toLowerCase();
    const isTransitionTrack = TRANSITION_KEYWORDS.some((kw) => trackNameLower.includes(kw));
    const isReturnTrack = returnTrackNames.has(track.trackName);

    for (const clip of track.clips) {
      // Check clip overlaps the window
      if (clip.startTime >= windowEnd || clip.endTime <= windowStart) {
        continue; // No overlap
      }

      // (a) Clip has automation envelopes
      if (clip.hasEnvelopes) {
        return true;
      }

      // (b) Clip is on a track with a transition keyword
      if (isTransitionTrack) {
        return true;
      }

      // (c) Clip is on a return track
      if (isReturnTrack) {
        return true;
      }
    }
  }

  return false;
}

// ─── Repetition Detection ───────────────────────────────────────────────

/** Genres where repetition is expected and tolerated (lower severity). */
const REPETITION_TOLERANT_GENRES: readonly string[] = ["techno", "ambient-downtempo"];

/**
 * Detect consecutive sections with high structural similarity.
 *
 * Evaluates repetition only between adjacent section pairs (N, N+1). For each
 * pair, computes structural similarity and compares against the genre-specific
 * repetition threshold. If similarity exceeds the threshold, reports an issue.
 *
 * Severity is "info" for repetition-tolerant genres (Techno, Ambient) and
 * "warning" for all other genres (or null genre).
 *
 * Skips detection if fewer than 2 sections exist.
 *
 * @param sections - Ordered array of arrangement sections
 * @param sectionAnalysis - Pre-computed analysis state per section
 * @param trackClipData - All track clip data for computing active track names
 * @param trackNoteData - All track note data for computing MIDI density
 * @param thresholds - Genre threshold profile (contains repetitionSimilarity)
 * @param selectedGenre - Currently selected genre or null
 * @returns Array of repetition issues
 */
function detectRepetition(
  sections: readonly Section[],
  sectionAnalysis: ReadonlyMap<string, SectionAnalysisState>,
  trackClipData: readonly TrackClipData[],
  trackNoteData: readonly TrackNoteData[],
  thresholds: GenreThresholdProfile,
  selectedGenre: string | null,
): Issue[] {
  // Skip if fewer than 2 sections
  if (sections.length < 2) {
    return [];
  }

  const issues: Issue[] = [];

  // Determine severity based on genre
  const severity: IssueSeverity =
    selectedGenre !== null && REPETITION_TOLERANT_GENRES.includes(selectedGenre)
      ? "info"
      : "warning";

  for (let i = 0; i < sections.length - 1; i++) {
    const sectionA = sections[i]!;
    const sectionB = sections[i + 1]!;

    // Get analysis states for both sections
    const analysisA = sectionAnalysis.get(sectionA.id);
    const analysisB = sectionAnalysis.get(sectionB.id);

    // Skip if either section's analysis is missing
    if (!analysisA || !analysisB) {
      continue;
    }

    // Compute structural similarity
    const similarity = computeStructuralSimilarity(
      sectionA,
      sectionB,
      trackClipData,
      trackNoteData,
      analysisA,
      analysisB,
    );

    // Compare against threshold
    if (similarity > thresholds.repetitionSimilarity) {
      const id = `repetition-${sectionA.id}-${sectionB.id}`;

      let message = `Sections ${sectionA.name} and ${sectionB.name} are structurally similar (${similarity.toFixed(2)}). Consider varying instrumentation, density, or automation.`;

      // Truncate message to 200 chars max
      if (message.length > 200) {
        message = message.slice(0, 197) + "...";
      }

      issues.push({
        id,
        type: "repetition",
        severity,
        sectionIds: [sectionA.id, sectionB.id],
        message,
      });
    }
  }

  return issues;
}

// ─── Abrupt Change Detection ────────────────────────────────────────────

/** Keywords indicating a riser or sweep track (case-insensitive). */
const BUILDUP_KEYWORDS = ["riser", "sweep"] as const;

/** Genres for which drop suppression applies. */
const DROP_SUPPRESSION_GENRES: readonly string[] = ["techno", "house", "trance", "drum-and-bass"];

/** Section names (case-insensitive) that qualify for drop suppression. */
const DROP_SECTION_NAMES = ["drop", "main", "peak"] as const;

/**
 * Detect whether buildup context exists in a time window.
 *
 * Buildup context is present when ANY of:
 * (a) A clip on a track named with riser/sweep keywords overlaps the window
 * (b) A clip with hasEnvelopes overlaps the window (proxy for filter/volume automation)
 * (c) High MIDI note density in the window (>= 4 notes per bar)
 *
 * @param windowStart - Start of the detection window (beats)
 * @param windowEnd - End of the detection window (beats)
 * @param trackClipData - All track clip data
 * @param trackNoteData - All track note data
 * @returns true if any buildup context indicator is found
 */
function hasBuildupContext(
  windowStart: number,
  windowEnd: number,
  trackClipData: readonly TrackClipData[],
  trackNoteData: readonly TrackNoteData[],
): boolean {
  // Check clip-based indicators: riser/sweep track or hasEnvelopes
  for (const track of trackClipData) {
    const trackNameLower = track.trackName.toLowerCase();
    const isBuildupTrack = BUILDUP_KEYWORDS.some((kw) => trackNameLower.includes(kw));

    for (const clip of track.clips) {
      // Check clip overlaps the window
      if (clip.startTime >= windowEnd || clip.endTime <= windowStart) {
        continue;
      }

      // (a) Clip is on a track with a buildup keyword (riser/sweep)
      if (isBuildupTrack) {
        return true;
      }

      // (b) Clip has automation envelopes (proxy for filter cutoff or volume automation)
      if (clip.hasEnvelopes) {
        return true;
      }
    }
  }

  // (c) Percussion roll: check for high note density in the window
  // Threshold: >= 4 notes per bar
  const windowLength = windowEnd - windowStart;
  if (windowLength > 0) {
    const windowLengthInBars = windowLength / 4;
    const densityThreshold = 4; // notes per bar

    let noteCount = 0;
    for (const track of trackNoteData) {
      for (const note of track.notes) {
        if (note.startTime >= windowStart && note.startTime < windowEnd) {
          noteCount++;
        }
      }
    }

    const density = noteCount / windowLengthInBars;
    if (density >= densityThreshold) {
      return true;
    }
  }

  return false;
}

/**
 * Detect abrupt energy changes between consecutive sections.
 *
 * Reports an issue when the absolute energy delta between two adjacent sections
 * is >= abruptChangeDelta threshold AND no buildup context is detected in the
 * final 4 bars of the preceding section.
 *
 * Suppresses issues where energy increases into a "Drop"/"Main"/"Peak" section
 * in drop-suppression genres (Techno, House, Trance, Drum and Bass).
 *
 * @param sections - Ordered array of arrangement sections
 * @param energyCurve - Energy score per section (aligned by index)
 * @param trackClipData - All track clip data for buildup detection
 * @param trackNoteData - All track note data for percussion roll detection
 * @param selectedGenre - Currently selected genre (or null)
 * @param abruptChangeDelta - Threshold for abrupt energy change detection
 * @returns Array of abrupt change issues
 */
function detectAbruptChanges(
  sections: readonly Section[],
  energyCurve: readonly number[],
  trackClipData: readonly TrackClipData[],
  trackNoteData: readonly TrackNoteData[],
  selectedGenre: string | null,
  abruptChangeDelta: number,
): Issue[] {
  if (sections.length < 2) {
    return [];
  }

  const issues: Issue[] = [];

  // Determine if drop suppression is applicable for this genre
  const isDropSuppressionGenre =
    selectedGenre !== null &&
    DROP_SUPPRESSION_GENRES.includes(selectedGenre);

  for (let i = 1; i < sections.length; i++) {
    // Ensure we have energy data for both sections
    if (i >= energyCurve.length || (i - 1) >= energyCurve.length) {
      continue;
    }

    const prevEnergy = energyCurve[i - 1]!;
    const currEnergy = energyCurve[i]!;
    const delta = Math.abs(currEnergy - prevEnergy);

    // Skip if below threshold
    if (delta < abruptChangeDelta) {
      continue;
    }

    const precedingSection = sections[i - 1]!;
    const followingSection = sections[i]!;

    // Check drop suppression: energy INCREASES into a drop/main/peak section
    if (isDropSuppressionGenre && currEnergy > prevEnergy) {
      const followingNameLower = followingSection.name.toLowerCase();
      const isDropSection = DROP_SECTION_NAMES.some((name) => followingNameLower.includes(name));
      if (isDropSection) {
        continue; // Suppress this issue
      }
    }

    // Check buildup context in last 4 bars (16 beats) of preceding section
    const sectionLength = precedingSection.endTime - precedingSection.startTime;
    const windowBeats = 16; // 4 bars × 4 beats per bar
    const windowStart =
      sectionLength < windowBeats
        ? precedingSection.startTime
        : precedingSection.endTime - windowBeats;
    const windowEnd = precedingSection.endTime;

    const hasBuildup = hasBuildupContext(
      windowStart,
      windowEnd,
      trackClipData,
      trackNoteData,
    );

    if (hasBuildup) {
      continue; // Buildup context found — no issue
    }

    // Build issue
    const id = `abrupt-change-${precedingSection.id}-${followingSection.id}`;
    let message = `Abrupt energy change from ${prevEnergy} to ${currEnergy} between ${precedingSection.name} and ${followingSection.name}. Consider adding a buildup or transition element.`;

    // Truncate to 200 chars max
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }

    issues.push({
      id,
      type: "abrupt-change",
      severity: "warning",
      sectionIds: [precedingSection.id, followingSection.id],
      message,
    });
  }

  return issues;
}

// ─── Frequency Crowding Detection ───────────────────────────────────────

/**
 * Detect sections where too many tracks compete in the same frequency bucket.
 *
 * For each section, determines which tracks are active (have clips overlapping
 * the section time range), groups them by their frequency bucket assignment,
 * and reports crowding when the count exceeds the threshold.
 *
 * Excludes tracks assigned to the "full" bucket and tracks with no bucket
 * assignment from crowding calculations.
 *
 * For drop sections (name contains "Drop" case-insensitive, or the section has
 * the highest energy score in the arrangement), the threshold is raised by 1.
 *
 * Normal thresholds: 4 tracks → "info", 5+ → "warning"
 * Drop thresholds:   5 tracks → "info", 6+ → "warning"
 *
 * @param sections - Ordered array of arrangement sections
 * @param trackClipData - All track clip data for active track detection
 * @param trackBuckets - Frequency bucket assignments parallel to trackClipData
 * @param energyCurve - Energy score per section (aligned by index)
 * @returns Array of frequency crowding issues
 */
function detectFrequencyCrowding(
  sections: readonly Section[],
  trackClipData: readonly TrackClipData[],
  trackBuckets: readonly FrequencyBucket[],
  energyCurve: readonly number[],
  audioContentAnalysis?: AudioContentResults | null,
): Issue[] {
  if (sections.length === 0) {
    return [];
  }

  // Bail if trackBuckets doesn't align with trackClipData
  if (trackBuckets.length !== trackClipData.length) {
    return [];
  }

  const issues: Issue[] = [];

  // Determine the highest energy score in the arrangement for drop detection
  const maxEnergy = energyCurve.length > 0
    ? Math.max(...energyCurve)
    : 0;

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const section = sections[sectionIdx]!;

    // Determine if this is a drop section
    const sectionNameLower = section.name.toLowerCase();
    const isDropByName = sectionNameLower.includes("drop");
    const sectionEnergy = sectionIdx < energyCurve.length ? energyCurve[sectionIdx]! : 0;
    const isDropByEnergy = sectionEnergy === 10 || (maxEnergy > 0 && sectionEnergy === maxEnergy);
    const isDrop = isDropByName || isDropByEnergy;

    // Group active tracks by frequency bucket
    const bucketTracks = new Map<string, string[]>();

    for (let trackIdx = 0; trackIdx < trackClipData.length; trackIdx++) {
      const track = trackClipData[trackIdx]!;
      const bucket = trackBuckets[trackIdx];

      // Exclude tracks with no bucket or "full" bucket
      if (!bucket || bucket === "full") {
        continue;
      }

      // Check if this track is active in the section (has clips overlapping)
      const isActive = track.clips.some(
        (clip) => clip.startTime < section.endTime && clip.endTime > section.startTime,
      );

      if (!isActive) {
        continue;
      }

      const existing = bucketTracks.get(bucket);
      if (existing) {
        existing.push(track.trackName);
      } else {
        bucketTracks.set(bucket, [track.trackName]);
      }
    }

    // Add audio tracks to the frequency bucket counts based on spectral energy
    if (audioContentAnalysis != null) {
      const sectionData = audioContentAnalysis.perSection.get(section.id);
      if (sectionData) {
        for (const [trackName, trackResult] of sectionData) {
          // Skip audio tracks with negligible energy (at or below -60 dBFS)
          if (trackResult.rmsDbfs <= -60) {
            continue;
          }

          // Determine which frequency bands this audio track occupies
          // A band is "occupied" if its energy is above -40 dBFS
          const AUDIO_OCCUPIED_THRESHOLD = -40;
          const bands = trackResult.spectralProfile.bands;

          for (const bandName of Object.keys(bands) as FrequencyBandName[]) {
            const bandEnergy = bands[bandName];
            if (bandEnergy > AUDIO_OCCUPIED_THRESHOLD) {
              const bucket = mapFrequencyBandToBucket(bandName);
              const existing = bucketTracks.get(bucket);
              if (existing) {
                // Only add the track name once per bucket
                if (!existing.includes(trackName)) {
                  existing.push(trackName);
                }
              } else {
                bucketTracks.set(bucket, [trackName]);
              }
            }
          }
        }
      }
    }

    // Check each bucket for crowding
    for (const [bucket, trackNames] of bucketTracks) {
      const count = trackNames.length;

      // Determine thresholds based on drop status
      const infoThreshold = isDrop ? 5 : 4;
      const warningThreshold = isDrop ? 6 : 5;

      let severity: IssueSeverity | null = null;
      if (count >= warningThreshold) {
        severity = "warning";
      } else if (count >= infoThreshold) {
        severity = "info";
      }

      if (severity === null) {
        continue;
      }

      const id = `frequency-crowding-${section.id}-${bucket}`;
      const trackList = trackNames.join(", ");
      let message = `${section.name}: ${count} tracks in the ${bucket} range (${trackList}). Consider EQ separation or thinning the arrangement.`;

      // Truncate to 200 chars max
      if (message.length > 200) {
        message = message.slice(0, 197) + "...";
      }

      issues.push({
        id,
        type: "frequency-crowding",
        severity,
        sectionIds: [section.id],
        message,
      });
    }
  }

  return issues;
}

/**
 * Map audio frequency band names to the corresponding frequency bucket used
 * by the issue detector's crowding logic.
 */
function mapFrequencyBandToBucket(bandName: FrequencyBandName): FrequencyBucket {
  switch (bandName) {
    case "subBass": return "sub";
    case "bass": return "bass";
    case "lowMid": return "low-mid";
    case "mid": return "mid";
    case "highMid": return "high-mid";
    case "high": return "high";
  }
}

// ─── DJ Compatibility Detection ─────────────────────────────────────────

/** Genres considered DJ-oriented for compatibility checks. */
const DJ_ORIENTED_GENRES: readonly string[] = ["techno", "house", "trance", "drum-and-bass"];

/**
 * Detect DJ compatibility issues with intro and outro sections.
 *
 * Checks intro/outro length against genre minimums, intro energy level,
 * and energy mismatch between first and last sections. Skips all checks
 * for non-DJ genres (Pop, Ambient) or when no genre is selected (null).
 *
 * @param sections - Ordered array of arrangement sections
 * @param energyCurve - Energy score per section (aligned by index)
 * @param thresholds - Genre-specific threshold profile
 * @param selectedGenre - Currently selected genre or null
 * @returns Array of DJ compatibility issues
 */
function detectDJCompatibility(
  sections: readonly Section[],
  energyCurve: readonly number[],
  thresholds: GenreThresholdProfile,
  selectedGenre: string | null,
): Issue[] {
  // Skip all checks for non-DJ genres or null genre
  if (selectedGenre === null || !DJ_ORIENTED_GENRES.includes(selectedGenre)) {
    return [];
  }

  if (sections.length === 0) {
    return [];
  }

  const issues: Issue[] = [];

  const firstSection = sections[0]!;
  const lastSection = sections[sections.length - 1]!;

  // Compute section length in bars (4 beats per bar)
  const firstSectionBars = (firstSection.endTime - firstSection.startTime) / 4;
  const lastSectionBars = (lastSection.endTime - lastSection.startTime) / 4;

  // 1. Intro length check
  if (firstSectionBars < thresholds.introMinBars) {
    let message = `Intro (${firstSectionBars} bars) is shorter than the recommended ${thresholds.introMinBars} bars for ${selectedGenre}. DJs may struggle to mix in.`;
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }
    issues.push({
      id: `intro-length-${firstSection.id}`,
      type: "intro-length",
      severity: "warning",
      sectionIds: [firstSection.id],
      message,
    });
  }

  // 2. Outro length check
  if (lastSectionBars < thresholds.outroMinBars) {
    let message = `Outro (${lastSectionBars} bars) is shorter than the recommended ${thresholds.outroMinBars} bars for ${selectedGenre}. DJs may struggle to mix out.`;
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }
    issues.push({
      id: `outro-length-${lastSection.id}`,
      type: "outro-length",
      severity: "warning",
      sectionIds: [lastSection.id],
      message,
    });
  }

  // 3. Intro energy check
  const firstEnergy = energyCurve[0];
  if (firstEnergy !== undefined && firstEnergy > 4) {
    let message = `Intro energy (${firstEnergy}) is high for smooth mix-in. Consider a more gradual energy build.`;
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }
    issues.push({
      id: `intro-energy-${firstSection.id}`,
      type: "intro-energy",
      severity: "warning",
      sectionIds: [firstSection.id],
      message,
    });
  }

  // 4. Energy mismatch check (requires >= 2 sections)
  if (sections.length >= 2) {
    const lastEnergy = energyCurve[energyCurve.length - 1];
    if (
      firstEnergy !== undefined &&
      lastEnergy !== undefined &&
      lastEnergy > firstEnergy + 2
    ) {
      let message = `Outro energy (${lastEnergy}) is notably higher than intro (${firstEnergy}). This may make DJ transitions difficult.`;
      if (message.length > 200) {
        message = message.slice(0, 197) + "...";
      }
      issues.push({
        id: `energy-mismatch-${firstSection.id}-${lastSection.id}`,
        type: "energy-mismatch",
        severity: "info",
        sectionIds: [firstSection.id, lastSection.id],
        message,
      });
    }
  }

  return issues;
}

// ─── Non-Standard Rhythm Detection ──────────────────────────────────────

/** Rule types that indicate non-standard rhythmic patterns. */
export const NON_STANDARD_RHYTHM_RULES = [
  "non-standard-phrase-lengths-expected",
  "nonstandard-phrase-length-allowed",
  "syncopated-808-pattern-required",
  "breakbeat-pattern-required",
  "triplet-hihat-expected",
  "half-time-feel-expected",
] as const;

/**
 * Determines whether a genre uses non-standard rhythmic patterns
 * (e.g., Electro, IDM, Footwork). When true, triggers phrase-alignment
 * suppression and threshold adjustments.
 */
export function isNonStandardRhythmGenre(profile: GenreProfile | null): boolean {
  if (!profile) return false;
  return profile.detectionRules.some(
    rule => NON_STANDARD_RHYTHM_RULES.includes(rule.type as any) && rule.value === true
  );
}

// ─── Effective Thresholds ───────────────────────────────────────────────

/**
 * Effective thresholds after rhythm adjustments are applied.
 * Used by downstream sub-detectors for genre-aware issue detection.
 */
export interface EffectiveThresholds {
  readonly flatEnergyDelta: number;
  readonly missingTransitionDelta: number;
  readonly similarityCeilingPercent: number;
  readonly introMinBars: number;
  readonly outroMinBars: number;
}

/**
 * Check whether a genre profile's detectionRules contain a rule with the
 * given type and value === true.
 */
function hasRule(profile: GenreProfile, ruleType: string): boolean {
  return profile.detectionRules.some(
    (rule) => rule.type === ruleType && rule.value === true,
  );
}

/**
 * Apply rhythm-based threshold adjustments for non-standard rhythm genres.
 *
 * - When `triplet-hihat-expected` rule is present, increases `similarityCeilingPercent`
 *   by 10 (capped at 100) because triplet patterns naturally produce higher apparent
 *   section similarity.
 * - When `half-time-feel-expected` rule is present, doubles effective bar counts for
 *   intro/outro length checks because one perceived phrase spans two notated bars.
 *
 * @param base - The resolved GenreThresholdProfile for the genre
 * @param profile - The full GenreProfile (or null if no genre selected)
 * @param nonStandardRhythm - Whether the genre is a non-standard rhythm genre
 * @returns EffectiveThresholds used by downstream sub-detectors
 */
export function applyRhythmAdjustments(
  base: GenreThresholdProfile,
  profile: GenreProfile | null,
  nonStandardRhythm: boolean,
): EffectiveThresholds {
  // Convert repetitionSimilarity ratio (0–1) back to percentage (0–100)
  let similarityCeiling = base.repetitionSimilarity * 100;
  let introMinBars = base.introMinBars;
  let outroMinBars = base.outroMinBars;

  if (nonStandardRhythm && profile) {
    // Triplet genres get +10 on similarity ceiling
    if (hasRule(profile, "triplet-hihat-expected")) {
      similarityCeiling = Math.min(100, similarityCeiling + 10);
    }

    // Half-time feel doubles bar count expectations
    if (hasRule(profile, "half-time-feel-expected")) {
      introMinBars *= 2;
      outroMinBars *= 2;
    }
  }

  return {
    flatEnergyDelta: base.flatEnergyDelta,
    missingTransitionDelta: base.abruptChangeDelta - 2, // reverse the +2 applied in buildThresholdProfile
    similarityCeilingPercent: similarityCeiling,
    introMinBars,
    outroMinBars,
  };
}

// ─── Synth Repetition Detection ─────────────────────────────────────────

/**
 * Build a track name → InstrumentRole map from the available track note data.
 * Uses the same classifyInstrumentRole logic as the content analyzer.
 */
function buildTrackRoleMap(trackNoteData: readonly TrackNoteData[]): ReadonlyMap<string, InstrumentRole> {
  const roleMap = new Map<string, InstrumentRole>();
  for (const track of trackNoteData) {
    const role = classifyInstrumentRole(track.notes, track.trackName);
    roleMap.set(track.trackName, role);
  }
  return roleMap;
}

/** Roles eligible for synth repetition detection. */
const SYNTH_REPETITION_ROLES: readonly InstrumentRole[] = ["lead", "pad", "arpeggio"];

/**
 * Detect synth tracks with extended repetition (3+ consecutive similar sections).
 *
 * Checks the `repetitionFlags` in the `SynthAnalysisResult` for tracks with role
 * lead, pad, or arpeggio. When `hasExtendedRepetition` is true, generates a
 * warning-severity issue identifying the track and the affected section names.
 *
 * @param synthAnalysis - Complete synth analysis result
 * @param sections - Ordered array of arrangement sections
 * @param thresholds - Effective thresholds (contains repetitionSimilarity)
 * @param trackRoles - Map of track name to instrument role
 * @returns Array of synth repetition issues
 */
export function detectSynthRepetition(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
  trackRoles: ReadonlyMap<string, InstrumentRole>,
  thresholds: EffectiveThresholds,
): Issue[] {
  const issues: Issue[] = [];

  for (const [trackName, flags] of synthAnalysis.repetitionFlags) {
    // Only apply to lead/pad/arpeggio roles
    const role = trackRoles.get(trackName);
    if (!role || !SYNTH_REPETITION_ROLES.includes(role)) {
      continue;
    }

    if (!flags.hasExtendedRepetition) {
      continue;
    }

    // Resolve affected section names from indices
    const affectedSectionIndices = flags.extendedRepetitionSections;
    const affectedSections = affectedSectionIndices
      .filter((idx) => idx >= 0 && idx < sections.length)
      .map((idx) => sections[idx]!);

    if (affectedSections.length === 0) {
      continue;
    }

    const sectionNames = affectedSections.map((s) => s.name).join(", ");
    const sectionIds = affectedSections.map((s) => s.id);

    const id = `synth-repetition-${trackName}-${sectionIds[0]}`;
    let message = `Synth track "${trackName}" repeats across ${affectedSections.length} sections (${sectionNames}). Consider introducing variation.`;

    // Truncate to 200 chars max
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }

    issues.push({
      id,
      type: "repetition",
      severity: "warning",
      sectionIds,
      message,
    });
  }

  return issues;
}

// ─── Low Synth Density Detection ────────────────────────────────────────

/** Roles counted toward synth density. */
const SYNTH_DENSITY_ROLES: readonly InstrumentRole[] = ["lead", "pad", "arpeggio", "chord"];

/** Section name patterns indicating intro/outro (case-insensitive). */
const INTRO_OUTRO_PATTERNS = ["intro", "outro"] as const;

/**
 * Detect sections where synth track note density is below the genre threshold.
 *
 * Checks non-intro/non-outro sections where the summed note density across all
 * synth tracks (lead, pad, arpeggio, chord) falls below the density threshold
 * (default 2.0 notes per beat). Generates an info-severity issue.
 *
 * @param synthAnalysis - Complete synth analysis result
 * @param sections - Ordered array of arrangement sections
 * @param thresholds - Effective thresholds (for genre-specific density threshold)
 * @param trackRoles - Map of track name to instrument role
 * @param densityThreshold - Minimum acceptable summed note density (default 2.0)
 * @returns Array of low synth density issues
 */
export function detectLowSynthDensity(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
  trackRoles: ReadonlyMap<string, InstrumentRole>,
  densityThreshold: number = 2.0,
): Issue[] {
  const issues: Issue[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;

    // Skip intro/outro sections
    const nameLower = section.name.toLowerCase();
    const isIntroOutro = INTRO_OUTRO_PATTERNS.some((p) => nameLower.includes(p));
    if (isIntroOutro) {
      continue;
    }

    // Get per-track profiles for this section
    const sectionProfiles = synthAnalysis.perSection.get(section.id);
    if (!sectionProfiles || sectionProfiles.size === 0) {
      continue;
    }

    // Sum note density for synth-density-relevant tracks
    let totalDensity = 0;
    let hasSynthTracks = false;

    for (const [trackName, profile] of sectionProfiles) {
      const role = trackRoles.get(trackName);
      if (!role || !SYNTH_DENSITY_ROLES.includes(role)) {
        continue;
      }
      hasSynthTracks = true;
      totalDensity += profile.noteDensity;
    }

    // Only flag if there are synth tracks present but density is low
    if (!hasSynthTracks) {
      continue;
    }

    if (totalDensity < densityThreshold) {
      const id = `low-synth-density-${section.id}`;
      let message = `Section "${section.name}" has low synth activity (${totalDensity.toFixed(1)} notes/beat). Consider increasing melodic or harmonic activity.`;

      // Truncate to 200 chars max
      if (message.length > 200) {
        message = message.slice(0, 197) + "...";
      }

      issues.push({
        id,
        type: "info",
        severity: "info",
        sectionIds: [section.id],
        message,
      });
    }
  }

  return issues;
}

// ─── Harmonic Shift Without Transition Detection ────────────────────────

/**
 * Detect harmonic-shift discontinuities without a preceding transition element.
 *
 * For each harmonic-shift discontinuity in the synth analysis, checks whether
 * any transition element exists in the last half of the preceding section.
 * Transition elements include: clips on transition-keyword tracks, clips with
 * automation envelopes, or clips on return tracks.
 *
 * @param synthAnalysis - Complete synth analysis result
 * @param sections - Ordered array of arrangement sections
 * @param trackClipData - All track clip data for transition detection
 * @param trackInventory - Track inventory for return track identification
 * @returns Array of harmonic-shift-without-transition issues
 */
export function detectHarmonicShiftWithoutTransition(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
  trackClipData: readonly TrackClipData[],
  trackInventory: readonly TrackInfo[],
): Issue[] {
  const issues: Issue[] = [];

  // Build a set of return track names for quick lookup.
  const returnTrackNames = new Set<string>();
  for (const track of trackInventory) {
    if ((track.type as string) === "return") {
      returnTrackNames.add(track.name);
    }
  }

  // Process only harmonic-shift discontinuities
  for (const discontinuity of synthAnalysis.discontinuities) {
    if (discontinuity.type !== "harmonic-shift") {
      continue;
    }

    const { sectionIndexA, sectionIndexB } = discontinuity;

    // Validate section indices
    if (sectionIndexA < 0 || sectionIndexA >= sections.length) {
      continue;
    }
    if (sectionIndexB < 0 || sectionIndexB >= sections.length) {
      continue;
    }

    const precedingSection = sections[sectionIndexA]!;
    const followingSection = sections[sectionIndexB]!;

    // Check the last half of the preceding section for transition elements
    const sectionLength = precedingSection.endTime - precedingSection.startTime;
    const windowStart = precedingSection.startTime + sectionLength / 2;
    const windowEnd = precedingSection.endTime;

    const hasTransition = hasTransitionElement(
      windowStart,
      windowEnd,
      trackClipData,
      returnTrackNames,
    );

    if (hasTransition) {
      continue; // Transition element present — no issue
    }

    const id = `harmonic-shift-no-transition-${precedingSection.id}-${followingSection.id}`;
    let message = `Harmonic shift on "${discontinuity.trackName}" between ${precedingSection.name} and ${followingSection.name} without a transition. Add a riser, filter sweep, or fill.`;

    // Truncate to 200 chars max
    if (message.length > 200) {
      message = message.slice(0, 197) + "...";
    }

    issues.push({
      id,
      type: "missing-transition",
      severity: "warning",
      sectionIds: [precedingSection.id, followingSection.id],
      message,
    });
  }

  return issues;
}

// ─── Duplicated Roles Detection ─────────────────────────────────────────

/** Roles that count toward role duplication detection. */
const DUPLICATED_ROLE_SET: readonly InstrumentRole[] = ["lead", "pad", "arpeggio", "chord"];

/**
 * Detect sections with 3 or more tracks sharing the same synth InstrumentRole.
 *
 * For each section, counts how many active synth tracks share each role from
 * {lead, pad, arpeggio, chord}. When 3 or more tracks share a role, generates
 * an info-severity issue suggesting role diversification.
 *
 * @param synthAnalysis - Complete synth analysis result
 * @param sections - Ordered array of arrangement sections
 * @param trackRoles - Map of track name to instrument role
 * @returns Array of duplicated role issues
 */
export function detectDuplicatedRoles(
  synthAnalysis: SynthAnalysisResult,
  sections: readonly Section[],
  trackRoles: ReadonlyMap<string, InstrumentRole>,
): Issue[] {
  const issues: Issue[] = [];

  for (const section of sections) {
    // Get per-track profiles for this section
    const sectionProfiles = synthAnalysis.perSection.get(section.id);
    if (!sectionProfiles || sectionProfiles.size === 0) {
      continue;
    }

    // Count tracks per role (only roles in the eligible set)
    const roleCounts = new Map<InstrumentRole, string[]>();

    for (const [trackName] of sectionProfiles) {
      const role = trackRoles.get(trackName);
      if (!role || !DUPLICATED_ROLE_SET.includes(role)) {
        continue;
      }

      const existing = roleCounts.get(role);
      if (existing) {
        existing.push(trackName);
      } else {
        roleCounts.set(role, [trackName]);
      }
    }

    // Check for 3+ tracks sharing a role
    for (const [role, trackNames] of roleCounts) {
      if (trackNames.length >= 3) {
        const id = `duplicated-role-${section.id}-${role}`;
        const trackList = trackNames.join(", ");
        let message = `Section "${section.name}" has ${trackNames.length} tracks as "${role}" (${trackList}). Consider diversifying roles or frequency separation.`;

        // Truncate to 200 chars max
        if (message.length > 200) {
          message = message.slice(0, 197) + "...";
        }

        issues.push({
          id,
          type: "info",
          severity: "info",
          sectionIds: [section.id],
          message,
        });
      }
    }
  }

  return issues;
}

// ─── Public Entry Point ─────────────────────────────────────────────────

/**
 * Main issue detection entry point.
 *
 * Orchestrates all sub-detectors against the provided arrangement state,
 * collecting and concatenating their results. Each sub-detector is wrapped
 * in a try-catch so that a failure in one detector does not prevent others
 * from running.
 *
 * All issue messages are guaranteed to be at most 200 characters (sub-detectors
 * already enforce this, but a safety truncation pass is applied here as well).
 *
 * @param input - Complete arrangement state required for issue detection
 * @returns Array of all detected issues across all sub-detectors
 */
export function detectIssues(input: IssueDetectorInput): Issue[] {
  const {
    sections,
    sectionAnalysis,
    energyCurve,
    trackInventory,
    trackClipData,
    trackNoteData,
    trackBuckets,
    selectedGenre,
    audioContentAnalysis,
  } = input;

  // Resolve genre profile and thresholds
  const profile = selectedGenre !== null ? (getProfile(selectedGenre) ?? getProfileBySubgenre(selectedGenre)) : null;
  const thresholds = getThresholdsForGenre(selectedGenre);
  const specialMode = isSpecialParserMode(profile);
  const nonStandardRhythm = isNonStandardRhythmGenre(profile);

  // Compute effective thresholds with rhythm adjustments
  const effectiveThresholds = applyRhythmAdjustments(thresholds, profile, nonStandardRhythm);

  // Build a threshold profile that incorporates effective adjustments for sub-detectors
  const effectiveGenreThresholds: GenreThresholdProfile = {
    ...thresholds,
    repetitionSimilarity: effectiveThresholds.similarityCeilingPercent / 100,
    introMinBars: effectiveThresholds.introMinBars,
    outroMinBars: effectiveThresholds.outroMinBars,
  };

  const allIssues: Issue[] = [];

  // 1. Flat Energy Detection — suppressed in special parser mode
  if (!specialMode) {
    try {
      const issues = detectFlatEnergy(sections, energyCurve, thresholds.flatEnergyDelta);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — omit its issues, continue with others
    }
  }

  // 2. Missing Transition Detection — suppress phrase-alignment triggers for non-standard rhythm
  try {
    const issues = detectMissingTransitions(sections, energyCurve, trackClipData, trackInventory, {
      suppressPhraseAlignment: nonStandardRhythm,
    });
    allIssues.push(...issues);
  } catch {
    // Sub-detector failed — omit its issues, continue with others
  }

  // 3. Repetition Detection — suppressed in special parser mode; threshold relaxed for triplet genres
  if (!specialMode) {
    try {
      const issues = detectRepetition(sections, sectionAnalysis, trackClipData, trackNoteData, effectiveGenreThresholds, selectedGenre);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — omit its issues, continue with others
    }
  }

  // 4. Abrupt Change Detection — suppressed in special parser mode
  if (!specialMode) {
    try {
      const issues = detectAbruptChanges(sections, energyCurve, trackClipData, trackNoteData, selectedGenre, thresholds.abruptChangeDelta);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — omit its issues, continue with others
    }
  }

  // 5. Frequency Crowding Detection — always runs (frequency balance always relevant)
  try {
    const issues = detectFrequencyCrowding(sections, trackClipData, trackBuckets, energyCurve, audioContentAnalysis);
    allIssues.push(...issues);
  } catch {
    // Sub-detector failed — omit its issues, continue with others
  }

  // 6. DJ Compatibility Detection (intro/outro length) — suppressed in special parser mode;
  //    uses effective thresholds (bar doubling for half-time feel genres)
  if (!specialMode) {
    try {
      const issues = detectDJCompatibility(sections, energyCurve, effectiveGenreThresholds, selectedGenre);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — omit its issues, continue with others
    }
  }

  // 7. Non-standard rhythm advisory — emit when no-four-on-the-floor critical rule present
  if (nonStandardRhythm && profile) {
    const noFourOnFloorRule = profile.detectionRules.find(
      (rule) => rule.type === "no-four-on-the-floor" && rule.severity === "critical",
    );
    if (noFourOnFloorRule) {
      const sectionIds = sections.map((s) => s.id);
      allIssues.push({
        id: `rhythm-advisory-${profile.id}`,
        type: "info",
        severity: "info",
        sectionIds,
        message: "This genre uses syncopated/broken-beat patterns \u2014 avoid straight 4/4 kick",
      });
    }
  }

  // 8. Synth Issue Detection — runs when synthAnalysis data is available
  if (input.synthAnalysis) {
    const synthAnalysis = input.synthAnalysis;

    // Build track role map from trackNoteData
    const trackRoles = buildTrackRoleMap(trackNoteData);

    // Determine density threshold from genre profile or use default
    const densityThreshold = 2.0;

    // 8a. Synth repetition detection
    try {
      const issues = detectSynthRepetition(synthAnalysis, sections, trackRoles, effectiveThresholds);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — continue with others
    }

    // 8b. Low synth density detection
    try {
      const issues = detectLowSynthDensity(synthAnalysis, sections, trackRoles, densityThreshold);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — continue with others
    }

    // 8c. Harmonic-shift without transition detection
    try {
      const issues = detectHarmonicShiftWithoutTransition(synthAnalysis, sections, trackClipData, trackInventory);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — continue with others
    }

    // 8d. Duplicated roles detection
    try {
      const issues = detectDuplicatedRoles(synthAnalysis, sections, trackRoles);
      allIssues.push(...issues);
    } catch {
      // Sub-detector failed — continue with others
    }
  }

  // ─── Render messages using the suggestion renderer for varied language ───
  // Replace hardcoded template messages with genre-aware, varied phrasing.
  // Each issue is mapped to a RawSuggestion and passed through renderSuggestion.
  for (let i = 0; i < allIssues.length; i++) {
    const issue = allIssues[i]!;

    // Skip the rhythm advisory info issue — it's a static notice, not a suggestion
    if (issue.type === "info") {
      continue;
    }

    // Resolve the primary section for this issue
    const primarySectionId = issue.sectionIds[0];
    const primarySection = primarySectionId
      ? sections.find((s) => s.id === primarySectionId)
      : undefined;

    // Build bar range from the primary section
    const barStart = primarySection
      ? Math.round((primarySection.startTime / 4) + 1)
      : 1;
    const barEnd = primarySection
      ? Math.round(primarySection.endTime / 4)
      : 1;

    const rawSuggestion: RawSuggestion = {
      issueType: issue.type,
      sectionName: primarySection?.name ?? "",
      barRange: { start: barStart, end: barEnd },
      severity: issue.severity,
    };

    const rendered = renderSuggestion(rawSuggestion, profile, i);
    allIssues[i] = { ...issue, message: rendered };
  }

  // Safety pass: truncate any messages exceeding 200 characters
  for (let i = 0; i < allIssues.length; i++) {
    const issue = allIssues[i]!;
    if (issue.message.length > 200) {
      allIssues[i] = {
        ...issue,
        message: issue.message.slice(0, 197) + "...",
      };
    }
  }

  return allIssues;
}

// ─── Testing Exports (prefixed with _ to indicate internal) ─────────────

export {
  computeStructuralSimilarity as _computeStructuralSimilarity,
  computeJaccardIndex as _computeJaccardIndex,
  computeMidiDensityRatio as _computeMidiDensityRatio,
  computeAutomationMatch as _computeAutomationMatch,
  detectFlatEnergy as _detectFlatEnergy,
  detectMissingTransitions as _detectMissingTransitions,
  hasTransitionElement as _hasTransitionElement,
  detectRepetition as _detectRepetition,
  detectAbruptChanges as _detectAbruptChanges,
  hasBuildupContext as _hasBuildupContext,
  detectFrequencyCrowding as _detectFrequencyCrowding,
  detectDJCompatibility as _detectDJCompatibility,
  hasRule as _hasRule,
  detectSynthRepetition as _detectSynthRepetition,
  detectLowSynthDensity as _detectLowSynthDensity,
  detectHarmonicShiftWithoutTransition as _detectHarmonicShiftWithoutTransition,
  detectDuplicatedRoles as _detectDuplicatedRoles,
  buildTrackRoleMap as _buildTrackRoleMap,
};
