import { isProxy } from "node:util/types";
import { createHash, randomUUID } from "node:crypto";
import { check } from "./errors.mjs";
import { canonicalJson, digest, objectJson } from "./security.mjs";
import { projectSpeciesEnrichment, inspectSpeciesEnrichmentResult, validateSpeciesEnrichmentChange, ENRICHMENT_DATA_RETAINED } from "./species-enrichment.mjs";
import { assertSharedMediaBudget, sharedMediaLimits } from "./shared-media-budget.mjs";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { validateAudioDecode } from "../../scripts/audio-validation.mjs";

export const CLIENT_ENRICHMENT_SCHEMA = `
  CREATE TABLE enrichment_candidates(
    binding_id TEXT NOT NULL REFERENCES bindings(id), candidate_id TEXT NOT NULL, payload_json TEXT NOT NULL,
    PRIMARY KEY(binding_id,candidate_id)
  );
  CREATE TABLE enrichment_files(
    binding_id TEXT NOT NULL, candidate_id TEXT NOT NULL, slot TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(binding_id,candidate_id,slot),
    FOREIGN KEY(binding_id,candidate_id) REFERENCES enrichment_candidates(binding_id,candidate_id) ON DELETE CASCADE
  );
`;

const MODES = ["all", "missing", "manual-maps", "nc-sounds"];
const ROLES = ["admin", "publisher", "contributor"];
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SECRET_KEY = /^(?:password|passwordhash|credential|credentials|sessiontoken|refreshtoken|accesstoken|bearertoken|token|secret|apikey|privatekey)$/i;
const LIMITS = { maxBytes: 5 * 1024 * 1024, maxNodes: 300000 };
const json = value => canonicalJson(value, LIMITS);
const invalid = value => check(value, 409, "species_enrichment_candidate_changed", "Der gespeicherte Artvorschlag oder eine seiner Dateien ist nicht mehr eindeutig gebunden.");
const quota = value => check(value, 413, "species_enrichment_quota", "Die persönliche Medienreserve ist ausgeschöpft. Vorhandene Vorschläge und Dateien bleiben erhalten.");

function exact(value, keys) {
  invalid(value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  const own = Object.getOwnPropertyDescriptors(value);
  invalid(Reflect.ownKeys(own).length === keys.length && keys.every(key => own[key]?.enumerable && Object.hasOwn(own[key], "value")));
}

const ownerBinding = owner => ({ baseUrl: owner.baseUrl, projectId: owner.projectId, userId: owner.userId });
const actorBinding = owner => ({ ...ownerBinding(owner), role: owner.user.role, userVersion: owner.user.version ?? null });
const hasSecretKey = value => value && typeof value === "object" && Object.entries(value)
  .some(([key, entry]) => SECRET_KEY.test(key.replace(/[_-]/gu, "")) || hasSecretKey(entry));

function validatePayload(payload, owner) {
  exact(payload, ["schemaVersion", "actor", "sourceBindings", "mode", "result", "dataRetained"]);
  exact(payload.actor, ["baseUrl", "projectId", "userId", "role", "userVersion"]);
  const { sourceBindings, actor } = payload;
  exact(sourceBindings, ["projectId", "speciesId", "objectRevision", "dataHash"]);
  invalid(payload.schemaVersion === 1 && MODES.includes(payload.mode) && typeof payload.dataRetained === "boolean" && actor.baseUrl === owner.baseUrl
    && actor.projectId === owner.projectId && actor.userId === owner.userId && ROLES.includes(actor.role)
    && (actor.userVersion === null || Number.isSafeInteger(actor.userVersion) && actor.userVersion > 0)
    && sourceBindings.projectId === owner.projectId && typeof sourceBindings.speciesId === "string"
    && sourceBindings.speciesId.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceBindings.speciesId)
    && typeof sourceBindings.objectRevision === "string" && UUID.test(sourceBindings.objectRevision)
    && typeof sourceBindings.dataHash === "string" && HASH.test(sourceBindings.dataHash));
  const { result, credits } = inspectSpeciesEnrichmentResult(payload.result);
  invalid(!hasSecretKey(result.generated) && !hasSecretKey(credits));
  return { ...payload, result };
}

