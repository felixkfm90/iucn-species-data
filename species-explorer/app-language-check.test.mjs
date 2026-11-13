import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-language-check.js", import.meta.url), "utf8");
const css = await readFile(new URL("./public/language-check.css", import.meta.url), "utf8");
const flush = async () => { for (let n = 0; n < 8; n++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class UiEvent {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); this.defaultPrevented = false; }
  preventDefault() { this.defaultPrevented = true; }
}
class Events {
  handlers = new Map();
  addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) || []), fn]); }
  removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) || []).filter(item => item !== fn)); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const fn of [...(this.handlers.get(event.type) || [])]) fn(event);
    if (event.bubbles) this.parentNode?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  emit(type, options = {}) { const event = new UiEvent(type, options); this.dispatchEvent(event); return event; }
}
class Element extends Events {
  constructor(tag, documentRef) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = documentRef; this.parentNode = null; this.children = [];
    this.attributes = {}; this.style = {}; this.className = ""; this._text = ""; this.hidden = false;
    this.offsetLeft = 2; this.offsetTop = 3; this.clientWidth = 320; this.clientHeight = 120; this.offsetHeight = 100;
    this.value = ""; this.disabled = false; this.readOnly = false; this.selectionStart = 0; this.selectionEnd = 0;
    this.scrollTop = 0; this.scrollLeft = 0; this.maxLength = -1; this.wrap = "soft";
  }
  get isConnected() { return this === this.ownerDocument.documentElement || Boolean(this.parentNode?.isConnected); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this._text = String(value); for (const child of this.children) child.parentNode = null; this.children = []; }
  set innerHTML(_value) { throw new Error("User HTML must never be assigned"); }
  append(...children) { for (const child of children) { child.remove?.(); child.parentNode = this; this.children.push(child); } }
  insertBefore(child, before) { child.remove?.(); child.parentNode = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, child); }
  replaceChildren(...children) { this.textContent = ""; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  contains(node) { return Boolean(node && (node === this || this.children.some(child => child.contains?.(node)))); }
  closest(tag) { for (let node = this; node; node = node.parentNode) if (node.tagName?.toLowerCase() === tag) return node; return null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  getBoundingClientRect() { return { left: 20, top: 100, bottom: 220, width: 320, height: 120 }; }
  focus() { const previous = this.ownerDocument.activeElement; this.ownerDocument.activeElement = this; if (previous !== this) { previous?.emit("blur", { relatedTarget: this }); this.emit("focus"); } }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  setRangeText(replacement, start, end) { this.value = this.value.slice(0, start) + replacement + this.value.slice(end); this.selectionStart = this.selectionEnd = start + replacement.length; }
}
function harness({ value = "Das ist ein Feeler.", focused = false, result, review, isCurrent, onApply, delayMs = 500 } = {}) {
  const timers = new Map(), mutations = [], resizes = [], calls = []; let clock = 0, sequence = 0;
  const view = new Events();
  Object.assign(view, { Event: UiEvent, innerWidth: 1024, innerHeight: 768,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    getComputedStyle() { return { borderLeftWidth: "1px", borderTopWidth: "2px", fontFamily: "Arial", fontSize: "16px", lineHeight: "24px", paddingLeft: "10px", paddingTop: "8px" }; },
    MutationObserver: class { constructor(fn) { this.fn = fn; this.connected = false; mutations.push(this); } observe(target, options) { this.target = target; this.options = options; this.connected = true; } disconnect() { this.connected = false; } },
    ResizeObserver: class { constructor(fn) { this.fn = fn; resizes.push(this); } observe() { this.connected = true; } disconnect() { this.connected = false; } },
  });
  const documentRef = new Events(); documentRef.defaultView = view;
  documentRef.createElement = tag => new Element(tag, documentRef);
  documentRef.createTextNode = text => { const node = new Element("#text", documentRef); node._text = String(text); return node; };
  documentRef.documentElement = new Element("html", documentRef); documentRef.body = new Element("body", documentRef); documentRef.documentElement.append(documentRef.body);
  const dialog = new Element("dialog", documentRef), label = new Element("label", documentRef), field = new Element("textarea", documentRef);
  documentRef.body.append(dialog); dialog.append(label); label.append(field); field.value = value;
  if (focused) documentRef.activeElement = field;
  const defaultResult = result || { findings: [{ start: 12, end: 18, replacement: "Fehler", explanation: "Die Schreibweise lautet Fehler.", kind: "spelling" }] };
  const sandbox = { window: view, AbortController }; vm.runInNewContext(source, sandbox);
  const api = view.SpeciesExplorerLanguageCheck.createInlineLanguageCheck({ textarea: field,
    review: async (text, options) => { calls.push({ text, options }); return review ? review(text, options) : defaultResult; },
    ...(isCurrent ? { isCurrent } : {}), ...(onApply ? { onApply } : {}), delayMs });
  const nodes = () => { const result = []; const walk = node => { result.push(node); for (const child of node.children) walk(child); }; walk(documentRef.documentElement); return result; };
  const byClass = name => nodes().filter(node => node.className.split(" ").includes(name));
  return { api, field, view, documentRef, dialog, label, timers, mutations, resizes, calls, nodes, byClass,
    async advance(ms = delayMs) { const end = clock + ms; for (;;) { const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; clock = next[1].at; timers.delete(next[0]); next[1].fn(); await flush(); } clock = end; await flush(); },
    async type(text) { field.focus(); field.value = text; field.emit("input", { bubbles: true }); await flush(); },
    marks: () => byClass("language-check-mark"),
    popup: () => byClass("language-check-popover")[0],
    apply() { byClass("language-check-apply")[0].emit("click"); },
  };
}

test("native German spelling is always on; existing unfocused fields do not create a request storm", async () => {
  const h = harness(); assert.equal(h.field.spellcheck, true); assert.equal(h.field.lang, "de");
  await h.advance(5000); assert.equal(h.calls.length, 0); assert.equal(h.nodes().filter(n => n.tagName === "BUTTON").length, 0);
  h.field.focus(); await h.advance(499); assert.equal(h.calls.length, 0); await h.advance(1);
  assert.equal(h.calls.length, 1); assert.equal(h.marks()[0].textContent, "Feeler");
  h.api.dispose();
});

test("typing is debounced and receives the exact latest text and an abort signal", async () => {
  const h = harness({ result: { findings: [] } });
  await h.type("eins"); await h.advance(400); await h.type("eins zwei"); await h.advance(499);
  assert.equal(h.calls.length, 0); await h.advance(1); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].text, "eins zwei");
  assert.equal(h.calls[0].options.signal.aborted, false); h.api.dispose();
});

