/**
 * Property-based tests for the Issue Detector module.
 *
 * Feature: m3-issue-detection
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { _detectMissingTransitions, _hasTransitionElement, _detectRepetition, _detectAbruptChanges, _hasBuildupContext } from "../../../src/core/issue-detector.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { TrackClipData, TrackNoteData } from "../../../src/core/section-analyzer.js";
import type { TrackInfo } from "../../../src/core/track-reader.js";
import type { ClipData, NoteData } from "../../../src/ableton/sdk-adapter.js";
import type { SectionAnalysisState } from "../../../src/state/store.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Transition keywords (case-insensitive) that identify transition tracks. */
const TRANSITION_KEYWORDS = ["riser", "sweep", "fx", "fill", "trans", "build"];

/** Generate a non-transition track name that won't accidentally match keywords. */
const nonTransitionTrackNameArbitrary = fc.stringOf(
  fc.constantFrom("a", "b", "c", "d", "e", "k", "l", "m", "n", "o", "p", "q"),
  { minLength: 3, maxLength: 10 },
).filter((name) => {
  const lower = name.toLowerCase();
  return !TRANSITION_KEYWORDS.some((kw) => lower.includes(kw));
});

/** Generate a track name containing at least one transition keyword. */
const transitionTrackNameArbitrary = fc.tuple(
  fc.constantFrom(...TRANSITION_KEYWORDS),
  fc.stringOf(fc.constantFrom("a", "b", "c", " ", "1", "2"), { minLength: 0, maxLength: 5 }),
).map(([keyword, suffix]) => `${keyword}${suffix}`);

/** Generate a section with a given index and configurable time range. */
const sectionArbitrary = (index: number, startTime: number, minLength: number = 8): fc.Arbitrary<Section> =>
  fc.integer({ min: minLength, max: 64 }).map((length) => ({
    id: `section-${index}`,
    name: `Section ${index}`,
    startTime,
    endTime: startTime + length,
  }));

/** Generate a pair of consecutive sections with explicit time bounds. */
const sectionPairArbitrary: fc.Arbitrary<[Section, Section]> = fc
  .tuple(
    fc.integer({ min: 0, max: 500 }),   // start of first section
    fc.integer({ min: 8, max: 64 }),    // length of first section
    fc.integer({ min: 8, max: 64 }),    // length of second section
  )
  .map(([start, len1, len2]) => [
    { id: "section-0", name: "Section A", startTime: start, endTime: start + len1 },
    { id: "section-1", name: "Section B", startTime: start + len1, endTime: start + len1 + len2 },
  ]);

/** Generate energy values as integers in [1, 10]. */
const energyValueArbitrary = fc.integer({ min: 1, max: 10 });

/** Generate a ClipData that overlaps a given window [windowStart, windowEnd). */
const clipInWindowArbitrary = (windowStart: number, windowEnd: number): fc.Arbitrary<ClipData> =>
  fc.tuple(
    fc.double({ min: windowStart - 4, max: windowEnd - 0.1, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.1, max: 8, noNaN: true, noDefaultInfinity: true }),
  ).map(([start, duration]) => ({
    startTime: Math.max(0, start),
    endTime: Math.max(0, start) + duration,
    muted: false,
    hasEnvelopes: false,
  }))
  // Ensure actual overlap with window: clip.startTime < windowEnd && clip.endTime > windowStart
  .filter((clip) => clip.startTime < windowEnd && clip.endTime > windowStart);

/** Generate a ClipData that does NOT overlap a given window. */
const clipOutsideWindowArbitrary = (windowStart: number, windowEnd: number): fc.Arbitrary<ClipData> =>
  fc.oneof(
    // Before the window
    fc.tuple(
      fc.double({ min: 0, max: Math.max(0, windowStart - 1), noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.1, max: Math.max(0.1, windowStart), noNaN: true, noDefaultInfinity: true }),
    ).map(([start, end]) => ({
      startTime: start,
      endTime: Math.min(end, windowStart), // ensure endTime <= windowStart
      muted: false,
      hasEnvelopes: false,
    })).filter((clip) => clip.endTime <= windowStart && clip.endTime > clip.startTime),
    // After the window
    fc.tuple(
      fc.double({ min: windowEnd, max: windowEnd + 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
    ).map(([start, duration]) => ({
      startTime: start,
      endTime: start + duration,
      muted: false,
      hasEnvelopes: false,
    })),
  );

// ─── Property 2: Missing transition reported iff delta >= 3 and no transition element ───

// Feature: m3-issue-detection, Property 2: Missing transition reported iff delta >= 3 and no transition element
describe("Property 2: Missing transition reported iff delta >= 3 and no transition element", () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * For any pair of consecutive sections, a missing-transition issue is reported
   * if and only if the absolute energy delta is >= 3 AND no Transition_Element
   * is detected in the detection window of the preceding section. When a transition
   * element is present, no issue is reported regardless of delta magnitude.
   */

  test.prop(
    [
      sectionPairArbitrary,
      energyValueArbitrary,
      energyValueArbitrary,
    ],
    { numRuns: 100 },
  )(
    "issue reported iff |delta| >= 3 and no transition element present (no clips scenario)",
    ([sectionA, sectionB], energyA, energyB) => {
      const sections = [sectionA, sectionB];
      const energyCurve = [energyA, energyB];
      const delta = Math.abs(energyA - energyB);

      // With no clips at all, there are no transition elements
      const result = _detectMissingTransitions(sections, energyCurve, [], []);

      if (delta >= 3) {
        // Issue SHOULD be reported
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe("missing-transition");
        expect(result[0]!.sectionIds).toEqual([sectionA.id, sectionB.id]);
      } else {
        // Issue should NOT be reported
        expect(result).toHaveLength(0);
      }
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      // Energy values that guarantee delta >= 3
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 5, max: 10 }),
    ],
    { numRuns: 100 },
  )(
    "no issue when transition element (hasEnvelopes clip) is present, regardless of delta",
    ([sectionA, sectionB], energyLow, energyHigh) => {
      // Ensure delta >= 3
      const energyA = energyLow;
      const energyB = energyHigh;
      const delta = Math.abs(energyA - energyB);
      // Skip if delta < 3 (shouldn't happen with our range but guard)
      fc.pre(delta >= 3);

      const sections = [sectionA, sectionB];
      const energyCurve = [energyA, energyB];

      // Compute the detection window
      const sectionLength = sectionA.endTime - sectionA.startTime;
      const windowBeats = 16;
      const windowStart = sectionLength < windowBeats
        ? sectionA.startTime
        : sectionA.endTime - windowBeats;
      const windowEnd = sectionA.endTime;

      // Place a clip with hasEnvelopes inside the window
      const midpoint = (windowStart + windowEnd) / 2;
      const trackClipData: TrackClipData[] = [{
        trackName: "Lead Synth",
        trackType: "midi",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: true,
        }],
      }];

      const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

      // No issue should be reported when transition element is present
      expect(result).toHaveLength(0);
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 5, max: 10 }),
    ],
    { numRuns: 100 },
  )(
    "no issue when clip on transition keyword track is present in window, regardless of delta",
    ([sectionA, sectionB], energyLow, energyHigh) => {
      const delta = Math.abs(energyLow - energyHigh);
      fc.pre(delta >= 3);

      const sections = [sectionA, sectionB];
      const energyCurve = [energyLow, energyHigh];

      // Compute the detection window
      const sectionLength = sectionA.endTime - sectionA.startTime;
      const windowBeats = 16;
      const windowStart = sectionLength < windowBeats
        ? sectionA.startTime
        : sectionA.endTime - windowBeats;
      const windowEnd = sectionA.endTime;

      // Place a clip on a transition keyword track inside the window
      const midpoint = (windowStart + windowEnd) / 2;
      const trackClipData: TrackClipData[] = [{
        trackName: "Riser Main",
        trackType: "audio",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

      expect(result).toHaveLength(0);
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 5, max: 10 }),
    ],
    { numRuns: 100 },
  )(
    "no issue when clip on return track is present in window, regardless of delta",
    ([sectionA, sectionB], energyLow, energyHigh) => {
      const delta = Math.abs(energyLow - energyHigh);
      fc.pre(delta >= 3);

      const sections = [sectionA, sectionB];
      const energyCurve = [energyLow, energyHigh];

      // Compute the detection window
      const sectionLength = sectionA.endTime - sectionA.startTime;
      const windowBeats = 16;
      const windowStart = sectionLength < windowBeats
        ? sectionA.startTime
        : sectionA.endTime - windowBeats;
      const windowEnd = sectionA.endTime;

      // Place a clip on a return track inside the window
      const midpoint = (windowStart + windowEnd) / 2;
      const trackClipData: TrackClipData[] = [{
        trackName: "Reverb Return",
        trackType: "audio",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      const trackInventory: TrackInfo[] = [
        { name: "Reverb Return", type: "return" as unknown as "midi" | "audio" },
      ];

      const result = _detectMissingTransitions(sections, energyCurve, trackClipData, trackInventory);

      expect(result).toHaveLength(0);
    },
  );
});

// ─── Property 3: Missing transition severity determined by delta magnitude ───

