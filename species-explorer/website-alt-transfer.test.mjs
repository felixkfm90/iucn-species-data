import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../scripts/test-temp.mjs";
import { createWebsiteAltStore } from "./website-alt-store.mjs";
import { createWebsiteAltTextsService } from "./website-alt-service.mjs";
import { buildWebsiteAltTransferPlan, loadWebsiteAltTransferReceipt, runWebsiteAltTransfer } from "./website-alt-transfer.mjs";
import { assessSquarespaceGalleryField } from "./desktop/squarespace-gallery-driver.mjs";

const pageUrl = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const now = () => new Date("2026-10-29T18:00:00.000Z");
const clone = (value) => JSON.parse(JSON.stringify(value));
const defer = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function image(index, values = {}) {
  const src = `https://images.squarespace-cdn.com/content/v1/site/photo-${index}.jpg`;
  const result = { src, sourceUrl: src, context: "content", kind: "image", alt: "Alter Text", caption: "Alter Text",
    altPresent: true, ...values };
  return { ...result, key: createHash("sha256").update(`${src}\n${result.context}\n${result.kind}`).digest("hex") };
}
async function fixture(operation, options = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "transfer-"));
  const state = createWebsiteAltStore({ dataRoot: root, now }), calls = [];
  let published = { url: pageUrl, title: "Athen", inventoryStatus: "current", checkedAt: now().toISOString(), images: [image(0), image(1)] };
  let saved = await state.mergeScan({ pages: [published], discoveredUrls: [pageUrl], complete: true });
  saved = await state.approve({ revision: saved.revision, pageUrl, imageKey: saved.pages[0].images[0].key,
    text: "Freigegebener Vogel", decorative: false });
  let connection = { available: true, connected: true, windowOpen: true, message: "Bereit", secret: "must-not-leak" };
  const publishTarget = (target, { caption = true } = {}) => {
    const current = published.images.find((entry) => entry.key === target.imageKey);
    current.alt = target.text; current.altVariants = [target.text];
    if (caption && target.textCoupled) { current.caption = target.text; current.captionVariants = [target.text, ""]; }
  };
  const adapter = {
    snapshot: async () => clone(connection),
    connect: async () => { calls.push(["connect"]); return clone(connection); },
    transfer: async (plan, { signal, assertCurrent }) => {
      calls.push(["transfer", plan]);
      for (const target of plan.images) { await assertCurrent(target.imageKey, target.approvalRevision); assert.equal(signal.aborted, false); publishTarget(target); }
      await assertCurrent();
      return { results: plan.images.map((entry) => ({ imageKey: entry.imageKey, status: "written" })) };
    },
    close: async () => { calls.push(["adapter-close"]); },
  };
  const discovery = { page: async (target, { signal }) => { calls.push(["public-page", target]); assert.equal(signal.aborted, false); return clone(published); } };
  const service = createWebsiteAltTextsService({ store: state, dataRoot: root, discovery,
    transferAdapter: options.noAdapter ? null : adapter, now, loginPollIntervalMs: 1, loginTimeoutMs: options.loginTimeoutMs || 100,
    verificationIntervalMs: options.verificationIntervalMs || 1,
    ...(options.timeoutMs ? { transferTimeoutMs: options.timeoutMs } : {}) });
  const payload = async () => ({ revision: (await state.snapshot()).revision, pageUrl });
  try { await operation({ root, state, service, adapter, discovery, calls, payload, publishTarget,
    getPublished: () => clone(published), setPublished: (value) => { published = clone(value); },
    setConnection: (value) => { connection = value; } }); }
  finally { await service.close(); assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); }
}
async function settled(service) {
  for (let index = 0; index < 100; index += 1) {
    const result = await service.snapshot();
    if (!result.transfer.running) return result;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Übernahmejob wurde nicht beendet");
}

test("legacy coupled approvals over 250 characters stop before connection and keep their full text", () => fixture(async ({ state, calls }) => {
  const saved = await state.snapshot(), original = clone(saved);
  original.pages[0].images[0].approval.text = "L".repeat(251);
  const unchanged = JSON.stringify(original);
  assert.throws(() => buildWebsiteAltTransferPlan(original, { revision: original.revision, pageUrl }), /251.*250|250.*251/);
  assert.equal(JSON.stringify(original), unchanged);
  original.pages[0].images[0].approval.text = "L".repeat(250);
  assert.equal(buildWebsiteAltTransferPlan(original, { revision: original.revision, pageUrl }).images[0].text.length, 250);
  assert.equal(calls.length, 0);
}));

test("Dyrholaey: Übernahmeplan bindet rohen Alttext trotz kollabierter öffentlicher Caption bis zur Bestätigung", () => fixture(async ({ state, service, adapter, calls, payload, getPublished, setPublished }) => {
  const raw = "...  um hier ihre Nester zu bauen ...", caption = "... um hier ihre Nester zu bauen ...";
  const published = getPublished();
  Object.assign(published.images[0], { alt: raw, caption }); setPublished(published);
  let saved = await state.mergeScan({ pages: [published], discoveredUrls: [pageUrl], complete: true });
  saved = await state.approve({ revision: saved.revision, pageUrl, imageKey: saved.pages[0].images[0].key,
    text: caption, decorative: false });
  const transfer = adapter.transfer;
  adapter.transfer = async (plan, options) => {
    assert.equal(plan.images[0].expectedAlt, raw); assert.equal(plan.images[0].expectedCaption, caption);
    assert.equal(assessSquarespaceGalleryField(plan.images[0], { sourceUrl: plan.images[0].sourceUrl,
      description: raw, plainText: true }).status, "ready");
    return transfer(plan, options);
  };
  await service.transfer(await payload());
  const result = await settled(service), image = result.pages[0].images[0];
  assert.equal(result.transfer.status, "completed"); assert.equal(result.transfer.results[0].status, "verified");
  assert.equal(image.alt, caption); assert.equal(image.caption, caption); assert.equal(image.approval.text, caption);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
}));

test("public text mismatch stays verification-pending instead of claiming the human approval changed", () => fixture(async ({ root, state, adapter, discovery, calls }) => {
  const saved = await state.snapshot(), plan = buildWebsiteAltTransferPlan(saved, { revision: saved.revision, pageUrl });
  let checks = 0;
  const checkingState = { ...state, async verify() {
    checks++;
    throw Object.assign(new Error("Squarespace zeigt noch eine abweichende öffentliche Fassung."), { statusCode: 409, code: "website_alt_public_mismatch" });
  } };
  const result = await runWebsiteAltTransfer({ plan, state: checkingState, adapter, discovery, dataRoot: root,
    signal: new AbortController().signal, now, verificationIntervalMs: 1 });
  assert.equal(result.results[0].status, "verification-pending");
  assert.equal(checks, 5); assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
  assert.equal((await state.snapshot()).pages[0].images[0].approval.revision, saved.pages[0].images[0].approval.revision);
}));

async function waitingForLogin(service) {
  for (let index = 0; index < 100; index += 1) {
    const result = await service.snapshot();
    if (result.transfer.phase === "login-required") return result;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Eigene Anmeldung wurde nicht angeboten");
}

test("Übernehmen öffnet selbst die Verbindung und wartet ohne Schreibversuch auf die eigene Anmeldung", () => fixture(async ({ service, setConnection, calls, payload }) => {
  setConnection({ available: true, connected: false, windowOpen: true, status: "login-required", message: "Bitte anmelden" });
  await service.transfer(await payload());
  const waiting = await waitingForLogin(service);
  assert.equal(waiting.transfer.running, true);
  assert.equal(waiting.transfer.loginRequired, true);
  assert.equal(calls.filter(([name]) => name === "connect").length, 1);
  assert.equal(calls.some(([name]) => name === "transfer"), false);
  await assert.rejects(service.transfer(await payload()), /bereits/);
  await assert.rejects(service.approve({}), /Übernahme/);
  setConnection({ available: true, connected: true, windowOpen: true, message: "Angemeldet" });
  const completed = await settled(service);
  assert.equal(completed.transfer.status, "completed");
  assert.equal(completed.transfer.phase, null);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
}));

test("Während der Anmeldung geänderte seitengebundene Freigaben stoppen den kombinierten Auftrag vor jedem CMS-Schreiben", () => fixture(async ({ service, state, setConnection, calls, payload }) => {
  setConnection({ available: true, connected: false, windowOpen: true, status: "login-required" });
  await service.transfer(await payload()); await waitingForLogin(service);
  const current = await state.snapshot();
  await state.approve({ revision: current.revision, pageUrl, imageKey: current.pages[0].images[0].key,
    text: "Neue Freigabe während Anmeldung", decorative: false });
  setConnection({ available: true, connected: true, windowOpen: true });
  const result = await settled(service);
  assert.equal(result.transfer.status, "failed");
  assert.match(result.transfer.message, /Freigabe|geändert/);
  assert.equal(calls.some(([name]) => name === "transfer"), false);
  assert.equal((await state.snapshot()).pages[0].images[0].approval.text, "Neue Freigabe während Anmeldung");
}));

test("Anmeldungszeitlimit stoppt den kombinierten Auftrag ohne verdeckten Schreib- oder Verbindungswiederholungsversuch", () => fixture(async ({ service, setConnection, calls, payload }) => {
  setConnection({ available: true, connected: false, windowOpen: true, status: "login-required" });
  await service.transfer(await payload());
  await waitingForLogin(service);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const result = await settled(service);
  assert.equal(result.transfer.status, "failed");
  assert.match(result.transfer.message, /Anmeldung.*Zeitlimit|Zeitlimit.*Anmeldung/);
  assert.equal(calls.filter(([name]) => name === "connect").length, 1);
  assert.equal(calls.some(([name]) => name === "transfer"), false);
}, { loginTimeoutMs: 20 }));

test("Schließen während der eigenen Anmeldung beendet den wartenden Auftrag ohne CMS-Schreiben", () => fixture(async ({ service, setConnection, calls, payload }) => {
  setConnection({ available: true, connected: false, windowOpen: true, status: "login-required" });
  await service.transfer(await payload()); await waitingForLogin(service);
  await service.close();
  assert.equal(calls.some(([name]) => name === "transfer"), false);
  assert.equal(calls.filter(([name]) => name === "adapter-close").length, 1);
}));

test("Übernahmeplan enthält nur aktuelle offene Storefreigaben und ignoriert sämtliche Clienttexte", () => fixture(async ({ state }) => {
  let saved = await state.snapshot();
  const second = saved.pages[0].images[1];
  saved = await state.approve({ revision: saved.revision, pageUrl, imageKey: second.key, text: "Alter Text", decorative: false });
  saved = await state.verify({ revision: saved.revision, pageUrl, imageKey: second.key,
    approvalRevision: saved.pages[0].images[1].approval.revision,
    observedPage: { url: pageUrl, title: "Athen", images: saved.pages[0].images, checkedAt: now().toISOString() } });
  const plan = buildWebsiteAltTransferPlan(saved, { revision: saved.revision, pageUrl, text: "Clientangriff",
    approvalRevision: "forged", images: [{ imageKey: "foreign", text: "nicht freigegeben" }] });
  assert.equal(plan.images.length, 1);
  assert.equal(plan.images[0].text, "Freigegebener Vogel");
  assert.equal(plan.images[0].approvalRevision, saved.pages[0].images[0].approval.revision);
  assert.equal(plan.images[0].expectedAlt, "Alter Text");
  assert.equal(plan.images[0].textCoupled, true);
  assert.equal(plan.pageTitle, "Athen");
  assert.equal(Object.isFrozen(plan.images[0]), true);
}));

test("Ohne Desktopadapter bleiben direkte Übernahme und Anmeldung ehrlich gesperrt", () => fixture(async ({ service, calls, payload }) => {
  assert.equal((await service.snapshot()).transfer.available, false);
  await assert.rejects(service.connectTransfer(), /Desktop/);
  await assert.rejects(service.transfer(await payload()), /Desktop/);
  assert.deepEqual(calls, []);
}, { noAdapter: true }));

test("Alte Revision, fremdes Ziel oder ausschließlich unfreigegebene Texte starten keinen CMS-Schreibaufruf", () => fixture(async ({ state, service, calls, payload }) => {
  await assert.rejects(service.transfer({ ...await payload(), revision: "old" }), /geändert/);
  await assert.rejects(service.transfer({ ...await payload(), pageUrl: "https://evil.invalid/page" }));
  let saved = await state.snapshot();
  saved = await state.draft({ revision: saved.revision, pageUrl, imageKey: saved.pages[0].images[0].key, text: "Noch nicht freigegeben", decorative: false });
  await assert.rejects(service.transfer({ ...await payload(), images: [{ text: "frei" }] }), /keine offenen/);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 0);
}));

test("Erst frische öffentliche Ausgabe und Storeprüfung bestätigen den Schreibauftrag dauerhaft", () => fixture(async ({ service, state, calls, payload, root }) => {
  await service.transfer({ ...await payload(), text: "Dieser Clienttext wird ignoriert" });
  const result = await settled(service);
  assert.equal(result.transfer.status, "completed");
  assert.equal(result.transfer.results[0].status, "verified");
  assert.equal(result.transfer.receiptSaved, true);
  assert.equal(result.transfer.secret, undefined);
  assert.equal((await state.snapshot()).summary.verified, 1);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
  assert.equal(calls.filter(([name]) => name === "public-page").length, 1);
  const receipt = JSON.parse(await fs.readFile(path.join(root, "website", "last-transfer.json"), "utf8"));
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.results[0].approvalRevision, (await state.snapshot()).pages[0].images[0].approval.revision);
  assert.equal(result.transfer.results[0].approvalRevision, receipt.results[0].approvalRevision);
}));

