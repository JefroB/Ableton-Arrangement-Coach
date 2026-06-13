/**
 * Profile Validator — validates GenreProfile completeness and consistency.
 *
 * Pure function module that checks genre profiles against all structural
 * constraints. Returns an array of validation errors (empty if valid).
 */

import type {
  GenreProfile,
  SubgenreVariant,
  SectionTemplate,
  DetectionRule,
  EnergyWeights,
  DetectionThresholds,
  TransitionPreferences,
} from "./genre-profile-types.js";

// ─── Exported Interfaces ───────────────────────────────────────────────

export interface ValidationError {
  readonly profileId: string;
  readonly fieldPath: string;
  readonly description: string;
}

// ─── Subgenre Resolution (local to avoid circular deps) ────────────────

function resolveSubgenreForValidation(
  parent: GenreProfile,
  variant: SubgenreVariant,
): GenreProfile {
  return {
    id: variant.id,
    name: variant.name,
    family: parent.family,
    tempoRange: variant.tempoRange ?? parent.tempoRange,
    structure: variant.structure ?? parent.structure,
    energyCurveTemplate: variant.energyCurveTemplate ?? parent.energyCurveTemplate,
    transitions: variant.transitions ?? parent.transitions,
    energyWeights: variant.energyWeights ?? parent.energyWeights,
    detectionRules: variant.detectionRules ?? parent.detectionRules,
    detectionThresholds: variant.detectionThresholds ?? parent.detectionThresholds,
  };
}

// ─── Validation Helpers ────────────────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

// ─── Core Validation ───────────────────────────────────────────────────

function validateRequiredFields(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  if (!isNonEmptyString(profile.id)) {
    errors.push({ profileId: id, fieldPath: "id", description: "id must be a non-empty string" });
  }
  if (!isNonEmptyString(profile.name)) {
    errors.push({ profileId: id, fieldPath: "name", description: "name must be a non-empty string" });
  }
  if (!isNonEmptyString(profile.family)) {
    errors.push({ profileId: id, fieldPath: "family", description: "family must be a non-empty string" });
  }

  // tempoRange
  if (profile.tempoRange == null || typeof profile.tempoRange !== "object") {
    errors.push({ profileId: id, fieldPath: "tempoRange", description: "tempoRange must be an object with min and max numbers" });
  } else {
    if (!isNumber(profile.tempoRange.min)) {
      errors.push({ profileId: id, fieldPath: "tempoRange.min", description: "tempoRange.min must be a number" });
    }
    if (!isNumber(profile.tempoRange.max)) {
      errors.push({ profileId: id, fieldPath: "tempoRange.max", description: "tempoRange.max must be a number" });
    }
  }

  // structure
  if (!Array.isArray(profile.structure) || profile.structure.length === 0) {
    errors.push({ profileId: id, fieldPath: "structure", description: "structure must be a non-empty array of SectionTemplate" });
  }

  // energyCurveTemplate
  if (!Array.isArray(profile.energyCurveTemplate) || profile.energyCurveTemplate.length === 0) {
    errors.push({ profileId: id, fieldPath: "energyCurveTemplate", description: "energyCurveTemplate must be a non-empty array of numbers" });
  }

  // transitions
  if (profile.transitions == null || typeof profile.transitions !== "object") {
    errors.push({ profileId: id, fieldPath: "transitions", description: "transitions must be a TransitionPreferences object" });
  } else {
    const t = profile.transitions as TransitionPreferences;
    if (!Array.isArray(t.preferred)) {
      errors.push({ profileId: id, fieldPath: "transitions.preferred", description: "transitions.preferred must be an array" });
    }
    if (!Array.isArray(t.discouraged)) {
      errors.push({ profileId: id, fieldPath: "transitions.discouraged", description: "transitions.discouraged must be an array" });
    }
    if (t.buildDurationRange == null || typeof t.buildDurationRange !== "object") {
      errors.push({ profileId: id, fieldPath: "transitions.buildDurationRange", description: "transitions.buildDurationRange must be an object" });
    } else {
      if (!isNumber(t.buildDurationRange.min)) {
        errors.push({ profileId: id, fieldPath: "transitions.buildDurationRange.min", description: "transitions.buildDurationRange.min must be a number" });
      }
      if (!isNumber(t.buildDurationRange.max)) {
        errors.push({ profileId: id, fieldPath: "transitions.buildDurationRange.max", description: "transitions.buildDurationRange.max must be a number" });
      }
    }
    if (typeof t.dropsExpected !== "boolean") {
      errors.push({ profileId: id, fieldPath: "transitions.dropsExpected", description: "transitions.dropsExpected must be a boolean" });
    }
  }

  // energyWeights
  if (profile.energyWeights == null || typeof profile.energyWeights !== "object") {
    errors.push({ profileId: id, fieldPath: "energyWeights", description: "energyWeights must be an EnergyWeights object" });
  } else {
    const w = profile.energyWeights as EnergyWeights;
    const weightFields: (keyof EnergyWeights)[] = [
      "trackCountWeight",
      "midiDensityWeight",
      "trackPresenceWeight",
      "automationWeight",
      "frequencyCoverageWeight",
      "velocityIntensityWeight",
      "polyphonyScoreWeight",
      "pitchRangeWeight",
    ];
    for (const field of weightFields) {
      if (!isNumber(w[field])) {
        errors.push({ profileId: id, fieldPath: `energyWeights.${field}`, description: `energyWeights.${field} must be a number` });
      }
    }
  }

  // detectionRules
  if (!Array.isArray(profile.detectionRules)) {
    errors.push({ profileId: id, fieldPath: "detectionRules", description: "detectionRules must be an array" });
  }

  // detectionThresholds
  if (profile.detectionThresholds == null || typeof profile.detectionThresholds !== "object") {
    errors.push({ profileId: id, fieldPath: "detectionThresholds", description: "detectionThresholds must be a DetectionThresholds object" });
  } else {
    const dt = profile.detectionThresholds as DetectionThresholds;
    if (!isNumber(dt.flatEnergyMaxDelta)) {
      errors.push({ profileId: id, fieldPath: "detectionThresholds.flatEnergyMaxDelta", description: "detectionThresholds.flatEnergyMaxDelta must be a number" });
    }
    if (!isNumber(dt.missingTransitionMinDelta)) {
      errors.push({ profileId: id, fieldPath: "detectionThresholds.missingTransitionMinDelta", description: "detectionThresholds.missingTransitionMinDelta must be a number" });
    }
    if (!isNumber(dt.similarityCeilingPercent)) {
      errors.push({ profileId: id, fieldPath: "detectionThresholds.similarityCeilingPercent", description: "detectionThresholds.similarityCeilingPercent must be a number" });
    }
  }

  return errors;
}

