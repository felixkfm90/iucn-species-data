import { randomUUID } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { check, identifier, digest, fingerprint, clone, sha256, PageAuthoringError } from './contract.mjs';
import { normalizeAssetMetadata } from './model.mjs';
import { inspectJpeg, inspectPng, inspectWebp } from '../../scripts/image-header.mjs';
import { createCmsDispatchBinding } from './cms-dispatch.mjs';
import { validateCmsSaveBinding } from './cms-save-binding.mjs';
import { canRecoverCmsSave } from './repository.mjs';

const publishers = ['admin', 'publisher'];
const uncertainReason = 'Die neue Seite wurde nicht vollständig bestätigt. Der Versuch bleibt zur Klärung offen und wird nicht automatisch wiederholt.';
const cmsStopReasons = new Map([
  ['SQUARESPACE_PAGE_CREATION_UNCONFIRMED', 'Squarespace kann die leere Seite bereits als „Neue Seite“ gespeichert haben. Prüfe unter „Nicht verlinkt“, ob du dort den neuen Eintrag diesem Versuch eindeutig zuordnen kannst. Öffne dann seine Seiteneinstellungen. Falls „Seite aktivieren“ eingeschaltet ist, schalte es aus und speichere die Änderung.'],
  ['SQUARESPACE_PAGE_SAVE_PUBLIC_CHECK_UNCONFIRMED', 'Die öffentliche Prüfung hat das Speichern angehalten. Prüfe in Squarespace, ob die Seite deaktiviert ist.'],
  ['SQUARESPACE_ASSET_DRAFT_PUBLIC_CHECK_UNCONFIRMED', 'Die öffentliche Prüfung hat den Bildupload angehalten. Prüfe in Squarespace, ob der Entwurf deaktiviert und öffentlich nicht erreichbar ist.'],
  ['SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED', 'Eine Bilddatei konnte in der Squarespace-Inhaltsbibliothek nicht eindeutig bestätigt werden. Prüfe die Bibliothek und den Entwurf.'],
  ['SQUARESPACE_ASSET_DRAFT_SETTINGS_CHANGED', 'Die Seiteneinstellungen haben sich während des Bilduploads geändert. Prüfe, ob die Seite deaktiviert ist und welche Bilder in der Inhaltsbibliothek angekommen sind.'],
  ['SQUARESPACE_CODE_PLACEHOLDER_UNCONFIRMED', 'Die Vorbereitung eines Funktionsblocks wurde angehalten. Öffne den Entwurf in Squarespace und prüfe, welcher Inhalt dort angezeigt wird.'],
  ['SQUARESPACE_PAGE_SAVE_BINDING_UNCONFIRMED', 'Der Explorer konnte die Seite und ihre Bilder vor dem Speichern nicht eindeutig im Auftrag festhalten. Prüfe den offenen Entwurf in Squarespace.'],
  ['SQUARESPACE_PAGE_SAVE_TARGET_CHANGED', 'Der Explorer hat vor dem Speicherklick angehalten. Prüfe in Squarespace, ob der Entwurf und seine Texte, Bilder und Funktionsblöcke der freigegebenen Vorschau entsprechen.'],
  ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'Speichern oder Wiederöffnen wurde nicht vollständig bestätigt. Prüfe die gespeicherte Fassung in Squarespace.'],
]);
const cmsSaveStopReasons = new Map([
  ['confirm-save', 'Der Speicherklick wurde ausgelöst. Prüfe in Squarespace, ob die Texte und Bilder im Entwurf gespeichert sind.'],
  ['reopen-saved-editor', 'Das Wiederöffnen nach dem Speicherklick blieb offen. Öffne denselben Entwurf in Squarespace und prüfe die gespeicherten Inhalte.'],
  ['compare-reopened-content', 'Beim Vergleich des wieder geöffneten Entwurfs blieb die Übereinstimmung offen. Vergleiche Texte, Bildreihenfolge und Bildtexte mit der freigegebenen Vorschau.'],
  ['compare-reopened-code', 'Beim Vergleich des wieder geöffneten Entwurfs blieb ein Funktionsblock offen. Prüfe in Squarespace die Artinformationen und die Verbreitungskarte.'],
  ['reconfirm-disabled-page', 'Die Deaktivierung konnte nach dem Wiederöffnen nicht erneut bestätigt werden. Prüfe in den Seiteneinstellungen, ob die Seite deaktiviert ist.'],
  ['check-public-access-after-save', 'Die öffentliche Prüfung nach dem Speichern blieb offen. Prüfe in Squarespace, ob die Seite deaktiviert und öffentlich nicht erreichbar ist.'],
]);
const changed = condition => check(condition, 'cms_binding_changed', 'Projekt, Person, Berechtigung oder gespeicherter Seitenauftrag wurde geändert. Bitte den aktuellen Stand prüfen.', 409);

