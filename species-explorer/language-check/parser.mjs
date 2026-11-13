import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { requireValue } from "./errors.mjs";

export const LANGUAGE_CHECK_LIMITS = Object.freeze({ utf16: 20000, utf8: 80 * 1024, response: 2 * 1024 * 1024, findings: 500 });
export const textSha256 = text => createHash("sha256").update(text, "utf8").digest("hex");
const invalid = condition => requireValue(condition, "LANGUAGE_CHECK_INVALID_RESPONSE", "Die lokale Sprachantwort passt nicht zum unveränderten Text.", 502);
const boundary = (text, offset) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]));
function plain(value) {
  invalid(value && typeof value === "object" && !isProxy(value) && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  invalid(Reflect.ownKeys(value).every(key => typeof key === "string" && Object.getOwnPropertyDescriptor(value, key)?.enumerable
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value")));
  return value;
}
export function languageCheckInput(input) {
  requireValue(input && typeof input === "object" && !isProxy(input) && !Array.isArray(input)
    && Object.getPrototypeOf(input) === Object.prototype && Reflect.ownKeys(input).every(key => ["text", "context", "signal"].includes(key)
      && Object.getOwnPropertyDescriptor(input, key)?.enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), "value")),
  "LANGUAGE_CHECK_INVALID_INPUT", "Die Sprachprüfung benötigt ein gültiges Textfeld.", 400);
  const { text, context = "text", signal } = input;
  requireValue(typeof text === "string" && text.length <= LANGUAGE_CHECK_LIMITS.utf16 && Buffer.byteLength(text, "utf8") <= LANGUAGE_CHECK_LIMITS.utf8
    && text.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) && ["text", "caption", "heading"].includes(context),
  "LANGUAGE_CHECK_INVALID_INPUT", "Der Prüftext ist ungültig oder überschreitet die zulässige Länge.", 400);
  requireValue(signal === undefined || signal instanceof AbortSignal, "LANGUAGE_CHECK_INVALID_INPUT", "Der Abbruchkontext ist ungültig.", 400);
  return { text, context, signal };
}
function kind(rule) {
  const category = String(rule.category?.id || ""), issue = String(rule.issueType || "");
  if (issue === "misspelling" || category === "TYPOS") return "spelling";
  if (/CASING|GROSS|KLEIN/i.test(category) || /UPPERCASE|LOWERCASE|GROSS|KLEIN/.test(rule.id)) return "capitalization";
  if (/PUNCTUATION|KOMMA|ZEICHENSETZUNG/.test(category) || /KOMMA|COMMA|PUNCTUATION/.test(rule.id)) return "punctuation";
  return "grammar";
}
function fragmentPunctuation(context, text, start, end, original, replacement, rule) {
  if (context === "text") return false;
  if (/PUNKT_ENDE|SENTENCE.*PUNCTUATION|END.*PUNCTUATION/.test(rule.id)) return true;
  return /^\s*$/.test(text.slice(end)) && !/[.!?…]$/.test(text.trimEnd()) && replacement.replace(original, "").trim() === ".";
}

/** Positions are Java/JavaScript UTF-16 indices. No normalization or fuzzy replacement. */
export function parseLanguageToolResponse(raw, { text, context = "text", version = "6.6" } = {}) {
  languageCheckInput({ text, context }); plain(raw); plain(raw.software); plain(raw.language); plain(raw.warnings);
  invalid(raw.software.name === "LanguageTool" && raw.software.version === version && raw.language.code === "de-DE"
    && raw.warnings.incompleteResults === false && Array.isArray(raw.matches) && raw.matches.length <= LANGUAGE_CHECK_LIMITS.findings);
  const findings = [], seen = new Set();
  for (const match of raw.matches) {
    plain(match); plain(match.rule); plain(match.context); plain(match.rule.category);
    const start = match.offset, end = start + match.length;
    invalid(Number.isSafeInteger(start) && Number.isSafeInteger(match.length) && start >= 0 && match.length >= 0 && end <= text.length
      && boundary(text, start) && boundary(text, end) && typeof match.context.text === "string" && match.context.text.length <= LANGUAGE_CHECK_LIMITS.utf16 + 1000
      && Number.isSafeInteger(match.context.offset) && match.context.offset >= 0 && match.context.length === match.length
      && match.context.offset + match.length <= match.context.text.length
      && match.context.text.slice(match.context.offset, match.context.offset + match.length) === text.slice(start, end)
      && typeof match.message === "string" && match.message.length > 0 && match.message.length <= 1000
      && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(match.message)
      && typeof match.rule.id === "string" && /^[A-Z0-9_:-]{1,160}$/i.test(match.rule.id)
      && typeof match.rule.category.id === "string" && match.rule.category.id.length <= 160
      && Array.isArray(match.replacements) && match.replacements.length <= 100);
    if (!match.replacements.length) continue;
    const replacement = plain(match.replacements[0]).value, original = text.slice(start, end);
    invalid(typeof replacement === "string" && replacement.length <= 4000 && replacement.isWellFormed()
      && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(replacement)
      && text.length - original.length + replacement.length <= LANGUAGE_CHECK_LIMITS.utf16);
    if (replacement === original || fragmentPunctuation(context, text, start, end, original, replacement, match.rule)) continue;
    const key = JSON.stringify([start, end, replacement, match.rule.id]);
    if (seen.has(key)) continue;
    seen.add(key); findings.push({ start, end, replacement, explanation: match.message, kind: kind(match.rule), ruleId: match.rule.id });
  }
  findings.sort((a, b) => a.start - b.start || a.end - b.end || a.ruleId.localeCompare(b.ruleId));
  return { available: true, textSha256: textSha256(text), findings };
}