test("Neue lokale Freigabe stuft den abgeschlossenen Lauf sofort zurück und bindet auch späteren Nachweis nicht rückwirkend um", () => fixture(async ({ service, state, payload, getPublished, root }) => {
  await service.transfer(await payload());
  const completed = await settled(service), previousApproval = completed.transfer.results[0].approvalRevision;
  const imageKey = completed.pages[0].images[0].key;
  let updated = await service.approve({ revision: completed.revision, pageUrl, imageKey,
    text: "Anderer freigegebener Vogel", decorative: false });
  const newApproval = updated.pages[0].images[0].approval.revision;
  assert.notEqual(newApproval, previousApproval);
  assert.equal(updated.transfer.status, "partial");
  assert.equal(updated.transfer.results[0].status, "verification-pending");
  assert.equal(updated.transfer.results[0].approvalRevision, previousApproval);
  assert.equal(updated.pages[0].images[0].approval.text, "Anderer freigegebener Vogel");
  const published = getPublished();
  published.images[0].alt = "Anderer freigegebener Vogel";
  published.images[0].caption = "Anderer freigegebener Vogel";
  published.images[0].altVariants = [published.images[0].alt];
  published.images[0].captionVariants = [published.images[0].caption];
  updated = await state.verify({ revision: updated.revision, pageUrl, imageKey,
    approvalRevision: newApproval, observedPage: published });
  const current = await service.snapshot();
  assert.equal(current.pages[0].images[0].status, "verified");
  assert.equal(current.transfer.results[0].status, "verification-pending");
  assert.equal(current.transfer.results[0].approvalRevision, previousApproval);
  assert.equal(current.revision, updated.revision);
  const loaded = await loadWebsiteAltTransferReceipt(root, updated);
  assert.equal(loaded.results[0].status, "verification-pending");
  assert.equal(loaded.results[0].approvalRevision, previousApproval);
}));

