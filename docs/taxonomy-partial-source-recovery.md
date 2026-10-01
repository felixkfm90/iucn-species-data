# Teil-Suchtreffer, Identitätsschutz und kontrollierte Wiederherstellung

Stand: 2026-10-01

## Freigabestand

Der enge Reparaturkandidat **`master-20261001145513036`** ist seit dem 1. Oktober vollständig unabhängig geprüft:
alle 154 ursprünglichen IDs aktiv, vier technische Ersatz-IDs historisch, keine fremden Zusatz-IDs; alle elf
semantischen Umfangsprojektionen außerhalb des Plans unverändert. Die 60 Projektverknüpfungen und 46 eigenen
ausgewählten Felder einschließlich fünf deutscher Namen bleiben erhalten. Keine blockierenden Konflikte.
Abschließende Vollhashprüfung um 17:46:52 MESZ erfolgreich. Ein reparierter Quellenstand und vier technische
Historienfälle sind installiert; kein fachlicher Split/Merge und keine automatische Foto-/Projektmigration.

Felix hat anschließend mit **„ja los“** die **gemeinsame Master-/Lightroom-Aktivierung** gesondert bestätigt.
Der Wartungsaufruf begann am 1. Oktober um **17:57:36 MESZ**. Der reguläre Paarweg bereitet das vorhandene
Masterexemplar und ein daraus erzeugtes, vollständig geprüftes Lightroom-Suchpaket im Hilfsprozess vor.
Prozesssperren und frische Eingangs-/Dateiprüfungen bleiben vor dem gemeinsamen Zeigerwechsel verbindlich.
Wartungsabschluss um **18:11:42 MESZ**, Exit 0: Master **`master-20261001145513036`** und Suchpaket
**`lightroom-63c431a5fa43190a4c52`** gemeinsam aktiv. Das Paar vom 28. September ist als Rückweg erhalten.
Die unabhängige lesende Paar-/Dateiprüfung endete um **20:34:39 MESZ mit Exit 0**: vollständig erfolgreich.
Die Quellenreparatur ist damit **produktiv abgeschlossen**. Kein zusätzlicher Masteraufbau oder automatisch
gestarteter Katalogabgleich. Felix hat anschließend am 1. Oktober die gezielte praktische Verbraucherabnahme
mit Weissstorch und Rebhuhn vollständig bestätigt: bevorzugte Namen im Explorer, Lightroom-Zuweisung und
Erhalt nach Schließen/Wiederöffnen. Die übrigen Vor-Audit-Punkte bleiben getrennt offen.

Die älteren Abschnitte dokumentieren den aufbewahrten breiten Kandidaten mit 2.173 zusätzlichen CoL-/Reichsfällen
und den späteren Schutzabbruch wegen 26 fremder Konflikthinweise. Diese Fälle sind **nicht** in der aktuellen
Aktivierungsfreigabe enthalten. Alte Aufträge, Journale, Originalquellen und Fehlerdatenbank bleiben erhalten.
Keine nachträglich angepasste Regelprüfsumme oder aus Namen abgeleitete ID-Migration.
Ausgangsbefund und vollständige Liste aller betroffenen IDs:
[Differenzprüfung vom 29. September](audits/2026-09-29-taxonomy-difference.md).

Außerhalb dieses ausdrücklich abgestimmten Paarwechsels keine weitere Neuaktivierung, Rücknahme,
Speicherbereinigung oder katalogweiten FN-Abgleich zur Behebung dieses Befunds starten. Vorgänger und
Anbieterstände erhalten. Bestehende Fotos und Projektarten nicht neu anlegen oder automatisch umhängen.

## Zusammenführungsvertrag

`taxonomy-partial-record.mjs` vereinigt ausschließlich dieselbe Anbieter-ID desselben Anbieters.
Wissenschaftlicher Name und Rang müssen übereinstimmen; bekannte Reiche dürfen einander nicht widersprechen.
Bekannte Reichs-Aliase wie Animalia/Metazoa werden für diese Prüfung normalisiert. Keine Suche nach einer
ähnlich benannten Art, keine Zusammenführung von Homonymen und keine neue Master-ID-Zuordnung.

- Im Teilweg bleiben vorhandene Aufnahme-Merkmale, Relevanzgründe, Suchanfragen und nicht erneut gelieferte
  Namen erhalten. Explizit gelieferte Namenseigenschaften derselben Variante haben Vorrang.
- Fehlendes Reich, fehlende Hierarchiestufen, Eltern-/Akzeptiert-Verknüpfungen, Status, externe IDs und bekannte
  Umgebung werden aus derselben vorherigen Anbieterzeile ergänzt. Explizite neue Werte bleiben erhalten,
  ausgenommen widersprüchliche Identitätsangaben: diese stoppen die Übernahme vor dem Schreiben.
- Lokale `colTaxonId`-Zeilennummern werden nicht aus einem früheren Stand ergänzt; sie sind referenzabhängig.
- `writeProviderSlice(..., preserveUnmentioned: true)` verwendet diesen Vertrag auch dann, wenn der schmale
  Ergänzungscache die breite vorherige Zeile selbst nicht kennt. `partialMerges` im neuen Manifest dokumentiert
  Anbieter-ID, vorherige Version, deren Abrufzeitpunkt und ergänzte Felder. Zeilenprüfsummen werden nach den
  endgültigen Zustandsänderungen berechnet und sind nach erneutem Einlesen identisch.
- Vollständige Anbieterstände bleiben maßgeblich: sie dürfen Felder ändern und Aufnahmen ausdrücklich entfernen.
  Ein Teil-Suchtreffer hebt eine im gespeicherten Quellenstand ausgewiesene Entfernung nicht auf. Eine bloße
  Suchmiss-Markierung im flüchtigen Ergänzungscache ist davon getrennt; ein erneuter Suchtreffer bleibt dort möglich.

Die Korrektur ist vorbeugend. Sind Angaben im jüngsten gespeicherten Stand bereits verloren, erzeugt ein weiterer
normaler Suchlauf sie nicht aus dem Nichts. Dafür wird der geprüfte frühere Quellenstand benötigt.

## Aktivierungsschutz

`taxonomy-master-continuity.mjs` vergleicht vorhandene Master-IDs gegen den neuen Kandidaten. Nur lesende
Verbindungen; nicht lesbare vorhandene Datenbanken führen zu einem Fehler. Bei einem echten Erstaufbau ohne
Vorgängerdatenbank gibt es keine bisherige ID-Menge. Es werden höchstens fünf Beispielnamen in die Fehlermeldung
aufgenommen, nicht eine unbegrenzte Liste.

Der Kandidatenbau speichert das Ergebnis als `identityContinuity` im Manifest, lässt den Kandidaten aber zur
Prüfung offen. Das ist wichtig, damit eine echte Aufteilung oder Zusammenführung ausdrücklich geklärt werden kann.
Die Sperre greift bei **beiden** Freigabewegen frisch gegen die tatsächlichen Datenbanken:

1. Einzelaktivierung in `taxonomy-master-lifecycle.mjs`, vor Manifest-/Verzeichniswechsel.
2. Gemeinsame Master-/Lightroom-Vorbereitung in `taxonomy-publication.mjs`, vor Paketbau und Zeigerwechsel.

Ein vor der Korrektur erstellter Kandidat ohne diesen Manifestvermerk wird ebenfalls geprüft. Ein Stand ohne
normale Feldkonflikte ist keine Ausnahme. Bestätigte Identitätsereignisse erhalten ihre Vorgänger als historische
IDs und bleiben möglich; der ausdrücklich bestätigte Rücknahmeweg ist kein Vorwärtsupdate und bleibt unverändert.
Kein Foto, Projektlink oder Namenswunsch wird durch den Schutz automatisch migriert.

Die neuen Module sind im Regelfingerabdruck des Masteraufbaus enthalten. Geänderte Aufbauregeln dürfen daher
keine alte Vergleichsgrundlage als unverändert wiederverwenden. Ein erforderlicher Vollweg nach dieser Korrektur
ist möglich; keine Zusage eines schnellen produktiven Reparaturlaufs.

## Lesende Reparaturvorschau vom 30. September 2026

Abgeschlossen um 16:26:44 MESZ. Keine Anbieteranfrage, kein neuer Masterkandidat, kein produktiver Schreibzugriff.
Ausgangspunkt ist weiterhin das am 28. September aktivierte Paar:

- Master vorher `master-20260905054823067`, aktiv `master-20260928064750796`.
- Suchpaket vorher `lightroom-946c961bd063fd1b8f12`, aktiv `lightroom-3953cad48c24e581d041`.
- iNaturalist vorher `snapshot-20260903164505354`, später `snapshot-20260927072533099`.

Methode: Beide Master mit `readOnly: true` und `PRAGMA query_only=ON` geöffnet. Fehlende Alt-IDs erneut aus
dem vollständigen ID-Vergleich bestimmt; jeweils exakt einen alten iNaturalist-Beleg ermittelt. Beide vollständigen
Quellendateien anhand Manifest-Prüfsumme und Zeilenzahl validiert, anschließend ausschließlich die 154 über
Anbieter-ID gebundenen Zeilen im Speicher vereinigt. Der echte Master-Auswahlfilter und die echte stabile
ID-Berechnung wurden auf die Vorschauergebnisse angewandt.

| Prüfung | Ergebnis |
| --- | ---: |
| Betroffene alte Master-IDs | 154 |
| Betroffene Zeilen in beiden Quellen vorhanden | 154 |
| Im beschädigten Eingang noch zur Aufnahme zugelassen | 4 |
| Nach ausschließlich lesender Vereinigung wieder zugelassen | 154 |
| Ursprüngliche Master-ID exakt reproduziert | 154 |
| Aktuell schon vorhandene Ersatz-IDs, gesondert zu behandeln | 4 |

Alle 154 Zeilen erhalten ihre Aufnahme-Merkmale und fehlenden Hierarchiefelder zurück, 150 ihre zusätzlichen
Relevanzgründe. Bei vier Zeilen wird auch das leere Reich ergänzt. Diese Vorschau prüft noch nicht das Ergebnis
eines vollständigen Mehranbieter-Masterbaus, dessen Konflikte oder die Lightroom-Fotozuweisungen.

Prüfsummen der beiden Quelldateien:

- Vorher: `9104105fd73e58915a6acb9fb76b06ad71275e3740ebc6299da0102dc006f3ed`.
- Später: `e89f81ccfcb279edc673de0884e38f1b95f548c64f226543038b36908cf375d1`.

Vor und nach der Vorschau vollständige SHA-256-Prüfung von sechs Dateien: beide Master, beide Suchpakete und
beide Anbieterdateien. Alle unverändert; Master-/Paketprüfsummen stimmen mit dem Veröffentlichungszeiger überein.
Auch dessen vollständiger Text blieb identisch. Das temporäre Prüfskript wurde nach Dokumentation entfernt.

## Bestätigter Wartungsweg

Implementiert in `taxonomy-source-recovery-plan.mjs`, `taxonomy-source-recovery-reader.mjs`,
`taxonomy-source-recovery.mjs`, `taxonomy-source-recovery-identities.mjs` und
`taxonomy-source-recovery-candidate.mjs`. Der explizite lokale Wartungsaufruf liegt in
`scripts/taxonomy-source-recovery.mjs`. Kein automatischer Start beim Öffnen des Explorers oder Lightrooms.

Der Aufruf verlangt absolute Taxonomie-/Suchpaket-/Projekt-/Korrekturpfade sowie die ausdrücklich benannten
beiden iNaturalist-Versionen. Es gibt keine produktiven Standardpfade und keinen Aktivierungsbefehl.

| Aktion | Wirkung |
| --- | --- |
| `preview` | Vollständig lesende neue Vorschau, Revisionskennung, blockierende Fälle und vier ID-Entscheidungen. |
| `prepare` | Nach Bestätigung nur separater Entwurf mit Plan, Quelldatei und Manifest unter `master/source-recovery/drafts/recovery-<revision>/`. |
| `inspect` | Entwurf frisch gegen dieselben Eingänge und die erwarteten Quelldateiinhalte prüfen. Nach dem Quellenwechsel ist diese alte Vorschau absichtlich veraltet. |
| `candidate` | Nach Bestätigung denselben Entwurf als gesicherten Masterauftrag ausführen beziehungsweise fortsetzen; anschließend neuen Quellenstand und Historienvormerkung bereitstellen. Keine Paaraktivierung. |

Für `prepare` und `candidate` sind `--confirm`, die exakt aktuelle `--revision` und eine absolute
`--replacement-decisions`-Datei erforderlich. Diese enthält für **jede** Ersatz-ID genau `replacementId`,
`originalId` und `policy: "preserve-history-no-photo-migration"` aus der Vorschau. Die JSON-Schlüsselreihenfolge
ist unerheblich; fehlende, zusätzliche, geänderte oder doppelte Entscheidungen werden abgewiesen.
Die drei rein lesenden beziehungsweise vorbereitenden Aktionen sind keine Zustimmung zur Aktivierung.

