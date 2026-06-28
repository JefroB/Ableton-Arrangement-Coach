/**
 * Property-based tests for deep-freeze immutability across all 3 detection loaders.
 *
 * Feature: detection-data-externalization, Property 4: Deep-freeze immutability
 *
 * For each loader, call accessor functions and verify that:
 * 1. Object.isFrozen is true at all nesting depths
 * 2. Attempting mutations at random paths has no effect (values remain unchanged)
 *
 * **Validates: Requirements 1.8, 2.13, 3.14**
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

import {
  getRoleThresholds,
  getNameHintPatterns,
} from "../../src/core/role-classification-loader.js";

import {
  getSimilarityWeights,
  getRoleKeywords,
  getClassificationThresholds,
  getFillDetectionThresholds,
} from "../../src/core/content-classification-loader.js";

import {
  getFilterDevicePatterns,
  getExcludedParameterNames,
  getTransitionRelevantPatterns,
  getGapPatterns,
  getTransitionPatterns,
  getGenericMixerParams,
} from "../../src/core/automation-patterns-loader.js";

// ━━━ Helper Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Recursively asserts that Object.isFrozen returns true for the given value
 * and all nested objects/arrays reachable from it.
 *
 * RegExp objects are excluded because they have a mutable `lastIndex` property
 * that prevents Object.isFrozen from returning true.
 */
