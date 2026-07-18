# Image Alt Text Audit

Stand: 2026-07-18

Ziel: Bild-Alternativtexte und optionale Bildtitel der oeffentlichen Squarespace-Seiten pruefen. Der Audit aendert keine
Live-Seite automatisch; die Umsetzung erfolgt in Squarespace-Bildbloecken, Galerien oder spaeter gezielt in den
JavaScript-Modulen.

## Pruefumfang

- Quelle: `https://www.fnwildlifetravel.de/sitemap.xml`
- Gepruefte Sitemap-URLs: 117
- Gefundene `<img>`-Instanzen im Live-HTML: 3.512
- Eindeutige Bild-URLs: 1.479
- Nachpruefung nach Entfernen der Artseiten-Galeriebeschreibungen: 2026-06-15
- Nachpruefung nach Felix' manueller Artseiten-Kontrolle: 2026-06-15. Sichtbarer Galerietext ist laut manueller
  Kontrolle auf den Artseiten entfernt; technische HTML-`alt`-Attribute enthalten weiterhin Dateinamen.
- Entscheidung vom 2026-06-15: Artseiten- und Reiseseiten-Alt-Texte/Galerietexte sind fuer den aktuellen Stand
  akzeptiert und gelten als erledigt.
- Zusaetzlich geprueft: dynamische Bilder in `species-status.js`, `map-loader.js` und `lightbox-zoom.js`

Hinweis: Squarespace gibt viele Bildbloecke mit mehreren `alt`-Attributen im HTML aus. Diese doppelten Attribute wurden
als technisches Muster erkannt, sind aber nicht automatisch ein manueller Fehler. Fuer die eigentliche To-do-Liste
zaehlen vor allem leere Alt-Texte, Dateinamen als Alt-Text, zu lange/captionartige Alt-Texte und fehlerhafte
Logo-Alt-Texte.

## Kurzbefund

| Befund | Anzahl | Prioritaet | Einschaetzung |
|---|---:|---|---|
| Alt-Text ist ein Dateiname | 1.448 Instanzen | Erledigt/akzeptiert | 1.330 Instanzen liegen auf allen 44 Artseiten. Felix akzeptiert diesen technischen Stand, weil die sichtbaren Galerietexte entfernt sind. |
| Leerer Alt-Text | 119 Instanzen | Erledigt/akzeptiert | Leere Alt-Texte sind fuer dekorative Bilder in Ordnung; kein aktueller Pflegeblock. |
| Sehr langer/captionartiger Alt-Text | 634 Instanzen | Erledigt/beabsichtigt | Besonders Reiseunterseiten. Laut Felix sind die Reiseseiten-Texte bewusst so gesetzt und bleiben bestehen. |
| Fehlerhafte Logo-/KI-Alt-Texte | 0 eindeutige Treffer fuer `FUKON`/`FAXIN` | Niedrig | Die alten OCR-Fehler wurden live nicht mehr gefunden. Logo-Varianten sind teils `FN Wildlife & Travel`, teils leer. |
| Doppelte Alt-Attribute im Squarespace-HTML | 3.278 Instanzen | Niedrig/technisch | Wahrscheinlich Squarespace-Ausgabe. Nur pruefen, wenn Browser/SEO-Tool dadurch konkrete Probleme meldet. |

## Wichtigste konkrete Befunde

### Globaler Logo-Block

Das Bild `FN Wildlife & Travel Logo glow.jpg` kommt auf vielen geprueften Seiten vor. Es hat je nach Block/Variante
leere Alt-Texte oder `FN Wildlife & Travel`. Die frueher gefundenen falschen Logo-Woerter wie `FUKON` oder `FAXIN`
wurden am 2026-06-15 live nicht mehr gefunden.

Empfehlung:

- Wenn das Logo klickbar ist: Alt-Text `FN Wildlife & Travel` setzen.
- Wenn das Logo nur dekorativ ist: Alt-Text leer lassen.
- Logo ist aktuell kein Hauptblocker mehr; nur bei der naechsten globalen Design-/Header-Pruefung mitpruefen.

### Dateinamen als Alt-Text

