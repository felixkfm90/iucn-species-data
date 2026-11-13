import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";
import { check } from "./errors.mjs";
import { canonicalJson, digest } from "./security.mjs";
import { validateSpeciesRecord } from "./species-record.mjs";
import { NORMAL_MEDIA_SLOTS, NORMAL_MEDIA_MIMES, NORMAL_MEDIA_LIMITS } from "./normal-media.mjs";
import { projectSpeciesEnrichment, speciesEnrichmentSourceBindings, ENRICHMENT_CREDIT_FIELDS, ENRICHMENT_DATA_RETAINED } from "./species-enrichment.mjs";
import { createEnrichmentFetch } from "./species-enrichment-transport.mjs";
import { createManagedTempSession, assertNoTempLinks } from "../temp-session.mjs";
import { createSpeciesDataPipeline, createEmptyPipelineSpeciesData, formatPipelineTaxonomyName } from "../../scripts/species-data-pipeline.mjs";
import { createSpeciesSoundPipeline } from "../../scripts/species-sound-pipeline.mjs";
import { createSpeciesPipeline } from "../../scripts/species-pipeline.mjs";
import { createIucnDataAdapter } from "../../scripts/iucn-data-adapter.mjs";
import { readIucnMasterReference } from "../taxonomy-iucn-reference.mjs";
import { defaultTaxonomyRoot } from "../taxonomy-storage.mjs";
import { createIucnMapAdapter } from "../../scripts/iucn-map-adapter.mjs";
import { isMapProtected } from "../../scripts/map-provenance.mjs";
import { inspectJpeg, inspectWebp } from "../../scripts/image-header.mjs";
import { inspectCompleteMp3Buffer } from "../../scripts/audio-format.mjs";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { validateAudioDecode } from "../../scripts/audio-validation.mjs";
import { renderSpectrogram, resolveFfmpegPath } from "../../scripts/spectrogram-renderer.mjs";

const JSON_BYTES = 256 * 1024;
const changed = condition => check(condition, 409, "species_enrichment_file_changed", "Eine Artdatei wurde während der Vorbereitung verändert oder ist nicht vollständig gebunden.");
const sourceCurrent = condition => check(condition, 409, "species_enrichment_source_changed", "Artfassung, Projekt oder Berechtigung wurde geändert. Bitte den aktuellen gemeinsamen Stand erneut prüfen.");
const sameFile = (a, b) => ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => a[key] === b[key]);
const maximum = slot => slot === "sound.mp3" ? NORMAL_MEDIA_LIMITS.soundBytes : slot === "credits.json" ? JSON_BYTES : NORMAL_MEDIA_LIMITS.imageBytes;
const mimeType = slot => slot === "credits.json" ? "application/json" : NORMAL_MEDIA_MIMES[slot];
const metadata = (slot, buffer) => ({ sha256: digest(buffer), bytes: buffer.length, mimeType: mimeType(slot) });
const sameMetadata = (a, b) => a && b && ["sha256", "bytes", "mimeType"].every(key => a[key] === b[key]);

