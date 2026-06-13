/**
 * Unit tests for genre-fill-profiles.ts
 * Tests getGenreFillProfile function and GenreFillProfile data integrity.
 */

import { describe, it, expect } from "vitest";
import { getGenreFillProfile, type GenreFillProfile } from "./genre-registry.js";

// ─── Null / Unknown Handling ────────────────────────────────────────────

describe("getGenreFillProfile — null/unknown handling", () => {
  it("returns null for null genre", () => {
    expect(getGenreFillProfile(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getGenreFillProfile("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(getGenreFillProfile("   ")).toBeNull();
  });

  it("returns null for unknown genre", () => {
    expect(getGenreFillProfile("polka")).toBeNull();
  });

  it("returns null for partially matching but invalid genre", () => {
    expect(getGenreFillProfile("technooo")).toBeNull();
  });
});

// ─── Case-Insensitive Matching ──────────────────────────────────────────

describe("getGenreFillProfile — case-insensitive matching", () => {
  it("matches 'Techno' (capitalized)", () => {
    expect(getGenreFillProfile("Techno")).not.toBeNull();
  });

  it("matches 'TECHNO' (uppercase)", () => {
    expect(getGenreFillProfile("TECHNO")).not.toBeNull();
  });

  it("matches 'tEcHnO' (mixed case)", () => {
    expect(getGenreFillProfile("tEcHnO")).not.toBeNull();
  });

  it("matches 'Trance' (capitalized)", () => {
    expect(getGenreFillProfile("Trance")).not.toBeNull();
  });

  it("matches 'DRUM AND BASS' (uppercase)", () => {
    expect(getGenreFillProfile("DRUM AND BASS")).not.toBeNull();
  });
});

// ─── Whitespace Trimming ────────────────────────────────────────────────

describe("getGenreFillProfile — whitespace trimming", () => {
  it("trims leading/trailing whitespace", () => {
    expect(getGenreFillProfile("  techno  ")).not.toBeNull();
  });

  it("trims tabs", () => {
    expect(getGenreFillProfile("\ttrance\t")).not.toBeNull();
  });
});

// ─── Techno / Tech House Profile ────────────────────────────────────────

describe("getGenreFillProfile — techno/tech-house", () => {
  it("returns profile for 'techno'", () => {
    const profile = getGenreFillProfile("techno");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("hat-roll");
    expect(profile!.expectedFillTypes).toContain("snare-roll");
    expect(profile!.expectedFillTypes).toContain("cymbal-fill");
  });

  it("returns house fill profile for 'tech house' (tech-house is a house subgenre)", () => {
    const house = getGenreFillProfile("house");
    const techHouse = getGenreFillProfile("tech-house");
    // tech-house is a subgenre of house, returns house's fill profile
    expect(techHouse).toEqual(house);
  });

  it("returns null for 'tech house' (not an alias or subgenre ID)", () => {
    const techHouse = getGenreFillProfile("tech house");
    expect(techHouse).toBeNull();
  });

  it("has fill intervals of [8, 16]", () => {
    const profile = getGenreFillProfile("techno")!;
    expect(profile.typicalFillIntervals).toEqual([8, 16]);
  });

  it("has core elements: kick, hi-hat, clap", () => {
    const profile = getGenreFillProfile("techno")!;
    expect(profile.coreElements).toContain("kick");
    expect(profile.coreElements).toContain("hi-hat");
    expect(profile.coreElements).toContain("clap");
  });

  it("has conditional elements: ride (breakdown), crash (drop)", () => {
    const profile = getGenreFillProfile("techno")!;
    expect(profile.conditionalElements.get("ride")).toEqual(["breakdown"]);
    expect(profile.conditionalElements.get("crash")).toEqual(["drop"]);
  });
});

// ─── Trance Profile ─────────────────────────────────────────────────────

describe("getGenreFillProfile — trance", () => {
  it("returns profile for 'trance'", () => {
    const profile = getGenreFillProfile("trance");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("tom-fill");
    expect(profile!.expectedFillTypes).toContain("snare-roll");
    expect(profile!.expectedFillTypes).toContain("cymbal-fill");
  });

  it("has core elements: kick, snare, hi-hat", () => {
    const profile = getGenreFillProfile("trance")!;
    expect(profile.coreElements).toContain("kick");
    expect(profile.coreElements).toContain("snare");
    expect(profile.coreElements).toContain("hi-hat");
  });

  it("has conditional elements: crash (build, drop), tom (fill)", () => {
    const profile = getGenreFillProfile("trance")!;
    expect(profile.conditionalElements.get("crash")).toEqual(["build", "drop"]);
    expect(profile.conditionalElements.get("tom")).toEqual(["fill"]);
  });
});

// ─── Drum and Bass Profile ──────────────────────────────────────────────

describe("getGenreFillProfile — drum-and-bass", () => {
  it("returns profile for 'drum and bass'", () => {
    const profile = getGenreFillProfile("drum and bass");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("snare-roll");
    expect(profile!.expectedFillTypes).toContain("hat-roll");
  });

  it("matches 'drum-and-bass' alias", () => {
    expect(getGenreFillProfile("drum-and-bass")).not.toBeNull();
  });

  it("matches 'dnb' alias", () => {
    const dnb = getGenreFillProfile("dnb");
    const full = getGenreFillProfile("drum and bass");
    expect(dnb).toEqual(full);
  });

  it("matches 'd&b' alias", () => {
    expect(getGenreFillProfile("d&b")).not.toBeNull();
  });

  it("has higher fill frequency (2 per 16 bars)", () => {
    const profile = getGenreFillProfile("drum and bass")!;
    expect(profile.expectedFillFrequency).toBe(2);
  });

  it("has conditional ride in rolling sections", () => {
    const profile = getGenreFillProfile("dnb")!;
    expect(profile.conditionalElements.get("ride")).toEqual(["rolling section"]);
  });
});

// ─── Trap / Hip-Hop Profile ─────────────────────────────────────────────

describe("getGenreFillProfile — trap/hip-hop", () => {
  it("returns profile for 'trap'", () => {
    const profile = getGenreFillProfile("trap");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("hat-roll");
    expect(profile!.expectedFillTypes).toContain("808-roll");
  });

  it("matches 'hip-hop' alias", () => {
    const trap = getGenreFillProfile("trap");
    const hipHop = getGenreFillProfile("hip-hop");
    expect(hipHop).toEqual(trap);
  });

  it("matches 'hip hop' alias", () => {
    expect(getGenreFillProfile("hip hop")).not.toBeNull();
  });

  it("matches 'hiphop' alias", () => {
    expect(getGenreFillProfile("hiphop")).not.toBeNull();
  });

  it("has fill intervals of [4, 8] (shorter phrases)", () => {
    const profile = getGenreFillProfile("trap")!;
    expect(profile.typicalFillIntervals).toEqual([4, 8]);
  });

  it("has core elements: kick, hi-hat, snare", () => {
    const profile = getGenreFillProfile("trap")!;
    expect(profile.coreElements).toContain("kick");
    expect(profile.coreElements).toContain("hi-hat");
    expect(profile.coreElements).toContain("snare");
  });
});

// ─── House / Deep House Profile ─────────────────────────────────────────

describe("getGenreFillProfile — house/deep-house", () => {
  it("returns profile for 'house'", () => {
    const profile = getGenreFillProfile("house");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("hat-roll");
    expect(profile!.expectedFillTypes).toContain("percussion-fill");
  });

  it("returns null for 'deep house' (space-separated, not an alias)", () => {
    const deepHouse = getGenreFillProfile("deep house");
    // "deep house" with space is not a registered alias or subgenre ID
    expect(deepHouse).toBeNull();
  });

  it("matches 'deep-house' alias", () => {
    expect(getGenreFillProfile("deep-house")).not.toBeNull();
  });

  it("has core elements: kick, hi-hat, clap", () => {
    const profile = getGenreFillProfile("house")!;
    expect(profile.coreElements).toContain("kick");
    expect(profile.coreElements).toContain("hi-hat");
    expect(profile.coreElements).toContain("clap");
  });

  it("has conditional ride (groove) and percussion (buildup)", () => {
    const profile = getGenreFillProfile("house")!;
    expect(profile.conditionalElements.get("ride")).toEqual(["groove"]);
    expect(profile.conditionalElements.get("percussion")).toEqual(["buildup"]);
  });
});

// ─── Minimal / Microhouse Profile ───────────────────────────────────────

describe("getGenreFillProfile — minimal/microhouse", () => {
  it("returns profile for 'minimal'", () => {
    const profile = getGenreFillProfile("minimal");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("percussion-fill");
  });

  it("matches 'microhouse' alias", () => {
    const minimal = getGenreFillProfile("minimal");
    const micro = getGenreFillProfile("microhouse");
    expect(micro).toEqual(minimal);
  });

  it("matches 'micro house' alias", () => {
    expect(getGenreFillProfile("micro house")).not.toBeNull();
  });

  it("matches 'micro-house' alias", () => {
    expect(getGenreFillProfile("micro-house")).not.toBeNull();
  });

  it("has longer fill intervals [16, 32]", () => {
    const profile = getGenreFillProfile("minimal")!;
    expect(profile.typicalFillIntervals).toEqual([16, 32]);
  });

  it("has lower fill frequency (0.5 per 16 bars)", () => {
    const profile = getGenreFillProfile("minimal")!;
    expect(profile.expectedFillFrequency).toBe(0.5);
  });

  it("has minimal core elements: kick, hi-hat", () => {
    const profile = getGenreFillProfile("minimal")!;
    expect(profile.coreElements).toEqual(["kick", "hi-hat"]);
  });
});

// ─── Hardcore / Hard Dance Profile ──────────────────────────────────────

describe("getGenreFillProfile — hardcore/hard-dance", () => {
  it("returns profile for 'hardcore'", () => {
    const profile = getGenreFillProfile("hardcore");
    expect(profile).not.toBeNull();
    expect(profile!.expectedFillTypes).toContain("snare-roll");
    expect(profile!.expectedFillTypes).toContain("tom-fill");
  });

  it("matches 'hard dance' alias", () => {
    const hardcore = getGenreFillProfile("hardcore");
    const hardDance = getGenreFillProfile("hard dance");
    expect(hardDance).toEqual(hardcore);
  });

  it("matches 'hard-dance' alias", () => {
    expect(getGenreFillProfile("hard-dance")).not.toBeNull();
  });

  it("has fill intervals of [4, 8]", () => {
    const profile = getGenreFillProfile("hardcore")!;
    expect(profile.typicalFillIntervals).toEqual([4, 8]);
  });

  it("has core elements: kick, snare, cymbal", () => {
    const profile = getGenreFillProfile("hardcore")!;
    expect(profile.coreElements).toContain("kick");
    expect(profile.coreElements).toContain("snare");
    expect(profile.coreElements).toContain("cymbal");
  });

  it("has conditional tom (fill) and percussion (stab)", () => {
    const profile = getGenreFillProfile("hardcore")!;
    expect(profile.conditionalElements.get("tom")).toEqual(["fill"]);
    expect(profile.conditionalElements.get("percussion")).toEqual(["stab"]);
  });
});

// ─── Profile Data Integrity ─────────────────────────────────────────────

describe("getGenreFillProfile — data integrity", () => {
  const allGenres = [
    "techno", "trance", "drum and bass", "trap",
    "house", "minimal", "hardcore",
  ];

  it("all profiles have at least one expected fill type", () => {
    for (const genre of allGenres) {
      const profile = getGenreFillProfile(genre)!;
      expect(profile.expectedFillTypes.length).toBeGreaterThan(0);
    }
  });

  it("all profiles have at least one typical fill interval", () => {
    for (const genre of allGenres) {
      const profile = getGenreFillProfile(genre)!;
      expect(profile.typicalFillIntervals.length).toBeGreaterThan(0);
    }
  });

  it("all profiles have positive fill frequency", () => {
    for (const genre of allGenres) {
      const profile = getGenreFillProfile(genre)!;
      expect(profile.expectedFillFrequency).toBeGreaterThan(0);
    }
  });

  it("all profiles have at least one core element", () => {
    for (const genre of allGenres) {
      const profile = getGenreFillProfile(genre)!;
      expect(profile.coreElements.length).toBeGreaterThan(0);
    }
  });

  it("all profiles have at least one conditional element", () => {
    for (const genre of allGenres) {
      const profile = getGenreFillProfile(genre)!;
      expect(profile.conditionalElements.size).toBeGreaterThan(0);
    }
  });
});
