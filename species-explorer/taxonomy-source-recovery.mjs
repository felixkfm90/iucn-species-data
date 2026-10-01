import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { inspectSourceRecovery, sourceRecoveryBinding, assertRecoveryPath, checkedRecoveryOptions } from "./taxonomy-source-recovery-reader.mjs";
import { providerSliceDataPath } from "./taxonomy-master-slices.mjs";
import { recoveryDigest, recoverySummary } from "./taxonomy-source-recovery-plan.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { acquireMasterJobLock } from "./taxonomy-master-job.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { assertTaxonomySpace } from "./taxonomy-space-budget.mjs";
import { sha256File } from "./lightroom-search-storage.mjs";

const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const exists = async (file) => fs.stat(file).then(() => true).catch((error) => { if (error.code === "ENOENT") return false; throw error; });
const folderName = (revision) => {
  if (!/^[a-f0-9]{64}$/.test(revision || "")) throw new Error("Ungültige Reparaturrevision.");
  return `recovery-${revision}`;
};
function decisions(plan) {
  return plan.rows.filter((row) => row.replacementId).map((row) => ({ replacementId: row.replacementId,
    originalId: row.originalId, policy: plan.replacementPolicy })).sort((a, b) => a.replacementId.localeCompare(b.replacementId));
}
function normalizeDecisions(value) {
  if (!Array.isArray(value)) return null;
  return value.map((row) => {
    if (!row || Object.keys(row).sort().join("|") !== "originalId|policy|replacementId") return null;
    return { replacementId: row.replacementId, originalId: row.originalId, policy: row.policy };
  }).sort((a, b) => String(a?.replacementId).localeCompare(String(b?.replacementId)));
}
export function assertSourceRecoveryDecisions(plan, replacementDecisions) {
  if (JSON.stringify(normalizeDecisions(replacementDecisions)) !== JSON.stringify(decisions(plan))) {
    throw new Error("Jede Ersatz-ID benötigt die ausdrückliche, unveränderte Historienentscheidung; keine Fotomigration.");
  }
}
function assertPlanDocument(plan, expected) {
  const { revision, canPrepare, requiresConfirmation, changesPhotos, activatesDatabase, ...body } = plan;
  if (revision !== expected.revision || recoveryDigest(body) !== revision || canPrepare !== true
      || requiresConfirmation !== true || changesPhotos !== false || activatesDatabase !== false) throw new Error("Gespeicherter Reparaturplan wurde verändert.");
}
async function writeNew(file, value) {
  const handle = await fs.open(file, "wx");
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); }
  finally { await handle.close(); }
}
async function serializeRows(current, plan, consume, signal) {
  const repaired = new Map(plan.rows.map((row) => [row.providerRecordId, row.repaired]));
  const hash = crypto.createHash("sha256");
  const emit = async (text) => { hash.update(text); if (consume) await consume(text); };
  await emit("[\n");
  let chunk = "";
  for (const [index, row] of current.records.entries()) {
    chunk += `${index ? ",\n" : ""}${JSON.stringify(repaired.get(row.providerRecordId) || row)}`;
    if (chunk.length >= 128 * 1024) { signal?.throwIfAborted(); await emit(chunk); chunk = ""; await yieldTurn(); }
  }
  await emit(chunk + "\n]\n"); signal?.throwIfAborted();
  return hash.digest("hex");
}

/** Prepare only: drafts are outside providers/releases, so normal update cannot
 * select them. A ready draft is NOT authorization to apply IDs or switch pairs. */
