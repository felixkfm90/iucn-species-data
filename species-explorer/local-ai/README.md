# Lokale KI für bearbeitbare Vorschläge

Stand: 2. November 2026. Produktkern als getrennte Module; Geräteprofil, Authentisierung,
vorhandener Bildtexteditor und lokale API sind im Quellstand verbunden. Die Modultests verwenden
kleine synthetische Dateien, Fake-HTTP und Fakeprozesse; sie sind von den nachfolgenden tatsächlichen
nativen Produktproben getrennt. Die separaten CPU-Proben verwenden eigene Prozesse; die persönliche
Einrichtung und Bedienprüfung des Explorers werden daneben ausdrücklich nachgewiesen.

## Artseitenanschluss und frühere manuelle Sprachprüfung

Felix verlangt am **2. November** automatische Prüfung unmittelbar im Textfeld und bestätigt die
bereits aktive deutsche Rechtschreibung. Der manuelle Sprachstart wird deshalb aus den normalen
Bildtext-/Artseitenabläufen entfernt. Der neue unabhängige [Sprachprüfbaustein](../language-check/README.md)
verwendet LanguageTool lokal; seine native Qualifikation und Produktaktivierung stehen noch aus.
Bildvorschläge und bewusste sachliche Quellenarbeit bleiben in diesem KI-Modul. Die folgenden
`review-language`-Beschreibungen und Modellproben dokumentieren den früheren, nicht allgemein
qualifizierten Weg und dessen gespeicherte Ergebnisse; sie sind keine Freigabe für automatische LLM-Korrekturen.

Der vorhandene Dienst nimmt über denselben Worker und dieselbe begrenzte persönliche Jobqueue auch
gespeicherte Artseitenentwürfe an. Der interne `pageAuthoring.aiReader` liest über die bestehende
Clientfassung und das persönliche Seitenjournal. Rohe Arbeitsdatensätze und Bildbytes bleiben im
Nodeprozess. Quellenwahl, Bildvorschlag und sachliche Prüfung sind an Person, Projekt, Entwurf,
Version und konkretes Ziel gebunden; geänderte Grundlagen verhindern eine spätere Annahme.
Der Renderer liefert keine lokalen Dateipfade oder freien Bildadressen. Status und Quellenanzeige
starten weder Modell noch Download. Der neue Quellenanschluss ist automatisiert geprüft; seine
native Bedienung und tatsächliche Modellausgabe sind gesonderte Nachweise.

`review-language` war die zusätzliche sprachliche Prüfung, getrennt von der sachlichen Quellenprüfung
`review-text`. Der inzwischen entfernte Button **Sprache prüfen** nutzte bei eingerichteter lokaler Texthilfe den aktuell bearbeiteten
Website-Bildtext oder einen gespeicherten bearbeitbaren Artseitenabschnitt einschließlich Einleitung.
Hierfür werden keine Fachquellen oder Bildbytes nachgeladen. Websiteeingaben bleiben auf 2.000 Zeichen,
Artseitenabschnitte auf 8.000 Zeichen begrenzt; es gibt kein stilles Abschneiden oder automatisches Wiederholen.

Die Antwort liefert höchstens acht Hinweise zu Rechtschreibung, Groß-/Kleinschreibung, Grammatik oder
Kommasetzung. Exakter Originalhash, unveränderte Textstellen, UTF-16-Spannen und nicht überlappende
Ersetzungen sind Pflicht. Der Korrekturtext wird aus diesen Ersetzungen berechnet, nicht als frei
behauptete Neufassung angenommen. Das Modell darf keine Block-/Listengrenzen ändern. Die bewusste
Annahme bearbeitet nur den offenen Entwurf; sie speichert, genehmigt oder veröffentlicht nichts.
Artseiten behalten ihre Absätze, Überschriften, Listen und Quellen. Nach der Annahme bleibt normale
manuelle Bearbeitung möglich. Acht Hinweise sind eine begrenzte Hilfe, keine Vollständigkeits- oder
Richtigkeitsgarantie. Der neue Sprachpfad benötigt noch seine abschließende Integrations- und native
Ergebnisabnahme; frühere Bild-/Quellenproben gelten dafür nicht als Ersatz.

