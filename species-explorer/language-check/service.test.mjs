import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { textSha256 } from "./parser.mjs";
import { serviceFixture, response, match, deferred } from "./test-fixtures.mjs";

test("status performs no process start; subsequent checks reuse one owned loopback process and close joins it", async t => {
  const f = await serviceFixture(t);
  assert.equal((await f.service.status()).available, true); assert.equal(f.children.length, 0);
  for (const text of ["Ein Vogel sitzt auf dem Ast.", "Ein anderer Text.", ""]) assert.equal((await f.service.check({ text })).available, true);
  assert.equal(f.children.length, 1); assert.equal((await f.service.status()).running, true);
  const spawned = f.calls.find(value => value.command);
  assert.equal(spawned.settings.shell, false); assert.equal(spawned.settings.windowsHide, true);
  assert.equal(spawned.args.includes("-Xmx512m"), true); assert.equal(spawned.args.includes("--public"), false);
  assert.equal(spawned.args.some(value => value.includes("Ein Vogel")), false);
  const requests = f.calls.filter(value => value.url);
  assert.equal(requests.every(value => value.url === "http://127.0.0.1:17891/v2/check" && value.init.redirect === "error"), true);
  assert.equal(requests.every(value => new URLSearchParams(value.init.body).get("language") === "de-DE"), true);
  const result = await f.service.close(); assert.equal(result.closed, true); assert.equal(f.children[0].exited, true);
  assert.equal((await f.service.status()).running, false);
});
test("missing Java/runtime is friendly unavailable and never starts a child or exposes a path", async t => {
  const f = await serviceFixture(t); f.hooks.resolve = () => { throw Object.assign(new Error("C:/private/secret"), { code: "LANGUAGE_CHECK_JAVA_MISSING" }); };
  const status = await f.service.status(), checked = await f.service.check({ text: "Text." });
  assert.equal(status.available, false); assert.equal(checked.available, false); assert.equal(checked.code, "LANGUAGE_CHECK_JAVA_MISSING");
  assert.equal(f.children.length, 0); assert.doesNotMatch(JSON.stringify([status, checked]), /private|secret/);
});
test("single doubled-letter repairs are preferred only after the real text context is checked", async t => {
  const f = await serviceFixture(t);
  const singular = "Der Vogeel sitzt weil es regnet.", plural = "Die Vogeel sitzen auf dem Ast.";
  f.hooks.fetch = async (_url, init) => {
    const text = new URLSearchParams(init.body).get("text"), findings = [];
    if (text.includes("Vogeel")) findings.push(match(text, "Vogeel", "Vögel"));
    if (text.includes("sitzt weil")) findings.push(match(text, "sitzt weil", "sitzt, weil", { category: "PUNCTUATION", ruleId: "KOMMA" }));
    if (text.startsWith("Die Vogel ")) findings.push(match(text, "Die Vogel", "Die Vögel", { category: "GRAMMAR", ruleId: "DE_AGREEMENT" }));
    return Response.json(response(text, findings));
  };
  const checked = await f.service.check({ text: singular });
  assert.deepEqual(checked.findings.map(({ replacement, alternative }) => [replacement, alternative]), [["Vogel", "Vögel"], ["sitzt, weil", undefined]]);
  assert.deepEqual((await f.service.check({ text: plural })).findings.map(({ replacement, alternative }) => [replacement, alternative]), [["Vögel", undefined]]);
  assert.equal(f.children.length, 1);
  assert.deepEqual(f.calls.filter(call => call.url).map(call => new URLSearchParams(call.init.body).get("text")),
    [singular, singular.replace("Vogeel", "Vogel"), plural, plural.replace("Vogeel", "Vogel")]);
});
test("an unavailable supplementary response retains the original finding and a one-edit provider result needs no extra check", async t => {
  const f = await serviceFixture(t);
  f.hooks.fetch = async (_url, init) => {
    const text = new URLSearchParams(init.body).get("text");
    if (text === "Vogel") return new Response("Busy", { status: 503 });
    return Response.json(response(text, [match(text, text, text === "Vogeel" ? "Vögel" : "Fehler")]));
  };
  assert.equal((await f.service.check({ text: "Vogeel" })).findings[0].replacement, "Vögel");
  assert.equal((await f.service.check({ text: "Feeler" })).findings[0].replacement, "Fehler");
  assert.equal(f.calls.filter(call => call.url).length, 3);
  assert.equal(f.children.length, 1);
});
test("one review rechecks at most two repeated-letter candidates against the original text", async t => {
  const f = await serviceFixture(t), text = "Vogeel Vogeel Vogeel";
  f.hooks.fetch = async (_url, init) => {
    const input = new URLSearchParams(init.body).get("text");
    return Response.json(response(input, [...input.matchAll(/Vogeel/g)].map(found => match(input, found[0], "Vögel", { offset: found.index }))));
  };
  const result = await f.service.check({ text });
  assert.deepEqual(result.findings.map(finding => finding.replacement), ["Vogel", "Vogel", "Vögel"]);
  assert.deepEqual(f.calls.filter(call => call.url).map(call => new URLSearchParams(call.init.body).get("text")),
    [text, "Vogel Vogeel Vogeel", "Vogeel Vogel Vogeel"]);
});
test("caption context recovers only the relative comma at its original UTF-16 range", async t => {
  const f = await serviceFixture(t), text = "🦜 Ein Vogel der auf einem Ast sitzt  ";
  const rule = { category: "PUNCTUATION", ruleId: "COMMA_IN_FRONT_RELATIVE_CLAUSE" };
  const wrapped = `Das Foto zeigt ${text.trimEnd()}.`;
  f.hooks.fetch = async (_url, init) => {
    const input = new URLSearchParams(init.body).get("text");
    if (input === text) return Response.json(response(input));
    assert.equal(input, wrapped);
    return Response.json(response(input, [match(input, "Vogel der", "Vogel, der", rule),
      match(input, "Das Foto", "Das, Foto", rule), match(input, "sitzt.", "sitzt!", rule),
      match(input, "einem Ast", "einem Baum", { category: "GRAMMAR", ruleId: "GRAMMAR" })]));
  };
  const result = await f.service.check({ text, context: "caption" });
  assert.equal(result.textSha256, textSha256(text));
  assert.deepEqual(result.findings.map(({ start, end, replacement }) => [text.slice(start, end), replacement]), [["Vogel der", "Vogel, der"]]);
  assert.equal(result.findings[0].start, text.indexOf("Vogel"));
  assert.equal(f.calls.filter(call => call.url).length, 2);
});
test("caption context preserves existing commas and ignores genitives, headings and multiline fields", async t => {
  const f = await serviceFixture(t);
  const existing = "Ein Vogel, der auf einem Ast sitzt", genitive = "Ein Vogel der Gattung Acanthis";
  for (const [text, context] of [[existing, "caption"], [genitive, "caption"], ["Ein Vogel der singt", "heading"],
    ["Ein Vogel der singt", "text"], ["Ein Vogel der singt\nEin anderer fliegt", "caption"]]) {
    assert.deepEqual((await f.service.check({ text, context })).findings, []);
  }
  assert.deepEqual(f.calls.filter(call => call.url).map(call => new URLSearchParams(call.init.body).get("text")),
    [existing, genitive, `Das Foto zeigt ${genitive}.`, "Ein Vogel der singt", "Ein Vogel der singt", "Ein Vogel der singt\nEin anderer fliegt"]);
});
test("caption context does not duplicate a known comma or discard it when the supplemental request fails", async t => {
  const f = await serviceFixture(t), text = "Ein Vogel der singt";
  const rule = { category: "PUNCTUATION", ruleId: "COMMA_IN_FRONT_RELATIVE_CLAUSE" };
  let fail = false;
  f.hooks.fetch = async (_url, init) => {
    const input = new URLSearchParams(init.body).get("text");
    if (fail && input !== text) return new Response("Busy", { status: 503 });
    return Response.json(response(input, [match(input, "Vogel der", "Vogel, der", rule)]));
  };
  const checked = await f.service.check({ text, context: "caption" });
  assert.equal(checked.findings.length, 1);
  fail = true;
  assert.deepEqual(await f.service.check({ text, context: "caption" }), checked);
  assert.equal(f.children.length, 1);
});
test("invalid and previously aborted inputs do not reserve or start a process", async t => {
  const f = await serviceFixture(t), abort = new AbortController(); abort.abort();
  await assert.rejects(f.service.check({ text: "x".repeat(20001) }), { code: "LANGUAGE_CHECK_INVALID_INPUT" });
  await assert.rejects(f.service.check({ text: "Text.", signal: abort.signal }), { code: "LANGUAGE_CHECK_CANCELLED" });
  assert.equal(f.children.length, 0);
});
test("aborted obsolete input rejects promptly while the existing engine is reused by the next text", async t => {
  const f = await serviceFixture(t), entered = deferred(), pendingResponse = deferred(), abort = new AbortController();
  f.hooks.fetch = () => { entered.resolve(); return pendingResponse.promise; };
  const pending = f.service.check({ text: "Vorheriger Text.", signal: abort.signal }); const rejected = assert.rejects(pending, { code: "LANGUAGE_CHECK_CANCELLED" });
  await entered.promise; abort.abort(); await rejected;
  f.hooks.fetch = null;
  assert.equal((await f.service.check({ text: "Neuer Text." })).available, true); assert.equal(f.children.length, 1);
  pendingResponse.resolve(new Response(JSON.stringify(response("Vorheriger Text.")), { headers: { "content-type": "application/json" } }));
});
test("at most two checks can be active; a third cannot build an invisible work queue", async t => {
  const f = await serviceFixture(t), entered = deferred(), gate = deferred(); let count = 0;
  f.hooks.fetch = async () => { if (++count === 2) entered.resolve(); await gate.promise; return new Response(JSON.stringify(response("Text.")), { headers: { "content-type": "application/json" } }); };
  const a = f.service.check({ text: "Text." }), b = f.service.check({ text: "Text." }); await entered.promise;
  await assert.rejects(f.service.check({ text: "Text." }), { code: "LANGUAGE_CHECK_BUSY" });
  gate.resolve(); assert.equal((await a).available, true); assert.equal((await b).available, true); assert.equal(f.children.length, 1);
});
test("request timeout bounds even an uncooperative transport and joins the own process normally", async t => {
  const f = await serviceFixture(t, { requestTimeoutMs: 20 }); f.hooks.fetch = () => new Promise(() => {});
  const result = await f.service.check({ text: "Text." });
  assert.equal(result.available, false); assert.equal(result.code, "LANGUAGE_CHECK_TIMEOUT"); assert.equal(f.children[0].exited, true);
});
test("oversized or inconsistent responses never become empty green findings and stop the own server", async t => {
  for (const mode of ["large-header", "large-stream", "wrong-span", "wrong-engine", "invalid-json", "redirect"]) {
    const f = await serviceFixture(t);
    f.hooks.fetch = async () => {
      const raw = response("Vogeel", [match("Vogeel", "Vogeel", "Vogel")]);
      if (mode === "wrong-span") raw.matches[0].context.text = "Andere";
      if (mode === "wrong-engine") raw.software.version = "7";
      return new Response(mode === "large-stream" ? "x".repeat(2 * 1024 * 1024 + 1) : mode === "invalid-json" ? "invalid" : JSON.stringify(raw),
        { status: mode === "redirect" ? 302 : 200, headers: { "content-type": "application/json", ...(mode === "large-header" ? { "content-length": "3000000" } : {}) } });
    };
    const result = await f.service.check({ text: "Vogeel" });
    assert.equal(result.available, false, mode); assert.equal(result.code, "LANGUAGE_CHECK_INVALID_RESPONSE", mode); assert.equal(f.children[0].exited, true, mode);
  }
});
test("start timeout, start failure and close during startup join their actual own child", async t => {
  for (const mode of ["timeout", "error", "close"]) {
    const f = await serviceFixture(t, { startupTimeoutMs: 25 }); f.hooks.noReady = true; f.hooks.startError = mode === "error";
    const result = f.service.check({ text: "Text." });
    if (mode === "close") { while (!f.children.length) await delay(1); const rejected = assert.rejects(result, { code: "LANGUAGE_CHECK_CANCELLED" }); await f.service.close(); await rejected; }
    else assert.equal((await result).available, false);
    assert.equal(f.children.length, 1); assert.equal(f.children[0].exited, true);
  }
});
test("idle completion stops one engine and a later explicit request starts one fresh owned engine", async t => {
  const f = await serviceFixture(t, { idleTimeoutMs: 5 }); await f.service.check({ text: "Text." });
  await delay(25); assert.equal(f.children[0].exited, true);
  await f.service.check({ text: "Text." }); assert.equal(f.children.length, 2);
});
test("unconfirmed close remains visibly running, preserves ownership and can be explicitly joined after actual exit", async t => {
  const f = await serviceFixture(t, { stopTimeoutMs: 15 }); await f.service.check({ text: "Text." }); f.hooks.holdStop = true;
  await assert.rejects(f.service.close(), { code: "LANGUAGE_CHECK_STOP_UNCONFIRMED" });
  const status = await f.service.status(); assert.equal(status.running, true); assert.equal(status.state, "close-blocked");
  f.children[0].finish(0); assert.equal((await f.service.close()).closed, true);
});
test("unexpected exit is never a valid late response and a later request cleans the earlier owned session", async t => {
  const f = await serviceFixture(t), entered = deferred(), gate = deferred();
  f.hooks.fetch = async () => { entered.resolve(); await gate.promise; return new Response(JSON.stringify(response("Text.")), { headers: { "content-type": "application/json" } }); };
  const result = f.service.check({ text: "Text." }); await entered.promise; f.children[0].finish(1); gate.resolve();
  assert.equal((await result).available, false); f.hooks.fetch = null;
  assert.equal((await f.service.check({ text: "Text." })).available, true); assert.equal(f.children.length, 2);
});
