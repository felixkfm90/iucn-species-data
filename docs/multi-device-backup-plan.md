# Phase 11 - Mehrgeraete, Git-Update, Locking und NAS-Backup

Stand: 2026-10-31

## Ziel

Die Arten-Explorer-App soll auf mehreren Windows-Rechnern nutzbar sein, ohne dass Daten verloren gehen oder
parallele Bearbeitungen einander ueberschreiben. Im bestehenden Betrieb bleibt GitHub der versionierte
Projektstand und das NAS ein vollstaendiges Restore-Backup, keine aktive Arbeitskopie. Die nachfolgend
bestaetigten Anforderungen an einen dauerhaft erreichbaren gemeinsamen Dienst gehen ueber diesen
Betriebsstand hinaus. Nach der bestätigten Rahmenklärung wird dafür ein eigener NAS-Dienst vorbereitet;
der bisherige Sicherungsbetrieb wird erst mit nachgewiesener Einrichtung erweitert.

Die Phase wurde am 2026-07-26 entsprechend der damaligen Gesamtroadmap als Phase 11 eingeordnet.
Taxonomie und Lightroom sind inzwischen im vereinbarten Auditumfang abgeschlossen; maßgeblich ist die
[aktuelle Roadmap](roadmap.md). Bereits umgesetzte NAS-/Backup-Entscheidungen gelten weiter.
Vor dem Mehrgeräteausbau wird verbindlich entschieden, wie reproduzierbare Referenzdaten, eigene
Taxonomieentscheidungen und Lightroom-Projektdaten verteilt beziehungsweise gesichert werden. Details:
`docs/global-taxonomy-lightroom-plan.md`.

## Gemeinsame Rahmenklärung vom 31. Oktober 2026

Felix hat den folgenden zusammenhängenden Nutzungsrahmen am 31. Oktober ausdrücklich bestätigt und
die Umsetzung aller sechs Folgevorhaben beauftragt. Die gemeinsame Rahmenklärung ist damit abgeschlossen;
bereits bestätigte Entscheidungen werden nicht erneut zur Wahl gestellt. Technische Lösungen werden
daraus abgeleitet, auf den vorhandenen Geräten geprüft und mit den zugesagten NAS-Informationen abgestimmt.
Eine konkrete neue Benutzer- oder Synchronisationsarchitektur ist damit noch nicht als umgesetzt nachgewiesen.

| Thema | Bestätigtes Ziel |
| --- | --- |
| Personen und Geräte | Zunächst Felix und sein Bruder auf eigenen Windows-11-PCs mit Administratorrechten für Installationen; später auch Nutzung am Handy. Erste mobile Ziele sind Android auf Samsung Galaxy S24 Ultra und S25 Ultra. Am Handy genügt zunächst Nachschlagen/Lesen, bearbeitet wird am PC. Weitere Personen sind möglich, derzeit jedoch kein konkreter Verteilungsauftrag. Nicht fest auf genau zwei Benutzer beschränken. |
| Aufgaben und Rechte | Beide arbeiten gleichberechtigt mit demselben Vollzugriff: Arten anlegen, Website mitgestalten und alle übrigen Arbeiten des jeweils anderen ausführen können. Die vier unten beschriebenen Benutzerstufen sind angenommen; beide erhalten Administration. |
| Gemeinsame Inhalte | Ein gemeinsames Projekt von FN Wildlife & Travel mit gemeinsamen fachlichen Daten, Katalogbezügen und Auswertungen. Keine getrennten fachlichen Bestände nach Person vorgesehen. Technisch persönliche Anmeldungen und geräteabhängige Pfade bleiben zu berücksichtigen. |
| Gleichzeitigkeit | Gleichzeitige Arbeit am gemeinsamen Projekt an unterschiedlichen Arten oder Seiten soll möglich sein. Ein einziger projektweiter Bearbeitungsmodus genügt diesem Ziel nicht. |
| Verschiedene Orte und Verfügbarkeit | Zusammenarbeit muss von verschiedenen Orten aus und ohne laufenden PC von Felix oder seinem Bruder funktionieren. Ein dauerhaft erreichbarer gemeinsamer Dienst gehört damit zum Ziel. Das vorhandene NAS ist als Betriebsort zu prüfen, keine bereits gewählte Lösung. Zusätzliche kostenpflichtige Dienste sind ausgeschlossen. |
| Vorhandenes NAS | Nutzerbelegte Synology DS923+, DSM 7.4.1-90080 Update 1, AMD Ryzen R1600 mit zwei Kernen und 32 GB RAM. Grundsätzlich 24/7 in Betrieb; Updates und Stromausfall können unterbrechen, eine USV überbrückt kurze Stromausfälle. Genügend freier Speicher ist von Felix bestätigt. Container Manager ist für dieses Modell offiziell unterstützt; Installation und tatsächlicher Dienstbetrieb sind noch zu prüfen. |
| Offline | Beide Gerätearten sollen geladene Inhalte ohne Verbindung verwenden können. Am PC sind zusätzlich Änderungen an bestehenden Arten und Seiten möglich; neue Arten/Seiten werden im ersten Offlineumfang nicht angelegt. Am Handy bleibt es beim Nachschlagen/Lesen. Zusatzdownloads sind optional und nach Inhalten auswählbar, ausdrücklich auch alle Informationen ohne die auf der Website verwendeten Fotos. Änderungen werden bei Wiederverbindung abgeglichen; widersprüchliche Bearbeitungen bleiben erhalten und sichtbar zur Entscheidung. |
| Vorschläge und Kostenrahmen | Alternativtextvorschläge, gewünschte Fachtextergänzungen und Vorprüfungen sollen direkt im Explorer ohne diesen Chat möglich sein. Keine kostenpflichtigen Dienste verwenden. Eine geeignete lokale Lösung ist erst zu untersuchen; Qualität, Geschwindigkeit und Hardwareeignung sind noch nicht nachgewiesen. |
| Lightroom | Beide verwenden einen gemeinsamen Lightroom-Katalog mit gemeinsamen Auswertungen. Dieser kann nacheinander auf verschiedenen Rechnern oder Laptops genutzt werden; gleichzeitige Nutzung desselben Katalogs ist nicht vorgesehen. Gerätewechsel, Katalogzuordnung und Nutzungsnachweise müssen diese Übergabe berücksichtigen. Die technische Übergabe und Zuordnung des gemeinsamen Katalog-/Fotobestands bleibt zu klären. |

Die älteren Mehr-PC-/Git-/`app-lock`-Abschnitte weiter unten sind ein vorhandener technischer Entwurf,
keine bestätigte Lösung für diese neuen Anforderungen. Insbesondere darf eine globale Schreibsperre
nicht die gewünschte parallele Bearbeitung unabhängiger Arten und Seiten verhindern. Bestehender
Regelbetrieb und Schutzgrenzen gelten bis zur abgestimmten Umsetzung weiter.

### Angenommene Benutzerstufen

| Rolle | Fachlicher Umfang |
| --- | --- |
| Administration | Alle fachlichen Funktionen einschließlich Freigabe/Veröffentlichung sowie Benutzer-, Rechte- und Projekteinstellungen verwalten. Felix und sein Bruder erhalten beide diesen Vollzugriff. |
| Redaktion mit Veröffentlichung | Arten, Texte und Bilder bearbeiten sowie Inhalte freigeben/veröffentlichen; keine Benutzer-/Rechteverwaltung oder technischen Projektgrundlagen ändern. |
| Mitarbeit | Arten, Texte und Bilder vorbereiten und bearbeiten; keine eigene Freigabe/Veröffentlichung und keine Administration. |
| Lesen | Freigegebene Projektinhalte ansehen, ohne sie zu verändern. |