// Feature: m3-issue-detection, Property 3: Missing transition severity determined by delta magnitude
describe("Property 3: Missing transition severity determined by delta magnitude", () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any missing-transition issue, severity SHALL be "warning" when the
   * absolute energy delta is 3 or 4, and "critical" when the absolute energy
   * delta is 5 or more.
   */

  test.prop(
    [
      sectionPairArbitrary,
      // Generate deltas in the range [3, 9] (max possible with [1,10] energy range)
      fc.integer({ min: 3, max: 9 }),
      fc.boolean(), // direction: true = up, false = down
    ],
    { numRuns: 100 },
  )(
    "severity is 'warning' for delta 3–4, 'critical' for delta >= 5",
    ([sectionA, sectionB], delta, isUpward) => {
      // Construct energy values to produce the exact desired delta
      let energyA: number;
      let energyB: number;
      if (isUpward) {
        energyA = 1;
        energyB = 1 + delta;
      } else {
        energyA = 1 + delta;
        energyB = 1;
      }

      // Ensure values are in valid range [1, 10]
      fc.pre(energyA >= 1 && energyA <= 10 && energyB >= 1 && energyB <= 10);

      const sections = [sectionA, sectionB];
      const energyCurve = [energyA, energyB];

      // No transition elements → issue will be reported
      const result = _detectMissingTransitions(sections, energyCurve, [], []);

      expect(result).toHaveLength(1);

      const issue = result[0]!;
      if (delta >= 5) {
        expect(issue.severity).toBe("critical");
      } else {
        // delta is 3 or 4
        expect(issue.severity).toBe("warning");
      }
    },
  );
});

// ─── Property 4: Transition element detected when any indicator is present ───

// Feature: m3-issue-detection, Property 4: Transition element detected when any indicator is present
describe("Property 4: Transition element detected when any indicator is present", () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any section boundary detection window, a Transition_Element is considered
   * present when at least one of the following holds:
   * (a) a clip with hasEnvelopes exists in the window
   * (b) a clip exists on a track named with a transition keyword
   * (c) a clip exists on a return track
   * Any single indicator is sufficient.
   */

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),   // windowStart
      fc.integer({ min: 4, max: 32 }),    // window length
    ],
    { numRuns: 100 },
  )(
    "returns true when a clip with hasEnvelopes exists in the window (indicator a)",
    (windowStart, windowLength) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      // Single clip with hasEnvelopes on a non-keyword, non-return track
      const trackClipData: TrackClipData[] = [{
        trackName: "Lead Melody",
        trackType: "midi",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: true,
        }],
      }];

      const result = _hasTransitionElement(windowStart, windowEnd, trackClipData, new Set());
      expect(result).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      fc.constantFrom(...TRANSITION_KEYWORDS),
    ],
    { numRuns: 100 },
  )(
    "returns true when a clip exists on a transition keyword track in the window (indicator b)",
    (windowStart, windowLength, keyword) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      // Clip on a track whose name contains a transition keyword
      const trackClipData: TrackClipData[] = [{
        trackName: `My ${keyword} track`,
        trackType: "audio",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      const result = _hasTransitionElement(windowStart, windowEnd, trackClipData, new Set());
      expect(result).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      nonTransitionTrackNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "returns true when a clip exists on a return track in the window (indicator c)",
    (windowStart, windowLength, trackName) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      // Clip on a return track (non-keyword name)
      const trackClipData: TrackClipData[] = [{
        trackName,
        trackType: "audio",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      const returnTrackNames = new Set([trackName]);
      const result = _hasTransitionElement(windowStart, windowEnd, trackClipData, returnTrackNames);
      expect(result).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      nonTransitionTrackNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "returns false when no indicators are active (clip without envelopes on non-keyword non-return track)",
    (windowStart, windowLength, trackName) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      // Clip without any transition indicators
      const trackClipData: TrackClipData[] = [{
        trackName,
        trackType: "midi",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      // Track is NOT a return track
      const result = _hasTransitionElement(windowStart, windowEnd, trackClipData, new Set());
      expect(result).toBe(false);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
    ],
    { numRuns: 100 },
  )(
    "returns false when no clips exist in the window at all",
    (windowStart, windowLength) => {
      const windowEnd = windowStart + windowLength;

      // No clip data at all
      const result = _hasTransitionElement(windowStart, windowEnd, [], new Set());
      expect(result).toBe(false);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      // Pick one or more indicators to activate simultaneously
      fc.record({
        hasEnvelopes: fc.boolean(),
        isTransitionKeyword: fc.boolean(),
        isReturnTrack: fc.boolean(),
      }).filter((r) => r.hasEnvelopes || r.isTransitionKeyword || r.isReturnTrack),
    ],
    { numRuns: 100 },
  )(
    "any single indicator is sufficient for detection",
    (windowStart, windowLength, indicators) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      const trackName = indicators.isTransitionKeyword ? "Riser FX" : "Plain Track";
      const trackClipData: TrackClipData[] = [{
        trackName,
        trackType: "audio",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: indicators.hasEnvelopes,
        }],
      }];

      const returnTrackNames = indicators.isReturnTrack ? new Set([trackName]) : new Set<string>();
      const result = _hasTransitionElement(windowStart, windowEnd, trackClipData, returnTrackNames);
      expect(result).toBe(true);
    },
  );
});

// ─── DJ Compatibility Generators ────────────────────────────────────────

import { _detectDJCompatibility } from "../../../src/core/issue-detector.js";
import { getThresholdProfileForGenre } from "../../../src/core/genre-registry.js";
import type { GenreThresholdProfile } from "../../../src/core/genre-registry.js";

/** DJ-oriented genres that trigger DJ compatibility checks (use genre IDs). */
const DJ_GENRES = ["techno", "house", "trance", "drum-and-bass"] as const;

/** Generate a random DJ-oriented genre. */
const djGenreArbitrary = fc.constantFrom(...DJ_GENRES);

/** Generate a section with explicit startTime and endTime (for controlling bar length). */
const djSectionArbitrary = (
  index: number,
  startTime: number,
  lengthInBars: number,
): Section => ({
  id: `section-${index}`,
  name: `Section ${index}`,
  startTime,
  endTime: startTime + lengthInBars * 4, // 4 beats per bar
});

// ─── Property 13: DJ section length issues for intro and outro ──────────

// Feature: m3-issue-detection, Property 13: DJ section length issues for intro and outro
describe("Property 13: DJ section length issues for intro and outro", () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   *
   * For any DJ-oriented genre and arrangement, an intro-length issue with
   * "warning" severity is reported when the first section's length in bars
   * is less than the genre's minimum intro length, and an outro-length issue
   * with "warning" severity is reported when the last section's length in
   * bars is less than the genre's minimum outro length.
   */

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 1, max: 63 }), // intro bars
      fc.integer({ min: 1, max: 63 }), // outro bars
    ],
    { numRuns: 100 },
  )(
    "intro-length issue reported when first section bars < genre minimum, not when >=",
    (genre, introBars, outroBars) => {
      const thresholds = getThresholdProfileForGenre(genre);

      // Build sections: first section of `introBars` bars, last section of `outroBars` bars
      const firstSection = djSectionArbitrary(0, 0, introBars);
      const lastSection = djSectionArbitrary(1, firstSection.endTime, outroBars);
      const sections = [firstSection, lastSection];
      const energyCurve = [2, 2]; // low energy to avoid triggering other issues

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const introIssue = result.find((i) => i.type === "intro-length");

      if (introBars < thresholds.introMinBars) {
        // Issue SHOULD be reported
        expect(introIssue).toBeDefined();
        expect(introIssue!.severity).toBe("warning");
        expect(introIssue!.sectionIds).toContain(firstSection.id);
      } else {
        // Issue should NOT be reported
        expect(introIssue).toBeUndefined();
      }
    },
  );

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 1, max: 63 }), // intro bars
      fc.integer({ min: 1, max: 63 }), // outro bars
    ],
    { numRuns: 100 },
  )(
    "outro-length issue reported when last section bars < genre minimum, not when >=",
    (genre, introBars, outroBars) => {
      const thresholds = getThresholdProfileForGenre(genre);

      // Build sections: first section of `introBars` bars, last section of `outroBars` bars
      const firstSection = djSectionArbitrary(0, 0, introBars);
      const lastSection = djSectionArbitrary(1, firstSection.endTime, outroBars);
      const sections = [firstSection, lastSection];
      const energyCurve = [2, 2]; // low energy to avoid triggering other issues

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const outroIssue = result.find((i) => i.type === "outro-length");

      if (outroBars < thresholds.outroMinBars) {
        // Issue SHOULD be reported
        expect(outroIssue).toBeDefined();
        expect(outroIssue!.severity).toBe("warning");
        expect(outroIssue!.sectionIds).toContain(lastSection.id);
      } else {
        // Issue should NOT be reported
        expect(outroIssue).toBeUndefined();
      }
    },
  );
});

// ─── Property 14: Intro energy detection ────────────────────────────────

// Feature: m3-issue-detection, Property 14: Intro energy detection
describe("Property 14: Intro energy detection", () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any arrangement where the first section's energy score exceeds 4,
   * and the genre is DJ-oriented, the Issue Detector SHALL report an
   * intro-energy issue with "warning" severity.
   */

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 5, max: 10 }), // first section energy > 4
    ],
    { numRuns: 100 },
  )(
    "intro-energy issue reported when first section energy > 4 for DJ genre",
    (genre, firstEnergy) => {
      const thresholds = getThresholdProfileForGenre(genre);

      // Use long enough sections to avoid triggering intro/outro length issues
      const firstSection = djSectionArbitrary(0, 0, 64);
      const lastSection = djSectionArbitrary(1, firstSection.endTime, 64);
      const sections = [firstSection, lastSection];
      const energyCurve = [firstEnergy, 2]; // low last energy to avoid mismatch

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const introEnergyIssue = result.find((i) => i.type === "intro-energy");

      expect(introEnergyIssue).toBeDefined();
      expect(introEnergyIssue!.severity).toBe("warning");
      expect(introEnergyIssue!.sectionIds).toContain(firstSection.id);
    },
  );

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 1, max: 4 }), // first section energy <= 4
    ],
    { numRuns: 100 },
  )(
    "no intro-energy issue when first section energy <= 4 for DJ genre",
    (genre, firstEnergy) => {
      const thresholds = getThresholdProfileForGenre(genre);

      // Use long enough sections to avoid triggering intro/outro length issues
      const firstSection = djSectionArbitrary(0, 0, 64);
      const lastSection = djSectionArbitrary(1, firstSection.endTime, 64);
      const sections = [firstSection, lastSection];
      const energyCurve = [firstEnergy, 2];

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const introEnergyIssue = result.find((i) => i.type === "intro-energy");

      expect(introEnergyIssue).toBeUndefined();
    },
  );
});

