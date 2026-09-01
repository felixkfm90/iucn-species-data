# Machbarkeitsstudie: Lightroom-Classic-Integration

Stand: 2026-09-01
Roadmap: Phase 10.1  
Status: Phase 10.1 abgeschlossen; Suchpaket, produktive Zuweisung und Ausbau bis Plug-in-Version 0.4.21.3 sind unter
`docs/lightroom-search-package.md` dokumentiert

## 1. Ziel und Ergebnis

Der Arten-Explorer kann sinnvoll um ein eigenes deutschsprachiges Lightroom-Classic-Plug-in erweitert werden.
Das Plug-in soll die vollständige aktive lokale Masterdatenbank durchsuchen und ausgewählte Fotos kontrolliert mit
den dort geprüften Artnamen und Taxonomiedaten versehen. Die jeweilige Art muss dafür nicht bereits im
Arten-Explorer angelegt sein. Das Plug-in bleibt ein Lightroom-Werkzeug und wird keine zweite fachlich pflegbare
Taxonomiedatenbank.

Die Machbarkeit ist für ein eng begrenztes MVP bestätigt. Empfohlen wird:

- ein natives Lightroom-Classic-Plug-in in Lua;
- ein vollständiges, versioniertes und vom Arten-Explorer erzeugtes read-only Suchpaket des aktiven
  Taxonomie-Masters;
- vollständig lokale Suche über alle Taxa sowie alle vorhandenen deutschen, englischen und wissenschaftlichen
  Namen;
- eine Vorschau vor jeder Metadatenänderung;
- Übernahme des vollständigen verfügbaren Taxonomiepfads als stabile Plug-in-Metadatenfelder und eindeutig mit
  `(FN)` markierte, flache Lightroom-Stichwörter;
- gemeinsame Zuordnung einer ausgewählten Art zu einem oder beliebig vielen markierten Fotos;
- keine direkte Änderung der Lightroom-Katalogdatei, der Master-SQLite oder von XMP-Dateien außerhalb der
  Lightroom-Schnittstellen.

Nicht Bestandteil des ersten MVP waren automatische Bilderkennung, iNaturalist-Beobachtungssynchronisation und
Lifelist-Statistik. Lifelist-Statistik, Smart-Sammlungen und ein `Favoritenbild der Art` wurden inzwischen kontrolliert
ergänzt. Automatische Bilderkennung und iNaturalist-Beobachtungssynchronisation bleiben spätere, getrennt zu
bewertende Erweiterungen. Die vollständige Offline-Suche über den bereits aufgebauten Taxonomie-Master bleibt die
verbindliche Grundlage.

## 2. Geprüfte lokale Umgebung

Auf dem Entwicklungsrechner ist Lightroom Classic 15.5 installiert. Die Planung zielt zunächst auf diese reale
Windows-Umgebung. Ein späterer Installer muss unterstützte Lightroom-Versionen ausdrücklich prüfen und darf keine
festen Installations- oder Projektpfade voraussetzen.

Der vorhandene aktive Taxonomie-Master ist für Lightroom als direkte Datenquelle ungeeignet:

- aktive und vorherige SQLite-Version belegen jeweils mehrere GiB;
- Speicherpfad, Aktivierungszeiger und Rollback gehören dem Arten-Explorer;
- ein direkter Zugriff würde Lightroom an internes Schema, native SQLite-Unterstützung und Dateipfade koppeln;
- ein direkter Zugriff würde Suchbetrieb und Taxonomieaktualisierung unnötig miteinander koppeln.

Trotzdem muss das Plug-in den vollständigen Master durchsuchen können. Deshalb wird aus jeder aktivierten
Masterversion ein abgeleitetes, kompaktes und unveränderliches Lightroom-Suchpaket erzeugt. Es ist keine zweite
fachlich pflegbare Datenbank, sondern ein jederzeit reproduzierbarer Suchindex mit genau derselben Version und
Provenienz wie der aktive Master.

