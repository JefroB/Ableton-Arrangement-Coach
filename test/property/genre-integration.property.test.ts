/**
 * Property-based tests for Genre Integration (M6-C).
 *
 * Feature: m6-genre-integration
 *
 * Tests cross-cutting correctness properties for genre-aware checklist generation,
 * special parser mode, and non-4/4 rhythmic pattern detection.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { detectIssues } from "../../src/core/issue-detector.js";
import { isSpecialParserMode } from "../../src/core/issue-detector.js";
import { ALL_PROFILES, getProfile } from "../../src/core/genre-registry.js";
import type { IssueDetectorInput } from "../../src/core/issue-types.js";
import type { FrequencyBucket } from "../../src/core/track-categorizer.js";
import type { GenreProfile } from "../../src/core/genre-profile-types.js";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Collect all permissive genre IDs that actually trigger special parser mode
 * through the detectIssues code path. detectIssues uses getProfile(selectedGenre),
 * which only resolves family-level IDs. For subgenres, we also include those
 * whose resolved profile has the rule, since the test verifies the property
 * against the actual behavior of detectIssues.
 *
 * We collect IDs where getProfile(id) OR getProfileBySubgenre(id) returns a profile
 * with the rule, mirroring how the system should work for permissive genres.
 * However, the generator is filtered to only IDs where detectIssues actually enters
 * special parser mode (family IDs with the rule).
 */
function getPermissiveGenreFamilyIds(): string[] {
  const ids: string[] = [];
  for (const profile of ALL_PROFILES) {
    if (isSpecialParserMode(profile)) {
      ids.push(profile.id);
    }
  }
  return ids;
}

const PERMISSIVE_GENRE_FAMILY_IDS = getPermissiveGenreFamilyIds();

/** Non-"full" frequency buckets that can trigger crowding. */
const CROWDING_BUCKETS: FrequencyBucket[] = ["sub", "bass", "low-mid", "mid", "high-mid", "high"];

// ─── Property 7: Frequency crowding runs regardless of parser mode ─────

