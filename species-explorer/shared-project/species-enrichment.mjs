import { isProxy } from "node:util/types";
import { check } from "./errors.mjs";
import { canonicalJson, digest, objectJson } from "./security.mjs";
import { validateSpeciesRecord } from "./species-record.mjs";
import { speciesNormalAssets } from "./species-editorial.mjs";
import { isMapProtected } from "../../scripts/map-provenance.mjs";
import { EDITABLE_TAXONOMY_FIELDS, applyTaxonomyOverride, synchronizeAutomaticTaxonomyFields } from "../../scripts/taxonomy-overrides.mjs";
import { hasUsablePipelineSpeciesData } from "../../scripts/species-data-pipeline.mjs";
import { normalizeSoundRejectionKey } from "../../scripts/sound-rejection-key.mjs";

export const ENRICHMENT_CREDIT_FIELDS = Object.freeze(["scientific_name", "german_name", "recordist", "country", "location", "quality",
  "license", "source", "url", "rejectionKey", "notes"]);
export const ENRICHMENT_DATA_RETAINED = Object.freeze({ code: "species_enrichment_data_retained", blocking: false,
  message: "Der Datenabruf war unvollständig. Die vorhandenen Fachdaten bleiben erhalten und gelten nicht als neu abgerufen." });
const GENERATED_FIELDS = ["URLSlug", "Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Gewicht", "Größe", "Lebenserwartung",
  "Assessment ID", "Status", "Trend", "Kategorie", "Populationgröße", "Generationsdauer", "Kingdom", "Phylum", "Subphylum", "Class", "Order",
  "Family", "Genus", "Species", "Letztes IUCN Update", "Daten abgerufen", "Taxon ID", "IUCN-Zuordnung"];
const GENERAL_FIELDS = ["Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Größe", "Gewicht", "Lebenserwartung", "Kategorie",
  "Status", "Trend", "Populationgröße", "Generationsdauer", "Assessment ID", "Letztes IUCN Update", "Daten abgerufen"];
const SLOTS = { "portrait.webp": ["image/webp", "portrait"], "map.jpg": ["image/jpeg", "map"], "sound.mp3": ["audio/mpeg", "sound"],
  "spectrogram.webp": ["image/webp", "spectrogram"], "credits.json": ["application/json", "credits"] };
const LIMITS = { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 }, HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const invalid = condition => check(condition, 400, "invalid_species_enrichment", "Der Einartvorschlag benötigt ausschließlich vollständige gebundene Quellen- und Dateidaten.");
const same = (left, right) => canonicalJson(left, LIMITS) === canonicalJson(right, LIMITS);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const useful = value => value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim().toLowerCase() !== "n/a";
const comparable = value => String(value ?? "").trim().replace(/\s+/gu, " ").normalize("NFC");
const scientific = value => comparable(value).toLocaleLowerCase("de");
const general = generated => GENERAL_FIELDS.filter(key => generated?.[key] !== undefined && generated[key] !== null && String(generated[key]).trim() !== "")
  .map(key => `${key}: ${generated[key]}`).join("\n");

export const SPECIES_ENRICHMENT_MARKER = "fn-species-enrichment-v1";
export const SPECIES_ENRICHMENT_REQUEST_BYTES = 1024 * 1024;

function copy(value, limits = LIMITS) {
  let nodes = 0;
  function visit(item, depth) {
    invalid(depth <= 32 && ++nodes <= limits.maxNodes);
    if (item === null || ["string", "boolean"].includes(typeof item) || typeof item === "number" && Number.isFinite(item)) return;
    invalid(item && typeof item === "object" && !isProxy(item));
    const array = Array.isArray(item), descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
    invalid(Object.getPrototypeOf(item) === (array ? Array.prototype : Object.prototype));
    if (array) invalid(keys.length === item.length + 1 && keys.every(key => key === "length"
      || typeof key === "string" && /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length));
    for (const key of keys) {
      if (array && key === "length") continue;
      invalid(typeof key === "string" && !["__proto__", "constructor", "prototype"].includes(key)
        && descriptors[key].enumerable === true && Object.hasOwn(descriptors[key], "value"));
      visit(descriptors[key].value, depth + 1);
    }
  }
  visit(value, 0); return JSON.parse(canonicalJson(value, limits));
}
function fields(value, allowed, required = allowed) {
  invalid(object(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)));
}
function currentSource(speciesObject, projectId) {
  const source = copy(speciesObject);
  invalid(typeof projectId === "string" && IDENTIFIER.test(projectId));
  fields(source, ["kind", "id", "revision", "data", "ordinal", "parentRevision", "authorId", "createdAt", "approval", "approvedRevision", "localPending", "localConflict"], ["kind", "id", "revision", "data"]);
  invalid(source.kind === "species" && typeof source.id === "string" && source.id.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)
    && typeof source.revision === "string" && UUID.test(source.revision));
  check([source.localPending, source.localConflict].every(value => value === undefined || value === false),
    409, "species_enrichment_source_unconfirmed", "Offene lokale Artänderungen oder Konflikte müssen vor dem Einartvorschlag geklärt werden.");
  const data = validateSpeciesRecord(source.data, source.id);
  invalid(data.schemaVersion !== 2 || data.editorial.sourceBindings.projectId === projectId);
  return { data, sourceBindings: { projectId, speciesId: data.id, objectRevision: source.revision, dataHash: digest(objectJson(data)) } };
}

