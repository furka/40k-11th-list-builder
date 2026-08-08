// Gathers WHAT changed between the old and new version of a package: GitHub
// release notes in the (old, new] range, plus the list of files the package
// changed (npm diff). The core sources use `fetch` (npm registry + GitHub API)
// rather than spawning `npm`/`gh`, so this runs identically in CI and on a dev
// machine (Windows included). Every source is best-effort — a failure degrades
// to a note rather than aborting the review — because the analyzer can still
// reason from whatever we collect.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";

function coreVersion(v) {
  const m = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmpVersions(a, b) {
  const pa = coreVersion(a);
  const pb = coreVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function extractVersion(tag) {
  return tag?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

function parseRepoSlug(repositoryUrl) {
  if (!repositoryUrl || typeof repositoryUrl !== "string") return null;
  const m = repositoryUrl.match(
    /github\.com[:/]([^/]+)\/([^/#]+?)(?:\.git)?(?:$|[#/])/
  );
  return m ? `${m[1]}/${m[2]}` : null;
}

function ghHeaders() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "dep-review",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function resolveRepoSlug(packageName) {
  try {
    const name = packageName.startsWith("@")
      ? packageName.replace("/", "%2F")
      : packageName;
    const res = await fetch(`https://registry.npmjs.org/${name}`, {
      headers: { accept: "application/json", "user-agent": "dep-review" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const repo = data.repository;
    const candidates = [
      typeof repo === "string" ? repo : repo?.url,
      data.homepage,
      data.bugs?.url,
    ];
    for (const c of candidates) {
      const slug = parseRepoSlug(c);
      if (slug) return slug;
    }
  } catch {
    // best-effort
  }
  return null;
}

async function fetchReleaseNotes(slug, from, to) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${slug}/releases?per_page=100`,
      { headers: ghHeaders() }
    );
    if (!res.ok) {
      return { notes: [], warning: `GitHub releases lookup failed: HTTP ${res.status}` };
    }
    const releases = await res.json();
    if (!Array.isArray(releases)) return { notes: [] };

    const inRange = releases
      .map((r) => ({
        tag: r.tag_name,
        name: r.name,
        url: r.html_url,
        body: r.body,
        version: extractVersion(r.tag_name),
      }))
      .filter(
        (r) =>
          r.version &&
          cmpVersions(r.version, from) > 0 &&
          cmpVersions(r.version, to) <= 0
      )
      .sort((a, b) => cmpVersions(a.version, b.version))
      .slice(-20)
      .map((r) => ({
        tag: r.tag,
        name: r.name || r.tag,
        url: r.url,
        body: (r.body || "").slice(0, 4000),
      }));

    return { notes: inRange };
  } catch (err) {
    return { notes: [], warning: `GitHub releases lookup error: ${err.message}` };
  }
}

async function fetchChangedFiles(packageName, from, to) {
  try {
    const { stdout } = await execFileAsync(
      NPM_BIN,
      [
        "diff",
        `--diff=${packageName}@${from}`,
        `--diff=${packageName}@${to}`,
        "--diff-name-only",
      ],
      {
        timeout: 90_000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
        // npm is a .cmd shim on Windows; execFile needs a shell to resolve it.
        shell: process.platform === "win32",
      }
    );
    const files = stdout
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    return { files };
  } catch (err) {
    return {
      files: null,
      warning: `npm diff unavailable: ${err.shortMessage || err.message}`,
    };
  }
}

export async function gatherChanges(packageName, from, to) {
  const warnings = [];
  const slug = await resolveRepoSlug(packageName);

  let releaseNotes = [];
  if (slug) {
    const { notes, warning } = await fetchReleaseNotes(slug, from, to);
    releaseNotes = notes;
    if (warning) warnings.push(warning);
  } else {
    warnings.push("Could not resolve the package's GitHub repository.");
  }

  const { files: changedFiles, warning: diffWarning } = await fetchChangedFiles(
    packageName,
    from,
    to
  );
  if (diffWarning) warnings.push(diffWarning);

  return { repoSlug: slug, releaseNotes, changedFiles, warnings };
}
