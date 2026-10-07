# Add Species Workflow

Stand: 2026-10-05

Dieses Dokument beschreibt Phase 5.6: weitere Arten ergaenzen.

## Artassistent bei fehlenden Medien – Korrektur vom 4. Oktober

Der Goldbaumsteiger-Befund zeigte einen vorgezogenen Veröffentlichungsversuch: Ohne neue Karte/Sound wurde
die Medienprüfung gestartet, bevor der Assistent den manuellen Karten- und Sound-Schritt anbieten konnte.
Der geführte, an genau eine Art gebundene Suchlauf hält jetzt auch bei leerem Medienergebnis vor der Übertragung an.

- Schritt 3 bietet die vorhandene Karten-Dateiauswahl, Drag-and-drop bzw. bewusstes Überspringen an.
  Der bekannte IUCN-Link wird aus der Art abgeleitet; ein Browsererfolg bedeutet weiterhin keinen
  erfolgreichen automatischen Abruf. HTTP-403-Schutz und Medienprüfung bleiben unverändert.
- Danach erscheint immer Schritt 4: neue Aufnahme prüfen oder ausdrücklich den Sound-Schritt abschließen,
  wenn keine neue nutzbare Aufnahme gefunden wurde. Eine vorhandene Aufnahme bleibt erhalten.
- Frühere Soundablehnungen können auch bei leerem Suchergebnis nach artbezogener Rückfrage aufgehoben
  und neu gesucht werden. Keine erneute Artanlage, keine fremden Ablehnungen oder manuellen Dateien löschen.
- Schließen/Wiederöffnen setzt denselben gespeicherten Medienauftrag fort, statt eine zweite Art anzulegen.
- Erst nach diesem Ablauf wird die Übertragung geprüft. Fehlende/ungültige Karte bleibt ein
  Veröffentlichungsblocker; die lokalen übrigen Schritte können trotzdem abgeschlossen werden.
  Die Oberfläche unterscheidet deshalb „lokal abgeschlossen“ und „Übertragung noch offen“ von Veröffentlichungserfolg.

Automatisierte UI-/Controller-Gegenproben prüfen leeres Suchergebnis, Kartenimport, Sound-Abschluss,
Rücksetzen/Wiederholen, gebundene Fortsetzung und Wiederöffnung. Kein produktiver Goldbaumsteiger-Neulauf
oder neues Karten-/Soundasset durch die Reparatur. Felix hat die geführte Abfolge am Schwarzstorch in allen
Instanzen praktisch bestätigt. Die neue echte Artanlage-Abbruchprüfung einschließlich Soundreset und
erneuter Suche benötigt eine separate praktische Abnahme; die automatisierten Prüfungen verwenden isolierte Daten.

## Grundsatz

Neue Arten werden nicht automatisch vorgeschlagen oder automatisch in `species_list.json` eingefuegt.

Die Artenauswahl bleibt redaktionell manuell. Die Pipeline verarbeitet nur Arten, die von Felix bestaetigt und in
`species_list.json` gespeichert wurden. Phase 7.5 bildet diesen bisher direkten JSON-Schritt kontrolliert ueber den
lokalen Arten-Explorer ab.

Phase 9 ergänzt diesen Ablauf um die lokale read-only Taxonomiesuche. Sie verwendet bevorzugt die aktive
Masterdatenbank und bleibt für deren Inhalt offline nutzbar. Die Referenz darf keine Art still anlegen und keine
vorhandene Art automatisch überschreiben. Details stehen in
`docs/taxonomy-explorer-integration.md`.

## Manuell zu pflegen

Eine neue Art wird in `species_list.json` als JSON-Objekt ergaenzt:

```json
{
  "german": "Deutscher Name",
  "english": "English name",
  "genus": "Genus",
  "species": "species",
  "size": "ca. ...",
  "weight": "ca. ...",
  "life_expectancy": "ca. ... Jahre"
}
```

Regeln:

- `german`: deutscher Anzeigename und Basis fuer Sound-/Karten-Assetnamen.
- `english`: eigenständiger englischer Anzeigename und Suchbegriff.
- `genus`: wissenschaftliche Gattung, erster Buchstabe gross.
- `species`: Artepitheton klein schreiben.
- `size`: manuelle Groessenangabe.
- `weight`: manuelle Gewichtsangabe.
- `life_expectancy`: manuelle Lebenserwartung ohne Quellenfeld.
- Keine doppelten `genus + species`-Kombinationen.
- Keine leeren Pflichtfelder.

## App-Workflow in Phase 7.5

Der Arten-Explorer stellt in der Artenliste die Aktion `Neue Art` bereit.

Formularfelder:

