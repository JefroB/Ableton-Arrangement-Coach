// --- src/core/archetype-config-loader.ts ---
import { deepFreeze, createFailHelper } from './loader-utils.js';

/**
 * Archetype configuration loader module.
 *
 * Statically imports archetype-config.json at build time, validates
 * structure and constraints at module initialization, and exposes
 * typed frozen objects. Follows the same pattern as dj-scorer-config-loader.ts.
 */
import archetypeConfigData from "../data/scoring/archetype-config.json" with { type: "json" };

// ━━━ Exported Interfaces ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DjToolScoring {
  readonly energyRangeLow: number;
  readonly energyRangeMid: number;
  readonly energyRangeLowPoints: number;
  readonly energyRangeMidPoints: number;
  readonly sectionCountLow: number;
  readonly sectionCountMid: number;
  readonly sectionCountLowPoints: number;
  readonly sectionCountMidPoints: number;
  readonly introOutroLongBars: number;
  readonly introOutroShortBars: number;
  readonly introOutroLongPoints: number;
  readonly introOutroShortPoints: number;
  readonly uniqueNamesLow: number;
  readonly uniqueNamesMid: number;
  readonly uniqueNamesLowPoints: number;
  readonly uniqueNamesMidPoints: number;
  readonly noDropsPoints: number;
}

export interface PeakValleyScoring {
  readonly energyRangeHigh: number;
  readonly energyRangeMid: number;
  readonly energyRangeHighPoints: number;
  readonly energyRangeMidPoints: number;
  readonly directionChangesHigh: number;
  readonly directionChangesMid: number;
  readonly directionChangesLow: number;
  readonly directionChangesHighPoints: number;
  readonly directionChangesMidPoints: number;
  readonly directionChangesLowPoints: number;
  readonly sectionCountHigh: number;
  readonly sectionCountMid: number;
  readonly sectionCountHighPoints: number;
  readonly sectionCountMidPoints: number;
  readonly hasBreakdownPoints: number;
  readonly peakCountThreshold: number;
  readonly peakCountPoints: number;
}

export interface VerseChorusScoring {
  readonly bothVerseChrousPoints: number;
  readonly eitherVerseChorusPoints: number;
  readonly repeatedPatternsHigh: number;
  readonly repeatedPatternsLow: number;
  readonly repeatedPatternsHighPoints: number;
  readonly repeatedPatternsLowPoints: number;
  readonly energyRangeLow: number;
  readonly energyRangeHigh: number;
  readonly energyRangeWideLow: number;
  readonly energyRangeWideHigh: number;
  readonly energyRangeNarrowPoints: number;
  readonly energyRangeWidePoints: number;
  readonly sectionCountLow: number;
  readonly sectionCountHigh: number;
  readonly sectionCountLowMin: number;
  readonly sectionCountRangePoints: number;
  readonly sectionCountMinOnlyPoints: number;
}

export interface BuildDropScoring {
  readonly dropsHigh: number;
  readonly dropsLow: number;
  readonly dropsHighPoints: number;
  readonly dropsLowPoints: number;
  readonly buildSectionsHigh: number;
  readonly buildSectionsLow: number;
  readonly buildSectionsHighPoints: number;
  readonly buildSectionsLowPoints: number;
  readonly energyRangeHigh: number;
  readonly energyRangeMid: number;
  readonly energyRangeHighPoints: number;
  readonly energyRangeMidPoints: number;
  readonly hasBreakdownPoints: number;
  readonly sectionCountLow: number;
  readonly sectionCountHigh: number;
  readonly sectionCountPoints: number;
}

export interface ContinuousEvolutionScoring {
  readonly uniqueRatioHigh: number;
  readonly uniqueRatioMid: number;
  readonly uniqueRatioHighPoints: number;
  readonly uniqueRatioMidPoints: number;
  readonly smoothRatioHigh: number;
  readonly smoothRatioMid: number;
  readonly smoothRatioHighPoints: number;
  readonly smoothRatioMidPoints: number;
  readonly smoothDeltaMax: number;
  readonly repeatedPatternsNone: number;
  readonly repeatedPatternsLow: number;
  readonly repeatedPatternsNonePoints: number;
  readonly repeatedPatternsLowPoints: number;
  readonly sectionCountHigh: number;
  readonly sectionCountMid: number;
  readonly sectionCountHighPoints: number;
  readonly sectionCountMidPoints: number;
  readonly noDropsPoints: number;
}

