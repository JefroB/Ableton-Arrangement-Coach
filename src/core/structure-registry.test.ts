import { describe, it, expect } from "vitest";
import { lookupVariants, validateStructureFile } from "./structure-registry.js";

describe("Structure Registry", () => {
  describe("lookupVariants", () => {
    it("returns variants for a known techno subgenre", () => {
      const variants = lookupVariants("peak-time-techno");
      expect(variants).not.toBeNull();
      expect(variants!.length).toBeGreaterThanOrEqual(2);
      expect(variants![0]!.name.length).toBeGreaterThan(0);
      expect(variants![0]!.sections.length).toBeGreaterThan(0);
    });

    it("returns variants for a known house subgenre", () => {
      const variants = lookupVariants("deep-house");
      expect(variants).not.toBeNull();
      expect(variants!.length).toBeGreaterThanOrEqual(2);
    });

    it("returns variants for a known trance subgenre", () => {
      const variants = lookupVariants("uplifting-trance");
      expect(variants).not.toBeNull();
      expect(variants!.length).toBeGreaterThanOrEqual(2);
    });

    it("returns null for an unknown subgenre", () => {
      expect(lookupVariants("unknown-subgenre")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(lookupVariants("")).toBeNull();
    });

    it("each variant has sections with valid lengthRange", () => {
      const variants = lookupVariants("peak-time-techno");
      expect(variants).not.toBeNull();
      for (const variant of variants!) {
        expect(variant.name.length).toBeGreaterThan(0);
        expect(variant.sections.length).toBeGreaterThan(0);
        for (const section of variant.sections) {
          expect(section.name.length).toBeGreaterThan(0);
          expect(section.lengthRange.min).toBeGreaterThan(0);
          expect(section.lengthRange.max).toBeGreaterThanOrEqual(section.lengthRange.min);
        }
      }
    });
  });

  describe("validateStructureFile", () => {
    it("validates a well-formed structure file", () => {
      const valid = {
        genreFamily: "test",
        subgenres: [
          {
            subgenreId: "test-sub",
            displayName: "Test Sub",
            structureVariants: [
              {
                name: "Variant A",
                sections: [
                  { name: "Intro", lengthRange: { min: 16, max: 32 } },
                ],
              },
            ],
          },
        ],
      };
      const result = validateStructureFile(valid);
      expect(result.genreFamily).toBe("test");
      expect(result.subgenres[0]!.subgenreId).toBe("test-sub");
    });

    it("throws for null input", () => {
      expect(() => validateStructureFile(null)).toThrow("must be a non-null object");
    });

    it("throws for missing family", () => {
      expect(() => validateStructureFile({ subgenres: [] })).toThrow("non-empty 'genreFamily' string");
    });

    it("throws for empty family string", () => {
      expect(() => validateStructureFile({ genreFamily: "", subgenres: [] })).toThrow("non-empty 'genreFamily' string");
    });

    it("throws for missing subgenres array", () => {
      expect(() => validateStructureFile({ genreFamily: "test" })).toThrow("'subgenres' array");
    });

    it("throws for subgenre entry missing id", () => {
      const data = {
        genreFamily: "test",
        subgenres: [{ displayName: "X", structureVariants: [] }],
      };
      expect(() => validateStructureFile(data)).toThrow("non-empty 'subgenreId' string");
    });

    it("throws for subgenre entry missing displayName", () => {
      const data = {
        genreFamily: "test",
        subgenres: [{ subgenreId: "x", structureVariants: [] }],
      };
      expect(() => validateStructureFile(data)).toThrow("non-empty 'displayName' string");
    });

    it("throws for variant missing name", () => {
      const data = {
        genreFamily: "test",
        subgenres: [{ subgenreId: "x", displayName: "X", structureVariants: [{ sections: [] }] }],
      };
      expect(() => validateStructureFile(data)).toThrow("non-empty 'name' string");
    });

    it("throws for section missing lengthRange", () => {
      const data = {
        genreFamily: "test",
        subgenres: [{
          subgenreId: "x",
          displayName: "X",
          structureVariants: [{ name: "V", sections: [{ name: "Intro" }] }],
        }],
      };
      expect(() => validateStructureFile(data)).toThrow("'lengthRange' object");
    });

    it("throws for lengthRange.min not positive", () => {
      const data = {
        genreFamily: "test",
        subgenres: [{
          subgenreId: "x",
          displayName: "X",
          structureVariants: [{
            name: "V",
            sections: [{ name: "Intro", lengthRange: { min: 0, max: 16 } }],
          }],
        }],
      };
      expect(() => validateStructureFile(data)).toThrow("min must be a positive number");
    });

    it("throws for min > max", () => {
      const data = {
        genreFamily: "test",
        subgenres: [{
          subgenreId: "x",
          displayName: "X",
          structureVariants: [{
            name: "V",
            sections: [{ name: "Intro", lengthRange: { min: 32, max: 16 } }],
          }],
        }],
      };
      expect(() => validateStructureFile(data)).toThrow("min must be <= max");
    });
  });
});
