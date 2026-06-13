/**
 * Property-based tests for the Parameter Scanner module.
 *
 * Feature: automation-awareness
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import { scanParameters } from "./parameter-scanner.js";
import type { SdkAdapter, TrackData, DeviceData, ParameterDescriptor } from "../ableton/sdk-adapter.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a valid parameter name that is NOT "Device On". */
const validParamNameArbitrary = fc.stringOf(
  fc.char().filter((c) => c !== "\0"),
  { minLength: 1, maxLength: 30 },
).filter((name) => name !== "Device On" && name.trim().length > 0);

/** Generate a parameter descriptor with distinct min and max (min < max). */
const paramDescriptorArbitrary = fc.record({
  name: validParamNameArbitrary,
  min: fc.float({ min: Math.fround(0), max: Math.fround(0.5), noNaN: true }),
  max: fc.float({ min: Math.fround(0.6), max: Math.fround(1.0), noNaN: true }),
  defaultValue: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
});

/** Generate a "Device On" parameter descriptor (should be excluded). */
const deviceOnParamArbitrary = fc.record({
  name: fc.constant("Device On"),
  min: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  max: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  defaultValue: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
});

/** Generate a parameter with min === max (non-automatable). */
const minEqualsMaxParamArbitrary = fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }).chain((val) =>
  fc.record({
    name: validParamNameArbitrary,
    min: fc.constant(val),
    max: fc.constant(val),
    defaultValue: fc.constant(val),
  }),
);

/** Generate a device name. */
const deviceNameArbitrary = fc.stringOf(
  fc.char().filter((c) => c !== "\0"),
  { minLength: 1, maxLength: 20 },
).filter((name) => name.trim().length > 0);

/** Generate a track name. */
const trackNameArbitrary = fc.stringOf(
  fc.char().filter((c) => c !== "\0"),
  { minLength: 1, maxLength: 20 },
).filter((name) => name.trim().length > 0);

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Build a mock SdkAdapter from a structured config describing tracks, devices,
 * and parameters.
 */
interface TrackConfig {
  name: string;
  devices: { name: string; parameters: ParameterDescriptor[] }[];
}

