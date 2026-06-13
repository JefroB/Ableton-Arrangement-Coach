/**
 * Content Analyzer — MIDI content analysis for pattern fingerprinting,
 * similarity scoring, fill/build detection, and instrument role classification.
 *
 * Pure function module. Accepts plain data, returns plain data.
 * No SDK calls, no side effects.
 */

import type { NoteData } from "../ableton/sdk-adapter.js";
import type {
  ActivePercussionSnapshot,
  BuildDetection,
  ContentAnalysisResult,
  CrossSectionComparison,
  DrumElementCategory,
  DrumElementProfile,
  DrumPadMap,
  FillDetection,
  InstrumentRole,
  PatternFingerprint,
  PercussionDiscontinuity,
  PercussionPatternResult,
  TrackContentAnalysis,
  TrackRepetitionSummary,
} from "./content-analysis-types.js";
import type { Section } from "./section-scanner.js";
import type { TrackNoteData } from "./section-analyzer.js";
import {
  computeActivePercussionElements,
  detectPercussionDiscontinuities,
} from "./drum-pad-extractor.js";

// ─── Pattern Fingerprinting ───────────────────────────────────────────

/**
 * Compute a pattern fingerprint for notes within a section.
 *
 * The fingerprint captures four orthogonal dimensions:
 * 1. Pitch classes — note.pitch % 12 (harmonic content, octave-independent)
 * 2. Rhythmic positions — quantized to 16th notes within a bar (0-15)
 * 3. Velocity contour — average velocity per bar, normalized to [0, 1]
 * 4. Density — notes per beat
 *
 * Returns a neutral fingerprint for empty NoteData (no notes in range).
 */
export function computePatternFingerprint(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): PatternFingerprint {
  const sectionLength = sectionEnd - sectionStart;

  // Guard: empty section or no notes → neutral fingerprint
  if (sectionLength <= 0) {
    return {
      pitchClasses: new Set<number>(),
      rhythmicPositions: [],
      velocityContour: [],
      density: 0,
      barCount: 0,
    };
  }

  // Filter notes that fall within the section range
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  const barCount = Math.ceil(sectionLength / 4); // 4 beats per bar

  // Empty NoteData → neutral fingerprint
  if (sectionNotes.length === 0) {
    return {
      pitchClasses: new Set<number>(),
      rhythmicPositions: [],
      velocityContour: new Array(barCount).fill(0),
      density: 0,
      barCount,
    };
  }

  // 1. Pitch classes: note.pitch % 12
  const pitchClasses = new Set<number>();
  for (const note of sectionNotes) {
    pitchClasses.add(note.pitch % 12);
  }

  // 2. Rhythmic positions: quantized to 16th notes (0-15)
  const rhythmicPositionSet = new Set<number>();
  for (const note of sectionNotes) {
    const posInBar = ((note.startTime - sectionStart) % 4) * 4;
    const quantized = Math.round(posInBar) % 16;
    rhythmicPositionSet.add(quantized);
  }
  const rhythmicPositions = Array.from(rhythmicPositionSet).sort((a, b) => a - b);

  // 3. Velocity contour: average velocity per bar, normalized by 127
  const velocityContour: number[] = new Array(barCount).fill(0);
  const notesPerBar: number[] = new Array(barCount).fill(0);

  for (const note of sectionNotes) {
    const barIndex = Math.floor((note.startTime - sectionStart) / 4);
    // Clamp to valid bar range (note at exact sectionEnd edge case)
    const clampedBarIndex = Math.min(barIndex, barCount - 1);
    velocityContour[clampedBarIndex] += note.velocity;
    notesPerBar[clampedBarIndex]++;
  }

  for (let i = 0; i < barCount; i++) {
    if (notesPerBar[i] > 0) {
      velocityContour[i] = velocityContour[i] / notesPerBar[i] / 127;
    }
    // Bars with no notes remain 0
  }

  // 4. Density: total notes / section length in beats
  const density = sectionNotes.length / sectionLength;

  return {
    pitchClasses,
    rhythmicPositions,
    velocityContour,
    density,
    barCount,
  };
}

// ─── Similarity Scoring ───────────────────────────────────────────────

/**
 * Compute Jaccard index of two sets: |intersection| / |union|.
 * Returns 0 if the union is empty (both sets empty).
 */
function jaccardIndex(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/**
 * Compute Jaccard index for two arrays treated as sets of numbers.
 * Returns 0 if the union is empty.
 */
function arrayJaccard(a: readonly number[], b: readonly number[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  return jaccardIndex(setA, setB);
}

/**
 * Compute cosine similarity of two numeric arrays, normalized to [0, 1].
 *
 * cosine_similarity = (A · B) / (|A| × |B|)
 *
 * The raw cosine similarity is in [-1, 1]; we map it to [0, 1] via (x + 1) / 2.
 * Returns 0 for empty arrays or zero-magnitude vectors.
 */
function velocityContourSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  // Handle mismatched lengths: use the shorter length
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitudeProduct = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitudeProduct === 0) return 0;

  const cosineSim = dotProduct / magnitudeProduct;
  // Normalize from [-1, 1] to [0, 1]
  return (cosineSim + 1) / 2;
}

/**
 * Compare two fingerprints and return a similarity score in [0, 1].
 *
 * Weighted combination:
 *   0.35 × pitchClassJaccard
 * + 0.30 × rhythmicOverlap
 * + 0.20 × velocityContourCorrelation
 * + 0.15 × densityRatio
 *
 * All individual components are in [0, 1], so the weighted sum is
 * guaranteed to be in [0, 1].
 *
 * Guards against division by zero:
 * - Empty union (both sets empty) → Jaccard = 0
 * - Zero max density → densityRatio = 0
 */
