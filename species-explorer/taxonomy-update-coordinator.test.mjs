import { tmpdir } from "../scripts/test-temp.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createTaxonomyUpdateCoordinator } from "./taxonomy-update-coordinator.mjs";
import { captureCatalogUsage, createCatalogUsageService } from "./lightroom-catalog-usage.mjs";
import { createLightroomUsageRequestService, catalogUsageRequest } from "./lightroom-usage-request.mjs";
import { createLightroomCloseGate } from "./lightroom-close-gate.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value));

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "fn-update-coordinator-"));
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  let proof = { ready: true, usageRevision: "usage-1" };
  let source = { status: "completed", active: false, activeRelease: "col-old", error: "" };
  let master = { status: "completed", active: false, error: "", buildJob: { available: false },
    lifecycle: { active: { candidateId: "master-old" }, candidate: null, canActivate: false, blockingConflictCount: 0 },
    reference: { activeRelease: "col-old", needsMasterRebuild: false },
    corrections: { pending: false, currentRevision: "corrections-1" },
    identities: { pending: false, revision: "identities-1" },
    lightroomPackage: { status: "current", needsRebuild: false } };
  const maintenanceService = {
    async status() { calls.push(["source-status"]); return copy(source); },
    async bindUpdatePlan({ token }) {
      calls.push(["bind", token]);
      if (token !== "fresh-token") throw new Error("expired-preview");
      return { releaseId: "col-new", release: { releaseId: "col-new" }, activeRelease: "col-old", revision: "bound-plan", updateCatalogue: true, updateSupplements: true };
    },
    async startUpdate(payload) {
      calls.push(["source-start", copy(payload)]);
      assert.equal(sequence.status().phase, "sources", "intent is durable before starting sources");
      source = { ...source, status: "downloading", active: true, releaseId: payload.updatePlan.releaseId };
      return copy(source);
    },
  };
  const masterService = {
    async status() { calls.push(["master-status"]); return copy(master); },
    async startBuild(payload) {
      calls.push(["build", copy(payload)]);
      assert.equal(sequence.status().phase, "build");
      master = { ...master, active: true, status: "building", buildJob: { available: true,
        id: `job-${String(calls.filter(([name]) => name === "build").length).padStart(8, "0")}-0000-0000-0000-000000000000`,
        updateRunId: payload.updateRunId, status: "building", canResume: false },
        lifecycle: { ...master.lifecycle, candidate: null, canActivate: false } };
      return copy(master);
    },
    async resumeBuild(payload) {
      calls.push(["resume", copy(payload)]);
      master = { ...master, active: true, status: "building", buildJob: { ...master.buildJob, status: "building", canResume: false } };
      return copy(master);
    },
    async pauseBuild() {
      calls.push(["pause"]);
      master = { ...master, active: false, status: "paused", buildJob: { ...master.buildJob, status: "paused", canResume: true } };
      return copy(master);
    },
    async activate(payload) {
      calls.push(["activate", copy(payload)]);
      assert.equal(sequence.status().phase, "activation");
      const version = master.lifecycle.candidate.candidateId;
      master = { ...master, active: false, status: "completed", lifecycle: { ...master.lifecycle, active: { candidateId: version }, candidate: null },
        reference: { ...master.reference, needsMasterRebuild: false }, corrections: { ...master.corrections, pending: false },
        identities: { ...master.identities, pending: false }, lightroomPackage: { status: "current", needsRebuild: false } };
      return copy(master);
    },
    async applyCorrections(payload) {
      calls.push(["corrections", copy(payload)]);
      master = { ...master, status: "completed", corrections: { ...master.corrections, pending: false } };
      return copy(master);
    },
    async syncLightroomPackage() {
      calls.push(["package"]);
      master = { ...master, status: "completed", lightroomPackage: { status: "current", needsRebuild: false } };
      return copy(master);
    },
    async reviewIdentity(action, payload) {
      calls.push([action, copy(payload)]);
      if (action === "classificationAutomaticPreview") return { available: true, candidateId: master.lifecycle.candidate.candidateId,
        token: "preview-1", usageRevision: "usage-1", matching: 10, deferred: 2, protected: 0 };
      master.identities = { pending: true, revision: "events-2", candidateIncludesCurrent: false };
      return { saved: true, revision: "events-2", protected: 0 };
    },
  };
  const deps = { taxonomyRoot: root, maintenanceService, masterService,
    checkStartReady: async () => { calls.push(["proof"]); return copy(proof); },
    setTimer: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimer: (id) => timers.delete(id),
    now: () => new Date("2026-10-03T10:00:00.000Z"), ...options };
  let sequence = createTaxonomyUpdateCoordinator(deps);
  t.after(async () => { await sequence.close(); await fs.rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }); });
  return {
    calls, timers, root, deps,
    get sequence() { return sequence; },
    set sequence(value) { sequence = value; },
    get master() { return master; }, set master(value) { master = value; },
    get source() { return source; }, set source(value) { source = value; },
    set proof(value) { proof = value; },
    async tick() {
      const entry = timers.entries().next().value;
      assert.ok(entry, "background poll was scheduled");
      timers.delete(entry[0]);
      entry[1]();
      await sequence.serial;
    },
    async ready({ blocking = 0, classification = 0, id = "candidate-1" } = {}) {
      master = { ...master, active: false, status: "ready", buildJob: { ...master.buildJob, status: "ready" },
        lifecycle: { ...master.lifecycle, candidate: { candidateId: id, buildJobRevision: "recipe-1", classificationReview: { total: classification } },
          blockingConflictCount: blocking, canActivate: blocking === 0 },
        identities: { ...master.identities, candidateIncludesCurrent: true } };
      if (/^job-[a-f0-9-]{36}$/.test(master.buildJob.id)) {
        const directory = path.join(root, "master", "build-jobs", master.buildJob.id);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, "state.json"), JSON.stringify({ schemaVersion: 1,
          id: master.buildJob.id, status: "ready", candidateId: id }));
        await fs.writeFile(path.join(directory, "recipe.json"), JSON.stringify({ schemaVersion: 1,
          id: master.buildJob.id, updateRunId: master.buildJob.updateRunId, revision: "recipe-1" }));
      }
    },
  };
}

test("accepted own checkpoint retry clears the preceding failure completion and stamps a later new failure", async (t) => {
  let time = "2026-10-03T10:00:00.000Z";
  const f = await fixture(t, { now: () => new Date(time) });
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  const updateRunId = f.sequence.status().updateRunId, jobId = f.master.buildJob.id;
  f.master = { ...f.master, active: false, status: "failed", error: "old-fixture-failure",
    buildJob: { ...f.master.buildJob, status: "failed", canResume: true } };
  await f.sequence.stop("failed", "Old fixture failure", "old-fixture-failure");
  assert.equal(f.sequence.status().completedAt, time);
  time = "2026-10-03T10:01:00.000Z";
  await f.sequence.resume({ confirmed: true });
  assert.equal(f.sequence.status().status, "building");
  assert.equal(f.sequence.status().updateRunId, updateRunId);
  assert.equal(f.master.buildJob.id, jobId);
  assert.equal(f.calls.filter(([name]) => name === "resume").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  assert.equal(f.sequence.status().error, "");
  assert.equal(f.sequence.status().completedAt, null);
  const resumed = JSON.parse(await fs.readFile(f.sequence.file, "utf8"));
  assert.equal(resumed.completedAt, null);
  assert.equal(resumed.status, "building");
  time = "2026-10-03T10:02:00.000Z";
  f.master = { ...f.master, active: false, status: "failed", error: "new-worker-failure",
    buildJob: { ...f.master.buildJob, status: "failed", error: "new-worker-failure", canResume: true } };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /new-worker-failure/);
  assert.equal(f.sequence.status().completedAt, time);
  assert.equal(JSON.parse(await fs.readFile(f.sequence.file, "utf8")).completedAt, time);
});