function buildMockAdapter(tracks: TrackConfig[]): SdkAdapter {
  return {
    readLocators: () => [],
    readTracks: () => tracks.map((t) => ({ name: t.name, type: "midi" as const })),
    readPlayheadPosition: () => 0,
    readArrangementClips: () => [],
    readMidiNotes: () => [],
    readDevices: (trackIndex: number): DeviceData[] => {
      const track = tracks[trackIndex];
      if (!track) return [];
      return track.devices.map((d) => ({ name: d.name }));
    },
    readDeviceParameters: (trackIndex: number, deviceIndex: number): ParameterDescriptor[] => {
      const track = tracks[trackIndex];
      if (!track) return [];
      const device = track.devices[deviceIndex];
      if (!device) return [];
      return device.parameters;
    },
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

// ─── Property 1: Parameter inventory entry completeness ────────────────

// Feature: automation-awareness, Property 1: Parameter inventory entry completeness
describe("Property 1: Parameter inventory entry completeness", () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any set of tracks with devices and parameters (including tracks with
   * zero devices), running scanParameters SHALL produce a TrackParameterInventory
   * where every entry contains non-empty trackName, deviceName, and parameterName
   * fields, and the total entry count equals the sum of parameters across all
   * devices on all tracks (minus filtered "Device On" entries).
   */

  test.prop(
    [
      // Generate 1–5 tracks, each with 0–3 devices, each device with 1–5 params
      fc.array(
        fc.tuple(
          trackNameArbitrary,
          fc.array(
            fc.tuple(
              deviceNameArbitrary,
              fc.array(paramDescriptorArbitrary, { minLength: 1, maxLength: 5 }),
            ),
            { minLength: 0, maxLength: 3 },
          ),
        ),
        { minLength: 1, maxLength: 5 },
      ),
    ],
    { numRuns: 100 },
  )(
    "every entry has non-empty trackName, deviceName, parameterName and count matches expected",
    (trackConfigs) => {
      // Build the track config structure
      const tracks: TrackConfig[] = trackConfigs.map(([trackName, devices]) => ({
        name: trackName,
        devices: devices.map(([deviceName, params]) => ({
          name: deviceName,
          parameters: params,
        })),
      }));

      const trackData: TrackData[] = tracks.map((t) => ({
        name: t.name,
        type: "midi" as const,
      }));

      const adapter = buildMockAdapter(tracks);
      const inventory = scanParameters(adapter, trackData);

      // Compute expected count: sum of all parameters minus "Device On"
      // (Our generator excludes "Device On" names, so expected = total parameter count)
      let expectedCount = 0;
      for (const track of tracks) {
        for (const device of track.devices) {
          for (const param of device.parameters) {
            if (param.name !== "Device On") {
              expectedCount++;
            }
          }
        }
      }

      // Verify count matches expected
      expect(inventory.length).toBe(expectedCount);

      // Verify every entry has non-empty fields
      for (const entry of inventory) {
        expect(entry.trackName.trim().length).toBeGreaterThan(0);
        expect(entry.deviceName.trim().length).toBeGreaterThan(0);
        expect(entry.parameterName.trim().length).toBeGreaterThan(0);
      }

      // Verify trackIndex and deviceIndex are within valid ranges
      for (const entry of inventory) {
        expect(entry.trackIndex).toBeGreaterThanOrEqual(0);
        expect(entry.trackIndex).toBeLessThan(tracks.length);
        expect(entry.deviceIndex).toBeGreaterThanOrEqual(0);
        expect(entry.deviceIndex).toBeLessThan(tracks[entry.trackIndex]!.devices.length);
      }
    },
  );

  test.prop(
    [
      // Generate 1–5 tracks, all with zero devices
      fc.array(trackNameArbitrary, { minLength: 1, maxLength: 5 }),
    ],
    { numRuns: 100 },
  )(
    "tracks with zero devices produce empty inventory",
    (trackNames) => {
      const tracks: TrackConfig[] = trackNames.map((name) => ({
        name,
        devices: [],
      }));

      const trackData: TrackData[] = tracks.map((t) => ({
        name: t.name,
        type: "midi" as const,
      }));

      const adapter = buildMockAdapter(tracks);
      const inventory = scanParameters(adapter, trackData);

      // No devices → no parameters → empty inventory
      expect(inventory).toHaveLength(0);
    },
  );
});

// ─── Property 2: Excluded parameters never appear in inventory ─────────

// Feature: automation-awareness, Property 2: Excluded parameters never appear in inventory
describe("Property 2: Excluded parameters never appear in inventory", () => {
  /**
   * **Validates: Requirements 1.4, 18.8**
   *
   * For any parameter configuration including parameters named "Device On"
   * and parameters with min === max, running scanParameters SHALL exclude
   * "Device On" from inventory. Parameters with min === max are passed through
   * by the scanner (filtering for those is handled at the suggestion layer),
   * but "Device On" must NEVER appear in output.
   */

  test.prop(
    [
      // Generate 1–4 tracks, each with 1–3 devices
      fc.array(
        fc.tuple(trackNameArbitrary, fc.array(
          fc.tuple(
            deviceNameArbitrary,
            // Each device has a mix of valid params, "Device On" params, and min===max params
            fc.tuple(
              fc.array(paramDescriptorArbitrary, { minLength: 0, maxLength: 3 }),
              fc.array(deviceOnParamArbitrary, { minLength: 1, maxLength: 2 }),
              fc.array(minEqualsMaxParamArbitrary, { minLength: 0, maxLength: 2 }),
            ),
          ),
          { minLength: 1, maxLength: 3 },
        )),
        { minLength: 1, maxLength: 4 },
      ),
    ],
    { numRuns: 100 },
  )(
    '"Device On" parameters never appear in the output inventory',
    (trackConfigs) => {
      // Build the track config structure
      const tracks: TrackConfig[] = trackConfigs.map(([trackName, devices]) => ({
        name: trackName,
        devices: devices.map(([deviceName, [validParams, deviceOnParams, minMaxParams]]) => ({
          name: deviceName,
          parameters: [...validParams, ...deviceOnParams, ...minMaxParams],
        })),
      }));

      const trackData: TrackData[] = tracks.map((t) => ({
        name: t.name,
        type: "midi" as const,
      }));

      const adapter = buildMockAdapter(tracks);
      const inventory = scanParameters(adapter, trackData);

      // ASSERT: No entry in the inventory has parameterName === "Device On"
      for (const entry of inventory) {
        expect(entry.parameterName).not.toBe("Device On");
      }
    },
  );

  test.prop(
    [
      // Generate tracks where ALL parameters are "Device On"
      fc.array(
        fc.tuple(trackNameArbitrary, fc.array(
          fc.tuple(
            deviceNameArbitrary,
            fc.array(deviceOnParamArbitrary, { minLength: 1, maxLength: 4 }),
          ),
          { minLength: 1, maxLength: 3 },
        )),
        { minLength: 1, maxLength: 3 },
      ),
    ],
    { numRuns: 100 },
  )(
    "inventory is empty when all parameters are 'Device On'",
    (trackConfigs) => {
      const tracks: TrackConfig[] = trackConfigs.map(([trackName, devices]) => ({
        name: trackName,
        devices: devices.map(([deviceName, params]) => ({
          name: deviceName,
          parameters: params,
        })),
      }));

      const trackData: TrackData[] = tracks.map((t) => ({
        name: t.name,
        type: "midi" as const,
      }));

      const adapter = buildMockAdapter(tracks);
      const inventory = scanParameters(adapter, trackData);

      // When every parameter is "Device On", the entire inventory should be empty
      expect(inventory).toHaveLength(0);
    },
  );

  test.prop(
    [
      // Generate a mixed config with known counts of valid vs excluded params
      fc.integer({ min: 1, max: 5 }), // number of valid params per device
      fc.integer({ min: 1, max: 3 }), // number of "Device On" params per device
      trackNameArbitrary,
      deviceNameArbitrary,
    ],
    { numRuns: 100 },
  )(
    "inventory count excludes 'Device On' but includes min===max params",
    (validCount, deviceOnCount, trackName, deviceName) => {
      // Build controlled params
      const validParams: ParameterDescriptor[] = Array.from({ length: validCount }, (_, i) => ({
        name: `Param ${i}`,
        min: 0,
        max: 1,
        defaultValue: 0.5,
      }));

      const deviceOnParams: ParameterDescriptor[] = Array.from({ length: deviceOnCount }, () => ({
        name: "Device On",
        min: 0,
        max: 1,
        defaultValue: 1,
      }));

      // min===max params should NOT be excluded by the scanner
      const minMaxParams: ParameterDescriptor[] = [
        { name: "Fixed Param", min: 0.5, max: 0.5, defaultValue: 0.5 },
      ];

      const tracks: TrackConfig[] = [{
        name: trackName,
        devices: [{
          name: deviceName,
          parameters: [...validParams, ...deviceOnParams, ...minMaxParams],
        }],
      }];

      const trackData: TrackData[] = [{ name: trackName, type: "midi" }];
      const adapter = buildMockAdapter(tracks);
      const inventory = scanParameters(adapter, trackData);

      // Valid params + min===max params should be present, "Device On" excluded
      const expectedCount = validCount + minMaxParams.length;
      expect(inventory).toHaveLength(expectedCount);

      // Double-check no "Device On" leaked through
      expect(inventory.every((e) => e.parameterName !== "Device On")).toBe(true);
    },
  );
});
