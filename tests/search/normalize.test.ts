import { describe, it, expect } from "vitest";
import {
  normalizeText,
  tokenize,
  generatePrefixes,
  computeSearchFields,
  CURRENT_SEARCH_SCHEMA_VERSION,
  MAX_PREFIX_LENGTH,
} from "../../lib/search/normalize";

describe("search token normalization & prefix generation", () => {
  describe("normalizeText", () => {
    it("lowercases, normalizes Unicode diacritics, and strips non-alphanumeric punctuation", () => {
      const input = "Physics: Paper-1 (Section & Chapter 3!) — Éléments";
      const normalized = normalizeText(input);
      expect(normalized).toBe("physics paper 1 section chapter 3 elements");
    });

    it("handles empty or whitespace strings", () => {
      expect(normalizeText("")).toBe("");
      expect(normalizeText("   ")).toBe("");
    });
  });

  describe("tokenize", () => {
    it("tokenizes string, drops <2 char tokens, and deduplicates while preserving order", () => {
      const title = "Physics & Chemistry Note - Physics 1";
      const tokens = tokenize(title);
      expect(tokens).toEqual(["physics", "chemistry", "note"]);
    });

    it("limits tokens to MAX_TOKENS_PER_TITLE (30)", () => {
      const longTitle = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
      const tokens = tokenize(longTitle);
      expect(tokens.length).toBe(30);
      expect(tokens[0]).toBe("word0");
      expect(tokens[29]).toBe("word29");
    });

    it("returns empty array for punctuation-only inputs", () => {
      expect(tokenize("!! ?? --")).toEqual([]);
    });
  });

  describe("generatePrefixes", () => {
    it("generates prefixes of length 2 up to 12 for short tokens", () => {
      const prefixes = generatePrefixes(["physics"]);
      expect(prefixes).toEqual(["ph", "phy", "phys", "physi", "physic", "physics"]);
    });

    it("generates prefixes up to length 12 and includes full exact token for long tokens (>12 chars)", () => {
      const longWord = "electromagnetism"; // 16 characters
      const prefixes = generatePrefixes([longWord]);
      
      expect(prefixes).toContain("el");
      expect(prefixes).toContain("electromagne"); // 12 chars
      expect(prefixes).not.toContain("electromagnet"); // 13 chars excluded
      expect(prefixes).toContain("electromagnetism"); // full exact token included
    });
  });

  describe("computeSearchFields", () => {
    it("returns searchTokens, searchPrefixes, and CURRENT_SEARCH_SCHEMA_VERSION", () => {
      const result = computeSearchFields("Mathematic Notes");
      expect(result.searchSchemaVersion).toBe(CURRENT_SEARCH_SCHEMA_VERSION);
      expect(result.searchTokens).toEqual(["mathematic", "notes"]);
      expect(result.searchPrefixes).toContain("ma");
      expect(result.searchPrefixes).toContain("notes");
    });
  });
});
