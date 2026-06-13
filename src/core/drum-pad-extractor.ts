/**
 * Drum Pad Extractor — SDK-layer module that reads DrumRack chain data
 * from the Ableton Extensions SDK and maps MIDI pitches to named
 * percussion elements with semantic classification.
 *
 * This module is the bridge between the SDK's DrumRack device hierarchy
 * and the pure-function Content Analyzer. It produces DrumPadMap objects
 * that the Content Analyzer consumes as plain data.
 */

import type { NoteData, SdkAdapter } from "../ableton/sdk-adapter.js";
import type {
  DrumElementCategory,
  DrumPadEntry,
  DrumPadMap,
  FillType,
  PercussionDiscontinuity,
} from "./content-analysis-types.js";

// ─── Drum Rack Chain DTO ──────────────────────────────────────────────

/** Data transfer object for a single drum chain (pad) from the SDK. */
export interface DrumChainData {
  /** MIDI pitch this pad responds to (0-127). */
  readonly receivingNote: number;
  /** Devices in this chain. */
  readonly devices: readonly DrumChainDeviceData[];
}

/** Minimal device descriptor within a drum chain. */
export interface DrumChainDeviceData {
  /** SDK class name (e.g., "Simpler", "Operator"). */
  readonly className: string;
  /** Sample file path if this is a Simpler device with a loaded sample. */
  readonly sampleFilePath: string | null;
}

// ─── Extended Adapter Interface ───────────────────────────────────────

/**
 * Extension to SdkAdapter for DrumRack-specific reads.
 * The orchestrator provides an adapter that implements these methods
 * alongside the base SdkAdapter interface.
 */
export interface DrumPadAdapter extends SdkAdapter {
  /**
   * Read the className of the first device on a track.
   * Returns null if the track has no devices.
   */
  readFirstDeviceClassName(trackIndex: number): string | null;

  /**
   * Read drum chain data from a DrumRack device on a track.
   * Returns null if the first device is not a DrumRack.
   */
  readDrumRackChains(trackIndex: number): readonly DrumChainData[] | null;
}

// ─── Keyword Classification Tables ───────────────────────────────────

/** Keyword → category mapping, checked in priority order. */
const DRUM_ELEMENT_KEYWORDS: readonly {
  readonly keywords: readonly string[];
  readonly category: DrumElementCategory;
}[] = [
  { keywords: ["kick", "bd", "bass drum", "bassdrum"], category: "kick" },
  { keywords: ["snare", "sd", "clap", "rim"], category: "snare" },
  { keywords: ["hat", "hh", "hihat", "hi-hat"], category: "hi-hat" },
  { keywords: ["tom", "floor", "rack"], category: "tom" },
  // Percussion checked before cymbal so "cowbell" isn't captured by "bell"
  {
    keywords: ["perc", "shaker", "tamb", "conga", "bongo", "cowbell", "wood"],
    category: "percussion",
  },
  { keywords: ["crash", "ride", "cymbal", "bell"], category: "cymbal" },
];

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Extract a DrumPadMap from a Drum Rack device on a track.
 *
 * SDK traversal chain:
 *   track.devices[0] → check className === "DrumRackDevice"
 *   DrumRack.chains → DrumChain[]
 *   DrumChain.receivingNote → MIDI pitch (0-127)
 *   DrumChain.devices → find Simpler
 *   Simpler.sample → Sample | null
 *   Sample.filePath → string
 *
 * Returns null if no DrumRack is found on the track.
 */
export function extractDrumPadMap(
  adapter: DrumPadAdapter,
  trackIndex: number,
): DrumPadMap | null {
  // Check if first device is a DrumRack
  const className = adapter.readFirstDeviceClassName(trackIndex);
  if (className !== "DrumRackDevice") {
    return null;
  }

  // Read the chains
  const chains = adapter.readDrumRackChains(trackIndex);
  if (!chains || chains.length === 0) {
    return null;
  }

  const padMap = new Map<number, DrumPadEntry>();

  for (const chain of chains) {
    const pitch = chain.receivingNote;

    // Find the first Simpler device in this chain
    const simpler = chain.devices.find((d) => d.className === "Simpler");
    if (!simpler) {
      continue; // No Simpler in this chain — skip
    }

    const filePath = simpler.sampleFilePath;
    if (!filePath) {
      continue; // No sample loaded — skip
    }

    const sampleName = extractSampleName(filePath);
    if (!sampleName) {
      continue; // Empty result after stripping — skip
    }

    const category = classifyDrumElement(sampleName);

    padMap.set(pitch, {
      pitch,
      sampleName,
      category,
    });
  }

  // Return null if no valid pads were extracted (degenerate DrumRack)
  if (padMap.size === 0) {
    return null;
  }

  return padMap;
}

