import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { assertPublicHttpUrl } from "../species-explorer/request-security.mjs";
import { createTestJpeg } from "../species-explorer/server-test-fixtures.mjs";
import { iucnBrowserAccessError } from "./iucn-map-access.mjs";
import { createIucnDataAdapter } from "./iucn-data-adapter.mjs";
import {
  createIucnMapAdapter,
  extractCachedIucnMapUrls,
  isJpegBuffer,
  taxonIdFromTaxon,
} from "./iucn-map-adapter.mjs";
import { createXenoCantoAdapter } from "./xeno-canto-adapter.mjs";
import { createWikimediaCommonsAudioAdapter } from "./wikimedia-commons-audio-adapter.mjs";
import { createINaturalistAudioAdapter } from "./inaturalist-audio-adapter.mjs";
import {
  inatLicenseUrl,
  isNcLicense,
  isOpenCommercialLicense,
  normalizeLicenseUrl,
} from "./sound-source-license.mjs";
import {
  commonsSoundRejectionKey,
  normalizeSoundRejectionKey,
} from "./sound-rejection-key.mjs";

const noWait = async () => {};
const publicUrl = value => assertPublicHttpUrl(value, {
  lookup: async () => [{ address: "8.8.8.8", family: 4 }],
});
const mapUrl = "https://www.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg";
function validMapJpeg() {
  const image = createTestJpeg(640, 480);
  // A legal JPEG comment keeps the adapter's existing 10-kB minimum while
  // preserving actual compressed image data for the shared decoder.
  return Buffer.concat([image.subarray(0, 2), Buffer.from([0xff, 0xfe, 0x30, 0x02]),
    Buffer.alloc(0x3000, 32), image.subarray(2)]);
}
function mapAdapter(options) {
  return createIucnMapAdapter({ iucnGET: async () => null, sleep: noWait,
    sanitizeAssetName: value => value, speciesAssetDir: () => tmpdir(), ensureDir() {},
    isManualAsset: () => false, platform: "linux", validateUrl: publicUrl,
    logger: { log() {}, warn() {}, error() {} }, ...options });
}
async function assertMapSessionsClosed(root) {
  const directory = path.join(root, "temp", "explorer");
  for (const session of await fs.readdir(directory)) {
    // Windows may briefly keep a closed file locked. The production contract
    // conservatively retains its owner record; never confuse that with an
    // active helper or erase it to make this assertion pass.
    const sessionDirectory = path.join(directory, session);
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(sessionDirectory, ".fn-temp-session.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      // Cleanup removes the owner file immediately before the empty directory.
      // A removed directory or an empty Windows-locked remainder is finished;
      // any remaining file still requires the complete ownership checks below.
      const entries = await fs.readdir(sessionDirectory).catch((directoryError) => {
        if (directoryError.code === "ENOENT") return [];
        throw directoryError;
      });
      assert.deepEqual(entries, [], "Fehlender Eigentumsnachweis bei nicht leerer Kartensitzung");
      continue;
    }
    assert.equal(manifest.ownership, "fn-wildlife-temp"); assert.equal(manifest.owner, "explorer");
    assert.equal(manifest.sessionId, session); assert.equal(manifest.pid, process.pid);
    assert.equal(manifest.state, "closed"); assert.equal(manifest.operations, 0);
    assert.deepEqual(manifest.helperPids, []);
    assert.deepEqual(manifest.artifacts, [{ relative: "map.jpg", type: "file", durable: false }]);
  }
}

test("Beide Windows-Kartenprozesse geben deutsche Fehlertexte als UTF-8 aus", async () => {
  for (const relative of ["./iucn-map-adapter.mjs", "../species-explorer/media-assets.mjs"]) {
    const source = await fs.readFile(new URL(relative, import.meta.url), "utf8");
    const preamble = source.match(/\[Console\]::OutputEncoding = New-Object System\.Text\.UTF8Encoding\(\$false\)\r?\n\$OutputEncoding = \[Console\]::OutputEncoding/)?.[0];
    assert.ok(preamble, `${relative}: UTF-8 muss vor der Prozessausgabe festgelegt sein`);
    assert.match(source, /encoding: "utf8"/);
    if (process.platform !== "win32") continue;
    // No network or map writes: exercise only the real Windows output boundary.
    const script = `${preamble}\n[pscustomobject]@{ error = ('Unzul' + [char]0xE4 + 'ssig; zur' + [char]0xFC + 'ckgegeben') } | ConvertTo-Json -Compress`;
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8", windowsHide: true, timeout: 15000,
    });
    assert.equal(JSON.parse(stdout).error, "Unzulässig; zurückgegeben");
  }
});

