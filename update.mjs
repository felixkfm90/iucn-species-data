import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { buildPipelinePlan } from "./scripts/pipeline-selection.mjs";

// =======================
// KONFIG / ORDNER
// =======================

const SPECIES_ASSETS_DIR = "./species-assets";
const TOKEN = process.env.IUCN_TOKEN;
const XENO_TOKEN = process.env.XENO_TOKEN;

const BASE = "https://api.iucnredlist.org/api/v4";
const RATE_LIMIT = 400;

// Xeno multi-page
const MAX_XENO_PAGES = 5;

// Assessment-ID Trackfile (für Karten-Caching)
const ASSESSMENT_TRACK_FILE = "./lastSavedAssessmentId.json";
const ASSET_OVERRIDES_FILE = "./species-assets-overrides.json";
let lastSavedAssessmentId = {};
if (fs.existsSync(ASSESSMENT_TRACK_FILE)) {
  lastSavedAssessmentId = JSON.parse(fs.readFileSync(ASSESSMENT_TRACK_FILE, "utf8"));
}
let assetOverrides = { version: 1, assets: {} };
if (fs.existsSync(ASSET_OVERRIDES_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ASSET_OVERRIDES_FILE, "utf8"));
    if (parsed && typeof parsed === "object") assetOverrides = parsed;
  } catch (error) {
    console.warn(`⚠ Asset-Overrides konnten nicht gelesen werden: ${error.message}`);
  }
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

function parsePipelineArgs(rawArgs) {
  const parsed = { mode: "all", dryRun: false, reportOnly: false };
  for (const arg of rawArgs) {
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--report-only") parsed.reportOnly = true;
    else if (arg.startsWith("--mode=")) parsed.mode = arg.slice("--mode=".length);
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unbekannter Parameter: ${arg}`);
  }
  if (!["all", "missing", "manual-maps", "nc-sounds"].includes(parsed.mode)) {
    throw new Error(`Unbekannter Pipeline-Modus: ${parsed.mode}`);
  }
  return parsed;
}

function printPipelineHelp() {
  console.log(`Verwendung: node update.mjs [Optionen]

Optionen:
  --mode=all       Vollständiger Lauf über alle Arten (Standard)
  --mode=missing   Nur neue Arten oder Arten mit fehlenden Kerndaten/Assets
  --mode=manual-maps  Nur manuell gepflegte Karten erneut bei IUCN suchen
  --mode=nc-sounds    Vorhandene NC-Sounds und fehlende Sounds erneut suchen
  --dry-run        Auswahl anzeigen, ohne Dateien oder Assets zu verändern
  --report-only    Report aus speciesData.json und aktuellen Assets neu aufbauen
`);
}

function flushStream(stream) {
  return new Promise((resolveFlush) => {
    if (!stream?.writable || stream.destroyed || stream.writableEnded) {
      resolveFlush();
      return;
    }
    stream.write("", () => resolveFlush());
  });
}

async function exitAfterMain() {
  await Promise.all([
    flushStream(process.stdout),
    flushStream(process.stderr),
  ]);
  process.exit(Number(process.exitCode ?? 0) || 0);
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function speciesAssetDir(safeName) {
  return path.join(SPECIES_ASSETS_DIR, safeName);
}

function isManualAsset(safeName, assetType) {
  return assetOverrides.assets?.[safeName]?.[assetType]?.manual === true;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyEntry(scientific, german = scientific, manual = {}) {
  const URLSlug = scientific.toLowerCase().replace(/\s+/g, "");
  return {
    URLSlug,
    "Wissenschaftlicher Name": scientific,
    "Deutscher Name": german,
    Gewicht: manual.weight || "n/a",
    Größe: manual.size || "n/a",
    Lebenserwartung: manual.lifeExpectancy || "n/a",
    "Assessment ID": "n/a",
    Status: "n/a",
    Trend: "n/a",
    Kategorie: "n/a",
    Populationgröße: "n/a",
    Generationsdauer: "n/a",
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

function getInputSlug(s) {
  return `${s.genus}${s.species}`.toLowerCase();
}

function loadExistingSpeciesData() {
  if (!fs.existsSync("speciesData.json")) return [];

  try {
    const data = JSON.parse(fs.readFileSync("speciesData.json", "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logError("Bestehende speciesData.json konnte nicht gelesen werden: " + err.message);
    return [];
  }
}

function hasUsableSpeciesData(entry) {
  return Boolean(
    entry &&
      entry["Wissenschaftlicher Name"] &&
      entry["Wissenschaftlicher Name"] !== "n/a" &&
      entry["Assessment ID"] &&
      entry["Assessment ID"] !== "n/a" &&
      entry.Status &&
      entry.Status !== "n/a" &&
      entry.Kategorie &&
      entry.Kategorie !== "n/a" &&
      entry.Trend &&
      entry.Trend !== "n/a"
  );
}

function preserveExistingSpeciesData(existing, inputSpecies) {
  return {
    ...existing,
    Gewicht: inputSpecies.weight || existing.Gewicht,
    Größe: inputSpecies.size || existing.Größe,
    Lebenserwartung: inputSpecies.life_expectancy || existing.Lebenserwartung || "n/a",
  };
}

// IUCN GET mit Token
async function iucnGET(pathname) {
  const url = `${BASE}${pathname}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });

    if (res.ok) return res.json();

    // Rate limit handling
    if (res.status === 429) {
      // IUCN sagt explizit 60 Sekunden warten
      console.warn(`⏳ IUCN 429 (Rate Limit). Warte 60 Sekunden… (${url})`);
      await sleep(60000);
      continue;
    }

    // Andere Fehler
    const body = await res.text().catch(() => "");
    console.error(`❌ IUCN HTTP ${res.status} bei ${url}${body ? ` | ${body.slice(0, 200)}` : ""}`);
    return null;
  }

  console.error(`❌ IUCN: mehrfach 429 erhalten, Abbruch: ${url}`);
  return null;
}

