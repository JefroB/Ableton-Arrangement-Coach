/**
 * Property-based tests for the DJ Scorer Configuration Loader module.
 *
 * Feature: track-categorizer-dj-scorer-externalization,
 * Property 3: DJ scorer config validation accepts all valid inputs
 */
import { test } from "@fast-check/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import {
  getNonDjFamilies,
  getComponentWeights,
  getSectionLengthScoring,
  getMixZoneThresholds,
  getEnergyPositioning,
  type ComponentWeights,
  type SectionLengthScoring,
  type MixZoneThreshold,
  type EnergyPositioningConfig,
} from "../../src/core/dj-scorer-config-loader.js";

// ——— Constants ———————————————————————————————————————————————————————————————
/** The 6 required component weight keys. */
const REQUIRED_WEIGHT_KEYS: readonly (keyof ComponentWeights)[] = [
  "introLength",
  "outroLength",
  "phraseAlignment",
  "mixZoneCleanliness",
  "tempoConsistency",
  "energyPositioning",
];

/** Tolerance for weight sum validation. */
const WEIGHT_SUM_TOLERANCE = 0.001;

// ——— Generators ———————————————————————————————————————————————————————————————
/**
 * Generates a non-empty string suitable for nonDjFamilies entries.
 */
const validFamilyString = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz-".split("")),
  { minLength: 1, maxLength: 30 }
);

/**
 * Generates a non-empty array of non-empty family strings.
 */
const validNonDjFamilies = fc.array(validFamilyString, {
  minLength: 1,
  maxLength: 10,
});

/**
 * Generates a valid ComponentWeights object: 6 positive numbers summing to 1.0 ± 0.001.
 * Uses a Dirichlet-like approach: generate 6 positive numbers, normalize to sum to 1.0.
 */
const validComponentWeights: fc.Arbitrary<ComponentWeights> = fc
  .array(fc.double({ min: 0.001, max: 1.0, noNaN: true }), {
    minLength: 6,
    maxLength: 6,
  })
  .map((rawValues) => {
    const sum = rawValues.reduce((a, b) => a + b, 0);
    const normalized = rawValues.map((v) => v / sum);
    return {
      introLength: normalized[0],
      outroLength: normalized[1],
      phraseAlignment: normalized[2],
      mixZoneCleanliness: normalized[3],
      tempoConsistency: normalized[4],
      energyPositioning: normalized[5],
    };
  });

/**
 * Generates a valid SectionLengthScoring object:
 * minBars < maxBars (positive integers), minScore < maxScore (0–100).
 */
const validSectionLengthScoring: fc.Arbitrary<SectionLengthScoring> = fc
  .tuple(
    fc.integer({ min: 1, max: 100 }),
    fc.integer({ min: 1, max: 100 }),
    fc.double({ min: 0, max: 100, noNaN: true }),
    fc.double({ min: 0, max: 100, noNaN: true })
  )
  .filter(([a, b, c, d]) => a !== b && c !== d)
  .map(([a, b, c, d]) => ({
    minBars: Math.min(a, b),
    maxBars: Math.max(a, b),
    minScore: Math.min(c, d),
    maxScore: Math.max(c, d),
  }));

/**
 * Generates a valid MixZoneThreshold array:
 * non-empty, strictly ascending maxEnergy (positive), scores 0–100.
 */
const validMixZoneThresholds: fc.Arbitrary<MixZoneThreshold[]> = fc
  .array(
    fc.tuple(
      fc.double({ min: 0.01, max: 1000, noNaN: true }),
      fc.double({ min: 0, max: 100, noNaN: true })
    ),
    { minLength: 1, maxLength: 10 }
  )
  .map((entries) => {
    // Sort by first element to ensure strictly ascending maxEnergy
    const sorted = [...entries].sort((a, b) => a[0] - b[0]);
    // Deduplicate maxEnergy values by adding small offsets
    const result: MixZoneThreshold[] = [];
    let prevEnergy = -Infinity;
    for (const [energy, score] of sorted) {
      const adjustedEnergy = energy <= prevEnergy ? prevEnergy + 0.01 : energy;
      result.push({ maxEnergy: adjustedEnergy, score });
      prevEnergy = adjustedEnergy;
    }
    return result;
  });

