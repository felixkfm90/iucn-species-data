// Test-only crash/held-lock worker, confined to the parent's synthetic fixture.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertTestTempPath } from "../../scripts/test-temp.mjs";

if (!process.send) throw new Error("Test worker requires parent IPC.");
const root = assertTestTempPath(process.argv[2]);
const owner = JSON.parse(fs.readFileSync(path.join(path.dirname(root), "owner.json"), "utf8"));
if (owner.owner !== "fn-explorer-tests" || owner.pid !== process.ppid) throw new Error("Not a parent-owned test session.");
const db = new DatabaseSync(path.join(root, "project.sqlite"));
db.exec("BEGIN IMMEDIATE");
let closed = false;
function close() {
  if (closed) return;
  closed = true;
  clearTimeout(timeout);
  db.exec("ROLLBACK"); db.close();
  if (process.connected) process.disconnect();
}
const timeout = setTimeout(close, 20000);
process.once("message", close);
process.once("disconnect", close);
process.send({ held: true });
