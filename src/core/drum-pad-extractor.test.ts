/**
 * Unit tests for drum-pad-extractor.ts
 * Tests the pure functions: extractSampleName, classifyDrumElement,
 * classifyFillType, computeActivePercussionElements, and detectPercussionDiscontinuities
 */

import { describe, it, expect } from "vitest";
import {
  extractSampleName,
  classifyDrumElement,
  extractDrumPadMap,
  classifyFillType,
  computeActivePercussionElements,
  detectPercussionDiscontinuities,
} from "./drum-pad-extractor.js";
import type { DrumPadAdapter, DrumChainData } from "./drum-pad-extractor.js";
import type { SdkAdapter } from "../ableton/sdk-adapter.js";
import type { NoteData } from "../ableton/sdk-adapter.js";
import type { DrumPadEntry, DrumPadMap } from "./content-analysis-types.js";

// ─── extractSampleName ──────────────────────────────────────────────────

describe("extractSampleName", () => {
  it("strips Unix directory path and extension", () => {
    expect(extractSampleName("/Samples/Drums/Kit-808/Kick_Boomy.wav")).toBe("Kick_Boomy");
  });

  it("strips Windows directory path and extension", () => {
    expect(extractSampleName("C:\\Users\\Producer\\Samples\\HiHat_Open.aif")).toBe("HiHat_Open");
  });

  it("handles filename with no directory", () => {
    expect(extractSampleName("Snare_Tight.wav")).toBe("Snare_Tight");
  });

  it("handles filename with multiple dots", () => {
    expect(extractSampleName("/path/to/Tom.Floor.808.wav")).toBe("Tom.Floor.808");
  });

  it("returns filename as-is when no extension", () => {
    expect(extractSampleName("/path/to/KickSample")).toBe("KickSample");
  });

  it("returns empty string for empty input", () => {
    expect(extractSampleName("")).toBe("");
  });

  it("handles mixed separators", () => {
    expect(extractSampleName("C:\\Users/Music\\Samples/Ride_Jazz.aiff")).toBe("Ride_Jazz");
  });

  it("handles deeply nested paths", () => {
    expect(
      extractSampleName("/Users/producer/Music/Ableton/Project/Samples/Imported/Clap_909.wav"),
    ).toBe("Clap_909");
  });

  it("handles filename starting with a dot (hidden file)", () => {
    expect(extractSampleName("/path/.hidden_sample.wav")).toBe(".hidden_sample");
  });
});

// ─── classifyDrumElement ────────────────────────────────────────────────