export function computeSimilarityScore(
  a: PatternFingerprint,
  b: PatternFingerprint,
): number {
  // 1. Pitch class Jaccard
  const pitchClassJaccard = jaccardIndex(a.pitchClasses, b.pitchClasses);

  // 2. Rhythmic overlap (Jaccard of rhythmic position sets)
  const rhythmicOverlap = arrayJaccard(a.rhythmicPositions, b.rhythmicPositions);

  // 3. Velocity contour correlation (cosine similarity normalized to [0, 1])
  const velocityCorrelation = velocityContourSimilarity(
    a.velocityContour,
    b.velocityContour,
  );

  // 4. Density ratio: min / max (0 if max is 0)
  const maxDensity = Math.max(a.density, b.density);
  const densityRatio =
    maxDensity === 0 ? 0 : Math.min(a.density, b.density) / maxDensity;

  // Weighted combination
  return (
    0.35 * pitchClassJaccard +
    0.30 * rhythmicOverlap +
    0.20 * velocityCorrelation +
    0.15 * densityRatio
  );
}

// ─── Phrase Length Detection ──────────────────────────────────────────

/**
 * Detect the dominant phrase length within a section (4, 8, or 16 bars).
 *
 * Tests 4-bar, 8-bar, and 16-bar candidates in order. For each candidate:
 * 1. Extract the first N bars of notes as the "template"
 * 2. Compute fingerprint of each subsequent N-bar segment
 * 3. Compare each segment fingerprint to the template
 * 4. If average similarity across all segments ≥ 0.7, this candidate is valid
 *
 * Returns the shortest valid candidate. If none scores ≥ 0.7, default to 4 bars.
 */
export function detectPhraseLength(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
): number {
  const sectionLengthBeats = sectionEnd - sectionStart;
  const candidates = [4, 8, 16]; // bar lengths to test, shortest first

  for (const candidateBars of candidates) {
    const candidateLengthBeats = candidateBars * 4; // 4 beats per bar

    // Need at least 2 segments to compare (template + at least one more)
    if (sectionLengthBeats < candidateLengthBeats * 2) {
      continue;
    }

    // Compute template fingerprint from first N bars
    const templateStart = sectionStart;
    const templateEnd = sectionStart + candidateLengthBeats;
    const templateFingerprint = computePatternFingerprint(notes, templateStart, templateEnd);

    // Compare subsequent segments to the template
    const similarities: number[] = [];
    let segmentStart = templateEnd;

    while (segmentStart + candidateLengthBeats <= sectionEnd) {
      const segmentEnd = segmentStart + candidateLengthBeats;
      const segmentFingerprint = computePatternFingerprint(notes, segmentStart, segmentEnd);
      const similarity = computeSimilarityScore(templateFingerprint, segmentFingerprint);
      similarities.push(similarity);
      segmentStart = segmentEnd;
    }

    // If there are segments to compare, check average similarity
    if (similarities.length > 0) {
      const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
      if (avgSimilarity >= 0.7) {
        return candidateBars;
      }
    }
  }

  // Default to 4 if no candidate qualifies
  return 4;
}

// ─── Instrument Role Classification ───────────────────────────────────

/** Track name keywords mapped to instrument roles (case-insensitive matching). */
const DRUM_KEYWORDS = ["drum", "kick", "hat", "snare", "perc"];
const BASS_KEYWORDS = ["bass"];
const LEAD_KEYWORDS = ["lead", "melody"];
const PAD_KEYWORDS = ["pad"];
const ARP_KEYWORDS = ["arp"];

/**
 * Check if a track name contains any keyword from a list (case-insensitive).
 */
function trackNameContainsKeyword(trackName: string, keywords: readonly string[]): boolean {
  const lower = trackName.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Infer instrument role from track name keywords alone.
 * Returns null if no keyword match found.
 */
function roleFromTrackName(trackName: string): InstrumentRole | null {
  if (trackNameContainsKeyword(trackName, DRUM_KEYWORDS)) return "drums";
  if (trackNameContainsKeyword(trackName, BASS_KEYWORDS)) return "bass";
  if (trackNameContainsKeyword(trackName, LEAD_KEYWORDS)) return "lead";
  if (trackNameContainsKeyword(trackName, PAD_KEYWORDS)) return "pad";
  if (trackNameContainsKeyword(trackName, ARP_KEYWORDS)) return "arpeggio";
  return null;
}

/**
 * Compute the average number of simultaneously-sounding notes (polyphony).
 *
 * For each note, count how many other notes overlap in time.
 * Average polyphony = average count of notes overlapping at each note's onset.
 */
function computeAvgPolyphony(notes: readonly NoteData[]): number {
  if (notes.length === 0) return 0;

  let totalPolyphony = 0;
  for (const note of notes) {
    let simultaneous = 0;
    for (const other of notes) {
      // other overlaps note's onset if other starts before note ends and other ends after note starts
      if (other.startTime < note.startTime + note.duration &&
          other.startTime + other.duration > note.startTime) {
        simultaneous++;
      }
    }
    totalPolyphony += simultaneous;
  }
  // Each note counts itself, so polyphony of 1 = monophonic
  return totalPolyphony / notes.length;
}

/**
 * Compute rhythmic regularity: how consistent the inter-onset intervals (IOIs) are.
 *
 * Returns a value in [0, 1] where 1 = perfectly regular (all IOIs identical).
 * Uses coefficient of variation: regularity = 1 - (stddev / mean) clamped to [0, 1].
 */
function computeRhythmicRegularity(notes: readonly NoteData[]): number {
  if (notes.length < 2) return 0;

  // Sort by start time
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  const iois: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const ioi = sorted[i].startTime - sorted[i - 1].startTime;
    if (ioi > 0) iois.push(ioi);
  }

  if (iois.length === 0) return 0;

  const mean = iois.reduce((sum, v) => sum + v, 0) / iois.length;
  if (mean === 0) return 0;

  const variance = iois.reduce((sum, v) => sum + (v - mean) ** 2, 0) / iois.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;

  return Math.max(0, Math.min(1, 1 - cv));
}