export interface LoopScoring {
  readonly energyRangeLow: number;
  readonly energyRangeMid: number;
  readonly energyRangeLowPoints: number;
  readonly energyRangeMidPoints: number;
  readonly sectionCountLow: number;
  readonly sectionCountMid: number;
  readonly sectionCountLowPoints: number;
  readonly sectionCountMidPoints: number;
  readonly uniqueNamesLow: number;
  readonly uniqueNamesMid: number;
  readonly uniqueNamesLowPoints: number;
  readonly uniqueNamesMidPoints: number;
  readonly noDropsPoints: number;
  readonly noIntroOutroPoints: number;
}

export interface ScoringThresholds {
  readonly djTool: DjToolScoring;
  readonly peakValley: PeakValleyScoring;
  readonly verseChorus: VerseChorusScoring;
  readonly buildDrop: BuildDropScoring;
  readonly continuousEvolution: ContinuousEvolutionScoring;
  readonly loop: LoopScoring;
}

export interface ArchetypeConfig {
  readonly priority: readonly string[];
  readonly dropDetectionThreshold: number;
  readonly genrePriorBoost: number;
  readonly maxScoreCap: number;
  readonly lowConfidenceThreshold: number;
  readonly scoring: ScoringThresholds;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RECOGNIZED_ARCHETYPES = [
  "dj-tool",
  "build-drop",
  "verse-chorus",
  "peak-valley",
  "loop",
  "continuous-evolution"
] as const;

const REQUIRED_PRIORITY_COUNT = 6;
const REQUIRED_SCORING_KEYS = [
  "djTool",
  "peakValley",
  "verseChorus",
  "buildDrop",
  "continuousEvolution",
  "loop"
] as const;

// ━━━ Validation helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fail = createFailHelper('archetype-config.json');

/**
 * Validates the entire archetype-config.json structure at module init.
 * Throws descriptive errors on any validation failure.
 */
export function validateArchetypeConfigFile(data: unknown): void {
  if (data === null || typeof data !== "object") {
    fail("(root)", `expected object, got ${data === null ? "null" : typeof data}`);
  }

  const root = data as Record<string, unknown>;

  // ── Validate priority array ──
  const priority = root["priority"];
  if (!Array.isArray(priority)) {
    fail("priority", `expected array, got ${typeof priority}`);
  }
  if (priority.length !== REQUIRED_PRIORITY_COUNT) {
    fail(
      "priority",
      `expected exactly ${REQUIRED_PRIORITY_COUNT} entries, got ${priority.length}`
    );
  }

  for (let i = 0; i < priority.length; i++) {
    const entry = priority[i];
    if (typeof entry !== "string") {
      fail(`priority[${i}]`, `expected string, got ${typeof entry}`);
    }
    if (!RECOGNIZED_ARCHETYPES.includes(entry as any)) {
      fail(
        `priority[${i}]`,
        `unrecognized archetype "${entry}", must be one of [${RECOGNIZED_ARCHETYPES.join(", ")}]`
      );
    }
  }

  // ── Validate top-level thresholds ──
  const dropDetectionThreshold = root["dropDetectionThreshold"];
  if (typeof dropDetectionThreshold !== "number" || !Number.isFinite(dropDetectionThreshold) || dropDetectionThreshold < 0 || dropDetectionThreshold > 999) {
    fail(
      "dropDetectionThreshold",
      `expected number in 0–999, got ${String(dropDetectionThreshold)}`
    );
  }

  const genrePriorBoost = root["genrePriorBoost"];
  if (typeof genrePriorBoost !== "number" || !Number.isFinite(genrePriorBoost) || genrePriorBoost < 0 || genrePriorBoost > 999) {
    fail(
      "genrePriorBoost",
      `expected number in 0–999, got ${String(genrePriorBoost)}`
    );
  }

  const maxScoreCap = root["maxScoreCap"];
  if (typeof maxScoreCap !== "number" || !Number.isFinite(maxScoreCap) || maxScoreCap < 0 || maxScoreCap > 999) {
    fail(
      "maxScoreCap",
      `expected number in 0–999, got ${String(maxScoreCap)}`
    );
  }

  const lowConfidenceThreshold = root["lowConfidenceThreshold"];
  if (typeof lowConfidenceThreshold !== "number" || !Number.isFinite(lowConfidenceThreshold) || lowConfidenceThreshold < 0 || lowConfidenceThreshold > 999) {
    fail(
      "lowConfidenceThreshold",
      `expected number in 0–999, got ${String(lowConfidenceThreshold)}`
    );
  }

  // ── Validate scoring sub-objects ──
  const scoring = root["scoring"];
  if (scoring === null || typeof scoring !== "object" || Array.isArray(scoring)) {
    fail("scoring", `expected object, got ${scoring === null ? "null" : Array.isArray(scoring) ? "array" : typeof scoring}`);
  }

  const scoringObj = scoring as Record<string, unknown>;
  const scoringKeys = Object.keys(scoringObj);

  if (scoringKeys.length !== 6) {
    fail(
      "scoring",
      `expected exactly 6 keys, got ${scoringKeys.length}: [${scoringKeys.join(", ")}]`
    );
  }

  for (const key of REQUIRED_SCORING_KEYS) {
    if (!(key in scoringObj)) {
      fail("scoring", `missing required key "${key}"`);
    }
  }

  // Validate djTool
  const djTool = scoringObj["djTool"];
  if (djTool === null || typeof djTool !== "object" || Array.isArray(djTool)) {
    fail("scoring.djTool", `expected object, got ${djTool === null ? "null" : Array.isArray(djTool) ? "array" : typeof djTool}`);
  }

  const djToolObj = djTool as Record<string, unknown>;
  const djToolKeys = Object.keys(djToolObj);
  if (djToolKeys.length !== 17) {
    fail(
      "scoring.djTool",
      `expected exactly 17 keys, got ${djToolKeys.length}: [${djToolKeys.join(", ")}]`
    );
  }

  const djToolFields = [
    "energyRangeLow", "energyRangeMid", "energyRangeLowPoints", "energyRangeMidPoints",
    "sectionCountLow", "sectionCountMid", "sectionCountLowPoints", "sectionCountMidPoints",
    "introOutroLongBars", "introOutroShortBars", "introOutroLongPoints", "introOutroShortPoints",
    "uniqueNamesLow", "uniqueNamesMid", "uniqueNamesLowPoints", "uniqueNamesMidPoints",
    "noDropsPoints"
  ] as const;

  for (const field of djToolFields) {
    const value = djToolObj[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999) {
      fail(
        `scoring.djTool.${field}`,
        `expected number in 0–999, got ${String(value)}`
      );
    }
  }

  // Validate peakValley
  const peakValley = scoringObj["peakValley"];
  if (peakValley === null || typeof peakValley !== "object" || Array.isArray(peakValley)) {
    fail("scoring.peakValley", `expected object, got ${peakValley === null ? "null" : Array.isArray(peakValley) ? "array" : typeof peakValley}`);
  }

  const peakValleyObj = peakValley as Record<string, unknown>;
  const peakValleyKeys = Object.keys(peakValleyObj);
  if (peakValleyKeys.length !== 17) {
    fail(
      "scoring.peakValley",
      `expected exactly 17 keys, got ${peakValleyKeys.length}: [${peakValleyKeys.join(", ")}]`
    );
  }

  const peakValleyFields = [
    "energyRangeHigh", "energyRangeMid", "energyRangeHighPoints", "energyRangeMidPoints",
    "directionChangesHigh", "directionChangesMid", "directionChangesLow", "directionChangesHighPoints",
    "directionChangesMidPoints", "directionChangesLowPoints", "sectionCountHigh", "sectionCountMid",
    "sectionCountHighPoints", "sectionCountMidPoints", "hasBreakdownPoints", "peakCountThreshold",
    "peakCountPoints"
  ] as const;

  for (const field of peakValleyFields) {
    const value = peakValleyObj[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999) {
      fail(
        `scoring.peakValley.${field}`,
        `expected number in 0–999, got ${String(value)}`
      );
    }
  }

  // Validate verseChorus
  const verseChorus = scoringObj["verseChorus"];
  if (verseChorus === null || typeof verseChorus !== "object" || Array.isArray(verseChorus)) {
    fail("scoring.verseChorus", `expected object, got ${verseChorus === null ? "null" : Array.isArray(verseChorus) ? "array" : typeof verseChorus}`);
  }

  const verseChorusObj = verseChorus as Record<string, unknown>;
  const verseChorusKeys = Object.keys(verseChorusObj);
  if (verseChorusKeys.length !== 17) {
    fail(
      "scoring.verseChorus",
      `expected exactly 17 keys, got ${verseChorusKeys.length}: [${verseChorusKeys.join(", ")}]`
    );
  }

  const verseChorusFields = [
    "bothVerseChrousPoints", "eitherVerseChorusPoints", "repeatedPatternsHigh", "repeatedPatternsLow",
    "repeatedPatternsHighPoints", "repeatedPatternsLowPoints", "energyRangeLow", "energyRangeHigh",
    "energyRangeWideLow", "energyRangeWideHigh", "energyRangeNarrowPoints", "energyRangeWidePoints",
    "sectionCountLow", "sectionCountHigh", "sectionCountLowMin", "sectionCountRangePoints",
    "sectionCountMinOnlyPoints"
  ] as const;

  for (const field of verseChorusFields) {
    const value = verseChorusObj[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999) {
      fail(
        `scoring.verseChorus.${field}`,
        `expected number in 0–999, got ${String(value)}`
      );
    }
  }

  // Validate buildDrop
  const buildDrop = scoringObj["buildDrop"];
  if (buildDrop === null || typeof buildDrop !== "object" || Array.isArray(buildDrop)) {
    fail("scoring.buildDrop", `expected object, got ${buildDrop === null ? "null" : Array.isArray(buildDrop) ? "array" : typeof buildDrop}`);
  }

  const buildDropObj = buildDrop as Record<string, unknown>;
  const buildDropKeys = Object.keys(buildDropObj);
  if (buildDropKeys.length !== 16) {
    fail(
      "scoring.buildDrop",
      `expected exactly 16 keys, got ${buildDropKeys.length}: [${buildDropKeys.join(", ")}]`
    );
  }

  const buildDropFields = [
    "dropsHigh", "dropsLow", "dropsHighPoints", "dropsLowPoints",
    "buildSectionsHigh", "buildSectionsLow", "buildSectionsHighPoints", "buildSectionsLowPoints",
    "energyRangeHigh", "energyRangeMid", "energyRangeHighPoints", "energyRangeMidPoints",
    "hasBreakdownPoints", "sectionCountLow", "sectionCountHigh", "sectionCountPoints"
  ] as const;

  for (const field of buildDropFields) {
    const value = buildDropObj[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999) {
      fail(
        `scoring.buildDrop.${field}`,
        `expected number in 0–999, got ${String(value)}`
      );
    }
  }

  // Validate continuousEvolution
  const continuousEvolution = scoringObj["continuousEvolution"];
  if (continuousEvolution === null || typeof continuousEvolution !== "object" || Array.isArray(continuousEvolution)) {
    fail("scoring.continuousEvolution", `expected object, got ${continuousEvolution === null ? "null" : Array.isArray(continuousEvolution) ? "array" : typeof continuousEvolution}`);
  }

  const continuousEvolutionObj = continuousEvolution as Record<string, unknown>;
  const continuousEvolutionKeys = Object.keys(continuousEvolutionObj);
  if (continuousEvolutionKeys.length !== 18) {
    fail(
      "scoring.continuousEvolution",
      `expected exactly 18 keys, got ${continuousEvolutionKeys.length}: [${continuousEvolutionKeys.join(", ")}]`
    );
  }

  const continuousEvolutionFields = [
    "uniqueRatioHigh", "uniqueRatioMid", "uniqueRatioHighPoints", "uniqueRatioMidPoints",
    "smoothRatioHigh", "smoothRatioMid", "smoothRatioHighPoints", "smoothRatioMidPoints",
    "smoothDeltaMax", "repeatedPatternsNone", "repeatedPatternsLow", "repeatedPatternsNonePoints",
    "repeatedPatternsLowPoints", "sectionCountHigh", "sectionCountMid", "sectionCountHighPoints",
    "sectionCountMidPoints", "noDropsPoints"
  ] as const;

  for (const field of continuousEvolutionFields) {
    const value = continuousEvolutionObj[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999) {
      fail(
        `scoring.continuousEvolution.${field}`,
        `expected number in 0–999, got ${String(value)}`
      );
    }
  }

  // Validate loop
  const loop = scoringObj["loop"];
  if (loop === null || typeof loop !== "object" || Array.isArray(loop)) {
    fail("scoring.loop", `expected object, got ${loop === null ? "null" : Array.isArray(loop) ? "array" : typeof loop}`);
  }

  const loopObj = loop as Record<string, unknown>;
  const loopKeys = Object.keys(loopObj);
  if (loopKeys.length !== 14) {
    fail(
      "scoring.loop",
      `expected exactly 14 keys, got ${loopKeys.length}: [${loopKeys.join(", ")}]`
    );
  }

  const loopFields = [
    "energyRangeLow", "energyRangeMid", "energyRangeLowPoints", "energyRangeMidPoints",
    "sectionCountLow", "sectionCountMid", "sectionCountLowPoints", "sectionCountMidPoints",
    "uniqueNamesLow", "uniqueNamesMid", "uniqueNamesLowPoints", "uniqueNamesMidPoints",
    "noDropsPoints", "noIntroOutroPoints"
  ] as const;

  for (const field of loopFields) {
    const value = loopObj[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999) {
      fail(
        `scoring.loop.${field}`,
        `expected number in 0–999, got ${String(value)}`
      );
    }
  }
}

// ━━━ Module initialization (fail-fast) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validateArchetypeConfigFile(archetypeConfigData);

// Cast validated data to typed structures
const validatedData = archetypeConfigData as unknown as ArchetypeConfig;

// Deep freeze all data structures
const FROZEN_PRIORITY: readonly string[] = deepFreeze([...validatedData.priority]);
const FROZEN_DROP_DETECTION_THRESHOLD: number = validatedData.dropDetectionThreshold;
const FROZEN_GENRE_PRIOR_BOOST: number = validatedData.genrePriorBoost;
const FROZEN_MAX_SCORE_CAP: number = validatedData.maxScoreCap;
const FROZEN_LOW_CONFIDENCE_THRESHOLD: number = validatedData.lowConfidenceThreshold;
const FROZEN_SCORING_THRESHOLDS: ScoringThresholds = deepFreeze({
  djTool: { ...validatedData.scoring.djTool },
  peakValley: { ...validatedData.scoring.peakValley },
  verseChorus: { ...validatedData.scoring.verseChorus },
  buildDrop: { ...validatedData.scoring.buildDrop },
  continuousEvolution: { ...validatedData.scoring.continuousEvolution },
  loop: { ...validatedData.scoring.loop }
});

// ━━━ Accessor Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Returns the list of archetype priorities. */
export function getArchetypePriority(): readonly string[] {
  return FROZEN_PRIORITY;
}

/** Returns the drop detection threshold. */
export function getDropDetectionThreshold(): number {
  return FROZEN_DROP_DETECTION_THRESHOLD;
}

/** Returns the genre prior boost value. */
export function getGenrePriorBoost(): number {
  return FROZEN_GENRE_PRIOR_BOOST;
}

/** Returns the maximum score cap. */
export function getMaxScoreCap(): number {
  return FROZEN_MAX_SCORE_CAP;
}

/** Returns the low confidence threshold. */
export function getLowConfidenceThreshold(): number {
  return FROZEN_LOW_CONFIDENCE_THRESHOLD;
}

/** Returns the scoring thresholds for all archetypes. */
export function getScoringThresholds(): ScoringThresholds {
  return FROZEN_SCORING_THRESHOLDS;
}