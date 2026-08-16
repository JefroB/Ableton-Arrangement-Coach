import { expect } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { renderConfirmationDialog } from "../confirmation-dialog.js";

/**
 * Feature: existing-arrangement-locator-placement
 * Property 11: Warning Message Contains Expected Values
 * Validates: Requirements 7.3
 */

const warningArb = fc
  .integer({ min: 1, max: 20 })
  .chain((placed) =>
    fc.integer({ min: 1, max: 30 }).chain((typicalMin) =>
      fc.integer({ min: typicalMin, max: 30 }).chain((typicalMax) =>
        fc.integer({ min: typicalMin, max: typicalMax }).map((average) => ({
          placed,
          typicalMin,
          typicalMax,
          average,
        })),
      ),
    ),
  );

test.prop([warningArb], { numRuns: 100 })(
  "Property 11: Warning Message Contains Expected Values",
  (warning) => {
    const { placed, typicalMin, typicalMax } = warning;
    const html = renderConfirmationDialog({ markersPlaced: placed, warning });

    expect(html).toContain(String(placed));
    expect(html).toContain(String(typicalMin));

    if (typicalMin !== typicalMax) {
      expect(html).toContain(String(typicalMax));
    }
  },
);
