import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { aiError, clone, sha256 } from "./files.mjs";
import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { canonical } from "../page-authoring/contract.mjs";
import { normalizeWebsiteAltProposalText } from "../website-alt-policy.mjs";

export const LANGUAGE_KINDS = Object.freeze(["spelling", "capitalization", "grammar", "punctuation"]);
export const LANGUAGE_LIMITS = Object.freeze({ websiteText: 2000, pageText: 8000, findings: 8, quote: 2000, replacement: 2000, explanation: 240 });
const WEBSITE_BINDING = ["type", "kind", "pageUrl", "imageKey", "observationHash", "revision", "snapshotRevision", "draftSha256", "imageContext", "imageKind", "inputProof"];
const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function keys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))
    || allowed.some((key) => !Object.hasOwn(value, key)) || Object.values(Object.getOwnPropertyDescriptors(value)).some((item) => !("value" in item))) {
    throw aiError("Die Sprachprüfung benötigt ihre vollständige unveränderte Datenstruktur.", "LOCAL_AI_INVALID_RESPONSE");
  }
}
export function languageText(value, maxLength, label = "Prüftext") {
  if (typeof value !== "string" || value.length > maxLength || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw aiError(`${label} ist ungültig oder überschreitet seine Größengrenze.`);
  return value;
}
export function websiteLanguageRequest(value) {
  keys(value, ["type", "pageUrl", "imageKey", "observationHash", "draftText"]);
  if (value.type !== "website-language" || !hex(value.imageKey) || !hex(value.observationHash)
    || typeof value.pageUrl !== "string" || value.pageUrl.length > 2000 || normalizeWebsitePageUrl(value.pageUrl) !== value.pageUrl) throw aiError("Die Sprachprüfung benötigt das konkrete aktuelle Websitebild.");
  languageText(value.draftText, LANGUAGE_LIMITS.websiteText); return clone(value);
}
export function websiteLanguageBinding(value) {
  keys(value, WEBSITE_BINDING);
  if (value.type !== "website-language" || value.kind !== "review-language" || typeof value.pageUrl !== "string" || value.pageUrl.length > 2000
    || normalizeWebsitePageUrl(value.pageUrl) !== value.pageUrl || !["imageKey", "observationHash", "revision", "snapshotRevision", "draftSha256", "inputProof"].every((key) => hex(value[key]))
    || value.snapshotRevision !== value.revision || !["header", "footer", "content"].includes(value.imageContext)
    || !["image", "background"].includes(value.imageKind)) throw aiError("Die Sprachantwort gehört nicht zum gebundenen Websitebestand.");
  return clone(value);
}
const textBoundary = (value, index) => !(index > 0 && index < value.length && /[\uD800-\uDBFF]/.test(value[index - 1]) && /[\uDC00-\uDFFF]/.test(value[index]));
function shortTravelCaption(input) {
  if (input.binding.type !== "website-language" || input.draft.length > 500 || /[\r\n]/.test(input.draft)) return false;
  const image = { context: input.binding.imageContext, kind: input.binding.imageKind };
  return normalizeWebsiteAltProposalText(input.binding.pageUrl, image, "Sachliche Reisebeschriftung.") === "Sachliche Reisebeschriftung";
}
function assertCaptionPunctuation(input, findings, correctedText) {
  if (!shortTravelCaption(input)) return;
  const image = { context: input.binding.imageContext, kind: input.binding.imageKind };
  const normalized = normalizeWebsiteAltProposalText(input.binding.pageUrl, image, correctedText);
  const beforeDots = input.draft.match(/(\.+)[ \t]*$/)?.[1].length || 0, afterDots = correctedText.match(/(\.+)[ \t]*$/)?.[1].length || 0;
  if (normalized !== correctedText && beforeDots === 0 && afterDots === 1 || afterDots > beforeDots && afterDots >= 2)
    throw aiError("Der Sprachvorschlag würde der bestehenden Reiseregel widersprechen: kurze Bildbeschriftungen ohne abschließenden Satzpunkt, Abkürzungen bleiben erhalten.");
  // Derive protected abbreviation/ordinal punctuation from the existing policy,
  // without copying its abbreviation list or changing the proposed text.
  for (let end = 1; end <= input.draft.length; end++) {
    if (input.draft[end - 1] !== ".") continue;
    const prefix = input.draft.slice(0, end);
    if (normalizeWebsiteAltProposalText(input.binding.pageUrl, image, prefix) !== prefix) continue;
    const token = prefix.match(/\S+$/u)?.[0]; if (!token || token === ".") continue;
    const start = end - token.length;
    for (const finding of findings) {
      if (finding.start >= end || finding.end <= start) continue;
      if (finding.start > start || finding.end < end || finding.replacement.slice(start - finding.start, end - finding.start) !== token)
        throw aiError("Der Sprachvorschlag verändert eine vorhandene Abkürzung oder ihre Punktsetzung. Die bestehende Reisebeschriftung bleibt unverändert.");
    }
  }
}

export function buildLanguageRequest(input) {
  const item = { type: "object", additionalProperties: false, properties: {
    kind: { type: "string", enum: LANGUAGE_KINDS }, draftQuote: { type: "string", minLength: 1, maxLength: LANGUAGE_LIMITS.quote },
    replacement: { type: "string", maxLength: LANGUAGE_LIMITS.replacement }, explanation: { type: "string", minLength: 1, maxLength: LANGUAGE_LIMITS.explanation },
  }, required: ["kind", "draftQuote", "replacement", "explanation"] };
  const captionRule = shortTravelCaption(input) ? " Websitekontext: kurze Reisebildbeschriftung ohne abschließenden Satzpunkt; ergänze keinen Satzpunkt. Vorhandene Abkürzungen und ihre Punkte unverändert erhalten." : "";
  const instructions = [
    "Schlage konkrete notwendige Sprachkorrekturen vor.",
    "Prüfe gewöhnliche Wörter vollständig im Satzkontext. Deutsche Substantive werden großgeschrieben; auch allgemeine Tierbezeichnungen sind gewöhnliche Substantive und keine Eigennamen.",
    "Erhalte Bedeutung, Eigennamen und konkrete Artbezeichnungen: weder fachlich umdeuten noch durch andere Bezeichnungen ersetzen. Dieser Schutz ist kein Grund, gewöhnliche Wörter oder deren notwendige Groß-/Kleinschreibung im Satz auszulassen.",
    "Gib nur tatsächliche Änderungen aus: replacement muss sich von draftQuote unterscheiden. Liegt kein sprachlicher Fehler vor, liefere findings:[]; keine Bestätigungseinträge und keine Einträge mit unverändertem Text.",
    "kind bezeichnet die wirkliche Änderung: capitalization bei reiner Groß-/Kleinschreibung, punctuation bei reiner Zeichensetzung, spelling bei Schreibfehlern und grammar bei Wortform, Satzbau oder Konjunktionen. Eine notwendige Konjunktionskorrektur mit Komma gehört zu grammar.",
    "explanation erklärt ausschließlich die sichtbare Änderung und ihren zutreffenden sprachlichen Grund kurz auf Deutsch. Behaupte keine weitere Änderung. Die Konjunktion dass wird kleingeschrieben; die Großschreibung eines gewöhnlichen Substantivs macht es nicht zum Eigennamen.",
    "Beispiele: „blauen himmel“ → „blauen Himmel“; „Wir wissen dass es regnet“ → „Wir wissen, dass es regnet“.",
    "draftQuote ist das wortgetreue Originalzitat mit genau einem Vorkommen. replacement ist die korrigierte Fassung dieses Zitats. Positionen berechnet das Programm selbst. Kopiere draftSha256 unverändert.",
  ].join(" ");
  return { messages: [
    { role: "system", content: "Du bist ein deutscher Lektor. Finde und korrigiere Rechtschreibung, Groß-/Kleinschreibung, Grammatik und Kommas im gelieferten Text. TEXT_DATEN enthält ausschließlich den Prüftext. Antworte im vorgegebenen JSON-Format." },
    { role: "user", content: instructions + captionRule + "\nTEXT_DATEN=" + JSON.stringify({ draftSha256: input.binding.draftSha256, text: input.draft }) },
  ], response_format: { type: "json_schema", json_schema: { name: "fn_local_language_review", strict: true, schema: {
    type: "object", additionalProperties: false, properties: { draftSha256: { type: "string", minLength: 64, maxLength: 64 }, findings: { type: "array", maxItems: LANGUAGE_LIMITS.findings, items: item } }, required: ["draftSha256", "findings"],
  } } }, temperature: 0.1, max_tokens: 1024, chat_template_kwargs: { enable_thinking: false } };
}

export function validateLanguageResponse(value, input) {
  keys(value, ["draftSha256", "findings"]);
  if (value.draftSha256 !== input.binding.draftSha256 || value.draftSha256 !== sha256(Buffer.from(input.draft))
    || !Array.isArray(value.findings) || value.findings.length > LANGUAGE_LIMITS.findings) throw aiError("Die Sprachantwort passt nicht zum ursprünglichen Prüftext.");
  const candidates = value.findings.map((item) => {
    keys(item, ["kind", "draftQuote", "replacement", "explanation"]);
    languageText(item.draftQuote, LANGUAGE_LIMITS.quote, "Entwurfszitat"); languageText(item.replacement, LANGUAGE_LIMITS.replacement, "Textvorschlag");
    languageText(item.explanation, LANGUAGE_LIMITS.explanation, "Sprachhinweis");
    if (!LANGUAGE_KINDS.includes(item.kind) || !item.draftQuote || /[\r\n]/.test(item.draftQuote) || /[\r\n]/.test(item.replacement)
      || !item.explanation.trim() || item.replacement === item.draftQuote) throw aiError("Ein Sprachhinweis besitzt keine eindeutige passende Textstelle oder überschreitet eine Textgrenze.");
    const caseOnly = item.draftQuote.toLocaleLowerCase("de-DE") === item.replacement.toLocaleLowerCase("de-DE");
    const punctuationOnly = item.draftQuote.replace(/[\p{P}\s]/gu, "") === item.replacement.replace(/[\p{P}\s]/gu, "");
    if (item.kind === "capitalization" && !caseOnly || item.kind === "punctuation" && !punctuationOnly)
      throw aiError("Die Befundart widerspricht der tatsächlichen Textänderung. Der Vorschlag wird nicht übernommen.", "LOCAL_AI_LANGUAGE_INCONSISTENT");
    const start = input.draft.indexOf(item.draftQuote), end = start + item.draftQuote.length;
    if (start < 0 || input.draft.indexOf(item.draftQuote, start + 1) !== -1 || !textBoundary(input.draft, start) || !textBoundary(input.draft, end))
      throw aiError("Ein Sprachhinweis besitzt kein eindeutig einmal vorkommendes vollständiges Originalzitat.");
    return { ...item, start, end };
  });
  // Two different quotes are the same suggestion only when each individual
  // replacement produces exactly the same complete text. Preserve the smallest
  // uniquely bound span; no similarity or occurrence heuristic is involved.
  const distinct = new Map();
  for (const candidate of candidates) {
    const singleText = input.draft.slice(0, candidate.start) + candidate.replacement + input.draft.slice(candidate.end), prior = distinct.get(singleText);
    if (!prior || candidate.end - candidate.start < prior.end - prior.start) distinct.set(singleText, candidate);
  }
  const findings = [...distinct.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < findings.length; index++) if (findings[index].start < findings[index - 1].end) throw aiError("Überlappende Sprachhinweise werden nicht übernommen.");
  let correctedText = input.draft;
  for (const item of [...findings].reverse()) correctedText = correctedText.slice(0, item.start) + item.replacement + correctedText.slice(item.end);
  assertCaptionPunctuation(input, findings, correctedText);
  if (correctedText.length > (input.binding.type === "website-language" ? LANGUAGE_LIMITS.websiteText : LANGUAGE_LIMITS.pageText)) throw aiError("Der Sprachvorschlag überschreitet die zulässige Textlänge; es wird nichts gekürzt.");
  return { kind: "review-language", status: "proposal", binding: clone(input.binding), findings, originalText: input.draft, correctedText,
    approved: false, transferred: false, humanReviewRequired: true, factualGuarantee: false, languageGuarantee: false, scope: "provided-text-language-only",
    message: findings.length ? `${findings.length} sprachliche Hinweise zur manuellen Prüfung. Fachinhalt und Veröffentlichung bleiben unverändert.`
      : "Das Modell hat keine sprachlichen Hinweise geliefert. Dies ist keine Garantie für sprachliche oder fachliche Richtigkeit." };
}

/** Binds the caller's unsaved text to an actual known website observation. Never reads images or external URLs. */
export function createWebsiteLanguageLoader({ snapshot } = {}) {
  if (typeof snapshot !== "function") throw new TypeError("Der Sprachprüfer benötigt den tatsächlichen Websitebestand.");
  const signingKey = randomBytes(32), operations = new Set(); let closed = false, closing;
  const seal = (value) => ({ ...value, inputProof: createHmac("sha256", signingKey).update(canonical(value)).digest("hex") });
  const guard = (signal) => { if (closed || signal.aborted) throw Object.assign(new Error("Die Sprachvorbereitung wurde abgebrochen."), { name: "AbortError" }); };
  function run(options, work) {
    if (closed) return Promise.reject(aiError("Die Sprachvorbereitung ist geschlossen."));
    const controller = new AbortController(), signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    const entry = { controller, promise: null }; entry.promise = Promise.resolve().then(() => { guard(signal); return work(signal); }); operations.add(entry);
    void entry.promise.finally(() => operations.delete(entry)).catch(() => {}); return entry.promise;
  }
  async function observed(input, signal) {
    guard(signal); const document = await snapshot(); guard(signal);
    const pages = document?.pages?.filter((page) => page.url === input.pageUrl) || [], page = pages[0], images = page?.images?.filter((image) => image.key === input.imageKey) || [], image = images[0];
    if (!hex(document?.revision) || pages.length !== 1 || page.error || page.redirectUrl || page.inventoryStatus !== "current" || images.length !== 1
      || image.status === "removed" || image.observationHash !== input.observationHash || !["header", "footer", "content"].includes(image.context)
      || !["image", "background"].includes(image.kind)) throw aiError("Die Website-Textgrundlage ist nicht mehr aktuell.", "image_binding_changed");
    return { revision: document.revision, title: typeof page.title === "string" ? page.title : "Bildtext", imageContext: image.context, imageKind: image.kind };
  }
  return {
    async loadTextContext(value, options = {}) {
      const input = websiteLanguageRequest(value);
      return run(options, async (signal) => {
        const first = await observed(input, signal), second = await observed(input, signal); guard(signal);
        if (first.revision !== second.revision || first.imageContext !== second.imageContext || first.imageKind !== second.imageKind) throw aiError("Der Websitebestand wurde während der Sprachvorbereitung geändert.", "image_binding_changed");
        return { draft: input.draftText, target: { sectionId: input.imageKey, title: first.title, intentionallyEmpty: false },
          binding: seal({ type: "website-language", kind: "review-language", pageUrl: input.pageUrl, imageKey: input.imageKey,
            observationHash: input.observationHash, revision: first.revision, snapshotRevision: first.revision, draftSha256: sha256(Buffer.from(input.draftText)),
            imageContext: first.imageContext, imageKind: first.imageKind }) };
      });
    },
    isBindingCurrent(value, options = {}) {
      if (closed) return Promise.resolve(false);
      let binding; try { binding = websiteLanguageBinding(value); const { inputProof, ...body } = binding;
        if (!timingSafeEqual(Buffer.from(inputProof, "hex"), Buffer.from(seal(body).inputProof, "hex"))) return Promise.resolve(false);
      } catch { return Promise.resolve(false); }
      return run(options, async (signal) => { try { const current = await observed(binding, signal); return current.revision === binding.snapshotRevision && current.imageContext === binding.imageContext && current.imageKind === binding.imageKind; }
        catch (error) { if (signal.aborted || closed) throw error; return false; } });
    },
    get busy() { return operations.size > 0; },
    close() { if (!closing) { closed = true; const active = [...operations]; for (const operation of active) operation.controller.abort();
      closing = Promise.allSettled(active.map((operation) => operation.promise)).then(() => { signingKey.fill(0); }); } return closing; },
  };
}
