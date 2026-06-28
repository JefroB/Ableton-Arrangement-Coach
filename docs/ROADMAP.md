# Arrangement Coach — Development Roadmap

A living document tracking progress from inception to completion. Each milestone maps to one or more specs in `.kiro/specs/`.

## Status Key

- ⬜ Not started
- 🟡 In progress (spec exists, work underway)
- ✅ Complete
- 🚫 Blocked

---

## Milestone 1: Foundation

Get the extension running, reading data from Live, and displaying it in a basic UI.

| # | Task | Status | Spec |
|---|---|---|---|
| 1.1 | Project scaffolding (manifest, package.json, tsconfig, build, entry point) | ✅ | `m1-foundation` |
| 1.2 | Locator scanning — read cue points, build Section model | ✅ | `m1-foundation` |
| 1.3 | Track inventory — read tracks, classify by name/type | ✅ | `m1-foundation` |
| 1.4 | Basic webview UI — panel showing section list with names and bar ranges | ✅ | `m1-foundation` |
| 1.5 | Playhead tracking — resolve active section from song time | ✅ | `m1-foundation` |
| 1.6 | State store — central state with sections, active section, dispatching actions | ✅ | `m1-foundation` |
| 1.7 | Message protocol — backend ↔ webview typed messages | ✅ | `m1-foundation` |

**Done when**: Extension loads in Live, reads locators, shows a section list in the webview, highlights the active section as the playhead moves.

---

## Milestone 2: Section Analysis

Compute meaningful data per section and display it.

| # | Task | Status | Spec |
|---|---|---|---|
| 2.1 | Track activity per section — which tracks have clips in each time range | ✅ | `m2-section-analysis` |
| 2.2 | MIDI density analysis — notes per bar per section | ✅ | `m2-section-analysis` |
| 2.3 | Automation detection — flag clips with envelopes | ✅ | `m2-section-analysis` |
| 2.4 | Energy scoring — weighted model outputting 1–10 per section | ✅ | `m2-section-analysis` |
| 2.5 | Energy curve — array of scores visualized in UI | ✅ | `m2-section-analysis` |
| 2.6 | Track categorization — frequency bucket assignment by name/device | ✅ | `m2-section-analysis` |
| 2.7 | Genre selection — user picks a genre, stored in project state | ✅ | `m2-section-analysis` |
| 2.8 | Genre-adjusted energy weights — scoring model uses genre-specific weights | ✅ | `m2-section-analysis` |

**Done when**: Each section shows an energy score (genre-adjusted) and the UI displays an energy curve across the arrangement.

---

## Milestone 3: Issue Detection

Identify arrangement problems and surface them to the user.

| # | Task | Status | Spec |
|---|---|---|---|
| 3.1 | Flat energy detection — flag consecutive sections with < threshold delta | ✅ | `m3-issue-detection` |
| 3.2 | Missing transition detection — large energy jumps without transition elements | ✅ | `m3-issue-detection` |
| 3.3 | Repetition detection — consecutive sections with high structural similarity | ✅ | `m3-issue-detection` |
| 3.4 | Abrupt energy change detection — large jumps without genre-appropriate context | ✅ | `m3-issue-detection` |
| 3.5 | Frequency crowding heuristic — too many tracks in same frequency bucket | ✅ | `m3-issue-detection` |
| 3.6 | Genre-aware thresholds — issue severity/triggers adjust based on selected genre | ✅ | `m3-issue-detection` |
| 3.7 | Intro/outro analysis — flag DJ compatibility issues based on genre expectations | ✅ | `m3-issue-detection` |
| 3.8 | Issues panel in UI — display issues per section with severity and message | ✅ | `m3-issue-detection` |

**Done when**: The extension detects and displays genre-aware arrangement issues with actionable messages.

---

## Milestone 4: Transition Engine

Recommend transitions between sections.

