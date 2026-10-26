import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, loadNodeSqlite, readActiveTaxonomyPointer, taxonomyActivePointerPath,
  taxonomyDatabasePath, taxonomyReleaseManifestPath } from "./taxonomy-storage.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { readIdentityRegistry, validateIdentityRegistry, identityRegistryRevision, taxonIdentityKey } from "./taxonomy-identity-registry.mjs";
import { assertCatalogUsageRevision } from "./lightroom-catalog-usage.mjs";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { readActiveTaxonomyCorrectionRelease } from "./taxonomy-correction-release.mjs";
import { identityTaxonDetails } from "./taxonomy-identity-cases.mjs";
import { assertMatchingClassificationCase, assertUnclearClassificationCase } from "./taxonomy-classification-review.mjs";
import { latestProviderSliceVersion, providerSliceManifestPath, providerSliceDataPath } from "./taxonomy-master-slices.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { identityBuildSourceRevision } from "./taxonomy-identity-build.mjs";
import { readVersionJson } from "./taxonomy-data-versions.mjs";

const digest = (value) => crypto.createHash("sha256").update(canonicalBuildInput(value)).digest("hex");
const same = (a, b) => canonicalBuildInput(a) === canonicalBuildInput(b);
const renewalPath = (root) => path.join(root, "master", "classification-usage-renewals.json");
const providers = ["inaturalist", "gbif", "worms", "wikidata", "animalia"];
const REVIEW_LIMIT = 12 * 1024 * 1024, RENEWAL_LIMIT = 16 * 1024 * 1024;
const CANDIDATE_MANIFEST_LIMIT = 12 * 1024 * 1024;
async function json(filename, maxBytes = 512 * 1024) {
  try {
    if ((await fs.stat(filename)).size > maxBytes) throw new Error("Die Klassifikations-Erneuerungsdatei überschreitet die zulässige Größe.");
    const content = await fs.readFile(filename, "utf8");
    if (Buffer.byteLength(content) > maxBytes) throw new Error("Die Klassifikations-Erneuerungsdatei wurde während des Lesens vergrößert.");
    return JSON.parse(content);
  }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function stamp(filename) {
  const value = await fs.stat(filename, { bigint: true });
  if (!value.isFile()) throw new Error("Die Erneuerungsgrundlagen sind keine regulären Dateien.");
  return [value.size, value.mtimeNs, value.ctimeNs, value.birthtimeNs].map(String);
}
async function context(root) {
  const review = await json(path.join(root, "master", "identity-review.json"), REVIEW_LIMIT);
  if (!review) return null;
  validateIdentityRegistry(review.registry);
  if (review.schemaVersion !== 1 || review.revision !== identityRegistryRevision(review.registry)) throw new Error("Die Identitätsvormerkung wurde verändert.");
  if (!review.registry.events.some((event) => event.classificationAutomation)) return null;
  const manifest = await readVersionJson(taxonomyMasterManifestPath(root), { masterHeader: true });
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
  let activeRegistry;
  try { activeRegistry = readIdentityRegistry(database); }
  finally { database.close(); }
  if (!same(review.registry.events.slice(0, activeRegistry.events.length), activeRegistry.events)) throw new Error("Die Identitätsvormerkung gehört nicht zur aktiven Historie.");
  const activeIds = new Set(activeRegistry.events.map((event) => event.eventId));
  const pending = review.registry.events.filter((event) => event.classificationAutomation && !activeIds.has(event.eventId));
  if (!pending.length) return null;
  const sources = [...new Set(pending.map((event) => event.sourceRevision))];
  const inputs = [...new Set(pending.map((event) => event.inputRevision))];
  if (sources.length !== 1 || inputs.length !== 1 || pending.some((event) => event.baseVersion !== manifest?.candidateId)) {
    throw new Error("Die automatischen Vormerkungen besitzen unterschiedliche Erneuerungsgrundlagen.");
  }
  const selection = await sourceFiles(root, []);
  const sourceMetadata = await Promise.all(selection.filenames.filter((filename) => filename === taxonomyActivePointerPath(root) || path.basename(filename) === "manifest.json")
    .map(async (filename) => [filename, await json(filename)]));
  const referenceManifest = selection.reference ? sourceMetadata.find(([filename]) => filename === taxonomyReleaseManifestPath(root, selection.reference))?.[1] : null;
  const releases = [
    ...(selection.reference ? [{ provider: "catalogue-of-life", releaseId: selection.reference,
      providerVersion: selection.reference, checksumSha256: referenceManifest?.source?.checksumSha256 || null }] : []),
    ...selection.versions.filter(([, version]) => version).map(([provider, version]) => {
      const manifest = sourceMetadata.find(([filename]) => filename === providerSliceManifestPath(root, provider, version))?.[1];
      if (manifest?.provider !== provider || manifest?.providerVersion !== version) throw new Error("Die Anbieter-Grundlagen der Erneuerung sind nicht vollständig.");
      return { provider, providerVersion: version, releaseId: `${provider}-${version}`, checksumSha256: manifest.checksumSha256 || null };
    }),
  ];
  const target = { identityReviewRevision: review.revision, eventIds: pending.map((event) => event.eventId).sort(),
    usageRevisions: [...new Set(pending.map((event) => event.classificationAutomation.usageRevision))].sort(),
    eventRevision: digest(pending), activeMasterId: manifest.candidateId, candidateId: review.candidateId,
    identitySources: sources[0], identityInputs: inputs[0], activeManifestRevision: digest(manifest),
    activeRegistryRevision: identityRegistryRevision(activeRegistry), sourceMetadataRevision: digest(sourceMetadata) };
  return { review, pending, target, manifest, currentIdentitySources: releases.length ? identityBuildSourceRevision(releases) : null };
}

// This target can be bound to a confirmed restart even while the former usage
// proof is stale. It never grants renewed absence of photo usage on its own.
export async function pendingClassificationUsageRenewalTarget(root) {
  return (await context(root))?.target || null;
}

async function sourceFiles(root, inputFiles) {
  const reference = await readActiveTaxonomyPointer(root);
  const versions = await Promise.all(providers.map(async (provider) => [provider, await latestProviderSliceVersion(root, provider)]));
  return { reference: reference?.activeRelease || null, versions, filenames: [...new Set([
    ...inputFiles, taxonomyActivePointerPath(root),
    ...(reference ? [taxonomyDatabasePath(root, reference.activeRelease), taxonomyReleaseManifestPath(root, reference.activeRelease)] : []),
    ...versions.flatMap(([provider, version]) => version ? [providerSliceManifestPath(root, provider, version), providerSliceDataPath(root, provider, version)] : []),
  ])] };
}
async function binding(filename) {
  const before = await stamp(filename).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (!before) return { filename, fileStamp: null, checksum: null };
  const checksum = await masterFileFingerprint(filename);
  if (!same(before, await stamp(filename))) throw new Error("Die Erneuerungsgrundlagen wurden während der Prüfung verändert.");
  return { filename, fileStamp: before, checksum };
}
async function assertBinding(value, full) {
  const current = await stamp(value.filename).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (!same(current, value.fileStamp) || full && current && await masterFileFingerprint(value.filename) !== value.checksum) {
    throw new Error("Die gespeicherten Erneuerungsgrundlagen wurden verändert. Bitte erneut prüfen.");
  }
  if (full && current && !same(current, await stamp(value.filename))) throw new Error("Die Erneuerungsgrundlagen wurden während der Prüfung verändert.");
}
function checkedRenewals(value) {
  if (!value) return { schemaVersion: 1, records: [] };
  if (value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > 1000) throw new Error("Das Klassifikations-Erneuerungsregister wurde verändert.");
  let previousRevision = "";
  for (const record of value.records) {
    const { revision, ...body } = record;
    if (revision !== digest(body) || body.previousRevision !== previousRevision || body.schemaVersion !== 1
        || !/^[a-f0-9]{64}$/.test(body.usageRevision || "") || !Array.isArray(body.files)
        || !body.target || !Number.isFinite(Date.parse(body.renewedAt))) throw new Error("Die Klassifikations-Erneuerung wurde verändert.");
    previousRevision = revision;
  }
  return value;
}
async function assertReceipt(root, value, record, full) {
  if (!same(record.target, value.target)) throw new Error("Die Klassifikations-Erneuerung passt nicht zur Identitätsvormerkung.");
  const sources = await sourceFiles(root, record.inputFiles);
  if (!same({ reference: sources.reference, versions: sources.versions }, record.sourceSelection)
      || !same(sources.filenames, record.files.filter((file) => !file.role).map((file) => file.filename))) {
    throw new Error("Die Quellenauswahl der Erneuerung wurde verändert.");
  }
  const correction = await readActiveTaxonomyCorrectionRelease(root, { expectedMasterVersion: value.target.activeMasterId });
  if ((correction?.revision || "") !== record.correctionRevision) throw new Error("Die Korrekturgrundlagen der Erneuerung wurden verändert.");
  for (const file of record.files) await assertBinding(file, full);
  return assertCatalogUsageRevision(root, record.usageRevision, { full });
}

// Only this deliberate transition can replace an obsolete usage proof. The
// event history remains immutable; the receipt appends a separately bound proof.
async function inspectRenewal(root, {
  target, usageRevision, inputFiles, readInputRevision, now = () => new Date(), previewOnly = false, token,
} = {}) {
  if (!Array.isArray(inputFiles) || inputFiles.length < 2 || inputFiles.some((file) => !path.isAbsolute(file))
      || typeof readInputRevision !== "function") throw new Error("Die aktuellen Projekt-/Quellen-Grundlagen für die Erneuerung fehlen.");
  return withTaxonomyCorrectionLock(root, async () => {
    const value = await context(root);
    if (!value || !same(target, value.target)) throw new Error("Das bestätigte Erneuerungsziel der Identitätsvormerkung wurde verändert.");
    if (value.currentIdentitySources && value.currentIdentitySources !== target.identitySources) {
      throw new Error("Die heutigen Quellen-Grundlagen passen nicht zur vorgemerkten Klassifikationsentscheidung.");
    }
    const usage = await assertCatalogUsageRevision(root, usageRevision, { full: true });
    if (await readInputRevision() !== target.identityInputs) throw new Error("Die Projekt-/Namens-Grundlagen wurden verändert.");
    const stored = checkedRenewals(await json(renewalPath(root), RENEWAL_LIMIT));
    const previous = stored.records.findLast((record) => same(record.target, target) && record.usageRevision === usageRevision);
    if (previous) {
      await assertReceipt(root, value, previous, true);
      const currentToken = digest(previous);
      if (token !== undefined && token !== currentToken) throw new Error("Die Klassifikations-Erneuerungsvorschau ist veraltet.");
      return { renewed: !previewOnly, available: true, token: currentToken, usageRevision,
        receiptRevision: previous.revision, target, changesPhotos: false };
    }
    const candidateManifest = await json(taxonomyMasterManifestPath(root, "staging"), CANDIDATE_MANIFEST_LIMIT);
    if (candidateManifest?.candidateId !== target.candidateId
        || candidateManifest.inputRevisions?.identitySources !== target.identitySources
        || candidateManifest.inputRevisions?.identityInputs !== target.identityInputs) throw new Error("Die ursprünglichen Kandidaten-/Quellen-Grundlagen wurden verändert.");
    const correction = await readActiveTaxonomyCorrectionRelease(root, { expectedMasterVersion: target.activeMasterId });
    const protectedIds = new Set([...usage.usedIds, ...(correction?.entries || []).map((entry) => entry.masterTaxonId),
      ...value.review.registry.events.filter((event) => !event.classificationAutomation)
        .flatMap((event) => [...event.sources, ...event.targets].map((taxon) => taxon.masterTaxonId))]);
    const { DatabaseSync } = await loadNodeSqlite();
    let active, candidate;
    const caseProofs = [];
    const activeStamp = await stamp(taxonomyMasterDatabasePath(root));
    const candidateStamp = await stamp(taxonomyMasterDatabasePath(root, "staging"));
    try {
      active = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
      candidate = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
      const protectedTaxon = (db, taxon) => protectedIds.has(taxon.masterTaxonId) || taxon.projects.length
        || db.prepare("SELECT 1 FROM master_field_assertion WHERE master_taxon_id=? AND origin_kind IN ('manual','project') LIMIT 1").get(taxon.masterTaxonId)
        || db.prepare("SELECT 1 FROM master_taxon_status WHERE master_taxon_id=? AND status_name='manually-protected' LIMIT 1").get(taxon.masterTaxonId)
        || db.prepare("SELECT 1 FROM master_decision WHERE master_taxon_id=? LIMIT 1").get(taxon.masterTaxonId);
      for (const event of value.pending) {
        const proof = event.type === "classification-deferred" ? assertUnclearClassificationCase(event.classificationCase)
          : assertMatchingClassificationCase(event.classificationCase);
        const row = candidate.prepare("SELECT master_taxon_id,resolution_note FROM master_conflict WHERE conflict_id=? AND conflict_state='open'")
          .get(`classification_${proof.revision}`);
        if (!row || !same(JSON.parse(row.resolution_note), proof)) throw new Error("Der ursprüngliche Klassifikations-Quellenfall wurde verändert.");
        const sources = proof.sources.map((taxon) => identityTaxonDetails(active, taxon.masterTaxonId));
        const destination = identityTaxonDetails(candidate, row.master_taxon_id);
        const col = destination.evidence.filter((entry) => entry.provider === "catalogue-of-life");
        if (sources.some((taxon, index) => taxonIdentityKey(taxon) !== taxonIdentityKey(proof.sources[index])
            || !same(taxon.evidence.map(canonicalBuildInput).sort(), proof.sources[index].evidence.map(canonicalBuildInput).sort())
            || active.prepare("SELECT reference_state FROM master_taxon WHERE master_taxon_id=?").get(taxon.masterTaxonId).reference_state !== "reference-gap")
            || taxonIdentityKey(destination) !== taxonIdentityKey(proof.target)
            || col.length !== proof.target.colRecords.length || col.some((entry) => entry.providerVersion !== proof.colVersion
              || !proof.target.colRecords.some((record) => record.providerRecordId === entry.providerRecordId))
            || active.prepare("SELECT 1 FROM master_taxon WHERE canonical_name_normalized=? AND rank=? AND kingdom=? AND lifecycle_state!='deprecated' LIMIT 1")
              .get(normalizeTaxonomySearchTerm(destination.scientificName), destination.rank, destination.kingdom)) {
          throw new Error("Die Klassifikations-Quellenbelege oder aktiven Grundlagen wurden verändert.");
        }
        if ([...event.sources, ...event.targets].some((taxon) => usage.usedIds.includes(taxon.masterTaxonId))) {
          throw new Error("Eine automatisch vorgemerkte Art ist inzwischen zugewiesen. Erneute Entscheidung erforderlich.");
        }
        if (sources.some((taxon) => protectedTaxon(active, taxon)) || protectedTaxon(candidate, destination)) {
          throw new Error("Eine automatisch vorgemerkte Art ist inzwischen manuell oder durch ein Projekt geschützt.");
        }
        caseProofs.push({ eventId: event.eventId, proof, sources: JSON.parse(JSON.stringify(sources)), target: JSON.parse(JSON.stringify(destination)) });
      }
    } finally { candidate?.close(); active?.close(); }
    const source = await sourceFiles(root, inputFiles);
    const files = await Promise.all(source.filenames.map(binding));
    if (files.slice(0, inputFiles.length).some((file) => !file.fileStamp)) throw new Error("Die aktuellen Projekt-Grundlagen fehlen.");
    const activeBinding = { ...await binding(taxonomyMasterDatabasePath(root)), role: "active-master" };
    const activeManifestBinding = { ...await binding(taxonomyMasterManifestPath(root)), role: "active-manifest" };
    const candidateBinding = await binding(taxonomyMasterDatabasePath(root, "staging"));
    if (!same(activeBinding.fileStamp, activeStamp) || !same(candidateBinding.fileStamp, candidateStamp)
        || candidateManifest.buildInputs?.available && candidateManifest.buildInputs.masterSha256 !== candidateBinding.checksum
        || !same((await context(root))?.target, target) || await readInputRevision() !== target.identityInputs
        || !same(await json(taxonomyMasterManifestPath(root, "staging"), CANDIDATE_MANIFEST_LIMIT), candidateManifest)) {
      throw new Error("Die Erneuerungsgrundlagen wurden während der Prüfung verändert.");
    }
    const body = { schemaVersion: 1, previousRevision: stored.records.at(-1)?.revision || "", renewedAt: now().toISOString(), target,
      usageRevision, correctionRevision: correction?.revision || "", inputFiles, files: [...files, activeBinding, activeManifestBinding],
      sourceSelection: { reference: source.reference, versions: source.versions },
      originalCandidate: { manifestRevision: digest(candidateManifest), databaseChecksum: candidateBinding.checksum }, caseProofs };
    const record = { ...body, revision: digest(body) };
    await assertReceipt(root, value, record, false);
    const currentToken = digest({ ...body, renewedAt: null });
    if (previewOnly) return { available: true, token: currentToken, target, usageRevision, eventCount: value.pending.length, changesPhotos: false };
    if (token !== undefined && token !== currentToken) throw new Error("Die Klassifikations-Erneuerungsvorschau ist veraltet.");
    const document = { schemaVersion: 1, records: [...stored.records, record] };
    if (Buffer.byteLength(JSON.stringify(document, null, 2)) > RENEWAL_LIMIT) throw new Error("Das Klassifikations-Erneuerungsregister überschreitet die zulässige Größe.");
    await atomicWriteJson(renewalPath(root), document);
    return { renewed: true, receiptRevision: record.revision, target, changesPhotos: false };
  });
}

export async function renewPendingClassificationAutomation(root, options) {
  return inspectRenewal(root, options);
}

export function createClassificationUsageRenewalService({ taxonomyRoot, readInputRevision, inputFiles, now = () => new Date() }) {
  const options = { readInputRevision, inputFiles, now };
  return {
    preview(target, usageRevision) { return inspectRenewal(taxonomyRoot, { ...options, target, usageRevision, previewOnly: true }); },
    async save(payload) {
      if (payload?.confirmed !== true || typeof payload.token !== "string") throw new Error("Die Klassifikations-Erneuerung benötigt eine bestätigte aktuelle Vorschau.");
      return inspectRenewal(taxonomyRoot, { ...options, target: payload.target, usageRevision: payload.usageRevision, token: payload.token });
    },
  };
}

// Polls inspect small registry rows, manifests and stamps. Full checksums are
// reserved for the explicit renewal/build/publication boundaries.
export async function assertPendingClassificationAutomation(root, { full = false } = {}) {
  const value = await context(root);
  if (!value) return null;
  const stored = checkedRenewals(await json(renewalPath(root), RENEWAL_LIMIT));
  const receipt = stored.records.findLast((record) => same(record.target, value.target));
  if (receipt) {
    const usage = await assertReceipt(root, value, receipt, full);
    if (value.pending.some((event) => [...event.sources, ...event.targets].some((taxon) => usage.usedIds.includes(taxon.masterTaxonId)))) {
      throw new Error("Eine automatisch vorgemerkte Art ist inzwischen zugewiesen. Erneute Prüfung erforderlich.");
    }
    return { usageRevisions: [receipt.usageRevision], eventIds: value.pending.map((event) => event.eventId), receiptRevision: receipt.revision };
  }
  const revisions = [...new Set(value.pending.map((event) => event.classificationAutomation.usageRevision))];
  for (const revision of revisions) {
    const usage = await assertCatalogUsageRevision(root, revision, { full });
    const used = new Set(usage.usedIds);
    if (value.pending.some((event) => event.classificationAutomation.usageRevision === revision
        && [...event.sources, ...event.targets].some((taxon) => used.has(taxon.masterTaxonId)))) {
      throw new Error("Eine automatisch vorgemerkte Art ist inzwischen zugewiesen. Erneute Prüfung erforderlich.");
    }
  }
  return { usageRevisions: revisions, eventIds: value.pending.map((event) => event.eventId) };
}
