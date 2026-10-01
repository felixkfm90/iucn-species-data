import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSourceRecoveryService } from "../species-explorer/taxonomy-source-recovery.mjs";
import { createSourceRecoveryCandidateService } from "../species-explorer/taxonomy-source-recovery-candidate.mjs";
import { createSourceRecoveryReplacementService } from "../species-explorer/taxonomy-source-recovery-replacement.mjs";

// Deliberately no default production paths and no command to activate/apply.
export function parseSourceRecoveryArgs(args) {
  const [command, ...rest] = args;
  if (!["preview", "prepare", "inspect", "candidate", "replacement-preview", "replacement-candidate", "restart-preview", "restart-candidate"].includes(command)) throw new Error("Aktion muss preview, prepare, inspect, candidate, replacement-preview, replacement-candidate, restart-preview oder restart-candidate sein; keine Aktivierung unterstützt.");
  const flags = new Map();
  const allowed = new Set(["taxonomy-root", "search-root", "species-list", "corrections", "previous-version", "current-version", "revision", "plan-revision", "failed-plan-revision", "confirm", "replacement-decisions"]);
  for (const arg of rest) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match || !allowed.has(match[1]) || flags.has(match[1])) throw new Error("Unbekannte oder doppelte Reparaturoption.");
    flags.set(match[1], match[2] ?? true);
  }
  const names = { "taxonomy-root": "taxonomyRoot", "search-root": "searchRoot", "species-list": "speciesListPath",
    corrections: "correctionsPath", "previous-version": "previousVersion", "current-version": "currentVersion" };
  const options = {};
  for (const [flag, key] of Object.entries(names)) {
    if (typeof flags.get(flag) !== "string" || !flags.get(flag)) throw new Error(`Explizite Option --${flag}=… fehlt.`);
    options[key] = flags.get(flag);
  }
  if (command === "preview" && ["revision", "confirm", "replacement-decisions"].some((flag) => flags.has(flag))) throw new Error("preview ist ausschließlich lesend; keine Bestätigungsoptionen verwenden.");
  if (command !== "preview" && !/^[a-f0-9]{64}$/.test(flags.get("revision") || "")) throw new Error("Geprüfte --revision=… fehlt.");
  if (command === "inspect" && ["confirm", "replacement-decisions"].some((flag) => flags.has(flag))) throw new Error("inspect ist ausschließlich lesend.");
  if (["replacement-preview", "restart-preview"].includes(command) && ["confirm", "replacement-decisions", "plan-revision"].some((flag) => flags.has(flag))) throw new Error("Ersatz-/Neustartvorschau ist ausschließlich lesend.");
  if (!["replacement-candidate", "restart-candidate"].includes(command) && flags.has("plan-revision")) throw new Error("Eine Planrevision gehört nur zum bestätigten Ersatzkandidaten.");
  if (["replacement-candidate", "restart-candidate"].includes(command) && !/^[a-f0-9]{64}$/.test(flags.get("plan-revision") || "")) throw new Error("Frische --plan-revision=… fehlt.");
  if (command.startsWith("restart-") && !/^[a-f0-9]{64}$/.test(flags.get("failed-plan-revision") || "")) throw new Error("Gebundene --failed-plan-revision=… fehlt.");
  if (!command.startsWith("restart-") && flags.has("failed-plan-revision")) throw new Error("Fehlerplan gehört ausschließlich zum Neustart.");
  if (["prepare", "candidate", "replacement-candidate", "restart-candidate"].includes(command) && (flags.get("confirm") !== true || typeof flags.get("replacement-decisions") !== "string"
      || !path.isAbsolute(flags.get("replacement-decisions")))) throw new Error("prepare/candidate benötigt --confirm und eine absolute --replacement-decisions=…-Datei aus der Vorschau.");
  return { command, options, revision: flags.get("revision"), planRevision: flags.get("plan-revision"), failedPlanRevision: flags.get("failed-plan-revision"), decisionsFile: flags.get("replacement-decisions") };
}

export async function runSourceRecovery(args, { signal } = {}) {
  const parsed = parseSourceRecoveryArgs(args), service = createSourceRecoveryService(parsed.options);
  if (parsed.command === "preview") return service.preview({ signal });
  if (parsed.command === "inspect") return service.inspect({ revision: parsed.revision, signal });
  if (["replacement-preview", "restart-preview"].includes(parsed.command)) return createSourceRecoveryReplacementService(parsed.options).preview({ revision: parsed.revision, failedPlanRevision: parsed.failedPlanRevision, signal });
  const replacementDecisions = JSON.parse(await fs.readFile(parsed.decisionsFile, "utf8"));
  let lastPhase = "", lastUpdate = 0;
  if (["candidate", "replacement-candidate", "restart-candidate"].includes(parsed.command)) return (parsed.command === "candidate"
    ? createSourceRecoveryCandidateService(parsed.options) : createSourceRecoveryReplacementService(parsed.options)).stage({
    confirmed: true, revision: parsed.revision, planRevision: parsed.planRevision, failedPlanRevision: parsed.failedPlanRevision, replacementDecisions, signal,
    onProgress: (event) => {
      if (event.phase === lastPhase && Date.now() - lastUpdate < 1000) return;
      lastPhase = event.phase; lastUpdate = Date.now();
      process.stderr.write(JSON.stringify({ phase: event.phase || "", current: event.current ?? null, total: event.total ?? null }) + "\n");
    },
  });
  return service.prepare({ confirmed: true, revision: parsed.revision, replacementDecisions, signal });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  runSourceRecovery(process.argv.slice(2), { signal: controller.signal })
    .then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\n"))
    .catch((error) => { process.stderr.write(`Reparatur nicht vorbereitet: ${error.message}\n`); process.exitCode = 1; });
}
