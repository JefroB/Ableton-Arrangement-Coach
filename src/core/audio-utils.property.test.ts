import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { mixToMono } from "./audio-utils.js";

// Feature: audio-content-analysis, Property 1: Stereo-to-mono mixdown preserves sample count and averages correctly

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Generate a Float32Array arbitrary of a given length with values in [-1, 1].
 */
function float32ArrayOfLength(length: number): fc.Arbitrary<Float32Array> {
  return fc
    .array(fc.float({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }), {
      minLength: length,
      maxLength: length,
    })
    .map((arr) => new Float32Array(arr));
}

/**
 * Generate a multi-channel audio buffer: 1+ channels, each with N samples.
 * All channels have the same length.
 */
function multiChannelBuffer(): fc.Arbitrary<Float32Array[]> {
  return fc
    .integer({ min: 1, max: 8 }) // 1–8 channels
    .chain((numChannels) =>
      fc.integer({ min: 1, max: 512 }).chain((length) =>
        fc
          .array(float32ArrayOfLength(length), {
            minLength: numChannels,
            maxLength: numChannels,
          }),
      ),
    );
}

// ─── Property 1: Stereo-to-mono mixdown preserves sample count and averages correctly ───

/**
 * **Validates: Requirements 1.5, 3.8**
 *
 * Property 1: Stereo-to-mono mixdown preserves sample count and averages correctly
 * For any multi-channel audio buffer (1+ channels, each with N samples), mixing to
 * mono SHALL produce a Float32Array of exactly N samples where each output sample
 * equals the arithmetic mean of the corresponding samples across all input channels.
 */
describe("Audio Utils — Property 1: Stereo-to-mono mixdown preserves sample count and averages correctly", () => {
  fcTest.prop(
    [multiChannelBuffer()],
    { numRuns: 100 },
  )(
    "output length equals input channel length",
    (channels) => {
      const mono = mixToMono(channels);
      const expectedLength = Math.min(...channels.map((ch) => ch.length));
      expect(mono.length).toBe(expectedLength);
    },
  );

  fcTest.prop(
    [multiChannelBuffer()],
    { numRuns: 100 },
  )(
    "each output sample equals the arithmetic mean of corresponding input samples",
    (channels) => {
      const mono = mixToMono(channels);
      const length = mono.length;
      const numChannels = channels.length;

      for (let i = 0; i < length; i++) {
        let expectedSum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          expectedSum += channels[ch][i];
        }
        const expectedMean = expectedSum / numChannels;
        // Use a small tolerance for floating-point arithmetic
        expect(mono[i]).toBeCloseTo(expectedMean, 5);
      }
    },
  );

  fcTest.prop(
    [fc.integer({ min: 1, max: 512 }).chain((length) => float32ArrayOfLength(length))],
    { numRuns: 100 },
  )(
    "single channel input returns the same array reference (no copy)",
    (channel) => {
      const result = mixToMono([channel]);
      // For single channel, mixToMono returns the same reference
      expect(result).toBe(channel);
      // And values are identical
      for (let i = 0; i < channel.length; i++) {
        expect(result[i]).toBe(channel[i]);
      }
    },
  );

  fcTest.prop(
    [
      fc.integer({ min: 2, max: 8 }).chain((numChannels) =>
        fc.integer({ min: 1, max: 512 }).map((length) => ({
          numChannels,
          length,
        })),
      ),
    ],
    { numRuns: 100 },
  )(
    "works for any number of channels >= 1",
    ({ numChannels, length }) => {
      // Create channels filled with a known constant value
      const value = 0.5;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        const arr = new Float32Array(length);
        arr.fill(value);
        channels.push(arr);
      }

      const mono = mixToMono(channels);
      expect(mono.length).toBe(length);

      // When all channels have the same value, the mean is that value
      for (let i = 0; i < length; i++) {
        expect(mono[i]).toBeCloseTo(value, 5);
      }
    },
  );
});
