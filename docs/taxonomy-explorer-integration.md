# Taxonomiereferenz im Neue-Art-Assistenten

Stand: 2026-07-28

Status: Phase 9.4 abgeschlossen; Phase 9.5 ergänzt Installation und Aktualisierung

## Ziel

Der erste Schritt des Neue-Art-Assistenten kann eine lokal installierte Taxonomiereferenz ausschließlich lesend
durchsuchen. Die Referenz unterstützt die Eingabe, ersetzt aber weder die redaktionelle Entscheidung noch die
bisherige Artenvalidierung:

- Eingaben im Feld `Deutscher Name` suchen ausschließlich in ausdrücklich deutsch gekennzeichneten
  Vernakularnamen. Anderssprachige Trivialnamen dürfen keinen scheinbar deutschen Treffer erzeugen; englische
  Namen dienen nur nach einer wissenschaftlichen Suche sichtbar gekennzeichnet als Ersatz.
- Eingaben im Feld `Wissenschaftlicher Name` suchen nach wissenschaftlichen Namen und Synonymen.
- `Tiere (Animalia)` ist vorausgewählt.
- Über `Alle Reiche` kann bewusst im gesamten installierten Referenzbestand gesucht werden.
- Kein Suchergebnis wird automatisch ausgewählt oder gespeichert.
- Die manuelle Eingabe bleibt jederzeit möglich.

Die Integration verändert keine bestehende Projektart und schreibt weder in `species_list.json` noch in
`speciesData.json`. Erst der bestehende Ablauf `Eingaben prüfen` und der spätere bestätigte Neue-Art-Prozess dürfen
eine Projektart anlegen.

## Bedienablauf

1. Der Assistent prüft beim Öffnen, ob eine aktive lokale Referenz vorhanden und lesbar ist.
2. Nach jedem eingegebenen Zeichen startet nach einer kurzen Verzögerung die passende Suche.
3. Mehrere Treffer werden als Liste mit bevorzugtem deutschen oder sichtbar gekennzeichnetem englischen
   Ersatznamen, akzeptiertem wissenschaftlichem Namen, Rang, Reich und gegebenenfalls Synonymhinweis angezeigt.
4. Ein Klick auf einen Treffer lädt die vollständigen lokal verfügbaren Details.
5. Die Vorschau zeigt Taxonomiehierarchie, Quelle, Release, Quellen-ID, Namensstatus und Vertrauensstufe.
6. Erst `Vorschlag übernehmen` füllt die beiden Namensfelder.
7. Danach bleiben `Eingaben prüfen`, Kollisionsprüfung, Vorschau und Speicherung des bisherigen Assistenten
   unverändert verpflichtend.

Der Neue-Art-Assistent fragt bereits an der read-only API ausschließlich Treffer mit dem Rang `Art` ab. Gattungen,
Unterarten, Familien oder andere Ränge belegen deshalb nicht mehr das begrenzte Trefferfenster. Bei zwölf sichtbaren
Treffern fordert der Assistent zum Ergänzen des Suchbegriffs auf; beispielsweise führt `Glaucidium p` zuverlässig
zu `Perlkauz – Glaucidium perlatum`.
Die Referenz-API bleibt für allgemeine Abfragen mehrsprachig. Nur das sichtbare Feld `Deutscher Name` sendet
`language=de`; dadurch bleiben englische Ersatznamen für andere Referenzansichten verfügbar, während etwa ein
niederländischer Name keinen deutschen Vorschlag erzeugen kann.
Unterarten sind im Referenzschema vorbereitet, bleiben für einen späteren kontrollierten Ausbau gesperrt, weil der
aktuelle Projektworkflow bewusst exakt zweiteilige wissenschaftliche Artnamen verlangt.

## Deutsche Namen, englischer Ersatz und Animalia.bio

