import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { childProcessEnvironment } from "./child-process-environment.mjs";

const PUBLICATION_ENTRY_POINTS = Object.freeze([
  "scripts/project-status.mjs",
  "scripts/validate-data-schema.mjs",
]);

function publicationSources(repoRoot, entryPoints) {
  const sources = new Set();
  const visit = (filename) => {
    const absolute = resolve(repoRoot, filename);
    const relativePath = relative(repoRoot, absolute).split(sep).join("/");
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../")) {
      throw new Error("Eine Abhängigkeit der Veröffentlichungsprüfung liegt außerhalb des Projekts.");
    }
    if (sources.has(relativePath)) return;
    sources.add(relativePath);
    const source = readFileSync(absolute, "utf8");
    const imports = source.matchAll(/^\s*(?:import|export)\s+(?:[^"'`;]*?\sfrom\s*)?["'](\.[^"']+)["']/gm);
    for (const match of imports) visit(resolve(dirname(absolute), match[1]));
  };
  for (const entryPoint of entryPoints) visit(entryPoint);
  return [...sources].sort();
}

function gitRead(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    env: childProcessEnvironment("git"),
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr?.trim() || "Der veröffentlichte Git-Stand konnte nicht gelesen werden.");
  }
  return result.stdout.split("\0").filter(Boolean);
}

// Data-only commits keep HEAD's source files. CI must receive the same generator/schema as the local writer.
export function checkProjectPublicationSources(repoRoot, { entryPoints = PUBLICATION_ENTRY_POINTS } = {}) {
  try {
    const gitRoot = gitRead(repoRoot, ["rev-parse", "--show-toplevel"])[0]?.trim();
    const normalizedRoot = (value) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
    if (!gitRoot || normalizedRoot(gitRoot) !== normalizedRoot(repoRoot)) {
      throw new Error("Der Projektordner entspricht nicht dem Git-Arbeitsverzeichnis.");
    }
    const sources = publicationSources(repoRoot, entryPoints);
    const tracked = new Set(gitRead(repoRoot, ["ls-tree", "-rz", "--name-only", "HEAD", "--", ...sources]));
    const changed = gitRead(repoRoot, ["diff", "--name-only", "-z", "HEAD", "--", ...sources]);
    const unpublished = [...new Set([...sources.filter((filename) => !tracked.has(filename)), ...changed])].sort();
    if (unpublished.length) {
      return {
        ok: false,
        files: unpublished,
        message: "Übertragung angehalten: Projektstatus oder Datenprüfung verwenden noch unveröffentlichten Code: "
          + unpublished.join(", ")
          + ". Diesen Code zuerst gemeinsam prüfen und veröffentlichen; anschließend Änderungen übertragen. Lokale Daten und Dateien bleiben erhalten.",
      };
    }
    return { ok: true, files: [], message: "Veröffentlichungsprüfung bestanden: Projektstatus und Datenprüfung entsprechen dem versionierten Code." };
  } catch (error) {
    return {
      ok: false,
      files: [],
      message: `Übertragung angehalten: Veröffentlichungsgrundlage konnte nicht geprüft werden: ${error.message} Lokale Daten und Dateien bleiben erhalten.`,
    };
  }
}