test("Geschriebener Alttext mit noch falscher Reise-Caption bleibt offen ohne automatische Wiederholung", () => fixture(async ({ adapter, publishTarget, service, state, calls, payload }) => {
  adapter.transfer = async (plan, { assertCurrent }) => {
    calls.push(["transfer"]); await assertCurrent(); publishTarget(plan.images[0], { caption: false });
    return { results: [{ imageKey: plan.images[0].imageKey, status: "written" }] };
  };
  await service.transfer(await payload());
  const result = await settled(service);
  assert.equal(result.transfer.status, "partial");
  assert.equal(result.transfer.results[0].status, "verification-pending");
  assert.match(result.transfer.results[0].error, /Bildunterschrift.*öffentlich|öffentlich.*Bildunterschrift/);
  assert.equal((await state.snapshot()).summary.verified, 0);
  assert.equal((await state.snapshot()).summary.approved, 1);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
  assert.equal(calls.filter(([name]) => name === "public-page").length, 5);
}));

test("Verzögerte öffentliche Ausgabe wird nur lesend nachgeprüft und exakt dieselbe Freigabe bestätigt", () => fixture(async ({ adapter, discovery, publishTarget, service, state, calls, payload, getPublished }) => {
  let target, reads = 0;
  const before = await state.snapshot(), approvalRevision = before.pages[0].images[0].approval.revision;
  adapter.transfer = async (plan, { assertCurrent }) => {
    calls.push(["transfer"]); await assertCurrent(); target = plan.images[0];
    return { results: [{ imageKey: target.imageKey, status: "written" }] };
  };
  discovery.page = async () => {
    reads += 1;
    if (reads === 3) publishTarget(target);
    return getPublished();
  };
  await service.transfer(await payload());
  const result = await settled(service);
  assert.equal(result.transfer.status, "completed");
  assert.equal(reads, 3);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
  assert.equal(result.pages[0].images[0].approval.revision, approvalRevision);
  assert.equal(result.pages[0].images[0].verification.approvalRevision, approvalRevision);
}));