Felix hat diese vier Stufen am 31. Oktober angenommen. Die konkrete Zuordnung der Funktionen zu den
vereinbarten Befugnissen wird bei der Umsetzung je Aufgabe und Datenbereich festgelegt und geprüft, statt nur sichtbare
Bedienelemente zu unterscheiden. Technische Grundlage: [OWASP-Autorisierungsleitfaden](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
Der grundsätzliche Offlineumfang und der Ausschluss zusätzlicher kostenpflichtiger Dienste sind bestätigt.
Technische Eignung des dauerhaft erreichbaren Dienstes sowie lokale Vorschläge/Vorprüfung bleiben zu
untersuchen. Der grundsätzlich durchgehende NAS-Betrieb einschließlich USV ist als Nutzerangabe bestätigt.
Modell und Ausstattung sind durch Felix' drei Screenshots belegt; deren unveränderte Originalbytes und
Prüfsummen stehen privat unter `data/website/checks/nas-hardware-input-20261031/` und der gleichnamigen
JSON-Quittung. Die Speicheransicht zeigt vier Festplatten und zwei M.2-Laufwerke als SSD-Cachegruppe;
freier Platz, RAID und nutzbarer Volumenpfad sind daraus nicht abgeleitet. Synology führt die DS923+
in der [Container-Manager-Modellliste](https://www.synology.com/en-global/dsm/packages/ContainerManager).
Eine Containerinstallation, Netzwerkfreigabe oder Datenverlagerung ist damit nicht ausgeführt.

### Technische Aufteilung nach der Gesamtfreigabe

Der gemeinsame Dienst wird als getrennte Node-24-Anwendung für einen NAS-Container entwickelt.
Seine SQLite-Datei liegt auf dem lokalen Container-/NAS-Datenvolumen; Clients greifen über die
authentifizierte Anwendungsschnittstelle zu, nicht gleichzeitig über SMB auf dieselbe SQLite-Datei.
Freier externer Zugriff benötigt einen tatsächlich eingerichteten und geprüften Zugangsweg; aus der
24/7-Angabe und dem unterstützten NAS-Modell folgt noch keine Remoteabnahme.

Windows behält eine beschreibbare lokale Projekt-/Datenkopie und die lokalen Lightroom-Helfer.
Offlineänderungen vorhandener Objekte werden später mit ihren Ausgangsversionen abgeglichen;
widersprüchliche Änderungen bleiben als Konflikt erhalten. Der gemeinsame Lightroom-Katalog wird
weiter nacheinander benutzt, nicht vom NAS-Dienst als gleichzeitig beschreibbarer Katalog geöffnet.
Android wird mit der bereits vorhandenen Flutter-Toolchain als lesende App entwickelt; Medienpakete
sind wählbar. Die lokale Bild-/Texthilfe wird zunächst auf Windows geprüft. Das legt keine KI-Ausführung
auf dem NAS oder Handy fest. Neue Module, Installer und App werden isoliert gebaut und geprüft;
tatsächliche NAS-Einrichtung, Anmeldung und Zielgerätebetrieb bleiben gesonderte Nachweise.

### Implementierter lokaler Zwischenstand vom 31. Oktober

Der [Projektdienst](../species-explorer/shared-project/README.md) besitzt persönliche Anmeldungen,
vier serverseitig geprüfte Rollen, Objektversionen, interne Freigaben und erhaltene Konfliktfassungen.
Der Windows-Client speichert geladene Objekte und wartende Offlineänderungen im persönlichen
Geräteprofil. Seine Tokens werden mit Electrons asynchronem Betriebssystemschutz verschlüsselt;
Passwörter werden nicht gespeichert. Ein abgelehnter geschützter Speichervorgang beendet den
Anmeldeversuch ohne stillen ungeschützten Rückfall. Die tatsächliche Windows-Verschlüsselungsprobe
ist getrennt bestanden: zwei frische fensterlose Electron-42.11.18-Prozesse schreiben beziehungsweise
lesen ausschließlich ihre synthetische geschützte Probe; kein vorhandenes persönliches Profil wurde
geöffnet. Der gebundene Nachweis steht unter `mobile/build-evidence/safe-storage-native.json` und
belegt diese konkrete lokale Probe, keine NAS-/Zweitgeräteanmeldung.

Der Explorer hat dafür im **Bearbeitungsmodus** unter **Datenbank-Aktionen → Weitere Aktionen →
Backup und Einstellungen** den Bereich **Gemeinsames Projekt**: Verbindung, bestehende Fachabschnitte,
Bildvorschauen und Bildtexte, lokale Entwürfe, ausdrücklichen Abgleich, Konfliktentscheidungen sowie
Personen-/Geräteverwaltung. Die lokale HTTP-Anbindung verwendet die vorhandenen Sitzungs-/Originregeln.
Offene Formulare und wartende Änderungen werden beim Schließen beziehungsweise bei Abschlussaktionen
berücksichtigt. Ein beschädigter persönlicher Cache bleibt erhalten; die bisherigen lokalen
Explorerfunktionen starten weiter. Der gemeinsame Redaktionsbereich und die bisherige lokale
Bestands-/Taxonomiepflege sind derzeit getrennte Abläufe. Der durchgehende Abgleich aller fachlichen
Bestandsfelder und die gemeinsame Artseitenveröffentlichung sind noch zu vervollständigen.

Die Desktop-Quellverdrahtung übergibt das feste persönliche Geräteprofil an den bestehenden
Sicherungsdienst. Gerätekennung, persönlicher Projektcache einschließlich ungesendeter Änderungen
aller früheren Projektverbindungen und Erstimportjournal werden über geprüfte SQLite-Snapshots
ergänzt. Die kontrollierten Dateinamen kommen aus dem Hauptprozess, nicht aus einer Browseranfrage.
Anmeldeschlüssel und verschlüsselte Anmeldedateien gehören nicht zum Sicherungspaket. Cacheversionen
1 und 2 werden mit getrennten exakten Schemalisten gelesen; unvollständige paginierte Abrufe bleiben
auch nach Wiederöffnung unsichtbar und werden nicht zu fachlichen Offlineänderungen erklärt.
Der Explorer wartet beim Schließen auf den Sicherungsbesitzer, bevor er Cache und Tempablage schließt.

Die echte Paket-/WAL-/Restorekopieprüfung verwendet ausschließlich eigene kleine Testbestände. Eine
neue NAS-Gesamtsicherung ist nicht ausgeführt. Neue Bildtext-/Artseitenjournale und bereitgestellte
Artseitenmedien werden erst nach ihrer konkreten Schema-/Medieneinbindung als enthalten ausgewiesen.
Direkte ältere PowerShell-/npm-Aufrufe ohne persönlichen Snapshot melden diesen eingeschränkten
Umfang ausdrücklich; aus ihnen entsteht kein vollständiger Mehrgeräte-Sicherungsnachweis. Es wurde
kein zusätzlicher Timer oder Sicherungslauf an Datenbank-Abschlussaktionen angehängt. Die tatsächliche
Windows-Aufgabenplanung konnte in dieser Sitzung wegen fehlendem CIM-Zugriff nicht lesend bestätigt
werden; ein Betriebssystem-Zeitplan wird daher nicht aus vorhandenem Skriptcode abgeleitet.

Das [NAS-Paket](../nas/README.md) enthält eine begrenzte Containerdefinition mit gebundenem offiziellem
Node-24-Image und ausdrücklich zu liefernden Volume-/Benutzerwerten. Der Hostport ist nur lokal am
NAS vorgesehen. Konsistente Sicherung über die SQLite-Backupfunktion und getrennte Wiederherstellung
in neue Dateien sind mit echten WAL-Daten isoliert geprüft. Dies ist keine neue NAS-Einrichtung,
Sicherung des realen Dienstbestands, Reverseproxy-/TLS- oder Fernzugriffsabnahme. Bootstrapzugänge
werden erst bei der tatsächlichen persönlichen Einrichtung festgelegt.

Der [Windows-Installer](../installer/README.md) ist als privates Prüfpaket tatsächlich gebaut;
Dateiinstallation, Update, Reparatur, Rücknahme und datenerhaltende Deinstallation sind an isolierten
Beständen geprüft. Node, Electron, Git sowie FFmpeg/FFprobe werden gebunden bereitgestellt; Lightroom
bleibt eine vorhandene Adobe-Installation. Plug-in-Quellstand .43 erkennt das mitgelieferte Node;
der installierte Korrekturrückweg prüft die Bindung und verwendet den nativen Appstarter. Die letzte
reguläre native Lightroom-Ladeprüfung betrifft .42. Nach der laufenden Integration ist das Paket
erneut zu bauen; Erstinstallation auf einem frischen vorgesehenen PC und Auslieferungsnachweise
bleiben offen.

## Ergänzter Folgeauftrag: Installer und Mehrbenutzerunterstützung

Felix ergänzt am 27. Oktober nach dem abgeschlossenen Audit ausdrücklich zwei Folgevorhaben in der
[Roadmap](roadmap.md). Dies war zunächst eine Vormerkung; am 31. Oktober hat er den oben beschriebenen
Gesamtumfang einschließlich Umsetzung ausdrücklich bestätigt.

- **Installer einschließlich aller benötigten Programme:** Einen vollständigen Windows-Installationsablauf
  entwickeln, der benötigte Programme und Laufzeiten erkennt und passend bereitstellt. Dazu die Abhängigkeiten
  vollständig erfassen; aktuell insbesondere Node.js 24, Electron, Git und FFmpeg sowie die Einrichtung des
  Lightroom-Plug-ins berücksichtigen. Bündelung beziehungsweise geführte Installation und unterstützte Versionen
  im Konzept festlegen. Auf einem frisch eingerichteten Windows-System den Start und die vereinbarten Kernabläufe
  praktisch prüfen; Aktualisierung, erneute Installation und Deinstallation müssen vorhandene Nutzerdaten schützen.
- **Mehrbenutzerunterstützung:** Die Nutzung durch mehrere Personen und auf mehreren Rechnern konzipieren und
  umsetzen. Die inzwischen bestätigte gemeinsame fachliche Datenbasis, Benutzerstufen und gleichzeitige Nutzung
  zugrunde legen; persönliche Anmeldungen und geräteabhängige Einstellungen berücksichtigen.
  Das folgende Mehr-PC-/Lock-/Update-Modell als vorhandenen Plan einbeziehen;
  Benutzerverwaltung und konfliktfreie parallele Bearbeitung sind damit noch nicht als umgesetzt nachgewiesen.
  Später die vereinbarten Zugriffs-, Konflikt- und Wiederanlauffälle mit mehreren Benutzern praktisch prüfen.

Die konkrete Ausgestaltung und Umsetzung erfolgen im jeweiligen Folgeauftrag. Bestehende Installations-,
Lightroom-, Datenpfad- und Sicherungsverträge bleiben bis zu einer ausdrücklich beschlossenen Änderung maßgeblich.

Felix konkretisiert am 28. Oktober den Bedarf: Sein Bruder muss ebenfalls Bildtexte eingeben und neue
Artseiten anlegen können. Mehrbenutzerunterstützung ist deshalb Voraussetzung für den späteren gemeinsamen
Artseitenworkflow einschließlich der dort erneut zu prüfenden automatischen Textübernahme. Die initiale
[Alttextfassung](image-alt-audit.md#erste-lokale-fassung-bedienung-und-betriebsgrenzen) beginnt bereits vorher
mit lokalem Prüfstand und Eintragung freigegebener Texte durch Codex. Geräte, konkrete Rechte und
Datenverteilung bleiben im eigenen Mehrbenutzerauftrag gemeinsam zu klären.

## Entscheidungsfreie Vorbereitung vom 28. Oktober 2026

Felix beauftragt die Bestands- und Abhängigkeitsklärung vor der gemeinsamen Abstimmung aller
Folgevorhaben. Geprüfter Programmstand: `97a1b68a2663e62e87c4fa473a917fe83a3f7ec5`.
Die folgenden Beobachtungen sind keine neue Installations-, Mehrbenutzer- oder Zielgeräteabnahme.

### Tatsächlich benötigte Programme und vorhandene Startwege

Die kleinen Versionsproben wurden auf dem vorhandenen Windows-x64-Rechner ausgeführt, ohne eine
Installation oder Aktualisierung zu starten. Versionsangaben sind diese Momentaufnahme, keine neue
Mindestversions- oder Kompatibilitätszusage für andere Geräte.

| Komponente | Heutiger Einsatz und geprüfter Bestand |
| --- | --- |
| Separates Node.js und npm | Node **24.22.1**; Node 24 bleibt Projektvoraussetzung. Der eigenständige Lightroom-Helfer sucht `node.exe` (`TaxonomyHelper.lua`), der Restorestarter prüft die Hauptversion. npm installiert heute die Lockfile-Abhängigkeiten. |
| Electron | Lockfile und vorhandene Programmdatei **42.11.18**. Die reine Laufzeitabfrage mit `ELECTRON_RUN_AS_NODE` bestätigt eingebettetes Node **24.19.0**, x64; kein Explorerfenster oder Server gestartet. Diese Laufzeit ersetzt den heutigen externen Node-Suchweg des Lightroom-Helfers nicht automatisch. |
| Git | **2.56.0.windows.4**; benötigt für Status, Commit/Push und die gebundene NAS-Sicherung. Repositoryzugang ist zusätzlich einzurichten; Zugangsdaten gehören nicht in ein Installationspaket. |
| FFmpeg und FFprobe | Beide lokal **8.1.1**, Gyan-Essentials-Build. Tatsächliche Medien-/Bildverarbeitung und Tonlängenprüfung; Resolver in `scripts/spectrogram-renderer.mjs` und `scripts/sound-segment-editor.mjs`. FFplay bleibt entbehrlich und entfernt. |
| PowerShell | Backup- und Verknüpfungsskripte bestehen. Die App wählt heute unter Windows `powershell.exe`; der erfolgreiche direkte NAS-Lauf verwendete vorhandenes PowerShell 7. Dessen Existenz allein ändert den App-Aufrufweg nicht. |
| Windows Script Host | Der heutige unauffällige Desktopstart und die Verknüpfung verwenden `wscript.exe` und `start-explorer.vbs`. Bei der späteren Paketierung prüfen, welche Startbestandteile noch gebraucht werden. |
| Lightroom Classic | Bestehende Adobe-Installation als Voraussetzung für die optional genutzten Plug-in-Funktionen. Plug-in **0.4.24.42** ist regulär geladen bestätigt; keine zusätzliche Lightroom-Installation oder neue Versionsspanne abgenommen. |
| Fengari | Lockfile **0.1.5** für Lua-Tests; kein nachgewiesener Endanwender-Laufzeitbedarf des Lightroom-Plug-ins. Testwerkzeuge nicht allein wegen ihrer Anwesenheit mitliefern. |

`restore-start.cmd` ist eine vorhandene Wiederherstellungsgrundlage: Node prüfen, fehlende
Electron-Abhängigkeiten zur Installation anbieten, Verknüpfung erzeugen und starten. Es installiert
weder Node noch alle übrigen Voraussetzungen. Ein fertiger Installer/Paketbau ist in den heutigen
npm-Skripten und Top-Level-Abhängigkeiten nicht vorhanden. Bei der späteren Paketierung sind außerdem
Paketmetadaten, beschreibbare Daten-/Git-Pfade, Hilfsprozesse und der externe Lightroom-Startweg zu prüfen;
eine Verpackung des heutigen Ordners allein belegt keinen funktionierenden Installationsablauf.

Offizielle technische Bezugsgrundlagen, am 28. Oktober lesend geprüft:
[Node.js](https://nodejs.org/en/download), [Git für Windows](https://git-scm.com/install/windows),
[Electron-Paketierung](https://www.electronjs.org/docs/latest/tutorial/application-distribution) und
[FFmpeg-Bezugswege](https://www.ffmpeg.org/download.html) mit dem dort verlinkten
[Gyan-Buildanbieter](https://www.gyan.dev/ffmpeg/builds/). Keine aktuelle Fremdversion übernommen und
kein Paketierungswerkzeug ausgewählt.

### Vor einer Auslieferung technisch zu vervollständigen

- Das Lockfile bindet npm-Versionen, Bezugsquellen und Integritätswerte. Electron besitzt lokal
  `LICENSE` und `LICENSES.chromium.html`, Fengari eine eigene Lizenzdatei. Diese Begleitdateien beim
  später gewählten Paketumfang berücksichtigen.
- Unter `local-tools/ffmpeg` liegen genau die beiden EXE-Dateien, keine Herkunfts-/Lizenztexte.
  Der vorhandene Build meldet `--enable-gpl --enable-version3`. Buildgenaue Herkunfts-, Lizenz- und
  gegebenenfalls Quellnachweise sind vor einer Bündelung zusammenzustellen; die
  [FFmpeg-Lizenzdokumentation](https://ffmpeg.org/legal.html) unterscheidet ausdrücklich nach Buildbestandteilen.
  Diese Aufnahme erteilt keine rechtliche Vertriebsfreigabe und behauptet keine Lizenzverletzung.
- Bestehende Aufrufe in `package.json` und `species-explorer/backup-service.mjs` enthalten bereits
  `-ExecutionPolicy Bypass`. Sie wurden nur gelesen. Für den Installationsweg Laufzeitwahl und Verhalten
  bei gesperrten Skripten prüfen; keine Ausführungsrichtlinie für diese Vorbereitung geändert.
- Erst nach bestätigtem Zielumfang konkrete Paketdateien, Prüfsummen, Signierungs-/Aktualisierungsweg
  und passende Lizenzbelege festlegen. Vorhandene private Daten nicht still zum auslieferbaren Anfangsbestand erklären.

### Mehrbenutzer: heutige Funktionen und fehlende Erweiterungen

| Bereits vorhanden | Nicht damit nachgewiesen |
| --- | --- |
| Lokaler Host `127.0.0.1`, Sitzungs-/Origin-/Hostprüfungen in `request-security.mjs` | Personenanmeldung, Rollen und Zugriff durch andere Rechner |
| Electron-Single-Instance und fachliche SQLite-Sperren für Umzug, Korrekturen und Updateauftrag | Geräteübergreifender Bearbeitungslock oder konfliktfreie parallele Personenbearbeitung |
| Kontrollierte Git-Veröffentlichung in `project-publication.mjs` und Pipeline | Vollständige automatische Mehrgeräteaktualisierung und Konfliktlösung |
| Projektbezogene lokale Einstellungen in `species-explorer/local-settings.json` | Getrennte persönliche Einstellungen und geschützte private Bereiche je Person |
| Gemeinsamer Datenpfad, geprüfter Paarwechsel und vollständige NAS-Sicherung | Verteilung privater Referenz-/Lightroom-/Entscheidungsdaten auf andere Geräte oder Benutzer |

Die nachfolgenden Mehr-PC-/`app-lock`-/Update-Abschnitte sind insoweit ein vorhandener Entwurf,
keine umgesetzte Benutzerverwaltung. GitHub als versionierter Projektstand, lokale Arbeit und NAS als
Sicherungsziel bleiben die bestehende Grundlage. Eine Netzwerkfreigabe des lokalen Servers folgt daraus nicht.

### Gemeinsam zu klären

| Kennung | Fachliche Entscheidung |
| --- | --- |
| INST-1 | Bestätigt: Windows 11 auf den vorgesehenen PCs/Laptops, Administratorrechte für Installationen vorhanden. Paketierung und Trennung von Programm, gemeinsamen Daten und Geräteprofilen daraus ableiten. |
| INST-2 | Muss die Erstinstallation ohne Internet funktionieren; welcher Anfangsdatenbestand soll auf einem neuen Gerät verfügbar sein und aus welchem freigegebenen Bestand stammt er? |
| INST-3 | Wer erhält das Installationspaket und wie sollen Aktualisierung und Reparatur im Alltag ablaufen; wird Lightroom auf allen Zielgeräten verwendet? |
| BEN-1 | Am 31. Oktober bestätigt: zwei Personen auf eigenen PCs, Android zunächst zum Lesen; gleichzeitige Bearbeitung unabhängiger Arten/Seiten von verschiedenen Orten, auch ohne laufende PCs. Offline am PC zusätzlich vorhandene Arten/Seiten bearbeiten, am Handy auswählbare Nachschlageinhalte. Keine zusätzlichen kostenpflichtigen Dienste; technische Eignung und Betriebsort noch prüfen. |
| BEN-2 | Bestätigt: ein gemeinsames FN-Wildlife-&-Travel-Projekt einschließlich gemeinsamer fachlicher Daten, Lightroom-Katalogbezüge und Auswertungen. Persönliche Anmeldungen und geräteabhängige Einstellungen berücksichtigen; kein getrennter fachlicher Bestand je Person. |
| BEN-3 | Gleicher Administrationszugriff für Felix und seinen Bruder; vier Benutzerstufen angenommen. Unabhängige Arten/Seiten parallel bearbeiten. Widersprüchliche Änderungen erhalten und im Explorer zur Entscheidung anzeigen; technische Sperr- und Abgleichlösung daraus ableiten. |

Das bestätigte Benutzer-/Datenmodell beeinflusst Installationsort, Berechtigungen, Anfangsdaten und
Update. Deshalb diese Rahmenbedingungen vor der endgültigen Installerarchitektur zusammen klären.
Framework, Paketformat und technische Sperrimplementierung werden anschließend als Lösung abgeleitet;
Felix muss keine Werkzeugwahl ohne fachlichen Nutzungskontext treffen.

### Vorbereitete Abnahmefälle zur gemeinsamen Bestätigung

Für den Installer: vereinbartes frisches Windows-Ziel, fehlende/abweichende Voraussetzungen,
Erststart und Kernabläufe einschließlich gewählter Lightroom-Funktionen sowie Update, Reparatur,
Abbruch und Deinstallation mit erhaltenen Nutzerdaten und Rückweg. Für mehrere Benutzer: getrennte
Anmeldungen und Rollen auf gemeinsamen fachlichen Daten, gleichzeitiger Zugriff, Verfügbarkeit bei
ausgeschalteten PCs, Netzverlust, Programmabbruch, veraltete Sperre und
auseinanderlaufende Stände ohne stille Überschreibung oder unbeabsichtigte Veröffentlichung.
Diese vorbereiteten Fälle sind noch keine ausgeführten Zielgeräte-/Mehrbenutzertests.

## Vertiefte Vorbereitung vom 30. Oktober 2026

Felix beauftragt die weiteren entscheidungsfreien Vorarbeiten. Die gezielte Inventur bindet zwölf
Datenfamilien an 37 tatsächlich beteiligte Quelldateien; alle 65 angegebenen Quellstellen sind geprüft.
Private Einzelheiten stehen in `data/website/checks/multiuser-preparation-20261030.json`.
Keine SQL-/Katalogöffnung, Cookie- oder Adobe-Präferenzinhalte gelesen; fünf kleine Schutzdateien
sind vorher/nachher bytegleich. Der aktuelle gemeinsame Datenpfad ist frisch als `data` bestätigt.

### Daten und Konflikte für die Benutzerabstimmung

| Bestehende Datenfamilien | Heutige Bindung und daraus folgende offene Frage |
| --- | --- |
| Versionierte Artdaten und Website-Assets | Der Explorer bearbeitet seine lokale Projektkopie samt Rücknahmeständen. Ein schreibgeschützter Programmordner reicht für diesen Ablauf nicht aus. |
| Speicherort und private Referenz-/Providerdaten | `storage-path.json` gehört zur Installation; Git verteilt die privaten Datenbanken und Releases nicht. Anfangsbestand und Verteilung je Gerät festlegen. |
| Master und Lightroom-Suchpaket | Atomar aktiviertes Paar mit privaten Zeigern. Neuer Git-Stand bedeutet keinen neuen installierten Datenpaarstand. |
| Menschliche Korrekturen und Namensvorlieben | Versionierte Korrekturen und private aktivierte Entscheidungsreleases wirken zusammen. Gemeinsame und persönliche Entscheidungen abgrenzen. |
| Datenbankaufträge und Updates | Persistierte Eingabe-/Auftragsbindung und lokale SQLite-Sperren. Fortsetzung eines auf einen anderen Rechner kopierten Auftrags ist nicht abgenommen. |
| Lightroom-Nutzungsbelege | Absolute Katalogbindung und Hash-/Zeitnachweise. Ein eigener Katalog des Bruders braucht einen eigenen Nutzungsstand. |
| Lightroom-Foto-/Katalogwerte und Identität | Katalog, Explorer-Journal und Adobe-Präferenzen haben unterschiedliche Ablagen. Gemeinsame Taxonomie ist kein gemeinsamer Fotobestand oder persönlicher Statistikstand. |
| Website-Bildtexte | Private JSON-Datei mit globaler Revision und lokaler SQLite-Sperre. Separate Kopien gleichen sich nicht ab; auch verschiedene Seiten können dieselbe Gesamtrevision ändern. |
| Explorer-Einstellungen | NAS-Ziel steht projektlokal, Reichauswahl im Browserprofil. Noch keine getrennte Zuordnung zu Person und Gerät. |
| Explorer-/Squarespace-Sitzung | Lokaler Sitzungsschutz ist keine Personen-/Rollenanmeldung. Die persistente Squarespace-Browserablage gehört zum Betriebssystemprofil, nicht zum gemeinsamen `data`-Ordner. |
| Temp und dauerhafte Rückwege | Sitzungs-/Prozessbindung und dauerhafte offene Aufträge unterscheiden. Kopierte Prozesskennungen sind keine laufenden Sperren; offene Rückwege bleiben geschützt. |

Die Squarespace-Anbindung verwendet `persist:fn-squarespace-texts`; der Code setzt keinen eigenen
`userData`-/`sessionData`-Pfad. Die [Electron-Dokumentation zur Ablage](https://www.electronjs.org/docs/latest/api/app)
und zu [persistenten Partitionen](https://github.com/electron/electron/blob/main/docs/api/session.md)
bestätigt die Profilbindung. Der konkrete Profilinhalt wurde nicht gelesen. Die heutige vollständige
Projekt-/NAS-Sicherung enthält diese externe Browseranmeldung nicht; auf einem anderen Gerät ist eine
eigene Anmeldung vorzusehen, solange kein anderer Ablauf ausdrücklich vereinbart ist.

Sieben konkrete Konfliktfälle sind vorbereitet: dieselbe Bildtextseite in getrennten Kopien,
verschiedene Seiten mit gemeinsamer Revision, zweiter Lightroom-Katalog, neuer Git-Stand mit altem
Datenpaar, gemeinsames Windows-/Squarespace-Profil, verschiedene NAS-Ziele im selben Checkout und
kopierter unterbrochener Datenbankauftrag. Das sind Abstimmungsfälle, keine ausgeführten Mehrbenutzertests.
Die dabei zunächst offene Frage **BEN-4** ist inzwischen in der Rahmenklärung beantwortet: Der Bruder
soll alle fachlichen Arbeiten ebenso wie Felix ausführen können. Lightroom-Katalog, fachliche Daten und
Auswertungen gehören zum gemeinsamen FN-Wildlife-&-Travel-Projekt; kein persönlicher Teilbestand vereinbart.

### Fünf isolierte Installerproben

`data/website/checks/installer-preparation-20261030.json` bindet Laufzeiten, Binärdateien,
vorhandene Lizenzbegleiter und diese fünf bestandenen Proben in einer eigenen Test-temp-Sitzung:

1. Windows-Aufrufkette mit Leerzeichen und Umlauten, mit Ersatzprogramm statt Explorer/WSH.
2. Tatsächlicher Speicherresolver unter einem Pfad mit Leerzeichen und Umlauten.
3. Lokale FFmpeg-Wahl und FFprobe-Ausweichsuche im Suchpfad bei fehlender benachbarter Datei.
4. Verständlicher negativer Suchbefund ohne lokales Werkzeug und ohne eigenen Suchpfad; kein Systempfad geändert.
5. Tatsächlicher Einstellungs-Schreibversuch mit isolierter Node-Schreibsperre trotz beschreibbarem Datenordner.

Der letzte Fall endet erwartungsgemäß mit `ERR_ACCESS_DENIED`: Der heutige Einstellungsweg schreibt
in den Programmordner; auch der VBS-Starter legt dort sein Protokoll an. Das ist ein konkreter
Vorbereitungsbefund für die spätere Trennung von Programm und Arbeitsdaten, kein nativer
Installationsversuch unter `Program Files`. Keine ACL, Ausführungsrichtlinie oder installierte Laufzeit
geändert; eigene Testdateien und Sitzungen sind entfernt. Die Laufzeitversionen entsprechen weiterhin
der Aufnahme vom 28. Oktober; zusätzlich npm **11.19.1**, Windows PowerShell **5.1.26100.9711** und
PowerShell **7.6.5** bestätigt. Der Lightroom-Helfer benötigt weiterhin den separaten Node-Suchweg.

Electron-/Chromium-, Git-, npm- und Fengari-Lizenzbegleiter sind nach Größe und Prüfsumme erfasst.
Im geprüften separaten Node-Installationsordner fehlt ein Lizenzbegleiter; die
[Lizenz der konkreten Node-Version](https://github.com/nodejs/node/blob/v24.22.1/LICENSE) ist als Quelle gebunden.
Die [Gyan-Releaseangabe für FFmpeg 8.1.1](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.1)
nennt den Quellstand `239f2c733d`. Am 30. Oktober waren Originalarchiv und Anbieter-Prüfsumme noch
nicht gegen die vorhandenen EXE-Dateien abgeglichen; den ausgeführten Nachlauf führt der folgende Abschnitt.
Vollständige Lizenz-/Quellbelege vor einer Bündelung vervollständigen; keine Vertriebsfreigabe daraus ableiten.
Die bestätigten Teile von INST-1 bis INST-3 und BEN-1 bis BEN-4 stehen in der Rahmenklärung oben.
Offene technische Ausgestaltung und konkrete Abnahmefälle werden aus diesem Umfang abgeleitet;
die älteren Vorbereitungsfragen sind keine erneute Entscheidung über bereits angenommene Anforderungen.

## Ausgeführte Vorarbeiten vom 31. Oktober 2026

### Herkunft der mitzuliefernden Programme

Vier Gegenprüfungen bestätigen die lokalen Binärbytes: Node **24.22.1 x64** entspricht dem direkten
EXE-Eintrag der [offiziellen SHA-256-Liste](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt).
FFmpeg und FFprobe **8.1.1** sind jeweils in Größe und Prüfsumme identisch mit den Dateien im passenden
Gyan-Essentials-ZIP; dessen vollständiger Archivhash stimmt mit den veröffentlichten Metadaten der
[Anbieterfreigabe](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.1) überein.
Kleine originale Node-/FFmpeg-Lizenz- und Herkunftsbeilagen sind privat gebunden erhalten. Die großen
Archive wurden nach der ausschließlich lesenden Prüfung entfernt; keine EXE extrahiert oder ausgeführt.
Lokale Originaldateien bleiben unverändert. Ein Hilfsberichtfehler im ersten Versuch ist datiert erhalten;
die korrigierte begrenzte Wiederholung besteht. Nachweis: `data/website/checks/installer-provenance-20261031.json`.

Damit ist der Herkunftsabgleich abgeschlossen. GPG-Signaturkettenprüfung, vollständige Bereitstellung
aller Quellen/Lizenzen aktivierter Drittbibliotheken sowie tatsächlicher Installer und Zielgeräteabnahme
sind nicht daraus abgeleitet. Insbesondere ersetzt die vorhandene GPL-Beilage nicht sämtliche Pflichten
eines später konkret gewählten Verteilungspakets. Der Paketumfang bleibt von INST und BEN abhängig.

### Echte lokale Parallelitäts- und Wiederanlaufproben

Elf Fallgruppen prüfen vorhandene Funktionen auf kleinen synthetischen Beständen. Zwei echte Node-Prozesse
auf derselben Alttextablage ergeben einen erfolgreichen Schreibvorgang und einen SQLite-Sperrkonflikt;
veraltete Revisionen überschreiben keinen neueren Text. Auch verschiedene Seiten benötigen wegen der
globalen Revision gegebenenfalls einen frischen Abgleich. Eine separat gehaltene Prozesssperre weist
Schreiben mit 409 ab und erhält die Bytes; nach regulärer Sperrfreigabe gelingen Speichern und Wiederöffnen.
Zwei getrennte Kopien können dagegen jeweils gültige, widersprüchliche Freigaben besitzen. Dies belegt
die noch fehlende Synchronisierung, keine gemeinsame Bearbeitung auf mehreren Geräten.

Dabei ist ein heutiger Einstellungsfehler reproduziert und eng korrigiert: Gleichzeitige Speicherung
verschieden langer NAS-Pfade durch zwei Dienstinstanzen erzeugte im gebundenen Vorherlauf viermal in
zwölf Versuchen ungültiges JSON trotz beidseitiger Erfolgsmeldung. Der vorhandene Helfer `atomicWriteJson`
ersetzt jetzt das direkte Schreiben in `backup-service.mjs`. Der neue Verhaltenstest scheiterte vorher
mit einem JSON-Syntaxfehler; anschließend bestehen **64/64 Sicherungstests**, einschließlich 32 Paaren
unterschiedlich langer Pfade. Die unverändert wiederholte Zusatzprobe besteht mit **11/11 Fallgruppen**
und weiteren 24 Paaren ohne Datei- oder Schreibfehler. Roter Vorherbeleg und grüner Nachherbeleg bleiben getrennt.

Diese Korrektur verhindert beschädigte JSON-Dateien. Sie ergänzt keine Personenrechte, fachliche
Konflikterkennung oder Aktualisierung der Zwischenspeicher getrennter Dienstinstanzen. Nach erneutem
Öffnen gilt der zuletzt vollständig gespeicherte Wert. Originaleinstellungen, Speicherort, Alttextbestand
und letzte Übernahmequittung sind vor/nach bytegleich; kein NAS-Lauf und keine Netzfreigabe.
Private Nachweise: `data/website/checks/multiuser-probes-20261031.json`, `-before-fix.json` und `-held-lock.json`
sowie `backup-settings-before-fix-20261031.log` und `backup-settings-after-fix-20261031-full.log`.
Eigene Fixtures und Prozesse sind beendet. Konten/Geräte, tatsächliche Netzwerkunterbrechung und ein
vereinbartes Abgleichmodell bleiben spätere praktische Abnahmen; SQLite-Schreibbetrieb auf SMB/NAS ist nicht bewiesen.

## Grundentscheidung

```text
GitHub main
  = zentrale Wahrheit fuer versionierte Projektdateien

Lokaler Projektordner je PC
  = aktive Arbeitskopie und einzige Stelle, an der die App Dateien bearbeitet

GitHub app-lock Branch
  = technischer Bearbeitungsstatus

NAS
  = komprimierte Restore-Backups, nicht aktive Arbeitskopie
```

Der lokale Projektordner ist pfadunabhaengig. PC 1 verwendet `D:\Arten-Explorer`, PC 2 kann einen anderen
Pfad nutzen. Alle App-Funktionen muessen relativ zum jeweiligen Repo-Root arbeiten.

## 1. Mehr-PC-Arbeitsmodell

Bearbeitet wird nie direkt "auf Git" und nie direkt auf dem NAS. Die App schreibt lokale Projektdateien, danach wird
automatisch committed und nach GitHub gepusht.

Normaler Ablauf:

1. App startet im lokalen Projektordner.
2. App prueft den GitHub-Stand.
3. Wenn GitHub neuer und lokal sauber ist, aktualisiert die App automatisch.
4. Bearbeitungsmodus ist nur erlaubt, wenn:
   - lokaler Stand aktuell ist
   - kein anderer aktiver Lock existiert
   - keine ungeklaerten lokalen Aenderungen vorliegen
5. Speichern, Pipeline, Assetpflege und Portraitpflege schreiben lokal.
6. Die App committed und pusht die Aenderungen.
7. Andere Rechner aktualisieren automatisch oder bleiben im Lesemodus, bis der Stand geklaert ist.

## 2. NAS-Rolle

Startvariante:

```text
NAS = Backup-Ziel
```

Regeln:

- Backup als ZIP
- drei vollständig geprüfte Wiederherstellungsstände: zwei jüngere plus ein älterer geschützter Kontrollstand
- Kontrollstand nicht bei häufigen neuen Sicherungen verdrängen; Wechsel nur mit geprüftem Ersatz
- Altarchive ohne heutigen Vollständigkeits-/Prüfnachweis bleiben zusätzlich geschützt und zählen nicht als geprüfte Stände;
  eine gesonderte Bereinigung braucht konkrete Freigabe
- taeglich bei Aenderungen
- mindestens einmal woechentlich bei Aenderungen
- kein neues Backup, wenn sich seit dem letzten Backup nichts geaendert hat
- Backup ist ablehnbar
- Standard-Zielpfad: `W:\Website Datenbank Backup`
- der Pfad ist in der App ueber `Backup-Pfad einstellen` lokal aenderbar
- die lokale Einstellung liegt in `species-explorer/local-settings.json` und wird nicht committed
- technisch bleibt der Pfad per Parameter oder Umgebungsvariable `IUCN_NAS_BACKUP_DIR` ueberschreibbar

Die Drei-Stände-Regel meint brauchbare, zeitlich versetzte Wiederherstellungspunkte. Sie verlangt keine
identischen großen Kopien allein zum Erreichen der Anzahl. Ein fehlender moderner Inhaltsnachweis
belegt keine Unbrauchbarkeit eines alten Archivs; historische Wiederherstellbarkeit und vollständige
Abdeckung des heutigen Datenbestands sind getrennt zu prüfen. Mehrere Generationen auf demselben NAS
ersetzen keinen unabhängigen Rückweg bei Verlust des NAS. Konkrete Bestandsnachweise und Felix' Frage
zur notwendigen Anzahl stehen ausschließlich im [laufenden Audit](audit-auftrag-phase-10-5.md).

Die App soll nach relevanten Aenderungen oder beim Schliessen vorschlagen:

```text
Projektstand auf NAS sichern?
[Jetzt sichern] [Spaeter] [Heute nicht mehr fragen]
```

## 3. Bearbeitungs-Lock

Der Lock liegt nicht in `main`, sondern in einem separaten GitHub-Branch:

```text
Branch: app-lock
Datei: edit-lock.json
```

Beispiel:

```json
{
  "version": 1,
  "holder": "FELIX-PC",
  "user": "Felix",
  "repoPath": "D:\\IUCN_Datenbank",
  "sessionId": "8f5f2f30-4b2e-4b59-9f47-000000000000",
  "repoHead": "3880eea33a7664f0c17967eeb5a63dd4b91b5120",
  "acquiredAt": "2026-06-28T10:00:00.000Z",
  "lastHeartbeatAt": "2026-06-28T10:03:00.000Z",
  "expiresAt": "2026-06-28T10:08:00.000Z"
}
```

Regeln:

- Lock wird beim Wechsel in den Bearbeitungsmodus gesetzt.
- Heartbeat verlaengert den Lock regelmaessig.
- Beim Wechsel zurueck in den Lesemodus oder beim Schliessen wird der Lock geloescht.
- Wenn die App abstuerzt, laeuft der Lock automatisch ab.
- Ein fremder aktiver Lock blockiert den Bearbeitungsmodus und zeigt Rechner/User/Alter an.

## 4. Automatische Aktualisierung

Die App soll keine Kommandozeile verlangen. Beim Start und beim Wechsel in den Bearbeitungsmodus wird der Projektstand
geprueft.

Sichere automatische Faelle:

| Zustand | App-Verhalten |
| --- | --- |
| Lokal sauber, GitHub neuer | automatisch `git fetch` und `git pull --ff-only`, danach App neu laden |
| Lokal aktuell | Bearbeitungsmodus erlauben, wenn Lock frei |
| Lokaler Commit noch nicht gepusht | Push anbieten und nach Bestaetigung automatisch ausfuehren |

Nicht automatisch ueberschreiben:

| Zustand | App-Verhalten |
| --- | --- |
| Lokale uncommitted Aenderungen | Loesungsauswahl in der App anzeigen |
| Lokaler und GitHub-Stand divergieren | Loesungsauswahl in der App anzeigen, kein automatischer Merge |

Loesungsvorschlaege fuer unklare Faelle:

```text
[Aenderungen veroeffentlichen]
[Lokalen Stand sichern und GitHub-Stand uebernehmen]
[Nur Lesemodus]
```

Fortschritt wird als Prozessschritte angezeigt:

```text
10% Pruefe lokalen Stand
30% Hole GitHub-Stand
60% Aktualisiere Projektdateien
85% Pruefe Datenmodell
100% Aktualisierung abgeschlossen
```

Wenn Git echte Prozentwerte ausgibt, koennen sie zusaetzlich angezeigt werden.

## 5. Vollstaendiges NAS-Restore-Backup

Das NAS-Backup soll im Fehlerfall sofort nutzbar sein. Es soll deshalb deutlich mehr enthalten als GitHub.

In das ZIP gehoeren:

- versionierte Projektdateien
- `.git`
- `species-assets/`
- `species-explorer/backups/`
- gemeinsamer konfigurierter Datenordner (neuer Standard `data`, bisherige `Daten`-Installationen weiterhin unterstützt)
  mit Taxonomie, Master, Lightroom-Paket, eigenen Entscheidungen,
  Nutzungsständen und benötigten Herkunfts-/Auftragsbelegen sowie `storage-path.json`
- `local-tools/ffmpeg/`
- `node_modules/`
- lokale Startgrundlagen
- `package.json`
- `package-lock.json`
- `restore-start.cmd`
- `backup-manifest.json`

Nicht in das ZIP gehoeren:

- `Testlauf/`
- `species-explorer/staging/`
- `species-explorer/pipeline-asset-backups/`
- alte Logs ausserhalb einer spaeteren Retention-Regel
- Secrets/Tokens aus `.env`, `.env.*` in jedem Unterordner oder Betriebssystem-Umgebungsvariablen

Vorhandene alte ZIP-Dateien sind kein Nachweis, dass der heutige Datenordner gesichert ist. Ein Archiv ohne
vollständiges Inhaltsmanifest wird nicht still in die neue Prüffamilie übernommen. Eine zusätzliche aktuelle
Sicherung wird vollständig rückgelesen; ein erfolgreicher ZIP-Schreibvorgang allein genügt nicht.

Beispiel-Dateiname:

```text
IUCN_Datenbank_2026-06-28_094512_3880eea.zip
```

`backup-manifest.json` enthält im heutigen Vertrag zusätzlich Schema-Version 2, eindeutige Archiv-ID,
den gebundenen Git-/Arbeitsbaum-/lokalen Datenstand sowie das vollständige Datei-Verzeichnis mit relativen
Pfaden, Größen und SHA-256-Prüfwerten. Die folgenden historischen Grundfelder bleiben enthalten:

```json
{
  "createdAt": "2026-06-28T09:45:00.000+02:00",
  "sourcePath": "D:\\IUCN_Datenbank",
  "gitCommit": "3880eea33a7664f0c17967eeb5a63dd4b91b5120",
  "nodeVersion": "v24.12.0",
  "includesNodeModules": true,
  "includesFfmpeg": true,
  "speciesCount": 46
}
```

## Restore-Ablauf

Ziel: keine Kommandozeile.

Der Explorer bietet Backup-Erstellung, Pfadwahl, Status und unter `Backup und Einstellungen` die
lesende Übersicht `NAS-Archive ansehen`. Sie zeigt Datum, ZIP-Größe, enthaltenen Dateiumfang, Archivpfad
und die jeweilige Nachweisgrenze. Die Übersicht liest begrenzte ZIP-Verzeichnisse und Manifeste; vorhandene
SHA-256-Einträge sind keine heute ausgeführte Inhaltsprüfung. Historische Archive bleiben als solche erkennbar,
beschädigte oder verknüpfte Archive erscheinen mit Begründung. Unbekannter Umfang wird nicht als null Bytes
angezeigt. `GET /api/backup/archives` benötigt den erlaubten Browser-Lesekontext und führt keine Entpack-,
Restore- oder Startaktion aus.

Für den folgenden externen Ablauf das gewünschte Archiv nach Datum und gesichertem Umfang wählen.
Eine ältere ZIP-Datei ist nicht auf die Wiederherstellung
des letzten Stands beschränkt; ihre vollständige Integrität und historische Laufzeit bleiben zu prüfen.
In einen eigenen geeigneten Zielordner entpacken; den aktiven Programm-/Datenbestand nicht überschreiben.
Große Restorekopien benötigen vorher eine konkrete Platz-/Zeit- und Betriebsentscheidung.

1. ZIP vom NAS entpacken.
2. `restore-start.cmd` doppelklicken.
3. Das Bootstrap-Skript prüft mindestens Node.js 24 für den vollständigen Explorer-/Taxonomiebetrieb
   einschließlich `node:sqlite` und stoppt bei einer älteren oder nicht lesbaren Version.
4. Falls die Electron-Programmdatei fehlt, bietet es die Installation der gesperrten Abhängigkeiten
   mit `npm.cmd ci` an; Abbruch oder Installationsfehler startet die App nicht.
5. Es erzeugt die Desktop-Verknuepfung.
6. Es startet die App.

Wenn Node.js fehlt, zeigt das Skript eine klare Meldung. Node.js wird nicht automatisch installiert.

Diese Schritte beschreiben den heutigen Starter-Quellstand. Ein historisches Archiv enthält seinen
damaligen Starter; spätere Korrekturen sind nicht nachträglich enthalten. Vor einem historischen Restore
die benötigte Laufzeit und den Startweg ausdrücklich prüfen: Der heutige Taxonomiebetrieb benötigt
Node 24 auch dann, wenn ein alter Starter eine niedrigere Mindestversion zulässt. Das Sicherungsarchiv
selbst bleibt unverändert. Entpacken/Programmstart ist kein Ersatz für die vollständige Inhaltsprüfung.

## Umsetzungsetappen

1. Plan und Restore-Startgrundlage dokumentieren.
2. Projektstatus-/Git-Update-Pruefung im Server ergaenzen.
3. Update-Dialog mit Fortschritt in die App einbauen.
4. Bearbeitungs-Lock ueber `app-lock` Branch einbauen.
5. NAS-Backup-Konfiguration und ZIP-Erzeugung einbauen.
6. Geprüfte Backup-Rotation: zwei jüngere plus ein älterer geschützter Kontrollstand, insgesamt drei.
7. Backup-Pfad in der App lokal einstellbar machen.
8. Restore-Test dokumentieren.
9. Danach Installer/zweiter-PC-Komfort klaeren. Seit 4. Oktober gilt der gemeinsame konfigurierbare Datenpfad
   als ignorierter Explorer-Unterordner, nach dem ausgeführten Namenswechsel vom 27. Oktober `data`;
   bisherige `Daten`-Installationen bleiben unterstützt. AppData-Daten vollständig umgezogen.
   [Speicherplatz-/Migrations-/Integritäts-/Rückfallvertrag](storage-migration.md) bleibt auch für weitere
   Pfadwechsel verbindlich. Referenzen sind nicht versioniert oder in Pages, aber ausdrücklich Bestandteil
   des vollständigen NAS-Restorebackups. Ein externer Pfad darf keinen unvollständigen Backup-Erfolg vortäuschen.

## Noch offen vor Lock-/Update-Implementierung

- gewuenschter Anzeigename fuer den lokalen Rechner/User im Lock
- ob `species-explorer/logs/` spaeter teilweise in das ZIP soll oder per Retention klein gehalten wird

## Technischer Backup-Stand seit 2026-06-28

Der erste Backup-Kern ist als PowerShell-Skript vorhanden:

```bash
npm.cmd run backup:nas:dry-run
npm.cmd run backup:nas
```

Standardziel ist `W:\Website Datenbank Backup`. In der App kann der Zielpfad ueber
`Datenbank-Aktionen` -> `Backup-Pfad einstellen` pro Rechner geaendert werden. Diese Einstellung wird in
`species-explorer/local-settings.json` gespeichert und ist per `.gitignore` bewusst lokal. Zusaetzlich kann das Ziel
weiterhin direkt im Skript ueberschrieben werden:

```powershell
pwsh -NoProfile -NonInteractive -File scripts/nas-backup.ps1 -BackupRoot "W:\Website Datenbank Backup" -Progress
```

Dieser direkte Aufruf verwendet ein vorhandenes PowerShell 7 unter seinen geltenden Ausführungsregeln.
Aus dem Projektordner starten: Der Sicherungsquellpfad kommt aus dem Skriptpfad, die internen Git-Aufrufe
aus dem Arbeitsverzeichnis. Der vorhandene Windows-PowerShell-5.1-Weg bleibt technisch unterstützt;
die aktuelle Laufzeit muss die lokale Skriptausführung erlauben. Keine Ausführungsregel für eine Probe ändern.

Die Manifestprüfung erhält Datumswerte seit der Korrektur vom 28. Oktober als ISO-Wert unabhängig davon,
ob die Laufzeit JSON-Daten als Zeichenfolge oder `DateTime` zurückgibt. `sourceRecordsHash` bindet die
exakt gespeicherte Dateireihenfolge; erneutes laufzeit-/kulturabhängiges Sortieren wäre eine andere Prüfsumme.
Dateimenge, Pfadgrenzen, Einzelinhalte, erwartetes Manifest, Quellstand und Rotation werden weiterhin geprüft.
Die gezielten Gegenproben bestehen in 5.1 und 7 einschließlich nachträglich vertauschter Manifestzeilen;
der anschließend beauftragte vollständige NAS-Lauf vom 28. Oktober ist einschließlich Rücklese-,
Quell- und Aufbewahrungsprüfung erfolgreich. Dieser tatsächliche Betriebsnachweis und seine Grenzen stehen im
[Auditnachlauf](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

Das Skript:

- erstellt ZIP-Dateien mit Namen `IUCN_Datenbank_<Datum>_<UhrzeitMitSekunden>_<Commit>.zip`
- schreibt das vollständige `backup-manifest.json` in das ZIP
- nimmt `.git`, `node_modules`, `local-tools/ffmpeg`, Assets und Projektdateien auf
- schließt `temp`, Plug-in-Temp, `Testlauf`, `species-explorer/staging`,
  `species-explorer/pipeline-asset-backups`, `species-explorer/logs` und `.env`/`.env.*` aus
- ueberspringt ein Backup, wenn letzter Backup-Manifest-Stand und aktueller Git-/Arbeitsbaum-Status identisch sind
- veröffentlicht den endgültigen Archivnamen erst nach vollständiger Rücklese-/Inhaltsprüfung und
  erfolgreicher erneuter Prüfung des gebundenen Quellstands; vorher nur eigene unvollständige Arbeitsdatei
- rotiert ausschließlich erkannte vollständig geprüfte Archive nach der Drei-Stände-Regel; ein defektes,
  unbekanntes oder altes unzureichend belegtes Archiv bleibt zusätzlich geschützt
- prüft die gebundene Rotation samt weiterhin benötigten Archiven unmittelbar vor der Entfernung;
  neuer/ausgetauschter Inhalt stoppt die Entfernung statt den alten Plan blind anzuwenden
- bietet mit `-DryRun` eine Vorschau ohne Schreiben oder Loeschen
- bietet mit `-Progress` maschinenlesbare Fortschrittszeilen fuer die App

Die App-UI ist als manuelle Wartungsaktion im Datenbank-Dialog eingebunden:

- Dialog `Datenbank-Aktionen` mit getrennten Gruppen fuer Aktualisieren, Backup/Einstellungen und Wartung
- Button `NAS-Backup erstellen`
- Button `Backup-Pfad einstellen` fuer den lokalen NAS-Zielpfad mit Reset auf den Standard
- Vorschau prueft Zielpfad, Dateianzahl, Rohdatenmenge, geplanten ZIP-Namen und Rotation
- bei unveraendertem Stand kann ein Backup manuell trotzdem erzwungen werden
- waehrend des Laufs zeigt die App Status, Prozent, Prozessausgabe und Abschlussmeldung
- der Desktop-Schliessschutz warnt bei laufendem NAS-Backup wie bei Pipeline-Laeufen

Eine vorübergehend fehlgeschlagene Statusabfrage beendet die Anzeige nicht dauerhaft. Vier begrenzte
lesende Wiederholungen folgen nach 1, 2, 4 und 8 Sekunden; der letzte bestätigte Stand bleibt sichtbar
als aktuell nicht bestätigt gekennzeichnet. Danach endet die automatische Fehlerfolge. Statusfenster
oder Fehlerhinweis erneut öffnen liest frisch; bei Fehlern beider Dienste werden beide erneut geprüft.
Die Abfragen bleiben pro Dienst einzeln gebunden und verändern keine fremde Startvorschau. Start-/
Schreibaufträge und fehlgeschlagene Abschlussansichten werden dadurch nicht automatisch wiederholt.
Antwortet eine einzelne Statusabfrage 15 Sekunden lang nicht, wird nur diese lesende Anfrage abgebrochen.
Der letzte bestätigte Stand und der gespeicherte Auftrag bleiben erhalten. Danach gilt derselbe begrenzte
Backoff; ein Auftrag wird dadurch weder beendet noch erneut gestartet. Verspätete Antworten dürfen keine
neuere Anzeige überschreiben und keine geschlossenen Dialoge wieder öffnen.

Erster produktiver Testlauf:

- Ziel: `W:\Website Datenbank Backup`
- Datei: `IUCN_Datenbank_2026-06-28_1118_07b5c8a84ab2.zip`
- Ergebnis: erfolgreich, 1022 Dateien, ca. 784 MB ZIP, keine Rotation geloescht

## Lokale Bearbeitungssicherungen

Bestätigte Regel seit 7. Oktober: je fünf reguläre Artenlisten- und Taxonomie-Bearbeitungsstände global
pro Klasse, nicht fünf pro Art. Für Medien bleibt regulär ein Rücknahmestand je Art und Medientyp.
Es gibt kein globales Medienbudget mehr, das den einzigen Rücknahmestand einer anderen Art verdrängen kann.
Offene Artanlagen und Medienprüfungen schützen zusätzliche notwendige Rücknahmedateien. Unlesbare
Auftrags-/Reviewdaten stoppen die Rotation; eine begonnene Veröffentlichung ist kein Abschlussnachweis.
Neue Mediensicherungen erst bytegeprüft übernehmen; ein fehlgeschlagener Austausch erhält den Vorgänger.

Der lokale Rücknahmestand ersetzt keine unabhängige Sicherung gegen Laufwerksverlust. Konkrete
Vor-Audit-Entscheidungen, Inventar-/Bereinigungsbefunde und Ausführungsnachweise stehen ausschließlich im
[Gesamtauditauftrag](audit-auftrag-phase-10-5.md); dieses Dokument beschreibt den allgemeinen Betriebsvertrag.
