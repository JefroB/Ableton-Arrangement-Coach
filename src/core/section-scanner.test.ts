import { describe, it, expect } from "vitest";
import { buildSections } from "./section-scanner.js";
import type { LocatorData } from "../ableton/sdk-adapter.js";

describe("buildSections", () => {
  it("returns an empty array when given zero locators", () => {
    const result = buildSections([]);
    expect(result).toEqual([]);
  });

  it("returns a single section spanning to Infinity for one locator", () => {
    const locators: LocatorData[] = [{ name: "Intro", time: 0 }];
    const result = buildSections(locators);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "section-0",
      name: "Intro",
      startTime: 0,
      endTime: Infinity,
    });
  });

  it("returns a single section from a non-zero time to Infinity", () => {
    const locators: LocatorData[] = [{ name: "Drop", time: 64 }];
    const result = buildSections(locators);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "section-0",
      name: "Drop",
      startTime: 64,
      endTime: Infinity,
    });
  });

  it("sorts locators by time and assigns sequential IDs", () => {
    const locators: LocatorData[] = [
      { name: "Chorus", time: 32 },
      { name: "Intro", time: 0 },
      { name: "Outro", time: 64 },
    ];
    const result = buildSections(locators);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: "section-0",
      name: "Intro",
      startTime: 0,
      endTime: 32,
    });
    expect(result[1]).toEqual({
      id: "section-1",
      name: "Chorus",
      startTime: 32,
      endTime: 64,
    });
    expect(result[2]).toEqual({
      id: "section-2",
      name: "Outro",
      startTime: 64,
      endTime: Infinity,
    });
  });

  it("does not mutate the input array", () => {
    const locators: LocatorData[] = [
      { name: "B", time: 16 },
      { name: "A", time: 0 },
    ];
    const originalOrder = [...locators];
    buildSections(locators);

    expect(locators).toEqual(originalOrder);
  });

  it("handles multiple locators at the same time (stable sort)", () => {
    const locators: LocatorData[] = [
      { name: "First", time: 8 },
      { name: "Second", time: 8 },
    ];
    const result = buildSections(locators);

    expect(result).toHaveLength(2);
    // Stable sort preserves insertion order for equal times
    expect(result[0]!.name).toBe("First");
    expect(result[1]!.name).toBe("Second");
    // First section has zero length (startTime === endTime)
    expect(result[0]!.startTime).toBe(8);
    expect(result[0]!.endTime).toBe(8);
    // Last section extends to Infinity
    expect(result[1]!.startTime).toBe(8);
    expect(result[1]!.endTime).toBe(Infinity);
  });

  it("handles three locators at the same time preserving insertion order", () => {
    const locators: LocatorData[] = [
      { name: "A", time: 4 },
      { name: "B", time: 4 },
      { name: "C", time: 4 },
    ];
    const result = buildSections(locators);

    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe("A");
    expect(result[1]!.name).toBe("B");
    expect(result[2]!.name).toBe("C");
    // First two sections are zero-length
    expect(result[0]!.endTime - result[0]!.startTime).toBe(0);
    expect(result[1]!.endTime - result[1]!.startTime).toBe(0);
    // Last section extends to Infinity
    expect(result[2]!.endTime).toBe(Infinity);
  });

  it("derives section name from locator name", () => {
    const locators: LocatorData[] = [
      { name: "My Custom Name", time: 4 },
    ];
    const result = buildSections(locators);

    expect(result[0]!.name).toBe("My Custom Name");
  });
});