test("Fremder öffentlicher Text stoppt die lesenden Wiederholungen sofort ohne neuen CMS-Aufruf", () => fixture(async ({ adapter, discovery, service, state, calls, payload, getPublished }) => {
  let reads = 0;
  adapter.transfer = async (plan) => {
    calls.push(["transfer"]);
    return { results: [{ imageKey: plan.images[0].imageKey, status: "written" }] };
  };
  discovery.page = async () => {
    reads += 1;
    const page = getPublished();
    Object.assign(page.images[0], { alt: "Fremder Text", altVariants: ["Fremder Text"],
      caption: "Fremder Text", captionVariants: ["Fremder Text"] });
    return page;
  };
  await service.transfer(await payload());
  const result = await settled(service);
  assert.equal(result.transfer.status, "partial");
  assert.equal(reads, 1);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
  assert.equal((await state.snapshot()).summary.verified, 0);
}));

test("Schließen während der verzögerten Nachprüfung beendet die Wartephase ohne weitere Abrufe", () => fixture(async ({ adapter, discovery, service, calls, payload, getPublished }) => {
  const firstRead = defer(); let reads = 0;
  adapter.transfer = async (plan) => {
    calls.push(["transfer"]);
    return { results: [{ imageKey: plan.images[0].imageKey, status: "written" }] };
  };
  discovery.page = async () => { reads += 1; firstRead.resolve(); return getPublished(); };
  await service.transfer(await payload());
  await firstRead.promise;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await service.close();
  assert.equal(reads, 1);
  assert.equal(calls.filter(([name]) => name === "transfer").length, 1);
}, { verificationIntervalMs: 100 }));

