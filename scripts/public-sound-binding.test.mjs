import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { checkPublicSpeciesSoundBinding } from "./public-sound-binding.mjs";
import { tmpdir } from "./test-temp.mjs";

test("published sound bindings require both current hashes and an explicit current status", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "sound-binding-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const folder = path.join(root, "species-assets", "Testente");
  await mkdir(folder, { recursive: true });
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const sound = Buffer.from("reviewed recording");
  const spectrum = Buffer.from("reviewed spectrum");
  const pair = { soundSha256: hash(sound), spectrogramSha256: hash(spectrum) };
  const check = binding => checkPublicSpeciesSoundBinding(root, "Testente", binding);
  assert.equal(await check(undefined), null);
  await writeFile(path.join(folder, "sound.mp3"), sound);
  assert.match(await check({ ...pair, stale: false }), /Testente/);
  await writeFile(path.join(folder, "spectrogram.webp"), spectrum);
  assert.match(await check(pair), /Testente/);
  assert.match(await check({ ...pair, stale: true }), /Testente/);
  assert.equal(await check({ ...pair, stale: false }), null);
  await writeFile(path.join(folder, "spectrogram.webp"), "mismatched spectrum");
  assert.match(await check({ ...pair, stale: false }), /Testente/);
});
