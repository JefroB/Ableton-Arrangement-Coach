/**
 * Mock SDK Adapter for testing.
 *
 * Implements the SdkAdapter interface with controllable return values.
 * Use the setter methods to configure what data the adapter returns,
 * or pass initial data to createMockSdkAdapter().
 */
import type {
  SdkAdapter,
  LocatorData,
  TrackData,
  ClipData,
  NoteData,
  DeviceData,
  ParameterDescriptor,
  CuePointHandle,
} from "../src/ableton/sdk-adapter.js";
import type { AudioClipData } from "../src/core/reference-types.js";

export interface MockSdkAdapter extends SdkAdapter {
  /** Set the locators that readLocators() will return. */
  setLocators(locators: LocatorData[]): void;

  /** Set the tracks that readTracks() will return. */
  setTracks(tracks: TrackData[]): void;

  /** Set the playhead position that readPlayheadPosition() will return. */
  setPlayheadPosition(position: number): void;

  /** Set the clips for a specific track index. */
  setArrangementClips(trackIndex: number, clips: ClipData[]): void;

  /** Set the notes for a specific track/clip index pair. */
  setMidiNotes(trackIndex: number, clipIndex: number, notes: NoteData[]): void;

  /** Set the devices for a specific track index. */
  setDevices(trackIndex: number, devices: DeviceData[]): void;

  /** Set the device parameters for a specific track/device index pair. */
  setDeviceParameters(
    trackIndex: number,
    deviceIndex: number,
    parameters: ParameterDescriptor[],
  ): void;

  /** Set the Set file path that readSetFilePath() will return. */
  setSetFilePath(filePath: string | undefined): void;

  /** Set the audio clips for a specific track index. */
  setAudioClips(trackIndex: number, clips: AudioClipData[]): void;

  /** Set the tempo that readTempo() will return. */
  setTempo(tempo: number): void;

  /** Set audio track indices for getAudioTrackIndices(). */
  setAudioTrackIndices(indices: number[]): void;

  /** Set muted state for a track by index. */
  setTrackMuted(trackIndex: number, muted: boolean): void;

  /** Set the render result for renderAudioTrack(). */
  setRenderResult(wavPath: string): void;

  /** Set the song duration that readSongDuration() will return. */
  setSongDuration(duration: number): void;

  /** Set the all-clips data that readAllClips() will return. */
  setAllClips(clips: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[]): void;
}

export interface MockSdkAdapterOptions {
  locators?: LocatorData[];
  tracks?: TrackData[];
  playheadPosition?: number;
  arrangementClips?: Map<number, ClipData[]>;
  midiNotes?: Map<string, NoteData[]>;
  devices?: Map<number, DeviceData[]>;
  deviceParameters?: Map<string, ParameterDescriptor[]>;
  setFilePath?: string | undefined;
  audioClips?: Map<number, AudioClipData[]>;
  tempo?: number;
}

/**
 * Create a mock SDK adapter with optional initial data.
 * All values default to empty/zero if not provided.
 */
