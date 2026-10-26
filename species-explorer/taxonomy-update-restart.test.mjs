import { tmpdir } from "../scripts/test-temp.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { assertRestartScope, readRestartInputs, restartDigest } from "./taxonomy-update-restart.mjs";
import { captureCatalogUsage, createCatalogUsageService } from "./lightroom-catalog-usage.mjs";
import { taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "fn-restart-inputs-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const identity = { updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    buildJobId: "job-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", referenceRelease: "col-new" };
  const directory = path.join(root, "master", "build-jobs", identity.buildJobId);
  await fs.mkdir(directory, { recursive: true });
  const selection = { speciesListPath: path.join(root, "species.json"), correctionsPath: path.join(root, "corrections.json") };
  await fs.writeFile(selection.speciesListPath, "[]");
  await fs.writeFile(selection.correctionsPath, '{"entries":[]}');
  const recipe = { schemaVersion: 1, id: identity.buildJobId, updateRunId: identity.updateRunId, taxonomyRoot: root, selection, options: {} };
  recipe.revision = restartDigest(recipe);
  await fs.writeFile(path.join(directory, "recipe.json"), JSON.stringify(recipe));
  await fs.writeFile(path.join(directory, "state.json"), JSON.stringify({ id: identity.buildJobId, status: "failed" }));
  await fs.writeFile(path.join(directory, "..", "current.json"), JSON.stringify({ id: identity.buildJobId, updateRunId: identity.updateRunId }));
  await fs.writeFile(path.join(root, "active.json"), '{"activeRelease":"col-new"}');
  await fs.mkdir(path.join(root, "releases", "col-new"), { recursive: true });
  await fs.writeFile(path.join(root, "releases", "col-new", "manifest.json"), '{"releaseId":"col-new"}');
  const catalogPath = path.join(root, "fixture.lrcat"); await fs.writeFile(catalogPath, "Synthetic catalog");
  const input = { catalogPath, complete: true, passes: 2, totalPhotos: 0, usedTaxa: [] };
  await captureCatalogUsage(root, input);
  const usage = createCatalogUsageService({ taxonomyRoot: root });
  await usage.catalogUsageSave({ token: (await usage.catalogUsagePreview()).token, confirmed: true,
    allCatalogsConfirmed: true, unchangedSinceCapture: true });
  const master = { active: false, lifecycle: { active: { candidateId: "master-old" } }, reference: { activeRelease: "col-new" },
    buildJob: { available: true, id: identity.buildJobId, updateRunId: identity.updateRunId, status: "failed" } };
  const maintenance = { active: false, status: "completed", activeRelease: "col-new" };
  const baseline = { masterVersion: "master-old", referenceRelease: "col-new" };
  return { root, identity, directory, recipe, master, maintenance, baseline, catalogPath, input, usage,
    read: () => readRestartInputs({ taxonomyRoot: root, identity, master, maintenance, baseline }) };
}

test("restart binds local metadata without reading large source databases, and ignores unrelated search timestamps", async (t) => {
  const f = await fixture(t);
  const database = path.join(f.root, "releases", "col-new", "taxonomy.sqlite");
  const file = await fs.open(database, "w"); await file.truncate(16 * 1024 * 1024); await file.close();
  const supplements = path.join(f.root, "supplements.json");
  await fs.writeFile(supplements, JSON.stringify({ searchedAt: "old", researchedTaxa: [{ scientificName: "Fratercula arctica" }] }));
  const before = await f.read();
  assert.equal(before.buildJobRevision, f.recipe.revision);
  await fs.writeFile(supplements, JSON.stringify({ searchedAt: "new", researchedTaxa: [{ scientificName: "Fratercula arctica" }] }));
  assert.deepEqual((await f.read()).binding, before.binding);
  await fs.appendFile(database, "changed-source");
  assert.notEqual((await f.read()).binding.sourceStampsRevision, before.binding.sourceStampsRevision);
  await fs.writeFile(supplements, JSON.stringify({ researchedTaxa: [{ scientificName: "Jynx torquilla" }] }));
  assert.notEqual((await f.read()).binding.retainedRevision, before.binding.retainedRevision);
});

