import { describe, it, expect } from "bun:test";
import {
  officeBucket,
  normalizeNameKey,
  normalizeDistrictKey,
  candidateKey,
} from "./electionUtils";

// These functions are the backbone of candidate de-duplication and matching, which
// feeds the alignment quiz — the product's core job. A mis-normalized name or office
// silently mismatches a real person to the wrong record, so they're worth pinning down.

describe("officeBucket", () => {
  it("maps federal/state/local titles to canonical buckets", () => {
    expect(officeBucket("President of the United States")).toBe("president");
    expect(officeBucket("Governor")).toBe("governor");
    expect(officeBucket("U.S. Senate")).toBe("senate");
    expect(officeBucket("US House of Representatives")).toBe("house");
    expect(officeBucket("State Senate")).toBe("state-senate");
    expect(officeBucket("State Assembly")).toBe("state-house");
    expect(officeBucket("Mayor")).toBe("mayor");
  });

  it("keeps county row offices distinct from municipal council seats", () => {
    expect(officeBucket("County Commissioner")).toBe("county-commissioner");
    expect(officeBucket("Town Council")).toBe("local-council");
    expect(officeBucket("Surrogate")).toBe("county-surrogate");
  });

  it("falls back to a normalized 'other' for empty/unknown offices", () => {
    expect(officeBucket("")).toBe("other");
    expect(officeBucket("  Dogcatcher  ")).toBe("dogcatcher");
  });
});

describe("normalizeNameKey", () => {
  it("is order-insensitive and strips punctuation + honorific suffixes", () => {
    expect(normalizeNameKey("Smith, John Jr.")).toBe("john smith");
    // Same person written two ways collapses to the same key.
    expect(normalizeNameKey("John Smith")).toBe(normalizeNameKey("Smith, John"));
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeNameKey("")).toBe("");
  });
});

describe("normalizeDistrictKey", () => {
  it("strips leading zeros and lowercases", () => {
    expect(normalizeDistrictKey("03")).toBe("3");
    expect(normalizeDistrictKey("AL")).toBe("al");
  });

  it("treats null/undefined as empty", () => {
    expect(normalizeDistrictKey(null)).toBe("");
    expect(normalizeDistrictKey(undefined)).toBe("");
  });
});

describe("candidateKey", () => {
  it("composes name/state/office/district into one stable key", () => {
    const key = candidateKey({
      name: "Smith, John Jr.",
      state: "NJ",
      office: "U.S. Senate",
      district: "03",
    });
    expect(key).toBe("john smith|nj|senate|3");
  });
});
