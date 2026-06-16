import fs from "node:fs";
import path from "node:path";

const DEFAULT_SITEMAP_URL = "https://www.fnwildlifetravel.de/sitemap.xml";
const DEFAULT_PAGES_BASE = "https://felixkfm90.github.io/iucn-species-data";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CONCURRENCY = 8;

const args = parseArgs(process.argv.slice(2));

const config = {
  cwd: process.cwd(),
  sitemapUrl: args.sitemapUrl || DEFAULT_SITEMAP_URL,
  pagesBase: trimTrailingSlash(args.pagesBase || DEFAULT_PAGES_BASE),
  timeoutMs: Number(args.timeoutMs || DEFAULT_TIMEOUT_MS),
  concurrency: Number(args.concurrency || DEFAULT_CONCURRENCY),
  skipLive: Boolean(args.skipLive),
  skipPages: Boolean(args.skipPages),
};

const result = {
  generatedAt: new Date().toISOString(),
  config: {
    sitemapUrl: config.sitemapUrl,
    pagesBase: config.pagesBase,
    timeoutMs: config.timeoutMs,
    concurrency: config.concurrency,
    skipLive: config.skipLive,
    skipPages: config.skipPages,
  },
  local: auditLocalProject(config.cwd),
};

if (!config.skipLive) {
  result.liveSite = await auditLiveSite(config);
}

if (!config.skipPages) {
  result.githubPages = await auditGithubPages(config);
}

console.log(JSON.stringify(result, null, 2));

