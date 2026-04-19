import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// =======================
// KONFIG / ORDNER
// =======================

const MAP_DIR = "./Verbreitungskarten";
if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR);

const SOUND_DIR = "./sounds";
if (!fs.existsSync(SOUND_DIR)) fs.mkdirSync(SOUND_DIR);

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

const BASE = "https://api.iucnredlist.org/api/v4";
const RATE_LIMIT = 400;

// Xeno multi-page
const MAX_XENO_PAGES = 5;

// Assessment-ID Trackfile (für Karten-Caching)
const ASSESSMENT_TRACK_FILE = "./lastSavedAssessmentId.json";
let lastSavedAssessmentId = {};
if (fs.existsSync(ASSESSMENT_TRACK_FILE)) {
  lastSavedAssessmentId = JSON.parse(fs.readFileSync(ASSESSMENT_TRACK_FILE, "utf8"));
}

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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

    let populationFormatted = assessmentInfo.population;
    if (typeof populationFormatted === "string") {
      populationFormatted = populationFormatted.replace(/\d+/g, (n) =>
        Number(n).toLocaleString("de-DE")
      );
    }

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
// XENO-CANTO SOUNDS (Open first, NC fallback) - MULTI PAGE
// =======================

function normalizeLicenseUrl(lic) {
  if (!lic) return "";
  if (lic.startsWith("//")) return "https:" + lic;
  return lic;
}

function isNcLicense(lic) {
  const s = String(lic || "").toLowerCase();
  return s.includes("/by-nc");
}

function buildXenoQuery(genus, species, qLetter, len2535) {
  const parts = [`gen:${genus}`, `sp:${species}`];
  if (qLetter) parts.push(`q:${qLetter}`);
  if (len2535) parts.push(`len:25-35`);
  return parts.join(" ");
}

async function fetchXenoPage(query, page) {
  const apiUrl =
    `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}` +
    `&key=${encodeURIComponent(XENO_TOKEN)}&page=${page}`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return { ok: false, status: res.status, recordings: [], apiUrl };

    const data = await res.json();
    const recs = Array.isArray(data.recordings) ? data.recordings : [];
    const numPages = Number(data.numPages || data.num_pages || data.pages || 0) || null;

    return { ok: true, status: res.status, recordings: recs, apiUrl, numPages };
  } catch (e) {
    return { ok: false, status: 0, recordings: [], apiUrl, error: e.message };
  }
}

async function findRecordingByStage(genus, species, stage) {
  const query = buildXenoQuery(genus, species, stage.q, stage.len2535);

  let maxPages = MAX_XENO_PAGES;
  for (let page = 1; page <= maxPages; page++) {
    const resp = await fetchXenoPage(query, page);

    if (!resp.ok) {
      console.warn(`⚠ Xeno-Canto API Fehler ${resp.status} für ${genus} ${species} (page ${page})`);
      await sleep(150);
      continue;
    }

    if (resp.numPages && resp.numPages < maxPages) maxPages = resp.numPages;

    if (!resp.recordings.length) {
      await sleep(80);
      continue;
    }

    if (stage.openOnly) {
      const open = resp.recordings.find((r) => !isNcLicense(r.lic));
      if (open) return { rec: open, query, page };
    } else {
      return { rec: resp.recordings[0], query, page };
    }

    await sleep(80);
  }

  return null;
}

