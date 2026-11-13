# Abschlussaktion eines gespeicherten Updateauftrags

Stand: 3. November 2026. Die getrennten Module sind zentral mit Main, Server,
Updateauswahl und sichtbarer Statusanzeige verbunden. Ein isolierter Desktop-Prüfstarter und sein
kleiner echter Datenbestand dienen der sichtbaren Windows-Prüfung. Alle vier Aktionen sind im
getrennten Prüfstarter belegt, einschließlich des Abbruchs und des vollständigen Ablaufs von
**Herunterfahren**. Der Prüfstarter fängt Herunterfahren und Neustart vor dem Windows-Systemaufruf ab.
Die normale Desktop-Integration und tatsächliche Windows-Aktionen bleiben eigene Prüfgrenzen.

## Verhalten und Zustände

Die Auswahl erfolgt vor dem frischen bestätigten Gesamtauftrag: `none`, `exit-explorer`, `shutdown`
oder `restart`. Standard ist `none`. Die Gerätekennung und der Anzeigename stammen aus einer
vertrauenswürdigen lokalen Gerätekonfiguration, nicht aus einem frei übernommenen HTTP-Ziel.
Jede neue Programmsitzung erhält eine neue `sessionId`; diese Kennung nicht dauerhaft wiederverwenden.
Die eigene Ablage liegt auf dem lokalen Geräteprofil, nicht auf dem NAS oder einem gemappten NAS-Laufwerk.
Direkte UNC-Ziele und Verzeichnisverknüpfungen werden abgewiesen.

| Zustand | Bedeutung |
| --- | --- |
| `inactive` | Nichts tun |
| `selected` | Auswahl vor Start; noch kein Updateauftrag gebunden |
| `waiting-update` | Tatsächlich neu gespeicherter Gesamtauftrag gebunden; Erfolg steht aus |
| `awaiting-display` | Echter Gesamterfolg und Schließschutz bestätigt; Countdown sichtbar machen |
| `countdown` | Angezeigter, auftragsgebundener Countdown bestätigt; volle 60 Sekunden laufen |
| `blocked` | Eigene Eingaben, Schreiber, Routine, Übernahme oder unbekannter Schutzstatus verhindern die Aktion |
| `cancelled` / `disarmed` | Abgewählt beziehungsweise nach Auftragswechsel/Neustart deaktiviert |
| `claimed` | Dauerhafter exklusiver Claim liegt vor; regulärer Schließweg läuft |
| `requested` | Der Ausführungsadapter hat die Anforderung angenommen; dies beweist kein physisches Herunterfahren |
| `uncertain` | Schließen, Ausführung oder gespeicherter Ausgang ungeklärt; niemals automatisch wiederholen |

Nach beseitigter Blockade beginnt erst nach erneuter sichtbarer Bestätigung ein neuer vollständiger
Countdown. Die eigentliche Dauer wird monoton gemessen; ein Sprung der Windows-Uhr verkürzt sie nicht.
Statuslesen löst keine Aktion aus. Aktives `evaluate()` beziehungsweise `startMonitoring()` prüft und
begleitet den Auftrag. Wartephasen werden alle zehn Sekunden, ein laufender Countdown jede Sekunde geprüft.
Kein Modul startet eine zusätzliche NAS-Sicherung.

## Echte Abschlussquelle

`createUpdateCompletionProofReader({ taxonomyRoot, masterService, maintenanceService })` liest
`master/update-workflow.json`, den vorhandenen gemeinsamen `taxonomy-publication/active.json`-Zeiger
und die frischen echten Master-/Wartungsstatuswerte. Es öffnet keine Datenbanken und bildet keine neuen
Prüfsummen großer Datenbanken. Die bestehenden Paarprüfungen sind bereits vor dem gespeicherten
Koordinatorabschluss ausgeführt; diese Quelle wird zusätzlich über konkrete IDs abgeglichen.