test("IUCN-403 beendet den Pipelineabruf ohne Windows-Fallback und erhält die alte Karte", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "fn-map-blocked-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, "map.jpg"), previous = Buffer.from("bestehende Karte");
  await fs.writeFile(filename, previous);
  let requests = 0, windowsRequests = 0;
  const warnings = [];
  const adapter = createIucnMapAdapter({
    fetch: async () => { requests += 1; return new Response("", { status: 403 }); },
    token: "test-only", iucnGET: async () => null,
    sleep: noWait, sanitizeAssetName: (value) => value, speciesAssetDir: () => root,
    ensureDir() {}, isManualAsset: () => false, platform: "win32",
    validateUrl: publicUrl,
    execFileAsync: async (_command, _args, options) => {
      windowsRequests += 1;
      await fs.writeFile(options.env.IUCN_MAP_OUTFILE, validMapJpeg());
      return { stdout: '{"status":200}' };
    },
    logger: { log() {}, warn: (message) => warnings.push(message), error: (message) => warnings.push(message) },
  });
  assert.equal(await adapter.downloadMapForSpecies({ "Deutscher Name": "Grünfink", "Assessment ID": 132000123 }, { force: true }), "missing");
  assert.equal(requests, 1);
  assert.equal(windowsRequests, 0);
  assert.deepEqual(await fs.readFile(filename), previous);
  assert.match(warnings.join("\n"), /IUCN erlaubt den automatischen Kartenabruf nicht/);
  assert.equal(iucnBrowserAccessError("https://iucnredlist.org.evil.example/map", 403), null);
  assert.equal(iucnBrowserAccessError("https://www.iucnredlist.org/map", 404), null);
});

test("Kartenadapter probiert den im Browser bestätigten www-IUCN-Host zuerst", async () => {
  const urls = [];
  const adapter = createIucnMapAdapter({
    fetch: async (url) => { urls.push(url); return new Response("", { status: 403 }); },
    iucnGET: async () => null, sleep: noWait, token: "test-only", platform: "linux",
    sanitizeAssetName: (value) => value, speciesAssetDir: () => tmpdir(), ensureDir() {}, isManualAsset: () => false,
    validateUrl: publicUrl,
    logger: { log() {}, warn() {}, error() {} },
  });
  await adapter.downloadMapForSpecies({ "Deutscher Name": "Grünfink", "Assessment ID": 132000123 }, { force: true });
  assert.match(urls[0], /^https:\/\/www\.iucnredlist\.org\//);
});

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: { get: () => "application/json" },
    arrayBuffer: async () => Buffer.from(JSON.stringify(data)),
  };
}