/** Bounded reads of a registered file in our own session, never a caller path. */
async function readOwnedFile(root, slot) {
  const filename = path.join(root, slot);
  await assertNoTempLinks(root, filename);
  let prior;
  try { prior = await fs.lstat(filename, { bigint: true }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  changed(prior.isFile() && !prior.isSymbolicLink() && prior.nlink === 1n && prior.size > 0n && prior.size <= BigInt(maximum(slot)));
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const initial = await handle.stat({ bigint: true }); changed(sameFile(prior, initial) && initial.nlink === 1n);
    const buffer = Buffer.alloc(Number(initial.size)); let offset = 0;
    while (offset < buffer.length) {
      changed(sameFile(initial, await handle.stat({ bigint: true })));
      const part = await handle.read(buffer, offset, buffer.length - offset, offset);
      changed(part.bytesRead > 0); offset += part.bytesRead;
    }
    changed((await handle.read(Buffer.alloc(1), 0, 1, buffer.length)).bytesRead === 0
      && sameFile(initial, await handle.stat({ bigint: true })));
    await assertNoTempLinks(root, filename);
    changed(sameFile(initial, await fs.lstat(filename, { bigint: true })));
    return buffer;
  } finally { await handle.close(); }
}

/** Trusted Node preparation only. No queue, register, publication or persistent candidate store.
 * assertCurrent must recheck the captured actual object AND actor in the caller's facade.
 * Returned buffers are independent RAM candidates; a future queue must durably stage them first. */
export function createSpeciesEnrichmentPreparer({ repoRoot, fetch, iucnToken, xenoToken, assertCurrent, readNormalFile,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), logger = console,
  imageDecode = validateImageDecode, audioDecode = validateAudioDecode, renderSpectrum = renderSpectrogram,
  createSession = createManagedTempSession } = {}) {
  check(typeof repoRoot === "string" && path.isAbsolute(repoRoot) && !/^(?:\\\\|\/\/|file:)/i.test(repoRoot),
    400, "invalid_species_enrichment_preparer", "Die Vorbereitung benötigt den festen lokalen Programmordner.");
  for (const [name, value] of Object.entries({ fetch, assertCurrent, readNormalFile, sleep, imageDecode, audioDecode, renderSpectrum, createSession })) {
    if (typeof value !== "function") throw new TypeError(`Die Artvorbereitung benötigt ${name}.`);
  }
  let closed = false;
  const active = new Map();

  async function prepareCandidate({ speciesObject, projectId, mode = "missing", expectedSourceBindings, signal } = {}) {
    check(["all", "missing", "manual-maps", "nc-sounds"].includes(mode), 400, "invalid_species_enrichment_mode", "Der Artlaufmodus ist ungültig.");
    const sourceBindings = speciesEnrichmentSourceBindings(speciesObject, projectId);
    if (expectedSourceBindings !== undefined) sourceCurrent(canonicalJson(expectedSourceBindings) === canonicalJson(sourceBindings));
    const source = validateSpeciesRecord(speciesObject.data, speciesObject.id);
    check(mode === "nc-sounds" || typeof iucnToken === "string" && iucnToken.trim(),
      409, "species_source_access_required", "Für diesen Fachdaten-/Kartenlauf fehlt der eingerichtete IUCN-Zugang.");
    check(mode === "manual-maps" || typeof xenoToken === "string" && xenoToken.trim(),
      409, "species_source_access_required", "Für diesen Tonlauf fehlt der eingerichtete Xeno-Canto-Zugang.");
    const checkpoint = async () => {
      check(!signal.aborted, 409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen oder hat ihre Laufzeitgrenze erreicht.");
      sourceCurrent(await assertCurrent(JSON.parse(canonicalJson(sourceBindings))) === true);
      check(!signal.aborted, 409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen oder hat ihre Laufzeitgrenze erreicht.");
      return true;
    };
    await checkpoint();
    const session = await createSession({ repoRoot });
    let release;
    try {
      release = await session.beginOperation();
      for (const slot of [...NORMAL_MEDIA_SLOTS, "credits.json", "sound.mp3.tmp", "map.jpg.tmp"]) await session.filePath(slot);
      const seeded = new Map();
      const decode = async (slot, buffer) => {
        changed(Buffer.isBuffer(buffer) && !isProxy(buffer) && buffer.length > 0 && buffer.length <= maximum(slot));
        if (slot === "sound.mp3") {
          inspectCompleteMp3Buffer(buffer);
          await audioDecode(buffer, { repoRoot, signal });
        } else {
          const header = (slot === "map.jpg" ? inspectJpeg : inspectWebp)(buffer);
          changed(header.valid && header.width * header.height <= NORMAL_MEDIA_LIMITS.imagePixels);
          await imageDecode(buffer, { repoRoot, format: slot === "map.jpg" ? "jpeg" : "webp", maxBytes: maximum(slot), maxPixels: NORMAL_MEDIA_LIMITS.imagePixels });
        }
        await checkpoint();
      };
      for (const slot of NORMAL_MEDIA_SLOTS) {
        const asset = source.assets.files[slot]; if (!(asset?.bytes > 0)) continue;
        await checkpoint();
        const supplied = await readNormalFile({ sourceBindings: { ...sourceBindings }, slot });
        changed(Buffer.isBuffer(supplied) && !isProxy(supplied));
        const buffer = Buffer.from(supplied);
        changed(sameMetadata(asset, metadata(slot, buffer)));
        await decode(slot, buffer);
        await fs.writeFile(path.join(session.root, slot), buffer, { flag: "wx" });
        seeded.set(slot, digest(buffer));
      }
      let seededCredits = null;
      if (source.assets.credits !== null) {
        seededCredits = JSON.stringify(source.assets.credits, null, 2);
        changed(Buffer.byteLength(seededCredits) <= JSON_BYTES);
        await fs.writeFile(path.join(session.root, "credits.json"), seededCredits, { flag: "wx" });
      }
      const readAssetOverrides = () => ({ version: 1, assets: { [source.assets.assetName]: source.assets.overrides } });
      const safeName = () => source.assets.assetName, speciesAssetDir = () => session.root;
      const isManualAsset = (_name, slot) => slot === "map" ? isMapProtected(source.assets.overrides.map) : source.assets.overrides[slot]?.manual === true;
      let updatedAssessment = null;
      const oldAssessment = source.assessmentBinding && typeof source.assessmentBinding === "object"
        ? source.assessmentBinding.assessmentId ?? source.assessmentBinding.id : source.assessmentBinding;
      const boundFetch = createEnrichmentFetch({ fetch, assertCurrent: checkpoint, signal });
      const boundSleep = async ms => { await checkpoint(); await sleep(ms); await checkpoint(); };
      const logError = message => logger.warn(message);
      const dataAdapter = createIucnDataAdapter({ fetch: boundFetch, token: iucnToken, sleep: boundSleep, logError, logger,
        resolveTaxonomy: input => readIucnMasterReference(input, { taxonomyRoot: defaultTaxonomyRoot(process.env, repoRoot) }),
        emptyEntry: createEmptyPipelineSpeciesData, formatTaxonomyName: formatPipelineTaxonomyName });
      const { prepareSpeciesData } = createSpeciesDataPipeline({ fetchSpeciesData: dataAdapter.fetchSpeciesData, logError, logger });
      const { downloadSoundIfMissing } = createSpeciesSoundPipeline({ fetch: boundFetch, token: xenoToken, sleep: boundSleep,
        sanitizeAssetName: safeName, speciesAssetDir, readAssetOverrides, logError, logger });
      const { downloadMapForSpecies } = createIucnMapAdapter({ fetch: boundFetch, token: iucnToken, iucnGET: dataAdapter.iucnGET,
        sleep: boundSleep, sanitizeAssetName: safeName, speciesAssetDir, isManualAsset, logger, logError, tempRoot: repoRoot,
        ensureDir: () => {}, isAssessmentCurrent: (_name, id) => oldAssessment === id,
        recordAssessment: (_name, id) => { updatedAssessment = id; } });
      const { runSpecies } = createSpeciesPipeline({ prepareSpeciesData, downloadSoundIfMissing, downloadMapForSpecies,
        sanitizeAssetName: safeName, isManualAsset, logger });
      const run = await runSpecies(source.input, { mode, existingData: source.generated });
      await checkpoint();
      const sound = await readOwnedFile(session.root, "sound.mp3");
      let spectrumRendered = false;
      if (sound && digest(sound) !== seeded.get("sound.mp3")) {
        await decode("sound.mp3", sound);
        await renderSpectrum({ inputPath: path.join(session.root, "sound.mp3"), outputPath: path.join(session.root, "spectrogram.webp"),
          ffmpegPath: resolveFfmpegPath({ repoRoot }), signal });
        spectrumRendered = true;
        await checkpoint();
        // A renderer never authorizes replacement of the sound it was given.
        const after = await readOwnedFile(session.root, "sound.mp3"); changed(after && digest(after) === digest(sound));
      }
      const files = {}, media = [];
      for (const slot of NORMAL_MEDIA_SLOTS) {
        const buffer = await readOwnedFile(session.root, slot);
        changed(!seeded.has(slot) || buffer !== null);
        const recertified = slot === "spectrogram.webp" && spectrumRendered || slot === "map.jpg" && updatedAssessment !== null;
        if (!buffer || digest(buffer) === seeded.get(slot) && !recertified) continue;
        await decode(slot, buffer);
        const after = await readOwnedFile(session.root, slot); changed(after && digest(after) === digest(buffer));
        files[slot] = metadata(slot, buffer); media.push({ slot, metadata: { ...files[slot] }, buffer: Buffer.from(buffer) });
      }
      let credits = null;
      const creditsBytes = await readOwnedFile(session.root, "credits.json");
      changed(seededCredits === null || creditsBytes !== null);
      if (creditsBytes && creditsBytes.toString("utf8") !== seededCredits) {
        let fresh;
        try { fresh = JSON.parse(creditsBytes.toString("utf8")); } catch { changed(false); }
        changed(fresh && Object.getPrototypeOf(fresh) === Object.prototype && !Array.isArray(fresh));
        // Preserve old non-provider fields in the actual JSON bytes, so the
        // record's credit values and its file hash describe the same content.
        const retained = Object.fromEntries(Object.entries(source.assets.credits || {}).filter(([key]) => !ENRICHMENT_CREDIT_FIELDS.includes(key)));
        changed(Object.keys(fresh).every(key => ENRICHMENT_CREDIT_FIELDS.includes(key) || Object.hasOwn(retained, key)
          && canonicalJson(fresh[key]) === canonicalJson(retained[key])));
        const text = JSON.stringify({ ...fresh, ...retained }, null, 2), buffer = Buffer.from(text, "utf8");
        changed(buffer.length <= JSON_BYTES);
        await fs.writeFile(path.join(session.root, "credits.json"), buffer);
        const after = await readOwnedFile(session.root, "credits.json"); changed(after && digest(after) === digest(buffer));
        credits = { text }; files["credits.json"] = metadata("credits.json", buffer);
        media.push({ slot: "credits.json", metadata: { ...files["credits.json"] }, buffer: Buffer.from(buffer) });
      }
      await checkpoint();
      const fetchedGenerated = run.fetched && !run.usedExistingData
        ? Object.fromEntries(Object.entries(run.data).filter(([, value]) => value !== undefined)) : source.generated;
      const sourceResult = { generated: fetchedGenerated, files, credits, assessmentBinding: updatedAssessment };
      const projection = projectSpeciesEnrichment({ speciesObject: { ...speciesObject, data: source }, projectId, expectedSourceBindings: sourceBindings,
        result: sourceResult });
      const issues = [...projection.issues];
      if (run.fetched && run.usedExistingData) issues.push({ ...ENRICHMENT_DATA_RETAINED });
      if ([run.soundStatus, run.mapStatus].some(status => ["error", "locked"].includes(status))) {
        issues.push({ code: "species_enrichment_source_incomplete", blocking: true, message: "Ein Medienabruf ist fehlgeschlagen oder gesperrt. Der bisherige gemeinsame Stand bleibt erhalten." });
      }
      await checkpoint();
      return { ...projection, issues, complete: projection.complete && !issues.some(issue => issue.blocking),
        mode, sourceResult, media, run: { fetched: run.fetched, usedExistingData: run.usedExistingData, soundStatus: run.soundStatus, mapStatus: run.mapStatus },
        proposedOnly: true, persistentCandidate: false, sharedProjectWrites: "not-performed", externalPublication: "not-performed" };
    } finally {
      if (release) await release();
      const closed = await session.close();
      check(closed && closed.pending !== true && closed.errors?.length === 0 && closed.kept?.length === 0,
        409, "species_enrichment_cleanup_pending", "Die eigene Artvorbereitung konnte ihren Arbeitsbereich noch nicht vollständig schließen.");
    }
  }

  function prepare(input = {}) {
    check(!closed, 409, "species_enrichment_closed", "Diese Artvorbereitung ist bereits geschlossen.");
    const { signal, timeoutMs = 180_000 } = input;
    check((signal === undefined || signal instanceof AbortSignal) && Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 180_000,
      400, "invalid_species_enrichment_lifecycle", "Die Artvorbereitung benötigt einen gültigen Abbruchkontext und eine begrenzte Laufzeit.");
    const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const operation = prepareCandidate({ ...input, signal: combined }).finally(() => {
      clearTimeout(timer); active.delete(controller);
    });
    active.set(controller, operation);
    return operation;
  }
  async function close() {
    closed = true;
    for (const controller of active.keys()) controller.abort();
    await Promise.allSettled([...active.values()]);
    return { closed: true, pending: active.size };
  }
  return Object.freeze({ prepare, close });
}