test("focused existing text checks automatically and a repeated focus reuses only the still-current result", async () => {
  const h = harness({ focused: true }); await h.advance(); assert.equal(h.calls.length, 1);
  h.field.emit("focus"); await h.advance(); assert.equal(h.calls.length, 1); assert.equal(h.marks().length, 1); h.api.dispose();
});

test("an ignored cancellation cannot start parallel reviews or return stale highlights", async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const h = harness({ focused: true, review: () => ++count === 1 ? first.promise : second.promise });
  await h.advance(); await h.type("Neuester Text"); assert.equal(h.calls[0].options.signal.aborted, true);
  await h.advance(); assert.equal(h.calls.length, 1);
  first.resolve({ findings: [{ start: 0, end: 3, replacement: "Alt", kind: "grammar", explanation: "Alt" }] }); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].text, "Neuester Text"); assert.equal(h.marks().length, 0);
  second.resolve({ findings: [] }); await flush(); assert.equal(h.field.getAttribute("data-language-check-state"), "ready"); h.api.dispose();
});

test("source/person checks are repeated after review and stale answers never paint", async () => {
  const gate = deferred(); let current = true;
  const h = harness({ focused: true, isCurrent: () => current, review: () => gate.promise });
  await h.advance(); current = false; gate.resolve({ findings: [{ start: 12, end: 18, replacement: "Fehler", explanation: "Schreibung", kind: "spelling" }] });
  await flush(); assert.equal(h.marks().length, 0); assert.equal(h.field.getAttribute("data-language-check-state"), "idle"); h.api.dispose();
});

