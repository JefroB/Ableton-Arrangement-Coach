/**
 * Property-based tests for the Synth Issue Detection functions.
 *
 * Feature: midi-synth-analysis
 * - Property 17: Synth repetition issue generation
 * - Property 18: Low density issue generation
 * - Property 19: Harmonic-shift transition warning
 * - Property 20: Duplicated role issue
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import {
  _detectSynthRepetition as detectSynthRepetition,
  _detectLowSynthDensity as detectLowSynthDensity,
  _detectHarmonicShiftWithoutTransition as detectHarmonicShiftWithoutTransition,
  _detectDuplicatedRoles as detectDuplicatedRoles,
} from "../../../src/core/issue-detector.js";

import type { Section } from "../../../src/core/section-scanner.js";
import type { SynthAnalysisResult, SynthTrackProfile, SynthDiscontinuity } from "../../../src/core/synth-analysis-types.js";
import type { InstrumentRole } from "../../../src/core/content-analysis-types.js";
import type { TrackClipData } from "../../../src/core/section-analyzer.js";
import type { TrackInfo } from "../../../src/core/track-reader.js";
import type { EffectiveThresholds } from "../../../src/core/issue-detector.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-intro/non-outro section name. */
const nonIntroOutroNameArb = fc.constantFrom(
  "Verse", "Chorus", "Bridge", "Breakdown", "Drop", "Build", "Hook", "Main",
);

/** Generate a section with a specific index and time. */
function sectionArb(index: number, startTime: number, length: number = 16): Section {
  return {
    id: `section-${index}`,
    name: `Section ${index}`,
    startTime,
    endTime: startTime + length,
  };
}

/** Generate an array of sequential sections. */
function makeSections(count: number, sectionLength: number = 16): Section[] {
  return Array.from({ length: count }, (_, i) => sectionArb(i, i * sectionLength, sectionLength));
}

/** Default effective thresholds for testing. */
const DEFAULT_THRESHOLDS: EffectiveThresholds = {
  flatEnergyDelta: 2,
  missingTransitionDelta: 3,
  similarityCeilingPercent: 85,
  introMinBars: 4,
  outroMinBars: 4,
};

/** Roles eligible for synth repetition detection. */
const SYNTH_REPETITION_ROLES: readonly InstrumentRole[] = ["lead", "pad", "arpeggio"];

/** Roles eligible for synth density detection. */
const SYNTH_DENSITY_ROLES: readonly InstrumentRole[] = ["lead", "pad", "arpeggio", "chord"];

/** Roles eligible for duplication detection. */
const DUPLICATED_ROLE_SET: readonly InstrumentRole[] = ["lead", "pad", "arpeggio", "chord"];

/** A minimal SynthTrackProfile with configurable note density. */
function makeProfile(noteDensity: number = 1.0): SynthTrackProfile {
  return {
    pitchContent: { pitchClasses: new Set([0, 4, 7]), pitchRange: 12 },
    noteDensity,
    velocityDynamics: { min: 60, max: 100, mean: 80, stdDev: 10, contour: "flat" as const },
    articulationPattern: { type: "mixed" as const, averageDurationRatio: 0.7 },
    rhythmicRegularity: 0.8,
    polyphonyProfile: { mean: 1.5, max: 3 },
    melodicContour: { shape: "static" as const, segmentMeans: [60, 60, 60, 60] as readonly [number, number, number, number] },
    harmonicIntervalProfile: null,
  };
}

/** Build an empty SynthAnalysisResult. */
function emptySynthResult(): SynthAnalysisResult {
  return {
    perSection: new Map(),
    crossSection: new Map(),
    repetitionFlags: new Map(),
    discontinuities: [],
  };
}

// ─── Property 17: Synth repetition issue generation ────────────────────

