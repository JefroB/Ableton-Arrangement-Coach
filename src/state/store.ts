/**
 * State Store — central immutable state container with reducer-based updates.
 *
 * Implements a minimal Redux-like pattern: state is updated only through
 * dispatched actions processed by a pure reducer. Subscribers are notified
 * after every dispatch.
 */
import type { Section } from "../core/section-scanner.js";
import type { TrackInfo } from "../core/track-reader.js";
import type { Issue } from "../core/issue-types.js";
import type { TransitionRecommendation } from "../core/transition-engine.js";
import type { Note, SectionChecklistItem } from "../core/notes-types.js";
import type { AlignmentResult } from "../core/alignment-scorer.js";
import type { ArchetypeResult } from "../core/archetype-detector.js";
import type { ReferenceSection, ComparisonResult } from "../core/reference-types.js";
import type { DjScoreResult } from "../core/dj-scorer.js";
import type { TrackParameterInventory } from "../core/parameter-scanner.js";
import type { AlsAutomationData } from "../core/als-parser.js";
import type { AutomationSuggestion } from "../core/automation-suggester.js";
import type { ContentAnalysisResult, DrumPadMap } from "../core/content-analysis-types.js";
import type { AudioContentResults, UpdateAudioContentAnalysisAction } from "../core/audio-content-types.js";
import type { SynthAnalysisResult } from "../core/synth-analysis-types.js";
import { getProfile, getProfileBySubgenre } from "../core/genre-registry.js";

// ─── Analysis State Type ───────────────────────────────────────────────

/** Per-section analysis state stored in the application state map. */
export interface SectionAnalysisState {
  readonly activeTrackCount: number;
  readonly midiDensity: number;
  readonly hasAutomation: boolean;
  readonly energyScore: number; // 1–10
}

// ─── State Type ────────────────────────────────────────────────────────

/** The complete application state. All fields are readonly to discourage mutation. */
export interface AppState {
  readonly sections: readonly Section[];
  readonly trackInventory: readonly TrackInfo[];
  readonly activeSectionId: string | null;
  readonly sectionAnalysis: ReadonlyMap<string, SectionAnalysisState>;
  readonly energyCurve: readonly number[];
  readonly selectedGenreId: string | null;
  readonly selectionRange: { startTime: number; endTime: number } | null;
  readonly alignmentScore: AlignmentResult | null;
  readonly detectedArchetype: ArchetypeResult | null;
  readonly issues: readonly Issue[];
  readonly transitionRecommendations: readonly TransitionRecommendation[];
  readonly notes: readonly Note[];
  readonly sectionChecklists: Readonly<Record<string, readonly SectionChecklistItem[]>>;
  readonly persistenceAvailable: boolean;
  readonly referenceTrackIndex: number | null;
  readonly referenceSections: readonly ReferenceSection[];
  readonly comparisonResult: ComparisonResult | null;
  readonly isAnalyzing: boolean;
  readonly djScore: DjScoreResult | null;
  readonly parameterInventory: TrackParameterInventory;
  readonly automationData: AlsAutomationData | null;
  readonly automationSuggestions: readonly AutomationSuggestion[];
  readonly contentAnalysis: ContentAnalysisResult | null;
  readonly drumPadMaps: ReadonlyMap<string, DrumPadMap>;
  readonly audioContentAnalysis: AudioContentResults | null;
  readonly synthAnalysis: SynthAnalysisResult | null;
  readonly isGenerating: boolean;
  readonly generationError: string | null;
}

// ─── Action Types ──────────────────────────────────────────────────────

