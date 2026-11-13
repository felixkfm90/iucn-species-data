import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const unavailable = () => Object.assign(new Error("Der Squarespace-Katalog für neue unverlinkte Seiten ist nicht eindeutig bereit."),
  { code: "SQUARESPACE_EDITOR_NOT_READY", statusCode: 409 });
const uncertain = () => Object.assign(new Error("Der Klick zum Anlegen der leeren Squarespace-Seite konnte nicht bestätigt werden."),
  { code: "SQUARESPACE_PAGE_CREATION_UNCONFIRMED", statusCode: 409 });

/** Check the regular page-creation route without choosing a template or adding a page. */
export function observeSquarespacePageCreationCatalog(controls) {
  return walkCreationCatalog(controls);
}

/** Request the blank-page action once. Its result still needs to be observed separately. */
export function selectSquarespaceBlankPage(controls, { expectedInitial, authorize, markAttempt }) {
  return walkCreationCatalog(controls, { expectedInitial, authorize, markAttempt });
}

async function walkCreationCatalog({ read, click, waitMs, timeoutMs, signal }, selection) {
  signal?.throwIfAborted();
  const initial = await read({ operation: "catalog-state" });
  if (initial?.mode !== "closed" || selection && !isDeepStrictEqual(initial, selection.expectedInitial)) throw unavailable();
  let catalog, closeSent = false, blankSent = false;
  const deadline = performance.now() + timeoutMs;
  const belongs = state => state?.epoch === initial.epoch && state.previewPath === initial.previewPath;
  async function waitFor(...modes) {
    do {
      signal?.throwIfAborted();
      const state = await read({ operation: "catalog-state" });
      if (state && (!belongs(state) || catalog && state.mode !== "closed" && state.modalId !== catalog.modalId)) throw unavailable();
      if (modes.includes(state?.mode)) return state;
      if (performance.now() >= deadline) break;
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw unavailable();
  }
  async function actionPoint(operation, expected) {
    const request = { operation, expected };
    do {
      signal?.throwIfAborted();
      const point = await read(request);
      if (point) {
        // The sidebar and the catalog can move while their scroll positions settle.
        await delay(waitMs, undefined, { signal });
        const settled = await read({ ...request, reveal: false });
        signal?.throwIfAborted();
        if (isDeepStrictEqual(settled, point)) return point;
      }
      const state = await read({ operation: "catalog-state" });
      if ((state && !isDeepStrictEqual(state, expected)) || performance.now() >= deadline) throw unavailable();
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw unavailable();
  }
  async function action(operation, expected) {
    const point = await actionPoint(operation, expected);
    signal?.throwIfAborted();
    if (!click(point)) throw unavailable();
  }
  async function closeCatalog() {
    const state = await read({ operation: "catalog-state" });
    if (!belongs(state) || state.modalId !== catalog?.modalId || !["pages", "classic"].includes(state.mode)) throw unavailable();
    await action("catalog-close", state);
    closeSent = true;
    if (!isDeepStrictEqual(await waitFor("closed"), initial)) throw unavailable();
  }
  try {
    await action("catalog-open", initial);
    catalog = await waitFor("pages", "classic");
    let classic = catalog;
    if (catalog.mode === "pages") {
      await action("catalog-classic", catalog);
      classic = await waitFor("classic");
    }
    const before = await actionPoint("catalog-blank-point", classic);
    if (selection) {
      await selection.authorize();
      const confirmed = await read({ operation: "catalog-blank-point", expected: classic, reveal: false });
      signal?.throwIfAborted();
      if (!isDeepStrictEqual(confirmed, before)) throw unavailable();
      selection.markAttempt();
      blankSent = true;
      let clicked;
      try { clicked = click(confirmed); }
      catch { signal?.throwIfAborted(); throw uncertain(); }
      if (!clicked) throw uncertain();
      return;
    }
    await closeCatalog();
  } finally {
    if (catalog && !closeSent && !blankSent && !signal?.aborted) await closeCatalog().catch(() => {});
  }
}
