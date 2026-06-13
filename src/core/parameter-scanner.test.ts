/**
 * Unit tests for the Parameter Scanner module.
 *
 * Tests exercise `scanParameters` with a mock SDK adapter to verify
 * correct inventory building, filtering, and error resilience.
 */
import { describe, it, expect, vi } from "vitest";
import { scanParameters } from "./parameter-scanner.js";
import { createMockSdkAdapter } from "../../test/mock-sdk-adapter.js";
import type { TrackData } from "../ableton/sdk-adapter.js";

describe("Parameter Scanner — scanParameters", () => {
  it("returns empty inventory when tracks array is empty", () => {
    const adapter = createMockSdkAdapter();
    const tracks: TrackData[] = [];

    const result = scanParameters(adapter, tracks);

    expect(result).toEqual([]);
  });

  it("returns empty inventory when tracks have no devices", () => {
    const adapter = createMockSdkAdapter();
    adapter.setDevices(0, []);
    adapter.setDevices(1, []);
    const tracks: TrackData[] = [
      { name: "Bass", type: "midi" },
      { name: "Drums", type: "audio" },
    ];

    const result = scanParameters(adapter, tracks);

    expect(result).toEqual([]);
  });

  it("returns correct inventory entries for tracks with devices and parameters", () => {
    const adapter = createMockSdkAdapter();
    adapter.setDevices(0, [{ name: "Auto Filter" }, { name: "Reverb" }]);
    adapter.setDeviceParameters(0, 0, [
      { name: "Filter Freq", min: 20, max: 20000, defaultValue: 1000 },
      { name: "Resonance", min: 0, max: 1, defaultValue: 0.5 },
    ]);
    adapter.setDeviceParameters(0, 1, [
      { name: "Decay", min: 0, max: 10, defaultValue: 2 },
    ]);
    adapter.setDevices(1, [{ name: "Compressor" }]);
    adapter.setDeviceParameters(1, 0, [
      { name: "Threshold", min: -60, max: 0, defaultValue: -20 },
    ]);

    const tracks: TrackData[] = [
      { name: "Bass", type: "midi" },
      { name: "Drums", type: "audio" },
    ];

    const result = scanParameters(adapter, tracks);

    expect(result).toEqual([
      {
        trackIndex: 0,
        trackName: "Bass",
        deviceIndex: 0,
        deviceName: "Auto Filter",
        parameterName: "Filter Freq",
        min: 20,
        max: 20000,
      },
      {
        trackIndex: 0,
        trackName: "Bass",
        deviceIndex: 0,
        deviceName: "Auto Filter",
        parameterName: "Resonance",
        min: 0,
        max: 1,
      },
      {
        trackIndex: 0,
        trackName: "Bass",
        deviceIndex: 1,
        deviceName: "Reverb",
        parameterName: "Decay",
        min: 0,
        max: 10,
      },
      {
        trackIndex: 1,
        trackName: "Drums",
        deviceIndex: 0,
        deviceName: "Compressor",
        parameterName: "Threshold",
        min: -60,
        max: 0,
      },
    ]);
  });

  it("filters out 'Device On' parameters from inventory", () => {
    const adapter = createMockSdkAdapter();
    adapter.setDevices(0, [{ name: "Operator" }]);
    adapter.setDeviceParameters(0, 0, [
      { name: "Device On", min: 0, max: 1, defaultValue: 1 },
      { name: "Volume", min: 0, max: 1, defaultValue: 0.8 },
      { name: "Filter Freq", min: 20, max: 20000, defaultValue: 5000 },
    ]);

    const tracks: TrackData[] = [{ name: "Synth", type: "midi" }];

    const result = scanParameters(adapter, tracks);

    expect(result).toHaveLength(2);
    expect(result.every((e) => e.parameterName !== "Device On")).toBe(true);
    expect(result[0]!.parameterName).toBe("Volume");
    expect(result[1]!.parameterName).toBe("Filter Freq");
  });

  it("skips tracks where readDevices throws, continues scanning others", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Create a custom adapter that throws for track 0 but works for track 1
    const adapter = createMockSdkAdapter();
    adapter.setDevices(1, [{ name: "EQ Eight" }]);
    adapter.setDeviceParameters(1, 0, [
      { name: "Frequency", min: 20, max: 20000, defaultValue: 1000 },
    ]);

    // Override readDevices to throw for track 0
    const originalReadDevices = adapter.readDevices.bind(adapter);
    adapter.readDevices = (trackIndex: number) => {
      if (trackIndex === 0) {
        throw new Error("SDK device read failure");
      }
      return originalReadDevices(trackIndex);
    };

    const tracks: TrackData[] = [
      { name: "Broken Track", type: "midi" },
      { name: "Working Track", type: "audio" },
    ];

    const result = scanParameters(adapter, tracks);

    // Should skip track 0 and still include track 1's parameters
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      trackIndex: 1,
      trackName: "Working Track",
      deviceIndex: 0,
      deviceName: "EQ Eight",
      parameterName: "Frequency",
      min: 20,
      max: 20000,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error reading devices for track 0"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("skips devices where readDeviceParameters throws, continues scanning others", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const adapter = createMockSdkAdapter();
    adapter.setDevices(0, [{ name: "Broken Plugin" }, { name: "Reverb" }]);
    // Don't set parameters for device 0 — override to throw
    adapter.setDeviceParameters(0, 1, [
      { name: "Room Size", min: 0, max: 1, defaultValue: 0.5 },
    ]);

    // Override readDeviceParameters to throw for device 0
    const originalReadParams = adapter.readDeviceParameters.bind(adapter);
    adapter.readDeviceParameters = (trackIndex: number, deviceIndex: number) => {
      if (trackIndex === 0 && deviceIndex === 0) {
        throw new Error("SDK parameter read failure");
      }
      return originalReadParams(trackIndex, deviceIndex);
    };

    const tracks: TrackData[] = [{ name: "FX Track", type: "midi" }];

    const result = scanParameters(adapter, tracks);

    // Should skip device 0 but include device 1's parameters
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      trackIndex: 0,
      trackName: "FX Track",
      deviceIndex: 1,
      deviceName: "Reverb",
      parameterName: "Room Size",
      min: 0,
      max: 1,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error reading parameters for track 0, device 0"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("handles a single device with a single parameter", () => {
    const adapter = createMockSdkAdapter();
    adapter.setDevices(0, [{ name: "Utility" }]);
    adapter.setDeviceParameters(0, 0, [
      { name: "Gain", min: -35, max: 35, defaultValue: 0 },
    ]);

    const tracks: TrackData[] = [{ name: "Master Bus", type: "audio" }];

    const result = scanParameters(adapter, tracks);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      trackIndex: 0,
      trackName: "Master Bus",
      deviceIndex: 0,
      deviceName: "Utility",
      parameterName: "Gain",
      min: -35,
      max: 35,
    });
  });
});
