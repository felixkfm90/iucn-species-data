import fs from "node:fs";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createSharedProjectStore } from "../species-explorer/shared-project/store.mjs";
import { validatePassword } from "../species-explorer/shared-project/security.mjs";

const cancelled = () => new Error("Persönliche Einrichtung abgebrochen; es wurden keine Zugänge angelegt.");

function databaseArgument(args) {
  let filename;
  const flags = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flags.has(flag)) throw new Error("Jedes Einrichtungsargument darf nur einmal angegeben werden.");
    flags.add(flag);
    if (flag === "--db" && args[index + 1] && !args[index + 1].startsWith("--")) filename = args[++index];
    else if (!["--confirm-local-storage", "--confirm-bootstrap"].includes(flag)) throw new Error("Unzulässiges Einrichtungsargument.");
  }
  if (!flags.has("--confirm-local-storage") || !flags.has("--confirm-bootstrap") || !filename
    || !path.isAbsolute(filename) || /^(?:\\\\|\/\/|file:)/i.test(filename) || filename.includes("\0")) {
    throw new Error("Erforderlich: --db <absolute lokale Datei> --confirm-local-storage --confirm-bootstrap.");
  }
  let current = path.parse(filename).root;
  for (const part of path.relative(current, filename).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Verknüpfte Datenpfade sind nicht zulässig."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return filename;
}

function assertNotInitialized(filename) {
  if (!fs.existsSync(filename)) return;
  let database;
  try {
    database = new DatabaseSync(filename, { readOnly: true });
    const table = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='users'").get();
    if (table && database.prepare("SELECT count(*) AS n FROM users").get().n > 0) {
      throw new Error("Das Projekt ist bereits eingerichtet; es werden keine Eingaben oder Änderungen vorgenommen.");
    }
  } finally { database?.close(); }
}

/** Terminal echo is disabled for the whole password question; no password history is retained. */
export function createPersonalTerminal({ input = process.stdin, output = process.stdout, signals = process } = {}) {
  if (input.isTTY !== true || output.isTTY !== true || typeof input.setRawMode !== "function") {
    throw new Error("Die persönliche Einrichtung benötigt ein direktes interaktives Terminal; keine Pipe oder Protokolldatei.");
  }
  const wasRaw = input.isRaw === true, wasFlowing = input.readableFlowing === true;
  let closed = false, pending;
  const abort = () => {
    const waiting = pending; pending = undefined;
    if (waiting) { waiting.value = ""; waiting.reject(cancelled()); }
    close();
  };
  function keypress(text, key = {}) {
    if (key.ctrl && ["c", "d"].includes(key.name)) { abort(); return; }
    if (!pending) return;
    if (["return", "enter"].includes(key.name)) {
      const answer = pending; pending = undefined;
      output.write("\n");
      answer.resolve(answer.value);
      answer.value = "";
      return;
    }
    if (key.name === "backspace") {
      const characters = [...pending.value];
      if (characters.length) {
        characters.pop(); pending.value = characters.join("");
        if (!pending.secret) output.write("\b \b");
      }
      return;
    }
    if (key.ctrl || key.meta || key.name === "escape" || !text || /[\x00-\x1f\x7f]/.test(text)) return;
    if (pending.value.length + text.length > pending.maxLength) {
      const waiting = pending; pending = undefined;
      waiting.value = "";
      waiting.reject(new Error("Die Eingabe überschreitet die zulässige Länge."));
      close();
      return;
    }
    pending.value += text;
    if (!pending.secret) output.write(text);
  }
  emitKeypressEvents(input);
  input.on("keypress", keypress);
  input.on("end", abort);
  input.on("error", abort);
  signals.on("SIGINT", abort);
  signals.on("SIGTERM", abort);
  input.setRawMode(true);
  input.resume();
  function close() {
    if (closed) return;
    closed = true;
    const waiting = pending; pending = undefined;
    if (waiting) { waiting.value = ""; waiting.reject(cancelled()); }
    input.removeListener("keypress", keypress);
    input.removeListener("end", abort);
    input.removeListener("error", abort);
    signals.removeListener("SIGINT", abort);
    signals.removeListener("SIGTERM", abort);
    try { input.setRawMode(wasRaw); }
    finally { if (!wasFlowing) input.pause(); }
  }
  return {
    write: (text) => output.write(text),
    ask(label, { secret = false, maxLength = 256 } = {}) {
      if (closed || pending) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        pending = { resolve, reject, secret, maxLength, value: "" };
        output.write(label);
      });
    },
    close,
  };
}

export async function bootstrapPersonal(args = process.argv.slice(2), {
  input = process.stdin, output = process.stdout, terminalFactory = createPersonalTerminal,
  storeFactory = createSharedProjectStore,
} = {}) {
  const filename = databaseArgument(args);
  if (input.isTTY !== true || output.isTTY !== true) throw new Error("Persönliche Eingaben sind nur im interaktiven Terminal zulässig.");
  assertNotInitialized(filename);
  let terminal, store;
  const users = [];
  try {
    terminal = terminalFactory({ input, output });
    terminal.write("Persönliche Ersteinrichtung für zwei Administratoren. Keine Standardzugänge.\nPasswörter werden verdeckt eingegeben und nicht protokolliert. Bis zur Bestätigung bricht Strg+C ab.\n");
    for (let index = 0; index < 2; index++) {
      const username = (await terminal.ask(`Person ${index + 1} · Benutzername: `, { maxLength: 80 })).trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._@+-]{2,79}$/.test(username) || users.some((user) => user.username === username)) {
        throw new Error("Benutzernamen müssen gültig und verschieden sein.");
      }
      const displayName = (await terminal.ask(`Person ${index + 1} · Anzeigename: `, { maxLength: 120 })).trim();
      if (!displayName || /[\x00-\x1f\x7f]/.test(displayName)) throw new Error("Ein gültiger Anzeigename ist erforderlich.");
      const password = await terminal.ask(`Person ${index + 1} · Passwort (12–256 Zeichen): `, { secret: true });
      validatePassword(password);
      const repeat = await terminal.ask(`Person ${index + 1} · Passwort wiederholen: `, { secret: true });
      if (password !== repeat) throw new Error("Die Passwortwiederholung stimmt nicht überein.");
      users.push({ username, displayName, password });
    }
    if ((await terminal.ask("Beide Personen jetzt als Administration anlegen? Bitte ja eingeben: ", { maxLength: 10 })).trim() !== "ja") throw cancelled();
    terminal.close();
    terminal.write("Die bestätigte Einrichtung wird jetzt abgeschlossen.\n");
    store = storeFactory({ filename, localStorageConfirmed: true });
    const result = await store.bootstrap({ confirmed: true, users });
    terminal.write("Projekt eingerichtet: zwei Administratoren angelegt. Keine Zugangsdaten ausgegeben.\n");
    return { initialized: result.initialized, adminCount: result.adminCount };
  } finally {
    for (const user of users) user.password = "";
    store?.close();
    terminal?.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  bootstrapPersonal().catch(() => {
    process.stderr.write("Persönliche Einrichtung nicht abgeschlossen. Terminal, Eingaben und noch nicht eingerichteten lokalen Projektpfad prüfen.\n");
    process.exitCode = 1;
  });
}
