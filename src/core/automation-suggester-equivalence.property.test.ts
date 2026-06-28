/**
 * Property-based test for automation suggester behavioral equivalence.
 *
 * Feature: detection-data-externalization, Property 7: Automation suggester behavioral equivalence
 *
 * **Validates: Requirements 5.4**
 *
 * For any valid AutomationSuggesterInput (with arbitrary contrastGaps, transitionPoints,
 * parameterInventory, automationData, sectionAutomationMap, and activeTracks), calling
 * generateAutomationSuggestions after externalization SHALL produce the same array of
 * AutomationSuggestion objects as the pre-externalization implementation with the same inputs.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import {
  generateAutomationSuggestions,
  type AutomationSuggesterInput,
  type AutomationSuggestion,
  type TransitionPoint,
} from "./automation-suggester.js";
import type { ParameterInventoryEntry } from "./parameter-scanner.js";
import type { AlsAutomationData, SectionAutomationSummary } from "./als-parser.js";
import type { ContrastGapIssue } from "./contrast-gap-detector.js";

// ━━━ Reference Constants (Original Hardcoded Values) ━━━━━━━━━━━━━━━━━━━━━━━━

const REF_FILTER_DEVICE_PATTERNS = ["filter", "eq", "auto filter"];
const REF_EXCLUDED_PARAMETER_NAMES = ["Device On"];
const REF_TRANSITION_RELEVANT_PATTERNS = [
  "filter freq",
  "frequency",
  "cutoff",
  "resonance",
  "send",
  "volume",
  "pan",
  "lfo rate",
  "lfo speed",
  "chorus",
  "depth",
  "decay",
  "release",
  "attack",
  "dry/wet",
];
const REF_GAP_PATTERNS = ["gradual_sweep", "subtle_variation", "rhythmic_modulation"];
const REF_TRANSITION_PATTERNS = ["build_release", "filter_sweep", "volume_swell"];
const REF_MAX_SUGGESTIONS_PER_GAP = 3;
const REF_MAX_SUGGESTIONS_PER_TRANSITION = 2;
const REF_GENERIC_MIXER_PARAMS = [
  { deviceName: "Mixer", parameterName: "Track Volume" },
  { deviceName: "Mixer", parameterName: "Track Pan" },
];

// ━━━ Reference Helper Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refIsFilterDevice(deviceName: string): boolean {
  const lower = deviceName.toLowerCase();
  return REF_FILTER_DEVICE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function refIsTransitionRelevant(parameterName: string): boolean {
  const lower = parameterName.toLowerCase();
  return REF_TRANSITION_RELEVANT_PATTERNS.some((pattern) => lower.includes(pattern));
}

function refIsExcludedParameter(entry: ParameterInventoryEntry): boolean {
  if (REF_EXCLUDED_PARAMETER_NAMES.includes(entry.parameterName)) {
    return true;
  }
  if (entry.min === entry.max) {
    return true;
  }
  return false;
}

function refIsAlreadyAutomated(
  entry: ParameterInventoryEntry,
  sectionIds: readonly string[],
  automationData: AlsAutomationData | null,
  sectionAutomationMap: ReadonlyMap<string, SectionAutomationSummary[]> | null,
): boolean {
  if (!automationData || !sectionAutomationMap) {
    return false;
  }

  for (const sectionId of sectionIds) {
    const summaries = sectionAutomationMap.get(sectionId);
    if (!summaries) continue;

    const trackSummary = summaries.find((s) => s.trackIndex === entry.trackIndex);
    if (!trackSummary || trackSummary.activeEnvelopeCount === 0) continue;

    for (const envelope of automationData.envelopes) {
      if (
        envelope.trackIndex === entry.trackIndex &&
        envelope.deviceName === entry.deviceName &&
        envelope.parameterName === entry.parameterName
      ) {
        return true;
      }
    }
  }

  return false;
}

function refGetAvailableParams(
  sectionIds: readonly string[],
  inventory: readonly ParameterInventoryEntry[],
  activeTracks: ReadonlyMap<string, readonly string[]>,
  automationData: AlsAutomationData | null,
  sectionAutomationMap: ReadonlyMap<string, SectionAutomationSummary[]> | null,
): ParameterInventoryEntry[] {
  const activeTrackNames = new Set<string>();
  for (const sectionId of sectionIds) {
    const tracks = activeTracks.get(sectionId);
    if (tracks) {
      for (const name of tracks) {
        activeTrackNames.add(name);
      }
    }
  }

  return inventory.filter((entry) => {
    if (!activeTrackNames.has(entry.trackName)) return false;
    if (refIsExcludedParameter(entry)) return false;
    if (refIsAlreadyAutomated(entry, sectionIds, automationData, sectionAutomationMap)) return false;
    return true;
  });
}

function refSortByFilterPriority(params: ParameterInventoryEntry[]): ParameterInventoryEntry[] {
  return [...params].sort((a, b) => {
    const aIsFilter = refIsFilterDevice(a.deviceName) ? 0 : 1;
    const bIsFilter = refIsFilterDevice(b.deviceName) ? 0 : 1;
    return aIsFilter - bIsFilter;
  });
}

function refGenerateFallbackSuggestions(
  sectionIds: readonly string[],
  type: "contrast_gap" | "transition",
  activeTracks: ReadonlyMap<string, readonly string[]>,
  maxCount: number,
): AutomationSuggestion[] {
  const activeTrackNames = new Set<string>();
  for (const sectionId of sectionIds) {
    const tracks = activeTracks.get(sectionId);
    if (tracks) {
      for (const name of tracks) {
        activeTrackNames.add(name);
      }
    }
  }

  if (activeTrackNames.size === 0) {
    return [];
  }

  const trackName = [...activeTrackNames][0]!;
  const patterns = type === "contrast_gap" ? REF_GAP_PATTERNS : REF_TRANSITION_PATTERNS;
  const suggestions: AutomationSuggestion[] = [];

  for (let i = 0; i < Math.min(maxCount, REF_GENERIC_MIXER_PARAMS.length); i++) {
    const generic = REF_GENERIC_MIXER_PARAMS[i]!;
    suggestions.push({
      trackName,
      deviceName: generic.deviceName,
      parameterName: generic.parameterName,
      pattern: patterns[i % patterns.length]!,
      sectionIds,
      type,
    });
  }

  return suggestions;
}

// ━━━ Reference generateAutomationSuggestions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function referenceGenerateAutomationSuggestions(
  input: AutomationSuggesterInput,
): AutomationSuggestion[] {
  const {
    contrastGaps,
    transitionPoints,
    parameterInventory,
    automationData,
    sectionAutomationMap,
    activeTracks,
  } = input;

  const suggestions: AutomationSuggestion[] = [];

  // ── Contrast Gap Suggestions ──
  for (const gap of contrastGaps) {
    const sectionIds = gap.sectionIds;

    const available = refGetAvailableParams(
      sectionIds,
      parameterInventory,
      activeTracks,
      automationData,
      sectionAutomationMap,
    );

    const sorted = refSortByFilterPriority(available);

    if (sorted.length === 0) {
      const fallback = refGenerateFallbackSuggestions(
        sectionIds,
        "contrast_gap",
        activeTracks,
        REF_MAX_SUGGESTIONS_PER_GAP,
      );
      suggestions.push(...fallback);
      continue;
    }

    const count = Math.min(sorted.length, REF_MAX_SUGGESTIONS_PER_GAP);
    for (let i = 0; i < count; i++) {
      const entry = sorted[i]!;
      suggestions.push({
        trackName: entry.trackName,
        deviceName: entry.deviceName,
        parameterName: entry.parameterName,
        pattern: REF_GAP_PATTERNS[i % REF_GAP_PATTERNS.length]!,
        sectionIds,
        type: "contrast_gap",
      });
    }
  }

  // ── Transition Suggestions ──
  for (const transition of transitionPoints) {
    const sectionIds = [transition.fromSectionId, transition.toSectionId];

    const available = refGetAvailableParams(
      sectionIds,
      parameterInventory,
      activeTracks,
      automationData,
      sectionAutomationMap,
    );

    const transitionRelevant = available.filter((entry) =>
      refIsTransitionRelevant(entry.parameterName),
    );

    const sorted = refSortByFilterPriority(transitionRelevant);

    if (sorted.length === 0) {
      const fallback = refGenerateFallbackSuggestions(
        sectionIds,
        "transition",
        activeTracks,
        REF_MAX_SUGGESTIONS_PER_TRANSITION,
      );
      suggestions.push(...fallback);
      continue;
    }

    const count = Math.min(sorted.length, REF_MAX_SUGGESTIONS_PER_TRANSITION);
    for (let i = 0; i < count; i++) {
      const entry = sorted[i]!;
      suggestions.push({
        trackName: entry.trackName,
        deviceName: entry.deviceName,
        parameterName: entry.parameterName,
        pattern: REF_TRANSITION_PATTERNS[i % REF_TRANSITION_PATTERNS.length]!,
        sectionIds,
        type: "transition",
      });
    }
  }

  return suggestions;
}

// ━━━ Arbitrary Generators ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Track name pool for generating inventories. */
const TRACK_NAME_POOL = ["Bass", "Lead Synth", "Drums", "Pad", "FX Send", "Keys", "Guitar"];

