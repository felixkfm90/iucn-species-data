import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertCompletionCloseReady } from "../update-completion/close-guard.mjs";
import { completionError, DEVICE_PATTERN, ID_PATTERN } from "../update-completion/storage.mjs";
import { UPDATE_RUN_PATTERN } from "../update-completion/proof.mjs";

const FIELDS = ["schemaVersion", "claimId", "selectionId", "sessionId", "updateRunId", "deviceId", "action", "proofRevision", "claimedAt"];
const ACTIONS = new Set(["exit-explorer", "shutdown", "restart"]);

function validateContext(context, deviceId) {
  if (context?.schemaVersion !== 1 || context.deviceId !== deviceId || !ACTIONS.has(context.action)
    || !ID_PATTERN.test(context.claimId || "") || !ID_PATTERN.test(context.selectionId || "") || !ID_PATTERN.test(context.sessionId || "")
    || !UPDATE_RUN_PATTERN.test(context.updateRunId || "") || !/^[a-f0-9]{64}$/.test(context.proofRevision || "")
    || !Number.isFinite(Date.parse(context.claimedAt))) throw completionError("Kein gültiger lokaler, auftragsgebundener Ausführungsauftrag.");
}

export function shutdownCommand(action, { platform = process.platform, windowsRoot = process.env.SystemRoot || process.env.WINDIR } = {}) {
  if (platform !== "win32" || !path.win32.isAbsolute(windowsRoot || "") || /^[/\\]{2}/.test(windowsRoot)) {
    throw completionError("Die Systemaktion benötigt einen eindeutig lokalen Windows-PC.");
  }
  if (!["shutdown", "restart"].includes(action)) throw completionError("Keine freigegebene Windows-Systemaktion.");
  return { executable: path.win32.join(windowsRoot, "System32", "shutdown.exe"),
    args: [action === "shutdown" ? "/s" : "/r", "/t", "0"],
    options: { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] } };
}

// There is deliberately no IPC registration, auto-execution, default close
// override or backup invocation here. The trusted desktop owner wires these.
export function createDesktopUpdateCompletionAdapter({ deviceId, sessionId, readClaim, consumeClaimExecution, readCloseState, beginRegularClose,
  finishExplorerExit, restoreAfterFailure = async () => {}, spawnImpl = spawn,
  platform = process.platform, windowsRoot = process.env.SystemRoot || process.env.WINDIR } = {}) {
  if (!DEVICE_PATTERN.test(deviceId || "") || !ID_PATTERN.test(sessionId || "") || [readClaim, consumeClaimExecution, readCloseState, beginRegularClose, finishExplorerExit].some((value) => typeof value !== "function")) {
    throw new TypeError("Lokales Gerät, persistenter Claim und reguläre Desktop-Schließfunktionen sind erforderlich.");
  }
  const receipts = new Map(), consumed = new Set(), preparing = new Set();
  async function assertClaim(context) {
    validateContext(context, deviceId);
    if (context.sessionId !== sessionId) throw completionError("Ein früherer Programmstart darf keine Systemaktion erneut auslösen.");
    const saved = await readClaim(context.selectionId);
    if (!saved || FIELDS.some((field) => saved[field] !== context[field])) throw completionError("Der Ausführungsauftrag stimmt nicht mit dem dauerhaften lokalen Claim überein.");
  }
  return {
    async prepareClose(context) {
      await assertClaim(context);
      if (consumed.has(context.claimId) || receipts.has(context.claimId) || preparing.has(context.claimId)) throw completionError("Dieser Schließauftrag wurde bereits verwendet.");
      preparing.add(context.claimId);
      try {
        assertCompletionCloseReady(await readCloseState(context), deviceId);
      // beginRegularClose must acquire the application's existing close barrier,
      // recheck renderer drafts, prohibit new writers and await every own writer.
        const closed = await beginRegularClose(context);
        if (!closed || closed.deviceId !== deviceId || closed.updateRunId !== context.updateRunId || closed.claimId !== context.claimId
          || closed.proofRevision !== context.proofRevision
          || closed.ownWritersClosed !== true || closed.appServerClosed !== true) throw completionError("Der reguläre Abschluss eigener Schreiber und des App-Servers ist nicht bestätigt.");
        const receipt = { deviceId, selectionId: context.selectionId, updateRunId: context.updateRunId, claimId: context.claimId,
          proofRevision: context.proofRevision, receiptId: randomUUID(), ownWritersClosed: true, appServerClosed: true };
        receipts.set(context.claimId, receipt);
        return { ...receipt };
      } catch (error) {
        await restoreAfterFailure(context, error).catch(() => {});
        throw error;
      } finally { preparing.delete(context.claimId); }
    },
    async execute(context, receipt) {
      await assertClaim(context);
      const expected = receipts.get(context.claimId);
      if (!expected || !receipt || Object.keys(expected).some((field) => receipt[field] !== expected[field]) || consumed.has(context.claimId)) {
        throw completionError("Kein frischer regulärer Schließabschluss für diese Abschlussaktion.");
      }
      receipts.delete(context.claimId);
      consumed.add(context.claimId); // Consume before any irreversible external request.
      try {
        if (!await consumeClaimExecution(context)) throw completionError("Diese Abschlussaktion wurde bereits dauerhaft zur Ausführung verbraucht. Keine Wiederholung.");
        if (context.action === "exit-explorer") {
          await finishExplorerExit(context);
          return { requested: true, action: context.action, deviceId, updateRunId: context.updateRunId };
        }
        const command = shutdownCommand(context.action, { platform, windowsRoot });
        await new Promise((resolve, reject) => {
          let child;
          try { child = spawnImpl(command.executable, command.args, command.options); }
          catch (error) { reject(error); return; }
          let stderr = "";
          child.stderr?.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
          child.stdout?.resume?.();
          child.once("error", reject);
          child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Windows hat die Abschlussaktion nicht bestätigt (Code ${code}). ${stderr}`.trim())));
        });
        await finishExplorerExit(context);
        return { requested: true, action: context.action, deviceId, updateRunId: context.updateRunId,
          operatingSystemShutdownConfirmed: false, message: "Windows hat die Anforderung angenommen; offene Rückfragen anderer Programme bleiben maßgeblich." };
      } catch (error) {
        await restoreAfterFailure(context, error).catch(() => {});
        throw error;
      }
    },
  };
}
