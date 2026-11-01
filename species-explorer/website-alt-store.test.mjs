import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../scripts/test-temp.mjs";
import { createWebsiteAltStore } from "./website-alt-store.mjs";
import { createWebsiteAltTextsService } from "./website-alt-service.mjs";
import { normalizeWebsiteAltProposalText } from "./website-alt-policy.mjs";

const pageUrl = "https://www.fnwildlifetravel.de/wildlife/island/fraterculaarctica";
const secondUrl = "https://www.fnwildlifetravel.de/reisen/2024-costarica/bocatapada";
const source = "https://images.squarespace-cdn.com/content/v1/abc/photo.JPG?format=2500w";
const now = () => new Date("2026-10-28T18:00:00.000Z");

function image(values = {}) {
  const result = { src: source, alt: "photo.JPG", caption: "", altPresent: true, kind: "image", context: "content", ...values };
  const canonical = new URL(result.src); canonical.searchParams.delete("format"); canonical.searchParams.sort(); canonical.hash = "";
  return { ...result, key: createHash("sha256").update(`${canonical.href}\n${result.context}\n${result.kind}`).digest("hex") };
}

const page = (images = [image()], values = {}) => ({ url: pageUrl, title: "Papageientaucher", checkedAt: now().toISOString(), images, ...values });
const scan = (pages, values = {}) => ({ pages, discoveredUrls: pages.map((entry) => entry.url), errors: [], complete: true,
  coverageNotes: ["Öffentliche statische Erfassung"], completedAt: now().toISOString(), ...values });
const payload = (snapshot, values = {}) => ({ revision: snapshot.revision, pageUrl, imageKey: snapshot.pages[0].images[0].key,
  text: "Papageientaucher auf einem Felsen", decorative: false, ...values });

async function fixture(operation) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "website-alt-"));
  try { await operation(createWebsiteAltStore({ dataRoot: directory, now }), directory); }
  finally { assertTestTempPath(directory); await fs.rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); }
}

test("Alttextbestand beginnt lesend leer; entdeckte neue Seiten sind nicht automatisch geprüft", () => fixture(async (store, root) => {
  const initial = await store.snapshot();
  assert.equal(initial.pages.length, 0);
  await assert.rejects(fs.stat(path.join(root, "website")), { code: "ENOENT" });
  const discovered = await store.discover({ urls: [pageUrl], checkedAt: now().toISOString() });
  assert.equal(discovered.pages[0].inventoryStatus, "not-scanned");
  assert.equal(discovered.summary.unknown, 1);
  assert.equal(discovered.summary.verified, 0);
  assert.equal(discovered.pages[0].images.length, 0);
}));

test("Bekannte Standards werden ausschließlich nach frischem Seitenabgleich mit eindeutigem öffentlichen Nachweis automatisch bestätigt", () => fixture(async (store, root) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const standard = [image({ src: logo, context: "header", alt: "FN Wildlife & Travel" }),
    image({ src: logo, context: "footer", alt: "" }), image({ kind: "background", alt: "", altPresent: false })];
  const excluded = [image({ context: "header", alt: "FN Wildlife & Travel" }),
    image({ src: logo, alt: "" }), image({ context: "content", alt: "" })];
  const observed = [page([...standard, ...excluded]), page([
    image({ src: logo, context: "header", alt: "FN Wildlife &amp; Travel" }),
    image({ src: logo, context: "footer", alt: "FN Wildlife & Travel" }),
    image({ kind: "background", alt: "", caption: "Wichtige Bildunterschrift" }),
  ], { url: secondUrl })];
  assert.equal((await store.snapshot()).summary.verified, 0);
  const current = await store.mergeScan(scan(observed));
  assert.equal(current.summary.verified, 4);
  const checked = [...current.pages[0].images.slice(0, 3), current.pages[1].images[0]];
  for (const entry of checked) {
    assert.equal(entry.approval.method, "website-standard");
    assert.equal(entry.verification.method, "public-html");
    assert.equal(entry.verification.automatic, true);
    assert.equal(entry.verification.approvalRevision, entry.approval.revision);
    assert.equal(entry.verification.observationHash, entry.observationHash);
    assert.equal(entry.verification.checkedAt, now().toISOString());
  }
  assert.equal(checked[3].approval.text, "FN Wildlife &amp; Travel");
  assert.ok(current.pages[0].images.slice(3).every((entry) => entry.status !== "verified" && entry.approval === null));
  assert.ok(current.pages[1].images.slice(1).every((entry) => entry.status !== "verified" && entry.approval === null));
  const file = path.join(root, "website", "alt-texts.json"), bytes = await fs.readFile(file, "utf8");
  assert.equal((await store.snapshot()).revision, current.revision);
  assert.equal(await fs.readFile(file, "utf8"), bytes);
  const repeat = await store.mergeScan(scan(observed));
  assert.deepEqual(repeat.pages.map((entry) => entry.images.map((item) => item.history)), current.pages.map((entry) => entry.images.map((item) => item.history)));
  assert.equal(repeat.revision, current.revision);
}));

test("Standarddrift und fehlgeschlagener Abruf werden wieder offen; Lesen erzeugt niemals eine frische Standardbestätigung", () => fixture(async (store) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const original = page([image({ src: logo, context: "header", alt: "FN Wildlife & Travel" }),
    image({ src: logo, context: "footer", alt: "" }), image({ kind: "background", alt: "", altPresent: false })]);
  let current = await store.mergeScan(scan([original]));
  assert.equal(current.summary.verified, 3);
  current = await store.mergeScan(scan([], { errors: [{ url: pageUrl, message: "Offline" }], complete: false }));
  assert.equal(current.summary.verified, 0);
  assert.equal((await store.snapshot()).summary.verified, 0);
  current = await store.mergeScan(scan([original]));
  assert.equal(current.summary.verified, 3);
  const changed = page([image({ src: logo, context: "header", alt: "FN Wildlife & Travel – Anders" }),
    image({ src: logo, context: "footer", alt: "Zusätzlicher Text" }), image({ kind: "background", alt: "", caption: "Neue Bildunterschrift" })]);
  current = await store.mergeScan(scan([changed]));
  assert.equal(current.summary.verified, 0);
  assert.ok(current.pages[0].images.every((entry) => entry.status === "changed" && !entry.verification));
  assert.equal((await store.snapshot()).summary.verified, 0);
}));

