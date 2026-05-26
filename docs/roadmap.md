# Roadmap

Stand: 2026-05-26

## Phase 1 - Frontend-Stabilitaet

Status: erledigt

- `lightbox-zoom.js` stabilisiert und live geprueft.
- Suche auf Uebersichtsseiten stabilisiert.
- Gemeinsamer Species-Datenloader und Cache in `species-core.js` eingefuehrt.
- GitHub-Pages-Assetpfade fuer Status-, Trend-, Karten- und Soundmodule vereinheitlicht.

## Phase 2 - Squarespace-Integration und CSS

Status: erledigt

- Aktueller Squarespace Footer unter `docs/squarespace-footer.html` dokumentiert.
- Aktuelles Squarespace Custom CSS unter `docs/squarespace-custom.css` dokumentiert.
- CSS-/Layout-Audit unter `docs/css-layout-audit.md` dokumentiert.
- Live-Checks fuer Detailseite, Uebersichtsseite, Mobile Layout und Lightbox-Smoke-Test durchgefuehrt.

## Phase 3 - Datenpipeline stabilisieren

Status: erledigt

- `update.mjs` nach den letzten Schutzlogiken komplett ausgefuehrt.
- Report, Assets, Assessment-Tracking und erzeugtes `speciesData.json` geprueft.
- Vorhandene gute Daten wurden nicht durch unvollstaendige API-Antworten verschlechtert.
- NC-Sounds werden bei jedem Lauf erneut auf freie Xeno-Canto-Alternativen geprueft.
- Beim Lauf am 2026-05-26 wurde `Eurasisches Eichhoernchen` auf eine freie BY-SA-4.0-Aufnahme ersetzt.

## Phase 4 - Datenqualitaet, Sounds und Quellen

Status: offen

- Verbleibende NC-Soundlizenzen pruefen und nach Moeglichkeit ersetzen.
- Sound-Credits und Lizenzhinweise im Frontend weiter bewerten.
- Karten-Fallbacks und Daten-Fallbacks erneut pruefen.
- README und Betriebsdoku mit dem finalen Update-Prozess abgleichen.

## Phase 5 - Struktur, Assets und Wartbarkeit

Status: offen

- Assets pro Art nach sanitisiertem Namen buendeln.
- Soundbar verbessern.
- Ordnerstruktur pruefen und bei Bedarf anpassen.
- Alle Dokumentationen pruefen und aktualisieren, inklusive AGENTS-/Uebergabe-Dokumentation.
- Alle Dateien im Repository pruefen: sinnvoll, alt, doppelt oder ueberfluessig.