test("fresh receipts may change registry revision while the confirmed catalog set and source binding remain stable", async (t) => {
  const f = await fixture(t), before = await f.read();
  await captureCatalogUsage(f.root, f.input);
  await f.usage.catalogUsageSave({ token: (await f.usage.catalogUsagePreview()).token, confirmed: true,
    allCatalogsConfirmed: true, unchangedSinceCapture: true });
  const after = await f.read();
  assert.notEqual(after.registryRevision, before.registryRevision);
  assert.deepEqual(after.binding, before.binding);
  const pointer = taxonomyPublicationPath(f.root); await fs.mkdir(path.dirname(pointer), { recursive: true });
  await fs.writeFile(pointer, '{"active":{"masterVersion":"master-old","packageVersion":"other-package"}}');
  assert.notEqual((await f.read()).binding.sourceStampsRevision, before.binding.sourceStampsRevision);
});

test("wrong state ownership, altered recipe, source recovery and oversized project metadata block the preview", async (t) => {
  for (const scenario of ["state-owner", "recipe-changed", "recovery", "project-size"]) {
    await t.test(scenario, async (st) => {
      const f = await fixture(st);
      if (scenario === "state-owner") await fs.writeFile(path.join(f.directory, "state.json"), '{"id":"other-job","status":"failed"}');
      if (scenario === "recipe-changed") await fs.writeFile(path.join(f.directory, "recipe.json"), JSON.stringify({ ...f.recipe, options: { changed: true } }));
      if (scenario === "recovery") {
        const recipe = { ...f.recipe, options: { sourceRecoveryScope: "x" }, revision: undefined };
        recipe.revision = restartDigest(recipe); await fs.writeFile(path.join(f.directory, "recipe.json"), JSON.stringify(recipe));
      }
      if (scenario === "project-size") await fs.writeFile(f.recipe.selection.speciesListPath, " ".repeat(512 * 1024 + 1));
      await assert.rejects(f.read(), { code: "UPDATE_RESTART_BLOCKED" });
    });
  }
});