/**
 * Compute pitch variety per beat: average number of distinct pitch classes per beat.
 */
function computePitchVarietyPerBeat(notes: readonly NoteData[]): number {
  if (notes.length === 0) return 0;

  // Group notes by beat (floor of startTime)
  const beatMap = new Map<number, Set<number>>();
  for (const note of notes) {
    const beat = Math.floor(note.startTime);
    if (!beatMap.has(beat)) beatMap.set(beat, new Set());
    beatMap.get(beat)!.add(note.pitch);
  }

  if (beatMap.size === 0) return 0;

  let totalVariety = 0;
  for (const pitches of beatMap.values()) {
    totalVariety += pitches.size;
  }
  return totalVariety / beatMap.size;
}

/**
 * Compute whether notes have consistent rhythmic spacing (for arpeggio detection).
 * Returns true if IOI coefficient of variation is below 0.3 (reasonably consistent).
 */
function hasConsistentSpacing(notes: readonly NoteData[]): boolean {
  return computeRhythmicRegularity(notes) > 0.7;
}

/**
 * Classify the musical role of a track from its note data, name, and device info.
 *
 * Priority-ordered decision tree:
 * 0. If hasDrumRack is true → "drums" (definitive, skip heuristics)
 * 1. If trackName contains drum/percussion keywords → "drums" (high confidence)
 * 2. Compute note statistics and apply decision rules
 * 3. If result is "unclassified" AND trackName contains role keyword → use keyword hint
 */
export function classifyInstrumentRole(
  notes: readonly NoteData[],
  trackName: string,
  hasDrumRack?: boolean,
): InstrumentRole {
  // Step 0: DrumRack override — definitive
  if (hasDrumRack) {
    return "drums";
  }

  // Step 1: Track name drum keywords → drums (high confidence)
  if (trackNameContainsKeyword(trackName, DRUM_KEYWORDS)) {
    return "drums";
  }

  // Handle empty notes — can only classify by name or as unclassified
  if (notes.length === 0) {
    const nameRole = roleFromTrackName(trackName);
    return nameRole ?? "unclassified";
  }

  // Step 2: Compute note statistics
  const avgPolyphony = computeAvgPolyphony(notes);
  const avgDuration = notes.reduce((sum, n) => sum + n.duration, 0) / notes.length;
  const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;

  // Compute time span for density calculation
  const minTime = Math.min(...notes.map((n) => n.startTime));
  const maxTime = Math.max(...notes.map((n) => n.startTime + n.duration));
  const timeSpanBeats = maxTime - minTime;
  const density = timeSpanBeats > 0 ? notes.length / timeSpanBeats : 0;

  const pitchVarietyPerBeat = computePitchVarietyPerBeat(notes);
  const rhythmicRegularity = computeRhythmicRegularity(notes);

  // Compute pitch variety (distinct pitch classes in the track)
  const pitchClassSet = new Set(notes.map((n) => n.pitch % 12));
  const pitchVariety = pitchClassSet.size;

  // Step 3: Decision rules (checked in order)

  // 3a: Drums — pitches in 35-81 range AND high rhythmic regularity AND low pitch variety per beat
  //     Additional guard: drum hits have short durations (< 0.5 beats) to avoid classifying
  //     bass lines and lead melodies that happen to be in the same pitch range.
  const allPitchesInDrumRange = notes.every((n) => n.pitch >= 35 && n.pitch <= 81);
  if (allPitchesInDrumRange && rhythmicRegularity > 0.8 && pitchVarietyPerBeat < 3 && avgDuration < 0.5) {
    return "drums";
  }

  // 3b: Bass — low pitch AND monophonic
  if (avgPitch < 60 && avgPolyphony < 1.5) {
    return "bass";
  }

  // 3c: Arpeggio — high density AND consistent spacing
  if (density > 4 && hasConsistentSpacing(notes)) {
    return "arpeggio";
  }

  // 3d: Pad — high polyphony AND long duration
  if (avgPolyphony > 2.5 && avgDuration > 2) {
    return "pad";
  }

  // 3e: Chord — moderate polyphony AND moderate duration
  if (avgPolyphony >= 2 && avgPolyphony <= 4 && avgDuration >= 0.5 && avgDuration <= 2) {
    return "chord";
  }

  // 3f: Lead — monophonic, higher pitch, melodic movement
  if (avgPolyphony < 1.5 && avgPitch > 55 && pitchVariety >= 3) {
    return "lead";
  }

  // Step 4: If unclassified, use track name keyword hint as fallback
  const nameHint = roleFromTrackName(trackName);
  if (nameHint !== null) {
    return nameHint;
  }

  return "unclassified";
}


// ─── Fill Detection ───────────────────────────────────────────────────

/**
 * Detect percussion fills within a section given the phrase length and optional drum pad map.
 *
 * Algorithm:
 * 1. Compute the "loop fingerprint" from the first phrase
 * 2. For each phrase boundary (every `phraseLength` bars):
 *    - Extract the 1-2 bars immediately before the boundary
 *    - Compute density of this segment vs. the corresponding portion of the loop
 *    - Count pitch classes not present in the loop fingerprint
 *    - If density increase ≥ 50% OR new pitch classes ≥ 2, flag as fill
 * 3. Record: position (bar offset from section start), duration (1 or 2 bars),
 *    phraseInterval, triggerType, drumElements (when DrumPadMap available)
 */