Erforderlich sind unter anderem `status/phase=completed`, gültige Start-/Endzeit, bestätigter Quellenplan,
gegebenenfalls `sourceCompleted`, konkrete `masterVersion`, kein aktiver Schreiber/Kandidat oder offene
Entscheidung, aktuelles Suchpaket und übereinstimmende aktive Master-/Paket-/Veröffentlichungs-IDs.
Bei einem begonnenen eigenen Aufbau muss der echte Buildjob dieselbe `updateRunId` besitzen.
Die Workflowdatei wird nach den Statusabfragen erneut gelesen. Ein importierter Quellenstand,
UI-Prozentwert oder frei übergebenes `success=true` genügt nicht.

`proofReader` ist eine getrennte vertrauenswürdige Schnittstelle. Für den künftigen NAS-Dienst kann Root
denselben nachgewiesenen Auftrags-/Paarstatus aus dem authentisierten Dienst bereitstellen. Keine
Renderer-Erfolgsmeldung zur Nachweisquelle machen. Die Standard-Startbindung prüft die gespeicherte neue
Run-ID gegen den zuvor gelesenen Lauf und die Startzeit gegen den lokalen Auswahlzeitpunkt. Bei verschiedenen
Dienst-/PC-Uhren kann ein vertrauenswürdiger `verifyStartBinding`-Adapter stattdessen die konkrete dauerhaft
gespeicherte Startquittung/Selektionsbindung prüfen; ein UI-Boolean ist dafür nicht zulässig.

## Root-Integration

1. `createUpdateCompletionService()` mit lokalem `stateRoot`, Gerätekennung/-name, echtem `proofReader`,
   frischem `readCloseState`, `prepareClose` und `execute` erzeugen. Die Standardzählzeit beträgt 60 Sekunden.
2. Im frischen Startdialog die Auswahl anbieten. Vor `coordinator.start()` `prepareSelection()` aufrufen;
   danach `bindStartedRun()` ausschließlich mit dessen tatsächlich neu gespeicherter Run-ID aufrufen.
   Schlägt der Start fehl oder wird er abgebrochen, die vorbereitete Auswahl gezielt abbrechen.
3. Die zentrale Integration nimmt die Auswahl mit dem geschützten `sequence-start`-Auftrag entgegen;
   `start.mjs` bindet Auswahl und tatsächlichen Start intern. Frei verwendbare `bind`-/Claim-/Execute-
   Routen gibt es nicht. Nur Status, `displayed` und `cancel` sind lokal erreichbar. Die verbindliche
   Gerätekennung kommt aus dem lokalen Dienst, nicht aus einer ungeprüften Bodykennung.
4. Den neuen `public/app-update-completion.js`-Controller in den vorhandenen Update-/Statusdialog einhängen.
   Er verwendet standardmäßig `/api/taxonomy/update-completion/*`; `requestJson` muss die bestehenden
   Authentisierungs-/CSRF-Regeln verwenden. `showCountdown()` öffnet/zeigt den vorhandenen lokalen Bereich;
   `hasUnsavedDrafts()` muss alle tatsächlichen lokalen Editoren berücksichtigen. Ohne sichtbare Anzeige
   oder bei unbekannten Drafts wird nicht bestätigt. Ein alter gespeicherter Aktionswert wird nicht als
   neuer Dropdownstandard übernommen.
5. `startMonitoring()` am lokalen Desktopbesitzer oder gezieltes `evaluate()` nach Koordinatoränderungen
   verwenden. Beim regulären Beenden `close()` abwarten. Sein eigener auftragsgebundener Close vermeidet
   einen Selbst-Deadlock, während der dauerhafte Claim erhalten bleibt.

`createDesktopUpdateCompletionAdapter()` erhält `deviceId` und die **gleiche aktuelle** `sessionId`
wie der Service. Vertrauenswürdige Verdrahtung, sinngemäß:

