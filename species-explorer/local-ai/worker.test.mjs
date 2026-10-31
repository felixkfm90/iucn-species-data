import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { createLocalAiWorker } from "./worker.mjs";
import { buildContentRequest } from "./content.mjs";
import { fixture } from "./test-fixtures.mjs";

const request = () => ({ messages: [{ role: "system", content: "only JSON" }, { role: "user", content: "test" }],
  response_format: { type: "json_schema", json_schema: { name: "synthetic_response", strict: true, schema: { type: "object" } } }, max_tokens: 50 });

async function workerFixture(t, options = {}) {
  let worker, child;
  t.after(async () => {
    if (child && options.stuck) child.emit("close", 0);
    await worker?.close();
  });
  const root = await fixture(t), runtimeDirectory = path.join(root, "runtime"), privateTempRoot = path.join(root, "private");
  await fs.mkdir(runtimeDirectory);
  const installation = { runtimeDirectory, privateTempRoot, serverPath: path.join(runtimeDirectory, "llama-server.exe"),
    modelPath: path.join(root, "model.gguf"), projectorPath: path.join(root, "projector.gguf") };
  for (const filename of [installation.serverPath, installation.modelPath, installation.projectorPath]) await fs.writeFile(filename, "synthetic-not-executed");
  const calls = [], http = []; let key = "", alias = "", healthCalls = 0, pausedChild = null, stopCount = 0;
  const dependencies = { cache: { resolveVerified: async () => installation }, allocatePort: async () => 49161,
    startupTimeoutMs: 1000, requestTimeoutMs: 1000, stopTimeoutMs: 50, pollMs: 1,
    spawnImpl: (executable, args, spawnOptions) => {
      calls.push({ executable, args, options: spawnOptions });
      key = fsSync.readFileSync(args[args.indexOf("--api-key-file") + 1], "utf8").trim();
      alias = args[args.indexOf("--alias") + 1];
      child = new EventEmitter(); child.pid = 987654;
      child.kill = () => { throw new Error("No process signal or forced kill is permitted"); };
      child.stdin = new Writable({ write(chunk, _encoding, callback) {
        assert.equal(String(chunk), "cmd_router_to_child:exit\n"); callback();
        if (options.pauseFirstStop && stopCount++ === 0) { pausedChild = child; return; }
        if (!options.stuck) queueMicrotask(() => child.emit("close", 0));
      } });
      return child;
    },
    fetchImpl: async (url, fetchOptions) => {
      assert.match(String(url), /^http:\/\/127\.0\.0\.1:49161\//);
      assert.equal(fetchOptions.headers.Authorization, `Bearer ${key}`);
      assert.equal(fetchOptions.redirect, "error");
      http.push({ url, options: fetchOptions });
      if (String(url).endsWith("/health")) {
        healthCalls += 1;
        if (options.initialRefused && healthCalls === 1) throw new TypeError("synthetic connection refused");
        return new Response(JSON.stringify({ status: "ok" }));
      }
      if (String(url).endsWith("/v1/models")) return new Response(JSON.stringify({ data: [{ id: alias, architecture: { input_modalities: ["text", "image"] } }] }));
      if (options.reply) return options.reply({ key, alias, fetchOptions });
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ text: "synthetic proposal" }) } }] }));
    },
    ...options.overrides,
  };
  worker = createLocalAiWorker(dependencies);
  return { root, installation, worker, calls, http, releaseStop() { pausedChild?.emit("close", 0); }, get key() { return key; }, get child() { return child; } };
}

