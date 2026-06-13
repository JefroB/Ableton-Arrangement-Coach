/**
 * Unit tests for Automation Suggester.
 *
 * Validates Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 18.1, 18.2, 18.4, 18.6, 18.7
 */
import { describe, it, expect } from "vitest";
import {
  generateAutomationSuggestions,
  type AutomationSuggestion,
  type AutomationSuggesterInput,
  type TransitionPoint,
} from "./automation-suggester.js";
import type { ContrastGapIssue } from "./contrast-gap-detector.js";
import type { ParameterInventoryEntry } from "./parameter-scanner.js";
import type { AlsAutomationData, SectionAutomationSummary } from "./als-parser.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeInventoryEntry(
  overrides: Partial<ParameterInventoryEntry> = {},
): ParameterInventoryEntry {
  return {
    trackIndex: 0,
    trackName: "Bass",
    deviceIndex: 0,
    deviceName: "Synth",
    parameterName: "Cutoff",
    min: 0,
    max: 1,
    ...overrides,
  };
}

function makeContrastGap(
  sectionIds: readonly string[],
  overrides: Partial<ContrastGapIssue> = {},
): ContrastGapIssue {
  return {
    id: "gap-1",
    type: "contrast_gap",
    severity: sectionIds.length >= 3 ? "critical" : "warning",
    sectionIds,
    message: "Sections sound too similar",
    ...overrides,
  };
}

function makeTransitionPoint(
  fromSectionId: string,
  toSectionId: string,
  energyDelta = 0.3,
): TransitionPoint {
  return { fromSectionId, toSectionId, energyDelta };
}