// Feature: m6-genre-integration, Property 7: Frequency crowding runs regardless of parser mode
describe("Property 7: Frequency crowding runs regardless of parser mode", () => {
  /**
   * **Validates: Requirements 2.6**
   *
   * For any issue detector input where the selected genre is a permissive genre
   * AND the arrangement data would trigger frequency-crowding conditions, the
   * output SHALL still contain "frequency-crowding" issues.
   *
   * Frequency crowding triggers when 4+ tracks (5+ for drops) share the same
   * non-"full" frequency bucket and are active in the same section.
   */

  // Generator: builds an IssueDetectorInput that guarantees frequency crowding
  // by placing enough tracks (>= infoThreshold of 4) in the same bucket, all
  // active in the same section, while using a permissive genre.
  const crowdingInputArb: fc.Arbitrary<IssueDetectorInput> = fc
    .record({
      // Pick a permissive genre family that triggers special parser mode
      genreId: fc.constantFrom(...PERMISSIVE_GENRE_FAMILY_IDS),
      // The bucket all crowding tracks will share
      crowdingBucket: fc.constantFrom(...CROWDING_BUCKETS),
      // Number of tracks sharing the bucket (5-8 guarantees crowding triggers
      // regardless of drop detection — drop sections have info threshold of 5)
      crowdingTrackCount: fc.integer({ min: 5, max: 8 }),
      // Section length in bars (8-32)
      sectionLengthBars: fc.integer({ min: 8, max: 32 }),
      // Energy value for the section (1-8, not max energy to avoid "drop" threshold shift)
      sectionEnergy: fc.integer({ min: 1, max: 8 }),
      // Track names for variety
      trackNameSuffix: fc.integer({ min: 1, max: 1000 }),
    })
    .map((params) => {
      const {
        genreId,
        crowdingBucket,
        crowdingTrackCount,
        sectionLengthBars,
        sectionEnergy,
        trackNameSuffix,
      } = params;

      const sectionLengthBeats = sectionLengthBars * 4;

      // Single section to simplify — enough to trigger frequency crowding
      const sections = [
        {
          id: "section-0",
          name: "Main Section",
          startTime: 0,
          endTime: sectionLengthBeats,
        },
      ];

      const energyCurve = [sectionEnergy];

      // Build tracks all sharing the same frequency bucket and active in the section
      const trackClipData: {
        trackName: string;
        trackType: "midi" | "audio";
        clips: { startTime: number; endTime: number; muted: boolean; hasEnvelopes: boolean }[];
      }[] = [];

      const trackBuckets: FrequencyBucket[] = [];
      const trackInventory: { name: string; type: "midi" | "audio" }[] = [];
      const trackNoteData: { trackName: string; notes: { pitch: number; startTime: number; duration: number; velocity: number }[] }[] = [];

      for (let t = 0; t < crowdingTrackCount; t++) {
        const trackName = `Track ${t + 1} v${trackNameSuffix}`;
        const trackType: "midi" | "audio" = t % 2 === 0 ? "midi" : "audio";

        trackClipData.push({
          trackName,
          trackType,
          clips: [
            {
              startTime: 0,
              endTime: sectionLengthBeats,
              muted: false,
              hasEnvelopes: false,
            },
          ],
        });

        trackBuckets.push(crowdingBucket);
        trackInventory.push({ name: trackName, type: trackType });
        trackNoteData.push({ trackName, notes: [] });
      }

      // Section analysis map
      const sectionAnalysis = new Map<
        string,
        { activeTrackCount: number; midiDensity: number; hasAutomation: boolean; energyScore: number }
      >();
      sectionAnalysis.set("section-0", {
        activeTrackCount: crowdingTrackCount,
        midiDensity: 4,
        hasAutomation: false,
        energyScore: sectionEnergy,
      });

      return {
        sections,
        sectionAnalysis,
        energyCurve,
        trackInventory,
        trackClipData,
        trackNoteData,
        trackBuckets,
        selectedGenre: genreId,
      } as IssueDetectorInput;
    });

  test.prop([crowdingInputArb], { numRuns: 100 })(
    "frequency-crowding issues are produced even when special parser mode is active",
    (input) => {
      // Verify the genre actually triggers special parser mode via getProfile
      // (this is how detectIssues resolves the profile)
      const profile = getProfile(input.selectedGenre!);
      expect(profile).not.toBeNull();
      expect(isSpecialParserMode(profile)).toBe(true);

      const issues = detectIssues(input);

      // Assert at least one frequency-crowding issue is present
      const crowdingIssues = issues.filter((i) => i.type === "frequency-crowding");
      expect(crowdingIssues.length).toBeGreaterThanOrEqual(1);

      // All frequency-crowding issues should reference the section
      for (const issue of crowdingIssues) {
        expect(issue.sectionIds).toContain("section-0");
      }
    },
  );
});

// ─── Property 6: Special parser mode suppresses exactly specified types ─

// Feature: m6-genre-integration, Property 6: Special parser mode suppresses exactly specified types

/**
 * Collect all genre IDs (family + subgenre) that resolve to a profile
 * with the "standard-structure-not-applicable" rule (value true).
 * These are the permissive genres: IDM, Glitch, Breakcore, Speedcore.
 */
import { getProfileBySubgenre } from "../../src/core/genre-registry.js";
import type { TrackClipData, TrackNoteData } from "../../src/core/section-analyzer.js";
import type { IssueType } from "../../src/core/issue-types.js";

function getAllPermissiveGenreIds(): string[] {
  const ids: string[] = [];
  for (const profile of ALL_PROFILES) {
    if (isSpecialParserMode(profile)) {
      ids.push(profile.id);
    }
    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        const resolved = getProfileBySubgenre(variant.id);
        if (resolved && isSpecialParserMode(resolved)) {
          ids.push(variant.id);
        }
      }
    }
  }
  return ids;
}

const ALL_PERMISSIVE_GENRE_IDS = getAllPermissiveGenreIds();

/** Issue types that MUST be suppressed in special parser mode. */
const SUPPRESSED_TYPES: readonly IssueType[] = [
  "flat-energy",
  "repetition",
  "abrupt-change",
  "intro-length",
  "outro-length",
];

/**
 * Generator for a valid IssueDetectorInput constrained to a permissive genre.
 * Builds coherent sections, energy curves, track data, and section analysis.
 */