export function createMockSdkAdapter(
  options: MockSdkAdapterOptions = {},
): MockSdkAdapter {
  let locators: LocatorData[] = options.locators ?? [];
  let tracks: TrackData[] = options.tracks ?? [];
  let playheadPosition: number = options.playheadPosition ?? 0;
  let setFilePath: string | undefined = options.setFilePath;
  let tempo: number = options.tempo ?? 120;
  const arrangementClips: Map<number, ClipData[]> =
    options.arrangementClips ?? new Map();
  const midiNotes: Map<string, NoteData[]> = options.midiNotes ?? new Map();
  const devices: Map<number, DeviceData[]> = options.devices ?? new Map();
  const deviceParameters: Map<string, ParameterDescriptor[]> =
    options.deviceParameters ?? new Map();
  const audioClips: Map<number, AudioClipData[]> =
    options.audioClips ?? new Map();
  let audioTrackIndices: number[] = [];
  const mutedTracks: Map<number, boolean> = new Map();
  let renderResultPath = "/tmp/mock-render.wav";
  let songDuration = 0;
  let allClips: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[] = [];
  const createdCuePoints: CuePointHandle[] = [];

  return {
    readLocators(): LocatorData[] {
      return locators;
    },

    readTracks(): TrackData[] {
      return tracks;
    },

    readPlayheadPosition(): number {
      return playheadPosition;
    },

    readArrangementClips(trackIndex: number): ClipData[] {
      return arrangementClips.get(trackIndex) ?? [];
    },

    readMidiNotes(trackIndex: number, clipIndex: number): NoteData[] {
      return midiNotes.get(`${trackIndex}:${clipIndex}`) ?? [];
    },

    readDevices(trackIndex: number): DeviceData[] {
      return devices.get(trackIndex) ?? [];
    },

    readDeviceParameters(
      trackIndex: number,
      deviceIndex: number,
    ): ParameterDescriptor[] {
      return deviceParameters.get(`${trackIndex}:${deviceIndex}`) ?? [];
    },

    readSetFilePath(): string | undefined {
      return setFilePath;
    },

    setAlsPathOverride(_path: string): void {
      // No-op in mock
    },

    setAlsBufferOverride(_buffer: Buffer | undefined): void {
      // No-op in mock
    },

    getAlsBufferOverride(): Buffer | undefined {
      return undefined;
    },

    readAudioClips(trackIndex: number): AudioClipData[] {
      return audioClips.get(trackIndex) ?? [];
    },

    readTempo(): number {
      return tempo;
    },

    async createCuePoint(time: number): Promise<CuePointHandle> {
      let cuePointName = "";
      const cp: CuePointHandle = {
        get name() { return cuePointName; },
        time,
        setName(value: string) { cuePointName = value; },
      };
      createdCuePoints.push(cp);
      return cp;
    },

    async deleteCuePoint(_cuePoint: CuePointHandle): Promise<void> {
      // No-op in mock
    },

    readSongDuration(): number {
      return songDuration;
    },

    readAllClips(): { startTime: number; endTime: number; muted: boolean; trackIndex: number }[] {
      return allClips;
    },

    setLocators(newLocators: LocatorData[]): void {
      locators = newLocators;
    },

    setTracks(newTracks: TrackData[]): void {
      tracks = newTracks;
    },

    setPlayheadPosition(position: number): void {
      playheadPosition = position;
    },

    setArrangementClips(trackIndex: number, clips: ClipData[]): void {
      arrangementClips.set(trackIndex, clips);
    },

    setMidiNotes(
      trackIndex: number,
      clipIndex: number,
      notes: NoteData[],
    ): void {
      midiNotes.set(`${trackIndex}:${clipIndex}`, notes);
    },

    setDevices(trackIndex: number, deviceList: DeviceData[]): void {
      devices.set(trackIndex, deviceList);
    },

    setDeviceParameters(
      trackIndex: number,
      deviceIndex: number,
      params: ParameterDescriptor[],
    ): void {
      deviceParameters.set(`${trackIndex}:${deviceIndex}`, params);
    },

    setSetFilePath(filePath: string | undefined): void {
      setFilePath = filePath;
    },

    setAudioClips(trackIndex: number, clips: AudioClipData[]): void {
      audioClips.set(trackIndex, clips);
    },

    setTempo(newTempo: number): void {
      tempo = newTempo;
    },

    async renderAudioTrack(_trackIndex: number, _startBeat: number, _endBeat: number): Promise<string> {
      return renderResultPath;
    },

    getAudioTrackIndices(): number[] {
      return audioTrackIndices;
    },

    isTrackMuted(trackIndex: number): boolean {
      return mutedTracks.get(trackIndex) ?? false;
    },

    setAudioTrackIndices(indices: number[]): void {
      audioTrackIndices = indices;
    },

    setTrackMuted(trackIndex: number, muted: boolean): void {
      mutedTracks.set(trackIndex, muted);
    },

    setRenderResult(wavPath: string): void {
      renderResultPath = wavPath;
    },

    setSongDuration(duration: number): void {
      songDuration = duration;
    },

    setAllClips(clips: { startTime: number; endTime: number; muted: boolean; trackIndex: number }[]): void {
      allClips = clips;
    },
  };
}
