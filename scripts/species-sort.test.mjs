import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../sort.js", import.meta.url), "utf8");

function overview(titles, triggerId = "species-sort") {
  const timers = new Map();
  const observers = [];
  let nextTimer = 1;
  let writes = 0;
  let mutationPending = false;
  const scope = {
    contains(node) {
      for (let current = node; current; current = current.parentElement) {
        if (current === scope) return true;
      }
      return false;
    },
    querySelectorAll: () => parent.children.map((item) => item.heading),
  };
  const parent = {
    parentElement: scope,
    children: [],
    appendChild(fragment) {
      for (const item of fragment.children) {
        item.parentElement = this;
        this.children.push(item);
      }
      fragment.children = [];
      writes += 1;
      mutationPending = true;
    },
  };
  function add(title) {
    const item = { parentElement: parent };
    item.heading = { textContent: title, closest: () => item };
    parent.children.push(item);
    mutationPending = true;
    return item;
  }
  titles.forEach(add);
  mutationPending = false;

  const document = {
    readyState: "complete",
    getElementById: (id) => id === triggerId ? {} : null,
    querySelector: (selector) => selector === "main" ? scope : null,
    createDocumentFragment() {
      return {
        children: [],
        appendChild(item) {
          const previous = item.parentElement;
          previous.children.splice(previous.children.indexOf(item), 1);
          item.parentElement = this;
          this.children.push(item);
          mutationPending = true;
        },
      };
    },
  };
  const context = vm.createContext({
    document,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; this.active = true; }
      disconnect() { this.active = false; }
    },
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  context.window = context;
  new vm.Script(source, { filename: "sort.js" }).runInContext(context);

  return {
    add,
    titles: () => parent.children.map((item) => item.heading.textContent),
    writes: () => writes,
    pending: (delay) => [...timers.values()].filter((timer) => timer.delay === delay).length,
    run(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay || !timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    deliverMutations() {
      if (!mutationPending) return;
      mutationPending = false;
      for (const observer of observers) {
        if (observer.active) observer.callback([{ type: "childList", target: parent }]);
      }
    },
  };
}

test("Weitere Tiere bleibt hinter Wendehals und Wintergoldhähnchen", () => {
  const page = overview(["Weißstorch", "Weitere Tiere", "Wendehals", "Wintergoldhähnchen"]);
  page.run(0);
  assert.deepEqual(page.titles(), ["Weißstorch", "Wendehals", "Wintergoldhähnchen", "Weitere Tiere"]);
});

test("Die Abschlusskachel wird trotz Großschreibung und sichtbarem Leerraum erkannt", () => {
  for (const closing of ["Weitere Tiere", "weitere tiere", "\n WEITERE\u00a0 TIERE \t"]) {
    const page = overview([closing, "Zilpzalp", "Amsel", "Wendehals"]);
    page.run(0);
    assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Zilpzalp", closing]);
  }
});

test("Nur der vollständige normalisierte Abschlusstitel erhält eine Sonderstellung", () => {
  for (const ordinary of ["Weitere Tiere Europas", "Weitere Tiere!", "Weitere Tier"]) {
    const page = overview(["Zilpzalp", "Weitere Tiere", "Wendehals", ordinary]);
    page.run(0);
    assert.deepEqual(page.titles(), [ordinary, "Wendehals", "Zilpzalp", "Weitere Tiere"]);
  }
});

test("Echte Arten behalten deutsche, numerische und bei gleichem Titel stabile Sortierung", () => {
  const page = overview(["Amsel 10", "Zilpzalp", "Amsel 2", "Ährenmaus", "amsel 2"]);
  page.run(0);
  assert.deepEqual(page.titles(), ["Ährenmaus", "Amsel 2", "amsel 2", "Amsel 10", "Zilpzalp"]);
});

test("Wiederholte Start- und eigene Observerläufe verändern die fertige Reihenfolge nicht", () => {
  const page = overview(["Weitere Tiere", "Wendehals", "Amsel"]);
  page.run(0);
  assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Weitere Tiere"]);
  assert.equal(page.writes(), 1);
  page.deliverMutations();
  page.run(200);
  for (const delay of [600, 1800, 3200]) page.run(delay);
  assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Weitere Tiere"]);
  assert.equal(page.writes(), 1, "Fertige Gruppen dürfen keine Mutation-Schleife auslösen");
  assert.equal(page.pending(200), 0);
});

test("Observer sortiert nachgeladene Arten vor die Abschlusskachel und bleibt danach ruhig", () => {
  const page = overview(["Wendehals", "Weitere Tiere"], "species-search");
  page.run(0);
  page.add("Amsel");
  page.deliverMutations();
  page.add("Zilpzalp");
  page.deliverMutations();
  assert.equal(page.pending(200), 1, "Nachladungen werden zusammengefasst");
  page.run(200);
  assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Zilpzalp", "Weitere Tiere"]);
  const writes = page.writes();
  page.deliverMutations();
  page.run(200);
  assert.equal(page.writes(), writes);
  assert.equal(page.pending(200), 0);
  page.run(8000);
  page.add("Buchfink");
  page.deliverMutations();
  assert.equal(page.pending(200), 0, "Der bestehende zeitlich begrenzte Observer bleibt begrenzt");
});