Viele Bilder nutzen den Dateinamen als Alt-Text. Das ist fuer Barrierefreiheit und Bildersuche schwach, weil Dateinamen
wie `_7R56797-Verbessert-RR-Bearbeitet.jpg` oder `20190413_112617.JPG` kein Motiv beschreiben.

Nachpruefung vom 2026-06-15:

- Alle 44 aktiven Artseiten haben weiterhin Dateinamen als Alt-Text in den Galerie-Bildern.
- Insgesamt wurden auf Artseiten 1.330 Dateinamen-Alt-Texte gefunden.
- Das Entfernen der Galerie-Beschreibungen in Squarespace hat die sichtbaren Beschreibungen reduziert, aber nicht die
  eigentlichen Bild-Alt-Attribute geleert.
- Felix hat die Artseiten am 2026-06-15 manuell visuell geprueft und sieht keinen Galerietext mehr. Fuer die
  sichtbare Seitendarstellung gilt das damit als erledigt.
- Felix akzeptiert die verbleibenden technischen Dateinamen-`alt`-Attribute. Sie werden fuer den aktuellen Stand nicht
  weiter bearbeitet.

Priorisierte Seiten mit besonders vielen Dateinamen-Alt-Texten:

| Seite | Typ | Dateiname-Alt-Texte | Hinweis |
|---|---|---:|---|
| `/wildlife/heimische-tierwelt/lusciniasvecica` | Artseite | 88 | Blaukehlchen-Artseite priorisieren, falls Artseiten-Galerien bereinigt werden sollen. |
| `/reisen/2025-island/sonstige` | Reise Detail | 80 | Groesster Reise-Dateinamenblock. |
| `/wildlife/heimische-tierwelt/alcedoatthis` | Artseite | 78 | Eisvogel-Artseite priorisieren, falls Artseiten-Galerien bereinigt werden sollen. |
| `/wildlife/heimische-tierwelt/cyanistescaeruleus` | Artseite | 74 | Blaumeise-Artseite priorisieren, falls Artseiten-Galerien bereinigt werden sollen. |
| `/wildlife/heimische-tierwelt/panurusbiarmicus` | Artseite | 56 | Bartmeise-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/capreoluscapreolus` | Artseite | 52 | Reh-Artseite priorisieren. |
| `/wildlife/island/fraterculaarctica` | Artseite | 48 | Papageientaucher-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/phalacrocoraxcarbo` | Artseite | 44 | Kormoran-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/ardeacinerea` | Artseite | 42 | Graureiher-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/anseranser` | Artseite | 40 | Graugans-Artseite priorisieren. |
| `/wildlife/costarica/alouattapalliata` | Artseite | 40 | Mantelbruellaffe-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/milvusmilvus` | Artseite | 40 | Rotmilan-Artseite priorisieren. |
| `/reisen/2025-nordthailandlaos/sonstige` | Reise Detail | 38 | Zweiter Reise-Dateinamenblock. |

Einordnung:

- Kein aktiver Pflegeblock fuer Artseiten-Alt-Texte.
- Falls das Thema spaeter neu geoeffnet wird, waere ein moegliches Artseiten-Muster:
  `[Artname] ([wissenschaftlicher Name]) [kurze Szene]`, z. B.
  `Eisvogel (Alcedo atthis) auf einem Ast am Gewaesser`.
- Falls Reiseseiten spaeter neu bewertet werden, waere ein moegliches Muster:
  `[Motiv/Ort] in [Reise/Jahr]`, z. B.
  `Schwarzer Strand an der Suedkueste Islands 2025`.

### Zu lange oder captionartige Alt-Texte

Einige Alt-Texte enthalten ganze Erklaersaetze oder Absatzinhalte. Das ist als Bildunterschrift oder Fliesstext besser
geeignet als als Alt-Text.

Priorisierte Seiten:

| Seite | Typ | Lange Alt-Texte | Hinweis |
|---|---|---:|---|
| `/reisen/2024-costarica/tortuguero` | Reise Detail | 68 | Viele Beschreibungen wirken wie Infotext. |
| `/reisen/2024-costarica/corcovado` | Reise Detail | 66 | Viele Beschreibungen wirken wie Infotext. |
| `/reisen/2024-costarica/vulkanarenal` | Reise Detail | 56 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/bocatapada` | Reise Detail | 54 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/tirimbina` | Reise Detail | 42 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2025-nordthailandlaos/chiangmai` | Reise Detail | 32 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/rincondelavieja` | Reise Detail | 32 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/puntarenas` | Reise Detail | 30 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/cordillera-de-talamanca` | Reise Detail | 26 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2025-nordthailandlaos/chiangrai` | Reise Detail | 26 | Kuerzere Motivbeschreibung verwenden. |

