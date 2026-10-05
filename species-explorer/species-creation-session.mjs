import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const JSON_FILES = ["species_list.json", "speciesData.json", "lastSavedAssessmentId.json",
  "species-assets-overrides.json", "species-taxonomy-overrides.json", "fehlende_elemente_report.json"];
const MAP_DOC = "docs/manual-map-overrides.md";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fail = (message) => Object.assign(new Error(message), { statusCode: 409 });
async function optionalRead(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function atomicText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${randomUUID()}`;
  try { await writeFile(temp, text, "utf8"); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
function matchesInput(entry, job) { return `${entry.genus}${entry.species}`.toLowerCase() === job.slug; }
function matchesData(entry, job) { return String(entry.URLSlug ?? "").toLowerCase() === job.slug; }
function reportItemMatches(item, job) {
  return typeof item === "string" ? item === job.germanName
    : item?.safeName === job.safeName || item?.german === job.germanName;
}
function ownJsonView(name, value, job) {
  if (name === "species_list.json") return (value ?? []).filter((entry) => matchesInput(entry, job));
  if (name === "speciesData.json") return (value ?? []).filter((entry) => matchesData(entry, job));
  if (name === "lastSavedAssessmentId.json") return value?.[job.safeName] ?? null;
  if (name === "species-assets-overrides.json") return value?.assets?.[job.safeName] ?? null;
  if (name === "species-taxonomy-overrides.json") return value?.species?.[job.slug] ?? null;
  return {
    missing: Object.fromEntries(Object.entries(value?.missing ?? {}).map(([key, items]) => [key,
      Array.isArray(items) ? items.filter((item) => reportItemMatches(item, job)) : []])),
    ncSoundLicensesAll: (value?.ncSoundLicensesAll ?? []).filter((item) => reportItemMatches(item, job)),
  };
}
function mapRows(text, job) { return (text ?? "").split(/\r?\n/).filter((line) => line.includes(`\`species-assets/${job.safeName}/map.jpg\``)); }
function removeOwnJson(name, value, job) {
  if (name === "species_list.json") return value.filter((entry) => !matchesInput(entry, job));
  if (name === "speciesData.json") return value.filter((entry) => !matchesData(entry, job));
  if (name === "lastSavedAssessmentId.json") delete value[job.safeName];
  else if (name === "species-assets-overrides.json") delete value.assets?.[job.safeName];
  else if (name === "species-taxonomy-overrides.json") delete value.species?.[job.slug];
  else {
    const countKeys = { soundMp3: "missingSoundMp3", soundCredits: "missingSoundCredits", maps: "missingMap",
      assessmentId: "missingAssessmentId", status: "missingStatus", category: "missingCategory",
      trend: "missingTrend", speciesAssets: "missingSpeciesAssets" };
    for (const [key, items] of Object.entries(value.missing ?? {})) {
      if (!Array.isArray(items)) continue;
      value.missing[key] = items.filter((item) => !reportItemMatches(item, job));
      if (value.counts && countKeys[key]) value.counts[countKeys[key]] = value.missing[key].length;
    }
    value.ncSoundLicensesAll = (value.ncSoundLicensesAll ?? []).filter((item) => !reportItemMatches(item, job));
    if (value.counts) value.counts.ncSoundLicensesAll = value.ncSoundLicensesAll.length;
  }
  return value;
}