function assertDeepFrozen(value: unknown, path = "root"): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (value instanceof RegExp) {
    return;
  }
  expect(Object.isFrozen(value), `Expected ${path} to be frozen`).toBe(true);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertDeepFrozen(value[i], `${path}[${i}]`);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      assertDeepFrozen(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`
      );
    }
  }
}

/**
 * Collects all mutable property paths from a frozen object structure.
 * Skips RegExp objects (immutable in intent).
 */
function collectPaths(
  obj: unknown,
  prefix: string[] = []
): string[][] {
  const paths: string[][] = [];
  if (obj === null || typeof obj !== "object" || obj instanceof RegExp) {
    return paths;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const currentPath = [...prefix, String(i)];
      paths.push(currentPath);
      paths.push(...collectPaths(obj[i], currentPath));
    }
  } else {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const currentPath = [...prefix, key];
      paths.push(currentPath);
      paths.push(
        ...collectPaths((obj as Record<string, unknown>)[key], currentPath)
      );
    }
  }
  return paths;
}

/**
 * Attempts to mutate an object at a given path. In strict mode this throws;
 * in sloppy mode it silently fails. We verify the value doesn't change.
 */
function attemptMutationAtPath(
  obj: unknown,
  path: string[]
): { originalValue: unknown; currentValue: unknown } | null {
  if (path.length === 0 || obj === null || typeof obj !== "object") {
    return null;
  }

  let current: Record<string, unknown> | unknown[] = obj as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const next = Array.isArray(current)
      ? current[Number(path[i])]
      : (current as Record<string, unknown>)[path[i]];
    if (next === null || typeof next !== "object") {
      return null;
    }
    current = next as Record<string, unknown>;
  }

  const lastKey = path[path.length - 1];
  const originalValue = Array.isArray(current)
    ? current[Number(lastKey)]
    : (current as Record<string, unknown>)[lastKey];

  try {
    if (Array.isArray(current)) {
      (current as unknown[])[Number(lastKey)] = "__MUTATED__";
    } else {
      (current as Record<string, unknown>)[lastKey] = "__MUTATED__";
    }
  } catch {
    // TypeError in strict mode — expected for frozen objects
  }

  const currentValue = Array.isArray(current)
    ? current[Number(lastKey)]
    : (current as Record<string, unknown>)[lastKey];

  return { originalValue, currentValue };
}

// ━━━ Accessor collections ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AccessorEntry {
  name: string;
  fn: () => unknown;
}

const ROLE_CLASSIFICATION_ACCESSORS: AccessorEntry[] = [
  { name: "getRoleThresholds", fn: getRoleThresholds },
  { name: "getNameHintPatterns", fn: getNameHintPatterns },
];

const CONTENT_CLASSIFICATION_ACCESSORS: AccessorEntry[] = [
  { name: "getSimilarityWeights", fn: getSimilarityWeights },
  { name: "getRoleKeywords", fn: getRoleKeywords },
  { name: "getClassificationThresholds", fn: getClassificationThresholds },
  { name: "getFillDetectionThresholds", fn: getFillDetectionThresholds },
];

const AUTOMATION_PATTERNS_ACCESSORS: AccessorEntry[] = [
  { name: "getFilterDevicePatterns", fn: getFilterDevicePatterns },
  { name: "getExcludedParameterNames", fn: getExcludedParameterNames },
  { name: "getTransitionRelevantPatterns", fn: getTransitionRelevantPatterns },
  { name: "getGapPatterns", fn: getGapPatterns },
  { name: "getTransitionPatterns", fn: getTransitionPatterns },
  { name: "getGenericMixerParams", fn: getGenericMixerParams },
];

const ALL_ACCESSORS: AccessorEntry[] = [
  ...ROLE_CLASSIFICATION_ACCESSORS,
  ...CONTENT_CLASSIFICATION_ACCESSORS,
  ...AUTOMATION_PATTERNS_ACCESSORS,
];

// ━━━ Property Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Feature: detection-data-externalization, Property 4: Deep-freeze immutability
describe("Property 4: Deep-freeze immutability", () => {
  describe("Sub-property 4a: All accessor return values are deeply frozen", () => {
    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getRoleThresholds() is deeply frozen",
      () => {
        const result = getRoleThresholds();
        assertDeepFrozen(result, "getRoleThresholds()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getNameHintPatterns() is deeply frozen",
      () => {
        const result = getNameHintPatterns();
        assertDeepFrozen(result, "getNameHintPatterns()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getSimilarityWeights() is deeply frozen",
      () => {
        const result = getSimilarityWeights();
        assertDeepFrozen(result, "getSimilarityWeights()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getRoleKeywords() is deeply frozen",
      () => {
        const result = getRoleKeywords();
        assertDeepFrozen(result, "getRoleKeywords()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getClassificationThresholds() is deeply frozen",
      () => {
        const result = getClassificationThresholds();
        assertDeepFrozen(result, "getClassificationThresholds()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getFillDetectionThresholds() is deeply frozen",
      () => {
        const result = getFillDetectionThresholds();
        assertDeepFrozen(result, "getFillDetectionThresholds()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getFilterDevicePatterns() is deeply frozen",
      () => {
        const result = getFilterDevicePatterns();
        assertDeepFrozen(result, "getFilterDevicePatterns()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getExcludedParameterNames() is deeply frozen",
      () => {
        const result = getExcludedParameterNames();
        assertDeepFrozen(result, "getExcludedParameterNames()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getTransitionRelevantPatterns() is deeply frozen",
      () => {
        const result = getTransitionRelevantPatterns();
        assertDeepFrozen(result, "getTransitionRelevantPatterns()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getGapPatterns() is deeply frozen",
      () => {
        const result = getGapPatterns();
        assertDeepFrozen(result, "getGapPatterns()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getTransitionPatterns() is deeply frozen",
      () => {
        const result = getTransitionPatterns();
        assertDeepFrozen(result, "getTransitionPatterns()");
      }
    );

    test.prop([fc.constant(null)], { numRuns: 100 })(
      "getGenericMixerParams() is deeply frozen",
      () => {
        const result = getGenericMixerParams();
        assertDeepFrozen(result, "getGenericMixerParams()");
      }
    );
  });

  describe("Sub-property 4b: Mutations at random paths have no effect", () => {
    test.prop(
      [fc.constantFrom(...ALL_ACCESSORS), fc.nat()],
      { numRuns: 100 }
    )(
      "attempting mutation at a random path has no effect on any accessor result",
      (accessor, seed) => {
        const result = accessor.fn();
        const paths = collectPaths(result);

        if (paths.length === 0) {
          return;
        }

        const pathIndex = seed % paths.length;
        const selectedPath = paths[pathIndex];

        const mutationResult = attemptMutationAtPath(result, selectedPath);
        if (mutationResult !== null) {
          expect(mutationResult.currentValue).toEqual(
            mutationResult.originalValue
          );
        }
      }
    );
  });
});