test("Frische Wiederkehr zu bekannten Standards nach fremder Drift wird wieder bestätigt; eigene abweichende Entscheidung bleibt erhalten", () => fixture(async (store) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const standard = page([image({ src: logo, context: "header", alt: "FN Wildlife &amp; Travel" }),
    image({ src: logo, context: "footer", alt: "" }), image({ kind: "background", alt: "", altPresent: false })]);
  const drift = page([image({ src: logo, context: "header", alt: "Fremder Headertext" }),
    image({ src: logo, context: "footer", alt: "Fremder Footertext" }), image({ kind: "background", alt: "", caption: "Fremde Beschriftung" })]);
  let current = await store.mergeScan(scan([standard]));
  const footerKey = current.pages[0].images[1].key;
  current = await store.draft(payload(current, { imageKey: footerKey, text: "Meine abweichende Fußzeile", decorative: false }));
  current = await store.mergeScan(scan([drift]));
  assert.equal(current.summary.verified, 0);
  assert.equal((await store.snapshot()).summary.verified, 0);
  current = await store.mergeScan(scan([drift]));
  assert.equal(current.summary.verified, 0);
  current = await store.mergeScan(scan([standard]));
  assert.equal(current.summary.verified, 2);
  for (const index of [0, 2]) {
    assert.equal(current.pages[0].images[index].verification.automatic, true);
    assert.equal(current.pages[0].images[index].verification.observationHash, current.pages[0].images[index].observationHash);
  }
  assert.equal(current.pages[0].images[1].draftText, "Meine abweichende Fußzeile");
  assert.equal(current.pages[0].images[1].draftDecorative, false);
  assert.equal(current.pages[0].images[1].approval, null);
  assert.notEqual(current.pages[0].images[1].status, "verified");
  const repeated = await store.mergeScan(scan([standard]));
  assert.equal(repeated.revision, current.revision);
}));

test("Automatische Standardprüfung bewahrt abweichende eigene Entwürfe und menschliche Freigaben", () => fixture(async (store) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const observed = page([image({ src: logo, context: "header", alt: "FN Wildlife & Travel" }),
    image({ src: logo, context: "footer", alt: "" }), image({ kind: "background", alt: "", altPresent: false })]);
  let current = await store.mergeScan(scan([observed]));
  current = await store.draft(payload(current, { text: "Mein eigener Linktext", decorative: false }));
  const footerKey = current.pages[0].images[1].key;
  current = await store.approve(payload(current, { imageKey: footerKey, text: "Mein eigener Footertext", decorative: false }));
  const approval = current.pages[0].images[1].approval;
  current = await store.mergeScan(scan([observed]));
  assert.equal(current.pages[0].images[0].status, "draft");
  assert.equal(current.pages[0].images[0].draftText, "Mein eigener Linktext");
  assert.equal(current.pages[0].images[1].approval.revision, approval.revision);
  assert.equal(current.pages[0].images[1].status, "approved");
  assert.equal(current.pages[0].images[2].verification.automatic, true);
}));

test("Passender gespeicherter Standardentwurf wird beim Lesen nicht bestätigt; erst neuer Abruf bestätigt ohne fremde Freigabe zu ersetzen", () => fixture(async (store, root) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const observed = page([image({ src: logo, context: "header", alt: "FN Wildlife &amp; Travel" })]);
  let current = await store.mergeScan(scan([observed]));
  current = await store.draft(payload(current, { text: "FN Wildlife &amp; Travel", decorative: false }));
  const saved = await createWebsiteAltStore({ dataRoot: root, now }).snapshot();
  assert.equal(saved.pages[0].images[0].status, "draft");
  assert.equal(saved.pages[0].images[0].verification, null);
  assert.equal(saved.pages[0].images[0].approval, null);
  current = await store.approve(payload(current, { text: "FN Wildlife &amp; Travel", decorative: false }));
  const approval = current.pages[0].images[0].approval;
  assert.equal(approval.method, undefined);
  current = await store.mergeScan(scan([observed]));
  assert.deepEqual(current.pages[0].images[0].approval, approval);
  assert.equal(current.pages[0].images[0].verification.automatic, true);
  assert.equal(current.pages[0].images[0].status, "verified");
}));

test("Dekorativvorschlag gilt für Inhalts-Hintergründe und das FN-Footerlogo; der funktionale Headerlink bleibt beschriftet", () => fixture(async (store, root) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg?format=1500w";
  const observed = [image({ src: logo, context: "header", alt: "FN Wildlife & Travel" }),
    image({ src: logo, context: "footer", alt: "" }), image({ context: "header" }),
    image({ kind: "background" }), image({ src: logo }), image({ kind: "background", context: "header" })];
  const snapshot = await store.mergeScan(scan([page(observed)]));
  assert.deepEqual(snapshot.pages[0].images.map((entry) => entry.suggestedDecorative), [false, true, false, true, false, false]);
  assert.deepEqual(snapshot.pages[0].images.map((entry) => entry.draftDecorative), [false, true, false, true, false, false]);
  assert.equal(snapshot.pages[0].images[0].draftText, "FN Wildlife & Travel");
  assert.equal(snapshot.pages[0].images[0].status, "verified");
  assert.ok(snapshot.pages[0].images.every((entry) => entry.draftSavedAt === null));
  assert.ok(snapshot.pages[0].images.slice(0, 2).every((entry) => entry.approval.method === "website-standard" && entry.verification.automatic));
  assert.ok(snapshot.pages[0].images.slice(2).every((entry) => entry.approval === null));
  const file = path.join(root, "website", "alt-texts.json"), raw = await fs.readFile(file, "utf8");
  assert.equal(JSON.parse(raw).schemaVersion, 1);
  assert.ok(JSON.parse(raw).pages[0].images.every((entry) => !Object.hasOwn(entry, "suggestedDecorative") && !Object.hasOwn(entry, "textCoupled")));
  const reopened = await createWebsiteAltStore({ dataRoot: root, now }).snapshot();
  assert.deepEqual(reopened.pages[0].images.map((entry) => entry.suggestedDecorative), [false, true, false, true, false, false]);
  assert.equal(await fs.readFile(file, "utf8"), raw, "Ein Vorschlag migriert oder schreibt vorhandene Daten nicht beim Lesen um");
}));

test("Neues FN-Headerlogo übernimmt nur einen eindeutigen vorhandenen Linktext als ungeprüften Vorschlag", () => fixture(async (store) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const variants = [
    { alt: "FN Wildlife & Travel – Startseite." },
    { alt: "FN Wildlife & Travel", altVariants: ["FN Wildlife & Travel", "Anderer Linktext"] },
    { alt: "" },
    { alt: "FN Wildlife & Travel", altPresent: false },
    { alt: "FN Wildlife & Travel Logo glow.jpg" },
    { alt: "F".repeat(2001) },
  ];
  const snapshot = await store.mergeScan(scan(variants.map((values, index) => page([
    image({ src: logo, context: "header", ...values }),
    image({ context: "header", alt: "Ein anderes informatives Headerfoto" }),
    image({ src: logo, context: "footer", alt: "FN Wildlife & Travel" }),
  ], { url: `${pageUrl}/header-${index}` }))));
  assert.deepEqual(snapshot.pages.map((entry) => entry.images[0].draftText), [variants[0].alt, "", "", "", "", ""]);
  assert.ok(snapshot.pages.every((entry) => entry.images[0].draftDecorative === false
    && entry.images[0].draftSavedAt === null && entry.images[0].approval === null && entry.images[0].verification === null));
  assert.ok(snapshot.pages.every((entry) => entry.images[1].draftText === "" && entry.images[1].draftDecorative === false));
  assert.ok(snapshot.pages.every((entry) => entry.images[2].draftText === "" && entry.images[2].draftDecorative === true));
}));

