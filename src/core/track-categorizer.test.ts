import { describe, it, expect } from "vitest";
import { categorizeTrack } from "./track-categorizer.js";

describe("Track Categorizer", () => {
  describe("track name patterns → buckets", () => {
    it('maps "Sub Bass" → sub', () => {
      expect(categorizeTrack("Sub Bass", [])).toBe("sub");
    });

    it('maps "808 Kick" → sub (808 matched as sub before kick as bass)', () => {
      expect(categorizeTrack("808 Kick", [])).toBe("sub");
    });

    it('maps "Kick Drum" → bass', () => {
      expect(categorizeTrack("Kick Drum", [])).toBe("bass");
    });

    it('maps "Bass Line" → bass', () => {
      expect(categorizeTrack("Bass Line", [])).toBe("bass");
    });

    it('maps "Acoustic Guitar" → low-mid', () => {
      expect(categorizeTrack("Acoustic Guitar", [])).toBe("low-mid");
    });

    it('maps "Keys Layer" → low-mid', () => {
      expect(categorizeTrack("Keys Layer", [])).toBe("low-mid");
    });

    it('maps "Pad Lush" → mid', () => {
      expect(categorizeTrack("Pad Lush", [])).toBe("mid");
    });

    it('maps "Strings Section" → mid', () => {
      expect(categorizeTrack("Strings Section", [])).toBe("mid");
    });

    it('maps "Piano Chords" → mid', () => {
      expect(categorizeTrack("Piano Chords", [])).toBe("mid");
    });

    it('maps "Lead Synth" → high-mid', () => {
      expect(categorizeTrack("Lead Synth", [])).toBe("high-mid");
    });

    it('maps "Vocals Main" → high-mid', () => {
      expect(categorizeTrack("Vocals Main", [])).toBe("high-mid");
    });

    it('maps "Vox Chop" → high-mid', () => {
      expect(categorizeTrack("Vox Chop", [])).toBe("high-mid");
    });

    it('maps "Hi Hat" → high (contains "hat")', () => {
      expect(categorizeTrack("Hi Hat", [])).toBe("high");
    });

    it('maps "Hihat 16th" → high', () => {
      expect(categorizeTrack("Hihat 16th", [])).toBe("high");
    });

    it('maps "Cymbal Crash" → high', () => {
      expect(categorizeTrack("Cymbal Crash", [])).toBe("high");
    });

    it('maps "Shaker Loop" → high', () => {
      expect(categorizeTrack("Shaker Loop", [])).toBe("high");
    });

    it('maps "Percussion" → high', () => {
      expect(categorizeTrack("Percussion", [])).toBe("high");
    });
  });

  describe("device name fallback", () => {
    it('track "Synth 1" with device "Operator" → bass', () => {
      expect(categorizeTrack("Synth 1", ["Operator"])).toBe("bass");
    });

    it('track "Synth 2" with device "Drum Rack" → bass', () => {
      expect(categorizeTrack("Synth 2", ["Drum Rack"])).toBe("bass");
    });

    it('track "Layer" with device "Simpler" → mid', () => {
      expect(categorizeTrack("Layer", ["Simpler"])).toBe("mid");
    });

    it('track "Texture" with device "Wavetable" → mid', () => {
      expect(categorizeTrack("Texture", ["Wavetable"])).toBe("mid");
    });

    it('track "FX" with device "Collision" → mid', () => {
      expect(categorizeTrack("FX", ["Collision"])).toBe("mid");
    });
  });

  describe("default bucket", () => {
    it('track "FX Return" with devices ["Reverb", "Delay"] → full', () => {
      expect(categorizeTrack("FX Return", ["Reverb", "Delay"])).toBe("full");
    });

    it('track "Bus" with no devices → full', () => {
      expect(categorizeTrack("Bus", [])).toBe("full");
    });
  });

  describe("case insensitivity", () => {
    it('"SUB BASS" → sub (uppercase)', () => {
      expect(categorizeTrack("SUB BASS", [])).toBe("sub");
    });

    it('"kick" → bass (lowercase)', () => {
      expect(categorizeTrack("kick", [])).toBe("bass");
    });

    it('"LEAD" → high-mid (uppercase)', () => {
      expect(categorizeTrack("LEAD", [])).toBe("high-mid");
    });
  });

  describe("priority ordering", () => {
    it('"Sub Bass" → sub (sub checked before bass)', () => {
      expect(categorizeTrack("Sub Bass", [])).toBe("sub");
    });

    it('"Bass Guitar" → bass (bass checked before low-mid guitar)', () => {
      expect(categorizeTrack("Bass Guitar", [])).toBe("bass");
    });
  });
});