Die tatsächliche CPU-Sprachprobe vom 1. November (`page-language-native-v3-20261101.json` im privaten
Bereitstellungsbelegordner) trifft drei von fünf vorab festgelegten Ergebnissen. Sie verbessert dabei
zwei Komma-/Konjunktionsfälle und eine Großschreibung. Ein geschützter Artbezeichnungsfall endet ohne
auswertbare Workerantwort; die genaue Ursache ist in dieser Probe nicht erfasst. Eine weitere
Großschreibung bleibt unverbessert, und auch zu richtigen Korrekturtexten liefert das Modell falsche
sprachliche Erklärungen. Die sprachliche Eignung ist damit weiterhin nicht abgenommen.
Quellen und Modellpins bleiben unverändert; eigene Modellprozesse
und deren Ein-/Ausgabehandles sind bestätigt geschlossen. Kein Download und keine Websiteänderung.

Die nachfolgende instrumentierte v4-Probe bestätigt für alle fünf Aufträge vollständige HTTP-200-
Antworten, reguläres `finish_reason:stop` und erfolgreich geparstes JSON. Im Artbezeichnungsfall
liefert das Modell einen vermeintlichen Korrekturbefund mit exakt unverändertem Text; die bestehende
Sprachprüfung weist diesen wirkungslosen Befund korrekt zurück. Der ausgelassene Fuchs-Befund und
falsche sprachliche Erklärungen bleiben bestehen. Drei passende Korrekturtexte reichen weiterhin
nicht zur Ergebnisabnahme. Alle eigenen Prozesse, Antwort-Clone-Leser und Handles sind geschlossen;
Modellpins und Produktquellen bleiben unverändert. Der v3-Beleg wird dadurch nicht umgeschrieben.

Der Promptnachlauf vom **2. November** fordert ausdrücklich echte Änderungen statt unveränderter
Bestätigungen, die Prüfung gewöhnlicher Substantive trotz Fachnamenschutz und eine zur tatsächlichen
Änderung passende Befundart/Erklärung. Validator, Schema, Grenzen, Modellparameter und Reise-Punktregel
bleiben unverändert. Der lokale Gesamtnachlauf besteht mit **170/170 Fällen**.

Die tatsächliche v5-CPU-Probe wiederholt die fünf früheren Fälle und ergänzt zwei erst nach dem
Promptfreeze festgelegte unabhängige Kontrollen für Rechtschreibung und ein Nebensatzkomma.
**Sechs von sieben fertigen Korrekturtexten stimmen.** Der gewöhnliche Fuchs-Befund und beide neuen
Kontrollen werden jetzt korrigiert. Beim bereits richtigen Kolibrinamen liefert das Modell weiterhin
einen wirkungslosen Befund; der Validator weist ihn ab. Mehrere Erklärungen oder Befundarten sind
weiterhin falsch, besonders bei Komma-/Konjunktionsfällen. Ein richtiger Ersatztext allein wird deshalb
nicht als allgemeine Sprachqualitätsabnahme ausgewiesen.

`page-language-native-v5-20261102.json` und der getrennte Bewertungsbeleg liegen im bestehenden
privaten Bereitstellungsbelegordner. Alle sieben HTTP-Antworten sind vollständig ausgewertet; Quellen
und Modellpins bleiben während der Probe unverändert. Sämtliche eigenen Modellprozesse und
Diagnoseleser sind bestätigt geschlossen. Es gab keinen Download und keine Änderung vorhandener
Texte oder Websiteinhalte. Die früheren v3-/v4-Belege bleiben unverändert erhalten.

