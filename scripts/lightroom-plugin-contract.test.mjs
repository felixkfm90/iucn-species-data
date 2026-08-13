import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(
  ROOT,
  "lightroom-plugin",
  "FNWildlifeTaxonomy.lrplugin",
);

async function source(file) {
  return fs.readFile(path.join(PLUGIN_ROOT, file), "utf8");
}

test("Lightroom-Prototyp besitzt Manifest, deutsche Aktion und Metadatenvertrag", async () => {
  const info = await source("Info.lua");
  const metadata = await source("MetadataDefinition.lua");
  assert.match(info, /LrToolkitIdentifier\s*=\s*"de\.fnwildlifetravel\.taxonomy"/);
  assert.match(info, /Art und Taxonomie zuweisen/);
  assert.match(info, /LrMetadataProvider\s*=\s*"MetadataDefinition\.lua"/);
  for (const field of [
    "masterTaxonId",
    "projectTaxonId",
    "germanName",
    "englishName",
    "scientificName",
    "taxonRank",
    "taxonomyPath",
    "assignedAt",
  ]) {
    assert.match(metadata, new RegExp(`id\\s*=\\s*"${field}"`));
  }
  assert.doesNotMatch(metadata, /masterVersion|packageVersion|providerVersion/);
});

test("Plug-in nutzt nur den read-only Suchhelfer und Lightrooms Katalog-API", async () => {
  const helper = await source("TaxonomyHelper.lua");
  const assignment = await source("AssignTaxonomy.lua");
  const writer = await source("KeywordWriter.lua");
  assert.match(helper, /lightroom-search-helper\.mjs/);
  assert.match(helper, /--request=/);
  assert.match(helper, /--response=/);
  assert.match(helper, /local ok, result = pcall\(executeRequest\)/);
  assert.match(helper, /removeFile\(requestPath\)/);
  assert.match(helper, /removeFile\(responsePath\)/);
  assert.match(assignment, /catalog:getTargetPhotos\(\)/);
  assert.match(assignment, /command\s*=\s*"status"/);
  assert.match(assignment, /command\s*=\s*"search"/);
  assert.match(assignment, /command\s*=\s*"taxon"/);
  assert.match(writer, /catalog:withWriteAccessDo/);
  assert.match(writer, /catalog:createKeyword/);
  assert.match(writer, /photo:addKeyword/);
  assert.match(writer, /photo:setPropertyForPlugin/);
  assert.match(writer, /for _, entry in ipairs\(taxon\.hierarchy or \{\}\)/);
  const combined = `${helper}\n${assignment}\n${writer}`;
  assert.doesNotMatch(combined, /\.lrcat|sqlite3|taxonomy-search\.sqlite|\.xmp/i);
});

test("Abweichende vorhandene Taxonomie wird nicht still überschrieben", async () => {
  const writer = await source("KeywordWriter.lua");
  assert.match(writer, /getPropertyForPlugin\(_PLUGIN, "masterTaxonId"\)/);
  assert.match(writer, /existingId ~= taxon\.masterTaxonId/);
  assert.match(writer, /Der Prototyp überschreibt diese nicht/);
});
