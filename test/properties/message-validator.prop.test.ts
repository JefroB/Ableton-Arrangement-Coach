/**
 * Property-based tests for the FrontendMessage validator (isValidFrontendMessage).
 *
 * Feature: m5-notes-checklist
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { isValidFrontendMessage } from "../../src/ui/messages.js";

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a non-empty string (1+ characters) for required string fields. */
const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a valid text string for add_note/edit_note (1–500 characters). */
const validNoteText = fc.string({ minLength: 1, maxLength: 500 });

/** Generate a text string that is too short (empty). */
const emptyText = fc.constant("");

/** Generate a text string that is too long (>500 characters). */
const tooLongText = fc.string({ minLength: 501, maxLength: 600 });

/** Generate invalid text: either empty or too long. */
const invalidNoteText = fc.oneof(emptyText, tooLongText);

/** Generate a valid add_note message. */
const validAddNoteArb = fc.record({
  type: fc.constant("add_note" as const),
  sectionId: nonEmptyString,
  text: validNoteText,
});

/** Generate a valid edit_note message. */
const validEditNoteArb = fc.record({
  type: fc.constant("edit_note" as const),
  noteId: nonEmptyString,
  text: validNoteText,
});

/** Generate a valid delete_note message. */
const validDeleteNoteArb = fc.record({
  type: fc.constant("delete_note" as const),
  noteId: nonEmptyString,
});

/** Generate a valid toggle_section_checklist_item message. */
const validToggleSectionChecklistArb = fc.record({
  type: fc.constant("toggle_section_checklist_item" as const),
  sectionId: nonEmptyString,
  itemId: nonEmptyString,
});

/** Generate any valid notes/checklist FrontendMessage. */
const validNotesMessageArb = fc.oneof(
  validAddNoteArb,
  validEditNoteArb,
  validDeleteNoteArb,
  validToggleSectionChecklistArb,
);

/** Generate an add_note message with invalid text length. */
const addNoteInvalidTextArb = fc.record({
  type: fc.constant("add_note" as const),
  sectionId: nonEmptyString,
  text: invalidNoteText,
});

/** Generate an edit_note message with invalid text length. */
const editNoteInvalidTextArb = fc.record({
  type: fc.constant("edit_note" as const),
  noteId: nonEmptyString,
  text: invalidNoteText,
});

/**
 * Generate an add_note message missing the required sectionId field.
 */
const addNoteMissingSectionIdArb = fc.record({
  type: fc.constant("add_note" as const),
  text: validNoteText,
});

/**
 * Generate an add_note message missing the required text field.
 */
const addNoteMissingTextArb = fc.record({
  type: fc.constant("add_note" as const),
  sectionId: nonEmptyString,
});

/**
 * Generate an edit_note message missing the required noteId field.
 */
const editNoteMissingNoteIdArb = fc.record({
  type: fc.constant("edit_note" as const),
  text: validNoteText,
});

/**
 * Generate an edit_note message missing the required text field.
 */
const editNoteMissingTextArb = fc.record({
  type: fc.constant("edit_note" as const),
  noteId: nonEmptyString,
});

/**
 * Generate a delete_note message missing the required noteId field.
 */
const deleteNoteMissingNoteIdArb = fc.record({
  type: fc.constant("delete_note" as const),
});

/**
 * Generate a toggle_section_checklist_item message missing sectionId.
 */
const toggleMissingSectionIdArb = fc.record({
  type: fc.constant("toggle_section_checklist_item" as const),
  itemId: nonEmptyString,
});

/**
 * Generate a toggle_section_checklist_item message missing itemId.
 */
const toggleMissingItemIdArb = fc.record({
  type: fc.constant("toggle_section_checklist_item" as const),
  sectionId: nonEmptyString,
});

/** Generate a message with missing required fields. */
const missingFieldsArb = fc.oneof(
  addNoteMissingSectionIdArb,
  addNoteMissingTextArb,
  editNoteMissingNoteIdArb,
  editNoteMissingTextArb,
  deleteNoteMissingNoteIdArb,
  toggleMissingSectionIdArb,
  toggleMissingItemIdArb,
);

/** Generate a non-string value for wrong-type field testing. */
const nonStringArb = fc.oneof(
  fc.integer(),
  fc.float({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.anything(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 5 }), fc.integer(), { maxKeys: 2 }),
);

/** Generate an add_note message with wrong-type sectionId (not a string). */
const addNoteWrongTypeSectionIdArb = fc.tuple(nonStringArb, validNoteText).map(
  ([sectionId, text]) => ({ type: "add_note" as const, sectionId, text }),
);

