import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildEditChanges,
  buildNewSpeciesEntry,
  compareReportList,
  compareValues,
  editChangesRequirePipelineTransfer,
  findEditableSpecies,
  findInputIndex,
  findNewSpeciesCollisions,
  formatTaxonomyName,
  isMissingValue,
  normalizeScientificName,
  publicCleanupPlan,
  publicPipelinePlan,
  replaceReportSpeciesName,
  sanitizeAssetName,
  scientificKey,
  updateAssetMetadataNames,
  validateEditableValues,
  validateGermanRename,
  validateNewSpeciesValues,
  validateScientificRename,
  valueOrUnknown,
} from "./species-model.mjs";

async function createTemporaryRepo(context) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "iucn-species-model-"));
  context.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

function baseSpecies(overrides = {}) {
  return {
    id: "turdusmerula",
    slug: "turdusmerula",
    safeName: "Amsel",
    germanName: "Amsel",
    scientificName: "Turdus merula",
    taxonomy: { genus: "Turdus", species: "merula" },
    manual: {
      size: "ca. 23,5-29 cm",
      weight: "ca. 80-110 g",
      lifeExpectancy: "ca. 3 Jahre",
    },
    ...overrides,
  };
}

test("Namen, Assetnamen und Taxonomiewerte werden stabil normalisiert", () => {
  assert.equal(sanitizeAssetName("Gr\u00fcner Leguan & Co."), "Gruener Leguan and Co");
  assert.equal(scientificKey("Turdus", "Merula"), "turdus merula");
  assert.equal(valueOrUnknown(""), "Unbekannt");
  assert.equal(formatTaxonomyName("PASSERIFORMES"), "Passeriformes");

  const normalized = normalizeScientificName("tURDUS MERULA");
  assert.deepEqual(normalized, {
    scientificName: "Turdus merula",
    genus: "Turdus",
    species: "merula",
    slug: "turdusmerula",
    errors: [],
  });
  assert.equal(normalizeScientificName("Turdus").errors.length, 1);
});

test("Neue Arten werden feldweise validiert und in das Eingabeformat abgeleitet", () => {
  const validation = validateNewSpeciesValues({
    german: "Amsel",
    scientificName: "tURDUS MERULA",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    lifeExpectancy: "ca. 3 Jahre",
  });
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.fieldErrors, {});
  assert.equal(validation.values.scientificName, "Turdus merula");

  const built = buildNewSpeciesEntry(validation.values);
  assert.deepEqual(built.entry, {
    german: "Amsel",
    genus: "Turdus",
    species: "merula",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    life_expectancy: "ca. 3 Jahre",
  });
  assert.deepEqual(built.derived, {
    scientificName: "Turdus merula",
    slug: "turdusmerula",
    safeName: "Amsel",
  });

  const invalid = validateNewSpeciesValues({ scientificName: "nur-ein-wort" });
  assert.ok(invalid.errors.length >= 4);
  assert.ok(invalid.fieldErrors.german.length >= 1);
  assert.ok(invalid.fieldErrors.scientificName.length >= 1);
});

test("Kollisionen beruecksichtigen Eingabeliste, Modell und vorhandenen Assetordner", async (context) => {
  const repoRoot = await createTemporaryRepo(context);
  await mkdir(path.join(repoRoot, "species-assets", "Sperling"), { recursive: true });
  const entry = {
    german: "Sperling",
    genus: "Passer",
    species: "domesticus",
  };
  const derived = {
    scientificName: "Passer domesticus",
    slug: "passerdomesticus",
    safeName: "Sperling",
  };
  const collisions = findNewSpeciesCollisions({
    inputList: [{ german: "Sperling", genus: "Passer", species: "domesticus" }],
    model: { species: [] },
    entry,
    derived,
    repoRoot,
  });
  assert.equal(collisions.length, 3);
  assert.ok(collisions.some((message) => message.includes("Wissenschaftlicher Name")));
  assert.ok(collisions.some((message) => message.includes("Deutscher Name")));
  assert.ok(collisions.some((message) => message.includes("Assetordner")));
});

