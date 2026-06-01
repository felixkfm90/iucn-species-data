# Image Alt Text Audit

Stand: 2026-06-01

Ziel: Bild-Alternativtexte und optionale Bildtitel der oeffentlichen Squarespace-Seiten pruefen. Der Audit aendert keine
Live-Seite automatisch; die Umsetzung erfolgt in Squarespace-Bildbloecken, Galerien oder spaeter gezielt in den
JavaScript-Modulen.

## Pruefumfang

- Quelle: `https://www.fnwildlifetravel.de/sitemap.xml`
- Gepruefte Sitemap-URLs: 117
- Gefundene `<img>`-Instanzen im Live-HTML: 3.458
- Eindeutige Bild-URLs: 1.452
- Zusaetzlich geprueft: dynamische Bilder in `species-status.js`, `map-loader.js` und `lightbox-zoom.js`

Hinweis: Squarespace gibt viele Bildbloecke mit mehreren `alt`-Attributen im HTML aus. Diese doppelten Attribute wurden
als technisches Muster erkannt, sind aber nicht automatisch ein manueller Fehler. Fuer die eigentliche To-do-Liste
zaehlen vor allem leere Alt-Texte, Dateinamen als Alt-Text, zu lange/captionartige Alt-Texte und fehlerhafte
Logo-Alt-Texte.

## Kurzbefund

| Befund | Anzahl | Prioritaet | Einschaetzung |
|---|---:|---|---|
| Alt-Text ist ein Dateiname | 1.327 Instanzen | Hoch | Groesster Pflegeblock. Betrifft viele Galerie- und Artseitenbilder. |
| Leerer Alt-Text | 118 Instanzen | Hoch/Mittel | Sehr oft beim Logo oder Bildblock; wenn Bild verlinkt oder inhaltlich relevant ist, setzen. |
| Sehr langer/captionartiger Alt-Text | 276 Instanzen | Mittel | Besonders Reiseunterseiten; Alt-Text kuerzen, lange Erklaerung als Bildunterschrift/Text belassen. |
| Logo-Alt-Texte uneinheitlich oder KI-fehlerhaft | Globaler Logo-Block, auf vielen Seiten | Hoch | Beispiele wie `FUKON`, `FAXIN`, `FOKUS` oder leere Werte. |
| Doppelte Alt-Attribute im Squarespace-HTML | 3.224 Instanzen | Niedrig/technisch | Wahrscheinlich Squarespace-Ausgabe. Nur pruefen, wenn Browser/SEO-Tool dadurch konkrete Probleme meldet. |

## Wichtigste konkrete Befunde

### Globaler Logo-Block

Das Bild `FN Wildlife & Travel Logo glow.jpg` kommt auf allen geprueften Seiten vor. Es hat je nach Block/Variante
leere oder fehlerhafte Alt-Texte, z. B. falsch erkannte Logo-Woerter wie `FUKON`, `FAXIN` oder `FOKUS`.

Empfehlung:

- Wenn das Logo klickbar ist: Alt-Text `FN Wildlife & Travel` setzen.
- Wenn das Logo nur dekorativ ist: Alt-Text leer lassen, aber keine KI-Beschreibung wie `FUKON` oder `FAXIN`.
- Den globalen/header-/footer-nahen Logo-Block zuerst korrigieren, weil eine Aenderung viele Seiten betreffen kann.

### Dateinamen als Alt-Text

Viele Bilder nutzen den Dateinamen als Alt-Text. Das ist fuer Barrierefreiheit und Bildersuche schwach, weil Dateinamen
wie `_7R56797-Verbessert-RR-Bearbeitet.jpg` oder `20190413_112617.JPG` kein Motiv beschreiben.

Priorisierte Seiten mit besonders vielen Dateinamen-Alt-Texten:

| Seite | Typ | Dateiname-Alt-Texte | Hinweis |
|---|---|---:|---|
| `/reisen/2025-island/sonstige` | Reise Detail | 81 | Groesster Einzelblock im Audit. |
| `/wildlife/heimische-tierwelt/alcedoatthis` | Artseite | 79 | Eisvogel-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/capreoluscapreolus` | Artseite | 53 | Reh-Artseite priorisieren. |
| `/wildlife/island/fraterculaarctica` | Artseite | 49 | Papageientaucher-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/phalacrocoraxcarbo` | Artseite | 45 | Kormoran-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/ardeacinerea` | Artseite | 43 | Aktive Graureiher-Artseite nachziehen. |
| `/wildlife/costarica/alouattapalliata` | Artseite | 41 | Mantelbruellaffe-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/anseranser` | Artseite | 41 | Graugans-Artseite priorisieren. |
| `/wildlife/heimische-tierwelt/milvusmilvus` | Artseite | 41 | Rotmilan-Artseite priorisieren. |
| `/reisen/2025-nordthailandlaos/sonstige` | Reise Detail | 39 | Reisegalerie nachziehen. |

