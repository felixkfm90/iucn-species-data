import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { cmsNeutralDraftPath, cmsTargetPath, validateCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";

const unconfirmed = () => Object.assign(
  new Error("Die Squarespace-Suche konnte die freie Seitenadresse nicht bestätigen. Bitte prüfe die Adresse in der Seitenverwaltung."),
  { code: "SQUARESPACE_TARGET_NOT_CONFIRMED", statusCode: 409 },
);

/** The built-in Pages search includes stored slugs of linked and unlinked pages.
 * A hit of any kind is inconclusive for vacancy, since titles can also match. */
export async function observeSquarespaceAdminTarget(value, options) {
  const path = cmsTargetPath(value), parentPath = path.slice(0, path.lastIndexOf("/"));
  await observeAdminVacancy(path, parentPath, options);
  return { path, parentPath };
}

export async function observeSquarespaceAdminNeutralDraft(binding, options) {
  const dispatch = validateCmsDispatchBinding(binding);
  const path = cmsNeutralDraftPath(dispatch), parentPath = dispatch.targetPath.slice(0, dispatch.targetPath.lastIndexOf("/"));
  await observeAdminVacancy(path, parentPath, options);
  return { path };
}

async function observeAdminVacancy(path, controlPath, { read, click, insertText, waitMs, timeoutMs, signal }) {
  const controlQuery = controlPath.slice(1), target = path.slice(1);
  const deadline = performance.now() + timeoutMs;
  let initial, opened, currentQuery = "";
  async function waitFor(query, test) {
    do {
      signal?.throwIfAborted();
      const state = await read({ operation: "search-state", query });
      signal?.throwIfAborted();
      if (state && initial && state.epoch !== initial.epoch) throw unconfirmed();
      if (state && opened && state.mode !== "closed" && state.inputId !== opened.inputId) throw unconfirmed();
      if (state?.query === query && test(state)) return state;
      if (performance.now() >= deadline) break;
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw unconfirmed();
  }
  async function settle(query, mode) {
    await waitFor(query, state => state.mode === mode);
    await delay(waitMs, undefined, { signal });
    return waitFor(query, state => state.mode === mode);
  }
  async function clickSearchControl(operation, expected) {
    const request = { operation, query: expected.query, expected };
    do {
      signal?.throwIfAborted();
      const point = await read(request);
      if (point) {
        await delay(waitMs, undefined, { signal });
        const settled = await read({ ...request, reveal: false });
        signal?.throwIfAborted();
        if (isDeepStrictEqual(point, settled)) {
          if (!click(point)) throw unconfirmed();
          return;
        }
      }
      const state = await read({ operation: "search-state", query: expected.query });
      if ((state && !isDeepStrictEqual(state, expected)) || performance.now() >= deadline) throw unconfirmed();
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw unconfirmed();
  }
  async function search(query, mode, previous) {
    const focused = await read({ operation: "search-focus", query: previous.query, expected: previous });
    signal?.throwIfAborted();
    if (focused !== true) throw unconfirmed();
    currentQuery = query;
    await insertText(query);
    return settle(query, mode);
  }
  let didOpen = false, verified = false;
  try {
    initial = await waitFor("", state => state.mode === "closed");
    await clickSearchControl("search-open", initial);
    didOpen = true;
    opened = await waitFor("", state => state.mode === "empty");
    const firstControl = await search(controlQuery, "results", opened);
    const firstEmpty = await search(target, "no-results", firstControl);
    const secondControl = await search(controlQuery, "results", firstEmpty);
    await search(target, "no-results", secondControl);
    verified = true;
  } finally {
    if (didOpen && !signal?.aborted) {
      const restore = async () => {
        const state = await read({ operation: "search-state", query: currentQuery });
        if (!state || state.mode === "closed" || state.epoch !== initial.epoch
            || opened && state.inputId !== opened.inputId || state.query !== currentQuery) throw unconfirmed();
        await clickSearchControl("search-close", state);
        await waitFor("", state => state.mode === "closed");
      };
      if (verified) await restore();
      else await restore().catch(() => {});
    }
  }
  signal?.throwIfAborted();
}
