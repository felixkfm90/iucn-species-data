import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const JSON_FILES = ["species_list.json", "speciesData.json", "lastSavedAssessmentId.json",
  "species-assets-overrides.json", "species-taxonomy-overrides.json", "fehlende_elemente_report.json"];
const MAP_DOC = "docs/manual-map-overrides.md";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fail = (message) => Object.assign(new Error(message), { statusCode: 409 });
const gitRead = promisify(execFile);
const ended = (job) => ["aborted", "detached", "published"].includes(job.status);
const publicationView = (record) => ({ files: record.files, mapRows: record.mapRows, assets: record.assets,
  backupAssets: record.backupAssets });
const publicationRevision = (record) => digest(canonical(publicationView(record)));
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
    await assertOwnedPath(jobPath(id));
    const text = await optionalRead(jobPath(id));
    if (text === null) throw fail("Der eigene Artanlage-Auftrag wurde nicht gefunden.");
    const job = JSON.parse(text);
    if (job.id !== id || job.owner !== "species-creation" || job.schemaVersion !== 1) throw fail("Artanlage-Auftrag besitzt keinen gültigen Herkunftsnachweis.");
    if (job.publication && (!/^[a-f0-9]{40,64}$/.test(job.publication.commitId ?? "")
        || !/^[a-f0-9]{64}$/.test(job.publication.revision ?? "") || !job.publication.runId
        || !/^refs\/remotes\/[\w./-]+$/.test(job.publication.upstreamRef ?? "") || job.publication.upstreamRef.includes("..")
        || !Number.isFinite(Date.parse(job.publication.preparedAt))
        || job.publication.confirmedAt && !Number.isFinite(Date.parse(job.publication.confirmedAt)))) {
      throw fail("Artanlage-Auftrag enthält keinen gültigen Transfernachweis. Rücknahmesatz bleibt geschützt.");
    }
    if (job.status === "published" && (!job.slug || !job.publication?.confirmedAt
        || !/^[a-f0-9]{40,64}$/.test(job.publication.commitId ?? "")
        || !/^[a-f0-9]{64}$/.test(job.publication.revision ?? "") || !job.publication.runId)) {
      throw fail("Veröffentlichter Artanlage-Auftrag besitzt keine gültige Abschlussquittung.");
    }
    if (!ended(job) && (!job.slug || !job.safeName || /[\\/]/.test(job.safeName) || job.safeName === "." || job.safeName === ".."
        || dirname(resolve(job.backupPath)) !== resolve(repoRoot, "species-explorer", "backups"))) throw fail("Artanlage-Auftrag enthält ungültige Dateiziele.");
    if (!ended(job)) {
      for (const name of [...Object.keys(job.expected?.assets ?? {}), ...Object.keys(job.expected?.backupAssets ?? {}), ...Object.keys(job.baselineBackups ?? {})]) {
        if (!name || name.split("/").some((part) => !part || part === "." || part === ".." || /[\\:]/.test(part))) throw fail("Artanlage-Auftrag enthält einen ungebundenen Assetpfad.");
      }
    }
    return job;
  }
  async function all() {
    await assertOwnedPath(jobsRoot);
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
  async function readGit(args) {
    const { stdout } = await gitRead("git", args, { cwd: repoRoot, windowsHide: true,
      encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
    return stdout;
  }
  async function currentCommit() {
    const commit = (await readGit(["rev-parse", "--verify", "HEAD"])).toString("utf8").trim();
    if (!/^[a-f0-9]{40,64}$/.test(commit)) throw fail("Der veröffentlichte Git-Stand konnte nicht gebunden werden.");
    return commit;
  }
  async function upstreamRef() {
    const name = (await readGit(["rev-parse", "--symbolic-full-name", "@{upstream}"])).toString("utf8").trim();
    if (!/^refs\/remotes\/[\w./-]+$/.test(name) || name.includes("..")) throw fail("Der Transfer besitzt keinen gebundenen entfernten Git-Zweig.");
    return name;
  }
  async function hasDurablePushEvidence(publication) {
    if (!publication?.upstreamRef || !/^refs\/remotes\/[\w./-]+$/.test(publication.upstreamRef)
        || publication.upstreamRef.includes("..") || !Number.isFinite(Date.parse(publication.preparedAt))) return false;
    // Git records successful pushes itself. This closes the crash window
    // between push completion and our receipt write without guessing from HEAD.
    let log;
    try { log = (await readGit(["reflog", "show", "-n", "20", "--date=unix", "--format=%H%x00%gs%x00%gD", publication.upstreamRef])).toString("utf8"); }
    catch { return false; }
    return log.split(/\r?\n/).some((line) => {
      const [commit, action, selector] = line.split("\0");
      const timestamp = /@\{(\d+)\}/.exec(selector ?? "")?.[1];
      return commit === publication.commitId && action === "update by push"
        && Number(timestamp) >= Math.floor(Date.parse(publication.preparedAt) / 1000);
    });
  }
  async function committedView(job, commitId, cache = new Map()) {
    const names = [...JSON_FILES.filter((name) => name !== "species-taxonomy-overrides.json"), MAP_DOC];
    const tree = (await readGit(["ls-tree", "-r", "-z", commitId, "--", ...names,
      `species-assets/${job.safeName}/`])).toString("utf8");
    const blobs = new Map();
    for (const item of tree.split("\0").filter(Boolean)) {
      const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/.exec(item);
      if (!match) throw fail("Verknüpfte oder unbekannte veröffentlichte Artdatei verhindert den Auftragsabschluss.");
      const [, , hash, name] = match;
      if (!cache.has(hash)) cache.set(hash, await readGit(["cat-file", "blob", hash]));
      blobs.set(name, cache.get(hash));
    }
    const files = {};
    for (const name of names.filter((name) => name !== MAP_DOC)) {
      files[name] = blobs.has(name) ? ownJsonView(name, JSON.parse(blobs.get(name).toString("utf8")), job) : null;
    }
    const prefix = `species-assets/${job.safeName}/`;
    return { files, mapRows: mapRows(blobs.get(MAP_DOC)?.toString("utf8") ?? null, job),
      assets: Object.fromEntries([...blobs].filter(([name]) => name.startsWith(prefix))
        .map(([name, bytes]) => [name.slice(prefix.length), digest(bytes)])) };
  }
  async function assertCommitted(job, commitId, cache) {
    const committed = await committedView(job, commitId, cache);
    const expected = { files: Object.fromEntries(Object.entries(job.expected.files)
      .filter(([name]) => name !== "species-taxonomy-overrides.json")), mapRows: job.expected.mapRows,
    assets: job.expected.assets };
    if (canonical(committed) !== canonical(expected)) throw fail("Der Git-Stand enthält nicht genau die gebundenen Artdaten und Medien. Der Rücknahmesatz bleibt geschützt.");
  }
  async function closePublished(job) {
    if (!job.publication?.confirmedAt || job.publication.revision !== publicationRevision(job.expected)) {
      throw fail("Der erfolgreiche Transfer besitzt keinen passenden Abschlussnachweis. Der Rücknahmesatz bleibt geschützt.");
    }
    await assertCommitted(job, job.publication.commitId);
    // Keep a small historical receipt, not full duplicate JSON/media baselines.
    await save({ schemaVersion: 1, owner: "species-creation", id: job.id, slug: job.slug,
      germanName: job.germanName, status: "published", publication: job.publication });
    return job.id;
  }
  async function recoverPublications() {
    const closedIds = [];
    for (const job of await all()) {
      if (!ended(job) && job.publication
          && (job.publication.confirmedAt || await hasDurablePushEvidence(job.publication))) {
        closedIds.push(await locked(job.id, async () => {
          const current = await load(job.id);
          if (current.status === "published") return current.id;
          if (current.abortRequested || current.publication?.revision !== publicationRevision(current.expected)) throw fail("Der Transfernachweis passt nicht zum gespeicherten Artauftrag.");
          if (!current.publication.confirmedAt) {
            if (!await hasDurablePushEvidence(current.publication)) throw fail("Der erfolgreiche Transfer kann nicht mehr nachgewiesen werden.");
            await assertCommitted(current, current.publication.commitId);
            current.publication.confirmedAt = new Date().toISOString();
            current.publication.recoveredFromPushLog = true;
            await save(current);
          }
          return closePublished(current);
        }));
      }
    }
    return { closedIds };
  }
  async function preparePublication({ runId, onlyPrepared = false } = {}) {
    await recoverPublications();
    const jobs = (await all()).filter((job) => !ended(job) && !job.abortRequested
      && (!onlyPrepared || job.publication?.commitId));
    if (!jobs.length) return { commitId: "", preparedIds: [], heldIds: [] };
    if (!runId) throw fail("Veröffentlichung besitzt keinen gebundenen Lauf.");
    const commitId = await currentCommit(), targetRef = await upstreamRef(), preparedIds = [], heldIds = [], cache = new Map();
    for (const item of jobs) {
      await locked(item.id, async () => {
        const job = await load(item.id);
        if (ended(job) || job.abortRequested) { heldIds.push(item.id); return; }
        try {
          if (onlyPrepared && job.publication.commitId !== commitId) throw fail("Der vorgemerkte Transfer gehört zu einem anderen Git-Stand.");
          if (publicationRevision(await receipt(job)) !== publicationRevision(job.expected)) throw fail("Eigene Artdaten wurden verändert.");
          await assertCommitted(job, commitId, cache);
        } catch (error) { if (error.statusCode !== 409) throw error; heldIds.push(job.id); return; }
        job.publicationStarted = true;
        job.publication = { commitId, runId, upstreamRef: targetRef, revision: publicationRevision(job.expected), preparedAt: new Date().toISOString() };
        await save(job);
        preparedIds.push(job.id);
      });
    }
    return { commitId, runId, preparedIds, heldIds };
  }
  async function confirmPublication(plan, { pushExitCode } = {}) {
    if (!plan?.preparedIds?.length) return { closedIds: [] };
    if (pushExitCode !== 0 || await currentCommit() !== plan.commitId) throw fail("Übertragung nicht bestätigt. Artanlage und Rücknahmesatz bleiben geschützt.");
    const upstream = await upstreamRef();
    const pushedCommit = (await readGit(["rev-parse", "--verify", "@{upstream}"])).toString("utf8").trim();
    if (!upstream.startsWith("refs/remotes/") || pushedCommit !== plan.commitId) throw fail("Der erfolgreiche Push bestätigt nicht den gebundenen Zielstand. Artanlage und Rücknahmesatz bleiben geschützt.");
    const closedIds = [];
    for (const id of plan.preparedIds) {
      closedIds.push(await locked(id, async () => {
        const job = await load(id);
        if (job.status === "published" && job.publication.commitId === plan.commitId && job.publication.runId === plan.runId) return id;
        if (ended(job) || job.abortRequested || job.publication?.commitId !== plan.commitId
            || job.publication.runId !== plan.runId || job.publication.upstreamRef !== upstream
            || job.publication.revision !== publicationRevision(job.expected)
            || job.publication.revision !== publicationRevision(await receipt(job))) throw fail("Der gebundene Artauftrag wurde verändert. Abschluss wurde angehalten.");
        job.publication.confirmedAt = new Date().toISOString();
        // Persist the push evidence first so restart can finish a failed final receipt write.
        await save(job);
        return closePublished(job);
      }));
    }
    return { closedIds };
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
    if (ended(job) || job.status === "aborting") throw fail("Diese Artanlage wurde bereits abgeschlossen, abgebrochen oder separat gelöscht.");
    if (publicationStarted && job.abortRequested) throw fail("Abbruch wurde bereits angefordert. Die Veröffentlichung wird nicht gestartet.");
    const next = await receipt(job);
    if (job.publication) {
      if (publicationRevision(next) !== job.publication.revision) throw fail("Der gebundene Veröffentlichungsstand wurde verändert. Rücknahmesatz bleibt geschützt.");
      return;
    }
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
    return (await all()).find((job) => job.slug === slug && !ended(job)) ?? null;
  }
  async function list() {
    const fingerprint = await gitFingerprint();
    return (await all()).filter((job) => !ended(job)).map((job) => ({ id: job.id,
      slug: job.slug, germanName: job.germanName, runId: job.runId ?? "", createdAt: job.createdAt,
      canAbort: !job.publicationStarted && job.gitFingerprint === fingerprint,
      publicationStarted: job.publicationStarted === true,
      transferPending: Boolean(job.publication && !job.publication.confirmedAt),
      publicationCommitId: job.publication?.commitId ?? "",
      abortRequested: job.abortRequested === true,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function backupRetentionProtection() {
    // A started publication is not a confirmed successful completion. Keep
    // its recovery files until the ownership receipt has been closed too.
    const jobs = (await all()).filter((job) => !ended(job));
    return {
      backupPaths: jobs.map((job) => job.backupPath),
      safeNames: jobs.map((job) => job.safeName),
      assetBackupReceipts: jobs.map((job) => ({ safeName: job.safeName, files: job.expected?.backupAssets ?? {} })),
    };
  }
  async function requestAbort(id) {
    const job = await load(id);
    if (job.status === "aborted") return { alreadyAborted: true };
    if (job.status === "published") throw fail("Diese Artanlage wurde erfolgreich übertragen. Sie kann nicht mehr als neue Art abgebrochen werden.");
    if (job.status === "detached") throw fail("Dieser Artanlage-Auftrag wurde durch eine separate Artlöschung beendet.");
    if (job.publicationStarted || job.gitFingerprint !== await gitFingerprint()) throw fail("Die Veröffentlichung hat bereits begonnen oder der Git-Stand wurde geändert. Diese Artanlage kann nicht mehr automatisch abgebrochen werden.");
    job.abortRequested = true;
    await save(job);
    return { pending: true, id, slug: job.slug, runId: job.runId ?? "" };
  }
  async function isAbortRequested(id) { return id ? (await load(id)).abortRequested === true : false; }
  async function assertActive(id, slug, { allowAbortRequested = false } = {}) {
    const job = await load(id);
    if (job.slug !== slug || ended(job) || job.status === "aborting"
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
    if (job.status === "published") throw fail("Diese Artanlage wurde erfolgreich übertragen. Bestehende Artdaten bleiben erhalten.");
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
    if (job.status === "published") throw fail("Diese Artanlage besitzt bereits eine unveränderliche Abschlussquittung.");
    await save({ schemaVersion: 1, owner: "species-creation", id, slug: job.slug, status: "detached", endedAt: new Date().toISOString() });
  }
  return { begin,
    checkpoint: (id, options) => id ? locked(id, () => checkpoint(id, options)) : Promise.resolve(),
    findBySlug, list, backupRetentionProtection, preparePublication, confirmPublication, recoverPublications,
    abort: (id) => locked(id, () => abort(id)),
    requestAbort: (id) => locked(id, () => requestAbort(id)),
    detach: (id) => locked(id, () => detach(id)),
    isAbortRequested, assertActive, assertCurrent };
}