test("restart scope requires own stopped build and complete source phase with unchanged active master", async () => {
  const job = { status: "failed", phase: "build", buildStarted: true, sourceCompleted: true,
    updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", baseline: { masterVersion: "old" } };
  const master = { lifecycle: { active: { candidateId: "old" } }, buildJob: { available: true, status: "failed", updateRunId: job.updateRunId } };
  assert.doesNotThrow(() => assertRestartScope(job, master, { status: "completed" }));
  for (const patch of [{ status: "paused" }, { phase: "sources" }, { sourceCompleted: false }, { boundCandidate: {} }]) {
    assert.throws(() => assertRestartScope({ ...job, ...patch }, master, { status: "completed" }), { code: "UPDATE_RESTART_BLOCKED" });
  }
});

test("waiting resume replacement admits only the verified retained candidate of the same update", () => {
  const job = { status: "waiting-usage", phase: "resume-build", buildStarted: true, sourceCompleted: true,
    updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", baseline: { masterVersion: "old" } };
  const candidate = { candidateId: "retained-owned", buildJobRevision: "a".repeat(64) };
  const master = { lifecycle: { active: { candidateId: "old" }, candidate },
    buildJob: { available: true, status: "failed", updateRunId: job.updateRunId } };
  const owner = { ...candidate, updateRunId: job.updateRunId };
  assert.doesNotThrow(() => assertRestartScope(job, master, { status: "completed" }, owner));
  assert.throws(() => assertRestartScope(job, master, { status: "completed" }), { code: "UPDATE_RESTART_BLOCKED" });
  for (const changed of [{ ...owner, candidateId: "foreign" }, { ...owner, updateRunId: "other-update" },
    { ...owner, buildJobRevision: "b".repeat(64) }]) {
    assert.throws(() => assertRestartScope(job, master, { status: "completed" }, changed), { code: "UPDATE_RESTART_BLOCKED" });
  }
  for (const patch of [{ status: "waiting-lightroom" }, { phase: "candidate" }, { buildStarted: false }]) {
    assert.throws(() => assertRestartScope({ ...job, ...patch }, master, { status: "completed" }, owner), { code: "UPDATE_RESTART_BLOCKED" });
  }
});

import {createHash} from "node:crypto";
const rawSha=bytes=>createHash("sha256").update(bytes).digest("hex");


// Retained manifests may contain growing diff lists; ordinary preview metadata remains small.
async function retainedManifestFixture(t) {
 const f=await fixture(t),id="job-cccccccc-cccc-cccc-cccc-cccccccccccc",candidateId="master-retained-own";
 const directory=path.join(f.root,"master","build-jobs",id);await fs.mkdir(directory,{recursive:true});
 const {revision,...body}=f.recipe,recipe={...body,id};recipe.revision=restartDigest(recipe);
 await fs.writeFile(path.join(directory,"recipe.json"),JSON.stringify(recipe));
 await fs.writeFile(path.join(directory,"state.json"),JSON.stringify({schemaVersion:1,id,status:"ready",candidateId}));
 const manifest={schemaVersion:4,candidateId,sourceMasterVersion:"master-old",summary:{taxa:40000},diff:{newTaxa:Array.from({length:40000},(_,i)=>"Syntheticus retainedtaxon"+i),closedReferenceGaps:[],changedScientificNames:[],changedNames:[],newSynonyms:[],staleTaxa:[],removedTaxa:[]},buildJobRevision:recipe.revision};
 const manifestPath=path.join(f.root,"master","staging","manifest.json");await fs.mkdir(path.dirname(manifestPath),{recursive:true});await fs.writeFile(manifestPath,JSON.stringify(manifest));
 f.master.lifecycle.candidate={candidateId,buildJobRevision:recipe.revision};
 return{...f,manifest,manifestPath,historicalDirectory:directory,historicalRecipe:recipe};
}

test("large retained manifest preserves exact own candidate recipe and full byte digest",async t=>{
 const f=await retainedManifestFixture(t),bytes=await fs.readFile(f.manifestPath);assert(bytes.length>512*1024);assert(bytes.length<12*1024*1024);
 const actual=await f.read();assert.equal(actual.binding.retainedCandidate.manifestSha256,rawSha(bytes));assert.equal(actual.binding.retainedCandidate.buildJobId,path.basename(f.historicalDirectory));assert.equal(actual.binding.retainedCandidate.updateRunId,f.identity.updateRunId);
});

test("difference-list mutation changes retained-manifest binding even with same IDs and revision",async t=>{
 const f=await retainedManifestFixture(t),before=await f.read();f.manifest.diff.newTaxa[0]="Syntheticus changedtaxon0";await fs.writeFile(f.manifestPath,JSON.stringify(f.manifest));const after=await f.read();assert.notEqual(after.binding.retainedCandidate.manifestSha256,before.binding.retainedCandidate.manifestSha256);assert.notDeepEqual(after.binding,before.binding);
});

for(const scenario of ["candidate-id","job-revision","foreign-recipe-owner","malformed-json","not-a-file"])test("large retained manifest still rejects "+scenario,async t=>{
 const f=await retainedManifestFixture(t);
 if(scenario==="candidate-id"){f.manifest.candidateId="master-foreign";await fs.writeFile(f.manifestPath,JSON.stringify(f.manifest));}
 if(scenario==="job-revision"){f.manifest.buildJobRevision="f".repeat(64);await fs.writeFile(f.manifestPath,JSON.stringify(f.manifest));}
 if(scenario==="foreign-recipe-owner"){const{revision,...body}=f.historicalRecipe,recipe={...body,updateRunId:"update-dddddddd-dddd-dddd-dddd-dddddddddddd"};recipe.revision=restartDigest(recipe);await fs.writeFile(path.join(f.historicalDirectory,"recipe.json"),JSON.stringify(recipe));}
 if(scenario==="malformed-json")await fs.writeFile(f.manifestPath,"{"+" ".repeat(600000));
 if(scenario==="not-a-file"){await fs.unlink(f.manifestPath);await fs.mkdir(f.manifestPath);}
 await assert.rejects(f.read(),scenario==="malformed-json"?SyntaxError:{code:"UPDATE_RESTART_BLOCKED"});
});

test("manifest-specific12MiB ceiling and ordinary512KiB project ceiling both remain enforced",async t=>{
 const f=await retainedManifestFixture(t);await fs.writeFile(f.manifestPath," ".repeat(12*1024*1024+1));await assert.rejects(f.read(),{code:"UPDATE_RESTART_BLOCKED"});
 await fs.writeFile(f.manifestPath,JSON.stringify(f.manifest));await fs.writeFile(f.recipe.selection.speciesListPath," ".repeat(512*1024+1));await assert.rejects(f.read(),{code:"UPDATE_RESTART_BLOCKED"});
});

test("large identity-review remains stamp-only in restart inputs and does not need a broader JSON limit",async t=>{
 const f=await retainedManifestFixture(t),review=path.join(f.root,"master","identity-review.json");await fs.writeFile(review,"not-json"+" ".repeat(8*1024*1024));const first=await f.read();await fs.appendFile(review,"changed");const second=await f.read();assert.notEqual(first.binding.sourceStampsRevision,second.binding.sourceStampsRevision);
});