export function createSourceRecoveryService(options, { now = () => new Date(), checkSpace = assertTaxonomySpace,
  beforePublish = async () => {} } = {}) {
  options = checkedRecoveryOptions(options);
  const root = options.taxonomyRoot;
  const directory = path.join(root, "master/source-recovery/drafts");
  const controller = new MasterRunController(root);
  const exclusive = async (operation) => {
    for (const file of [directory, path.join(root, "master/build-jobs/control-lock.sqlite"),
      path.join(root, "master/build-jobs/execution-lock.sqlite"), path.join(path.dirname(root), "corrections/edit-lock.sqlite")]) await assertRecoveryPath(file);
    return controller.exclusive(() => withTaxonomyCorrectionLock(root, async () => {
      const unlock = await acquireMasterJobLock(root);
      try { return await operation(); } finally { unlock(); }
    }));
  };
  async function verify(directoryPath, state, signal) {
    await assertRecoveryPath(directoryPath);
    const files = await fs.readdir(directoryPath);
    if (files.sort().join("|") !== "manifest.json|plan.json|records.json") throw new Error("Reparaturentwurf enthält unerwartete oder fehlende Dateien.");
    for (const file of files) await assertRecoveryPath(path.join(directoryPath, file));
    const plan = await json(path.join(directoryPath, "plan.json"));
    assertPlanDocument(plan, state.plan);
    const manifest = await json(path.join(directoryPath, "manifest.json"));
    const expectedChecksum = await serializeRows(state.current, state.plan, null, signal);
    if (manifest.kind !== "source-recovery-draft" || manifest.schemaVersion !== 1 || manifest.revision !== plan.revision
        || manifest.activatesDatabase !== false || manifest.changesPhotos !== false || manifest.state !== "prepared"
        || manifest.provider !== "inaturalist" || manifest.sourceVersion !== options.currentVersion
        || manifest.proposedProviderVersion !== `recovery-${plan.revision.slice(0, 24)}` || !Number.isFinite(Date.parse(manifest.createdAt))
        || manifest.replacementPolicy !== plan.replacementPolicy
        || manifest.recordCount !== state.current.records.length || manifest.changedRecordCount !== plan.rows.length
        || JSON.stringify(manifest.identityCases) !== JSON.stringify(decisions(plan))
        || manifest.checksumSha256 !== expectedChecksum || await sha256File(path.join(directoryPath, "records.json"), { signal }) !== expectedChecksum) {
      throw new Error("Reparaturentwurf stimmt nicht mit dem bestätigten Quellenplan überein.");
    }
    return { prepared: true, activatesDatabase: false, changesPhotos: false, revision: plan.revision,
      directory: directoryPath, recordCount: manifest.recordCount, changedRecordCount: manifest.changedRecordCount,
      identityCases: manifest.identityCases, nextStep: "candidate-integration-required" };
  }
  return {
    async preview({ signal } = {}) { return recoverySummary((await inspectSourceRecovery(options, { signal })).plan); },
    async prepare({ confirmed, revision, replacementDecisions, signal } = {}) {
      if (confirmed !== true) throw new Error("Reparaturentwurf benötigt eine ausdrückliche Bestätigung der aktuellen Vorschau.");
      const final = path.join(directory, folderName(revision));
      return exclusive(async () => {
        signal?.throwIfAborted();
        const state = await inspectSourceRecovery(options, { signal }), plan = state.plan;
        if (plan.revision !== revision || !plan.canPrepare) throw new Error("Reparaturvorschau ist veraltet, ungeklärt oder leer. Es wurde nichts übernommen.");
        assertSourceRecoveryDecisions(plan, replacementDecisions);
        if (await exists(final)) {
          const result = await verify(final, state, signal);
          if (JSON.stringify(await sourceRecoveryBinding(options, { signal })) !== JSON.stringify(plan.binding)) throw new Error("Datenstand während der Wiederholungsprüfung verändert.");
          return { ...result, alreadyPrepared: true };
        }
        const bytes = Buffer.byteLength(JSON.stringify(plan));
        await checkSpace(root, 2 * (await fs.stat(providerSliceDataPath(root, "inaturalist", options.currentVersion))).size + bytes);
        await fs.mkdir(directory, { recursive: true });
        const temporary = path.join(directory, `preparing-${crypto.randomUUID()}`);
        await fs.mkdir(temporary, { recursive: false });
        let published = false;
        try {
          const output = await fs.open(path.join(temporary, "records.json"), "wx");
          let checksumSha256, sinceSpaceCheck = 0;
          try { checksumSha256 = await serializeRows(state.current, plan, async (text) => {
            sinceSpaceCheck += Buffer.byteLength(text);
            if (sinceSpaceCheck >= 8 * 1024 ** 2) { await checkSpace(root, sinceSpaceCheck); sinceSpaceCheck = 0; }
            await output.writeFile(text);
          }, signal); await output.sync(); } finally { await output.close(); }
          await writeNew(path.join(temporary, "plan.json"), plan);
          await writeNew(path.join(temporary, "manifest.json"), { schemaVersion: 1, kind: "source-recovery-draft",
            state: "prepared", revision, createdAt: now().toISOString(), provider: "inaturalist",
            proposedProviderVersion: `recovery-${revision.slice(0, 24)}`, sourceVersion: options.currentVersion,
            recordCount: state.current.records.length, changedRecordCount: plan.rows.length, checksumSha256,
            identityCases: decisions(plan), replacementPolicy: plan.replacementPolicy, activatesDatabase: false, changesPhotos: false });
          await verify(temporary, state, signal);
          await beforePublish(); signal?.throwIfAborted();
          if (JSON.stringify(await sourceRecoveryBinding(options, { signal })) !== JSON.stringify(plan.binding)) throw new Error("Datenstand während der Vorbereitung verändert; keine Übernahme.");
          await assertRecoveryPath(final);
          await fs.rename(temporary, final); published = true;
          return { ...(await verify(final, state, signal)), alreadyPrepared: false };
        } finally {
          // Only this invocation's freshly generated private UUID directory.
          if (!published) {
            await assertRecoveryPath(temporary);
            await fs.rm(temporary, { recursive: true, force: true, maxRetries: 2, retryDelay: 80 });
          }
        }
      });
    },
    async inspect({ revision, signal } = {}) {
      const final = path.join(directory, folderName(revision));
      const state = await inspectSourceRecovery(options, { signal });
      if (state.plan.revision !== revision || !state.plan.canPrepare) throw new Error("Reparaturentwurf gehört nicht mehr zum aktuellen Stand.");
      const result = await verify(final, state, signal);
      if (JSON.stringify(await sourceRecoveryBinding(options, { signal })) !== JSON.stringify(state.plan.binding)) throw new Error("Datenstand während der Prüfung verändert.");
      return result;
    },
  };
}