// =======================
// IUCN ASSESSMENT
// =======================

async function getAssessmentData(assessmentId) {
  try {
    const res = await fetch(`${BASE}/assessment/${assessmentId}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
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
async function fetchSpeciesData(genus, species, german, size, weight, lifeExpectancy) {
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
      return emptyEntry(scientific, german, { size, weight, lifeExpectancy });
    }

    const taxon = taxonData.taxon;
    const resolvedName = taxon.scientific_name;

    const globalAssessment = taxonData.assessments?.find((a) =>
      a.scopes?.some((s) => s.description?.en === "Global")
    );

    if (!globalAssessment) {
      console.error(`❌ Keine globale Assessment-ID für ${resolvedName}`);
      logError("Keine globale Assessment-ID: " + resolvedName);
      return emptyEntry(resolvedName, german, { size, weight, lifeExpectancy });
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
      Lebenserwartung: lifeExpectancy || "n/a",
      "Assessment ID": assessmentId,
      Status: globalAssessment.red_list_category_code || "n/a",
      Trend: assessmentInfo.trend,
      Kategorie: assessmentInfo.category,
      Populationgröße: populationFormatted,
      Generationsdauer: generationFormatted,
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
    return emptyEntry(scientific, german, { size, weight, lifeExpectancy });
  }
}

// =======================
// MAP: pro Art
// =======================

function isJpegBuffer(buffer) {
  return buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[buffer.length - 2] === 0xff
    && buffer[buffer.length - 1] === 0xd9;
}

async function downloadMapForSpecies(
  s,
  { force = false, allowManual = false, recordAssessment = true } = {},
) {
  const name = s["Deutscher Name"] || s["Wissenschaftlicher Name"];
  const safeName = sanitizeAssetName(name);
  const assessmentId = s["Assessment ID"];

  if (!assessmentId || assessmentId === "n/a") {
    console.log(`⚠ Überspringe ${name}, keine gültige Assessment-ID.`);
    return "n/a";
  }

  const assetDir = speciesAssetDir(safeName);
  ensureDir(assetDir);
  const filePath = path.join(assetDir, "map.jpg");
  const tempFilePath = filePath + ".tmp";

  if (fs.existsSync(filePath) && isManualAsset(safeName, "map") && !allowManual) {
    console.log(`ℹ Manuell gepflegte Karte für ${name} ist geschützt, überspringe Download.`);
    return "ok";
  }

  if (!force && fs.existsSync(filePath) && lastSavedAssessmentId[safeName] === assessmentId) {
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

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 10_000 || !isJpegBuffer(buffer)) {
      console.warn(`⚠ Ungültige oder zu kleine Kartendatei für ${name}; vorhandene Karte bleibt erhalten.`);
      return "missing";
    }
    fs.writeFileSync(tempFilePath, buffer);
    fs.renameSync(tempFilePath, filePath);

    console.log(`✔ Karte gespeichert: ${filePath}`);

    if (recordAssessment) {
      lastSavedAssessmentId[safeName] = assessmentId;
      fs.writeFileSync(ASSESSMENT_TRACK_FILE, JSON.stringify(lastSavedAssessmentId, null, 2));
    }
    return "ok";
  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.error(`❌ Fehler beim Download der Karte für ${name}: ${err.message}`);
    logError(`Fehler beim Download der Karte für ${name}: ${err.message}`);
    return "error";
  }
}

// =======================
// XENO-CANTO + COMMONS + iNATURALIST SOUNDS (Open first, NC fallback) - MULTI PAGE
// =======================

function normalizeLicenseUrl(lic) {
  if (!lic) return "";
  if (lic.startsWith("//")) return "https:" + lic;
  return lic;
}

function isNcLicense(lic) {
  const s = String(lic || "").toLowerCase();
  return (
    s.includes("by-nc") ||
    s.includes("noncommercial") ||
    s.includes("non-commercial")
  );
}

function isOpenCommercialLicense(lic) {
  const s = String(lic || "").toLowerCase();
  if (!s || isNcLicense(s)) return false;

  return (
    s.includes("creativecommons.org/licenses/by/") ||
    s.includes("creativecommons.org/licenses/by-sa/") ||
    s.includes("creativecommons.org/licenses/by-nd/") ||
    s.includes("creativecommons.org/publicdomain/zero/") ||
    s.includes("public-domain") ||
    s.includes("cc0") ||
    /\bcc-by(-sa|-nd)?\b/.test(s)
  );
}

function isMp3Buffer(buffer) {
  return (
    buffer.length >= 3 &&
    (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    )
  );
}

function readSoundLicense(creditsPath) {
  if (!fs.existsSync(creditsPath)) return "";

  try {
    const credits = JSON.parse(fs.readFileSync(creditsPath, "utf8"));
    return normalizeLicenseUrl(credits.license || "");
  } catch (err) {
    logError(`Credits konnten nicht gelesen werden (${creditsPath}): ${err.message}`);
    return "";
  }
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

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function commonsMetaValue(meta, key) {
  return stripHtml(meta?.[key]?.value || "");
}

function commonsMp3Url(fileUrl) {
  if (!fileUrl) return "";
  if (/\.mp3($|\?)/i.test(fileUrl)) return fileUrl;

  const fileName = fileUrl.split("/").pop();
  if (!fileName || !/\.(ogg|oga)$/i.test(fileName)) return "";

  return fileUrl.replace("/wikipedia/commons/", "/wikipedia/commons/transcoded/") + `/${fileName}.mp3`;
}

async function isReachableMp3(url) {
  if (!url) return false;

  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function isExactCommonsSpecies(hit, genus, species) {
  const scientific = `${genus} ${species}`.toLowerCase();
  const scientificUnderscore = `${genus}_${species}`.toLowerCase();
  const haystack = [hit.title, hit.description, hit.categories, hit.objectName].join(" ").toLowerCase();

  return haystack.includes(scientific) || haystack.includes(scientificUnderscore);
}

async function fetchCommonsAudioCandidates(query) {
  const apiUrl =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrnamespace=6&gsrlimit=20" +
    `&gsrsearch=${encodeURIComponent(query)}` +
    "&prop=imageinfo&iiprop=url|mime|extmetadata";

  try {
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "fnwildlifetravel-iucn-sound-updater/1.0" },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});

    return pages
      .map((page) => {
        const info = page.imageinfo?.[0] || {};
        const meta = info.extmetadata || {};
        const licenseUrl = normalizeLicenseUrl(commonsMetaValue(meta, "LicenseUrl"));
        const licenseShort = commonsMetaValue(meta, "LicenseShortName");
        const usageTerms = commonsMetaValue(meta, "UsageTerms");
        const mp3Url = commonsMp3Url(info.url || "");

        return {
          query,
          title: page.title || "",
          fileUrl: info.url || "",
          mp3Url,
          descriptionUrl: info.descriptionurl || "",
          mime: info.mime || "",
          license: licenseUrl || licenseShort || usageTerms,
          licenseShort,
          artist: commonsMetaValue(meta, "Artist"),
          credit: commonsMetaValue(meta, "Credit"),
          description: commonsMetaValue(meta, "ImageDescription"),
          categories: commonsMetaValue(meta, "Categories"),
          objectName: commonsMetaValue(meta, "ObjectName"),
        };
      })
      .filter((hit) => {
        const looksAudio =
          String(hit.mime || "").startsWith("audio/") ||
          /\.(mp3|ogg|oga|wav|flac|opus)$/i.test(hit.title) ||
          /\.(mp3|ogg|oga|wav|flac|opus)$/i.test(hit.fileUrl);

        return looksAudio && isOpenCommercialLicense(hit.license) && hit.mp3Url;
      });
  } catch (err) {
    logError(`Commons-Suche fehlgeschlagen (${query}): ${err.message}`);
    return [];
  }
}

function scoreCommonsHit(hit, genus, species) {
  const scientific = `${genus} ${species}`.toLowerCase();
  const scientificUnderscore = `${genus}_${species}`.toLowerCase();
  const title = String(hit.title || "").toLowerCase();
  const description = String(hit.description || "").toLowerCase();
  const categories = String(hit.categories || "").toLowerCase();

  let score = 0;
  if (title.includes(scientific) || title.includes(scientificUnderscore)) score += 50;
  if (description.includes(scientific) || description.includes(scientificUnderscore)) score += 20;
  if (categories.includes(scientific) || categories.includes(scientificUnderscore)) score += 10;
  if (String(hit.license || "").toLowerCase().includes("/by/")) score += 3;
  if (String(hit.license || "").toLowerCase().includes("/by-sa/")) score += 2;
  return score;
}

async function findCommonsRecording(genus, species, german) {
  const queries = [
    `${genus} ${species} audio`,
    `${genus} ${species} sound`,
    `${genus} ${species} call`,
  ];

  const candidates = [];
  const seen = new Set();

  for (const query of queries) {
    const hits = await fetchCommonsAudioCandidates(query);
    for (const hit of hits) {
      const key = hit.descriptionUrl || hit.fileUrl || hit.title;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!isExactCommonsSpecies(hit, genus, species)) continue;
      candidates.push(hit);
    }
    await sleep(150);
  }

  candidates.sort((a, b) => scoreCommonsHit(b, genus, species) - scoreCommonsHit(a, genus, species));

  for (const hit of candidates) {
    if (await isReachableMp3(hit.mp3Url)) return hit;
  }

  if (candidates.length) {
    console.log(`⚠ Commons-Treffer für ${german}, aber kein erreichbarer MP3-Transcode.`);
  }

  return null;
}

function inatLicenseUrl(code) {
  const value = String(code || "").toLowerCase().replace(/^cc-/, "");
  if (!value) return "";
  if (value === "cc0" || value === "public-domain") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (value === "by") return "https://creativecommons.org/licenses/by/4.0/";
  if (value === "by-sa") return "https://creativecommons.org/licenses/by-sa/4.0/";
  if (value === "by-nd") return "https://creativecommons.org/licenses/by-nd/4.0/";
  return code;
}

function inatSounds(observation) {
  const direct = Array.isArray(observation.sounds) ? observation.sounds : [];
  const nested = Array.isArray(observation.observation_sounds)
    ? observation.observation_sounds.map((entry) => entry.sound).filter(Boolean)
    : [];

  return [...direct, ...nested];
}

function inatSoundUrl(sound) {
  return sound.file_url || sound.fileUrl || sound.url || sound.original_url || "";
}

function isDirectMp3Sound(sound) {
  const contentType = String(sound.file_content_type || "").toLowerCase();
  const url = inatSoundUrl(sound);
  return contentType.includes("audio/mpeg") || /\.mp3($|\?)/i.test(url);
}

async function fetchInatObservations(genus, species, qualityGrade) {
  const scientific = `${genus} ${species}`;
  const params = new URLSearchParams({
    taxon_name: scientific,
    sounds: "true",
    per_page: "100",
    order_by: "created_at",
    order: "desc",
  });
  if (qualityGrade) params.set("quality_grade", qualityGrade);

  const apiUrl = `https://api.inaturalist.org/v1/observations?${params.toString()}`;

  try {
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "fnwildlifetravel-iucn-sound-updater/1.0" },
    });
    if (!res.ok) return { ok: false, status: res.status, results: [], apiUrl };

    const data = await res.json();
    return { ok: true, status: res.status, results: Array.isArray(data.results) ? data.results : [], apiUrl };
  } catch (err) {
    logError(`iNaturalist-Suche fehlgeschlagen (${scientific}): ${err.message}`);
    return { ok: false, status: 0, results: [], apiUrl };
  }
}