/** Pure source fingerprint, not an authentication, freshness or write authorization check. */
export function speciesEnrichmentSourceBindings(speciesObject, projectId) {
  return currentSource(speciesObject, projectId).sourceBindings;
}

export function inspectSpeciesEnrichmentResult(input) {
  const result = copy(input);
  fields(result, ["generated", "files", "credits", "assessmentBinding"]);
  invalid(result.generated === null || object(result.generated)); fields(result.files, Object.keys(SLOTS), []);
  for (const [name, file] of Object.entries(result.files)) {
    fields(file, ["sha256", "bytes", "mimeType"]);
    const limit = name === "sound.mp3" ? 50 * 1024 * 1024 : name === "credits.json" ? 256 * 1024 : 20 * 1024 * 1024;
    invalid(typeof file.sha256 === "string" && HASH.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= limit
      && file.mimeType === SLOTS[name][0]);
  }
  invalid(result.credits === null || object(result.credits));
  if (result.credits !== null) { fields(result.credits, ["text"]); invalid(typeof result.credits.text === "string" && Buffer.byteLength(result.credits.text, "utf8") <= 256 * 1024); }
  invalid((result.credits !== null) === Object.hasOwn(result.files, "credits.json"));
  invalid(result.assessmentBinding === null || positiveAssessment(result.assessmentBinding) !== null);
  return { result, credits: result.credits === null ? null : parseCredits(result.credits.text, result.files["credits.json"]) };
}

/** The exact approval proposal and its idempotency hash. No full writable art record is accepted. */
export function validateSpeciesEnrichmentChange(input) {
  const limits = { ...LIMITS, maxBytes: SPECIES_ENRICHMENT_REQUEST_BYTES };
  const change = copy(input, limits);
  fields(change, ["changeId", "kind", "id", "baseRevision", "enrichment"]);
  const { changeId, kind, id, baseRevision, enrichment } = change;
  fields(enrichment, ["schemaVersion", "actor", "sourceBindings", "result", "targetDataHash"]);
  const { actor, sourceBindings, result, targetDataHash } = enrichment;
  fields(actor, ["projectId", "userId", "role", "userVersion"]);
  fields(sourceBindings, ["projectId", "speciesId", "objectRevision", "dataHash"]);
  invalid(enrichment.schemaVersion === 1 && kind === "species" && typeof changeId === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(changeId)
    && typeof id === "string" && id.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
    && typeof baseRevision === "string" && UUID.test(baseRevision)
    && [actor.projectId, actor.userId].every(value => typeof value === "string" && IDENTIFIER.test(value))
    && ["admin", "publisher", "contributor"].includes(actor.role) && Number.isSafeInteger(actor.userVersion) && actor.userVersion > 0
    && actor.projectId === sourceBindings.projectId && id === sourceBindings.speciesId && baseRevision === sourceBindings.objectRevision
    && [sourceBindings.dataHash, targetDataHash].every(value => typeof value === "string" && HASH.test(value)));
  inspectSpeciesEnrichmentResult(result);
  const requestHash = digest(canonicalJson({ kind, id, baseRevision, enrichment }, limits));
  return { change, requestHash };
}
function positiveAssessment(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
  return value;
}
function parseCredits(text, file) {
  const bytes = Buffer.from(text, "utf8"); invalid(bytes.length === file.bytes && digest(bytes) === file.sha256);
  let parsed;
  try { parsed = JSON.parse(text); } catch { invalid(false); }
  invalid(object(parsed));
  // JSON.parse alone silently discards duplicate members, including differently escaped equal keys.
  const stack = [], tokens = /"(?:[^"\\]|\\.)*"|[{}\[\]]/gs;
  for (const match of text.matchAll(tokens)) {
    const token = match[0];
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (/^\s*:/.test(text.slice(match.index + token.length))) {
      const key = JSON.parse(token), keys = stack.at(-1); invalid(keys instanceof Set && !keys.has(key)); keys.add(key);
    }
  }
  return copy(parsed);
}
function changeList(before, after) {
  const changes = [];
  function note(field, left, right) {
    if (!same(left ?? null, right ?? null)) changes.push({ field, before: left ?? null, after: right ?? null });
  }
  for (const field of GENERATED_FIELDS) note(`generated.${field}`, before.generated?.[field], after.generated?.[field]);
  note("taxonomyOverride.automaticFields", before.taxonomyOverride?.automaticFields, after.taxonomyOverride?.automaticFields);
  note("assessmentBinding", before.assessmentBinding, after.assessmentBinding);
  for (const name of Object.keys(SLOTS)) note(`assets.files.${name}`, before.assets.files[name], after.assets.files[name]);
  for (const field of ENRICHMENT_CREDIT_FIELDS) note(`assets.credits.${field}`, before.assets.credits?.[field], after.assets.credits?.[field]);
  if (before.schemaVersion === 1) {
    const id = before.editorial.generalSectionId;
    if (id !== null) note("editorial.generatedGeneral", before.editorial.sections.find(section => section.id === id)?.text,
      after.editorial.sections.find(section => section.id === id)?.text);
  } else note("editorial.normalAssets", before.editorial.normalAssets, after.editorial.normalAssets);
  return changes;
}

