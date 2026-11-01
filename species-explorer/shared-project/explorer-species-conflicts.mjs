import { createHash, randomUUID } from "node:crypto";
import { check } from "./errors.mjs";
import { canonicalJson, digest, objectJson } from "./security.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, guardSpeciesRecordTransition } from "./species-record.mjs";

const editable = [["english", "englishName", "Englischer Name", 160], ["size", "size", "Größe", 240],
  ["weight", "weight", "Gewicht", 240], ["life_expectancy", "lifeExpectancy", "Lebenserwartung", 240]];
const locked = [["german", "germanName", "Deutscher Name"], ["genus", "genus", "Gattung"], ["species", "species", "Art-Epitheton"]];
const jsonClone = (value) => JSON.parse(canonicalJson(value));
const scope = (status) => digest(canonicalJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));
const presence = (input, key) => Object.hasOwn(input, key) ? { present: true, value: input[key] } : { present: false };
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
const full = (conflict) => conflict?.kind === "species" && Array.isArray(conflict.localVersions)
  && [conflict.base, conflict.current, conflict.proposed, ...conflict.localVersions.map((version) => version?.data)]
    .every((record) => record?.type === SPECIES_RECORD_TYPE);

function fingerprint(conflict, server, state) {
  const hash = createHash("sha256");
  function add(key, value) {
    const json = canonicalJson(value);
    hash.update(`${key.length}:${key}:${Buffer.byteLength(json)}:`).update(json);
  }
  const metadata = (value, excluded) => Object.fromEntries(Object.entries(value).filter(([key, entry]) => !excluded.includes(key) && entry !== undefined));
  add("authority", { scope: scope(state.status), role: state.status.user?.role ?? null,
    readOnly: state.status.readOnlySession === true, canRead: state.permissions.canRead === true, canEdit: state.permissions.canEdit === true });
  add("conflict", metadata(conflict, ["base", "current", "proposed", "localVersions"]));
  for (const key of ["base", "current", "proposed"]) add(key, conflict[key]);
  for (const version of conflict.localVersions) {
    add("local-metadata", metadata(version, ["data"])); add("local-record", version.data);
  }
  add("server-metadata", metadata(server, ["data"])); add("server-record", server.data);
  return hash.digest("hex");
}

function fieldView([key, uiKey, label], conflict, server) {
  const current = presence(server.data.input, key), versions = conflict.localVersions.map((version) => ({ changeId: version.changeId,
    state: version.state, ...presence(version.data.input, key) }));
  return { key: uiKey, label, server: current, base: presence(conflict.base.input, key), historicalCurrent: presence(conflict.current.input, key),
    proposed: presence(conflict.proposed.input, key), localVersions: versions,
    requiresChoice: versions.some(({ present, value }) => !equal(current, present ? { present, value } : { present })) };
}

function reviewView(conflict, server, state) {
  const lockedFields = locked.map((field) => fieldView(field, conflict, server)).filter((field) => field.requiresChoice)
    .map((field) => ({ ...field, readonly: true }));
  const warnings = ["Nur die vier angezeigten Grunddatenfelder können übernommen werden. Originalquellen, Bilder und Fachtexte bleiben in der Serverfassung erhalten."];
  if (lockedFields.length) warnings.push("Abweichende deutsche oder wissenschaftliche Namen benötigen den gekoppelten Umbenennungsweg. Diese lokalen Namensänderungen werden hier nicht übernommen; die ursprünglichen Entwürfe bleiben erhalten.");
  if (conflict.localVersions.length > 1) warnings.push("Alle erhaltenen lokalen Fassungen werden angezeigt. Keine davon wird automatisch ausgewählt.");
  if (conflict.resolvedAt) warnings.push("Der ursprüngliche Konflikt wurde bereits auf einem anderen Gerät entschieden. Die erhaltenen lokalen Fassungen benötigen weiterhin deine ausdrückliche Entscheidung.");
  return { id: conflict.id, objectId: conflict.objectId, germanName: server.data.input.german,
    scientificName: `${server.data.input.genus} ${server.data.input.species}`, source: "shared-project", sourceScope: scope(state.status),
    reviewRevision: fingerprint(conflict, server, state), serverRevision: server.revision, connection: state.status.connection,
    canResolve: state.permissions.canEdit === true && state.status.connection === "online",
    localVersions: conflict.localVersions.map(({ changeId, state: versionState }) => ({ changeId, state: versionState })),
    fields: editable.map((field) => fieldView(field, conflict, server)), lockedFields, warnings, externalPublication: "not-performed" };
}

