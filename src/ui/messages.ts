/**
 * Message Protocol — typed communication between the Extension backend and
 * the webview frontend using discriminated unions.
 *
 * Messages are serialized to JSON for transfer. The protocol is versioned
 * implicitly by the discriminated union — new message types can be added
 * without breaking existing handlers. Unrecognized type values from the
 * webview are silently ignored.
 */
import type { Section } from "../core/section-scanner.js";
import type { Issue } from "../core/issue-types.js";
import type { SectionAnalysisState } from "../state/store.js";
import type { TransitionRecommendation } from "../core/transition-engine.js";
import type { Note, SectionChecklistItem } from "../core/notes-types.js";
import type { AlignmentResult } from "../core/alignment-scorer.js";
import type { ArchetypeResult } from "../core/archetype-detector.js";
import type { GenreFamilySummary, GenreSearchResult } from "../core/genre-registry.js";
import type { ReferenceSection, ComparisonResult } from "../core/reference-types.js";
import type { DjScoreResult } from "../core/dj-scorer.js";

// ─── Backend → Webview Messages ────────────────────────────────────────

/** Messages sent from the Extension backend to the webview. */
export type BackendMessage =
  | { type: "sections_updated"; sections: Section[] }
  | { type: "active_section_changed"; activeSectionId: string | null }
  | { type: "analysis_updated"; sectionAnalysis: Record<string, SectionAnalysisState>; energyCurve: number[] }
  | { type: "genre_changed"; genreId: string | null; genreName: string | null }
  | { type: "alignment_updated"; alignment: AlignmentResult | null }
  | { type: "archetype_updated"; archetype: ArchetypeResult | null }
  | { type: "genre_families"; families: GenreFamilySummary[] }
  | { type: "genre_search_results"; results: GenreSearchResult[] }
  | { type: "issues_updated"; issues: Issue[] }
  | { type: "transitions_updated"; recommendations: TransitionRecommendation[] }
  | { type: "notes_updated"; notes: Note[]; sectionChecklists: Record<string, SectionChecklistItem[]> }
  | { type: "persistence_status"; available: boolean; projectKey: string | null }
  | { type: "reference_updated"; referenceTrackIndex: number | null; referenceSections: ReferenceSection[]; comparisonResult: ComparisonResult | null }
  | { type: "reference_cleared" }
  | { type: "analyzing_status"; analyzing: boolean }
  | { type: "dj_score_updated"; djScore: DjScoreResult | null }
  | { type: "show_issues" }
  | { type: "generation_status"; generating: boolean; error: string | null }
  | { type: "generation_complete"; markersCreated: number };

// ─── Webview → Backend Messages ────────────────────────────────────────

/** Messages sent from the webview to the Extension backend. */
export type FrontendMessage =
  | { type: "request_state" }
  | { type: "select_genre"; genreId: string | null }
  | { type: "search_genres"; query: string }
  | { type: "request_genre_families" }
  | { type: "request_analysis" }
  | { type: "select_section"; sectionId: string }
  | { type: "toggle_checklist_item"; boundaryId: string; itemId: string }
  | { type: "add_note"; sectionId: string; text: string }
  | { type: "edit_note"; noteId: string; text: string }
  | { type: "delete_note"; noteId: string }
  | { type: "toggle_section_checklist_item"; sectionId: string; itemId: string }
  | { type: "request_reference_scan" }
  | { type: "set_als_path"; path: string }
  | { type: "set_als_data"; fileName: string; data: string }
  | { type: "save_notes" }
  | { type: "refresh" }
  | { type: "generate_sections" };

// ─── Known Type Constants ──────────────────────────────────────────────

const KNOWN_FRONTEND_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "request_state",
  "select_genre",
  "search_genres",
  "request_genre_families",
  "request_analysis",
  "select_section",
  "toggle_checklist_item",
  "add_note",
  "edit_note",
  "delete_note",
  "toggle_section_checklist_item",
  "request_reference_scan",
  "set_als_path",
  "set_als_data",
  "save_notes",
  "refresh",
  "generate_sections",
]);

// ─── Type Guard ────────────────────────────────────────────────────────

/**
 * Determines whether a raw object is a valid FrontendMessage.
 *
 * Returns true only when the object has a `type` field matching a known
 * FrontendMessage type.
 */
export function isValidFrontendMessage(msg: unknown): msg is FrontendMessage {
  if (msg === null || typeof msg !== "object") {
    return false;
  }

  const record = msg as Record<string, unknown>;
  if (typeof record.type !== "string" || !KNOWN_FRONTEND_MESSAGE_TYPES.has(record.type)) {
    return false;
  }

  // Validate payload for types that require specific fields
  if (record.type === "select_genre") {
    return record.genreId === null || typeof record.genreId === "string";
  }

  if (record.type === "search_genres") {
    return typeof record.query === "string";
  }

  if (record.type === "toggle_checklist_item") {
    return typeof record.boundaryId === "string" && typeof record.itemId === "string";
  }

  if (record.type === "add_note") {
    return (
      typeof record.sectionId === "string" &&
      typeof record.text === "string" &&
      record.text.length >= 1 &&
      record.text.length <= 500
    );
  }

  if (record.type === "edit_note") {
    return (
      typeof record.noteId === "string" &&
      typeof record.text === "string" &&
      record.text.length >= 1 &&
      record.text.length <= 500
    );
  }

  if (record.type === "delete_note") {
    return typeof record.noteId === "string";
  }

  if (record.type === "toggle_section_checklist_item") {
    return typeof record.sectionId === "string" && typeof record.itemId === "string";
  }

  return true;
}

// ─── Handler Map Types ─────────────────────────────────────────────────

/** A map of handler functions keyed by FrontendMessage type. */
export type FrontendMessageHandlers = {
  [K in FrontendMessage["type"]]?: (
    msg: Extract<FrontendMessage, { type: K }>
  ) => void;
};

// ─── Message Routing ───────────────────────────────────────────────────

/**
 * Route a raw message object to the appropriate handler.
 *
 * If the message has an unrecognized `type` field (or is not a valid
 * FrontendMessage), it is silently ignored — no error is thrown and no
 * handler is invoked.
 */
export function handleFrontendMessage(
  msg: unknown,
  handlers: FrontendMessageHandlers
): void {
  if (!isValidFrontendMessage(msg)) {
    return; // silently ignore unrecognized messages
  }

  const handler = handlers[msg.type] as ((msg: FrontendMessage) => void) | undefined;
  if (handler !== undefined) {
    handler(msg);
  }
}