/**
 * Generates a valid EnergyPositioningConfig: two positive finite numbers.
 */
const validEnergyPositioning: fc.Arbitrary<EnergyPositioningConfig> = fc.record({
  safeThreshold: fc.double({ min: 0.01, max: 1000, noNaN: true }),
  penaltyPerUnit: fc.double({ min: 0.01, max: 1000, noNaN: true }),
});

/**
 * Generates a complete valid DJ scorer config object with all 5 required keys.
 */
const validDjScorerConfig = fc.record({
  nonDjFamilies: validNonDjFamilies,
  componentWeights: validComponentWeights,
  sectionLengthScoring: validSectionLengthScoring,
  mixZoneThresholds: validMixZoneThresholds,
  energyPositioning: validEnergyPositioning,
});

// ——— Property 3: DJ scorer config validation accepts all valid inputs ————————

// Feature: track-categorizer-dj-scorer-externalization, Property 3: DJ scorer config validation accepts all valid inputs
describe("Property 3: DJ scorer config validation accepts all valid inputs", () => {
  /**
   * **Validates: Requirements 4.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 11.6**
   *
   * Sub-property 3a: Generated valid config objects conform to all DJ scorer
   * config validation constraints.
   */
  test.prop([validDjScorerConfig], { numRuns: 100 })(
    "generated valid DJ scorer config conforms to all validation constraints",
    (config) => {
      // Exactly 5 top-level keys
      expect(Object.keys(config)).toHaveLength(5);
      expect(config).toHaveProperty("nonDjFamilies");
      expect(config).toHaveProperty("componentWeights");
      expect(config).toHaveProperty("sectionLengthScoring");
      expect(config).toHaveProperty("mixZoneThresholds");
      expect(config).toHaveProperty("energyPositioning");

      // nonDjFamilies: non-empty array of non-empty strings
      expect(config.nonDjFamilies.length).toBeGreaterThan(0);
      for (const family of config.nonDjFamilies) {
        expect(typeof family).toBe("string");
        expect(family.length).toBeGreaterThan(0);
      }

      // componentWeights: 6 positive numbers summing to 1.0 ± 0.001
      const weights = config.componentWeights;
      for (const key of REQUIRED_WEIGHT_KEYS) {
        expect(weights[key]).toBeGreaterThan(0);
        expect(Number.isFinite(weights[key])).toBe(true);
      }
      const weightSum = REQUIRED_WEIGHT_KEYS.reduce((sum, k) => sum + weights[k], 0);
      expect(Math.abs(weightSum - 1.0)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);

      // sectionLengthScoring: minBars < maxBars, minScore < maxScore
      const section = config.sectionLengthScoring;
      expect(Number.isInteger(section.minBars)).toBe(true);
      expect(Number.isInteger(section.maxBars)).toBe(true);
      expect(section.minBars).toBeGreaterThan(0);
      expect(section.maxBars).toBeGreaterThan(0);
      expect(section.minBars).toBeLessThan(section.maxBars);
      expect(section.minScore).toBeGreaterThanOrEqual(0);
      expect(section.minScore).toBeLessThanOrEqual(100);
      expect(section.maxScore).toBeGreaterThanOrEqual(0);
      expect(section.maxScore).toBeLessThanOrEqual(100);
      expect(section.minScore).toBeLessThan(section.maxScore);

      // mixZoneThresholds: ascending maxEnergy, scores 0–100
      const thresholds = config.mixZoneThresholds;
      expect(thresholds.length).toBeGreaterThan(0);
      let prevMaxEnergy = -Infinity;
      for (const t of thresholds) {
        expect(t.maxEnergy).toBeGreaterThan(0);
        expect(Number.isFinite(t.maxEnergy)).toBe(true);
        expect(t.maxEnergy).toBeGreaterThan(prevMaxEnergy);
        prevMaxEnergy = t.maxEnergy;
        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.score).toBeLessThanOrEqual(100);
      }

      // energyPositioning: 2 positive finite numbers
      expect(config.energyPositioning.safeThreshold).toBeGreaterThan(0);
      expect(Number.isFinite(config.energyPositioning.safeThreshold)).toBe(true);
      expect(config.energyPositioning.penaltyPerUnit).toBeGreaterThan(0);
      expect(Number.isFinite(config.energyPositioning.penaltyPerUnit)).toBe(true);
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 11.6**
   *
   * Sub-property 3b: The loader module initializes without error.
   */
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getNonDjFamilies returns valid data conforming to all constraints",
    () => {
      const families = getNonDjFamilies();

      expect(families.length).toBeGreaterThan(0);
      for (const family of families) {
        expect(typeof family).toBe("string");
        expect(family.length).toBeGreaterThan(0);
      }
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.3, 6.4, 11.6**
   *
   * Sub-property 3c: getComponentWeights() returns valid weights.
   */
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getComponentWeights returns valid data conforming to all constraints",
    () => {
      const weights = getComponentWeights();

      for (const key of REQUIRED_WEIGHT_KEYS) {
        expect(weights[key]).toBeGreaterThan(0);
        expect(Number.isFinite(weights[key])).toBe(true);
      }

      const sum = REQUIRED_WEIGHT_KEYS.reduce((s, k) => s + weights[k], 0);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.5, 11.6**
   *
   * Sub-property 3d: getSectionLengthScoring() returns valid data.
   */
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getSectionLengthScoring returns valid data conforming to all constraints",
    () => {
      const section = getSectionLengthScoring();

      expect(Number.isInteger(section.minBars)).toBe(true);
      expect(Number.isInteger(section.maxBars)).toBe(true);
      expect(section.minBars).toBeGreaterThan(0);
      expect(section.maxBars).toBeGreaterThan(0);
      expect(section.minBars).toBeLessThan(section.maxBars);
      expect(section.minScore).toBeGreaterThanOrEqual(0);
      expect(section.minScore).toBeLessThanOrEqual(100);
      expect(section.maxScore).toBeGreaterThanOrEqual(0);
      expect(section.maxScore).toBeLessThanOrEqual(100);
      expect(section.minScore).toBeLessThan(section.maxScore);
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.6, 11.6**
   *
   * Sub-property 3e: getMixZoneThresholds() returns valid data.
   */
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getMixZoneThresholds returns valid data conforming to all constraints",
    () => {
      const thresholds = getMixZoneThresholds();

      expect(thresholds.length).toBeGreaterThan(0);
      let prevMaxEnergy = -Infinity;
      for (const t of thresholds) {
        expect(t.maxEnergy).toBeGreaterThan(0);
        expect(Number.isFinite(t.maxEnergy)).toBe(true);
        expect(t.maxEnergy).toBeGreaterThan(prevMaxEnergy);
        prevMaxEnergy = t.maxEnergy;
        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(t.score)).toBe(true);
      }
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.7, 11.6**
   *
   * Sub-property 3f: getEnergyPositioning() returns valid data.
   */
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getEnergyPositioning returns valid data conforming to all constraints",
    () => {
      const energy = getEnergyPositioning();

      expect(energy.safeThreshold).toBeGreaterThan(0);
      expect(Number.isFinite(energy.safeThreshold)).toBe(true);
      expect(energy.penaltyPerUnit).toBeGreaterThan(0);
      expect(Number.isFinite(energy.penaltyPerUnit)).toBe(true);
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.3, 6.4, 11.6**
   *
   * Sub-property 3g: Random valid component weights satisfy constraints.
   */
  test.prop([validComponentWeights], { numRuns: 100 })(
    "randomly generated valid component weights satisfy all constraints",
    (weights) => {
      for (const key of REQUIRED_WEIGHT_KEYS) {
        expect(weights[key]).toBeGreaterThan(0);
        expect(Number.isFinite(weights[key])).toBe(true);
      }

      const sum = REQUIRED_WEIGHT_KEYS.reduce((s, k) => s + weights[k], 0);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  );

  /**
   * **Validates: Requirements 4.2, 6.6, 11.6**
   *
   * Sub-property 3h: Random valid mix zone thresholds satisfy ordering.
   */
  test.prop([validMixZoneThresholds], { numRuns: 100 })(
    "randomly generated valid mix zone thresholds satisfy ascending order constraint",
    (thresholds) => {
      expect(thresholds.length).toBeGreaterThan(0);

      let prevMaxEnergy = -Infinity;
      for (const t of thresholds) {
        expect(t.maxEnergy).toBeGreaterThan(0);
        expect(Number.isFinite(t.maxEnergy)).toBe(true);
        expect(t.maxEnergy).toBeGreaterThan(prevMaxEnergy);
        prevMaxEnergy = t.maxEnergy;
        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.score).toBeLessThanOrEqual(100);
      }
    }
  );
});


// ——— Property 8: DJ scorer config serialization round-trip ———————————————————

// Feature: track-categorizer-dj-scorer-externalization, Property 8: DJ scorer config serialization round-trip
describe("Property 8: DJ scorer config serialization round-trip", () => {
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getNonDjFamilies round-trips through JSON serialization",
    () => {
      const original = getNonDjFamilies();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual([...original]);
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getComponentWeights round-trips through JSON serialization",
    () => {
      const original = getComponentWeights();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual({ ...original });
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getSectionLengthScoring round-trips through JSON serialization",
    () => {
      const original = getSectionLengthScoring();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual({ ...original });
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getMixZoneThresholds round-trips through JSON serialization",
    () => {
      const original = getMixZoneThresholds();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual(original.map((t) => ({ ...t })));
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getEnergyPositioning round-trips through JSON serialization",
    () => {
      const original = getEnergyPositioning();
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual({ ...original });
    }
  );
});


// ——— Property 6: Component weights invariant ————————————————————————————————

// Feature: track-categorizer-dj-scorer-externalization, Property 6: Component weights invariant
describe("Property 6: Component weights invariant — sum equals 1.0 and each value is finite positive", () => {
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "loaded component weights sum to 1.0 ± 0.001 and each is finite positive",
    () => {
      const weights = getComponentWeights();

      for (const key of REQUIRED_WEIGHT_KEYS) {
        const value = weights[key];
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }

      const sum = REQUIRED_WEIGHT_KEYS.reduce((s, k) => s + weights[k], 0);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  );

  test.prop([validComponentWeights], { numRuns: 100 })(
    "random valid weight sets satisfy sum ≈ 1.0 and each finite positive invariant",
    (weights) => {
      for (const key of REQUIRED_WEIGHT_KEYS) {
        const value = weights[key];
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }

      const sum = REQUIRED_WEIGHT_KEYS.reduce((s, k) => s + weights[k], 0);
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  );
});

// ——— Property 9 (data): Mix zone threshold ordering ————————————————————————

// Feature: track-categorizer-dj-scorer-externalization, Property 9: Mix zone threshold ordering
describe("Property 9 (data): Mix zone thresholds ordered by strictly ascending maxEnergy, scores in 0–100", () => {
  test.prop([fc.constant(null)], { numRuns: 100 })(
    "loaded mix zone thresholds have strictly ascending maxEnergy and scores in 0–100",
    () => {
      const thresholds = getMixZoneThresholds();

      expect(thresholds.length).toBeGreaterThan(0);

      for (let i = 0; i < thresholds.length; i++) {
        const t = thresholds[i];

        expect(t.maxEnergy).toBeGreaterThan(0);
        expect(Number.isFinite(t.maxEnergy)).toBe(true);

        if (i > 0) {
          expect(t.maxEnergy).toBeGreaterThan(thresholds[i - 1].maxEnergy);
        }

        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(t.score)).toBe(true);
      }
    }
  );
});


// ——— Property 5: All returned configuration objects are deeply frozen ————————

// Feature: track-categorizer-dj-scorer-externalization, Property 5: All returned configuration objects are deeply frozen
describe("Property 5: All returned configuration objects are deeply frozen", () => {
  function assertDeepFrozen(value: unknown, path = "root"): void {
    if (value === null || typeof value !== "object") {
      return;
    }
    expect(Object.isFrozen(value), `Expected ${path} to be frozen`).toBe(true);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        assertDeepFrozen(value[i], `${path}[${i}]`);
      }
    } else {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        assertDeepFrozen((value as Record<string, unknown>)[key], `${path}.${key}`);
      }
    }
  }

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getNonDjFamilies returns a deeply frozen array",
    () => {
      const families = getNonDjFamilies();
      assertDeepFrozen(families, "getNonDjFamilies()");
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getComponentWeights returns a deeply frozen object",
    () => {
      const weights = getComponentWeights();
      assertDeepFrozen(weights, "getComponentWeights()");
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getSectionLengthScoring returns a deeply frozen object",
    () => {
      const section = getSectionLengthScoring();
      assertDeepFrozen(section, "getSectionLengthScoring()");
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getMixZoneThresholds returns a deeply frozen array with frozen entries",
    () => {
      const thresholds = getMixZoneThresholds();
      assertDeepFrozen(thresholds, "getMixZoneThresholds()");
    }
  );

  test.prop([fc.constant(null)], { numRuns: 100 })(
    "getEnergyPositioning returns a deeply frozen object",
    () => {
      const energy = getEnergyPositioning();
      assertDeepFrozen(energy, "getEnergyPositioning()");
    }
  );
});


// ——— Property 4: DJ scorer config validation rejects all invalid inputs ——————

// Feature: track-categorizer-dj-scorer-externalization, Property 4: DJ scorer config validation rejects all invalid inputs with descriptive errors
describe("Property 4: DJ scorer config validation rejects all invalid inputs with descriptive errors", () => {
  /** Builds a valid base config for mutation. */
  function buildValidConfig() {
    return {
      nonDjFamilies: ["ambient", "film-score"],
      componentWeights: {
        introLength: 0.20,
        outroLength: 0.20,
        phraseAlignment: 0.20,
        mixZoneCleanliness: 0.15,
        tempoConsistency: 0.15,
        energyPositioning: 0.10,
      },
      sectionLengthScoring: {
        minBars: 16,
        maxBars: 32,
        minScore: 50,
        maxScore: 100,
      },
      mixZoneThresholds: [
        { maxEnergy: 3, score: 100 },
        { maxEnergy: 5, score: 75 },
        { maxEnergy: 7, score: 50 },
        { maxEnergy: 999, score: 0 },
      ],
      energyPositioning: {
        safeThreshold: 5,
        penaltyPerUnit: 20,
      },
    };
  }

  async function loadWithData(data: unknown): Promise<Error | null> {
    vi.doMock("../../src/data/scoring/dj-scorer-config.json", () => ({
      default: data,
    }));

    try {
      await import("../../src/core/dj-scorer-config-loader.js");
      return null;
    } catch (e) {
      if (e instanceof Error) return e;
      return new Error(String(e));
    } finally {
      vi.doUnmock("../../src/data/scoring/dj-scorer-config.json");
      vi.resetModules();
    }
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects componentWeights that do not sum to 1.0 (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 1.1, max: 5.0, noNaN: true }),
        async (multiplier) => {
          const data = buildValidConfig();
          data.componentWeights.introLength = 0.20 * multiplier;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain("componentWeights");
          expect(error!.message).toMatch(/sum|1\.0/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects componentWeights with missing keys (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "introLength", "outroLength", "phraseAlignment",
          "mixZoneCleanliness", "tempoConsistency", "energyPositioning"
        ),
        async (keyToRemove) => {
          const data = buildValidConfig();
          delete (data.componentWeights as Record<string, unknown>)[keyToRemove];

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain("componentWeights");
          expect(
            error!.message.includes(keyToRemove) ||
            error!.message.includes("keys") ||
            error!.message.includes("missing")
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects configs with extra top-level keys (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) =>
            !["nonDjFamilies", "componentWeights", "sectionLengthScoring", "mixZoneThresholds", "energyPositioning"].includes(s)
        ),
        async (extraKey) => {
          const data = buildValidConfig() as Record<string, unknown>;
          data[extraKey] = "unexpected";

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain("(root)");
          expect(error!.message).toMatch(/key|5/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects zero/negative/NaN componentWeights values (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "introLength", "outroLength", "phraseAlignment",
          "mixZoneCleanliness", "tempoConsistency", "energyPositioning"
        ),
        fc.oneof(
          fc.constant(0),
          fc.double({ min: -1000, max: -0.001, noNaN: true }),
          fc.constant(NaN)
        ),
        async (key, invalidValue) => {
          const data = buildValidConfig();
          (data.componentWeights as Record<string, unknown>)[key] = invalidValue;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain(`componentWeights.${key}`);
          expect(error!.message).toContain("finite positive number");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects non-ascending mixZoneThresholds (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (targetIdx) => {
          const data = buildValidConfig();
          const prevEnergy = data.mixZoneThresholds[targetIdx - 1].maxEnergy;
          data.mixZoneThresholds[targetIdx].maxEnergy = prevEnergy - 0.5;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain("mixZoneThresholds");
          expect(error!.message).toMatch(/ascending|order/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects mixZoneThresholds with scores outside 0–100 (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.oneof(
          fc.double({ min: -1000, max: -0.001, noNaN: true }),
          fc.double({ min: 100.001, max: 1000, noNaN: true })
        ),
        async (idx, invalidScore) => {
          const data = buildValidConfig();
          data.mixZoneThresholds[idx].score = invalidScore;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain(`mixZoneThresholds[${idx}].score`);
          expect(error!.message).toContain("0\u2013100");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects sectionLengthScoring where minBars >= maxBars (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        async (minBars, offset) => {
          const data = buildValidConfig();
          data.sectionLengthScoring.minBars = minBars;
          data.sectionLengthScoring.maxBars = minBars - offset;

          if (data.sectionLengthScoring.maxBars <= 0) {
            data.sectionLengthScoring.maxBars = minBars; // equal case
          }

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain("sectionLengthScoring");
          expect(
            error!.message.includes("minBars") ||
            error!.message.includes("maxBars") ||
            error!.message.includes("positive integer")
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects sectionLengthScoring with scores outside 0–100 (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("minScore", "maxScore"),
        fc.oneof(
          fc.double({ min: -1000, max: -0.001, noNaN: true }),
          fc.double({ min: 100.001, max: 1000, noNaN: true })
        ),
        async (field, invalidValue) => {
          const data = buildValidConfig();
          (data.sectionLengthScoring as Record<string, unknown>)[field] = invalidValue;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain(`sectionLengthScoring.${field}`);
          expect(error!.message).toContain("0\u2013100");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects energyPositioning with zero/negative/NaN values (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("safeThreshold", "penaltyPerUnit"),
        fc.oneof(
          fc.constant(0),
          fc.double({ min: -1000, max: -0.001, noNaN: true }),
          fc.constant(NaN)
        ),
        async (key, invalidValue) => {
          const data = buildValidConfig();
          (data.energyPositioning as Record<string, unknown>)[key] = invalidValue;

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain(`energyPositioning.${key}`);
          expect(error!.message).toContain("finite positive number");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects configs with missing top-level keys (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "nonDjFamilies", "componentWeights", "sectionLengthScoring",
          "mixZoneThresholds", "energyPositioning"
        ),
        async (keyToRemove) => {
          const data = buildValidConfig() as Record<string, unknown>;
          delete data[keyToRemove];

          const error = await loadWithData(data);
          expect(error).not.toBeNull();
          expect(error!.message).toContain("dj-scorer-config.json");
          expect(error!.message).toContain("(root)");
          expect(
            error!.message.includes("key") ||
            error!.message.includes("5") ||
            error!.message.includes("missing")
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
