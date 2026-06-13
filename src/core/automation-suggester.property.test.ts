/**
 * Property-based tests for the Automation Suggester module.
 *
 * Feature: automation-awareness
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import {
  generateAutomationSuggestions,
  type AutomationSuggesterInput,
  type TransitionPoint,
} from "./automation-suggester.js";
import type { ParameterInventoryEntry } from "./parameter-scanner.js";
import type { AlsAutomationData, SectionAutomationSummary } from "./als-parser.js";
import type { ContrastGapIssue } from "./contrast-gap-detector.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Track name pool for generating inventories. */
const TRACK_NAME_POOL = ["Bass", "Lead", "Drums", "Pad", "FX"];

/** Device name pool including filter-type devices. */
const DEVICE_NAME_POOL = ["Auto Filter", "EQ Eight", "Compressor", "Reverb", "Delay"];

/** Parameter name pool including transition-relevant params. */
const PARAM_NAME_POOL = [
  "Filter Freq", "Resonance", "Volume", "Send A", "Dry/Wet",
  "Threshold", "Attack", "Pan", "Depth", "Release",
];

/**
 * Generate a random parameter inventory entry with consistent trackIndex/trackName.
 */
function arbParameterInventoryEntry(
  trackNames: string[],
): fc.Arbitrary<ParameterInventoryEntry> {
  return fc
    .integer({ min: 0, max: trackNames.length - 1 })
    .chain((trackIdx) =>
      fc.record({
        trackIndex: fc.constant(trackIdx),
        trackName: fc.constant(trackNames[trackIdx]!),
        deviceIndex: fc.integer({ min: 0, max: 3 }),
        deviceName: fc.constantFrom(...DEVICE_NAME_POOL),
        parameterName: fc.constantFrom(...PARAM_NAME_POOL),
        min: fc.constant(0),
        max: fc.constant(1),
      }),
    );
}

/**
 * Generate a random parameter inventory (1–10 entries) with consistent
 * trackIndex ↔ trackName mapping.
 */
function arbParameterInventory(): fc.Arbitrary<{
  inventory: ParameterInventoryEntry[];
  trackNames: string[];
}> {
  return fc
    .integer({ min: 1, max: 5 })
    .chain((numTracks) => {
      const trackNames = TRACK_NAME_POOL.slice(0, numTracks);
      return fc
        .array(arbParameterInventoryEntry(trackNames), { minLength: 1, maxLength: 10 })
        .map((inventory) => ({ inventory, trackNames }));
    });
}

/**
 * Generate a set of section IDs (2–4 sections).
 */
function arbSectionIds(): fc.Arbitrary<string[]> {
  return fc
    .integer({ min: 2, max: 4 })
    .map((count) => Array.from({ length: count }, (_, i) => `section-${i}`));
}

// ─── Property 5: Suggestion references only valid active-track parameters ──

