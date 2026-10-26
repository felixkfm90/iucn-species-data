import test from "node:test";
import assert from "node:assert/strict";
import { replaceTaxonomyMasterDirectory } from "./taxonomy-master-candidate.mjs";

const failure = (code) => Object.assign(new Error(code), { code });
function fixture(fail = () => null) {
  const paths = new Map([["/test/new", "new"], ["/test/staging", "old"]]);
  const calls = [], waits = [], removals = [];
  return { paths, calls, waits, removals,
    options: { wait: async (delay) => { waits.push(delay); }, files: {
      async rename(from, to) {
        calls.push([from, to]);
        const error = fail(from, to, calls.length);
        if (error) throw error;
        if (!paths.has(from)) throw failure("ENOENT");
        if (paths.has(to)) throw failure("EEXIST");
        paths.set(to, paths.get(from)); paths.delete(from);
      },
      async rm(filename) { removals.push(filename); paths.delete(filename); },
    } } };
}
for (const code of ["EPERM", "EBUSY", "EACCES"]) {
  test(`transient ${code} retries the same backup path and then installs`, async () => {
    const value = fixture((from, to, call) => call <= 2 ? failure(code) : null);
    await replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options);
    assert.deepEqual(value.waits, [60, 120]);
    assert.equal(new Set(value.calls.slice(0, 3).map((entry) => entry[1])).size, 1);
    assert.deepEqual([...value.paths], [["/test/staging", "new"]]);
    assert.equal(value.removals.length, 1);
  });
}
test("permanent lock is bounded and preserves both directories", async () => {
  const value = fixture(() => failure("EPERM"));
  await assert.rejects(replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options), { code: "EPERM" });
  assert.equal(value.calls.length, 9);
  assert.deepEqual(value.waits, [60, 120, 180, 240, 300, 360, 420, 480]);
  assert.deepEqual([...value.paths], [["/test/new", "new"], ["/test/staging", "old"]]);
  assert.equal(value.removals.length, 0);
});
test("unrelated errors fail immediately without retry or cleanup", async () => {
  const value = fixture(() => failure("ENOSPC"));
  await assert.rejects(replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options), { code: "ENOSPC" });
  assert.equal(value.calls.length, 1); assert.equal(value.waits.length, 0); assert.equal(value.removals.length, 0);
});
test("missing optional old target permits installation", async () => {
  const value = fixture(); value.paths.delete("/test/staging");
  await replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options);
  assert.deepEqual([...value.paths], [["/test/staging", "new"]]);
  assert.equal(value.waits.length, 0); assert.equal(value.removals.length, 0);
});
test("failed new installation restores the old target with bounded retries", async () => {
  let rollbackAttempts = 0;
  const value = fixture((from) => from === "/test/new" ? failure("ENOSPC")
    : from.includes(".staging-old-") && ++rollbackAttempts <= 2 ? failure("EBUSY") : null);
  await assert.rejects(replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options), { code: "ENOSPC" });
  assert.deepEqual(value.waits, [60, 120]);
  assert.deepEqual([...value.paths], [["/test/new", "new"], ["/test/staging", "old"]]);
  assert.equal(value.removals.length, 0);
});
test("failed rollback reports both causes and retains new and backup paths", async () => {
  const value = fixture((from) => from === "/test/new" ? failure("ENOSPC")
    : from.includes(".staging-old-") ? failure("EACCES") : null);
  const error = await replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options).then(() => null, (error) => error);
  assert.ok(error instanceof AggregateError);
  assert.deepEqual(error.errors.map((entry) => entry.code), ["ENOSPC", "EACCES"]);
  assert.match(error.message, /\/test\/new; .*\.staging-old-/);
  assert.equal(value.paths.get("/test/new"), "new");
  assert.equal([...value.paths.values()].filter((value) => value === "old").length, 1);
  assert.equal(value.removals.length, 0);
});
test("backup cleanup failure does not roll old data over installed candidate", async () => {
  const value = fixture(); value.options.files.rm = async () => { throw failure("EPERM"); };
  await assert.rejects(replaceTaxonomyMasterDirectory("/test/new", "/test/staging", value.options), { code: "EPERM" });
  assert.equal(value.calls.length, 2); assert.equal(value.paths.get("/test/staging"), "new");
  assert.equal([...value.paths.values()].filter((value) => value === "old").length, 1);
});