/**
 * Extract sample name from a file path.
 * Strips directory path and file extension, returning the base filename.
 *
 * Handles both Unix and Windows path separators.
 *
 * @example
 * extractSampleName("/Samples/Drums/Kit-808/Kick_Boomy.wav") → "Kick_Boomy"
 * extractSampleName("C:\\Users\\Producer\\Samples\\HiHat_Open.aif") → "HiHat_Open"
 * extractSampleName("") → ""
 */
export function extractSampleName(filePath: string): string {
  if (!filePath) {
    return "";
  }

  // Find the last path separator (handle both / and \)
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const filename = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;

  // Strip the file extension (last dot and everything after)
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex > 0) {
    return filename.slice(0, dotIndex);
  }

  return filename;
}

/**
 * Classify a sample name into a drum element category using keyword matching.
 *
 * Keywords are checked in priority order (case-insensitive):
 *   "kick" | "bd" | "bass drum" | "bassdrum"  → kick
 *   "snare" | "sd" | "clap" | "rim"           → snare
 *   "hat" | "hh" | "hihat" | "hi-hat"         → hi-hat
 *   "tom" | "floor" | "rack"                  → tom
 *   "perc" | "shaker" | "tamb" | "conga" | "bongo" | "cowbell" | "wood" → percussion
 *   "crash" | "ride" | "cymbal" | "bell"      → cymbal
 *   (no match)                                 → other
 *
 * Note: Percussion is checked before cymbal so that "cowbell" is correctly
 * classified as percussion rather than matching "bell" → cymbal.
 */