### Quellen- und Entscheidungsschutz

- Beide Master-/Suchpaketpaare müssen zu ihrem gemeinsamen Zeiger und ihren vollständigen Datei-Prüfsummen passen.
  Die Quellmanifeste müssen Anbieter, Versionskennung, Zeilenzahl und Vollhash bestätigen. Die Vorschau liest
  beide Master nur mit `readOnly` und `query_only`; sie erzeugt keine Sperrdateien oder Entwurfsordner.
- Der Plan bindet zusätzlich aktuelle lokale CoL-/Anbieterwahl, Projektdatei, Namenskorrekturen einschließlich
  referenzierter Korrekturreleases, Identitätsvormerkungen, vorhandenen Auftrag/Kandidaten und Aufbauregeln.
  Fehlende Korrekturreleases, eigene Entscheidungen auf einem Reparaturfall und Änderungen unter derselben
  Versionskennung sperren die Übernahme. Die vollständigen Prüfungen laufen bewusst nur bei Wartungsaktionen.
- Derselben alten Master-ID muss exakt ein alter iNaturalist-Beleg zugeordnet sein. Fachliche Identität und
  stabile ID müssen aus dieser Zeile reproduzierbar sein. Aktuelle, ausdrücklich entfernte Quellen werden
  nicht zurückgeholt. Mehrere aktuelle Besitzer derselben Anbieter-ID oder fremde Belege auf einer Ersatz-ID
  verlangen eine gesonderte Prüfung. Es werden höchstens 2.000 Fälle als ein technischer Plan unterstützt.
- Der Entwurf ersetzt ausschließlich die belegten Zeilen. Andere Zeilen behalten ihre gespeicherten Inhalte.
  Die Prüfung berechnet die vollständige erwartete Entwurfsdatei neu aus Eingang und Plan; eine selbst neu
  berechnete Manifest-Prüfsumme genügt bei veränderten Daten nicht.
- Vorbereitung und Kandidatenweg nutzen die vorhandenen prozessübergreifenden Kontroll-/Korrektursperren;
  der Worker erhält seine eigene Ausführungssperre. Verknüpfte Ziele werden abgewiesen. Platzprüfung mit
  2-GiB-Reserve, erneute Prüfungen beim Schreiben, Abbruchsignale und frische Eingangsbindung bleiben aktiv.
  Der normale vollständige Master-/Paketprüfweg wird nicht verkürzt.

### Vier technische ID-Fälle

`source-repair` ist ein zusätzlicher, eng begrenzter Typ in der vorhandenen unveränderlichen Identitätshistorie,
**kein** fachlicher Split oder Merge. Die gewöhnliche Identitätsauswahl kann diesen Typ nicht erzeugen.
Er setzt genau einen Vorgänger mit leerem Reich und einen Nachfolger mit belegtem Reich voraus. Wissenschaftlicher
Name und Rang bleiben gleich, beide IDs müssen den jeweiligen stabilen Hash reproduzieren. Anbieter-ID,
vorheriger/aktueller/reparierter Quellenstand, Zeilenhashes und Reparaturrevision gehören zum gespeicherten Beleg.
Eigene Projektzuordnungen auf der Ersatz-ID werden nicht automatisch übertragen.

Der Kandidatenbau stellt die ursprüngliche ID aktiv wieder her und erhält die Ersatz-ID als `deprecated`.
Die normale Kontinuitätsprüfung muss weiterhin sämtliche bisherigen IDs finden. Das Suchpaket transportiert
die vollständige Historie und löst eine Ersatz-ID als historischen Fall mit belegtem Nachfolger auf. Die
bestehende Lightroom-Vorschau verlangt weiterhin explizite Foto-/Nachfolgerwahl und Schlussbestätigung;
`automaticPhotoChange` bleibt `false`. Bereits bestehende Fotozuweisungen wurden in diesem Schritt nicht gelesen.

### Kandidat, Wiederanlauf und spätere Aktivierung

`candidate` liest ausschließlich die installierten lokalen Quellen. Die reguläre CoL-Auswahl und deren
Vollständigkeitsnachweis werden verwendet; die Artlücken werden für diesen Reparaturweg erneut lokal geprüft.
Eigene Namen und Projektangaben werden frisch aus den gebundenen Dateien gelesen. Fremde offene Kandidaten
oder noch nicht übernommene Identitätsentscheidungen werden nicht überschrieben.

Der vorhandene Workerauftrag sichert vollständige Eingänge und die bestätigte Historie. Sein privater Checkpoint
und alle regulären Struktur-/Fach-/Integritätsprüfungen bleiben aktiv. Unter
`master/source-recovery/transfers/recovery-<revision>.json` steht der prüfsummengebundene Reparaturauftrag.
Vor Übernahme werden alle ursprünglichen IDs, historischen Ersatz-IDs und die Kontinuität frisch gegen den
echten Kandidaten geprüft. Anschließend wird ein **neuer**, über Revision benannter iNaturalist-Stand bereitgestellt;
die Originalreleases bleiben unverändert. Manifest und Zeilen behalten den ursprünglichen Quellenabruf nachvollziehbar;
`locallyRepairedAt` dokumentiert die lokale Ergänzung, keinen erneuten Anbieterdownload.

Quellenverzeichnis und Identitätsvormerkung besitzen keinen gemeinsamen Dateisystem-Zeigerwechsel. Der
gespeicherte Reparaturauftrag macht diesen Vorbereitungsschritt deshalb ausdrücklich wiederholbar:
Nach einer Unterbrechung zwischen den beiden Übernahmen wird nur der exakt passende neue Quellenstand akzeptiert
und die fehlende Vormerkung nachgetragen. Neue Fremdänderungen sperren den Wiederanlauf. Ein fertiger Entwurf
oder Auftrag erzeugt beim erneuten bestätigten Aufruf keinen zweiten Entwurf beziehungsweise Workerauftrag.
Unvollständige fremde `preparing-*`-Ordner werden weder übernommen noch pauschal gelöscht. Bei einem abgefangenen
Vorbereitungsfehler wird nur der gerade angelegte private UUID-Ordner entfernt; die Eingänge bleiben erhalten.

Ein abgebrochener Reparaturauftrag wird über denselben bestätigten `candidate`-Aufruf fortgesetzt, damit auch
die Quellen-/Historienvorbereitung abgeschlossen wird. Das gewöhnliche Fortsetzen des Workers allein ersetzt
diesen Abschluss nicht. Danach ist der Kandidat über den regulären gemeinsamen Master-/Lightroom-Freigabeweg
aktivierbar. Die Paaraktivierung braucht ihre eigene Bestätigung und ihre vollständige Prüfung. Ein neuer
Aufbau kann wegen geänderter Regeln den Vollweg benötigen; es gibt keine neue Laufzeit- oder Beschleunigungszusage.

Für die produktive Bedienung die neue Explorer-Dienstversion laden, bevor die neue Historienart vorbereitet
wird. Ein zuvor gestarteter Dienst kennt die neue Ereignisart noch nicht. Keine Plug-in-Datei wurde geändert.

## Noch offene produktive Wiederherstellung

Historischer Planstand vom 30. September: Die folgenden Schritte wurden anschließend durch den engen
Ersatz-/Neustartweg und die am 1. Oktober bestätigte Paaraktivierung umgesetzt. Maßgeblich sind der
Freigabestand am Anfang und die abschließende praktische Abnahme unten, nicht diese damaligen Startaufträge.

1. Frische Vorschau einschließlich der vier Historienentscheidungen ausdrücklich mit Felix abstimmen:
   am 30. September durch Felix freigegeben.
2. Bestätigter lokaler Kandidatenlauf, lesende Abschluss- und Eingrenzungsprüfung am 30. September abgeschlossen.
   Ursprüngliche/historische IDs, Quellen, Namen, Links und Konflikte geprüft. Der enge Reparaturweg muss noch
   implementiert und isoliert geprüft werden; die 2.173 CoL-Quellenfälle werden getrennt behandelt. Einen sicheren,
   gesondert bestätigten Ersatzkandidatenweg mit dem bereits installierten Reparaturquellenstand vorsehen.
   Vorhandenen Kandidaten/Auftrag erhalten, keine alte Auftragsbindung nach Codeänderung umgehen. Keine Bestandsfreigabe.
3. Erst nach Klärung dieses Mehrbestands die gemeinsame Paaraktivierung abstimmen und überprüfen: beide Verbraucher, aktuelle
   Herkunft, ID-Kontinuität und erhaltener Vorgänger/Rückweg. Produktive Pause/Fortsetzung und Rollback bleiben
   als Betriebsabnahme gesondert offen. Die tatsächlichen Lightroom-Fotozuweisungen wurden noch nicht geprüft.

Der ursprüngliche Sperrgrund wird durch erhaltene historische Ersatz-IDs aufgelöst, nicht durch eine Ausnahme
von der Kontinuitätsprüfung. Der technische Erfolgsdurchlauf vom 28. September ist weiterhin keine fachliche
Freigabe des damaligen Bestands.

## Gezielte Prüfung dieses Schritts

- 66 Tests für Quellenvereinigung, Ergänzungscache, echten Kandidatenbau, Einzel-/Paar-Aktivierungssperre,
  bestehende Regressionen und Identitätsregister erfolgreich. Einschließlich unveränderter aktiver Dateien nach
  Ablehnung, Wiederholung, widersprüchlicher Identität und bestätigter Fortführung/Aufteilung/Zusammenführung.
- Weitere 68 Paket-, Hintergrunddienst-, Worker-, Eingangs- und Anbieteraktualisierungstests erfolgreich.
  Echte Hilfsprozesse, harter Abbruch, Pause/Fortsetzung, erneutes Öffnen, Paarwechsel und Rollback in Testbeständen.
  Der erste sandboxbeschränkte Hilfsprozess-Testlauf konnte nicht korrekt starten und wurde beendet; die
  Wiederholung mit erlaubten lokalen Test-Hilfsprozessen war erfolgreich. Keine produktiven Prozesse beendet.
- Keine Änderung unter `lightroom-plugin/`, deshalb keine Plug-in-Versionserhöhung. Squarespace-Footer geprüft:
  ausschließlich lokale Explorer-Backendmodule geändert, keine eingebundene Website-Datei und kein CSS.
- Syntaxprüfung (339 JS-/MJS-Dateien), Stilprüfung, lokale Dokumentationslinks (68 Markdown-Dateien),
  Status-Synchronisierung/-Prüfung und `git diff --check` erfolgreich. Der generierte Projektstatus erhielt
  dabei keine inhaltliche Git-Änderung. Bereits vorhandene Änderungen anderer Arbeitsschritte bleiben erhalten.
- Kein vollständiges `quality:ci`, keine produktive Bedienabnahme und kein Phase-10-Abschlussaudit in diesem Schritt.

### Prüfabschluss des Reparaturwegs am 30. September

- 19 neue Reparaturtests prüfen lesende Vorschau, vollständige Bestätigung, gleiche Versionskennung mit
  geänderten Inhalten, Platzmangel, Abbruch, Wiederöffnung, beschädigte Entwürfe, Quellen-/Historienwidersprüche,
  Kandidat, Suchpaket, echte Worker-Ausführung sowie Wiederholung nach einer unterbrochenen Quellenübernahme.
- Der reguläre lokale Eingangsleser ist zusätzlich gegen die installierte kleine CoL-Testreferenz geprüft.
  Die übrigen Quellen-/Master-/Kandidaten-/Historienoperationen verwenden echte SQLite-Dateien. Der direkte
  Entwurfstest nutzt für die unveränderten alten Paketdateien Prüfsummen-Dummys; er ersetzt keine Paketvollprüfung.
  Das neue Paket und seine historischen ID-Antworten werden separat mit dem echten Paketbauer geprüft.
- Zusammen mit bestehenden Quellen-, Master-, Eingangs-, Namenswahl-, Helfer- und Lightroom-Lua-/Dialogtests
  sind 154 gezielte Tests erfolgreich. Reguläre Prüfung eines fertigen Workerauftrags akzeptiert den Testkandidaten;
  die aktive Veröffentlichung und die ursprünglichen Dateien bleiben in den Tests unverändert.
- Zusätzlich sieben Explorer-Fallansichttests erfolgreich, davon ein neuer Anzeigetest für den technischen
  Reparaturtyp: verständlicher Titel, maskierte Inhalte und keine neue manuelle Fallauswahl. Insgesamt 161
  gezielte Tests. Der erste getrennte UI-Testaufruf wurde durch die Hilfsprozess-Sandbox blockiert; Wiederholung
  ohne Test-Isolationsprozess erfolgreich. Keine Anwendung oder produktiver Prozess wurde beendet.