describe("classifyDrumElement", () => {
  // Kick category
  it("classifies 'kick' as kick", () => {
    expect(classifyDrumElement("Kick_Boomy")).toBe("kick");
  });

  it("classifies 'BD' (bass drum abbreviation) as kick", () => {
    expect(classifyDrumElement("BD_Hard")).toBe("kick");
  });

  it("classifies 'bass drum' as kick", () => {
    expect(classifyDrumElement("Bass Drum 808")).toBe("kick");
  });

  it("classifies 'bassdrum' as kick", () => {
    expect(classifyDrumElement("Bassdrum_Deep")).toBe("kick");
  });

  // Snare category
  it("classifies 'snare' as snare", () => {
    expect(classifyDrumElement("Snare_Tight")).toBe("snare");
  });

  it("classifies 'SD' as snare", () => {
    expect(classifyDrumElement("SD_Crack")).toBe("snare");
  });

  it("classifies 'clap' as snare", () => {
    expect(classifyDrumElement("Clap_909")).toBe("snare");
  });

  it("classifies 'rim' as snare", () => {
    expect(classifyDrumElement("Rimshot_Tight")).toBe("snare");
  });

  // Hi-hat category
  it("classifies 'hat' as hi-hat", () => {
    expect(classifyDrumElement("Hat_Closed")).toBe("hi-hat");
  });

  it("classifies 'HH' as hi-hat", () => {
    expect(classifyDrumElement("HH_Open")).toBe("hi-hat");
  });

  it("classifies 'hihat' as hi-hat", () => {
    expect(classifyDrumElement("HiHat_Pedal")).toBe("hi-hat");
  });

  it("classifies 'hi-hat' as hi-hat", () => {
    expect(classifyDrumElement("Hi-Hat_Open")).toBe("hi-hat");
  });

  // Tom category
  it("classifies 'tom' as tom", () => {
    expect(classifyDrumElement("Tom_Low")).toBe("tom");
  });

  it("classifies 'floor' as tom", () => {
    expect(classifyDrumElement("Floor_Tom")).toBe("tom");
  });

  it("classifies 'rack' as tom", () => {
    expect(classifyDrumElement("Rack_Tom_Hi")).toBe("tom");
  });

  // Cymbal category
  it("classifies 'crash' as cymbal", () => {
    expect(classifyDrumElement("Crash_Big")).toBe("cymbal");
  });

  it("classifies 'ride' as cymbal", () => {
    expect(classifyDrumElement("Ride_Jazz")).toBe("cymbal");
  });

  it("classifies 'cymbal' as cymbal", () => {
    expect(classifyDrumElement("Cymbal_Swell")).toBe("cymbal");
  });

  it("classifies 'bell' as cymbal", () => {
    expect(classifyDrumElement("Bell_Ride")).toBe("cymbal");
  });

  // Percussion category
  it("classifies 'perc' as percussion", () => {
    expect(classifyDrumElement("Perc_Hit")).toBe("percussion");
  });

  it("classifies 'shaker' as percussion", () => {
    expect(classifyDrumElement("Shaker_16th")).toBe("percussion");
  });

  it("classifies 'tamb' as percussion", () => {
    expect(classifyDrumElement("Tambourine_Bright")).toBe("percussion");
  });

  it("classifies 'conga' as percussion", () => {
    expect(classifyDrumElement("Conga_High")).toBe("percussion");
  });

  it("classifies 'bongo' as percussion", () => {
    expect(classifyDrumElement("Bongo_Low")).toBe("percussion");
  });

  it("classifies 'cowbell' as percussion", () => {
    expect(classifyDrumElement("Cowbell_808")).toBe("percussion");
  });

  it("classifies 'wood' as percussion", () => {
    expect(classifyDrumElement("Woodblock_Hi")).toBe("percussion");
  });

  // Other category (no match)
  it("classifies unknown names as other", () => {
    expect(classifyDrumElement("Synth_Stab")).toBe("other");
  });

  it("classifies empty string as other", () => {
    expect(classifyDrumElement("")).toBe("other");
  });

  it("classifies numeric-only names as other", () => {
    expect(classifyDrumElement("12345")).toBe("other");
  });

  // Case insensitivity
  it("is case-insensitive", () => {
    expect(classifyDrumElement("KICK_Hard")).toBe("kick");
    expect(classifyDrumElement("SNARE_pop")).toBe("snare");
    expect(classifyDrumElement("HiHat_OPEN")).toBe("hi-hat");
  });

  // Priority order: first match wins
  it("uses priority order when multiple keywords match (kick before tom in 'Kick_Rack')", () => {
    // "rack" appears, but "kick" is checked first
    expect(classifyDrumElement("Kick_Rack_Layer")).toBe("kick");
  });
});

// ─── extractDrumPadMap ──────────────────────────────────────────────────

