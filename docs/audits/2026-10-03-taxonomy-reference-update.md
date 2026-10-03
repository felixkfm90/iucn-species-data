# Reguläres CoL-Update – produktiver Abschluss am 3. Oktober 2026

Stand: 2026-10-03

Datierter technischer Betriebsnachweis, kein Phase-10.5-Gesamtaudit. Maßgebliche Verträge:
[Referenzupdate](../taxonomy-reference-update.md), [FN-Katalognutzung](../lightroom-catalog-usage.md)
und [aktueller Betriebsstand](../taxonomy-current-status.md).

## Freigegebener Ablauf und Abschluss

Felix startete den regulären Quellenweg am 2. Oktober um 19:53:14 MESZ. Die neue Referenz
`col-xr-2026-09-25-316441` wurde importiert; der erste Kandidat hielt an 2.182 Klassifikationsfällen
und einer verlorenen bisherigen ID an. Der ID-Fehler wurde isoliert korrigiert, der Kandidat nicht umgeschrieben.

Am 3. Oktober bestätigte Felix die vollständige FN-Nutzung seines einzigen Katalogs
`D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat`: 128.871 Fotos, 5.484 FN-Zuweisungen und 56 verwendete IDs.
Die frische Prüfung ergab keine geschützte Überschneidung mit den 2.182 Klassifikationsfällen.
Der von Felix um **07:52:59 MESZ** gestartete gemeinsame lokale Folgeweg merkte beide Gruppen atomar vor,
baute einen frischen Master und das Suchpaket und übernahm das geprüfte Paar. Kein erneuter Anbieterdownload.

Der frische Serviceabschluss lautet **`completed`, `active: false`**, ohne Fehler oder Warnung;
**Gesamtabschluss um 09:11:14 MESZ**, rund 1 Stunde 18 Minuten nach dem bestätigten lokalen Start.
Kein offener Kandidat, keine blockierenden Konflikte, keine offenen Namens- oder Identitätsvormerkungen.
Die 30-Minuten-Wiedervorlage `regul-ren-taxonomie-update-pr-fen` wurde anschließend auf Felix' Wunsch gelöscht.

| Ebene | Bestätigter aktiver Stand |
| --- | --- |
| CoL-Referenz und Masterherkunft | `col-xr-2026-09-25-316441` (`COL26.9 XR`) |
| Master | `master-20261003055911210` |
| Lightroom-Suchpaket | `lightroom-fa739bd28ec1e82a0283`, aus diesem Master |
| Gemeinsame Veröffentlichung | `publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91` |
| Erhaltener Vorgänger | `master-20261001145513036` / `lightroom-63c431a5fa43190a4c52` |
| Plug-in | `0.4.24.15` |

## Verarbeitung der Klassifikationen

- **1.995 passende, unbenutzte Fälle:** Klassifikation mit ursprünglicher Master-ID verarbeitet.
- **187 unklare, unbenutzte Fälle:** ausschließlich die neuen CoL-Gegenstücke zurückgestellt;
  bisherige Arten, IDs und eigene Namen erhalten. Unterteilung: sechs abweichende Anbieterkennungen,
  zwei mehrdeutige Belege und 179 fehlende Verweise.
- **0 offene Klassifikationen und 0 blockierende Konflikte** im aktivierten Stand.

Die 187 Zurückstellungen sind eine gewollte konservative Verarbeitung, kein Download-/Aufbaufehler und
kein heute noch abzuarbeitender Entscheidungsauftrag. Sie bestätigen keine Identitätsgleichheit und erzeugen
keine Foto-/Projektmigration. Geänderte Quellenbelege müssen erneut geprüft werden; geschützte oder nicht
sicher automatisierbare Fälle bleiben zur Entscheidung gesperrt.

Die aktive Identitätsrevision lautet
`8aba3cdd302211c0f252971e8f00cf7505bfc87b7fdcc2c149b090512226b74b`, die gebundene Nutzungsrevision
`2fde87b8fc14ea3bcf4e240e6f89bd9e01f68cc7fd542036658e7fe2e287290e`.

## Einmalige unabhängige lesende Abschlussprüfung

Nach dem terminalen Serviceabschluss wurden der aktuelle und der vorige Master sowie das aktive Suchpaket
über die offiziellen Speicherpfade des gemeinsamen Veröffentlichungszeigers geöffnet. Alle drei SQLite-
Verbindungen waren `readOnly` und `query_only`; keine Lightroom-Katalogdatenbank wurde geöffnet.
Die einmalige Gegenprüfung endete mit Exit 0 und bestätigte:

