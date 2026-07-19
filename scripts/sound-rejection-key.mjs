function decodeComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeCommonsTitle(value) {
  let title = decodeComponent(String(value ?? "").trim())
    .replace(/[?#].*$/, "")
    .replaceAll(" ", "_")
    .normalize("NFC");
  const fileIndex = title.toLocaleLowerCase("de").lastIndexOf("file:");
  if (fileIndex >= 0) title = title.slice(fileIndex + 5);
  title = title.replace(/^\/+|\/+$/g, "");
  return title ? `File:${title}` : "";
}

function commonsTitleFromValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const pathname = decodeComponent(url.pathname);
    const wikiMatch = pathname.match(/\/wiki\/(?:File|Datei):(.+)$/i);
    if (wikiMatch) return normalizeCommonsTitle(wikiMatch[1]);
    const finalSegment = pathname.split("/").filter(Boolean).pop();
    if (finalSegment) return normalizeCommonsTitle(finalSegment);
  } catch {
    // Der Wert kann bereits ein Commons-Titel statt einer URL sein.
  }
  return normalizeCommonsTitle(raw);
}

export function normalizeSoundRejectionKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const separator = raw.indexOf(":");
  if (separator < 0) return raw;
  const source = raw.slice(0, separator).trim().toLocaleLowerCase("de");
  const identity = raw.slice(separator + 1).trim();
  if (source === "wikimedia-commons") {
    const title = commonsTitleFromValue(identity);
    return title ? `${source}:${title}` : "";
  }
  return `${source}:${identity}`;
}

export function commonsSoundRejectionKey(hit = {}) {
  const identity = hit.title || hit.descriptionUrl || hit.fileUrl || hit.mp3Url || "unknown";
  return normalizeSoundRejectionKey(`wikimedia-commons:${identity}`);
}
