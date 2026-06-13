/**
 * Notes & Checklist Data Models — type definitions for the notes and
 * section checklist system.
 *
 * Defines the typed interfaces for user-authored notes, auto-generated
 * checklist items, checklist source discriminators, and the persistence
 * file schema.
 */

// ─── Checklist Source Discriminator ────────────────────────────────────

/**
 * Indicates where a checklist item originated.
 * - "issue": from M3 issue detection
 * - "transition": from M4 transition recommendations
 * - "genre": from M6 genre-aware checklist generation
 * - "manual": user-created
 */
export type ChecklistSource = "issue" | "transition" | "genre" | "manual";

// ─── Note Interface ────────────────────────────────────────────────────

/**
 * A user-authored text entry associated with a specific section.
 *
 * All fields are required and readonly. The `text` field is 1–500
 * characters (enforced at creation/edit time). The `createdAt` field
 * is a Unix timestamp in milliseconds.
 */
export interface Note {
  readonly id: string;
  readonly sectionId: string;
  readonly text: string;
  readonly createdAt: number;
}

// ─── Section Checklist Item Interface ──────────────────────────────────

/**
 * A single actionable checklist item associated with a section.
 *
 * The `id` field is stable and derived deterministically from the source
 * (issue id or transition recommendation id + original item id). The
 * `text` field is 1–150 characters. The `completed` boolean defaults
 * to false for new items.
 */
export interface SectionChecklistItem {
  readonly id: string;
  readonly sectionId: string;
  readonly text: string;
  readonly source: ChecklistSource;
  readonly completed: boolean;
}

// ─── Persistence File Schema ───────────────────────────────────────────

/**
 * The JSON schema for a single project's persisted notes and checklist
 * completion states, stored at `{storageDirectory}/notes/{projectKey}.json`.
 */
export interface PersistenceFile {
  readonly schemaVersion: 1;
  readonly projectKey: string;
  readonly notes: readonly Note[];
  readonly checklistCompletions: Record<string, boolean>;
}
