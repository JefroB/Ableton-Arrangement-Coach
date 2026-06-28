# Extractable Hardcoded Data

An inventory of data currently embedded in TypeScript source files that could be moved into `.json` configuration files for easier modification and augmentation.

> **Context:** Genre profiles (`src/data/genres/*.json`) are already externalized via the genre-loader system. This document covers everything else that remains hardcoded.

---

## Priority: High

These are large data sets that are the most likely to be modified or extended by users/contributors.

### 1. ~~Suggestion Vocabulary & Technique Pools~~ ✅ COMPLETED

**Status:** Externalized via `src/core/suggestion-loader.ts` → `src/data/suggestions/*.json`. Unit + property tests passing.

**File:** `src/core/suggestion-renderer.ts` (now loads from JSON via `loadAllSuggestionData()`)

| Data | Lines | Description | Size |
|------|-------|-------------|------|
| `LEADING_VERBS` | ~73–87 | Verb options per issue type (12 types × 8 verbs) | ~96 strings |
| `GENERIC_VERBS` | ~89 | Fallback verbs when issue type is unknown | 8 strings |
| `GENERIC_TRANSITIONS` | ~92–102 | Generic electronic music transition element names | 10 strings |
| `SECOND_SENTENCES` | ~106–170 | Rotating explanatory sentences per issue type (12 types × 5 sentences) | ~60 strings |
| `VARIATION_TECHNIQUES` | ~174–310 | Technique suggestions organized by category (Automation, Addition, Subtraction, Evolution, Arrangement, Sound Design, Rhythm, Harmony, FX, Dynamics, Stereo Image, Texture, Groove) | ~130 strings |
| `GENRE_TECHNIQUES` | ~313–875 | Genre-specific technique suggestions per family (techno, trance, house, drum-and-bass, ambient-downtempo, melodic-techno-progressive, synthwave-darkwave, hardcore-bouncy, footwork-juke, electro-breakbeat, idm-experimental, dubstep-bass, hiphop-trap, pop-electronic, african-latin-electronic, garage-uk-bass) | ~350 strings |
| `AUDIO_VARIATION_STRATEGIES` | ~1158 | Audio-specific variation strategies for renderAudioVariation | 5 strings |
| `FRAMING_MODES` | ~59 | Sentence framing styles: directive, observational, question, goal, comparison | 5 strings |

**Total:** ~660+ strings. This is the largest single source of hardcoded data in the project.

**Proposed JSON structure:**
```json
{
  "leadingVerbs": {
    "flat-energy": ["Introduce", "Add", "Layer in", ...],
    ...
  },
  "genericVerbs": ["Consider", "Try", ...],
  "genericTransitions": ["riser", "build", ...],
  "secondSentences": {
    "flat-energy": ["Without movement here...", ...],
    ...
  },
  "variationTechniques": {
    "automation": ["gradual filter cutoff automation", ...],
    "addition": ["a new percussion layer", ...],
    ...
  },
  "genreTechniques": {
    "techno": ["a percussion substitution", ...],
    ...
  },
  "audioVariationStrategies": ["using a different sample...", ...],
  "framingModes": ["directive", "observational", ...]
}
```

---

### 2. Transition Technique Names & Category Priorities ✅ COMPLETED

**File:** `src/core/transition-engine.ts`

| Data | Lines | Description | Size |
|------|-------|-------------|------|
| `TECHNIQUE_NAMES` | ~98–105 | Named techniques per category (6 categories × 8 names) | 48 strings |
| `POSITIVE_CATEGORIES` | ~84 | Category priority for upward energy transitions | 4 items |
| `NEGATIVE_CATEGORIES` | ~89 | Category priority for downward energy transitions | 4 items |
| `ZERO_CATEGORIES` | ~94 | Category priority for flat energy transitions | 3 items |
| `DROP_KEYWORDS` | ~108 | Section name keywords indicating a drop boundary | 4 strings |
| `BREAKDOWN_KEYWORDS` | ~111 | Section name keywords indicating a breakdown boundary | 3 strings |
| Size thresholds | classifySize | Breakpoints for small/medium/large (≤2, ≤4, else) | 2 values |
| Duration ranges | getDurationRange | Bar ranges per size (2–4, 4–8, 8–32) | 6 values |
| Technique counts | getTechniqueCount | Techniques per size (1, 2, 3) | 3 values |
| Checklist counts | getChecklistCountRange | Checklist items per size (2–3, 3–4, 4–5) | 6 values |
| `AUDIO_SPECTRAL_CHANGE_THRESHOLD` | ~186 | Cosine similarity below which audio is "changed" | 1 value (0.7) |