test("Nicht unterstützte Felder oder konflikthafte Rückmeldungen sind kein Übernahmenachweis", () => fixture(async ({ adapter, service, state, payload }) => {
  adapter.transfer = async (plan) => ({ results: [{ imageKey: plan.images[0].imageKey, status: "unsupported", error: "Kein unterstütztes Galerie-Feld" }] });
  await service.transfer(await payload());
  const result = await settled(service);
  assert.equal(result.transfer.status, "failed");
  assert.equal(result.transfer.results[0].status, "unsupported");
  assert.equal((await state.snapshot()).summary.verified, 0);
}));

test("Callback verweigert geänderte Freigaben und ungeplante Bildschreibziele vor der Eingabe", () => fixture(async ({ adapter, service, state, payload, calls }) => {
  adapter.transfer = async (plan, { assertCurrent }) => {
    await assert.rejects(assertCurrent("foreign", plan.images[0].approvalRevision), /gebundenen/);
    const current = await state.snapshot();
    await state.approve({ revision: current.revision, pageUrl, imageKey: plan.images[0].imageKey, text: "Neue menschliche Freigabe", decorative: false });
    await assertCurrent(plan.images[0].imageKey, plan.images[0].approvalRevision);
    calls.push(["forbidden-write"]);
    return { results: [] };
  };
  await service.transfer(await payload());
  const result = await settled(service);
  assert.equal(result.transfer.status, "failed");
  assert.equal(calls.some(([name]) => name === "forbidden-write"), false);
  assert.equal((await state.snapshot()).pages[0].images[0].approval.text, "Neue menschliche Freigabe");
}));

test("Ein laufender Schreibauftrag sperrt Zweitjob, Scan und lokale Freigabeänderung", () => fixture(async ({ adapter, service, payload }) => {
  const entered = defer(), finish = defer();
  adapter.transfer = async (plan) => { entered.resolve(); await finish.promise; return { results: [{ imageKey: plan.images[0].imageKey, status: "unsupported" }] }; };
  try {
    await service.transfer(await payload()); await entered.promise;
    await assert.rejects(service.transfer(await payload()), /bereits/);
    await assert.rejects(service.connectTransfer(), /bereits/);
    await assert.rejects(service.scan({ pageUrl }), /Übernahme/);
    await assert.rejects(service.approve({}), /Übernahme/);
  } finally { finish.resolve(); await settled(service); }
}));

test("Schließen bricht den Driver ab und wartet sein echtes Ende vor dem Adapterschluss ab", () => fixture(async ({ adapter, service, payload, calls }) => {
  const entered = defer(), finish = defer(); let signal;
  adapter.transfer = async (plan, options) => { signal = options.signal; entered.resolve(); await finish.promise; calls.push(["writer-end"]); return { results: [{ imageKey: plan.images[0].imageKey, status: "written" }] }; };
  await service.transfer(await payload()); await entered.promise;
  const closing = service.close();
  assert.equal(signal.aborted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some(([name]) => name === "adapter-close"), false);
  finish.resolve(); await closing;
  assert.ok(calls.findIndex(([name]) => name === "writer-end") < calls.findIndex(([name]) => name === "adapter-close"));
  assert.equal(calls.some(([name]) => name === "public-page"), false);
}));

test("Zeitlimit setzt Abbruch und verhindert einen neuen Job bis das bereits laufende Feld beendet ist", () => fixture(async ({ adapter, service, payload }) => {
  const entered = defer(), finish = defer(); let signal;
  adapter.transfer = async (plan, options) => { signal = options.signal; entered.resolve(); await finish.promise; return { results: [{ imageKey: plan.images[0].imageKey, status: "written" }] }; };
  try {
    await service.transfer(await payload()); await entered.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(signal.aborted, true);
    assert.equal((await service.snapshot()).transfer.running, true);
    await assert.rejects(service.transfer(await payload()), /bereits/);
  } finally { finish.resolve(); }
  assert.equal((await settled(service)).transfer.status, "cancelled");
}, { timeoutMs: 5 }));

