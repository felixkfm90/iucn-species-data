import fs from "node:fs/promises";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertTestTempPath, tmpdir } from "../../scripts/test-temp.mjs";
import { createEditableFixture } from "../server-test-fixtures.mjs";
import { importTaxonomyPrototype } from "../taxonomy-import.mjs";
import { createTaxonomyReferenceService } from "../taxonomy-reference-service.mjs";
import { createTaxonomyMasterService } from "../taxonomy-master-service.mjs";
import { createTaxonomyMaintenanceService } from "../taxonomy-maintenance-service.mjs";
import { activateTaxonomyMasterCandidate } from "../taxonomy-master-lifecycle.mjs";
import { inspectLightroomSearchPackages, sha256File } from "../lightroom-search-storage.mjs";
import { atomicWriteJson } from "../taxonomy-storage.mjs";
import { inspectWebp } from "../media-assets.mjs";
import { verifyLightroomSearchPackage } from "../lightroom-search-package.mjs";
import { publishTaxonomyPair } from "../taxonomy-publication.mjs";
import { readTaxonomyPublication } from "../taxonomy-publication-storage.mjs";
import { captureCatalogUsage, catalogUsageStatus, createCatalogUsageService } from "../lightroom-catalog-usage.mjs";
import { loadLocalDeviceProfile } from "../desktop/device-profile.mjs";
import { createUpdateCompletionProofReader } from "./proof.mjs";

const execute = promisify(execFile);
const SOURCE_FIXTURE = fileURLToPath(new URL("../../scripts/fixtures/taxonomy/col-xr-2026-07-17/", import.meta.url));
const activeServers = new WeakSet();
const relativePaths = Object.freeze({ dataRoot: "data", taxonomyRoot: "data/taxonomy", searchRoot: "data/lightroom",
  profileRoot: "profile", stateRoot: "profile/update-completion", evidenceRoot: "evidence", catalogPath: "empty.lrcat",
  nasRoot: "unused-backup-target", gitConfig: "empty-git-config", gitTemplate: "empty-git-template" });
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function writeOwnQualificationPortrait(fixture) {
  // Fixed, real 1x1 WebP test input, explicitly NOT an approved biological depiction.
  // Unlike the generic edit fixture, a normal desktop bootstrap requires a complete asset set.
  const image = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
  const dimensions = inspectWebp(image);
  if (dimensions.width !== 1 || dimensions.height !== 1) throw new Error("Ungültige eigene Testgrafik.");
  const imagePath = assertTestTempPath(path.join(fixture.repoRoot, "species-assets", "Amsel", "portrait.webp"));
  const metadataPath = assertTestTempPath(path.join(path.dirname(imagePath), "portrait.json"));
  await fs.writeFile(imagePath, image, { flag: "wx" });
  const sha256 = await sha256File(imagePath);
  await atomicWriteJson(metadataPath, { version: 1, type: "synthetic qualification pixel", source: "Eigene isolierte Testfixture",
    purpose: "Abschlussprüfung; keine freigegebene Artdarstellung", product_width: 1, product_height: 1,
    product_format: "webp", sha256 });
  await atomicWriteJson(assertTestTempPath(path.join(fixture.repoRoot, "species-assets-overrides.json")), {
    version: 1, assets: { Amsel: { portrait: { source: "Eigene isolierte Testfixture", sha256,
      metadataSha256: await sha256File(metadataPath) } } },
  });
}

/** Synchronous reservation lets Electron set its isolated userData BEFORE its ready event. */
export function reserveQualificationWorkspace() {
  const repoRoot = assertTestTempPath(mkdtempSync(path.join(tmpdir(), "ucq-")));
  const fixture = { repoRoot, ownerPid: process.pid, nonce: randomUUID() };
  for (const [key, relative] of Object.entries(relativePaths)) fixture[key] = assertTestTempPath(path.join(repoRoot, relative));
  for (const key of ["dataRoot", "profileRoot", "evidenceRoot", "gitTemplate"]) mkdirSync(fixture[key], { recursive: true });
  writeFileSync(path.join(repoRoot, "qualification.json"), json({ schemaVersion: 1, purpose: "isolated-update-completion", ...fixture }), { flag: "wx" });
  return Object.freeze(fixture);
}

