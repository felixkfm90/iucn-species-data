import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

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
  const image = {
    addEventListener: (type, handler) => {
      if (type === "error") errorHandler = handler;
    },
  };
  const output = {
    classList: createClassList(),
    appendChild: (node) => {
      portrait = node;
    },
  };
  const document = {
    getElementById: (id) => {
      if (id === "species-output") return output;
      if (id === "species-portrait") return portrait;
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
  return { output, portrait };
}

test("Artporträt ergänzt den vorhandenen Squarespace-Modulbereich", async () => {
  const { output, portrait } = await renderPortrait();
  assert.equal(portrait.id, "species-portrait");
  assert.equal(output.classList.contains("species-output--has-portrait"), true);
  assert.match(portrait.innerHTML, /Artporträt – Amsel &amp; Co\./);
  assert.match(portrait.innerHTML, /\/species-assets\/Amsel\/portrait\.webp/);
});

test("Fehlendes Artporträt aktiviert den stabilen Zweispalten-Fallback", async () => {
  const { output, portrait } = await renderPortrait({ failImage: true });
  assert.equal(portrait.hidden, true);
  assert.equal(portrait.innerHTML, "");
  assert.equal(output.classList.contains("species-output--has-portrait"), false);
});
