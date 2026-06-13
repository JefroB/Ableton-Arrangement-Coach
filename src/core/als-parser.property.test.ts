/**
 * Property-based tests for the Als Parser module.
 *
 * Feature: automation-awareness
 */
import { test } from "@fast-check/vitest";
import { describe, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseAlsFile } from "./als-parser.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), "als-parser-prop-test-" + Date.now());

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

let fileCounter = 0;

function createAlsFile(xml: string): string {
  const filename = `test-${fileCounter++}.als`;
  const filePath = join(TEST_DIR, filename);
  const compressed = gzipSync(Buffer.from(xml, "utf-8"));
  writeFileSync(filePath, compressed);
  return filePath;
}

// ─── Generators ────────────────────────────────────────────────────────

/** Generate a valid device name (non-empty, no XML special chars). */
const deviceNameArb = fc.stringOf(
  fc.char().filter((c) => !"<>&\"'\0".includes(c)),
  { minLength: 1, maxLength: 20 },
).filter((s) => s.trim().length > 0);

/** Generate a valid parameter name (non-empty, no XML special chars). */
const paramNameArb = fc.stringOf(
  fc.char().filter((c) => !"<>&\"'\0".includes(c)),
  { minLength: 1, maxLength: 20 },
).filter((s) => s.trim().length > 0);

/** Generate a unique positive integer ID for parameters. */
const paramIdArb = fc.integer({ min: 1000, max: 99999 });

/**
 * A device configuration with parameters.
 * Each parameter has a unique Id and a name.
 */
interface DeviceConfig {
  deviceName: string;
  deviceId: number;
  parameters: { id: number; name: string }[];
}

/**
 * An automation envelope config referencing a PointeeId.
 */
interface EnvelopeConfig {
  pointeeId: number;
  breakpoints: { time: number; value: number }[];
}

/** Generate a device config with 1-4 parameters, all with unique IDs. */
const deviceConfigArb = fc.record({
  deviceName: deviceNameArb,
  deviceId: fc.integer({ min: 100, max: 9999 }),
  parameters: fc.uniqueArray(
    fc.record({
      id: paramIdArb,
      name: paramNameArb,
    }),
    { minLength: 1, maxLength: 4, selector: (p) => p.id },
  ),
});

/** Generate a breakpoint with valid time and value. */
const breakpointArb = fc.record({
  time: fc.integer({ min: 0, max: 128 }),
  value: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
});

// ─── XML Builder Helpers ───────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDeviceXml(device: DeviceConfig): string {
  const paramsXml = device.parameters
    .map(
      (p) => `
              <PluginFloatParameter Id="${p.id}">
                <ParameterName Value="${escapeXml(p.name)}"/>
              </PluginFloatParameter>`,
    )
    .join("");

  return `
          <PluginDevice Id="${device.deviceId}">
            <UserName Value="${escapeXml(device.deviceName)}"/>
            <ParameterList>${paramsXml}
            </ParameterList>
          </PluginDevice>`;
}

function buildEnvelopeXml(envelope: EnvelopeConfig): string {
  const eventsXml = envelope.breakpoints
    .map((bp) => `<FloatEvent Time="${bp.time}" Value="${bp.value}"/>`)
    .join("\n                      ");

  return `
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget>
                    <PointeeId Value="${envelope.pointeeId}"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      ${eventsXml}
                    </Events>
                  </Automation>
                </AutomationEnvelope>`;
}

function buildAlsXml(
  devices: DeviceConfig[],
  envelopes: EnvelopeConfig[],
): string {
  const devicesXml = devices.map(buildDeviceXml).join("");
  const envelopesXml = envelopes.map(buildEnvelopeXml).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <Name><EffectiveName Value="Track 1"/></Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>${envelopesXml}
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>${devicesXml}
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;
}

// ─── Property 18: PointeeId resolution correctness ─────────────────────

