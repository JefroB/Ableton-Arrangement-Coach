/**
 * Suggestion Renderer — pure-function module that formats raw analysis suggestions
 * into user-facing plain-text strings using genre-appropriate vocabulary.
 *
 * - Max 2 sentences output
 * - Uses genre-specific transition names from `profile.transitions.preferred`
 * - Uses section names from `profile.structure` when matching
 * - Implements vocabulary rotation based on input hash for varied leading verbs
 * - Falls back to generic electronic music terminology when profile is null
 * - Uses multiple framing modes (directive, observational, question, goal-based, comparison)
 * - Rotates second-sentence explanations to avoid repetitive coaching
 */
import type { GenreProfile } from "./genre-profile-types.js";
import { loadAllSuggestionData } from "./suggestion-loader.js";

// ─── Loaded Suggestion Data ────────────────────────────────────────────

const SUGGESTION_DATA = loadAllSuggestionData();

// ─── Public Interface ──────────────────────────────────────────────────

/** Raw suggestion data produced by the issue detection system. */
export interface RawSuggestion {
  readonly issueType: string;
  readonly sectionName: string;
  readonly barRange: { readonly start: number; readonly end: number };
  readonly severity: "info" | "warning" | "critical";
}

/**
 * Render a raw suggestion into a user-facing plain-text string.
 *
 * Pure function — no side effects. Uses deterministic vocabulary rotation
 * based on a hash of the input to vary language across calls.
 *
 * @param suggestion - The raw suggestion data
 * @param profile - The active GenreProfile, or null for generic terminology
 * @param issueIndex - Optional index of this issue in the current analysis batch (adds rotation diversity)
 * @returns A plain-text string of at most 2 sentences
 */
export function renderSuggestion(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  issueIndex: number = 0,
): string {
  const baseHash = computeInputHash(suggestion);
  // Mix in issueIndex so the same track re-analyzed gets varied phrasing
  const hash = baseHash ^ (issueIndex * 2654435761);
  const absHash = Math.abs(hash);

  const sectionDisplay = resolveSectionName(suggestion.sectionName, profile);
  const verb = selectLeadingVerb(suggestion.issueType, absHash);
  const transitionTerm = selectTransitionTerm(profile, absHash);
  // Use a different hash region for the framing mode so it's independent of verb choice
  const framingHash = Math.abs((absHash >>> 7) ^ (absHash * 31));

  const renderer = resolveRenderer(suggestion.issueType);
  return renderer(suggestion, profile, sectionDisplay, verb, transitionTerm, absHash, framingHash);
}

// ─── Renderer Resolution ───────────────────────────────────────────────

/**
 * Resolve the appropriate renderer for an issue type.
 * Checks exact match first, then prefix match for compound types like "audio-variation:bass audio".
 */
function resolveRenderer(issueType: string): IssueRenderer {
  if (Object.hasOwn(ISSUE_RENDERERS, issueType)) {
    return ISSUE_RENDERERS[issueType]!;
  }
  // Check prefix-based renderers for compound issue types (e.g., "audio-variation:bass audio")
  const prefix = issueType.split(":")[0]!;
  if (Object.hasOwn(PREFIX_RENDERERS, prefix)) {
    return PREFIX_RENDERERS[prefix]!;
  }
  return renderGenericIssue;
}

// ─── Framing Modes ─────────────────────────────────────────────────────

/**
 * Framing modes that determine sentence structure.
 * Each renderer picks a mode based on framingHash to vary output style.
 */
type FramingMode = "directive" | "observational" | "question" | "goal" | "comparison";

function selectFramingMode(framingHash: number): FramingMode {
  return SUGGESTION_DATA.audioVariation.framingModes[framingHash % SUGGESTION_DATA.audioVariation.framingModes.length]! as FramingMode;
}


// ─── Issue-Specific Renderers ──────────────────────────────────────────

type IssueRenderer = (
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
) => string;