- deutscher Name (`german`)
- englischer Name (`english`)
- wissenschaftlicher Name als zwei Woerter, zum Beispiel `Turdus Merula`
- Groesse (`size`), optional getrennt nach Maennchen und Weibchen
- Gewicht (`weight`), optional getrennt nach Maennchen und Weibchen
- Lebenserwartung (`life_expectancy`)

Der Dialog ist als vierstufiger Assistent aufgebaut. Bereits erreichte Schritte koennen angeklickt werden, um
vorherige Eingaben oder Pruefansichten erneut zu sehen.

### Schritt 1: Allgemeine Daten pruefen

Die App zeigt keine internen Dateinamen mehr im Dialogkopf. Anwender sehen nur die fachlichen Schritte.

Wenn eine lokale Taxonomiereferenz installiert ist, unterstützt sie alle drei Namensfelder:

- Beim ersten Start ist nur `Tiere (Animalia)` sichtbar und vorausgewählt. Das Zahnrad kann Animalia abwählen
  und weitere Reiche ein- oder ausblenden.
- Im Zahnrad-Dialog können die verfügbaren Reiche gefiltert werden. Die kompakte Liste bleibt scrollbar; Checkbox
  und Reichsname stehen in einer Zeile.
- Das Dropdown enthält `Alle Reiche` zuerst und danach ausschließlich die ausgewählten Reiche in alphabetischer
  Reihenfolge. `Alle Reiche` durchsucht nur diese sichtbare Auswahl.
- Der deutsche Name sucht nach belegten deutschen Namen.
- Der englische Name sucht nach belegten englischen Namen.
- Der wissenschaftliche Name sucht nach akzeptierten Namen und Synonymen.
- Die Suche beginnt 500 Millisekunden nach der letzten Eingabe. Ältere Antworten werden verworfen.
- Die Trefferliste zeigt mehrere Möglichkeiten, ohne einen Treffer automatisch auszuwählen.
- Sie schwebt über den folgenden Feldern, sodass die Höhe des Assistenten beim Suchen unverändert bleibt.
- Ein Klick auf einen Treffer schließt die schwebende Trefferliste, füllt deutsche, englische und
  wissenschaftliche Namensfelder direkt und zeigt Hierarchie, Quelle, Release, Quellen-ID und Namensstatus.
  `Eingaben prüfen` bleibt danach verpflichtend.
- Im Neue-Art-Assistenten werden nur Treffer mit dem Rang `Art` angeboten.
- CoL-Art- und Namenslücken können aus dem lokalen versionierten iNaturalist-Bestand sowie den relevanten
  GBIF-/WoRMS-/Wikidata-Ausschnitten erscheinen. Danach verbleibende belegte Tierlücken können kontrolliert aus
  Animalia ergänzt werden; der manuelle Animalia-Recherchelink bleibt verfügbar.
- Fehlt die lokale Referenz oder ist sie nicht lesbar, bleiben alle Felder manuell nutzbar.

Vor dem naechsten Schritt prueft die App lokal und danach der Server:

- alle sechs Formular-Pflichtfelder sind gefuellt
- wissenschaftlicher Name besteht genau aus Gattung und Artepitheton
- beide Namensbestandteile enthalten nur Buchstaben oder Bindestriche
- wissenschaftlicher Name ist noch nicht vorhanden
- deutscher Name ist noch nicht vorhanden
- der erwartete URL-Slug `genus + species`, klein und ohne Leerzeichen, kollidiert nicht
- der aus dem deutschen Namen erzeugte `SafeName` kollidiert nicht mit einer anderen Art oder einem fremden
  Assetordner
- Feldlaengen und Steuerzeichen sind gueltig

Fehlerhafte Felder werden direkt rot markiert; die konkrete Fehlermeldung steht unter dem betroffenen Feld und
zusaetzlich gesammelt im Dialog. Erst nach einer gueltigen Pruefung wird `Naechster Schritt` aktiv.

Im Hintergrund trennt der Server den eingegebenen wissenschaftlichen Namen. Die Gattung wird mit grossem
Anfangsbuchstaben und das Artepitheton kleingeschrieben in `genus` und `species` gespeichert. Die Eingabe
`Turdus Merula` wird damit als `Turdus merula` normalisiert.

Groesse, Gewicht und Lebenserwartung werden anwenderfreundlich aus Wert und Einheit zusammengesetzt:

- In das Zahlenfeld kommt nur der Wert oder Bereich, zum Beispiel `140-250`.
- `ca.` wird automatisch vorangestellt.
- Groesse bietet `mm`, `cm` und `m`.
- Gewicht bietet `g`, `kg` und `t`.
- Lebenserwartung bietet `Tage`, `Monate` und `Jahre`; bei genau `1` speichert die App automatisch `1 Tag`,
  `1 Monat` oder `1 Jahr`.

