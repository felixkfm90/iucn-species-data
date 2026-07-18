import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildExplorerModel } from "../species-explorer/explorer-model.mjs";

const DEFAULT_OUTPUT = "docs/project-status.md";

function sortedSpeciesNames(species, predicate) {
  return species
    .filter(predicate)
    .map((entry) => entry.germanName)
    .sort((left, right) => left.localeCompare(right, "de"));
}

export async function buildProjectStatus(repoRoot = process.cwd()) {
  const model = await buildExplorerModel(repoRoot);
  const available = model.validation.assets.available;
  return {
    reportGeneratedAt: model.summary.reportGeneratedAt,
    counts: {
      input: model.summary.inputCount,
      active: model.summary.speciesCount,
      generated: model.summary.generatedCount,
      assetDirectories: model.validation.assets.completeSpeciesCount,
      maps: available.maps,
      sounds: available.sounds,
      credits: available.credits,
      spectrograms: available.spectrograms,
      portraits: available.portraits,
      assetProblems: model.validation.assets.issueSpeciesCount,
      validationProblems: model.validation.issueCount,
    },
    manualMaps: sortedSpeciesNames(model.species, (entry) => entry.isManualMap),
    ncSounds: sortedSpeciesNames(model.species, (entry) => entry.isNcSound),
    knownMissingSounds: sortedSpeciesNames(model.species, (entry) => entry.soundMissingKnown),
  };
}

function listOrNone(values) {
  if (!values.length) return "- Keine";
  return values.map((value) => `- ${value}`).join("\n");
}

export function renderProjectStatus(status) {
  const { counts } = status;
  return `<!-- Automatisch erzeugt durch scripts/project-status.mjs. Nicht manuell bearbeiten. -->
# Aktueller Projektstatus

Diese Datei ist die einzige dokumentarische Quelle für aktuelle Zähler und aktive Pflege- oder Hinweisliste.
Sie wird aus den produktiven JSON-Dateien, dem Explorer-Modell und den vorhandenen Assets erzeugt. Historische
Zahlen in datierten Audit- und Verlaufsdokumenten sind Zeitaufnahmen und kein aktueller Projektstatus.

Report-Datenstand: \`${status.reportGeneratedAt || "Unbekannt"}\`

| Bereich | Anzahl |
|---|---:|
| Eingaben in \`species_list.json\` | ${counts.input} |
| Aktive Arten | ${counts.active} |
| Arten in \`speciesData.json\` | ${counts.generated} |
| Vollständige Art-Assetordner | ${counts.assetDirectories} |
| Karten | ${counts.maps} |
| Sounds | ${counts.sounds} |
| Credits | ${counts.credits} |
| Spektrogramme | ${counts.spectrograms} |
| Artporträts | ${counts.portraits} |
| Assetprobleme | ${counts.assetProblems} |
| Validierungsprobleme | ${counts.validationProblems} |

## Manuell gepflegte Karten (${status.manualMaps.length})

${listOrNone(status.manualMaps)}

## Aktive NC-Soundlizenzen (${status.ncSounds.length})

${listOrNone(status.ncSounds)}

## Bewusst fehlende Tierstimmen (${status.knownMissingSounds.length})

${listOrNone(status.knownMissingSounds)}
`;
}

export async function syncProjectStatus({
  repoRoot = process.cwd(),
  output = DEFAULT_OUTPUT,
  check = false,
} = {}) {
  const status = await buildProjectStatus(repoRoot);
  const content = renderProjectStatus(status);
  const outputPath = path.resolve(repoRoot, output);
  if (check) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current.replace(/\r\n/g, "\n") !== content) {
      throw new Error(`${output} ist nicht aktuell. Bitte \`npm run status:sync\` ausführen.`);
    }
    return { status, output, changed: false };
  }
  await writeFile(outputPath, content, "utf8");
  return { status, output, changed: true };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const check = process.argv.includes("--check");
  try {
    const result = await syncProjectStatus({ check });
    console.log(check
      ? `Projektstatus ist aktuell: ${result.output}`
      : `Projektstatus aktualisiert: ${result.output}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