/** Curated decisions over full records in the existing personal client queue. Construction and review reads never use the network. */
export function createExplorerSpeciesConflicts({ withClient, clock = Date.now, tokenId = randomUUID, ttlMs = 15 * 60 * 1000 } = {}) {
  check(typeof withClient === "function", 500, "species_conflicts_unavailable", "Die gemeinsame Art-Konfliktprüfung ist nicht eingerichtet.");
  const previews = new Map(); let closed = false;
  function active() {
    check(!closed, 409, "client_closed", "Die gemeinsame Projektverbindung ist geschlossen.");
    for (const [token, preview] of previews) if (preview.expiresAt <= clock()) previews.delete(token);
  }
  function access(state, online = false) {
    check(state.permissions.canRead === true && state.permissions.canEdit === true
      && ["admin", "publisher", "contributor"].includes(state.status.user?.role) && state.status.readOnlySession !== true,
    403, "forbidden", "Die aktuelle Projektanmeldung erlaubt diese Konfliktentscheidung nicht.");
    check(!online || state.status.connection === "online", 409, "online_required", "Bitte vor der Konfliktentscheidung mit dem gemeinsamen Projekt verbinden. Alle Fassungen bleiben erhalten.");
  }
  async function current(client, id) {
    const conflicts = await client.listConflicts(), conflict = conflicts.find((entry) => entry.id === id);
    check(conflict, 404, "conflict_not_found", "Dieser Artkonflikt ist nicht mehr offen. Bitte die Ansicht neu laden.");
    check(full(conflict), 409, "species_record_required", "Dieser Konflikt benötigt vollständige gemeinsame Artdatensätze. Vorhandene Fassungen bleiben erhalten.");
    check(Array.isArray(conflict.localVersions) && conflict.localVersions.length > 0
      && conflict.localVersions.every((version) => typeof version.changeId === "string" && version.changeId.length > 0
        && version.changeId.length <= 160 && ["queued", "uncertain", "conflict"].includes(version.state))
      && new Set(conflict.localVersions.map((version) => version.changeId)).size === conflict.localVersions.length,
    409, "invalid_species_conflict", "Die erhaltenen lokalen Artfassungen sind nicht eindeutig zugeordnet. Es wurde nichts geändert.");
    const normalized = { ...conflict };
    for (const key of ["base", "current", "proposed"]) normalized[key] = validateSpeciesRecord(conflict[key], conflict.objectId);
    normalized.localVersions = conflict.localVersions.map((version) => ({ ...version, data: validateSpeciesRecord(version.data, conflict.objectId) }));
    const object = await client.getObject("species", conflict.objectId, { serverOnly: true });
    check(object.kind === "species" && object.id === conflict.objectId && typeof object.revision === "string"
      && object.data?.type === SPECIES_RECORD_TYPE, 409, "species_record_required", "Die aktuelle Serverfassung ist kein vollständig gebundener Artdatensatz.");
    return { conflict: normalized, server: { ...object, data: validateSpeciesRecord(object.data, conflict.objectId) } };
  }
  function targetFor(conflict, server, review, input) {
    check(input && typeof input === "object" && !Array.isArray(input) && input.choices
      && typeof input.choices === "object" && !Array.isArray(input.choices), 400, "decision_required", "Bitte die abweichenden Grunddaten ausdrücklich auswählen.");
    const choices = jsonClone(input.choices), allowed = editable.map(([, key]) => key), target = validateSpeciesRecord(server.data, server.id);
    check(Object.keys(choices).every((key) => allowed.includes(key)), 400, "invalid_choice", "Hier sind nur die vier angezeigten Grunddatenfelder wählbar. Namensänderungen benötigen den gekoppelten Umbenennungsweg.");
    for (const [key, uiKey, , max] of editable) {
      const choice = choices[uiKey], field = review.fields.find((entry) => entry.key === uiKey);
      check(choice || !field.requiresChoice, 400, "decision_required", "Bitte für jedes abweichende Grunddatenfeld ausdrücklich eine Fassung auswählen.");
      if (!choice) continue;
      check(choice && typeof choice === "object" && !Array.isArray(choice) && ["server", "local", "custom"].includes(choice.kind)
        && Object.keys(choice).sort().join(",") === ({ server: "kind", local: "changeId,kind", custom: "kind,value" })[choice.kind],
      400, "invalid_choice", "Eine Feldentscheidung ist ungültig. Bitte erneut auswählen.");
      if (choice.kind === "server") continue;
      let selected;
      if (choice.kind === "local") {
        const version = conflict.localVersions.find((entry) => entry.changeId === choice.changeId);
        check(version, 409, "local_version_changed", "Die ausgewählte lokale Fassung ist nicht mehr vorhanden. Bitte neu vergleichen.");
        selected = presence(version.data.input, key);
      } else {
        check(typeof choice.value === "string", 400, "invalid_choice", "Eigene Artwerte müssen als Text eingegeben werden.");
        selected = { present: true, value: choice.value.trim() };
        check(selected.value.length > 0 && selected.value.length <= max && !/[\x00-\x1f\x7f]/.test(selected.value),
          400, "invalid_species_field", "Ein eigener Grunddatenwert muss ein nichtleerer Text innerhalb der Feldgrenze sein.");
      }
      if (equal(selected, presence(server.data.input, key))) continue;
      check(selected.present || !Object.hasOwn(server.data.input, key), 409, "species_field_removal", "Ein vorhandenes Grunddatenfeld darf nicht entfernt werden. Bitte den Serverwert beibehalten oder einen eigenen Text eingeben.");
      if (!selected.present) continue;
      if (choice.kind === "local" && typeof selected.value === "number") selected.value = String(selected.value);
      check(typeof selected.value === "string" && selected.value === selected.value.trim() && selected.value.length > 0
        && selected.value.length <= max && !/[\x00-\x1f\x7f]/.test(selected.value), 400, "invalid_species_field",
      "Ein geänderter Grunddatenwert muss ein nichtleerer Text innerhalb der Feldgrenze sein. Bei alten Zahlenwerten bitte einen eigenen Text eingeben.");
      target.input[key] = selected.value;
    }
    guardSpeciesRecordTransition({ objectId: server.id, before: server.data, next: target });
    return target;
  }
  return Object.freeze({
    list: () => withClient(async (client, state) => {
      active(); access(state); const conflicts = [], all = await client.listConflicts();
      for (const entry of all.filter((value) => full(value))) {
        const { conflict, server } = await current(client, entry.id), review = reviewView(conflict, server, state);
        conflicts.push({ id: review.id, objectId: review.objectId, germanName: review.germanName, scientificName: review.scientificName,
          localVersionCount: review.localVersions.length, canResolve: review.canResolve });
      }
      active();
      return { source: "shared-project", sourceScope: scope(state.status), connection: state.status.connection, conflicts,
        legacyCount: all.filter((entry) => entry.kind === "species" && !full(entry)).length, externalPublication: "not-performed" };
    }),
    get: (id) => withClient(async (client, state) => {
      active(); access(state); const { conflict, server } = await current(client, id); active(); return reviewView(conflict, server, state);
    }),
    preview: (id, rawInput) => {
      const input = jsonClone(rawInput);
      return withClient(async (client, state) => {
        active(); access(state, true); const { conflict, server } = await current(client, id), review = reviewView(conflict, server, state);
        check(input.sourceScope === review.sourceScope && input.expectedReviewRevision === review.reviewRevision,
          409, "conflict_review_changed", "Artfassungen oder Projektanmeldung wurden geändert. Bitte neu vergleichen; alle Entwürfe bleiben erhalten.");
        const target = targetFor(conflict, server, review, input), changes = editable.flatMap(([key, uiKey, label]) => {
          const before = presence(server.data.input, key), after = presence(target.input, key);
          return equal(before, after) ? [] : [{ key: uiKey, field: label, before, after }];
        });
        active(); check(previews.size < 100, 429, "too_many_previews", "Bitte offene Konfliktvorschauen zuerst abschließen oder später neu laden.");
        const token = tokenId(), expiresAt = clock() + ttlMs;
        previews.set(token, { id, reviewRevision: review.reviewRevision, sourceScope: review.sourceScope, expiresAt, target });
        return { token, expiresAt: new Date(expiresAt).toISOString(), source: "shared-project", changes, review,
          warnings: review.warnings, externalPublication: "not-performed" };
      });
    },
    resolve: (id, input) => {
      const token = input?.token;
      return withClient(async (client, state) => {
        active(); const preview = previews.get(token);
        check(preview && preview.id === id, 409, "review_required", "Die Konfliktvorschau ist ungültig, bereits verwendet oder abgelaufen. Bitte neu vergleichen.");
        previews.delete(token);
        access(state, true);
        check(preview.sourceScope === scope(state.status), 409, "conflict_review_changed",
          "Die Projektanmeldung wurde seit der Vorschau geändert. Bitte neu vergleichen; alle Entwürfe bleiben erhalten.");
        const { conflict, server } = await current(client, id);
        check(preview.reviewRevision === fingerprint(conflict, server, state),
          409, "conflict_review_changed", "Artfassungen oder Projektanmeldung wurden seit der Vorschau geändert. Bitte neu vergleichen; alle Entwürfe bleiben erhalten.");
        active();
        const result = await client.resolveConflict(id, { strategy: "merged", data: jsonClone(preview.target), expectedRevision: server.revision,
          expectedLocalVersions: conflict.localVersions.map(({ changeId, state: versionState, data }) => ({ changeId, state: versionState, sha256: digest(objectJson(data)) })),
          requiredBinding: { baseUrl: state.status.baseUrl, projectId: state.status.projectId, userId: state.status.user.id, role: state.status.user.role } });
        return { resolved: true, queued: Boolean(result.localPending), serverConfirmed: !result.localPending && !result.localConflict,
          source: "shared-project", objectId: conflict.objectId, externalPublication: "not-performed" };
      });
    },
    close() { closed = true; previews.clear(); },
  });
}
