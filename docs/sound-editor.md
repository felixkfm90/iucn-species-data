# Soundeditor im Arten-Explorer

Stand: 2026-08-10

Der Soundeditor schneidet vorhandene Tierstimmen lokal und kann mehrere ausgewählte Zeitabschnitte in der
angegebenen Reihenfolge zu einer neuen MP3 zusammensetzen. Quellen- und Lizenzangaben bleiben unverändert erhalten.

## Bedienung

1. Im Bearbeitungsmodus im Medienbereich `Tierstimme` auf `Bearbeiten` klicken.
2. Unter `Sound zuschneiden` Start und Ende des ersten Abschnitts festlegen.
3. Wahlweise die aktuelle Wiedergabeposition als Start oder Ende übernehmen.
4. Bei Bedarf weitere Abschnitte hinzufügen, entfernen und in der sichtbaren Reihenfolge festlegen.
5. `Schnittvorschau erstellen` wählen und bisherigen sowie bearbeiteten Sound vergleichen.
6. Erst nach der Hörprüfung `Schnitt übernehmen` wählen.
7. Die lokale Änderung später gesammelt mit `Änderungen übertragen` veröffentlichen.

Die Player stoppen sich gegenseitig, damit beim Vergleich nie beide Sounds gleichzeitig laufen. Vor serverseitigen
Operationen wird die aktuelle Audiodatei im Browser freigegeben, um Windows-Dateisperren zu vermeiden.

Zeitwerte dürfen mit Punkt oder deutschem Dezimalkomma eingegeben werden. So wird beispielsweise `02,35` als
2,35 Sekunden und nicht als Start bei null verarbeitet. Der anfängliche Startwert `0` wird beim Fokussieren des
Felds geleert, solange er noch nicht geändert wurde; bereits eingegebene positive Startwerte bleiben erhalten.
Für die Schaltflächen `Aktuelle Position` und die Vorschau ist der Player im Bearbeitungsdialog maßgeblich, nicht
ein eventuell noch im Hintergrund vorhandener Player der Artseite.

Die Schnittvorschau erzeugt seit dem 10. August 2026 bereits im geschützten Vorschauschritt das zur bearbeiteten
MP3 gehörende Spektrogramm. Bisheriger und neuer Sound werden dadurch jeweils mit dem passenden Spektrogramm und
einem funktionsfähigen Player angezeigt. Erst wenn MP3 und WebP gemeinsam geprüft sind, wird die Übernahme
freigegeben. Ein fehlgeschlagenes Spektrogramm verändert keine Produktivdatei.

Native Playeraktionen innerhalb der Schnittvorschau, insbesondere ein Klick in die Zeitleiste, gelten nicht als
Formularänderung. Sie dürfen die erzeugte Vorschau deshalb weder verwerfen noch ausblenden. Erst eine echte Änderung
an Start, Ende, Reihenfolge oder Anzahl der Abschnitte macht eine neue Vorschaugenerierung erforderlich.

## Technischer Ablauf

- `scripts/sound-segment-editor.mjs` prüft die Abschnitte und erzeugt mit FFmpeg eine MP3-Vorschau.
- Jeder Abschnitt nutzt `atrim` und `asetpts`; mehrere Abschnitte werden über den FFmpeg-`concat`-Filter verbunden.
- Es sind höchstens 20 Abschnitte erlaubt.
- Jeder Abschnitt muss mindestens 0,05 Sekunden lang sein.
- Die fertige Tierstimme darf höchstens fünf Minuten lang sein.
- Die Ausgabe wird als MP3 mit `libmp3lame` und 192 kbit/s erzeugt und anschließend inhaltlich geprüft.
- `POST /api/species/:id/assets/sound/edit-preview` erzeugt die kontrollierte Vorschau.
- Die Übernahme verwendet denselben geschützten Speichervorgang wie ein manueller Soundaustausch.

Beim Speichern werden `sound.mp3`, `credits.json` und `spectrogram.webp` gemeinsam gesichert. Das Spektrogramm wird
aus der neuen MP3 erzeugt, Hashregister und manueller Pipeline-Schutz werden aktualisiert. Die Credits behalten
Quelle, Urheber, Original-URL und Lizenz; zusätzliche Metadaten dokumentieren Ausgangsdauer, Zieldauer und
verwendete Abschnitte.

## Tests

- `npm.cmd run --silent test:audio`
- `npm.cmd run --silent test:explorer`
- `npm.cmd run --silent quality:ci`

Die Tests prüfen unter anderem Abschnittsvalidierung, Filteraufbau, deutsche Dezimalkommas, mehrere Segmente,
Längenlimits, die geschützte Vorschau sowie die gemeinsame Übernahme von Sound, Credits und neuem Spektrogramm.
