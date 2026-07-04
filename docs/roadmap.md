# Roadmap

Stand: 2026-06-29

Definition of Done fuer alle weiteren Schritte: Ein Schritt gilt erst als abgeschlossen, wenn die betroffenen Dateien
geaendert, geprueft und die dazugehoerige Dokumentation aktualisiert sind. Mindestens zu pruefen sind `AGENTS.md`,
`README.md`, `docs/roadmap.md` und passende Detaildokumente unter `docs/`.

## Phase 1 - Frontend-Stabilitaet

Status: erledigt

- `lightbox-zoom.js` stabilisiert und live geprueft.
- Suche auf Uebersichtsseiten stabilisiert.
- Gemeinsamer Species-Datenloader und Cache in `species-core.js` eingefuehrt.
- GitHub-Pages-Assetpfade fuer Status-, Trend-, Karten- und Soundmodule vereinheitlicht.

## Phase 2 - Squarespace-Integration und CSS

Status: erledigt

- Aktueller Squarespace Footer unter `docs/squarespace-footer.html` dokumentiert.
- Aktuelles Squarespace Custom CSS unter `docs/squarespace-custom.css` dokumentiert.
- CSS-/Layout-Audit unter `docs/css-layout-audit.md` dokumentiert.
- Live-Checks fuer Detailseite, Uebersichtsseite, Mobile Layout und Lightbox-Smoke-Test durchgefuehrt.

## Phase 3 - Datenpipeline stabilisieren

Status: erledigt

- `update.mjs` nach den letzten Schutzlogiken komplett ausgefuehrt.
- Report, Assets, Assessment-Tracking und erzeugtes `speciesData.json` geprueft.
- Vorhandene gute Daten wurden nicht durch unvollstaendige API-Antworten verschlechtert.
- NC-Sounds werden bei jedem Lauf erneut auf freie Xeno-Canto-, Commons- und iNaturalist-Alternativen geprueft.
- Beim Lauf am 2026-05-26 wurde `Eurasisches Eichhoernchen` auf eine freie BY-SA-4.0-Aufnahme ersetzt.

## Phase 4 - Datenqualitaet, Sounds und Quellen

Status: erledigt

- Verbleibende NC-Soundlizenzen geprueft und nach Moeglichkeit ersetzt.
- `Fischertukan` wurde auf eine freie Wikimedia-Commons-/iNaturalist-Aufnahme mit CC BY-SA 4.0 ersetzt.
- `Grosstrappe` wurde durch die nun integrierte Commons-Fallbacksuche automatisch auf eine freie Wikimedia-Commons-Aufnahme mit CC BY-SA 4.0 ersetzt.
- Die Suche nach freien Alternativen wurde um iNaturalist erweitert. Es werden nur exakt passende Taxa, kommerziell nutzbare CC-/Public-Domain-Lizenzen und echte MP3-Dateien akzeptiert.
- `Mittelamerikanischer Totenkopfaffe` und `Panama-Kapuzineraffe` wurden dadurch auf freie iNaturalist-Aufnahmen mit CC BY 4.0 ersetzt.
- Die Zahl der aktiven NC-Sounds wurde damit von 8 auf 3 reduziert.
- Fuer die verbleibenden 3 NC-Faelle ergab die erweiterte Xeno-Canto-, Wikimedia-Commons- und iNaturalist-Suche keine direkt verwendbare freie MP3-Alternative.
- Sound-Credits und Lizenzhinweise werden im Frontend bereits mit Quelle, Aufnahme, Lizenzlink und Quelllink ausgegeben.
- Karten-, Sound- und Daten-Fallbacks wurden erneut geprueft; aktuell kein Frontend-Patch noetig.
- README und Betriebsdoku bleiben als fortlaufender Abgleich Pflicht.

## Phase 5 - Struktur, Assets und Wartbarkeit

Status: erledigt

- 5.1 Repo- und Dateiaudit: erledigt, siehe `docs/repo-file-audit.md`.
- 5.2 Dokumentation aktualisieren, inklusive AGENTS-/Uebergabe-Dokumentation: erledigt und ab jetzt fortlaufende Pflicht.
- 5.3 Lokalen Workflow und Repo-Struktur absichern: erledigt, siehe `docs/repo-structure.md`.
- 5.4 Soundbar verbessern: erledigt; nach Optikfeedback auf native Audio-Wiedergabe mit Canvas-Wellenform,
  gekapselten Modulstyles und reduzierter Credit-Anzeige umgestellt, siehe `docs/soundbar.md`. Der separate sichtbare
  NC-Warnhinweis wurde am 2026-06-14 entfernt; NC bleibt intern ueber Credits, Report und Sound-Review nachvollziehbar.
- 5.5 Manuelle Zusatzdaten nur dort pflegen, wo IUCN nichts liefert: erledigt.
  `species_list.json` fuehrt jetzt manuell gepflegte `life_expectancy`; `update.mjs` uebernimmt sie als
  `Lebenserwartung` in `speciesData.json`, und `species-info.js` zeigt sie oberhalb der Generationsdauer. Technische
  Platzhalter wie `n/a`, `U`, leere Werte und `unknown` werden in der Info-Box als `Unbekannt` angezeigt.
- 5.6 Weitere Arten ergaenzen: erledigt fuer den aktuellen Stand.
  Neue Arten werden nur manuell in `species_list.json` ergaenzt, nicht automatisiert. Der Ablauf ist in
  `docs/add-species-workflow.md` dokumentiert. Am 2026-06-17 wurde die Pipeline ohne neue Arten durchgefuehrt:
  45 Arten, 45 Art-Assetordner, 45 Karten, 45 MP3s, 45 Credits, 45 Spektrogramme, keine fehlenden Kernassets.
