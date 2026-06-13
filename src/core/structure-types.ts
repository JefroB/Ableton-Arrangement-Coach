/**
 * Structure Types — type definitions for genre arrangement structure data.
 *
 * Defines the typed interfaces for arrangement structure variants stored in
 * JSON data files (`src/data/genres/`), the generated marker output shape,
 * and the orchestrator result/error contracts.
 */

// ─── Genre Structure Data Model ────────────────────────────────────────

/** A single section in an arrangement structure variant. */
export interface StructureSection {
  readonly name: string;
  readonly lengthRange: { readonly min: number; readonly max: number }; // bars
}

/** A named arrangement structure variant for a subgenre. */
export interface ArrangementVariant {
  readonly name: string;
  readonly sections: readonly StructureSection[];
}

/** A subgenre's arrangement data entry in a genre data file. */
export interface SubgenreStructureEntry {
  readonly subgenreId: string;
  readonly displayName: string;
  readonly structureVariants: readonly ArrangementVariant[];
}

/** Root shape of a genre family JSON data file. */
export interface GenreFamilyStructureFile {
  readonly genreFamily: string;
  readonly subgenres: readonly SubgenreStructureEntry[];
}

// ─── Generated Marker Output ───────────────────────────────────────────

/** A single generated section marker with its name and beat position. */
export interface GeneratedMarker {
  readonly name: string;
  readonly beatPosition: number;
}

// ─── Orchestrator Result ───────────────────────────────────────────────

/** Result returned by the section generation orchestrator. */
export interface GenerationResult {
  readonly success: boolean;
  readonly markersCreated: number;
  readonly markersExpected: number;
  readonly error?: string;
  readonly failedSection?: { name: string; beatPosition: number };
}

// ─── Error Reporting ───────────────────────────────────────────────────

/** Structured error for generation failures displayed in the webview. */
export interface GenerationError {
  readonly message: string;
  readonly sectionName?: string;
  readonly beatPosition?: number;
  readonly created: number;
  readonly expected: number;
}