test("accepted start retry waiting for fresh FN proof has no preceding failure completion", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.sequence.stop("failed", "Old start fixture failure", "old-start-failure");
  assert.equal(typeof f.sequence.status().completedAt, "string");
  await f.sequence.resume({ confirmed: true });
  assert.equal(f.sequence.status().status, "waiting-usage");
  assert.equal(f.calls.filter(([name]) => name === "build" || name === "resume" || name === "activate").length, 0);
  assert.equal(f.sequence.status().error, "");
  assert.equal(f.sequence.status().completedAt, null);
  assert.equal(JSON.parse(await fs.readFile(f.sequence.file, "utf8")).completedAt, null);
});

test("rejected foreign checkpoint retry retains its original failure completion and durable bytes", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  f.master = { ...f.master, active: false, status: "failed", error: "foreign-fixture-failure",
    buildJob: { ...f.master.buildJob, updateRunId: "update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", status: "failed", canResume: true } };
  await f.sequence.stop("failed", "Original failure retained", "original-failure");
  const original = await fs.readFile(f.sequence.file), completedAt = f.sequence.status().completedAt;
  await assert.rejects(f.sequence.resume({ confirmed: true }), /gehört nicht/);
  assert.equal(f.sequence.status().status, "failed");
  assert.equal(f.sequence.status().completedAt, completedAt);
  assert.deepEqual(await fs.readFile(f.sequence.file), original);
  assert.equal(f.calls.filter(([name]) => name === "resume" || name === "activate").length, 0);
});