/** Generate an add_note message with wrong-type text (not a string). */
const addNoteWrongTypeTextArb = fc.tuple(nonEmptyString, nonStringArb).map(
  ([sectionId, text]) => ({ type: "add_note" as const, sectionId, text }),
);

/** Generate an edit_note message with wrong-type noteId (not a string). */
const editNoteWrongTypeNoteIdArb = fc.tuple(nonStringArb, validNoteText).map(
  ([noteId, text]) => ({ type: "edit_note" as const, noteId, text }),
);

/** Generate an edit_note message with wrong-type text (not a string). */
const editNoteWrongTypeTextArb = fc.tuple(nonEmptyString, nonStringArb).map(
  ([noteId, text]) => ({ type: "edit_note" as const, noteId, text }),
);

/** Generate a delete_note message with wrong-type noteId (not a string). */
const deleteNoteWrongTypeNoteIdArb = nonStringArb.map((noteId) => ({
  type: "delete_note" as const,
  noteId,
}));

/** Generate a toggle_section_checklist_item with wrong-type sectionId. */
const toggleWrongTypeSectionIdArb = fc.tuple(nonStringArb, nonEmptyString).map(
  ([sectionId, itemId]) => ({
    type: "toggle_section_checklist_item" as const,
    sectionId,
    itemId,
  }),
);

/** Generate a toggle_section_checklist_item with wrong-type itemId. */
const toggleWrongTypeItemIdArb = fc.tuple(nonEmptyString, nonStringArb).map(
  ([sectionId, itemId]) => ({
    type: "toggle_section_checklist_item" as const,
    sectionId,
    itemId,
  }),
);

/** Generate a message with wrong-type required fields. */
const wrongTypeFieldsArb = fc.oneof(
  addNoteWrongTypeSectionIdArb,
  addNoteWrongTypeTextArb,
  editNoteWrongTypeNoteIdArb,
  editNoteWrongTypeTextArb,
  deleteNoteWrongTypeNoteIdArb,
  toggleWrongTypeSectionIdArb,
  toggleWrongTypeItemIdArb,
);

// ─── Property 14: Message validator correctness ────────────────────────

// Feature: m5-notes-checklist, Property 14: Message validator correctness
describe("Property 14: Message validator correctness", () => {
  /**
   * **Validates: Requirements 6.5**
   *
   * For any correctly-formed add_note message (sectionId: string, text: 1–500 chars),
   * isValidFrontendMessage SHALL return true.
   */
  test.prop([validAddNoteArb], { numRuns: 100 })(
    "valid add_note messages return true",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(true);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any correctly-formed edit_note message (noteId: string, text: 1–500 chars),
   * isValidFrontendMessage SHALL return true.
   */
  test.prop([validEditNoteArb], { numRuns: 100 })(
    "valid edit_note messages return true",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(true);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any correctly-formed delete_note message (noteId: string),
   * isValidFrontendMessage SHALL return true.
   */
  test.prop([validDeleteNoteArb], { numRuns: 100 })(
    "valid delete_note messages return true",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(true);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any correctly-formed toggle_section_checklist_item message
   * (sectionId: string, itemId: string), isValidFrontendMessage SHALL return true.
   */
  test.prop([validToggleSectionChecklistArb], { numRuns: 100 })(
    "valid toggle_section_checklist_item messages return true",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(true);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any add_note message where text length is <1 or >500,
   * isValidFrontendMessage SHALL return false.
   */
  test.prop([addNoteInvalidTextArb], { numRuns: 100 })(
    "add_note with text length <1 or >500 returns false",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(false);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any edit_note message where text length is <1 or >500,
   * isValidFrontendMessage SHALL return false.
   */
  test.prop([editNoteInvalidTextArb], { numRuns: 100 })(
    "edit_note with text length <1 or >500 returns false",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(false);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any message that is missing required fields (sectionId, noteId, itemId, text)
   * for its declared type, isValidFrontendMessage SHALL return false.
   */
  test.prop([missingFieldsArb], { numRuns: 100 })(
    "messages with missing required fields return false",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(false);
    },
  );

  /**
   * **Validates: Requirements 6.5**
   *
   * For any message where required fields (sectionId, noteId, itemId, text)
   * have wrong types (number instead of string, etc.),
   * isValidFrontendMessage SHALL return false.
   */
  test.prop([wrongTypeFieldsArb], { numRuns: 100 })(
    "messages with wrong-type fields return false",
    (msg) => {
      expect(isValidFrontendMessage(msg)).toBe(false);
    },
  );
});
