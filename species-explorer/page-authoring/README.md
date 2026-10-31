# Artseiten-Entwurfskern

Stand: 31. Oktober 2026. Dieser Ordner enthält den Fachkern und seine isolierten Tests.
Explorer-Oberfläche, gemeinsame Dienstinstallation und beobachteter Squarespace-Browseradapter werden
außerhalb dieses Moduls angeschlossen. Kein Aufruf hier veröffentlicht eine Seite oder führt Browsercode aus.

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
| `speciesAuthority.snapshot(context,slug)` | Angelegte Art mit wissenschaftlichem/deutschem Namen, Taxonomie, Allgemeindaten, Status, gebundener Revision/`dataSha256`, `runtimeReady` und normalen Assetmetadaten. Fehlende Daten offen zurückgeben; `runtimeReady` bedeutet tatsächliche Bereitstellung für die bestehenden FN-Module. |
| `mediaFacade.describe(context,assetId)` | Projektgebundene Metadaten `{id,projectId,sha256,bytes,mimeType,attribution}` zu einer verwalteten Datei. Auch offline müssen bekannte Metadaten erreichbar bleiben. |
| `mediaFacade.read(context,assetId)` | Ausschließlich verwaltete lokale/gespeicherte Bytes; keine Rendererpfade, keine frei gewählten URLs. Das Modul prüft Länge, Hash und Dateisignatur. Die Fassade muss Größen-/Bildgültigkeitsprüfungen bereits bei der Bereitstellung erledigen. |
| `targetAuthority.checkNew(context,path)` | Lesende frische Zielbeobachtung `{path,exists:false,parentPath,parentExists:true,online:true,observationId,checkedAt}`. Vorhandenen übergeordneten Websitebereich tatsächlich bestätigen; höchstens zwei Minuten alt, kein unbekannter Erfolg. Keine Zielseite anlegen. |
| `repository` | Dedizierter persistierter CAS-/Artefakt-/CMS-Journalspeicher. Mitgeliefert: `createSqlitePageAuthoringRepository({filename,localStorageConfirmed:true})`. Nur eigener lokaler Profilpfad, kein NAS-SQLite und keine vorhandene fremde Datenbank. |

Normale Assets folgen unverändert `species-assets/<sanitizeAssetName(deutscher Name)>/` mit
`portrait.webp`, `map.jpg`, `sound.mp3`, `credits.json` und `spectrogram.webp`. Galeriepositionen verwenden
stabile Verwendungs-ID plus verwaltete Asset-ID, Hash, bearbeitbare Alternativtexte und Beschriftungen.
Diese Texte werden unverändert erhalten, ohne automatischen Satzpunkt. Ein neuer Upload muss zuerst
über die vertrauenswürdige Medienfassade verwaltet werden. Das ist keine Upload- oder Pfadlese-API.
Dateigröße ist je Asset auf 32 MiB, die Galerie auf 200 Positionen, die lokale Vorschau auf insgesamt
96 MiB eindeutige gebundene Medien und ein Seitenobjekt auf 2 MiB Metadaten begrenzt.

## Fachoperationen

Alle Änderungen erhalten eine eindeutige `mutationId`; wiederholte identische Aufträge sind persistent
gebunden. Eine andere Eingabe unter derselben Kennung wird abgelehnt. `expectedRevision` bezeichnet
immer den exakten lokalen CAS-Versionshash, nicht eine fremde Shared-Service-UUID.

