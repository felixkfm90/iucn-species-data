import assert from "node:assert/strict";
import { benchmarkRows } from "./taxonomy-master-benchmark.mjs";

// Synthetic diversity, not a copy of the production catalogue or provider files.
export function pipelineFixture(count, scenario, version, kind = "single") {
  assert.ok(["single", "multi"].includes(kind), "Unbekannter Messbestand.");
  assert.ok(version === 1 || version === 2, "Ungültige Testgeneration.");
  const rows = benchmarkRows(count, scenario), importedAt = `2026-09-0${version}T12:00:00.000Z`;
  const providerSlices = kind === "single" ? [] : ["inaturalist", "gbif"].map((provider, providerIndex) => ({
    manifest: { provider, providerVersion: `BENCH-${provider}-${version}`, retrievedAt: importedAt },
    records: rows.filter((_, index) => providerIndex === 0 || index % 2 === 0).map((row) => ({
      providerRecordId: `${provider}-${row.providerRecordId}`, scientificName: row.scientificName,
      rank: row.rank, kingdom: row.kingdom, hierarchy: row.hierarchy, retrievedAt: importedAt,
      relevanceReasons: ["missing-name", "searched-taxon"], selectedForMaster: true,
      names: [
        { name: row.germanNames[0].name, language: "de", nameKind: "vernacular", preferred: true, verified: true },
        { name: `${provider} Nebenname ${row.providerRecordId}`, language: "de", nameKind: "vernacular", verified: true },
        { name: row.englishNames[0].name, language: "en", nameKind: "vernacular", preferred: true },
      ],
    })),
  }));
  return { rows, providerSlices, colRelease: { providerVersion: `PIPELINE-BENCH-${version}`, importedAt, recordCount: count } };
}
