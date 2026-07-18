import assert from "node:assert/strict";
import test from "node:test";
import { createIucnDataAdapter } from "./iucn-data-adapter.mjs";
import {
  createIucnMapAdapter,
  extractCachedIucnMapUrls,
  isJpegBuffer,
  taxonIdFromTaxon,
} from "./iucn-map-adapter.mjs";
import { createXenoCantoAdapter } from "./xeno-canto-adapter.mjs";
import { createWikimediaCommonsAudioAdapter } from "./wikimedia-commons-audio-adapter.mjs";
import { createINaturalistAudioAdapter } from "./inaturalist-audio-adapter.mjs";
import {
  inatLicenseUrl,
  isNcLicense,
  isOpenCommercialLicense,
  normalizeLicenseUrl,
} from "./sound-source-license.mjs";

const noWait = async () => {};

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: { get: () => "application/json" },
    arrayBuffer: async () => Buffer.from(JSON.stringify(data)),
  };
}

test("Sound-Lizenzregeln unterscheiden frei und NC", () => {
  assert.equal(normalizeLicenseUrl("//creativecommons.org/licenses/by/4.0/"), "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(isNcLicense("https://creativecommons.org/licenses/by-nc-sa/4.0/"), true);
  assert.equal(isOpenCommercialLicense("https://creativecommons.org/licenses/by/4.0/"), true);
  assert.equal(isOpenCommercialLicense("CC-BY-NC"), false);
  assert.equal(inatLicenseUrl("cc-by-sa"), "https://creativecommons.org/licenses/by-sa/4.0/");
});

test("IUCN-Datenadapter normalisiert Assessment und Taxonomie", async () => {
  const requests = [];
  const adapter = createIucnDataAdapter({
    token: "test-token",
    sleep: noWait,
    now: () => new Date("2026-07-18T00:00:00Z"),
    logError: (message) => assert.fail(message),
    emptyEntry: () => assert.fail("Kein Leereintrag erwartet"),
    formatTaxonomyName: (value) => String(value).toLowerCase().replace(/^./, (letter) => letter.toUpperCase()),
    fetch: async (url) => {
      requests.push(url);
      if (url.includes("/taxa/scientific_name")) {
        return jsonResponse({
          taxon: {
            scientific_name: "Turdus merula",
            kingdom_name: "ANIMALIA",
            phylum_name: "CHORDATA",
            class_name: "AVES",
            order_name: "PASSERIFORMES",
            family_name: "TURDIDAE",
            genus_name: "Turdus",
            species_name: "merula",
          },
          assessments: [{
            assessment_id: 123,
            red_list_category_code: "LC",
            year_published: 2024,
            scopes: [{ description: { en: "Global" } }],
          }],
        });
      }
      return jsonResponse({
        population_trend: { description: { en: "Decreasing" } },
        red_list_category: { code: "LC" },
        supplementary_info: { population_size: "1000-2000", generational_length: 4.5 },
      });
    },
  });
  const result = await adapter.fetchSpeciesData("Turdus", "merula", "Amsel", "ca. 24 cm", "ca. 100 g", "ca. 3 Jahre");
  assert.equal(result["Assessment ID"], 123);
  assert.equal(result.Kategorie, "Nicht gefährdet");
  assert.equal(result.Trend, "Abnehmend");
  assert.equal(result.Populationgröße, "1.000-2.000");
  assert.equal(result.Generationsdauer, "4,5 Jahre");
  assert.equal(result.Kingdom, "Animalia");
  assert.equal(result["Daten abgerufen"], "2026-07-18");
  assert.equal(requests.length, 2);
});

test("IUCN-Kartenadapter erkennt JPEGs, Taxon-IDs und signierte Cache-Links", async () => {
  const jpeg = Buffer.alloc(10_000, 0);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[jpeg.length - 2] = 0xff;
  jpeg[jpeg.length - 1] = 0xd9;
  assert.equal(isJpegBuffer(jpeg), true);
  assert.equal(taxonIdFromTaxon({ sis_taxon_id: 15951 }), "15951");
  const signed = "https://f002.backblazeb2.com/file/cached-individual-maps/T15951A280792135.jpg?Authorization=test";
  assert.deepEqual(extractCachedIucnMapUrls(`<a href=\"${signed.replaceAll("&", "&amp;")}\">Karte</a>`, "T15951A280792135.jpg"), [signed]);

  const adapter = createIucnMapAdapter({
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => jpeg,
    }),
    token: "token",
    iucnGET: async () => null,
    sleep: noWait,
    sanitizeAssetName: (value) => value,
    speciesAssetDir: () => ".",
    ensureDir: () => {},
    isManualAsset: () => false,
    platform: "linux",
  });
  assert.equal((await adapter.fetchValidJpeg("https://example.org/map.jpg")).length, jpeg.length);
});

test("Xeno-Canto-Adapter überspringt NC bei freier Suchstufe", async () => {
  const adapter = createXenoCantoAdapter({
    token: "token",
    sleep: noWait,
    fetch: async () => jsonResponse({
      numPages: 1,
      recordings: [
        { id: "nc", lic: "https://creativecommons.org/licenses/by-nc/4.0/" },
        { id: "free", lic: "https://creativecommons.org/licenses/by/4.0/" },
      ],
    }),
  });
  const result = await adapter.findRecordingByStage("Turdus", "merula", { openOnly: true, q: "A", len2535: true });
  assert.equal(result.rec.id, "free");
  assert.equal(result.page, 1);
  assert.match(result.query, /gen:Turdus/);
});

test("Commons-Adapter liefert exakten frei lizenzierten MP3-Kandidaten", async () => {
  const adapter = createWikimediaCommonsAudioAdapter({
    sleep: noWait,
    fetch: async (url, options = {}) => {
      if (options.method === "HEAD") return { ok: true };
      return jsonResponse({
        query: {
          pages: {
            1: {
              title: "File:Turdus merula song.ogg",
              imageinfo: [{
                url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Turdus_merula_song.ogg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Turdus_merula_song.ogg",
                mime: "audio/ogg",
                extmetadata: {
                  LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
                  Artist: { value: "Recorder" },
                  ImageDescription: { value: "Turdus merula song" },
                },
              }],
            },
          },
        },
      });
    },
  });
  const result = await adapter.findRecording("Turdus", "merula", "Amsel");
  assert.match(result.mp3Url, /transcoded/);
  assert.equal(result.artist, "Recorder");
});

test("iNaturalist-Adapter liefert nur exakten freien MP3-Sound", async () => {
  const adapter = createINaturalistAudioAdapter({
    sleep: noWait,
    fetch: async (_url, options = {}) => {
      if (options.method === "HEAD") return { ok: true };
      return jsonResponse({
        results: [{
          id: 42,
          uri: "https://www.inaturalist.org/observations/42",
          taxon: { name: "Turdus merula" },
          sounds: [{ id: 7, file_url: "https://static.inaturalist.org/sounds/7.mp3", file_content_type: "audio/mpeg", license_code: "cc-by" }],
        }],
      });
    },
  });
  const result = await adapter.findRecording("Turdus", "merula", "Amsel");
  assert.equal(result.sound.id, 7);
  assert.equal(result.observation.id, 42);
});
