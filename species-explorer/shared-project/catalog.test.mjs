import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, validateCatalogSpecies } from "./catalog.mjs";
import { species } from "./test-fixtures.mjs";

test("catalog schema 1 preserves IDs/text/intentional empty sections and supports species without public page", () => {
  const data = species();
  data.sections.push({ id: "empty", title: "Bewusst leer", text: "", intentionallyEmpty: true });
  data.media.portrait = { id: "fixture-owl:portrait:1", url: "https://media.example.org/portrait.webp", bytes: 12, sha256: "a".repeat(64), mimeType: "image/webp" };
  data.media.gallery = [
    { id: "gallery-second", url: "https://media.example.org/second.jpg", alt: "Zweites Bild", caption: "Zweite Beschriftung", order: 2 },
    { id: "gallery-first", url: "https://media.example.org/first.jpg", alt: "Erstes Bild", caption: "Erste Beschriftung", order: 1 }
  ];
  const catalog = buildCatalog({ revision: "17", generatedAt: "2026-10-31T12:00:00.000Z", species: [data] });
  assert.equal(catalog.schemaVersion, 1); assert.equal(catalog.revision, "17");
  assert.equal(catalog.species[0].id, data.id);
  assert.equal(catalog.species[0].sections[1].intentionallyEmpty, true);
  assert.equal(catalog.species[0].media.gallery[0].id, "gallery-first");
  assert.ok(!("websiteUrl" in catalog.species[0]));
});

test("catalog rejects local/credential/media metadata leakage rather than silently forwarding extra fields", () => {
  for (const url of ["file:///C:/original.jpg", "http://media.example.org/image.jpg", "https://localhost/image.jpg",
    "https://192.168.1.1/image.jpg", "https://127.0.0.1/image.jpg", "https://[::1]/image.jpg", "https://nas.local/image.jpg",
    "https://user:password@media.example.org/image.jpg", "https://media.example.org/a?token=secret"]) {
    const data = species(); data.media.portrait = { id: "portrait", url };
    assert.throws(() => validateCatalogSpecies(data), (error) => error.code === "invalid_catalog");
  }
  for (const extra of [{ localPath: "redacted" }, { lightroomCatalog: "redacted" }, { cookie: "redacted" }]) {
    assert.throws(() => validateCatalogSpecies({ ...species(), ...extra }), (error) => error.code === "invalid_catalog");
  }
  const data = species(); data.media.portrait = { id: "portrait", url: "https://media.example.org/image.jpg", sha256: "bad" };
  assert.throws(() => validateCatalogSpecies(data));
  data.media.portrait.sha256 = "a".repeat(64); data.media.portrait.bytes = -1;
  assert.throws(() => validateCatalogSpecies(data));
});

test("catalog rejects duplicate identities and contradictory intentional-empty statements", () => {
  const data = species(); data.sections[0].intentionallyEmpty = true;
  assert.throws(() => validateCatalogSpecies(data));
  const duplicate = species(); duplicate.sections.push({ ...duplicate.sections[0] });
  assert.throws(() => validateCatalogSpecies(duplicate));
  assert.throws(() => buildCatalog({ revision: "1", species: [species(), species()] }));
  assert.throws(() => validateCatalogSpecies(species(), "different-slug"));
  assert.throws(() => buildCatalog({ species: [] }));
  assert.throws(() => buildCatalog({ revision: "1", generatedAt: "not-an-iso-date", species: [] }));
});

test("optional media attribution roundtrips unchanged and enforces its text boundary", () => {
  const data = species();
  const attribution = "Synthetic recording — CC BY-NC 4.0; https://source.example.org/recording; https://creativecommons.org/licenses/by-nc/4.0/";
  data.media.sounds.push({ id: "sound-source", url: "https://media.example.org/recording.mp3", attribution });
  assert.equal(validateCatalogSpecies(data).media.sounds[0].attribution, attribution);
  data.media.sounds[0].attribution = "x".repeat(8000);
  assert.equal(validateCatalogSpecies(data).media.sounds[0].attribution.length, 8000);
  data.media.sounds[0].attribution += "x";
  assert.throws(() => validateCatalogSpecies(data), (error) => error.code === "invalid_catalog");
  assert.ok(!("attribution" in validateCatalogSpecies(species()).media));
});
