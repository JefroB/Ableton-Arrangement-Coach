/**
 * Als Parser — pure module for reading automation envelope data from
 * Ableton Live .als project files.
 *
 * The .als format is a gzip-compressed XML document. This parser:
 * 1. Reads the file as a buffer
 * 2. Decompresses via gunzip
 * 3. Uses regex-based SAX-style extraction (no full DOM load)
 * 4. Builds a PointeeId→{deviceName, parameterName} lookup from device parameters
 * 5. Extracts AutomationEnvelope blocks with FloatEvent breakpoints
 * 6. Resolves each envelope's device/parameter names via the lookup
 *
 * Returns null on any failure — logs warnings internally.
 * No SDK dependencies. Input: file path → Output: automation data.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// ─── Domain Types ──────────────────────────────────────────────────────

/** A single automation breakpoint. */
export interface AutomationBreakpoint {
  readonly time: number;   // beat position
  readonly value: number;  // 0–1 normalized
}

/** An automation envelope extracted from the .als file. */
export interface AutomationEnvelope {
  readonly trackIndex: number;
  readonly pointeeId: number;
  readonly deviceName: string | null;   // null if unresolved (resolved in task 2.2)
  readonly parameterName: string | null; // null if unresolved (resolved in task 2.2)
  readonly breakpoints: readonly AutomationBreakpoint[];
}

/** Complete parsed automation data from a .als file. */
export interface AlsAutomationData {
  readonly envelopes: readonly AutomationEnvelope[];
  readonly parseTimeMs: number;
  readonly trackCount: number;
}

/** Per-section automation summary for energy scoring. */
export interface SectionAutomationSummary {
  readonly trackIndex: number;
  readonly activeEnvelopeCount: number;  // envelopes with value changes in section
  readonly totalBreakpoints: number;     // breakpoints within section range
}

// ─── Constants ─────────────────────────────────────────────────────────

/** Maximum decompressed XML size before aborting (50 MB). */
const MAX_DECOMPRESSED_SIZE = 50 * 1024 * 1024;

// ─── Regex Patterns ────────────────────────────────────────────────────

/**
 * Match track elements within <Tracks>...</Tracks>.
 * Track types: MidiTrack, AudioTrack, ReturnTrack, GroupTrack.
 */
const TRACKS_SECTION_RE = /<Tracks>([\s\S]*?)<\/Tracks>/;

/**
 * Match individual track opening tags. We use a non-greedy approach
 * to split tracks correctly.
 */
const TRACK_TAG_RE = /<(MidiTrack|AudioTrack|ReturnTrack|GroupTrack)\b[^>]*>/g;

/**
 * Match AutomationEnvelope blocks (clip envelopes).
 */
const AUTOMATION_ENVELOPE_RE = /<AutomationEnvelope\b[^>]*>([\s\S]*?)<\/AutomationEnvelope>/g;

/**
 * Match AutomationLane blocks (arrangement automation lanes).
 */
const AUTOMATION_LANE_RE = /<AutomationLane\b[^>]*>([\s\S]*?)<\/AutomationLane>/g;

/**
 * Extract PointeeId from AutomationTarget within an arrangement lane.
 */
const AUTOMATION_TARGET_POINTEE_RE = /<AutomationTarget\b[^>]*>[\s\S]*?<PointeeId\s+Value="(\d+)"\s*\/>[\s\S]*?<\/AutomationTarget>/;

/**
 * Extract PointeeId value from an EnvelopeTarget block.
 */
const POINTEE_ID_RE = /<PointeeId\s+Value="(\d+)"\s*\/>/;

/**
 * Match FloatEvent elements with Time and Value attributes.
 * Handles any attribute order (Id may appear before Time).
 */