## 3. Technische Möglichkeiten und Grenzen des Lightroom SDK

Das offizielle Lightroom-Classic-SDK unterstützt Lua-Plug-ins, eigene Dialoge und Menüpunkte sowie öffentliche
oder private Metadatenfelder je Foto. Damit sind Artensuche, Vorschau, Stapelverarbeitung und kontrollierte
Metadatenübernahme grundsätzlich möglich.

Das Plug-in soll ausschließlich dokumentierte Lightroom-Schnittstellen verwenden:

- ausgewählte Fotos über den Katalog lesen;
- Änderungen in einer Lightroom-Schreibtransaktion ausführen;
- Lightroom-Schlüsselwörter anlegen und Fotos zuweisen;
- eigene Plug-in-Metadatenfelder pflegen;
- Fortschritt, Abbruch, Ergebnis und Konflikte in der Lightroom-Oberfläche anzeigen.

Nicht zulässig im Projektkonzept sind:

- direkte Schreibzugriffe auf eine `.lrcat`-Datei;
- direkte XMP-Manipulation parallel zu Lightroom;
- direkte Bearbeitung der Explorer-Masterdatenbank;
- Änderungen an Bewertung, Farblabel, GPS, Titel oder Beschreibung ohne eine spätere ausdrücklich freigegebene
  Funktion.

Lightroom speichert Metadaten grundsätzlich im Katalog. Das Schreiben in XMP hängt von Lightroom-Einstellungen und
Benutzeraktionen ab. Bei proprietären RAW-Dateien entstehen Sidecars, während unterstützte Nicht-RAW-Formate
Metadaten auch eingebettet tragen können. Deshalb bleibt Lightroom alleiniger Besitzer dieses Ablaufs.

## 4. Vergleich der genannten Lösungen

### 4.1 iNat Publish Pro

Beobachtete Schwerpunkte:

- Übernahme von Namen, Taxonomie, GPS und iNaturalist-Prüfstatus;
- Zuordnung von Beobachtungen und Fotos über Aufnahmezeit und Entfernung;
- Stapelverarbeitung;
- lokal gespeicherter iNaturalist-Token.

Sinnvolle Inspiration:

- nachvollziehbarer Vergleich statt stiller Zuordnung;
- späterer optionaler Abgleich eigener iNaturalist-Beobachtungen;
- Ergebnisqualität und Zuordnungsgrund sichtbar machen;
- große Stapel mit Fortschritt, Abbruch und Zusammenfassung verarbeiten.

Nicht für das MVP übernehmen:

- iNaturalist als konkurrierende Taxonomiequelle in Lightroom;
- automatische Änderung vorhandener GPS-Daten;
- zwingende Internetverbindung oder Tokenpflicht;
- Zeit-/GPS-Zuordnung, bevor das manuelle Verschlagworten stabil funktioniert.

Begründung: Die lokale Masterdatenbank ist bereits die verbindliche Taxonomiegrundlage. Beobachtungsabgleich ist
ein eigener Workflow mit Datenschutz-, Konflikt- und Fehlzuordnungsfragen.

### 4.2 LifeListXP

Beobachtete Schwerpunkte:

- wiederverwendbare taxonomische Dateneingabe im Bibliotheksmodul;
- lokale Datenhaltung ohne zwingenden externen Dienst;
- Lifelist-, Statistik- und Sammlungsfunktionen;
- Konflikt- beziehungsweise Änderungsnachverfolgung.

Sinnvolle Inspiration:

- einmal ausgewählte Art auf viele Fotos anwenden;
- konsistente lokale Taxonomiemetadaten;
- später Smart Collections und Lifelist-Auswertungen aus bestätigten Metadaten erzeugen;
- bestehende Werte vor Änderungen vergleichen.

Nicht für das MVP übernehmen:

