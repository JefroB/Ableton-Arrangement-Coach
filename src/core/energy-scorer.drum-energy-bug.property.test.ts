/**
 * Bug Condition Exploration Test — Drum Energy Invisible to Scorer
 *
 * This test encodes the EXPECTED behavior after the fix is applied.
 * On UNFIXED code, it MUST FAIL — failure confirms the bug exists.
 *
 * Bug: DrumElementProfile data is computed per section but never connected
 * to the energy scorer. Sections with vastly different drum richness receive
 * identical energy scores because SectionScoringInput has no `drumEnergy`
 * field and EnergyWeights has no `drumEnergyWeight` field.
 *
 * Expected behavior (after fix): sections with higher drumEnergy SHALL
 * receive a higher or equal energy score compared to sections with lower
 * drumEnergy when all other factors are held constant and drumEnergyWeight > 0.
 */

import { describe, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { computeEnergyScores, type SectionScoringInput } from "./energy-scorer.js";
import type { EnergyWeights } from "./genre-registry.js";

// ─── Property 1: Bug Condition — Drum Energy Invisible to Scorer ──────

/**
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
 *
 * Property 1: Bug Condition - Drum Energy Differentiates Sections
 *
 * For any two SectionScoringInput values that are identical in all factors
 * except drumEnergy, where one has a higher drumEnergy value than the other,
 * and drumEnergyWeight > 0, the section with higher drumEnergy SHALL receive
 * a higher or equal energy score.
 *
 * On UNFIXED code this test MUST FAIL because:
 * - SectionScoringInput has no `drumEnergy` field (the field is ignored/nonexistent)
 * - EnergyWeights has no `drumEnergyWeight` field (the weight is ignored/nonexistent)
 * - Therefore both sections produce identical scores regardless of drum richness
 */
describe("Energy Scorer — Property 1: Bug Condition — Drum Energy Invisible to Scorer", () => {
  // Generator: base section with all factors held constant at realistic values
  const baseSectionArb = fc.record({
    activeTrackCount: fc.integer({ min: 2, max: 10 }),
    midiDensity: fc.double({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
    trackPresenceRatio: fc.double({ min: 0.2, max: 0.9, noNaN: true, noDefaultInfinity: true }),
    automationRatio: fc.double({ min: 0, max: 0.8, noNaN: true, noDefaultInfinity: true }),
    frequencyCoverage: fc.double({ min: 0.2, max: 0.9, noNaN: true, noDefaultInfinity: true }),
    velocityIntensity: fc.double({ min: 0.2, max: 0.9, noNaN: true, noDefaultInfinity: true }),
    polyphonyScore: fc.double({ min: 0.1, max: 0.8, noNaN: true, noDefaultInfinity: true }),
    pitchRange: fc.double({ min: 0.1, max: 0.8, noNaN: true, noDefaultInfinity: true }),
  });

  // Generator: two distinct drumEnergy values where low < high with meaningful gap
  const drumEnergyPairArb = fc.tuple(
    fc.double({ min: 0.0, max: 0.35, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.6, max: 1.0, noNaN: true, noDefaultInfinity: true }),
  );

  // Generator: positive drumEnergyWeight (meaningful contribution)
  const drumWeightArb = fc.double({ min: 0.1, max: 0.4, noNaN: true, noDefaultInfinity: true });

  fcTest.prop(
    [baseSectionArb, drumEnergyPairArb, drumWeightArb],
    { numRuns: 100 },
  )(
    "section with higher drumEnergy receives higher or equal score when drumEnergyWeight > 0",
    (baseSection, [lowDrumEnergy, highDrumEnergy], drumEnergyWeight) => {
      // Construct two sections identical in all existing factors, differing only in drumEnergy
      const sectionLowDrum: SectionScoringInput = {
        ...baseSection,
        drumEnergy: lowDrumEnergy,
      } as SectionScoringInput;

      const sectionHighDrum: SectionScoringInput = {
        ...baseSection,
        drumEnergy: highDrumEnergy,
      } as SectionScoringInput;

      // Weights: give drum energy a meaningful weight, distribute the rest evenly
      const remainingWeight = 1.0 - drumEnergyWeight;
      const perFactorWeight = remainingWeight / 8;

      const weights: EnergyWeights = {
        trackCountWeight: perFactorWeight,
        midiDensityWeight: perFactorWeight,
        trackPresenceWeight: perFactorWeight,
        automationWeight: perFactorWeight,
        frequencyCoverageWeight: perFactorWeight,
        velocityIntensityWeight: perFactorWeight,
        polyphonyScoreWeight: perFactorWeight,
        pitchRangeWeight: perFactorWeight,
        drumEnergyWeight: drumEnergyWeight,
      } as EnergyWeights;

      const scores = computeEnergyScores([sectionLowDrum, sectionHighDrum], weights);

      // Expected behavior: section with higher drumEnergy gets higher or equal score
      // On UNFIXED code: both sections produce IDENTICAL scores (bug condition)
      expect(scores[1]).toBeGreaterThanOrEqual(scores[0]);

      // Additionally: with this much drum energy difference (0.25+ gap), scores SHOULD differ
      // This stronger assertion confirms the drum energy factor actually differentiates sections
      expect(scores[1]).toBeGreaterThan(scores[0]);
    },
  );
});
