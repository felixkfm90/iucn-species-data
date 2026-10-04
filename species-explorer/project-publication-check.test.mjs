import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProjectPublicationSources } from "./project-publication-check.mjs";
import { createProjectPublicationService } from "./project-publication.mjs";

const testRoot = tmpdir();

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8" });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}

async function fixture(t) {
  await mkdir(testRoot, { recursive: true });
  const root = await mkdtemp(join(testRoot, "publication-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    ".gitattributes": "*.mjs text eol=lf\n",
    "scripts/project-status.mjs": 'import { status } from "../species-explorer/status-model.mjs";\nconsole.log(status);\n',
    "scripts/validate-data-schema.mjs": 'import { validate } from "./data-schema.mjs";\nvalidate();\n',
    "scripts/data-schema.mjs": "export function validate() {}\n",
    "species-explorer/status-model.mjs": 'export { status } from "./status-fields.mjs";\n',
    "species-explorer/status-fields.mjs": 'export const status = "old format";\n',
    "lightroom-plugin/unrelated.lua": "return {}\n",
    "docs/project-status.md": "Original status\n",
    "species-assets-overrides.json": '{"version":1,"assets":{}}\n',
  };
  for (const [filename, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, filename)), { recursive: true });
    await writeFile(join(root, filename), content);
  }
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "publication-fixture@example.invalid");
  git(root, "config", "user.name", "Publication fixture");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Initial fixture");
  return root;
}

test("Datenübertragung akzeptiert denselben Generator trotz CRLF und fachfremder lokaler Änderung", async (t) => {
  const root = await fixture(t);
  const generator = join(root, "scripts", "project-status.mjs");
  await writeFile(generator, (await readFile(generator, "utf8")).replaceAll("\n", "\r\n"));
  await writeFile(join(root, "lightroom-plugin", "unrelated.lua"), "return { changed = true }\n");
  await writeFile(join(root, "species-assets-overrides.json"), '{"version":1,"assets":{"Amsel":{"map":{"protectFromPipeline":true}}}}\n');
  assert.deepEqual(checkProjectPublicationSources(root).files, []);
  assert.equal(checkProjectPublicationSources(root).ok, true);
});

test("Unveröffentlichter neuer Status stoppt vor Statusschreiben und lässt Originaldateien und Index erhalten", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "scripts", "project-status.mjs"), 'import { writeFileSync } from "node:fs";\nwriteFileSync("docs/project-status.md", "new format");\n');
  const before = git(root, "status", "--porcelain");
  const service = createProjectPublicationService({ repoRoot: root });
  await assert.rejects(service.synchronizeProjectStatusForPublication(), /unveröffentlichten Code: scripts\/project-status\.mjs/);
  assert.equal(await readFile(join(root, "docs", "project-status.md"), "utf8"), "Original status\n");
  assert.equal(git(root, "status", "--porcelain"), before);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
});

test("Rekursive Modellabhängigkeit blockiert auch bei unverändertem Generator; neue Prüfung nach Codecommit erlaubt Wiederholung", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "species-explorer", "status-fields.mjs"), 'export const status = "new map care format";\n');
  const failed = checkProjectPublicationSources(root);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.files, ["species-explorer/status-fields.mjs"]);
  git(root, "add", "species-explorer/status-fields.mjs");
  assert.equal(checkProjectPublicationSources(root).ok, false);
  git(root, "commit", "--quiet", "-m", "Publish updated generator dependency");
  assert.equal(checkProjectPublicationSources(root).ok, true);
});

test("Neue unversionierte Kartenabhängigkeit und neues Schema werden ausdrücklich erkannt", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "species-explorer", "status-model.mjs"), 'import { status } from "../scripts/map-provenance.mjs";\nexport { status };\n');
  await writeFile(join(root, "scripts", "map-provenance.mjs"), 'export const status = "browser import";\n');
  await writeFile(join(root, "scripts", "data-schema.mjs"), "export function validate() { return true; }\n");
  const result = checkProjectPublicationSources(root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.files, ["scripts/data-schema.mjs", "scripts/map-provenance.mjs", "species-explorer/status-model.mjs"]);
});

test("Fehlende Abhängigkeit oder nicht lesbarer Git-Stand erlauben keine Datenveröffentlichung", async (t) => {
  const root = await fixture(t);
  await unlink(join(root, "species-explorer", "status-fields.mjs"));
  assert.equal(checkProjectPublicationSources(root).ok, false);
  assert.match(checkProjectPublicationSources(root).message, /Veröffentlichungsgrundlage konnte nicht geprüft werden/);
  await writeFile(join(root, "species-explorer", "status-fields.mjs"), 'export const status = "old format";\n');
  const isolated = join(root, "without-git");
  await mkdir(isolated);
  const result = checkProjectPublicationSources(isolated, { entryPoints: [] });
  assert.equal(result.ok, false);
});
