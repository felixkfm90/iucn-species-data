import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { canonicalBuildInput, taxonomyRecordFingerprint, createTaxonomyBuildInputs,
  openTaxonomyBuildInputs, compareTaxonomyBuildInputs } from "./taxonomy-build-inputs.mjs";
import { planMasterDependencies, MASTER_DEPENDENCY_FILE } from "./taxonomy-master-dependencies.mjs";
import { reuseMasterDependencyPlan } from "./taxonomy-master-graph-reuse.mjs";

export const MASTER_INPUT_FILE = "build-inputs.sqlite";
const hash = (value) => crypto.createHash("sha256").update(canonicalBuildInput(value)).digest("hex");
const RULE_FILES = ["taxonomy-source-recovery-conflicts.mjs", "taxonomy-source-recovery-scope.mjs", "taxonomy-source-recovery-replacement.mjs", "taxonomy-source-recovery-identities.mjs", "taxonomy-source-recovery-candidate.mjs", "taxonomy-master-continuity.mjs", "taxonomy-partial-record.mjs", "taxonomy-master-inputs.mjs", "taxonomy-build-inputs.mjs", "taxonomy-master-dependencies.mjs", "taxonomy-master-reuse.mjs", "taxonomy-master-candidate.mjs", "taxonomy-master-checkpoint.mjs",
  "taxonomy-master-service.mjs", "taxonomy-master-slices.mjs", "taxonomy-master-model.mjs", "taxonomy-master-rules.mjs",
  "taxonomy-master-schema.mjs", "taxonomy-master-storage.mjs", "taxonomy-master-previous-state.mjs", "taxonomy-taxon-quality.mjs",
  "taxonomy-search-text.mjs", "taxonomy-identity-build.mjs", "taxonomy-identity-registry.mjs", "taxonomy-identity-projects.mjs",
  "taxonomy-master-job.mjs", "taxonomy-master-worker.mjs", "taxonomy-master-process.mjs", "../scripts/taxonomy-master-worker.mjs",
  "taxonomy-master-source-binding.mjs", "taxonomy-master-run-controller.mjs", "taxonomy-master-search-reuse.mjs",
  "taxonomy-master-graph-reuse.mjs", "taxonomy-master-writer.mjs", "taxonomy-master-reuse-reader.mjs",
  "taxonomy-classification-review.mjs", "taxonomy-master-lifecycle.mjs"];

export async function masterBuildRulesRevision() {
  const contents = await Promise.all(RULE_FILES.map(async (name) => [name,
    (await fs.readFile(new URL(name, import.meta.url), "utf8")).replace(/\r\n/g, "\n")]));
  return hash(contents);
}
const loadedRules = masterBuildRulesRevision().then((value) => ({ value }), (error) => ({ error }));

export async function masterFileFingerprint(filename) {
  const digest = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest("hex");
}

// Called only after local provider files passed readProviderSlice validation and
// the reference store was opened. "Complete" describes this selected input, not
// all taxa in CoL or all records offered by an external provider.
export function coverMasterInputSelection({ colRelease, colRecords, targetNames, providerSlices }) {
  const col = { provider: "catalogue-of-life", version: colRelease.providerVersion,
    scopeKey: `selected-names-v1:${hash([...new Set(targetNames)].sort())}`, rawCount: 0, complete: false };
  const coverage = [col, ...providerSlices.map((slice) => ({ provider: slice.manifest.provider,
    version: slice.manifest.providerVersion, scopeKey: "master-selected-species-v1",
    rawCount: slice.records.length, complete: true }))];
  let started = false;
  return {
    coverage,
    async *records() {
      if (started) throw new Error("Der CoL-Eingang darf nur einmal gelesen werden.");
      started = true;
      for await (const record of colRecords) { col.rawCount += 1; yield record; }
      col.complete = true; // not reached on abort, exception or early iterator return
    },
  };
}

