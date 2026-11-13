import { performance } from "node:perf_hooks";
import { check } from "./errors.mjs";
import { canonicalJson, digest, transportJson } from "./security.mjs";
import { createSpeciesEnrichmentPreparer } from "./species-enrichment-preparer.mjs";
import { createEnrichmentFetch } from "./species-enrichment-transport.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { speciesEnrichmentSourceBindings } from "./species-enrichment.mjs";

const publicRoot = "https://felixkfm90.github.io/iucn-species-data/";
const quiet = { log() {}, warn() {}, error() {} };
const scope = status => digest(transportJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));
const stamp = ({ kind, id, revision, data }) => digest(transportJson({ kind, id, revision, data }));
const actor = status => ({ baseUrl: status.baseUrl, projectId: status.projectId, userId: status.user.id,
  role: status.user.role, userVersion: status.user.version });
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const changed = condition => check(condition, 409, "species_enrichment_changed", "Artfassung oder Projektanmeldung wurde geändert. Bitte die Art neu öffnen.");
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validChangeId = value => typeof value === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(value);
const fields = (input, keys) => check(input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === keys.length
  && keys.every(key => Object.hasOwn(input, key)), 400, "invalid_species_enrichment", "Bitte die angezeigte Art und Vorschlagsauswahl verwenden.");

function displayValue(value) {
  if (value === null) return null;
  if (["string", "number"].includes(typeof value)) return String(value);
  if (Number.isSafeInteger(value.bytes) && typeof value.mimeType === "string") return { bytes: value.bytes, mimeType: value.mimeType };
  return "Vorhanden";
}

function review(value) {
  if (!value) return null;
  const { candidateId = null, targetDataHash = null, mode, complete, issues, changes } = value;
  return { candidateId, targetDataHash, mode, complete, issues: issues.map(({ code, message, blocking }) => ({ code, message, blocking })),
    changes: changes.map(({ field, before, after }) => ({ field, before: displayValue(before), after: displayValue(after) })) };
}

