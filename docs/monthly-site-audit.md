# Monthly Site Audit

Stand: 2026-10-26

Ziel: Einmal pro Monat soll die komplette Website und GitHub-Pages-Integration strukturiert geprueft werden. Das Audit
soll nicht jeden unveraenderten Bereich erneut manuell im Detail pruefen, aber keinen Bereich ignorieren. Unveraenderte
Bereiche werden als `nicht erneut manuell geprueft, unveraendert` ausgewiesen.

## Grundregel

Das Audit liefert eine Zusammenfassung mit klarer Einordnung:

- `offen`: Es gibt ein Problem, eine Entscheidung oder eine noch ausstehende Arbeit.
- `erledigt/geprueft`: Der Punkt wurde im aktuellen Audit aktiv geprueft und passt.
- `nicht erneut manuell geprueft, unveraendert`: Seit dem letzten passenden Check gab es keine relevante Aenderung.
- `noch nicht geprueft`: Der Punkt ist bekannt, aber im aktuellen Lauf nicht bewertet.
- `bewusst akzeptiert/geparkt`: Der Punkt ist bekannt und wird aktuell absichtlich nicht geaendert.

## Monatlicher Pruefumfang

| Bereich | Pruefung | Ergebnisstatus |
|---|---|---|
| Sitemap und URLs | Sitemap laden, HTTP-Status pruefen, 404/302/200 erfassen. | offen / erledigt/geprueft |
| Interne Links | Interne Links crawlen, nicht in Sitemap vorhandene Pfade erfassen. | offen / erledigt/geprueft |
| SEO | Titel und Meta-Beschreibungen gegen `docs/seo-worklist.md` pruefen. | offen / unveraendert / erledigt |
| Artseiten-Module | Stichprobe oder Vollcheck fuer Info, Taxonomie, Status, Sound und Karte. | offen / erledigt/geprueft |
| Suche und Sortierung | Uebersichtsseiten `/wildlife/heimische-tierwelt`, `/wildlife/costarica`, `/wildlife/island` pruefen; Arten alphabetisch, vorhandene Abschlusskachel „Weitere Tiere“ immer zuletzt, auch nach spaet nachgeladenen Arten. | offen / erledigt/geprueft |
| Lightbox | Desktop und Mobile-Pinch/Zoom nur erneut manuell testen, wenn JS/CSS/Galerie geaendert wurde. | unveraendert / erledigt/geprueft |
| GitHub Pages Assets | `speciesData.json`, `species-assets/`, Credits, Spektrogramme und Reports pruefen. | offen / erledigt/geprueft |
| Manuell gepflegte Karten | Liste aus `docs/manual-map-overrides.md` beruecksichtigen. | offen / unveraendert / erledigt |
| Sounds und Lizenzen | `fehlende_elemente_report.json` und `docs/sound-license-review.md` pruefen. | offen / erledigt/geprueft |
| Externe Dienste | GitHub Pages, Xeno-Canto, iNaturalist, Wikimedia Commons, Waves/Audio, Shop/Affiliate falls aktiv. | offen / unveraendert |
| Rechtliches | Nur nach neuen Diensten, Shop, Affiliate oder Tracking erneut manuell pruefen. | unveraendert / offen |
| Dokumentation | `AGENTS.md`, `README.md`, `docs/roadmap.md` und betroffene Detaildokumente abgleichen. | offen / erledigt/geprueft |

## Öffentliche Bedien- und CSS-Verträge

Taxonomie zeigt in der Artzeile das vollständige Binomen, ohne eine bereits enthaltene Gattung zu
verdoppeln. Das Suchfeld heißt „Arten durchsuchen“;
Trefferzahlen werden als Status ausgegeben. Die Sortierung hält eine vorhandene Kachel „Weitere Tiere“
am Ende; das Nachladen wird innerhalb des vorhandenen Beobachterzeitraums geprüft.

Zoom 1.0.9 öffnet einen benannten modalen Dialog. Tab und Umschalt-Tab bleiben darin; Schließen gibt den
Fokus zum Zoomknopf und den vorherigen Hintergrundzustand zurück. Die vollständige Escape-Tastensequenz einschließlich Wiederholung und
Loslassen gehört dem Zoomdialog; erst ein weiterer Tastendruck schließt die umgebende Galerie.
Der Schließenknopf erhält die Galerie; Fenster-Fokusverlust löst eine zurückgebliebene Tastenbindung.
Reale Galerie und Rückkehransicht zusätzlich zu automatisierten Gegenproben prüfen.

Footer-Referenz: Taxonomie/CSS 1.0.17, Artseitenlayout 1.0.4, Karte 1.0.11, Desktopnavigation 1.0.0,
Suche 1.0.3, Sortierung 1.0.5 und Zoom 1.0.9. Maßgeblich sind die zwölf Einbindungen in
[squarespace-footer.html](squarespace-footer.html) und das zugehörige Custom CSS. Pages-Veröffentlichung
und Übernahme der Cacheversionen in Squarespace sind getrennt zu prüfen. Während des laufenden
Gesamtaudits stehen Ergebnisse und Grenzen ausschließlich im
[Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md).

`docs/squarespace-custom.css` ist Standard-CSS. Im CMS bleiben die zwei dokumentierten
LESS-escaped `clip-path`-Werte erhalten. Rasterpositionen als `grid-row-start`/`grid-row-end`
beziehungsweise `grid-column-start`/`grid-column-end` schreiben: Der CMS-Compiler kann Schrägstriche
in Kurzformen als Division auswerten. Nach dem Speichern tatsächliche öffentliche CSS-Datei und
berechnete Darstellung prüfen. Die Kontakt-/Footer-/Ausrüstungsregeln sind auf vorhandene Blöcke
begrenzt; jede Änderung in allen drei Ansichten nachprüfen.