async function failedRestartFixture(t, options = {}) {
  const f = await fixture(t, options);
  await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  f.source = { status: "completed", active: false, activeRelease: "col-new", error: "" };
  f.master.reference.activeRelease = "col-new";
  await f.sequence.advance();
  const buildJobId = "job-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  f.master = { ...f.master, active: false, status: "failed", error: "fixture-classification-failure",
    buildJob: { ...f.master.buildJob, id: buildJobId, status: "failed", canResume: true } };
  await f.sequence.stop("failed", "Fixture failed", "fixture-classification-failure");
  const jobDirectory = path.join(f.root, "master", "build-jobs", buildJobId);
  await fs.mkdir(jobDirectory, { recursive: true });
  const speciesListPath = path.join(f.root, "species.json"), correctionsPath = path.join(f.root, "corrections.json");
  await fs.writeFile(speciesListPath, "[]"); await fs.writeFile(correctionsPath, '{"entries":[]}');
  const recipe = { schemaVersion: 1, id: buildJobId, taxonomyRoot: f.root, updateRunId: f.sequence.status().updateRunId,
    selection: { speciesListPath, correctionsPath }, options: {}, binding: { rules: "original-rules" } };
  recipe.revision = createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
  const recipeFile = path.join(jobDirectory, "recipe.json");
  await fs.writeFile(recipeFile, JSON.stringify(recipe));
  await fs.writeFile(path.join(jobDirectory, "state.json"), JSON.stringify({ id: buildJobId, status: "failed" }));
  await fs.writeFile(path.join(f.root, "master", "build-jobs", "current.json"), JSON.stringify({ id: buildJobId, updateRunId: recipe.updateRunId }));
  await fs.writeFile(path.join(f.root, "active.json"), JSON.stringify({ activeRelease: "col-new" }));
  await fs.mkdir(path.join(f.root, "releases", "col-new"), { recursive: true });
  await fs.writeFile(path.join(f.root, "releases", "col-new", "manifest.json"), '{"releaseId":"col-new"}');
  const catalogPath = path.join(f.root, "fixture.lrcat");
  await fs.writeFile(catalogPath, "synthetic catalog");
  await captureCatalogUsage(f.root, { catalogPath, complete: true, passes: 2, totalPhotos: 0, usedTaxa: [] });
  const usage = createCatalogUsageService({ taxonomyRoot: f.root });
  const usagePreview = await usage.catalogUsagePreview();
  await usage.catalogUsageSave({ token: usagePreview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  return { ...f, get sequence() { return f.sequence; }, get master() { return f.master; }, set master(value) { f.master = value; },
    get source() { return f.source; }, set source(value) { f.source = value; },
    set proof(value) { f.proof = value; }, buildJobId, recipe, recipeFile, catalogPath, speciesListPath, correctionsPath };
}

async function retainedCandidateRestartFixture(t, options = {}) {
  const reviewRevision = "a".repeat(64);
  const target = { identityReviewRevision: reviewRevision, eventIds: ["b".repeat(64)], usageRevisions: ["c".repeat(64)],
    eventRevision: "d".repeat(64), activeMasterId: "master-old", candidateId: "first-owned-candidate",
    identitySources: "e".repeat(64), identityInputs: "f".repeat(64) };
  const f = await failedRestartFixture(t, { readProtectedUsageRenewalTarget: async () => copy(target), ...options });
  await f.sequence.save({ status: "waiting-usage", phase: "resume-build", automaticFollowupRevision: reviewRevision,
    automaticAttemptedCandidates: [target.candidateId], error: "" });
  f.master.identities = { pending: true, revision: reviewRevision, candidateIncludesCurrent: false };
  const historicalId = "job-cccccccc-cccc-cccc-cccc-cccccccccccc";
  const historicalDirectory = path.join(f.root, "master", "build-jobs", historicalId);
  await fs.mkdir(historicalDirectory, { recursive: true });
  const historicalRecipe = { ...f.recipe, id: historicalId, timestamp: "2026-10-02T09:00:00.000Z", revision: undefined };
  historicalRecipe.revision = restartDigestForTest(historicalRecipe);
  await fs.writeFile(path.join(historicalDirectory, "recipe.json"), JSON.stringify(historicalRecipe));
  await fs.writeFile(path.join(historicalDirectory, "state.json"), JSON.stringify({ schemaVersion: 1,
    id: historicalId, status: "ready", candidateId: target.candidateId }));
  const manifest = { candidateId: target.candidateId, buildJobRevision: historicalRecipe.revision };
  await fs.mkdir(path.join(f.root, "master", "staging"), { recursive: true });
  await fs.writeFile(path.join(f.root, "master", "staging", "manifest.json"), JSON.stringify(manifest));
  await fs.writeFile(path.join(f.root, "master", "identity-review.json"), JSON.stringify({ revision: reviewRevision, registry: { events: [] } }));
  f.master.lifecycle.candidate = manifest;
  const privateDirectory = path.join(path.dirname(f.recipeFile), "candidate");
  await fs.mkdir(privateDirectory, { recursive: true });
  await fs.writeFile(path.join(privateDirectory, "manifest.json"), '{"candidateId":"private-followup"}');
  const ancestorHistory = path.join(f.root, "master", "update-workflow-history", "update-dddddddd-dddd-dddd-dddd-dddddddddddd.json");
  await fs.mkdir(path.dirname(ancestorHistory), { recursive: true });
  await fs.writeFile(ancestorHistory, '{"originalHistoricalProof":"unchanged"}');
  const protectedFiles = [f.recipeFile, path.join(path.dirname(f.recipeFile), "state.json"),
    path.join(privateDirectory, "manifest.json"), path.join(historicalDirectory, "recipe.json"),
    path.join(historicalDirectory, "state.json"), path.join(f.root, "master", "staging", "manifest.json"), ancestorHistory];
  const protectedBytes = await Promise.all(protectedFiles.map((file) => fs.readFile(file)));
  return { ...f, get sequence() { return f.sequence; }, get master() { return f.master; }, set master(value) { f.master = value; },
    set proof(value) { f.proof = value; }, target, historicalId, historicalDirectory, historicalRecipe, protectedFiles,
    assertProtected: async () => assert.deepEqual(await Promise.all(protectedFiles.map((file) => fs.readFile(file))), protectedBytes) };
}

const restartDigestForTest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("own failed followup waiting for fresh FN usage can be replaced while its exact historical candidate and private checkpoint survive", async (t) => {
  let prepared = null;
  const f = await retainedCandidateRestartFixture(t, { prepareStart: async (job) => { prepared = copy(job); } });
  f.proof = { ready: false, reason: "catalog-usage" };
  const old = f.sequence.status(), originalWorkflow = await fs.readFile(f.sequence.file);
  const preview = await f.sequence.restartBuildPreview();
  const value = await f.sequence.restartBuild({ ...preview, confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  assert.notEqual(value.updateRunId, old.updateRunId);
  assert.equal(value.phase, "start");
  assert.equal(value.freshUsageCapture, true);
  assert.deepEqual(value.protectedUsageRenewalTarget, f.target);
  assert.deepEqual(prepared.protectedUsageRenewalTarget, f.target);
  assert.equal(value.restartGuard.binding.retainedCandidate.buildJobId, f.historicalId);
  assert.equal(value.restartGuard.binding.retainedCandidate.buildJobRevision, f.historicalRecipe.revision);
  assert.deepEqual(await fs.readFile(path.join(f.root, "master", "update-workflow-history", `${old.updateRunId}.json`)), originalWorkflow);
  await f.assertProtected();
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1);
});

test("protected replacement renews exact automatic events only after fresh FN proof and before a new owned local job", async (t) => {
  const order = [];
  const f = await retainedCandidateRestartFixture(t, { prepareProtectedUsageRenewal: async ({ job, usageRevision }) => {
    order.push("renew"); assert.deepEqual(job.protectedUsageRenewalTarget, f.target);
    assert.equal(usageRevision, "fresh-closed-fn");
    assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
    return { receiptRevision: "1".repeat(64) };
  } });
  f.proof = { ready: false, reason: "catalog-usage" };
  const preview = await f.sequence.restartBuildPreview();
  await f.sequence.restartBuild({ ...preview, confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  assert.deepEqual(order, []);
  f.proof = { ready: true, usageRevision: "fresh-closed-fn" };
  await f.sequence.advance();
  assert.deepEqual(order, ["renew"]);
  assert.equal(f.sequence.status().status, "building");
  assert.equal(f.sequence.status().protectedUsageRenewalRevision, "1".repeat(64));
  assert.equal(f.master.buildJob.updateRunId, f.sequence.status().updateRunId);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1);
  await f.assertProtected();
});

test("protected renewal reports registered FN proof during slow recheck without claiming Lightroom is open", async (t) => {
  let releaseRenewal, enteredRenewal, capturedJob;
  const pendingRenewal = new Promise((resolve) => { releaseRenewal = resolve; });
  const entered = new Promise((resolve) => { enteredRenewal = resolve; });
  const receiptRevision = "7".repeat(64);
  const f = await retainedCandidateRestartFixture(t, { prepareProtectedUsageRenewal: async ({ job, usageRevision }) => {
    capturedJob = job;
    assert.equal(usageRevision, "fresh-closed-fn");
    enteredRenewal();
    await pendingRenewal;
    return { receiptRevision };
  } });
  f.proof = { ready: false, reason: "lightroom-open", message: "Warte auf geschlossenes Lightroom." };
  await f.sequence.restartBuild({ ...await f.sequence.restartBuildPreview(), confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  assert.equal(f.sequence.status().status, "waiting-lightroom");
  assert.equal(f.sequence.status().phase, "start");
  assert.equal(capturedJob, undefined);
  const originalGuard = copy(f.sequence.status().restartGuard);
  f.proof = { ready: true, usageRevision: "fresh-closed-fn" };
  const advancing = f.sequence.advance();
  await entered;
  try {
    const pending = JSON.parse(await fs.readFile(f.sequence.file, "utf8"));
    assert.equal(pending.status, "waiting-usage");
    assert.equal(pending.phase, "start");
    assert.equal(pending.message, "FN-Nachweis registriert. Gespeicherte Entscheidungen werden erneut geprüft.");
    assert.equal(capturedJob.status, pending.status);
    assert.equal(capturedJob.message, pending.message);
    assert.equal(pending.usageRevision, "fresh-closed-fn");
    assert.equal(pending.buildStarted, false);
    assert.equal(pending.protectedUsageRenewalRevision, undefined);
    assert.deepEqual(pending.restartGuard, originalGuard);
    assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
    await f.assertProtected();
  } finally { releaseRenewal(); await advancing; }
  assert.equal(f.sequence.status().status, "building");
  assert.equal(f.sequence.status().protectedUsageRenewalRevision, receiptRevision);
  assert.deepEqual(f.sequence.status().restartGuard, originalGuard);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  await f.assertProtected();
});

test("closing while the registered FN renewal hint is saved preserves the existing stop boundary", async (t) => {
  let renewals = 0;
  const f = await retainedCandidateRestartFixture(t, { prepareProtectedUsageRenewal: async () => {
    renewals++; return { receiptRevision: "8".repeat(64) };
  } });
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.restartBuild({ ...await f.sequence.restartBuildPreview(), confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  f.sequence.onStateChange = async (job) => {
    if (job.message === "FN-Nachweis registriert. Gespeicherte Entscheidungen werden erneut geprüft.") f.sequence.closed = true;
  };
  f.proof = { ready: true, usageRevision: "fresh-closed-fn" };
  await f.sequence.advance();
  assert.equal(renewals, 0);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  assert.equal(f.sequence.status().buildStarted, false);
  await f.assertProtected();
});

test("foreign or changed retained candidate recipes and automatic-review races never authorize replacement", async (t) => {
  for (const scenario of ["foreign-recipe-owner", "different-manifest", "changed-recipe", "different-state", "review-target", "candidate-race"]) await t.test(scenario, async (st) => {
    const f = await retainedCandidateRestartFixture(st);
    const old = f.sequence.status();
    const preview = await f.sequence.restartBuildPreview();
    if (scenario === "foreign-recipe-owner") {
      const changed = { ...f.historicalRecipe, updateRunId: "update-dddddddd-dddd-dddd-dddd-dddddddddddd", revision: undefined };
      changed.revision = restartDigestForTest(changed);
      await fs.writeFile(path.join(f.historicalDirectory, "recipe.json"), JSON.stringify(changed));
      f.master.lifecycle.candidate.buildJobRevision = changed.revision;
      await fs.writeFile(path.join(f.root, "master", "staging", "manifest.json"), JSON.stringify(f.master.lifecycle.candidate));
    }
    if (scenario === "different-manifest") await fs.writeFile(path.join(f.root, "master", "staging", "manifest.json"), '{"candidateId":"foreign","buildJobRevision":"other"}');
    if (scenario === "changed-recipe") await fs.writeFile(path.join(f.historicalDirectory, "recipe.json"), JSON.stringify({ ...f.historicalRecipe, changed: true }));
    if (scenario === "different-state") await fs.writeFile(path.join(f.historicalDirectory, "state.json"), JSON.stringify({ schemaVersion: 1, id: "other-job", status: "ready", candidateId: f.target.candidateId }));
    if (scenario === "review-target") f.target.identityReviewRevision = "2".repeat(64);
    if (scenario === "candidate-race") await fs.appendFile(path.join(f.root, "master", "staging", "manifest.json"), " ");
    await assert.rejects(f.sequence.restartBuild({ ...preview, confirmed: true,
      usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } }), /Kandidat|Aufbau|[Vv]orschau|Vormerkung|Review/);
    assert.equal(f.sequence.status().updateRunId, old.updateRunId);
    assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  });
});

test("failed automatic usage renewal keeps replacement stopped and preserves the old candidate and recipe", async (t) => {
  const f = await retainedCandidateRestartFixture(t, { prepareProtectedUsageRenewal: async () => { throw new Error("Renewal case is now protected"); } });
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.restartBuild({ ...await f.sequence.restartBuildPreview(), confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  f.proof = { ready: true, usageRevision: "fresh-closed-fn" };
  await f.sequence.advance();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /Renewal case is now protected/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  await f.assertProtected();
});

test("protected replacement creates a distinct real capture request and binds its fresh closed receipt before renewal", async (t) => {
  let renewedUsage = "";
  const f = await retainedCandidateRestartFixture(t, { prepareProtectedUsageRenewal: async ({ usageRevision }) => {
    renewedUsage = usageRevision; return { receiptRevision: "3".repeat(64) };
  } });
  const requests = createLightroomUsageRequestService({ taxonomyRoot: f.root });
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: requests, processes: async () => [] });
  f.sequence.prepareStart = (job) => requests.prepare(job);
  f.sequence.checkStartReady = (options) => gate.ready(options);
  const oldRun = f.sequence.status().updateRunId;
  await requests.prepare({ ...f.sequence.status(), usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true },
    freshUsageCapture: true, confirmedCatalogs: [f.catalogPath] });
  const oldRequest = (await requests.status(oldRun)).request;
  const preview = await f.sequence.restartBuildPreview();
  const replacement = await f.sequence.restartBuild({ ...preview, confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  const request = (await requests.status(replacement.updateRunId)).request;
  assert.notEqual(request.requestId, oldRequest.requestId);
  assert.equal(request.updateRunId, replacement.updateRunId);
  assert.equal(renewedUsage, "");
  await captureCatalogUsage(f.root, { catalogPath: f.catalogPath, complete: true, passes: 2, totalPhotos: 12, usedTaxa: [],
    captureRequestId: request.requestId, requestRevision: request.captureRevision });
  await f.sequence.advance();
  const completed = await requests.status(replacement.updateRunId);
  assert.equal(completed.request.status, "completed");
  assert.equal(completed.alreadyRegistered, true);
  assert.equal(renewedUsage, completed.request.registeredUsageRevision);
  assert.equal(f.sequence.status().status, "building");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "resume").length, 0);
  await f.assertProtected();
});

test("protected replacement cannot start without its explicit renewal callback and bound completion receipt", async (t) => {
  for (const scenario of ["missing-hook", "missing-receipt", "target-race"]) await t.test(scenario, async (st) => {
    const options = scenario === "missing-hook" ? {} : { prepareProtectedUsageRenewal: async () => {
      if (scenario === "target-race") f.target.eventIds = ["4".repeat(64)];
      return scenario === "missing-receipt" ? {} : { receiptRevision: "5".repeat(64) };
    } };
    const f = await retainedCandidateRestartFixture(st, options);
    f.proof = { ready: false, reason: "catalog-usage" };
    await f.sequence.restartBuild({ ...await f.sequence.restartBuildPreview(), confirmed: true,
      usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
    f.proof = { ready: true, usageRevision: "fresh-closed-fn" };
    await f.sequence.advance();
    assert.equal(f.sequence.status().status, "failed");
    assert.match(f.sequence.status().error, /FN|Nachweis|Eingang/);
    assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
    assert.equal(f.calls.filter(([name]) => name === "resume" || name === "activate").length, 0);
    await f.assertProtected();
  });
});

test("closing during the protected replacement final FN proof prevents renewal and a new build", async (t) => {
  let renewals = 0;
  const f = await retainedCandidateRestartFixture(t, { prepareProtectedUsageRenewal: async () => {
    renewals++; return { receiptRevision: "6".repeat(64) };
  } });
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.restartBuild({ ...await f.sequence.restartBuildPreview(), confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  f.sequence.checkStartReady = async () => { f.sequence.closed = true; return { ready: true, usageRevision: "fresh-closed-fn" }; };
  await f.sequence.advance();
  assert.equal(renewals, 0);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  await f.assertProtected();
});

test("own failed build restart requires exact new confirmation, preserves old history/recipe and waits for a fresh FN request before local build", async (t) => {
  let prepared = null;
  const f = await failedRestartFixture(t, { prepareStart: async (job) => { if (job.freshUsageCapture) prepared = copy(job); } });
  const old = f.sequence.status(), original = await fs.readFile(f.recipeFile);
  const oldWorkflowBytes = await fs.readFile(f.sequence.file);
  f.proof = { ready: false, reason: "catalog-usage" };
  const preview = await f.sequence.restartBuildPreview();
  assert.equal(preview.updateRunId, old.updateRunId);
  assert.equal(preview.buildJobRevision, f.recipe.revision);
  assert.equal(preview.catalogCount, 1);
  await assert.rejects(f.sequence.restartBuild({ ...preview }), /bestätigt/);
  const consent = { allCatalogsConfirmed: true, noChangesUntilClose: true };
  const restarted = await f.sequence.restartBuild({ ...preview, confirmed: true, usageConsent: consent });
  assert.notEqual(restarted.updateRunId, old.updateRunId);
  assert.equal(restarted.decision, "rebuild-master");
  assert.equal(restarted.sourceCompleted, true);
  assert.equal(restarted.freshUsageCapture, true);
  assert.deepEqual(prepared.confirmedCatalogs, [f.catalogPath]);
  assert.equal(restarted.usageRevision, undefined);
  assert.equal(restarted.boundCandidate, null);
  assert.deepEqual(await fs.readFile(f.recipeFile), original);
  assert.deepEqual(await fs.readFile(path.join(f.root, "master", "update-workflow-history", `${old.updateRunId}.json`)), oldWorkflowBytes);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1, "No second build before new capture");
  f.proof = { ready: true, usageRevision: "new-request-receipt" };
  await f.sequence.advance();
  const builds = f.calls.filter(([name]) => name === "build");
  assert.equal(builds.length, 2);
  assert.deepEqual(builds[1][1], { refreshProviders: false, updateRunId: restarted.updateRunId });
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1, "No second provider download");
  assert.deepEqual(await fs.readFile(f.recipeFile), original);
});

test("restart blocks foreign/active/ready jobs, incomplete sources and changed preview identities without replacing old intent", async (t) => {
  for (const scenario of ["foreign", "active", "ready", "source-incomplete", "candidate", "new-baseline", "wrong-recipe", "wrong-update", "no-consent", "input-race", "catalog-race"]) {
    await t.test(scenario, async (subtest) => {
      const f = await failedRestartFixture(subtest), old = f.sequence.status(), original = await fs.readFile(f.recipeFile);
      const preview = await f.sequence.restartBuildPreview();
      const body = { ...preview, confirmed: true, usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } };
      if (scenario === "foreign") f.master.buildJob.updateRunId = "update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      if (scenario === "active") f.master.active = true;
      if (scenario === "ready") f.master.buildJob.status = "ready";
      if (scenario === "source-incomplete") { await f.sequence.save({ sourceCompleted: false }); }
      if (scenario === "candidate") f.master.lifecycle.candidate = { candidateId: "foreign-candidate" };
      if (scenario === "new-baseline") f.master.lifecycle.active.candidateId = "other-master";
      if (scenario === "wrong-recipe") body.buildJobRevision = "b".repeat(64);
      if (scenario === "wrong-update") body.updateRunId = "update-bbbbbbbb-bbbb-bbbb-bbbbbbbbbbbb";
      if (scenario === "no-consent") body.usageConsent.noChangesUntilClose = false;
      if (scenario === "input-race") await fs.writeFile(f.correctionsPath, '{"entries":[{"scientificName":"Changed name"}]}');
      if (scenario === "catalog-race") {
        const other = path.join(f.root, "other.lrcat"); await fs.writeFile(other, "synthetic second catalog");
        await captureCatalogUsage(f.root, { catalogPath: other, complete: true, passes: 2, totalPhotos: 0, usedTaxa: [] });
        const service = createCatalogUsageService({ taxonomyRoot: f.root });
        await service.catalogUsageSave({ token: (await service.catalogUsagePreview()).token, confirmed: true,
          allCatalogsConfirmed: true, unchangedSinceCapture: true });
      }
      await assert.rejects(f.sequence.restartBuild(body), (error) => ["UPDATE_WORKFLOW_BLOCKED", "UPDATE_RESTART_BLOCKED"].includes(error.code));
      assert.equal(f.sequence.status().updateRunId, old.updateRunId);
      assert.deepEqual(await fs.readFile(f.recipeFile), original);
      assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
    });
  }
});

test("stale owned build allows fresh local preview; history write failure and post-capture source drift keep old jobs protected", async (t) => {
  const f = await failedRestartFixture(t);
  f.master.buildJob.status = "stale"; f.master.buildJob.canResume = false;
  const directory = path.dirname(f.recipeFile);
  await fs.writeFile(path.join(directory, "state.json"), JSON.stringify({ id: f.buildJobId, status: "stale" }));
  const preview = await f.sequence.restartBuildPreview(), old = f.sequence.status();
  const write = f.sequence.writeState;
  f.sequence.writeState = async (filename, value) => {
    if (filename.includes("update-workflow-history")) throw new Error("history-write-failed");
    return write(filename, value);
  };
  const body = { ...preview, confirmed: true, usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } };
  await assert.rejects(f.sequence.restartBuild(body), /history-write-failed/);
  assert.equal(f.sequence.status().updateRunId, old.updateRunId);
  f.sequence.writeState = write;
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.restartBuild(body);
  await fs.writeFile(f.speciesListPath, '[{"scientificName":"Changed after fresh confirmation"}]');
  f.proof = { ready: true, usageRevision: "fresh-new-request" };
  await f.sequence.advance();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /Vorschau|Ausgangsstand|Eingang/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  assert.equal(JSON.parse(await fs.readFile(f.recipeFile)).revision, f.recipe.revision);
  const failedReplacement = f.sequence.status();
  const replacementPreview = await f.sequence.restartBuildPreview();
  assert.equal(replacementPreview.updateRunId, failedReplacement.updateRunId, "Confirmation binds the current failed replacement");
  assert.equal(replacementPreview.buildJobId, f.buildJobId, "Build ownership remains the original failed job");
  assert.equal(replacementPreview.buildJobRevision, f.recipe.revision);
  f.proof = { ready: false, reason: "catalog-usage" };
  const next = await f.sequence.restartBuild({ ...replacementPreview, confirmed: true, usageConsent: body.usageConsent });
  assert.notEqual(next.updateRunId, failedReplacement.updateRunId);
  assert.equal(next.restartGuard.identity.updateRunId, old.updateRunId);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, "master", "update-workflow-history", `${failedReplacement.updateRunId}.json`))),
    (({ available, active, ...saved }) => saved)(failedReplacement));
  f.proof = { ready: true, usageRevision: "fresh-second-request" };
  await f.sequence.advance();
  assert.equal(f.sequence.status().status, "building");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(JSON.parse(await fs.readFile(f.recipeFile)).revision, f.recipe.revision);
});

test("changed origin history blocks replacement preview and post-FN start; metadata is never adopted from a forged lineage", async (t) => {
  const f = await failedRestartFixture(t), origin = f.sequence.status();
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.restartBuild({ ...await f.sequence.restartBuildPreview(), confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  const history = path.join(f.root, "master", "update-workflow-history", `${origin.updateRunId}.json`);
  const original = JSON.parse(await fs.readFile(history));
  await fs.writeFile(history, JSON.stringify({ ...original, error: "Changed origin history" }));
  f.proof = { ready: true, usageRevision: "fresh-new-request" };
  await f.sequence.advance();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /Ursprungshistorie/);
  await assert.rejects(f.sequence.restartBuildPreview(), /Ursprungshistorie/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
});

test("real fresh FN request and closed registration release exactly one new owned local build without invalidating catalog-set binding", async (t) => {
  for (const drift of [false, true]) await t.test(drift ? "new confirmation after source drift" : "unchanged source", async (st) => {
  const f = await failedRestartFixture(st);
  const requests = createLightroomUsageRequestService({ taxonomyRoot: f.root });
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: requests, processes: async () => [] });
  f.sequence.prepareStart = (job) => requests.prepare(job);
  f.sequence.checkStartReady = (options) => gate.ready(options);
  const preview = await f.sequence.restartBuildPreview();
  let restarted = await f.sequence.restartBuild({ ...preview, confirmed: true,
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  assert.equal(restarted.status, "waiting-usage");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  const capture = await catalogUsageRequest(f.root, { catalogPath: f.catalogPath });
  assert.equal(capture.required, true);
  assert.equal(capture.updateRunId, restarted.updateRunId);
  await fs.writeFile(f.catalogPath + ".lock", "Synthetic open catalog");
  await captureCatalogUsage(f.root, { catalogPath: f.catalogPath, complete: true, passes: 2, totalPhotos: 0, usedTaxa: [],
    captureRequestId: capture.requestId, requestRevision: capture.requestRevision });
  await f.sequence.advance();
  assert.equal(f.sequence.status().status, "waiting-lightroom");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  if (drift) await fs.writeFile(f.speciesListPath, '[{"scientificName":"Jynx torquilla"}]');
  await fs.unlink(f.catalogPath + ".lock");
  await fs.appendFile(f.catalogPath, "Synthetic normal close");
  await f.sequence.advance();
  if (drift) {
    assert.equal(f.sequence.status().status, "failed");
    assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
    const failedRunId = restarted.updateRunId;
    const repeatPreview = await f.sequence.restartBuildPreview();
    assert.equal(repeatPreview.updateRunId, failedRunId);
    restarted = await f.sequence.restartBuild({ ...repeatPreview, confirmed: true,
      usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
    assert.equal(restarted.status, "waiting-usage");
    const nextCapture = await catalogUsageRequest(f.root, { catalogPath: f.catalogPath });
    assert.equal(nextCapture.required, true);
    assert.notEqual(nextCapture.requestId, capture.requestId);
    await fs.writeFile(f.catalogPath + ".lock", "Synthetic reopened catalog");
    await captureCatalogUsage(f.root, { catalogPath: f.catalogPath, complete: true, passes: 2, totalPhotos: 0, usedTaxa: [],
      captureRequestId: nextCapture.requestId, requestRevision: nextCapture.requestRevision });
    await fs.unlink(f.catalogPath + ".lock"); await fs.appendFile(f.catalogPath, "Synthetic second close");
    await f.sequence.advance();
  }
  assert.equal(f.sequence.status().status, "building");
  assert.equal((await requests.status(restarted.updateRunId)).request.status, "completed");
  const builds = f.calls.filter(([name]) => name === "build");
  assert.equal(builds.length, 2);
  assert.equal(builds[1][1].updateRunId, restarted.updateRunId);
  assert.equal(builds[1][1].refreshProviders, false);
  await f.sequence.advance();
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1);
  });
});

test("one confirmed source start persists exact target and continues beyond UI closure", async (t) => {
  const f = await fixture(t);
  const started = await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  assert.equal(started.status, "sources");
  assert.equal(started.sourcePlan.releaseId, "col-new");
  const saved = JSON.parse(await fs.readFile(f.sequence.file, "utf8"));
  assert.equal(saved.updateRunId, started.updateRunId);
  f.source = { ...f.source, status: "completed", active: false, activeRelease: "col-new" };
  f.master.reference = { activeRelease: "col-new", needsMasterRebuild: true };
  await f.tick();
  assert.equal(f.sequence.status().status, "building");
  assert.deepEqual(f.calls.find(([name]) => name === "build")[1], { refreshProviders: false, updateRunId: started.updateRunId });
  await f.ready();
  await f.tick();
  assert.equal(f.sequence.status().status, "activating");
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1);
});

test("closed Lightroom is polled without rebinding an expired preview or replacing target", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "lightroom-open", message: "wait" };
  await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  assert.equal(f.sequence.status().status, "waiting-lightroom");
  await f.tick();
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "bind").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 0);
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.calls.find(([name]) => name === "source-start")[1].updatePlan.releaseId, "col-new");
});