export function detectFills(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
  phraseLength: number,
  drumPadMap?: DrumPadMap,
): FillDetection[] {
  const sectionLengthBeats = sectionEnd - sectionStart;
  const phraseLengthBeats = phraseLength * 4; // 4 beats per bar

  // Need at least one full phrase to establish the loop, plus at least 1 bar more
  // for a boundary check
  if (sectionLengthBeats < phraseLengthBeats + 4) {
    return [];
  }

  // Filter notes within the section
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  if (sectionNotes.length === 0) {
    return [];
  }

  // Step 1: Compute loop fingerprint from the first phrase
  const loopStart = sectionStart;
  const loopEnd = sectionStart + phraseLengthBeats;
  const loopFingerprint = computePatternFingerprint(sectionNotes, loopStart, loopEnd);

  const fills: FillDetection[] = [];

  // Step 2: For each phrase boundary after the first phrase
  let boundary = loopEnd;
  while (boundary <= sectionEnd) {
    // Try 2-bar fill first (8 beats before boundary), then 1-bar (4 beats)
    const fillCandidates: { durationBars: number; startBeats: number }[] = [];

    // 2-bar candidate: starts 8 beats before boundary
    const twoBarStart = boundary - 8;
    if (twoBarStart >= sectionStart) {
      fillCandidates.push({ durationBars: 2, startBeats: twoBarStart });
    }

    // 1-bar candidate: starts 4 beats before boundary
    const oneBarStart = boundary - 4;
    if (oneBarStart >= sectionStart) {
      fillCandidates.push({ durationBars: 1, startBeats: oneBarStart });
    }

    // Check each candidate, prefer 2-bar over 1-bar (check 2-bar first)
    let fillDetected = false;
    for (const candidate of fillCandidates) {
      const segStart = candidate.startBeats;
      const segEnd = boundary;

      // Extract notes in the candidate segment
      const segNotes = sectionNotes.filter(
        (n) => n.startTime >= segStart && n.startTime < segEnd,
      );

      if (segNotes.length === 0) continue;

      // Compute density of this segment
      const segLengthBeats = segEnd - segStart;
      const segDensity = segNotes.length / segLengthBeats;

      // Compute density of the corresponding portion of the loop
      // The "corresponding portion" is the same relative position within the phrase
      const relativeOffset = (segStart - sectionStart) % phraseLengthBeats;
      const loopSegStart = loopStart + relativeOffset;
      const loopSegEnd = loopSegStart + segLengthBeats;

      const loopSegNotes = sectionNotes.filter(
        (n) => n.startTime >= loopSegStart && n.startTime < loopSegEnd,
      );

      const loopSegDensity =
        loopSegNotes.length > 0 ? loopSegNotes.length / segLengthBeats : 0;

      // Compute pitch classes of the segment
      const segPitchClasses = new Set<number>();
      for (const n of segNotes) {
        segPitchClasses.add(n.pitch % 12);
      }

      // Count pitch classes not in the loop fingerprint
      let newPitchClassCount = 0;
      for (const pc of segPitchClasses) {
        if (!loopFingerprint.pitchClasses.has(pc)) {
          newPitchClassCount++;
        }
      }

      // Check thresholds
      const densityIncrease =
        loopSegDensity > 0
          ? (segDensity - loopSegDensity) / loopSegDensity
          : segDensity > 0
            ? 1.0 // If loop segment is empty but we have notes, that's a 100% increase
            : 0;

      const hasDensityTrigger = densityIncrease >= 0.5;
      const hasNewPitchesTrigger = newPitchClassCount >= 2;

      if (hasDensityTrigger || hasNewPitchesTrigger) {
        // Determine trigger type
        let triggerType: "density" | "new-pitches" | "both";
        if (hasDensityTrigger && hasNewPitchesTrigger) {
          triggerType = "both";
        } else if (hasDensityTrigger) {
          triggerType = "density";
        } else {
          triggerType = "new-pitches";
        }

        // Compute drum elements when DrumPadMap is available
        let drumElements: readonly DrumElementCategory[] | null = null;
        if (drumPadMap) {
          const elementSet = new Set<DrumElementCategory>();
          for (const n of segNotes) {
            const entry = drumPadMap.get(n.pitch);
            if (entry) {
              elementSet.add(entry.category);
            }
          }
          drumElements = elementSet.size > 0 ? Array.from(elementSet) : null;
        }

        // Position is bar offset from section start
        const position = (segStart - sectionStart) / 4;

        fills.push({
          position,
          durationBars: candidate.durationBars,
          phraseInterval: phraseLength,
          triggerType,
          drumElements,
        });

        fillDetected = true;
        break; // Don't check 1-bar if 2-bar already detected at this boundary
      }
    }

    // Move to next phrase boundary
    boundary += phraseLengthBeats;
  }

  return fills;
}


// ─── Percussion Pattern Classification ───────────────────────────────

/**
 * Classify a percussion pattern within a section as "loop" or "variation".
 *
 * Algorithm:
 * 1. Use `detectPhraseLength` to find the phrase length for the section
 * 2. Extract each consecutive phrase (phraseLength bars) within the section
 * 3. Compute fingerprints for consecutive phrases
 * 4. Compare each pair of consecutive phrases using `computeSimilarityScore`
 * 5. If all pairs have similarity ≥ 0.85 → classification = "loop"
 * 6. If any pair has similarity < 0.85 → classification = "variation"
 * 7. Call `detectFills` to find fills within the section
 * 8. Return PercussionPatternResult { classification, phraseLength, fills }
 */
