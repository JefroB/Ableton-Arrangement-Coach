/**
 * Unit tests for als-parser.ts — Tasks 2.1, 2.2, 2.7
 *
 * Tests parseAlsFile with various inputs: valid gzip'd XML, missing files,
 * oversized files, malformed data, etc.
 * Tests mapAutomationToSections with known section ranges.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseAlsFile, mapAutomationToSections } from "./als-parser.js";
import type { AlsAutomationData } from "./als-parser.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), "als-parser-test-" + Date.now());

function createTestFile(filename: string, content: Buffer): string {
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content);
  return filePath;
}

function createAlsFile(filename: string, xml: string): string {
  const compressed = gzipSync(Buffer.from(xml, "utf-8"));
  return createTestFile(filename, compressed);
}

// ─── Fixtures ──────────────────────────────────────────────────────────

const MINIMAL_ALS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="3">
        <Name><EffectiveName Value="Bass"/></Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget>
                    <PointeeId Value="23456"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      <FloatEvent Time="0" Value="0.5"/>
                      <FloatEvent Time="16" Value="0.8"/>
                      <FloatEvent Time="32" Value="0.3"/>
                    </Events>
                  </Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <AutoFilter Id="100">
                <UserName Value=""/>
                <ParameterList>
                  <PluginFloatParameter Id="23456">
                    <ParameterName Value="Filter Freq"/>
                  </PluginFloatParameter>
                </ParameterList>
              </AutoFilter>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
      <AudioTrack Id="5">
        <Name><EffectiveName Value="Drums"/></Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="1">
                  <EnvelopeTarget>
                    <PointeeId Value="99999"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      <FloatEvent Time="0" Value="1.0"/>
                      <FloatEvent Time="8" Value="0.0"/>
                    </Events>
                  </Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
      </AudioTrack>
      <ReturnTrack Id="7">
        <Name><EffectiveName Value="Reverb Return"/></Name>
      </ReturnTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

const NO_AUTOMATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <Name><EffectiveName Value="Lead"/></Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes/>
            </AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

const NO_TRACKS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks></Tracks>
  </LiveSet>
</Ableton>`;

// ─── Tests ─────────────────────────────────────────────────────────────

describe("parseAlsFile", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("parses a valid .als file with automation envelopes", () => {
    const filePath = createAlsFile("test.als", MINIMAL_ALS_XML);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.trackCount).toBe(3);
    expect(result!.envelopes).toHaveLength(2);
    expect(result!.parseTimeMs).toBeGreaterThan(0);

    // First envelope: MidiTrack (index 0) — PointeeId 23456 resolves to AutoFilter / Filter Freq
    const env0 = result!.envelopes[0]!;
    expect(env0.trackIndex).toBe(0);
    expect(env0.pointeeId).toBe(23456);
    expect(env0.deviceName).toBe("AutoFilter");
    expect(env0.parameterName).toBe("Filter Freq");
    expect(env0.breakpoints).toHaveLength(3);
    expect(env0.breakpoints[0]).toEqual({ time: 0, value: 0.5 });
    expect(env0.breakpoints[1]).toEqual({ time: 16, value: 0.8 });
    expect(env0.breakpoints[2]).toEqual({ time: 32, value: 0.3 });

    // Second envelope: AudioTrack (index 1) — PointeeId 99999 unresolved
    const env1 = result!.envelopes[1]!;
    expect(env1.trackIndex).toBe(1);
    expect(env1.pointeeId).toBe(99999);
    expect(env1.deviceName).toBeNull();
    expect(env1.parameterName).toBeNull();
    expect(env1.breakpoints).toHaveLength(2);
    expect(env1.breakpoints[0]).toEqual({ time: 0, value: 1.0 });
    expect(env1.breakpoints[1]).toEqual({ time: 8, value: 0.0 });
  });

  it("returns data with zero envelopes for project with no automation", () => {
    const filePath = createAlsFile("no-auto.als", NO_AUTOMATION_XML);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.trackCount).toBe(1);
    expect(result!.envelopes).toHaveLength(0);
  });

  it("returns data with zero tracks when Tracks section is empty", () => {
    const filePath = createAlsFile("empty-tracks.als", NO_TRACKS_XML);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.trackCount).toBe(0);
    expect(result!.envelopes).toHaveLength(0);
  });

  it("returns null when file does not exist", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseAlsFile("/nonexistent/path/project.als");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for malformed gzip data", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filePath = createTestFile("malformed.als", Buffer.from("not gzip data at all"));
    const result = parseAlsFile(filePath);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null when decompressed XML exceeds 50MB", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Create a string that decompresses to >50MB
    // A highly repetitive string compresses extremely well
    const bigXml = "<Ableton>" + "x".repeat(51 * 1024 * 1024) + "</Ableton>";
    const compressed = gzipSync(Buffer.from(bigXml, "utf-8"));
    const filePath = createTestFile("huge.als", compressed);

    const result = parseAlsFile(filePath);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds 50MB"),
      // The warn may have additional args
    );
    warnSpy.mockRestore();
  });

  it("correctly assigns track index based on position within Tracks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <AudioTrack Id="1">
        <DeviceChain><MainSequencer><AutomationEnvelopes><Envelopes>
          <AutomationEnvelope Id="0">
            <EnvelopeTarget><PointeeId Value="100"/></EnvelopeTarget>
            <Automation><Events>
              <FloatEvent Time="0" Value="0.1"/>
            </Events></Automation>
          </AutomationEnvelope>
        </Envelopes></AutomationEnvelopes></MainSequencer></DeviceChain>
      </AudioTrack>
      <MidiTrack Id="2">
        <DeviceChain><MainSequencer><AutomationEnvelopes><Envelopes>
          <AutomationEnvelope Id="1">
            <EnvelopeTarget><PointeeId Value="200"/></EnvelopeTarget>
            <Automation><Events>
              <FloatEvent Time="4" Value="0.9"/>
            </Events></Automation>
          </AutomationEnvelope>
        </Envelopes></AutomationEnvelopes></MainSequencer></DeviceChain>
      </MidiTrack>
      <GroupTrack Id="3">
        <DeviceChain><MainSequencer><AutomationEnvelopes><Envelopes>
          <AutomationEnvelope Id="2">
            <EnvelopeTarget><PointeeId Value="300"/></EnvelopeTarget>
            <Automation><Events>
              <FloatEvent Time="8" Value="0.5"/>
            </Events></Automation>
          </AutomationEnvelope>
        </Envelopes></AutomationEnvelopes></MainSequencer></DeviceChain>
      </GroupTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("multi-type.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.trackCount).toBe(3);
    expect(result!.envelopes[0]!.trackIndex).toBe(0); // AudioTrack
    expect(result!.envelopes[0]!.pointeeId).toBe(100);
    expect(result!.envelopes[1]!.trackIndex).toBe(1); // MidiTrack
    expect(result!.envelopes[1]!.pointeeId).toBe(200);
    expect(result!.envelopes[2]!.trackIndex).toBe(2); // GroupTrack
    expect(result!.envelopes[2]!.pointeeId).toBe(300);
  });

  it("handles multiple envelopes per track", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget><PointeeId Value="111"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.0"/>
                    <FloatEvent Time="4" Value="1.0"/>
                  </Events></Automation>
                </AutomationEnvelope>
                <AutomationEnvelope Id="1">
                  <EnvelopeTarget><PointeeId Value="222"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.5"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("multi-envelope.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(2);
    expect(result!.envelopes[0]!.pointeeId).toBe(111);
    expect(result!.envelopes[0]!.breakpoints).toHaveLength(2);
    expect(result!.envelopes[1]!.pointeeId).toBe(222);
    expect(result!.envelopes[1]!.breakpoints).toHaveLength(1);
  });

  it("skips envelopes without a PointeeId", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.5"/>
                  </Events></Automation>
                </AutomationEnvelope>
                <AutomationEnvelope Id="1">
                  <EnvelopeTarget><PointeeId Value="555"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.7"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("no-pointee.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    expect(result!.envelopes[0]!.pointeeId).toBe(555);
  });

  // ─── PointeeId Resolution Tests ──────────────────────────────────────

  it("resolves PointeeId to device name and parameter name (PluginDevice with UserName)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget><PointeeId Value="5000"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.2"/>
                    <FloatEvent Time="8" Value="0.9"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <PluginDevice Id="200">
                <UserName Value="My Synth"/>
                <ParameterList>
                  <PluginFloatParameter Id="5000">
                    <ParameterName Value="Cutoff"/>
                  </PluginFloatParameter>
                  <PluginFloatParameter Id="5001">
                    <ParameterName Value="Resonance"/>
                  </PluginFloatParameter>
                </ParameterList>
              </PluginDevice>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("pointee-resolve-username.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    const env = result!.envelopes[0]!;
    expect(env.deviceName).toBe("My Synth");
    expect(env.parameterName).toBe("Cutoff");
  });

  it("resolves PointeeId using PluginName when UserName is empty", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget><PointeeId Value="7777"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.5"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <PluginDevice Id="300">
                <UserName Value=""/>
                <PluginDesc><PluginInfo><PluginName Value="Serum"/></PluginInfo></PluginDesc>
                <ParameterList>
                  <PluginFloatParameter Id="7777">
                    <ParameterName Value="Osc Mix"/>
                  </PluginFloatParameter>
                </ParameterList>
              </PluginDevice>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("pointee-resolve-pluginname.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    const env = result!.envelopes[0]!;
    expect(env.deviceName).toBe("Serum");
    expect(env.parameterName).toBe("Osc Mix");
  });

  it("resolves PointeeId using device tag name as fallback", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget><PointeeId Value="8888"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.3"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <Eq8 Id="400">
                <ParameterList>
                  <PluginFloatParameter Id="8888">
                    <ParameterName Value="Band 1 Freq"/>
                  </PluginFloatParameter>
                </ParameterList>
              </Eq8>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("pointee-resolve-tagname.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    const env = result!.envelopes[0]!;
    expect(env.deviceName).toBe("Eq8");
    expect(env.parameterName).toBe("Band 1 Freq");
  });

  it("marks unresolved PointeeIds with null device/parameter names", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget><PointeeId Value="99999"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.5"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <AutoFilter Id="500">
                <ParameterList>
                  <PluginFloatParameter Id="11111">
                    <ParameterName Value="Frequency"/>
                  </PluginFloatParameter>
                </ParameterList>
              </AutoFilter>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("unresolved-pointee.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    const env = result!.envelopes[0]!;
    expect(env.pointeeId).toBe(99999);
    expect(env.deviceName).toBeNull();
    expect(env.parameterName).toBeNull();
  });

  it("resolves multiple PointeeIds from multiple devices", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget><PointeeId Value="1001"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="0" Value="0.5"/>
                  </Events></Automation>
                </AutomationEnvelope>
                <AutomationEnvelope Id="1">
                  <EnvelopeTarget><PointeeId Value="2001"/></EnvelopeTarget>
                  <Automation><Events>
                    <FloatEvent Time="4" Value="0.8"/>
                  </Events></Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <AutoFilter Id="600">
                <UserName Value="My Filter"/>
                <ParameterList>
                  <PluginFloatParameter Id="1001">
                    <ParameterName Value="Frequency"/>
                  </PluginFloatParameter>
                </ParameterList>
              </AutoFilter>
              <Compressor2 Id="700">
                <ParameterList>
                  <PluginFloatParameter Id="2001">
                    <ParameterName Value="Threshold"/>
                  </PluginFloatParameter>
                </ParameterList>
              </Compressor2>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFile("multi-device-resolve.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(2);

    const env0 = result!.envelopes[0]!;
    expect(env0.deviceName).toBe("My Filter");
    expect(env0.parameterName).toBe("Frequency");

    const env1 = result!.envelopes[1]!;
    expect(env1.deviceName).toBe("Compressor2");
    expect(env1.parameterName).toBe("Threshold");
  });

  it("returns null for undefined file path (unsaved project)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseAlsFile(undefined as unknown as string);

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});

// ─── mapAutomationToSections Tests ─────────────────────────────────────

describe("mapAutomationToSections", () => {
  it("returns empty map for empty sections array", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Filter",
          parameterName: "Freq",
          breakpoints: [
            { time: 0, value: 0.5 },
            { time: 16, value: 0.8 },
          ],
        },
      ],
      parseTimeMs: 5,
      trackCount: 1,
    };

    const result = mapAutomationToSections(automationData, []);

    expect(result.size).toBe(0);
  });

  it("returns correct summaries for single section with known envelopes", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "AutoFilter",
          parameterName: "Frequency",
          breakpoints: [
            { time: 0, value: 0.2 },
            { time: 4, value: 0.5 },
            { time: 8, value: 0.9 },
          ],
        },
        {
          trackIndex: 0,
          pointeeId: 200,
          deviceName: "AutoFilter",
          parameterName: "Resonance",
          breakpoints: [
            { time: 0, value: 0.3 },
            { time: 8, value: 0.3 }, // same value — not active
          ],
        },
      ],
      parseTimeMs: 3,
      trackCount: 1,
    };

    const sections = [{ startTime: 0, endTime: 16, id: "intro" }];
    const result = mapAutomationToSections(automationData, sections);

    expect(result.size).toBe(1);
    const summaries = result.get("intro")!;
    expect(summaries).toHaveLength(1); // both envelopes on track 0 → single summary
    expect(summaries[0]!.trackIndex).toBe(0);
    expect(summaries[0]!.activeEnvelopeCount).toBe(1); // only first envelope is active (distinct values)
    expect(summaries[0]!.totalBreakpoints).toBe(5); // 3 + 2 breakpoints in range
  });

  it("envelope is 'active' when ≥2 breakpoints with ≥2 distinct values in range", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Filter",
          parameterName: "Cutoff",
          breakpoints: [
            { time: 4, value: 0.3 },
            { time: 8, value: 0.7 },
            { time: 12, value: 0.5 },
          ],
        },
      ],
      parseTimeMs: 2,
      trackCount: 1,
    };

    const sections = [{ startTime: 0, endTime: 16, id: "section-a" }];
    const result = mapAutomationToSections(automationData, sections);

    const summaries = result.get("section-a")!;
    expect(summaries[0]!.activeEnvelopeCount).toBe(1);
  });

  it("envelope is NOT 'active' when <2 breakpoints in range", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Filter",
          parameterName: "Cutoff",
          breakpoints: [
            { time: 2, value: 0.5 },  // only 1 breakpoint in section range
            { time: 20, value: 0.9 },  // outside range
          ],
        },
      ],
      parseTimeMs: 2,
      trackCount: 1,
    };

    const sections = [{ startTime: 0, endTime: 16, id: "section-b" }];
    const result = mapAutomationToSections(automationData, sections);

    const summaries = result.get("section-b")!;
    expect(summaries[0]!.activeEnvelopeCount).toBe(0);
    expect(summaries[0]!.totalBreakpoints).toBe(1); // still counted for total
  });

  it("envelope is NOT 'active' when breakpoints all have same value", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Compressor",
          parameterName: "Threshold",
          breakpoints: [
            { time: 0, value: 0.5 },
            { time: 4, value: 0.5 },
            { time: 8, value: 0.5 },
          ],
        },
      ],
      parseTimeMs: 2,
      trackCount: 1,
    };

    const sections = [{ startTime: 0, endTime: 16, id: "flat" }];
    const result = mapAutomationToSections(automationData, sections);

    const summaries = result.get("flat")!;
    expect(summaries[0]!.activeEnvelopeCount).toBe(0);
    expect(summaries[0]!.totalBreakpoints).toBe(3);
  });

  it("multiple tracks produce separate summaries per section", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "AutoFilter",
          parameterName: "Freq",
          breakpoints: [
            { time: 0, value: 0.2 },
            { time: 8, value: 0.8 },
          ],
        },
        {
          trackIndex: 1,
          pointeeId: 200,
          deviceName: "Reverb",
          parameterName: "Dry/Wet",
          breakpoints: [
            { time: 0, value: 0.1 },
            { time: 4, value: 0.6 },
            { time: 12, value: 0.9 },
          ],
        },
        {
          trackIndex: 2,
          pointeeId: 300,
          deviceName: "EQ8",
          parameterName: "Gain",
          breakpoints: [
            { time: 32, value: 0.4 }, // outside section range
          ],
        },
      ],
      parseTimeMs: 3,
      trackCount: 3,
    };

    const sections = [{ startTime: 0, endTime: 16, id: "verse" }];
    const result = mapAutomationToSections(automationData, sections);

    const summaries = result.get("verse")!;
    // Track 0 and Track 1 have breakpoints in range; Track 2 does not
    expect(summaries).toHaveLength(2);

    const track0 = summaries.find(s => s.trackIndex === 0)!;
    expect(track0.activeEnvelopeCount).toBe(1);
    expect(track0.totalBreakpoints).toBe(2);

    const track1 = summaries.find(s => s.trackIndex === 1)!;
    expect(track1.activeEnvelopeCount).toBe(1);
    expect(track1.totalBreakpoints).toBe(3);
  });

  it("uses section.id as key when available, index as string otherwise", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Filter",
          parameterName: "Cutoff",
          breakpoints: [
            { time: 0, value: 0.5 },
            { time: 4, value: 0.7 },
            { time: 16, value: 0.3 },
            { time: 20, value: 0.9 },
          ],
        },
      ],
      parseTimeMs: 2,
      trackCount: 1,
    };

    const sections = [
      { startTime: 0, endTime: 8, id: "intro" },
      { startTime: 8, endTime: 16 },  // no id — should use "1"
      { startTime: 16, endTime: 24, id: "chorus" },
    ];

    const result = mapAutomationToSections(automationData, sections);

    expect(result.has("intro")).toBe(true);
    expect(result.has("1")).toBe(true);
    expect(result.has("chorus")).toBe(true);
  });

  it("breakpoints exactly at endTime are excluded (half-open interval)", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Filter",
          parameterName: "Cutoff",
          breakpoints: [
            { time: 0, value: 0.2 },
            { time: 8, value: 0.8 },  // exactly at endTime of section 1
            { time: 16, value: 0.4 }, // exactly at endTime of section 2
          ],
        },
      ],
      parseTimeMs: 2,
      trackCount: 1,
    };

    const sections = [
      { startTime: 0, endTime: 8, id: "first" },
      { startTime: 8, endTime: 16, id: "second" },
    ];

    const result = mapAutomationToSections(automationData, sections);

    // Section "first": only time=0 is in [0, 8) — time=8 is excluded
    const first = result.get("first")!;
    expect(first[0]!.totalBreakpoints).toBe(1);
    expect(first[0]!.activeEnvelopeCount).toBe(0); // only 1 breakpoint → not active

    // Section "second": time=8 is in [8, 16), time=16 is excluded
    const second = result.get("second")!;
    expect(second[0]!.totalBreakpoints).toBe(1);
    expect(second[0]!.activeEnvelopeCount).toBe(0); // only 1 breakpoint → not active
  });

  it("sections with no envelopes in range get empty summaries array", () => {
    const automationData: AlsAutomationData = {
      envelopes: [
        {
          trackIndex: 0,
          pointeeId: 100,
          deviceName: "Filter",
          parameterName: "Cutoff",
          breakpoints: [
            { time: 32, value: 0.5 },
            { time: 48, value: 0.9 },
          ],
        },
      ],
      parseTimeMs: 2,
      trackCount: 1,
    };

    const sections = [{ startTime: 0, endTime: 16, id: "empty-section" }];
    const result = mapAutomationToSections(automationData, sections);

    // Section exists in result with empty summaries (no envelopes had breakpoints in range)
    const summaries = result.get("empty-section")!;
    expect(summaries).toHaveLength(0);
  });
});

// ─── Arrangement Automation Tests ──────────────────────────────────────

describe("parseAlsFile — arrangement automation", () => {
  const TEST_DIR_ARR = join(tmpdir(), "als-parser-arr-test-" + Date.now());

  function createAlsFileArr(filename: string, xml: string): string {
    const compressed = gzipSync(Buffer.from(xml, "utf-8"));
    const filePath = join(TEST_DIR_ARR, filename);
    writeFileSync(filePath, compressed);
    return filePath;
  }

  beforeEach(() => {
    mkdirSync(TEST_DIR_ARR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR_ARR, { recursive: true, force: true });
  });

  it("track with a single arrangement lane produces one envelope with correct trackIndex, pointeeId, breakpoints", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="4000"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.3"/>
                  <FloatEvent Time="16" Value="0.7"/>
                  <FloatEvent Time="32" Value="0.5"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("single-lane.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);

    const env = result!.envelopes[0]!;
    expect(env.trackIndex).toBe(0);
    expect(env.pointeeId).toBe(4000);
    expect(env.breakpoints).toHaveLength(3);
    expect(env.breakpoints[0]).toEqual({ time: 0, value: 0.3 });
    expect(env.breakpoints[1]).toEqual({ time: 16, value: 0.7 });
    expect(env.breakpoints[2]).toEqual({ time: 32, value: 0.5 });
  });

  it("track with multiple arrangement lanes produces multiple envelopes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <AudioTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="5001"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.1"/>
                  <FloatEvent Time="8" Value="0.9"/>
                </Events>
              </Automation>
            </AutomationLane>
            <AutomationLane Id="1">
              <AutomationTarget Id="2">
                <PointeeId Value="5002"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="4" Value="0.4"/>
                  <FloatEvent Time="12" Value="0.6"/>
                </Events>
              </Automation>
            </AutomationLane>
            <AutomationLane Id="2">
              <AutomationTarget Id="3">
                <PointeeId Value="5003"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="1.0"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </AudioTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("multi-lane.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(3);
    expect(result!.envelopes[0]!.pointeeId).toBe(5001);
    expect(result!.envelopes[0]!.breakpoints).toHaveLength(2);
    expect(result!.envelopes[1]!.pointeeId).toBe(5002);
    expect(result!.envelopes[1]!.breakpoints).toHaveLength(2);
    expect(result!.envelopes[2]!.pointeeId).toBe(5003);
    expect(result!.envelopes[2]!.breakpoints).toHaveLength(1);
  });

  it("arrangement lane PointeeId resolves deviceName/parameterName via the lookup", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <Vst3PluginDevice Id="200">
                <UserName Value="Matrix 12"/>
                <ParameterList>
                  <PluginFloatParameter Id="6000">
                    <ParameterName Value="Filter Freq"/>
                  </PluginFloatParameter>
                </ParameterList>
              </Vst3PluginDevice>
            </Devices>
          </DeviceChain>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="6000"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.2"/>
                  <FloatEvent Time="16" Value="0.8"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("lane-resolve.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);

    const env = result!.envelopes[0]!;
    expect(env.pointeeId).toBe(6000);
    expect(env.deviceName).toBe("Matrix 12");
    expect(env.parameterName).toBe("Filter Freq");
  });

  it("arrangement lane with unresolvable PointeeId produces null deviceName/parameterName", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <AutoFilter Id="300">
                <ParameterList>
                  <PluginFloatParameter Id="7000">
                    <ParameterName Value="Frequency"/>
                  </PluginFloatParameter>
                </ParameterList>
              </AutoFilter>
            </Devices>
          </DeviceChain>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="99999"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.5"/>
                  <FloatEvent Time="8" Value="0.9"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("lane-unresolved.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);

    const env = result!.envelopes[0]!;
    expect(env.pointeeId).toBe(99999);
    expect(env.deviceName).toBeNull();
    expect(env.parameterName).toBeNull();
  });

  it("lane with missing <AutomationTarget> is skipped", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.5"/>
                  <FloatEvent Time="8" Value="0.9"/>
                </Events>
              </Automation>
            </AutomationLane>
            <AutomationLane Id="1">
              <AutomationTarget Id="2">
                <PointeeId Value="8000"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.3"/>
                  <FloatEvent Time="4" Value="0.7"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("lane-no-target.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    // Only the second lane (with valid AutomationTarget) should be parsed
    expect(result!.envelopes).toHaveLength(1);
    expect(result!.envelopes[0]!.pointeeId).toBe(8000);
  });

  it("lane with missing <PointeeId> is skipped", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.5"/>
                  <FloatEvent Time="8" Value="0.9"/>
                </Events>
              </Automation>
            </AutomationLane>
            <AutomationLane Id="1">
              <AutomationTarget Id="2">
                <PointeeId Value="9000"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.2"/>
                  <FloatEvent Time="16" Value="0.8"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("lane-no-pointee.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    // Only the second lane (with valid PointeeId) should be parsed
    expect(result!.envelopes).toHaveLength(1);
    expect(result!.envelopes[0]!.pointeeId).toBe(9000);
  });

  it("lane with empty <Events/> is skipped", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="3000"/>
              </AutomationTarget>
              <Automation>
                <Events/>
              </Automation>
            </AutomationLane>
            <AutomationLane Id="1">
              <AutomationTarget Id="2">
                <PointeeId Value="3001"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.4"/>
                  <FloatEvent Time="8" Value="0.6"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("lane-empty-events.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    // Only the second lane (with actual events) should produce an envelope
    expect(result!.envelopes).toHaveLength(1);
    expect(result!.envelopes[0]!.pointeeId).toBe(3001);
  });

  it("FloatEvent with non-numeric Time/Value is skipped (remaining events still parsed)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="4500"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.2"/>
                  <FloatEvent Time="abc" Value="0.5"/>
                  <FloatEvent Time="8" Value="xyz"/>
                  <FloatEvent Time="16" Value="0.9"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("lane-bad-events.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);

    const env = result!.envelopes[0]!;
    expect(env.pointeeId).toBe(4500);
    // Only the two valid events should be captured
    expect(env.breakpoints).toHaveLength(2);
    expect(env.breakpoints[0]).toEqual({ time: 0, value: 0.2 });
    expect(env.breakpoints[1]).toEqual({ time: 16, value: 0.9 });
  });

  it("track with both clip envelopes and arrangement lanes produces both in output (no deduplication)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget>
                    <PointeeId Value="1100"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      <FloatEvent Time="0" Value="0.5"/>
                      <FloatEvent Time="8" Value="0.8"/>
                    </Events>
                  </Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            <AutomationLane Id="0">
              <AutomationTarget Id="1">
                <PointeeId Value="1100"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="0" Value="0.3"/>
                  <FloatEvent Time="16" Value="0.9"/>
                </Events>
              </Automation>
            </AutomationLane>
            <AutomationLane Id="1">
              <AutomationTarget Id="2">
                <PointeeId Value="2200"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="4" Value="0.1"/>
                  <FloatEvent Time="12" Value="0.7"/>
                </Events>
              </Automation>
            </AutomationLane>
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("both-types.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    // 1 clip envelope + 2 arrangement lanes = 3 total (no deduplication even for same PointeeId)
    expect(result!.envelopes).toHaveLength(3);

    // Clip envelope comes first (extractEnvelopesFromTrack runs before extractArrangementLanesFromTrack)
    expect(result!.envelopes[0]!.pointeeId).toBe(1100);
    expect(result!.envelopes[0]!.breakpoints[0]).toEqual({ time: 0, value: 0.5 });

    // Arrangement lane with same PointeeId (1100) — separate entry, different breakpoints
    expect(result!.envelopes[1]!.pointeeId).toBe(1100);
    expect(result!.envelopes[1]!.breakpoints[0]).toEqual({ time: 0, value: 0.3 });

    // Second arrangement lane
    expect(result!.envelopes[2]!.pointeeId).toBe(2200);
  });

  it("empty <AutomationLanes/> produces no arrangement envelopes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes/>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

    const filePath = createAlsFileArr("empty-lanes.als", xml);
    const result = parseAlsFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.trackCount).toBe(1);
    expect(result!.envelopes).toHaveLength(0);
  });
});

// ─── Property-Based Tests ──────────────────────────────────────────────

import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";

describe("arrangement automation — property-based tests", () => {
  const TEST_DIR_PBT = join(tmpdir(), "als-parser-pbt-" + Date.now());

  function createAlsFilePbt(filename: string, xml: string): string {
    const compressed = gzipSync(Buffer.from(xml, "utf-8"));
    const filePath = join(TEST_DIR_PBT, filename);
    writeFileSync(filePath, compressed);
    return filePath;
  }

  beforeEach(() => {
    mkdirSync(TEST_DIR_PBT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR_PBT, { recursive: true, force: true });
  });

  // ─── Generators ────────────────────────────────────────────────────────

  /** Generate a single valid FloatEvent with numeric time ≥ 0 and value in [0, 1]. */
  const arbFloatEvent = fc.record({
    time: fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    value: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });

  /** Generate a non-empty array of valid float events (1–10 events per lane). */
  const arbBreakpoints = fc.array(arbFloatEvent, { minLength: 1, maxLength: 10 });

  /** Generate a valid PointeeId (positive integer). */
  const arbPointeeId = fc.integer({ min: 1, max: 99999 });

  /** Generate a single valid arrangement lane with a PointeeId and breakpoints. */
  const arbValidLane = fc.record({
    pointeeId: arbPointeeId,
    breakpoints: arbBreakpoints,
  });

  /** Generate N valid arrangement lanes (1–5 lanes per track). */
  const arbValidLanes = fc.array(arbValidLane, { minLength: 1, maxLength: 5 });

  /**
   * Build XML for a FloatEvent.
   */
  function floatEventXml(time: number, value: number): string {
    return `                  <FloatEvent Time="${time}" Value="${value}"/>`;
  }

  /**
   * Build XML for a single AutomationLane with a given laneId, pointeeId, and breakpoints.
   */
  function automationLaneXml(
    laneId: number,
    pointeeId: number,
    breakpoints: { time: number; value: number }[],
  ): string {
    const eventsXml = breakpoints.map(bp => floatEventXml(bp.time, bp.value)).join("\n");
    return `            <AutomationLane Id="${laneId}">
              <AutomationTarget Id="${laneId + 100}">
                <PointeeId Value="${pointeeId}"/>
              </AutomationTarget>
              <Automation>
                <Events>
${eventsXml}
                </Events>
              </Automation>
            </AutomationLane>`;
  }

  /**
   * Build a full .als XML document wrapping the given arrangement lanes on a single track.
   */
  function buildAlsXml(
    lanes: { pointeeId: number; breakpoints: { time: number; value: number }[] }[],
  ): string {
    const lanesXml = lanes
      .map((lane, i) => automationLaneXml(i, lane.pointeeId, lane.breakpoints))
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes><Envelopes/></AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
${lanesXml}
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;
  }

  // ─── Property 1: Arrangement lane parsing round-trip ─────────────────

  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
   *
   * For any track XML containing arrangement automation lanes with valid
   * AutomationTarget/PointeeId elements and one or more FloatEvent breakpoints:
   * - Output envelope count equals the number of lanes with ≥1 valid breakpoint
   * - Each envelope's pointeeId matches the generated PointeeId
   * - Each envelope's breakpoints match the generated FloatEvents
   * - Each envelope's trackIndex matches the provided value (0 for single-track XML)
   */
  fcTest.prop(
    [arbValidLanes],
    { numRuns: 100 },
  )(
    "Property 1: Arrangement lane parsing round-trip",
    (lanes) => {
      const xml = buildAlsXml(lanes);
      const filePath = createAlsFilePbt(`pbt-roundtrip-${Date.now()}-${Math.random().toString(36).slice(2)}.als`, xml);
      const result = parseAlsFile(filePath);

      // Parser should succeed
      expect(result).not.toBeNull();

      // Only lanes with ≥1 valid breakpoint produce envelopes.
      // Since arbBreakpoints always has minLength: 1 with valid floats, all lanes are valid.
      const expectedCount = lanes.length;
      expect(result!.envelopes).toHaveLength(expectedCount);

      // Each envelope matches the generated lane data
      for (let i = 0; i < lanes.length; i++) {
        const envelope = result!.envelopes[i]!;
        const lane = lanes[i]!;

        // pointeeId matches
        expect(envelope.pointeeId).toBe(lane.pointeeId);

        // trackIndex is 0 (single track in generated XML)
        expect(envelope.trackIndex).toBe(0);

        // breakpoints count matches
        expect(envelope.breakpoints).toHaveLength(lane.breakpoints.length);

        // Each breakpoint's time and value match (accounting for floating-point serialization)
        for (let j = 0; j < lane.breakpoints.length; j++) {
          const expected = lane.breakpoints[j]!;
          const actual = envelope.breakpoints[j]!;
          expect(actual.time).toBeCloseTo(expected.time, 4);
          expect(actual.value).toBeCloseTo(expected.value, 4);
        }
      }
    },
  );

  // ─── Property 3: Unified output preserves all sources ──────────────────

  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * For any track containing both clip envelopes (in <AutomationEnvelopes>) and
   * arrangement automation lanes (in <ArrangerAutomation>), the total number of
   * envelopes in the output SHALL equal the count of valid clip envelopes plus
   * the count of valid arrangement lanes — no deduplication, no loss, regardless
   * of whether PointeeIds overlap between the two sources.
   */

  /** Generate a valid clip envelope XML block. */
  const arbClipEnvelope = fc.tuple(
    arbPointeeId,
    arbBreakpoints,
    fc.integer({ min: 0, max: 9999 }),
  ).map(([pointeeId, breakpoints, envId]) => ({
    xml: `<AutomationEnvelope Id="${envId}">
                  <EnvelopeTarget>
                    <PointeeId Value="${pointeeId}"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      ${breakpoints.map(bp => `<FloatEvent Time="${bp.time}" Value="${bp.value}"/>`).join("\n                      ")}
                    </Events>
                  </Automation>
                </AutomationEnvelope>`,
    pointeeId,
    breakpointCount: breakpoints.length,
  }));

  /** Generate a valid arrangement lane XML block. */
  const arbArrangementLane = fc.tuple(
    arbPointeeId,
    arbBreakpoints,
    fc.integer({ min: 0, max: 9999 }),
    fc.integer({ min: 0, max: 9999 }),
  ).map(([pointeeId, breakpoints, laneId, targetId]) => ({
    xml: `<AutomationLane Id="${laneId}">
              <AutomationTarget Id="${targetId}">
                <PointeeId Value="${pointeeId}"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  ${breakpoints.map(bp => `<FloatEvent Time="${bp.time}" Value="${bp.value}"/>`).join("\n                  ")}
                </Events>
              </Automation>
            </AutomationLane>`,
    pointeeId,
    breakpointCount: breakpoints.length,
  }));

  /**
   * Build a full .als XML with both clip envelopes and arrangement lanes on a single track.
   */
  function buildUnifiedAlsXml(
    clipEnvelopes: { xml: string }[],
    arrangementLanes: { xml: string }[],
  ): string {
    const clipXml = clipEnvelopes.map(e => e.xml).join("\n                ");
    const lanesXml = arrangementLanes.map(l => l.xml).join("\n            ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1">
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                ${clipXml}
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
        </DeviceChain>
        <ArrangerAutomation>
          <AutomationLanes>
            ${lanesXml}
          </AutomationLanes>
        </ArrangerAutomation>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;
  }

  it("Property 3: total envelope count equals clip + arrangement lane count", () => {
    fc.assert(
      fc.property(
        fc.array(arbClipEnvelope, { minLength: 0, maxLength: 5 }),
        fc.array(arbArrangementLane, { minLength: 0, maxLength: 5 }),
        (clipEnvelopes, arrangementLanes) => {
          // Skip trivially empty cases
          fc.pre(clipEnvelopes.length + arrangementLanes.length > 0);

          const xml = buildUnifiedAlsXml(clipEnvelopes, arrangementLanes);
          const filePath = createAlsFilePbt(
            `prop3-${Date.now()}-${Math.random().toString(36).slice(2)}.als`,
            xml,
          );
          const result = parseAlsFile(filePath);

          // Parse must succeed
          expect(result).not.toBeNull();

          // Total envelopes = clip envelopes + arrangement lanes (no deduplication)
          const expectedCount = clipEnvelopes.length + arrangementLanes.length;
          expect(result!.envelopes.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3: no deduplication when PointeeIds overlap between both sources", () => {
    fc.assert(
      fc.property(
        arbPointeeId,
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (sharedPointeeId, clipCount, laneCount) => {
          // Generate clip envelopes all with the same PointeeId
          const clipEnvelopesXml = Array.from({ length: clipCount }, (_, i) =>
            `<AutomationEnvelope Id="${i}">
                  <EnvelopeTarget>
                    <PointeeId Value="${sharedPointeeId}"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      <FloatEvent Time="${i * 4}" Value="${(i + 1) * 0.1}"/>
                    </Events>
                  </Automation>
                </AutomationEnvelope>`,
          );

          // Generate arrangement lanes all with the same PointeeId
          const arrangementLanesXml = Array.from({ length: laneCount }, (_, i) =>
            `<AutomationLane Id="${i + 100}">
              <AutomationTarget Id="${i + 200}">
                <PointeeId Value="${sharedPointeeId}"/>
              </AutomationTarget>
              <Automation>
                <Events>
                  <FloatEvent Time="${i * 8}" Value="${(i + 1) * 0.2}"/>
                </Events>
              </Automation>
            </AutomationLane>`,
          );

          const xml = buildUnifiedAlsXml(
            clipEnvelopesXml.map(x => ({ xml: x })),
            arrangementLanesXml.map(x => ({ xml: x })),
          );
          const filePath = createAlsFilePbt(
            `prop3-overlap-${Date.now()}-${Math.random().toString(36).slice(2)}.als`,
            xml,
          );
          const result = parseAlsFile(filePath);

          expect(result).not.toBeNull();

          // Even though all envelopes share the same PointeeId,
          // total count = clipCount + laneCount (no dedup)
          expect(result!.envelopes.length).toBe(clipCount + laneCount);

          // All envelopes should have the shared PointeeId
          for (const env of result!.envelopes) {
            expect(env.pointeeId).toBe(sharedPointeeId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

