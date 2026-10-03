import assert from "node:assert/strict";
import test from "node:test";

import { formatSpectrogramPipelineLog, formatPipelineSummary, createPipelineTextReader } from "./pipeline-log.mjs";
import { checkPipelinePublication } from "./pipeline-publication-check.mjs";
import { createEditableFixture, createTestJpeg } from "./server-test-fixtures.mjs";
import { rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { createPipelineController } from "./pipeline-controller.mjs";

test("Prozessausgaben erhalten Umlaute und vollständige Zeilen über beliebige Byte-Grenzen", () => {
  const lines = [], errors = [];
  const stdout = createPipelineTextReader((text) => lines.push(text));
  const stderr = createPipelineTextReader((text) => errors.push(text));
  const text = "Grünfink: zurückgegeben – Unzulässig. 🐦\r\nLetzte Zeile ohne Umbruch";
  for (const byte of Buffer.from(text)) stdout.write(Buffer.from([byte]));
  stderr.write(Buffer.from("Fehler: nicht verfügbar"));
  assert.deepEqual(lines, ["Grünfink: zurückgegeben – Unzulässig. 🐦\r\n"]);
  stdout.end(); stderr.end();
  assert.equal(lines.join(""), text);
  assert.deepEqual(errors, ["Fehler: nicht verfügbar"]);
  assert.doesNotMatch(lines.join(""), /\uFFFD/);
});

test("Spektrogramm-Prozessausgabe wird für die App lesbar zusammengefasst", () => {
  const output = formatSpectrogramPipelineLog(JSON.stringify({
    results: [
      {
        safeName: "Amsel",
        status: "skip",
        inputBytes: 2048,
        outputBytes: 512,
      },
      {
        safeName: "Grüner Leguan",
        status: "missing-mp3",
      },
      {
        safeName: "Bachstelze",
        status: "generated",
        inputBytes: 4096,
        outputBytes: 700,
      },
    ],
    hashRegistry: { updated: 2, changed: true },
  }));
  assert.match(output, /Amsel\n  Sound: vorhanden\n  Spektrogramm: vorhanden/);
  assert.match(output, /Grüner Leguan\n  Sound: fehlt\n  Spektrogramm: übersprungen/);
  assert.match(output, /Bachstelze\n  Sound: vorhanden\n  Spektrogramm: wurde erstellt/);
  assert.match(output, /Spektrogramm-Ergebnis: 1 erstellt, 1 vorhanden, 1 ohne Sound, 0 Fehler/);
  assert.doesNotMatch(output, /"safeName"/);
});

test("Leere und nicht strukturierte Spektrogramm-Ausgaben bleiben verständlich", () => {
  assert.equal(formatSpectrogramPipelineLog(""), "");
  assert.equal(formatSpectrogramPipelineLog("ffmpeg nicht erreichbar"), "ffmpeg nicht erreichbar");
  assert.equal(
    formatSpectrogramPipelineLog(JSON.stringify({ error: "ffmpeg fehlt" })),
    "Spektrogramm-Abgleich: Fehler - ffmpeg fehlt",
  );
});

test("Fehlerhafte Spektrogramm-Jobs werden gezählt und erklärt", () => {
  const output = formatSpectrogramPipelineLog(JSON.stringify({
    jobs: [{ safeName: "Amsel", status: "failed", inputBytes: 100, stderr: "Renderfehler" }],
  }));

  assert.match(output, /Amsel\n  Sound: vorhanden\n  Spektrogramm: Fehler - Renderfehler/);
  assert.match(output, /0 erstellt, 0 vorhanden, 0 ohne Sound, 1 Fehler/);
});

test("Gesamtzusammenfassung trennt Git-Übertragung, fehlende Medien und Fehler", () => {
  const report = { counts: { totalSpecies: 57, missingMap: 1, missingSoundMp3: 2 } };
  const failed = formatPipelineSummary({ exitCode: 1, error: "Karte fehlt", gitPublished: false }, report);
  assert.equal(failed.match(/Gesamtzusammenfassung/g).length, 1);
  assert.match(failed, /nicht vollständig abgeschlossen.*Karte fehlt.*lokale Änderungen.*Gesamtbestand: 57 Arten/s);
  const passed = formatPipelineSummary({ exitCode: 0, gitPublished: true }, report);
  assert.match(passed, /Pages-Deployment sind separat/);
  assert.doesNotMatch(passed, /Deployment abgeschlossen/);
  assert.match(formatPipelineSummary({ exitCode: 0, gitNoChanges: true }), /Keine Übertragung erforderlich/);
});

test("Lokale Veröffentlichungsprüfung verwendet dieselben Medienregeln wie CI", async (t) => {
  const root = await createEditableFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const map = join(root, "species-assets", "Amsel", "map.jpg");
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0); webp.writeUInt32LE(22, 4); webp.write("WEBPVP8X", 8);
  await writeFile(map, createTestJpeg(640, 480));
  await writeFile(join(root, "species-assets", "Amsel", "portrait.webp"), webp);
  await writeFile(join(root, "species-assets", "Amsel", "spectrogram.webp"), webp);
  const before = await readFile(map);
  assert.equal(checkPipelinePublication(root).ok, true);
  assert.deepEqual(await readFile(map), before);
  await rm(map);
  const failed = checkPipelinePublication(root);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /map.jpg: Karte fehlt.*Lokale Änderungen bleiben erhalten/s);
});

