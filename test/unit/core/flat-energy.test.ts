import { describe, it, expect } from "vitest";
import { _detectFlatEnergy } from "../../../src/core/issue-detector.js";
import type { Section } from "../../../src/core/section-scanner.js";

const makeSection = (index: number, name?: string): Section => ({
  id: `section-${index}`,
  name: name ?? `Section ${index}`,
  startTime: index * 16,
  endTime: (index + 1) * 16,
});

describe("detectFlatEnergy", () => {
  it("returns empty array when fewer than 2 sections", () => {
    const sections = [makeSection(0)];
    const energyCurve = [5];
    expect(_detectFlatEnergy(sections, energyCurve, 1)).toEqual([]);
  });

  it("returns empty array for 0 sections", () => {
    expect(_detectFlatEnergy([], [], 1)).toEqual([]);
  });

  it("returns empty array when energy differences are at or above the threshold", () => {
    const sections = [makeSection(0), makeSection(1), makeSection(2)];
    // deltas: |6-5|=1, |7-6|=1 — both are NOT < 1 (equal to threshold)
    const energyCurve = [5, 6, 7];
    expect(_detectFlatEnergy(sections, energyCurve, 1)).toEqual([]);
  });

  it("reports warning for exactly 2 consecutive flat sections", () => {
    const sections = [makeSection(0), makeSection(1), makeSection(2)];
    // deltas: |5-5|=0 < 1 (flat), |7-5|=2 >= 1 (not flat)
    const energyCurve = [5, 5, 7];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("flat-energy");
    expect(result[0]!.severity).toBe("warning");
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1"]);
    expect(result[0]!.id).toBe("flat-energy-section-0-section-1");
  });

  it("reports critical for 3+ consecutive flat sections", () => {
    const sections = [makeSection(0), makeSection(1), makeSection(2), makeSection(3)];
    // deltas: |5-5|=0 < 1, |5-5|=0 < 1, |5-5|=0 < 1 → run of 4 sections
    const energyCurve = [5, 5, 5, 5];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("flat-energy");
    expect(result[0]!.severity).toBe("critical");
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1", "section-2", "section-3"]);
    expect(result[0]!.id).toBe("flat-energy-section-0-...-section-3");
  });

  it("reports critical for exactly 3 consecutive flat sections", () => {
    const sections = [makeSection(0), makeSection(1), makeSection(2), makeSection(3)];
    // deltas: |5-5|=0 < 1, |5-5|=0 < 1, |8-5|=3 >= 1
    const energyCurve = [5, 5, 5, 8];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("critical");
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1", "section-2"]);
  });

  it("detects multiple separate flat runs", () => {
    const sections = [
      makeSection(0), makeSection(1), // flat pair
      makeSection(2),                 // break
      makeSection(3), makeSection(4), // another flat pair
    ];
    // deltas: |5-5|=0<1, |8-5|=3>=1, |3-8|=5>=1, |3-3|=0<1
    const energyCurve = [5, 5, 8, 3, 3];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(2);
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1"]);
    expect(result[0]!.severity).toBe("warning");
    expect(result[1]!.sectionIds).toEqual(["section-3", "section-4"]);
    expect(result[1]!.severity).toBe("warning");
  });

  it("uses the provided flatEnergyDelta threshold", () => {
    const sections = [makeSection(0), makeSection(1), makeSection(2)];
    // With threshold=2: |6-5|=1 < 2 (flat), |7-6|=1 < 2 (flat) → run of 3, critical
    const energyCurve = [5, 6, 7];
    const result = _detectFlatEnergy(sections, energyCurve, 2);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("critical");
    expect(result[0]!.sectionIds).toEqual(["section-0", "section-1", "section-2"]);
  });

  it("generates actionable message referencing section names", () => {
    const sections = [makeSection(0, "Intro"), makeSection(1, "Verse")];
    const energyCurve = [5, 5];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("Intro");
    expect(result[0]!.message).toContain("Verse");
    expect(result[0]!.message).toContain("variation");
  });

  it("generates appropriate message for runs of 3+", () => {
    const sections = [makeSection(0, "Intro"), makeSection(1, "Verse"), makeSection(2, "Chorus")];
    const energyCurve = [5, 5, 5];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("Intro");
    expect(result[0]!.message).toContain("Chorus");
    expect(result[0]!.message).toContain("3 sections");
  });

  it("truncates messages to 200 characters", () => {
    const longName = "A".repeat(100);
    const sections = [makeSection(0, longName), makeSection(1, longName)];
    const energyCurve = [5, 5];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.message.length).toBeLessThanOrEqual(200);
  });

  it("correctly identifies flat when energy differences are just below threshold", () => {
    const sections = [makeSection(0), makeSection(1)];
    // delta = |5.9-5|=0.9 < 1 → flat
    const energyCurve = [5, 5.9];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("warning");
  });

  it("does not flag when energy difference equals threshold exactly", () => {
    const sections = [makeSection(0), makeSection(1)];
    // delta = |6-5|=1 which is NOT < 1 → not flat
    const energyCurve = [5, 6];
    const result = _detectFlatEnergy(sections, energyCurve, 1);

    expect(result).toEqual([]);
  });
});
