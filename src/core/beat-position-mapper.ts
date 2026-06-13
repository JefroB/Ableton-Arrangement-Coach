/**
 * Beat Position Mapper — converts sample indices to beat positions and vice versa.
 *
 * Since `renderPreFxAudio` output is already warped to beat-time, the mapping
 * is purely linear: sample index 0 corresponds to `startBeat`, and the last
 * sample corresponds to `endBeat`.
 *
 * Pure function module. No SDK calls, no side effects.
 */

// ─── Types ─────────────────────────────────────────────────────────────

/** Parameters for creating a BeatPositionMapper. */
export interface BeatPositionMapperParams {
  /** Sample rate of the rendered WAV buffer (Hz). */
  readonly sampleRate: number;
  /** Total number of samples in the rendered buffer. */
  readonly totalSamples: number;
  /** Starting beat position (the beat-time passed to renderPreFxAudio). */
  readonly startBeat: number;
  /** Ending beat position (the beat-time passed to renderPreFxAudio). */
  readonly endBeat: number;
}

/** Converts sample indices to beat positions using linear interpolation. */
export interface BeatPositionMapper {
  /** Convert a sample index to a beat position. */
  sampleToBeat(sampleIndex: number): number;
  /** Convert a beat position to the nearest sample index. */
  beatToSample(beatPosition: number): number;
  /** Get the sample range for a given beat range, clamped to buffer bounds. */
  getSampleRange(startBeat: number, endBeat: number): { startSample: number; endSample: number };
}

// ─── Factory ───────────────────────────────────────────────────────────

/**
 * Create a BeatPositionMapper for a rendered audio buffer.
 *
 * The mapping is linear:
 *   beatPosition = startBeat + (sampleIndex / (totalSamples - 1)) × (endBeat - startBeat)
 *
 * For single-sample buffers (totalSamples === 1), both sampleToBeat(0) and
 * beatToSample(startBeat) collapse to index 0.
 *
 * @param params - Buffer metadata: sampleRate, totalSamples, startBeat, endBeat.
 * @returns A BeatPositionMapper instance with linear mapping functions.
 */
export function createBeatPositionMapper(params: BeatPositionMapperParams): BeatPositionMapper {
  const { totalSamples, startBeat, endBeat } = params;

  // The beat span covered by the buffer.
  const beatSpan = endBeat - startBeat;

  // Number of inter-sample intervals. For a buffer with N samples, there are
  // N-1 intervals. This ensures sampleToBeat(totalSamples - 1) === endBeat exactly.
  const lastIndex = totalSamples - 1;

  function sampleToBeat(sampleIndex: number): number {
    if (lastIndex === 0) {
      // Single-sample buffer — all samples map to startBeat.
      return startBeat;
    }
    return startBeat + (sampleIndex / lastIndex) * beatSpan;
  }

  function beatToSample(beatPosition: number): number {
    if (lastIndex === 0) {
      return 0;
    }
    const fraction = (beatPosition - startBeat) / beatSpan;
    return Math.round(fraction * lastIndex);
  }

  function getSampleRange(
    rangeStartBeat: number,
    rangeEndBeat: number,
  ): { startSample: number; endSample: number } {
    // Convert beat positions to sample indices.
    const rawStart = beatToSample(rangeStartBeat);
    const rawEnd = beatToSample(rangeEndBeat);

    // Clamp to buffer bounds [0, totalSamples].
    const startSample = Math.max(0, Math.min(rawStart, totalSamples));
    const endSample = Math.max(0, Math.min(rawEnd, totalSamples));

    // Ensure startSample <= endSample.
    return {
      startSample: Math.min(startSample, endSample),
      endSample: Math.max(startSample, endSample),
    };
  }

  return { sampleToBeat, beatToSample, getSampleRange };
}
