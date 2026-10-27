# IUCN Species Data

Arten-Explorer und FN-Wildlife-Lightroom-Plug-in teilen eine lokale Taxonomiedatenbank. Die Datenpipeline
stellt öffentliche Artdaten, Verbreitungskarten, Tierstimmen und Frontend-Module für
[FN Wildlife & Travel](https://www.fnwildlifetravel.de/) auf
[GitHub Pages](https://felixkfm90.github.io/iucn-species-data/) bereit.

## Aktueller Arbeitsstand

Das am 8. Oktober 2026 beauftragte Gesamtaudit ist am **27. Oktober abgeschlossen**. Explorer,
Website und Lightroom sind im vereinbarten Umfang angenommen; die gezielte Abschlussbereinigung ist
ausgeführt. Gesamt-Go, Prüf-/Veröffentlichungsnachweise und verbleibende Betriebsgrenzen stehen
ausschließlich im [Auditauftrag Phase 10.5, Abschnitt 10.55](docs/audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).
Aktuelles Lightroom-Plug-in ist **0.4.24.40**. Die Großprobe einschließlich genauer Rücknahme und
unverändertem Originalkatalog ist bestanden. Weitere Arbeiten richten sich nach Felix' Auftrag;
die vereinbarten Folgevorhaben stehen in der [Roadmap](docs/roadmap.md).

Aktuelle Verträge und historische Nachweise sind über die [Dokumentationsübersicht](docs/README.md)
erreichbar. [Roadmap](docs/roadmap.md), [Taxonomie-Betriebsstand](docs/taxonomy-current-status.md) und der
[automatisch erzeugte Projektstatus](docs/project-status.md) beantworten Status- und Bestandsfragen.
Frühere ausführliche Root-Verläufe sind vollständig im Git-Stand
`d233bba3b89b4e81705fe9f6ba1edd53fd86f617` erhalten; die datierten Fachnachweise bleiben unter `docs/audits/`.

## Installation und Start

Windows benötigt Node.js 24 und die gesperrten Abhängigkeiten aus `package-lock.json`:

```powershell
npm.cmd ci
npm.cmd run species:desktop
```

Die Desktop-Verknüpfung wird mit `npm.cmd run species:desktop:shortcut` eingerichtet. Der lokale Server
ist ausschließlich über `127.0.0.1` erreichbar. Der Desktopstart bevorzugt Port `4177` und verwendet
bei Belegung einen freien lokalen Ersatzport. Installation, Fensterverhalten und Startwege erklärt der
[Desktopvertrag](docs/desktop-shell-plan.md).

Der aktuelle Programmordner ist `D:\Arten-Explorer`. Der gemeinsame Datenpfad wird aus `storage-path.json`
gelesen, standardmäßig `Daten` beim Programm. Referenz, Master, Lightroom-Paket, eigene Entscheidungen und
Aufträge gehören zusammen; nur ein einzelnes Suchpaket zu verschieben reicht nicht.
[Speicherwechsel und Rückweg](docs/storage-migration.md) dokumentieren die gemeinsame Pfadbindung.

Das Plug-in liegt unter `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/`. Installation, Neuladen,
SDK-Grenzen und aktuelle Quellversion stehen im [Lightroom-Vertrag](docs/lightroom-search-package.md).
Ein Dateidiff allein beweist keine neu geladene Version im Zusatzmodul-Manager.

FFmpeg wird für Medienkonvertierung, Spektrogramme und die Prüfung tatsächlicher Bilddekodierbarkeit
benötigt. Der Resolver verwendet `FFMPEG_PATH`, das vorhandene Werkzeug unter `local-tools/ffmpeg/bin/`
oder den Systempfad. Die Linux-Qualitätsprüfung installiert FFmpeg ausdrücklich.

## Bedienung und Datenfluss

Die Artseite zeigt neben den Statusangaben **Auf FN-Website öffnen**, sobald die öffentliche FN-Seitenliste
eine passende Artkennung enthält. Mehrere Bereiche werden als getrennte Links angeboten. Fehlt die Art dort,
erscheint **Art noch nicht auf der FN-Website veröffentlicht**, zusätzlich ein Website-Hinweis und der Filter
**FN-Website fehlt**. In der Artenliste kennzeichnet **W** eine bestätigte fehlende Website-Artseite,
entsprechend den vorhandenen Medienhinweisen. Sobald die Prüfung die veröffentlichte Seite findet,
verschwindet das W automatisch. Eine fehlgeschlagene Prüfung gilt nicht als fehlende Seite;
bereits bestätigte Links bleiben erhalten. Die Prüfung startet beim Öffnen des Explorers und wiederholt sich alle fünf Minuten.
**Website prüfen** und **Aktualisieren** prüfen sofort erneut. Ein manueller Linkeintrag ist nicht erforderlich:
Eine neu veröffentlichte Squarespace-Artseite wird über ihren bereits für die Website-Module verwendeten
URL-Slug erkannt. Dieser muss mit dem URL-Slug der Art im Explorer übereinstimmen. Die veröffentlichte
Seite muss in der öffentlichen Squarespace-Seitenliste enthalten sein; unveröffentlichte Entwürfe
sind dort nicht sichtbar.
Jeder neue Websiteabruf fordert einen frischen Stand an, damit eine beim Websiteanbieter noch
zwischengespeicherte ältere Seitenliste neue Artseiten nicht verdeckt. Der lokale Fünfminutentakt bleibt erhalten.
Bei Verbindungsfehlern erscheint „derzeit nicht prüfbar“; bereits bestätigte Links bleiben für die laufende
Explorer-Sitzung mit ihrem Prüfstand erhalten. Die Website-Prüfung ändert keine Art-, Medien- oder Lightroom-Daten.

Im Explorer liegen normale Arten-/Medienläufe, Suche und Datenbankupdate im Hauptbereich. Seltene
Einrichtungs-, Sicherungs- und Wartungsaktionen befinden sich unter **Weitere Aktionen**. Der
[Gesamtupdatevertrag](docs/taxonomy-reference-update.md) und die
[Update-Automatisierung](docs/taxonomy-update-automation.md) beschreiben den bewusst bestätigten Start,
die FN-Nutzungserfassung, das Warten auf Lightroom und den gemeinsamen Paarwechsel.

Beim Start prüft der Explorer die CoL-Version im Hintergrund. Ein Updateangebot erscheint bei einer
bekannten neuen Version; allein das Alter einer Ergänzungsprüfung öffnet kein Fenster. Die manuelle
Datenbankaktion bleibt erreichbar. Für einen bestätigten Wechsel wird die FN-Nutzung frisch geprüft;
die gespeicherte Statistik ersetzt diesen Nachweis nicht.

Bei vorübergehend nicht erreichbarem Backup-/Pipeline-Status bleibt der letzte bestätigte Stand sichtbar
als derzeit nicht aktuell gekennzeichnet. Die App versucht die lesende Statusabfrage begrenzt erneut;
das Statusfenster neu zu öffnen prüft frisch. Ein Start- oder Schreibauftrag wird dadurch nicht wiederholt.
Antwortet eine einzelne Statusabfrage 15 Sekunden lang nicht, wird nur diese lesende Anfrage beendet;
der gespeicherte Auftrag läuft davon unabhängig weiter.

**Bearbeitungsstände** bei einer Art zeigt im Bearbeitungsmodus frühere Artenlisten- und Taxonomiebearbeitungen
mit Vorschau und ausdrücklicher Wiederherstellungsbestätigung. Die Regeln stehen bei den
[manuellen Artangaben](docs/manual-species-fields.md) und der [Taxonomiebearbeitung](docs/taxonomy-edit-workflow.md).
**NAS-Archive ansehen** unter Backup und Einstellungen zeigt vorhandene Archive und ihre Nachweisgrenzen;
der [Sicherungs-/Restorevertrag](docs/multi-device-backup-plan.md) beschreibt den externen Wiederherstellungsweg.

Der [Artassistent](docs/add-species-workflow.md) führt über Allgemeines, Portrait, Karte, Sound und
Abschluss. **Schließen setzt denselben Auftrag später fort.** Der ausdrückliche Abbruch ist eine eigene
geschützte Aktion. Eine fehlende Karte darf die übrigen lokalen Schritte nicht blockieren und verhindert
weiterhin die Veröffentlichung. Dateiimport, Herkunft und manuelle Schutzentscheidung sind verschieden.
[Medienreview](docs/asset-review-workflow.md) und [Medienprüfung](docs/media-asset-validation.md) erklären
die Übernahme und die Erhaltung vorhandener Dateien bei Fehlern.

Lightroom bietet Taxonomiezuweisung, Art-Favorit, Ort/Zeit, Statistik/Exporte und FN-Datenpflege.
Globale Namenswahl ändert keine Fotoidentität. Auswahl- und Katalogaktionen haben unterschiedliche Reichweiten.
Nach gespeicherter Namenswahl folgen auch die vorhandenen Suchtreffer dem aktuellen Namen; eine
bloße Vorauswahl übernimmt noch keine globale Änderung.
Die fachlichen Verträge für [Namen](docs/taxonomy-name-preference-plan.md),
[Katalognutzung](docs/lightroom-catalog-usage.md) und
[Plug-in/Statistik/Exporte](docs/lightroom-search-package.md) enthalten die vollständigen Bedien- und Schutzregeln.

```text
species_list.json + öffentliche Projekt-Overrides
  -> update.mjs + Anbieteradapter
  -> speciesData.json + species-assets/ + Qualitätsreport
  -> kontrolliertes Pages-Artefakt
  -> Squarespace-Container und öffentliche Frontend-Module

lokale Referenz + Anbieterbelege + eigene Entscheidungen
  -> Master und abgeleitetes Lightroom-Paket
  -> gemeinsamer Veröffentlichungszeiger
  -> Explorer-Suche und Lightroom-Suchhelfer
```

## Website und Veröffentlichung

Squarespace stellt Seiten und Container bereit. Die öffentlichen Root-Module liefern Info, Taxonomie,
Status, Portrait, Karte, Sound, Suche/Sortierung, Galeriezoom und zugängliche Desktopmenüs. Verbindliche Einbindungen sind
[Footer](docs/squarespace-footer.html) und [Custom CSS](docs/squarespace-custom.css).
Bestehende Root-URLs, Slugs und Assetpfade bleiben gebunden.
Die Artkacheln werden alphabetisch sortiert; die Abschlusskachel „Weitere Tiere“ gehört immer ans Ende.
Der datierte Veröffentlichungs- und Bediennachweis steht im Auditauftrag.
Das freigegebene Artseiten-Grundlayout zeigt das Foto über die volle Seitenbreite im bisherigen
Ausschnitt; die ursprüngliche Bildüberlagerung und Fokusposition bleiben erhalten.
Auf Desktop und Tablet liegt der Titelbereich mit Rückknopf über dem Bild; nur mobil steht er darunter.
Die mobile Überschrift ist einschließlich farbiger Textteile schwarz; auf Desktop und Tablet bleiben
die vorhandenen Überschriftfarben erhalten.
Für die neun im Audit angenommenen Titelbilder sind zusätzlich individuelle Bildverschiebungen
bei 768 bis unter 1024 Pixeln integriert und öffentlich im Browser geprüft. Sie folgen der Kopfzeilenhöhe.
`species-hero-layout.js` aktiviert die zugehörigen CSS-Regeln ausschließlich
nach Prüfung einer erkannten Artseite; unbekannte Strukturen bleiben erhalten. Die Übertragung auf alle
Artseiten und die öffentliche Abnahme stehen im Auditauftrag. Modul, CSS und Footer gehören zusammen.
Die Desktopnavigation meldet ihren sichtbaren Offen-Zustand und lässt sich auch bei verbleibendem
Mauszeiger mit Escape schließen. Klick beziehungsweise Enter/Leertaste öffnen anschließend wieder;
die Mobilnavigation behält ihren Anbieterablauf. Footer, Custom CSS und öffentliche Bedienung werden
gemeinsam geprüft; der datierte Nachweis steht im Auditauftrag.

Der verbindliche [CSS-Betriebsvertrag](docs/monthly-site-audit.md) beschreibt die kanonische CSS-Datei,
ihren Import in Squarespace und die gemeinsame Cachepflege mit dem dokumentierten Footer. Im CMS wird
nur der dort angegebene Import gepflegt. Nach einer Übernahme die tatsächlich geladenen Quellen und
die Darstellung prüfen; HTTP 200 allein bestätigt keinen funktionierenden CSS-Einbau.

`.github/workflows/pages.yml` prüft den Stand, baut die Positivliste und veröffentlicht das kontrollierte
Artefakt. [CI-Vertrag](docs/ci-quality-gate.md), [Qualitätsgrenzen](docs/repository-quality-gates.md) und
[Strukturvertrag](docs/repo-structure.md) erklären Umfang und Wiederherstellung. Private Datenbanken,
Katalog-/GPS-/Nutzungsbelege, lokale Einstellungen und Temp gelangen nicht nach Git oder Pages.

Eine lokale Vorschau lässt sich ohne Veröffentlichung mit `npm.cmd run preview:squarespace` starten.
Die Oberfläche bietet Artwahl und Desktop-/Tablet-/Mobilansicht. Ein lokaler Test belegt weder den
aktuell geladenen Live-Footer noch ein Deployment. Öffentliche JS-/CSS-Änderungen benötigen zusätzlich
Cacheversions- und Liveprüfung; Veröffentlichung bleibt eine eigene Freigabe.

## Prüfung, Sicherung und Arbeitsdateien

```powershell
npm.cmd run --silent quality:ci
npm.cmd run --silent audit:site
npm.cmd run --silent audit:site -- --skip-live --skip-pages
npm.cmd run --silent temp:check
```

Das Gesamtgate kombiniert Syntax/Stil, Dokumentverweise, Schema, Verhaltenstests, Medien-/Größenprüfung,
Projektzustand und Offline-Websiteprüfung. Das Websiteaudit liest Sitemap, Links und Pages; es schreibt
seinen Bericht auf die Ausgabe, ohne eine produktive Pipeline auszulösen. Nötige native Bedienung,
SDK-Semantik, Livezustand und erfolgreiche Veröffentlichung werden getrennt nachgewiesen.

Eigene neue Test-/Mess-/Laufzeitdateien liegen in den gebundenen Programm-temp-Sitzungen, Plug-in-Helfer
im Plug-in-temp. [Tempvertrag](docs/temp-retention.md) und [Testvertrag](docs/test-temp-contract.md)
erklären Eigentum, aktive Prozesse und sichere Abschlussbedingungen. Bestehende `Testlauf`- und
Reparaturbelege werden nicht allein aufgrund ihres Orts entfernt.

Der lokale gemeinsame Vorgänger ist ein Rücknahmestand. Die externe NAS-Vollsicherung umfasst zusätzlich
dauerhafte private Daten und Konfiguration. [Sicherungsvertrag](docs/multi-device-backup-plan.md) und
[Speicherpflege](docs/taxonomy-storage-maintenance.md) legen Umfang, Prüfung, Rotation und Restoregrenzen fest.
Eine geprüfte ZIP-Inhaltsrücklesung ist noch kein nativer Programmstart aus einer Wiederherstellung.
Konkrete Bereinigung erfordert frisch bestätigte Ziele und Schutzprüfung.

## Projektstruktur und Mitarbeit

- `species-explorer/`: Desktop/Server, Fachservices und lokale Oberfläche; Einstiegsmodule komponieren.
- `lightroom-plugin/`: Lua-Plug-in mit SDK-Schreibgrenzen und direktem Verhaltenstest.
- Root-JavaScript, `species-assets/`, öffentliche JSON-Dateien und `graphics/`: gebundene Websiteinhalte.
- `scripts/`, Schemas, kleine Fixtures, Lockfile und Workflows: kontrollierte Prüf-/Bauwerkzeuge.
- `Daten/`: dauerhafte lokale fachliche Daten und Nachweise; Git-ignoriert, extern gesichert.
- `temp/`: eigene entbehrliche Arbeitsdateien nach dem Tempvertrag.
- `docs/`: aktuelle Fachverträge, generierter Projektstatus und unveränderte historische Nachweise.

Die [Arbeitsregeln](AGENTS.md) und [Dokumentationsregeln](docs/documentation-lifecycle.md) gelten bei Änderungen.
Aktuelle Zähler werden ausschließlich generiert; Fachregeln gehören in einen führenden Vertrag. Nach einer
Korrektur passende Verhaltenstests und betroffene Doku aktualisieren, `git diff --stat`, Dateien, Versionen
und Restgrenzen berichten. Keine historischen Prüfzahlen als heutige Gesamtabnahme ausgeben.