Der anschließende Qualitätsversuch **v6 vom 2. November** ergänzt sechs vollständige Promptbeispiele
und stellt die Ausgabereihenfolge um. Die zehn tatsächlichen CPU-Antworten kommen vollständig mit
HTTP 200, regulärem `stop` und gültigem JSON an. **Sechs von zehn Fällen** passen einschließlich
Befundart und Erklärung. Beide richtigen Artbezeichnungen bleiben ohne Befund. Bei einem anderen
Fall kopiert das Modell jedoch eine fremde Textstelle aus den Beispielen; zwei weitere Antworten
enthalten wirkungslose Befunde und ein notwendiges Nebensatzkomma wird übersehen. Auf den sieben
gemeinsamen Fällen passen fünf Korrekturtexte gegenüber sechs in v5. Die Qualität ist nicht abgenommen.

Deshalb ist der gesamte Requestbau einschließlich Schemafeldreihenfolge wieder **bytegleich zu v5**
hergestellt; keine ungemessene Mischung der Promptvarianten. Die v5-Quelle wurde über ihren exakten
Hash aus dem gebundenen privaten Installer gelesen, ohne diesen auszuführen. Der v6-Quellstand,
seine vollständige native Antwort und die getrennte Bewertung bleiben als Fehlerbeleg erhalten.

Unabhängig davon bleiben zwei neue objektive Prüfungen im Produkt: Ein als reine Großschreibung
bezeichneter Hinweis darf keine Wörter oder Satzzeichen ändern; ein reiner Zeichensetzungshinweis
darf keine Buchstaben ändern. Widersprüche verwerfen die gesamte Antwort mit verständlicher Meldung,
auch wenn ein anderer Befund dieselbe Textkorrektur vorschlägt. Es gibt keine stille Umklassifizierung.
Die nun stärkeren Prüfungen würden auch einzelne falsche v5-Befundarten zurückweisen. Die frühere
v5-Textquote ist somit keine Erfolgsquote des heutigen Gesamtablaufs.

Der wiederhergestellte Requestbau mit den stärkeren Prüfungen besteht **173/173 lokale KI-Fälle**
und **35/35 Explorerintegrationsfälle**; seine gesamte Modellausgabe wurde anschließend nicht noch
einmal nativ geprüft. Für v6 sind eigene Modellprozesse, stdio und Diagnoseleser bestätigt geschlossen;
Produktquellen und Modellpins waren während der Probe unverändert. Kein Download und keine Änderung
vorhandener Texte, Freigaben oder Websiteinhalte. Belege liegen im vorhandenen privaten
Bereitstellungsbelegordner als `page-language-native-v6-20261102.json`,
`page-language-native-v6-assessment-20261102.json` und `language-prompt-restoration-20261102.json`.

## Frühere native Modell- und Einrichtungsnachweise

Die native CPU-Probe `data/website/checks/local-ai-http-product-20261031-v8.json` bestätigt den tatsächlichen
Bildlader, FFmpeg, gepinnte Laufzeit-/Modelldateien, HTTP-Worker und die strenge Produktvalidierung:
zwei Bildvorschläge und eine synthetische Quellenprüfung abgeschlossen; alle drei HTTP-Antworten mit
`finish_reason: stop`. 55 Datei-Pins sind frisch geprüft; alle eigenen Kindprozesse und stdio-Handles
sind danach bestätigt geschlossen. Persönliche Profilpfade liegen für diese Probe vollständig in der
eigenen Test-temp-Sitzung. Kein bestehender Entwurf oder Freigabestatus wurde verändert.

Die Vorläufer bleiben unveränderte Fehlerbelege: v4 erhält `description` statt des verlangten Schemas;
v7 belegt nach korrigierter Schemahülle eine bei 192 Tokens abgeschnittene, repetitive Antwort.
Die Generierung nutzt deshalb die von b11960 unterstützte verschachtelte `json_schema`-Hülle und bindet
den Bildtext bereits im Schema auf 1–240 Zeichen, höchstens zwei Hinweise mit je 1–120 Zeichen und
384 Ausgabetokens. Der bestehende nachgelagerte Validator bleibt unverändert; kein Abschneiden,
Schema-Fallback oder automatischer Zweitversuch. 46 gezielte Content-/Worker-/Servicefälle bestehen.
Die Probetexte bleiben redaktionell prüfpflichtig, beispielsweise wegen „auf dem Akropolis“ im Athen-
Vorschlag. Technische Vollständigkeit bedeutet keine fachliche oder sprachliche Freigabe.