**Total:** ~55 strings, ~18 numeric values

**Proposed JSON structure:**
```json
{
  "techniqueNames": {
    "riser": ["white noise sweep", "pitch riser", ...],
    ...
  },
  "categoryPriorities": {
    "positive": ["riser", "drum_fill", "filter_sweep", "volume_dynamics"],
    "negative": ["filter_sweep", "volume_dynamics", "impact", "textural_fx"],
    "zero": ["textural_fx", "filter_sweep", "drum_fill"]
  },
  "boundaryKeywords": {
    "drop": ["drop", "main", "peak", "climax"],
    "breakdown": ["breakdown", "break", "bridge"]
  },
  "sizeConfig": {
    "small": { "maxDelta": 2, "techniqueCount": 1, "durationBars": [2, 4], "checklistItems": [2, 3] },
    "medium": { "maxDelta": 4, "techniqueCount": 2, "durationBars": [4, 8], "checklistItems": [3, 4] },
    "large": { "maxDelta": null, "techniqueCount": 3, "durationBars": [8, 32], "checklistItems": [4, 5] }
  },
  "audioSpectralChangeThreshold": 0.7
}
```

---

### 3. Default Energy Weights ✅ COMPLETED

**File:** `src/core/genre-registry.ts`

| Data | Lines | Description | Size |
|------|-------|-------------|------|
| `DEFAULT_WEIGHTS` | ~81–89 | Base weights (no .als data) | 8 fields |
| `DEFAULT_WEIGHTS_WITH_ALS` | ~92–100 | Weights when .als automation data is available | 8 fields |
| `DEFAULT_WEIGHTS_WITH_AUDIO` | ~103–113 | Weights when audio content analysis is available | 9 fields |
| `DEFAULT_GENRE_THRESHOLDS` | ~373 | Default issue detection thresholds | 6 fields |
| `DEFAULT_DEVIATION_THRESHOLD_DB` | ~283 | Default frequency deviation threshold | 1 value (6) |
| `RHYTHMIC_DEVIATION_THRESHOLD` | ~286 | Default rhythmic deviation threshold | 1 value (0.30) |

**Proposed JSON structure:**
```json
{
  "defaultWeights": {
    "base": { "trackCountWeight": 0.20, "midiDensityWeight": 0.25, ... },
    "withAls": { "trackCountWeight": 0.18, ... },
    "withAudio": { "trackCountWeight": 0.16, ..., "audioEnergyWeight": 0.15 }
  },
  "defaultThresholds": {
    "flatEnergyDelta": 1,
    "repetitionSimilarity": 0.85,
    "abruptChangeDelta": 5,
    "crowdingTrackCount": 3,
    "introMinBars": 16,
    "outroMinBars": 16
  },
  "defaultDeviationThresholdDb": 6,
  "rhythmicDeviationThreshold": 0.30
}
```

---

## Priority: Medium

Moderately sized data sets that are useful to tune or extend.

### 4. Issue Detector Keywords & Thresholds ✅ COMPLETED

**File:** `src/core/issue-detector.ts`

