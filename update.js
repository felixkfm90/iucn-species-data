import fs from "fs"; // Zugriff auf das Dateisystem

// Artenliste einlesen (deutscher + wissenschaftlicher Name)
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// IUCN API Token aus GitHub Secrets oder Umgebungsvariablen
const IUCN_TOKEN = secrets.env.IUCN_TOKEN;

// Mapping der Status-Kategorien auf Deutsch + optional Icon-URL
const statusMap = {
  "LC": { text: "nicht gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/LC.png" },
  "NT": { text: "gering gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/NT.png" },
  "VU": { text: "gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/VU.png" },
  "EN": { text: "stark gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/EN.png" },
  "CR": { text: "vom Aussterben bedroht", icon: "https://www.iucnredlist.org/static/images/categories/CR.png" },
  "EW": { text: "in freier Wildbahn ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EW.png" },
  "EX": { text: "ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EX.png" }
};

// Funktion: Daten für eine einzelne Art von der IUCN API abrufen
async function fetchSpeciesData(species) {
  try {
    // Allgemeine Artinformationen abrufen
    const speciesUrl = `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const speciesRes = await fetch(speciesUrl); // native fetch
    const speciesJson = await speciesRes.json();
    const result = speciesJson.result?.[0] || {};

    // Populationstrend abrufen
    const trendUrl = `https://apiv3.iucnredlist.org/api/v3/species/trends/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const trendRes = await fetch(trendUrl);
    const trendJson = await trendRes.json();
    const trend = trendJson.result?.[0]?.trend || "nicht verfügbar";

    // Daten zusammenstellen
    return {
      status: result.category || "nicht verfügbar",
      status_icon: statusMap[result.category]?.icon || "",
      trend: trend,
      mature_individuals: result.number_of_mature_individuals || "nicht verfügbar",
      habitat: result.habitat || "nicht verfügbar",
      range_map: result.range_map || "",
      updated: new Date().toISOString().slice(0,10)
    };
  } catch (err) {
    console.error(`Fehler bei ${species}:`, err);
    return {
      status: "nicht verfügbar",
      status_icon: "",
      trend: "nicht verfügbar",
      mature_individuals: "nicht verfügbar",
      habitat: "nicht verfügbar",
      range_map: "",
      updated: new Date().toISOString().slice(0,10)
    };
  }
}

// Hauptblock: Alle Arten durchgehen und JSON schreiben
(async () => {
  const data = {};

  for (const sp of speciesList) {
    const name = sp.scientific;
    console.log(`Hole Daten für ${name}...`);
    const info = await fetchSpeciesData(name);
    data[name] = info;
  }

  fs.writeFileSync("speciesData.json", JSON.stringify(data, null, 2));
  console.log("✅ speciesData.json erfolgreich aktualisiert!");
})();