test("Bearbeitungsdiffs und Umbenennungen erkennen gezielte Aenderungen und Kollisionen", async (context) => {
  const repoRoot = await createTemporaryRepo(context);
  const species = baseSpecies();
  const inputEntry = {
    german: "Amsel",
    genus: "Turdus",
    species: "merula",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    life_expectancy: "ca. 3 Jahre",
  };
  const inputList = [
    inputEntry,
    { german: "Singdrossel", genus: "Turdus", species: "philomelos" },
  ];
  const model = {
    species: [
      species,
      baseSpecies({
        id: "turdusphilomelos",
        slug: "turdusphilomelos",
        safeName: "Singdrossel",
        germanName: "Singdrossel",
        scientificName: "Turdus philomelos",
        taxonomy: { genus: "Turdus", species: "philomelos" },
      }),
    ],
  };

  const validation = validateEditableValues({
    germanName: "Schwarzdrossel",
    scientificName: "Turdus merula",
    size: "ca. 24-30 cm",
    weight: "ca. 80-110 g",
    lifeExpectancy: "ca. 3 Jahre",
  }, species);
  assert.deepEqual(validation.errors, []);
  const changes = buildEditChanges(inputEntry, validation.values);
  assert.deepEqual(changes.map(({ key }) => key), ["germanName", "size"]);
  assert.equal(editChangesRequirePipelineTransfer(changes), true);
  assert.equal(editChangesRequirePipelineTransfer(changes.filter(({ key }) => key === "germanName")), false);
  assert.equal(findEditableSpecies(model, species.id), species);
  assert.equal(findInputIndex(inputList, species), 0);

  assert.equal(validateGermanRename({
    inputList,
    model,
    species,
    newGermanName: "Singdrossel",
    repoRoot,
  }).length, 3);
  assert.equal(validateScientificRename({
    inputList,
    model,
    species,
    values: {
      genus: "Turdus",
      species: "philomelos",
      scientificName: "Turdus philomelos",
      slug: "turdusphilomelos",
    },
  }).length, 3);
});

test("Reportvergleiche, Metadaten und oeffentliche Plaene bleiben auf API-Daten begrenzt", () => {
  const report = {
    missing: {
      maps: ["Amsel"],
      speciesAssets: [{ german: "Amsel", safeName: "Amsel" }],
    },
    ncSoundLicensesAll: ["Amsel"],
  };
  replaceReportSpeciesName(report, "Amsel", "Schwarzdrossel", "Amsel", "Schwarzdrossel");
  assert.deepEqual(report.missing.maps, ["Schwarzdrossel"]);
  assert.deepEqual(report.missing.speciesAssets, [{
    german: "Schwarzdrossel",
    safeName: "Schwarzdrossel",
  }]);
  assert.deepEqual(report.ncSoundLicensesAll, ["Schwarzdrossel"]);

  const metadata = updateAssetMetadataNames({
    german_name: "Amsel",
    scientificName: "Turdus merula",
    source: "Test",
  }, {
    germanName: "Schwarzdrossel",
    scientificName: "Turdus merula",
  });
  assert.deepEqual(metadata, {
    german_name: "Schwarzdrossel",
    scientificName: "Turdus merula",
    source: "Test",
  });
  assert.equal(isMissingValue("n/a"), true);
  assert.equal(compareValues("Groesse", "1", "1"), null);
  assert.equal(compareValues("Groesse", "1", "2").generated, "2");
  assert.deepEqual(compareReportList("maps", "Karten", ["Amsel"], ["Drossel"]), {
    key: "maps",
    label: "Karten",
    reportedCount: 1,
    actualCount: 1,
    missingFromReport: ["Drossel"],
    staleInReport: ["Amsel"],
    ok: false,
  });

  const pipelinePlan = publicPipelinePlan({
    mode: "missing",
    inputCount: 2,
    targetCount: 1,
    targets: [{
      slug: "turdusmerula",
      safeName: "Amsel",
      germanName: "Amsel",
      scientificName: "Turdus merula",
      reasons: ["Sound fehlt"],
      internal: "nicht ausgeben",
    }],
    removedCount: 0,
    removed: [],
    hasWork: true,
  });
  assert.equal(pipelinePlan.targets[0].internal, undefined);
  assert.equal(pipelinePlan.affectedSpeciesCount, 1);
  assert.equal(pipelinePlan.pendingFileCount, 0);

  assert.deepEqual(publicCleanupPlan({
    obsoleteData: ["Amsel"],
    obsoleteAssetDirectories: [],
    obsoleteAssessmentKeys: ["Amsel"],
    obsoleteOverrideKeys: [],
    obsoleteTaxonomyOverrideKeys: [],
    reclaimableBytes: 42,
    hasWork: true,
  }), {
    mode: "cleanup",
    targetCount: 2,
    obsoleteData: ["Amsel"],
    obsoleteAssetDirectories: [],
    obsoleteAssessmentKeys: ["Amsel"],
    obsoleteOverrideKeys: [],
    obsoleteTaxonomyOverrideKeys: [],
    reclaimableBytes: 42,
    hasWork: true,
  });
});
