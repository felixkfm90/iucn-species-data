import { createDeviceBackupProvider } from "./device-backup.mjs";
import { validateWebsiteAltJournal, validatePageAuthoringJournal } from "./project-journal-backup.mjs";
export { createExplorerMediaBudgetReader } from "./media-profile-budget.mjs";

/** Main supplies the personal root; renderer requests cannot select backup files. */
export function createExplorerDeviceBackupProvider({ profileRoot, deviceId, sharedProject, initialProjectImport, websiteAltSync, pageAuthoring,
  websiteAltSyncConfigured = Boolean(websiteAltSync),
  pageAuthoringConfigured = Boolean(pageAuthoring),
  tempSession, providerFactory = createDeviceBackupProvider } = {}) {
  return providerFactory({ profileRoot, deviceId, tempSession,
    async resolveProjectIds({ signal } = {}) {
      signal?.throwIfAborted();
      if (typeof sharedProject?.backupProjectIds !== "function" || typeof initialProjectImport?.backupProjectIds !== "function") {
        throw new Error("Die persönliche Projektablage ist nicht vollständig lesbar. Die Sicherung wird nicht als vollständig ausgegeben.");
      }
      if (websiteAltSyncConfigured && typeof websiteAltSync?.backupProjectIds !== "function") {
        throw new Error("Das eingerichtete persönliche Bildtextjournal ist nicht vollständig lesbar. Die Sicherung wird nicht als vollständig ausgegeben.");
      }
      if (pageAuthoringConfigured && typeof pageAuthoring?.backupProjectIds !== "function") {
        throw new Error("Die eingerichtete persönliche Artseitenablage ist nicht vollständig lesbar. Die Sicherung wird nicht als vollständig ausgegeben.");
      }
      const cacheProjects = await sharedProject.backupProjectIds(), importProjects = await initialProjectImport.backupProjectIds();
      const altProjects = websiteAltSyncConfigured ? await websiteAltSync.backupProjectIds() : [];
      const pageProjects = pageAuthoringConfigured ? await pageAuthoring.backupProjectIds() : [];
      signal?.throwIfAborted();
      return [...new Set([...cacheProjects, ...importProjects, ...altProjects, ...pageProjects])].sort();
    },
    files: [
      { id: "device", relativePath: "device.json", kind: "device-profile", required: true },
      { id: "cache", relativePath: "project-cache.sqlite", kind: "client-cache", required: true },
      { id: "import", relativePath: "initial-import.sqlite", kind: "import-journal", required: true },
      ...(websiteAltSyncConfigured ? [{ id: "website-alt-sync", relativePath: "website-alt-sync.sqlite", kind: "sqlite",
        required: true, validate: validateWebsiteAltJournal }] : []),
      ...(pageAuthoringConfigured ? [{ id: "page-authoring", relativePath: "page-authoring.sqlite", kind: "sqlite",
        required: true, validate: validatePageAuthoringJournal }] : []),
    ],
  });
}
