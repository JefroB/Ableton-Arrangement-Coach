/**
 * SDK Adapter — the sole isolation layer between the Arrangement Coach
 * extension and the Ableton Extensions SDK.
 *
 * All other modules import the plain domain types (LocatorData, TrackData)
 * exported from this file and never touch `@ableton-extensions/sdk` directly.
 */
import {
  type ExtensionContext,
  MidiTrack,
  AudioTrack,
  AudioClip,
  MidiClip,
} from "@ableton-extensions/sdk";

import type { AudioClipData, WarpMarkerData } from "../core/reference-types";
import type { AudioRenderAdapter } from "../core/audio-content-types.js";
import { createAlsPathResolver, type ResolutionResult } from "../core/als-path-resolver.js";
import { deriveSongFingerprint, extractProjectRoot } from "../core/als-path-strategies.js";
import alsFileDialogHtml from "../ui/als-file-dialog.html";
import path from "node:path";

// ─── Domain Transfer Objects ───────────────────────────────────────────

/** A single cue point (locator) read from the Live Set. */
export interface LocatorData {
  readonly name: string;
  readonly time: number; // beats
}

/** A single track descriptor read from the Live Set. */
export interface TrackData {
  readonly name: string;
  readonly type: "midi" | "audio";
}

/** Arrangement clip data transfer object. */
export interface ClipData {
  readonly startTime: number; // beats
  readonly endTime: number; // beats
  readonly muted: boolean;
  readonly hasEnvelopes: boolean;
}

/** MIDI note data transfer object. */
export interface NoteData {
  readonly pitch: number; // 0–127
  readonly startTime: number; // beats (arrangement-absolute)
  readonly duration: number; // beats
  readonly velocity: number; // 1–127
}

/** Device data transfer object. */
export interface DeviceData {
  readonly name: string;
}

/** Parameter descriptor read from a device. */
export interface ParameterDescriptor {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
}

/** Opaque handle representing an SDK CuePoint for creation/deletion. */
export interface CuePointHandle {
  readonly time: number;
  name: string;
}

// ─── Adapter Interface ─────────────────────────────────────────────────

/** Abstraction over Ableton SDK calls, enabling test doubles. */
export interface SdkAdapter extends AudioRenderAdapter {
  /** Read all cue points (locators) from the Live Set. */
  readLocators(): LocatorData[];

  /** Read all regular tracks from the Live Set. */
  readTracks(): TrackData[];

  /** Read the current playhead position in beats. */
  readPlayheadPosition(): number;

  /** Read arrangement clips from a track by index. */
  readArrangementClips(trackIndex: number): ClipData[];

  /** Read MIDI notes from a specific clip on a track, with arrangement-absolute positions. */
  readMidiNotes(trackIndex: number, clipIndex: number): NoteData[];

  /** Read top-level device names from a track by index. */
  readDevices(trackIndex: number): DeviceData[];

  /** Read parameter descriptors for a specific device on a track. */
  readDeviceParameters(trackIndex: number, deviceIndex: number): ParameterDescriptor[];

  /** Read the current Set's file path (returns undefined if not saved). */
  readSetFilePath(): string | undefined | Promise<string | undefined>;

  /** Manually set the .als file path (from user input). Overrides all resolution strategies. */
  setAlsPathOverride(path: string): void;

  /** Provide raw .als file content as a Buffer (from webview FileReader). Bypasses filesystem entirely. Pass undefined to clear. */
  setAlsBufferOverride(buffer: Buffer | undefined): void;

  /** Get the .als buffer override if set. */
  getAlsBufferOverride(): Buffer | undefined;

  /** Read audio clips (with warp markers) from a track by index. */
  readAudioClips(trackIndex: number): AudioClipData[];

  /** Read the current tempo (BPM) from the Live Set. */
  readTempo(): number;

  /** Create a cue point at the given beat position. Returns the created CuePoint. */
  createCuePoint(time: number): Promise<CuePointHandle>;

  /** Delete a cue point from the Live Set. */
  deleteCuePoint(cuePoint: CuePointHandle): Promise<void>;

  /** Read the song duration in beats (end of last clip or arrangement length). */
  readSongDuration(): number;

  /** Read all clips across all tracks for mode selection and content analysis. */
  readAllClips(): { startTime: number; endTime: number; muted: boolean; trackIndex: number }[];

  /** Get a fingerprint of the current song (name + track names). Used for project-change detection. */
  getSongFingerprint(): string;
}