Die Fehlerzuordnung unterscheidet inzwischen unerwartetes Prozessende, tatsächlichen Abbruch und
HTTP-/Antwortfehler. Prozessfreiheit und Bereinigung gelten erst nach bestätigtem `close` der eigenen
Handles. Die frühen nativen Abstürze aus v3/v5 bleiben getrennt erhalten; v5 lief in eingeschränkter
Ausführungsumgebung, v6–v8 im normalen nativen CPU-Kontext. Daraus wird keine bewiesene Absturzursache
oder GPU-Abnahme abgeleitet. CPU bleibt der Standard.

Die gemeldete bei null Bytes endende Einrichtung ist auf einen tatsächlich transportkomprimierten
Lizenzabruf zurückgeführt: `fetch` liefert entpackte Bytes, der Header enthält die komprimierte Länge.
Nur bei unkomprimierten Antworten wird diese Headergröße direkt gegen den Datei-Pin geprüft;
entpackte Größenobergrenze, exakte Dateigröße und SHA bleiben in jedem Fall Pflicht. Ein realer kleiner
HTTP-gzip-Gegenlauf sowie Hash-/Übergrößen-/Kurzantwortfälle sind Bestandteil der Cachetests.
Sichere konkrete Einrichtungsfehler werden im Dialog angezeigt. Der vollständige persönliche Download
über den normalen Explorer-Service ist am 31. Oktober um **11:31:06 UTC** abgeschlossen: alle
**3.370.827.340 Bytes** geladen und geprüft, Cache bereit, kein Einrichtungsfehler. Der private Beleg
`data/website/checks/local-ai-real-download-20261031.json` hält den tatsächlichen Fortschritt fest.
Nach regulärem Neustart erzeugt der normale Dialog über **Vorschlag erstellen** einen vollständigen
Bildtext für das Über-uns-Foto (**11:48:38–11:49:12 UTC**). Der Vorschlag erscheint bearbeitbar;
der gespeicherte Text und seine Freigabe bleiben vor und nach der Probe vollständig gleich.
Der eigene Testvorschlag wurde ohne Übernahme geschlossen. Diese zusätzliche Bedienprobe steht in
`data/website/checks/ai-installed-gui-result-20261031.json`; die isolierte CPU-Probe ersetzt sie nicht.

## Umfang und ehrliche Grenze

- Foto-Alternativtext aus serverseitig gebundenen Bildbytes und dem fachlichen Seitenkontext
- Fachlicher Abschnitt ausschließlich aus bereitgestellten Textquellen mit erhaltenen Quellenbezügen
- Hinweise zu einem Entwurf ausschließlich anhand dieser Quellen, einschließlich Widerspruch/
  fehlendem Beleg/Unklarheit; keine umfassende Faktenprüfung oder Wahrheitsgarantie

Jedes Ergebnis bleibt `approved:false`, `transferred:false`, `humanReviewRequired:true` und
`factualGuarantee:false`. Der Kern verändert keine bestehenden Texte, Websitefelder oder Freigaben.
Übernahme in einen bearbeitbaren Entwurf und spätere menschliche Freigabe laufen über die vorhandenen
Root-Workflows. Modelltext ist weder eine Freigabe noch ausführbarer Code oder HTML.

Fehlen Textquellen, wird ohne Modellaufruf `missing-source` zurückgegeben. Ein `intentionallyEmpty`
markierter Zielabschnitt bleibt ohne Modellaufruf bewusst leer. Auch die Negativmeldung eines Modells
belegt keine allgemeine Richtigkeit: „Kein Hinweis“ wird ausdrücklich nicht als Faktenbestätigung angezeigt.
Wörtliche Quellen-/Entwurfszitate werden tatsächlich im bereitgestellten Material gesucht; das verhindert
erfundene Belegstellen, garantiert aber keine fehlerfreie Paraphrase.

## Komponenten und Root-Verdrahtung

