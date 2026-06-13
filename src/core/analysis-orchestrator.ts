/**
 * Analysis Orchestrator — coordinates the full analysis pipeline.
 *
 * Reads SDK data (clips, notes, devices) for all tracks, runs pure analysis
 * modules (Section Analyzer, Track Categorizer, Energy Scorer), and dispatches
 * the computed results to the state store. This is the only module that wires
 * SDK reads to analysis to state dispatch.
 *
 * After the main analysis pipeline completes, runs the Reference Comparison
 * pipeline: detect → extract → compare → state update → message send.
 *
 * Includes a concurrency guard to prevent duplicate analysis runs, an
 * in-memory cache to skip redundant re-computation, and DJ compatibility
 * scoring integrated at the end of the pipeline.
 */
import { statSync } from "node:fs";
import type { SdkAdapter, ClipData, NoteData, DeviceData } from "../ableton/sdk-adapter.js";
import type { Store, SectionAnalysisState } from "../state/store.js";
import type { Section } from "./section-scanner.js";
import type { BackendMessage } from "../ui/messages.js";
import type { UserSectionInput, ReferenceSection, ComparisonResult } from "./reference-types.js";
import type { GenreProfile } from "./genre-profile-types.js";
import type { DrumPadMap, ContentAnalysisResult } from "./content-analysis-types.js";
import { extractDrumPadMap, type DrumPadAdapter } from "./drum-pad-extractor.js";
import {
  analyzeSection,
  computeVelocityIntensity,
  computePolyphonyScore,
  computePitchRange,
  computeNoteBasedTrackActivity,
  type TrackClipData,
  type TrackNoteData,
} from "./section-analyzer.js";
import { categorizeTrack, type FrequencyBucket } from "./track-categorizer.js";
import { computeEnergyScores, computeAutomationRatio, type SectionScoringInput } from "./energy-scorer.js";
import { getWeightsForGenre, getThresholdsForGenre, getTransitionPreferencesForGenre, getProfile, getProfileBySubgenre } from "./genre-registry.js";
import { detectIssues } from "./issue-detector.js";
import { detectContrastGaps } from "./contrast-gap-detector.js";
import { generateAutomationSuggestions, type TransitionPoint } from "./automation-suggester.js";
import type { IssueDetectorInput } from "./issue-types.js";
import { computeTransitions } from "./transition-engine.js";
import type { GenreTransitionProfile, TransitionCategory } from "./transition-engine.js";
import { generateSectionChecklists } from "./checklist-generator.js";
import type { SectionChecklistItem } from "./notes-types.js";
import { detectReferenceTrack } from "./reference-detector.js";
import { extractReferenceSectionsFromClips } from "./reference-extractor.js";
import { computeComparison } from "./structural-comparator.js";
import { computeDjScore } from "./dj-scorer.js";
import { createAnalysisCache } from "../utils/cache.js";
import { scanParameters } from "./parameter-scanner.js";
import { parseAlsFile, parseAlsBuffer, mapAutomationToSections, type AlsAutomationData, type SectionAutomationSummary } from "./als-parser.js";
import { analyzeContent, classifyInstrumentRole } from "./content-analyzer.js";
import { analyzeSynthTracks, computeSynthEnergyContribution } from "./synth-analyzer.js";
import type { SynthAnalysisResult } from "./synth-analysis-types.js";
import type { InstrumentRole } from "./content-analysis-types.js";
import {
  filterSuggestionsWithContent,
  generatePercussionSuggestions,
  generateDiscontinuitySuggestions,
  generateVariationSuggestions,
  generateAudioVariationSuggestions,
  generateGenreAwareFrequencyBalanceSuggestions,
  generateSynthSuggestions,
} from "./content-suggestion-filter.js";
import { renderSuggestion, type RawSuggestion } from "./suggestion-renderer.js";
import { AudioAnalyzer, type AudioTrackRef } from "./audio-analyzer.js";
import type { AudioContentResults } from "./audio-content-types.js";

// ─── Interface ─────────────────────────────────────────────────────────

/** Public API for the analysis orchestrator. */
export interface AnalysisOrchestrator {
  /** Run the full analysis pipeline and dispatch results to the store. */
  runAnalysis(): void;

  /** Invalidate the analysis cache, forcing next runAnalysis() to recompute. */
  invalidateCache(): void;

  /** Handle a request_reference_scan message: re-run the reference pipeline with latest state. */
  handleReferenceScan(): void;

  /** Returns true if analysis is currently in progress. */
  isAnalyzing(): boolean;
}

/** Callback for sending messages to the webview. */
export type SendMessage = (message: BackendMessage) => void;

// ─── Factory ───────────────────────────────────────────────────────────

/**
 * Create an Analysis Orchestrator instance.
 *
 * The orchestrator coordinates the full pipeline: SDK reads → pure analysis →
 * state dispatch. On any error from the SDK adapter or analysis modules, it
 * logs the error and preserves previously computed results (no dispatch).
 *
 * After main analysis, the reference comparison pipeline runs:
 * detect → extract → compare → state update → message send.
 *
 * @param adapter - The SDK adapter for reading track/clip/note/device data.
 * @param store - The state store to dispatch UPDATE_ANALYSIS actions to.
 * @param getSections - A function returning the current ordered sections.
 * @param sendMessage - Optional callback for sending messages to the webview.
 * @returns An AnalysisOrchestrator instance.
 */