// ─── Property 15: Energy mismatch between intro and outro ───────────────

// Feature: m3-issue-detection, Property 15: Energy mismatch between intro and outro
describe("Property 15: Energy mismatch between intro and outro", () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any arrangement with 2 or more sections where the last section's
   * energy score is more than 2 points above the first section's energy
   * score, and the genre is DJ-oriented, the Issue Detector SHALL report
   * an energy-mismatch issue with "info" severity.
   */

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 1, max: 4 }), // first energy (keep low to allow room for mismatch)
      fc.integer({ min: 3, max: 6 }), // delta > 2
    ],
    { numRuns: 100 },
  )(
    "energy-mismatch issue reported when last energy > first + 2 for DJ genre",
    (genre, firstEnergy, delta) => {
      // Ensure lastEnergy > firstEnergy + 2
      const lastEnergy = firstEnergy + delta;
      fc.pre(lastEnergy <= 10); // stay in valid range

      const thresholds = getThresholdProfileForGenre(genre);

      // Use long enough sections to avoid triggering length issues
      const firstSection = djSectionArbitrary(0, 0, 64);
      const lastSection = djSectionArbitrary(1, firstSection.endTime, 64);
      const sections = [firstSection, lastSection];
      const energyCurve = [firstEnergy, lastEnergy];

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const mismatchIssue = result.find((i) => i.type === "energy-mismatch");

      expect(mismatchIssue).toBeDefined();
      expect(mismatchIssue!.severity).toBe("info");
      expect(mismatchIssue!.sectionIds).toContain(firstSection.id);
      expect(mismatchIssue!.sectionIds).toContain(lastSection.id);
    },
  );

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 1, max: 10 }), // first energy
      fc.integer({ min: 0, max: 2 }),   // delta (0, 1, or 2 — not more than 2)
    ],
    { numRuns: 100 },
  )(
    "no energy-mismatch issue when last energy <= first + 2 for DJ genre",
    (genre, firstEnergy, delta) => {
      const lastEnergy = firstEnergy + delta;
      fc.pre(lastEnergy <= 10); // stay in valid range

      const thresholds = getThresholdProfileForGenre(genre);

      // Use long enough sections to avoid triggering length issues
      const firstSection = djSectionArbitrary(0, 0, 64);
      const lastSection = djSectionArbitrary(1, firstSection.endTime, 64);
      const sections = [firstSection, lastSection];
      const energyCurve = [firstEnergy, lastEnergy];

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const mismatchIssue = result.find((i) => i.type === "energy-mismatch");

      expect(mismatchIssue).toBeUndefined();
    },
  );

  test.prop(
    [
      djGenreArbitrary,
      fc.integer({ min: 1, max: 10 }), // single section energy
    ],
    { numRuns: 100 },
  )(
    "no energy-mismatch issue when arrangement has fewer than 2 sections",
    (genre, energy) => {
      const thresholds = getThresholdProfileForGenre(genre);

      // Single section — mismatch check requires >= 2
      const firstSection = djSectionArbitrary(0, 0, 64);
      const sections = [firstSection];
      const energyCurve = [energy];

      const result = _detectDJCompatibility(sections, energyCurve, thresholds, genre);
      const mismatchIssue = result.find((i) => i.type === "energy-mismatch");

      expect(mismatchIssue).toBeUndefined();
    },
  );
});


// ─── Property 6: Repetition detected only between adjacent pairs exceeding threshold ───

