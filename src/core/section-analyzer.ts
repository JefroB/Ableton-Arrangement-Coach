/**
 * Section Analyzer — pure-function module computing per-section metrics.
 *
 * Computes track activity, MIDI density, and automation flags for a given
 * section time range. All functions accept plain data and return plain data
 * with no SDK calls or side effects.
 */
import type { ClipData, NoteData } from "../ableton/sdk-adapter.js";

// ─── Domain Types ──────────────────────────────────────────────────────

/** Input: all clip data organized by track. */
export interface TrackClipData {
  readonly trackName: string;
  readonly trackType: "midi" | "audio";
  readonly clips: readonly ClipData[];
}

/** Input: all note data organized by track. */
export interface TrackNoteData {
  readonly trackName: string;
  readonly notes: readonly NoteData[];
}

/** Output: analysis result for a single section. */
export interface SectionAnalysisResult {
  readonly activeTrackNames: readonly string[];
  readonly midiDensity: number; // notes per bar
  readonly hasAutomation: boolean;
}

// ─── Helper ────────────────────────────────────────────────────────────

/** Determine whether a clip overlaps a section's time range. */
function clipOverlapsSection(
  clip: ClipData,
  section: { startTime: number; endTime: number },
): boolean {
  return clip.startTime < section.endTime && clip.endTime > section.startTime;
}

// ─── Pure Functions ────────────────────────────────────────────────────

/**
 * Compute track activity for a section.
 *
 * Returns the set of track names that have at least one unmuted clip
 * overlapping the section's time range, with no duplicate names.
 */
export function computeTrackActivity(
  section: { startTime: number; endTime: number },
  trackClips: readonly TrackClipData[],
): string[] {
  const activeNames = new Set<string>();

  for (const track of trackClips) {
    for (const clip of track.clips) {
      if (!clip.muted && clipOverlapsSection(clip, section)) {
        activeNames.add(track.trackName);
        break; // one match is enough for this track
      }
    }
  }

  return [...activeNames];
}

/**
 * Compute MIDI density for a section.
 *
 * Counts notes whose startTime falls within [section.startTime, section.endTime),
 * divides by section length in bars (length / 4). Returns 0 for zero-length sections.
 */
export function computeMidiDensity(
  section: { startTime: number; endTime: number },
  trackNotes: readonly TrackNoteData[],
): number {
  const sectionLength = section.endTime - section.startTime;
  if (sectionLength <= 0) {
    return 0;
  }

  const sectionLengthInBars = sectionLength / 4;

  let noteCount = 0;
  for (const track of trackNotes) {
    for (const note of track.notes) {
      if (note.startTime >= section.startTime && note.startTime < section.endTime) {
        noteCount++;
      }
    }
  }

  return noteCount / sectionLengthInBars;
}

/**
 * Compute automation flag for a section.
 *
 * Returns true if any unmuted clip overlapping the section has
 * `hasEnvelopes === true`.
 */
