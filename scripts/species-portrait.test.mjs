import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

import {
  PORTRAIT_OPTION_DEFAULTS,
  PORTRAIT_STANDARD,
  buildPortraitPrompt,
  normalizePortraitOptions,
  validatePortraitOptions,
} from "./portrait-generator.mjs";

const source = await readFile(new URL("../species-portrait.js", import.meta.url), "utf8");

function createClassList() {
  const values = new Set();
  return {
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
    contains: (value) => values.has(value),
  };
}

async function renderPortrait({ failImage = false } = {}) {
  let errorHandler = null;
  let portrait = null;
  const sound = {
    id: "species-sound",
    parentElement: { id: "original-parent" },
  };
  const image = {
    addEventListener: (type, handler) => {
      if (type === "error") errorHandler = handler;
    },
  };
  const output = {
    classList: createClassList(),
    appendChild: (node) => {
      if (node === sound) {
        sound.parentElement = output;
      } else {
        portrait = node;
      }
    },
  };
  const document = {
    getElementById: (id) => {
      if (id === "species-output") return output;
      if (id === "species-portrait") return portrait;
      if (id === "species-sound") return sound;
      return null;
    },
    createElement: () => ({
      id: "",
      hidden: false,
      innerHTML: "",
      querySelector: () => image,
    }),
  };
  const context = vm.createContext({
    document,
    window: {
      SpeciesCore: {
        getSpeciesData: async () => ({ "Deutscher Name": "Amsel & Co." }),
        getSpeciesAssetPaths: () => ({ portrait: "/species-assets/Amsel/portrait.webp" }),
      },
    },
  });

  new vm.Script(source, { filename: "species-portrait.js" }).runInContext(context);
  await new Promise((resolve) => setImmediate(resolve));
  if (failImage) errorHandler?.();
  return { output, portrait, sound };
}

test("Artporträt ergänzt den vorhandenen Squarespace-Modulbereich", async () => {
  const { output, portrait, sound } = await renderPortrait();
  assert.equal(portrait.id, "species-portrait");
  assert.equal(sound.parentElement, output);
  assert.equal(output.classList.contains("species-output--has-sound"), true);
  assert.equal(output.classList.contains("species-output--has-portrait"), true);
  assert.match(portrait.innerHTML, /Artporträt – Amsel &amp; Co\./);
  assert.match(portrait.innerHTML, /\/species-assets\/Amsel\/portrait\.webp/);
  assert.doesNotMatch(portrait.innerHTML, /figcaption/);
});

test("Fehlendes Artporträt aktiviert den stabilen Zweispalten-Fallback", async () => {
  const { output, portrait } = await renderPortrait({ failImage: true });
  assert.equal(portrait.hidden, true);
  assert.equal(portrait.innerHTML, "");
  assert.equal(output.classList.contains("species-output--has-sound"), true);
  assert.equal(output.classList.contains("species-output--has-portrait"), false);
});

test("Portraitvorgaben verwenden dezent angedeutetes Habitat als sicheren Standard", () => {
  const options = normalizePortraitOptions({
    habitat: "unbekannt",
    bodyOrientation: "right-profile",
    classOptions: {
      birdPlumage: "breeding",
      nichtErlaubt: "beliebig",
    },
  });

  assert.equal(options.habitat, PORTRAIT_OPTION_DEFAULTS.habitat);
  assert.equal(options.bodyOrientation, "right-profile");
  assert.deepEqual(options.classOptions, { birdPlumage: "breeding" });
});

test("Detailaufnahmen verlangen ein konkretes Detailmotiv", () => {
  const invalid = validatePortraitOptions({ crop: "detail" });
  assert.equal(invalid.errors.length, 1);
  assert.match(invalid.errors[0], /Detailmotiv/);

  const valid = validatePortraitOptions({ crop: "detail", detailSubject: "Schnabel" });
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.options.detailSubject, "Schnabel");
});

test("Erweiterte Vorgaben werden direkt in einen klassenabhängigen Einzelprompt übernommen", () => {
  const prompt = buildPortraitPrompt({
    germanName: "Amsel",
    scientificName: "Turdus merula",
    taxonomyClass: "Aves",
    portraitOptions: {
      motif: "adult-with-young",
      bodyOrientation: "right-profile",
      headDirection: "camera",
      perspective: "ground-level",
      behavior: "feeding",
      food: "typical-food",
      habitat: "clear",
      timeOfDay: "dawn",
      season: "spring",
      classOptions: {
        birdPlumage: "breeding",
        wingPosition: "folded",
        birdSubstrate: "ground",
      },
    },
    additionalInstructions: "Der vollständige Schwanz bleibt sichtbar.",
  });

  assert.equal(PORTRAIT_STANDARD.promptVersion, "2.0.0");
  assert.match(prompt, /exactly one adult together with exactly one juvenile/);
  assert.match(prompt, /right-facing profile/);
  assert.match(prompt, /gaze toward the viewer/);
  assert.match(prompt, /ground-level perspective/);
  assert.match(prompt, /natural feeding behavior/);
  assert.match(prompt, /natural habitat clearly and recognizably/);
  assert.match(prompt, /natural dawn lighting/);
  assert.match(prompt, /adult breeding plumage/);
  assert.match(prompt, /both wings naturally folded/);
  assert.match(prompt, /species-appropriate ground/);
  assert.match(prompt, /Der vollständige Schwanz bleibt sichtbar/);
});