```js
let worker;
const cache = createLocalAiCache({
  cacheRoot: path.join(app.getPath("userData"), "local-ai"),
  isWorkerBusy: () => Boolean(worker?.status().busy || worker?.status().ownWorkerActive),
});
worker = createLocalAiWorker({
  cache, mode: "cpu", // "vulkan" ist eine ausdrückliche Geräteeinstellung
  beforeStart: async () => { /* lokale Ressourcensperre/Verfügbarkeit prüfen */ },
});
const localAi = createLocalAiService({ worker, loadImage, loadTextContext, isBindingCurrent });
```

Der Cache ist optional und unabhängig vom Pflichtinstaller. Sein Stamm liegt auf dem lokalen PC unter
dem privaten Geräteprofil, nicht im Websiteartefakt, Git, NAS oder einem gemappten Netzlaufwerk.
Der Kern startet beim Importieren der Module und beim Statuslesen keinen Modellprozess und keinen Download.
`beforeStart` kann einen Start aufgrund der lokalen Arbeits-/Ressourcensituation ablehnen.

Die Job-API:

```js
const job = localAi.suggestAltText({ ownerId, requestId, pageUrl, imageKey, observationHash });
const textJob = localAi.suggestSourceText({ ownerId, requestId, documentId, sectionId });
const reviewJob = localAi.reviewText({ ownerId, requestId, documentId, sectionId, draft });
const snapshot = localAi.get(job.jobId, ownerId);
await localAi.cancel(job.jobId, ownerId);
const ownStatus = localAi.status(ownerId);
await localAi.close();
await cache.close();
```

Die Methoden geben kleine Jobquittungen zurück; Ergebnisse werden über `get()` gelesen. Der Aufrufer
liefert `ownerId` aus der authentisierten Anmeldung, niemals ungeprüft aus dem HTTP-Body. Nur derselbe
Besitzer kann Ergebnis und Abwahl verwenden. `requestId` macht Antwortwiederholungen idempotent; derselbe
Schlüssel mit verändertem Inhalt wird abgewiesen. `requestId` bleibt in der besitzereigenen kleinen
Jobquittung und Statusliste enthalten, damit die UI eine verlorene Startantwort ohne zweite
Modellanfrage wiederfinden kann. Standard: maximal drei laufende/queued Aufträge
zusammen, genau ein aktiver Workeraufruf und höchstens zwanzig erhaltene Jobergebnisse im Speicher.
Nach 60 Sekunden Leerlauf wird der eigene Worker regulär entladen. Ergebnisse sind hier keine neue
dauerhafte fachliche Datenbank; bewusst angenommene Entwürfe speichert Root über den bestehenden Editor.

Im Bildtexteditor öffnet **Lokalen Textvorschlag erstellen** den separaten kompakten Dialog. Das
Öffnen liest nur den Status. Download und Modellauftrag bleiben ausdrücklich gewählte Schritte.
Bild-/Seitenbeobachtung, persönliche Anmeldung und unveränderte Eingabe werden vor Start, Ergebnis
und Übernahme gebunden. **In meinen Textentwurf übernehmen** ändert ausschließlich die ungespeicherte
Eingabe. Speichern, menschliche Freigabe und Squarespace bleiben die vorhandenen getrennten Aktionen.
Ein bearbeiteter noch nicht übernommener Vorschlag wird beim Schließen/Abschlusswächter geschützt.
Einrichtungsanfragen sind auch über einen asynchronen Anmeldeschritt einzeln reserviert; ein anderer
Benutzer kann den laufenden Download nicht abbrechen. Root-/DOMprüfungen und die oben getrennt belegte
native Bedienprobe sind keine allgemeine fachliche oder sprachliche Qualitätsfreigabe der Modelltexte.

### Vertrauenswürdiger Bildlader

`loadImage(request, { signal, ownerId })` liest die tatsächliche aktuelle Bildzuordnung anhand von
Seite/Bildkennung. Keine frei mitgelieferte URL oder lokalen Dateipfade als Downloadquelle übernehmen.
Vorhandene geprüfte Squarespace-Bildvorschau-/Medienwege verwenden. Rückgabe, sinngemäß:

```js
{
  bytes: imageBuffer, mimeType: "image/jpeg", sha256,
  binding: { pageUrl, imageKey, revision },
  context: {
    pageType: "species", title: "Eisvogel", commonName: "Eisvogel",
    coupledCaption: false,
  },
}
```

Alternativ wird die flache Root-Fassade `{bytes,mimeType,sha256,sourceSha256,revision,imageId,pageUrl,context}`
angenommen. `imageId` entspricht `imageKey`; eine angeforderte `observationHash` muss exakt zur gelieferten
`revision` passen. Die Ergebnisbindung enthält sowohl den normalisierten `imageSha256` als auch den
ursprünglichen `sourceSha256` und die aktuelle Inventarrevision.

Unterstützt: JPEG, PNG und WebP, maximal 8 MiB, höchstens 2048 Pixel je Kante und zwei Millionen Pixel.
Größere Originale zuvor über die vorhandenen Medienfunktionen als Vorschau bereitstellen. Die tatsächlichen
Headerdimensionen und der Bytehash werden geprüft. Es wird kein zweiter dauerhafter Website-Fotobestand
angelegt. An das Modell gelangen nur diese Bytes als `data:image/...;base64,...`, keine Quellen-URL,
lokalen Pfade oder fremde `image_url`-Adresse.

Auf Artseiten darf die deutsche Art aus dem Seitenkontext als bekannt gelten. Der Prompt verlangt klare
sichtbare Motive, keine erfundenen Verhaltens-/Ortsangaben und keine wissenschaftlichen Namen. Die
Punktregel wird für neue Vorschläge **außerhalb des Modells** ausschließlich über die vorhandene
`website-alt-policy.mjs` angewandt: kurze gekoppelte Reiseunterseitenbeschriftungen ohne normalen
abschließenden Satzpunkt; Reiseübersichten und andere Texte erhalten ihre Zeichensetzung. Keine neue
Art-/Abkürzungs- oder Bestandsumschreibregel wird eingeführt. Bei gekoppelter Reiseunterseite
liefert `caption` denselben Text; andere sichtbare Beschriftungen werden nicht mit umgeschrieben.
Bestehende Logo-/Dekorativstandards bleiben Aufgabe des vorhandenen Alttextworkflows und benötigen
keine neue Foto-KI-Anfrage.

### Vertrauenswürdige Textgrundlage

`loadTextContext(request, { signal, ownerId, kind })` liest Zielabschnitt, Leerentscheidung und tatsächlich
bereitgestellte Quellen aus dem eigenen fachlichen Bestand. Eine Nutzerbehauptung im Body darf keine
gespeicherte `intentionallyEmpty`-Entscheidung umgehen. Beispiel:

```js
{
  binding: { documentId, revision },
  target: { sectionId, title: "Aussehen", intentionallyEmpty: false },
  sources: [{ id: "A", revision, title: "Quellennotiz", text, url }],
  draft: currentSavedDraft,
}
```

Ein beim Prüfauftrag übergebener begrenzter Editorentwurf wird geprüft, ohne den gespeicherten Text zu
verändern. Quellen und Prüfentwurf zusammen sind auf 8000 Zeichen begrenzt; höchstens zwanzig Quellen.
Jeder generierte Absatz benötigt bekannte Quellen-IDs und tatsächlich vorhandene wörtliche Belegstellen.
Ein gemeldeter Entwurfsbeleg muss im konkreten geprüften Entwurf stehen. Quellenkennung, Titel, Link,
Revision und Belegstellen bleiben am Vorschlag erhalten. Freie Fachprosa ohne Quellen wird nicht erzeugt.

`isBindingCurrent(binding, { ownerId, signal })` prüft nach der Modellantwort die aktuelle Bild-/Abschnitts-
und Quellenrevision. Bei Änderung wird der Job `stale`, ohne Vorschlag in den vorhandenen Text zu übernehmen.
Bei Prüfentwürfen wird zusätzlich `draftSha256` zurückgegeben; Root muss beim Anzeigen/Einfügen eine
inzwischen geänderte Editorfassung berücksichtigen. Loader müssen Abbruchsignale beachten und dürfen
keine privaten Schlüssel oder internen Dateipfade in die Bindungsmetadaten setzen.