/** Discriminated union of all actions the store can process. */
export type Action =
  | { type: "INIT"; sections: Section[]; trackInventory: TrackInfo[] }
  | { type: "UPDATE_PLAYHEAD"; position: number }
  | { type: "UPDATE_ANALYSIS"; sectionAnalysis: Map<string, SectionAnalysisState>; energyCurve: number[] }
  | { type: "SET_GENRE"; genreId: string | null }
  | { type: "UPDATE_ALIGNMENT"; alignment: AlignmentResult | null }
  | { type: "UPDATE_ARCHETYPE"; archetype: ArchetypeResult | null }
  | { type: "UPDATE_ISSUES"; issues: Issue[] }
  | { type: "UPDATE_TRANSITIONS"; transitionRecommendations: TransitionRecommendation[] }
  | { type: "TOGGLE_CHECKLIST_ITEM"; boundaryId: string; itemId: string }
  | { type: "UPDATE_NOTES"; notes: Note[] }
  | { type: "ADD_NOTE"; sectionId: string; text: string }
  | { type: "EDIT_NOTE"; noteId: string; text: string }
  | { type: "DELETE_NOTE"; noteId: string }
  | { type: "UPDATE_SECTION_CHECKLISTS"; sectionChecklists: Record<string, SectionChecklistItem[]> }
  | { type: "TOGGLE_SECTION_CHECKLIST_ITEM"; sectionId: string; itemId: string }
  | { type: "SET_PERSISTENCE_STATUS"; available: boolean }
  | { type: "UPDATE_REFERENCE"; referenceTrackIndex: number | null; referenceSections: ReferenceSection[]; comparisonResult: ComparisonResult | null }
  | { type: "CLEAR_REFERENCE" }
  | { type: "SET_ANALYZING"; analyzing: boolean }
  | { type: "UPDATE_DJ_SCORE"; djScore: DjScoreResult | null }
  | { type: "SET_SELECTION_RANGE"; startTime: number; endTime: number }
  | { type: "CLEAR_SELECTION_RANGE" }
  | { type: "UPDATE_PARAMETER_INVENTORY"; parameterInventory: TrackParameterInventory }
  | { type: "UPDATE_AUTOMATION_DATA"; automationData: AlsAutomationData | null }
  | { type: "UPDATE_AUTOMATION_SUGGESTIONS"; automationSuggestions: readonly AutomationSuggestion[] }
  | { type: "UPDATE_CONTENT_ANALYSIS"; contentAnalysis: ContentAnalysisResult }
  | { type: "UPDATE_DRUM_PAD_MAPS"; drumPadMaps: ReadonlyMap<string, DrumPadMap> }
  | { type: "UPDATE_SYNTH_ANALYSIS"; synthAnalysis: SynthAnalysisResult | null }
  | UpdateAudioContentAnalysisAction
  | { type: "SET_GENERATING"; generating: boolean }
  | { type: "SET_GENERATION_ERROR"; error: string | null };

// ─── Store Interface ───────────────────────────────────────────────────

/** Public API for the state store. */
export interface Store {
  /** Get the current state snapshot. */
  getState(): AppState;

  /** Dispatch an action to update state via the reducer. */
  dispatch(action: Action): void;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

// ─── Initial State ─────────────────────────────────────────────────────

const INITIAL_STATE: AppState = {
  sections: [],
  trackInventory: [],
  activeSectionId: null,
  sectionAnalysis: new Map(),
  energyCurve: [],
  selectedGenreId: null,
  selectionRange: null,
  alignmentScore: null,
  detectedArchetype: null,
  issues: [],
  transitionRecommendations: [],
  notes: [],
  sectionChecklists: {},
  persistenceAvailable: false,
  referenceTrackIndex: null,
  referenceSections: [],
  comparisonResult: null,
  isAnalyzing: false,
  djScore: null,
  parameterInventory: [],
  automationData: null,
  automationSuggestions: [],
  contentAnalysis: null,
  drumPadMaps: new Map(),
  audioContentAnalysis: null,
  synthAnalysis: null,
  isGenerating: false,
  generationError: null,
};

// ─── Reducer ───────────────────────────────────────────────────────────

/**
 * Pure reducer function. Produces a new state for every action without
 * mutating the previous state.
 */
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "INIT":
      return {
        sections: [...action.sections],
        trackInventory: [...action.trackInventory],
        activeSectionId: null,
        sectionAnalysis: new Map(),
        energyCurve: [],
        selectedGenreId: state.selectedGenreId,
        selectionRange: state.selectionRange ?? null,
        alignmentScore: null,
        detectedArchetype: null,
        issues: [],
        transitionRecommendations: [],
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: null,
        referenceSections: [],
        comparisonResult: null,
        isAnalyzing: state.isAnalyzing,
        djScore: null,
        parameterInventory: [],
        automationData: null,
        automationSuggestions: [],
        contentAnalysis: null,
        drumPadMaps: new Map(),
        audioContentAnalysis: null,
        synthAnalysis: null,
        isGenerating: state.isGenerating,
        generationError: state.generationError,
      };