function makeBaseInput(overrides: Partial<AutomationSuggesterInput> = {}): AutomationSuggesterInput {
  return {
    contrastGaps: [],
    transitionPoints: [],
    parameterInventory: [],
    automationData: null,
    sectionAutomationMap: null,
    activeTracks: new Map(),
    genre: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("generateAutomationSuggestions", () => {
  describe("fallback behavior", () => {
    it("empty inventory falls back to generic mixer suggestion", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Bass"]],
        ["s1", ["Bass"]],
      ]);

      const input = makeBaseInput({
        contrastGaps: [makeContrastGap(["s0", "s1"])],
        parameterInventory: [], // empty inventory
        activeTracks,
      });

      const suggestions = generateAutomationSuggestions(input);

      expect(suggestions.length).toBeGreaterThan(0);
      // Fallback should reference Mixer device with Track Volume or Track Pan
      const hasMixerSuggestion = suggestions.some(
        (s) => s.deviceName === "Mixer" && (s.parameterName === "Track Volume" || s.parameterName === "Track Pan"),
      );
      expect(hasMixerSuggestion).toBe(true);
    });
  });

  describe("filter prioritization", () => {
    it("filter parameter prioritized over non-filter", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Bass", "Lead"]],
        ["s1", ["Bass", "Lead"]],
      ]);

      const parameterInventory: ParameterInventoryEntry[] = [
        // Non-filter device parameter (listed first in inventory)
        makeInventoryEntry({
          trackIndex: 1,
          trackName: "Lead",
          deviceName: "Reverb",
          parameterName: "Decay Time",
        }),
        // Filter device parameter (listed second but should be prioritized)
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Bass",
          deviceName: "Auto Filter",
          parameterName: "Frequency",
        }),
      ];

      const input = makeBaseInput({
        contrastGaps: [makeContrastGap(["s0", "s1"])],
        parameterInventory,
        activeTracks,
      });

      const suggestions = generateAutomationSuggestions(input);

      expect(suggestions.length).toBeGreaterThanOrEqual(2);
      // First suggestion should be from the filter device
      expect(suggestions[0]!.deviceName).toBe("Auto Filter");
      expect(suggestions[0]!.parameterName).toBe("Frequency");
      // Second suggestion should be from the non-filter device
      expect(suggestions[1]!.deviceName).toBe("Reverb");
    });
  });

  describe("suggestion caps", () => {
    it("max 3 suggestions per contrast gap", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Bass"]],
        ["s1", ["Bass"]],
      ]);

      // Provide more than 3 parameters so we can verify the cap
      const parameterInventory: ParameterInventoryEntry[] = Array.from(
        { length: 10 },
        (_, i) =>
          makeInventoryEntry({
            trackIndex: 0,
            trackName: "Bass",
            deviceIndex: i,
            deviceName: `Device${i}`,
            parameterName: `Param${i}`,
          }),
      );

      const input = makeBaseInput({
        contrastGaps: [makeContrastGap(["s0", "s1"])],
        parameterInventory,
        activeTracks,
      });

      const suggestions = generateAutomationSuggestions(input);

      // All suggestions for this gap should have type "contrast_gap"
      const gapSuggestions = suggestions.filter((s) => s.type === "contrast_gap");
      expect(gapSuggestions).toHaveLength(3);
    });

    it("max 2 suggestions per transition", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Bass"]],
        ["s1", ["Bass"]],
      ]);

      // Provide many transition-relevant parameters
      const parameterInventory: ParameterInventoryEntry[] = [
        makeInventoryEntry({ trackName: "Bass", deviceName: "Filter1", parameterName: "Filter Freq" }),
        makeInventoryEntry({ trackName: "Bass", deviceName: "Filter2", parameterName: "Resonance" }),
        makeInventoryEntry({ trackName: "Bass", deviceName: "Filter3", parameterName: "Cutoff" }),
        makeInventoryEntry({ trackName: "Bass", deviceName: "Mixer", parameterName: "Send A" }),
        makeInventoryEntry({ trackName: "Bass", deviceName: "Mixer", parameterName: "Volume" }),
      ];

      const input = makeBaseInput({
        transitionPoints: [makeTransitionPoint("s0", "s1")],
        parameterInventory,
        activeTracks,
      });

      const suggestions = generateAutomationSuggestions(input);

      const transitionSuggestions = suggestions.filter((s) => s.type === "transition");
      expect(transitionSuggestions).toHaveLength(2);
    });
  });

  describe("already-automated suppression", () => {
    it("already-automated parameter suppressed", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Bass"]],
        ["s1", ["Bass"]],
      ]);

      const parameterInventory: ParameterInventoryEntry[] = [
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Bass",
          deviceName: "Auto Filter",
          parameterName: "Frequency",
        }),
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Bass",
          deviceName: "Reverb",
          parameterName: "Decay",
        }),
      ];

      // Simulate that "Frequency" on "Auto Filter" is already automated
      const automationData: AlsAutomationData = {
        envelopes: [
          {
            trackIndex: 0,
            pointeeId: 100,
            deviceName: "Auto Filter",
            parameterName: "Frequency",
            breakpoints: [
              { time: 0, value: 0.2 },
              { time: 8, value: 0.8 },
            ],
          },
        ],
        parseTimeMs: 10,
        trackCount: 1,
      };

      // Section automation map shows track 0 has active automation in s0
      const sectionAutomationMap = new Map<string, SectionAutomationSummary[]>([
        ["s0", [{ trackIndex: 0, activeEnvelopeCount: 1, totalBreakpoints: 2 }]],
        ["s1", [{ trackIndex: 0, activeEnvelopeCount: 1, totalBreakpoints: 2 }]],
      ]);

      const input = makeBaseInput({
        contrastGaps: [makeContrastGap(["s0", "s1"])],
        parameterInventory,
        activeTracks,
        automationData,
        sectionAutomationMap,
      });

      const suggestions = generateAutomationSuggestions(input);

      // The already-automated "Frequency" parameter should NOT appear in suggestions
      const hasFrequency = suggestions.some(
        (s) => s.deviceName === "Auto Filter" && s.parameterName === "Frequency",
      );
      expect(hasFrequency).toBe(false);

      // The non-automated "Decay" parameter should appear
      const hasDecay = suggestions.some(
        (s) => s.deviceName === "Reverb" && s.parameterName === "Decay",
      );
      expect(hasDecay).toBe(true);
    });
  });

  describe("suggestion format", () => {
    it("suggestion format includes track, device, parameter, pattern", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Synth Lead"]],
        ["s1", ["Synth Lead"]],
      ]);

      const parameterInventory: ParameterInventoryEntry[] = [
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Synth Lead",
          deviceName: "EQ Eight",
          parameterName: "Frequency",
        }),
      ];

      const input = makeBaseInput({
        contrastGaps: [makeContrastGap(["s0", "s1"])],
        parameterInventory,
        activeTracks,
      });

      const suggestions = generateAutomationSuggestions(input);

      expect(suggestions).toHaveLength(1);
      const suggestion = suggestions[0]!;

      // All required fields are present and non-empty
      expect(suggestion.trackName).toBe("Synth Lead");
      expect(suggestion.trackName.length).toBeGreaterThan(0);
      expect(suggestion.deviceName).toBe("EQ Eight");
      expect(suggestion.deviceName.length).toBeGreaterThan(0);
      expect(suggestion.parameterName).toBe("Frequency");
      expect(suggestion.parameterName.length).toBeGreaterThan(0);
      expect(suggestion.pattern.length).toBeGreaterThan(0);
      expect(suggestion.sectionIds).toEqual(["s0", "s1"]);
      expect(suggestion.type).toBe("contrast_gap");
    });
  });

  describe("genre-specific ranking", () => {
    it("techno genre prioritizes filter parameters", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Bass", "Pad"]],
        ["s1", ["Bass", "Pad"]],
      ]);

      const parameterInventory: ParameterInventoryEntry[] = [
        // Non-filter params first in inventory
        makeInventoryEntry({
          trackIndex: 1,
          trackName: "Pad",
          deviceName: "Reverb",
          parameterName: "Room Size",
        }),
        makeInventoryEntry({
          trackIndex: 1,
          trackName: "Pad",
          deviceName: "Delay",
          parameterName: "Feedback",
        }),
        // Filter device — should be prioritized for techno
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Bass",
          deviceName: "Auto Filter",
          parameterName: "Filter Freq",
        }),
      ];

      const input = makeBaseInput({
        contrastGaps: [makeContrastGap(["s0", "s1"])],
        parameterInventory,
        activeTracks,
        genre: "techno",
      });

      const suggestions = generateAutomationSuggestions(input);

      expect(suggestions.length).toBeGreaterThan(0);
      // For techno, filter parameters should appear first
      expect(suggestions[0]!.deviceName).toBe("Auto Filter");
      expect(suggestions[0]!.parameterName).toBe("Filter Freq");
    });

    it("ambient genre still gets send-related suggestions for transitions", () => {
      const activeTracks = new Map<string, readonly string[]>([
        ["s0", ["Pad"]],
        ["s1", ["Pad"]],
      ]);

      const parameterInventory: ParameterInventoryEntry[] = [
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Pad",
          deviceName: "Mixer",
          parameterName: "Send A",
        }),
        makeInventoryEntry({
          trackIndex: 0,
          trackName: "Pad",
          deviceName: "Mixer",
          parameterName: "Send B",
        }),
      ];

      const input = makeBaseInput({
        transitionPoints: [makeTransitionPoint("s0", "s1")],
        parameterInventory,
        activeTracks,
        genre: "ambient",
      });

      const suggestions = generateAutomationSuggestions(input);

      expect(suggestions.length).toBeGreaterThan(0);
      // Ambient genre should get send-related suggestions for transitions
      const hasSendSuggestion = suggestions.some((s) =>
        s.parameterName.toLowerCase().includes("send"),
      );
      expect(hasSendSuggestion).toBe(true);
    });
  });
});