test("unknown usage is never empty usage and waits without automatic classification save", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "catalog-usage" };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  assert.equal(f.sequence.status().status, "waiting-usage");
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
  assert.equal(f.calls.filter(([name]) => name.includes("Automatic")).length, 0);
});

test("unconfirmed starts, expired source previews and parallel starts mutate nothing", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.sequence.start({ decision: "rebuild-master" }), /bestätigt/);
  await assert.rejects(f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "stale" }), /expired-preview/);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await assert.rejects(f.sequence.start({ confirmed: true, decision: "rebuild-master" }), /noch offen/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
});

test("read-only status never polls dependencies or starts a chain", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 5; index += 1) assert.equal(f.sequence.status().status, "idle");
  assert.equal(f.calls.length, 0);
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  const before = f.calls.length;
  for (let index = 0; index < 5; index += 1) f.sequence.status();
  assert.equal(f.calls.length, before);
});

test("write failure before the intent prevents source and master mutations", async (t) => {
  const f = await fixture(t, { writeState: async () => { throw new Error("disk-full"); } });
  await assert.rejects(f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" }), /disk-full/);
  assert.equal(f.calls.filter(([name]) => ["source-start", "build"].includes(name)).length, 0);
});

test("changed master baseline while waiting stops instead of silently retargeting", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  f.master.corrections.currentRevision = "foreign-correction";
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /Ausgangsstand/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("source failure is honest and never starts master", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  f.source = { ...f.source, status: "failed", active: false, error: "download-404" };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /download-404/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("sources restart is interrupted and imported CoL cannot imply completed supplements", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  await f.sequence.close();
  f.sequence = createTaxonomyUpdateCoordinator(f.deps);
  f.source = { status: "idle", active: false, activeRelease: "col-new" };
  await f.sequence.restore();
  assert.equal(f.sequence.status().status, "interrupted");
  await assert.rejects(f.sequence.resume({ confirmed: true }), /unterbrochener Quellenlauf/);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("already confirmed pre-start wait is restored and detects user closing Lightroom", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "lightroom-open" };
  const started = await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  await f.sequence.close();
  f.sequence = createTaxonomyUpdateCoordinator(f.deps);
  await f.sequence.restore();
  assert.equal(f.sequence.status().updateRunId, started.updateRunId);
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 1);
});

test("own interrupted worker requires technical confirmation and resumes exact checkpoints", async (t) => {
  const f = await fixture(t);
  const started = await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.sequence.close();
  f.sequence = createTaxonomyUpdateCoordinator(f.deps);
  f.master = { ...f.master, status: "interrupted", active: false,
    buildJob: { ...f.master.buildJob, status: "interrupted", canResume: true } };
  await f.sequence.restore();
  assert.equal(f.sequence.status().status, "interrupted");
  await assert.rejects(f.sequence.resume(), /bestätigt/);
  await f.sequence.resume({ confirmed: true });
  assert.deepEqual(f.calls.find(([name]) => name === "resume")[1], { confirmed: true, updateRunId: started.updateRunId });
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
});

test("foreign interrupted or ready build cannot be resumed or activated", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready();
  f.master.buildJob.updateRunId = "update-foreign";
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /gehört nicht/);
  await assert.rejects(f.sequence.resume({ confirmed: true }), /gehört nicht/);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
});

