import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";

const repo = "felixkfm90/iucn-species-data";
const pending = new Set(["requested", "queued", "pending", "in_progress", "waiting"]);

export async function pendingSourcePages(commit, { fetchImpl = globalThis.fetch, token } = {}) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  const url = new URL(`https://api.github.com/repos/${repo}/actions/workflows/pages.yml/runs`);
  url.search = new URLSearchParams({ branch: "main", head_sha: commit, per_page: "20" });
  const response = await fetchImpl(url, { headers: { accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {}) }, redirect: "error", signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, "Der Pages-Stand konnte nicht über GitHub gelesen werden.");
  const { workflow_runs: runs } = await response.json();
  assert.ok(Array.isArray(runs), "GitHub liefert keine Liste von Pages-Läufen.");
  const run = runs.find(row => row?.head_sha === commit && row.head_branch === "main"
    && row.head_repository?.full_name === repo && pending.has(row.status)
    && Number.isSafeInteger(row.id) && row.id > 0);
  return run?.id ?? null;
}

if (import.meta.main) {
  const { GITHUB_SHA, GITHUB_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  let run;
  try { run = await pendingSourcePages(GITHUB_SHA, { token: GITHUB_TOKEN }); }
  catch {
    // An unavailable status API does not make differing source bytes acceptable.
    console.error("Pages-Lauf nicht bestätigt. Die normale Katalogprüfung prüft die öffentlichen Quellen.");
  }
  appendFileSync(GITHUB_OUTPUT, `defer=${Boolean(run)}\n`);
  if (run) {
    appendFileSync(GITHUB_STEP_SUMMARY, `Die geplante Katalogprüfung wartet auf den laufenden [Pages-Lauf ${run}](https://github.com/${repo}/actions/runs/${run}). Sobald er erfolgreich ist, startet die Katalogprüfung erneut.\n`);
  }
}