// Feature: m3-issue-detection, Property 6: Repetition detected only between adjacent pairs exceeding threshold
describe("Property 6: Repetition detected only between adjacent pairs exceeding threshold", () => {
  /**
   * **Validates: Requirements 3.1, 3.5**
   *
   * For any arrangement of sections, repetition issues are reported only for
   * adjacent section pairs (N, N+1) whose Structural_Similarity exceeds the
   * genre-appropriate threshold. Non-adjacent pairs with high similarity do not
   * produce issues.
   */

  /** Genre choices for testing. */
  const REPETITION_TOLERANT_GENRES = ["techno", "ambient-downtempo"];
  const ALL_GENRES = ["techno", "house", "trance", "drum-and-bass", "ambient-downtempo", "pop-electronic"];

  /** Genre threshold lookup (mirrors genre profile detectionThresholds) */
  const GENRE_THRESHOLDS: Record<string, number> = {
    techno: 0.92,
    house: 0.85,
    trance: 0.85,
    "drum-and-bass": 0.85,
    "ambient-downtempo": 0.92,
    "pop-electronic": 0.85,
  };
  const DEFAULT_THRESHOLD = 0.85;

  function getThreshold(genre: string | null): number {
    if (genre === null) return DEFAULT_THRESHOLD;
    return GENRE_THRESHOLDS[genre] ?? DEFAULT_THRESHOLD;
  }

  function getThresholdProfile(genre: string | null) {
    const threshold = getThreshold(genre);
    return {
      flatEnergyDelta: 1,
      repetitionSimilarity: threshold,
      abruptChangeDelta: 5,
      crowdingTrackCount: 3,
      introMinBars: 16,
      outroMinBars: 16,
    };
  }

  /** Generate a genre or null. */
  const genreArbitrary = fc.oneof(
    fc.constant(null as string | null),
    fc.constantFrom(...ALL_GENRES),
  );

  /**
   * Generate a sequence of consecutive sections (2-5).
   * Each section has a unique id and occupies a distinct time range.
   */
  const sectionSequenceArbitrary = (count: number): fc.Arbitrary<Section[]> =>
    fc.tuple(
      fc.integer({ min: 0, max: 100 }), // initial start time
      fc.array(fc.integer({ min: 8, max: 32 }), { minLength: count, maxLength: count }), // section lengths
    ).map(([start, lengths]) => {
      const sections: Section[] = [];
      let currentStart = start;
      for (let i = 0; i < lengths.length; i++) {
        const length = lengths[i]!;
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentStart,
          endTime: currentStart + length,
        });
        currentStart += length;
      }
      return sections;
    });

  /**
   * Generate track clip data that makes a section "active" with a specific set of tracks.
   * Each track has exactly one clip covering the section's time range.
   */
  function makeTrackClipDataForSections(
    sections: Section[],
    trackNamesPerSection: string[][],
  ): TrackClipData[] {
    // Collect all unique track names
    const allTrackNames = new Set<string>();
    for (const names of trackNamesPerSection) {
      for (const name of names) {
        allTrackNames.add(name);
      }
    }

    // For each track, create clips in sections where it's active
    return [...allTrackNames].map((trackName) => {
      const clips: ClipData[] = [];
      for (let i = 0; i < sections.length; i++) {
        if (trackNamesPerSection[i]!.includes(trackName)) {
          clips.push({
            startTime: sections[i]!.startTime,
            endTime: sections[i]!.endTime,
            muted: false,
            hasEnvelopes: false,
          });
        }
      }
      return { trackName, trackType: "midi" as const, clips };
    });
  }

  /**
   * Generate track note data that produces a specific MIDI density for each section.
   * Density = noteCount / (sectionLength / 4). So noteCount = density * (length/4).
   */
  function makeTrackNoteDataForSections(
    sections: Section[],
    densitiesPerSection: number[],
  ): TrackNoteData[] {
    const notes: NoteData[] = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      const density = densitiesPerSection[i]!;
      const sectionLengthInBars = (section.endTime - section.startTime) / 4;
      const noteCount = Math.round(density * sectionLengthInBars);
      for (let n = 0; n < noteCount; n++) {
        const noteStart = section.startTime + (n / Math.max(1, noteCount)) * (section.endTime - section.startTime);
        notes.push({
          pitch: 60,
          startTime: noteStart,
          duration: 0.5,
          velocity: 100,
        });
      }
    }
    return [{ trackName: "Notes Track", notes }];
  }

  /**
   * Build SectionAnalysisState map from sections and automation flags.
   */
  function makeSectionAnalysis(
    sections: Section[],
    automationFlags: boolean[],
  ): ReadonlyMap<string, SectionAnalysisState> {
    const map = new Map<string, SectionAnalysisState>();
    for (let i = 0; i < sections.length; i++) {
      map.set(sections[i]!.id, {
        activeTrackCount: 4,
        midiDensity: 10,
        hasAutomation: automationFlags[i]!,
        energyScore: 5,
      });
    }
    return map;
  }

  test.prop(
    [
      fc.integer({ min: 2, max: 5 }), // section count
      genreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "maximally similar adjacent pairs produce repetition issues",
    (sectionCount, genre) => {

      // Generate sections
      const sections: Section[] = [];
      let currentStart = 0;
      for (let i = 0; i < sectionCount; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentStart,
          endTime: currentStart + 16,
        });
        currentStart += 16;
      }

      // All sections have IDENTICAL tracks → Jaccard = 1.0
      const trackNames = ["Kick", "Bass", "Lead", "Pad"];
      const trackNamesPerSection = sections.map(() => [...trackNames]);
      const trackClipData = makeTrackClipDataForSections(sections, trackNamesPerSection);

      // All sections have same MIDI density → ratio = 1.0
      const densities = sections.map(() => 8);
      const trackNoteData = makeTrackNoteDataForSections(sections, densities);

      // All sections have same automation flag → match = 1.0
      const automationFlags = sections.map(() => true);
      const sectionAnalysis = makeSectionAnalysis(sections, automationFlags);

      const thresholds = getThresholdProfile(genre);

      const issues = _detectRepetition(
        sections,
        sectionAnalysis,
        trackClipData,
        trackNoteData,
        thresholds,
        genre,
      );

      // With similarity = 1.0, ALL adjacent pairs should be flagged
      // (since 1.0 > any threshold)
      const expectedCount = sectionCount - 1;
      expect(issues).toHaveLength(expectedCount);

      // Each issue should reference exactly one adjacent pair
      for (let i = 0; i < issues.length; i++) {
        expect(issues[i]!.sectionIds).toEqual([`section-${i}`, `section-${i + 1}`]);
        expect(issues[i]!.type).toBe("repetition");
      }
    },
  );

  test.prop(
    [
      fc.integer({ min: 3, max: 5 }), // need at least 3 sections to have non-adjacent pairs
      genreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "non-adjacent pairs with high similarity never produce issues",
    (sectionCount, genre) => {

      // Generate sections
      const sections: Section[] = [];
      let currentStart = 0;
      for (let i = 0; i < sectionCount; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentStart,
          endTime: currentStart + 16,
        });
        currentStart += 16;
      }

      // Make alternating patterns: odd sections are completely different from even sections
      // Even: tracks A, B, C — Odd: tracks X, Y, Z
      // This ensures adjacent pairs are DISSIMILAR (Jaccard ≈ 0)
      // but non-adjacent even pairs would be similar (section-0 ~ section-2)
      const evenTracks = ["Kick", "Bass", "Lead", "Pad"];
      const oddTracks = ["Vocal", "Guitar", "Strings", "Brass"];
      const trackNamesPerSection = sections.map((_, i) =>
        i % 2 === 0 ? [...evenTracks] : [...oddTracks],
      );
      const trackClipData = makeTrackClipDataForSections(sections, trackNamesPerSection);

      // Different densities for adjacent, same for non-adjacent
      const densities = sections.map((_, i) => (i % 2 === 0 ? 8 : 2));
      const trackNoteData = makeTrackNoteDataForSections(sections, densities);

      // Different automation for adjacent
      const automationFlags = sections.map((_, i) => i % 2 === 0);
      const sectionAnalysis = makeSectionAnalysis(sections, automationFlags);

      const thresholds = getThresholdProfile(genre);

      const issues = _detectRepetition(
        sections,
        sectionAnalysis,
        trackClipData,
        trackNoteData,
        thresholds,
        genre,
      );

      // Verify no issue EVER references non-adjacent section IDs
      for (const issue of issues) {
        expect(issue.sectionIds).toHaveLength(2);
        const idx0 = parseInt(issue.sectionIds[0]!.replace("section-", ""), 10);
        const idx1 = parseInt(issue.sectionIds[1]!.replace("section-", ""), 10);
        // Must be adjacent: difference of exactly 1
        expect(idx1 - idx0).toBe(1);
      }

      // Additionally, since adjacent pairs are maximally dissimilar,
      // expect no issues (Jaccard = 0, density ratio = 2/8 = 0.25, automation = 0)
      // similarity = 0.4*0 + 0.35*0.25 + 0.25*0 = 0.0875, well below any threshold
      expect(issues).toHaveLength(0);
    },
  );

  test.prop(
    [
      genreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "severity is 'info' for Techno/Ambient, 'warning' for all other genres",
    (genre) => {

      // Create 2 maximally similar sections (similarity = 1.0)
      const sections: Section[] = [
        { id: "section-0", name: "Section A", startTime: 0, endTime: 16 },
        { id: "section-1", name: "Section B", startTime: 16, endTime: 32 },
      ];

      const trackNames = ["Kick", "Bass", "Lead"];
      const trackNamesPerSection = [trackNames, trackNames];
      const trackClipData = makeTrackClipDataForSections(sections, trackNamesPerSection);

      const densities = [8, 8];
      const trackNoteData = makeTrackNoteDataForSections(sections, densities);

      const automationFlags = [true, true];
      const sectionAnalysis = makeSectionAnalysis(sections, automationFlags);

      const thresholds = getThresholdProfile(genre);

      const issues = _detectRepetition(
        sections,
        sectionAnalysis,
        trackClipData,
        trackNoteData,
        thresholds,
        genre,
      );

      // Should produce exactly one issue (similarity = 1.0 > any threshold)
      expect(issues).toHaveLength(1);

      const issue = issues[0]!;
      if (genre !== null && REPETITION_TOLERANT_GENRES.includes(genre)) {
        expect(issue.severity).toBe("info");
      } else {
        expect(issue.severity).toBe("warning");
      }
    },
  );

  test.prop(
    [
      fc.integer({ min: 2, max: 5 }),
      genreArbitrary,
    ],
    { numRuns: 100 },
  )(
    "pairs below threshold do not produce issues",
    (sectionCount, genre) => {

      // Generate sections
      const sections: Section[] = [];
      let currentStart = 0;
      for (let i = 0; i < sectionCount; i++) {
        sections.push({
          id: `section-${i}`,
          name: `Section ${i}`,
          startTime: currentStart,
          endTime: currentStart + 16,
        });
        currentStart += 16;
      }

      // Each section has UNIQUE tracks → Jaccard = 0 for all pairs
      const trackNamesPerSection = sections.map((_, i) => [`UniqueTrack_${i}`]);
      const trackClipData = makeTrackClipDataForSections(sections, trackNamesPerSection);

      // Very different densities for adjacent pairs → ratio ≈ 0
      const densities = sections.map((_, i) => (i === 0 ? 1 : 100));
      const trackNoteData = makeTrackNoteDataForSections(sections, densities);

      // Alternating automation → match = 0 for adjacent
      const automationFlags = sections.map((_, i) => i % 2 === 0);
      const sectionAnalysis = makeSectionAnalysis(sections, automationFlags);

      const thresholds = getThresholdProfile(genre);

      const issues = _detectRepetition(
        sections,
        sectionAnalysis,
        trackClipData,
        trackNoteData,
        thresholds,
        genre,
      );

      // With Jaccard = 0, density ratio near 0, automation mismatch:
      // similarity ≈ 0 which is below any threshold
      expect(issues).toHaveLength(0);
    },
  );
});

// ─── Frequency Crowding Detection Properties ────────────────────────────────

import { _detectFrequencyCrowding } from "../../../src/core/issue-detector.js";
import type { FrequencyBucket } from "../../../src/core/track-categorizer.js";

/** Valid frequency buckets excluding "full" (these are subject to crowding). */
const CROWDABLE_BUCKETS: FrequencyBucket[] = ["sub", "bass", "low-mid", "mid", "high-mid", "high"];

/**
 * Generate N tracks all assigned to the same frequency bucket, each with a clip
 * that overlaps the section's time range.
 */
function makeTracksInBucket(
  count: number,
  bucket: FrequencyBucket,
  sectionStart: number,
  sectionEnd: number,
): { trackClipData: TrackClipData[]; trackBuckets: FrequencyBucket[] } {
  const trackClipData: TrackClipData[] = [];
  const trackBuckets: FrequencyBucket[] = [];

  for (let i = 0; i < count; i++) {
    trackClipData.push({
      trackName: `Track ${bucket} ${i}`,
      trackType: "midi",
      clips: [{
        startTime: sectionStart,
        endTime: sectionEnd,
        muted: false,
        hasEnvelopes: false,
      }],
    });
    trackBuckets.push(bucket);
  }

  return { trackClipData, trackBuckets };
}

