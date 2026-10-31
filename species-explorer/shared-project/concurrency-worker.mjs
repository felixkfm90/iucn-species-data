// Test-only worker; receives only a verified, parent-owned synthetic fixture.
import fs from "node:fs";
import path from "node:path";
import { createSharedProjectStore } from "./store.mjs";
import { assertTestTempPath } from "../../scripts/test-temp.mjs";

if (!process.send) throw new Error("This test worker requires its parent IPC channel.");
const directory = assertTestTempPath(process.argv[2]);
const owner = JSON.parse(fs.readFileSync(path.join(path.dirname(directory), "owner.json"), "utf8"));
if (owner.owner !== "fn-explorer-tests" || owner.pid !== process.ppid) throw new Error("Not a parent-owned test session.");
const store = createSharedProjectStore({ filename: path.join(directory, "project.sqlite"), localStorageConfirmed: true });
process.send({ ready: true });
process.once("message", (input) => {
  try {
    const result = store.submitChange(input.token, input.change);
    process.send({ result });
  } catch (error) { process.send({ error: { status: error.status, code: error.code } }); }
  finally { store.close(); process.disconnect(); }
});