// Receipt files are local ownership evidence. They never restore a global old
// JSON over another edit: only the named creation's entries are removed.
export function createSpeciesCreationSessionStore({ repoRoot }) {
  const jobsRoot = join(repoRoot, "species-explorer", "creation-sessions");
  const queues = new Map();
  async function locked(id, operation) {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    queues.set(id, next);
    try { return await next; } finally { if (queues.get(id) === next) queues.delete(id); }
  }
  const jobPath = (id) => {
    if (!/^[0-9a-f-]{36}$/.test(String(id ?? ""))) throw fail("Artanlage-Auftrag ist ungültig.");
    return join(jobsRoot, `${id}.json`);
  };
  async function save(job) {
    await assertOwnedPath(jobPath(job.id));
    await atomicText(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`);
  }
  async function load(id) {
    const text = await optionalRead(jobPath(id));
    if (text === null) throw fail("Der eigene Artanlage-Auftrag wurde nicht gefunden.");
    const job = JSON.parse(text);
    if (job.id !== id || job.owner !== "species-creation" || job.schemaVersion !== 1) throw fail("Artanlage-Auftrag besitzt keinen gültigen Herkunftsnachweis.");
    if (!["aborted", "detached"].includes(job.status) && (!job.slug || !job.safeName || /[\\/]/.test(job.safeName) || job.safeName === "." || job.safeName === ".."
        || dirname(resolve(job.backupPath)) !== resolve(repoRoot, "species-explorer", "backups"))) throw fail("Artanlage-Auftrag enthält ungültige Dateiziele.");
    if (!["aborted", "detached"].includes(job.status)) {
      for (const name of [...Object.keys(job.expected?.assets ?? {}), ...Object.keys(job.expected?.backupAssets ?? {}), ...Object.keys(job.baselineBackups ?? {})]) {
        if (!name || name.split("/").some((part) => !part || part === "." || part === ".." || /[\\:]/.test(part))) throw fail("Artanlage-Auftrag enthält einen ungebundenen Assetpfad.");
      }
    }
    return job;
  }
  async function all() {
    let names;
    try { names = await readdir(jobsRoot); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    return Promise.all(names.filter((name) => /^[0-9a-f-]{36}\.json$/.test(name)).map((name) => load(name.slice(0, -5))));
  }
  async function gitFingerprint() {
    let gitRoot = join(repoRoot, ".git");
    try {
      if ((await lstat(gitRoot)).isFile()) {
        const pointer = await readFile(gitRoot, "utf8");
        if (!pointer.startsWith("gitdir:")) throw fail("Git-Herkunft ist unlesbar.");
        gitRoot = resolve(repoRoot, pointer.slice(7).trim());
      }
    } catch (error) { if (error.code === "ENOENT") return "no-git"; throw error; }
    const head = await optionalRead(join(gitRoot, "HEAD"));
    const common = await optionalRead(join(gitRoot, "commondir"));
    const refsRoot = common === null ? gitRoot : resolve(gitRoot, common.trim());
    const refName = head?.startsWith("ref: ") ? head.slice(5).trim() : "";
    if (refName && (!refName.startsWith("refs/") || refName.includes(".."))) throw fail("Git-Referenz ist ungültig.");
    const ref = refName ? await optionalRead(join(refsRoot, refName)) : null;
    const packed = refName && ref === null ? await optionalRead(join(refsRoot, "packed-refs")) : null;
    let index;
    try { index = await readFile(join(gitRoot, "index")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    return digest(canonical({ head, ref, packed, index: index ? digest(index) : null }));
  }
  async function assetReceipt(job, { backup = false } = {}) {
    const root = backup ? join(repoRoot, "species-explorer", "asset-backups", job.safeName)
      : join(repoRoot, "species-assets", job.safeName), result = {};
    await assertOwnedPath(root);
    async function walk(path) {
      let details;
      try { details = await lstat(path); } catch (error) { if (error.code === "ENOENT") return; throw error; }
      if (details.isSymbolicLink()) throw fail("Verknüpfte Artdateien können nicht automatisch zurückgenommen werden.");
      if (details.isDirectory()) {
        for (const name of (await readdir(path)).sort()) await walk(join(path, name));
      } else if (details.isFile()) result[relative(root, path).split(sep).join("/")] = digest(await readFile(path));
      else throw fail("Unbekannte Artdatei verhindert die Rücknahme.");
    }
    await walk(root);
    return result;
  }
  async function assertOwnedPath(path) {
    const target = resolve(path), inside = relative(resolve(repoRoot), target);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`)) throw fail("Rücknahmeziel liegt außerhalb des eigenen Artbereichs.");
    let ancestor = resolve(repoRoot);
    for (const part of ["", ...inside.split(sep)]) {
      if (part) ancestor = join(ancestor, part);
      try { if ((await lstat(ancestor)).isSymbolicLink()) throw fail("Verknüpfte Rücknahmeziele werden nicht verändert."); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  async function receipt(job) {
    const files = {}, sourceHashes = {};
    for (const name of JSON_FILES) {
      const text = await optionalRead(join(repoRoot, name));
      files[name] = text === null ? null : ownJsonView(name, JSON.parse(text), job);
      sourceHashes[name] = text === null ? null : digest(text);
    }
    const mapDocument = await optionalRead(join(repoRoot, MAP_DOC));
    return { files, sourceHashes, mapDocument, mapRows: mapRows(mapDocument, job), assets: await assetReceipt(job),
      backupAssets: await assetReceipt(job, { backup: true }) };
  }
  async function begin({ entry, derived, backupPath }) {
    if (await findBySlug(derived.slug)) throw fail("Für diese Art gibt es bereits einen eigenen Artanlage-Auftrag. Bitte diesen wieder öffnen und fortsetzen oder abbrechen.");
    const job = { schemaVersion: 1, owner: "species-creation", id: randomUUID(), status: "preparing",
      slug: derived.slug, safeName: derived.safeName, germanName: entry.german,
      createdAt: new Date().toISOString(), baseline: {}, backupPath, gitFingerprint: await gitFingerprint() };
    for (const name of [...JSON_FILES, MAP_DOC]) job.baseline[name] = await optionalRead(join(repoRoot, name));
    const before = await receipt(job);
    let assetDirectoryExists = false;
    try { await lstat(join(repoRoot, "species-assets", job.safeName)); assetDirectoryExists = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (assetDirectoryExists || Object.keys(before.assets).length || before.files["species_list.json"]?.length
      || before.files["speciesData.json"]?.length || before.files["lastSavedAssessmentId.json"]
      || before.files["species-assets-overrides.json"] || before.files["species-taxonomy-overrides.json"]
      || before.mapRows.length) throw fail("Vorhandene Art oder Artreste können nicht als neue Artanlage übernommen werden.");
    job.expected = before;
    job.baselineBackups = {};
    for (const name of Object.keys(before.backupAssets)) {
      job.baselineBackups[name] = (await readFile(join(repoRoot, "species-explorer", "asset-backups", job.safeName, name))).toString("base64");
    }
    // The only initial change is known before writing, allowing recovery even
    // if the server stops just after the input-list replacement.
    job.expected.files["species_list.json"] = [entry];
    job.expected.sourceHashes["species_list.json"] = digest(`${JSON.stringify([...JSON.parse(job.baseline["species_list.json"]), entry], null, 2)}\n`);
    await save(job);
    return job.id;
  }
  async function checkpoint(id, { runId, publicationStarted = false, ownedRegistryMetadataKeys = [] } = {}) {
    if (!id) return;
    const job = await load(id);
    if (["aborted", "aborting", "detached"].includes(job.status)) throw fail("Diese Artanlage wurde bereits abgebrochen oder separat gelöscht.");
    if (publicationStarted && job.abortRequested) throw fail("Abbruch wurde bereits angefordert. Die Veröffentlichung wird nicht gestartet.");
    const next = await receipt(job);
    if (canonical(next.files["species_list.json"]) !== canonical(job.expected.files["species_list.json"])) {
      throw fail("Die angelegte Art wurde in der Eingabeliste anderweitig geändert oder gelöscht.");
    }
    job.expected = next;
    if (ownedRegistryMetadataKeys.includes("spectrogramGenerator")) {
      const registry = JSON.parse(await optionalRead(join(repoRoot, "species-assets-overrides.json")) ?? "{}");
      if (Object.hasOwn(registry, "spectrogramGenerator")) {
        job.ownedRegistryMetadata ??= {};
        job.ownedRegistryMetadata.spectrogramGenerator = registry.spectrogramGenerator;
      }
    }
    if (runId) job.runId = runId;
    if (publicationStarted) job.publicationStarted = true;
    job.status = "active";
    await save(job);
  }
  async function findBySlug(slug) {
    return (await all()).find((job) => job.slug === slug && !["aborted", "detached"].includes(job.status)) ?? null;
  }
  async function list() {
    const fingerprint = await gitFingerprint();
    return (await all()).filter((job) => !["aborted", "detached"].includes(job.status)).map((job) => ({ id: job.id,
      slug: job.slug, germanName: job.germanName, runId: job.runId ?? "", createdAt: job.createdAt,
      canAbort: !job.publicationStarted && job.gitFingerprint === fingerprint,
      publicationStarted: job.publicationStarted === true,
      abortRequested: job.abortRequested === true,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function requestAbort(id) {
    const job = await load(id);
    if (job.status === "aborted") return { alreadyAborted: true };
    if (job.status === "detached") throw fail("Dieser Artanlage-Auftrag wurde durch eine separate Artlöschung beendet.");
    if (job.publicationStarted || job.gitFingerprint !== await gitFingerprint()) throw fail("Die Veröffentlichung hat bereits begonnen oder der Git-Stand wurde geändert. Diese Artanlage kann nicht mehr automatisch abgebrochen werden.");
    job.abortRequested = true;
    await save(job);
    return { pending: true, id, slug: job.slug, runId: job.runId ?? "" };
  }
  async function isAbortRequested(id) { return id ? (await load(id)).abortRequested === true : false; }
  async function assertActive(id, slug, { allowAbortRequested = false } = {}) {
    const job = await load(id);
    if (job.slug !== slug || ["aborted", "aborting", "detached"].includes(job.status)
        || job.abortRequested && !allowAbortRequested) throw fail("Dieser Artanlage-Auftrag ist nicht mehr aktiv.");
    return job;
  }
  async function assertCurrent(id, slug) {
    const job = await assertActive(id, slug);
    const own = (record) => ({ files: record.files, mapRows: record.mapRows, assets: record.assets, backupAssets: record.backupAssets });
    if (canonical(own(await receipt(job))) !== canonical(own(job.expected))) throw fail("Eigene Artdaten wurden seit der letzten Speicherung geändert. Bitte den Zustand prüfen.");
  }
  async function abort(id) {
    const job = await load(id);
    if (job.status === "aborted") return { aborted: true, alreadyAborted: true, id };
    if (job.status === "detached") throw fail("Dieser Artanlage-Auftrag wurde durch eine separate Artlöschung beendet. Eine spätere gleichnamige Art bleibt erhalten.");
    if (job.publicationStarted || job.gitFingerprint !== await gitFingerprint()) {
      throw fail("Die Artanlage wurde bereits zur Veröffentlichung übergeben oder der Git-Stand geändert. Automatische Rücknahme ist nicht mehr möglich.");
    }
    const current = await receipt(job);
    const retry = job.status === "aborting";
    for (const name of JSON_FILES) {
      const currentOwn = current.files[name], expectedOwn = job.expected.files[name];
      const baselineOwn = job.baseline[name] === null ? null : ownJsonView(name, JSON.parse(job.baseline[name]), job);
      if (canonical(currentOwn) !== canonical(expectedOwn) && !((retry || job.status === "preparing") && canonical(currentOwn) === canonical(baselineOwn))) {
        throw fail(`Eigene Artdaten wurden nach der Anlage anderweitig geändert (${name}). Rücknahme wurde ohne Löschung angehalten.`);
      }
    }
    if (canonical(current.mapRows) !== canonical(job.expected.mapRows) && !(retry && current.mapRows.length === 0)) {
      throw fail("Die Kartendokumentation dieser Art wurde anderweitig geändert. Rücknahme wurde angehalten.");
    }
    for (const [name, hash] of Object.entries(current.assets)) {
      if (job.expected.assets[name] !== hash) throw fail(`Artdatei ${name} wurde anderweitig geändert oder ergänzt. Rücknahme wurde ohne Löschung angehalten.`);
    }
    if (!retry && canonical(current.assets) !== canonical(job.expected.assets)) throw fail("Artdateien fehlen seit der letzten eigenen Speicherung. Bitte den Zustand prüfen.");
    const baselineBackupHashes = Object.fromEntries(Object.entries(job.baselineBackups ?? {}).map(([name, bytes]) => [name, digest(Buffer.from(bytes, "base64"))]));
    for (const [name, hash] of Object.entries(current.backupAssets)) {
      if (hash !== job.expected.backupAssets?.[name] && !(retry && hash === baselineBackupHashes[name])) throw fail("Eigene Assetsicherungen wurden anderweitig geändert. Rücknahme wurde angehalten.");
    }
    if (!retry && canonical(current.backupAssets) !== canonical(job.expected.backupAssets)) throw fail("Eigene Assetsicherungen fehlen seit der letzten Speicherung.");
    const writes = [];
    let remainingData;
    for (const name of JSON_FILES) {
      const text = await optionalRead(join(repoRoot, name));
      if (text === null) continue;
      const parsed = JSON.parse(text);
      const next = removeOwnJson(name, parsed, job);
      if (name === "speciesData.json") remainingData = next;
      if (name === "fehlende_elemente_report.json" && next.counts && remainingData) next.counts.totalSpecies = remainingData.length;
      const baseline = job.baseline[name];
      const unchangedSinceOwnWrite = digest(text) === job.expected.sourceHashes?.[name];
      if (name === "species-assets-overrides.json" && unchangedSinceOwnWrite
          && Object.hasOwn(job.ownedRegistryMetadata ?? {}, "spectrogramGenerator")
          && canonical(next.spectrogramGenerator) === canonical(job.ownedRegistryMetadata.spectrogramGenerator)) {
        const before = baseline === null ? {} : JSON.parse(baseline);
        if (Object.hasOwn(before, "spectrogramGenerator")) next.spectrogramGenerator = before.spectrogramGenerator;
        else delete next.spectrogramGenerator;
      }
      let restoreBaseline = (text === baseline || unchangedSinceOwnWrite) && baseline !== null && canonical(next) === canonical(JSON.parse(baseline));
      if (name === "fehlende_elemente_report.json" && baseline !== null) {
        const withoutDate = (value) => { const result = { ...value }; delete result.generatedAt; return result; };
        restoreBaseline = (text === baseline || unchangedSinceOwnWrite) && canonical(withoutDate(next)) === canonical(withoutDate(JSON.parse(baseline)));
      }
      // Registries absent before creation disappear again only when no foreign
      // entry or metadata was added in the meantime.
      const emptyNewRegistry = baseline === null && ["lastSavedAssessmentId.json", "species-assets-overrides.json", "species-taxonomy-overrides.json"].includes(name)
        && Object.entries(next).every(([key, value]) => key === "version" && value === 1
          || ["assets", "species"].includes(key) && canonical(value) === "{}");
      const nextText = emptyNewRegistry ? null : restoreBaseline ? baseline : `${JSON.stringify(next, null, 2)}\n`;
      if (text !== nextText) writes.push({ name, expectedHash: digest(text), text: nextText });
    }
    const doc = await optionalRead(join(repoRoot, MAP_DOC));
    if (doc !== null && current.mapRows.length) {
      let next = doc.split(/\r?\n/).filter((line) => !mapRows(line, job).length).join(doc.includes("\r\n") ? "\r\n" : "\n");
      const baseline = job.baseline[MAP_DOC];
      const rowKey = (line) => /^\|\s*[^|]+\|\s*([^|]+)\|\s*`species-assets\/[^/]+\/map\.jpg`/.exec(line)?.[1]?.trim();
      const baselineRows = new Map((baseline ?? "").split(/\r?\n/).filter((line) => rowKey(line)).map((line) => [rowKey(line), line]));
      const expectedRows = new Map((job.expected.mapDocument ?? "").split(/\r?\n/).filter((line) => rowKey(line)).map((line) => [rowKey(line), line]));
      const withoutRowDate = (line) => line?.replace(/\|\s*\d{4}-\d{2}-\d{2}\s*\|([^|]*)\|\s*$/, "|DATE|$1|");
      // The shared map synchronizer updates dates on existing rows too. Undo
      // that exact known date delta only while the row still equals our receipt.
      next = next.split(/\r?\n/).map((line) => {
        const key = rowKey(line), before = baselineRows.get(key), expected = expectedRows.get(key);
        return before && line === expected && withoutRowDate(before) === withoutRowDate(expected) ? before : line;
      }).join(doc.includes("\r\n") ? "\r\n" : "\n");
      if (doc === job.expected.mapDocument) {
        const normalizedDoc = (text) => (text ?? "").replace(/^Stand:.*$/m, "").replace(/Aktuell sind [^\n]*\./, "").replace(/\s+/g, " ").trim();
        if (normalizedDoc(next) === normalizedDoc(baseline)) next = baseline;
      }
      if (next !== baseline) {
        const count = next.split(/\r?\n/).filter((line) => /^\|\s*[^|]+\|\s*[^|]+\|\s*`species-assets\/[^/]+\/map\.jpg`/.test(line)).length;
        next = next.replace(/Aktuell sind [^\r\n]*? Karten? (?:als (?:manuell gepflegt|geschützt) dokumentiert|durch bestehende manuelle Altmarkierungen geschützt)\./,
          `Aktuell sind ${count} ${count === 1 ? "Karte" : "Karten"} als geschützt dokumentiert.`);
      }
      writes.push({ name: MAP_DOC, expectedHash: digest(doc), text: next });
    }
    // Validate the own backup before any mutation too.
    const backup = await optionalRead(job.backupPath);
    await assertOwnedPath(job.backupPath);
    if (backup !== null && backup !== job.baseline["species_list.json"]) throw fail("Die eigene Anlagesicherung wurde geändert; Rücknahme wurde angehalten.");
    job.status = "aborting";
    await save(job);
    for (const item of writes) {
      await assertOwnedPath(join(repoRoot, item.name));
      if (digest(await readFile(join(repoRoot, item.name))) !== item.expectedHash) throw fail("Projektdatei wurde während der Rücknahme geändert. Bitte erneut abbrechen.");
      if (item.text === null) await unlink(join(repoRoot, item.name));
      else await atomicText(join(repoRoot, item.name), item.text);
    }
    const assetRoot = join(repoRoot, "species-assets", job.safeName);
    await assertOwnedPath(assetRoot);
    const removeEmptyDirectories = async (directory) => {
      let items;
      try { items = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const item of items) if (item.isDirectory()) await removeEmptyDirectories(join(directory, item.name));
      try { await rmdir(directory); } catch (error) { if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error; }
    };
    for (const [name, expectedHash] of Object.entries(current.assets)) {
      const path = join(assetRoot, name);
      await assertOwnedPath(path);
      let bytes;
      try { bytes = await readFile(path); } catch (error) { if (error.code === "ENOENT" && retry) continue; throw error; }
      if (digest(bytes) !== expectedHash) throw fail("Artdatei wurde während der Rücknahme geändert. Bitte den Zustand prüfen.");
      await unlink(path);
    }
    await removeEmptyDirectories(assetRoot);
    if (Object.keys(await assetReceipt(job)).length) throw fail("Während der Rücknahme wurden fremde Artdateien ergänzt. Diese wurden erhalten; Rücknahme bleibt angehalten.");
    const backupRoot = join(repoRoot, "species-explorer", "asset-backups", job.safeName);
    await assertOwnedPath(backupRoot);
    for (const name of Object.keys(current.backupAssets)) {
      const path = join(backupRoot, name);
      await assertOwnedPath(path);
      const hash = digest(await readFile(path));
      if (hash !== current.backupAssets[name]) throw fail("Assetsicherung wurde während der Rücknahme geändert. Bitte den Zustand prüfen.");
      if (!Object.hasOwn(job.baselineBackups ?? {}, name)) await unlink(path);
    }
    for (const [name, bytes] of Object.entries(job.baselineBackups ?? {})) {
      const path = join(backupRoot, name);
      await assertOwnedPath(path);
      let currentHash;
      try { currentHash = digest(await readFile(path)); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (currentHash !== current.backupAssets[name] && !(retry && currentHash === baselineBackupHashes[name])) throw fail("Assetsicherung wurde vor ihrer Wiederherstellung anderweitig geändert. Rücknahme bleibt angehalten.");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(bytes, "base64"));
    }
    await removeEmptyDirectories(backupRoot);
    if (canonical(await assetReceipt(job, { backup: true })) !== canonical(baselineBackupHashes)) throw fail("Während der Rücknahme wurden fremde Assetsicherungen ergänzt. Sie bleiben erhalten.");
    if (backup !== null) await unlink(job.backupPath);
    await save({ schemaVersion: 1, owner: "species-creation", id, status: "aborted", abortedAt: new Date().toISOString() });
    return { aborted: true, alreadyAborted: false, id, slug: job.slug, runId: job.runId ?? "", germanName: job.germanName };
  }
  async function detach(id) {
    const job = await load(id);
    await save({ schemaVersion: 1, owner: "species-creation", id, slug: job.slug, status: "detached", endedAt: new Date().toISOString() });
  }
  return { begin,
    checkpoint: (id, options) => id ? locked(id, () => checkpoint(id, options)) : Promise.resolve(),
    findBySlug, list,
    abort: (id) => locked(id, () => abort(id)),
    requestAbort: (id) => locked(id, () => requestAbort(id)),
    detach: (id) => locked(id, () => detach(id)),
    isAbortRequested, assertActive, assertCurrent };
}