// Feature: m3-issue-detection, Property 10: Frequency crowding severity by track count per bucket
describe("Property 10: Frequency crowding severity by track count per bucket", () => {
  /**
   * **Validates: Requirements 5.1, 5.4, 5.5**
   *
   * For any section and frequency bucket (excluding "full"), if 4 tracks occupy
   * that bucket then an "info" issue is reported, if 5 or more tracks occupy that
   * bucket then a "warning" issue is reported, and if 3 or fewer tracks occupy
   * that bucket then no crowding issue is reported for that bucket.
   */

  test.prop(
    [
      fc.integer({ min: 3, max: 7 }),           // trackCount
      fc.constantFrom(...CROWDABLE_BUCKETS),    // bucket
      fc.integer({ min: 0, max: 500 }),         // sectionStart
      fc.integer({ min: 8, max: 64 }),          // sectionLength
    ],
    { numRuns: 100 },
  )(
    "reports correct severity based on track count: <=3 → none, 4 → info, 5+ → warning",
    (trackCount, bucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      // Use two sections: the tested section has lower energy than the second,
      // ensuring it is NOT considered a "drop" (not the highest energy).
      const section: Section = {
        id: "section-0",
        name: "Verse",
        startTime: sectionStart,
        endTime: sectionEnd,
      };
      const dummySection: Section = {
        id: "section-1",
        name: "Chorus",
        startTime: sectionEnd,
        endTime: sectionEnd + 16,
      };

      const { trackClipData, trackBuckets } = makeTracksInBucket(
        trackCount,
        bucket,
        sectionStart,
        sectionEnd,
      );

      // First section energy is lower than second → first is NOT the max
      const energyCurve = [3, 8];

      const result = _detectFrequencyCrowding([section, dummySection], trackClipData, trackBuckets, energyCurve);

      // Filter to only issues for our test section
      const sectionIssues = result.filter((i) => i.sectionIds.includes(section.id));

      if (trackCount <= 3) {
        // No crowding issue
        expect(sectionIssues).toHaveLength(0);
      } else if (trackCount === 4) {
        // "info" severity
        expect(sectionIssues).toHaveLength(1);
        expect(sectionIssues[0]!.type).toBe("frequency-crowding");
        expect(sectionIssues[0]!.severity).toBe("info");
        expect(sectionIssues[0]!.sectionIds).toContain(section.id);
      } else {
        // trackCount >= 5 → "warning" severity
        expect(sectionIssues).toHaveLength(1);
        expect(sectionIssues[0]!.type).toBe("frequency-crowding");
        expect(sectionIssues[0]!.severity).toBe("warning");
        expect(sectionIssues[0]!.sectionIds).toContain(section.id);
      }
    },
  );

  test.prop(
    [
      fc.constantFrom(...CROWDABLE_BUCKETS),
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 8, max: 64 }),
    ],
    { numRuns: 100 },
  )(
    "no issue for exactly 3 tracks in a bucket (boundary)",
    (bucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      const section: Section = {
        id: "section-0",
        name: "Verse",
        startTime: sectionStart,
        endTime: sectionEnd,
      };
      const dummySection: Section = {
        id: "section-1",
        name: "Chorus",
        startTime: sectionEnd,
        endTime: sectionEnd + 16,
      };

      const { trackClipData, trackBuckets } = makeTracksInBucket(3, bucket, sectionStart, sectionEnd);
      // Ensure section-0 is NOT the highest energy
      const energyCurve = [3, 8];

      const result = _detectFrequencyCrowding([section, dummySection], trackClipData, trackBuckets, energyCurve);
      const sectionIssues = result.filter((i) => i.sectionIds.includes(section.id));
      expect(sectionIssues).toHaveLength(0);
    },
  );
});

// Feature: m3-issue-detection, Property 11: Drop sections raise crowding threshold by 1
describe("Property 11: Drop sections raise crowding threshold by 1", () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * For any section that is labeled as a drop or has the highest energy score,
   * the crowding threshold is raised by 1 track: 4 tracks are tolerated,
   * 5 triggers "info", and 6+ triggers "warning".
   */

  test.prop(
    [
      fc.integer({ min: 4, max: 7 }),           // trackCount
      fc.constantFrom(...CROWDABLE_BUCKETS),    // bucket
      fc.integer({ min: 0, max: 500 }),         // sectionStart
      fc.integer({ min: 8, max: 64 }),          // sectionLength
    ],
    { numRuns: 100 },
  )(
    "drop section by name: 4 → none, 5 → info, 6+ → warning",
    (trackCount, bucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      const section: Section = {
        id: "section-drop",
        name: "Drop 1", // Contains "Drop" (case-insensitive)
        startTime: sectionStart,
        endTime: sectionEnd,
      };

      const { trackClipData, trackBuckets } = makeTracksInBucket(
        trackCount,
        bucket,
        sectionStart,
        sectionEnd,
      );

      // Non-max energy so detection is based on name only
      const energyCurve = [5];

      const result = _detectFrequencyCrowding([section], trackClipData, trackBuckets, energyCurve);

      if (trackCount <= 4) {
        // No issue (threshold raised by 1)
        expect(result).toHaveLength(0);
      } else if (trackCount === 5) {
        // "info" severity (raised threshold)
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe("frequency-crowding");
        expect(result[0]!.severity).toBe("info");
      } else {
        // trackCount >= 6 → "warning" severity
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe("frequency-crowding");
        expect(result[0]!.severity).toBe("warning");
      }
    },
  );

  test.prop(
    [
      fc.integer({ min: 4, max: 7 }),           // trackCount
      fc.constantFrom(...CROWDABLE_BUCKETS),    // bucket
      fc.integer({ min: 0, max: 500 }),         // sectionStart
      fc.integer({ min: 8, max: 64 }),          // sectionLength
    ],
    { numRuns: 100 },
  )(
    "drop section by highest energy: threshold raised by 1",
    (trackCount, bucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      const section: Section = {
        id: "section-0",
        name: "Main Section", // Not a drop name — detection via energy
        startTime: sectionStart,
        endTime: sectionEnd,
      };

      const { trackClipData, trackBuckets } = makeTracksInBucket(
        trackCount,
        bucket,
        sectionStart,
        sectionEnd,
      );

      // Highest energy score (10) triggers drop detection
      const energyCurve = [10];

      const result = _detectFrequencyCrowding([section], trackClipData, trackBuckets, energyCurve);

      if (trackCount <= 4) {
        expect(result).toHaveLength(0);
      } else if (trackCount === 5) {
        expect(result).toHaveLength(1);
        expect(result[0]!.severity).toBe("info");
      } else {
        expect(result).toHaveLength(1);
        expect(result[0]!.severity).toBe("warning");
      }
    },
  );

  test.prop(
    [
      fc.integer({ min: 4, max: 7 }),
      fc.constantFrom(...CROWDABLE_BUCKETS),
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 8, max: 64 }),
    ],
    { numRuns: 100 },
  )(
    "multi-section arrangement: section with highest energy gets raised threshold",
    (trackCount, bucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      // Two sections: first is low energy, second is max energy
      const sections: Section[] = [
        { id: "section-0", name: "Intro", startTime: 0, endTime: sectionStart > 0 ? sectionStart : 16 },
        { id: "section-1", name: "Peak", startTime: sectionStart > 0 ? sectionStart : 16, endTime: (sectionStart > 0 ? sectionStart : 16) + sectionLength },
      ];

      // Put tracks in second section only
      const actualStart = sections[1]!.startTime;
      const actualEnd = sections[1]!.endTime;
      const { trackClipData, trackBuckets } = makeTracksInBucket(
        trackCount,
        bucket,
        actualStart,
        actualEnd,
      );

      // Second section has highest energy
      const energyCurve = [3, 8];

      const result = _detectFrequencyCrowding(sections, trackClipData, trackBuckets, energyCurve);

      // Only the second section (highest energy) should get raised threshold
      const secondSectionIssues = result.filter((i) => i.sectionIds.includes("section-1"));

      if (trackCount <= 4) {
        expect(secondSectionIssues).toHaveLength(0);
      } else if (trackCount === 5) {
        expect(secondSectionIssues).toHaveLength(1);
        expect(secondSectionIssues[0]!.severity).toBe("info");
      } else {
        expect(secondSectionIssues).toHaveLength(1);
        expect(secondSectionIssues[0]!.severity).toBe("warning");
      }
    },
  );
});

