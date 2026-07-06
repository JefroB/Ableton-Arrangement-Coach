// --- src/core/auto-placer.ts ---
/**
 * Auto-Placer — pre-analysis interceptor that detects missing locators
 * and auto-places them using content-aware generation logic.
 *
 * Must be called before runAnalysis() in both trigger paths.
 */
import type { SdkAdapter, CuePointHandle, LocatorData } from "../ableton/sdk-adapter.js";
import type { Store } from "../state/store.js";
import type { Section } from "./section-scanner.js";
import type { ArrangementVariant, GeneratedMarker } from "./structure-types.js";
import { selectMode } from "./mode-selector.js";
import { computeContentMarkers } from "./content-mode.js";
import { computeMinimalMarkers } from "./minimal-mode.js";
import { lookupVariants } from "./structure-registry.js";
import { selectVariant } from "./section-generator.js";
import { buildSections } from "./section-scanner.js";

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Input parameters for the auto-placement functionality.
 */
export interface AutoPlaceInput {
  readonly sdk: SdkAdapter;
  readonly store: Store;
  readonly getSections: () => readonly Section[];
}

/**
 * Represents a successful auto-placement outcome.
 */
export interface AutoPlaceSuccess {
  readonly outcome: "placed";
  readonly markersCreated: number;
  readonly markersExpected: number;
  readonly sections: readonly Section[];
  readonly insufficientWarning: InsufficientCountWarning | null;
}

/**
 * Represents a skipped auto-placement outcome (locators already exist).
 */
export interface AutoPlaceSkipped {
  readonly outcome: "skipped";
  readonly reason: "locators-exist";
}

/**
 * Represents an aborted auto-placement outcome due to missing prerequisites.
 */
export interface AutoPlaceAborted {
  readonly outcome: "aborted";
  readonly reason: "no-genre" | "insufficient-content" | "no-clips";
  readonly message: string;
}

/**
 * Represents a failed auto-placement outcome.
 */
export interface AutoPlaceFailed {
  readonly outcome: "failed";
  readonly reason: "timeout" | "creation-error" | "too-few-markers";
  readonly message: string;
  readonly markersCreated: number;
  readonly markersExpected: number;
}

/**
 * Union type representing all possible auto-placement results.
 */
export type AutoPlaceResult =
  | AutoPlaceSuccess
  | AutoPlaceSkipped
  | AutoPlaceAborted
  | AutoPlaceFailed;

/**
 * Warning shown when fewer locators than typical were placed.
 */
export interface InsufficientCountWarning {
  readonly placed: number;
  readonly typicalMin: number;
  readonly typicalMax: number;
  readonly average: number;
}

/** Clip data as returned by sdk.readAllClips(). */
export interface ClipInfo {
  readonly startTime: number;
  readonly endTime: number;
  readonly muted: boolean;
  readonly trackIndex: number;
}

/**
 * Snapshot of the timeline state captured at the start of auto-placement
 * for race-condition safety (Req 8.5).
 */
export interface TimelineSnapshot {
  readonly clips: ReadonlyArray<ClipInfo>;
  readonly songDuration: number;
  readonly trackCount: number;
}

/**
 * Warning for invalid locator data.
 */
