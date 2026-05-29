# Roadmap

Stand: 2026-05-29

Definition of Done fuer alle weiteren Schritte: Ein Schritt gilt erst als abgeschlossen, wenn die betroffenen Dateien
geaendert, geprueft und die dazugehoerige Dokumentation aktualisiert sind. Mindestens zu pruefen sind `AGENTS.md`,
`README.md`, `docs/roadmap.md` und passende Detaildokumente unter `docs/`.

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
- NC-Sounds werden bei jedem Lauf erneut auf freie Xeno-Canto-, Commons- und iNaturalist-Alternativen geprueft.
- Beim Lauf am 2026-05-26 wurde `Eurasisches Eichhoernchen` auf eine freie BY-SA-4.0-Aufnahme ersetzt.

## Phase 4 - Datenqualitaet, Sounds und Quellen

Status: erledigt

- Verbleibende NC-Soundlizenzen geprueft und nach Moeglichkeit ersetzt.
- `Fischertukan` wurde auf eine freie Wikimedia-Commons-/iNaturalist-Aufnahme mit CC BY-SA 4.0 ersetzt.
- `Grosstrappe` wurde durch die nun integrierte Commons-Fallbacksuche automatisch auf eine freie Wikimedia-Commons-Aufnahme mit CC BY-SA 4.0 ersetzt.
- Die Suche nach freien Alternativen wurde um iNaturalist erweitert. Es werden nur exakt passende Taxa, kommerziell nutzbare CC-/Public-Domain-Lizenzen und echte MP3-Dateien akzeptiert.
- `Mittelamerikanischer Totenkopfaffe` und `Panama-Kapuzineraffe` wurden dadurch auf freie iNaturalist-Aufnahmen mit CC BY 4.0 ersetzt.
- Die Zahl der aktiven NC-Sounds wurde damit von 8 auf 3 reduziert.
- Fuer die verbleibenden 3 NC-Faelle ergab die erweiterte Xeno-Canto-, Wikimedia-Commons- und iNaturalist-Suche keine direkt verwendbare freie MP3-Alternative.
- Sound-Credits und Lizenzhinweise werden im Frontend bereits mit Quelle, Aufnahme, Lizenzlink und Quelllink ausgegeben.
- Karten-, Sound- und Daten-Fallbacks wurden erneut geprueft; aktuell kein Frontend-Patch noetig.
- README und Betriebsdoku bleiben als laufender Abgleich in Phase 5.

## Phase 5 - Struktur, Assets und Wartbarkeit

Status: in Arbeit

- 5.1 Repo- und Dateiaudit: erledigt, siehe `docs/repo-file-audit.md`.
- 5.2 Dokumentation aktualisieren, inklusive AGENTS-/Uebergabe-Dokumentation: erledigt und ab jetzt fortlaufende Pflicht.
- 5.3 Lokalen Workflow und Repo-Struktur absichern: erledigt, siehe `docs/repo-structure.md`.
- 5.4 Soundbar verbessern: erledigt; nach Optikfeedback auf native Audio-Wiedergabe mit Canvas-Wellenform,
  gekapselten Modulstyles und reduzierter Credit-Anzeige umgestellt, siehe `docs/soundbar.md`.
- 5.5 Manuelle Zusatzdaten nur dort pflegen, wo IUCN nichts liefert: erledigt.
  `species_list.json` fuehrt jetzt manuell gepflegte `life_expectancy`; `update.mjs` uebernimmt sie als
  `Lebenserwartung` in `speciesData.json`, und `species-info.js` zeigt sie oberhalb der Generationsdauer.
- 5.6 Weitere Arten ergaenzen: erledigt fuer den aktuellen Stand.
  Neue Arten werden nur manuell in `species_list.json` ergaenzt, nicht automatisiert. Der Ablauf ist in
  `docs/add-species-workflow.md` dokumentiert. Am 2026-05-28 wurde die Pipeline ohne neue Arten durchgefuehrt:
  45 Arten, 45 Karten, 45 Soundordner, 45 MP3s, 45 Credits, keine fehlenden Kernassets.
- 5.7 SEO: in Arbeit.
  `docs/seo-worklist.md` enthaelt jetzt einen Live-Sitemap-Audit fuer 117 URLs mit aktuellem SEO-Titel, aktueller
  Meta-Beschreibung, konsistentem Vorschlag, Status und Hinweis je URL. Kurzbefund: 13 passen bereits, 53 brauchen
  Titel und Beschreibung, 42 brauchen nur eine vereinheitlichte Beschreibung, 7 brauchen einen vereinheitlichten Titel,
  1 URL liefert 404 und 1 Pfad ist strukturell auffaellig. Zusaetzlich sind per internem Link-Crawl Legacy-, Redirect-
  und Systempfade ausserhalb der Sitemap dokumentiert. Manueller Stand vom 2026-05-29: Basis-Titel,
  Reise-Uebersichten, Reise-Detailseiten und Wildlife-Uebersichten sind laut Felix in Squarespace umgesetzt und in der
  Worklist als `umgesetzt, live pruefen` markiert. `/reisen/2024-costarica` ist eingetragen, aber noch nicht
  oeffentlich freigegeben. Offen bleiben die Wildlife-Artseiten und der spaetere Live-Audit.
- 5.8 Ordnerstruktur und Assets pro Art nach sanitisiertem Namen bewerten.
- 5.9 Spaeterer Ausbau erst nach technischer Stabilitaet:
  Ausruestungsseite, Affiliate, Shop/Kalender, rechtliche Folgepruefung und optional eine hochwertigere
  Spektrogramm-/Frequenzdarstellung fuer Tierstimmen.

### Phase 5 - Vorschlag fuer die naechsten Schritte

1. SEO-Arbeiten in Squarespace fortsetzen: Als naechstes nur die Wildlife-Artseiten aus `docs/seo-worklist.md`
   bearbeiten. Bereits markierte Zeilen mit `passt`, `umgesetzt, live pruefen` oder `eingetragen, nicht oeffentlich`
   nicht erneut anfassen; spaeter per Live-Audit pruefen.
2. Asset-Struktur bewerten: pro Art Buendelung nach sanitisiertem Namen konzipieren, aber erst nach stabilem Betrieb migrieren.
3. Spaeterer Ausbau: Ausruestungsseite, Affiliate, Shop/Kalender, rechtliche Folgepruefung und optional
   Spektrogramm-Assets fuer Tierstimmen erst nach Abschluss der technischen Stabilisierung.