- Syntaxprüfung: 346 JS-/MJS-Dateien; Stilprüfung erfolgreich. Keine Lua-/Website-/CSS-Änderung, deshalb keine
  Plug-in-Versionserhöhung oder Änderung der eingebundenen Squarespace-Versionen.
  Das lokale Explorer-Anzeigemodul ist nicht im erneut geprüften Squarespace-Footer eingebunden.
- Dokumentationsprüfung: 68 Markdown-Dateien ohne fehlende lokale Verweise. Projektstatus synchronisiert und
  geprüft, ohne inhaltliche Git-Änderung; `git diff --check` erfolgreich.
- Die Implementierungsprüfungen starten keinen produktiven Reparaturentwurf, Kandidaten oder Quellenwechsel.
- Abschließende große lesende Vorschau mit dem endgültigen Code erfolgreich: 154 Fälle, davon 150
  Aufnahmeverluste und vier technische ID-Fälle; keine Blocker. Revisionskennung:
  `a6bdf57a5b2fcc6820dc661cb344afdd154f1f82b3aeb2d1f7e79bf2f05c003e`.
  Vollständige Bindung einschließlich aktiver/vorheriger Master und Pakete, Originalquellen, Zeiger,
  lokaler Quellenwahl, Entscheidungen und Aufbauregeln vor/nach der Vorschau unverändert.

### Produktiver Start am 30. September

Felix hat den lokalen Reparaturkandidaten mit „Weiter“ auf die konkrete Freigabefrage bestätigt.
Der Wartungsaufruf `candidate` wurde gegen die oben genannte Revision und die vier unveränderten
Historienentscheidungen gestartet. Der Explorer-Dienst auf Port 4177 war beim Start geschlossen;
auf C: waren rund 118,48 GiB frei. Originalreleases und veröffentlichtes Master-/Suchpaketpaar bleiben geschützt.

Erste Prüfung: Prozess läuft in der Eingangsprüfung, noch kein neuer Entwurf oder Workerauftrag gespeichert.
Der vorherige, bereits veröffentlichte Auftrag ist weiterhin sichtbar; er ist kein neuer Reparaturauftrag.
Noch kein fertiger Kandidat, neuer Quellenstand, Historienvormerkung oder Paarwechsel nachgewiesen.
Die Paaraktivierung ist nicht Teil dieser Freigabe. Keine parallelen Eingangsänderungen oder Bereinigung starten.

Stand 19:46 MESZ: Der separate Entwurf ist gespeichert, Manifestzustand `prepared`, 154 ergänzte von
273.517 Quellenzeilen. Er gehört exakt zur bestätigten Revision und weist `activatesDatabase: false` sowie
`changesPhotos: false` aus. Noch kein neuer Workerauftrag; vor dessen Anlage wird der Entwurf nochmals frisch
gegen die Eingänge geprüft. Der Veröffentlichungszeiger zeigt unverändert auf das Paar vom 28. September.
Die 30-Minuten-Wiedervorlage `taxonomie-reparaturkandidaten-pr-fen` begleitet ausschließlich diesen Lauf;
bei unverändertem Zustand bleibt sie still. Nach Kandidatenabschluss folgt die lesende Ergebnisprüfung,
keine automatische Paaraktivierung. Kein neuer vollständiger Testlauf nötig: Entscheidungen und Dokumentation
angepasst, produktive Ausführung begleitet; kein weiterer Codewechsel während des gebundenen Aufbaus.

Stand 19:58 MESZ: Neuer Reparaturauftrag `job-bfb06bf7-94b3-4c69-be2c-42af970a1f3a` gespeichert,
Reparaturjournal `building`, Aufbaurevision
`aef7ccc91aea8b1342c2cf8bbc94e18fe9ff66dfc6c72b460cabca2ea7334f96`.
Der echte Hilfsprozess läuft seit 19:54:08 MESZ und hat 110.000 von 275.635 geplanten Taxa gesichert;
Phase `Masterdatenbank schreiben`. Das sind etwa 39,9 % dieses Schreibschritts, kein gemessener Gesamtfortschritt.
Der interne alte Prozentmarker wird nicht als Gesamtprozent ausgegeben. Keine Fehlerausgabe oder
Unterbrechung beobachtet; Abschlussprüfung und Quellen-/Historienübernahme stehen noch aus.
Die größere geplante Taxonmenge ist kein bereits freigegebener neuer Bestand. Die weitere Differenz gegenüber
dem bisherigen Master muss neben den 154 Reparaturfällen nach Kandidatenabschluss geprüft werden.
Veröffentlichungszeiger und Vorgänger weiterhin unverändert.

### Produktiver Abschluss und lesende Kandidatenprüfung am 30. September

Der bestätigte Wartungsaufruf ist mit Exit 0 beendet. Auftrag
`job-bfb06bf7-94b3-4c69-be2c-42af970a1f3a` und Reparaturjournal stehen auf `ready`;
Kandidat `master-20260930174712224`. Der Masterworker lief von 19:54:08 bis 20:12:30 MESZ, anschließend
folgten frische Eingangs-/Kandidatenprüfung und Quellen-/Historienvorbereitung. Die Gesamtausgabe bestätigt
`restoredCount: 154`, `historicalReplacementCount: 4`, `blockingConflictCount: 0`,
`activatesDatabase: false`, `changesPhotos: false` und `requiresActivationConfirmation: true`.
Der Gesamtaufruf seit 19:38:10 dauerte bis zur beobachteten Fertigmeldung ungefähr 40 Minuten; kein
Geschwindigkeitsvergleich zum früheren Grundlagenlauf mit anderem Umfang und Paaraktivierung.

Die unabhängige lesende Prüfung um 20:26 MESZ öffnete beide bisherigen Master und den Kandidaten mit
`readOnly: true` und `PRAGMA query_only=ON`. Ergebnis:

| Prüfung | Ergebnis |
| --- | ---: |
| IDs im bisherigen aktiven Master | 273.312 |
| IDs im vorherigen Master | 273.418 |
| IDs im Reparaturkandidaten insgesamt | 275.639 |
| Davon aktiv | 275.635 |
| Davon historische Ersatz-IDs (`deprecated`) | 4 |
| Ursprüngliche Reparatur-IDs aktiv wiederhergestellt | 154 |
| Fehlende IDs gegenüber aktivem / vorherigem Master | 0 / 0 |
| Hinzugefügte IDs gegenüber aktivem Master | 2.327 |
| Davon zusätzlich zu den 154 Reparaturfällen | 2.173 |
| Projektverknüpfungen unverändert | 60 von 60 |
| Ausgewählte eigene Felder unverändert | 46 von 46 |
| Eigene deutsche Namenskorrekturen erhalten | 5 von 5 |

Die fünf Namen sind Rotstirnamazone, Taubenschwänzchen, Leopard, Weissstorch und Rebhuhn. Die vier
`source-repair`-Ereignisse entsprechen den bestätigten technischen Entscheidungen; ausschließlich deren
Ersatz-IDs wechseln vom aktiven in den historischen Zustand. Keine automatische Projekt-/Fotoänderung.
Der reguläre `MasterRunController.assertReadyForActivation()` akzeptiert den fertigen Kandidaten; die
SQLite-Strukturprüfung `quick_check` liefert `ok`. Das sind technische Ergebnisse, keine fachliche Freigabe
des zusätzlichen Bestands.

Der neue lokale iNaturalist-Quellenstand `recovery-a6bdf57a5b2fcc6820dc661c` besitzt 273.517 Quellzeilen,
davon 273.400 im gefilterten Mastereingang. Quellenabruf weiterhin 27. September, 09:25:33 MESZ;
lokale Ergänzung separat am 30. September, 19:47:12 MESZ dokumentiert. Die Quelle stimmt mit dem
Reparaturjournal und ihrem Manifest überein. CoL sowie die anderen lokalen Anbieterstände unverändert;
keine Downloads. Prüfwerte:

- Neue Quelldatei SHA-256: `606fd88d9c383cc9bad023e127d43f03989f057158ef84278f907e9eb0df5f27`.
- Kandidat SHA-256: `3ab6c6c204148a683012ba0dbe9b0d82ce309bbc1d0678722016af3642175aa7`.
- Zusatzbeleg-Auswertung SHA-256: `d679c71a3b2ea9e32796faa8e05528010cb60a7b6063549b94168d5b1de0a855`.

Vollhashes vor/nach dieser Prüfung bestätigen sämtliche sechs gebundenen Originaldateien unverändert:
beide bisherigen Master, beide Suchpakete und beide ursprünglichen iNaturalist-Quellen. Auch Kandidatenhash
und Veröffentlichungszeiger unverändert. Aktiv bleibt Master `master-20260928064750796` mit Suchpaket
`lightroom-3953cad48c24e581d041`; kein neues Lightroom-Paket gebaut und keine Paaraktivierung durchgeführt.

#### Offener fachlicher Zusatzbefund

Alle 2.173 zusätzlichen IDs sind aktive, exakt CoL-belegte Einträge. Jeder hat genau einen gleichnamigen
bisherigen Eintrag mit **anderem Reich**, der im alten Master als `reference-gap` geführt wurde. Die neuen
Einträge besitzen ausschließlich CoL-Quellenbelege. Es gibt keine Zusatz-ID mit gleicher Kombination aus
wissenschaftlichem Namen, Rang und Reich. Die kleine nachgelagerte Gegenprobe um 20:34 MESZ bestätigt
diese Zuordnung; sie führt keine erneute Vollhash-/Integritätsprüfung oder Anbieteranfrage aus.

Häufigste Reichspaare, nur als Bestandsvergleich, nicht als bestätigte Identitätsmigration:

| Bisherige / zusätzliche Reichsbezeichnung | Fälle |
| --- | ---: |
| Bacteria / Bacillati | 1.143 |
| Bacteria / Pseudomonadati | 481 |
| Viruses / Orthornavirae | 211 |
| Übrige Reichspaare | 338 |

Auch deutlich unterschiedliche Paarungen kommen vor, etwa Animalia/Plantae (35) und Animalia/Fungi (20).
Beispiele: `Rickettsia africae` (Bacteria/Pseudomonadati), `Furovirus avenae` (Viruses/Orthornavirae),
`Calyptra cordobensis` (Animalia/Fungi). Gleicher Name belegt weder gleiche Art noch einen Split/Merge;
Namensgleichheiten und unterschiedliche Anbieter-Klassifikationen sind ausdrücklich nicht automatisch
zusammenzuführen.

Ursache im Eingangsweg: `localBuildInputs()` des Reparaturdienstes fordert mit
`recheckKnownReferenceGaps: true` eine erneute lokale CoL-Prüfung **aller** gebundenen Namen, nicht nur der
154 Reparaturzeilen. `streamColRecords()` überspringt dadurch die früher markierten Lücken nicht. Die
vorhandenen reichsgebundenen Identitätsregeln erzeugen für die abweichenden CoL-Reiche getrennte IDs und
erhalten die alten IDs. Der Quellenentwurf selbst verändert weiterhin nur die 154 belegten Quellzeilen.

Keine blockierenden Konflikte gemeldet; dennoch enthält der Kandidat 116.942 offene `reference-gap`- und
1.418 `reference-returned`-Hinweise gegenüber vorher 118.338 `reference-gap`-Hinweisen. Diese Hinweise sind
keine bestätigte Entscheidung über die 2.173 gleichnamigen Reichs-Gegenstücke. Ein technisch aktivierbarer
Kandidat ist deshalb noch nicht fachlich freigegeben.

**Nächster Schritt benötigt Abstimmung:** Behandlung dieser 2.173 Fälle und gewünschte Eingrenzung des
Reparaturwegs klären. Bis dahin Kandidat, Auftrag, reparierte Quelle, Historienvormerkung und Vorgänger erhalten;
keine Aktivierung, pauschale Identitätsheuristik, weiteren Historienfälle, Bereinigung oder neuen Produktivlauf.
Die gemeinsame Master-/Lightroom-Aktivierung bleibt eine spätere gesonderte Freigabe. Die Wiedervorlage
`taxonomie-reparaturkandidaten-pr-fen` ist nach diesem Abschlussbefund auf `PAUSED` gesetzt; keine weiteren
automatischen Prüfungen dieses Laufs. Keine Lightroom-Katalogprüfung, keine Verbraucher-Bedienabnahme und kein
Phase-10-Abschlussaudit; keine unaufgeforderte Commit-/Push-Aktion.

Für diese Abschlussprüfung keine produktive Code-/Lua-/Website-/CSS-Änderung. Die zuvor dokumentierten
161 Implementierungstests wurden nicht erneut ausgeführt; aktuelle Prüfung ist der oben beschriebene
lesende reale Kandidatenvergleich. Übergabe, README, Roadmap und dieser Reparaturvertrag wurden nachgeführt.
Die lokalen Dokumentationsverweise (68 Markdown-Dateien), Status-Synchronisierung/-Prüfung und
`git diff --check` bestehen. Die Status-Synchronisierung ergibt keine inhaltliche Git-Änderung.
Kein vollständiges `quality:ci`; bestehende Änderungen anderer Arbeitsschritte erhalten.