// Feature: automation-awareness, Property 18: PointeeId resolution correctness
describe("Property 18: PointeeId resolution correctness", () => {
  /**
   * **Validates: Requirements 15.1, 15.2, 15.3, 15.4**
   *
   * For any automation envelope with a <PointeeId> value that matches a device
   * parameter Id elsewhere in the XML, the parser SHALL resolve and record the
   * corresponding deviceName and parameterName. Unresolved PointeeIds SHALL be
   * marked as null for device/parameter names but still counted as active automation.
   */

  test.prop(
    [
      // Generate 1-3 devices, each with unique parameter IDs
      fc.uniqueArray(deviceConfigArb, {
        minLength: 1,
        maxLength: 3,
        selector: (d) => d.deviceId,
      }),
      // Generate 1-4 breakpoints per envelope
      fc.array(breakpointArb, { minLength: 1, maxLength: 4 }),
      // A set of non-matching PointeeIds that won't collide with device param IDs
      fc.uniqueArray(fc.integer({ min: 200000, max: 299999 }), {
        minLength: 1,
        maxLength: 3,
      }),
    ],
    { numRuns: 100 },
  )(
    "matching PointeeIds resolve to correct deviceName and parameterName, non-matching resolve to null",
    (devices, breakpoints, nonMatchingIds) => {
      // Collect all known parameter IDs from devices (for matching envelopes)
      const allParams: { id: number; deviceName: string; paramName: string }[] = [];
      for (const device of devices) {
        for (const param of device.parameters) {
          allParams.push({
            id: param.id,
            deviceName: device.deviceName,
            paramName: param.name,
          });
        }
      }

      // Deduplicate param IDs (in case of collision across devices in generator)
      const uniqueParamIds = new Map<number, { deviceName: string; paramName: string }>();
      for (const p of allParams) {
        // First device's parameter wins (matches parser behavior - first match in scan order)
        if (!uniqueParamIds.has(p.id)) {
          uniqueParamIds.set(p.id, { deviceName: p.deviceName, paramName: p.paramName });
        }
      }

      // Pick a subset of parameter IDs for matching envelopes
      const matchingIds = Array.from(uniqueParamIds.keys()).slice(0, 3);

      // Build envelopes: some matching, some non-matching
      const matchingEnvelopes: EnvelopeConfig[] = matchingIds.map((id) => ({
        pointeeId: id,
        breakpoints,
      }));

      const nonMatchingEnvelopes: EnvelopeConfig[] = nonMatchingIds.map((id) => ({
        pointeeId: id,
        breakpoints,
      }));

      const allEnvelopes = [...matchingEnvelopes, ...nonMatchingEnvelopes];

      // Build the XML and parse
      const xml = buildAlsXml(devices, allEnvelopes);
      const filePath = createAlsFile(xml);
      const result = parseAlsFile(filePath);

      // Parser should succeed
      expect(result).not.toBeNull();
      if (!result) return;

      // Total envelope count should match
      expect(result.envelopes.length).toBe(allEnvelopes.length);

      // Check matching envelopes: deviceName and parameterName should be resolved
      for (const matchId of matchingIds) {
        const envelope = result.envelopes.find((e) => e.pointeeId === matchId);
        expect(envelope).toBeDefined();
        if (!envelope) continue;

        const expected = uniqueParamIds.get(matchId)!;
        expect(envelope.deviceName).toBe(expected.deviceName);
        expect(envelope.parameterName).toBe(expected.paramName);
      }

      // Check non-matching envelopes: deviceName and parameterName should be null
      for (const nonMatchId of nonMatchingIds) {
        const envelope = result.envelopes.find((e) => e.pointeeId === nonMatchId);
        expect(envelope).toBeDefined();
        if (!envelope) continue;

        expect(envelope.deviceName).toBeNull();
        expect(envelope.parameterName).toBeNull();
      }
    },
  );

  test.prop(
    [
      // Generate 1-3 devices
      fc.uniqueArray(deviceConfigArb, {
        minLength: 1,
        maxLength: 3,
        selector: (d) => d.deviceId,
      }),
      // Breakpoints for the envelopes
      fc.array(breakpointArb, { minLength: 1, maxLength: 4 }),
    ],
    { numRuns: 100 },
  )(
    "all envelopes with matching PointeeIds have non-null deviceName and parameterName",
    (devices, breakpoints) => {
      // Build envelopes only from known parameter IDs
      const matchingEnvelopes: EnvelopeConfig[] = [];
      for (const device of devices) {
        for (const param of device.parameters) {
          matchingEnvelopes.push({ pointeeId: param.id, breakpoints });
        }
      }

      if (matchingEnvelopes.length === 0) return;

      const xml = buildAlsXml(devices, matchingEnvelopes);
      const filePath = createAlsFile(xml);
      const result = parseAlsFile(filePath);

      expect(result).not.toBeNull();
      if (!result) return;

      // Every envelope should be resolved (non-null deviceName and parameterName)
      for (const envelope of result.envelopes) {
        expect(envelope.deviceName).not.toBeNull();
        expect(envelope.parameterName).not.toBeNull();
        // Device and param names should be non-empty strings
        expect(envelope.deviceName!.trim().length).toBeGreaterThan(0);
        expect(envelope.parameterName!.trim().length).toBeGreaterThan(0);
      }
    },
  );

  test.prop(
    [
      // Generate only non-matching IDs (no devices, so nothing to resolve against)
      fc.uniqueArray(fc.integer({ min: 50000, max: 99999 }), {
        minLength: 1,
        maxLength: 5,
      }),
      // Breakpoints
      fc.array(breakpointArb, { minLength: 1, maxLength: 4 }),
    ],
    { numRuns: 100 },
  )(
    "envelopes with no matching device parameters all resolve to null",
    (unmatchedIds, breakpoints) => {
      // No devices at all — all PointeeIds are unresolvable
      const envelopes: EnvelopeConfig[] = unmatchedIds.map((id) => ({
        pointeeId: id,
        breakpoints,
      }));

      const xml = buildAlsXml([], envelopes);
      const filePath = createAlsFile(xml);
      const result = parseAlsFile(filePath);

      expect(result).not.toBeNull();
      if (!result) return;

      // All envelopes should have null device/parameter names
      expect(result.envelopes.length).toBe(unmatchedIds.length);
      for (const envelope of result.envelopes) {
        expect(envelope.deviceName).toBeNull();
        expect(envelope.parameterName).toBeNull();
      }

      // They should still be present (counted as automation, per Requirement 15.4)
      expect(result.envelopes.length).toBe(unmatchedIds.length);
    },
  );

  test.prop(
    [
      // Generate devices
      fc.uniqueArray(deviceConfigArb, {
        minLength: 1,
        maxLength: 2,
        selector: (d) => d.deviceId,
      }),
      // Breakpoints
      fc.array(breakpointArb, { minLength: 2, maxLength: 6 }),
      // Non-matching IDs
      fc.uniqueArray(fc.integer({ min: 200000, max: 299999 }), {
        minLength: 1,
        maxLength: 3,
      }),
    ],
    { numRuns: 100 },
  )(
    "total envelope count equals sum of matching + non-matching envelopes",
    (devices, breakpoints, nonMatchingIds) => {
      // Build matching envelopes from all device parameters
      const matchingEnvelopes: EnvelopeConfig[] = [];
      for (const device of devices) {
        for (const param of device.parameters) {
          matchingEnvelopes.push({ pointeeId: param.id, breakpoints });
        }
      }

      // Build non-matching envelopes
      const nonMatchingEnvelopes: EnvelopeConfig[] = nonMatchingIds.map((id) => ({
        pointeeId: id,
        breakpoints,
      }));

      const allEnvelopes = [...matchingEnvelopes, ...nonMatchingEnvelopes];
      const xml = buildAlsXml(devices, allEnvelopes);
      const filePath = createAlsFile(xml);
      const result = parseAlsFile(filePath);

      expect(result).not.toBeNull();
      if (!result) return;

      // Total count must match — both resolved and unresolved envelopes are included
      expect(result.envelopes.length).toBe(allEnvelopes.length);

      // Count resolved vs unresolved
      const resolved = result.envelopes.filter((e) => e.deviceName !== null);
      const unresolved = result.envelopes.filter((e) => e.deviceName === null);

      expect(resolved.length).toBe(matchingEnvelopes.length);
      expect(unresolved.length).toBe(nonMatchingEnvelopes.length);
    },
  );
});
