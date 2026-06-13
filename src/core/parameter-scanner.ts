/**
 * Parameter Scanner — collects device parameter metadata from all tracks
 * via the SDK adapter to build a Track Parameter Inventory.
 *
 * Pure function module: SdkAdapter + tracks → TrackParameterInventory.
 * No side effects beyond reading through the adapter.
 */
import type { SdkAdapter, TrackData } from "../ableton/sdk-adapter.js";

// ─── Domain Types ──────────────────────────────────────────────────────

/** A single parameter entry in the inventory. */
export interface ParameterInventoryEntry {
  readonly trackIndex: number;
  readonly trackName: string;
  readonly deviceIndex: number;
  readonly deviceName: string;
  readonly parameterName: string;
  readonly min: number;
  readonly max: number;
}

/** The complete parameter inventory for all tracks. */
export type TrackParameterInventory = readonly ParameterInventoryEntry[];

// ─── Constants ─────────────────────────────────────────────────────────

/** Parameters excluded from the inventory (not meaningful automation targets). */
const EXCLUDED_PARAMETER_NAMES = ["Device On"];

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Scan all tracks and devices to build the parameter inventory.
 *
 * For each track, reads devices via the adapter. For each device, reads
 * parameter descriptors. Filters out excluded parameters (e.g., "Device On").
 *
 * Error handling:
 * - If reading devices for a track throws, that track is skipped.
 * - If reading parameters for a device throws, that device is skipped.
 * - The scan always completes; partial results are returned on errors.
 */
export function scanParameters(
  adapter: SdkAdapter,
  tracks: readonly TrackData[],
): TrackParameterInventory {
  const entries: ParameterInventoryEntry[] = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex]!;

    let devices: ReturnType<SdkAdapter["readDevices"]>;
    try {
      devices = adapter.readDevices(trackIndex);
    } catch (error) {
      // Skip this track on error, continue scanning others
      console.error(
        `[Parameter Scanner] Error reading devices for track ${trackIndex} ("${track.name}"):`,
        error,
      );
      continue;
    }

    // Skip tracks with no devices
    if (devices.length === 0) {
      continue;
    }

    for (let deviceIndex = 0; deviceIndex < devices.length; deviceIndex++) {
      const device = devices[deviceIndex]!;

      let parameters: ReturnType<SdkAdapter["readDeviceParameters"]>;
      try {
        parameters = adapter.readDeviceParameters(trackIndex, deviceIndex);
      } catch (error) {
        // Skip this device on error, continue scanning others
        console.error(
          `[Parameter Scanner] Error reading parameters for track ${trackIndex}, device ${deviceIndex}:`,
          error,
        );
        continue;
      }

      for (const param of parameters) {
        // Filter out excluded parameters
        if (EXCLUDED_PARAMETER_NAMES.includes(param.name)) {
          continue;
        }

        entries.push({
          trackIndex,
          trackName: track.name,
          deviceIndex,
          deviceName: device.name,
          parameterName: param.name,
          min: param.min,
          max: param.max,
        });
      }
    }
  }

  return entries;
}