test("Neue Headerregel überschreibt weder einen eigenen Linktext noch eine ausdrücklich gespeicherte Dekorativentscheidung", () => fixture(async (store, root) => {
  const logo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const observed = page([image({ src: logo, context: "header", alt: "FN Wildlife & Travel" })]);
  let snapshot = await store.mergeScan(scan([observed]));
  snapshot = await store.draft(payload(snapshot, { text: "Mein eigener Startseiten-Link", decorative: false }));
  snapshot = await store.mergeScan(scan([observed]));
  assert.equal(snapshot.pages[0].images[0].draftText, "Mein eigener Startseiten-Link");
  assert.equal(snapshot.pages[0].images[0].draftDecorative, false);
  snapshot = await store.approve(payload(snapshot, { text: "", decorative: true }));
  const approval = snapshot.pages[0].images[0].approval;
  snapshot = await store.mergeScan(scan([observed]));
  const reopened = await createWebsiteAltStore({ dataRoot: root, now }).snapshot(), current = reopened.pages[0].images[0];
  assert.equal(current.suggestedDecorative, false);
  assert.equal(current.draftText, "");
  assert.equal(current.draftDecorative, true);
  assert.equal(current.approval.revision, approval.revision);
  assert.equal(current.approval.decorative, true);
}));

test("Dekorative Vorauswahl ersetzt weder eigenen Hintergrundtext noch eine ausdrückliche Freigabe", () => fixture(async (store, root) => {
  const observed = page([image({ kind: "background", alt: "" })]);
  let snapshot = await store.mergeScan(scan([observed]));
  snapshot = await store.draft(payload(snapshot, { text: "Eigener informativer Hintergrund.", decorative: false }));
  snapshot = await store.approve(payload(snapshot, { text: "Eigener informativer Hintergrund.", decorative: false }));
  const approval = snapshot.pages[0].images[0].approval;
  snapshot = await store.mergeScan(scan([observed]));
  const reopened = await createWebsiteAltStore({ dataRoot: root, now }).snapshot();
  const current = reopened.pages[0].images[0];
  assert.equal(current.suggestedDecorative, true);
  assert.equal(current.draftDecorative, false);
  assert.equal(current.draftText, "Eigener informativer Hintergrund.");
  assert.equal(current.approval.revision, approval.revision);
  assert.equal(current.approval.text, "Eigener informativer Hintergrund.");
}));

test("Gekoppelte Beschriftung gilt für Reise-Ortsgalerien und nicht für Reiseübersichten, Arten, Logo oder Hintergrund", () => fixture(async (store) => {
  const urls = [secondUrl, "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen",
    "https://www.fnwildlifetravel.de/reisen/2019-griechenland", "https://www.fnwildlifetravel.de/reisen/uebersicht", pageUrl];
  const snapshot = await store.mergeScan(scan(urls.map((url) => page([image(), image({ kind: "background" }), image({ context: "header" })], { url }))));
  assert.deepEqual(snapshot.pages.map((entry) => entry.images.map((value) => value.textCoupled)),
    [[true, false, false], [true, false, false], [false, false, false], [false, false, false], [false, false, false]]);
}));

test("Bildidentitäten und Texte bleiben nach Wiederöffnung erhalten, ohne lokale Bildkopien", () => fixture(async (store, root) => {
  const snapshot = await store.mergeScan(scan([page([image(), image({ src: source.replace("photo.JPG", "good.JPG"), alt: "Vogel auf einem Ast" })])]));
  assert.equal(snapshot.summary.missing, 1);
  assert.equal(snapshot.summary.unreviewed, 1);
  assert.equal(snapshot.summary.unknown, 0);
  const saved = await store.draft(payload(snapshot, { text: "Mein korrigierter Text" }));
  const reopened = await createWebsiteAltStore({ dataRoot: root, now }).snapshot();
  assert.equal(reopened.revision, saved.revision);
  assert.equal(reopened.pages[0].images[0].draftText, "Mein korrigierter Text");
  const files = await fs.readdir(path.join(root, "website"));
  assert.deepEqual(files.sort(), ["alt-texts-lock.sqlite", "alt-texts.json"]);
}));

test("Freigabe ist kein öffentlicher Übernahmenachweis, auch bei bereits vorhandenem passenden Text", () => fixture(async (store) => {
  const snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel auf Felsen" })])]));
  const approved = await store.approve(payload(snapshot, { text: "Vogel auf Felsen" }));
  const record = approved.pages[0].images[0];
  assert.equal(record.status, "approved");
  assert.equal(record.verification, null);
  assert.equal(approved.summary.verified, 0);
  assert.ok(record.approval.revision);
}));

test("Direkte Freigabe speichert einen neuen Text samt Freigabe dauerhaft ohne separaten Entwurfsschritt", () => fixture(async (store, root) => {
  const before=await store.mergeScan(scan([page([image()])]));
  const approved=await store.approve(payload(before,{text:'Mein korrigierter Bildtext'}));
  const reopened=await createWebsiteAltStore({dataRoot:root,now}).snapshot(),record=reopened.pages[0].images[0];
  assert.equal(reopened.revision,approved.revision);assert.equal(record.draftText,'Mein korrigierter Bildtext');
  assert.equal(record.approval.text,record.draftText);assert.ok(record.draftSavedAt);assert.equal(record.status,'approved');
  assert.equal(record.verification,null);
  await assert.rejects(store.approve(payload(before,{text:'Veraltete Freigabe'})),{statusCode:409});
  assert.equal((await store.snapshot()).revision,approved.revision);
}));

test("Vorbereitete Texte werden atomar und dauerhaft als ungeprüfte Entwürfe übernommen", () => fixture(async (store, root) => {
  const snapshot = await store.mergeScan(scan([page([image(), image({ src: source.replace("photo.JPG", "second.JPG") })])]));
  const entries = snapshot.pages[0].images.map((entry, index) => ({ pageUrl, imageKey: entry.key,
    observationHash: entry.observationHash, text: `Papageientaucher auf Felsen ${index + 1}`, decorative: false,
    note: index ? "Vorhandene Beschriftung gemeinsam prüfen." : "" }));
  const imported = await store.importDrafts({ revision: snapshot.revision, entries });
  assert.equal(imported.summary.draft, 2);
  assert.equal(imported.summary.missing, 0);
  assert.equal(imported.summary.publicMissing, 2);
  assert.equal(imported.summary.approved, 0);
  assert.equal(imported.summary.verified, 0);
  assert.ok(imported.pages[0].images.every((entry) => entry.approval === null && entry.verification === null));
  const reopened = await createWebsiteAltStore({ dataRoot: root, now }).snapshot();
  assert.equal(reopened.revision, imported.revision);
  assert.deepEqual(reopened.pages[0].images.map((entry) => entry.draftText), entries.map((entry) => entry.text));
  assert.equal(reopened.pages[0].images[1].draftNote, entries[1].note);
}));

