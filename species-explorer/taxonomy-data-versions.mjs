import fs from "node:fs/promises";
import path from "node:path";

const MAX_VERSION_BYTES = 64 * 1024;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function masterReferenceRelease(manifest) {
  const source = Array.isArray(manifest?.sources)
    ? manifest.sources.find((entry) => text(entry?.provider) === "catalogue-of-life") : null;
  return text(source?.providerVersion || source?.releaseId);
}

export function taxonomyMasterReferenceStatus(activeReferenceRelease, lifecycle = {}) {
  const activeRelease = text(activeReferenceRelease);
  const activeMasterRelease = masterReferenceRelease(lifecycle.active);
  const candidateRelease = masterReferenceRelease(lifecycle.candidate);
  const activeMatchesReference = Boolean(activeRelease && lifecycle.active && activeMasterRelease === activeRelease);
  return {
    status: activeRelease ? activeMatchesReference ? "current" : "stale" : "unavailable",
    activeRelease,
    activeMasterRelease,
    candidateRelease,
    activeMatchesReference,
    candidateMatchesActiveReference: Boolean(activeRelease && lifecycle.candidate && candidateRelease === activeRelease),
    needsMasterRebuild: Boolean(activeRelease && !activeMatchesReference),
  };
}

// Versionsdaten stehen vor den großen Differenzlisten im vom Projekt geschriebenen
// Mastermanifest. Nur dessen JSON-Kopf lesen; keine SQLite öffnen oder Historie laden.
export async function readVersionJson(filePath, { masterHeader = false } = {}) {
  const file = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_VERSION_BYTES);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const source = buffer.subarray(0, bytesRead).toString("utf8");
    if (masterHeader) {
      const boundary = /^  "summary":/m.exec(source);
      if (boundary) return JSON.parse(`${source.slice(0, boundary.index).trimEnd().replace(/,$/, "")}\n}`);
    }
    if ((await file.stat()).size > MAX_VERSION_BYTES) throw new Error("Versionsangaben überschreiten das Leselimit.");
    return JSON.parse(source);
  } finally {
    await file.close();
  }
}

export function compareTaxonomyDataVersions({ reference, master, packageManifest, correction, available, runtime = "", readError = false } = {}) {
  const referenceRelease = text(reference?.activeRelease);
  const masterVersion = text(master?.candidateId);
  const masterReference = masterReferenceRelease(master);
  const packageMasterVersion = text(packageManifest?.masterVersion);
  const packageId = text(packageManifest?.packageId);
  const baseCorrectionRevision = text(master?.inputRevisions?.corrections);
  const appliesToMaster = Boolean(masterVersion && correction?.baseMasterVersion === masterVersion);
  const appliesToPackage = Boolean(packageId && correction?.basePackageId === packageId
    && correction?.baseMasterVersion === packageMasterVersion);
  const correctionRevision = appliesToPackage ? text(correction.revision) : "";
  const details = {
    available: available === true,
    referenceRelease,
    masterReferenceRelease: masterReference,
    masterVersion,
    packageMasterVersion,
    packageId,
    correctionRevision,
    masterCorrectionRevision: appliesToMaster ? text(correction.revision) : baseCorrectionRevision,
    correctionMode: appliesToPackage ? "overlay" : "base",
    taxonCount: Number(packageManifest?.taxonCount) || 0,
  };
  const result = (state, reason, message) => ({ ...details, state, reason, message });
  if (runtime === "updating") return result("updating", "running-update", "Datenbank-Aktualisierung läuft. Aktiver Datenstand wird noch geprüft.");
  if (runtime === "unverified") return result("unverifiable", "update-state-unknown", "Update-Status nicht sicher prüfbar. Bitte im Arten-Explorer prüfen.");
  if (!available) return result("missing", "package-missing", "Lightroom-Suchpaket fehlt. Bitte im Arten-Explorer bereitstellen.");
  if (readError) return result("unverifiable", "version-read-failed", "Datenstand nicht prüfbar. Versionsangaben fehlen oder sind nicht lesbar.");
  if (!referenceRelease || !masterVersion || !masterReference || !packageId || !packageMasterVersion
      || ![2, 3].includes(master?.schemaVersion) || reference?.schemaVersion !== 1 || packageManifest?.schemaVersion !== 1) {
    return result("unverifiable", "version-incomplete", "Datenstand nicht prüfbar. Versionsangaben fehlen oder sind nicht unterstützt.");
  }
  if (referenceRelease !== masterReference) return result("stale", "reference-master-drift", "Masterdatenbank passt nicht zur aktiven CoL-Referenz. Im Arten-Explorer aktualisieren.");
  if (masterVersion !== packageMasterVersion) return result("stale", "master-package-drift", "Lightroom-Suchpaket passt nicht zum aktiven Master. Im Arten-Explorer aktualisieren.");
  if (appliesToMaster && (!appliesToPackage || !text(correction.revision))) {
    return result("stale", "correction-drift", "Korrekturstand passt nicht zum Lightroom-Suchpaket. Im Arten-Explorer prüfen.");
  }
  return result("current", "matching-active-versions", "Lokale Datenstände stimmen überein: CoL, Master und Lightroom-Suchpaket.");
}

