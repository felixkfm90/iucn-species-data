/*
  update.mjs – IUCN v4 API mit genus_name + species_name
  • species_list.json: { "german": "...", "genus": "...", "species": "..." }
  • Holt Taxon + neuestes Assessment
  • Fallbacks, Logging und Rate-Limit enthalten
*/

import fs from "fs";
import fetch from "node-fetch";

const TOKEN = process.env.IUCN_TOKEN;
if (!TOKEN) {
  console.error("❌ IUCN_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
  process.exit(1);
}

const BASE = "https://api.iucnredlist.org/api/v4";
const RATE_LIMIT = 400; // ms Pause zwischen Requests

// Status → Text + Icon
const statusMap = {
  "LC": { text: "nicht gefährdet", icon: "https://upload.wikimedia.org/wikipedia/commons/8/84/LC_IUCN_3_1.svg" },
  "NT": { text: "gering gefährdet", icon: "https://upload.wikimedia.org/wikipedia/commons/f/f0/NT_IUCN_3_1.svg" },
  "VU": { text: "gefährdet", icon: "https://upload.wikimedia.org/wikipedia/commons/0/04/VU_IUCN_3_1.svg" },
  "EN": { text: "stark gefährdet", icon: "https://upload.wikimedia.org/wikipedia/commons/5/5d/EN_IUCN_3_1.svg" },
  "CR": { text: "vom Aussterben bedroht", icon: "https://upload.wikimedia.org/wikipedia/commons/1/16/CR_IUCN_3_1.svg" },
  "EW": { text: "in freier Wildbahn ausgestorben", icon: "https://upload.wikimedia.org/wikipedia/commons/6/64/EW_IUCN_3_1.svg" },
  "EX": { text: "ausgestorben", icon: "https://upload.wikimedia.org/wikipedia/commons/2/28/EX_IUCN_3_1.svg" },
  "DD": { text: "keine ausreichende Datenlage", icon: "https://upload.wikimedia.org/wikipedia/commons/0/02/DD_IUCN_3_1.svg" }
};

// Logging
function logError(msg) {
  fs.appendFileSync("errors.log", `[${new Date().toISOString()}] ${msg}\n`);
}

// Fallback für fehlende Daten
function emptyEntry(name) {
  return {
    resolved_name: name,
    status: "n/a",
    status_icon: "",
    assessment_url: "",
    year_published: "n/a",
    updated: new Date().toISOString().slice(0, 10)
  };
}

// GET mit Token
async function iucnGET(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Authorization": TOKEN, "Accept": "application/json" }
  });
  if (!res.ok) return null;
  return res.json();
}

// Eine Art abrufen
async function fetchSpecies(genus, species) {
  const scientific = `${genus} ${species}`;
  try {
    console.log(`→ Suche Taxon für ${scientific}`);

    const taxonData = await iucnGET(`/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`);
    if (!taxonData?.taxon) {
      console.error(`❌ Kein Treffer für ${scientific}`);
      logError(`Kein Treffer: ${scientific}`);
      return emptyEntry(scientific);
    }

    const taxon = taxonData.taxon;
    const resolvedName = taxon.scientific_name;

    if (!taxonData.assessments?.length) {
      console.error(`❌ Keine Assessment IDs für ${resolvedName}`);
      logError(`Keine Assessment IDs: ${resolvedName}`);
      return emptyEntry(resolvedName);
    }

    // Nimm das erste/latest Assessment
    const assessment = taxonData.assessments[0];
    const assessment_id = assessment.assessment_id;
    const { trend, category } = await getAssessment(assessment_id);

    return {
      resolved_name: resolvedName,
      status: assessment.red_list_category_code || "n/a",
      trend: trend,
      category: category,
      year_published: assessment.year_published || "n/a",
      updated: new Date().toISOString().slice(0, 10)
    };

  } catch (err) {
    console.error(`❌ Fehler bei ${scientific}:`, err);
    logError(`Fehler bei ${scientific}: ${err.message}`);
    return emptyEntry(scientific);
  }
}

async function getAssessment(assessment_id) {
  const res = await fetch(`https://api.iucnredlist.org/api/v4/assessment/${assessment_id}`, {
    headers: {
      "Accept": "application/json",
      "Authorization": TOKEN
    }
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status} für Assessment-ID ${assessment_id}`);
    return { trend: "n/a", category: "n/a" };
  }

  const data = await res.json();
  const assessment = data?.population_trend ? data : data?.result?.[0];

  if (!assessment) {
    console.error(`❌ Keine Assessment-Daten für ID ${assessment_id}`);
    return { trend: "n/a", category: "n/a" };
  }
  const trend = assessment.population_trend?.description?.en || "n/a";
  const category = assessment.red_list_category?.description?.en || "n/a";

  return { trend, category };
}


// Hauptprozess
(async () => {
  const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
  const output = {};

  for (const s of speciesList) {
    output[`${s.genus} ${s.species}`] = await fetchSpecies(s.genus, s.species);
    await new Promise(r => setTimeout(r, RATE_LIMIT));
  }

  fs.writeFileSync("speciesData.json", JSON.stringify(output, null, 2));
  console.log("✔ speciesData.json aktualisiert!");
})();