- 5.7 SEO: erledigt fuer den aktuellen Stand.
  `docs/seo-worklist.md` enthaelt jetzt einen Live-Sitemap-Audit fuer 117 URLs mit aktuellem SEO-Titel, aktueller
  Meta-Beschreibung, konsistentem Vorschlag, Status und Hinweis je URL. Kurzbefund: 13 passen bereits, 53 brauchen
  Titel und Beschreibung, 42 brauchen nur eine vereinheitlichte Beschreibung, 7 brauchen einen vereinheitlichten Titel,
  1 URL lieferte 404 und 1 Pfad ist strukturell auffaellig. Zusaetzlich sind per internem Link-Crawl Legacy-, Redirect-
  und Systempfade ausserhalb der Sitemap dokumentiert. Manueller Stand vom 2026-05-29: Basis-Titel,
  Reise-Uebersichten, Reise-Detailseiten und Wildlife-Uebersichten sind laut Felix in Squarespace umgesetzt und in der
  Worklist als `umgesetzt, live pruefen` markiert. `/reisen/2024-costarica` ist seit Felix' Freigabe am 2026-06-01
  oeffentlich erreichbar und passt live. Live-Audit vom 2026-05-30 plus Nachpruefung vom 2026-06-01: 118
  dokumentierte URLs/Seiten passen, alle 44 per aktueller Sitemap auffindbaren Wildlife-Artseiten passen live, und die
  zuvor offenen Reise-Wortlautabweichungen sind erledigt. `Kohlmeise` ist laut Felix bewusst geparkt und wird erst
  spaeter aktiviert, wenn die Art auf Instagram gepostet wird. Der alte Pfad `/2019-griechenland` liefert weiter 404,
  ist nach Felix' Korrektur aber nicht mehr aus der Reiseuebersicht verlinkt. Laut Felix existieren keine Altlinks;
  ein Redirect ist deshalb aktuell nicht noetig. Bild-Alt-Texte und optionale Bildtitel wurden am 2026-06-01 auditiert:
  `docs/image-alt-audit.md`. Nachpruefung vom 2026-06-14: Der Capri-Link auf `/reisen/2021-neapel` wurde von Felix
  korrigiert und zeigt jetzt auf `/reisen/2021-neapel/capri`. Der vollstaendige interne Link-Crawl vom 2026-06-14
  pruefte 117 Sitemap-Seiten und fand ausserhalb der Sitemap nur Root `/`, `/cart` und die globalen Squarespace-Ordner
  `/reisen-1` und `/wildlife`.
  Aeltere Beacon-/Folder-Pfade wurden aktuell nicht mehr intern verlinkt gefunden.
  Nachpruefung der Bild-Alt-Texte vom 2026-06-15: Die sichtbaren Artseiten-Galeriebeschreibungen wurden offenbar
  entfernt, die echten HTML-`alt`-Attribute enthalten live aber weiterhin auf allen 44 aktiven Artseiten Dateinamen
  (1.330 Instanzen).
  Felix hat am 2026-06-15 alle Artseiten manuell visuell geprueft und sieht keinen Galerietext mehr. Fuer die sichtbare
  Website-Darstellung gilt der Artseiten-Galerietext damit als erledigt. Reiseseiten-Galerietexte sind bewusst gesetzt
  und bleiben bestehen. Technische Dateinamen-`alt`-Attribute werden fuer den aktuellen Stand akzeptiert. Artseiten-
  und Reiseseiten-Alt-Texte gelten damit als erledigt.
- Mobile Reisegalerien: Am 2026-06-14 wurde im Squarespace Custom CSS ein Mobile-only-Override ergaenzt. Grid-Galerien
  mit mehr als einer Spalte werden unter 768 px auf eine Spalte gesetzt; Desktop bleibt unveraendert. Dokumentiert in
  `docs/squarespace-custom.css` und `docs/css-layout-audit.md`.
- 5.8 Ordnerstruktur und Assets pro Art nach sanitisiertem Namen bewerten: erledigt, siehe
  `docs/asset-structure-plan.md`.
  Ergebnis damals: artweise Buendelung ist technisch sinnvoll, aber nur mit Loader-/Pipeline-Anpassung und Live-Test.
  Die Umsetzung erfolgte spaeter in Phase 6.8.

## Phase 6 - Funktionsueberarbeitung

Status: erledigt

Ziel: Die bestehenden Funktionen weiter professionalisieren, ohne den stabilen Live-Betrieb durch grosse Umbauten ohne
Testpfad zu gefaehrden.

Abschluss: Phase 6 wurde am 2026-06-17 nach erfolgreichem GitHub-Pages-Deploy und Live-Test abgeschlossen. Die
produktive Asset-Struktur ist jetzt ausschliesslich `species-assets/<SafeName>/`; die alten Ordner
`Verbreitungskarten/` und `sounds/` wurden entfernt. Dokumentation, Pipeline, Audit, Spektrogramm-Generator und
Frontend-Loader sind auf diesen Stand abgeglichen.

- Dokumentation pruefen und bei Bedarf ueberarbeiten:
  `AGENTS.md`, `README.md`, `docs/roadmap.md` und relevante Detaildokumente muessen zum echten Projektstand passen.
- Monatliches Gesamtaudit fuer die komplette Website definieren und durchfuehren:
  siehe `docs/monthly-site-audit.md`.
  - Sitemap-/URL-Status
  - interne Links und Redirects
  - SEO-Titel und Meta-Beschreibungen
  - Artseiten-Module, Karten, Sounds, Suche, Sortierung und Lightbox
  - GitHub-Pages-Assets und Reports
  - rechtlich relevante externe Dienste und Einbindungen
- Audit-Ausgabe als Zusammenfassung gliedern:
  - offen
  - erledigt/geprueft
  - nicht erneut manuell geprueft, weil unveraendert
  - noch nicht geprueft
  - bewusst akzeptiert oder geparkt
- Regel fuer unveraenderte Punkte: Wenn an einem Bereich nichts geaendert wurde, ist keine erneute manuelle
  Detailpruefung Pflicht. Das Audit darf den Bereich aber nicht ignorieren; es muss ihn als unveraendert bzw. nicht
  erneut manuell geprueft ausweisen.
- Spektrogramm-Assets fuer Tierstimmen konzipieren:
  - technische Machbarkeit pruefen
  - Generierung lokal oder in Pipeline bewerten
  - Speicherort, Dateigroesse, Ladezeit und mobile Darstellung pruefen
  - Integration in `species-sound.js` mit Fallback umsetzen
- Buendelung der Assets pro Art abschliessen:
  - Grundlage ist `docs/asset-structure-plan.md`
  - `species-assets/<SafeName>/` ist die produktive Struktur
  - alte Assetordner nicht wieder einfuehren
- Manuell gepflegte Karten dokumentieren:
  - Datei `docs/manual-map-overrides.md` pflegen, in der manuell gepflegte Karten eindeutig gelistet sind
  - Monatsaudit muss diese Karten als eigenen Pruefpunkt ausgeben
  - bei unveraenderten Karten reicht Status `nicht erneut manuell geprueft, unveraendert`
- Gestartet am 2026-06-15:
  - Audit-Grundlage angelegt: `docs/monthly-site-audit.md`
  - Liste fuer manuell gepflegte Karten angelegt: `docs/manual-map-overrides.md`
- 6.1 Erster echter Monatsaudit: erledigt am 2026-06-15, siehe `docs/audits/2026-06-site-audit.md`.
  Ergebnis: 117 Sitemap-URLs live erreichbar, keine fehlenden SEO-Grundfelder, GitHub-Pages-Daten und Kernassets
  konsistent, keine neuen kritischen Fehler.
- 6.2 Manuell gepflegte Karten dokumentieren: erledigt am 2026-06-15, siehe
  `docs/manual-map-overrides.md`.
  Grund: IUCN liefert fuer `Blaukehlchen`, `Fischertukan`, `Grosstrappe`, `Kernbeisser`, `Reh`, `Rotfuchs` und
  `Waldkauz` korrupte Kartendaten. Diese produktiven Karten sind als manuell gepflegte Overrides dokumentiert.
- 6.3 Audit-Automatisierung vorbereiten: erledigt am 2026-06-15.
  `scripts/monthly-site-audit.mjs` und `npm.cmd run --silent audit:site` pruefen Sitemap-/Status, interne Links,
  SEO-Grundfelder, GitHub-Pages-Beispielassets, lokale Assetkonsistenz, NC-Sounds und manuell gepflegte Karten.
  Nicht automatisiert bleiben echte Mobile-/Touch-Tests, visuelle Screenshot-Pruefung, fachliche SEO-Textqualitaet und
  rechtliche Detailpruefung.