### Lesende Eingrenzungsprüfung nach Felix' „Weiter“ am 30. September

Letzte Gegenprobe um 21:12 MESZ, Exit 0. Keine produktive Codeänderung, kein Kandidatenbau, keine Aktivierung
oder Anbieteranfrage. Die ursprünglichen Quellen und der vorbereitete Reparaturstand wurden ausschließlich
lesend verwendet. Gegenübergestellt wurden die **echten** Eingangsleser `collectColRecords()` mit unverändertem
lokalem CoL-Stand `col-xr-2026-08-26-316165`, einmal normal und einmal mit erzwungener Lückenprüfung.
Der normale Masterdienst setzt die erzwungene Prüfung nur bei geändertem Referenzrelease; der Reparaturdienst
setzt sie unabhängig vom Release auf `true`.

| Begrenzte Namensgruppe | Erzwungener Reparaturweg | Normaler Weg, gleiche CoL-Version |
| --- | ---: | ---: |
| 2.173 zusätzliche Reichs-Gegenstücke | 2.173 CoL-Zeilen | 0 CoL-Zeilen |
| 154 bestätigte Reparaturnamen | 150 CoL-Zeilen | dieselben 150 CoL-Zeilen |
| 1.418 zusätzliche `reference-returned`-Fälle | 1.418 CoL-Zeilen | 1 CoL-Zeile |

Die 154 reparierten iNaturalist-Zeilen sind im aktuellen reparierten Quelleneingang vorhanden, durch den echten
Auswahlfilter zugelassen und ergeben exakt die ursprünglichen stabilen IDs. Die vier Namen ohne CoL-Zeile
sind die vier bestätigten technischen Reichsreparaturen. Die 2.173 Zusatznamen überschneiden sich nicht mit
den 154 Reparaturnamen; auch sämtliche 1.418 zurückgekehrten Referenzfälle liegen außerhalb davon.
Der verbleibende normale Referenztreffer heißt im gespeicherten Stand `BatracobdelIa conjugata`, CoL `VQDN9`.
Deshalb allein `true` durch `false` zu ersetzen nicht als vollständige Eingrenzung ausgeben.

#### Quellenverbindungen statt Namensheuristik

Die alten Gegenstücke der 2.173 Zusatzzeilen besitzen ausschließlich iNaturalist-Belege. Die lokalen
CoL-Zeilen enthalten 1.703 `inat:`-Kennungen auf 1.701 Zeilen. Prüfung gegen die tatsächlich gespeicherte
iNaturalist-Anbieter-ID, keine Ableitung aus Namen:

| CoL-Verweis auf iNaturalist | CoL-Zeilen |
| --- | ---: |
| Genau eine ID, identisch zur alten Anbieter-ID | 1.693 |
| Genau eine ID, abweichend von der alten Anbieter-ID | 6 |
| Mehrere unterschiedliche IDs | 2 |
| Kein `inat:`-Verweis vorhanden | 472 |

Beispiel übereinstimmend: `Rickettsia africae`, iNaturalist `1005188`, CoL `inat:1005188` trotz verschiedener
Reichsbezeichnung. Beispiel abweichend: `Geocharis fusiformis`, alte Anbieter-ID `1131376`, CoL-Verweis
`inat:1645081`. Mehrdeutig sind `Phormidium puteale` und `Aphanocapsa litoralis` mit jeweils zwei IDs.
Verweise wurden strikt als `inat:<numerische ID>` gelesen; keine nicht verstandenen Kennungen verbleiben.

Die 1.693 Übereinstimmungen sind belegte Querverweise auf denselben Anbieterdatensatz, nicht bereits bestätigte
Reichs-/Identitätsentscheidungen. Für die übrigen 480 Zeilen genügt dieser Nachweis nicht. Weder 2.173 neue
Arten noch 2.173 Dubletten oder ein automatischer Split/Merge sind damit bestätigt. Quellenunterschiede und
Reichsgrenzen bleiben im regulären Updatevertrag vor dem Audit getrennt zu behandeln. Die enge Reparatur
benötigt diese zusätzlichen Beziehungen nicht.

#### Damals abgeleiteter enger Umsetzungsschritt (anschließend implementiert, siehe Prüfabschluss unten)

1. Die identische aktive CoL-Herkunft ausdrücklich binden. Eine geänderte Referenz ist ein anderer Updateumfang
   und verlangt neue Vorschau/Freigabe, nicht eine nebenbei erweiterte Quellenreparatur.
2. Unbeteiligte CoL-Belege aus dem geprüften Ausgangsstand erhalten; neue lokale Quellenbelege gezielt den
   bestätigten Reparaturfällen zuordnen. Gleiche Namen sind dabei keine neue Identitätszuordnung.
3. Den tatsächlichen Kandidatenumfang prüfen: keine zusätzlichen IDs oder unbestätigten Beleg-/Wertänderungen
   außerhalb der 154 Fälle; vier historische Ersatz-IDs und sämtliche bisherigen IDs weiter erhalten.
   Enge Prüfung zusätzlich zu den bisherigen vollständigen Fach-, Struktur- und Kontinuitätsprüfungen.
4. Den bereits installierten reparierten Quellenstand und die vier Historienvormerkungen berücksichtigen.
   Einen neuen bestätigten Ersatzauftrag mit frischer Regel-/Eingangsbindung vorbereiten, ohne alten Kandidaten,
   Auftrag oder Originalreleases zu überschreiben. Ein alter Auftrag bindet die bisherigen Aufbauregeln und
   darf nach deren Änderung weder als unverändert fortgesetzt noch durch Nachtragen einer neuen Prüfsumme
   passend gemacht werden. Ein bloßes erneutes Ausführen des alten Reparaturaufrufs ist kein neuer Plan.
5. Erst nach isolierten Tests den neuen lokalen Kandidatenlauf separat freigeben. Keine direkte Bearbeitung
   der fertigen Kandidaten-SQLite zur Entfernung der Zusatzzeilen; Such-/Beleg-/Eingangsgrundlagen und Prüfwerte
   müssen aus demselben kontrollierten Aufbau stammen. Paaraktivierung bleibt eine weitere eigene Freigabe.

Die Eingrenzungsprobe ist kein neuer vollständiger Kandidatenvergleich und garantiert noch keine künftige
Kandidaten-Endmenge. Sie belegt den Eingangsfehler und die Erhaltung der 154 Aufnahme-/ID-Grundlagen im engeren
Weg. Fünf Datenbank-Dateigrößen und Schreibzeiten sowie vier kleine Status-/Zeigerdateien vor/nach unverändert.
Die Quellenleser validieren ihre lokalen Quellenmanifeste; keine erneute Vollhash-/Integritätsprüfung sämtlicher
großer Datenbanken. Zwei vorhandene gezielte Regressionstests für unveränderte Referenz und echten Referenzwechsel
erfolgreich. Reproduzierbare lokale Gegenprobe unter ignoriertem `Testlauf/`; kein Produktionsmodul geändert.

## Enge Korrektur und bestätigungspflichtiger Ersatzweg – 30. September

Felix hat die Implementierung und isolierte Prüfung anschließend mit „Los“ freigegeben. Diese Freigabe umfasst
keinen neuen produktiven Kandidatenlauf und keine gemeinsame Master-/Lightroom-Aktivierung.

### Eingangs- und Kandidatengrenze

`taxonomy-source-recovery-scope.mjs` übernimmt den `col.jsonl`-Eingang des **aktiven** Masterauftrags unverändert.
Aktiver Master, dessen Eingangsmanifest, `buildJobRevision`, unverändertes Rezept und Eingangsprüfsumme müssen
zusammenpassen. Das alte Rezept dient nur als Herkunftsbeleg, nicht zur Fortsetzung unter neuen Regeln.
Die lokale CoL-Version muss dieselbe sein. Fehlende/mehrdeutige Grundlagen, veränderte Dateien oder Referenzwechsel
stoppen den engen Weg; kein Rückfall auf eine globale Namenssuche.

Nur Namen der bestätigten Reparaturzeilen werden zusätzlich über den vorhandenen lokalen Eingangsleser gelesen.
Es gibt keine erzwungene Lückenprüfung über alle Namen. Neue CoL-Zeilen müssen zu Name, Rang und Reich eines
bestätigten Falls passen; gleiche Anbieter-IDs dürfen keinen gebundenen bestehenden Beleg verändern. Bisherige
CoL-Zeilen werden weder ersetzt noch erneut aus fremden Namen abgeleitet.

Zusätzlicher streamingbasierter Kandidatenvergleich gegen den aktiven Master, außerhalb der ursprünglichen und
historischen Ersatz-IDs des Plans: IDs/Identität/Lebenszyklus, Referenz-/Statusangaben, Quellbelege, Quellnamen,
Aufnahmegründe, alle Feldwerte und ihre Auswahl/Prüfzustände, Aliasse, Konfliktzustände, eigene Entscheidungen,
Projektverknüpfungen und Suchbegriffe müssen semantisch identisch sein. Neue IDs sind damit ebenfalls gesperrt.
Beobachtungs-/Aufbauzeiten und releaseabhängige interne Zeilennummern dürfen wechseln; reale fachliche Werte
nicht. Die sonstigen vollständigen Schema-, Fach-, Kontinuitäts- und Paketprüfungen bleiben erhalten.

Die Grenze ist Bestandteil des frischen Auftrags und des Kandidatenmanifests (`sourceRecoveryScope`). Sie wird
**vor** der Übergabe des fertigen Worker-Kandidaten, bei der regulären Kandidatenprüfung und bei der kopierten
Paarvorbereitung gegen den ursprünglichen aktiven Master geprüft. Ein Scopefehler hinterlässt einen fehlgeschlagenen,
nicht fertig aktivierbaren Auftrag; es wird weder eine Quelle installiert noch ein Zeiger gewechselt.
Die kleinen Umfangs-/Ersatzmodule sind auch in der Regel-/Dateibindung enthalten. Alte Produktivaufträge sind nach
dieser Codeänderung nicht unverändert ausführbar; kein Rehash oder Umschreiben zur Umgehung dieses Schutzes.

### Vorhandenen fertigen Reparaturstand sicher ersetzen

`taxonomy-source-recovery-replacement.mjs` behandelt ausdrücklich einen **fertigen, nicht aktivierten** früheren
Reparaturauftrag mit bereits installiertem Quellenstand und unveränderter Historienvormerkung. Es prüft Herkunft,
Originalreleases, aktive Paare, Projekt-/Namensentscheidungen, alte Entwurfs-/Auftragsdateien und Kandidatendateien.
Geänderte Quellen/Entscheidungen, fremde Aufträge/Kandidaten oder unbekannte Aufbewahrungsziele verlangen einen neuen
abgestimmten Umfang. Das Modul ist kein allgemeiner Ersatz beliebiger gescheiterter oder aktivierter Aufträge.

- `replacement-preview`: ausschließlich lesend, mit ursprünglicher `--revision`; liefert eine frische Planrevision,
  den aufbewahrten Zielpfad und die gebundenen Dateien. Kein neuer Auftrag, kein Verschieben, kein Kandidatenbau.
- `replacement-candidate`: zusätzlich `--confirm`, die **frische** `--plan-revision` und dieselbe ausdrücklich bestätigte
  `--replacement-decisions`-Datei erforderlich. Ausdrückliche Prozess-/Korrektursperren, erneute Eingangsprüfung und
  Platzreserve. Die alte Freigabe oder allein „candidate“ reicht nicht.
- Erst nach dieser Bestätigung wird ein Ersatzjournal geschrieben und der exakt gebundene alte `master/staging`
  nach `master/source-recovery/retained-candidates/recovery-<ursprüngliche Revision>` verschoben. Das ist Aufbewahrung,
  keine Löschung. Der neue UUID-Auftrag verwendet denselben installierten Quellenstand und dieselben vier Ereignisse;
  alte Auftragseingänge, Rezept, Status und Originalreleases werden nicht verändert. Nur der aktuelle Auftragsverweis
  darf kontrolliert auf den neuen Auftrag wechseln. Neue Quellen-/Historieninstallation ist nicht erforderlich.
- Journalphasen `reserved`, `building`, `ready` ermöglichen Wiederaufnahme nach Fehler/Abbruch, auch zwischen
  Aufbewahrung und Auftragssicherung. Der neue Auftrag bleibt nach Workerfehler derselbe. Wiederholung nach Erfolg
  erzeugt keinen weiteren Auftrag. Zusätzliche/fehlende Alt-Kandidatendateien oder geänderte Prüfsummen sperren.
