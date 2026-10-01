import { configureTaxonomyBuildDatabase } from "./taxonomy-build-cache.mjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = 1;
const text = (value) => typeof value === "string" && value.length > 0 && value.length <= 1000;
const hashPattern = /^[a-f0-9]{64}$/;
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function canonicalBuildInput(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonicalBuildInput).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalBuildInput(value[key])}`).join(",")}}`;
  }
  throw new Error("Aufbaueingänge müssen vollständige endliche JSON-Werte sein.");
}

// Takes already normalized, duplicate-merged provider records, NOT raw API responses. Preserve
// every unknown field and array order conservatively. Only known observational
// metadata is excluded; a removal remains semantic, not a timestamp change.
export function taxonomyRecordFingerprint(record) {
  if (!record || !text(record.providerRecordId)) throw new Error("Stabile Anbieter-Datensatz-ID fehlt.");
  const { retrievedAt, payloadSha256, versionChangeState, ...semantic } = record;
  if (versionChangeState !== undefined && !["new", "unchanged", "changed", "removed", "restored"].includes(versionChangeState)) {
    throw new Error("Unbekannter Anbieter-Änderungszustand.");
  }
  return sha(canonicalBuildInput({ record: semantic, removed: versionChangeState === "removed" }));
}

function checkContract(contract) {
  if (!contract || !Number.isInteger(contract.masterSchema) || contract.masterSchema < 1 || !text(contract.normalizerVersion)
      || !text(contract.baseMasterVersion)
      || ["rulesRevision", "identitiesRevision", "correctionsRevision", "projectsRevision"].some((key) => !hashPattern.test(contract[key] || ""))) {
    throw new Error("Vollständiger Schema-, Regel-, Identitäts-, Korrektur-, Projekt- und Basisstand erforderlich.");
  }
  if (!Array.isArray(contract.sources) || !contract.sources.length) throw new Error("Verbindlicher Quellenplan fehlt.");
  const sources = contract.sources.map(checkSource);
  if (new Set(sources.map((source) => source.provider)).size !== sources.length) throw new Error("Doppelte Quelle im Aufbauvertrag.");
  sources.sort((a, b) => Buffer.compare(Buffer.from(a.provider), Buffer.from(b.provider)));
  return JSON.parse(canonicalBuildInput({ ...contract, sources }));
}

function checkSource(source) {
  const { provider, version, scopeKey, checksum, expectedCount } = source || {};
  if (![provider, version, scopeKey].every(text) || !hashPattern.test(checksum || "")
      || !Number.isSafeInteger(expectedCount) || expectedCount < 0) throw new Error("Quellenstand, abgegrenzter Umfang, Prüfsumme und erwartete Zeilenzahl fehlen.");
  return { provider, version, scopeKey, checksum, expectedCount };
}

function digestDatabase(db) {
  const hasher = crypto.createHash("sha256");
  hasher.update(db.prepare("SELECT contract_json FROM build_info WHERE id=1").get().contract_json);
  for (const source of db.prepare("SELECT * FROM build_source ORDER BY provider").iterate()) {
    hasher.update("\nS" + canonicalBuildInput({ ...source }));
  }
  for (const record of db.prepare("SELECT provider, record_id, semantic_hash FROM build_record ORDER BY provider, record_id").iterate()) {
    hasher.update("\nR" + canonicalBuildInput({ ...record }));
  }
  return hasher.digest("hex");
}

const prefixNext = (prefix, id, ordinal, hash) => sha(prefix + canonicalBuildInput({ id, ordinal, hash }));

function validateProgress(db) {
  if (db.prepare("PRAGMA foreign_key_check").get()) throw new Error("Verwaister Eingangsdatensatz.");
  const contract = checkContract(JSON.parse(db.prepare("SELECT contract_json FROM build_info WHERE id=1").get().contract_json));
  for (const source of db.prepare("SELECT * FROM build_source ORDER BY provider").all()) {
    const planned = contract.sources.find((entry) => entry.provider === source.provider);
    const actual = { provider: source.provider, version: source.version, scopeKey: source.scope_key,
      checksum: source.checksum, expectedCount: source.expected_count };
    if (!planned || canonicalBuildInput(planned) !== canonicalBuildInput(actual)) throw new Error("Gespeicherte Quelle weicht vom Aufbauvertrag ab.");
    let count = 0, prefix = sha("");
    for (const row of db.prepare("SELECT * FROM build_record WHERE provider=? ORDER BY ordinal").iterate(source.provider)) {
      if (row.ordinal !== count || !hashPattern.test(row.semantic_hash)) throw new Error("Beschädigter Eingangscheckpoint.");
      prefix = prefixNext(prefix, row.record_id, count, row.semantic_hash);
      count += 1;
    }
    if (count !== source.observed_count || count > source.expected_count || prefix !== source.prefix_hash
        || source.complete && count !== source.expected_count) throw new Error("Eingangscheckpoint ist unvollständig oder verändert.");
  }
}