async function downloadSoundIfMissing(genus, species, german) {
  const safeGerman = sanitizeAssetName(german);
  const targetDir = path.join(SOUND_DIR, safeGerman);

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const mp3Path = path.join(targetDir, `${safeGerman}.mp3`);
  const creditsPath = path.join(targetDir, "credits.json");

  if (fs.existsSync(mp3Path)) {
    console.log(`🎵 Sound existiert bereits für ${german}`);
    return "ok";
  }

  const stages = [
    { openOnly: true, q: "A", len2535: true }, // 0
    { openOnly: true, q: "A", len2535: false }, // 1
    { openOnly: true, q: "B", len2535: true }, // 2
    { openOnly: true, q: "B", len2535: false }, // 3
    { openOnly: true, q: "C", len2535: true }, // 4
    { openOnly: true, q: "C", len2535: false }, // 5
    { openOnly: false, q: "A", len2535: true }, // 6
    { openOnly: false, q: "A", len2535: false }, // 7
    { openOnly: false, q: "B", len2535: true }, // 8
    { openOnly: false, q: "B", len2535: false }, // 9
    { openOnly: false, q: "C", len2535: true }, // 10
    { openOnly: false, q: "C", len2535: false }, // 11
  ];

  let chosen = null;
  let chosenInfo = null;
  let chosenStageIndex = null;

  for (let i = 0; i < stages.length; i++) {
    const hit = await findRecordingByStage(genus, species, stages[i]);
    if (hit?.rec) {
      chosen = hit.rec;
      chosenInfo = hit;
      chosenStageIndex = i;
      break;
    }
  }

  if (!chosen) {
    console.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
    return "missing";
  }

  const lic = normalizeLicenseUrl(chosen.lic || "");
  const audioUrl = chosen.file?.startsWith("https:") ? chosen.file : `https:${chosen.file}`;
  const tempMp3 = mp3Path + ".tmp";

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der Datei (${audioRes.status})`);
      return "error";
    }

    const buffer = await audioRes.arrayBuffer();
    fs.writeFileSync(tempMp3, Buffer.from(buffer));
    fs.renameSync(tempMp3, mp3Path);

    console.log(`✔ Sound gespeichert: ${mp3Path}`);

    const st = stages[chosenStageIndex];
    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: chosen.rec || "n/a",
      country: chosen.cnt || "n/a",
      location: chosen.loc || "n/a",
      quality: chosen.q || "n/a",
      license: lic || "n/a",
      source: "xeno-canto.org",
      url: chosen.id ? `https://xeno-canto.org/${chosen.id}` : "n/a",
      notes: `Stage ${chosenStageIndex} (openOnly=${st.openOnly}, q=${st.q}, len25-35=${st.len2535}) | query="${chosenInfo.query}" | page=${chosenInfo.page}`,
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    return "ok";
  } catch (err) {
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
    console.error(`❌ Fehler beim Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Sound ${genus} ${species}: ${err.message}`);
    return "error";
  }
}

// =======================
// REPORT: Fehlende Elemente (+ NC-Lizenzen gesamt)
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
      ncSoundLicensesAll: 0,
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
    ncSoundLicensesAll: [],
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

  // NC-Lizenzen (alle vorhandenen Sounds mit credits.json)
  const ncAll = [];
  for (const s of speciesData) {
    const german = s["Deutscher Name"] || s["Wissenschaftlicher Name"] || "unknown";
    const safe = sanitizeAssetName(german);

    const creditsPath = path.join(SOUND_DIR, safe, "credits.json");
    if (!fs.existsSync(creditsPath)) continue;

    try {
      const c = JSON.parse(fs.readFileSync(creditsPath, "utf8"));
      const lic = String(c.license || "").toLowerCase();
      if (lic.includes("/by-nc")) ncAll.push(german);
    } catch (_) {
      // ignore
    }
  }

  report.ncSoundLicensesAll = Array.from(new Set(ncAll)).sort((a, b) => a.localeCompare(b, "de"));
  report.counts.ncSoundLicensesAll = report.ncSoundLicensesAll.length;

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
  showList("NC-Sound-Lizenzen (only non commercial)", report.ncSoundLicensesAll);

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
      const data = await fetchSpeciesData(s.genus, s.species, s.german, s.size, s.weight);
      output.push(data);

      const soundStatus = await downloadSoundIfMissing(s.genus, s.species, s.german);
      const mapStatus = await downloadMapForSpecies(data);

      const speciesOk =
        data &&
        data["Wissenschaftlicher Name"] !== "n/a" &&
        data["Assessment ID"] &&
        data["Assessment ID"] !== "n/a";

      const soundLabel = soundStatus === "ok" ? "ok" : soundStatus;
      const mapLabel = mapStatus === "ok" ? "ok" : mapStatus;
      const dataLabel = speciesOk ? "ok" : "n/a";

      const hasError = soundLabel === "error" || mapLabel === "error";
      const hasMissing =
        soundLabel === "missing" || mapLabel === "missing" || mapLabel === "n/a" || dataLabel === "n/a";
      const icon = hasError ? "❌" : hasMissing ? "⚠" : "✅";

      const germanName = data["Deutscher Name"] || s.german || "unbekannt";
      const sciName = data["Wissenschaftlicher Name"] || `${s.genus} ${s.species}`;

      console.log(
        `${icon} Fertig: ${germanName} - ${sciName} (Sound: ${soundLabel}, Map: ${mapLabel}, Spezies-Data: ${dataLabel})`
      );
      console.log("");

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