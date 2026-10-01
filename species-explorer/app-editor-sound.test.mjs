import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-editor-sound.js", import.meta.url), "utf8");

test("Sound-Editor: Ablehnungen freigeben bleibt bewusst, artbezogen und schließbar", async () => {
  for (const scenario of ["save", "cancel", "empty", "error", "protected"]) {
    const button = { addEventListener: (_, fn) => { button.click = fn; } };
    const close = {}, message = {}, calls = [], state = {};
    const context = vm.createContext({ window: { confirm: () => scenario !== "cancel" } });
    new vm.Script(source).runInContext(context);
    context.SpeciesExplorerSoundEditor.createSoundEditorController({
      species: { id: "frosch", germanName: "Rotaugenlaubfrosch", assets: { sound: { manuallyAdded: scenario === "protected" } } },
      state, form: { querySelectorAll: () => [] }, closeButtons: [close],
      soundMessage: message, soundResetRejectionsButton: button,
      fetchJson: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        if (url.endsWith("/rejections-preview")) return { count: scenario === "empty" ? 0 : 1, token: "test" };
        if (scenario === "error") throw new Error("Geändert; erneut prüfen");
        return { saved: true };
      },
    });
    await button.click();
    assert.equal(close.disabled, false);
    assert.equal(button.disabled, false);
    assert.equal(calls.length, ["cancel", "empty"].includes(scenario) ? 1 : 2);
    assert.equal(calls.every((call) => call.url.startsWith("/api/species/frosch/assets/sound/rejections-")), true);
    if (scenario === "save" || scenario === "protected") {
      assert.equal(state.reloadAfterEditClose, true);
      assert.deepEqual(calls[1].body, { token: "test", confirmed: true });
      assert.match(message.textContent, scenario === "protected" ? /manuell geschützt/ : /Automatisch suchen/);
    }
    if (scenario === "error") assert.match(message.textContent, /erneut prüfen/);
  }
});