const FLOAT_EVENT_RE = /<FloatEvent\s[^>]*Time="([^"]+)"[^>]*Value="([^"]+)"[^>]*\/>/g;

// ─── PointeeId Resolution Patterns ────────────────────────────────────

/**
 * Known Ableton device element tag names.
 * These are device types that contain parameter lists with Id attributes.
 */
const DEVICE_TAG_NAMES = [
  "PluginDevice",
  "MxDeviceAudioEffect",
  "MxDeviceInstrument",
  "InstrumentGroupDevice",
  "DrumGroupDevice",
  "AudioEffectGroupDevice",
  "Eq8",
  "Compressor2",
  "AutoFilter",
  "Chorus2",
  "Delay",
  "PingPongDelay",
  "FilterDelay",
  "GrainDelay",
  "Reverb",
  "Saturator",
  "Limiter",
  "GlueCompressor",
  "MultibandDynamics",
  "Phaser",
  "Flanger",
  "Redux2",
  "Erosion",
  "Vinyl",
  "Gate",
  "Tuner",
  "InstrumentVector",
  "OriginalSimpler",
  "MultiSampler",
  "Operator",
  "Collision",
  "Tension",
  "LoungeLizard",
  "StringStudio",
  "Drift",
  "Meld",
  "PluginDevice",
  "AuPluginDevice",
  "Vst3PluginDevice",
];

/**
 * Match device elements with an Id attribute and capture their content.
 * This pattern matches the opening tag with Id and captures content up to the closing tag.
 */
const DEVICE_BLOCK_RE = new RegExp(
  `<(${DEVICE_TAG_NAMES.join("|")})\\s+Id="(\\d+)"[^>]*>([\\s\\S]*?)<\\/\\1>`,
  "g",
);

/**
 * Match parameter elements (various types) with an Id attribute.
 * Captures: tag name, Id value, and inner content of the parameter element.
 */
const PARAMETER_WITH_ID_RE = /(<(\w*Parameter\w*)\s+Id="(\d+)"[^>]*>([\s\S]*?)<\/\2>)/g;

/**
 * Extract ParameterName Value from within a parameter element.
 */
const PARAMETER_NAME_RE = /<ParameterName\s+Value="([^"]*)"[^/]*\/>/;

/**
 * Extract UserName Value from a device element (user-renamed device).
 */
const USER_NAME_RE = /<UserName\s+Value="([^"]*)"[^/]*\/>/;

/**
 * Extract PluginName from PluginDesc > PluginInfo > PluginName.
 */
const PLUGIN_NAME_RE = /<PluginDesc>[\s\S]*?<PluginName\s+Value="([^"]*)"[^/]*\/>[\s\S]*?<\/PluginDesc>/;

// ─── PointeeId Resolution Types ────────────────────────────────────────

/** Resolved parameter info from a PointeeId lookup. */
interface ResolvedParameter {
  readonly deviceName: string;
  readonly parameterName: string;
}

/** Map from PointeeId (number) to resolved device/parameter info. */
type PointeeIdLookup = Map<number, ResolvedParameter>;

// ─── Internal Helpers ──────────────────────────────────────────────────

/**
 * Build a PointeeId → { deviceName, parameterName } lookup from the full XML.
 *
 * Scans for device elements containing parameters with Id attributes.
 * For each parameter found, records its Id mapped to the parent device name
 * and the parameter's own name.
 *
 * Device name resolution priority:
 * 1. <UserName Value="..."/> (user-renamed device)
 * 2. <PluginName Value="..."/> from <PluginDesc> (plugin devices)
 * 3. The device element tag name itself (e.g., "AutoFilter", "Eq8")
 */
function buildPointeeIdLookup(xml: string): PointeeIdLookup {
  const lookup: PointeeIdLookup = new Map();

  // Reset regex state
  const deviceBlockRe = new RegExp(DEVICE_BLOCK_RE.source, "g");
  let deviceMatch: RegExpExecArray | null;

  while ((deviceMatch = deviceBlockRe.exec(xml)) !== null) {
    const deviceTagName = deviceMatch[1]!;
    const deviceContent = deviceMatch[3]!;

    // Resolve device name with priority: UserName > PluginName > tag name
    let deviceName = deviceTagName; // fallback to tag name

    const userNameMatch = USER_NAME_RE.exec(deviceContent);
    if (userNameMatch && userNameMatch[1]!.trim().length > 0) {
      deviceName = userNameMatch[1]!;
    } else {
      const pluginNameMatch = PLUGIN_NAME_RE.exec(deviceContent);
      if (pluginNameMatch && pluginNameMatch[1]!.trim().length > 0) {
        deviceName = pluginNameMatch[1]!;
      }
    }

    // Find all parameters with Id attributes within this device
    const paramRe = new RegExp(PARAMETER_WITH_ID_RE.source, "g");
    let paramMatch: RegExpExecArray | null;

    while ((paramMatch = paramRe.exec(deviceContent)) !== null) {
      const paramId = parseInt(paramMatch[3]!, 10);
      const paramContent = paramMatch[4]!;

      if (!Number.isFinite(paramId)) {
        continue;
      }

      // Extract parameter name
      const paramNameMatch = PARAMETER_NAME_RE.exec(paramContent);
      const parameterName = paramNameMatch && paramNameMatch[1]!.trim().length > 0
        ? paramNameMatch[1]!
        : "Unknown Parameter";

      lookup.set(paramId, { deviceName, parameterName });
    }
  }

  return lookup;
}

