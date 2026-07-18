import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  appendPipelineErrorLog,
  PIPELINE_ERROR_LOG_RELATIVE_PATH,
} from "./pipeline-error-log.mjs";

test("schreibt Pipelinefehler ausschließlich in den begrenzten Explorer-Logordner", async (context) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "iucn-pipeline-error-log-"));
  context.after(() => rm(repoRoot, { recursive: true, force: true }));

  const result = appendPipelineErrorLog("Testfehler", {
    repoRoot,
    now: new Date("2026-07-18T08:00:00.000Z"),
  });

  assert.equal(result.written, true);
  assert.equal(result.reset, false);
  assert.equal(
    await readFile(path.join(repoRoot, ...PIPELINE_ERROR_LOG_RELATIVE_PATH.split("/")), "utf8"),
    "[2026-07-18T08:00:00.000Z] Testfehler\n",
  );
});

test("setzt den Fehlerlog bei Überschreiten des Größenlimits kontrolliert zurück", async (context) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "iucn-pipeline-error-limit-"));
  context.after(() => rm(repoRoot, { recursive: true, force: true }));

  appendPipelineErrorLog("Erster Fehler", { repoRoot, maxBytes: 80 });
  const result = appendPipelineErrorLog("Zweiter und deutlich längerer Fehler", {
    repoRoot,
    maxBytes: 80,
    now: new Date("2026-07-18T09:00:00.000Z"),
  });
  const content = await readFile(
    path.join(repoRoot, ...PIPELINE_ERROR_LOG_RELATIVE_PATH.split("/")),
    "utf8",
  );

  assert.equal(result.written, true);
  assert.equal(result.reset, true);
  assert.equal(content, "[2026-07-18T09:00:00.000Z] Zweiter und deutlich längerer Fehler\n");
});
