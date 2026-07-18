import {
  inatLicenseUrl,
  isOpenCommercialLicense,
} from "./sound-source-license.mjs";

function soundsFromObservation(observation) {
  const direct = Array.isArray(observation.sounds) ? observation.sounds : [];
  const nested = Array.isArray(observation.observation_sounds)
    ? observation.observation_sounds.map((entry) => entry.sound).filter(Boolean)
    : [];
  return [...direct, ...nested];
}

function soundUrl(sound) {
  return sound.file_url || sound.fileUrl || sound.url || sound.original_url || "";
}

function isDirectMp3(sound) {
  return String(sound.file_content_type ?? "").toLowerCase().includes("audio/mpeg")
    || /\.mp3($|\?)/i.test(soundUrl(sound));
}

export function createINaturalistAudioAdapter({
  fetch,
  sleep,
  logError = () => {},
  logger = console,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("iNaturalist-Adapter benötigt fetch.");
  if (typeof sleep !== "function") throw new TypeError("iNaturalist-Adapter benötigt sleep.");

  async function isReachableMp3(url) {
    if (!url) return false;
    try {
      return (await fetch(url, { method: "HEAD" })).ok;
    } catch {
      return false;
    }
  }

  async function fetchObservations(genus, species, qualityGrade) {
    const scientific = `${genus} ${species}`;
    const params = new URLSearchParams({
      taxon_name: scientific,
      sounds: "true",
      per_page: "100",
      order_by: "created_at",
      order: "desc",
    });
    if (qualityGrade) params.set("quality_grade", qualityGrade);
    const apiUrl = `https://api.inaturalist.org/v1/observations?${params}`;
    try {
      const response = await fetch(apiUrl, {
        headers: { "User-Agent": "fnwildlifetravel-iucn-sound-updater/1.0" },
      });
      if (!response.ok) return { ok: false, status: response.status, results: [], apiUrl };
      const data = await response.json();
      return {
        ok: true,
        status: response.status,
        results: Array.isArray(data.results) ? data.results : [],
        apiUrl,
      };
    } catch (error) {
      logError(`iNaturalist-Suche fehlgeschlagen (${scientific}): ${error.message}`);
      return { ok: false, status: 0, results: [], apiUrl };
    }
  }

  async function findRecording(genus, species, german, { isRejected = () => false } = {}) {
    const scientific = `${genus} ${species}`.toLowerCase();
    const seen = new Set();
    for (const qualityGrade of ["research", "needs_id", ""]) {
      const result = await fetchObservations(genus, species, qualityGrade);
      if (!result.ok) {
        logger.warn(`⚠ iNaturalist API Fehler ${result.status} für ${genus} ${species}`);
        await sleep(250);
        continue;
      }
      for (const observation of result.results) {
        if (String(observation.taxon?.name ?? "").toLowerCase() !== scientific) continue;
        for (const sound of soundsFromObservation(observation)) {
          const url = soundUrl(sound);
          const key = sound.uuid || sound.id || url;
          const license = sound.license_code || sound.license || "";
          const candidate = { observation, sound, url, qualityGrade: qualityGrade || "any" };
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (!isOpenCommercialLicense(license) || !isDirectMp3(sound) || isRejected(candidate)) continue;
          if (await isReachableMp3(url)) return candidate;
        }
      }
      await sleep(250);
    }
    logger.log(`ℹ Keine freie iNaturalist-MP3 gefunden für ${german}.`);
    return null;
  }

  return Object.freeze({ findRecording, licenseUrl: inatLicenseUrl });
}
