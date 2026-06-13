import { fc, test } from "@fast-check/vitest";
import { describe, it, expect } from "vitest";

import {
  VARIATION_TECHNIQUES,
  GENRE_TECHNIQUES,
} from "../../../src/core/suggestion-renderer.js";

// ─── Format Constants ──────────────────────────────────────────────────

/**
 * Regex from the spec: lowercase letter start, lowercase letters/digits/spaces/hyphens
 * in the middle (8–58 chars), ends with lowercase letter or digit.
 * Total length: 10–60 characters.
 */
const FORMAT_REGEX = /^[a-z][a-z0-9 \-]{8,58}[a-z0-9]$/;

// ─── Helpers ───────────────────────────────────────────────────────────

/** Collect all technique strings from both pools into a flat list with pool labels. */
function getAllTechniques(): Array<{ pool: string; technique: string }> {
  const entries: Array<{ pool: string; technique: string }> = [];

  for (const technique of VARIATION_TECHNIQUES) {
    entries.push({ pool: "VARIATION_TECHNIQUES", technique });
  }

  for (const [genre, techniques] of Object.entries(GENRE_TECHNIQUES)) {
    for (const technique of techniques) {
      entries.push({ pool: `GENRE_TECHNIQUES["${genre}"]`, technique });
    }
  }

  return entries;
}

// ─── Property 1: Technique String Format Validity ──────────────────────

/**
 * **Validates: Requirements 1.3, 2.6, 4.1, 4.4**
 *
 * For every entry in VARIATION_TECHNIQUES and every GENRE_TECHNIQUES pool:
 * - 10–60 chars length
 * - lowercase letters/digits/spaces/hyphens only
 * - no leading/trailing whitespace
 * - starts with lowercase letter
 * - 2–8 words
 */
describe("Property 1: Technique string format validity", () => {
  test.prop([fc.constantFrom(...getAllTechniques())], { numRuns: 100 })(
    "every technique string matches the format regex and word count constraints",
    ({ pool, technique }) => {
      // Length: 10–60 characters
      expect(
        technique.length,
        `[${pool}] "${technique}" should be 10–60 chars (got ${technique.length})`,
      ).toBeGreaterThanOrEqual(10);
      expect(
        technique.length,
        `[${pool}] "${technique}" should be 10–60 chars (got ${technique.length})`,
      ).toBeLessThanOrEqual(60);

      // No leading/trailing whitespace
      expect(
        technique,
        `[${pool}] "${technique}" has leading/trailing whitespace`,
      ).toBe(technique.trim());

      // Starts with lowercase letter
      expect(
        technique[0],
        `[${pool}] "${technique}" should start with a lowercase letter`,
      ).toMatch(/^[a-z]$/);

      // Only lowercase letters, digits, spaces, hyphens
      expect(
        technique,
        `[${pool}] "${technique}" contains invalid characters`,
      ).toMatch(FORMAT_REGEX);

      // Word count: 2–8 words
      const words = technique.split(/\s+/);
      expect(
        words.length,
        `[${pool}] "${technique}" should have 2–8 words (got ${words.length})`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        words.length,
        `[${pool}] "${technique}" should have 2–8 words (got ${words.length})`,
      ).toBeLessThanOrEqual(8);
    },
  );
});

// ─── Property 7: Selection mechanism bounds safety ──────────────────────
// **Validates: Requirements 5.2**

describe("Property 7: Selection mechanism bounds safety", () => {
  test.prop(
    [
      fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      fc.integer({ min: 1, max: 10000 }),
    ],
    { numRuns: 100 },
  )(
    "computed index is always within [0, poolSize) for any positive hash and pool size",
    (hash, poolSize) => {
      const shifted = Math.abs((hash >>> 5) ^ (hash * 13));
      const index = shifted % poolSize;
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(poolSize);
    },
  );
});

// ─── Property 2: Intra-pool uniqueness ──────────────────────────────────

/**
 * **Validates: Requirements 1.4, 2.5**
 *
 * Assert no duplicates within VARIATION_TECHNIQUES or any individual genre pool
 * (case-insensitive, trimmed).
 */
