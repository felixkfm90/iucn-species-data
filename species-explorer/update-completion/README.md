# Abschlussaktion eines gespeicherten Updateauftrags

Stand: 31. Oktober 2026. Die getrennten Module sind inzwischen zentral mit Main, Server,
Updateauswahl und sichtbarer Statusanzeige verbunden. Heute keine echte Betriebssystemaktion
und kein Datenbankupdate ausgeführt. Native Desktop-/Zielgeräteprüfung bleibt offen.

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

```powershell
node --no-warnings --test --test-isolation=none species-explorer/update-completion/service.test.mjs species-explorer/update-completion/desktop-adapter.test.mjs species-explorer/update-completion/ui.test.mjs
```

Die Tests verwenden echte kleine Zustandsdateien und die vorhandenen Koordinator-Start-/Save-/Finishmethoden,
injizierte Status-/Zeit-/Schließ-/Ausführungsadapter und ausschließlich eigene `scripts/test-temp.mjs`-Sitzungen.
Der Koordinator-Eigentümerlock wird im Fixture ersetzt; es wird kein SQLite-Bestand aufgebaut.
Native Prozessstarts werden vollständig durch Fakeprozesse ersetzt. Das belegt die Zustands-/Persistenz-
und Schutzlogik, noch keine integrierte Dialog-, Geräte-, Windows-Exit- oder Shutdown-Abnahme.
