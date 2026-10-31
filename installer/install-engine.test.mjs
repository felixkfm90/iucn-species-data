import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { assertTestTempPath, tmpdir } from "../scripts/test-temp.mjs";
import { installPackage, PRODUCT_ID, safeRelative } from "./install-engine.mjs";
import { packageKind, sourceAllowed } from "./build.mjs";

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "setup-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  return { root, base: path.join(root, "Felix und Jörg", "Arten Explorer"),
    async package(id = "v1", overrides = {}) {
      const packageRoot = path.join(root, `payload-${id}`);
      const files = { "program/Arten-Explorer.exe": `launcher-${id}`, "program/install-engine.mjs": `engine-${id}`,
        "workspace/species-explorer/server.mjs": `server-${id}`, "workspace/runtime/node/node.exe": `node-${id}`,
        "workspace/species_list.json": `["species-${id}"]\n`, "workspace/species-assets/a/map.svg": `<svg>${id}</svg>`,
        "workspace/.git/HEAD": "ref: refs/heads/main\n", ...overrides };
      const manifest = { schemaVersion: 1, productId: PRODUCT_ID, packageId: id, revision: id, preview: true, files: [] };
      for (const [relative, contents] of Object.entries(files)) {
        const filename = path.join(packageRoot, relative);
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, contents);
        manifest.files.push({ path: relative, kind: packageKind(relative), bytes: Buffer.byteLength(contents), sha256: sha(contents) });
      }
      await fs.writeFile(path.join(packageRoot, "manifest.json"), JSON.stringify(manifest));
      return packageRoot;
    },
  };
}

test("vollständige Erstinstallation verwendet echte Dateien auch mit Leerzeichen und Umlauten, ohne native Registrierung", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  const result = await installPackage({ packageRoot, base: f.base, testMode: true });
  assert.equal(result.status, "installed");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/species-explorer/server.mjs"), "utf8"), "server-v1");
  const state = JSON.parse(await fs.readFile(path.join(f.base, "installation.json"), "utf8"));
  assert.equal(state.nativeRegistration, "skipped-test-mode");
  const runtime = JSON.parse(await fs.readFile(path.join(f.base, "workspace/installer-runtime.json"), "utf8"));
  assert.equal(runtime.nodePath, path.join(f.base, "workspace/runtime/node/node.exe"));
  assert.equal(runtime.dataInitialization, "shared-service-required");
  await assert.rejects(fs.access(path.join(f.base, "workspace/data")), { code: "ENOENT" });
  assert.deepEqual((await fs.readdir(f.base)).sort(), ["installation.json", "program", "workspace"]);
});

test("Update ersetzt Programme und erhält fachliche Dateien, private Daten, Einstellungen und Git-Zustand", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package(), base: f.base, testMode: true });
  const originals = { "workspace/species_list.json": "eigene Arten", "workspace/data/private.sqlite": "private Datenbank",
    "workspace/species-explorer/local-settings.json": "eigene Einstellungen", "workspace/.git/HEAD": "eigener Commit",
    "workspace/.env": "private Konfiguration", "workspace/storage-path.json": "eigener Datenpfad", "workspace/species-assets/a/map.svg": "eigene Karte" };
  for (const [relative, text] of Object.entries(originals)) {
    await fs.mkdir(path.dirname(path.join(f.base, relative)), { recursive: true });
    await fs.writeFile(path.join(f.base, relative), text);
  }
  const result = await installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true });
  assert.equal(result.packageId, "v2");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/species-explorer/server.mjs"), "utf8"), "server-v2");
  for (const [relative, text] of Object.entries(originals)) assert.equal(await fs.readFile(path.join(f.base, relative), "utf8"), text);
});

