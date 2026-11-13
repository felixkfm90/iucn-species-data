# Artseiten-Entwurfskern

Stand: 2. November 2026. Dieser Ordner enthält den Fachkern und seine isolierten Tests.
Die Explorer-Oberfläche ist im neuen Quellstand über Session, Workspace und vertrauenswürdige
Art-/Medienadapter angeschlossen. Durchgehende Integration und native Bedienung werden getrennt geprüft;
der durchgehende automatische Squarespace-Anlegeablauf bleibt offen. Der Fachkern veröffentlicht keine Seite.
Die Session kann einen eingerichteten Anlegeadapter über denselben persönlichen Squarespace-Browser
wie die Bildtexte ansprechen; der bisherige GalleryDriver meldet diese Fähigkeit weiterhin als nicht verfügbar.

## Vorlagen und Inhalt

Die beiden Varianten `fn-compact-20261031` und `fn-extended-20261031` stammen aus den bereits gebundenen
öffentlichen Eisvogel- und Gepardseiten. `templates.mjs` nennt URL, Abrufzeit, SHA-256 und Reihenfolge.
Der Titel verwendet H3, Fachabschnitte H4. Allgemein enthält den vorhandenen äußeren `species-output`
mit `species-info`, `species-taxonomy`, `species-status` und `species-sound`; die Karte verwendet den
vorhandenen `map-wrapper` mit `map-output`. Die Bildergalerie folgt der Karte. Kopf-/Fußbereich und
vorhandene Website-Skripte gehören zum bestehenden FN-Seitenrahmen.

Fachtexte werden ausschließlich geliefert. Zulässig sind reine Textabsätze, Listen und Zwischenüberschriften
H5/H6, keine eingegebenen HTML-/Skriptblöcke. Vorhandene redaktionelle Abschnitte können umgeordnet und
umbenannt werden; die gebundenen Allgemein-/Kartenmodule behalten ihre äußeren Positionen. Eine dritte
Gliederung oder zusätzliche Fachabschnitte benötigt später eine beobachtete Vorlage beziehungsweise einen
bewussten Ausbau, keinen still erfundenen Standard. Aus Dateinamen entstehen keine Fachangaben.

Ein leerer Fachabschnitt blockiert die technische Endfreigabe bis zur getrennten ausdrücklichen
Bestätigung `confirmEmpty`. Auch `requested:false` überspringt diese Bestätigung nicht. Die bestätigte
Leerstelle bleibt leer; geänderter Abschnittstitel oder Text entwertet ihre Bestätigung. Nicht angeforderte
Galerie und vorhandene fehlende Ton-/Spektrogrammdateien werden nicht als erfundene Medien ergänzt.
Normales Porträt und Karte sowie für das FN-Laufzeitmodul bereitgestellte Artgrunddaten werden geprüft.

## Einbindung und Zuständigkeiten

`createPageAuthoringService` benötigt ausschließlich vertrauenswürdige, im Main-/Serverkontext erzeugte
Adapter. Kein Renderer darf diese Adapter oder ihre Rückgaben selbst bereitstellen.

| Abhängigkeit | Vertrag |
| --- | --- |
| `actorAuthority.resolve(context,operation)` | Aktuell verifizierte Person `{id,projectId,role,online,channel?}`. Rollen `admin`, `publisher`, `contributor`, `reader`. `channel:'cms-adapter'` ausschließlich im echten Adapterweg vergeben. Onlineoperationen müssen auch die aktuelle serverseitige Berechtigung bestätigen. |
| `speciesAuthority.snapshot(context,slug)` | Angelegte Art mit wissenschaftlichem/deutschem Namen, Taxonomie, Allgemeindaten, Status, gebundener Revision/`dataSha256`, `runtimeReady` und normalen Assetmetadaten. Optionales `assetName` bindet den tatsächlichen bestehenden Artassetordner unabhängig vom Anzeigenamen; es darf nur aus der vertrauenswürdigen Artquelle stammen. Fehlende Daten offen zurückgeben; `runtimeReady` bedeutet tatsächliche Bereitstellung für die bestehenden FN-Module. |
| `mediaFacade.describe(context,assetId)` | Projektgebundene Metadaten `{id,projectId,sha256,bytes,mimeType,attribution}` zu einer verwalteten Datei. Auch offline müssen bekannte Metadaten erreichbar bleiben. |
| `mediaFacade.read(context,assetId)` | Ausschließlich verwaltete lokale/gespeicherte Bytes; keine Rendererpfade, keine frei gewählten URLs. Das Modul prüft Länge, Hash und Dateisignatur. Die Fassade muss Größen-/Bildgültigkeitsprüfungen bereits bei der Bereitstellung erledigen. |
| `targetAuthority.checkNew(context,path)` | Optional für redaktionelle Arbeit; zwingend für `prepareCmsPlan` und `beginCmsAttempt`. Lesende frische Zielbeobachtung `{path,exists:false,parentPath,parentExists:true,online:true,observationId,checkedAt}`. Vorhandenen übergeordneten Websitebereich tatsächlich bestätigen; höchstens zwei Minuten alt, kein unbekannter Erfolg. Keine Zielseite anlegen. |
| `repository` | Dedizierter persistierter CAS-/Artefakt-/CMS-Journalspeicher. Mitgeliefert: `createSqlitePageAuthoringRepository({filename,localStorageConfirmed:true})`. Nur eigener lokaler Profilpfad, kein NAS-SQLite und keine vorhandene fremde Datenbank. |

Normale Assets folgen unverändert `species-assets/<gebundenes assetName>/` mit
`portrait.webp`, `map.jpg`, `sound.mp3`, `credits.json` und `spectrogram.webp`. Galeriepositionen verwenden
stabile Verwendungs-ID plus verwaltete Asset-ID, Hash, bearbeitbare Alternativtexte und Beschriftungen.
Diese Texte werden unverändert erhalten, ohne automatischen Satzpunkt. Ein neuer Upload muss zuerst
über die vertrauenswürdige Medienfassade verwaltet werden. Das ist keine Upload- oder Pfadlese-API.
Dateigröße ist je Asset auf 32 MiB, die Galerie auf 200 Positionen, die lokale Vorschau auf insgesamt
96 MiB eindeutige gebundene Medien und ein Seitenobjekt auf 2 MiB Metadaten begrenzt.

Ohne explizites `assetName` bleibt die bisherige Ableitung mit `sanitizeAssetName(deutscher Name)`
beziehungsweise dem wissenschaftlichen Namen unverändert und kanonisch kompatibel. Eine ausdrückliche
Bindung wird als einzelne sichere Dateikomponente geprüft; Traversal, Pfadtrenner, ungültige Zeichen und
reservierte Gerätenamen sind unzulässig. Ein geänderter Anzeigename benennt keinen bestehenden Ordner um.

## Fachoperationen

Alle Änderungen erhalten eine eindeutige `mutationId`; wiederholte identische Aufträge sind persistent
gebunden. Eine andere Eingabe unter derselben Kennung wird abgelehnt. `expectedRevision` bezeichnet
immer den exakten lokalen CAS-Versionshash, nicht eine fremde Shared-Service-UUID.

| Methode | Verhalten |
| --- | --- |
| `createDraft(context,{draftId,mutationId,templateId,slug,parentPath,title?})` | Nur online und redaktionell berechtigt; bindet die angelegte Art, Vorlage und syntaktisch zulässigen Zielbereich und legt einen leeren Entwurf an. Keine Website-Zielbeobachtung oder Behauptung eines bereits freien Pfads. |
| `getDraft(context,draftId)` | Eigener Projektstand, bearbeitbare Felder, nur zur aktuellen Revision aktive Endfreigabe, getrenntes CMS-Journal. `published:false` bleibt ausdrücklich wahrheitsgemäß. |
| `saveDraft(context,{draftId,mutationId,expectedRevision,document})` | Redaktionelle Bearbeitung auch bestehender Offlineentwürfe; echte SQLite-CAS, keine Websiteaktion. `editableDocument` liefert ausschließlich bearbeitbare Felder. |
| `refreshSpecies(context,{draftId,mutationId,expectedRevision})` | Ausdrückliche Onlineaktion mit Redaktionsrecht und CAS; liest ausschließlich die vertrauenswürdige Artgrundlage neu. Seitentitel, Fachtexte, Bildfolge, Beschriftungen und bewusste Leerentscheidungen bleiben erhalten. Tatsächliche Änderungen erzeugen eine neue Entwurfsrevision mit inaktiven früheren Vorschauen/Freigaben; unveränderte Grundlagen erzeugen keine zusätzliche Fassung. |
| `confirmEmpty(context,{draftId,mutationId,expectedRevision,sectionId,confirmed:true,reason})` | Bindet bewusste Leerstelle an Abschnittshash und tatsächliche Person. |
| `preview(context,{draftId,mutationId,expectedRevision})` | Geprüfte Bytes, statische HTML-Vorschau, vollständige Seitenstruktur und persistierter Prüfbericht. Vorschau führt weder FN-Laufzeitskripte noch Websitezugriffe aus. |
| `approve(context,{draftId,mutationId,expectedRevision,previewId,reportHash,review,missingAltAcknowledged})` | Nur Admin/Publisher online; `review:{texts:true,images:true,layout:true}` bestätigt menschliche Endprüfung. Bericht und Dateien werden erneut gebunden. Noch fehlende Alttexte benötigen die exakte bestätigte Liste ihrer Bild-IDs. |
| `prepareCmsPlan(context,{draftId,mutationId,expectedRevision,approvalId})` | Erneute Datei-/Zielprüfung; Plan 2 für eine neue **unveröffentlichte** Seite einschließlich wirklicher FN-Codeblöcke, geordneter Galerieassetreferenzen und separat gebundener Rückleseerwartung. Keine erfundene CMS-API oder Selektoren. |
| `beginCmsAttempt(context,{draftId,mutationId,expectedRevision,planId})` | Persistiert einmaligen Ausführungsauftrag vor einer echten CMS-Handlung. Kein automatischer zweiter Versuch, auch nach Neustart nicht. |
| `dispatchCmsAttempt(context,{mutationId,attemptId,expectedStateRevision,dispatchId})` | Nur vertrauenswürdiger Adapter der freigebenden Person; journalisiert Beginn vor externem Schreiben. Führt selbst nichts im CMS aus. |
| `recordCmsOutcome(context,{attemptId,receipt})` | Nur vertrauenswürdiger Adapter. Neue Quittung 2 enthält die tatsächliche Editorbeobachtung und Bildzuordnung; der Kern prüft Werte und berechnet beide Ergebnisprüfsummen selbst. Exaktes Duplikat ist idempotent, widersprüchliche Quittung wird ungewiss. |

`preview.report` enthält Inhalts-, Bild-, Vorlagen-, Artgrunddaten-, Struktur-, Vorschau- und Berichtshash.
Die Freigabe bindet die vollständige Revision. Jede relevante Änderung macht sie inaktiv; alte
Artefakte bleiben historisch erhalten. Dateidrift ohne Entwurfsänderung blockiert trotzdem Endfreigabe
beziehungsweise CMS-Plan. Vor Endfreigabe, CMS-Plan und CMS-Versuch wird außerdem die tatsächliche
Artgrundlage frisch mit der eingefrorenen Entwurfsbindung verglichen; Drift blockiert mit
`species_source_changed`. Nach einer solchen Abweichung muss die Artgrundlage ausdrücklich aktualisiert,
die neue Vorschau geprüft und erneut freigegeben werden. Lesen historischer Fassungen bleibt möglich;
es gibt kein automatisches Umschreiben. Ein technischer Bericht ist keine fachliche oder modellgestützte Abnahme:
`editorialReview:'human-required'`, `modelReview:'not-performed'`, `publicVerification:'not-performed'`.

Die Vorschau escaped Texte und Quellangaben, verwendet ausschließlich geprüfte Raster-/Ton-Data-URLs,
blockiert Skripte, Netzverbindungen, Frames und Formulare per CSP und führt normale FN-Codeblöcke nicht
aus. Sie ist eine prüfbare lokale Zusammensetzung, keine pixelgenaue Squarespace-Darstellungsabnahme.

## Vollständige Planbindung und tatsächliche Rücklesung

Der volle `structureHash` bindet weiterhin die lokale Artgrundlage, Originaldateien, internen
Bildverwendungen und Quellenbelege. Solche internen Kennungen und Dateihashes stehen nicht vollständig
im Squarespace-Editor. Ein Adapter darf sie daher nicht aus dem Plan in eine angeblich beobachtete
Struktur zurückkopieren. Neue Pläne der Version 2 binden zusätzlich `readback:{schemaVersion:1,
expectation,expectationHash}` aus `cms-readback.mjs`.

Die Erwartung enthält ausschließlich rekonstruierbare Seitenwerte: Pfad und Titel, geordnete
Überschriften, Absatz-/Listenstruktur, vollständige Codeblöcke, sichtbare Quellen und die geordneten
Bildtexte samt sichtbaren Credits. Absatzstruktur und Leerzeichen bleiben bedeutungstragend;
nur Zeilenenden werden vereinheitlicht. Interne Quellen-ID oder Quellen-SHA können den vollständigen
Plan ändern, obwohl der sichtbare Quellenwortlaut unverändert bleibt.

Eine neue Erfolgsquittung der Version 2 benötigt den vollständigen Beobachtungskörper `readback`
samt eigener Beobachtungskennung. `page:{id,path,title,enabled:false,saved:true,reopened:true}`
belegt die tatsächlich gelesene Seite nach Speichern und Wiederöffnen. Die geordneten Blöcke müssen
zur Erwartung passen. Für jede Galerieverwendung bindet `mediaBindings` zusätzlich Originalkennung,
Hash, Byteumfang und Format an die tatsächlich verwendete CMS-Asset- und CMS-Eintragskennung.
Mehrfach verwendete Dateien bleiben getrennte Positionen. Ein Uploadbeleg behauptet dabei keine
unveränderten von Squarespace zurückgelieferten Originalbytes. Credits dürfen nicht allein als
unsichtbare lokale Metadaten erhalten bleiben.

Der Kern berechnet aus den vollständigen Daten `readbackStructureHash` und `mediaBindingsHash`.
Ein vom Adapter eingereichter passender Hash ohne Beobachtung genügt nicht. Ein fehlgeschlagener
oder ungewisser Abschluss enthält entweder einen vollständigen geprüften Beleg oder ausdrücklich
`pageId:null,unpublished:null,readback:null,mediaBindings:[]`; die beiden abgeleiteten Hashwerte
sind dann ebenfalls `null`. Halbe Erfolgsbelege werden nicht gespeichert. Keine automatische
Wiederholung, Veröffentlichung oder Löschung folgt daraus.
Bei verlorener Projektverbindung darf dieselbe aktuell lokal gebundene Person ausschließlich einen
solchen ungewissen Ausgang speichern. Erfolg, anderer Ergebnisstatus und alte Quittungen benötigen
weiterhin eine bestätigte Onlineberechtigung. Ein Personen-/Projekt-/Rollenwechsel erlaubt keinen
Abschluss über einen künstlich online gehaltenen früheren Akteur.

Die lesende Squarespace-Beobachtung vom **2. November** bestätigt am vorhandenen Eisvogel:
Die Seite liegt unter **Nicht verlinkt**, ihr Schalter **Seite aktivieren** steht trotzdem auf an.
Der Editorhinweis erklärt deaktivierte Seiten als für Besucher nicht aufrufbar. Nicht verlinkt ist
deshalb kein ausreichender Nachweis für unveröffentlicht. Ein späterer Anlegeadapter muss den
deaktivierten Zustand vor dem Eintragen von Inhalten und erneut nach dem Speichern bestätigen.
Die Seitenvorschau blieb bei dieser Prüfung leer; eine Neuanlageauswahl konnte nicht nachgewiesen
werden. Keine Seite, Einstellung oder Bilddatei wurde für die Beobachtung geändert.

Alte Pläne und Quittungen bleiben nach ihrem historischen Vertrag sicherbar. Neue Starts benötigen
Plan 2. Ein bereits gespeicherter alter Erfolg kann ausschließlich als exakt vorhandene Quittung
idempotent erneut gelesen werden, auch nach einer späteren widersprüchlichen Quittung; er reaktiviert
keinen Erfolg. Neue Hash-only-Erfolge alter Pläne werden abgewiesen. Das ist ein lokaler
Kern-/Sicherungsanschluss; tatsächlicher Browservollzug und gemeinsamer Serverbeleg bleiben gesondert.

Der Nachlauf vom **2. November** reproduziert den unzureichenden Hash-only-Erfolg am unveränderten
Git-Kern ohne tatsächliche Editorbeobachtung. Der neue Vertrag besteht mit **80/80 gezielten Fällen**,
anschließend **221/221 Artseiten**, **101/101 Sicherungsfällen**, **34/34 Explorerintegration**,
**337/337 Oberflächenabläufen** und **7/7 Routerfällen**, jeweils ohne Skips. In der ersten gezielten Serie
betrafen drei Fehlerfälle denselben Testaufbau: Bearbeitbare Abschnitte enthalten keine `kind`-Angabe;
die Auswahl erfolgt jetzt über die vorhandene Abschnittskennung. Es wurde kein Produktprüfwert
abgeschwächt. Syntax, Stil, lokale Verweise und Größenbudget sind geprüft.
Diese Fälle verwenden eigene SQLite-/HTTP-Fixtures und ausdrücklich synthetische Editorbeobachtungen;
sie belegen keinen realen Squarespace-Anlege-, Upload- oder Speicherlauf.

