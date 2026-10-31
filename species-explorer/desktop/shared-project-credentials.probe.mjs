import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createSharedProjectCredentialStore } from "./shared-project-credentials.mjs";

const fixtureKey = "synthetic-credential-probe";
const fixtureValue = { baseUrl: "https://synthetic.example.invalid", projectId: "synthetic-project", userId: "synthetic-person",
  sessionToken: "synthetic-not-a-real-session-token", sessionExpiresAt: "2030-01-01T00:00:00.000Z", scope: "read",
  deviceToken: "synthetic-not-a-real-device-token", deviceId: "synthetic-device", deviceExpiresAt: "2030-02-01T00:00:00.000Z" };

export async function runElectronCredentialProbe({ app, safeStorage, phase, fixture }) {
  const expectedProfile = path.join(assertTestTempPath(fixture), "isolated-user-data");
  await app.whenReady();
  assert.equal(path.resolve(app.getPath("userData")), path.resolve(expectedProfile));
  assert.equal(await safeStorage.isAsyncEncryptionAvailable(), true);
  const directory = path.join(fixture, "tokens");
  const store = createSharedProjectCredentialStore({ directory, safeStorage });
  if (phase === "write") {
    await store.set(fixtureKey, fixtureValue);
    const names = await fs.readdir(directory);
    assert.deepEqual(names, [`${createHash("sha256").update(fixtureKey).digest("hex")}.bin`]);
    const bytes = await fs.readFile(path.join(directory, names[0]));
    assert.equal(bytes.includes(Buffer.from(fixtureValue.sessionToken)), false);
    assert.equal(bytes.includes(Buffer.from(fixtureValue.deviceToken)), false);
  } else {
    assert.equal(phase, "read");
    assert.deepEqual(await store.get(fixtureKey), fixtureValue);
    await store.delete(fixtureKey); assert.equal(await store.get(fixtureKey), null);
  }
  return { phase, passed: true, electron: process.versions.electron, platform: process.platform,
    asyncEncryptionAvailable: true, syntheticOnly: true, existingProfilesOpened: 0, browserWindowsCreated: 0 };
}

async function runOuter() {
  const directory = assertTestTempPath(await fs.mkdtemp(path.join(tmpdir(), "credential-native-")));
  const require = createRequire(import.meta.url), executable = require("electron");
  const entry = path.join(directory, "probe.cjs");
  // Set all profile paths synchronously before readiness or importing the async probe module.
  await fs.writeFile(entry, `const fs=require('node:fs');const path=require('node:path');const {app,safeStorage}=require('electron');
const fixture=process.env.FN_CREDENTIAL_PROBE_ROOT;app.disableHardwareAcceleration();app.setName('Arten-Explorer Credential-Probe');
for(const [key,name] of [['userData','isolated-user-data'],['sessionData','isolated-session'],['logs','isolated-logs']]){const value=path.join(fixture,name);fs.mkdirSync(value,{recursive:true});app.setPath(key,value);}
import(${JSON.stringify(new URL("./shared-project-credentials.probe.mjs", import.meta.url).href)}).then(async module=>{try{const result=await module.runElectronCredentialProbe({app,safeStorage,phase:process.env.FN_CREDENTIAL_PROBE_PHASE,fixture});process.stdout.write(JSON.stringify(result)+'\\n');app.quit();}catch{process.stderr.write('Isolierte native Credential-Probe fehlgeschlagen.\\n');app.exit(1);}}).catch(()=>app.exit(1));\n`);
  const phases = [];
  let cleaned = false, success = false;
  try {
    for (const phase of ["write", "read"]) {
      const env = { ...process.env, FN_CREDENTIAL_PROBE_ROOT: directory, FN_CREDENTIAL_PROBE_PHASE: phase };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = await new Promise((resolve, reject) => {
        const child = spawn(executable, [`--user-data-dir=${path.join(directory,"isolated-user-data")}`, entry], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "";
        const timeout = setTimeout(() => { child.kill(); reject(new Error("Zeitgrenze der eigenen nativen Probe überschritten.")); }, 30000);
        child.stdout.on("data", bytes => { stdout += bytes; });
        child.stderr.on("data", bytes => { stderr += bytes; });
        child.once("error", error => { clearTimeout(timeout); reject(error); });
        child.once("close", code => { clearTimeout(timeout); resolve({ code, pid: child.pid, stdout, stderr }); });
      });
      assert.equal(result.code, 0, "Native Probe endete ohne bestätigten Abschluss.");
      const parsed = result.stdout.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.phase === phase);
      assert.equal(parsed?.passed, true);
      phases.push({ ...parsed, childPid: result.pid, exitCode: result.code,
        stderrSha256: createHash("sha256").update(result.stderr).digest("hex") });
    }
    success = true;
  } finally {
    if (success) {
      try { assertTestTempPath(directory); await fs.rm(directory, { recursive: true, force: true }); cleaned = true; }
      catch { /* Bound encrypted probe evidence stays within the own session if a handle is still open. */ }
    } else process.stderr.write(`${JSON.stringify({ nativeProbeFailed: true, retainedOwnFixture: directory, completedPhases: phases })}\n`);
  }
  process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, phases, ownFixtureRemoved: cleaned,
    ...(cleaned ? {} : { retainedOwnFixture: directory }), scope: "Two fresh headless Electron processes, own isolated profile, synthetic tokens, no existing profile or account" })}\n`);
}
if (!process.versions.electron && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runOuter();