| # | Task | Status | Spec |
|---|---|---|---|
| 4.1 | Transition recommendation logic — suggest types based on energy delta | ✅ | `m4-transition-engine` |
| 4.2 | Genre-aware transitions — adjust suggestion types based on genre conventions | ✅ | `m4-transition-engine` |
| 4.3 | Drop/breakdown-aware — detect drop boundaries and apply drop-specific suggestions | ✅ | `m4-transition-engine` |
| 4.4 | Transition panel in UI — show suggestion between each section boundary | ✅ | `m4-transition-engine` |
| 4.5 | Per-transition checklist — actionable items for implementing the suggestion | ✅ | `m4-transition-engine` |

**Done when**: Each section boundary shows a genre-aware transition recommendation with a checklist.

---

## Milestone 5: Notes & Checklist System

Let users add notes and complete checklists per section.

| # | Task | Status | Spec |
|---|---|---|---|
| 5.1 | User notes — add, edit, delete text notes per section | ✅ | `m5-notes-checklist` |
| 5.2 | Auto-generated checklist — per section based on analysis | ✅ | `m5-notes-checklist` |
| 5.3 | Checklist completion — toggle items, persist state | ✅ | `m5-notes-checklist` |
| 5.4 | Persistence — save notes/checklists per project (keyed to Set file path) | ✅ | `m5-notes-checklist` |
| 5.5 | Notes panel in UI — display and manage notes inline | ✅ | `m5-notes-checklist` |

**Done when**: Users can add notes, see auto-generated checklists, and complete items — all persisted across sessions.

---

## Milestone 6: Genre Profiles & Integration

Encode genre-specific knowledge into usable data and integrate across all systems. Each genre skill file defines the structural rules, energy curves, transitions, and detection heuristics — these profiles are the core engine that makes the entire analysis system genre-aware.

### 6A: Infrastructure

| # | Task | Status | Spec |
|---|---|---|---|
| 6A.1 | Genre profile data model — TypeScript types for structure, lengths, energy curves, transitions, rules | ✅ | `m6-genre-infrastructure` |
| 6A.2 | Genre registry — central registry loading all profiles, lookup by ID/subgenre | ✅ | `m6-genre-infrastructure` |
| 6A.3 | Subgenre variant system — per-profile subgenre overrides (e.g., Peak Time vs Minimal within Techno) | ✅ | `m6-genre-infrastructure` |
| 6A.4 | Genre selection UI — picker with subgenre drill-down, search, genre family grouping | ✅ | `m6-genre-infrastructure` |
| 6A.5 | Structural alignment scoring — compare arrangement against genre template | ✅ | `m6-genre-infrastructure` |
| 6A.6 | Genre-specific suggestion renderer — format messages using genre conventions | ✅ | `m6-genre-infrastructure` |
| 6A.7 | Archetype detection — auto-identify which arrangement archetype the track follows | ✅ | `m6-genre-infrastructure` |
| 6A.8 | Genre profile validation — unit tests ensuring profile completeness and consistency | ✅ | `m6-genre-infrastructure` |

### 6B: Genre Profile Implementation

Each task encodes the corresponding skill file into a runtime-loadable genre profile with arrangement rules, energy curves, transition preferences, and issue detection thresholds.