/**
 * Split the <Tracks> section into individual track XML strings.
 * Returns an array where each element is the full XML content of one track.
 */
function splitTracks(tracksXml: string): string[] {
  const tracks: string[] = [];
  const trackTypes = ["MidiTrack", "AudioTrack", "ReturnTrack", "GroupTrack"];

  // Find all track start positions
  const startPositions: number[] = [];
  const tagPattern = new RegExp(
    `<(${trackTypes.join("|")})\\b[^>]*>`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(tracksXml)) !== null) {
    startPositions.push(match.index);
  }

  // Extract each track's XML by slicing between start positions
  for (let i = 0; i < startPositions.length; i++) {
    const start = startPositions[i]!;
    const end = startPositions[i + 1] ?? tracksXml.length;
    tracks.push(tracksXml.slice(start, end));
  }

  return tracks;
}

/**
 * Extract all AutomationEnvelope data from a single track's XML.
 * Resolves deviceName and parameterName using the PointeeId lookup.
 */
function extractEnvelopesFromTrack(
  trackXml: string,
  trackIndex: number,
  pointeeLookup: PointeeIdLookup,
): AutomationEnvelope[] {
  const envelopes: AutomationEnvelope[] = [];

  let envelopeMatch: RegExpExecArray | null;
  const envelopeRe = new RegExp(AUTOMATION_ENVELOPE_RE.source, "g");

  while ((envelopeMatch = envelopeRe.exec(trackXml)) !== null) {
    const envelopeContent = envelopeMatch[1]!;

    // Extract PointeeId
    const pointeeMatch = POINTEE_ID_RE.exec(envelopeContent);
    if (!pointeeMatch) {
      continue; // Skip envelopes without a valid PointeeId
    }
    const pointeeId = parseInt(pointeeMatch[1]!, 10);
    if (!Number.isFinite(pointeeId)) {
      continue;
    }

    // Extract FloatEvent breakpoints
    const breakpoints: AutomationBreakpoint[] = [];
    const floatEventRe = new RegExp(FLOAT_EVENT_RE.source, "g");
    let eventMatch: RegExpExecArray | null;

    while ((eventMatch = floatEventRe.exec(envelopeContent)) !== null) {
      const time = parseFloat(eventMatch[1]!);
      const value = parseFloat(eventMatch[2]!);

      if (Number.isFinite(time) && Number.isFinite(value)) {
        breakpoints.push({ time, value });
      }
    }

    // Resolve deviceName and parameterName from PointeeId lookup
    const resolved = pointeeLookup.get(pointeeId);

    envelopes.push({
      trackIndex,
      pointeeId,
      deviceName: resolved?.deviceName ?? null,
      parameterName: resolved?.parameterName ?? null,
      breakpoints,
    });
  }

  return envelopes;
}

/**
 * Extract arrangement automation lanes from a single track's XML.
 * Uses AUTOMATION_LANE_RE and AUTOMATION_TARGET_POINTEE_RE patterns.
 * Resolves deviceName/parameterName via the shared PointeeId lookup.
 */