test("Eigenes Browserfenster bedeutet noch keine Anmeldung; Snapshot übernimmt keine fremden Geheimfelder", () => fixture(async ({ adapter, service, setConnection, payload }) => {
  const login = { available: true, connected: false, windowOpen: true, status: "login-required", message: "Bitte selbst anmelden", cookie: "secret" };
  setConnection(login); adapter.connect = async () => login;
  await service.connectTransfer();
  let result = await settled(service);
  assert.equal(result.transfer.windowOpen, true);
  assert.equal(result.transfer.connected, false);
  assert.equal(result.transfer.loginRequired, true);
  assert.equal(result.transfer.cookie, undefined);
  await service.transfer(await payload());
  result = await waitingForLogin(service);
  assert.equal(result.transfer.connected, false);
  assert.equal(result.transfer.cookie, undefined);
  setConnection({ available: true, connected: true, windowOpen: true, windowHidden: true, message: "Angemeldet" });
  result = await settled(service);
  assert.equal(result.transfer.connected, true);
  assert.equal(result.transfer.windowHidden, true);
  assert.equal(result.transfer.connectionStatus, "ready");
  assert.equal(result.transfer.status, "completed");
}));

test("Ergebnisquittung wird nach Neustart lesend angezeigt und veraltete positive Labels werden herabgestuft", () => fixture(async ({ service, state, root, payload }) => {
  await service.transfer(await payload()); await settled(service);
  const before = await state.snapshot();
  let loaded = await loadWebsiteAltTransferReceipt(root, before);
  assert.equal(loaded.status, "completed");
  assert.equal(loaded.results[0].status, "verified");
  const removed = await loadWebsiteAltTransferReceipt(root, { ...before, pages: [] });
  assert.equal(removed.status, "partial");
  assert.equal(removed.results[0].status, "verification-pending");
  const edited = await state.draft({ revision: before.revision, pageUrl, imageKey: before.pages[0].images[0].key, text: "Neuer eigener Entwurf", decorative: false });
  loaded = await loadWebsiteAltTransferReceipt(root, edited);
  assert.equal(loaded.status, "partial");
  assert.equal(loaded.results[0].status, "verification-pending");
  assert.equal((await state.snapshot()).revision, edited.revision);
  const reopened = createWebsiteAltTextsService({ store: state, dataRoot: root });
  assert.equal((await reopened.snapshot()).transfer.restored, true);
  assert.equal((await reopened.snapshot()).transfer.results[0].status, "verification-pending");
  await reopened.close();
}));

for (const scenario of [
  { label: "Fehlgeschlagener Lauf bleibt nach Verbinden und bewusstem Wiederöffnen sichtbar", partial: false, loginFails: false },
  { label: "Fehlgeschlagene Anmeldung versteckt keine gespeicherten Bildresultate", partial: false, loginFails: true },
  { label: "Teilweiser Lauf behält nach Wiederverbindung alte Freigaberevisionen als ungeklärt", partial: true, loginFails: false },
]) test(scenario.label, () => fixture(async ({ service, state, root, payload, adapter, discovery, publishTarget, setConnection }) => {
  if (scenario.partial) {
    const saved = await state.snapshot();
    await state.approve({ revision: saved.revision, pageUrl, imageKey: saved.pages[0].images[1].key,
      text: "Freigegebener zweiter Vogel", decorative: false });
  }
  adapter.transfer = async (plan, { assertCurrent }) => {
    if (scenario.partial) { await assertCurrent(); publishTarget(plan.images[0]); }
    return { results: plan.images.map((entry, index) => ({ imageKey: entry.imageKey,
      status: scenario.partial && index === 0 ? "written" : "unsupported", error: "Header wird nicht automatisch geändert" })) };
  };
  await service.transfer(await payload());
  const original = await settled(service);
  assert.equal(original.transfer.status, scenario.partial ? "partial" : "failed");
  if (scenario.partial) await service.approve({ revision: original.revision, pageUrl,
    imageKey: original.pages[0].images[0].key, text: "Eine neuere Freigabe", decorative: false });
  await service.close();
  const receiptPath = path.join(root, "website", "last-transfer.json");
  const receiptBefore = await fs.readFile(receiptPath, "utf8");
  const ready = { available: true, connected: true, windowOpen: true, message: "Browser neu verbunden" };
  setConnection({ available: true, connected: false, windowOpen: false, message: "Fenster geschlossen" });
  adapter.connect = async () => {
    if (scenario.loginFails) throw new Error("Anmeldung fehlgeschlagen");
    setConnection(ready); return ready;
  };
  const reopened = createWebsiteAltTextsService({ store: state, dataRoot: root, discovery, transferAdapter: adapter, now });
  try {
    const before = await reopened.snapshot();
    assert.equal(before.transfer.restored, true);
    if (scenario.partial) assert.equal(before.transfer.results[0].status, "verification-pending");
    await reopened.connectTransfer();
    let after = await settled(reopened);
    assert.deepEqual(after.transfer.results, before.transfer.results);
    assert.equal(after.transfer.pageUrl, before.transfer.pageUrl);
    assert.equal(after.transfer.status, before.transfer.status);
    assert.equal(after.transfer.connectionStatus, scenario.loginFails ? "failed" : "ready");
    assert.equal(after.transfer.connectionMessage, scenario.loginFails ? "Anmeldung fehlgeschlagen" : ready.message);
    if (!scenario.loginFails) {
      setConnection({ available: true, connected: false, windowOpen: false });
      await reopened.connectTransfer();
      after = await settled(reopened);
      assert.deepEqual(after.transfer.results, before.transfer.results);
      assert.equal(after.transfer.connectionStatus, "ready");
    }
    assert.equal(await fs.readFile(receiptPath, "utf8"), receiptBefore);
  } finally { await reopened.close(); }
}));