// Dedicated, explicitly named candidate-side file. Exclusive creation prevents
// accidental replacement of any existing master, source, catalog or checkpoint.
// Sources must originate in verified local imports; a declared checksum here
// does NOT independently verify an upstream download or prove its completeness.
export async function createTaxonomyBuildInputs({ filename, contract }) {
  const normalized = checkContract(contract);
  const handle = await fs.open(filename, "wx");
  await handle.close();
  const db = configureTaxonomyBuildDatabase(new DatabaseSync(filename));
  try {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA user_version=${SCHEMA};
      CREATE TABLE build_info (id INTEGER PRIMARY KEY CHECK(id=1), contract_json TEXT NOT NULL, sealed_hash TEXT);
      CREATE TABLE build_source (provider TEXT PRIMARY KEY, version TEXT NOT NULL, scope_key TEXT NOT NULL,
        checksum TEXT NOT NULL, expected_count INTEGER NOT NULL, observed_count INTEGER NOT NULL DEFAULT 0,
        complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)), prefix_hash TEXT NOT NULL DEFAULT '${sha("")}') WITHOUT ROWID;
      CREATE TABLE build_record (provider TEXT NOT NULL REFERENCES build_source(provider), record_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL, semantic_hash TEXT NOT NULL, PRIMARY KEY(provider,record_id),
        UNIQUE(provider,ordinal)) WITHOUT ROWID;`);
    db.prepare("INSERT INTO build_info VALUES(1, ?, NULL)").run(canonicalBuildInput(normalized));
  } catch (error) { db.close(); throw error; }
  return inputWriter(db);
}

export async function resumeTaxonomyBuildInputs({ filename, contract }) {
  const normalized = checkContract(contract);
  const handle = await fs.open(filename, "r+"); // never create an absent checkpoint
  await handle.close();
  const db = configureTaxonomyBuildDatabase(new DatabaseSync(filename));
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;");
    if (db.prepare("PRAGMA user_version").get().user_version !== SCHEMA) throw new Error("Unbekanntes Eingangsformat.");
    const info = db.prepare("SELECT * FROM build_info WHERE id=1").get();
    if (info?.sealed_hash || info?.contract_json !== canonicalBuildInput(normalized)) throw new Error("Checkpoint passt nicht zum aktuellen Aufbauvertrag oder ist bereits versiegelt.");
    validateProgress(db);
    return inputWriter(db);
  } catch (error) { db.close(); throw error; }
}

function inputWriter(db) {
  const contract = checkContract(JSON.parse(db.prepare("SELECT contract_json FROM build_info WHERE id=1").get().contract_json));
  function writable() {
    if (db.prepare("SELECT sealed_hash FROM build_info WHERE id=1").get().sealed_hash) throw new Error("Der Eingangsstand ist bereits versiegelt.");
  }
  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try { writable(); const result = action(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  return {
    close: () => db.close(),
    addSource(value) {
      const source = checkSource(value);
      const { provider, version, scopeKey, checksum, expectedCount } = source;
      const planned = contract.sources.find((entry) => entry.provider === provider);
      if (!planned || canonicalBuildInput(planned) !== canonicalBuildInput(source)) throw new Error("Quelle weicht vom verbindlichen Aufbauvertrag ab.");
      transaction(() => db.prepare("INSERT INTO build_source(provider,version,scope_key,checksum,expected_count) VALUES(?,?,?,?,?)")
        .run(provider, version, scopeKey, checksum, expectedCount));
    },
    append(provider, startIndex, records) {
      if (!Number.isSafeInteger(startIndex) || startIndex < 0 || !Array.isArray(records) || !records.length || records.length > 1000) {
        throw new Error("Ein Eingangsblock benötigt einen gültigen Startindex und 1 bis 1.000 Datensätze.");
      }
      const entries = Array.from(records, (record) => {
        const hash = taxonomyRecordFingerprint(record);
        return { id: record.providerRecordId, hash };
      });
      return transaction(() => {
        const source = db.prepare("SELECT * FROM build_source WHERE provider=?").get(provider);
        if (!source || source.complete || startIndex > source.observed_count || startIndex + entries.length > source.expected_count) {
          throw new Error("Eingangsblock passt nicht zum offenen Quellenfortschritt.");
        }
        const existing = db.prepare("SELECT record_id, semantic_hash FROM build_record WHERE provider=? AND ordinal=?");
        const insert = db.prepare("INSERT INTO build_record VALUES(?,?,?,?)");
        let prefix = source.prefix_hash;
        entries.forEach((entry, index) => {
          const ordinal = startIndex + index;
          if (ordinal < source.observed_count) {
            const old = existing.get(provider, ordinal);
            if (!old || old.record_id !== entry.id || old.semantic_hash !== entry.hash) throw new Error("Wiederholter Eingangsblock wurde verändert.");
          } else {
            insert.run(provider, entry.id, ordinal, entry.hash);
            prefix = prefixNext(prefix, entry.id, ordinal, entry.hash);
          }
        });
        const count = Math.max(source.observed_count, startIndex + entries.length);
        db.prepare("UPDATE build_source SET observed_count=?, prefix_hash=? WHERE provider=?").run(count, prefix, provider);
        return count;
      });
    },
    completeSource(provider) {
      transaction(() => {
        const source = db.prepare("SELECT * FROM build_source WHERE provider=?").get(provider);
        if (!source || source.expected_count !== source.observed_count) throw new Error("Die Quelle ist nicht vollständig gelesen. Fehlende Zeilen sind kein Löschauftrag.");
        db.prepare("UPDATE build_source SET complete=1 WHERE provider=?").run(provider);
      });
    },
    seal() {
      return transaction(() => {
        if (db.prepare("SELECT count(*) AS n FROM build_source").get().n !== contract.sources.length
            || db.prepare("SELECT 1 FROM build_source WHERE complete<>1 LIMIT 1").get()) {
          throw new Error("Nur ein vollständig gelesener Eingangsstand darf versiegelt werden.");
        }
        validateProgress(db);
        const fingerprint = digestDatabase(db);
        db.prepare("UPDATE build_info SET sealed_hash=? WHERE id=1").run(fingerprint);
        return fingerprint;
      });
    },
  };
}

export function openTaxonomyBuildInputs(filename) {
  const db = configureTaxonomyBuildDatabase(new DatabaseSync(filename, { readOnly: true }));
  try {
    if (db.prepare("PRAGMA user_version").get().user_version !== SCHEMA) throw new Error("Unbekanntes Eingangsformat; Vollaufbau erforderlich.");
    const info = db.prepare("SELECT * FROM build_info WHERE id=1").get();
    if (!info?.sealed_hash || db.prepare("SELECT 1 FROM build_source WHERE complete<>1 OR observed_count<>expected_count LIMIT 1").get()) {
      throw new Error("Unvollständiger Eingangsstand; kein Änderungsvergleich erlaubt.");
    }
    if (digestDatabase(db) !== info.sealed_hash) throw new Error("Die Prüfsumme des Eingangsstands stimmt nicht.");
    validateProgress(db);
    return { contract: checkContract(JSON.parse(info.contract_json)), fingerprint: info.sealed_hash,
      sources: db.prepare("SELECT * FROM build_source ORDER BY provider").all().map((row) => ({ ...row })),
      records: () => db.prepare("SELECT provider, record_id, semantic_hash FROM build_record ORDER BY provider, record_id").iterate(),
      close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}

// Streams changes through a callback instead of accumulating millions of IDs.
// This is an input comparison, NOT permission to delete a taxon or activate data.
export function compareTaxonomyBuildInputs(before, after, onChange = () => {}) {
  const incompatible = ["masterSchema", "normalizerVersion", "rulesRevision", "identitiesRevision", "correctionsRevision", "projectsRevision"]
    .filter((key) => before.contract[key] !== after.contract[key]);
  if (incompatible.length) return { mode: "full-build-required", reasons: incompatible, changesEmitted: 0 };
  const nextSources = new Map(after.sources.map((source) => [source.provider, source]));
  for (const old of before.sources) {
    const next = nextSources.get(old.provider);
    if (!next || next.scope_key !== old.scope_key) return { mode: "blocked", reasons: ["source-missing-or-scope-changed"], changesEmitted: 0 };
  }
  const provenanceChanges = after.sources.filter((source) => {
    const old = before.sources.find((entry) => entry.provider === source.provider);
    return !old || old.version !== source.version || old.checksum !== source.checksum;
  }).map((source) => source.provider);
  const oldIterator = before.records(), nextIterator = after.records();
  let old = oldIterator.next(), next = nextIterator.next();
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  // Most rows retain the exact same source and ID. Equality needs no allocation;
  // differing strings still use SQLite's UTF-8 order, never JavaScript's UTF-16.
  const keyCompare = (a, b) => (a.provider === b.provider ? 0 : Buffer.compare(Buffer.from(a.provider), Buffer.from(b.provider)))
    || (a.record_id === b.record_id ? 0 : Buffer.compare(Buffer.from(a.record_id), Buffer.from(b.record_id)));
  try {
    while (!old.done || !next.done) {
      const order = old.done ? 1 : next.done ? -1 : keyCompare(old.value, next.value);
      const kind = order < 0 ? "removed" : order > 0 ? "added"
        : old.value.semantic_hash === next.value.semantic_hash ? "unchanged" : "changed";
      counts[kind] += 1;
      if (kind !== "unchanged") onChange({ kind, provider: (order < 0 ? old.value : next.value).provider,
        recordId: (order < 0 ? old.value : next.value).record_id });
      if (order <= 0) old = oldIterator.next();
      if (order >= 0) next = nextIterator.next();
    }
  } finally { oldIterator.return?.(); nextIterator.return?.(); }
  return { mode: "input-delta", counts, provenanceChanges, beforeFingerprint: before.fingerprint,
    afterFingerprint: after.fingerprint, changesEmitted: counts.added + counts.changed + counts.removed };
}
