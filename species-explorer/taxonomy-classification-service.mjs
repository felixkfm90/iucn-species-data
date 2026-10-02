import crypto from "node:crypto";
import fs from "node:fs/promises";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { readActiveTaxonomyCorrectionRelease } from "./taxonomy-correction-release.mjs";
import { identityTaxonDetails } from "./taxonomy-identity-cases.mjs";
import { readIdentityRegistry, identityRegistryRevision, taxonIdentityKey, appendClassificationBatch } from "./taxonomy-identity-registry.mjs";
import { assertClassificationReviewSummary, assertMatchingClassificationCase, assertUnclearClassificationCase, summarizeClassificationReview,
  isClassificationReviewConflict } from "./taxonomy-classification-review.mjs";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

const digest = (value) => crypto.createHash("sha256").update(canonicalBuildInput(value)).digest("hex");
const same = (a, b) => canonicalBuildInput(a) === canonicalBuildInput(b);
const evidenceKey = (value) => value.map(canonicalBuildInput).sort();

// Invoked only by the explicit batch button. It reads stored conflicts and
// indexed affected taxa, never downloads, builds, activates or touches photos.
export function createClassificationReviewService({ taxonomyRoot, now, readInputRevision, readReview, writeReview }) {
  async function inspect(deferred = false) {
    const [activeManifest, candidateManifest, pending] = await Promise.all([
      fs.readFile(taxonomyMasterManifestPath(taxonomyRoot), "utf8").then(JSON.parse),
      fs.readFile(taxonomyMasterManifestPath(taxonomyRoot, "staging"), "utf8").then(JSON.parse), readReview(),
    ]);
    const revisions = candidateManifest.inputRevisions;
    if (!revisions?.identitySources || !revisions?.identityInputs || !revisions?.identities
        || (readInputRevision && await readInputRevision() !== revisions.identityInputs)) {
      throw new Error("Die Kandidatengrundlagen oder Projekt-/Namenswerte sind veraltet. Bitte einen neuen Kandidaten prüfen.");
    }
    const { DatabaseSync } = await loadNodeSqlite();
    let active, candidate;
    try {
      active = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot), { readOnly: true });
      candidate = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "staging"), { readOnly: true });
      const activeRegistry = readIdentityRegistry(active), registry = pending?.registry || activeRegistry;
      const candidateRegistry = readIdentityRegistry(candidate);
      if (!same(registry.events.slice(0, activeRegistry.events.length), activeRegistry.events)
          || !same(registry.events.slice(0, candidateRegistry.events.length), candidateRegistry.events)
          || identityRegistryRevision(candidateRegistry) !== revisions.identities) {
        throw new Error("Die Identitätsvormerkungen passen nicht mehr zum Kandidaten. Bitte erneut aufbauen; keine doppelte Übernahme.");
      }
      assertClassificationReviewSummary(candidate, candidateManifest.classificationReview);
      if (deferred && candidateManifest.classificationReview?.deferralAvailable !== true) {
        throw new Error("Dieser ältere Kandidat besitzt noch keine geprüfte Zurückstellungsgrenze. Bitte erneut aufbauen.");
      }
      const rows = candidate.prepare("SELECT * FROM master_conflict WHERE conflict_state='open' AND conflict_id GLOB 'classification_*' ORDER BY conflict_id").all();
      const cases = rows.map((row) => {
        const value = JSON.parse(row.resolution_note);
        if (!isClassificationReviewConflict(row) || row.conflict_state !== "open" || row.conflict_id !== `classification_${value.revision}`) {
          throw new Error("Die gespeicherten Klassifikationsfälle wurden verändert. Bitte erneut prüfen.");
        }
        return value;
      });
      const summary = summarizeClassificationReview(cases);
      if (summary.revision !== candidateManifest.classificationReview?.revision) {
        throw new Error("Es gibt keine unverändert geprüfte passende Klassifikationsgruppe zur Übernahme.");
      }
      const caseRevisions = new Set(cases.map((value) => value.revision));
      const additions = registry.events.slice(candidateRegistry.events.length);
      if (additions.some((event) => !["classification", "classification-deferred"].includes(event.type)
          || !caseRevisions.has(event.classificationCase.revision) || event.baseVersion !== activeManifest.candidateId
          || event.sourceRevision !== revisions.identitySources || event.inputRevision !== revisions.identityInputs)
          || (additions.length && pending?.candidateId !== candidateManifest.candidateId)) {
        throw new Error("Die Identitätsvormerkungen gehören nicht zu dieser Klassifikationsprüfung. Bitte erneut aufbauen.");
      }
      const saved = new Set(additions.map((event) => event.classificationCase.revision));
      const eligible = cases.filter((value) => (value.category !== "matching-provider-id") === deferred && !saved.has(value.revision));
      if (!eligible.length) throw new Error("Diese Klassifikationsfälle sind bereits vorgemerkt oder nicht vorhanden; keine doppelte Übernahme.");
      const boundDetails = [];
      const selectedIds = new Set(), selectedKeys = new Set();
      const byRevision = new Map(rows.map((row) => [row.conflict_id.slice("classification_".length), row]));
      for (const value of eligible) {
        const proof = deferred ? assertUnclearClassificationCase(value) : assertMatchingClassificationCase(value);
        const sources = proof.sources.map((entry) => identityTaxonDetails(active, entry.masterTaxonId));
        const row = byRevision.get(proof.revision);
        const target = identityTaxonDetails(candidate, row.master_taxon_id);
        const colEvidence = target.evidence.filter((entry) => entry.provider === "catalogue-of-life");
        const occupied = active.prepare(`SELECT master_taxon_id FROM master_taxon WHERE canonical_name_normalized=?
          AND rank=? AND kingdom=? AND lifecycle_state!='deprecated'`).all(normalizeTaxonomySearchTerm(target.scientificName), target.rank, target.kingdom);
        if (proof.baseVersion !== activeManifest.candidateId || target.lifecycleState !== "active"
            || taxonIdentityKey(target) !== taxonIdentityKey(proof.target)
            || sources.some((source, index) => source.lifecycleState !== "active"
              || active.prepare("SELECT reference_state FROM master_taxon WHERE master_taxon_id=?").get(source.masterTaxonId).reference_state !== "reference-gap"
              || taxonIdentityKey(source) !== taxonIdentityKey(proof.sources[index])
              || !same(evidenceKey(source.evidence), evidenceKey(proof.sources[index].evidence)))
            || colEvidence.length !== proof.target.colRecords.length || colEvidence.some((entry) => entry.providerVersion !== proof.colVersion
              || !proof.target.colRecords.some((record) => record.providerRecordId === entry.providerRecordId))
            || occupied.length || (!deferred && sources.some((source) => selectedIds.has(source.masterTaxonId)))
            || selectedKeys.has(taxonIdentityKey(target))
            || (deferred && (target.projects.length || target.evidence.length !== colEvidence.length))) {
          throw new Error("Die Klassifikationsgruppe ist nicht mehr eindeutig mit dem aktiven Master und dem CoL-Kandidaten belegt.");
        }
        sources.forEach((source) => selectedIds.add(source.masterTaxonId));
        selectedKeys.add(taxonIdentityKey(target));
        // SQLite returns name rows with a null prototype; bind their JSON data,
        // not the runtime-specific row object representation.
        boundDetails.push(JSON.parse(JSON.stringify({ sources, target })));
      }
      const correction = await readActiveTaxonomyCorrectionRelease(taxonomyRoot, { expectedMasterVersion: activeManifest.candidateId });
      const token = digest({ activeManifest, candidateManifest, registry, boundDetails, cases, deferred, correctionRevision: correction?.revision || "" });
      // Validate the entire prospective history while still in read-only preview.
      appendClassificationBatch({ registry, cases: eligible, batchRevision: token, sourceRevision: revisions.identitySources,
        inputRevision: revisions.identityInputs, confirmedAt: "2000-01-01T00:00:00.000Z", deferred });
      return { registry, eligible, token, summary, candidateManifest };
    } finally { candidate?.close(); active?.close(); }
  }
  return {
    async classificationDeferralPreview() {
      const value = await inspect(true);
      return { token: value.token, count: value.eligible.length, remaining: value.summary.matchingProviderId,
        groups: summarizeClassificationReview(value.eligible).groups, requiresConfirmation: true, changesPhotos: false,
        message: "Unklare CoL-Gegenstücke vorerst nicht übernehmen. Bisherige Arten, IDs, eigene Namen und Projektlinks bleiben erhalten. Geänderte Quellenfälle werden erneut offen geprüft. Kein Aufbau oder Paketwechsel." };
    },
    async classificationDeferralSave(payload) {
      if (payload?.confirmed !== true) throw new Error("Die Zurückstellung muss ausdrücklich bestätigt werden.");
      return withTaxonomyCorrectionLock(taxonomyRoot, async () => {
        const value = await inspect(true);
        if (payload.token !== value.token) throw new Error("Die Zurückstellungsvorschau ist veraltet. Bitte erneut prüfen.");
        const registry = appendClassificationBatch({ registry: value.registry, cases: value.eligible, deferred: true,
          batchRevision: value.token, sourceRevision: value.candidateManifest.inputRevisions.identitySources,
          inputRevision: value.candidateManifest.inputRevisions.identityInputs, confirmedAt: now().toISOString() });
        const revision = identityRegistryRevision(registry);
        await writeReview({ schemaVersion: 1, registry, revision, savedAt: now().toISOString(), candidateId: value.candidateManifest.candidateId });
        return { saved: true, pending: true, count: value.eligible.length, revision, changesPhotos: false,
          message: "Unklare Klassifikationen zur Zurückstellung vorgemerkt. Erst ein frischer geprüfter Kandidat lässt die neuen CoL-Gegenstücke aus; bisherige Arten und Fotos bleiben unverändert." };
      });
    },
    async classificationPreview() {
      const value = await inspect();
      return { token: value.token, count: value.eligible.length, remaining: value.summary.total - value.eligible.length,
        groups: summarizeClassificationReview(value.eligible).groups, requiresConfirmation: true, changesPhotos: false,
        message: "Die passende CoL-Klassifikation wird mit ursprünglicher Master-ID vorgemerkt. Eigene Namen und Projektlinks bleiben erhalten. Unklare Fälle bleiben gesperrt. Kein Aufbau oder Paketwechsel startet durch diese Bestätigung." };
    },
    async classificationSave(payload) {
      if (payload?.confirmed !== true) throw new Error("Die Klassifikationsgruppe muss ausdrücklich bestätigt werden.");
      return withTaxonomyCorrectionLock(taxonomyRoot, async () => {
        const value = await inspect();
        if (payload.token !== value.token) throw new Error("Die Bündelvorschau ist veraltet. Bitte erneut prüfen.");
        const registry = appendClassificationBatch({ registry: value.registry, cases: value.eligible, batchRevision: value.token,
          sourceRevision: value.candidateManifest.inputRevisions.identitySources,
          inputRevision: value.candidateManifest.inputRevisions.identityInputs, confirmedAt: now().toISOString() });
        const revision = identityRegistryRevision(registry);
        await writeReview({ schemaVersion: 1, registry, revision, savedAt: now().toISOString(), candidateId: value.candidateManifest.candidateId });
        return { saved: true, pending: true, count: value.eligible.length, remaining: value.summary.total - value.eligible.length,
          revision, changesPhotos: false,
          message: "Passende Klassifikationen vorgemerkt. Ein frischer Kandidat muss sie erneut prüfen. Unklare Fälle bleiben gesperrt; Master, Lightroom-Paket und Fotos bleiben unverändert." };
      });
    },
  };
}
