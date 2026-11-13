import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLanguageCheckService } from "./service.mjs";
import { textSha256 } from "./parser.mjs";
import { LANGUAGE_RUNTIME_LOCK, LANGUAGE_LAUNCHER_LOCK } from "./runtime.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cases = [
  { id: "ordinary-spelling", text: "Der Vogeel sitzt auf einem Ast.", replacement: "Vogel" },
  { id: "sentence-case", text: "der Vogel sitzt auf einem Ast.", replacement: "Der" },
  { id: "noun-case", text: "Ich sehe einen vogel am Fluss.", replacement: "Vogel" },
  { id: "missing-comma", text: "Der Vogel fliegt davon weil es regnet.", includes: ", weil" },
  { id: "correct-prose", text: "Der Vogel sitzt auf einem Ast. Sein Gefieder glänzt grün.", clean: true },
  { id: "short-caption-no-dot", text: "Eisvogel auf einem Ast", context: "caption", clean: true },
  { id: "short-heading-no-dot", text: "Aussehen", context: "heading", clean: true },
  { id: "emoji-newline-umlauts", text: "🦜 Der Vogeel sitzt auf einem Ast.\nSein Gefieder glänzt grün.", replacement: "Vogel" },
  { id: "crlf-umlauts", text: "Die Bäume stehen am Fluss.\r\nDer Vogeel sitzt auf einem Ast.", replacement: "Vogel" },
  { id: "caption-comma-still-checked", text: "Ein Vogel der auf einem Ast sitzt", context: "caption", includes: ", der" },
  { id: "plural-caption-relative-comma", text: "Bäume die aus dem Nebel ragen", context: "caption", includes: ", die" },
  { id: "genitive-caption-no-comma", text: "Ein Vogel der Gattung Acanthis", context: "caption", noPunctuation: true },
];
export async function qualifyNative({ output } = {}) {
  const children = [], service = createLanguageCheckService({ repoRoot, spawnImpl(command, args, options) {
    const child = spawn(command, args, options); children.push(child); return child;
  } });
  const result = { schemaVersion: 1, checkedAt: new Date().toISOString(), source: "actual local LanguageTool 6.6, default runtime resolver",
    runtime: { version: LANGUAGE_RUNTIME_LOCK.version, archiveSha256: LANGUAGE_RUNTIME_LOCK.archiveSha256, treeSha256: LANGUAGE_RUNTIME_LOCK.tree.treeSha256 },
    launcher: LANGUAGE_LAUNCHER_LOCK, cases: [], processCount: 0, actualClose: null, noOwnProcessAlive: false, qualified: false };
  try {
    result.status = await service.status();
    if (!result.status.available) throw new Error("Die normale lokale Runtimeauflösung ist nicht verfügbar.");
    for (const item of cases) {
      const started = performance.now(), checked = await service.check({ text: item.text, context: item.context || "text" });
      const actualSpans = checked.available && checked.findings.every(finding => item.text.slice(finding.start, finding.end).length === finding.end - finding.start);
      const corrected = checked.available ? checked.findings.reduceRight((text, finding) => text.slice(0, finding.start) + finding.replacement + text.slice(finding.end), item.text) : "";
      const clean = item.noPunctuation ? checked.findings.every(finding => finding.kind !== "punctuation") : checked.findings.length === 0;
      const passed = Boolean(checked.available && actualSpans && (item.context !== "caption" || !corrected.endsWith("."))
        && (item.clean || item.noPunctuation ? clean
          : item.replacement ? checked.findings.some(finding => finding.replacement === item.replacement) : corrected.includes(item.includes)));
      result.cases.push({ id: item.id, context: item.context || "text", textSha256: textSha256(item.text), passed, elapsedMs: Math.round(performance.now() - started),
        available: checked.available, code: checked.code || null, findings: checked.findings.map(({ start, end, replacement, kind, ruleId }) => ({ start, end, replacement, kind, ruleId })) });
    }
  } catch (error) { result.runFailure = { code: error.code || "NATIVE_PROBE_FAILED", name: error.name }; }
  finally {
    try { result.actualClose = await service.close(); } catch (error) { result.closeFailure = { code: error.code || "NATIVE_CLOSE_FAILED", name: error.name }; }
    result.processCount = children.length;
    result.noOwnProcessAlive = children.every(child => { try { process.kill(child.pid, 0); return false; } catch (error) { return error.code === "ESRCH"; } });
    result.qualified = result.cases.length === cases.length && result.cases.every(value => value.passed) && result.processCount === 1
      && result.actualClose?.closed && result.actualClose.lastExit?.code === 0 && result.noOwnProcessAlive;
    if (output) {
      if (!path.isAbsolute(output) || !path.resolve(output).startsWith(path.join(repoRoot, "data", "website", "checks") + path.sep)) throw new Error("Prüfbeleg benötigt den eigenen privaten Belegbereich.");
      const files = ["service.mjs", "runtime.mjs", "parser.mjs", "FNManagedLanguageTool.java", "managed-launcher.jar", "runtime-lock.json", "launcher-lock.json", "qualify-native.mjs"];
      result.sources = [];
      for (const name of files) result.sources.push({ path: `species-explorer/language-check/${name}`, sha256: createHash("sha256").update(await fs.readFile(new URL(name, import.meta.url))).digest("hex") });
      await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    }
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await qualifyNative({ output: process.argv[2] });
  process.stdout.write(JSON.stringify({ qualified: result.qualified, cases: result.cases.map(({ id, passed, available, code }) => ({ id, passed, available, code })),
    processCount: result.processCount, actualClose: result.actualClose, noOwnProcessAlive: result.noOwnProcessAlive }) + "\n");
  if (!result.qualified) process.exitCode = 1;
}