- 6.4 Spektrogramm-Assets fuer Tierstimmen konzipieren: erledigt am 2026-06-15, siehe
  `docs/spectrogram-plan.md`.
  Ergebnis: Spektrogramme sind technisch sinnvoll, aber als vorberechnete optionale Assets unter
  `species-assets/<SafeName>/spectrogram.webp`. Keine Browser-Liveberechnung.
- 6.5 Spektrogramm-Generator-Prototyp bauen: erledigt am 2026-06-15.
  `scripts/generate-spectrograms.mjs` und `npm.cmd run --silent generate:spectrograms` scannen
  `species-assets/<SafeName>/sound.mp3`. Unterstuetzt werden Dry-Run, Einzelarten, Testausgabe nach `Testlauf/`,
  `--force`, WebP/PNG und ffmpeg per PATH, `FFMPEG_PATH` oder
  `--ffmpeg=<Pfad>`.
  Dry-Run und echte Testausgabe sind erfolgreich getestet. Am 2026-06-15 wurden fuer `Amsel`, `Graugans` und
  `Bisamratte` temporare WebP-Testausgaben nach `Testlauf/spectrograms` erzeugt. Der bevorzugte Zielstil ist jetzt
  im Generator-Default abgebildet: heller Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben und unten,
  Frequenzbereich bis 18 kHz. Die produktive Erzeugung und Frontend-Integration wurde anschliessend in 6.6 umgesetzt.
- 6.6 Spektrogramme produktiv erzeugen und Soundbar integrieren: erledigt am 2026-06-15.
  Es wurden 45 Spektrogramm-Assets unter `species-assets/<SafeName>/spectrogram.webp` erzeugt. `species-sound.js`
  laedt die Spektrogramme optional per `HEAD` und zeigt sie mit rotem Positionsmarker und vorhandener Bedienlogik an.
  Wenn ein Spektrogramm fehlt oder nicht geladen werden kann, bleibt die bisherige Canvas-Wellenform als Fallback
  aktiv. Nach Sichtpruefung wurde der Default auf `stop=18000`, `drange=80`, `gain=3` angepasst, damit auch leisere
  und hochfrequentere Arten sichtbar bleiben. Die aktuelle Squarespace-Footer-Version fuer den Live-Betrieb steht in
  6.8.
- 6.7 Soundbar-Regler fuer Lautstaerke und Tempo: erledigt am 2026-06-15.
  `species-sound.js` bietet jetzt einen kompakten Lautstaerkeregler von 0 bis 200 Prozent und eine
  Abspielgeschwindigkeit-Auswahl fuer `0,25x`, `0,5x`, `1x`, `1,5x`, `2x` und `4x`. Lautstaerke ueber 100 Prozent
  wird per Web-Audio-Gain verstaerkt; ohne Web-Audio-Unterstuetzung bleibt die normale Browser-Lautstaerke bis
  100 Prozent nutzbar. Lautstaerke und Tempo werden lokal im Browser gespeichert, wenn `localStorage` verfuegbar ist.
  Nach Live-Rueckmeldung wurde ein Tonfix nachgezogen: Web Audio wird seit `species-sound.js?v=1.0.15` nur noch fuer
  Werte ueber 100 Prozent aktiviert, damit die normale Wiedergabe nicht durch Cross-Origin-Einschraenkungen stumm
  wird. Der Positionsmarker wird waehrend der Wiedergabe per `requestAnimationFrame` geglaettet.
  Danach wurde ein Mute-Toggle auf dem Lautsprechersymbol ergaenzt: Klick setzt temporaer auf `0%`, markiert das
  Symbol rot durchgestrichen und ein zweiter Klick stellt den vorherigen Wert wieder her.
  Danach wurde die Playbutton-Optik nachgeschaerft: Play-/Pause-Symbol im runden Button vertikal zentriert und der
  ganze Button optisch in die Mitte der unteren Bedienflaeche versetzt, ohne das Control-Grid umzubauen. Die
  zusaetzliche sichtbare Quellenzeile unter `Tierstimme` wurde entfernt; Quelle und Lizenz bleiben im ausklappbaren
  Detailbereich.
  Anschliessend wurde die Soundbar weiter verdichtet: Playbutton, kompakte Lautstaerke, Zeit und Tempo liegen in einer
  gemeinsamen Control-Zeile. Seit `species-sound.js?v=1.0.20` steht `Tierstimme` oberhalb des Spektrogramms, damit
  die Bedienflaeche darunter kompakter bleibt.
  Soundbar-UI-Version im damaligen Live-Betrieb: `species-sound.js?v=1.0.20`.
- 6.8 Asset-Buendelung pro Art umsetzen: erledigt am 2026-06-17, siehe
  `docs/asset-structure-plan.md`.
  Ergebnis: `species-assets/<SafeName>/` ist die produktive Struktur mit `map.jpg`, `sound.mp3`, `credits.json`
  und `spectrogram.webp`. Die alten Ordner `Verbreitungskarten/` und `sounds/` wurden entfernt.
  `species-core.js`, `map-loader.js`, `species-sound.js`, `update.mjs`, `scripts/generate-spectrograms.mjs` und
  `scripts/monthly-site-audit.mjs` wurden auf die neue Struktur angepasst. Besonders zu schuetzen sind die sieben
  manuell gepflegten Karten aus `docs/manual-map-overrides.md`. GitHub Pages wurde fuer Commit `f9126d7` erfolgreich
  deployed. Live geprueft wurde: neue Pfade unter `species-assets/Amsel/*` liefern `200`, alte Pfade unter `sounds/`
  und `Verbreitungskarten/` liefern `404`, und die ausgelieferten JS-Dateien enthalten keine alten Asset-Pfade mehr.
  Der Squarespace-Footer ist fuer diesen Stand auf `species-core.js?v=1.0.4`, `map-loader.js?v=1.0.7` und
  `species-sound.js?v=1.0.22` gesetzt und wurde von Felix live erfolgreich getestet.

## Phase 7 - Desktop-App / Arten-Explorer

Status: in Arbeit seit 2026-06-17

Ziel: Eine lokale Desktop-App und eine robustere lokale Betriebsumgebung erstellen, damit Arten, Daten, Sounds, Karten,
Bilder und weitere Assets gepflegt werden koennen, ohne direkt in JSON-Dateien und Ordnern suchen zu muessen.

- Arten anzeigen, suchen und filtern.
- Neue Arten manuell hinzufuegen.
- Bestehende Artdaten bearbeiten, inklusive manueller Felder aus `species_list.json`.
- IUCN-Datenabruf und Pipeline-Status sichtbar machen.
- Sounds, Credits und Lizenzen anzeigen und austauschen.
- Karten anzeigen, markieren und manuell gepflegte Karten dokumentieren.
- Bilder/Assets je Art verwalten oder mindestens verlinken.
- Validierung vor dem Speichern:
  - Pflichtfelder
  - URL-Slug
  - sanitisierter Assetname
  - vorhandene Karte
  - vorhandener Sound
  - Credits-Datei
