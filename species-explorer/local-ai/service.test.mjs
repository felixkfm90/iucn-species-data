import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "./files.mjs";
import { createLocalAiService } from "./service.mjs";
import { bindImageInput, bindTextInput, normalizeAltProposal, validateContentResponse } from "./content.mjs";
import { pixel, waitJob } from "./test-fixtures.mjs";

function inputs() {
  return { image: { bytes: pixel, mimeType: "image/png", sha256: sha256(pixel),
    binding: { imageKey: "image-1", pageUrl: "https://www.fnwildlifetravel.de/arten/eisvogel", revision: "image-revision", secret: "never-project-this" },
    context: { pageType: "species", title: "Eisvogel", commonName: "Eisvogel", coupledCaption: false } },
  text: { binding: { documentId: "doc-1", revision: "document-revision", secret: "never-project-this" },
    target: { sectionId: "appearance", title: "Aussehen", intentionallyEmpty: false },
    sources: [{ id: "A", title: "Quellennotiz A", revision: "source-revision", text: "Der Vogel hat eine blaue Oberseite und eine orangefarbene Unterseite.", url: "https://example.test/source" }],
    draft: "Der Vogel hat eine orangefarbene Oberseite." } };
}
function fixture(t, options = {}) {
  const data = inputs(), calls = [], timers = new Map();
  const worker = { complete: async (request) => { calls.push(request); return { text: "Eisvogel sitzt auf einem dünnen Ast.", uncertainties: [] }; },
    stop: async () => {}, close: async () => {}, status: () => ({ state: "stopped" }), ...options.worker };
  const service = createLocalAiService({ worker, loadImage: async (request) => ({ ...data.image, binding: { ...data.image.binding, imageKey: request.imageKey } }), loadTextContext: async () => data.text,
    isBindingCurrent: async () => true, setTimer: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimer: (id) => timers.delete(id), ...options });
  t.after(() => service.close());
  return { service, data, calls, timers, worker };
}

test("Fotovorschlag verwendet nur gebundene Bytes als dataURL, bleibt unfreigegeben und normalisiert den Punkt deterministisch", async (t) => {
  const f = fixture(t), before = JSON.stringify(f.data);
  const job = f.service.start({ kind: "alt-text", ownerId: "felix", imageKey: "image-1", pageUrl: f.data.image.binding.pageUrl });
  const result = await waitJob(f.service, job);
  assert.equal(result.status, "completed");
  assert.equal(result.result.text, "Eisvogel sitzt auf einem dünnen Ast.");
  assert.equal(result.result.approved, false); assert.equal(result.result.transferred, false); assert.equal(result.result.humanReviewRequired, true);
  assert.equal(result.result.factualGuarantee, false);
  assert.equal(result.result.binding.secret, undefined);
  assert.equal(f.calls[0].messages[1].content[1].image_url.url, `data:image/png;base64,${pixel.toString("base64")}`);
  assert.equal(f.calls[0].response_format.type, "json_schema");
  assert.equal(JSON.stringify(f.data), before);
});

test("neue Bildtexte verwenden nur die bestehende gekoppelte Reise-Punktregel; andere Texte behalten ihre Zeichensetzung", () => {
  const input = inputs().image, bound = bindImageInput(input);
  assert.equal(normalizeAltProposal(bound.context, bound.binding, "Eisvogel auf einem Ast.").text, "Eisvogel auf einem Ast.");
  const context = { pageType: "travel-detail", coupledCaption: true };
  const travel = normalizeAltProposal(context, { pageUrl: "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen" }, "Steinportal vor einer antiken Mauer.");
  assert.equal(travel.text, "Steinportal vor einer antiken Mauer"); assert.equal(travel.caption, travel.text);
  assert.equal(normalizeAltProposal(context, { pageUrl: "https://www.fnwildlifetravel.de/anders/unterseite" }, "Antike Mauer.").text, "Antike Mauer.");
  assert.equal(normalizeAltProposal({ pageType: "travel-overview", coupledCaption: false }, bound.binding, "Eine antike Mauer.").text, "Eine antike Mauer.");
  assert.equal(normalizeAltProposal(bound.context, bound.binding, "Aufnahme aus dem Jahr 2019.").text, "Aufnahme aus dem Jahr 2019.");
});

