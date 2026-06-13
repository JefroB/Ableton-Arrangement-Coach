import { describe, it, expect } from "vitest";
import { _detectMissingTransitions, _hasTransitionElement } from "../../../src/core/issue-detector.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { TrackClipData } from "../../../src/core/section-analyzer.js";
import type { TrackInfo } from "../../../src/core/track-reader.js";
import type { ClipData } from "../../../src/ableton/sdk-adapter.js";

// ─── Helpers ───────────────────────────────────────────────────────────

const makeSection = (index: number, name?: string, startTime?: number, endTime?: number): Section => ({
  id: `section-${index}`,
  name: name ?? `Section ${index}`,
  startTime: startTime ?? index * 32,
  endTime: endTime ?? (index + 1) * 32,
});

const makeClip = (startTime: number, endTime: number, opts?: Partial<ClipData>): ClipData => ({
  startTime,
  endTime,
  muted: false,
  hasEnvelopes: false,
  ...opts,
});

const makeTrackClipData = (
  trackName: string,
  clips: ClipData[],
  trackType: "midi" | "audio" = "midi",
): TrackClipData => ({
  trackName,
  trackType,
  clips,
});

// ─── detectMissingTransitions Tests ─────────────────────────────────────

describe("detectMissingTransitions", () => {
  it("returns empty array when fewer than 2 sections", () => {
    const sections = [makeSection(0)];
    const energyCurve = [5];
    expect(_detectMissingTransitions(sections, energyCurve, [], [])).toEqual([]);
  });

  it("returns empty array for 0 sections", () => {
    expect(_detectMissingTransitions([], [], [], [])).toEqual([]);
  });

  it("returns empty array when energy delta is below 3", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [5, 7]; // delta = 2
    expect(_detectMissingTransitions(sections, energyCurve, [], [])).toEqual([]);
  });

  it("returns empty array when energy delta is exactly 2", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [5, 7]; // delta = 2, below threshold
    expect(_detectMissingTransitions(sections, energyCurve, [], [])).toEqual([]);
  });

  it("reports issue when delta is exactly 3 and no transition element", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [5, 8]; // delta = 3
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("missing-transition");
    expect(result[0]!.severity).toBe("warning");
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1"]);
  });

  it("reports warning severity for delta 3–4", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [5, 9]; // delta = 4
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("warning");
  });

  it("reports critical severity for delta >= 5", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [2, 7]; // delta = 5
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("critical");
  });

  it("reports critical severity for delta of 6", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [1, 7]; // delta = 6
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("critical");
  });

  it("detects downward energy jumps (negative delta)", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [8, 4]; // delta = |-4| = 4
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("warning");
  });

  it("generates correct issue ID format", () => {
    const sections = [makeSection(0), makeSection(1)];
    const energyCurve = [2, 8]; // delta = 6
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result[0]!.id).toBe("missing-transition-section-0-section-1");
  });

  it("generates actionable message with section names and delta", () => {
    const sections = [makeSection(0, "Intro"), makeSection(1, "Drop")];
    const energyCurve = [3, 8]; // delta = 5
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result[0]!.message).toContain("Intro");
    expect(result[0]!.message).toContain("Drop");
    expect(result[0]!.message).toContain("5");
    expect(result[0]!.message).toContain("riser");
  });

  it("truncates message to 200 characters", () => {
    const longName = "A".repeat(100);
    const sections = [makeSection(0, longName), makeSection(1, longName)];
    const energyCurve = [2, 8];
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result[0]!.message.length).toBeLessThanOrEqual(200);
  });

  it("does NOT report issue when transition element with hasEnvelopes is in window", () => {
    // Section 0: startTime=0, endTime=32. Window = last 16 beats → [16, 32)
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8]; // delta = 5
    const trackClipData = [
      makeTrackClipData("Lead", [makeClip(20, 30, { hasEnvelopes: true })]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toEqual([]);
  });

  it("does NOT report issue when clip exists on transition keyword track in window", () => {
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8]; // delta = 5
    const trackClipData = [
      makeTrackClipData("Riser FX", [makeClip(20, 30)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toEqual([]);
  });

  it("does NOT report issue when clip exists on return track in window", () => {
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8]; // delta = 5
    const trackClipData = [
      makeTrackClipData("Reverb Send", [makeClip(20, 30)]),
    ];
    const trackInventory: TrackInfo[] = [
      { name: "Reverb Send", type: "return" as unknown as "midi" | "audio" },
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, trackInventory);

    expect(result).toEqual([]);
  });

  it("reports issue when transition element is outside the window", () => {
    // Section 0: startTime=0, endTime=32. Window = [16, 32)
    // Clip at [0, 10] is NOT in window
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8];
    const trackClipData = [
      makeTrackClipData("Riser FX", [makeClip(0, 10)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toHaveLength(1);
  });

  it("uses entire section as window when section is shorter than 4 bars", () => {
    // Section shorter than 16 beats → entire section is window
    const sections = [makeSection(0, "Short", 0, 8), makeSection(1, "Drop", 8, 40)];
    const energyCurve = [3, 8]; // delta = 5
    // Clip at [2, 6] is within [0, 8) → transition found
    const trackClipData = [
      makeTrackClipData("Sweep FX", [makeClip(2, 6)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toEqual([]);
  });

  it("detects multiple missing transitions across multiple boundaries", () => {
    const sections = [
      makeSection(0, "Intro", 0, 32),
      makeSection(1, "Build", 32, 64),
      makeSection(2, "Drop", 64, 96),
    ];
    const energyCurve = [2, 6, 10]; // deltas: 4, 4 → both above threshold
    const result = _detectMissingTransitions(sections, energyCurve, [], []);

    expect(result).toHaveLength(2);
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1"]);
    expect(result[1]!.sectionIds).toEqual(["section-1", "section-2"]);
  });

  it("handles transition keywords case-insensitively", () => {
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8]; // delta = 5
    const trackClipData = [
      makeTrackClipData("MY RISER", [makeClip(20, 30)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toEqual([]);
  });

  it("recognizes all transition keywords", () => {
    const keywords = ["riser", "sweep", "fx", "fill", "trans", "build"];
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8]; // delta = 5

    for (const keyword of keywords) {
      const trackClipData = [
        makeTrackClipData(`Track ${keyword} 1`, [makeClip(20, 30)]),
      ];
      const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);
      expect(result).toEqual([]);
    }
  });

  it("clip at window boundary (startTime = windowEnd) is NOT in window", () => {
    // Section 0: [0, 32), Window: [16, 32)
    // Clip starts exactly at windowEnd (32) — no overlap
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8];
    const trackClipData = [
      makeTrackClipData("Riser FX", [makeClip(32, 40)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toHaveLength(1);
  });

  it("clip ending at windowStart is NOT in window", () => {
    // Section 0: [0, 32), Window: [16, 32)
    // Clip ends exactly at windowStart (16) — no overlap
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8];
    const trackClipData = [
      makeTrackClipData("Riser FX", [makeClip(8, 16)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toHaveLength(1);
  });

  it("clip partially overlapping window is detected", () => {
    // Section 0: [0, 32), Window: [16, 32)
    // Clip [14, 18] overlaps window at [16, 18)
    const sections = [makeSection(0, "Intro", 0, 32), makeSection(1, "Drop", 32, 64)];
    const energyCurve = [3, 8];
    const trackClipData = [
      makeTrackClipData("Riser FX", [makeClip(14, 18)]),
    ];
    const result = _detectMissingTransitions(sections, energyCurve, trackClipData, []);

    expect(result).toEqual([]);
  });
});

// ─── hasTransitionElement Tests ─────────────────────────────────────────

describe("hasTransitionElement", () => {
  it("returns false when no clips exist", () => {
    expect(_hasTransitionElement(16, 32, [], new Set())).toBe(false);
  });

  it("returns true for clip with hasEnvelopes in window", () => {
    const trackClipData = [
      makeTrackClipData("Synth", [makeClip(20, 28, { hasEnvelopes: true })]),
    ];
    expect(_hasTransitionElement(16, 32, trackClipData, new Set())).toBe(true);
  });

  it("returns false for clip with hasEnvelopes outside window", () => {
    const trackClipData = [
      makeTrackClipData("Synth", [makeClip(0, 10, { hasEnvelopes: true })]),
    ];
    expect(_hasTransitionElement(16, 32, trackClipData, new Set())).toBe(false);
  });

  it("returns true for clip on transition keyword track in window", () => {
    const trackClipData = [
      makeTrackClipData("FX Riser", [makeClip(20, 28)]),
    ];
    expect(_hasTransitionElement(16, 32, trackClipData, new Set())).toBe(true);
  });

  it("returns true for clip on return track in window", () => {
    const trackClipData = [
      makeTrackClipData("Reverb", [makeClip(20, 28)]),
    ];
    const returnTrackNames = new Set(["Reverb"]);
    expect(_hasTransitionElement(16, 32, trackClipData, returnTrackNames)).toBe(true);
  });

  it("returns false when clip does not overlap window", () => {
    const trackClipData = [
      makeTrackClipData("Riser", [makeClip(0, 15)]),
    ];
    // clip.endTime (15) <= windowStart (16) → no overlap
    expect(_hasTransitionElement(16, 32, trackClipData, new Set())).toBe(false);
  });

  it("returns false for regular clip without envelopes on non-keyword non-return track", () => {
    const trackClipData = [
      makeTrackClipData("Bass", [makeClip(20, 28)]),
    ];
    expect(_hasTransitionElement(16, 32, trackClipData, new Set())).toBe(false);
  });
});
