import {
  isOpenCommercialLicense,
  normalizeLicenseUrl,
} from "./sound-source-license.mjs";

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaValue(meta, key) {
  return stripHtml(meta?.[key]?.value ?? "");
}

export function commonsMp3Url(fileUrl) {
  const url = String(fileUrl ?? "");
  if (/\.mp3($|\?)/i.test(url)) return url;
  const fileName = url.split("/").pop();
  if (!fileName || !/\.(ogg|oga)$/i.test(fileName)) return "";
  return url.replace("/wikipedia/commons/", "/wikipedia/commons/transcoded/") + `/${fileName}.mp3`;
}

function isExactSpecies(hit, genus, species) {
  const scientific = `${genus} ${species}`.toLowerCase();
  const underscore = `${genus}_${species}`.toLowerCase();
  const haystack = [hit.title, hit.description, hit.categories, hit.objectName].join(" ").toLowerCase();
  return haystack.includes(scientific) || haystack.includes(underscore);
}

function scoreHit(hit, genus, species) {
  const scientific = `${genus} ${species}`.toLowerCase();
  const underscore = `${genus}_${species}`.toLowerCase();
  const title = String(hit.title ?? "").toLowerCase();
  const description = String(hit.description ?? "").toLowerCase();
  const categories = String(hit.categories ?? "").toLowerCase();
  let score = 0;
  if (title.includes(scientific) || title.includes(underscore)) score += 50;
  if (description.includes(scientific) || description.includes(underscore)) score += 20;
  if (categories.includes(scientific) || categories.includes(underscore)) score += 10;
  if (String(hit.license ?? "").toLowerCase().includes("/by/")) score += 3;
  if (String(hit.license ?? "").toLowerCase().includes("/by-sa/")) score += 2;
  return score;
}

export function createWikimediaCommonsAudioAdapter({
  fetch,
  sleep,
  logError = () => {},
  logger = console,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("Commons-Adapter benötigt fetch.");
  if (typeof sleep !== "function") throw new TypeError("Commons-Adapter benötigt sleep.");

  async function isReachableMp3(url) {
    if (!url) return false;
    try {
      return (await fetch(url, { method: "HEAD" })).ok;
    } catch {
      return false;
    }
  }

  async function fetchCandidates(query) {
    const apiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*"
      + "&generator=search&gsrnamespace=6&gsrlimit=20"
      + `&gsrsearch=${encodeURIComponent(query)}`
      + "&prop=imageinfo&iiprop=url|mime|extmetadata";
    try {
      const response = await fetch(apiUrl, {
        headers: { "User-Agent": "fnwildlifetravel-iucn-sound-updater/1.0" },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Object.values(data.query?.pages ?? {})
        .map((page) => {
          const info = page.imageinfo?.[0] ?? {};
          const meta = info.extmetadata ?? {};
          const licenseUrl = normalizeLicenseUrl(metaValue(meta, "LicenseUrl"));
          const licenseShort = metaValue(meta, "LicenseShortName");
          const usageTerms = metaValue(meta, "UsageTerms");
          return {
            query,
            title: page.title ?? "",
            fileUrl: info.url ?? "",
            mp3Url: commonsMp3Url(info.url ?? ""),
            descriptionUrl: info.descriptionurl ?? "",
            mime: info.mime ?? "",
            license: licenseUrl || licenseShort || usageTerms,
            licenseShort,
            artist: metaValue(meta, "Artist"),
            credit: metaValue(meta, "Credit"),
            description: metaValue(meta, "ImageDescription"),
            categories: metaValue(meta, "Categories"),
            objectName: metaValue(meta, "ObjectName"),
          };
        })
        .filter((hit) => {
          const looksAudio = String(hit.mime).startsWith("audio/")
            || /\.(mp3|ogg|oga|wav|flac|opus)$/i.test(hit.title)
            || /\.(mp3|ogg|oga|wav|flac|opus)$/i.test(hit.fileUrl);
          return looksAudio && isOpenCommercialLicense(hit.license) && hit.mp3Url;
        });
    } catch (error) {
      logError(`Commons-Suche fehlgeschlagen (${query}): ${error.message}`);
      return [];
    }
  }

  async function findRecording(genus, species, german, { isRejected = () => false } = {}) {
    const candidates = [];
    const seen = new Set();
    for (const query of [
      `${genus} ${species} audio`,
      `${genus} ${species} sound`,
      `${genus} ${species} call`,
    ]) {
      for (const hit of await fetchCandidates(query)) {
        const key = hit.descriptionUrl || hit.fileUrl || hit.title;
        if (seen.has(key) || !isExactSpecies(hit, genus, species) || isRejected(hit)) continue;
        seen.add(key);
        candidates.push(hit);
      }
      await sleep(150);
    }
    candidates.sort((left, right) => scoreHit(right, genus, species) - scoreHit(left, genus, species));
    for (const hit of candidates) {
      if (await isReachableMp3(hit.mp3Url)) return hit;
    }
    if (candidates.length) logger.log(`⚠ Commons-Treffer für ${german}, aber kein erreichbarer MP3-Transcode.`);
    return null;
  }

  return Object.freeze({ findRecording });
}
