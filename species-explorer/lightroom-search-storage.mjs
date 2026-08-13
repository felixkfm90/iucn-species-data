import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { atomicWriteJson } from "./taxonomy-storage.mjs";

export const LIGHTROOM_SEARCH_SCHEMA_VERSION = 1;

const SLOTS = Object.freeze({
  active: "active",
  staging: "staging",
  previous: "previous",
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

function isRetryableWindowsError(error) {
  return ["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code);
}

export function defaultLightroomSearchRoot(environment = process.env) {
  const configured = String(environment.FN_LIGHTROOM_SEARCH_ROOT ?? "").trim();
  if (configured) return path.resolve(configured);
  const localAppData = String(environment.LOCALAPPDATA ?? "").trim();
  if (localAppData) {
    return path.join(localAppData, "FN Wildlife Travel", "Arten-Explorer", "lightroom");
  }
  return path.join(os.homedir(), ".fn-wildlife-travel", "arten-explorer", "lightroom");
}

export function lightroomSearchSlotDirectory(searchRoot, slot = "active") {
  const directory = SLOTS[slot];
  if (!directory) throw new Error(`Unbekannter Lightroom-Suchpaketplatz: ${slot}`);
  return path.join(path.resolve(searchRoot), directory);
}

export function lightroomSearchDatabasePath(searchRoot, slot = "active") {
  return path.join(lightroomSearchSlotDirectory(searchRoot, slot), "taxonomy-search.sqlite");
}

export function lightroomSearchManifestPath(searchRoot, slot = "active") {
  return path.join(lightroomSearchSlotDirectory(searchRoot, slot), "manifest.json");
}

export function assertManagedLightroomSearchPath(searchRoot, targetPath) {
  const root = path.resolve(searchRoot);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (target === root) return target;
    throw new Error(`Lightroom-Suchpaketpfad liegt außerhalb des verwalteten Bereichs: ${target}`);
  }
  return target;
}

export async function readLightroomSearchManifest(searchRoot, slot = "active") {
  try {
    const text = await fs.readFile(lightroomSearchManifestPath(searchRoot, slot), "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (isMissing(error)) return null;
    throw new Error(`Lightroom-Suchpaketmanifest ist ungültig: ${error.message}`, {
      cause: error,
    });
  }
}

export async function sha256File(filePath, { signal } = {}) {
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(filePath);
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      hash.update(chunk);
    }
    return hash.digest("hex");
  } finally {
    stream.destroy();
  }
}

async function safeRemove(searchRoot, targetPath, { retries = 8 } = {}) {
  const target = assertManagedLightroomSearchPath(searchRoot, targetPath);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableWindowsError(error) || attempt >= retries) throw error;
      await delay(60 * (attempt + 1));
    }
  }
}

async function safeRename(searchRoot, sourcePath, targetPath, { retries = 8 } = {}) {
  const source = assertManagedLightroomSearchPath(searchRoot, sourcePath);
  const target = assertManagedLightroomSearchPath(searchRoot, targetPath);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(source, target);
      return;
    } catch (error) {
      if (!isRetryableWindowsError(error) || attempt >= retries) throw error;
      await delay(60 * (attempt + 1));
    }
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function prepareLightroomSearchStaging(searchRoot) {
  const root = path.resolve(searchRoot);
  const staging = lightroomSearchSlotDirectory(root, "staging");
  await fs.mkdir(root, { recursive: true });
  await safeRemove(root, staging);
  await fs.mkdir(staging, { recursive: true });
  return staging;
}

