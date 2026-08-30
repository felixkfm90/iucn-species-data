import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson } from "./taxonomy-storage.mjs";

export const LIGHTROOM_CORRECTION_HANDOFF_SCHEMA_VERSION = 1;
export const LIGHTROOM_CORRECTION_HANDOFF_TTL_MS = 15 * 60 * 1000;
export const LIGHTROOM_CORRECTION_HANDOFF_MAX_BYTES = 8 * 1024;
export const LIGHTROOM_CORRECTION_REQUEST_ARGUMENT = "taxonomy-correction-request";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TAXON_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,159}$/i;

function cleanText(value, maximumLength = 240) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, maximumLength);
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} ist ungültig.`);
  return date;
}

export function defaultLightroomCorrectionHandoffRoot(environment = process.env) {
  const configured = cleanText(environment.FN_LIGHTROOM_CORRECTION_HANDOFF_ROOT, 1024);
  if (configured) return path.resolve(configured);
  const localAppData = cleanText(environment.LOCALAPPDATA, 1024);
  if (localAppData) {
    return path.join(localAppData, "FN Wildlife Travel", "Arten-Explorer", "handoff");
  }
  return path.join(os.homedir(), ".fn-wildlife-travel", "arten-explorer", "handoff");
}

export function assertLightroomCorrectionRequestId(value) {
  const requestId = cleanText(value, 80);
  if (!UUID_PATTERN.test(requestId)) {
    throw new Error("Die Lightroom-Korrekturanfrage besitzt keine gültige Kennung.");
  }
  return requestId.toLowerCase();
}

export function lightroomCorrectionHandoffPath(handoffRoot, requestId) {
  return path.join(path.resolve(handoffRoot), `${assertLightroomCorrectionRequestId(requestId)}.json`);
}

export function normalizeLightroomCorrectionHandoff(value, {
  now = () => new Date(),
  requireCurrent = true,
} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Die Lightroom-Korrekturanfrage ist kein gültiges Objekt.");
  }
  if (Number(value.schemaVersion) !== LIGHTROOM_CORRECTION_HANDOFF_SCHEMA_VERSION) {
    throw new Error("Die Version der Lightroom-Korrekturanfrage wird nicht unterstützt.");
  }
  const requestId = assertLightroomCorrectionRequestId(value.requestId);
  const masterTaxonId = cleanText(value.masterTaxonId, 160);
  if (!TAXON_ID_PATTERN.test(masterTaxonId)) {
    throw new Error("Die Lightroom-Korrekturanfrage besitzt keine gültige Master-Taxon-ID.");
  }
  const acceptedScientificName = cleanText(value.acceptedScientificName, 240);
  if (!acceptedScientificName) {
    throw new Error("Der wissenschaftliche Name der Lightroom-Korrekturanfrage fehlt.");
  }
  const rank = cleanText(value.rank, 80).toLowerCase();
  if (rank !== "species") {
    throw new Error("Namenskorrekturen aus Lightroom sind ausschließlich für Arten zulässig.");
  }
  const createdAt = normalizeDate(value.createdAt, "Erstellungszeit");
  const expiresAt = normalizeDate(value.expiresAt, "Ablaufzeit");
  if (expiresAt.getTime() <= createdAt.getTime()) {
    throw new Error("Die Gültigkeitsdauer der Lightroom-Korrekturanfrage ist ungültig.");
  }
  if (expiresAt.getTime() - createdAt.getTime() > LIGHTROOM_CORRECTION_HANDOFF_TTL_MS) {
    throw new Error("Die Lightroom-Korrekturanfrage ist länger als zulässig gültig.");
  }
  if (requireCurrent) {
    const currentTime = normalizeDate(now(), "Aktuelle Zeit").getTime();
    if (createdAt.getTime() > currentTime + 60_000) {
      throw new Error("Die Lightroom-Korrekturanfrage liegt unzulässig in der Zukunft.");
    }
    if (expiresAt.getTime() <= currentTime) {
      throw new Error("Die Lightroom-Korrekturanfrage ist abgelaufen.");
    }
  }
  return Object.freeze({
    schemaVersion: LIGHTROOM_CORRECTION_HANDOFF_SCHEMA_VERSION,
    requestId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    masterTaxonId,
    acceptedScientificName,
    rank,
    kingdom: cleanText(value.kingdom, 120) || null,
    germanName: cleanText(value.germanName, 120) || null,
    englishName: cleanText(value.englishName, 120) || null,
    packageId: cleanText(value.packageId, 160),
    masterVersion: cleanText(value.masterVersion, 160),
  });
}

export function parseLightroomCorrectionRequestIds(args = []) {
  const prefix = `--${LIGHTROOM_CORRECTION_REQUEST_ARGUMENT}=`;
  const requestIds = [];
  const seen = new Set();
  for (const argument of args) {
    const text = String(argument ?? "");
    if (!text.startsWith(prefix)) continue;
    try {
      const requestId = assertLightroomCorrectionRequestId(text.slice(prefix.length));
      if (!seen.has(requestId)) {
        seen.add(requestId);
        requestIds.push(requestId);
      }
    } catch {
      // Ungültige Fremdargumente werden nicht als lokale Übergabe interpretiert.
    }
  }
  return requestIds;
}

async function defaultLaunchExplorer(requestId) {
  if (process.platform !== "win32") {
    throw new Error("Der automatische Start des Arten-Explorers wird derzeit nur unter Windows unterstützt.");
  }
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const launcherPath = path.join(repositoryRoot, "species-explorer", "desktop", "start-explorer.vbs");
  const windowsRoot = cleanText(process.env.WINDIR, 1024) || "C:\\Windows";
  const wscriptPath = path.join(windowsRoot, "System32", "wscript.exe");
  await Promise.all([fs.access(launcherPath), fs.access(wscriptPath)]);
  const child = spawn(
    wscriptPath,
    [launcherPath, `--${LIGHTROOM_CORRECTION_REQUEST_ARGUMENT}=${requestId}`],
    {
      cwd: repositoryRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
}

export async function createLightroomCorrectionHandoff({
  taxon,
  packageStatus,
  handoffRoot = defaultLightroomCorrectionHandoffRoot(),
  now = () => new Date(),
  randomUUID = crypto.randomUUID,
  launchExplorer = defaultLaunchExplorer,
} = {}) {
  const createdAt = normalizeDate(now(), "Erstellungszeit");
  const requestId = assertLightroomCorrectionRequestId(randomUUID());
  const payload = normalizeLightroomCorrectionHandoff({
    schemaVersion: LIGHTROOM_CORRECTION_HANDOFF_SCHEMA_VERSION,
    requestId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + LIGHTROOM_CORRECTION_HANDOFF_TTL_MS).toISOString(),
    masterTaxonId: taxon?.masterTaxonId,
    acceptedScientificName: taxon?.acceptedScientificName,
    rank: taxon?.rank,
    kingdom: taxon?.kingdom,
    germanName: taxon?.germanName,
    englishName: taxon?.englishName,
    packageId: packageStatus?.packageId,
    masterVersion: packageStatus?.masterVersion,
  }, { now: () => createdAt });
  const targetPath = lightroomCorrectionHandoffPath(handoffRoot, requestId);
  const encoded = `${JSON.stringify(payload, null, 2)}\n`;
  if (Buffer.byteLength(encoded, "utf8") > LIGHTROOM_CORRECTION_HANDOFF_MAX_BYTES) {
    throw new Error("Die Lightroom-Korrekturanfrage überschreitet die zulässige Größe.");
  }
  await atomicWriteJson(targetPath, payload);
  try {
    await launchExplorer(requestId);
  } catch (error) {
    await fs.rm(targetPath, { force: true }).catch(() => {});
    throw new Error(`Der Arten-Explorer konnte nicht gestartet werden: ${error.message}`, { cause: error });
  }
  return {
    requestId,
    expiresAt: payload.expiresAt,
    launched: true,
  };
}

export async function consumeLightroomCorrectionHandoff(requestId, {
  handoffRoot = defaultLightroomCorrectionHandoffRoot(),
  now = () => new Date(),
} = {}) {
  const targetPath = lightroomCorrectionHandoffPath(handoffRoot, requestId);
  let stats;
  try {
    stats = await fs.lstat(targetPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("Die Lightroom-Korrekturanfrage ist keine reguläre Datei.");
    }
    if (stats.size <= 0 || stats.size > LIGHTROOM_CORRECTION_HANDOFF_MAX_BYTES) {
      throw new Error("Die Lightroom-Korrekturanfrage besitzt eine unzulässige Größe.");
    }
    const payload = JSON.parse(await fs.readFile(targetPath, "utf8"));
    const normalized = normalizeLightroomCorrectionHandoff(payload, { now });
    if (normalized.requestId !== assertLightroomCorrectionRequestId(requestId)) {
      throw new Error("Die Kennung der Lightroom-Korrekturanfrage stimmt nicht überein.");
    }
    await fs.rm(targetPath, { force: true });
    return normalized;
  } catch (error) {
    await fs.rm(targetPath, { force: true }).catch(() => {});
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
