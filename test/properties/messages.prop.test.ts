/**
 * Property-based tests for the Message Protocol module.
 *
 * Feature: m1-foundation
 */
import { test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import fc from "fast-check";
import {
  handleFrontendMessage,
  type FrontendMessageHandlers,
  type BackendMessage,
  type FrontendMessage,
} from "../../src/ui/messages.js";

// ─── Constants ─────────────────────────────────────────────────────────

/** The set of known FrontendMessage type values to exclude from generators. */
const KNOWN_FRONTEND_TYPES = new Set(["request_state"]);

// ─── Property 6 Generators ─────────────────────────────────────────────

/**
 * Generate a message object with a `type` field that is NOT a recognized
 * FrontendMessage type. Filtered to exclude known types.
 */
const unknownTypeMessageArbitrary = fc
  .record({ type: fc.string() })
  .filter((msg) => !KNOWN_FRONTEND_TYPES.has(msg.type));

/**
 * Generate various non-object inputs to demonstrate resilience against
 * malformed data: numbers, strings, null, undefined, arrays, booleans.
 */
const nonObjectInputArbitrary = fc.oneof(
  fc.integer(),
  fc.float({ noNaN: true }),
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.anything()),
  fc.boolean(),
);

// ─── Property 6: Unknown message types are silently ignored ────────────

// Feature: m1-foundation, Property 6: Unknown message types are silently ignored
describe("Property 6: Unknown message types are silently ignored", () => {
  /**
   * **Validates: Requirements 8.5**
   *
   * For any message object with a `type` field that is not a recognized
   * FrontendMessage type, the message handler SHALL not throw an error
   * and SHALL return without side effects.
   */
  test.prop([unknownTypeMessageArbitrary], { numRuns: 100 })(
    "unrecognized type field does not throw and invokes no handlers",
    (msg) => {
      const handlers: FrontendMessageHandlers = {
        request_state: vi.fn(),
      };

      // Must not throw
      expect(() => handleFrontendMessage(msg, handlers)).not.toThrow();

      // Must not invoke any handler (no side effects)
      expect(handlers.request_state).not.toHaveBeenCalled();
    },
  );

  /**
   * **Validates: Requirements 8.5**
   *
   * For any non-object input (numbers, strings, null, arrays, booleans),
   * the message handler SHALL not throw and SHALL return without side effects.
   */
  test.prop([nonObjectInputArbitrary], { numRuns: 100 })(
    "non-object inputs do not throw and invoke no handlers",
    (input) => {
      const handlers: FrontendMessageHandlers = {
        request_state: vi.fn(),
      };

      // Must not throw
      expect(() => handleFrontendMessage(input, handlers)).not.toThrow();

      // Must not invoke any handler (no side effects)
      expect(handlers.request_state).not.toHaveBeenCalled();
    },
  );
});

// ─── Property 7 Generators ─────────────────────────────────────────────

/** Generate a finite float suitable for time values (no NaN, no Infinity). */
const finiteTime = fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true });

/** Generate a valid Section with finite endTime (JSON-safe). */
const sectionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 0, maxLength: 50 }),
  startTime: finiteTime,
  endTime: finiteTime,
});

/** Generate a valid BackendMessage of type "sections_updated". */
const sectionsUpdatedArb = fc.record({
  type: fc.constant("sections_updated" as const),
  sections: fc.array(sectionArb, { minLength: 0, maxLength: 10 }),
});

/** Generate a valid BackendMessage of type "active_section_changed". */
const activeSectionChangedArb = fc.record({
  type: fc.constant("active_section_changed" as const),
  activeSectionId: fc.oneof(fc.string({ minLength: 1, maxLength: 20 }), fc.constant(null)),
});

/** Generate any valid BackendMessage. */
const backendMessageArb: fc.Arbitrary<BackendMessage> = fc.oneof(
  sectionsUpdatedArb,
  activeSectionChangedArb,
);

/** Generate a valid FrontendMessage (currently only "request_state"). */
const frontendMessageArb: fc.Arbitrary<FrontendMessage> = fc.record({
  type: fc.constant("request_state" as const),
});

// ─── Property 7: Message protocol JSON round-trip ──────────────────────

// Feature: m1-foundation, Property 7: Message protocol JSON round-trip
describe("Property 7: Message protocol JSON round-trip", () => {
  /**
   * **Validates: Requirements 8.6**
   *
   * For any valid BackendMessage or FrontendMessage object (with finite time
   * values), serializing to JSON via JSON.stringify and parsing back via
   * JSON.parse SHALL produce an object deeply equal to the original.
   */
  test.prop([backendMessageArb], { numRuns: 100 })(
    "BackendMessage survives JSON.stringify → JSON.parse round-trip",
    (message) => {
      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toStrictEqual(message);
    },
  );

  test.prop([frontendMessageArb], { numRuns: 100 })(
    "FrontendMessage survives JSON.stringify → JSON.parse round-trip",
    (message) => {
      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toStrictEqual(message);
    },
  );
});