test("switching between mounted fields waits for an uncooperative old review instead of running engines in parallel", async () => {
  const first = deferred(), h = harness({ focused: true, review: () => first.promise }); await h.advance();
  const second = new Element("textarea", h.documentRef); second.value = "Zweites Feld"; h.dialog.append(second); second.focus();
  let secondCalls = 0;
  const other = h.view.SpeciesExplorerLanguageCheck.createInlineLanguageCheck({ textarea: second, delayMs: 500,
    review: async () => { secondCalls++; return { findings: [] }; } });
  await h.advance(); assert.equal(h.calls[0].options.signal.aborted, true); assert.equal(secondCalls, 0);
  first.resolve({ findings: [] }); await flush(); assert.equal(secondCalls, 1);
  assert.equal(second.getAttribute("data-language-check-state"), "ready"); h.api.dispose(); other.dispose();
});

test("IME composition has no requests until the finished text settles", async () => {
  const h = harness({ result: { findings: [] } }); h.field.focus(); h.field.emit("compositionstart");
  h.field.value = "中"; h.field.emit("input"); await h.advance(1500); assert.equal(h.calls.length, 0);
  h.field.value = "中文"; h.field.emit("compositionend"); await h.advance(); assert.equal(h.calls[0].text, "中文"); h.api.dispose();
});

test("empty, disabled, read-only, oversized or removed fields perform no reviews", async () => {
  for (const configure of [h => { h.field.value = "  "; }, h => { h.field.disabled = true; }, h => { h.field.readOnly = true; },
    h => { h.field.value = "x".repeat(20001); }, h => { h.field.parentNode.remove(); }]) {
    const h = harness({ focused: true }); configure(h); await h.advance(); assert.equal(h.calls.length, 0); h.api.dispose();
  }
});

test("text, selection, scrolling, newlines and native field remain intact while marks are rendered as text nodes", async () => {
  const value = "<img>\nFeeler\nText", h = harness({ value, focused: true, result: { findings: [{ start: 6, end: 12, replacement: "Fehler", explanation: "<script>literal</script>", kind: "spelling" },
    { start: 12, end: 12, replacement: ",", explanation: "Komma", kind: "punctuation" }] } });
  h.field.selectionStart = h.field.selectionEnd = 7; h.field.scrollLeft = 3; h.field.scrollTop = 24; await h.advance();
  assert.equal(h.field.value, value); assert.equal(h.field.selectionStart, 7); assert.equal(h.marks().length, 2);
  assert.equal(h.byClass("language-check-mirror")[0].textContent, value + "\n");
  assert.equal(h.byClass("language-check-mirror")[0].style.transform, "translate(-3px, -24px)");
  assert.equal(h.byClass("language-check-mirror")[0].style.lineHeight, "24px");
  h.field.emit("mouseup"); assert.equal(h.popup().hidden, false); assert.equal(h.byClass("language-check-explanation")[0].textContent, "<script>literal</script>");
  h.api.dispose();
});

test("invalid, mismatched or split-surrogate spans are rejected as a whole", async () => {
  const valid = { start: 12, end: 18, replacement: "Fehler", explanation: "Schreibung", kind: "spelling" };
  for (const result of [{ findings: [{ ...valid, start: -1 }] }, { findings: [{ ...valid, end: 50 }] }, { findings: [{ ...valid, draftQuote: "fremd" }] },
    { originalText: "fremd", findings: [valid] }, { findings: [{ ...valid, replacement: "Zeile\nNeu" }] },
    { findings: [{ start: 1, end: 2, replacement: "x", explanation: "Trennung", kind: "spelling" }] }]) {
    const h = harness({ focused: true, value: result.findings?.[0]?.start === 1 ? "😀Text" : "Das ist ein Feeler.", result }); await h.advance();
    assert.equal(h.marks().length, 0); assert.equal(h.field.getAttribute("data-language-check-state"), "unavailable"); h.api.dispose();
  }
});

