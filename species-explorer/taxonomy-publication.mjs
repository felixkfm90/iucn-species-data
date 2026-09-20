import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildLightroomSearchPackage, verifyLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { lightroomSearchDatabasePath, sha256File } from "./lightroom-search-storage.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { inspectTaxonomyMasterCandidate, taxonomyCorrectionsRevision } from "./taxonomy-master-candidate.mjs";
import { readTaxonomyPublication, taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { prepareTaxonomyCorrectionRelease, readActiveTaxonomyCorrectionPointer,
  taxonomyCorrectionActivePointerPath } from "./taxonomy-correction-release.mjs";

const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const optionalText = async (file) => fs.readFile(file, "utf8").catch((error) => {
  if (error.code === "ENOENT") return "";
  throw error;
});
const manifestAt = (database) => path.join(path.dirname(database), "manifest.json");
const checksum = async (file) => `sha256:${await sha256File(file)}`;

// A failed replacement must never make the old pointer disappear, including on Windows.
export async function writeTaxonomyPublication(taxonomyRoot, value, { rename = fs.rename } = {}) {
  const target = taxonomyPublicationPath(taxonomyRoot);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    const file = await fs.open(temporary, "wx");
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync(); }
    finally { await file.close(); }
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(temporary, target); break; }
      catch (error) {
        if (attempt >= 4 || !["EPERM", "EACCES", "EBUSY", "EEXIST"].includes(error.code)) throw error;
        await delay(80 * (attempt + 1));
      }
    }
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

function roots(taxonomyRoot, searchRoot) {
  const result = { taxonomyRoot: path.resolve(taxonomyRoot), searchRoot: path.resolve(searchRoot) };
  if (path.dirname(result.taxonomyRoot) !== path.dirname(result.searchRoot) || result.taxonomyRoot === result.searchRoot) {
    throw new Error("Gemeinsame Aktivierung benötigt getrennte Master- und Suchpaketordner mit demselben Elternordner.");
  }
  return result;
}

async function generation(taxonomyRoot, searchRoot, readInputs) {
  return JSON.stringify(await Promise.all([
    optionalText(taxonomyPublicationPath(taxonomyRoot)),
    optionalText(taxonomyCorrectionActivePointerPath(taxonomyRoot)),
    optionalText(manifestAt(taxonomyMasterDatabasePath(taxonomyRoot))),
    optionalText(manifestAt(lightroomSearchDatabasePath(searchRoot))),
    readInputs(),
  ]));
}

function correctionPointer(release) {
  return { schemaVersion: 1, activeRelease: release.releaseId, previousRelease: null,
    revision: release.revision, baseMasterVersion: release.baseMasterVersion,
    basePackageId: release.basePackageId, updatedAt: release.createdAt };
}

async function currentEntry(taxonomyRoot, searchRoot) {
  const pointer = readTaxonomyPublication(taxonomyRoot);
  let entry = pointer?.active;
  if (!entry) {
    const masterText = await optionalText(manifestAt(taxonomyMasterDatabasePath(taxonomyRoot)));
    const packageText = await optionalText(manifestAt(lightroomSearchDatabasePath(searchRoot)));
    if (!masterText || !packageText) return null;
    const master = JSON.parse(masterText);
    const packageManifest = JSON.parse(packageText);
    if (master.candidateId !== packageManifest.masterVersion) return null;
    entry = { id: `publication-${crypto.randomUUID()}`, legacy: true,
      masterVersion: master.candidateId, packageId: packageManifest.packageId,
      masterChecksum: await checksum(taxonomyMasterDatabasePath(taxonomyRoot)),
      packageChecksum: await checksum(lightroomSearchDatabasePath(searchRoot)) };
  }
  return { ...entry, correctionPointer: await readActiveTaxonomyCorrectionPointer(taxonomyRoot) };
}