test("Neue automatische Reisebildvorschläge entfernen nur den letzten eindeutigen Satzpunkt", () => fixture(async (store) => {
  const cases = [
    ["Blick auf das Löwentor.", "Blick auf das Löwentor"],
    ["Ruinen von Mykene. Im Hintergrund die Berge.", "Ruinen von Mykene. Im Hintergrund die Berge"],
    ["Blick mit z. B. zwei Säulen.", "Blick mit z. B. zwei Säulen"],
    ["Blick auf das „Löwentor“.", "Blick auf das „Löwentor“"],
    ["Die Beschriftung lautet „Mykene.“", "Die Beschriftung lautet „Mykene.“"],
    ["Säulen ...", "Säulen ..."], ["Säulen..", "Säulen.."], ["Säulen…", "Säulen…"],
    ["Ruinen aus dem 5. Jh.", "Ruinen aus dem 5. Jh."],
    ["Ruinen von 1200 v. Chr.", "Ruinen von 1200 v. Chr."],
    ["Weitere Säulen usw.", "Weitere Säulen usw."], ["Weitere Säulen z. B.", "Weitere Säulen z. B."],
    ["Blick auf Tor Nr.", "Blick auf Tor Nr."], ["Eingang A.", "Eingang A."], ["Eingang 2.", "Eingang 2."],
    ["Löwentor!", "Löwentor!"], ["Ist das Mykene?", "Ist das Mykene?"],
    ["Ruinen.\nLöwentor.", "Ruinen.\nLöwentor."],
    ["a".repeat(499) + ".", "a".repeat(499)], ["a".repeat(500) + ".", "a".repeat(500) + "."],
  ];
  const observed = page(cases.map((entry, index) => image({ src: source.replace("photo.JPG", `motif-${index}.JPG`) })), { url: secondUrl });
  for (const url of [secondUrl, "https://www.fnwildlifetravel.de/reisen/2020-sizilien"]) {
    assert.deepEqual(cases.map(([text]) => normalizeWebsiteAltProposalText(url, observed.images[0], text)), cases.map((entry) => entry[1]));
  }
  const snapshot = await store.mergeScan(scan([observed]));
  const imported = await store.importDrafts({ revision: snapshot.revision, entries: snapshot.pages[0].images.map((entry, index) => ({
    pageUrl: secondUrl, imageKey: entry.key, observationHash: entry.observationHash, text: cases[index][0], decorative: false,
  })) });
  assert.deepEqual(imported.pages[0].images.map((entry) => entry.draftText), cases.map((entry) => entry[1]));
  assert.ok(imported.pages[0].images.every((entry) => entry.approval === null && entry.status === "draft"));
}));

test("Reise-Punktregel umfasst Übersichten und erhält Arten, Header, menschliche Entwürfe und Freigaben", () => fixture(async (store) => {
  const overview = "https://www.fnwildlifetravel.de/reisen/2019-griechenland";
  const observed = [page(), page([image()], { url: overview }), page([image()], { url: secondUrl }),
    page([image({ context: "header" })], { url: `${secondUrl}/header` })];
  let snapshot = await store.mergeScan(scan(observed));
  const text = "Blick auf die Anlage.";
  snapshot = await store.importDrafts({ revision: snapshot.revision, entries: snapshot.pages.map((entry) => ({
    pageUrl: entry.url, imageKey: entry.images[0].key, observationHash: entry.images[0].observationHash, text, decorative: false,
  })) });
  assert.deepEqual(snapshot.pages.map((entry) => entry.images[0].draftText), [text, "Blick auf die Anlage", "Blick auf die Anlage", text]);
  assert.equal(snapshot.pages[1].images[0].textCoupled, false, "Übersichts-Alttexte bleiben unabhängig von sichtbaren Kachelbeschreibungen");
  const target = { pageUrl: secondUrl, imageKey: snapshot.pages[2].images[0].key, text, decorative: false };
  snapshot = await store.draft({ ...target, revision: snapshot.revision });
  assert.equal(snapshot.pages[2].images[0].draftText, text);
  snapshot = await store.approve({ ...target, revision: snapshot.revision });
  const approval = snapshot.pages[2].images[0].approval;
  snapshot = await store.mergeScan(scan([observed[2]]));
  assert.equal(snapshot.pages[2].images[0].draftText, text);
  assert.deepEqual(snapshot.pages[2].images[0].approval, approval);
}));

test("Import verwirft den gesamten Auftrag bei geänderter Bildgrundlage oder ungültigem Folgetext", () => fixture(async (store) => {
  const snapshot = await store.mergeScan(scan([page([image(), image({ src: source.replace("photo.JPG", "second.JPG") })])]));
  const entries = snapshot.pages[0].images.map((entry) => ({ pageUrl, imageKey: entry.key,
    observationHash: entry.observationHash, text: "Papageientaucher am Felsen", decorative: false }));
  await assert.rejects(store.importDrafts({ revision: snapshot.revision,
    entries: [entries[0], { ...entries[1], observationHash: "0".repeat(64) }] }), { statusCode: 409 });
  assert.equal((await store.snapshot()).revision, snapshot.revision);
  await assert.rejects(store.importDrafts({ revision: snapshot.revision, entries: [entries[0], { ...entries[1], text: "" }] }));
  await assert.rejects(store.importDrafts({ revision: snapshot.revision, entries: [entries[0], entries[0]] }));
  assert.equal((await store.snapshot()).revision, snapshot.revision);
}));

test("Import überschreibt weder eigene Bearbeitungen noch Freigaben oder einen neueren Bestand", () => fixture(async (store) => {
  const initial = await store.mergeScan(scan([page()]));
  const entry = { ...payload(initial), observationHash: initial.pages[0].images[0].observationHash };
  const edited = await store.draft(payload(initial, { text: "Meine Formulierung" }));
  await assert.rejects(store.importDrafts({ revision: initial.revision, entries: [entry] }), { statusCode: 409 });
  await assert.rejects(store.importDrafts({ revision: edited.revision, entries: [entry] }), { statusCode: 409 });
  assert.equal((await store.snapshot()).pages[0].images[0].draftText, "Meine Formulierung");
  const approved = await store.approve(payload(edited));
  await assert.rejects(store.importDrafts({ revision: approved.revision, entries: [entry] }), { statusCode: 409 });
  assert.equal((await store.snapshot()).revision, approved.revision);
}));

test("Öffentliche Prüfung bindet genaue Freigabe und Quelle; geplante Textübernahme erhält die Freigabe", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page()]));
  snapshot = await store.approve(payload(snapshot));
  const approval = snapshot.pages[0].images[0].approval;
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: approval.revision,
    observedPage: page([image({ alt: approval.text, caption: approval.text })]) });
  assert.equal(snapshot.pages[0].images[0].status, "verified");
  assert.equal(snapshot.pages[0].images[0].verification.method, "public-html");
  assert.equal(snapshot.summary.verified, 1);
  assert.equal(snapshot.pages[0].images[0].approval.revision, approval.revision);
}));

test("Veraltete Revisionen verlieren weder fremde Änderungen noch den eigenen noch ungespeicherten Vorschlag", () => fixture(async (store, root) => {
  const baseline = await store.mergeScan(scan([page()]));
  const other = createWebsiteAltStore({ dataRoot: root, now });
  const changed = await other.draft(payload(baseline, { text: "Andere Sitzung" }));
  await assert.rejects(store.approve(payload(baseline)), { statusCode: 409 });
  assert.equal((await store.snapshot()).pages[0].images[0].draftText, "Andere Sitzung");
  assert.equal((await store.snapshot()).revision, changed.revision);
}));