Empfehlung:

- Nicht alle Bilder gleichzeitig bearbeiten. Zuerst sichtbare Hero-/Teaser-/Galerie-Einstiegsbilder, dann Galerien.
- Artseiten-Muster: `[Artname] ([wissenschaftlicher Name]) [kurze Szene]`, z. B.
  `Eisvogel (Alcedo atthis) auf einem Ast am Gewaesser`.
- Reiseseiten-Muster: `[Motiv/Ort] in [Reise/Jahr]`, z. B.
  `Schwarzer Strand an der Suedkueste Islands 2025`.

### Zu lange oder captionartige Alt-Texte

Einige Alt-Texte enthalten ganze Erklaersaetze oder Absatzinhalte. Das ist als Bildunterschrift oder Fliesstext besser
geeignet als als Alt-Text.

Priorisierte Seiten:

| Seite | Typ | Lange Alt-Texte | Hinweis |
|---|---|---:|---|
| `/reisen/2024-costarica/corcovado` | Reise Detail | 30 | Viele Beschreibungen wirken wie Infotext. |
| `/reisen/2024-costarica/tortuguero` | Reise Detail | 24 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/vulkanarenal` | Reise Detail | 24 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2025-nordthailandlaos/chiangmai` | Reise Detail | 24 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2024-costarica/puntarenas` | Reise Detail | 22 | Kuerzere Motivbeschreibung verwenden. |
| `/reisen/2025-nordthailandlaos/chiangrai` | Reise Detail | 20 | Kuerzere Motivbeschreibung verwenden. |

Empfehlung:

- Alt-Text auf ca. 5 bis 15 Woerter kuerzen.
- Lange Hintergrundinformationen als Bildunterschrift, Absatz oder Galerietext belassen.
- Beispiel statt langem Infotext: `Regenwald im Corcovado-Nationalpark in Costa Rica 2024`.

## Dynamische Bilder aus den JavaScript-Modulen

| Datei | Befund | Empfehlung |
|---|---|---|
| `map-loader.js` | Kartenbild hat `alt="Verbreitungskarte – ${germanName}"`. | Passt grundsaetzlich. Spaeter optional wissenschaftlichen Namen ergaenzen. |
| `map-loader.js` | Fullscreen-Kartenbild per `new Image()` hat aktuell keinen expliziten Alt-Text. | Niedrige Prioritaet; bei naechster Frontend-Runde setzen. |
| `species-status.js` | Status-/Trend-Icons haben generische Alt-Texte `IUCN Status Icon` und `Populationstrend Icon`. | Mittlere Prioritaet; spaeter dynamisch mit Status/Trend befuellen, z. B. `IUCN-Status: Least Concern`. |
| `lightbox-zoom.js` | Zoom-Bild hat generisches `alt="Vollbild / Zoom"`. | Mittlere Prioritaet; spaeter Original-Alt-Text des geoeffneten Bildes uebernehmen, falls verfuegbar. |

Diese Punkte brauchen einen Code-Patch und danach eine Footer-`?v=`-Pruefung. Sie sind nicht Teil der reinen
Squarespace-Bildpflege.

## Priorisierte Umsetzung

1. Globales Logo korrigieren: Alt-Text vereinheitlichen oder dekorativ leer lassen, keine KI-Fehltexte.
2. Seiten mit vielen Dateinamen-Alt-Texten abarbeiten, zuerst `/reisen/2025-island/sonstige` und die oben genannten
   Artseiten.
3. Lange Reise-Alt-Texte kuerzen, besonders Costa Rica 2024 und Nordthailand/Laos 2025.
4. Neue Regel fuer kuenftige Bilder: beim Upload oder Einbau direkt einen kurzen, konkreten Alt-Text setzen.
5. Spaeter in einer kleinen Frontend-Runde die dynamischen Icon-/Lightbox-/Fullscreen-Alt-Texte verbessern.

## Umsetzungshinweise fuer Squarespace

- In Bildbloecken und Galerien den Alternativtext direkt am Bild pflegen.
- Bildtitel nur setzen, wenn Squarespace ihn sichtbar oder sinnvoll als Medienmetadatum verwendet; wichtiger ist der
  Alt-Text.
- Keine reinen Dateinamen, keine langen SEO-Texte, kein Keyword-Stuffing.
- Bei dekorativen Logos/Trennelementen darf der Alt-Text leer sein, wenn das Bild nicht als inhaltlicher Link dient.
- Nach einer groesseren Runde live erneut pruefen und diese Datei aktualisieren.