const permissiveGenreInputArb: fc.Arbitrary<IssueDetectorInput> = fc
  .record({
    genreId: fc.constantFrom(...ALL_PERMISSIVE_GENRE_IDS),
    sectionCount: fc.integer({ min: 2, max: 5 }),
    sectionLengths: fc.array(fc.integer({ min: 4, max: 64 }), { minLength: 5, maxLength: 5 }),
    energyValues: fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 5, maxLength: 5 }),
    trackCount: fc.integer({ min: 1, max: 4 }),
    trackHasEnvelopes: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
    trackBucketValues: fc.array(
      fc.constantFrom<FrequencyBucket[]>("sub", "bass", "low-mid", "mid", "high-mid", "high", "full"),
      { minLength: 5, maxLength: 5 },
    ),
    midiNoteCounts: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 5, maxLength: 5 }),
    hasAutomation: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
    trackNames: fc.array(
      fc.constantFrom(
        "Lead Synth", "Kick", "Bass", "Pad", "Hi Hat",
        "Riser FX", "Vocal", "Piano", "Sub Bass", "Perc",
      ),
      { minLength: 5, maxLength: 5 },
    ),
  })
  .map((params) => {
    const {
      genreId, sectionCount, sectionLengths, energyValues,
      trackCount, trackHasEnvelopes, trackBucketValues,
      midiNoteCounts, hasAutomation, trackNames,
    } = params;

    // Build sections with sequential, non-overlapping time ranges
    const sections: { id: string; name: string; startTime: number; endTime: number }[] = [];
    let currentTime = 0;
    for (let i = 0; i < sectionCount; i++) {
      const length = sectionLengths[i]! * 4; // bars to beats
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

    // Section analysis map
    const sectionAnalysis = new Map<string, { activeTrackCount: number; midiDensity: number; hasAutomation: boolean; energyScore: number }>();
    for (let i = 0; i < sectionCount; i++) {
      sectionAnalysis.set(sections[i]!.id, {
        activeTrackCount: Math.min(trackCount, 4),
        midiDensity: midiNoteCounts[i]! / Math.max(1, sectionLengths[i]!),
        hasAutomation: hasAutomation[i]!,
        energyScore: energyValues[i]!,
      });
    }

    // Build track clip data — one clip per track spanning entire arrangement
    const actualTrackCount = Math.min(trackCount, 4);
    const trackClipData: TrackClipData[] = [];
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

    // Build track note data
    const trackNoteData: TrackNoteData[] = [];
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

    // Track buckets and inventory
    const trackBuckets: FrequencyBucket[] = trackBucketValues.slice(0, actualTrackCount);
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
      selectedGenre: genreId,
    } as IssueDetectorInput;
  });

describe("Property 6: Special parser mode suppresses exactly the specified issue types", () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.7**
   *
   * For any issue detector input where the selected genre resolves to a profile
   * with "standard-structure-not-applicable" rule (value true), the output SHALL
   * contain zero issues of types "flat-energy", "repetition", "abrupt-change",
   * "intro-length", or "outro-length".
   */
  test.prop([permissiveGenreInputArb], { numRuns: 100 })(
    "output contains zero suppressed issue types when special parser mode is active",
    (input) => {
      // Verify the genre actually resolves to a SPM profile (generator invariant)
      const profile = getProfile(input.selectedGenre!) ?? getProfileBySubgenre(input.selectedGenre!);
      expect(profile).not.toBeNull();
      expect(isSpecialParserMode(profile)).toBe(true);

      // Run the issue detector
      const issues = detectIssues(input);

      // Assert none of the suppressed types appear in the output
      const suppressedIssues = issues.filter((issue) =>
        SUPPRESSED_TYPES.includes(issue.type),
      );
      expect(suppressedIssues).toHaveLength(0);
    },
  );
});


// ─── Property 11: Special parser mode determination is biconditional ───

// Feature: m6-genre-integration, Property 11: Special parser mode determination is biconditional

describe("Property 11: Special parser mode determination is biconditional", () => {
  /**
   * **Validates: Requirements 2.7, 2.9**
   *
   * For any genre profile, `isSpecialParserMode(profile)` SHALL return `true`
   * if and only if the profile's `detectionRules` array contains a rule with
   * type "standard-structure-not-applicable" and value `true`. For profiles
   * without this rule, ALL sub-detectors SHALL run normally.
   */

  // Generator: pick any real profile from the registry (covers all families + subgenres)
  const allResolvedProfiles: GenreProfile[] = [];
  for (const profile of ALL_PROFILES) {
    allResolvedProfiles.push(profile);
    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        const resolved = getProfileBySubgenre(variant.id);
        if (resolved) {
          allResolvedProfiles.push(resolved);
        }
      }
    }
  }

  const genreProfileArb = fc.constantFrom(...allResolvedProfiles);

  test.prop([genreProfileArb], { numRuns: 100 })(
    "isSpecialParserMode returns true IFF detectionRules contains standard-structure-not-applicable with value true",
    (profile) => {
      const hasRule = profile.detectionRules.some(
        (r) => r.type === "standard-structure-not-applicable" && r.value === true,
      );
      const result = isSpecialParserMode(profile);

      // Biconditional: result === true IFF the rule is present
      expect(result).toBe(hasRule);
    },
  );

  test("isSpecialParserMode returns false for null profile", () => {
    expect(isSpecialParserMode(null)).toBe(false);
  });
});


