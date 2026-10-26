import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectJpeg,
  inspectMp3,
  inspectPng,
  inspectWebp,
  validateMapPreviewPayload,
  validatePortraitPreviewPayload,
  validateSoundPreviewPayload,
  fetchMapPreviewSource,
} from "./media-assets.mjs";
import {
  createTestJpeg,
  createTestMp3,
  createTestPng,
  createTestWebp,
} from "./server-test-fixtures.mjs";

const species = {
  germanName: "Amsel",
  scientificName: "Turdus merula",
};

test("Karteneditor startet nach HTTP-403/404 keinen anderen Abrufweg", async () => {
  for (const status of [403, 404]) {
    let fallbackCalls = 0;
    await assert.rejects(fetchMapPreviewSource("https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg", {
      validateUrl: async (value) => new URL(value),
      fetchImpl: async () => ({ ok: false, status }),
      powerShell: async () => { fallbackCalls += 1; return createTestJpeg(640, 480); },
    }), new RegExp(`HTTP ${status}`));
    assert.equal(fallbackCalls, 0);
  }
});

test("Karteneditor verwirft private oder fehlgeschlagene Weiterleitungen ohne Windows-Fallback", async () => {
  for (const failure of ["private", "network"]) {
    let calls = 0, fallbackCalls = 0;
    await assert.rejects(fetchMapPreviewSource("https://www.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg", {
      validateUrl: async (value) => {
        const parsed = new URL(value);
        if (parsed.hostname === "127.0.0.1") throw new Error("Private URL ist nicht erlaubt");
        return parsed;
      },
      fetchImpl: async () => {
        if (++calls === 1) return { status: 302, headers: new Headers({
          location: failure === "private" ? "http://127.0.0.1/private.jpg" : "https://maps.example/map.jpg",
        }) };
        throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      },
      powerShell: async () => { fallbackCalls += 1; return createTestJpeg(640, 480); },
    }), failure === "private" ? /Private URL/ : /fetch failed/);
    assert.equal(fallbackCalls, 0);
  }
});

test("Karteneditor erlaubt begrenzten Transportfallback nur vor der ersten HTTP-Antwort", async () => {
  const jpeg = createTestJpeg(640, 480);
  for (const code of ["ECONNRESET", "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR"]) {
    let fallbackCalls = 0;
    const buffer = await fetchMapPreviewSource("https://www.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg", {
      validateUrl: async (value) => new URL(value),
      fetchImpl: async () => { throw new TypeError("fetch failed", { cause: { code } }); },
      powerShell: async () => { fallbackCalls += 1; return jpeg; },
    });
    assert.deepEqual(buffer, jpeg);
    assert.equal(fallbackCalls, 1);
  }
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./media-assets.mjs", import.meta.url), "utf8");
  assert.match(source, /\$request\.AllowAutoRedirect = \$false/);
});

test("Karteneditor lässt Zertifikatsfehler, Abbruch und ungültige Antworten geschlossen und kann frisch wiederholen", async () => {
  const jpeg = createTestJpeg(640, 480);
  for (const kind of ["certificate", "abort", "size", "body"]) {
    let fallbackCalls = 0;
    const options = {
      validateUrl: async (value) => new URL(value),
      fetchImpl: async () => {
        if (kind === "certificate") throw new TypeError("fetch failed", { cause: { code: "CERT_HAS_EXPIRED" } });
        if (kind === "abort") throw Object.assign(new Error("Abbruch"), { name: "AbortError" });
        return new Response(new ReadableStream({ start(controller) {
          controller.error(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));
        } }), { status: 200, headers: kind === "size" ? { "content-length": String(21 * 1024 * 1024) } : {} });
      },
      powerShell: async () => { fallbackCalls += 1; return jpeg; },
    };
    await assert.rejects(fetchMapPreviewSource("https://www.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg", options));
    assert.equal(fallbackCalls, 0);
    options.fetchImpl = async () => new Response(jpeg);
    assert.deepEqual(await fetchMapPreviewSource("https://www.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg", options), jpeg);
    assert.equal(fallbackCalls, 0);
  }
});

test("Freigegebene Kartenantwort wird nach geprüfter Weiterleitung übernommen", async () => {
  const jpeg = createTestJpeg(640, 480), checked = [];
  let calls = 0;
  const buffer = await fetchMapPreviewSource("https://maps.example/start", {
    validateUrl: async (value) => { checked.push(String(value)); return new URL(value); },
    fetchImpl: async () => ++calls === 1
      ? { status: 302, headers: new Headers({ location: "https://maps.example/map.jpg" }) }
      : new Response(jpeg),
    powerShell: async () => { throw new Error("Kein Fallback erforderlich"); },
  });
  assert.deepEqual(buffer, jpeg);
  assert.deepEqual(checked, ["https://maps.example/start", "https://maps.example/map.jpg"]);
});

test("Kartenstream stoppt am Byte-Deckel und verwirft angekündigte Übergröße vor dem Lesen", async () => {
  for (const announced of [false, true]) {
    let pulls = 0, cancellations = 0, fallbackCalls = 0;
    const stream = new ReadableStream({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancellations += 1; },
    }, { highWaterMark: 0 });
    await assert.rejects(fetchMapPreviewSource("https://maps.example/map.jpg", {
      validateUrl: async value => new URL(value),
      fetchImpl: async () => new Response(stream, { headers: announced ? { "content-length": String(100 * 1024 * 1024) } : {} }),
      powerShell: async () => { fallbackCalls += 1; },
    }), /20 MB/);
    assert.equal(pulls, announced ? 0 : 21);
    assert.equal(cancellations, 1);
    assert.equal(fallbackCalls, 0);
  }
});