| # | Task | Status | Spec | Skill File |
|---|---|---|---|---|
| 6B.1 | Techno profile — Peak Time, Hard, Industrial, Minimal, Acid, Dub, Detroit, Hypnotic, Raw, Schranz, Ghettotech, Hardgroove, Birmingham | ✅ | `m6-genre-profiles` | `genre-techno.md` |
| 6B.2 | House profile — Deep, Tech, Progressive, Funky, Afro, Jackin, Soulful, UKG, Electro, Bass, Chicago, Ghetto, UK Funky, Gqom, French Touch, Lo-Fi, Future Garage | ✅ | `m6-genre-profiles` | `genre-house.md` |
| 6B.3 | Melodic Techno & Progressive profile — Melodic Techno, Progressive House, Organic House, Afro House, Indie Dance | ✅ | `m6-genre-profiles` | `genre-melodic-techno-progressive.md` |
| 6B.4 | Trance profile — Uplifting, Psytrance, Goa, Progressive Trance, Tech Trance, Vocal, Dark Psy, Forest | ✅ | `m6-genre-profiles` | `genre-trance.md` |
| 6B.5 | Drum & Bass profile — Liquid, Neurofunk, Jump-Up, Jungle, Classic Jungle, Halftime, Darkside, Minimal, Rollers, Dancefloor, Crossbreed, Atmospheric/Intelligent | ✅ | `m6-genre-profiles` | `genre-drum-and-bass.md` |
| 6B.6 | Dubstep & Bass profile — Riddim, Melodic Dubstep, Brostep, Tearout, UK Bass, Future Bass, Colour Bass, Wave | ✅ | `m6-genre-profiles` | `genre-dubstep-bass.md` |
| 6B.7 | Hip-Hop & Trap profile — Boom Bap, Trap, Lo-Fi, Phonk, Drill (UK/NY/Chicago), Cloud Rap, Memphis, Rage, Plugg | ✅ | `m6-genre-profiles` | `genre-hiphop-trap.md` |
| 6B.8 | Pop & Electronic profile — Synthpop, Electropop, Future Pop, Hyperpop, Dance Pop, K-Pop | ✅ | `m6-genre-profiles` | `genre-pop-electronic.md` |
| 6B.9 | Ambient & Downtempo profile — Ambient, Chillout, Trip-Hop, Downtempo, IDM, Dub, Lo-Fi House, Film Score | ✅ | `m6-genre-profiles` | `genre-ambient-downtempo.md` |
| 6B.10 | Synthwave & Darkwave profile — Synthwave, Retrowave, Outrun, Darkwave, Darksynth, Coldwave, Post-Punk, EBM, Witch House | ✅ | `m6-genre-profiles` | `genre-synthwave-darkwave.md` |
| 6B.11 | Hardcore & Bouncy profile — Gabber, Frenchcore, Donk, Breakcore, Hardstyle (Euphoric + Raw), Speedcore | ✅ | `m6-genre-profiles` | `genre-hardcore-bouncy.md` |
| 6B.12 | Footwork & Juke profile — Chicago Footwork, Juke, Teklife-style | ✅ | `m6-genre-profiles` | `genre-footwork-juke.md` |
| 6B.13 | IDM & Experimental profile — IDM, Glitch, Bubblegum Bass / Hyperpop Roots | ✅ | `m6-genre-profiles` | `genre-idm-experimental.md` |
| 6B.14 | Electro & Breakbeat profile — Classic Detroit Electro, Nu-Skool Breakbeat, Electro-Funk | ✅ | `m6-genre-profiles` | `genre-electro-breakbeat.md` |
| 6B.15 | African & Latin Electronic profile — Amapiano, Afro Tech, Baile Funk | ✅ | `m6-genre-profiles` | `genre-african-latin-electronic.md` |

### 6C: Integration & Cross-Cutting

| # | Task | Status | Spec |
|---|---|---|---|
| 6C.1 | Wire genre profiles into energy scoring (M2) — use genre-specific weights and ranges | ✅ | `m6-genre-infrastructure` |
| 6C.2 | Wire genre profiles into issue detection (M3) — use genre-specific thresholds and rules | ✅ | `m6-genre-infrastructure` |
| 6C.3 | Wire genre profiles into transition engine (M4) — use genre-specific transition preferences | ✅ | `m6-genre-infrastructure` |
| 6C.4 | Wire genre profiles into checklist generation (M5) — genre-aware checklist items | ✅ | `m6-genre-integration` |
| 6C.5 | Special parser modes — disable standard phrase detection for IDM, Glitch, Breakcore, Speedcore | ✅ | `m6-genre-integration` |
| 6C.6 | Non-4/4 detection — flag when genre expects non-standard rhythmic patterns (Electro, IDM, Footwork) | ✅ | `m6-genre-integration` |

**Done when**: All 15 genre profiles are encoded as runtime data, user can select any genre/subgenre, and all analysis systems (energy, issues, transitions, checklists) use genre context to adjust behavior. Special-case genres (IDM, Breakcore, etc.) have permissive parser modes that avoid false-positive issue flagging.

---

## Milestone 7: Reference Track Comparison

Compare arrangements against professional references.