Groesse und Gewicht koennen getrennt nach Geschlecht erfasst werden. Dafuer gibt es je Feld eine eigene Checkbox:

- Checkbox aus: ein gemeinsamer Wert plus Einheit, gespeichert zum Beispiel als `ca. 23,5-29 cm`.
- Checkbox an: je ein Feld fuer `Maennchen` und `Weibchen`.
- Sind beide Angaben getrennt, speichert die App weiterhin die bestehenden Textfelder, zum Beispiel:
  `Maennchen: ca. 24-29 cm; Weibchen: ca. 23,5-27 cm`.

Die Vorschau zeigt:

- vollstaendigen neuen JSON-Eintrag
- wissenschaftlichen Namen
- erwarteten URL-Slug
- erwarteten Assetordner

### Schritt 2: Optionales Artportrait

Der geprüfte Artentwurf und sein zugehöriges Portrait haben während der laufenden Explorer-Sitzung keine
zeitliche Ablauffrist. Auch längere Arbeit am Portrait erfordert deshalb keine erneute Artanlage. Beim Speichern
bleiben der Abgleich mit der Eingabeliste, Kollisionsprüfung und Einmalverwendung verpflichtend. Abbrechen vor
der Anlage verwirft nur diesen Entwurf und seine temporären Portraitdateien. Änderungen an den Artdaten verlangen
eine erneute Prüfung. Entwürfe überleben noch keinen Neustart des Explorers. Die Zehn-Minuten-Frist anderer
Bearbeitungs-/Assetvorschauen wird dadurch nicht aufgehoben; diese lassen sich ohne erneute Artanlage prüfen.

Nach erfolgreicher Datenpruefung kann direkt ein Portrait vorbereitet werden:

1. optional `Erweiterte Vorgaben für die Bildgenerierung` öffnen und nur gewünschte Abweichungen auswählen
2. optionale freie Zusatzhinweise eintragen
3. Einzelprompt aus den geprüften Artdaten, der Taxonomieklasse und allen Bildvorgaben erzeugen und kopieren
4. genau ein Bild in ChatGPT erzeugen
5. Bilddatei im Dialog auswählen
6. `Bild prüfen`

Die Untergruppen der erweiterten Vorgaben sind einzeln ausklappbar. Geschlossene beziehungsweise unveränderte
Felder bleiben automatisch; das Habitat wird standardmäßig dezent und wissenschaftlich passend angedeutet.
Klassenabhängige Felder erscheinen nur, wenn die Taxonomiereferenz die Klasse kennt. Ein Gewässertyp wird deshalb
nur bei fachlich passenden Klassen angeboten. `Prompt erstellen` übernimmt die Auswahl direkt. Bei einer
Detailaufnahme ist ein freies Detailmotiv Pflicht.

Die Bildpruefung nutzt dieselben Regeln wie die Bearbeitung bestehender Arten: PNG/JPEG/WebP bis 20 MB,
Mindestgroesse 800x1000 Pixel, 4:5-Seitenverhaeltnis und lokale Umwandlung auf `portrait.webp` in 1280x1600.
Der Schritt kann mit `Artportrait ueberspringen` bewusst ausgelassen werden. Diese Aktion markiert den Schritt nur
als erledigt; erst `Naechster Schritt` legt die Art an und startet den Suchlauf. Wird der Dialog vorher mit `X` oder
`Abbrechen` geschlossen, werden die Eingaben verworfen und keine Art angelegt.

### Schritt 3: Karte und Pipeline-Status

Nach Schritt 2 wird die Art ohne weiteres Datenbank-Aktionen-Fenster angelegt. Der Dialog bleibt offen und zeigt den
Status des gezielten Pipeline-Laufs fuer genau diese Art:

- Art anlegen
- IUCN-Daten und Karte suchen
- Sound suchen
- Spektrogramm bereitstellen

Wenn eine neue Karte gefunden wird, wird sie direkt in diesem Dialog geprüft. Sie kann übernommen oder übersprungen
werden. Beim Überspringen wird die automatisch gefundene Karte entfernt; eine manuelle Karte kann später über die
Assetverwaltung eingefügt werden.

Der Neue-Art-Lauf verwendet denselben Kartenabruf wie die Kartenbearbeitung. Liefert der automatische Abruf keine
speicherbare Karte, bietet der Assistent eine JPEG-/PNG-Dateiauswahl und Dateiablage per Drag-and-drop. Die Datei
wird lokal geprüft (maximal 20 MB) und erst mit `Manuelle Karte übernehmen` gespeichert. Bei einer lokalen Datei
wird die Quellen-URL nicht abgerufen; ein dortiges HTTP 403 verhindert deshalb den Dateiimport nicht.
Der offizielle Link aus der bekannten Assessment-ID ist vorbelegt. Ein IUCN-Dateiname mit anderer Assessment-ID
wird abgewiesen; bei einem beliebig benannten lokalen Bild wird die vorbelegte IUCN-Herkunft entfernt und kann
bewusst eingetragen werden. Alternativ bleibt der Import eines direkt erreichbaren Kartenlinks möglich.