/** Device name pool including filter-type devices. */
const DEVICE_NAME_POOL = [
  "Auto Filter",
  "EQ Eight",
  "Compressor",
  "Reverb",
  "Delay",
  "Saturator",
  "Chorus",
  "Filter",
];

/** Parameter name pool including transition-relevant params. */
const PARAM_NAME_POOL = [
  "Filter Freq",
  "Frequency",
  "Cutoff",
  "Resonance",
  "Send A",
  "Volume",
  "Pan",
  "Dry/Wet",
  "Threshold",
  "Attack",
  "Release",
  "Depth",
  "LFO Rate",
  "Device On",
  "Gain",
  "Output",
];

/**
 * Generate a section ID string.
 */
function arbSectionId(): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: 9 }).map((i) => `section-${i}`);
}

/**
 * Generate an array of unique section IDs.
 */
function arbSectionIds(minLen = 1, maxLen = 4): fc.Arbitrary<string[]> {
  return fc
    .uniqueArray(arbSectionId(), { minLength: minLen, maxLength: maxLen });
}

/**
 * Generate a ContrastGapIssue.
 */
function arbContrastGap(): fc.Arbitrary<ContrastGapIssue> {
  return arbSectionIds(2, 4).map((sectionIds) => ({
    id: `gap-${sectionIds.join("-")}`,
    type: "contrast_gap" as const,
    severity: "warning" as const,
    sectionIds,
    message: "Sections lack contrast",
  }));
}