test("Gleichzeitige Änderungen am selben Bestand erlauben genau einen Schreibauftrag", () => fixture(async (store, root) => {
  const snapshot = await store.mergeScan(scan([page()]));
  const second = createWebsiteAltStore({ dataRoot: root, now });
  const results = await Promise.allSettled([store.draft(payload(snapshot, { text: "A" })), second.draft(payload(snapshot, { text: "B" }))]);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  const rejected = results.find((entry) => entry.status === "rejected");
  assert.equal(rejected.reason.statusCode, 409);
}));

test("Bestehende SQLite-Schreibsperre wird respektiert und nach Freigabe ist erneut Schreiben möglich", () => fixture(async (store, root) => {
  let snapshot = await store.mergeScan(scan([page()]));
  const lock = new DatabaseSync(path.join(root, "website", "alt-texts-lock.sqlite"));
  try {
    lock.exec("BEGIN IMMEDIATE");
    await assert.rejects(store.draft(payload(snapshot)), { statusCode: 409 });
  } finally { lock.close(); }
  snapshot = await store.draft(payload(snapshot));
  assert.equal(snapshot.summary.draft, 1);
}));

test("Unveränderter Seitenabgleich bewahrt Entwürfe, Freigaben und bestätigte Übernahmen", () => fixture(async (store) => {
  const observed = page([image({ alt: "Vogel" })]);
  let snapshot = await store.mergeScan(scan([observed]));
  snapshot = await store.draft(payload(snapshot, { text: "Vogel" }));
  snapshot = await store.mergeScan(scan([observed]));
  assert.equal(snapshot.pages[0].images[0].draftText, "Vogel");
  assert.equal(snapshot.summary.draft, 1);
  snapshot = await store.approve(payload(snapshot, { text: "Vogel" }));
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: snapshot.pages[0].images[0].approval.revision, observedPage: observed });
  const receipt = snapshot.pages[0].images[0].verification;
  snapshot = await store.mergeScan(scan([observed]));
  assert.equal(snapshot.summary.verified, 1);
  assert.deepEqual(snapshot.pages[0].images[0].verification, receipt);
}));

test("Geänderte fremde Alttexte oder Captions nehmen alte Freigabe zurück und bewahren die Historie", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel", caption: "Am Meer" })])]));
  snapshot = await store.approve(payload(snapshot, { text: "Vogel" }));
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: snapshot.pages[0].images[0].approval.revision,
    observedPage: page([image({ alt: "Vogel", caption: "Am Meer" })]) });
  snapshot = await store.mergeScan(scan([page([image({ alt: "Anderer Vogel", caption: "Unbekannter Ort" })])]));
  const record = snapshot.pages[0].images[0];
  assert.equal(record.status, "changed");
  assert.equal(record.approval, null);
  assert.equal(record.verification, null);
  assert.ok(record.history.some((entry) => entry.approval));
  assert.equal(record.draftText, "Vogel");
}));

test("Ersetztes Bild wird neu offen, altes Bild bleibt entfernt markiert und andere Seiten bleiben erhalten", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page(), page([image()], { url: secondUrl })]));
  snapshot = await store.draft(payload(snapshot, { text: "Nicht verlieren" }));
  snapshot = await store.mergeScan(scan([page([image({ src: source.replace("photo.JPG", "replacement.JPG") })])], { scope: "page" }));
  assert.equal(snapshot.pages.length, 2);
  assert.equal(snapshot.pages[1].images.length, 1);
  assert.equal(snapshot.pages[0].images.find((entry) => entry.status === "removed").draftText, "Nicht verlieren");
  assert.equal(snapshot.pages[0].images[0].status, "missing");
}));

test("Fehlgeschlagener Abruf erhält Texte und historische Quittungen, behauptet aber keinen aktuellen Erfolg", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel" })])]));
  snapshot = await store.approve(payload(snapshot, { text: "Vogel" }));
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: snapshot.pages[0].images[0].approval.revision,
    observedPage: page([image({ alt: "Vogel" })]) });
  snapshot = await store.mergeScan(scan([], { discoveredUrls: [pageUrl], errors: [{ url: pageUrl, message: "HTTP 503" }], complete: false }));
  assert.equal(snapshot.pages[0].inventoryStatus, "unavailable");
  assert.equal(snapshot.pages[0].images[0].draftText, "Vogel");
  assert.equal(snapshot.summary.verified, 0);
  assert.ok(snapshot.pages[0].images[0].history.some((entry) => entry.verification));
}));

test("Fehlende und widersprüchliche öffentliche Texte erzeugen keinen Übernahmenachweis", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page()]));
  snapshot = await store.approve(payload(snapshot));
  const current = snapshot.pages[0].images[0];
  await assert.rejects(store.verify({ ...payload(snapshot), approvalRevision: current.approval.revision,
    observedPage: page([image({ alt: current.approval.text, altVariants: [current.approval.text, "Fremder Text"] })]) }), { statusCode: 409 });
  const after = await store.snapshot();
  assert.equal(after.summary.verified, 0);
  assert.equal(after.pages[0].images[0].approval, null);
  assert.deepEqual(after.pages[0].images[0].altVariants, [current.approval.text, "Fremder Text"]);
}));

test("Mehrfachverwendung desselben Bildes mit unterschiedlichen Captions benötigt eine Einzelprüfung", () => fixture(async (store) => {
  const snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel", caption: "Am Meer", captionVariants: ["Am Meer", "Im Inland"] })])]));
  await assert.rejects(store.approve(payload(snapshot)), { statusCode: 409 });
}));

test("Reisegalerie ist bei passendem Alttext und veralteter sichtbarer Beschriftung noch nicht übernommen", () => fixture(async (store) => {
  const text = "Vogel im Regenwald";
  const observed = page([image({ alt: text, caption: "Alter sichtbarer Text" })], { url: secondUrl });
  let snapshot = await store.mergeScan(scan([observed]));
  snapshot = await store.approve(payload(snapshot, { pageUrl: secondUrl, text }));
  const approvalRevision = snapshot.pages[0].images[0].approval.revision;
  await assert.rejects(store.verify({ ...payload(snapshot, { pageUrl: secondUrl }), approvalRevision,
    observedPage: observed }), { statusCode: 409 });
  snapshot = await store.snapshot();
  assert.equal(snapshot.summary.verified, 0);
  assert.equal(snapshot.pages[0].images[0].approval.revision, approvalRevision);
  snapshot = await store.verify({ ...payload(snapshot, { pageUrl: secondUrl }), approvalRevision,
    observedPage: page([image({ alt: text, caption: text, captionVariants: [text, ""] })], { url: secondUrl }) });
  assert.equal(snapshot.summary.verified, 1);
}));