export function classifyPercussionPattern(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
  drumPadMap?: DrumPadMap,
): PercussionPatternResult {
  // Step 1: Detect phrase length
  const phraseLength = detectPhraseLength(notes, sectionStart, sectionEnd);
  const phraseLengthBeats = phraseLength * 4; // 4 beats per bar
  const sectionLengthBeats = sectionEnd - sectionStart;

  // Filter notes within section to check if there's any content to classify
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  // If no notes in the section, it's trivially a "loop" (empty repeating pattern)
  if (sectionNotes.length === 0) {
    const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength, drumPadMap);
    return { classification: "loop", phraseLength, fills };
  }

  // Step 2-4: Extract consecutive phrases and compare pairs
  const phraseCount = Math.floor(sectionLengthBeats / phraseLengthBeats);

  let classification: "loop" | "variation";

  if (phraseCount < 2) {
    // Can't compare consecutive phrases — treat as loop (single phrase = self-repeating)
    classification = "loop";
  } else {
    // Compute fingerprints for each phrase
    const fingerprints: PatternFingerprint[] = [];
    for (let i = 0; i < phraseCount; i++) {
      const phraseStart = sectionStart + i * phraseLengthBeats;
      const phraseEnd = phraseStart + phraseLengthBeats;
      fingerprints.push(computePatternFingerprint(notes, phraseStart, phraseEnd));
    }

    // Compare consecutive pairs
    let allSimilar = true;
    for (let i = 0; i < fingerprints.length - 1; i++) {
      const similarity = computeSimilarityScore(fingerprints[i], fingerprints[i + 1]);
      if (similarity < 0.85) {
        allSimilar = false;
        break;
      }
    }

    // Step 5-6: Classify based on similarity
    classification = allSimilar ? "loop" : "variation";
  }

  // Step 7: Detect fills
  const fills = detectFills(notes, sectionStart, sectionEnd, phraseLength, drumPadMap);

  // Step 8: Return result
  return {
    classification,
    phraseLength,
    fills,
  };
}

// ─── Build Detection ──────────────────────────────────────────────────

/**
 * Detect build/intensification patterns approaching a boundary.
 *
 * Algorithm:
 * 1. Examine the final 4 bars before the boundary (clamped to section start)
 * 2. Divide into individual bars
 * 3. For each bar, compute: note density, average velocity, pitch range (max - min)
 * 4. Check for progressive increase across 2+ consecutive bars:
 *    - Density: each bar has ≥ 25% more notes than the previous
 *    - Velocity: each bar's average velocity is ≥ 10 units higher
 *    - Pitch range: each bar introduces at least 1 new pitch outside prior range
 * 5. Classify type based on which metrics show progression
 * 6. Return null if no progressive increase detected
 */
export function detectBuilds(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
  boundary: number,
): BuildDetection | null {
  // Determine the analysis window: up to 4 bars (16 beats) before boundary
  const windowBeats = 16; // 4 bars × 4 beats
  const windowStart = Math.max(sectionStart, boundary - windowBeats);
  const windowEnd = boundary;

  // Need at least 2 bars to detect progression
  const windowLength = windowEnd - windowStart;
  if (windowLength < 8) {
    return null;
  }

  // Filter notes within the analysis window
  const windowNotes = notes.filter(
    (n) => n.startTime >= windowStart && n.startTime < windowEnd,
  );

  if (windowNotes.length === 0) {
    return null;
  }

  // Divide into individual bars (4 beats each)
  const barCount = Math.floor(windowLength / 4);
  if (barCount < 2) {
    return null;
  }

  // Per-bar metrics
  interface BarMetrics {
    density: number;
    avgVelocity: number;
    minPitch: number;
    maxPitch: number;
    pitchSet: Set<number>;
  }

  const barMetrics: BarMetrics[] = [];
  for (let i = 0; i < barCount; i++) {
    const barStart = windowStart + i * 4;
    const barEnd = barStart + 4;
    const barNotes = windowNotes.filter(
      (n) => n.startTime >= barStart && n.startTime < barEnd,
    );

    if (barNotes.length === 0) {
      barMetrics.push({
        density: 0,
        avgVelocity: 0,
        minPitch: Infinity,
        maxPitch: -Infinity,
        pitchSet: new Set(),
      });
    } else {
      const density = barNotes.length / 4; // notes per beat within this bar
      const avgVelocity =
        barNotes.reduce((sum, n) => sum + n.velocity, 0) / barNotes.length;
      const pitches = barNotes.map((n) => n.pitch);
      const minPitch = Math.min(...pitches);
      const maxPitch = Math.max(...pitches);
      const pitchSet = new Set(pitches);

      barMetrics.push({ density, avgVelocity, minPitch, maxPitch, pitchSet });
    }
  }

  // Check for progressive increase across 2+ consecutive bars
  // Find longest run of consecutive bars with each metric increasing

  // Density: each bar has ≥ 25% more notes than the previous
  let longestDensityRun = 1;
  let currentDensityRun = 1;
  for (let i = 1; i < barCount; i++) {
    const prev = barMetrics[i - 1];
    const curr = barMetrics[i];
    if (prev.density > 0 && curr.density >= prev.density * 1.25) {
      currentDensityRun++;
      longestDensityRun = Math.max(longestDensityRun, currentDensityRun);
    } else {
      currentDensityRun = 1;
    }
  }

  // Velocity: each bar's average velocity is ≥ 10 units higher
  let longestVelocityRun = 1;
  let currentVelocityRun = 1;
  for (let i = 1; i < barCount; i++) {
    const prev = barMetrics[i - 1];
    const curr = barMetrics[i];
    if (prev.avgVelocity > 0 && curr.avgVelocity >= prev.avgVelocity + 10) {
      currentVelocityRun++;
      longestVelocityRun = Math.max(longestVelocityRun, currentVelocityRun);
    } else {
      currentVelocityRun = 1;
    }
  }

  // Pitch range: each bar introduces at least 1 new pitch outside prior range
  let longestPitchRun = 1;
  let currentPitchRun = 1;
  for (let i = 1; i < barCount; i++) {
    const prev = barMetrics[i - 1];
    const curr = barMetrics[i];
    // Check if current bar has any pitch outside the prior bar's range
    if (prev.pitchSet.size === 0 || curr.pitchSet.size === 0) {
      currentPitchRun = 1;
      continue;
    }
    let hasNewPitch = false;
    for (const pitch of curr.pitchSet) {
      if (pitch < prev.minPitch || pitch > prev.maxPitch) {
        hasNewPitch = true;
        break;
      }
    }
    if (hasNewPitch) {
      currentPitchRun++;
      longestPitchRun = Math.max(longestPitchRun, currentPitchRun);
    } else {
      currentPitchRun = 1;
    }
  }

  // Determine if any metric has a progressive increase (2+ consecutive bars)
  const hasDensityBuild = longestDensityRun >= 2;
  const hasVelocityBuild = longestVelocityRun >= 2;
  const hasPitchRangeBuild = longestPitchRun >= 2;

  if (!hasDensityBuild && !hasVelocityBuild && !hasPitchRangeBuild) {
    return null;
  }

  // Classify type
  let type: BuildDetection["type"];
  const buildCount =
    (hasDensityBuild ? 1 : 0) +
    (hasVelocityBuild ? 1 : 0) +
    (hasPitchRangeBuild ? 1 : 0);

  if (buildCount >= 2) {
    type = "combined";
  } else if (hasDensityBuild) {
    type = "density";
  } else if (hasVelocityBuild) {
    type = "velocity";
  } else {
    type = "pitch-range";
  }

  // Compute duration: use the longest run among the detected builds
  const longestRun = Math.max(
    hasDensityBuild ? longestDensityRun : 0,
    hasVelocityBuild ? longestVelocityRun : 0,
    hasPitchRangeBuild ? longestPitchRun : 0,
  );

  // Start position: the beginning of the longest progressive run,
  // counting back from the end of the window
  const startPosition = windowEnd - longestRun * 4;

  return {
    trackName: "", // Populated by caller (analyzeContent)
    startPosition,
    durationBars: longestRun,
    type,
    targetBoundary: boundary,
  };
}