### Schritt 4: Sound und Abschluss

Wenn ein Sound gefunden wird, wird er im selben Dialog mit Audioplayer und Spektrogramm angezeigt. Ein Klick ins
Spektrogramm setzt die Wiedergabeposition. Der Sound kann übernommen, übersprungen oder abgelehnt werden.
Bei Ablehnung speichert der Explorer die Quellkennung und startet automatisch die nächste gezielte Soundsuche fuer
diese Art. Es können beliebig viele Soundquellen pro Art abgelehnt werden.

Wenn danach kein weiterer Kandidat aus den unterstützten und lizenzgeprüften Quellen verfügbar ist, bleibt der
Assistent geöffnet und zeigt diesen Abschluss ausdrücklich an. Die Meldung behauptet bewusst nicht, dass es
weltweit keine Aufnahme gibt. Die Art kann ohne Tierstimme abgeschlossen werden; der fehlende Sound bleibt als
sichtbarer Pflegehinweis erhalten.

Nach Abschluss erscheint im Dialog die Erfolgsmeldung `Neue Art: <Name> wurde angelegt`.

Seit 27. September bietet Schritt 4 nach Ende des Suchlaufs `Abgelehnte Soundquellen wieder zulassen …`.
Eine Rückfrage nennt die Zahl der gespeicherten Ablehnungen **dieser Art**. Erst nach Bestätigung werden sie
aufgehoben und ein reiner Sound-Suchlauf für dieselbe bereits gespeicherte Art gestartet. Es entsteht kein
zweiter Arteintrag. Nach einem fehlgeschlagenen Suchstart kann erneut gesucht werden, auch wenn die Liste schon
geleert ist. Die Lizenz- und Quellenprüfung bleibt unverändert; erneute Verfügbarkeit einer Aufnahme ist nicht
garantiert.

Die Aktion steht auch **während der Soundprüfung** zur Verfügung, nicht erst nach ausgeschöpfter Suche.
Die Rückfrage erklärt hier ausdrücklich: frühere Ablehnungen aufheben, den gerade angezeigten Sound ablehnen
und überspringen, danach frühere Quellen wieder durchsuchen. Abbrechen lässt die aktuelle Auswahl unverändert.
Das ist eine neue Suche, keine garantierte Wiederherstellung einer bestimmten früheren Aufnahme.
Die Rücksetzung wird zusammen mit der aktuellen Medienentscheidung gespeichert; nur die aktuelle Quelle bleibt
gesperrt. So kann die Rücksicherung des vorherigen Sounds alte Ablehnungen nicht wieder einschleppen.

Für schon angelegte Arten ist dieselbe Freigabe unter `Tierstimme → Bearbeiten` verfügbar. Hier folgt die
Soundsuche bewusst separat über `Automatisch suchen` bzw. `Alternative suchen`. Geschützte manuelle Sounds
bleiben geschützt. Die Freigabe entfernt ausschließlich `sound.rejectedSources` der gewählten Art; sie ersetzt
oder löscht keine Datei und verändert keine andere Art. Vorhandene Sound-Backups werden nicht überschrieben.
Historische Ablehnungsangaben bleiben erhalten, sind aber keine Suchsperre. Die Registry-Änderung wird lokal
gespeichert und später mit `Änderungen übertragen` beziehungsweise dem nachfolgenden Pipeline-Lauf veröffentlicht.

Die API verwendet `POST …/assets/sound/rejections-preview` und `…/rejections-reset`: art- und revisionsgebundene,
kurzlebige Bestätigung, Schutz gegen parallele Asset-/Pipeline-Schreibvorgänge, atomarer Registry-Dateiaustausch.
Eine nachträglich geänderte Registry verlangt eine neue Vorschau. Fehler geben die Sperre wieder frei; ein
Anzeigefehler nach erfolgreichem Speichern wird als Warnung statt als fehlgeschlagene Speicherung gemeldet.
Bei einer unveröffentlichten neuen Art bleiben Rücksetzung und erneuter Sound-Suchlauf an dieselbe
`creationId` gebunden. Jede Speicherung aktualisiert deren Herkunftsnachweis; auch ein leerer erneuter
Suchlauf wartet im Assistenten auf eine bewusste Entscheidung. Der Auftrag bleibt danach abbrechbar und
nach Schließen oder Neustart fortsetzbar. Bereits veröffentlichte Arten bleiben im Medieneditor bearbeitbar,
ohne dass ein alter Artanlage-Nachweis spätere Bearbeitungen sperrt.
Während einer wartenden Soundprüfung verwendet der Assistent stattdessen die bestehende Review-API mit
`decision: reject`, `resetSoundRejections: true` und der aktuellen `reviewUrl`. Lauf-ID und Vorschau-URL müssen
passen; sonst bleibt die neuere Prüfung unverändert. Gleichzeitige Review-Speicherungen werden abgewiesen.
Eine unlesbare Registry wird nicht als leere Datei ersetzt. Vorhandene Sounddateien werden zunächst aus der
Ausgangssicherung wiederhergestellt, ihre Schutzmarkierung bleibt erhalten; nur ein danach tatsächlich neu
gefundener Kandidat kann wieder eine eigene Prüfentscheidung verlangen. Andere Arten bleiben unverändert.

