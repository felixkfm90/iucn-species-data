import crypto from "node:crypto";
import fs from "node:fs/promises";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { readActiveTaxonomyCorrectionRelease } from "./taxonomy-correction-release.mjs";
import { identityTaxonDetails } from "./taxonomy-identity-cases.mjs";
import { readIdentityRegistry, identityRegistryRevision, taxonIdentityKey, appendClassificationBatch } from "./taxonomy-identity-registry.mjs";
import { assertClassificationReviewSummary, assertMatchingClassificationCase, summarizeClassificationReview,
  isClassificationReviewConflict } from "./taxonomy-classification-review.mjs";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

const digest = (value) => crypto.createHash("sha256").update(canonicalBuildInput(value)).digest("hex");
const same = (a, b) => canonicalBuildInput(a) === canonicalBuildInput(b);
const evidenceKey = (value) => value.map(canonicalBuildInput).sort();

// Invoked only by the explicit batch button. It reads stored conflicts and
// indexed affected taxa, never downloads, builds, activates or touches photos.
export function createClassificationReviewService({ taxonomyRoot, now, readInputRevision, readReview, writeReview }) {
  async function inspect() {
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
      if (!same(registry.events.slice(0, activeRegistry.events.length), activeRegistry.events)
          || identityRegistryRevision(registry) !== revisions.identities
          || identityRegistryRevision(readIdentityRegistry(candidate)) !== revisions.identities) {
        throw new Error("Die Identitätsvormerkungen passen nicht mehr zum Kandidaten. Bitte erneut aufbauen; keine doppelte Übernahme.");
      }
      assertClassificationReviewSummary(candidate, candidateManifest.classificationReview);
      const rows = candidate.prepare("SELECT * FROM master_conflict WHERE conflict_id GLOB 'classification_*' ORDER BY conflict_id").all();
      const cases = rows.map((row) => {
        const value = JSON.parse(row.resolution_note);
        if (!isClassificationReviewConflict(row) || row.conflict_state !== "open" || row.conflict_id !== `classification_${value.revision}`) {
          throw new Error("Die gespeicherten Klassifikationsfälle wurden verändert. Bitte erneut prüfen.");
        }
        return value;
      });
      const summary = summarizeClassificationReview(cases);
      if (summary.revision !== candidateManifest.classificationReview?.revision || !summary.matchingProviderId) {
        throw new Error("Es gibt keine unverändert geprüfte passende Klassifikationsgruppe zur Übernahme.");
      }
      const eligible = cases.filter((value) => value.category === "matching-provider-id");
      const boundDetails = [];
      const selectedIds = new Set(), selectedKeys = new Set();
      const byRevision = new Map(rows.map((row) => [row.conflict_id.slice("classification_".length), row]));
      for (const value of eligible) {
        const proof = assertMatchingClassificationCase(value);
        const source = identityTaxonDetails(active, proof.sources[0].masterTaxonId);
        const reference = active.prepare("SELECT reference_state FROM master_taxon WHERE master_taxon_id=?").get(source.masterTaxonId);
        const row = byRevision.get(proof.revision);
        const target = identityTaxonDetails(candidate, row.master_taxon_id);
        const colEvidence = target.evidence.filter((entry) => entry.provider === "catalogue-of-life");
        const occupied = active.prepare(`SELECT master_taxon_id FROM master_taxon WHERE canonical_name_normalized=?
          AND rank=? AND kingdom=? AND lifecycle_state!='deprecated'`).all(normalizeTaxonomySearchTerm(target.scientificName), target.rank, target.kingdom);
        if (proof.baseVersion !== activeManifest.candidateId || source.lifecycleState !== "active" || reference.reference_state !== "reference-gap"
            || target.lifecycleState !== "active" || taxonIdentityKey(source) !== taxonIdentityKey(proof.sources[0])
            || taxonIdentityKey(target) !== taxonIdentityKey(proof.target) || !same(evidenceKey(source.evidence), evidenceKey(proof.sources[0].evidence))
            || colEvidence.length !== 1 || colEvidence[0].providerVersion !== proof.colVersion
            || colEvidence[0].providerRecordId !== proof.target.colRecords[0].providerRecordId
            || occupied.length || selectedIds.has(source.masterTaxonId) || selectedKeys.has(taxonIdentityKey(target))) {
          throw new Error("Die Klassifikationsgruppe ist nicht mehr eindeutig mit dem aktiven Master und dem CoL-Kandidaten belegt.");
        }
        selectedIds.add(source.masterTaxonId);
        selectedKeys.add(taxonIdentityKey(target));
        // SQLite returns name rows with a null prototype; bind their JSON data,
        // not the runtime-specific row object representation.
        boundDetails.push(JSON.parse(JSON.stringify({ source, target })));
      }
      const correction = await readActiveTaxonomyCorrectionRelease(taxonomyRoot, { expectedMasterVersion: activeManifest.candidateId });
      const token = digest({ activeManifest, candidateManifest, registry, boundDetails, cases, correctionRevision: correction?.revision || "" });
      // Validate the entire prospective history while still in read-only preview.
      appendClassificationBatch({ registry, cases: eligible, batchRevision: token, sourceRevision: revisions.identitySources,
        inputRevision: revisions.identityInputs, confirmedAt: "2000-01-01T00:00:00.000Z" });
      return { registry, eligible, token, summary, candidateManifest };
    } finally { candidate?.close(); active?.close(); }
  }
  return {
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