test("Geplante gekoppelte Textübernahme erhält die Freigabe in beiden Feldreihenfolgen bis zum vollständigen Nachweis", () => fixture(async (store) => {
  const text = "Vogel im Regenwald";
  for (const first of ["alt", "caption"]) {
    const target = `${secondUrl}/${first}`;
    let snapshot = await store.mergeScan(scan([page([image({ alt: "Alter Text", caption: "Alter Text", captionVariants: ["Alter Text", ""] })], { url: target })]));
    const targetPage = () => snapshot.pages.find((entry) => entry.url === target);
    snapshot = await store.approve({ revision: snapshot.revision, pageUrl: target, imageKey: targetPage().images[0].key,
      text, decorative: false });
    const approvalRevision = targetPage().images[0].approval.revision;
    const partial = image({ alt: first === "alt" ? text : "Alter Text", caption: first === "caption" ? text : "Alter Text" });
    partial.captionVariants = [partial.caption, ""];
    snapshot = await store.mergeScan(scan([page([partial], { url: target })]));
    assert.equal(targetPage().images[0].approval.revision, approvalRevision, first);
    assert.equal(targetPage().images[0].status, "approved", first);
    assert.equal(targetPage().images[0].verification, null, first);
    snapshot = await store.verify({ revision: snapshot.revision, pageUrl: target, imageKey: targetPage().images[0].key,
      approvalRevision, observedPage: page([image({ alt: text, caption: text, captionVariants: [text, ""] })], { url: target }) });
    assert.equal(targetPage().images[0].status, "verified", first);
  }
}));

test("Eine fremde neue Reisebeschriftung ist keine geplante Übernahme und setzt die alte Freigabe zurück", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page([image({ alt: "Alt", caption: "Alt" })], { url: secondUrl })]));
  snapshot = await store.approve(payload(snapshot, { pageUrl: secondUrl, text: "Freigegeben" }));
  snapshot = await store.mergeScan(scan([page([image({ alt: "Freigegeben", caption: "Fremde neue Aussage" })], { url: secondUrl })]));
  assert.equal(snapshot.pages[0].images[0].status, "changed");
  assert.equal(snapshot.pages[0].images[0].approval, null);
  assert.equal(snapshot.pages[0].images[0].draftText, "Freigegeben");
}));

test("Fehlende Reisebildunterschrift liefert trotz passendem Alttext keinen Nachweis; Übersichtstexte und Punkte bleiben frei", () => fixture(async (store) => {
  const overview = "https://www.fnwildlifetravel.de/reisen/2019-griechenland";
  const text = "Bewusst gespeicherter Text.";
  let snapshot = await store.mergeScan(scan([page([image({ alt: text, caption: "" })], { url: secondUrl }),
    page([image({ alt: text, caption: "Ein längerer vorhandener Absatz. Er bleibt erhalten." })], { url: overview })]));
  for (const url of [secondUrl, overview]) {
    const target = snapshot.pages.find((entry) => entry.url === url);
    snapshot = await store.approve({ revision: snapshot.revision, pageUrl: url, imageKey: target.images[0].key, text, decorative: false });
    const current = snapshot.pages.find((entry) => entry.url === url).images[0];
    assert.equal(current.approval.text, text, "Gespeicherte Nutzertexte werden nicht stillschweigend um Punkte gekürzt");
    const verifyPayload = { revision: snapshot.revision, pageUrl: url, imageKey: current.key, approvalRevision: current.approval.revision,
      observedPage: page([image({ alt: text, caption: url === overview ? "Ein längerer vorhandener Absatz. Er bleibt erhalten." : "" })], { url }) };
    if (url === secondUrl) {
      await assert.rejects(store.verify(verifyPayload), { statusCode: 409 });
      snapshot = await store.snapshot();
    } else {
      snapshot = await store.verify(verifyPayload);
      assert.equal(snapshot.pages.find((entry) => entry.url === overview).images[0].status, "verified");
    }
  }
}));

test("Eine unbeschriftete Galeriekopie ist kein Widerspruch zu einer vorhandenen Bildunterschrift", () => fixture(async (store) => {
  const observed = page([image({ alt: "Papageientaucher auf Felsen", caption: "Am Meer", captionVariants: ["Am Meer", ""] })]);
  let snapshot = await store.mergeScan(scan([observed]));
  snapshot = await store.approve(payload(snapshot, { text: "Papageientaucher auf Felsen" }));
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: snapshot.pages[0].images[0].approval.revision,
    observedPage: observed });
  assert.equal(snapshot.summary.verified, 1);
  assert.deepEqual(snapshot.pages[0].images[0].captionVariants, ["Am Meer", ""]);
}));

test("Leerer Alternativtext darf ausschließlich bewusst dekorativ freigegeben und nachgewiesen werden", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page([image({ alt: "" })])]));
  await assert.rejects(store.approve(payload(snapshot, { text: "" })), /fehlender Text/);
  snapshot = await store.approve(payload(snapshot, { text: "", decorative: true }));
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: snapshot.pages[0].images[0].approval.revision,
    observedPage: page([image({ alt: "", altPresent: true })]) });
  assert.equal(snapshot.summary.verified, 1);
  assert.equal(snapshot.pages[0].images[0].approval.decorative, true);
}));

test("Fremde Seiten oder Bildquellen, falsche Bildkennung und ungeeignete Vorschau werden abgewiesen", () => fixture(async (store) => {
  for (const input of [page([], { url: "https://foreign.invalid/page" }), page([image({ src: "https://localhost/private.jpg" })]),
    page([{ ...image(), key: "a".repeat(64) }]), page([{ ...image(), previewSrc: source.replace("photo.JPG", "other.JPG") }])]) {
    await assert.rejects(store.mergeScan(scan([input])));
  }
  assert.equal((await store.snapshot()).pages.length, 0);
}));

test("Bildnachweis einer anderen Seite oder alten Freigabe wird abgewiesen", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page()]));
  snapshot = await store.approve(payload(snapshot));
  const revision = snapshot.pages[0].images[0].approval.revision;
  await assert.rejects(store.verify({ ...payload(snapshot), approvalRevision: revision,
    observedPage: page([image()], { url: secondUrl }) }), { statusCode: 409 });
  await assert.rejects(store.verify({ ...payload(snapshot), approvalRevision: "a".repeat(64), observedPage: page() }), { statusCode: 409 });
}));

test("Unlesbarer oder manipulierter Bestand wird niemals mit einem leeren Ersatz überschrieben", () => fixture(async (store, root) => {
  await store.mergeScan(scan([page()]));
  const filename = path.join(root, "website", "alt-texts.json");
  const broken = "{defekt";
  await fs.writeFile(filename, broken);
  await assert.rejects(store.snapshot(), /Original bleibt erhalten/);
  await assert.rejects(store.discover({ urls: [secondUrl] }), /Original bleibt erhalten/);
  assert.equal(await fs.readFile(filename, "utf8"), broken);
}));

test("Benutzertexte bleiben Textdaten; Textgrenzen und Dekorativwiderspruch werden validiert", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page()]));
  const literal = '<img src=x onerror="alert(1)">';
  snapshot = await store.draft(payload(snapshot, { text: literal }));
  assert.equal(snapshot.pages[0].images[0].draftText, literal);
  await assert.rejects(store.draft(payload(snapshot, { text: "x".repeat(2001) })), /zu lang/);
  await assert.rejects(store.approve(payload(snapshot, { decorative: true })), /leeren Text/);
}));

test("Neue Sitemapentdeckung bewahrt alte Scan- und Freigabedaten", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page()]));
  snapshot = await store.approve(payload(snapshot));
  const before = snapshot.pages[0].images[0].approval;
  snapshot = await store.discover({ urls: [secondUrl], errors: [], checkedAt: now().toISOString() });
  assert.equal(snapshot.pages[0].images[0].approval.revision, before.revision);
  assert.equal(snapshot.scan.complete, true);
  assert.equal(snapshot.pages[1].inventoryStatus, "not-scanned");
  const revision = snapshot.revision;
  snapshot = await store.discover({ urls: [pageUrl, secondUrl], checkedAt: now().toISOString() });
  assert.equal(snapshot.revision, revision);
}));