## Optionaler Modellcache und Herkunft

`model-lock.json` bindet die bereits vorbereiteten Originale: Qwen3-VL-4B-Instruct Q4_K_M und zugehöriges
F16-mmproj aus dem konkreten Qwen-Commit sowie llama.cpp **b11960** Vulkan-x64 aus dem konkreten Release.
Sechs Originalartefakte mit **3.370.827.340 Bytes** werden optional benötigt. Die vollständige Laufzeit
enthält 53 gebundene Dateien mit 105.017.629 entpackten Bytes. MIT-/Apache-/LLVM-Beilagen bleiben erhalten.
Kein anderes Modell und kein beweglicher `latest`-Bezug wird heimlich gewählt.

```js
const optionalState = await cache.status(); // kleine Metadaten, kein Modellstart
const sizesAndPins = cache.getLock();
await cache.download({ confirmed: true, signal, onProgress });
// Oder bewusst vorhandene nachgewiesene Originale importieren:
await cache.importPrepared({ confirmed: true, preparedReportPath, expectedReportSha256 });
cache.cancelInstall();
```

Root muss vor Download/Import die ausdrückliche Nutzerwahl verwenden; ein Statusabruf genügt nicht.
Die vorhandene Vorbereitung kann über ihren gebundenen Bericht importiert werden. Jede Zielkopie wird
erneut gehasht, die Quellen vor/nach der Kopie über ihren Dateistand gebunden und unverändert belassen.
Alte Belege werden nicht überschrieben. Ein bereits gültiger identischer Bestand wird wiederverwendet;
ein veränderter/unvollständiger unbekannter Bestand wird zur gezielten Prüfung erhalten und nicht still ersetzt.

Nur die gepinnten offiziellen URLs sind Downloadquellen. Begrenzte Anbieterweiterleitungen werden
zugelassen; endgültige Bytes müssen trotzdem exakt Größe und SHA-256 treffen. Fortschrittsdaten nennen
Artefakt und Mengen, keine signierten Weiterleitungs-URLs. Temporäre Archive werden nach erfolgreichem
Entpacken entfernt. Die ZIP-Verarbeitung benötigt nur Node: Central Directory, Pfad-/Link-/Doppelprüfung,
begrenztes Deflate, CRC-32 und SHA-256 jeder erwarteten Laufzeitdatei. Python, npm und eine globale
Programminstallation werden dafür nicht benötigt. Der eigene Cache wird bei laufendem Worker geschützt.

Vor dem eigenen Workerstart prüft `resolveVerified()` die vollständigen Originaldateien einschließlich
Modell-/Projektorhashes und aller 53 Laufzeitdateien. Zusätzliche Laufzeitdateien werden abgewiesen.
Diese bewusste Prüfung benötigt Lesezeit, startet aber keinen Modellprozess selbst. Keine umfassende
Hardware-/Geschwindigkeitsgarantie aus den früheren wenigen Inhaltsproben ableiten.

## Lokales HTTP-Protokoll und regulärer Abschluss

Der Worker startet nur auf Anforderung, standardmäßig mit vollständig abgeschaltetem GPU-Offloading
(`--device none`, null GPU-Layer, kein Op-/mmproj-Offloading). Vulkan ist eine ausdrückliche Geräteeinstellung.
Es werden nur eigene ChildProcess-Objekte gehalten; kein Beenden nach Prozessname oder fremder PID.

Die API bindet ausschließlich an `127.0.0.1`, verwendet einen zufälligen Port und pro Start einen zufälligen
ephemeren Authschlüssel. Der Schlüssel liegt kurz in einer eigenen privaten Datei mit `--api-key-file`,
steht nicht im Prozessargument selbst und wird nach bestätigter Bereitschaft entfernt. Er bleibt intern im
Worker und gelangt weder in Status, Renderer, Logs noch externe Dienste. Unnötige Credentials-/Proxy-/
HF-/LLAMA-Umgebungsvariablen werden nicht an den Prozess vererbt. Offline, kein Web-UI, kein Agent/
Werkzeugzugriff; stdout/stderr werden nicht zur Antwortgewinnung oder Weitergabe verwendet.