test("a foreign saved intermediate build blocks a second start", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "paused", id: "foreign", updateRunId: "foreign" };
  await assert.rejects(f.sequence.start({ confirmed: true, decision: "rebuild-master" }), /Zwischenstand/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("guarded unused classifications get one atomic save and exactly one local followup", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 12, classification: 12 });
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.sequence.status().automaticFollowupRevision, "events-2");
  await f.ready({ id: "candidate-2" });
  await f.tick();
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
});

async function ownFollowupFixture(t) {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ id: "first-candidate", blocking: 187, classification: 187 });
  const previousLifecycle = copy(f.master.lifecycle);
  await f.tick();
  assert.equal(f.sequence.status().automaticFollowupRevision, "events-2");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  f.master.lifecycle = previousLifecycle;
  return f;
}

test("healthy top-level cannot discard the failed own followup job and its EPERM cause", async (t) => {
  const f = await ownFollowupFixture(t);
  const ownJob = copy(f.master.buildJob), previous = copy(f.master.lifecycle);
  f.master = { ...f.master, status: "ready", active: false, error: "", message: "Previous candidate was ready",
    buildJob: { ...ownJob, status: "failed", error: "EPERM: staging -> .staging-old", canResume: true } };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.equal(f.sequence.status().phase, "build");
  assert.match(f.sequence.status().error, /EPERM: staging -> \.staging-old/);
  assert.doesNotMatch(f.sequence.status().message, /187.*Entscheidung/);
  assert.equal(f.master.buildJob.id, ownJob.id);
  assert.deepEqual(f.master.lifecycle, previous);
  assert.equal(f.sequence.status().automaticFollowupRevision, "events-2");
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
});

