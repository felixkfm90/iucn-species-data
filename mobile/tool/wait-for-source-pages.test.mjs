import assert from "node:assert/strict";
import test from "node:test";
import { pendingSourcePages } from "./wait-for-source-pages.mjs";

const commit = "a".repeat(40);
const row = { id: 17, head_sha: commit, head_branch: "main", head_repository: { full_name: "felixkfm90/iucn-species-data" }, status: "in_progress" };
const response = (...runs) => async () => Response.json({ workflow_runs: runs });

test("a scheduled catalog run recognizes only an active Pages run for its own exact source", async () => {
  assert.equal(await pendingSourcePages(commit, { async fetchImpl(url) {
    assert.equal(url.pathname, "/repos/felixkfm90/iucn-species-data/actions/workflows/pages.yml/runs");
    assert.equal(url.searchParams.get("head_sha"), commit);
    return Response.json({ workflow_runs: [{ ...row, status: "queued" }] });
  } }), row.id);
  assert.equal(await pendingSourcePages(commit, { fetchImpl: response(
    {...row, head_sha: "b".repeat(40)}, {...row, head_branch: "other"}, {...row, head_repository: {full_name: "other/fork"}},
    {...row, status: "completed", conclusion: "failure"}, {...row, status: "completed", conclusion: "success"},
  ) }), null);
  await assert.rejects(pendingSourcePages(commit, { fetchImpl: async () => new Response("", { status: 503 }) }), /GitHub/);
});