function validateEnergyWeights(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  if (profile.energyWeights == null || typeof profile.energyWeights !== "object") {
    return errors; // Already caught by required fields check
  }

  const w = profile.energyWeights;
  const weightFields: (keyof EnergyWeights)[] = [
    "trackCountWeight",
    "midiDensityWeight",
    "trackPresenceWeight",
    "automationWeight",
    "frequencyCoverageWeight",
    "velocityIntensityWeight",
    "polyphonyScoreWeight",
    "pitchRangeWeight",
  ];

  let allValid = true;
  for (const field of weightFields) {
    const val = w[field];
    if (!isNumber(val)) {
      allValid = false;
      continue; // Type error already reported
    }
    if (val < 0 || val > 1.0) {
      errors.push({
        profileId: id,
        fieldPath: `energyWeights.${field}`,
        description: `energyWeights.${field} must be between 0 and 1.0 (got ${val})`,
      });
      allValid = false;
    }
  }

  // audioEnergyWeight is optional — validate if present
  if (w.audioEnergyWeight != null) {
    if (!isNumber(w.audioEnergyWeight)) {
      allValid = false;
    } else if (w.audioEnergyWeight < 0 || w.audioEnergyWeight > 1.0) {
      errors.push({
        profileId: id,
        fieldPath: `energyWeights.audioEnergyWeight`,
        description: `energyWeights.audioEnergyWeight must be between 0 and 1.0 (got ${w.audioEnergyWeight})`,
      });
      allValid = false;
    }
  }

  if (allValid) {
    const sum =
      w.trackCountWeight +
      w.midiDensityWeight +
      w.trackPresenceWeight +
      w.automationWeight +
      w.frequencyCoverageWeight +
      w.velocityIntensityWeight +
      w.polyphonyScoreWeight +
      w.pitchRangeWeight +
      (w.audioEnergyWeight ?? 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      errors.push({
        profileId: id,
        fieldPath: "energyWeights.sum",
        description: `energyWeights must sum to 1.0 ± 0.001 (got ${sum})`,
      });
    }
  }

  return errors;
}

