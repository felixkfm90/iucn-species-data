import fs from "fs";
import fetch from "node-fetch";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
const IUCN_TOKEN = process.env.IUCN_TOKEN;

const statusMap = {
  "LC": { text: "nicht gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/LC.png" },
  "NT": { text: "gering gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/NT.png" },
  "VU": { text: "gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/VU.png" },
  "EN": { text: "stark gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/EN.png" },
  "CR": { text: "vom Aussterben bedroht", icon: "https://www.iucnredlist.org/static/images/categories/CR.png" },
  "EW": { text: "in freier Wildbahn ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EW.png" },
  "EX": { text: "ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EX.png" }
};

async function fetchSpeciesData(species) {
  try {
    const url = `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const res = await fetch(url);
    const json = await res.json();
    const result = json.result?.[0] || {};

    // Populationstrend
    const trendUrl = `https://apiv3.iucnredlist.org/api/v3/species/trends/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const trendRes = await fetch(trendUrl);
    const trendJson = await trendRes.json();
    const trend = trendJson.result?.[0]?.trend || "n/a";
    
    //Abruf der Art- Daten
    return {
      status: result.category || "n/a",
      status_icon: statusMap[result.category]?.icon || "",
      trend: trend,
      mature_individuals: result.number_of_mature_individuals || "n/a",
      habitat: result.habitat || "n/a",
      range_map: result.range_map || "",
      updated: new Date().toISOString().slice(0,10)
    };
  } catch (err) {
    console.error(`Fehler bei ${species}:`, err);
    return {
      status: "n/a",
      trend: "n/a",
      mature_individuals: "n/a",
      habitat: "n/a",
      range_map: "",
      updated: new Date().toISOString().slice(0,10)
    };
  }
}

(async () => {
  const data = {};
  for (const sp of speciesList) {
    const name = sp.scientific;
    console.log(`Hole Daten für ${name}...`);
    const info = await fetchSpeciesData(name);
    data[name] = info;
  }

  fs.writeFileSync("speciesData.json", JSON.stringify(data, null, 2));
  console.log("✅ speciesData.json aktualisiert!");
})();
