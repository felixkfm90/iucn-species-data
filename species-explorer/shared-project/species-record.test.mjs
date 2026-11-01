import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fixture, species } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient, createMemoryCredentialStore } from "./client.mjs";
import { validateCatalogSpecies } from "./catalog.mjs";
import { validateEditableValues, sanitizeAssetName } from "../species-model.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, validateSharedSpecies, guardSpeciesRecordTransition,
  normalizeSpeciesManualValues, applySpeciesManualEdit, projectSpeciesRecordToCatalog } from "./species-record.mjs";

function working(id = "fixture-owl") {
  return { type: SPECIES_RECORD_TYPE, schemaVersion: 1, id,
    input: { genus: "Strix", species: "fixture", german: "Testkauz", english: "Fixture owl", size: "30 cm", weight: "400 g", life_expectancy: "12 Jahre",
      additionalUserField: { unknown: ["Preserve", 7, null], explicitlyFalse: false } },
    generated: { URLSlug: id, "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Testkauz", "Englischer Name": "Fixture owl", "Größe": "30 cm",
      Kingdom: "Animalia", Phylum: "Chordata", Subphylum: "Vertebrata", Class: "Aves", Order: "Strigiformes", Family: "Strigidae", Genus: "Strix", Species: "fixture",
      Status: "Least Concern", "Assessment ID": 12345, unknownGeneratedField: { keep: true }, privateGeneratedNote: "Private generated sentinel" },
    taxonomyOverride: { reason: "Protected manual taxonomy", automaticFields: { family: "Previous family" }, unknown: [1, 2] },
    assessmentBinding: { id: 12345, unknown: "preserve" },
    assets: { assetName: "Testkauz", files: {
      "portrait.webp": { id: `${id}:portrait`, url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/portrait.webp", bytes: 321, sha256: "a".repeat(64), mimeType: "image/webp" },
      "map.jpg": { id: `${id}:map`, bytes: 654, sha256: "b".repeat(64), mimeType: "image/jpeg" },
      "sound.mp3": { id: `${id}:sound`, url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/sound.mp3", bytes: 987, sha256: "c".repeat(64), mimeType: "audio/mpeg" },
      "spectrogram.webp": { id: `${id}:spectrum`, bytes: 123, sha256: "d".repeat(64), mimeType: "image/webp" },
    }, overrides: { map: { manual: true, protected: true, unknownProtection: "retain" } },
    credits: { recordist: "Synthetic Recorder", license: "CC BY-NC", source: "Synthetic source", url: "https://example.org/recording", privateNote: "Private credit sentinel" },
    portraitMetadata: { type: "Illustration", source: "Synthetic illustration", generation_method: "Synthetic generation", prompt: "Private prompt sentinel", unknown: { retain: true } } },
    editorial: { websiteUrl: "https://www.fnwildlifetravel.de/wildlife/voegel/fixture-owl",
      sections: [{ id: "general", title: "Allgemein", text: "Redaktioneller Allgemeintext bleibt erhalten", intentionallyEmpty: false },
        { id: "habitat", title: "Lebensraum", text: "Synthetic habitat", intentionallyEmpty: false }],
      gallery: [{ id: `${id}:photo-2`, url: "https://images.squarespace-cdn.com/content/second.jpg", alt: "Zweites Bild", caption: "Zweite Beschriftung", order: 1 },
        { id: `${id}:photo-1`, url: "https://images.squarespace-cdn.com/content/first.jpg", alt: "Erstes Bild", caption: "Erste Beschriftung", order: 0 }],
      generalSectionId: "general", embeddedGeneralText: null } };
}
function values(record, changes = {}) {
  return { germanName: record.input.german, englishName: record.input.english, scientificName: `${record.input.genus} ${record.input.species}`,
    size: String(record.input.size), weight: String(record.input.weight), lifeExpectancy: String(record.input.life_expectancy), ...changes };
}
const denied = (code) => (error) => error.code === code;
async function scoped(fn) {
  const f = fixture(); let http; const clients = [];
  try {
    const initialized = await f.initialized();
    const context = { ...initialized, f,
      async network() { http = createSharedProjectHttp({ store: initialized.store }); return (await http.listen()).url; },
      client(filename, options = {}) {
        const client = createSharedProjectClient({ filename: path.join(f.root, filename), localStorageConfirmed: true, allowLoopbackHttp: true, ...options });
        clients.push(client); return client;
      } };
    await fn(context);
  } finally { for (const client of clients) await client.close(); await http?.close(); f.cleanup(); }
}

test("typed working species preserves every original and unknown field without changing strict legacy catalog validation", () => {
  const source = working(), before = structuredClone(source), checked = validateSpeciesRecord(source, source.id);
  assert.deepEqual(checked, before); assert.deepEqual(source, before);
  assert.notEqual(checked.input, source.input);
  assert.deepEqual(validateSharedSpecies(species(), "fixture-owl"), validateCatalogSpecies(species(), "fixture-owl"));
  assert.throws(() => validateCatalogSpecies(source), denied("invalid_catalog"));
  for (const mutate of [
    (item) => { item.unrecognizedRoot = true; },
    (item) => { item.schemaVersion = 2; },
    (item) => { item.id = "different-id"; },
    (item) => { item.assets.assetName = "../unsafe"; },
    (item) => { item.assets.files["../unsafe"] = item.assets.files["portrait.webp"]; },
    (item) => { item.input.additionalUserField = "x".repeat(256 * 1024); },
  ]) {
    const invalid = structuredClone(source); mutate(invalid);
    assert.throws(() => validateSpeciesRecord(invalid, source.id));
  }
});

test("pure manual normalization matches the normal editor and edits only its seven keys with stable object and asset identity", () => {
  const original = working(), input = values(original, { germanName: " Neuer Testkauz ", englishName: " New fixture owl ", scientificName: " sTRIX   FIXTURE ", size: " 40 cm " });
  const normal = validateEditableValues(input), pure = normalizeSpeciesManualValues(input);
  assert.deepEqual(normal.errors, []);
  for (const key of Object.keys(pure)) assert.equal(pure[key], normal.values[key]);
  const next = applySpeciesManualEdit(original, input);
  assert.equal(next.input.german, "Neuer Testkauz"); assert.equal(next.input.size, "40 cm");
  assert.equal(next.id, original.id); assert.deepEqual(next.assets, original.assets);
  assert.deepEqual(next.input.additionalUserField, original.input.additionalUserField);
  assert.deepEqual(next.generated, original.generated); assert.deepEqual(next.editorial, original.editorial);
  assert.equal(original.input.size, "30 cm");
  for (const change of [{ englishName: "" }, { size: "\u0000" }, { scientificName: "Strix fixture extra" }, { scientificName: "Strix 123" },
    { scientificName: "Strix\tfixture" }, { scientificName: "Strix\nfixture" }, { scientificName: "Strix\u007ffixture" }]) {
    assert.throws(() => applySpeciesManualEdit(original, values(original, change)));
  }
});

test("bound asset directory components preserve real sanitized spaces, Unicode and punctuation without accepting paths", () => {
  for (const german of ["Mittelamerikanischer Totenkopfaffe", "Grüner Leguan", "D'Hubert (Testart)", "Unicode 鸟vogel"]) {
    const original = working(); original.assets.assetName = sanitizeAssetName(german);
    assert.equal(validateSpeciesRecord(original).assets.assetName, original.assets.assetName);
    const next = applySpeciesManualEdit(original, values(original, { size: "39 cm" }));
    assert.equal(next.assets.assetName, original.assets.assetName);
  }
  for (const component of ["", ".", "..", "../outside", "a/b", "a\\b", "C:\\outside", "//network/share", "bad\u0000component", " trailing ", "trailing."]) {
    const original = working(); original.assets.assetName = component;
    assert.throws(() => validateSpeciesRecord(original), denied("invalid_species_record"));
  }
  const invalid = working(); invalid.assets.files["portrait.webp"].mimeType = "application/json";
  assert.throws(() => validateSpeciesRecord(invalid), denied("invalid_species_record"));
});

test("transition guard protects sources, all assets, opaque input fields, type and field presence", () => {
  const original = working();
  assert.equal(guardSpeciesRecordTransition({ objectId: original.id, before: original, next: applySpeciesManualEdit(original, values(original, { weight: "450 g" })) }), true);
  for (const mutate of [
    (item) => { item.input.additionalUserField.unknown[1] = 8; },
    (item) => { delete item.input.english; },
    (item) => { item.generated.Status = "Changed source"; },
    (item) => { item.taxonomyOverride.reason = "Changed protection"; },
    (item) => { item.assessmentBinding.id = 54321; },
    (item) => { item.assets.assetName = "DifferentDirectory"; },
    (item) => { item.assets.overrides.map.protected = false; },
    (item) => { item.assets.files["portrait.webp"].sha256 = "e".repeat(64); },
    (item) => { item.assets.portraitMetadata.prompt = "Changed private metadata"; },
    (item) => { item.editorial.sections[0].text = "Unrelated editorial change"; },
  ]) {
    const next = structuredClone(original); mutate(next);
    assert.throws(() => guardSpeciesRecordTransition({ objectId: original.id, before: original, next }), denied("species_record_protected"));
  }
  assert.throws(() => guardSpeciesRecordTransition({ objectId: original.id, before: species(), next: original }), denied("species_record_adoption_required"));
  assert.throws(() => guardSpeciesRecordTransition({ objectId: original.id, before: original, next: species() }), denied("species_record_adoption_required"));
});

test("mobile projection replaces only the exact source-bound generated general block and excludes private originals", () => {
  const original = working();
  original.editorial.embeddedGeneralText = "Wissenschaftlicher Name: Strix fixture\nDeutscher Name: Testkauz\nEnglischer Name: Fixture owl\nGröße: 30 cm\nStatus: Least Concern\nAssessment ID: 12345";
  original.editorial.sections[0].text += `\n\n${original.editorial.embeddedGeneralText}`;
  const next = applySpeciesManualEdit(original, values(original, { size: "40 cm" })), catalog = projectSpeciesRecordToCatalog(next);
  assert.equal(catalog.id, original.id); assert.equal(catalog.schemaVersion, undefined);
  assert.match(catalog.sections[0].text, /^Redaktioneller Allgemeintext bleibt erhalten\n\n/);
  assert.match(catalog.sections[0].text, /Größe: 40 cm/); assert.doesNotMatch(catalog.sections[0].text, /Größe: 30 cm/);
  assert.equal((catalog.sections[0].text.match(/Wissenschaftlicher Name:/g) || []).length, 1);
  assert.ok(catalog.taxonomy.some((rank) => rank.rank === "subphylum" && rank.name === "Vertebrata"));
  assert.deepEqual(catalog.media.gallery.map((image) => image.alt), ["Erstes Bild", "Zweites Bild"]);
  assert.match(catalog.media.sounds[0].attribution, /CC BY-NC/); assert.equal(catalog.media.map, undefined);
  const serialized = JSON.stringify(catalog);
  for (const secret of ["Private prompt sentinel", "Private credit sentinel", "Private generated sentinel", "unknownProtection", "additionalUserField", "spectrogram"]) assert.ok(!serialized.includes(secret));
  const invalid = structuredClone(original); invalid.editorial.embeddedGeneralText += "\nUnbound text";
  assert.throws(() => validateSpeciesRecord(invalid));
  const unbound = structuredClone(original); unbound.editorial.embeddedGeneralText = null;
  assert.throws(() => validateSpeciesRecord(unbound), denied("general_binding_required"));
  assert.equal(original.input.size, "30 cm");
});

test("catalog projection adds one structured general section without consuming editorial text or fabricating asset URLs", () => {
  const original = working(); original.editorial.generalSectionId = null;
  const catalog = projectSpeciesRecordToCatalog(original);
  assert.equal(catalog.sections.length, original.editorial.sections.length + 1);
  assert.deepEqual(catalog.sections.slice(1), original.editorial.sections);
  assert.deepEqual(catalog.media.portrait.sha256, "a".repeat(64));
  assert.equal(catalog.media.map, undefined);
  assert.deepEqual(projectSpeciesRecordToCatalog(species()), validateCatalogSpecies(species()));
});

test("mobile map attribution uses the actually bound own source and never invents IUCN or publishes private maintenance reasons", () => {
  const original = working(); original.assets.files["map.jpg"].url = "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/map.jpg";
  original.assets.overrides.map.source = "Eigene Kartierung von FN Wildlife & Travel";
  original.assets.overrides.map.reason = "Private map maintenance sentinel";
  let catalog = projectSpeciesRecordToCatalog(original);
  assert.equal(catalog.media.map.attribution, "Quelle: Eigene Kartierung von FN Wildlife & Travel");
  assert.doesNotMatch(JSON.stringify(catalog), /IUCN|Private map maintenance sentinel/);
  delete original.assets.overrides.map.source;
  catalog = projectSpeciesRecordToCatalog(original);
  assert.equal(catalog.media.map.attribution, undefined);
  original.assets.overrides.map.provenance = { source: "Belegte andere Kartenquelle", internalNote: "Private provenance sentinel" };
  catalog = projectSpeciesRecordToCatalog(original);
  assert.equal(catalog.media.map.attribution, "Quelle: Belegte andere Kartenquelle");
  assert.doesNotMatch(JSON.stringify(catalog), /Private provenance sentinel/);
});

test("actual store preserves typed and legacy species; approved mobile content follows only the approved working version", () => scoped(async ({ store, a, b }) => {
  const source = working(), created = store.createObject(a.token, { kind: "species", id: source.id, data: source });
  const legacy = species("legacy-owl"); store.createObject(b.token, { kind: "species", id: legacy.id, data: legacy });
  assert.equal(store.catalog(a.token).species.length, 0);
  store.approveObject(a.token, "species", source.id, { expectedRevision: created.revision });
  store.approveObject(b.token, "species", legacy.id, { expectedRevision: store.getObject(b.token, "species", legacy.id).revision });
  const next = applySpeciesManualEdit(source, values(source, { size: "45 cm" }));
  const applied = store.submitChange(b.token, { changeId: "typed-manual-change", kind: "species", id: source.id, baseRevision: created.revision, data: next });
  assert.equal(applied.status, "applied"); assert.deepEqual(applied.object.data, next);
  assert.match(store.catalog(a.token).species.find((item) => item.id === source.id).sections[0].text, /Größe: 30 cm/);
  store.approveObject(a.token, "species", source.id, { expectedRevision: applied.object.revision });
  assert.match(store.catalog(a.token).species.find((item) => item.id === source.id).sections[0].text, /Größe: 45 cm/);
  assert.deepEqual(store.getObject(a.token, "species", legacy.id).data, validateCatalogSpecies(legacy));
}));

test("actual store guards reject protected writes before conflict creation and inside merged resolution", () => scoped(async ({ store, a, b }) => {
  const original = working(), created = store.createObject(a.token, { kind: "species", id: original.id, data: original });
  const current = applySpeciesManualEdit(original, values(original, { size: "40 cm" }));
  const applied = store.submitChange(a.token, { changeId: "typed-foreign-change", kind: "species", id: original.id, baseRevision: created.revision, data: current });
  const invalid = structuredClone(original); invalid.assets.overrides.map.manual = false;
  assert.throws(() => store.submitChange(b.token, { changeId: "typed-protected-write", kind: "species", id: original.id, baseRevision: created.revision, data: invalid }), denied("species_record_protected"));
  assert.equal(store.listConflicts(a.token).length, 0);
  const proposed = applySpeciesManualEdit(original, values(original, { weight: "460 g" }));
  const conflict = store.submitChange(b.token, { changeId: "typed-conflict-change", kind: "species", id: original.id, baseRevision: created.revision, data: proposed });
  assert.equal(conflict.status, "conflict");
  assert.throws(() => store.resolveConflict(a.token, conflict.conflictId, { strategy: "merged", expectedRevision: applied.object.revision, data: invalid }), denied("species_record_protected"));
  assert.equal(store.getConflict(a.token, conflict.conflictId).resolvedAt, null);
  const merged = applySpeciesManualEdit(current, values(current, { weight: "460 g" }));
  const resolved = store.resolveConflict(a.token, conflict.conflictId, { strategy: "merged", expectedRevision: applied.object.revision, data: merged });
  assert.deepEqual(resolved.object.data, merged);
  assert.throws(() => store.submitChange(a.token, { changeId: "typed-illegal-downgrade", kind: "species", id: original.id, baseRevision: resolved.object.revision, data: species() }), denied("species_record_adoption_required"));
}));

test("actual four-role store enforces typed editing and approval independently of protected-field checks", () => scoped(async ({ store, a, f }) => {
  const source = working(), created = store.createObject(a.token, { kind: "species", id: source.id, data: source });
  store.approveObject(a.token, "species", source.id, { expectedRevision: created.revision });
  for (const role of ["reader", "contributor", "publisher"]) {
    const user = await store.createUser(a.token, { username: `fixture-${role}`, displayName: role, role, password: f.password });
    const login = await store.login({ username: user.username, password: f.password });
    const current = store.getObject(a.token, "species", source.id), next = applySpeciesManualEdit(current.data, values(current.data, { size: `${role.length + 50} cm` }));
    const change = { changeId: `typed-role-${role}`, kind: "species", id: source.id, baseRevision: current.revision, data: next };
    if (role === "reader") assert.throws(() => store.submitChange(login.token, change), denied("forbidden"));
    else {
      const changed = store.submitChange(login.token, change);
      if (role === "contributor") assert.throws(() => store.approveObject(login.token, "species", source.id, { expectedRevision: changed.object.revision }), denied("forbidden"));
      else assert.equal(store.approveObject(login.token, "species", source.id, { expectedRevision: changed.object.revision }).approval, "approved");
    }
  }
}));

test("two actual HTTP clients edit different typed species independently and preserve one durable offline conflict after reopening", () => scoped(async ({ store, a, b, f, network, client }) => {
  const first = working(), second = working("fixture-second");
  for (const data of [first, second]) store.createObject(a.token, { kind: "species", id: data.id, data });
  const baseUrl = await network(), credentials = createMemoryCredentialStore(); let offline = false;
  const transport = async (...args) => { if (offline) throw new Error("Synthetic offline"); return fetch(...args); };
  const left = client("left.sqlite"), right = client("right.sqlite", { credentialStore: credentials, fetchImpl: transport });
  await left.connect({ baseUrl, username: a.user.username, password: f.password });
  await right.connect({ baseUrl, username: b.user.username, password: f.password });
  await left.editExistingObject("species", first.id, applySpeciesManualEdit(first, values(first, { size: "41 cm" })));
  await right.editExistingObject("species", second.id, applySpeciesManualEdit(second, values(second, { weight: "470 g" })));
  await Promise.all([left.sync(), right.sync()]);
  assert.equal(store.getObject(a.token, "species", first.id).data.input.size, "41 cm");
  assert.equal(store.getObject(a.token, "species", second.id).data.input.weight, "470 g");
  await right.refresh(); offline = true;
  const baseline = await right.getObject("species", first.id);
  await right.editExistingObject("species", first.id, applySpeciesManualEdit(baseline.data, values(baseline.data, { weight: "480 g" })));
  await assert.rejects(right.sync(), denied("offline"));
  await right.close();
  const current = await left.getObject("species", first.id);
  await left.editExistingObject("species", first.id, applySpeciesManualEdit(current.data, values(current.data, { size: "42 cm" })));
  await left.sync();
  offline = false;
  const reopened = client("right.sqlite", { credentialStore: credentials, fetchImpl: transport });
  await reopened.sync();
  const conflicts = await reopened.listConflicts(); assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].base.input.size, "41 cm"); assert.equal(conflicts[0].current.input.size, "42 cm"); assert.equal(conflicts[0].proposed.input.weight, "480 g");
  assert.deepEqual(conflicts[0].proposed.assets, first.assets);
  const latest = await reopened.getObject("species", first.id, { serverOnly: true });
  const merged = applySpeciesManualEdit(latest.data, values(latest.data, { weight: "480 g" }));
  const invalid = structuredClone(merged); invalid.taxonomyOverride.reason = "Unsafe client merge";
  await assert.rejects(reopened.resolveConflict(conflicts[0].id, { strategy: "merged", expectedRevision: latest.revision, data: invalid }), denied("species_record_protected"));
  await reopened.resolveConflict(conflicts[0].id, { strategy: "merged", expectedRevision: latest.revision, data: merged });
  assert.deepEqual(store.getObject(a.token, "species", first.id).data, merged);
  const illegal = structuredClone(merged); illegal.generated.privateGeneratedNote = "Unsafe local edit";
  await assert.rejects(reopened.editExistingObject("species", first.id, illegal), denied("species_record_protected"));
}));
