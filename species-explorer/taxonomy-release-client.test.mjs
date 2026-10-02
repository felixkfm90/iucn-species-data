import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  downloadCatalogueArchive,
  discoverLatestCatalogueRelease,
  newestCatalogueRelease,
  normalizeCatalogueRelease,
  taxonomyReleaseClientInternals,
} from "./taxonomy-release-client.mjs";

test("Releaseauswahl verwendet ausschließlich das neueste CoL-XR-Release", () => {
  const latest = newestCatalogueRelease([
    { key: 2, issued: "2026-07-01", alias: "alt", origin: "xrelease" },
    { key: 3, issued: "2026-07-20", alias: "Basis", origin: "release" },
    { key: 4, issued: "2026-07-17", alias: "neu", origin: "xrelease", size: 7_000_000 },
  ]);
  assert.equal(latest.releaseId, "col-xr-2026-07-17-4");
  assert.equal(latest.alias, "neu");
  assert.equal(latest.expectedNameUsages, 7_000_000);
  assert.match(latest.exportUrl, /dataset\/4\/export\.zip/);
});

test("Startprüfung lädt nur kleine Metadaten und verwendet danach den Cache", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-release-check-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const cachePath = path.join(root, "release-check.json");
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          result: [
            {
              key: 315834,
              issued: "2026-07-17",
              alias: "COL26.7 XR",
              origin: "xrelease",
              size: 7_200_000,
            },
          ],
        };
      },
    };
  };
  const now = () => new Date("2026-07-26T08:00:00.000Z");
  const first = await discoverLatestCatalogueRelease({
    fetchImpl,
    cachePath,
    now,
  });
  assert.equal(first.cached, false);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], taxonomyReleaseClientInternals.RELEASE_QUERY);
  assert.doesNotMatch(urls[0], /export\.zip/);

  const second = await discoverLatestCatalogueRelease({
    fetchImpl: async () => {
      throw new Error("Der Cache hätte den Netzwerkabruf verhindern müssen.");
    },
    cachePath,
    now,
  });
  assert.equal(second.cached, true);
  assert.equal(second.latest.releaseId, first.latest.releaseId);
});

test("Downloadweiterleitungen bleiben auf freigegebene ChecklistBank-Ziele begrenzt", () => {
  const {
    isAllowedReleaseUrl,
    isAllowedDownloadUrl,
  } = taxonomyReleaseClientInternals;
  assert.equal(
    isAllowedReleaseUrl(new URL("https://api.checklistbank.org/dataset/315834/export.zip")),
    true,
  );
  assert.equal(
    isAllowedReleaseUrl(new URL("https://example.org/dataset/315834/export.zip")),
    false,
  );
  assert.equal(
    isAllowedDownloadUrl(
      new URL("https://download.checklistbank.org/job/73/01234567-89ab-cdef-0123-456789abcdef.zip"),
    ),
    true,
  );
  assert.equal(
    isAllowedDownloadUrl(new URL("https://download.checklistbank.org/other/file.zip")),
    false,
  );
});

const xrRelease = () => normalizeCatalogueRelease({ key: 316441, issued: "2026-09-25", origin: "xrelease" });
const datedArchive = "https://download.checklistbank.org/col/monthly/2026-09-25_xr_coldp.zip";
const jobArchive = "https://download.checklistbank.org/job/01/01fdd380-aafc-4d74-88b4-84a3e35650a8.zip";
const zipBytes = Buffer.from("504b030400000000", "hex");

async function downloadFixture(t, responses, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-release-download-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [], targetPath = path.join(root, "reference.zip");
  return { root, calls, targetPath, run: () => downloadCatalogueArchive({
    release: xrRelease(), targetPath,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      assert.ok(responses.length, "Kein zusätzlicher Download oder Wiederholungsversuch erwartet");
      return responses.shift();
    }, ...extra,
  }) };
}

test("Vorhandene API-Weiterleitung bleibt der erste Downloadweg, ohne Monatsarchivabruf", async (t) => {
  const f = await downloadFixture(t, [new Response(null, { status: 302, headers: { location: jobArchive } }),
    new Response(zipBytes, { headers: { "content-length": String(zipBytes.length) } })]);
  const result = await f.run();
  assert.deepEqual(f.calls.map((call) => call.url), [xrRelease().exportUrl, jobArchive]);
  assert.equal(f.calls[0].options.redirect, "manual");
  assert.equal(f.calls[1].options.redirect, "error");
  assert.equal(result.downloadUrl, jobArchive);
  assert.equal(result.bytes, zipBytes.length);
  assert.deepEqual(await fs.readFile(f.targetPath), zipBytes);
});

