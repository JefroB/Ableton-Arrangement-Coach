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

const FRAMING_MODES: readonly FramingMode[] = [
  "directive",
  "observational",
  "question",
  "goal",
  "comparison",
];

function selectFramingMode(framingHash: number): FramingMode {
  return FRAMING_MODES[framingHash % FRAMING_MODES.length]!;
}

// ─── Vocabulary Sets ───────────────────────────────────────────────────

/** Leading verbs for different issue types, rotated by hash. */
const LEADING_VERBS: Record<string, readonly string[]> = {
  "flat-energy": ["Introduce", "Add", "Layer in", "Bring in", "Build up", "Try removing elements before", "Evolve", "Morph"],
  "missing-transition": ["Add", "Insert", "Place", "Include", "Layer", "Weave in", "Set up", "Create"],
  "repetition": ["Vary", "Differentiate", "Reshape", "Rework", "Transform", "Evolve", "Reimagine", "Twist"],
  "abrupt-change": ["Smooth", "Ease", "Prepare", "Soften", "Bridge", "Cushion", "Anticipate", "Telegraph"],
  "frequency-crowding": ["Thin out", "Separate", "Clear", "Reduce", "Carve space in", "Pare down", "Simplify", "Open up"],
  "intro-length": ["Extend", "Lengthen", "Expand", "Stretch", "Grow", "Develop", "Build out", "Give more room to"],
  "outro-length": ["Extend", "Lengthen", "Expand", "Stretch", "Grow", "Develop", "Build out", "Give more room to"],
  "intro-energy": ["Lower", "Reduce", "Pull back", "Dial down", "Soften", "Strip back", "Simplify", "Calm"],
  "energy-mismatch": ["Balance", "Match", "Align", "Adjust", "Bring closer", "Reconcile", "Even out", "Harmonize"],
  "audio-variation": ["Vary", "Process", "Transform", "Rework", "Automate", "Resample", "Evolve", "Modulate"],
  "freq-balance": ["Reinforce", "Boost", "Add", "Layer in", "Beef up", "Strengthen", "Fill out", "Support"],
};

/** Fallback verbs for unknown issue types. */
const GENERIC_VERBS: readonly string[] = ["Consider", "Try", "Adjust", "Revisit", "Evaluate", "Experiment with", "Rethink", "Explore"];

/** Generic electronic music terminology for transition elements. */
const GENERIC_TRANSITIONS: readonly string[] = [
  "riser",
  "build",
  "sweep",
  "tension element",
  "fill",
  "reverse hit",
  "noise swell",
  "filter automation",
  "delay throw",
  "snare acceleration",
];

// ─── Second-Sentence Pools (Rotating Explanations) ─────────────────────