test("Nicht endender Kartenstream wird abgebrochen, geschlossen und ist frisch wiederholbar", async () => {
  let cancellations = 0, fallbackCalls = 0;
  const stream = new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancellations += 1; },
  }, { highWaterMark: 0 });
  const options = {
    timeoutMs: 20, validateUrl: async value => new URL(value),
    fetchImpl: async () => new Response(stream),
    powerShell: async () => { fallbackCalls += 1; },
  };
  await assert.rejects(fetchMapPreviewSource("https://maps.example/map.jpg", options), /nicht rechtzeitig/);
  assert.equal(cancellations, 1); assert.equal(fallbackCalls, 0);
  const jpeg = createTestJpeg(640, 480);
  options.fetchImpl = async () => new Response(jpeg);
  assert.deepEqual(await fetchMapPreviewSource("https://maps.example/map.jpg", options), jpeg);
});

test("Windows-Kartentransport begrenzt echte lokale Downloads und beendet seine Streams", {
  skip: process.platform !== "win32" ? "Windows-Transportprobe benötigt PowerShell" : false,
}, async () => {
  const { mkdtemp, readFile, rm, stat } = await import("node:fs/promises");
  const { tmpdir, assertTestTempPath } = await import("../scripts/test-temp.mjs");
  const path = await import("node:path");
  const { createServer } = await import("node:http");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const source = await readFile(new URL("./media-assets.mjs", import.meta.url), "utf8");
  const script = source.slice(source.indexOf("async function fetchMapPreviewSourceWithPowerShell"))
    .match(/const script = `([\s\S]*?)`\.trim\(\);/)[1].replaceAll("30000", "250");
  // Only shorten the fixed native timeout for this isolated no-end fixture.
  const root = await mkdtemp(path.join(tmpdir(), "map-native-stream-"));
  const jpeg = createTestJpeg(640, 480);
  let privateRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/large-header") { response.writeHead(200, { "content-length": String(100 * 1024 * 1024) }); response.flushHeaders(); }
    else if (request.url === "/large-stream") { response.writeHead(200); response.end(Buffer.alloc(21 * 1024 * 1024)); }
    else if (request.url === "/redirect") { response.writeHead(302, { location: "/private" }); response.end(); }
    else if (request.url === "/private") { privateRequests += 1; response.end(jpeg); }
    else if (request.url === "/never-end") { response.writeHead(200); response.write("pending"); }
    else response.end(jpeg);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const scenario of ["large-header", "large-stream", "redirect", "never-end", "valid"]) {
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
      if (scenario === "valid") assert.deepEqual(await readFile(output), jpeg);
      else {
        assert.ok(result.error);
        const details = await stat(output).catch(error => { if (error.code === "ENOENT") return null; throw error; });
        assert.ok(!details || details.size <= 20 * 1024 * 1024);
      }
    }
    assert.equal(privateRequests, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assertTestTempPath(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("Medieninspektoren erkennen JPEG, PNG, MP3 und WebP", () => {
  assert.deepEqual(inspectJpeg(createTestJpeg(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(inspectPng(createTestPng(1120, 1400)), { width: 1120, height: 1400 });
  assert.ok(inspectMp3(createTestMp3(4)).frameOffset >= 0);
  assert.deepEqual(inspectWebp(createTestWebp(5)), { signature: "RIFF/WEBP", width: 8, height: 8 });
});

test("Portraitvorschau verlangt ein ausreichend großes 4:5-Bild", () => {
  const valid = validatePortraitPreviewPayload({
    originalName: "portrait.png",
    imageBase64: createTestPng(1120, 1400).toString("base64"),
    additionalInstructions: "Adultes Tier",
  }, species);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.image.width, 1120);
  assert.equal(valid.image.height, 1400);
  assert.match(valid.prompt, /Amsel/);

  const invalid = validatePortraitPreviewPayload({
    originalName: "portrait.png",
    imageBase64: createTestPng(1200, 1200).toString("base64"),
  }, species);
  assert.match(invalid.errors.join(" "), /4:5/);
});

test("Soundvorschau prüft Datei, Pflichtcredits und NC-Lizenz", () => {
  const result = validateSoundPreviewPayload({
    originalName: "sound.mp3",
    audioBase64: createTestMp3(7).toString("base64"),
    reason: "Manuell geprüft",
    credits: {
      recordist: "Testaufnahme",
      source: "xeno-canto.org",
      url: "https://example.org/sound",
      license: "https://creativecommons.org/licenses/by-nc/4.0/",
    },
  }, species);

  assert.deepEqual(result.errors, []);
  assert.equal(result.isNc, true);
  assert.equal(result.credits.scientific_name, "Turdus merula");
  assert.ok(result.inspection.frameOffset >= 0);
});

test("Kartenvorschau akzeptiert JPEG-Dateiupload ohne Quellen-URL", async () => {
  const result = await validateMapPreviewPayload({
    originalName: "map.jpg",
    imageBase64: createTestJpeg(800, 600).toString("base64"),
    reason: "Manuell geprüft",
    source: "",
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.dimensions, { width: 800, height: 600 });
  assert.equal(result.converted, false);
  assert.equal(result.inputFormat, "jpeg");
});
