import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, loadNodeSqlite } from "./taxonomy-storage.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath, taxonomyMasterRoot } from "./taxonomy-master-storage.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { readActiveTaxonomyCorrectionRelease } from "./taxonomy-correction-release.mjs";
import { browseIdentityCases, identityTaxonDetails as details } from "./taxonomy-identity-cases.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { createClassificationReviewService } from "./taxonomy-classification-service.mjs";
import { readIdentityRegistry, validateIdentityRegistry, identityRegistryRevision, emptyIdentityRegistry, taxonIdentityKey,
  previewIdentityDecision, confirmIdentityDecision } from "./taxonomy-identity-registry.mjs";

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reviewPath = (root) => path.join(taxonomyMasterRoot(root), "identity-review.json");

export async function readIdentityReview(taxonomyRoot) {
  let document;
  try { document = JSON.parse(await fs.readFile(reviewPath(taxonomyRoot), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (document?.schemaVersion !== 1 || !document.registry) throw new Error("Die vorgemerkten Identitätsentscheidungen sind nicht lesbar.");
  validateIdentityRegistry(document.registry);
  if (document.revision !== identityRegistryRevision(document.registry)) {
    throw new Error("Die Prüfsumme der vorgemerkten Identitätsentscheidungen stimmt nicht.");
  }
  return document;
}

export async function identityReviewStatus(taxonomyRoot, lifecycle = {}) {
  const review = await readIdentityReview(taxonomyRoot);
  const revision = review?.revision || "";
  return {
    pending: Boolean(review) && (lifecycle.active?.inputRevisions?.identities || identityRegistryRevision(emptyIdentityRegistry())) !== revision,
    revision,
    candidateIncludesCurrent: Boolean(review) && lifecycle.candidate?.inputRevisions?.identities === revision,
  };
}

function ids(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100
      || value.some((id) => typeof id !== "string" || !/^mtx_[a-f0-9]{32}$/.test(id))
      || new Set(value).size !== value.length) throw new Error("Bitte eindeutige Vorgänger und Nachfolger auswählen (höchstens 100). ");
  return [...value].sort();
}

// Only reads selected IDs from active/staging databases. Saving records a pending
// review, never activates a candidate, rebuilds a database, or writes to Lightroom.
export function createIdentityReviewService({ taxonomyRoot, now = () => new Date(), readInputRevision }) {
  async function discardPreview() {
    const review = await readIdentityReview(taxonomyRoot);
    const manifest = JSON.parse(await fs.readFile(taxonomyMasterManifestPath(taxonomyRoot), "utf8"));
    const { DatabaseSync } = await loadNodeSqlite();
    const active = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot), { readOnly: true });
    try {
      const registry = readIdentityRegistry(active);
      const revision = identityRegistryRevision(registry);
      if (!review || review.revision === revision) throw new Error("Es gibt keine offenen Vormerkungen zurückzunehmen. Aktive Entscheidungen werden hier nicht geändert.");
      const activeIds = new Set(registry.events.map((event) => event.eventId));
      const count = review.registry.events.filter((event) => !activeIds.has(event.eventId)).length;
      return { token: digest({ review, manifest, revision }), registry, revision, count,
        message: "Nur offene Vormerkungen werden verworfen. Aktiver Master, Suchpaket und Fotos bleiben unverändert. Ein bereits gebauter Kandidat muss danach erneut erstellt werden." };
    } finally { active.close(); }
  }
  async function inspect(payload) {
    const sources = ids(payload?.sourceIds);
    const targets = ids(payload?.targetIds);
    const { DatabaseSync } = await loadNodeSqlite();
    const [activeManifest, candidateManifest, pending] = await Promise.all([
      fs.readFile(taxonomyMasterManifestPath(taxonomyRoot, "active"), "utf8").then(JSON.parse),
      fs.readFile(taxonomyMasterManifestPath(taxonomyRoot, "staging"), "utf8").then(JSON.parse),
      readIdentityReview(taxonomyRoot),
    ]);
    if (!candidateManifest.inputRevisions?.identitySources || !candidateManifest.inputRevisions?.identityInputs) {
      throw new Error("Der Kandidat enthält noch keine prüfbaren Identitätsgrundlagen. Bitte einen neuen Kandidaten erstellen.");
    }
    if (readInputRevision && await readInputRevision() !== candidateManifest.inputRevisions.identityInputs) {
      throw new Error("Projektwerte oder Namenskorrekturen wurden seit dem Kandidatenaufbau verändert. Bitte erneut prüfen.");
    }
    let active;
    let candidate;
    try {
      active = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot), { readOnly: true });
      candidate = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "staging"), { readOnly: true });
      const currentRegistry = readIdentityRegistry(active);
      const registry = pending?.registry || currentRegistry;
      if (JSON.stringify(registry.events.slice(0, currentRegistry.events.length)) !== JSON.stringify(currentRegistry.events)) {
        throw new Error("Die vorgemerkte Entscheidung gehört nicht mehr zur aktiven Identitätshistorie.");
      }
      const correctionRelease = await readActiveTaxonomyCorrectionRelease(taxonomyRoot, { expectedMasterVersion: activeManifest.candidateId });
      const sourceDetails = sources.map((id) => {
        const value = details(active, id);
        const correction = correctionRelease?.entries.find((entry) => entry.masterTaxonId === id);
        return { ...value, germanName: correction?.germanName || value.germanName,
          englishName: correction?.englishName || value.englishName };
      });
      const targetDetails = targets.map((id) => details(candidate, id));
      const requestedAssignments = payload.projectAssignments || [];
      if (!Array.isArray(requestedAssignments) || requestedAssignments.length > 1000) throw new Error("Ungültige Projekt-Nachfolgerauswahl.");
      const projectAssignments = requestedAssignments.map((entry) => {
        const owner = sourceDetails.find((source) => source.projects.some((project) => project.projectTaxonKey === entry.projectTaxonKey));
        const project = owner?.projects.find((project) => project.projectTaxonKey === entry.projectTaxonKey);
        const target = targetDetails.find((target) => target.masterTaxonId === entry.targetId);
        if (!project || !target) throw new Error("Die Projekt-Nachfolgerauswahl enthält eine fremde Projektart oder ein nicht ausgewähltes Ziel.");
        return { ...project, sourceMasterTaxonId: owner.masterTaxonId, targetKey: taxonIdentityKey(target), namePolicy: entry.namePolicy };
      });
      for (const target of targetDetails) {
        const occupied = active.prepare(`SELECT master_taxon_id FROM master_taxon WHERE canonical_name_normalized = ?
          AND rank = ? AND kingdom = ? AND lifecycle_state != 'deprecated'`)
          .all(normalizeTaxonomySearchTerm(target.scientificName), target.rank, target.kingdom);
        if (occupied.some((row) => !sources.includes(row.master_taxon_id))) {
          throw new Error("Eine Zielart ist bereits eine andere bestehende Identität. Sie muss ausdrücklich als Vorgänger einbezogen werden; eine bloße Namensähnlichkeit genügt nicht.");
        }
        if (target.lifecycleState !== "active" || !target.evidence.length) {
          throw new Error("Ein möglicher Nachfolger ist nicht aktiv oder ohne aktuellen Quellenbeleg. Bitte später erneut prüfen.");
        }
      }
      const input = { registry, sources: sourceDetails, targets: targetDetails, type: payload.type, reason: payload.reason, projectAssignments,
        baseVersion: activeManifest.candidateId, sourceRevision: candidateManifest.inputRevisions.identitySources,
        inputRevision: candidateManifest.inputRevisions.identityInputs,
        evidence: [...sourceDetails, ...targetDetails].flatMap((taxon) => taxon.evidence) };
      const preview = previewIdentityDecision(input);
      const token = digest({ preview, activeManifest, candidateManifest, sourceDetails, targetDetails,
        correctionRevision: correctionRelease?.revision || "" });
      return { input, preview, token, sourceDetails, targetDetails, candidateId: candidateManifest.candidateId };
    } finally { candidate?.close(); active?.close(); }
  }
  return {
    ...createClassificationReviewService({ taxonomyRoot, now, readInputRevision,
      readReview: () => readIdentityReview(taxonomyRoot), writeReview: (document) => atomicWriteJson(reviewPath(taxonomyRoot), document) }),
    async browse(payload) {
      const result = await browseIdentityCases(taxonomyRoot, payload);
      if (payload?.mode === "search") return result;
      const review = await readIdentityReview(taxonomyRoot);
      const manifest = await fs.readFile(taxonomyMasterManifestPath(taxonomyRoot), "utf8").then(JSON.parse)
        .catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      const status = await identityReviewStatus(taxonomyRoot, { active: manifest });
      return { ...result, review: status.pending ? { revision: review.revision,
        events: review.registry.events.slice(-100), truncated: review.registry.events.length > 100 } : null };
    },
    async discardPreview() {
      const { registry, revision, ...preview } = await discardPreview();
      return preview;
    },
    async discard(payload) {
      return withTaxonomyCorrectionLock(taxonomyRoot, async () => {
        const preview = await discardPreview();
        if (payload?.confirmed !== true || payload.token !== preview.token) throw new Error("Die Rücknahme benötigt eine aktuelle Vorschau und ausdrückliche Bestätigung.");
        await atomicWriteJson(reviewPath(taxonomyRoot), { schemaVersion: 1, registry: preview.registry,
          revision: preview.revision, savedAt: now().toISOString(), candidateId: null });
        return { discarded: true, changesPhotos: false, message: preview.message };
      });
    },
    async preview(payload) {
      const value = await inspect(payload);
      return { ...value.preview, token: value.token, sources: value.sourceDetails, targetDetails: value.targetDetails,
        projectEffects: value.input.projectAssignments.map((assignment) => {
          const target = value.targetDetails.find((entry) => taxonIdentityKey(entry) === assignment.targetKey);
          return { projectTaxonKey: assignment.projectTaxonKey, projectSlug: assignment.projectSlug,
            targetScientificName: target.scientificName, targetGermanName: target.germanName };
        }),
        message: "Diese Entscheidung betrifft die Datenbankidentität. Fotos werden dadurch nicht geändert." };
    },
    async save(payload) {
      return withTaxonomyCorrectionLock(taxonomyRoot, async () => {
        const value = await inspect(payload);
        if (payload.type !== "continuation"
            && value.input.projectAssignments.length !== value.sourceDetails.reduce((count, taxon) => count + taxon.projects.length, 0)) {
          throw new Error("Für jede betroffene Projektart muss die Projekt-Nachfolgerzuordnung ausdrücklich gewählt und das Beibehalten der Projekttexte bestätigt werden.");
        }
        if (payload.token !== value.token) throw new Error("Die Vorschau wurde durch einen anderen Datenstand ersetzt. Bitte erneut prüfen.");
        const saved = confirmIdentityDecision(value.input, { token: value.preview.token, confirmed: payload.confirmed, now });
        await atomicWriteJson(reviewPath(taxonomyRoot), { schemaVersion: 1, registry: saved.registry,
          candidateId: value.candidateId, savedAt: now().toISOString(), revision: identityRegistryRevision(saved.registry) });
        return { saved: true, pending: true, changesPhotos: false, revision: saved.revision,
          message: "Identitätsentscheidung vorgemerkt. Sie wird erst mit einem erneut geprüften Kandidaten aktiv; Fotos bleiben unverändert." };
      });
    },
  };
}