const ISSUE_RENDERERS: Record<string, IssueRenderer> = {
  "flat-energy": renderFlatEnergy,
  "missing-transition": renderMissingTransition,
  "repetition": renderRepetition,
  "abrupt-change": renderAbruptChange,
  "frequency-crowding": renderFrequencyCrowding,
  "intro-length": renderIntroLength,
  "outro-length": renderOutroLength,
  "intro-energy": renderIntroEnergy,
  "energy-mismatch": renderEnergyMismatch,
};

/**
 * Prefix-based renderers for compound issue types (e.g., "audio-variation:bass audio").
 * The prefix is the portion before the first colon.
 */
const PREFIX_RENDERERS: Record<string, IssueRenderer> = {
  "audio-variation": renderAudioVariation,
  "freq-balance": renderFrequencyBalance,
};

function renderFlatEnergy(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const barInfo = formatBarRange(suggestion.barRange);
  const technique = selectVariationTechnique(profile, hash);
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("flat-energy", hash);

  switch (mode) {
    case "directive":
      return `${verb} ${technique} in ${sectionDisplay} ${barInfo}. ${second}`;
    case "observational":
      return `${sectionDisplay} ${barInfo} maintains a similar level of activity throughout. ${verb} ${technique} to create forward motion.`;
    case "question":
      return `What would happen if ${technique} entered halfway through ${sectionDisplay} ${barInfo}? ${second}`;
    case "goal":
      return `To increase momentum in ${sectionDisplay} ${barInfo}, try ${technique}. ${second}`;
    case "comparison":
      return `${sectionDisplay} ${barInfo} stays at the same intensity as what came before. ${verb} ${technique} to differentiate it.`;
  }
}

function renderMissingTransition(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const barInfo = formatBarRange(suggestion.barRange);
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("missing-transition", hash);

  switch (mode) {
    case "directive":
      return `${verb} a ${transitionTerm} before ${sectionDisplay} ${barInfo}. ${second}`;
    case "observational":
      return `The boundary before ${sectionDisplay} ${barInfo} has no bridging element. ${second}`;
    case "question":
      return `Would a ${transitionTerm} before ${sectionDisplay} ${barInfo} help the energy shift land? ${second}`;
    case "goal":
      return `To smooth the energy change into ${sectionDisplay} ${barInfo}, a ${transitionTerm} would create anticipation. ${second}`;
    case "comparison":
      return `The sections on either side of ${sectionDisplay} ${barInfo} jump without connection. ${verb} a ${transitionTerm} to bridge them.`;
  }
}

function renderRepetition(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const technique = selectVariationTechnique(profile, hash);
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("repetition", hash);

  switch (mode) {
    case "directive":
      return `${verb} ${sectionDisplay} using ${technique}. ${second}`;
    case "observational":
      return `${sectionDisplay} closely mirrors what came before it. ${second}`;
    case "question":
      return `Could ${technique} in ${sectionDisplay} give it its own identity? ${second}`;
    case "goal":
      return `To differentiate ${sectionDisplay}, try ${technique}. ${second}`;
    case "comparison":
      return `${sectionDisplay} and its neighbor share almost the same structure. ${verb} it using ${technique} to create progression.`;
  }
}

function renderAbruptChange(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const barInfo = formatBarRange(suggestion.barRange);
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("abrupt-change", hash);

  switch (mode) {
    case "directive":
      return `${verb} the transition into ${sectionDisplay} with a ${transitionTerm} ${barInfo}. ${second}`;
    case "observational":
      return `The energy change into ${sectionDisplay} ${barInfo} arrives without preparation. ${second}`;
    case "question":
      return `Would a short ${transitionTerm} ${barInfo} make the arrival at ${sectionDisplay} feel more intentional? ${second}`;
    case "goal":
      return `To telegraph the shift into ${sectionDisplay} ${barInfo}, ${verb.toLowerCase()} it with a ${transitionTerm}. ${second}`;
    case "comparison":
      return `The energy before and after ${sectionDisplay} ${barInfo} jumps suddenly. A ${transitionTerm} could bridge the gap.`;
  }
}

