import fs from "fs";
import fetch from "node-fetch";

// 1. Liste der Arten
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// 2. Dein IUCN-API Token hier eintragen
const IUCN_TOKEN = process.env.IUCN_TOKEN || "DEIN_TOKEN_HIER";

// 3. Mapping Status auf Deutsch
const statusMap = {
  "LC": "nicht gefährdet",
  "NT": "gering gefährdet",
  "VU": "gefährdet",
  "EN": "stark gefährdet",
  "CR": "vom Aussterben bedroht",
  "EX": "ausgestorben",
  "EW": "in freier Wildbahn ausgestorben"
};

// 4. Hilfsfunktion: IUCN Daten abrufen
async function fetchSpeciesData(species) {
  try {
    const url = `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const res = await fetch(url);
    const json = await res.json();

    const result = json.result?.[0] || {};

    // Population Trend
    const trendUrl = `https://apiv3.iucnredlist.org/api/v3/species/trends/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const trendRes = await fetch(trendUrl);
    const trendJson = await trendRes.json();
    const trend = trendJson.result?.[0]?.trend || "n/a";

    return {
      status: result.category || "n/a",
      trend: trend,
      mature_individuals: result.number_of_mature_individuals || "n/a",
      habitat: result.habitat || "n/a",
      range_map: result.range_map || ""
    };
  } catch (err) {
    console.error(`Fehler bei ${species}:`, err);
    return {
      status: "n/a",
      trend: "n/a",
      mature_individuals: "n/a",
      habitat: "n/a",
      range_map: ""
    };
  }
}

// 5. Alle Arten abrufen und J