const SECOND_SENTENCES: Record<string, readonly string[]> = {
  "flat-energy": [
    "Without movement here, the listener's attention may drift.",
    "A plateau this long can stall the track's momentum.",
    "Some evolution — even subtle — would keep things progressing.",
    "Flat stretches work in ambient, but this genre expects more forward motion.",
    "The lack of change makes this section feel longer than it is.",
  ],
  "missing-transition": [
    "The energy shift arrives without warning, which can feel jarring.",
    "A bridging element would give the listener time to adjust.",
    "Right now the sections collide rather than flow into each other.",
    "Preparation makes the payoff feel intentional rather than accidental.",
    "Even a short 2-bar lead-in would smooth this boundary.",
  ],
  "repetition": [
    "The listener has already heard this — give them a reason to stay engaged.",
    "Repetition can be hypnotic, but here it risks feeling like a copy-paste.",
    "Small changes compound: even one swapped element shifts perception.",
    "The ear notices patterns quickly — a subtle twist keeps things fresh.",
    "Differentiation doesn't need to be dramatic; a texture swap or filter move works.",
  ],
  "abrupt-change": [
    "The jump lands without preparation, which can break immersion.",
    "Anticipation makes the arrival feel earned rather than sudden.",
    "A short buildup would frame this change as intentional.",
    "Without a bridge, the energy shift feels accidental.",
    "Listeners need a few bars to recalibrate when energy changes this much.",
  ],
  "frequency-crowding": [
    "When too many elements share the same range, nothing cuts through clearly.",
    "Spectral competition reduces the impact of every element involved.",
    "Removing or filtering one layer would let the others breathe.",
    "Clarity often comes from subtraction, not addition.",
    "Each element needs its own space to be heard distinctly.",
  ],
  "intro-length": [
    "A longer intro gives DJs time to blend and build the mix.",
    "Short intros make it difficult for DJs to find a clean entry point.",
    "In a DJ set, tracks need breathing room at the start.",
    "More intro space lets the track establish its world before committing.",
    "DJs need at least 16 bars to work with for smooth transitions.",
  ],
  "outro-length": [
    "A longer outro gives DJs time to mix out gracefully.",
    "Short outros force abrupt cuts in a live mix.",
    "The outro is your track's handshake with the next — give it space.",
    "DJs appreciate a clear runway for exiting a track.",
    "More outro bars let the track wind down without feeling chopped.",
  ],
  "intro-energy": [
    "High intro energy makes it hard for DJs to blend in smoothly.",
    "Starting too hot leaves nowhere to build toward.",
    "A quieter start creates a natural ramp into the track's energy.",
    "The intro should invite the listener in, not overwhelm immediately.",
    "Pulling back here gives the main sections more impact by contrast.",
  ],
  "energy-mismatch": [
    "Mismatched bookends make DJ transitions unpredictable.",
    "When outro energy exceeds intro energy, the next track's entrance fights for space.",
    "Balanced start and end energy helps DJs create seamless sets.",
    "Think of intro and outro as the handshake with adjacent tracks in a set.",
    "Symmetrical energy endpoints keep the mix coherent.",
  ],
  "audio-variation": [
    "Looped audio without processing changes can fatigue the listener quickly.",
    "Even subtle filter movement or automation gives the ear something new to latch onto.",
    "Audio repetition is more noticeable than MIDI repetition because the timbre is frozen.",
    "A sample swap or processing variation here would break the loop-like feel.",
    "Unchanged audio across multiple sections risks sounding like a placeholder.",
  ],
  "freq-balance": [
    "Genre conventions guide listener expectations about frequency balance.",
    "The right low-end weight anchors the groove and supports the energy.",
    "Frequency gaps can leave the arrangement feeling thin or hollow.",
    "Matching genre-typical spectral balance helps your track sit well in a DJ set.",
    "Low-end presence defines the physical impact on a club system.",
  ],
};

// ─── Variation Technique Pools ─────────────────────────────────────────

/**
 * Expanded technique pool organized by approach.
 * Includes additions, subtractions, evolutions, and arrangement moves.
 */
