import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { languageRuntimeRoot, languageRuntimeTree, noLanguageLinks, resolveLanguageRuntime, LANGUAGE_LAUNCHER_LOCK } from "./runtime.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "lt-runtime-")), runtimeRoot = path.join(root, "tools", "LanguageTool-6.6");
  await fs.mkdir(runtimeRoot, { recursive: true }); await fs.writeFile(path.join(runtimeRoot, "languagetool-server.jar"), "own synthetic archive");
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  return { root, runtimeRoot, runtimeLock: { version: "6.6", tree: await languageRuntimeTree(runtimeRoot) } };
}
test("all installed files, directories, names and bytes contribute to the fixed package identity", async t => {
  const f = await fixture(t), before = await languageRuntimeTree(f.runtimeRoot);
  assert.equal(before.files, 1); assert.equal(before.bytes, 21);
  await fs.mkdir(path.join(f.runtimeRoot, "empty")); assert.notEqual((await languageRuntimeTree(f.runtimeRoot)).treeSha256, before.treeSha256);
  await fs.rmdir(path.join(f.runtimeRoot, "empty")); await fs.writeFile(path.join(f.runtimeRoot, "languagetool-server.jar"), "own changed archive!!");
  assert.notEqual((await languageRuntimeTree(f.runtimeRoot)).treeSha256, before.treeSha256);
});
test("bundled Java is preferred, private explicit configuration is respected, no Android Studio path is required", async t => {
  const f = await fixture(t), executable = process.platform === "win32" ? "java.exe" : "java", bundled = path.join(f.root, "tools", "java", "bin", executable),
    configured = path.join(f.root, executable);
  await fs.mkdir(path.dirname(bundled), { recursive: true }); await fs.writeFile(bundled, "own bundled Java stub"); await fs.writeFile(configured, "own configured Java stub");
  await fs.writeFile(path.join(f.root, "tools", "runtime-config.json"), JSON.stringify({ schemaVersion: 1, javaPath: configured }));
  const input = { repoRoot: f.root, runtimeRoot: f.runtimeRoot, runtimeLock: f.runtimeLock, environment: {} };
  assert.equal((await resolveLanguageRuntime(input)).javaPath, bundled);
  await fs.unlink(bundled); assert.equal((await resolveLanguageRuntime(input)).javaPath, configured);
  assert.equal((await resolveLanguageRuntime({ ...input, javaPath: configured })).javaPath, configured);
});
test("JAVA_HOME and PATH remain optional fallbacks and missing Java is a friendly specific failure", async t => {
  const f = await fixture(t), executable = process.platform === "win32" ? "java.exe" : "java", javaHome = path.join(f.root, "jdk"), java = path.join(javaHome, "bin", executable);
  await fs.mkdir(path.dirname(java), { recursive: true }); await fs.writeFile(java, "own Java stub");
  const input = { repoRoot: f.root, runtimeRoot: f.runtimeRoot, runtimeLock: f.runtimeLock };
  assert.equal((await resolveLanguageRuntime({ ...input, environment: { JAVA_HOME: javaHome } })).javaPath, java);
  assert.equal((await resolveLanguageRuntime({ ...input, environment: { PATH: path.dirname(java) } })).javaPath, java);
  await assert.rejects(resolveLanguageRuntime({ ...input, environment: {} }), { code: "LANGUAGE_CHECK_JAVA_MISSING" });
});
test("a Windows setup uses its bound language bundle while explicit and previous private runtimes remain available", async t => {
  const f = await fixture(t), bundled = path.join(f.root, "runtime", "languagetool", "LanguageTool-6.6"),
    previous = languageRuntimeRoot(f.root), executable = process.platform === "win32" ? "java.exe" : "java",
    java = path.join(f.root, "runtime", "java", "bin", executable);
  await fs.cp(f.runtimeRoot, previous, { recursive: true });
  await fs.mkdir(path.dirname(java), { recursive: true });
  await fs.writeFile(java, "own bundled Java stub");
  const input = { repoRoot: f.root, runtimeLock: f.runtimeLock, environment: { FN_EXPLORER_INSTALLED: "1" } };
  assert.equal((await resolveLanguageRuntime(input)).directory, previous);
  await fs.cp(f.runtimeRoot, bundled, { recursive: true });
  const resolved = await resolveLanguageRuntime(input);
  assert.equal(resolved.directory, bundled);
  assert.equal(resolved.javaPath, java);
  assert.equal((await resolveLanguageRuntime({ ...input, runtimeRoot: f.runtimeRoot })).directory, f.runtimeRoot);
  assert.equal((await resolveLanguageRuntime({ ...input, environment: {} })).directory, previous);
  await fs.writeFile(path.join(bundled, "extra.jar"), "unknown");
  await assert.rejects(resolveLanguageRuntime(input), { code: "LANGUAGE_CHECK_RUNTIME_CHANGED" });
});
test("incomplete, extra or changed packages and unrecognized private configuration stop before execution", async t => {
  const f = await fixture(t), input = { repoRoot: f.root, runtimeRoot: f.runtimeRoot, runtimeLock: f.runtimeLock, environment: {} };
  await fs.writeFile(path.join(f.runtimeRoot, "extra.jar"), "unknown");
  await assert.rejects(resolveLanguageRuntime(input), { code: "LANGUAGE_CHECK_RUNTIME_CHANGED" });
  await fs.unlink(path.join(f.runtimeRoot, "extra.jar"));
  await fs.writeFile(path.join(f.root, "tools", "runtime-config.json"), JSON.stringify({ schemaVersion: 1, javaPath: "relative.exe" }));
  await assert.rejects(resolveLanguageRuntime(input), { code: "LANGUAGE_CHECK_UNSAFE_RUNTIME" });
  await assert.rejects(resolveLanguageRuntime({ ...input, runtimeRoot: path.join(f.root, "missing") }), { code: "LANGUAGE_CHECK_NOT_INSTALLED" });
});
test("the bundled launcher pins release 17, actual JAR bytes and normalized complete source", async () => {
  assert.equal(LANGUAGE_LAUNCHER_LOCK.javaRelease, 17);
  assert.equal(hash(await fs.readFile(new URL("./managed-launcher.jar", import.meta.url))), LANGUAGE_LAUNCHER_LOCK.jarSha256);
  const source = (await fs.readFile(new URL("./FNManagedLanguageTool.java", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
  assert.equal(hash(source), LANGUAGE_LAUNCHER_LOCK.sourceSha256);
  assert.match(source, /"127\.0\.0\.1"/); assert.match(source, /server\.stop\(\)/); assert.doesNotMatch(source, /--public|Runtime\.getRuntime\(\)\.exec/);
});
test("relative, network and malformed runtime paths never become execution locations", async () => {
  assert.throws(() => languageRuntimeRoot("relative"), { code: "LANGUAGE_CHECK_UNSAFE_RUNTIME" });
  assert.throws(() => languageRuntimeRoot(path.resolve("."), "relative"), { code: "LANGUAGE_CHECK_UNSAFE_RUNTIME" });
  await assert.rejects(noLanguageLinks("//server/share/tool"), { code: "LANGUAGE_CHECK_UNSAFE_RUNTIME" });
});