async function findInatRecording(genus, species, german) {
  const scientific = `${genus} ${species}`.toLowerCase();
  const qualityPasses = ["research", "needs_id", ""];
  const seen = new Set();

  for (const qualityGrade of qualityPasses) {
    const resp = await fetchInatObservations(genus, species, qualityGrade);
    if (!resp.ok) {
      console.warn(`⚠ iNaturalist API Fehler ${resp.status} für ${genus} ${species}`);
      await sleep(250);
      continue;
    }

    for (const observation of resp.results) {
      const taxonName = String(observation.taxon?.name || "").toLowerCase();
      if (taxonName !== scientific) continue;

      for (const sound of inatSounds(observation)) {
        const url = inatSoundUrl(sound);
        const key = sound.uuid || sound.id || url;
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const license = sound.license_code || sound.license || "";
        if (!isOpenCommercialLicense(license)) continue;
        if (!isDirectMp3Sound(sound)) continue;
        if (!(await isReachableMp3(url))) continue;

        return { observation, sound, url, qualityGrade: qualityGrade || "any" };
      }
    }

    await sleep(250);
  }

  console.log(`ℹ Keine freie iNaturalist-MP3 gefunden für ${german}.`);
  return null;
}

async function downloadSoundIfMissing(genus, species, german) {
  const safeGerman = sanitizeAssetName(german);
  const targetDir = speciesAssetDir(safeGerman);

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const mp3Path = path.join(targetDir, "sound.mp3");
  const creditsPath = path.join(targetDir, "credits.json");

  if (fs.existsSync(mp3Path) && isManualAsset(safeGerman, "sound")) {
    console.log(`🎵 Manuell gepflegter Sound für ${german} ist geschützt, überspringe Suche.`);
    return fs.existsSync(creditsPath) ? "ok" : "missing";
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

  const openStages = stages.filter((stage) => stage.openOnly);
  const fallbackStages = stages.filter((stage) => !stage.openOnly);

  if (fs.existsSync(mp3Path)) {
    const hasCredits = fs.existsSync(creditsPath);
    const existingLicense = readSoundLicense(creditsPath);

    if (hasCredits && !isNcLicense(existingLicense)) {
      console.log(`🎵 Sound existiert bereits für ${german}`);
      return "ok";
    }

    console.log(
      hasCredits
        ? `🎵 NC-Sound existiert für ${german}; prüfe freie Alternative.`
        : `🎵 Sound ohne Credits existiert für ${german}; prüfe dokumentierte freie Alternative.`,
    );
    for (let i = 0; i < openStages.length; i++) {
      const hit = await findRecordingByStage(genus, species, openStages[i]);
      if (hit?.rec) {
        const originalStageIndex = stages.indexOf(openStages[i]);
        console.log(`✔ Freie Alternative gefunden für ${german} (Stage ${originalStageIndex}).`);
        return await saveSoundRecording({
          genus,
          species,
          german,
          mp3Path,
          creditsPath,
          chosen: hit.rec,
          chosenInfo: hit,
          chosenStageIndex: originalStageIndex,
          stages,
        });
      }
    }

    const commonsHit = await findCommonsRecording(genus, species, german);
    if (commonsHit) {
      console.log(`✔ Freie Commons-Alternative gefunden für ${german}.`);
      return await saveCommonsSoundRecording({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        hit: commonsHit,
      });
    }

    const inatHit = await findInatRecording(genus, species, german);
    if (inatHit) {
      console.log(`✔ Freie iNaturalist-Alternative gefunden für ${german}.`);
      return await saveInatSoundRecording({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        hit: inatHit,
      });
    }

    console.log(
      hasCredits
        ? `ℹ Keine freie Alternative gefunden für ${german}; vorhandener NC-Sound bleibt erhalten.`
        : `⚠ Keine dokumentierte freie Alternative gefunden für ${german}; vorhandener Sound bleibt ohne Credits.`,
    );
    return hasCredits ? "ok" : "missing";
  }

  let chosen = null;
  let chosenInfo = null;
  let chosenStageIndex = null;

  for (let i = 0; i < openStages.length; i++) {
    const hit = await findRecordingByStage(genus, species, openStages[i]);
    if (hit?.rec) {
      chosen = hit.rec;
      chosenInfo = hit;
      chosenStageIndex = stages.indexOf(openStages[i]);
      break;
    }
  }

  if (!chosen) {
    const commonsHit = await findCommonsRecording(genus, species, german);
    if (commonsHit) {
      console.log(`✔ Freie Commons-Aufnahme gefunden für ${german}.`);
      return await saveCommonsSoundRecording({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        hit: commonsHit,
      });
    }
  }

  if (!chosen) {
    const inatHit = await findInatRecording(genus, species, german);
    if (inatHit) {
      console.log(`✔ Freie iNaturalist-Aufnahme gefunden für ${german}.`);
      return await saveInatSoundRecording({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        hit: inatHit,
      });
    }
  }

  for (let i = 0; !chosen && i < fallbackStages.length; i++) {
    const hit = await findRecordingByStage(genus, species, fallbackStages[i]);
    if (hit?.rec) {
      chosen = hit.rec;
      chosenInfo = hit;
      chosenStageIndex = stages.indexOf(fallbackStages[i]);
      break;
    }
  }

  if (!chosen) {
    console.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
    return "missing";
  }

  return await saveSoundRecording({
    genus,
    species,
    german,
    mp3Path,
    creditsPath,
    chosen,
    chosenInfo,
    chosenStageIndex,
    stages,
  });
}

async function saveSoundRecording({
  genus,
  species,
  german,
  mp3Path,
  creditsPath,
  chosen,
  chosenInfo,
  chosenStageIndex,
  stages,
}) {
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

async function saveCommonsSoundRecording({ genus, species, german, mp3Path, creditsPath, hit }) {
  const tempMp3 = mp3Path + ".tmp";

  try {
    const audioRes = await fetch(hit.mp3Url);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der Commons-Datei (${audioRes.status})`);
      return "error";
    }

    const buffer = Buffer.from(await audioRes.arrayBuffer());
    if (!isMp3Buffer(buffer)) {
      console.warn("⚠ iNaturalist-Datei ist kein gültiges MP3, Treffer wird übersprungen.");
      return "error";
    }

    fs.writeFileSync(tempMp3, buffer);
    fs.renameSync(tempMp3, mp3Path);

    console.log(`✔ Commons-Sound gespeichert: ${mp3Path}`);

    const source = String(hit.credit || "").toLowerCase().includes("inaturalist")
      ? "Wikimedia Commons / iNaturalist"
      : "Wikimedia Commons";

    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: hit.artist || "n/a",
      country: "n/a",
      location: "n/a",
      quality: "n/a",
      license: normalizeLicenseUrl(hit.license) || "n/a",
      source,
      url: hit.descriptionUrl || hit.fileUrl || "n/a",
      notes: `Free Commons replacement. Query="${hit.query}" | title="${hit.title}" | original=${hit.fileUrl} | mp3=${hit.mp3Url}`,
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    return "ok";
  } catch (err) {
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
    console.error(`❌ Fehler beim Commons-Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Commons-Sound ${genus} ${species}: ${err.message}`);
    return "error";
  }
}

async function saveInatSoundRecording({ genus, species, german, mp3Path, creditsPath, hit }) {
  const tempMp3 = mp3Path + ".tmp";

  try {
    const audioRes = await fetch(hit.url);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der iNaturalist-Datei (${audioRes.status})`);
      return "error";
    }

    const buffer = await audioRes.arrayBuffer();
    fs.writeFileSync(tempMp3, Buffer.from(buffer));
    fs.renameSync(tempMp3, mp3Path);

    console.log(`✔ iNaturalist-Sound gespeichert: ${mp3Path}`);

    const observation = hit.observation;
    const sound = hit.sound;
    const user = observation.user?.login || "n/a";
    const license = sound.license_code || sound.license || "";

    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: sound.attribution || user,
      country: "n/a",
      location: observation.place_guess || "n/a",
      quality: observation.quality_grade || hit.qualityGrade || "n/a",
      license: inatLicenseUrl(license) || "n/a",
      source: "iNaturalist",
      url: observation.uri || `https://www.inaturalist.org/observations/${observation.id}`,
      notes: `Free iNaturalist replacement. Observation=${observation.id} | user=${user} | license=${license} | sound=${sound.id || sound.uuid || "n/a"} | file=${hit.url}`,
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    return "ok";
  } catch (err) {
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
    console.error(`❌ Fehler beim iNaturalist-Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`iNaturalist-Sound ${genus} ${species}: ${err.message}`);
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
      missingSpeciesAssets: 0,
      ncSoundLicensesAll: 0,
    },
    missing: {
      soundMp3: [],
      soundCredits: [],
      maps: [],
      speciesAssets: [],
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

    const assetDir = speciesAssetDir(safe);
    const assetMapPath = path.join(assetDir, "map.jpg");
    const assetSoundPath = path.join(assetDir, "sound.mp3");
    const assetCreditsPath = path.join(assetDir, "credits.json");
    const assetSpectrogramPath = path.join(assetDir, "spectrogram.webp");
    const hasMp3 = fs.existsSync(assetSoundPath);
    const hasCredits = fs.existsSync(assetCreditsPath);
    const hasMap = fs.existsSync(assetMapPath);

    if (!hasMp3) report.missing.soundMp3.push(german);
    if (hasMp3 && !hasCredits) report.missing.soundCredits.push(german);
    if (!hasMap) report.missing.maps.push(german);

    const missingAssetParts = [];
    if (!fs.existsSync(assetMapPath)) missingAssetParts.push("map.jpg");
    if (!fs.existsSync(assetSoundPath)) missingAssetParts.push("sound.mp3");
    if (!fs.existsSync(assetCreditsPath)) missingAssetParts.push("credits.json");
    if (!fs.existsSync(assetSpectrogramPath)) missingAssetParts.push("spectrogram.webp");
    if (missingAssetParts.length) {
      report.missing.speciesAssets.push({ german, safeName: safe, missing: missingAssetParts });
    }
  }

  // NC-Lizenzen (alle vorhandenen Sounds mit credits.json)
  const ncAll = [];
  for (const s of speciesData) {
    const german = s["Deutscher Name"] || s["Wissenschaftlicher Name"] || "unknown";
    const safe = sanitizeAssetName(german);

    const assetCreditsPath = path.join(speciesAssetDir(safe), "credits.json");
    if (!fs.existsSync(assetCreditsPath)) continue;

    try {
      const c = JSON.parse(fs.readFileSync(assetCreditsPath, "utf8"));
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
  report.counts.missingSpeciesAssets = report.missing.speciesAssets.length;
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
    const args = parsePipelineArgs(process.argv.slice(2));
    if (args.help) {
      printPipelineHelp();
      return;
    }

    const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
    if (!Array.isArray(speciesList)) throw new Error("species_list.json muss ein Array enthalten.");
    const existingSpeciesData = loadExistingSpeciesData();
    if (args.reportOnly) {
      const report = createMissingElementsReport(existingSpeciesData);
      atomicWriteJson("fehlende_elemente_report.json", report);
      printReportToConsole(report);
      console.log("✔ fehlende_elemente_report.json aus aktuellem Daten-/Assetstand neu aufgebaut!");
      return;
    }
    const plan = buildPipelinePlan({
      speciesList,
      existingSpeciesData,
      repoRoot: process.cwd(),
      sanitizeAssetName,
      mode: args.mode,
    });

    if (args.dryRun) {
      console.log(JSON.stringify({
        dryRun: true,
        mode: plan.mode,
        inputCount: plan.inputCount,
        targetCount: plan.targetCount,
        targets: plan.targets.map(({ slug, safeName, germanName, scientificName, reasons }) => ({
          slug,
          safeName,
          germanName,
          scientificName,
          reasons,
        })),
        removedCount: plan.removedCount,
        removed: plan.removed,
        hasWork: plan.hasWork,
      }, null, 2));
      return;
    }

    if (args.mode !== "nc-sounds" && !TOKEN) {
      throw new Error("IUCN_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
    }
    if (args.mode !== "manual-maps" && !XENO_TOKEN) {
      throw new Error("XENO_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
    }
    if (!fs.existsSync(SPECIES_ASSETS_DIR)) fs.mkdirSync(SPECIES_ASSETS_DIR);

    if (args.mode !== "all" && !plan.hasWork) {
      const noWorkMessage = {
        missing: "Keine neuen oder unvollständigen Arten gefunden.",
        "manual-maps": "Keine manuell gepflegten Karten gefunden.",
        "nc-sounds": "Keine ungeschützten NC-Sounds oder fehlenden Sounds gefunden.",
      }[args.mode] || "Keine Pipeline-Aktionen gefunden.";
      console.log(`✔ ${noWorkMessage} Es sind keine Pipeline-Aktionen erforderlich.`);
      return;
    }

    const assetOnlyMode = args.mode === "manual-maps" || args.mode === "nc-sounds";
    const existingBySlug = new Map(existingSpeciesData.map((entry) => [entry.URLSlug, entry]));
    const targetSlugs = new Set(plan.targets.map((entry) => entry.slug));
    const output = [];

    for (const s of speciesList) {
      const existingData = existingBySlug.get(getInputSlug(s));
      if (!targetSlugs.has(getInputSlug(s)) && existingData) {
        output.push(preserveExistingSpeciesData(existingData, s));
        continue;
      }

      let data = assetOnlyMode && existingData
        ? preserveExistingSpeciesData(existingData, s)
        : await fetchSpeciesData(s.genus, s.species, s.german, s.size, s.weight, s.life_expectancy);

      if (!hasUsableSpeciesData(data) && hasUsableSpeciesData(existingData)) {
        console.warn(`⚠ Verwende vorhandene Daten für ${s.german}, neuer Abruf war unvollständig.`);
        logError(`Fallback auf vorhandene Daten: ${s.german} (${s.genus} ${s.species})`);
        data = preserveExistingSpeciesData(existingData, s);
      }

      output.push(data);

      const soundStatus = args.mode === "manual-maps"
        ? "ok"
        : await downloadSoundIfMissing(s.genus, s.species, s.german);
      const mapStatus = args.mode === "nc-sounds"
        ? "ok"
        : await downloadMapForSpecies(
          data,
          args.mode === "manual-maps"
            ? { force: true, allowManual: true, recordAssessment: false }
            : undefined,
        );

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

    if (assetOnlyMode) {
      console.log("✔ Gezielter Asset-Suchlauf abgeschlossen; Artendaten bleiben unverändert.");
    } else {
      atomicWriteJson("speciesData.json", output);
      console.log("✔ speciesData.json aktualisiert!");

      const report = createMissingElementsReport(output);
      atomicWriteJson("fehlende_elemente_report.json", report);
      printReportToConsole(report);
      console.log("✔ fehlende_elemente_report.json erstellt!");
    }
  } catch (err) {
    console.error("❌ Fehler im Hauptprozess: " + err);
    logError("Hauptprozess: " + err.message);
    process.exitCode = 1;
  }
})().finally(exitAfterMain);