- Export/Save so gestalten, dass bestehende Pipeline und GitHub-Pages-Struktur nicht unkontrolliert veraendert werden.
- Projektmigration oder Spiegelung auf ein persoenliches Synology NAS konzipieren:
  - klaeren, ob das NAS primaer Backup, Mirror, Testklon oder spaeter aktive Arbeitskopie wird
  - Risiken von Git- und Pipeline-Laeufen auf Netzlaufwerken pruefen: Latenz, Dateilocks, Sync-Konflikte,
    Credential-Handling und Windows-Pfadverhalten
  - bestehende lokale Arbeitskopie erst nach Testlauf ersetzen, nicht direkt verschieben
- Automatisiertes Backup einrichten:
  - Backup-Ziel und Zeitplan festlegen
  - sensible Daten und Tokens ausschliessen
  - Restore-Test dokumentieren
  - pruefen, ob GitHub-Remote, lokale Arbeitskopie und NAS-Backup zusammen eine nachvollziehbare Sicherung ergeben

- 7.1 Anforderungen, Bedienumfang und technische Basis der Desktop-App festlegen: erledigt am 2026-06-17, siehe
  `docs/desktop-app-plan.md`.
  Entscheidung: Start als lokale Node-Web-App mit Browseroberflaeche. Der erste Prototyp bleibt read-only und zeigt
  Arten, Datenstatus und Assets an, bevor Bearbeiten/Speichern freigeschaltet wird. Electron oder Tauri bleiben
  spaetere Optionen, falls ein echtes Desktop-Paket noetig wird.
- 7.2 Read-only Prototyp bauen: erledigt am 2026-06-18, siehe `docs/desktop-app-plan.md`.
  `species-explorer/` enthaelt einen lokalen Node-Server, read-only API, Artenliste, Suche, Filter und Detailansicht
  fuer manuelle Daten, IUCN-Daten, Taxonomie, Karte, Sound, Credits und Spektrogramm. Drei NC-Sounds, sieben manuell
  gepflegte Karten sowie fehlende oder inkonsistente Assets werden markiert. Tests: 45 Arten, 0 Assetinkonsistenzen,
  Suche/Filter erfolgreich, POST wird mit 405 abgewiesen, Desktop- und responsive Sichtpruefung erfolgreich.
  Nach Live-Feedback werden Karten vollstaendig im Originalseitenverhaeltnis angezeigt; Spektrogramm und Audio sind
  in einem Player mit Play/Pause, Zeit, Lautstaerke, Scrubbing und Positionsmarker gekoppelt. Artwechsel erhalten die
  Scrollposition. Ein Klick ins Spektrogramm setzt die Position und startet die Wiedergabe dort. Der
  lokale Server unterstuetzt dafuer HTTP-Byte-Ranges und liefert partielle MP3-Inhalte mit Status `206`; ohne diese
  Unterstuetzung sprang die lokale Wiedergabe beim Start wieder auf Position 0. Der
  Tierstimmen-Bereich wurde zugunsten des spaeteren Artportraets verkleinert, Credits sind
  einklappbar, das IUCN-Abrufdatum steht im Detailkopf und der Statusfilter verwendet deutsche Bezeichnungen mit
  IUCN-Kuerzel. Manuelle Assetpflege wird direkt bei der jeweiligen Karte markiert und ist fuer spaetere manuelle
  Sounds erweiterbar. Medien- und Datenraster sind seit 2026-06-19 auf identische 50/50-Spalten ausgerichtet.
  Spektrogramme werden im Explorer nur noch 64 bis 84 Pixel hoch angezeigt. Fuer Squarespace reduziert
  `species-sound.js?v=1.0.24` die Anzeige auf 78 Pixel beziehungsweise 68 Pixel mobil; die Assets bleiben
  unveraendert. Die dokumentierte Footer-Version ist inzwischen `species-sound.js?v=1.0.25`; sie korrigiert die
  Meldung fuer fehlende Tierstimmen auf `Keine Tierstimme verfügbar` ohne Schlusspunkt.
- 7.3 Validierung und Statusdashboard erweitern: erledigt am 2026-06-19, siehe `docs/desktop-app-plan.md`.
  Das read-only Dashboard vergleicht `species_list.json`, `speciesData.json`, `fehlende_elemente_report.json` und
  die tatsaechlichen Dateien unter `species-assets/`. Datenabweichungen, Assetprobleme und alle Probleme sind getrennt
  filterbar; artweise Hinweise erscheinen in der Detailansicht. Der aktuelle Stand besteht alle Pruefungen:
  45 von 45 Datenpaare stimmen ueberein, 45 Assetpakete sind vollstaendig, neun Reportpruefungen sind konsistent und
  es bestehen 0 Validierungshinweise. Der gueltige Trendwert `Unbekannt` wird nicht als fehlend bewertet.
  Status- und Hinweis-Dropdowns sind alphabetisch sortiert. Felix hat Phase 7.3 am 2026-06-19 visuell geprueft.
  Die interne Phasenbezeichnung wird in der App nicht mehr angezeigt. Kopfbereich, Zusammenfassung und
  Validierungsstatus bleiben im Desktopfenster sichtbar; darunter scrollen Artenliste und Detailbereich getrennt.
  Beim Artwechsel springt nur der rechte Detailbereich wieder an den Anfang, waehrend die linke Artenliste ihre
  Scrollposition behaelt.
  Der Squarespace-Footer mit `species-sound.js?v=1.0.24` wurde live erfolgreich getestet; dokumentierter Folgestand
  fuer die Textkorrektur ist `species-sound.js?v=1.0.25`.
- 7.4 Kontrolliertes Bearbeiten von `species_list.json`: abgeschlossen am 2026-06-19.
  Bestehende Arten erlauben ausschliesslich die Bearbeitung von Groesse, Gewicht und Lebenserwartung. Vor dem
  Speichern sind serverseitige Validierung und eine Diff-Vorschau Pflicht. Ein einmaliges zehn Minuten gueltiges
  Vorschau-Token sowie ein SHA-256-Abgleich schuetzen gegen ungepruefte oder parallele Aenderungen. Vor jedem
  Schreibvorgang wird eine nicht versionierte Sicherung unter `species-explorer/backups/` angelegt. Name, Taxonomie,
  neue Arten, IUCN-Felder, Pipeline und Git bleiben ausserhalb des Schreibumfangs. Die Backup-Aufbewahrung ist auf
  die neuesten 20 verwalteten Dateien begrenzt; fremde Dateien werden nicht geloescht. Die inzwischen sechs
  automatisierten Explorer-Tests
  einschliesslich isoliertem Schreib-/Backup-/Retention-Test sind erfolgreich. Felix hat Speichern, Testwertkorrektur
  und Bedienablauf visuell geprueft. `Bearbeiten` und `Löschen` stehen inzwischen als allgemeine Artaktionen oben
  rechts im Detailkopf, damit Phase 7.7 dort auch Karten- und Soundpflege anbinden kann.