function exact(value, keys) {
  check(value && typeof value === 'object' && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'invalid_cms_input', 'Bitte ausschließlich den gespeicherten persönlichen Seitenauftrag verwenden.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(descriptors).length === keys.length && keys.every(key => descriptors[key]?.enumerable && Object.hasOwn(descriptors[key], 'value')),
    'invalid_cms_input', 'Der Seitenauftrag enthält unbekannte oder fehlende Felder.');
}
function input(value, begin) {
  exact(value, begin ? ['sourceScope', 'draftId', 'expectedRevision', 'planId', 'mutationId'] : ['sourceScope', 'draftId', 'attemptId', 'expectedStateRevision']);
  const result = { sourceScope: digest(value.sourceScope), draftId: identifier(value.draftId) };
  if (begin) return { ...result, expectedRevision: digest(value.expectedRevision), planId: identifier(value.planId), mutationId: identifier(value.mutationId) };
  return { ...result, attemptId: identifier(value.attemptId), expectedStateRevision: digest(value.expectedStateRevision) };
}
function identity(status) {
  check(status && typeof status.baseUrl === 'string' && status.baseUrl && typeof status.projectId === 'string'
    && status.user && publishers.includes(status.user.role) && status.readOnlySession === false
    && ['online', 'offline'].includes(status.connection), 'forbidden', 'Die CMS-Anlage benötigt eine volle persönliche Anmeldung mit Freigaberecht.', 403);
  return { baseUrl: status.baseUrl, projectId: status.projectId, userId: identifier(status.user.id), role: status.user.role,
    userVersion: status.user.version ?? null, readOnlySession: false };
}
function authority(state, onlineRequired = true) {
  const result = identity(state?.status);
  check(state.permissions?.canRead === true && state.permissions.canEdit === true && state.editMode !== false
    && (!onlineRequired || state.status.connection === 'online' && state.permissions.canApprove === true),
  'forbidden', 'Die CMS-Anlage benötigt aktuelle Redaktions- und Freigaberechte.', 403);
  return { ...result, sourceScope: fingerprint([result.baseUrl, result.projectId, result.userId]),
    permissions: clone(state.permissions), editMode: state.editMode !== false };
}
const boundIdentity = bound => Object.fromEntries(['baseUrl', 'projectId', 'userId', 'role', 'userVersion', 'readOnlySession'].map(key => [key, bound[key]]));
function sameAuthority(state, expected, offline) {
  const actual = authority(state, !offline);
  if (offline && state.status.connection === 'offline') {
    const stable = bound => ({ ...boundIdentity(bound), sourceScope: bound.sourceScope, editMode: bound.editMode,
      canRead: bound.permissions.canRead, canEdit: bound.permissions.canEdit });
    return fingerprint(stable(actual)) === fingerprint(stable(expected));
  }
  return fingerprint(actual) === fingerprint(expected);
}
function safeError(error, dispatched = false) {
  const code = !dispatched && typeof error?.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(error.code) ? error.code : 'cms_outcome_unconfirmed';
  const originalStatus = error?.status ?? error?.statusCode;
  const status = !dispatched && Number.isInteger(originalStatus) && originalStatus >= 400 && originalStatus < 500 ? originalStatus : 409;
  return new PageAuthoringError(status, code, dispatched ? uncertainReason : 'Die Seitenanlage wurde vor dem Schreiben angehalten. Der vorbereitete Auftrag bleibt erhalten.');
}

