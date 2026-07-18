import { isNcLicense } from "./sound-source-license.mjs";

export function buildXenoQuery(genus, species, quality, constrainLength) {
  const parts = [`gen:${genus}`, `sp:${species}`];
  if (quality) parts.push(`q:${quality}`);
  if (constrainLength) parts.push("len:25-35");
  return parts.join(" ");
}

export function createXenoCantoAdapter({
  fetch,
  token,
  sleep,
  maxPages = 5,
  logger = console,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("Xeno-Canto-Adapter benötigt fetch.");
  if (typeof sleep !== "function") throw new TypeError("Xeno-Canto-Adapter benötigt sleep.");

  async function fetchPage(query, page) {
    const apiUrl = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}`
      + `&key=${encodeURIComponent(token ?? "")}&page=${page}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) return { ok: false, status: response.status, recordings: [], apiUrl };
      const data = await response.json();
      return {
        ok: true,
        status: response.status,
        recordings: Array.isArray(data.recordings) ? data.recordings : [],
        apiUrl,
        numPages: Number(data.numPages || data.num_pages || data.pages || 0) || null,
      };
    } catch (error) {
      return { ok: false, status: 0, recordings: [], apiUrl, error: error.message };
    }
  }

  async function findRecordingByStage(genus, species, stage, { isRejected = () => false } = {}) {
    const query = buildXenoQuery(genus, species, stage.q, stage.len2535);
    let pageLimit = maxPages;
    for (let page = 1; page <= pageLimit; page++) {
      const result = await fetchPage(query, page);
      if (!result.ok) {
        logger.warn(`⚠ Xeno-Canto API Fehler ${result.status} für ${genus} ${species} (page ${page})`);
        await sleep(150);
        continue;
      }
      if (result.numPages && result.numPages < pageLimit) pageLimit = result.numPages;
      const candidate = stage.openOnly
        ? result.recordings.find((recording) => !isNcLicense(recording.lic) && !isRejected(recording))
        : result.recordings.find((recording) => !isRejected(recording));
      if (candidate) return { rec: candidate, query, page };
      await sleep(result.recordings.length ? 80 : 80);
    }
    return null;
  }

  return Object.freeze({ findRecordingByStage });
}