test("Worker startet nur bei Anfrage, nutzt private authentisierte JSON-API und entfernt Schlüsseldatei", async (t) => {
  const f = await workerFixture(t);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.worker.complete(request())).text, "synthetic proposal");
  assert.equal(f.calls.length, 1);
  const spawn = f.calls[0];
  assert.equal(spawn.options.shell, false);
  assert.deepEqual(spawn.options.stdio, ["pipe", "ignore", "ignore"]);
  assert.equal(spawn.args[spawn.args.indexOf("--host") + 1], "127.0.0.1");
  assert.ok(spawn.args.includes("--offline") && spawn.args.includes("--no-webui"));
  assert.ok(spawn.args.includes("--no-mmproj-offload") && spawn.args.includes("--no-op-offload"));
  assert.equal(spawn.options.env.LLAMA_SERVER_CHILD_ROLE, "instance");
  assert.equal(spawn.options.env.HF_TOKEN, undefined);
  assert.equal(spawn.options.env.LLAMA_API_KEY, undefined);
  assert.ok(!spawn.args.join(" ").includes(f.key));
  assert.ok(!JSON.stringify(f.worker.status()).includes(f.key));
  await assert.rejects(fs.access(spawn.args[spawn.args.indexOf("--api-key-file") + 1]), { code: "ENOENT" });
  await f.worker.close();
  assert.equal(f.worker.status().ownWorkerActive, false);
  assert.deepEqual(await fs.readdir(f.installation.privateTempRoot), []);
});

test("spätes Binden des eigenen HTTP-Ports wird begrenzt abgewartet", async (t) => {
  const f = await workerFixture(t, { initialRefused: true });
  assert.equal((await f.worker.complete(request())).text, "synthetic proposal");
  assert.ok(f.http.filter((entry) => entry.url.endsWith("/health")).length >= 2);
});

test("Inhaltsschema erreicht den von b11960 ausgewerteten HTTP-Pfad ohne beliebiges Objekt als Ersatz", async (t) => {
  const expected = { type: "object", additionalProperties: false,
    properties: { text: { type: "string", minLength: 1, maxLength: 240 },
      uncertainties: { type: "array", maxItems: 2, items: { type: "string", minLength: 1, maxLength: 120 } } }, required: ["text", "uncertainties"] };
  let completions = 0;
  const f = await workerFixture(t, { reply: ({ fetchOptions }) => {
    completions += 1;
    const body = JSON.parse(fetchOptions.body);
    // Pinned server-common.cpp: json_schema reads json_schema.schema; an absent schema becomes any object.
    // https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/tools/server/server-common.cpp
    const extracted = body.response_format.type === "json_schema" ? body.response_format.json_schema?.schema || {} : null;
    const consumed = extracted && Object.keys(extracted).length === 0 ? { type: "object" } : extracted;
    assert.deepEqual(consumed, expected);
    assert.equal(body.stream, false);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ text: "Eisvogel auf einem Ast.", uncertainties: [] }) } }] }));
  } });
  const content = buildContentRequest("alt-text", { context: { pageType: "species", title: "Eisvogel" }, mimeType: "image/png", bytes: Buffer.from("synthetic") });
  assert.deepEqual(await f.worker.complete(content), { text: "Eisvogel auf einem Ast.", uncertainties: [] });
  assert.equal(completions, 1);
  assert.equal(f.calls.length, 1);
});

test("flacher, fehlender oder falsch typisierter Schema-Wrapper wird vor Workerstart abgewiesen", async (t) => {
  const f = await workerFixture(t);
  for (const format of [{ type: "json_schema", schema: { type: "object" } }, { type: "json_schema" },
    { type: "json_object", json_schema: { schema: { type: "object" } } },
    ...[null, [], {}, "not-a-schema"].map(schema => ({ type: "json_schema", json_schema: { schema } }))]) {
    await assert.rejects(f.worker.complete({ ...request(), response_format: format }), /strukturierte lokale KI-Anfrage/);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.http.length, 0);
});

test("fremde Bild-URL oder Dateipfad wird bereits vor dem Workerstart abgewiesen", async (t) => {
  const f = await workerFixture(t);
  for (const url of ["https://example.test/image.jpg", "file:///D:/private.jpg", "D:\\private.jpg"]) {
    const input = request(); input.messages[1].content = [{ type: "image_url", image_url: { url } }];
    await assert.rejects(f.worker.complete(input), /fremde URLs/);
  }
  assert.equal(f.calls.length, 0);
});

test("ungültige Antwort verrät weder Authschlüssel noch Prozessausgabe und schließt nur eigenen Worker", async (t) => {
  const f = await workerFixture(t, { reply: ({ key }) => new Response(`not-json private-${key}`) });
  let failure;
  try { await f.worker.complete(request()); } catch (error) { failure = error; }
  assert.equal(failure.code, "LOCAL_AI_INVALID_RESPONSE");
  assert.ok(!failure.message.includes(f.key));
  assert.equal(f.worker.status().ownWorkerActive, false);
});