| # | Task | Status | Spec |
|---|---|---|---|
| 7.1 | Reference track detection — find track by name pattern | ✅ | `m7-reference-tracks` |
| 7.2 | Structural comparison — section proportions, timing, duration | ✅ | `m7-reference-tracks` |
| 7.3 | Reference UI — delta indicators, comparison overlay | ✅ | `m7-reference-tracks` |

**Done when**: User can drop a reference track into their Set and see how their arrangement compares structurally.

---

## Milestone 8: Polish & UX

Refine the experience for daily production use.

| # | Task | Status | Spec |
|---|---|---|---|
| 8.1 | Energy graph visualization — sparkline or bar chart in UI | ✅ | `m8-polish` |
| 8.2 | Keyboard navigation — arrow keys between sections | ✅ | `m8-polish` |
| 8.3 | Quick-add note — fast note entry without modal | ✅ | `m8-polish` |
| 8.4 | Context menu integration — right-click actions in Arrangement View | ✅ | `m8-polish` |
| 8.5 | Refresh/rescan action — manual re-analysis trigger | ✅ | `m8-polish` |
| 8.6 | Performance optimization — lazy loading, debouncing, caching | ✅ | `m8-polish` |
| 8.7 | DJ compatibility scoring — intro/outro length, phrase alignment checks | ✅ | `m8-polish` |

**Done when**: The extension feels production-ready and responsive for daily use.

---

## Post-M8: MIDI Content Analysis

Deep MIDI content analysis for pattern fingerprinting, fill/build detection, instrument role classification, and content-aware suggestions.

| # | Task | Status | Spec |
|---|---|---|---|
| CA.1 | Content analysis types and state store extension | ✅ | `midi-content-analysis` |
| CA.2 | Pattern fingerprinting and similarity scoring | ✅ | `midi-content-analysis` |
| CA.3 | Instrument role classification | ✅ | `midi-content-analysis` |
| CA.4 | Phrase length and percussion pattern detection | ✅ | `midi-content-analysis` |
| CA.5 | Build detection and cross-section comparison | ✅ | `midi-content-analysis` |
| CA.6 | Drum pad extraction (SDK layer) | ✅ | `midi-content-analysis` |
| CA.7 | Top-level `analyzeContent` entry point | ✅ | `midi-content-analysis` |
| CA.8 | Genre fill profiles | ✅ | `midi-content-analysis` |
| CA.9 | Content suggestion filter (suppression + refinement) | ✅ | `midi-content-analysis` |
| CA.10 | Genre-aware percussion suggestions | ✅ | `midi-content-analysis` |
| CA.11 | Orchestrator integration (Steps 2b, 8b, 11a) | ✅ | `midi-content-analysis` |

**Done when**: The analysis pipeline fingerprints patterns, detects fills/builds, classifies instrument roles, and uses this knowledge to suppress redundant suggestions and generate genre-aware, drum-element-specific recommendations.

---

## Post-M8: Audio Content Analysis

Spectral and temporal analysis of audio tracks — closing the gap between deep MIDI analysis and shallow clip-presence-only scoring for audio tracks.

| # | Task | Status | Spec |
|---|---|---|---|
| ACA.1 | Core types and shared utilities (audio-content-types, audio-utils, mixToMono) | ✅ | `audio-content-analysis` |
| ACA.2 | Beat Position Mapper (sample ↔ beat linear mapping) | ✅ | `audio-content-analysis` |
| ACA.3 | Spectral Analyzer (Meyda FFT, frequency band binning, centroid, flux) | ✅ | `audio-content-analysis` |
| ACA.4 | RMS Calculator (dBFS, normalized energy) | ✅ | `audio-content-analysis` |
| ACA.5 | Transient Detector (spectral flux threshold, IOI enforcement, classification) | ✅ | `audio-content-analysis` |
| ACA.6 | Audio Role Classifier (drums/bass/vocal/synth/pad/mix priority rules) | ✅ | `audio-content-analysis` |
| ACA.7 | Cross-Section Comparator (cosine similarity, repetition detection) | ✅ | `audio-content-analysis` |
| ACA.8 | SDK Adapter audio render methods (renderPreFxAudio, track indices, mute) | ✅ | `audio-content-analysis` |
| ACA.9 | Audio Analyzer render orchestrator (batching, decode, slice, cache, timeouts) | ✅ | `audio-content-analysis` |
| ACA.10 | State store integration (UPDATE_AUDIO_CONTENT_ANALYSIS action) | ✅ | `audio-content-analysis` |
| ACA.11 | Pipeline integration (Energy Scorer, Issue Detector, Transition Engine, Suggestion Engine) | ✅ | `audio-content-analysis` |
| ACA.12 | Genre-aware audio suggestions (frequency balance, sub-bass, drum density) | ✅ | `audio-content-analysis` |
| ACA.13 | Property-based tests (14 properties, 73 tests total) | ✅ | `audio-content-analysis` |

