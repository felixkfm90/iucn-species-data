import fs from "fs";

// Artenliste einlesen
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// API-Token
const IUCN_TOKEN = process.env.IUCN_TOKEN;
if (!IUCN_TOKEN) {
  console.error("❌ Fehler: IUCN_TOKEN ist nicht gesetzt!");
  process.exit(1);
}

// Mapping der IUCN-Kategorien
const statusMap = {
  "LC": { text: "nicht gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/LC.png" },
  "NT": { text: "gering gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/NT.png" },
  "VU": { text: "gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/VU.png" },
  "EN": { text: "stark gefährdet", icon: "https://www.iucnredlist.org/static/images/categories/EN.png" },
  "CR": { text: "vom Aussterben bedroht", icon: "https://www.iucnredlist.org/static/images/categories/CR.png" },
  "EW": { text: "in freier Wildbahn ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EW.png" },
  "EX": { text: "ausgestorben", icon: "https://www.iucnredlist.org/static/images/categories/EX.png" }
};

// Schritt 1: Species-ID abrufen
async function getSpeciesId(scientificName) {
  const url = `https://apiv3.iucnredlist.org/api/v3/species/name/${encodeURIComponent(scientificName)}?token=${IUCN_TOKEN}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Node.js IUCN Script" }
    });

    if (!res.ok) {
      console.error(`❌ HTTP-Fehler ${res.status} für ${scientificName}`);
      return null;
    }

    const json = await res.json();
    if (json.result?.length) return json.result[0].taxonid || null;

    // Fallback: Subspecies auf Gattung + Art kürzen
    const baseName = scientificName.split(" ").slice(0, 2).join(" ");
    if (baseName !== scientificName) {
      console.log(`ℹ Versuch mit verkürztem Namen: ${baseName}`);
      return await getSpeciesId(baseName);
    }

    return null;
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen der ID für ${scientificName}:`, err);
    return null;
  }
}

// Schritt 2: Daten per ID holen
async function fetchSpeciesData(taxonId) {
  try {
    const speciesUrl = `https://apiv3.iucnredlist.org/api/v3/species/id/${taxonId}?token=${IUCN_TOKEN}`;
    const trendUrl = `https://apiv3.iucnredlist.org/api/v3/species/${taxonId}/population?token=${IUCN_TOKEN}`;

    const [speciesRes, trendRes] = await Promise.all([
      fetch(speciesUrl, { headers: { "User-Agent": "Node.js IUCN Script" } }),
      fetch(trendUrl, { headers: { "User-Agent": "Node.js IUCN Script" } })
    ]);

    if (!speciesRes.ok) throw new Error(`HTTP-Fehler ${speciesRes.status} bei species`);
    if (!trendRes.ok) throw new Error(`HTTP-Fehler ${trendRes.status} bei trend`);

    const speciesJson = await speciesRes.json();
    const trendJson = await trendRes.json();

    const s = speciesJson.result?.[0] || {};

    return {
      status: s.category || "nicht verfügbar",
      status_icon: statusMap[s.category]?.icon || "",
      trend: trendJson.result?.[0]?.trend || "nicht verfügbar",
      mature_individuals: s.number_of_mature_individuals || "nicht verfügbar",
      habitat: s.habitat || "nicht verfügbar",
      range_map: s.range || "",
      updated: new Date().toISOString().slice(0,10)
    };
  } catch (err) {
    console.error(`❌ Fehler beim Abruf der Artendaten:`, err);
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

// Hauptprozess
(async () => {
  const data = {};

  for (const sp of speciesList) {
    const scientific = sp.scientific;
    console.log(`🔎 Hole Daten für ${scientific}...`);

    const taxonId = await getSpeciesId(scientific);

    if (!taxonId) {
      console.log(`⚠ Keine ID gefunden für ${scientific}`);
      data[scientific] = {
        status: "nicht verfügbar",
        status_icon: "",
        trend: "nicht verfügbar",
        mature_individuals: "nicht verfügbar",
        habitat: "nicht verfügbar",
        range_map: "",
        updated: new Date().toISOString().slice(0,10)
      };
      continue;
    }

    const info = await fetchSpeciesData(taxonId);
    data[scientific] = info;
  }

  fs.writeFileSync("speciesData.json", JSON.stringify(data, null, 2));
  console.log("✅ speciesData.json erfolgreich aktualisiert!");
})();