test("Explorer unterdrückt nur doppelte Berichte und prüft Medien vor Git-Aktionen", async () => {
  const controller = await readFile(new URL("./pipeline-controller.mjs", import.meta.url), "utf8");
  const update = await readFile(new URL("../update.mjs", import.meta.url), "utf8");
  const publication = controller.slice(controller.indexOf("async function publishPipelineChanges()"), controller.indexOf("async function continueAfterAssetReview()"));
  assert.ok(publication.indexOf("checkPipelinePublication(repoRoot)") < publication.indexOf('runPipelineChild("git"'));
  assert.match(publication, /if \(!preflight.ok\).*return 1/s);
  assert.equal((controller.match(/"--quiet-report"/g) || []).length, 3);
  assert.equal((update.match(/if \(!args.quietReport\) printReportToConsole\(report\)/g) || []).length, 2);
  assert.match(update, /args.mode === "nc-sounds" \? "nicht geprüft"/);
});

test("Transfer stoppt vor Git bei fehlender Karte oder unveröffentlichtem Generator und bleibt wiederholbar", async (t) => {
  const root = await createEditableFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const assets = join(root, "species-assets", "Amsel");
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0); webp.writeUInt32LE(22, 4); webp.write("WEBPVP8X", 8);
  await writeFile(join(assets, "portrait.webp"), webp);
  await writeFile(join(assets, "spectrogram.webp"), webp);
  await rm(join(assets, "map.jpg"));
  const runtime = { state: { status: "idle" }, process: null }, commands = [];
  let finished, cachedChecks = 0;
  let sourcePreflight = { ok: false, message: "Übertragung angehalten: unveröffentlichter Statusgenerator." };
  const controller = createPipelineController({
    repoRoot: root, speciesListPath: join(root, "species_list.json"), assetOverridesPath: join(root, "species-assets-overrides.json"),
    assessmentIdsPath: join(root, "lastSavedAssessmentId.json"), manualMapOverridesPath: join(root, "docs", "manual-map-overrides.md"),
    pipelineLogDir: join(root, "logs"), pipelineAssetBackupRoot: join(root, "backups"), pendingAssetReviewPath: join(root, "review.json"),
    previewTokens: new Map(), previewTokenTtlMs: 600000, pipelineLogLineLimit: 500, runtime,
    getModel: () => ({ species: [] }), refreshModel: async () => { finished?.(); }, cleanupPreviewTokens() {},
    readPendingProjectChanges: async () => ({ files: [{ path: "species_list.json" }], count: 1, error: "" }),
    pendingAssetSpeciesFromFiles: () => [], isPipelineActive: () => false, isBackupActive: () => false, isAssetWriteActive: () => false,
    hashText: (text) => createHash("sha256").update(text).digest("hex"), compactTimestamp: () => "test",
    checkPublicationSources: () => sourcePreflight,
    readJson: async (filename) => JSON.parse(await readFile(filename, "utf8")),
    spawnProcess(command, args) {
      commands.push([command, ...args]);
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      const code = command === "git" && args[0] === "diff" ? (++cachedChecks === 2 ? 1 : 0) : 0;
      setImmediate(() => child.emit("close", code));
      return child;
    },
  });
  const run = async () => {
    const preview = await controller.previewPipeline({ mode: "transfer" });
    const done = new Promise((resolve) => { finished = resolve; });
    await controller.startPipeline({ token: preview.token });
    await done;
  };
  await run();
  assert.equal(runtime.state.status, "failed");
  assert.match(runtime.state.error, /Karte fehlt/);
  assert.equal(commands.length, 0);
  assert.equal(runtime.state.log.filter((line) => line === "Gesamtzusammenfassung").length, 1);
  await writeFile(join(assets, "map.jpg"), createTestJpeg(640, 480));
  await run();
  assert.equal(runtime.state.status, "failed");
  assert.match(runtime.state.error, /unveröffentlichter Statusgenerator/);
  assert.equal(commands.length, 0);
  sourcePreflight = { ok: true, message: "Quellstand für simulierte Veröffentlichung geprüft." };
  await run();
  assert.equal(runtime.state.status, "completed");
  assert.equal(runtime.state.gitPublished, true);
  assert.equal(commands.filter(([command, action]) => command === "git" && action === "push").length, 1);
  assert.equal(runtime.state.log.filter((line) => line === "Gesamtzusammenfassung").length, 1);
});