describe("extractDrumPadMap", () => {
  /** Creates a minimal DrumPadAdapter mock for testing. */
  function createMockAdapter(overrides: {
    firstDeviceClassName?: string | null;
    chains?: readonly DrumChainData[] | null;
  }): DrumPadAdapter {
    return {
      readFirstDeviceClassName: () => overrides.firstDeviceClassName ?? null,
      readDrumRackChains: () => overrides.chains ?? null,
      // Stub the rest of SdkAdapter (not used in extractDrumPadMap)
      readLocators: () => [],
      readTracks: () => [],
      readPlayheadPosition: () => 0,
      readArrangementClips: () => [],
      readMidiNotes: () => [],
      readDevices: () => [],
      readDeviceParameters: () => [],
      readSetFilePath: () => undefined,
      setAlsPathOverride: () => {},
      setAlsBufferOverride: () => {},
      getAlsBufferOverride: () => undefined,
      readAudioClips: () => [],
      readTempo: () => 120,
      renderAudioTrack: () => Promise.resolve("/tmp/mock.wav"),
      getAudioTrackIndices: () => [],
      isTrackMuted: () => false,
      createCuePoint: () => Promise.resolve({ name: "", time: 0, setName: () => {} }),
      deleteCuePoint: () => Promise.resolve(),
      readSongDuration: () => 0,
      readAllClips: () => [],
    };
  }

  it("returns null when first device is not a DrumRack", () => {
    const adapter = createMockAdapter({ firstDeviceClassName: "Operator" });
    expect(extractDrumPadMap(adapter, 0)).toBeNull();
  });

  it("returns null when track has no devices", () => {
    const adapter = createMockAdapter({ firstDeviceClassName: null });
    expect(extractDrumPadMap(adapter, 0)).toBeNull();
  });

  it("returns null when DrumRack has no chains", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [],
    });
    expect(extractDrumPadMap(adapter, 0)).toBeNull();
  });

  it("extracts pads from a DrumRack with valid Simpler chains", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Kick_808.wav" }],
        },
        {
          receivingNote: 38,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Snare_Pop.aif" }],
        },
        {
          receivingNote: 42,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/HiHat_Closed.wav" }],
        },
      ],
    });

    const result = extractDrumPadMap(adapter, 0);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(3);

    expect(result!.get(36)).toEqual({
      pitch: 36,
      sampleName: "Kick_808",
      category: "kick",
    });
    expect(result!.get(38)).toEqual({
      pitch: 38,
      sampleName: "Snare_Pop",
      category: "snare",
    });
    expect(result!.get(42)).toEqual({
      pitch: 42,
      sampleName: "HiHat_Closed",
      category: "hi-hat",
    });
  });

  it("skips chains without a Simpler device", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Kick.wav" }],
        },
        {
          receivingNote: 38,
          devices: [{ className: "Operator", sampleFilePath: null }],
        },
      ],
    });

    const result = extractDrumPadMap(adapter, 0);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(1);
    expect(result!.has(38)).toBe(false);
  });

  it("skips chains where Simpler has no sample loaded", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: null }],
        },
        {
          receivingNote: 38,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/Snare.wav" }],
        },
      ],
    });

    const result = extractDrumPadMap(adapter, 0);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(1);
    expect(result!.has(36)).toBe(false);
  });

  it("skips chains where Simpler has empty filePath", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: "" }],
        },
        {
          receivingNote: 42,
          devices: [{ className: "Simpler", sampleFilePath: "/Samples/HH.wav" }],
        },
      ],
    });

    const result = extractDrumPadMap(adapter, 0);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(1);
    expect(result!.has(36)).toBe(false);
  });

  it("returns null when all chains have missing samples", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [
        {
          receivingNote: 36,
          devices: [{ className: "Simpler", sampleFilePath: null }],
        },
        {
          receivingNote: 38,
          devices: [{ className: "Simpler", sampleFilePath: "" }],
        },
      ],
    });

    const result = extractDrumPadMap(adapter, 0);
    expect(result).toBeNull();
  });

  it("finds Simpler even when it is not the first device in a chain", () => {
    const adapter = createMockAdapter({
      firstDeviceClassName: "DrumRackDevice",
      chains: [
        {
          receivingNote: 36,
          devices: [
            { className: "AutoFilter", sampleFilePath: null },
            { className: "Simpler", sampleFilePath: "/Samples/Kick_Deep.wav" },
          ],
        },
      ],
    });

    const result = extractDrumPadMap(adapter, 0);
    expect(result).not.toBeNull();
    expect(result!.get(36)?.sampleName).toBe("Kick_Deep");
  });
});


// ─── Helper: Create DrumPadMap ──────────────────────────────────────────

function createDrumPadMap(
  entries: { pitch: number; sampleName: string }[],
): DrumPadMap {
  const map = new Map<number, DrumPadEntry>();
  for (const { pitch, sampleName } of entries) {
    map.set(pitch, {
      pitch,
      sampleName,
      category: classifyDrumElement(sampleName),
    });
  }
  return map;
}

function makeNote(pitch: number, startTime: number, duration = 0.25, velocity = 100): NoteData {
  return { pitch, startTime, duration, velocity };
}

// ─── classifyFillType ───────────────────────────────────────────────────

