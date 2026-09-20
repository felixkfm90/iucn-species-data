// Explicit project decisions are part of the immutable identity event. This
// module does not edit species_list.json, generated website data, slugs or assets.
const text = (value) => typeof value === "string" ? value.normalize("NFKC").trim() : "";

export function normalizeIdentityProjectAssignments(value = []) {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Die Projektzuordnung ist ungültig oder zu groß.");
  const assignments = value.map((entry) => ({ projectTaxonKey: text(entry?.projectTaxonKey),
    projectSlug: text(entry?.projectSlug), scientificNameAtLink: text(entry?.scientificNameAtLink),
    sourceMasterTaxonId: text(entry?.sourceMasterTaxonId), targetKey: text(entry?.targetKey),
    namePolicy: text(entry?.namePolicy) }));
  for (const entry of assignments) {
    if (!entry.projectTaxonKey || entry.projectTaxonKey.length > 300 || !entry.projectSlug
        || !entry.scientificNameAtLink || !/^mtx_[a-f0-9]{32}$/.test(entry.sourceMasterTaxonId)
        || !entry.targetKey || entry.namePolicy !== "keep-project-local") {
      throw new Error("Projekt, Vorgänger, Nachfolger und das Beibehalten der Projekttexte müssen ausdrücklich bestätigt werden.");
    }
  }
  if (new Set(assignments.map((entry) => entry.projectTaxonKey)).size !== assignments.length) {
    throw new Error("Eine Projektart darf in einem Fall nur einem Nachfolger zugeordnet werden.");
  }
  return assignments.sort((a, b) => a.projectTaxonKey.localeCompare(b.projectTaxonKey));
}

export function checkIdentityProjectAssignments(event, projectState, keyOf) {
  for (const assignment of normalizeIdentityProjectAssignments(event.projectAssignments)) {
    const target = event.targets.find((entry) => keyOf(entry) === assignment.targetKey);
    const previous = projectState.get(assignment.projectTaxonKey);
    if (event.type === "continuation" || !target
        || !event.sources.some((source) => source.masterTaxonId === assignment.sourceMasterTaxonId)
        || (previous && previous.targetMasterTaxonId !== assignment.sourceMasterTaxonId)) {
      throw new Error("Die Projekt-Nachfolgerzuordnung passt nicht zur bestätigten Identitätskette.");
    }
    projectState.set(assignment.projectTaxonKey, { ...assignment, targetMasterTaxonId: target.masterTaxonId });
  }
}

export function validateProjectAssignmentsAgainstActive(event, previousState) {
  if (event.type === "continuation") return;
  const expected = event.sources.flatMap((source) => previousState.projectsFor(source.masterTaxonId)
    .map((project) => ({ ...project, sourceMasterTaxonId: source.masterTaxonId })));
  const assignments = event.projectAssignments || [];
  if (assignments.length !== expected.length || expected.some((project) => !assignments.some((entry) =>
    entry.projectTaxonKey === project.projectTaxonKey && entry.projectSlug === project.projectSlug
      && entry.scientificNameAtLink === project.scientificNameAtLink
      && entry.sourceMasterTaxonId === project.sourceMasterTaxonId))) {
    throw new Error("Für jede betroffene Projektart ist eine aktuelle, ausdrücklich bestätigte Nachfolgerzuordnung erforderlich.");
  }
}

export function moveAssignedProjects({ groups, projects, state, keyOf }) {
  for (const project of projects) {
    const binding = state.projectAssignments.get(project.projectTaxonKey);
    if (!binding) continue;
    if (project.projectSlug !== binding.projectSlug || project.scientificName !== binding.scientificNameAtLink) {
      throw new Error("Die Projektidentität einer bestätigten Nachfolgerzuordnung hat sich geändert. Bitte erneut prüfen.");
    }
    const target = state.current.get(binding.targetMasterTaxonId);
    if (!target) throw new Error("Der bestätigte Projekt-Nachfolger ist inzwischen historisch. Bitte die nächste Zuordnung ausdrücklich prüfen.");
    const sourceGroup = groups.get(keyOf(project));
    const targetGroup = groups.get(keyOf(target));
    if (!sourceGroup || !targetGroup) throw new Error("Die bestätigte Projektzuordnung ist im Kandidaten nicht vollständig abbildbar.");
    sourceGroup.projects = sourceGroup.projects.filter((entry) => entry.projectTaxonKey !== project.projectTaxonKey);
    targetGroup.projects.push({ ...project, identityAssignment: true });
  }
}
