import fs from "fs";           // Zugriff auf das Dateisystem zum Lesen/Schreiben von Dateien
import fetch from "node-fetch"; // fetch für HTTP-Requests in Node.js

// Artenliste einlesen (deutscher + wissenschaftlicher Name)
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// IUCN API Token aus GitHub Secrets oder Umgebungsvariablen
const IUCN_TOKEN = process.env.IUCN_TOKEN;

// Mapping der Status-Kategorien auf Deutsch + optional Icon-URL
// Hinweis: Die Icons funktionieren nur zuverlässig, wenn der API-Token gültig ist
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
    const speciesRes = await fetch(speciesUrl);
    const speciesJson = await speciesRes.json();
    const result = speciesJson.result?.[0] || {}; // Falls keine Daten vorhanden, leeres Objekt

    // Populationstrend abrufen
    const trendUrl = `https://apiv3.iucnredlist.org/api/v3/species/trends/${encodeURIComponent(species)}?token=${IUCN_TOKEN}`;
    const trendRes = await fetch(trendUrl);
    const trendJson = await trendRes.json();
    const trend = trendJson.result?.[0]?.trend || "nicht verfügbar"; // aussagekräftiger Fallback

    // Daten zusammenstellen
    return {
      status: result.category || "nicht verfügbar",                        // Gefährdungskategorie
      status_icon: statusMap[result.category]?.icon || "",                 // Status-Icon
      trend: trend,                                                         // Populationstrend
      mature_individuals: result.number_of_mature_individuals || "nicht verfügbar", // Anzahl erwachsener Individuen
      habitat: result.habitat || "nicht verfügbar",                        // Habitat/Ökologie
      range_map: result.range_map || "",                                    // Range Map URL
      updated: new Date().toISOString().slice(0,10)                         // Datum der letzten Aktualisierung
    };
  } catch (err) {
    // Fehlerbehandlung: Wenn API-Abfrage fehlschlägt
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
  const data = {};                     // Objekt für alle Arten

  for (const sp of speciesList) {      // Schleife über alle Arten
    const name = sp.scientific;        // Wissenschaftlicher Name als Key
    console.log(`Hole Daten für ${name}...`);
    const info = await fetchSpeciesData(name);  // API-Abfrage
    data[name] = info;                          // Daten speichern
  }

  // Schreiben in speciesData.json
  fs.writeFileSync("speciesData.json", JSON.stringify(data, null, 2));
  console.log("✅ speciesData.json erfolgreich aktualisiert!");
})();