// Feature: m3-issue-detection, Property 12: Full-bucket tracks excluded from crowding calculations
describe("Property 12: Full-bucket tracks excluded from crowding calculations", () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any section, tracks assigned to the "full" frequency bucket or tracks
   * with no bucket assignment SHALL NOT count toward the crowding total of any
   * specific frequency bucket.
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 3 }),           // countInBucket (below threshold)
      fc.integer({ min: 1, max: 5 }),           // fullBucketTracks
      fc.constantFrom(...CROWDABLE_BUCKETS),    // target bucket
      fc.integer({ min: 0, max: 500 }),         // sectionStart
      fc.integer({ min: 8, max: 64 }),          // sectionLength
    ],
    { numRuns: 100 },
  )(
    "tracks with 'full' bucket do not count toward any specific bucket's crowding",
    (countInBucket, fullBucketCount, targetBucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      const section: Section = {
        id: "section-0",
        name: "Verse",
        startTime: sectionStart,
        endTime: sectionEnd,
      };
      const dummySection: Section = {
        id: "section-1",
        name: "Chorus",
        startTime: sectionEnd,
        endTime: sectionEnd + 16,
      };

      // Create tracks in the target bucket (below threshold)
      const { trackClipData: targetTracks, trackBuckets: targetBuckets } = makeTracksInBucket(
        countInBucket,
        targetBucket,
        sectionStart,
        sectionEnd,
      );

      // Create additional tracks with "full" bucket
      const fullTracks: TrackClipData[] = [];
      const fullBuckets: FrequencyBucket[] = [];
      for (let i = 0; i < fullBucketCount; i++) {
        fullTracks.push({
          trackName: `Full Track ${i}`,
          trackType: "audio",
          clips: [{
            startTime: sectionStart,
            endTime: sectionEnd,
            muted: false,
            hasEnvelopes: false,
          }],
        });
        fullBuckets.push("full");
      }

      // Combine all tracks
      const trackClipData = [...targetTracks, ...fullTracks];
      const trackBuckets: FrequencyBucket[] = [...targetBuckets, ...fullBuckets];
      // Ensure section-0 is NOT the max energy
      const energyCurve = [3, 8];

      const result = _detectFrequencyCrowding([section, dummySection], trackClipData, trackBuckets, energyCurve);
      const sectionIssues = result.filter((i) => i.sectionIds.includes(section.id));

      // Even though total active tracks may be > 4, crowding should only consider
      // the countInBucket tracks (which is <= 3), so no issue should be reported
      expect(sectionIssues).toHaveLength(0);
    },
  );

  test.prop(
    [
      fc.integer({ min: 1, max: 3 }),           // countInBucket (below threshold)
      fc.integer({ min: 1, max: 5 }),           // unassigned tracks
      fc.constantFrom(...CROWDABLE_BUCKETS),    // target bucket
      fc.integer({ min: 0, max: 500 }),         // sectionStart
      fc.integer({ min: 8, max: 64 }),          // sectionLength
    ],
    { numRuns: 100 },
  )(
    "tracks with no bucket assignment (undefined) do not count toward crowding",
    (countInBucket, unassignedCount, targetBucket, sectionStart, sectionLength) => {
      const sectionEnd = sectionStart + sectionLength;
      const section: Section = {
        id: "section-0",
        name: "Verse",
        startTime: sectionStart,
        endTime: sectionEnd,
      };
      const dummySection: Section = {
        id: "section-1",
        name: "Chorus",
        startTime: sectionEnd,
        endTime: sectionEnd + 16,
      };

      // Create tracks in the target bucket (below threshold)
      const { trackClipData: targetTracks, trackBuckets: targetBuckets } = makeTracksInBucket(
        countInBucket,
        targetBucket,
        sectionStart,
        sectionEnd,
      );

      // Create additional tracks with no bucket assignment (undefined cast to FrequencyBucket)
      const unassignedTracks: TrackClipData[] = [];
      const unassignedBuckets: (FrequencyBucket | undefined)[] = [];
      for (let i = 0; i < unassignedCount; i++) {
        unassignedTracks.push({
          trackName: `Unassigned Track ${i}`,
          trackType: "audio",
          clips: [{
            startTime: sectionStart,
            endTime: sectionEnd,
            muted: false,
            hasEnvelopes: false,
          }],
        });
        unassignedBuckets.push(undefined);
      }

      // Combine all tracks
      const trackClipData = [...targetTracks, ...unassignedTracks];
      const trackBuckets = [...targetBuckets, ...unassignedBuckets] as FrequencyBucket[];
      // Ensure section-0 is NOT the max energy
      const energyCurve = [3, 8];

      const result = _detectFrequencyCrowding([section, dummySection], trackClipData, trackBuckets, energyCurve);
      const sectionIssues = result.filter((i) => i.sectionIds.includes(section.id));

      // Only countInBucket tracks should be counted (<=3), so no issue
      expect(sectionIssues).toHaveLength(0);
    },
  );

  test.prop(
    [
      fc.constantFrom(...CROWDABLE_BUCKETS),
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 8, max: 64 }),
      fc.integer({ min: 1, max: 5 }),           // extra full tracks to add
    ],
    { numRuns: 100 },
  )(
    "adding full-bucket tracks to a crowded bucket does NOT change the severity",
    (bucket, sectionStart, sectionLength, fullCount) => {
      const sectionEnd = sectionStart + sectionLength;
      const section: Section = {
        id: "section-0",
        name: "Verse",
        startTime: sectionStart,
        endTime: sectionEnd,
      };
      // Add a second section with higher energy so section-0 is NOT detected as drop
      const dummySection: Section = {
        id: "section-1",
        name: "Chorus",
        startTime: sectionEnd,
        endTime: sectionEnd + 16,
      };

      // Create exactly 4 tracks in the bucket (info threshold for non-drop sections)
      const { trackClipData: baseTracks, trackBuckets: baseBuckets } = makeTracksInBucket(
        4,
        bucket,
        sectionStart,
        sectionEnd,
      );

      // Ensure section-0 is NOT the max energy
      const energyCurve = [3, 8];

      // Run without full tracks
      const baseResult = _detectFrequencyCrowding([section, dummySection], baseTracks, baseBuckets, energyCurve);
      const baseIssues = baseResult.filter((i) => i.sectionIds.includes(section.id));
      expect(baseIssues).toHaveLength(1);
      expect(baseIssues[0]!.severity).toBe("info");

      // Now add full-bucket tracks
      const fullTracks: TrackClipData[] = [];
      const fullBuckets: FrequencyBucket[] = [];
      for (let i = 0; i < fullCount; i++) {
        fullTracks.push({
          trackName: `Full Range ${i}`,
          trackType: "audio",
          clips: [{
            startTime: sectionStart,
            endTime: sectionEnd,
            muted: false,
            hasEnvelopes: false,
          }],
        });
        fullBuckets.push("full");
      }

      const allTracks = [...baseTracks, ...fullTracks];
      const allBuckets: FrequencyBucket[] = [...baseBuckets, ...fullBuckets];

      const withFullResult = _detectFrequencyCrowding([section, dummySection], allTracks, allBuckets, energyCurve);
      const withFullIssues = withFullResult.filter((i) => i.sectionIds.includes(section.id));

      // Severity should remain "info" — full tracks don't increase count
      expect(withFullIssues).toHaveLength(1);
      expect(withFullIssues[0]!.severity).toBe("info");
    },
  );
});

// ─── Property 7: Abrupt change detection with drop suppression ──────────────

// Feature: m3-issue-detection, Property 7: Abrupt change detection with drop suppression
describe("Property 7: Abrupt change detection with drop suppression", () => {
  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * For any pair of consecutive sections with absolute energy delta >= 5 and
   * no buildup context, an abrupt-change issue is reported — UNLESS the energy
   * increases into a section named "Drop"/"Main"/"Peak" and the genre is
   * Techno, House, Trance, or Drum and Bass, in which case the issue is suppressed.
   */

  /** Genres where drop suppression applies. */
  const DROP_SUPPRESSION_GENRES = ["techno", "house", "trance", "drum-and-bass"];

  /** Non-drop section names that won't accidentally match "drop", "main", or "peak". */
  const nonDropSectionNameArbitrary = fc.constantFrom(
    "Intro", "Verse", "Chorus", "Bridge", "Outro", "Break", "Buildup", "Ambient",
  );

  /** Section names that qualify for drop suppression (case-insensitive). */
  const dropSectionNameArbitrary = fc.constantFrom(
    "Drop", "Main", "Peak", "Big Drop", "Main Section", "Peak Energy",
    "drop", "MAIN", "peak time",
  );

  /** Non-drop-suppression genres. */
  const nonDropGenreArbitrary = fc.constantFrom("Pop", "Ambient", null);

  /** Drop suppression genres. */
  const dropGenreArbitrary = fc.constantFrom(...DROP_SUPPRESSION_GENRES);

  test.prop(
    [
      sectionPairArbitrary,
      // Energy delta >= 5 (both directions)
      fc.integer({ min: 5, max: 9 }),
      fc.boolean(), // direction: true = up, false = down
      fc.constantFrom("Pop", "Ambient", "Techno", "House", null),
    ],
    { numRuns: 100 },
  )(
    "abrupt-change issue reported when delta >= 5, no buildup, and no drop suppression applies",
    ([sectionA, sectionB], delta, isUpward, genre) => {
      // Construct energy values
      let energyA: number;
      let energyB: number;
      if (isUpward) {
        energyA = 1;
        energyB = 1 + delta;
      } else {
        energyA = 1 + delta;
        energyB = 1;
      }
      fc.pre(energyA >= 1 && energyA <= 10 && energyB >= 1 && energyB <= 10);

      // Section names that DON'T trigger drop suppression
      const sections: Section[] = [
        { ...sectionA, name: "Intro" },
        { ...sectionB, name: "Verse" },
      ];
      const energyCurve = [energyA, energyB];

      // No clips or notes → no buildup context
      const result = _detectAbruptChanges(sections, energyCurve, [], [], genre, 5);

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("abrupt-change");
      expect(result[0]!.severity).toBe("warning");
      expect(result[0]!.sectionIds).toEqual([sections[0]!.id, sections[1]!.id]);
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 1, max: 4 }), // delta below threshold
      fc.boolean(),
    ],
    { numRuns: 100 },
  )(
    "no issue when delta < 5 (below abruptChangeDelta threshold)",
    ([sectionA, sectionB], delta, isUpward) => {
      let energyA: number;
      let energyB: number;
      if (isUpward) {
        energyA = 1;
        energyB = 1 + delta;
      } else {
        energyA = 1 + delta;
        energyB = 1;
      }
      fc.pre(energyA >= 1 && energyA <= 10 && energyB >= 1 && energyB <= 10);

      const sections: Section[] = [
        { ...sectionA, name: "Intro" },
        { ...sectionB, name: "Verse" },
      ];
      const energyCurve = [energyA, energyB];

      const result = _detectAbruptChanges(sections, energyCurve, [], [], null, 5);

      expect(result).toHaveLength(0);
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 5, max: 9 }),
      dropGenreArbitrary,
      dropSectionNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "issue suppressed when energy INCREASES into a drop/main/peak section in a drop-suppression genre",
    ([sectionA, sectionB], delta, genre, dropName) => {
      // Energy must increase into the following section for suppression
      const energyA = 1;
      const energyB = 1 + delta;
      fc.pre(energyB <= 10);

      const sections: Section[] = [
        { ...sectionA, name: "Buildup" },
        { ...sectionB, name: dropName },
      ];
      const energyCurve = [energyA, energyB];

      // No buildup context (empty clips/notes)
      const result = _detectAbruptChanges(sections, energyCurve, [], [], genre, 5);

      // Issue should be suppressed
      expect(result).toHaveLength(0);
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 5, max: 9 }),
      dropGenreArbitrary,
      dropSectionNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "issue NOT suppressed when energy DECREASES into drop/main/peak (only increases are suppressed)",
    ([sectionA, sectionB], delta, genre, dropName) => {
      // Energy DEcreases into the following section → suppression does NOT apply
      const energyA = 1 + delta;
      const energyB = 1;
      fc.pre(energyA <= 10);

      const sections: Section[] = [
        { ...sectionA, name: "Peak" },
        { ...sectionB, name: dropName },
      ];
      const energyCurve = [energyA, energyB];

      const result = _detectAbruptChanges(sections, energyCurve, [], [], genre, 5);

      // Issue should still be reported (decrease, not increase)
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("abrupt-change");
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 5, max: 9 }),
      nonDropGenreArbitrary,
      dropSectionNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "issue NOT suppressed for non-drop-suppression genres even when section name matches",
    ([sectionA, sectionB], delta, genre, dropName) => {
      // Energy increases into a "Drop" named section, but genre is not in suppression list
      const energyA = 1;
      const energyB = 1 + delta;
      fc.pre(energyB <= 10);

      const sections: Section[] = [
        { ...sectionA, name: "Buildup" },
        { ...sectionB, name: dropName },
      ];
      const energyCurve = [energyA, energyB];

      const result = _detectAbruptChanges(sections, energyCurve, [], [], genre, 5);

      // Issue should be reported (non-drop-suppression genre)
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("abrupt-change");
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 5, max: 9 }),
      dropGenreArbitrary,
      nonDropSectionNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "issue NOT suppressed when section name does not match drop/main/peak",
    ([sectionA, sectionB], delta, genre, nonDropName) => {
      // Energy increases, correct genre, but section name doesn't match
      const energyA = 1;
      const energyB = 1 + delta;
      fc.pre(energyB <= 10);

      const sections: Section[] = [
        { ...sectionA, name: "Intro" },
        { ...sectionB, name: nonDropName },
      ];
      const energyCurve = [energyA, energyB];

      const result = _detectAbruptChanges(sections, energyCurve, [], [], genre, 5);

      // Issue should be reported (name doesn't match drop/main/peak)
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("abrupt-change");
    },
  );
});

