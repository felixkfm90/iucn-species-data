import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createSharedProjectCredentialStore, SharedProjectCredentialError } from "./shared-project-credentials.mjs";

const digest = key => createHash("sha256").update(key).digest("hex");
const credentials = (token = "fixture-session-token") => ({ baseUrl: "https://project.example.invalid", projectId: "fixture-project", userId: "fixture-person",
  sessionToken: token, sessionExpiresAt: "2030-01-01T00:00:00.000Z", scope: "full", deviceToken: "fixture-device-token",
  deviceId: "fixture-device", deviceExpiresAt: "2030-02-01T00:00:00.000Z" });
function encryptedFake() {
  const key = randomBytes(32), calls = { encrypt: 0, decrypt: 0 };
  let available = true, rotate = false;
  return { calls, setAvailable(value) { available = value; }, rotateNext() { rotate = true; },
    getSelectedStorageBackend() { return "gnome_libsecret"; },
    async isAsyncEncryptionAvailable() { return available; },
    async encryptStringAsync(plaintext) {
      calls.encrypt++;
      const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    async decryptStringAsync(buffer) {
      calls.decrypt++;
      const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28));
      const result = Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8");
      const shouldReEncrypt = rotate; rotate = false; return { result, shouldReEncrypt };
    },
  };
}
async function scoped(fn) {
  const root = assertTestTempPath(await fs.mkdtemp(path.join(tmpdir(), "credentials-")));
  const directory = path.join(root, "profile", "credentials"), safeStorage = encryptedFake();
  const store = createSharedProjectCredentialStore({ directory, safeStorage });
  try { await fn({ root, directory, safeStorage, store, file: key => path.join(directory, `${digest(key)}.bin`) }); }
  finally { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true }); }
}
const isRedacted = (error, secret) => error instanceof SharedProjectCredentialError && !String(error).includes(secret)
  && !Object.hasOwn(error, "cause");