/** Lossless Node-only candidate. No files, network, queue, actor authority, approval or publication are performed. */
export function projectSpeciesEnrichment(input) {
  const args = copy(input); fields(args, ["speciesObject", "projectId", "result", "expectedSourceBindings"], ["speciesObject", "projectId", "result"]);
  const { data: before, sourceBindings } = currentSource(args.speciesObject, args.projectId);
  const { result, credits } = inspectSpeciesEnrichmentResult(args.result);
  if (Object.hasOwn(args, "expectedSourceBindings")) {
    fields(args.expectedSourceBindings, ["projectId", "speciesId", "objectRevision", "dataHash"]);
    check(same(args.expectedSourceBindings, sourceBindings), 409, "species_enrichment_changed", "Die Artgrundlage wurde seit der Vorbereitung geändert. Bitte erneut prüfen.");
  }
  const data = copy(before), issues = [];
  const issue = (code, message, extra = {}, blocking = true) => issues.push({ code, blocking, message, ...extra });
  const finish = () => {
    const complete = !issues.some(item => item.blocking);
    const output = complete ? validateSpeciesRecord(data, before.id) : copy(before);
    return { sourceBindings, data: output, changes: complete ? changeList(before, output) : [], issues, complete };
  };

  if (result.generated !== null && !same(result.generated, before.generated)) {
    const generated = result.generated;
    for (const [key, expected, compare] of [["URLSlug", before.id, comparable], ["Wissenschaftlicher Name", `${before.input.genus} ${before.input.species}`, scientific],
      ["Genus", before.input.genus, scientific], ["Species", before.input.species, scientific], ["Deutscher Name", before.input.german, comparable],
      ["Englischer Name", before.input.english, comparable]]) {
      if (useful(generated[key]) && expected !== undefined && compare(generated[key]) !== compare(expected))
        issue("species_enrichment_name_review", "Eine Datenbezeichnung weicht von der gebundenen Art ab. Die Bezeichnung muss vor Übernahme geprüft werden.", { field: key });
    }
    const known = {};
    for (const [key, value] of Object.entries(generated)) {
      if (!GENERATED_FIELDS.includes(key)) {
        if (!Object.hasOwn(before.generated ?? {}, key) || !same(before.generated[key], value))
          issue("species_enrichment_ignored_generated_field", "Ein unbekanntes erzeugtes Zusatzfeld wird nicht übernommen.", { field: key }, false);
        continue;
      }
      if (key === "IUCN-Zuordnung") {
        fields(value, ["scientificName", "queriedName", "matchedBy", "taxonId", "masterTaxonId", "masterVersion"],
          ["scientificName", "queriedName", "matchedBy", "taxonId"]);
        invalid([value.scientificName, value.queriedName].every(name => typeof name === "string"
          && /^[\p{L}][\p{L}-]* [\p{L}][\p{L}-]*$/u.test(name))
          && ["scientific-name", "master-synonym"].includes(value.matchedBy)
          && (value.taxonId === null || typeof value.taxonId === "string" && /^[1-9][0-9]*$/.test(value.taxonId))
          && (!Object.hasOwn(value, "masterTaxonId") || /^mtx_[a-f0-9]{32}$/.test(value.masterTaxonId))
          && (!Object.hasOwn(value, "masterVersion") || typeof value.masterVersion === "string" && value.masterVersion.length <= 256));
      } else {
        invalid(typeof value === "string" && value.length <= 8000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
          || typeof value === "number" && Number.isFinite(value));
      }
      if (useful(value) || !useful(before.generated?.[key])) known[key] = value;
    }
    data.generated = { ...(before.generated ?? {}), ...known };
    if (!hasUsablePipelineSpeciesData(generated)) issue("species_enrichment_incomplete_data", "Der Abruf ist unvollständig. Brauchbare vorhandene Werte bleiben erhalten.", {}, false);
    if (before.taxonomyOverride !== null) {
      const registry = { version: 1, species: { [before.id]: before.taxonomyOverride } };
      const automaticSource = { ...data.generated, URLSlug: before.id };
      for (const { key } of EDITABLE_TAXONOMY_FIELDS) if (!useful(generated[key]) && Object.hasOwn(before.taxonomyOverride.automaticFields ?? {}, key))
        automaticSource[key] = before.taxonomyOverride.automaticFields[key];
      const synchronized = synchronizeAutomaticTaxonomyFields([automaticSource], registry).registry.species[before.id];
      data.taxonomyOverride = { ...before.taxonomyOverride,
        automaticFields: { ...(object(before.taxonomyOverride.automaticFields) ? before.taxonomyOverride.automaticFields : {}), ...synchronized.automaticFields } };
      data.generated = applyTaxonomyOverride(data.generated, { version: 1, species: { [before.id]: data.taxonomyOverride } });
    }
  }

  if (credits !== null) {
    for (const [key, value] of Object.entries(credits)) {
      if (ENRICHMENT_CREDIT_FIELDS.includes(key)) invalid(typeof value === "string" && value.length <= 8000);
      else if (!Object.hasOwn(before.assets.credits ?? {}, key) || !same(before.assets.credits[key], value))
        issue("species_enrichment_credit_field_review", "Ein unbekanntes neues Creditsfeld benötigt eine eigene Prüfung.", { field: key });
    }
    for (const [key, value] of Object.entries(before.assets.credits ?? {})) if (!ENRICHMENT_CREDIT_FIELDS.includes(key)
      && (!Object.hasOwn(credits, key) || !same(credits[key], value)))
      issue("species_enrichment_credit_field_review", "Ein vorhandenes unbekanntes Creditsfeld muss vollständig erhalten bleiben.", { field: key });
    if (useful(credits.scientific_name) && scientific(credits.scientific_name) !== scientific(`${before.input.genus} ${before.input.species}`)
      || useful(credits.german_name) && comparable(credits.german_name) !== comparable(before.input.german))
      issue("species_enrichment_credit_name_review", "Die Aufnahmedokumentation nennt eine andere Art. Bitte vor Übernahme prüfen.");
  }
  const changedFiles = Object.entries(result.files).filter(([name, file]) => {
    const existing = before.assets.files[name];
    return !existing || ["sha256", "bytes", "mimeType"].some(key => existing[key] !== file[key]);
  }).map(([name]) => name);
  const creditsChanged = credits !== null && !same(credits, before.assets.credits);
  for (const name of changedFiles) {
    const role = SLOTS[name][1], care = before.assets.overrides[role];
    if (role === "map" ? isMapProtected(care) : care?.manual === true || care?.protectFromPipeline === true || care?.protectedFromPipeline === true)
      issue("species_enrichment_protected_asset", "Eine geschützte Artdatei darf nur nach eigener manueller Prüfung ersetzt werden.", { filename: name });
  }
  if (creditsChanged && before.assets.overrides.sound?.manual === true)
    issue("species_enrichment_protected_asset", "Die Dokumentation der manuell geschützten Aufnahme bleibt erhalten.", { filename: "credits.json" });
  if (changedFiles.includes("sound.mp3")) {
    if (!Object.hasOwn(result.files, "spectrogram.webp") || result.credits === null)
      issue("species_enrichment_sound_pair_required", "Eine neue Aufnahme benötigt belegte Credits und ihr tatsächlich erzeugtes Spektrogramm.");
    const key = normalizeSoundRejectionKey(credits?.rejectionKey ?? "");
    const rejected = before.assets.overrides.sound?.rejectedSources;
    if (key && Array.isArray(rejected) && rejected.some(entry => normalizeSoundRejectionKey(entry?.key) === key))
      issue("species_enrichment_rejected_sound", "Diese Tonquelle wurde bereits abgelehnt und wird nicht automatisch übernommen.");
  }
  if (changedFiles.includes("map.jpg") && result.assessmentBinding === null && !isMapProtected(before.assets.overrides.map))
    issue("species_enrichment_assessment_required", "Eine neue Bewertungskarte benötigt ihre passende neue Assessmentbindung.");
  if (result.assessmentBinding !== null) {
    const assessment = positiveAssessment(result.assessmentBinding);
    if (!Object.hasOwn(result.files, "map.jpg") || positiveAssessment(data.generated?.["Assessment ID"]) !== assessment)
      issue("species_enrichment_assessment_changed", "Die neue Kartenbindung muss zum belegten Kartenbild und zur aktuellen Bewertung passen.");
    else if (object(before.assessmentBinding)) {
      const keys = ["assessmentId", "id"].filter(key => Object.hasOwn(before.assessmentBinding, key));
      if (keys.length !== 1 || positiveAssessment(before.assessmentBinding[keys[0]]) === null)
        issue("species_enrichment_assessment_review", "Die vorhandene Bewertungsbindung ist mehrdeutig und muss gezielt geprüft werden.");
      else data.assessmentBinding = { ...before.assessmentBinding, [keys[0]]: typeof before.assessmentBinding[keys[0]] === "string" ? assessment : Number(assessment) };
    } else data.assessmentBinding = typeof before.assessmentBinding === "string" ? assessment
      : typeof before.assessmentBinding === "number" ? Number(assessment) : result.assessmentBinding;
  }
  if (issues.some(item => item.blocking)) return finish();
  for (const name of changedFiles) data.assets.files[name] = { id: before.assets.files[name]?.id ?? `${before.id}:asset:${name}`, ...result.files[name] };
  if (credits !== null) data.assets.credits = credits;

  if (before.schemaVersion === 1) {
    const nextGeneral = general(data.generated), oldEmbedded = before.editorial.embeddedGeneralText;
    if (oldEmbedded !== null) {
      const section = data.editorial.sections.find(item => item.id === data.editorial.generalSectionId);
      const manual = section.text === oldEmbedded ? "" : section.text.slice(0, -oldEmbedded.length - 2);
      section.text = [manual, nextGeneral].filter(Boolean).join("\n\n");
      section.intentionallyEmpty = section.text ? false : section.intentionallyEmpty;
      data.editorial.embeddedGeneralText = nextGeneral || null;
    } else if (nextGeneral && data.editorial.sections.some(section => section.text === nextGeneral || section.text.endsWith(`\n\n${nextGeneral}`)))
      issue("species_enrichment_general_review", "Ein vorhandener Abschnitt entspricht den erzeugten Werten, besitzt aber keine bestätigte Blockbindung.");
  } else {
    // Derive changed role metadata without using or reconstructing the human rich text.
    const metadataRecord = { ...data, schemaVersion: 1, editorial: { websiteUrl: data.editorial.websiteUrl, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
    const calculated = speciesNormalAssets(metadataRecord, args.projectId);
    for (const [name, [, role]] of Object.entries(SLOTS)) if (changedFiles.includes(name) || creditsChanged && ["sound", "credits", "spectrogram"].includes(role)) {
      const next = calculated[role];
      if (next && data.editorial.gallery.some(usage => usage.asset.id === next.id && !same(usage.asset, next)))
        issue("species_enrichment_gallery_review", "Die normale Datei wird auch in der Galerie verwendet. Deren bisherige Fassung bleibt unverändert; bitte getrennt prüfen.", { filename: name });
      else data.editorial.normalAssets[role] = next;
    }
  }
  return finish();
}
