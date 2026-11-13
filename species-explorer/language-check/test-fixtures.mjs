import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createLanguageCheckService } from "./service.mjs";

export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
export function response(text, matches = []) {
  return { software: { name: "LanguageTool", version: "6.6" }, language: { code: "de-DE" }, warnings: { incompleteResults: false }, matches };
}
export function match(text, quote, replacement, { ruleId = "GERMAN_SPELLER_RULE", category = "TYPOS", offset = text.indexOf(quote), message = "Schreibweise prüfen." } = {}) {
  return { message, offset, length: quote.length, replacements: [{ value: replacement }], context: { text, offset, length: quote.length },
    rule: { id: ruleId, category: { id: category }, issueType: category === "TYPOS" ? "misspelling" : "grammar" } };
}
export async function serviceFixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "lt-service-")), calls = [], children = [], hooks = {};
  let sessionCount = 0;
  const spawnImpl = (command, args, settings) => {
    calls.push({ command, args, settings });
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = 999999; child.exited = false;
    child.finish = code => { if (child.exited) return; child.exited = true; child.emit("close", code, null); };
    child.stdin.on("finish", () => { calls.push("stop-command"); if (!hooks.holdStop) queueMicrotask(() => child.finish(0)); });
    children.push(child);
    queueMicrotask(() => {
      if (hooks.startError) { child.emit("error", new Error("private input must not appear")); child.finish(-1); }
      else if (!hooks.noReady) child.stdout.write(`FN_LT_READY ${args.at(-1)}\n`);
    });
    return child;
  };
  const createSession = async () => {
    const directory = path.join(root, `session-${++sessionCount}`); await fs.mkdir(directory);
    return { root: directory, filePath: async name => path.join(directory, name), registerHelper: async () => async () => {},
      close: async () => { calls.push("session-close"); await fs.rm(assertTestTempPath(directory), { recursive: true, force: true }); return { pending: false, kept: [], errors: [] }; } };
  };
  const resolveRuntime = async input => {
    calls.push("resolve"); if (hooks.resolve) return hooks.resolve(input);
    return { directory: root, javaPath: path.join(root, "java.exe"), launcherPath: path.join(root, "launcher.jar"), version: "6.6" };
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init }); if (hooks.fetch) return hooks.fetch(url, init);
    const text = new URLSearchParams(init.body).get("text");
    return new Response(JSON.stringify(response(text)), { headers: { "content-type": "application/json" } });
  };
  const service = createLanguageCheckService({ repoRoot: root, spawnImpl, createSession, resolveRuntime, fetchImpl, allocatePort: async () => 17891,
    startupTimeoutMs: 1000, requestTimeoutMs: 1000, stopTimeoutMs: 1000, idleTimeoutMs: 1000, ...options });
  t.after(async () => { await service.close(); if (children.every(child => child.exited)) await fs.rm(assertTestTempPath(root), { recursive: true, force: true }); });
  return { root, service, calls, children, hooks };
}
