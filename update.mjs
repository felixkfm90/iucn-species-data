import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// =======================
// KONFIG / ORDNER
// =======================

// Pfad für Karten festlegen oder Ordner erstellen
const MAP_DIR = "./Verbreitungskarten";
if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR);

// Sound-Ordner
const SOUND_DIR = "./sounds";
if (!fs.existsSync(SOUND_DIR)) fs.mkdirSync(SOUND_DIR);

// Tokens
const TOKEN = process.env.IUCN_TOKEN;
if (!TOKEN) {
  console.error("❌ IUCN_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
  process.exit(1);
}

const XENO_TOKEN = process.env.XENO_TOKEN;
if (!XENO_TOKEN) {
  console.error("❌ XENO_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
  process.exit(1);
}

// Basis-URL IUCN
const BASE = "https://api.iucnredlist.org/api/v4";

// Pause zwischen Arten (ms)
const RATE_LIMIT = 400;

// Assessment-ID Trackfile (für Karten-Caching)
const ASSESSMENT_TRACK_FILE = "./lastSavedAssessmentId.json";
let lastSavedAssessmentId = {};
if (fs.existsSync(ASSESSMENT_TRACK_FILE)) {
  lastSavedAssessmentId = JSON.parse(fs.readFileSync(ASSESSMENT_TRACK_FILE, "utf8"));
}

// Übersetzungen Kategorie & Trend
const CATEGORY_MAP = {
  LC: "Nicht gefährdet",
  NT: "Potentiell gefährdet",
  VU: "Gefährdet",
  EN: "Stark gefährdet",
  CR: "Vom Aussterben bedroht",
  EW: "In freier Wildbahn ausgestorben",
  EX: "Ausgestorben",
  DD: "Keine ausreichende Datenlage",
};

const TREND_MAP = {
  Increasing: "Zunehmend",
  Stable: "Stabil",
  Decreasing: "Abnehmend",
  Unknown: "Unbekannt",
};

// =======================
// HELFER
// =======================

function logError(msg) {
  fs.appendFileSync("errors.log", `[${new Date().toISOString()}] ${msg}\n`);
}

function sanitizeAssetName(input) {
  return String(input ?? "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/å/g, "a")
    .replace(/Å/g, "A")
    .replace(/ð/g, "d")
    .replace(/Ð/g, "D")
    .replace(/þ/g, "th")
    .replace(/Þ/g, "Th")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/\+/g, " plus ")
    .replace(/[’‘‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/[\x00-\x1F\x7F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
}

function emptyEntry(scientific, german = scientific) {
  const URLSlug = scientific.toLowerCase().replace(/\s+/g, "");
  return {
    URLSlug,
    "Wissenschaftlicher Name": scientific,
    "Deutscher Name": german,
    Gewicht: "n/a",
    Größe: "n/a",
    "Assessment ID": "n/a",
    Status: "n/a",
    Trend: "n/a",
    Kategorie: "n/a",
    Populationgröße: "n/a",
    Lebenserwartung: "n/a",
    Kingdom: "n/a",
    Phylum: "n/a",
    Class: "n/a",
    Order: "n/a",
    Family: "n/a",
    Genus: "n/a",
    Species: "n/a",
    "Letztes IUCN Update": "n/a",
    "Daten abgerufen": new Date().toISOString().slice(0, 10),
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// IUCN GET mit Token
async function iucnGET(pathname) {
  const res = await fetch(`${BASE}${pathname}`, {
    headers: { Authorization: TOKEN, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

// =======================
// IUCN ASSESSMENT
// =======================

async function getAssessmentData(assessmentId) {
  try {
    const res = await fetch(`${BASE}/assessment/${assessmentId}`, {
      headers: { Authorization: TOKEN, Accept: "application/json" },
    });

    if (!res.ok) return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };

    const data = await res.json();
    const assessment = data.population_trend ? data : data.result ? data.result[0] : null;

    if (!assessment) return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };

    const trendEN = assessment.population_trend?.description?.en || "Unknown";
    const categoryCode = assessment.red_list_category?.code || "DD";
    const population = assessment.supplementary_info?.population_size || "n/a";
    const generation = assessment.supplementary_info?.generational_length || "n/a";

    const trend = TREND_MAP[trendEN] || "Unbekannt";
    const category = CATEGORY_MAP[categoryCode] || "Keine ausreichende Datenlage";

    return { trend, category, population, generation };
  } catch (err) {
    logError("Fehler bei Assessment " + assessmentId + ": " + err.message);
    return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };
  }
}

// Eine Art abrufen
async function fetchSpeciesData(genus, species, german, size, weight) {
  const scientific = `${genus} ${species}`;
  const URLSlug = `${genus}${species}`.toLowerCase();

  try {
    console.log(`→ Suche Taxon für ${german} (${scientific})`);

    const taxonData = await iucnGET(
      `/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`
    );

    if (!taxonData?.taxon) {
      console.error(`❌ Kein Treffer für ${scientific}`);
      logError("Kein Treffer: " + scientific);
      return emptyEntry(scientific, german);
    }

    const taxon = taxonData.taxon;
    const resolvedName = taxon.scientific_name;

    const globalAssessment = taxonData.assessments?.find((a) =>
      a.scopes?.some((s) => s.description?.en === "Global")
    );

    if (!globalAssessment) {
      console.error(`❌ Keine globale Assessment-ID für ${resolvedName}`);
      logError("Keine globale Assessment-ID: " + resolvedName);
      return emptyEntry(resolvedName, german);
    }

    const assessmentId = globalAssessment.assessment_id;
    const assessmentInfo = await getAssessmentData(assessmentId);

    // Formatierung Population mit 1000 Trennung
    let populationFormatted = assessmentInfo.population;
    if (typeof populationFormatted === "string") {
      populationFormatted = populationFormatted.replace(/\d+/g, (n) =>
        Number(n).toLocaleString("de-DE")
      );
    }

    // schreibe hinter Lebenserwartung Jahre
    let generationFormatted = assessmentInfo.generation;
    if (generationFormatted !== "n/a") {
      generationFormatted = generationFormatted.toString().replace(".", ",") + " Jahre";
    }

    return {
      URLSlug,
      "Wissenschaftlicher Name": resolvedName,
      "Deutscher Name": german,
      Gewicht: weight,
      Größe: size,
      "Assessment ID": assessmentId,
      Status: globalAssessment.red_list_category_code || "n/a",
      Trend: assessmentInfo.trend,
      Kategorie: assessmentInfo.category,
      Populationgröße: populationFormatted,
      Lebenserwartung: generationFormatted,
      Kingdom: taxon.kingdom_name || "n/a",
      Phylum: taxon.phylum_name || "n/a",
      Class: taxon.class_name || "n/a",
      Order: taxon.order_name || "n/a",
      Family: taxon.family_name || "n/a",
      Genus: taxon.genus_name || "n/a",
      Species: taxon.species_name || "n/a",
      "Letztes IUCN Update": globalAssessment.year_published || "n/a",
      "Daten abgerufen": new Date().toISOString().slice(0, 10),
    };
  } catch (err) {
    console.error(`❌ Fehler bei ${scientific}: ${err}`);
    logError("Fehler bei " + scientific + ": " + err.message);
    return emptyEntry(scientific, german);
  }
}

// =======================
// MAP: pro Art
// =======================

async function downloadMapForSpecies(s) {
  const name = s["Deutscher Name"] || s["Wissenschaftlicher Name"];
  const safeName = sanitizeAssetName(name);
  const assessmentId = s["Assessment ID"];

  if (!assessmentId || assessmentId === "n/a") {
    console.log(`⚠ Überspringe ${name}, keine gültige Assessment-ID.`);
    return "n/a";
  }

  const filePath = path.join(MAP_DIR, `${safeName}.jpg`);
  const tempFilePath = filePath + ".tmp";

  if (fs.existsSync(filePath) && lastSavedAssessmentId[safeName] === assessmentId) {
    console.log(`ℹ Karte für ${name} ist bereits aktuell, überspringe Download.`);
    return "ok";
  }

  const url = `https://www.iucnredlist.org/api/v4/assessments/${assessmentId}/distribution_map/jpg`;
  console.log(`→ Lade Karte für ${name} (${assessmentId})`);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "image/jpeg",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (!res.ok) {
      console.warn(`⚠ Karte für ${name} nicht gefunden (HTTP ${res.status})`);
      return "missing";
    }

    const buffer = await res.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));
    fs.renameSync(tempFilePath, filePath);

    console.log(`✔ Karte gespeichert: ${filePath}`);

    lastSavedAssessmentId[safeName] = assessmentId;
    fs.writeFileSync(ASSESSMENT_TRACK_FILE, JSON.stringify(lastSavedAssessmentId, null, 2));
    return "ok";
  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.error(`❌ Fehler beim Download der Karte für ${name}: ${err.message}`);
    logError(`Fehler beim Download der Karte für ${name}: ${err.message}`);
    return "error";
  }
}

// =======================
// XENO-CANTO SOUNDS
// =======================

async function downloadSoundIfMissing(genus, species, german) {
  const safeGerman = sanitizeAssetName(german);
  const targetDir = path.join(SOUND_DIR, safeGerman);

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const existing = fs.readdirSync(targetDir).filter((f) => f.endsWith(".mp3"));
  if (existing.length > 0) {
    console.log(`🎵 Sound existiert bereits für ${german}`);
    return "ok";
  }

  let best = null;
  const queries = [
    `gen:${genus} sp:${species} q:A len:25-35`,
    `gen:${genus} sp:${species} q:A`,
    `gen:${genus} sp:${species}`,
  ];

  for (const q of queries) {
    const apiUrl = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(q)}&key=${XENO_TOKEN}&page=1`;
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        console.warn(`⚠ Xeno-Canto API Fehler ${res.status} für ${genus} ${species}`);
        continue;
      }
      const data = await res.json();
      if (!data.recordings || data.recordings.length === 0) continue;

      best = data.recordings.find((r) => r.q === "A") || data.recordings[0];
      if (best) break;
    } catch (err) {
      console.error(`❌ Fehler bei Xeno-Canto Anfrage: ${err.message}`);
      continue;
    }
  }

  if (!best) {
    console.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
    return "missing";
  }

  const audioUrl = best.file.startsWith("https:") ? best.file : `https:${best.file}`;
  const filePath = path.join(targetDir, `${safeGerman}.mp3`);
  const tempFilePath = filePath + ".tmp";

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der Datei (${audioRes.status})`);
      return "error";
    }

    const buffer = await audioRes.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));
    fs.renameSync(tempFilePath, filePath);

    console.log(`✔ Sound gespeichert: ${filePath}`);

    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: best.rec,
      country: best.cnt,
      location: best.loc,
      quality: best.q,
      license: best.lic,
      source: "xeno-canto.org",
      url: `https://xeno-canto.org/${best.id}`,
    };

    fs.writeFileSync(path.join(targetDir, "credits.json"), JSON.stringify(credits, null, 2));
    return "ok";
  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.error(`❌ Fehler beim Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Sound ${genus} ${species}: ${err.message}`);
    return "error";
  }
}