// ─── Cross-Section Pattern Comparison ─────────────────────────────────

/**
 * Compare patterns across sections for a single track.
 *
 * Takes an array of fingerprints (one per section for a single track)
 * and compares each pair of consecutive fingerprints using `computeSimilarityScore`.
 *
 * Classification thresholds:
 * - "shared": similarity > 0.85
 * - "contrasting": similarity < 0.5
 * - "similar": otherwise (0.5 ≤ similarity ≤ 0.85)
 *
 * Returns an array of CrossSectionComparison objects.
 */
export function comparePatternsAcrossSections(
  fingerprints: readonly PatternFingerprint[],
): CrossSectionComparison[] {
  if (fingerprints.length < 2) {
    return [];
  }

  const comparisons: CrossSectionComparison[] = [];

  for (let i = 0; i < fingerprints.length - 1; i++) {
    const similarity = computeSimilarityScore(fingerprints[i], fingerprints[i + 1]);

    let classification: CrossSectionComparison["classification"];
    if (similarity > 0.85) {
      classification = "shared";
    } else if (similarity < 0.5) {
      classification = "contrasting";
    } else {
      classification = "similar";
    }

    comparisons.push({
      sectionIndexA: i,
      sectionIndexB: i + 1,
      similarity,
      classification,
    });
  }

  return comparisons;
}

// ─── Track Repetition Summary ─────────────────────────────────────────

/**
 * Build a repetition summary for a single track from its cross-section comparisons.
 *
 * This function:
 * 1. Identifies groups of consecutive sections that share patterns (similarity > 0.85)
 * 2. Identifies unique sections (no shared neighbors)
 * 3. Detects extended repetition (3+ consecutive sections with shared pattern)
 *
 * @param comparisons - Cross-section comparisons for this track
 * @param role - The instrument role of this track
 * @param sectionCount - Total number of sections analyzed
 */
export function buildRepetitionSummary(
  comparisons: readonly CrossSectionComparison[],
  role: InstrumentRole,
  sectionCount: number,
): TrackRepetitionSummary {
  if (sectionCount === 0) {
    return {
      role,
      sharedGroups: [],
      uniqueSections: [],
      hasExtendedRepetition: false,
      extendedRepetitionSections: [],
    };
  }

  // Build shared groups: groups of consecutive section indices connected by "shared" comparisons
  const sharedGroups: number[][] = [];
  let currentGroup: number[] = [];

  for (let i = 0; i < comparisons.length; i++) {
    const comp = comparisons[i];
    if (comp.classification === "shared") {
      if (currentGroup.length === 0) {
        // Start a new group with both sections
        currentGroup.push(comp.sectionIndexA, comp.sectionIndexB);
      } else {
        // Extend the current group with the next section
        currentGroup.push(comp.sectionIndexB);
      }
    } else {
      // End of a shared run — save the group if it exists
      if (currentGroup.length > 0) {
        sharedGroups.push(currentGroup);
        currentGroup = [];
      }
    }
  }
  // Don't forget the last group
  if (currentGroup.length > 0) {
    sharedGroups.push(currentGroup);
  }

  // Identify unique sections: sections that are NOT part of any shared group
  const sectionsInSharedGroups = new Set<number>();
  for (const group of sharedGroups) {
    for (const idx of group) {
      sectionsInSharedGroups.add(idx);
    }
  }

  const uniqueSections: number[] = [];
  for (let i = 0; i < sectionCount; i++) {
    if (!sectionsInSharedGroups.has(i)) {
      uniqueSections.push(i);
    }
  }

  // Detect extended repetition: 3+ consecutive sections in a shared group
  const extendedRepetitionSections: number[] = [];
  let hasExtendedRepetition = false;

  for (const group of sharedGroups) {
    if (group.length >= 3) {
      hasExtendedRepetition = true;
      for (const idx of group) {
        extendedRepetitionSections.push(idx);
      }
    }
  }

  return {
    role,
    sharedGroups,
    uniqueSections,
    hasExtendedRepetition,
    extendedRepetitionSections,
  };
}


