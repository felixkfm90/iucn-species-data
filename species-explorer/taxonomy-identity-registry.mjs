import crypto from "node:crypto";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { normalizeIdentityProjectAssignments, checkIdentityProjectAssignments } from "./taxonomy-identity-projects.mjs";

const text = (value) => typeof value === "string" ? value.normalize("NFKC").trim() : "";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const TYPES = new Set(["continuation", "split", "merge"]);
const MAX_EVENTS = 10000;

export function taxonIdentityKey(value) {
  return [normalizeTaxonomySearchTerm(text(value?.scientificName)), text(value?.rank).toLowerCase(),
    normalizeTaxonomySearchTerm(text(value?.kingdom))].join("|");
}

function identity(value) {
  const result = { scientificName: text(value?.scientificName), rank: text(value?.rank).toLowerCase(), kingdom: text(value?.kingdom) };
  if (!result.scientificName || result.rank !== "species" || !result.kingdom) {
    throw new Error("Identitätsentscheidungen benötigen wissenschaftlichen Namen, Rang Art und ein eindeutiges Reich.");
  }
  return result;
}

function snapshot(value) {
  const result = { ...identity(value), masterTaxonId: text(value?.masterTaxonId) };
  if (!/^mtx_[a-f0-9]{32}$/.test(result.masterTaxonId)) throw new Error("Die Masteridentität ist ungültig.");
  return result;
}

export function emptyIdentityRegistry() {
  return { schemaVersion: 1, events: [] };
}

// An append-only event history travels with the immutable candidate. It is not
// an editable global redirect table and cannot silently redirect existing photos.
export function validateIdentityRegistry(value = emptyIdentityRegistry()) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.events) || value.events.length > MAX_EVENTS) {
    throw new Error("Das Identitätsregister ist ungültig oder überschreitet die unterstützte Größe.");
  }
  const eventIds = new Set();
  const current = new Map();
  const retired = new Set();
  const occupied = new Map();
  const projectState = new Map();
  const historyHash = crypto.createHash("sha256").update('{"schemaVersion":1,"events":[');
  for (const event of value.events) {
    if (event?.registryRevision !== historyHash.copy().update("]}").digest("hex")) {
      throw new Error("Die Identitätsentscheidung gehört nicht zur vorherigen Registerhistorie.");
    }
    if (!TYPES.has(event?.type) || !/^[a-f0-9]{64}$/.test(event?.eventId || "") || eventIds.has(event.eventId)
        || !text(event.reason) || !text(event.baseVersion) || !text(event.sourceRevision) || !text(event.inputRevision)
        || !Number.isFinite(Date.parse(event.confirmedAt)) || !Array.isArray(event.evidence) || !event.evidence.length
        || !Array.isArray(event.sources) || !Array.isArray(event.targets)) {
      throw new Error("Die Identitätsentscheidung ist unvollständig oder doppelt.");
    }
    const sources = event.sources.map(snapshot);
    const targets = event.targets.map(snapshot);
    checkIdentityProjectAssignments(event, projectState, taxonIdentityKey);
    const cardinality = event.type === "continuation" ? sources.length === 1 && targets.length === 1
      : event.type === "split" ? sources.length === 1 && targets.length >= 2
        : sources.length >= 2 && targets.length === 1;
    if (!cardinality || sources.length > 100 || targets.length > 100
        || new Set(sources.map((entry) => entry.masterTaxonId)).size !== sources.length
        || new Set(targets.map(taxonIdentityKey)).size !== targets.length
        || new Set(targets.map((entry) => entry.masterTaxonId)).size !== targets.length) {
      throw new Error("Die Anzahl oder Eindeutigkeit der Vorgänger und Nachfolger passt nicht zum Entscheidungstyp.");
    }
    for (const source of sources) {
      const known = current.get(source.masterTaxonId);
      if (retired.has(source.masterTaxonId) || (known && taxonIdentityKey(known) !== taxonIdentityKey(source))
          || (occupied.has(taxonIdentityKey(source)) && occupied.get(taxonIdentityKey(source)) !== source.masterTaxonId)) {
        throw new Error("Eine historische oder inzwischen geänderte Identität kann nicht erneut als Vorgänger verwendet werden.");
      }
      current.delete(source.masterTaxonId);
      if (occupied.get(taxonIdentityKey(source)) === source.masterTaxonId) occupied.delete(taxonIdentityKey(source));
      if (event.type !== "continuation") retired.add(source.masterTaxonId);
    }
    for (const target of targets) {
      if (target.kingdom !== sources[0].kingdom || sources.some((source) => source.kingdom !== target.kingdom)) {
        throw new Error("Eine Identitätsentscheidung darf keine verschiedenen Reiche gleichsetzen.");
      }
      if (event.type === "continuation" && target.masterTaxonId !== sources[0].masterTaxonId) {
        throw new Error("Eine Identitätsfortführung muss die bisherige Master-ID erhalten.");
      }
      if (retired.has(target.masterTaxonId) || current.has(target.masterTaxonId)
          || (occupied.has(taxonIdentityKey(target)) && occupied.get(taxonIdentityKey(target)) !== target.masterTaxonId)) {
        throw new Error("Die Zielidentität ist bereits belegt oder würde eine historische ID wiederverwenden.");
      }
      current.set(target.masterTaxonId, target);
      occupied.set(taxonIdentityKey(target), target.masterTaxonId);
    }
    for (const evidence of event.evidence) {
      if (!text(evidence?.provider) || !text(evidence?.providerVersion) || !text(evidence?.providerRecordId)) {
        throw new Error("Für die Entscheidung fehlen Anbieter, Quellenstand oder Datensatzkennung.");
      }
    }
    const { eventId, ...body } = event;
    if (digest(body) !== eventId) throw new Error("Die Prüfsumme der Identitätsentscheidung stimmt nicht.");
    if (eventIds.size) historyHash.update(",");
    historyHash.update(JSON.stringify(event));
    eventIds.add(eventId);
  }
  return structuredClone(value);
}