- manuelle doppelte Pflege einer Lightroom-eigenen Artenliste;
- Statistik vor einem stabilen Metadatenmodell;
- eigene Taxonomieentscheidungen innerhalb Lightroom.

Begründung: Der Arten-Explorer muss alleinige Stammdatenquelle bleiben. Statistik ist wertvoll, aber erst belastbar,
wenn Art-ID und Metadatenschema dauerhaft feststehen.

### 4.3 Nomen

Beobachtete Schwerpunkte:

- lokale KI-gestützte Artbestimmung ohne Foto-Upload;
- GPS-abhängige Eingrenzung;
- Prüfung unsicherer Treffer durch den Menschen;
- Namen, Beschreibungen, Schlüsselworthierarchien und eigene Metadatenfelder;
- lokale Artenpakete und Stapelverarbeitung.

Sinnvolle Inspiration:

- Offline-Betrieb als Grundregel;
- menschliche Bestätigung vor dem Schreiben;
- klar strukturierte Schlüsselworthierarchie;
- bereits bearbeitete Fotos erkennen und kontrolliert überspringen;
- modulare Pakete statt einer unnötig großen Lightroom-Datenkopie.

Nicht für Phase 10 einplanen:

- eigenes universelles KI-Modell zur Artbestimmung;
- automatische Bewertungen, Farblabel oder Bildbeschreibungen;
- mehrere GiB Modell- und Artenpakete im ersten Installer.

Begründung: Bilderkennung bringt Training, Modelllizenzen, Hardwareabhängigkeit, regionale Genauigkeit,
Modellupdates und einen wesentlich größeren Supportumfang mit. Sie ist ein eigenständiges späteres Projekt und
nicht Voraussetzung für verlässliche Taxonomieverschlagwortung.

### 4.4 Species Tagger

Beobachtete Schwerpunkte:

- sichtbare externe Bildrecherche statt unkontrollierter automatischer Entscheidung;
- anschließende Normalisierung gegen GBIF;
- flache, hierarchische oder kombinierte Schlüsselwörter;
- Mehrfachauswahl, Überspringen, manuelle Korrektur und Serienunterstützung.

Sinnvolle Inspiration:

- Auswahl und Bestätigung bleiben beim Menschen;
- Artname und vollständige Hierarchie gemeinsam vorschauen;
- konfigurierbare Schlüsselwortstruktur;
- Stapelaktionen mit Überspringen und Rücknahme;
- später optional ein sichtbarer Recherchelink für unbekannte Arten.

Nicht für das MVP übernehmen:

- Google Lens oder einen bestimmten Browser als Pflicht;
- automatisiertes Auslesen fremder Bilderkennungsseiten;
- GBIF als zweite, ungeprüfte Taxonomiequelle im Plug-in.

Begründung: Browser- und Drittanbieterabhängigkeit schwächen Offline-Betrieb und Reproduzierbarkeit. Die
Normalisierung muss bereits im Explorer-Master erfolgen.

## 5. Vergleich der Datenzugriffswege

| Variante | Vorteile | Nachteile | Entscheidung |
| --- | --- | --- | --- |
| Direkter Zugriff auf Master-SQLite | vollständiger Bestand, keine Exportkopie | native SQLite-Anbindung in Lua, mehrere GiB, Schema-/Pfadkopplung, Sperr- und Updatefragen | für das MVP verworfen |
| Lokale Explorer-API | aktueller Master, zentrale Suchlogik | Explorer muss laufen; Port-, Firewall-, Start- und Mehrgerätefragen | als Pflichtweg verworfen |
| Kleine JSON-Datei nur mit Projektarten | sehr klein und einfach | keine Suche nach noch nicht angelegten Arten; erfüllt den Anwendungsfall nicht | verworfen |
| Vollständiges abgeleitetes Suchpaket plus lokale Suchhilfe | alle Mastertaxa offline, read-only, atomar austauschbar, vom Explorer unabhängig | zusätzlicher Export- und Hilfsprozess; Größe und Startzeit müssen gemessen werden | verbindliche MVP-Empfehlung |