Am erfolgreichen Abschluss bleibt genau **eine** Schließen-Schaltfläche im Fußbereich. Das X im Kopf bleibt
zusätzlich verfügbar. Nach Schließen/Wiederöffnen startet der Assistent wieder mit seiner normalen Abbrechen-Aktion.
Controller- und API-Tests prüfen Rückfrage/Abbruch, Fehler, Wiederholung, einmalige Artanlage, Schließen,
Registry-Erhalt und Server-Neustart. Acht gezielte Tests sowie das vollständige `quality:ci` bestanden am
27. September. Felix bestätigte anschließend beide bisherigen Rücksetzungswege praktisch (Editor und Assistent
nach ausgeschöpfter Suche). Die zusätzliche Rücksetzung während einer noch offenen Soundprüfung ist
automatisiert geprüft und inzwischen ebenfalls von Felix bestätigt (Abnahme am 28. September dokumentiert).
Echte Ablehnungen wurden bei der Implementierung nicht zurückgesetzt.

Auch die Ergänzung während offener Prüfung bestand am 27. September das vollständige `quality:ci`
(Exitcode 0). 21 gezielte Sound-/Assistenten-/Pipeline-Tests prüfen zusätzlich normale Ablehnung,
Rücksetzung mit/ohne vorherige Sounddatei, alte Review-URL, gleichzeitige Speicherung, defekte Registry,
Suchfehler nach Speicherung sowie den sofortigen Dialogstart bei ausstehender Referenzprüfung.

Vorerst erledigte Beobachtung am 27. September: Beim Öffnen der Artanlage mit aktivem Listenfilter waren Eingaben laut
Felix vorübergehend nicht anklickbar. Eine Sperre durch den Filter ist im Code nicht belegt: er rendert nur die
Artenliste; die Referenzprüfung wird nach dem Öffnen ohne Warten gestartet. Ein Controller-Test mit gesetzten
Filtern und absichtlich ausstehender Referenzprüfung bestätigt sofortiges Öffnen, Fokus und Schließen.
Er bildet jedoch keine Electron-Ereignisschleifen-/Fokusverzögerung nach. Felix betrachtet die Beobachtung
vorerst als erledigt und meldet ein erneutes Auftreten. Parallel liefen nach seiner Rückmeldung Lightroom-Prozesse;
deren Einfluss ist nicht nachgewiesen. Keine weitere Untersuchung eingeplant und keine spekulative Filteränderung.

Bei Suchlauf-, Medienprüfungs- oder Veröffentlichungsfehlern steht die Fehlermeldung auch im sichtbaren
Abschlussschritt. Sobald keine Operation mehr läuft, ist `Fenster schließen` verfügbar; die bereits angelegte
Art und ihre Dateien bleiben lokal erhalten. Nicht nochmals dieselbe Art anlegen, sondern die vorhandene Art
ergänzen und anschließend `Änderungen übertragen` verwenden. Auch eine wartende Assetprüfung lässt sich
schließen; sie bleibt über die Prozessanzeige erreichbar. Schließen ist keine Löschung und kein Rollback.

Seit 4. Oktober gibt es nach dem ersten Speichern zusätzlich `Artanlage abbrechen`. Die Rückfrage benennt
die eigene, noch unveröffentlichte Anlage. Nach Bestätigung nimmt der Explorer genau diesen Auftrag zurück:
Eingabeliste, erzeugte Art-/Assessmentdaten, Pflegeeinträge, eigene Medien, Karten-Dokumentation und die
zugehörige Anlagesicherung. Der Fehlteilebericht wird um diese Art bereinigt. Ein Git-Lauf ist dafür nicht nötig.
Ein nachweislich eigener, unverändert gebliebener Spektrogramm-Generator-Eintrag wird auf den Ausgangsstand
zurückgenommen. Das gilt für Soundimport und automatisch erzeugte Spektrogramme; spätere fremde
Registry- oder Generatoränderungen bleiben erhalten.
`Fenster schließen` erhält die Anlage weiterhin zum Fortsetzen; diese beiden Aktionen sind ausdrücklich getrennt.

