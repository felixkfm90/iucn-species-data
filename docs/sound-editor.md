# Soundeditor im Arten-Explorer

Stand: 2026-07-22

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

Die Tests prüfen unter anderem Abschnittsvalidierung, Filteraufbau, mehrere Segmente, Längenlimits, die geschützte
Vorschau sowie die gemeinsame Übernahme von Sound, Credits und neuem Spektrogramm.