test("Absichtlich leerer Entwurf und seitenbezogene Prüfgrenzen bleiben nach Änderung erkennbar", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel" })], { coverageNotes: ["Galerie lädt weitere Bilder dynamisch"] })]));
  assert.equal(snapshot.pages[0].images[0].draftSavedAt, null);
  snapshot = await store.draft(payload(snapshot, { text: "", decorative: false }));
  assert.equal(snapshot.pages[0].images[0].draftSavedAt, now().toISOString());
  snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel am Meer" })], { coverageNotes: ["Galerie dynamisch"] })]));
  assert.equal(snapshot.pages[0].images[0].draftText, "");
  assert.equal(snapshot.pages[0].images[0].draftSavedAt, now().toISOString());
  assert.deepEqual(snapshot.pages[0].coverageNotes, ["Galerie dynamisch"]);
}));

test("Bewusst dekorativer Hintergrund darf ohne ein nicht existentes Altattribut eingeordnet werden", () => fixture(async (store) => {
  const background = image({ kind: "background", alt: "", altPresent: false });
  let snapshot = await store.mergeScan(scan([page([background])]));
  snapshot = await store.approve(payload(snapshot, { text: "", decorative: true }));
  snapshot = await store.verify({ ...payload(snapshot), approvalRevision: snapshot.pages[0].images[0].approval.revision,
    observedPage: page([background]) });
  assert.equal(snapshot.summary.verified, 1);
}));

test("Quellrelevante Bildparameter behalten ihre Identität; nur CDN-Vorschauformat ist austauschbar", () => fixture(async (store) => {
  const original = image({ src: `${source}&asset=1`, alt: "Vogel" });
  let snapshot = await store.mergeScan(scan([page([original])]));
  snapshot = await store.approve(payload(snapshot, { text: "Vogel" }));
  const approvedKey = snapshot.pages[0].images[0].key;
  snapshot = await store.mergeScan(scan([page([image({ src: original.src.replace("2500w", "750w"), alt: "Vogel" })])]));
  assert.equal(snapshot.pages[0].images[0].key, approvedKey);
  assert.equal(snapshot.summary.approved, 1);
  snapshot = await store.mergeScan(scan([page([image({ src: original.src.replace("asset=1", "asset=2"), alt: "Vogel" })])]));
  assert.notEqual(snapshot.pages[0].images[0].key, approvedKey);
  assert.equal(snapshot.pages[0].images[0].approval, null);
  assert.equal(snapshot.pages[0].images.find((entry) => entry.key === approvedKey).status, "removed");
}));

test("Nicht zuordenbare Bildverwendungen bleiben als offene Seitenabdeckung erhalten", () => fixture(async (store) => {
  const snapshot = await store.mergeScan(scan([page([image({ alt: "Vogel" })], { unsupportedImageCount: 2 })]));
  assert.equal(snapshot.pages[0].unsupportedImageCount, 2);
  assert.equal(snapshot.summary.unresolved, 2);
  assert.equal(snapshot.summary.unknown, 1);
}));

test("Eigene Aliasadressen bleiben mit Ziel erhalten und zählen getrennt von Inhaltsseiten", () => fixture(async (store, root) => {
  const alias = "https://www.fnwildlifetravel.de/reisen-1";
  let snapshot = await store.mergeScan(scan([page(), page([], { url: alias, title: "Weiterleitung", redirectUrl: secondUrl,
    coverageNotes: ["Öffentliche Weiterleitung"] }), page([image()], { url: secondUrl })]));
  assert.equal(snapshot.summary.pages, 2);
  assert.equal(snapshot.summary.redirects, 1);
  assert.equal(snapshot.summary.unknown, 0);
  assert.equal(snapshot.pages.find((entry) => entry.url === alias).redirectUrl, secondUrl);
  const reopened = await createWebsiteAltStore({ dataRoot: root, now }).snapshot();
  assert.equal(reopened.pages.find((entry) => entry.url === alias).redirectUrl, secondUrl);
  assert.equal(reopened.pages.find((entry) => entry.url === pageUrl).redirectUrl, null);
  await assert.rejects(store.mergeScan(scan([page([], { redirectUrl: pageUrl })])), /andere eigene Inhaltsseite/);
  await assert.rejects(store.mergeScan(scan([page([], { redirectUrl: "https://foreign.invalid/" })])));
  snapshot = await store.snapshot();
  assert.equal(snapshot.summary.redirects, 1);
}));

test("Zur Weiterleitung gewordene Seite erhält frühere Bildentwürfe als entfernt markierten Bestand", () => fixture(async (store) => {
  let snapshot = await store.mergeScan(scan([page()]));
  snapshot = await store.draft(payload(snapshot, { text: "Historischer eigener Entwurf" }));
  snapshot = await store.mergeScan(scan([page([], { redirectUrl: secondUrl })]));
  assert.equal(snapshot.summary.pages, 0);
  assert.equal(snapshot.summary.redirects, 1);
  assert.equal(snapshot.summary.images, 0);
  assert.equal(snapshot.summary.removed, 1);
  assert.equal(snapshot.pages[0].images[0].draftText, "Historischer eigener Entwurf");
}));

test("Verknüpfter Datenpfad wird nicht beschrieben", (t) => fixture(async (_store, root) => {
  const actual = path.join(root, "actual");
  const linked = path.join(root, "linked");
  await fs.mkdir(actual);
  try { await fs.symlink(actual, linked, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("Dateisystem erlaubt keine Testverknüpfung"); return; } throw error; }
  const store = createWebsiteAltStore({ dataRoot: linked, now });
  await assert.rejects(store.discover({ urls: [pageUrl] }), /Verzeichnislink/);
  assert.deepEqual(await fs.readdir(actual), []);
}));

function keepPayload(snapshot, observedPage, values = {}) {
  const current = snapshot.pages[0].images[0];
  return { revision: snapshot.revision, pageUrl: snapshot.pages[0].url, imageKey: current.key,
    observationHash: current.observationHash, approvalRevision: current.approval?.revision ?? null,
    decorative: current.alt === "", observedPage, ...values };
}

test("Vorhandenen Website-Text atomar bestätigen erhält den vorbereiteten Entwurf und frühere Freigabe im Verlauf", () => fixture(async (store) => {
  const observed = page([image({ alt: "Vorhandener vollständiger Bildtext" })]);
  let current = await store.mergeScan(scan([observed]));
  current = await store.approve(payload(current, { text: "Andere frühere Freigabe" }));
  const oldApproval = structuredClone(current.pages[0].images[0].approval);
  current = await store.draft(payload(current, { text: "Vorbereiteter abweichender Entwurf" }));
  const approved = await store.keepExisting(keepPayload(current, observed));
  const kept = approved.pages[0].images[0];
  assert.equal(kept.alt, observed.images[0].alt);
  assert.equal(kept.caption, "");
  assert.equal(kept.draftText, observed.images[0].alt);
  assert.equal(kept.approval.text, observed.images[0].alt);
  assert.equal(kept.status, "verified");
  assert.equal(kept.verification.method, "public-html");
  assert.equal(kept.verification.approvalRevision, kept.approval.revision);
  assert.equal(kept.verification.observationHash, kept.observationHash);
  assert.ok(kept.history.some((entry) => entry.draftText === "Vorbereiteter abweichender Entwurf"));
  assert.ok(kept.history.some((entry) => entry.approval?.revision === oldApproval.revision));
  const { suggestedDecorative, textCoupled, ...record } = kept;
  assert.deepEqual((await store.exportPage({ pageUrl })).page.images[0], record);
}));

