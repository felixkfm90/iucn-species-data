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
| Artseiten-Module | Stichprobe oder Vollcheck fuer Titelbild/-text, Info, Taxonomie, Status, Portrait, Sound und Karte; Umfang und Desktop-/Tablet-/Mobilansichten ausdruecklich benennen. | offen / erledigt/geprueft |
| Suche und Sortierung | Wildlife-Uebersicht und vorhandene regionale Artenuebersichten pruefen; Arten alphabetisch, vorhandene Abschlusskachel „Weitere Tiere“ immer zuletzt, auch nach spaet nachgeladenen Arten. | offen / erledigt/geprueft |
| Lightbox | Desktop-, Tablet- und Mobilansicht sowie Tastatur-/Touch-Bedienung nur erneut manuell testen, wenn JS/CSS/Galerie geaendert wurde; jeweilige Pruefart benennen. | unveraendert / erledigt/geprueft |
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

Der Galeriezoom öffnet einen benannten modalen Dialog. Tab und Umschalt-Tab bleiben darin; Schließen gibt den
Fokus zum Zoomknopf und den vorherigen Hintergrundzustand zurück. Die vollständige Escape-Tastensequenz einschließlich Wiederholung und
Loslassen gehört dem Zoomdialog; erst ein weiterer Tastendruck schließt die umgebende Galerie.
Der Schließenknopf erhält die Galerie; Fenster-Fokusverlust löst eine zurückgebliebene Tastenbindung.
Reale Galerie und Rückkehransicht zusätzlich zu automatisierten Gegenproben prüfen.

Die [Footer-Referenz](squarespace-footer.html) führt die Skript-/Cacheversionen; das gekoppelte
[Standard-CSS](squarespace-custom.css) gehört zum selben Quellvergleich. Diese Quellen beschreiben den
verbindlichen Einbau- und Cachevertrag. Pages-Veröffentlichung, CMS-Übernahme sowie tatsächlich geladene
öffentliche Module, CSS und Darstellung sind getrennt zu prüfen. Während des laufenden Gesamtaudits stehen
Ergebnisse und Grenzen ausschließlich im [Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md).
Datierte Live-Belege gelten nur für den jeweils gebundenen Prüfzeitpunkt und Quellstand.

Das responsive Artseiten-Grundlayout erhält die volle Bildbreite mit bisherigem Ausschnitt,
ursprünglicher Fokusposition und Bildüberlagerung. Desktop und Tablet überlagern
es mit Titel und Rückknopf in den bisherigen Farben; mobil stehen diese darunter, der Titel ist schwarz.
Die Wildlife-Kategorien folgen in allen Ansichten derselben Reihenfolge: Heimische Tierwelt zuerst,
danach alphabetisch; Kategorien mit „In Arbeit“ zuletzt. Gekoppelte JS-/CSS-Regeln gemeinsam prüfen.

Squarespace Custom CSS enthält nur den kanonischen Import:

```css
@import url("https://felixkfm90.github.io/iucn-species-data/docs/squarespace-custom.css?v=1.0.19");
```

Die externe Datei bleibt Standard-CSS und wird vom Browser verarbeitet. Der CMS-Compiler LESS 1.3.3
kann die verwendeten Media-Range-Abfragen nicht kompilieren; deshalb keine CSS-Kopie oder eigene
LESS-Fassung im CMS pflegen. Taxonomie-Skript und CSS-Import verwenden dieselbe `?v=`-Kennung,
hier **1.0.19**; bei einem Wechsel Import und [Footer-Referenz](squarespace-footer.html) gemeinsam anpassen.
Nach dem Speichern die tatsächlich geladenen Quellen, Cacheversionen und berechnete Darstellung
prüfen. Die Kontakt-/Footer-/Ausrüstungsregeln bleiben auf vorhandene Blöcke begrenzt; Änderungen
in Desktop-, Tablet- und Mobilansicht nachprüfen. Der Einbauvertrag ersetzt keinen öffentlichen Abschlussbeleg.

