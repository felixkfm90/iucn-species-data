import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  addMasterDecision,
  addMasterFieldAssertion,
  addMasterTaxonAlias,
  resolveMasterConflict,
  selectMasterFieldAssertion,
  setMasterTaxonStatus,
} from "./taxonomy-master-model.mjs";
import {
  inspectTaxonomyMasterCandidate,
  readTaxonomyMasterManifest,
} from "./taxonomy-master-candidate.mjs";
import { validateTaxonomyMasterDatabase } from "./taxonomy-master-schema.mjs";
import {
  taxonomyMasterActiveDirectory,
  taxonomyMasterCandidateDirectory,
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
  taxonomyMasterPreviousDirectory,
  taxonomyMasterRoot,
} from "./taxonomy-master-storage.mjs";
import { atomicWriteJson, loadNodeSqlite } from "./taxonomy-storage.mjs";

export const BLOCKING_MASTER_CONFLICT_TYPES = Object.freeze([
  "changed-value",
  "source-removed",
  "ambiguous-match",
]);

const BLOCKING_CONFLICTS = new Set(BLOCKING_MASTER_CONFLICT_TYPES);
const DECISIONS = new Set([
  "keep-current",
  "accept-candidate",
  "add-alias",
  "protect-manual",
]);

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

function isRetryableWindowsFileError(error) {
  return ["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(error?.code);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pathExists(target, fileSystem = fs) {
  try {
    await fileSystem.access(target);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function assertManagedPath(taxonomyRoot, target) {
  const managedRoot = `${path.resolve(taxonomyMasterRoot(taxonomyRoot))}${path.sep}`;
  const resolved = path.resolve(target);
  if (!`${resolved}${path.sep}`.startsWith(managedRoot)) {
    throw new Error(`Masterdatenbank-Pfad liegt außerhalb des verwalteten Bereichs: ${resolved}`);
  }
  return resolved;
}

async function safeRename(source, target, {
  taxonomyRoot,
  fileSystem = fs,
  retries = 6,
} = {}) {
  assertManagedPath(taxonomyRoot, source);
  assertManagedPath(taxonomyRoot, target);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fileSystem.rename(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWindowsFileError(error) || attempt === retries) throw error;
      await delay(40 * (attempt + 1));
    }
  }
  throw lastError;
}

async function safeRemove(target, {
  taxonomyRoot,
  fileSystem = fs,
  retries = 6,
} = {}) {
  assertManagedPath(taxonomyRoot, target);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fileSystem.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWindowsFileError(error) || attempt === retries) throw error;
      await delay(40 * (attempt + 1));
    }
  }
  throw lastError;
}

function unresolvedBlockingConflicts(database) {
  return database.prepare(`
    SELECT conflict_id, master_taxon_id, field_name, conflict_type
    FROM master_conflict
    WHERE conflict_state = 'open'
      AND conflict_type IN ('changed-value', 'source-removed', 'ambiguous-match')
    ORDER BY conflict_id
  `).all().map((row) => ({ ...row }));
}

function readLiveMasterSummary(database) {
  return {
    taxa: Number(database.prepare("SELECT COUNT(*) AS count FROM master_taxon").get().count),
    germanNames: Number(database.prepare(`
      SELECT COUNT(DISTINCT master_taxon_id) AS count
      FROM master_field_assertion
      WHERE selected = 1 AND field_name = 'german-name'
    `).get().count),
    englishNames: Number(database.prepare(`
      SELECT COUNT(DISTINCT master_taxon_id) AS count
      FROM master_field_assertion
      WHERE selected = 1 AND field_name = 'english-name'
    `).get().count),
  };
}

function readMasterStatusCounts(database) {
  return Object.fromEntries(database.prepare(`
    SELECT status_name, COUNT(*) AS count
    FROM master_taxon_status
    GROUP BY status_name
    ORDER BY status_name
  `).all().map((row) => [row.status_name, Number(row.count)]));
}

async function enrichManifestSummary(taxonomyRoot, slot, manifest) {
  if (!manifest) return null;
  const { DatabaseSync } = await loadNodeSqlite();
  let database;
  try {
    database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, slot), {
      readOnly: true,
    });
    return {
      ...manifest,
      summary: {
        ...manifest.summary,
        ...readLiveMasterSummary(database),
      },
    };
  } catch {
    return manifest;
  } finally {
    database?.close();
  }
}

function openConflict(database, conflictId) {
  return database.prepare(`
    SELECT conflict.*, master.canonical_scientific_name, master.rank, master.kingdom,
      current_field.field_value AS current_value,
      current_field.language AS current_language,
      candidate_field.field_value AS candidate_value,
      candidate_field.language AS candidate_language
    FROM master_conflict conflict
    JOIN master_taxon master ON master.master_taxon_id = conflict.master_taxon_id
    LEFT JOIN master_field_assertion current_field
      ON current_field.assertion_id = conflict.current_assertion_id
    LEFT JOIN master_field_assertion candidate_field
      ON candidate_field.assertion_id = conflict.candidate_assertion_id
    WHERE conflict.conflict_id = ?
  `).get(conflictId);
}