function parseArgs(rawArgs) {
  const parsed = {};

  for (const arg of rawArgs) {
    if (arg === "--skip-live") parsed.skipLive = true;
    else if (arg === "--skip-pages") parsed.skipPages = true;
    else if (arg.startsWith("--sitemap-url=")) parsed.sitemapUrl = arg.slice("--sitemap-url=".length);
    else if (arg.startsWith("--pages-base=")) parsed.pagesBase = arg.slice("--pages-base=".length);
    else if (arg.startsWith("--timeout-ms=")) parsed.timeoutMs = arg.slice("--timeout-ms=".length);
    else if (arg.startsWith("--concurrency=")) parsed.concurrency = arg.slice("--concurrency=".length);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run audit:site -- [options]

Options:
  --skip-live              Skip Squarespace sitemap and page crawl.
  --skip-pages             Skip GitHub Pages live checks.
  --sitemap-url=<url>      Override sitemap URL.
  --pages-base=<url>       Override GitHub Pages base URL.
  --timeout-ms=<number>    Request timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.
  --concurrency=<number>   Concurrent live page fetches. Default: ${DEFAULT_CONCURRENCY}.
`);
}

function readJson(cwd, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(cwd, relativePath), "utf8"));
}

function auditLocalProject(cwd) {
  const speciesData = readJson(cwd, "speciesData.json");
  const speciesList = readJson(cwd, "species_list.json");
  const report = readJson(cwd, "fehlende_elemente_report.json");
  const mapDir = path.join(cwd, "Verbreitungskarten");
  const soundsDir = path.join(cwd, "sounds");
  const speciesAssetsDir = path.join(cwd, "species-assets");

  const mapFiles = fs.readdirSync(mapDir).filter((name) => name.toLowerCase().endsWith(".jpg"));
  const soundDirs = fs
    .readdirSync(soundsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const speciesAssetDirs = fs.existsSync(speciesAssetsDir)
    ? fs
      .readdirSync(speciesAssetsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    : [];

  const missing = [];
  const missingSpeciesAssets = [];
  for (const species of speciesData) {
    const germanName = species["Deutscher Name"];
    const safeName = sanitizeAssetName(germanName);
    const assetDir = path.join(speciesAssetsDir, safeName);
    const checks = {
      map: fs.existsSync(path.join(assetDir, "map.jpg")) || fs.existsSync(path.join(mapDir, `${safeName}.jpg`)),
      soundMp3: fs.existsSync(path.join(assetDir, "sound.mp3")) || fs.existsSync(path.join(soundsDir, safeName, `${safeName}.mp3`)),
      soundCredits: fs.existsSync(path.join(assetDir, "credits.json")) || fs.existsSync(path.join(soundsDir, safeName, "credits.json")),
      soundSpectrogram: fs.existsSync(path.join(assetDir, "spectrogram.webp")) || fs.existsSync(path.join(soundsDir, safeName, "spectrogram.webp")),
      urlSlug: Boolean(species.URLSlug),
      lifeExpectancy: Object.prototype.hasOwnProperty.call(species, "Lebenserwartung"),
    };
    const assetChecks = {
      map: fs.existsSync(path.join(assetDir, "map.jpg")),
      soundMp3: fs.existsSync(path.join(assetDir, "sound.mp3")),
      soundCredits: fs.existsSync(path.join(assetDir, "credits.json")),
      soundSpectrogram: fs.existsSync(path.join(assetDir, "spectrogram.webp")),
    };

    if (!Object.values(checks).every(Boolean)) {
      missing.push({ germanName, safeName, checks });
    }

    if (!Object.values(assetChecks).every(Boolean)) {
      missingSpeciesAssets.push({ germanName, safeName, checks: assetChecks });
    }
  }

  const mp3Count = soundDirs.filter((dir) => fs.existsSync(path.join(soundsDir, dir, `${dir}.mp3`))).length;
  const creditsCount = soundDirs.filter((dir) => fs.existsSync(path.join(soundsDir, dir, "credits.json"))).length;
  const spectrogramCount = soundDirs.filter((dir) => fs.existsSync(path.join(soundsDir, dir, "spectrogram.webp"))).length;
  const speciesAssetMapCount = speciesAssetDirs.filter((dir) => fs.existsSync(path.join(speciesAssetsDir, dir, "map.jpg"))).length;
  const speciesAssetSoundCount = speciesAssetDirs.filter((dir) => fs.existsSync(path.join(speciesAssetsDir, dir, "sound.mp3"))).length;
  const speciesAssetCreditsCount = speciesAssetDirs.filter((dir) => fs.existsSync(path.join(speciesAssetsDir, dir, "credits.json"))).length;
  const speciesAssetSpectrogramCount = speciesAssetDirs.filter((dir) => fs.existsSync(path.join(speciesAssetsDir, dir, "spectrogram.webp"))).length;
  const spectrogramBytes = soundDirs
    .map((dir) => path.join(soundsDir, dir, "spectrogram.webp"))
    .filter((filePath) => fs.existsSync(filePath))
    .reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
  const allSafeDirs = [...new Set([...soundDirs, ...speciesAssetDirs])];
  const ncSoundLicenses = allSafeDirs
    .map((dir) => readCreditsIfPresent(soundsDir, speciesAssetsDir, dir))
    .filter((entry) => entry && isNonCommercialLicense(entry.license))
    .map((entry) => ({
      safeName: entry.safeName,
      germanName: entry.credits.german_name || "",
      license: entry.license,
      source: entry.credits.source || "",
    }));

  const manualMapOverrides = readManualMapOverrides(cwd);

  return {
    speciesDataCount: speciesData.length,
    speciesListCount: speciesList.length,
    mapFileCount: mapFiles.length,
    soundDirCount: soundDirs.length,
    mp3Count,
    creditsCount,
    spectrogramCount,
    speciesAssetDirCount: speciesAssetDirs.length,
    speciesAssetMapCount,
    speciesAssetSoundCount,
    speciesAssetCreditsCount,
    speciesAssetSpectrogramCount,
    spectrogramBytes,
    reportGeneratedAt: report.generatedAt || null,
    reportCounts: report.counts || {},
    perSpeciesMissingCount: missing.length,
    perSpeciesMissing: missing,
    speciesAssetMissingCount: missingSpeciesAssets.length,
    speciesAssetMissing: missingSpeciesAssets,
    ncSoundLicenseCount: ncSoundLicenses.length,
    ncSoundLicenses,
    manualMapOverrideCount: manualMapOverrides.entries.length,
    manualMapOverrideMissingFiles: manualMapOverrides.missingFiles,
  };
}

function readCreditsIfPresent(soundsDir, speciesAssetsDir, safeName) {
  const assetPath = path.join(speciesAssetsDir, safeName, "credits.json");
  const legacyPath = path.join(soundsDir, safeName, "credits.json");
  const filePath = fs.existsSync(assetPath) ? assetPath : legacyPath;
  if (!fs.existsSync(filePath)) return null;

  const credits = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    safeName,
    credits,
    license: String(credits.license || ""),
  };
}

function isNonCommercialLicense(license) {
  return /(^|[-/])nc($|[-/])|noncommercial/i.test(license);
}

function readManualMapOverrides(cwd) {
  const filePath = path.join(cwd, "docs", "manual-map-overrides.md");
  if (!fs.existsSync(filePath)) {
    return { entries: [], missingFiles: [{ file: "docs/manual-map-overrides.md", exists: false }] };
  }

  const markdown = fs.readFileSync(filePath, "utf8");
  const entries = [...markdown.matchAll(/`(Verbreitungskarten\/[^`]+\.jpg)`/g)]
    .map((match) => match[1])
    .filter((entry) => !entry.includes("<"));
  const missingFiles = entries
    .filter((entry) => !fs.existsSync(path.join(cwd, ...entry.split("/"))))
    .map((entry) => ({ file: entry, exists: false }));

  return { entries, missingFiles };
}

async function auditLiveSite(config) {
  const sitemapResponse = await fetchText(config.sitemapUrl, config.timeoutMs);
  const urls = parseSitemapUrls(sitemapResponse.body);
  const sitemapPaths = new Set(urls.map(normalizeUrlPath));
  const allInternalLinks = new Set();

  const pages = await mapLimit(urls, config.concurrency, async (url) => {
    try {
      const response = await fetchText(url, config.timeoutMs);
      const links = getInternalLinks(response.body, response.finalUrl || url);
      for (const link of links) allInternalLinks.add(link);

      return {
        url,
        path: normalizeUrlPath(url),
        status: response.status,
        finalUrl: response.finalUrl,
        title: getTitle(response.body),
        metaDescription: getMetaDescription(response.body),
        internalLinkCount: links.length,
      };
    } catch (error) {
      return {
        url,
        path: normalizeUrlPath(url),
        error: error.message,
      };
    }
  });

  const fetchErrors = pages.filter((page) => page.error);
  const fetchedPages = pages.filter((page) => !page.error);
  const non200 = fetchedPages.filter((page) => page.status !== 200);
  const missingTitle = fetchedPages.filter((page) => !page.title).map((page) => page.path);
  const missingMetaDescription = fetchedPages.filter((page) => !page.metaDescription).map((page) => page.path);
  const internalLinksOutsideSitemap = [...allInternalLinks]
    .filter((linkPath) => !sitemapPaths.has(linkPath))
    .sort((a, b) => a.localeCompare(b));

  return {
    sitemapStatus: sitemapResponse.status,
    sitemapUrlCount: urls.length,
    fetchedPageCount: fetchedPages.length,
    fetchErrorCount: fetchErrors.length,
    non200Count: non200.length,
    missingTitleCount: missingTitle.length,
    missingMetaDescriptionCount: missingMetaDescription.length,
    internalLinksOutsideSitemapCount: internalLinksOutsideSitemap.length,
    fetchErrors,
    non200,
    missingTitle,
    missingMetaDescription,
    internalLinksOutsideSitemap,
  };
}

async function auditGithubPages(config) {
  const speciesData = await fetchJson(`${config.pagesBase}/speciesData.json?audit=${Date.now()}`, config.timeoutMs);
  const report = await fetchJson(`${config.pagesBase}/fehlende_elemente_report.json?audit=${Date.now()}`, config.timeoutMs);
  const samples = [
    "species-core.js",
    "species-info.js",
    "species-sound.js",
    "map-loader.js",
    "search.js",
    "lightbox-zoom.js",
    "species-assets/Amsel/map.jpg",
    "species-assets/Amsel/sound.mp3",
    "species-assets/Amsel/credits.json",
    "species-assets/Amsel/spectrogram.webp",
    "Verbreitungskarten/Amsel.jpg",
    "sounds/Amsel/Amsel.mp3",
    "sounds/Amsel/credits.json",
    "sounds/Amsel/spectrogram.webp",
  ];

  const sampleResults = await mapLimit(samples, config.concurrency, async (samplePath) => {
    const url = `${config.pagesBase}/${samplePath}?audit=${Date.now()}`;
    try {
      const response = await fetchHeadOrGet(url, config.timeoutMs);
      return {
        path: samplePath,
        status: response.status,
        contentLength: response.contentLength,
      };
    } catch (error) {
      return {
        path: samplePath,
        error: error.message,
      };
    }
  });

  return {
    speciesDataCount: Array.isArray(speciesData) ? speciesData.length : null,
    reportGeneratedAt: report.generatedAt || null,
    reportCounts: report.counts || {},
    sampleErrorCount: sampleResults.filter((sample) => sample.error).length,
    sampleResults,
  };
}

async function fetchJson(url, timeoutMs) {
  const response = await fetchText(url, timeoutMs);
  return JSON.parse(response.body);
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "iucn-species-data-audit/1.0",
      },
    });
    const body = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHeadOrGet(url, timeoutMs) {
  const response = await fetchWithMethod(url, timeoutMs, "HEAD");
  if (response.status !== 405 && response.status !== 403) return response;
  return fetchWithMethod(url, timeoutMs, "GET");
}