test("own building followup cannot turn the previous candidate into a new decision phase", async (t) => {
  const f = await ownFollowupFixture(t);
  f.master = { ...f.master, status: "building", active: false, error: "", buildJob: { ...f.master.buildJob, status: "building" } };
  await f.tick();
  assert.equal(f.sequence.status().status, "building");
  assert.equal(f.sequence.status().phase, "build");
  assert.equal(f.sequence.status().error, "");
  assert.doesNotMatch(f.sequence.status().message, /187.*Entscheidung/);
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
  f.master.buildJob = { ...f.master.buildJob, status: "failed", error: "EPERM: staging -> .staging-old", canResume: true };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /EPERM/);
});

test("own followup pause and interruption preserve the checkpoint and resume the same job despite stored stop text", async (t) => {
  for (const status of ["paused", "pausing", "interrupted"]) await t.test(status, async (st) => {
    const f = await ownFollowupFixture(st), id = f.master.buildJob.id;
    const checkpoint = { phase: "col", processed: 273470, total: 273470 };
    f.master = { ...f.master, status: "ready", active: false, error: "",
      buildJob: { ...f.master.buildJob, status, error: "Masteraufbau pausiert; gesicherter Fortschritt bleibt erhalten.",
        checkpoint, canResume: status !== "pausing" } };
    await f.tick();
    assert.equal(f.sequence.status().status, status === "interrupted" ? "interrupted" : "paused");
    assert.equal(f.sequence.status().phase, "build");
    assert.equal(f.sequence.status().error, "");
    assert.deepEqual(f.master.buildJob.checkpoint, checkpoint);
    if (status === "pausing") await assert.rejects(f.sequence.resume({ confirmed: true }), /fortgesetzt/);
    else {
      await f.sequence.resume({ confirmed: true });
      assert.equal(f.sequence.status().status, "building");
      assert.equal(f.master.buildJob.id, id);
      assert.deepEqual(f.master.buildJob.checkpoint, checkpoint);
      assert.equal(f.calls.filter(([name]) => name === "resume").length, 1);
    }
    assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
    assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
    assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
  });
});

test("foreign failed followup stays an ownership error and is never resumed or adopted", async (t) => {
  const f = await ownFollowupFixture(t);
  f.master = { ...f.master, status: "ready", active: false, error: "",
    buildJob: { ...f.master.buildJob, status: "failed", updateRunId: "update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      error: "FOREIGN-EPERM", canResume: true } };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /gehört nicht/);
  assert.doesNotMatch(f.sequence.status().error, /FOREIGN-EPERM/);
  await assert.rejects(f.sequence.resume({ confirmed: true }), /gehört nicht/);
  assert.equal(f.calls.filter(([name]) => name === "resume" || name === "activate").length, 0);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
});

test("ready snapshot cannot override an own persisted failure or pause", async (t) => {
  for (const status of ["failed", "paused", "interrupted"]) await t.test(status, async (st) => {
    const f = await ownFollowupFixture(st);
    await f.ready({ id: "followup-candidate", blocking: 1 });
    const checkpoint = { phase: "col", processed: 273470 };
    await fs.writeFile(path.join(f.root, "master", "build-jobs", f.master.buildJob.id, "state.json"),
      JSON.stringify({ schemaVersion: 1, id: f.master.buildJob.id, status, checkpoint,
        error: status === "failed" ? "EPERM: staging -> .staging-old" : "Masteraufbau pausiert; Fortschritt gesichert." }));
    await f.tick();
    assert.equal(f.sequence.status().status, status);
    if (status === "failed") assert.match(f.sequence.status().error, /EPERM/);
    else assert.equal(f.sequence.status().error, "");
    assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
    assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
  });
});

test("candidate inspection requires the finished own job metadata or its exact compatible recipe", async (t) => {
  for (const scenario of ["different-candidate", "missing-state", "different-job", "oversized-state", "matching-legacy-recipe",
    "different-recipe", "different-recipe-owner", "oversized-recipe"]) await t.test(scenario, async (st) => {
    const f = await ownFollowupFixture(st);
    await f.ready({ id: "followup-candidate", blocking: 1 });
    const directory = path.join(f.root, "master", "build-jobs", f.master.buildJob.id);
    const stateFile = path.join(directory, "state.json"), recipeFile = path.join(directory, "recipe.json");
    const state = JSON.parse(await fs.readFile(stateFile)), recipe = JSON.parse(await fs.readFile(recipeFile));
    if (scenario === "different-candidate") f.master.lifecycle.candidate.candidateId = "first-candidate";
    if (scenario === "missing-state") await fs.rm(stateFile);
    if (scenario === "different-job") { state.id = "job-ffffffff-ffff-ffff-ffff-ffffffffffff"; await fs.writeFile(stateFile, JSON.stringify(state)); }
    if (scenario === "oversized-state") await fs.writeFile(stateFile, JSON.stringify({ ...state, unexpected: "x".repeat(512 * 1024) }));
    if (scenario.includes("recipe")) {
      delete state.candidateId;
      await fs.writeFile(stateFile, JSON.stringify(state));
      if (scenario === "different-recipe") recipe.revision = "previous-recipe";
      if (scenario === "different-recipe-owner") recipe.updateRunId = "update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      if (scenario === "oversized-recipe") recipe.unexpected = "x".repeat(12 * 1024 * 1024);
      await fs.writeFile(recipeFile, JSON.stringify(recipe));
    }
    await f.tick();
    assert.equal(f.sequence.status().status, scenario === "matching-legacy-recipe" ? "waiting-decisions" : "failed");
    if (scenario !== "matching-legacy-recipe") assert.match(f.sequence.status().error, /Kandidat|Aufbau|Größe|Rezept/);
    assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
    assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
    assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
  });
});

test("remaining protected conflicts never get a second automatic followup", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 12, classification: 12 });
  await f.tick();
  await f.ready({ id: "candidate-2", blocking: 1, classification: 1 });
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-decisions");
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
});

