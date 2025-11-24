import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const DIR = "./Verbreitungskarten";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const TOKEN = process.env.IUCN_TOKEN;
if (!TOKEN) {
console.error("❌ IUCN_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
process.exit(1);
}

const BASE = "https://api.iucnredlist.org/api/v4";
const RATE_LIMIT = 400; // ms Pause zwischen API-Requests

// Logging
function logError(msg) {
fs.appendFileSync("errors.log", "[" + new Date().toISOString() + "] " + msg + "\n");
}

function emptyEntry(name) {
return {
resolved_name: name,
status: "n/a",
assessment_url: "",
year_published: "n/a",
updated: new Date().toISOString().slice(0, 10)
};
}

async function iucnGET(path) {
const res = await fetch(BASE + path, {
headers: { "Authorization": TOKEN, "Accept": "application/json" }
});
if (!res.ok) return null;
return res.json();
}

async function getAssessmentData(assessmentId) {
try {
const res = await fetch(`${BASE}/assessment/${assessmentId}`, {
headers: { "Authorization": TOKEN, "Accept": "application/json" }
});
if (!res.ok) return { trend: "n/a", category: "n/a" };
const data = await res.json();
const assessment = data.population_trend ? data : data.result ? data.result[0] : null;
if (!assessment) return { trend: "n/a", category: "n/a" };
const trend = assessment.population_trend?.description?.en || "n/a";
const category = assessment.red_list_category?.description?.en || "n/a";
return { trend, category };
} catch (err) {
logError("Fehler bei Assessment " + assessmentId + ": " + err.message);
return { trend: "n/a", category: "n/a" };
}
}

async function fetchSpeciesData(genus, species, german) {
const scientific = `${genus} ${species}`;
try {
console.log(`→ Suche Taxon für ${scientific}`);
const taxonData = await iucnGET(`/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`);
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
  german,
  resolvedName,
  assessmentId,
  status: globalAssessment.red_list_category_code || "n/a",
  trend: assessmentInfo.trend,
  category: assessmentInfo.category,
  year: globalAssessment.year_published || "n/a"
};


} catch (err) {
console.error(`❌ Fehler bei ${scientific}: ${err}`);
logError("Fehler bei " + scientific + ": " + err.message);
return emptyEntry(scientific);
}
}

// Verbreitungskarten herunterladen
async function downloadMaps(speciesData) {
for (const s of speciesData) {
if (!s.assessmentId) continue;

const url = `https://www.iucnredlist.org/api/v4/assessments/${s.assessmentId}/distribution_map/jpg`;
const filePath = path.join(DIR, `${s.german} - ${s.assessmentId}.jpg`);
console.log(`→ Lade Karte für ${s.german} (${s.assessmentId})`);

try {
  const res = await fetch(url, {
    headers: {
      "Accept": "image/jpeg",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });
  if (!res.ok) {
    console.warn(`⚠ Karte für ${s.german} nicht gefunden (HTTP ${res.status})`);
    continue;
  }

  const buffer = await res.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(buffer));
  console.log(`✔ Karte gespeichert: ${filePath}`);
} catch (err) {
  console.error(`❌ Fehler beim Download der Karte für ${s.german}: ${err.message}`);
  logError(`Fehler beim Download der Karte für ${s.german}: ${err.message}`);
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
