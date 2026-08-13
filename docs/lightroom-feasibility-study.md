# Machbarkeitsstudie: Lightroom-Classic-Integration

Stand: 2026-08-13  
Roadmap: Phase 10.1  
Status: abgeschlossen; Grundlage für Phase 10.2

## 1. Ziel und Ergebnis

Der Arten-Explorer kann sinnvoll um ein eigenes deutschsprachiges Lightroom-Classic-Plug-in erweitert werden.
Das Plug-in soll ausgewählte Fotos kontrolliert mit den bereits geprüften Artnamen und Taxonomiedaten des
Arten-Explorers versehen. Es bleibt ein Lightroom-Werkzeug und wird keine zweite Taxonomiedatenbank.

Die Machbarkeit ist für ein eng begrenztes MVP bestätigt. Empfohlen wird:

- ein natives Lightroom-Classic-Plug-in in Lua;
- ein kleiner, versionierter und vom Arten-Explorer erzeugter JSON-Export als read-only Datenquelle;
- vollständig lokale Suche und Verschlagwortung für den produktiven Artenbestand;
- eine Vorschau vor jeder Metadatenänderung;
- hierarchische Lightroom-Schlüsselwörter plus stabile Plug-in-Metadatenfelder;
- keine direkte Änderung der Lightroom-Katalogdatei, der Master-SQLite oder von XMP-Dateien außerhalb der
  Lightroom-Schnittstellen.

Nicht Bestandteil des ersten MVP sind automatische Bilderkennung, iNaturalist-Synchronisation, Lifelist-Statistik
und ein vollständiger Zugriff auf alle Taxa der großen Masterdatenbank. Diese Funktionen bleiben einzeln
priorisierbare Erweiterungen.

## 2. Geprüfte lokale Umgebung

Auf dem Entwicklungsrechner ist Lightroom Classic 15.5 installiert. Die Planung zielt zunächst auf diese reale
Windows-Umgebung. Ein späterer Installer muss unterstützte Lightroom-Versionen ausdrücklich prüfen und darf keine
festen Installations- oder Projektpfade voraussetzen.

Der vorhandene aktive Taxonomie-Master ist für Lightroom als direkte Datenquelle ungeeignet:

- aktive und vorherige SQLite-Version belegen jeweils mehrere GiB;
- Speicherpfad, Aktivierungszeiger und Rollback gehören dem Arten-Explorer;
- ein direkter Zugriff würde Lightroom an internes Schema, native SQLite-Unterstützung und Dateipfade koppeln;
- die im Plug-in benötigten Daten umfassen im MVP nur den produktiven Artenbestand und seine bestätigten Namen.

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
| Lokale Explorer-API | aktueller Master, zentrale Suchlogik | Explorer oder Dienst muss laufen; Port-, Firewall-, Start- und Mehrgerätefragen | später optional für Vollsuche |
| Versionierter kompakter Export | klein, offline, read-only, atomar austauschbar, einfach testbar | Export muss bei Änderungen neu erzeugt werden | verbindliche MVP-Empfehlung |

Der Export wird durch den Arten-Explorer erstellt. Lightroom liest ihn ausschließlich. Eine fehlende oder veraltete
Datei wird verständlich gemeldet; das Plug-in verändert sie nicht.

Empfohlener lokaler Pfad:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\lightroom\
  active\species-export.json
  previous\species-export.json