async function writeCandidateReviewManifest(taxonomyRoot, database, now) {
  const manifest = await readTaxonomyMasterManifest(taxonomyRoot, "staging");
  if (!manifest) throw new Error("Es ist kein Master-Kandidat vorhanden.");
  const open = Number(database.prepare(`
    SELECT COUNT(*) AS count FROM master_conflict WHERE conflict_state = 'open'
  `).get().count);
  const blocking = unresolvedBlockingConflicts(database).length;
  const resolved = Number(database.prepare(`
    SELECT COUNT(*) AS count FROM master_conflict WHERE conflict_state != 'open'
  `).get().count);
  const updated = {
    ...manifest,
    state: blocking ? "review-required" : "ready",
    reviewedAt: now,
    requiresConfirmation: true,
    summary: {
      ...manifest.summary,
      conflicts: open,
      statuses: readMasterStatusCounts(database),
    },
    review: {
      openConflicts: open,
      blockingConflicts: blocking,
      resolvedConflicts: resolved,
    },
  };
  await atomicWriteJson(taxonomyMasterManifestPath(taxonomyRoot, "staging"), updated);
  return updated;
}

function compactManifestDiff(manifest) {
  if (!manifest?.diff) return manifest;
  return {
    ...manifest,
    diff: Object.fromEntries(Object.entries(manifest.diff).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : Number(value || 0),
    ])),
  };
}

export async function inspectTaxonomyMasterLifecycle(taxonomyRoot, {
  lightweight = false,
} = {}) {
  const [candidate, activeManifest, previousManifest] = await Promise.all([
    inspectTaxonomyMasterCandidate(taxonomyRoot, {
      validate: !lightweight,
      blockingConflictsOnly: lightweight,
    }),
    readTaxonomyMasterManifest(taxonomyRoot, "active"),
    readTaxonomyMasterManifest(taxonomyRoot, "previous"),
  ]);
  const withSummary = (slot, manifest) => (
    lightweight
      ? Promise.resolve(manifest)
      : enrichManifestSummary(taxonomyRoot, slot, manifest)
  );
  let [candidateManifest, active, previous] = await Promise.all([
    withSummary("staging", candidate.available ? candidate.manifest : null),
    withSummary("active", activeManifest),
    withSummary("previous", previousManifest),
  ]);
  if (lightweight) {
    candidateManifest = compactManifestDiff(candidateManifest);
    active = compactManifestDiff(active);
    previous = compactManifestDiff(previous);
  }
  const conflicts = candidate.available ? candidate.conflicts : [];
  const blockingConflicts = conflicts.filter((entry) => BLOCKING_CONFLICTS.has(entry.conflict_type));
  const blockingConflictCount = candidate.available
    ? Number(candidate.blockingConflictCount ?? blockingConflicts.length)
    : 0;
  return {
    candidate: candidateManifest,
    active,
    previous,
    conflicts,
    blockingConflicts,
    blockingConflictCount,
    canActivate: Boolean(
      candidate.available
      && blockingConflictCount === 0,
    ),
    canRollback: Boolean(previous),
  };
}