function renderFrequencyCrowding(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const barInfo = formatBarRange(suggestion.barRange);
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("frequency-crowding", hash);

  switch (mode) {
    case "directive":
      return `${verb} the frequency range in ${sectionDisplay} ${barInfo}. ${second}`;
    case "observational":
      return `Multiple elements in ${sectionDisplay} ${barInfo} compete for the same spectral space. ${second}`;
    case "question":
      return `Which element in ${sectionDisplay} ${barInfo} is most important? Consider giving it priority and filtering the rest.`;
    case "goal":
      return `For more clarity in ${sectionDisplay} ${barInfo}, ${verb.toLowerCase()} the competing layers. ${second}`;
    case "comparison":
      return `${sectionDisplay} ${barInfo} is denser than surrounding sections. ${verb} some layers to let the lead elements cut through.`;
  }
}

function renderIntroLength(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("intro-length", hash);

  switch (mode) {
    case "directive":
      return `${verb} ${sectionDisplay} to give DJs more mixing room. ${second}`;
    case "observational":
      return `${sectionDisplay} is shorter than typical for this genre. ${second}`;
    case "question":
      return `Would a longer ${sectionDisplay} give DJs a cleaner entry point? ${second}`;
    case "goal":
      return `For better DJ compatibility, ${verb.toLowerCase()} ${sectionDisplay}. ${second}`;
    case "comparison":
      return `Compared to genre standards, ${sectionDisplay} is compact. ${verb} it to support smoother mixing.`;
  }
}

function renderOutroLength(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("outro-length", hash);

  switch (mode) {
    case "directive":
      return `${verb} ${sectionDisplay} to give DJs a clean exit. ${second}`;
    case "observational":
      return `${sectionDisplay} is shorter than typical for this genre. ${second}`;
    case "question":
      return `Would a longer ${sectionDisplay} make mixing out easier? ${second}`;
    case "goal":
      return `For smoother DJ transitions, ${verb.toLowerCase()} ${sectionDisplay}. ${second}`;
    case "comparison":
      return `Compared to genre standards, ${sectionDisplay} is compact. ${verb} it to support smoother mix-outs.`;
  }
}

function renderIntroEnergy(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("intro-energy", hash);

  switch (mode) {
    case "directive":
      return `${verb} the energy in ${sectionDisplay}. ${second}`;
    case "observational":
      return `${sectionDisplay} starts with more energy than is typical for a mix-in. ${second}`;
    case "question":
      return `Would stripping ${sectionDisplay} back give DJs more blending room? ${second}`;
    case "goal":
      return `For a smoother mix-in at ${sectionDisplay}, ${verb.toLowerCase()} the opening energy. ${second}`;
    case "comparison":
      return `${sectionDisplay} energy is closer to a main section than a mix-in point. ${verb} it for better DJ compatibility.`;
  }
}

function renderEnergyMismatch(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("energy-mismatch", hash);

  switch (mode) {
    case "directive":
      return `${verb} the energy levels between intro and outro in ${sectionDisplay}. ${second}`;
    case "observational":
      return `The outro in ${sectionDisplay} carries notably more energy than the intro. ${second}`;
    case "question":
      return `Would matching the outro energy closer to the intro in ${sectionDisplay} help DJ transitions? ${second}`;
    case "goal":
      return `For coherent set flow in ${sectionDisplay}, ${verb.toLowerCase()} the bookend energy levels. ${second}`;
    case "comparison":
      return `Intro and outro in ${sectionDisplay} sit at different energy levels. ${verb} them closer together for smoother mixing.`;
  }
}