export function classifyDrumElement(sampleName: string): DrumElementCategory {
  const lower = sampleName.toLowerCase();

  for (const { keywords, category } of DRUM_ELEMENT_KEYWORDS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "other";
}


// ─── Fill Type Classification ─────────────────────────────────────────

/**
 * Keywords used for fill type classification.
 * Each entry maps a set of keywords to a FillType, along with whether
 * density > 4 notes/beat is required (for roll-type fills).
 */
const FILL_TYPE_RULES: readonly {
  readonly keywords: readonly string[];
  readonly fillType: FillType;
  readonly requiresHighDensity: boolean;
}[] = [
  { keywords: ["tom", "floor", "rack"], fillType: "tom-fill", requiresHighDensity: false },
  { keywords: ["snare", "sd"], fillType: "snare-roll", requiresHighDensity: true },
  { keywords: ["hat", "hh", "hihat", "hi-hat"], fillType: "hat-roll", requiresHighDensity: true },
  {
    keywords: ["ride", "crash", "cymbal"],
    fillType: "cymbal-fill",
    requiresHighDensity: false,
  },
  { keywords: ["clap"], fillType: "clap-roll", requiresHighDensity: true },
  { keywords: ["808"], fillType: "808-roll", requiresHighDensity: true },
  {
    keywords: ["perc", "conga", "bongo", "shaker", "tamb", "cowbell"],
    fillType: "percussion-fill",
    requiresHighDensity: false,
  },
];

/**
 * Classify a fill's type based on the sample names of pitches involved and note density.
 *
 * Classification logic:
 * 1. Collect all unique pitches in fillNotes
 * 2. Map each pitch through DrumPadMap to get sample names
 * 3. Compute fill density: total notes / fill duration in beats
 * 4. For each rule, count how many notes map to pitches matching that rule's keywords
 * 5. If a majority (>50%) of notes match a rule AND density condition is met, return that FillType
 * 6. Otherwise → "generic-fill"
 *
 * "Majority" = more than 50% of the fill's note count maps to that category.
 */
export function classifyFillType(
  fillNotes: readonly NoteData[],
  drumPadMap: DrumPadMap,
  fillDurationBeats: number,
): FillType {
  if (fillNotes.length === 0 || fillDurationBeats <= 0) {
    return "generic-fill";
  }

  // Compute fill density: total notes / duration in beats
  const density = fillNotes.length / fillDurationBeats;

  // Count notes per rule category
  const totalNotes = fillNotes.length;
  const majorityThreshold = totalNotes * 0.5;

  for (const rule of FILL_TYPE_RULES) {
    let matchingNoteCount = 0;

    for (const note of fillNotes) {
      const entry = drumPadMap.get(note.pitch);
      if (!entry) continue;

      const lower = entry.sampleName.toLowerCase();
      const matches = rule.keywords.some((kw) => lower.includes(kw));
      if (matches) {
        matchingNoteCount++;
      }
    }

    // Check majority condition
    if (matchingNoteCount > majorityThreshold) {
      // Check density condition for roll-type fills
      if (rule.requiresHighDensity && density <= 4) {
        // Density not high enough for a roll — continue to check other rules
        continue;
      }
      return rule.fillType;
    }
  }

  return "generic-fill";
}

// ─── Active Percussion Elements ───────────────────────────────────────

/**
 * Compute which named percussion elements are active in a given section.
 *
 * Filters notes in [sectionStart, sectionEnd), maps each pitch via DrumPadMap,
 * and returns a set of unique sample names.
 */
export function computeActivePercussionElements(
  notes: readonly NoteData[],
  sectionStart: number,
  sectionEnd: number,
  drumPadMap: DrumPadMap,
): ReadonlySet<string> {
  const activeElements = new Set<string>();

  for (const note of notes) {
    // Filter notes within [sectionStart, sectionEnd)
    if (note.startTime < sectionStart || note.startTime >= sectionEnd) {
      continue;
    }

    const entry = drumPadMap.get(note.pitch);
    if (entry) {
      activeElements.add(entry.sampleName);
    }
  }

  return activeElements;
}

// ─── Percussion Discontinuity Detection ───────────────────────────────

/**
 * Detect discontinuities in percussion element presence across sections.
 *
 * Algorithm:
 * 1. Build a presence matrix: for each unique sample name, track which sections contain it
 * 2. For elements present in ≥ 1 section but absent from ≥ 1 section:
 *    - Determine if it's a permanentDrop: element never returns after last appearance
 * 3. Return PercussionDiscontinuity[] (elements present in ALL sections or NONE are excluded)
 */
export function detectPercussionDiscontinuities(
  activeElementsPerSection: readonly ReadonlySet<string>[],
  sectionNames: readonly string[],
): PercussionDiscontinuity[] {
  const numSections = activeElementsPerSection.length;
  if (numSections < 2) {
    return [];
  }

  // Build presence matrix: elementName → set of section indices where it appears
  const presenceMap = new Map<string, Set<number>>();

  for (let sectionIdx = 0; sectionIdx < numSections; sectionIdx++) {
    const elements = activeElementsPerSection[sectionIdx];
    for (const elementName of elements) {
      let sectionSet = presenceMap.get(elementName);
      if (!sectionSet) {
        sectionSet = new Set<number>();
        presenceMap.set(elementName, sectionSet);
      }
      sectionSet.add(sectionIdx);
    }
  }

  const discontinuities: PercussionDiscontinuity[] = [];

  for (const [elementName, presentSections] of presenceMap) {
    // Skip elements present in ALL sections (no discontinuity)
    if (presentSections.size === numSections) {
      continue;
    }

    // Elements present in NONE are not in the map, so no need to check for 0

    // Compute absent sections
    const absentSections: number[] = [];
    for (let i = 0; i < numSections; i++) {
      if (!presentSections.has(i)) {
        absentSections.push(i);
      }
    }

    // Determine permanentDrop: element never returns after its last appearance
    const presentIndices = Array.from(presentSections).sort((a, b) => a - b);
    const lastAppearance = presentIndices[presentIndices.length - 1];
    const permanentDrop = lastAppearance < numSections - 1;

    // Classify the element category using the element name
    const category = classifyDrumElement(elementName);

    discontinuities.push({
      elementName,
      category,
      presentInSections: presentIndices,
      absentFromSections: absentSections,
      permanentDrop,
      trackName: "", // Track name is filled by the caller in orchestration context
    });
  }

  return discontinuities;
}
