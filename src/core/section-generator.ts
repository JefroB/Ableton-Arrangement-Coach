/**
 * Section Generator — async orchestrator for section marker generation.
 *
 * Coordinates mode selection → generation → SDK calls.
 * This is the only module that bridges pure-functional generation logic
 * with the SDK adapter's side-effectful operations.
 *
 * Flow:
 * 1. Read clips and song duration from SDK
 * 2. Determine mode (minimal vs content) via mode-selector
 * 3. Compute markers via the appropriate mode module
 * 4. Remove existing CuePoints
 * 5. Create new CuePoints sequentially
 * 6. Return result with success/failure details
 *
 * Implements a 30-second timeout with cancellation.
 */

import type { SdkAdapter, CuePointHandle } from "../ableton/sdk-adapter.js";
import type { GeneratedMarker, GenerationResult } from "./structure-types.js";
import { selectMode } from "./mode-selector.js";
import { computeMinimalMarkers } from "./minimal-mode.js";
import { computeContentMarkers } from "./content-mode.js";
import { lookupVariants } from "./structure-registry.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** Maximum time (ms) allowed for the entire generation operation. */
const GENERATION_TIMEOUT_MS = 30_000;

// ─── Orchestrator ──────────────────────────────────────────────────────

/**
 * Orchestrates section marker generation end-to-end.
 *
 * @param sdk - The SDK adapter for reading data and creating CuePoints.
 * @param subgenreId - The selected subgenre identifier for variant lookup.
 * @param beatsPerBar - Beats per bar (default 4 for 4/4 time).
 * @returns A GenerationResult with success/failure details.
 */
export async function generateSections(
  sdk: SdkAdapter,
  subgenreId: string,
  beatsPerBar: number = 4,
): Promise<GenerationResult> {
  // Wrap the entire operation in a timeout race
  return raceWithTimeout(
    () => executeGeneration(sdk, subgenreId, beatsPerBar),
    GENERATION_TIMEOUT_MS,
  );
}

// ─── Core Execution ────────────────────────────────────────────────────

/**
 * The actual generation logic, separated from timeout handling for clarity.
 */
async function executeGeneration(
  sdk: SdkAdapter,
  subgenreId: string,
  beatsPerBar: number,
): Promise<GenerationResult> {
  // Step 1: Read timeline data from SDK
  const clips = sdk.readAllClips();
  const songDuration = sdk.readSongDuration();
  const trackCount = sdk.readTracks().length;

  // Step 2: Determine mode
  const mode = selectMode({ clips, songDuration, trackCount });

  // Step 3: Look up genre variants (required for both modes)
  const variants = lookupVariants(subgenreId);
  if (variants === null || variants.length === 0) {
    return {
      success: false,
      markersCreated: 0,
      markersExpected: 0,
      error: `No arrangement data available for genre "${subgenreId}"`,
    };
  }

  // Step 4: Compute markers based on mode
  let markers: GeneratedMarker[];

  if (mode === "minimal") {
    markers = computeMinimalModeMarkers(variants, beatsPerBar);
  } else {
    // Content mode — with fallback to Minimal if < 3 boundaries detected
    markers = computeContentMarkers({
      clips,
      variants,
      beatsPerBar,
      songDuration,
    });

    // Fall back to Minimal Mode if content mode returned empty (< 3 boundaries)
    if (markers.length === 0) {
      markers = computeMinimalModeMarkers(variants, beatsPerBar);
    }
  }

  if (markers.length === 0) {
    return {
      success: false,
      markersCreated: 0,
      markersExpected: 0,
      error: "No markers could be computed from the selected variant",
    };
  }

  // Offset all markers by 4 bars to leave empty space before the first section.
  // Producers typically leave a few bars of silence/count-in at the start.
  const offsetBeats = 4 * beatsPerBar;
  markers = markers.map((m) => ({
    name: m.name,
    beatPosition: m.beatPosition + offsetBeats,
  }));

  // Step 5: Remove existing CuePoints before placing new ones (Req 9.5)
  await removeExistingCuePoints(sdk);

  // Step 6: Create CuePoints sequentially, handling partial failures
  return await createMarkersSequentially(sdk, markers);
}

// ─── Variant Selection ─────────────────────────────────────────────────

/**
 * Selects a random variant from a non-empty array using uniform distribution.
 *
 * @param variants - Non-empty array of arrangement variants.
 * @returns A variant that is a member of the input array.
 */
export function selectVariant<T>(variants: readonly T[]): T {
  const randomIndex = Math.floor(Math.random() * variants.length);
  return variants[randomIndex]!;
}

// ─── Minimal Mode Helper ───────────────────────────────────────────────

/**
 * Selects a random variant and computes markers using minimal mode.
 */
function computeMinimalModeMarkers(
  variants: readonly import("./structure-types.js").ArrangementVariant[],
  beatsPerBar: number,
): GeneratedMarker[] {
  // Select a random variant using uniform distribution
  const variant = selectVariant(variants);

  return computeMinimalMarkers({ variant, beatsPerBar });
}

// ─── CuePoint Management ──────────────────────────────────────────────

/**
 * Removes all existing CuePoints from the Live Set.
 *
 * Reads locators, constructs CuePointHandle-compatible objects, and deletes
 * them one at a time (re-reading after each deletion to handle index shifts).
 *
 * Note: readLocators() returns plain LocatorData DTOs. We construct
 * CuePointHandle objects from them for the deleteCuePoint call. In production,
 * the adapter's deleteCuePoint forwards these to the SDK's song.deleteCuePoint.
 * In test doubles, the mock handles deletion by matching on time/name.
 */
async function removeExistingCuePoints(sdk: SdkAdapter): Promise<void> {
  let locators = sdk.readLocators();

  while (locators.length > 0) {
    const last = locators[locators.length - 1]!;

    const handle: CuePointHandle = {
      name: last.name,
      time: last.time,
    };

    await sdk.deleteCuePoint(handle);

    // Re-read after each deletion since the list shifts
    locators = sdk.readLocators();
  }
}

// ─── Sequential Marker Creation ────────────────────────────────────────

/**
 * Creates CuePoints sequentially, stopping on first failure.
 * Returns partial success result if a creation fails partway through.
 */
async function createMarkersSequentially(
  sdk: SdkAdapter,
  markers: readonly GeneratedMarker[],
): Promise<GenerationResult> {
  const totalExpected = markers.length;
  let created = 0;

  for (const marker of markers) {
    try {
      const cuePoint = await sdk.createCuePoint(marker.beatPosition);
      cuePoint.name = marker.name;
      created++;
    } catch (error) {
      // Partial failure — stop and report
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        markersCreated: created,
        markersExpected: totalExpected,
        error: created === 0
          ? `Failed to create marker "${marker.name}" at beat ${marker.beatPosition}: ${errorMessage}`
          : `Created ${created} of ${totalExpected} markers. Failed on "${marker.name}" at beat ${marker.beatPosition}: ${errorMessage}`,
        failedSection: { name: marker.name, beatPosition: marker.beatPosition },
      };
    }
  }

  return {
    success: true,
    markersCreated: created,
    markersExpected: totalExpected,
  };
}

// ─── Timeout Handling ──────────────────────────────────────────────────

/**
 * Races a generation operation against a timeout.
 * Returns a timeout error result if the operation exceeds the deadline.
 */
async function raceWithTimeout(
  operation: () => Promise<GenerationResult>,
  timeoutMs: number,
): Promise<GenerationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<GenerationResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        success: false,
        markersCreated: 0,
        markersExpected: 0,
        error: "Generation timed out after 30 seconds",
      });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
