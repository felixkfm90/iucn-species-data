# Roadmap

Stand: 2026-05-27

Definition of Done fuer alle weiteren Schritte: Ein Schritt gilt erst als abgeschlossen, wenn die betroffenen Dateien
geaendert, geprueft und die dazugehoerige Dokumentation aktualisiert sind. Mindestens zu pruefen sind `AGENTS.md`,
`readme.md`, `docs/roadmap.md` und passende Detaildokumente unter `docs/`.

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
- 5.3 Ordnerstruktur und Assets pro Art nach sanitisiertem Namen bewerten.
- 5.4 Soundbar verbessern.
- 5.5 Manuelle Zusatzdaten nur dort pflegen, wo IUCN nichts liefert.
- 5.6 Weitere Arten ergaenzen.
- 5.7 SEO: Titel, Meta-Beschreibungen, Alt-Texte, interne Verlinkung.
- 5.8 Ausruestungsseite, Affiliate, Shop/Kalender erst nach technischer Stabilitaet.

### Phase 5 - Vorschlag fuer die naechsten Schritte

1. Lokalen Workflow absichern: Batch-Dateien, `.gitignore`, Token-Hinweise und GitHub-only-Push-Ablauf pruefen und dokumentieren.
2. Soundbar verbessern: Player-UX, Credits-Darstellung, fehlende/NC-Sound-Hinweise und mobile Bedienung pruefen.
3. Manuelle Zusatzdaten bereinigen: nur Felder pflegen, die IUCN nicht liefert, z. B. Groesse, Gewicht und ggf. echte Lebenserwartung.
4. Weitere Arten ergaenzen: erst Datenliste erweitern, dann Pipeline laufen lassen, danach Report und Seiten testen.
5. SEO-Arbeiten: Seitentitel, Meta-Beschreibungen, Alt-Texte und interne Verlinkung systematisch pruefen.
6. Asset-Struktur bewerten: pro Art Buendelung nach sanitisiertem Namen konzipieren, aber erst nach stabilem Betrieb migrieren.
7. Spaeterer Ausbau: Ausruestungsseite, Affiliate, Shop/Kalender und rechtliche Folgepruefung erst nach Abschluss der technischen Stabilisierung.