| Data | Description | Size |
|------|-------------|------|
| `DEFAULT_THRESHOLDS` | Default GenreThresholdProfile when no genre selected | 6 fields |
| `TRANSITION_KEYWORDS` | Track name keywords indicating transition elements | ~6 strings |
| `BUILDUP_KEYWORDS` | Keywords for buildup detection | ~2 strings |
| `DROP_SUPPRESSION_GENRES` | Genres where "missing drop" issues are suppressed | ~4 strings |
| `DROP_SECTION_NAMES` | Section names considered drops | ~3 strings |
| `REPETITION_TOLERANT_GENRES` | Genres with relaxed repetition thresholds | ~2 strings |
| `DJ_ORIENTED_GENRES` | Genres where DJ scoring applies | ~4 strings |
| `SYNTH_REPETITION_ROLES` | Instrument roles checked for synth repetition | 3 strings |
| `SYNTH_DENSITY_ROLES` | Roles checked for density issues | 4 strings |
| Missing-transition energy delta | Threshold for suggesting transitions (≥3) | 1 value |
| Buildup density threshold | Notes per bar threshold (≥4) | 1 value |
| Frequency crowding thresholds | Track count for info/warning severity | 2 values |
| Audio occupied threshold | dBFS level for "occupied" band (-40) | 1 value |
| Intro energy threshold | Energy above which intro is "too hot" (>4) | 1 value |
| Energy mismatch delta | Delta between intro/outro energy (>2) | 1 value |
| Synth density threshold | Notes per beat for synth density issue (2.0) | 1 value |

**Total:** ~30 strings, ~15 numeric thresholds

---

### 5. Track Categorizer Pattern Tables ✅ COMPLETED

**File:** `src/core/track-categorizer.ts`

| Data | Description | Size |
|------|-------------|------|
| `TRACK_NAME_PATTERNS` | Maps frequency buckets to track name keywords | 6 entries, ~12 patterns |
| `DEVICE_NAME_PATTERNS` | Maps frequency buckets to device name keywords | 2 entries, ~4 patterns |

**Proposed JSON structure:**
```json
{
  "trackNamePatterns": [
    { "bucket": "sub", "patterns": ["sub", "808"] },
    { "bucket": "bass", "patterns": ["kick", "bass"] },
    { "bucket": "low-mid", "patterns": ["guitar", "keys"] },
    { "bucket": "mid", "patterns": ["pad", "strings", "chord", "piano"] },
    { "bucket": "high-mid", "patterns": ["lead", "vocal", "vox"] },
    { "bucket": "high", "patterns": ["hat", "hihat", "cymbal", "shaker", "perc"] }
  ],
  "deviceNamePatterns": [
    { "bucket": "bass", "patterns": ["operator", "drum rack"] },
    { "bucket": "mid", "patterns": ["simpler", "wavetable", "collision"] }
  ]
}
```

---

### 6. DJ Scorer Configuration ✅ COMPLETED

**File:** `src/core/dj-scorer.ts`

| Data | Description | Size |
|------|-------------|------|
| `NON_DJ_FAMILIES` | Genre families where DJ scoring is N/A | 2 strings |
| Component weights | 0.20, 0.20, 0.20, 0.15, 0.15, 0.10 | 6 values |
| `scoreSectionLength` thresholds | <16→0, 16→50, ≥32→100 | 3 breakpoints |
| `scoreMixZoneCleanliness` thresholds | ≤3→100, ≤5→75, ≤7→50, 8+→0 | 4 breakpoints |
| `scoreEnergyPositioning` | 20 penalty per unit above 5 | 2 values |

**Proposed JSON structure:**
```json
{
  "nonDjFamilies": ["ambient", "film-score"],
  "componentWeights": {
    "introLength": 0.20,
    "outroLength": 0.20,
    "phraseAlignment": 0.20,
    "mixZoneCleanliness": 0.15,
    "tempoConsistency": 0.15,
    "energyPositioning": 0.10
  },
  "sectionLengthScoring": { "minBars": 16, "maxBars": 32, "minScore": 50, "maxScore": 100 },
  "mixZoneThresholds": [
    { "maxEnergy": 3, "score": 100 },
    { "maxEnergy": 5, "score": 75 },
    { "maxEnergy": 7, "score": 50 },
    { "maxEnergy": 999, "score": 0 }
  ],
  "energyPositioning": { "safeThreshold": 5, "penaltyPerUnit": 20 }
}
```