export async function activateLightroomSearchPackage(searchRoot, {
  verify,
  now = () => new Date(),
} = {}) {
  if (typeof verify !== "function") {
    throw new TypeError("Vor der Aktivierung ist eine Suchpaketprüfung erforderlich.");
  }
  const root = path.resolve(searchRoot);
  const staging = lightroomSearchSlotDirectory(root, "staging");
  const active = lightroomSearchSlotDirectory(root, "active");
  const previous = lightroomSearchSlotDirectory(root, "previous");
  const displaced = path.join(root, `.previous-displaced-${crypto.randomUUID()}`);
  const verification = await verify({ searchRoot: root, slot: "staging" });
  const stagingManifest = await readLightroomSearchManifest(root, "staging");
  if (!stagingManifest) {
    throw new Error("Das geprüfte Lightroom-Suchpaket besitzt kein Manifest.");
  }
  await atomicWriteJson(lightroomSearchManifestPath(root, "staging"), {
    ...stagingManifest,
    state: "active",
    activatedAt: now().toISOString(),
  });
  const hadActive = await pathExists(active);
  const hadPrevious = await pathExists(previous);
  let movedPrevious = false;
  let movedActive = false;
  try {
    if (hadPrevious) {
      await safeRename(root, previous, displaced);
      movedPrevious = true;
    }
    if (hadActive) {
      await safeRename(root, active, previous);
      movedActive = true;
    }
    await safeRename(root, staging, active);
    if (hadActive) {
      const previousManifest = await readLightroomSearchManifest(root, "previous");
      if (previousManifest) {
        await atomicWriteJson(lightroomSearchManifestPath(root, "previous"), {
          ...previousManifest,
          state: "previous",
        });
      }
    }
    if (movedPrevious) await safeRemove(root, displaced);
  } catch (error) {
    if (movedActive && await pathExists(previous) && !await pathExists(active)) {
      await safeRename(root, previous, active).catch(() => {});
    }
    if (movedPrevious && await pathExists(displaced) && !await pathExists(previous)) {
      await safeRename(root, displaced, previous).catch(() => {});
    }
    throw error;
  }
  return {
    ...verification,
    manifest: await readLightroomSearchManifest(root, "active"),
    previousAvailable: hadActive,
  };
}

export async function rollbackLightroomSearchPackage(searchRoot, {
  verify,
  now = () => new Date(),
} = {}) {
  if (typeof verify !== "function") {
    throw new TypeError("Vor dem Rollback ist eine Suchpaketprüfung erforderlich.");
  }
  const root = path.resolve(searchRoot);
  const active = lightroomSearchSlotDirectory(root, "active");
  const previous = lightroomSearchSlotDirectory(root, "previous");
  if (!await pathExists(previous)) {
    throw new Error("Es ist kein vorheriges Lightroom-Suchpaket vorhanden.");
  }
  await verify({ searchRoot: root, slot: "previous" });
  const displaced = path.join(root, `.active-displaced-${crypto.randomUUID()}`);
  await safeRename(root, active, displaced);
  try {
    await safeRename(root, previous, active);
    await safeRename(root, displaced, previous);
  } catch (error) {
    if (await pathExists(displaced) && !await pathExists(active)) {
      await safeRename(root, displaced, active).catch(() => {});
    }
    throw error;
  }
  const activeManifest = await readLightroomSearchManifest(root, "active");
  await atomicWriteJson(lightroomSearchManifestPath(root, "active"), {
    ...activeManifest,
    state: "active",
    rolledBackAt: now().toISOString(),
  });
  const previousManifest = await readLightroomSearchManifest(root, "previous");
  if (previousManifest) {
    await atomicWriteJson(lightroomSearchManifestPath(root, "previous"), {
      ...previousManifest,
      state: "previous",
    });
  }
  return verify({ searchRoot: root, slot: "active" });
}

export async function inspectLightroomSearchPackages(searchRoot) {
  const [active, previous, staging] = await Promise.all([
    readLightroomSearchManifest(searchRoot, "active"),
    readLightroomSearchManifest(searchRoot, "previous"),
    readLightroomSearchManifest(searchRoot, "staging"),
  ]);
  return { active, previous, staging };
}

export async function discardLightroomRollbackProbe(searchRoot) {
  const root = path.resolve(searchRoot);
  const manifest = await readLightroomSearchManifest(root, "previous");
  if (!manifest?.rollbackProbe) return false;
  await safeRemove(root, lightroomSearchSlotDirectory(root, "previous"));
  return true;
}

export const lightroomSearchStorageInternals = Object.freeze({
  pathExists,
  safeRemove,
  safeRename,
});