function preparationPaths(taxonomyRoot, searchRoot, id) {
  if (!/^publication-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id)) {
    throw new Error("Ungültige Vorbereitungskennung.");
  }
  roots(taxonomyRoot, searchRoot);
  return { work: path.join(searchRoot, `.${id}`),
    masterRelease: path.join(taxonomyRoot, "master", "releases", id),
    packageRelease: path.join(searchRoot, "releases", id) };
}

async function cleanupPreparation(taxonomyRoot, searchRoot, id, keepReleases) {
  const { work, masterRelease, packageRelease } = preparationPaths(taxonomyRoot, searchRoot, id);
  const directories = [work, ...(!keepReleases ? [masterRelease, packageRelease] : [])];
  await Promise.all(directories.map((directory) => fs.rm(directory, {
    recursive: true, force: true, maxRetries: 5, retryDelay: 80,
  }).catch(() => {})));
}

// Heavy read/copy/build/SQLite checks. This function NEVER replaces an active
// pointer; it is safe to execute in a disposable child process.
export async function prepareTaxonomyPublication({ taxonomyRoot, searchRoot, id, action = "publish",
  sourceSlot = "staging", corrections = [], expectedSourceManifest = "",
  buildPackage = buildLightroomSearchPackage, onProgress = () => {}, now = () => new Date(),
} = {}) {
  const configured = roots(taxonomyRoot, searchRoot);
  ({ taxonomyRoot, searchRoot } = configured);
  const paths = preparationPaths(taxonomyRoot, searchRoot, id);
  if (action === "rollback") return prepareRollback({ taxonomyRoot, searchRoot, corrections, now });
  if (action !== "publish" || !["active", "staging", "previous"].includes(sourceSlot)) throw new Error("Ungültige Paarvorbereitung.");
  const before = readTaxonomyPublication(taxonomyRoot);
  const previous = await currentEntry(taxonomyRoot, searchRoot);
  const sourceDatabase = taxonomyMasterDatabasePath(taxonomyRoot, sourceSlot);
  const sourceManifestText = await fs.readFile(manifestAt(sourceDatabase), "utf8");
  if (expectedSourceManifest && sourceManifestText !== expectedSourceManifest) throw new Error("Der Kandidat wurde vor der Vorbereitung geändert.");
  const sourceManifest = JSON.parse(sourceManifestText);
  const { work, masterRelease, packageRelease } = paths;
  const privateTaxonomy = path.join(work, "taxonomy");
  const privateSearch = path.join(work, "lightroom");
  const privateMaster = path.dirname(taxonomyMasterDatabasePath(privateTaxonomy, "staging"));
  onProgress({ phase: "copy", percent: 0, message: "Master-Kandidat wird für die gemeinsame Aktivierung vorbereitet." });
  await fs.cp(path.dirname(sourceDatabase), privateMaster, { recursive: true, errorOnExist: true, force: false });
  const candidate = await inspectTaxonomyMasterCandidate(privateTaxonomy, { blockingConflictsOnly: true });
  if (!candidate.available || candidate.blockingConflictCount) {
    throw new Error("Der Master-Kandidat fehlt oder enthält noch widersprüchliche Änderungen.");
  }
  await buildPackage({ taxonomyRoot: privateTaxonomy, searchRoot: privateSearch,
    sourceSlot: "staging", baseSearchRoot: searchRoot, onProgress });
  const verified = await verifyLightroomSearchPackage({ searchRoot: privateSearch, slot: "staging" });
  const masterChecksum = await checksum(taxonomyMasterDatabasePath(privateTaxonomy, "staging"));
  if (verified.manifest.masterVersion !== sourceManifest.candidateId || verified.manifest.sourceChecksum !== masterChecksum) {
    throw new Error("Suchpaket und vorbereiteter Master stimmen nicht überein.");
  }
  const timestamp = now().toISOString();
  await fs.writeFile(path.join(privateMaster, "manifest.json"), `${JSON.stringify({
    ...sourceManifest, state: "active", activatedAt: timestamp, requiresConfirmation: false,
  }, null, 2)}\n`);
  const publishedPackage = { ...verified.manifest, state: "active", activatedAt: timestamp };
  await fs.writeFile(manifestAt(verified.databasePath), `${JSON.stringify(publishedPackage, null, 2)}\n`);
  await fs.mkdir(path.dirname(masterRelease), { recursive: true });
  await fs.mkdir(path.dirname(packageRelease), { recursive: true });
  await fs.rename(privateMaster, masterRelease);
  await fs.rename(path.dirname(verified.databasePath), packageRelease);
  // A candidate already evaluated these inputs against its identity history. Reapplying
  // old names by scientific-name lookup here could undo a deliberate split/merge decision.
  const correctionsBaked = sourceManifest.inputRevisions?.corrections === taxonomyCorrectionsRevision(corrections);
  const release = correctionsBaked ? null : await prepareTaxonomyCorrectionRelease({ taxonomyRoot, searchRoot, corrections,
    masterDirectory: masterRelease, packageDirectory: packageRelease, now });
  const active = { id, masterVersion: verified.manifest.masterVersion, packageId: verified.manifest.packageId,
    masterChecksum, packageChecksum: verified.manifest.checksum, correctionPointer: release ? correctionPointer(release) : null };
  const pointer = { schemaVersion: 1, ...configured, active, previous,
    consumedCandidateId: sourceSlot === "staging" ? sourceManifest.candidateId : before?.consumedCandidateId || null,
    updatedAt: timestamp };
  // Expensive byte checks stay outside the short cross-process preference lock.
  if (await checksum(sourceDatabase) !== masterChecksum
    || await fs.readFile(manifestAt(sourceDatabase), "utf8") !== sourceManifestText) {
    throw new Error("Der Master-Kandidat wurde zwischenzeitlich geändert. Bitte erneut prüfen.");
  }
  return { pointer, sourceManifestText,
    result: { active: publishedPackage, previous, masterVersion: active.masterVersion, publicationId: id } };
}