// ─── Property 4: Checklist generation is idempotent ────────────────────

// Feature: m6-genre-integration, Property 4: Checklist generation is idempotent

import { generateSectionChecklists } from "../../src/core/checklist-generator.js";
import type { ChecklistGeneratorInput } from "../../src/core/checklist-generator.js";
import type { TransitionRecommendation } from "../../src/core/transition-engine.js";

/**
 * Generator for a valid ChecklistGeneratorInput with arbitrary genre selection
 * (null or a real genre ID from the profile registry).
 */
const checklistInputArb: fc.Arbitrary<ChecklistGeneratorInput> = fc
  .record({
    // Genre selection: null or a real profile ID
    selectedGenre: fc.oneof(
      fc.constant(null),
      fc.constantFrom(...ALL_PROFILES.map((p) => p.id)),
    ),
    // Number of sections (1-6)
    sectionCount: fc.integer({ min: 1, max: 6 }),
    // Section name pool — mix of names that may or may not match genre templates
    sectionNames: fc.array(
      fc.constantFrom(
        "Intro", "Verse", "Chorus", "Bridge", "Breakdown", "Drop",
        "Outro", "Build", "Development A", "Development B",
        "Main Section", "Hook", "Pre-Chorus", "Interlude",
      ),
      { minLength: 6, maxLength: 6 },
    ),
    // Issue count (0-4)
    issueCount: fc.integer({ min: 0, max: 4 }),
    // Issue severity pool
    issueSeverities: fc.array(
      fc.constantFrom<("info" | "warning" | "critical")[]>("info", "warning", "critical"),
      { minLength: 4, maxLength: 4 },
    ),
    // Issue type pool
    issueTypes: fc.array(
      fc.constantFrom<IssueType[]>(
        "flat-energy", "missing-transition", "repetition",
        "abrupt-change", "frequency-crowding", "intro-length",
      ),
      { minLength: 4, maxLength: 4 },
    ),
    // Transition recommendation count (0-3)
    transitionCount: fc.integer({ min: 0, max: 3 }),
    // Whether existing completions have some pre-filled values
    hasCompletions: fc.boolean(),
    // Seed for deterministic completion values
    completionSeed: fc.integer({ min: 0, max: 100 }),
  })
  .map((params) => {
    const {
      selectedGenre, sectionCount, sectionNames, issueCount,
      issueSeverities, issueTypes, transitionCount, hasCompletions, completionSeed,
    } = params;

    // Build section IDs
    const existingSections: string[] = [];
    for (let i = 0; i < sectionCount; i++) {
      existingSections.push(`section-${sectionNames[i]!.toLowerCase().replace(/\s+/g, "-")}-${i}`);
    }

    // Build issues referencing the sections
    const issues: Issue[] = [];
    for (let i = 0; i < Math.min(issueCount, sectionCount); i++) {
      issues.push({
        id: `issue-${i}`,
        type: issueTypes[i]!,
        severity: issueSeverities[i]!,
        sectionIds: [existingSections[i]!],
        message: `Test issue ${i} for property validation`,
      });
    }

    // Build transition recommendations between adjacent sections
    const transitionRecommendations: TransitionRecommendation[] = [];
    for (let i = 0; i < Math.min(transitionCount, sectionCount - 1); i++) {
      transitionRecommendations.push({
        id: `${existingSections[i]!}-${existingSections[i + 1]!}`,
        fromSectionId: existingSections[i]!,
        toSectionId: existingSections[i + 1]!,
        energyDelta: (i % 5) - 2,
        transitionSize: (["small", "medium", "large"] as const)[i % 3]!,
        suggestedDurationBars: 4 + (i * 2),
        techniques: [
          { category: "riser" as const, name: "White noise sweep", durationBars: 4 },
        ],
        boundaryType: "normal" as const,
        rationale: "Smooth transition needed",
        checklist: [
          { id: `tr-check-${i}-0`, text: "Add riser in last 4 bars", completed: false },
          { id: `tr-check-${i}-1`, text: "Automate filter cutoff", completed: false },
        ],
      });
    }

    // Build existing completions map
    const existingCompletions = new Map<string, boolean>();
    if (hasCompletions) {
      for (let i = 0; i < existingSections.length; i++) {
        // Use seed to deterministically set some completions
        if ((completionSeed + i) % 3 === 0) {
          existingCompletions.set(`genre-${selectedGenre ?? "none"}-${existingSections[i]!}-0`, true);
        }
      }
    }

    return {
      issues,
      transitionRecommendations,
      existingSections,
      existingCompletions,
      selectedGenre,
    } as ChecklistGeneratorInput;
  });