test("Passende bestehende Freigabe behält ihre Revision und erhält nur einen frischen öffentlichen Nachweis", () => fixture(async (store) => {
  const observed = page([image({ alt: "Vorhandener Text" })]);
  let current = await store.mergeScan(scan([observed]));
  current = await store.approve(payload(current, { text: "Vorhandener Text" }));
  const approval = structuredClone(current.pages[0].images[0].approval);
  const freshPage = { ...observed, checkedAt: "2026-11-01T12:00:00.000Z" };
  const result = await store.keepExisting(keepPayload(current, freshPage));
  assert.deepEqual(result.pages[0].images[0].approval, approval);
  assert.equal(result.pages[0].images[0].verification.checkedAt, freshPage.checkedAt);
  assert.equal(result.pages[0].images[0].verification.method, "public-html");
}));

test("Vorhandener Reisefototext braucht weiterhin die exakt passende sichtbare Beschriftung", () => fixture(async (store) => {
  const matched = page([image({ alt: "Reisefoto mit vorhandenem Text", caption: "Reisefoto mit vorhandenem Text" })], { url: secondUrl });
  let current = await store.mergeScan(scan([matched]));
  assert.equal((await store.keepExisting(keepPayload(current, matched))).pages[0].images[0].status, "verified");
  const different = page([image({ alt: "Anderer vorhandener Alttext", caption: "Bewusst andere Bildunterschrift" })], { url: secondUrl });
  current = await store.mergeScan(scan([different]));
  current = await store.draft(payload(current, { pageUrl: secondUrl, text: "Vorbereiteter Entwurf bleibt" }));
  await assert.rejects(store.keepExisting(keepPayload(current, different)), /Bildunterschrift.*nicht.*bestätigt/);
  const result = await store.snapshot();
  assert.notEqual(result.pages[0].images[0].status, "verified");
  assert.equal(result.pages[0].images[0].draftText, "Vorbereiteter Entwurf bleibt");
  assert.equal(result.pages[0].images[0].approval, null);
}));

test("Fremde Revision oder Freigabe stoppt das Beibehalten ohne einen Entwurf zu ersetzen", () => fixture(async (store) => {
  const observed = page([image({ alt: "Vorhandener Text" })]);
  let current = await store.mergeScan(scan([observed]));
  const stale = keepPayload(current, observed);
  current = await store.draft(payload(current, { text: "Zwischenzeitlicher anderer Entwurf" }));
  await assert.rejects(store.keepExisting(stale), /geändert/);
  await assert.rejects(store.keepExisting(keepPayload(current, observed, { approvalRevision: "fremd" })), /Freigabe/);
  await assert.rejects(store.keepExisting(keepPayload(current, observed, { observationHash: "f".repeat(64) })), /Bildgrundlage/);
  assert.deepEqual(await store.snapshot(), current);
}));

test("Frische Text-, Caption-, Quellen- oder Variantenabweichung bestätigt keinen früher beobachteten Website-Text", () => fixture(async (store) => {
  for (const changed of [image({ alt: "Geänderter Text" }), image({ alt: "Vorhandener Text", caption: "Neue Beschriftung" }),
    image({ src: "https://images.squarespace-cdn.com/content/v1/abc/other.jpg", alt: "Vorhandener Text" }),
    image({ alt: "Vorhandener Text", altVariants: ["Vorhandener Text", "Andere Verwendung"] })]) {
    const observed = page([image({ alt: "Vorhandener Text" })]);
    let current = await store.mergeScan(scan([observed]));
    current = await store.draft(payload(current, { text: "Persönlicher Entwurf bleibt erhalten" }));
    await assert.rejects(store.keepExisting(keepPayload(current, page([changed]))), /nicht mehr eindeutig bestätigt/);
    const result = await store.snapshot(), kept = result.pages[0].images.find((entry) => entry.key === current.pages[0].images[0].key);
    assert.notEqual(kept.status, "verified");
    assert.equal(kept.draftText, "Persönlicher Entwurf bleibt erhalten");
    assert.equal(kept.approval, null);
  }
}));

test("Leere, fehlende und dateinamenartige Website-Texte werden nur bei ausdrücklich passender Dekorativentscheidung bestätigt", () => fixture(async (store) => {
  for (const alt of ["photo.JPG", "IMG_1074.jpg", "  "]) {
    const observed = page([image({ alt })]);
    const current = await store.mergeScan(scan([observed]));
    await assert.rejects(store.keepExisting(keepPayload(current, observed, { decorative: false })), /Dateiname|fehlend|dekorativ/);
    assert.deepEqual(await store.snapshot(), current);
  }
  const empty = page([image({ alt: "" })]);
  let current = await store.mergeScan(scan([empty]));
  await assert.rejects(store.keepExisting(keepPayload(current, empty, { decorative: false })), /dekorativ/);
  current = await store.keepExisting(keepPayload(current, empty, { decorative: true }));
  assert.equal(current.pages[0].images[0].status, "verified");
  assert.equal(current.pages[0].images[0].approval.decorative, true);
  const missingAttribute = page([image({ alt: "", altPresent: false })]);
  current = await store.mergeScan(scan([missingAttribute]));
  await assert.rejects(store.keepExisting(keepPayload(current, missingAttribute, { decorative: true })), /nicht mehr eindeutig bestätigt/);
  assert.equal((await store.snapshot()).pages[0].images[0].verification, null);
}));

test("Fremder gespeicherter Entwurf während des tatsächlichen öffentlichen Serviceabrufs bleibt erhalten und verhindert Beibehalten", () => fixture(async (store, root) => {
  const observed = page([image({ alt: "Vorhandener Website-Text" })]);
  const current = await store.mergeScan(scan([observed]));
  let started, release;
  const entered = new Promise((resolve) => { started = resolve; });
  const service = createWebsiteAltTextsService({ store, now, discovery: { page: () => new Promise((resolve) => { release = resolve; started(); }) } });
  try {
    const pending = service.keepExisting(keepPayload(current, observed));
    await entered;
    const other = createWebsiteAltStore({ dataRoot: root, now });
    const foreign = await other.draft(payload(current, { text: "Zwischenzeitlicher eigener Text in einer anderen Instanz" }));
    release(observed);
    await assert.rejects(pending, /geändert/);
    assert.deepEqual(await store.snapshot(), foreign);
    assert.equal(foreign.pages[0].images[0].approval, null);
    assert.notEqual(foreign.pages[0].images[0].status, "verified");
  } finally { await service.close(); }
}));
