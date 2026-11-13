import { randomUUID } from "node:crypto";
import { check } from "./errors.mjs";
import { digest, objectJson, transportJson } from "./security.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, applySpeciesManualEdit } from "./species-record.mjs";

const fields = [
  ["german", "germanName", "Deutscher Name"], ["english", "englishName", "Englischer Name"],
  ["size", "size", "Größe"], ["weight", "weight", "Gewicht"], ["life_expectancy", "lifeExpectancy", "Lebenserwartung"],
];
const stamp = (object) => digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data }));
const scope = (status) => digest(transportJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));

function view(object, state) {
  const record = validateSpeciesRecord(object.data, object.id), input = record.input;
  return { id: object.id, source: "shared-project", sourceScope: scope(state.status), editRevision: stamp(object),
    germanName: input.german, englishName: input.english, scientificName: `${input.genus} ${input.species}`,
    manual: { size: input.size, weight: input.weight, lifeExpectancy: input.life_expectancy },
    assetName: record.assets.assetName, revision: object.revision, ordinal: object.ordinal,
    localPending: Boolean(object.localPending), localConflict: Boolean(object.localConflict),
    canEdit: state.permissions.canEdit === true, externalPublication: "not-performed" };
}

/** Normal basic-data editing over the existing serialized personal project client; no local JSON writes. */
export function createExplorerSpeciesEditor({ withClient, clock = Date.now, tokenId = randomUUID, ttlMs = 15 * 60 * 1000 } = {}) {
  check(typeof withClient === "function", 500, "species_editor_unavailable", "Der gemeinsame Arteditor ist nicht eingerichtet.");
  const previews = new Map(); let closed = false;
  function active() {
    check(!closed, 409, "client_closed", "Die gemeinsame Projektverbindung ist geschlossen.");
    for (const [token, preview] of previews) if (preview.expiresAt <= clock()) previews.delete(token);
  }
  function access(state, edit = false) {
    check(state.permissions.canRead === true && (!edit || state.permissions.canEdit === true), 403, "forbidden", "Die aktuelle Projektanmeldung erlaubt diese Artbearbeitung nicht.");
  }
  async function current(client, id) {
    const object = await client.getObject("species", id);
    check(object.data?.type === SPECIES_RECORD_TYPE, 409, "species_record_required", "Diese Art besitzt noch keinen vollständigen gemeinsamen Arbeitsdatensatz. Vorhandene Inhalte bleiben erhalten.");
    validateSpeciesRecord(object.data, id);
    return object;
  }
  return Object.freeze({
    list: () => withClient(async (client, state) => {
      active(); access(state);
      const objects = (await client.listObjects()).filter((object) => object.kind === "species");
      return { source: "shared-project", sourceScope: scope(state.status), connection: state.status.connection,
        species: objects.filter((object) => object.data?.type === SPECIES_RECORD_TYPE).map((object) => view(object, state)),
        legacySpecies: objects.filter((object) => object.data?.type !== SPECIES_RECORD_TYPE).map((object) => ({ id: object.id, commonName: object.data.commonName || "" })),
        externalPublication: "not-performed" };
    }),
    get: (id) => withClient(async (client, state) => { active(); access(state); return view(await current(client, id), state); }),
    preview: (id, input) => withClient(async (client, state) => {
      active(); access(state, true);
      const object = await current(client, id);
      check(input?.sourceScope === scope(state.status) && input?.expectedEditRevision === stamp(object), 409, "local_object_changed", "Die angezeigte Art oder Projektanmeldung wurde inzwischen geändert. Bitte neu laden; deine Eingaben bleiben erhalten.");
      const proposed = applySpeciesManualEdit(object.data, input.values);
      check(proposed.input.german === object.data.input.german && proposed.input.genus === object.data.input.genus
        && proposed.input.species === object.data.input.species, 409, "species_identity_adapter_required",
      "Namensänderungen mit gekoppelten Asset- oder Websitepfaden benötigen noch den gemeinsamen Umbenennungsweg. Es wurde nichts geändert.");
      const changes = fields.filter(([key]) => proposed.input[key] !== object.data.input[key])
        .map(([key, uiKey, label]) => ({ key: uiKey, field: label, before: object.data.input[key], after: proposed.input[key] }));
      check(changes.length > 0, 400, "no_changes", "Es wurden keine Änderungen vorgenommen.");
      check(previews.size < 100, 429, "too_many_previews", "Bitte offene Artvorschauen zuerst abschließen oder später neu laden.");
      const token = tokenId(), expiresAt = clock() + ttlMs;
      const localReview = { revision: object.revision, dataHash: digest(objectJson(object.data)),
        pending: Boolean(object.localPending), conflict: Boolean(object.localConflict) };
      previews.set(token, { id, sourceScope: scope(state.status), editRevision: stamp(object), localReview, proposed, expiresAt });
      return { token, expiresAt: new Date(expiresAt).toISOString(), source: "shared-project", changes,
        species: view(object, state), warnings: ["Beim Speichern wird die Änderung in derselben persönlichen Offlinewarteschlange vorgemerkt. Abgleich und interne Freigabe bleiben eigene Schritte."] };
    }),
    save: (id, input) => withClient(async (client, state) => {
      active(); access(state, true);
      const preview = previews.get(input?.token);
      check(preview && preview.id === id, 409, "review_required", "Die Artvorschau ist ungültig oder abgelaufen. Bitte neu prüfen.");
      check(preview.sourceScope === scope(state.status), 409, "project_changed", "Die Projektanmeldung wurde geändert. Die frühere Vorschau wird nicht für ein anderes Projekt oder eine andere Person verwendet.");
      const object = await current(client, id);
      check(preview.editRevision === stamp(object), 409, "local_object_changed", "Die Art wurde seit der Vorschau geändert. Beide Eingaben bleiben erhalten; bitte neu vergleichen.");
      const saved = await client.editExistingObject("species", id, preview.proposed, { expectedLocalReview: preview.localReview });
      previews.delete(input.token);
      return { source: "shared-project", queued: true, species: view(saved, state), externalPublication: "not-performed" };
    }),
    close() { closed = true; previews.clear(); },
  });
}
