/**
 * Unit tests for the ALS path resolver orchestrator.
 *
 * Validates strategy execution order, caching behaviour, fallback logic,
 * and readability verification. All external dependencies (fs, cache module,
 * strategy module) are mocked to isolate the orchestrator logic.
 *
 * Requirements: 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 7.1, 7.2, 7.3
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  openSync: vi.fn(),
  closeSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  readSync: vi.fn(),
}));

vi.mock("./als-path-cache.js", () => ({
  readCachedPath: vi.fn(),
  writeCachedPath: vi.fn(),
  clearCachedPath: vi.fn(),
}));

vi.mock("./als-path-strategies.js", () => ({
  extractProjectRoot: vi.fn(),
  selectMostRecentAlsFile: vi.fn(),
  generateLogCandidates: vi.fn(),
  parseLogForAlsPath: vi.fn(),
  normalizePath: vi.fn((p: string) => p),
}));

import { openSync, closeSync, readdirSync, statSync, readSync } from "fs";
import {
  readCachedPath,
  writeCachedPath,
  clearCachedPath,
} from "./als-path-cache.js";
import {
  extractProjectRoot,
  selectMostRecentAlsFile,
  generateLogCandidates,
  parseLogForAlsPath,
  normalizePath,
} from "./als-path-strategies.js";
import {
  createAlsPathResolver,
  type PathResolverConfig,
  type ResolutionResult,
} from "./als-path-resolver.js";

// ─── Helpers ───────────────────────────────────────────────────────────

const mockedOpenSync = vi.mocked(openSync);
const mockedCloseSync = vi.mocked(closeSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedStatSync = vi.mocked(statSync);
const mockedReadSync = vi.mocked(readSync);
const mockedReadCachedPath = vi.mocked(readCachedPath);
const mockedWriteCachedPath = vi.mocked(writeCachedPath);
const mockedClearCachedPath = vi.mocked(clearCachedPath);
const mockedExtractProjectRoot = vi.mocked(extractProjectRoot);
const mockedSelectMostRecentAlsFile = vi.mocked(selectMostRecentAlsFile);
const mockedGenerateLogCandidates = vi.mocked(generateLogCandidates);
const mockedParseLogForAlsPath = vi.mocked(parseLogForAlsPath);
const mockedNormalizePath = vi.mocked(normalizePath);

function buildConfig(overrides: Partial<PathResolverConfig> = {}): PathResolverConfig {
  return {
    storageDirectory: "/storage",
    getAudioClipPaths: vi.fn(() => []),
    showFileDialog: vi.fn(async () => undefined),
    getSongFingerprint: vi.fn(() => "fingerprint-abc"),
    ...overrides,
  };
}

/**
 * Make openSync succeed for a specific path (returns a fake fd).
 * All other calls throw EACCES.
 */