| Methode | Verhalten |
| --- | --- |
| `createDraft(context,{draftId,mutationId,templateId,slug,parentPath,title?})` | Nur online und redaktionell berechtigt; bestätigt den noch freien neuen Pfad, bindet die angelegte Art und legt einen leeren Entwurf an. |
| `getDraft(context,draftId)` | Eigener Projektstand, bearbeitbare Felder, nur zur aktuellen Revision aktive Endfreigabe, getrenntes CMS-Journal. `published:false` bleibt ausdrücklich wahrheitsgemäß. |
| `saveDraft(context,{draftId,mutationId,expectedRevision,document})` | Redaktionelle Bearbeitung auch bestehender Offlineentwürfe; echte SQLite-CAS, keine Websiteaktion. `editableDocument` liefert ausschließlich bearbeitbare Felder. |
| `confirmEmpty(context,{draftId,mutationId,expectedRevision,sectionId,confirmed:true,reason})` | Bindet bewusste Leerstelle an Abschnittshash und tatsächliche Person. |
| `preview(context,{draftId,mutationId,expectedRevision})` | Geprüfte Bytes, statische HTML-Vorschau, vollständige Seitenstruktur und persistierter Prüfbericht. Vorschau führt weder FN-Laufzeitskripte noch Websitezugriffe aus. |
| `approve(context,{draftId,mutationId,expectedRevision,previewId,reportHash,review,missingAltAcknowledged})` | Nur Admin/Publisher online; `review:{texts:true,images:true,layout:true}` bestätigt menschliche Endprüfung. Bericht und Dateien werden erneut gebunden. Noch fehlende Alttexte benötigen die exakte bestätigte Liste ihrer Bild-IDs. |
| `prepareCmsPlan(context,{draftId,mutationId,expectedRevision,approvalId})` | Erneute Datei-/Zielprüfung; semantischer Plan für eine neue **unveröffentlichte** Seite einschließlich wirklicher FN-Codeblöcke und geordneter Galerieassetreferenzen. Keine erfundene CMS-API oder Selektoren. |
| `beginCmsAttempt(context,{draftId,mutationId,expectedRevision,planId})` | Persistiert einmaligen Ausführungsauftrag vor einer echten CMS-Handlung. Kein automatischer zweiter Versuch, auch nach Neustart nicht. |
| `dispatchCmsAttempt(context,{mutationId,attemptId,expectedStateRevision,dispatchId})` | Nur vertrauenswürdiger Adapter der freigebenden Person; journalisiert Beginn vor externem Schreiben. Führt selbst nichts im CMS aus. |
| `recordCmsOutcome(context,{attemptId,receipt})` | Nur vertrauenswürdiger Adapter. Quittung bindet Auftrag, Plan, Inhalts-/Bildhash, Pfad und gelesene Seitenstruktur. Exaktes Duplikat ist idempotent, widersprüchliche Quittung wird ungewiss. |

`preview.report` enthält Inhalts-, Bild-, Vorlagen-, Artgrunddaten-, Struktur-, Vorschau- und Berichtshash.
Die Freigabe bindet die vollständige Revision. Jede relevante Änderung macht sie inaktiv; alte
Artefakte bleiben historisch erhalten. Dateidrift ohne Entwurfsänderung blockiert trotzdem Endfreigabe
beziehungsweise CMS-Plan. Ein technischer Bericht ist keine fachliche oder modellgestützte Abnahme:
`editorialReview:'human-required'`, `modelReview:'not-performed'`, `publicVerification:'not-performed'`.

Die Vorschau escaped Texte und Quellangaben, verwendet ausschließlich geprüfte Raster-/Ton-Data-URLs,
blockiert Skripte, Netzverbindungen, Frames und Formulare per CSP und führt normale FN-Codeblöcke nicht
aus. Sie ist eine prüfbare lokale Zusammensetzung, keine pixelgenaue Squarespace-Darstellungsabnahme.

## Gemeinsamer Projektbestand

`createSharedPageDraftAdapter({client,actorAuthority})` verwendet den vorhandenen
`SharedProjectClient`: `createObject`, `getObject`, `editExistingObject` mit Ausgangsrevision und
lokalem Datenhash sowie gezieltes `sync`. Er führt keine zweite Queue und keinen neuen HTTP-Vertrag ein.
Neue Objekte benötigen Onlineverbindung; bestehende Entwürfe verwenden dessen persistierte Offlinequeue.
Fremde Revisionen werden als Konflikt erhalten, nicht überschrieben. Der lokale Fachkern und diese
gemeinsame Transportfassung sind getrennte Adapter; Root verdrahtet UI-/Speicherworkflow ausdrücklich.

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

## Prüfung und verbleibende Grenzen

```powershell
node --test --test-concurrency=1 species-explorer/page-authoring/*.test.mjs
node species-explorer/page-authoring/source-parity.mjs <absoluter-gebundener-HTML-Quellordner>
```

Tests arbeiten nur in eigenen `temp/tests`-Sitzungen: echte SQLite-Dateien/CAS/Neustart, zwei echte
konkurrierende Nodeprozesse, realer lokaler HTTP-Shared-Service, persistierte Offlinequeue nach Reopen,
fremder Konflikt, Rechte-/Beleggrenzen, Bildfolge, XSS, Dateidrift, veraltete Freigaben und unsichere
CMS-Quittungen. Der optionale Quellabgleich ist rein lesend und benötigt die bereits erfassten
hashgebundenen HTML-Dateien; CI hängt nicht von diesen privaten Dateien ab.

Kein Zielgerät, NAS, Produktivkonto oder Browser wurde für diese Modulprüfungen verwendet. Keine
Artseite, bestehende Artdatei oder produktive Alttextentscheidung wurde geändert. Noch anzuschließen
sind echte UI-/Projekt-/Medienadapter, der beobachtete Squarespace-Editorweg, die gezielte Behandlung
eines ungewissen früheren CMS-Versuchs und ein ausdrücklich freigegebener realer End-zu-Ende-Pilot.