test("broad overlapping sentence hints do not hide independent concrete word corrections", async () => {
  const value = "Der Feeler steht hier.", h = harness({ value, focused: true, result: { findings: [
    { start: 0, end: 21, replacement: "Der Fehler befindet sich dort", explanation: "Breite Satzalternative", kind: "grammar", draftQuote: "Der Feeler steht hier" },
    { start: 4, end: 10, replacement: "Fehler", explanation: "Schreibung", kind: "spelling", draftQuote: "Feeler" },
    { start: 17, end: 21, replacement: "dort", explanation: "Unabhängiger Hinweis", kind: "grammar", draftQuote: "hier" },
  ] } });
  await h.advance(); assert.deepEqual(h.marks().map(mark => mark.textContent), ["Feeler", "hier"]);
  assert.equal(h.field.value, value);
  h.field.selectionStart = h.field.selectionEnd = 6; h.field.emit("mouseup"); h.apply(); await flush();
  assert.equal(h.field.value, "Der Fehler steht hier."); assert.equal(h.marks().length, 0); h.api.dispose();
});

test("partial overlaps choose the shortest span while non-overlapping hints remain applicable", async () => {
  const value = "abcdef abcdf efg", h = harness({ value, focused: true, result: { findings: [
    { start: 1, end: 5, replacement: "X", explanation: "Größere Teilspanne", kind: "grammar", draftQuote: "bcde" },
    { start: 3, end: 6, replacement: "Y", explanation: "Kleinere Teilspanne", kind: "grammar", draftQuote: "def" },
    { start: 8, end: 10, replacement: "Q", explanation: "Unabhängige Teilspanne", kind: "spelling", draftQuote: "bc" },
  ] } });
  await h.advance(); assert.deepEqual(h.marks().map(mark => mark.textContent), ["def", "bc"]); assert.equal(h.field.value, value);
  h.field.selectionStart = h.field.selectionEnd = 4; h.field.emit("mouseup"); h.apply(); await flush();
  assert.equal(h.field.value, "abcY abcdf efg"); h.api.dispose();
});

test("equal-span duplicate replacements collapse and conflicting alternatives keep the provider's stable first choice", async () => {
  const first = { start: 0, end: 6, replacement: "Fehler", explanation: "Erster Vorschlag", kind: "spelling", draftQuote: "Feeler" };
  const h = harness({ value: "Feeler.", focused: true, result: { findings: [first,
    { ...first, explanation: "Doppelter Hinweis", kind: "grammar" }, { ...first, replacement: "Falter", explanation: "Andere Alternative" }] } });
  await h.advance(); assert.equal(h.marks().length, 1); assert.equal(h.field.value, "Feeler.");
  h.field.selectionStart = h.field.selectionEnd = 2; h.field.emit("mouseup");
  assert.equal(h.byClass("language-check-apply")[0].textContent, "Fehler");
  assert.equal(h.byClass("language-check-explanation")[0].textContent, "Erster Vorschlag");
  h.apply(); await flush(); assert.equal(h.field.value, "Fehler."); h.api.dispose();
});
test("a context-checked primary and its optional alternative share one mark and apply only the selected text", async () => {
  const hint = { start: 4, end: 10, replacement: "Vogel", alternative: "Vögel", explanation: "Schreibweise prüfen.", kind: "spelling" };
  let selected;
  const h = harness({ value: "Der Vogeel sitzt.", focused: true, result: { findings: [hint] }, onApply: ({ finding }) => { selected = finding.replacement; } });
  await h.advance(); assert.equal(h.marks().length, 1); assert.equal(h.field.value, "Der Vogeel sitzt.");
  h.field.selectionStart = h.field.selectionEnd = 6; h.field.emit("mouseup");
  const buttons = h.byClass("language-check-apply");
  assert.deepEqual(buttons.map(button => button.textContent), ["Vogel", "Vögel"]);
  buttons[1].emit("click"); await flush();
  assert.equal(selected, "Vögel"); assert.equal(h.field.value, "Der Vögel sitzt."); h.api.dispose();
  const invalid = harness({ value: "Der Vogeel sitzt.", focused: true, result: { findings: [{ ...hint, alternative: "Vögel\u0000" }] } });
  await invalid.advance(); assert.equal(invalid.marks().length, 0);
  assert.equal(invalid.field.getAttribute("data-language-check-state"), "unavailable"); invalid.api.dispose();
});