// ─── Top-Level Entry Point ────────────────────────────────────────────

/** Performance budget in milliseconds for the content analysis pass. */
const PERFORMANCE_BUDGET_MS = 50;

/**
 * Top-level content analysis entry point.
 *
 * Orchestrates all sub-functions to produce a complete ContentAnalysisResult:
 * 1. Classify instrument roles per track
 * 2. Compute pattern fingerprints per (track, section)
 * 3. Detect phrase lengths per section (from drums or first track)
 * 4. Classify percussion patterns (fills) for drum tracks
 * 5. Detect builds near section boundaries
 * 6. Compare patterns across sections per track
 * 7. Build repetition summaries per track
 * 8. Compute active percussion elements per section per drum track
 * 9. Detect percussion discontinuities
 *
 * Performance guard: if processing exceeds 50ms, skips cross-section
 * comparison and sets empty results for those fields.
 *
 * Pure function — no SDK calls, no side effects.
 */
export function analyzeContent(
  sections: readonly Section[],
  trackNoteData: readonly TrackNoteData[],
  trackNames: readonly string[],
  drumPadMaps: ReadonlyMap<string, DrumPadMap>,
): ContentAnalysisResult {
  const startTime = performance.now();

  // Empty input guard
  if (sections.length === 0 || trackNoteData.length === 0) {
    return buildEmptyResult();
  }

  // Filter out sections with Infinity endTime (last section sentinel)
  // by clamping to a reasonable end or skipping them
  const validSections = sections.filter((s) => s.endTime !== Infinity && s.endTime > s.startTime);
  if (validSections.length === 0) {
    return buildEmptyResult();
  }

  // Step 1: Classify instrument roles per track
  const roles = new Map<string, InstrumentRole>();
  for (const tnd of trackNoteData) {
    const hasDrumRack = drumPadMaps.has(tnd.trackName);
    const role = classifyInstrumentRole(tnd.notes, tnd.trackName, hasDrumRack);
    roles.set(tnd.trackName, role);
  }

  // Step 2: Compute fingerprints per (track, section)
  // Key: trackName → array of fingerprints (one per valid section, in order)
  const fingerprintsPerTrack = new Map<string, PatternFingerprint[]>();
  for (const tnd of trackNoteData) {
    const trackFingerprints: PatternFingerprint[] = [];
    for (const section of validSections) {
      const fp = computePatternFingerprint(tnd.notes, section.startTime, section.endTime);
      trackFingerprints.push(fp);
    }
    fingerprintsPerTrack.set(tnd.trackName, trackFingerprints);
  }

  // Step 3: Detect phrase lengths per section
  // Use the first drum track's notes, or the first track's notes if no drums
  const phraseLengths = new Map<string, number>();
  const drumTrackData = trackNoteData.find((t) => roles.get(t.trackName) === "drums");
  const phraseSourceNotes = drumTrackData ? drumTrackData.notes : trackNoteData[0].notes;

  for (const section of validSections) {
    const pl = detectPhraseLength(phraseSourceNotes, section.startTime, section.endTime);
    phraseLengths.set(section.id, pl);
  }

  // Step 4: Per-section, per-track analysis (percussion patterns, fills, builds, drum element profiles)
  const perSection = new Map<string, Map<string, TrackContentAnalysis>>();
  const percussionSnapshots = new Map<string, Map<string, ActivePercussionSnapshot>>();

  for (const section of validSections) {
    const trackAnalysisMap = new Map<string, TrackContentAnalysis>();
    const sectionSnapshots = new Map<string, ActivePercussionSnapshot>();

    for (const tnd of trackNoteData) {
      const trackName = tnd.trackName;
      const role = roles.get(trackName) ?? "unclassified";
      const fingerprints = fingerprintsPerTrack.get(trackName) ?? [];
      const sectionIndex = validSections.indexOf(section);
      const fingerprint = fingerprints[sectionIndex] ?? computePatternFingerprint(tnd.notes, section.startTime, section.endTime);

      // Percussion pattern (drums only)
      let percussionPattern: PercussionPatternResult | null = null;
      if (role === "drums") {
        const drumPadMap = drumPadMaps.get(trackName);
        percussionPattern = classifyPercussionPattern(
          tnd.notes,
          section.startTime,
          section.endTime,
          drumPadMap,
        );
      }

      // Build detection: check at section end boundary
      const sectionIdx = validSections.indexOf(section);
      let build: BuildDetection | null = null;
      if (sectionIdx < validSections.length - 1) {
        // Detect build at the boundary between this section and the next
        const boundary = section.endTime;
        const rawBuild = detectBuilds(tnd.notes, section.startTime, section.endTime, boundary);
        if (rawBuild) {
          build = { ...rawBuild, trackName };
        }
      }

      // Drum element profile (drums only when DrumPadMap available)
      let drumElementProfile: DrumElementProfile | null = null;
      if (role === "drums" && drumPadMaps.has(trackName)) {
        const drumPadMap = drumPadMaps.get(trackName)!;
        drumElementProfile = computeDrumElementProfile(
          tnd.notes,
          section.startTime,
          section.endTime,
          drumPadMap,
          percussionPattern?.fills ?? [],
        );

        // Compute active percussion snapshot for this drum track in this section
        const activeElements = computeActivePercussionElements(
          tnd.notes,
          section.startTime,
          section.endTime,
          drumPadMap,
        );

        // Compute element counts for prominence
        const elementCounts = new Map<string, number>();
        const sectionNotes = tnd.notes.filter(
          (n) => n.startTime >= section.startTime && n.startTime < section.endTime,
        );
        for (const note of sectionNotes) {
          const entry = drumPadMap.get(note.pitch);
          if (entry) {
            elementCounts.set(entry.sampleName, (elementCounts.get(entry.sampleName) ?? 0) + 1);
          }
        }

        sectionSnapshots.set(trackName, {
          sectionId: section.id,
          activeElements,
          elementCounts,
        });
      }

      trackAnalysisMap.set(trackName, {
        role,
        fingerprint,
        percussionPattern,
        build,
        drumElementProfile,
      });
    }

    perSection.set(section.id, trackAnalysisMap);
    if (sectionSnapshots.size > 0) {
      percussionSnapshots.set(section.id, sectionSnapshots);
    }
  }

  // Check performance budget before cross-section comparison
  const elapsed = performance.now() - startTime;
  if (elapsed > PERFORMANCE_BUDGET_MS) {
    // Degraded mode: skip cross-section comparison
    return {
      perSection,
      crossSection: new Map(),
      repetitionSummary: new Map(),
      phraseLengths,
      percussionSnapshots,
      percussionDiscontinuities: [],
    };
  }

  // Step 6: Cross-section pattern comparison per track
  const crossSection = new Map<string, readonly CrossSectionComparison[]>();
  for (const tnd of trackNoteData) {
    const fingerprints = fingerprintsPerTrack.get(tnd.trackName) ?? [];
    const comparisons = comparePatternsAcrossSections(fingerprints);
    crossSection.set(tnd.trackName, comparisons);
  }

  // Step 7: Build repetition summaries per track
  const repetitionSummary = new Map<string, TrackRepetitionSummary>();
  for (const tnd of trackNoteData) {
    const comparisons = crossSection.get(tnd.trackName) ?? [];
    const role = roles.get(tnd.trackName) ?? "unclassified";
    const summary = buildRepetitionSummary(comparisons, role, validSections.length);
    repetitionSummary.set(tnd.trackName, summary);
  }

  // Step 9: Detect percussion discontinuities across sections
  const percussionDiscontinuities: PercussionDiscontinuity[] = [];
  // For each drum track with a DrumPadMap, gather active elements per section
  for (const tnd of trackNoteData) {
    const role = roles.get(tnd.trackName);
    if (role !== "drums" || !drumPadMaps.has(tnd.trackName)) continue;

    const activeElementsPerSection: ReadonlySet<string>[] = [];
    const sectionNames: string[] = [];

    for (const section of validSections) {
      const snapshot = percussionSnapshots.get(section.id)?.get(tnd.trackName);
      activeElementsPerSection.push(snapshot?.activeElements ?? new Set());
      sectionNames.push(section.name);
    }

    const discontinuities = detectPercussionDiscontinuities(activeElementsPerSection, sectionNames);
    // Fill in trackName for each discontinuity
    for (const d of discontinuities) {
      percussionDiscontinuities.push({ ...d, trackName: tnd.trackName });
    }
  }

  return {
    perSection,
    crossSection,
    repetitionSummary,
    phraseLengths,
    percussionSnapshots,
    percussionDiscontinuities,
  };
}