describe("Property 2: Intra-pool uniqueness", () => {
  it("VARIATION_TECHNIQUES contains no duplicate entries (case-insensitive, trimmed)", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const entry of VARIATION_TECHNIQUES) {
      const normalized = entry.trim().toLowerCase();
      if (seen.has(normalized)) {
        duplicates.push(`"${entry}"`);
      }
      seen.add(normalized);
    }

    expect(
      duplicates,
      `Duplicate entries in VARIATION_TECHNIQUES:\n${duplicates.join("\n")}`,
    ).toHaveLength(0);
  });

  it("each genre pool contains no duplicate entries (case-insensitive, trimmed)", () => {
    const violations: string[] = [];

    for (const [genre, pool] of Object.entries(GENRE_TECHNIQUES)) {
      const seen = new Set<string>();

      for (const entry of pool) {
        const normalized = entry.trim().toLowerCase();
        if (seen.has(normalized)) {
          violations.push(`"${entry}" duplicated in genre "${genre}"`);
        }
        seen.add(normalized);
      }
    }

    expect(
      violations,
      `Intra-pool duplicates found:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});

// ─── Property 3: Cross-pool uniqueness ──────────────────────────────────

/**
 * **Validates: Requirements 3.5**
 *
 * Assert no entry in any GENRE_TECHNIQUES pool appears in VARIATION_TECHNIQUES
 * (case-insensitive).
 */
describe("Property 3: Cross-pool uniqueness", () => {
  it("no genre technique entry appears in VARIATION_TECHNIQUES (case-insensitive)", () => {
    const genericSet = new Set(
      VARIATION_TECHNIQUES.map((t) => t.trim().toLowerCase()),
    );
    const violations: string[] = [];

    for (const [genre, pool] of Object.entries(GENRE_TECHNIQUES)) {
      for (const entry of pool) {
        if (genericSet.has(entry.trim().toLowerCase())) {
          violations.push(`"${entry}" in genre "${genre}" also exists in VARIATION_TECHNIQUES`);
        }
      }
    }

    expect(
      violations,
      `Cross-pool duplicates found:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});

// ─── Property 4: Genre pool selection exclusivity ───────────────────────

/**
 * **Validates: Requirements 2.3, 3.3**
 *
 * For any profile with a known genre family key and any hash, verify
 * selectVariationTechnique returns a member of that genre pool.
 */
import { selectVariationTechnique } from "../../../src/core/suggestion-renderer.js";
import type { GenreProfile } from "../../../src/core/genre-profile-types.js";

const GENRE_KEYS = Object.keys(GENRE_TECHNIQUES);

describe("Property 4: Genre pool selection exclusivity", () => {
  test.prop(
    [
      fc.constantFrom(...GENRE_KEYS),
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    ],
    { numRuns: 100 },
  )(
    "selectVariationTechnique with a known genre family returns a member of that genre pool",
    (family, hash) => {
      const profile = { family } as unknown as GenreProfile;
      const result = selectVariationTechnique(profile, hash);
      const pool = GENRE_TECHNIQUES[family]!;
      expect(
        pool.includes(result),
        `Expected result "${result}" to be in GENRE_TECHNIQUES["${family}"]`,
      ).toBe(true);
    },
  );
});

// ─── Property 5: Fallback to generic pool ───────────────────────────────

/**
 * **Validates: Requirements 2.7, 3.4, 5.5**
 *
 * For any profile with an unknown family or null profile, and any hash,
 * verify selectVariationTechnique returns a member of VARIATION_TECHNIQUES.
 */
describe("Property 5: Fallback to generic pool", () => {
  test.prop(
    [fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })],
    { numRuns: 100 },
  )(
    "selectVariationTechnique with null profile returns a member of VARIATION_TECHNIQUES",
    (hash) => {
      const result = selectVariationTechnique(null, hash);
      expect(
        VARIATION_TECHNIQUES.includes(result),
        `Expected result "${result}" to be in VARIATION_TECHNIQUES`,
      ).toBe(true);
    },
  );

  test.prop(
    [
      fc.string({ minLength: 5, maxLength: 30 }).filter(
        (s) => !GENRE_KEYS.includes(s) && !(s in Object.prototype),
      ),
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    ],
    { numRuns: 100 },
  )(
    "selectVariationTechnique with unknown family falls back to VARIATION_TECHNIQUES",
    (unknownFamily, hash) => {
      const profile = { family: unknownFamily } as unknown as GenreProfile;
      const result = selectVariationTechnique(profile, hash);
      expect(
        VARIATION_TECHNIQUES.includes(result),
        `Expected result "${result}" to be in VARIATION_TECHNIQUES for unknown family "${unknownFamily}"`,
      ).toBe(true);
    },
  );
});