Kontakt und Über uns zeigen bis 1024 px die vorhandenen Fotos vollständig in einem natürlichen
Raster mit mitwachsender Höhe. Kontakt behält Überschrift, Einleitung, Foto, Formular und
Datenschutzhinweis in dieser Reihenfolge; Über uns behält mobil das Foto vor der Einleitung.
Die begrenzten Kontakt-/Ausrüstungsüberschriften brechen in ganzen Wörtern um. Auf Sizilien
besitzt die Überschrift ab 768 px eine eigene mitwachsende Zeile vor Hinweis und Zurück-Knopf.
Diese Regeln ändern keine Fotos oder Texte und gelten nur für die konkret bezeichneten Blöcke.

Die Reiseübersicht führt Latium visuell und in der Lesereihenfolge unter 2022. Die vorhandenen
„In Arbeit“-Bänder der noch nicht fertiggestellten Reisen mit FN-Logo bleiben erhalten; sie werden
nicht auf Montenegro beschränkt. Der begrenzte Reisezweig in `sort.js` erhält die 14 vorhandenen Karten.
Seine mobile CSS greift erst nach erfolgreicher DOM-Korrektur. Bei einer anderen Blockstruktur,
bekanntermaßen veränderter Reihenfolge oder geänderten Titeln bleibt die Korrektur aus; nach struktureller
CMS-Bearbeitung die Bindung prüfen. Der alphabetische Artensortierer bleibt davon unabhängig.

Artseiten behalten das Originalfoto und den Rücklink. Das angenommene Layout zeigt den Titel
auf Desktop/Tablet über dem Foto, mobil darunter. Die bestätigten Titelkontraste, neun Tablet-
Bildpositionen und der mobile Eichelhäherfokus bleiben auf ihre jeweiligen Seiten/Breiten begrenzt.
Karten zeigen das vollständige Bild mit höchstens 360 Pixel Höhe und 640 Pixel Öffnerbreite; ab
768 Pixeln links unter der Überschrift, mobil mittig. Öffnen, Schließen und Fokusrückgabe prüfen.
Desktopmenüs melden den sichtbaren Offen-Zustand und schließen auch bei verbleibendem Mauszeiger
mit Escape; ein Klick beziehungsweise Enter/Leertaste öffnen wieder. Die Mobilnavigation bleibt
im Anbieterablauf. Diese gekoppelten Regeln benötigen Footer und CMS Custom CSS gemeinsam.

## Berichtsvorlage

```text
Monatsaudit YYYY-MM

Kurzfazit:
- Gesamtzustand:
- Kritische offene Punkte:
- Bewusst akzeptiert/geparkt:
- Nicht erneut manuell geprueft, weil unveraendert:

Offen:
- ...

Erledigt/geprueft:
- ...

Nicht erneut manuell geprueft, unveraendert:
- ...

Noch nicht geprueft:
- ...

Bewusst akzeptiert/geparkt:
- ...

Empfohlene naechste Schritte:
1. ...
2. ...
```

## Ablage

Monatsaudit-Ergebnisse koennen spaeter als einzelne Dateien unter `docs/audits/` abgelegt werden, z. B.
`docs/audits/2026-06-site-audit.md`. Der Ordner wird erst angelegt, wenn der erste echte Monatsbericht gespeichert
wird.

Aktueller Bericht:

- `docs/audits/2026-06-site-audit.md`

## Automatisierung

Ein reproduzierbarer Teil des Audits liegt unter `scripts/monthly-site-audit.mjs`.

Auf Windows PowerShell `npm.cmd` verwenden, weil `npm.ps1` je nach Execution-Policy blockiert sein kann.

Vollstaendiger Live-Audit:

```bash
npm.cmd run --silent audit:site
```

Nur lokaler Repo-/Assetcheck ohne Netzwerk:

```bash
npm.cmd run --silent audit:site -- --skip-live --skip-pages
```

Der Befehl schreibt keine Datei, sondern gibt JSON auf stdout aus. Gespeicherte technische Ergebnisse
gehören in eigene verwaltete Programm-temp-Sitzungen nach dem [Testvertrag](test-temp-contract.md).
Gebundene Auditbelege bleiben erhalten; aus Dateialter oder fehlendem Zugriff folgt keine Löschfreigabe.
Während des Gesamtaudits wird kein zweiter Monats- oder Auditbericht angelegt.

Aktuell automatisiert:

- Sitemap-/Status-Check
- interner Link-Crawl und Pfade ausserhalb der Sitemap
- SEO-Grundfelder: `<title>` und Meta-Description
- GitHub-Pages-Check fuer `speciesData.json`, `fehlende_elemente_report.json`, `species-assets/Amsel/*` und wichtige
  Frontend-Module
- lokaler Vergleich von `speciesData.json` gegen `species-assets` mit Karten, Sounds, Credits und Spektrogrammen
- Report-Zusammenfassung aus `fehlende_elemente_report.json`
- Erkennung aktiver NC-Soundlizenzen aus `species-assets/*/credits.json`
- Pruefung der manuell gepflegten Karten aus `docs/manual-map-overrides.md`

Nicht automatisiert:

- echte Mobile-/Touch-Bedienung
- visuelle Screenshot-Pruefung
- fachliche SEO-Textqualitaet
- rechtliche Detailpruefung