- Eine spätere Rücknahme des Ersatzwegs ist **nicht** durch diese Implementierung freigegeben: vorhandenen
  Aufbewahrungspfad und Journal erhalten, Eingangsstand prüfen und nötige Rückkehr gesondert abstimmen. Die alten
  Aufbauregeln dürfen auch dann nicht durch Überschreiben ihrer Bindungen wieder „passend“ gemacht werden.

Beide CLI-Aktionen benötigen dieselben expliziten absoluten Projekt-/Speicherpfade und ursprünglichen
`--previous-version`/`--current-version`-Angaben. Keine produktiven Standardpfade, keine Aktivierungsaktion.
Noch kein neues UI-Angebot und kein automatischer Start beim Öffnen des Explorers.

### Isolierter Prüfabschluss und nächste Freigabe

Die Reparaturtests prüfen den echten lokalen Eingangsleser mit gleichnamigem CoL-Taxon aus anderem Reich,
Quellen-/Referenz-/Rezeptänderungen, Abbruch, Workerfehler, Neustart/Wiederholung, unbekannte Ziele, vollständige
Erhaltung des Altauftrags und archivierten Kandidaten sowie die reguläre Kandidaten- und kopierte Paarprüfung.
Ein Test fügt fachfremde IDs/Belege/Werte/Namen/Konflikte ein und bestätigt die Sperre. Ein Scopefehler wird auch
vor Worker-Veröffentlichung abgefangen. Echte Hilfsprozesse laufen ausschließlich gegen temporäre Testbestände.

Prüfabschluss: **111 Tests in sechs direkt zugehörigen Testdateien bestanden**, darunter **31 Reparaturtests**:
`taxonomy-source-recovery.test.mjs`, `taxonomy-master-inputs.test.mjs`, `taxonomy-master-worker.test.mjs`,
`taxonomy-master-regression.test.mjs`, `taxonomy-master-service.test.mjs` und `lightroom-search-package.test.mjs`.
Syntaxprüfung (348 JS-/MJS-Dateien), Quelltextstil, lokale Dokumentationsverweise (68 Markdown-Dateien),
Projektstatusprüfung und `git diff --check` erfolgreich. Bestehende Änderungen anderer Schritte erhalten.
Ein Zwischenlauf meldete `ENOTEMPTY` beim Aufräumen des temporären Windows-Verzeichnisses eines vorhandenen
Synonym-Regressionsfalls. Keine fachliche Assertion betroffen; nach der letzten Umfangsprüfung bestanden dieselben
sechs Testdateien vollständig erneut (111/111, Exit 0). Keine Änderung am produktiven Bestand oder an diesem
vorhandenen Synonymvertrag zur Umgehung des Aufräumfehlers.

Noch kein realer Ersatzkandidatenvergleich, keine Zusage der künftigen Endmenge oder Laufzeit. Die produktive
Vier-Ereignis-/154-Fälle-Reparatur und fünf Namenspräferenzen müssen nach einem später ausdrücklich bestätigten
Lauf erneut vollständig gelesen und bewertet werden. Die 2.173 getrennten Reichs-/Quellenfälle bleiben außerhalb
dieser Reparatur und vor dem Audit im regulären Updatevertrag zu behandeln.

Als nächster Schritt war die frische **lesende Ersatzvorschau** vorgesehen; sie ist inzwischen geprüft (siehe unten).
Paaraktivierung bleibt eine weitere eigene Freigabe. In diesem Implementierungsschritt keine produktiven Daten
verändert, keine Bereinigung, Downloads, Foto-/Projektmigration oder Commit-/Push-Aktion. Kein vollständiges
`quality:ci` oder Phase-10-Abschlussaudit. Dokumentation nachgeführt; Squarespace-Footer geprüft: nur lokale
MJS-Wartungs-/Backendmodule betroffen, keine Website-`?v=`- oder Plug-in-Versionsänderung erforderlich.

## Lesende Ersatzvorschau – 1. Oktober 2026

Felix hat mit „los“ ausschließlich die neue Vorschau freigegeben, keinen produktiven Ersatzaufbau. Der reguläre
Wartungsweg `replacement-preview` wurde mit expliziten Speicher-/Projektpfaden und ursprünglicher Reparaturrevision
ausgeführt. Abschluss um **15:08:34 MESZ**, **Exit 0**, **67,42 s** einschließlich lokaler Kontrollprüfung.
Lokales, nicht versioniertes Ergebnis: `Testlauf/taxonomy-replacement-preview-2026-10-01-result.json`.
Aufruf und Vorher-/Nachher-Belege liegen ebenfalls im ignorierten `Testlauf/`; keine zusätzliche produktive Speicherung.

### Gebundener Befund

- Ursprüngliche Reparaturrevision:
  `a6bdf57a5b2fcc6820dc661cb344afdd154f1f82b3aeb2d1f7e79bf2f05c003e`.
- **Frische Ersatzplanrevision:**
  `9beccf7fe76602f74b7d75fb938201e8c683e286795e7624b930751e25424516`.
  Der Ergebnisdigest wurde unabhängig aus dem ausgegebenen Plan erneut berechnet und bestätigt.
- **154 bestätigte Reparaturzeilen**, darunter **vier historische Ersatz-IDs**. Die ursprüngliche Entscheidungsdatei
  `Testlauf/taxonomy-source-recovery-2026-09-30-decisions.json` entspricht weiterhin exakt der gebundenen
  Vier-Fälle-Historienpolitik; keine neue Identitätsentscheidung oder Foto-/Projektmigration.
- Installierte Quelle `recovery-a6bdf57a5b2fcc6820dc661c` gehört unverändert zum fertigen ursprünglichen Reparaturauftrag.
  Originalstände `snapshot-20260903164505354` und `snapshot-20260927072533099` sowie die übrigen ausgewählten
  Anbieterstände unverändert. Lokale CoL-Referenz `col-xr-2026-08-26-316165` passt zur eingefrorenen Grundlage
  des aktiven Masterauftrags; dessen Rezept/CoL-Eingang sind prüfsummengebunden, nicht neu ausführbar gemacht.
- Altauftrag `job-bfb06bf7-94b3-4c69-be2c-42af970a1f3a` weiterhin `ready` und mit vorhandenem
  Kandidaten `master-20260930174712224` verbunden. Keine Änderung von Rezept, Status, Eingängen oder Kandidat.
- **43 Eingangsdateibindungen** und **17 zusätzliche Auftrags-/Kandidaten-Dateibindungen** geprüft, mit erneuter
  Frischeprüfung innerhalb des Vorschauwegs. Darunter vollständige SHA-256-Prüfsummen beider bisherigen Master,
  beider Suchpakete, Original-/Reparaturquellen, alten Kandidaten-/Auftragsdateien und neuen Regelmodule.
  Diese zwei Bindungslisten sind keine Behauptung über 60 verschiedene Dateien; einzelne Pfade überschneiden sich.
- Veröffentlichungszeiger unverändert: aktiv `master-20260928064750796` mit
  `lightroom-3953cad48c24e581d041`; Vorgänger `master-20260905054823067` mit
  `lightroom-946c961bd063fd1b8f12`. Vollhashes und Manifeste passen zu beiden Zeigereinträgen.
- Zusätzlich zehn kleine Status-/Projekt-/Korrekturdateien vor/nach dem Aufruf per SHA-256 identisch;
  Größen und Schreibzeiten der fünf Master-/Suchpaket-Datenbanken identisch. Keine neuen Produktionsdateien.
- Aufbewahrungsziel `master/source-recovery/retained-candidates/recovery-<ursprüngliche Revision>` frei;
  `master/source-recovery/replacements/recovery-<ursprüngliche Revision>.json` weiterhin nicht vorhanden.

### Grenzen und nächste Bestätigung

Die Vorschau prüft Eingangs-/Herkunftsbindung und sichere Ersetzbarkeit des vorhandenen Standes. Sie startet
keinen Hilfsprozess, baut keinen neuen Kandidaten, liest keinen Lightroom-Fotokatalog und aktiviert nichts.
Keine erneute vollständige `quick_check`-/Fachprüfung des Alt-Kandidaten und kein tatsächlicher enger
Ersatzkandidatenvergleich in diesem Schritt. Die 111 isolierten Tests sind der zuvor dokumentierte
Implementierungsnachweis, nicht ein erneut ausgeführter Testlauf dieser Vorschau.

**Nach der Vorschau notwendige Nutzerentscheidung:** den lokalen Ersatzkandidatenlauf ausdrücklich an die oben genannte
frische Planrevision und unveränderte Vier-Fälle-Entscheidungsdatei binden. Erst dann Alt-Kandidaten am exakt
genannten Ziel erhalten, neuen Auftrag unter aktuellen Regeln sichern und den Kandidaten aufbauen/prüfen.
Alter Auftrag und Originalreleases bleiben erhalten; bei geänderten Eingängen stoppt der Weg. Keine Zusage
der Endmenge oder Dauer vor dem echten Lauf. Der vollständige Vergleich muss anschließend alle 154
ursprünglichen IDs, vier historische Ersatz-IDs, fremde unveränderte Fachwerte, eigene Namen, Projektlinks
und Konflikte erneut bestätigen. Die 2.173 zusätzlichen Quellenfälle gehören nicht in diesen Reparaturauftrag.

Die gemeinsame Master-/Lightroom-Paaraktivierung bleibt eine **weitere separate Freigabe nach Abschlussprüfung**.
Keine Bereinigung, Anbieterdownloads, Katalogaktionen, automatisierte Wiedervorlage oder Commit-/Push-Aktion
in diesem Vorschauschritt. Nur die vier zuständigen Dokumente und lokale Prüfartefakte nachgeführt;
keine Backend-, Website- oder Plug-in-Codeänderung.

## Bestätigter Ersatzlauf – 1. Oktober 2026

Felix hat den beschriebenen lokalen Ersatzkandidatenlauf mit **„ja“** freigegeben: frische Planrevision
`9beccf7fe76602f74b7d75fb938201e8c683e286795e7624b930751e25424516`, unveränderte ursprüngliche
Reparaturrevision und dieselbe Vier-Fälle-Entscheidungsdatei. Keine Aktivierung, Rücknahme, Löschung,
Foto-/Projektmigration oder Erweiterung um die 2.173 getrennten Quellenfälle.

Der reguläre `replacement-candidate`-Aufruf mit allen expliziten Pfaden, beiden Revisionen und `--confirm`
lief in Ausführungssitzung **83773**. Der Windows-Speicher hatte vor Start rund **118,21 GiB** frei;
Staging- und Aufbewahrungsziel sind als absolute Pfade im bestätigten Masterbereich geprüft. Der Zielordner
und das Ersatzjournal waren unbesetzt. Keine konkurrierende Explorer-API auf Port 4177 festgestellt.

### Historischer Start- und Begleitstand

- Frische Eingangsprüfung hat die bestätigte Planrevision akzeptiert. Neues Ersatzjournal seit
  **15:17:26 MESZ**, Zustand **`building`** nach gesichertem Auftrag.
- Alter Kandidat `master-20260930174712224` am exakt gebundenen Ziel
  `master/source-recovery/retained-candidates/recovery-a6bdf57a5b2fcc6820dc661cb344afdd154f1f82b3aeb2d1f7e79bf2f05c003e`
  erhalten. Kein Löschen oder nachträgliches Ändern des alten Auftrags.
- Neuer Auftrag **`job-65f8c166-6d9e-4e00-b471-35b761e2927f`**, Auftragsrevision
  `0d69de1bf04090c58d30ce7bcc67ff29be30b0e41f0b33b7c922aebf69c883d7`.
- Hilfsprozess **PID 30104**, seit **15:21:07 MESZ**. Eingänge geprüft/gesichert, anschließend Masterdatenbank
  schreiben. Kleiner gespeicherter Status um **15:22:53 MESZ**: **22.000 von 273.462 geplanten aktiven Taxa**
  gesichert. Das ist kein Gesamtprozent oder Abschlussnachweis; historische IDs/Endmenge erst danach vergleichen.
- Folgeprüfung der kleinen Statusdatei um **15:30:13 MESZ**: alle **273.462 Taxa** geschrieben,
  Suchindex **1.276.000 von 6.186.155 Einträgen**. Weiterhin **`building`**, kein Fehler gemeldet.
  Keine vollständige Datenbankabfrage oder neue Integritätsprüfung während dieser Begleitung.
- Noch kein abgeschlossenes Ersatzjournal, fertiger Kandidat oder neues Lightroom-Paket nachgewiesen.
  Der Wartungsweg wechselt keinen Veröffentlichungszeiger; Aktivierung bleibt ausdrücklich ausgeschlossen.