export const VARIATION_TECHNIQUES: readonly string[] = [
  // Automation
  "gradual filter cutoff automation",
  "send level evolution over 16 bars",
  "pan position modulation on the hats",
  "resonance sweep into the breakdown",
  "reverb send automation on the lead",
  "lfo-driven filter movement on pads",
  "a sudden filter open on the drop",
  "delay feedback swell over 8 bars",
  "volume ducking automation for clarity",
  "pitch drift automation on the bass",
  // Addition
  "a new percussion layer",
  "a rhythmic counter-element",
  "a textural accent",
  "a call-and-response motif",
  // Subtraction
  "a brief element removal for contrast",
  "a stripped-back moment before rebuilding",
  "a muted bass section to reset energy",
  "a percussion dropout for breathing room",
  // Evolution
  "gradual filter movement",
  "increasing delay feedback",
  "stereo width automation",
  "timbral morphing on the lead",
  "resonance movement on the bass",
  // Arrangement
  "a groove variation",
  "a different drum pattern",
  "a chord voicing change",
  "a bass rhythm shift",
  "a velocity or swing change",
  "a call-and-response vocal motif",
  "a percussion dropout for 4 bars",
  "a structural role swap between layers",
  "a muted bass section for contrast",
  "an element thinning pass before the drop",
  "a half-time drum pattern switch",
  "a section length variation for surprise",
  "a melodic counter-phrase in the second half",
  "a pad removal to expose the rhythm",
  "a delayed lead entry at bar 5",
  "a stripped-back bridge before the climax",
  // Sound Design
  "distortion automation",
  "reverb size evolution",
  "modulation depth increase",
  "transient shaping changes",
  "wavetable position morphing",
  "granular texture density shift",
  "fm synthesis ratio modulation",
  "additive harmonic emphasis change",
  "formant filter vowel sweep",
  "bitcrusher sample rate reduction",
  "comb filter resonance tuning",
  "ring modulation frequency drift",
  // Rhythm
  "a ghost note pattern on the snare",
  "a triplet subdivision layer",
  "a polyrhythmic percussion element",
  "syncopated kick displacement",
  "a half-time rhythm variation",
  "a double-time hat pattern",
  "an off-grid swing adjustment",
  "a displaced snare accent pattern",
  "a rhythmic rest for tension",
  "a dotted-note delay rhythm",
  // Harmony
  "a chord voicing inversion",
  "a suspended chord resolution",
  "modal interchange borrowed chord",
  "a chromatic passing tone melody",
  "parallel harmony movement",
  "a pedal tone underneath the chords",
  "upper-structure triad voicing",
  "a minor-to-major shift for lift",
  "a secondary dominant resolution",
  "a tritone substitution chord",
  // FX
  "a reverse reverb tail before the downbeat",
  "a ping-pong delay throw on the vocal",
  "bit-crush automation on the drum bus",
  "a tape stop effect at the phrase end",
  "a stutter edit on the lead synth",
  "a chorus depth sweep on the pad layer",
  "a flanger feedback rise into the drop",
  "a phaser rate automation over 8 bars",
  "a granular freeze effect on the vocal",
  "a shimmer reverb swell behind the melody",
  // Dynamics
  "a sidechain depth increase on the pad",
  "a volume swell into the chorus",
  "compression ratio automation on the bus",
  "a transient boost on the snare layer",
  "a limiter ceiling drop for contrast",
  "dynamic range expansion in the verse",
  "parallel compression blend automation",
  "a volume fade-out before the breakdown",
  "an envelope follower on the bass group",
  // Stereo Image
  "a mono-to-stereo expansion on the synth",
  "a haas effect on the percussion bus",
  "mid-side eq adjustment on the master",
  "a stereo narrowing before the drop",
  "a panning sweep on the arpeggiated line",
  "a wide chorus spread on the pad layer",
  "mono bass with stereo high-end split",
  "stereo field rotation on the texture",
  "a mid-side reverb balance shift",
  // Texture
  "a vinyl crackle layer underneath",
  "a granular pad layer in the background",
  "a noise sweep rising into the chorus",
  "a tape hiss texture for added warmth",
  "a foley percussion loop for organic feel",
  "a spectral freeze texture on the vocal",
  "an ambient field recording bed beneath",
  "a bitcrushed texture fading in slowly",
  "a metallic resonance drone underneath",
  // Groove
  "a swing amount increase on the hi-hats",
  "a velocity humanization pass on drums",
  "a shuffle pattern on the percussion",
  "a micro-timing offset on the snare hit",
  "a groove template change for the verse",
  "a triplet ghost note layer on the kick",
  "a laid-back timing shift on the bass",
  "a syncopated accent pattern on the hats",
  "a push-pull timing feel on the chords",
];