export function identityRegistryRevision(registry = emptyIdentityRegistry()) {
  return digest(validateIdentityRegistry(registry));
}

export function identityRegistryState(registry = emptyIdentityRegistry()) {
  const validated = validateIdentityRegistry(registry);
  const current = new Map();
  const historical = new Map();
  const aliases = new Map();
  const projectAssignments = new Map();
  for (const event of validated.events) {
    checkIdentityProjectAssignments(event, projectAssignments, taxonIdentityKey);
    for (const source of event.sources) {
      current.delete(source.masterTaxonId);
      if (event.type === "continuation") {
        const names = aliases.get(source.masterTaxonId) || [];
        names.push(source);
        aliases.set(source.masterTaxonId, names);
      } else {
        historical.set(source.masterTaxonId, { ...source, eventId: event.eventId, type: event.type,
          successorIds: event.targets.map((target) => target.masterTaxonId) });
      }
    }
    for (const target of event.targets) current.set(target.masterTaxonId, target);
  }
  return { current, historical, aliases, projectAssignments };
}

function previewBody({ registry, sources, targets, type, reason, evidence, baseVersion, sourceRevision, inputRevision, projectAssignments }) {
  if (!TYPES.has(type)) throw new Error("Bitte Identitätsfortführung, Aufteilung oder Zusammenführung wählen.");
  if (!Array.isArray(sources) || !Array.isArray(targets) || !Array.isArray(evidence)) throw new Error("Die Identitätsvorschau ist unvollständig.");
  const body = { type, sources: sources.map(snapshot).sort((a, b) => a.masterTaxonId.localeCompare(b.masterTaxonId)),
    targets: targets.map(identity).sort((a, b) => taxonIdentityKey(a).localeCompare(taxonIdentityKey(b))),
    reason: text(reason), evidence: evidence.map((entry) => ({ provider: text(entry?.provider),
      providerVersion: text(entry?.providerVersion), providerRecordId: text(entry?.providerRecordId) }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    baseVersion: text(baseVersion), sourceRevision: text(sourceRevision), inputRevision: text(inputRevision),
    registryRevision: identityRegistryRevision(registry) };
  const assignments = normalizeIdentityProjectAssignments(projectAssignments);
  if (assignments.length) body.projectAssignments = assignments;
  if (!body.reason || body.reason.length > 2000 || !body.baseVersion || !body.sourceRevision || !body.inputRevision) {
    throw new Error("Begründung und geprüfte Datenstände sind für die Identitätsentscheidung erforderlich.");
  }
  return body;
}

export function previewIdentityDecision(input) {
  const body = previewBody(input);
  const token = digest(body);
  const targets = body.targets.map((target) => ({ ...target, masterTaxonId: body.type === "continuation"
    ? body.sources[0]?.masterTaxonId : `mtx_${digest([token, taxonIdentityKey(target)]).slice(0, 32)}` }));
  // Validate the prospective graph without persisting a decision or modifying a database.
  const eventBody = { ...body, targets, confirmedAt: "2000-01-01T00:00:00.000Z" };
  validateIdentityRegistry({ schemaVersion: 1, events: [...(input.registry?.events || []), { ...eventBody, eventId: digest(eventBody) }] });
  return { ...body, targets, token, requiresConfirmation: true, changesPhotos: false,
    selectionRequired: body.type === "split" };
}

export function confirmIdentityDecision(input, { token, confirmed = false, now = () => new Date() } = {}) {
  const preview = previewIdentityDecision(input);
  if (!confirmed) throw new Error("Die Identitätsentscheidung muss ausdrücklich bestätigt werden.");
  if (!token || token !== preview.token) throw new Error("Die Identitätsvorschau ist veraltet. Bitte erneut prüfen.");
  const { requiresConfirmation, changesPhotos, selectionRequired, token: previewToken, ...body } = preview;
  const eventBody = { ...body, confirmedAt: now().toISOString() };
  const registry = validateIdentityRegistry({ schemaVersion: 1,
    events: [...(input.registry?.events || []), { ...eventBody, eventId: digest(eventBody) }] });
  return { registry, event: registry.events.at(-1), revision: identityRegistryRevision(registry) };
}

export function readIdentityRegistry(database, schema = "main") {
  if (!["main", "master"].includes(schema)) throw new Error("Ungültiger Datenbankbereich für das Identitätsregister.");
  const exists = database.prepare(`SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = 'master_identity_registry'`).get();
  if (!exists) return emptyIdentityRegistry();
  const row = database.prepare(`SELECT document_json FROM ${schema}.master_identity_registry WHERE singleton = 1`).get();
  if (!row) throw new Error("Das Identitätsregister der Datenbank fehlt.");
  return validateIdentityRegistry(JSON.parse(row.document_json));
}

export function writeIdentityRegistry(database, registry) {
  const validated = validateIdentityRegistry(registry);
  database.prepare("INSERT OR REPLACE INTO master_identity_registry (singleton, document_json) VALUES (1, ?)")
    .run(JSON.stringify(validated));
}
