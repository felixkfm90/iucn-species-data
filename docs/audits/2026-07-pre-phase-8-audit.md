# Abschlussaudit vor Phase 8

Stand: 2026-07-18

Ausgangsstand: `f391ce2` (`Complete repository audit hardening`)

## Ziel und Prüfumfang

Vor dem Start von Phase 8 wurde das gesamte Repository erneut als technische und dokumentarische Grundlage geprüft.
Der Audit umfasst:

- Git- und Ordnerstruktur, versionierte und ignorierte Dateien sowie lokale Laufzeitreste;
- Quellcode, Modulgrenzen, Syntax, Style, Tests und vorhandene Qualitätsgates;
- Eingabe-, generierte, Report-, Override- und Assessment-Daten;
- Karten, Portraits, Sounds, Credits, Spektrogramme und öffentliche Laufzeitgrafiken;
- Abhängigkeiten, bekannte Schwachstellen, Remote-Konfiguration und mögliche eingebettete Geheimnisse;
- GitHub-Pages-Positivliste, Größenbudget und lokalen Site-Audit;
- Arbeits-, Betriebs-, Roadmap- und Detaildokumentation einschließlich historischer Kennzeichnung.

## Bestätigter Daten- und Medienstand

- 50 Eingabearten und 50 generierte Arten stimmen überein.
- 265 produktive Mediendateien wurden gegen Signatur, Format und feste Einzelgrenzen geprüft.
- 48 vorhandene Tierstimmen sind technisch gültige MP3-Dateien.
- Zwei fehlende Tierstimmen sind bewusst registriert und kein Konsistenzfehler.
- Sechs NC-Sounds und fünf manuell geschützte Karten stimmen mit Report und Override-Register überein.
- Das lokale Repository nutzt 92,6 von 145,0 MiB des mit der Artenzahl wachsenden Budgets.
- Die lokale Git-Packhistorie liegt bei 434,5 MiB und wird beobachtet, aber nicht riskant umgeschrieben.
- Es gibt keine versionierten Nullbyte-Dateien und keine inhaltsgleichen Quell-/Dokumentdateien außerhalb der
  absichtlich wiederholten Artassetnamen.

Aktuelle Zähler bleiben ausschließlich in `docs/project-status.md`; die Werte hier sind eine datierte
Audit-Zeitaufnahme.

## Behobene Funde

### Dynamische Alternativtexte

- `species-status.js` benennt IUCN-Status und Populationstrend im jeweiligen Bildalternativtext.
- Der mobile Karten-Vollbildmodus übernimmt den Alternativtext der Ausgangskarte.
- `lightbox-zoom.js` übernimmt den Alternativtext des geöffneten Bildes und nutzt nur ohne Ausgangstext einen
  verständlichen Fallback.
- `scripts/squarespace-accessibility.test.mjs` sichert diese drei Verträge.
- Der dokumentierte Footer wurde auf `species-status.js?v=1.0.9`, `map-loader.js?v=1.0.8` und
  `lightbox-zoom.js?v=1.0.7` angehoben.

### Lokale Logs und Laufzeitreste

- Der unbegrenzte Root-Log `errors.log` wurde entfernt und wird nicht mehr erzeugt.
- `update.mjs` schreibt Fehler fehlertolerant über `scripts/pipeline-error-log.mjs` nach
  `species-explorer/logs/pipeline-errors.log`; die Datei ist auf 256 KiB begrenzt.
- `desktop-launch.log` wird pro App-Start überschrieben statt erweitert.
- Pipeline-Logs bleiben unverändert auf 20 Dateien begrenzt; Staging, temporäre Pipeline-Sicherungen und
  Bereinigungsablagen bleiben durch `temp-retention.mjs` kontrolliert.

### Ordner- und Dateistruktur

- Die produktiven Squarespace-Module bleiben im Repository-Root, weil ihre GitHub-Pages-URLs öffentlich sind.
- `species-assets/<SafeName>/` bleibt die einzige produktive Artassetstruktur.
- `graphics/catagory/*.png` ist der Icon-Satz des Arten-Explorers; `graphics/catagory/Alternativ/*.png` ist der
  abweichende Squarespace-Satz. Beide werden aktiv genutzt und deshalb weder zusammengeführt noch verschoben.
- `graphics/catagory/Alternativ/Blaupause.psd` bleibt als Designquelle versioniert, wird aber von der
  Pages-Positivliste nicht veröffentlicht.
- `_site/`, `Testlauf/`, Backups, Logs, Staging, `node_modules/` und `local-tools/` bleiben bewusst lokal und
  ignoriert. Es wurde kein produktiver Pfad allein aus optischen Gründen verschoben.

### Abhängigkeiten und Sicherheit

- `npm audit` meldet keine bekannte Schwachstelle.
- Electron wurde kontrolliert innerhalb der bestehenden Hauptversion von 42.5.0 auf 42.7.0 aktualisiert; der
  größere Wechsel auf Version 43 ist kein ungeprüfter Bestandteil dieses Abschlussaudits.
