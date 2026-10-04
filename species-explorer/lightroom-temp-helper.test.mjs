import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "../scripts/test-temp.mjs";
import { detectLightroomOwnerPid, runPluginTempHelper } from "./lightroom-temp-helper.mjs";
import { cleanupOrphanTempSessions, readOwnedPluginTempSession, writeOwnedPluginTempSession } from "./temp-session.mjs";

async function fixture(context) {
  const pluginRoot = await mkdtemp(path.join(tmpdir(), "lightroom-temp-helper-"));
  context.after(() => rm(pluginRoot, { recursive: true, force: true }));
  const options = { pluginRoot, sessionId: randomUUID(), capability: randomUUID(), detectOwner: async () => 101 };
  const { root } = await runPluginTempHelper({ ...options, command: "create" });
  return { options, root };
}

test("owner detection inspects only the bounded launching chain and treats unavailable permission as unknown", async () => {
  let calls = 0;
  const pid = await detectLightroomOwnerPid({ parentPid: 123, platform: "win32", execute: async (file, args, options) => {
    calls += 1;
    assert.equal(file, "powershell.exe");
    assert.ok(args.includes("-NoProfile"));
    assert.match(args.at(-1), /ProcessId = 123/);
    assert.match(args.at(-1), /-lt 6/);
    assert.equal(options.windowsHide, true);
    return { stdout: "321" };
  } });
  assert.equal(pid, 321);
  assert.equal(calls, 1);
  assert.equal(await detectLightroomOwnerPid({ parentPid: 123, platform: "win32", execute: async () => { throw new Error("permission denied"); } }), null);
  assert.equal(await detectLightroomOwnerPid({ parentPid: -1, platform: "win32", execute: async () => { throw new Error("must not execute"); } }), null);
});

test("capability and a completed operation are required before plugin cleanup", async (context) => {
  const { options, root } = await fixture(context);
  const { manifest } = await readOwnedPluginTempSession(options);
  await assert.rejects(runPluginTempHelper({ ...options, command: "cleanup" }), /aktive Operationen/);
  await assert.rejects(runPluginTempHelper({ ...options, capability: randomUUID(), command: "cleanup" }), /Eigentum/);
  await assert.rejects(runPluginTempHelper({ ...options, sessionId: "../../outside", command: "cleanup" }), /kennung/);
  manifest.artifacts.push({ relative: "preview.jpg", type: "file", durable: false });
  await writeFile(path.join(root, "preview.jpg"), "preview");
  await writeFile(path.join(root, "foreign.txt"), "foreign");
  manifest.state = "closed";
  await writeOwnedPluginTempSession(root, manifest);
  const result = await runPluginTempHelper({ ...options, command: "cleanup" });
  assert.deepEqual(result.removed, [path.join(root, "preview.jpg")]);
  assert.equal(await readFile(path.join(root, "foreign.txt"), "utf8"), "foreign");
});

test("unknown LR process ownership cannot be mistaken for a crashed SDK session", async (context) => {
  const pluginRoot = await mkdtemp(path.join(tmpdir(), "lightroom-temp-unknown-"));
  context.after(() => rm(pluginRoot, { recursive: true, force: true }));
  const options = { pluginRoot, sessionId: randomUUID(), capability: randomUUID(), detectOwner: async () => null };
  const { root } = await runPluginTempHelper({ ...options, command: "create" });
  const result = await cleanupOrphanTempSessions({ repoRoot: pluginRoot, owner: "plugin" });
  assert.equal(result.removed.length, 0);
  assert.ok(result.kept.some((entry) => entry.path === root));
  const { manifest } = await readOwnedPluginTempSession(options);
  manifest.state = "closed";
  await writeOwnedPluginTempSession(root, manifest);
  await runPluginTempHelper({ ...options, command: "cleanup" });
});

test("one validated owner anchor binds further operations without another process probe", async (context) => {
  const pluginRoot = await mkdtemp(path.join(tmpdir(), "lightroom-temp-owner-"));
  context.after(() => rm(pluginRoot, { recursive: true, force: true }));
  let probes = 0;
  const owner = { pluginRoot, sessionId: randomUUID(), capability: randomUUID(), detectOwner: async () => { probes += 1; return 101; } };
  await runPluginTempHelper({ ...owner, command: "create-owner" });
  const operation = { pluginRoot, sessionId: randomUUID(), capability: randomUUID(), ownerSession: owner.sessionId,
    ownerCapability: owner.capability, detectOwner: async () => { throw new Error("must not probe twice"); } };
  const { root } = await runPluginTempHelper({ ...operation, command: "create" });
  assert.equal(probes, 1);
  assert.equal((await readOwnedPluginTempSession(operation)).manifest.pid, 101);
  await assert.rejects(runPluginTempHelper({ ...operation, sessionId: randomUUID(), ownerCapability: randomUUID(), command: "create" }), /Eigentum/);
  const anchor = await readOwnedPluginTempSession(owner);
  anchor.manifest.state = "closed";
  await writeOwnedPluginTempSession(anchor.directory, anchor.manifest);
  await assert.rejects(runPluginTempHelper({ ...operation, sessionId: randomUUID(), command: "create" }), /nicht mehr aktiv/);
});

test("real helper process is registered until close; files stay in plugin temp and failed helpers remain retryable", async (context) => {
  const { options, root } = await fixture(context);
  const { manifest } = await readOwnedPluginTempSession(options);
  const requestPath = path.join(root, "request.json");
  const responsePath = path.join(root, "response.json");
  manifest.operations = 1;
  manifest.artifacts.push({ relative: "request.json", type: "file", durable: false },
    { relative: "response.json", type: "file", durable: false });
  await writeOwnedPluginTempSession(root, manifest);
  await writeFile(requestPath, "{}");
  const helperPath = path.join(options.pluginRoot, "fixture-helper.mjs");
  await writeFile(helperPath, `import {writeFile} from 'node:fs/promises';
    const response=process.argv.find(a=>a.startsWith('--response=')).slice(11);
    await new Promise(resolve=>setTimeout(resolve,30));
    await writeFile(response,JSON.stringify({temp:process.env.TEMP,pid:process.pid}));`);
  const work = runPluginTempHelper({ ...options, command: "run", helperPath, requestPath, responsePath, searchRoot: path.join(options.pluginRoot, "data") });
  const result = await work;
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(await readFile(responsePath, "utf8")).temp, root);
  assert.deepEqual((await readOwnedPluginTempSession(options)).manifest.helperPids, []);
  await writeFile(helperPath, "process.exitCode=7;");
  await assert.rejects(runPluginTempHelper({ ...options, command: "run", helperPath, requestPath, responsePath, searchRoot: path.join(options.pluginRoot, "data") }), /fehlgeschlagen/);
  const after = await readOwnedPluginTempSession(options);
  assert.deepEqual(after.manifest.helperPids, []);
  after.manifest.operations = 0;
  after.manifest.state = "closed";
  await writeOwnedPluginTempSession(root, after.manifest);
  await runPluginTempHelper({ ...options, command: "cleanup" });
});