Kontakt und Über uns zeigen bis 1024 px die vorhandenen Fotos vollständig in einem natürlichen
Raster mit mitwachsender Höhe. Kontakt behält Überschrift, Einleitung, Foto, Formular und
Datenschutzhinweis in dieser Reihenfolge; Über uns behält mobil das Foto vor der Einleitung.
Die begrenzten Kontakt-/Ausrüstungsüberschriften brechen in ganzen Wörtern um. Auf Sizilien
besitzt die Überschrift ab 768 px eine eigene mitwachsende Zeile vor Hinweis und Zurück-Knopf.
Diese Regeln ändern keine Fotos oder Texte und gelten nur für die konkret bezeichneten Blöcke.

Die Karten-/Textregeln verwenden bis unter 768 CSS-Pixel die Bedingung `width < 768px`.
`max-width: 767px` lässt bei gebrochener Skalierung eine schmale ungeregelte Breitenlücke. Grenzbreiten
und Skalierungsfälle nach Änderungen in der tatsächlich veröffentlichten Browserdarstellung prüfen;
die Media-Abfragen werden über den kanonischen Import als Standard-CSS ausgewertet.

Die Reiseübersicht führt Latium visuell und in der Lesereihenfolge unter 2022. Die Regel erhält die
vorhandenen „In Arbeit“-Bänder ihrer Logo-Platzhalter; gewöhnliche Reisefotos erhalten kein Band.
Die vorhandenen Karten und Originalblöcke bleiben erhalten; vor Übernahme die aktuelle CMS-Bindung prüfen.
Seine mobile CSS greift erst nach erfolgreicher DOM-Korrektur. Bei einer anderen Blockstruktur,
bekanntermaßen veränderter Reihenfolge oder geänderten Titeln bleibt die Korrektur aus; nach struktureller
CMS-Bearbeitung die Bindung prüfen. Der alphabetische Artensortierer bleibt davon unabhängig.

Die freigegebenen mobilen Überschriften von Datenschutz, Haithabu, Lütjenburg und der Home-
Kontaktanfrage erhalten ganze Wörter. Home ordnet im Tabletbereich Text/Formular und vollständige Personenfotos untereinander an;
Spenden verwendet breiten Textfluss, ganze Fotos und einen kompakteren Titel. Die Regeln gelten nur
für ihre bezeichneten Blöcke; Wildlife und Reiseübersicht bleiben erhalten. Der Kontaktseitenhinweis
steht auch unmittelbar beim Home-Formular als tatsächlicher CMS-Text mit dem vorhandenen
Datenschutz-Linkziel; kein CSS-Pseudoinhalt. Inhalt und Layoutübernahme getrennt nachweisen.

Die kompakte Verbreitungskarte zeigt das vollständige Bild mit höchstens 360 Pixel Höhe in einem
Öffner bis 640 Pixel Breite. Tablet/Desktop beginnen links unter der Überschrift, mobil bleibt sie
zentriert. „Karte vergrößern“ ist in allen Ansichten als nativer Knopf erreichbar. Dialog, Tastaturbindung,
Hintergrundschutz und Rückkehrfokus bleiben erhalten. Karten-/CSS-/Footerstand gemeinsam prüfen;
Quellintegration und tatsächlich veröffentlichte Darstellung getrennt nachweisen.

Galeriebeschriftungen und Bildfokus werden in den tatsächlichen CMS-Galerieeinträgen gepflegt.
Ein veränderter Vorschaubildfokus erhält die quadratische Galerie und ihr vollständiges Original in der
Vergrößerung. Bei reinen Textkorrekturen Bildquellen, Reihenfolge und übrige Beschriftungen vergleichen;
keine fehlenden Links oder neuen Seitenziele daraus ableiten.

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

Datierte Monatsberichte liegen unter `docs/audits/`, etwa der historische
[Monatsbericht Juni 2026](audits/2026-06-site-audit.md). Sie bleiben unveränderte Zeitaufnahmen.
Für das laufende Gesamtaudit werden Ergebnisse ausschließlich im
[Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md) fortgeschrieben; kein zweiter Bericht wird angelegt.

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
