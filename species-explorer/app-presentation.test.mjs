import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-presentation.js", import.meta.url), "utf8");
const context = vm.createContext({ URL });
new vm.Script(source, { filename: "app-presentation.js" }).runInContext(context);
const presentation = context.SpeciesExplorerPresentation;

test("Anzeigehelfer formatieren Größen, IUCN-Status und Datumswerte", () => {
  assert.equal(presentation.formatBytes(0), "0 KB");
  assert.equal(presentation.formatBytes(1536), "2 KB");
  assert.equal(presentation.formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  assert.equal(presentation.formatIucnFetchDate("2026-07-14"), "14.07.2026");
  assert.equal(presentation.formatIucnFetchDate(""), "Unbekannt");
  assert.equal(presentation.formatIucnStatus("EN"), "Stark gefährdet (EN)");
  assert.equal(presentation.formatIucnStatus("XX"), "XX");
  assert.equal(presentation.formatDate(""), "Kein Reportdatum");
});

test("HTML- und Linkhelfer lassen nur sichere Ausgaben zu", () => {
  assert.equal(
    presentation.escapeHtml(`<a title="x">Tom & O'Brien</a>`),
    "&lt;a title=&quot;x&quot;&gt;Tom &amp; O&#039;Brien&lt;/a&gt;",
  );
  assert.equal(presentation.safeUrl("javascript:alert(1)"), "");
  assert.equal(presentation.safeUrl("https://example.com/source"), "https://example.com/source");
  assert.match(
    presentation.creditLink({ url: "https://example.com/?a=1&b=2" }, "url", "Quelle öffnen"),
    /href="https:\/\/example\.com\/\?a=1&amp;b=2"/,
  );
  assert.equal(presentation.creditLink({}, "url", "Quelle öffnen"), "Nicht verfügbar");
});

test("Datenzeilen behandeln nur ausdrücklich freigegebenes Markup als HTML", () => {
  const sexed = presentation.formatSexSpecificDataValue(
    "Männchen: ca. 8–16 kg; Weibchen: ca. 3,5–5 kg",
  );
  assert.equal(sexed.trustedHtml, true);
  assert.match(sexed.html, /sex-specific-value/);
  assert.match(sexed.html, /Männchen ca\. 8–16 kg/);

  const rows = presentation.dataRows([
    ["Gewicht", sexed],
    ["Ungeprüft", "<script>alert(1)</script>"],
  ]);
  assert.match(rows, /<span class="sex-specific-value">/);
  assert.doesNotMatch(rows, /<script>/);
  assert.match(rows, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("IUCN- und Lizenzhelfer liefern eindeutige lokale Anzeigen", () => {
  assert.equal(presentation.iucnStatusIconUrl("en"), "/graphics/catagory/EN.png");
  assert.equal(presentation.iucnStatusIconUrl("NE"), "");
  assert.equal(presentation.iucnTrendIconUrl("Abnehmend"), "/graphics/trend/abnehmend.png");
  assert.equal(presentation.iucnTrendIconUrl("nicht bekannt"), "");

  const nc = presentation.soundLicenseInfo({ license: "https://creativecommons.org/licenses/by-nc-sa/4.0/" });
  assert.equal(nc.label, "NC");
  assert.equal(nc.className, "nc");
  const free = presentation.soundLicenseInfo({ isNc: false });
  assert.equal(free.label, "frei");
  const unknown = presentation.soundLicenseInfo();
  assert.equal(unknown.label, "unbekannt");
  assert.match(presentation.soundLicenseBadgeHtml(nc), /license-kind-badge nc/);
});

test("Assetanzeigen und Medienversionen bleiben deterministisch", () => {
  assert.equal(presentation.assetStatusText({ exists: false }), "Fehlt");
  assert.equal(
    presentation.assetStatusText({ exists: true, hashVerified: true, manuallyAdded: true, bytes: 2048 }),
    "Vorhanden · Soundhash geprüft · manuell hinzugefügt · 2 KB",
  );
  assert.equal(
    presentation.assetStatusText({ stale: true, staleReason: "Prüfsumme abweichend" }),
    "Veraltet · Prüfsumme abweichend",
  );
  assert.equal(
    presentation.backupRetentionText({ backupRetention: { kept: 5, removed: 2 } }),
    " Backupbestand: 5 Datei(en), 2 alte entfernt.",
  );
  assert.equal(presentation.pluralize(1, "Art", "Arten"), "1 Art");
  assert.equal(presentation.pluralize(2, "Art", "Arten"), "2 Arten");
  assert.equal(
    presentation.versionedAssetUrl("/assets/Amsel/sound.mp3", { sha256: "abc", bytes: 2048 }, "revision-1"),
    "/assets/Amsel/sound.mp3?t=abc-2048-revision-1",
  );
});