/**
 * Generate a TransitionPoint.
 */
function arbTransitionPoint(): fc.Arbitrary<TransitionPoint> {
  return fc
    .tuple(arbSectionId(), arbSectionId())
    .filter(([from, to]) => from !== to)
    .map(([fromSectionId, toSectionId]) => ({
      fromSectionId,
      toSectionId,
      energyDelta: 0, // energyDelta is not used in the suggestion logic
    }));
}

/**
 * Generate a ParameterInventoryEntry with trackName from the given pool.
 */
function arbParameterEntry(trackNames: string[]): fc.Arbitrary<ParameterInventoryEntry> {
  return fc
    .integer({ min: 0, max: trackNames.length - 1 })
    .chain((trackIdx) =>
      fc.record({
        trackIndex: fc.constant(trackIdx),
        trackName: fc.constant(trackNames[trackIdx]!),
        deviceIndex: fc.integer({ min: 0, max: 4 }),
        deviceName: fc.constantFrom(...DEVICE_NAME_POOL),
        parameterName: fc.constantFrom(...PARAM_NAME_POOL),
        min: fc.constant(0),
        max: fc.oneof(fc.constant(1), fc.constant(0)), // some with min === max (excluded)
      }),
    );
}

/**
 * Generate a complete AutomationSuggesterInput with consistent references.
 */
function arbAutomationSuggesterInput(): fc.Arbitrary<AutomationSuggesterInput> {
  return fc
    .integer({ min: 1, max: 5 })
    .chain((numTracks) => {
      const trackNames = TRACK_NAME_POOL.slice(0, numTracks);

      return fc.record({
        contrastGaps: fc.array(arbContrastGap(), { minLength: 0, maxLength: 3 }),
        transitionPoints: fc.array(arbTransitionPoint(), { minLength: 0, maxLength: 3 }),
        parameterInventory: fc.array(arbParameterEntry(trackNames), { minLength: 0, maxLength: 12 }),
        activeTracks: fc
          .array(
            fc.tuple(
              arbSectionId(),
              fc.subarray(trackNames, { minLength: 0 }),
            ),
            { minLength: 0, maxLength: 10 },
          )
          .map((entries) => new Map(entries) as ReadonlyMap<string, readonly string[]>),
        trackNames: fc.constant(trackNames),
      });
    })
    .map(({ contrastGaps, transitionPoints, parameterInventory, activeTracks }) => ({
      contrastGaps,
      transitionPoints,
      parameterInventory,
      automationData: null,
      sectionAutomationMap: null,
      activeTracks,
      genre: null,
    }));
}

