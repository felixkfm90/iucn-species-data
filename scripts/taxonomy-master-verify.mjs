import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { openTaxonomyMasterStore } from "../species-explorer/taxonomy-master-store.mjs";
import { defaultTaxonomyRoot } from "../species-explorer/taxonomy-storage.mjs";
import { taxonomyMasterMigrationInternals } from "./taxonomy-master-migrate.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

function optionValue(args, name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = args.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function compactExample(taxon) {
  return {
    masterTaxonId: taxon.masterTaxonId,
    scientificName: taxon.acceptedScientificName,
    germanName: taxon.germanNames?.[0]?.name || null,
    englishName: taxon.englishNames?.[0]?.name || null,
    rank: taxon.rank,
    kingdom: taxon.kingdom,
    referenceState: taxon.referenceState,
    statuses: taxon.masterStatuses?.map((entry) => entry.id) || [],
    hierarchy: taxon.hierarchy?.map((entry) => ({
      rank: entry.rank,
      scientificName: entry.scientificName || entry.scientific_name,
      displayName: entry.displayName || entry.label || "",
    })) || [],
    providers: taxon.providers?.map((entry) => ({
      provider: entry.provider,
      providerRecordId: entry.providerRecordId,
      providerVersion: entry.providerVersion,
      matchState: entry.matchState,
    })) || [],
    projectSlugs: taxon.projectLinks?.map((entry) => entry.project_slug) || [],
  };
}

function exactSearch(store, { query, kind, language = "all", scientificName }) {
  const startedAt = performance.now();
  const search = store.search({
    query,
    kind,
    language,
    kingdom: "Animalia",
    rank: "species",
    limit: 20,
  });
  const elapsedMs = performance.now() - startedAt;
  const match = search.results.find((entry) => (
    entry.acceptedScientificName === scientificName
  ));
  return {
    query,
    kind,
    language,
    expectedScientificName: scientificName,
    found: Boolean(match),
    matchedTerm: match?.matchedTerm || null,
    resultCount: search.results.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
  };
}

export async function verifyActiveTaxonomyMaster({
  taxonomyRoot = defaultTaxonomyRoot(),
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const normalizedRoot = path.resolve(taxonomyRoot);
  const species = taxonomyMasterMigrationInternals.projectSpecies(
    JSON.parse(await fs.readFile(path.join(repoRoot, "species_list.json"), "utf8")),
  );
  const linkedSpecies = await taxonomyMasterMigrationInternals.verifyStore({
    taxonomyRoot: normalizedRoot,
    species,
    slot: "active",
  });

  const openingStartedAt = performance.now();
  const store = await openTaxonomyMasterStore({ taxonomyRoot: normalizedRoot });
  const openingMs = performance.now() - openingStartedAt;
  if (!store || store.available === false) {
    throw new Error("Die aktive Taxonomie-Masterdatenbank ist nicht verfügbar.");
  }
  try {
    const requiredScientificNames = [
      "Sciurus vulgaris",
      "Coracias caudatus",
      "Panthera pardus",
      "Calidris alpina",
    ];
    const examples = {};
    for (const scientificName of requiredScientificNames) {
      const found = store.findTaxonByScientificName(scientificName, {
        rank: "species",
        kingdom: "Animalia",
      });
      if (!found) throw new Error(`${scientificName} fehlt in der aktiven Masterdatenbank.`);
      const detail = store.taxon(found.masterTaxonId);
      if (!detail) throw new Error(`${scientificName} besitzt keinen lesbaren Masterdatensatz.`);
      examples[scientificName] = compactExample(detail);
    }

    const searches = [
      exactSearch(store, {
        query: "Eurasisches Eichhörnchen",
        kind: "vernacular",
        language: "de",
        scientificName: "Sciurus vulgaris",
      }),
      exactSearch(store, {
        query: "Lilac-breasted Roller",
        kind: "vernacular",
        language: "en",
        scientificName: "Coracias caudatus",
      }),
      exactSearch(store, {
        query: "Panthera pardus",
        kind: "scientific",
        scientificName: "Panthera pardus",
      }),
      exactSearch(store, {
        query: "Calidris alpina",
        kind: "scientific",
        scientificName: "Calidris alpina",
      }),
    ];

    const sciurus = examples["Sciurus vulgaris"];
    const failures = [];
    if (linkedSpecies.missing.length) failures.push("Projektarten fehlen im Masterbestand.");
    if (linkedSpecies.projectLinkMismatches.length) failures.push("Projektverknüpfungen sind unvollständig.");
    if (!sciurus.statuses.includes("col-reference-gap") || sciurus.referenceState !== "reference-gap") {
      failures.push("Sciurus vulgaris ist nicht als CoL-Referenzlücke gekennzeichnet.");
    }
    if (searches.some((entry) => !entry.found)) failures.push("Mindestens eine Namensrichtung ist offline nicht auffindbar.");

    const report = {
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      taxonomyRoot: normalizedRoot,
      status: store.status(),
      openingMs: Number(openingMs.toFixed(2)),
      linkedSpecies,
      kingdoms: store.kingdoms(),
      examples,
      searches,
      failures,
      successful: failures.length === 0,
    };
    if (failures.length) throw Object.assign(new Error(failures.join(" ")), { report });
    return report;
  } finally {
    store.close();
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const taxonomyRoot = optionValue(process.argv.slice(2), "taxonomy-root", defaultTaxonomyRoot());
  const repoRoot = optionValue(process.argv.slice(2), "repo-root", DEFAULT_REPO_ROOT);
  const json = process.argv.includes("--json");
  verifyActiveTaxonomyMaster({ taxonomyRoot, repoRoot }).then((report) => {
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("Aktive Taxonomie-Masterdatenbank erfolgreich geprüft.");
      console.log(`Projektarten: ${report.linkedSpecies.checkedSpecies}/${report.linkedSpecies.checkedSpecies}`);
      console.log(`Öffnen: ${report.openingMs} ms; Projektabgleich: ${report.linkedSpecies.elapsedMs} ms`);
      console.log(`Beispiele: ${Object.keys(report.examples).join(", ")}`);
    }
  }).catch((error) => {
    console.error(`Taxonomie-Masterprüfung fehlgeschlagen: ${error.message}`);
    if (json && error.report) console.error(JSON.stringify(error.report, null, 2));
    process.exitCode = 1;
  });
}
