import { describe, it, expect } from "vitest";
import { buildTrackInventory } from "./track-reader.js";
import type { TrackData } from "../ableton/sdk-adapter.js";

describe("buildTrackInventory", () => {
  it("returns an empty array when given an empty input", () => {
    const result = buildTrackInventory([]);
    expect(result).toEqual([]);
  });

  it("maps a single MIDI track preserving name and type", () => {
    const tracks: TrackData[] = [{ name: "Bass", type: "midi" }];
    const result = buildTrackInventory(tracks);
    expect(result).toEqual([{ name: "Bass", type: "midi" }]);
  });

  it("maps a single Audio track preserving name and type", () => {
    const tracks: TrackData[] = [{ name: "Vocals", type: "audio" }];
    const result = buildTrackInventory(tracks);
    expect(result).toEqual([{ name: "Vocals", type: "audio" }]);
  });

  it("maps multiple tracks preserving order, name, and type", () => {
    const tracks: TrackData[] = [
      { name: "Kick", type: "audio" },
      { name: "Synth Lead", type: "midi" },
      { name: "Pad", type: "midi" },
      { name: "Vocals", type: "audio" },
    ];
    const result = buildTrackInventory(tracks);
    expect(result).toEqual([
      { name: "Kick", type: "audio" },
      { name: "Synth Lead", type: "midi" },
      { name: "Pad", type: "midi" },
      { name: "Vocals", type: "audio" },
    ]);
  });

  it("does not mutate the input array", () => {
    const tracks: TrackData[] = [
      { name: "Lead", type: "midi" },
      { name: "FX", type: "audio" },
    ];
    const original = [...tracks];
    buildTrackInventory(tracks);
    expect(tracks).toEqual(original);
  });
});
