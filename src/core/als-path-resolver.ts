/**
 * ALS Path Resolver — orchestrates a multi-strategy resolution chain
 * to determine the .als file path of the currently-open Ableton Live Set.
 *
 * Resolution order:
 *   1. Cached path lookup + readability check
 *   2. AudioClip strategy (derive project root → find most recent .als)
 *   3. Log.txt strategy (walk up from storageDirectory → parse log)
 *   4. Dialog fallback (prompt user)
 *
 * Each strategy is wrapped in try/catch so that failures never propagate.
 * Successful results are cached for instant retrieval on subsequent calls.
 */
import { openSync, closeSync, readdirSync, statSync, readSync } from "fs";
import path from "node:path";

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

// ─── Types ─────────────────────────────────────────────────────────────

/** Configuration for the path resolver. */
export interface PathResolverConfig {
  /** Storage directory for cache persistence (from environment.storageDirectory). */
  readonly storageDirectory: string | undefined;
  /** Function to read audio clip file paths from the SDK. */
  readonly getAudioClipPaths: () => string[];
  /** Function to get the current song name from the SDK. */
  readonly getSongName: () => string;
  /** Function to show a file picker dialog (async). */
  readonly showFileDialog: () => Promise<string | undefined>;
  /** Current song fingerprint for cache invalidation. */
  readonly getSongFingerprint: () => string;
}

/** Result of a resolution attempt. */
export interface ResolutionResult {
  /** The resolved .als file path, or undefined if all strategies failed. */
  readonly path: string | undefined;
  /** Which strategy succeeded (for logging/diagnostics). */
  readonly source: "cache" | "audioclip" | "log" | "dialog" | "none";
}

/** Public API for the path resolver. */
export interface AlsPathResolver {
  /** Resolve the .als file path using the strategy chain. If suppressDialog is true, skips the dialog fallback. */
  resolve(options?: { suppressDialog?: boolean }): ResolutionResult | Promise<ResolutionResult>;
  /** Invalidate the cached path (e.g., on song change). */
  invalidateCache(): void;
}

// ─── Readability Check ─────────────────────────────────────────────────

/**
 * Verify that a file path is readable by attempting to open it for reading.
 * Returns true if the file can be opened and read, false on any error
 * (missing file, permission denied, sandbox restriction, etc.).
 *
 * @param filePath - The file path to verify.
 * @returns true if the file is readable, false otherwise.
 */