/** No arbitrary destination: optional reservation must be owned by this process. */
export async function createQualificationWorkspace(reservation = reserveQualificationWorkspace()) {
  assertQualificationFixture(reservation);
  const fixture = { ...reservation }, repoRoot = fixture.repoRoot;
  // Reuse the existing input generator; copy only its newly created synthetic files.
  const generated = assertTestTempPath(await createEditableFixture());
  try {
    for (const name of await fs.readdir(generated)) {
      await fs.cp(path.join(generated, name), path.join(repoRoot, name), { recursive: true, errorOnExist: true, force: false });
    }
  }
  finally { await fs.rm(assertTestTempPath(generated), { recursive: true, force: true }); }
  await Promise.all([
    fs.writeFile(fixture.gitConfig, "", { flag: "wx" }),
    fs.writeFile(fixture.catalogPath, "Isolated empty catalogue fixture. No photos and no Lightroom database.\n", { flag: "wx" }),
    fs.writeFile(path.join(repoRoot, "taxonomy-reference-corrections.json"), json({ schemaVersion: 1, entries: [] }), { flag: "wx" }),
    fs.writeFile(path.join(repoRoot, ".gitignore"), "data/\nprofile/\nevidence/\nempty.lrcat\nempty-git-*\nqualification.json\nunused-backup-target/\ntemp/\nspecies-explorer/\n", { flag: "wx" }),
  ]);
  await writeOwnQualificationPortrait(fixture);
  fixture.device = await loadLocalDeviceProfile(fixture.profileRoot, { deviceName: "Isolierter Abschluss-Prüfexplorer" });
  return Object.freeze(fixture);
}

/** Synchronous checks are also used directly at the suppressed native-call boundary. */
export function assertQualificationFixture(fixture) {
  const root = assertTestTempPath(fixture?.repoRoot || "");
  const saved = JSON.parse(readFileSync(assertTestTempPath(path.join(root, "qualification.json")), "utf8"));
  if (saved.schemaVersion !== 1 || saved.purpose !== "isolated-update-completion" || saved.repoRoot !== root
    || saved.ownerPid !== process.pid || fixture.ownerPid !== process.pid || saved.nonce !== fixture.nonce) {
    throw new Error("Diese Abschlusssitzung gehört nicht zum aktuellen Prüfprozess.");
  }
  for (const [key, relative] of Object.entries(relativePaths)) {
    if (fixture[key] !== assertTestTempPath(path.join(root, relative)) || saved[key] !== fixture[key]) {
      throw new Error("Ein Prüfpfad verlässt seine feste eigene Sitzung.");
    }
  }
  return fixture;
}

export function qualificationEnvironment(fixture, environment = process.env) {
  assertQualificationFixture(fixture);
  const isolated = { ...environment };
  // Never inherit a caller's GIT_DIR, worktree, command config or global hooks.
  for (const key of Object.keys(isolated)) if (/^GIT_/i.test(key)) delete isolated[key];
  return { ...isolated, FN_EXPLORER_DATA_ROOT: fixture.dataRoot, IUCN_TAXONOMY_DIR: fixture.taxonomyRoot,
    FN_LIGHTROOM_SEARCH_ROOT: fixture.searchRoot, IUCN_NAS_BACKUP_DIR: fixture.nasRoot,
    GIT_CONFIG_GLOBAL: fixture.gitConfig, GIT_CONFIG_SYSTEM: fixture.gitConfig, GIT_CONFIG_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: path.dirname(fixture.repoRoot) };
}

/** Only for this dedicated qualification process; callers must not run concurrent environments. */
export function installQualificationEnvironment(fixture) {
  const previous = { ...process.env }, next = qualificationEnvironment(fixture);
  for (const key of Object.keys(process.env)) if (!(key in next)) delete process.env[key];
  Object.assign(process.env, next);
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  };
}

async function initializeOwnGit(fixture) {
  const env = qualificationEnvironment(fixture);
  const git = (args) => execute("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", "-c",
    `core.hooksPath=${fixture.gitTemplate}`, ...args], { cwd: fixture.repoRoot, env, windowsHide: true, timeout: 10000 });
  await git(["init", `--template=${fixture.gitTemplate}`, "--initial-branch=qualification"]);
  await git(["add", "--", ".gitignore", "species_list.json", "speciesData.json", "fehlende_elemente_report.json",
    "taxonomy-reference-corrections.json", "species-assets-overrides.json", "docs/manual-map-overrides.md", "species-assets"]);
  await git(["-c", "user.name=Isolated qualification", "-c", "user.email=qualification@example.invalid", "commit", "--quiet", "-m", "Isolated tiny qualification baseline"]);
  const { stdout } = await git(["status", "--porcelain"]);
  if (stdout.trim()) throw new Error("Die eigene Prüfgrundlage ist nicht sauber gespeichert.");
}

function createReaders(fixture) {
  const reference = createTaxonomyReferenceService({ taxonomyRoot: fixture.taxonomyRoot });
  const master = createTaxonomyMasterService({ taxonomyRoot: fixture.taxonomyRoot, referenceService: reference,
    speciesListPath: path.join(fixture.repoRoot, "species_list.json"),
    correctionsPath: path.join(fixture.repoRoot, "taxonomy-reference-corrections.json"),
    lightroomSearchRoot: fixture.searchRoot, inspectLightroomPackages: () => inspectLightroomSearchPackages(fixture.searchRoot) });
  return { reference, master };
}