---

### 7. ~~Audio Role Classifier Thresholds~~ ✅ COMPLETED

**Status:** Externalized via `src/core/role-classification-loader.ts` → `src/data/detection/role-classification.json`. 11 property tests + 1 behavioral equivalence test passing.

**File:** `src/core/audio-role-classifier.ts` (now loads from JSON via `getRoleThresholds()` and `getNameHintPatterns()`)

| Data | Description | Size |
|------|-------------|------|
| Drums rules | transientDensity > 8, maxBandFraction ≤ 0.4 | 2 values |
| Vocal rules | centroid > 2000 Hz, 70%+ frames, formant fractions ≥ 0.1 | 4 values |
| Bass rules | 60%+ energy below 250 Hz, transientDensity < 4 | 2 values |
| SynthLead rules | 60%+ energy 1000–8000 Hz, transientDensity < 4 | 3 values |
| SynthPad rules | 60%+ energy 200–2000 Hz, transientDensity < 2, spectralFlux < 0.1 | 4 values |
| FullMix rules | no band > 35%, transientDensity 4–8 | 3 values |
| Name hint regex patterns | 4 regex patterns for drums/vocal/bass/pad | 4 patterns |

**Total:** ~18 numeric thresholds, 4 regex patterns

---

### 8. ~~Content Analyzer Classification~~ ✅ COMPLETED

**Status:** Externalized via `src/core/content-classification-loader.ts` → `src/data/categorization/content-classification.json`. 12 property tests + 1 behavioral equivalence test passing.

**File:** `src/core/content-analyzer.ts` (now loads from JSON via `getSimilarityWeights()`, `getRoleKeywords()`, `getClassificationThresholds()`, etc.)

| Data | Description | Size |
|------|-------------|------|
| Similarity weights | pitchClass: 0.35, rhythmic: 0.30, velocity: 0.20, density: 0.15 | 4 values |
| Phrase detection threshold | avgSimilarity ≥ 0.7 | 1 value |
| `DRUM_KEYWORDS` | ["drum", "kick", "hat", "snare", "perc"] | 5 strings |
| `BASS_KEYWORDS` | ["bass"] | 1 string |
| `LEAD_KEYWORDS` | ["lead", "melody"] | 2 strings |
| `PAD_KEYWORDS` | ["pad"] | 1 string |
| `ARP_KEYWORDS` | ["arp"] | 1 string |
| Drums classification | pitches 35–81, regularity > 0.8, pitchVarietyPerBeat < 3, avgDuration < 0.5 | 4 values |
| Bass classification | avgPitch < 60, avgPolyphony < 1.5 | 2 values |
| Arpeggio classification | density > 4, regularity > 0.7 | 2 values |
| Pad classification | avgPolyphony > 2.5, avgDuration > 2 | 2 values |
| Chord classification | polyphony 2–4, duration 0.5–2 | 4 values |
| Lead classification | polyphony < 1.5, avgPitch > 55, pitchVariety ≥ 3 | 3 values |
| Fill detection | density increase ≥ 50%, new pitch classes ≥ 2 | 2 values |
| Percussion loop similarity | ≥ 0.85 | 1 value |

**Total:** ~10 strings, ~25 numeric thresholds

---

### 9. ~~Automation Suggester Patterns~~ ✅ COMPLETED

**Status:** Externalized via `src/core/automation-patterns-loader.ts` → `src/data/categorization/automation-patterns.json`. 8 property tests + 1 behavioral equivalence test passing.

**File:** `src/core/automation-suggester.ts` (now loads from JSON via `getFilterDevicePatterns()`, `getTransitionRelevantPatterns()`, etc.)