test("veränderte Programmdatei stoppt ein Update vor dem ersten Kopieren", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package(), base: f.base, testMode: true });
  const source = path.join(f.base, "workspace/species-explorer/server.mjs");
  await fs.writeFile(source, "eigene Programmänderung");
  const state = await fs.readFile(path.join(f.base, "installation.json"), "utf8");
  await assert.rejects(installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true }), /Vorhandene Änderung bleibt erhalten/);
  assert.equal(await fs.readFile(source, "utf8"), "eigene Programmänderung");
  assert.equal(await fs.readFile(path.join(f.base, "program/Arten-Explorer.exe"), "utf8"), "launcher-v1");
  assert.equal(await fs.readFile(path.join(f.base, "installation.json"), "utf8"), state);
});

test("Reparatur stellt fehlende Programme wieder her und erfindet keine gelöschten Fachinhalte", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await installPackage({ packageRoot, base: f.base, testMode: true });
  await fs.rm(path.join(f.base, "workspace/runtime/node/node.exe"));
  await fs.rm(path.join(f.base, "workspace/species_list.json"));
  await installPackage({ packageRoot, base: f.base, operation: "repair", testMode: true });
  assert.equal(await fs.readFile(path.join(f.base, "workspace/runtime/node/node.exe"), "utf8"), "node-v1");
  await assert.rejects(fs.access(path.join(f.base, "workspace/species_list.json")), { code: "ENOENT" });
  await assert.rejects(installPackage({ packageRoot: await f.package("v2"), base: f.base, operation: "repair", testMode: true }), /genau das installierte Paket/);
});

test("Deinstallation erhält den gesamten Arbeitsbestand; erneute Installation verbindet ihn wieder", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await installPackage({ packageRoot, base: f.base, testMode: true });
  await fs.mkdir(path.join(f.base, "workspace/data"));
  await fs.writeFile(path.join(f.base, "workspace/data/private.sqlite"), "geschützt");
  const result = await installPackage({ base: f.base, operation: "uninstall", testMode: true });
  assert.equal(result.status, "uninstalled-data-retained");
  await assert.rejects(fs.access(path.join(f.base, "program/Arten-Explorer.exe")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(f.base, "workspace/data/private.sqlite"), "utf8"), "geschützt");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/species-explorer/server.mjs"), "utf8"), "server-v1");
  await installPackage({ packageRoot, base: f.base, testMode: true });
  assert.equal(await fs.readFile(path.join(f.base, "program/Arten-Explorer.exe"), "utf8"), "launcher-v1");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/data/private.sqlite"), "utf8"), "geschützt");
});

test("Kopierabbruch nimmt ein teilweise geschriebenes Update vollständig zurück", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package(), base: f.base, testMode: true });
  const state = await fs.readFile(path.join(f.base, "installation.json"), "utf8");
  await assert.rejects(installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true, failAfterWrites: 2 }), /Kopierabbruch/);
  assert.equal(await fs.readFile(path.join(f.base, "program/Arten-Explorer.exe"), "utf8"), "launcher-v1");
  assert.equal(await fs.readFile(path.join(f.base, "program/install-engine.mjs"), "utf8"), "engine-v1");
  assert.equal(await fs.readFile(path.join(f.base, "installation.json"), "utf8"), state);
  assert.ok(!(await fs.readdir(f.base)).some((name) => name.startsWith(".installer")));
});

test("Update entfernt nur unveränderte entfallene Programme und erhält abweichende Altdateien", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package("v1", { "program/old.exe": "alt", "program/custom.exe": "alt" }), base: f.base, testMode: true });
  await fs.writeFile(path.join(f.base, "program/custom.exe"), "eigene Änderung");
  await installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true });
  await assert.rejects(fs.access(path.join(f.base, "program/old.exe")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(f.base, "program/custom.exe"), "utf8"), "eigene Änderung");
  const state = JSON.parse(await fs.readFile(path.join(f.base, "installation.json"), "utf8"));
  assert.ok(state.files.some((entry) => entry.path === "program/custom.exe"));
});

test("gleich benanntes abweichendes Paket ist keine Reparatur desselben gebundenen Standes", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await installPackage({ packageRoot, base: f.base, testMode: true });
  const filename = path.join(packageRoot, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(filename, "utf8"));
  manifest.revision = "anderer Quellstand";
  await fs.writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(installPackage({ packageRoot, base: f.base, operation: "repair", testMode: true }), /genau das installierte Paket/);
});