test("Beschädigte oder übergroße Quittung bleibt erhalten und wird nicht als Erfolg angezeigt", () => fixture(async ({ state, root }) => {
  const file = path.join(root, "website", "last-transfer.json");
  await fs.writeFile(file, "{kaputt");
  let loaded = await loadWebsiteAltTransferReceipt(root, await state.snapshot());
  assert.equal(loaded.status, "failed");
  assert.equal(await fs.readFile(file, "utf8"), "{kaputt");
  await fs.writeFile(file, "x".repeat(2 * 1024 * 1024 + 1));
  loaded = await loadWebsiteAltTransferReceipt(root, await state.snapshot());
  assert.equal(loaded.status, "failed");
  assert.match(loaded.message, /Lesegrenze/);
}));

test("Ausfall der öffentlichen Nachprüfung meldet den Seitenstand ungeklärt statt geschrieben mit bestätigt gleichzusetzen", () => fixture(async ({ service, discovery, state, payload }) => {
  discovery.page = async () => { throw new Error("Öffentliche Seite nicht erreichbar"); };
  await service.transfer(await payload());
  const result = await settled(service);
  assert.equal(result.transfer.status, "partial");
  assert.equal(result.transfer.results[0].status, "verification-pending");
  assert.equal((await state.snapshot()).pages[0].inventoryStatus, "unavailable");
  assert.equal((await state.snapshot()).summary.verified, 0);
}));

test("Vorschaufehler behalten nur begrenzte öffentliche Diagnose und keine Adresszusätze oder fremden Inhalte", () => fixture(async ({ service, adapter, state, root, payload }) => {
  const safeAddress = { status: "loaded", origin: "https://www.fnwildlifetravel.de", pathname: new URL(pageUrl).pathname };
  adapter.transfer = async (plan) => ({ results: [{ imageKey: plan.images[0].imageKey, status: "failed",
    error: "Die Seitenvorschau ist nicht geladen.", previewDiagnostic: {
      target: { ...safeAddress, query: "must-not-leak" }, mode: "preview", iframeCount: 1,
      iframe: { status: "empty", rawUrl: "must-not-leak" },
      frames: [{ status: "loaded", origin: "https://vanilla-gerbil-jwnp.squarespace.com", pathname: "/?token=must-not-leak" },
        { status: "foreign", origin: "https://must-not-leak.example", pathname: "/private" }],
      controls: ["Bearbeiten", "must-not-leak"], account: "must-not-leak",
    } }] });
  await service.transfer(await payload());
  const result = await settled(service);
  const expected = { target: safeAddress, mode: "preview", iframeCount: 1,
    iframe: { status: "empty" }, frames: [{ status: "unavailable" }, { status: "foreign" }], controls: ["Bearbeiten"] };
  assert.deepEqual(result.transfer.results[0].previewDiagnostic, expected);
  assert.equal(JSON.stringify(result.transfer).includes("must-not-leak"), false);
  const receiptBytes = await fs.readFile(path.join(root, "website", "last-transfer.json"), "utf8");
  assert.equal(receiptBytes.includes("must-not-leak"), false);
  const loaded = await loadWebsiteAltTransferReceipt(root, await state.snapshot());
  assert.deepEqual(loaded.results[0].previewDiagnostic, expected);
}));