// =======================
// REPORT: Fehlende Elemente
// =======================

function createMissingElementsReport(speciesData) {
  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      totalSpecies: speciesData.length,
      missingSoundMp3: 0,
      missingSoundCredits: 0,
      missingMap: 0,
      missingAssessmentId: 0,
      missingStatus: 0,
      missingCategory: 0,
      missingTrend: 0,
    },
    missing: {
      soundMp3: [],
      soundCredits: [],
      maps: [],
      assessmentId: [],
      status: [],
      category: [],
      trend: [],
    },
  };

  for (const s of speciesData) {
    const german = s["Deutscher Name"] || s["Wissenschaftlicher Name"] || "unknown";
    const safe = sanitizeAssetName(german);

    if (!s["Assessment ID"] || s["Assessment ID"] === "n/a") report.missing.assessmentId.push(german);
    if (!s.Status || s.Status === "n/a") report.missing.status.push(german);
    if (!s.Kategorie || s.Kategorie === "n/a") report.missing.category.push(german);
    if (!s.Trend || s.Trend === "n/a") report.missing.trend.push(german);

    const mp3Path = path.join(SOUND_DIR, safe, `${safe}.mp3`);
    const creditsPath = path.join(SOUND_DIR, safe, "credits.json");
    const mapPath = path.join(MAP_DIR, `${safe}.jpg`);

    if (!fs.existsSync(mp3Path)) report.missing.soundMp3.push(german);
    if (fs.existsSync(mp3Path) && !fs.existsSync(creditsPath)) report.missing.soundCredits.push(german);
    if (!fs.existsSync(mapPath)) report.missing.maps.push(german);
  }

  report.counts.missingSoundMp3 = report.missing.soundMp3.length;
  report.counts.missingSoundCredits = report.missing.soundCredits.length;
  report.counts.missingMap = report.missing.maps.length;
  report.counts.missingAssessmentId = report.missing.assessmentId.length;
  report.counts.missingStatus = report.missing.status.length;
  report.counts.missingCategory = report.missing.category.length;
  report.counts.missingTrend = report.missing.trend.length;

  return report;
}