export interface LocatorWarning {
  readonly name: string;
  readonly time: number;
  readonly reason: string;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Rollback created markers by deleting them from the timeline.
 * Iterates in reverse order and attempts to delete each marker.
 * Best-effort deletion - logs errors but doesn't throw.
 *
 * @param sdk - The SDK adapter for interacting with Ableton.
 * @param createdMarkers - Array of marker handles to delete.
 */
async function rollbackCreatedMarkers(sdk: SdkAdapter, createdMarkers: readonly CuePointHandle[]): Promise<void> {
  // Remove in reverse order to avoid index shifting issues
  for (let i = createdMarkers.length - 1; i >= 0; i--) {
    try {
      await sdk.deleteCuePoint(createdMarkers[i]!);
    } catch {
      // Best-effort rollback — log but don't throw
      console.error(`[Auto-Placer] Failed to rollback marker: ${createdMarkers[i]!.name}`);
    }
  }
}

/**
 * Filter invalid locators from the timeline.
 *
 * @param locators - Array of locator data to filter.
 * @param songDuration - The total duration of the song in beats.
 * @returns An object containing valid locators and warnings for invalid ones.
 */
export function filterInvalidLocators(locators: LocatorData[], songDuration: number): { 
  validLocators: LocatorData[]; 
  warnings: LocatorWarning[] 
} {
  const warnings: LocatorWarning[] = [];
  
  // Step 1: Filter out locators where time >= songDuration
  let validLocators = locators.filter(locator => {
    if (locator.time >= songDuration) {
      warnings.push({
        name: locator.name,
        time: locator.time,
        reason: "position beyond song end"
      });
      console.warn(`[Auto-Placer] Invalid locator skipped: ${locator.name} at ${locator.time} beats (song duration: ${songDuration} beats)`);
      return false;
    }
    return true;
  });
  
  // Step 2: Filter out duplicate time values keeping first occurrence
  const seenTimes = new Set<number>();
  validLocators = validLocators.filter(locator => {
    if (seenTimes.has(locator.time)) {
      warnings.push({
        name: locator.name,
        time: locator.time,
        reason: "duplicate beat position"
      });
      console.warn(`[Auto-Placer] Duplicate locator skipped: ${locator.name} at ${locator.time} beats`);
      return false;
    }
    seenTimes.add(locator.time);
    return true;
  });
  
  // Step 3: Return valid locators and warnings
  return {
    validLocators,
    warnings
  };
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Check whether auto-placement is needed and execute it if so.
 * Must be called before runAnalysis() in both trigger paths.
 *
 * @param input - The auto-placement input parameters.
 * @returns A promise that resolves to the result of the auto-placement operation.
 */
export async function autoPlaceIfNeeded(input: AutoPlaceInput): Promise<AutoPlaceResult> {
  const { sdk, store } = input;

  // Step 1: Check if locators already exist — skip if any present (Req 1.3)
  const existingLocators = sdk.readLocators();
  if (existingLocators.length >= 1) {
    return {
      outcome: "skipped",
      reason: "locators-exist",
    };
  }

  // Step 2: Capture TimelineSnapshot for race-condition safety (Req 8.5)
  const clips: ClipInfo[] = sdk.readAllClips();
  const songDuration = sdk.readSongDuration();
  const trackCount = sdk.readTracks().length;

  const snapshot: TimelineSnapshot = {
    clips,
    songDuration,
    trackCount,
  };

  // Step 3: Check for empty timeline (Req 2.6)
  if (snapshot.clips.length === 0) {
    return {
      outcome: "aborted",
      reason: "no-clips",
      message: "No clips found in the arrangement. Add musical content before analyzing.",
    };
  }

  // Step 4: Check content density via selectMode (Req 1.1, 1.2)
  const mode = selectMode({
    clips: snapshot.clips,
    songDuration: snapshot.songDuration,
    trackCount: snapshot.trackCount,
  });

  if (mode === "minimal") {
    return {
      outcome: "aborted",
      reason: "insufficient-content",
      message:
        "Your arrangement does not contain enough content for automatic section detection. Add more clips and try again.",
    };
  }

  // Step 5: Check for selected genre (Req 2.2, 3.1, 3.2)
  const selectedGenreId = store.getState().selectedGenreId;
  if (selectedGenreId === null) {
    return {
      outcome: "aborted",
      reason: "no-genre",
      message:
        "A genre must be selected before analysis can proceed. Use the genre selector at the top of the panel.",
    };
  }

  // Step 6: Proceed with marker generation (Req 2.1, 2.3)
  const beatsPerBar = 4;

  // Look up genre variants from the structure registry
  const variants = lookupVariants(selectedGenreId);
  if (variants === null || variants.length === 0) {
    return {
      outcome: "aborted",
      reason: "no-genre",
      message: `No arrangement structure data available for genre "${selectedGenreId}".`,
    };
  }

  // Invoke content mode first
  let markers: GeneratedMarker[] = computeContentMarkers({
    clips: snapshot.clips,
    variants,
    beatsPerBar,
    songDuration: snapshot.songDuration,
  });

  // Fall back to minimal mode if content mode returned fewer than 3 boundaries
  if (markers.length < 3) {
    const variant = selectVariant(variants);
    markers = computeMinimalMarkers({ variant, beatsPerBar });
  }

  // Create CuePoints sequentially with per-marker error tracking and rollback support
  let markersCreated = 0;
  const markersExpected = markers.length;
  const createdMarkers: CuePointHandle[] = [];

  // Wrap the creation loop in a 30-second timeout using Promise.race pattern
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Timeout"));
    }, 30_000);
  });

  try {
    // Create markers with timeout protection
    const creationPromise = (async () => {
      for (const marker of markers) {
        try {
          const cuePoint = await sdk.createCuePoint(marker.beatPosition);
          cuePoint.name = marker.name;
          createdMarkers.push(cuePoint);
          markersCreated++;
        } catch {
          // Per-marker error tracking: continue placing remaining markers (Req 8.1)
        }
      }
    })();

    await Promise.race([creationPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    // If we reach here, the creation completed without timeout
    if (markersCreated < 3) {
      // Rollback created markers if fewer than 3 were placed
      await rollbackCreatedMarkers(sdk, createdMarkers);
      return {
        outcome: "failed",
        reason: "too-few-markers",
        message: `Too few sections could be placed (${markersCreated}/${markersExpected}) for meaningful analysis. Please check your arrangement and try again.`,
        markersCreated,
        markersExpected,
      };
    }

    // Read newly placed locators
    const newLocators = sdk.readLocators();
    
    // Filter invalid locators
    const { validLocators } = filterInvalidLocators(newLocators, snapshot.songDuration);
    
    // Build sections from the valid locators
    const sections = buildSections(validLocators);
    
    // Compute insufficient count warning
    const insufficientWarning = computeInsufficientWarning(markersCreated, variants);

    // Return success result with actual sections and warning
    return {
      outcome: "placed",
      markersCreated,
      markersExpected,
      sections,
      insufficientWarning,
    };
  } catch (error) {
    // Handle timeout case
    if (error instanceof Error && error.message === "Timeout") {
      // Rollback created markers on timeout
      await rollbackCreatedMarkers(sdk, createdMarkers);
      return {
        outcome: "failed",
        reason: "timeout",
        message: "Auto-placement timed out after 30 seconds. Any partially placed markers have been removed. Please try again.",
        markersCreated: createdMarkers.length,
        markersExpected,
      };
    }
    
    // Re-throw other errors
    throw error;
  }
}

// ─── New Function ──────────────────────────────────────────────────────────────

/**
 * Compute an insufficient count warning if the number of placed locators is below a threshold.
 *
 * @param placed - The number of locators that were actually placed.
 * @param variants - The array of arrangement variants to compute the average from.
 * @returns An InsufficientCountWarning object or null if no warning is needed.
 */
export function computeInsufficientWarning(placed: number, variants: readonly ArrangementVariant[]): InsufficientCountWarning | null {
  if (variants.length === 0) {
    return null;
  }

  const sectionCounts = variants.map(v => v.sections.length);
  const average = Math.floor(sectionCounts.reduce((a, b) => a + b, 0) / sectionCounts.length);
  const threshold = Math.floor(average * 0.75);

  if (placed >= threshold) {
    return null;
  }

  const typicalMin = Math.min(...sectionCounts);
  const typicalMax = Math.max(...sectionCounts);

  return { placed, typicalMin, typicalMax, average };
}