// ─── Helper: Empty Result ─────────────────────────────────────────────

/** Produce an empty ContentAnalysisResult for degenerate inputs. */
function buildEmptyResult(): ContentAnalysisResult {
  return {
    perSection: new Map(),
    crossSection: new Map(),
    repetitionSummary: new Map(),
    phraseLengths: new Map(),
    percussionSnapshots: new Map(),
    percussionDiscontinuities: [],
  };
}

// ─── Helper: Drum Element Profile ─────────────────────────────────────

/**
 * Compute a DrumElementProfile for a drum track within a section.
 *
 * Determines which elements are active, their note counts, and separates
 * elements that appear only in fills from those in the main loop.
 */
function computeDrumElementProfile(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
  drumPadMap: DrumPadMap,
  fills: readonly FillDetection[],
): DrumElementProfile {
  const sectionNotes = notes.filter(
    (n) => n.startTime >= sectionStart && n.startTime < sectionEnd,
  );

  // Compute all active element categories and their counts
  const activeElements = new Set<DrumElementCategory>();
  const elementCounts = new Map<DrumElementCategory, number>();

  for (const note of sectionNotes) {
    const entry = drumPadMap.get(note.pitch);
    if (entry) {
      activeElements.add(entry.category);
      elementCounts.set(entry.category, (elementCounts.get(entry.category) ?? 0) + 1);
    }
  }

  // Determine which elements appear in fills vs the main loop
  const fillElementCategories = new Set<DrumElementCategory>();
  const loopElementCategories = new Set<DrumElementCategory>();

  // Compute fill time ranges
  const fillRanges: { start: number; end: number }[] = [];
  for (const fill of fills) {
    const fillStart = sectionStart + fill.position * 4; // position is in bars, convert to beats
    const fillEnd = fillStart + fill.durationBars * 4;
    fillRanges.push({ start: fillStart, end: fillEnd });
  }

  for (const note of sectionNotes) {
    const entry = drumPadMap.get(note.pitch);
    if (!entry) continue;

    const inFill = fillRanges.some(
      (range) => note.startTime >= range.start && note.startTime < range.end,
    );

    if (inFill) {
      fillElementCategories.add(entry.category);
    } else {
      loopElementCategories.add(entry.category);
    }
  }

  // Fill-only = in fills but NOT in loop
  const fillOnlyElements: DrumElementCategory[] = [];
  for (const cat of fillElementCategories) {
    if (!loopElementCategories.has(cat)) {
      fillOnlyElements.push(cat);
    }
  }

  // Loop-only = in loop but NOT in fills
  const loopElements: DrumElementCategory[] = [];
  for (const cat of loopElementCategories) {
    if (!fillElementCategories.has(cat)) {
      loopElements.push(cat);
    }
  }

  return {
    activeElements,
    elementCounts,
    fillOnlyElements,
    loopElements,
  };
}