test("ordinary conflicts do not invoke classification automation", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 1 });
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-decisions");
  assert.equal(f.calls.filter(([name]) => name.includes("Automatic")).length, 0);
});

test("fresh saved user decisions resume with one local build, never provider download", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 1 });
  await f.tick();
  f.master.identities = { pending: true, revision: "user-events", candidateIncludesCurrent: false };
  await f.sequence.resume({ confirmed: true });
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 0);
  assert.equal(f.calls.filter(([name]) => name === "build").every(([, payload]) => payload.refreshProviders === false), true);
});

test("reopened Lightroom before activation pauses the final gate", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready();
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-lightroom");
  assert.equal(f.sequence.status().phase, "candidate");
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 1);
});

test("activation success is not workflow completion without a current paired package", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready();
  await f.tick();
  f.master.lightroomPackage = { status: "stale", needsRebuild: true };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /gemeinsam aktuell/);
});

test("apply corrections and package sync are durable separate full paths", async (t) => {
  const f = await fixture(t);
  f.master.corrections.pending = true;
  await f.sequence.start({ confirmed: true, decision: "apply-corrections" });
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
  f.master.lightroomPackage = { status: "stale", needsRebuild: true };
  await f.sequence.start({ confirmed: true, decision: "sync-lightroom" });
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
  assert.equal(f.calls.filter(([name]) => name === "corrections").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "package").length, 1);
});

for (const decision of ["apply-corrections", "sync-lightroom"]) {
  const call = decision === "apply-corrections" ? "corrections" : "package";
  const method = decision === "apply-corrections" ? "applyCorrections" : "syncLightroomPackage";
  const pending = (f) => {
    if (decision === "apply-corrections") f.master.corrections.pending = true;
    else f.master.lightroomPackage = { status: "stale", needsRebuild: true };
  };

  test(`${decision}: restart before effect retries the original phase; restart after effect only completes`, async (t) => {
    for (const committed of [false, true]) await t.test(String(committed), async (t) => {
      const f = await fixture(t);
      pending(f);
      if (committed) {
        const original = f.deps.masterService[method];
        f.deps.masterService[method] = async (...args) => { await original(...args); f.sequence.closed = true; };
      } else f.sequence.onStateChange = async (state) => {
        if (["applying-corrections", "syncing-lightroom"].includes(state.status)) f.sequence.closed = true;
      };
      const intent = await f.sequence.start({ confirmed: true, decision });
      await f.sequence.close();
      f.sequence = createTaxonomyUpdateCoordinator(f.deps);
      await f.sequence.restore();
      assert.equal(f.sequence.status().status, "interrupted");
      if (!committed) f.proof = { ready: false, reason: "lightroom-open" };
      await f.sequence.resume({ confirmed: true });
      if (!committed) {
        assert.equal(f.sequence.status().status, "waiting-lightroom");
        assert.equal(f.calls.filter(([name]) => name === call).length, 0);
        await f.sequence.close();
        f.sequence = createTaxonomyUpdateCoordinator(f.deps);
        await f.sequence.restore();
        f.proof = { ready: true, usageRevision: "usage-retry" };
        await f.tick();
        assert.equal(f.sequence.status().usageRevision, "usage-retry");
        await f.tick();
      }
      assert.equal(f.sequence.status().status, "completed");
      assert.equal(f.sequence.status().updateRunId, intent.updateRunId);
      assert.deepEqual(f.sequence.status().baseline, intent.baseline);
      assert.equal(f.calls.filter(([name]) => name === call).length, 1);
      assert.equal(f.calls.filter(([name]) => ["build", "source-start"].includes(name)).length, 0);
    });
  });

  test(`${decision}: failed phase can be explicitly retried without reopening the successful effect`, async (t) => {
    const f = await fixture(t);
    pending(f);
    const original = f.deps.masterService[method];
    let attempts = 0;
    f.deps.masterService[method] = async (...args) => {
      if (++attempts === 1) { f.master.status = "failed"; f.master.error = "file-locked"; return; }
      f.master.error = "";
      return original(...args);
    };
    await f.sequence.start({ confirmed: true, decision });
    await f.tick();
    assert.equal(f.sequence.status().status, "failed");
    await f.sequence.resume({ confirmed: true });
    await f.tick();
    assert.equal(f.sequence.status().status, "completed");
    assert.equal(attempts, 2);
    await assert.rejects(f.sequence.resume({ confirmed: true }), /bestätigt/);
    assert.equal(attempts, 2);
  });

  test(`${decision}: changed master, names, identities, source or candidate cannot retarget the retry`, async (t) => {
    for (const change of [
      (master) => { master.lifecycle.active.candidateId = "foreign-master"; },
      (master) => { master.corrections.currentRevision = "foreign-names"; },
      (master) => { master.identities.revision = "foreign-identities"; },
      (master) => { master.reference.activeRelease = "foreign-source"; },
      (master) => { master.lifecycle.candidate = { candidateId: "foreign-candidate" }; },
    ]) await t.test(String(change), async (t) => {
      const f = await fixture(t);
      pending(f);
      f.sequence.onStateChange = async (state) => {
        if (["applying-corrections", "syncing-lightroom"].includes(state.status)) f.sequence.closed = true;
      };
      await f.sequence.start({ confirmed: true, decision });
      await f.sequence.close();
      f.sequence = createTaxonomyUpdateCoordinator(f.deps);
      await f.sequence.restore();
      change(f.master);
      await assert.rejects(f.sequence.resume({ confirmed: true }), /Grundlage.*verändert/);
      assert.equal(f.calls.filter(([name]) => name === call).length, 0);
    });
  });

  test(`${decision}: the asynchronous usage proof cannot authorize a changed input or a closing service`, async (t) => {
    for (const change of ["input", "close"]) await t.test(change, async (t) => {
      const f = await fixture(t);
      pending(f);
      f.sequence.onStateChange = async (state) => {
        if (["applying-corrections", "syncing-lightroom"].includes(state.status)) f.sequence.closed = true;
      };
      await f.sequence.start({ confirmed: true, decision });
      await f.sequence.close();
      f.sequence = createTaxonomyUpdateCoordinator(f.deps);
      await f.sequence.restore();
      f.sequence.checkStartReady = async () => {
        if (change === "input") f.master.corrections.currentRevision = "changed-during-proof";
        else f.sequence.closed = true;
        return { ready: true, usageRevision: "usage-new" };
      };
      await f.sequence.resume({ confirmed: true });
      if (change === "input") {
        assert.equal(f.sequence.status().status, "failed");
        assert.match(f.sequence.status().error, /Grundlage.*verändert/);
      }
      assert.equal(f.calls.filter(([name]) => name === call).length, 0);
    });
  });
}

test("explicitly bound owner-less ready candidate activates without needless rebuild", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "ready", id: "legacy-job", updateRunId: "" };
  await f.ready();
  await f.sequence.start({ confirmed: true, decision: "activate", candidateId: "candidate-1", buildJobId: "legacy-job", buildJobRevision: "recipe-1" });
  assert.deepEqual(f.calls.find(([name]) => name === "activate")[1], { confirmed: true });
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
});

