import crypto from "node:crypto";
import { createMasterTaxon, addMasterConflict, addMasterTaxonAlias, linkProjectTaxon } from "./taxonomy-master-model.mjs";
import { identityRegistryState, taxonIdentityKey, validateIdentityRegistry, writeIdentityRegistry } from "./taxonomy-identity-registry.mjs";
import { validateProjectAssignmentsAgainstActive, moveAssignedProjects } from "./taxonomy-identity-projects.mjs";

export function identityBuildSourceRevision(releases) {
  const sources = releases.map((release) => ({ provider: release.provider, releaseId: release.releaseId,
    providerVersion: release.providerVersion, checksumSha256: release.checksumSha256 || null }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
  return crypto.createHash("sha256").update(JSON.stringify(sources)).digest("hex");
}

const fromRow = (row) => ({ masterTaxonId: row.master_taxon_id, scientificName: row.canonical_scientific_name,
  rank: row.rank, kingdom: row.kingdom });
const liveRecords = (group) => (group?.records || []).filter((record) => record.versionChangeState !== "removed");

// Planning is entirely in memory. The caller writes only its new staging DB.
export function prepareIdentityBuild({ groups, previousState, registry = previousState.identityRegistry,
  baseVersion, sourceRevision, inputRevision, releases, ensureGroup, projects = [], projectKeyOf = taxonIdentityKey }) {
  const previous = validateIdentityRegistry(previousState.identityRegistry);
  registry = validateIdentityRegistry(registry);
  if (JSON.stringify(registry.events.slice(0, previous.events.length)) !== JSON.stringify(previous.events)) {
    throw new Error("Der Kandidat darf die aktive Identitätshistorie nicht entfernen oder umschreiben. Für Rücknahmen den geprüften Rollback verwenden.");
  }
  const touched = new Set();
  const newEvents = registry.events.slice(previous.events.length);
  const previousByKey = new Map();
  for (const row of newEvents.length ? previousState.taxa.values() : []) {
    if (row.lifecycle_state === "deprecated") continue;
    const key = taxonIdentityKey(fromRow(row));
    const matches = previousByKey.get(key) || [];
    matches.push(row);
    previousByKey.set(key, matches);
  }
  for (const event of newEvents) {
    const evidenceKey = (entry) => JSON.stringify([entry.provider, entry.providerVersion, entry.providerRecordId]);
    const suppliedEvidence = new Set(event.evidence.map(evidenceKey));
    const knownEvidence = new Set();
    if (event.baseVersion !== baseVersion || event.sourceRevision !== sourceRevision || event.inputRevision !== inputRevision) {
      throw new Error("Die Identitätsentscheidung gehört zu einem anderen Master- oder Quellenstand. Bitte erneut prüfen.");
    }
    validateProjectAssignmentsAgainstActive(event, previousState);
    for (const source of event.sources) {
      const old = previousState.taxa.get(source.masterTaxonId);
      if (!old || old.lifecycle_state === "deprecated" || taxonIdentityKey(fromRow(old)) !== taxonIdentityKey(source)
          || touched.has(source.masterTaxonId)) {
        throw new Error("Der bestätigte Vorgänger ist nicht mehr eindeutig vorhanden oder wird mehrfach verändert.");
      }
      touched.add(source.masterTaxonId);
      const sourceEvidence = previousState.evidenceFor(source.masterTaxonId);
      sourceEvidence.forEach((entry) => knownEvidence.add(evidenceKey(entry)));
      if (!sourceEvidence.some((entry) => suppliedEvidence.has(evidenceKey(entry)))) {
        throw new Error("Für den Vorgänger fehlt ein belegter Quellenverweis aus dem geprüften Master.");
      }
    }
    for (const target of event.targets) {
      const group = groups.get(taxonIdentityKey(target));
      if (!liveRecords(group).length) throw new Error("Für den bestätigten Nachfolger fehlt ein aktueller Quellenbeleg.");
      const targetEvidence = liveRecords(group).map((record) => ({ provider: record.provider,
        providerVersion: releases.find((release) => release.provider === record.provider)?.providerVersion,
        providerRecordId: record.providerRecordId }));
      targetEvidence.forEach((entry) => knownEvidence.add(evidenceKey(entry)));
      if (!targetEvidence.some((entry) => suppliedEvidence.has(evidenceKey(entry)))) {
        throw new Error("Für den Nachfolger fehlt ein belegter Quellenverweis aus dem neuen Quellenstand.");
      }
      const oldTargets = previousByKey.get(taxonIdentityKey(target)) || [];
      if (oldTargets.some((oldTarget) => !event.sources.some((source) => source.masterTaxonId === oldTarget.master_taxon_id))
          || (event.type !== "continuation" && previousState.taxa.has(target.masterTaxonId))) {
        throw new Error("Das Ziel ist bereits eine andere bestehende Identität. Diese muss ausdrücklich als Vorgänger einbezogen werden.");
      }
    }
    if ([...suppliedEvidence].some((entry) => !knownEvidence.has(entry))) {
      throw new Error("Die Identitätsentscheidung enthält einen nicht belegbaren Quellenverweis.");
    }
  }
  const state = identityRegistryState(registry);
  const byKey = new Map([...state.current.values()].map((entry) => [taxonIdentityKey(entry), entry]));
  const heldProjects = new Map();
  for (const entry of state.current.values()) ensureGroup(entry);
  moveAssignedProjects({ groups, projects, state, keyOf: projectKeyOf });

  // Historic source tuples cannot be resurrected by a hash or a retained project
  // name. In a same-name split, only fresh provider values may enter the new ID.
  const historicalNames = [...state.historical.values()].flatMap((entry) => [entry,
    ...(state.aliases.get(entry.masterTaxonId) || [])]);
  for (const historical of historicalNames) {
    const key = taxonIdentityKey(historical);
    const group = groups.get(key);
    if (!group) continue;
    const unresolvedProjects = group.projects.filter((entry) => !entry.identityAssignment);
    if (unresolvedProjects.length) heldProjects.set(historical.masterTaxonId,
      [...(heldProjects.get(historical.masterTaxonId) || []), ...unresolvedProjects]);
    group.projects = group.projects.filter((entry) => entry.identityAssignment);
    const currentId = byKey.get(key)?.masterTaxonId;
    group.corrections = group.corrections.filter((entry) => currentId && entry.identityBinding === currentId);
    group.previousTaxon = null;
    group.identityFresh = true;
    if (!byKey.has(key)) {
      if (liveRecords(group).length) throw new Error("Eine historische Art erscheint erneut als aktives Quelltaxon. Identität erneut prüfen.");
      groups.delete(key);
    }
  }

  // Carry project links and name preferences along a confirmed 1:1 continuation,
  // but do not reinterpret the project files or their URL/asset names.
  for (const [masterTaxonId, aliases] of state.aliases) {
    const current = state.current.get(masterTaxonId);
    if (!current) continue;
    const target = groups.get(taxonIdentityKey(current));
    for (const alias of aliases) {
      const key = taxonIdentityKey(alias);
      if (key === target.key) continue;
      const source = groups.get(key);
      if (!source) continue;
      if (liveRecords(source).some((record) => record.provider === "catalogue-of-life")) {
        throw new Error("Ein früherer wissenschaftlicher Name ist wieder als eigenes CoL-Taxon vorhanden. Identität erneut prüfen.");
      }
      target.projects.push(...source.projects);
      target.corrections.push(...source.corrections);
      groups.delete(key);
    }
  }
  for (const [key, entry] of byKey) {
    const group = groups.get(key);
    group.identityMasterTaxonId = entry.masterTaxonId;
    const previousTaxon = previousState.taxa.get(entry.masterTaxonId);
    group.previousTaxon = previousTaxon?.lifecycle_state !== "deprecated" ? previousTaxon || null : null;
    group.identityFresh = !group.previousTaxon;
    group.identityContinuation = (state.aliases.get(entry.masterTaxonId) || []).some((alias) => taxonIdentityKey(alias) !== key);
    for (const field of ["germanName", "englishName", "germanNameMode"]) {
      if (new Set(group.corrections.map((correction) => correction[field]).filter(Boolean)).size > 1) {
        throw new Error("Mehrere eigene Namenskorrekturen widersprechen sich nach der Identitätsfortführung. Bitte zuerst ausdrücklich klären.");
      }
    }
  }
  return { registry, state, heldProjects };
}

export function writeIdentityBuild(database, plan, timestamp) {
  writeIdentityRegistry(database, plan.registry);
  for (const historical of plan.state.historical.values()) {
    createMasterTaxon(database, { ...historical, lifecycleState: "deprecated", referenceState: "manual", createdAt: timestamp });
    for (const project of plan.heldProjects.get(historical.masterTaxonId) || []) {
      linkProjectTaxon(database, { projectTaxonKey: project.projectTaxonKey, masterTaxonId: historical.masterTaxonId,
        projectSlug: project.projectSlug, scientificNameAtLink: project.scientificName,
        linkState: "pending", linkedAt: timestamp });
    }
    if (plan.heldProjects.has(historical.masterTaxonId)) {
      addMasterConflict(database, { conflictId: `identity_${historical.masterTaxonId}`, masterTaxonId: historical.masterTaxonId,
        conflictType: "ambiguous-match", detectedAt: timestamp });
    }
  }
  for (const [masterTaxonId, aliases] of plan.state.aliases) {
    if (!plan.state.current.has(masterTaxonId)) continue;
    for (const alias of aliases) addMasterTaxonAlias(database, { masterTaxonId, name: alias.scientificName,
      rank: alias.rank, kingdom: alias.kingdom, aliasType: "synonym" });
  }
}
