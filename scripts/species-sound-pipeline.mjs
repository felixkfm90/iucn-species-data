import nativeFs from "node:fs";
import path from "node:path";
import { audioFormatLabel, detectAudioFormat, isMp3Buffer } from "./audio-format.mjs";
import { createXenoCantoAdapter } from "./xeno-canto-adapter.mjs";
import { createWikimediaCommonsAudioAdapter } from "./wikimedia-commons-audio-adapter.mjs";
import { createINaturalistAudioAdapter } from "./inaturalist-audio-adapter.mjs";
import { inatLicenseUrl, isNcLicense, normalizeLicenseUrl } from "./sound-source-license.mjs";
import { commonsSoundRejectionKey, normalizeSoundRejectionKey } from "./sound-rejection-key.mjs";

const SOUND_CANDIDATE_RETRY_LIMIT = 12;

/** Existing single-species sound search; destinations and mutable care decisions belong to its caller.
 * Construction/import performs no source reads, downloads or writes.
 */
export function createSpeciesSoundPipeline({
  fetch, token, sleep, sanitizeAssetName, speciesAssetDir, readAssetOverrides,
  logError = () => {}, logger = console, fileSystem = nativeFs,
} = {}) {
  for (const [name, value] of Object.entries({ fetch, sleep, sanitizeAssetName, speciesAssetDir, readAssetOverrides, logError })) {
    if (typeof value !== "function") throw new TypeError(`Soundpipeline benötigt ${name} als Funktion.`);
  }
  if (!logger || ["log", "warn", "error"].some(name => typeof logger[name] !== "function")
      || !fileSystem || ["existsSync", "mkdirSync", "readFileSync", "writeFileSync", "renameSync", "unlinkSync"].some(name => typeof fileSystem[name] !== "function")) {
    throw new TypeError("Soundpipeline benötigt Logger und explizite Dateizugriffe.");
  }
  const fs = fileSystem;
  const isManualAsset = (safeName, assetType) => readAssetOverrides()?.assets?.[safeName]?.[assetType]?.manual === true;

  function rejectedSoundKeys(safeName) {
    const sources = readAssetOverrides()?.assets?.[safeName]?.sound?.rejectedSources;
    if (!Array.isArray(sources)) return new Set();
    return new Set(sources
      .map((entry) => normalizeSoundRejectionKey(entry?.key))
      .filter(Boolean));
  }

  function isRejectedSoundCandidate(safeName, key, german, extraRejectedKeys = new Set()) {
    const normalizedKey = normalizeSoundRejectionKey(key);
    if (!normalizedKey) return false;
    const rejected = rejectedSoundKeys(safeName);
    const temporaryRejected = new Set(
      [...extraRejectedKeys].map((entry) => normalizeSoundRejectionKey(entry)).filter(Boolean),
    );
    if (!rejected.has(normalizedKey) && !temporaryRejected.has(normalizedKey)) return false;
    logger.log(`↩ Abgelehnte Soundquelle wird übersprungen für ${german}: ${normalizedKey}`);
    return true;
  }

  function xenoRejectionKey(recording) {
    const id = String(recording?.id ?? "").trim();
    if (id) return `xeno-canto:${id}`;
    const file = String(recording?.file ?? "").trim();
    return file ? `xeno-canto:${file}` : "";
  }

  function commonsRejectionKey(hit) {
    return commonsSoundRejectionKey(hit);
  }

  function inatRejectionKey(hit) {
    const observationId = String(hit?.observation?.id ?? "").trim();
    const soundId = String(hit?.sound?.id ?? hit?.sound?.uuid ?? hit?.url ?? "").trim();
    return `inaturalist:${observationId}:${soundId || "unknown"}`;
  }

  function soundRejectionKeyFromCredits(credits) {
    const explicit = String(credits?.rejectionKey ?? "").trim();
    if (explicit) return normalizeSoundRejectionKey(explicit);
    const source = String(credits?.source ?? "").toLocaleLowerCase("de");
    const url = String(credits?.url ?? "").trim();
    const notes = String(credits?.notes ?? "").trim();
    const xenoMatch = url.match(/xeno-canto\.org\/(\d+)/i) || notes.match(/xeno-canto\.org\/(\d+)/i);
    if (source.includes("xeno") && xenoMatch) return `xeno-canto:${xenoMatch[1]}`;
    if (source.includes("wikimedia")) {
      return normalizeSoundRejectionKey(`wikimedia-commons:${url || notes}`);
    }
    if (source.includes("inaturalist")) {
      const observation = notes.match(/Observation=([^|\s]+)/i)?.[1] ?? "";
      const sound = notes.match(/sound=([^|\s]+)/i)?.[1] ?? "";
      if (observation || sound) return `inaturalist:${observation}:${sound || url}`;
    }
    return "";
  }

  function soundRejectionKeyFromCreditsFile(creditsPath) {
    if (!fs.existsSync(creditsPath)) return "";
    try {
      return soundRejectionKeyFromCredits(JSON.parse(fs.readFileSync(creditsPath, "utf8")));
    } catch {
      return "";
    }
  }

  function isFileLockError(error) {
    const code = String(error?.code ?? "").toUpperCase();
    const message = String(error?.message ?? "").toLowerCase();
    return (
      code === "EPERM" ||
      code === "EBUSY" ||
      code === "EACCES" ||
      message.includes("operation not permitted") ||
      message.includes("permission denied") ||
      message.includes("access is denied")
    );
  }

  function removeTempFile(tempPath) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup. A later write will overwrite the same temp path.
    }
  }

  async function replaceExistingFileWithTemp(tempPath, targetPath) {
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempPath, targetPath);
        return;
      } catch (error) {
        lastError = error;
        if (!isFileLockError(error)) throw error;
        await sleep(250 * (attempt + 1));
      }
    }
    throw lastError;
  }

  function temporarilySkipSoundCandidate(extraRejectedKeys, key, german, sourceLabel) {
    const normalizedKey = String(key ?? "").trim();
    if (normalizedKey) extraRejectedKeys.add(normalizedKey);
    logger.warn(`⚠ ${sourceLabel} für ${german} konnte nicht übernommen werden; prüfe nächste Quelle.`);
  }

  function validateDownloadedMp3(buffer, source, german) {
    if (isMp3Buffer(buffer)) return true;
    const format = audioFormatLabel(detectAudioFormat(buffer));
    logger.warn("⚠ " + source + "-Datei für " + german + " ist technisch " + format + " und kein gültiges MP3; Kandidat wird übersprungen.");
    return false;
  }

  function readSoundLicense(creditsPath) {
    if (!fs.existsSync(creditsPath)) return "";
    try {
      const credits = JSON.parse(fs.readFileSync(creditsPath, "utf8"));
      return normalizeLicenseUrl(credits.license || "");
    } catch (error) {
      logError("Credits konnten nicht gelesen werden (" + creditsPath + "): " + error.message);
      return "";
    }
  }

  const { findRecordingByStage } = createXenoCantoAdapter({
    fetch,
    token,
    sleep,
    logger,
  });

  const commonsAudioAdapter = createWikimediaCommonsAudioAdapter({ fetch, sleep, logError, logger });
  async function findCommonsRecording(genus, species, german, safeName, extraRejectedKeys = new Set()) {
    return commonsAudioAdapter.findRecording(genus, species, german, {
      isRejected: (hit) => isRejectedSoundCandidate(
        safeName,
        commonsRejectionKey(hit),
        german,
        extraRejectedKeys,
      ),
    });
  }

  const inaturalistAudioAdapter = createINaturalistAudioAdapter({ fetch, sleep, logError, logger });
  async function findInatRecording(genus, species, german, safeName, extraRejectedKeys = new Set()) {
    return inaturalistAudioAdapter.findRecording(genus, species, german, {
      isRejected: (hit) => isRejectedSoundCandidate(
        safeName,
        inatRejectionKey(hit),
        german,
        extraRejectedKeys,
      ),
    });
  }

  async function tryXenoStageCandidates({
    genus,
    species,
    german,
    mp3Path,
    creditsPath,
    stage,
    originalStageIndex,
    stages,
    extraRejectedKeys,
    isRejected,
    foundMessage,
  }) {
    for (let attempt = 0; attempt < SOUND_CANDIDATE_RETRY_LIMIT; attempt++) {
      const hit = await findRecordingByStage(genus, species, stage, { isRejected });
      if (!hit?.rec) return null;

      const message = typeof foundMessage === "function"
        ? foundMessage(originalStageIndex)
        : foundMessage;
      logger.log(message);

      const result = await saveSoundRecording({
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

      if (result === "ok" || result === "locked" || result === "error") return result;
      temporarilySkipSoundCandidate(extraRejectedKeys, xenoRejectionKey(hit.rec), german, "Xeno-Canto-Soundkandidat");
    }

    logger.warn(`⚠ Zu viele nicht übernehmbare Xeno-Canto-Kandidaten für ${german}; prüfe nächste Suchstufe.`);
    return null;
  }

  async function tryCommonsCandidates({ genus, species, german, safeName, mp3Path, creditsPath, extraRejectedKeys, foundMessage }) {
    for (let attempt = 0; attempt < SOUND_CANDIDATE_RETRY_LIMIT; attempt++) {
      const hit = await findCommonsRecording(genus, species, german, safeName, extraRejectedKeys);
      if (!hit) return null;

      logger.log(foundMessage);
      const result = await saveCommonsSoundRecording({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        hit,
      });

      if (result === "ok" || result === "locked" || result === "error") return result;
      temporarilySkipSoundCandidate(extraRejectedKeys, commonsRejectionKey(hit), german, "Commons-Soundkandidat");
    }

    logger.warn(`⚠ Zu viele nicht übernehmbare Commons-Kandidaten für ${german}; prüfe nächste Quelle.`);
    return null;
  }

  async function tryInatCandidates({ genus, species, german, safeName, mp3Path, creditsPath, extraRejectedKeys, foundMessage }) {
    for (let attempt = 0; attempt < SOUND_CANDIDATE_RETRY_LIMIT; attempt++) {
      const hit = await findInatRecording(genus, species, german, safeName, extraRejectedKeys);
      if (!hit) return null;

      logger.log(foundMessage);
      const result = await saveInatSoundRecording({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        hit,
      });

      if (result === "ok" || result === "locked" || result === "error") return result;
      temporarilySkipSoundCandidate(extraRejectedKeys, inatRejectionKey(hit), german, "iNaturalist-Soundkandidat");
    }

    logger.warn(`⚠ Zu viele nicht übernehmbare iNaturalist-Kandidaten für ${german}; prüfe nächste Suchstufe.`);
    return null;
  }

  async function downloadSoundIfMissing(genus, species, german, { forceAlternativeSearch = false } = {}) {
    const safeGerman = sanitizeAssetName(german);
    const targetDir = speciesAssetDir(safeGerman);

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const mp3Path = path.join(targetDir, "sound.mp3");
    const creditsPath = path.join(targetDir, "credits.json");
    const extraRejectedKeys = new Set();
    const currentSoundKey = forceAlternativeSearch ? soundRejectionKeyFromCreditsFile(creditsPath) : "";
    if (currentSoundKey) extraRejectedKeys.add(currentSoundKey);
    const rejectXenoCandidate = (recording) =>
      isRejectedSoundCandidate(safeGerman, xenoRejectionKey(recording), german, extraRejectedKeys);

    if (fs.existsSync(mp3Path) && isManualAsset(safeGerman, "sound")) {
      logger.log(`🎵 Manuell gepflegter Sound für ${german} ist geschützt, überspringe Suche.`);
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

      if (hasCredits && !isNcLicense(existingLicense) && !forceAlternativeSearch) {
        logger.log(`🎵 Sound existiert bereits für ${german}`);
        return "ok";
      }

      logger.log(
        forceAlternativeSearch && hasCredits
          ? `🎵 Sound existiert für ${german}; suche gezielt nach einer Alternative.`
          : hasCredits
          ? `🎵 NC-Sound existiert für ${german}; prüfe freie Alternative.`
          : `🎵 Sound ohne Credits existiert für ${german}; prüfe dokumentierte freie Alternative.`,
      );
      for (let i = 0; i < openStages.length; i++) {
        const originalStageIndex = stages.indexOf(openStages[i]);
        const result = await tryXenoStageCandidates({
          genus,
          species,
          german,
          mp3Path,
          creditsPath,
          stage: openStages[i],
          originalStageIndex,
          stages,
          extraRejectedKeys,
          isRejected: rejectXenoCandidate,
          foundMessage: (stageIndex) => `✔ Freie Alternative gefunden für ${german} (Stage ${stageIndex}).`,
        });
        if (result) return result;
      }

      const commonsResult = await tryCommonsCandidates({
        genus,
        species,
        german,
        safeName: safeGerman,
        mp3Path,
        creditsPath,
        extraRejectedKeys,
        foundMessage: `✔ Freie Commons-Alternative gefunden für ${german}.`,
      });
      if (commonsResult) return commonsResult;

      const inatResult = await tryInatCandidates({
        genus,
        species,
        german,
        safeName: safeGerman,
        mp3Path,
        creditsPath,
        extraRejectedKeys,
        foundMessage: `✔ Freie iNaturalist-Alternative gefunden für ${german}.`,
      });
      if (inatResult) return inatResult;

      if (forceAlternativeSearch) {
        for (let i = 0; i < fallbackStages.length; i++) {
          const originalStageIndex = stages.indexOf(fallbackStages[i]);
          const result = await tryXenoStageCandidates({
            genus,
            species,
            german,
            mp3Path,
            creditsPath,
            stage: fallbackStages[i],
            originalStageIndex,
            stages,
            extraRejectedKeys,
            isRejected: rejectXenoCandidate,
            foundMessage: (stageIndex) => `✔ Weitere Soundalternative gefunden für ${german} (Stage ${stageIndex}).`,
          });
          if (result) return result;
        }
      }

      logger.log(
        forceAlternativeSearch && hasCredits
          ? `ℹ Keine weitere Soundalternative gefunden für ${german}; vorhandener Sound bleibt erhalten.`
          : hasCredits
          ? `ℹ Keine freie Alternative gefunden für ${german}; vorhandener NC-Sound bleibt erhalten.`
          : `⚠ Keine dokumentierte freie Alternative gefunden für ${german}; vorhandener Sound bleibt ohne Credits.`,
      );
      return hasCredits ? "ok" : "missing";
    }

    for (let i = 0; i < openStages.length; i++) {
      const originalStageIndex = stages.indexOf(openStages[i]);
      const result = await tryXenoStageCandidates({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        stage: openStages[i],
        originalStageIndex,
        stages,
        extraRejectedKeys,
        isRejected: rejectXenoCandidate,
        foundMessage: (stageIndex) => `✔ Freie Aufnahme gefunden für ${german} (Stage ${stageIndex}).`,
      });
      if (result) return result;
    }

    const commonsResult = await tryCommonsCandidates({
      genus,
      species,
      german,
      safeName: safeGerman,
      mp3Path,
      creditsPath,
      extraRejectedKeys,
      foundMessage: `✔ Freie Commons-Aufnahme gefunden für ${german}.`,
    });
    if (commonsResult) return commonsResult;

    const inatResult = await tryInatCandidates({
      genus,
      species,
      german,
      safeName: safeGerman,
      mp3Path,
      creditsPath,
      extraRejectedKeys,
      foundMessage: `✔ Freie iNaturalist-Aufnahme gefunden für ${german}.`,
    });
    if (inatResult) return inatResult;

    for (let i = 0; i < fallbackStages.length; i++) {
      const originalStageIndex = stages.indexOf(fallbackStages[i]);
      const result = await tryXenoStageCandidates({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        stage: fallbackStages[i],
        originalStageIndex,
        stages,
        extraRejectedKeys,
        isRejected: rejectXenoCandidate,
        foundMessage: (stageIndex) => `✔ Aufnahme gefunden für ${german} (Stage ${stageIndex}).`,
      });
      if (result) return result;
    }

    logger.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
    return "missing";
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
    let replacedSound = false;

    try {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        logger.warn(`⚠ Fehler beim Herunterladen der Datei (${audioRes.status}); Kandidat wird übersprungen.`);
        return "retry";
      }

      const buffer = Buffer.from(await audioRes.arrayBuffer());
      if (!validateDownloadedMp3(buffer, "Xeno-Canto", german)) return "retry";
      fs.writeFileSync(tempMp3, buffer);
      await replaceExistingFileWithTemp(tempMp3, mp3Path);
      replacedSound = true;

      logger.log(`✔ Sound gespeichert: ${mp3Path}`);

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
        rejectionKey: xenoRejectionKey(chosen),
        notes: `Stage ${chosenStageIndex} (openOnly=${st.openOnly}, q=${st.q}, len25-35=${st.len2535}) | query="${chosenInfo.query}" | page=${chosenInfo.page}`,
      };

      fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

      return "ok";
    } catch (err) {
      removeTempFile(tempMp3);
      if (!replacedSound && isFileLockError(err)) {
        logger.warn(`⚠ Sounddatei für ${german} ist noch geöffnet oder gesperrt; Alternative konnte nicht gespeichert werden.`);
        logError(`Sound ${genus} ${species}: Datei gesperrt (${err.message})`);
        return "locked";
      }
      logger.error(`❌ Fehler beim Sound-Download ${genus} ${species}: ${err.message}`);
      logError(`Sound ${genus} ${species}: ${err.message}`);
      return replacedSound ? "error" : "retry";
    }
  }

  async function saveCommonsSoundRecording({ genus, species, german, mp3Path, creditsPath, hit }) {
    const tempMp3 = mp3Path + ".tmp";
    let replacedSound = false;

    try {
      const audioRes = await fetch(hit.mp3Url);
      if (!audioRes.ok) {
        logger.warn(`⚠ Fehler beim Herunterladen der Commons-Datei (${audioRes.status}); Kandidat wird übersprungen.`);
        return "retry";
      }

      const buffer = Buffer.from(await audioRes.arrayBuffer());
      if (!validateDownloadedMp3(buffer, "Commons", german)) return "retry";

      fs.writeFileSync(tempMp3, buffer);
      await replaceExistingFileWithTemp(tempMp3, mp3Path);
      replacedSound = true;

      logger.log(`✔ Commons-Sound gespeichert: ${mp3Path}`);

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
        rejectionKey: commonsRejectionKey(hit),
        notes: `Free Commons replacement. Query="${hit.query}" | title="${hit.title}" | original=${hit.fileUrl} | mp3=${hit.mp3Url}`,
      };

      fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

      return "ok";
    } catch (err) {
      removeTempFile(tempMp3);
      if (!replacedSound && isFileLockError(err)) {
        logger.warn(`⚠ Sounddatei für ${german} ist noch geöffnet oder gesperrt; Commons-Alternative konnte nicht gespeichert werden.`);
        logError(`Commons-Sound ${genus} ${species}: Datei gesperrt (${err.message})`);
        return "locked";
      }
      logger.error(`❌ Fehler beim Commons-Sound-Download ${genus} ${species}: ${err.message}`);
      logError(`Commons-Sound ${genus} ${species}: ${err.message}`);
      return replacedSound ? "error" : "retry";
    }
  }

  async function saveInatSoundRecording({ genus, species, german, mp3Path, creditsPath, hit }) {
    const tempMp3 = mp3Path + ".tmp";
    let replacedSound = false;

    try {
      const audioRes = await fetch(hit.url);
      if (!audioRes.ok) {
        logger.warn(`⚠ Fehler beim Herunterladen der iNaturalist-Datei (${audioRes.status}); Kandidat wird übersprungen.`);
        return "retry";
      }

      const buffer = Buffer.from(await audioRes.arrayBuffer());
      if (!validateDownloadedMp3(buffer, "iNaturalist", german)) return "retry";
      fs.writeFileSync(tempMp3, buffer);
      await replaceExistingFileWithTemp(tempMp3, mp3Path);
      replacedSound = true;

      logger.log(`✔ iNaturalist-Sound gespeichert: ${mp3Path}`);

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
        rejectionKey: inatRejectionKey(hit),
        notes: `Free iNaturalist replacement. Observation=${observation.id} | user=${user} | license=${license} | sound=${sound.id || sound.uuid || "n/a"} | file=${hit.url}`,
      };

      fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

      return "ok";
    } catch (err) {
      removeTempFile(tempMp3);
      if (!replacedSound && isFileLockError(err)) {
        logger.warn(`⚠ Sounddatei für ${german} ist noch geöffnet oder gesperrt; iNaturalist-Alternative konnte nicht gespeichert werden.`);
        logError(`iNaturalist-Sound ${genus} ${species}: Datei gesperrt (${err.message})`);
        return "locked";
      }
      logger.error(`❌ Fehler beim iNaturalist-Sound-Download ${genus} ${species}: ${err.message}`);
      logError(`iNaturalist-Sound ${genus} ${species}: ${err.message}`);
      return replacedSound ? "error" : "retry";
    }
  }

  return Object.freeze({ downloadSoundIfMissing });
}
