/**
 * Property-based tests for Confirmation Dialog Displays Placed Count.
 *
 * Feature: existing-arrangement-locator-placement, Property 6: Confirmation Dialog Displays Placed Count
 *
 * **Validates: Requirements 4.4**
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";
import { renderConfirmationDialog } from "../confirmation-dialog.js";

describe("Feature: existing-arrangement-locator-placement", () => {
  describe("Property 6: Confirmation Dialog Displays Placed Count", () => {
    test.prop(
      [fc.integer({ min: 1, max: 30 })],
      { numRuns: 100 },
    )(
      "rendered dialog contains string representation of markersPlaced",
      (markersPlaced) => {
        const html = renderConfirmationDialog({ markersPlaced, warning: null });
        expect(html).toContain(String(markersPlaced));
      },
    );
  });
});