test("valid overlaps never excuse an unsafe original span in the same response", async () => {
  const hint = { start: 4, end: 10, replacement: "Fehler", explanation: "Schreibung", kind: "spelling", draftQuote: "Feeler" };
  const h = harness({ value: "Der Feeler.", focused: true, result: { findings: [hint,
    { start: 0, end: 10, replacement: "Der Fehler", explanation: "Große Spanne", kind: "grammar" }, { ...hint, draftQuote: "Manipuliert" }] } });
  await h.advance(); assert.equal(h.marks().length, 0); assert.equal(h.field.getAttribute("data-language-check-state"), "unavailable");
  assert.equal(h.field.value, "Der Feeler."); h.api.dispose();
});

test("a suggestion only changes text after explicit acceptance and bubbles a normal input event", async () => {
  const h = harness({ focused: true }); let bubbled = 0; h.label.addEventListener("input", () => { bubbled++; }); await h.advance();
  assert.equal(h.field.value, "Das ist ein Feeler."); h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup");
  h.apply(); await flush(); assert.equal(h.field.value, "Das ist ein Fehler."); assert.equal(bubbled, 1);
  assert.equal(h.field.selectionStart, 18); assert.equal(h.marks().length, 0); h.api.dispose();
});

test("an application gate may veto without text changes or synthetic input", async () => {
  let gateInput; const h = harness({ focused: true, onApply: input => { gateInput = input; return false; } }); let inputs = 0;
  h.field.addEventListener("input", () => { inputs++; }); await h.advance(); h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup"); h.apply(); await flush();
  assert.equal(h.field.value, "Das ist ein Feeler."); assert.equal(inputs, 0); assert.equal(gateInput.nextText, "Das ist ein Fehler."); h.api.dispose();
});

test("a native insertText edit uses the real field and does not duplicate its input event", async () => {
  const h = harness({ focused: true }); let inputs = 0, commands = 0; h.field.addEventListener("input", () => { inputs++; });
  h.documentRef.execCommand = (command, ui, replacement) => {
    commands++; assert.equal(command, "insertText"); assert.equal(ui, false); assert.equal(h.documentRef.activeElement, h.field);
    assert.equal(h.field.selectionStart, 12); assert.equal(h.field.selectionEnd, 18);
    h.field.setRangeText(replacement, 12, 18); h.field.emit("input", { bubbles: true }); return true;
  };
  await h.advance(); h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup"); h.apply(); await flush();
  assert.equal(h.field.value, "Das ist ein Fehler."); assert.equal(commands, 1); assert.equal(inputs, 1); h.api.dispose();
});

test("cancelled beforeinput blocks both native and fallback corrections", async () => {
  for (const native of [false, true]) {
    const h = harness({ focused: true }); h.field.addEventListener("beforeinput", event => event.preventDefault());
    if (native) h.documentRef.execCommand = () => { h.field.emit("beforeinput", { cancelable: true }); return false; };
    await h.advance(); h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup"); h.apply(); await flush();
    assert.equal(h.field.value, "Das ist ein Feeler."); h.api.dispose();
  }
});