describe("Property 4: Checklist generation is idempotent", () => {
  /**
   * **Validates: Requirements 1.9**
   *
   * For any valid ChecklistGeneratorInput (with or without genre), calling
   * generateSectionChecklists twice with identical inputs SHALL produce
   * deep-equal output.
   */
  test.prop([checklistInputArb], { numRuns: 100 })(
    "calling generateSectionChecklists twice with identical inputs produces deep-equal output",
    (input) => {
      const result1 = generateSectionChecklists(input);
      const result2 = generateSectionChecklists(input);

      expect(result1).toStrictEqual(result2);
    },
  );
});


// ─── Property 5: Source ordering invariant within sections ─────────────

// Feature: m6-genre-integration, Property 5: Source ordering invariant within sections

import { generateSectionChecklists, type ChecklistGeneratorInput } from "../../src/core/checklist-generator.js";
import type { TransitionRecommendation, ChecklistItem } from "../../src/core/transition-engine.js";
import type { Issue, IssueSeverity, IssueType } from "../../src/core/issue-types.js";
import type { ChecklistSource } from "../../src/core/notes-types.js";

describe("Property 5: Source ordering invariant within sections", () => {
  /**
   * **Validates: Requirements 1.7**
   *
   * For any section in the checklist output that contains items from multiple
   * sources, all "issue" items SHALL appear before all "genre" items, and all
   * "genre" items SHALL appear before all "transition" items.
   */

  /**
   * Generator: builds a ChecklistGeneratorInput with:
   * - A real genre profile (so genre items are produced)
   * - Sections that match the profile's structure names (so genre items fire)
   * - Issues targeting those same sections (so issue items appear)
   * - Transition recommendations targeting those same sections (so transition items appear)
   *
   * This guarantees all three source types coexist in the same section.
   */
  const orderingInputArb: fc.Arbitrary<ChecklistGeneratorInput> = fc
    .constantFrom(...ALL_PROFILES)
    .chain((profile) => {
      // Use the profile's actual structure section names to guarantee genre item matching
      const structureNames = profile.structure.map((s) => s.name.toLowerCase());

      // We need at least one section name from the profile's structure
      const sectionCountArb = fc.integer({
        min: 1,
        max: Math.min(profile.structure.length, 4),
      });

      return sectionCountArb.chain((sectionCount) => {
        // Pick section indices from the profile structure
        const sectionIndicesArb = fc.shuffledSubarray(
          Array.from({ length: profile.structure.length }, (_, i) => i),
          { minLength: sectionCount, maxLength: sectionCount },
        );

        return fc.record({
          sectionIndices: sectionIndicesArb,
          // Generate 1-3 issues per section to ensure issue items appear
          issueCountPerSection: fc.integer({ min: 1, max: 3 }),
          issueSeverities: fc.array(
            fc.constantFrom<IssueSeverity>("critical", "warning", "info"),
            { minLength: 12, maxLength: 12 },
          ),
          issueTypes: fc.array(
            fc.constantFrom<IssueType>(
              "flat-energy", "missing-transition", "repetition",
              "abrupt-change", "frequency-crowding",
            ),
            { minLength: 12, maxLength: 12 },
          ),
          // Generate 1-2 transition checklist items per recommendation
          transitionChecklistCount: fc.integer({ min: 1, max: 2 }),
          transitionTexts: fc.array(
            fc.string({ minLength: 5, maxLength: 50 }),
            { minLength: 8, maxLength: 8 },
          ),
          issueMessages: fc.array(
            fc.string({ minLength: 5, maxLength: 80 }),
            { minLength: 12, maxLength: 12 },
          ),
        }).map((params) => {
          const { sectionIndices, issueCountPerSection, issueSeverities, issueTypes,
            transitionChecklistCount, transitionTexts, issueMessages } = params;

          // Build section IDs that match the profile's structure names
          // Use "section-{lowercased name}" pattern so extractSectionName finds the match
          const existingSections: string[] = sectionIndices.map((idx) => {
            const name = profile.structure[idx]!.name.toLowerCase().replace(/\s+/g, "-");
            return `section-${name}`;
          });

          // Build issues targeting these sections
          const issues: Issue[] = [];
          let issueIdx = 0;
          for (const sectionId of existingSections) {
            for (let i = 0; i < issueCountPerSection; i++) {
              issues.push({
                id: `test-issue-${issueIdx}`,
                type: issueTypes[issueIdx % issueTypes.length]!,
                severity: issueSeverities[issueIdx % issueSeverities.length]!,
                sectionIds: [sectionId],
                message: issueMessages[issueIdx % issueMessages.length]!,
              });
              issueIdx++;
            }
          }

          // Build transition recommendations targeting these sections
          const transitionRecommendations: TransitionRecommendation[] = [];
          for (let i = 0; i < existingSections.length; i++) {
            const toSectionId = existingSections[i]!;
            const fromSectionId = i > 0 ? existingSections[i - 1]! : "section-prev";
            const checklist: ChecklistItem[] = [];
            for (let c = 0; c < transitionChecklistCount; c++) {
              checklist.push({
                id: `checklist-${i}-${c}`,
                text: transitionTexts[(i * 2 + c) % transitionTexts.length]!,
              });
            }
            transitionRecommendations.push({
              id: `${fromSectionId}-${toSectionId}`,
              fromSectionId,
              toSectionId,
              energyDelta: 2,
              transitionSize: "medium",
              suggestedDurationBars: 4,
              techniques: [{ category: "filter", name: "Low-pass sweep", description: "Sweep filter down" }],
              boundaryType: "build",
              rationale: "Test transition",
              checklist,
            });
          }

          return {
            issues,
            transitionRecommendations,
            existingSections,
            existingCompletions: new Map<string, boolean>(),
            selectedGenre: profile.id,
          } as ChecklistGeneratorInput;
        });
      });
    });

  test.prop([orderingInputArb], { numRuns: 100 })(
    "all issue items appear before genre items and all genre items appear before transition items within each section",
    (input) => {
      const result = generateSectionChecklists(input);

      for (const sectionId of input.existingSections) {
        const items = result[sectionId];
        if (!items || items.length === 0) continue;

        // Collect the source sequence for this section
        const sources: ChecklistSource[] = items.map((item) => item.source);

        // Check ordering invariant: once we see "genre", no more "issue" should follow;
        // once we see "transition", no more "issue" or "genre" should follow.
        let seenGenre = false;
        let seenTransition = false;

        for (const source of sources) {
          if (source === "genre") {
            seenGenre = true;
          } else if (source === "transition") {
            seenTransition = true;
          } else if (source === "issue") {
            // Issue items must not appear after genre or transition items
            expect(seenGenre).toBe(false);
            expect(seenTransition).toBe(false);
          }

          // Genre items must not appear after transition items
          if (source === "genre") {
            expect(seenTransition).toBe(false);
          }
        }
      }
    },
  );
});