Ein deutscher Name wird nur übernommen, wenn er in der lokalen Referenz als deutscher Vernakularname belegt ist.
Wurde über den deutschen Suchbegriff ein konkreter bestätigter Name ausgewählt, bleibt genau dieser Name erhalten,
auch wenn die Quelle weitere deutsche Namen für dasselbe Taxon führt.

Fehlt ein bestätigter deutscher Name, verwendet die Treffer- und Detailvorschau einen vorhandenen englischen
Vernakularnamen als klar gekennzeichneten `Englischen Ersatznamen`. Dieser kann bewusst in das aktuelle
Anzeigenamensfeld übernommen und anschließend redaktionell geprüft werden. Liefert ein späterer Release einen
deutschen Namen, wird Deutsch bei künftigen Suchen bevorzugt; vorhandene Projektarten werden nicht automatisch
umbenannt.

Bei einem Tier ohne bestätigten deutschen Namen zeigt die Detailvorschau außerdem einen gezielten Link für eine
manuelle Suche bei Animalia.bio. Die Website wird nicht automatisiert abgerufen oder ausgewertet. Der Benutzer kann
einen geprüften deutschen Namen anschließend selbst eintragen.

## Fehler- und Offlineverhalten

Die Taxonomiereferenz ist bei installierter Datenbank der reguläre geführte Eingabeweg. Die manuelle Eingabe bleibt
als ausfallsicherer Fallback erhalten:

- Fehlt die lokale Datenbank, zeigt der Assistent `Manuelle Eingabe`.
- Ist der aktive Releasezeiger oder die Datenbank beschädigt, wird die Referenzsuche deaktiviert.
- Bereits eingetragene Formularwerte bleiben erhalten.
- Die normale manuelle Prüfung und Artanlage bleibt vollständig verfügbar.
- Ein Referenzfehler startet keine Pipeline, erzeugt keinen Commit und ändert keine Art- oder Assetdatei.

Der Statusendpunkt liefert Wartungs- und Referenzzustand gemeinsam. Der Assistent verwendet ausdrücklich das
verschachtelte Objekt `reference`; dadurch deaktivieren neutrale Wartungsmeldungen wie
`Noch keine Aktualisierung gestartet` weder Suche noch Reichsauswahl. Nach erfolgreicher Initialisierung enthält
die Reichsauswahl alle im aktiven Release vorhandenen Reiche sowie `Alle Reiche`. `Alle Reiche` steht ganz oben,
direkt gefolgt vom vorausgewählten `Tiere (Animalia)`; die übrigen Reiche sind nach ihrer sichtbaren deutschen
Bezeichnung alphabetisch sortiert.

Wenn während des Tippens mehrere Anfragen laufen, darf nur die Antwort der neuesten Eingabe die Trefferliste
aktualisieren. Die Treffer erscheinen in einem kompakten, überlagernden Scrollbereich unter den Namensfeldern.
Unterschiedliche Trefferzahlen verändern deshalb weder die Dialoghöhe noch die Position der folgenden
Eingabefelder. Ausführliche Hierarchie- und Quelldaten werden weiterhin erst nach bewusster Auswahl eingeblendet.

## Read-only API

Phase 9.4 stellt ausschließlich diese lokalen Leseendpunkte bereit:

```text
GET /api/taxonomy/status
GET /api/taxonomy/kingdoms
GET /api/taxonomy/search?q=<Text>&kind=<vernacular|scientific|all>&kingdomId=<Reich>&language=<all|de|en>&rank=<Rang>&limit=12
GET /api/taxonomy/taxa/:id
```

Die Endpunkte laufen innerhalb der bestehenden localhost-, Origin- und Sitzungsgrenzen des Arten-Explorers. Sie
öffnen nur den über den aktiven Releasezeiger freigegebenen SQLite-Bestand. Ändert sich der aktive Release, wird der
read-only Speicher beim nächsten Zugriff kontrolliert neu geöffnet.

Schreibende Endpunkte für Download, Import, Aktivierung und Rollback sind ausdrücklich nicht Teil der
Phase-9.4-Referenzsuche. Phase 9.5 stellt sie getrennt im Wartungsbereich bereit:

```text
POST /api/taxonomy/update/preview
POST /api/taxonomy/update/start
POST /api/taxonomy/update/rollback
```

Der vollständige Installations-, Konflikt- und Rollbackvertrag steht in
`docs/taxonomy-reference-update.md`. Die Wartung verändert weder Formularwerte noch bestehende Projektarten.

## Technische Zuständigkeiten

- `species-explorer/taxonomy-reference-service.mjs`: Validierung, aktiver read-only Speicher, Status, Reiche, Suche
  und Taxondetails
- `species-explorer/taxonomy-maintenance-service.mjs`: Versionsprüfung, Vollimportsteuerung, Projektabgleich,
  Aktivierung und Rollback
- `species-explorer/request-router.mjs`: lokale GET-/HEAD-Routen
- `species-explorer/public/app-taxonomy-reference.js`: Darstellung, verzögerte bidirektionale Suche, bewusste
  Auswahl und Übernahme
- `species-explorer/public/app-taxonomy-maintenance.js`: Wartungsstatus, Fortschritt, Konflikthinweise und Rollback
- `species-explorer/public/app-new-species-workflow.js`: Einbindung in Schritt 1 und Zurücksetzen beim Schließen
- `species-explorer/taxonomy-reference-service.test.mjs`: Service- und Fixture-Nachweis
- `species-explorer/app-taxonomy-reference.test.mjs`: zustandsfreie URL-, Status- und Darstellungsverträge
- `species-explorer/explorer-ui-contract.test.mjs`: Auslieferungs- und Integrationsvertrag der Oberfläche

## Prüfung

Fokussierte Prüfung:

```bash
npm.cmd run --silent test:taxonomy-reference
node --no-warnings --test --test-isolation=none species-explorer/request-router.test.mjs
node --no-warnings --test --test-isolation=none species-explorer/explorer-ui-contract.test.mjs
```

Gesamtprüfung:

```bash
npm.cmd run --silent test:explorer
npm.cmd run --silent quality:ci
```

Die kleine Phase-9.3-Fixture weist zusätzlich bidirektional nach:

- `Stieglitz` → `Carduelis carduelis`
- `Carduelis ...` → belegter deutscher Name
- `Animalia` als Standard und bewusste Suche über alle Reiche
- vollständige Detailansicht mit Quelle, Release und Hierarchie

Der reale Referenzbestand weist außerdem einen zulässigen Sonderfall auf: Eine Projektart kann auf Artstufe im
Release fehlen, während zugehörige Unterarten vorhanden sind. Der Projektabgleich kennzeichnet dies als
`Referenzlücke`, nimmt keine Unterart als Ersatz und ändert keine Projektdaten. `Sciurus vulgaris` ist der aktuell
bekannte reale Fall.

Im Wartungsbereich wird die installierte Referenz genau einmal als `Aktive Referenz` angezeigt. Die folgende
Detailzeile nennt nur die neueste verfügbare Version. Arten mit Konflikten oder Referenzlücken stehen nach
`Manuell zu prüfen:` in einer eigenen Zeile, damit die Information auch bei mehreren Arten lesbar bleibt.

Die aktive vollständige Datenbank liegt außerhalb des Repositorys unter
`%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy\releases\<Release>\taxonomy.sqlite`. Sie darf zur
Analyse mit einem SQLite-Werkzeug nur lesend geöffnet werden. Direkte Änderungen wären beim nächsten Release
verloren; bestätigte Sonderzuordnungen gehören in `species-reference-mappings.json`, zusätzliche fachliche
Fallbackquellen in die kontrollierte Import- und Konfliktschicht.

## Abgrenzung zu Squarespace

Die Referenzsuche ist ausschließlich Bestandteil des lokalen Arten-Explorers. Phase 9.4 ändert keine
Squarespace-Container, keine Footer-Skripte, kein Custom CSS und keine produktive Artseite.
