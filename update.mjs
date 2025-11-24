import fs from "fs";
import path from "path";
import fetch from "node-fetch";

//Pfad für Karten festlegen oder Ordner erstellen
const DIR = "./Verbreitungskarten";
if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR);
}


//IUCN Token abrufen und speichern
const TOKEN = process.env.IUCN_TOKEN;
if (!TOKEN) {
  console.error("❌ IUCN_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
  process.exit(1);
}

//Basis-URL festlegen
const BASE = "https://api.iucnredlist.org/api/v4";

// ms Pause zwischen API-Requests
const RATE_LIMIT = 400;

// Assessment ID tracken
const ASSESSMENT_TRACK_FILE = "./lastSavedAssessmentId.json";
let lastSavedAssessmentId = {};
if (fs.existsSync(ASSESSMENT_TRACK_FILE)) {
  lastSavedAssessmentId = JSON.parse(fs.readFileSync(ASSESSMENT_TRACK_FILE, "utf8"));
}

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
  fs.appendFileSync(
    "errors.log",
    `[${new Date().toISOString()}] ${msg}\n`
  );
}

// Fallback für fehlende Daten
function emptyEntry(name) {
  return {
    "Wissenschaftlicher Name": name,
    "Deutscher Name": name,
    "Assessment ID": "n/a",
    Status: "n/a",
    Trend: "n/a",
    Kategory: "n/a",
    "Letztes IUCN Update": "n/a",
    "Daten abgerufen": new Date().toISOString().slice(0, 10)
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

//Assessment ID abrufen
async function getAssessmentData(assessmentId) {
  try {
    const res = await fetch(`${BASE}/assessment/${assessmentId}`, {
      headers: { "Authorization": TOKEN, "Accept": "application/json" }
    });

    if (!res.ok) return { trend: "n/a", category: "n/a" };

    const data = await res.json();
    const assessment = data.population_trend
      ? data
      : data.result
        ? data.result[0]
        : null;

    if (!assessment) return { trend: "n/a", category: "n/a" };

    const trend = assessment.population_trend?.description?.en || "n/a";
    const category = assessment.red_list_category?.description?.en || "n/a";

    return { trend, category };

  } catch (err) {
    logError("Fehler bei Assessment " + assessmentId + ": " + err.message);
    return { trend: "n/a", category: "n/a" };
  }
}

// Eine Art abrufen
async function fetchSpeciesData(genus, species, german) {
  const scientific = `${genus} ${species}`;
  try {
    console.log(`→ Suche Taxon für ${scientific}`);

    const taxonData = await iucnGET(
      `/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`
    );

    if (!taxonData?.taxon) {
      console.error(`❌ Kein Treffer für ${scientific}`);
      logError("Kein Treffer: " + scientific);
      return emptyEntry(scientific);
    }

    const taxon = taxonData.taxon;
    const resolvedName = taxon.scientific_name;

    const globalAssessment = taxonData.assessments?.find(a =>
      a.scopes?.some(s => s.description?.en === "Global")
    );

    if (!globalAssessment) {
      console.error(`❌ Keine globale Assessment-ID für ${resolvedName}`);
      logError("Keine globale Assessment-ID: " + resolvedName);
      return emptyEntry(resolvedName);
    }

    const assessmentId = globalAssessment.assessment_id;
    const assessmentInfo = await getAssessmentData(assessmentId);

    return {
      "Wissenschaftlicher Name": resolvedName,
      "Deutscher Name": german,
      "Assessment ID": assessmentId,
      Status: globalAssessment.red_list_category_code || "n/a",
      Trend: assessmentInfo.trend,
      Kategory: assessmentInfo.category,
      "Letztes IUCN Update": globalAssessment.year_published || "n/a",
      "Daten abgerufen": new Date().toISOString().slice(0, 10)
    };

  } catch (err) {
    console.error(`❌ Fehler bei ${scientific}: ${err}`);
    logError("Fehler bei " + scientific + ": " + err.message);
    return emptyEntry(scientific);
  }
}

// Verbreitungskarten herunterladen
export async function downloadMaps(speciesData) {
  for (const s of speciesData) {
    const name = s["Deutscher Name"] || s["Wissenschaftlicher Name"];
    const assessmentId = s["Assessment ID"];
    if (!assessmentId || assessmentId === "n/a") {
      console.log(`⚠ Überspringe ${name}, keine gültige Assessment-ID.`);
      continue;
    }

    const filePath = path.join(DIR, `${name}.jpg`);

    // Prüfen, ob Karte schon aktuell ist
    if (fs.existsSync(filePath) && lastSavedAssessmentId[name] === assessmentId) {
      console.log(`ℹ Karte für ${name} ist bereits aktuell, überspringe Download.`);
      continue;
    }

    const url = `https://www.iucnredlist.org/api/v4/assessments/${assessmentId}/distribution_map/jpg`;
    console.log(`→ Lade Karte für ${name} (${assessmentId})`);

    try {
      const res = await fetch(url, {
        headers: {
          "Accept": "image/jpeg",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      if (!res.ok) {
        console.warn(`⚠ Karte für ${name} nicht gefunden (HTTP ${res.status})`);
        continue;
      }

      const buffer = await res.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      console.log(`✔ Karte gespeichert: ${filePath}`);

      // Update letzte heruntergeladene AssessmentID
      lastSavedAssessmentId[name] = assessmentId;
      fs.writeFileSync(ASSESSMENT_TRACK_FILE, JSON.stringify(lastSavedAssessmentId, null, 2));
    } catch (err) {
      console.error(`❌ Fehler beim Download der Karte für ${name}: ${err.message}`);
      logError(`Fehler beim Download der Karte für ${name}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, RATE_LIMIT));
  }
}


// Hauptprozess
(async function() {
  try {
    const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
    const output = [];

    for (const s of speciesList) {
      const data = await fetchSpeciesData(s.genus, s.species, s.german);
      output.push(data);
      await new Promise(r => setTimeout(r, RATE_LIMIT));
    }

    fs.writeFileSync("speciesData.json", JSON.stringify(output, null, 2));
    console.log("✔ speciesData.json aktualisiert!");

    // Karten herunterladen
    await downloadMaps(output);
    console.log("✔ Alle Karten heruntergeladen!");

  } catch (err) {
    console.error("❌ Fehler im Hauptprozess: " + err);
    logError("Hauptprozess: " + err.message);
  }
})();