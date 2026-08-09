import crypto from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { childProcessEnvironment } from "./child-process-environment.mjs";
import { importAnimaliaFallbacks } from "./taxonomy-animalia-fallback.mjs";
import { downloadInaturalistTaxonomyArchive } from "./taxonomy-inaturalist-client.mjs";
import { listProviderSliceVersions } from "./taxonomy-master-slices.mjs";
import { taxonomyDatabasePath } from "./taxonomy-storage.mjs";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_SCRIPT = path.resolve(MODULE_DIRECTORY, "..", "scripts", "taxonomy-inaturalist-import.mjs");
const INATURALIST_SLICE_BUILD_VERSION = 2;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function progress(onProgress, current, total, message, phase = "providers") {
  onProgress?.({ phase, current, total, message });
}

function combinedInaturalistVersion(providerVersion, colReleaseId) {
  const base = cleanText(providerVersion)
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 92) || "inat-local";
  const colHash = crypto.createHash("sha256").update(cleanText(colReleaseId)).digest("hex").slice(0, 12);
  return `${base}-master-v${INATURALIST_SLICE_BUILD_VERSION}-col-${colHash}`;
}

function parseChildLine(line, onProgress) {
  if (line.startsWith("PROGRESS\t")) {
    const value = JSON.parse(line.slice("PROGRESS\t".length));
    onProgress(value);
    return null;
  }
  if (line.startsWith("RESULT\t")) {
    return JSON.parse(line.slice("RESULT\t".length));
  }
  return null;
}

