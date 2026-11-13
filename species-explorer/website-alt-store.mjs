import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { assertNoStorageLinks } from "./storage-migration.mjs";
import { canonicalWebsiteImageSource, normalizeWebsiteImageUrl, normalizeWebsitePageUrl } from "./website-alt-parser.mjs";
import { suggestedWebsiteAltDecorative, coupledWebsiteAltCaption, isWebsiteAltHeaderLogo, observedWebsiteAltStandard, normalizeWebsiteAltProposalText,
  websiteAltTextConstraint, websiteAltTextLengthProblem, websiteAltCaptionMatchesText } from "./website-alt-policy.mjs";

const MAX_STORE_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 500;
const MAX_IMAGES = 10000;
const HEX = /^[a-f0-9]{64}$/;
const STATUSES = new Set(["missing", "unreviewed", "draft", "approved", "verified", "changed", "removed"]);
const queues = new Map();
const sharedImportTickets = new WeakMap();
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const problem = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const publicMismatch = (message) => Object.assign(problem(message, 409), { code: "website_alt_public_mismatch" });
const conflictingCaptions = (image) => image.captionVariants.filter((value) => value.trim()).length > 1;

function captionMatchesApproval(pageUrl, image, approval) {
  if (!coupledWebsiteAltCaption(pageUrl, image)) return !conflictingCaptions(image);
  const captions = image.captionVariants.filter((value) => value.trim());
  return approval.decorative ? captions.length === 0 : captions.length === 1 && websiteAltCaptionMatchesText(captions[0], approval.text);
}

function knownCoupledTruncation(pageUrl, image, approval) {
  const limit = websiteAltTextConstraint(pageUrl, image);
  return Boolean(limit && approval && !approval.decorative && approval.text.length > limit.maxLength && image.altPresent
    && image.altVariants.length === 1 && image.alt === image.altVariants[0] && image.alt === approval.text.slice(0, limit.maxLength)
    && captionMatchesApproval(pageUrl, image, approval));
}

function publicMismatchMessage(pageUrl, image, approval = null) {
  const caption = image?.captionVariants?.filter((value) => value.trim());
  const expected = approval || (caption?.length === 1 ? { text: caption[0], decorative: false } : null);
  if (image && knownCoupledTruncation(pageUrl, image, expected)) {
    const { length, maxLength } = websiteAltTextLengthProblem(pageUrl, image, expected.text);
    return `Die gekoppelte Bildunterschrift hat ${length}/${maxLength} Zeichen. Squarespace gibt öffentlich nur die ersten ${maxLength} Zeichen als Alternativtext aus. Bitte den Text bewusst kürzen und erneut freigeben. Die öffentliche Bestätigung bleibt offen.`;
  }
  return "Der freigegebene Text oder seine Bildunterschrift ist öffentlich noch nicht eindeutig bestätigt. Die Übernahme bleibt offen.";
}

function boundedText(value, label, max = 4096) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw problem(`${label} ist ungültig oder zu lang.`);
  }
  return value;
}

function timestamp(value, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw problem("Ungültiger Prüfzeitpunkt.");
  return new Date(value).toISOString();
}

function canonicalSource(value) {
  return canonicalWebsiteImageSource(value);
}

function imageObservation(value) {
  if (!value || !["header", "footer", "content"].includes(value.context) || !["image", "background"].includes(value.kind)) {
    throw problem("Ungültige Bildverwendung.");
  }
  const src = normalizeWebsiteImageUrl(value.src);
  const sourceUrl = canonicalSource(src);
  const expectedKey = createHash("sha256").update(`${sourceUrl}\n${value.context}\n${value.kind}`).digest("hex");
  if (value.key !== expectedKey) throw problem("Bildkennung und Bildquelle passen nicht zusammen.");
  const previewSrc = normalizeWebsiteImageUrl(value.previewSrc || src);
  if (canonicalSource(previewSrc) !== sourceUrl) throw problem("Vorschaubild gehört nicht zur Bildquelle.");
  const alt = boundedText(value.alt ?? "", "Alternativtext");
  const caption = boundedText(value.caption ?? "", "Bildunterschrift", 20000);
  const variants = (entries, fallback, label, max) => {
    if (entries !== undefined && (!Array.isArray(entries) || entries.length > 100)) throw problem(`Ungültige ${label}.`);
    return [...new Set((entries || [fallback]).map((entry) => boundedText(entry, label, max)))];
  };
  const altVariants = variants(value.altVariants, alt, "Alternativtextvarianten", 4096);
  const captionVariants = variants(value.captionVariants, caption, "Beschriftungsvarianten", 20000);
  if (!altVariants.includes(alt) || !captionVariants.includes(caption)) throw problem("Bildtexte fehlen in ihren Varianten.");
  return { key: expectedKey, src, previewSrc, sourceUrl, alt, caption, context: value.context, kind: value.kind,
    altPresent: value.altPresent === true, altVariants, captionVariants,
    occurrences: Number.isSafeInteger(value.occurrences) && value.occurrences > 0 ? value.occurrences : 1 };
}

function observationHash(image) {
  return digest({ sourceUrl: canonicalSource(image.src), context: image.context, kind: image.kind,
    alt: image.alt, caption: image.caption, altPresent: image.altPresent,
    altVariants: [...image.altVariants].sort(), captionVariants: [...image.captionVariants].sort() });
}