test("Antwortgrößenlimit und HTTP-Ablehnung hinterlassen keinen weiterlaufenden eigenen Prozess", async (t) => {
  for (const mode of ["size", "http", "length"]) await t.test(mode, async (st) => {
    const f = await workerFixture(st, { reply: () => mode === "size" ? new Response("x".repeat(300_000))
      : mode === "http" ? new Response("private error body", { status: 500 })
        : new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{}" } }] })) });
    await assert.rejects(f.worker.complete(request()));
    assert.equal(f.worker.status().ownWorkerActive, false);
  });
});

test("Cancel bricht auch wartendes Antwortlesen ab und wartet auf regulären eigenen Prozessabschluss", async (t) => {
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const f = await workerFixture(t, { reply: () => { entered(); return new Response(new ReadableStream({ start() {} })); } });
  const abort = new AbortController(), completing = f.worker.complete(request(), { signal: abort.signal });
  await ready; abort.abort();
  await assert.rejects(completing, { code: "LOCAL_AI_CANCELLED" });
  assert.equal(f.worker.status().ownWorkerActive, false);
  assert.deepEqual(await fs.readdir(f.installation.privateTempRoot), []);
});

test("ungeklärter eigener Prozessabschluss bleibt sichtbar gesperrt statt nebenher einen zweiten Worker zu starten", async (t) => {
  const f = await workerFixture(t, { stuck: true });
  await f.worker.complete(request());
  await assert.rejects(f.worker.stop(), { code: "LOCAL_AI_STOP_UNCONFIRMED" });
  assert.equal(f.worker.status().state, "close-blocked");
  assert.equal(f.worker.status().ownPid, 987654);
  await assert.rejects(f.worker.complete(request()));
  assert.equal(f.calls.length, 1);
  f.child.emit("close", 0);
});

test("früher Portfehler und fehlender optionaler Cache erzeugen keine privaten Dateireste", async (t) => {
  const f = await workerFixture(t, { overrides: { allocatePort: async () => { throw new Error("port unavailable"); } } });
  await assert.rejects(f.worker.complete(request()));
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await fs.readdir(f.installation.privateTempRoot), []);
  const unavailable = createLocalAiWorker({ cache: { resolveVerified: async () => { throw Object.assign(new Error("missing"), { code: "LOCAL_AI_NOT_INSTALLED" }); } } });
  await assert.rejects(unavailable.complete(request()), { code: "LOCAL_AI_NOT_INSTALLED" });
  await unavailable.close();
});

test("neue Anfrage während regulärer Leerlaufentladung wartet auf den ersten eigenen Prozessabschluss", async (t) => {
  const f = await workerFixture(t, { pauseFirstStop: true, overrides: { stopTimeoutMs: 1000 } });
  await f.worker.complete(request());
  const stopping = f.worker.stop();
  const next = f.worker.complete(request());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.length, 1);
  f.releaseStop(); await stopping;
  assert.equal((await next).text, "synthetic proposal");
  assert.equal(f.calls.length, 2);
});

test("vorzeitiges unerwartetes Prozessende ist kein Benutzerabbruch", async (t) => {
  let f;
  f = await workerFixture(t, { reply: () => {
    f.child.emit("close", 3221225477, null);
    return new Response(new ReadableStream({ start() {} }));
  } });
  await assert.rejects(f.worker.complete(request()), { code: "LOCAL_AI_WORKER_EXITED" });
  assert.equal(f.worker.status().errorCode, "LOCAL_AI_WORKER_EXITED");
  assert.equal(f.worker.status().ownWorkerActive, false);
  assert.deepEqual(f.worker.status().lastExit, { code: 3221225477, signal: null, phase: "ready", expected: false, spawnError: null });
  assert.ok(!JSON.stringify(f.worker.status()).includes(f.key));
});