test("Sound-Lizenzregeln unterscheiden frei und NC", () => {
  assert.equal(normalizeLicenseUrl("//creativecommons.org/licenses/by/4.0/"), "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(isNcLicense("https://creativecommons.org/licenses/by-nc-sa/4.0/"), true);
  assert.equal(isOpenCommercialLicense("https://creativecommons.org/licenses/by/4.0/"), true);
  assert.equal(isOpenCommercialLicense("CC-BY-NC"), false);
  assert.equal(inatLicenseUrl("cc-by-sa"), "https://creativecommons.org/licenses/by-sa/4.0/");
});

test("Commons-Ablehnungen erkennen URL- und Titelschreibweisen als dieselbe Quelle", () => {
  const encodedUrl = "wikimedia-commons:https://commons.wikimedia.org/wiki/File:G%C5%82os_dropa.ogg";
  const titleKey = commonsSoundRejectionKey({ title: "File:Głos dropa.ogg" });
  assert.equal(normalizeSoundRejectionKey(encodedUrl), "wikimedia-commons:File:Głos_dropa.ogg");
  assert.equal(titleKey, normalizeSoundRejectionKey(encodedUrl));
});

test("IUCN-Datenadapter normalisiert Assessment und Taxonomie", async () => {
  const requests = [];
  const adapter = createIucnDataAdapter({
    token: "test-token",
    sleep: noWait,
    now: () => new Date("2026-07-18T00:00:00Z"),
    logError: (message) => assert.fail(message),
    emptyEntry: () => assert.fail("Kein Leereintrag erwartet"),
    formatTaxonomyName: (value) => String(value).toLowerCase().replace(/^./, (letter) => letter.toUpperCase()),
    fetch: async (url) => {
      requests.push(url);
      if (url.includes("/taxa/scientific_name")) {
        return jsonResponse({
          taxon: {
            scientific_name: "Turdus merula",
            kingdom_name: "ANIMALIA",
            phylum_name: "CHORDATA",
            subphylum_name: "VERTEBRATA",
            class_name: "AVES",
            order_name: "PASSERIFORMES",
            family_name: "TURDIDAE",
            genus_name: "Turdus",
            species_name: "merula",
          },
          assessments: [{
            assessment_id: 123,
            red_list_category_code: "LC",
            year_published: 2024,
            scopes: [{ description: { en: "Global" } }],
          }],
        });
      }
      return jsonResponse({
        population_trend: { description: { en: "Decreasing" } },
        red_list_category: { code: "LC" },
        supplementary_info: { population_size: "1000-2000", generational_length: 4.5 },
      });
    },
  });
  const result = await adapter.fetchSpeciesData("Turdus", "merula", "Amsel", "ca. 24 cm", "ca. 100 g", "ca. 3 Jahre");
  assert.equal(result["Assessment ID"], 123);
  assert.equal(result.Kategorie, "Nicht gefährdet");
  assert.equal(result.Trend, "Abnehmend");
  assert.equal(result.Populationgröße, "1.000-2.000");
  assert.equal(result.Generationsdauer, "4,5 Jahre");
  assert.equal(result.Kingdom, "Animalia");
  assert.equal(result.Subphylum, "Vertebrata");
  assert.equal(result["Daten abgerufen"], "2026-07-18");
  assert.equal(requests.length, 2);
});

test("IUCN-Kartenadapter erkennt JPEGs, Taxon-IDs und signierte Cache-Links", async () => {
  const jpeg = validMapJpeg();
  assert.equal(isJpegBuffer(jpeg), true);
  assert.equal(taxonIdFromTaxon({ sis_taxon_id: 15951 }), "15951");
  const signed = "https://f002.backblazeb2.com/file/cached-individual-maps/T15951A280792135.jpg?Authorization=test";
  assert.deepEqual(extractCachedIucnMapUrls(`<a href=\"${signed.replaceAll("&", "&amp;")}\">Karte</a>`, "T15951A280792135.jpg"), [signed]);

  const adapter = createIucnMapAdapter({
    fetch: async () => new Response(jpeg, { headers: { "content-type": "image/jpeg" } }),
    token: "token",
    iucnGET: async () => null,
    sleep: noWait,
    sanitizeAssetName: (value) => value,
    speciesAssetDir: () => ".",
    ensureDir: () => {},
    isManualAsset: () => false,
    platform: "linux",
    validateUrl: publicUrl,
  });
  assert.equal((await adapter.fetchValidJpeg("https://example.org/map.jpg")).length, jpeg.length);
});

test("Pipeline prüft jedes Redirectziel und sendet kein IUCN-Token an fremde Hosts", async () => {
  let fetchCalls = 0, nativeCalls = 0;
  const rejected = mapAdapter({ platform: "win32", fetch: async (_url, options) => {
    fetchCalls++; assert.equal(options.redirect, "manual");
    return new Response("", { status: 302, headers: { location: "http://127.0.0.1/private" } });
  }, execFileAsync: async () => { nativeCalls++; throw new Error("kein Fallback erlaubt"); } });
  await assert.rejects(rejected.fetchValidJpeg(mapUrl), /Private, lokale/);
  assert.equal(fetchCalls, 1); assert.equal(nativeCalls, 0);

  const requests = [], jpeg = validMapJpeg();
  const accepted = mapAdapter({ token: "fixture-token", fetch: async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? new Response("", { status: 302, headers: { location: "https://maps.example/map.jpg" } })
      : new Response(jpeg);
  } });
  assert.deepEqual(await accepted.fetchValidJpeg("https://api.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg"), jpeg);
  assert.equal(requests[0].options.headers.Authorization, "Bearer fixture-token");
  assert.equal(requests[1].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.redirect, "manual");
  const downgraded = [];
  const downgrade = mapAdapter({ token: "fixture-token", fetch: async (url, options) => {
    downgraded.push({ url, options });
    return downgraded.length === 1
      ? new Response("", { status: 302, headers: { location: "http://api.iucnredlist.org/map.jpg" } })
      : new Response(jpeg);
  } });
  assert.deepEqual(await downgrade.fetchValidJpeg("https://api.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg"), jpeg);
  assert.equal(downgraded[0].options.headers.Authorization, "Bearer fixture-token");
  assert.equal(downgraded[1].options.headers.Authorization, undefined);
});