/** Node-only orchestration over the existing personal journal and the borrowed CMS browser. */
export function createExplorerCmsExecution({ withClient, setup, inputFor, view, cmsAdapter, now = () => new Date().toISOString(), assertOpen = () => {}, mediaFacade } = {}) {
  check([withClient, setup, inputFor, view, now, assertOpen].every(value => typeof value === 'function')
    && typeof mediaFacade?.describe === 'function' && typeof mediaFacade?.read === 'function',
  'cms_execution_unavailable', 'Die persönliche CMS-Ausführung ist nicht vollständig eingerichtet.', 500);
  const pending = new Set(), controllers = new Set(); let closed = false, closing = null, executing = false;
  function open() { assertOpen(); check(!closed, 'cms_execution_closed', 'Die CMS-Ausführung wird geschlossen.', 409); }
  function available() { check(cmsAdapter?.pageAuthoringAvailable === true && typeof cmsAdapter.createUnpublishedPage === 'function',
    'cms_adapter_unavailable', 'Die beobachtete Squarespace-Artseitenanlage ist noch nicht eingerichtet.', 409); }
  function run(work) {
    try { open(); } catch (error) { return Promise.reject(error); }
    const task = Promise.resolve().then(() => { open(); return work(); }); pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => {}); return task;
  }
  async function statusMatches(env, expected, { offline = false, finalizing = false } = {}) {
    if (!finalizing) open();
    const status = await env.client.status();
    if (!finalizing) open();
    changed(fingerprint(identity(status)) === fingerprint(identity(env.state.status))
      && (offline || status.connection === 'online'));
    if (expected) changed(sameAuthority(env.state, expected, offline));
    return status;
  }
  // Refresh and the actual operation use separate facade entries, so permissions
  // are captured after refresh without ever nesting the serialized withClient.
  async function phase(request, expected, work, { trustedCms = true, refresh = 'project', offline = false, finalizing = false } = {}) {
    let refreshed;
    if (refresh) refreshed = await withClient(async (client, state) => {
      open(); const before = authority(state, false);
      changed(request.sourceScope === before.sourceScope);
      if (expected) changed(fingerprint(identity(state.status)) === fingerprint(boundIdentity(expected)));
      if (refresh === 'identity') await client.capabilities(); else await client.refresh();
      open(); const status = await client.status(); open();
      changed(status.connection === 'online' && fingerprint(identity(status)) === fingerprint(identity(state.status)));
      return identity(status);
    });
    return withClient(async (client, state) => {
      if (!finalizing) open();
      const actual = authority(state, !offline);
      changed(request.sourceScope === actual.sourceScope && (!expected || sameAuthority(state, expected, offline))
        && (!refreshed || fingerprint(identity(state.status)) === fingerprint(refreshed)));
      const env = setup(client, state, { trustedCms }); inputFor(env, request);
      changed(env.sourceScope === actual.sourceScope && env.a.id === actual.userId && env.a.projectId === actual.projectId && env.a.role === actual.role);
      await statusMatches(env, expected, { offline, finalizing });
      return work(env, actual);
    });
  }
  function boundPlan(env, context, attempt) {
    const draft = env.repo.assertCurrent(env.a.projectId, attempt.draftId, attempt.revision), plan = env.repo.artifact(env.a.projectId, attempt.planId);
    changed(plan?.kind === 'cms-plan' && plan.draftId === draft.id && plan.revision === draft.revision && plan.payload?.schemaVersion === 2
      && plan.payload.readback?.schemaVersion === 1 && (!context.plan || fingerprint(plan) === fingerprint(context.plan)));
    const { planHash, ...body } = plan.payload; changed(planHash === fingerprint(body));
    return { attempt, draft, plan };
  }
  function stored(env, context, prepared = false) {
    const attempt = env.repo.attempt(env.a.projectId, context.request.attemptId);
    changed(attempt && attempt.draftId === context.request.draftId && attempt.actorId === env.a.id);
    if (prepared) check(attempt.status === 'prepared', 'cms_repeat_blocked', 'Ein bereits begonnener CMS-Auftrag wird nicht erneut ausgeführt.', 409);
    changed(attempt.status === (prepared ? 'prepared' : 'dispatched')
      && attempt.stateRevision === (prepared ? context.request.expectedStateRevision : context.dispatchedRevision));
    return boundPlan(env, context, attempt);
  }
  async function current(env, context, prepared = false) {
    await statusMatches(env, context.authority); changed(!context.controller.signal.aborted); return stored(env, context, prepared);
  }
  function receipt(context, proof, error) {
    const observedAt = now(); check(typeof observedAt === 'string' && observedAt.length <= 80 && Number.isFinite(Date.parse(observedAt)), 'invalid_receipt', 'Die CMS-Beobachtungszeit ist ungültig.');
    const payload = context.plan.payload;
    const stopReason = (error?.code === 'SQUARESPACE_PAGE_SAVE_UNCONFIRMED' && cmsSaveStopReasons.get(error.stage))
      || cmsStopReasons.get(error?.code);
    return { schemaVersion: 2, id: randomUUID(), attemptId: context.request.attemptId, planHash: payload.planHash,
      contentHash: payload.contentHash, imagesHash: payload.imagesHash, status: proof ? 'saved-unpublished' : 'uncertain',
      pageId: proof ? proof.readback?.page?.id : null, path: payload.target.path, unpublished: proof ? true : null,
      observedAt, readback: proof ? proof.readback : null, mediaBindings: proof ? proof.mediaBindings : [],
      ...(!proof && { reason: stopReason ? `${stopReason} Der Versuch wird nicht automatisch wiederholt.` : uncertainReason }) };
  }
  async function finalize(context, proof, error) {
    return phase(context.request, context.authority, async env => {
      const actual = env.repo.attempt(env.a.projectId, context.request.attemptId);
      changed(actual?.actorId === env.a.id && actual.draftId === context.request.draftId && actual.planId === context.plan.id
        && actual.status === 'dispatched' && actual.stateRevision === context.dispatchedRevision);
      const result = await env.core(context.request.draftId).recordCmsOutcome(env.context, { attemptId: actual.id, receipt: receipt(context, proof, error) });
      context.outcomeRecorded = true;
      return { ...await view(env, context.request.draftId), result, externalPublication: 'not-performed' };
    }, proof ? {} : { refresh: false, offline: true, finalizing: true });
  }
  async function perform(request) {
    available(); check(!executing, 'cms_execution_busy', 'Eine Seitenanlage läuft bereits.', 409); executing = true;
    const controller = new AbortController(); controllers.add(controller);
    const context = { request, controller, dispatched: false, outcomeRecorded: false, plan: null, authority: null };
    const callbacks = new Set(); let accepting = true, beforeWriteStarted = false, callbackFailure = null;
    const callback = work => {
      if (!accepting) return Promise.reject(safeError(null));
      const task = Promise.resolve().then(() => { open(); changed(!controller.signal.aborted); return work(); })
        .catch(error => { callbackFailure ??= error; throw error; }); callbacks.add(task);
      void task.finally(() => callbacks.delete(task)).catch(() => {}); return task;
    };
    try {
      await phase(request, null, async (env, bound) => {
        const value = stored(env, context, true); context.plan = clone(value.plan); context.draft = clone(value.draft); context.authority = bound;
      });
      const assertCurrent = () => callback(() => {
        changed(context.dispatched);
        return phase(request, context.authority, async env => { await current(env, context); }, { refresh: 'identity' });
      });
      const beforeWrite = () => callback(async () => {
        check(!beforeWriteStarted && !context.dispatched, 'cms_repeat_blocked', 'Ein gestarteter CMS-Auftrag wird nicht erneut ausgeführt.', 409); beforeWriteStarted = true;
        return phase(request, context.authority, async env => {
          await current(env, context, true); const dispatchId = randomUUID();
          try {
            await env.core(request.draftId).dispatchCmsAttempt(env.context, { mutationId: randomUUID(), attemptId: request.attemptId,
              expectedStateRevision: request.expectedStateRevision, dispatchId });
          } finally {
            const confirmed = env.repo.attempt(env.a.projectId, request.attemptId);
            if (confirmed?.status === 'dispatched' && confirmed.dispatchId === dispatchId) {
              context.dispatched = true; context.dispatchedRevision = confirmed.stateRevision;
            }
          }
          changed(context.dispatched); await current(env, context);
          const actual = env.repo.attempt(env.a.projectId, request.attemptId);
          changed(actual?.dispatchId === dispatchId && actual.status === 'dispatched' && actual.stateRevision === context.dispatchedRevision);
          return createCmsDispatchBinding({ projectId: env.a.projectId, attemptId: actual.id, dispatchId: actual.dispatchId,
            planHash: context.plan.payload.planHash, targetPath: context.plan.payload.target.path });
        });
      });
      const readMedia = assetId => callback(() => phase(request, context.authority, async env => {
        changed(context.dispatched); await current(env, context);
        identifier(assetId);
        const images = context.draft.document.images.filter(image => image.assetId === assetId);
        check(images.length > 0, 'cms_media_not_bound', 'Diese Datei gehört nicht zur freigegebenen Galerie.', 409);
        const expected = normalizeAssetMetadata(images[0].asset, env.a.projectId);
        changed(images.every(image => fingerprint(image.asset) === fingerprint(expected)));
        const mediaContext = { ...env.context, pageSpecies: context.draft.document.species, mediaAsset: expected };
        const described = normalizeAssetMetadata(await mediaFacade.describe(mediaContext, assetId), env.a.projectId);
        await current(env, context); changed(fingerprint(described) === fingerprint(expected));
        const raw = await mediaFacade.read(mediaContext, assetId); await current(env, context);
        changed((Buffer.isBuffer(raw) || raw instanceof Uint8Array) && raw.byteLength === expected.bytes);
        const bytes = Buffer.from(raw); changed(sha256(bytes) === expected.sha256);
        const inspect = { 'image/png': inspectPng, 'image/jpeg': inspectJpeg, 'image/webp': inspectWebp }[expected.mimeType];
        check(inspect && inspect(bytes).valid, 'cms_media_changed', 'Die Galeriebytes passen nicht zu ihrem gebundenen Bildformat.', 409);
        await current(env, context); return bytes;
      }, { refresh: 'identity' }));
      const rememberSaveBinding = binding => callback(() => phase(request, context.authority, async env => {
        changed(context.dispatched);
        await current(env, context);
        const saved = await env.core(request.draftId).recordCmsSaveBinding(env.context, { attemptId:request.attemptId,
          expectedStateRevision:context.dispatchedRevision,binding });
        context.dispatchedRevision = saved.stateRevision;
        await current(env, context);
        return true;
      }, { refresh: 'identity' }));
      let proof;
      try { proof = await cmsAdapter.createUnpublishedPage(clone(context.plan.payload), { signal: controller.signal, beforeWrite, assertCurrent, readMedia, rememberSaveBinding }); }
      finally { accepting = false; await Promise.allSettled([...callbacks]); }
      open(); changed(!controller.signal.aborted);
      if (callbackFailure) throw callbackFailure;
      check(context.dispatched, 'cms_dispatch_required', 'Ohne bestätigten Journalstart wird keine Seitenanlage bestätigt.', 409);
      exact(proof, ['readback', 'mediaBindings']);
      return await finalize(context, proof);
    } catch (error) {
      accepting = false; await Promise.allSettled([...callbacks]);
      if (context.dispatched && !context.outcomeRecorded) {
        try { return await finalize(context, null, error); } catch { throw safeError(error, true); }
      }
      throw safeError(error, context.dispatched);
    } finally { controllers.delete(controller); executing = false; }
  }
  async function recheck(request) {
    check(typeof cmsAdapter?.recheckUnpublishedPage === 'function', 'cms_recheck_unavailable',
      'Die lesende Squarespace-Prüfung ist noch nicht verfügbar.', 409);
    check(!executing, 'cms_execution_busy', 'Eine Squarespace-Übernahme oder Prüfung läuft bereits.', 409);
    executing = true;
    const controller = new AbortController(); controllers.add(controller);
    const context = { request, controller, authority: null, plan: null, saveBinding: null };
    let reading = true, checkedInBrowser = false, callbackFailure;
    const checks = new Set();
    function load(env) {
      const attempt = env.repo.attempt(env.a.projectId, request.attemptId);
      changed(attempt?.actorId === env.a.id && attempt.draftId === request.draftId && attempt.stateRevision === request.expectedStateRevision);
      check(canRecoverCmsSave(attempt), 'cms_recheck_unavailable',
        'Für diesen Auftrag ist keine eindeutige Squarespace-Speicherzuordnung zur Rückprüfung verfügbar.', 409);
      const { plan } = boundPlan(env, context, attempt);
      const saveBinding = validateCmsSaveBinding(attempt.saveBinding, { attempt, plan: plan.payload });
      changed(!context.saveBinding || fingerprint(saveBinding) === fingerprint(context.saveBinding));
      return { plan, saveBinding };
    }
    function assertCurrent() {
      if (!reading) return Promise.reject(new PageAuthoringError(409, 'cms_recheck_unconfirmed', 'Die Squarespace-Prüfung ist beendet.'));
      const checkRead = phase(request, context.authority, env => {
        changed(!controller.signal.aborted);
        load(env);
        checkedInBrowser = true;
        return true;
      }, { refresh: 'identity' }).catch(error => { callbackFailure ??= error; throw error; });
      checks.add(checkRead);
      void checkRead.finally(() => checks.delete(checkRead)).catch(() => {});
      return checkRead;
    }
    try {
      await phase(request, null, (env, bound) => {
        const value = load(env);
        context.authority = bound; context.plan = clone(value.plan); context.saveBinding = clone(value.saveBinding);
      });
      let proof;
      try {
        proof = await cmsAdapter.recheckUnpublishedPage(clone(context.plan.payload), {
          saveBinding: clone(context.saveBinding), assertCurrent, signal: controller.signal,
        });
      } catch (error) {
        const code = error?.code;
        if (callbackFailure) throw callbackFailure;
        if (code === 'SQUARESPACE_LOGIN_REQUIRED' || code === 'SQUARESPACE_BUSY') {
          throw new PageAuthoringError(409, code, code === 'SQUARESPACE_LOGIN_REQUIRED'
            ? 'Melde dich für die Rückprüfung in Squarespace an.' : 'Ein anderer Squarespace-Auftrag läuft bereits.');
        }
        throw new PageAuthoringError(409, 'cms_recheck_unconfirmed', 'Die gespeicherte Squarespace-Fassung konnte nicht eindeutig bestätigt werden.');
      } finally { reading = false; await Promise.allSettled([...checks]); }
      open(); changed(!controller.signal.aborted && checkedInBrowser);
      if (callbackFailure) throw callbackFailure;
      exact(proof, ['readback', 'mediaBindings']);
      return await phase(request, context.authority, async env => {
        changed(!controller.signal.aborted);
        load(env);
        const result = await env.core(request.draftId).recordRecoveredCmsOutcome(env.context, {
          attemptId: request.attemptId, expectedStateRevision: request.expectedStateRevision, receipt: receipt(context, proof),
        });
        return { ...await view(env, request.draftId), result, externalPublication: 'not-performed' };
      });
    } finally { reading = false; controllers.delete(controller); executing = false; }
  }
  return Object.freeze({
    begin: raw => run(async () => {
      const request = input(raw, true); available();
      return phase(request, null, async env => {
        const { sourceScope, ...body } = request;
        const result = await env.core(request.draftId).beginCmsAttempt(env.context, body);
        return { ...await view(env, request.draftId), result, externalPublication: 'not-performed' };
      }, { trustedCms: false });
    }),
    execute: raw => run(() => perform(input(raw, false))),
    recheck: raw => run(() => recheck(input(raw, false))),
    blockingState: () => ({ known: true, busy: pending.size > 0, activeOperations: pending.size, closed, externalPublication: 'not-performed' }),
    close() {
      if (closing) return closing;
      closed = true; for (const controller of controllers) controller.abort();
      closing = (async () => { while (pending.size) await Promise.allSettled([...pending]); })(); return closing;
    },
  });
}