function fileBytes(expected, bytes) {
  invalid(Buffer.isBuffer(bytes) && !isProxy(bytes) && bytes.length === expected.bytes && digest(bytes) === expected.sha256);
  return bytes;
}

function preparedFiles(files, media) {
  invalid(Array.isArray(media) && !isProxy(media) && media.length === Object.keys(files).length);
  const result = new Map();
  for (const item of media) {
    exact(item, ["slot", "metadata", "buffer"]);
    const expected = Object.hasOwn(files, item.slot) && files[item.slot];
    exact(item.metadata, ["sha256", "bytes", "mimeType"]);
    invalid(expected && !result.has(item.slot) && json(item.metadata) === json(expected));
    result.set(item.slot, Buffer.from(fileBytes(expected, item.buffer)));
  }
  return result;
}

function readCandidate(db, owner, id, { readBytes = true, onlySlot } = {}) {
  invalid(typeof id === "string" && HASH.test(id));
  const row = db.prepare(`SELECT CASE WHEN typeof(payload_json)='text' AND length(CAST(payload_json AS BLOB))<=5242880
    THEN payload_json END AS value FROM enrichment_candidates WHERE binding_id=? AND candidate_id=?`).get(owner.id, id);
  if (!row) return null;
  invalid(row.value && digest(row.value) === id);
  const payload = validatePayload(JSON.parse(row.value), owner);
  invalid(json(payload) === row.value);
  const rows = db.prepare(`SELECT slot,sha256,bytes,mime_type,length(data) AS actual,typeof(data) AS kind
    FROM enrichment_files WHERE binding_id=? AND candidate_id=? ORDER BY slot`).all(owner.id, id);
  invalid(rows.length === Object.keys(payload.result.files).length);
  const media = rows.map(file => {
    const expected = Object.hasOwn(payload.result.files, file.slot) && payload.result.files[file.slot];
    invalid(expected && file.sha256 === expected.sha256 && file.bytes === expected.bytes && file.mime_type === expected.mimeType
      && file.actual === expected.bytes && file.kind === "blob");
    if (!readBytes || onlySlot && file.slot !== onlySlot) return { slot: file.slot, metadata: expected };
    const blob = db.prepare(`SELECT data FROM enrichment_files WHERE binding_id=? AND candidate_id=? AND slot=?
      AND sha256=? AND bytes=? AND length(data)=? AND typeof(data)='blob'`).get(owner.id, id, file.slot, expected.sha256, expected.bytes, expected.bytes);
    invalid(blob);
    return { slot: file.slot, metadata: expected, buffer: fileBytes(expected, Buffer.from(blob.data)) };
  });
  return { id, payload, media };
}

/** The wire request has no cache locator. Backup and sync resolve it against the same sealed candidate. */
export function readQueuedSpeciesEnrichment(db, owner, row, { readBytes = false } = {}) {
  const sealed = JSON.parse(row.request_json);
  exact(sealed, ["candidateId", "change"]);
  const { change } = validateSpeciesEnrichmentChange(sealed.change);
  const stored = readCandidate(db, owner, sealed.candidateId, { readBytes });
  const data = JSON.parse(row.data_json);
  invalid(stored && row.binding_id === owner.id && !row.depends_on && row.conflict_id === null && row.state !== "conflict"
    && (row.result_revision === null ? row.state !== "applied" : UUID.test(row.result_revision)
      && row.result_revision !== change.baseRevision && ["uncertain", "applied"].includes(row.state))
    && change.changeId === row.change_id && change.kind === row.kind && change.id === row.object_id && change.baseRevision === row.base_revision
    && data?.type === "fn-species-record" && data.id === change.id && digest(objectJson(data)) === change.enrichment.targetDataHash);
  const { baseUrl, ...actor } = stored.payload.actor;
  invalid(json(actor) === json(change.enrichment.actor) && json(stored.payload.sourceBindings) === json(change.enrichment.sourceBindings)
    && json(stored.payload.result) === json(change.enrichment.result));
  return { candidateId: stored.id, change, data, media: stored.media };
}

