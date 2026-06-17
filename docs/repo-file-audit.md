# Repo File Audit

Stand: 2026-06-17

Ziel dieses Audits: Dateibestand, lokale Altlasten, generierte Assets und Strukturentscheidungen fuer Phase 5 bewerten,
ohne direkt Dateien zu loeschen oder Pfade umzubauen.

## Kurzfazit

Der produktive Git-Stand ist konsistent: 45 Arten, 45 Art-Assetordner, 45 Karten, 45 MP3-Dateien und 45 Credits. Die
GitHub-Pages-relevanten Frontend- und Datenpfade passen zusammen.

Die groessten Risiken liegen nicht in den aktiven Frontend-Dateien. Der lokale Workflow und die Dokumentation muessen
aber weiter diszipliniert gepflegt werden: Batch-Dateien bleiben ignoriert, duerfen keine Tokens enthalten, und
Dokumentation ist ab Phase 5 Teil der Definition of Done.

## Gepruefte Kennzahlen

| Bereich | Ergebnis |
|---|---:|
| Getrackte Dateien | 186 |
| Arten in `speciesData.json` | 45 |
| Arten in `species_list.json` | 45 |
| Art-Assetordner | 45 |
| MP3-Dateien | 45 |
| Credits-Dateien | 45 |
| Karten | 45 |
| NC-Sounds laut Report | 3 |
| Fehlende Kernassets | 0 |
| JS-/MJS-Syntaxfehler | 0 |

## Befunde

| Bereich | Datei / Ordner | Befund | Risiko | Empfehlung |
|---|---|---|---|---|
| Sicherheit | `update_local.bat`, `update_github_only.bat` | Lokal ignorierte Batch-Dateien sind nicht Teil des Repos. Der aktuell gelesene lokale Stand nutzt eine Remote-URL ohne Token. | Mittel | Weiterhin nicht versionieren. Bei Workflow-Aenderungen pruefen, dass keine Tokens oder privaten URLs enthalten sind. |
| Uebergabe | `AGENTS.md` | Aktuelle Projektuebergabe wurde neu erstellt und soll versioniert werden. | Niedrig | Bei jedem Roadmap-Schritt aktuell halten. Kein Schritt gilt ohne passende Doku-Aktualisierung als abgeschlossen. |
| Hilfsskript | `list_licenses.mjs` | Altes lokales Hilfsskript zum Auflisten von Sound-Lizenzen. Funktion ist inzwischen durch `fehlende_elemente_report.json` und `docs/sound-license-review.md` abgedeckt. | Niedrig | Nicht benoetigt. Falls spaeter erneut gebraucht, nur temporaer in `Testlauf/` anlegen. |
| Lokale Logs | `errors.log` | Ignorierte lokale Fehlerhistorie. Nicht fuer GitHub Pages noetig. | Niedrig | Lokal behalten oder rotieren/loeschen. Nicht versionieren. |
| Abhaengigkeiten | `node_modules/` | Ignoriert und lokal vorhanden. | Niedrig | Korrekt ignoriert. Installation laeuft ueber `package-lock.json`. |
| Testartefakte | `Testlauf/` | Ignoriert und aktuell leer. | Niedrig | Beibehalten als Ablage fuer temporaere Tests. Nach Tests wieder leeren. Keine Testartefakte versionieren. |
| Gitignore | `.gitignore` | Bereinigt: lokale Abhaengigkeiten, Logs, `.env`, Batch-Dateien, `Testlauf/` und lokale Hilfsskripte sind ignoriert. | Niedrig | Beibehalten; keine breiten Regeln fuer produktive Dateitypen wie `.js`, `.json`, `.mp3` oder `.jpg` ergaenzen. |
| README | `README.md` | Root-README ist bewusst fuer GitHub sichtbar. Detaildokumente liegen unter `docs/`. | Niedrig | Im Root behalten. Nicht nach `docs/` verschieben. |
| Grafikassets | `graphics/catagory/` und `graphics/catagory/Alternativ/` | `species-status.js` nutzt nur `graphics/catagory/Alternativ/` und `graphics/trend/`. Die PNGs direkt unter `graphics/catagory/` wirken derzeit ungenutzt. `Blaupause.psd` ist vermutlich Quelldatei. | Mittel | Nicht sofort loeschen. In der spaeteren Asset-Struktur-Phase entscheiden: ungenutzte Statusicons entfernen/archivieren oder als Designquelle dokumentieren. Ordnername `catagory` wegen Live-Pfaden vorerst nicht umbenennen. |
| Assets | `species-assets/` | Artspezifisch gebuendelt: `map.jpg`, `sound.mp3`, `credits.json`, `spectrogram.webp`. Die alten Ordner `sounds/` und `Verbreitungskarten/` wurden entfernt. | Niedrig | Beibehalten. Bei kuenftigen Pfadaenderungen Loader, Pipeline, Audit, Generator und Doku gemeinsam anpassen. |
| Datenpipeline | `update.mjs` | Funktional, aber inzwischen relativ gross und enthaelt IUCN-, Karten-, Xeno-Canto-, Commons- und Reportlogik in einer Datei. | Mittel | Vorerst beibehalten. Spaeter nur modularisieren, wenn neue Arten/Felder die Wartung erschweren. |
| Frontend | `species-*.js`, `map-loader.js`, `search.js`, `sort.js`, `lightbox-zoom.js` | Syntax ok, alle Module brechen sauber ab, wenn erwartete Container fehlen. | Niedrig | Beibehalten. Soundbar ist aktuell als native Canvas-Komponente umgesetzt; `species-info.js` zeigt manuelle Lebenserwartung oberhalb der Generationsdauer. |
| Sortierung | `sort.js` | Wird im Footer geladen, aktiviert sich nur bei `#species-sort` oder `#species-search`. | Niedrig | Beibehalten und bei Uebersichtsseiten-Tests weiter beobachten. |

## Empfehlung fuer Phase 5

1. Alten GitHub-Token widerrufen, falls noch nicht geschehen, und Batch-Dateien weiterhin tokenfrei halten.
2. `.gitignore` bereinigen und lokalen Testlauf-/Batch-Workflow dokumentieren: erledigt, siehe `docs/repo-structure.md`.
3. Soundbar ist in Phase 5.4 als native Canvas-Komponente umgesetzt, siehe `docs/soundbar.md`.
4. Manuelle Zusatzdaten sind in Phase 5.5 dokumentiert, siehe `docs/manual-species-fields.md`.
5. Der manuelle Ablauf fuer neue Arten ist in Phase 5.6 dokumentiert, siehe `docs/add-species-workflow.md`.
6. Asset-Buendelung pro Art wurde in Phase 6.8 umgesetzt. Primaere Struktur ist jetzt
   `species-assets/<SafeName>/`; `sounds/` und `Verbreitungskarten/` wurden entfernt. Details stehen in
   `docs/asset-structure-plan.md`.

## Nicht ohne Freigabe aendern

- Keine Umbenennung von `graphics/catagory/`.
- Keine Versionierung lokaler Batch-Dateien.
- Keine Roadmap-Schritte ohne aktualisierte Dokumentation abschliessen.