Die WMI-Prozessabfrage war in der eingeschränkten Diagnoseausführung nicht erlaubt. Keine Sicherheits-/Windows-
Einstellung geändert oder zusätzliche Messfreigabe benutzt. Worker-PID und Startzeit stammen belastbar aus
seiner kleinen gespeicherten `state.json`; die laufende Ausgabe stammt aus der oben genannten Sitzung.

### Begleitung und Abschlussgrenze

Die vorhandene Wiedervorlage `taxonomie-reparaturkandidaten-pr-fen` ist für **diesen** bestätigten Ersatzlauf
aktualisiert und mit unverändertem 30-Minuten-Abstand reaktiviert. Nur Ausgabe und kleine Statusdateien während
des Aufbaus; kein zweiter Lauf, keine wiederholten vollständigen Datenbankprüfungen. Bei geändertem Eingangsstand
oder nötiger neuer Freigabe anhalten. Nach vollständiger Prüfung oder gemeldetem nutzerabhängigem Hindernis
die Wiedervorlage wieder auf `PAUSED` setzen. Die Aufgabenplanung wurde anhand des OpenAI-Docs-Leitfadens geprüft;
keine Erweiterung der fachlichen Reparaturfreigabe.

Der vorbereitete lokale Vergleich `Testlauf/taxonomy-replacement-verify-2026-10-01.mjs` darf **erst nach Exit 0 und
`ready` in Auftrag/Ersatzjournal** ausgeführt werden. Er prüft lesend tatsächliche Mengen, alle 154 ursprünglichen
IDs und vier historischen Ersatz-IDs, keinerlei fremde zusätzliche IDs, vollständigen semantischen Fremdbestand,
Quellenherkunft, eigene Felder/Namen, Projektlinks, Konflikte, technische Historie, reguläre Kandidatenprüfung,
Integrität sowie Original-/Altauftragsdateien und Zeiger. Ergebnis lokal unter ignoriertem `Testlauf/` speichern
und in den vier zuständigen Dokumenten nachführen. Kein alter Freigabeprüfer zur nachträglichen Umschreibung
des Altauftrags. Der Vergleich ist vorbereitet, noch nicht ausgeführt; kein Abschluss behauptet.

Kein vollständiges Qualitätsgate, produktiver Verbrauchercheck, Audit oder Commit/Push in diesem Startschritt.
Gemeinsame Master-/Lightroom-Aktivierung erst nach dokumentiertem Ergebnis und weiterer gesonderter Freigabe.

## Schutzabbruch und lesende Fehlerdiagnose – 1. Oktober 2026

Der Wartungsaufruf endete mit **Exit 1**. Auftrag
`job-65f8c166-6d9e-4e00-b471-35b761e2927f` ist seit **15:42:02 MESZ** `failed`:

```text
Reparaturumfang überschritten: Konflikte außerhalb der bestätigten Fälle verändert.
```

Hilfsprozessstart **15:21:07 MESZ**, Laufzeit **20 min 54,6 s**. Die Datenbank und der Suchindex wurden
geschrieben; die abschließende Umfangsprüfung schlug vor Manifest und Staging-Übergabe fehl. Die private
Datenbank liegt weiterhin unter
`master/build-jobs/job-65f8c166-6d9e-4e00-b471-35b761e2927f/candidate/taxonomy-master.sqlite`.
Kein fertiger Staging-Kandidat, kein neues Lightroom-Paket und kein Veröffentlichungswechsel. Der alte breite
Kandidat bleibt am exakt bestätigten Aufbewahrungsziel. Keine Originaldateien gelöscht oder zurückverschoben.

Das Ersatzjournal steht weiterhin auf der zuletzt gesicherten Workflowstufe **`building`**. Dies ist kein Beleg
für einen laufenden Worker; dessen Auftrag und beendete Ausführung sind maßgeblich. Journal/Auftragsprüfsummen
nicht zur Darstellung eines Erfolgs nachträglich ändern. Die Wiedervorlage ist nach dem gemeldeten Hindernis
wieder **`PAUSED`**.

### Tatsächlicher Befund

Lesende Diagnose um **15:46 MESZ**, keine Aktivierungsprüfung. Alle Verbindungen schreibgeschützt,
`query_only=ON`; Bericht nur unter ignoriertem `Testlauf/`:

- **26 zusätzliche**, keine entfernten Konfliktzeilen außerhalb der 154 ursprünglichen/vier historischen IDs.
  Sämtliche Zusätze sind offene `reference-gap`-Hinweise ohne Feld, mit dem Hinweis
  `Keine exakte Artzeile in der aktiven CoL-Referenz.`
- Gesamte Konfliktmenge **118.338 → 118.360**. Außerhalb des Plans **118.334 → 118.360**;
  die Differenz der Gesamtmenge ist wegen vier entfallender Konflikte innerhalb der Reparatur nur +22.
- Private Datenbank **273.466 IDs**, davon **273.462 aktiv**, **vier historisch**. Alle **154 ursprünglichen IDs**
  aktiv, alle vier Ersatz-IDs historisch. Sämtliche IDs des aktiven und vorherigen Masters enthalten;
  **keine zusätzliche fremde ID**. Die 2.173 Zusatz-IDs des alten breiten Kandidaten sind nicht enthalten.
- Alle **60 Projektlinks** und **46 ausgewählten eigenen Felder** unverändert, darunter die fünf deutschen
  Namen Taubenschwänzchen, Rotstirnamazone, Leopard, Rebhuhn und Weissstorch. Technischer Vier-Fälle-
  Historienstand passt zur vorbereiteten Historienrevision. Keine Foto-/Projektmigration.
- **58 verschiedene gebundene Original-/Eingangs-/Aufbewahrungsdateien** mit vollständigen SHA-256-Prüfsummen
  unverändert, einschließlich alter Master/Pakete, Original-/Reparaturquellen und alter Auftragsdateien.
  Veröffentlichungszeiger unverändert. Private Fehlerdatenbank vor/nach Lesen mit gleichem Hash
  `a00aa8e01606d7e51a65c63fa8419cecc8135b1844086b6e8ea484fb9e1e16ce`.

Lokale Nachweise: `Testlauf/taxonomy-replacement-failure-2026-10-01-result.json` und
`Testlauf/taxonomy-replacement-conflict-cause-2026-10-01-result.json`. Keine versionierten Produktivdaten daraus
erzeugt. Die erste Prüfung dauert rund 34,4 s nach dem anfänglichen privaten Datenbankhash; die begrenzte
Ursachenprüfung betrifft nur die bereits bestimmten 26 IDs.

### Auslöser und Korrekturgrenze

Für **alle 26 IDs** bestätigt die begrenzte Gegenprüfung: bereits im aktiven Master `reference-gap`, dort
**keine Konfliktzeile**, im Vorgänger vom 5. September noch nicht vorhanden. Keine Projektlinks oder eigenen
manuellen Felder. Anbieter-ID, Quellenname, Reich und Quellen-Matchzustand sowie Master-Referenzzustand sind
zwischen aktivem und privatem Ergebnis identisch. Größen/Schreibzeiten der drei dabei gelesenen Datenbanken
vor/nach der Gegenprüfung gleich.

Die allgemeine Regel `referenceGapNeedsReview` in `taxonomy-master-candidate.mjs` erzeugt ohne exakten CoL-Beleg
schon dann einen offenen Hinweis, wenn `previousMasterTaxon` vorhanden ist. Beim ersten Aufbau dieser Einträge
fehlte ein solcher Vorgänger; beim erneuten Aufbau ist er vorhanden. Damit werden Hinweise neu erzeugt, ohne
neue Quellenänderung. Das verletzt den engen Reparaturvertrag, der auch fremde Konfliktdaten unverändert verlangt.
Beispielsweise betroffen: Weißtannentrieblaus (`Adelges nordmannianae`) sowie der getrennte Plantae-Beleg
`Chloris chloris`. Letzterer ist **nicht** der Grünfink; daraus keine Identitätszusammenführung ableiten.

**Nach dem Abbruch gesondert abzustimmender Schritt (inzwischen bestätigt und umgesetzt, siehe unten):**
Konfliktdaten unbeteiligter Einträge im ausdrücklich engen
Reparaturweg erhalten und den Erst-/Folgeaufbaufall zunächst isoliert testen. Die allgemeine Fachregel für reguläre
Updates nicht ungeprüft abschalten, die Umfangssperre nicht abschwächen und keine zusätzlichen 26 Fälle freigeben.
Frische Regel-/Planbindung sowie Umgang mit dem fehlgeschlagenen Auftrag vor neuem Produktivlauf bestätigen;
alte Regel-/Auftragsprüfsummen nicht umschreiben. Die ursprüngliche Laufbestätigung erlaubt keinen automatischen
Neustart, keine Kandidatenrückverschiebung und keine Aktivierung.

### Prüfgrenzen

Die Umfangsprüfung erreichte den Konfliktvergleich erst nach erfolgreichem Vergleich von IDs, Status,
Quellenbelegen/-namen, Aufnahmegründen, Feldwerten und Aliassen außerhalb des Plans. Die danach vorgesehenen
Vergleiche eigener Entscheidungen, Projektlinks und Suchbegriffe wurden von dieser Prüfung wegen des Fehlers
nicht mehr ausgeführt. Die zusätzliche Fehlerdiagnose prüfte Projektlinks und ausgewählte eigene Felder separat,
ersetzt aber weder diese vollständigen verbleibenden Vergleiche noch eine Integritäts-/Aktivierungsprüfung.

Der unabhängige vollständige Abschlussvergleich wurde wegen fehlendem Exit 0/`ready` **nicht ausgeführt**.
Kein fachlich freigegebener Kandidat, keine Aussage einer vollständigen Fehlerfreiheit, kein Qualitätsgate,
Verbrauchercheck oder Audit aus dem Teilbefund ableiten. Kein Produktionscode in dieser Fehlerdiagnose geändert,
kein neuer Lauf, keine Aktivierung, Bereinigung, Anbieterdownloads, Commit oder Push.

## Begrenzte Konfliktkorrektur – 1. Oktober 2026

Felix hat nach dem dokumentierten Schutzabbruch mit **„Ja“** ausschließlich die begrenzte Codekorrektur und
Regressionstests bestätigt. Kein erneuter Produktivlauf oder Paaraktivierung daraus ableiten.

### Implementierter Vertrag

`taxonomy-source-recovery-conflicts.mjs` läuft im privaten Kandidaten vor Such-/Fachprüfung und Manifestbildung,
**nur wenn ein ausdrücklicher `sourceRecoveryScope` vorhanden ist**. Reguläre Updates bleiben unverändert.

- Die ausdrücklich reparierten Original-/Historien-IDs sind ausgeschlossen. Für alle anderen IDs gilt der
  Konfliktbestand des aktiven Masters, einschließlich **keiner vorhandenen Konfliktzeile**. Neu berechnete
  Konflikt-/Entscheidungszeilen werden nur in der privaten Kandidatendatenbank durch diesen Altbestand ersetzt.
- Konflikt-ID, Typ, Feld, Zustand, ursprüngliche Erkennung, Auflösung und Notiz bleiben erhalten. Zugehörige
  eigene Entscheidungen behalten ID, Typ, Feld/Sprache, Zeit und Notiz. Keine bestätigte oder verworfene
  Entscheidung wird automatisch wieder geöffnet.
- Interne numerische Feldverweise dürfen sich beim Neuaufbau ändern. Zuordnung ausschließlich über dieselbe
  Master-ID, Feld, Sprache, exakten/normalisierten Wert, Herkunft, Konfidenz, Review-/Auswahlzustand, Anbieter und
  Anbieter-ID. Genau ein passender Kandidatenbeleg ist nötig, sonst Abbruch. Auch `NULL`-Konfidenz bleibt zulässig.
  Keine bloße Namenssuche, Wertähnlichkeit oder ID-Migration.
- Eine Entscheidung muss auf einen erhaltenen Konflikt derselben Master-ID verweisen. Quellenverbindung ist
  schreibgeschützt/`query_only=ON`. Dasselbe Quelldatenbankziel wird als Schreibziel ausdrücklich abgewiesen.
- Ein kandidatenlokaler Savepoint macht die Übernahme auch bei Fehler oder Pause atomar. Fremdschlüsselreihenfolge
  und erneute Übernahme verhindern Teilzustände/duplizierte Hinweise. Die Zeilen werden gestreamt; höchstens alle
  500 übernommenen Zeilen folgt eine Ereignisschleifen-/Fortschrittsübergabe.
- `recoveryConflictState` im Kandidatenmanifest zählt übernommene Konflikte/Entscheidungen. Es ersetzt keine Prüfung.
  Die unabhängige semantische Umfangssperre, reguläre Kandidatenprüfung und Paarfreigabe bleiben bestehen;
  unbeteiligte Quellen, Feldwerte, Status, IDs oder nachträgliche Konfliktänderungen bleiben verboten.
