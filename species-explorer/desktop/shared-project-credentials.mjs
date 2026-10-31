import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const MAX_CIPHERTEXT = 256 * 1024;
const MAX_PLAINTEXT = 96 * 1024;
const FIELDS = ["baseUrl", "projectId", "userId", "sessionToken", "sessionExpiresAt", "scope", "deviceToken", "deviceId", "deviceExpiresAt"];

export class SharedProjectCredentialError extends Error {
  constructor(code, message) { super(message); this.name = "SharedProjectCredentialError"; this.code = code; }
}
const failure = (code, message) => new SharedProjectCredentialError(code, message);
const unsafe = () => failure("credential_unsafe_path", "Die geschützte Anmeldeablage hat keinen sicheren lokalen Dateipfad.");
const invalid = () => failure("credential_invalid_value", "Die Anmeldedaten haben kein gültiges Speicherformat.");
const hash = value => createHash("sha256").update(value).digest("hex");
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
function keyHash(key) {
  if (typeof key !== "string" || !key.trim() || Buffer.byteLength(key) > 2048 || /[\u0000-\u001f]/.test(key)) throw invalid();
  return hash(key);
}
function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function copyCredentials(input) {
  if (!plainObject(input) || Reflect.ownKeys(input).some(key => typeof key !== "string" || !FIELDS.includes(key))) throw invalid();
  const value = {};
  for (const name of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (descriptor?.get || descriptor?.set) throw invalid();
    const item = descriptor?.value;
    const nullable = ["deviceToken", "deviceId", "deviceExpiresAt"].includes(name);
    if (nullable && (item === null || item === undefined)) { value[name] = null; continue; }
    const max = name.endsWith("Token") ? 32768 : 4096;
    if (typeof item !== "string" || !item.length || Buffer.byteLength(item) > max || /[\u0000-\u001f]/.test(item)) throw invalid();
    value[name] = item;
  }
  if (!["full", "read"].includes(value.scope)) throw invalid();
  let url;
  try { url = new URL(value.baseUrl); } catch { throw invalid(); }
  if (url.origin !== value.baseUrl || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname))) throw invalid();
  for (const name of ["sessionExpiresAt", "deviceExpiresAt"]) {
    if (value[name] !== null && (!Number.isFinite(Date.parse(value[name])) || new Date(value[name]).toISOString() !== value[name])) throw invalid();
  }
  const deviceParts = [value.deviceToken, value.deviceId, value.deviceExpiresAt];
  if (deviceParts.some(Boolean) && !deviceParts.every(Boolean)) throw invalid();
  return value;
}

