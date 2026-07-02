import { describe, it, expect } from "vitest";
import {
  classifierRevision,
  hashPageText,
  isUnchanged,
} from "./fingerprints.mjs";
import { KEYWORD_CACHE_VERSION } from "./llm-classify-keywords.mjs";
import { RESTRICTION_CACHE_VERSION, MODEL_ID } from "./llm-classify.mjs";
import { GRANTS_CACHE_VERSION } from "./llm-classify-detachment-grants.mjs";
import { ERRATA_CACHE_VERSION } from "./llm-classify-errata-keywords.mjs";

describe("hashPageText", () => {
  it("is stable for identical page text", () => {
    const pages = ["KEYWORDS: Infantry, Character", "FACTION KEYWORDS: Necrons"];
    expect(hashPageText(pages)).toBe(hashPageText([...pages]));
  });

  it("changes when the extracted text changes", () => {
    const a = ["KEYWORDS: Infantry"];
    const b = ["KEYWORDS: Vehicle"];
    expect(hashPageText(a)).not.toBe(hashPageText(b));
  });

  it("is sensitive to page order (order reflects the PDF)", () => {
    expect(hashPageText(["a", "b"])).not.toBe(hashPageText(["b", "a"]));
  });
});

describe("classifierRevision", () => {
  it("embeds every pass version + the model so a bump forces a full re-run", () => {
    const rev = classifierRevision();
    for (const token of [
      MODEL_ID,
      KEYWORD_CACHE_VERSION,
      RESTRICTION_CACHE_VERSION,
      GRANTS_CACHE_VERSION,
      ERRATA_CACHE_VERSION,
    ]) {
      expect(rev).toContain(token);
    }
  });
});

describe("isUnchanged (skip predicate)", () => {
  const rev = classifierRevision();
  const hash = "abc123";

  it("skips only when both text hash AND revision match", () => {
    expect(isUnchanged({ textHash: hash, rev }, hash, rev)).toBe(true);
  });

  it("does not skip when the text hash differs", () => {
    expect(isUnchanged({ textHash: "other", rev }, hash, rev)).toBe(false);
  });

  it("does not skip when the revision differs (prompt-fix propagation)", () => {
    expect(isUnchanged({ textHash: hash, rev: "stale-rev" }, hash, rev)).toBe(false);
  });

  it("does not skip a faction with no committed fingerprint", () => {
    expect(isUnchanged(undefined, hash, rev)).toBe(false);
  });
});