test("credentials round-trip after reopening; disk contains only ciphertext under a hashed filename", () => scoped(async ({ directory, safeStorage, store, file }) => {
  const value = credentials(); await store.set("fn-shared-project:fixture", value);
  assert.deepEqual(await fs.readdir(directory), [`${digest("fn-shared-project:fixture")}.bin`]);
  const bytes = await fs.readFile(file("fn-shared-project:fixture"));
  for (const secret of [value.sessionToken, value.deviceToken, value.baseUrl, value.userId]) assert.equal(bytes.includes(Buffer.from(secret)), false);
  const reopened = createSharedProjectCredentialStore({ directory, safeStorage });
  assert.deepEqual(await reopened.get("fn-shared-project:fixture"), value);
  const restored = await reopened.get("fn-shared-project:fixture"); restored.scope = "read";
  assert.equal((await reopened.get("fn-shared-project:fixture")).scope, "full");
}));
test("missing values and deletion are idempotent, including when OS decryption is unavailable", () => scoped(async ({ safeStorage, store }) => {
  assert.equal(await store.get("missing"), null); await store.delete("missing");
  await store.set("key", credentials()); safeStorage.setAvailable(false); await store.delete("key");
  safeStorage.setAvailable(true); assert.equal(await store.get("key"), null);
}));
test("path-looking keys never escape the supplied profile directory", () => scoped(async ({ root, directory, store }) => {
  await store.set("../../outside", credentials());
  assert.deepEqual(await fs.readdir(directory), [`${digest("../../outside")}.bin`]);
  assert.equal(await fs.stat(path.join(root, "outside")).catch(() => null), null);
}));
test("password fields, unknown fields, malformed credentials and accessor/proxy errors are rejected without disclosure", () => scoped(async ({ store, directory }) => {
  const secret = "fixture-secret-must-not-escape";
  for (const value of [{ ...credentials(), password: secret }, { ...credentials(), nested: { password: secret } },
    { ...credentials(), scope: "owner" }, { ...credentials(), baseUrl: "https://person:password@project.invalid" },
    new Proxy({}, { getPrototypeOf() { throw new Error(secret); } })]) {
    await assert.rejects(store.set("key", value), error => isRedacted(error, secret));
  }
  assert.equal(await fs.stat(directory).catch(() => null), null);
}));
test("OS encryption unavailable is visible and creates no plaintext file", () => scoped(async ({ safeStorage, store, directory }) => {
  safeStorage.setAvailable(false);
  await assert.rejects(store.set("key", credentials()), { code: "credential_encryption_unavailable" });
  await assert.rejects(store.get("key"), { code: "credential_encryption_unavailable" });
  assert.equal(await fs.stat(directory).catch(() => null), null);
}));
test("synchronous-only APIs are not used as an implicit fallback", () => {
  assert.throws(() => createSharedProjectCredentialStore({ directory: path.resolve("temp/no-created-profile"),
    safeStorage: { isEncryptionAvailable() { return true; }, encryptString() {}, decryptString() {} } }), { code: "credential_encryption_unavailable" });
});
test("relative, root, network and control-character profile paths are rejected", () => {
  for (const directory of ["relative/profile", path.parse(process.cwd()).root, "\\\\server\\share\\tokens", `${path.resolve("temp/profile")}\u0000`]) {
    assert.throws(() => createSharedProjectCredentialStore({ directory, safeStorage: encryptedFake() }), { code: "credential_unsafe_path" });
  }
});
test("known Linux backends round-trip the encrypted fake without plaintext storage", () => scoped(async ({ safeStorage, directory, file }) => {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  try {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    for (const backend of ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]) {
      const store = createSharedProjectCredentialStore({ directory, safeStorage: { ...safeStorage, getSelectedStorageBackend: () => backend } });
      const value = credentials();
      await store.set(backend, value);
      assert.deepEqual(await store.get(backend), value);
      assert.equal((await fs.readFile(file(backend))).includes(Buffer.from(value.sessionToken)), false);
    }
  } finally { Object.defineProperty(process, "platform", original); }
}));
test("Linux basic_text and unknown backends are rejected", () => scoped(async ({ safeStorage, directory }) => {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  try {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    for (const backend of [undefined, "basic_text", "unknown"]) {
      const store = createSharedProjectCredentialStore({ directory, safeStorage: { ...safeStorage,
        getSelectedStorageBackend: backend === undefined ? undefined : () => backend } });
      await assert.rejects(store.set("key", credentials()), { code: "credential_encryption_unavailable" });
    }
  } finally { Object.defineProperty(process, "platform", original); }
  assert.equal(safeStorage.calls.encrypt, 0);
}));
test("native errors do not expose tokens and a failed replacement retains the prior ciphertext", () => scoped(async ({ directory, safeStorage, store, file }) => {
  await store.set("key", credentials("old-fixture-token")); const before = await fs.readFile(file("key"));
  const broken = createSharedProjectCredentialStore({ directory, safeStorage: { ...safeStorage, async encryptStringAsync() { throw new Error("new-fixture-secret"); } } });
  await assert.rejects(broken.set("key", credentials("new-fixture-secret")), error => isRedacted(error, "new-fixture-secret"));
  assert.deepEqual(await fs.readFile(file("key")), before); assert.equal((await store.get("key")).sessionToken, "old-fixture-token");
}));
test("a failing atomic rename retains the predecessor and removes only the own temporary file", () => scoped(async ({ directory, store, file }) => {
  await store.set("key", credentials("old")); const before = await fs.readFile(file("key"));
  const original = fs.rename;
  try {
    fs.rename = async () => { throw new Error("fixture-secret-rename"); };
    await assert.rejects(store.set("key", credentials("fixture-secret-rename")), error => isRedacted(error, "fixture-secret-rename"));
  } finally { fs.rename = original; }
  assert.deepEqual(await fs.readFile(file("key")), before);
  assert.deepEqual(await fs.readdir(directory), [`${digest("key")}.bin`]);
}));
test("ciphertext from another key cannot be transplanted under a new filename", () => scoped(async ({ store, file }) => {
  await store.set("one", credentials("one")); await store.set("two", credentials("two"));
  await fs.copyFile(file("one"), file("two"));
  await assert.rejects(store.get("two"), { code: "credential_invalid_value" });
  assert.equal((await store.get("one")).sessionToken, "one");
}));
test("tampered and oversized ciphertext are rejected with no unchecked native decrypt", () => scoped(async ({ store, safeStorage, file }) => {
  await store.set("key", credentials()); const bytes = await fs.readFile(file("key")); bytes[bytes.length - 1] ^= 1;
  await fs.writeFile(file("key"), bytes);
  await assert.rejects(store.get("key"), { code: "credential_decryption_failed" });
  const before = safeStorage.calls.decrypt;
  await fs.writeFile(file("key"), Buffer.alloc(256 * 1024 + 1));
  await assert.rejects(store.get("key"), { code: "credential_unsafe_path" });
  assert.equal(safeStorage.calls.decrypt, before);
}));
test("a directory token filename is never read, replaced or removed", () => scoped(async ({ directory, store, file }) => {
  await fs.mkdir(directory, { recursive: true });
  await fs.mkdir(file("folder"));
  for (const operation of [() => store.get("folder"), () => store.set("folder", credentials()), () => store.delete("folder")]) await assert.rejects(operation(), { code: "credential_unsafe_path" });
}));
test("a hardlinked token filename is never read, replaced or removed", (t) => scoped(async ({ root, directory, safeStorage, store, file }) => {
  await fs.mkdir(directory, { recursive: true });
  const outside = path.join(root, "outside.bin"), bytes = await safeStorage.encryptStringAsync("outside-fixture");
  await fs.writeFile(outside, bytes);
  try { await fs.link(outside, file("linked")); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Dieser Testprozess darf keine nativen Hardlinks anlegen."); return; }
    throw error;
  }
  for (const operation of [() => store.get("linked"), () => store.set("linked", credentials()), () => store.delete("linked")]) await assert.rejects(operation(), { code: "credential_unsafe_path" });
  assert.deepEqual(await fs.readFile(outside), bytes);
}));
test("a directory junction/symlink in the profile path is rejected before file creation", (t) => scoped(async ({ root, safeStorage }) => {
  const outside = path.join(root, "other-profile"), link = path.join(root, "profile-link");
  await fs.mkdir(outside);
  try { await fs.symlink(outside, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Dieser Testprozess darf keine nativen Verzeichnisverknüpfungen anlegen."); return; }
    throw error;
  }
  const store = createSharedProjectCredentialStore({ directory: path.join(link, "credentials"), safeStorage });
  await assert.rejects(store.set("key", credentials()), { code: "credential_unsafe_path" });
  assert.deepEqual(await fs.readdir(outside), []);
}));
test("serialized writes cannot resurrect a token after a queued logout", () => scoped(async ({ store, safeStorage, directory }) => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const original = safeStorage.encryptStringAsync;
  safeStorage.encryptStringAsync = async value => { started.resolve(); await gate.promise; return original(value); };
  const first = store.set("key", credentials()); await started.promise;
  const deletion = store.delete("key"); gate.resolve(); await first; await deletion;
  assert.equal(await store.get("key"), null); assert.deepEqual(await fs.readdir(directory), []);
}));
test("input is captured before asynchronous encryption and returned values do not alias storage", () => scoped(async ({ store, safeStorage }) => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers(); const original = safeStorage.encryptStringAsync;
  safeStorage.encryptStringAsync = async value => { started.resolve(); await gate.promise; return original(value); };
  const value = credentials("captured"); const saving = store.set("key", value); await started.promise;
  value.sessionToken = "later-change"; gate.resolve(); await saving;
  assert.equal((await store.get("key")).sessionToken, "captured");
}));
test("native key rotation re-encrypts atomically using the actual async result shape", () => scoped(async ({ store, safeStorage, file }) => {
  await store.set("key", credentials()); const before = await fs.readFile(file("key"));
  safeStorage.rotateNext(); assert.deepEqual(await store.get("key"), credentials());
  assert.notDeepEqual(await fs.readFile(file("key")), before); assert.equal(safeStorage.calls.encrypt, 2);
}));
test("a plaintext-returning fake is rejected rather than written as encryption", () => scoped(async ({ directory, safeStorage }) => {
  const store = createSharedProjectCredentialStore({ directory, safeStorage: { ...safeStorage, async encryptStringAsync(value) { return Buffer.from(value); } } });
  await assert.rejects(store.set("key", credentials()), { code: "credential_encryption_failed" });
  assert.equal(await fs.stat(directory).catch(() => null), null);
}));