/**
 * Generate an AutomationSuggesterInput with automation data
 * (to exercise the isAlreadyAutomated path).
 */
function arbInputWithAutomationData(): fc.Arbitrary<AutomationSuggesterInput> {
  return fc
    .integer({ min: 1, max: 4 })
    .chain((numTracks) => {
      const trackNames = TRACK_NAME_POOL.slice(0, numTracks);

      return fc.record({
        contrastGaps: fc.array(arbContrastGap(), { minLength: 1, maxLength: 2 }),
        transitionPoints: fc.array(arbTransitionPoint(), { minLength: 0, maxLength: 2 }),
        parameterInventory: fc.array(arbParameterEntry(trackNames), { minLength: 1, maxLength: 8 }),
        activeTracks: fc
          .array(
            fc.tuple(
              arbSectionId(),
              fc.subarray(trackNames, { minLength: 1 }),
            ),
            { minLength: 1, maxLength: 10 },
          )
          .map((entries) => new Map(entries) as ReadonlyMap<string, readonly string[]>),
        // Generate some automation envelopes matching inventory entries
        envelopes: fc
          .array(
            fc.record({
              trackIndex: fc.integer({ min: 0, max: numTracks - 1 }),
              pointeeId: fc.integer({ min: 100, max: 999 }),
              deviceName: fc.constantFrom(...DEVICE_NAME_POOL),
              parameterName: fc.constantFrom(...PARAM_NAME_POOL),
              breakpoints: fc.constant([]),
            }),
            { minLength: 0, maxLength: 5 },
          ),
        sectionSummaries: fc
          .array(
            fc.tuple(
              arbSectionId(),
              fc.array(
                fc.record({
                  trackIndex: fc.integer({ min: 0, max: numTracks - 1 }),
                  activeEnvelopeCount: fc.integer({ min: 0, max: 3 }),
                  totalBreakpoints: fc.integer({ min: 0, max: 20 }),
                }),
                { minLength: 0, maxLength: numTracks },
              ),
            ),
            { minLength: 1, maxLength: 10 },
          ),
      });
    })
    .map(({
      contrastGaps,
      transitionPoints,
      parameterInventory,
      activeTracks,
      envelopes,
      sectionSummaries,
    }) => ({
      contrastGaps,
      transitionPoints,
      parameterInventory,
      automationData: {
        envelopes,
        parseTimeMs: 10,
        trackCount: 4,
      } as AlsAutomationData,
      sectionAutomationMap: new Map(sectionSummaries) as ReadonlyMap<string, SectionAutomationSummary[]>,
      activeTracks,
      genre: null,
    }));
}

// ━━━ Property Test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Feature: detection-data-externalization, Property 7: Automation suggester behavioral equivalence", () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any valid AutomationSuggesterInput, generateAutomationSuggestions produces
   * identical output to the reference implementation using original hardcoded values.
   */
  test.prop(
    [arbAutomationSuggesterInput()],
    { numRuns: 100 },
  )(
    "generateAutomationSuggestions matches reference implementation (null automation data)",
    (input) => {
      const actual = generateAutomationSuggestions(input);
      const expected = referenceGenerateAutomationSuggestions(input);

      expect(actual).toEqual(expected);
    },
  );

  test.prop(
    [arbInputWithAutomationData()],
    { numRuns: 100 },
  )(
    "generateAutomationSuggestions matches reference implementation (with automation data)",
    (input) => {
      const actual = generateAutomationSuggestions(input);
      const expected = referenceGenerateAutomationSuggestions(input);

      expect(actual).toEqual(expected);
    },
  );

  /**
   * Determinism: calling twice with the same input produces identical output.
   */
  test.prop(
    [arbAutomationSuggesterInput()],
    { numRuns: 100 },
  )(
    "generateAutomationSuggestions is deterministic (same input → same output)",
    (input) => {
      const first = generateAutomationSuggestions(input);
      const second = generateAutomationSuggestions(input);

      expect(first).toEqual(second);
    },
  );
});