Das Suchpaket wird durch den Arten-Explorer aus dem aktiven Master erstellt. Lightroom liest es ausschließlich.
Eine fehlende oder veraltete Datei wird verständlich gemeldet; das Plug-in verändert sie nicht. Wegen des Umfangs
von mehreren hunderttausend Taxa und mehr als einer Million Namen darf das Lua-Plug-in nicht bei jedem Start eine
große JSON-Datei vollständig laden. Phase 10.2 verwendet deshalb einen kompakten SQLite-Suchindex mit
Volltextindex und eine kleine lokale, vom Plug-in gestartete read-only Suchhilfe. Der Arten-Explorer selbst muss für
die Suche nicht geöffnet sein.

Empfohlener lokaler Pfad:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\lightroom\
  active\manifest.json
  active\taxonomy-search.sqlite
  previous\manifest.json
  previous\taxonomy-search.sqlite
```

Dieser Pfad ist der implementierte Standard für Phase 10.2, aber über Suchhelfer- und Plug-in-Einstellung
überschreibbar. Der spätere Installer und die Mehrgerätephase können ihn deshalb konfigurieren.

## 6. Umgesetzter Suchpaketvertrag

Das Manifest des Suchpakets enthält:

- `schemaVersion`
- `generatedAt`
- `projectRevision`
- `masterVersion`
- `masterActivatedAt`
- `taxonCount`
- `nameCount`
- `hierarchyCount`
- `checksum`

Je Taxon mindestens:

- stabile `masterTaxonId`
- optionale `projectSpeciesId`, sofern die Art bereits im Explorer angelegt ist
- deutscher, englischer und akzeptierter wissenschaftlicher Name
- alle suchbaren Synonyme und bestätigten alternativen Namen samt Sprache und Herkunft
- Rang und vollständige verfügbare Hierarchie in fachlicher Reihenfolge, einschließlich zusätzlicher Ober-, Unter-
  und Zwischenränge, sofern sie im Master vorliegen
- Taxonomiestatus, zum Beispiel `col_confirmed`, `external_confirmed` oder `manual_protected`
- Herkunft und verwendete Anbieterstände
- Projekt-Slug nur als Referenz, nicht als dauerhafte Identität

Das Suchpaket enthält alle Taxa und Namen der aktiven Masterdatenbank. Bereits angelegte Explorer-Arten werden nur
zusätzlich markiert; sie begrenzen den Suchumfang nicht. Der Index wird nach einer Masteraktivierung atomar erzeugt
und erst nach Schema-, Zähler- und Prüfsummenprüfung als `active` freigegeben. Die vorherige Version bleibt als
Rollback erhalten.

## 7. Lightroom-Metadatenmodell

### 7.1 Hierarchische Schlüsselwörter

Empfohlene Struktur:

```text
FN Wildlife & Travel
└── Taxonomie
    └── Reich
        └── Stamm
            └── Unterstamm (nur wenn vorhanden)
                └── Klasse
                    └── Ordnung
                        └── Familie
                            └── Gattung
                                └── Art