## Anschluss an den persönlichen Squarespace-Browser

Der Node-Anschluss `explorer-cms.mjs` verwendet das vorhandene persönliche Repository und die
bestehende Projektserie. Der Server reicht dieselbe geborgte Browserinstanz an Bildtextdienst und
Artseitenbereich; ihr Lebenszyklusbesitzer bleibt der Bildtextdienst. Die Session schließt nur eigene
Artseitenaufträge durch Abbruch und Abwarten. Es entsteht keine zweite Browserwarteschlange.

Drei ausdrückliche POST-Aktionen nehmen ausschließlich gespeicherte Bindungen entgegen.

| Aktion | Eingabe |
| --- | --- |
| `begin-cms-attempt` | `sourceScope,draftId,expectedRevision,planId,mutationId` |
| `create-unpublished-page` | `sourceScope,draftId,attemptId,expectedStateRevision` |
| `recheck-squarespace-save` | `sourceScope,draftId,attemptId,expectedStateRevision` |

Der Renderer liefert weder Seitenplan, Dateipfad, freien Upload, Beobachtung, Rolle noch
`cms-adapter`-Kanal. Neue Browseraufträge benötigen die bestätigte Node-Fähigkeit
`pageAuthoringAvailable:true`. Sie setzt die drei tatsächlichen Drivermethoden `checkNewTarget`,
`prepareUnpublishedPage` und `createUnpublishedPage` voraus. Der GalleryDriver bietet die lesende
Adress- und Katalogprüfung und den lokal geprüften Anlegeablauf. Die Freischaltung der Neuanlage
im normalen Explorer hängt von der vollständigen Bedienprüfung im echten CMS ab.

Der bestehende Driver bietet mit `inspectPageAuthoring` einen getrennten rein lesenden Beobachter
aus `desktop/squarespace-page-observation.mjs`. Er liest nur das tatsächlich gebundene Hauptdokument,
den eindeutigen direkten Inhaltsframe, Collection-/Blockkennungen, beobachtete Textstruktur und
Galeriequellen. Die beiden tatsächlich beobachteten CDN-Routen `content/v1/<Bibliothek>/<UUID>`
und `content/v2/namespaces/website/libraries/<Bibliothek>/<UUID>` erhalten dieselbe Assetbindung;
unbekannte Bibliotheken oder Bildtransformationen werden nicht gleichgesetzt. Die aktuelle Reihenfolge
im Galerie-Manager bleibt ohne unabhängig beobachtete Abschnittsbindung ein getrennter Teilbefund.
Unbekannte Einstellungen, gespeicherte/wiedergeöffnete Zustände sowie getrennte Alt-/Caption-/Credit-
und Codefelder bleiben ausdrücklich unbekannt. Ein Timeout liefert keine erfolgreiche leere Seite;
ein eventuell noch ausstehender DOM-Leser wird als solcher benannt. Der Beobachter ergänzt weder
Solltexte aus dem Plan noch eine CMS-Erfolgsquittung und schaltet keine Anlegefähigkeit frei.

Die Browsermethoden `checkNewTarget(path,options)`, `createUnpublishedPage(planPayload,options)`
und `recheckUnpublishedPage(planPayload,options)` teilen die Squarespace-Anmeldung und dieselbe
`activeJob`-Sperre mit den Bildtextübernahmen.
Vor dem Journalstart läuft im reservierten Browserauftrag die ausschließlich lesende Drivermethode
`prepareUnpublishedPage(webContents,plan,{signal})`. Sie erhält weder Schreibhook noch Medienleser,
Journalbindung oder Rollenrückruf. Ein fehlender Editor oder noch nicht unterstützte Felder müssen
hier anhalten. Die reine Rückgabe `{ready:true,planHash,targetPath,targetObservation}` bindet
Editorbereitschaft und eine neue lesende Zielbeobachtung an denselben Auftrag. Die Beobachtung
muss im reservierten Browserlauf mit eigener Kennung entstehen. Sie bestätigt den exakten Websitebereich und den freien
Zielpfad. Eine belegte oder unklare Adresse, ein fehlender Bereich oder die Beobachtung aus dem Plan
stoppen vor dem Journalstart. Erst die vollständige Rückgabe und eine danach erneut bestätigte
Anmeldung erlauben den Journalhook. Abbruch oder
Fensterschließen warten auf den tatsächlichen Leserabschluss. Der persönliche Versuch bleibt bei
einem Fehler vor Dispatch unverändert vorbereitet; ein späterer Versuch ist ausschließlich eine
erneute ausdrückliche Benutzeraktion. Die Bereitschaft ist kein Inhalts-, Speicher- oder Erfolgsnachweis.

Wird der Entwurf nach einem Stopp vor dem Schreibbeginn korrigiert, kann dieselbe berechtigte Person
nach Vorschau und Freigabe den vorbereiteten Auftrag ausdrücklich auf die aktuelle Fassung umstellen.
Dafür muss der frühere Auftrag weiterhin den Status **vorbereitet** haben. Ein protokollierter
Schreibbeginn oder eine Quittung sperren die Ersetzung. Der bisherige Plan und seine Vorbereitung
bleiben im persönlichen Journal nachvollziehbar. Der alte Auftragsstand verliert seine Schreibfreigabe.

Der neue Beobachter besteht mit **16/16 synthetischen DOM-/Anschlussfällen**. Der gemeinsame Nachlauf
mit Browser, vorhandenen Galerieabläufen, persönlichem SQLite-CMS-Journal und Desktopintegration
besteht mit **171/171 Fällen**, ohne Fehler oder Skips. Drei gezielte neue Bereitschaftsfälle scheitern
vor der Korrektur: fehlender Leser, noch leerer Editor und fremde/unvollständige Bereitschaft. Im ersten
gemeinsamen Nachlauf scheitert zusätzlich eine Test-Proxyattrappe bereits an der JavaScript-internen
Promise-Auflösung; der korrigierte Test lässt nur deren zwingende `then`-Abfrage zu und weist weiterhin
jeden Zugriff auf Proxy-Datenfelder zurück. Es wurde keine Produktprüfung abgeschwächt.
Die integrierte SQLite-Gegenprobe bestätigt einen unverändert vorbereiteten Versuch ohne Quittung
nach Lesefehler und genau einen Dispatch nach einem neuen ausdrücklichen Aufruf. Der Beleg
`cms-observation-integration-final-20261102.log` liegt im vorhandenen privaten Prüfbereich.
Das ist keine native vollständige Artseiten-/Speicher-/Veröffentlichungsabnahme.

Die Artseitensteuerung belegt kurze Projektprüfphasen; der lange Browserlauf liegt außerhalb
`withClient`, damit sein Rückruf keine verschachtelte Projektserie blockiert. `beforeWrite` speichert
den Dispatch erst innerhalb des reservierten Browserauftrags. `assertCurrent` prüft weiter die
persönliche Bindung; `readMedia(assetId)` liefert nur die tatsächlich gebundenen geprüften Galeriebytes.
Unmittelbar vor Dispatch prüft der Kern außerdem die wirklichen Medienbytes und die aktuelle
Artgrundlage erneut. Eine seit Plan-/Versuchsvorbereitung geänderte Datei belässt den Auftrag vorbereitet.
Der Driver liefert ausschließlich echte `readback`-/`mediaBindings`-Werte zurück. Erst der Kern
berechnet daraus den bestätigten Abschluss. Ein Fehler nach Dispatch erhält bei weiter belegter
persönlicher Bindung einen ungewissen Ausgang; ist diese nicht mehr prüfbar, bleibt der Schreibbeginn
offen protokolliert. Ein abgewiesener Browserauftrag davor lässt den Versuch vorbereitet. Kein zweiter Aufruf legt
automatisch eine weitere Seite an. Der lokale CMS-Beleg wird nicht als gemeinsamer Serverbeleg ausgegeben.

Die erste erneute rein lesende Chrome-Probe vom **2. November** zeigt eine leere Seitenvorschau.
Die Plus-Schaltfläche öffnet in dieser Probe keine Neuanlageauswahl; der Browser protokolliert dabei
`ensureFrameInitialized already set`. Eine native Gegenprobe stoppt vor Bedienung, weil die
Computersteuerung die aktuelle Browseradresse nicht sicher bestimmen konnte. Kein Seiteninhalt,
Upload oder Websiteparameter wurde geändert. Die konkreten Anlege-/Upload-/Speicherbedienelemente
sind in diesem früheren Teilschritt nicht als Grundlage eines echten Drivers nachgewiesen.

Nach Felix' anschließender Priorisierung gelingt die neue reale Chrome-Probe über den unterstützten
Browserzugang mit sichtbarer URL. Die vorher gestoppte native Fensterauswahl wird nicht umgangen.
Die Seitenverwaltung und Neuanlageauswahl laden; über **Nicht verlinkt → neue Seite → Klassischer
Editor → Eine leere Seite hinzufügen** wird ausschließlich die eigene Seite
**Arten-Explorer Funktionsprüfung 2026-11-02** angelegt. Ihr Slug ist
`/arten-explorer-funktionsprufung-2026-11-02`. Squarespace legt die leere Seite zunächst aktiv an;
vor jeder Inhaltseingabe wird sie deaktiviert, gespeichert und in erneut geöffneten Einstellungen
als deaktiviert bestätigt. Ein späterer automatischer Driver muss deshalb zunächst einen neutralen
eigenen Platzhalter anlegen und den deaktivierten Zustand vor Arttext, Bildern und endgültigem
Artseitentitel bestätigen. **Nicht verlinkt** allein genügt weiterhin nicht.

Ein unabhängiger öffentlicher Browser zeigt für den gespeicherten Slug die erwartete Anzeige
**Seite nicht gefunden**. Dies belegt die Besuchersperre der deaktivierten Seite; der Inhaltseditor
wird innerhalb der angemeldeten Verwaltung geprüft. Der zunächst leere Frame und ein ebenfalls
leerer Lesevergleich am vorhandenen Eisvogel bleiben frühere Teilbeobachtungen.

Nach Felix' manueller Bedienrückmeldung ist der Editor tatsächlich erreichbar. Die eigene Seite trägt
die beobachtete CMS-Kennung `6ae89f789cf13b0c388e4ccf`. Über **Abschnitt hinzufügen → Klassischer
Editor → Leeren Abschnitt hinzufügen** wird ein eigener Textabschnitt angelegt. Dessen sichtbarer
Editor ist ein `contenteditable`-Textfeld mit Rolle `textbox`. Neutraler Prüftext für Aussehen und
Lebensraum wird eingegeben und über **Speichern** abgeschlossen; danach ist Speichern deaktiviert.
Nach **Beenden** ist der Text vollständig in der Verwaltungsvorschau sichtbar, bei weiterhin
**Seite · Deaktiviert**. Ein erneuter Einstieg über Bearbeiten reagiert zunächst zeitweise nicht;
nach regulärem Neuladen bleibt der Frame zunächst leer. Die spätere Folgebeobachtung zeigt denselben
gespeicherten Text ohne erneute Eingabe wieder vollständig; danach lässt sich der Editor öffnen.
Die Ursache und die tatsächliche Ladezeit sind damit noch nicht bestimmt. Reguläres HTML-Einfügen
in das eigene Textfeld erhält die tatsächliche Gliederung: Titel als `h3`, Aussehen/Lebensraum als
`h4` und die beiden Fachtexte als `p`. Diese Formatierungsprobe wird ebenfalls gespeichert;
**Speichern** wird wieder deaktiviert. Der vollständige automatische Artseiten-/Wiederleseabschluss
bleibt offen; den anschließenden Bildnachlauf beschreibt der folgende Absatz.
Kein Inhalt einer vorhandenen Seite wird geändert. Screenshots und konkrete Beobachtungen liegen
privat im bestehenden `data/website/checks/nas-implementation-20261101/deployment`-Belegbereich.

Der folgende tatsächliche Galerienachlauf lädt zwei selbst erzeugte neutrale PNGs auf genau diese
deaktivierte Prüfseite hoch. Die nächste Browserprobe findet beide Bilder und ihre vollständigen
Beschreibungen im Galerieeditor wieder. CMS-Eintragskennung und Asset-UUID sind getrennt erfasst;
die Uploadadresse wechselt nach dem Speichern von `content/v2` nach `content/v1`, während die
Asset-UUID erhalten bleibt. Ein späterer Adapter darf deshalb nicht allein den vollständigen
Upload-URL-String als bleibende Bildidentität verwenden. Die sechs mit der gewählten Galerievorlage
angelegten Musterbilder bleiben erhalten; es erfolgt keine Löschung.

Die beiden eigenen Bilder lassen sich über den tatsächlichen Galerie-Sortiergriff mit Leertaste,
Pfeiltasten und erneut Leertaste umordnen. Die horizontale Pfeiltaste wechselt zur Nachbarposition;
Pfeil-auf springt in dieser mehrspaltigen Darstellung eine Zeile. Nach Schließen des Galerieeditors
zeigt der Inhaltsframe die geänderte Reihenfolge, während das äußere **Speichern** deaktiviert bleibt.
Es wird deshalb kein tatsächlich nicht erfolgter Speicherklick behauptet. Nach regulärem **Beenden**
und vollständigem Neuladen bleibt der Vorschauframe in dieser Probe leer; der erneute Editorzugang
gelingt nicht. Ein unabhängiger Aufruf des deaktivierten Slugs in derselben angemeldeten Chrome-Sitzung
führt zur Verwaltungsstartseite. Die Seitenaktivierung ist in erneut geöffneten Einstellungen weiterhin
aus. Dauerhafte Reihenfolge nach Neuladen, angezeigte Beschriftungen, getrennte Alt-/Caption-Felder,
sichtbare Credits und vollständige Rücklesung sind damit noch nicht bestätigt.
Der neue private Teilbeleg `cms-upload-order-probe-20261102.json` hält erfolgreiche Schritte und diese
offenen Grenzen getrennt fest; frühere Belege werden nicht umgeschrieben.

Die abgestimmte Folgeprobe am **3. November** startet in einem frischen, bereits angemeldeten
Verwaltungsreiter. Die Vorschauleiste meldet **Seite · Veröffentlicht**, während die Seiteneinstellungen
für den exakt passenden Titel und Slug **Seite aktivieren** ausgeschaltet und **Diese Seite ist
deaktiviert** anzeigen. Ein unabhängiger HTTP-Aufruf ohne Squarespace-Anmeldung liefert **404**.
Für die Seiteneinstellung ist der gespeicherte Schalter maßgeblich. Die Vorschauleiste allein und
die eingetragene Frame-Adresse liefern keinen Nachweis über den Seiten- oder Editorzustand.
Nach **Bearbeiten** bleibt der Inhalt der Prüfseite in dieser Probe weiterhin leer. Damit bleiben
Reihenfolge, Bildtexte und Wiederlesung nach dem Neuladen offen. Die Probe verändert keine Inhalte
oder Einstellungen. Der private Beleg heißt `cms-reopen-observation-20261103.json`.

Der lokale Beobachter liest den gebundenen Inhaltsframe zweimal und prüft den Verwaltungsweg am
Ende erneut. Verlassene Verwaltung und geänderter oder entleerter Inhalt verwerfen die Beobachtung.
Ändert sich nur der getrennte Galeriedialog, verwirft der Leser dessen Reihenfolge. Drei gezielte
Gegenproben reproduzieren die Fehler vor der Korrektur. Der Nachlauf umfasst **147/147** gezielte
Browser-, Galerie- und Beobachtungsfälle, **299/299** Desktopfälle, **250/250** Artseitenfälle und
**41/41** Explorerintegrationen. Die Anlegefähigkeit bleibt bis zum tatsächlichen Driver offen.

Der anschließende lokale Lesepfad kann bei fest vorgegebenem Pfad und bekannter Seitenkennung bis
zu 30 Sekunden auf den Inhaltsframe warten. Ohne diese Bindung bleibt es bei einer Einzelbeobachtung.
Der Leser wiederholt nur vorübergehend leere oder noch nicht angezeigte Zustände. Fremde Seiten,
mehrdeutige Frames und eine geänderte Verwaltung brechen die Beobachtung ab. Nach Abbruch oder
Zeitüberschreitung bleibt eine noch laufende DOM-Ausführung für weitere Beobachtungen desselben
Fensters gesperrt, bis sie tatsächlich beendet ist. Diese Wartephase erteilt weder Schreibfreigabe
noch bestätigt sie Speichern, Deaktivierung oder Wiederöffnen. Der lokale Test bildet den verzögerten
Frame nach. **153/153** gezielte Browser- und Galeriefälle sowie **305/305** Desktopfälle bestehen.
Die entsprechende Probe mit dem echten Squarespace-Inhalt steht weiter aus.