- Das neue Modul ist an den Regelfingerabdruck gespeicherter Masteraufträge und die Reparaturvorschau gebunden.
  Alte Aufträge/Bestätigungen erhalten **keine** nachträglich angepasste Prüfsumme oder Fortsetzungsfreigabe.

### Isolierter Prüfabschluss

Der neue Fehlfall reproduzierte vor der Implementierung exakt
`Reparaturumfang überschritten: Konflikte außerhalb der bestätigten Fälle verändert.`;
die Gegenprobe für den normalen Folgeaufbau bestand bereits davor.

Nach der Korrektur **160 Tests in acht direkt zugehörigen Dateien bestanden**, darunter **40 Reparaturtests plus
sieben Unterfälle**: `taxonomy-source-recovery.test.mjs`, `taxonomy-master-candidate.test.mjs`,
`taxonomy-master-regression.test.mjs`, `taxonomy-master-worker.test.mjs`, `taxonomy-master-inputs.test.mjs`,
`taxonomy-master-background-service.test.mjs`, `taxonomy-master-service.test.mjs` und `lightroom-search-package.test.mjs`.
Neun neue Testfälle mit sieben Unterfällen sichern fehlenden Hinweis, normales Update, verworfenen Hinweis und
eigene Wahl, alle fünf Konfliktzustände, neu nummerierte Feldverweise, fehlende/mehrdeutige Belege, Rücksetzung nach
Abbruch, Wiederholung, Quell-Schreibschutz, Workerfehler/Fortsetzung und neue Regelbindung ab.
Echte Hilfsprozesse, Paket-/Paarprüfungen laufen ausschließlich gegen temporäre Testbestände.

Der erste größere Gegenlauf meldete einmal `ENOTEMPTY` beim Aufräumen eines bestehenden Windows-Testordners
im Alt-Kandidaten-Kontinuitätstest. Dieser Test bestand einzeln; anschließend die vollständige erweiterte
Gegenprüfung 160/160 mit Exit 0. Keine Fachregel oder fremder Test zur Umgehung geändert.
Syntaxprüfung **349 JS-/MJS-Dateien**, Quelltextstil, Dokumentationsprüfung **68 Markdown-Dateien**,
Projektstatusprüfung und `git diff --check` erfolgreich. Kein vollständiges `quality:ci` oder Phasenabschlussaudit.
Squarespace-Footer geprüft: nur lokale Backend-/Test-MJS-Module, keine Website- oder Plug-in-Versionsänderung.

### Nächste Betriebsgrenze

Diese Implementierung verändert **keine produktive Datenbank**, keinen alten Kandidaten, kein Journal und keine
Auftragsdatei. Keine erneute vollständige Produktionsdatenprüfung, kein Neuaufbau, Anbieterdownload, Paarwechsel,
Katalogabgleich, Bereinigung oder Commit/Push. Wiedervorlage bleibt `PAUSED`.

Das vorhandene Ersatzjournal und sein fehlgeschlagener Auftrag sind weiterhin an den alten Regelstand gebunden.
Der aktuelle Ersatzweg verweigert bei geändertem Regel-/Eingangsstand eine automatische Umschreibung oder einfache
Wiederaufnahme. Daher zuerst einen **kontrollierten neuen Vorschau-/Auftragsweg** für diesen Stand abstimmen und
umsetzen; alte Nachweise und private Fehlerdatenbank erhalten. Diese zusätzliche Auftragsbehandlung wurde
anschließend bestätigt und implementiert (siehe unten). Erst danach frische Vorschau und produktiven Lauf prüfen.
Nach erfolgreichem neuem Lauf tatsächlichen Gesamtbestand vollständig vergleichen; die kleine Testfreigabe ist
keine fachliche Großbestandsfreigabe oder Garantie weiterer Fehlerfreiheit. Aktivierung bleibt separat.

## Kontrollierter Neustart – 1. Oktober 2026

Felix hat mit **„Los mach solange weiter bis die Reparatur abgeschlossen ist“** den kontrollierten Neustartweg,
die frische Vorschau, den lokalen Lauf und den vollständigen Kandidatenvergleich freigegeben. Die gemeinsame
Master-/Lightroom-Aktivierung, Foto-/Projektmigration, Bereinigung und Erweiterung um die 2.173 separaten Fälle
bleiben ausgeschlossen. Die bisherige Beschränkung auf 154 ursprüngliche und vier historische IDs gilt weiter.

`restart-preview` benötigt zusätzlich die fehlgeschlagene Planrevision. Es prüft das unveränderte Originaljournal,
den gespeicherten Fehlerstatus und die Selbstprüfsumme des alten Auftrags. Alle produktiven Datenbindungen müssen
weiter passen; ausschließlich lokale Backend-Code-/Regeländerungen sind zulässig. Der veröffentlichte Stand,
Quellen, Historienentscheidungen, Projekte und Namenswahl werden nicht neu ausgelegt. Vorhandener Kandidat,
fremder aktueller Auftrag oder aktive Prozesssperre verhindern den Neustart.

Die Vorschau bindet sämtliche alten gesicherten Dateien sowie das Fehlerjournal und den vollständigen Fehlerauftrag
einschließlich seiner privaten Datenbank. `restart-candidate` verlangt ursprüngliche Reparaturrevision,
fehlgeschlagene Planrevision, frische Planrevision, ausdrückliche Bestätigung und dieselben vier Entscheidungen.
Ein separates Journal unter `master/source-recovery/restarts/recovery-<Originalrevision>/after-<Fehlerplan>.json`
sichert den neuen Auftrag. Das alte Ersatzjournal, seine Regeln und Prüfsummen bleiben unverändert. Der bereits
aufbewahrte erste Kandidat wird nicht erneut verschoben. Wiederholung und erneutes Öffnen verwenden denselben
neuen Auftrag; geänderte Dateien sperren. Die vollständige reguläre und unabhängige Umfangsprüfung bleibt Pflicht.

Isoliert geprüft: lesende Vorschau, explizite Bindung/Bestätigung, echter Hilfsprozess, Erhalt beider aktiven/alten
Paare, aller alten Aufträge und des Fehlernachweises; Eingangsfehler, Abbruch, erneuter Workerfehler und Wiederholung
ohne doppelten Auftrag. Produktive Datenänderung, falscher Fehlerstatus, fremder Auftrag, Prozesssperre und falsche
Historienauswahl werden abgewiesen. **164 gezielte Tests in acht Dateien erfolgreich**, einschließlich der bisherigen
Konfliktkorrektur. Noch keine produktive Neustartvorschau oder Ausführung in diesem Implementierungsstand.

### Produktive Vorschau und Start

Die neue lesende Vorschau wurde am 1. Oktober um **16:53:22 MESZ** mit Exit 0 abgeschlossen, rund 64,5 s.
Sie bindet unverändert **154 Reparaturfälle und vier Historienentscheidungen**, das aktive Paar vom 28. September,
Quellen, eigene Entscheidungen, alten aufbewahrten Kandidaten und vollständigen Fehlerauftrag. Frische Planrevision:
`ebd6f0815afcb8bc86bd5077ce1f7002134fb2ba025256082ff4dc8c4b0d4df0`.
Lokales Protokoll: `Testlauf/taxonomy-restart-preview-2026-10-01-result.json`. Keine Änderung produktiver Dateien.

Anschließend `restart-candidate` mit ausdrücklicher Bestätigung dieser Revision und derselben vier Entscheidungen
gestartet, Ausführungssitzung **69913**. Start bedeutet zunächst erneute Eingangsprüfung; noch kein fertiger neuer
Kandidat, Ergebnisvergleich oder Paarwechsel. Während des Laufs keine vollständigen Produktionsdatenbankscans.
Der vorbereitete, nur lesende Abschlussprüfer ist für das neue Neustartjournal angepasst; er darf erst bei Exit 0
und Journal/Auftrag `ready` laufen. Ergebnisdatei: `Testlauf/taxonomy-restart-verify-2026-10-01-result.json`.

Kleiner gespeicherter Auftragsstatus um **17:10 MESZ**: Neustartjournal `building`, neuer Auftrag
`job-1c0243c8-e1d7-477d-8e5e-b775549bb0af`, Revision
`338ce21c8a4c0e0a9a144f1a27a9e64dc50aafe302e7ac35c7c4ad4433f48ab0`.
Worker PID **3432**, seit **16:59:17 MESZ**, Status `building`; **273.462/273.462** geplante Taxa geschrieben.
Suchindex **3.434.000/6.186.155**, rund **55,5 % dieses Teilschritts**, kein Gesamtprozent. Kein Fehler gemeldet.
Noch keine vollständige Kandidaten-/Abschlussprüfung. Aktives Paar unverändert; keine weiteren Bestandsscans.
Bestehende stille 30-Minuten-Wiedervorlage für diesen Auftrag reaktiviert, keine doppelte Automation eingerichtet.

Zwischenstand auf Felix' Statusfrage um **17:26 MESZ**: Worker meldet `ready`, Kandidat
`master-20261001145513036`, gespeichert um **17:21:21 MESZ**. Rund **22 min 4 s** Hilfsprozesslaufzeit.
Der übergeordnete Wartungsaufruf ist noch nicht beendet; seine frische Abschlussprüfung läuft weiter.
Kein Exit 0/Neustartjournal-`ready` oder unabhängiger Abschlussvergleich aus dem Workerstatus allein ableiten.
Noch keine fachliche Abschlussfreigabe oder Paaraktivierung.

## Vollständiger Kandidatenabschluss – 1. Oktober 2026

Der bestätigte Neustartaufruf endete mit **Exit 0**. Neuer Auftrag
`job-1c0243c8-e1d7-477d-8e5e-b775549bb0af` und separates Neustartjournal sind **`ready`**.
Kandidat **`master-20261001145513036`**. Der Worker schloss um 17:21:21 MESZ ab; erst danach liefen die frische
Service-Abschlussprüfung und der zusätzliche unabhängige, ausschließlich lesende Gesamtvergleich.

Der unabhängige Prüfer wurde nach dem bestätigten Serviceabschluss ausgeführt, rund **682,4 s** einschließlich
vollständiger Auftrags-/Dateibindungsprüfung und regulärer Vollvalidierung. `checkedAt` im Ergebnis kennzeichnet
den Beginn der eigentlichen Datenprüfung nach den ersten Datei-Prüfsummen, nicht deren Ende. Ergebnis:

| Prüfung | Tatsächlicher Befund |
| --- | --- |
| Ursprüngliche Reparatur-IDs | Alle **154 aktiv**, mit belegter ursprünglicher iNaturalist-ID aus dem reparierten Quellenstand |
| Technische Ersatz-IDs | Alle **vier historisch**; genau vier bestätigte `source-repair`-Ereignisse |
| Altbestand | Sämtliche **273.312** IDs des aktiven und **273.418** IDs des vorherigen Masters erhalten |
| Neuer Kandidat | **273.466 IDs**, davon **273.462 aktiv**, **vier historisch** |
| Zusätze gegenüber aktivem Stand | Genau **154 ursprüngliche Reparatur-IDs**, **null fremde Zusatz-IDs** |
| Unbeteiligte Daten | Alle **elf semantischen Umfangsprojektionen unverändert**, einschließlich eigener Entscheidungen, Konflikte und Suchbegriffe |
| Projektverknüpfungen | Alle **60 unverändert**, keine Migration |
| Eigene ausgewählte Felder | Alle **46 unverändert**, einschließlich fünf deutscher Namen |
| Eigene Namen | Taubenschwänzchen, Rotstirnamazone, Leopard, Rebhuhn und Weissstorch korrekt erhalten |
| Referenzhinweise | **118.338 → 118.334**; vier Entfälle nur innerhalb der Reparatur, keine fremden neuen Hinweise |
| Blockierende Konflikte | **0** |
| Reguläre Kandidatenprüfung | Erfolgreich, vollständige Validierung |
| SQLite-Prüfung | `quick_check=ok`, **0 Fremdschlüsselverletzungen** |

Die 2.173 fachlich separaten CoL-/Reichsfälle des ersten breiten Kandidaten sind **nicht hinzugefügt**. Keine
Namens-/Reichsheuristik oder automatische Zusammenführung. Allgemeine Update-Regel und Umfangssperre unverändert.
Quellenherkunft: CoL `col-xr-2026-08-26-316165`, iNaturalist `recovery-a6bdf57a5b2fcc6820dc661c`; die beiden
ursprünglichen Snapshots sind erhalten. Der reparierte Quellenstand enthält 273.517 Rohzeilen; die Menge der
aufgenommenen Anbieterbelege ist hiervon fachlich getrennt. Keine Anbieterdownloads in diesem Lauf.