```js
let desktop;
const completion = createUpdateCompletionService({
  stateRoot, deviceId, deviceName, proofReader, readCloseState,
  prepareClose: (context) => desktop.prepareClose(context),
  execute: (context, receipt) => desktop.execute(context, receipt),
});
desktop = createDesktopUpdateCompletionAdapter({
  deviceId, sessionId: completion.sessionId,
  readClaim: (id) => completion.readClaim(id),
  consumeClaimExecution: (context) => completion.consumeClaimExecution(context),
  readCloseState, beginRegularClose, finishExplorerExit, restoreAfterFailure,
});
```

Claimlesen, Claimverbrauch und native `execute()` nicht als frei verwendbare Renderer-/HTTP-Methoden
anbieten. Der komplette Ausführungskontext stammt ausschließlich aus dem lokalen Service.

`readCloseState(context)` muss frisch liefern:

```js
{
  deviceId, known: true, uiDrafts: false, countdownVisible: true,
  writersActive: false, jobsActive: false,
  pipeline: { status: "idle" }, backup: { status: "idle" },
  websiteTransfer: { running: false },
  pendingChanges: { hasPendingChanges: false },
}
```

`running`/`awaiting-review`, offene Eingaben/Änderungen und unbekannte Werte blockieren. Die bestehenden
Schutzprüfungen nicht mit konstanten `false`-Werten ersetzen. `beginRegularClose(context)` muss die
vorhandene Schließbarriere erwerben, neue eigene Schreiber verhindern, Drafts erneut prüfen und alle
eigenen Schreib-/Hilfsprozesse regulär abschließen. Es beendet zunächst den App-Server, hält aber den
verantwortlichen Desktopprozess für Quittung und Ausführung am Leben. **Unter der Mutationsbarriere**
den gespeicherten Auftrag und das aktive Paar erneut gegen `context.proofRevision` prüfen; ein in der
Zwischenzeit gewechselter Auftrag darf keinen positiven Schließbeleg erhalten. Rückgabe:

```js
{ deviceId, updateRunId: context.updateRunId, claimId: context.claimId,
  proofRevision: context.proofRevision,
  ownWritersClosed: true, appServerClosed: true }
```

Erst `finishExplorerExit()` schließt das verbleibende Fenster beziehungsweise ruft den vorhandenen
regulären Exit auf. `restoreAfterFailure()` kann nach unvollständigem Schließen die App wieder erreichbar
machen oder den Fehler sichtbar darstellen; es wiederholt keine Systemanforderung.

## Ausführung und Wiederanlauf

Auswahl, Auftragsbindung und Ergebnis liegen in kleinen lokalen JSON-Dateien. Auswahl- und Dispatchclaim
werden jeweils exklusiv mit `wx` angelegt und vor Weiterarbeit synchronisiert. Der erste Claim steht **vor**
dem regulären Schließen. Ein zweiter dauerhafter Verbrauch erfolgt **vor** der tatsächlichen Anforderung,
sodass auch zwei Adapterinstanzen denselben Claim nicht zweimal ausführen. Ein beschädigter/ungeklärter
Claim oder eine erhaltene Eigentümersperre wird nicht still bereinigt. Bei Neustart werden alte aktive
Auswahlen deaktiviert; beanspruchte ungewisse Vorgänge werden angezeigt und nie wiederholt.

Das ist bewusst **höchstens eine Anforderung**, keine Behauptung einer atomaren Transaktion zwischen
Dateisystem und Betriebssystem. Nach Antwortverlust kann nicht entschieden werden, ob Windows die
Anforderung angenommen hat. Sicherheitshalber gibt es keinen automatischen Retry und keine automatische
erneute Aktivierung. Ein Exitcode 0 bestätigt eine angenommene Anforderung, kein ausgeschaltetes Gerät.

Der native Adapter startet ausschließlich das lokale `%SystemRoot%/System32/shutdown.exe` mit
`["/s", "/t", "0"]` beziehungsweise `["/r", "/t", "0"]`, `shell:false`, ohne `/f`, ohne Remoteziel
und ohne Windows-Countdown. Der sichtbare abbrechbare Countdown läuft vollständig in der App.
Andere Programme behalten ihre normalen Speicherrückfragen. Explorer beenden verwendet keinen OS-Befehl.