function initialStatus(image) {
  const alt = image.alt.trim();
  let filename = "";
  try { filename = decodeURIComponent(new URL(image.src).pathname.split("/").at(-1) || ""); } catch { /* The URL was already validated. */ }
  return !alt || alt === filename || /\.(?:jpe?g|png|webp|gif|avif|heic|tiff?|svg)(?:\s|$)/i.test(alt)
    ? "missing" : "unreviewed";
}

function initialDraftText(image) {
  return isWebsiteAltHeaderLogo(image) && image.altPresent && image.altVariants.length === 1
    && image.alt.length <= 2000 && initialStatus(image) === "unreviewed" ? image.alt : "";
}

function applyObservedStandard(image, checkedAt, at) {
  const standard = observedWebsiteAltStandard(image);
  if (!standard || image.status === "removed") return;
  if (image.approval && (image.approval.text !== standard.text || image.approval.decorative !== standard.decorative)) return;
  if (!image.approval && (image.draftSavedAt || image.status === "draft")
      && (image.draftText !== standard.text || image.draftDecorative !== standard.decorative)) return;
  if (!image.approval) {
    const approval = { text: standard.text, decorative: standard.decorative, approvedAt: at,
      observationHash: image.observationHash, method: "website-standard", standardRule: standard.rule };
    image.approval = { ...approval, revision: digest(approval) };
    image.draftText = standard.text;
    image.draftDecorative = standard.decorative;
  }
  image.verification = { checkedAt: timestamp(checkedAt || at), method: "public-html", automatic: true,
    standardRule: standard.rule, approvalRevision: image.approval.revision, observationHash: image.observationHash };
  image.status = "verified";
}

function scanInfo(value = {}) {
  const errors = value.errors || [];
  const coverageNotes = value.coverageNotes || [];
  if (!Array.isArray(errors) || errors.length > MAX_PAGES + 8 || !Array.isArray(coverageNotes) || coverageNotes.length > 100) {
    throw problem("Ungültiger Erfassungsbericht.");
  }
  return { running: false, startedAt: timestamp(value.startedAt, true), completedAt: timestamp(value.completedAt, true),
    complete: value.complete === true, error: boundedText(value.error || "", "Erfassungsfehler"),
    errors: errors.map((entry) => ({ url: boundedText(entry.url || "", "Fehleradresse", 8192),
      message: boundedText(entry.message || entry.error || "Unbekannter Abruffehler", "Abruffehler") })),
    coverageNotes: coverageNotes.map((entry) => boundedText(entry, "Erfassungsgrenze")) };
}

function emptyDocument() {
  const document = { schemaVersion: 1, pages: [], scan: scanInfo(), updatedAt: null };
  return { ...document, revision: digest(document) };
}

function bodyOf(document) {
  const { revision, ...body } = document;
  return body;
}

function checkDocument(document) {
  if (!document || document.schemaVersion !== 1 || !HEX.test(document.revision || "")
      || digest(bodyOf(document)) !== document.revision || !Array.isArray(document.pages) || document.pages.length > MAX_PAGES) {
    throw problem("Alttextbestand ist ungültig; er wurde nicht ersetzt.", 500);
  }
  if (!document.scan || typeof document.scan !== "object" || document.scan.running !== false) throw problem("Ungültiger Erfassungsprüfstand.", 500);
  scanInfo(document.scan);
  timestamp(document.updatedAt, true);
  const urls = new Set();
  let images = 0;
  for (const page of document.pages) {
    const url = normalizeWebsitePageUrl(page.url);
    if (url !== page.url || urls.has(url) || !Array.isArray(page.images)) throw problem("Ungültiger oder doppelter Seiteneintrag.", 500);
    urls.add(url);
    if (page.redirectUrl !== null && page.redirectUrl !== undefined
        && (normalizeWebsitePageUrl(page.redirectUrl) !== page.redirectUrl || page.redirectUrl === page.url)) {
      throw problem("Ungültiges Weiterleitungsziel im Seitenbestand.", 500);
    }
    boundedText(page.title, "Seitentitel");
    timestamp(page.checkedAt, true);
    if (!["not-scanned", "current", "unavailable"].includes(page.inventoryStatus)) throw problem("Ungültiger Seitenprüfstand.", 500);
    boundedText(page.error || "", "Seitenfehler");
    if (!Number.isSafeInteger(page.unsupportedImageCount) || page.unsupportedImageCount < 0 || page.unsupportedImageCount > MAX_IMAGES) {
      throw problem("Ungültiger Bestand unzugeordneter Bilder.", 500);
    }
    if (!Array.isArray(page.coverageNotes) || page.coverageNotes.length > 100) throw problem("Ungültige Seitenprüfgrenzen.", 500);
    page.coverageNotes.forEach((value) => boundedText(value, "Seitenprüfgrenze"));
    const keys = new Set();
    for (const image of page.images) {
      imageObservation(image);
      if (keys.has(image.key) || !STATUSES.has(image.status) || observationHash(image) !== image.observationHash
          || !Array.isArray(image.history) || image.history.length > 1000) throw problem("Ungültiger Bildprüfstand.", 500);
      keys.add(image.key);
      boundedText(image.draftText, "Textentwurf", 2000);
      boundedText(image.draftNote || "", "Prüfhinweis zum Entwurf", 2000);
      timestamp(image.draftSavedAt, true);
      if (typeof image.draftDecorative !== "boolean") throw problem("Ungültige Dekorativauswahl.", 500);
      if (image.approval) {
        const { revision, ...body } = image.approval;
        if (!HEX.test(revision || "") || digest(body) !== revision || !HEX.test(body.observationHash || "")
            || typeof body.decorative !== "boolean" || (!body.text.trim() && !body.decorative)
            || body.decorative && body.text !== "") throw problem("Ungültige Textfreigabe.", 500);
        boundedText(body.text, "Freigegebener Text", 2000);
        timestamp(body.approvedAt);
        if (body.method !== undefined && (body.method !== "website-standard" || ![
          "fn-header-link-v1", "fn-footer-decorative-v1", "content-background-decorative-v1",
        ].includes(body.standardRule))) throw problem("Ungültiger Nachweis einer Standardentscheidung.", 500);
      }
      if (image.verification && (!image.approval || image.verification.approvalRevision !== image.approval.revision
          || image.verification.observationHash !== image.observationHash || image.verification.method !== "public-html")) {
        throw problem("Ungültiger öffentlicher Textnachweis.", 500);
      }
      if (image.verification) timestamp(image.verification.checkedAt);
      if (image.verification?.automatic !== undefined) {
        const standard = observedWebsiteAltStandard(image);
        if (image.verification.automatic !== true || !standard || image.verification.standardRule !== standard.rule
            || image.approval.text !== standard.text || image.approval.decorative !== standard.decorative) {
          throw problem("Ungültiger automatischer Standardnachweis.", 500);
        }
      }
      if (image.status === "verified" && (!image.verification || !image.approval)) throw problem("Erfolgsstatus ohne Textnachweis.", 500);
      if (image.status === "approved" && !image.approval) throw problem("Freigabestatus ohne Freigabe.", 500);
    }
    images += page.images.length;
  }
  if (images > MAX_IMAGES || Buffer.byteLength(JSON.stringify(document)) > MAX_STORE_BYTES) throw problem("Alttextbestand überschreitet die zulässige Größe.", 413);
  return document;
}