test("typing during delayed acceptance aborts it and preserves the new user text", async () => {
  const gate = deferred(); let signal; const h = harness({ focused: true, onApply: input => { signal = input.signal; return gate.promise; } });
  await h.advance(); h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup"); h.apply(); await flush();
  await h.type("Meine neue Eingabe"); assert.equal(signal.aborted, true); gate.resolve(true); await flush();
  assert.equal(h.field.value, "Meine neue Eingabe"); h.api.dispose();
});

test("changed binding, read-only state and maximum field length stop acceptance", async () => {
  for (const kind of ["binding", "readonly", "limit"]) {
    let current = true;
    const h = harness({ focused: true, isCurrent: () => current, result: { findings: [{ start: 12, end: 18, replacement: "Fehlerschreibung", explanation: "Schreibung", kind: "spelling" }] } });
    await h.advance(); h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup");
    if (kind === "binding") current = false; if (kind === "readonly") h.field.readOnly = true; if (kind === "limit") h.field.maxLength = 20;
    h.apply(); await flush(); assert.equal(h.field.value, "Das ist ein Feeler."); h.api.dispose();
  }
});

test("keyboard opens current suggestions; escape and scrolling close them without checking buttons", async () => {
  const h = harness({ focused: true }); await h.advance();
  const key = h.field.emit("keydown", { altKey: true, key: "ArrowDown" }); assert.equal(key.defaultPrevented, true); assert.equal(h.popup().hidden, false);
  assert.equal(h.documentRef.activeElement, h.byClass("language-check-apply")[0]);
  h.popup().emit("keydown", { key: "Escape" }); assert.equal(h.popup().hidden, true); assert.equal(h.documentRef.activeElement, h.field);
  h.field.selectionStart = h.field.selectionEnd = 14; h.field.emit("mouseup"); h.field.scrollTop = 44; h.field.emit("scroll");
  assert.equal(h.popup().hidden, true); assert.equal(h.byClass("language-check-mirror")[0].style.transform, "translate(0px, -44px)"); h.api.dispose();
});

test("unavailable and failed reviews stay quiet until another real input or focus", async () => {
  for (const review of [async () => ({ available: false, message: "private transport detail" }), async () => { throw new Error("private transport detail"); }]) {
    const h = harness({ focused: true, review }); await h.advance(); await h.advance(10000);
    assert.equal(h.calls.length, 1); assert.equal(h.marks().length, 0); assert.equal(h.field.getAttribute("data-language-check-state"), "unavailable");
    assert.ok(!h.nodes().some(node => node.textContent.includes("private transport detail"))); h.api.dispose();
  }
});

test("dispose aborts delayed work, restores the actual field and preserves unrelated description IDs", async () => {
  const gate = deferred(), h = harness({ focused: true, review: () => gate.promise }); await h.advance();
  h.field.setAttribute("aria-describedby", h.field.getAttribute("aria-describedby") + " another-help"); h.api.dispose(); h.api.dispose();
  assert.equal(h.calls[0].options.signal.aborted, true); assert.equal(h.field.parentNode, h.label); assert.equal(h.field.getAttribute("aria-describedby"), "another-help");
  gate.resolve({ findings: [] }); await flush(); assert.equal(h.byClass("language-check-overlay").length, 0);
  assert.equal(h.mutations.filter(item => item.connected).length, 0); assert.equal(h.resizes.filter(item => item.connected).length, 0);
  h.field.emit("input"); await h.advance(1000); assert.equal(h.calls.length, 1); assert.equal(h.field.spellcheck, true);
});

test("removing a mounted field disposes its listeners and pending timer", async () => {
  const h = harness({ focused: true }); h.dialog.remove();
  for (const observer of [...h.mutations]) if (observer.connected && observer.options.childList) observer.fn();
  await h.advance(1000); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
});

test("native-overlay styling is scoped and retains actual textarea layout and forced-color marks", () => {
  assert.match(css, /\.language-check-overlay\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /text-decoration-style:\s*wavy/); assert.match(css, /forced-colors:\s*active/);
  assert.doesNotMatch(css, /textarea[^}]*color:\s*transparent/); assert.doesNotMatch(source, /\.innerHTML\s*=/);
});
