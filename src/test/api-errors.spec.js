import { describe, it, expect } from "vitest";
import {
  isFatalApiError,
  abortIfFatal,
  AbortScrapeError,
} from "../../scripts/scrape-faction-pack-11th/api-errors.mjs";

describe("isFatalApiError", () => {
  it("treats auth/permission (401/403) as fatal", () => {
    expect(isFatalApiError({ status: 401 })).toBe(true);
    expect(isFatalApiError({ status: 403 })).toBe(true);
  });

  it("treats rate/quota exhaustion (429) as fatal (SDK has already retried)", () => {
    expect(isFatalApiError({ status: 429 })).toBe(true);
  });

  it("treats the low-credit 400 message as fatal", () => {
    expect(
      isFatalApiError({
        status: 400,
        message: "Your credit balance is too low to access the Anthropic API",
      })
    ).toBe(true);
    expect(isFatalApiError({ message: "insufficient credits" })).toBe(true);
  });

  it("treats transient/server errors as NON-fatal (retain-on-failure handles them)", () => {
    expect(isFatalApiError({ status: 500 })).toBe(false);
    expect(isFatalApiError({ status: 529 })).toBe(false);
    expect(isFatalApiError(new Error("socket hang up"))).toBe(false);
    expect(isFatalApiError(undefined)).toBe(false);
  });

  it("treats an AbortScrapeError itself as fatal", () => {
    expect(isFatalApiError(new AbortScrapeError(new Error("x")))).toBe(true);
  });
});

describe("abortIfFatal", () => {
  it("throws AbortScrapeError for a fatal error", () => {
    expect(() => abortIfFatal({ status: 401 })).toThrow(AbortScrapeError);
  });

  it("re-throws an existing AbortScrapeError unchanged", () => {
    const original = new AbortScrapeError(new Error("credits"));
    expect(() => abortIfFatal(original)).toThrow(original);
  });

  it("does nothing for a transient error (caller handles per-entry)", () => {
    expect(() => abortIfFatal({ status: 500 })).not.toThrow();
    expect(() => abortIfFatal(new Error("flaky"))).not.toThrow();
  });

  it("preserves the underlying cause on the wrapped error", () => {
    const cause = { status: 429, message: "rate limited" };
    try {
      abortIfFatal(cause);
      throw new Error("expected abortIfFatal to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AbortScrapeError);
      expect(e.cause).toBe(cause);
    }
  });
});
