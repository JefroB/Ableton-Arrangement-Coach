import { describe, it, expect, afterEach } from "vitest";
import { readCachedPath, writeCachedPath, clearCachedPath } from "./als-path-cache.js";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "fs";
import path from "path";
import os from "os";

describe("als-path-cache", () => {
  let tmpDir: string;

  function createTmpDir(): string {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "als-cache-test-"));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("readCachedPath", () => {
    it("returns the cached path when fingerprint matches", () => {
      const dir = createTmpDir();
      const fingerprint = "abc123";
      const alsPath = "D:\\Music\\Projects\\Track\\Track.als";

      writeCachedPath(dir, alsPath, fingerprint);

      const result = readCachedPath(dir, fingerprint);
      expect(result).toBe(alsPath);
    });

    it("returns undefined when fingerprint does not match", () => {
      const dir = createTmpDir();
      const alsPath = "D:\\Music\\Projects\\Track\\Track.als";

      writeCachedPath(dir, alsPath, "fingerprint-A");

      const result = readCachedPath(dir, "fingerprint-B");
      expect(result).toBeUndefined();
    });

    it("returns undefined when cache file contains corrupt JSON", () => {
      const dir = createTmpDir();
      const cacheFile = path.join(dir, "als-path-cache.json");
      writeFileSync(cacheFile, "not valid json {{{", "utf-8");

      const result = readCachedPath(dir, "any-fingerprint");
      expect(result).toBeUndefined();
    });

    it("returns undefined when cache file does not exist", () => {
      const dir = createTmpDir();

      const result = readCachedPath(dir, "any-fingerprint");
      expect(result).toBeUndefined();
    });
  });

  describe("writeCachedPath", () => {
    it("creates a valid JSON cache file with expected structure", () => {
      const dir = createTmpDir();
      const alsPath = "/Users/artist/Projects/My Song/My Song.als";
      const fingerprint = "fp-xyz";

      writeCachedPath(dir, alsPath, fingerprint);

      const cacheFile = path.join(dir, "als-path-cache.json");
      expect(existsSync(cacheFile)).toBe(true);

      const raw = readFileSync(cacheFile, "utf-8");
      const data = JSON.parse(raw);

      expect(data.version).toBe(1);
      expect(data.alsPath).toBe(alsPath);
      expect(data.songFingerprint).toBe(fingerprint);
      expect(typeof data.resolvedAt).toBe("number");
      expect(data.resolvedAt).toBeGreaterThan(0);
    });
  });

  describe("clearCachedPath", () => {
    it("removes the cache file when it exists", () => {
      const dir = createTmpDir();
      writeCachedPath(dir, "/some/path.als", "fp");

      const cacheFile = path.join(dir, "als-path-cache.json");
      expect(existsSync(cacheFile)).toBe(true);

      clearCachedPath(dir);
      expect(existsSync(cacheFile)).toBe(false);
    });

    it("does not throw when cache file does not exist", () => {
      const dir = createTmpDir();

      expect(() => clearCachedPath(dir)).not.toThrow();
    });
  });
});
