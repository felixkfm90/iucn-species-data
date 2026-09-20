export function iucnBrowserAccessError(url, status) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (![401, 403].includes(status) || !(host === "iucnredlist.org" || host.endsWith(".iucnredlist.org"))) return null;
  const error = new Error(`IUCN erlaubt den automatischen Kartenabruf nicht (HTTP ${status}). `
    + "Ein funktionierender Browserlink bedeutet nicht, dass der Download durch das Programm freigegeben ist. "
    + "Bitte die Karte im Browser herunterladen und im Karteneditor als JPEG-/PNG-Datei auswählen. "
    + "Eine vorhandene Karte bleibt erhalten.");
  error.code = "IUCN_BROWSER_REQUIRED";
  return error;
}
