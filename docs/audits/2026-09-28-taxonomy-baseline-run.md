# Erster produktiver lokaler Grundlagenlauf

Historische Aufnahme: 28. September 2026, Statusabfrage ab 10:37 Uhr MESZ.
Dies ist ein Start-/Abschlussnachweis, **kein vollständiges Betriebs- oder Phase-10-Audit**.

## Bestätigter Ablauf

Felix startete den Lauf über die bestätigte Aktion `Vergleichsgrundlage einmalig erstellen …` um
08:36:59 MESZ (`2026-09-28T06:36:59.942Z`). Der Explorer meldete den Abschluss der gemeinsamen Aktivierung
um 10:07:59 MESZ (`2026-09-28T08:07:59.775Z`), insgesamt rund 1 Stunde 31 Minuten. Die abschließende
Aktivierungsaktion einschließlich Paketvorbereitung begann um 09:41:21 MESZ und dauerte rund 26 Minuten
38 Sekunden. Das ist weder eine reine Zeigerwechselzeit noch ein Nachweis einer inkrementellen Beschleunigung.

Die lesende API-Prüfung meldete `completed`, `active: false`, keine Fehler, keine Warnungen und keine
blockierenden Konflikte. Die separate Arten-Pipeline war `idle`. Es wurde kein zweiter produktiver Lauf,
keine Rücknahme und keine Bereinigung angestoßen.

| Stand | Master | Lightroom-Paket |
| --- | --- | --- |
| Neu aktiv | `master-20260928064750796` | `lightroom-3953cad48c24e581d041` |
| Erhaltener Vorgänger | `master-20260905054823067` | `lightroom-946c961bd063fd1b8f12` |

Der gemeinsame Veröffentlichungszeiger enthält beide Paare. Die Paket-Masterkennung passt zum aktiven Master.
CoL-Referenz und Masterherkunft nennen beide `col-xr-2026-08-26-316165`. Der Dienst bietet die Rücknahme an;
ein tatsächlicher Rücknahmetest wurde nicht durchgeführt.

## Grundlage und eigene Entscheidungen

Das Mastermanifest weist eine vorhandene `build-inputs.sqlite`, 429.951 Eingangsdatensätze und sechs Quellen
aus. Dieser erste Lauf war wie erwartet vollständig: `buildMode: full`, Grund `no-input-baseline`, null
wiederverwendete Taxa. Der Auftrag `job-5ca4836e-1cce-418d-80cc-e93a3a59b61f` ist `ready`; der letzte bestätigte
Checkpoint enthält 273.312 von 273.312 Artgruppen.

Master und Paket enthalten nun die gebundenen Eingangs-/Exportangaben. `baselineSetup.needed` ist `false`,
`masterRecorded` und `packageRecorded` sind `true`. Die fünf eigenen Namenskorrekturen sind laut Status mit
identischer aktueller/aktiver Revision übernommen; keine ausstehende Namens- oder Identitätsübernahme.
Eine praktische Nachprüfung der einzelnen Namen in Lightroom und Explorer steht noch aus.

Im veröffentlichten Zeiger und den Manifestangaben:

- Master-SHA-256: `c51aafde276405b53977894d7907bb9b9d5bbe6dd09aa1d28a6e87e1320f5afc`
- Paket-SHA-256: `7a75eb12b7ce8e41530e9b162e7831bc95f7c98c174634722633ad9b086cc706`
- Paket-Quellprüfsumme entspricht dem Master-SHA-256.

Diese Abschlussabfrage hat die mehrgigabytegroßen Dateien nicht erneut unabhängig gehasht oder vollständig
fachlich verglichen. Sie bestätigt die Übereinstimmung der vom geprüften Aufbau veröffentlichten Angaben.
Die Momentaufnahme zeigte rund 122,1 GiB freien Speicher auf C:.

## Offener Vergleich und Abnahmegrenzen

Der neue Taxonomieumfang beträgt 273.312 gegenüber 273.418 Taxa im Vorgänger, also 106 weniger.
Die lokalen Anbieterstände sind nicht dieselben: iNaturalist, GBIF, WoRMS und Wikidata stammen beim neuen
Master vom 27. September statt vom 3. September. Beispielsweise enthält der iNaturalist-Ausschnitt
273.250 statt 273.393 Datensätze, der GBIF-Ausschnitt 1.565 statt 1.454. Das erklärt die fehlende
Vergleichbarkeit der Eingangsmengen, **noch nicht die genaue Differenz der 106 Mastertaxa**.
Diese ist vor dem Audit gezielt anhand von Identitäten/Quellen zu prüfen; weder Datenverlust noch korrekte
Bereinigung aus dem bloßen Zählerunterschied ableiten. Projektarten und Fotos sind von diesem Taxonzähler zu trennen.

Pause/Fortsetzung im produktiven Großbestand, tatsächlicher Explorer-Neustart mit offenem Lightroom,
Rücknahme und die Laufzeit des inkrementellen Folgewegs sind durch diesen erfolgreichen Durchlauf nicht
abgenommen. Kein neuer Vollaufbau nur für den Test der Fortschrittsanzeige. Nächste Punkte stehen in der
[Roadmap](../roadmap.md), Betriebsvertrag: [Hintergrundaufbau](../taxonomy-master-background-build.md).