| Prüfung | Befund |
| --- | --- |
| Sämtliche 273.466 bisherigen Master-IDs | Erhalten; keine fehlende ID |
| Bisher aktive IDs | Keine verloren oder neu historisch gestellt |
| Aktueller Master | 273.480 Einträge, davon vier historische technische Ersatz-IDs |
| Aktives Lightroom-Suchpaket | 273.476 Taxa; kein aktives Mastertaxon fehlt |
| Alle Pakettaxa gegen Master | Identität, wissenschaftlicher Name, Rang, Reich, Lebenszyklus und Referenzzustand ohne Abweichung |
| Vier historische Ersatz-IDs | Im Master weiterhin historisch, ursprüngliche IDs aktiv; Ersatz-IDs nicht als zweite aktive Art im Paket |
| `Storchodon cingulatus` | Alte ID `mtx_6bbad0b4ee45cbfbde46c3c87b22292c` aktiv, jetzt mit Animalia-/CoL-Beleg |
| Fünf eigene deutsche Namen | In Master und Paket richtig ausgewählt |
| Alle 60 Projektverknüpfungen | Gegen Vorgänger unverändert und im Paket passend |
| Alle 46 bisherigen ausgewählten eigenen Felder | Unverändert |
| Alle 56 laut Quittung verwendeten Lightroom-IDs | Im neuen Paket vorhanden |
| Klassifikationsregister und Manifest | 1.995 verarbeitete Klassifikationen, 187 Zurückstellungen, keine offene Klassifikation |
| Größe und Änderungszeit der drei gelesenen Datenbanken | Vor und nach der Prüfung unverändert |

Die fünf geprüften Namenspräferenzen: Rotstirnamazone (`Amazona autumnalis`), Taubenschwänzchen
(`Macroglossum stellatarum`), Leopard (`Panthera pardus`), Weissstorch (`Ciconia ciconia`) und Rebhuhn
(`Perdix perdix`). Der Erhalt sämtlicher bisherigen IDs umfasst auch die 154 ursprünglichen Reparatur-IDs.

## Grenzen und nächste Abnahme

Die zusätzliche Gegenprüfung war kein erneuter vollständiger Prüfsummen-, SQLite-Integritäts- oder
Katalogscan. Die Schutzprüfungen des produktiven Paarwegs und diese unabhängige Gegenprüfung sind getrennte
Nachweise. Keine zweite Aktivierung, Rücknahme, Datenbereinigung, Katalogaktion, Fotoänderung oder Veröffentlichung.

Lightroom darf nach diesem geprüften Gesamtabschluss wieder geöffnet werden. Die gezielte Bedienabnahme
des neuen Pakets mit Weissstorch/Rebhuhn bleibt von der technischen Prüfung getrennt; der heutige Abschluss
ersetzt keine umfassende Lightroom-, Wiederanlauf-/Rollback- oder Phase-10.5-Abnahme.
Die vereinfachte obere Fortschrittsanzeige braucht weiterhin eine kurze Sichtprüfung.

Die manuelle SDK-Erfassung, normale Katalogschließung und Gesamtbestätigung bleiben eine bekannte erste
Betriebsgrenze. Es gibt noch keine dauerhafte automatische SDK-Nutzungsfortschreibung; bereits aktivierte
Historie erfordert aber keine dauerhafte Lightroom-Schließung. Für neue automatische Vormerkungen ist ein
frischer vollständiger Nutzungsnachweis nötig.

## Nachfolgende Rückmeldung und Folgeauftrag am selben Tag

Felix bestätigt nach dem technischen Abschluss, dass Weissstorch und Rebhuhn in beiden Verbrauchern vorhanden
und als bevorzugt markiert sind. Die gezielte Suche-/Namensprüfung des neuen Pakets ist damit bestanden;
keine zusätzliche neue Fotozuweisung, Wiederanlauf-/Rollback- oder umfassende Bedienabnahme daraus ableiten.

Anschließend beauftragt er den automatischen Gesamtweg der heute schrittweise durchgeführten Aktionen;
fachliche Rückfragen nur bei relevanten Änderungen an angelegten/zugewiesenen Arten oder eigenen Daten.
Das ist noch keine implementierte Vollautomatik. Vertrag und Gegenproben stehen im
[Folgeauftrag](../lightroom-catalog-usage.md#folgeauftrag-automatischer-gesamtweg-statt-manueller-erstaufnahmekette),
als nächster konkreter Punkt vor dem Audit eingeordnet. Keine neue produktive Aktion durch diese Rückmeldung.