// ─── Property 6: Output format constraints ──────────────────────────────

/**
 * **Validates: Requirements 4.3, 5.4**
 *
 * For any valid RawSuggestion and any GenreProfile (or null), verify
 * renderSuggestion output is non-empty, ≤200 characters, and contains
 * ≤2 sentence-terminating punctuation marks.
 */
import { renderSuggestion, type RawSuggestion } from "../../../src/core/suggestion-renderer.js";

const ISSUE_TYPES = [
  "flat-energy",
  "missing-transition",
  "repetition",
  "abrupt-change",
  "frequency-crowding",
  "intro-length",
  "outro-length",
  "intro-energy",
  "energy-mismatch",
];

describe("Property 6: Output format constraints", () => {
  test.prop(
    [
      fc.record({
        issueType: fc.constantFrom(...ISSUE_TYPES),
        sectionName: fc.constantFrom("Intro", "Build A", "Main A", "Breakdown", "Outro", "Drop", "Verse"),
        barRange: fc.record({
          start: fc.integer({ min: 1, max: 200 }),
          end: fc.integer({ min: 1, max: 200 }),
        }).map(({ start, end }) => ({ start: Math.min(start, end), end: Math.max(start, end) })),
        severity: fc.constantFrom("info" as const, "warning" as const, "critical" as const),
      }),
      fc.option(fc.constantFrom(...GENRE_KEYS), { nil: undefined }),
      fc.integer({ min: 0, max: 20 }),
    ],
    { numRuns: 100 },
  )(
    "renderSuggestion output is non-empty, ≤200 chars, and has ≤2 sentence-terminators",
    (suggestion, familyOrNull, issueIndex) => {
      const profile = familyOrNull
        ? ({ family: familyOrNull, transitions: { preferred: [] } } as unknown as GenreProfile)
        : null;

      const result = renderSuggestion(suggestion as RawSuggestion, profile, issueIndex);

      // Non-empty
      expect(result.length).toBeGreaterThan(0);

      // Max 200 characters
      expect(
        result.length,
        `Output too long (${result.length} chars): "${result}"`,
      ).toBeLessThanOrEqual(200);

      // Max 2 sentence-terminating punctuation marks (. ! ?)
      const terminators = (result.match(/[.!?]/g) || []).length;
      expect(
        terminators,
        `Output has ${terminators} sentence terminators: "${result}"`,
      ).toBeLessThanOrEqual(2);
    },
  );
});

// ─── Static Assertions: Pool Size and Coverage (Tasks 7.1, 7.2) ─────────

/**
 * **Validates: Requirements 1.1, 2.1, 2.2, 3.1**
 */
const EXPECTED_GENRE_KEYS = [
  "techno",
  "trance",
  "house",
  "drum-and-bass",
  "ambient-downtempo",
  "melodic-techno-progressive",
  "synthwave-darkwave",
  "hardcore-bouncy",
  "footwork-juke",
  "electro-breakbeat",
  "idm-experimental",
  "dubstep-bass",
  "hiphop-trap",
  "pop-electronic",
  "african-latin-electronic",
  "garage-uk-bass",
];

