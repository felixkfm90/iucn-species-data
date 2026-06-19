import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..");
const PUBLIC_DIR = join(APP_DIR, "public");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const ASSET_FILES = new Set(["map.jpg", "sound.mp3", "credits.json", "spectrogram.webp"]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
};

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
    .replace(/[“”„‟]/g, "\"")
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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fileInfo(path) {
  try {
    const details = await stat(path);
    return { exists: details.isFile(), bytes: details.size };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

function parseManualMapOverrides(markdown) {
  const safeNames = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*[^|]+\|\s*([^|]+?)\s*\|\s*`species-assets\/([^/]+)\/map\.jpg`/);
    if (match) safeNames.add(match[2].trim());
  }
  return safeNames;
}

function scientificKey(genus, species) {
  return `${genus ?? ""} ${species ?? ""}`.trim().toLocaleLowerCase("de");
}

function valueOrUnknown(value) {
  if (value === null || value === undefined || value === "") return "Unbekannt";
  return value;
}

function normalizeComparable(value) {
  return String(value ?? "").trim();
}

function isMissingValue(value) {
  const normalized = normalizeComparable(value).toLocaleLowerCase("de");
  return !normalized || normalized === "n/a";
}

function compareValues(label, inputValue, generatedValue) {
  if (normalizeComparable(inputValue) === normalizeComparable(generatedValue)) return null;
  return {
    field: label,
    input: valueOrUnknown(inputValue),
    generated: valueOrUnknown(generatedValue),
    message: `${label} weicht zwischen Eingabe und Pipeline-Ausgabe ab`,
  };
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

function compareReportList(key, label, reportedValues, actualValues) {
  const reported = sortedUnique(reportedValues);
  const actual = sortedUnique(actualValues);
  const reportedSet = new Set(reported);
  const actualSet = new Set(actual);
  const missingFromReport = actual.filter((value) => !reportedSet.has(value));
  const staleInReport = reported.filter((value) => !actualSet.has(value));

  return {
    key,
    label,
    reportedCount: reported.length,
    actualCount: actual.length,
    missingFromReport,
    staleInReport,
    ok: missingFromReport.length === 0 && staleInReport.length === 0,
  };
}

export async function buildExplorerModel(repoRoot = REPO_ROOT) {
  const [inputList, generatedList, report, manualMapMarkdown] = await Promise.all([
    readJson(join(repoRoot, "species_list.json")),
    readJson(join(repoRoot, "speciesData.json")),
    readJson(join(repoRoot, "fehlende_elemente_report.json")),
    readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8"),
  ]);

  if (!Array.isArray(inputList) || !Array.isArray(generatedList)) {
    throw new Error("species_list.json und speciesData.json muessen Arrays enthalten.");
  }

  const inputByScientificName = new Map(
    inputList.map((entry) => [scientificKey(entry.genus, entry.species), entry]),
  );
  const generatedByScientificName = new Map(
    generatedList.map((entry) => [
      scientificKey(entry.Genus, entry.Species),
      entry,
    ]),
  );
  const manualMapSafeNames = parseManualMapOverrides(manualMapMarkdown);
  const ncNames = new Set(report.ncSoundLicensesAll ?? []);
  const allKeys = new Set([...inputByScientificName.keys(), ...generatedByScientificName.keys()]);
  const species = [];

  for (const key of allKeys) {
    const input = inputByScientificName.get(key) ?? null;
    const generated = generatedByScientificName.get(key) ?? null;
    const germanName = generated?.["Deutscher Name"] ?? input?.german ?? "Unbekannt";
    const scientificName = generated?.["Wissenschaftlicher Name"]
      ?? `${input?.genus ?? ""} ${input?.species ?? ""}`.trim()
      ?? "Unbekannt";
    const safeName = sanitizeAssetName(germanName);
    const assetDir = join(repoRoot, "species-assets", safeName);
    const [map, sound, creditsFile, spectrogram] = await Promise.all([
      fileInfo(join(assetDir, "map.jpg")),
      fileInfo(join(assetDir, "sound.mp3")),
      fileInfo(join(assetDir, "credits.json")),
      fileInfo(join(assetDir, "spectrogram.webp")),
    ]);

    let credits = null;
    let creditsError = "";
    if (creditsFile.exists) {
      try {
        credits = await readJson(join(assetDir, "credits.json"));
      } catch (error) {
        creditsError = error.message;
      }
    }

    const inconsistencies = [];
    const dataIssues = [];
    const assetIssues = [];
    const fieldMismatches = [];

    if (!input) dataIssues.push("Kein Eintrag in species_list.json");
    if (!generated) dataIssues.push("Kein Eintrag in speciesData.json");

    if (input && generated) {
      const expectedScientificName = `${input.genus ?? ""} ${input.species ?? ""}`.trim();
      const expectedSlug = `${input.genus ?? ""}${input.species ?? ""}`.toLocaleLowerCase("de");
      const comparisons = [
        compareValues("Deutscher Name", input.german, generated["Deutscher Name"]),
        compareValues("Wissenschaftlicher Name", expectedScientificName, generated["Wissenschaftlicher Name"]),
        compareValues("Größe", input.size, generated["Größe"]),
        compareValues("Gewicht", input.weight, generated.Gewicht),
        compareValues("Lebenserwartung", input.life_expectancy, generated.Lebenserwartung),
        compareValues("URL-Slug", expectedSlug, generated.URLSlug),
      ].filter(Boolean);
      fieldMismatches.push(...comparisons);
      dataIssues.push(...comparisons.map((comparison) => comparison.message));
    }

    if (generated) {
      if (isMissingValue(generated["Assessment ID"])) dataIssues.push("Assessment ID fehlt");
      if (isMissingValue(generated.Status)) dataIssues.push("IUCN-Status fehlt");
      if (isMissingValue(generated.Kategorie)) dataIssues.push("IUCN-Kategorie fehlt");
      if (isMissingValue(generated.Trend)) dataIssues.push("Populationstrend fehlt");
    }

    if (!map.exists) assetIssues.push("Karte fehlt");
    if (!sound.exists) assetIssues.push("Sound fehlt");
    if (!creditsFile.exists) assetIssues.push("Credits fehlen");
    if (creditsFile.exists && creditsError) assetIssues.push("Credits sind ungültig");
    if (!spectrogram.exists) assetIssues.push("Spektrogramm fehlt");
    inconsistencies.push(...dataIssues, ...assetIssues);
    const isManualMap = manualMapSafeNames.has(safeName);
    const isNcSound = String(credits?.license ?? "").toLocaleLowerCase("de").includes("/by-nc");

    species.push({
      id: generated?.URLSlug ?? key.replace(/\s+/g, ""),
      germanName,
      scientificName,
      safeName,
      slug: generated?.URLSlug ?? "",
      manual: {
        size: valueOrUnknown(input?.size),
        weight: valueOrUnknown(input?.weight),
        lifeExpectancy: valueOrUnknown(input?.life_expectancy),
      },
      iucn: {
        assessmentId: valueOrUnknown(generated?.["Assessment ID"]),
        status: valueOrUnknown(generated?.Status),
        category: valueOrUnknown(generated?.Kategorie),
        trend: valueOrUnknown(generated?.Trend),
        population: valueOrUnknown(generated?.["Populationgröße"]),
        generationLength: valueOrUnknown(generated?.Generationsdauer),
        lastUpdate: valueOrUnknown(generated?.["Letztes IUCN Update"]),
        fetchedAt: valueOrUnknown(generated?.["Daten abgerufen"]),
      },
      taxonomy: {
        kingdom: valueOrUnknown(generated?.Kingdom),
        phylum: valueOrUnknown(generated?.Phylum),
        className: valueOrUnknown(generated?.Class),
        order: valueOrUnknown(generated?.Order),
        family: valueOrUnknown(generated?.Family),
        genus: valueOrUnknown(generated?.Genus ?? input?.genus),
        species: valueOrUnknown(generated?.Species ?? input?.species),
      },
      assets: {
        map: {
          ...map,
          url: `/assets/${encodeURIComponent(safeName)}/map.jpg`,
          manuallyAdded: isManualMap,
        },
        sound: {
          ...sound,
          url: `/assets/${encodeURIComponent(safeName)}/sound.mp3`,
          manuallyAdded: false,
        },
        credits: { ...creditsFile, url: `/assets/${encodeURIComponent(safeName)}/credits.json` },
        spectrogram: {
          ...spectrogram,
          url: `/assets/${encodeURIComponent(safeName)}/spectrogram.webp`,
        },
      },
      credits,
      creditsError,
      isNcSound,
      reportNcSound: ncNames.has(germanName),
      isManualMap,
      fieldMismatches,
      dataIssues,
      assetIssues,
      inconsistencies,
    });
  }

  species.sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));

  const actualMissing = {
    soundMp3: species.filter((entry) => !entry.assets.sound.exists).map((entry) => entry.germanName),
    soundCredits: species
      .filter((entry) => entry.assets.sound.exists && !entry.assets.credits.exists)
      .map((entry) => entry.germanName),
    maps: species.filter((entry) => !entry.assets.map.exists).map((entry) => entry.germanName),
    speciesAssets: species
      .filter((entry) => (
        !entry.assets.map.exists
        || !entry.assets.sound.exists
        || !entry.assets.credits.exists
        || !entry.assets.spectrogram.exists
      ))
      .map((entry) => entry.germanName),
    assessmentId: generatedList
      .filter((entry) => isMissingValue(entry["Assessment ID"]))
      .map((entry) => entry["Deutscher Name"]),
    status: generatedList
      .filter((entry) => isMissingValue(entry.Status))
      .map((entry) => entry["Deutscher Name"]),
    category: generatedList
      .filter((entry) => isMissingValue(entry.Kategorie))
      .map((entry) => entry["Deutscher Name"]),
    trend: generatedList
      .filter((entry) => isMissingValue(entry.Trend))
      .map((entry) => entry["Deutscher Name"]),
    ncSoundLicensesAll: species.filter((entry) => entry.isNcSound).map((entry) => entry.germanName),
  };

  const reportChecks = [
    compareReportList("soundMp3", "Fehlende Sounds", report.missing?.soundMp3 ?? [], actualMissing.soundMp3),
    compareReportList(
      "soundCredits",
      "Fehlende Sound-Credits",
      report.missing?.soundCredits ?? [],
      actualMissing.soundCredits,
    ),
    compareReportList("maps", "Fehlende Karten", report.missing?.maps ?? [], actualMissing.maps),
    compareReportList(
      "speciesAssets",
      "Unvollständige Assetordner",
      (report.missing?.speciesAssets ?? []).map((entry) => entry.german),
      actualMissing.speciesAssets,
    ),
    compareReportList(
      "assessmentId",
      "Fehlende Assessment IDs",
      report.missing?.assessmentId ?? [],
      actualMissing.assessmentId,
    ),
    compareReportList("status", "Fehlende IUCN-Status", report.missing?.status ?? [], actualMissing.status),
    compareReportList(
      "category",
      "Fehlende IUCN-Kategorien",
      report.missing?.category ?? [],
      actualMissing.category,
    ),
    compareReportList("trend", "Fehlende Trends", report.missing?.trend ?? [], actualMissing.trend),
    compareReportList(
      "ncSoundLicensesAll",
      "NC-Soundlizenzen",
      report.ncSoundLicensesAll ?? [],
      actualMissing.ncSoundLicensesAll,
    ),
  ];

  const reportCounterIssues = [];
  const expectedCounters = {
    totalSpecies: generatedList.length,
    missingSoundMp3: (report.missing?.soundMp3 ?? []).length,
    missingSoundCredits: (report.missing?.soundCredits ?? []).length,
    missingMap: (report.missing?.maps ?? []).length,
    missingSpeciesAssets: (report.missing?.speciesAssets ?? []).length,
    missingAssessmentId: (report.missing?.assessmentId ?? []).length,
    missingStatus: (report.missing?.status ?? []).length,
    missingCategory: (report.missing?.category ?? []).length,
    missingTrend: (report.missing?.trend ?? []).length,
    ncSoundLicensesAll: (report.ncSoundLicensesAll ?? []).length,
  };
  for (const [key, expected] of Object.entries(expectedCounters)) {
    if (Number(report.counts?.[key]) !== expected) {
      reportCounterIssues.push(`${key}: Zähler ${report.counts?.[key] ?? "fehlt"}, Liste ${expected}`);
    }
  }

  const inputOnlyCount = [...inputByScientificName.keys()]
    .filter((key) => !generatedByScientificName.has(key)).length;
  const generatedOnlyCount = [...generatedByScientificName.keys()]
    .filter((key) => !inputByScientificName.has(key)).length;
  const dataIssueSpecies = species.filter((entry) => entry.dataIssues.length > 0);
  const assetIssueSpecies = species.filter((entry) => entry.assetIssues.length > 0);
  const reportIssueCount = reportChecks.filter((check) => !check.ok).length + reportCounterIssues.length;
  const validation = {
    status: dataIssueSpecies.length === 0 && assetIssueSpecies.length === 0 && reportIssueCount === 0
      ? "ok"
      : "issues",
    issueCount: dataIssueSpecies.length + assetIssueSpecies.length + reportIssueCount,
    data: {
      inputCount: inputList.length,
      generatedCount: generatedList.length,
      matchedCount: species.filter((entry) => (
        entry.dataIssues.length === 0
        && inputByScientificName.has(scientificKey(entry.taxonomy.genus, entry.taxonomy.species))
        && generatedByScientificName.has(scientificKey(entry.taxonomy.genus, entry.taxonomy.species))
      )).length,
      inputOnlyCount,
      generatedOnlyCount,
      mismatchSpeciesCount: species.filter((entry) => entry.fieldMismatches.length > 0).length,
      issueSpeciesCount: dataIssueSpecies.length,
    },
    assets: {
      completeSpeciesCount: species.length - assetIssueSpecies.length,
      issueSpeciesCount: assetIssueSpecies.length,
      available: {
        maps: species.filter((entry) => entry.assets.map.exists).length,
        sounds: species.filter((entry) => entry.assets.sound.exists).length,
        credits: species.filter((entry) => entry.assets.credits.exists).length,
        spectrograms: species.filter((entry) => entry.assets.spectrogram.exists).length,
      },
    },
    report: {
      consistent: reportIssueCount === 0,
      issueCount: reportIssueCount,
      checks: reportChecks,
      counterIssues: reportCounterIssues,
    },
    special: {
      manualMapCount: species.filter((entry) => entry.isManualMap).length,
      ncSoundCount: species.filter((entry) => entry.isNcSound).length,
    },
  };

  const summary = {
    speciesCount: species.length,
    inputCount: inputList.length,
    generatedCount: generatedList.length,
    reportGeneratedAt: report.generatedAt ?? null,
    missingCoreAssets: assetIssueSpecies.length,
    validationIssueSpecies: species.filter((entry) => entry.inconsistencies.length > 0).length,
    ncSoundCount: species.filter((entry) => entry.isNcSound).length,
    manualMapCount: species.filter((entry) => entry.isManualMap).length,
    readOnly: true,
  };

  return { summary, validation, species };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function safePublicPath(pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = normalize(join(PUBLIC_DIR, requested));
  return path.startsWith(PUBLIC_DIR) ? path : null;
}

