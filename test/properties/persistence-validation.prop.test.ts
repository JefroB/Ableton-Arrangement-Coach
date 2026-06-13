/**
 * Property-based tests for the Persistence schema validation fallback.
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { parsePersistenceFile } from "../../src/state/notes-store.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate arbitrary strings that are NOT valid JSON. */
const nonJsonStringArbitrary = fc
  .string({ minLength: 1 })
  .filter((s) => {
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  });

/**
 * Generate valid JSON objects that are missing required PersistenceFile fields.
 * The required fields are: schemaVersion, projectKey, notes, checklistCompletions.
 * We generate objects with at least one required field missing.
 */
const jsonMissingFieldsArbitrary = fc
  .record({
    schemaVersion: fc.option(fc.constant(1), { nil: undefined }),
    projectKey: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    notes: fc.option(fc.constant([]), { nil: undefined }),
    checklistCompletions: fc.option(fc.constant({}), { nil: undefined }),
  })
  .filter((obj) => {
    // Ensure at least one required field is missing
    return (
      obj.schemaVersion === undefined ||
      obj.projectKey === undefined ||
      obj.notes === undefined ||
      obj.checklistCompletions === undefined
    );
  })
  .map((obj) => {
    // Build an object with only the defined fields
    const result: Record<string, unknown> = {};
    if (obj.schemaVersion !== undefined) result["schemaVersion"] = obj.schemaVersion;
    if (obj.projectKey !== undefined) result["projectKey"] = obj.projectKey;
    if (obj.notes !== undefined) result["notes"] = obj.notes;
    if (obj.checklistCompletions !== undefined) result["checklistCompletions"] = obj.checklistCompletions;
    return JSON.stringify(result);
  });

/**
 * Generate valid JSON with a wrong schemaVersion (anything other than 1).
 */
const wrongSchemaVersionArbitrary = fc
  .oneof(
    fc.integer().filter((n) => n !== 1),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
    fc.float({ noNaN: true }),
  )
  .map((wrongVersion) =>
    JSON.stringify({
      schemaVersion: wrongVersion,
      projectKey: "test-project",
      notes: [],
      checklistCompletions: {},
    }),
  );

/**
 * Generate valid JSON with notes array containing invalid Note objects.
 * Valid Note requires: id (string), sectionId (string), text (string), createdAt (number).
 */
const invalidNotesArrayArbitrary = fc
  .array(
    fc.oneof(
      // Missing id
      fc.record({
        sectionId: fc.string(),
        text: fc.string(),
        createdAt: fc.integer(),
      }),
      // Missing sectionId
      fc.record({
        id: fc.string(),
        text: fc.string(),
        createdAt: fc.integer(),
      }),
      // Missing text
      fc.record({
        id: fc.string(),
        sectionId: fc.string(),
        createdAt: fc.integer(),
      }),
      // Missing createdAt
      fc.record({
        id: fc.string(),
        sectionId: fc.string(),
        text: fc.string(),
      }),
      // Wrong types for fields
      fc.record({
        id: fc.integer(),
        sectionId: fc.boolean(),
        text: fc.integer(),
        createdAt: fc.string(),
      }),
    ),
    { minLength: 1 },
  )
  .map((invalidNotes) =>
    JSON.stringify({
      schemaVersion: 1,
      projectKey: "test-project",
      notes: invalidNotes,
      checklistCompletions: {},
    }),
  );

/**
 * Generate valid JSON with checklistCompletions having non-boolean values.
 */
const invalidCompletionsArbitrary = fc
  .dictionary(
    fc.string({ minLength: 1 }),
    fc.oneof(fc.integer(), fc.string(), fc.constant(null), fc.float({ noNaN: true })),
  )
  .filter((dict) => Object.keys(dict).length > 0)
  .map((invalidCompletions) =>
    JSON.stringify({
      schemaVersion: 1,
      projectKey: "test-project",
      notes: [],
      checklistCompletions: invalidCompletions,
    }),
  );