test("Pipeline verfolgt echte öffentliche HTTP-Weiterleitung und erreicht die private Route nicht", async (t) => {
  const jpeg = validMapJpeg();
  let privateRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/public-start") { response.writeHead(302, { location: "https://maps.example/valid" }); response.end(); }
    else if (request.url === "/private-start") { response.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/private` }); response.end(); }
    else { if (request.url === "/private") privateRequests++; response.end(jpeg); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const calls = [];
  const adapter = mapAdapter({ fetch: async (url, options) => {
    calls.push(url);
    // Map only the controlled public fixture into our loopback server. The
    // adapter itself still validates every actual Location before this hook.
    return fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options);
  } });
  assert.deepEqual(await adapter.fetchValidJpeg("https://maps.example/public-start"), jpeg);
  assert.deepEqual(calls, ["https://maps.example/public-start", "https://maps.example/valid"]);
  await assert.rejects(adapter.fetchValidJpeg("https://maps.example/private-start"), /Private, lokale/);
  assert.equal(calls.length, 3); assert.equal(privateRequests, 0);
});

test("Pipeline-Fallback bleibt auf initiale geeignete Transportfehler begrenzt", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "pipeline-map-transport-"));
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); });
  const jpeg = validMapJpeg();
  for (const code of ["ECONNRESET", "ERR_SSL_WRONG_VERSION_NUMBER"]) {
    let nativeCalls = 0;
    const adapter = mapAdapter({ platform: "win32", tempRoot: root,
      fetch: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code } }); },
      execFileAsync: async (_command, args, options) => {
        nativeCalls++;
        assert.match(args.at(-1), /AllowAutoRedirect = \$false/);
        await fs.writeFile(options.env.IUCN_MAP_OUTFILE, jpeg);
        return { stdout: '{"status":200}' };
      },
    });
    assert.deepEqual(await adapter.fetchValidJpeg(mapUrl), jpeg);
    assert.equal(nativeCalls, 1);
    await assertMapSessionsClosed(root);
  }
  for (const code of ["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "ABORT_ERR"]) {
    let nativeCalls = 0;
    const adapter = mapAdapter({ platform: "win32",
      fetch: async () => { throw Object.assign(new Error("blocked transport"), { code }); },
      execFileAsync: async () => { nativeCalls++; },
    });
    await assert.rejects(adapter.fetchValidJpeg(mapUrl), /blocked transport/);
    assert.equal(nativeCalls, 0);
  }
  let calls = 0, nativeCalls = 0;
  const redirected = mapAdapter({ platform: "win32", fetch: async () => {
    if (++calls === 1) return new Response("", { status: 302, headers: { location: "https://maps.example/fail" } });
    throw Object.assign(new Error("reset after redirect"), { code: "ECONNRESET" });
  }, execFileAsync: async () => { nativeCalls++; } });
  await assert.rejects(redirected.fetchValidJpeg(mapUrl), /reset after redirect/);
  assert.equal(nativeCalls, 0);
});

test("Pipeline-HTTP-, Body- und Bildfehler lösen keinen nativen Ersatzabruf aus", async () => {
  const corrupt = Buffer.alloc(12_000); corrupt[0] = 0xff; corrupt[1] = 0xd8;
  corrupt[corrupt.length - 2] = 0xff; corrupt[corrupt.length - 1] = 0xd9;
  const scenarios = [
    { response: () => new Response("", { status: 404 }), rejected: false },
    { response: () => new Response("<html>no map</html>", { headers: { "content-type": "text/html" } }), rejected: false },
    { response: () => new Response(corrupt), rejected: true },
    { response: () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("fixture body failure")); } })), rejected: true },
  ];
  for (const scenario of scenarios) {
    let nativeCalls = 0;
    const adapter = mapAdapter({ platform: "win32", fetch: async () => scenario.response(),
      execFileAsync: async () => { nativeCalls++; } });
    if (scenario.rejected) await assert.rejects(adapter.fetchValidJpeg(mapUrl));
    else assert.equal(await adapter.fetchValidJpeg(mapUrl), null);
    assert.equal(nativeCalls, 0);
  }
});

test("Pipeline stoppt reale Streams am 20-MiB-Deckel und liest große Header nicht ein", async () => {
  for (const announced of [false, true]) {
    let pulls = 0, cancelled = 0, nativeCalls = 0;
    const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled++; } }, { highWaterMark: 0 });
    const adapter = mapAdapter({ platform: "win32", fetch: async () => new Response(stream,
      { headers: announced ? { "content-length": String(100 * 1024 * 1024) } : {} }),
    execFileAsync: async () => { nativeCalls++; } });
    await assert.rejects(adapter.fetchValidJpeg(mapUrl), /20 MiB/);
    assert.equal(pulls, announced ? 0 : 21);
    assert.equal(cancelled, 1); assert.equal(stream.locked, false); assert.equal(nativeCalls, 0);
  }
});

test("Pipeline beendet nicht endende Streams und lässt einen frischen gültigen Retry zu", async () => {
  let cancelled = 0, calls = 0, nativeCalls = 0;
  const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const jpeg = validMapJpeg();
  const adapter = mapAdapter({ timeoutMs: 25, platform: "win32",
    fetch: async () => new Response(++calls === 1 ? stream : jpeg), execFileAsync: async () => { nativeCalls++; } });
  await assert.rejects(adapter.fetchValidJpeg(mapUrl), /nicht rechtzeitig/);
  assert.equal(cancelled, 1); assert.equal(stream.locked, false); assert.equal(nativeCalls, 0);
  assert.deepEqual(await adapter.fetchValidJpeg(mapUrl), jpeg);
});

test("Pipeline begrenzt Zeit-, Wiederholungs- und Cache-Quellenoptionen", async () => {
  for (const options of [{ timeoutMs: 30_001 }, { timeoutMs: 0 }, { powerShellRetryAttempts: 4 },
    { powerShellRetryAttempts: Infinity }, { powerShellRetryDelayMs: 1501 }]) {
    assert.throws(() => mapAdapter({ fetch: async () => {}, ...options }), /Ungültige/);
  }
  let requests = 0;
  const adapter = mapAdapter({ fetch: async () => {
    requests++;
    return new Response(`<a href="https://maps.example/cached-individual-maps/T1A1.jpg?attempt=${requests}">map</a>`,
      { headers: { "content-type": "text/html" } });
  } });
  await assert.rejects(adapter.fetchValidJpeg("https://maps.example/start"), /zu viele weitere Quellen/);
  assert.equal(requests, 50);
});

test("Native Pipelinefehler mit HTTP, Zertifikat, Übergröße oder falschem JPEG werden nicht wiederholt", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "pipeline-map-native-terminal-"));
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); });
  for (const scenario of ["403", "302", "200-size", "certificate", "invalid-jpeg", "large-file"]) {
    let nativeCalls = 0;
    const adapter = mapAdapter({ platform: "win32", tempRoot: root,
      fetch: async () => { throw Object.assign(new Error("initial reset"), { code: "ECONNRESET" }); },
      execFileAsync: async (_command, _args, options) => {
        nativeCalls++;
        if (["invalid-jpeg", "large-file"].includes(scenario)) {
          await fs.writeFile(options.env.IUCN_MAP_OUTFILE, Buffer.alloc(scenario === "large-file" ? 21 * 1024 * 1024 : 12_000));
          return { stdout: '{"status":200}' };
        }
        const status = scenario === "certificate" ? null : Number(scenario.split("-")[0]);
        throw Object.assign(new Error("native terminal failure"), { stdout: JSON.stringify({ status,
          transportStatus: scenario === "certificate" ? "TrustFailure" : null, error: "native terminal failure" }) });
      },
    });
    await assert.rejects(adapter.fetchValidJpeg(mapUrl));
    assert.equal(nativeCalls, 1, scenario);
    await assertMapSessionsClosed(root);
  }
  let nativeCalls = 0;
  const jpeg = validMapJpeg();
  const retry = mapAdapter({ platform: "win32", tempRoot: root,
    fetch: async () => { throw Object.assign(new Error("initial reset"), { code: "ECONNRESET" }); },
    execFileAsync: async (_command, _args, options) => {
      if (++nativeCalls === 1) throw Object.assign(new Error("native connect failed"),
        { stdout: '{"status":null,"transportStatus":"ConnectFailure","error":"native connect failed"}' });
      await fs.writeFile(options.env.IUCN_MAP_OUTFILE, jpeg);
      return { stdout: '{"status":200}' };
    },
  });
  assert.deepEqual(await retry.fetchValidJpeg(mapUrl), jpeg); assert.equal(nativeCalls, 2);
});

test("Pipeline-Cache-Seite bleibt begrenzt und darf Sperren oder private Quellen nicht umgehen", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "pipeline-map-cache-"));
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true }); });
  const oldMap = Buffer.from("original cache fixture"), filename = path.join(root, "map.jpg");
  await fs.writeFile(filename, oldMap);
  const species = { "Deutscher Name": "Fixture", "Assessment ID": 123, sis_id: 15951 };
  for (const scenario of ["blocked", "private", "large"]) {
    const calls = [];
    const adapter = mapAdapter({ speciesAssetDir: () => root, fetch: async url => {
      calls.push(url);
      if (!url.includes("/species/")) return new Response("", { status: 404 });
      if (scenario === "blocked") return new Response("", { status: 403 });
      if (scenario === "private") return new Response("", { status: 302, headers: { location: "http://127.0.0.1/private" } });
      return new Response("", { headers: { "content-length": String(100 * 1024 * 1024) } });
    }, recordAssessment: () => assert.fail("Fehler darf keine Bewertung quittieren") });
    assert.equal(await adapter.downloadMapForSpecies(species, { force: true }), scenario === "blocked" ? "missing" : "error");
    assert.equal(calls.length, 4); assert.deepEqual(await fs.readFile(filename), oldMap);
  }
  const jpeg = validMapJpeg(), signed = "https://f002.backblazeb2.com/file/cached-individual-maps/T15951A123.jpg?Authorization=fixture-only";
  const adapter = mapAdapter({ speciesAssetDir: () => root, fetch: async url => {
    if (url.includes("/species/")) return new Response(`<a href="${signed}">map</a>`, { headers: { "content-type": "text/html" } });
    return url === signed ? new Response(jpeg) : new Response("", { status: 404 });
  } });
  assert.equal(await adapter.downloadMapForSpecies(species, { force: true }), "ok");
  assert.deepEqual(await fs.readFile(filename), jpeg);
});

test("Pipeline erhält alte Karte und Bewertungsstand bei privaten, großen und beschädigten Antworten", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "pipeline-map-preserve-"));
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true }); });
  const oldMap = Buffer.from("bound-original-map"), filename = path.join(root, "map.jpg");
  await fs.writeFile(filename, oldMap);
  const corrupt = Buffer.alloc(12_000); corrupt[0] = 0xff; corrupt[1] = 0xd8;
  corrupt[corrupt.length - 2] = 0xff; corrupt[corrupt.length - 1] = 0xd9;
  const responses = [
    () => new Response("", { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    () => new Response("", { headers: { "content-length": String(100 * 1024 * 1024) } }),
    () => new Response(corrupt),
  ];
  let assessments = 0;
  for (const response of responses) {
    const adapter = mapAdapter({ speciesAssetDir: () => root, fetch: async () => response(), recordAssessment: () => { assessments++; } });
    assert.equal(await adapter.downloadMapForSpecies({ "Deutscher Name": "Fixture", "Assessment ID": 123 }, { force: true }), "error");
    assert.deepEqual(await fs.readFile(filename), oldMap);
    assert.equal(assessments, 0);
    await assert.rejects(fs.stat(`${filename}.tmp`), { code: "ENOENT" });
  }
  const jpeg = validMapJpeg();
  const retry = mapAdapter({ speciesAssetDir: () => root, fetch: async () => new Response(jpeg), recordAssessment: () => { assessments++; } });
  assert.equal(await retry.downloadMapForSpecies({ "Deutscher Name": "Fixture", "Assessment ID": 123 }, { force: true }), "ok");
  assert.deepEqual(await fs.readFile(filename), jpeg); assert.equal(assessments, 1);
});

test("Pipeline-Windows-Transport begrenzt echte Loopback-Streams und folgt keiner Weiterleitung", {
  skip: process.platform !== "win32" ? "Native Transportprobe benötigt PowerShell" : false,
}, async (t) => {
  const source = await fs.readFile(new URL("./iucn-map-adapter.mjs", import.meta.url), "utf8");
  const script = source.slice(source.indexOf("async function fetchWithPowerShell"))
    .match(/const script = `([\s\S]*?)`\.trim\(\);/)[1].replaceAll("30000", "250");
  const root = await fs.mkdtemp(path.join(tmpdir(), "pipeline-map-native-"));
  const jpeg = validMapJpeg();
  let privateRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/large-header") { response.writeHead(200, { "content-length": String(100 * 1024 * 1024) }); response.flushHeaders(); }
    else if (request.url === "/large-stream") { response.writeHead(200); response.end(Buffer.alloc(21 * 1024 * 1024)); }
    else if (request.url === "/redirect") { response.writeHead(302, { location: "/private" }); response.end(); }
    else if (request.url === "/private") { privateRequests++; response.end(jpeg); }
    else if (request.url === "/blocked") { response.writeHead(403); response.end("denied"); }
    else if (request.url === "/never-end") { response.writeHead(200); response.write("pending"); }
    else response.end(jpeg);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  });
  for (const scenario of ["large-header", "large-stream", "redirect", "blocked", "never-end", "valid"]) {
    const output = path.join(root, `${scenario}.jpg`);
    let stdout, failed = false;
    try {
      ({ stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        env: { ...process.env, IUCN_MAP_URL: `http://127.0.0.1:${server.address().port}/${scenario}`, IUCN_MAP_OUTFILE: output },
        timeout: 10_000, windowsHide: true, encoding: "utf8",
      }));
    } catch (error) { failed = true; stdout = error.stdout; }
    const result = JSON.parse(stdout.trim());
    assert.equal(failed, scenario !== "valid");
    if (scenario === "valid") assert.deepEqual(await fs.readFile(output), jpeg);
    else {
      assert.ok(result.error);
      const details = await fs.stat(output).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      assert.ok(!details || details.size <= 20 * 1024 * 1024);
    }
  }
  assert.equal(privateRequests, 0);
});