export function createClientEnrichmentStore({ db, tx, currentOwner, currentSource, ensureSchema, enqueue, limits = {} }) {
  const allowed = sharedMediaLimits(limits);
  const budget = () => assertSharedMediaBudget(db, { limits: allowed, quotaCode: "species_enrichment_quota", invalidCode: "species_enrichment_candidate_changed" });
  function owner(id) {
    const bound = currentOwner();
    check(bound && bound.id === id && ROLES.includes(bound.user.role), 403, "forbidden", "Der persönliche Artvorschlag benötigt eine aktive Bearbeitungsberechtigung.");
    return bound;
  }
  function project(bound, payload) {
    invalid(json(payload.actor) === json(actorBinding(bound)));
    const speciesObject = currentSource(bound.id, payload.sourceBindings.speciesId);
    const projection = projectSpeciesEnrichment({ speciesObject, projectId: bound.projectId,
      result: payload.result, expectedSourceBindings: payload.sourceBindings });
    invalid(projection.complete && projection.changes.length > 0);
    if (payload.dataRetained) projection.issues.push({ ...ENRICHMENT_DATA_RETAINED });
    return projection;
  }
  return Object.freeze({
    save(id, prepared, expectedActor, profileRemainingBytes = allowed.profileBytes) {
      check(prepared?.proposedOnly === true && prepared?.complete === true && prepared.persistentCandidate === false,
        409, "species_enrichment_incomplete", "Nur ein vollständiger geprüfter Artvorschlag kann gespeichert werden.");
      invalid(Number.isSafeInteger(profileRemainingBytes) && profileRemainingBytes >= 0 && profileRemainingBytes <= allowed.profileBytes);
      const bound = owner(id), actor = actorBinding(bound);
      exact(expectedActor, ["baseUrl", "projectId", "userId", "role", "userVersion"]);
      invalid(json(expectedActor) === json(actor));
      const payload = validatePayload({ schemaVersion: 1, actor,
        sourceBindings: prepared.sourceBindings, mode: prepared.mode, result: prepared.sourceResult,
        dataRetained: prepared.run?.fetched === true && prepared.run?.usedExistingData === true }, bound);
      const media = preparedFiles(payload.result.files, prepared.media), serialized = json(payload), candidateId = digest(serialized);
      const expectedData = json(prepared.data);
      return tx(() => {
        const active = owner(id), projection = project(active, payload);
        invalid(json(projection.data) === expectedData);
        ensureSchema();
        const used = budget(), stored = readCandidate(db, active, candidateId);
        if (!stored) {
          const bytes = [...media.values()].reduce((total, item) => total + item.length, 0);
          const reservation = bytes + Buffer.byteLength(serialized) + allowed.metadataReserve;
          quota(used.mediaBytes + bytes <= allowed.blobBytes
            && used.cacheBytes + reservation <= allowed.cacheBytes && reservation <= profileRemainingBytes);
          db.prepare("INSERT INTO enrichment_candidates VALUES (?,?,?)").run(id, candidateId, serialized);
          for (const [slot, buffer] of media) {
            const file = payload.result.files[slot];
            db.prepare("INSERT INTO enrichment_files VALUES (?,?,?,?,?,?,?)").run(id, candidateId, slot, file.sha256, file.bytes, file.mimeType, buffer);
          }
          quota(budget().cacheBytes <= allowed.cacheBytes);
        }
        return { candidateId, mode: payload.mode, ...projection, targetDataHash: digest(objectJson(projection.data)), persistentCandidate: true };
      });
    },
    read(id, candidateId, { includeMedia = true, latestSpecies, expectedSpecies, onlySlot } = {}) {
      return tx(() => {
        const bound = owner(id);
        budget();
        const hasSchema = db.prepare("PRAGMA user_version").get().user_version === 5;
        if (latestSpecies) {
          if (!hasSchema) return null;
          const source = currentSource(id, latestSpecies), actor = actorBinding(bound);
          if (source.localPending || source.localConflict) return null;
          candidateId = db.prepare(`SELECT candidate_id FROM enrichment_candidates WHERE binding_id=?
            AND json_extract(payload_json,'$.sourceBindings.speciesId')=? AND json_extract(payload_json,'$.sourceBindings.objectRevision')=?
            AND json_extract(payload_json,'$.actor.role')=? AND json_extract(payload_json,'$.actor.userVersion') IS ? ORDER BY rowid DESC LIMIT 1`)
            .get(id, latestSpecies, source.revision, actor.role, actor.userVersion)?.candidate_id;
          if (!candidateId) return null;
        }
        const stored = hasSchema ? readCandidate(db, bound, candidateId, { readBytes: false }) : null;
        check(stored, 404, "species_enrichment_candidate_missing", "Der persönliche Artvorschlag ist nicht vorhanden.");
        check(!expectedSpecies || stored.payload.sourceBindings.speciesId === expectedSpecies, 404, "species_enrichment_candidate_missing", "Der Artvorschlag gehört zu einer anderen Art.");
        const projection = project(bound, stored.payload);
        return { candidateId, mode: stored.payload.mode, ...projection, targetDataHash: digest(objectJson(projection.data)), persistentCandidate: true,
          ...(includeMedia ? { media: readCandidate(db, bound, candidateId, { onlySlot }).media } : {}) };
      });
    },
    stage(id, candidateId, expectedTargetDataHash, expectedSource) {
      return tx(() => {
        const bound = owner(id);
        budget();
        const stored = db.prepare("PRAGMA user_version").get().user_version === 5 ? readCandidate(db, bound, candidateId) : null;
        check(stored, 404, "species_enrichment_candidate_missing", "Der persönliche Artvorschlag ist nicht vorhanden.");
        const { sourceBindings, result } = stored.payload;
        if (expectedSource !== undefined) invalid(json(expectedSource) === json(sourceBindings));
        const { data } = project(bound, stored.payload);
        const targetDataHash = digest(objectJson(data));
        check(expectedTargetDataHash === targetDataHash, 409, "species_enrichment_review_changed", "Der gespeicherte Vorschlag stimmt nicht mehr mit der geprüften Zielfassung überein.");
        const { baseUrl, ...actor } = stored.payload.actor;
        const { change } = validateSpeciesEnrichmentChange({ changeId: randomUUID(), kind: "species", id: sourceBindings.speciesId,
          baseRevision: sourceBindings.objectRevision, enrichment: { schemaVersion: 1, actor, sourceBindings, result, targetDataHash } });
        const queued = enqueue(bound, { candidateId, change }, data);
        quota(budget().cacheBytes <= allowed.cacheBytes);
        return queued;
      });
    },
  });
}

