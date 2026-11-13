import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { installGermanSpellcheck } from "./spellcheck.mjs";

function harness(platform = "win32") {
  const calls = [], menus = [], contents = new EventEmitter();
  let url = "http://127.0.0.1:4177/", destroyed = false;
  Object.assign(contents, { getURL: () => url, isDestroyed: () => destroyed,
    replaceMisspelling: (word) => calls.push(["replace", word]), session: {
      setSpellCheckerEnabled: (value) => calls.push(["enabled", value]),
      setSpellCheckerLanguages: (value) => calls.push(["languages", value]),
      addWordToSpellCheckerDictionary: (word) => calls.push(["learn", word]),
    } });
  const window = { webContents: contents };
  const dispose = installGermanSpellcheck({ window, platform,
    isAllowedUrl: (value) => value === "http://127.0.0.1:4177/",
    Menu: { buildFromTemplate: (items) => ({ popup: (options) => menus.push({ items, options }) }) } });
  const open = (values = {}) => contents.emit("context-menu", {}, { isEditable: true, inputFieldType: "plainText",
    misspelledWord: "Vogell", dictionarySuggestions: ["Vogel"], editFlags: { canCopy: true, canPaste: true }, ...values });
  return { calls, menus, contents, window, dispose, open,
    navigate: (value) => { url = value; contents.emit("did-start-navigation"); }, destroy: () => { destroyed = true; } };
}

test("deutsche Prüfung ändert keinen Text, bis ein Vorschlag ausdrücklich gewählt wird", () => {
  const h = harness(); h.open();
  assert.deepEqual(h.calls, [["enabled", true], ["languages", ["de"]]]);
  assert.equal(h.menus[0].options.window, h.window);
  h.menus[0].items.find((item) => item.label === "Vogel").click();
  assert.deepEqual(h.calls.at(-1), ["replace", "Vogel"]); h.dispose();
});

test("unbekannter Artname wird ausschließlich auf Wunsch ins persönliche Wörterbuch aufgenommen", () => {
  const h = harness(); h.open({ misspelledWord: "Grünstirn-Brillantkolibri", dictionarySuggestions: [] });
  assert.equal(h.menus[0].items[0].enabled, false);
  assert.equal(h.calls.some(([action]) => action === "learn"), false);
  h.menus[0].items.find((item) => item.label === "Wort ins persönliche Wörterbuch aufnehmen").click();
  assert.deepEqual(h.calls.at(-1), ["learn", "Grünstirn-Brillantkolibri"]); h.dispose();
});

test("Lesetext, Passwortfelder und externe Seiten erhalten kein Texteingabemenü", () => {
  const h = harness(); h.open({ isEditable: false }); h.open({ inputFieldType: "password" });
  h.navigate("https://example.org/"); h.open(); assert.equal(h.menus.length, 0); h.dispose();
});

test("ein alter Vorschlag verändert nach neuem Kontext oder Seitenwechsel keinen Text", () => {
  const h = harness(); h.open(); const old = h.menus[0].items[0];
  h.open({ misspelledWord: "anderes", dictionarySuggestions: ["anderer"] }); old.click();
  const next = h.menus[1].items[0]; h.navigate("https://example.org/"); next.click();
  assert.equal(h.calls.some(([action]) => action === "replace"), false); h.dispose();
});

test("beendete Fenster und entfernte Bedienung wenden keine alten Vorschläge an", () => {
  const h = harness(); h.open(); const item = h.menus[0].items[0];
  h.destroy(); item.click(); h.dispose(); h.open(); item.click();
  assert.equal(h.menus.length, 1); assert.equal(h.calls.some(([action]) => action === "replace"), false);
  assert.equal(h.contents.listenerCount("context-menu"), 0);
});

test("auf macOS bleibt die sprachliche Auswahl beim System; normales Bearbeiten bleibt im Menü", () => {
  const h = harness("darwin"); h.open({ misspelledWord: "", dictionarySuggestions: [] });
  assert.deepEqual(h.calls, [["enabled", true]]);
  assert.equal(h.menus[0].items.find((item) => item.role === "paste").enabled, true);
  assert.equal(h.menus[0].items.find((item) => item.role === "cut").enabled, false); h.dispose();
});