Einordnung:

- Laut Felix sind die Reiseseiten-Texte beabsichtigt und sollen beibehalten werden.
- Diese Treffer sind deshalb fuer den aktuellen Stand erledigt.
- Falls spaeter doch optimiert werden soll: Alt-Text auf ca. 5 bis 15 Woerter kuerzen und lange Hintergrundinformationen
  als Bildunterschrift, Absatz oder Galerietext belassen.

## Dynamische Bilder aus den JavaScript-Modulen

| Datei | Befund | Empfehlung |
|---|---|---|
| `map-loader.js` | Kartenbild hat `alt="Verbreitungskarte – ${germanName}"`. | Passt grundsaetzlich. Spaeter optional wissenschaftlichen Namen ergaenzen. |
| `map-loader.js` | Das Fullscreen-Kartenbild übernimmt seit `v=1.0.8` den Alternativtext der Ausgangskarte. | Erledigt. |
| `species-status.js` | Status-/Trend-Icons nennen seit `v=1.0.9` den sichtbaren Status beziehungsweise Trend dynamisch. | Erledigt. |
| `lightbox-zoom.js` | Das Zoom-Bild übernimmt seit `v=1.0.7` den Original-Alternativtext; nur ohne vorhandenen Text greift ein verständlicher Fallback. | Erledigt. |

Die drei dynamischen Punkte wurden im Abschlussaudit vor Phase 8 umgesetzt und durch
`scripts/squarespace-accessibility.test.mjs` gegen Regressionen abgesichert. Die dokumentierten Footer-Versionen
stehen in `docs/squarespace-footer.html`.

## Priorisierte Umsetzung

1. Artseiten-Galerien und Artseiten-Alt-Texte: fuer den aktuellen Stand erledigt/akzeptiert.
2. Reiseseiten-Galerietexte, Reise-Dateinamen-Alt-Texte und lange Reise-Alt-Texte: bewusst beibehalten und fuer den
   aktuellen Stand erledigt.
3. Globales Logo bei der naechsten Header-/Designrunde nur noch optional vereinheitlichen; die alten OCR-Fehler sind
   live nicht mehr sichtbar.
4. Neue Regel fuer kuenftige Bilder: beim Upload oder Einbau direkt entscheiden, ob das Bild dekorativ ist oder einen
   kurzen, konkreten Alt-Text braucht.
5. Dynamische Icon-, Lightbox- und Fullscreen-Alt-Texte: am 2026-07-18 erledigt.

## Umsetzungshinweise fuer Squarespace

- In Bildbloecken und Galerien den Alternativtext direkt am Bild pflegen.
- Sichtbare Galerie-Beschreibung, Bildtitel, Caption und `alt`-Attribut sind in Squarespace nicht zwingend dasselbe.
  Das Entfernen einer sichtbaren Beschreibung loescht nicht automatisch den HTML-Alt-Text.
- Artseiten und Reiseseiten nicht weiter bearbeiten, solange Felix den aktuellen sichtbaren und technischen Stand
  akzeptiert.
- Bildtitel nur setzen, wenn Squarespace ihn sichtbar oder sinnvoll als Medienmetadatum verwendet; wichtiger ist der
  Alt-Text.
- Keine reinen Dateinamen, keine langen SEO-Texte, kein Keyword-Stuffing.
- Bei dekorativen Logos/Trennelementen darf der Alt-Text leer sein, wenn das Bild nicht als inhaltlicher Link dient.
- Nach einer groesseren Runde live erneut pruefen und diese Datei aktualisieren.