test("API-404 verwendet nur das datierte offizielle XR-ColDP-Archiv der gebundenen Release", async (t) => {
  // Das gespeicherte Release braucht kein neues Feld und keinen Cache-Neuaufbau.
  const f = await downloadFixture(t, [new Response(null, { status: 404 }),
    new Response(zipBytes, { headers: { "content-length": String(zipBytes.length) } })]);
  const result = await f.run();
  assert.deepEqual(f.calls.map((call) => call.url), [xrRelease().exportUrl, datedArchive]);
  assert.equal(f.calls[1].options.redirect, "error");
  assert.equal(result.downloadUrl, datedArchive, "Tatsächlich verwendeter Ursprung bleibt nachvollziehbar");
  assert.equal(result.sha256.length, 64);
  assert.deepEqual(await fs.readFile(f.targetPath), zipBytes);
  assert.deepEqual(await fs.readdir(f.root), ["reference.zip"]);
});

test("Fehlende oder widersprüchliche Releasebindungen erlauben keinen Monatsarchiv-Ersatz", async (t) => {
  for (const change of [{ releaseId: "col-other" }, { datasetKey: 316165 },
    { issued: "2026-02-31", releaseId: "col-xr-2026-02-31-316441" },
    { issued: "2026-09-26" }, { issued: "../../latest" }, { origin: "release" }, { format: "DwCA" },
    { exportUrl: "https://api.checklistbank.org/dataset/316165/export.zip?extended=true&format=ColDP" },
    { releaseId: undefined }, { datasetKey: undefined }]) {
    await t.test(JSON.stringify(change), async (st) => {
      const f = await downloadFixture(st, [new Response(null, { status: 404 })], { release: { ...xrRelease(), ...change } });
      await assert.rejects(f.run(), /Downloadweiterleitung/);
      assert.equal(f.calls.length, 1);
      assert.deepEqual(await fs.readdir(f.root), []);
    });
  }
});

test("Sperren, unerlaubte Weiterleitungen und sonstige API-Antworten starten keinen Ersatzabruf", async (t) => {
  for (const response of [new Response(null, { status: 403 }), new Response(null, { status: 200 }),
    new Response(null, { status: 302 }),
    new Response(null, { status: 302, headers: { location: "https://example.org/archive.zip" } }),
    new Response(null, { status: 302, headers: { location: datedArchive } })]) {
    await t.test(`${response.status} ${response.headers.get("location")}`, async (st) => {
      const f = await downloadFixture(st, [response]);
      await assert.rejects(f.run(), /Downloadweiterleitung|nicht erlaubte Downloadadresse/);
      assert.equal(f.calls.length, 1);
    });
  }
});

test("Auch datierte Archive dürfen nicht weiterleiten und müssen erfolgreich antworten", async (t) => {
  for (const status of [302, 403, 404]) await t.test(String(status), async (st) => {
    const f = await downloadFixture(st, [new Response(null, { status: 404 }),
      new Response(null, { status, headers: { location: "https://example.org/archive.zip" } })]);
    await assert.rejects(f.run(), /CoL-Export konnte nicht geladen/);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].options.redirect, "error");
    assert.deepEqual(await fs.readdir(f.root), []);
  });
});

test("Archivlimits und ZIP-Prüfung bleiben im Ersatzweg wirksam; bestehendes Ziel bleibt bei Fehler erhalten", async (t) => {
  for (const [name, response, extra, error] of [
    ["leer", new Response(Buffer.alloc(0)), {}, /Archiv ist leer/],
    ["HTML", new Response("<html>keine Daten</html>"), {}, /kein gültiges ZIP/],
    ["zu groß angekündigt", new Response(zipBytes, { headers: { "content-length": "100" } }), { maxBytes: 8 }, /größer als/],
    ["zu groß gestreamt", new Response(zipBytes), { maxBytes: 4 }, /überschreitet/],
  ]) await t.test(name, async (st) => {
    const f = await downloadFixture(st, [new Response(null, { status: 404 }), response], extra);
    await fs.writeFile(f.targetPath, "vorhandenes Archiv");
    await assert.rejects(f.run(), error);
    assert.equal(await fs.readFile(f.targetPath, "utf8"), "vorhandenes Archiv");
    assert.deepEqual(await fs.readdir(f.root), ["reference.zip"], "Keine unvollständige .part-Datei zurücklassen");
  });
});

test("Unterbrochener Ersatzdownload hinterlässt kein Teilarchiv und kann erneut ausgeführt werden", async (t) => {
  const broken = new ReadableStream({ start(controller) {
    controller.enqueue(zipBytes);
    controller.error(new Error("Übertragung abgebrochen"));
  } });
  const f = await downloadFixture(t, [new Response(null, { status: 404 }), new Response(broken),
    new Response(null, { status: 404 }), new Response(zipBytes)]);
  await assert.rejects(f.run(), /Übertragung abgebrochen/);
  assert.deepEqual(await fs.readdir(f.root), []);
  await f.run();
  assert.deepEqual(await fs.readFile(f.targetPath), zipBytes);
  assert.deepEqual(await fs.readdir(f.root), ["reference.zip"]);
});