test("beschädigtes Paket und private Daten im Paket werden vor der Installation abgewiesen", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await fs.writeFile(path.join(packageRoot, "program/Arten-Explorer.exe"), "manipuliert");
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /Paketdatei beschädigt/);
  await assert.rejects(fs.access(f.base), { code: "ENOENT" });
  const privatePackage = await f.package("private", { "workspace/data/private.sqlite": "darf nicht mit" });
  await assert.rejects(installPackage({ packageRoot: privatePackage, base: f.base, testMode: true }), /Private Laufzeitdatei/);
});

test("unbekannter vorhandener Bestand, laufende App und Installersperre bleiben geschützt", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await fs.mkdir(f.base, { recursive: true });
  await fs.writeFile(path.join(f.base, "historischer-bestand.txt"), "erhalten");
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /bereits Dateien/);
  await fs.rm(path.join(f.base, "historischer-bestand.txt"));
  await installPackage({ packageRoot, base: f.base, testMode: true });
  await fs.writeFile(path.join(f.base, "app-running.json"), JSON.stringify({ pid: process.pid }));
  await assert.rejects(installPackage({ base: f.base, operation: "uninstall", testMode: true }), /vor Installation/);
  await fs.rm(path.join(f.base, "app-running.json"));
  await fs.writeFile(path.join(f.base, ".installer.lock"), "anderer Installer");
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /weitere Einrichtung/);
  assert.equal(await fs.readFile(path.join(f.base, ".installer.lock"), "utf8"), "anderer Installer");
});

test("Verzeichnisverknüpfungen im Ziel werden nicht beschrieben", async (t) => {
  const f = await fixture(t), packageRoot = await f.package(), elsewhere = path.join(f.root, "anderes-ziel");
  await fs.mkdir(elsewhere);
  await fs.mkdir(path.dirname(f.base), { recursive: true });
  let nativeLink = false;
  try {
    await fs.symlink(elsewhere, f.base, process.platform === "win32" ? "junction" : "dir");
    nativeLink = true;
  } catch (error) {
    if (!["EPERM", "EACCES"].includes(error.code)) throw error;
    t.diagnostic("Native Verknüpfung ist in dieser Umgebung gesperrt; lstat meldet für diese eine eigene Fixture injiziert einen Link.");
    const original = fs.lstat;
    t.mock.method(fs, "lstat", async (filename, ...args) => path.resolve(filename) === path.resolve(f.base)
      ? { isSymbolicLink: () => true } : original(filename, ...args));
  }
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /Verzeichnisverknüpfungen/);
  assert.deepEqual(await fs.readdir(elsewhere), []);
  if (nativeLink) await fs.unlink(f.base);
});

test("Pfadprüfung und Quellenauswahl schließen private, fremde und mehrdeutige Namen aus", () => {
  for (const candidate of ["../outside", "workspace/../outside", "workspace/C:/file", "workspace/NUL.txt", "workspace/a.", "/root", "workspace/a\\b", "workspace/a//b"]) assert.throws(() => safeRelative(candidate));
  for (const candidate of ["data/a.mjs", "Daten/b.json", ".env", ".env.example", "storage-path.json", "species-explorer/local-settings.json", "species-explorer/logs/a.txt", "taxonomy-data/a.db", "installer/build/a.exe", "node_modules/electron/index.js"]) assert.equal(sourceAllowed(candidate), false, candidate);
  for (const candidate of ["species-explorer/server.mjs", "lightroom-plugin/FNWildlifeTaxonomy.lrplugin/Info.lua", "species_list.json", "docs/manual-map-overrides.md"]) assert.equal(sourceAllowed(candidate), true, candidate);
  assert.equal(packageKind("workspace/speciesData.json"), "seed");
  assert.equal(packageKind("workspace/species-assets/a/map.svg"), "seed");
  assert.equal(packageKind("workspace/runtime/node/node.exe"), "program");
});