function validateSectionTemplates(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  if (!Array.isArray(profile.structure)) {
    return errors; // Already caught by required fields check
  }

  for (let i = 0; i < profile.structure.length; i++) {
    const section = profile.structure[i] as SectionTemplate;
    const prefix = `structure[${i}]`;

    // lengthRange checks
    if (section.lengthRange == null || typeof section.lengthRange !== "object") {
      errors.push({ profileId: id, fieldPath: `${prefix}.lengthRange`, description: "lengthRange must be an object" });
    } else {
      if (!isNumber(section.lengthRange.min) || section.lengthRange.min <= 0) {
        errors.push({
          profileId: id,
          fieldPath: `${prefix}.lengthRange.min`,
          description: `lengthRange.min must be > 0 (got ${section.lengthRange.min})`,
        });
      }
      if (!isNumber(section.lengthRange.max)) {
        errors.push({
          profileId: id,
          fieldPath: `${prefix}.lengthRange.max`,
          description: `lengthRange.max must be a number`,
        });
      }
      if (
        isNumber(section.lengthRange.min) &&
        isNumber(section.lengthRange.max) &&
        section.lengthRange.min > section.lengthRange.max
      ) {
        errors.push({
          profileId: id,
          fieldPath: `${prefix}.lengthRange`,
          description: `lengthRange.min (${section.lengthRange.min}) must be <= lengthRange.max (${section.lengthRange.max})`,
        });
      }
    }

    // energyRange checks
    if (section.energyRange == null || typeof section.energyRange !== "object") {
      errors.push({ profileId: id, fieldPath: `${prefix}.energyRange`, description: "energyRange must be an object" });
    } else {
      if (!isInteger(section.energyRange.min) || section.energyRange.min < 1 || section.energyRange.min > 10) {
        errors.push({
          profileId: id,
          fieldPath: `${prefix}.energyRange.min`,
          description: `energyRange.min must be an integer in range 1-10 (got ${section.energyRange.min})`,
        });
      }
      if (!isInteger(section.energyRange.max) || section.energyRange.max < 1 || section.energyRange.max > 10) {
        errors.push({
          profileId: id,
          fieldPath: `${prefix}.energyRange.max`,
          description: `energyRange.max must be an integer in range 1-10 (got ${section.energyRange.max})`,
        });
      }
      if (
        isInteger(section.energyRange.min) &&
        isInteger(section.energyRange.max) &&
        section.energyRange.min > section.energyRange.max
      ) {
        errors.push({
          profileId: id,
          fieldPath: `${prefix}.energyRange`,
          description: `energyRange.min (${section.energyRange.min}) must be <= energyRange.max (${section.energyRange.max})`,
        });
      }
    }
  }

  return errors;
}

function validateEnergyCurveTemplate(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  if (!Array.isArray(profile.structure) || !Array.isArray(profile.energyCurveTemplate)) {
    return errors; // Already caught by required fields check
  }

  const nonOptionalCount = profile.structure.filter((s) => !s.optional).length;

  if (profile.energyCurveTemplate.length !== nonOptionalCount) {
    errors.push({
      profileId: id,
      fieldPath: "energyCurveTemplate.length",
      description: `energyCurveTemplate length (${profile.energyCurveTemplate.length}) must equal number of non-optional sections (${nonOptionalCount})`,
    });
  }

  for (let i = 0; i < profile.energyCurveTemplate.length; i++) {
    const val = profile.energyCurveTemplate[i];
    if (!isNumber(val)) {
      errors.push({
        profileId: id,
        fieldPath: `energyCurveTemplate[${i}]`,
        description: `energyCurveTemplate[${i}] must be a number`,
      });
    } else if (val < 1 || val > 10) {
      errors.push({
        profileId: id,
        fieldPath: `energyCurveTemplate[${i}]`,
        description: `energyCurveTemplate[${i}] must be in range 1-10 (got ${val})`,
      });
    }
  }

  return errors;
}

