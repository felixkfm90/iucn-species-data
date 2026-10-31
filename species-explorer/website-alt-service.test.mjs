import assert from "node:assert/strict";
import test from "node:test";
import { createWebsiteAltTextsService } from "./website-alt-service.mjs";

const url = "https://www.fnwildlifetravel.de/wildlife/island/fraterculaarctica";
const page = { url, title: "Papageientaucher", images: [], checkedAt: "2026-10-28T12:00:00.000Z" };
function fixture(overrides = {}) {
  const calls = [], saved = { revision: "r1", pages: [structuredClone(page)], scan: {} };
  const store = { snapshot: async () => structuredClone(saved),
    discover: async (value) => calls.push(["discover", value]),
    mergeScan: async (value) => calls.push(["merge", value]),
    draft: async (value) => calls.push(["draft", value]),
    approve: async (value) => calls.push(["approve", value]),
    verify: async (value) => calls.push(["verify", value]), ...overrides.store };
  const discovery = { listPages: async () => ({ urls: [url], errors: [], complete: true, coverageNotes: ["Statisches HTML"] }),
    scan: async (options) => { calls.push(["fetch-scan", options]); return { pages: [page], complete: true, errors: [] }; },
    page: async (target) => { calls.push(["fetch-page", target]); return page; }, ...overrides.discovery };
  return { service: createWebsiteAltTextsService({ store, discovery }), calls, saved };
}
async function settled(service) {
  for (let index = 0; index < 50; index += 1) {
    const value = await service.snapshot();
    if (!value.scan.running) return value;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Testprüfung blieb aktiv");
}

test("Website-Bildtextstatus liest ohne Netzabruf oder Datenänderung", async () => {
  const { service, calls } = fixture();
  assert.equal((await service.snapshot()).revision, "r1");
  assert.deepEqual(calls, []);
  await service.close();
});

test("Sitemap-Erkennung und Vollscan sind getrennt; gespeicherte Seiten dienen als zusätzliche Eingänge", async () => {
  const { service, calls } = fixture();
  await service.discover(); await settled(service);
  assert.deepEqual(calls.map(([name]) => name), ["discover"]);
  await service.scan(); await settled(service);
  assert.deepEqual(calls.map(([name]) => name), ["discover", "fetch-scan", "merge"]);
  assert.deepEqual(calls[1][1].seedUrls, [url]);
  await service.close();
});

test("Einzelprüfung erfasst nur die ausdrücklich gewählte Seite", async () => {
  const { service, calls } = fixture();
  await service.scan({ pageUrl: url }); await settled(service);
  assert.deepEqual(calls[0], ["fetch-page", url]);
  assert.deepEqual(calls[1][1].pages, [page]);
  assert.equal(calls[1][1].scope, "page");
  await assert.rejects(service.scan({ pageUrl: "https://foreign.invalid/" }));
  await service.close();
});

test("Parallele Startklicks erzeugen nur einen Netzauftrag", async () => {
  let finish;
  const { service, calls } = fixture({ discovery: { listPages: () => new Promise((resolve) => { finish = resolve; }) } });
  await Promise.all([service.discover(), service.discover(), service.scan()]);
  assert.equal((await service.snapshot()).scan.running, true);
  finish({ urls: [url], complete: true }); await settled(service);
  assert.deepEqual(calls.map(([name]) => name), ["discover"]);
  await service.close();
});

test("Fehlgeschlagene Einzelprüfung meldet die betroffene Seite als ungeprüft an den Store", async () => {
  const { service, calls } = fixture({ discovery: { page: async () => { throw new Error("Seite offline"); } } });
  await service.scan({ pageUrl: url });
  const result = await settled(service);
  assert.equal(result.scan.complete, false);
  assert.deepEqual(calls[0][1].errors, [{ url, message: "Seite offline" }]);
  assert.deepEqual(calls[0][1].pages, []);
  await service.close();
});

test("Netzfehler erhalten den gespeicherten Bestand und melden keinen erfolgreichen Scan", async () => {
  const { service, calls } = fixture({ discovery: { scan: async () => { throw new Error("Offline"); } } });
  await service.scan();
  const result = await settled(service);
  assert.deepEqual(result.pages, [page]);
  assert.equal(result.scan.error, "Offline");
  assert.equal(result.scan.complete, false);
  assert.deepEqual(calls, []);
  await service.close();
});

test("Beschädigter Speicher stoppt schon vor der Erfassung", async () => {
  const { service, calls } = fixture({ store: { snapshot: async () => { throw new Error("Ungültiger Bestand"); } } });
  await assert.rejects(service.discover(), /Ungültiger Bestand/);
  assert.deepEqual(calls, []);
  await service.close();
});

test("Entwurf und Freigabe sind ausschließlich lokale Storeaktionen", async () => {
  const { service, calls } = fixture();
  const payload = { revision: "r1", pageUrl: url, imageKey: "key", text: "Vogel auf einem Felsen" };
  await service.draft(payload); await service.approve(payload);
  assert.deepEqual(calls, [["draft", payload], ["approve", payload]]);
  await service.close();
});

test("Öffentlicher Nachweis braucht passende aktuelle Freigabe und einen frischen Seitenabruf", async () => {
  const { service, calls, saved } = fixture();
  saved.pages[0].images = [{ key: "key", approval: { revision: "a1" } }];
  const payload = { revision: "r1", pageUrl: url, imageKey: "key", approvalRevision: "a1" };
  await assert.rejects(service.verify({ ...payload, revision: "old" }), /geändert/);
  await assert.rejects(service.verify({ ...payload, approvalRevision: "old" }), /Freigabe/i);
  assert.deepEqual(calls, []);
  await service.verify(payload);
  assert.equal(calls[0][0], "fetch-page");
  assert.deepEqual(calls[1], ["verify", { ...payload, observedPage: page }]);
  await service.close();
});

test("Schließen bricht laufende Erfassung ab und verhindert nachträgliches Speichern", async () => {
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const { service, calls } = fixture({ discovery: { listPages: ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("Abgebrochen")), { once: true }); entered();
  }) } });
  await service.discover(); await started; await service.close();
  assert.deepEqual(calls, []);
  await assert.rejects(service.scan(), /geschlossen/);
  await assert.rejects(service.draft({}), /geschlossen/);
});

test("Serverabschluss wartet auf bereits angenommene lokale Schreibvorgänge", async () => {
  let finish, started;
  const entered = new Promise((resolve) => { started = resolve; });
  const { service } = fixture({ store: { draft: () => new Promise((resolve) => { finish = resolve; started(); }) } });
  const writing = service.draft({});
  await entered;
  let closed = false;
  const closing = service.close().then(() => { closed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, false);
  finish(); await writing; await closing;
  assert.equal(closed, true);
});

test("Schließen während der Vorablesung verhindert einen erst danach gestarteten öffentlichen Abruf", async () => {
  let release;
  const { service, calls } = fixture({ store: { snapshot: () => new Promise((resolve) => { release = resolve; }) } });
  const verifying = service.verify({});
  await new Promise((resolve) => setImmediate(resolve));
  const closing = service.close();
  release({ revision: "r1", pages: [] });
  await assert.rejects(verifying, /geschlossen/);
  await closing;
  assert.deepEqual(calls, []);
});