**Done when**: Audio tracks receive spectral/temporal analysis via renderPreFxAudio, results feed into Energy Scorer (weighted RMS), Issue Detector (frequency crowding), Transition Engine (spectral contrast), and Suggestion Engine (role-aware repetition, genre-aware frequency balance).

---

## Post-M8: MIDI Synth Analysis

Deep musical analysis of synth tracks (lead, pad, chord, arpeggio, bass) — pitch content, harmonic intervals, velocity dynamics, articulation, melodic contour, polyphony, cross-section comparison, and integration with energy scoring, issue detection, and suggestions.

| # | Task | Status | Spec |
|---|---|---|---|
| SA.1 | Synth analysis types and type definitions | ✅ | `midi-synth-analysis` |
| SA.2 | Core computation functions (pitch, density, velocity, articulation, rhythm, polyphony, contour, intervals) | ✅ | `midi-synth-analysis` |
| SA.3 | Cross-section comparison and discontinuity detection | ✅ | `midi-synth-analysis` |
| SA.4 | Energy scorer integration (synthEnergy field and weight) | ✅ | `midi-synth-analysis` |
| SA.5 | Issue detector integration (repetition, low density, harmonic shift, duplicated roles) | ✅ | `midi-synth-analysis` |
| SA.6 | Suggestion engine integration (variation, velocity automation, layering, intensification) | ✅ | `midi-synth-analysis` |
| SA.7 | Orchestrator wiring and integration tests | ✅ | `midi-synth-analysis` |
| SA.8 | Property-based tests (26 properties) | ✅ | `midi-synth-analysis` |

**Done when**: Synth tracks receive rich musical analysis (pitch content, harmonic intervals, velocity dynamics, articulation patterns, melodic contour, polyphony profiles), results feed into Energy Scorer, Issue Detector, and Suggestion Engine with synth-specific recommendations.

---

## Post-M8: Section Marker Generation

Generate section markers (CuePoints) from genre structure templates or timeline content analysis.

| # | Task | Status | Spec |
|---|---|---|---|
| SMG.1 | Type interfaces and genre structure data (types, JSON data files, registry) | ✅ | `section-marker-generation` |
| SMG.2 | Mode selection logic (minimal vs content mode) | ✅ | `section-marker-generation` |
| SMG.3 | Minimal Mode generation (random template, bar length selection, name disambiguation) | ✅ | `section-marker-generation` |
| SMG.4 | Content Mode generation (boundary detection, grid snap, variant matching) | ✅ | `section-marker-generation` |
| SMG.5 | SDK adapter extension (createCuePoint, deleteCuePoint, readSongDuration, readAllClips) | ✅ | `section-marker-generation` |
| SMG.6 | Section generator orchestrator (async, timeout, partial failure handling) | ✅ | `section-marker-generation` |
| SMG.7 | Message protocol and store extensions | ✅ | `section-marker-generation` |
| SMG.8 | Webview UI — Generate Sections button with all states | ✅ | `section-marker-generation` |
| SMG.9 | Integration wiring and tests | ✅ | `section-marker-generation` |

**Done when**: "Generate Sections" button creates genre-appropriate CuePoint markers in two modes (random template for empty timelines, content-derived for populated timelines), with full error handling, timeout protection, and 106 passing tests (unit + property-based + integration).

---