// Feature: midi-synth-analysis, Property 17: Synth repetition issue generation
describe("Feature: midi-synth-analysis, Property 17: Synth repetition issue generation", () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * For any synth track with role lead/pad/arpeggio that has
   * `hasExtendedRepetition` true (3+ consecutive similar sections),
   * the issue detector SHALL produce a warning-severity issue identifying
   * the track name and affected section names.
   */

  /** Arbitrary: a synth role eligible for repetition detection. */
  const synthRepRoleArb = fc.constantFrom<InstrumentRole>("lead", "pad", "arpeggio");

  /** Arbitrary: number of sections in the arrangement (4–10). */
  const sectionCountArb = fc.integer({ min: 4, max: 10 });

  /** Arbitrary: contiguous run of 3+ repeated sections within the arrangement. */
  const repetitionRunArb = (sectionCount: number) =>
    fc.integer({ min: 0, max: Math.max(0, sectionCount - 3) }).chain((startIdx) =>
      fc.integer({ min: 3, max: Math.min(sectionCount - startIdx, 8) }).map((runLength) => ({
        startIdx,
        runLength,
        sectionIndices: Array.from({ length: runLength }, (_, i) => startIdx + i),
      })),
    );

  test.prop(
    [
      fc.string({ minLength: 3, maxLength: 15 }).filter((s) => s.trim().length > 0),
      synthRepRoleArb,
      sectionCountArb,
    ],
    { numRuns: 100 },
  )(
    "produces a warning issue for tracks with extended repetition and eligible role",
    (trackName, role, sectionCount) => {
      fc.assert(
        fc.property(repetitionRunArb(sectionCount), ({ sectionIndices }) => {
          const sections = makeSections(sectionCount);
          const trackRoles = new Map<string, InstrumentRole>([[trackName, role]]);

          const synthAnalysis: SynthAnalysisResult = {
            ...emptySynthResult(),
            repetitionFlags: new Map([
              [trackName, { hasExtendedRepetition: true, extendedRepetitionSections: sectionIndices }],
            ]),
          };

          const issues = detectSynthRepetition(synthAnalysis, sections, trackRoles, DEFAULT_THRESHOLDS);

          // Should produce at least one issue
          expect(issues.length).toBeGreaterThanOrEqual(1);

          // The issue should be warning severity
          const issue = issues[0]!;
          expect(issue.severity).toBe("warning");

          // The issue message should contain the track name
          expect(issue.message).toContain(trackName);

          // The sectionIds should reference the affected sections
          expect(issue.sectionIds.length).toBeGreaterThan(0);
          for (const sId of issue.sectionIds) {
            expect(sections.some((s) => s.id === sId)).toBe(true);
          }
        }),
        { numRuns: 50 },
      );
    },
  );

  /** Roles NOT eligible for synth repetition detection. */
  const nonRepRoleArb = fc.constantFrom<InstrumentRole>("drums", "bass", "chord", "unclassified");

  test.prop(
    [
      fc.string({ minLength: 3, maxLength: 15 }).filter((s) => s.trim().length > 0),
      nonRepRoleArb,
      sectionCountArb,
    ],
    { numRuns: 100 },
  )(
    "produces no issue when track role is not lead/pad/arpeggio",
    (trackName, role, sectionCount) => {
      const sections = makeSections(sectionCount);
      const trackRoles = new Map<string, InstrumentRole>([[trackName, role]]);

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        repetitionFlags: new Map([
          [trackName, { hasExtendedRepetition: true, extendedRepetitionSections: [0, 1, 2, 3] }],
        ]),
      };

      const issues = detectSynthRepetition(synthAnalysis, sections, trackRoles, DEFAULT_THRESHOLDS);
      expect(issues.length).toBe(0);
    },
  );

  test.prop(
    [
      fc.string({ minLength: 3, maxLength: 15 }).filter((s) => s.trim().length > 0),
      synthRepRoleArb,
      sectionCountArb,
    ],
    { numRuns: 100 },
  )(
    "produces no issue when hasExtendedRepetition is false",
    (trackName, role, sectionCount) => {
      const sections = makeSections(sectionCount);
      const trackRoles = new Map<string, InstrumentRole>([[trackName, role]]);

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        repetitionFlags: new Map([
          [trackName, { hasExtendedRepetition: false, extendedRepetitionSections: [] }],
        ]),
      };

      const issues = detectSynthRepetition(synthAnalysis, sections, trackRoles, DEFAULT_THRESHOLDS);
      expect(issues.length).toBe(0);
    },
  );
});

