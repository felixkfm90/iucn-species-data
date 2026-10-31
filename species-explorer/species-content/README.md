# Arteninhalte exportieren

Stand: 2026-10-31. Diese Modulgrenze erzeugt ausschließlich einen ausdrücklich angeforderten Export
und einen möglichen späteren Importplan. Sie schreibt keine bestehenden Artdaten, keine Alttextentwürfe,
keine Dienst-Datenbank und keine Squarespace-Inhalte.

`selectSpeciesPageUrls(speciesData,clusterRows,altPages?)` ordnet vorhandene Slugs den bereits belegten
Artseitenadressen zu. Mehrdeutige oder fehlende Adressen bleiben offen; Seitenpfade werden nicht geraten.
`captureSpeciesPages(selected,{concurrency?})` liest genau diese öffentlichen HTML-Seiten mit höchstens
vier gleichzeitigen Anforderungen, ohne Cookies, Redirectfolge, Linkscan oder Bilddownloads. Rohbytes,
Abrufzeitpunkt und SHA256 bleiben für eine private Quellbindung verfügbar. Historische gespeicherte
HTML-Beispiele werden nur als historische Quellen verwendet, nicht als neue Abrufe ausgegeben.

`exportSpeciesCatalog({speciesData,speciesList,pages,assetsRoot,generatedAt?})` verlangt alle Eingaben
ausdrücklich. `pages` ist eine Map von bestehendem Slug auf `{url,html}`; `assetsRoot` ist ein absoluter
Assetordner. Der Aufrufer entscheidet über einen Abruf und die private Ablage. Es gibt keine automatische
Suche in Produktionsdaten und keinen Import beim Programmstart.

Der Export verwendet den produktiven, begrenzten und nicht ausführenden
`parseWebsiteEditorialPage` sowie `parseWebsiteAltPage`. Er bewahrt Überschriften, Absatz- und Listenfolge
und die tatsächliche Galeriereihenfolge. Dynamisch leeres `Allgemein` wird aus den vorhandenen JSON-Werten
ergänzt. Eine leere Kartenrubrik mit vorhandenem `media.map` zählt als mediengestützter Abschnitt.
Die einleitende Artüberschrift bleibt erhalten. Andere leere oder nicht zugeordnete Fachtexte verhindern
einen vollständigen Abschluss. Wissenschaftlicher Name und Species-Rang enthalten den vollständigen Namen.

Lokale Medien werden über den bestehenden `sanitizeAssetName` aufgelöst. Vorhandene `portrait.webp`,
`map.jpg` und `sound.mp3` erhalten bestehende GitHub-Pages-Adressen, exakte Dateigrößen und frisch gelesene
SHA256-Werte. Fehlendes Porträt oder fehlende Karte bleibt ein offener Befund. Eine nicht vorhandene Aufnahme
bleibt eine leere `sounds`-Liste; daraus wird keine biologische Aussage über Lautäußerungen abgeleitet.
Vorhandene Spektrogramme sind als abgeleitete Quelldateien gebunden. Das Katalogschema 1 besitzt dafür
keinen gesonderten Medienslot; sie werden weder als zweite Aufnahme noch als Galeriefoto ausgegeben.

Die Medienattribution übernimmt ausschließlich vorhandene ausgewählte Werte: bei Aufnahmen `recordist`,
`license`, `source`, `url`; bei Illustrationen `type`, `source`, `generation_method`. Interne Auftragsnotizen,
vollständige Prompts und Originaldateinamen werden nicht übernommen. Die Kartenquelle entspricht dem
vorhandenen IUCN-Hinweis im Kartenmodul. Fehlende Lizenzangaben werden nicht durch eine behauptete
Lizenzfreiheit ersetzt. Vorhandene NC-Hinweise bleiben als Text erhalten.

Galerie-IDs hängen von der kanonischen öffentlichen Bildquelle ab. Squarespace-Formatparameter ändern
diese Identität nicht. Zur Anzeige wird gegebenenfalls `format=1500w` gewählt. Alternativtext und Beschriftung
stammen ausschließlich aus der öffentlichen HTML-Ausgabe; lokale Entwürfe werden nicht gelesen. Für nicht
heruntergeladene Galeriefotos gibt es keine erfundenen Bytes, Prüfsummen oder bestätigten Offlinepakete.

Der Rückgabewert enthält `catalog`, `complete`, alle Einzelbefunde sowie Quellenbelege. Das Katalogobjekt
selbst bleibt beim vereinbarten Schema 1. `createSpeciesImportPlan(snapshot)` akzeptiert nur einen vollständig
geprüften Export und liefert Entwurfsvorschläge mit `proposedOnly:true`, ohne Freigabe oder Veröffentlichung.
Der tatsächliche, erneut bestätigte Dienstimport gehört zur späteren Integration.

`validateSpeciesSnapshot({snapshot,speciesData,pages,readAsset?})` prüft zusätzlich die komplette Artmenge,
alle strukturierten Werte, volle wissenschaftliche Namen, Fachtext- und Überschriftenparität, Galeriereihenfolge,
öffentliche Bildtexte, kanonische Medienkennungen und auf Wunsch die tatsächlichen lokalen Mediendateien.
Die private Snapshotquittung muss außerdem unveränderte JSON-/Programm-/Assetquellen und die entfernten
eigenen Capture-Tempdateien nachweisen. Ein lokaler Export ersetzt keine CMS-, NAS- oder Geräteabnahme.

Tests: `node --no-warnings --test --test-isolation=none --test-concurrency=1 species-explorer/species-content/export.test.mjs`.
Die synthetischen Dateifixtures entstehen ausschließlich in einer eigenen `scripts/test-temp.mjs`-Sitzung.
Zwei bereits gebundene historische HTML-Beispiele prüfen zusätzlich volle Fachtext- und Bildfolge-Parität.