function publicSnapshot(document) {
  const summary = { pages: document.pages.filter((page) => !page.redirectUrl).length,
    redirects: document.pages.filter((page) => Boolean(page.redirectUrl)).length, images: 0, publicMissing: 0, missing: 0, unreviewed: 0, draft: 0,
    approved: 0, verified: 0, changed: 0, removed: 0, unknown: 0, unresolved: 0 };
  for (const page of document.pages) {
    if (page.inventoryStatus !== "current" || page.unsupportedImageCount > 0) summary.unknown += 1;
    summary.unresolved += page.unsupportedImageCount;
    for (const image of page.images) {
      if (image.status !== "removed") {
        summary.images += 1;
        if (initialStatus(image) === "missing") summary.publicMissing += 1;
      }
      summary[image.status] += 1;
    }
  }
  const snapshot = clone(document);
  for (const page of snapshot.pages) {
    page.redirectUrl ??= null;
    for (const image of page.images) {
      image.suggestedDecorative = suggestedWebsiteAltDecorative(image);
      image.textCoupled = coupledWebsiteAltCaption(page.url, image);
      image.textConstraint = websiteAltTextConstraint(page.url, image);
    }
  }
  return { ...snapshot, summary };
}

function newPage(url) {
  return { url, title: new URL(url).pathname === "/" ? "Startseite" : decodeURIComponent(new URL(url).pathname),
    checkedAt: null, inventoryStatus: "not-scanned", error: "", images: [], coverageNotes: [], unsupportedImageCount: 0, redirectUrl: null };
}

function retainHistory(image, at, reason) {
  if (image.approval || image.verification) image.history.push({ at, reason,
    approval: clone(image.approval), verification: clone(image.verification) });
  image.approval = null;
  image.verification = null;
}

function canBeIntendedTransfer(previous, next, pageUrl) {
  const approval = previous.approval;
  const coupled = coupledWebsiteAltCaption(pageUrl, next);
  return approval && next.altVariants.length === 1 && !conflictingCaptions(next)
    && (next.altVariants[0] === approval.text || knownCoupledTruncation(pageUrl, next, approval)
      || coupled && captionMatchesApproval(pageUrl, next, approval) && previous.altVariants.includes(next.altVariants[0]))
    && next.captionVariants.every((value) => coupled && (!value.trim() || websiteAltCaptionMatchesText(value, approval.text))
      || previous.captionVariants.includes(value) || value === approval.text)
    && (approval.decorative ? next.altPresent || next.kind === "background" : true);
}