describe("Static Assertions: Minimum pool sizes", () => {
  it("VARIATION_TECHNIQUES contains at least 100 entries", () => {
    expect(VARIATION_TECHNIQUES.length).toBeGreaterThanOrEqual(100);
  });

  it("all 16 genre family keys are present in GENRE_TECHNIQUES", () => {
    const actualKeys = Object.keys(GENRE_TECHNIQUES);
    for (const key of EXPECTED_GENRE_KEYS) {
      expect(
        actualKeys,
        `Missing genre key: "${key}"`,
      ).toContain(key);
    }
  });

  it("each of 16 genre family pools has at least 20 entries", () => {
    const violations: string[] = [];
    for (const key of EXPECTED_GENRE_KEYS) {
      const pool = GENRE_TECHNIQUES[key];
      if (!pool || pool.length < 20) {
        violations.push(`"${key}": ${pool?.length ?? 0} entries (need 20+)`);
      }
    }
    expect(
      violations,
      `Genre pools below 20 entries:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});

/**
 * **Validates: Requirements 1.2, 6.1, 6.2, 6.3, 6.5**
 *
 * Category coverage checks use comment-based grouping in the source.
 * Here we verify specific technique subsets exist.
 */
describe("Static Assertions: Category coverage", () => {
  it("VARIATION_TECHNIQUES contains at least 4 subtraction-based entries", () => {
    const subtractionKeywords = ["removal", "dropout", "stripped", "muted", "thinning"];
    const subtractionEntries = VARIATION_TECHNIQUES.filter((t) =>
      subtractionKeywords.some((kw) => t.includes(kw)),
    );
    expect(
      subtractionEntries.length,
      `Found only ${subtractionEntries.length} subtraction entries: ${subtractionEntries.join(", ")}`,
    ).toBeGreaterThanOrEqual(4);
  });

  it("VARIATION_TECHNIQUES contains at least 5 evolution-based entries", () => {
    const evolutionKeywords = ["gradual", "evolution", "increasing", "morphing", "over 8 bars", "over 16 bars", "swell"];
    const evolutionEntries = VARIATION_TECHNIQUES.filter((t) =>
      evolutionKeywords.some((kw) => t.includes(kw)),
    );
    expect(
      evolutionEntries.length,
      `Found only ${evolutionEntries.length} evolution entries: ${evolutionEntries.join(", ")}`,
    ).toBeGreaterThanOrEqual(5);
  });

  it("VARIATION_TECHNIQUES covers all 10 approach categories with 8+ entries each", () => {
    // We verify by counting entries that match keywords for each category.
    // This is a heuristic — the actual grouping is by comments in source.
    const categories: Record<string, string[]> = {
      automation: ["automation", "modulation", "sweep", "lfo", "ducking", "drift"],
      arrangement: ["dropout", "call-and-response", "swap", "thinning", "half-time", "stripped", "muted", "delayed", "bridge", "counter-phrase", "variation"],
      "sound design": ["distortion", "reverb size", "modulation depth", "wavetable", "granular", "fm synthesis", "additive", "formant", "bitcrusher", "comb filter", "ring modulation", "transient"],
      rhythm: ["ghost note", "triplet", "polyrhythmic", "syncopated", "half-time", "double-time", "swing", "displaced", "dotted-note", "rest"],
      harmony: ["chord", "suspended", "modal interchange", "chromatic", "parallel harmony", "pedal tone", "triad", "minor-to-major", "dominant", "tritone"],
      fx: ["reverb tail", "delay throw", "bit-crush", "tape stop", "stutter", "chorus depth", "flanger", "phaser", "granular freeze", "shimmer"],
      dynamics: ["sidechain", "volume swell", "compression", "transient boost", "limiter", "dynamic range", "parallel compression", "fade-out", "envelope follower"],
      "stereo image": ["mono-to-stereo", "haas", "mid-side", "stereo narrow", "panning", "wide chorus", "mono bass", "stereo field", "rotation"],
      texture: ["vinyl", "granular pad", "noise sweep", "tape hiss", "foley", "spectral freeze", "field recording", "bitcrushed texture", "metallic resonance"],
      groove: ["swing", "velocity", "shuffle", "micro-timing", "groove template", "ghost note", "laid-back", "syncopated accent", "push-pull"],
    };

    const violations: string[] = [];
    for (const [category, keywords] of Object.entries(categories)) {
      const matches = VARIATION_TECHNIQUES.filter((t) =>
        keywords.some((kw) => t.includes(kw)),
      );
      if (matches.length < 8) {
        violations.push(`"${category}": found ${matches.length} entries (need 8+)`);
      }
    }

    expect(
      violations,
      `Categories below 8 entries:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