Die nächste abgestimmte Leseprobe am **3. November** bestätigt im geöffneten Einstellungsdialog
den genau passenden Slug und die ausgeschaltete native Checkbox **Seite aktivieren**. Die sichtbare
Beschriftung ist über `aria-labelledby` gebunden. Auch der reguläre **Vorschau**-Weg liefert in
dieser Sitzung keinen Inhaltsframe mit Artikeldaten. Der eigene Prüfreiter ist wieder geschlossen.
Der private Strukturbeleg heißt `cms-settings-and-rendered-markup-20261103.json`.

Der lokale Leser unterstützt daraufhin zwei weitere Teilbeobachtungen. `view:"settings"` prüft den
bereits offenen Dialog zweimal und bindet ihn an den vorgegebenen Slug. Mehrdeutige Steuerelemente,
widersprüchlicher Status und eine angebotene aktive Speicheraktion liefern keinen Befund. Das Ergebnis
steht getrennt in `pageSettings`; `page.enabled`, `page.saved` und `page.reopened` bleiben unbekannt.
Für den Inhaltsframe unterscheidet der Leser Eingabefelder von angezeigten Squarespace-Textblöcken.
Die angezeigte Struktur ist am öffentlichen [Eisvogel-Referenzprofil](https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/alcedoatthis)
beobachtet. Nur eindeutig gebundene Textblock-Container mit sichtbaren unterstützten Elementen werden
gelesen. Der an der öffentlichen Seite beobachtete Blockaufbau ist damit lokal prüfbar. Seine
Rücklesung auf der deaktivierten Prüfseite und die vollständige Artseitenanlage bleiben offen.
**158/158** gezielte Browser- und Galeriefälle sowie **310/310** Desktopfälle bestehen.

Felix bestätigt als normale Bedienwege sowohl die leere Seite als auch eine Kopie einer vorhandenen
Seite. Für gleichartige Artseiten kann eine deaktivierte Vorlage den Aufbau erleichtern. Die Wahl und
der tatsächliche sichere Kopierweg sind noch keine Treiberfunktion. Bei einer Kopie müssen Titel,
Adresse, Artbezüge, Bilder und Bildtexte vollständig zum neuen Entwurf passen; eine kopierte Seite
darf nicht allein wegen **Nicht verlinkt** als unveröffentlicht gelten.

Der vorbereitete interne Journalbezug verbindet den Browserstart mit dem tatsächlich dauerhaft
gespeicherten Dispatch. Der Kern liefert Projekt-, Versuchs- und Dispatchkennung, Planhash, Zielpfad
und einen daraus abgeleiteten neutralen Platzhaltertitel ausschließlich aus dem bestätigten
`beforeWrite`-Aufruf. Der Browser akzeptiert keinen direkt eingesetzten Bezug. Er prüft Ziel und
vollständigen Planinhalt nach dem Hook erneut und gibt nur die geprüfte Bindung an den Driver weiter.
Der echte Anlegetreiber bleibt offen.

Der Browseranschluss bereitet vor dem Journalstart eine feste Folge für den Squarespace-Editor vor.
Titel, Fachtexte, Listen und Quellenangaben werden aus der gespeicherten Rückleseerwartung als
formatierte Einfügefragmente aufgebaut. Sonderzeichen werden als Text behandelt. Die beiden
bekannten FN-Funktionsblöcke und die gebundene Galerie bleiben eigene Schritte an ihrer vorgesehenen
Position. Abweichungen bei Ziel, Blockfolge, Funktionscode oder Zahl der Galeriebilder stoppen vor der
Vorbereitung im Browser. Lesende Vorbereitung und späterer Schreibtreiber erhalten dieselbe
unveränderliche Folge. Eingabe, Speichern und Wiederöffnen dieser Folge in Squarespace stehen aus.
Die lokale Gegenprobe umfasst **254/254 Artseitenfälle** und **313/313 Desktopfälle**.

Die Zielprüfung vom 10. November trennt öffentliche Erreichbarkeit und Belegung in der
Verwaltung. Die öffentliche Elternseite **Heimische Tierwelt** antwortete mit HTTP 200,
der erwarteten kanonischen Adresse und einer Squarespace-Seitenkennung. Der bekannte
deaktivierte Prüfslug und ein neuer Testpfad antworteten beide mit HTTP 404. Der öffentliche
Leser bescheinigt deshalb ausschließlich die Nichterreichbarkeit des Ziels und die bestätigte
Elternseite. Er sendet nur zwei begrenzte GET-Anfragen ohne Cookies an den festen FN-Ursprung.
Der native Inhaltsablauf verlangt diesen Befund vor der ersten Blockanlage und nach Speichern,
Wiederöffnen und erneuter Bestätigung der ausgeschalteten Seite. Ein unerwartetes öffentliches
Ergebnis stoppt die Anlage oder lässt ihren Abschluss offen.

