import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../scripts/test-temp.mjs";
import { bootstrapPersonal, createPersonalTerminal } from "./bootstrap-personal.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nas-personal-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  return path.join(root, "project.sqlite");
}
const flags = (filename) => ["--db", filename, "--confirm-local-storage", "--confirm-bootstrap"];
const firstPassword = "Synthetic alpha personal password", secondPassword = "Synthetic beta personal password";
function answers(values) {
  const state = { output: "", closed: false, questions: [] };
  return { state, input: { isTTY: true }, output: { isTTY: true }, terminalFactory: () => ({
    write(text) { state.output += text; },
    async ask(label, options) {
      state.questions.push({ label, ...options });
      if (!values.length) throw new Error("Synthetic EOF");
      const answer = values.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    },
    close() { state.closed = true; },
  }) };
}
function tty() {
  const input = new PassThrough(), output = new PassThrough(), signals = new EventEmitter();
  input.isTTY = output.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  output.columns = 80;
  let printed = "";
  output.on("data", (chunk) => { printed += chunk; });
  return { input, output, signals, printed: () => printed };
}

test("personal bootstrap requires exact flags, absolute local path and terminal before side effects", async (t) => {
  const filename = await fixture(t), io = answers([]);
  for (const args of [[], ["--db", filename], flags("relative.sqlite"), [...flags(filename), "--password", "forbidden"], [...flags(filename), "--confirm-bootstrap"]]) {
    await assert.rejects(bootstrapPersonal(args, io));
  }
  await assert.rejects(bootstrapPersonal(flags(filename), { ...io, input: { isTTY: false } }), /Terminal/);
  assert.equal(io.state.questions.length, 0);
  assert.equal(await fs.access(filename).then(() => true, () => false), false);
});

test("personal bootstrap creates two real admins without emitting secrets and refuses a second run before input", async (t) => {
  const filename = await fixture(t);
  const io = answers(["fixture-alpha", "Synthetic Alpha", firstPassword, firstPassword, "fixture-beta", "Synthetic Beta", secondPassword, secondPassword, "ja"]);
  assert.deepEqual(await bootstrapPersonal(flags(filename), io), { initialized: true, adminCount: 2 });
  assert.equal(io.state.closed, true);
  assert.equal(io.state.questions.filter((question) => question.secret).length, 4);
  assert.ok(!io.state.output.includes(firstPassword) && !io.state.output.includes(secondPassword));
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const users = database.prepare("SELECT username,role,password_hash FROM users ORDER BY username").all();
    assert.equal(users.length, 2);
    assert.ok(users.every((user) => user.role === "admin" && user.password_hash.startsWith("scrypt$")));
    assert.ok(!JSON.stringify(users).includes(firstPassword) && !JSON.stringify(users).includes(secondPassword));
  } finally { database.close(); }
  const before = await fs.readFile(filename), repeated = answers([]);
  await assert.rejects(bootstrapPersonal(flags(filename), repeated), /bereits eingerichtet/);
  assert.equal(repeated.state.questions.length, 0);
  assert.deepEqual(await fs.readFile(filename), before);
});

test("personal bootstrap mismatch, short password, duplicate name, EOF and declined confirmation leave no DB", async (t) => {
  const cases = [
    ["fixture-alpha", "Synthetic Alpha", firstPassword, "different synthetic value"],
    ["fixture-alpha", "Synthetic Alpha", "short"],
    ["fixture-alpha", "Synthetic Alpha", firstPassword, firstPassword, "FIXTURE-ALPHA"],
    ["fixture-alpha", new Error("Synthetic EOF")],
    ["fixture-alpha", "Synthetic Alpha", firstPassword, firstPassword, "fixture-beta", "Synthetic Beta", secondPassword, secondPassword, "nein"],
  ];
  for (const values of cases) {
    const filename = await fixture(t), io = answers(values);
    await assert.rejects(bootstrapPersonal(flags(filename), io));
    assert.equal(io.state.closed, true);
    assert.equal(await fs.access(filename).then(() => true, () => false), false);
    assert.ok(!io.state.output.includes(firstPassword) && !io.state.output.includes(secondPassword));
  }
});