## Prüfung und heutige Grenze

### Isolierte integrierte Desktopprobe

`qualify-desktop.mjs` ist ein ausdrücklich separat gestarteter Prüfkompositor. Er nutzt den echten
Explorer-Server, Owner, ProofReader und die vorhandene Oberfläche, führt aber nicht die normale
`desktop/main.mjs`-Kompositionswurzel aus. Er setzt vor dem ersten asynchronen Schritt sein eigenes
Chromiumprofil und erzeugt ausschließlich eine neue besitzgebundene Testsitzung. Unter normalem
Node verweigert er den GUI-Start. Fremde Speicher-/Gitziele werden verworfen; globale Gitkonfiguration,
Hooks und das Elternrepository werden nicht verwendet. Der normale Explorer wird nicht beendet.

Der echte begrenzte CoL-Import enthält 123 Namensdatensätze; der Master umfasst genau die eigene
Fixture-Art Amsel und ihre Hierarchie. Der Katalognachweis bindet eine selbst angelegte leere
Testdatei; er behauptet keine Lightroom-SDK-Erfassung. Eine vollständige Gegenprobe baut und prüft
das aktive kleine Master-/Suchpaketpaar. Für die spätere Bedienprobe bleibt nur das eigene Suchpaket
noch fehlend: Die unveränderte UI-Entscheidungsfunktion bietet dann `sync-lightroom` an. Vor dem
tatsächlichen Start bleiben Gesamtauftrag und Erfolgsbeweis leer. Ein künstlicher `current`-Auftrag
über HTTP wäre kein Ersatz, da die normale Oberfläche diesen Fall vor dem Update-Start beendet.

Der Prüfstarter ersetzt ausschließlich den letzten Windows-Prozessstart durch einen fest gebundenen
Protokollierer ohne echten Spawn-Fallback. Er akzeptiert genau einmal den zur ausgewählten Aktion
passenden lokalen Befehl mit `/s /t 0` oder `/r /t 0`, ohne Shell und Zwangsflag; auch fehlerhafte oder
wiederholte Aufrufe starten kein Programm. Die normale Zählzeit bleibt 60 Sekunden. Das Prüf-Fenster
darf nach dem echten regulären Serverabschluss schließen; der PC bleibt eingeschaltet.
Der Browser darf nur seine eigene Loopback-Adresse lesen und die drei benötigten Update-/Anzeige-/
Abbruchrouten schreiben. Anbieterabrufe, NAS-/Sicherungswege und Lightroom-Schließen sind nicht Teil
dieser Probe. Countdownabbruch und ungespeicherte Eingaben müssen über die tatsächliche Oberfläche
geprüft werden; Schutzwerte werden dafür nicht konstant als erfolgreich ersetzt.

Vor dem sichtbaren Start ein exklusives Bedienfenster mit Numis und Kauf-Suchcockpit abstimmen.
Danach beispielsweise `npm run qualify:update-completion -- --action none` verwenden. Für
`exit-explorer`, `shutdown` und `restart` jeweils eine frische Sitzung mit dem entsprechenden Ziel
starten und dieselbe Aktion im normalen Update-Dialog wählen. Die erzeugten Belege liegen zunächst
im eigenen Sitzungsordner und sind vor einer späteren gezielten Bereinigung dauerhaft zu binden.
Ein simulierter Exitcode bestätigt nur die abgefangene Anforderung, kein tatsächliches Windowsende.

Die vorbereitende Serie besteht mit **10/10 Fällen**, ohne Fehler oder Skips: Start-/Pfad-/Git-/
Prozessabschirmung sowie beide tatsächlichen kleinen Datenaufbauten einschließlich Wiederlesung und
regulärem Dienst-/SQLite-Abschluss. Der private Beleg ist
`completion-qualification-preparation-20261102.log` im vorhandenen Bereitstellungsprüfbereich.
Dies belegt noch keine sichtbare Countdown-/Schließprobe oder reale Systemaktion.

