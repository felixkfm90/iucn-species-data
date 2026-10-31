import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertTestTempPath, closeEmptyTestTempSession, tmpdir } from "../scripts/test-temp.mjs";
import { installPackage, readPackage } from "./install-engine.mjs";
import { verifyWindowsIcon } from "./icon-resource.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let output = "", error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command}: ${code} ${error}`)));
  });
}

const executable = process.argv.find((arg) => arg.startsWith("--exe="))?.slice(6);
const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
assert.ok(path.isAbsolute(executable || "") && path.isAbsolute(reportPath || ""));
const root = await fs.mkdtemp(path.join(tmpdir(), "setup-smoke-"));
const packageRoot = path.join(root, "extracted"), base = path.join(root, "Niko und Jörg", "Arten Explorer");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), executable, fixture: root,
  nativeIntegrationExecuted: false, tests: [] };
const check = (name, detail = {}) => report.tests.push({ name, passed: true, ...detail });
try {
  await run(executable, ["--extract-test", packageRoot]);
  const manifest = await readPackage(packageRoot);
  check("Compiled setup extracts its entire bound payload without opening UI", { files: manifest.files.length });
  const acceptedIcon = path.join(packageRoot, "program/arten-explorer.ico");
  check("Compiled setup carries every accepted Arten-Explorer icon image byte-for-byte", await verifyWindowsIcon(executable, acceptedIcon));
  check("Compiled application launcher carries every accepted Arten-Explorer icon image byte-for-byte",
    await verifyWindowsIcon(path.join(packageRoot, "program/Arten-Explorer.exe"), acceptedIcon));
  const repo = path.join(packageRoot, "workspace");
  const node = path.join(repo, "runtime/node/node.exe"), git = path.join(repo, "runtime/git/cmd/git.exe");
  assert.equal(await run(node, ["--version"]), "v24.22.1");
  check("Bundled official Node starts headlessly", { version: "24.22.1" });
  const gitVersion = await run(git, ["--version"]);
  assert.match(gitVersion, /2\.56\.0\.windows\.4/);
  check("Bundled official MinGit starts headlessly", { version: gitVersion });
  const gitHead = await run(git, ["rev-parse", "HEAD"], { cwd: repo });
  assert.equal(gitHead, manifest.revision);
  assert.equal(await run(git, ["remote", "get-url", "origin"], { cwd: repo }), "https://github.com/felixkfm90/iucn-species-data.git");
  check("Independent shallow Git object pack is readable and contains the public remote", { revision: gitHead });
  const gitFsck = await run(git, ["fsck", "--full", "--no-reflogs"], { cwd: repo });
  check("Bundled Git checks the shallow snapshot without developer-object dependencies", { output: gitFsck });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const result = await run(path.join(repo, "local-tools/ffmpeg/bin", `${name}.exe`), ["-version"]);
    assert.match(result, /8\.1\.1/);
    check(`Bundled ${name} starts headlessly`, { firstLine: result.split(/\r?\n/)[0] });
  }
  const electron = await run(path.join(repo, "node_modules/electron/dist/electron.exe"), ["-e", "console.log(JSON.stringify(process.versions))"],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  const electronVersions = JSON.parse(electron);
  assert.equal(electronVersions.electron, "42.11.18");
  check("Bundled Electron runs only as headless Node; no window or Explorer starts", { electron: electronVersions.electron, embeddedNode: electronVersions.node });
  const installed = await installPackage({ packageRoot, base, testMode: true });
  check("Real complete payload installs under a new Unicode/space test path", { writes: installed.writes });
  await fs.mkdir(path.join(base, "workspace/data"));
  const protectedFile = path.join(base, "workspace/data/protected.sqlite");
  await fs.writeFile(protectedFile, "synthetic fixture only - no database connection");
  await fs.writeFile(path.join(base, "workspace/species_list.json"), "synthetic user modification");
  const immutable = path.join(base, "workspace/runtime/node/LICENSE.txt");
  await fs.rm(immutable);
  const repaired = await installPackage({ packageRoot, base, operation: "repair", testMode: true });
  assert.ok(repaired.writes >= 1);
  assert.equal(await fs.readFile(path.join(base, "workspace/species_list.json"), "utf8"), "synthetic user modification");
  check("Full-payload repair restores a missing program companion and retains own species edits");
  const changedRelative = "workspace/PROGRAMME-UND-EINRICHTUNG.txt";
  const changedSource = path.join(packageRoot, changedRelative);
  await fs.appendFile(changedSource, "\r\nSynthetic update marker for this private fixture.\r\n");
  const changedBytes = await fs.readFile(changedSource);
  const changedEntry = manifest.files.find((entry) => entry.path === changedRelative);
  changedEntry.bytes = changedBytes.length;
  changedEntry.sha256 = crypto.createHash("sha256").update(changedBytes).digest("hex");
  manifest.packageId += "-smoke-update";
  await fs.writeFile(path.join(packageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await installPackage({ packageRoot, base, testMode: true });
  assert.match(await fs.readFile(path.join(base, changedRelative), "utf8"), /Synthetic update marker/);
  assert.equal(await fs.readFile(path.join(base, "workspace/species_list.json"), "utf8"), "synthetic user modification");
  check("Full-payload update applies a new bound program companion while retaining user edits");
  const protectedBefore = crypto.createHash("sha256").update(await fs.readFile(protectedFile)).digest("hex");
  await installPackage({ base, operation: "uninstall", testMode: true });
  assert.equal(crypto.createHash("sha256").update(await fs.readFile(protectedFile)).digest("hex"), protectedBefore);
  await assert.rejects(fs.access(path.join(base, "program/Arten-Explorer.exe")), { code: "ENOENT" });
  check("Full-payload uninstall removes the launcher and retains synthetic protected data byte-for-byte");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  report.fixtureRemoved = true;
  report.ownSessionRemoved = closeEmptyTestTempSession();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
