import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { assertTestTempPath, closeEmptyTestTempSession, tmpdir } from "../scripts/test-temp.mjs";
import { languageRuntimeRoot, languageRuntimeTree, noLanguageLinks } from "../species-explorer/language-check/runtime.mjs";
import { PRODUCT_ID, readPackage, safeRelative } from "./install-engine.mjs";
import { collectMingitSources } from "./mingit-sources.mjs";

const installerRoot = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const provenance = path.join(repoRoot, "data/website/checks/installer-provenance-20261031");
const pinned = JSON.parse(await fs.readFile(new URL("./dependencies.lock.json", import.meta.url), "utf8"));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { input = "", ...spawnOptions } = options;
    const child = spawn(command, args, { cwd: repoRoot, windowsHide: true, ...spawnOptions });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(error); });
    child.stdin.end(input);
    child.on("close", (code) => code === 0 ? resolve(stdout.trimEnd()) : reject(new Error(`${command}: ${stderr || stdout}`)));
  });
}

async function hash(filename) {
  const digest = crypto.createHash("sha256"), stream = await fs.open(filename, "r");
  try { for await (const chunk of stream.createReadStream()) digest.update(chunk); }
  finally { await stream.close(); }
  return digest.digest("hex");
}

async function copy(source, target) {
  if ((await fs.lstat(source)).isSymbolicLink()) throw new Error(`Verknüpfung wird nicht paketiert: ${source}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
}

async function download(pin, target) {
  process.stdout.write(`Offizieller Bezug: ${pin.url}\n`);
  const response = await fetch(pin.url, { signal: AbortSignal.timeout(180_000) }).catch((error) => {
    throw new Error(`Download fehlgeschlagen: ${pin.url} (${error.cause?.code || error.message})`, { cause: error });
  });
  if (!response.ok || !response.body) throw new Error(`Download HTTP ${response.status}`);
  let bytes = 0;
  async function* limited() {
    for await (const chunk of Readable.fromWeb(response.body)) {
      bytes += chunk.length;
      if (bytes > pin.bytes) throw new Error("Download überschreitet gebundene Größe.");
      yield chunk;
    }
  }
  await pipeline(limited(), createWriteStream(target, { flags: "wx" }));
  if (bytes !== pin.bytes || await hash(target) !== pin.sha256) throw new Error("Offizieller Download stimmt nicht mit der gebundenen Prüfsumme überein.");
}

async function copyCachedLanguageArchive(pin, target) {
  const filename = path.basename(new URL(pin.url).pathname);
  const source = path.join(path.dirname(languageRuntimeRoot(repoRoot)), "downloads", filename);
  const info = await fs.lstat(source).catch((error) => { if (error.code !== "ENOENT") throw error; });
  if (!info) return false;
  await noLanguageLinks(source);
  if (!info.isFile() || info.size !== pin.bytes) throw new Error("Das lokale LanguageTool-Archiv hat eine abweichende Größe.");
  await copy(source, target);
  if ((await fs.stat(target)).size !== pin.bytes || await hash(target) !== pin.sha256) {
    throw new Error("Das lokale LanguageTool-Archiv stimmt nicht mit der gebundenen Prüfsumme überein.");
  }
  process.stdout.write(`Gebundenes lokales Originalarchiv: ${filename}\n`);
  return true;
}

async function filesUnder(directory) {
  const output = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Verknüpfung wird nicht paketiert: ${absolute}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) output.push(absolute);
      else throw new Error(`Unbekannter Dateityp: ${absolute}`);
    }
  }
  await walk(directory);
  return output.sort();
}

export function packageKind(relative) {
  if (relative.startsWith("workspace/.git/") || relative.startsWith("workspace/species-assets/")
    || /^workspace\/(?:species_list|speciesData|species-reference-mappings|species-assets-overrides|species-taxonomy-overrides|lastSavedAssessmentId|fehlende_elemente_report)\.json$/.test(relative)
    || relative === "workspace/docs/manual-map-overrides.md") return "seed";
  return "program";
}

export function sourceAllowed(relative) {
  if (["mobile/assets/catalog.json", "mobile/assets/catalog-manifest.json"].includes(relative)) return true;
  if (!relative || relative.includes("\\") || relative.split("/").some((part) => part === ".." || part === ".env" || part.startsWith(".env."))) return false;
  if (/^(?:data|Daten|temp|node_modules|local-tools|installer|\.git)(?:\/|$)/.test(relative)
    || /(?:^|\/)(?:taxonomy-data|staging|logs|backups|asset-backups|pipeline-asset-backups|creation-sessions|cleanup-trash|test-results|test-temp)(?:\/|$)/.test(relative)
    || /\.(?:sqlite|db)(?:[-.]|$)/i.test(relative) || /(?:^|\/)(?:storage-path|local-settings|pending-asset-review)\.json$/.test(relative)) return false;
  return /^(?:species-explorer|scripts|lightroom-plugin|docs|species-assets|graphics)\//.test(relative)
    || !relative.includes("/") && /\.(?:mjs|js|json|css|html|md|cmd|svg)$/.test(relative) || relative === ".gitignore";
}

export function packageIdentity({ revision, preview = false, sourceBindings, installerSourceBindings, compilerSha256 }) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision || "") || typeof preview !== "boolean"
      || !/^[a-f0-9]{64}$/.test(compilerSha256 || "")) throw new Error("Paketkennung benötigt gebundene Quellen und Compiler.");
  const bindings = (values) => {
    if (!Array.isArray(values) || !values.length) throw new Error("Paketkennung benötigt vollständige Quellbindungen.");
    const seen = new Set();
    return values.map((item) => {
      const name = safeRelative(item?.path);
      if (seen.has(name.toLowerCase()) || !/^[a-f0-9]{64}$/.test(item.sha256 || "")) throw new Error("Quellbindungen sind mehrdeutig oder unvollständig.");
      seen.add(name.toLowerCase()); return { path: name, sha256: item.sha256 };
    }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  };
  const sourceSnapshotSha256 = crypto.createHash("sha256").update(JSON.stringify({ revision,
    sourceBindings: bindings(sourceBindings), installerSourceBindings: bindings(installerSourceBindings), compilerSha256 })).digest("hex");
  return { sourceSnapshotSha256, packageId: `0.1.0-${revision.slice(0, 12)}${preview ? `-${sourceSnapshotSha256.slice(0, 16)}-preview` : ""}` };
}

export async function stageFfmpeg(provenance, workspace, pin = pinned.ffmpeg) {
  const sourceRoot = path.join(provenance, safeRelative(pin.evidenceDirectory));
  const targetRoot = path.join(workspace, "local-tools/ffmpeg");
  const files = [];
  for (const [relative, [source, sha256]] of Object.entries(pin.files)) {
    const target = path.join(targetRoot, safeRelative(relative));
    await copy(path.join(sourceRoot, safeRelative(source)), target);
    if (await hash(target) !== sha256) throw new Error(`FFmpeg-Beilage stimmt nicht mit dem gebundenen Prüfstand überein: ${relative}`);
    files.push({ path: relative, sha256 });
  }
  await fs.writeFile(path.join(targetRoot, "README.txt"),
    `Arten-Explorer - Windows-Prüfbau von FFmpeg und FFprobe ${pin.version}\r\n\r\n`
    + `FFmpeg-Quellstand: ${pin.source}\r\nGPLv3-Lizenz: LICENSE.txt. Weitere Lizenztexte: licenses/.\r\n`
    + "Die Quellarchive und Buildskripte liegen unter sources/.\r\n"
    + "Die Buildskripte verwenden MSYS2 UCRT64 mit den festgehaltenen Paketversionen.\r\n"
    + "Zuerst LAME aus dem Basisarchiv bauen, danach FFmpeg mit diesem LAME, WebP und zlib.\r\n"
    + "Die in toolchain-packages.txt aufgeführte LAME-Version 4.0 war ein Vorversuch.\r\n"
    + "Die Quellen der Compilerlaufzeiten sind separat nachgewiesen. Archivnamen und Prüfsummen:\r\n"
    + "sources/compiler-runtime-source-bindings.json. Bezug: https://repo.msys2.org/mingw/sources/\r\n",
    { flag: "wx" });
  return { version: pin.version, source: pin.source, files };
}

async function readCompanionSetup(reportPath) {
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const { packageId, revision, preview } = report;
  if (report.productId !== PRODUCT_ID || report.schemaVersion !== 1 || report.passed !== true
    || !/^0\.1\.0-[a-f0-9]{12}(?:-[a-f0-9]{16}-preview)?$/.test(packageId || "")) {
    throw new Error("Der Baunachweis gehört nicht zu einem bestätigten Arten-Explorer-Setup.");
  }
  const executableName = `Arten-Explorer-Setup-${packageId}-x64.exe`;
  const executable = path.join(path.dirname(reportPath), executableName);
  const manifestPath = path.join(path.dirname(reportPath), `${packageId}-manifest.json`);
  const manifestBytes = await fs.readFile(manifestPath);
  const manifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex");
  if (manifestSha256 !== report.manifest?.sha256) throw new Error("Das Dateimanifest stimmt nicht mit dem Baunachweis überein.");
  const manifest = JSON.parse(manifestBytes);
  if (manifest.productId !== PRODUCT_ID || manifest.packageId !== packageId || manifest.revision !== revision
    || manifest.preview !== preview || manifest.files.length !== report.manifest.files) {
    throw new Error("Das Dateimanifest gehört zu einem anderen Installer.");
  }
  const executableInfo = await fs.lstat(executable);
  if (!executableInfo.isFile() || executableInfo.size !== report.executable?.bytes
    || await hash(executable) !== report.executable.sha256) throw new Error("Die Setup-Datei stimmt nicht mit dem Baunachweis überein.");
  const setup = { name: executableName, bytes: executableInfo.size, sha256: report.executable.sha256, manifestSha256 };
  return { report, manifest, receipt: { schemaVersion: 1, productId: PRODUCT_ID, packageId, revision, preview, setup } };
}

async function copyBoundSourceFile(sourceRoot, target, relative, source, expected) {
  const file = path.join(target, safeRelative(relative));
  await copy(path.join(sourceRoot, safeRelative(source)), file);
  if (await hash(file) !== expected) throw new Error(`Quellbeilage stimmt nicht überein: ${relative}`);
  return { path: relative, bytes: (await fs.stat(file)).size, sha256: expected };
}

export async function stageFfmpegCompanion({ reportPath, provenanceRoot, target, pin = pinned.ffmpeg }) {
  const { report, manifest, receipt } = await readCompanionSetup(reportPath);
  if (report.ffmpeg?.version !== pin.version || report.ffmpeg?.source !== pin.source) throw new Error("Der Baunachweis gehört nicht zum gebundenen FFmpeg-Prüfbau.");
  const prefix = "workspace/local-tools/ffmpeg/";
  const ffmpegEntries = manifest.files.filter(entry => entry.path.startsWith(prefix));
  const ffmpegHashes = new Map(ffmpegEntries.map(entry => [entry.path.slice(prefix.length), entry.sha256]));
  if (ffmpegHashes.size !== ffmpegEntries.length || Object.entries(pin.files).some(([file, [, expected]]) => ffmpegHashes.get(file) !== expected)) {
    throw new Error("Die gebundenen FFmpeg-Dateien weichen im Installermanifest ab.");
  }

  const sourceRoot = path.join(provenanceRoot, safeRelative(pin.evidenceDirectory));
  const files = [];
  async function add(relative, source, expected) {
    files.push(await copyBoundSourceFile(sourceRoot, target, relative, source, expected));
  }
  for (const [relative, [source, expected]] of Object.entries(pin.files)) {
    if (!relative.startsWith("bin/")) await add(relative, source, expected);
  }
  const runtime = JSON.parse(await fs.readFile(path.join(target, "sources/compiler-runtime-source-bindings.json"), "utf8"));
  if (runtime.results.map(entry => entry.component).sort().join(",") !== "crt,gcc,winpthreads") {
    throw new Error("Der Nachweis für die drei Compilerlaufzeiten ist unvollständig.");
  }
  for (const entry of runtime.results) {
    await add(`sources/${entry.source}`, entry.source, entry.sourceSha256);
    await add(`sources/${entry.source}.sig`, `${entry.source}.sig`, entry.signatureSha256);
  }
  const instructions = `Arten-Explorer: Quellen zum Windows-Prüfbau von FFmpeg und FFprobe ${pin.version}\n\n`
    + `Zugehöriges Setup: ${receipt.setup.name}\nSHA-256: ${receipt.setup.sha256}\n\n`
    + "Die Lizenztexte liegen in LICENSE.txt und licenses/. sources/ enthält die Quellarchive, die Signaturen der MSYS2-Archive, die Rezepte und die gebundenen Paketversionen.\n"
    + "In MSYS2 UCRT64 zuerst LAME 3.100 mit build-static-lame.sh bauen. Danach FFmpeg mit build-with-static-lame.sh gegen dieses LAME, WebP und zlib bauen. Beide Skripte geben ihre Argumente ohne Parameter aus.\n"
    + "toolchain-packages.txt dokumentiert den Bauumgebungsstand. Das dort genannte LAME 4.0 war ein Vorversuch. compiler-runtime-source-bindings.json und linked-msys2-library-sources.json ordnen die Archive den eingesetzten Paketen zu.\n";
  await fs.writeFile(path.join(target, "README.txt"), instructions, { flag: "wx" });
  files.push({ path: "README.txt", bytes: Buffer.byteLength(instructions), sha256: crypto.createHash("sha256").update(instructions).digest("hex") });
  receipt.ffmpeg = { version: pin.version, source: pin.source, executables: ["bin/ffmpeg.exe", "bin/ffprobe.exe"]
    .map(file => ({ file, sha256: ffmpegHashes.get(file) })) };
  receipt.files = files;
  await fs.writeFile(path.join(target, "source-manifest.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return receipt;
}

async function stageMingitCompanion({ reportPath, provenanceRoot, target }) {
  const { report, manifest, receipt } = await readCompanionSetup(reportPath);
  const pin = pinned.git;
  if (!report.downloads?.some(entry => entry.url === pin.url && entry.version === pin.version
    && entry.bytes === pin.bytes && entry.sha256 === pin.sha256)) throw new Error("Der Baunachweis enthält einen anderen MinGit-Bezug.");
  const sourceRoot = path.join(provenanceRoot, safeRelative(pin.sourceCompanion.evidenceDirectory));
  const staged = new Map();
  async function add({ path: relative, sha256 }) {
    if (!staged.has(relative)) staged.set(relative, await copyBoundSourceFile(sourceRoot, target, relative, relative, sha256));
    if (staged.get(relative).sha256 !== sha256) throw new Error(`MinGit-Quellbeilage ist widersprüchlich: ${relative}`);
  }
  for (const [relative, sha256] of Object.entries(pin.sourceCompanion.evidence)) await add({ path: relative, sha256 });
  const installedFiles = manifest.files.filter(entry => entry.path.startsWith("workspace/runtime/git/"));
  const sources = await collectMingitSources({ installedFiles, pin, readEvidence: async relative => {
    if (!staged.has(relative)) throw new Error(`MinGit-Herkunftsnachweis fehlt: ${relative}`);
    return JSON.parse(await fs.readFile(path.join(target, relative), "utf8"));
  } });
  for (const archive of sources.archives) {
    await add(archive);
    await add(archive.signature);
  }
  for (const input of sources.inputs) await add(input);
  const instructions = `Arten-Explorer: Quellen zu MinGit ${pin.version}\n\n`
    + `Zugehöriges Setup: ${receipt.setup.name}\nSHA-256: ${receipt.setup.sha256}\n\n`
    + "source-manifest.json ordnet jede installierte MinGit-Datei einem Hersteller-Quellarchiv oder einem Verpackungseingang zu. Die Rezepte und Lizenztexte der Komponenten liegen in den signierten Quellarchiven.\n"
    + "Die Quellarchive stammen aus Git-for-Windows und MSYS2. Die Verpackungseingaben und der Herkunftsnachweis liegen unter packaging-evidence/. Die PGP-Schlüssel und Dateilisten sind separat beigelegt.\n"
    + "Die historischen Herkunftsnachweise nennen ein älteres Prüfsetup. Die Datei-Prüfsummen wurden für das oben gebundene Setup erneut abgeglichen.\n";
  await fs.writeFile(path.join(target, "README.txt"), instructions, { flag: "wx" });
  staged.set("README.txt", { path: "README.txt", bytes: Buffer.byteLength(instructions), sha256: crypto.createHash("sha256").update(instructions).digest("hex") });
  receipt.mingit = { version: pin.version, downloadSha256: pin.sha256, installed: sources.installed,
    sourceArchives: sources.archives.map(({ path: archive }) => archive) };
  receipt.files = [...staged.values()];
  await fs.writeFile(path.join(target, "source-manifest.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return receipt;
}

async function buildSourceCompanion({ reportPath, output, stageSources, name }) {
  if (!path.isAbsolute(reportPath || "") || !path.isAbsolute(output || "")) throw new Error("Absolute Pfade für Baunachweis und Ausgabe angeben.");
  const stage = assertTestTempPath(await fs.mkdtemp(path.join(tmpdir(), "source-companion-")));
  try {
    const source = path.join(stage, "source"), zip = path.join(stage, "sources.zip");
    const receipt = await stageSources({ reportPath, provenanceRoot: provenance, target: source });
    const ps = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const archiveScript = path.join(installerRoot, "archive.ps1");
    await run(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", archiveScript, "-Mode", "Create", "-Archive", zip, "-Directory", source]);
    const extracted = path.join(stage, "readback");
    await run(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", archiveScript, "-Mode", "Extract", "-Archive", zip, "-Directory", extracted]);
    if ((await filesUnder(extracted)).length !== receipt.files.length + 1
      || await hash(path.join(extracted, "source-manifest.json")) !== await hash(path.join(source, "source-manifest.json"))) {
      throw new Error("Die Quellbeilage ist nach dem Entpacken unvollständig.");
    }
    for (const file of receipt.files) {
      if (await hash(path.join(extracted, file.path)) !== file.sha256) throw new Error(`Quellbeilage beschädigt: ${file.path}`);
    }
    const destination = path.join(output, `Arten-Explorer-${name}-Quellen-${receipt.packageId}.zip`);
    await fs.mkdir(output, { recursive: true });
    await fs.copyFile(zip, destination, fs.constants.COPYFILE_EXCL);
    return { packageId: receipt.packageId, files: receipt.files.length + 1, bytes: (await fs.stat(zip)).size, sha256: await hash(zip), destination };
  } finally {
    await fs.rm(assertTestTempPath(stage), { recursive: true, force: true });
    closeEmptyTestTempSession();
  }
}

export async function build({ output, preview = false } = {}) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Dieser Paketbau benötigt Windows x64.");
  if (!path.isAbsolute(output || "")) throw new Error("Absolutes Ausgabeverzeichnis angeben.");
  const statusBefore = await run("git", ["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (statusBefore && !preview) throw new Error("Veröffentlichungspaket benötigt einen sauberen, integrierten Git-Stand. Für das isolierte Prüfpaket --preview verwenden.");
  const revision = await run("git", ["rev-parse", "HEAD"]);
  let packageId;
  const stage = await fs.mkdtemp(path.join(tmpdir(), "installer-build-"));
  assertTestTempPath(stage);
  const payload = path.join(stage, "payload"), workspace = path.join(payload, "workspace"), program = path.join(payload, "program");
  const report = { schemaVersion: 1, productId: PRODUCT_ID, revision, preview, startedAt: new Date().toISOString(),
    downloads: [], sourceBindings: [], installerSourceBindings: [], systemMutation: false, nativeRegistrationExecuted: false };
  const ps = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const csc = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  const buildSources = path.join(stage, "installer-source");
  const archiveScript = path.join(buildSources, "archive.ps1");
  try {
    for (const name of ["build.mjs", "install-engine.mjs", "mingit-sources.mjs", "Setup.cs", "Launcher.cs", "archive.ps1", "app.manifest", "windows-integration.ps1", "maintain.ps1", "dependencies.lock.json"]) {
      const source = path.join(installerRoot, name);
      const staged = path.join(buildSources, name);
      await copy(source, staged);
      report.installerSourceBindings.push({ path: `installer/${name}`, sha256: await hash(staged) });
    }
    report.compiler = { path: csc, sha256: await hash(csc) };
    await fs.mkdir(program, { recursive: true });
    process.stdout.write("Öffentliche Git-Identität wird lokal gebunden; private Daten werden nicht kopiert.\n");
    // Export exactly the public HEAD tree and its commit, without copying the
    // developer's .git/config, credentials, hooks, reflogs or older history.
    // Native Git plumbing also avoids MSYS shell/transport helpers during build.
    await run("git", ["-c", "init.templateDir=", "init", "--initial-branch=main", workspace]);
    const tree = await run("git", ["rev-parse", "HEAD^{tree}"]);
    const objectIds = await run("git", ["rev-list", "--objects", "--no-object-names", tree]);
    const packRoot = path.join(workspace, ".git", "objects", "pack");
    await fs.mkdir(packRoot, { recursive: true });
    await run("git", [`--git-dir=${path.join(workspace, ".git")}`, "pack-objects", path.join(packRoot, "pack")], {
      input: `${revision}\n${objectIds}\n`, env: { ...process.env, GIT_OBJECT_DIRECTORY: path.join(workspace, ".git", "objects"),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repoRoot, ".git", "objects") },
    });
    await fs.writeFile(path.join(workspace, ".git", "shallow"), `${revision}\n`);
    await fs.writeFile(path.join(workspace, ".git", "refs", "heads", "main"), `${revision}\n`);
    await run("git", ["remote", "add", "origin", "https://github.com/felixkfm90/iucn-species-data.git"], { cwd: workspace });
    const sourceFiles = (await run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(sourceAllowed);
    for (const relative of sourceFiles) {
      const source = path.join(repoRoot, relative), staged = path.join(workspace, relative);
      await copy(source, staged);
      report.sourceBindings.push({ path: relative, sha256: await hash(staged) });
    }
    const identity = packageIdentity({ revision, preview, sourceBindings: report.sourceBindings,
      installerSourceBindings: report.installerSourceBindings, compilerSha256: report.compiler.sha256 });
    packageId = identity.packageId; Object.assign(report, identity);
    await run("git", ["reset", "--mixed", "HEAD"], { cwd: workspace });
    await fs.mkdir(path.join(workspace, ".git", "info"), { recursive: true });
    await fs.appendFile(path.join(workspace, ".git", "info", "exclude"), "\n# Installer-owned runtimes and local device binding\n/runtime/\n/installer-runtime.json\n/PROGRAMME-UND-EINRICHTUNG.txt\n");
    const nodeSource = process.execPath;
    if (await hash(nodeSource) !== pinned.node.sha256) throw new Error("Bau-Node ist nicht die gebundene Originalversion.");
    await copy(nodeSource, path.join(workspace, "runtime", "node", "node.exe"));
    const nodeLicense = path.join(workspace, "runtime/node/LICENSE.txt");
    await copy(path.join(provenance, "node-v24.22.1-LICENSE.txt"), nodeLicense);
    if (await hash(nodeLicense) !== "5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace") {
      throw new Error("Die Node-Lizenz stimmt nicht mit der gebundenen Prüfsumme überein.");
    }
    report.ffmpeg = await stageFfmpeg(provenance, workspace);
    const languageLock = JSON.parse(await fs.readFile(path.join(workspace, "species-explorer/language-check/runtime-lock.json"), "utf8"));
    const languageRoot = path.join(workspace, "runtime/languagetool"), javaStage = path.join(stage, "java-content");
    const languagePin = { version: languageLock.version, url: languageLock.source, bytes: languageLock.archiveBytes, sha256: languageLock.archiveSha256 };
    for (const [name, pin, target] of [
      ["electron", pinned.electron, path.join(workspace, "node_modules/electron/dist")],
      ["git", pinned.git, path.join(workspace, "runtime/git")], ["java", pinned.java, javaStage], ["languagetool", languagePin, languageRoot],
    ]) {
      const archive = path.join(stage, `${name}.zip`);
      const fromCache = name === "languagetool" && await copyCachedLanguageArchive(pin, archive);
      if (!fromCache) await download(pin, archive);
      report.downloads.push({ ...pin, origin: fromCache ? "verified-local-archive" : "official-download", completedAt: new Date().toISOString() });
      await run(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", archiveScript, "-Mode", "Extract", "-Archive", archive, "-Directory", target]);
    }
    const javaEntries = await fs.readdir(javaStage, { withFileTypes: true });
    if (javaEntries.length !== 1 || !javaEntries[0].isDirectory()) throw new Error("Das Java-Archiv besitzt keine eindeutige Laufzeit.");
    await fs.rename(assertTestTempPath(path.join(javaStage, javaEntries[0].name)), assertTestTempPath(path.join(workspace, "runtime/java")));
    const languageTree = await languageRuntimeTree(path.join(languageRoot, `LanguageTool-${languagePin.version}`));
    if (Object.entries(languageTree).some(([field, value]) => value !== languageLock.tree[field])) throw new Error("Der entpackte LanguageTool-Dateibaum stimmt nicht mit dem gebundenen Herstellerpaket überein.");
    const shim = path.join(workspace, "node_modules/.bin/electron.cmd");
    await fs.mkdir(path.dirname(shim), { recursive: true });
    await fs.writeFile(shim, '@echo off\r\n"%~dp0..\\electron\\dist\\electron.exe" %*\r\n');
    await fs.writeFile(path.join(workspace, "node_modules/electron/package.json"), `${JSON.stringify({ name: "electron", version: pinned.electron.version, main: "index.js" }, null, 2)}\n`);
    await fs.writeFile(path.join(workspace, "node_modules/electron/index.js"), 'module.exports = require("node:path").join(__dirname, "dist", "electron.exe");\n');
    for (const file of ["install-engine.mjs", "windows-integration.ps1", "maintain.ps1"]) await copy(path.join(buildSources, file), path.join(program, file));
    const icon = path.join(workspace, "species-explorer/desktop/assets/arten-explorer-transparent.ico");
    await copy(icon, path.join(program, "arten-explorer.ico"));
    const compilerArgs = ["/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/codepage:65001",
      "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll", "/reference:System.Web.Extensions.dll",
      `/win32icon:${icon}`, `/win32manifest:${path.join(buildSources, "app.manifest")}`];
    if (preview) compilerArgs.push("/define:PREVIEW");
    await run(csc, [...compilerArgs, `/out:${path.join(program, "Arten-Explorer.exe")}`, path.join(buildSources, "Launcher.cs")]);
    const notices = "Arten-Explorer - mitgelieferte Programme\r\n\r\n"
      + `Node ${pinned.node.version}: ${pinned.node.url}\r\nMIT und Drittbibliothekslizenzen: runtime/node/LICENSE.txt\r\n\r\n`
      + `Electron ${pinned.electron.version}: ${pinned.electron.url}\r\nMIT, Chromium und Drittbibliotheken: node_modules/electron/dist/LICENSE und LICENSES.chromium.html\r\n\r\n`
      + `Git/MinGit ${pinned.git.version}: ${pinned.git.url}\r\nGPL und mitgelieferte Drittanbietertexte: runtime/git\r\nKein Git-Anmeldezugang oder Credential-Manager-Versprechen.\r\n\r\n`
      + `FFmpeg/FFprobe ${pinned.ffmpeg.version}: eigener Windows-Pruefbau\r\nGPLv3-Lizenz und Buildangaben: local-tools/ffmpeg/LICENSE.txt und README.txt\r\nQuellen und Rezepte: local-tools/ffmpeg/sources\r\nGebundener FFmpeg-Quellstand: ${pinned.ffmpeg.source}\r\n\r\n`
      + `Eclipse Temurin JRE ${pinned.java.version}: ${pinned.java.url}\r\nLanguageTool ${languagePin.version}: ${languagePin.url}\r\nLokale deutsche Sprachpruefung. Lizenzbeilagen in runtime/java und runtime/languagetool.\r\n\r\n`
      + "Lightroom Classic wird durch Adobe bereitgestellt und nicht installiert.\r\nDas Plug-in liegt unter lightroom-plugin/FNWildlifeTaxonomy.lrplugin.\r\nIn Lightroom: Datei > Zusatzmodul-Manager > Hinzufuegen; diesen Ordner waehlen.\r\nDer gemeinsame Katalog und die privaten Daten werden nicht mitgeliefert.\r\n\r\n"
      + "Dieses private Pruefpaket ist keine rechtliche Vertriebsfreigabe.\r\nVor externer Weitergabe: vollstaendige Quell-/Lizenzbereitstellung aller aktivierten GPL-Drittbibliotheken und signierten Releaseprozess pruefen.\r\n";
    await fs.writeFile(path.join(workspace, "PROGRAMME-UND-EINRICHTUNG.txt"), notices);
    const manifest = { schemaVersion: 1, productId: PRODUCT_ID, packageId, revision, preview,
      createdAt: new Date().toISOString(), architecture: "win32-x64", minimumWindows: "Windows 11",
      privateDataIncluded: false, credentialsIncluded: false, files: [] };
    for (const file of await filesUnder(payload)) {
      const relative = path.relative(payload, file).split(path.sep).join("/");
      manifest.files.push({ path: relative, kind: packageKind(relative), bytes: (await fs.stat(file)).size, sha256: await hash(file) });
    }
    await fs.writeFile(path.join(payload, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await readPackage(payload);
    report.changedSourceDuringBuild = [];
    for (const binding of report.sourceBindings) if (await hash(path.join(repoRoot, binding.path)) !== binding.sha256) report.changedSourceDuringBuild.push(binding.path);
    for (const binding of report.installerSourceBindings) if (await hash(path.join(repoRoot, binding.path)) !== binding.sha256) report.changedSourceDuringBuild.push(binding.path);
    if (report.changedSourceDuringBuild.length && !preview) throw new Error(`Quelle wurde während des Paketbaus verändert: ${report.changedSourceDuringBuild.join(", ")}`);
    await fs.mkdir(output, { recursive: true });
    const payloadZip = path.join(stage, "payload.zip");
    process.stdout.write(`Paket mit ${manifest.files.length} gebundenen Dateien wird komprimiert.\n`);
    await run(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", archiveScript, "-Mode", "Create", "-Archive", payloadZip, "-Directory", payload]);
    const executable = path.join(path.resolve(output), `Arten-Explorer-Setup-${packageId}-x64.exe`);
    try { await fs.access(executable); throw new Error("Ausgabepaket existiert bereits."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await run(csc, [...compilerArgs, "/reference:System.IO.Compression.dll", "/reference:System.IO.Compression.FileSystem.dll",
      `/resource:${payloadZip},payload.zip`, `/out:${executable}`, path.join(buildSources, "Setup.cs")]);
    report.executable = { path: executable, bytes: (await fs.stat(executable)).size, sha256: await hash(executable) };
    report.manifest = { files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), sha256: await hash(path.join(payload, "manifest.json")) };
    report.finishedAt = new Date().toISOString();
    report.passed = true;
    report.releaseReady = false;
    report.remainingAcceptance = ["Keine GUI-/Registry-/Startmenue-Installation ausgefuehrt", "Frischer Windows-11-Rechner nicht abgenommen",
      "Dienstanmeldung/erster gemeinsamer Datenbezug und Git-Anmeldung noch nativ pruefen", "Vollstaendige GPL-Quellbereitstellung vor externer Weitergabe nachweisen",
      "Unsigniertes privates Pruefpaket; kein Herausgeberzertifikat beigefuegt"];
    await fs.copyFile(path.join(payload, "manifest.json"), path.join(output, `${packageId}-manifest.json`), fs.constants.COPYFILE_EXCL);
    await fs.writeFile(path.join(output, `${packageId}-build.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    return report;
  } finally {
    await fs.rm(assertTestTempPath(stage), { recursive: true, force: true });
    closeEmptyTestTempSession();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
    const ffmpeg = process.argv.find(arg => arg.startsWith("--ffmpeg-source-for="))?.slice("--ffmpeg-source-for=".length);
    const mingit = process.argv.find(arg => arg.startsWith("--mingit-source-for="))?.slice("--mingit-source-for=".length);
    if (ffmpeg !== undefined && mingit !== undefined) throw new Error("Pro Aufruf genau eine Quellbeilage auswählen.");
    if (ffmpeg !== undefined || mingit !== undefined) {
      const options = ffmpeg !== undefined ? { reportPath: ffmpeg, stageSources: stageFfmpegCompanion, name: "FFmpeg" }
        : { reportPath: mingit, stageSources: stageMingitCompanion, name: "MinGit" };
      process.stdout.write(`${JSON.stringify(await buildSourceCompanion({ ...options, output }))}\n`);
    } else {
      const report = await build({ output, preview: process.argv.includes("--preview") });
      process.stdout.write(`${JSON.stringify({ passed: report.passed, executable: report.executable, files: report.manifest.files, preview: report.preview })}\n`);
    }
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