function safeAssetPath(pathname, repoRoot) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "assets") return null;
  const safeName = decodeURIComponent(parts[1]);
  const fileName = parts[2];
  if (sanitizeAssetName(safeName) !== safeName || !ASSET_FILES.has(fileName)) return null;
  const assetRoot = join(repoRoot, "species-assets");
  const path = normalize(join(assetRoot, safeName, fileName));
  return path.startsWith(assetRoot) ? path : null;
}

async function sendFile(response, path) {
  if (!path || !existsSync(path)) {
    sendText(response, 404, "Nicht gefunden");
    return;
  }

  const details = await stat(path);
  if (!details.isFile()) {
    sendText(response, 404, "Nicht gefunden");
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": details.size,
    "Cache-Control": "no-store",
  });
  createReadStream(path).pipe(response);
}

export async function createExplorerServer({
  repoRoot = REPO_ROOT,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
} = {}) {
  let model = await buildExplorerModel(repoRoot);

  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendText(response, 405, "Read-only: Nur GET und HEAD sind erlaubt.");
        return;
      }

      if (url.pathname === "/api/summary") {
        sendJson(response, 200, model.summary);
        return;
      }

      if (url.pathname === "/api/species") {
        sendJson(response, 200, model.species);
        return;
      }

      if (url.pathname === "/api/validation") {
        sendJson(response, 200, model.validation);
        return;
      }

      if (url.pathname === "/api/reload") {
        model = await buildExplorerModel(repoRoot);
        sendJson(response, 200, { ok: true, summary: model.summary });
        return;
      }

      if (url.pathname.startsWith("/assets/")) {
        await sendFile(response, safeAssetPath(url.pathname, repoRoot));
        return;
      }

      await sendFile(response, safePublicPath(url.pathname));
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });

  return {
    host,
    port,
    server,
    listen() {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      return new Promise((resolveClose, reject) => {
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

function parsePort(argv) {
  const arg = argv.find((value) => value.startsWith("--port="));
  const parsed = Number(arg?.split("=")[1] ?? process.env.SPECIES_EXPLORER_PORT ?? DEFAULT_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await createExplorerServer({ port: parsePort(process.argv.slice(2)) });
  await app.listen();
  console.log(`Arten-Explorer: http://${app.host}:${app.port}`);
  console.log("Read-only. Beenden mit Strg+C.");
}
