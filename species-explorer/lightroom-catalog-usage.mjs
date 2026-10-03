import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { masterJobLockHeld } from "./taxonomy-master-job.mjs";

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const idPattern = /^mtx_[a-f0-9]{32}$/;
const capturePattern = /^usage-[a-f0-9-]{36}$/;
const registryPath = (root) => path.join(root, "catalog-usage", "registry.json");
const capturesPath = (root) => path.join(root, "catalog-usage", "captures.json");
const key = (value) => process.platform === "win32" ? value.toLowerCase() : value;
const catalogPath = (value) => {
  if (typeof value !== "string" || !path.isAbsolute(value) || !/\.lrcat$/i.test(value)) throw new Error("Ein absoluter Lightroom-Katalogpfad ist erforderlich.");
  return path.resolve(value);
};
async function json(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function fileStamp(filename) {
  const stat = await fs.stat(filename, { bigint: true });
  if (!stat.isFile()) throw new Error("Die Katalogdatei fehlt oder ist keine reguläre Datei.");
  return [stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].map(String);
}
async function assertClosed(filename) {
  // A reader never opens SQLite here. An open catalog, WAL or recovery journal
  // cannot establish absence of FN usage from an old on-disk snapshot.
  for (const suffix of [".lock", "-wal", "-shm", "-journal"]) {
    try { await fs.stat(filename + suffix); throw new Error("Lightroom bitte normal schließen; der Katalog ist geöffnet oder besitzt noch Arbeitsdateien."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
function assertIdle(root, allowControl = false) {
  if (masterJobLockHeld(root) || !allowControl && masterJobLockHeld(root, "control")) throw new Error("Ein Taxonomieaufbau läuft. FN-Nutzung bitte danach erfassen.");
}
function normalizeCounts(value) {
  if (!Number.isSafeInteger(value?.totalPhotos) || value.totalPhotos < 0 || value.totalPhotos > 1000000
      || value.complete !== true || value.passes !== 2 || !Array.isArray(value.usedTaxa) || value.usedTaxa.length > value.totalPhotos) {
    throw new Error("Die FN-Katalogerfassung ist nicht vollständig gegengeprüft.");
  }
  const ids = new Set();
  let assignedPhotos = 0;
  const usedTaxa = value.usedTaxa.map((entry) => {
    if (!idPattern.test(entry?.masterTaxonId || "") || ids.has(entry.masterTaxonId)
        || !Number.isSafeInteger(entry.photoCount) || entry.photoCount < 1) throw new Error("Ungültige oder doppelte FN-Nutzungskennung.");
    ids.add(entry.masterTaxonId); assignedPhotos += entry.photoCount;
    return { masterTaxonId: entry.masterTaxonId, photoCount: entry.photoCount };
  }).sort((a, b) => a.masterTaxonId.localeCompare(b.masterTaxonId));
  if (assignedPhotos > value.totalPhotos) throw new Error("Die FN-Fotozahl überschreitet den Katalogumfang.");
  return { totalPhotos: value.totalPhotos, assignedPhotos, usedTaxa };
}
function checkedCaptures(document) {
  if (!document) return { schemaVersion: 1, entries: [] };
  if (document.schemaVersion !== 1 || !Array.isArray(document.entries) || document.entries.length > 100) throw new Error("Ungültige gespeicherte Katalogerfassung.");
  const seen = new Set();
  for (const receipt of document.entries) {
    const filename = catalogPath(receipt?.catalogPath);
    const counts = normalizeCounts({ ...receipt, complete: true, passes: 2 });
    if (seen.has(key(filename)) || !capturePattern.test(receipt.captureId || "")
        || !Number.isFinite(Date.parse(receipt.capturedAt)) || receipt.assignedPhotos !== counts.assignedPhotos
        || ((receipt.captureRequestId || receipt.requestRevision) && (!/^capture-request-[a-f0-9-]{36}$/.test(receipt.captureRequestId || "")
          || !/^[a-f0-9]{64}$/.test(receipt.requestRevision || "")))) throw new Error("Ungültige Katalogerfassung.");
    seen.add(key(filename));
  }
  return document;
}
function checkedRegistry(value) {
  if (!value) return null;
  const { revision, ...body } = value;
  if (body.schemaVersion !== 1 || body.allCatalogsConfirmed !== true || body.policy !== "unused-classifications-v1"
      || !Array.isArray(body.catalogs) || !body.catalogs.length || body.catalogs.length > 100
      || new Set(body.catalogs.map((entry) => key(catalogPath(entry.catalogPath)))).size !== body.catalogs.length
      || revision !== digest(body)) throw new Error("Das FN-Nutzungsregister ist unvollständig oder verändert.");
  for (const entry of body.catalogs) {
    checkedCaptures({ schemaVersion: 1, entries: [entry] });
    if (!Array.isArray(entry.fileStamp) || entry.fileStamp.length !== 4 || entry.fileStamp.some((part) => !/^\d+$/.test(part))
        || !/^[a-f0-9]{64}$/.test(entry.checksum || "")) throw new Error("Der Katalognachweis ist unvollständig.");
  }
  return value;
}

export async function catalogUsageStatus(root, { full = false } = {}) {
  const registry = checkedRegistry(await json(registryPath(root)));
  if (!registry) return { ready: false, reason: "missing", usedIds: [], catalogs: [], revision: "" };
  const captures = checkedCaptures(await json(capturesPath(root)));
  const known = new Set(registry.catalogs.map((entry) => key(entry.catalogPath)));
  const usedIds = [...new Set(registry.catalogs.flatMap((entry) => entry.usedTaxa.map((value) => value.masterTaxonId)))];
  let reason = "";
  if (captures.entries.some((entry) => !known.has(key(entry.catalogPath)))) reason = "unregistered-catalog";
  if (captures.entries.some((entry) => registry.catalogs.find((catalog) => key(catalog.catalogPath) === key(entry.catalogPath))?.captureId !== entry.captureId)) reason ||= "new-capture";
  if (registry.catalogs.some((entry) => !captures.entries.some((receipt) => receipt.captureId === entry.captureId))) reason ||= "missing-capture";
  const catalogs = [];
  for (const entry of registry.catalogs) {
    let current = false;
    try {
      await assertClosed(entry.catalogPath);
      current = JSON.stringify(await fileStamp(entry.catalogPath)) === JSON.stringify(entry.fileStamp);
      if (current && full) {
        current = await masterFileFingerprint(entry.catalogPath) === entry.checksum;
        await assertClosed(entry.catalogPath);
        current &&= JSON.stringify(await fileStamp(entry.catalogPath)) === JSON.stringify(entry.fileStamp);
      }
    } catch { current = false; }
    if (!current) reason ||= "catalog-changed-or-open";
    catalogs.push({ catalogPath: entry.catalogPath, totalPhotos: entry.totalPhotos, assignedPhotos: entry.assignedPhotos,
      taxonCount: entry.usedTaxa.length, capturedAt: entry.capturedAt, current });
  }
  return { ready: !reason, reason, usedIds, catalogs, revision: registry.revision };
}

export async function catalogUsageRegistration(root) {
  return checkedRegistry(await json(registryPath(root)));
}

// Positive observations remain protective even when the negative usage proof
// has expired. Include newly captured IDs without silently confirming a catalog.
export async function catalogProtectedMasterIds(root) {
  const registry = checkedRegistry(await json(registryPath(root)));
  const captures = checkedCaptures(await json(capturesPath(root)));
  return [...new Set([
    ...(registry?.catalogs || []).flatMap((entry) => entry.usedTaxa.map((value) => value.masterTaxonId)),
    ...captures.entries.flatMap((entry) => entry.usedTaxa.map((value) => value.masterTaxonId)),
  ])].sort();
}

export async function assertCatalogUsageRevision(root, revision, { full = false } = {}) {
  const status = await catalogUsageStatus(root, { full });
  if (!revision || !status.ready || status.revision !== revision) throw new Error("Die FN-Katalognutzung fehlt, ist veraltet oder wurde verändert. Keine automatische Klassifikationsfreigabe; bitte erneut erfassen und prüfen.");
  return status;
}

// Only an explicit Lightroom SDK action supplies this receipt. It is NOT a
// negative usage proof until the user confirms the entire catalog set and that
// no FN changes occurred between capture and normal Lightroom closure.
export async function captureCatalogUsage(root, input, { now = () => new Date() } = {}) {
  const filename = catalogPath(input?.catalogPath), counts = normalizeCounts(input);
  return withTaxonomyCorrectionLock(root, async () => {
    assertIdle(root);
    const previous = checkedCaptures(await json(capturesPath(root)));
    const requestBinding = input.captureRequestId || input.requestRevision
      ? await (await import("./lightroom-usage-request.mjs")).validateCatalogUsageCaptureRequest(root, input) : {};
    const receipt = { captureId: `usage-${crypto.randomUUID()}`, catalogPath: filename,
      capturedAt: now().toISOString(), ...counts, ...requestBinding };
    const entries = (previous?.entries || []).filter((entry) => key(entry.catalogPath) !== key(filename));
    entries.push(receipt);
    if (entries.length > 100) throw new Error("Zu viele FN-Kataloge für diese Erfassung.");
    await fileStamp(filename); // validate the named file without opening its database
    await atomicWriteJson(capturesPath(root), { schemaVersion: 1, entries });
    return { saved: true, requiresConfirmation: true, captureId: receipt.captureId, catalogPath: filename,
      totalPhotos: counts.totalPhotos, assignedPhotos: counts.assignedPhotos, taxonCount: counts.usedTaxa.length, changesPhotos: false };
  });
}

export function createCatalogUsageService({ taxonomyRoot: root, now = () => new Date() }) {
  async function inspect() {
    assertIdle(root, true); // the Master service holds its own exclusive control lock
    const document = checkedCaptures(await json(capturesPath(root)));
    if (!document.entries.length) {
      throw new Error("FN-Nutzung zuerst in Lightroom unter FN Wildlife verwalten → FN-Katalognutzung erfassen starten.");
    }
    const catalogs = [];
    for (const receipt of document.entries) {
      const filename = catalogPath(receipt.catalogPath);
      if (!capturePattern.test(receipt.captureId || "") || !Number.isFinite(Date.parse(receipt.capturedAt))) throw new Error("Ungültige Katalogerfassung.");
      normalizeCounts({ ...receipt, complete: true, passes: 2 });
      await assertClosed(filename);
      const before = await fileStamp(filename), checksum = await masterFileFingerprint(filename), after = await fileStamp(filename);
      await assertClosed(filename);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Der Katalog wurde während der Prüfung verändert.");
      catalogs.push({ ...receipt, fileStamp: after, checksum });
    }
    const old = checkedRegistry(await json(registryPath(root)));
    if (old && old.catalogs.some((entry) => !catalogs.some((catalog) => key(catalog.catalogPath) === key(entry.catalogPath)))) {
      throw new Error("Ein bereits registrierter FN-Katalog fehlt in der neuen vollständigen Erfassung.");
    }
    return { catalogs, token: digest({ catalogs, previous: old?.revision || "" }) };
  }
  return {
    async catalogUsagePreview() {
      const value = await inspect();
      return { token: value.token, requiresConfirmation: true, changesPhotos: false,
        catalogs: value.catalogs.map(({ catalogPath, totalPhotos, assignedPhotos, usedTaxa, capturedAt }) =>
          ({ catalogPath, totalPhotos, assignedPhotos, taxonCount: usedTaxa.length, capturedAt })) };
    },
    async catalogUsageSave(input) {
      if (input?.confirmed !== true || input.allCatalogsConfirmed !== true || input.unchangedSinceCapture !== true) {
        throw new Error("Alle FN-Kataloge und unveränderte FN-Daten seit der Erfassung müssen ausdrücklich bestätigt werden.");
      }
      return withTaxonomyCorrectionLock(root, async () => {
        const value = await inspect();
        if (input.token !== value.token) throw new Error("Die Katalogvorschau ist veraltet. Bitte erneut prüfen.");
        if (input.captureRequestId && value.catalogs.some((entry) => entry.captureRequestId !== input.captureRequestId)) {
          throw new Error("Nicht alle FN-Kataloge besitzen eine neue Quittung für diesen Updateauftrag.");
        }
        const body = { schemaVersion: 1, allCatalogsConfirmed: true, policy: "unused-classifications-v1",
          confirmedAt: now().toISOString(), catalogs: value.catalogs,
          ...(input.captureRequestId ? { confirmationBasis: "prospective-user-agreement", captureRequestId: input.captureRequestId } : {}) };
        const registry = { ...body, revision: digest(body) };
        await atomicWriteJson(registryPath(root), registry);
        return { saved: true, revision: registry.revision, catalogCount: registry.catalogs.length, changesPhotos: false };
      });
    },
  };
}
