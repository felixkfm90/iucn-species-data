/*
  update.js
  Ruft IUCN-Daten für jede Art ab und speichert die Ergebnisse in speciesData.json.
  Wichtig: IUCN_TOKEN muss über Umgebungsvariable gesetzt sein.
*/

import fs from "fs";
import fetch from "node-fetch";

// Artenliste einlesen
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// IUCN Token
const IUCN_TOKEN = process.env.IUCN_TOKEN;

// Status → Text + Icon
const statusMap = {
  "LC": { text: "nicht gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/LC.png" },
  "NT": { text: "gering gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/NT.png" },
  "VU": { text: "gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/VU.png" },
  "EN": { text: "stark gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/EN.png" },
  "CR": { text: "vom Aussterben bedroht", icon: "https://www.iucnredlist.org/static/images/categories/CR.png" },
  "EW": { text: "in freier Wildbahn ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EW.png" },
  "EX": { text: "ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EX.png" }
};

/*
  Ruft die Art-Daten von IUCN ab, inkl.:

  - Status
  - Icon
  - Populationstrend
  - Anzahl adulter Tiere
  - Range Map URL (falls vorhanden)
  - Aktualisierungsdatum
*/
async function fetchSpeciesData(scientificName) {
  try {
    console.log(`→ Hole Daten für ${scientificName}`);

    // Basisdaten
    const speciesUrl =
      `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(scientificName)}?token=${IUCN_TOKEN}`;
    const speciesRes = await fetch(speciesUrl);
    const speciesJson = await speciesRes.json();
    const result = speciesJson.result?.[0] || {};

    // Trend
    const trendUrl =
      `https://apiv3.iucnredlist.org/api/v3/species/trends/${encodeURIComponent(scientificName)}?token=${IUCN_TOKEN}`;
    const trendRes = await fetch(trendUrl);
    const trendJson = await trendRes.json();
    const trend = trendJson.result?.[0]?.trend || "n/a";

    return {
      status: result.category || "n/a",
      status_icon: statusMap[result.category]?.icon || "",
      trend: trend,
      mature_individuals: result.number_of_mature_individuals || "n/a",
      habitat: result.habitat || "n/a",
      range_map: result.range_map || "",
      updated: new Date().toISOString().slice(0, 10)
    };

  } catch (err) {
    console.error(`❌ Fehler bei ${scientificName}:`, err);

    // Fallbacks
    return {
      status: "n/a",
      status_icon: "",
      trend: "n/a",
      mature_individuals: "n/a",
      habitat: "n/a",
      range_map: "",
      updated: new Date().toISOString().slice(0, 10)
    };
  }
}

// Hauptprozess
(async () => {
  const output = {};

  // sequentiell (IUCN blockt sonst parallele Requests)
  for (const item of speciesList) {
    const scientific = item.scientific;
    output[scientific] = await fetchSpeciesData(scientific);
  }

  // JSON schreiben
  fs.writeFileSync("speciesData.json", JSON.stringify(output, null, 2));
  console.log("✔ speciesData.json aktualisiert!");
})();
