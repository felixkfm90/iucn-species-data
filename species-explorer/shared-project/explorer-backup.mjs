import { createDeviceBackupProvider } from "./device-backup.mjs";
import { validateWebsiteAltJournal } from "./project-journal-backup.mjs";

/** Main supplies the personal root; renderer requests cannot select backup files. */
export function createExplorerDeviceBackupProvider({ profileRoot, deviceId, sharedProject, initialProjectImport, websiteAltSync,
  websiteAltSyncConfigured = Boolean(websiteAltSync),
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
      const cacheProjects = await sharedProject.backupProjectIds(), importProjects = await initialProjectImport.backupProjectIds();
      const altProjects = websiteAltSyncConfigured ? await websiteAltSync.backupProjectIds() : [];
      signal?.throwIfAborted();
      return [...new Set([...cacheProjects, ...importProjects, ...altProjects])].sort();
    },
    files: [
      { id: "device", relativePath: "device.json", kind: "device-profile", required: true },
      { id: "cache", relativePath: "project-cache.sqlite", kind: "client-cache", required: true },
      { id: "import", relativePath: "initial-import.sqlite", kind: "import-journal", required: true },
      ...(websiteAltSyncConfigured ? [{ id: "website-alt-sync", relativePath: "website-alt-sync.sqlite", kind: "sqlite",
        required: true, validate: validateWebsiteAltJournal }] : []),
    ],
  });
}