    case "UPDATE_PLAYHEAD": {
      const activeSectionId = resolveActiveSection(
        state.sections,
        action.position
      );
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "UPDATE_ANALYSIS":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: new Map(action.sectionAnalysis),
        energyCurve: [...action.energyCurve],
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };

    case "SET_GENRE": {
      if (action.genreId === null) {
        return {
          sections: state.sections,
          trackInventory: state.trackInventory,
          activeSectionId: state.activeSectionId,
          sectionAnalysis: state.sectionAnalysis,
          energyCurve: state.energyCurve,
          selectedGenreId: null,
          alignmentScore: state.alignmentScore,
          detectedArchetype: state.detectedArchetype,
          issues: state.issues,
          transitionRecommendations: state.transitionRecommendations,
          notes: state.notes,
          sectionChecklists: state.sectionChecklists,
          persistenceAvailable: state.persistenceAvailable,
          referenceTrackIndex: state.referenceTrackIndex,
          referenceSections: state.referenceSections,
          comparisonResult: state.comparisonResult,
          isAnalyzing: state.isAnalyzing,
          djScore: state.djScore,
          parameterInventory: state.parameterInventory,
          automationData: state.automationData,
          automationSuggestions: state.automationSuggestions,
          contentAnalysis: state.contentAnalysis,
          drumPadMaps: state.drumPadMaps,
        };
      }
      if (getProfile(action.genreId) === null && getProfileBySubgenre(action.genreId) === null) {
        return state;
      }
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: action.genreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "UPDATE_ALIGNMENT":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: action.alignment,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };

    case "UPDATE_ARCHETYPE":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: action.archetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };

    case "UPDATE_ISSUES":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: [...action.issues],
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };

    case "UPDATE_TRANSITIONS": {
      // Preserve existing checklist completion states for matching boundaries
      const newRecommendations = action.transitionRecommendations.map((incoming) => {
        // Find existing recommendation with matching fromSectionId + toSectionId
        const existing = state.transitionRecommendations.find(
          (r) => r.fromSectionId === incoming.fromSectionId && r.toSectionId === incoming.toSectionId
        );
        if (existing === undefined) {
          return incoming;
        }
        // Carry over completed states for checklist items with matching text
        const mergedChecklist = incoming.checklist.map((item) => {
          const matchingItem = existing.checklist.find(
            (existingItem) => existingItem.text === item.text
          );
          if (matchingItem !== undefined && matchingItem.completed) {
            return { ...item, completed: true };
          }
          return item;
        });
        return { ...incoming, checklist: mergedChecklist };
      });
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: newRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };
    }

    case "TOGGLE_CHECKLIST_ITEM": {
      // Find recommendation by boundaryId (matches recommendation.id)
      const recIndex = state.transitionRecommendations.findIndex(
        (r) => r.id === action.boundaryId
      );
      if (recIndex === -1) {
        return state; // Silently ignore invalid boundaryId
      }
      const recommendation = state.transitionRecommendations[recIndex]!;
      // Find checklist item by itemId
      const itemIndex = recommendation.checklist.findIndex(
        (item) => item.id === action.itemId
      );
      if (itemIndex === -1) {
        return state; // Silently ignore invalid itemId
      }
      // Toggle the completed boolean
      const updatedChecklist = recommendation.checklist.map((item, idx) =>
        idx === itemIndex ? { ...item, completed: !item.completed } : item
      );
      const updatedRecommendation = { ...recommendation, checklist: updatedChecklist };
      const updatedRecommendations = state.transitionRecommendations.map((r, idx) =>
        idx === recIndex ? updatedRecommendation : r
      );
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: updatedRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "UPDATE_NOTES":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: [...action.notes],
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };

    case "ADD_NOTE": {
      // Validate sectionId exists in current sections
      const sectionExists = state.sections.some((s) => s.id === action.sectionId);
      if (!sectionExists) {
        return state;
      }
      // Validate text: 1–500 chars, non-whitespace-only
      if (
        action.text.length < 1 ||
        action.text.length > 500 ||
        action.text.trim().length === 0
      ) {
        return state;
      }
      // Validate max 100 notes per section
      const sectionNoteCount = state.notes.filter(
        (n) => n.sectionId === action.sectionId
      ).length;
      if (sectionNoteCount >= 100) {
        return state;
      }
      const newNote: Note = {
        id: generateId(),
        sectionId: action.sectionId,
        text: action.text,
        createdAt: Date.now(),
      };
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: [...state.notes, newNote],
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "EDIT_NOTE": {
      // Find note by id
      const noteIndex = state.notes.findIndex((n) => n.id === action.noteId);
      if (noteIndex === -1) {
        return state; // No-op for non-existent noteId
      }
      // Validate text: 1–500 chars, non-whitespace-only
      if (
        action.text.length < 1 ||
        action.text.length > 500 ||
        action.text.trim().length === 0
      ) {
        return state;
      }
      const existingNote = state.notes[noteIndex]!;
      const updatedNote: Note = {
        id: existingNote.id,
        sectionId: existingNote.sectionId,
        text: action.text,
        createdAt: existingNote.createdAt,
      };
      const updatedNotes = state.notes.map((n, idx) =>
        idx === noteIndex ? updatedNote : n
      );
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: updatedNotes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "DELETE_NOTE": {
      const filteredNotes = state.notes.filter((n) => n.id !== action.noteId);
      if (filteredNotes.length === state.notes.length) {
        return state; // No-op if id not found
      }
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: filteredNotes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "UPDATE_SECTION_CHECKLISTS":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: { ...action.sectionChecklists },
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };

    case "TOGGLE_SECTION_CHECKLIST_ITEM": {
      // Find the section's checklist items (guard against prototype keys)
      if (!Object.prototype.hasOwnProperty.call(state.sectionChecklists, action.sectionId)) {
        return state; // No-op if sectionId not found
      }
      const sectionItems = state.sectionChecklists[action.sectionId];
      if (!Array.isArray(sectionItems)) {
        return state; // No-op if value is not a valid array
      }
      // Find the item by itemId
      const targetItemIndex = sectionItems.findIndex((item) => item.id === action.itemId);
      if (targetItemIndex === -1) {
        return state; // No-op if itemId not found
      }
      // Flip completed boolean
      const updatedItems = sectionItems.map((item, idx) =>
        idx === targetItemIndex ? { ...item, completed: !item.completed } : item
      );
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: { ...state.sectionChecklists, [action.sectionId]: updatedItems },
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };
    }

    case "SET_PERSISTENCE_STATUS":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: action.available,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
      };

    case "UPDATE_REFERENCE":
      return {
        ...state,
        referenceTrackIndex: action.referenceTrackIndex,
        referenceSections: action.referenceSections,
        comparisonResult: action.comparisonResult,
      };

    case "CLEAR_REFERENCE":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: null,
        referenceSections: [],
        comparisonResult: null,
        isAnalyzing: state.isAnalyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };

    case "SET_ANALYZING":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: action.analyzing,
        djScore: state.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };

    case "UPDATE_DJ_SCORE":
      return {
        sections: state.sections,
        trackInventory: state.trackInventory,
        activeSectionId: state.activeSectionId,
        sectionAnalysis: state.sectionAnalysis,
        energyCurve: state.energyCurve,
        selectedGenreId: state.selectedGenreId,
        selectionRange: state.selectionRange,
        alignmentScore: state.alignmentScore,
        detectedArchetype: state.detectedArchetype,
        issues: state.issues,
        transitionRecommendations: state.transitionRecommendations,
        notes: state.notes,
        sectionChecklists: state.sectionChecklists,
        persistenceAvailable: state.persistenceAvailable,
        referenceTrackIndex: state.referenceTrackIndex,
        referenceSections: state.referenceSections,
        comparisonResult: state.comparisonResult,
        isAnalyzing: state.isAnalyzing,
        djScore: action.djScore,
        parameterInventory: state.parameterInventory,
        automationData: state.automationData,
        automationSuggestions: state.automationSuggestions,
        contentAnalysis: state.contentAnalysis,
        drumPadMaps: state.drumPadMaps,
        audioContentAnalysis: state.audioContentAnalysis,
        synthAnalysis: state.synthAnalysis,
      };

    case "SET_SELECTION_RANGE":
      return { ...state, selectionRange: { startTime: action.startTime, endTime: action.endTime } };

    case "CLEAR_SELECTION_RANGE":
      return { ...state, selectionRange: null };

    case "UPDATE_PARAMETER_INVENTORY":
      return { ...state, parameterInventory: action.parameterInventory };

    case "UPDATE_AUTOMATION_DATA":
      return { ...state, automationData: action.automationData };

    case "UPDATE_AUTOMATION_SUGGESTIONS":
      return { ...state, automationSuggestions: action.automationSuggestions };

    case "UPDATE_CONTENT_ANALYSIS":
      return { ...state, contentAnalysis: action.contentAnalysis };

    case "UPDATE_DRUM_PAD_MAPS":
      return { ...state, drumPadMaps: action.drumPadMaps };

    case "UPDATE_SYNTH_ANALYSIS":
      return { ...state, synthAnalysis: action.synthAnalysis };

    case "UPDATE_AUDIO_CONTENT_ANALYSIS":
      return { ...state, audioContentAnalysis: action.audioContent };

    case "SET_GENERATING":
      return { ...state, isGenerating: action.generating };

    case "SET_GENERATION_ERROR":
      return { ...state, generationError: action.error };

    default:
      return state;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Generate a unique ID for a new note.
 * Uses crypto.randomUUID when available, falls back to a timestamp-based ID.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random suffix
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Find the section where `startTime <= position < endTime`.
 * Returns the section's id, or null if no section contains the position.
 */
function resolveActiveSection(
  sections: readonly Section[],
  position: number
): string | null {
  for (const section of sections) {
    if (section.startTime <= position && position < section.endTime) {
      return section.id;
    }
  }
  return null;
}

// ─── Factory ───────────────────────────────────────────────────────────

/**
 * Create a new store instance with the initial empty state.
 *
 * The store dispatches actions through the reducer to produce new state,
 * and notifies all subscribers after each dispatch.
 */
export function createStore(): Store {
  let state: AppState = INITIAL_STATE;
  let listeners: Array<() => void> = [];

  return {
    getState(): AppState {
      return state;
    },

    dispatch(action: Action): void {
      state = reducer(state, action);
      // Notify subscribers with a copy of the listeners array to handle
      // unsubscriptions during notification safely.
      const currentListeners = [...listeners];
      for (const listener of currentListeners) {
        listener();
      }
    },

    subscribe(listener: () => void): () => void {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