## Post-M8: Genre Data Externalization

Consolidate all genre data from scattered TypeScript modules into 28 unified JSON files with a centralized loader, removing redundant hardcoded configuration.

| # | Task | Status | Spec |
|---|---|---|---|
| GDE.1 | JSON schema interfaces and type definitions | ✅ | `genre-data-externalization` |
| GDE.2 | Populate all 28 JSON files with complete genre data | ✅ | `genre-data-externalization` |
| GDE.3 | Genre loader module with static imports and validation | ✅ | `genre-data-externalization` |
| GDE.4 | Refactor genre registry to use loader | ✅ | `genre-data-externalization` |
| GDE.5 | Integrate fill/audio/threshold/transition lookups | ✅ | `genre-data-externalization` |
| GDE.6 | Update imports and remove old TypeScript profile modules | ✅ | `genre-data-externalization` |
| GDE.7 | Data integrity validation (11 property-based tests) | ✅ | `genre-data-externalization` |
| GDE.8 | Build verification (no fs access, no standalone JSON in .ablx) | ✅ | `genre-data-externalization` |

**Done when**: All genre data lives in 28 JSON files loaded via static imports, the old TypeScript profile modules are removed, the registry maintains identical public API, all tests pass, and the .ablx package bundles data inline with no runtime filesystem access.

---

## Post-M8: Arrangement Score

Single numeric score (1–10) comparing the user's energy curve against the ideal genre template, displayed color-coded in the controls bar.

| # | Task | Status | Spec |
|---|---|---|---|
| AS.1 | Arrangement score engine with linear interpolation helper | ✅ | `arrangement-score` |
| AS.2 | Property-based tests (Properties 1–6) | ✅ | `arrangement-score` |
| AS.3 | State store and message protocol integration | ✅ | `arrangement-score` |
| AS.4 | Analysis orchestrator integration (compute + genre change recomputation) | ✅ | `arrangement-score` |
| AS.5 | Score display in controls bar UI (color-coded, tier labels) | ✅ | `arrangement-score` |

**Done when**: The controls bar displays a color-coded 1–10 arrangement score that updates on analysis and genre change, with 30+ unit/property tests passing.

---

## Post-M8: Transition Data Externalization

Extract hardcoded transition data (~55 strings, ~18 numbers) from `transition-engine.ts` into a JSON config file with a validated loader module.

| # | Task | Status | Spec |
|---|---|---|---|
| TDE.1 | TypeScript types and JSON data file | ✅ | `transition-data-externalization` |
| TDE.2 | Transition loader module with validation and accessors | ✅ | `transition-data-externalization` |
| TDE.3 | Engine integration (replace hardcoded constants with loader calls) | ✅ | `transition-data-externalization` |
| TDE.4 | Remove hardcoded constants from transition engine | ✅ | `transition-data-externalization` |
| TDE.5 | Property-based tests (5 properties, 45 tests) | ✅ | `transition-data-externalization` |

**Done when**: All transition data lives in `src/data/transitions/transition-config.json`, loaded via static import with validation, old constants are removed, behavior is identical, and 45 property tests confirm correctness.

---

## Post-M8: Default Energy Weights Externalization

Externalize hardcoded energy weights, deviation thresholds, and genre threshold defaults from `genre-registry.ts` into a validated JSON data file with a loader module.

| # | Task | Status | Spec |
|---|---|---|---|
| EWE.1 | JSON data file with all weight/threshold values | ✅ | `default-energy-weights-externalization` |
| EWE.2 | Loader module with static import and validation | ✅ | `default-energy-weights-externalization` |
| EWE.3 | Typed accessor functions from loader | ✅ | `default-energy-weights-externalization` |
| EWE.4 | Genre registry integration (replace hardcoded constants) | ✅ | `default-energy-weights-externalization` |
| EWE.5 | Property-based tests (6 properties) | ✅ | `default-energy-weights-externalization` |
| EWE.6 | Build verification and .ablx packaging | ✅ | `default-energy-weights-externalization` |

