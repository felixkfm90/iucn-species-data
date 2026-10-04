import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const testsRoot = path.join(repoRoot, "temp", "tests");
// Keep nested SQLite fixtures below Windows' legacy filename limit. The
// exclusive mkdir and complete owner record still prevent session adoption.
const sessionName = `s-${process.pid}-${randomUUID().slice(0, 8)}`;
let sessionRoot;

// Test fixtures never depend on Windows TEMP, the current working directory,
// or a configurable production data path. Reject links before creating files.
export function assertTestTempPath(filename, { allowRoot = false } = {}) {
  const resolved = path.resolve(filename), relative = path.relative(testsRoot, resolved);
  if ((!relative && !allowRoot) || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("Testpfad liegt außerhalb des eigenen Explorer-temp/tests-Bereichs.");
  }
  if (fs.lstatSync(repoRoot).isSymbolicLink()) throw new Error("Verknüpfter Projektordner ist kein sicherer Test-temp.");
  let current = path.resolve(repoRoot);
  for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error("Verknüpfungen sind im Test-temp nicht zulässig.");
    if (current !== resolved && !stat.isDirectory()) throw new Error("Test-temp-Elternpfad ist kein Verzeichnis.");
  }
  return resolved;
}

export function tmpdir() {
  assertTestTempPath(testsRoot, { allowRoot: true });
  fs.mkdirSync(testsRoot, { recursive: true });
  if (!sessionRoot) {
    sessionRoot = assertTestTempPath(path.join(testsRoot, sessionName));
    fs.mkdirSync(sessionRoot);
    fs.writeFileSync(path.join(sessionRoot, "owner.json"), JSON.stringify({ schemaVersion: 1,
      owner: "fn-explorer-tests", pid: process.pid, session: sessionName, createdAt: new Date().toISOString() }), { flag: "wx" });
  }
  assertTestTempPath(sessionRoot);
  return sessionRoot;
}

// Individual tests close their workers/readers and remove their own fixtures.
// At exit remove only the resulting empty session; never sweep abandoned or
// still-used fixtures whose worker lifetime cannot independently be established.
export function closeEmptyTestTempSession() {
  if (!sessionRoot) return false;
  try {
    assertTestTempPath(sessionRoot);
    if (fs.readdirSync(sessionRoot).some((name) => name !== "owner.json")) return false;
    const ownerPath = path.join(sessionRoot, "owner.json");
    if (fs.lstatSync(ownerPath).isSymbolicLink()) return false;
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    if (owner.owner !== "fn-explorer-tests" || owner.pid !== process.pid || owner.session !== sessionName) return false;
    fs.unlinkSync(ownerPath);
    fs.rmdirSync(sessionRoot);
    sessionRoot = undefined;
    return true;
  } catch { return false; }
}

process.once("exit", closeEmptyTestTempSession);
