import assert from "node:assert/strict";
import test from "node:test";

import {
  searchGbifTaxa,
  searchINaturalistTaxa,
  searchWikidataTaxa,
  searchWormsTaxa,
} from "./taxonomy-supplement-providers.mjs";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

test("iNaturalist liefert getrennte deutsche und englische Ergänzungsnamen", async () => {
  const urls = [];
  const results = await searchINaturalistTaxa({
    query: "Panthera pardus",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      const locale = parsed.searchParams.get("locale");
      return jsonResponse({
        results: [{
          id: 41970,
          name: "Panthera pardus",
          preferred_common_name: locale === "de" ? "Leopard" : "Leopard",
        }],
      });
    },
  });

  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.hostname === "api.inaturalist.org"));
  assert.ok(results.some((entry) => entry.germanName === "Leopard"));
  assert.ok(results.some((entry) => entry.englishName === "Leopard"));
  assert.ok(results.every((entry) => entry.scientificName === "Panthera pardus"));
});

test("GBIF erkennt deutsche und englische ISO-639-3-Sprachcodes", async () => {
  const results = await searchGbifTaxa({
    query: "Panthera pardus",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/vernacularNames")) {
        return jsonResponse({
          results: [
            { language: "deu", vernacularName: "Leopard" },
            { language: "eng", vernacularName: "Leopard" },
          ],
        });
      }
      return jsonResponse({
        results: [{
          key: 5219404,
          acceptedKey: 5219404,
          rank: "SPECIES",
          accepted: "Panthera pardus (Linnaeus, 1758)",
        }],
      });
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].scientificName, "Panthera pardus");
  assert.equal(results[0].germanName, "Leopard");
  assert.equal(results[0].englishName, "Leopard");
  assert.equal(results[0].source, "GBIF");
});

test("WoRMS übernimmt gültige Namen und ger/eng-Vernakularnamen", async () => {
  const results = await searchWormsTaxa({
    query: "Delphinus delphis",
    kind: "scientific",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("AphiaVernacularsByAphiaID")) {
        return jsonResponse([
          { language_code: "ger", vernacular: "Gemeiner Delfin" },
          { language_code: "eng", vernacular: "Common dolphin" },
        ]);
      }
      return jsonResponse([{
        AphiaID: 137094,
        valid_AphiaID: 137094,
        rank: "Species",
        valid_name: "Delphinus delphis",
      }]);
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].germanName, "Gemeiner Delfin");
  assert.equal(results[0].englishName, "Common dolphin");
  assert.equal(results[0].source, "WoRMS");
});

test("Wikidata verwendet ausschließlich Taxonname P225 und Sprachlabels", async () => {
  const results = await searchWikidataTaxa({
    query: "Leopard",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("action") === "wbsearchentities") {
        return jsonResponse({ search: [{ id: "Q34706" }] });
      }
      return jsonResponse({
        entities: {
          Q34706: {
            labels: {
              de: { value: "Leopard" },
              en: { value: "Leopard" },
            },
            claims: {
              P225: [{
                mainsnak: {
                  datavalue: { value: "Panthera pardus" },
                },
              }],
            },
          },
        },
      });
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].scientificName, "Panthera pardus");
  assert.equal(results[0].germanName, "Leopard");
  assert.equal(results[0].englishName, "Leopard");
  assert.equal(results[0].source, "Wikidata");
});
