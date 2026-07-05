# Deutschen Artnamen umbenennen

Stand: 2026-07-05

Dieser Workflow ist fuer Faelle gedacht, in denen sich nur der deutsche Artname aendert. Der wissenschaftliche Name,
der URL-Slug und die IUCN-Zuordnung bleiben gleich.

## Bedienung im Arten-Explorer

1. `Bearbeitungsmodus` aktivieren.
2. Gewuenschte Art oeffnen.
3. Im Bereich `Manuelle Daten` auf `Bearbeiten` klicken.
4. Im Feld `Deutscher Name` den neuen Namen eintragen.
5. `Aenderungen pruefen` ausfuehren und Diff kontrollieren.
6. `Jetzt speichern` speichert lokal.
7. Danach ueber `Änderungen übertragen` veroeffentlichen.

## Technischer Ablauf

Beim Speichern prueft der Explorer:

- kein anderer Eintrag in `species_list.json` nutzt denselben deutschen Namen;
- keine andere generierte Art nutzt denselben deutschen Namen;
- der neue SafeName kollidiert nicht mit einem bestehenden Assetordner;
- der neue SafeName kollidiert nicht mit bestehenden Override- oder Assessment-Eintraegen.

Wenn die Pruefung erfolgreich ist, werden konsistent mitgefuehrt:

- `species_list.json`: `german`
- `speciesData.json`: `Deutscher Name`
- `species-assets/<SafeName>/`: Assetordner wird bei geaendertem SafeName verschoben
- `species-assets-overrides.json`: Override-Schluessel und sichtbarer Kartenname
- `lastSavedAssessmentId.json`: Assessment-Zuordnung
- `fehlende_elemente_report.json`: Reportnamen und SafeName-Eintraege
- `docs/manual-map-overrides.md`: dokumentierte manuelle Karten
- `species-assets/<SafeName>/credits.json`: `german_name`, falls vorhanden
- `species-assets/<SafeName>/portrait.json`: `german_name`, falls vorhanden

Vor dem Schreiben legt der Explorer wie bei normalen manuellen Daten eine Sicherung unter
`species-explorer/backups/` an. Der Assetordner wird erst verschoben, nachdem die Vorschau bestaetigt wurde.
Schlaegt ein nachgelagerter Schreibschritt fehl, versucht der Explorer, die geaenderten Dateien und den Assetordner
auf den vorherigen Stand zurueckzusetzen.

## Abgrenzung

- Der wissenschaftliche Name wird nicht geaendert.
- Der URL-Slug wird nicht geaendert.
- Die IUCN-Daten werden nicht neu abgerufen.
- Eine Umbenennung ist kein Pipeline-Lauf. Sie bleibt als lokale Aenderung offen und wird gesammelt ueber
  `Änderungen übertragen` committed und gepusht.