/** Genre-specific technique suggestions keyed by genre family. */
export const GENRE_TECHNIQUES: Record<string, readonly string[]> = {
  techno: [
    // Existing entries
    "a percussion substitution",
    "hat pattern evolution",
    "a dub delay throw",
    "filter resonance movement",
    "kick layering variation",
    "a noise texture shift",
    // Sound Design
    "industrial noise layer with distortion",
    "acid squelch pattern on the 303 line",
    "metallic clang percussion design",
    "resampled kick with added harmonics",
    "granular drone texture underneath",
    // Rhythm
    "hypnotic loop micro-timing shift",
    "polymetric percussion overlay",
    "syncopated rimshot displacement",
    "tribal tom pattern in the breakdown",
    // FX
    "tape delay feedback on the stab",
    "spring reverb hit on the clap",
    "bitcrushed percussion send effect",
    "a dub siren sweep into the drop",
    // Arrangement
    "a 4-bar percussion-only bridge",
    "a stripped-back kick loop moment",
    "an element rotation every 16 bars",
    "hard cut transition between loops",
    // Texture
    "an industrial machine room ambience",
    "a dark sub-bass drone layer",
    "atmospheric hiss building tension",
    "modular feedback patch as texture",
  ],
  trance: [
    // Existing entries
    "supersaw detune modulation",
    "an arp octave shift",
    "a gated pad variation",
    "an uplifter stack",
    "a harmonic key lift",
    "snare acceleration into the drop",
    // Sound Design
    "layered supersaw chord stack",
    "acid 303 bassline modulation",
    "psychedelic granular texture layer",
    "formant-shifted vocal synth patch",
    "detuned saw lead with chorus",
    // Arrangement
    "a 32-bar breakdown pad progression",
    "a silence gap before the main drop",
    "a stripped-back kick intro section",
    "a second climax with added layers",
    // FX
    "a reverse cymbal into the breakdown",
    "white noise riser over 16 bars",
    "a pitch-shifted vocal sweep upward",
    // Dynamics
    "sidechain-gated pad pumping effect",
    "a crash cymbal marking each 8 bars",
    // Rhythm
    "rolling 16th-note bassline pattern",
    "triplet hi-hat pattern for drive",
    // Harmony
    "an anthem melody in minor key",
    "a key change lift in the final drop",
    "a breakdown piano chord sequence",
  ],
  house: [
    // Existing entries
    "a vocal chop variation",
    "a bass groove change",
    "a conga or percussion layer",
    "a piano fill",
    "a call-and-response vocal element",
    "an organ stab swap",
    // Sound Design
    "a filtered disco sample loop",
    "a phased chord stab with sidechain",
    "a french touch filter sweep on chords",
    "a lo-fi saturated drum loop layer",
    // Rhythm
    "a 2-step kick pattern variation",
    "a shuffled hi-hat groove change",
    "a syncopated shaker loop addition",
    "a jackin house drum swap",
    // Arrangement
    "a percussion-only breakdown bridge",
    "a stripped-back vocal a cappella drop",
    "an organ solo over the groove",
    // FX
    "a dub delay throw on the vocal chop",
    "a tape stop effect on the bass hit",
    // Dynamics
    "a sidechain pump depth increase",
    "a volume swell on the pad entry",
    // Texture
    "a vinyl crackle bed under the groove",
    "a warm tape hiss layer for depth",
  ],
  "drum-and-bass": [
    // Existing entries
    "a breakbeat variation",
    "reese bass modulation",
    "an amen chop rearrangement",
    "mid-range stab variation",
    "a half-time switch",
    "sub bass pitch movement",
    // Sound Design
    "a neurofunk bass patch redesign",
    "a resampled reese layer with distortion",
    "a granular break texture underneath",
    "fm synthesis bass modulation sweep",
    // Rhythm
    "a jungle-style break chop pattern",
    "a ghost snare roll across 4 bars",
    "a double-time hat pattern switch",
    "a syncopated rimshot displacement",
    // Arrangement
    "a silence gap before the drop entry",
    "a stripped drum intro for dj mixing",
    "a roller bass pattern for 16 bars",
    // FX
    "a reverse cymbal into the breakdown",
    "a delay throw on the vocal sample",
    // Dynamics
    "a snare rush building to the drop",
    "a sub drop sweep into the main bass",
    // Harmony
    "a liquid piano chord over the break",
    "a pad swell during the breakdown",
  ],
  "ambient-downtempo": [
    // Existing entries
    "a texture evolution",
    "granular density change",
    "pad chord inversion",
    "field recording swap",
    "reverb space modulation",
    "slow filter drift",
    // Sound Design
    "a spectral freeze on the pad layer",
    "granular cloud processing on vocals",
    "a wavetable drone morphing slowly",
    "a formant-shifted texture bed",
    // Texture
    "a field recording layer from nature",
    "a tape loop degradation effect",
    "a shimmer reverb tail as texture",
    "a lo-fi vinyl surface noise bed",
    // Arrangement
    "a long cross-fade between sections",
    "a silence breath between movements",
    "an evolving drone underneath for 32 bars",
    // FX
    "a cascading delay texture on the pad",
    "an infinite reverb swell on a note",
    // Dynamics
    "a slow volume fade-in over 16 bars",
    "a gentle compression release shift",
    // Harmony
    "a suspended chord held for 8 bars",
    "a modal drift between phrases",
  ],
  "melodic-techno-progressive": [
    // Automation
    "a slow filter sweep over 16 bars",
    "arpeggio cutoff modulation evolving gradually",
    "reverb send growth across the build section",
    "delay feedback rising into the breakdown",
    // Arrangement
    "a 32-bar breakdown with stripped percussion",
    "a melodic hook introduced at the second drop",
    "a gradual element layering over 16 bars",
    "a pad-only bridge before the main groove",
    // Sound Design
    "a pluck synth melody with long reverb tail",
    "organic percussion textures from foley hits",
    "an evolving pad morphing through chord tones",
    "a granular vocal texture as melodic element",
    // Rhythm
    "a shaker pattern building in the intro",
    "a conga accent pattern under the groove",
    "ride cymbal 16th-note pattern for drive",
    "a subtle tom fill every 8 bars",
    // Harmony
    "a minor key arpeggio over sustained chords",
    "a chord progression shifting every 16 bars",
    "a root note pedal tone under moving chords",
    "an emotional chord lift in the final drop",
    // FX
    "a long reverb tail swelling before re-entry",
    "a pitch riser building over 8 bars slowly",
    // Dynamics
    "a progressive sidechain depth increase",
    "a pad volume swell into the drop",
    // Stereo Image
    "a wide arpeggio spread in the stereo field",
    // Texture
    "a field recording bed of water or forest",
    "an analog warmth layer on the master bus",
  ],
  "synthwave-darkwave": [
    // Sound Design
    "a retro analog lead sweep with portamento",
    "a detuned saw chord stack with chorus",
    "a darksynth bass layer with distortion",
    "a juno-style arpeggio sequence variation",
    "a warm analog pad swell with slow attack",
    // Rhythm
    "a gated reverb snare pattern variation",
    "a linndrum-style drum machine pattern",
    "an electronic tom fill every 8 bars",
    "a driving hi-hat 16th-note push",
    "a half-time breakbeat under the synth lead",
    // FX
    "a vhs tape warble effect on the chords",
    "an analog chorus depth sweep on the pad",
    "a spring reverb hit on the snare layer",
    "a tape delay throw on the lead melody",
    "a bit-reduced lo-fi texture layer",
    // Automation
    "a filter cutoff rise over the verse build",
    "a slow pitch bend on the bass sequence",
    "a portamento glide time modulation",
    "a pulse-width modulation sweep on the lead",
    // Arrangement
    "a synth solo bridge section for dynamics",
    "a stripped drum-and-bass breakdown moment",
    "an arpeggio pattern shift between sections",
    // Harmony
    "a minor key chord progression with 7ths",
    "a power chord entry for the final chorus",
    // Texture
    "a neon-lit pad atmosphere underneath",
    "a metallic industrial noise bed for tension",
  ],
  "hardcore-bouncy": [
    // Sound Design
    "gabber kick layering with added distortion",
    "hoover bass patch with pitch modulation",
    "donk pitch modulation on the off-beat",
    "a resampled kick with extra saturation",
    "a distorted stab chord with fast decay",
    // Rhythm
    "speedcore kick roll acceleration pattern",
    "a syncopated gabber tom fill pattern",
    "bouncy kick pattern with off-beat accent",
    "a frenchcore snare roll across 4 bars",
    "a double-time kick pattern for intensity",
    // FX
    "a psychotropic riser sweep into the drop",
    "a reverse bass sweep building tension",
    "a bitcrushed vocal sample chop effect",
    "a hard-cut silence gap before re-entry",
    // Arrangement
    "a 4-bar kick-only bridge for impact",
    "an mc vocal tag marking the transition",
    "a stripped percussive intro for dj mixing",
    "a raw kick solo section for 8 bars",
    // Dynamics
    "a distorted snare rush into the climax",
    "a compressed kick bus for extra punch",
    "a hard limiter slam on the master chain",
    // Texture
    "an industrial noise texture underneath",
    "a metallic resonance hit on each bar",
    "a harsh white noise burst before the drop",
  ],
  "footwork-juke": [
    // Rhythm
    "triplet hi-hat pattern with ghost accents",
    "polyrhythmic kick and snare displacement",
    "a half-time kick groove at 160 bpm",
    "syncopated 32nd-note hat roll pattern",
    "a rapid-fire triplet percussion sequence",
    "a double-time hat burst every 4 bars",
    // Vocal / Sample Manipulation
    "a pitched vocal chop stutter sequence",
    "rapid vocal sample trigger every 2 bars",
    "a chopped soul vocal as rhythmic layer",
    "a time-stretched vocal phrase repetition",
    "a pitched-down vocal stab on the offbeat",
    // Sound Design
    "chicago juke 808 sub bass hit pattern",
    "a detuned lo-fi synth stab texture",
    "a resampled drum break with bitcrushing",
    "a teklife-style granular pad shimmer",
    // FX
    "tempo-synced stutter edit on the snare hit",
    "a hard-cut sample chop at the transition",
    "a reverse hit before the pattern switch",
    "a beat-repeat glitch on the vocal sample",
    // Arrangement
    "a 2-bar drum strip for tension reset",
    "a sample rotation every 8 bars for variety",
    "a pattern switch using new vocal trigger",
    // Dynamics
    "a kick dropout for 4 bars then re-entry",
  ],
  "electro-breakbeat": [
    // Rhythm
    "syncopated 808 breakbeat pattern variation",
    "nu-skool break roll with increasing density",
    "an off-beat kick displacement for groove",
    "a shuffled breakbeat chop rearrangement",
    "a double-time break pattern for intensity",
    // Sound Design
    "detroit electro stab chord with fast decay",
    "a vocoder phrase layered over the break",
    "electro-funk bass slide with portamento",
    "a talk-box synth melody over 8 bars",
    "an analog 808 cowbell accent pattern",
    // FX
    "a spring reverb hit on the clap layer",
    "a dub delay throw on the vocoder line",
    "a bitcrushed break loop as texture layer",
    "a filter sweep on the synth stab phrase",
    // Automation
    "a resonance rise on the bass sequence",
    "pulse-width modulation on the lead synth",
    "a slow cutoff sweep on the break loop",
    "portamento glide time shift on the bass",
    // Arrangement
    "a stripped 808 pattern only bridge",
    "a vocoder solo section for 8 bars",
    "a break switch between halves of the drop",
    "an element rotation every 8 bars",
    // Texture
    "a sci-fi arpeggio layer underneath",
    "a futuristic pad wash behind the groove",
  ],
  "idm-experimental": [
    // Sound Design
    "glitch buffer effect on the main loop",
    "granular synthesis cloud from a vocal hit",
    "spectral freeze processing on the pad",
    "a fm feedback patch as rhythmic texture",
    "bitcrushed micro-sample collage layer",
    "a formant-resynthesis texture mutation",
    // Rhythm
    "a-periodic rhythm shift across 8 bars",
    "polymetric 5 over 4 percussion overlay",
    "euclidean rhythm pattern on the hi-hats",
    "complex time signature shift to 7-8",
    "a non-quantized timing feel on the drums",
    // Generative / Algorithmic
    "generative sequence mutation every 4 bars",
    "algorithmic note probability modulation",
    "a stochastic parameter drift on the synth",
    "a self-modulating patch routing change",
    "a markov chain melody variation layer",
    // FX
    "a buffer repeat glitch on the drum bus",
    "a granular scatter effect on the vocal",
    "a spectral blur wash behind the rhythm",
    "digital artifact noise burst as accent",
    "a convolution reverb with abstract impulse",
    // Arrangement
    "a non-linear section length variation",
    "an abrupt structural cut to silence",
    "a density threshold shift between parts",
    "an erratic automation curve as structure",
  ],
  "dubstep-bass": [
    // Sound Design
    "wobble lfo rate change on the bass",
    "growl bass resampling with distortion",
    "neuro bass patch with fm modulation",
    "riddim bass stab with short decay time",
    "a wavetable bass morph between drops",
    "vocal formant bass synthesis texture",
    "granular bass redesign for the second drop",
    "colour bass textural pad layering",
    // Rhythm
    "halftime drum pattern in the breakdown",
    "a syncopated snare roll into the drop",
    "double-time hi-hat burst for intensity",
    "a half-time to full-time drum switch",
    "a triplet kick pattern under the bass",
    // Arrangement
    "a silence gap before the bass re-entry",
    "a mid-drop bass patch switch at bar 16",
    "a stripped vocal bridge before drop 2",
    "a tearout section with chaotic layering",
    // FX
    "a pitch-rising riser over 8 bars",
    "a reverse sub sweep into the drop hit",
    "a bitcrushed snare fill before re-entry",
    "a delay throw on the vocal chop layer",
    // Dynamics
    "a sub drop sweep building low-end tension",
    "a compressed drum bus slam for punch",
    "a sidechain gate on the mid-bass layer",
    // Texture
    "dark atmospheric pad under the intro",
    "metallic foley hits as percussion accent",
  ],
  "hiphop-trap": [
    // Sound Design
    "an 808 slide pattern with chromatic glide",
    "a distorted 808 layer for extra grit",
    "a melodic bell loop for the hook section",
    "a lo-fi piano chop with vinyl texture",
    "a plugg-style flute melody variation",
    // Rhythm
    "hi-hat roll density increase at the hook",
    "a triplet hi-hat pattern for bounce",
    "a boom bap drum break for contrast",
    "a drill-style sliding 808 bass pattern",
    "a syncopated rimshot accent variation",
    "a cowbell 16th-note pattern for phonk",
    "a ghost snare layer for groove depth",
    // Arrangement
    "vocal chop arrangement in the chorus",
    "a beat switch at the bridge section",
    "a tag-only intro before the verse drops",
    "a melody dropout before the hook entry",
    // FX
    "a tape stop on the snare layer",
    "a reverse 808 sweep into the new section",
    "a vinyl scratch texture at the transition",
    "a lo-fi bitcrush on the sample loop",
    // Dynamics
    "a compressed vocal bus for extra presence",
    "a kick and 808 sidechain for clarity",
    // Texture
    "dark ambient pad layer under the verse",
    "rain or foley texture bed for atmosphere",
    "memphis vocal sample chop layer for grit",
  ],
  "pop-electronic": [
    // Sound Design
    "sidechain vocal pumping on synth chords",
    "synth pluck layers with staggered timing",
    "a supersaw build stacking into the chorus",
    "a processed vocal chop as melodic hook",
    "a bright arpeggiated synth pluck pattern",
    // Rhythm
    "a four-on-the-floor kick for dance energy",
    "a snap clap layer on the backbeat",
    "a syncopated bass pulse under the vocal",
    "a percussion loop with shaker and tamb",
    "a drum fill leading into the pre-chorus",
    // FX
    "a vocal throw with long delay tail",
    "a reverse reverb swell before the hook",
    "a stutter edit on the vocal phrase end",
    "a filter sweep riser into the final chorus",
    // Arrangement
    "a beat dropout before the chorus entry",
    "a post-chorus instrumental hook section",
    "a stripped pre-chorus building tension",
    "a key change lift for the final chorus",
    // Dynamics
    "a sidechain pump depth on the synth pad",
    "a compressed vocal bus for upfront presence",
    "a volume swell on the synth into chorus",
    // Automation
    "a filter open automation across the verse",
    "a rising pitch on the synth riser element",
  ],
  "african-latin-electronic": [
    // Rhythm
    "log drum syncopated pattern variation",
    "tamborzao rhythm with shifting accents",
    "afro tech percussion layer with congas",
    "gqom fractured kick and percussion grid",
    "a shaker 16th-note pattern for continuity",
    "a polyrhythmic djembe accent overlay",
    // Sound Design
    "amapiano log drum bass with warm tone",
    "baile funk 808 sub hit with fast decay",
    "a kalimba melody layer over the groove",
    "a rhodes piano stab with jazz voicings",
    "a deep sub bass following the log drum",
    // Arrangement
    "a spacious groove with element breathing room",
    "a percussion-only bridge for 8 bars",
    "a vocal chant entry marking the section",
    "a gradual element layering over 32 bars",
    // FX
    "a dub delay throw on the vocal hook",
    "a subtle filter open on the bass",
    "a spring reverb accent on the percussion",
    // Automation
    "a slow filter drift on the pad layer",
    "shaker intensity automation across sections",
    // Texture
    "an organic field recording bed underneath",
    "a warm analog saturation on the drum bus",
    // Dynamics
    "a gentle sidechain on the piano stab",
  ],
  "garage-uk-bass": [
    // Rhythm
    "a 2-step shuffle kick pattern variation",
    "skippy garage hi-hat syncopation pattern",
    "a broken beat swing shift between sections",
    "a double-time hat burst on the offbeat",
    "a uk funky tribal percussion accent",
    "a syncopated rim click groove pattern",
    // Sound Design
    "chopped vocal resampling with pitch shift",
    "sub bass modulation with slow lfo wobble",
    "a reese bass stab with filtered decay",
    "a pitched-up vocal chop as melodic hook",
    "a deep garage sub bass with long release",
    // FX
    "a dub delay throw on the vocal chop",
    "a reverb swell on the pitched vocal stab",
    "a tape stop effect on the bass hit",
    "a bass drop sweep before the groove entry",
    // Arrangement
    "a stripped 2-step intro for dj blending",
    "a vocal a cappella breakdown section",
    "a bass entry creating an energy step-up",
    "a percussion strip for tension reset",
    // Automation
    "a filter sweep on the reese bass layer",
    "a sub bass pitch drift across 4 bars",
    // Texture
    "a vinyl crackle texture over the groove",
    "a warm lo-fi hiss bed underneath the bass",
    // Dynamics
    "a sidechain pump on the bass chord stab",
  ],
};

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

