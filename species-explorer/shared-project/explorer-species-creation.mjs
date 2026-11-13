import { randomUUID } from "node:crypto";
import { isProxy } from "node:util/types";
import { check } from "./errors.mjs";
import { canonicalJson, digest, objectJson, transportJson } from "./security.mjs";
import { validateSpeciesRecord, sharedSpeciesCollisionKeys } from "./species-record.mjs";
import { buildNewSpeciesEntry, validateNewSpeciesValues } from "../species-model.mjs";

const WRITERS = ["admin", "publisher", "contributor"], HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const VALUES = ["german", "english", "scientificName", "size", "weight", "lifeExpectancy"];
const ENTRY = ["german", "english", "genus", "species", "size", "weight", "life_expectancy", "masterTaxonId", "taxonomyReference", "taxonomyBinding"];
const source = "shared-project", changed = "Die Person, Berechtigung oder geprüfte Anlagegrundlage wurde geändert. Bitte die neue Art erneut prüfen; vorhandene Eingaben bleiben erhalten.";
const invalid = condition => check(condition, 400, "invalid_species_creation", "Die Artanlage benötigt ausschließlich ihre vollständigen geprüften Eingaben und Referenzen.");
const scope = status => digest(transportJson([status.baseUrl, status.projectId, status.user.id]));
function copy(value) {
  let nodes = 0;
  function inspect(item, depth = 0) {
    invalid(depth <= 32 && ++nodes <= 20000);
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
    invalid(item && typeof item === "object" && !isProxy(item));
    const array = Array.isArray(item), descriptors = Object.getOwnPropertyDescriptors(item), names = Reflect.ownKeys(descriptors);
    invalid(Object.getPrototypeOf(item) === (array ? Array.prototype : Object.prototype));
    if (array) invalid(names.length === item.length + 1 && names.every(name => name === "length" || typeof name === "string" && /^(?:0|[1-9][0-9]*)$/.test(name) && Number(name) < item.length));
    for (const name of names) {
      if (array && name === "length") continue;
      invalid(typeof name === "string" && descriptors[name].enumerable && Object.hasOwn(descriptors[name], "value"));
      inspect(descriptors[name].value, depth + 1);
    }
  }
  inspect(value); return JSON.parse(canonicalJson(value));
}
function fields(value, allowed, required = []) {
  invalid(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(name => allowed.includes(name))
    && required.every(name => Object.hasOwn(value, name)));
}
function request(payload) {
  const value = copy(payload); fields(value, ["sourceScope", "values", "masterTaxonId", "taxonomyReference"], ["sourceScope", "values"]);
  invalid(HASH.test(value.sourceScope)); fields(value.values, VALUES, VALUES);
  for (const name of ["masterTaxonId", "taxonomyReference"]) if (Object.hasOwn(value, name)) invalid(typeof value[name] === "string"
    && (value[name] === "" || (name === "masterTaxonId" ? /^mtx_[a-f0-9]{32}$/ : /^(?:mtx_[a-f0-9]{32}|stx_[a-f0-9]{24}|[0-9]+)$/).test(value[name])));
  invalid(!value.masterTaxonId || !value.taxonomyReference || value.masterTaxonId === value.taxonomyReference);
  return value;
}
function authority(state) {
  const status = state?.status;
  check(status?.connection === "online" && status.readOnlySession === false && WRITERS.includes(status.user?.role)
    && state.permissions?.canRead === true && state.permissions.canEdit === true && state.permissions.canCreate === true,
  403, "forbidden", "Neue gemeinsame Arten benötigen eine volle Online-Anmeldung mit Anlegerecht. Offline bleiben vorhandene Arten bearbeitbar.");
  check(typeof status.baseUrl === "string" && status.baseUrl && ID.test(status.projectId || "") && ID.test(status.user.id || "")
    && Number.isSafeInteger(status.user.version) && status.user.version > 0,
  409, "species_creation_identity_required", "Die aktuelle Personenfassung fehlt. Bitte die Projektanmeldung aktualisieren und die Art erneut prüfen.");
  const binding = { baseUrl: status.baseUrl, projectId: status.projectId, userId: status.user.id, role: status.user.role, userVersion: status.user.version };
  const permissions = Object.fromEntries(["canRead", "canEdit", "canCreate", "canApprove"].map(name => [name, state.permissions[name] === true]));
  return { binding, sourceScope: scope(status), sha256: digest(canonicalJson({ binding, permissions, connection: status.connection, readOnlySession: false })) };
}
function preparedSource(raw, input) {
  const value = copy(raw); fields(value, ["values", "entry", "derived", "sourceHash"], ["values", "entry", "derived", "sourceHash"]);
  invalid(HASH.test(value.sourceHash)); fields(value.entry, ENTRY, ENTRY.slice(0, 7));
  fields(value.derived, ["scientificName", "slug", "safeName"], ["scientificName", "slug", "safeName"]);
  const validated = validateNewSpeciesValues(value.values); invalid(validated.errors.length === 0);
  const expected = buildNewSpeciesEntry(validated.values);
  invalid(Object.entries(expected.entry).every(([name, text]) => value.entry[name] === text)
    && canonicalJson(expected.derived) === canonicalJson(value.derived));
  const requested = validateNewSpeciesValues(input.values); invalid(requested.errors.length === 0
    && canonicalJson(buildNewSpeciesEntry(requested.values)) === canonicalJson(expected));
  for (const name of ["masterTaxonId", "taxonomyReference"]) if (input[name]) invalid(value.entry[name] === input[name]);
  const reference = input.masterTaxonId || input.taxonomyReference || "";
  if (reference) invalid(value.entry.taxonomyReference === reference && value.entry.taxonomyBinding && typeof value.entry.taxonomyBinding === "object" && !Array.isArray(value.entry.taxonomyBinding));
  else invalid(!value.entry.masterTaxonId && !value.entry.taxonomyReference && (value.entry.taxonomyBinding === undefined || value.entry.taxonomyBinding === null));
  const record = validateSpeciesRecord({ type: "fn-species-record", schemaVersion: 1, id: value.derived.slug, input: value.entry,
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: value.derived.safeName, files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } }, value.derived.slug);
  return { prepared: value, record, sha256: digest(canonicalJson(value)), recordHash: digest(objectJson(record)) };
}
function collides(objects, candidate) {
  check(Array.isArray(objects), 503, "species_creation_unavailable", "Der gemeinsame Artenbestand konnte nicht vollständig gelesen werden.");
  const target = sharedSpeciesCollisionKeys(candidate);
  for (const object of objects.filter(item => item.kind === "species")) {
    const existing = sharedSpeciesCollisionKeys({ ...object.data, id: object.id });
    check(!existing.slugs.some(slug => target.slugs.includes(slug)), 409, "object_exists", "Diese Artkennung ist im gemeinsamen Projekt bereits vorhanden. Vorhandene Arten werden nicht ersetzt.");
    check(existing.scientific !== target.scientific, 409, "species_identity_exists", "Diese wissenschaftliche Artidentität besteht im gemeinsamen Projekt bereits.");
    check(!existing.german || existing.german !== target.german, 409, "species_name_exists", "Dieser deutsche Artname besteht im gemeinsamen Projekt bereits.");
    check(!existing.asset || existing.asset !== target.asset, 409, "species_asset_exists", "Die zugehörige Artablage ist im gemeinsamen Projekt bereits gebunden.");
  }
}
function speciesView(record) {
  return { id: record.id, germanName: record.input.german, englishName: record.input.english,
    scientificName: `${record.input.genus} ${record.input.species}`, assetName: record.assets.assetName,
    manual: { size: record.input.size, weight: record.input.weight, lifeExpectancy: record.input.life_expectancy },
    taxonomySelected: Boolean(record.input.masterTaxonId || record.input.taxonomyReference) };
}
function exactObject(object, preview) {
  check(object?.kind === "species" && object.id === preview.record.id && UUID.test(object.revision || "")
    && object.data?.type === "fn-species-record" && object.data.schemaVersion === 1,
  409, "species_creation_unconfirmed", "Die vorhandene Artfassung konnte nicht eindeutig bestätigt werden. Es wird keine zweite Anlage gesendet.");
  const record = validateSpeciesRecord(object.data, preview.record.id);
  check(digest(objectJson(record)) === preview.recordHash, 409, "species_creation_unconfirmed", "Unter dieser Kennung liegt eine andere Artfassung vor. Sie bleibt erhalten; bitte den Bestand gezielt prüfen.");
  return record;
}