// ─── Property 8: Non-standard rhythm genre detection is biconditional ──

// Feature: m6-genre-integration, Property 8: Non-standard rhythm genre detection is biconditional

import { isNonStandardRhythmGenre, NON_STANDARD_RHYTHM_RULES } from "../../src/core/issue-detector.js";

describe("Property 8: Non-standard rhythm genre detection is biconditional", () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.7**
   *
   * For any genre profile, `isNonStandardRhythmGenre(profile)` SHALL return `true`
   * if and only if the profile's `detectionRules` array contains at least one rule
   * whose type is in `NON_STANDARD_RHYTHM_RULES` with value `true`.
   */

  // Collect all resolved profiles (families + subgenres) from the registry
  const allResolvedProfilesForRhythm: GenreProfile[] = [];
  for (const profile of ALL_PROFILES) {
    allResolvedProfilesForRhythm.push(profile);
    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        const resolved = getProfileBySubgenre(variant.id);
        if (resolved) {
          allResolvedProfilesForRhythm.push(resolved);
        }
      }
    }
  }

  const rhythmProfileArb = fc.constantFrom(...allResolvedProfilesForRhythm);

  test.prop([rhythmProfileArb], { numRuns: 100 })(
    "isNonStandardRhythmGenre returns true IFF detectionRules contains at least one NON_STANDARD_RHYTHM_RULES type with value true",
    (profile) => {
      const hasRhythmRule = profile.detectionRules.some(
        (r) =>
          (NON_STANDARD_RHYTHM_RULES as readonly string[]).includes(r.type) &&
          r.value === true,
      );
      const result = isNonStandardRhythmGenre(profile);

      // Biconditional: result === true IFF at least one matching rule is present
      expect(result).toBe(hasRhythmRule);
    },
  );

  test("isNonStandardRhythmGenre returns false for null profile", () => {
    expect(isNonStandardRhythmGenre(null)).toBe(false);
  });
});