Native Rückmeldung vom 5. Oktober: Felix hat `Artanlage abbrechen` mit Schwarzstorch ausgeführt.
Nach seiner Beobachtung wurde die Anlage vollständig zurückgenommen. Damit ist diese gezielte
Bedienabnahme bestätigt; keine neue unabhängige Datei-/Git-Restprüfung oder gesamte Wiederanlaufabnahme
behaupten. Die automatisierten Fremdschutz-/Abbruchgegenproben bleiben gesonderte technische Nachweise.

Die lokale Herkunftsdatei unter `species-explorer/creation-sessions/` bindet die Rücknahme an die eigene
Artanlage, nicht allein an einen eingegebenen Artnamen. Sie überlebt das Schließen und einen Explorer-Neustart.
Bei späteren Änderungen an anderen Arten entfernt der Explorer nur die eigenen Einträge; er stellt keine
alten Gesamtdateien über neuere fremde Daten wieder her. Sobald sich eigene Daten, Dateien oder Sicherungen
anderweitig geändert haben, bleibt die Rücknahme mit einem Schutzgrund angehalten. Publikationsbeginn oder
ein geänderter Git-Stand sperren die automatische Rücknahme ebenfalls. Nach einer erfolgreichen Veröffentlichung
öffnet `Neue Art` wieder das Formular für die nächste Anlage.

Der erfolgreiche Transfer schließt den Artauftrag mit einer kleinen dauerhaften Quittung: Laufkennung,
Commit und gebundener Art-/Medienstand müssen übereinstimmen, der Push muss erfolgreich sein und den
vorgesehenen entfernten Zweig bestätigen. Erst dann entfallen die zusätzlichen JSON-/Medien-Baselines
des Auftrags und dessen Sicherungsschutz; der normale eine Medienvorgänger je Art/Typ bleibt erhalten.
Eine spätere Karten-/Soundbearbeitung kann diesen Vorgänger wieder ersetzen. Alte Artanlage-IDs können
die fertige Art weder erneut aktivieren noch abbrechen oder späteren Medienentscheidungen untergeschoben werden.
Ein anschließend fehlgeschlagener Pages-Deploy öffnet den bereits übertragenen Artauftrag nicht wieder.

Nach einem Pushfehler bleibt der gebundene Transfer über `Änderungen übertragen` erreichbar, auch ohne
neue Dateiveränderung; die Wiederholung benötigt weder eine zweite Artanlage noch einen zweiten Commit.
Nach Neustart darf ein vorbereiteter Transfer aus dem passenden Git-Push-Protokoll abgeschlossen werden,
nicht aus `publicationStarted`, einem bloß geänderten HEAD oder einem No-op. Fehlt der Beleg oder passt der
gespeicherte Stand nicht, bleiben Auftrag und Rücknahmesatz geschützt. Ein unterbrochenes Schreiben der
abschließenden Quittung wird aus dem zuvor dauerhaft gespeicherten Pushnachweis fortgesetzt.

Läuft beim Abbruch noch ein eigener Schreibvorgang, wird der Wunsch dauerhaft vermerkt. Der Explorer wartet
den begonnenen Schreibblock ab und führt die Rücknahme automatisch mit derselben Auftragskennung weiter.
Er startet dabei keine Folge-Suche und keine Veröffentlichung. Die Oberfläche sperrt weitere Entscheidungen,
bis die Rücknahme beendet ist oder einen konkreten Schutzgrund meldet. Nach Neuladen wird ein gespeicherter
Abbruchwunsch wieder aufgenommen. Ein vor der letzten Herkunftssicherung unterbrochener Prozess kann zur
Sicherheitsprüfung führen; unbekannte/geänderte Dateien werden nicht pauschal als eigene Dateien gelöscht.

Abgebrochene Aufträge hinterlassen lediglich eine kleine lokale Abschlussquittung ohne alte Artdaten oder
Medien, damit eine wiederholte Abbruchanfrage sicher beantwortet wird. Alte Medien-/Prüftokens werden verworfen.
Unabhängig davon prüft jede spätere Pipeline-Medienentscheidung die Zielart frisch: eine inzwischen gelöschte
oder geänderte Art kann keinen neuen Pflegeeintrag und keine Veröffentlichung über eine alte Prüfung erzeugen.
Auch nach einer gleichnamigen Neuanlage wird der alte, bei separater Löschung beendete Auftrag abgewiesen,
bevor Dateien oder Pflegeeinträge verändert werden. Die zugehörige wartende Medienprüfung wird beim
Löschen entwertet und nach einem Explorer-Neustart nicht wieder als aktive Prüfung geöffnet.

