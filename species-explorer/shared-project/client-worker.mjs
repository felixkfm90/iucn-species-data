// Test-only desktop-process restart probe. Credentials cross the parent's IPC only.
import fs from "node:fs";
import path from "node:path";
import { assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createSharedProjectClient } from "./client.mjs";

if (!process.send) throw new Error("Test worker requires parent IPC.");
const root = assertTestTempPath(process.argv[2]);
const owner = JSON.parse(fs.readFileSync(path.join(path.dirname(root), "owner.json"), "utf8"));
if (owner.owner !== "fn-explorer-tests" || owner.pid !== process.ppid) throw new Error("Not a parent-owned test session.");
const pending = new Map(); let sequence = 0;
function rpc(operation, key, value) {
  return new Promise((resolve) => {
    const id = ++sequence; pending.set(id, resolve); process.send({ rpc: { id, operation, key, value } });
  });
}
const credentialStore = { get: (key) => rpc("get", key), set: (key, value) => rpc("set", key, value), delete: (key) => rpc("delete", key) };
let client;
const timeout = setTimeout(() => { process.exitCode = 1; process.disconnect(); }, 20000);
process.on("message", async (message) => {
  if (message.reply) { const resolve = pending.get(message.reply.id); pending.delete(message.reply.id); resolve?.(message.reply.value); return; }
  if (!message.command) return;
  try {
    client = createSharedProjectClient({ filename: path.join(root, "process-cache.sqlite"), localStorageConfirmed: true,
      allowLoopbackHttp: true, credentialStore });
    if (message.command.mode === "edit") {
      await client.connect({ baseUrl: message.command.baseUrl, username: message.command.username, password: message.command.password });
      await client.editExistingObject("page", "fixture-page", { title: "Process-persisted offline edit", text: "Synthetic" });
    } else await client.sync();
    const status = await client.status();
    await client.close();
    process.send({ done: status });
  } catch (error) { process.send({ failure: { code: error.code ?? "worker_error" } }); process.exitCode = 1; }
  finally { clearTimeout(timeout); if (client) await client.close(); process.disconnect(); }
});
process.send({ ready: true });