describe("classifyFillType", () => {
  const padMap = createDrumPadMap([
    { pitch: 36, sampleName: "Kick_808" },
    { pitch: 38, sampleName: "Snare_Pop" },
    { pitch: 42, sampleName: "HiHat_Closed" },
    { pitch: 45, sampleName: "Tom_Low" },
    { pitch: 47, sampleName: "Tom_Mid" },
    { pitch: 48, sampleName: "Tom_High" },
    { pitch: 49, sampleName: "Crash_Big" },
    { pitch: 51, sampleName: "Ride_Jazz" },
    { pitch: 53, sampleName: "Conga_High" },
    { pitch: 55, sampleName: "Clap_909" },
    { pitch: 57, sampleName: "808_Sub" },
  ]);

  it("classifies a fill with majority tom notes as tom-fill", () => {
    // 6 tom notes, 2 kick notes — majority is tom
    const notes: NoteData[] = [
      makeNote(45, 0), makeNote(47, 0.5), makeNote(48, 1),
      makeNote(45, 1.5), makeNote(47, 2), makeNote(48, 2.5),
      makeNote(36, 3), makeNote(36, 3.5),
    ];
    expect(classifyFillType(notes, padMap, 4)).toBe("tom-fill");
  });

  it("classifies a high-density snare fill as snare-roll", () => {
    // 10 snare notes in 2 beats = 5 notes/beat > 4 threshold
    const notes: NoteData[] = Array.from({ length: 10 }, (_, i) =>
      makeNote(38, i * 0.2),
    );
    expect(classifyFillType(notes, padMap, 2)).toBe("snare-roll");
  });

  it("classifies low-density snare as generic-fill (not snare-roll)", () => {
    // 3 snare notes in 2 beats = 1.5 notes/beat < 4 threshold
    const notes: NoteData[] = [
      makeNote(38, 0), makeNote(38, 1), makeNote(38, 1.5),
    ];
    expect(classifyFillType(notes, padMap, 2)).toBe("generic-fill");
  });

  it("classifies a high-density hi-hat fill as hat-roll", () => {
    // 10 hi-hat notes in 2 beats = 5 notes/beat > 4 threshold
    const notes: NoteData[] = Array.from({ length: 10 }, (_, i) =>
      makeNote(42, i * 0.2),
    );
    expect(classifyFillType(notes, padMap, 2)).toBe("hat-roll");
  });

  it("classifies a cymbal-dominant fill as cymbal-fill", () => {
    // 5 cymbal notes, 1 kick — majority is cymbal
    const notes: NoteData[] = [
      makeNote(49, 0), makeNote(51, 0.5), makeNote(49, 1),
      makeNote(51, 1.5), makeNote(49, 2),
      makeNote(36, 2.5),
    ];
    expect(classifyFillType(notes, padMap, 4)).toBe("cymbal-fill");
  });

  it("classifies a high-density clap fill as clap-roll", () => {
    // 10 clap notes in 2 beats = 5 notes/beat
    const notes: NoteData[] = Array.from({ length: 10 }, (_, i) =>
      makeNote(55, i * 0.2),
    );
    expect(classifyFillType(notes, padMap, 2)).toBe("clap-roll");
  });

  it("classifies a high-density 808 fill as 808-roll", () => {
    // 10 808 notes in 2 beats = 5 notes/beat
    const notes: NoteData[] = Array.from({ length: 10 }, (_, i) =>
      makeNote(57, i * 0.2),
    );
    expect(classifyFillType(notes, padMap, 2)).toBe("808-roll");
  });

  it("classifies a percussion-dominant fill as percussion-fill", () => {
    // 5 conga notes, 2 kick notes
    const notes: NoteData[] = [
      makeNote(53, 0), makeNote(53, 0.5), makeNote(53, 1),
      makeNote(53, 1.5), makeNote(53, 2),
      makeNote(36, 2.5), makeNote(36, 3),
    ];
    expect(classifyFillType(notes, padMap, 4)).toBe("percussion-fill");
  });

  it("classifies a mixed fill with no majority as generic-fill", () => {
    // 2 tom, 2 snare, 2 hihat — no clear majority
    const notes: NoteData[] = [
      makeNote(45, 0), makeNote(47, 0.5),
      makeNote(38, 1), makeNote(38, 1.5),
      makeNote(42, 2), makeNote(42, 2.5),
    ];
    expect(classifyFillType(notes, padMap, 4)).toBe("generic-fill");
  });

  it("returns generic-fill for empty notes", () => {
    expect(classifyFillType([], padMap, 4)).toBe("generic-fill");
  });

  it("returns generic-fill when fillDurationBeats is 0", () => {
    const notes: NoteData[] = [makeNote(45, 0)];
    expect(classifyFillType(notes, padMap, 0)).toBe("generic-fill");
  });

  it("returns generic-fill when pitches are not in the pad map", () => {
    // Pitch 99 is not in the pad map
    const notes: NoteData[] = [
      makeNote(99, 0), makeNote(99, 0.5), makeNote(99, 1),
    ];
    expect(classifyFillType(notes, padMap, 2)).toBe("generic-fill");
  });
});