/** Inject Electron safeStorage after app.whenReady; use a dedicated directory below app.getPath('userData'). */
export function createSharedProjectCredentialStore({ directory, safeStorage } = {}) {
  if (typeof directory !== "string" || directory.length > 4096 || /[\u0000-\u001f]/.test(directory) || !path.isAbsolute(directory)
      || /^[\\/]{2}/.test(directory) || path.resolve(directory) === path.parse(path.resolve(directory)).root) throw unsafe();
  const root = path.resolve(directory);
  let nativeApiAvailable = false;
  try { nativeApiAvailable = !!safeStorage && ["isAsyncEncryptionAvailable", "encryptStringAsync", "decryptStringAsync"].every(name => typeof safeStorage[name] === "function"); } catch { /* Redacted below. */ }
  if (!nativeApiAvailable) {
    throw failure("credential_encryption_unavailable", "Der geschützte asynchrone Anmeldespeicher ist auf diesem Gerät nicht verfügbar.");
  }
  let chain = Promise.resolve();
  function run(action) {
    const operation = chain.then(action);
    chain = operation.catch(() => {});
    return operation.catch(error => {
      if (error instanceof SharedProjectCredentialError) throw error;
      throw failure("credential_store_failed", "Die geschützte Anmeldeablage konnte nicht vollständig gelesen oder gespeichert werden.");
    });
  }
  async function encryptionAvailable() {
    let available;
    try {
      available = await safeStorage.isAsyncEncryptionAvailable();
      if (process.platform === "linux") {
        if (typeof safeStorage.getSelectedStorageBackend !== "function") available = false;
        else if (!["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(safeStorage.getSelectedStorageBackend())) available = false;
      }
    } catch { available = false; }
    if (available !== true) throw failure("credential_encryption_unavailable", "Die Betriebssystem-Verschlüsselung für Anmeldedaten ist nicht verfügbar. Es wird keine Klartextdatei angelegt.");
  }
  async function checkedDirectory(create = false) {
    let current = path.parse(root).root;
    for (const part of path.relative(current, root).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      let stat;
      try { stat = await fs.lstat(current, { bigint: true }); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (!create) return null;
        await fs.mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
        stat = await fs.lstat(current, { bigint: true });
      }
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw unsafe();
    }
    return fs.lstat(root, { bigint: true });
  }
  async function unchangedDirectory(before) {
    const after = await checkedDirectory();
    if (!after || !sameFile(before, after)) throw unsafe();
  }
  async function checkedFile(filename) {
    let stat;
    try { stat = await fs.lstat(filename, { bigint: true }); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size > BigInt(MAX_CIPHERTEXT)) throw unsafe();
    return stat;
  }
  async function readCiphertext(filename, directoryIdentity) {
    const expected = await checkedFile(filename);
    if (!expected) return null;
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const actual = await handle.stat({ bigint: true });
      if (!sameFile(actual, expected) || actual.nlink !== 1n || !actual.isFile()) throw unsafe();
      const buffer = Buffer.alloc(MAX_CIPHERTEXT + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      const current = await checkedFile(filename);
      if (offset > MAX_CIPHERTEXT || BigInt(offset) !== expected.size || after.size !== expected.size
          || after.mtimeNs !== expected.mtimeNs || after.ctimeNs !== expected.ctimeNs || !current || !sameFile(current, expected)) throw unsafe();
      await unchangedDirectory(directoryIdentity);
      return buffer.subarray(0, offset);
    } finally { await handle.close(); }
  }
  async function encrypt(plaintext) {
    let encrypted;
    try { encrypted = await safeStorage.encryptStringAsync(plaintext); }
    catch { throw failure("credential_encryption_failed", "Die Anmeldedaten konnten nicht geschützt gespeichert werden."); }
    if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.length > MAX_CIPHERTEXT || encrypted.equals(Buffer.from(plaintext))) {
      throw failure("credential_encryption_failed", "Die Verschlüsselung hat keinen gültigen geschützten Inhalt geliefert.");
    }
    return encrypted;
  }
  async function writeCiphertext(digest, encrypted) {
    const identity = await checkedDirectory(true), filename = path.join(root, `${digest}.bin`);
    await checkedFile(filename);
    const temporary = path.join(root, `.${digest}.${randomUUID()}.tmp`);
    let ownStat;
    try {
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try { ownStat = await handle.stat({ bigint: true }); await handle.writeFile(encrypted); await handle.sync(); }
      finally { await handle.close(); }
      await unchangedDirectory(identity);
      await checkedFile(filename);
      await fs.rename(temporary, filename);
      await unchangedDirectory(identity);
      await checkedFile(filename);
    } finally {
      // Only our exact temporary inode may be removed. An unsafe parent leaves encrypted evidence in place.
      try {
        await unchangedDirectory(identity);
        const current = await fs.lstat(temporary, { bigint: true });
        if (ownStat && sameFile(current, ownStat) && current.nlink === 1n && current.isFile() && !current.isSymbolicLink()) await fs.unlink(temporary);
      } catch { /* No recursive or unbound cleanup. */ }
    }
  }
  return {
    async get(key) {
      const digest = keyHash(key);
      return run(async () => {
        await encryptionAvailable();
        const identity = await checkedDirectory();
        if (!identity) return null;
        const encrypted = await readCiphertext(path.join(root, `${digest}.bin`), identity);
        if (!encrypted) return null;
        let decrypted;
        try { decrypted = await safeStorage.decryptStringAsync(encrypted); }
        catch { throw failure("credential_decryption_failed", "Die gespeicherte Anmeldung konnte mit diesem Betriebssystemprofil nicht entschlüsselt werden."); }
        if (!decrypted || typeof decrypted.result !== "string" || Buffer.byteLength(decrypted.result) > MAX_PLAINTEXT || typeof decrypted.shouldReEncrypt !== "boolean") throw invalid();
        let payload;
        try { payload = JSON.parse(decrypted.result); } catch { throw invalid(); }
        if (!plainObject(payload) || Object.keys(payload).sort().join(",") !== "credentials,keyHash,schemaVersion"
            || payload.schemaVersion !== 1 || payload.keyHash !== digest) throw invalid();
        const value = copyCredentials(payload.credentials);
        if (decrypted.shouldReEncrypt) await writeCiphertext(digest, await encrypt(decrypted.result));
        return value;
      });
    },
    async set(key, input) {
      const digest = keyHash(key);
      let value;
      try { value = copyCredentials(input); }
      catch { throw invalid(); }
      const plaintext = JSON.stringify({ schemaVersion: 1, keyHash: digest, credentials: value });
      if (Buffer.byteLength(plaintext) > MAX_PLAINTEXT) throw invalid();
      return run(async () => {
        await encryptionAvailable();
        const encrypted = await encrypt(plaintext);
        await writeCiphertext(digest, encrypted);
      });
    },
    async delete(key) {
      const digest = keyHash(key);
      return run(async () => {
        // Deletion needs no decryption and remains possible when an OS key is unavailable.
        const identity = await checkedDirectory();
        if (!identity) return;
        const filename = path.join(root, `${digest}.bin`);
        if (!await checkedFile(filename)) return;
        await unchangedDirectory(identity);
        await fs.unlink(filename);
        await unchangedDirectory(identity);
      });
    },
  };
}