test("personal bootstrap closes store when actual bootstrap fails after confirmation", async (t) => {
  const filename = await fixture(t), io = answers(["fixture-alpha", "Synthetic Alpha", firstPassword, firstPassword, "fixture-beta", "Synthetic Beta", secondPassword, secondPassword, "ja"]);
  let closed = false;
  await assert.rejects(bootstrapPersonal(flags(filename), { ...io, storeFactory: () => ({
    bootstrap: async () => { throw new Error("Synthetic storage failure"); }, close() { closed = true; },
  }) }), /Synthetic storage failure/);
  assert.equal(closed, true);
  assert.equal(io.state.closed, true);
});

test("real terminal helper hides password typing and backspace while public input remains visible; raw mode is restored", async () => {
  const streams = tty(), terminal = createPersonalTerminal(streams);
  const question = terminal.ask("Passwort: ", { secret: true });
  streams.input.write("Synthetic secretX");
  streams.input.write("\u007f");
  streams.input.write("\r");
  assert.equal(await question, "Synthetic secret");
  assert.ok(!streams.printed().includes("Synthetic secret"));
  const visible = terminal.ask("Name: ");
  streams.input.write("Synthetic Name\r");
  assert.equal(await visible, "Synthetic Name");
  assert.ok(streams.printed().includes("Synthetic Name"));
  terminal.close();
  assert.equal(streams.input.isRaw, false);
  assert.equal(streams.input.readableFlowing, false);
  assert.equal(streams.signals.listenerCount("SIGINT"), 0);
  assert.equal(streams.signals.listenerCount("SIGTERM"), 0);
});

test("real terminal Ctrl-C, EOF and process signal abort hidden input and restore terminal/listeners", async () => {
  for (const mode of ["ctrl-c", "eof", "signal"]) {
    const streams = tty(), terminal = createPersonalTerminal(streams);
    const waiting = terminal.ask("Passwort: ", { secret: true });
    const rejected = assert.rejects(waiting, /abgebrochen/);
    streams.input.write("Synthetic partial secret");
    if (mode === "ctrl-c") streams.input.write("\u0003");
    else if (mode === "eof") streams.input.end();
    else streams.signals.emit("SIGTERM");
    await rejected;
    assert.equal(streams.input.isRaw, false);
    assert.equal(streams.signals.listenerCount("SIGINT"), 0);
    assert.equal(streams.signals.listenerCount("SIGTERM"), 0);
    assert.ok(!streams.printed().includes("Synthetic partial secret"));
    terminal.close();
  }
});

test("terminal helper refuses redirected streams", () => {
  const streams = tty();
  streams.output.isTTY = false;
  assert.throws(() => createPersonalTerminal(streams), /Terminal/);
});

test("terminal helper bounds hidden input and never echoes pasted leftovers or password history", async () => {
  const streams = tty(), terminal = createPersonalTerminal(streams);
  const secret = terminal.ask("Passwort: ", { secret: true });
  streams.input.write("Synthetic secret\rSynthetic remainder");
  assert.equal(await secret, "Synthetic secret");
  const visible = terminal.ask("Name: ");
  streams.input.write("\u001b[A");
  streams.input.write("Synthetic public\r");
  assert.equal(await visible, "Synthetic public");
  assert.ok(!streams.printed().includes("Synthetic secret") && !streams.printed().includes("Synthetic remainder"));
  const bounded = terminal.ask("Begrenzt: ", { secret: true, maxLength: 3 });
  const rejected = assert.rejects(bounded, /Länge/);
  streams.input.write("1234");
  await rejected;
  assert.equal(streams.input.isRaw, false);
});

test("actual module import is side effect free and actual CLI rejects non-TTY without credentials in output", async (t) => {
  const filename = await fixture(t), root = path.dirname(filename);
  const helper = fileURLToPath(new URL("./bootstrap-personal.mjs", import.meta.url));
  const run = (args, input = "") => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", ...args], { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let printed = "";
    child.stdout.on("data", (chunk) => { printed += chunk; });
    child.stderr.on("data", (chunk) => { printed += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, printed }));
    child.stdin.end(input);
  });
  const imported = await run(["--input-type=module", "-e", `await import(${JSON.stringify(new URL("./bootstrap-personal.mjs", import.meta.url).href)});`]);
  assert.deepEqual(imported, { code: 0, printed: "" });
  const cli = await run([helper, ...flags(filename)], firstPassword);
  assert.equal(cli.code, 1);
  assert.ok(!cli.printed.includes(firstPassword));
  assert.deepEqual(await fs.readdir(root), []);
});