/** Real bounded import + one project species, no provider refresh or protected input. */
export async function prepareQualificationTaxonomy(fixture, { withSearchPackage = false } = {}) {
  assertQualificationFixture(fixture);
  if (typeof withSearchPackage !== "boolean") throw new Error("Die kleine Paketvorbereitung benötigt eine eindeutige Auswahl.");
  const species = JSON.parse(await fs.readFile(path.join(fixture.repoRoot, "species_list.json"), "utf8"));
  if (!Array.isArray(species) || species.length !== 1 || species[0]?.genus !== "Turdus" || species[0]?.species !== "merula") {
    throw new Error("Die Abschlussprobe ist ausschließlich auf ihre eine synthetische Amsel begrenzt.");
  }
  const restore = installQualificationEnvironment(fixture);
  let readers;
  try {
    const imported = await importTaxonomyPrototype({ fixtureDirectory: SOURCE_FIXTURE, taxonomyRoot: fixture.taxonomyRoot });
    readers = createReaders(fixture);
    await readers.master.startBuild({ refreshProviders: false });
    await readers.master.runPromise;
    const built = await readers.master.status();
    if (built.status !== "ready" || built.lifecycle?.candidate?.summary?.taxa !== 1) {
      throw new Error(built.error || "Der kleine echte Master wurde nicht genau für eine Art fertig.");
    }
    await activateTaxonomyMasterCandidate(fixture.taxonomyRoot, { confirmed: true });
    readers.reference.reset();
    if (withSearchPackage) await publishTaxonomyPair({ taxonomyRoot: fixture.taxonomyRoot, searchRoot: fixture.searchRoot,
      sourceSlot: "active", confirmed: true });
    // A truthful empty, unchanged file belonging only to this fixture. No SDK claim about a real catalogue.
    await captureCatalogUsage(fixture.taxonomyRoot, { catalogPath: fixture.catalogPath, totalPhotos: 0, usedTaxa: [], complete: true, passes: 2 });
    const usage = createCatalogUsageService({ taxonomyRoot: fixture.taxonomyRoot });
    const preview = await usage.catalogUsagePreview();
    await usage.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
    // Ordinary startup cache, explicitly describing this bounded input, avoids an unsolicited network check.
    await fs.writeFile(path.join(fixture.taxonomyRoot, "release-check.json"), json({ schemaVersion: 1,
      checkedAt: new Date().toISOString(), latest: { ...imported.manifest.source, releaseId: imported.releaseId }, cached: true }));
    await initializeOwnGit(fixture);
    return await readQualificationState(fixture);
  } finally {
    await readers?.master.close();
    readers?.reference.close();
    restore();
  }
}

/** Reopens actual read services; does not substitute an invented success snapshot. */
export async function readQualificationState(fixture) {
  assertQualificationFixture(fixture);
  const readers = createReaders(fixture);
  const maintenance = createTaxonomyMaintenanceService({ taxonomyRoot: fixture.taxonomyRoot, repoRoot: fixture.repoRoot,
    referenceService: readers.reference, speciesListPath: path.join(fixture.repoRoot, "species_list.json"),
    mappingsPath: path.join(fixture.repoRoot, "species-reference-mappings.json") });
  try {
    const [master, usage, result] = await Promise.all([readers.master.status(), catalogUsageStatus(fixture.taxonomyRoot, { full: true }),
      createUpdateCompletionProofReader({ taxonomyRoot: fixture.taxonomyRoot, masterService: readers.master, maintenanceService: maintenance }).read()]);
    const publication = readTaxonomyPublication(fixture.taxonomyRoot);
    const packageVerification = master.lightroomPackage?.status === "current"
      ? await verifyLightroomSearchPackage({ searchRoot: fixture.searchRoot }) : null;
    return { master, usage, publication, packageVerification, ...result };
  } finally { await maintenance.close(); await readers.master.close(); readers.reference.close(); }
}

export function markQualificationServerActive(fixture, active) {
  assertQualificationFixture(fixture);
  if (active) activeServers.add(fixture); else activeServers.delete(fixture);
}

export async function removeQualificationFixture(fixture) {
  assertQualificationFixture(fixture);
  if (activeServers.has(fixture)) throw new Error("Der eigene Prüfserver muss vor der Bereinigung regulär beendet sein.");
  await fs.rm(assertTestTempPath(fixture.repoRoot), { recursive: true, force: true, maxRetries: 6, retryDelay: 80 });
}
