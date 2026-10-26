import assert from "node:assert/strict";
import test from "node:test";
import { speciesCreationAvailability } from "./species-creation-availability.mjs";

test("Offener fehlgeschlagener Datenbankauftrag sperrt Artanlage mit richtiger Erklärung", () => {
  const updateWorkflow = { status: "failed", updateRunId: "update-own", active: false };
  const result = speciesCreationAvailability({ updateWorkflow });
  assert.equal(result.available, false);
  assert.equal(result.reason, "update-failed");
  assert.match(result.message, /fehlgeschlagen/);
  assert.doesNotMatch(result.message, /läuft/);
  assert.equal(updateWorkflow.status, "failed");
});

test("Artanlage unterscheidet laufende, wartende, angehaltene und abgeschlossene Aufträge", () => {
  for (const status of ["building", "waiting-lightroom", "waiting-usage", "waiting-decisions", "paused", "interrupted"]) {
    assert.equal(speciesCreationAvailability({ updateWorkflow: { status, updateRunId: "own" } }).available, false);
  }
  for (const status of ["idle", "completed"]) {
    assert.equal(speciesCreationAvailability({ updateWorkflow: { status, updateRunId: "own" } }).available, true);
  }
  assert.equal(speciesCreationAvailability().available, true);
  assert.equal(speciesCreationAvailability({ databaseActive: true }).available, false);
  assert.equal(speciesCreationAvailability({ backupActive: true }).available, false);
  assert.equal(speciesCreationAvailability({ creationMutationActive: true }).available, false);
});