function extractArrangementLanesFromTrack(
  trackXml: string,
  trackIndex: number,
  pointeeLookup: PointeeIdLookup,
): AutomationEnvelope[] {
  const envelopes: AutomationEnvelope[] = [];
  const laneRe = new RegExp(AUTOMATION_LANE_RE.source, "g");
  let laneMatch: RegExpExecArray | null;

  while ((laneMatch = laneRe.exec(trackXml)) !== null) {
    const laneContent = laneMatch[1]!;

    // Extract PointeeId via AutomationTarget — skip lane if missing
    const targetMatch = AUTOMATION_TARGET_POINTEE_RE.exec(laneContent);
    if (!targetMatch) continue;

    const pointeeId = parseInt(targetMatch[1]!, 10);
    if (!Number.isFinite(pointeeId)) continue;

    // Extract breakpoints — skip lane if empty
    const breakpoints: AutomationBreakpoint[] = [];
    const floatEventRe = new RegExp(FLOAT_EVENT_RE.source, "g");
    let eventMatch: RegExpExecArray | null;

    while ((eventMatch = floatEventRe.exec(laneContent)) !== null) {
      const time = parseFloat(eventMatch[1]!);
      const value = parseFloat(eventMatch[2]!);
      if (Number.isFinite(time) && Number.isFinite(value)) {
        breakpoints.push({ time, value });
      }
    }

    if (breakpoints.length === 0) continue;

    // Resolve device/parameter names
    const resolved = pointeeLookup.get(pointeeId);

    envelopes.push({
      trackIndex,
      pointeeId,
      deviceName: resolved?.deviceName ?? null,
      parameterName: resolved?.parameterName ?? null,
      breakpoints,
    });
  }

  return envelopes;
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Parse a .als file and extract automation envelope data.
 *
 * The .als file is a gzip-compressed XML document. This function:
 * 1. Reads the file as a binary buffer
 * 2. Decompresses with gunzip
 * 3. Aborts if decompressed size exceeds 50 MB
 * 4. Uses regex-based streaming extraction (no full DOM)
 * 5. Builds a PointeeId→{deviceName, parameterName} lookup from device parameters
 * 6. Extracts envelopes and resolves device/parameter names via the lookup
 *
 * Returns null on any failure (logs warning internally).
 */
export function parseAlsFile(filePath: string): AlsAutomationData | null {
  const startTime = performance.now();

  try {
    // Step 1: Read file as buffer
    const compressed = readFileSync(filePath);

    // Step 2: Decompress with gunzip
    const decompressed = gunzipSync(compressed);

    // Step 3: Check size limit
    if (decompressed.length > MAX_DECOMPRESSED_SIZE) {
      console.warn(
        `[Als Parser] Decompressed XML exceeds 50MB (${(decompressed.length / 1024 / 1024).toFixed(1)}MB). Aborting parse.`,
      );
      return null;
    }

    // Step 4: Convert to string for regex parsing
    const xml = decompressed.toString("utf-8");

    // Step 5: Extract the <Tracks> section
    const tracksMatch = TRACKS_SECTION_RE.exec(xml);
    if (!tracksMatch) {
      console.warn("[Als Parser] No <Tracks> section found in .als file.");
      return {
        envelopes: [],
        parseTimeMs: performance.now() - startTime,
        trackCount: 0,
      };
    }

    const tracksXml = tracksMatch[1]!;

    // Step 6: Split into individual tracks
    const trackStrings = splitTracks(tracksXml);
    const trackCount = trackStrings.length;

    // Step 7: Build PointeeId → {deviceName, parameterName} lookup
    const pointeeLookup = buildPointeeIdLookup(xml);

    // Step 8: Extract envelopes from each track, resolving PointeeIds
    const allEnvelopes: AutomationEnvelope[] = [];
    for (let i = 0; i < trackStrings.length; i++) {
      const clipEnvelopes = extractEnvelopesFromTrack(trackStrings[i]!, i, pointeeLookup);
      const arrangementLanes = extractArrangementLanesFromTrack(trackStrings[i]!, i, pointeeLookup);
      allEnvelopes.push(...clipEnvelopes, ...arrangementLanes);
    }

    const parseTimeMs = performance.now() - startTime;

    return {
      envelopes: allEnvelopes,
      parseTimeMs,
      trackCount,
    };
  } catch (error) {
    console.warn("[Als Parser] Failed to parse .als file:", error);
    return null;
  }
}

/**
 * Parse automation data from a pre-loaded .als file buffer (gzip-compressed).
 * Same as parseAlsFile but skips the filesystem read — used when the file
 * content is provided from the webview via FileReader API.
 *
 * @param compressed - The raw gzip-compressed .als file content as a Buffer.
 * @returns Parsed automation data, or null on failure.
 */
export function parseAlsBuffer(compressed: Buffer): AlsAutomationData | null {
  const startTime = Date.now();

  try {
    // Step 1: Decompress with gunzip
    const decompressed = gunzipSync(compressed);

    // Step 2: Check size limit
    if (decompressed.length > MAX_DECOMPRESSED_SIZE) {
      console.warn(
        `[Als Parser] Decompressed XML exceeds 50MB (${(decompressed.length / 1024 / 1024).toFixed(1)}MB). Aborting parse.`,
      );
      return null;
    }

    // Step 3: Convert to string for regex parsing
    const xml = decompressed.toString("utf-8");

    // Step 4: Extract the <Tracks> section
    const tracksMatch = TRACKS_SECTION_RE.exec(xml);
    if (!tracksMatch) {
      console.warn("[Als Parser] No <Tracks> section found in .als buffer.");
      return {
        envelopes: [],
        parseTimeMs: Date.now() - startTime,
        trackCount: 0,
      };
    }

    const tracksXml = tracksMatch[1]!;

    // Step 5: Split into individual tracks
    const trackStrings = splitTracks(tracksXml);
    const trackCount = trackStrings.length;

    // Step 6: Build PointeeId → {deviceName, parameterName} lookup
    const pointeeLookup = buildPointeeIdLookup(xml);

    // Step 7: Extract envelopes from each track, resolving PointeeIds
    const allEnvelopes: AutomationEnvelope[] = [];
    for (let i = 0; i < trackStrings.length; i++) {
      const clipEnvelopes = extractEnvelopesFromTrack(trackStrings[i]!, i, pointeeLookup);
      const arrangementLanes = extractArrangementLanesFromTrack(trackStrings[i]!, i, pointeeLookup);
      allEnvelopes.push(...clipEnvelopes, ...arrangementLanes);
    }

    const parseTimeMs = Date.now() - startTime;

    return {
      envelopes: allEnvelopes,
      parseTimeMs,
      trackCount,
    };
  } catch (error) {
    console.warn("[Als Parser] Failed to parse .als buffer:", error);
    return null;
  }
}

// ─── Automation-to-Section Mapping ─────────────────────────────────────

/**
 * Determine whether an automation envelope is "active" in a section.
 *
 * An envelope is active if:
 * - At least 2 breakpoints have a time value within [startTime, endTime)
 * - Those breakpoints have at least 2 distinct values
 */
function isEnvelopeActiveInSection(
  breakpoints: readonly AutomationBreakpoint[],
  startTime: number,
  endTime: number,
): boolean {
  const inRange = breakpoints.filter(bp => bp.time >= startTime && bp.time < endTime);
  if (inRange.length < 2) {
    return false;
  }
  const distinctValues = new Set(inRange.map(bp => bp.value));
  return distinctValues.size >= 2;
}

/**
 * Map automation data to section time ranges.
 * Returns per-track, per-section summaries.
 *
 * Key: section ID (or section index as string if no id).
 * Value: array of SectionAutomationSummary (one per track that has envelopes in the section).
 */
export function mapAutomationToSections(
  automationData: AlsAutomationData,
  sections: readonly { startTime: number; endTime: number; id?: string }[],
): Map<string, SectionAutomationSummary[]> {
  const result = new Map<string, SectionAutomationSummary[]>();

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const section = sections[sectionIdx]!;
    const sectionKey = section.id ?? String(sectionIdx);

    // Group envelopes by track index, accumulate per-track stats
    const trackStats = new Map<number, { activeCount: number; totalBps: number }>();

    for (const envelope of automationData.envelopes) {
      // Count breakpoints within section range for this envelope
      const bpsInRange = envelope.breakpoints.filter(
        bp => bp.time >= section.startTime && bp.time < section.endTime,
      );

      if (bpsInRange.length === 0) {
        continue;
      }

      // Get or create stats for this track
      let stats = trackStats.get(envelope.trackIndex);
      if (!stats) {
        stats = { activeCount: 0, totalBps: 0 };
        trackStats.set(envelope.trackIndex, stats);
      }

      // Add breakpoints in range to total
      stats.totalBps += bpsInRange.length;

      // Check if this envelope is "active" in the section
      if (isEnvelopeActiveInSection(envelope.breakpoints, section.startTime, section.endTime)) {
        stats.activeCount++;
      }
    }

    // Convert track stats map to SectionAutomationSummary array
    const summaries: SectionAutomationSummary[] = [];
    for (const [trackIndex, stats] of trackStats) {
      summaries.push({
        trackIndex,
        activeEnvelopeCount: stats.activeCount,
        totalBreakpoints: stats.totalBps,
      });
    }

    result.set(sectionKey, summaries);
  }

  return result;
}