function validateTempoRange(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  if (profile.tempoRange == null || typeof profile.tempoRange !== "object") {
    return errors; // Already caught by required fields check
  }

  const { min, max } = profile.tempoRange;

  if (isNumber(min) && min <= 0) {
    errors.push({
      profileId: id,
      fieldPath: "tempoRange.min",
      description: `tempoRange.min must be > 0 (got ${min})`,
    });
  }

  if (isNumber(min) && isNumber(max) && min > max) {
    errors.push({
      profileId: id,
      fieldPath: "tempoRange",
      description: `tempoRange.min (${min}) must be <= tempoRange.max (${max})`,
    });
  }

  if (isNumber(max) && max > 300) {
    errors.push({
      profileId: id,
      fieldPath: "tempoRange.max",
      description: `tempoRange.max must be <= 300 (got ${max})`,
    });
  }

  return errors;
}

function validateDetectionRules(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  if (!Array.isArray(profile.detectionRules)) {
    return errors; // Already caught by required fields check
  }

  const validSeverities = new Set(["info", "warning", "critical"]);

  for (let i = 0; i < profile.detectionRules.length; i++) {
    const rule = profile.detectionRules[i] as DetectionRule;
    const prefix = `detectionRules[${i}]`;

    if (!isNonEmptyString(rule.type)) {
      errors.push({
        profileId: id,
        fieldPath: `${prefix}.type`,
        description: "detectionRule type must be a non-empty string",
      });
    }

    if (!validSeverities.has(rule.severity)) {
      errors.push({
        profileId: id,
        fieldPath: `${prefix}.severity`,
        description: `detectionRule severity must be "info", "warning", or "critical" (got "${rule.severity}")`,
      });
    }

    if (rule.value === undefined || rule.value === null) {
      errors.push({
        profileId: id,
        fieldPath: `${prefix}.value`,
        description: "detectionRule value must be present",
      });
    } else if (typeof rule.value !== "number" && typeof rule.value !== "boolean") {
      errors.push({
        profileId: id,
        fieldPath: `${prefix}.value`,
        description: `detectionRule value must be a number or boolean (got ${typeof rule.value})`,
      });
    }
  }

  return errors;
}

function validateJsonRoundTrip(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];
  const id = profile.id ?? "<unknown>";

  try {
    const serialized = JSON.stringify(profile);
    const deserialized = JSON.parse(serialized) as unknown;
    const reserialized = JSON.stringify(deserialized);

    if (serialized !== reserialized) {
      errors.push({
        profileId: id,
        fieldPath: "JSON.roundTrip",
        description: "Profile does not survive JSON round-trip (serialized forms differ)",
      });
    }
  } catch (e) {
    errors.push({
      profileId: id,
      fieldPath: "JSON.roundTrip",
      description: `Profile fails JSON serialization: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return errors;
}

function validateSubgenres(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!profile.subgenres || profile.subgenres.length === 0) {
    return errors;
  }

  for (let i = 0; i < profile.subgenres.length; i++) {
    const variant = profile.subgenres[i] as SubgenreVariant;
    const resolved = resolveSubgenreForValidation(profile, variant);

    // Run all validation checks on the resolved profile, but prefix errors
    const subErrors = validateProfileInternal(resolved);
    for (const err of subErrors) {
      errors.push({
        profileId: profile.id ?? "<unknown>",
        fieldPath: `subgenres[${i}].${err.fieldPath}`,
        description: err.description,
      });
    }
  }

  return errors;
}

// ─── Internal Combined Validation ──────────────────────────────────────

function validateProfileInternal(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...validateRequiredFields(profile));
  errors.push(...validateEnergyWeights(profile));
  errors.push(...validateSectionTemplates(profile));
  errors.push(...validateEnergyCurveTemplate(profile));
  errors.push(...validateTempoRange(profile));
  errors.push(...validateDetectionRules(profile));
  errors.push(...validateJsonRoundTrip(profile));

  return errors;
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Validates a single GenreProfile against all structural constraints.
 * Returns an array of ValidationError objects (empty if valid).
 */
export function validateProfile(profile: GenreProfile): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate the profile itself
  errors.push(...validateProfileInternal(profile));

  // Validate resolved subgenres
  errors.push(...validateSubgenres(profile));

  return errors;
}

/**
 * Validates all profiles in the provided array.
 * Returns a flat array of all validation errors across all profiles.
 */
export function validateAllProfiles(profiles: readonly GenreProfile[]): ValidationError[] {
  return profiles.flatMap(validateProfile);
}