function renderAudioVariation(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  // Extract the track descriptor from the compound issueType (e.g., "audio-variation:bass audio")
  const trackDescriptor = suggestion.issueType.includes(":")
    ? suggestion.issueType.split(":").slice(1).join(":")
    : "audio";

  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("audio-variation", hash);
  const strategyIdx = Math.abs((hash >>> 4) ^ (hash * 11));
  const strategy = SUGGESTION_DATA.audioVariation.strategies[strategyIdx % SUGGESTION_DATA.audioVariation.strategies.length]!;

  switch (mode) {
    case "directive":
      return `${verb} your ${trackDescriptor} track in ${sectionDisplay} by ${strategy}. ${second}`;
    case "observational":
      return `Your ${trackDescriptor} track repeats unchanged across ${sectionDisplay}. Consider ${strategy}.`;
    case "question":
      return `Could ${strategy} in ${sectionDisplay} give your ${trackDescriptor} track more life? ${second}`;
    case "goal":
      return `To break the repetition in your ${trackDescriptor} track at ${sectionDisplay}, try ${strategy}. ${second}`;
    case "comparison":
      return `Your ${trackDescriptor} track sounds identical across ${sectionDisplay}. ${verb} it by ${strategy}.`;
  }
}

function renderFrequencyBalance(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  // Extract the specific balance issue from the compound issueType
  // e.g., "freq-balance:sub-bass-low", "freq-balance:drum-density-low", "freq-balance:mid-low"
  // An optional ":no-audio" suffix indicates audio data was unavailable
  const rawDetail = suggestion.issueType.includes(":")
    ? suggestion.issueType.split(":").slice(1).join(":")
    : "frequency-imbalance";

  const noAudioData = rawDetail.endsWith(":no-audio");
  const detail = noAudioData ? rawDetail.replace(":no-audio", "") : rawDetail;
  const audioDisclaimer = noAudioData ? " (based on MIDI data only — audio was not analyzed)" : "";

  const genreName = profile?.name ?? null;
  const mode = selectFramingMode(framingHash);
  const second = selectSecondSentence("freq-balance", hash);

  if (detail === "sub-bass-low") {
    const genreRef = genreName ? ` for ${genreName.toLowerCase()}` : "";
    switch (mode) {
      case "directive":
        return `${verb} the sub-bass in ${sectionDisplay} — your low end is lighter than typical${genreRef}.${audioDisclaimer} ${second}`;
      case "observational":
        return `Your sub-bass energy is low${genreRef} in ${sectionDisplay}. Consider layering a sub under your bass track.${audioDisclaimer}`;
      case "question":
        return `Is your sub-bass present enough in ${sectionDisplay}? It reads below typical levels${genreRef}.${audioDisclaimer} ${second}`;
      case "goal":
        return `To match the expected low-end weight${genreRef}, reinforce the sub-bass in ${sectionDisplay}.${audioDisclaimer} ${second}`;
      case "comparison":
        return `Bass weight is lighter than typical${genreRef} in ${sectionDisplay}. ${verb} the low end with a sub layer.${audioDisclaimer}`;
    }
  }

  if (detail === "sub-bass-low-agnostic") {
    switch (mode) {
      case "directive":
        return `${verb} the low end in ${sectionDisplay} — your sub-bass is noticeably absent compared to other frequency ranges.${audioDisclaimer} ${second}`;
      case "observational":
        return `Your arrangement in ${sectionDisplay} lacks low-end presence. Consider adding sub-bass weight.${audioDisclaimer}`;
      case "question":
        return `Could ${sectionDisplay} benefit from more low-end weight? The sub-bass seems underrepresented.${audioDisclaimer} ${second}`;
      case "goal":
        return `To fill out the frequency spectrum in ${sectionDisplay}, add some sub-bass presence.${audioDisclaimer} ${second}`;
      case "comparison":
        return `The low end in ${sectionDisplay} is noticeably thinner than the rest of the spectrum. ${verb} sub-bass weight.${audioDisclaimer}`;
    }
  }

  if (detail === "drum-density-low") {
    const genreRef = genreName ? ` for ${genreName.toLowerCase()}` : "";
    switch (mode) {
      case "directive":
        return `${verb} the rhythmic density in ${sectionDisplay} — your drum transients are sparse${genreRef}. ${second}`;
      case "observational":
        return `Your drum loop has sparse transients${genreRef} in ${sectionDisplay}. Consider layering percussion elements. ${second}`;
      case "question":
        return `Could your drums in ${sectionDisplay} use more rhythmic activity? They're less busy than typical${genreRef}. ${second}`;
      case "goal":
        return `To match the expected rhythmic density${genreRef}, add percussion layers in ${sectionDisplay}. ${second}`;
      case "comparison":
        return `This drum track is less busy than typical${genreRef} in ${sectionDisplay}. Adding percussion layers could fill the groove. ${second}`;
    }
  }

  // Generic frequency band deviation (e.g., "bass-low", "mid-low", "highMid-low")
  const bandName = detail.replace("-low", "");
  const genreRef = genreName ? ` for ${genreName.toLowerCase()}` : "";
  switch (mode) {
    case "directive":
      return `${verb} the ${bandName} range in ${sectionDisplay}${genreRef}.${audioDisclaimer} ${second}`;
    case "observational":
      return `The ${bandName} frequency range is below expected levels${genreRef} in ${sectionDisplay}.${audioDisclaimer} ${second}`;
    case "question":
      return `Is your ${bandName} content in ${sectionDisplay} present enough${genreRef}?${audioDisclaimer} ${second}`;
    case "goal":
      return `To achieve better frequency balance${genreRef}, boost the ${bandName} range in ${sectionDisplay}.${audioDisclaimer} ${second}`;
    case "comparison":
      return `The ${bandName} range is lighter than typical${genreRef} in ${sectionDisplay}. ${verb} content in that range.${audioDisclaimer}`;
  }
}

