import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const benchmarkScratchRoot = path.join(repoRoot, "temp", "benchmarks");

export function assertScratchPath(filename, { allowRoot = false, allowTests = false, inspectTree = false } = {}) {
  const resolved = path.resolve(filename);
  const bases = [benchmarkScratchRoot, ...(allowTests ? [path.join(repoRoot, "temp", "tests")] : [])];
  if (!bases.some((base) => {
    const relative = path.relative(base, resolved);
    return (allowRoot || relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  })) throw new Error("Mess-/Prototyppfad muss im eigenen Explorer-temp liegen.");
  if (fs.lstatSync(repoRoot).isSymbolicLink()) throw new Error("Verknüpfter Projektordner ist kein sicherer Mess-temp.");
  let current = path.resolve(repoRoot);
  for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error("Verknüpfungen sind im Mess-temp nicht zulässig.");
    if (current !== resolved && !stat.isDirectory()) throw new Error("Mess-temp-Elternpfad ist kein Verzeichnis.");
  }
  if (inspectTree && fs.existsSync(resolved)) {
    const inspect = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error("Verknüpfte Messdateien dürfen nicht bereinigt werden.");
        if (entry.isDirectory()) inspect(path.join(directory, entry.name));
      }
    };
    inspect(resolved);
  }
  return resolved;
}

export function ensureBenchmarkScratch() {
  assertScratchPath(benchmarkScratchRoot, { allowRoot: true });
  fs.mkdirSync(benchmarkScratchRoot, { recursive: true });
  return benchmarkScratchRoot;
}