test("Galeriediagnose erhält nur bekannte Phasen, begrenzte Zähler und feste Sichtbarkeitswerte", () => fixture(async ({ service, adapter, state, root, payload }) => {
  adapter.transfer = async (plan) => ({ results: [{ imageKey: plan.images[0].imageKey, status: "failed",
    error: "Der passende Galerieeditor ist nicht eindeutig erreichbar.", previewDiagnostic: { gallery: {
      stage: "open-gallery", access: "map-transform", matchingGallerySections: 1, targetPortalCount: 1,
      frameGalleryButtons: { total: 0, visible: 0, display: [], visibility: [], text: "must-not-leak" },
      mainGalleryButtons: { total: 1, visible: 1, display: ["flex", "must-not-leak", "flex"],
        visibility: ["visible", "must-not-leak"], secret: "must-not-leak" },
      sectionId: "must-not-leak", fieldValue: "must-not-leak",
    } } }] });
  await service.transfer(await payload());
  const result = await settled(service);
  const expected = { stage: "open-gallery", access: "map-transform", matchingGallerySections: 1, targetPortalCount: 1,
    frameGalleryButtons: { total: 0, visible: 0, display: [], visibility: [] },
    mainGalleryButtons: { total: 1, visible: 1, display: ["flex"], visibility: ["visible"] } };
  assert.deepEqual(result.transfer.results[0].previewDiagnostic.gallery, expected);
  assert.equal(JSON.stringify(result.transfer).includes("must-not-leak"), false);
  const receiptPath = path.join(root, "website", "last-transfer.json");
  assert.equal((await fs.readFile(receiptPath, "utf8")).includes("must-not-leak"), false);
  assert.deepEqual((await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.gallery, expected);
  const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  const gallery = receipt.results[0].previewDiagnostic.gallery;
  gallery.matchingGallerySections = 21;
  gallery.targetPortalCount = -1;
  gallery.mainGalleryButtons.total = Infinity;
  gallery.mainGalleryButtons.visible = 0.5;
  await fs.writeFile(receiptPath, JSON.stringify(receipt));
  const bounded = (await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.gallery;
  assert.equal(bounded.matchingGallerySections, 0);
  assert.equal(bounded.targetPortalCount, 0);
  assert.equal(bounded.mainGalleryButtons.total, 0);
  assert.equal(bounded.mainGalleryButtons.visible, 0);
  gallery.access = "must-not-leak";
  await fs.writeFile(receiptPath, JSON.stringify(receipt));
  assert.equal((await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.gallery.access, undefined);
  gallery.stage = "exit-page";
  await fs.writeFile(receiptPath, JSON.stringify(receipt));
  assert.equal((await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.gallery.stage, "exit-page");
  gallery.stage = "must-not-leak";
  await fs.writeFile(receiptPath, JSON.stringify(receipt));
  assert.equal((await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.gallery, undefined);
}));

test("Werkzeugleistendiagnose speichert nur begrenzte Zähler und bekannte Sichtbarkeitswerte", () => fixture(async ({ service, adapter, state, root, payload }) => {
  adapter.transfer = async (plan) => ({ results: [{ imageKey: plan.images[0].imageKey, status: "failed", error: "Editor unklar",
    previewDiagnostic: { editor: { rawToolbarRegions: 2, toolbarRegions: 1, nestedRegionPairs: 0, editButtons: 0,
      saveButtons: 1, exitButtons: 1, disabledSaveButtons: 1, boundEditButtons: 0, boundSaveButtons: 1,
      boundExitButtons: 1, dialogOpen: false, toolbarRectCounts: { withRects: 1, withoutRects: 1 },
      toolbarDisplays: ["contents", "flex", "must-not-leak", "flex"], html: "must-not-leak", fieldValue: "must-not-leak" } } }] });
  await service.transfer(await payload());
  const result = await settled(service);
  const editor = result.transfer.results[0].previewDiagnostic.editor;
  assert.equal(editor.rawToolbarRegions, 2);
  assert.equal(editor.disabledSaveButtons, 1);
  assert.deepEqual(editor.toolbarRectCounts, { withRects: 1, withoutRects: 1 });
  assert.deepEqual(editor.toolbarDisplays, ["contents", "flex"]);
  assert.equal(editor.dialogOpen, false);
  assert.equal(JSON.stringify(result.transfer).includes("must-not-leak"), false);
  assert.deepEqual((await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.editor, editor);
  const file = path.join(root, "website/last-transfer.json"), receipt = JSON.parse(await fs.readFile(file, "utf8"));
  const changed = receipt.results[0].previewDiagnostic.editor;
  changed.rawToolbarRegions = 21; changed.toolbarRegions = -1; changed.saveButtons = 0.5;
  changed.toolbarRectCounts.withRects = 99; changed.dialogOpen = "must-not-leak";
  await fs.writeFile(file, JSON.stringify(receipt));
  const bounded = (await loadWebsiteAltTransferReceipt(root, await state.snapshot())).results[0].previewDiagnostic.editor;
  assert.equal(bounded.rawToolbarRegions, 0); assert.equal(bounded.toolbarRegions, 0); assert.equal(bounded.saveButtons, 0);
  assert.equal(bounded.toolbarRectCounts.withRects, 0); assert.equal(bounded.dialogOpen, undefined);
}));
