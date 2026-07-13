import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanupManagedExplorerTemp } from "./temp-retention.mjs";

test("bereinigt nur registrierte temporäre Explorer-Einträge", async (context) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "iucn-temp-retention-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(repoRoot, { recursive: true, force: true });
  });
  const staging = path.join(repoRoot, "species-explorer", "staging");
  const pipeline = path.join(repoRoot, "species-explorer", "pipeline-asset-backups");
  const assetBackups = path.join(repoRoot, "species-explorer", "asset-backups");
  await Promise.all([mkdir(staging, { recursive: true }), mkdir(pipeline, { recursive: true }), mkdir(assetBackups, { recursive: true })]);
  const managedFile = path.join(staging, "54a2449d-7601-4206-9f43-242e80d1aaaa.jpg");
  const foreignFile = path.join(staging, "eigene-notiz.txt");
  const managedRun = path.join(pipeline, "2798760e-e1e6-4192-ab0f-8df4587bfda8");
  const restoreBackup = path.join(assetBackups, "Amsel", "map", "map.jpg");
  await writeFile(managedFile, "temp");
  await writeFile(foreignFile, "behalten");
  await mkdir(managedRun, { recursive: true });
  await writeFile(path.join(managedRun, "sound.mp3"), "temp");
  await mkdir(path.dirname(restoreBackup), { recursive: true });
  await writeFile(restoreBackup, "sicherung");

  const report = await cleanupManagedExplorerTemp({ repoRoot, phase: "shutdown" });
  assert.equal(report.removed.length, 2);
  assert.equal(await readFile(foreignFile, "utf8"), "behalten");
  assert.equal(await readFile(restoreBackup, "utf8"), "sicherung");
});

test("Wartung respektiert die Aufbewahrungsfrist", async (context) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "iucn-temp-age-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(repoRoot, { recursive: true, force: true });
  });
  const staging = path.join(repoRoot, "species-explorer", "staging");
  await mkdir(staging, { recursive: true });
  const managedFile = path.join(staging, "54a2449d-7601-4206-9f43-242e80d1aaaa.jpg");
  await writeFile(managedFile, "temp");
  const report = await cleanupManagedExplorerTemp({ repoRoot, phase: "maintenance", now: Date.now(), maxAgeMs: 60_000 });
  assert.equal(report.removed.length, 0);
  assert.equal(await readFile(managedFile, "utf8"), "temp");
});

test("Startbereinigung lässt frische Einträge möglicher laufender Instanzen bestehen", async (context) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "iucn-temp-startup-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(repoRoot, { recursive: true, force: true });
  });
  const staging = path.join(repoRoot, "species-explorer", "staging");
  await mkdir(staging, { recursive: true });
  const managedFile = path.join(staging, "54a2449d-7601-4206-9f43-242e80d1aaaa.jpg");
  await writeFile(managedFile, "temp");

  const report = await cleanupManagedExplorerTemp({ repoRoot, phase: "startup", now: Date.now(), maxAgeMs: 60_000 });
  assert.equal(report.removed.length, 0);
  assert.equal(await readFile(managedFile, "utf8"), "temp");
});