**Done when**: All default energy weights and thresholds live in `src/data/scoring/energy-weights.json`, loaded via static import with validation, hardcoded constants are removed from genre-registry, behavior is identical, and 6 property tests confirm weight-sum invariant.

---

## Post-M8: Issue Detector Keywords Externalization

Externalize hardcoded keyword arrays (~30 strings) and numeric detection thresholds (~15 values) from `issue-detector.ts` into a validated JSON data file with a loader module.

| # | Task | Status | Spec |
|---|---|---|---|
| IDKE.1 | JSON data file with all keywords, genre lists, roles, and thresholds | ✅ | `issue-detector-keywords-externalization` |
| IDKE.2 | Loader module with static import, validation, and accessor functions | ✅ | `issue-detector-keywords-externalization` |
| IDKE.3 | Issue detector integration (replace hardcoded constants and numeric literals) | ✅ | `issue-detector-keywords-externalization` |
| IDKE.4 | Property-based tests (6 properties, 48 tests) | ✅ | `issue-detector-keywords-externalization` |
| IDKE.5 | Build verification and behavioral equivalence | ✅ | `issue-detector-keywords-externalization` |

**Done when**: All issue detection keywords, genre lists, role arrays, and numeric thresholds live in `src/data/detection/issue-thresholds.json`, loaded via static import with validation, hardcoded constants are removed from issue-detector, behavior is identical, and 48 property tests confirm correctness.

---

## Post-M8: Detection Data Externalization

Externalize hardcoded detection thresholds, classification rules, and pattern data from three source modules (audio-role-classifier, content-analyzer, automation-suggester) into JSON configuration files with dedicated loader modules.

| # | Task | Status | Spec |
|---|---|---|---|
| DDE.1 | JSON configuration files (role-classification, content-classification, automation-patterns) | ✅ | `detection-data-externalization` |
| DDE.2 | Loader modules with validation, deep-freeze, and typed accessors | ✅ | `detection-data-externalization` |
| DDE.3 | Refactor source files to use loader accessors | ✅ | `detection-data-externalization` |
| DDE.4 | Property-based tests for validators (4 properties) | ✅ | `detection-data-externalization` |
| DDE.5 | Property-based tests for behavioral equivalence (3 properties) | ✅ | `detection-data-externalization` |
| DDE.6 | Final build and .ablx packaging | ✅ | `detection-data-externalization` |

**Done when**: All detection thresholds, classification rules, and pattern data live in 3 JSON files loaded via static imports with validation, hardcoded constants are removed from all 3 source modules, behavior is identical, and 50 property tests confirm correctness (7 properties across validation, immutability, and behavioral equivalence).

---

## Post-M8: Remaining Data Externalization

Externalize the final six hardcoded data sets (items 10–15) from TypeScript source files into JSON configuration files with validated loader modules.

| # | Task | Status | Spec |
|---|---|---|---|
| RDE.1 | JSON configuration data files (5 JSON files) | ✅ | `remaining-data-externalization` |
| RDE.2 | Archetype config loader module | ✅ | `remaining-data-externalization` |
| RDE.3 | UI colors loader module | ✅ | `remaining-data-externalization` |
| RDE.4 | Frequency bands loader module | ✅ | `remaining-data-externalization` |
| RDE.5 | Alignment weights and mode selector loader modules | ✅ | `remaining-data-externalization` |
| RDE.6 | Validator property tests (Properties 1–5) | ✅ | `remaining-data-externalization` |
| RDE.7 | Deep-freeze immutability property test (Property 6) | ✅ | `remaining-data-externalization` |
| RDE.8 | Refactor 6 source modules to use loaders | ✅ | `remaining-data-externalization` |
| RDE.9 | Behavioral equivalence property tests (Properties 7–11) | ✅ | `remaining-data-externalization` |
| RDE.10 | Final build verification and .ablx packaging | ✅ | `remaining-data-externalization` |

**Done when**: All 6 remaining hardcoded data sets (archetype detection thresholds, UI colors, frequency bands, alignment weights, mode selector thresholds) live in JSON files loaded via static imports with validation, hardcoded constants are removed from all source modules, behavior is identical, and 54 property tests confirm correctness (11 properties: 5 validators + 1 immutability + 5 behavioral equivalence).