// ─── Property 8: Abrupt change message contains both energy scores ──────────

// Feature: m3-issue-detection, Property 8: Abrupt change message contains both energy scores
describe("Property 8: Abrupt change message contains both energy scores", () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * For any abrupt-change issue produced by the detector, the message string
   * SHALL contain the numeric energy scores of both the preceding and following
   * sections.
   */

  test.prop(
    [
      sectionPairArbitrary,
      fc.integer({ min: 5, max: 9 }),
      fc.boolean(), // direction
    ],
    { numRuns: 100 },
  )(
    "message contains both the preceding and following energy scores as strings",
    ([sectionA, sectionB], delta, isUpward) => {
      let energyA: number;
      let energyB: number;
      if (isUpward) {
        energyA = 1;
        energyB = 1 + delta;
      } else {
        energyA = 1 + delta;
        energyB = 1;
      }
      fc.pre(energyA >= 1 && energyA <= 10 && energyB >= 1 && energyB <= 10);

      const sections: Section[] = [
        { ...sectionA, name: "Section A" },
        { ...sectionB, name: "Section B" },
      ];
      const energyCurve = [energyA, energyB];

      // No buildup context, no drop suppression
      const result = _detectAbruptChanges(sections, energyCurve, [], [], null, 5);

      expect(result).toHaveLength(1);
      const issue = result[0]!;
      expect(issue.type).toBe("abrupt-change");

      // Message must contain both energy scores as numeric strings
      expect(issue.message).toContain(String(energyA));
      expect(issue.message).toContain(String(energyB));
    },
  );

  test.prop(
    [
      sectionPairArbitrary,
      energyValueArbitrary,
      energyValueArbitrary,
    ],
    { numRuns: 100 },
  )(
    "for any reported abrupt-change issue, message always includes both scores",
    ([sectionA, sectionB], energyA, energyB) => {
      const delta = Math.abs(energyA - energyB);
      fc.pre(delta >= 5);

      const sections: Section[] = [
        { ...sectionA, name: "Part 1" },
        { ...sectionB, name: "Part 2" },
      ];
      const energyCurve = [energyA, energyB];

      const result = _detectAbruptChanges(sections, energyCurve, [], [], null, 5);

      expect(result).toHaveLength(1);
      const issue = result[0]!;

      // Both scores must appear in the message
      expect(issue.message).toContain(String(energyA));
      expect(issue.message).toContain(String(energyB));
    },
  );
});

// ─── Property 9: Buildup context detected when any indicator is present ─────

// Feature: m3-issue-detection, Property 9: Buildup context detected when any indicator is present
describe("Property 9: Buildup context detected when any indicator is present", () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For any section boundary, buildup context is considered present when at
   * least one of: a riser/sweep element, clip with hasEnvelopes, or a
   * percussion roll at >= 4 notes/bar density. Any single indicator is sufficient.
   */

  /** Buildup keywords for riser/sweep tracks. */
  const BUILDUP_KEYWORDS = ["riser", "sweep"];

  /** Generate a non-buildup track name that won't match riser/sweep keywords. */
  const nonBuildupTrackNameArbitrary = fc.constantFrom(
    "Kick", "Snare", "Hi Hat", "Bass", "Lead", "Pad", "Vocal", "Clap",
  );

  /** Generate a buildup track name (contains riser or sweep). */
  const buildupTrackNameArbitrary = fc.tuple(
    fc.constantFrom(...BUILDUP_KEYWORDS),
    fc.constantFrom("", " FX", " Main", " 2", " Lead"),
  ).map(([keyword, suffix]) => `${keyword}${suffix}`);

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),   // windowStart
      fc.integer({ min: 4, max: 32 }),    // window length
      buildupTrackNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "returns true when a clip on a riser/sweep track overlaps the window (indicator a)",
    (windowStart, windowLength, trackName) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      const trackClipData: TrackClipData[] = [{
        trackName,
        trackType: "audio",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      const result = _hasBuildupContext(windowStart, windowEnd, trackClipData, []);
      expect(result).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      nonBuildupTrackNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "returns true when a clip with hasEnvelopes overlaps the window (indicator b)",
    (windowStart, windowLength, trackName) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;

      const trackClipData: TrackClipData[] = [{
        trackName,
        trackType: "midi",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: true,
        }],
      }];

      const result = _hasBuildupContext(windowStart, windowEnd, trackClipData, []);
      expect(result).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      nonBuildupTrackNameArbitrary,
      // Notes per bar density >= 4 (the threshold)
      fc.integer({ min: 4, max: 32 }),
    ],
    { numRuns: 100 },
  )(
    "returns true when percussion roll with >= 4 notes/bar density is present (indicator c)",
    (windowStart, windowLength, trackName, notesPerBar) => {
      const windowEnd = windowStart + windowLength;
      const windowLengthInBars = windowLength / 4; // 4 beats per bar

      // Generate enough notes to hit the density threshold
      const totalNotes = Math.ceil(notesPerBar * windowLengthInBars);
      const noteSpacing = windowLength / totalNotes;

      const notes = Array.from({ length: totalNotes }, (_, i) => ({
        pitch: 60,
        startTime: windowStart + i * noteSpacing,
        duration: 0.25,
        velocity: 100,
      }));

      // No clips with buildup indicators (no riser/sweep track, no hasEnvelopes)
      const trackClipData: TrackClipData[] = [];
      const trackNoteData: TrackNoteData[] = [{
        trackName,
        notes,
      }];

      const result = _hasBuildupContext(windowStart, windowEnd, trackClipData, trackNoteData);
      expect(result).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 8, max: 32 }), // At least 2 bars for meaningful density calc
      nonBuildupTrackNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "returns false when no indicators are present (no buildup clips, low note density)",
    (windowStart, windowLength, trackName) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;
      const windowLengthInBars = windowLength / 4;

      // Clip on a non-buildup track without hasEnvelopes
      const trackClipData: TrackClipData[] = [{
        trackName,
        trackType: "midi",
        clips: [{
          startTime: midpoint - 1,
          endTime: midpoint + 1,
          muted: false,
          hasEnvelopes: false,
        }],
      }];

      // Low note density: fewer than 4 notes per bar
      // Use exactly 1 note per bar (well below threshold)
      const totalNotes = Math.floor(windowLengthInBars);
      const notes = Array.from({ length: totalNotes }, (_, i) => ({
        pitch: 60,
        startTime: windowStart + i * 4, // one note per bar
        duration: 0.25,
        velocity: 100,
      })).filter((n) => n.startTime >= windowStart && n.startTime < windowEnd);

      const trackNoteData: TrackNoteData[] = [{
        trackName,
        notes,
      }];

      const result = _hasBuildupContext(windowStart, windowEnd, trackClipData, trackNoteData);
      expect(result).toBe(false);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 4, max: 32 }),
      // Pick which indicators to activate (at least one must be active)
      fc.record({
        hasRiserSweep: fc.boolean(),
        hasEnvelopes: fc.boolean(),
        hasPercussionRoll: fc.boolean(),
      }).filter((r) => r.hasRiserSweep || r.hasEnvelopes || r.hasPercussionRoll),
    ],
    { numRuns: 100 },
  )(
    "any single indicator is sufficient for buildup context detection",
    (windowStart, windowLength, indicators) => {
      const windowEnd = windowStart + windowLength;
      const midpoint = (windowStart + windowEnd) / 2;
      const windowLengthInBars = windowLength / 4;

      const trackClipData: TrackClipData[] = [];
      const trackNoteData: TrackNoteData[] = [];

      // Add riser/sweep clip if indicated
      if (indicators.hasRiserSweep) {
        trackClipData.push({
          trackName: "Riser FX",
          trackType: "audio",
          clips: [{
            startTime: midpoint - 1,
            endTime: midpoint + 1,
            muted: false,
            hasEnvelopes: false,
          }],
        });
      }

      // Add hasEnvelopes clip if indicated
      if (indicators.hasEnvelopes) {
        trackClipData.push({
          trackName: "Lead Synth",
          trackType: "midi",
          clips: [{
            startTime: midpoint - 1,
            endTime: midpoint + 1,
            muted: false,
            hasEnvelopes: true,
          }],
        });
      }

      // Add percussion roll if indicated (>= 4 notes per bar)
      if (indicators.hasPercussionRoll) {
        const notesPerBar = 8; // Well above threshold of 4
        const totalNotes = Math.ceil(notesPerBar * windowLengthInBars);
        const noteSpacing = windowLength / totalNotes;

        trackNoteData.push({
          trackName: "Snare Roll",
          notes: Array.from({ length: totalNotes }, (_, i) => ({
            pitch: 38,
            startTime: windowStart + i * noteSpacing,
            duration: 0.125,
            velocity: 80,
          })),
        });
      }

      const result = _hasBuildupContext(windowStart, windowEnd, trackClipData, trackNoteData);
      expect(result).toBe(true);
    },
  );
});