- 7.5 Neue Art kontrolliert anlegen: abgeschlossen und praktisch geprüft am 2026-06-20,
  siehe `docs/add-species-workflow.md`.
  Die App erfasst deutschen Namen, wissenschaftlichen Namen, Groesse, Gewicht und Lebenserwartung. Der
  wissenschaftliche Name wird im Hintergrund in Gattung und Artepitheton getrennt und normalisiert. Vor dem Speichern
  werden wissenschaftlicher Name, deutscher Name, erwarteter Slug und `SafeName` auf Duplikate und Kollisionen
  geprueft. Vorschau, einmaliges Token, SHA-256-Abgleich, Backup-Retention und atomisches Schreiben werden aus
  Phase 7.4 wiederverwendet. Nach dem Speichern erscheint die Art erwartungsgemaess zunaechst nur in
  `species_list.json`; IUCN-Daten und Assets entstehen erst durch den separaten Lauf von `node update.mjs`.
  Seit 2026-06-29 ist der Dialog als vierstufiger Schrittassistent aufgebaut: allgemeine Daten pruefen, optionales
  Artportrait pruefen oder ueberspringen, Karte/Suchlauf und Sound/Abschluss. Ungueltige Eingaben werden direkt am
  Feld markiert; der initiale Hinweis ist bereits sichtbar, damit das Formular beim ersten Tippen nicht springt.
  Groesse und Gewicht koennen unabhaengig voneinander nach Maennchen und Weibchen getrennt werden. Groesse, Gewicht
  und Lebenserwartung werden aus Wert plus Einheit zusammengesetzt; `ca.` wird automatisch gespeichert und
  Lebenserwartung wird bei `1` automatisch auf `Tag`, `Monat` oder `Jahr` gebeugt. Bereits erreichte Schritte
  koennen wieder angeklickt werden. `Artportrait ueberspringen` startet keine Anlage mehr, sondern gibt erst
  `Naechster Schritt` frei. Die API-Routen sind `POST /api/species/new/preview`,
  `POST /api/species/new/portrait-prompt`, `POST /api/species/new/portrait-preview` und
  `POST /api/species/new/save`. Nach Schritt 2 legt die App die Art an und startet den gezielten Lauf fuer genau
  diese neue Art im selben Dialog; das Datenbank-Aktionen-Fenster wird dabei nicht geoeffnet. Neue Karten koennen
  uebernommen oder uebersprungen werden. Neue Sounds werden mit Spektrogramm angezeigt und koennen uebernommen,
  uebersprungen oder abgelehnt werden. Abgelehnte Sounds starten automatisch die nächste gezielte Soundsuche, bis
  eine Quelle akzeptiert wird oder keine taugliche Quelle mehr vorhanden ist.
  20 Explorer-Tests sind erfolgreich; die echte Artenliste wird in den Schreibtests
  nicht veraendert. Der lokale Server wurde mit dem neuen Stand neu gestartet und liefert Aktion, Dialog und alle
  Pflichtfelder mit Beispieltexten aus. Klickbare, noch offene Schritte sind blau, abgeschlossene Schritte gruen und
  gesperrte Schritte grau markiert. Sound- und Spektrogramm-URLs werden bei jedem neuen Suchversuch mit einem
  Hash-Buster versehen, damit nach einer Ablehnung kein veralteter Cache abgespielt wird.
  Weitere Arten koennen nach einem erfolgreichen Speichern ohne Seitenneuladen angelegt werden. Haubentaucher und
  Höckerschwan wurden nach den produktiven Workflow-Tests wieder entfernt und am 2026-06-28 bereinigt. Löwe wurde
  nach einem erneuten Neue-Art-Test wieder produktiv angelegt. Aktuell stehen 47 Arten in `species_list.json`.