// ─── computeActivePercussionElements ────────────────────────────────────

describe("computeActivePercussionElements", () => {
  const padMap = createDrumPadMap([
    { pitch: 36, sampleName: "Kick_808" },
    { pitch: 38, sampleName: "Snare_Pop" },
    { pitch: 42, sampleName: "HiHat_Closed" },
    { pitch: 45, sampleName: "Tom_Low" },
  ]);

  it("returns sample names for all pitches with notes in the section range", () => {
    const notes: NoteData[] = [
      makeNote(36, 0), makeNote(38, 1), makeNote(42, 2), makeNote(45, 3),
    ];
    const result = computeActivePercussionElements(notes, 0, 4, padMap);
    expect(result.size).toBe(4);
    expect(result.has("Kick_808")).toBe(true);
    expect(result.has("Snare_Pop")).toBe(true);
    expect(result.has("HiHat_Closed")).toBe(true);
    expect(result.has("Tom_Low")).toBe(true);
  });

  it("filters notes outside the section range", () => {
    const notes: NoteData[] = [
      makeNote(36, -1), // before section
      makeNote(38, 2),  // inside section
      makeNote(42, 4),  // at end boundary (exclusive)
      makeNote(45, 5),  // after section
    ];
    const result = computeActivePercussionElements(notes, 0, 4, padMap);
    expect(result.size).toBe(1);
    expect(result.has("Snare_Pop")).toBe(true);
  });

  it("returns empty set when no notes are in the section range", () => {
    const notes: NoteData[] = [makeNote(36, 10), makeNote(38, 11)];
    const result = computeActivePercussionElements(notes, 0, 4, padMap);
    expect(result.size).toBe(0);
  });

  it("returns empty set for empty notes array", () => {
    const result = computeActivePercussionElements([], 0, 4, padMap);
    expect(result.size).toBe(0);
  });

  it("skips pitches not in the drum pad map", () => {
    const notes: NoteData[] = [
      makeNote(36, 1), // in pad map
      makeNote(99, 2), // not in pad map
    ];
    const result = computeActivePercussionElements(notes, 0, 4, padMap);
    expect(result.size).toBe(1);
    expect(result.has("Kick_808")).toBe(true);
  });

  it("deduplicates sample names when multiple notes hit the same pitch", () => {
    const notes: NoteData[] = [
      makeNote(36, 0), makeNote(36, 1), makeNote(36, 2), makeNote(36, 3),
    ];
    const result = computeActivePercussionElements(notes, 0, 4, padMap);
    expect(result.size).toBe(1);
    expect(result.has("Kick_808")).toBe(true);
  });

  it("includes notes exactly at sectionStart (inclusive)", () => {
    const notes: NoteData[] = [makeNote(36, 4)];
    const result = computeActivePercussionElements(notes, 4, 8, padMap);
    expect(result.size).toBe(1);
    expect(result.has("Kick_808")).toBe(true);
  });
});

// ─── detectPercussionDiscontinuities ────────────────────────────────────