// ─── Property 9: Triplet genres relax similarity ceiling by exactly 10 ─

// Feature: m6-genre-integration, Property 9: Triplet genres relax similarity ceiling by exactly 10 points

import { applyRhythmAdjustments } from "../../src/core/issue-detector.js";

describe("Property 9: Triplet genres relax similarity ceiling by exactly 10 points", () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any genre profile with "triplet-hihat-expected" rule (value true), the
   * effective `similarityCeilingPercent` used during issue detection SHALL equal
   * `base.repetitionSimilarity * 100 + 10`, capped at 100.
   *
   * For profiles without the rule but that are still non-standard rhythm,
   * `similarityCeilingPercent === base.repetitionSimilarity * 100` (no adjustment).
   */

  // Collect all resolved profiles (families + subgenres) from the registry
  const allProfilesForTriplet: GenreProfile[] = [];
  for (const profile of ALL_PROFILES) {
    allProfilesForTriplet.push(profile);
    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        const resolved = getProfileBySubgenre(variant.id);
        if (resolved) {
          allProfilesForTriplet.push(resolved);
        }
      }
    }
  }

  // Filter to profiles that have the triplet-hihat-expected rule with value true
  const tripletProfiles = allProfilesForTriplet.filter((p) =>
    p.detectionRules.some((r) => r.type === "triplet-hihat-expected" && r.value === true),
  );

  // Filter to profiles that are non-standard rhythm but do NOT have the triplet rule
  const nonStandardNonTripletProfiles = allProfilesForTriplet.filter(
    (p) =>
      isNonStandardRhythmGenre(p) &&
      !p.detectionRules.some((r) => r.type === "triplet-hihat-expected" && r.value === true),
  );

  /**
   * Construct a GenreThresholdProfile from a GenreProfile, mirroring
   * buildThresholdProfile's logic for the fields relevant to this test.
   */
  function buildBaseThresholds(profile: GenreProfile) {
    const thresholds = profile.detectionThresholds;
    const rules = profile.detectionRules;
    const introRule = rules.find((r) => r.type === "min-intro-bars");
    const outroRule = rules.find((r) => r.type === "min-outro-bars");

    return {
      flatEnergyDelta: thresholds.flatEnergyMaxDelta,
      repetitionSimilarity: thresholds.similarityCeilingPercent / 100,
      abruptChangeDelta: thresholds.missingTransitionMinDelta + 2,
      crowdingTrackCount: 3,
      introMinBars: typeof introRule?.value === "number" ? introRule.value : 16,
      outroMinBars: typeof outroRule?.value === "number" ? outroRule.value : 16,
    };
  }

  // Generator for triplet profiles
  const tripletProfileArb = tripletProfiles.length > 0
    ? fc.constantFrom(...tripletProfiles)
    : fc.constant(null as unknown as GenreProfile);

  // Generator for non-standard-rhythm profiles without triplet rule
  const nonStandardNonTripletArb = nonStandardNonTripletProfiles.length > 0
    ? fc.constantFrom(...nonStandardNonTripletProfiles)
    : fc.constant(null as unknown as GenreProfile);

  test.prop([tripletProfileArb], { numRuns: 100 })(
    "triplet-hihat-expected profiles get similarity ceiling increased by exactly 10, capped at 100",
    (profile) => {
      // Skip if no triplet profiles exist (shouldn't happen with real data)
      if (profile === null) return;

      const baseThresholds = buildBaseThresholds(profile);
      const result = applyRhythmAdjustments(baseThresholds, profile, true);

      const expected = Math.min(100, baseThresholds.repetitionSimilarity * 100 + 10);
      expect(result.similarityCeilingPercent).toBe(expected);
    },
  );

  test.prop([nonStandardNonTripletArb], { numRuns: 100 })(
    "non-standard rhythm profiles WITHOUT triplet rule get no similarity ceiling adjustment",
    (profile) => {
      // Skip if no such profiles exist
      if (profile === null) return;

      const baseThresholds = buildBaseThresholds(profile);
      const result = applyRhythmAdjustments(baseThresholds, profile, true);

      const expected = baseThresholds.repetitionSimilarity * 100;
      expect(result.similarityCeilingPercent).toBe(expected);
    },
  );
});