export async function decideTaxonomyMasterConflict(taxonomyRoot, {
  conflictId,
  decision,
  note = "",
  now = () => new Date(),
} = {}) {
  const normalizedConflictId = cleanText(conflictId);
  const normalizedDecision = cleanText(decision);
  if (!normalizedConflictId) throw new Error("Konflikt-ID fehlt.");
  if (!DECISIONS.has(normalizedDecision)) {
    throw new Error(`Nicht unterstützte Konfliktentscheidung: ${normalizedDecision || "(leer)"}`);
  }
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "staging"));
  const timestamp = now().toISOString();
  try {
    const conflict = openConflict(database, normalizedConflictId);
    if (!conflict) throw new Error(`Konflikt ${normalizedConflictId} wurde nicht gefunden.`);
    if (conflict.conflict_state !== "open") {
      throw new Error(`Konflikt ${normalizedConflictId} wurde bereits entschieden.`);
    }

    let selectedAssertionId = conflict.current_assertion_id;
    let conflictState = "resolved-keep";
    if (normalizedDecision === "accept-candidate") {
      if (conflict.candidate_assertion_id == null) {
        throw new Error("Dieser Konflikt besitzt keinen übernehmbaren neuen Wert.");
      }
      selectMasterFieldAssertion(database, {
        assertionId: conflict.candidate_assertion_id,
        updatedAt: timestamp,
      });
      selectedAssertionId = conflict.candidate_assertion_id;
      conflictState = "resolved-accept";
    } else if (normalizedDecision === "keep-current") {
      if (conflict.current_assertion_id != null) {
        selectMasterFieldAssertion(database, {
          assertionId: conflict.current_assertion_id,
          updatedAt: timestamp,
        });
      }
    } else if (normalizedDecision === "add-alias") {
      if (!conflict.candidate_value) {
        throw new Error("Dieser Konflikt besitzt keinen Wert, der als Alias ergänzt werden kann.");
      }
      addMasterTaxonAlias(database, {
        masterTaxonId: conflict.master_taxon_id,
        name: conflict.candidate_value,
        rank: conflict.rank,
        kingdom: conflict.kingdom,
        aliasType: "former-name",
      });
      if (conflict.current_assertion_id != null) {
        selectMasterFieldAssertion(database, {
          assertionId: conflict.current_assertion_id,
          updatedAt: timestamp,
        });
      }
    } else if (normalizedDecision === "protect-manual") {
      if (conflict.current_assertion_id != null && conflict.current_value) {
        const manualRelease = database.prepare(`
          SELECT release_id FROM provider_release
          WHERE provider = 'manual' AND release_state = 'active'
          ORDER BY imported_at DESC LIMIT 1
        `).get();
        if (!manualRelease) throw new Error("Manuelles Master-Release fehlt.");
        const manualAssertionId = addMasterFieldAssertion(database, {
          masterTaxonId: conflict.master_taxon_id,
          fieldName: conflict.field_name,
          fieldValue: conflict.current_value,
          language: conflict.current_language || "",
          originKind: "manual",
          releaseId: manualRelease.release_id,
          confidence: 1,
          reviewState: "pending",
          selected: false,
          createdAt: timestamp,
        });
        selectMasterFieldAssertion(database, {
          assertionId: manualAssertionId,
          updatedAt: timestamp,
        });
        selectedAssertionId = manualAssertionId;
      }
      setMasterTaxonStatus(database, {
        masterTaxonId: conflict.master_taxon_id,
        statusName: "manually-protected",
        statusDetail: cleanText(note) || "Ausdrücklich gegen automatische Änderungen geschützt.",
        updatedAt: timestamp,
      });
      conflictState = "resolved-manual";
    }

    resolveMasterConflict(database, {
      conflictId: normalizedConflictId,
      conflictState,
      resolvedAt: timestamp,
      resolutionNote: cleanText(note) || null,
    });
    const remainingBlocking = Number(database.prepare(`
      SELECT COUNT(*) AS count
      FROM master_conflict
      WHERE master_taxon_id = ?
        AND conflict_state = 'open'
        AND conflict_type IN ('changed-value', 'source-removed', 'ambiguous-match')
    `).get(conflict.master_taxon_id).count);
    if (remainingBlocking === 0) {
      setMasterTaxonStatus(database, {
        masterTaxonId: conflict.master_taxon_id,
        statusName: "conflicting",
        updatedAt: timestamp,
        active: false,
      });
    }
    addMasterDecision(database, {
      decisionId: `decision_${crypto.randomUUID().replaceAll("-", "")}`,
      masterTaxonId: conflict.master_taxon_id,
      conflictId: normalizedConflictId,
      fieldName: conflict.field_name,
      language: conflict.current_language || conflict.candidate_language || "",
      decisionType: normalizedDecision,
      selectedAssertionId,
      decidedAt: timestamp,
      note: cleanText(note) || null,
    });
    validateTaxonomyMasterDatabase(database);
    const manifest = await writeCandidateReviewManifest(taxonomyRoot, database, timestamp);
    return {
      conflictId: normalizedConflictId,
      decision: normalizedDecision,
      selectedAssertionId,
      manifest,
    };
  } finally {
    database.close();
  }
}

async function updateSlotManifest(taxonomyRoot, slot, changes) {
  const manifest = await readTaxonomyMasterManifest(taxonomyRoot, slot);
  if (!manifest) return null;
  const updated = { ...manifest, ...changes };
  await atomicWriteJson(taxonomyMasterManifestPath(taxonomyRoot, slot), updated);
  return updated;
}

