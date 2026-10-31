import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { assertTestTempPath, closeEmptyTestTempSession, tmpdir } from "../scripts/test-temp.mjs";
import { PRODUCT_ID, readPackage } from "./install-engine.mjs";

const installerRoot = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
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
  const response = await fetch(pin.url, { signal: AbortSignal.timeout(180_000) });
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

export async function build({ output, preview = false } = {}) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Dieser Paketbau benötigt Windows x64.");
  if (!path.isAbsolute(output || "")) throw new Error("Absolutes Ausgabeverzeichnis angeben.");
  const statusBefore = await run("git", ["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (statusBefore && !preview) throw new Error("Veröffentlichungspaket benötigt einen sauberen, integrierten Git-Stand. Für das isolierte Prüfpaket --preview verwenden.");
  const revision = await run("git", ["rev-parse", "HEAD"]);
  const packageId = `0.1.0-${revision.slice(0, 12)}${preview ? "-preview" : ""}`;
  const stage = await fs.mkdtemp(path.join(tmpdir(), "installer-build-"));
  assertTestTempPath(stage);
  const payload = path.join(stage, "payload"), workspace = path.join(payload, "workspace"), program = path.join(payload, "program");
  const report = { schemaVersion: 1, productId: PRODUCT_ID, packageId, revision, preview, startedAt: new Date().toISOString(),
    downloads: [], sourceBindings: [], installerSourceBindings: [], systemMutation: false, nativeRegistrationExecuted: false };
  const ps = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const csc = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  const buildSources = path.join(stage, "installer-source");
  const archiveScript = path.join(buildSources, "archive.ps1");
  try {
    for (const name of ["build.mjs", "install-engine.mjs", "Setup.cs", "Launcher.cs", "archive.ps1", "app.manifest", "windows-integration.ps1", "maintain.ps1", "dependencies.lock.json"]) {
      const source = path.join(installerRoot, name);
      report.installerSourceBindings.push({ path: `installer/${name}`, sha256: await hash(source) });
      await copy(source, path.join(buildSources, name));
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
      const source = path.join(repoRoot, relative), digest = await hash(source);
      report.sourceBindings.push({ path: relative, sha256: digest });
      await copy(source, path.join(workspace, relative));
    }
    await run("git", ["reset", "--mixed", "HEAD"], { cwd: workspace });
    await fs.mkdir(path.join(workspace, ".git", "info"), { recursive: true });
    await fs.appendFile(path.join(workspace, ".git", "info", "exclude"), "\n# Installer-owned runtimes and local device binding\n/runtime/\n/installer-runtime.json\n/PROGRAMME-UND-EINRICHTUNG.txt\n");
    const nodeSource = process.execPath;
    if (await hash(nodeSource) !== pinned.node.sha256) throw new Error("Bau-Node ist nicht die gebundene Originalversion.");
    await copy(nodeSource, path.join(workspace, "runtime", "node", "node.exe"));
    const provenance = path.join(repoRoot, "data/website/checks/installer-provenance-20261031");
    const licensePins = { "node-v24.22.1-LICENSE.txt": "5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace",
      "ffmpeg-8.1.1-LICENSE": "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903",
      "ffmpeg-8.1.1-README.txt": "af90ccd9d705c74cadb9c36918664353de0533eade19f7ccd5cbe6081c262001" };
    for (const [name, expected] of Object.entries(licensePins)) if (await hash(path.join(provenance, name)) !== expected) throw new Error(`Lizenz-/Buildbeilage stimmt nicht mit Herkunftsnachweis überein: ${name}`);
    await copy(path.join(provenance, "node-v24.22.1-LICENSE.txt"), path.join(workspace, "runtime", "node", "LICENSE.txt"));
    for (const [name, expected] of [["ffmpeg", pinned.ffmpeg.ffmpegSha256], ["ffprobe", pinned.ffmpeg.ffprobeSha256]]) {
      const source = path.join(repoRoot, "local-tools/ffmpeg/bin", `${name}.exe`);
      if (await hash(source) !== expected) throw new Error(`${name}: lokale Bytes weichen von verifizierter Distribution ab.`);
      await copy(source, path.join(workspace, "local-tools/ffmpeg/bin", `${name}.exe`));
    }
    for (const [source, target] of [["ffmpeg-8.1.1-LICENSE", "LICENSE.txt"], ["ffmpeg-8.1.1-README.txt", "README.txt"]]) {
      await copy(path.join(provenance, source), path.join(workspace, "local-tools/ffmpeg", target));
    }
    for (const [name, target] of [["electron", path.join(workspace, "node_modules/electron/dist")], ["git", path.join(workspace, "runtime/git")]]) {
      const pin = pinned[name], archive = path.join(stage, `${name}.zip`);
      await download(pin, archive);
      report.downloads.push({ ...pin, completedAt: new Date().toISOString() });
      await run(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", archiveScript, "-Mode", "Extract", "-Archive", archive, "-Directory", target]);
    }
    const shim = path.join(workspace, "node_modules/.bin/electron.cmd");
    await fs.mkdir(path.dirname(shim), { recursive: true });
    await fs.writeFile(shim, '@echo off\r\n"%~dp0..\\electron\\dist\\electron.exe" %*\r\n');
    await fs.writeFile(path.join(workspace, "node_modules/electron/package.json"), `${JSON.stringify({ name: "electron", version: pinned.electron.version, main: "index.js" }, null, 2)}\n`);
    await fs.writeFile(path.join(workspace, "node_modules/electron/index.js"), 'module.exports = require("node:path").join(__dirname, "dist", "electron.exe");\n');
    for (const file of ["install-engine.mjs", "windows-integration.ps1", "maintain.ps1"]) await copy(path.join(buildSources, file), path.join(program, file));
    const icon = path.join(repoRoot, "species-explorer/desktop/assets/arten-explorer-transparent.ico");
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
      + `FFmpeg/FFprobe ${pinned.ffmpeg.version}: ${pinned.ffmpeg.url}\r\nGPLv3-Build. Lizenz und Buildangaben: local-tools/ffmpeg/LICENSE.txt und README.txt\r\nGebundener FFmpeg-Quellstand: ${pinned.ffmpeg.source}\r\n\r\n`
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
    const report = await build({ output, preview: process.argv.includes("--preview") });
    process.stdout.write(`${JSON.stringify({ passed: report.passed, executable: report.executable, files: report.manifest.files, preview: report.preview })}\n`);
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
