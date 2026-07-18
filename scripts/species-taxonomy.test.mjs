import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../species-taxonomy.js", import.meta.url), "utf8");

const baseTaxonomy = Object.freeze({
  Kingdom: "Animalia",
  Phylum: "Chordata",
  Class: "Aves",
  Order: "Passeriformes",
  Family: "Turdidae",
  Genus: "Turdus",
  Species: "merula",
});

async function renderTaxonomy(dataOrError) {
  const container = { innerHTML: "" };
  const context = vm.createContext({
    document: {
      getElementById: (id) => (id === "species-taxonomy" ? container : null),
    },
    SpeciesCore: {
      getSpeciesData: async () => {
        if (dataOrError instanceof Error) throw dataOrError;
        return dataOrError;
      },
    },
  });
  new vm.Script(source, { filename: "species-taxonomy.js" }).runInContext(context);
  await new Promise((resolve) => setImmediate(resolve));
  return container.innerHTML;
}

test("Taxonomie rendert sieben Stufen mit deutschen Anzeigenamen", async () => {
  const markup = await renderTaxonomy(baseTaxonomy);
  assert.equal((markup.match(/data-taxonomy-key=/g) ?? []).length, 7);
  assert.doesNotMatch(markup, /data-taxonomy-key="Subphylum"/);
  assert.match(markup, />Reich:</);
  assert.match(markup, />Tiere</);
  assert.match(markup, />Sperlingsvögel</);
  assert.match(markup, />Drosseln</);
  assert.match(markup, />Echte Drosseln</);
  assert.match(markup, />Merula</);
  assert.match(markup, /Wissenschaftlicher Wert: Animalia/);
  assert.equal((markup.match(/class="taxonomy-stage"/g) ?? []).length, 7);
  assert.doesNotMatch(markup, /taxonomy-rank-cell|taxonomy-value-cell/);
});

test("Ein echter Unterstamm erzeugt genau eine achte Stufe", async () => {
  const markup = await renderTaxonomy({ ...baseTaxonomy, Subphylum: "Vertebrata" });
  assert.equal((markup.match(/data-taxonomy-key=/g) ?? []).length, 8);
  assert.match(markup, /data-taxonomy-key="Subphylum"/);
  assert.match(markup, />Unterstamm:</);
  assert.match(markup, />Wirbeltiere</);
});

test("Leerwerte verschwinden und unbekannte Werte fallen sicher zurück", async () => {
  const markup = await renderTaxonomy({
    ...baseTaxonomy,
    Subphylum: "n/a",
    Family: "<script>alert('x')</script>",
    Order: "Neueordnung",
  });
  assert.doesNotMatch(markup, /data-taxonomy-key="Subphylum"/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.match(markup, />Neueordnung</);
});

test("Fehlermeldungen werden als Text und nicht als HTML ausgegeben", async () => {
  const markup = await renderTaxonomy(new Error("<img src=x onerror=alert(1)>"));
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