function allowReadable(...paths: string[]): void {
  mockedOpenSync.mockImplementation((filePath: unknown) => {
    if (paths.includes(filePath as string)) {
      return 42; // fake file descriptor
    }
    const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
    err.code = "EACCES";
    throw err;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: normalizePath is identity
  mockedNormalizePath.mockImplementation((p: string) => p);
});

// ─── Tests ─────────────────────────────────────────────────────────────

describe("als-path-resolver", () => {
  describe("strategy execution order", () => {
    it("executes strategies in order: cache → audioclip → log → dialog", async () => {
      const callOrder: string[] = [];

      mockedReadCachedPath.mockImplementation(() => {
        callOrder.push("cache");
        return undefined;
      });

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => {
          callOrder.push("audioclip");
          return [];
        }),
        showFileDialog: vi.fn(async () => {
          callOrder.push("dialog");
          return undefined;
        }),
      });

      mockedGenerateLogCandidates.mockImplementation(() => {
        callOrder.push("log");
        return [];
      });

      const resolver = createAlsPathResolver(config);
      await resolver.resolve();

      expect(callOrder).toEqual(["cache", "audioclip", "log", "dialog"]);
    });
  });

  describe("cache strategy", () => {
    it("returns cached path without running other strategies when file is readable", () => {
      const cachedPath = "/projects/My Track/My Track.als";
      mockedReadCachedPath.mockReturnValue(cachedPath);
      allowReadable(cachedPath);

      const config = buildConfig();
      const resolver = createAlsPathResolver(config);
      const result = resolver.resolve() as ResolutionResult;

      expect(result).toEqual({ path: cachedPath, source: "cache" });
      // Strategies should NOT have been called
      expect(config.getAudioClipPaths).not.toHaveBeenCalled();
      expect(mockedGenerateLogCandidates).not.toHaveBeenCalled();
      expect(config.showFileDialog).not.toHaveBeenCalled();
    });

    it("clears cache and re-resolves when cached file is not readable (deleted)", async () => {
      const stalePath = "/projects/Deleted/Deleted.als";
      mockedReadCachedPath.mockReturnValue(stalePath);
      // openSync throws for the stale path (file doesn't exist)
      mockedOpenSync.mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      const config = buildConfig({
        showFileDialog: vi.fn(async () => undefined),
      });
      mockedGenerateLogCandidates.mockReturnValue([]);

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      expect(mockedClearCachedPath).toHaveBeenCalledWith("/storage");
      expect(result.source).not.toBe("cache");
    });
  });

  describe("AudioClip strategy", () => {
    it("returns audioclip result and caches it when successful", () => {
      mockedReadCachedPath.mockReturnValue(undefined);

      const clipPath = "/projects/My Track/Samples/Recorded/audio.wav";
      const projectRoot = "/projects/My Track";
      const alsPath = "/projects/My Track/My Track.als";

      mockedExtractProjectRoot.mockReturnValue(projectRoot);
      mockedReaddirSync.mockReturnValue(["My Track.als"] as unknown as ReturnType<typeof readdirSync>);
      mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as unknown as ReturnType<typeof statSync>);
      mockedSelectMostRecentAlsFile.mockReturnValue(alsPath);
      allowReadable(alsPath);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => [clipPath]),
      });

      const resolver = createAlsPathResolver(config);
      const result = resolver.resolve() as ResolutionResult;

      expect(result).toEqual({ path: alsPath, source: "audioclip" });
      expect(mockedWriteCachedPath).toHaveBeenCalledWith("/storage", alsPath, "fingerprint-abc");
    });
  });

  describe("Log.txt fallback", () => {
    it("falls back to Log.txt strategy when AudioClip strategy fails", () => {
      mockedReadCachedPath.mockReturnValue(undefined);
      mockedExtractProjectRoot.mockReturnValue(undefined);

      const logPath = "/projects/Log Track/Log Track.als";
      mockedGenerateLogCandidates.mockReturnValue(["/somewhere/Log.txt"]);
      mockedStatSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as unknown as ReturnType<typeof statSync>);
      mockedReadSync.mockReturnValue(1024);
      mockedParseLogForAlsPath.mockReturnValue(logPath);
      allowReadable(logPath, "/somewhere/Log.txt");

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => []),
      });

      const resolver = createAlsPathResolver(config);
      const result = resolver.resolve() as ResolutionResult;

      expect(result).toEqual({ path: logPath, source: "log" });
      expect(mockedWriteCachedPath).toHaveBeenCalledWith("/storage", logPath, "fingerprint-abc");
    });
  });

  describe("dialog fallback", () => {
    it("falls back to dialog when both programmatic strategies fail", async () => {
      mockedReadCachedPath.mockReturnValue(undefined);
      mockedExtractProjectRoot.mockReturnValue(undefined);
      mockedGenerateLogCandidates.mockReturnValue([]);

      const dialogPath = "/user/selected/Song.als";
      allowReadable(dialogPath);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => []),
        showFileDialog: vi.fn(async () => dialogPath),
      });

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      expect(result).toEqual({ path: dialogPath, source: "dialog" });
      expect(mockedWriteCachedPath).toHaveBeenCalledWith("/storage", dialogPath, "fingerprint-abc");
    });

    it("returns undefined with source 'none' when user cancels dialog", async () => {
      mockedReadCachedPath.mockReturnValue(undefined);
      mockedExtractProjectRoot.mockReturnValue(undefined);
      mockedGenerateLogCandidates.mockReturnValue([]);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => []),
        showFileDialog: vi.fn(async () => undefined),
      });

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      expect(result).toEqual({ path: undefined, source: "none" });
    });
  });

  describe("all strategies fail", () => {
    it("returns { path: undefined, source: 'none' } when everything fails", async () => {
      mockedReadCachedPath.mockReturnValue(undefined);
      mockedExtractProjectRoot.mockReturnValue(undefined);
      mockedGenerateLogCandidates.mockReturnValue([]);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => []),
        showFileDialog: vi.fn(async () => undefined),
      });

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      expect(result).toEqual({ path: undefined, source: "none" });
    });
  });

  describe("readability verification", () => {
    it("skips to next strategy when readability check fails with permission error", async () => {
      mockedReadCachedPath.mockReturnValue(undefined);

      const clipPath = "/projects/Track/Samples/audio.wav";
      const projectRoot = "/projects/Track";
      const alsPath = "/projects/Track/Track.als";

      mockedExtractProjectRoot.mockReturnValue(projectRoot);
      mockedReaddirSync.mockReturnValue(["Track.als"] as unknown as ReturnType<typeof readdirSync>);
      mockedStatSync.mockReturnValue({ mtimeMs: 500 } as unknown as ReturnType<typeof statSync>);
      mockedSelectMostRecentAlsFile.mockReturnValue(alsPath);

      // openSync always fails with permission error — even for log candidates
      mockedOpenSync.mockImplementation(() => {
        const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      });

      mockedGenerateLogCandidates.mockReturnValue([]);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => [clipPath]),
        showFileDialog: vi.fn(async () => undefined),
      });

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      // AudioClip strategy found a path but readability check failed,
      // so it should have continued to other strategies and eventually
      // returned none from dialog cancellation
      expect(result.source).not.toBe("audioclip");
      expect(result).toEqual({ path: undefined, source: "none" });
    });

    it("calls closeSync after successful openSync", () => {
      const cachedPath = "/projects/Track/Track.als";
      mockedReadCachedPath.mockReturnValue(cachedPath);
      mockedOpenSync.mockReturnValue(99); // fake fd

      const config = buildConfig();
      const resolver = createAlsPathResolver(config);
      resolver.resolve();

      expect(mockedOpenSync).toHaveBeenCalledWith(cachedPath, "r");
      expect(mockedCloseSync).toHaveBeenCalledWith(99);
    });
  });

  describe("exception resilience", () => {
    it("catches exception from getAudioClipPaths and proceeds to next strategy", async () => {
      mockedReadCachedPath.mockReturnValue(undefined);
      mockedGenerateLogCandidates.mockReturnValue([]);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => {
          throw new Error("SDK unavailable");
        }),
        showFileDialog: vi.fn(async () => undefined),
      });

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      // Should not crash — returns none after dialog is cancelled
      expect(result).toEqual({ path: undefined, source: "none" });
    });

    it("catches exception from showFileDialog and returns none", async () => {
      mockedReadCachedPath.mockReturnValue(undefined);
      mockedExtractProjectRoot.mockReturnValue(undefined);
      mockedGenerateLogCandidates.mockReturnValue([]);

      const config = buildConfig({
        getAudioClipPaths: vi.fn(() => []),
        showFileDialog: vi.fn(async () => {
          throw new Error("Dialog crashed");
        }),
      });

      const resolver = createAlsPathResolver(config);
      const result = await resolver.resolve();

      expect(result).toEqual({ path: undefined, source: "none" });
    });
  });

  describe("invalidateCache", () => {
    it("calls clearCachedPath with the storage directory", () => {
      const config = buildConfig();
      const resolver = createAlsPathResolver(config);
      resolver.invalidateCache();

      expect(mockedClearCachedPath).toHaveBeenCalledWith("/storage");
    });

    it("does nothing when storageDirectory is undefined", () => {
      const config = buildConfig({ storageDirectory: undefined });
      const resolver = createAlsPathResolver(config);
      resolver.invalidateCache();

      expect(mockedClearCachedPath).not.toHaveBeenCalled();
    });
  });
});