Speichern:

- nur nach gueltiger Vorschau
- Schutz gegen parallele Aenderungen an `species_list.json`
- Backup nach derselben Aufbewahrungsregel wie Phase 7.4
- neuer Eintrag wird atomar an die Liste angehaengt
- wenn ein Portrait geprueft wurde, wird es im Neue-Art-Ablauf ohne zusätzliche Browser-/Electron-Bestätigung lokal
  uebernommen
- danach startet der selektive Pipeline-Lauf fuer genau diese neue Art automatisch; erst dieser Lauf vervollstaendigt
  IUCN-Daten, Karte, Sound, Spektrogramm und Git-Veröffentlichung
- vor dem manuellen Datei-/Linkimport versucht die Pipeline den automatischen Kartenabruf
- neu gefundene Karten und Sounds werden im Neue-Art-Dialog einzeln geprüft
- wenn ein neu gefundener Sound abgelehnt wird, merkt die App die Quellkennung und startet automatisch die nächste
  gezielte Soundsuche fuer diese Art, bis ein Sound akzeptiert wird oder keine taugliche Quelle mehr gefunden wird

Direkt nach dem Speichern erscheint die Art im Explorer als `nur in species_list.json`. Dieser Zustand ist erwartet
und bleibt sichtbar, bis die Pipeline erfolgreich gelaufen ist.

API:

- `GET /api/taxonomy/status`: meldet Verfügbarkeit und aktiven Referenzstand, ohne die Artanlage zu blockieren
- `GET /api/taxonomy/kingdoms`: liefert alle verfügbaren Reiche mit `Animalia` als erstem lokalen Standard
- `GET /api/taxonomy/search`: liefert höchstens zwölf read-only Vorschläge und akzeptiert ein einzelnes
  `kingdomId` oder mehrere kommagetrennte `kingdomIds`
- `GET /api/taxonomy/taxa/:id`: liefert Detailvorschau, Hierarchie und Quelleninformationen
- `POST /api/species/new/preview`: validiert alle Felder und Kollisionen, schreibt aber keine Datei
- `POST /api/species/new/discard`: verwirft nur den per Token benannten, noch nicht gespeicherten Entwurf und
  zugehörige temporäre Portraits; bereits angelegte Arten werden nicht entfernt
- `POST /api/species/new/portrait-prompt`: erzeugt den Einzelprompt aus den geprueften Artdaten
- `POST /api/species/new/portrait-preview`: prueft und staged ein optionales Sofortportrait
- `POST /api/species/new/save`: akzeptiert nur das einmalige Vorschau-Token und haengt den geprueften Eintrag an
- `POST /api/species/new/sessions`: liefert lokale Artanlage-Aufträge und ihre aktuelle Abbruchmöglichkeit
- `POST /api/species/new/abort`: verlangt die persistierte `creationId`; nimmt den eigenen unveröffentlichten
  Auftrag zurück oder meldet `pending`, solange ein laufender Schreibvorgang sicher abgewartet wird

Technischer Stand vom 2026-07-28:

- Formular, Vorschau und Speichern sind lokal umgesetzt.
- Die lokale Taxonomiereferenz ist in Schritt 1 integriert. Alle Namensfelder bleiben auch bei installierter
  Referenz direkt manuell beschreibbar.
- Deutsche, englische und wissenschaftliche Eingaben durchsuchen getrennt die passende Namensart. Ein Zahnrad
  begrenzt lokal die sichtbaren und durch `Alle Reiche` durchsuchten Reiche; nur Animalia ist anfänglich aktiv.
- Die 300-ms-Suche verwendet eine schwebende Ergebnisliste und lässt die Dialoghöhe unverändert.
- Das Formular verwendet einen Schrittassistenten mit Datenpruefung, optionalem Portraitschritt, Kartenpruefung sowie
  Sound-/Abschluss-Schritt.
- Das Formular verwendet ein gemeinsames Feld fuer den wissenschaftlichen Namen und zeigt Beispieltexte fuer alle
  Eingaben. Groesse, Gewicht und Lebenserwartung werden aus Wert plus Einheit zusammengesetzt; `ca.` wird automatisch
  gespeichert.
- Groesse und Gewicht koennen unabhaengig voneinander nach Maennchen und Weibchen getrennt werden.
- Bereits erreichte Schritte koennen angeklickt werden. Klickbare, noch offene Schritte sind blau, abgeschlossene
  Schritte gruen und gesperrte Schritte grau markiert. `Artportrait ueberspringen` startet keine Anlage mehr,
  sondern gibt erst `Naechster Schritt` frei.