function mergePage(document, input, at) {
  const url = normalizeWebsitePageUrl(input.url);
  if (!Array.isArray(input.images) || input.images.length > MAX_IMAGES) throw problem("Ungültiger Bilderbestand.");
  const redirectUrl = input.redirectUrl === null || input.redirectUrl === undefined ? null : normalizeWebsitePageUrl(input.redirectUrl);
  if (redirectUrl && (redirectUrl === url || input.images.length)) throw problem("Weiterleitung muss auf eine andere eigene Inhaltsseite ohne eigene Bildliste zeigen.");
  let page = document.pages.find((entry) => entry.url === url);
  if (!page) { page = newPage(url); document.pages.push(page); }
  const seen = new Set();
  const nextImages = [];
  for (const value of input.images) {
    const observed = imageObservation(value);
    if (seen.has(observed.key)) throw problem("Doppelte Bildkennung in der Seite.");
    seen.add(observed.key);
    const old = page.images.find((entry) => entry.key === observed.key);
    const hash = observationHash(observed);
    if (!old) {
      const next = { ...observed, observationHash: hash, status: initialStatus(observed),
        draftText: initialDraftText(observed), draftDecorative: suggestedWebsiteAltDecorative(observed), draftSavedAt: null, approval: null, verification: null, history: [] };
      applyObservedStandard(next, input.checkedAt, at);
      nextImages.push(next);
      continue;
    }
    const next = { ...old, ...observed, observationHash: hash, history: [...old.history] };
    if (old.status === "removed" || old.observationHash !== hash) {
      next.verification = null;
      if (old.status !== "removed" && canBeIntendedTransfer(old, observed, url)) next.status = "approved";
      else {
        retainHistory(next, at, old.status === "removed" ? "Bild wieder aufgetaucht" : "Bildtexte oder Verwendung geändert");
        next.status = "changed";
      }
    }
    applyObservedStandard(next, input.checkedAt, at);
    nextImages.push(next);
  }
  for (const old of page.images) {
    if (seen.has(old.key)) continue;
    const removed = { ...old, history: [...old.history] };
    if (old.status !== "removed") retainHistory(removed, at, "Bild nicht mehr in der Seite gefunden");
    removed.status = "removed";
    nextImages.push(removed);
  }
  page.title = boundedText(input.title || page.title, "Seitentitel");
  page.checkedAt = timestamp(input.checkedAt || at);
  page.inventoryStatus = "current";
  page.error = "";
  page.redirectUrl = redirectUrl;
  page.images = nextImages;
  page.unsupportedImageCount = input.unsupportedImageCount ?? 0;
  if (!Array.isArray(input.coverageNotes || []) || (input.coverageNotes || []).length > 100) throw problem("Ungültige Seitenprüfgrenzen.");
  page.coverageNotes = (input.coverageNotes || []).map((value) => boundedText(value, "Seitenprüfgrenze"));
}

function failedPage(document, url, message, at) {
  let page;
  try { page = document.pages.find((entry) => entry.url === normalizeWebsitePageUrl(url)); } catch { return; }
  if (!page) return;
  page.inventoryStatus = "unavailable";
  page.error = boundedText(message, "Abruffehler");
  for (const image of page.images) {
    if (image.verification) {
      image.history.push({ at, reason: "Seite derzeit nicht prüfbar", approval: clone(image.approval), verification: clone(image.verification) });
      image.verification = null;
      if (image.status === "verified") image.status = "approved";
    }
  }
}

// Shared-page transport deliberately retains complete history. Unknown shapes
// stop an exchange instead of being silently stripped from a legacy record.
export function websiteAltPageRevision(page) {
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  return digest(stable(page));
}