function runtimeState(marker, now, isProcessAlive) {
  if (marker == null) return "";
  if (marker.schemaVersion !== 1 || typeof marker.active !== "boolean") return "unverified";
  if (!marker.active) return "";
  const age = now - Date.parse(marker.updatedAt);
  if (marker.schemaVersion !== 1 || !Number.isInteger(marker.pid) || marker.pid < 1
      || !Number.isFinite(age) || age < 0 || age > 30_000 || !isProcessAlive(marker.pid)) return "unverified";
  return "updating";
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function readTaxonomyDataVersions({ searchRoot, taxonomyRoot = path.join(path.dirname(path.resolve(searchRoot)), "taxonomy"), loadedPackage = null, now = Date.now, isProcessAlive = processAlive, readJson = readVersionJson } = {}) {
  const root = path.resolve(searchRoot);
  const files = [
    [path.join(taxonomyRoot, "active.json")],
    [path.join(taxonomyRoot, "master/active/manifest.json"), { masterHeader: true }],
    [path.join(root, "active/manifest.json")],
    [path.join(path.dirname(root), "corrections/active.json")],
    [path.join(taxonomyRoot, "master/update-presence.json")],
  ];
  const snapshot = async () => {
    const values = await Promise.allSettled(files.map(([file, options]) => readJson(file, options)));
    let readError = values.some((entry, index) => entry.status === "rejected"
      && !(index >= 3 && entry.reason?.code === "ENOENT"));
    const [reference, master, packageManifest, correction, marker] = values.map((entry) => entry.status === "fulfilled" ? entry.value : null);
    if (correction) {
      if (correction.schemaVersion !== 1 || !/^corrections-[a-f0-9]{20}$/.test(text(correction.activeRelease))) {
        readError = true;
      } else if (correction.baseMasterVersion === master?.candidateId
          || correction.basePackageId === packageManifest?.packageId) {
        try {
          const release = await readJson(path.join(path.dirname(root), "corrections/releases", `${correction.activeRelease}.json`));
          if (release.schemaVersion !== 1 || release.releaseId !== correction.activeRelease
              || ["revision", "baseMasterVersion", "basePackageId"].some((key) => release[key] !== correction[key])) readError = true;
        } catch { readError = true; }
      }
    }
    const available = await fs.stat(path.join(root, "active/taxonomy-search.sqlite")).then((stat) => stat.isFile(), () => false);
    return { reference, master, packageManifest, correction, marker, available, readError };
  };
  const before = await snapshot();
  const after = await snapshot();
  const result = compareTaxonomyDataVersions({ ...after, runtime: runtimeState(after.marker, now(), isProcessAlive) });
  // Atomare Dateien können zwischen den Abfragen wechseln. Ein gemischter Stand
  // oder ein noch geöffnetes altes Suchpaket darf nicht als aktuell erscheinen.
  const identity = (value) => JSON.stringify([value.reference, value.master, value.packageManifest, value.correction]);
  if (identity(before) !== identity(after) || (loadedPackage && (
    loadedPackage.packageId !== result.packageId || loadedPackage.masterVersion !== result.packageMasterVersion
    || (loadedPackage.correctionRevision || "") !== result.correctionRevision
  ))) return { ...result, state: "updating", reason: "versions-changed", message: "Datenstand hat sich während der Prüfung geändert. Bitte erneut prüfen." };
  return result;
}