export async function activateTaxonomyMasterCandidate(taxonomyRoot, {
  confirmed = false,
  now = () => new Date(),
  fileSystem = fs,
} = {}) {
  if (!confirmed) {
    throw new Error("Die Aktivierung des geprüften Master-Kandidaten muss ausdrücklich bestätigt werden.");
  }
  const candidate = await inspectTaxonomyMasterCandidate(taxonomyRoot);
  if (!candidate.available) throw new Error("Es ist kein Master-Kandidat vorhanden.");
  const blocking = candidate.conflicts.filter((entry) => BLOCKING_CONFLICTS.has(entry.conflict_type));
  if (blocking.length) {
    throw new Error(`${blocking.length} widersprüchliche Änderung(en) müssen vor der Aktivierung entschieden werden.`);
  }

  // inspectTaxonomyMasterCandidate hat unmittelbar zuvor bereits die
  // vollständige Integritäts-, Fremdschlüssel- und Fachprüfung ausgeführt.
  // Eine zweite Vollprüfung wäre bei produktiven Masterständen unnötig teuer.

  const timestamp = now().toISOString();
  await updateSlotManifest(taxonomyRoot, "staging", {
    state: "active",
    activatedAt: timestamp,
    requiresConfirmation: false,
  });

  const active = taxonomyMasterActiveDirectory(taxonomyRoot);
  const staging = taxonomyMasterCandidateDirectory(taxonomyRoot);
  const previous = taxonomyMasterPreviousDirectory(taxonomyRoot);
  const displacedPrevious = path.join(
    taxonomyMasterRoot(taxonomyRoot),
    `.previous-displaced-${crypto.randomUUID()}`,
  );
  const hadActive = await pathExists(active, fileSystem);
  const hadPrevious = await pathExists(previous, fileSystem);
  let movedOldActive = false;
  let movedOldPrevious = false;
  try {
    if (hadPrevious) {
      await safeRename(previous, displacedPrevious, { taxonomyRoot, fileSystem });
      movedOldPrevious = true;
    }
    if (hadActive) {
      await safeRename(active, previous, { taxonomyRoot, fileSystem });
      movedOldActive = true;
    }
    await safeRename(staging, active, { taxonomyRoot, fileSystem });
  } catch (error) {
    if (movedOldActive && await pathExists(previous, fileSystem)) {
      await safeRename(previous, active, { taxonomyRoot, fileSystem }).catch(() => {});
    }
    if (movedOldPrevious && await pathExists(displacedPrevious, fileSystem)) {
      await safeRename(displacedPrevious, previous, { taxonomyRoot, fileSystem }).catch(() => {});
    }
    throw error;
  }
  if (movedOldPrevious) {
    await safeRemove(displacedPrevious, { taxonomyRoot, fileSystem });
  }
  await updateSlotManifest(taxonomyRoot, "active", {
    state: "active",
    activatedAt: timestamp,
    requiresConfirmation: false,
  });
  if (movedOldActive) {
    await updateSlotManifest(taxonomyRoot, "previous", {
      state: "previous",
      replacedAt: timestamp,
    });
  }
  return inspectTaxonomyMasterLifecycle(taxonomyRoot);
}

export async function rollbackTaxonomyMaster(taxonomyRoot, {
  confirmed = false,
  now = () => new Date(),
  fileSystem = fs,
} = {}) {
  if (!confirmed) {
    throw new Error("Die Wiederherstellung der vorherigen Masterversion muss ausdrücklich bestätigt werden.");
  }
  const active = taxonomyMasterActiveDirectory(taxonomyRoot);
  const previous = taxonomyMasterPreviousDirectory(taxonomyRoot);
  if (!await pathExists(active, fileSystem) || !await pathExists(previous, fileSystem)) {
    throw new Error("Für die Wiederherstellung werden eine aktive und eine vorherige Masterversion benötigt.");
  }
  const temporary = path.join(
    taxonomyMasterRoot(taxonomyRoot),
    `.rollback-${crypto.randomUUID()}`,
  );
  let activeMoved = false;
  let previousMoved = false;
  try {
    await safeRename(active, temporary, { taxonomyRoot, fileSystem });
    activeMoved = true;
    await safeRename(previous, active, { taxonomyRoot, fileSystem });
    previousMoved = true;
    await safeRename(temporary, previous, { taxonomyRoot, fileSystem });
    activeMoved = false;
  } catch (error) {
    if (previousMoved && await pathExists(active, fileSystem)) {
      await safeRename(active, previous, { taxonomyRoot, fileSystem }).catch(() => {});
    }
    if (activeMoved && await pathExists(temporary, fileSystem)) {
      await safeRename(temporary, active, { taxonomyRoot, fileSystem }).catch(() => {});
    }
    throw error;
  }
  const timestamp = now().toISOString();
  await updateSlotManifest(taxonomyRoot, "active", {
    state: "active",
    restoredAt: timestamp,
  });
  await updateSlotManifest(taxonomyRoot, "previous", {
    state: "previous",
    replacedAt: timestamp,
  });
  return inspectTaxonomyMasterLifecycle(taxonomyRoot);
}

export const taxonomyMasterLifecycleInternals = Object.freeze({
  pathExists,
  unresolvedBlockingConflicts,
  safeRename,
  safeRemove,
});