async function fetchWithMethod(url, timeoutMs, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "iucn-species-data-audit/1.0",
      },
    });

    return {
      status: response.status,
      contentLength: Number(response.headers.get("content-length") || 0),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/gis)].map((match) => decodeHtml(match[1].trim()));
}

function getTitle(html) {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
  return match ? decodeHtml(stripTags(match[1])) : "";
}

function getMetaDescription(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gis) || [];
  for (const tag of metaTags) {
    if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/is);
    if (content) return decodeHtml(content[1]);
  }
  return "";
}

function getInternalLinks(html, pageUrl) {
  const links = [];
  const page = new URL(pageUrl);
  const matches = html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi);

  for (const match of matches) {
    const href = decodeHtml(match[1]);
    if (!href || href.startsWith("#")) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;

    let url;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }

    if (url.hostname !== "www.fnwildlifetravel.de" && url.hostname !== "fnwildlifetravel.de") continue;
    links.push(normalizeUrlPath(url.href));
  }

  return links;
}

function normalizeUrlPath(url) {
  const parsed = new URL(url);
  let normalized = parsed.pathname || "/";
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, "");
  return normalized || "/";
}

function stripTags(input) {
  return String(input).replace(/<[^>]*>/g, "");
}

function decodeHtml(input) {
  return String(input)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
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

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}