// ─── Property 18: Low density issue generation ─────────────────────────

// Feature: midi-synth-analysis, Property 18: Low density issue generation
describe("Feature: midi-synth-analysis, Property 18: Low density issue generation", () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any non-intro/non-outro section where all synth tracks (lead, pad,
   * arpeggio, chord) have a summed note density below the genre-specific
   * threshold (or default 2.0), the issue detector SHALL produce an
   * info-severity issue.
   */

  /** Arbitrary: a non-intro/non-outro section name. */
  const nonIntroOutroSectionNameArb = fc.constantFrom(
    "Verse", "Chorus", "Bridge", "Breakdown", "Drop", "Build", "Hook", "Main",
  );

  /** Arbitrary: role eligible for density check. */
  const densityRoleArb = fc.constantFrom<InstrumentRole>("lead", "pad", "arpeggio", "chord");

  /** Arbitrary: density threshold to use. */
  const thresholdArb = fc.double({ min: 1.0, max: 5.0, noNaN: true, noDefaultInfinity: true });

  test.prop(
    [
      nonIntroOutroSectionNameArb,
      densityRoleArb,
      fc.integer({ min: 1, max: 3 }),
      thresholdArb,
    ],
    { numRuns: 100 },
  )(
    "produces an info issue when summed synth density is below the threshold in non-intro/non-outro section",
    (sectionName, role, trackCount, threshold) => {
      // Each track gets density below threshold/trackCount so sum < threshold
      const perTrackDensity = (threshold - 0.1) / (trackCount + 1);

      const section: Section = { id: "section-0", name: sectionName, startTime: 0, endTime: 16 };
      const sections = [section];

      // Build per-section profiles with low density tracks
      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      for (let i = 0; i < trackCount; i++) {
        const trackName = `synth-${i}`;
        trackProfiles.set(trackName, makeProfile(perTrackDensity));
        trackRoles.set(trackName, role);
      }

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      const issues = detectLowSynthDensity(synthAnalysis, sections, trackRoles, threshold);

      // Should produce at least one issue
      expect(issues.length).toBeGreaterThanOrEqual(1);

      // The issue should be info severity
      const issue = issues[0]!;
      expect(issue.severity).toBe("info");

      // The sectionIds should reference our section
      expect(issue.sectionIds).toContain(section.id);
    },
  );

  test.prop(
    [
      fc.constantFrom("Intro", "intro", "INTRO", "Outro", "outro", "OUTRO", "Intro Build", "Outro Fade"),
      densityRoleArb,
    ],
    { numRuns: 100 },
  )(
    "produces no issue for intro/outro sections even with low density",
    (sectionName, role) => {
      const section: Section = { id: "section-0", name: sectionName, startTime: 0, endTime: 16 };
      const sections = [section];

      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      trackProfiles.set("synth-0", makeProfile(0.1)); // very low density
      trackRoles.set("synth-0", role);

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      const issues = detectLowSynthDensity(synthAnalysis, sections, trackRoles, 2.0);
      expect(issues.length).toBe(0);
    },
  );

  test.prop(
    [
      nonIntroOutroSectionNameArb,
      densityRoleArb,
      fc.double({ min: 2.0, max: 10.0, noNaN: true, noDefaultInfinity: true }),
    ],
    { numRuns: 100 },
  )(
    "produces no issue when summed density meets or exceeds the threshold",
    (sectionName, role, density) => {
      const section: Section = { id: "section-0", name: sectionName, startTime: 0, endTime: 16 };
      const sections = [section];

      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      trackProfiles.set("synth-0", makeProfile(density));
      trackRoles.set("synth-0", role);

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      // Use a threshold at or below the density value
      const issues = detectLowSynthDensity(synthAnalysis, sections, trackRoles, density);
      expect(issues.length).toBe(0);
    },
  );
});

// ─── Property 19: Harmonic-shift transition warning ────────────────────