export function createAnalysisOrchestrator(
  adapter: SdkAdapter,
  store: Store,
  getSections: () => readonly Section[],
  sendMessage?: SendMessage,
): AnalysisOrchestrator {
  /** Concurrency guard: true while the main analysis pipeline is running. */
  let analysisInProgress = false;

  /** Concurrency guard: true while a reference pipeline invocation is running. */
  let referenceInProgress = false;

  /** In-memory cache to avoid redundant re-computation. */
  const cache = createAnalysisCache();

  /** .als file mtime cache: skip re-parse if file hasn't changed. */
  let alsCache: {
    filePath: string;
    mtimeMs: number;
    data: AlsAutomationData;
    sectionMap: Map<string, SectionAutomationSummary[]>;
  } | null = null;

  /**
   * Drum pad map cache: skip re-read if device structure unchanged.
   * Key: trackName, Value: { firstDeviceClassName, drumPadMap }
   */
  let drumPadMapCache = new Map<string, { firstDeviceClassName: string | null; drumPadMap: DrumPadMap | null }>();

  /** Content analysis cache key: skip recomputation when sections and track data unchanged. */
  let contentAnalysisCacheKey: string | null = null;
  /** Cached content analysis result to avoid redundant recomputation. */
  let cachedContentAnalysis: ContentAnalysisResult | null = null;

  /**
   * Compute a cache key from the current sections, tracks, and genre.
   * Returns a stringified representation of the input signature.
   */
  function computeCacheKey(sections: readonly Section[], trackNames: readonly string[], genreId: string | null): string {
    try {
      const sectionIds = sections.map((s) => s.id);
      return JSON.stringify({ sectionIds, trackNames, genreId });
    } catch {
      // On circular ref or unexpected error, return empty string (cache will miss)
      return "";
    }
  }

  /**
   * Run the reference comparison pipeline.
   *
   * Flow: detect → readAudioClips → extract → compare → state update → message send.
   * On any error: log, dispatch CLEAR_REFERENCE, send reference_cleared.
   * NEVER touches main analysis results (energy, issues, transitions).
   */
  function runReferencePipeline(): void {
    if (referenceInProgress) {
      return; // Drop duplicate requests
    }

    referenceInProgress = true;
    try {
      // Step 1: Get current track list for detection
      const tracks = adapter.readTracks();
      const trackDescriptors = tracks.map((t) => ({
        name: t.name,
        muted: false, // readTracks doesn't provide muted, tracks from SDK are visible
      }));

      // Step 2: Detect reference track
      const refIndex = detectReferenceTrack(trackDescriptors);

      if (refIndex === null) {
        // No reference track found
        store.dispatch({ type: "CLEAR_REFERENCE" });
        if (sendMessage) {
          sendMessage({ type: "reference_cleared" });
        }
        return;
      }

      // Step 3: Read audio clips from the reference track
      let clips;
      try {
        clips = adapter.readAudioClips(refIndex);
      } catch (error) {
        console.error("[Analysis Orchestrator] Error reading audio clips for reference track:", error);
        store.dispatch({ type: "CLEAR_REFERENCE" });
        if (sendMessage) {
          sendMessage({ type: "reference_cleared" });
        }
        return;
      }

      if (clips.length === 0) {
        // No audio clips on reference track (or error returned empty)
        store.dispatch({ type: "CLEAR_REFERENCE" });
        if (sendMessage) {
          sendMessage({ type: "reference_cleared" });
        }
        return;
      }

      // Step 4: Extract reference sections from clips
      let referenceSections: ReferenceSection[];
      try {
        const locators = adapter.readLocators();
        referenceSections = extractReferenceSectionsFromClips(clips, locators);
      } catch (error) {
        console.error("[Analysis Orchestrator] Error in Reference Extractor:", error);
        store.dispatch({ type: "CLEAR_REFERENCE" });
        if (sendMessage) {
          sendMessage({ type: "reference_cleared" });
        }
        return;
      }

      if (referenceSections.length === 0) {
        store.dispatch({ type: "CLEAR_REFERENCE" });
        if (sendMessage) {
          sendMessage({ type: "reference_cleared" });
        }
        return;
      }

      // Step 5: Build user section inputs with energy data
      const state = store.getState();
      const sections = state.sections;
      const userSections: UserSectionInput[] = sections.map((s) => {
        const analysis = state.sectionAnalysis.get(s.id);
        return {
          startTime: s.startTime,
          endTime: s.endTime,
          energyScore: analysis?.energyScore ?? 1,
          label: s.name,
        };
      });

      // Compute total durations
      const userTotalDuration = sections.length > 0
        ? sections[sections.length - 1]!.endTime - sections[0]!.startTime
        : 0;
      const referenceTotalDuration = referenceSections.length > 0
        ? referenceSections[referenceSections.length - 1]!.endTime - referenceSections[0]!.startTime
        : 0;

      // Resolve genre profile for suggestions
      const selectedGenreId = state.selectedGenreId;
      let genreProfile: GenreProfile | null = null;
      if (selectedGenreId !== null) {
        genreProfile = getProfile(selectedGenreId) ?? getProfileBySubgenre(selectedGenreId) ?? null;
      }

      // Step 6: Compute comparison
      let comparisonResult: ComparisonResult | null;
      try {
        comparisonResult = computeComparison(
          userSections,
          referenceSections,
          userTotalDuration,
          referenceTotalDuration,
          genreProfile,
        );
      } catch (error) {
        console.error("[Analysis Orchestrator] Error in Structural Comparator:", error);
        store.dispatch({ type: "CLEAR_REFERENCE" });
        if (sendMessage) {
          sendMessage({ type: "reference_cleared" });
        }
        return;
      }

      // Step 7: Dispatch UPDATE_REFERENCE and send message
      store.dispatch({
        type: "UPDATE_REFERENCE",
        referenceTrackIndex: refIndex,
        referenceSections: [...referenceSections],
        comparisonResult,
      });

      if (sendMessage) {
        sendMessage({
          type: "reference_updated",
          referenceTrackIndex: refIndex,
          referenceSections: [...referenceSections],
          comparisonResult,
        });
      }
    } catch (error) {
      // Catch-all for unexpected errors in the pipeline
      console.error("[Analysis Orchestrator] Unexpected error in reference pipeline:", error);
      store.dispatch({ type: "CLEAR_REFERENCE" });
      if (sendMessage) {
        sendMessage({ type: "reference_cleared" });
      }
    } finally {
      referenceInProgress = false;
    }
  }

  return {
    runAnalysis(): void {
      if (analysisInProgress) {
        return; // Drop duplicate requests while analysis is running
      }

      analysisInProgress = true;
      store.dispatch({ type: "SET_ANALYZING", analyzing: true });
      try {
        // Step 1: Read all tracks (already excludes return/master tracks).
        const tracks = adapter.readTracks();

        // Step 1b: Scan device parameters to build the parameter inventory.
        try {
          const parameterInventory = scanParameters(adapter, tracks);
          store.dispatch({ type: "UPDATE_PARAMETER_INVENTORY", parameterInventory });
        } catch (paramScanError) {
          // On failure, dispatch empty inventory — pipeline continues.
          console.error("[Analysis Orchestrator] Error during parameter scan:", paramScanError);
          store.dispatch({ type: "UPDATE_PARAMETER_INVENTORY", parameterInventory: [] });
        }

        // Step 1c: Parse .als file for automation data (with mtime caching).
        let alsAutomationData: AlsAutomationData | null = null;
        let alsSectionMap: Map<string, SectionAutomationSummary[]> | null = null;
        try {
          // Check for in-memory buffer override first (from webview FileReader)
          const bufferOverride = adapter.getAlsBufferOverride?.();
          if (bufferOverride !== undefined) {
            // Parse directly from buffer — no filesystem access needed
            alsAutomationData = parseAlsBuffer(bufferOverride);
            console.info("[Analysis Orchestrator] Parsed .als from buffer override, envelopes:", alsAutomationData?.envelopes.length ?? 0);
          } else {
            const setFilePath = adapter.readSetFilePath();
            if (setFilePath !== undefined) {
              // Check mtime to see if we can use cached data
              let mtimeMs: number | null = null;
              try {
                const stat = statSync(setFilePath);
                mtimeMs = stat.mtimeMs;
              } catch {
                // File inaccessible — fall through to null automation data
              }

              if (mtimeMs !== null) {
                if (alsCache !== null && alsCache.filePath === setFilePath && alsCache.mtimeMs === mtimeMs) {
                  // Cache hit — reuse previously parsed automation data
                  alsAutomationData = alsCache.data;
                } else {
                  // Cache miss — re-parse
                  alsAutomationData = parseAlsFile(setFilePath);
                  if (alsAutomationData !== null) {
                    alsCache = {
                      filePath: setFilePath,
                      mtimeMs,
                      data: alsAutomationData,
                      sectionMap: new Map(), // will be rebuilt below with current sections
                    };
                  } else {
                    alsCache = null;
                  }
                }
              }
            }
          }
        } catch (alsParseError) {
          // On failure, null automation data — pipeline continues.
          console.error("[Analysis Orchestrator] Error during .als parsing:", alsParseError);
          alsAutomationData = null;
          alsSectionMap = null;
        }
        store.dispatch({ type: "UPDATE_AUTOMATION_DATA", automationData: alsAutomationData });

        // ── Cache check: skip pipeline if inputs haven't changed ──────────
        const sections = getSections();
        const trackNames = tracks.map((t) => t.name);
        const genreId = store.getState().selectedGenreId;
        const cacheKey = computeCacheKey(sections, trackNames, genreId);

        if (cacheKey !== "" && cache.get(cacheKey) !== undefined) {
          // Cache hit — skip the pipeline, state is already up-to-date.
          return;
        }

        // Step 1d: Map .als automation data to current sections (must be after sections are known).
        if (alsAutomationData !== null) {
          alsSectionMap = mapAutomationToSections(alsAutomationData, sections);
          if (alsCache !== null) {
            alsCache.sectionMap = alsSectionMap;
          }
        }

        // Step 2: For each track, read clips, devices, and notes.
        const trackClipDataList: TrackClipData[] = [];
        const trackNoteDataList: TrackNoteData[] = [];
        const trackBuckets: FrequencyBucket[] = [];
        const trackTypes: Array<"midi" | "audio"> = [];

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]!;
          const clips: ClipData[] = adapter.readArrangementClips(i);
          const devices: DeviceData[] = adapter.readDevices(i);

          // Build TrackClipData for section analysis.
          trackClipDataList.push({
            trackName: track.name,
            trackType: track.type,
            clips,
          });

          // Read MIDI notes for MIDI tracks.
          const allNotes: NoteData[] = [];
          if (track.type === "midi") {
            for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
              const notes = adapter.readMidiNotes(i, clipIndex);
              allNotes.push(...notes);
            }
          }

          trackNoteDataList.push({
            trackName: track.name,
            notes: allNotes,
          });

          // Step 3: Categorize the track → frequency bucket.
          const deviceNames = devices.map((d) => d.name);
          const bucket = categorizeTrack(track.name, deviceNames);
          trackBuckets.push(bucket);
          trackTypes.push(track.type);
        }

        // Step 2b: Drum Pad Extraction — read DrumRack chains for each MIDI track.
        // Only runs if the adapter supports DrumPadAdapter methods.
        const drumPadMaps = new Map<string, DrumPadMap>();
        const isDrumPadAdapter = typeof (adapter as DrumPadAdapter).readFirstDeviceClassName === "function"
          && typeof (adapter as DrumPadAdapter).readDrumRackChains === "function";

        if (isDrumPadAdapter) {
          const dpAdapter = adapter as DrumPadAdapter;
          const currentTrackDeviceMap = new Map<string, string | null>();

          for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i]!;
            if (track.type !== "midi") continue;

            // Read first device className for cache comparison
            let firstDeviceClassName: string | null = null;
            try {
              firstDeviceClassName = dpAdapter.readFirstDeviceClassName(i);
            } catch {
              // Skip this track on read failure
              continue;
            }
            currentTrackDeviceMap.set(track.name, firstDeviceClassName);

            // Check cache: skip re-read if device structure unchanged
            const cached = drumPadMapCache.get(track.name);
            if (cached && cached.firstDeviceClassName === firstDeviceClassName) {
              if (cached.drumPadMap !== null) {
                drumPadMaps.set(track.name, cached.drumPadMap);
              }
              continue;
            }

            // Cache miss — extract drum pad map
            try {
              const padMap = extractDrumPadMap(dpAdapter, i);
              drumPadMapCache.set(track.name, { firstDeviceClassName, drumPadMap: padMap });
              if (padMap !== null) {
                drumPadMaps.set(track.name, padMap);
              }
            } catch (error) {
              console.error(`[Analysis Orchestrator] Error extracting drum pad map for track "${track.name}":`, error);
              drumPadMapCache.set(track.name, { firstDeviceClassName, drumPadMap: null });
            }
          }

          // Clean stale cache entries for tracks that no longer exist
          for (const cachedTrackName of drumPadMapCache.keys()) {
            if (!currentTrackDeviceMap.has(cachedTrackName)) {
              drumPadMapCache.delete(cachedTrackName);
            }
          }
        }

        // Dispatch UPDATE_DRUM_PAD_MAPS with the collected maps.
        store.dispatch({ type: "UPDATE_DRUM_PAD_MAPS", drumPadMaps });

        // Step 3b: Synth Analysis — classify track roles and run synth analyzer.
        // Builds a role map from track note data, then calls analyzeSynthTracks
        // for tracks classified as lead/pad/chord/arpeggio/bass.
        let synthAnalysisResult: SynthAnalysisResult | null = null;
        let synthEnergyMap: ReadonlyMap<string, number> = new Map();
        try {
          const trackRoles = new Map<string, InstrumentRole>();
          for (const tnd of trackNoteDataList) {
            const hasDrumRack = drumPadMaps.has(tnd.trackName);
            const role = classifyInstrumentRole(tnd.notes, tnd.trackName, hasDrumRack);
            trackRoles.set(tnd.trackName, role);
          }

          // Check if any synth tracks exist before running analysis
          const synthRoles: InstrumentRole[] = ["lead", "pad", "chord", "arpeggio", "bass"];
          const hasSynthTracks = [...trackRoles.values()].some((r) => synthRoles.includes(r));

          if (hasSynthTracks) {
            synthAnalysisResult = analyzeSynthTracks(
              sections,
              trackNoteDataList,
              trackNames,
              trackRoles,
            );
            store.dispatch({ type: "UPDATE_SYNTH_ANALYSIS", synthAnalysis: synthAnalysisResult });

            // Compute synth energy contribution per section
            synthEnergyMap = computeSynthEnergyContribution(sections, synthAnalysisResult.perSection);
          } else {
            store.dispatch({ type: "UPDATE_SYNTH_ANALYSIS", synthAnalysis: null });
          }
        } catch (synthError) {
          console.error("[Analysis Orchestrator] Error during synth analysis:", synthError);
          store.dispatch({ type: "UPDATE_SYNTH_ANALYSIS", synthAnalysis: null });
        }

        // Step 4–8: Analyze each section and build scoring inputs.
        const sectionAnalysisMap = new Map<string, SectionAnalysisState>();
        const scoringInputs: SectionScoringInput[] = [];

        // Precompute total track count for trackPresenceRatio (all tracks: MIDI and audio).
        const totalTrackCount = trackTypes.length;

        for (const section of sections) {
          // Step 4: Run Section Analyzer.
          const result = analyzeSection(section, trackClipDataList, trackNoteDataList);

          // Step 5: Build SectionScoringInput.
          // Use note-based activity detection for MIDI tracks (replaces clip-only detection).
          const noteBasedActiveNames = computeNoteBasedTrackActivity(section, trackClipDataList, trackNoteDataList);
          const activeTrackCount = noteBasedActiveNames.length;
          const midiDensity = result.midiDensity;

          // trackPresenceRatio: count of all tracks with unmuted clips overlapping section / total tracks.
          let trackPresenceCount = 0;
          for (let i = 0; i < trackClipDataList.length; i++) {
            const hasOverlap = trackClipDataList[i]!.clips.some(
              (clip) => !clip.muted && clip.startTime < section.endTime && clip.endTime > section.startTime,
            );
            if (hasOverlap) {
              trackPresenceCount++;
            }
          }
          const trackPresenceRatio = totalTrackCount === 0 ? 0 : trackPresenceCount / totalTrackCount;

          // automationRatio: use .als-parsed data when available, fall back to 0.
          let automationRatio = 0;
          if (alsSectionMap !== null) {
            const sectionSummaries = alsSectionMap.get(section.id);
            if (sectionSummaries && sectionSummaries.length > 0) {
              // Count tracks that have active automation in this section
              const tracksWithActiveAutomation = sectionSummaries.filter(
                (s) => s.activeEnvelopeCount > 0,
              ).length;
              automationRatio = computeAutomationRatio(tracksWithActiveAutomation, activeTrackCount);
            }
          }

          // frequencyCoverage: unique buckets occupied by active tracks / 7.
          const activeBuckets = new Set<FrequencyBucket>();
          for (let i = 0; i < trackClipDataList.length; i++) {
            if (noteBasedActiveNames.includes(trackClipDataList[i]!.trackName)) {
              activeBuckets.add(trackBuckets[i]!);
            }
          }
          const frequencyCoverage = activeBuckets.size / 7;

          // Compute enhanced MIDI metrics per section.
          const velocityIntensity = computeVelocityIntensity(section, trackNoteDataList);
          const polyphonyScore = computePolyphonyScore(section, trackNoteDataList);
          const pitchRange = computePitchRange(section, trackNoteDataList);

          const sectionSynthEnergy = synthEnergyMap.get(section.id);
          scoringInputs.push({
            activeTrackCount,
            midiDensity,
            trackPresenceRatio,
            automationRatio,
            frequencyCoverage,
            velocityIntensity,
            polyphonyScore,
            pitchRange,
            ...(sectionSynthEnergy != null ? { synthEnergy: sectionSynthEnergy } : {}),
          });

          console.log(`[Arrangement Coach] Energy input "${section.name}" (${section.id}): ` +
            `tracks=${activeTrackCount}, midiDensity=${midiDensity.toFixed(2)}, ` +
            `trackPres=${trackPresenceRatio.toFixed(2)}, automation=${automationRatio.toFixed(2)}, ` +
            `freqCov=${frequencyCoverage.toFixed(2)}, vel=${velocityIntensity.toFixed(2)}, ` +
            `poly=${polyphonyScore.toFixed(2)}, pitch=${pitchRange.toFixed(2)}`);

          // Store partial analysis result (energyScore placeholder — filled after scoring).
          sectionAnalysisMap.set(section.id, {
            activeTrackCount,
            midiDensity,
            hasAutomation: result.hasAutomation,
            energyScore: 1, // placeholder
          });
        }

        // Step 6: Get weights for the selected genre.
        // Select appropriate weight profile based on whether .als data is available.
        const hasAlsData = store.getState().automationData !== null;
        const weights = getWeightsForGenre(store.getState().selectedGenreId, hasAlsData);

        console.log(`[Arrangement Coach] Energy weights: ` +
          `track=${weights.trackCountWeight}, midi=${weights.midiDensityWeight}, ` +
          `trackPres=${weights.trackPresenceWeight}, auto=${weights.automationWeight}, ` +
          `freq=${weights.frequencyCoverageWeight}, vel=${weights.velocityIntensityWeight}, ` +
          `poly=${weights.polyphonyScoreWeight}, pitch=${weights.pitchRangeWeight}`);

        // Step 7: Compute energy scores.
        const energyScores = computeEnergyScores(scoringInputs, weights);

        console.log(`[Arrangement Coach] Energy scores: [${energyScores.join(", ")}]`);

        // Step 8: Update sectionAnalysis map with actual energy scores.
        const sectionsArray = [...sections];
        for (let i = 0; i < sectionsArray.length; i++) {
          const section = sectionsArray[i]!;
          const existing = sectionAnalysisMap.get(section.id)!;
          sectionAnalysisMap.set(section.id, {
            ...existing,
            energyScore: energyScores[i] ?? 1,
          });
        }

        // Step 9: Dispatch UPDATE_ANALYSIS.
        store.dispatch({
          type: "UPDATE_ANALYSIS",
          sectionAnalysis: sectionAnalysisMap,
          energyCurve: energyScores,
        });

        // Step 9b: Content Analysis — call analyzeContent and dispatch results.
        // Skip recomputation when sections and track data have not changed.
        try {
          // Build a cache key from section IDs and per-track note counts.
          const contentCacheKey = JSON.stringify({
            sectionIds: sectionsArray.map((s) => s.id),
            trackNoteLengths: trackNoteDataList.map((t) => t.notes.length),
          });

          if (contentCacheKey !== contentAnalysisCacheKey || cachedContentAnalysis === null) {
            // Cache miss — run content analysis.
            const drumPadMaps = store.getState().drumPadMaps;
            const contentResult = analyzeContent(
              sectionsArray,
              trackNoteDataList,
              trackNames,
              drumPadMaps,
            );
            store.dispatch({ type: "UPDATE_CONTENT_ANALYSIS", contentAnalysis: contentResult });
            contentAnalysisCacheKey = contentCacheKey;
            cachedContentAnalysis = contentResult;
          } else {
            // Cache hit — dispatch cached result to ensure store is consistent.
            store.dispatch({ type: "UPDATE_CONTENT_ANALYSIS", contentAnalysis: cachedContentAnalysis });
          }
        } catch (contentError) {
          // On failure, log and skip — preserve previous content analysis in state.
          console.error("[Analysis Orchestrator] Error during content analysis:", contentError);
        }

        // Step 9c: Synth Analysis — compute detailed profiles for synth tracks.
        // Runs after content analysis because it needs InstrumentRole assignments.
        try {
          const contentState = store.getState().contentAnalysis;
          if (contentState !== null) {
            // Extract roles from content analysis result
            const trackRoles = new Map<string, InstrumentRole>();
            for (const [, trackMap] of contentState.perSection) {
              for (const [trackName, analysis] of trackMap) {
                if (!trackRoles.has(trackName)) {
                  trackRoles.set(trackName, analysis.role);
                }
              }
            }

            // Only run synth analysis if there are synth tracks
            const synthRoles: InstrumentRole[] = ["lead", "pad", "chord", "arpeggio", "bass"];
            const hasSynthTracks = [...trackRoles.values()].some((role) => synthRoles.includes(role));

            if (hasSynthTracks) {
              const synthResult = analyzeSynthTracks(
                sectionsArray,
                trackNoteDataList,
                trackNames,
                trackRoles,
              );
              store.dispatch({ type: "UPDATE_SYNTH_ANALYSIS", synthAnalysis: synthResult });

              // Compute synth energy contribution and update scoring inputs if weight is non-zero
              const synthEnergyMap = computeSynthEnergyContribution(sectionsArray, synthResult.perSection);
              const currentWeights = getWeightsForGenre(store.getState().selectedGenreId, hasAlsData);
              if ((currentWeights.synthEnergyWeight ?? 0) > 0) {
                // Re-compute energy scores with synth energy included
                const updatedScoringInputs: SectionScoringInput[] = scoringInputs.map((input, idx) => ({
                  ...input,
                  synthEnergy: synthEnergyMap.get(sectionsArray[idx]!.id) ?? 0,
                }));
                const updatedEnergyScores = computeEnergyScores(updatedScoringInputs, currentWeights);

                // Update section analysis map and re-dispatch
                for (let i = 0; i < sectionsArray.length; i++) {
                  const section = sectionsArray[i]!;
                  const existing = sectionAnalysisMap.get(section.id)!;
                  sectionAnalysisMap.set(section.id, {
                    ...existing,
                    energyScore: updatedEnergyScores[i] ?? 1,
                  });
                }
                // Overwrite energyScores for downstream use
                energyScores.length = 0;
                energyScores.push(...updatedEnergyScores);

                store.dispatch({
                  type: "UPDATE_ANALYSIS",
                  sectionAnalysis: sectionAnalysisMap,
                  energyCurve: updatedEnergyScores,
                });
              }
            } else {
              store.dispatch({ type: "UPDATE_SYNTH_ANALYSIS", synthAnalysis: null });
            }
          }
        } catch (synthError) {
          // On failure, log and skip — preserve previous synth analysis in state.
          console.error("[Analysis Orchestrator] Error during synth analysis:", synthError);
        }

        // Step 9d: Audio Content Analysis — run asynchronously without blocking the main pipeline.
        // Fire-and-forget: renders audio tracks via the SDK, computes spectral/temporal features,
        // and dispatches UPDATE_AUDIO_CONTENT_ANALYSIS when complete.
        try {
          const audioTrackIndices = adapter.getAudioTrackIndices();
          if (audioTrackIndices.length > 0) {
            // Build AudioTrackRef[] from indices and track names
            const allTracks = adapter.readTracks();
            const audioTracks: AudioTrackRef[] = audioTrackIndices
              .filter((idx) => !adapter.isTrackMuted(idx))
              .map((idx) => ({
                trackIndex: idx,
                trackName: allTracks[idx]?.name ?? `Audio ${idx + 1}`,
              }));

            if (audioTracks.length > 0) {
              const audioAnalyzer = new AudioAnalyzer(adapter);
              const audioSections = [...sectionsArray];

              // Run asynchronously — does not block the synchronous pipeline
              audioAnalyzer.analyzeAudioTracks({
                audioTracks,
                sections: audioSections,
              }).then((audioResults: AudioContentResults) => {
                store.dispatch({ type: "UPDATE_AUDIO_CONTENT_ANALYSIS", audioContent: audioResults });
              }).catch((audioError: unknown) => {
                // Graceful degradation: dispatch empty results so downstream consumers operate normally
                console.error("[Analysis Orchestrator] Audio analysis failed, dispatching empty results:", audioError);
                store.dispatch({ type: "UPDATE_AUDIO_CONTENT_ANALYSIS", audioContent: {
                  perSection: new Map(),
                  crossSection: new Map(),
                  extendedRepetition: new Map(),
                  failures: [],
                }});
              });
            }
          }
        } catch (audioSetupError) {
          // If even setup fails (e.g., getAudioTrackIndices throws), dispatch empty results
          console.error("[Analysis Orchestrator] Audio analysis setup failed:", audioSetupError);
          store.dispatch({ type: "UPDATE_AUDIO_CONTENT_ANALYSIS", audioContent: {
            perSection: new Map(),
            crossSection: new Map(),
            extendedRepetition: new Map(),
            failures: [],
          }});
        }

        // Step 10: Invoke Transition Engine.
        try {
          const selectedGenreId = store.getState().selectedGenreId;
          // Build GenreTransitionProfile from registry or null if no genre selected
          let genreProfile: GenreTransitionProfile | null = null;
          if (selectedGenreId !== null) {
            const transitionPrefs = getTransitionPreferencesForGenre(selectedGenreId);
            genreProfile = {
              genre: selectedGenreId,
              preferredCategories: transitionPrefs.preferred as readonly TransitionCategory[],
              discouragedCategories: transitionPrefs.discouraged as readonly TransitionCategory[],
              buildDurationRange: transitionPrefs.buildDurationRange,
              dropsExpected: transitionPrefs.dropsExpected,
            };
          }
          const transitionRecommendations = computeTransitions({
            sections: sectionsArray,
            energyCurve: energyScores,
            genreProfile,
            trackBuckets,
            audioContentAnalysis: store.getState().audioContentAnalysis,
          });
          store.dispatch({ type: "UPDATE_TRANSITIONS", transitionRecommendations });
        } catch (transitionError) {
          console.error("[Analysis Orchestrator] Error during transition computation:", transitionError);
        }

        // Step 11: Run issue detection on fresh state + intermediate data.
        try {
          const freshState = store.getState();
          const issueInput: IssueDetectorInput = {
            sections: freshState.sections,
            sectionAnalysis: freshState.sectionAnalysis,
            energyCurve: freshState.energyCurve,
            trackInventory: freshState.trackInventory,
            trackClipData: trackClipDataList,
            trackNoteData: trackNoteDataList,
            trackBuckets,
            selectedGenre: freshState.selectedGenreId,
            audioContentAnalysis: freshState.audioContentAnalysis,
            synthAnalysis: freshState.synthAnalysis,
          };
          let issues = detectIssues(issueInput);

          // Step 11a: Apply content-aware suggestion filtering.
          // Convert issues to RawSuggestions, filter with content analysis, then
          // remove issues whose corresponding suggestions were suppressed.
          // Also merge in percussion and discontinuity suggestions as new issues.
          const contentAnalysisState = freshState.contentAnalysis;
          if (contentAnalysisState !== null) {
            const genre = freshState.selectedGenreId;
            const currentDrumPadMaps = freshState.drumPadMaps;

            // Build RawSuggestions from existing issues for filtering
            const rawSuggestions: RawSuggestion[] = issues.map((issue) => {
              const primarySectionId = issue.sectionIds[0];
              const primarySection = primarySectionId
                ? sectionsArray.find((s) => s.id === primarySectionId)
                : undefined;
              const barStart = primarySection
                ? Math.round((primarySection.startTime / 4) + 1)
                : 1;
              const barEnd = primarySection
                ? Math.round(primarySection.endTime / 4)
                : 1;
              return {
                issueType: issue.type,
                sectionName: primarySection?.name ?? "",
                barRange: { start: barStart, end: barEnd },
                severity: issue.severity,
              };
            });

            // Filter suggestions — suppresses redundant fill/build/repetition issues
            const filteredSuggestions = filterSuggestionsWithContent(
              rawSuggestions,
              contentAnalysisState,
              sectionsArray,
              genre,
            );

            // Build a set of indices that survived filtering
            const survivingIndices = new Set<number>();
            for (const filtered of filteredSuggestions) {
              // Find matching original index by comparing key fields
              for (let i = 0; i < rawSuggestions.length; i++) {
                if (survivingIndices.has(i)) continue;
                const raw = rawSuggestions[i]!;
                if (
                  raw.sectionName === filtered.sectionName &&
                  raw.barRange.start === filtered.barRange.start &&
                  raw.barRange.end === filtered.barRange.end &&
                  (raw.issueType === filtered.issueType || filtered.issueType.startsWith(raw.issueType))
                ) {
                  survivingIndices.add(i);
                  break;
                }
              }
            }

            // Keep only issues that survived content filtering
            issues = issues.filter((_, idx) => survivingIndices.has(idx));

            // Generate and merge percussion suggestions
            try {
              const percussionSuggestions = generatePercussionSuggestions(
                contentAnalysisState,
                sectionsArray,
                genre,
                currentDrumPadMaps,
              );
              for (const ps of percussionSuggestions) {
                const sectionId = sectionsArray.find(
                  (s) => s.name === ps.sectionName,
                )?.id ?? (sectionsArray[0]?.id ?? "");
                issues.push({
                  id: `content-percussion-${sectionId}-${ps.issueType}`,
                  type: "info" as any,
                  severity: ps.severity,
                  sectionIds: [sectionId],
                  message: `${ps.issueType} in ${ps.sectionName} (bars ${ps.barRange.start}–${ps.barRange.end})`,
                });
              }
            } catch (percError) {
              console.error("[Analysis Orchestrator] Error generating percussion suggestions:", percError);
            }

            // Generate and merge discontinuity suggestions
            try {
              const discontinuitySuggestions = generateDiscontinuitySuggestions(
                contentAnalysisState.percussionDiscontinuities,
                sectionsArray,
                genre,
              );
              for (const ds of discontinuitySuggestions) {
                const sectionId = sectionsArray.find(
                  (s) => s.name === ds.sectionName,
                )?.id ?? (sectionsArray[0]?.id ?? "");
                issues.push({
                  id: `content-discontinuity-${sectionId}-${ds.issueType}`,
                  type: "info" as any,
                  severity: ds.severity,
                  sectionIds: [sectionId],
                  message: `${ds.issueType} in ${ds.sectionName} (bars ${ds.barRange.start}–${ds.barRange.end})`,
                });
              }
            } catch (discError) {
              console.error("[Analysis Orchestrator] Error generating discontinuity suggestions:", discError);
            }

            // Generate and merge variation suggestions for extended repetition
            try {
              const variationSuggestions = generateVariationSuggestions(
                contentAnalysisState,
                sectionsArray,
              );
              for (const vs of variationSuggestions) {
                const sectionId = sectionsArray.find(
                  (s) => s.name === vs.sectionName,
                )?.id ?? (sectionsArray[0]?.id ?? "");
                issues.push({
                  id: `content-variation-${sectionId}-${vs.issueType}`,
                  type: "repetition" as any,
                  severity: vs.severity,
                  sectionIds: [sectionId],
                  message: `${vs.issueType} in ${vs.sectionName} (bars ${vs.barRange.start}–${vs.barRange.end})`,
                });
              }
            } catch (varError) {
              console.error("[Analysis Orchestrator] Error generating variation suggestions:", varError);
            }

            // Generate and merge audio-specific variation suggestions for extended audio repetition
            try {
              const audioContentState = freshState.audioContentAnalysis;
              const audioVarSuggestions = generateAudioVariationSuggestions(
                audioContentState,
                sectionsArray,
              );
              for (const avs of audioVarSuggestions) {
                const sectionId = sectionsArray.find(
                  (s) => s.name === avs.sectionName,
                )?.id ?? (sectionsArray[0]?.id ?? "");
                const audioProfile = genre
                  ? (getProfile(genre) ?? getProfileBySubgenre(genre) ?? null)
                  : null;
                const rendered = renderSuggestion(avs, audioProfile);
                issues.push({
                  id: `audio-variation-${sectionId}-${avs.issueType}`,
                  type: "repetition" as any,
                  severity: avs.severity,
                  sectionIds: [sectionId],
                  message: rendered,
                });
              }
            } catch (audioVarError) {
              console.error("[Analysis Orchestrator] Error generating audio variation suggestions:", audioVarError);
            }
          }

          // Generate audio-specific suggestions even when MIDI content analysis is unavailable
          if (contentAnalysisState === null) {
            try {
              const audioContentState = freshState.audioContentAnalysis;
              const audioVarSuggestions = generateAudioVariationSuggestions(
                audioContentState,
                sectionsArray,
              );
              const selectedGenre = freshState.selectedGenreId;
              for (const avs of audioVarSuggestions) {
                const sectionId = sectionsArray.find(
                  (s) => s.name === avs.sectionName,
                )?.id ?? (sectionsArray[0]?.id ?? "");
                const audioProfile = selectedGenre
                  ? (getProfile(selectedGenre) ?? getProfileBySubgenre(selectedGenre) ?? null)
                  : null;
                const rendered = renderSuggestion(avs, audioProfile);
                issues.push({
                  id: `audio-variation-${sectionId}-${avs.issueType}`,
                  type: "repetition" as any,
                  severity: avs.severity,
                  sectionIds: [sectionId],
                  message: rendered,
                });
              }
            } catch (audioVarError) {
              console.error("[Analysis Orchestrator] Error generating audio variation suggestions:", audioVarError);
            }
          }

          // Generate genre-aware frequency balance suggestions (Requirements 9.1–9.6)
          try {
            const audioContentState = freshState.audioContentAnalysis;
            const contentState = freshState.contentAnalysis;
            const selectedGenre = freshState.selectedGenreId;
            const freqBalanceSuggestions = generateGenreAwareFrequencyBalanceSuggestions(
              audioContentState,
              contentState,
              sectionsArray,
              selectedGenre,
            );
            for (const fbs of freqBalanceSuggestions) {
              const sectionId = sectionsArray.find(
                (s) => s.name === fbs.sectionName,
              )?.id ?? (sectionsArray[0]?.id ?? "");
              const genreProfile = selectedGenre
                ? (getProfile(selectedGenre) ?? getProfileBySubgenre(selectedGenre) ?? null)
                : null;
              const rendered = renderSuggestion(fbs, genreProfile);
              issues.push({
                id: `freq-balance-${sectionId}-${fbs.issueType}`,
                type: "info" as any,
                severity: fbs.severity,
                sectionIds: [sectionId],
                message: rendered,
              });
            }
          } catch (freqBalanceError) {
            console.error("[Analysis Orchestrator] Error generating genre-aware frequency balance suggestions:", freqBalanceError);
          }

          // Generate and merge synth-specific suggestions when SynthAnalysisResult is available
          try {
            const synthAnalysisState = freshState.synthAnalysis;
            if (synthAnalysisState) {
              const synthSuggestions = generateSynthSuggestions(
                synthAnalysisState,
                sectionsArray,
                energyScores,
              );
              for (const ss of synthSuggestions) {
                const sectionId = sectionsArray.find(
                  (s) => s.name === ss.sectionName,
                )?.id ?? (sectionsArray[0]?.id ?? "");
                issues.push({
                  id: `synth-suggestion-${sectionId}-${ss.issueType}`,
                  type: "info" as any,
                  severity: ss.severity,
                  sectionIds: [sectionId],
                  message: `${ss.issueType} in ${ss.sectionName} (bars ${ss.barRange.start}–${ss.barRange.end})`,
                });
              }
            }
          } catch (synthSuggestError) {
            console.error("[Analysis Orchestrator] Error generating synth suggestions:", synthSuggestError);
          }

          store.dispatch({ type: "UPDATE_ISSUES", issues });
        } catch (issueError) {
          // On detection error, log and skip — preserve previous issues in state.
          console.error("[Analysis Orchestrator] Error during issue detection:", issueError);
        }

        // Step 11b: Detect contrast gaps and generate automation suggestions.
        try {
          const selectedGenreIdForGaps = store.getState().selectedGenreId;
          const detectionThresholds = getThresholdsForGenre(selectedGenreIdForGaps);

          // Run contrast gap detection
          const contrastGaps = detectContrastGaps(
            sectionsArray,
            sectionAnalysisMap,
            energyScores,
            trackClipDataList,
            trackNoteDataList,
            {
              flatEnergyMaxDelta: detectionThresholds.flatEnergyMaxDelta,
              similarityCeilingPercent: detectionThresholds.similarityCeilingPercent,
            },
          );

          // Build transition points from the energy curve: adjacent sections with significant energy delta
          const transitionPoints: TransitionPoint[] = [];
          const TRANSITION_ENERGY_THRESHOLD = 2; // minimum energy delta to qualify as a transition point
          for (let i = 0; i < sectionsArray.length - 1; i++) {
            const energyA = energyScores[i] ?? 0;
            const energyB = energyScores[i + 1] ?? 0;
            const delta = Math.abs(energyA - energyB);
            if (delta >= TRANSITION_ENERGY_THRESHOLD) {
              transitionPoints.push({
                fromSectionId: sectionsArray[i]!.id,
                toSectionId: sectionsArray[i + 1]!.id,
                energyDelta: delta,
              });
            }
          }

          // Build activeTracks map: section ID → array of active track names in that section
          const activeTracksMap = new Map<string, readonly string[]>();
          for (const section of sectionsArray) {
            const activeNames = computeNoteBasedTrackActivity(section, trackClipDataList, trackNoteDataList);
            activeTracksMap.set(section.id, activeNames);
          }

          // Build the automation suggester input
          const currentInventory = store.getState().parameterInventory;
          const currentAutomationData = store.getState().automationData;

          const suggestions = generateAutomationSuggestions({
            contrastGaps,
            transitionPoints,
            parameterInventory: currentInventory,
            automationData: currentAutomationData,
            sectionAutomationMap: alsSectionMap,
            activeTracks: activeTracksMap,
            genre: selectedGenreIdForGaps,
          });

          store.dispatch({ type: "UPDATE_AUTOMATION_SUGGESTIONS", automationSuggestions: suggestions });
        } catch (suggestionError) {
          // On failure, dispatch empty suggestions — pipeline continues.
          console.error("[Analysis Orchestrator] Error during contrast gap detection / automation suggestions:", suggestionError);
          store.dispatch({ type: "UPDATE_AUTOMATION_SUGGESTIONS", automationSuggestions: [] });
        }

        // Step 12: Auto-generate section checklists from current issues and transitions.
        // Uses whichever results are current in the store (handles partial success:
        // if issues or transitions failed above, the store retains previous values).
        // Wrapped in try/catch to not disrupt the analysis pipeline.
        try {
          const currentState = store.getState();

          // Build existing completions map from current sectionChecklists state
          const existingCompletions = new Map<string, boolean>();
          for (const items of Object.values(currentState.sectionChecklists)) {
            for (const item of items) {
              existingCompletions.set(item.id, item.completed);
            }
          }

          const sectionChecklists = generateSectionChecklists({
            issues: currentState.issues,
            transitionRecommendations: currentState.transitionRecommendations,
            existingSections: currentState.sections.map((s) => s.id),
            existingCompletions,
            selectedGenre: currentState.selectedGenreId,
          });

          store.dispatch({
            type: "UPDATE_SECTION_CHECKLISTS",
            sectionChecklists: sectionChecklists as Record<string, SectionChecklistItem[]>,
          });
        } catch (checklistError) {
          // On auto-generation error, log and skip — preserve previous checklists in state.
          console.error("[Analysis Orchestrator] Error during checklist auto-generation:", checklistError);
        }

        // Step 13: Compute DJ compatibility score and dispatch result.
        try {
          const djState = store.getState();
          const tempo = adapter.readTempo();
          const djResult = computeDjScore({
            sections: sectionsArray,
            energyCurve: energyScores,
            tempo,
            genreId: djState.selectedGenreId,
          });
          store.dispatch({ type: "UPDATE_DJ_SCORE", djScore: djResult });
        } catch (djError) {
          console.error("[Analysis Orchestrator] Error during DJ scoring:", djError);
        }

        // Step 14: Run reference comparison pipeline after main analysis.
        runReferencePipeline();

        // ── Cache store: mark this input signature as computed ─────────────
        if (cacheKey !== "") {
          cache.set(cacheKey, true);
        }
      } catch (error) {
        // On error in main pipeline, log and do NOT dispatch (preserve previous results).
        console.error("[Analysis Orchestrator] Error during analysis pipeline:", error);
      } finally {
        analysisInProgress = false;
        store.dispatch({ type: "SET_ANALYZING", analyzing: false });
      }
    },

    handleReferenceScan(): void {
      runReferencePipeline();
    },

    invalidateCache(): void {
      cache.invalidate();
      contentAnalysisCacheKey = null;
      cachedContentAnalysis = null;
      drumPadMapCache = new Map();
    },

    isAnalyzing(): boolean {
      return analysisInProgress;
    },
  };
}
