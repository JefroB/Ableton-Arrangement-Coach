/**
 * Audio Utilities — shared pure helper functions for audio buffer manipulation.
 *
 * Pure function module. No SDK calls, no filesystem access, no side effects.
 */

// ─── Stereo-to-Mono Mixdown ───────────────────────────────────────────

/**
 * Mix multi-channel audio to mono by averaging all channels sample-by-sample.
 *
 * - If `channels` is empty, returns an empty Float32Array.
 * - If `channels` contains a single channel, returns it directly (no copy).
 * - For 2+ channels, creates a new Float32Array of the same length and averages
 *   each sample across all input channels.
 *
 * All channels are assumed to have the same length. If lengths differ, the output
 * length matches the shortest channel.
 *
 * @param channels - One or more Float32Array audio channels.
 * @returns A mono Float32Array with averaged samples.
 */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }

  if (channels.length === 1) {
    return channels[0];
  }

  // Use the shortest channel length to avoid out-of-bounds access.
  const length = Math.min(...channels.map((ch) => ch.length));
  const mono = new Float32Array(length);
  const channelCount = channels.length;
  const scale = 1 / channelCount;

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      sum += channels[ch][i];
    }
    mono[i] = sum * scale;
  }

  return mono;
}