// ─── Property 10: Half-time feel doubles effective bar counts ───────────

// Feature: m6-genre-integration, Property 10: Half-time feel doubles effective bar counts

import { applyRhythmAdjustments, type EffectiveThresholds } from "../../src/core/issue-detector.js";

describe("Property 10: Half-time feel doubles effective bar counts", () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * For any genre profile with "half-time-feel-expected" rule (value true),
   * the effective minimum bar count for intro-length and outro-length checks
   * SHALL be double the base value.
   *
   * For profiles without the rule, bar counts remain unchanged from base.
   */

  // Collect all resolved profiles (families + subgenres)
  const allResolvedProfilesForHalfTime: GenreProfile[] = [];
  for (const profile of ALL_PROFILES) {
    allResolvedProfilesForHalfTime.push(profile);
    if (profile.subgenres) {
      for (const variant of profile.subgenres) {
        const resolved = getProfileBySubgenre(variant.id);
        if (resolved) {
          allResolvedProfilesForHalfTime.push(resolved);
        }
      }
    }
  }

  const halfTimeProfileArb = fc.constantFrom(...allResolvedProfilesForHalfTime);

  /**
   * Build a GenreThresholdProfile-compatible object from a profile,
   * mirroring the internal buildThresholdProfile logic in issue-detector.ts.
   */
  function buildBaseThresholds(profile: GenreProfile) {
    const thresholds = profile.detectionThresholds;
    const rules = profile.detectionRules;

    const introRule = rules.find((r) => r.type === "min-intro-bars");
    const outroRule = rules.find((r) => r.type === "min-outro-bars");

    return {
      flatEnergyDelta: thresholds.flatEnergyMaxDelta,
      repetitionSimilarity: thresholds.similarityCeilingPercent / 100,
      abruptChangeDelta: thresholds.missingTransitionMinDelta + 2,
      crowdingTrackCount: 3,
      introMinBars: typeof introRule?.value === "number" ? introRule.value : 16,
      outroMinBars: typeof outroRule?.value === "number" ? outroRule.value : 16,
    };
  }

  function profileHasHalfTimeRule(profile: GenreProfile): boolean {
    return profile.detectionRules.some(
      (r) => r.type === "half-time-feel-expected" && r.value === true,
    );
  }

  test.prop([halfTimeProfileArb], { numRuns: 100 })(
    "half-time-feel-expected profiles double introMinBars and outroMinBars; others remain unchanged",
    (profile) => {
      const baseThresholds = buildBaseThresholds(profile);
      const hasHalfTime = profileHasHalfTimeRule(profile);

      // Determine if the profile is a non-standard rhythm genre (required for adjustments to apply)
      const isNonStandard = isNonStandardRhythmGenre(profile);

      // Call applyRhythmAdjustments with nonStandardRhythm = true to test the half-time path
      const result = applyRhythmAdjustments(baseThresholds, profile, true);

      if (hasHalfTime) {
        // Half-time feel doubles effective bar counts
        expect(result.introMinBars).toBe(baseThresholds.introMinBars * 2);
        expect(result.outroMinBars).toBe(baseThresholds.outroMinBars * 2);
      } else {
        // Without half-time rule, bar counts remain unchanged
        expect(result.introMinBars).toBe(baseThresholds.introMinBars);
        expect(result.outroMinBars).toBe(baseThresholds.outroMinBars);
      }
    },
  );

  test.prop([halfTimeProfileArb], { numRuns: 100 })(
    "when nonStandardRhythm is false, bar counts are never doubled regardless of rules",
    (profile) => {
      const baseThresholds = buildBaseThresholds(profile);

      // Call with nonStandardRhythm = false — adjustments should NOT apply
      const result = applyRhythmAdjustments(baseThresholds, profile, false);

      // Bar counts always remain unchanged when nonStandardRhythm is false
      expect(result.introMinBars).toBe(baseThresholds.introMinBars);
      expect(result.outroMinBars).toBe(baseThresholds.outroMinBars);
    },
  );
});
