import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTaxonomyUpdateCoordinator } from "./taxonomy-update-coordinator.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value));

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-update-coordinator-"));
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
      master = { ...master, active: true, status: "building", buildJob: { available: true, id: `job-${calls.filter(([name]) => name === "build").length}`,
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
  t.after(async () => { await sequence.close(); await fs.rm(root, { recursive: true, force: true }); });
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
    ready({ blocking = 0, classification = 0, id = "candidate-1" } = {}) {
      master = { ...master, active: false, status: "ready", buildJob: { ...master.buildJob, status: "ready" },
        lifecycle: { ...master.lifecycle, candidate: { candidateId: id, buildJobRevision: "recipe-1", classificationReview: { total: classification } },
          blockingConflictCount: blocking, canActivate: blocking === 0 },
        identities: { ...master.identities, candidateIncludesCurrent: true } };
    },
  };
}

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
  f.ready();
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
  f.ready();
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
  f.ready({ blocking: 12, classification: 12 });
  await f.tick();
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "build").length, 2);
  assert.equal(f.sequence.status().automaticFollowupRevision, "events-2");
  f.ready({ id: "candidate-2" });
  await f.tick();
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
});

test("remaining protected conflicts never get a second automatic followup", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  f.ready({ blocking: 12, classification: 12 });
  await f.tick();
  f.ready({ id: "candidate-2", blocking: 1, classification: 1 });
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-decisions");
  assert.equal(f.calls.filter(([name]) => name === "classificationAutomaticSave").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 0);
});

test("ordinary conflicts do not invoke classification automation", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  f.ready({ blocking: 1 });
  await f.tick();
  assert.equal(f.sequence.status().status, "waiting-decisions");
  assert.equal(f.calls.filter(([name]) => name.includes("Automatic")).length, 0);
});

test("fresh saved user decisions resume with one local build, never provider download", async (t) => {
  const f = await fixture(t);
  await f.sequence.start({ confirmed: true, decision: "rebuild-master" });
  f.ready({ blocking: 1 });
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
  f.ready();
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
  f.ready();
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

test("explicitly bound owner-less ready candidate activates without needless rebuild", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "ready", id: "legacy-job", updateRunId: "" };
  f.ready();
  await f.sequence.start({ confirmed: true, decision: "activate", candidateId: "candidate-1", buildJobId: "legacy-job", buildJobRevision: "recipe-1" });
  assert.deepEqual(f.calls.find(([name]) => name === "activate")[1], { confirmed: true });
  assert.equal(f.calls.filter(([name]) => name === "build").length, 0);
  await f.tick();
  assert.equal(f.sequence.status().status, "completed");
});

test("unbound and foreign-owner ready candidate are not adopted", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "ready", id: "legacy-job", updateRunId: "" };
  f.ready();
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
  f.ready({ blocking: 12, classification: 12 });
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
  f.ready({ blocking: 12, classification: 12 });
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
  f.ready();
  await f.tick();
  await f.tick();
  assert.equal(f.sequence.status().status, "failed");
  assert.match(f.sequence.status().error, /package-validation-failed/);
  assert.equal(f.master.lifecycle.active.candidateId, "master-old");
});

test("a replaced explicitly chosen legacy candidate fails without activation", async (t) => {
  const f = await fixture(t);
  f.master.buildJob = { available: true, status: "ready", id: "legacy-job", updateRunId: "" };
  f.ready();
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
  f.ready({ blocking: 1 });
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
  f.ready({ blocking: 2, classification: 2 });
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