```

Ränge, die für eine Art fehlen, werden ausgelassen. Es werden keine Werte erfunden. Neben den üblichen Rängen muss
der Metadatenpfad alle weiteren im Master vorhandenen Ebenen in ihrer fachlichen Reihenfolge übernehmen können,
zum Beispiel Unterstamm, Überklasse, Unterklasse, Überordnung, Unterordnung, Überfamilie, Unterfamilie, Tribus,
Untergattung oder Unterart. Die wissenschaftlichen Werte bleiben erhalten; deutsche Anzeigenamen können ergänzend
in eigenen Feldern stehen.

### 7.2 Eigene Plug-in-Felder

Umgesetzte stabile Felder:

- Projekt-Art-ID, nur wenn die Art bereits im Arten-Explorer angelegt ist
- Master-Taxon-ID
- deutscher Name
- englischer Name
- akzeptierter wissenschaftlicher Name
- Taxonrang
- Taxonomiepfad
- Verschlagwortet am

Master- und Suchpaketversion sowie technische Herkunft bleiben im Paketmanifest und in Diagnoseinformationen. Sie
werden nicht als normale Fotometadaten geschrieben, weil in Lightroom nur Namen, Identität und Taxonomie relevant
sind.

Das Plug-in überschreibt keine fremden Schlüsselwörter. Vorhandene eigene Taxonomie-Schlüsselwörter werden nur
nach einer sichtbaren Konfliktvorschau geändert.

## 8. MVP-Ablauf

1. Benutzer wählt ein oder mehrere Fotos in Lightroom Classic aus.
2. `Art zuweisen` öffnet einen deutschen Dialog.
3. Die lokale Suche findet deutsche, englische und wissenschaftliche Namen über den vollständigen aktiven
   Masterbestand, unabhängig davon, ob eine Art bereits im Explorer angelegt ist.
4. Der Benutzer wählt eine Art.
5. Die Vorschau zeigt Namen, vollständige Hierarchie, betroffene Fotos und vorhandene Konflikte.
6. `Übernehmen` weist dieselbe ausgewählte Art allen aktuell markierten Fotos zu und schreibt Schlüsselwörter sowie
   Plug-in-Felder in kontrollierten Lightroom-Schreibtransaktionen.
7. Große Auswahlen werden in definierten Teilmengen verarbeitet; Fortschritt und Abbruch bleiben sichtbar.
8. Eine Zusammenfassung nennt geändert, übersprungen und fehlgeschlagen.
9. `Letzte Zuweisung rückgängig machen` entfernt auf allen betroffenen Fotos nur die vom Plug-in in diesem Lauf
   vorgenommenen Änderungen.

Beim Start prüft das Plug-in Schema und Prüfsumme des Suchpakets. Eine neue Version wird erst nach erfolgreicher
Prüfung verwendet; die vorherige Version bleibt als Rückfall erhalten.

## 9. Anforderungen an Phase 10.2 und 10.3

### 9.1 Funktionale Mindesttests

- ein Foto sowie eine gemischte Auswahl vieler Fotos mit derselben Art verschlagworten;
- Suche über deutschen, englischen und wissenschaftlichen Namen im vollständigen Master, einschließlich einer noch
  nicht im Explorer angelegten Art;
- Art mit sieben, acht und zusätzlichen Taxonomiestufen;
- Art mit CoL-Referenzlücke oder manueller Korrektur;
- bestehende fremde Schlüsselwörter bleiben unverändert;
- erneute Zuweisung derselben Art ist idempotent;
- Konflikt zwischen alter und neuer Taxonomie wird nicht still überschrieben;
- Abbruch während eines Stapels lässt einen definierten Zustand zurück;
- fehlendes, defektes oder inkompatibles Suchpaket wird verständlich gemeldet;
- Offline-Betrieb ohne laufenden Explorer;
- Rücknahme der letzten Zuweisung.

### 9.2 Performanceziele für den MVP

- Suchpaketprüfung und Start der Suchhilfe ohne merkliche Lightroom-Blockade;
- Suchreaktion im vollständigen Master nach Eingabeverzögerung praktisch unmittelbar;
- Fortschrittsanzeige bei Stapeln;
- keine vollständige Fotoanalyse und keine Bilddateikopie;
- abgeleitete Paketgröße und Speicherverbrauch werden gemessen und gegen die Master-SQLite dokumentiert.

### 9.3 Sicherheits- und Betriebsregeln

- Suchpaket ist read-only für Lightroom;
- atomarer Suchpaketwechsel und eine Rollbackversion;
- keine Tokens, Zugangsdaten oder privaten Pfade im Suchpaket;
- keine Netzwerkpflicht im Kernablauf;
- keine stillen Metadatenänderungen;
- vor dem Schreiben vollständige Vorschau und danach Protokoll;
- Plug-in-Logs enthalten keine Bildinhalte und werden begrenzt aufbewahrt;
- ein Installer prüft Lightroom-Version, Suchpaketzugriff, Hilfsprozess und Schreibrechte.

## 10. Priorisierung der Produktideen

### Für das MVP übernehmen

1. lokale Offline-Suche über sämtliche Taxa und Namen des aktiven Masters;
2. Mensch bestätigt jeden Arttreffer;
3. konsistente, eindeutig mit `(FN)` markierte Stichwörter für alle vorhandenen Taxonomiestufen;
4. stabile eigene Metadatenfelder;
5. gemeinsame Zuweisung an ein oder viele ausgewählte Fotos mit Fortschritt und Abbruch;
6. Konfliktvorschau, Überspringen und Rücknahme;
7. Paketstatus und technische Herkunft nur in der Plug-in-Diagnose sichtbar machen.

### Nach dem MVP bereits ergänzt

1. Smart Collections und Lifelist-/Statistikauswertung;
2. ein `Favoritenbild der Art` je Art als reine Katalogmarkierung.

### Weiterhin einzeln bewerten

1. iNaturalist-Beobachtungsimport mit Zeit-/GPS-Vergleich;
2. Serien- oder Burst-Helfer;
3. sichtbare externe Recherche für unbekannte Arten;

### Nicht in Phase 10 aufnehmen

1. universelle automatische KI-Artbestimmung;
2. zwingende Cloud-, Browser- oder Tokenabhängigkeit im Kern;
3. direkte Bearbeitung von Master-SQLite, Lightroom-Katalog oder XMP-Dateien;
4. automatische Bewertung, Farblabel, GPS-, Titel- oder Beschreibungsänderung;
5. parallele Taxonomiestammdatenpflege in Lightroom;
6. Scraping oder automatisiertes Auslesen fremder Bilderkennungsseiten.

## 11. Go-/No-Go-Entscheidung

**Go wurde für Phase 10.2 erteilt; der technische Offline-Prototyp mit vollständiger Mastersuche ist umgesetzt.**

Die vorhandene Taxonomie- und Projektstruktur ist fachlich stärker als die in den betrachteten Plug-ins jeweils
eingebauten Einzellösungen. Der größte Nutzen entsteht deshalb nicht durch das Nachbauen ihrer Bilderkennung oder
Online-Synchronisation, sondern durch eine sichere Brücke vom geprüften Arten-Explorer zu Lightroom.

Phase 10.2 hat das vollständige abgeleitete Suchpaket erzeugt, Größe und Suchzeit gemessen, den lokalen Suchhelfer
und einen minimalen Lua-Prototyp implementiert sowie Aktivierung und Rollback praktisch geprüft. Die kontrollierte
Zuweisung an ein und mehrere Fotos wurde anschließend in einem separaten Lightroom-Testkatalog praktisch bestätigt.
Plug-in-Version 0.4.17.0 ergänzt die vollständigen lesbaren Plug-in-Metadaten, eindeutig markierte flache
Stichwörter ohne technische IDs, kontrolliertes Entfernen, dynamische Bildauswahl, die ausschließlich im eigenen
Statistikfenster berechnete Lifelist und Statistik, Smart-Sammlungen, das `Favoritenbild der Art`, kompakte und
vollständige Metadatenansichten sowie eine knappe Plug-in-Diagnose. Das Zuweisungsfenster startet keine
katalogweite Statistikberechnung mehr. Identische sichtbare Stichwortnamen werden vor dem Lightroom-Schreibzugriff
dedupliziert. Die Rücknahme erkennt die reservierten Endungen `(FN)` und `(FN)*`. Die gesamte Write-Access-
Operation verwendet direkt `withWriteAccessDo` innerhalb der bereits gestarteten `LrTask`; ein SDK-Timeout wartet
bis zu zehn Sekunden auf kurzzeitige Schreibzugriffe. Version 0.4.15.0 prüft danach Callback-Abschluss und
gespeicherte `masterTaxonId`, bevor die Zuweisung als erfolgreich gilt. Der Auswahl-Observer liest den Katalog seit
0.4.16.0 über eine kurze `LrTask`, damit die Fotozahl unmittelbar aktualisiert wird. Statistikscans verwenden seit
0.4.17.0 begrenzte Leseblöcke; der Yield liegt außerhalb des `withReadAccessDo`-Callbacks. Version 0.4.21.0
speichert einen kompakten kataloggebundenen Statistikindex, baut ihn nichtmodal mit Checkpoints und
Pause/Fortsetzen auf, aktualisiert ihn durch eigene Schreibaktionen inkrementell und exportiert die Lifelist als
UTF-8-CSV. Klassen werden kompakt mit Art- und Fotozahl angezeigt; die vollständige Artenliste bleibt im CSV,
nachdem die dynamische Dialoghöhe im praktischen Lightroom-Test nur eine Zeile darstellte. Der SDK-Vergleich bestätigt keinen
allgemeinen Metadatenänderungsbeobachter; externe Änderungen werden deshalb über `Statistik neu aufbauen` abgeglichen.
Version 0.4.21.1 korrigiert die im Großkatalogtest erkannte verzögerte Sichtbarkeit neuer Plug-in-Felder innerhalb
des Schreibcallbacks, indem sie das Statistikdelta aus dem vorgesehenen neuen Zustand bildet. Version 0.4.21.2
entfernt die instabile Klassen-Aufklappansicht. Der globale Statistikaufbau speichert nun die persistenten Foto-UUIDs
vorhandener Favoriten; die Favoritenaktion löst diese anschließend gezielt über `findPhotoByUuid` auf und schreibt
nur die tatsächlich betroffenen Fotos.
Version 0.4.21.3 dokumentiert die verbleibende Plattformgrenze der Vorschau: Das zuverlässige native `simple_list`
hat unter Windows eine weiße Systemfläche und bietet laut SDK keine eigene Hintergrundfarbe. Der farblich steuerbare
`scrolled_view` bleibt verworfen, weil er im praktischen Test Taxonomiezeilen abschnitt oder ausblendete.
Die erneute SDK-Prüfung am
2026-08-28 bestätigt keinen Erweiterungspunkt für das normale Foto-Rechtsklickmenü; die Aktionen bleiben über die
dokumentierten `Plug-in-Extras`-Menüs erreichbar. Der praktische Test widerlegte die Enter-Annahme im dauerhaft
geöffneten `presentFloatingDialog`: Das SDK dokumentiert dort weder einen Standardbutton noch einen
Enter-/Tastatur-Callback für `edit_field`. Die Suche bleibt über `Art suchen` verfügbar. Phase 10 bleibt bis zum
umfassenden Abschlussaudit offen.

## 12. Quellen und Produktreferenzen

- Adobe Lightroom Classic SDK: <https://developer.adobe.com/lightroom-classic>
- Adobe Lightroom-Schlüsselwörter: <https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/keywords.html>
- Adobe Metadaten-Grundlagen: <https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/metadata-basics-actions.html>
- iNat Publish Pro: <https://inat-tools.com/products/inat-publish-pro-5/>
- LifeListXP: <https://exchange.adobe.com/apps/cc/205561/lifelistxp>
- Nomen: <https://nomenapp.com/>
- Species Tagger: <https://exchange.adobe.com/apps/cc/205597/species-tagger>
- Species Tagger Quellcode: <https://github.com/yuvaloren/lightroom-species-tagger>

Die Produktseiten dienen ausschließlich als Funktions- und Bedieninspiration. Es werden weder Code noch proprietäre
Modelle, Datenbestände oder geschützte Oberflächengestaltung übernommen.