Die angemeldete Verwaltung enthält zwei sichtbare Einträge namens **Heimische Tierwelt**.
Die beobachteten Seitenbaumzeilen enthalten Titel und Bedienelemente, aber keinen belastbaren
Slug. Im regulären Einstellungsdialog des Eisvogels stehen der gespeicherte vollständige Slug
und der passende Vorschaupfad. Ein Namensvergleich im Seitenbaum genügt deshalb nicht, um eine
freie Zieladresse zu bestätigen. Die Probe öffnete außerdem den Anlagekatalog unter **Nicht
verlinkt** und schloss ihn ohne Auswahl. Eine Startoption für eine deaktivierte Seite wurde dabei
nicht beobachtet. Squarespace beschreibt den standardmäßig aktiven Start neuer Seiten.
Die Prüfung der Admin-Belegung nutzt deshalb den unten beschriebenen Suchweg. Der neutrale
Anlegetreiber bleibt offen.
Privater Beleg `cms-target-authority-live-20261110.json`.
[Squarespace-Hilfe zur Seitenaktivierung](https://support.squarespace.com/hc/en-us/articles/206543067-Enabling-and-disabling-pages)

Die zweite Browserprobe öffnete die Einstellungen der eigenen deaktivierten Prüfseite. Der
bereits belegte Eisvogel-Slug ließ sich dort vorübergehend eingeben. Das Feld blieb gültig und
**Speichern** blieb verfügbar. Die Probe verwarf die Eingabe und bestätigte danach den ursprünglichen
Slug und die Deaktivierung erneut. Privater Beleg `cms-draft-settings-controls-live-20261110.json`.

Der lokale Treiber für die Einstellungen verlangt dieselbe Seitenkennung im Vorschaurahmen und
den exakten neutralen Titel aus dem Journal. Er speichert zuerst die Deaktivierung für sich und
liest sie aus einem neu geöffneten Dialog zurück. Erst danach darf er Seitentitel, Navigationstitel
und Zielslug eintragen. Dazu benötigt er vor der Eingabe und erneut vor dem Speichern jeweils einen
frischen Nachweis der freien Adresse in der Verwaltung. Für die Inhaltsbearbeitung verlangt er
anschließend den gespeicherten Zielslug, beide Titel und die Deaktivierung in einem erneut geöffneten
Dialog derselben Seite. Die Ablaufproben laufen lokal. Die neutrale Neuanlage und der echte
Speichernachlauf fehlen für die Freigabe im Explorer.

Die eingebaute Seitensuche findet den vollständigen Eisvogel-Slug auch beim Einstieg mit
eingeklapptem Ordner sowie die deaktivierte Prüfseite unter **Nicht verlinkt**. Der
noch unbelegte Testslug meldet **Keine Ergebnisse**, der vollständige Pfad des Websitebereichs
liefert Treffer. Die Probe schloss die Suche und den eigenen Reiter wieder. Privater Beleg
`cms-admin-slug-search-live-20261110.json`.
[Squarespace-Hilfe zur Suche im Seitenpanel](https://support.squarespace.com/hc/en-us/articles/217644727-The-Pages-panel)

Die lokale Adressprüfung kombiniert die öffentliche Elternseite und Ziel-Nichterreichbarkeit mit
der angemeldeten Suche. Sie wechselt zweimal zwischen dem Kontrolltreffer für den Elternpfad und
der gebundenen Leermeldung für den vollständigen Zielslug. Jeder Treffer am Ziel bleibt ein
Grund zum Anhalten, da auch Titel in die Suche einfließen. Veraltete Ergebnisse, Ladezustände,
offene Einstellungsdialoge oder laufende Seitenbearbeitungen erlauben keinen positiven Befund.
Der Adapter erstellt die Zielbeobachtung erst nach der bestätigten Rückkehr zur geschlossenen
Suche. Die Probe belegt keine Reservierung der Adresse.

Der Browseranschluss für den Schreibauftrag führt die erneute Zielprüfung in einem eigenen,
kurz sichtbaren Fenster der bestehenden FN-Anmeldung aus. Nur der laufende Auftrag kann es für
seinen gebundenen Zielpfad öffnen. Das Fenster lädt die feste Seitenverwaltung, prüft die
Anmeldung und schließt nach der Suche. Der bestehende Editor wird dabei weder neu geladen noch
geschlossen. Er erhält den Fokus zurück, solange er weiterhin zum Auftrag gehört. Der
Speichertreiber prüft anschließend den geöffneten Einstellungsdialog erneut.
Alte oder wiederholte Beobachtungen, ein anderes Ziel, ein Verlust der Anmeldung, ein
Fensterschluss und ein Abbruch stoppen den Ablauf. Die lokale Browserprüfung deckt auch
konkurrierende Aufträge sowie „Squarespace verbinden“ während der Suche ab.
Das Fokusverhalten im installierten Explorer und die durchgehende Neuanlage sind noch im
echten Ablauf zu prüfen.

Die lesende Browserprobe für die Neuanlage am 10. November öffnete über **Nicht verlinkt** den
Dialog **Seite hinzufügen**. Der Wechsel zum klassischen Editor behielt denselben Dialog bei.
Die klassische Auswahl enthält die eigene Aktion **Eine leere Seite hinzufügen**. Die Probe
schloss die Auswahl vor dieser Aktion und bestätigte den unveränderten Vorschaupfad.
Die Zeile der vorhandenen Prüfseite lieferte dabei keine Seitenkennung. Die konfigurierte
Vorschauadresse allein genügt zur Identifikation einer neu gespeicherten Seite deshalb nicht.
Privater Beleg `cms-neutral-creation-catalog-live-20261110.json`.
[Squarespace-Hilfe zur leeren Seite](https://support.squarespace.com/hc/en-us/articles/206543687-Layout-pages)

Die lokale Vorbereitung prüft die gebundene Inhaltsfolge, die freie Zieladresse und genau
diesen Katalog. Sie meldet Bereitschaft erst nach dem bestätigten Schließen im selben
Verwaltungsdokument. Die Vorbereitung liefert einen Bereitschaftsbefund. Der separate
Anlageschritt löst den Leerseiten-Klick aus. Sobald die neutralen Einstellungen geöffnet
sind, kann der Treiber die Seitenkennung
aus der tatsächlich geladenen Vorschau ermitteln. Dazu müssen Seitentitel, Navigationstitel,
Slug, Einstellungsdialog und Kennung in zwei Lesungen in denselben Dokumenten übereinstimmen.
Eine leere Vorschau, ungespeicherte Einstellungen oder ein Wechsel des geladenen Dokuments
verhindern die Zuordnung. Der Befund identifiziert die vorliegende Seite. Die Neuanlage
benötigt zusätzlich den Nachweis des Seitenzuwachses durch den eigenen Klick.

Für die Prüfung unmittelbar vor der Neuanlage leitet der Treiber die neutrale
Adresse aus dem gestarteten Journalauftrag ab. Er prüft diese Adresse ohne Anmeldung
und sucht den Slug zweimal in der Squarespace-Verwaltung. Dazwischen muss die Suche
einen Treffer im bekannten Zielbereich zeigen. Ein Treffer zum neutralen Slug oder
ein unklarer Zustand stoppt die Vorbereitung. Der lokale Test belegt auch, dass eine
öffentlich belegte Adresse die Suche gar nicht erst öffnet.

Der Treiber prüft unmittelbar vor dem Leerseiten-Klick erneut die Auftragsfreigabe
und dieselbe Position im gebundenen Katalog. Sobald er den Klick versucht, bleibt
der Versuch für denselben Journalauftrag gesperrt. Der lokale Test bestätigt den
Stopp bei geänderter Position oder entzogener Freigabe. Nach dem Klick bleibt die
Anlage offen, bis Squarespace die neue Seite und ihre Kennung zeigt.

Die freigegebene manuelle Browserprobe vom **11. November** bestätigt den Übergang. Ein Klick
auf **Eine leere Seite hinzufügen** fügt unter **Nicht verlinkt** genau eine bearbeitbare Zeile
**Neue Seite** hinzu. Währenddessen kann die bisherige Vorschau sichtbar bleiben. Enter bestätigt
den neutralen Namen. Die neue leere Seite erscheint anschließend mit dem zugehörigen Slug und
zunächst als **Veröffentlicht**. Nach Deaktivieren, Speichern und Wiederöffnen war
**Seite aktivieren** ausgeschaltet. Die geladene Vorschau lieferte die Seitenkennung
`6af48209f064221b1e6a524c`. Der öffentliche Aufruf ohne Anmeldung lieferte danach HTTP 404.
Die leere Seite bleibt als Prüfseite erhalten. Privater Beleg `cms-neutral-page-live-20261111.json`.

Der folgende Textschritt bindet das formatierte Fragment an denselben Planhash und Zielpfad.
Vor dem Einfügen muss der aufrufende Seitentreiber die Schreibfreigabe für die deaktivierte Seite
und genau diesen Block erneut bestätigen. Der Schritt prüft die Seitenkennung, den Inhaltsframe
und den eindeutig leeren Editor. Das Einfügeereignis führt HTML und Klartext direkt zum Textfeld.
Die Windows-Zwischenablage ist dafür entbehrlich. Danach zählt der tatsächlich erneut gelesene
Inhalt des Textblocks. Ein übergangener, veränderter oder zweifelhafter Text bleibt offen.
**186/186** gezielte lokale Fälle und **316/316** Desktopfälle bestehen. Eine versteckte Electron-Probe mit lokalem Editor bestätigt
das einmalige Einfügen und die genaue Rücklesung von Überschrift, Absatz, Sonderzeichen und Zeilenumbruch.
Ein zweiter Versuch am nun befüllten Block wird abgewiesen. Der private Beleg heißt
`cms-text-input-local-20261103.json`. Der vollständige Anlegetreiber muss den Textschritt noch mit der
tatsächlichen Seitendeaktivierung, den übrigen Blöcken sowie Speichern und Wiederöffnen verbinden.
Der lokale Rücklesevergleich belegt den Editorzustand, ohne eine CMS-Quittung zu erzeugen.

Die weitere lesende Squarespace-Probe vom **3. November** bestätigt den genauen Titel und Slug
der deaktivierten Prüfseite sowie deren konfigurierten Vorschaupfad. Der sichtbare Seiteneintrag
liefert keine belastbare CMS-Kennung. Das tatsächlich geladene Vorschaufenster blieb auch nach
**Bearbeiten** bei `about:blank`. Der Befund liegt privat unter
`cms-settings-preview-binding-live-20261103.json`.

Der lokale Übergang von der Zuordnung zum Inhaltseditor bindet den tatsächlich wieder geöffneten
sauberen Einstellungsdialog an denselben Seitenauftrag. Nach dem Schließen prüft der Treiber den
Verwaltungsstand, den Zielpfad, den Klickpunkt und die Freigabe erneut. Bei eindeutig eingestelltem
Pfad darf **Bearbeiten** ein vorübergehend leeres Inhaltsfenster laden. Die Inhaltsübergabe setzt
den geladenen Editor mit passender Seitenkennung, leerem Inhaltsartikel und deaktiviertem
Speichern voraus. Ein Dialog-, Seiten- oder Dokumentwechsel hält den Ablauf an.

Für die Kontrolle nach dem Wiederöffnen öffnet der Treiber die Einstellungen derselben Seite
frisch. Seitentitel, Navigationstitel, Slug und ausgeschaltete Aktivierung müssen vollständig
mit der gespeicherten Zuordnung übereinstimmen. Die öffentliche Nachprüfung ist an dasselbe
Verwaltungsdokument gebunden. Die Übergänge sind lokal geprüft, einschließlich einer nach
**Bearbeiten** geladenen Vorschau und einer dauerhaft leeren Vorschau. Der durchgehende Ablauf
auf der FN-Website bleibt eine eigene Probe.

Der Texttreiber verlangt daher zwei Beobachtungen. Zuerst müssen der unveränderte Einstellungsdialog,
der ausgeschaltete Seitenschalter, der Titel und der konfigurierte Vorschaupfad zusammenpassen.
Die daraus abgeleitete lokale Bestätigung gilt nur für denselben Browser, Seitenauftrag und die
vorgegebene Seitenkennung, maximal 60 Sekunden. Nach Schließen des Dialogs muss der geladene
Editor die Seitenkennung tatsächlich zeigen. Vor der Eingabe prüft der Treiber die Gültigkeit
der Bestätigung und beobachtet den Editor erneut. Bei einem offenen Dialog stoppt er.
Die Gegenproben bestehen mit **188/188** gezielten und **318/318** Desktopfällen. Die lokale
Chromium-Probe bestätigt den Stopp bei offenem Dialog oder fehlender gültiger Bestätigung sowie
das anschließende einmalige Einfügen mit Rücklesung. Der private Nachweis heißt
`cms-disabled-text-local-20261103.json`. Die tatsächliche Eingabe und der gespeicherte Entwurf
in Squarespace bleiben gesondert zu belegen.

Der Browser-Treiber kann den Textabschluss aus dem freigegebenen Plan ableiten. Vor **Speichern**
verlangt er die frische Deaktivierungsbestätigung, einen passenden Editor ohne offenen Dialog
und den vollständigen geordneten Text aus dem Plan. Der aufrufende Anlegetreiber muss außerdem
den restlichen Seiteninhalt und den Schreibauftrag prüfen. Nach einem einzelnen Speicherklick
wartet der Treiber auf die gespeicherte Editoranzeige, beendet die Bearbeitung und lädt die
Seitenverwaltung neu. Erst eine tatsächlich neu geladene Verwaltung, der wieder geöffnete Editor
mit denselben Textblockkennungen und Texten sowie eine neue Einstellungsprüfung bestätigen den
Textabschluss. Bleibt das Ergebnis nach dem Klick unklar, erfolgt kein weiterer Speicherklick.
Der Textabschluss enthält keine vollständige CMS-Quittung für Funktionsblöcke und Galerie.
In der isolierten Chromium-Probe wird der eingegebene Text einmal im lokalen Testdienst gespeichert
und aus einem frisch geladenen Inhaltsframe zurückgelesen. Der zweite Einstellungsdialog bestätigt
die Deaktivierung erneut. **191/191** gezielte Fälle und **321/321** Desktopfälle bestehen. Der private
Beleg heißt `cms-text-save-reopen-local-20261103.json`.

Der Speicherabschluss vergleicht zusätzlich die sichtbare Bilderfolge der einen vorgesehenen
Galerie vor dem Speichern und nach dem Wiederöffnen. Dafür müssen die dem Anlegetreiber
vorliegenden Uploadzuordnungen an jede freigegebene Bildverwendung samt Dateigröße, Format und
Prüfwert passen. Der Browser vergleicht die stabile CMS-Assetkennung. Die beobachteten
CDN-Routen `content/v1` und `content/v2` dürfen sich dabei unterscheiden. Weitere Galerien,
zusätzliche Bilder, falsche Reihenfolge und uneindeutige Kennungen stoppen den betreffenden
Abschluss. Wiederverwendung derselben CMS-Datei an mehreren Stellen braucht zusätzlich die
Eintragskennungen aus dem Galerieeditor. Die sichtbare Bilderfolge allein belegt weder die
unabhängigen Bildtextfelder noch die tatsächlich beim Anbieter gespeicherten Originalbytes.

Der Speicherabschluss gleicht auch die Position der beiden sichtbaren FN-Funktionsblöcke mit
dem freigegebenen Plan ab. Ihre Squarespace-Hülle entspricht dem öffentlich beobachteten Aufbau
der Eisvogel-Seite. Der Abgleich akzeptiert darin nur die beiden bekannten Vorlagenfragmente
für Artinformationen und Karte. Unerwartete, fehlende oder verschobene Blöcke stoppen vor dem
Speichern. Nach dem Wiederöffnen müssen Blockfolge und Kennungen erneut übereinstimmen. Das
belegt die erkennbare Struktur der Vorschau. Der Nachweis des gespeicherten Codes im CMS-Feld
und die Funktionsprüfung der Module auf der Artseite bleiben eigene Schritte.
Im isolierten Chromium-Test liefert ein lokaler Testdienst nach genau einem Speichervorgang
erneut Text, beide Funktionsblöcke und die Galerie in derselben Reihenfolge. **196/196** gezielte
Fälle und **326/326** Desktopfälle bestehen. Privater Beleg `cms-module-order-local-20261103.json`.

In der späteren lesenden Chrome-Probe vom **3. November** wurde der Editor der deaktivierten
Prüfseite nach einer Verzögerung sichtbar. Beim Wiederöffnen im Artseitentreiber darf eine einzige
noch leere Vorschau mit passendem konfiguriertem Pfad deshalb einmal über **Bearbeiten** geöffnet
werden. Bevor der Inhalt zählt, müssen der geladene Frame und die Seitenkennung übereinstimmen.
Ein weiterhin leerer Editor lässt den bereits begonnenen Speichervorgang offen.

Auf der bestehenden Eisvogel-Seite zeigte Squarespace den gespeicherten Quelltext für die
Artinformationen im HTML-Modus. Die sechs sichtbaren CodeMirror-Zeilen stimmten exakt mit der
FN-Vorlage überein. Der lokale Leser bindet den HTML-Dialog an die gewählte Seite, den eindeutig
ausgewählten Codeblock und die bekannte Art- oder Kartenvorlage. Dialog und Blockauswahl werden
zweimal gelesen. Abweichender Quelltext, unvollständige Zeilen und Anzeige als Quelltext lassen
die Prüfung offen. Der Leser gibt nur die Übereinstimmung und die Zuordnung zurück.
**199/199** gezielte Fälle, **329/329** Desktopfälle und die lokale Chromium-Probe bestehen.
Der private Nachweis heißt `cms-code-source-local-20261103.json`.

Der lokale Speicherabschluss öffnet nun die beiden gebundenen Codefelder jeweils vor dem
Speicherklick und nach dem frischen Wiederöffnen. Er öffnet nur den nachweislich ausgewählten
Block und schließt das gelesene Feld mit **Esc**, solange Dialog und Block weiterhin zusammenpassen.
Vor dem Speichern und vor der Abschlussbestätigung liest er die restliche Seitenstruktur erneut.
Abweichender Code stoppt vor dem Speichern oder lässt den einzelnen bereits ausgeführten
Speichervorgang ungeklärt. Der Browser öffnet den betroffenen Dialog dabei zur Prüfung und lässt
ihn bei einem uneindeutigen Ergebnis stehen.
Der isolierte Chromium-Lauf bestätigt beide Quelltexte vor und nach genau einem Speichervorgang.
**200/200** gezielte Fälle und **330/330** Desktopfälle bestehen. Der private Nachweis heißt
`cms-code-roundtrip-local-20261103.json`. Die automatische Bedienung dieser beiden Felder im
echten Squarespace-Editor sowie der vollständige Anlegelauf sind gesondert zu belegen.

Die lesende Probe im echten Eisvogel-Galerieeditor fand 39 Bildverwendungen und pro ausgewähltem
Bild genau ein Eingabefeld **Beschreibung**. Das zweite Textarea-Element ist ein technisches
Hilfsfeld. Squarespace verwendet die Beschreibung als Alternativtext und bei eingeblendeten
Beschriftungen für den sichtbaren Bildtext. Die Beschriftungsanzeige gilt für den Galerieabschnitt.
[Squarespace-Hilfe zu Galerieabschnitten](https://support.squarespace.com/hc/en-us/articles/360035636332-Gallery-sections)

Der lokale Abschluss prüft den nativen Galerieabschnitt nur für eindeutig darstellbare Freigaben.
Entweder bleiben sämtliche Beschriftungen leer oder sie entsprechen durchgehend dem Alternativtext.
Die Beschreibung muss einzeilig sein. Für diesen Weg gilt vorsorglich die auf FN-Reisegalerien
beobachtete Grenze von 250 Zeichen. Unterschiedliche Bildtexte, Bildnachweise und ausdrücklich
dekorative Bilder benötigen eine eigene Darstellung und bleiben für den nativen Abschnitt offen.
In der Vorschau müssen die Alt-Attribute und die tatsächlich sichtbaren Bildunterschriften vor
dem Speichern und nach dem Wiederöffnen jeweils separat zur Freigabe passen. Die Prüfung der
gespeicherten Beschreibung im Galerieeditor und die durchgehende Übernahme stehen weiterhin aus.
Im isolierten Chromium-Lauf stimmen Alternativtexte und Beschriftungen beider Testbilder vor und
nach genau einem Speichervorgang überein. **203/203** gezielte Fälle und **333/333** Desktopfälle
bestehen. Der private Beleg heißt `cms-native-gallery-text-local-20261103.json`.

Für getrennte Bildtexte gibt es zusätzlich eine lokal geprüfte Darstellung in einem
Squarespace-HTML-Block. Sie verwendet nur zuvor gebundene Bilder aus der FN-Medienbibliothek.
Jede Position enthält ein Bild, bei Bedarf eine eigene sichtbare Beschriftung und einen eigenen
Bildnachweis. Für ein bewusst dekoratives Bild erzeugt die Vorlage ein ausdrücklich leeres
`alt`-Attribut. Die Reihenfolge ergibt sich aus den freigegebenen Bildpositionen. Das Raster
passt sich der Breite an, die Vorlage benötigt dafür nur HTML und feste Layoutangaben.
Der Speicherabschluss erkennt genau diesen Block und prüft die Bildkennungen und alle vier
Angaben in der gerenderten Vorschau. Die Zuordnung des HTML-Blocks ersetzt keine vom Anbieter
beobachtete Bildverwendungskennung. Der gebundene Upload und der vollständige Durchlauf im echten
Squarespace-Editor stehen noch aus.
[Squarespace-Hilfe zu HTML-Blöcken](https://support.squarespace.com/hc/en-us/articles/206543167-Add-custom-code-to-a-page-with-code-blocks)

Im isolierten Chromium-Durchlauf stimmen für zwei Testbilder Reihenfolge, getrennte Beschriftung,
Bildnachweis und der leere Alternativtext des dekorativen Bildes vor und nach einem einzigen
Speichervorgang. Bei 320 Pixeln Vorschau-Breite hat das Raster eine Spalte ohne horizontalen
Überlauf. Für scrollbare Vorschauen verwendet die Klickzuordnung die vollständige Frame-Breite.
**205/205** gezielte Fälle und **335/335** Desktopfälle bestehen. Der private Beleg heißt
`cms-independent-gallery-local-20261103.json`.

Der lokale Galerie-Schritt öffnet den zuvor gebundenen, leeren HTML-Codeblock. Die deaktivierte
Seite, der gewählte Block und die aktuelle Freigabe werden unmittelbar vor der Eingabe erneut
geprüft. Das erzeugte Galerie-HTML wird einmal als Text eingegeben. Nach dem Schließen bestätigt
der Treiber Bildreihenfolge, Alternativtexte, Beschriftungen und Bildnachweise aus der Vorschau.
Bei vorhandenem Code, verlorener Freigabe oder uneindeutigem Ergebnis stoppt der Schritt.
Der isolierte Chromium-Durchlauf führt die echte Texteingabe aus, prüft das Raster und bestätigt
die Galerie nach genau einem anschließenden Speichervorgang erneut. **207/207** gezielte Fälle
und **337/337** Desktopfälle bestehen. Privater Beleg `cms-gallery-input-local-20261103.json`.

Die Blöcke für Artinformationen und Karte nutzen denselben abgesicherten Eingabeweg für leere
HTML-Felder. Der Treiber übernimmt die beiden festen FN-Vorlagen aus dem gebundenen Plan.
Vorhandener Inhalt, ein doppelter Funktionsblock oder eine geänderte Freigabe stoppen die Eingabe.
Nach dem Einfügen prüft der Treiber zuerst den Quelltext im geöffneten Feld und anschließend
die Kennung des gerenderten Blocks. Bei unklarem Ergebnis bleibt der Entwurf offen.
Die isolierte Chromium-Probe mit Text und Galerie führt drei native Codeeingaben aus, speichert
einmal und bestätigt beide Quelltexte, Blockreihenfolge, Bildtexte und Deaktivierung nach dem
frischen Wiederöffnen. **186/186** gezielte Browserfälle und **339/339** Desktopfälle bestehen.
Privater Beleg `cms-module-input-local-20261103.json`. Die Anlage der Blockstruktur, der Medienupload
und der durchgehende Lauf im tatsächlichen Editor stehen aus.

Der folgende lokale Lauf verbindet diese Schritte für eine bereits vorbereitete, deaktivierte Seite.
Der Leser ordnet die leeren Text- und HTML-Felder über ihre sichtbaren Blockkennungen und die
Reihenfolge im Editor der gebundenen Fassung zu. Verdeckte oder zusätzliche Blöcke, vorhandener
Inhalt, eine fremde Galeriekennung und eine geänderte Reihenfolge stoppen den Ablauf. Zwischen den
Eingaben prüft der Treiber die Blockfolge und den erwarteten Füllstand erneut. Der gemeinsame
Speicherabschluss verlangt dieselben Kennungen vor dem Speicherklick und nach dem Wiederöffnen.
Nach dem Ermitteln der Speichern-Schaltfläche fragt der Treiber die Freigabe nochmals ab.
Die lokale Gegenprobe zieht sie während der Schaltflächensuche zurück und bestätigt den Stopp
vor dem Speichern.
Galerieseiten benötigen hierfür vorab zugeordnete Bild-Uploads. Seiten mit bewusst leerer Galerie
verarbeiten die übrigen Blöcke ohne Galeriefeld.

Die isolierte Chromium-Probe führt den gebündelten Ablauf mit Text, beiden Funktionsblöcken und
Galerie aus. Sie bestätigt einen Speicherklick, die erneute Rücklesung und die Deaktivierung.
**190/190** gezielte Browserfälle und **343/343** Desktopfälle bestehen. Privater Beleg
`cms-prepared-page-local-20261103.json`. Das Anlegen der leeren Editorblöcke und die Beschaffung
der gebundenen Bild-Uploads bleiben eigene Schritte vor diesem Ablauf.

Der vorbereitete Seitenablauf kann die Galeriezuordnung jetzt selbst aufbauen, wenn ein
gebundener Upload-Schritt zur Verfügung steht. Vor jeder Übergabe vergleicht er Dateigröße und
SHA-256 mit dem freigegebenen Plan. Jede Verwendung erhält einen eigenen Upload-Dateinamen.
Die beobachtete CMS-Quittung muss zu diesem Namen, zur FN-Medienbibliothek und zu einer eindeutigen
Bildverwendung gehören. Der Seitenzustand und die Freigabe werden vor und nach jeder Übergabe
geprüft. Eine abweichende Quittung stoppt vor der Texteingabe und vor dem Speichern.
Der lokale Test verwendet einen simulierten Upload-Schritt. Die früheren neutralen Testbilder
zeigen, dass Squarespace selbst mit `format=original` andere Dateibytes ausliefern kann. Deshalb
prüft der Ablauf die Originaldatei bei der Übergabe und die Bildkennung im Editor getrennt.
Die Bedienung des tatsächlichen Upload-Feldes und das automatische Anlegen leerer Blöcke bleiben offen.

Vor und nach der Dateiübergabe liest der Explorer die Bilderliste im gebundenen Galerie-Editor
selbst. Er verlangt genau einen neuen Eintrag mit dem erwarteten Upload-Dateinamen. Die bisherigen
Einträge müssen ihre Identität und relative Reihenfolge behalten. Eine leere oder wechselnde
Beobachtung bestätigt keinen Upload. Für das eingefügte Bild wird die beobachtete Squarespace-
Adresse ohne die Größenangabe des Vorschaubilds verwendet. Der lokale Test prüft auch zusätzliche,
vertauschte und fehlende Einträge. Bei der erneuten lesenden Chrome-Probe am 3. November blieb das
Inhaltsfenster der ausgewählten deaktivierten Prüfseite leer. Das echte Dateifeld war nicht erreichbar.

Eine spätere lesende Probe am 3. November lädt die deaktivierte Prüfseite erneut. Der Manager
zeigt acht gespeicherte Bilder in stabiler Reihenfolge, darunter die beiden neutralen Prüfbilder
in der zuvor geänderten Reihenfolge. Der einzige Galeriedialog besitzt ein eigenes verstecktes
Dateifeld für PNG, GIF, JPEG und WebP. Der Editor meldet danach keine offenen Änderungen.
Die privaten Beobachtungen liegen unter
`data/website/checks/nas-implementation-20261101/deployment/cms-native-upload-20261102/`.

Der vorbereitete Seitenablauf kann das Dateifeld jetzt an die passende Vorschau, denselben
Galeriedialog und die unveränderte Bildliste binden. Er setzt pro Schritt genau eine geprüfte
Datei und wartet auf einen neuen Eintrag mit dem erwarteten Dateinamen. Wenn die Zuordnung fehlt,
bleibt der Vorgang offen. Chromium bestätigt die bytegenaue `FileList` und genau ein
`change`-Ereignis in einem künstlichen Dialog. Der private Beleg
`cms-gallery-file-input-local-20261103.json` bindet Quellstand und Testdatei.
Das automatische Anlegen der benötigten Blöcke und das Öffnen der
Uploadgalerie sowie die automatisierte Dateiübergabe im echten CMS stehen noch aus.

Der direkte Medienweg führt über **Website → Inhalte** zur **Inhaltsbibliothek**. Die lesende
Browserprobe vom 10. November bestätigt das eigene Dateifeld der Bibliothek und beide dort bereits
vorhandenen neutralen Prüfbilder. Die Suche nach dem vollständigen Dateinamen liefert nach der
Bestätigung mit Enter genau die passende Bildkarte. Die Suche nach einem freien Prüfnamen meldet
**Keine Ergebnisse**. Die Datei-Details und die Vorschauquelle zeigen dieselbe Assetkennung.
Die Bibliotheksadresse und die zugehörige Artseitenadresse lieferten für das geprüfte Bild
öffentlich HTTP 200 und dieselben ausgelieferten Bildbytes. Privater Beleg
`cms-assets-library-live-20261110.json`. Die Deaktivierung einer Seite schützt ihre Adresse,
während die Bildadresse davon unabhängig erreichbar sein kann.
[Squarespace-Hilfe zur Medienbibliothek](https://support.squarespace.com/hc/en-us/articles/206542377-Add-and-reuse-images-with-the-Asset-library)

Der lokale Leser bindet den exakten Suchwert, die Bildkarte und die FN-Bibliothek an zwei gleiche
Beobachtungen im selben Verwaltungsdokument. Ein eindeutiger Treffer liefert die beobachtete
Assetkennung und die passende Bildadresse für die Artseite. Das zugehörige native Dateifeld
wird getrennt als bereit gemeldet. Der Leerzustand beschreibt die angezeigte Suche.

Der lokale Bibliotheksupload startet im bestätigten ungesuchten Bereich **Alle Dateien**.
Er bindet die Bildverwendung und das Original an den laufenden Seitenauftrag und prüft Größe,
Format und SHA-256. Nach der Eingabe des eigenen eindeutigen Dateinamens bestätigt Enter die
Suche. Erst eine stabile Leermeldung, ein eindeutiges Dateifeld und die erneute Freigabe erlauben
genau ein Datei-Ereignis. Danach muss die Suche zum selben Namen eine neue FN-Bildkennung und
Bildadresse liefern. Der Treiber kann die Suche einmal aktualisieren. Eine unklare Dateiübergabe
bleibt im laufenden Auftrag zur Prüfung offen.

Die lokalen Ablauf- und DOM-Tests belegen die exakten Dateibytes und die einmalige Übergabe
sowie den Stopp bei einem vorhandenen Namen, entzogener Freigabe und einem Dokumentwechsel.
Der Seiteneditor akzeptiert die Bibliotheksbestätigung nur zum geprüften Dateinamen und zur
beobachteten Bildkennung. Jede daraus erstellte Bildverwendung erhält eine eigene Kennung
im Galerieblock. Beim Wiederöffnen müssen Kennung, Bild, Position, Alternativtext,
Beschriftung und Bildnachweis zum Auftrag passen. Das gilt auch für mehrere Verwendungen
derselben Bilddatei. Bisherige Galerieblöcke bleiben lesbar. Die lokalen Tests belegen den
Ablauf einschließlich Abbruch vor dem Speichern bei falscher Bildzuordnung und eines
unbestätigten Ergebnisses bei vertauschten Kennungen nach dem Speichern.

Der Desktop-Browser stellt für freigegebene Bilder einen eigenen Aufruf innerhalb des
laufenden Seitenauftrags bereit. Für jede Datei öffnet er die Inhaltsbibliothek in einem
separaten Fenster mit derselben Anmeldung. Das Fenster bleibt auf der Bibliotheksadresse
und schließt sich nach dem Dateiergebnis. Die Seitenbearbeitung bleibt im ursprünglichen
Fenster. Bildverwendung, Datei, Seite und Journalbindung müssen zusammenpassen. Adressprüfung
und Upload nutzen dieselbe Sperre für das zweite Fenster. Bei abgelaufener Anmeldung,
Fensterschluss oder einem geänderten Editor kann der laufende Upload keinen Erfolg melden.

Bei der vollständigen Entwurfsübernahme bleiben während der Bildübertragung die gespeicherten
Seiteneinstellungen im ersten Fenster geöffnet. Vor und nach der Dateiübergabe prüft der
Treiber den deaktivierten Zustand, die Seitenkennung und denselben Einstellungsdialog erneut.
Nach dem letzten Bild holt er die Deaktivierungsbestätigung für die Inhaltseingabe frisch ein.
Der lokale Test simuliert mehr als zwei Minuten Bildübertragung und bestätigt danach
Speichern und Wiederöffnen. Eine Aktivierung während der Übertragung stoppt vor weiteren
Dateien und vor der Inhaltseingabe.

Die Rückleseprüfung kann die beobachteten Texte, Blockkennungen, Bildeinträge und frisch
geprüften Seiteneinstellungen in die Quittung für das Explorer-Journal umsetzen. Der lokale
Test bestätigt die Quittung gegen den gespeicherten Entwurf, auch wenn mehrere Editorblöcke
zu einem Fachtext gehören oder dasselbe Foto mehrfach vorkommt. Eine leere Galerie ist nur
nach bestätigter Abwesenheit des Galerieblocks zulässig.

Der Treiber verbindet die Schritte ab einer identifizierten neutralen Seite mit geöffneten
Einstellungen. Er bestätigt die Deaktivierung, prüft die Zieladresse vor dem Umbenennen und
vor dem Speichern der Einstellungen, legt die Inhaltsblöcke an und liest die gespeicherte
Fassung erneut. Die öffentliche Adresse wird vor der Inhaltseingabe, nochmals vor dem
Speichern und nach dem Wiederöffnen ohne Squarespace-Anmeldung geprüft. Eine öffentlich
erreichbare Seite oder eine unklare Antwort vor dem Speichern stoppt den Speicherklick.
Nach der öffentlichen Abfrage gleicht der Treiber den Editor erneut mit dem Auftrag ab.
Der lokale Durchlauf deckt Seiten mit und ohne Galerie ab. Eine fremde Seitenkennung oder
entzogene Freigabe stoppt vor der ersten Änderung. Eine nach dem Speichern aktivierte oder
öffentlich erreichbare Seite ergibt keine Quittung.

Bei einem offenen Ergebnis zeigt die Website-Vorbereitung den gespeicherten Prüfhinweis
des zugehörigen Auftrags auch nach dem Wiederöffnen an. Für eine nicht bestätigte
Dateiübergabe, öffentliche Prüfung oder Speicherung gibt es einen eigenen Hinweis. Der Hinweis
unterscheidet den Stopp vor dem Speicherklick, einen offenen Speicherausgang und die ausstehende
Kontrolle von Texten, Bildern, Funktionsblöcken oder Deaktivierung nach dem Speichern.
Technische Fehlertexte aus dem Browser bleiben intern. Ein offener Auftrag wird nicht erneut ausgeführt.
Vor dem Speicherklick hält der Explorer die bestätigte Squarespace-Seitenkennung, die Blockfolge
und die geordneten Bildreferenzen im zugehörigen persönlichen Auftrag fest. Die Zuordnung bleibt
nach dem Wiederöffnen der Datenbank und nach einer geprüften Wiederherstellung erhalten. Der
Explorer prüft den Inhalt danach erneut und lässt den Speicherklick erst bei weiter passendem
Editor zu. Der abschließende Rücklesebeleg muss dieselbe Seite und dieselben Bilder bestätigen.
Bei einem unterbrochenen Versuch bleiben die Zuordnung, der offene Status und der Prüfhinweis
erhalten. **Entwurf in Squarespace prüfen** steht in **Website-Vorbereitung** für eigene, aktuelle
Aufträge mit einer solchen Zuordnung bereit. Die Aktion benötigt die Online-Anmeldung und das
Freigaberecht. Sie vergleicht die gespeicherten Texte, Funktionsblöcke, Bildreihenfolge und Bildtexte
mit der freigegebenen Fassung. Die Seite muss weiterhin deaktiviert und öffentlich nicht erreichbar
sein. Erst eine vollständige Rücklesung bestätigt den gespeicherten Entwurf. Der bisherige Hinweis
bleibt im Journal erhalten. Der HTTP-Integrationstest deckt den Weg nach einem Explorer-Neustart ab.

Der lokale Gesamtablauf beginnt mit dem einmaligen Leerseiten-Klick. Er prüft die Zeilen unter
**Nicht verlinkt** anhand ihrer Position zwischen den markierten Gruppenüberschriften. Genau eine
neue erste Zeile und unveränderte übrige Zeilen sind Voraussetzung. Bei einem fokussierten
Namensfeld bestätigt der Treiber den neutralen Namen. Hat Squarespace bereits eine **Neue Seite**
unter `/neue-seite` gespeichert, prüft der Treiber zusätzlich, dass der exakte Standardeintrag
vorher fehlte. Vorschau, Seitenkennung und geöffnete Einstellungen müssen dieselbe neu
hinzugefügte Seite bestätigen. Die gespeicherte Standardseite wird vor der Zuweisung des
endgültigen Titels und der Zieladresse deaktiviert und nach dem Speichern erneut geprüft.
Eine unklare Zuordnung hält den Auftrag offen und sperrt die automatische Wiederholung.
Die durchgehenden lokalen Tests führen vom Leerseiten-Klick über die bestätigte Deaktivierung
bis zur erneut gelesenen gespeicherten Fassung, jeweils ohne und mit Galerie.

Der erste Lauf im angemeldeten Explorer-Browser vom **11. November** stoppte vor dem Journalstart
bei der Adressprüfung. Squarespace zeigte beim Öffnen der leeren Suche bereits **Suchanfrage löschen**.
Die Erkennung akzeptiert nun genau diesen leeren Suchzustand auch mit einer Löschschaltfläche.
Beim ersten Nachlauf war der Seitenbereich im Dokument vorhanden, aber nicht sichtbar. Der Lauf
stoppte wieder vor der Anlage. Privater Beleg `cms-native-preparation-20261111.json`.
Im normalen Windows-Desktop war der Seitenbereich sichtbar. Die Suche bestätigte die freie
Adresse und schloss sich wieder. Die Plus-Schaltfläche unter **Nicht verlinkt** war vorhanden,
lieferte aber beim ersten Zugriff keinen gültigen Klickpunkt. Die Bedienelemente des Katalogs
werden jetzt in die Ansicht gescrollt und mit unveränderter Position erneut geprüft. Die native
Gegenprobe öffnete den Katalog, wechselte zum klassischen Editor, bestätigte die Leerseitenaktion
und schloss den Katalog wieder. Nach dem Journalstart stoppte sie beim erneuten Öffnen der Suche
für die neutrale Adresse, noch vor der Leerseitenaktion. Der Suchkopf wird jetzt ebenfalls bei
Bedarf in die Ansicht gescrollt und vor dem Klick erneut geprüft. In der nächsten nativen Probe
bestand auch diese Suche. Beim zweiten Öffnen zeigte Squarespace direkt den zuletzt verwendeten
klassischen Katalog. Der Treiber akzeptiert diesen Zustand im selben gebundenen Dialog.

Der nächste native Lauf am **11. November** löste die Leerseitenaktion einmal aus. Squarespace
speicherte die für diesen Lauf freigegebene leere Prüfseite als **Neue Seite** unter `/neue-seite`.
Der Treiber fand im sichtbaren Seitenbereich kein eindeutig zugeordnetes Namensfeld und stoppte
mit `SQUARESPACE_PAGE_CREATION_UNCONFIRMED`. Der öffentliche Abruf bestätigte danach HTTP 200
und die Seitenkennung `6af4934c305b39408cc75520`. Die Texteingabe und der Bildupload fanden
in diesem Lauf nicht statt. Felix bestätigte anschließend die Deaktivierung im Editor. Der
unabhängige öffentliche Abruf am 11. November um `16:25:23.869 UTC` ergab HTTP 404 ohne
Weiterleitung, Seitenkennung oder kanonische Adresse. Die Freigabe für genau eine Prüfseite
ist ausgeschöpft.

Der anschließende Lauf auf der vorhandenen Seite stoppte vor der ersten Änderung. Die Anmeldung
im Explorer-Prüfbrowser war bestätigt. Danach ließ sich die geladene Vorschau nicht zugleich an
die feste Seitenkennung und den erwarteten leeren Inhaltsbereich binden. Die öffentliche Adresse
lieferte erneut HTTP 404. Felix' Chrome-Ansicht zeigt für **Neue Seite** in derselben
Seitenverwaltung **Deaktiviert** und **Leere Seite**. Die Browseradresszeile zeigt den
Verwaltungspfad `/config/pages`. Die Diagnose liest die konfigurierte und die tatsächlich
geladene Vorschau getrennt und meldet nur gebundene Merkmale wie Kennung, Platzhalter und
Blockanzahl. Die Diagnose endet vor jeder Inhaltsänderung.

Die lesenden Läufe am 11. November bestätigen im Explorer sowohl `/neue-seite` als auch die
genaue Seitenkennung. Der einzige Inhaltsartikel hatte keinen Text, keine Inhaltsblöcke und keine
Medien. Er enthielt direkt ein kinderloses `section.region` mit `data-region-id` und
`data-region-source` ohne Kennung eines bearbeitbaren Abschnitts. Diese beobachtete Struktur gilt
im lokalen Treiber als leerer Layoutbereich. Inhalt, Medien, zusätzliche Attribute oder mehrere
solcher Bereiche bleiben ein Stoppsignal. Der zweite Browserlauf kam danach bis zur Auswahl des
Seiteneinstellungs-Buttons. Dessen Klickpunkt wurde noch nicht eindeutig bestätigt. Beide Läufe
endeten vor einer Speicherung oder einem Upload.

Die automatische Neuanlage bleibt im normalen Explorer ausgeblendet. Die Abnahme im echten
Squarespace-Editor muss die eindeutige Zuordnung nach dem Leerseiten-Klick, die gespeicherte
Deaktivierung vor der Inhaltsübernahme und die Rücklesung von Texten und Bildkennungen nach
dem Speichern und Wiederöffnen bestätigen.

Der lokale Treiber kann die exakt zugeordnete Seitenzeile für ein erst beim Überfahren sichtbares
Zahnrad in den sichtbaren Bereich holen. Der Klick verlangt erneut dieselbe Seite, die aktuelle
Schreibfreigabe und einen Klickpunkt direkt auf dem sichtbaren Zahnrad. Ist die Zeile selbst am
Klickpunkt oder bleibt das Zahnrad verdeckt, erfolgt kein Klick. Die native Wiederholungsprobe
steht für diesen Schritt aus.

Bei Seiten mit Galerie prüft der Treiber die endgültige Adresse auch vor dem ersten Dateizugriff
und Upload ohne Squarespace-Anmeldung. Die gespeicherten deaktivierten Einstellungen müssen
vor und nach der Abfrage derselben Seite zugeordnet sein. Der lokale Test mit einer öffentlich
erreichbaren Adresse bestätigt den Stopp ohne Dateizugriff, Upload oder Öffnen des Inhaltseditors.

Die Dateiübergabe gleicht die Reihenfolge der Bildkennungen am nativen Dateifeld zusätzlich
mit der separat gelesenen Galerieliste ab. Eine Abweichung stoppt vor der Übergabe der Bilddatei.
Der gezielte Test belegt den Stopp ohne Dateieingabe, Texteingabe oder Speicherklick.
Der erste Upload ist auch möglich, wenn derselbe eindeutig gebundene Dateidialog in beiden
Beobachtungen noch keine Bildzeilen enthält. Verborgene Bildzeilen oder ein Dialogwechsel stoppen
den Vorgang. Die fehlenden Zeilen dienen nur als Ausgangswert für die Dateiübergabe. Erst der
eindeutig neue Eintrag im selben Dialog bestätigt sie. Die allgemeine Vorschau meldet daraus
keine gespeicherte leere Galerie. Der vollständige Ablauf ist lokal mit zwei Testbildern geprüft.

Vor jedem weiteren Upload muss der erneut geöffnete Dialog dieselben Einträge in derselben
Reihenfolge zeigen wie unmittelbar nach dem letzten bestätigten Upload. Bei einer fehlenden oder
ersetzten Bildverwendung stoppt der Treiber vor der nächsten Dateiübergabe. Ein Wechsel zwischen
den beiden beobachteten CDN-Routen bleibt bei gleicher Assetkennung zulässig. Die Gegenprobe
entfernt das erste bestätigte Bild zwischen zwei Dialogöffnungen und prüft den Stopp vor dem
zweiten Upload sowie vor Text- oder Speichereingaben.

Der lokale Seitenablauf kann die benötigten leeren Blöcke inzwischen einzeln anfordern und
ihre Kennungen, Typen und Reihenfolge vor dem nächsten Schritt prüfen. Ein bereits vorhandener
eindeutig leerer erster Textblock kann aus der Standardvorlage übernommen werden. Andere
vorhandene Blockfolgen müssen ausdrücklich geprüft werden. Die spätere lesende Probe sah den
klassischen Textabschnitt im echten Inhaltsfenster. Der Wechsel in den Bearbeitungsmodus blieb
in beiden Versuchen ohne nutzbare Speicher- und Beenden-Steuerung. Die konkrete CMS-Menübedienung
für die Neuanlage steht deshalb weiter aus.

Am 9. November lädt der Editor der deaktivierten Prüfseite die gespeicherten Inhalte vollständig.
Der sichtbare klassische Abschnitt enthält einen Textblock. Direkt unter ihm ist im Block-DOM ein
eindeutiger Einfügepunkt mit `data-test="insert-point-trigger"` beobachtet. Seine Schaltfläche ist
im Ruhezustand verborgen. Damit ist der Einfügepunkt einer vorhandenen Blockkennung zuordenbar.
Auswahlmenü, Blocktyp und der Platzhalter eines neu angelegten Blocks benötigen einen eigenen
Nachweis. Die lesende Probe endet mit deaktiviertem Speichern und regulärem Beenden. Der private
Beleg heißt `cms-classic-insert-anchor-live-20261109.json`.

Der Desktop-Treiber kann diesen Einfügepunkt lokal ansteuern. Er bindet ihn an Seitenpfad,
Seitenkennung, Deaktivierungsnachweis, klassischen Abschnitt und vorhergehenden Block. Nach der
Mausbewegung prüft er erneut die Schreibfreigabe und klickt erst, wenn genau dieses Plus sichtbar
und am Zielpunkt erreichbar ist. Die lokale Gegenprobe umfasst unter anderem einen anderen
Abschnitt, einen verdeckten Einfügepunkt und einen Wechsel der Vorschau. Der Treiber liefert den
Nachweis des ausgelösten Klicks. Die Menüauswahl und der dadurch erzeugte Block müssen in
Squarespace separat bestätigt werden. Die automatische Neuanlage bleibt bis dahin gesperrt.

Der lokale Schreibablauf behält die Blockreihenfolge auch bei einem Fokuswechsel. Der Leser
erkennt einen Textblock an der bereits beobachteten Squarespace-Struktur, wenn der Rich-Text-Editor
geschlossen ist. Vor der Texteingabe öffnet der Desktop-Treiber ausschließlich den gebundenen
leeren Block. Er prüft danach, ob das passende Eingabefeld offen und der Seitenaufbau unverändert
ist. Fehlender Fokus, belegte Textflächen und ein Seitenwechsel stoppen die Eingabe. Das ist lokal
mit dem vollständigen Schreib- und Speicherablauf sowie mit Gegenfällen geprüft.

Im Chrome-Nachlauf auf derselben deaktivierten Prüfseite verdeckt der Abschnittscontainer die
Mitte des Einfügepunkts. Nahe dem linken Rand der unteren Linie wurde das zugehörige Plus einmal
sichtbar. Die Sichtbarkeit war nicht stabil, und der anschließende Klick öffnete kein bestätigtes
Auswahlmenü. Der lokale Treiber zielt deshalb auf den beobachteten Rand der Linie und löst einen
Klick weiterhin erst aus, wenn der tatsächlich sichtbare Knopf getroffen wird. Die Probe endete
mit deaktiviertem Speichern und regulärem Beenden. Der private Beleg heißt
`cms-classic-insert-reveal-live-20261109.json`. Die Menüauswahl und Blockanlage im echten Editor
stehen weiter aus.

Am 10. November waren im Chrome-Editor der weiterhin deaktivierten Prüfseite sechs
Einfügepunkte desselben Textblocks zu sehen. Genau einer gehörte zur Unterkante des gesamten
Blocks. Dessen Hülle hatte Höhe null und enthielt einen eigenen ein Pixel hohen Linienstrich.
Der Abschnittscontainer verdeckte die zunächst verborgene Schaltfläche in der Mitte. Der linke
Rand schaltete ihre Sichtbarkeit kurz um, der Mittelpunkt traf dabei weiterhin den Container.
Auch die mobile Vorschau und die Auswahl des vorhandenen Textblocks ergaben keinen erreichbaren
Menüknopf. Die gespeicherte Prüffassung wurde nach regulärem Beenden erneut angezeigt. Der private
Beleg heißt `cms-classic-insert-target-live-20261110.json`.

Der Treiber liest jetzt die tatsächliche Linie und prüft bis zu drei Mauspositionen dicht um sie.
Jede Bewegung bleibt an den nachgewiesenen Abschnitt gebunden. Unmittelbar vor dem Klick prüft
er die Schreibfreigabe und den identischen Trefferpunkt erneut. Der Rückgabestatus
`click-dispatched` belegt den Klickversuch. Die Menüöffnung, die Auswahl des Blocktyps und die
Anlage eines Blocks benötigen jeweils einen eigenen Nachweis.

Die zweite Chrome-Probe am 10. November bestätigt einen Einstieg über die Abschnittsauswahl.
Das Plus des klassischen Textblocks blieb nach dem Versuch am Linienrand verdeckt. Die sichtbare
Schaltfläche `section-add-button` unter demselben Abschnitt ließ sich im Editor-Rahmen eindeutig
der Abschnittskennung zuordnen und öffnete den Dialog **Abschnittskatalog**. Dort waren **Leeres
Element hinzufügen** und **Erstellt mit dem Klassischen Editor** vorhanden. Die Probe schloss
den Dialog ohne Auswahl, bestätigte das weiterhin deaktivierte Speichern und verließ den Editor.
Die bestehende Testseite blieb deaktiviert. Der private Beleg heißt
`cms-section-catalog-live-20261110.json`. Als Nächstes den dort angebotenen leeren Abschnitt auf
der Prüfseite tatsächlich anlegen und seine erreichbare Blockauswahl qualifizieren. Der bestätigte
Dialog allein trägt keine Aussage zu Blockanlage oder Upload. [Squarespace-Hilfe zu Abschnitten](https://support.squarespace.com/hc/en-us/articles/360027987711-Page-sections)

Der lokale Browser-Treiber kann diesen Einstieg nun einzeln ausführen. Er verlangt die aktuelle
Deaktivierungsbestätigung, den gebundenen Seitenauftrag, die eindeutige Abschnittskennung im
Inhaltsfenster und genau eine sichtbare, treffbare Schaltfläche im Editor-Rahmen. Er liest Abschnitt
und Klickposition nach der erneuten Berechtigungsprüfung nochmals. Erst der erkannte Abschnittsdialog
bestätigt das Ergebnis eines einzelnen Klicks. Ein anderer Dialog, eine überlagerte oder verschobene
Schaltfläche, ein Vorschauwechsel und entzogene Berechtigung ergeben keinen Öffnungsnachweis.
Die lokale Probe wählt keine Menüoption und legt keinen Abschnitt an. Galerietreiber, Seitenbeobachtung
und Rückleseprüfung bestehen in der gemeinsamen gezielten Serie mit **162/162** Fällen.

Die unabhängige Gegenprobe verwarf fehlenden Fachtext, vertauschte Bildkennungen trotz identischer
Bildtexte und eine aktivierte oder nicht eindeutig deaktivierte Seite. Der Inhaltsvergleich verwendet
die Dokumentreihenfolge. Bei einem frei angeordneten Raster ist die sichtbare Reihenfolge gesondert
an Desktop- und Mobilansicht zu prüfen.

Die öffentliche Eisvogel-Artseite liefert dafür einen konkreten Befund. Derselbe Fluid-Engine-Block
für Artinformationen hat im veröffentlichten CSS die Grundfläche `2/2/9/10` und ab 768 Pixel Breite
die Rasterfläche `2/2/4/26`. Der private Beleg `cms-fluid-breakpoints-public-20261110.json` bindet
die Blockkennung an beide Regeln. Das bestätigt die getrennten Platzierungsregeln, ohne die
tatsächliche Bildschirmreihenfolge im Editor vorwegzunehmen. Die eigene FN-CSS blendet außerdem
leere Codeblöcke mobil aus. Deshalb zuerst die leeren Blöcke im Desktop-Editor prüfen und die
Mobilansicht mit befüllten Blöcken abnehmen.
[Eisvogel-Referenzseite](https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/alcedoatthis) ·
[FN-Squarespace-CSS](../../docs/squarespace-custom.css)

Die nächste echte Chrome-Probe am 10. November zeigt die Abschnittsschaltfläche zunächst verborgen.
Nach Fokussieren der freien Fläche im gebundenen Abschnitt war sie sichtbar. Im Katalog legt
**Leeres Element hinzufügen** unmittelbar einen leeren Fluid-Engine-Abschnitt an. Das
abschnittsgebundene **Block hinzufügen** öffnet die
**Block-Auswahl** im Inhaltsfenster. Dort sind **Text** und **Code** einzeln wählbar. Beide neuen
Blöcke haben eine `block-yui_…`-Kennung mit passender Rasterzelle und in dieser Editoransicht
keinen alten `data-block-type`. Der Textblock ist leer. Der Codeblock beginnt mit dem sichtbaren
Squarespace-Standardinhalt `<p>Hello, World!</p>` und gilt daher weiterhin als befüllt.

Am Desktop begannen beide Blöcke in derselben Rasterzeile. In der 428 Pixel breiten Mobilansicht
standen sie untereinander. Am Desktop verschob ein Ziehen des neuen Codeblocks auf der ihm
zugeordneten Bearbeitungsfläche den Block unter den Text. Die Reihenfolge im Dokument blieb dabei
unverändert. Der Beleg `cms-fluid-editor-native-20261110.json` enthält beide Ansichten und die
beobachtete Position nach dem Ziehen. Die Probe wurde ohne Speichern verlassen. Die anschließend
erneut geladene Vorschau zeigte die ursprünglichen Abschnittskennungen und die Seite blieb deaktiviert.
Das automatische Anlegen und Platzieren sowie der gesicherte Austausch des Code-Platzhalters sind
eigene Treiberschritte. Bild-Upload und Speichern mit Wiederöffnen bleiben als zusammenhängende Probe offen.

Der lokale Treiber legt den Abschnitt jetzt hinter einem ausdrücklich gebundenen vorhandenen
Abschnitt an. Er prüft, dass dabei genau ein leeres Fluid-Engine-Raster an dieser Stelle entsteht.
Danach kann er im gebundenen Raster genau einen Text- oder Codeblock über die beobachtete
Block-Auswahl anlegen. Die vorherige Abschnitts- und Blockfolge muss erhalten bleiben. Ein schon
offenes oder mehrdeutiges Menü und ein anderer Zuwachs stoppen den Versuch.

Die Platzierung bindet den Block an seinen Anlagevorgang und dieselbe Deaktivierungsbestätigung.
Steht der Block bereits unter seinem Vorgänger, bleibt er an Ort und Stelle. Sonst zieht der
Treiber genau einmal vom sichtbaren Bearbeitungsbereich zu einem geprüften Ziel im selben Raster.
Er verlangt anschließend die neue Position und unveränderte Positionen aller vorherigen Blöcke.
Ein nicht erreichbares Ziel, ein Fensterwechsel oder eine unklare Position verhindern einen
Erfolgsnachweis. Der Treiber wiederholt einen bereits ausgelösten Zug nicht automatisch.
Diese Schritte sind einzeln integriert und lokal geprüft. Die Platzierung über einen notwendigen
Scrollwechsel und die automatische Anwendung im echten CMS sind noch zu belegen.
[Electron-Eingabeereignisse](https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent)

Die anschließende Chrome-Probe bestätigt im HTML-Editor des gerade angelegten Codeblocks exakt
`<p>Hello, World!</p>` als Quelltext. Nach vollständiger Markierung und Rücktaste ist der Code leer.
CodeMirror zeigt dabei den geschützten Bedienhinweis **Code hinzufügen …**. Der leere gerenderte
Codecontainer nach **Esc** bestätigt die Änderung im offenen Entwurf. Die Probe wurde ohne
Speichern verlassen und der ursprüngliche deaktivierte Seitenstand nochmals geprüft. Der private
Beleg heißt `cms-fluid-default-code-native-20261110.json`.

Der Treiber akzeptiert den unveränderten Standardquelltext nur im gebundenen Dialog eines Blocks,
den derselbe Auftrag angelegt und platziert hat. Vor der Rücktaste verlangt er die vollständige
Textauswahl im fokussierten Feld und prüft die Berechtigung erneut. Danach müssen derselbe Dialog
und der leere Block bestätigt werden. Der Beobachter erkennt den echten Leerhinweis nur über die
beobachteten CodeMirror-Elemente. Abweichender Code, eine unvollständige Markierung und bereits
vorhandene Blöcke bleiben geschützt.

Die lokale Inhaltsübernahme verbindet nun Abschnitt, Blockanlage, Platzierung, Platzhalterprüfung
und den vorhandenen Text-/Medienablauf. Der native Abschnittsweg erwartet eine deaktivierte Seite
ohne vorhandene Inhaltsblöcke mit einer eindeutig gebundenen Ansatzstelle. Das lokale Modell führt
zwei Bild-Uploads, die Inhaltsprüfung, einen Speichervorgang und das Wiederöffnen durch. Die
durchgehende native Seitenanlage einschließlich Upload, Speichern und Rücklesung steht aus.

Für den ersten Abschnitt gibt es einen ausdrücklichen Einstieg (`afterFluidSectionId: null`).
Er verlangt die Kennung und Adresse der deaktivierten Seite, einen geladenen Inhaltsartikel ohne
Text, bearbeitbare Abschnitte, Blöcke oder Medien und genau eine sichtbare, treffbare Abschnittsschaltfläche
im Editor-Rahmen. Der Treiber prüft die leere Ausgangslage erneut vor der Auswahl im Katalog.
Danach erwartet er genau einen neuen Fluid-Engine-Abschnitt mit leerem Raster. Ein unklarer
Klickausgang wird mit derselben Deaktivierungsbestätigung kein zweites Mal ausgeführt.
Der lokale Nachlauf modelliert von der leeren Seite aus auch Bild-Uploads, Speichern,
Wiederöffnen und die öffentliche Prüfung vor der Eingabe, vor dem Speichern und nach dem
Wiederöffnen. Im echten FN-Editor wurde die Schaltfläche auf der deaktivierten Prüfseite im
Inhaltsrahmen beobachtet. Sie trägt dort `data-guidance-engine="guidance-engine-add-section-button"`.
Der Treiber prüft zusätzlich, ob das Steuerelement eindeutig zum bestätigten leeren Editor gehört
und an der berechneten Position getroffen wird. **259 gezielte lokale Fälle** bestehen. Die native
Auslösung und der neu angelegte Abschnitt stehen noch aus. [Squarespace-Hilfe zu Abschnitten](https://support.squarespace.com/hc/en-us/articles/360027987711-Page-sections)

Am **12. November** erreicht der Explorer die vorhandene deaktivierte Prüfseite, trägt ihren
neutralen Titel, Navigationstitel und Slug ein und liest dieselbe deaktivierte Collection nach dem
Speichern neu zurück. Die öffentliche Adresse antwortet mit HTTP 404. Die native Diagnose bestätigt
zwei Details des Einstellungsdialogs. Electron benötigt für den fokussierten Einstellungsbutton das
Zeichenereignis zwischen Tastendruck und Loslassen. Squarespace zeigt den eindeutig gebundenen
Speichern-Button beim Bearbeiten auch ohne explizites HTML-`type`-Attribut. Die lokalen Korrekturen
sind zusammen mit der Warteprüfung für das getrennte Adressfenster mit **207 Fällen** geprüft.
Der folgende Lauf bestätigt die gespeicherte Zieladresse und die beiden hochgeladenen Prüfbilder
in der Inhaltsbibliothek. Die leere Seite bleibt deaktiviert und öffentlich nicht erreichbar (HTTP
404). Squarespace liefert beide Bilder als WebP mit **192 × 128 Pixeln** aus. Dekodiert stimmen die
Pixel jeweils exakt mit dem zugehörigen Prüforiginal überein. Der Treiber erkennt im leeren Editor
auch die zusätzliche Squarespace-Beschriftung **Seiteninhalt hinzufügen**. Nach der nativen
Auswahl der leeren Vorlage zeigt der Editor einen neuen Fluid-Engine-Abschnitt innerhalb der
bestätigten Editorregion. Im Folgelauf bestätigt der Treiber den Abschnitt
und öffnet **Block-Auswahl**. Der Editor zeigt die nativen Text- und Code-Einträge. Die Auswahl des
ersten Textblocks gelingt in der Bedienprobe. Der Treiber bindet die Auswahl nun an die beobachtete
Kennung und prüft sichtbare Treffer zuerst ohne Scrollbewegung. Ist der projizierte Klickpunkt im
Hauptfenster vorübergehend verdeckt, wartet der Treiber innerhalb der bestehenden Prüffrist auf
einen erreichbaren Punkt und bestätigt ihn unmittelbar vor dem Klick erneut. Die automatische
Auswahl und der gespeicherte Text- und Galerienachweis
stehen im echten Editor weiter aus. Zwei weitere Läufe blieben bereits vor dem Öffnen der
Blockauswahl stehen. Die native Ansicht zeigt eine Abschnittswerkzeugleiste über dem rechten
Rasterrand. Der Treiber sucht deshalb freie Punkte innerhalb des gebundenen Rasters. Vor dem Klick
auf **Block hinzufügen** muss der Treffpunkt zweimal übereinstimmen und die Blockfolge unverändert
sein. Bei einer Positionsänderung beobachtet er die Leiste erneut innerhalb der bestehenden
Prüffrist. Sichtbare, treffbare Knöpfe bleiben dabei ohne Scrollbewegung an ihrer Position.
**655 lokale Desktop- und Artseitentests** bestehen. Die Testabschnitte wurden ohne Speichern
verworfen. Der gespeicherte Entwurf ist leer und deaktiviert. Die öffentliche Adresse liefert HTTP 404.

Der aktuelle isolierte Chromium-Nachlauf bestätigt im gerenderten Testeditor die Auswahl eines
freien Rasterpunkts trotz Überlagerung, das verzögerte Anzeigen der Abschnittswerkzeuge und genau
einen neuen Textblock. Der Lauf löst die Klicks über die gerenderten Testelemente aus. Native
Mausereignisse erreichten das Raster im verborgenen Testfenster nicht. Der separate gerenderte
Durchlauf mit vorbereiteten Blöcken bestätigt genau einen Speichervorgang, das Wiederöffnen, beide
Bildverwendungen in der vorgesehenen Reihenfolge und ihre getrennten Bildtexte. Die native Prüfung
des durchgehenden Ablaufs im sichtbaren Squarespace-Editor bleibt offen.

Ein weiterer nativer Lauf öffnet **Block-Auswahl**. Der Accessibility-Baum bestätigt die Region
und beide nativen Einträge. Der bisherige DOM-Selektor meldet die Region trotzdem als fehlend
und hält vor der automatischen Textblockauswahl an. Der korrigierte Treiber akzeptiert eine
eindeutig benannte Region unabhängig vom HTML-Element sowie einen entsprechend benannten nativen
Abschnitt. Verdeckte oder mehrdeutige Auswahlen bleiben gesperrt. Nach dem Verwerfen des
ungespeicherten Prüfabschnitts zeigt der Editor den leeren, deaktivierten Entwurf. Die öffentliche
Adresse liefert erneut HTTP 404. Alle 655 lokalen Desktop- und Artseitentests bestehen. Der
isolierte Chromium-Test bestätigt genau einen eingefügten Textblock mit einer über
`aria-labelledby` benannten Auswahlregion.

Der native Nachlauf bestätigt danach auch die automatische Auswahl und Anlage des Textblocks.
Squarespace zeigt den leeren Platzhalter **Hier schreiben …** im neuen Abschnitt. Die anschließende
Prüfung der vollständigen Blockanordnung hält vor der Texteingabe an. Nach dem Verwerfen zeigt
Squarespace den leeren, deaktivierten Entwurf. Die öffentliche Adresse liefert erneut HTTP 404.
Der Treiber wartet nach dem Einfügen auf einen eindeutigen Layoutnachweis innerhalb der bestehenden
Prüffrist. Er wiederholt dabei den Klick nicht. Eine weiterhin unbestätigte Anordnung oder geänderte
Seitenidentität stoppt den Vorgang vor der Eingabe.

Der native Nachlauf vom 12. November legt Text und den ersten Codeblock im selben Fluid-Engine-Raster
an. Im Codeblock folgen auf den Codecontainer zwei Squarespace-Stilelemente. Die ältere Layoutprüfung
hielt deshalb beim Code-Platzhalter an. Der Beobachter erlaubt jetzt genau diese beobachtete Folge
in einer eindeutig gebundenen Rasterzelle. Andere zusätzliche Elemente verweigern den Nachweis.
Der isolierte Test prüft den sichtbaren Platzhalter, den leeren Codeblock, die bekannte Modulform
und die Ablehnung unerwarteter Elemente. Die beiden Prüfbilder waren in der Medienbibliothek erneut
pixelgenau gebunden. Ein Nachlauf stoppte beim Wechsel von der Bibliothek zur Seitenverwaltung vor
jeder Inhaltseingabe. Der private Prüfablauf wartet an dieser Stelle auf die erwartete Adresse und
einen stabilen Seitenrahmen, bevor er den bestehenden Editor bindet.
Der anschließende Lauf bindet den Rahmen und bestätigt die deaktivierten Seiteneinstellungen.
Nach dem Klick auf **Bearbeiten** erhält er keinen eindeutigen Nachweis für den leeren Editor
innerhalb von 20 Sekunden. Felix sieht **Abschnitt hinzufügen** erst am Ende der Probe. Der Treiber
gibt diesem Übergang jetzt bis zu 40 Sekunden und sendet den Klick einmal. Er prüft weiterhin die
unveränderte Seitenidentität, einen leeren Editor und eine deaktivierte Speichern-Schaltfläche.
Ein bereits leerer Inhaltsrahmen reicht dafür erst zusammen mit der eindeutig anklickbaren
Schaltfläche **Abschnitt hinzufügen**. Die Abschnittsauswahl prüft Seite, Freigabe und Trefferposition
vor ihrem eigenen Klick erneut. Die lokale Chromium-Probe mit simulierten Squarespace-Seiten prüft
beide Fälle: Ein verspätet eingeblendeter Button führt einmal zur Abschnittsauswahl. Bleibt er aus,
endet der Lauf vor der Abschnittsauswahl. Die Probe verwendet lokale Browser-Klicksimulation.
Der private Prüfablauf erfasst beim nächsten Stopp zusätzlich Editor-Bedienelemente und Seitenrahmen.

Der native Nachlauf bestätigt den Editor, legt einen Abschnitt sowie Text und Code an und platziert
den Codeblock unter dem Textblock. Der Codeblock bringt einen eigenen **Bearbeiten**-Knopf außerhalb
der Seitenwerkzeugleiste mit. Das Protokoll zeigt dort genau einen solchen Knopf und je einen an die
Seitenwerkzeugleiste gebundenen **Speichern**- und **Beenden**-Knopf. Der manuell geöffnete HTML-Editor
zeigt den genauen Standardtext `<p>Hello, World!</p>`. Die Codeprüfung behandelt einen eindeutigen
Blockknopf jetzt getrennt von der Seitenwerkzeugleiste. Zwei Kandidaten oder eine mehrdeutige
Seitenwerkzeugleiste bleiben gesperrt. Die ungespeicherten Prüfblöcke wurden verworfen.
Ein bereits eindeutig ausgewählter Codeblock behält seine Auswahl. Der Explorer prüft den
zugehörigen Bearbeiten-Knopf zweimal und öffnet das Feld einmal. Die lokale Chromium-Probe bestätigt
das Einfügen und Rücklesen des FN-Codes bei ausgewähltem, leerem Block. Ein belegter Block mit dem
Squarespace-Standardtext bleibt beim normalen Einfügeversuch unverändert. Die getrennte, an den neu
angelegten Block gebundene Standardtext-Löschung ist im Treibertest geprüft. Derselbe Test deckt
das Anlegen weiterer Blöcke, Eingabe, einmaliges Speichern und Rücklesen ab, wenn die Blockauswahl
nach Escape sichtbar bleibt. Die Bedienprobe in Squarespace steht für diese Schritte aus.
Die beiden folgenden Läufe halten vor der Bearbeitung an. Einmal erscheint der Einstellungsdialog
innerhalb der Prüffrist nicht. Einmal ist die leere Vorschau mit der richtigen Kennung erst nach
dem Stopp im Protokoll sichtbar. Der private Prüfablauf gibt der Vorschau und dem Einstellungsdialog
je bis zu 30 Sekunden. Er wählt dieselbe Seite während der Ladezeit einmal aus. Die öffentliche
Prüfadresse antwortet weiterhin mit HTTP 404.

Der weitere native Lauf öffnet den HTML-Editor automatisch. Die getrennte Diagnose bestätigt
den Code-Dialog, HTML-Modus, ausgeschaltete Quellcode-Anzeige und den exakten Standardtext. Der
weiter sichtbare Seitenrahmen fällt dabei aus der allgemeinen Sichtbarkeitsprüfung. Die Codeprüfung
liest jetzt einen eindeutig gebundenen, gerenderten Rahmen auch während der Fokusabschirmung durch
den Dialog. Tatsächlich ausgeblendete oder mehrdeutige Rahmen sowie eine abweichende Seiten- oder
Blockkennung verweigern weiterhin den Nachweis. Die ungespeicherten Prüfblöcke wurden verworfen.

Im nächsten Lauf wurden beide Prüfbilder in der Squarespace-Bibliothek gefunden und mit den
erwarteten Bildpixeln bestätigt. Die Eingabe hielt danach an, weil die Vorschau unmittelbar nach
dem Schließen des geleerten Codefelds noch den Standardabsatz enthielt. Die ungespeicherten
Prüfblöcke wurden verworfen. Die öffentliche Adresse des deaktivierten Entwurfs lieferte HTTP 404.

Der lokale Treiber ersetzt den Standardtext jetzt im selben HTML-Dialog. Voraussetzung ist der
exakt beobachtete Standardtext in einem für diesen Auftrag neu angelegten und eindeutig platzierten
Codeblock. Nach der vollständigen Markierung prüft der Explorer das leere Feld, die Auswahl und
die aktuelle Schreibberechtigung. Erst dann fügt er den freigegebenen Art-, Karten- oder Galeriecode
ein und schließt den Dialog. Vor dem einmaligen Speichern wird der gerenderte Inhalt geprüft.
Der lokale Test bildet auch eine Vorschau nach, die beim Schließen eines leeren Codefelds den
Standardtext wiederherstellt. Speichern und Wiederöffnen des vollständigen Entwurfs stehen im echten
Editor weiter aus.

Beim früheren Speichern von neutralem Text war die direkt neu geladene Vorschau zunächst leer.
Auf der aktuellen Prüfseite wurden neben dem eigentlichen Seitenrahmen drei weitere Rahmen
beobachtet. Der lokale Speichertest bildet beide Beobachtungen zusammen nach. Das Wiederöffnen
erkennt jetzt eine leere Vorschau neben Hilfsrahmen, wenn das Dokument des benannten Seitenrahmens
selbst nachweislich leer und die Zieladresse eindeutig ist. Nach dem einen Klick auf **Bearbeiten**
muss derselbe Seiteninhalt geladen und vollständig geprüft werden. Unklare Ausgänge unterscheiden
im Prüfprotokoll Speicherklick, Öffnen, Inhaltsvergleich und erneute Prüfung der Deaktivierung.
Der lokale Chromium-Test bestätigt den Wechsel von leerem zu geladenem Seitenrahmen bei drei
weiteren eingebetteten Rahmen im selben Verwaltungsfenster.

Der lokale Treiber kann bei einem ausdrücklich gebundenen Fluid-Engine-Abschnitt zusätzlich die
sichtbare Reihenfolge prüfen. Die gemessenen Blockpositionen müssen zu den Blockkennungen und zur
Dokumentreihenfolge passen. Überlappende Blöcke und wechselnde Positionen verweigern den Nachweis.
Die Prüfung greift bei der Eingabevorbereitung, vor dem Speichern und nach dem Wiederöffnen in der
jeweils beobachteten Ansicht. Der Beobachter akzeptiert die neu gesehenen Blockformen nur mit
passender Rasterkennung und erkennt den Code-Platzhalter weiterhin als vorhandenen Inhalt.
Bei Überschriften misst er zusätzlich die gerenderten Textzeilen. Reicht eine umgebrochene
Überschrift in den Bereich des nächsten Blocks, bleibt die Layoutbestätigung offen, selbst wenn
die Rasterblöcke an sich getrennt stehen. Ein vollständig sichtbarer Umbruch bleibt zulässig.

Beim Aufbau neuer Entwürfe fasst der Squarespace-Treiber die Kartenüberschrift, ihren optionalen
Begleittext und den Kartencontainer in einem HTML-Block zusammen. Überschrift, Text und Karte
folgen darin im normalen Seitenfluss. Die Kartensektion behält ihren Titel und ihre Listen;
Quellen folgen wie im geprüften Plan nach der Karte. Vor dem Speichern und nach dem Wiederöffnen
prüft der Treiber den exakt erzeugten Quelltext sowie die tatsächlich gerenderten Kartenabschnitte.
Die gelesene Überschrift und der Begleittext gehen wieder als eigenständige fachliche Einträge
in den bestehenden Rücklesebeleg ein. Entwürfe, Planhashes und historische Belege behalten ihr
Format. Ein isolierter Chromium-Lauf mit gerenderter Rücklesung prüft 320, 390, 820 und 1.219
Pixel. Die Übernahme des neuen Blocks im echten Squarespace-Editor ist noch abzunehmen.
**240/240** gezielte Browser-, Beobachtungs- und Rücklesefälle bestehen. Die vollständige Treiberprobe
in beiden echten Ansichten folgt separat.

Der bisherige Anschluss besteht mit **71/71 gezielten Journal-/Browserfällen**, **252/252 Artseitenfällen**
und **74/74 Galerie-/HTTP-Integrationsfällen** ohne Skips. Im ersten breiten Lauf verhindert die
eingeschränkte Ausführung das Anlegen eines eigenen Test-Hardlinks. Der reguläre Windows-Nachlauf
besteht vollständig; keine Schutzgegenprobe wird entfernt oder abgeschwächt. Syntaxprüfung
**707 Dateien**, Stilprüfung und lokale Dokumentationsverweise **90 Dateien** bestehen. Diese
Modulprüfungen ersetzen die noch offene echte Upload-/Wiederleseprobe nicht.

Der lokale Anschluss besteht mit **124/124 gezielten Fällen**, anschließend **242/242 Artseiten**,
**267/267 Desktopfällen**, **35/35 Explorerintegration**, **348/348 Oberflächenabläufen**,
**7/7 Routerfällen** und **95/95 Sicherungsfällen**, ohne Skips. Die echte lokale HTTP-Probe umfasst auch einen vollständigen
Plan-/Versuchs-/Beobachtungslauf mit synthetischem CMS-Adapter und unveränderten Originalfixtures.
Der rote Vorlauf belegt tatsächlich angenommene Mediendrift vor dem Dispatch. Die neue Gegenprüfung
stoppt sie; eine ältere Testannahme „beim Dispatch nicht erneut lesen“ wurde an die nun nötige
Dateiprüfung angepasst, während exakte Journalwiederholung weiterhin nichts neu liest.
Im ersten breiten Lauf war außerdem das Anlegen eines eigenen Test-Hardlinks eingeschränkt;
die qualifizierte Wiederholung konnte die isolierten Verknüpfungsgegenproben ausführen. Keine
Dateiprüfung wurde dafür entfernt und kein Windows-/Produktschutz geändert. Diese Laufprüfungen
belegen den lokalen Anschluss, keine tatsächliche Squarespace-Seitenanlage oder neue Paketabnahme.

## Gemeinsamer Projektbestand

`createSharedPageDraftAdapter({client,actorAuthority})` verwendet den vorhandenen
`SharedProjectClient`: `createObject`, `getObject`, `editExistingObject` mit Ausgangsrevision und
lokalem Datenhash sowie gezieltes `sync`. Er führt keine zweite Queue und keinen neuen HTTP-Vertrag ein.
Neue Objekte benötigen Onlineverbindung; bestehende Entwürfe verwenden dessen persistierte Offlinequeue.
Fremde Revisionen werden als Konflikt erhalten, nicht überschrieben. Der lokale Fachkern und diese
gemeinsame Transportfassung sind getrennte Adapter; Root verdrahtet UI-/Speicherworkflow ausdrücklich.

**Zuletzt geladenen Entwurf öffnen** legt offline eine persönliche Arbeitsfassung einer bereits im
Projektcache vorhandenen Seite an. Die Aktion bindet die angezeigte bestätigte Serverrevision,
Projekt und Person. Sie nutzt die zur Seite gespeicherte Artgrundlage. Ein vorhandener persönlicher
Entwurf oder ein offener Konflikt sperrt das Einlesen. Gespeicherte Änderungen gehen in die bisherige
Offlinewarteschlange. Beim späteren Abgleich bleibt eine zwischenzeitlich geänderte gemeinsame Fassung
als Konflikt erhalten. Freigaben, frische Artquellen und Website-Aktionen benötigen eine Verbindung.

Bei einem Seitenkonflikt zeigt **Seitenfassungen vergleichen** im Artseiteneditor den lokalen Entwurf
und die aktuelle gemeinsame Fassung. Solange der Konflikt offen ist, liegt die Entscheidung unter
**Gemeinsames Projekt**. Der Vergleich zeigt die Abschnittstexte, bewusste Leerstellen,
die Reihenfolge der Bilder und ihre Bildtexte für die gemeinsame Fassung und alle erhaltenen
lokalen Fassungen. Die Entscheidung bindet die angezeigte Serverrevision, Projekt und Person sowie
die vollständige Liste lokaler Fassungen. Eine zwischenzeitliche Änderung erfordert einen neuen
Vergleich. Wer eine lokale Fassung wählt, speichert ihren vollständigen Inhalt als gemeinsamen Entwurf.
Wer die aktuelle Serverfassung wählt, behält deren Revision bei. Frühere Freigaben und CMS-Entscheidungen
bleiben im Verlauf. Anschließend lässt sich die aktuelle Fassung erneut vergleichen und nach
Bestätigung als neuer persönlicher Entwurf übernehmen. Der bisherige Entwurf bleibt im lokalen
Versionsverlauf erhalten. Die Übernahme erfordert eine Onlineverbindung und gleicht die
bestätigte gemeinsame Fassung nach dem Einlesen der Artgrundlage nochmals ab. Hat der
zweite Arbeitsplatz inzwischen gespeichert, bleibt der eigene Entwurf mit seiner
Konfliktbindung erhalten. Nach einem neuen Vergleich lässt sich die jüngste Fassung übernehmen.
Die Übernahme ändert nur den persönlichen Entwurf.
Zwei getrennte Profile am isolierten Testdienst belegen den parallelen Abgleich unterschiedlicher
Seiten. Die Chromium-Bedienprobe am 10. November bestätigt gerenderte Abschnittstexte und Listen,
den Abbruch der Bestätigung und die ausdrückliche Wahl beider Fassungsarten. Die Abnahme an zwei
physischen Geräten und am NAS steht separat aus.

Der zentrale Projektabgleich aktualisiert auch den lokalen Status bereits vorgemerkter Artseiten.
Er verwendet die bereits empfangene Serverfassung aus dem persönlichen Cache. Eine Übernahme gilt
erst bei identischem Inhalt als abgeglichen. Eine zwischenzeitlich geänderte Fassung führt zum
Seitenvergleich.
Der Statusabgleich startet keinen zusätzlichen Netzwerkabruf und verändert keine lokalen Fachtexte.

Die Transportfassung ist `type:'fn-species-page'`, `schemaVersion:1`, mit `title<=500`, stabiler `pageId`,
gebundenem Dokument, Revision, Inhalts-/Bildhash, getrennten Entscheidungen und unverlierbarer Historie.
`encodePageAuthoringDraft` erzeugt sie; `importPageAuthoringAsDraft` entfernt unbekannte aktive Freigaben
und CMS-Zustände in die Historie. Lokale Artgrunddaten beim Import erneut an die aktuelle tatsächliche
Projekt-/Medienzuständigkeit anschließen, nicht fremde `runtimeReady`-Angaben als Bereitstellung werten.

Core ruft `guardPageAuthoringTransition({objectId,before,next,actorRole,projectId,receipts})` innerhalb
seiner tatsächlichen Auth-/SQLite-Transaktion auf. `actorRole` und `projectId` stammen vom Server,
`receipts` ausschließlich aus seiner unveränderlichen Belegtabelle. Eine explizite Publisherübernahme
einer internen Freigabe liefert eine Beleganforderung `{kind:'approval',revision,contentHash,imagesHash,
reportHash,approvalHash,origin:'publisher-adoption'}`; der Server ergänzt eigene IDs, Objektversion,
Ordinal, tatsächliche Person/Rolle und Zeit. Ein Contributor kann nur eine bereits aktive unveränderte
serverbelegte Entscheidung erhalten und keine alte Historienfreigabe reaktivieren.

`pageAuthoringServerEvidence({objectId,objectRevision,objectOrdinal,data,receipts})` liefert äußere
`pageAuthoringEvidence`, niemals Beweise innerhalb der bearbeitbaren `data`. Serviceversionen sind
UUIDs; historische Belege werden über serverseitige numerische Ordinals ausgewählt. Der reine
`validatePageAuthoringServerEvidence` prüft Bindungen und meldet fehlende Belege als `trusted:false`;
er ersetzt weder TLS/Authentifizierung noch den vertrauenswürdigen Ursprung der äußeren Metadaten.

Ein aus JSON mitgelieferter CMS-Erfolg erzeugt **keinen** neuen Beleg, selbst bei Publisherrolle.
Der spätere echte Adapterweg muss serverseitig separat einen geprüften `kind:'cms'`-Beleg mit
Revision, Inhalts-/Bildhash, Plan-/Quittungshash, Versuch-ID und `status:'saved-unpublished'` anlegen.
Interne Freigabe, CMS-Speichern einer unveröffentlichten Seite und tatsächliche Veröffentlichung sind
verschiedene Vorgänge. Veröffentlichung und öffentliche Nachprüfung gehören nicht zu diesem Kern.

## Leserfassung aus einem gespeicherten Seitenstand

Der neue reine Node-Kern `shared-project/species-editorial.mjs` bereitet die verlustfreie redaktionelle
Projektion vor. Er liest tatsächliche gemeinsame Page-/Artobjekte, prüft ihre bestehenden Formate,
die passende Art, bestätigte lokale Stände und unveränderte geschützte Artquellen. Der bestehende
Artseiteneditor und die Projektion verwenden dafür dieselbe `speciesPageSourceBody`-Definition.
Normale Artdateien werden zusätzlich aus der aktuellen Artquelle abgeleitet und vollständig mit
der Seitenbindung verglichen; ein mitgelieferter passender Quellenhash allein genügt nicht.

Titel, Einleitung, Abschnitte, Listen, Zwischenüberschriften, Quellen und exakt gebundene
Leerstellenentscheidungen bleiben geordnet erhalten. Mehrere Verwendungen derselben Bilddatei
behalten ihre Positionskennungen und eigenen Bildtexte. Die bestehende öffentliche Seitenadresse
bleibt erhalten; aus einem geplanten Pfad wird keine veröffentlichte URL erzeugt. CMS-Endfreigabe
und öffentliche FN-Bereitstellung sind keine Voraussetzung für diese interne Vorbereitung.

`species-editorial-intent.mjs` bindet den Zweck an Projekt, Person, Redaktionsrolle und beide genauen
Objektstände. Service-UUIDs und lokale Seiteninhaltshashes bleiben getrennt. Der Beleg ist strukturell;
er erteilt weder Berechtigung noch Freigabe. `species-editorial-adoption.mjs` berechnet den vollständigen
Record-2-Kandidaten aus diesen Quellen. Dabei ändern sich ausschließlich Datensatzversion und
Redaktion; Originalfelder, Taxonomiebindungen und normale Artdateien bleiben erhalten. Die geschützte
Page-Quellbindung bleibt bei einem reinen Redaktionsupgrade identisch.

Die vorhandene Servertransaktion unterstützt jetzt den ausdrücklichen `page-editorial-adoption`-Zweck
in `submitChange`. Sie prüft die tatsächliche Person/Rolle, den aktuellen Seitenstand und die genaue
Art-Ausgangsversion und berechnet Kandidat und Beleg selbst neu. Eine inzwischen geänderte Art erzeugt
einen erhaltenen Konflikt. Eine geänderte Seite erfordert eine neue Vorschau. Derselbe bereits bestätigte
Auftrag liefert bei verlorener Antwort seine Quittung erneut, auch wenn die Seite danach geändert wurde.
Generische Anlage oder Bearbeitung darf diesen Versions-/Redaktionswechsel nicht durchführen.

Die vorhandene persönliche Queue versiegelt den vollständigen Zweck vor dem ersten Senden. Neustart
und persönliche Sicherung bewahren seine Daten-, Projekt-, Personen- und Revisionsbindung; spätere
Grunddatenänderungen werden davon abhängig vorgemerkt. Es entsteht keine zusätzliche Datenbank.
Jede Übernahme erzeugt zunächst einen unfreigegebenen Artentwurf. Die bisherige freigegebene Leserfassung
bleibt erhalten. Der vierfeldrige Grunddatenvergleich darf einen redaktionellen Konflikt nicht auflösen;
dafür muss die Seitenübernahme auf der aktuellen Grundlage neu geprüft werden.

**Prüfung am 1. November:** Der gemeinsame Abgleichslauf umfasst 494 Fälle: 490 bestanden,
drei neue Testfixtures waren zu korrigieren, eine Verknüpfungsfixture war zunächst durch die
Ausführungsumgebung begrenzt. Die drei betroffenen Testdateien wurden danach mit 97 Fällen
nachgeprüft: 96 bestanden und dieselbe Umgebungsgrenze. Die einzelne Verknüpfungsprüfung besteht
anschließend tatsächlich im dafür geeigneten Prüfkontext (1/1), ohne Lockerung einer Produktgrenze.
Geändert wurden nur die Kontosperrenerwartung, die offene Verbindung der künstlichen alten WAL-Datei
und die getrennte HTTP-Headergrößenprobe. Der neue Testfall erhöht den qualifizierten Bestand auf
495 Fälle; dies ist eine zusammengeführte Prüfung, kein nachträglich grüner Exit des ersten Gesamtlaufs.
Die zusätzlichen 77 NAS-/Oberflächen-/Seitenanbindungsfälle bestehen ebenfalls zusammen mit der
gezielten Wiederholung der neun Authorityfälle im geeigneten Verknüpfungskontext. Syntax, Stil und
90 Dokumentverweise sind geprüft. Die privaten Einzelprotokolle liegen im bestehenden Prüfbereich.

**Nächster Anschluss:** Die vollständige Reader-Catalog-2-Projektion, paginierter Dienstabruf und
eine erneut an die tatsächliche Leserprojektion gebundene interne Freigabe sind lokal ergänzt.
Der Standardweg bleibt Catalog 1 und stoppt bei Record 2 ausdrücklich mit
`reader_catalog_version_required`; Bildverwendungen oder Richtext werden dort nicht abgeschnitten.
Details führt der [Readervertrag](../shared-project/README.md#erweiterte-leserfassung).
Die sichtbare Exploreraktion ist im Quellstand ergänzt: **In Artbestand übernehmen** zeigt erst
eine kompakte Gegenüberstellung. **Als Artentwurf übernehmen** merkt die geprüfte Fassung vor;
danach bleibt der ausdrückliche Projektabgleich erforderlich. Interne Leserfreigabe und
Squarespace-Veröffentlichung sind weiterhin eigene Schritte. Offene Eingaben oder eine andere
Person, Seite, Rolle beziehungsweise Ausgangsfassung entwerten die Vorschau. Eine nach bestätigter
Vormerkung geänderte persönliche Seite wird als solche gemeldet, ohne neue Eingaben zu verlieren.
Die normale private Bild-/Tonablage ist dienstseitig ergänzt und mit dem ausdrücklichen Windows-
Bereitstellungsweg im internen Artfreigabedialog verbunden. Bei fehlendem lokalen Original kann
die gespeicherte Vorschau eine bereits bereitgestellte Datei authentifiziert lesen. Normale
Dateikennungen werden über ihre konkrete Art-/Metadatenbindung eingeordnet. Der neue lokale
Artseiten-Nachlauf besteht mit **192/192 Fällen**; native Bedienabnahme, zusätzlicher Offline-
Dateicache, kompatible Geräteanbindung und NAS-Aktivierung bleiben offen.
Der vollständige lokale Artseiten-Nachlauf vom **2. November** besteht mit **182/182 Fällen ohne
Skips**, einschließlich der neuen Übernahmevorschau, des bestätigten Queueabschlusses und der
bestehenden Speichern-/Freigabe-/Quellen-/Konfliktgrenzen. Die erste gezielte Serie hatte eine
doppelt reservierte Test-Zieladresse; diese Fixture ist korrigiert, ohne die Zielpfadsperre zu lockern.

## Lokale Texthilfe im Editor

Die optional angeschlossene Texthilfe verwendet den vorhandenen lokalen KI-Dialog und dessen
persönliche Jobqueue. Ein Bildvorschlag bezieht sich auf genau die gespeicherte Bildposition und
deren tatsächlich verfügbares Bild. Fachvorschläge benötigen die bewusste Auswahl vorhandener
Textgrundlagen; sachliche Prüfhinweise zeigen ihre tatsächlichen Belegstellen. Bewusste Leerstellen
werden nicht aufgefüllt. Die Annahme eines Vorschlags ändert nur den offenen Editorentwurf.

**Sprache prüfen** prüft einen gespeicherten bearbeitbaren Abschnitt ohne zusätzliche Quellenwahl.
Der automatisch erzeugte Allgemeinblock bleibt ausgenommen. Korrekturen behalten alle vorhandenen
Absatz-/Überschriften-/Listenstrukturen und Quellen; eine Ersetzung über deren Grenzen ist nicht
annehmbar. Im Dialog wird diese gebundene Fassung bewusst angenommen, danach ist sie im Abschnitt
normal weiter bearbeitbar. Grenzen und Prüfstand führt der [Vertrag der lokalen Texthilfe](../local-ai/README.md#artseitenanschluss-und-sprachprüfung-im-neuen-quellstand).

## Prüfung und verbleibende Grenzen

`explorer-session.mjs` verbindet den persönlichen Client mit genau einem lokalen
`page-authoring.sqlite` im Appprofil. Der Workspace trennt darin Projektadresse und tatsächliche Person;
ältere nicht zugeordnete Fassungen bleiben als solche erhalten. Speichern und bewusstes Synchronisieren
verwenden die vorhandene Clientqueue. Eine verlorene Antwort wird zuerst lesend geklärt; sie erzeugt
keinen automatischen zweiten Anlegeauftrag. Lokale Nachfolgefassungen, ungewisse Antworten und Konflikte
bleiben auch für Schließ- und Update-Abschlussprüfungen sichtbar.

`explorer-authorities.mjs` liest ausschließlich echte vollständige Artobjekte und feste gebundene
Artassetnamen. Die Bereitstellung für FN-Module wird gegen die fest vorgegebene öffentliche Quelle und
tatsächliche Bildbytes geprüft. Eine interne Freigabe oder ein aus fremdem JSON übernommenes Flag ist
kein Ersatz dafür. Importe neuer Galeriefotos erfolgen über den persönlichen Mediencache mit 20 MiB
je JPEG/PNG/WebP und tatsächlicher Dekodierprüfung. Status, Liste und Fremdentwurfsimport laden keine
Bildbytes nach; vorhandene Serverbilder lassen sich ausdrücklich herunterladen. Die persönliche
Gerätesicherung muss gespeicherte Seiten und ihre benötigten lokalen Bilder beziehungsweise exakt
gebundenen Serverbelege gemeinsam berücksichtigen. Sie schließt keine Serverbildbytes ein.

```powershell
node --test --test-concurrency=1 species-explorer/page-authoring/*.test.mjs
node species-explorer/page-authoring/source-parity.mjs <absoluter-gebundener-HTML-Quellordner>
```

Tests arbeiten nur in eigenen `temp/tests`-Sitzungen: echte SQLite-Dateien/CAS/Neustart, zwei echte
konkurrierende Nodeprozesse, realer lokaler HTTP-Shared-Service, persistierte Offlinequeue nach Reopen,
fremder Konflikt, Rechte-/Beleggrenzen, Bildfolge, XSS, Dateidrift, veraltete Freigaben und unsichere
CMS-Quittungen. Die zusätzlichen Grenztests belegen vollständige redaktionelle Arbeit ohne Zieladapter,
stabile Artassetbindung, explizite Quellenaktualisierung, unveränderte historische Fassungen sowie
Quellendrift vor Endfreigabe und während der CMS-Zielbeobachtung. Der optionale Quellabgleich ist rein lesend und benötigt die bereits erfassten
hashgebundenen HTML-Dateien; CI hängt nicht von diesen privaten Dateien ab.

Kein Zielgerät, NAS, Produktivkonto oder Browser wurde für diese Modulprüfungen verwendet. Keine
Artseite, bestehende Artdatei oder produktive Alttextentscheidung wurde geändert. Noch abzunehmen
sind der neue durchgehende UI-/Projekt-/Medienanschluss, der beobachtete Squarespace-Editorweg, die gezielte Behandlung
eines ungewissen früheren CMS-Versuchs und ein ausdrücklich freigegebener realer End-zu-Ende-Pilot.

Der Quellenreview vom **2. November** hat einen Verlust im vorbereiteten CMS-Plan gefunden:
Abschnitts- und Seitenquellen standen im Vorschau-HTML, fehlten jedoch in `structure.slots`.
Der neue Quellstand nimmt sie als geordnete `source`-Slots samt vollständiger Quellenkennung,
Beschriftung und optionaler URL/Prüfsumme auf. Abschnittsquellen bleiben bei ihrem Abschnitt,
Seitenquellen folgen der Galerie; auch eine Änderung unsichtbarer Quellenbelege verändert den
Strukturhash und erfordert eine neue Freigabe. Die ergänzten Gegenproben prüfen Plan, Reihenfolge,
sichere Darstellung, Speicherung/Roundtrip und erhaltene historische Pläne.
Die unveränderte frühere Gitquelle reproduziert den Fehler: sichtbare Quellen sind vorhanden,
semantische Quellenslots fehlen und eine alleinige Änderung der Quellenprüfsumme bleibt im alten
Strukturhash unsichtbar. Der neue Plan besteht mit sieben gezielten Quellen-/Startfällen; der betroffene
Artseiten-Nachlauf besteht inzwischen mit 221/221 Fällen. Alte konsistente Berichte, Freigaben und Pläne bleiben
als Historie sicherbar und wiederherstellbar. Die lesende Sicherungsprüfung akzeptiert dazu exakt
die frühere vollständige Struktur ohne Quellenslots; teilweise oder anders veränderte Strukturen
und gemischte Bericht-/Planketten werden abgewiesen. Eine neue Ausführung benötigt die aktuelle
vollständige Struktur und erneute Prüfung; historische Belege sind keine neue Ausführungsfreigabe.
Auch ein bereits früher vorbereiteter CMS-Versuch wird vor einem neuen Start gegen die vollständige
aktuelle Struktur geprüft. Ein wiederholter identischer Startauftrag liefert ausschließlich seine
vorhandene Journalquittung zurück; er startet keine zweite externe Bearbeitung.
Bei einer früheren Browserprobe wurde eine eigene leere Seite angelegt und vor der Inhaltseingabe
deaktiviert. Auch die neutrale Textbearbeitung mit anschließendem Speichern ist beobachtet.
Die durchgehende automatische Abnahme mit Upload und Rücklesung im echten Editor steht weiterhin aus.
`targetAuthority` bleibt im normalen Exploreranschluss bis zur vollständigen Treiberprüfung offen.
