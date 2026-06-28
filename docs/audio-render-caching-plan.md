# Audio Render Caching Plan

## Problem

`renderPreFxAudio` triggers Ableton's offline render dialog — one per track, blocking the UI each time. With 4 audio tracks, clicking Analyze shows 4 separate render dialogs with gaps between them. There's no progress indication and no way to know when it's done. Re-analyzing (genre change, refresh) re-renders everything even if the audio hasn't changed.

Concurrent renders freeze Live completely. Sequential renders work but produce multiple disruptive dialogs.

## Current Flow

```
User clicks Analyze
  → runAnalysis({ includeAudioAnalysis: true })
    → For each audio track (sequential, batch size 1):
      → renderPreFxAudio(track, startBeat, endBeat)  ← Ableton shows render dialog
      → WAV written to SDK temp directory
      → readFile(wavPath) → decodeAudio → mixToMono
      → For each section: slice buffer → spectral/RMS/transient analysis
      → Cache analysis RESULTS in AudioLruCache (in-memory, per section)
      → DELETE the WAV file (cleanupWavFile)
    → Dispatch UPDATE_AUDIO_CONTENT_ANALYSIS
```

The WAV files are ephemeral — rendered, analyzed, then deleted. The in-memory LRU cache only stores analysis results, not the raw audio. On next Analyze click, everything re-renders from scratch.

## Proposed Flow

```
User clicks Analyze
  → runAnalysis({ includeAudioAnalysis: true })
    → For each audio track:
      → Compute track content fingerprint
      → Check disk cache: storageDirectory/audio-cache/{fingerprint}.wav
      → IF cached WAV exists and is valid:
        → Read from disk (no render dialog)
      → ELSE:
        → renderPreFxAudio(track, startBeat, endBeat)  ← render dialog
        → Copy WAV to cache location
      → Decode + analyze as before
      → Do NOT delete the cached WAV
    → Dispatch UPDATE_AUDIO_CONTENT_ANALYSIS
```

## Cache Location

```
{storageDirectory}/audio-cache/
├── {fingerprint-track-1}.wav
├── {fingerprint-track-2}.wav
├── {fingerprint-track-3}.wav
└── cache-manifest.json
```

`storageDirectory` = `extensionContext.environment.storageDirectory` (already available, used by notes-store).

## Fingerprinting / Invalidation

The key question: how do we know when a cached WAV is stale?

### Option A: Clip-based fingerprint (recommended)

Hash of: track name + clip names + clip start/end positions + clip lengths.

Available from the SDK without rendering:
- `song.tracks[i].name`
- `song.tracks[i].clipSlots` or arrangement clips (positions, lengths, names)

If any clip is added, removed, moved, or renamed, the fingerprint changes → cache miss → re-render.

Limitation: doesn't detect changes WITHIN a clip (e.g., re-recording audio in place). Acceptable tradeoff — user can manually invalidate.

### Option B: Song fingerprint + track name (simple but weak)

Key: `${songFingerprint}_${trackName}`

Pros: trivial to compute.
Cons: renames invalidate unnecessarily; doesn't detect clip changes; same track name across projects collides.

### Option C: File mtime of the .als (coarse)

If the .als file's mtime changed since last render, invalidate all cached WAVs.

Pros: catches any save. Simple.
Cons: invalidates ALL tracks even if only one changed. Still requires the .als path (which we already resolve).

### Recommended: Option A with Option C as fallback

- Primary: clip-based fingerprint per track
- Fallback: if .als mtime changed AND clip fingerprint can't be computed, re-render that track
- Manual: "Re-render Audio" button always forces a fresh render (clears cache for current project)

## Cache Manifest

```json
{
  "version": 1,
  "project": "June 16th Synthwave",
  "entries": {
    "fx GROUP": {
      "fingerprint": "abc123...",
      "wavFile": "abc123.wav",
      "renderedAt": "2026-06-14T20:06:18Z",
      "startBeat": 0,
      "endBeat": 512
    }
  }
}
```

## UX Changes

1. **First Analyze** on a project: renders all audio tracks (dialogs appear). Cached for future use.
2. **Subsequent Analyze** clicks: reads cached WAVs from disk. No render dialogs. Instant.
3. **"Re-render Audio" button** (new): forces fresh renders, updates cache. For when user changed audio content.
4. **Cache size management**: limit total cache to ~500MB. Evict oldest project caches when exceeded.

## Edge Cases

- **Project switch**: different project → different cache directory (keyed by project fingerprint or song name)
- **Track renamed**: fingerprint includes track name → old cache entry becomes orphaned, new one created on next render
- **Track deleted**: orphaned cache entry cleaned up on next manifest write
- **Ableton crashes mid-render**: partial WAV on disk → validate file size / header before using cached WAV
- **storageDirectory unavailable**: fall back to current behavior (render every time, no caching)

## Implementation Steps

1. Add `AudioRenderCache` class (read/write WAVs + manifest to storageDirectory)
2. Compute clip-based fingerprint in `sdk-adapter.ts` (new method: `getAudioTrackFingerprint(trackIndex)`)
3. In `AudioAnalyzer.renderTrack()`: check cache before calling `renderPreFxAudio`
4. Remove `cleanupWavFile` for cached renders (only clean up on explicit invalidation)
5. Add "Re-render Audio" button to webview + message handler
6. Add cache eviction logic (max size, per-project cleanup on switch)

## Dependencies

- `extensionContext.environment.storageDirectory` (already used by notes-store)
- SDK track/clip data for fingerprinting (already read in `readTracks`)
- No new SDK APIs needed

## Risk

Low. The render behavior is unchanged — we're just skipping it when a valid cache exists. Worst case on cache corruption: re-render (same as today).
