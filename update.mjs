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

//XENO Token abrufen und speichern
const XENO_TOKEN = process.env.XENO_TOKEN;
if (!XENO_TOKEN) {
  console.error("❌ XENO_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
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

//Festlegen Übersetzungen Kategorie
const CATEGORY_MAP = {
  "LC": "Nicht gefährdet",
  "NT": "Potentiell gefährdet",
  "VU": "Gefährdet",
  "EN": "Stark gefährdet",
  "CR": "Vom Aussterben bedroht",
  "EW": "In freier Wildbahn ausgestorben",
  "EX": "Ausgestorben",
  "DD": "Keine ausreichende Datenlage"
};

//Festlegen Übersetzungen Trend
const TREND_MAP = {
  "Increasing": "Zunehmend",
  "Stable": "Stabil",
  "Decreasing": "Abnehmend",
  "Unknown": "Unbekannt"
};

// Logging
function logError(msg) {
  fs.appendFileSync(
    "errors.log",
    `[${new Date().toISOString()}] ${msg}\n`
  );
}

function emptyEntry(scientific, german = scientific) {
  const URLSlug = scientific.toLowerCase().replace(/\s+/g, '');
  return {
    "URLSlug": URLSlug,
    "Wissenschaftlicher Name": scientific,
    "Deutscher Name": german,
    "Gewicht": "n/a",
    "Größe": "n/a",
    "Assessment ID": "n/a",
    "Status": "n/a",
    "Trend": "n/a",
    "Kategorie": "n/a",
    "Populationgröße": "n/a",
    "Lebenserwartung": "n/a",
    "Kingdom": "n/a",
    "Phylum": "n/a",
    "Class": "n/a",
    "Order": "n/a",
    "Family": "n/a",
    "Genus": "n/a",
    "Species": "n/a",
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

    if (!assessment) return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };

    const trendEN = assessment.population_trend?.description?.en || "Unknown";
    const categoryCode = assessment.red_list_category?.code || "DD";
    const population = assessment.supplementary_info?.population_size  || "n/a";
    const generation = assessment.supplementary_info?.generational_length || "n/a";

    const trend = TREND_MAP[trendEN] || "Unbekannt";
    const category = CATEGORY_MAP[categoryCode] || "Keine ausreichende Datenlage";

    return { trend, category, population, generation };

  } catch (err) {
    logError("Fehler bei Assessment " + assessmentId + ": " + err.message);
    return { trend: "n/a", category: "n/a" };
  }
}

// Eine Art abrufen
async function fetchSpeciesData(genus, species, german, size, weight) {
  const scientific = `${genus} ${species}`;
  const URLSlug = `${genus}${species}`.toLowerCase();
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

    //Formatierung Population mit 1000 Trennung
    let populationFormatted = assessmentInfo.population;
    if (typeof populationFormatted === "string") {
      // Zahlen in Bereichen wie "1000-2000" erkennen und formatieren
      populationFormatted = populationFormatted.replace(/\d+/g, n =>
        Number(n).toLocaleString("de-DE")
      );
    }

    // schreibe hinter Lebenserwartung Jahre
    let generationFormatted = assessmentInfo.generation;
    if (generationFormatted !== "n/a") {
      // Punkt zu Komma wandeln, falls nötig
      generationFormatted = generationFormatted.toString().replace(".", ",") + " Jahre";
    }

    return {
      "URLSlug": URLSlug,
      "Wissenschaftlicher Name": resolvedName,
      "Deutscher Name": german,
      "Gewicht": weight,
      "Größe": size,
      "Assessment ID": assessmentId,
      "Status": globalAssessment.red_list_category_code || "n/a",
      "Trend": assessmentInfo.trend,
      "Kategorie": assessmentInfo.category,
      "Populationgröße": populationFormatted,
      "Lebenserwartung": generationFormatted,
      "Kingdom": taxon.kingdom_name || "n/a",
      "Phylum": taxon.phylum_name || "n/a",
      "Class": taxon.class_name || "n/a",
      "Order": taxon.order_name || "n/a",
      "Family": taxon.family_name || "n/a",
      "Genus": taxon.genus_name || "n/a",
      "Species": taxon.species_name || "n/a",
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
    const tempFilePath = filePath + ".tmp";

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
      fs.writeFileSync(tempFilePath, Buffer.from(buffer));

      // Nur wenn erfolgreich geladen → alte Datei ersetzen
      fs.renameSync(tempFilePath, filePath);
      console.log(`✔ Karte gespeichert: ${filePath}`);

      // Update letzte heruntergeladene AssessmentID
      lastSavedAssessmentId[name] = assessmentId;
      fs.writeFileSync(ASSESSMENT_TRACK_FILE, JSON.stringify(lastSavedAssessmentId, null, 2));

    } catch (err) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      console.error(`❌ Fehler beim Download der Karte für ${name}: ${err.message}`);
      logError(`Fehler beim Download der Karte für ${name}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, RATE_LIMIT));
  }
}

// =======================
// XENO-CANTO SOUNDS
// =======================

const SOUND_DIR = "./sounds";
if (!fs.existsSync(SOUND_DIR)) {
  fs.mkdirSync(SOUND_DIR);
}

async function downloadSoundIfMissing(genus, species, german) {
  const targetDir = path.join(SOUND_DIR, german);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Prüfen, ob bereits eine Aufnahme existiert
  const existing = fs.readdirSync(targetDir).filter(f => f.endsWith(".mp3"));
  if (existing.length > 0) {
    console.log(`🎵 Sound existiert bereits für ${german}`);
    return;
  }

  // 1️⃣ Versuch: Länge 25–35 Sekunden
  let query = `gen:${genus} sp:${species} q:A len:25-35`;
  let apiUrl = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}&key=${XENO_TOKEN}&page=1`;

  let data;
  try {
    let res = await fetch(apiUrl);
    if (!res.ok) {
      console.warn(`⚠ Xeno-Canto API Fehler ${res.status} für ${genus} ${species}`);
      return;
    }
    data = await res.json();
  } catch (err) {
    console.error(`❌ Fehler bei Xeno-Canto Anfrage: ${err.message}`);
    return;
  }

  // Beste Aufnahme finden
  let best = data.recordings?.find(r => r.q === "A");

  // 2️⃣ Fallback: Wenn keine Aufnahme in gewünschter Länge, irgendeine Aufnahme nehmen
  if (!best && data.recordings && data.recordings.length > 0) {
    console.log(`⚠ Keine Aufnahme 25–35s, lade erste vorhandene für ${genus} ${species}`);
    best = data.recordings[0];
  }

  if (!best) {
    console.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
    return;
  }

  // Audio URL korrekt zusammensetzen
  let audioUrl = best.file.startsWith("https:") ? best.file : `https:${best.file}`;
  const filePath = path.join(targetDir, `${german}.mp3`);

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der Datei (${audioRes.status})`);
      return;
    }

    const buffer = await audioRes.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));
    console.log(`✔ Sound gespeichert: ${filePath}`);

    // Credits speichern
    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: best.rec,
      country: best.cnt,
      location: best.loc,
      quality: best.q,
      license: best.lic,
      source: "xeno-canto.org",
      url: `https://xeno-canto.org/${best.id}`
    };

    fs.writeFileSync(path.join(targetDir, "credits.json"), JSON.stringify(credits, null, 2));

  } catch (err) {
    console.error(`❌ Fehler beim Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Sound ${genus} ${species}: ${err.message}`);
  }
}

// Hauptprozess
(async function() {
  try {
    const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
    const output = [];

    for (const s of speciesList) {
      const data = await fetchSpeciesData(s.genus, s.species, s.german, s.size, s.weight);
      output.push(data);
      //Sound laden
      await downloadSoundIfMissing(s.genus, s.species, s.german);
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