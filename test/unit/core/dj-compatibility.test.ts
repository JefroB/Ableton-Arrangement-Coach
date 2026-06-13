import { describe, it, expect } from "vitest";
import { _detectDJCompatibility } from "../../../src/core/issue-detector.js";
import type { Section } from "../../../src/core/section-scanner.js";
import type { GenreThresholdProfile } from "../../../src/core/genre-registry.js";

const makeSection = (index: number, startTime: number, endTime: number, name?: string): Section => ({
  id: `section-${index}`,
  name: name ?? `Section ${index}`,
  startTime,
  endTime,
});

const technoThresholds: GenreThresholdProfile = {
  flatEnergyDelta: 2,
  repetitionSimilarity: 0.92,
  abruptChangeDelta: 5,
  crowdingTrackCount: 3,
  introMinBars: 32,
  outroMinBars: 32,
};

const dnbThresholds: GenreThresholdProfile = {
  flatEnergyDelta: 1,
  repetitionSimilarity: 0.85,
  abruptChangeDelta: 5,
  crowdingTrackCount: 3,
  introMinBars: 16,
  outroMinBars: 16,
};

describe("detectDJCompatibility", () => {
  // ─── Skip checks for non-DJ genres ─────────────────────────────────

  it("returns empty array for null genre", () => {
    const sections = [makeSection(0, 0, 32)];
    const result = _detectDJCompatibility(sections, [3], technoThresholds, null);
    expect(result).toEqual([]);
  });

  it("returns empty array for Pop genre", () => {
    const sections = [makeSection(0, 0, 32)];
    const result = _detectDJCompatibility(sections, [3], technoThresholds, "pop-electronic");
    expect(result).toEqual([]);
  });

  it("returns empty array for Ambient genre", () => {
    const sections = [makeSection(0, 0, 32)];
    const result = _detectDJCompatibility(sections, [3], technoThresholds, "ambient-downtempo");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty sections", () => {
    const result = _detectDJCompatibility([], [], technoThresholds, "techno");
    expect(result).toEqual([]);
  });

  // ─── Intro length check ────────────────────────────────────────────

  it("reports intro-length warning when first section bars < genre minimum", () => {
    // 64 beats = 16 bars, Techno minimum is 32 bars
    const sections = [makeSection(0, 0, 64), makeSection(1, 64, 256)];
    const result = _detectDJCompatibility(sections, [2, 5], technoThresholds, "techno");

    const introIssue = result.find((i) => i.type === "intro-length");
    expect(introIssue).toBeDefined();
    expect(introIssue!.severity).toBe("warning");
    expect(introIssue!.sectionIds).toEqual(["section-0"]);
    expect(introIssue!.id).toBe("intro-length-section-0");
  });

  it("does not report intro-length when first section meets minimum", () => {
    // 128 beats = 32 bars, Techno minimum is 32 bars
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [2, 3], technoThresholds, "techno");

    const introIssue = result.find((i) => i.type === "intro-length");
    expect(introIssue).toBeUndefined();
  });

  // ─── Outro length check ────────────────────────────────────────────

  it("reports outro-length warning when last section bars < genre minimum", () => {
    // 64 beats = 16 bars for last section, Techno minimum is 32 bars
    const sections = [makeSection(0, 0, 192), makeSection(1, 192, 256)];
    const result = _detectDJCompatibility(sections, [2, 3], technoThresholds, "techno");

    const outroIssue = result.find((i) => i.type === "outro-length");
    expect(outroIssue).toBeDefined();
    expect(outroIssue!.severity).toBe("warning");
    expect(outroIssue!.sectionIds).toEqual(["section-1"]);
    expect(outroIssue!.id).toBe("outro-length-section-1");
  });

  it("does not report outro-length when last section meets minimum", () => {
    // 128 beats = 32 bars, Techno minimum is 32 bars
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [2, 3], technoThresholds, "techno");

    const outroIssue = result.find((i) => i.type === "outro-length");
    expect(outroIssue).toBeUndefined();
  });

  // ─── Intro energy check ────────────────────────────────────────────

  it("reports intro-energy warning when first section energy > 4", () => {
    // 128 beats = 32 bars (meets minimum), energy = 6
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [6, 3], technoThresholds, "techno");

    const energyIssue = result.find((i) => i.type === "intro-energy");
    expect(energyIssue).toBeDefined();
    expect(energyIssue!.severity).toBe("warning");
    expect(energyIssue!.sectionIds).toEqual(["section-0"]);
    expect(energyIssue!.id).toBe("intro-energy-section-0");
    expect(energyIssue!.message).toContain("6");
  });

  it("does not report intro-energy when first section energy is exactly 4", () => {
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [4, 3], technoThresholds, "techno");

    const energyIssue = result.find((i) => i.type === "intro-energy");
    expect(energyIssue).toBeUndefined();
  });

  it("does not report intro-energy when first section energy < 4", () => {
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [3, 5], technoThresholds, "techno");

    const energyIssue = result.find((i) => i.type === "intro-energy");
    expect(energyIssue).toBeUndefined();
  });

  // ─── Energy mismatch check ─────────────────────────────────────────

  it("reports energy-mismatch info when last energy > first energy + 2", () => {
    // 128 beats = 32 bars (meets minimum), energies: first=2, last=5 → diff=3 > 2
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [2, 5], technoThresholds, "techno");

    const mismatchIssue = result.find((i) => i.type === "energy-mismatch");
    expect(mismatchIssue).toBeDefined();
    expect(mismatchIssue!.severity).toBe("info");
    expect(mismatchIssue!.sectionIds).toEqual(["section-0", "section-1"]);
    expect(mismatchIssue!.id).toBe("energy-mismatch-section-0-section-1");
    expect(mismatchIssue!.message).toContain("5");
    expect(mismatchIssue!.message).toContain("2");
  });

  it("does not report energy-mismatch when diff is exactly 2", () => {
    const sections = [makeSection(0, 0, 128), makeSection(1, 128, 256)];
    const result = _detectDJCompatibility(sections, [3, 5], technoThresholds, "techno");

    const mismatchIssue = result.find((i) => i.type === "energy-mismatch");
    expect(mismatchIssue).toBeUndefined();
  });

  it("does not report energy-mismatch with only 1 section", () => {
    // Single section, energy high enough to trigger other checks
    const sections = [makeSection(0, 0, 64)];
    const result = _detectDJCompatibility(sections, [6], technoThresholds, "techno");

    const mismatchIssue = result.find((i) => i.type === "energy-mismatch");
    expect(mismatchIssue).toBeUndefined();
  });

  // ─── DJ-oriented genres work ───────────────────────────────────────

  it("works for House genre", () => {
    const sections = [makeSection(0, 0, 64)]; // 16 bars < 32
    const result = _detectDJCompatibility(sections, [2], technoThresholds, "house");

    expect(result.some((i) => i.type === "intro-length")).toBe(true);
  });

  it("works for Trance genre", () => {
    const sections = [makeSection(0, 0, 64)]; // 16 bars < 32
    const result = _detectDJCompatibility(sections, [2], technoThresholds, "trance");

    expect(result.some((i) => i.type === "intro-length")).toBe(true);
  });

  it("works for Drum and Bass genre with lower threshold", () => {
    // 64 beats = 16 bars, DnB minimum is 16 bars → meets minimum
    const sections = [makeSection(0, 0, 64), makeSection(1, 64, 128)];
    const result = _detectDJCompatibility(sections, [2, 3], dnbThresholds, "drum-and-bass");

    const introIssue = result.find((i) => i.type === "intro-length");
    expect(introIssue).toBeUndefined();
  });

  // ─── Message truncation ────────────────────────────────────────────

  it("truncates messages to 200 characters max", () => {
    const sections = [makeSection(0, 0, 64), makeSection(1, 64, 128)];
    const result = _detectDJCompatibility(sections, [2, 5], technoThresholds, "techno");

    for (const issue of result) {
      expect(issue.message.length).toBeLessThanOrEqual(200);
    }
  });
});