---

## Milestone Order & Dependencies

```
M1 Foundation ──→ M2 Analysis ──→ M3 Issues ──→ M4 Transitions
                                      │                │
                                      ▼                ▼
                               M5 Notes/Checklist   M6 Genre Rules
                                      │                │
                                      └───────┬────────┘
                                              ▼
                                    M7 Reference Tracks
                                              │
                                              ▼
                                        M8 Polish
```

M1 is prerequisite for everything. M2 feeds M3 and M4. M5 and M6 can proceed in parallel after M3. M7 requires M2+M6. M8 is final polish.

---

## Spec Mapping

As specs are created for each milestone, record the link here:

| Milestone | Spec Directory |
|---|---|
| M1: Foundation | `.kiro/specs/m1-foundation` |
| M2: Analysis | `.kiro/specs/m2-section-analysis` |
| M3: Issues | `.kiro/specs/m3-issue-detection` |
| M4: Transitions | `.kiro/specs/m4-transition-engine` |
| M5: Notes | `.kiro/specs/m5-notes-checklist` |
| M6A: Genre Infrastructure | `.kiro/specs/m6-genre-infrastructure` |
| M6B: Genre Profiles | `.kiro/specs/m6-genre-profiles` |
| M6C: Genre Integration | `.kiro/specs/m6-genre-integration` |
| M7: Reference | `.kiro/specs/m7-reference-tracks` |
| M8: Polish | `.kiro/specs/m8-polish` |
| Post-M8: MIDI Content Analysis | `.kiro/specs/midi-content-analysis` |
| Post-M8: Audio Content Analysis | `.kiro/specs/audio-content-analysis` |
| Post-M8: MIDI Synth Analysis | `.kiro/specs/midi-synth-analysis` |
| Post-M8: Section Marker Generation | `.kiro/specs/section-marker-generation` |
| Post-M8: Genre Data Externalization | `.kiro/specs/genre-data-externalization` |
| Post-M8: Arrangement Score | `.kiro/specs/arrangement-score` |
| Post-M8: Transition Data Externalization | `.kiro/specs/transition-data-externalization` |
| Post-M8: Default Energy Weights Externalization | `.kiro/specs/default-energy-weights-externalization` |
| Post-M8: Issue Detector Keywords Externalization | `.kiro/specs/issue-detector-keywords-externalization` |
| Post-M8: Detection Data Externalization | `.kiro/specs/detection-data-externalization` |
| Post-M8: Remaining Data Externalization | `.kiro/specs/remaining-data-externalization` |
| Post-M8: Loader Utils Extraction | `.kiro/specs/loader-utils-extraction` |

---

## Post-M8: Loader Utils Extraction

Extract duplicated `deepFreeze` and `fail` helper utilities from 12 loader modules into a shared `src/core/loader-utils.ts` module, consolidate loader test files into `test/property/`.

| # | Task | Status | Spec |
|---|---|---|---|
| LUE.1 | Shared loader-utils module (deepFreeze + createFailHelper) | ✅ | `loader-utils-extraction` |
| LUE.2 | Property-based tests (5 properties, 10 tests) | ✅ | `loader-utils-extraction` |
| LUE.3 | Refactor all 12 loaders to import from shared module | ✅ | `loader-utils-extraction` |
| LUE.4 | Test file consolidation (6 files relocated to test/property/) | ✅ | `loader-utils-extraction` |
| LUE.5 | Dedicated unit tests for loader-utils (17 tests) | ✅ | `loader-utils-extraction` |
| LUE.6 | Full regression and build verification | ✅ | `loader-utils-extraction` |

**Done when**: All 12 loaders import `deepFreeze` and `createFailHelper` from a single shared module, ~150 lines of duplicated code eliminated, all loader tests consolidated into `test/property/`, and full test suite + build passes.

---

## Notes

- Each milestone may be one spec or may be broken into multiple specs if scope is large.
- Update the Status column and Spec column as work progresses.
- If a task is blocked, note the blocker in the Spec column.
- This document is the single source of truth for "what's done" and "what's next."