| Data | Description | Size |
|------|-------------|------|
| `FILTER_DEVICE_PATTERNS` | Device names indicating filter devices | 3 strings |
| `EXCLUDED_PARAMETER_NAMES` | Parameters excluded from suggestions | 1 string |
| `TRANSITION_RELEVANT_PATTERNS` | Parameter names eligible for suggestions | 15 strings |
| `GAP_PATTERNS` | Automation patterns for contrast gap suggestions | 3 strings |
| `TRANSITION_PATTERNS` | Automation patterns for transition suggestions | 3 strings |
| `MAX_SUGGESTIONS_PER_TRANSITION` | Cap on suggestions per boundary | 1 value |
| Generic mixer params | Fallback parameter suggestions | 2 objects |

---

### 10. ~~Archetype Detector~~ ✅ COMPLETED

**Status:** Externalized via `src/core/archetype-config-loader.ts` → `src/data/scoring/archetype-config.json`. 6 validator property tests + 1 behavioral equivalence test + deep-freeze test passing.

**File:** `src/core/archetype-detector.ts` (now loads from JSON via `getArchetypePriority()`, `getDropDetectionThreshold()`, `getGenrePriorBoost()`, `getMaxScoreCap()`, `getLowConfidenceThreshold()`, `getScoringThresholds()`)

| Data | Description | Size |
|------|-------------|------|
| `ARCHETYPE_PRIORITY` | Tie-breaking order for archetype classification | 6 IDs |
| Drop detection threshold | Energy increase of 5+ with preceding "build" section | 1 value |
| Genre prior boost | +15 points when genre expects this archetype | 1 value |
| Low confidence threshold | < 50 flags as low confidence | 1 value |
| Max score cap | Maximum score any archetype can reach (100) | 1 value |
| Per-archetype scoring thresholds | ~82 individual thresholds across scoreDjTool, scorePeakValley, scoreVersechorus, scoreBuildDrop, scoreContinuousEvolution, scoreLoop | ~82 values |

---

## Priority: Low

Small data sets or values that rarely change, but could still benefit from externalization for completeness.

### 11. ~~Energy Chart Color Mapping~~ ✅ COMPLETED

**Status:** Externalized via `src/core/ui-colors-loader.ts` → `src/data/ui/chart-colors.json`. Validator property test + behavioral equivalence test + deep-freeze test passing.

**File:** `src/ui/webview/chart.ts` (now loads from JSON via `getEnergyColors()`)

| Data | Description | Size |
|------|-------------|------|
| `scoreToColor` | Maps energy score ranges to hex colors | 4 color/threshold pairs |

---

### 12. ~~DJ Score Panel Color Classes~~ ✅ COMPLETED

**Status:** Externalized via `src/core/ui-colors-loader.ts` → `src/data/ui/chart-colors.json` (shared with item 11). Validator property test + behavioral equivalence test + deep-freeze test passing.

**File:** `src/ui/webview/dj-score-panel.ts` (now loads from JSON via `getDjScoreClasses()`)

| Data | Description | Size |
|------|-------------|------|
| `scoreColorClass` | Maps score ranges to CSS class names | 3 threshold/class pairs |

---

### 13. ~~Frequency Band Definitions~~ ✅ COMPLETED

**Status:** Externalized via `src/core/frequency-bands-loader.ts` → `src/data/detection/frequency-bands.json`. Validator property test + deep-freeze test passing. `FREQUENCY_BANDS` re-exported from `audio-content-types.ts` for backward compatibility.

**File:** `src/core/audio-content-types.ts` (now re-exports `FREQUENCY_BANDS` from `frequency-bands-loader.ts`)

| Data | Description | Size |
|------|-------------|------|
| `FREQUENCY_BANDS` | 6 band definitions with name, lowHz, highHz | 6 objects |

---

### 14. ~~Alignment Scorer Weights~~ ✅ COMPLETED

**Status:** Externalized via `src/core/alignment-weights-loader.ts` → `src/data/scoring/alignment-weights.json`. Validator property test (sum-to-1.0 invariant) + behavioral equivalence test + deep-freeze test passing.

**File:** `src/core/alignment-scorer.ts` (now loads from JSON via `getOrderingWeight()`, `getLengthWeight()`, `getCountWeight()`)

