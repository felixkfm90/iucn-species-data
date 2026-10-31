import { createUpdateCompletionProofReader } from "../update-completion/proof.mjs";
import { createUpdateCompletionService } from "../update-completion/service.mjs";
import { assertCompletionCloseReady } from "../update-completion/close-guard.mjs";
import { createDesktopUpdateCompletionAdapter } from "./update-completion-adapter.mjs";

export async function readTrustedCompletionPresentation(window, baseUrl, context, { timeoutMs = 5000 } = {}) {
  let owned = false;
  try { owned = window && !window.isDestroyed?.() && window.webContents && !window.webContents.isDestroyed?.()
    && window.isVisible?.() && !window.isMinimized?.() && new URL(window.webContents.getURL()).origin === new URL(baseUrl).origin; }
  catch { /* A loading, gone or foreign window is an unknown draft state. */ }
  if (!owned) {
    return { known: false, uiDrafts: undefined, countdownVisible: false };
  }
  let timeout;
  try {
    const query = { selectionId: context.selectionId, updateRunId: context.updateRunId };
    const result = await Promise.race([
      window.webContents.executeJavaScript(`globalThis.SpeciesExplorerCompletionPresentation?.(${JSON.stringify(query)})`),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Unbekannter Eingabestatus.")), timeoutMs); }),
    ]);
    if (typeof result?.uiDrafts !== "boolean" || typeof result?.countdownVisible !== "boolean") throw new Error("Unbekannter Eingabestatus.");
    return { known: true, uiDrafts: result.uiDrafts, countdownVisible: result.countdownVisible };
  } catch { return { known: false, uiDrafts: undefined, countdownVisible: false }; }
  finally { clearTimeout(timeout); }
}

/** Owns one local desktop session; never registers an arbitrary native IPC. */
export function createDesktopUpdateCompletionOwner({ device, stateRoot, serverContext, getWindow, getBaseUrl,
  acquireDesktopClose, finishExplorerExit, restoreAfterFailure, onError = () => {},
  proofReader = createUpdateCompletionProofReader(serverContext), adapterOptions = {}, serviceOptions = {},
  serviceFactory = createUpdateCompletionService } = {}) {
  let adapter, releaseDesktopClose, releaseMutationBarrier, serverClosed = false, exitPending = false;
  const readCloseState = async (context) => {
    const [work, presentation] = await Promise.all([
      serverContext.readLocalWorkState(), readTrustedCompletionPresentation(getWindow(), getBaseUrl(), context),
    ]);
    return { ...work, ...presentation, known: work.known === true && presentation.known, deviceId: device.id };
  };
  const recover = async (_context, error) => {
    exitPending = false;
    releaseMutationBarrier?.(); releaseMutationBarrier = null;
    releaseDesktopClose?.(); releaseDesktopClose = null;
    await restoreAfterFailure({ error, serverClosed });
  };
  const completion = serviceFactory({ ...serviceOptions, stateRoot, deviceId: device.id, deviceName: device.name,
    proofReader, readCloseState,
    prepareClose: (context) => adapter.prepareClose(context),
    execute: (context, receipt) => adapter.execute(context, receipt),
    onChange(snapshot) {
      if (snapshot.status === "requested" && exitPending) {
        // Join the service queue after the durable result. The onChange hook is
        // inside the journal lock, so a timer alone could quit before release.
        exitPending = false;
        void completion.status().then(async (saved) => {
          if (saved.status !== "requested" || saved.selectionId !== snapshot.selectionId) throw new Error("Die Abschlussquittung ist nicht mehr eindeutig.");
          await finishExplorerExit();
        }).catch(async (error) => { onError(error); await recover(null, error).catch(onError); });
      }
    }, onError,
  });
  adapter = createDesktopUpdateCompletionAdapter({ ...adapterOptions,
    deviceId: device.id, sessionId: completion.sessionId,
    readClaim: (id) => completion.readClaim(id), consumeClaimExecution: (context) => completion.consumeClaimExecution(context),
    readCloseState,
    async beginRegularClose(context) {
      releaseDesktopClose = acquireDesktopClose();
      releaseMutationBarrier = await serverContext.quiesceForCompletion();
      assertCompletionCloseReady(await readCloseState(context), device.id);
      const final = await proofReader.read();
      if (!final.proof.ready || final.workflow?.updateRunId !== context.updateRunId || final.proof.proofRevision !== context.proofRevision) {
        throw new Error("Der Gesamtauftrag oder das aktive Datenpaar hat sich vor dem Schließen verändert.");
      }
      await serverContext.closeAppServer();
      serverClosed = true;
      return { deviceId: device.id, updateRunId: context.updateRunId, claimId: context.claimId,
        proofRevision: context.proofRevision, ownWritersClosed: true, appServerClosed: true };
    },
    async finishExplorerExit() { exitPending = true; },
    restoreAfterFailure: recover,
  });
  return completion;
}
