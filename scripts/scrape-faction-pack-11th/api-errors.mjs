// Fatal-vs-transient API error classification for the Faction Pack scraper.
//
// A "fatal" error means continuing the run is pointless and would only produce
// damaged partial output: the API key is bad, or the account is out of
// credits/quota. When we see one we abort the whole run WITHOUT overwriting any
// committed output, so a credit exhaustion leaves the data byte-identical and
// the next run resumes from the per-call content-hash cache.
//
// Transient errors (a one-off 500, a parse hiccup on one page) are NOT fatal —
// they're handled per-entry by retain-on-failure in the passes.

export class AbortScrapeError extends Error {
  constructor(cause) {
    super(`Scrape aborted (fatal API error): ${cause?.message ?? cause}`);
    this.name = "AbortScrapeError";
    this.cause = cause;
  }
}

// Anthropic SDK errors carry an HTTP `status`. We treat auth/permission,
// rate/quota exhaustion (a 429 only reaches us AFTER the SDK's own retries), and
// the low-credit 400 ("Your credit balance is too low…") as fatal.
export function isFatalApiError(e) {
  if (e instanceof AbortScrapeError) return true;
  const status = e?.status ?? e?.statusCode;
  if (status === 401 || status === 403) return true;
  if (status === 429) return true;
  const msg = String(e?.message ?? "");
  if (/credit balance is too low|insufficient.*(credit|quota|funds)|billing/i.test(msg)) {
    return true;
  }
  return false;
}

// Re-throw `e` as an AbortScrapeError if it's fatal; otherwise return so the
// caller can handle it per-entry (retain-on-failure). Call at the top of every
// catch block that wraps an LLM call so a credit/auth failure unwinds the whole
// run instead of being swallowed as one more per-entry miss.
export function abortIfFatal(e) {
  if (e instanceof AbortScrapeError) throw e;
  if (isFatalApiError(e)) throw new AbortScrapeError(e);
}