- 7.6 Pipeline- und Audit-Steuerung: abgeschlossen am 2026-06-20. Vollständige und selektive App-Läufe,
    Prozessanzeige, Assetentscheidung, automatischer Commit/Push, Bereinigung, Karten-Großansicht, sichere
    Dialogbedienung und Soundstopp wurden praktisch geprüft, siehe `docs/pipeline-control-plan.md`.
    Die App unterscheidet `Neue/Unvollstaendige Arten aktualisieren` und `Alle Arten vollstaendig aktualisieren`.
    Der Spektrogramm-Abgleich wird in der Prozessausgabe inzwischen als lesbare Zusammenfassung pro Art angezeigt
    statt als roher JSON-Block.
  Der gezielte Lauf verarbeitet input-only Arten, Arten mit fehlenden IUCN-Kernfeldern oder Assets sowie Arten mit
  geaenderten manuellen Eingabefeldern aus `species_list.json`. Der
  vollstaendige Lauf entspricht dem bisherigen `node update.mjs` ueber die gesamte Artenliste. Vor dem Start werden
  Laufart, Zielarten und Gruende angezeigt. Nur ein Lauf darf gleichzeitig aktiv sein; Logs duerfen keine Tokens
  enthalten. `update.mjs` unterstuetzt jetzt `--mode=missing`, `--mode=all` und `--dry-run`;
  Aufrufe ohne Parameter bleiben vollstaendige Laeufe. Die App zeigt Prozessstatus und lokale, auf 20 Dateien
  begrenzte Logs. Nach erfolgreicher Pipeline folgt der passende Spektrogramm-Abgleich.
  Arten koennen nach Vorschau und Backup aus `species_list.json` entfernt werden. Die separate Aktion `Bereinigen`
  listet danach verwaiste generierte Daten, Assessment-Zuordnungen, Pflegeeinträge und Assetordner auf. Nach genau einer
  Bestaetigung werden diese Inhalte dauerhaft und ohne Wiederherstellungsablage geloescht. Details:
  `docs/delete-species-workflow.md`. Die Prozesssteuerung wurde kompakt in die Kopfzeile verschoben: Das klickbare
  Datenbank-Feld oeffnet den Dialog `Datenbank-Aktionen`; dort sind Aktualisieren, Backup/Einstellungen und Wartung
  in aufklappbaren Gruppen getrennt. Es ist bei manuellen Eingabeabweichungen rot als `Änderungen übertragen` und
  bei konsistentem Stand gruen als `Datenbank aktuell` markiert. Bei roten Abweichungen öffnet ein Klick direkt den
  Transferlauf fuer geaenderte Eingabefelder und lokal gespeicherte Assetaenderungen ohne Karten- oder Soundsuche.
  Der Status- und Übertragungsbutton bleibt auch im Lesemodus sichtbar; ohne offene Änderungen öffnet er dort keine
  Wartungsaktionen. `Art aktualisieren` fragt je Art nur kurz nach und startet den gezielten Lauf direkt im
  Hintergrund, ohne den allgemeinen Datenbank-Aktionen-Dialog zu öffnen. Ein gleich breiter Umschalter trennt `Lesemodus 🔒`
  und `Bearbeitungsmodus 🔓`; alle Schreibaktionen sind nur im Bearbeitungsmodus sichtbar. Nach dem Anlegen einer Art wird
  der selektive Lauf direkt angeboten, kann aber abgebrochen und spaeter gestartet werden. Neue Karten und Sounds
  werden vor der Git-Veröffentlichung angezeigt und als automatisch oder manuell geschuetzt bestaetigt.
  Kartenvorschauen öffnen für die Qualitätsprüfung eine große Lightbox. Danach
  erfolgen Git-Commit und Git-Push automatisch. Das maschinenlesbare Register
  `species-assets-overrides.json` schützt manuell gepflegte Karten und Sounds vor der Pipeline. Acht Explorer-Tests
  waren erfolgreich. Nach einem extern gestarteten Batch-Lauf blieb das bereits laufende Servermodell zunächst
  veraltet. Deshalb überwacht der Server nun Artenliste, Pipeline-Ausgaben, Report, Overrides und Assetdateien per
  Revision. Die geöffnete App prüft diese Revision alle fünf Sekunden und lädt bei Änderungen automatisch neu.
  Einschließlich dieses externen Änderungsfalls und der automatischen Entfernung übernommener Karten aus der
  manuellen Pflege sind jetzt zehn Explorer-Tests erfolgreich.
  Ein Fehler bei der Modusübergabe ließ die Bereinigung zunächst fälschlich `update.mjs --mode=undefined` starten.
  Seit 2026-06-20 trägt der Bereinigungsplan ausdrücklich `mode: cleanup`. Zusätzlich bietet der Art-Löschdialog eine
  Checkbox, um die generierten Daten und Assets der gewählten Art sofort dauerhaft mitzulöschen.
  Dialoge schließen bei Textmarkierungen über den Fensterrand nicht mehr versehentlich; die sichere
  Hintergrundklick-Erkennung gilt auch beim erneuten Anlegen einer Art.
  Soundwiedergaben des Asset-Prüfdialogs stoppen beim Schließen automatisch und werden auf Position 0 zurückgesetzt.
  Ergänzt wurden zwei Wartungsläufe ohne vollständigen Datenabruf: `Manuelle und fehlende Karten erneut suchen`
  für manuell geschützte und fehlende Karten sowie `NC- und fehlende Sounds erneut suchen` für die drei aktuellen NC-Sounds
  sowie fehlende Sounddateien. Bestehende Dateien werden bis
  zur Übernahmeentscheidung lokal gesichert. Abgelehnte Soundquellen werden unter `sound.rejectedSources` gespeichert
  und in spaeteren Suchlaeufen uebersprungen; pro Art koennen beliebig viele Quellen abgelehnt werden. Nach erfolgreichem Pipeline-Push verschwindet die Zwischenmeldung des
  ursprünglichen Art-Speicherschritts. Der Pipeline-Dialog bleibt nach dem Start geöffnet und zeigt eindeutig
  `Pipeline-Lauf läuft gerade`. Der bisherige Button `Abbrechen` wechselt dann zu `Fenster schließen`; der Lauf
  wird beim Schließen nicht beendet. Ein dauerhafter Balken im Hauptfenster zeigt auch nach dem Schließen den
  laufenden, wartenden, abgeschlossenen oder fehlgeschlagenen Status und öffnet die Details erneut.
  Beim ersten produktiven Kartensuchlauf wurden Großtrappe, Kernbeißer und Reh als funktionierende automatische
  Karten übernommen. Sie sind seit 2026-06-20 nicht mehr manuell geschützt; fünf manuelle Karten bleiben. Das
  JSON-Register ist bei einer ausdrücklichen Pflegeentscheidung maßgeblich und synchronisiert die Markdown-Liste.
  Ein am 2026-06-27 geprüfter Hänger nach finaler Erfolgsausgabe wurde behoben: `update.mjs` leert stdout/stderr und
  beendet den Prozess danach explizit, damit der Explorer den Lauf als abgeschlossen erkennt und die Assetentscheidung
  anzeigen kann.
  Seit 2026-06-29 schliessen `X`, `Abbrechen` und `Fenster schliessen` die Datenbank- und Einstellungsdialoge
  wieder korrekt; laufende Prozesse bleiben im Hintergrund aktiv. Der IUCN-Kartenabruf prueft neben dem direkten
  Endpunkt eine Fallback-Strategie fuer gecachte Einzelkarten. Seit 2026-07-02 versucht `update.mjs` zuerst den
  bisherigen IUCN-Web-Endpunkt mit browsernahen Headern, danach den offiziellen IUCN-API-Host mit Token und
  extrahiert signierte Backblaze-Links aus Redirect-, HTML- und Fehlerantworten als `cached-individual-maps`-URL.
  Wenn Node lokal HTTP 403 erhält, nutzt die Pipeline unter Windows zusätzlich `Invoke-WebRequest` als
  WebRequest-Fallback, weil derselbe IUCN-Endpunkt dort die JPEG-Karte ausliefert. Wenn lokal trotzdem kein direkt
  speicherbarer Link geliefert wird, kann der im Browser sichtbare signierte Backblaze-JPEG-Link weiterhin im
  Kartenimport als Quellen-URL eingefügt und geprüft werden. Seit 2026-07-01 bietet der Karten-Bearbeitungsdialog
  dafür direkt `IUCN-Karte im Browser öffnen`; ein versteckter Electron-/Chromium-Fallback wird nicht genutzt, weil
  Headless-Browserprozesse auf dem Zielsystem mit Anwendungsfehlern abbrechen können. Derselbe URL-Workflow steht im Neue-Art-Assistenten in Schritt `Karte` zur
  Verfügung, damit eine neue Art ohne Wechsel in den allgemeinen Bearbeitungsdialog vollständig mit Karte
  abgeschlossen werden kann. Karten-Vorschauen skalieren hochformatige IUCN-Karten vollständig in die verfügbare
  Breite ein, statt den unteren Kartenbereich abzuschneiden. Nach einem manuellen Kartenimport wird der Report sofort
  neu aufgebaut und zusammen mit Karte, Register und Dokumentation veröffentlicht. Seit 2026-07-02 kann
  `Automatisch suchen` im Karten-Bearbeitungsdialog für jede vorhandene Art gestartet werden, auch wenn bereits eine
  automatisch gepflegte Karte vorhanden ist. Wenn der Pipeline-Lauf eine Karte speichert, zeigt der Explorer die
  Pflegeentscheidung auch dann an, wenn die gespeicherte Datei bytegleich zur bisherigen manuell gepflegten Karte ist.
  Dadurch können Backblaze-übernommene Karten nach erfolgreichem automatischem Abruf wieder auf automatische Pflege
  zurückgestellt werden. Bei gezielten Kartenläufen zeigt der Asset-Prüfdialog die bisherige und die gefundene Karte
  nebeneinander; beide Karten können einzeln vergrößert werden.
  Seit 2026-06-28 verschiebt die Bereinigung verwaiste Assetordner zuerst nach
  `species-explorer/cleanup-trash/`, schreibt danach Daten und Report und loescht die verschobenen Ordner erst
  anschliessend endgueltig. Seit 2026-06-30 werden kurze Windows-Dateisperren beim Verschieben mehrfach erneut
  versucht und danach per kontrolliertem Kopieren/Original-Loeschen abgefangen. Dadurch bleibt der Report auch bei
  Windows-Dateisperren konsistent. Seit 2026-07-01 kann der Löschdialog auch einen teilbereinigten Zwischenzustand
  ohne `species_list.json`-Eintrag, aber mit verbliebenen generierten Daten oder Assets direkt dauerhaft bereinigen.
  Bei aktivierter Sofortloeschung wird zuerst diese dauerhafte Bereinigung ausgefuehrt und erst danach der Eintrag
  aus `species_list.json` entfernt. Wenn Windows den Assetordner sperrt, bricht der Vorgang ab und die Art bleibt
  vollstaendig in der Eingabeliste.
  Vor der Löschung entlädt die Oberfläche alle Detailmedien und wartet bei Sofortloeschung kurz, damit Windows keine
  produktiven Assetdateien sperrt.
  Frühere Löwe-Testzwischenstände können über den Löschdialog vollständig bereinigt werden; aktuell ist Löwe wieder
  produktiv angelegt und der Explorer meldet 47/47 Arten.
  Beim gezielten Sound-Alternativlauf im Bearbeitungsdialog und vor globalen `nc-sounds`-Läufen werden alle
  Audioplayer entladen; der aktuelle Bearbeitungsplayer wird aus dem DOM ersetzt und kurz freigegeben, damit eine
  pausierte Vorschau unter Windows keine produktive MP3-Dateisperre hält. Temporäre Pipeline-Backupordner, die
  Windows nach erfolgreichem Commit/Push noch sperrt, werden nur noch als Warnung protokolliert und machen den Lauf
  nicht mehr nachträglich fehlgeschlagen. Beim späteren Übernehmen einer neuen Soundalternative bleiben bereits
  gespeicherte `sound.rejectedSources` erhalten. Nach still gestarteten Sound-Alternativläufen aktualisiert der
  offene Tierstimmen-Bearbeitungsdialog aktuellen Sound und Credits aus dem neu geladenen Modell. Der Sound-
  Prüfdialog bleibt nach einer Ablehnung geöffnet und zeigt den nächsten Kandidaten im selben Fenster. Die
  Detailansicht verwendet versionsbasierte lokale Asset-URLs, damit Sound und Spektrogramm nach schnellen
  Austausch-/Ablehnzyklen nicht aus unterschiedlichen Browsercache-Ständen stammen.
