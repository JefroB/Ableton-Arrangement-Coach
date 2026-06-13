/**
 * Fixture generator for als-parser tests.
 * Run: node src/core/__fixtures__/generate-fixtures.mjs
 *
 * Creates:
 * - test-project.als.gz: Valid .als XML with 3 tracks, 3 automation envelopes
 * - no-automation.als.gz: Valid .als XML with 1 track, no automation
 * - malformed.als.gz: Corrupt bytes (not valid gzip)
 */
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Fixture 1: test-project.als.gz ───────────────────────────────────
// 3 tracks: MidiTrack (2 envelopes), AudioTrack (1 envelope), ReturnTrack (0 envelopes)
// PointeeIds: 23456 → AutoFilter "Filter Freq", 23457 → AutoFilter "Resonance"
//             34567 → Delay "Dry/Wet"
// Known breakpoint values for verification in tests.

const testProjectXml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="11.0.0" Creator="Ableton Live 11.3.4">
  <LiveSet>
    <Tracks>
      <MidiTrack Id="3" LomId="0">
        <Name>
          <EffectiveName Value="Bass"/>
        </Name>
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
                      <FloatEvent Time="0" Value="0.2"/>
                      <FloatEvent Time="4" Value="0.5"/>
                      <FloatEvent Time="8" Value="0.8"/>
                      <FloatEvent Time="16" Value="0.3"/>
                    </Events>
                  </Automation>
                </AutomationEnvelope>
                <AutomationEnvelope Id="1">
                  <EnvelopeTarget>
                    <PointeeId Value="23457"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      <FloatEvent Time="0" Value="0.7"/>
                      <FloatEvent Time="8" Value="0.4"/>
                      <FloatEvent Time="16" Value="0.9"/>
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
                <PluginFloatParameter Id="23456">
                  <ParameterName Value="Filter Freq"/>
                </PluginFloatParameter>
                <PluginFloatParameter Id="23457">
                  <ParameterName Value="Resonance"/>
                </PluginFloatParameter>
              </AutoFilter>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
      <AudioTrack Id="4" LomId="0">
        <Name>
          <EffectiveName Value="Pad"/>
        </Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes>
                <AutomationEnvelope Id="0">
                  <EnvelopeTarget>
                    <PointeeId Value="34567"/>
                  </EnvelopeTarget>
                  <Automation>
                    <Events>
                      <FloatEvent Time="0" Value="0.0"/>
                      <FloatEvent Time="16" Value="0.6"/>
                      <FloatEvent Time="32" Value="1.0"/>
                    </Events>
                  </Automation>
                </AutomationEnvelope>
              </Envelopes>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <Delay Id="200">
                <UserName Value=""/>
                <PluginFloatParameter Id="34567">
                  <ParameterName Value="Dry/Wet"/>
                </PluginFloatParameter>
              </Delay>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </AudioTrack>
      <ReturnTrack Id="5" LomId="0">
        <Name>
          <EffectiveName Value="Reverb Return"/>
        </Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes/>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices>
              <Reverb Id="300">
                <UserName Value=""/>
                <PluginFloatParameter Id="45678">
                  <ParameterName Value="Decay Time"/>
                </PluginFloatParameter>
              </Reverb>
            </Devices>
          </DeviceChain>
        </DeviceChain>
      </ReturnTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

// ─── Fixture 2: no-automation.als.gz ──────────────────────────────────
// 1 MidiTrack with empty <Envelopes/> section — valid XML, zero automation.

const noAutomationXml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="11.0.0" Creator="Ableton Live 11.3.4">
  <LiveSet>
    <Tracks>
      <MidiTrack Id="1" LomId="0">
        <Name>
          <EffectiveName Value="Lead"/>
        </Name>
        <DeviceChain>
          <MainSequencer>
            <AutomationEnvelopes>
              <Envelopes/>
            </AutomationEnvelopes>
          </MainSequencer>
          <DeviceChain>
            <Devices/>
          </DeviceChain>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
  </LiveSet>
</Ableton>`;

// ─── Write Fixtures ───────────────────────────────────────────────────

// Fixture 1: gzip valid XML
const testProjectBuffer = gzipSync(Buffer.from(testProjectXml, "utf-8"));
writeFileSync(join(__dirname, "test-project.als.gz"), testProjectBuffer);

// Fixture 2: gzip valid XML (no automation)
const noAutomationBuffer = gzipSync(Buffer.from(noAutomationXml, "utf-8"));
writeFileSync(join(__dirname, "no-automation.als.gz"), noAutomationBuffer);

// Fixture 3: corrupt data (not valid gzip)
const malformedBuffer = Buffer.from("This is not valid gzip data - corrupt bytes for testing error handling!");
writeFileSync(join(__dirname, "malformed.als.gz"), malformedBuffer);

console.log("✓ test-project.als.gz written");
console.log("✓ no-automation.als.gz written");
console.log("✓ malformed.als.gz written");
console.log("All fixtures generated in:", __dirname);