- Ungueltige Felder werden sichtbar markiert; Fehlermeldungen stehen direkt am Feld.
- Nach erfolgreichem Speichern wird die Aktion wieder freigegeben, sodass ohne Seitenneuladen weitere Arten
  angelegt werden koennen.
- Nach Schritt 2 startet der gezielte Lauf `Neue/Unvollständige Arten aktualisieren` fuer diese Art im selben Dialog.
  Das Datenbank-Aktionen-Fenster wird dabei nicht geöffnet.
- Sound- und Spektrogramm-URLs werden bei jedem neuen Suchversuch mit einem Hash versehen, damit nach einer
  Ablehnung nicht versehentlich ein alter Browser-/Electron-Cache abgespielt wird.
- Die Artenlisten-Aufbewahrung hält fünf reguläre Sicherungen global. Zusätzlich an offene Artanlagen
  gebundene Rücknahmestände bleiben bis zum belegten Abschluss erhalten; ein begonnener Push genügt nicht.
- Wissenschaftlicher Name, deutscher Name, Slug, `SafeName` und bereits vorhandene Assetordner werden geprueft.
- Schreibtests laufen ausschliesslich in temporaeren Mini-Repositories; die echte `species_list.json` bleibt dabei
  unveraendert.
- Direkte Service-, Routing-, UI-Vertrags- und Workflowtests sichern Referenzsuche und bisherigen Assistenten ab.
- Die Bedienung wurde am 2026-06-20 mit Haubentaucher und Höckerschwan praktisch geprüft.

Historische Workflow-Prüfungen:

- Haubentaucher und Höckerschwan wurden nach den produktiven Workflow-Tests wieder entfernt und am 2026-06-28
  bereinigt
- Löwe wurde am 2026-06-30 fuer einen sauberen erneuten Neue-Art-Test wieder vollständig entfernt
- nach dauerhafter Löschung der generierten Daten und Assets kann dieselbe Art ohne alte Slug-, Daten- oder
  Assetordner-Kollision erneut angelegt werden

Der aktuelle Artenumfang steht ausschließlich in `docs/project-status.md`.

## Formularverhalten

- Eine Textmarkierung darf über den Rand des Dialogs hinausgezogen werden, ohne das Formular zu schließen.
- Ein Klick auf den dunklen Hintergrund schließt den Dialog nur, wenn der Klick dort begonnen und geendet hat.
- Damit bleiben bereits eingetragene Werte auch beim erneuten Anlegen einer Art erhalten.

## Was danach automatisch passiert

Nach dem manuellen Eintrag verarbeitet `node update.mjs` die neue Art:

- IUCN-Taxon und globales Assessment suchen
- `speciesData.json` erzeugen/aktualisieren
- IUCN-Karte laden, wenn verfuegbar
- Sound ueber Xeno-Canto, Wikimedia Commons und iNaturalist suchen
- `fehlende_elemente_report.json` aktualisieren
- vorhandene gute Daten schuetzen, wenn ein neuer API-Abruf unvollstaendig ist

## Was nicht automatisch passiert

Squarespace-Seiten werden nicht automatisch erzeugt.

Nach einer neuen Art muessen manuell geprueft bzw. angelegt werden:

- Detailseite mit Slug aus `genus + species`, klein und ohne Leerzeichen, z. B. `cyanistescaeruleus`
- Codeblock auf der Detailseite mit den bekannten Artseiten-Containern
- Link auf der passenden Uebersichtsseite, damit Suche/Sortierung die Art findet
- ggf. Bild, Alt-Text und interne Verlinkung in Squarespace

## Pflichtchecks nach neuen Arten

Lokal:

```bash
node --check update.mjs
node update.mjs
```

Danach pruefen:

- `speciesData.json` enthaelt die neue Art.
- `fehlende_elemente_report.json` zeigt keine unerwarteten Fehler.
- Sound, Credits und Karte sind vorhanden oder sauber als fehlend gemeldet.
- `lastSavedAssessmentId.json` wurde plausibel aktualisiert.
- Keine Tokens oder lokalen Logs wurden versehentlich versioniert.

Website:

- GitHub Pages Deploy abwarten.
- Detailseite live testen.
- Info-Box inklusive Lebenserwartung, Generationsdauer und Population pruefen.
- Taxonomie, Status, Soundbar und Karte pruefen.
- Uebersichtsseite testen: Suche findet die neue Art.

## Versionierung

Nur Daten-/Asset-Aenderungen brauchen normalerweise keine Squarespace-`?v=`-Erhoehung.

Eine `?v=`-Erhoehung ist nur noetig, wenn eingebundene JavaScript- oder CSS-Dateien geaendert wurden.
