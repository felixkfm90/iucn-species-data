import { createWebsiteAltSync } from "./website-alt-sync.mjs";

const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const actions = new Map([["link", "link"], ["queue", "queue"], ["sync", "sync"], ["pull", "pull"], ["import", "importRemote"], ["resolve", "resolve"]]);

/** The legacy local store stays independent; only explicit page actions use this bridge. */
export function createExplorerWebsiteAltSync({ websiteAltTexts, sharedProject, bridgeFactory = createWebsiteAltSync, ...options } = {}) {
  if (!websiteAltTexts?.createSharedSyncStoreAdapter || !sharedProject?.createWebsiteAltSyncAdapter) {
    throw failure("Die kontrollierten lokalen und gemeinsamen Bildtextanschlüsse fehlen.");
  }
  const bridge = bridgeFactory({ ...options, localStore: websiteAltTexts.createSharedSyncStoreAdapter(), client: sharedProject.createWebsiteAltSyncAdapter() });
  let closing = false, closePromise = null;
  async function permissions() {
    const shared = await sharedProject.snapshot();
    return { ...shared.permissions, busy: shared.busy === true };
  }
  async function requireEditor() {
    const current = await permissions();
    if (!current.canEdit || current.busy) throw failure("Bitte mit redaktionellen Rechten am gemeinsamen Projekt anmelden und laufende Anfragen abwarten.", 403);
    return current;
  }
  return {
    async snapshot() {
      const current = await permissions();
      // A former writer's journal can retain unapproved server drafts. Readers never receive its pages.
      if (!current.canEdit) return { available: true, permissions: current, pages: [], busy: false,
        message: "Gemeinsame Bildtexte benötigen eine redaktionelle Projektanmeldung. Der lokale Bildtextbestand bleibt separat erhalten." };
      return { available: true, ...await bridge.snapshot(), permissions: current };
    },
    async operation({ action, payload = {}, searchParams } = {}) {
      if (closing) throw failure("Die gemeinsame Bildtextanbindung wird geschlossen.");
      if (action === "snapshot") return this.snapshot();
      const current = await requireEditor();
      if (action === "page" || action === "conflicts") {
        if (searchParams?.getAll("pageUrl").length !== 1 || [...searchParams.keys()].some((key) => key !== "pageUrl")) throw failure("Eine eindeutige ausgewählte Seite ist erforderlich.", 400);
        const pageUrl = searchParams.get("pageUrl");
        return action === "page" ? { ...await bridge.read(pageUrl), permissions: current } : { conflicts: await bridge.conflicts(pageUrl) };
      }
      const method = actions.get(action);
      if (!method) throw failure("Unbekannte gemeinsame Bildtextaktion.", 404);
      return bridge[method](payload);
    },
    async blockingState() {
      try {
        const value = await bridge.snapshot();
        return { known: !value.localStateUnchecked && Number.isSafeInteger(value.pending) && Number.isSafeInteger(value.conflictCount),
          busy: value.busy === true, pending: value.pending, conflicts: value.conflictCount };
      } catch { return { known: false, busy: true, pending: null, conflicts: null }; }
    },
    backupProjectIds: () => bridge.backupProjectIds(),
    close() { closing = true; closePromise ||= bridge.close(); return closePromise; },
  };
}