export function verifyReadable(filePath: string): boolean {
  try {
    const fd = openSync(filePath, "r");
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

// ─── Factory ───────────────────────────────────────────────────────────

/**
 * Create an ALS path resolver instance configured with the given dependencies.
 *
 * @param config - Configuration providing storage directory, SDK access, and dialog.
 * @returns An AlsPathResolver implementing the full resolution chain.
 */
export function createAlsPathResolver(config: PathResolverConfig): AlsPathResolver {
  /**
   * Track in-flight dialog promise so we only show one dialog at a time.
   * Subsequent calls while a dialog is open will reuse the same promise.
   */
  let pendingDialogPromise: Promise<ResolutionResult> | null = null;

  /**
   * Attempt resolution via the dialog fallback (async path).
   * Invoked only when all synchronous strategies have been exhausted.
   * Deduplicates: if a dialog is already showing, returns the same promise.
   */
  function resolveViaDialog(fingerprint: string): Promise<ResolutionResult> {
    if (pendingDialogPromise !== null) {
      return pendingDialogPromise;
    }

    pendingDialogPromise = (async () => {
      try {
        const userPath = await config.showFileDialog();
        if (userPath !== undefined) {
          const normalizedPath = normalizePath(userPath);
          if (verifyReadable(normalizedPath)) {
            if (config.storageDirectory) {
              writeCachedPath(config.storageDirectory, normalizedPath, fingerprint);
            }
            return { path: normalizedPath, source: "dialog" } as ResolutionResult;
          }
        }
      } catch (err) {
        console.warn("[ALS Resolver] Dialog fallback failed:", err);
      }

      return { path: undefined, source: "none" } as ResolutionResult;
    })().finally(() => {
      pendingDialogPromise = null;
    });

    return pendingDialogPromise;
  }

  return {
    resolve(options?: { suppressDialog?: boolean }): ResolutionResult | Promise<ResolutionResult> {
      const suppressDialog = options?.suppressDialog ?? false;
      let fingerprint: string;
      try {
        fingerprint = config.getSongFingerprint();
      } catch (err) {
        console.warn("[ALS Resolver] getSongFingerprint failed:", err);
        // Use empty fingerprint — cache won't match but resolution can proceed
        fingerprint = "";
      }

      // ── Strategy 1: Cached path lookup ──────────────────────────────
      try {
        if (config.storageDirectory) {
          const cachedPath = readCachedPath(config.storageDirectory, fingerprint);
          if (cachedPath !== undefined) {
            if (verifyReadable(cachedPath)) {
              return { path: cachedPath, source: "cache" };
            }
            // Cached file no longer accessible — clear and re-resolve
            clearCachedPath(config.storageDirectory);
          }
        }
      } catch (err) {
        console.warn("[ALS Resolver] Cache lookup failed:", err);
      }

      // ── Strategy 2: AudioClip + song name strategy ─────────────────
      // Derive project root from audio clip paths, then construct the .als
      // path directly using the song name. Avoids readdirSync which is
      // blocked by the extension host sandbox.
      try {
        const clipPaths = config.getAudioClipPaths();
        let songName = "";
        try {
          songName = config.getSongName();
        } catch (nameErr) {
          console.warn("[ALS Resolver] getSongName failed:", nameErr);
        }

        for (const clipPath of clipPaths) {
          const projectRoot = extractProjectRoot(clipPath);
          if (projectRoot === undefined) continue;

          console.info("[ALS Resolver] Project root:", projectRoot, "| Song name:", songName);

          // Strategy 2a: Try projectRoot/songName.als (most common case)
          if (songName) {
            const directPath = normalizePath(path.join(projectRoot, songName + ".als"));
            console.info("[ALS Resolver] Trying direct path:", directPath);
            if (verifyReadable(directPath)) {
              if (config.storageDirectory) {
                writeCachedPath(config.storageDirectory, directPath, fingerprint);
              }
              console.info("[ALS Resolver] Direct path SUCCESS");
              return { path: directPath, source: "audioclip" };
            }
            console.info("[ALS Resolver] Direct path not readable, trying folder name match");
          }

          // Strategy 2a-alt: The folder name often IS the song name in Ableton projects
          // (e.g., "May-31-Synthwave Project" folder → "May-31-Synthwave.als")
          const folderName = path.basename(projectRoot);
          // Ableton appends " Project" to folder name for Collect All and Save
          const folderBaseName = folderName.replace(/ Project$/, "");
          if (folderBaseName && folderBaseName !== songName) {
            const folderPath = normalizePath(path.join(projectRoot, folderBaseName + ".als"));
            console.info("[ALS Resolver] Trying folder-derived path:", folderPath);
            if (verifyReadable(folderPath)) {
              if (config.storageDirectory) {
                writeCachedPath(config.storageDirectory, folderPath, fingerprint);
              }
              console.info("[ALS Resolver] Folder-derived path SUCCESS");
              return { path: folderPath, source: "audioclip" };
            }
            console.info("[ALS Resolver] Folder-derived path not readable");
          }

          // Strategy 2b: Try directory listing as fallback (may fail in sandbox)
          try {
            const entries = readdirSync(projectRoot);
            const alsFiles = entries.filter((f) => f.endsWith(".als"));
            if (alsFiles.length === 0) continue;

            // Gather modification times for each .als file
            const filesWithStats: Array<{ name: string; mtimeMs: number }> = [];
            for (const name of alsFiles) {
              try {
                const fullPath = path.join(projectRoot, name);
                const stat = statSync(fullPath);
                filesWithStats.push({ name, mtimeMs: stat.mtimeMs });
              } catch {
                // Skip files we can't stat
              }
            }

            if (filesWithStats.length === 0) continue;

            const alsPath = normalizePath(
              selectMostRecentAlsFile(filesWithStats, projectRoot),
            );

            if (verifyReadable(alsPath)) {
              // Cache the successful result
              if (config.storageDirectory) {
                writeCachedPath(config.storageDirectory, alsPath, fingerprint);
              }
              return { path: alsPath, source: "audioclip" };
            }
          } catch (scanErr) {
            // Directory listing blocked by sandbox — continue to next strategy
            console.info("[ALS Resolver] Directory listing blocked, relying on direct path strategy");
          }

          // If we found a project root, no point checking other clip paths
          // (they'll resolve to the same project root)
          break;
        }
      } catch (err) {
        console.warn("[ALS Resolver] AudioClip strategy failed:", err);
      }

      // ── Strategy 3: Log.txt strategy ────────────────────────────────
      try {
        if (config.storageDirectory) {
          const candidates = generateLogCandidates(config.storageDirectory, 5);

          for (const candidate of candidates) {
            try {
              const stat = statSync(candidate);
              if (!stat.isFile()) continue;

              // Read the last 256 KB of the log file
              const tailSize = Math.min(stat.size, 256 * 1024);
              const buffer = Buffer.alloc(tailSize);
              const fd = openSync(candidate, "r");
              try {
                readSync(fd, buffer, 0, tailSize, stat.size - tailSize);
              } finally {
                closeSync(fd);
              }

              const tail = buffer.toString("utf-8");
              const logResult = parseLogForAlsPath(tail);

              if (logResult !== undefined) {
                const normalizedPath = normalizePath(logResult);
                if (verifyReadable(normalizedPath)) {
                  // Cache the successful result
                  writeCachedPath(config.storageDirectory, normalizedPath, fingerprint);
                  return { path: normalizedPath, source: "log" };
                }
              }
            } catch {
              // This candidate didn't work — try next
            }
          }
        }
      } catch (err) {
        console.warn("[ALS Resolver] Log.txt strategy failed:", err);
      }

      // ── Strategy 4: Dialog fallback (async) ─────────────────────────
      if (suppressDialog) {
        return { path: undefined, source: "none" };
      }
      return resolveViaDialog(fingerprint);
    },

    invalidateCache(): void {
      if (config.storageDirectory) {
        clearCachedPath(config.storageDirectory);
      }
    },
  };
}