// Feature: midi-synth-analysis, Property 19: Harmonic-shift transition warning
describe("Feature: midi-synth-analysis, Property 19: Harmonic-shift transition warning", () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any harmonic-shift discontinuity at a section boundary, if no
   * transition element is detected in the last half of the preceding
   * section, the issue detector SHALL produce a warning-severity issue.
   */

  /** Arbitrary: number of harmonic-shift discontinuities (1–4). */
  const discontinuityCountArb = fc.integer({ min: 1, max: 4 });

  /** Arbitrary: track name for the discontinuity. */
  const trackNameArb = fc.string({ minLength: 3, maxLength: 15 }).filter((s) => s.trim().length > 0);

  test.prop(
    [trackNameArb, discontinuityCountArb],
    { numRuns: 100 },
  )(
    "produces a warning issue for harmonic-shift discontinuity with no transition element",
    (trackName, discCount) => {
      const sectionCount = discCount + 1; // need at least N+1 sections for N discontinuities
      const sections = makeSections(sectionCount, 32); // 32 beats per section

      // Create harmonic-shift discontinuities between consecutive sections
      const discontinuities: SynthDiscontinuity[] = [];
      for (let i = 0; i < discCount; i++) {
        discontinuities.push({
          trackName,
          sectionIndexA: i,
          sectionIndexB: i + 1,
          type: "harmonic-shift",
        });
      }

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        discontinuities,
      };

      // Empty trackClipData and trackInventory: ensures no transition element is found
      const trackClipData: TrackClipData[] = [];
      const trackInventory: TrackInfo[] = [];

      const issues = detectHarmonicShiftWithoutTransition(synthAnalysis, sections, trackClipData, trackInventory);

      // Should produce one issue per discontinuity
      expect(issues.length).toBe(discCount);

      for (const issue of issues) {
        // Should be warning severity
        expect(issue.severity).toBe("warning");
        // Should reference section IDs
        expect(issue.sectionIds.length).toBe(2);
      }
    },
  );

  test.prop(
    [trackNameArb],
    { numRuns: 100 },
  )(
    "produces no issue when transition element exists in last half of preceding section",
    (trackName) => {
      const sections = makeSections(2, 32); // 2 sections, 32 beats each

      const discontinuities: SynthDiscontinuity[] = [{
        trackName,
        sectionIndexA: 0,
        sectionIndexB: 1,
        type: "harmonic-shift",
      }];

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        discontinuities,
      };

      // Place a clip with hasEnvelopes in the last half of section 0 (beats 16–32)
      const trackClipData: TrackClipData[] = [{
        trackName: "FX Riser",
        trackType: "audio",
        clips: [{
          startTime: 20,
          endTime: 30,
          muted: false,
          hasEnvelopes: true,
        }],
      }];
      const trackInventory: TrackInfo[] = [];

      const issues = detectHarmonicShiftWithoutTransition(synthAnalysis, sections, trackClipData, trackInventory);
      expect(issues.length).toBe(0);
    },
  );

  test.prop(
    [trackNameArb],
    { numRuns: 100 },
  )(
    "produces no issue for non-harmonic-shift discontinuities (entry/exit)",
    (trackName) => {
      const sections = makeSections(3, 16);

      // Only entry/exit discontinuities, no harmonic-shift
      const discontinuities: SynthDiscontinuity[] = [
        { trackName, sectionIndexA: 0, sectionIndexB: 1, type: "entry" },
        { trackName, sectionIndexA: 1, sectionIndexB: 2, type: "exit" },
      ];

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        discontinuities,
      };

      const trackClipData: TrackClipData[] = [];
      const trackInventory: TrackInfo[] = [];

      const issues = detectHarmonicShiftWithoutTransition(synthAnalysis, sections, trackClipData, trackInventory);
      expect(issues.length).toBe(0);
    },
  );
});

// ─── Property 20: Duplicated role issue ────────────────────────────────