export function computeAutomationFlag(
  section: { startTime: number; endTime: number },
  trackClips: readonly TrackClipData[],
): boolean {
  for (const track of trackClips) {
    for (const clip of track.clips) {
      if (!clip.muted && clipOverlapsSection(clip, section) && clip.hasEnvelopes) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute velocity intensity for a section.
 *
 * Returns the arithmetic mean of all note velocities in the section divided
 * by 127, yielding a value in [0, 1]. Returns 0 if no notes fall within the
 * section's time range.
 *
 * A note is considered "in the section" if its startTime falls within
 * [section.startTime, section.endTime).
 */
export function computeVelocityIntensity(
  section: { startTime: number; endTime: number },
  trackNotes: readonly TrackNoteData[],
): number {
  let velocitySum = 0;
  let noteCount = 0;

  for (const track of trackNotes) {
    for (const note of track.notes) {
      if (note.startTime >= section.startTime && note.startTime < section.endTime) {
        velocitySum += note.velocity;
        noteCount++;
      }
    }
  }

  if (noteCount === 0) {
    return 0;
  }

  const meanVelocity = velocitySum / noteCount;
  return Math.min(1, Math.max(0, meanVelocity / 127));
}

/**
 * Compute pitch range for a section.
 *
 * Collects all unique pitches from notes whose startTime falls within
 * [section.startTime, section.endTime). Returns (maxPitch - minPitch) / 127.
 * Returns 0 if fewer than 2 unique pitches exist.
 * Result is always in [0, 1].
 */
export function computePitchRange(
  section: { startTime: number; endTime: number },
  trackNotes: readonly TrackNoteData[],
): number {
  const uniquePitches = new Set<number>();

  for (const track of trackNotes) {
    for (const note of track.notes) {
      if (note.startTime >= section.startTime && note.startTime < section.endTime) {
        uniquePitches.add(note.pitch);
      }
    }
  }

  if (uniquePitches.size < 2) {
    return 0;
  }

  let minPitch = 127;
  let maxPitch = 0;
  for (const pitch of uniquePitches) {
    if (pitch < minPitch) minPitch = pitch;
    if (pitch > maxPitch) maxPitch = pitch;
  }

  return (maxPitch - minPitch) / 127;
}

/**
 * Compute polyphony score for a section.
 *
 * Divides the section into beat-aligned slots (1 beat = 1 slot, from
 * section.startTime to section.endTime). For each slot [slotStart, slotEnd),
 * counts the number of notes that are "sounding" — a note is sounding if its
 * [startTime, startTime + duration) overlaps the slot interval.
 *
 * Returns the average of the max overlapping note count across all slots.
 * Returns 0 if no notes exist in the section or the section has zero length.
 */
export function computePolyphonyScore(
  section: { startTime: number; endTime: number },
  trackNotes: readonly TrackNoteData[],
): number {
  // Determine effective section end — cap infinite sections to the last sounding note.
  let effectiveEnd = section.endTime;
  if (!Number.isFinite(effectiveEnd)) {
    // Find the latest note end within this section
    let latestEnd = section.startTime;
    for (const track of trackNotes) {
      for (const note of track.notes) {
        if (note.startTime >= section.startTime) {
          const noteEnd = note.startTime + note.duration;
          if (noteEnd > latestEnd) {
            latestEnd = noteEnd;
          }
        }
      }
    }
    // If no notes found, return 0 (nothing to measure polyphony on)
    if (latestEnd <= section.startTime) {
      return 0;
    }
    effectiveEnd = latestEnd;
  }

  const sectionLength = effectiveEnd - section.startTime;
  if (sectionLength <= 0) {
    return 0;
  }

  // Collect all notes that could sound within this section
  // A note sounds in a slot if [note.startTime, note.startTime + note.duration) overlaps [slotStart, slotEnd)
  // Pre-filter: only notes whose sounding range overlaps the section at all
  const relevantNotes: { startTime: number; endTime: number }[] = [];
  for (const track of trackNotes) {
    for (const note of track.notes) {
      const noteEnd = note.startTime + note.duration;
      // Note overlaps section if it starts before section ends AND ends after section starts
      if (note.startTime < effectiveEnd && noteEnd > section.startTime) {
        relevantNotes.push({ startTime: note.startTime, endTime: noteEnd });
      }
    }
  }

  if (relevantNotes.length === 0) {
    return 0;
  }

  // Divide section into beat-aligned slots of 1 beat width
  const slotCount = Math.ceil(sectionLength);
  let overlapSum = 0;

  for (let i = 0; i < slotCount; i++) {
    const slotStart = section.startTime + i;
    const slotEnd = Math.min(section.startTime + i + 1, effectiveEnd);

    // Count notes sounding in this slot
    let count = 0;
    for (const note of relevantNotes) {
      // Note overlaps slot if note starts before slot ends AND note ends after slot starts
      if (note.startTime < slotEnd && note.endTime > slotStart) {
        count++;
      }
    }

    overlapSum += count;
  }

  return overlapSum / slotCount;
}

/**
 * Compute note-based track activity for a section.
 *
 * For MIDI tracks: a track is "active" if and only if it has at least one
 * note whose startTime falls within [section.startTime, section.endTime).
 * (Notes are already pre-filtered to exclude muted notes at the SDK adapter layer.)
 *
 * For audio tracks: a track is "active" if it has at least one unmuted clip
 * that overlaps the section's time range.
 *
 * Returns the list of active track names with no duplicates.
 */
export function computeNoteBasedTrackActivity(
  section: { startTime: number; endTime: number },
  trackClips: readonly TrackClipData[],
  trackNotes: readonly TrackNoteData[],
): string[] {
  const activeNames = new Set<string>();

  // Build a lookup of track names to their note data
  const notesByTrack = new Map<string, readonly NoteData[]>();
  for (const track of trackNotes) {
    notesByTrack.set(track.trackName, track.notes);
  }

  for (const track of trackClips) {
    if (track.trackType === "midi") {
      // MIDI track: active iff it has at least one note in range
      const notes = notesByTrack.get(track.trackName);
      if (notes) {
        for (const note of notes) {
          if (note.startTime >= section.startTime && note.startTime < section.endTime) {
            activeNames.add(track.trackName);
            break;
          }
        }
      }
    } else {
      // Audio track: active based on unmuted clip overlap
      for (const clip of track.clips) {
        if (!clip.muted && clipOverlapsSection(clip, section)) {
          activeNames.add(track.trackName);
          break;
        }
      }
    }
  }

  return [...activeNames];
}

/**
 * Combined analysis for a section.
 *
 * Runs all three computations (track activity, MIDI density, automation)
 * and returns the unified result.
 */
export function analyzeSection(
  section: { startTime: number; endTime: number },
  trackClips: readonly TrackClipData[],
  trackNotes: readonly TrackNoteData[],
): SectionAnalysisResult {
  return {
    activeTrackNames: computeTrackActivity(section, trackClips),
    midiDensity: computeMidiDensity(section, trackNotes),
    hasAutomation: computeAutomationFlag(section, trackClips),
  };
}