Bereitschaft kommt über `/health` und `/v1/models` mit konkretem zufälligem Modellalias und bestätigter
Bildfähigkeit. Antworten kommen ausschließlich über `/v1/chat/completions` mit `response_format`-JSON-Schema,
ohne Stream, begrenzten Tokens, Größen und Zeitlimits. Sowohl äußere Antwort als auch fachliches JSON
werden geprüft. Trunkierte oder ungültige Ergebnisse werden nicht als fertige Vorschläge übernommen.

Der exakte b11960-Quellstand bietet seinen Managed-Child-Kontrollkanal: `LLAMA_SERVER_ROUTER_PORT`
aktiviert den eigenen Monitor; die stdin-Zeile `cmd_router_to_child:exit` ruft den regulären Shutdownhandler
auf. Dieser Kontrollkanal wird ausschließlich zum Beenden des eigenen Workers verwendet; keine Modell-
antwort wird aus stdout extrahiert. Unerwartetes Eltern-EOF wird vom Modellserver ebenfalls behandelt.
Es gibt keinen erfundenen HTTP-`/shutdown`-Endpoint und keinen als regulär ausgegebenen Windows-SIGTERM.

Cancel/Timeout bricht HTTP einschließlich Antwortbody ab und beendet den eigenen Worker regulär.
Ein neuer Auftrag während einer laufenden Leerlaufentladung wartet auf deren Abschluss. Wird der eigene
Prozessabschluss nicht bestätigt, bleibt die konkrete Prozessreferenz als `close-blocked` erhalten.
Es wird kein weiterer Worker daneben gestartet und kein fremder Prozess beendet. Root muss diesen
Zustand als laufende eigene Arbeit in seinen Schließschutz aufnehmen; er darf nicht als „fertig geschlossen“
überstimmt werden. `localAi.close()` und anschließend `cache.close()` im regulären Serverabschluss abwarten.

## Tests und Quellen

```powershell
node --test --test-isolation=none species-explorer/local-ai/cache.test.mjs species-explorer/local-ai/worker.test.mjs species-explorer/local-ai/service.test.mjs
```

Die Produkttests verwenden eigene `scripts/test-temp.mjs`-Sitzungen, synthetische kleine GGUF-/ZIP-/
Laufzeitdateien, Fake-HTTP und Fakeprozesse. Kein echtes Modell, GPU-Lauf oder nativer Build ist dafür nötig.
Sie prüfen vollständige Installation/Import/Hash-/ZIP-Grenzen, Abbruch bis zum Bodyreader, private
Schlüsselbehandlung, eigenen Prozessabschluss, Queue/Owner/Bindungen, Quellen-/Leerregeln und Punktlogik.
Die tatsächliche CPU-HTTP-/JSON-Schema-/Bild-/Managed-Child-Kompatibilität ist für die drei oben genannten
v8-Aufträge separat nachgewiesen. Das ersetzt weder GPU-, Zielgeräte- noch vollständige redaktionelle
Abnahme aller Motive. Die persönliche Einrichtung wird unabhängig von den vorbereiteten Fixturdateien geprüft.

Primärquellen am 31. Oktober für genau diesen Stand geprüft:
[b11960-Server-README](https://raw.githubusercontent.com/ggml-org/llama.cpp/b11960/tools/server/README.md),
[Managed-Child-Header](https://raw.githubusercontent.com/ggml-org/llama.cpp/b11960/tools/server/server-common.h),
[Managed-Child-Abschluss](https://raw.githubusercontent.com/ggml-org/llama.cpp/b11960/tools/server/server-common.cpp),
[Serverhandler](https://raw.githubusercontent.com/ggml-org/llama.cpp/b11960/tools/server/server.cpp).
Die konkreten offiziellen Modell-/Laufzeit-URLs und Hashes stehen ausschließlich in `model-lock.json`.