test("Xeno-Canto-Adapter überspringt NC bei freier Suchstufe", async () => {
  const adapter = createXenoCantoAdapter({
    token: "token",
    sleep: noWait,
    fetch: async () => jsonResponse({
      numPages: 1,
      recordings: [
        { id: "nc", lic: "https://creativecommons.org/licenses/by-nc/4.0/" },
        { id: "free", lic: "https://creativecommons.org/licenses/by/4.0/" },
      ],
    }),
  });
  const result = await adapter.findRecordingByStage("Turdus", "merula", { openOnly: true, q: "A", len2535: true });
  assert.equal(result.rec.id, "free");
  assert.equal(result.page, 1);
  assert.match(result.query, /gen:Turdus/);
});

test("Commons-Adapter liefert exakten frei lizenzierten MP3-Kandidaten", async () => {
  const adapter = createWikimediaCommonsAudioAdapter({
    sleep: noWait,
    fetch: async (url, options = {}) => {
      if (options.method === "HEAD") return { ok: true };
      return jsonResponse({
        query: {
          pages: {
            1: {
              title: "File:Turdus merula song.ogg",
              imageinfo: [{
                url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Turdus_merula_song.ogg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Turdus_merula_song.ogg",
                mime: "audio/ogg",
                extmetadata: {
                  LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
                  Artist: { value: "Recorder" },
                  ImageDescription: { value: "Turdus merula song" },
                },
              }],
            },
          },
        },
      });
    },
  });
  const result = await adapter.findRecording("Turdus", "merula", "Amsel");
  assert.match(result.mp3Url, /transcoded/);
  assert.equal(result.artist, "Recorder");
});

test("iNaturalist-Adapter liefert nur exakten freien MP3-Sound", async () => {
  const adapter = createINaturalistAudioAdapter({
    sleep: noWait,
    fetch: async (_url, options = {}) => {
      if (options.method === "HEAD") return { ok: true };
      return jsonResponse({
        results: [{
          id: 42,
          uri: "https://www.inaturalist.org/observations/42",
          taxon: { name: "Turdus merula" },
          sounds: [{ id: 7, file_url: "https://static.inaturalist.org/sounds/7.mp3", file_content_type: "audio/mpeg", license_code: "cc-by" }],
        }],
      });
    },
  });
  const result = await adapter.findRecording("Turdus", "merula", "Amsel");
  assert.equal(result.sound.id, 7);
  assert.equal(result.observation.id, 42);
});