/**
 * Generate a correctly-formed PersistenceFile JSON string.
 */
const validPersistenceFileArbitrary = fc
  .record({
    projectKey: fc.string({ minLength: 1 }),
    notes: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        sectionId: fc.string({ minLength: 1 }),
        text: fc.string({ minLength: 1, maxLength: 500 }),
        createdAt: fc.integer({ min: 0 }),
      }),
    ),
    checklistCompletions: fc.dictionary(fc.string({ minLength: 1 }), fc.boolean()),
  })
  .map(({ projectKey, notes, checklistCompletions }) =>
    JSON.stringify({
      schemaVersion: 1,
      projectKey,
      notes,
      checklistCompletions,
    }),
  );

// ─── Property 13: Persistence schema validation fallback ───────────────

// Feature: m5-notes-checklist, Property 13: Persistence schema validation fallback
describe("Property 13: Persistence schema validation fallback", () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * For any string that is not valid JSON, parsePersistenceFile
   * SHALL return null without throwing.
   */
  test.prop([nonJsonStringArbitrary], { numRuns: 100 })(
    "random non-JSON strings → returns null without throwing",
    (content) => {
      const result = parsePersistenceFile(content);
      expect(result).toBeNull();
    },
  );

  /**
   * **Validates: Requirements 4.6**
   *
   * For any valid JSON object missing required PersistenceFile fields
   * (schemaVersion, projectKey, notes, checklistCompletions),
   * parsePersistenceFile SHALL return null without throwing.
   */
  test.prop([jsonMissingFieldsArbitrary], { numRuns: 100 })(
    "valid JSON objects missing required fields → returns null",
    (content) => {
      const result = parsePersistenceFile(content);
      expect(result).toBeNull();
    },
  );

  /**
   * **Validates: Requirements 4.6**
   *
   * For any valid JSON with a schemaVersion that is not 1,
   * parsePersistenceFile SHALL return null without throwing.
   */
  test.prop([wrongSchemaVersionArbitrary], { numRuns: 100 })(
    "valid JSON with wrong schemaVersion → returns null",
    (content) => {
      const result = parsePersistenceFile(content);
      expect(result).toBeNull();
    },
  );

  /**
   * **Validates: Requirements 4.6**
   *
   * For any valid JSON with a notes array containing objects that do not
   * conform to the Note interface (missing fields or wrong types),
   * parsePersistenceFile SHALL return null without throwing.
   */
  test.prop([invalidNotesArrayArbitrary], { numRuns: 100 })(
    "valid JSON with notes array containing invalid Note objects → returns null",
    (content) => {
      const result = parsePersistenceFile(content);
      expect(result).toBeNull();
    },
  );

  /**
   * **Validates: Requirements 4.6**
   *
   * For any valid JSON with checklistCompletions containing non-boolean values,
   * parsePersistenceFile SHALL return null without throwing.
   */
  test.prop([invalidCompletionsArbitrary], { numRuns: 100 })(
    "valid JSON with checklistCompletions having non-boolean values → returns null",
    (content) => {
      const result = parsePersistenceFile(content);
      expect(result).toBeNull();
    },
  );

  /**
   * **Validates: Requirements 4.6**
   *
   * For any correctly-formed PersistenceFile JSON (valid schemaVersion,
   * projectKey, notes array with valid Note objects, checklistCompletions
   * with boolean values), parsePersistenceFile SHALL return the parsed object
   * (not null).
   */
  test.prop([validPersistenceFileArbitrary], { numRuns: 100 })(
    "correctly-formed PersistenceFile JSON → returns parsed object (not null)",
    (content) => {
      const result = parsePersistenceFile(content);
      expect(result).not.toBeNull();
      expect(result!.schemaVersion).toBe(1);
      expect(Array.isArray(result!.notes)).toBe(true);
      expect(typeof result!.checklistCompletions).toBe("object");
      expect(typeof result!.projectKey).toBe("string");
    },
  );
});