function printReportToConsole(report) {
  console.log("\n==============================");
  console.log("📋 Report: Fehlende Elemente");
  console.log("==============================");
  console.log(`Arten gesamt: ${report.counts.totalSpecies}`);
  console.log(`❌ Sound (mp3) fehlt: ${report.counts.missingSoundMp3}`);
  console.log(`❌ Sound Credits fehlen: ${report.counts.missingSoundCredits}`);
  console.log(`❌ Karte fehlt: ${report.counts.missingMap}`);
  console.log(`❌ Assessment ID fehlt: ${report.counts.missingAssessmentId}`);
  console.log(`❌ Status fehlt: ${report.counts.missingStatus}`);
  console.log(`❌ Kategorie fehlt: ${report.counts.missingCategory}`);
  console.log(`❌ Trend fehlt: ${report.counts.missingTrend}`);
  console.log("------------------------------");

  const showList = (title, arr) => {
    if (!arr.length) return;
    console.log(`\n${title} (${arr.length}):`);
    for (const n of arr) console.log(" - " + n);
  };

  showList("Fehlende Sound-MP3", report.missing.soundMp3);
  showList("Fehlende Sound-Credits", report.missing.soundCredits);
  showList("Fehlende Karten", report.missing.maps);
  showList("Fehlende Assessment IDs", report.missing.assessmentId);
  showList("Fehlender Status", report.missing.status);
  showList("Fehlende Kategorie", report.missing.category);
  showList("Fehlender Trend", report.missing.trend);

  console.log("\n==============================\n");
}