| Data | Description | Size |
|------|-------------|------|
| `ORDERING_WEIGHT` | 0.4 | 1 value |
| `LENGTH_WEIGHT` | 0.35 | 1 value |
| `COUNT_WEIGHT` | 0.25 | 1 value |

---

### 15. ~~Mode Selector Thresholds~~ ✅ COMPLETED

**Status:** Externalized via `src/core/mode-selector-loader.ts` → `src/data/detection/mode-selector-thresholds.json`. Validator property test + behavioral equivalence test + deep-freeze test passing.

**File:** `src/core/mode-selector.ts` (now loads from JSON via `getClipCountThreshold()`, `getCoverageThreshold()`)

| Data | Description | Size |
|------|-------------|------|
| `CLIP_COUNT_THRESHOLD` | Minimum unmuted clips for content mode (3) | 1 value |
| `COVERAGE_THRESHOLD` | Minimum coverage fraction for content mode (0.10) | 1 value |

---

## Summary

| Priority | Est. Strings | Est. Numeric Values | Primary Benefit |
|----------|-------------|--------------------|-|
| 🔴 High | ~770 | ~30 | Creative vocabulary and technique pools — most likely to be augmented |
| 🟡 Medium | ~75 | ~130 | Tuning thresholds and detection rules — useful for calibration |
| 🟢 Low | ~6 | ~20 | Small constants — completeness and consistency |
| **Total** | **~850** | **~180** | |

### Completion Status

| # | Item | Status |
|---|------|--------|
| 1 | Suggestion Vocabulary & Technique Pools | ✅ Done |
| 2 | Transition Technique Names & Category Priorities | ✅ Done |
| 3 | Default Energy Weights | ✅ Done |
| 4 | Issue Detector Keywords & Thresholds | ✅ Done |
| 5 | Track Categorizer Pattern Tables | ✅ Done |
| 6 | DJ Scorer Configuration | ✅ Done |
| 7 | Audio Role Classifier Thresholds | ✅ Done |
| 8 | Content Analyzer Classification | ✅ Done |
| 9 | Automation Suggester Patterns | ✅ Done |
| 10 | Archetype Detector | ✅ Done |
| 11 | Energy Chart Color Mapping | ✅ Done |
| 12 | DJ Score Panel Color Classes | ✅ Done |
| 13 | Frequency Band Definitions | ✅ Done |
| 14 | Alignment Scorer Weights | ✅ Done |
| 15 | Mode Selector Thresholds | ✅ Done |

**15/15 complete** — all hardcoded data has been externalized to JSON configuration files.

## Recommended File Organization

```
src/data/
├── genres/                          ← already exists
│   ├── techno.json
│   └── ...
├── suggestions/                     ← NEW
│   ├── leading-verbs.json
│   ├── second-sentences.json
│   ├── variation-techniques.json
│   ├── genre-techniques.json
│   └── audio-variation-strategies.json
├── transitions/                     ← NEW
│   ├── technique-names.json
│   ├── category-priorities.json
│   └── size-config.json
├── detection/                       ← NEW
│   ├── issue-thresholds.json
│   ├── keyword-lists.json
│   └── role-classification.json
├── scoring/                         ← NEW
│   ├── dj-scorer-config.json
│   ├── energy-weights.json
│   ├── alignment-weights.json
│   └── archetype-thresholds.json
├── categorization/                  ← NEW
│   ├── track-patterns.json
│   ├── frequency-bands.json
│   └── automation-patterns.json
└── ui/                              ← NEW
    └── chart-colors.json
```

## Notes

- Genre profiles (`src/data/genres/*.json`) are already successfully externalized with a loader pattern (`genre-loader.ts`) that validates and types the data at load time. The same pattern could be reused for all new JSON files.
- The suggestion vocabulary files (priority 🔴) are the highest-value targets because they're the most likely to be expanded by contributors adding new genres or refining phrasing.
- Numeric thresholds (priority 🟡) benefit from externalization for A/B testing and per-user tuning, but are less likely to change frequently.
- Some thresholds are tightly coupled to algorithm logic (e.g., archetype scoring). These could be externalized but require careful documentation of what each value controls.