- 7.7 Asset-Verwaltung: abgeschlossen und von Felix freigegeben am 2026-06-21, siehe
  `docs/asset-management-plan.md`.
  Das maschinenlesbare Override-Register und der Pipeline-Schutz sind vorhanden. 7.7.2 Kartenverwaltung ist
  technisch lokal umgesetzt: JPEG bis 20 MB als Datei oder direkter signierter JPEG-Link,
  Signatur-/Struktur-/Abmessungsprüfung, Alt-/Neu-Vorschau, Quelle, Pflegegrund, Staging, Vorschau-Token, Schutz
  gegen parallele Änderungen, atomarer Austausch und manuelle
  Kennzeichnung. Pro Art bleiben höchstens drei Kartenbackups erhalten; global gilt 500 MB. Nach erfolgreichem
  Speichern bleiben Karte, Override-Register, Kartendokumentation und Report lokal vorgemerkt und werden ueber
  `Änderungen übertragen` gemeinsam committed und gepusht. Beim Prüfen
  wird die neue Karte vollständig in den Vorschau-Rahmen eingepasst. `Bearbeiten` steht seit 2026-06-30 direkt an den
  Bereichen Manuelle Daten, Artporträt, Verbreitungskarte und Tierstimme; der Dialog zeigt jeweils nur den gewählten
  Bereich. Gezielte Soundalternativen überspringen die aktuelle Quelle temporär und prüfen nach freien Treffern auch
  die Xeno-Canto-Fallback-Stufen.
  7.7.3 Sound-/Credits-Verwaltung ist technisch lokal umgesetzt: MP3 bis 50 MB, Pflichtcredits, Alt-/Neu-Wiedergabe,
  NC-Hinweis, Staging, Vorschau-Token, paralleler Änderungsschutz und gemeinsames Backup von Sound, Credits und
  Spektrogramm. 7.7.4 ist technisch umgesetzt: Vor dem Austausch wird das neue Spektrogramm automatisch erzeugt
  und als WebP geprüft. Bei einem Fehler bleiben alle Produktivdateien unverändert. Sound- und Spektrogramm-SHA-256
  werden registriert und vom Explorer gegen die aktuellen Dateien geprüft. Der Bestand ist migriert; 45 von 45
    Spektrogrammen sind verifiziert und keines ist veraltet. Unveränderte Generatorläufe bleiben ohne Dateidiff.
    Die betroffenen Assetpfade werden ueber `Änderungen übertragen` gesammelt committed und gepusht.
    Seit 2026-06-28 kann im Bearbeitungsdialog der aktuell produktive Sound abgelehnt werden. Der Explorer sichert
    das Soundpaket, entfernt `sound.mp3`, `credits.json` und `spectrogram.webp`, speichert die Quellkennung unter
    `sound.rejectedSources`, baut den Report neu auf und merkt die Änderung lokal vor. Spaetere Sound-Suchlaeufe schlagen
    dieselbe Quelle nicht erneut vor. Fehlende oder manuell geschützte Karten sowie fehlende/NC-Sounds koennen im
    Bearbeitungsdialog gezielt je Art gesucht werden. Seit 2026-06-30 kann bei vorhandenem akzeptiertem Sound im
    Bearbeitungsdialog auch gezielt eine Alternative gesucht werden. Der aktuelle Sound ist dort abspielbar; im
    Asset-Review stehen bisheriger Sound und gefundener Kandidat nebeneinander, jeweils mit eigenem Player und
    Spektrogramm. Ein gezielter Alternativlauf ueberspringt die aktuell gespeicherte Quelle temporaer, damit nicht
    derselbe Sound erneut vorgeschlagen wird. Diese Suche startet als stiller Hintergrundlauf ohne das
    Bearbeitungsfenster oder die Desktop-App zu schliessen und ohne den allgemeinen Datenbank-Aktionen-Dialog
    einzublenden. Neu gefundene Sounds werden mit eindeutiger Lizenzkennzeichnung `NC` oder `frei` angezeigt; Klick
    ins jeweilige Spektrogramm setzt die passende Wiedergabeposition. Kandidaten, die wegen Download-, Format- oder
    Transcode-Problemen nicht uebernommen werden koennen, beenden die Suche nicht mehr; die Pipeline prueft dann die
    naechste Quelle. Eine Windows-Dateisperre auf der produktiven MP3 wird als eigener Warnzustand gemeldet.
    Seit 2026-06-27 werden Arten ohne automatisch auffindbare Tonquelle als Hinweis `S` geführt. Beispiel:
    `Grüner Leguan`. Sound, Credits und Spektrogramm fehlen dort bewusst und zählen nicht als Assetproblem.
    Offene UI-Wünsche nach 2026-07-02: einzelne Assets einer Art gezielt löschen; deutschen Artnamen bei
    unverändertem wissenschaftlichem Namen/Slug umbenennen inklusive Mitnahme von Assetname/SafeName, Assetordner,
    Override-Einträgen und Dokumentation; allgemeine Daten im Bearbeitungsdialog in strukturierte
    Männchen-/Weibchen-Felder wie im Neue-Art-Assistenten aufteilen.
  7.7.5 Artporträt ist seit 2026-06-21 technisch als kostenfreier manueller Workflow umgesetzt. Die zuvor
  vorbereitete kostenpflichtige OpenAI Image API wurde vollständig entfernt. Der Explorer erzeugt den
  versionierten Prompt `1.1.0` lokal, kopiert Einzelprompts und importiert anschließend ein im
  vorhandenen ChatGPT-Zugang erzeugtes PNG, JPEG oder WebP. Dateisignatur, mindestens 800×1000 Pixel und
  4:5-Seitenverhältnis werden geprüft; FFmpeg vereinheitlicht das Produkt auf `1280x1600` WebP. Bei bestehenden
  Arten führt `Artporträt übernehmen` nach der manuellen Art- und Anatomieprüfung lokale Speicherung und Backup aus;
  veroeffentlicht wird gesammelt ueber `Änderungen übertragen`. Beim optionalen Sofortportrait einer neu angelegten Art wird ein geprüftes Portrait im
  Neue-Art-Assistenten ohne zusätzliche Electron-Bestätigung lokal übernommen. Fehlende Porträts sind reguläre
  Assetprobleme: Gesamtvalidierung und Datenbankstatus werden rot,
  die Assetstruktur zeigt die genaue Fehlanzahl und betroffene Arten erhalten die Listenmarkierung `P`. Sie sind
  über `Fehlendes Artporträt` filterbar. Der Sammelprompt-/Datenbankdialog für alle fehlenden Portraits wurde am
  2026-06-27 entfernt, weil ChatGPT daraus wiederholt Collagen oder Mehrfachbilder erzeugte.
  Version `1.1.0` verbietet Collagen, Raster und Mehrfachansichten ausdrücklich.
  Explorer-Tests sind erfolgreich. Der Neue-Art-Dialog kann seit 2026-06-27 aus den eingegebenen neuen Artdaten
  einen Einzelprompt erzeugen und ein optional sofort erzeugtes Bild nach der Artanlage prüfen und übernehmen.
  Der erste produktive Einzelimport fuer `Alpenbirkenzeisig` wurde am
  2026-06-21 gespeichert, committed und gepusht. Vorhandene Portraits behalten dieselbe feste Zellenhoehe wie der
  leere Platzhalter und werden vollstaendig eingepasst; eine Vergroesserung erfolgt nur in der Lightbox. Die
  abschliessenden Rahmen-, Listen- und Medienlayouts wurden visuell nachgebessert und von Felix akzeptiert.
  Squarespace bleibt bewusst ein spaeterer eigener Ausgabeschritt. Details:
  `docs/portrait-generation.md`.
  Löschen, Pipeline-Start und automatische Lizenzfreigabe bleiben außerhalb von 7.7.
  Die Desktop-Formulare für Karte und Sound sind seit 2026-06-21 über feste Grid-Bereiche ausgerichtet:
  gleich hohe Dateieingaben, Pflegegrund über zwei linke Zeilen sowie Ort bündig mit Qualität. Mobile bleibt
  einspaltig.