- Der Git-Remote enthält keine Zugangsdaten.
- Die Suche nach Token-, Schlüssel- und Private-Key-Mustern fand kein eingebettetes Geheimnis. Die einzige
  Textübereinstimmung ist der beabsichtigte Zugriff auf `process.env.XENO_TOKEN`.

### Dokumentation

- Veraltete Aussagen zu Audio-Abschlussprüfung, Karten-/Soundfreigabe, Asset-Restore, Backupanzahl, Icon-Nutzung
  und Root-Logs wurden korrigiert.
- Frühere Bestands- und Konsolidierungsaudits sind sichtbar als historische Zeitaufnahmen gekennzeichnet.
- `check:docs` prüft künftig alle lokalen Markdown-Links und ausdrücklich genannten Dokumentpfade als Bestandteil
  von `quality:ci`.
- `AGENTS.md`, `README.md`, `docs/roadmap.md`, Struktur-, Aufbewahrungs-, Asset-, Audio-, Alt-Text- und
  Footer-Dokumentation wurden gemeinsam aktualisiert.

## Strukturentscheidung

Eine größere Neuorganisation ist vor Phase 8 weder nötig noch sicher. Die vorhandene Trennung in öffentliche
Root-Module, `scripts/`, `species-explorer/`, `species-assets/`, `graphics/` und `docs/` besitzt klare
Zuständigkeiten. Weitere Verschiebungen würden öffentliche URLs, lokale Modulimporte oder dokumentierte
Arbeitsabläufe berühren, ohne einen fachlichen Vorteil zu schaffen.

## Abschlussprüfung

Die Abschlussprüfung ist lokal vollständig bestanden:

- `quality:ci` prüfte 141 JavaScript-/MJS-Dateien, Style, 39 Dokumentdateien, Datenschemata, Statussynchronität,
  Qualitätswerkzeuge sowie alle Unit-, Integrations- und 21 Explorer-API-Tests ohne Fehler.
- Der kontrollierte Pages-Bau enthält exakt 331 freigegebene Dateien mit 90,4 von 137,0 MiB; Positivliste und
  Artefakt stimmen ohne fehlende oder zusätzliche Datei überein.
- `npm audit` meldet null bekannte Schwachstellen; die installierte Electron-Laufzeit startet als Version 42.7.0.
- Der externe Audit lud alle 122 Squarespace-Sitemap-Seiten ohne Abruf- oder HTTP-Fehler. Titel und
  Meta-Beschreibungen sind vollständig. Die geprüften GitHub-Pages-Module, Daten und Stichprobenassets antworten
  mit HTTP 200.
- Der Arten-Explorer wurde bei 1920 x 1080 und 900 x 720 Pixeln geprüft. Die Medienbereiche wechseln korrekt von
  drei Spalten auf eine Spalte, erzeugen keinen horizontalen Überlauf, der Artwechsel setzt nur den rechten
  Detailbereich zurück, und die Karten-Lightbox lässt sich öffnen und schließen. Die Browserkonsole blieb ohne
  Warnung oder Fehler.
- Temporäre Prüfartefakte wurden danach entfernt; der Aufbewahrungscheck meldet keinen Restbestand.
- Der Auditstand wurde mit Commit `273e92b` veröffentlicht. Im
  [GitHub-Actions-Lauf 29643719906](https://github.com/felixkfm90/iucn-species-data/actions/runs/29643719906)
  waren Qualitätsprüfung, Pages-Artefaktbau und Deployment beim ersten Versuch erfolgreich. Die drei geänderten
  Frontendmodule werden danach mit HTTP 200 und dem neuen Quellstand ausgeliefert; `speciesData.json` enthält live
  50 Arten.

### Externer Squarespace-Inhaltshinweis

Fünf interne Pfade außerhalb der Sitemap sind erreichbare System-, Asset- oder Weiterleitungspfade. Der statische
Button auf `/wildlife/namibia` verweist jedoch auf `/wildlife/namibia/acinonyxjubatus`, während diese Gepard-Seite
aktuell HTTP 404 liefert. Das ist kein Repository-, Daten- oder Deploymentfehler und kann aus diesem Repository
nicht sicher entschieden werden: Vor einer öffentlichen Verlinkung muss die Squarespace-Detailseite angelegt oder
der dortige Button entfernt werden.

## Ergebnis

Alle während des Audits gefundenen lokalen Code-, Struktur- und Dokumentationspunkte sind bereinigt. Der
Repository-Stand ist technisch für Phase 8 freigegeben. Commit, GitHub-Actions-Qualitätsgate, Pages-Bau und
Live-Auslieferung sind erfolgreich abgeschlossen. Der separat ausgewiesene Squarespace-Link zur Gepard-Seite
betrifft ausschließlich den externen CMS-Inhalt und nicht die Phase-8-Codebasis.