export function validateWebsiteAltPageRecord(input) {
  const page = clone(input);
  const known = (value, keys, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw problem(`${label} enthält unbekannte oder ungültige Felder.`);
  };
  known(page, ["url", "title", "checkedAt", "inventoryStatus", "error", "images", "coverageNotes", "unsupportedImageCount", "redirectUrl"], "Gemeinsame Seite");
  for (const image of page.images || []) {
    known(image, ["key", "src", "previewSrc", "sourceUrl", "alt", "caption", "context", "kind", "altPresent", "altVariants", "captionVariants", "occurrences",
      "observationHash", "status", "draftText", "draftDecorative", "draftSavedAt", "draftNote", "approval", "verification", "history"], "Gemeinsames Bild");
    if (image.sourceUrl !== canonicalSource(image.src)) throw problem("Bildquelle und kanonische Bindung unterscheiden sich.");
    for (const history of image.history || []) {
      known(history, ["at", "reason", "approval", "verification", "draftText", "draftDecorative", "draftSavedAt", "draftNote", "status"], "Bildhistorie");
      timestamp(history.at); boundedText(history.reason, "Historiengrund");
      if (history.draftText !== undefined) boundedText(history.draftText, "Historischer Entwurf", 2000);
      if (history.draftDecorative !== undefined && typeof history.draftDecorative !== "boolean") throw problem("Ungültige historische Dekorativauswahl.");
      if (history.draftSavedAt !== undefined) timestamp(history.draftSavedAt, true);
      if (history.draftNote !== undefined) boundedText(history.draftNote, "Historischer Hinweis", 2000);
      if (history.status !== undefined && !STATUSES.has(history.status)) throw problem("Ungültiger historischer Status.");
    }
    for (const entry of [image, ...(image.history || [])]) {
      if (entry.approval) {
        known(entry.approval, ["text", "decorative", "approvedAt", "observationHash", "method", "standardRule", "revision"], "Freigabe");
        const original = entry.approval, revision = original.revision;
        // Existing approval revisions bind the historical writer's field order.
        // A canonical JSON transport may sort keys, so rebuild that documented
        // shape without changing any value or the original approval revision.
        const body = { text: original.text, decorative: original.decorative, approvedAt: original.approvedAt, observationHash: original.observationHash };
        if (original.method !== undefined) { body.method = original.method; body.standardRule = original.standardRule; }
        else if (original.standardRule !== undefined) throw problem("Standardregel ohne zugehörigen Freigabenachweis.");
        if (digest(body) !== revision || !HEX.test(revision) || !HEX.test(body.observationHash) || typeof body.decorative !== "boolean"
          || typeof body.text !== "string" || !body.text.trim() && !body.decorative || body.decorative && body.text !== "") throw problem("Historische Freigabebindung ist ungültig.");
        boundedText(body.text, "Freigabetext", 2000); timestamp(body.approvedAt);
        if (body.method !== undefined && (body.method !== "website-standard" || !["fn-header-link-v1", "fn-footer-decorative-v1", "content-background-decorative-v1"].includes(body.standardRule))) throw problem("Unbekannter Freigabebeleg.");
        entry.approval = { ...body, revision };
      }
      if (entry.verification) {
        known(entry.verification, ["checkedAt", "method", "automatic", "standardRule", "approvalRevision", "observationHash"], "Öffentlicher Nachweis");
        if (!entry.approval || entry.verification.approvalRevision !== entry.approval.revision || !HEX.test(entry.verification.observationHash)
          || entry.verification.method !== "public-html") throw problem("Historischer öffentlicher Nachweis ist nicht an seine Freigabe gebunden.");
        timestamp(entry.verification.checkedAt);
      }
    }
    if (image.verification && (image.altVariants.length !== 1 || image.alt !== image.approval?.text || !captionMatchesApproval(page.url, image, image.approval))) {
      throw problem("Der öffentliche Erfolgsnachweis stimmt nicht mit den beobachteten Bildtexten überein.");
    }
    if (image.approval && (!["approved", "verified"].includes(image.status) || image.draftText !== image.approval.text
      || image.draftDecorative !== image.approval.decorative) || image.verification && image.status !== "verified") {
      throw problem("Entwurf, aktive Freigabe und Erfolgsstatus sind nicht konsistent.");
    }
    const pendingCoupledTransfer = image.status === "approved" && image.approval && coupledWebsiteAltCaption(page.url, image)
      && image.altVariants.length === 1 && captionMatchesApproval(page.url, image, image.approval);
    if (image.approval && image.approval.observationHash !== image.observationHash && !pendingCoupledTransfer
      && (image.altVariants.length !== 1 || image.alt !== image.approval.text || !captionMatchesApproval(page.url, image, image.approval))) {
      throw problem("Eine ältere Freigabe ist weder an diese Beobachtung noch an eine passende öffentliche Ausgabe gebunden.");
    }
  }
  const body = { schemaVersion: 1, pages: [page], scan: scanInfo(), updatedAt: null };
  checkDocument({ ...body, revision: digest(body) });
  return page;
}