test("auch unerwartetes Exit0 während des Starts bleibt ein Prozessfehler", async (t) => {
  let f;
  f = await workerFixture(t, { overrides: { fetchImpl: async () => {
    f.child.emit("close", 0, null);
    return new Response(new ReadableStream({ start() {} }));
  } } });
  await assert.rejects(f.worker.complete(request()), { code: "LOCAL_AI_WORKER_EXITED" });
  assert.equal(f.worker.status().state, "failed");
  assert.deepEqual(f.worker.status().lastExit, { code: 0, signal: null, phase: "starting", expected: false, spawnError: null });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(await fs.readdir(f.installation.privateTempRoot), []);
});

test("exit meldet Fehler sofort; erst close bestätigt eigene Handlefreiheit und entfernt den privaten Bereich", async (t) => {
  let f, entered;
  const reading = new Promise(resolve => { entered = resolve; });
  f = await workerFixture(t, { pauseFirstStop: true, overrides: { stopTimeoutMs: 1000 }, reply: () => {
    entered(); return new Response(new ReadableStream({ start() {} }));
  } });
  const completing = f.worker.complete(request()), rejected = assert.rejects(completing, { code: "LOCAL_AI_WORKER_EXITED" });
  await reading; f.child.emit("exit", 3221225477, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.worker.status().ownWorkerActive, true);
  assert.equal(f.worker.status().busy, true);
  assert.equal((await fs.readdir(f.installation.privateTempRoot)).length, 1);
  f.child.emit("close", 3221225477, null); await rejected;
  assert.equal(f.worker.status().ownWorkerActive, false);
  assert.equal(f.worker.status().lastExit.expected, false);
  assert.deepEqual(await fs.readdir(f.installation.privateTempRoot), []);
  assert.equal(f.calls.length, 1);
});

test("spawn-Fehler wartet auf close und Diagnose enthält ausschließlich freigegebenen Fehlercode", async (t) => {
  let f, entered;
  const reading = new Promise(resolve => { entered = resolve; });
  f = await workerFixture(t, { pauseFirstStop: true, overrides: { stopTimeoutMs: 1000 }, reply: () => {
    entered(); return new Response(new ReadableStream({ start() {} }));
  } });
  const completing = f.worker.complete(request()), rejected = assert.rejects(completing, { code: "LOCAL_AI_WORKER_EXITED" });
  await reading;
  f.child.emit("error", Object.assign(new Error(`secret ${f.key} D:/private/model.gguf`), { code: "ENOENT" }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.worker.status().ownWorkerActive, true);
  assert.equal(f.worker.status().lastExit.spawnError, "ENOENT");
  assert.ok(!JSON.stringify(f.worker.status()).includes(f.key));
  assert.ok(!JSON.stringify(f.worker.status()).includes("private/model"));
  f.child.emit("close", -4058, null); await rejected;
  assert.equal(f.worker.status().ownWorkerActive, false);
  assert.equal(f.worker.status().lastExit.expected, false);
});

test("Benutzerabbruch vor einem verspäteten Exit behält seine ursprüngliche Abbruchursache", async (t) => {
  let f, entered;
  const reading = new Promise(resolve => { entered = resolve; });
  f = await workerFixture(t, { reply: () => { entered(); return new Response(new ReadableStream({ start() {} })); } });
  const abort = new AbortController(), completing = f.worker.complete(request(), { signal: abort.signal });
  await reading; abort.abort(); f.child.emit("close", 3221225477, null);
  await assert.rejects(completing, { code: "LOCAL_AI_CANCELLED" });
  assert.equal(f.worker.status().state, "stopped");
  assert.equal(f.worker.status().ownWorkerActive, false);
});

test("HTTP-Fehler wird nicht zum Inhaltsfehler umbenannt und reguläres Stoppen bleibt erwartetes Exit0", async (t) => {
  const f = await workerFixture(t, { reply: () => new Response("private upstream body", { status: 500 }) });
  await assert.rejects(f.worker.complete(request()), { code: "LOCAL_AI_HTTP_FAILED" });
  assert.deepEqual(f.worker.status().lastExit, { code: 0, signal: null, phase: "ready", expected: true, spawnError: null });
  assert.equal(f.worker.status().ownWorkerActive, false);
});
