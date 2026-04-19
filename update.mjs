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
// XENO-CANTO SOUNDS (Open first, NC fallback)
// =======================

function normalizeLicenseUrl(lic) {
  if (!lic) return "";
  if (lic.startsWith("//")) return "https:" + lic;
  return lic;
}

function isNC(licenseUrl) {
  return (licenseUrl || "").toLowerCase().includes("/by-nc");
}

function parseLenSeconds(lenStr) {
  const n = Number(lenStr);
  return Number.isFinite(n) ? n : null;
}

function lenIn2535(lenStr) {
  const n = parseLenSeconds(lenStr);
  if (n === null) return false;
  return n >= 25 && n <= 35;
}

function qualityIs(r, q) {
  return String(r.q || "").toUpperCase() === q;
}

function buildQuery(genus, species, opts) {
  // opts: { qLetter: "A"/"B"/"C", len2535: true/false, openOnly: true/false }
  // Xeno query supports filters like q:A, len:25-35, lic:...
  const parts = [`gen:${genus}`, `sp:${species}`];

  if (opts.qLetter) parts.push(`q:${opts.qLetter}`);
  if (opts.len2535) parts.push(`len:25-35`);

  // "openOnly" = exclude NC, i.e. exclude by-nc* licenses
  // Xeno supports negation with "-" operator in query. We'll exclude NC licenses broadly.
  if (opts.openOnly) {
    parts.push(`-lic:by-nc-sa -lic:by-nc-nd -lic:by-nc`);
  }

  return parts.join(" ");
}

async function fetchXeno(genus, species, query) {
  const apiUrl = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}&key=${XENO_TOKEN}&page=1`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return { ok: false, status: res.status, data: null, apiUrl };
    const data = await res.json();
    const recs = Array.isArray(data.recordings) ? data.recordings : [];
    return { ok: true, status: res.status, data: recs, apiUrl };
  } catch (e) {
    return { ok: false, status: 0, data: null, apiUrl, error: e.message };
  }
}

function pickBestRecording(recs, preferredQuality) {
  // Pick first with preferred quality if available else first
  if (!recs.length) return null;
  const q = preferredQuality;
  const best = recs.find((r) => String(r.q || "").toUpperCase() === q) || recs[0];
  return best;
}

// Tracks which species got NC audio during this run
const ncAddedThisRun = new Set();

async function downloadSoundIfMissing(genus, species, german) {
  const safeGerman = sanitizeAssetName(german);
  const targetDir = path.join(SOUND_DIR, safeGerman);

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const mp3Path = path.join(targetDir, `${safeGerman}.mp3`);
  const creditsPath = path.join(targetDir, "credits.json");

  // Already have mp3?
  if (fs.existsSync(mp3Path)) {
    console.log(`🎵 Sound existiert bereits für ${german}`);
    return "ok";
  }

  // Fallback stages as requested:
  const stages = [
    // 0-5: open (no NC), then 6-11: NC allowed
    { openOnly: true,  q: "A", len2535: true  },  // 0
    { openOnly: true,  q: "A", len2535: false },  // 1
    { openOnly: true,  q: "B", len2535: true  },  // 2
    { openOnly: true,  q: "B", len2535: false },  // 3
    { openOnly: true,  q: "C", len2535: true  },  // 4
    { openOnly: true,  q: "C", len2535: false },  // 5
    { openOnly: false, q: "A", len2535: true  },  // 6
    { openOnly: false, q: "A", len2535: false },  // 7
    { openOnly: false, q: "B", len2535: true  },  // 8
    { openOnly: false, q: "B", len2535: false },  // 9
    { openOnly: false, q: "C", len2535: true  },  // 10
    { openOnly: false, q: "C", len2535: false },  // 11
  ];

  let chosen = null;
  let chosenStage = null;

  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const q = buildQuery(genus, species, { qLetter: st.q, len2535: st.len2535, openOnly: st.openOnly });

    const resp = await fetchXeno(genus, species, q);
    if (!resp.ok) {
      console.warn(`⚠ Xeno-Canto API Fehler ${resp.status} für ${genus} ${species} (Stage ${i})`);
      await sleep(150);
      continue;
    }

    const recs = resp.data;
    if (!recs || recs.length === 0) {
      await sleep(100);
      continue;
    }

    // Stage says quality q; still pick best in that page
    const best = pickBestRecording(recs, st.q);
    if (best) {
      chosen = best;
      chosenStage = i;
      break;
    }
  }

  if (!chosen) {
    console.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
    return "missing";
  }

  // Determine if chosen license is NC
  const lic = normalizeLicenseUrl(chosen.lic || "");
  const isNcChosen = isNC(lic);

  // Audio URL
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

    // Credits speichern (mit https-normalisierten Lizenz-URL)
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
      notes: `Selected by staged fallback: ${chosenStage} (openOnly=${stages[chosenStage]?.openOnly}, q=${stages[chosenStage]?.q}, len25-35=${stages[chosenStage]?.len2535})`
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    // Track NC additions only if we actually downloaded now
    if (isNcChosen) ncAddedThisRun.add(german);

    return "ok";
  } catch (err) {
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
    console.error(`❌ Fehler beim Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Sound ${genus} ${species}: ${err.message}`);
    return "error";
  }
}

// =======================
// REPORT: Fehlende Elemente (+ NC neu hinzugefügt)
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
      ncSoundsAddedThisRun: 0,
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
    ncSoundsAddedThisRun: [], // list of german names
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

  report.ncSoundsAddedThisRun = Array.from(ncAddedThisRun.values()).sort((a,b)=>a.localeCompare(b,"de"));
  report.counts.ncSoundsAddedThisRun = report.ncSoundsAddedThisRun.length;

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
  console.log(`⚠ NC-Sounds neu hinzugefügt: ${report.counts.ncSoundsAddedThisRun}`);
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
  showList("NC-Sounds neu hinzugefügt", report.ncSoundsAddedThisRun);

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

      console.log(`${icon} Fertig: ${germanName} - ${sciName} (Sound: ${soundLabel}, Map: ${mapLabel}, Spezies-Data: ${dataLabel})`);
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