function readableChildError(stderr, code) {
  const lines = String(stderr || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const explicit = lines.find((line) => /^error:\s*/i.test(line));
  return explicit?.replace(/^error:\s*/i, "")
    || lines.find((line) => !/^at\s+/i.test(line))
    || `Der iNaturalist-Import wurde mit Code ${code} beendet.`;
}

function inputNames({ projectTaxa = [], corrections = [], researchedTaxa = [] } = {}) {
  return [...new Set([
    ...projectTaxa,
    ...corrections,
    ...researchedTaxa,
  ].map((entry) => cleanText(entry?.scientificName || entry)).filter(Boolean))];
}

export class TaxonomyProviderRefreshService {
  constructor({
    taxonomyRoot,
    repoRoot,
    supplementService,
    animaliaFallbackPath = path.join(repoRoot || "", "taxonomy-animalia-fallbacks.json"),
    downloadInaturalist = downloadInaturalistTaxonomyArchive,
    importAnimalia = importAnimaliaFallbacks,
    spawnImpl = spawn,
    execPath = process.execPath,
    now = () => new Date(),
  } = {}) {
    if (!taxonomyRoot || !repoRoot || !supplementService) {
      throw new TypeError("Taxonomiepfad, Projektpfad und Ergänzungsdienst sind erforderlich.");
    }
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.repoRoot = path.resolve(repoRoot);
    this.supplementService = supplementService;
    this.animaliaFallbackPath = path.resolve(animaliaFallbackPath);
    this.downloadInaturalist = downloadInaturalist;
    this.importAnimalia = importAnimalia;
    this.spawnImpl = spawnImpl;
    this.execPath = execPath;
    this.now = now;
    this.child = null;
    this.closed = false;
  }

  async refresh({
    projectTaxa = [],
    corrections = [],
    researchedTaxa = [],
    store,
    onProgress = () => {},
    inaturalistArchivePath = "",
    inaturalistPackageDirectory = "",
    inaturalistProviderVersion = "",
    forceInaturalist = false,
    signal,
  } = {}) {
    if (this.closed) throw new Error("Die Anbieteraktualisierung wurde bereits beendet.");
    if (!store?.status) throw new TypeError("Die aktive CoL-Referenz ist erforderlich.");
    signal?.throwIfAborted();
    const colStatus = store.status();
    const colReleaseId = cleanText(colStatus.releaseId);
    const colDatabase = taxonomyDatabasePath(this.taxonomyRoot, colReleaseId);
    const warnings = [];
    let inaturalistInput = null;
    if (inaturalistArchivePath || inaturalistPackageDirectory) {
      const inputPath = path.resolve(inaturalistArchivePath || inaturalistPackageDirectory);
      inaturalistInput = {
        archivePath: inaturalistArchivePath ? inputPath : "",
        packageDirectory: inaturalistPackageDirectory ? inputPath : "",
        providerVersion: cleanText(inaturalistProviderVersion)
          || `inat-local-${this.now().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`,
        retrievedAt: this.now().toISOString(),
      };
    } else {
      progress(onProgress, 0, 100, "iNaturalist-Namensbestand wird geprüft", "inaturalist-download");
      const downloaded = await this.downloadInaturalist({
        taxonomyRoot: this.taxonomyRoot,
        force: forceInaturalist,
        signal,
        onProgress: ({ current = 0, total = 0, message = "" } = {}) => {
          const fraction = total ? Number(current) / Math.max(1, Number(total)) : 0;
          progress(onProgress, Math.round(fraction * 15), 100, message, "inaturalist-download");
        },
      });
      if (downloaded.warning) warnings.push(downloaded.warning);
      inaturalistInput = {
        archivePath: downloaded.archivePath,
        packageDirectory: "",
        providerVersion: downloaded.providerVersion,
        retrievedAt: downloaded.downloadedAt || downloaded.checkedAt || this.now().toISOString(),
      };
    }
    signal?.throwIfAborted();
    const combinedVersion = combinedInaturalistVersion(
      inaturalistInput.providerVersion,
      colReleaseId,
    );
    const existingVersions = await listProviderSliceVersions(this.taxonomyRoot, "inaturalist");
    let inaturalist = {
      skipped: true,
      providerVersion: combinedVersion,
      reason: "Der iNaturalist-Stand wurde bereits gegen diese CoL-Version abgeglichen.",
    };
    if (!existingVersions.includes(combinedVersion)) {
      inaturalist = await this.runInaturalistChild({
        colDatabase,
        ...inaturalistInput,
        providerVersion: combinedVersion,
        signal,
        onProgress: (entry = {}) => {
          const phaseProgress = Number(entry.total)
            ? Number(entry.current) / Math.max(1, Number(entry.total))
            : 0;
          progress(
            onProgress,
            15 + Math.round(Math.min(1, phaseProgress) * 55),
            100,
            entry.message || "iNaturalist-Lückenbestand wird importiert",
            entry.phase || "inaturalist-import",
          );
        },
      });
    }
    signal?.throwIfAborted();
    const names = inputNames({ projectTaxa, corrections, researchedTaxa });
    const supplements = await this.supplementService.refreshKnown({
      scientificNames: names,
      store,
      onProgress: ({ current = 0, total = 1, message = "" } = {}) => {
        const fraction = Number(current) / Math.max(1, Number(total));
        progress(
          onProgress,
          70 + Math.round(Math.min(1, fraction) * 25),
          100,
          message || "GBIF, WoRMS und Wikidata werden abgeglichen",
          "supplement-providers",
        );
      },
    });
    warnings.push(...(supplements.warnings || []));
    signal?.throwIfAborted();
    const animalia = await this.importAnimalia({
      taxonomyRoot: this.taxonomyRoot,
      fallbackPath: this.animaliaFallbackPath,
      onProgress: ({ message = "" } = {}) => {
        progress(
          onProgress,
          98,
          100,
          message || "Animalia-Fallbacks werden übernommen",
          "animalia",
        );
      },
    });
    if (animalia.warning) warnings.push(animalia.warning);
    progress(onProgress, 100, 100, "Alle lokalen Taxonomiequellen sind versioniert", "complete");
    return {
      colReleaseId,
      inaturalist,
      supplements,
      animalia,
      warnings: [...new Set(warnings.filter(Boolean))],
    };
  }

  runInaturalistChild({
    colDatabase,
    archivePath,
    packageDirectory,
    providerVersion,
    retrievedAt,
    signal,
    onProgress,
  }) {
    return new Promise((resolve, reject) => {
      const args = [
        IMPORT_SCRIPT,
        `--taxonomy-root=${this.taxonomyRoot}`,
        `--col-database=${colDatabase}`,
        `--provider-version=${providerVersion}`,
        `--retrieved-at=${retrievedAt}`,
        archivePath ? `--archive=${archivePath}` : `--package=${packageDirectory}`,
      ];
      const child = this.spawnImpl(this.execPath, args, {
        cwd: this.repoRoot,
        windowsHide: true,
        env: childProcessEnvironment(this.execPath),
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      let stderr = "";
      let result = null;
      const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      const abort = () => {
        if (!child.killed) child.kill();
      };
      signal?.addEventListener("abort", abort, { once: true });
      lines.on("line", (line) => {
        const parsed = parseChildLine(line, onProgress);
        if (parsed) result = parsed;
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => {
        lines.close();
        signal?.removeEventListener("abort", abort);
        this.child = null;
        if (signal?.aborted) {
          reject(signal.reason || new DOMException("Abgebrochen", "AbortError"));
          return;
        }
        if (code !== 0) {
          reject(new Error(readableChildError(stderr, code)));
          return;
        }
        if (!result?.providerVersion) {
          reject(new Error("Der iNaturalist-Import hat kein gültiges Ergebnis geliefert."));
          return;
        }
        resolve(result);
      });
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.child && !this.child.killed) this.child.kill();
  }
}

export function createTaxonomyProviderRefreshService(options) {
  return new TaxonomyProviderRefreshService(options);
}

export const taxonomyProviderRefreshInternals = Object.freeze({
  combinedInaturalistVersion,
  inputNames,
  parseChildLine,
  readableChildError,
});