/** The parent retains authority: only the short, freshly validated pointer swap is visible. */
export async function publishTaxonomyPair({ taxonomyRoot, searchRoot, confirmed = false,
  sourceSlot = "staging", readInputs = async () => null, corrections = [],
  validateInputs = async () => {}, buildPackage = buildLightroomSearchPackage,
  prepare = prepareTaxonomyPublication, onProgress = () => {}, now = () => new Date(),
  writePointer = writeTaxonomyPublication, signal,
} = {}) {
  if (!confirmed) throw new Error("Die gemeinsame Aktivierung muss ausdrücklich bestätigt werden.");
  if (!["active", "staging", "previous"].includes(sourceSlot)) throw new Error("Ungültiger Master-Speicherplatz.");
  ({ taxonomyRoot, searchRoot } = roots(taxonomyRoot, searchRoot));
  const id = `publication-${crypto.randomUUID()}`;
  const baseline = await generation(taxonomyRoot, searchRoot, readInputs);
  corrections = (await readInputs())?.corrections || corrections;
  const sourceDatabase = taxonomyMasterDatabasePath(taxonomyRoot, sourceSlot);
  const sourceManifestText = await fs.readFile(manifestAt(sourceDatabase), "utf8");
  const sourceManifest = JSON.parse(sourceManifestText);
  await validateInputs(sourceManifest);
  let publicationAttempted = false;
  try {
    signal?.throwIfAborted();
    const prepared = await prepare({ taxonomyRoot, searchRoot, id, action: "publish", sourceSlot, corrections,
      expectedSourceManifest: sourceManifestText, buildPackage, onProgress, now, signal });
    signal?.throwIfAborted();
    if (prepared.pointer?.active?.id !== id || prepared.sourceManifestText !== sourceManifestText) throw new Error("Unpassendes Ergebnis der Paarvorbereitung.");
    onProgress({ phase: "activate", percent: 99, message: "Geprüfter Master und Suchpaket werden gemeinsam aktiviert." });
    await withTaxonomyCorrectionLock(taxonomyRoot, async () => {
      if (await generation(taxonomyRoot, searchRoot, readInputs) !== baseline) {
        throw new Error("Datenstand oder Namenswahl wurden zwischenzeitlich geändert. Beide bisherigen Versionen bleiben aktiv.");
      }
      await validateInputs(sourceManifest);
      if (await fs.readFile(manifestAt(sourceDatabase), "utf8") !== sourceManifestText) {
        throw new Error("Der Kandidat wurde während der Aktivierung geändert.");
      }
      signal?.throwIfAborted();
      publicationAttempted = true;
      await writePointer(taxonomyRoot, prepared.pointer);
    });
    return prepared.result;
  } finally {
    // After a write attempt its outcome may be uncertain: retain release files.
    await cleanupPreparation(taxonomyRoot, searchRoot, id, publicationAttempted);
  }
}

