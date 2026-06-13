/**
 * Issue Data Model — type definitions for the issue detection system.
 *
 * Defines the typed interfaces for detected arrangement issues, including
 * the issue type discriminator, severity levels, and the full Issue shape.
 * Also defines the input contract for the issue detector pure function.
 */
import type { Section } from "./section-scanner.js";
import type { SectionAnalysisState } from "../state/store.js";
import type { TrackInfo } from "./track-reader.js";
import type { TrackClipData, TrackNoteData } from "./section-analyzer.js";
import type { FrequencyBucket } from "./track-categorizer.js";
import type { AudioContentResults } from "./audio-content-types.js";
import type { SynthAnalysisResult } from "./synth-analysis-types.js";

// ─── Issue Type Discriminator ──────────────────────────────────────────

/** All possible issue types detected by the issue detector. */
export type IssueType =
  | "flat-energy"
  | "missing-transition"
  | "repetition"
  | "abrupt-change"
  | "frequency-crowding"
  | "intro-length"
  | "outro-length"
  | "intro-energy"
  | "energy-mismatch"
  | "info";

// ─── Issue Severity ────────────────────────────────────────────────────

/** Severity classification for detected issues. */
export type IssueSeverity = "info" | "warning" | "critical";

// ─── Issue Interface ───────────────────────────────────────────────────

/**
 * A single detected arrangement issue.
 *
 * All fields are required and readonly. The `sectionIds` array contains
 * at least 1 entry referencing affected sections. The `message` field is
 * capped at 200 characters (enforced at creation time).
 */
export interface Issue {
  readonly id: string;
  readonly type: IssueType;
  readonly severity: IssueSeverity;
  readonly sectionIds: readonly string[];
  readonly message: string;
}

// ─── Issue Detector Input ──────────────────────────────────────────────

/**
 * The complete input required by the issue detector.
 *
 * Combines arrangement state from the store with intermediate analysis
 * data passed directly from the orchestrator.
 */
export interface IssueDetectorInput {
  readonly sections: readonly Section[];
  readonly sectionAnalysis: ReadonlyMap<string, SectionAnalysisState>;
  readonly energyCurve: readonly number[];
  readonly trackInventory: readonly TrackInfo[];
  readonly trackClipData: readonly TrackClipData[];
  readonly trackNoteData: readonly TrackNoteData[];
  readonly trackBuckets: readonly FrequencyBucket[];
  readonly selectedGenre: string | null;
  readonly audioContentAnalysis?: AudioContentResults | null;
  readonly synthAnalysis?: SynthAnalysisResult | null;
}
