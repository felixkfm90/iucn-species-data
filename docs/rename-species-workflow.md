# Artnamen umbenennen

Stand: 2026-07-05

Dieser Workflow ist fuer Faelle gedacht, in denen sich der deutsche Artname oder bewusst auch der wissenschaftliche
Name aendert. Der deutsche Name kann direkt bearbeitet werden. Der wissenschaftliche Name ist zunaechst gesperrt und
muss mit Schloss und Warnbestaetigung entsperrt werden, weil dadurch der URL-Slug geaendert wird und die Website
direkt betroffen sein kann.

## Bedienung im Arten-Explorer

1. `Bearbeitungsmodus` aktivieren.
2. Gewuenschte Art oeffnen.
3. Im Bereich `Manuelle Daten` auf `Bearbeiten` klicken.
4. Bei Bedarf im Feld `Deutscher Name` den neuen deutschen Namen eintragen.
5. Bei Bedarf das Schloss am Feld `Wissenschaftlicher Name` oeffnen.
6. Warnung bestaetigen: Die Aenderung aendert den URL-Slug und kann sich direkt auf die Website auswirken.
7. Wissenschaftlichen Namen im Format `Gattung art` eintragen.
8. `Aenderungen pruefen` ausfuehren und Diff kontrollieren. Bei wissenschaftlicher Umbenennung erscheint auch der
   neue URL-Slug in der Vorschau.
9. `Jetzt speichern` speichert lokal.
10. Danach ueber `Änderungen übertragen` veroeffentlichen.

## Technischer Ablauf

Beim Speichern prueft der Explorer:

- kein anderer Eintrag in `species_list.json` nutzt denselben deutschen oder wissenschaftlichen Namen;
- keine andere generierte Art nutzt denselben deutschen oder wissenschaftlichen Namen;
- der neue SafeName kollidiert nicht mit einem bestehenden Assetordner;
- der neue SafeName kollidiert nicht mit bestehenden Override- oder Assessment-Eintraegen.
- der neue URL-Slug kollidiert nicht mit einer bestehenden Art.

Wenn die Pruefung erfolgreich ist, werden konsistent mitgefuehrt:

- `species_list.json`: `german`
- `species_list.json`: `genus` und `species`, wenn der wissenschaftliche Name entsperrt und geaendert wurde
- `speciesData.json`: `Deutscher Name`, `Wissenschaftlicher Name`, `Genus`, `Species` und `URLSlug`
- `species-assets/<SafeName>/`: Assetordner wird bei geaendertem SafeName verschoben
- `species-assets-overrides.json`: Override-Schluessel und sichtbarer Kartenname
- `lastSavedAssessmentId.json`: Assessment-Zuordnung
- `fehlende_elemente_report.json`: Reportnamen und SafeName-Eintraege
- `docs/manual-map-overrides.md`: dokumentierte manuelle Karten
- `species-assets/<SafeName>/credits.json`: `german_name` und `scientific_name`, falls vorhanden
- `species-assets/<SafeName>/portrait.json`: `german_name` und `scientific_name`, falls vorhanden

Vor dem Schreiben legt der Explorer wie bei normalen manuellen Daten eine Sicherung unter
`species-explorer/backups/` an. Der Assetordner wird erst verschoben, nachdem die Vorschau bestaetigt wurde.
Schlaegt ein nachgelagerter Schreibschritt fehl, versucht der Explorer, die geaenderten Dateien und den Assetordner
auf den vorherigen Stand zurueckzusetzen.

## Abgrenzung

- Die IUCN-Assessment-Zuordnung wird nicht automatisch neu gesucht. Der bestehende Datensatz bleibt zugeordnet.
- Die IUCN-Daten werden nicht neu abgerufen.
- Eine Umbenennung ist kein Pipeline-Lauf. Sie bleibt als lokale Aenderung offen und wird gesammelt ueber
  `Änderungen übertragen` committed und gepusht.