test("Quellengebundene Fachprosa erhält echte Quellen-ID, Revision und wörtliche Belegstelle", async (t) => {
  const f = fixture(t, { worker: { complete: async () => ({ paragraphs: [{ text: "Der Vogel zeigt eine blaue Oberseite.", sourceIds: ["A"],
    evidenceQuotes: [{ sourceId: "A", quote: "blaue Oberseite" }] }] }), stop: async () => {}, close: async () => {} } });
  const result = await waitJob(f.service, f.service.start({ kind: "source-text", ownerId: "felix", documentId: "doc-1", sectionId: "appearance" }));
  assert.equal(result.result.sources[0].revision, "source-revision");
  assert.equal(result.result.paragraphs[0].sourceIds[0], "A");
  assert.equal(result.result.binding.secret, undefined);
  assert.equal(result.result.factualGuarantee, false);
});

test("ohne Quelle und bei bewusst leerem Abschnitt wird ohne Modellaufruf keine Fachprosa erfunden", async (t) => {
  for (const mode of ["missing", "intentionally-empty"]) await t.test(mode, async (st) => {
    const f = fixture(st);
    if (mode === "missing") f.data.text.sources = [];
    else f.data.text.target.intentionallyEmpty = true;
    const result = await waitJob(f.service, f.service.start({ kind: "source-text", ownerId: "felix", documentId: "doc-1", sectionId: "appearance" }));
    assert.equal(result.status, "completed");
    assert.equal(result.result.status, mode === "missing" ? "missing-source" : "intentionally-empty");
    assert.equal(f.calls.length, 0);
  });
});

test("sachliche Vorprüfung meldet nur tatsächliche Entwurfs-/Quellbelege und garantiert keine Faktenrichtigkeit", () => {
  const data = bindTextInput(inputs().text, "review-text");
  const result = validateContentResponse("review-text", { findings: [{ kind: "contradiction", draftQuote: "orangefarbene Oberseite",
    explanation: "Die bereitgestellte Quelle nennt die Oberseite blau.", sourceIds: ["A"], evidenceQuotes: [{ sourceId: "A", quote: "blaue Oberseite" }] }] }, data);
  assert.equal(result.findings.length, 1);
  assert.equal(result.factualGuarantee, false); assert.equal(result.humanReviewRequired, true);
  const none = validateContentResponse("review-text", { findings: [] }, data);
  assert.match(none.message, /keine Faktenbestätigung/);
});

test("erfundene Quellen, erfundene Belegstellen, zusätzliche Freigabefelder und falsche Entwurfszitate werden abgewiesen", () => {
  const data = bindTextInput(inputs().text, "review-text");
  assert.throws(() => validateContentResponse("source-text", { paragraphs: [{ text: "Fakt", sourceIds: ["invented"], evidenceQuotes: [] }] }, data));
  assert.throws(() => validateContentResponse("source-text", { paragraphs: [{ text: "Fakt", sourceIds: ["A"], evidenceQuotes: [{ sourceId: "A", quote: "freie Erfindung" }] }] }, data));
  assert.throws(() => validateContentResponse("review-text", { findings: [{ kind: "contradiction", draftQuote: "steht nicht im Entwurf", explanation: "Hinweis", sourceIds: ["A"], evidenceQuotes: [{ sourceId: "A", quote: "blaue Oberseite" }] }] }, data));
  assert.throws(() => validateContentResponse("alt-text", { text: "Text", uncertainties: [], approved: true }, bindImageInput(inputs().image)));
});

test("Änderung der Bild-/Textgrundlage macht das Ergebnis veraltet und überschreibt keinen vorhandenen Text", async (t) => {
  const f = fixture(t, { isBindingCurrent: async () => false }), before = JSON.stringify(f.data);
  const result = await waitJob(f.service, f.service.start({ kind: "alt-text", ownerId: "felix", imageKey: "image-1" }));
  assert.equal(result.status, "stale"); assert.equal(result.result, null);
  assert.equal(JSON.stringify(f.data), before);
});

test("serieller Worker, begrenzte Queue, Abwahl und Eigentümertrennung funktionieren ohne zweiten parallelen Lauf", async (t) => {
  let release, entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  let active = 0, maximum = 0;
  const f = fixture(t, { worker: { complete: async () => { active += 1; maximum = Math.max(maximum, active); entered(); await pending; active -= 1; return { text: "Eisvogel auf Ast.", uncertainties: [] }; }, stop: async () => {}, close: async () => { release(); } } });
  const first = f.service.start({ kind: "alt-text", ownerId: "felix", imageKey: "1" }); await started;
  const second = f.service.start({ kind: "alt-text", ownerId: "niko", imageKey: "2" });
  f.service.start({ kind: "alt-text", ownerId: "felix", imageKey: "3" });
  assert.throws(() => f.service.start({ kind: "alt-text", ownerId: "felix", imageKey: "4" }), /voll/);
  assert.throws(() => f.service.get(first.jobId, "niko"));
  assert.equal((await f.service.cancel(second.jobId, "niko")).status, "cancelled");
  release(); await waitJob(f.service, first);
  assert.equal(maximum, 1);
});

