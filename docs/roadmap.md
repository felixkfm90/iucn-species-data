# Roadmap

Stand: 2026-06-15

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
  `docs/add-species-workflow.md` dokumentiert. Am 2026-05-28 wurde die Pipeline ohne neue Arten durchgefuehrt:
  45 Arten, 45 Karten, 45 Soundordner, 45 MP3s, 45 Credits, keine fehlenden Kernassets.
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
  Ergebnis: Der aktuelle Aufbau bleibt bestehen, weil alle Kernassets konsistent vorhanden sind und Live-Pfade stabil
  laufen. Artweise Buendelung ist technisch moeglich, aber nur als spaetere bewusste Migration mit Parallelbetrieb,
  Loader-/Pipeline-Anpassung und Live-Test sinnvoll.

## Phase 6 - Funktionsueberarbeitung

Status: in Arbeit

Ziel: Die bestehenden Funktionen weiter professionalisieren, ohne den stabilen Live-Betrieb durch grosse Umbauten ohne
Testpfad zu gefaehrden.

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
- Buendelung der Assets pro Art erneut aufgreifen:
  - Grundlage ist `docs/asset-structure-plan.md`
  - erst mit Parallelbetrieb, Fallbacks und Live-Test migrieren
  - keine produktiven Pfade nebenbei verschieben
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
  `sounds/<SafeName>/spectrogram.webp`; keine Browser-Liveberechnung, keine Frontend-Aenderung ohne separaten Patch.
- 6.5 Spektrogramm-Generator-Prototyp bauen: erledigt am 2026-06-15.
  `scripts/generate-spectrograms.mjs` und `npm.cmd run --silent generate:spectrograms` scannen
  `sounds/<SafeName>/<SafeName>.mp3`, unterstuetzen Dry-Run, Einzelarten, Testausgabe nach `Testlauf/`, `--force`,
  WebP/PNG und ffmpeg per PATH, `FFMPEG_PATH` oder `--ffmpeg=<Pfad>`.
  Dry-Run und echte Testausgabe sind erfolgreich getestet. Am 2026-06-15 wurden fuer `Amsel`, `Graugans` und
  `Bisamratte` temporare WebP-Testausgaben nach `Testlauf/spectrograms` erzeugt. Der bevorzugte Zielstil ist jetzt
  im Generator-Default abgebildet: heller Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben und unten,
  Frequenzbereich bis 18 kHz. Die produktive Erzeugung und Frontend-Integration wurde anschliessend in 6.6 umgesetzt.
- 6.6 Spektrogramme produktiv erzeugen und Soundbar integrieren: erledigt am 2026-06-15.
  Es wurden 45 `sounds/<SafeName>/spectrogram.webp`-Assets erzeugt, Gesamtgroesse ca. 1,22 MB. `species-sound.js`
  laedt die Spektrogramme optional per `HEAD` und zeigt sie mit rotem Positionsmarker und vorhandener Bedienlogik an.
  Wenn ein Spektrogramm fehlt oder nicht geladen werden kann, bleibt die bisherige Canvas-Wellenform als Fallback
  aktiv. Nach Sichtpruefung wurde der Default auf `stop=18000`, `drange=80`, `gain=3` angepasst, damit auch leisere
  und hochfrequentere Arten sichtbar bleiben. Die aktuelle Squarespace-Footer-Version fuer den Live-Betrieb steht in
  6.7.
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
  ganze Button optisch leicht nach unten versetzt, ohne das Control-Grid umzubauen.
  Squarespace-Footer-Version fuer den Live-Betrieb: `species-sound.js?v=1.0.17`.

## Phase 7 - Desktop-App / Arten-Explorer

Status: geplant

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

## Phase 8 - Ausbau

Status: geplant

- Affiliate-Links auf relevanten Seiten vorbereiten und kennzeichnen.
- Shop-/Kalender- oder Verkaufsintegration konzeptionell und technisch pruefen.
- Rechtliche Folgepruefung nach neuen externen Diensten, Affiliate-Links, Shopfunktionen oder Zahlungs-/Bestellwegen
  durchfuehren.