function renderGenericIssue(
  suggestion: RawSuggestion,
  profile: GenreProfile | null,
  sectionDisplay: string,
  verb: string,
  transitionTerm: string,
  hash: number,
  framingHash: number,
): string {
  const barInfo = formatBarRange(suggestion.barRange);
  const mode = selectFramingMode(framingHash);

  switch (mode) {
    case "directive":
      return `${verb} adjustments in ${sectionDisplay} ${barInfo} to improve arrangement flow.`;
    case "observational":
      return `${sectionDisplay} ${barInfo} could benefit from some attention to improve the overall flow.`;
    case "question":
      return `Could ${sectionDisplay} ${barInfo} use some refinement? ${verb} adjustments to improve the flow.`;
    case "goal":
      return `To strengthen the arrangement in ${sectionDisplay} ${barInfo}, ${verb.toLowerCase()} the current approach.`;
    case "comparison":
    default:
      return `${sectionDisplay} ${barInfo} feels like it needs something. ${verb} adjustments to improve the arrangement flow.`;
  }
}

// ─── Helper Functions ──────────────────────────────────────────────────

/**
 * Compute a deterministic hash from the suggestion input.
 * Used for vocabulary rotation — ensures varied output for different inputs
 * while remaining deterministic for the same input.
 */
function computeInputHash(suggestion: RawSuggestion): number {
  const str = `${suggestion.issueType}:${suggestion.sectionName}:${suggestion.barRange.start}:${suggestion.barRange.end}:${suggestion.severity}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/**
 * Select a leading verb based on issue type and hash for rotation.
 * Supports prefix matching for compound types (e.g., "audio-variation:bass audio").
 */
function selectLeadingVerb(issueType: string, hash: number): string {
  let verbs: readonly string[] | undefined;
  if (Object.hasOwn(SUGGESTION_DATA.leadingVerbs, issueType)) {
    verbs = SUGGESTION_DATA.leadingVerbs[issueType]!;
  } else {
    const prefix = issueType.split(":")[0]!;
    if (Object.hasOwn(SUGGESTION_DATA.leadingVerbs, prefix)) {
      verbs = SUGGESTION_DATA.leadingVerbs[prefix]!;
    }
  }
  if (!verbs) verbs = SUGGESTION_DATA.audioVariation.genericVerbs;
  return verbs[hash % verbs.length]!;
}

/**
 * Select a rotating second sentence for a given issue type.
 * Uses a shifted hash to avoid correlation with verb selection.
 * Supports prefix matching for compound types (e.g., "audio-variation:bass audio").
 */
function selectSecondSentence(issueType: string, hash: number): string {
  let pool: readonly string[] | undefined;
  if (Object.hasOwn(SUGGESTION_DATA.secondSentences, issueType)) {
    pool = SUGGESTION_DATA.secondSentences[issueType];
  } else {
    const prefix = issueType.split(":")[0]!;
    if (Object.hasOwn(SUGGESTION_DATA.secondSentences, prefix)) {
      pool = SUGGESTION_DATA.secondSentences[prefix];
    }
  }
  if (!pool || pool.length === 0) {
    return "";
  }
  // Use a different hash rotation than verbs to avoid locking choices together
  const shifted = Math.abs((hash >>> 3) ^ (hash * 7));
  return pool[shifted % pool.length]!;
}

/**
 * Select a transition term from the profile's preferred transitions,
 * or fall back to generic terminology.
 */
function selectTransitionTerm(profile: GenreProfile | null, hash: number): string {
  const terms = (profile?.transitions?.preferred?.length ?? 0) > 0
    ? profile!.transitions.preferred
    : SUGGESTION_DATA.audioVariation.genericTransitions;
  const term = terms[hash % terms.length]!;
  return formatTransitionName(term);
}

/**
 * Format a transition identifier into human-readable text.
 * Converts "filter_sweep" → "filter sweep", "drum_fill" → "drum fill".
 */
function formatTransitionName(name: string): string {
  return name.replace(/_/g, " ");
}

/**
 * Resolve a section name using genre profile structure names when matching.
 * If the profile defines a structure section whose name case-insensitively
 * matches the suggestion's sectionName, use the profile's version.
 * Falls back to the raw section name or "this section" if empty.
 */
function resolveSectionName(sectionName: string, profile: GenreProfile | null): string {
  if (!sectionName || sectionName.trim().length === 0) {
    return "this section";
  }

  if (profile?.structure) {
    const lowerName = sectionName.toLowerCase();
    const match = profile.structure.find(
      (s) => s.name.toLowerCase() === lowerName,
    );
    if (match) {
      return match.name;
    }
  }

  return sectionName;
}

/**
 * Select a variation technique term based on genre family or generic fallback.
 * Uses genre-specific technique libraries when available, with the expanded
 * generic pool as fallback.
 */
export function selectVariationTechnique(profile: GenreProfile | null, hash: number): string {
  // Try genre-specific techniques first
  if (profile?.family) {
    const genreTechniques = SUGGESTION_DATA.genreTechniques[profile.family];
    if (genreTechniques && genreTechniques.length > 0) {
      // Use shifted hash so technique choice is independent of verb choice
      const shifted = Math.abs((hash >>> 5) ^ (hash * 13));
      return genreTechniques[shifted % genreTechniques.length]!;
    }
  }

  // Fallback to expanded generic pool
  const shifted = Math.abs((hash >>> 5) ^ (hash * 13));
  return SUGGESTION_DATA.variationTechniques.techniques[shifted % SUGGESTION_DATA.variationTechniques.techniques.length]!;
}

/**
 * Format a bar range for display.
 */
function formatBarRange(barRange: { readonly start: number; readonly end: number }): string {
  if (barRange.start === barRange.end) {
    return `(bar ${barRange.start})`;
  }
  return `(bars ${barRange.start}–${barRange.end})`;
}