// Feature: automation-awareness, Property 5: Suggestion references only valid active-track parameters
describe("Property 5: Suggestion references only valid active-track parameters", () => {
  /**
   * **Validates: Requirements 3.1, 18.3**
   *
   * For any Contrast_Gap or transition suggestion, all referenced parameters
   * (trackName + deviceName + parameterName) SHALL exist in the TrackParameterInventory
   * entries for tracks that are active in the affected section range. No suggestion
   * SHALL reference a parameter from an inactive track.
   *
   * Exception: fallback suggestions with deviceName="Mixer" are allowed (these
   * are generic mixer params generated when no suitable device params are found).
   */

  test.prop(
    [arbParameterInventory(), arbSectionIds()],
    { numRuns: 100 },
  )(
    "contrast gap suggestions reference only valid inventory params or Mixer fallback",
    ({ inventory, trackNames }, sectionIds) => {
      // Build activeTracks map: all tracks in inventory are active in all sections
      const activeTracks = new Map<string, readonly string[]>();
      for (const sectionId of sectionIds) {
        activeTracks.set(sectionId, trackNames);
      }

      // Create a contrast gap for these sections
      const gap: ContrastGapIssue = {
        id: "gap-1",
        type: "contrast_gap",
        severity: "warning",
        sectionIds,
        message: "Sections lack contrast",
      };

      const input: AutomationSuggesterInput = {
        contrastGaps: [gap],
        transitionPoints: [],
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Every non-fallback suggestion must reference a valid entry in the inventory
      for (const suggestion of suggestions) {
        // Fallback mixer suggestions are allowed
        if (suggestion.deviceName === "Mixer") {
          continue;
        }

        // Verify trackName + deviceName + parameterName exists in inventory
        const matchesInventory = inventory.some(
          (entry) =>
            entry.trackName === suggestion.trackName &&
            entry.deviceName === suggestion.deviceName &&
            entry.parameterName === suggestion.parameterName,
        );
        expect(matchesInventory).toBe(true);

        // Verify trackName is active in at least one of the suggestion's sectionIds
        const isActive = suggestion.sectionIds.some((sectionId) => {
          const tracks = activeTracks.get(sectionId);
          return tracks !== undefined && tracks.includes(suggestion.trackName);
        });
        expect(isActive).toBe(true);
      }
    },
  );

  test.prop(
    [arbParameterInventory(), arbSectionIds()],
    { numRuns: 100 },
  )(
    "transition suggestions reference only valid inventory params or Mixer fallback",
    ({ inventory, trackNames }, sectionIds) => {
      // Use first two section IDs for the transition
      const fromSectionId = sectionIds[0]!;
      const toSectionId = sectionIds[1]!;

      // Build activeTracks map: all tracks active in both sections
      const activeTracks = new Map<string, readonly string[]>();
      for (const sectionId of sectionIds) {
        activeTracks.set(sectionId, trackNames);
      }

      // Create a transition point between two sections
      const transition: TransitionPoint = {
        fromSectionId,
        toSectionId,
        energyDelta: 2.0,
      };

      const input: AutomationSuggesterInput = {
        contrastGaps: [],
        transitionPoints: [transition],
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Every non-fallback suggestion must reference a valid entry in the inventory
      for (const suggestion of suggestions) {
        // Fallback mixer suggestions are allowed
        if (suggestion.deviceName === "Mixer") {
          continue;
        }

        // Verify trackName + deviceName + parameterName exists in inventory
        const matchesInventory = inventory.some(
          (entry) =>
            entry.trackName === suggestion.trackName &&
            entry.deviceName === suggestion.deviceName &&
            entry.parameterName === suggestion.parameterName,
        );
        expect(matchesInventory).toBe(true);

        // Verify trackName is active in at least one of the suggestion's sectionIds
        const isActive = suggestion.sectionIds.some((sectionId) => {
          const tracks = activeTracks.get(sectionId);
          return tracks !== undefined && tracks.includes(suggestion.trackName);
        });
        expect(isActive).toBe(true);
      }
    },
  );

  test.prop(
    [arbParameterInventory(), arbSectionIds()],
    { numRuns: 100 },
  )(
    "no suggestion references a track that is inactive in all relevant sections",
    ({ inventory, trackNames }, sectionIds) => {
      // Make only a subset of tracks active (first track only)
      const activeTrackSubset = trackNames.slice(0, 1);
      const inactiveTrackSubset = trackNames.slice(1);

      const activeTracks = new Map<string, readonly string[]>();
      for (const sectionId of sectionIds) {
        activeTracks.set(sectionId, activeTrackSubset);
      }

      // Create a contrast gap
      const gap: ContrastGapIssue = {
        id: "gap-1",
        type: "contrast_gap",
        severity: "warning",
        sectionIds,
        message: "Sections lack contrast",
      };

      const input: AutomationSuggesterInput = {
        contrastGaps: [gap],
        transitionPoints: [],
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // No suggestion should reference a track from the inactive set
      for (const suggestion of suggestions) {
        // Fallback mixer suggestions pick from active tracks
        if (suggestion.deviceName === "Mixer") {
          expect(activeTrackSubset).toContain(suggestion.trackName);
          continue;
        }

        // Non-fallback must NOT reference inactive tracks
        expect(inactiveTrackSubset).not.toContain(suggestion.trackName);

        // Must reference an active track
        const isActive = suggestion.sectionIds.some((sectionId) => {
          const tracks = activeTracks.get(sectionId);
          return tracks !== undefined && tracks.includes(suggestion.trackName);
        });
        expect(isActive).toBe(true);
      }
    },
  );
});


// ─── Property 7: Suggestion output completeness ────────────────────────

// Feature: automation-awareness, Property 7: Suggestion output completeness
describe("Property 7: Suggestion output completeness", () => {
  /**
   * **Validates: Requirements 3.3, 18.6**
   *
   * For any generated automation suggestion (whether for a Contrast_Gap or transition),
   * the output object SHALL contain non-empty `trackName`, `deviceName`, `parameterName`,
   * and `pattern` fields, non-empty `sectionIds` array, and `type` is either
   * "contrast_gap" or "transition".
   */

  test.prop(
    [
      // Number of tracks (1-4)
      fc.integer({ min: 1, max: 4 }),
      // Number of sections (2-5)
      fc.integer({ min: 2, max: 5 }),
      // Whether to include contrast gaps
      fc.boolean(),
      // Whether to include transition points
      fc.boolean(),
      // Number of parameter entries per track (1-5)
      fc.integer({ min: 1, max: 5 }),
    ],
    { numRuns: 100 },
  )(
    "all suggestions have non-empty trackName, deviceName, parameterName, pattern, sectionIds, and valid type",
    (numTracks, numSections, includeGaps, includeTransitions, paramsPerTrack) => {
      // Ensure at least one trigger source exists
      const hasGaps = includeGaps || !includeTransitions;
      const hasTransitions = includeTransitions || !includeGaps;

      // Build track names
      const trackNames = Array.from({ length: numTracks }, (_, i) => `Track ${i + 1}`);

      // Build section IDs
      const sectionIds = Array.from({ length: numSections }, (_, i) => `section-${i}`);

      // Build parameter inventory: multiple entries per track
      const devices = ["Auto Filter", "EQ Eight", "Reverb", "Compressor", "Utility", "Chorus"];
      const params = ["Filter Freq", "Resonance", "Send A", "Volume", "Pan", "LFO Rate", "Dry/Wet"];
      const inventory: ParameterInventoryEntry[] = [];
      for (let t = 0; t < numTracks; t++) {
        for (let p = 0; p < paramsPerTrack; p++) {
          inventory.push({
            trackIndex: t,
            trackName: trackNames[t]!,
            deviceIndex: p % 3,
            deviceName: devices[p % devices.length]!,
            parameterName: params[p % params.length]!,
            min: 0,
            max: 1,
          });
        }
      }

      // Build activeTracks map: all tracks active in all sections
      const activeTracks = new Map<string, readonly string[]>();
      for (const sId of sectionIds) {
        activeTracks.set(sId, trackNames);
      }

      // Build contrast gaps
      const contrastGaps: ContrastGapIssue[] = [];
      if (hasGaps) {
        contrastGaps.push({
          id: "gap-0",
          type: "contrast_gap",
          severity: "warning",
          sectionIds: sectionIds.slice(0, 2),
          message: "Test gap",
        });
      }

      // Build transition points
      const transitionPoints: TransitionPoint[] = [];
      if (hasTransitions && numSections >= 2) {
        transitionPoints.push({
          fromSectionId: sectionIds[0]!,
          toSectionId: sectionIds[1]!,
          energyDelta: 2.0,
        });
      }

      const input: AutomationSuggesterInput = {
        contrastGaps,
        transitionPoints,
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // We expect at least one suggestion since we have valid params and triggers
      expect(suggestions.length).toBeGreaterThan(0);

      // Verify EVERY suggestion has all fields non-empty and valid type
      for (const suggestion of suggestions) {
        expect(suggestion.trackName).toBeTruthy();
        expect(suggestion.trackName.length).toBeGreaterThan(0);

        expect(suggestion.deviceName).toBeTruthy();
        expect(suggestion.deviceName.length).toBeGreaterThan(0);

        expect(suggestion.parameterName).toBeTruthy();
        expect(suggestion.parameterName.length).toBeGreaterThan(0);

        expect(suggestion.pattern).toBeTruthy();
        expect(suggestion.pattern.length).toBeGreaterThan(0);

        expect(suggestion.sectionIds).toBeTruthy();
        expect(suggestion.sectionIds.length).toBeGreaterThan(0);

        expect(["contrast_gap", "transition"]).toContain(suggestion.type);
      }
    },
  );

  test.prop(
    [
      // Number of tracks (1-3)
      fc.integer({ min: 1, max: 3 }),
      // Number of sections (2-4)
      fc.integer({ min: 2, max: 4 }),
    ],
    { numRuns: 100 },
  )(
    "fallback suggestions also have all fields non-empty (empty inventory scenario)",
    (numTracks, numSections) => {
      // Build track names
      const trackNames = Array.from({ length: numTracks }, (_, i) => `Track ${i + 1}`);

      // Build section IDs
      const sectionIds = Array.from({ length: numSections }, (_, i) => `section-${i}`);

      // Empty parameter inventory forces fallback to generic mixer suggestions
      const inventory: ParameterInventoryEntry[] = [];

      // Build activeTracks map: all tracks active in all sections
      const activeTracks = new Map<string, readonly string[]>();
      for (const sId of sectionIds) {
        activeTracks.set(sId, trackNames);
      }

      // One contrast gap to trigger suggestion generation
      const contrastGaps: ContrastGapIssue[] = [
        {
          id: "gap-0",
          type: "contrast_gap",
          severity: "warning",
          sectionIds: sectionIds.slice(0, 2),
          message: "Test gap",
        },
      ];

      // One transition point to trigger transition suggestions
      const transitionPoints: TransitionPoint[] = [
        {
          fromSectionId: sectionIds[0]!,
          toSectionId: sectionIds[1]!,
          energyDelta: 2.0,
        },
      ];

      const input: AutomationSuggesterInput = {
        contrastGaps,
        transitionPoints,
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Fallback should still produce suggestions (generic mixer)
      expect(suggestions.length).toBeGreaterThan(0);

      // Verify EVERY fallback suggestion has all fields non-empty
      for (const suggestion of suggestions) {
        expect(suggestion.trackName).toBeTruthy();
        expect(suggestion.trackName.length).toBeGreaterThan(0);

        expect(suggestion.deviceName).toBeTruthy();
        expect(suggestion.deviceName.length).toBeGreaterThan(0);

        expect(suggestion.parameterName).toBeTruthy();
        expect(suggestion.parameterName.length).toBeGreaterThan(0);

        expect(suggestion.pattern).toBeTruthy();
        expect(suggestion.pattern.length).toBeGreaterThan(0);

        expect(suggestion.sectionIds).toBeTruthy();
        expect(suggestion.sectionIds.length).toBeGreaterThan(0);

        expect(["contrast_gap", "transition"]).toContain(suggestion.type);
      }
    },
  );

  test.prop(
    [
      // Number of gaps (1-3)
      fc.integer({ min: 1, max: 3 }),
      // Number of transitions (1-3)
      fc.integer({ min: 1, max: 3 }),
      // Number of sections (3-6)
      fc.integer({ min: 3, max: 6 }),
    ],
    { numRuns: 100 },
  )(
    "completeness holds with multiple gaps and transitions simultaneously",
    (numGaps, numTransitions, numSections) => {
      const trackNames = ["Lead Synth", "Bass", "Drums", "Pad"];
      const sectionIds = Array.from({ length: numSections }, (_, i) => `section-${i}`);

      // Build a realistic inventory
      const inventory: ParameterInventoryEntry[] = [
        { trackIndex: 0, trackName: "Lead Synth", deviceIndex: 0, deviceName: "Auto Filter", parameterName: "Filter Freq", min: 0, max: 1 },
        { trackIndex: 0, trackName: "Lead Synth", deviceIndex: 0, deviceName: "Auto Filter", parameterName: "Resonance", min: 0, max: 1 },
        { trackIndex: 1, trackName: "Bass", deviceIndex: 0, deviceName: "Saturator", parameterName: "Dry/Wet", min: 0, max: 1 },
        { trackIndex: 1, trackName: "Bass", deviceIndex: 1, deviceName: "EQ Eight", parameterName: "Frequency", min: 0, max: 1 },
        { trackIndex: 2, trackName: "Drums", deviceIndex: 0, deviceName: "Compressor", parameterName: "Attack", min: 0, max: 1 },
        { trackIndex: 3, trackName: "Pad", deviceIndex: 0, deviceName: "Chorus", parameterName: "LFO Rate", min: 0, max: 1 },
        { trackIndex: 3, trackName: "Pad", deviceIndex: 0, deviceName: "Chorus", parameterName: "Dry/Wet", min: 0, max: 1 },
      ];

      // All tracks active in all sections
      const activeTracks = new Map<string, readonly string[]>();
      for (const sId of sectionIds) {
        activeTracks.set(sId, trackNames);
      }

      // Build multiple contrast gaps
      const contrastGaps: ContrastGapIssue[] = [];
      for (let g = 0; g < numGaps && g + 1 < numSections; g++) {
        contrastGaps.push({
          id: `gap-${g}`,
          type: "contrast_gap",
          severity: "warning",
          sectionIds: [sectionIds[g]!, sectionIds[g + 1]!],
          message: `Contrast gap ${g}`,
        });
      }

      // Build multiple transition points
      const transitionPoints: TransitionPoint[] = [];
      for (let t = 0; t < numTransitions && t + 1 < numSections; t++) {
        transitionPoints.push({
          fromSectionId: sectionIds[t]!,
          toSectionId: sectionIds[t + 1]!,
          energyDelta: 3.0,
        });
      }

      const input: AutomationSuggesterInput = {
        contrastGaps,
        transitionPoints,
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // With valid inputs, we expect suggestions
      expect(suggestions.length).toBeGreaterThan(0);

      // Verify completeness for EVERY suggestion
      for (const suggestion of suggestions) {
        // Non-empty strings
        expect(typeof suggestion.trackName).toBe("string");
        expect(suggestion.trackName.length).toBeGreaterThan(0);

        expect(typeof suggestion.deviceName).toBe("string");
        expect(suggestion.deviceName.length).toBeGreaterThan(0);

        expect(typeof suggestion.parameterName).toBe("string");
        expect(suggestion.parameterName.length).toBeGreaterThan(0);

        expect(typeof suggestion.pattern).toBe("string");
        expect(suggestion.pattern.length).toBeGreaterThan(0);

        // Non-empty array
        expect(Array.isArray(suggestion.sectionIds)).toBe(true);
        expect(suggestion.sectionIds.length).toBeGreaterThan(0);

        // Valid type
        expect(suggestion.type === "contrast_gap" || suggestion.type === "transition").toBe(true);
      }
    },
  );
});


// ─── Property 20: Transition-relevant parameter filtering ──────────────

/**
 * Transition-relevant parameter name patterns (case-insensitive substring match).
 * A parameter is transition-relevant if its name contains any of these.
 */
const TRANSITION_RELEVANT_PATTERNS = [
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

/**
 * Check if a parameter name is transition-relevant (mirrors the source logic).
 */
function isTransitionRelevant(parameterName: string): boolean {
  const lower = parameterName.toLowerCase();
  return TRANSITION_RELEVANT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Names that ARE transition-relevant. */
const RELEVANT_PARAM_NAMES = [
  "Filter Freq",
  "Resonance",
  "Send A",
  "Send B",
  "Volume",
  "Pan",
  "LFO Rate",
  "LFO Speed",
  "Chorus Depth",
  "Decay Time",
  "Release Time",
  "Attack Time",
  "Dry/Wet",
  "Cutoff Frequency",
  "Filter Frequency",
];

/** Names that are NOT transition-relevant (don't match any pattern). */
const NON_RELEVANT_PARAM_NAMES = [
  "Transpose",
  "Warp Mode",
  "Pitch Bend Range",
  "Gain",
  "Custom Param XYZ",
  "Modulation Wheel",
  "Osc Waveform",
  "Polyphony",
  "Glide Time",
  "Unison Amount",
  "Bit Reduction",
  "Sample Rate",
];

/**
 * Generate a mixed inventory with both transition-relevant and non-relevant parameters.
 * Ensures at least 1 relevant and at least 1 non-relevant param.
 */
const mixedTransitionInventoryArb = fc
  .tuple(
    fc.array(fc.constantFrom(...RELEVANT_PARAM_NAMES), { minLength: 1, maxLength: 5 }),
    fc.array(fc.constantFrom(...NON_RELEVANT_PARAM_NAMES), { minLength: 1, maxLength: 5 }),
  )
  .map(([relevantNames, nonRelevantNames]): ParameterInventoryEntry[] => {
    const entries: ParameterInventoryEntry[] = [];
    const trackName = "SynthTrack";
    const deviceName = "Synth Plugin";
    const trackIndex = 0;

    for (const name of relevantNames) {
      entries.push({
        trackIndex,
        trackName,
        deviceIndex: 0,
        deviceName,
        parameterName: name,
        min: 0,
        max: 1,
      });
    }

    for (const name of nonRelevantNames) {
      entries.push({
        trackIndex,
        trackName,
        deviceIndex: 0,
        deviceName,
        parameterName: name,
        min: 0,
        max: 1,
      });
    }

    return entries;
  });

/**
 * Generate a transition point between section-0 and section-1.
 */
const transitionPointArb20 = fc
  .float({ min: Math.fround(-5.0), max: Math.fround(5.0), noNaN: true })
  .map((energyDelta): TransitionPoint => ({
    fromSectionId: "section-0",
    toSectionId: "section-1",
    energyDelta,
  }));

// Feature: automation-awareness, Property 20: Transition-relevant parameter filtering
describe("Property 20: Transition-relevant parameter filtering", () => {
  /**
   * **Validates: Requirements 18.2**
   *
   * For any set of unused parameters at a transition point, only parameters
   * relevant for transitions (filter frequency, resonance, send levels, volume,
   * pan, LFO rate, LFO speed, chorus, depth, decay, release, attack, dry/wet)
   * SHALL appear in transition suggestions. Parameters not in the
   * transition-relevant set SHALL be excluded from suggestions.
   */

  test.prop(
    [mixedTransitionInventoryArb, transitionPointArb20],
    { numRuns: 100 },
  )(
    "transition suggestions only contain transition-relevant parameters (non-fallback)",
    (entries, transitionPoint) => {
      // Build active tracks map: the track is active in both sections
      const activeTracks = new Map<string, readonly string[]>([
        ["section-0", ["SynthTrack"]],
        ["section-1", ["SynthTrack"]],
      ]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [],
        transitionPoints: [transitionPoint],
        parameterInventory: entries,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Filter to only transition suggestions that are NOT fallback (deviceName !== "Mixer")
      const nonFallbackTransitionSuggestions = suggestions.filter(
        (s) => s.type === "transition" && s.deviceName !== "Mixer",
      );

      // Every non-fallback transition suggestion must have a transition-relevant parameterName
      for (const suggestion of nonFallbackTransitionSuggestions) {
        expect(
          isTransitionRelevant(suggestion.parameterName),
          `Parameter "${suggestion.parameterName}" in transition suggestion is NOT transition-relevant`,
        ).toBe(true);
      }
    },
  );

  test.prop(
    [
      // Generate inventories with ONLY non-relevant parameters
      fc.array(fc.constantFrom(...NON_RELEVANT_PARAM_NAMES), { minLength: 1, maxLength: 8 }),
      transitionPointArb20,
    ],
    { numRuns: 100 },
  )(
    "when only non-relevant params exist, transition suggestions fall back to mixer",
    (nonRelevantNames, transitionPoint) => {
      // Build inventory with only non-relevant parameters
      const entries: ParameterInventoryEntry[] = nonRelevantNames.map((parameterName) => ({
        trackIndex: 0,
        trackName: "SynthTrack",
        deviceIndex: 0,
        deviceName: "Synth Plugin",
        parameterName,
        min: 0,
        max: 1,
      }));

      const activeTracks = new Map<string, readonly string[]>([
        ["section-0", ["SynthTrack"]],
        ["section-1", ["SynthTrack"]],
      ]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [],
        transitionPoints: [transitionPoint],
        parameterInventory: entries,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);
      const transitionSuggestions = suggestions.filter((s) => s.type === "transition");

      // When no transition-relevant params are available, we expect fallback (Mixer) suggestions
      for (const suggestion of transitionSuggestions) {
        expect(suggestion.deviceName).toBe("Mixer");
      }
    },
  );

  test.prop(
    [
      fc.array(fc.constantFrom(...RELEVANT_PARAM_NAMES), { minLength: 1, maxLength: 6 }),
      transitionPointArb20,
    ],
    { numRuns: 100 },
  )(
    "when only relevant params exist, all transition suggestions reference them",
    (relevantNames, transitionPoint) => {
      // Build inventory with only relevant parameters
      const entries: ParameterInventoryEntry[] = relevantNames.map((parameterName) => ({
        trackIndex: 0,
        trackName: "SynthTrack",
        deviceIndex: 0,
        deviceName: "Synth Plugin",
        parameterName,
        min: 0,
        max: 1,
      }));

      const activeTracks = new Map<string, readonly string[]>([
        ["section-0", ["SynthTrack"]],
        ["section-1", ["SynthTrack"]],
      ]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [],
        transitionPoints: [transitionPoint],
        parameterInventory: entries,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);
      const transitionSuggestions = suggestions.filter((s) => s.type === "transition");

      // All should be non-fallback and transition-relevant
      expect(transitionSuggestions.length).toBeGreaterThan(0);
      for (const suggestion of transitionSuggestions) {
        expect(
          isTransitionRelevant(suggestion.parameterName),
          `Parameter "${suggestion.parameterName}" should be transition-relevant`,
        ).toBe(true);
      }
    },
  );
});


// ─── Property 6: Filter parameter prioritization ───────────────────────

// Feature: automation-awareness, Property 6: Filter parameter prioritization
describe("Property 6: Filter parameter prioritization", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any Contrast_Gap where both filter-device parameters (device name
   * contains "Filter", "EQ", or "Auto Filter") and non-filter parameters are
   * available, the generated suggestions SHALL prioritize filter parameters —
   * i.e., filter parameters appear at lower indices in the output array than
   * non-filter parameters when both are present.
   */

  /** Device names that are considered "filter" devices by the suggester. */
  const FILTER_DEVICES = ["Auto Filter", "EQ Eight", "Channel EQ", "Filter Delay"];

  /** Device names that are NOT filter devices. */
  const NON_FILTER_DEVICES = ["Compressor", "Reverb", "Delay", "Utility", "Saturator"];

  /**
   * Check if a suggestion references a filter device (matches the source logic).
   */
  function isFilterSuggestion(suggestion: AutomationSuggestion): boolean {
    const lower = suggestion.deviceName.toLowerCase();
    return lower.includes("filter") || lower.includes("eq");
  }

  test.prop(
    [
      // Pick 1–2 filter device names
      fc.shuffledSubarray(FILTER_DEVICES, { minLength: 1, maxLength: 2 }),
      // Pick 1–3 non-filter device names
      fc.shuffledSubarray(NON_FILTER_DEVICES, { minLength: 1, maxLength: 3 }),
      // Number of params per filter device (1–2)
      fc.integer({ min: 1, max: 2 }),
      // Number of params per non-filter device (1–3)
      fc.integer({ min: 1, max: 3 }),
    ],
    { numRuns: 100 },
  )(
    "filter suggestions appear at lower indices than non-filter suggestions",
    (filterDeviceNames, nonFilterDeviceNames, filterParamsPerDevice, nonFilterParamsPerDevice) => {
      const trackName = "Lead Synth";
      const sectionIds = ["section-0", "section-1"];

      // Build parameter inventory with BOTH filter and non-filter devices on same track.
      // Non-filter devices are added FIRST in the inventory to ensure prioritization
      // is not just preserving input order.
      const inventory: ParameterInventoryEntry[] = [];
      let deviceIndex = 0;

      // Add non-filter devices FIRST
      for (const deviceName of nonFilterDeviceNames) {
        for (let p = 0; p < nonFilterParamsPerDevice; p++) {
          inventory.push({
            trackIndex: 0,
            trackName,
            deviceIndex,
            deviceName,
            parameterName: `Param ${deviceIndex}-${p}`,
            min: 0,
            max: 1,
          });
        }
        deviceIndex++;
      }

      // Add filter devices AFTER non-filter devices
      for (const deviceName of filterDeviceNames) {
        for (let p = 0; p < filterParamsPerDevice; p++) {
          inventory.push({
            trackIndex: 0,
            trackName,
            deviceIndex,
            deviceName,
            parameterName: `Freq ${deviceIndex}-${p}`,
            min: 0,
            max: 1,
          });
        }
        deviceIndex++;
      }

      // Build a contrast gap referencing those sections
      const contrastGap: ContrastGapIssue = {
        id: "gap-1",
        type: "contrast_gap",
        severity: "warning",
        sectionIds,
        message: "Sections sound too similar",
      };

      // Active tracks map: the track is active in both sections
      const activeTracks = new Map<string, readonly string[]>();
      activeTracks.set("section-0", [trackName]);
      activeTracks.set("section-1", [trackName]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [contrastGap],
        transitionPoints: [],
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Filter to only contrast_gap suggestions
      const gapSuggestions = suggestions.filter((s) => s.type === "contrast_gap");

      // There should be at least one suggestion
      expect(gapSuggestions.length).toBeGreaterThan(0);

      // Identify which suggestions are filter vs non-filter
      const filterIndices: number[] = [];
      const nonFilterIndices: number[] = [];

      for (let i = 0; i < gapSuggestions.length; i++) {
        if (isFilterSuggestion(gapSuggestions[i]!)) {
          filterIndices.push(i);
        } else {
          nonFilterIndices.push(i);
        }
      }

      // If BOTH filter and non-filter suggestions exist,
      // all filter indices must be less than all non-filter indices
      if (filterIndices.length > 0 && nonFilterIndices.length > 0) {
        const maxFilterIndex = Math.max(...filterIndices);
        const minNonFilterIndex = Math.min(...nonFilterIndices);
        expect(maxFilterIndex).toBeLessThan(minNonFilterIndex);
      }
    },
  );

  test.prop(
    [
      // Number of filter params (1-3)
      fc.integer({ min: 1, max: 3 }),
      // Number of non-filter params (1-4)
      fc.integer({ min: 1, max: 4 }),
    ],
    { numRuns: 100 },
  )(
    "filter prioritization holds regardless of inventory insertion order",
    (filterCount, nonFilterCount) => {
      const trackName = "Bass";
      const sectionIds = ["section-A", "section-B"];

      // Build inventory entries — interleave non-filter and filter in reverse order
      const inventory: ParameterInventoryEntry[] = [];

      // Add non-filter entries first (they should still end up AFTER filter in output)
      for (let i = 0; i < nonFilterCount; i++) {
        inventory.push({
          trackIndex: 0,
          trackName,
          deviceIndex: i,
          deviceName: "Compressor",
          parameterName: `Threshold ${i}`,
          min: 0,
          max: 1,
        });
      }

      // Add filter entries second
      for (let i = 0; i < filterCount; i++) {
        inventory.push({
          trackIndex: 0,
          trackName,
          deviceIndex: nonFilterCount + i,
          deviceName: "Auto Filter",
          parameterName: `Frequency ${i}`,
          min: 0,
          max: 1,
        });
      }

      const contrastGap: ContrastGapIssue = {
        id: "gap-test",
        type: "contrast_gap",
        severity: "critical",
        sectionIds,
        message: "Test gap",
      };

      const activeTracks = new Map<string, readonly string[]>();
      activeTracks.set("section-A", [trackName]);
      activeTracks.set("section-B", [trackName]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [contrastGap],
        transitionPoints: [],
        parameterInventory: inventory,
        automationData: null,
        sectionAutomationMap: null,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);
      const gapSuggestions = suggestions.filter((s) => s.type === "contrast_gap");

      // Must have suggestions since we have available params
      expect(gapSuggestions.length).toBeGreaterThan(0);

      // Verify prioritization: filter suggestions come before non-filter
      const filterIndices: number[] = [];
      const nonFilterIndices: number[] = [];

      for (let i = 0; i < gapSuggestions.length; i++) {
        if (isFilterSuggestion(gapSuggestions[i]!)) {
          filterIndices.push(i);
        } else {
          nonFilterIndices.push(i);
        }
      }

      if (filterIndices.length > 0 && nonFilterIndices.length > 0) {
        const maxFilterIndex = Math.max(...filterIndices);
        const minNonFilterIndex = Math.min(...nonFilterIndices);
        expect(maxFilterIndex).toBeLessThan(minNonFilterIndex);
      }
    },
  );
});


// ─── Property 10: Already-automated parameter suppression ─────────────

// Feature: automation-awareness, Property 10: Already-automated parameter suppression
describe("Property 10: Already-automated parameter suppression", () => {
  /**
   * **Validates: Requirements 3.5, 18.1**
   *
   * For any parameter that the AlsAutomationData indicates is actively automated
   * within a section's time range, generateAutomationSuggestions SHALL NOT produce
   * a suggestion for that parameter in that section. The unused parameter set SHALL
   * equal the full inventory minus the set of parameters with active automation.
   */

  test.prop(
    [
      // Number of params to mark as automated (1–3)
      fc.integer({ min: 1, max: 3 }),
      // Number of non-automated params (1–5)
      fc.integer({ min: 1, max: 5 }),
    ],
    { numRuns: 100 },
  )(
    "suggestions never include parameters that are already automated in the section",
    (automatedCount, nonAutomatedCount) => {
      const sectionId = "section-A";
      const trackIndex = 0;
      const trackName = "Lead Synth";
      const deviceName = "Auto Filter";

      // Build a mix of automated and non-automated parameters
      const automatedParams: ParameterInventoryEntry[] = Array.from(
        { length: automatedCount },
        (_, i) => ({
          trackIndex,
          trackName,
          deviceIndex: 0,
          deviceName,
          parameterName: `AutomatedParam${i}`,
          min: 0,
          max: 1,
        }),
      );

      const nonAutomatedParams: ParameterInventoryEntry[] = Array.from(
        { length: nonAutomatedCount },
        (_, i) => ({
          trackIndex,
          trackName,
          deviceIndex: 0,
          deviceName,
          parameterName: `FreeParam${i}`,
          min: 0,
          max: 1,
        }),
      );

      const parameterInventory = [...automatedParams, ...nonAutomatedParams];

      // Build AlsAutomationData with envelopes matching the automated params
      const automationData: AlsAutomationData = {
        envelopes: automatedParams.map((param, i) => ({
          trackIndex: param.trackIndex,
          pointeeId: 1000 + i,
          deviceName: param.deviceName,
          parameterName: param.parameterName,
          breakpoints: [
            { time: 0, value: 0.2 },
            { time: 8, value: 0.8 },
          ],
        })),
        parseTimeMs: 10,
        trackCount: 1,
      };

      // Build sectionAutomationMap indicating track has active envelopes in the section
      const sectionAutomationMap = new Map<string, SectionAutomationSummary[]>([
        [
          sectionId,
          [
            {
              trackIndex,
              activeEnvelopeCount: automatedCount,
              totalBreakpoints: automatedCount * 2,
            },
          ],
        ],
      ]);

      // Create a contrast gap referencing this section
      const contrastGap: ContrastGapIssue = {
        id: "gap-1",
        type: "contrast_gap",
        severity: "warning",
        sectionIds: [sectionId],
        message: "test gap",
      };

      // Active tracks map: the track is active in the section
      const activeTracks = new Map<string, readonly string[]>([
        [sectionId, [trackName]],
      ]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [contrastGap],
        transitionPoints: [],
        parameterInventory,
        automationData,
        sectionAutomationMap,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Build a set of automated parameter identifiers for easy checking
      const automatedKeys = new Set(
        automatedParams.map(
          (p) => `${p.trackName}|${p.deviceName}|${p.parameterName}`,
        ),
      );

      // Verify: NO suggestion references an already-automated parameter
      for (const suggestion of suggestions) {
        const key = `${suggestion.trackName}|${suggestion.deviceName}|${suggestion.parameterName}`;
        expect(
          automatedKeys.has(key),
          `Suggestion should NOT reference already-automated param "${suggestion.parameterName}" but did`,
        ).toBe(false);
      }
    },
  );

  test.prop(
    [
      // Number of params (all will be automated)
      fc.integer({ min: 1, max: 5 }),
    ],
    { numRuns: 100 },
  )(
    "when ALL parameters are automated, no non-fallback suggestions are generated for that section",
    (paramCount) => {
      const sectionId = "section-X";
      const trackIndex = 0;
      const trackName = "Bass";
      const deviceName = "EQ Eight";

      // All parameters are automated
      const params: ParameterInventoryEntry[] = Array.from(
        { length: paramCount },
        (_, i) => ({
          trackIndex,
          trackName,
          deviceIndex: 0,
          deviceName,
          parameterName: `Param${i}`,
          min: 0,
          max: 1,
        }),
      );

      const automationData: AlsAutomationData = {
        envelopes: params.map((param, i) => ({
          trackIndex: param.trackIndex,
          pointeeId: 2000 + i,
          deviceName: param.deviceName,
          parameterName: param.parameterName,
          breakpoints: [
            { time: 0, value: 0.1 },
            { time: 4, value: 0.9 },
          ],
        })),
        parseTimeMs: 5,
        trackCount: 1,
      };

      const sectionAutomationMap = new Map<string, SectionAutomationSummary[]>([
        [
          sectionId,
          [
            {
              trackIndex,
              activeEnvelopeCount: paramCount,
              totalBreakpoints: paramCount * 2,
            },
          ],
        ],
      ]);

      const contrastGap: ContrastGapIssue = {
        id: "gap-all-automated",
        type: "contrast_gap",
        severity: "warning",
        sectionIds: [sectionId],
        message: "all automated gap",
      };

      const activeTracks = new Map<string, readonly string[]>([
        [sectionId, [trackName]],
      ]);

      const input: AutomationSuggesterInput = {
        contrastGaps: [contrastGap],
        transitionPoints: [],
        parameterInventory: params,
        automationData,
        sectionAutomationMap,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      // Non-fallback suggestions (those from actual inventory) should not reference automated params
      const nonFallback = suggestions.filter((s) => s.deviceName !== "Mixer");
      const automatedKeys = new Set(
        params.map((p) => `${p.trackName}|${p.deviceName}|${p.parameterName}`),
      );

      for (const suggestion of nonFallback) {
        const key = `${suggestion.trackName}|${suggestion.deviceName}|${suggestion.parameterName}`;
        expect(
          automatedKeys.has(key),
          `Should not suggest automated param "${suggestion.parameterName}"`,
        ).toBe(false);
      }
    },
  );

  test.prop(
    [
      // Number of automated params (1–3)
      fc.integer({ min: 1, max: 3 }),
      // Number of non-automated params (1–4)
      fc.integer({ min: 1, max: 4 }),
    ],
    { numRuns: 100 },
  )(
    "only non-automated parameters appear in contrast gap suggestions",
    (automatedCount, freeCount) => {
      const sectionIds = ["section-1", "section-2"];
      const trackIndex = 0;
      const trackName = "Pad";
      const deviceName = "Filter";

      const automatedParams: ParameterInventoryEntry[] = Array.from(
        { length: automatedCount },
        (_, i) => ({
          trackIndex,
          trackName,
          deviceIndex: 0,
          deviceName,
          parameterName: `Automated_${i}`,
          min: 0,
          max: 1,
        }),
      );

      const freeParams: ParameterInventoryEntry[] = Array.from(
        { length: freeCount },
        (_, i) => ({
          trackIndex,
          trackName,
          deviceIndex: 0,
          deviceName,
          parameterName: `Free_${i}`,
          min: 0,
          max: 1,
        }),
      );

      const parameterInventory = [...automatedParams, ...freeParams];

      // Automation data covering both sections
      const automationData: AlsAutomationData = {
        envelopes: automatedParams.map((param, i) => ({
          trackIndex: param.trackIndex,
          pointeeId: 3000 + i,
          deviceName: param.deviceName,
          parameterName: param.parameterName,
          breakpoints: [
            { time: 0, value: 0.3 },
            { time: 16, value: 0.7 },
          ],
        })),
        parseTimeMs: 8,
        trackCount: 1,
      };

      // Both sections have the track with active automation
      const sectionAutomationMap = new Map<string, SectionAutomationSummary[]>();
      for (const sid of sectionIds) {
        sectionAutomationMap.set(sid, [
          {
            trackIndex,
            activeEnvelopeCount: automatedCount,
            totalBreakpoints: automatedCount * 2,
          },
        ]);
      }

      const contrastGap: ContrastGapIssue = {
        id: "gap-mixed",
        type: "contrast_gap",
        severity: "warning",
        sectionIds,
        message: "mixed automation gap",
      };

      const activeTracks = new Map<string, readonly string[]>();
      for (const sid of sectionIds) {
        activeTracks.set(sid, [trackName]);
      }

      const input: AutomationSuggesterInput = {
        contrastGaps: [contrastGap],
        transitionPoints: [],
        parameterInventory,
        automationData,
        sectionAutomationMap,
        activeTracks,
        genre: null,
      };

      const suggestions = generateAutomationSuggestions(input);

      const automatedKeys = new Set(
        automatedParams.map(
          (p) => `${p.trackName}|${p.deviceName}|${p.parameterName}`,
        ),
      );

      const freeKeys = new Set(
        freeParams.map(
          (p) => `${p.trackName}|${p.deviceName}|${p.parameterName}`,
        ),
      );

      // Non-fallback suggestions should only reference free (non-automated) params
      const nonFallback = suggestions.filter((s) => s.deviceName !== "Mixer");
      for (const suggestion of nonFallback) {
        const key = `${suggestion.trackName}|${suggestion.deviceName}|${suggestion.parameterName}`;
        expect(
          automatedKeys.has(key),
          `Automated param "${suggestion.parameterName}" should be suppressed`,
        ).toBe(false);
        expect(
          freeKeys.has(key),
          `Suggestion "${suggestion.parameterName}" should be from the free param set`,
        ).toBe(true);
      }
    },
  );
});