// ─── Property 16: All issues conform to the Issue interface ─────────────

// Feature: m3-issue-detection, Property 16: All issues conform to the Issue interface

import { detectIssues } from "../../../src/core/issue-detector.js";
import type { IssueDetectorInput } from "../../../src/core/issue-types.js";

/** Valid IssueType values as defined in the spec. */
const VALID_ISSUE_TYPES = [
  "flat-energy",
  "missing-transition",
  "repetition",
  "abrupt-change",
  "frequency-crowding",
  "intro-length",
  "outro-length",
  "intro-energy",
  "energy-mismatch",
] as const;

/** Valid severity values. */
const VALID_SEVERITIES = ["info", "warning", "critical"] as const;

/** All available genres (from genre-registry). */
const GENRES_FOR_GENERATOR = ["Techno", "House", "Trance", "Drum and Bass", "Ambient", "Pop"] as const;

/** Non-"full" frequency buckets for generating track data that can trigger crowding. */
const FREQUENCY_BUCKETS: FrequencyBucket[] = ["sub", "bass", "low-mid", "mid", "high-mid", "high"];

/**
 * Generator for a consistent IssueDetectorInput with:
 * - 1-5 sections with sequential time ranges
 * - Energy curve matching section count
 * - sectionAnalysis map with keys matching section IDs
 * - trackClipData/trackNoteData arrays
 * - trackBuckets matching trackClipData length
 * - Random genre (from GENRES or null)
 */
const issueDetectorInputArbitrary: fc.Arbitrary<IssueDetectorInput> = fc
  .record({
    sectionCount: fc.integer({ min: 1, max: 5 }),
    sectionLengths: fc.array(fc.integer({ min: 4, max: 64 }), { minLength: 5, maxLength: 5 }),
    energyValues: fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 5, maxLength: 5 }),
    trackCount: fc.integer({ min: 0, max: 5 }),
    genre: fc.oneof(
      fc.constantFrom(...GENRES_FOR_GENERATOR),
      fc.constant(null as string | null),
    ),
    // Whether tracks have envelopes (to trigger transition detection)
    trackHasEnvelopes: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
    // Bucket assignments for tracks
    trackBucketValues: fc.array(
      fc.constantFrom(...FREQUENCY_BUCKETS, "full" as FrequencyBucket),
      { minLength: 5, maxLength: 5 },
    ),
    // MIDI density values (notes per section, 0-20)
    midiNoteCounts: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 5, maxLength: 5 }),
    // Whether sections have automation
    hasAutomation: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
    // Track names for variety
    trackNames: fc.array(
      fc.oneof(
        fc.constant("Lead Synth"),
        fc.constant("Kick"),
        fc.constant("Bass"),
        fc.constant("Pad"),
        fc.constant("Hi Hat"),
        fc.constant("Riser FX"),
        fc.constant("Vocal"),
        fc.constant("Piano"),
        fc.constant("Sub Bass"),
        fc.constant("Perc"),
      ),
      { minLength: 5, maxLength: 5 },
    ),
  })
  .map((params) => {
    const { sectionCount, sectionLengths, energyValues, trackCount, genre, trackHasEnvelopes, trackBucketValues, midiNoteCounts, hasAutomation, trackNames } = params;

    // Build sections with sequential, non-overlapping time ranges
    const sections: { id: string; name: string; startTime: number; endTime: number }[] = [];
    let currentTime = 0;
    for (let i = 0; i < sectionCount; i++) {
      const length = sectionLengths[i]! * 4; // convert bars to beats
      sections.push({
        id: `section-${i}`,
        name: `Section ${i}`,
        startTime: currentTime,
        endTime: currentTime + length,
      });
      currentTime += length;
    }

    // Energy curve matches section count
    const energyCurve = energyValues.slice(0, sectionCount);

    // Section analysis map with keys matching section IDs
    const sectionAnalysis = new Map<string, { activeTrackCount: number; midiDensity: number; hasAutomation: boolean; energyScore: number }>();
    for (let i = 0; i < sectionCount; i++) {
      sectionAnalysis.set(sections[i]!.id, {
        activeTrackCount: Math.min(trackCount, 5),
        midiDensity: midiNoteCounts[i]! / Math.max(1, sectionLengths[i]!),
        hasAutomation: hasAutomation[i]!,
        energyScore: energyValues[i]!,
      });
    }

    // Build trackClipData — one clip per track spanning entire arrangement
    const actualTrackCount = Math.min(trackCount, 5);
    const trackClipData: { trackName: string; trackType: "midi" | "audio"; clips: { startTime: number; endTime: number; muted: boolean; hasEnvelopes: boolean }[] }[] = [];
    for (let t = 0; t < actualTrackCount; t++) {
      trackClipData.push({
        trackName: trackNames[t]!,
        trackType: t % 2 === 0 ? "midi" : "audio",
        clips: [{
          startTime: 0,
          endTime: currentTime,
          muted: false,
          hasEnvelopes: trackHasEnvelopes[t]!,
        }],
      });
    }

    // Build trackNoteData with notes distributed across sections
    const trackNoteData: { trackName: string; notes: { pitch: number; startTime: number; duration: number; velocity: number }[] }[] = [];
    for (let t = 0; t < actualTrackCount; t++) {
      const notes: { pitch: number; startTime: number; duration: number; velocity: number }[] = [];
      for (let i = 0; i < sectionCount; i++) {
        const noteCount = midiNoteCounts[i]!;
        const sectionStart = sections[i]!.startTime;
        const sectionEnd = sections[i]!.endTime;
        const sectionLength = sectionEnd - sectionStart;
        for (let n = 0; n < noteCount; n++) {
          notes.push({
            pitch: 60 + (n % 12),
            startTime: sectionStart + (n / Math.max(noteCount, 1)) * sectionLength,
            duration: 0.5,
            velocity: 80,
          });
        }
      }
      trackNoteData.push({
        trackName: trackNames[t]!,
        notes,
      });
    }

    // trackBuckets matches trackClipData length
    const trackBuckets: FrequencyBucket[] = trackBucketValues.slice(0, actualTrackCount);

    // Track inventory for all tracks
    const trackInventory: { name: string; type: "midi" | "audio" }[] = [];
    for (let t = 0; t < actualTrackCount; t++) {
      trackInventory.push({
        name: trackNames[t]!,
        type: t % 2 === 0 ? "midi" : "audio",
      });
    }

    return {
      sections,
      sectionAnalysis,
      energyCurve,
      trackInventory,
      trackClipData,
      trackNoteData,
      trackBuckets,
      selectedGenre: genre,
    } as IssueDetectorInput;
  });

describe("Property 16: All issues conform to the Issue interface", () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.3**
   *
   * For any arrangement state passed to detectIssues, every returned Issue SHALL have:
   * - a non-empty `id` string
   * - a `type` value from the allowed IssueType union
   * - a `severity` value of "info" | "warning" | "critical"
   * - a `sectionIds` array with at least 1 entry where each entry is a valid section ID
   * - a `message` string that is non-empty and at most 200 characters
   */

  test.prop(
    [issueDetectorInputArbitrary],
    { numRuns: 100 },
  )(
    "every issue from detectIssues conforms to the Issue interface constraints",
    (input) => {
      const issues = detectIssues(input);

      // Collect all valid section IDs from the input
      const validSectionIds = new Set(input.sections.map((s) => s.id));

      for (const issue of issues) {
        // id: non-empty string
        expect(typeof issue.id).toBe("string");
        expect(issue.id.length).toBeGreaterThan(0);

        // type: valid IssueType value
        expect(VALID_ISSUE_TYPES).toContain(issue.type);

        // severity: valid IssueSeverity value
        expect(VALID_SEVERITIES).toContain(issue.severity);

        // sectionIds: at least 1 entry, all valid section IDs
        expect(Array.isArray(issue.sectionIds)).toBe(true);
        expect(issue.sectionIds.length).toBeGreaterThanOrEqual(1);
        for (const sectionId of issue.sectionIds) {
          expect(validSectionIds.has(sectionId)).toBe(true);
        }

        // message: non-empty, max 200 characters
        expect(typeof issue.message).toBe("string");
        expect(issue.message.length).toBeGreaterThan(0);
        expect(issue.message.length).toBeLessThanOrEqual(200);
      }
    },
  );
});