test("Antwortwiederholung verwendet dieselbe Job-ID und unbekannte freie Modell-/Dateipfade werden nicht angenommen", async (t) => {
  const f = fixture(t), input = { kind: "alt-text", ownerId: "felix", requestId: "same-request", imageKey: "image-1" };
  const first = f.service.start(input), again = f.service.start(input);
  assert.equal(again.jobId, first.jobId);
  assert.equal(first.requestId, "same-request");
  assert.equal(f.service.status("felix").jobs[0].requestId, "same-request");
  assert.throws(() => f.service.start({ ...input, imageKey: "other" }));
  assert.throws(() => f.service.start({ kind: "alt-text", ownerId: "felix", modelPath: "D:\\private.gguf" }));
  await waitJob(f.service, first);
  assert.equal(f.calls.length, 1);
});

test("Größen-/Bildhashgrenzen greifen vor Modellaufruf und Quelle/Entwurf passen zusammen ins begrenzte Kontextfenster", () => {
  const data = inputs();
  assert.throws(() => bindImageInput({ ...data.image, sha256: "a".repeat(64) }));
  const bomb = Buffer.from(pixel); bomb.writeUInt32BE(30000, 16);
  assert.throws(() => bindImageInput({ ...data.image, bytes: bomb, sha256: sha256(bomb) }));
  data.text.sources[0].text = "a".repeat(5000); data.text.draft = "b".repeat(5000);
  assert.throws(() => bindTextInput(data.text, "review-text"), /zusammen zu groß/);
});

test("falsche geladene Bild-/Abschnittskennung wird nicht als Vorschlag für das angeforderte Element ausgegeben", async (t) => {
  const f = fixture(t, { loadImage: async () => inputs().image });
  const result = await waitJob(f.service, f.service.start({ kind: "alt-text", ownerId: "felix", imageKey: "other-image" }));
  assert.equal(result.status, "failed"); assert.equal(result.result, null);
  assert.equal(f.calls.length, 0);
});

test("Vorprüfung kann den aktuellen bearbeiteten Entwurf prüfen, ohne den gespeicherten Ausgangstext zu ändern", async (t) => {
  const draft = "Neuer unbelegter Satz im aktuellen Editor.";
  const f = fixture(t, { worker: { complete: async () => ({ findings: [{ kind: "unsupported", draftQuote: "Neuer unbelegter Satz", explanation: "Im bereitgestellten Material nicht belegt.", sourceIds: [], evidenceQuotes: [] }] }), stop: async () => {}, close: async () => {} } });
  const original = f.data.text.draft;
  const result = await waitJob(f.service, f.service.start({ kind: "review-text", ownerId: "felix", documentId: "doc-1", sectionId: "appearance", draft }));
  assert.equal(result.status, "completed");
  assert.equal(result.result.binding.draftSha256, sha256(Buffer.from(draft)));
  assert.equal(f.data.text.draft, original);
});

test("flache Root-Bildlader-Rückgabe und observationHash bleiben bis zum Vorschlag exakt gebunden", async (t) => {
  const original = inputs().image;
  const f = fixture(t, { loadImage: async () => ({ bytes: original.bytes, mimeType: original.mimeType, sha256: original.sha256,
    sourceSha256: "b".repeat(64), revision: "observed-1", imageId: "image-1", pageUrl: original.binding.pageUrl, context: original.context }) });
  const result = await waitJob(f.service, f.service.suggestAltText({ ownerId: "felix", imageKey: "image-1", observationHash: "observed-1" }));
  assert.equal(result.status, "completed");
  assert.equal(result.result.binding.revision, "observed-1");
  assert.equal(result.result.binding.sourceSha256, "b".repeat(64));
  const stale = await waitJob(f.service, f.service.suggestAltText({ ownerId: "felix", imageKey: "image-1", observationHash: "observed-old" }));
  assert.equal(stale.status, "failed");
});