async function prepareRollback({ taxonomyRoot, searchRoot, corrections, now }) {
  const pointer = readTaxonomyPublication(taxonomyRoot);
  if (!pointer?.previous) throw new Error("Es ist kein gemeinsam gespeicherter Vorgängerstand vorhanden.");
  const previous = await currentEntry(taxonomyRoot, searchRoot);
  const masterDatabase = taxonomyMasterDatabasePath(taxonomyRoot, "previous");
  const packageDatabase = lightroomSearchDatabasePath(searchRoot, "previous");
  const verified = await verifyLightroomSearchPackage({ searchRoot, slot: "previous" });
  const master = await json(manifestAt(masterDatabase));
  if (master.candidateId !== pointer.previous.masterVersion
    || verified.manifest.packageId !== pointer.previous.packageId
    || verified.manifest.masterVersion !== pointer.previous.masterVersion
    || await checksum(masterDatabase) !== pointer.previous.masterChecksum
    || verified.manifest.checksum !== pointer.previous.packageChecksum) {
    throw new Error("Der vorherige Master-/Suchpaketstand ist nicht mehr vollständig oder unverändert.");
  }
  // Revalidate today's preferences against the previous identities; never silently discard them.
  const release = await prepareTaxonomyCorrectionRelease({ taxonomyRoot, searchRoot, corrections,
    masterDirectory: path.dirname(masterDatabase), packageDirectory: path.dirname(packageDatabase), now });
  return { pointer: { ...pointer,
    active: { ...pointer.previous, correctionPointer: correctionPointer(release) }, previous,
    updatedAt: now().toISOString() }, result: { active: verified.manifest, masterVersion: master.candidateId } };
}

export async function rollbackTaxonomyPair({ taxonomyRoot, searchRoot, confirmed = false,
  corrections = [], readInputs = async () => null, now = () => new Date(), onProgress = () => {},
  prepare = prepareTaxonomyPublication, writePointer = writeTaxonomyPublication, signal,
} = {}) {
  if (!confirmed) throw new Error("Die gemeinsame Wiederherstellung muss ausdrücklich bestätigt werden.");
  ({ taxonomyRoot, searchRoot } = roots(taxonomyRoot, searchRoot));
  const baseline = await generation(taxonomyRoot, searchRoot, readInputs);
  corrections = (await readInputs())?.corrections || corrections;
  signal?.throwIfAborted();
  onProgress({ phase: "verify", percent: 0, message: "Vorheriges Master-/Suchpaket wird im Hintergrund geprüft." });
  const prepared = await prepare({ taxonomyRoot, searchRoot, id: `publication-${crypto.randomUUID()}`,
    action: "rollback", corrections, now, onProgress, signal });
  signal?.throwIfAborted();
  await withTaxonomyCorrectionLock(taxonomyRoot, async () => {
    if (await generation(taxonomyRoot, searchRoot, readInputs) !== baseline) {
      throw new Error("Datenstand oder Namenswahl wurden während der Wiederherstellung geändert.");
    }
    signal?.throwIfAborted();
    await writePointer(taxonomyRoot, prepared.pointer);
  });
  return prepared.result;
}
