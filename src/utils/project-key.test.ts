/**
 * Unit tests for the project key derivation utility.
 *
 * Tests cover:
 * - Filesystem-safe character replacement
 * - Length constraint (≤128 characters)
 * - Determinism (same input → same output)
 * - Uniqueness (different inputs → different outputs)
 * - Edge cases (minimum input, special characters, long paths)
 */
import { describe, it, expect } from "vitest";
import { deriveProjectKey } from "./project-key.js";

describe("deriveProjectKey", () => {
  describe("filesystem safety", () => {
    it("replaces forward slashes with underscores", () => {
      const key = deriveProjectKey("/Users/me/project/song.als");
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("replaces backslashes with underscores", () => {
      const key = deriveProjectKey("C:\\Users\\me\\project\\song.als");
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("replaces spaces with underscores", () => {
      const key = deriveProjectKey("/Users/me/My Project/song.als");
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("replaces dots with underscores", () => {
      const key = deriveProjectKey("song.als");
      // Sanitized prefix is "song_als", plus hash suffix
      expect(key).toMatch(/^song_als_[a-f0-9]{16}$/);
    });

    it("preserves alphanumeric characters, hyphens, and underscores", () => {
      const key = deriveProjectKey("my-project_v2");
      // Sanitized prefix is "my-project_v2", plus hash suffix
      expect(key).toMatch(/^my-project_v2_[a-f0-9]{16}$/);
    });

    it("replaces colons with underscores (Windows drive letters)", () => {
      const key = deriveProjectKey("C:\\song.als");
      // Sanitized prefix is "C__song_als", plus hash suffix
      expect(key).toMatch(/^C__song_als_[a-f0-9]{16}$/);
    });
  });

  describe("length constraint", () => {
    it("returns a key of ≤128 characters for short-enough paths", () => {
      const path = "a".repeat(100);
      const key = deriveProjectKey(path);
      // 100 chars sanitized + "_" + 16-char hash = 117 chars, fits in 128
      expect(key.length).toBeLessThanOrEqual(128);
      expect(key).toMatch(/^a{100}_[a-f0-9]{16}$/);
    });

    it("truncates and appends hash when sanitized path exceeds 128 characters", () => {
      const path = "a".repeat(200);
      const key = deriveProjectKey(path);
      expect(key.length).toBe(128);
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("always produces keys of at most 128 characters for very long paths", () => {
      const path = "/Users/very-long-username/Documents/Ableton/Projects/" +
        "My Super Long Project Name That Goes On And On/" +
        "Subfolders/More/Even More/song-final-v2-really-final.als";
      const key = deriveProjectKey(path);
      expect(key.length).toBeLessThanOrEqual(128);
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe("determinism", () => {
    it("produces the same key for the same input", () => {
      const path = "/Users/me/project/song.als";
      const key1 = deriveProjectKey(path);
      const key2 = deriveProjectKey(path);
      expect(key1).toBe(key2);
    });

    it("produces the same key on repeated calls with long paths", () => {
      const path = "x".repeat(300);
      const key1 = deriveProjectKey(path);
      const key2 = deriveProjectKey(path);
      expect(key1).toBe(key2);
    });
  });

  describe("uniqueness", () => {
    it("produces different keys for different short paths", () => {
      const key1 = deriveProjectKey("/project-a/song.als");
      const key2 = deriveProjectKey("/project-b/song.als");
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for paths that differ only in characters replaced by underscore", () => {
      // These two paths sanitize to different strings since the chars differ
      const key1 = deriveProjectKey("/Users/a/song.als");
      const key2 = deriveProjectKey("/Users/b/song.als");
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for long paths that share a common prefix", () => {
      const prefix = "a".repeat(200);
      const key1 = deriveProjectKey(prefix + "-path-one");
      const key2 = deriveProjectKey(prefix + "-path-two");
      expect(key1).not.toBe(key2);
    });
  });

  describe("edge cases", () => {
    it("throws for an empty string", () => {
      expect(() => deriveProjectKey("")).toThrow("setFilePath must not be empty");
    });

    it("handles a single character path", () => {
      const key = deriveProjectKey("a");
      // "a" + hash suffix
      expect(key).toMatch(/^a_[a-f0-9]{16}$/);
    });

    it("handles a path that is entirely special characters", () => {
      const key = deriveProjectKey("///");
      // Sanitized to "___" + hash suffix
      expect(key).toMatch(/^____[a-f0-9]{16}$/);
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("handles unicode characters by replacing them", () => {
      const key = deriveProjectKey("/Users/名前/プロジェクト/song.als");
      expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });
});
