# Repo File Audit

Stand: 2026-05-26

Ziel dieses Audits: Dateibestand, lokale Altlasten, generierte Assets und Strukturentscheidungen fuer Phase 5 bewerten,
ohne direkt Dateien zu loeschen oder Pfade umzubauen.

## Kurzfazit

Der produktive Git-Stand ist konsistent: 45 Arten, 45 Karten, 45 Soundordner, 45 MP3-Dateien und 45 Credits. Die
GitHub-Pages-relevanten Frontend- und Datenpfade passen zusammen.

Die groessten Risiken liegen nicht in den aktiven Frontend-Dateien, sondern in lokalen, ignorierten Workflow-Dateien:
Die lokalen Batch-Dateien enthalten Zugangsdaten und sollten nicht weiterverwendet werden. Der lokale `Agents.md` ist
zudem veraltet, untracked und inhaltlich nicht mehr deckungsgleich mit dem aktuellen Projektstand.

## Gepruefte Kennzahlen

| Bereich | Ergebnis |
|---|---:|
| Getrackte Dateien | 180 |
| Arten in `speciesData.json` | 45 |
| Arten in `species_list.json` | 45 |
| Soundordner | 45 |
| MP3-Dateien | 45 |
| Credits-Dateien | 45 |
| Karten | 45 |
| NC-Sounds laut Report | 6 |
| Fehlende Kernassets | 0 |
| JS-/MJS-Syntaxfehler | 0 |

## Befunde

| Bereich | Datei / Ordner | Befund | Risiko | Empfehlung |
|---|---|---|---|---|
| Sicherheit | `update_local.bat`, `update_github_only.bat` | Lokal ignorierte Batch-Dateien enthalten eingebettete GitHub-Zugangsdaten. | Hoch | Token in GitHub widerrufen, Batch-Dateien loeschen oder durch sicheren Workflow mit Credential Manager/SSH/Umgebungsvariablen ersetzen. Nicht ins Repo aufnehmen. |
| Uebergabe | `Agents.md` | Untracked, veraltet und teilweise ueberholt: nennt alte NC-Zahlen, alte Footer-Versionen, altes `Lebenserwartung`-Feld und alte Lightbox-Prioritaet. | Mittel | In Phase 5.2 durch sauberes `AGENTS.md` oder `docs/project-handoff.md` ersetzen. Danach lokale Altdatei entfernen. |
| Hilfsskript | `list_licenses.mjs` | Untracked Hilfsskript listet Sound-Lizenzen. Funktion ist inzwischen teilweise durch `fehlende_elemente_report.json` und `docs/sound-license-review.md` abgedeckt. | Niedrig | Entweder entfernen oder bewusst als `tools/list-licenses.mjs` versionieren und dokumentieren. |
| Lokale Logs | `errors.log` | Ignorierte lokale Fehlerhistorie. Nicht fuer GitHub Pages noetig. | Niedrig | Lokal behalten oder rotieren/loeschen. Nicht versionieren. |
| Abhaengigkeiten | `node_modules/` | Ignoriert und lokal vorhanden. | Niedrig | Korrekt ignoriert. Installation laeuft ueber `package-lock.json`. |
| Testartefakte | `Testlauf/` | Ignoriert und aktuell leer. | Niedrig | Beibehalten als Ablage fuer temporaere Tests. Nach Tests weiter leeren. |
| Gitignore | `.gitignore` | Enthalt eine fehlerhafte Zeile `errors.logupdate_github_only.bat`; die relevanten Dateien werden aber durch separate Zeilen trotzdem ignoriert. | Niedrig | In Phase 5.2 aufraeumen, ohne Verhalten zu aendern. |
| README | `readme.md` | Inhalt aktuell brauchbar, Dateiname aber nicht konventionell grossgeschrieben. | Niedrig | Optional spaeter auf `README.md` umbenennen. Auf Windows nur mit sauberem Git-Move in zwei Schritten. |
| Grafikassets | `graphics/catagory/` und `graphics/catagory/Alternativ/` | `species-status.js` nutzt nur `graphics/catagory/Alternativ/` und `graphics/trend/`. Die PNGs direkt unter `graphics/catagory/` wirken derzeit ungenutzt. `Blaupause.psd` ist vermutlich Quelldatei. | Mittel | Nicht sofort loeschen. In Phase 5.3 entscheiden: ungenutzte Statusicons entfernen/archivieren oder als Designquelle dokumentieren. Ordnername `catagory` wegen Live-Pfaden vorerst nicht umbenennen. |
| Assets | `sounds/`, `Verbreitungskarten/` | Vollstaendig und konsistent, aber getrennt nach Assettyp statt pro Art gebuendelt. Sounds sind mit ca. 160 MB der groesste Repo-Bereich. | Mittel | Asset-Buendelung nur als bewusste Migration planen, weil alle GitHub-Pages-Pfade und Loader betroffen sind. |
| Datenpipeline | `update.mjs` | Funktional, aber inzwischen relativ gross und enthaelt IUCN-, Karten-, Xeno-Canto-, Commons- und Reportlogik in einer Datei. | Mittel | Vorerst beibehalten. Spaeter nur modularisieren, wenn neue Arten/Felder die Wartung erschweren. |
| Frontend | `species-*.js`, `map-loader.js`, `search.js`, `sort.js`, `lightbox-zoom.js` | Syntax ok, alle Module brechen sauber ab, wenn erwartete Container fehlen. | Niedrig | Beibehalten. `species-sound.js` ist naechster sinnvoller Frontend-Verbesserungspunkt. |
| Sortierung | `sort.js` | Wird im Footer geladen, aktiviert sich nur bei `#species-sort` oder `#species-search`. | Niedrig | Beibehalten und bei Uebersichtsseiten-Tests weiter beobachten. |

## Empfehlung fuer Phase 5

1. Sicherheitsbereinigung lokal: GitHub-Token aus Batch-Workflow entfernen und Token widerrufen.
2. Dokumentation aktualisieren: sauberes `AGENTS.md`/Handoff aus aktuellem Stand erzeugen, alte `Agents.md` entfernen.
3. `.gitignore` bereinigen und lokalen Testlauf-Workflow dokumentieren.
4. Erst danach Soundbar verbessern.
5. Asset-Buendelung pro Art nur nach gesonderter Migrationsentscheidung umsetzen.

## Nicht ohne Freigabe aendern

- Keine Loeschung von `sounds/` oder `Verbreitungskarten/`.
- Keine Umbenennung von `graphics/catagory/`.
- Keine Migration auf `species-assets/<SafeName>/` ohne separaten Patchplan.
- Keine Versionierung lokaler Batch-Dateien mit Zugangsdaten.
