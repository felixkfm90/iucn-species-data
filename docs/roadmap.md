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
- NC-Sounds werden bei jedem Lauf erneut auf freie Xeno-Canto- und Commons-Alternativen geprueft.
- Beim Lauf am 2026-05-26 wurde `Eurasisches Eichhoernchen` auf eine freie BY-SA-4.0-Aufnahme ersetzt.

## Phase 4 - Datenqualitaet, Sounds und Quellen

Status: erledigt

- Verbleibende NC-Soundlizenzen geprueft und nach Moeglichkeit ersetzt.
- `Fischertukan` wurde auf eine freie Wikimedia-Commons-/iNaturalist-Aufnahme mit CC BY-SA 4.0 ersetzt.
- `Grosstrappe` wurde durch die nun integrierte Commons-Fallbacksuche automatisch auf eine freie Wikimedia-Commons-Aufnahme mit CC BY-SA 4.0 ersetzt.
- Die Zahl der aktiven NC-Sounds wurde damit von 8 auf 6 reduziert.
- Fuer die verbleibenden 6 NC-Faelle ergab die erweiterte Xeno-Canto- und Wikimedia-Commons-Suche keine direkt verwendbare freie MP3-Alternative.
- Sound-Credits und Lizenzhinweise werden im Frontend bereits mit Quelle, Aufnahme, Lizenzlink und Quelllink ausgegeben.
- Karten-, Sound- und Daten-Fallbacks wurden erneut geprueft; aktuell kein Frontend-Patch noetig.
- README und Betriebsdoku bleiben als laufender Abgleich in Phase 5.

## Phase 5 - Struktur, Assets und Wartbarkeit

Status: in Arbeit

- 5.1 Repo- und Dateiaudit: erledigt, siehe `docs/repo-file-audit.md`.
- 5.2 Dokumentation aktualisieren, inklusive AGENTS-/Uebergabe-Dokumentation.
- 5.3 Ordnerstruktur und Assets pro Art nach sanitisiertem Namen bewerten.
- 5.4 Soundbar verbessern.
- 5.5 Manuelle Zusatzdaten nur dort pflegen, wo IUCN nichts liefert.
- 5.6 Weitere Arten ergaenzen.
- 5.7 SEO: Titel, Meta-Beschreibungen, Alt-Texte, interne Verlinkung.
- 5.8 Ausruestungsseite, Affiliate, Shop/Kalender erst nach technischer Stabilitaet.
