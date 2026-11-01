import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { buildCatalog } from "./catalog.mjs";
import { canonicalJson, objectJson } from "./security.mjs";
import { validateSpeciesRecord, sharedSpeciesScientificIdentity as scientificIdentity } from "./species-record.mjs";
import { validateWorkingImportEvidence } from "../species-content/working-import-source.mjs";
import { assertImportItemIntegrity } from "./initial-import-integrity.mjs";
import { check, ProjectError } from "./errors.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const dataHash = (data) => sha(canonicalJson(data));
const live = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };

const publicKind = "public-catalog", workingKind = "working-records";
const columns = { plans: ["id", "project_id", "base_url", "source_hash", "release_readers", "state", "created_at", "last_error"],
  items: ["plan_id", "id", "name", "target_json", "target_hash", "state", "expected_revision", "expected_approval", "intent_actor"],
  receipts: ["sequence", "plan_id", "object_id", "operation", "phase", "revision", "actor_id", "created_at"],
  lease: ["id", "owner", "pid"], source_bindings: ["plan_id", "kind", "version", "evidence_json"] };
function checkSchema(db, version) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
  const expected = version === 0 ? [] : Object.keys(columns).filter((key) => version === 2 || key !== "source_bindings").sort();
  check(JSON.stringify(tables) === JSON.stringify(expected)
    && !db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('view','trigger') OR type='index' AND sql IS NOT NULL").get(),
  409, "unsupported_schema", "Das vorhandene Importjournal besitzt eine unbekannte Struktur und bleibt erhalten.");
  const nullable = { plans: ["id", "last_error"], items: ["expected_revision", "expected_approval", "intent_actor"],
    receipts: ["sequence", "object_id", "revision", "actor_id"], lease: ["id"], source_bindings: ["plan_id"] };
  for (const table of tables) {
    const actual = db.prepare(`PRAGMA table_xinfo(${table})`).all();
    check(JSON.stringify(actual.map((row) => row.name)) === JSON.stringify(columns[table]) && actual.every((row) => {
      const integer = ["release_readers", "pid", "version", "sequence"].includes(row.name) || table === "lease" && row.name === "id";
      const pk = table === "items" ? row.name === "plan_id" ? 1 : row.name === "id" ? 2 : 0
        : table === "receipts" ? Number(row.name === "sequence") : Number(row.name === (table === "source_bindings" ? "plan_id" : "id"));
      return row.type === (integer ? "INTEGER" : "TEXT") && row.pk === pk && row.notnull === Number(!nullable[table].includes(row.name))
        && row.dflt_value === null && row.hidden === 0;
    }), 409, "unsupported_schema", "Das vorhandene Importjournal besitzt unbekannte Spalten und bleibt erhalten.");
    const refs = db.prepare(`PRAGMA foreign_key_list(${table})`).all(), reference = ["items", "receipts", "source_bindings"].includes(table);
    check(refs.length === Number(reference) && refs.every((row) => row.table === "plans" && row.from === "plan_id" && row.to === "id"
      && row.on_update === "NO ACTION" && row.on_delete === "NO ACTION" && row.match === "NONE"), 409, "unsupported_schema", "Die Journalbezüge sind unbekannt.");
  }
  check(db.prepare("PRAGMA quick_check").all().every((row) => row.quick_check === "ok") && db.prepare("PRAGMA foreign_key_check").all().length === 0,
    409, "unsupported_schema", "Das vorhandene Importjournal ist nicht konsistent und bleibt erhalten.");
}
/** Explicit source-bound import. No automatic execution, source discovery or external publication. */
export function createInitialProjectImport({ service, filename, localStorageConfirmed = false, readCatalog,
  expectedSha256, expectedSpeciesCount, sourceAdapter = null, clock = Date.now } = {}) {
  const workingSource = sourceAdapter !== null, sourceKind = workingSource ? workingKind : publicKind;
  check(service && ["refresh", "create", "approve"].every((key) => typeof service[key] === "function")
    && (workingSource ? sourceAdapter.kind === workingKind && sourceAdapter.version === 1 && typeof sourceAdapter.read === "function" && typeof sourceAdapter.verifySpecies === "function"
      : typeof readCatalog === "function" && /^[a-f0-9]{64}$/.test(expectedSha256)), 400, "invalid_import_config", "Der Erstbestand benötigt eine ausdrücklich gebundene Quelle und Dienstfassade.");
  expectedSpeciesCount ??= workingSource ? null : 63;
  check(expectedSpeciesCount === null || Number.isSafeInteger(expectedSpeciesCount) && expectedSpeciesCount > 0 && expectedSpeciesCount <= 10000,
    400, "invalid_import_config", "Ungültiger gebundener Artumfang.");
  check(localStorageConfirmed === true && typeof filename === "string" && path.isAbsolute(filename)
    && !/^(?:\\\\|\/\/|file:)/i.test(filename), 400, "unsafe_storage", "Ein persönliches lokales Importjournal ist erforderlich.");
  let current = path.parse(filename).root;
  for (const part of path.relative(current, filename).split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) check(!fs.lstatSync(current).isSymbolicLink(), 400, "unsafe_storage", "Verknüpfte Journalpfade sind nicht zulässig.");
  }
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename); fs.chmodSync(filename, 0o600);
  db.exec("PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF;");
  const version = db.prepare("PRAGMA user_version").get().user_version;
  try { check([0, 1, 2].includes(version), 409, "unsupported_schema", "Unbekannte Importjournalversion."); checkSchema(db, version); }
  catch (error) { db.close(); throw error; }
  if (version !== 2) try {
    db.exec("BEGIN IMMEDIATE");
    const lease = version === 1 ? db.prepare("SELECT * FROM lease WHERE id=1").get() : null;
    check(!lease || !live(lease.pid), 409, "import_in_use", "Ein laufender Importbesitzer muss vor der Journalaktualisierung regulär schließen.");
    db.exec(`
    CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,base_url TEXT NOT NULL,
      source_hash TEXT NOT NULL,release_readers INTEGER NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,last_error TEXT);
    CREATE TABLE IF NOT EXISTS items(plan_id TEXT NOT NULL REFERENCES plans(id),id TEXT NOT NULL,name TEXT NOT NULL,
      target_json TEXT NOT NULL,target_hash TEXT NOT NULL,state TEXT NOT NULL,expected_revision TEXT,expected_approval TEXT,
      intent_actor TEXT,PRIMARY KEY(plan_id,id));
    CREATE TABLE IF NOT EXISTS receipts(sequence INTEGER PRIMARY KEY AUTOINCREMENT,plan_id TEXT NOT NULL REFERENCES plans(id),
      object_id TEXT,operation TEXT NOT NULL,phase TEXT NOT NULL,revision TEXT,actor_id TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,pid INTEGER NOT NULL);
    CREATE TABLE source_bindings(plan_id TEXT PRIMARY KEY REFERENCES plans(id),kind TEXT NOT NULL,version INTEGER NOT NULL,evidence_json TEXT NOT NULL);
    INSERT INTO source_bindings SELECT id,'public-catalog',1,'{}' FROM plans;
    PRAGMA user_version=2;
    COMMIT;
  `); } catch (error) { try { db.exec("ROLLBACK"); } finally { db.close(); } throw error; }
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
  const owner = randomUUID();
  let running = false, runningPromise = null, preparing = false, preparationPromise = null, closing = false, closed = false, lastClosedStatus = null;
  const now = () => new Date(clock()).toISOString();
  function open() { check(!closed && !closing, 409, "import_closed", "Das Importjournal wird geschlossen."); }
  function tx(fn) { db.exec("BEGIN IMMEDIATE"); try { const result = fn(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } }
  function acquire() {
    tx(() => {
      const existing = db.prepare("SELECT * FROM lease WHERE id=1").get();
      check(!existing || existing.owner === owner || !live(existing.pid), 409, "import_in_use", "Ein anderer laufender Prozess verwendet dieses Importjournal.");
      db.prepare("INSERT OR REPLACE INTO lease VALUES (1,?,?)").run(owner, process.pid);
    });
  }
  function release() { db.prepare("DELETE FROM lease WHERE id=1 AND owner=?").run(owner); }
  function receipt(planId, id, operation, phase, revision, actor) {
    db.prepare("INSERT INTO receipts(plan_id,object_id,operation,phase,revision,actor_id,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(planId, id, operation, phase, revision ?? null, actor ?? null, now());
  }
  async function source() {
    if (workingSource) {
      const current = await sourceAdapter.read();
      check(current && Array.isArray(current.species) && current.species.length > 0 && current.species.length <= 10000
        && (expectedSpeciesCount === null || current.species.length === expectedSpeciesCount), 409, "import_scope_changed", "Der vollständige Artumfang ist nicht eindeutig gebunden.");
      const species = current.species.map((item) => validateSpeciesRecord(item, item.id));
      check(new Set(species.map((item) => item.id)).size === species.length && new Set(species.map(scientificIdentity)).size === species.length,
        409, "import_scope_changed", "Die vollständigen Artidentitäten sind nicht eindeutig.");
      species.forEach(objectJson);
      const evidence = validateWorkingImportEvidence(current.evidence, species, current.sourceSha256);
      return { species, evidence, sourceSha256: current.sourceSha256 };
    }
    let bytes;
    try { bytes = await readCatalog(); } catch { throw new ProjectError(503, "bound_source_unavailable", "Der gebundene Anfangskatalog ist nicht lesbar."); }
    check((Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) && bytes.length <= 5 * 1024 * 1024
      && sha(bytes) === expectedSha256, 409, "bound_source_changed", "Die Katalogbytes stimmen nicht mit dem geprüften Anfangsbestand überein.");
    let catalog;
    try { catalog = buildCatalog(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
    catch { throw new ProjectError(400, "invalid_import_catalog", "Der Anfangskatalog erfüllt den vereinbarten Datenvertrag nicht."); }
    check(catalog.species.length === expectedSpeciesCount, 409, "import_scope_changed", "Der gebundene Artumfang stimmt nicht überein.");
    return { ...catalog, evidence: {}, sourceSha256: expectedSha256 };
  }
  async function inspect(plan) {
    const state = await service.refresh({ users: true });
    check(state.status?.connection === "online" && state.status.user?.role === "admin" && !state.status.readOnlySession
      && state.permissions?.canManageUsers === true, 403, "import_admin_required", "Der Erstbestand benötigt eine volle Online-Anmeldung der Administration.");
    check(state.queuedChanges === 0 && state.conflictCount === 0 && !state.busy, 409, "import_local_work_pending", "Bitte lokale Änderungen und Konflikte zuerst abschließen.");
    if (workingSource) {
      check(typeof service.capabilities === "function", 409, "species_record_server_required", "Der Projektdienst muss vollständige Artdatensätze ausdrücklich unterstützen.");
      const capabilities = await service.capabilities();
      check(capabilities?.schemaVersion === 1 && capabilities.speciesRecordVersion === 1 && capabilities.adminBoundImport === true && capabilities.projectId === state.status.projectId
        && capabilities.user?.id === state.status.user.id && capabilities.user.role === "admin",
      409, "species_record_server_required", "Die Unterstützung vollständiger Artdatensätze und die aktuelle Administration müssen am Projektdienst bestätigt sein.");
    }
    if (plan) check(state.status.projectId === plan.project_id && state.status.baseUrl === plan.base_url,
      409, "import_project_changed", "Das verbundene Projekt oder der Server wurde geändert.");
    return { state, objects: new Map(state.objects.filter((item) => item.kind === "species").map((item) => [item.id, item])) };
  }
  function planRow(id) { const row = db.prepare("SELECT * FROM plans WHERE id=?").get(id); check(row, 404, "import_plan_missing", "Der Importplan ist nicht vorhanden."); return row; }
  function items(id) { return db.prepare("SELECT * FROM items WHERE plan_id=? ORDER BY id").all(id); }
  function binding(id) {
    const row = db.prepare("SELECT * FROM source_bindings WHERE plan_id=?").get(id);
    check(row && [publicKind, workingKind].includes(row.kind) && row.version === 1, 409, "import_journal_drift", "Die Quellenart des Plans ist nicht eindeutig gebunden.");
    return row;
  }
  function validatePlanSource(plan, catalog) {
    const rows = items(plan.id), targetBinding = binding(plan.id), targets = new Map(catalog.species.map((item) => [item.id, item]));
    assertImportItemIntegrity({ plan, items: rows, receipts: db.prepare("SELECT * FROM receipts WHERE plan_id=? ORDER BY sequence").all(plan.id) });
    check(targetBinding.kind === sourceKind && targetBinding.evidence_json === canonicalJson(catalog.evidence, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 })
      && plan.source_hash === catalog.sourceSha256 && rows.length === targets.size, 409, "import_journal_drift", "Die Journalbindung stimmt nicht mehr mit der geprüften Quelle überein.");
    for (const item of rows) {
      check(targets.has(item.id) && item.name === (workingSource ? targets.get(item.id).input.german : targets.get(item.id).commonName)
        && dataHash(JSON.parse(item.target_json)) === dataHash(targets.get(item.id))
        && ["pending", "skipped", "create-intent", "created", "approve-intent", "approved"].includes(item.state)
        && (item.state === "skipped" || item.target_hash === dataHash(targets.get(item.id))),
      409, "import_journal_drift", "Eine Journalposition wurde gegenüber dem bestätigten Quellinhalt verändert.");
    }
  }
  function identityDrift(catalog, observed) {
    if (!workingSource) return [];
    const identities = new Map();
    for (const item of observed.objects.values()) {
      const key = scientificIdentity(item.data), ids = identities.get(key) || []; ids.push(item.id); identities.set(key, ids);
    }
    return catalog.species.flatMap((item) => (identities.get(scientificIdentity(item)) || []).filter((id) => id !== item.id)
      .map((otherId) => ({ id: item.id, otherId, reason: "scientific-identity-under-other-id" })));
  }
  async function verifySpeciesSource(catalog, id) {
    if (workingSource) await sourceAdapter.verifySpecies(catalog, id);
    check(!closing, 409, "import_stopped", "Der Import wurde vor dem nächsten Schreibschritt angehalten.");
  }
  function drift(plan, observed) {
    const result = [];
    for (const item of items(plan.id)) {
      const actual = observed.objects.get(item.id);
      if (item.state === "pending") {
        if (actual) result.push({ id: item.id, reason: "object-created-since-plan" });
      } else if (item.state === "create-intent") {
        if (actual && !(dataHash(actual.data) === item.target_hash && actual.ordinal === 1 && actual.authorId === item.intent_actor
          && (!actual.approvedRevision || actual.approvedRevision === actual.revision && plan.release_readers))) result.push({ id: item.id, reason: "unconfirmed-creation-does-not-match" });
      } else if (!actual || item.state !== "skipped" && (actual.ordinal !== 1 || actual.authorId !== item.intent_actor) || actual.revision !== item.expected_revision
        || dataHash(actual.data) !== (item.state === "skipped" ? item.target_hash : dataHash(JSON.parse(item.target_json)))
        || (item.state !== "approve-intent" && actual.approvedRevision !== item.expected_approval)
        || item.state === "approve-intent" && actual.approvedRevision !== item.expected_approval && actual.approvedRevision !== actual.revision) {
        result.push({ id: item.id, reason: "version-content-or-approval-changed" });
      }
    }
    return result;
  }
  function view(id, differences = []) {
    const plan = planRow(id), source = binding(id), rows = items(id), count = (state) => rows.filter((item) => item.state === state).length;
    return { schemaVersion: 1, planId: id, projectId: plan.project_id, baseUrl: plan.base_url, sourceSha256: plan.source_hash,
      source: { kind: source.kind, version: source.version },
      canReplace: plan.state !== "superseded" && db.prepare("SELECT count(*) AS n FROM receipts WHERE plan_id=? AND phase='intent'").get(id).n === 0,
      releaseForReaders: Boolean(plan.release_readers), state: plan.state, createdAt: plan.created_at, lastError: plan.last_error,
      canApply: ["planned", "running", "stopped"].includes(plan.state) && plan.last_error !== "import_identity_collision" && !differences.length, drift: differences, externalPublication: "not-performed",
      counts: { total: rows.length, skippedExisting: count("skipped"), pending: count("pending"), created: count("created"), approved: count("approved"),
        uncertain: count("create-intent") + count("approve-intent"), willCreate: count("pending") + count("create-intent"),
        existingDifferent: rows.filter((item) => item.state === "skipped" && item.target_hash !== dataHash(JSON.parse(item.target_json))).length },
      items: rows.map((item) => ({ id: item.id, commonName: item.name, state: item.state, revision: item.expected_revision, approvedRevision: item.expected_approval,
        existingMatchesSource: item.state === "skipped" ? item.target_hash === dataHash(JSON.parse(item.target_json)) : null })) };
  }
  function status() {
    if (closed) return { ...lastClosedStatus, running: false, busy: false, closed: true };
    const row = db.prepare("SELECT id FROM plans WHERE state<>'superseded' ORDER BY created_at DESC,rowid DESC LIMIT 1").get();
    return { running, busy: running || preparing, closed: false, source: { kind: sourceKind, version: 1 }, plan: row ? view(row.id) : null };
  }
  async function prepareWork({ releaseForReaders = false, replaceUnstartedPlanId = null } = {}) {
    open(); check(!running, 409, "import_running", "Der Import läuft bereits.");
    check(typeof releaseForReaders === "boolean", 400, "invalid_import_confirmation", "Die interne Freigabe muss ausdrücklich gewählt werden.");
    acquire();
    try {
      const catalog = await source(), observed = await inspect();
      const previous = db.prepare("SELECT * FROM plans WHERE project_id=? AND base_url=? AND state IN ('planned','running','stopped','complete') ORDER BY rowid DESC LIMIT 1")
        .get(observed.state.status.projectId, observed.state.status.baseUrl);
      if (replaceUnstartedPlanId !== null) check(previous && replaceUnstartedPlanId === previous.id, 409, "import_plan_inactive", "Der ausdrücklich zu ersetzende Plan ist nicht mehr aktuell.");
      let superseded = null;
      const collisions = identityDrift(catalog, observed);
      if (previous) {
        const sameSource = binding(previous.id).kind === sourceKind && previous.source_hash === catalog.sourceSha256;
        if (sameSource) {
          validatePlanSource(previous, catalog);
          if (replaceUnstartedPlanId !== previous.id && (previous.state === "complete" || Boolean(previous.release_readers) === releaseForReaders)) {
            if (collisions.length || previous.last_error === "import_identity_collision") db.prepare("UPDATE plans SET last_error=? WHERE id=?").run(collisions.length ? "import_identity_collision" : null, previous.id);
            return view(previous.id, [...drift(previous, observed), ...collisions]);
          }
        } else check(replaceUnstartedPlanId === previous.id, 409, "bound_source_changed", "Der offene Plan gehört zu einer anderen Quelle. Ein unbegonnener Plan muss ausdrücklich ersetzt werden.");
        check(db.prepare("SELECT count(*) AS n FROM receipts WHERE plan_id=? AND phase='intent'").get(previous.id).n === 0,
          409, "import_options_changed", "Ein bereits begonnener Import behält seine bestätigte Freigabeentscheidung.");
        superseded = previous.id;
      }
      const id = randomUUID();
      tx(() => {
        if (superseded) db.prepare("UPDATE plans SET state='superseded' WHERE id=?").run(superseded);
        db.prepare("INSERT INTO plans VALUES (?,?,?,?,?,'planned',?,NULL)").run(id, observed.state.status.projectId, observed.state.status.baseUrl, catalog.sourceSha256, Number(releaseForReaders), now());
        db.prepare("INSERT INTO source_bindings VALUES (?,?,1,?)").run(id, sourceKind, canonicalJson(catalog.evidence, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 }));
        for (const item of catalog.species) {
          const existing = observed.objects.get(item.id);
          db.prepare("INSERT INTO items VALUES (?,?,?,?,?,?,?,?,NULL)").run(id, item.id, workingSource ? item.input.german : item.commonName, JSON.stringify(item),
            existing ? dataHash(existing.data) : dataHash(item), existing ? "skipped" : "pending", existing?.revision ?? null, existing?.approvedRevision ?? null);
        }
        receipt(id, null, "plan", "prepared", null, observed.state.status.user.id);
        if (collisions.length) db.prepare("UPDATE plans SET last_error='import_identity_collision' WHERE id=?").run(id);
      });
      return view(id, collisions);
    } finally { release(); }
  }
  async function execute({ planId, confirmed = false, confirmInternalRelease = false } = {}) {
    check(confirmed === true, 400, "import_confirmation_required", "Der angezeigte Importplan muss ausdrücklich bestätigt werden.");
    const plan = planRow(planId);
    check(["planned", "running", "stopped", "complete"].includes(plan.state), 409, "import_plan_inactive", "Dieser Importplan wurde ersetzt und kann nicht mehr gestartet werden.");
    check(!plan.release_readers || confirmInternalRelease === true, 400, "import_release_confirmation_required", "Die interne Freigabe für Projektleser benötigt eine eigene Bestätigung.");
    acquire();
    try {
      check(["planned", "running", "stopped", "complete"].includes(planRow(planId).state), 409, "import_plan_inactive", "Der Importplan ist nicht mehr aktiv.");
      const catalog = await source(); validatePlanSource(plan, catalog);
      if (plan.state === "complete") {
        const observed = await inspect(plan);
        check(!drift(plan, observed).length && !identityDrift(catalog, observed).length, 409, "import_drift", "Der bereits quittierte Stand wurde inzwischen geändert.");
        return view(planId);
      }
      db.prepare("UPDATE plans SET state='running',last_error=NULL WHERE id=?").run(planId);
      for (let item of items(planId)) {
        check(!closing, 409, "import_stopped", "Der Import wurde vor dem nächsten Schritt angehalten.");
        const observed = await inspect(plan), differences = [...drift(plan, observed), ...identityDrift(catalog, observed)];
        check(!closing, 409, "import_stopped", "Der Import wurde vor der nächsten Änderung angehalten.");
        check(differences.length === 0, 409, "import_drift", "Der Projektstand ist vom bestätigten Importplan abgewichen. Es wurde nichts überschrieben.");
        if (["skipped", "approved"].includes(item.state)) continue;
        if (item.state === "created" && !plan.release_readers) continue;
        let actual = observed.objects.get(item.id);
        if (item.state === "create-intent" && actual) {
          tx(() => {
            db.prepare("UPDATE items SET state=?,expected_revision=?,expected_approval=? WHERE plan_id=? AND id=?")
              .run(actual.approvedRevision === actual.revision ? "approved" : "created", actual.revision, actual.approvedRevision, planId, item.id);
            receipt(planId, item.id, "create", "recovered-confirmed", actual.revision, observed.state.status.user.id);
            if (actual.approvedRevision === actual.revision) receipt(planId, item.id, "approve", "recovered-confirmed", actual.revision, observed.state.status.user.id);
          });
          item = db.prepare("SELECT * FROM items WHERE plan_id=? AND id=?").get(planId, item.id);
        }
        if (["pending", "create-intent"].includes(item.state)) {
          await verifySpeciesSource(catalog, item.id);
          tx(() => {
            db.prepare("UPDATE items SET state='create-intent',intent_actor=? WHERE plan_id=? AND id=?").run(observed.state.status.user.id, planId, item.id);
            receipt(planId, item.id, "create", "intent", null, observed.state.status.user.id);
          });
          actual = await service.create({ kind: "species", id: item.id, data: JSON.parse(item.target_json),
            requiredBinding: { baseUrl: plan.base_url, projectId: plan.project_id, userId: observed.state.status.user.id }, ...(workingSource ? { requireAdmin: true } : {}) });
          check(actual.revision && dataHash(actual.data) === dataHash(JSON.parse(item.target_json)) && !actual.localPending,
            409, "import_drift", "Die Anlagequittung entspricht nicht dem bestätigten Inhalt.");
          tx(() => {
            db.prepare("UPDATE items SET state='created',expected_revision=?,expected_approval=? WHERE plan_id=? AND id=?")
              .run(actual.revision, actual.approvedRevision, planId, item.id);
            receipt(planId, item.id, "create", "confirmed", actual.revision, observed.state.status.user.id);
          });
          item = db.prepare("SELECT * FROM items WHERE plan_id=? AND id=?").get(planId, item.id);
        }
        if (plan.release_readers && item.state !== "approved") {
          check(!closing, 409, "import_stopped", "Die Anlage ist quittiert; die interne Freigabe bleibt offen.");
          const checked = await inspect(plan);
          check(!closing, 409, "import_stopped", "Die interne Freigabe wurde vor dem nächsten Schreibschritt angehalten.");
          check(drift(plan, checked).length === 0 && identityDrift(catalog, checked).length === 0, 409, "import_drift", "Der Projektstand wurde vor der internen Freigabe geändert.");
          actual = checked.objects.get(item.id);
          if (!(item.state === "approve-intent" && actual.approvedRevision === item.expected_revision)) {
            await verifySpeciesSource(catalog, item.id);
            tx(() => { db.prepare("UPDATE items SET state='approve-intent' WHERE plan_id=? AND id=?").run(planId, item.id);
              receipt(planId, item.id, "approve", "intent", item.expected_revision, checked.state.status.user.id); });
            actual = await service.approve("species", item.id, { expectedRevision: item.expected_revision,
              requiredBinding: { baseUrl: plan.base_url, projectId: plan.project_id, userId: checked.state.status.user.id }, ...(workingSource ? { requireAdmin: true } : {}) });
            check(actual.revision === item.expected_revision && actual.approvedRevision === item.expected_revision
              && dataHash(actual.data) === dataHash(JSON.parse(item.target_json)), 409, "import_drift", "Die Freigabequittung entspricht nicht der geprüften Version.");
          }
          tx(() => { db.prepare("UPDATE items SET state='approved',expected_approval=? WHERE plan_id=? AND id=?").run(item.expected_revision, planId, item.id);
            receipt(planId, item.id, "approve", item.state === "approve-intent" ? "recovered-confirmed" : "confirmed", item.expected_revision, checked.state.status.user.id); });
        }
      }
      const observed = await inspect(plan);
      check(!drift(plan, observed).length && !identityDrift(catalog, observed).length, 409, "import_drift", "Der Abschlussstand wurde inzwischen geändert.");
      tx(() => { db.prepare("UPDATE plans SET state='complete',last_error=NULL WHERE id=?").run(planId); receipt(planId, null, "plan", "complete", null, observed.state.status.user.id); });
      return view(planId);
    } catch (error) {
      const code = error instanceof ProjectError ? error.code : "import_not_confirmed";
      db.prepare("UPDATE plans SET state='stopped',last_error=? WHERE id=? AND state IN ('planned','running','stopped')").run(code, planId);
      if (error instanceof ProjectError) throw error;
      throw new ProjectError(503, "import_not_confirmed", "Der letzte Importschritt ist nicht bestätigt. Das Journal und beide Bestände bleiben erhalten; bitte vor einer Wiederaufnahme prüfen.");
    } finally { release(); }
  }
  function apply(input) {
    open(); check(!running && !preparing, 409, "import_running", "Der Import oder die Planprüfung läuft bereits."); running = true;
    runningPromise = execute(input).finally(() => { running = false; }); return runningPromise;
  }
  return { prepare(input) {
      open(); check(!running && !preparing, 409, "import_running", "Der Import oder die Planprüfung läuft bereits.");
      preparing = true; preparationPromise = prepareWork(input).finally(() => { preparing = false; }); return preparationPromise;
    }, apply,
    start(input) { const task = apply(input); task.catch(() => {}); return status(); }, status,
    backupProjectIds() { open(); return db.prepare("SELECT DISTINCT project_id AS id FROM plans ORDER BY id").all().map((row) => row.id); },
    receipts(planId) { open(); return db.prepare("SELECT sequence,object_id AS objectId,operation,phase,revision,actor_id AS actorId,created_at AS createdAt FROM receipts WHERE plan_id=? ORDER BY sequence").all(planId); },
    async close() {
      if (closed) return; closing = true;
      if (preparationPromise) await preparationPromise.catch(() => {});
      if (runningPromise) await runningPromise.catch(() => {});
      lastClosedStatus = status(); release(); db.close(); closed = true;
    }
  };
}
