import { describe, it, expect, beforeEach } from "vitest";
import {
  createLocatorData,
  createTrackData,
  createSection,
  resetFactoryCounters,
} from "./factories.js";
import { createMockSdkAdapter } from "./mock-sdk-adapter.js";

describe("factories", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  describe("createLocatorData", () => {
    it("produces a valid LocatorData with defaults", () => {
      const locator = createLocatorData();
      expect(locator).toEqual({ name: "Locator 0", time: 0 });
    });

    it("increments counter for sequential calls", () => {
      const first = createLocatorData();
      const second = createLocatorData();
      expect(first.name).toBe("Locator 0");
      expect(second.name).toBe("Locator 1");
      expect(second.time).toBe(16);
    });

    it("allows property overrides", () => {
      const locator = createLocatorData({ name: "Intro", time: 4 });
      expect(locator).toEqual({ name: "Intro", time: 4 });
    });
  });

  describe("createTrackData", () => {
    it("produces a valid TrackData with defaults", () => {
      const track = createTrackData();
      expect(track).toEqual({ name: "Track 1", type: "midi" });
    });

    it("allows property overrides", () => {
      const track = createTrackData({ name: "Bass", type: "audio" });
      expect(track).toEqual({ name: "Bass", type: "audio" });
    });
  });

  describe("createSection", () => {
    it("produces a valid Section with defaults", () => {
      const section = createSection();
      expect(section).toEqual({
        id: "section-0",
        name: "Section 0",
        startTime: 0,
        endTime: 32,
      });
    });

    it("increments counter for sequential calls", () => {
      const first = createSection();
      const second = createSection();
      expect(first.id).toBe("section-0");
      expect(second.id).toBe("section-1");
      expect(second.startTime).toBe(32);
    });

    it("allows property overrides", () => {
      const section = createSection({
        name: "Chorus",
        endTime: Infinity,
      });
      expect(section.name).toBe("Chorus");
      expect(section.endTime).toBe(Infinity);
    });
  });
});

describe("createMockSdkAdapter", () => {
  it("returns empty defaults when no options are provided", () => {
    const adapter = createMockSdkAdapter();
    expect(adapter.readLocators()).toEqual([]);
    expect(adapter.readTracks()).toEqual([]);
    expect(adapter.readPlayheadPosition()).toBe(0);
  });

  it("accepts initial data via options", () => {
    const locators = [{ name: "Intro", time: 0 }];
    const tracks = [{ name: "Drums", type: "midi" as const }];
    const adapter = createMockSdkAdapter({
      locators,
      tracks,
      playheadPosition: 42,
    });

    expect(adapter.readLocators()).toEqual(locators);
    expect(adapter.readTracks()).toEqual(tracks);
    expect(adapter.readPlayheadPosition()).toBe(42);
  });

  it("supports setting locators after creation", () => {
    const adapter = createMockSdkAdapter();
    const locators = [{ name: "Drop", time: 64 }];
    adapter.setLocators(locators);
    expect(adapter.readLocators()).toEqual(locators);
  });

  it("supports setting tracks after creation", () => {
    const adapter = createMockSdkAdapter();
    const tracks = [{ name: "Lead", type: "audio" as const }];
    adapter.setTracks(tracks);
    expect(adapter.readTracks()).toEqual(tracks);
  });

  it("supports setting playhead position after creation", () => {
    const adapter = createMockSdkAdapter();
    adapter.setPlayheadPosition(128.5);
    expect(adapter.readPlayheadPosition()).toBe(128.5);
  });
});
