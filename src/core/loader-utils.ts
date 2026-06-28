/**
 * Utility functions for loading and validating configuration data.
 *
 * @module loader-utils
 */

// ━━━ Exported Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Recursively freezes an object and all nested objects/arrays.
 *
 * @param obj - The object to freeze.
 * @returns The frozen object.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * Creates a fail helper function for validation errors.
 *
 * @param filename - The name of the file being validated.
 * @returns A function that throws an error with a formatted message.
 */
export function createFailHelper(filename: string): (fieldPath: string, constraint: string) => never {
  return (fieldPath: string, constraint: string): never => {
    throw new Error(`${filename}: validation failed: ${fieldPath} — ${constraint}`);
  };
}