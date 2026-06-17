# Monthly Site Audit

Stand: 2026-06-17

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
| Suche und Sortierung | Uebersichtsseiten `/wildlife/heimische-tierwelt`, `/wildlife/costarica`, `/wildlife/island` pruefen. | offen / erledigt/geprueft |
| Lightbox | Desktop und Mobile-Pinch/Zoom nur erneut manuell testen, wenn JS/CSS/Galerie geaendert wurde. | unveraendert / erledigt/geprueft |
| GitHub Pages Assets | `speciesData.json`, `species-assets/`, Credits, Spektrogramme und Reports pruefen. | offen / erledigt/geprueft |
| Manuell gepflegte Karten | Liste aus `docs/manual-map-overrides.md` beruecksichtigen. | offen / unveraendert / erledigt |
| Sounds und Lizenzen | `fehlende_elemente_report.json` und `docs/sound-license-review.md` pruefen. | offen / erledigt/geprueft |
| Externe Dienste | GitHub Pages, Xeno-Canto, iNaturalist, Wikimedia Commons, Waves/Audio, Shop/Affiliate falls aktiv. | offen / unveraendert |
| Rechtliches | Nur nach neuen Diensten, Shop, Affiliate oder Tracking erneut manuell pruefen. | unveraendert / offen |
| Dokumentation | `AGENTS.md`, `README.md`, `docs/roadmap.md` und betroffene Detaildokumente abgleichen. | offen / erledigt/geprueft |

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

Der Befehl schreibt keine Datei, sondern gibt JSON auf stdout aus. Wenn ein Ergebnis zwischengespeichert werden soll,
gehoert es waehrend der Arbeit nach `Testlauf/` und wird nach Abschluss wieder geloescht oder gezielt als
Monatsbericht unter `docs/audits/` zusammengefasst.

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