// recordLocations retains the duplicate-merged inputs BEFORE identity planning
// can discard/redirect a historic group. Only bounded buffers are duplicated.
export async function writeMasterBuildInputs({ directory, candidateId, baseMasterVersion, masterSchema,
  releases, coverage, rawCounts, recordLocations, corrections, projects, retainedTaxa, identityRevision,
  onProgress = () => {} }) {
  if (!coverage) return { available: false, reason: "unverified-input-coverage" };
  const loaded = await loadedRules;
  if (loaded.error) throw loaded.error;
  const revision = await masterBuildRulesRevision();
  if (revision !== loaded.value) return { available: false, reason: "loaded-build-code-changed" };
  const byProvider = new Map(coverage.map((entry) => [entry.provider, entry]));
  if (byProvider.size !== coverage.length || byProvider.size !== releases.length) throw new Error("Uneindeutiger Quellenumfang für den Eingangsstand.");
  for (const release of releases) {
    const proof = byProvider.get(release.provider);
    if (!proof?.complete || proof.version !== release.providerVersion || proof.rawCount !== rawCounts.get(release.provider)) {
      throw new Error(`Unvollständiger oder abweichender Eingangsstand: ${release.provider}.`);
    }
  }
  const sourceState = new Map(releases.map((release) => [release.provider, { release, count: 0,
    digest: crypto.createHash("sha256"), buffer: [], written: 0 }]));
  let fingerprinted = 0;
  for (const { group, index } of recordLocations.values()) {
    const record = group.records[index], state = sourceState.get(record.provider);
    if (!state) throw new Error("Datensatz ohne geplante Quelle.");
    state.count += 1;
    state.digest.update(canonicalBuildInput([record.providerRecordId, taxonomyRecordFingerprint(record)]) + "\n");
    fingerprinted += 1;
    if (fingerprinted % 1000 === 0) {
      onProgress({ phase: "Aufbaueingänge prüfen", message: "Normalisierte Eingänge werden auf fachliche Änderungen vorbereitet.",
        current: fingerprinted, total: recordLocations.size, percent: 70 });
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  const sources = [...sourceState.values()].map(({ release, count, digest }) => ({ provider: release.provider,
    version: release.providerVersion, scopeKey: byProvider.get(release.provider).scopeKey,
    checksum: digest.digest("hex"), expectedCount: count }));
  const contract = { candidateId, baseMasterVersion: baseMasterVersion || "no-active-master", masterSchema,
    normalizerVersion: "master-inputs-1", rulesRevision: revision, identitiesRevision: identityRevision,
    correctionsRevision: hash(corrections), projectsRevision: hash({ projects, retainedTaxa }), sources,
    // Observational release provenance is preserved without making a timestamp a
    // semantic record change. The input digest is not an archive checksum.
    upstreamReleases: releases };
  const writer = await createTaxonomyBuildInputs({ filename: path.join(directory, MASTER_INPUT_FILE), contract });
  let fingerprint;
  try {
    for (const source of sources) writer.addSource(source);
    let completed = 0;
    const flush = (provider, state) => {
      if (!state.buffer.length) return;
      state.written = writer.append(provider, state.written, state.buffer);
      completed += state.buffer.length;
      state.buffer = [];
      onProgress({ phase: "Aufbaueingänge sichern", message: "Geprüfte Eingangsstände werden dem Kandidaten zugeordnet.",
        current: completed, total: recordLocations.size, percent: 70 });
    };
    for (const { group, index } of recordLocations.values()) {
      const record = group.records[index], state = sourceState.get(record.provider);
      state.buffer.push(record);
      if (state.buffer.length === 1000) { flush(record.provider, state); await new Promise((resolve) => setImmediate(resolve)); }
    }
    for (const [provider, state] of sourceState) { flush(provider, state); writer.completeSource(provider); }
    fingerprint = writer.seal();
  } finally { writer.close(); }
  return { available: true, file: MASTER_INPUT_FILE, fingerprint, recordCount: recordLocations.size,
    sourceCount: sources.length, buildMode: "full" };
}

// A conflict decision can change the DB without changing candidateId. Bind the
// baseline to exact DB bytes as well; a modified master requires a fresh baseline.
export async function readBoundMasterBuildInputs(directory, manifest) {
  const descriptor = manifest?.buildInputs;
  if (!descriptor?.available) return { available: false, reason: "no-input-baseline" };
  if (descriptor.file !== MASTER_INPUT_FILE) return { available: false, reason: "invalid-input-file" };
  let inputs;
  try {
    inputs = openTaxonomyBuildInputs(path.join(directory, MASTER_INPUT_FILE));
    if (inputs.fingerprint !== descriptor.fingerprint || inputs.contract.candidateId !== manifest.candidateId
        || await masterFileFingerprint(path.join(directory, "taxonomy-master.sqlite")) !== descriptor.masterSha256) {
      inputs.close();
      return { available: false, reason: "input-master-binding-mismatch" };
    }
    return { available: true, inputs };
  } catch (error) {
    inputs?.close();
    return { available: false, reason: "input-baseline-unreadable", detail: error.message };
  }
}

export async function compareMasterBuildInputs({ previousDirectory, previousManifest, currentDirectory, currentManifest, onProgress, reusePlan }) {
  const previous = await readBoundMasterBuildInputs(previousDirectory, previousManifest);
  if (!previous.available) return { mode: "full-build-required", reasons: [previous.reason], changesEmitted: 0 };
  let current;
  try {
    current = await readBoundMasterBuildInputs(currentDirectory, currentManifest);
    if (!current.available) return { mode: "full-build-required", reasons: [current.reason], changesEmitted: 0 };
    const comparison = compareTaxonomyBuildInputs(previous.inputs, current.inputs);
    if (comparison.mode === "input-delta") {
      const filename = path.join(currentDirectory, MASTER_DEPENDENCY_FILE);
      const options = { filename,
        previousPath: path.join(previousDirectory, "taxonomy-master.sqlite"),
        currentPath: path.join(currentDirectory, "taxonomy-master.sqlite"),
        beforeInputs: previous.inputs, afterInputs: current.inputs, onProgress };
      const plan = await reuseMasterDependencyPlan({ ...options, descriptor: reusePlan,
        previousSha256: previousManifest.buildInputs.masterSha256, fingerprint: masterFileFingerprint })
        || await planMasterDependencies(options);
      comparison.dependencyPlan = { ...plan, file: MASTER_DEPENDENCY_FILE, sha256: await masterFileFingerprint(filename) };
    }
    return comparison;
  } finally { previous.inputs.close(); current?.inputs?.close(); }
}