// =======================
// HAUPTPROZESS
// =======================

(async function () {
  try {
    const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
    const output = [];

    for (const s of speciesList) {
      // 1) IUCN Daten holen
      const data = await fetchSpeciesData(s.genus, s.species, s.german, s.size, s.weight);
      output.push(data);

      // 2) Sound (falls fehlt)
      const soundStatus = await downloadSoundIfMissing(s.genus, s.species, s.german);

      // 3) Map (falls fehlt / nicht aktuell)
      const mapStatus = await downloadMapForSpecies(data);

      // 4) Species-Data Status (minimaler "ok"-Check)
      const speciesOk =
        data &&
        data["Wissenschaftlicher Name"] !== "n/a" &&
        data["Assessment ID"] &&
        data["Assessment ID"] !== "n/a";

      const soundLabel = soundStatus === "ok" ? "ok" : soundStatus;
      const mapLabel = mapStatus === "ok" ? "ok" : mapStatus;
      const dataLabel = speciesOk ? "ok" : "n/a";

      const germanName = data["Deutscher Name"] || s.german || "unbekannt";
      const sciName = data["Wissenschaftlicher Name"] || `${s.genus} ${s.species}`;

      console.log(`✅ Fertig: ${germanName} - ${sciName} (Sound: ${soundLabel}, Map: ${mapLabel}, Spezies-Data: ${dataLabel})`);

      // 5) kleine Pause
      await sleep(RATE_LIMIT);
    }

    fs.writeFileSync("speciesData.json", JSON.stringify(output, null, 2));
    console.log("✔ speciesData.json aktualisiert!");

    const report = createMissingElementsReport(output);
    fs.writeFileSync("fehlende_elemente_report.json", JSON.stringify(report, null, 2));
    printReportToConsole(report);
    console.log("✔ fehlende_elemente_report.json erstellt!");
  } catch (err) {
    console.error("❌ Fehler im Hauptprozess: " + err);
    logError("Hauptprozess: " + err.message);
  }
})();