- 7.8 Browserunabhängiger Desktop-Wrapper für die gesamte App: abgeschlossen und von Felix erfolgreich getestet am 2026-06-28.
  Der Wrapper startet den bestehenden Explorer-Server im Electron-Hauptprozess, wartet auf `/api/summary` und zeigt
  die bestehende Oberfläche in einem eigenen App-Fenster. Chrome und das manuelle Öffnen von `127.0.0.1:4177`
  entfallen im Normalbetrieb. Start: `npm.cmd run species:desktop`. Der direkte Servermodus
  `npm.cmd run species:explorer` bleibt für Debugging erhalten. Umgesetzt sind Single-Instance-Schutz,
  Port-4177-Fallback auf freien Port, externe Links im Standardbrowser, Server-Neustart bei Startfehlern, eine
  Desktop-Verknüpfung per `npm.cmd run species:desktop:shortcut` und eine
  Schließabfrage bei laufendem Pipeline-/Asset-Prüfschritt. Der Desktop-Lifecycle ist im Explorer-Test abgedeckt;
  `npm.cmd run --silent test:explorer` läuft mit 19 Tests. Details: `docs/desktop-shell-plan.md`.
  Seit 2026-06-27 meldet der direkte Browser-/Servermodus einen bereits laufenden Explorer verständlich mit der
  bestehenden URL statt mit einem rohen `EADDRINUSE`-Stacktrace abzubrechen.
- 7.8.1 Projektkonsolidierungs-Audit vor NAS/Mehrgeraete: gestartet am 2026-06-28, siehe
  `docs/project-consolidation-audit.md`. Ergebnis: kein kritischer Blocker fuer 7.9. Bereinigungskandidaten sind
  `Testlauf/`, `errors.log` und ein alter `species-explorer/pipeline-asset-backups/`-Lauf. Strukturkandidaten waren
  die Dependency `node-fetch`, Log-/Temp-Retention und das spaetere FFmpeg-/Installer-Konzept.
  Nach Felix' Freigabe wurden `Testlauf/`, `errors.log` und `species-explorer/pipeline-asset-backups/` geloescht.
  `node-fetch` wurde aus `package.json` und `package-lock.json` entfernt; ein danach gefundener Pipeline-Importfehler
  wurde durch Umstellung von `update.mjs` auf natives Node-`fetch` korrigiert. Node.js 18 oder neuer ist damit
  Voraussetzung. Tests, JS-/MJS-Syntax und lokaler Site-Audit sind danach erfolgreich.
- 7.9 Synology NAS, Mehrgeraete und automatisiertes Backup: gestartet am 2026-06-28, siehe
  `docs/multi-device-backup-plan.md`. Beschlossen ist: GitHub bleibt zentrale versionierte Wahrheit, die App
  bearbeitet lokale Projektordner pfadunabhaengig, NAS wird als vollstaendiges ZIP-Restore-Backup genutzt und der
  Bearbeitungs-Lock liegt spaeter in einem separaten `app-lock`-Branch statt in `main`. Der erste technische
  Baustein ist `restore-start.cmd`: Nach dem Entpacken eines NAS-Backups prueft das Skript Node.js 18+, richtet die
  Desktop-Verknuepfung ein und startet die App. Als NAS-Zielpfad wurde `W:\Website Datenbank Backup` festgelegt.
  Der Backup-Kern ist als `scripts/nas-backup.ps1` mit `npm.cmd run backup:nas:dry-run` und
  `npm.cmd run backup:nas` vorbereitet. In der Desktop-App ist `NAS-Backup erstellen` als manuelle Wartungsaktion im
  Datenbank-Dialog eingebunden: Vorschau mit Zielpfad, Umfang und Rotation, Start per Klick, Fortschritt in Prozent,
  Prozessausgabe, Abschlussmeldung und Schliesswarnung bei laufendem Backup. Der lokale Zielpfad kann in der App ueber
  `Backup-Pfad einstellen` geaendert werden und liegt nicht versioniert in `species-explorer/local-settings.json`.

## Phase 8 - Ausbau

Status: geplant

- Affiliate-Links auf relevanten Seiten vorbereiten und kennzeichnen.
- Shop-/Kalender- oder Verkaufsintegration konzeptionell und technisch pruefen.
- Rechtliche Folgepruefung nach neuen externen Diensten, Affiliate-Links, Shopfunktionen oder Zahlungs-/Bestellwegen
  durchfuehren.
- Optional: Soundzuschnitt für manuelle oder automatisch gefundene Tierstimmen planen. Ziel wäre Start- und Endpunkt
  im Spektrogramm zu setzen und daraus lokal ein finales MP3 samt neuem Spektrogramm zu erzeugen.