describe("detectPercussionDiscontinuities", () => {
  it("returns empty array when fewer than 2 sections", () => {
    const result = detectPercussionDiscontinuities(
      [new Set(["Kick_808", "Snare_Pop"])],
      ["Intro"],
    );
    expect(result).toEqual([]);
  });

  it("returns empty when all elements are present in all sections", () => {
    const sections = [
      new Set(["Kick_808", "Snare_Pop", "HiHat_Closed"]),
      new Set(["Kick_808", "Snare_Pop", "HiHat_Closed"]),
      new Set(["Kick_808", "Snare_Pop", "HiHat_Closed"]),
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C"]);
    expect(result).toEqual([]);
  });

  it("detects a permanent drop (element disappears and never returns)", () => {
    const sections = [
      new Set(["Kick_808", "Ride_Jazz"]),
      new Set(["Kick_808", "Ride_Jazz"]),
      new Set(["Kick_808"]), // Ride disappears
      new Set(["Kick_808"]), // Ride still gone → permanent drop
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C", "D"]);

    const rideDisc = result.find((d) => d.elementName === "Ride_Jazz");
    expect(rideDisc).toBeDefined();
    expect(rideDisc!.permanentDrop).toBe(true);
    expect(rideDisc!.presentInSections).toEqual([0, 1]);
    expect(rideDisc!.absentFromSections).toEqual([2, 3]);
    expect(rideDisc!.category).toBe("cymbal");
  });

  it("detects a gap (element disappears then returns → not permanent drop)", () => {
    const sections = [
      new Set(["Kick_808", "Tom_Low"]),
      new Set(["Kick_808"]),              // Tom absent
      new Set(["Kick_808", "Tom_Low"]),   // Tom returns
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C"]);

    const tomDisc = result.find((d) => d.elementName === "Tom_Low");
    expect(tomDisc).toBeDefined();
    expect(tomDisc!.permanentDrop).toBe(false);
    expect(tomDisc!.presentInSections).toEqual([0, 2]);
    expect(tomDisc!.absentFromSections).toEqual([1]);
    expect(tomDisc!.category).toBe("tom");
  });

  it("does not report elements present in all sections", () => {
    const sections = [
      new Set(["Kick_808", "Tom_Low"]),
      new Set(["Kick_808"]),
      new Set(["Kick_808", "Tom_Low"]),
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C"]);

    // Kick_808 is in all sections — should not be reported
    const kickDisc = result.find((d) => d.elementName === "Kick_808");
    expect(kickDisc).toBeUndefined();
  });

  it("detects multiple discontinuities", () => {
    const sections = [
      new Set(["Kick_808", "Snare_Pop", "HiHat_Closed"]),
      new Set(["Kick_808", "HiHat_Closed"]),        // Snare missing
      new Set(["Kick_808", "Snare_Pop"]),            // HiHat missing
      new Set(["Kick_808", "Snare_Pop", "HiHat_Closed"]),
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C", "D"]);

    expect(result.length).toBe(2);
    const snareDisc = result.find((d) => d.elementName === "Snare_Pop");
    const hatDisc = result.find((d) => d.elementName === "HiHat_Closed");
    expect(snareDisc).toBeDefined();
    expect(hatDisc).toBeDefined();
    expect(snareDisc!.permanentDrop).toBe(false);
    expect(hatDisc!.permanentDrop).toBe(false);
  });

  it("handles element that only appears in a middle section (permanent drop since it never returns after last appearance)", () => {
    const sections = [
      new Set(["Kick_808"]),
      new Set(["Kick_808", "Crash_Big"]), // Crash only here
      new Set(["Kick_808"]),
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C"]);

    const crashDisc = result.find((d) => d.elementName === "Crash_Big");
    expect(crashDisc).toBeDefined();
    expect(crashDisc!.presentInSections).toEqual([1]);
    expect(crashDisc!.absentFromSections).toEqual([0, 2]);
    // Last appearance is section 1, section 2 exists after → permanent drop
    expect(crashDisc!.permanentDrop).toBe(true);
  });

  it("classifies elements appearing only in the last section as not permanent drop", () => {
    const sections = [
      new Set(["Kick_808"]),
      new Set(["Kick_808"]),
      new Set(["Kick_808", "Crash_Big"]), // Crash only at end
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B", "C"]);

    const crashDisc = result.find((d) => d.elementName === "Crash_Big");
    expect(crashDisc).toBeDefined();
    // Last appearance is section 2 (index 2) which is the last section → not a permanent drop
    expect(crashDisc!.permanentDrop).toBe(false);
  });

  it("sets trackName to empty string (filled by caller)", () => {
    const sections = [
      new Set(["Kick_808", "Tom_Low"]),
      new Set(["Kick_808"]),
    ];
    const result = detectPercussionDiscontinuities(sections, ["A", "B"]);
    for (const disc of result) {
      expect(disc.trackName).toBe("");
    }
  });
});