/** A reviewed online draft over the existing client. No local mutation, importer, media generation, sync or approval. */
export function createExplorerSpeciesCreation({ withClient, prepareLocalCreation, isSourceReady = () => true,
  clock = Date.now, tokenId = randomUUID, ttlMs = 15 * 60 * 1000 } = {}) {
  check(typeof withClient === "function" && typeof prepareLocalCreation === "function" && typeof clock === "function" && typeof tokenId === "function"
    && typeof isSourceReady === "function"
    && Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= 30 * 60 * 1000, 500, "species_creation_unavailable", "Die gemeinsame Artanlage benötigt ihre lesende lokale Quellenprüfung.");
  const previews = new Map(); let closed = false;
  function sourceReady() {
    check(isSourceReady() === true, 503, "species_creation_source_unavailable", "Die lokale Quellenprüfung für die gemeinsame Artanlage ist noch nicht eingerichtet. Es wurde nichts angelegt.");
  }
  function active() {
    check(!closed, 409, "client_closed", "Die gemeinsame Artanlage ist geschlossen. Nach Wiederöffnung bitte den tatsächlichen Bestand prüfen; es wird nichts automatisch erneut angelegt.");
    const now = clock(); check(Number.isSafeInteger(now) && now >= 0 && Number.isFinite(new Date(now + ttlMs).getTime()), 500, "invalid_clock", "Die Artvorschau konnte zeitlich nicht gebunden werden.");
    // Uncertain attempts retain their no-second-POST state until this session closes.
    for (const [token, value] of previews) if (value.expiresAt <= now && value.state === "ready") previews.delete(token);
    return now;
  }
  async function current(client, state, expected) {
    active(); const status = await client.status(); active(); const actual = authority({ ...state, status });
    check(actual.sha256 === expected.sha256, 409, "species_creation_changed", changed); return actual;
  }
  async function support(client, state, expected) {
    const value = await client.capabilities(); await current(client, state, expected);
    check(value?.speciesCreation === 1, 409, "species_creation_server_required", "Der Projektdienst benötigt zuerst die gebundene gemeinsame Artanlage. Es wurde nichts angelegt.");
    check(value.projectId === expected.binding.projectId && value.user?.id === expected.binding.userId && value.user.role === expected.binding.role,
      409, "species_creation_changed", changed);
  }
  async function prepare(input) {
    sourceReady();
    const { sourceScope: ignoredScope, ...local } = input;
    const value = await prepareLocalCreation(copy(local)); active(); sourceReady(); return preparedSource(value, input);
  }
  function confirmed(preview, object, recovered) {
    const record = exactObject(object, preview);
    return { source, sourceScope: preview.authority.sourceScope, created: !recovered, recovered, serverConfirmed: true,
      species: { ...speciesView(record), revision: object.revision, approval: object.approval ?? "draft",
        approvedRevision: object.approvedRevision ?? null, hasNewerLocalChanges: object.localPending === true || object.localConflict === true },
      approvalPerformed: false, externalPublication: "not-performed",
      message: recovered ? "Die geprüfte Artfassung ist im gemeinsamen Projekt vorhanden. Ihre Übereinstimmung wurde geprüft; daraus wird keine eigene Anlagebestätigung abgeleitet."
        : "Die Art ist als gemeinsamer Entwurf angelegt. Fachdaten, Artdateien, Freigabe und Website bleiben eigene Schritte." };
  }
  function reviewedToken(payload, state) {
    active(); const input = copy(payload); fields(input, ["token"], ["token"]); invalid(typeof input.token === "string" && ID.test(input.token));
    const preview = previews.get(input.token); check(preview, 409, "review_required", "Bitte die neue Art zuerst prüfen. Abgelaufene oder geschlossene Vorschauen senden keinen Anlageauftrag.");
    const initial = authority(state); check(initial.sha256 === preview.authority.sha256, 409, "species_creation_changed", changed);
    return { input, preview, initial };
  }
  async function recoverReviewed(client, state, { input, preview, initial }) {
    // This is a read-only decision even when the original create request never reached this adapter.
    // Seal before the first await so a later create can never restore this token's write permission.
    preview.state = "uncertain";
    await support(client, state, initial); await client.refresh(); await current(client, state, initial);
    let object;
    try { object = await client.getObject("species", preview.record.id, { serverOnly: true }); }
    catch (error) {
      if (error?.status === 404 || error?.statusCode === 404 || ["not_found", "object_not_cached"].includes(error?.code))
        check(false, 409, "species_creation_unconfirmed", "Die frühere Anlage ist im frisch gelesenen gemeinsamen Bestand nicht bestätigt. Es wurde kein zweiter Auftrag gesendet; bitte den Bestand vor einer neuen Vorschau gezielt prüfen.");
      throw error;
    }
    await current(client, state, initial);
    const result = confirmed(preview, object, true); previews.delete(input.token); return result;
  }
  return Object.freeze({
    availability: () => withClient(async (client, state) => {
      active(); sourceReady(); const initial = authority(state);
      await support(client, state, initial); await current(client, state, initial); sourceReady();
      return { available: true, source, sourceScope: initial.sourceScope };
    }),
    preview: payload => withClient(async (client, state) => {
      active(); sourceReady(); const input = request(payload), initial = authority(state);
      check(input.sourceScope === initial.sourceScope, 409, "species_creation_changed", changed);
      await support(client, state, initial); await client.refresh(); await current(client, state, initial);
      const value = await prepare(input); await current(client, state, initial);
      collides(await client.listObjects(), value.record); await current(client, state, initial);
      check(![...previews.values()].some(entry => entry.state === "uncertain" && entry.authority.sourceScope === initial.sourceScope && entry.record.id === value.record.id),
        409, "species_creation_unconfirmed", "Für diese Art ist eine frühere Anlageantwort noch offen. Bitte zuerst mit deren bestehender Vorschau den tatsächlichen Serverstand prüfen; es wird kein weiterer Anlageauftrag vorbereitet.");
      const now = active(); check(previews.size < 100, 429, "species_creation_limit", "Es sind bereits 100 Artvorschauen oder offene Anlageausgänge vorhanden. Bitte diese zuerst gezielt prüfen.");
      const token = tokenId(); invalid(typeof token === "string" && ID.test(token));
      check(!previews.has(token), 500, "species_creation_unavailable", "Die Artvorschau konnte nicht eindeutig gebunden werden.");
      sourceReady();
      previews.set(token, { ...value, input, authority: initial, expiresAt: now + ttlMs, state: "ready" });
      return { source, sourceScope: initial.sourceScope, token, expiresAt: new Date(now + ttlMs).toISOString(), species: speciesView(value.record),
        warnings: ["Die Bestätigung legt genau diese Art als Entwurf im gemeinsamen Dienst an. Sie schreibt keine lokale Artenliste und startet keine Pipeline oder Veröffentlichung.",
          "Artdateien und erzeugte Fachdaten sind noch nicht bereitgestellt. Die geprüfte manuelle Taxonomieauswahl bleibt vollständig am Entwurf erhalten.",
          "Bei einer unklaren Antwort wird nicht erneut angelegt. Offene Anlageausgänge sind nur in dieser Sitzung gebunden; nach einem Neustart zuerst den gemeinsamen Bestand prüfen."] };
    }),
    recover: payload => withClient(async (client, state) => recoverReviewed(client, state, reviewedToken(payload, state))),
    create: payload => withClient(async (client, state) => {
      const reviewed = reviewedToken(payload, state), { input, preview, initial } = reviewed;
      if (preview.state === "uncertain") return recoverReviewed(client, state, reviewed);
      await support(client, state, initial); await client.refresh(); await current(client, state, initial);
      const fresh = await prepare(preview.input); await current(client, state, initial);
      check(fresh.sha256 === preview.sha256 && fresh.recordHash === preview.recordHash, 409, "species_creation_changed", changed);
      collides(await client.listObjects(), preview.record); await current(client, state, initial);
      await support(client, state, initial);
      const last = await prepare(preview.input); await current(client, state, initial);
      check(last.sha256 === preview.sha256 && last.recordHash === preview.recordHash, 409, "species_creation_changed", changed);
      check(previews.get(input.token) === preview && active() < preview.expiresAt, 409, "review_required", "Die Artvorschau ist abgelaufen. Bitte erneut prüfen.");
      // A failed POST, including a lost response or failed pull, is never repeated by this token.
      preview.state = "uncertain";
      const object = await client.createObject({ kind: "species", id: preview.record.id, data: copy(preview.record), boundSpeciesCreation: true,
        requiredBinding: { ...initial.binding } });
      await current(client, state, initial); const result = confirmed(preview, object, false); previews.delete(input.token); return result;
    }),
    close() { closed = true; previews.clear(); },
  });
}