test("unbound and foreign-owner ready candidate are not adopted", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "ready", id: "legacy-job", updateRunId: "" };
  await f.ready();
  await assert.rejects(f.sequence.start({ confirmed: true, decision: "activate" }), /gewählte/);
  f.master.buildJob.updateRunId = "update-foreign";
  await assert.rejects(f.sequence.start({ confirmed: true, decision: "activate", candidateId: "candidate-1", buildJobId: "legacy-job", buildJobRevision: "recipe-1" }), /gewählte/);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
});

test("pause preserves own worker and close does not falsely complete or restart it", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.sequence.pause();
  assert.equal(f.sequence.status().status, "paused");
  assert.equal(f.calls.filter(([name]) => name === "pause").length, 1);
  await f.sequence.close();
  const saved = JSON.parse(await fs.readFile(f.sequence.file, "utf8"));
  assert.equal(saved.status, "paused");
  assert.equal(f.calls.filter(([name]) => name === "resume").length, 0);
});

test("damaged stored workflow fails closed and cannot schedule work", async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.dirname(f.sequence.file), { recursive: true });
  await fs.writeFile(f.sequence.file, JSON.stringify({ schemaVersion: 1, updateRunId: "../foreign", decision: "rebuild-master" }));
  await assert.rejects(f.sequence.restore(), /ungültig/);
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.length, 0);
});

test("cross-process owner lock prevents a second coordinator from restoring or starting", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  const other = createTaxonomyUpdateCoordinator(f.deps);
  t.after(() => other.close());
  await assert.rejects(other.restore(), /anderer Explorer/);
  await assert.rejects(other.start({ confirmed: true, decision: "rebuild-master" }), /anderer Explorer/);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("fresh confirmed source retry archives interrupted intent before mutation", async (t) => {
  const f = await fixture(t);
  const first = await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  f.source = { ...f.source, status: "failed", active: false, error: "network-error" };
  await f.tick();
  const second = await f.sequence.start({ confirmed: true, decision: "refresh-and-build", token: "fresh-token" });
  assert.notEqual(second.updateRunId, first.updateRunId);
  const archived = JSON.parse(await fs.readFile(path.join(path.dirname(f.sequence.file), "update-workflow-history", `${first.updateRunId}.json`), "utf8"));
  assert.equal(archived.status, "failed");
  assert.equal(archived.sourcePlan.releaseId, "col-new");
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 2);
});

test("unavailable read-only automation preview retries after fresh usage instead of consuming the one save", async (t) => {
  const f = await fixture(t);
  const original = f.deps.masterService.reviewIdentity;
  let unavailable = true;
  f.deps.masterService.reviewIdentity = async (action, payload) => {
    if (action === "classificationAutomaticPreview" && unavailable) return { available: false, message: "usage missing" };
    return original(action, payload);
  };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 12, classification: 12 });
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-usage");
  assert.deepEqual(f.sequence.status().automaticAttemptedCandidates, []);
  unavailable = false;
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
});

test("confirmed checkpoint resume waits for Lightroom closure without a second resume click", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.sequence.pause();
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.sequence.resume({ confirmed: true });
  assert.equal(f.sequence.status().status, "waiting-lightroom");
  assert.equal(f.sequence.status().phase, "resume-build");
  assert.equal(f.calls.filter(([name]) => name === "resume").length, 0);
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "resume").length, 1);
});

test("start and wait completion invoke the expensive start proof only once per boundary", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  const before = f.calls.filter(([name]) => name === "proof").length;
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "proof").length - before, 1);
});

test("a ready flag without a bound usage revision cannot authorize any start", async (t) => {
  const f = await fixture(t);
  f.proof = { ready: true };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  assert.equal(f.sequence.status().status, "waiting-usage");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("uncertain automatic-save failure is not blindly retried on restart or resume", async (t) => {
  const f = await fixture(t);
  const original = f.deps.masterService.reviewIdentity;
  f.deps.masterService.reviewIdentity = async (action, payload) => {
    if (action === "classificationAutomaticSave") {
      await original(action, payload); // Mutation could have committed before its response was lost.
      throw new Error("lost-save-response");
    }
    return original(action, payload);
  };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 12, classification: 12 });
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.equal(f.sequence.status().phase, "automatic-save");
  await f.sequence.close();
  f.sequence = createTaxonomyUpdateCoordinator(f.deps);
  await f.sequence.restore();
  await f.sequence.resume({ confirmed: true });
  assert.equal(f.sequence.status().status, "waiting-decisions");
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
});

test("failed package activation never becomes a completed workflow", async (t) => {
  const f = await fixture(t);
  f.deps.masterService.activate = async () => {
    f.master = { ...f.master, active: false, status: "failed", error: "package-validation-failed" };
  };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready();
  await f.tick();
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /package-validation-failed/);
  assert.equal(f.master.lifecycle.active.candidateId, "master-old");
});

test("a replaced explicitly chosen legacy candidate fails without activation", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "ready", id: "legacy-job", updateRunId: "" };
  await f.ready();
  f.proof = { ready: false, reason: "lightroom-open" };
  await f.sequence.start({ confirmed: true, decision: "activate", candidateId: "candidate-1", buildJobId: "legacy-job", buildJobRevision: "recipe-1" });
  f.master.lifecycle.candidate.buildJobRevision = "foreign-recipe";
  f.proof = { ready: true, usageRevision: "usage-1" };
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
});

test("idle restore does not create a workflow directory or lock database", async (t) => {
  const f = await fixture(t);
  await f.sequence.restore();
  assert.equal(f.sequence.status().status, "idle");
  await assert.rejects(fs.stat(path.dirname(f.sequence.file)), { code: "ENOENT" });
});

test("gespeicherter Start bindet SDK-Vereinbarung vor Mutationen; Erfassungsfehler bleibt Warten", async (t) => {
  let seen;
  const f = await fixture(t, { prepareStart: async (job) => { seen = copy(job); throw new Error("capture required"); } });
  const consent = { allCatalogsConfirmed: true, noChangesUntilClose: true };
  const value = await f.sequence.start({ confirmed: true, decision: "rebuild-master", usageConsent: consent });
  assert.equal(value.status, "waiting-usage");
  assert.deepEqual(seen.usageConsent, consent);
  assert.equal(seen.updateRunId, value.updateRunId);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});

test("letzte bestätigte normale Feldentscheidung setzt denselben Auftrag ohne zweiten Start fort", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 1 });
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-decisions");
  await f.sequence.afterConfirmedDecision();
  assert.equal(f.sequence.status().status, "waiting-decisions");
  f.master.lifecycle.blockingConflictCount = 0;
  f.master.lifecycle.canActivate = true;
  await f.sequence.afterConfirmedDecision();
  assert.equal(f.sequence.status().status, "activating");
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 1);
});

test("Klassifikationsentscheidungen starten erst nach vollständigem gebundenem Bündel einen lokalen Folgeaufbau", async (t) => {
  const f = await fixture(t);
  let complete = false;
  f.deps.masterService.reviewIdentity = async (action) => {
    if (action === "classificationAutomaticPreview") return { available: true, candidateId: "candidate-1", matching: 0, deferred: 0 };
    assert.equal(action, "classificationDecisionReadiness");
    return { ready: complete, candidateId: "candidate-1" };
  };
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await f.ready({ blocking: 2, classification: 2 });
  await f.tick();
  f.master.identities = { pending: true, revision: "confirmed-new", candidateIncludesCurrent: false };
  await f.sequence.afterConfirmedDecision();
  assert.equal(f.calls.filter(([name]) => name === "build").length, 1);
  complete = true;
  await f.sequence.afterConfirmedDecision();
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "source-start").length, 0);
});

test("service close during the final start-proof await cannot start a new mutation", async (t) => {
  let resolveProof;
  let enteredProof;
  const waiting = new Promise((resolve) => { enteredProof = resolve; });
  const f = await fixture(t, { checkStartReady: async () => {
    enteredProof();
    return new Promise((resolve) => { resolveProof = resolve; });
  } });
  const start = f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  await waiting;
  const closed = f.sequence.close();
  resolveProof({ ready: true, usageRevision: "usage-1" });
  await Promise.all([start, closed]);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
});