Nach dem gesamten lesenden Vergleich wurden um **17:46:52 MESZ** die vollständigen SHA-256-Prüfsummen nochmals
bestätigt: **70 geschützte Original-/Quellen-/Altauftrags-/Code-Dateien** unverändert, Kandidat unverändert,
Veröffentlichungszeiger unverändert. Dies umfasst den alten breiten Auftrag und aufbewahrten Kandidaten, das alte
Ersatzjournal und den fehlgeschlagenen engen Auftrag samt privater Fehlerdatenbank. Keine Originaldatei
überschrieben, kein alter Regelstand umgeschrieben. Kandidaten-SHA-256:
`f994a9c4fdfe79d0f3aa2ea4134e12437bd02f05a3bb47d668f6e23cb0e52c64`.

Lokale Abschlussbelege (ignoriert, keine neuen versionierten Produktivdaten):

- `Testlauf/taxonomy-restart-verify-2026-10-01-result.json`
- `Testlauf/taxonomy-restart-postcheck-2026-10-01-result.json`

Die Wiedervorlage `taxonomie-reparaturkandidaten-pr-fen` wurde nach dem vollständigen Abschluss wieder auf
**`PAUSED`** gesetzt. Kein weiterer automatisch gestarteter Prüflauf. **164 gezielte Regressionstests** in acht
Dateien, Syntax-/Stil-/Dokumentations- und Projektstatusprüfung erfolgreich; kein vollständiges `quality:ci`
oder Phase-10-Audit. Lokale Backend-/Test-MJS-Änderung, keine Website-/Squarespace- oder Plug-in-Versionsänderung.

### Betriebsfreigabe nach Kandidatenabschluss

Die **Reparatur im Kandidaten ist vollständig geprüft abgeschlossen**. Felix hat die anschließende gemeinsame
Aktivierung separat bestätigt. Der Wartungsaufruf lief von 17:57:36 bis 18:11:42 MESZ mit **Exit 0**; das Paar ist
gemeinsam aktiviert. Der unabhängige lesende Paar-/Dateivergleich ist um **20:34:39 MESZ mit Exit 0**
vollständig erfolgreich abgeschlossen. **Kein weiterer Master-Vollaufbau** zur Reparatur erforderlich.
Keine automatische Foto-/Projektmigration, Katalogaktion, Rücknahme, Bereinigung, Commit oder Push in diesem Schritt.
Die 2.173 Quellenfälle und übrigen Betriebsprüfungen bleiben getrennte Vor-Audit-Punkte. Die anschließende
gezielte Verbraucherabnahme mit Weissstorch und Rebhuhn wurde von Felix bestätigt (siehe unten). Der
Erfolgsdurchlauf ersetzt insbesondere keine produktive Pause-/Fortsetzungs- oder Rollbackabnahme.

## Gemeinsame Paaraktivierung – 1. Oktober 2026

Felix bestätigte nach dem vollständigen Kandidatenvergleich die gesonderte Betriebsfrage mit **„ja los“**.
Die Bestätigung betrifft ausschließlich diesen fertigen Reparaturmaster und das daraus erzeugte Suchpaket.
Der reguläre Service-/Hilfsprozessweg verwendete Prozesssperren, frische Auftrags-/Quellen-/Regelprüfung,
vollständige Kandidaten-/Umfangsprüfung an der privaten Masterkopie, Paketvalidierung und einen gemeinsamen
Veröffentlichungszeiger. Keine alten Releases überschrieben, keine ID-Sperre umgangen.

- Wartungsaufruf: **17:57:36 bis 18:11:42 MESZ**, **Exit 0**, rund **14 min 6 s** einschließlich Prüfungen.
- Veröffentlichung: `publication-60f9b546-49ee-4c65-ada9-7b57b965b120`.
- Master: `master-20261001145513036`, SHA-256 identisch zum vollständig geprüften Kandidaten.
- Suchpaket: `lightroom-63c431a5fa43190a4c52`, **273.462 Taxa**, **7.141.471 Suchbegriffe**,
  **2.672.718 Hierarchiezeilen**, **60 Projektverknüpfungen**.
- Paket-SHA-256: `5b23ca2d8a1305c99f873f5b94f4e1721a64cfa74ba3aa8267c3109af8d287e1`.
- Rückweg: bisheriges Paar `publication-98c20464-c570-441e-9675-2772526774b1` vom 28. September,
  Master `master-20260928064750796` / Paket `lightroom-3953cad48c24e581d041`.
- Kein neuer Masteraufbau; Paketmodus **`incremental`**, **158 betroffene IDs**, davon **154 neu projizierte
  aktive Taxa** und vier historische Ersatz-IDs. Herkunfts-/Abrufzeiten der unveränderten Bestände wurden getrennt
  aktualisiert; der Weg ist kein ausschließlich auf 154 Zeilen beschränkter Schreib-/Prüflauf. Kein pauschaler
  Geschwindigkeitsfaktor aus dieser Einzelbeobachtung.

Die Zeit im Veröffentlichungsmanifest stammt aus der Paarvorbereitung (**17:58:05 MESZ**), nicht aus dem
tatsächlichen Zeigerwechsel. Der gesicherte Wartungsabschluss um **18:11:42 MESZ** ist der belastbare Nachweis
des erfolgreichen Laufs. Der unabhängige lesende Paarvergleich ist nachfolgend erfolgreich abgeschlossen.
Lokaler Aktivierungsbeleg: `Testlauf/taxonomy-repair-activation-2026-10-01-result.json`.

### Unabhängiger lesender Paarvergleich

Der zusätzliche Prüfer unter `Testlauf/` ist kein Produktionsaufbau und verändert weder Zeiger noch Releases.
Seine ersten Versuche lieferten noch keinen vollständigen Abschlussbericht. Technische Korrekturen betreffen
ausschließlich diesen lokalen Prüfer: Suchzeilen-IDs werden als interne Paketdetails nicht zwischen Master und
Paket gleichgesetzt; stattdessen werden die eindeutigen fachlichen Termschlüssel und sämtliche Werte verglichen.
SQLite-Ergebniszeilen werden vor dem Vergleich mit gespeicherten JSON-Ergebnissen in dieselbe Objektdarstellung
überführt. Der letzte Vollständigkeitscheck wählte zunächst `search_term_normalized_idx`, der bei häufigen
Taxonomienamen sehr große Treffergruppen durchsucht. `EXPLAIN QUERY PLAN` bestätigte diesen Leseweg.
Der korrigierte Zusatzprüfer verwendet dafür `search_term_taxon_idx` und prüft weiterhin alle Suchbegriffe.
Nur eindeutig identifizierte eigene lesende Prüfprozesse wurden dafür beendet; kein Master-/Paketlauf,
keine Produktionsänderung oder Rücknahme. Die vorherige Prüfsitzung war nach der Unterbrechung nicht mehr
verfügbar und ohne Abschlussbericht; daraus weder Erfolg noch einen Produktivfehler ableiten.
Der erneute Prüfer protokolliert Fortschritt und Fehler im ignorierten `Testlauf/` dauerhaft. Alle Integritäts-,
Prüfsummen- und semantischen Prüfanforderungen bleiben erhalten; kein Ergebnis aus einem Vorversuch als
vollständigen aktuellen Abschluss ausgeben.

### Unabhängiger Prüfabschluss und Betriebsgrenzen

Der korrigierte Zusatzprüfer lief von **20:30:55 bis 20:34:39 MESZ**, **Exit 0**, rund **224 s**. Sein vollständiger
Abschlussbericht liegt unter `Testlauf/taxonomy-repair-pair-verify-2026-10-01-result.json`; gespeicherter Status
`completed`. Keine wiederholte Aktivierung oder neuer Master-/Paketaufbau für die Prüferkorrekturen.

| Prüfung nach Aktivierung | Tatsächlicher Befund |
| --- | --- |
| Gemeinsamer Zeiger | Genau bestätigtes neues Paar aktiv; bisheriges Paar vom 28. September vollständig als Vorgänger erhalten |
| Aktiver Master | SHA-256 byteidentisch zum zuvor vollständig geprüften engen Kandidaten; dessen elf Umfangsvergleiche bleiben damit belegt |
| Masterbestand | **273.466 IDs**, davon **273.462 aktiv** und **vier historisch** |
| Lightroom-Bestand | **273.462 aktive Taxa**, keine historischen Ersatz-IDs als zweite aktive Art |
| Paketvollprüfung | Integrität, Fremdschlüssel, Schema, Zähler und vollständige Prüfsumme erfolgreich |
| Gesamter Paketvergleich | Alle aktiven Taxa, bevorzugte deutsche/englische Namen, alle Suchbegriffe und ihre Vollständigkeit, Anbieterreleases/-belege, Status, Projektlinks, ausgewählte Hierarchiefelder und Identitätsregister stimmen mit dem Master überein |
| Wiederherstellung | Alle **154 ursprünglichen IDs** im aktiven Master und Paket sowie in beiden normalen lesenden Verbrauchern aktiv |
| Vier Ersatz-IDs | Historisch, technische `source-repair`-Historie korrekt; Nachfolgerzuweisung verlangt Rückfrage, keine automatische Fotoänderung |
| Eigene Daten | Alle **60 Projektverknüpfungen** und **46 eigenen ausgewählten Felder** unverändert; fünf deutsche Namen in beiden normalen Lesern korrekt und im Lightroom-Suchleser auffindbar |
| Geschützte Originale | **69 gebundene Dateien** unverändert; die 70. bisher gebundene Datei ist ausschließlich der ausdrücklich freigegebene gemeinsame Veröffentlichungszeiger |
| Kandidat/Aufträge | Staging-Master unverändert, aktueller geprüfter Auftrag weiterhin `ready`; alte Journale/Aufträge/Fehlerdatenbank und breiter Alt-Kandidat unverändert erhalten |
| Während der Prüfung | Veröffentlichung und aktive Masterkopie unverändert, keine Quellen-/Projekt-/Katalogänderung |

Eigene Namen: **Taubenschwänzchen, Rotstirnamazone, Leopard, Rebhuhn und Weissstorch**. Die vier technischen
Historienereignisse sind keine bestätigten fachlichen Split-/Merge-Ereignisse. Die **2.173 fachlich separaten
CoL-/Reichsfälle bleiben ausgeschlossen** und sind vor dem Audit im normalen Updatevertrag separat zu behandeln.

Die Quellenreparatur ist **produktiv abgeschlossen**, nicht die gesamte Phase 10. Dieser Schritt umfasst weder
die praktische GUI-/Anzeigeabnahme, produktive Pause/Fortsetzung oder Rücknahme noch Katalogabgleich, Bereinigung,
Anbieterdownloads, Commit/Push oder vollständiges `quality:ci`/Phasenaudit. Die zuletzt bestandenen 164 gezielten
Regressionstests betreffen die vorbereitende Implementierung; sie wurden in dieser reinen Aktivierungsphase nicht
erneut als vollständiges Qualitätsgate ausgeführt. Dokumentations-/Projektstatusprüfung und `git diff --check`
erneut erfolgreich. Website-, Squarespace- und Plug-in-Dateien unverändert; keine zusätzliche Plug-in-Version.

## Gezielte praktische Verbraucherabnahme – 1. Oktober 2026

Felix bestätigte nach der Paaraktivierung zunächst, dass Lightroom Weissstorch und Rebhuhn mit den bevorzugten
Namen findet. Anschließend bestätigte er alle drei ausdrücklich vorgeschlagenen Bedienungstests mit
**„1 passt / 2 passt / 3 passt“**:

1. Beide Arten im Arten-Explorer gesucht; die bevorzugten deutschen Namen stimmen mit Lightroom überein.
2. Beide Arten in Lightroom Testfotos zugewiesen; ohne Fehlermeldung, mit passenden deutschen/wissenschaftlichen
   Namen, Taxonomie-Metadaten und FN-Stichwörtern. Keine neue Namenspräferenz erforderlich.
3. Nach normalem Schließen/Wiederöffnen bleiben die Testzuweisungen erhalten und beide Arten auffindbar.

Dies ist die nutzerbestätigte praktische Stichprobe für den reparierten Verbraucherstand, kein vom Agenten
durchgeführter GUI-Test und keine Abnahme aller 154 Fälle oder sämtlicher Lightroom-Funktionen. Zusammen mit
dem vollständigen lesenden Datenvergleich ist der Reparaturpunkt damit technisch und gezielt praktisch
abgeschlossen. Keine neuen Datenbankläufe, Katalogabgleiche oder Namensänderungen durch diese Dokumentation.

Die gemeldete Verfügbarkeit von CoL `COL26.9 XR` vom 25. September ist ein getrenntes Quellenupdate; sie bedeutet
keinen Drift des reparierten lokalen Paars auf `COL26.8 XR`. Das reguläre Update einschließlich der 2.173
separaten CoL-/Reichsfälle bleibt vor dem Audit zu prüfen. Produktive Pause/Fortsetzung, Rollback, die gebündelte
Lightroom-Abnahme und das vollständige Qualitätsgate/Phasenaudit werden durch diese drei Tests nicht abgenommen.