/** Read-only backup validation, including old inactive bindings and stale proposals. */
export async function inspectClientEnrichmentStore(db, { progress, signal }) {
  const summary = assertSharedMediaBudget(db);
  const rows = db.prepare(`SELECT c.binding_id,c.candidate_id,b.base_url,b.project_id,b.user_id
    FROM enrichment_candidates c JOIN bindings b ON b.id=c.binding_id ORDER BY c.binding_id,c.candidate_id`).iterate();
  const hash = createHash("sha256");
  let count = 0, files = 0, bytes = 0;
  for (const row of rows) {
    progress();
    const id = digest(`${row.base_url}\n${row.project_id}\n${row.user_id}`);
    invalid(row.binding_id === id);
    const stored = readCandidate(db, { id, baseUrl: row.base_url, projectId: row.project_id, userId: row.user_id }, row.candidate_id);
    hash.update(id).update(stored.id);
    count++; files += stored.media.length;
    for (const file of stored.media) {
      progress();
      if (file.slot === "sound.mp3") await validateAudioDecode(file.buffer, { signal });
      else if (file.slot !== "credits.json") await validateImageDecode(file.buffer, { format: file.slot === "map.jpg" ? "jpeg" : "webp" });
      bytes += file.buffer.length;
    }
  }
  invalid(count === db.prepare("SELECT count(*) AS n FROM enrichment_candidates").get().n
    && files === db.prepare("SELECT count(*) AS n FROM enrichment_files").get().n && bytes === summary.enrichmentBytes);
  return { enrichmentCandidateCount: count, enrichmentFileCount: files, localEnrichmentBytes: bytes, enrichmentCandidatesSha256: hash.digest("hex") };
}