/** Private, per-species desktop workflow over the existing project cache and queue. */
export function createExplorerSpeciesEnrichment({ withClient, repoRoot, normalMediaReader,
  providerOptions = () => ({ fetch: globalThis.fetch, iucnToken: process.env.IUCN_TOKEN, xenoToken: process.env.XENO_TOKEN }) } = {}) {
  const lifecycle = new AbortController();
  let activePreparation = null;
  function access(state, id, sourceScope, { online = false } = {}) {
    check(!lifecycle.signal.aborted, 409, "client_closed", "Die gemeinsame Projektverbindung wird geschlossen.");
    check(typeof id === "string" && id.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && validHash(sourceScope),
      400, "invalid_species_enrichment", "Bitte eine gemeinsame Art wählen.");
    check(state.permissions.canEdit, 403, "forbidden", "Der Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
    changed(sourceScope === scope(state.status));
    check(!online || state.status.connection === "online", 409, "online_required", "Bitte zuerst mit dem gemeinsamen Projekt verbinden.");
  }
  function modes(options) {
    const hasIucn = typeof options.iucnToken === "string" && Boolean(options.iucnToken.trim());
    const hasXeno = typeof options.xenoToken === "string" && Boolean(options.xenoToken.trim());
    return [...(hasIucn && hasXeno ? ["missing", "all"] : []), ...(hasXeno ? ["nc-sounds"] : [])];
  }
  function checkBinding(source, expected) {
    changed(same(source.sourceBindings, expected.sourceBindings) && same(source.actor, expected.actor));
  }
  async function prepare(id, input, signal) {
    fields(input, ["sourceScope", "expectedRevision", "expectedEditRevision", "mode"]);
    check(repoRoot, 503, "species_enrichment_unavailable", "Die Artvorbereitung ist auf diesem Gerät noch nicht eingerichtet.");
    check(!activePreparation, 409, "species_enrichment_busy", "Auf diesem Gerät kann jeweils eine gemeinsame Art vorbereitet werden.");
    const options = providerOptions();
    check(modes(options).includes(input.mode), 409, "species_source_access_required", "Die gewählte Aktualisierung benötigt die eingerichteten Quellenzugänge.");
    const combined = signal ? AbortSignal.any([signal, lifecycle.signal]) : lifecycle.signal;
    const running = (async () => {
      const captured = await withClient(async (client, state) => {
        access(state, id, input.sourceScope, { online: true });
        const source = await client.checkSpeciesEnrichmentSource(id);
        changed(source.object.revision === input.expectedRevision && stamp(source.object) === input.expectedEditRevision);
        return source;
      });
      const { object, sourceBindings, actor: expected } = captured;
      const { userVersion, ...requiredBinding } = expected;
      let lastRemoteCheck = performance.now();
      const checkpoint = () => withClient(async (client, state) => {
        access(state, id, input.sourceScope, { online: true });
        changed(same(actor(state.status), expected));
        const local = await client.getObject("species", id, { serverOnly: true });
        changed(same(speciesEnrichmentSourceBindings(local, expected.projectId), sourceBindings));
        if (performance.now() - lastRemoteCheck >= 1500) {
          checkBinding(await client.checkSpeciesEnrichmentSource(id), captured); lastRemoteCheck = performance.now();
        }
        return true;
      });
      const fetchOriginal = createEnrichmentFetch({ fetch: options.fetch, assertCurrent: checkpoint, signal: combined, timeoutMs: 15000 });
      const readNormalFile = async ({ slot }) => {
        try { if (normalMediaReader) return (await normalMediaReader.read(object.data, { projectId: expected.projectId, slot })).buffer; }
        catch (error) { if (error.code !== "normal_media_not_local") throw error; }
        const binding = normalMediaBinding(object.data, { projectId: expected.projectId, slot });
        const result = await withClient(async (client, state) => {
          access(state, id, input.sourceScope, { online: true }); changed(same(actor(state.status), expected));
          try { return await client.normalMedia.readLocal({ contentId: binding.contentId, requiredBinding }, { signal: combined }); }
          catch (error) { if (error.code !== "normal_media_not_local") throw error; }
          try { return await client.normalMedia.read({ speciesId: id, slot, expectedRevision: object.revision,
            expectedDataHash: sourceBindings.dataHash, requiredBinding }, { signal: combined }); }
          catch (error) { if (!["normal_media_missing", "normal_media_incomplete", "normal_media_server_required"].includes(error.code)) throw error; }
          return null;
        });
        if (result) return result.buffer;
        const file = object.data.assets.files[slot];
        const url = new URL(`species-assets/${encodeURIComponent(object.data.assets.assetName)}/${slot}`, publicRoot).href;
        check(file.url === url, 409, "species_enrichment_original_missing", "Eine gebundene Artdatei fehlt auf diesem PC und im Projektdienst.");
        const response = await fetchOriginal(url, { credentials: "omit", redirect: "error", cache: "no-store" });
        check(response.status === 200 && (!response.url || response.url === url), 409, "species_enrichment_original_missing", "Die öffentliche Originaldatei konnte nicht gelesen werden.");
        return Buffer.from(await response.arrayBuffer());
      };
      const preparer = createSpeciesEnrichmentPreparer({ logger: quiet, ...options, repoRoot, assertCurrent: async value => {
        changed(same(value, sourceBindings)); return checkpoint();
      }, readNormalFile });
      try {
        const value = await preparer.prepare({ speciesObject: object, projectId: expected.projectId, expectedSourceBindings: sourceBindings,
          mode: input.mode, signal: combined });
        check(!combined.aborted, 409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen.");
        if (!value.complete || !value.changes.length) return review(value);
        return withClient(async (client, state) => {
          access(state, id, input.sourceScope, { online: true }); changed(same(actor(state.status), expected));
          check(!combined.aborted, 409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen.");
          return review(await client.savePreparedSpeciesEnrichment(value, expected, { signal: combined }));
        });
      } finally { await preparer.close(); }
    })();
    activePreparation = running;
    try { return await running; } finally { activePreparation = null; }
  }

  return Object.freeze({
    get busy() { return activePreparation !== null; },
    status: (id, input) => withClient(async (client, state) => {
      fields(input, ["sourceScope"]); access(state, id, input.sourceScope);
      const { candidate, pending, hasPendingChanges } = await client.speciesEnrichmentStatus(id);
      return { candidate: review(candidate), pending, hasPendingChanges, modes: repoRoot ? modes(providerOptions()) : [], busy: activePreparation !== null };
    }),
    prepare,
    file: (id, { sourceScope, candidateId, slot }) => withClient(async (client, state) => {
      access(state, id, sourceScope);
      return client.readPreparedSpeciesEnrichmentFile(id, candidateId, slot);
    }),
    stage: (id, input) => withClient(async (client, state) => {
      fields(input, ["sourceScope", "candidateId", "targetDataHash"]); access(state, id, input.sourceScope, { online: true });
      check(validHash(input.candidateId) && validHash(input.targetDataHash), 400, "invalid_species_enrichment", "Bitte den gespeicherten Vorschlag zuerst prüfen.");
      const { candidate } = await client.speciesEnrichmentStatus(id);
      changed(candidate?.candidateId === input.candidateId && candidate.targetDataHash === input.targetDataHash);
      const queued = await client.stagePreparedSpeciesEnrichment(input.candidateId, input.targetDataHash);
      return { candidateId: queued.candidateId, changeId: queued.changeId, state: "queued", acceptedRevision: null };
    }),
    sync: (id, input) => withClient(async (client, state) => {
      fields(input, ["sourceScope", "changeId"]); access(state, id, input.sourceScope, { online: true });
      check(validChangeId(input.changeId), 400, "invalid_species_enrichment", "Bitte einen vorgemerkten Artvorschlag auswählen.");
      const { pending } = await client.speciesEnrichmentStatus(id);
      changed(pending?.changeId === input.changeId);
      const result = await client.sync({ kind: "species", id });
      const receipt = result.speciesEnrichmentResults?.find(value => value.changeId === input.changeId);
      check(receipt, 502, "invalid_response", "Der Abgleich dieses Artvorschlags wurde nicht eindeutig bestätigt.");
      return receipt;
    }),
    async close() { lifecycle.abort(); await Promise.allSettled(activePreparation ? [activePreparation] : []); },
  });
}
