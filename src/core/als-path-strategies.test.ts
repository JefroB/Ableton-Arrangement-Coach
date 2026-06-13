/**
 * Unit tests for ALS Path Strategies.
 *
 * Validates Requirements 1.1, 1.4, 1.6, 2.2, 2.3, 2.4, 6.1, 6.3, 6.4
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  extractProjectRoot,
  selectMostRecentAlsFile,
  generateLogCandidates,
  parseLogForAlsPath,
  normalizePath,
  deriveSongFingerprint,
} from "./als-path-strategies.js";

// ─── extractProjectRoot ────────────────────────────────────────────────

describe("extractProjectRoot", () => {
  it("extracts root from a forward-slash path", () => {
    const result = extractProjectRoot("/Users/me/Music/MyProject/Samples/Recorded/audio.wav");
    expect(result).toBe("/Users/me/Music/MyProject");
  });

  it("extracts root from a backslash path", () => {
    const result = extractProjectRoot("D:\\Music\\MyProject\\Samples\\Recorded\\audio.wav");
    expect(result).toBe("D:\\Music\\MyProject");
  });

  it("extracts root from a mixed-separator path", () => {
    const result = extractProjectRoot("D:\\Music/MyProject\\Samples/Imported/clip.aif");
    expect(result).toBe("D:\\Music/MyProject");
  });

  it("returns the root before the LAST occurrence of Samples", () => {
    // Two "Samples" segments — should use the last one
    const result = extractProjectRoot("/Music/Samples/SubProject/Samples/audio.wav");
    expect(result).toBe("/Music/Samples/SubProject");
  });

  it("returns undefined when path does not contain 'Samples'", () => {
    const result = extractProjectRoot("/Users/me/Music/MyProject/audio.wav");
    expect(result).toBeUndefined();
  });

  it("returns undefined when 'Samples' is at position 0 (no preceding content)", () => {
    // Path starts with /Samples or \Samples — root would be empty string
    const result = extractProjectRoot("/Samples/audio.wav");
    expect(result).toBeUndefined();
  });

  it("handles 'Samples' preceded by backslash at position 0", () => {
    const result = extractProjectRoot("\\Samples\\audio.wav");
    expect(result).toBeUndefined();
  });
});

// ─── selectMostRecentAlsFile ───────────────────────────────────────────

describe("selectMostRecentAlsFile", () => {
  it("returns the single file when only one is provided", () => {
    const files = [{ name: "track.als", mtimeMs: 1000 }];
    const result = selectMostRecentAlsFile(files, "/projects/my-track");
    expect(result).toBe(path.join("/projects/my-track", "track.als"));
  });

  it("returns the most recently modified file from multiple files", () => {
    const files = [
      { name: "old.als", mtimeMs: 100 },
      { name: "newest.als", mtimeMs: 300 },
      { name: "middle.als", mtimeMs: 200 },
    ];
    const result = selectMostRecentAlsFile(files, "/projects");
    expect(result).toBe(path.join("/projects", "newest.als"));
  });

  it("returns the first file encountered when there is a tie in mtimeMs", () => {
    const files = [
      { name: "alpha.als", mtimeMs: 500 },
      { name: "beta.als", mtimeMs: 500 },
    ];
    const result = selectMostRecentAlsFile(files, "/projects");
    // With equal mtimeMs, the first in the array wins (> not >=)
    expect(result).toBe(path.join("/projects", "alpha.als"));
  });

  it("throws when given an empty array", () => {
    expect(() => selectMostRecentAlsFile([], "/projects")).toThrow("files array must not be empty");
  });
});

// ─── generateLogCandidates ─────────────────────────────────────────────

describe("generateLogCandidates", () => {
  it("generates candidates for a shallow directory", () => {
    const candidates = generateLogCandidates("/a/b", 2);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toBe(path.join(path.resolve("/a/b"), "Log.txt"));
    expect(candidates[1]).toBe(path.join(path.resolve("/a"), "Log.txt"));
  });

  it("generates candidates for a deep directory up to maxLevels", () => {
    const candidates = generateLogCandidates("/a/b/c/d/e/f", 3);
    expect(candidates).toHaveLength(3);
    // First candidate is the start directory itself
    expect(candidates[0]).toBe(path.join(path.resolve("/a/b/c/d/e/f"), "Log.txt"));
    // Each subsequent is one level up
    expect(candidates[1]).toBe(path.join(path.resolve("/a/b/c/d/e"), "Log.txt"));
    expect(candidates[2]).toBe(path.join(path.resolve("/a/b/c/d"), "Log.txt"));
  });

  it("stops early when reaching the filesystem root", () => {
    // Use a path that is only 1 level deep — can only produce 2 candidates (dir + root)
    const root = path.parse(path.resolve("/")).root;
    const shallow = path.join(root, "onlychild");
    const candidates = generateLogCandidates(shallow, 10);
    // Should stop at root (2 levels: /onlychild and /)
    expect(candidates.length).toBeLessThanOrEqual(3);
    // Last candidate should be at the filesystem root
    const last = candidates[candidates.length - 1]!;
    expect(last).toBe(path.join(root, "Log.txt"));
  });

  it("returns at most maxLevels candidates", () => {
    const candidates = generateLogCandidates("/a/b/c/d/e/f/g/h/i/j", 5);
    expect(candidates).toHaveLength(5);
  });
});

// ─── parseLogForAlsPath ────────────────────────────────────────────────

describe("parseLogForAlsPath", () => {
  it("extracts path from a single matching line", () => {
    const log = `Some noise\nLoading document "C:\\Music\\MyTrack.als"\nMore noise\n`;
    expect(parseLogForAlsPath(log)).toBe("C:\\Music\\MyTrack.als");
  });

  it("returns the last matching path when multiple matches exist", () => {
    const log = [
      `Loading document "/first/song.als"`,
      `Some info line`,
      `Loading document "/second/song.als"`,
      `Loading document "/third/latest.als"`,
    ].join("\n");
    expect(parseLogForAlsPath(log)).toBe("/third/latest.als");
  });

  it("skips entries containing DefaultLiveSet.als", () => {
    const log = [
      `Loading document "/good/track.als"`,
      `Loading document "/Users/me/DefaultLiveSet.als"`,
    ].join("\n");
    // Last non-excluded match is the first one
    expect(parseLogForAlsPath(log)).toBe("/good/track.als");
  });

  it("skips entries containing Templates", () => {
    const log = [
      `Loading document "/good/track.als"`,
      `Loading document "/Library/Templates/Empty.als"`,
    ].join("\n");
    expect(parseLogForAlsPath(log)).toBe("/good/track.als");
  });

  it("returns undefined when all matches are excluded", () => {
    const log = [
      `Loading document "/Users/me/DefaultLiveSet.als"`,
      `Loading document "/Library/Templates/Starter.als"`,
    ].join("\n");
    expect(parseLogForAlsPath(log)).toBeUndefined();
  });

  it("returns undefined for empty content", () => {
    expect(parseLogForAlsPath("")).toBeUndefined();
  });

  it("returns undefined when no Loading document lines exist", () => {
    const log = "Random log output\nAnother line\nNo loading here\n";
    expect(parseLogForAlsPath(log)).toBeUndefined();
  });
});

// ─── normalizePath ─────────────────────────────────────────────────────

describe("normalizePath", () => {
  it("converts all separators to the platform separator", () => {
    const input = "C:/Users/me\\Music/track.als";
    const result = normalizePath(input);
    // All separators should be path.sep
    const expected = `C:${path.sep}Users${path.sep}me${path.sep}Music${path.sep}track.als`;
    expect(result).toBe(expected);
  });

  it("is idempotent — normalizing twice produces the same result", () => {
    const input = "D:/Projects\\My Track/Samples\\audio.wav";
    expect(normalizePath(normalizePath(input))).toBe(normalizePath(input));
  });

  it("preserves paths that already use the platform separator", () => {
    const native = path.join("Users", "me", "Music", "track.als");
    expect(normalizePath(native)).toBe(native);
  });
});

// ─── deriveSongFingerprint ─────────────────────────────────────────────

describe("deriveSongFingerprint", () => {
  it("produces a deterministic 16-character hex string", () => {
    const fp1 = deriveSongFingerprint("My Track", ["Drums", "Bass", "Synth"]);
    const fp2 = deriveSongFingerprint("My Track", ["Drums", "Bass", "Synth"]);
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when the song name changes", () => {
    const fp1 = deriveSongFingerprint("Song A", ["Drums", "Bass"]);
    const fp2 = deriveSongFingerprint("Song B", ["Drums", "Bass"]);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when track names change", () => {
    const fp1 = deriveSongFingerprint("My Track", ["Drums", "Bass", "Synth"]);
    const fp2 = deriveSongFingerprint("My Track", ["Drums", "Bass", "Lead"]);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when track order changes", () => {
    const fp1 = deriveSongFingerprint("My Track", ["Drums", "Bass"]);
    const fp2 = deriveSongFingerprint("My Track", ["Bass", "Drums"]);
    expect(fp1).not.toBe(fp2);
  });

  it("only uses the first 10 track names", () => {
    const tracks12 = Array.from({ length: 12 }, (_, i) => `Track ${i}`);
    const tracks12Modified = [...tracks12];
    tracks12Modified[11] = "Changed Track 11"; // Change track beyond first 10

    const fp1 = deriveSongFingerprint("Song", tracks12);
    const fp2 = deriveSongFingerprint("Song", tracks12Modified);
    // Tracks beyond the 10th should not affect the fingerprint
    expect(fp1).toBe(fp2);
  });
});
