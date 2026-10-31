# Add Species Workflow

Stand: 2026-10-31

Dieses Dokument beschreibt Phase 5.6: weitere Arten ergaenzen.

## Vorbereitung des künftigen Website-Artseitenworkflows

Lesender Abgleich vom 28. Oktober auf Programmstand `97a1b68a2663e62e87c4fa473a917fe83a3f7ec5`:
Felix lässt die entscheidungsfreien Vorarbeiten erledigen. Der heutige Artassistent bleibt der unten
beschriebene Betriebsablauf; der vollständige Websiteworkflow wird erst gemeinsam abgegrenzt.
Der bestätigte [Auftrag aus Auditabschnitt 10.47](audit-auftrag-phase-10-5.md#1047-auditfortsetzung-und-späterer-artseitenworkflow--20-oktober)
umfasst Artanlage, Inhaltsentwurf, Bildauswahl, Alternativtexte, redaktionelle Prüfung, Vorschau und
kontrollierte Einpflege. Vorhandene Strukturen und Felix' Korrekturen erhalten; Fachangaben belegen,
Unbekanntes offenlassen und Bilder oder fertige Texte nicht allein aus Dateinamen ableiten.

Felix legt anschließend Mehrbenutzerunterstützung als Voraussetzung für dieses Vorhaben fest:
Sein Bruder soll ebenfalls Texte eingeben und Artseiten anlegen können. Die initiale
[Alttextfassung](image-alt-audit.md#erste-lokale-fassung-bedienung-und-betriebsgrenzen) beginnt vorher.
Am 29. Oktober beauftragt er zusätzlich die selbstständige Übertragung freigegebener Bildtexte mit eigener
Browseranmeldung. Dieser begrenzte Textübernahmeweg wird im Alttextvertrag geführt; die vollständige
Artseitenerstellung bleibt ein späteres gemeinsam abzugrenzendes Vorhaben nach dem Mehrbenutzerausbau.

### Bestätigter Zielablauf vom 31. Oktober 2026

Felix konkretisiert den vollständigen Artseitenworkflow im Rahmen der gemeinsamen Abstimmung aller
großen Folgevorhaben. Die folgenden Vorgaben und der zusammenhängende Gesamtumfang sind am
31. Oktober ausdrücklich zur Umsetzung bestätigt. Konkrete Vorlage und technische Umsetzung werden daraus abgeleitet.

| Schritt | Bestätigtes Verhalten |
| --- | --- |
| Bilder bereitstellen | Felix oder sein Bruder liefern die Bilder. Die Reihenfolge muss durch sie festlegbar und in der zusammengesetzten Seite nachvollziehbar sein. |
| Texte bereitstellen | Sie liefern die Fachtexte unter den entsprechenden Überschriften, beispielsweise Aussehen und Lebensraum. Die bereits vorhandenen unterschiedlichen Artgliederungen werden bei der späteren Vorlagenwahl berücksichtigt. |
| Alternativtexte | Für die bereitgestellten Bilder werden bildbezogene Alternativtexte vorgeschlagen. Diese bleiben vor der Freigabe manuell änderbar und an das konkrete Bild gebunden. Die bisherigen Regeln aus dem Alttextvertrag gelten weiter. |
| Fehlender Fachabschnitt | Eine fehlende Eingabe löst einen Hinweis aus, ob der Abschnitt bewusst leer bleiben soll. Eine bestätigte Leerstelle bleibt erhalten. Nur wenn keine Eingabe vorliegt und der Abschnitt nicht leer bleiben soll, werden ergänzende Textvorschläge angeboten; fachliche Angaben benötigen nachvollziehbare Quellen. |
| Seite zusammensetzen | Bilder, gewählte Reihenfolge, Fachtexte und Bildtexte werden zu einer vollständigen prüfbaren Artseite zusammengesetzt und vor der Veröffentlichung bereitgestellt. |
| Vorprüfung | Vor Felix' beziehungsweise seines Bruders abschließender Durchsicht soll Codex die Seite bereits inhaltlich und in der Darstellung prüfen; technische Prüfungen ergänzen diesen Schritt. Unklare Fachangaben und offene Ergebnisse bleiben sichtbar. |
| Menschliche Abnahme und Veröffentlichung | Felix beziehungsweise sein Bruder sehen die vorbereitete Seite abschließend durch und geben sie bei passendem Ergebnis ausdrücklich öffentlich frei. Ziel ist, nach dieser Durchsicht nur noch die vorbereitete Seite veröffentlichen zu müssen. |

Die menschliche Endabnahme bleibt auch nach einer Vorprüfung erhalten. Vorschläge und inhaltliche
Vorprüfungen sollen ohne diesen Chat direkt im Explorer laufen; kostenpflichtige Dienste schließt
Felix aus. Eine dafür geeignete lokale Lösung ist zunächst auf Qualität, Geschwindigkeit und
Hardwarebedarf zu prüfen. Eine mögliche Grundlage bieten lokale Bild-/Textmodelle; die offizielle
[Ollama-Dokumentation](https://docs.ollama.com/faq) beschreibt lokalen Betrieb, die
[Bildverarbeitung](https://docs.ollama.com/capabilities/vision) bildbezogene Beschreibungen. Dies ist eine
zu untersuchende Möglichkeit, keine ausgewählte oder installierte Abhängigkeit und kein Qualitätsnachweis.
Die lesende Rechnerabfrage vom 31. Oktober meldet hier 64 GiB Arbeitsspeicher und einen Intel Core
i5-14600K. Das vorhandene NVIDIA-Werkzeug meldet zusätzlich eine GeForce RTX 5070 mit 12.227 MiB
Grafikspeicher und Treiber 610.88. Das ist eine Hardwareaufnahme, kein ausgeführter Modell-/Qualitäts-
oder Geschwindigkeitsnachweis. NAS-Eignung und Ausstattung des zweiten PCs sind weiter offen.
Technische Vollständigkeits-/Zuordnungsprüfungen sind von der modellgestützten inhaltlichen Vorprüfung
zu unterscheiden; bei fehlendem oder ungeeignetem Modell bleibt deren Ergebnis offen.
Diese Vorgaben beschreiben den künftigen Ablauf, keine Freigabe heutiger Einzeltexte oder CMS-Änderungen.
Die Vollseitenfunktion ist weiterhin nach dem benötigten Mehrbenutzerausbau vorgesehen.

### Technischer Umsetzungsstand vom 31. Oktober

Die anfängliche Hardwareaufnahme ist inzwischen um eine begrenzte tatsächliche lokale Modellprobe
ergänzt: Qwen3-VL-4B-Instruct mit Q4_K_M-Gewichten und Bildprojektor unter llama.cpp b11960.
Modell-/Runtimequellen sind gebunden und geprüft; es wurde kein kostenpflichtiger Dienst verwendet
und kein Foto an einen KI-Dienst hochgeladen. Vier reale Fotos und drei synthetische quellengebundene
Textfälle wurden mit dem regulären Einzelaufruf inhaltlich bewertet. Die ersten interaktiven
Textaufrufe hatten die Frage nicht ausgeführt und zählen ausdrücklich nicht als erfolgreiche Textfälle.
Ein eigener CPU-Lauf mit vollständig ausgeschalteter GPU-Nutzung ist getrennt belegt.

Die Probe liefert brauchbare Vorschläge, zeigt aber auch Grenzen: frühe Bildläufe enthielten eine
falsche Farbangabe beziehungsweise eine unzutreffende Tunnelbeschreibung. Die vereinbarte Regel ohne
Schlusspunkt wurde trotz Aufforderung nicht zuverlässig eingehalten. Der Produktweg muss daher
bearbeitbare Vorschläge, deterministische seitentypabhängige Formatierung und menschliche Freigabe
verbinden. Eine kleine Probe ist keine allgemeine fachliche Richtigkeits- oder Geschwindigkeitsgarantie.
Der laufende Einbau verwendet einen eigenen lokal begrenzten Bild-/Textdienst; dies ist noch keine
abgenommene Vollseitenfunktion. Quellen und semantische Bewertung stehen privat unter
`data/website/checks/local-ai-feasibility-20261031*`.

Der [Inhaltsexport](../species-explorer/species-content/README.md) erfasst den vollständigen datierten
öffentlichen Artseitenbestand mit Fachüberschriften, Absätzen, tatsächlicher Galerieabfolge und
vorhandenen Quellen-/Lizenzhinweisen. Hauptmedien sind gegen reale lokale Bytes gebunden;
nicht heruntergeladenen Galeriefotos werden keine Dateigrößen oder Prüfsummen zugeschrieben.
Der Export erzeugt einen prüfbaren Importplan und veröffentlicht nichts. Unfreigegebene lokale
Bildtextentwürfe gehören nicht zum öffentlichen Anfangsbestand. Diese Grundlage ist unabhängig
gegen alle erfassten Quellseiten geprüft; sie ersetzt keine Freigabe künftiger neuer Seiten.

Primärquellen: [Modell](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF),
[gebundene lokale Laufzeit](https://github.com/ggml-org/llama.cpp/releases/tag/b11960).

### Vorhandene Ausgangsbasis

| Baustein | Heute vorhanden | Für den Folgeworkflow noch fehlend |
| --- | --- | --- |
| Artanlage | `species-explorer/species-create.mjs`, Namens-/Slug-/Assetkollisionsprüfungen und wiederaufnehmbare Medienaufträge | Erstellt keine Squarespace-Seite; heutiger CMS-Nachlauf bleibt manuell. |
| Öffentliche Module | Steckbrief, Taxonomie, Status, Portrait, Sound, Karte und angenommenes responsives Artseiten-Grundlayout | Redaktionelle Textabschnitte und Galerieauswahl sind damit nicht erzeugt oder geprüft. Layoutvertrag: [Websitevertrag](monthly-site-audit.md#öffentliche-bedien--und-css-verträge). |
| Seitenverknüpfung | `species-explorer/website-species-pages.mjs` und `species-explorer/public/app-website-pages.js` erkennen öffentliche Seiten anhand genauer Slugs, auch in mehreren Bereichen | Kein Zugriff auf unveröffentlichte Entwürfe, kein CMS-Schreibweg. |
| Lokale Vorschau | `scripts/local-squarespace-preview.mjs` und `tools/squarespace-preview/index.html` zeigen vorhandene Module in drei Ansichten | Keine vollständige Artseiten-/Galerievorschau; die enge Route-Positivliste enthält derzeit auch keine Kartenroute. |
| Alternativtexte | [Bestätigte Ziele und Prüfgrenzen](image-alt-audit.md#entscheidungen-und-nachprüfung-vom-29-oktober-2026), seitenweiser Explorer-Ablauf und begrenzte Browser-Schreibanbindung; tatsächliche Delphi-Übernahme am 30. Oktober bestätigt | Neue Artseiten dürfen vorher online stehen, fehlende Texte bleiben offen. Der praktisch bestätigte Reisegalerie-Schreibweg erzeugt keine Artseite und keinen neuen Galerieaufbau. |

Vorhandene Tests für Artanlage, Websiteverknüpfung, Modulvorschau, Barrierefreiheit und Artseitenkopf
sind eingebunden. Sie ersetzen keine Abnahme eines erst später entwickelten vollständigen Seitenworkflows.
Für diese Vorbereitung wurde keine Art angelegt und keine Website- oder CMS-Seite geändert.

### Gemeinsam zu klären

| Kennung | Fachliche Entscheidung |
| --- | --- |
| ART-1 | Bereitgestellte gegliederte Fachtexte und bewusste Leerstellen sind bestätigt. Konkretes vorhandenes Muster, Gliederungsvarianten und zulässige Quellen für ausdrücklich gewünschte Ergänzungen bleiben festzulegen. |
| ART-2 | Bereitgestellte Bilder, selbst festlegbare Reihenfolge und manuell änderbare Alternativtextvorschläge sind bestätigt. Zulieferung, Hauptfoto/Ausschnitt und konkrete Auswahlbedienung werden daraus abgeleitet beziehungsweise am Muster geprüft. |
| ART-3 | Vollständige Vorbereitung neuer Artseiten und Vorprüfung vor menschlicher Endabnahme sind bestätigt. Vorschläge und Vorprüfung sollen ohne Chat direkt im Explorer und ohne kostenpflichtige Dienste funktionieren; lokale Machbarkeit noch prüfen. Bestehende Arten/Seiten sind auch offline am PC bearbeitbar; eine pauschale Umstellung sämtlicher vorhandener CMS-Seiten ist damit nicht beauftragt. |
| ART-4 | Welche Pilotart nutzen wir für den ersten vollständigen Arbeitsfall, zusammen mit der Alttextabstimmung? |

### Vorbereitete Abnahme

Bereits gefordert sind ein vollständiger freigegebener Seitenentwurf mit belegten Texten, Bildern und
Alternativtexten, kontrollierte Einpflege, öffentliche Darstellung und automatische Explorer-Verknüpfung.
Wiederholung darf keine Dubletten und keine unbemerkten Überschreibungen menschlicher Änderungen erzeugen.
Ergänzende Prüfvorschläge: Ein zwischen Entwurf und Übernahme geändertes Ziel stoppt die Übernahme;
unvollständige oder abgebrochene Übertragung bleibt erkennbar und ist ohne Doppelanlage fortsetzbar.
Konkretes Muster, Pilot und Abnahmeumfang werden erst gemeinsam bestätigt.

Aus dem Zielablauf vom 31. Oktober folgen zusätzlich diese Pflichtfälle für die spätere Abnahme:
Eine noch ungeklärte Leerstelle erzeugt einen Hinweis; eine bewusst bestätigte Leerstelle bleibt auch
nach erneuter Vorprüfung leer. Ein gewünschter, aber noch fehlender Abschnitt bietet einen belegten
Vorschlag an, ohne vorhandene Eingaben still zu ersetzen. Gewählte Bildreihenfolge und manuell
geänderte Alternativtexte bleiben in Vorschau und übernommener Seite erhalten. Vorprüfung und offene
Befunde sind vor der menschlichen Veröffentlichungsentscheidung erkennbar. Diese Fälle sind
vorbereitet, noch keine ausgeführte Vollseitenabnahme.

## Seitengruppen und Bausteine: Vorbereitung vom 30. Oktober 2026

Felix beauftragt ausdrücklich die Einteilung der bestehenden Seiten im Hintergrund, damit anschließend
Regeln je Seitengruppe vereinbart und später vollständige Artseiten aus bereitgestellten Bildern und
Texten aufgebaut werden können. Das ist eine Vorbereitung zur gemeinsamen Abstimmung. Es setzt noch
keine neue Vorlage, Pflichtgliederung, Benutzerberechtigung oder CMS-Anlagefunktion fest. Diese Vorbereitung
erfolgte während der von Felix gewünschten Computer-Use-Pause und las ausschließlich öffentliche Seiten
und lokale Quellen. Die spätere freigegebene Mykene-Übernahme bleibt davon im Alttextvertrag getrennt.

### Vollständigkeit und Beleg

Die frische Sitemapprüfung und öffentliche HTML-Aufnahme umfassen am 30. Oktober um 19:29 Uhr MEZ
alle **137 Sitemapadressen** sowie die zusätzliche Startadresse und zwei bekannte Weiterleitungen:
**140 Adressen, davon 138 Inhaltsadressen und zwei HTTP-302-Verweise**. Alle Antworten wurden erfolgreich
gelesen, keine Adresse bleibt ohne vorgeschlagene Gruppe. Der Alttextbestand ist vor/nach der Aufnahme
bytegleich. Keine CMS-, Bildtext- oder Websiteänderung und keine Browser-/Desktopbedienung.

Der private Einzelbeleg `data/website/checks/page-clusters-20261030.json` enthält jede Adresse mit
vorgeschlagener Gruppe, öffentlichem Antwortstatus, Abrufzeit, HTML-Prüfsumme, kanonischer Adresse,
deklarierter Abschnittsfolge, Blockarten, Überschriften, Modulplatzhaltern und Auffälligkeiten. Die davon
abgeleitete `page-clusters-20261030.html` im selben Ordner ist nach Gruppe und Suchbegriff filterbar;
sie öffnet sich nicht automatisch. Diese Dateien sind datierte Arbeitsbelege, keine zweite produktive
Seitenverwaltung. Aufbewahrung gemäß [Tempvertrag](temp-retention.md).

Erfasst ist die öffentliche statische Struktur. Skripte wurden nicht ausgeführt, Bilder nicht heruntergeladen
und Module nicht erneut visuell abgenommen. Interne Galerie-/Listencontainer werden nicht als weitere
Seitenabschnitte gezählt. Unveröffentlichte CMS-Entwürfe und unbekannte, nicht gelistete/verknüpfte Seiten
sind nicht durch diesen Vollständigkeitsbeleg abgedeckt. Neue Adressen müssen später erneut eingeordnet
werden; diese Momentaufnahme übernimmt das nicht als laufenden Dienst.

### Vorgeschlagene Seitengruppen

Die Zahlen bezeichnen Adressen dieser datierten Aufnahme und keine zusätzlich angelegten Inhalte.

| Gruppe | Adressen | Beleg und sinnvolle Abgrenzung |
| --- | ---: | --- |
| Artporträts | 63 | Bekannter Artslug unter `/wildlife/Region/Art`, Treffer in beiden Artendateien, sieben bekannte Modulplatzhalter und eine Galerie. Eine konkrete Art bildet den fachlichen Kontext. |
| Regionale Artenübersichten | 4 | Afrika, Costa Rica, heimische Tierwelt und Island; jeweils Einstieg, weitere Inhalte und eine deklarierte Vorschauliste. |
| Wildlife-Gesamtübersicht | 1 | `/wildlife/uebersicht`; Einstieg in die regionalen Bereiche, keine einzelne Art. |
| Einzelne Reiseübersichten | 8 | `/reisen/Jahr-Reise`; jeweils Inhaltskopf und Vorschauliste für Stationen/Themen. Kurze Bildtextvorschläge seit Felix' Anweisung vom 31. Oktober ebenfalls ohne Schlusspunkt; Alttexte und sichtbare Kachelbeschreibungen bleiben unabhängig. |
| Reise-Gesamtübersicht | 1 | `/reisen/uebersicht`; Einstieg in die einzelnen Reisen, eigene Bild-/Linkblöcke. |
| Reise-Unterseiten | 53 | `/reisen/Jahr-Reise/Station`; jeweils Inhaltskopf und eine deklarierte Galerie. Ort, Naturraum, Unterkunft oder gemischte Sammlung sind zusätzliche Themenmerkmale. |
| Startseite | 2 | `/` und `/home` antworten beide mit HTTP 200 und nennen dasselbe kanonische Startseitenziel. Zwei Adressen einer gemeinsamen Startseitendarstellung; keine automatische Umleitung oder Bereinigung beauftragt. |
| Profil und Service | 3 | Über uns, Ausrüstung und Kontakt. Gleiche Verwaltungsgruppe, aber unterschiedliche Inhalte; das Kontaktformular ist ein eigener Baustein. |
| Unterstützung | 1 | Spenden; eigene Informations-/Handlungsseite, keine Reise- oder Artvorlage. |
| Rechtliche Seiten | 2 | Impressum und Datenschutz. Keine künstliche Foto- oder Galeriepflicht und keine allgemeine redaktionelle Umschreibung. |
| Weiterleitungen | 2 | `/reisen-1` führt nach `/reisen/uebersicht`, `/wildlife` nach `/wildlife/uebersicht`; keine zusätzlichen Inhaltsvorlagen. |

Die Zuordnung nutzt mehrere passende Signale. Eine URL oder ein Titel allein genügt später nicht für
eine verbindliche Artidentität: Auch eine künftige allgemeine Galerie könnte unter einem gleich tiefen
Wildlife-Pfad liegen, und Übersichten nennen im Titel ebenfalls Artenporträts. Widersprüchliche oder neue
Strukturen sollen zunächst ausdrücklich zur Einordnung offenbleiben. Diese Reaktion ist ein Vorschlag
für die spätere Umsetzung, noch keine neue produktive Klassifizierung.

Reise-Unterseiten erhalten als Vorbereitung zusätzliche Themenmerkmale: Kultur/Stadt/historische Stätte,
Landschaft/Naturraum, Tierbeobachtung mit mehreren Arten, Unterkunft/Aufenthalt, Route/Unterwegssein
oder Sammlung „Weitere Eindrücke“. Diese Themen sind kombinierbar und benötigen keine eigene Vorlage
für jede Kombination. Boca Tapada verbindet beispielsweise Landschaft, Unterkunft und mehrere Tierarten;
der Seitenname bestimmt dort nicht die Art jedes einzelnen Fotos. Sieben `sonstige`-Seiten sind Sammlungen.

### Wiederkehrende Artseitengliederung

Alle 63 Artseiten haben im öffentlichen HTML dieselben sieben bekannten Platzhalter für Porträt,
Steckbrief, Taxonomie, Status, Sound und die zweiteilige Kartenintegration sowie eine Galerie.
Ein Sound-Platzhalter bedeutet nicht, dass tatsächlich eine Aufnahme oder ein Spektrogramm vorhanden ist.
Die bereits akzeptierten bewussten Medienlücken bleiben erhalten.

Die Textgliederung zeigt zwei vorhandene Varianten: **48 Seiten mit kürzerem Aufbau**, **15 mit den
zusätzlichen Abschnitten Entwicklung und Besonderheiten**. In allen Seiten stehen Allgemein, Aussehen,
Verbreitung, Lebensraum, Nahrung, Beobachtungstipp und Verbreitungskarte; dazu kommen beobachtet
40-mal Brut und 23-mal Fortpflanzung. Reihenfolge und Benennung unterscheiden sich teilweise.
Das ist eine Aufnahme des Bestands, keine Entscheidung, dass diese Abschnitte künftig überall Pflicht sind.
Eine biologische Einordnung wird nicht allein aus einer Abschnittsbezeichnung abgeleitet.

Diese Gliederung liefert konkrete Kandidaten für ART-1. Als Vergleich eignen sich etwa Eisvogel mit
kürzerem Aufbau und Gepard beziehungsweise Rotaugenlaubfrosch mit erweiterten Abschnitten. Welcher
Aufbau die erste Vorlage wird und welche Ausnahmen gelten, wird mit Felix am konkreten Muster bestätigt.
Die private kompakte Übersicht `data/website/checks/editorial-review-20261030.html` stellt dafür
Eisvogel, Gepard, Boca Tapada, Mykene, Griechenlandübersicht und Heimische Tierwelt gegenüber.
Sie bündelt zugleich die bestehenden bildgebundenen Rückfragen; Abnahme und Prüfgrenzen stehen im
[Alttextvertrag](image-alt-audit.md#kompakte-bedienung-und-gesamtprüfung-vom-30-oktober-2026).

### Zwei vollständig aufgenommene Artseitenbeispiele

Die vertiefte Vorbereitung vom 30. Oktober stellt Eisvogel und Gepard mit ihren vollständigen
vorhandenen Fachtexten, Überschriften, deklarierten Galeriefolgen, öffentlichen Bildtexten und getrennt
markierten lokalen Entwürfen/Freigaben gegenüber. Artmodule, tatsächlich vorhandene Assetdateien,
Rückverweise und Hintergründe sind quellengebunden ergänzt. Private Arbeitsansicht:
`data/website/checks/species-samples-20261030.html`; vollständiger Beleg und unabhängige Prüfung als
gleichnamige JSON-Datei beziehungsweise `species-samples-20261030-validation.json`.

| Bestehendes Beispiel | Fachtextblöcke | Galeriefotos | Bekannte Modulplatzhalter | Besonderheit |
| --- | ---: | ---: | ---: | --- |
| Eisvogel | 9 | 39 | 7 | Kürzere Gliederung; Ton und Spektrogramm vorhanden. |
| Gepard | 11 | 19 | 7 | Zusätzlich Entwicklung und Besonderheiten; bewusst fehlende Stimme bleibt erhalten. |

126 Verweise, Original-HTML-Prüfsummen, vollständige statische Textabdeckung, Galeriefolge und lokaler
Bildtextbezug sind geprüft. Allgemein und Verbreitungskarte enthalten im statischen Fachblock keine
Prosa; dynamische Modulquellen sind getrennt ausgewiesen. Daraus folgt keine leere öffentliche Darstellung
und keine Modulzuordnung allein anhand benachbarter Textreihenfolge. Keine Fotos heruntergeladen,
Fachtexte umgeschrieben oder neu freigegeben; der Bildtextspeicher ist bytegleich geblieben.
Die Arbeitsansicht ist inhaltlich/strukturell geprüft, nicht erneut optisch abgenommen. Die spätere native
Eisvogel-Feldinventur ist davon getrennt im [Alttextvertrag](image-alt-audit.md#native-cms-feldinventur-und-veröffentlichungsvorbereitung-vom-30-oktober-2026) dokumentiert.
Die offenen Teile von ART-1 bis ART-4 bleiben gemeinsam zu entscheiden; bestätigte Vorgaben stehen im
[Zielablauf](#bestätigter-zielablauf-vom-31-oktober-2026). Die Beispiele legen kein Importformat und keine neue Vorlage fest.

### Seitentyp und Bausteinrolle getrennt behandeln

| Baustein | Schon vorhanden oder vereinbart | Für den späteren Regelkatalog noch abzugrenzen |
| --- | --- | --- |
| Kopf, Titel, Rückverweis und Haupt-/Hintergrundfoto | Angenommenes responsives Layout; gebundene Logo-/Hintergrundstandards | Hauptfotoauswahl, Fokus/Ausschnitt, Mehrfachverwendung und zulässige Abweichungen je Vorlage |
| Artmodule | Bestehende öffentliche Steckbrief-, Taxonomie-, Status-, Sound-, Porträt- und Kartenfunktionen | Pflicht/optional/bewusst fehlend sowie geprüfte Zuordnung zur konkreten Art |
| Redaktionelle Fachabschnitte | Die oben aufgenommenen vorhandenen Gliederungen und vorhandene Fachtexte | Verbindliche Abschnitte, Umfang, Quellen, Aktualität und Umgang mit fehlenden Angaben |
| Galeriefoto | Seiten-/Quellen-/Verwendungsbindung, Bildprüfung und menschliche Textfreigabe | Auswahl, Reihenfolge, Motivbeschreibung, sichtbare Beschriftung und Textkopplung je tatsächlichem Feldtyp |
| Vorschauliste oder Linkkachel | Auf Reise- und Regionalübersichten als eigener Abschnitt belegt | Zusammenspiel von Bildtext, sichtbarem Titel und Linkziel; keine pauschale Dekorativ- oder Captionregel |
| Formular, Ausrüstung, Unterstützung und Rechtstext | Eigene allgemeine Inhalte | Eigenständige Regeln, ohne eine Artseiten- oder Reisevorlage darüberzulegen |

Dieselbe Papageientaucherquelle kommt beispielsweise als Hintergrund, informatives Artseitenfoto und
Wildlife-Übersichtskachel vor. Eine Bildregel darf deshalb nicht allein an Datei oder Bildquelle hängen.
Der vorhandene Alttextparser speichert noch keine verlässliche CMS-Blockidentität; benachbarter Kartentitel,
Link und Foto sind nicht bereits als vollständiges Vorlagenobjekt gebunden.

Der praktisch bestätigte automatische Schreibweg unterstützt vorhandene freigegebene Beschreibungsfelder
von Reisegalerien. Er ordnet keine neuen Bilder an, erzeugt keine Galerie, Artseite oder Linkkachel und
übernimmt keine Artseitentexte. Neue Artseiten bleiben ein späteres Vorhaben nach dem Mehrbenutzerausbau.

### Vorbereitete Übergabe für spätere neue Artseiten

Aus bereitgestellten Bildern und gegliederten Texten soll gemäß dem bestätigten Zielablauf ein
prüfbarer Seitenentwurf entstehen. Als Eingabepaket sind vorzubereiten: eindeutige Art und Zielbereich,
ausgewählte Muster-/Vorlagenvariante, Fachtexte mit Quellen und offenen Angaben, Hauptfoto und
Galerieauswahl mit Reihenfolge und Motivtexten, vorhandene beziehungsweise bewusst fehlende Medien
sowie gewünschter Veröffentlichungszustand. Das legt kein Importformat oder Speichermodell fest.

Vor Umsetzung sind die noch offenen Teile von ART-1 bis ART-4 anhand dieser Einteilung zu beantworten:

- Welche Gliederung und Bausteine sind Pflicht, optional oder eine besondere Variante?
- Welche belegten Quellen dürfen für ausdrücklich gewünschte Ergänzungen fehlender Fachabschnitte verwendet werden?
- Wie werden Hauptfoto, Galerie, Reihenfolge, Bildausschnitt und mehrfach verwendete Fotos festgelegt?
- Welche Beschriftungs-/Alternativtextregeln gelten bei Artfotos und Übersichtskacheln? Die bereits
  bestätigten Reise-Unterseitenregeln gelten nicht automatisch für diese anderen Bausteine.
- Was bedeutet vollständig bei bewusst fehlendem Sound oder anderen Medien? Die erlaubte frühere
  Veröffentlichung mit offenem Alttextbedarf bleibt davon getrennt sichtbar möglich.
- Die angenommenen [Benutzerstufen](multi-device-backup-plan.md#angenommene-benutzerstufen) auf Entwurf, Änderung, Freigabe und Veröffentlichung anwenden; Felix und sein Bruder erhalten gleichen Vollzugriff.
- Welche konkreten Vorschau-, Konflikt-, Wiederanlauf- und öffentlichen Abnahmefälle gehören zum Pilot?

Die beobachteten langen Reise-Beschriftungen und die schon bestätigten Bildregeln führt ausschließlich
der [Alttextvertrag](image-alt-audit.md#seitengruppenbezogene-regelvorbereitung-vom-30-oktober-2026).
Die Regelabstimmung kann mit einem der vorhandenen Muster beginnen; diese Vorbereitung erteilt keine
Redaktions- oder Veröffentlichungsfreigabe für weitere Seiten.

## Verfügbarkeit vor dem Öffnen

`Neue Art` prüft vor dem Öffnen und Zurücksetzen des Formulars den aktuellen Serverzustand. Ein noch
offener Datenbankauftrag, laufende Datenbankarbeit, eine Sicherung oder Speicherung erhält sofort einen
kurzen Hinweis. Ein fehlgeschlagener Auftrag heißt dabei ausdrücklich „fehlgeschlagen“; er bleibt bis zur
sicheren Behandlung des gespeicherten Auftrags eine Sperre für neue Arten. Der Hinweis startet keinen
Aufbau und verwirft keine Daten. Bei nicht erreichbarer Prüfung bleibt das Formular geschlossen.
Vorschau und Speicherung prüfen die Sperre serverseitig erneut, falls zwischenzeitlich ein Update beginnt.
Bestehende Artanlage-Aufträge bleiben getrennt lesbar und abbrechbar. Automatisierte Gegenproben mit
eigenem Server und eigenen Dateien stehen im [Auditauftrag](audit-auftrag-phase-10-5.md#1022-vorrangige-fn--und-artanlage-reparaturen--11-oktober).

Eine bewusst gewählte Art bindet ihre Master-ID beziehungsweise rohe CoL-/Ergänzungsreferenz an die
Vorschau. Rohe Referenzen binden zusätzlich die tatsächlichen Anbieterkennungen; lokale CoL-Zeilennummern
dürfen nach einem Quellenwechsel keinen anderen Anbieterbeleg unter einen alten Entwurf schieben.
Vorschau und spätere Speicherung prüfen diese Auswahl erneut. Inzwischen als quellenungeklärt zurückbehaltene Klassifikationen
werden nicht zur neuen Auswahl angeboten und können auch über einen alten Auswahlstand oder
Vorschautoken nicht übernommen werden. Das gilt auch für konkret zurückgehaltene rohe CoL-/
Ergänzungsbelege, anhand Anbieter plus Anbieter-Datensatz-ID. Direkte Verwaltungsdetails bleiben lesbar. Freie manuelle
Artangaben bleiben möglich; aus einem gleichen Namen wird keine Masteridentität hergeleitet.
Regel und Schutzumfang: [Mastervertrag](taxonomy-master-database-design.md).

## Artassistent bei fehlenden Medien – Korrektur vom 4. Oktober

Der Goldbaumsteiger-Befund zeigte einen vorgezogenen Veröffentlichungsversuch: Ohne neue Karte/Sound wurde
die Medienprüfung gestartet, bevor der Assistent den manuellen Karten- und Sound-Schritt anbieten konnte.
Der geführte, an genau eine Art gebundene Suchlauf hält jetzt auch bei leerem Medienergebnis vor der Übertragung an.

- Schritt 3 bietet die vorhandene Karten-Dateiauswahl, Drag-and-drop bzw. bewusstes Überspringen an.
  Der bekannte IUCN-Link wird aus der Art abgeleitet; ein Browsererfolg bedeutet weiterhin keinen
  erfolgreichen automatischen Abruf. HTTP-403-Schutz und Medienprüfung bleiben unverändert.
- Danach erscheint immer Schritt 4: neue Aufnahme prüfen oder ausdrücklich den Sound-Schritt abschließen,
  wenn keine neue nutzbare Aufnahme gefunden wurde. Eine vorhandene Aufnahme bleibt erhalten.
- Frühere Soundablehnungen können auch bei leerem Suchergebnis nach artbezogener Rückfrage aufgehoben
  und neu gesucht werden. Keine erneute Artanlage, keine fremden Ablehnungen oder manuellen Dateien löschen.
- Schließen/Wiederöffnen setzt denselben gespeicherten Medienauftrag fort, statt eine zweite Art anzulegen.
- Erst nach diesem Ablauf wird die Übertragung geprüft. Fehlende/ungültige Karte bleibt ein
  Veröffentlichungsblocker; die lokalen übrigen Schritte können trotzdem abgeschlossen werden.
  Die Oberfläche unterscheidet deshalb „lokal abgeschlossen“ und „Übertragung noch offen“ von Veröffentlichungserfolg.

Automatisierte UI-/Controller-Gegenproben prüfen leeres Suchergebnis, Kartenimport, Sound-Abschluss,
Rücksetzen/Wiederholen, gebundene Fortsetzung und Wiederöffnung. Kein produktiver Goldbaumsteiger-Neulauf
oder neues Karten-/Soundasset durch die Reparatur. Felix hat die geführte Abfolge am Schwarzstorch in allen
Instanzen praktisch bestätigt. Am 5. Oktober bestätigte Felix zusätzlich den echten Abbruch seiner
Schwarzstorch-Testanlage: nach seiner Beobachtung vollständig zurückgenommen. Dieser gezielte Nutzerbeleg
bleibt anerkannt. Weitergehende Wiederanlauf-, Soundreset- und verspätete Medienfälle werden im laufenden
Gesamtaudit getrennt geprüft; automatisierte Gegenproben verwenden ausschließlich isolierte Daten.

## Grundsatz

Jede Öffnung des Assistenten besitzt eine eigene Generation. Antworten eines zuvor geschlossenen
Dialogs dürfen einen neu geöffneten Dialog weder umschalten noch seine Meldungen ersetzen. Das gilt
auch für Statusabfragen, verschachteltes Nachladen und laufende Aktualisierungsabfragen. Schließen
bleibt möglich und bewahrt den gespeicherten Auftrag. Eine neue Art wird nach dem Artportrait-Schritt
lokal angelegt; Karte und Sound werden danach im selben gespeicherten Auftrag geprüft.
Die eigene Browserabnahme mit Wiederaufnahme, kontrolliertem Serverneustart, echtem Abbruch und alter
Antwort nach neuer Eingabe steht im [Auditauftrag, Abschnitt 10.32](audit-auftrag-phase-10-5.md#1032-fortsetzung-explorer-und-lightroom-nach-reparaturabschluss--15-oktober).

Eine gespeicherte geleitete Artanlage mit offener Medienprüfung bietet in der Prozessanzeige
**Artanlage fortsetzen** an. Auch die Datenbank-/Prozessschaltfläche führt dann in denselben Assistenten.
Nach einem Programmneustart öffnet sich dafür keine allgemeine Karten-/Soundprüfung von selbst.
Die Aktion prüft die Verfügbarkeit erneut und liest den gespeicherten Auftrag; sie legt keine neue Art an
und startet keine neue Suche. Eine nicht mehr eindeutig passende Sitzung oder ein zwischenzeitlich
gewechselter Auftrag verlangt eine erneute Statusprüfung. Allgemeine Medienläufe behalten ihre eigene
Prüfoberfläche. Die aktuelle tatsächliche Prozessneustart-/Medienabnahme und ihre verbleibenden Grenzen
stehen im [Auditauftrag, Abschnitt 10.33](audit-auftrag-phase-10-5.md#1033-eigene-positive-medien-prozessneustartrunde--16-oktober).

Neue Arten werden nicht automatisch vorgeschlagen oder automatisch in `species_list.json` eingefuegt.

Die Artenauswahl bleibt redaktionell manuell. Die Pipeline verarbeitet nur Arten, die von Felix bestaetigt und in
`species_list.json` gespeichert wurden. Phase 7.5 bildet diesen bisher direkten JSON-Schritt kontrolliert ueber den
lokalen Arten-Explorer ab.

Phase 9 ergänzt diesen Ablauf um die lokale read-only Taxonomiesuche. Sie verwendet bevorzugt die aktive
Masterdatenbank und bleibt für deren Inhalt offline nutzbar. Die Referenz darf keine Art still anlegen und keine
vorhandene Art automatisch überschreiben. Details stehen in
`docs/taxonomy-explorer-integration.md`.

## Manuell zu pflegen

Eine neue Art wird in `species_list.json` als JSON-Objekt ergaenzt:

```json
{
  "german": "Deutscher Name",
  "english": "English name",
  "genus": "Genus",
  "species": "species",
  "size": "ca. ...",
  "weight": "ca. ...",
  "life_expectancy": "ca. ... Jahre"
}
```

Regeln:

- `german`: deutscher Anzeigename und Basis fuer Sound-/Karten-Assetnamen.
- `english`: eigenständiger englischer Anzeigename und Suchbegriff.
- `genus`: wissenschaftliche Gattung, erster Buchstabe gross.
- `species`: Artepitheton klein schreiben.
- `size`: manuelle Groessenangabe.
- `weight`: manuelle Gewichtsangabe.
- `life_expectancy`: manuelle Lebenserwartung ohne Quellenfeld.
- Keine doppelten `genus + species`-Kombinationen.
- Keine leeren Pflichtfelder.

## App-Workflow in Phase 7.5

Der Arten-Explorer stellt in der Artenliste die Aktion `Neue Art` bereit.

Formularfelder:

- deutscher Name (`german`)
- englischer Name (`english`)
- wissenschaftlicher Name als zwei Woerter, zum Beispiel `Turdus Merula`
- Groesse (`size`), optional getrennt nach Maennchen und Weibchen
- Gewicht (`weight`), optional getrennt nach Maennchen und Weibchen
- Lebenserwartung (`life_expectancy`)

Der Dialog ist als vierstufiger Assistent aufgebaut. Bereits erreichte Schritte koennen angeklickt werden, um
vorherige Eingaben oder Pruefansichten erneut zu sehen.

### Schritt 1: Allgemeine Daten pruefen

Die App zeigt keine internen Dateinamen mehr im Dialogkopf. Anwender sehen nur die fachlichen Schritte.

Wenn eine lokale Taxonomiereferenz installiert ist, unterstützt sie alle drei Namensfelder:

- Beim ersten Start ist nur `Tiere (Animalia)` sichtbar und vorausgewählt. Das Zahnrad kann Animalia abwählen
  und weitere Reiche ein- oder ausblenden.
- Im Zahnrad-Dialog können die verfügbaren Reiche gefiltert werden. Die kompakte Liste bleibt scrollbar; Checkbox
  und Reichsname stehen in einer Zeile.
- Das Dropdown enthält `Alle Reiche` zuerst und danach ausschließlich die ausgewählten Reiche in alphabetischer
  Reihenfolge. `Alle Reiche` durchsucht nur diese sichtbare Auswahl.
- Der deutsche Name sucht nach belegten deutschen Namen.
- Der englische Name sucht nach belegten englischen Namen.
- Der wissenschaftliche Name sucht nach akzeptierten Namen und Synonymen.
- Die Suche beginnt 500 Millisekunden nach der letzten Eingabe. Ältere Antworten werden verworfen.
- Die Trefferliste zeigt mehrere Möglichkeiten, ohne einen Treffer automatisch auszuwählen.
- Sie schwebt über den folgenden Feldern, sodass die Höhe des Assistenten beim Suchen unverändert bleibt.
- Ein Klick auf einen Treffer schließt die schwebende Trefferliste, füllt deutsche, englische und
  wissenschaftliche Namensfelder direkt und zeigt Hierarchie, Quelle, Release, Quellen-ID und Namensstatus.
  `Eingaben prüfen` bleibt danach verpflichtend.
- Im Neue-Art-Assistenten werden nur Treffer mit dem Rang `Art` angeboten.
- CoL-Art- und Namenslücken können aus dem lokalen versionierten iNaturalist-Bestand sowie den relevanten
  GBIF-/WoRMS-/Wikidata-Ausschnitten erscheinen. Danach verbleibende belegte Tierlücken können kontrolliert aus
  Animalia ergänzt werden; der manuelle Animalia-Recherchelink bleibt verfügbar.
- Fehlt die lokale Referenz oder ist sie nicht lesbar, bleiben alle Felder manuell nutzbar.

Vor dem naechsten Schritt prueft die App lokal und danach der Server:

- alle sechs Formular-Pflichtfelder sind gefuellt
- wissenschaftlicher Name besteht genau aus Gattung und Artepitheton
- beide Namensbestandteile enthalten nur Buchstaben oder Bindestriche
- wissenschaftlicher Name ist noch nicht vorhanden
- deutscher Name ist noch nicht vorhanden
- der erwartete URL-Slug `genus + species`, klein und ohne Leerzeichen, kollidiert nicht
- der aus dem deutschen Namen erzeugte `SafeName` kollidiert nicht mit einer anderen Art oder einem fremden
  Assetordner
- Feldlaengen und Steuerzeichen sind gueltig

Fehlerhafte Felder werden direkt rot markiert; die konkrete Fehlermeldung steht unter dem betroffenen Feld und
zusaetzlich gesammelt im Dialog. Erst nach einer gueltigen Pruefung wird `Naechster Schritt` aktiv.

Im Hintergrund trennt der Server den eingegebenen wissenschaftlichen Namen. Die Gattung wird mit grossem
Anfangsbuchstaben und das Artepitheton kleingeschrieben in `genus` und `species` gespeichert. Die Eingabe
`Turdus Merula` wird damit als `Turdus merula` normalisiert.

Groesse, Gewicht und Lebenserwartung werden anwenderfreundlich aus Wert und Einheit zusammengesetzt:

- In das Zahlenfeld kommt nur der Wert oder Bereich, zum Beispiel `140-250`.
- `ca.` wird automatisch vorangestellt.
- Groesse bietet `mm`, `cm` und `m`.
- Gewicht bietet `g`, `kg` und `t`.
- Lebenserwartung bietet `Tage`, `Monate` und `Jahre`; bei genau `1` speichert die App automatisch `1 Tag`,
  `1 Monat` oder `1 Jahr`.

Groesse und Gewicht koennen getrennt nach Geschlecht erfasst werden. Dafuer gibt es je Feld eine eigene Checkbox:

- Checkbox aus: ein gemeinsamer Wert plus Einheit, gespeichert zum Beispiel als `ca. 23,5-29 cm`.
- Checkbox an: je ein Feld fuer `Maennchen` und `Weibchen`.
- Sind beide Angaben getrennt, speichert die App weiterhin die bestehenden Textfelder, zum Beispiel:
  `Maennchen: ca. 24-29 cm; Weibchen: ca. 23,5-27 cm`.

Die Vorschau zeigt:

- vollstaendigen neuen JSON-Eintrag
- wissenschaftlichen Namen
- erwarteten URL-Slug
- erwarteten Assetordner

### Schritt 2: Optionales Artportrait

Der geprüfte Artentwurf und sein zugehöriges Portrait haben während der laufenden Explorer-Sitzung keine
zeitliche Ablauffrist. Auch längere Arbeit am Portrait erfordert deshalb keine erneute Artanlage. Beim Speichern
bleiben der Abgleich mit der Eingabeliste, Kollisionsprüfung und Einmalverwendung verpflichtend. Abbrechen vor
der Anlage verwirft nur diesen Entwurf und seine temporären Portraitdateien. Änderungen an den Artdaten verlangen
eine erneute Prüfung. Entwürfe überleben noch keinen Neustart des Explorers. Die Zehn-Minuten-Frist anderer
Bearbeitungs-/Assetvorschauen wird dadurch nicht aufgehoben; diese lassen sich ohne erneute Artanlage prüfen.

Nach erfolgreicher Datenpruefung kann direkt ein Portrait vorbereitet werden:

1. optional `Erweiterte Vorgaben für die Bildgenerierung` öffnen und nur gewünschte Abweichungen auswählen
2. optionale freie Zusatzhinweise eintragen
3. Einzelprompt aus den geprüften Artdaten, der Taxonomieklasse und allen Bildvorgaben erzeugen und kopieren
4. genau ein Bild in ChatGPT erzeugen
5. Bilddatei im Dialog auswählen
6. `Bild prüfen`

Die Untergruppen der erweiterten Vorgaben sind einzeln ausklappbar. Geschlossene beziehungsweise unveränderte
Felder bleiben automatisch; das Habitat wird standardmäßig dezent und wissenschaftlich passend angedeutet.
Klassenabhängige Felder erscheinen nur, wenn die Taxonomiereferenz die Klasse kennt. Ein Gewässertyp wird deshalb
nur bei fachlich passenden Klassen angeboten. `Prompt erstellen` übernimmt die Auswahl direkt. Bei einer
Detailaufnahme ist ein freies Detailmotiv Pflicht.

Die Bildpruefung nutzt dieselben Regeln wie die Bearbeitung bestehender Arten: PNG/JPEG/WebP bis 20 MB,
Mindestgroesse 800x1000 Pixel, 4:5-Seitenverhaeltnis und lokale Umwandlung auf `portrait.webp` in 1280x1600.
Der Schritt kann mit `Artportrait ueberspringen` bewusst ausgelassen werden. Diese Aktion markiert den Schritt nur
als erledigt; erst `Naechster Schritt` legt die Art an und startet den Suchlauf. Wird der Dialog vorher mit `X` oder
`Abbrechen` geschlossen, werden die Eingaben verworfen und keine Art angelegt.

### Schritt 3: Karte und Pipeline-Status

Nach Schritt 2 wird die Art ohne weiteres Datenbank-Aktionen-Fenster angelegt. Der Dialog bleibt offen und zeigt den
Status des gezielten Pipeline-Laufs fuer genau diese Art:

- Art anlegen
- IUCN-Daten und Karte suchen
- Sound suchen
- Spektrogramm bereitstellen

Wenn eine neue Karte gefunden wird, wird sie direkt in diesem Dialog geprüft. Sie kann übernommen oder übersprungen
werden. Beim Überspringen wird die automatisch gefundene Karte entfernt; eine manuelle Karte kann später über die
Assetverwaltung eingefügt werden.

Der Neue-Art-Lauf verwendet denselben Kartenabruf wie die Kartenbearbeitung. Liefert der automatische Abruf keine
speicherbare Karte, bietet der Assistent eine JPEG-/PNG-Dateiauswahl und Dateiablage per Drag-and-drop. Die Datei
wird lokal geprüft (maximal 20 MB) und erst mit `Manuelle Karte übernehmen` gespeichert. Bei einer lokalen Datei
wird die Quellen-URL nicht abgerufen; ein dortiges HTTP 403 verhindert deshalb den Dateiimport nicht.
Der offizielle Link aus der bekannten Assessment-ID ist vorbelegt. Ein IUCN-Dateiname mit anderer Assessment-ID
wird abgewiesen; bei einem beliebig benannten lokalen Bild wird die vorbelegte IUCN-Herkunft entfernt und kann
bewusst eingetragen werden. Alternativ bleibt der Import eines direkt erreichbaren Kartenlinks möglich.

### Schritt 4: Sound und Abschluss

Wenn ein Sound gefunden wird, wird er im selben Dialog mit Audioplayer und Spektrogramm angezeigt. Ein Klick ins
Spektrogramm setzt die Wiedergabeposition. Der Sound kann übernommen, übersprungen oder abgelehnt werden.
Bei Ablehnung speichert der Explorer die Quellkennung und startet automatisch die nächste gezielte Soundsuche fuer
diese Art. Es können beliebig viele Soundquellen pro Art abgelehnt werden.

Wenn danach kein weiterer Kandidat aus den unterstützten und lizenzgeprüften Quellen verfügbar ist, bleibt der
Assistent geöffnet und zeigt diesen Abschluss ausdrücklich an. Die Meldung behauptet bewusst nicht, dass es
weltweit keine Aufnahme gibt. Die Art kann ohne Tierstimme abgeschlossen werden; der fehlende Sound bleibt als
sichtbarer Pflegehinweis erhalten.

Nach Abschluss erscheint im Dialog die Erfolgsmeldung `Neue Art: <Name> wurde angelegt`.

Seit 27. September bietet Schritt 4 nach Ende des Suchlaufs `Abgelehnte Soundquellen wieder zulassen …`.
Eine Rückfrage nennt die Zahl der gespeicherten Ablehnungen **dieser Art**. Erst nach Bestätigung werden sie
aufgehoben und ein reiner Sound-Suchlauf für dieselbe bereits gespeicherte Art gestartet. Es entsteht kein
zweiter Arteintrag. Nach einem fehlgeschlagenen Suchstart kann erneut gesucht werden, auch wenn die Liste schon
geleert ist. Die Lizenz- und Quellenprüfung bleibt unverändert; erneute Verfügbarkeit einer Aufnahme ist nicht
garantiert.

Die Aktion steht auch **während der Soundprüfung** zur Verfügung, nicht erst nach ausgeschöpfter Suche.
Die Rückfrage erklärt hier ausdrücklich: frühere Ablehnungen aufheben, den gerade angezeigten Sound ablehnen
und überspringen, danach frühere Quellen wieder durchsuchen. Abbrechen lässt die aktuelle Auswahl unverändert.
Das ist eine neue Suche, keine garantierte Wiederherstellung einer bestimmten früheren Aufnahme.
Die Rücksetzung wird zusammen mit der aktuellen Medienentscheidung gespeichert; nur die aktuelle Quelle bleibt
gesperrt. So kann die Rücksicherung des vorherigen Sounds alte Ablehnungen nicht wieder einschleppen.

Für schon angelegte Arten ist dieselbe Freigabe unter `Tierstimme → Bearbeiten` verfügbar. Hier folgt die
Soundsuche bewusst separat über `Automatisch suchen` bzw. `Alternative suchen`. Geschützte manuelle Sounds
bleiben geschützt. Die Freigabe entfernt ausschließlich `sound.rejectedSources` der gewählten Art; sie ersetzt
oder löscht keine Datei und verändert keine andere Art. Vorhandene Sound-Backups werden nicht überschrieben.
Historische Ablehnungsangaben bleiben erhalten, sind aber keine Suchsperre. Die Registry-Änderung wird lokal
gespeichert und später mit `Änderungen übertragen` beziehungsweise dem nachfolgenden Pipeline-Lauf veröffentlicht.

Die API verwendet `POST …/assets/sound/rejections-preview` und `…/rejections-reset`: art- und revisionsgebundene,
kurzlebige Bestätigung, Schutz gegen parallele Asset-/Pipeline-Schreibvorgänge, atomarer Registry-Dateiaustausch.
Eine nachträglich geänderte Registry verlangt eine neue Vorschau. Fehler geben die Sperre wieder frei; ein
Anzeigefehler nach erfolgreichem Speichern wird als Warnung statt als fehlgeschlagene Speicherung gemeldet.
Bei einer unveröffentlichten neuen Art bleiben Rücksetzung und erneuter Sound-Suchlauf an dieselbe
`creationId` gebunden. Jede Speicherung aktualisiert deren Herkunftsnachweis; auch ein leerer erneuter
Suchlauf wartet im Assistenten auf eine bewusste Entscheidung. Der Auftrag bleibt danach abbrechbar und
nach Schließen oder Neustart fortsetzbar. Bereits veröffentlichte Arten bleiben im Medieneditor bearbeitbar,
ohne dass ein alter Artanlage-Nachweis spätere Bearbeitungen sperrt.
Während einer wartenden Soundprüfung verwendet der Assistent stattdessen die bestehende Review-API mit
`decision: reject`, `resetSoundRejections: true` und der aktuellen `reviewUrl`. Lauf-ID und Vorschau-URL müssen
passen; sonst bleibt die neuere Prüfung unverändert. Gleichzeitige Review-Speicherungen werden abgewiesen.
Eine unlesbare Registry wird nicht als leere Datei ersetzt. Vorhandene Sounddateien werden zunächst aus der
Ausgangssicherung wiederhergestellt, ihre Schutzmarkierung bleibt erhalten; nur ein danach tatsächlich neu
gefundener Kandidat kann wieder eine eigene Prüfentscheidung verlangen. Andere Arten bleiben unverändert.

Am erfolgreichen Abschluss bleibt genau **eine** Schließen-Schaltfläche im Fußbereich. Das X im Kopf bleibt
zusätzlich verfügbar. Nach Schließen/Wiederöffnen startet der Assistent wieder mit seiner normalen Abbrechen-Aktion.
Controller- und API-Tests prüfen Rückfrage/Abbruch, Fehler, Wiederholung, einmalige Artanlage, Schließen,
Registry-Erhalt und Server-Neustart. Acht gezielte Tests sowie das vollständige `quality:ci` bestanden am
27. September. Felix bestätigte anschließend beide bisherigen Rücksetzungswege praktisch (Editor und Assistent
nach ausgeschöpfter Suche). Die zusätzliche Rücksetzung während einer noch offenen Soundprüfung ist
automatisiert geprüft und inzwischen ebenfalls von Felix bestätigt (Abnahme am 28. September dokumentiert).
Echte Ablehnungen wurden bei der Implementierung nicht zurückgesetzt.

Auch die Ergänzung während offener Prüfung bestand am 27. September das vollständige `quality:ci`
(Exitcode 0). 21 gezielte Sound-/Assistenten-/Pipeline-Tests prüfen zusätzlich normale Ablehnung,
Rücksetzung mit/ohne vorherige Sounddatei, alte Review-URL, gleichzeitige Speicherung, defekte Registry,
Suchfehler nach Speicherung sowie den sofortigen Dialogstart bei ausstehender Referenzprüfung.

Vorerst erledigte Beobachtung am 27. September: Beim Öffnen der Artanlage mit aktivem Listenfilter waren Eingaben laut
Felix vorübergehend nicht anklickbar. Eine Sperre durch den Filter ist im Code nicht belegt: er rendert nur die
Artenliste; die Referenzprüfung wird nach dem Öffnen ohne Warten gestartet. Ein Controller-Test mit gesetzten
Filtern und absichtlich ausstehender Referenzprüfung bestätigt sofortiges Öffnen, Fokus und Schließen.
Er bildet jedoch keine Electron-Ereignisschleifen-/Fokusverzögerung nach. Felix betrachtet die Beobachtung
vorerst als erledigt und meldet ein erneutes Auftreten. Parallel liefen nach seiner Rückmeldung Lightroom-Prozesse;
deren Einfluss ist nicht nachgewiesen. Keine weitere Untersuchung eingeplant und keine spekulative Filteränderung.

Bei Suchlauf-, Medienprüfungs- oder Veröffentlichungsfehlern steht die Fehlermeldung auch im sichtbaren
Abschlussschritt. Sobald keine Operation mehr läuft, ist `Fenster schließen` verfügbar; die bereits angelegte
Art und ihre Dateien bleiben lokal erhalten. Nicht nochmals dieselbe Art anlegen, sondern die vorhandene Art
ergänzen und anschließend `Änderungen übertragen` verwenden. Auch eine wartende Assetprüfung lässt sich
schließen; sie bleibt über die Prozessanzeige erreichbar. Schließen ist keine Löschung und kein Rollback.

Seit 4. Oktober gibt es nach dem ersten Speichern zusätzlich `Artanlage abbrechen`. Die Rückfrage benennt
die eigene, noch unveröffentlichte Anlage. Nach Bestätigung nimmt der Explorer genau diesen Auftrag zurück:
Eingabeliste, erzeugte Art-/Assessmentdaten, Pflegeeinträge, eigene Medien, Karten-Dokumentation und die
zugehörige Anlagesicherung. Der Fehlteilebericht wird um diese Art bereinigt. Ein Git-Lauf ist dafür nicht nötig.
Ein nachweislich eigener, unverändert gebliebener Spektrogramm-Generator-Eintrag wird auf den Ausgangsstand
zurückgenommen. Das gilt für Soundimport und automatisch erzeugte Spektrogramme; spätere fremde
Registry- oder Generatoränderungen bleiben erhalten.
`Fenster schließen` erhält die Anlage weiterhin zum Fortsetzen; diese beiden Aktionen sind ausdrücklich getrennt.

Native Rückmeldung vom 5. Oktober: Felix hat `Artanlage abbrechen` mit Schwarzstorch ausgeführt.
Nach seiner Beobachtung wurde die Anlage vollständig zurückgenommen. Damit ist diese gezielte
Bedienabnahme bestätigt; keine neue unabhängige Datei-/Git-Restprüfung oder gesamte Wiederanlaufabnahme
behaupten. Die automatisierten Fremdschutz-/Abbruchgegenproben bleiben gesonderte technische Nachweise.

Die lokale Herkunftsdatei unter `species-explorer/creation-sessions/` bindet die Rücknahme an die eigene
Artanlage, nicht allein an einen eingegebenen Artnamen. Sie überlebt das Schließen und einen Explorer-Neustart.
Bei späteren Änderungen an anderen Arten entfernt der Explorer nur die eigenen Einträge; er stellt keine
alten Gesamtdateien über neuere fremde Daten wieder her. Sobald sich eigene Daten, Dateien oder Sicherungen
anderweitig geändert haben, bleibt die Rücknahme mit einem Schutzgrund angehalten. Publikationsbeginn oder
ein geänderter Git-Stand sperren die automatische Rücknahme ebenfalls. Nach einer erfolgreichen Veröffentlichung
öffnet `Neue Art` wieder das Formular für die nächste Anlage.

Der erfolgreiche Transfer schließt den Artauftrag mit einer kleinen dauerhaften Quittung: Laufkennung,
Commit und gebundener Art-/Medienstand müssen übereinstimmen, der Push muss erfolgreich sein und den
vorgesehenen entfernten Zweig bestätigen. Erst dann entfallen die zusätzlichen JSON-/Medien-Baselines
des Auftrags und dessen Sicherungsschutz; der normale eine Medienvorgänger je Art/Typ bleibt erhalten.
Eine spätere Karten-/Soundbearbeitung kann diesen Vorgänger wieder ersetzen. Alte Artanlage-IDs können
die fertige Art weder erneut aktivieren noch abbrechen oder späteren Medienentscheidungen untergeschoben werden.
Ein anschließend fehlgeschlagener Pages-Deploy öffnet den bereits übertragenen Artauftrag nicht wieder.

Nach einem Pushfehler bleibt der gebundene Transfer über `Änderungen übertragen` erreichbar, auch ohne
neue Dateiveränderung; die Wiederholung benötigt weder eine zweite Artanlage noch einen zweiten Commit.
Nach Neustart darf ein vorbereiteter Transfer aus dem passenden Git-Push-Protokoll abgeschlossen werden,
nicht aus `publicationStarted`, einem bloß geänderten HEAD oder einem No-op. Fehlt der Beleg oder passt der
gespeicherte Stand nicht, bleiben Auftrag und Rücknahmesatz geschützt. Ein unterbrochenes Schreiben der
abschließenden Quittung wird aus dem zuvor dauerhaft gespeicherten Pushnachweis fortgesetzt.

Läuft beim Abbruch noch ein eigener Schreibvorgang, wird der Wunsch dauerhaft vermerkt. Der Explorer wartet
den begonnenen Schreibblock ab und führt die Rücknahme automatisch mit derselben Auftragskennung weiter.
Er startet dabei keine Folge-Suche und keine Veröffentlichung. Die Oberfläche sperrt weitere Entscheidungen,
bis die Rücknahme beendet ist oder einen konkreten Schutzgrund meldet. Nach Neuladen wird ein gespeicherter
Abbruchwunsch wieder aufgenommen. Ein vor der letzten Herkunftssicherung unterbrochener Prozess kann zur
Sicherheitsprüfung führen; unbekannte/geänderte Dateien werden nicht pauschal als eigene Dateien gelöscht.

Abgebrochene Aufträge hinterlassen lediglich eine kleine lokale Abschlussquittung ohne alte Artdaten oder
Medien, damit eine wiederholte Abbruchanfrage sicher beantwortet wird. Alte Medien-/Prüftokens werden verworfen.
Unabhängig davon prüft jede spätere Pipeline-Medienentscheidung die Zielart frisch: eine inzwischen gelöschte
oder geänderte Art kann keinen neuen Pflegeeintrag und keine Veröffentlichung über eine alte Prüfung erzeugen.
Auch nach einer gleichnamigen Neuanlage wird der alte, bei separater Löschung beendete Auftrag abgewiesen,
bevor Dateien oder Pflegeeinträge verändert werden. Die zugehörige wartende Medienprüfung wird beim
Löschen entwertet und nach einem Explorer-Neustart nicht wieder als aktive Prüfung geöffnet.

Speichern:

- nur nach gueltiger Vorschau
- Schutz gegen parallele Aenderungen an `species_list.json`
- Backup nach derselben Aufbewahrungsregel wie Phase 7.4
- neuer Eintrag wird atomar an die Liste angehaengt
- wenn ein Portrait geprueft wurde, wird es im Neue-Art-Ablauf ohne zusätzliche Browser-/Electron-Bestätigung lokal
  uebernommen
- danach startet der selektive Pipeline-Lauf fuer genau diese neue Art automatisch; erst dieser Lauf vervollstaendigt
  IUCN-Daten, Karte, Sound, Spektrogramm und Git-Veröffentlichung
- vor dem manuellen Datei-/Linkimport versucht die Pipeline den automatischen Kartenabruf
- neu gefundene Karten und Sounds werden im Neue-Art-Dialog einzeln geprüft
- wenn ein neu gefundener Sound abgelehnt wird, merkt die App die Quellkennung und startet automatisch die nächste
  gezielte Soundsuche fuer diese Art, bis ein Sound akzeptiert wird oder keine taugliche Quelle mehr gefunden wird

Direkt nach dem Speichern erscheint die Art im Explorer als `nur in species_list.json`. Dieser Zustand ist erwartet
und bleibt sichtbar, bis die Pipeline erfolgreich gelaufen ist.

API:

- `GET /api/taxonomy/status`: meldet Verfügbarkeit und aktiven Referenzstand, ohne die Artanlage zu blockieren
- `GET /api/taxonomy/kingdoms`: liefert alle verfügbaren Reiche mit `Animalia` als erstem lokalen Standard
- `GET /api/taxonomy/search`: liefert höchstens zwölf read-only Vorschläge und akzeptiert ein einzelnes
  `kingdomId` oder mehrere kommagetrennte `kingdomIds`
- `GET /api/taxonomy/taxa/:id`: liefert Detailvorschau, Hierarchie und Quelleninformationen
- `POST /api/species/new/preview`: validiert alle Felder und Kollisionen, schreibt aber keine Datei
- `POST /api/species/new/discard`: verwirft nur den per Token benannten, noch nicht gespeicherten Entwurf und
  zugehörige temporäre Portraits; bereits angelegte Arten werden nicht entfernt
- `POST /api/species/new/portrait-prompt`: erzeugt den Einzelprompt aus den geprueften Artdaten
- `POST /api/species/new/portrait-preview`: prueft und staged ein optionales Sofortportrait
- `POST /api/species/new/save`: akzeptiert nur das einmalige Vorschau-Token und haengt den geprueften Eintrag an
- `POST /api/species/new/sessions`: liefert lokale Artanlage-Aufträge und ihre aktuelle Abbruchmöglichkeit
- `POST /api/species/new/abort`: verlangt die persistierte `creationId`; nimmt den eigenen unveröffentlichten
  Auftrag zurück oder meldet `pending`, solange ein laufender Schreibvorgang sicher abgewartet wird

Technischer Stand vom 2026-07-28:

- Formular, Vorschau und Speichern sind lokal umgesetzt.
- Die lokale Taxonomiereferenz ist in Schritt 1 integriert. Alle Namensfelder bleiben auch bei installierter
  Referenz direkt manuell beschreibbar.
- Deutsche, englische und wissenschaftliche Eingaben durchsuchen getrennt die passende Namensart. Ein Zahnrad
  begrenzt lokal die sichtbaren und durch `Alle Reiche` durchsuchten Reiche; nur Animalia ist anfänglich aktiv.
- Die 300-ms-Suche verwendet eine schwebende Ergebnisliste und lässt die Dialoghöhe unverändert.
- Das Formular verwendet einen Schrittassistenten mit Datenpruefung, optionalem Portraitschritt, Kartenpruefung sowie
  Sound-/Abschluss-Schritt.
- Das Formular verwendet ein gemeinsames Feld fuer den wissenschaftlichen Namen und zeigt Beispieltexte fuer alle
  Eingaben. Groesse, Gewicht und Lebenserwartung werden aus Wert plus Einheit zusammengesetzt; `ca.` wird automatisch
  gespeichert.
- Groesse und Gewicht koennen unabhaengig voneinander nach Maennchen und Weibchen getrennt werden.
- Bereits erreichte Schritte koennen angeklickt werden. Klickbare, noch offene Schritte sind blau, abgeschlossene
  Schritte gruen und gesperrte Schritte grau markiert. `Artportrait ueberspringen` startet keine Anlage mehr,
  sondern gibt erst `Naechster Schritt` frei.
- Ungueltige Felder werden sichtbar markiert; Fehlermeldungen stehen direkt am Feld.
- Nach erfolgreichem Speichern wird die Aktion wieder freigegeben, sodass ohne Seitenneuladen weitere Arten
  angelegt werden koennen.
- Nach Schritt 2 startet der gezielte Lauf `Neue/Unvollständige Arten aktualisieren` fuer diese Art im selben Dialog.
  Das Datenbank-Aktionen-Fenster wird dabei nicht geöffnet.
- Sound- und Spektrogramm-URLs werden bei jedem neuen Suchversuch mit einem Hash versehen, damit nach einer
  Ablehnung nicht versehentlich ein alter Browser-/Electron-Cache abgespielt wird.
- Die Artenlisten-Aufbewahrung hält fünf reguläre Sicherungen global. Zusätzlich an offene Artanlagen
  gebundene Rücknahmestände bleiben bis zum belegten Abschluss erhalten; ein begonnener Push genügt nicht.
- Wissenschaftlicher Name, deutscher Name, Slug, `SafeName` und bereits vorhandene Assetordner werden geprueft.
- Schreibtests laufen ausschliesslich in temporaeren Mini-Repositories; die echte `species_list.json` bleibt dabei
  unveraendert.
- Direkte Service-, Routing-, UI-Vertrags- und Workflowtests sichern Referenzsuche und bisherigen Assistenten ab.
- Die Bedienung wurde am 2026-06-20 mit Haubentaucher und Höckerschwan praktisch geprüft.

Historische Workflow-Prüfungen:

- Haubentaucher und Höckerschwan wurden nach den produktiven Workflow-Tests wieder entfernt und am 2026-06-28
  bereinigt
- Löwe wurde am 2026-06-30 fuer einen sauberen erneuten Neue-Art-Test wieder vollständig entfernt
- nach dauerhafter Löschung der generierten Daten und Assets kann dieselbe Art ohne alte Slug-, Daten- oder
  Assetordner-Kollision erneut angelegt werden

Der aktuelle Artenumfang steht ausschließlich in `docs/project-status.md`.

## Formularverhalten

- Eine Textmarkierung darf über den Rand des Dialogs hinausgezogen werden, ohne das Formular zu schließen.
- Ein Klick auf den dunklen Hintergrund schließt den Dialog nur, wenn der Klick dort begonnen und geendet hat.
- Damit bleiben bereits eingetragene Werte auch beim erneuten Anlegen einer Art erhalten.

## Was danach automatisch passiert

Nach dem manuellen Eintrag verarbeitet `node update.mjs` die neue Art:

- IUCN-Taxon und globales Assessment suchen
- `speciesData.json` erzeugen/aktualisieren
- IUCN-Karte laden, wenn verfuegbar
- Sound ueber Xeno-Canto, Wikimedia Commons und iNaturalist suchen
- `fehlende_elemente_report.json` aktualisieren
- vorhandene gute Daten schuetzen, wenn ein neuer API-Abruf unvollstaendig ist

## Was nicht automatisch passiert

Squarespace-Seiten werden nicht automatisch erzeugt.

Nach einer neuen Art muessen manuell geprueft bzw. angelegt werden:

- Detailseite mit Slug aus `genus + species`, klein und ohne Leerzeichen, z. B. `cyanistescaeruleus`
- Codeblock auf der Detailseite mit den bekannten Artseiten-Containern
- Link auf der passenden Uebersichtsseite, damit Suche/Sortierung die Art findet
- ggf. Bild, Alt-Text und interne Verlinkung in Squarespace

## Pflichtchecks nach neuen Arten

Lokal:

```bash
node --check update.mjs
node update.mjs
```

Danach pruefen:

- `speciesData.json` enthaelt die neue Art.
- `fehlende_elemente_report.json` zeigt keine unerwarteten Fehler.
- Sound, Credits und Karte sind vorhanden oder sauber als fehlend gemeldet.
- `lastSavedAssessmentId.json` wurde plausibel aktualisiert.
- Keine Tokens oder lokalen Logs wurden versehentlich versioniert.

Website:

- GitHub Pages Deploy abwarten.
- Detailseite live testen.
- Info-Box inklusive Lebenserwartung, Generationsdauer und Population pruefen.
- Taxonomie, Status, Soundbar und Karte pruefen.
- Uebersichtsseite testen: Suche findet die neue Art.

## Versionierung

Nur Daten-/Asset-Aenderungen brauchen normalerweise keine Squarespace-`?v=`-Erhoehung.

Eine `?v=`-Erhoehung ist nur noetig, wenn eingebundene JavaScript- oder CSS-Dateien geaendert wurden.