export function createWebsiteAltStore({ dataRoot, now = () => new Date() } = {}) {
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) throw new TypeError("Absoluter gemeinsamer Datenpfad erforderlich.");
  const directory = path.join(path.resolve(dataRoot), "website");
  const file = path.join(directory, "alt-texts.json");
  const lockFile = path.join(directory, "alt-texts-lock.sqlite");
  const stamp = () => new Date(now()).toISOString();

  async function read() {
    await assertNoStorageLinks(file);
    let content;
    try {
      const info = await fs.stat(file);
      if (!info.isFile() || info.size > MAX_STORE_BYTES) throw problem("Alttextbestand überschreitet die zulässige Größe.", 413);
      content = await fs.readFile(file, "utf8");
    } catch (error) { if (error.code === "ENOENT") return emptyDocument(); throw error; }
    try { return checkDocument(JSON.parse(content)); }
    catch (error) { throw problem(`Alttextbestand nicht lesbar; Original bleibt erhalten. ${error.message}`, 500); }
  }

  async function mutate(revision, operation, { requireRevision = true, resultFor = publicSnapshot } = {}) {
    const previous = queues.get(file) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      await assertNoStorageLinks(directory);
      await fs.mkdir(directory, { recursive: true });
      await assertNoStorageLinks(lockFile);
      await assertNoStorageLinks(`${file}.previous`);
      const database = new DatabaseSync(lockFile);
      try {
        try { database.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE"); }
        catch { throw problem("Der Alttextbestand wird bereits bearbeitet. Bitte erneut laden.", 409); }
        const document = await read();
        if (requireRevision && (!HEX.test(revision || "") || revision !== document.revision)) {
          throw problem("Der Alttextbestand hat sich inzwischen geändert. Bitte neu laden; eigene Texte bleiben erhalten.", 409);
        }
        const at = stamp();
        const outcome = await operation(document, at);
        if (outcome?.unchanged) return resultFor(document);
        for (const page of document.pages) page.redirectUrl ??= null;
        document.updatedAt = at;
        document.revision = digest(bodyOf(document));
        checkDocument(document);
        await assertNoStorageLinks(file);
        await atomicWriteJson(file, document);
        if (outcome?.error) throw outcome.error;
        return resultFor(document);
      } finally { database.close(); }
    });
    queues.set(file, pending);
    try { return await pending; }
    finally { if (queues.get(file) === pending) queues.delete(file); }
  }

  function findImage(document, payload) {
    const pageUrl = normalizeWebsitePageUrl(payload.pageUrl);
    if (!HEX.test(payload.imageKey || "")) throw problem("Ungültige Bildkennung.");
    const page = document.pages.find((entry) => entry.url === pageUrl);
    const image = page?.images.find((entry) => entry.key === payload.imageKey);
    if (!image || image.status === "removed") throw problem("Das Bild ist nicht mehr im aktuellen Seitenbestand.", 409);
    if (page.inventoryStatus !== "current") throw problem("Die Seite muss zuerst aktuell erfasst werden.", 409);
    return { page, image };
  }

  function draftPayload(payload) {
    const text = boundedText(payload.text, "Textentwurf", 2000).trim();
    if (typeof payload.decorative !== "boolean" || payload.decorative && text) throw problem("Dekorative Bilder benötigen einen bewusst leeren Text.");
    return { text, decorative: payload.decorative };
  }

  return Object.freeze({
    async snapshot() { return publicSnapshot(await read()); },
    async exportPage({ pageUrl } = {}) {
      const document = await read(), url = normalizeWebsitePageUrl(pageUrl), page = document.pages.find((entry) => entry.url === url);
      if (!page) throw problem("Die Seite ist im lokalen Prüfstand nicht vorhanden.", 404);
      const checked = validateWebsiteAltPageRecord(page);
      return { schemaVersion: 1, pageUrl: url, localRevision: document.revision, pageRevision: websiteAltPageRevision(checked), page: checked };
    },
    async exportPages({ pageUrls = [] } = {}) {
      if (!Array.isArray(pageUrls) || pageUrls.length > MAX_PAGES) throw problem("Ungültige ausdrücklich ausgewählte Seitenliste.");
      const document = await read(), urls = new Set(pageUrls.map(normalizeWebsitePageUrl));
      return { localRevision: document.revision, pages: document.pages.filter((page) => urls.has(page.url)).map((page) => {
        const checked = validateWebsiteAltPageRecord(page);
        return { pageUrl: page.url, pageRevision: websiteAltPageRevision(checked), page: checked };
      }) };
    },
    async authorizeSharedPageImport({ page: input, validateEvidence } = {}) {
      if (typeof validateEvidence !== "function") throw problem("Gemeinsame Herkunft muss innerhalb des vertrauenswürdigen Node-Adapters geprüft werden.", 409);
      const page = validateWebsiteAltPageRecord(input), checked = await validateEvidence(clone(page));
      if (checked?.serverValidated !== true || checked.pageUrl !== page.url || checked.pageRevision !== websiteAltPageRevision(page)) throw problem("Gemeinsamer Herkunftsbeleg ist nicht an diese Seite gebunden.", 409);
      const ticket = Object.freeze({}); sharedImportTickets.set(ticket, { file, ...checked }); return ticket;
    },
    async importSharedPage({ revision, pageUrl, expectedPageRevision, page: input, validatedEvidence } = {}) {
      const incoming = validateWebsiteAltPageRecord(input), url = normalizeWebsitePageUrl(pageUrl);
      if (incoming.url !== url) throw problem("Der gemeinsame Prüfstand gehört zu einer anderen Seite.", 409);
      const evidence = validatedEvidence && sharedImportTickets.get(validatedEvidence);
      if (!evidence || evidence.file !== file || evidence.pageUrl !== url || evidence.pageRevision !== websiteAltPageRevision(incoming)
        || evidence.serverValidated !== true) throw problem("Der Seitenstand besitzt keinen kontrolliert geprüften gemeinsamen Herkunftsbeleg.", 409);
      return mutate(revision, (document, at) => {
        const index = document.pages.findIndex((entry) => entry.url === url), existing = index < 0 ? null : document.pages[index];
        if ((existing ? websiteAltPageRevision(existing) : null) !== expectedPageRevision) throw problem("Die lokale Seite wurde seit der Anzeige verändert.", 409);
        if (existing?.checkedAt && (!incoming.checkedAt || Date.parse(incoming.checkedAt) < Date.parse(existing.checkedAt))) throw problem("Ein älterer Scan darf den neueren lokalen Bildbestand nicht ersetzen.", 409);
        const next = clone(incoming);
        if (existing) {
          for (const old of existing.images) {
            const target = next.images.find((entry) => entry.key === old.key);
            if (!target) {
              if (!incoming.checkedAt || !existing.checkedAt || Date.parse(incoming.checkedAt) <= Date.parse(existing.checkedAt)) throw problem("Ein Bildverlust benötigt eine eindeutig neuere Erfassung.", 409);
              const removed = clone(old); retainHistory(removed, at, "Gemeinsamer neuerer Bildbestand enthält diese Verwendung nicht mehr"); removed.status = "removed"; next.images.push(removed); continue;
            }
            if (old.status === "removed" && target.status !== "removed" && (!incoming.checkedAt || !existing.checkedAt || Date.parse(incoming.checkedAt) <= Date.parse(existing.checkedAt))) throw problem("Alte entfernte Bilder dürfen nicht ungeprüft wiederkehren.", 409);
            const merged = [...old.history, ...target.history];
            const decision = (image) => ({ status: image.status, draftText: image.draftText, draftDecorative: image.draftDecorative, draftSavedAt: image.draftSavedAt,
              draftNote: image.draftNote || "", approval: image.approval, verification: image.verification });
            if (digest(decision(old)) !== digest(decision(target))) merged.push({ at, reason: "Lokale Fassung vor gemeinsamem Import erhalten", ...decision(old) });
            const seen = new Set(); target.history = merged.filter((entry) => { const key = websiteAltPageRevision(entry); if (seen.has(key)) return false; seen.add(key); return true; });
          }
        }
        validateWebsiteAltPageRecord(next);
        if (existing && websiteAltPageRevision(existing) === websiteAltPageRevision(next)) return { unchanged: true };
        if (index < 0) document.pages.push(next); else document.pages[index] = next;
      }, { resultFor(document) {
        const page = document.pages.find((entry) => entry.url === url);
        return { revision: document.revision, pageRevision: websiteAltPageRevision(page) };
      } });
    },
    async discover({ urls = [], checkedAt = null, errors = [], coverageNotes = [] } = {}) {
      if (!Array.isArray(urls) || urls.length > MAX_PAGES) throw problem("Zu viele Seiten im Erfassungsbestand.", 413);
      timestamp(checkedAt, true);
      scanInfo({ errors, coverageNotes });
      return mutate(null, (document) => {
        let changed = false;
        for (const value of urls) {
          const url = normalizeWebsitePageUrl(value);
          if (!document.pages.some((page) => page.url === url)) { document.pages.push(newPage(url)); changed = true; }
        }
        return { unchanged: !changed };
      }, { requireRevision: false });
    },
    async mergeScan(result = {}) {
      if (!Array.isArray(result.pages) || !Array.isArray(result.discoveredUrls || []) || result.pages.length > MAX_PAGES) {
        throw problem("Ungültiger Seitenabgleich.");
      }
      return mutate(null, (document, at) => {
        for (const value of result.discoveredUrls || []) {
          const url = normalizeWebsitePageUrl(value);
          if (!document.pages.some((page) => page.url === url)) document.pages.push(newPage(url));
        }
        const seen = new Set();
        for (const page of result.pages) {
          const url = normalizeWebsitePageUrl(page.url);
          if (seen.has(url)) throw problem("Seite wurde im Abgleich doppelt gemeldet.");
          seen.add(url);
          mergePage(document, page, at);
        }
        document.scan = scanInfo(result);
        for (const entry of document.scan.errors) failedPage(document, entry.url, entry.message, at);
      }, { requireRevision: false });
    },
    async draft(payload = {}) {
      const candidate = draftPayload(payload);
      return mutate(payload.revision, (document, at) => {
        const { image } = findImage(document, payload);
        retainHistory(image, at, "Textentwurf geändert");
        image.draftText = candidate.text;
        image.draftDecorative = candidate.decorative;
        image.draftSavedAt = at;
        image.status = "draft";
      });
    },
    async importDrafts({ revision, entries } = {}) {
      if (!Array.isArray(entries) || !entries.length || entries.length > MAX_IMAGES) {
        throw problem("Ungültige Anzahl vorbereiteter Bildtexte.");
      }
      const candidates = entries.map((entry) => ({ ...entry, ...draftPayload(entry),
        note: boundedText(entry.note || "", "Prüfhinweis zum Entwurf", 2000).trim() }));
      return mutate(revision, (document, at) => {
        const seen = new Set();
        const targets = candidates.map((entry) => {
          const { page, image } = findImage(document, entry);
          const identity = `${page.url}\n${image.key}`;
          if (seen.has(identity)) throw problem("Bildtext ist im Import doppelt enthalten.");
          seen.add(identity);
          if (image.observationHash !== entry.observationHash || image.draftSavedAt || image.approval
              || image.status === "draft" || image.status === "verified") {
            throw problem("Ein Bildtext wurde inzwischen bearbeitet oder seine Grundlage geändert. Der gesamte Import bleibt ausgesetzt.", 409);
          }
          if (!entry.text && !entry.decorative) throw problem("Ein vorbereiteter Bildtext darf nicht ungeklärt leer sein.");
          return { image, entry: { ...entry, text: normalizeWebsiteAltProposalText(page.url, image, entry.text) } };
        });
        for (const { image, entry } of targets) {
          retainHistory(image, at, "Vorbereiteter Textentwurf übernommen; menschliche Freigabe offen");
          image.draftText = entry.text;
          image.draftDecorative = entry.decorative;
          image.draftSavedAt = at;
          image.draftNote = entry.note;
          image.status = "draft";
        }
      });
    },
    async approve(payload = {}) {
      const candidate = draftPayload(payload);
      if (!candidate.text && !candidate.decorative) throw problem("Ein fehlender Text kann nicht freigegeben werden.");
      return mutate(payload.revision, (document, at) => {
        const { page, image } = findImage(document, payload);
        const lengthProblem = websiteAltTextLengthProblem(page.url, image, candidate.text);
        if (lengthProblem) throw Object.assign(problem(lengthProblem.message, 409), { code: "website_alt_text_limit" });
        if (image.altVariants.length > 1 || conflictingCaptions(image)) throw problem("Unterschiedliche Texte derselben Bildverwendung müssen einzeln geprüft werden.", 409);
        retainHistory(image, at, "Neue Textfreigabe");
        image.draftText = candidate.text;
        image.draftDecorative = candidate.decorative;
        image.draftSavedAt = at;
        const approval = { text: candidate.text, decorative: candidate.decorative, approvedAt: at, observationHash: image.observationHash };
        image.approval = { ...approval, revision: digest(approval) };
        image.status = "approved";
      });
    },
    async keepExisting(payload = {}) {
      return mutate(payload.revision, (document, at) => {
        const { page, image } = findImage(document, payload);
        if (page.error || !page.checkedAt || page.redirectUrl || payload.observationHash !== image.observationHash
            || payload.approvalRevision !== (image.approval?.revision ?? null)) {
          throw problem("Die angezeigte Bildgrundlage oder Freigabe hat sich geändert. Bitte erneut prüfen.", 409);
        }
        const text = boundedText(image.alt, "Vorhandener Alternativtext", 2000);
        if (text && initialStatus(image) === "missing") throw problem("Ein Dateiname oder fehlender Bildtext kann nicht als ausreichender Alternativtext bestätigt werden.", 409);
        if (typeof payload.decorative !== "boolean" || (text ? payload.decorative : !payload.decorative)
            || !text.trim() && text !== "") throw problem("Ein leerer Website-Text benötigt eine bewusste dekorative Einordnung.", 409);
        if (normalizeWebsitePageUrl(payload.observedPage?.url) !== page.url) throw publicMismatch("Öffentliche Prüfung gehört zu einer anderen Seite.");
        mergePage(document, payload.observedPage, at);
        const fresh = page.images.find((entry) => entry.key === image.key);
        const candidate = { text, decorative: payload.decorative };
        if (!fresh || fresh.status === "removed" || fresh.observationHash !== payload.observationHash
            || fresh.altVariants.length !== 1 || fresh.altVariants[0] !== text || !captionMatchesApproval(page.url, fresh, candidate)
            || fresh.kind === "image" && !fresh.altPresent) {
          return { error: publicMismatch(knownCoupledTruncation(page.url, fresh, fresh?.approval) || knownCoupledTruncation(page.url, fresh, { text: fresh?.caption || "", decorative: false })
            ? publicMismatchMessage(page.url, fresh, fresh?.approval) : "Der vorhandene Text oder seine Bildunterschrift ist öffentlich nicht mehr eindeutig bestätigt. Bitte die aktuelle Bildgrundlage prüfen.") };
        }
        const lengthProblem = websiteAltTextLengthProblem(page.url, fresh, text);
        if (lengthProblem) {
          fresh.verification = null; if (fresh.approval) fresh.status = "approved";
          return { error: publicMismatch(`${lengthProblem.length}/${lengthProblem.maxLength} Zeichen: ${lengthProblem.message}`) };
        }
        if (!fresh.approval || fresh.approval.text !== text || fresh.approval.decorative !== candidate.decorative) {
          fresh.history.push({ at, reason: "Vorhandenen Website-Text bewusst beibehalten und öffentlich geprüft",
            status: fresh.status, draftText: fresh.draftText, draftDecorative: fresh.draftDecorative,
            draftSavedAt: fresh.draftSavedAt, draftNote: fresh.draftNote || "", approval: clone(fresh.approval), verification: clone(fresh.verification) });
          const approval = { ...candidate, approvedAt: at, observationHash: fresh.observationHash };
          fresh.approval = { ...approval, revision: digest(approval) };
        } else if (fresh.draftText !== text || fresh.draftDecorative !== candidate.decorative) {
          fresh.history.push({ at, reason: "Abweichenden Entwurf beim Beibehalten des Website-Texts erhalten",
            status: fresh.status, draftText: fresh.draftText, draftDecorative: fresh.draftDecorative,
            draftSavedAt: fresh.draftSavedAt, draftNote: fresh.draftNote || "", approval: null, verification: null });
        }
        fresh.draftText = text;
        fresh.draftDecorative = candidate.decorative;
        fresh.draftSavedAt = at;
        fresh.verification = { checkedAt: timestamp(payload.observedPage.checkedAt || at), method: "public-html",
          approvalRevision: fresh.approval.revision, observationHash: fresh.observationHash };
        fresh.status = "verified";
      });
    },
    async verify(payload = {}) {
      return mutate(payload.revision, (document, at) => {
        const { page, image } = findImage(document, payload);
        if (!image.approval || payload.approvalRevision !== image.approval.revision) throw problem("Diese konkrete Textfreigabe ist nicht mehr aktuell.", 409);
        if (normalizeWebsitePageUrl(payload.observedPage?.url) !== page.url) throw publicMismatch("Öffentliche Prüfung gehört zu einer anderen Seite.");
        const approval = clone(image.approval);
        mergePage(document, payload.observedPage, at);
        const fresh = page.images.find((entry) => entry.key === image.key);
        const matches = fresh && fresh.status !== "removed" && fresh.approval?.revision === approval.revision
          && fresh.altVariants.length === 1 && fresh.altVariants[0] === approval.text && captionMatchesApproval(page.url, fresh, approval)
          && (approval.decorative ? fresh.altPresent || fresh.kind === "background" : true);
        if (!matches) return { error: publicMismatch(publicMismatchMessage(page.url, fresh, approval)) };
        fresh.verification = { checkedAt: timestamp(payload.observedPage.checkedAt || at), method: "public-html",
          approvalRevision: approval.revision, observationHash: fresh.observationHash };
        fresh.status = "verified";
      });
    },
  });
}