/**
 * Audio-specific variation strategies used in renderAudioVariation.
 * Distinct from MIDI-centric suggestions — references sample/processing concepts.
 */
const AUDIO_VARIATION_STRATEGIES: readonly string[] = [
  "using a different sample or applying processing automation",
  "automating filter cutoff, reverb send, or distortion across these sections",
  "layering a variation or applying subtle pitch shifting for variety",
  "applying a different processing chain or automating wet/dry mix for movement",
  "chopping and rearranging the audio differently in later sections",
];

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
  const strategy = AUDIO_VARIATION_STRATEGIES[strategyIdx % AUDIO_VARIATION_STRATEGIES.length]!;

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
  if (Object.hasOwn(LEADING_VERBS, issueType)) {
    verbs = LEADING_VERBS[issueType]!;
  } else {
    const prefix = issueType.split(":")[0]!;
    if (Object.hasOwn(LEADING_VERBS, prefix)) {
      verbs = LEADING_VERBS[prefix]!;
    }
  }
  if (!verbs) verbs = GENERIC_VERBS;
  return verbs[hash % verbs.length]!;
}

/**
 * Select a rotating second sentence for a given issue type.
 * Uses a shifted hash to avoid correlation with verb selection.
 * Supports prefix matching for compound types (e.g., "audio-variation:bass audio").
 */
function selectSecondSentence(issueType: string, hash: number): string {
  let pool: readonly string[] | undefined;
  if (Object.hasOwn(SECOND_SENTENCES, issueType)) {
    pool = SECOND_SENTENCES[issueType];
  } else {
    const prefix = issueType.split(":")[0]!;
    if (Object.hasOwn(SECOND_SENTENCES, prefix)) {
      pool = SECOND_SENTENCES[prefix];
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
    : GENERIC_TRANSITIONS;
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
    const genreTechniques = GENRE_TECHNIQUES[profile.family];
    if (genreTechniques && genreTechniques.length > 0) {
      // Use shifted hash so technique choice is independent of verb choice
      const shifted = Math.abs((hash >>> 5) ^ (hash * 13));
      return genreTechniques[shifted % genreTechniques.length]!;
    }
  }

  // Fallback to expanded generic pool
  const shifted = Math.abs((hash >>> 5) ^ (hash * 13));
  return VARIATION_TECHNIQUES[shifted % VARIATION_TECHNIQUES.length]!;
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