```

Dieser Pfad ist eine Planungsentscheidung für Phase 10.2 und darf im Code nicht hart als einziger möglicher Pfad
vorausgesetzt werden. Der spätere Installer und die Mehrgerätephase müssen ihn konfigurierbar behandeln.

## 6. Vorgesehener Exportvertrag

Kopf des Exports:

- `schemaVersion`
- `generatedAt`
- `projectRevision`
- `masterVersion`
- `masterActivatedAt`
- `speciesCount`
- `checksum`

Je Art mindestens:

- stabile `projectSpeciesId`
- stabile `masterTaxonId`, sofern zugeordnet
- deutscher, englischer und akzeptierter wissenschaftlicher Name
- Synonyme und bestätigte alternative Namen
- Rang und vollständige verfügbare Hierarchie
- Taxonomiestatus, zum Beispiel `col_confirmed`, `external_confirmed` oder `manual_protected`
- Herkunft und verwendete Anbieterstände
- Projekt-Slug nur als Referenz, nicht als dauerhafte Identität

Der Export enthält im MVP nur produktive Explorer-Arten. Dadurch bleibt er klein, schnell und vollständig offline.
Eine spätere Vollsuche kann über einen getrennten optionalen Dienst oder fachlich begrenzte Zusatzpakete erfolgen,
ohne den MVP-Vertrag zu brechen.

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

Ränge, die für eine Art fehlen, werden ausgelassen. Es werden keine Werte erfunden. Die wissenschaftlichen Werte
bleiben erhalten; deutsche Anzeigenamen können ergänzend in eigenen Feldern stehen.

### 7.2 Eigene Plug-in-Felder

Vorgesehene stabile Felder:

- Projekt-Art-ID
- Master-Taxon-ID
- deutscher Name
- englischer Name
- akzeptierter wissenschaftlicher Name
- Taxonomiepfad
- Taxonomiestatus
- Master-/Exportversion
- Verschlagwortet am
- Bestätigungsstatus (`manuell bestätigt`)

Das Plug-in überschreibt keine fremden Schlüsselwörter. Vorhandene eigene Taxonomie-Schlüsselwörter werden nur
nach einer sichtbaren Konfliktvorschau geändert.

## 8. MVP-Ablauf

1. Benutzer wählt ein oder mehrere Fotos in Lightroom Classic aus.
2. `Art zuweisen` öffnet einen deutschen Dialog.
3. Die lokale Suche findet deutsche, englische und wissenschaftliche Namen im Export.
4. Der Benutzer wählt eine Art.
5. Die Vorschau zeigt Namen, Hierarchie, Quelle, Exportversion, betroffene Fotos und vorhandene Konflikte.
6. `Übernehmen` schreibt Schlüsselwörter und Plug-in-Felder in einer Lightroom-Transaktion.
7. Fortschritt und Abbruch bleiben bei größeren Auswahlen sichtbar.
8. Eine Zusammenfassung nennt geändert, übersprungen und fehlgeschlagen.
9. `Letzte Zuweisung rückgängig machen` entfernt nur die vom Plug-in in diesem Lauf vorgenommenen Änderungen.

Beim Start prüft das Plug-in Schema und Prüfsumme des Exports. Eine neue Exportversion wird erst nach erfolgreicher
Prüfung verwendet; die vorherige Version bleibt als Rückfall erhalten.

## 9. Anforderungen an Phase 10.2 und 10.3

### 9.1 Funktionale Mindesttests

- ein Foto und mehrere Fotos verschlagworten;
- Suche über deutschen, englischen und wissenschaftlichen Namen;
- Art mit sieben und acht Taxonomiestufen;
- Art mit CoL-Referenzlücke oder manueller Korrektur;
- bestehende fremde Schlüsselwörter bleiben unverändert;
- erneute Zuweisung derselben Art ist idempotent;
- Konflikt zwischen alter und neuer Taxonomie wird nicht still überschrieben;
- Abbruch während eines Stapels lässt einen definierten Zustand zurück;
- fehlender, defekter oder inkompatibler Export wird verständlich gemeldet;
- Offline-Betrieb ohne laufenden Explorer;
- Rücknahme der letzten Zuweisung.

### 9.2 Performanceziele für den MVP

- Exportprüfung und Suchindexaufbau ohne merkliche Lightroom-Blockade;
- Suchreaktion im produktiven Artenbestand praktisch unmittelbar;
- Fortschrittsanzeige bei Stapeln;
- keine vollständige Fotoanalyse und keine Bilddateikopie;
- Speicherverbrauch unabhängig von der Größe der Master-SQLite.

### 9.3 Sicherheits- und Betriebsregeln

- Export ist read-only für Lightroom;
- atomarer Exportwechsel und eine Rollbackversion;
- keine Tokens, Zugangsdaten oder privaten Pfade im Export;
- keine Netzwerkpflicht im Kernablauf;
- keine stillen Metadatenänderungen;
- vor dem Schreiben vollständige Vorschau und danach Protokoll;
- Plug-in-Logs enthalten keine Bildinhalte und werden begrenzt aufbewahrt;
- ein Installer prüft Lightroom-Version, Exportzugriff und Schreibrechte.

## 10. Priorisierung der Produktideen

### Für das MVP übernehmen

1. lokale Offline-Suche aus der geprüften Explorer-Datenbasis;
2. Mensch bestätigt jeden Arttreffer;
3. konsistente hierarchische Schlüsselwörter;
4. stabile eigene Metadatenfelder;
5. Stapelverarbeitung mit Fortschritt und Abbruch;
6. Konfliktvorschau, Überspringen und Rücknahme;
7. Exportversion und Herkunft sichtbar machen.

### Nach dem MVP einzeln bewerten

1. Smart Collections und Lifelist-/Statistikauswertung;
2. iNaturalist-Beobachtungsimport mit Zeit-/GPS-Vergleich;
3. Serien- oder Burst-Helfer;
4. Artportrait als Referenzbild;
5. sichtbare externe Recherche für unbekannte Arten;
6. optionaler Zugriff auf die vollständige lokale Master-Suche.

### Nicht in Phase 10 aufnehmen

1. universelle automatische KI-Artbestimmung;
2. zwingende Cloud-, Browser- oder Tokenabhängigkeit im Kern;
3. direkte Bearbeitung von Master-SQLite, Lightroom-Katalog oder XMP-Dateien;
4. automatische Bewertung, Farblabel, GPS-, Titel- oder Beschreibungsänderung;
5. parallele Taxonomiestammdatenpflege in Lightroom;
6. Scraping oder automatisiertes Auslesen fremder Bilderkennungsseiten.

## 11. Go-/No-Go-Entscheidung

**Go für Phase 10.2 und ein eng begrenztes MVP.**

Die vorhandene Taxonomie- und Projektstruktur ist fachlich stärker als die in den betrachteten Plug-ins jeweils
eingebauten Einzellösungen. Der größte Nutzen entsteht deshalb nicht durch das Nachbauen ihrer Bilderkennung oder
Online-Synchronisation, sondern durch eine sichere Brücke vom geprüften Arten-Explorer zu Lightroom.

Phase 10.2 soll den Exportvertrag prototypisch erzeugen, mit einer minimalen Lua-Testoberfläche einlesen und das
Schreiben eines klar abgegrenzten Testschlüsselworts auf Testfotos verifizieren. Erst danach beginnt das
vollständige MVP aus Phase 10.3.

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