// Feature: midi-synth-analysis, Property 20: Duplicated role issue
describe("Feature: midi-synth-analysis, Property 20: Duplicated role issue", () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any section containing 3 or more tracks with the same InstrumentRole
   * from {lead, pad, arpeggio, chord}, the issue detector SHALL produce an
   * info-severity issue.
   */

  /** Arbitrary: role from the eligible set. */
  const duplicatedRoleArb = fc.constantFrom<InstrumentRole>("lead", "pad", "arpeggio", "chord");

  /** Arbitrary: number of tracks sharing the same role (3–6). */
  const duplicateCountArb = fc.integer({ min: 3, max: 6 });

  test.prop(
    [duplicatedRoleArb, duplicateCountArb],
    { numRuns: 100 },
  )(
    "produces an info issue when 3+ tracks share the same role in a section",
    (role, trackCount) => {
      const section: Section = { id: "section-0", name: "Main", startTime: 0, endTime: 16 };
      const sections = [section];

      // Build per-section profiles: all tracks have the same role
      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      for (let i = 0; i < trackCount; i++) {
        const trackName = `track-${role}-${i}`;
        trackProfiles.set(trackName, makeProfile(1.0));
        trackRoles.set(trackName, role);
      }

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      const issues = detectDuplicatedRoles(synthAnalysis, sections, trackRoles);

      // Should produce at least one issue
      expect(issues.length).toBeGreaterThanOrEqual(1);

      // The issue should be info severity
      const issue = issues[0]!;
      expect(issue.severity).toBe("info");

      // The sectionIds should reference our section
      expect(issue.sectionIds).toContain(section.id);
    },
  );

  test.prop(
    [duplicatedRoleArb, fc.integer({ min: 1, max: 2 })],
    { numRuns: 100 },
  )(
    "produces no issue when fewer than 3 tracks share a role",
    (role, trackCount) => {
      const section: Section = { id: "section-0", name: "Main", startTime: 0, endTime: 16 };
      const sections = [section];

      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      for (let i = 0; i < trackCount; i++) {
        const trackName = `track-${role}-${i}`;
        trackProfiles.set(trackName, makeProfile(1.0));
        trackRoles.set(trackName, role);
      }

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      const issues = detectDuplicatedRoles(synthAnalysis, sections, trackRoles);
      expect(issues.length).toBe(0);
    },
  );

  test.prop(
    [fc.integer({ min: 3, max: 5 })],
    { numRuns: 100 },
  )(
    "produces no issue when tracks have different eligible roles",
    (trackCount) => {
      const section: Section = { id: "section-0", name: "Main", startTime: 0, endTime: 16 };
      const sections = [section];

      // Assign each track a different role from the eligible set
      const roles: InstrumentRole[] = ["lead", "pad", "arpeggio", "chord"];
      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      for (let i = 0; i < trackCount; i++) {
        const trackName = `track-${i}`;
        trackProfiles.set(trackName, makeProfile(1.0));
        trackRoles.set(trackName, roles[i % roles.length]!);
      }

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      const issues = detectDuplicatedRoles(synthAnalysis, sections, trackRoles);
      // With 3–5 tracks each assigned a different role (cycling through 4 roles),
      // no single role can have 3+ tracks (max is 2 when trackCount=5)
      expect(issues.length).toBe(0);
    },
  );

  test.prop(
    [duplicatedRoleArb, duplicateCountArb],
    { numRuns: 100 },
  )(
    "does not flag roles outside the eligible set (drums, bass, unclassified)",
    (_, trackCount) => {
      const section: Section = { id: "section-0", name: "Main", startTime: 0, endTime: 16 };
      const sections = [section];

      // Use a role NOT in the eligible set
      const ineligibleRole: InstrumentRole = "drums";
      const trackProfiles = new Map<string, SynthTrackProfile>();
      const trackRoles = new Map<string, InstrumentRole>();
      for (let i = 0; i < trackCount; i++) {
        const trackName = `drums-track-${i}`;
        trackProfiles.set(trackName, makeProfile(1.0));
        trackRoles.set(trackName, ineligibleRole);
      }

      const synthAnalysis: SynthAnalysisResult = {
        ...emptySynthResult(),
        perSection: new Map([[section.id, trackProfiles]]),
      };

      const issues = detectDuplicatedRoles(synthAnalysis, sections, trackRoles);
      expect(issues.length).toBe(0);
    },
  );
});