Die erste tatsächliche Windows-Probe vom **2. November** erreicht nach einer Korrektur des separaten
Starters ein eigenes sichtbares Electronfenster mit unveränderter Oberfläche und tatsächlichem Server.
Der normale Explorer bleibt offen. Der erste Starter wartete auf Top-Level auf den gesamten GUI-Ablauf
und blockierte dadurch die eigene Bereitschaft; das Warten liegt nun im asynchronen Ablauf, der
Moduleinstieg selbst wird freigegeben. Das folgt den
[Electron-Regeln für ESM und Bereitschaft](https://www.electronjs.org/docs/latest/tutorial/esm).
Eine zwischenzeitliche doppelte Icon-Einbindung ist nach Syntaxprüfung korrigiert.

Der erste bediente Pilot ist ausdrücklich **nicht erfolgreich**: Der kleine Bestand wird im normalen
Header zunächst als **Änderungen übertragen** eingestuft. Sein Pipeline-Vorschauweg wird vom engen
Prüfbrowser angehalten, bevor der gewünschte Taxonomieablauf erreicht ist. Gespeichert bleiben
`workflow:null`, `proof.ready:false` und kein Systemaufruf. Das eigene Fenster schließt regulär;
sein Prozess endet mit Exitcode 0. Die lesende Gegenprobe am erhaltenen Pilotbestand findet genau
ein fehlendes Artporträt; Eingabedaten und Bericht sind konsistent, der echte Transferplan enthält
keine Ziele und die tatsächliche Git-Änderungsliste ist leer. Die generische Testfixture muss deshalb
um ihr eigenes synthetisches Porträt vervollständigt werden. Ein vollständiger Bootstrap-/Dashboard-
Nachweis folgt daraus gesondert. Keine konstanten UI-Erfolgswerte und keine pauschale Freigabe
weiterer Schreibwege ersetzen diesen Schritt.
Der native Teilbeleg einschließlich Quittung und Protokoll ist dauerhaft privat unter
`completion-native-first-20261102/` im bestehenden Bereitstellungsprüfbereich erhalten.

Die korrigierte Vorbereitung enthält nun eine kleine gültige eigene WebP-Grafik mit ausdrücklich
synthetischen Metadaten und tatsächlich geprüften Bild-/Metadatenhashes. Der Prüfserver liest vor
der sichtbaren Fensteröffnung seine echten Validierungs-/Änderungsantworten und hält bei einem
offenen Befund an. Ein weiterer integrierter Test verbindet den tatsächlichen HTTP-Server mit den
unveränderten Foundation-, Lifecycle-, Dashboard- und Headercontrollern: Validierung ohne Befunde,
keine Pipeline-/Gitänderungen und der echte registrierte Klickhandler öffnen den Chooser, ohne
POST oder Pipelinevorschau. **11/11 Fälle bestehen**, alle eigenen Dienste schließen regulär.
Der Browserzaun bleibt unverändert.

Die anschließende native Wiederholung mit **Nichts tun** erreicht über die tatsächlichen Dialogfelder
einen gespeicherten erfolgreichen `sync-lightroom`-Auftrag, ein aktiviertes Master-/Suchpaketpaar und
`proof.ready:true`. Die Abschlussaktion bleibt `inactive`; das eigene Fenster bleibt bis zum
manuellen regulären Schließen geöffnet. Der Beleg liegt privat unter
`completion-native-none-20261102/`; er bestätigt weder die normale Main-Komposition noch einen
Lightroom-SDK-Lauf oder eine Windows-Systemaktion. Beim Öffnen der Datenbankauswahl zeigt der enge
Prüfbrowser zunächst einen Fehler, weil der zusätzliche Quellen-Vorschau-POST gesperrt bleibt;
der anschließende echte Suchpaketabgleich und sein Abschluss sind davon getrennt erfolgreich.

Bei der ersten nativen Variante **Explorer beenden** startet der Countdown bereits hinter dem noch
offenen modalen Datenbankdialog. Nach dessen Schließen werden nur noch **36 Sekunden** sichtbar.
Vorhandene Layoutrechtecke beweisen hier keine bedienbare Anzeige; der Banner liegt hinter dem Modal.
Die sichtbare Schaltfläche **Abschlussaktion abbrechen** stoppt die Aktion erfolgreich, danach wird
das eigene Prüffenster regulär geschlossen. Das gespeicherte Ergebnis bleibt ausdrücklich
`successful:false`, `status:cancelled` und ohne Systemanforderung. Dieser Abbruchbeleg unter
`completion-native-exit-cancel-20261102/` ist keine Abnahme des automatischen Beendens.
Die Sichtbarkeitskorrektur ist anschließend lokal umgesetzt. Renderer und vertrauenswürdige
Desktopabfrage verwenden denselben Prüfer für sichtbaren Banner und tatsächlich bedienbaren
Abbrechen-Button. Ein offener fremder Dialog, verdeckte/inaktive Bereiche oder ein außerhalb des
Fensters liegender Abbrechen-Button verhindern die Bestätigung. Nach einer asynchronen Draftprüfung
werden Sichtbarkeit und Auswahl-/Tokenbindung nochmals frisch geprüft. Dienst, Owner und Adapter
bleiben unverändert; ein verdeckter laufender Countdown wird weiterhin verworfen und benötigt danach
einen neuen Token mit vollen 60 Sekunden.

Vor der Korrektur bestehen vier bisherige UI-Fälle, alle fünf neuen Gegenproben scheitern am
konkreten Fehler. Danach bestehen die vollständige kurze Abschlussserie **73/73** und der gemeinsame
Root-Nachlauf einschließlich Desktopintegration und Prüfstarter **92/92**, ohne Fehler oder Skips.
Der verbundene Verhaltenstest verwendet den unveränderten Abschlussdienst und belegt Abwarten hinter
dem Dialog, Start mit 60 Sekunden, Unterbrechung nach 24 Sekunden, neuen Token und erneut 60 Sekunden
sowie endgültigen Abbruch ohne Close/Execute. Eine zusätzliche reine Quellprüfung hat keinen konkreten
Befund. Der dauerhafte Root-Prüflog ist `completion-modal-regression-20261102.log` im bestehenden
Bereitstellungsprüfbereich.

Die native Gegenprobe vom **3. November** verwendet drei frische getrennte Windows-Prüfsitzungen.
Alle erreichen einen tatsächlich erfolgreichen Suchpaketabgleich und einen gültigen Abschlussbeweis.
Bei offenem Datenbankdialog bleiben sie jeweils in `awaiting-display`. Erst nach dem sichtbaren
Schließen des Dialogs werden Anzeige und Abbrechen-Schaltfläche bestätigt. Alle drei starten bei
**60 Sekunden**. Die eigenen Fenster sind anschließend geschlossen, der Desktop ist zurückgegeben.

| Aktion | Beobachtetes Ende |
| --- | --- |
| PC neu starten | Countdown vollständig, genau eine abgefangene Anforderung `/r /t 0`, eigenes Prüffenster automatisch geschlossen. |
| Explorer beenden | Countdown vollständig, eigenes Prüffenster automatisch geschlossen, keine Windows-Anforderung. |
| PC herunterfahren | Sichtbarer Countdown mit dem Abbrechen-Knopf abgewählt. Zustand `cancelled`, keine Windows-Anforderung, Prüffenster danach regulär manuell geschlossen. |

Die vier Originalbelege je Sitzung sind bytegleich unter `completion-native-restart-20261103/`,
`completion-native-exit-explorer-20261103/` und `completion-native-shutdown-cancel-20261103/` im
privaten Bereitstellungsprüfbereich erhalten. Der abgeschirmte Quellen-Vorschauabruf zeigte erneut
kurz `Failed to fetch`. Der danach ausgeführte Suchpaketabgleich ist über den echten Abschlussbeweis
bestätigt. Keine echte Systemaktion wurde aufgerufen.

Die Herunterfahren-Abwahl hat einen Anzeigefehler offengelegt. Wenn die laufende Sichtbarkeitsprüfung
den Knopf gerade während der Abwahl deaktiviert vorfindet, kann sie noch einen Schutzfehler speichern.
Die Abwahl ist dennoch endgültig. Der Status `cancelled` zeigt diesen früheren Fehler jetzt auch bei
bereits gespeicherten Vorgängen nicht mehr an. Eine gezielte Gegenprobe reproduziert den Fehler vor
der Korrektur und bestätigt die Anzeige nach Wiederöffnen sowie das Fehlen von Claim und Ausführung.
**85/85** Abschluss-, UI-, Desktopbesitzer- und Prüfstarterfälle bestehen. Die neue Meldung wurde
lokal geprüft. Eine erneute sichtbare Probe dieser Meldung steht noch aus.

Der Desktop zeigt die Abbruchbestätigung für den bereits sichtbaren, passend gebundenen
Auftrag weiter an. Beim nächsten Explorerstart bleibt ein früherer Abbruch ausgeblendet.
Die Gegenprobe prüft beide Situationen einschließlich des Übergangs zu einem inaktiven Stand.
**86/86** Abschluss- und Prüfstarterfälle sowie **9/9** Desktopintegrationsfälle bestehen.

Am **9. November** bestätigt der getrennte Prüfprozess seine künstliche Ausgangslage und den
inaktiven Abschlussstatus. In dieser Ausführung erscheint kein ansteuerbares Windows-Fenster.
Der identifizierte inaktive Prüfprozess wurde daraufhin beendet. Das Testupdate wurde nicht gestartet.
Die sichtbare Gegenprobe steht weiter aus. Der private Start- und Abbruchbeleg liegt unter
`completion-native-cancel-window-unavailable-20261109/`.

Eine vierte Windows-Prüfsitzung am **3. November** belegt auch den vollständigen Herunterfahren-Ablauf.
Nach dem erfolgreichen Suchpaketabgleich und dem Schließen des Datenbankdialogs zeigt der Explorer
den abbrechbaren Countdown. Er beginnt bei 60 Sekunden und erreicht genau eine abgefangene
Anforderung `/s /t 0`. Der Abschlussstatus ist `requested`, und das Prüffenster schließt automatisch.
Die vier Originalbelege liegen bytegleich unter `completion-native-shutdown-20261103/` im privaten
Bereitstellungsprüfbereich. Der abgeschirmte Vorschauabruf zeigte beim Öffnen des Dialogs erneut
`Failed to fetch`. Der reguläre Aktualisierungsknopf führte den isolierten Suchpaketabgleich erfolgreich aus.

```powershell
node --no-warnings --test --test-isolation=none species-explorer/update-completion/service.test.mjs species-explorer/update-completion/desktop-adapter.test.mjs species-explorer/update-completion/ui.test.mjs
```

Die Tests verwenden echte kleine Zustandsdateien und die vorhandenen Koordinator-Start-/Save-/Finishmethoden,
injizierte Status-/Zeit-/Schließ-/Ausführungsadapter und ausschließlich eigene `scripts/test-temp.mjs`-Sitzungen.
Der Koordinator-Eigentümerlock wird im Fixture ersetzt; es wird kein SQLite-Bestand aufgebaut.
Native Prozessstarts werden vollständig durch Fakeprozesse ersetzt. Das belegt die Zustands-/Persistenz-
und Schutzlogik, noch keine integrierte Dialog-, Geräte-, Windows-Exit- oder Shutdown-Abnahme.