// ─── Production Implementation ─────────────────────────────────────────

/**
 * Create the production SDK adapter backed by a real ExtensionContext.
 * This is the only factory that touches `@ableton-extensions/sdk` types at
 * runtime.
 */
export function createSdkAdapter(context: ExtensionContext): SdkAdapter {
  // ── Cache invalidation state ──────────────────────────────────────────
  let previousFingerprint: string | undefined;

  // ── Manual override for .als path (set by user via UI) ────────────────
  let alsPathOverride: string | undefined;

  // ── Raw .als buffer override (from webview FileReader) ────────────────
  let alsBufferOverride: Buffer | undefined;

  // ── Instantiate ALS path resolver ─────────────────────────────────────
  const resolver = createAlsPathResolver({
    storageDirectory: context.environment.storageDirectory,

    getAudioClipPaths(): string[] {
      const paths: string[] = [];
      try {
        const tracks = context.application.song.tracks;
        if (tracks && tracks.length > 0) {
          for (const track of tracks) {
            if (!(track instanceof AudioTrack)) continue;
            const clips = track.arrangementClips;
            if (!clips || clips.length === 0) continue;
            for (const clip of clips) {
              if (!(clip instanceof AudioClip)) continue;
              const clipPath = clip.filePath;
              if (clipPath) paths.push(clipPath);
            }
          }
        }
      } catch (err) {
        console.warn("[SDK Adapter] Error collecting audio clip paths:", err);
      }
      return paths;
    },

    async showFileDialog(): Promise<string | undefined> {
      try {
        const resultJson = await context.ui.showModalDialog(
          `data:text/html,${encodeURIComponent(alsFileDialogHtml)}`,
          420,
          260,
        );
        const result = JSON.parse(resultJson);
        return result.path ?? undefined;
      } catch {
        // Dialog was rejected or user cancelled in a way that threw
        return undefined;
      }
    },

    getSongFingerprint(): string {
      const song = context.application.song;
      const trackNames = (song.tracks ?? []).map((t: { name: string }) => t.name);
      return deriveSongFingerprint(song.name, trackNames);
    },

    getSongName(): string {
      return context.application.song.name ?? "";
    },
  });

  return {
    readLocators(): LocatorData[] {
      const cuePoints = context.application.song.cuePoints;
      if (!cuePoints || cuePoints.length === 0) {
        return [];
      }
      return cuePoints.map((cp) => ({
        name: cp.name,
        time: cp.time,
      }));
    },

    readTracks(): TrackData[] {
      const tracks = context.application.song.tracks;
      if (!tracks || tracks.length === 0) {
        return [];
      }
      return tracks.map((track) => ({
        name: track.name,
        type: track instanceof MidiTrack ? "midi" : "audio",
      }));
    },

    readPlayheadPosition(): number {
      return context.application.song.currentTime;
    },

    readArrangementClips(trackIndex: number): ClipData[] {
      try {
        const tracks = context.application.song.tracks;
        if (!tracks || trackIndex < 0 || trackIndex >= tracks.length) {
          return [];
        }
        const track = tracks[trackIndex]!;
        const clips = track.arrangementClips;
        if (!clips || clips.length === 0) {
          return [];
        }
        return clips.map((clip) => ({
          startTime: clip.startTime,
          endTime: clip.endTime,
          muted: clip.muted,
          hasEnvelopes: clip.hasEnvelopes,
        }));
      } catch (error) {
        console.error(
          `[SDK Adapter] Error reading arrangement clips for track ${trackIndex}:`,
          error,
        );
        return [];
      }
    },

    readMidiNotes(trackIndex: number, clipIndex: number): NoteData[] {
      try {
        const tracks = context.application.song.tracks;
        if (!tracks || trackIndex < 0 || trackIndex >= tracks.length) {
          return [];
        }
        const track = tracks[trackIndex]!;
        const clips = track.arrangementClips;
        if (!clips || clipIndex < 0 || clipIndex >= clips.length) {
          return [];
        }
        const clip = clips[clipIndex]!;
        if (!(clip instanceof MidiClip)) {
          return [];
        }
        const clipStartTime = clip.startTime;
        const notes = clip.notes;
        if (!notes || notes.length === 0) {
          return [];
        }
        return notes
          .filter((note) => note.muted !== true)
          .map((note) => ({
            pitch: note.pitch,
            startTime: note.startTime + clipStartTime,
            duration: note.duration,
            velocity: note.velocity ?? 100,
          }));
      } catch (error) {
        console.error(
          `[SDK Adapter] Error reading MIDI notes for track ${trackIndex}, clip ${clipIndex}:`,
          error,
        );
        return [];
      }
    },

    readDevices(trackIndex: number): DeviceData[] {
      try {
        const tracks = context.application.song.tracks;
        if (!tracks || trackIndex < 0 || trackIndex >= tracks.length) {
          console.error(
            `[SDK Adapter] Error reading devices: trackIndex ${trackIndex} out of range`,
          );
          return [];
        }
        const track = tracks[trackIndex]!;
        const devices = track.devices;
        if (!devices || devices.length === 0) {
          return [];
        }
        return devices.map((device) => ({
          name: device.name,
        }));
      } catch (error) {
        console.error(
          `[SDK Adapter] Error reading devices for track ${trackIndex}:`,
          error,
        );
        return [];
      }
    },

    readDeviceParameters(
      trackIndex: number,
      deviceIndex: number,
    ): ParameterDescriptor[] {
      try {
        const tracks = context.application.song.tracks;
        if (!tracks || trackIndex < 0 || trackIndex >= tracks.length) {
          return [];
        }
        const track = tracks[trackIndex]!;
        const devices = track.devices;
        if (!devices || deviceIndex < 0 || deviceIndex >= devices.length) {
          return [];
        }
        const device = devices[deviceIndex]!;
        const parameters = device.parameters;
        if (!parameters || parameters.length === 0) {
          return [];
        }
        return parameters.map((param) => ({
          name: param.name,
          min: param.min,
          max: param.max,
          defaultValue: param.defaultValue,
        }));
      } catch (error) {
        console.error(
          `[SDK Adapter] Error reading device parameters for track ${trackIndex}, device ${deviceIndex}:`,
          error,
        );
        return [];
      }
    },

    readSetFilePath(): string | undefined | Promise<string | undefined> {
      // If user provided a manual override, use it directly.
      if (alsPathOverride !== undefined) {
        return alsPathOverride;
      }

      // Detect song change via fingerprint and invalidate cache if needed
      try {
        const currentFingerprint = deriveSongFingerprint(
          context.application.song.name,
          (context.application.song.tracks ?? []).map((t: { name: string }) => t.name),
        );
        if (previousFingerprint !== undefined && currentFingerprint !== previousFingerprint) {
          resolver.invalidateCache();
        }
        previousFingerprint = currentFingerprint;
      } catch (err) {
        console.warn("[SDK Adapter] Error computing song fingerprint for invalidation:", err);
      }

      // Suppress dialog by default — the dialog should only appear on explicit user request,
      // not as a side-effect of analysis or panel opening.
      const result = resolver.resolve({ suppressDialog: true });
      if (result instanceof Promise) {
        return result.then((r: ResolutionResult) => r.path);
      }
      return result.path;
    },

    setAlsPathOverride(alsPath: string): void {
      // If user provided just a filename (file picker strips full path in webviews),
      // combine it with the project root derived from audio clips.
      let fullPath = alsPath;
      if (!alsPath.includes("/") && !alsPath.includes("\\")) {
        // Bare filename — derive project root from audio clips
        try {
          const tracks = context.application.song.tracks;
          if (tracks && tracks.length > 0) {
            for (const track of tracks) {
              if (!(track instanceof AudioTrack)) continue;
              const clips = track.arrangementClips;
              if (!clips || clips.length === 0) continue;
              for (const clip of clips) {
                if (!(clip instanceof AudioClip)) continue;
                const clipPath = clip.filePath;
                if (clipPath) {
                  const root = extractProjectRoot(clipPath);
                  if (root) {
                    fullPath = path.join(root, alsPath);
                    break;
                  }
                }
              }
              if (fullPath !== alsPath) break;
            }
          }
        } catch (err) {
          console.warn("[SDK Adapter] Could not derive project root for bare .als filename:", err);
        }
      }
      alsPathOverride = fullPath;
      console.info("[SDK Adapter] .als path override set:", fullPath);
    },

    setAlsBufferOverride(buffer: Buffer | undefined): void {
      alsBufferOverride = buffer;
      if (buffer) {
        console.info("[SDK Adapter] .als buffer override set, size:", buffer.length, "bytes");
      } else {
        console.info("[SDK Adapter] .als buffer override cleared");
      }
    },

    getAlsBufferOverride(): Buffer | undefined {
      return alsBufferOverride;
    },

    readTempo(): number {
      return context.application.song.tempo;
    },

    async createCuePoint(time: number): Promise<CuePointHandle> {
      const cuePoint = await context.application.song.createCuePoint(time);
      return cuePoint as unknown as CuePointHandle;
    },

    async deleteCuePoint(cuePoint: CuePointHandle): Promise<void> {
      await context.application.song.deleteCuePoint(cuePoint as never);
    },

    readSongDuration(): number {
      const tracks = context.application.song.tracks;
      if (!tracks || tracks.length === 0) {
        return 0;
      }
      let maxEnd = 0;
      for (const track of tracks) {
        const clips = track.arrangementClips;
        if (!clips || clips.length === 0) continue;
        for (const clip of clips) {
          if (clip.endTime > maxEnd) {
            maxEnd = clip.endTime;
          }
        }
      }
      return maxEnd;
    },

    readAllClips(): { startTime: number; endTime: number; muted: boolean; trackIndex: number }[] {
      const tracks = context.application.song.tracks;
      if (!tracks || tracks.length === 0) {
        return [];
      }
      const result: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]!;
        const clips = track.arrangementClips;
        if (!clips || clips.length === 0) continue;
        for (const clip of clips) {
          result.push({
            startTime: clip.startTime,
            endTime: clip.endTime,
            muted: clip.muted,
            trackIndex: i,
          });
        }
      }
      return result;
    },

    getSongFingerprint(): string {
      const song = context.application.song;
      const trackNames = (song.tracks ?? []).map((t: { name: string }) => t.name);
      return deriveSongFingerprint(song.name, trackNames);
    },

    readAudioClips(trackIndex: number): AudioClipData[] {
      try {
        // Guard against invalid indices
        if (
          typeof trackIndex !== "number" ||
          !Number.isFinite(trackIndex) ||
          !Number.isInteger(trackIndex) ||
          trackIndex < 0
        ) {
          return [];
        }

        const tracks = context.application.song.tracks;
        if (!tracks || trackIndex >= tracks.length) {
          return [];
        }

        const track = tracks[trackIndex]!;

        // Guard against MIDI tracks
        if (!(track instanceof AudioTrack)) {
          return [];
        }

        const clips = track.arrangementClips;
        if (!clips || clips.length === 0) {
          return [];
        }

        // Map SDK AudioClip objects to AudioClipData DTOs
        const result: AudioClipData[] = clips
          .filter((clip): clip is AudioClip => clip instanceof AudioClip)
          .map((clip) => {
            const warpMarkers: WarpMarkerData[] = (clip.warpMarkers ?? [])
              .map((wm) => ({
                sampleTime: wm.sampleTime,
                beatTime: wm.beatTime,
              }))
              .sort((a, b) => a.beatTime - b.beatTime);

            return {
              startTime: clip.startTime,
              endTime: clip.endTime,
              muted: clip.muted,
              filePath: clip.filePath,
              warping: clip.warping,
              warpMarkers,
            };
          });

        // Return clips ordered by ascending startTime
        return result.sort((a, b) => a.startTime - b.startTime);
      } catch (error) {
        console.error(
          `[SDK Adapter] Error reading audio clips for track ${trackIndex}:`,
          error,
        );
        return [];
      }
    },

    async renderAudioTrack(trackIndex: number, startBeat: number, endBeat: number): Promise<string> {
      const tracks = context.application.song.tracks;
      if (!tracks || trackIndex < 0 || trackIndex >= tracks.length) {
        throw new Error(`[SDK Adapter] renderAudioTrack: track index ${trackIndex} out of range`);
      }
      const track = tracks[trackIndex]!;
      if (!(track instanceof AudioTrack)) {
        throw new Error(`[SDK Adapter] renderAudioTrack: track ${trackIndex} ("${track.name}") is not an AudioTrack`);
      }
      return context.resources.renderPreFxAudio(track, startBeat, endBeat);
    },

    getAudioTrackIndices(): number[] {
      const tracks = context.application.song.tracks;
      if (!tracks || tracks.length === 0) {
        return [];
      }
      const indices: number[] = [];
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i] instanceof AudioTrack) {
          indices.push(i);
        }
      }
      return indices;
    },

    isTrackMuted(trackIndex: number): boolean {
      const tracks = context.application.song.tracks;
      if (!tracks || trackIndex < 0 || trackIndex >= tracks.length) {
        return false;
      }
      return tracks[trackIndex]!.mute;
    },
  };
}
